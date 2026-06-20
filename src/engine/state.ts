import type {
  DoubleProgressionParams,
  ProgressionModelType,
  ProgressionParams,
  ProgressionState,
} from "../db/types";
import type { ProgressionOutcome } from "./evaluation";
import { REGRESSION_RESET_TRIGGER, RESET_DROP } from "./constants";

// ----------------------------------------------
// Progression state transitions. These pure functions are what actually MOVE the
// c1RM. Everything is immutable (new objects, never in-place) and deterministic —
// `now` and `workoutId` are injected so there is no hidden clock.
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
