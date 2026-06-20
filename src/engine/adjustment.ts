import type { RpeMatrix } from "../db/types";
import { PRESCRIBED_WEIGHT_TOLERANCE_KG } from "./constants";
import { impliedE1rm, roundToLoadable, weightFromE1rm } from "./matrix";

// ----------------------------------------------
// In-session re-prescription. When a logged set comes in HARDER than its target,
// the demonstrated effort implies the planned weight is too heavy today; this
// re-anchors the remaining set DOWN to the weight that should hit the target reps
// at the target RPE. A fatigue-safety adjustment, not a load-chaser — it never
// proposes going UP off a comfortable set.
//
// Pipeline stage: execution → in-session re-prescription. The tracker applies the
// proposal by rewriting the pending set's target (no new data structure); the set
// that triggered this was logged at its ORIGINAL target and still drives the
// post-workout worst-set evaluation, so a re-prescription can't mask a regression.
//
// Importantly this NEVER touches the c1RM — it is a today-only guardrail.
// ----------------------------------------------

export interface SetAdjustment {
  reps: number;
  weight: number;
  rpe: number | null;
}

export function proposeSetAdjustment(
  matrix: RpeMatrix,
  prev: { weight: number; reps: number; rpe: number },
  target: { reps: number; rpe: number | null; weight: number | null },
): SetAdjustment | null {
  // No anchor to compare against (cold-start or free-entry target).
  if (target.weight == null || target.rpe == null) return null;
  // Defensive: the tracker pre-guards, but never trust raw inputs.
  if (!(prev.reps >= 1) || !(prev.weight > 0) || Number.isNaN(prev.rpe)) {
    return null;
  }
  // Only adjust DOWN when the previous set was harder than the target effort.
  if (prev.rpe <= target.rpe) return null;

  const demoE1rm = impliedE1rm(matrix, prev.weight, prev.reps, prev.rpe);
  const newWeight = roundToLoadable(
    weightFromE1rm(matrix, demoE1rm, target.reps, target.rpe),
  );

  // Surface nothing if the proposal doesn't meaningfully differ from the target.
  if (Math.abs(newWeight - target.weight) <= PRESCRIBED_WEIGHT_TOLERANCE_KG) {
    return null;
  }
  return { reps: target.reps, weight: newWeight, rpe: target.rpe };
}
