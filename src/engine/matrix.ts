import type { RpeMatrix, Set as LoggedSet } from "../db/types";
import {
  RPE_MIN,
  RPE_MAX,
  LOOKUP_REPS_MIN,
  LOOKUP_REPS_MAX,
  QUALIFYING_MIN_RPE,
  QUALIFYING_MAX_REPS,
  MATRIX_SMOOTHING_KERNEL,
  LOADABLE_INCREMENT_KG,
} from "./config";

// ----------------------------------------------
// RPE matrix + e1RM subsystem: pure lookup and derivation against a FIXED table.
// The matrix is never learned/mutated by the engine; a per-exercise override is
// user-authored only (setMatrixCell, via the matrix editor). Persistence-free so
// it can be tested in isolation.
// ----------------------------------------------

/** Clamp an RPE into the matrix grid and snap it to the 0.5 step. */
export function snapRpe(rpe: number): number {
  const clamped = Math.min(RPE_MAX, Math.max(RPE_MIN, rpe));
  return Math.round(clamped * 2) / 2;
}

/** Clamp a rep count to the rows the matrix actually has (1–10). */
export function clampLookupReps(reps: number): number {
  return Math.min(LOOKUP_REPS_MAX, Math.max(LOOKUP_REPS_MIN, Math.round(reps)));
}

/** Percentage of e1RM the matrix assigns to (reps, rpe), grid-clamped. */
export function matrixPct(
  matrix: RpeMatrix,
  reps: number,
  rpe: number,
): number {
  return matrix[clampLookupReps(reps)][snapRpe(rpe)];
}

/** The e1RM a set implies, given the matrix's current calibration. */
export function impliedE1rm(
  matrix: RpeMatrix,
  weight: number,
  reps: number,
  rpe: number,
): number {
  return weight / matrixPct(matrix, reps, rpe);
}

/** Matrix-derived weight for an e1RM at (reps, rpe), rounded to 0.1. */
export function weightFromE1rm(
  matrix: RpeMatrix,
  e1rm: number,
  reps: number,
  rpe: number,
): number {
  return Math.round(e1rm * matrixPct(matrix, reps, rpe) * 10) / 10;
}

/** Round a weight to what can physically be put on the bar. */
export function roundToLoadable(
  weight: number,
  increment: number = LOADABLE_INCREMENT_KG,
): number {
  return Math.round(weight / increment) * increment;
}

/**
 * Whether a set is an honest, near-limit set trusted to estimate demonstrated
 * capacity. Applies to every set — top set or back-off alike.
 */
export function isQualifyingSet(set: LoggedSet): boolean {
  return (
    (set.actualRpe ?? 0) >= QUALIFYING_MIN_RPE &&
    set.actualReps >= 1 &&
    set.actualReps <= QUALIFYING_MAX_REPS &&
    set.actualWeight > 0
  );
}

export interface PeakE1rm {
  e1rm: number;
  set: LoggedSet;
}

/**
 * Peak implied e1RM across a set list, considering only honest near-limit
 * (qualifying) sets — the single number that best represents the capacity a
 * session demonstrated. null when no set qualifies.
 */
export function peakImpliedE1rm(
  matrix: RpeMatrix,
  sets: LoggedSet[],
): PeakE1rm | null {
  let best: PeakE1rm | null = null;
  for (const set of sets) {
    if (!isQualifyingSet(set)) continue;
    const e1rm = impliedE1rm(
      matrix,
      set.actualWeight,
      set.actualReps,
      set.actualRpe!,
    );
    if (!best || e1rm > best.e1rm) best = { e1rm, set };
  }
  return best;
}

const cloneMatrix = (matrix: RpeMatrix): RpeMatrix => {
  const out: RpeMatrix = {};
  for (const reps of Object.keys(matrix)) {
    out[Number(reps)] = { ...matrix[Number(reps)] };
  }
  return out;
};

/** Bleed a kernel-weighted fraction of a cell's delta into its ±1.0 RPE row neighbors. */
const smoothNeighbors = (
  matrix: RpeMatrix,
  reps: number,
  rpe: number,
  delta: number,
): void => {
  for (const { offset, factor } of MATRIX_SMOOTHING_KERNEL) {
    for (const direction of [-1, 1]) {
      const neighborRpe = rpe + direction * offset;
      if (neighborRpe >= RPE_MIN && neighborRpe <= RPE_MAX) {
        matrix[reps][neighborRpe] += delta * factor;
      }
    }
  }
};

/**
 * Direct (user-edit) cell write with the same neighbor smoothing the
 * post-session learning applies: the edited cell takes exactly the given
 * value, and the cells within ±1.0 RPE absorb a kernel-weighted fraction of
 * the change — so a manual edit bends the curve locally instead of leaving a
 * step in it. Pure: returns a fresh matrix.
 */
export function setMatrixCell(
  matrix: RpeMatrix,
  reps: number,
  rpe: number,
  value: number,
): RpeMatrix {
  const next = cloneMatrix(matrix);
  const row = clampLookupReps(reps);
  const col = snapRpe(rpe);
  const delta = value - next[row][col];
  next[row][col] = value;
  smoothNeighbors(next, row, col, delta);
  return next;
}
