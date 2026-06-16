import type {
  DoubleProgressionParams,
  ProgressionState,
  Set as LoggedSet,
} from "../db/types";
import { DEFAULT_TARGET_RPE } from "./config";

// ----------------------------------------------
// Progression models: pure per-session OUTCOME evaluation. These decide
// success/failure (and double's rep-cursor advance) from logged sets; the fold
// reducer (engine/fold.ts) owns every state transition that follows.
// ----------------------------------------------

export type SessionOutcome = "success" | "failure";

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * A set is a failure only when all three conditions hold simultaneously:
 * reps short of target, RPE over target, and the prescribed weight was used.
 * A weight deviation of ±2.5 kg (one loadable increment) means the lifter
 * intentionally adjusted the load — that set is excluded from failure scoring.
 */
function setFailed(s: LoggedSet): boolean {
  const targetRpe = s.targetRpe ?? DEFAULT_TARGET_RPE;
  return (
    s.actualReps < s.targetReps &&
    s.actualRpe !== undefined &&
    s.actualRpe > targetRpe &&
    Math.abs(s.actualWeight - s.targetWeight) < 1e-9
  );
}

/**
 * Linear progression: failure if ANY set at the prescribed weight missed reps
 * AND ran over the target RPE. Everything else is success.
 */
export function evaluateLinear(sets: LoggedSet[]): SessionOutcome {
  if (!sets.length) return "success";
  return sets.some(setFailed) ? "failure" : "success";
}

/**
 * Top set + back-off: only the TOP SET drives evaluation — the prescription
 * emits it first and the tracker preserves set order, so it is the first
 * logged set. Back-off sets are never evaluated here.
 */
export function evaluateTopSet(sets: LoggedSet[]): SessionOutcome {
  const top = sets[0];
  if (!top) return "success";
  return setFailed(top) ? "failure" : "success";
}

export interface DoubleEvaluation {
  weightProgressed: boolean;
  nextTargetReps: number;
  outcome: SessionOutcome;
}

export function evaluateDouble(
  params: DoubleProgressionParams,
  state: ProgressionState,
  sets: LoggedSet[],
): DoubleEvaluation {
  const current = state.currentTargetReps ?? params.minReps;
  if (!sets.length) {
    return {
      weightProgressed: false,
      nextTargetReps: current,
      outcome: "success",
    };
  }

  const weightProgressed = sets.every((s) => s.actualReps >= params.maxReps);
  const worstSetReps = Math.min(...sets.map((s) => s.actualReps));
  // The next rep goal advances toward maxReps anchored to the worst set
  // (weakest-set + 1), but never moves backwards — a bad day lowers nothing.
  const nextTargetReps = weightProgressed
    ? params.minReps
    : clamp(
        Math.max(current, worstSetReps + 1),
        params.minReps,
        params.maxReps,
      );

  const outcome = sets.some(setFailed) ? "failure" : "success";
  return { weightProgressed, nextTargetReps, outcome };
}
