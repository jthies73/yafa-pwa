import type {
  DoubleProgressionParams,
  ProgressionModelType,
  ProgressionParams,
  ProgressionState,
  RpeMatrix,
  Set as LoggedSet,
} from "../db/types";
import type { ProgressionOutcome } from "./evaluation";
import {
  CATCHUP_CLOSE_FRACTION,
  CATCHUP_THRESHOLD,
  REGRESSION_RESET_TRIGGER,
  RESET_DROP,
} from "./constants";
import { impliedE1rm, isQualifyingSet, peakImpliedE1rm } from "./matrix";

// ----------------------------------------------
// Progression state transitions. These pure functions are what actually MOVE the
// c1RM. Everything is immutable (new objects, never in-place) and deterministic —
// `now` and `workoutId` are injected so there is no hidden clock. The c1RM (and
// every set handed in here) lives in TOTAL-load space — the service lifts
// bodyweightFactor exercises' sets before calling (engine/bodyweight.ts).
//
// Pipeline stage: finish workout → step (advances c1RM from an outcome), and
// next prescription → consumeReset (applies a pending −10% drop).
//
// The reset is a two-phase contract:
//   1. step() only ARMS it: the 3rd consecutive regression sets resetPending. The
//      c1RM is NOT dropped here.
//   2. consumeReset() — called by the NEXT prescription — applies the −10% drop
//      and clears the flag + streak. This is why a regression session shows no
//      load change until the following workout.
// ----------------------------------------------

/** A blank state for an exercise that has never been trained. */
export function initState(exerciseId: string, now: number): ProgressionState {
  return {
    exerciseId,
    c1rm: null,
    regressionStreak: 0,
    resetPending: false,
    lastWorkoutId: null,
    updated_at: now,
  };
}

/** Seed the anchor from the first qualifying session. No-op once c1RM exists. */
export function seedC1rm(
  state: ProgressionState,
  e1rm: number,
  now: number,
): ProgressionState {
  if (state.c1rm != null) return state;
  return { ...state, c1rm: e1rm, updated_at: now };
}

/**
 * Raise the c1RM by the configured increment on a win. kg adds a flat amount;
 * percent adds a raw percent OF the current c1RM (`weightIncrement` of 2.5 means
 * +2.5%, hence ÷100) so successive percent gains compound. The c1RM is kept
 * UNROUNDED — only the rendered prescribed weight rounds (roundToLoadable).
 */
export function applyIncrement(
  c1rm: number,
  params: ProgressionParams,
): number {
  if (!("weightIncrement" in params) || !("incrementUnit" in params)) {
    return c1rm; // "none" has no increment
  }
  return params.incrementUnit === "percent"
    ? c1rm * (1 + params.weightIncrement / 100)
    : c1rm + params.weightIncrement;
}

/** Drop the c1RM by the fixed reset fraction (−10%). */
export function applyReset(c1rm: number): number {
  return c1rm * (1 - RESET_DROP);
}

/**
 * Consume a pending reset before prescribing: drop the c1RM (null-safe — a
 * cold-start exercise just clears the flag) and reset the streak. Idempotent —
 * a state without a pending reset is returned unchanged.
 */
export function consumeReset(
  state: ProgressionState,
  now: number,
): ProgressionState {
  if (!state.resetPending) return state;
  return {
    ...state,
    c1rm: state.c1rm == null ? null : applyReset(state.c1rm),
    regressionStreak: 0,
    resetPending: false,
    updated_at: now,
  };
}

/** Advance the double-progression rep cursor one rep toward maxReps. */
export function advanceDoubleCursor(
  cursor: number | undefined,
  params: DoubleProgressionParams,
): number {
  return Math.min((cursor ?? params.minReps) + 1, params.maxReps);
}

/**
 * Fold one session's outcome into the state. Does NOT consume resets (that is the
 * next prescription's job) — a regression here only arms the flag.
 *   • success    → increment c1RM; streak 0; clear pending; double cursor → minReps.
 *   • hold       → c1RM unchanged; streak 0; double cursor advances toward maxReps.
 *   • regression → c1RM unchanged; streak +1; arm reset at the 3rd in a row.
 */
export function step(
  state: ProgressionState,
  outcome: ProgressionOutcome,
  model: ProgressionModelType,
  params: ProgressionParams,
  workoutId: string,
  now: number,
): ProgressionState {
  const base = { ...state, lastWorkoutId: workoutId, updated_at: now };
  const isDouble = model === "double";
  const dbl = params as DoubleProgressionParams;

  switch (outcome) {
    case "success":
      return {
        ...base,
        c1rm:
          state.c1rm == null ? state.c1rm : applyIncrement(state.c1rm, params),
        regressionStreak: 0,
        resetPending: false,
        doubleRepCursor: isDouble ? dbl.minReps : state.doubleRepCursor,
      };
    case "hold":
      return {
        ...base,
        regressionStreak: 0,
        doubleRepCursor: isDouble
          ? advanceDoubleCursor(state.doubleRepCursor, dbl)
          : state.doubleRepCursor,
      };
    case "regression": {
      const regressionStreak = state.regressionStreak + 1;
      return {
        ...base,
        regressionStreak,
        resetPending:
          state.resetPending || regressionStreak >= REGRESSION_RESET_TRIGGER,
      };
    }
  }
}

// ----------------------------------------------
// c1RM catch-up. Evaluated every finish; when triggered it takes PRECEDENCE over the
// deterministic step above (the caller fully overrides the rule outcome — see
// service.applyWorkoutResults). The step stands only when catch-up does NOT fire.
// Two pieces:
//   1. corroboratedE1rm — demonstrated capacity from a SINGLE session's qualifying
//      sets. We trust honest sets over a smoothed average (a real divergence shouldn't
//      be damped away), but require ≥2 sets and drop the lone outlier so one mistyped
//      or fluke set can't move the anchor — in either direction.
//   2. catchUpC1rm — past a LARGE threshold, jumps most of the way toward that estimate
//      in one move. The caller applies it INSTEAD of the rule outcome, so the two never
//      collide in one session.
// ----------------------------------------------

/**
 * Demonstrated capacity from a SINGLE session's qualifying e1RMs (RPE ≥ 8, reps ≤ 10).
 * With ≥2 sets, drops the single most-extreme (a typo/fluke) and trusts the 2nd-furthest
 * from the anchor. With exactly 1 set (top-set programs), uses it directly — there is no
 * outlier to drop and the top set is the main event. Null only when no positive
 * observations exist.
 */
export function corroboratedE1rm(
  sessionE1rms: number[],
  anchor: number,
): number | null {
  const valid = sessionE1rms.filter((e) => e > 0);
  if (valid.length === 0) return null;
  const byDistance = [...valid].sort(
    (a, b) => Math.abs(b - anchor) - Math.abs(a - anchor),
  );
  return byDistance[Math.min(1, byDistance.length - 1)]; // when 1 set return it, when >=2 sets return the 2nd-furthest
}

/**
 * Catch the c1RM up to the demonstrated e1RM estimate. Returns the anchor UNCHANGED
 * unless the relative gap exceeds the (large) threshold; then it closes most of the
 * gap in one move (fast convergence, not a per-session nibble). Returning the input
 * unchanged is the caller's signal that catch-up did not fire. Kept UNROUNDED like
 * every other c1RM transition. Null/zero inputs pass the anchor through unchanged.
 */
export function catchUpC1rm(c1rm: number, estimate: number | null): number {
  if (estimate == null || c1rm <= 0) return c1rm;
  const gap = estimate - c1rm;
  if (Math.abs(gap) / c1rm <= CATCHUP_THRESHOLD) return c1rm;
  return c1rm + gap * CATCHUP_CLOSE_FRACTION;
}

/**
 * The best e1RM to anchor calculations to MID-session, given the sets logged so
 * far for an exercise. Same logic the engine applies at finish, surfaced live:
 *   • No persisted c1RM yet → seed from the session's best set (strict qualifying,
 *     then any usable set) so a brand-new exercise still calculates.
 *   • A c1RM exists → it wins, UNLESS this session's qualifying sets diverge past
 *     the catch-up threshold, in which case return the caught-up value (what the
 *     finish-time fold would persist). Within the threshold the anchor is returned
 *     unchanged. Pure — no DB, no clock.
 */
export function liveEffectiveE1rm(
  matrix: RpeMatrix,
  sessionSets: LoggedSet[],
  currentC1rm: number | null,
): number | null {
  if (currentC1rm == null) {
    return (
      peakImpliedE1rm(matrix, sessionSets)?.e1rm ??
      peakImpliedE1rm(matrix, sessionSets, true)?.e1rm ??
      null
    );
  }
  const sessionE1rms = sessionSets
    .filter(isQualifyingSet)
    .map((s) =>
      impliedE1rm(matrix, s.actualWeight, s.actualReps, s.actualRpe!),
    );
  return catchUpC1rm(currentC1rm, corroboratedE1rm(sessionE1rms, currentC1rm));
}
