import type { RpeMatrix } from "../db/types";
import {
  MATRIX_MAX_REPS,
  MATRIX_MIN_REPS,
  MATRIX_MAX_RPE,
  MATRIX_MIN_RPE,
  RPE_STEP,
} from "./constants";
import { matrixPct, roundToLoadable } from "./matrix";

// ----------------------------------------------
// Manual calculator solvers. Given an e1RM anchor and two of the three knobs
// (reps, weight, RPE), solve the third. Pure matrix math; all weights in kg.
//
// Pipeline stage: standalone tool (WorkoutCalculatorPanel) — not part of the
// progression loop, but reuses the same matrix so a calculated load matches what
// the engine would prescribe.
// ----------------------------------------------

/** Weight (kg) for a given e1RM, rep count, and RPE — rounded to a loadable bar. */
export function solveWeight(
  matrix: RpeMatrix,
  e1rm: number,
  reps: number,
  rpe: number,
): number {
  if (e1rm <= 0) return 0;
  return roundToLoadable(e1rm * matrixPct(matrix, reps, rpe));
}

/**
 * The integer rep count whose matrix load (at the given RPE) best matches the
 * observed total weight. Searches the matrix domain (1–15 reps) and returns the
 * closest fit, clamped to that domain.
 */
export function solveReps(
  matrix: RpeMatrix,
  e1rm: number,
  totalWeight: number,
  rpe: number,
): number {
  if (e1rm <= 0) return 0;
  let bestReps = MATRIX_MIN_REPS;
  let bestDiff = Infinity;
  for (let reps = MATRIX_MIN_REPS; reps <= MATRIX_MAX_REPS; reps++) {
    const diff = Math.abs(e1rm * matrixPct(matrix, reps, rpe) - totalWeight);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestReps = reps;
    }
  }
  return bestReps;
}

/**
 * The RPE (snapped to the 0.5 grid the panel offers) whose matrix load at the
 * given rep count best matches the observed total weight. Clamped to 6–10.
 */
export function solveRpe(
  matrix: RpeMatrix,
  e1rm: number,
  totalWeight: number,
  reps: number,
): number {
  if (e1rm <= 0) return 0;
  let bestRpe = MATRIX_MIN_RPE;
  let bestDiff = Infinity;
  for (let rpe = MATRIX_MIN_RPE; rpe <= MATRIX_MAX_RPE; rpe += RPE_STEP) {
    const diff = Math.abs(e1rm * matrixPct(matrix, reps, rpe) - totalWeight);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestRpe = rpe;
    }
  }
  return bestRpe;
}
