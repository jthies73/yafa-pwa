import type { RpeMatrix } from "../db/types";
import { matrixPct, weightFromE1rm } from "./matrix";
import { RPE_MIN, RPE_MAX, LOOKUP_REPS_MIN, LOOKUP_REPS_MAX } from "./config";

// Pure solvers — all weights in total-system-load kg frame (added weight + bodyweight contribution).

/** Weight (kg) for a given e1RM, rep count, and RPE. */
export function solveWeight(
  matrix: RpeMatrix,
  e1rm: number,
  reps: number,
  rpe: number,
): number {
  return weightFromE1rm(matrix, e1rm, reps, rpe);
}

/**
 * Rep count (1–10) that best fits the observed total load at the given RPE.
 * Ties resolve to the lower rep count.
 */
export function solveReps(
  matrix: RpeMatrix,
  e1rm: number,
  totalWeight: number,
  rpe: number,
): number {
  const target = totalWeight / e1rm;
  let best = LOOKUP_REPS_MIN;
  let bestDiff = Infinity;
  for (let r = LOOKUP_REPS_MIN; r <= LOOKUP_REPS_MAX; r++) {
    const diff = Math.abs(matrixPct(matrix, r, rpe) - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = r;
    }
  }
  return best;
}

/**
 * RPE (6–10 in 0.5 steps) that best fits the observed total load at the given rep count.
 * Ties resolve to the lower RPE.
 */
export function solveRpe(
  matrix: RpeMatrix,
  e1rm: number,
  totalWeight: number,
  reps: number,
): number {
  const target = totalWeight / e1rm;
  let best = RPE_MIN;
  let bestDiff = Infinity;
  for (let i = RPE_MIN * 2; i <= RPE_MAX * 2; i++) {
    const rpe = i / 2;
    const diff = Math.abs(matrixPct(matrix, reps, rpe) - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = rpe;
    }
  }
  return best;
}
