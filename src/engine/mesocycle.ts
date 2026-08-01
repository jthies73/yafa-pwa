import type {
  DoubleProgressionParams,
  LinearProgressionParams,
  MesocycleWeek,
  NoneProgressionParams,
  PeriodizationFocus,
  Plan,
  ProgressionModelType,
  ProgressionParams,
  RoutineExerciseConfig,
  TopSetProgressionParams,
} from "../db/types";
import { LOCKABLE_FIELDS } from "../config/periodization";
import {
  normalizeProgressionParams,
  rpeCeilingOf,
} from "../config/progression";
import { MESO_REP_DELTA, MESO_RPE_DELTA, WEEK_MS } from "./constants";
import { snapRpe } from "./matrix";

// ----------------------------------------------
// Mesocycle. Owns both halves of "which week is it, and what does that week
// mean": the calendar math that locates `at` within the plan's repeating cycle,
// and the modifiers the resulting focus (hypertrophy/strength/peaking/deload)
// imposes on an exercise's TARGETS — never a direct load multiplier. The load
// always re-renders downstream from the shifted targets via matrixPct × c1RM, so
// "more intensity" means a higher targetRpe / fewer reps. Working-set counts are
// deliberately NOT periodized — volume stays as the user configured it.
//
// Pipeline stage: mesocycle config → feeds prescription. Locks are honoured:
// a field the user locked, or a field this model never periodizes, is left as-is.
//
// Everything here is pure and clock-free (`at` is always injected), so a UI can
// live-preview an unsaved boundary convention without touching the database.
// ----------------------------------------------

// ---- Week boundaries ----

/** The most recent Monday 00:00 local time on or before the given timestamp. */
export function mostRecentMonday(ts: number): number {
  const monday = new Date(ts);
  // Sunday (0) is the 7th day of the week here, so it walks back 6 days.
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return monday.getTime();
}

/** Fraction (0..1) of the way from `weekStartTs` through its 7-day week. */
const progressThroughWeek = (weekStartTs: number, at: number): number =>
  Math.min(1, Math.max(0, (at - weekStartTs) / WEEK_MS));

/**
 * The start of the current week for a repeating 7-day cycle anchored at
 * `anchor` (Monday-snapped if `alignToMonday`), evaluated at `at`.
 */
function currentWeekStart(
  anchor: number,
  alignToMonday: boolean,
  at: number,
): { weekStartTs: number; elapsedWeeks: number } {
  const anchorTs = alignToMonday ? mostRecentMonday(anchor) : anchor;
  const elapsedWeeks = Math.max(0, Math.floor((at - anchorTs) / WEEK_MS));
  return { weekStartTs: anchorTs + elapsedWeeks * WEEK_MS, elapsedWeeks };
}

/**
 * The boundary (timestamp + absolute week index) mesocycle weeks are measured
 * from at time `at` — the plan's creation time, or the override's anchor
 * (Monday-aligned or the exact rolling setAt) once it has taken effect.
 */
export function weekBoundary(
  plan: Plan,
  at: number,
): { absWeek: number; weekStartTs: number } {
  const override = plan.mesocycleWeekOverride;
  const active = override && at >= override.setAt ? override : undefined;
  const { weekStartTs, elapsedWeeks } = currentWeekStart(
    active?.setAt ?? plan.created_at,
    active?.alignToMonday ?? false,
    at,
  );
  return { absWeek: (active?.weekIndex ?? 0) + elapsedWeeks, weekStartTs };
}

/** The 0-based week within the plan's repeating mesocycle at time `at`. */
export function absoluteWeekIndex(plan: Plan | undefined, at: number): number {
  return plan ? weekBoundary(plan, at).absWeek : 0;
}

/**
 * Fraction (0..1) through the mesocycle week containing `at`, for a boundary
 * anchored at `anchor` and optionally Monday-snapped. Takes the raw convention
 * rather than a `Plan` so a UI can preview how toggling Monday/Rolling would
 * land *before* it is saved.
 */
export function weekProgressAt(
  anchor: number,
  alignToMonday: boolean,
  at: number,
): number {
  return progressThroughWeek(
    currentWeekStart(anchor, alignToMonday, at).weekStartTs,
    at,
  );
}

/** Fraction through the week that a resolved `weekBoundary` already located. */
export const weekProgressFrom = progressThroughWeek;

export interface MesoModifiers {
  rpeDelta: number; // added to (top-set) targetRpe — intensity
  repDelta: number; // added to the rep target — negative trims reps
}

/** The target shifts for a week focus. Pulls from the tunable constants. */
export function focusModifiers(focus: PeriodizationFocus): MesoModifiers {
  return {
    rpeDelta: MESO_RPE_DELTA[focus],
    repDelta: MESO_REP_DELTA[focus],
  };
}

const NO_MODIFIERS: MesoModifiers = { rpeDelta: 0, repDelta: 0 };

/** The target shifts for the plan's current week; none when no mesocycle. */
export function modifiersAt(plan: Plan | undefined, at: number): MesoModifiers {
  const focus = weekFocus(plan?.mesocycle, absoluteWeekIndex(plan, at));
  return focus ? focusModifiers(focus) : NO_MODIFIERS;
}

/**
 * The focus governing a given week. Wraps past the mesocycle length (a repeating
 * cycle) and is negative-safe. Null when there is no mesocycle configured.
 */
export function weekFocus(
  mesocycle: MesocycleWeek[] | undefined,
  weekIndex: number,
): PeriodizationFocus | null {
  if (!mesocycle || mesocycle.length === 0) return null;
  const len = mesocycle.length;
  const i = ((weekIndex % len) + len) % len;
  return mesocycle[i].focus;
}

/** Whether periodization may touch `field` for this model given the user's locks. */
function isAdjustable(
  model: ProgressionModelType,
  field: string,
  lockedFields: string[],
): boolean {
  return (
    LOCKABLE_FIELDS[model].includes(field) && !lockedFields.includes(field)
  );
}

const clampReps = (n: number) => Math.max(1, Math.round(n));
const clampRpe = (n: number) => snapRpe(n); // snaps to 0.5 grid + clamps 6–10

/**
 * Apply a week's modifiers to an exercise's (already normalized) params, honoring
 * locks. Returns a NEW params object; the input is untouched. The resulting
 * targetRpe (or topSetTargetRpe) is the `effectiveTargetRpe` the prescription
 * uses for both load and the ceiling comparison.
 *
 * Only reps and RPE are periodized. Working-set counts are left as configured
 * (volume is not periodized), and double progression's rep range (minReps/maxReps)
 * is engine-owned (the rep cursor advances it), so only its targetRpe shifts.
 */
export function applyMesoToParams(
  model: ProgressionModelType,
  params: ProgressionParams,
  mods: MesoModifiers,
  lockedFields: string[] = [],
): ProgressionParams {
  const adj = (field: string) => isAdjustable(model, field, lockedFields);

  switch (model) {
    // Identical shifts — nothing in the domain makes plain linear progression
    // and an unprogressed exercise periodize differently.
    case "linear":
    case "none": {
      const p = {
        ...(params as LinearProgressionParams | NoneProgressionParams),
      };
      if (adj("targetReps"))
        p.targetReps = clampReps(p.targetReps + mods.repDelta);
      if (adj("targetRpe")) p.targetRpe = clampRpe(p.targetRpe + mods.rpeDelta);
      return p;
    }
    case "double": {
      const p = { ...(params as DoubleProgressionParams) };
      if (adj("targetRpe")) p.targetRpe = clampRpe(p.targetRpe + mods.rpeDelta);
      // minReps/maxReps deliberately left untouched (engine-owned rep cursor).
      return p;
    }
    case "topset_backoff": {
      const p = { ...(params as TopSetProgressionParams) };
      if (adj("topSetTargetReps"))
        p.topSetTargetReps = clampReps(p.topSetTargetReps + mods.repDelta);
      if (adj("topSetTargetRpe"))
        p.topSetTargetRpe = clampRpe(p.topSetTargetRpe + mods.rpeDelta);
      // backOffRpe is lockable but not a natural meso target — left untouched.
      // (The derived back-off reps still adapt: shifting topSetTargetRpe moves
      // the top set's %-of-1RM, hence the dropped load the reps are solved at.)
      return p;
    }
  }
}

/** An exercise's config resolved for one particular week. */
export interface EffectiveConfig {
  model: ProgressionModelType;
  params: ProgressionParams; // normalized + mesocycle-shifted
  ceiling: number; // raw guardrail — never periodized
}

/** Normalize a stored config and apply the week's modifiers, honoring locks. */
export function effectiveConfig(
  config: RoutineExerciseConfig | undefined,
  mods: MesoModifiers,
): EffectiveConfig {
  const model = config?.progressionModel ?? "none";
  const params = applyMesoToParams(
    model,
    normalizeProgressionParams(model, config?.progressionParams),
    mods,
    config?.lockedFields ?? [],
  );
  return { model, params, ceiling: rpeCeilingOf(model, params) };
}
