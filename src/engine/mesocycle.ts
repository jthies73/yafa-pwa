import type {
  DoubleProgressionParams,
  LinearProgressionParams,
  MesocycleWeek,
  NoneProgressionParams,
  PeriodizationFocus,
  ProgressionModelType,
  ProgressionParams,
  TopSetProgressionParams,
} from "../db/types";
import { LOCKABLE_FIELDS } from "../config/periodization";
import { MESO_REP_DELTA, MESO_RPE_DELTA } from "./constants";
import { snapRpe } from "./matrix";

// ----------------------------------------------
// Mesocycle modifiers. A plan's mesocycle gives each week a focus
// (hypertrophy/strength/peaking/deload); this module turns the active week's
// focus into shifts on an exercise's TARGETS — never a direct load multiplier.
// The load always re-renders downstream from the shifted targets via
// matrixPct × c1RM, so "more intensity" means a higher targetRpe / fewer reps.
// Working-set counts are deliberately NOT periodized — volume stays as the user
// configured it.
//
// Pipeline stage: mesocycle config → feeds prescription. Locks are honoured:
// a field the user locked, or a field this model never periodizes, is left as-is.
// ----------------------------------------------

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
    case "linear": {
      const p = { ...(params as LinearProgressionParams) };
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
      // backOffReps is lockable but not a natural meso target — left untouched.
      return p;
    }
    case "none": {
      const p = { ...(params as NoneProgressionParams) };
      if (adj("targetReps"))
        p.targetReps = clampReps(p.targetReps + mods.repDelta);
      if (adj("targetRpe")) p.targetRpe = clampRpe(p.targetRpe + mods.rpeDelta);
      return p;
    }
  }
}
