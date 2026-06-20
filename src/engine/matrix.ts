import type { RpeMatrix, Set as LoggedSet } from "../db/types";
import {
  LOADABLE_INCREMENT_KG,
  MATRIX_MAX_REPS,
  MATRIX_MIN_REPS,
  QUALIFYING_MAX_REPS,
  QUALIFYING_MIN_RPE,
  RPE_STEP,
} from "./constants";

// ----------------------------------------------
// RPE matrix + e1RM math. The matrix maps (reps, RPE) → percentage of 1RM as a
// decimal (0..1); see src/db/rpeMatrix.ts for the default RTS grid (reps 1–10,
// RPE 6–10 in 0.5 steps, monotone). Everything the engine does with weight goes
// through these helpers.
//
// Pipeline stage: math foundation — feeds prescription (load = pct × c1RM),
// evaluation/seeding (impliedE1rm), the manual calculator, and analytics.
//
// Two invariants worth stating up front:
//   • c1RM (the progression anchor) is abstract and kept UNROUNDED; only the
//     rendered prescribed weight is rounded (roundToLoadable). So matrix helpers
//     never round on their own — weightFromE1rm returns a raw weight and the
//     caller rounds after any ceiling cap.
//   • impliedE1rm here is the ANALYTICS e1RM; it never feeds prescription (which
//     uses c1RM). The two are deliberately separate values.
// ----------------------------------------------

/** Round half-up to the 0.5 RPE grid, then clamp to the matrix's RPE range. */
export function snapRpe(rpe: number): number {
  const snapped = Math.round(rpe / RPE_STEP) * RPE_STEP;
  // Clamp against the grid via the matrix isn't possible here (no matrix), so use
  // the canonical 6–10 bounds; matrixPct re-clamps to a row's actual keys anyway.
  return Math.min(10, Math.max(6, snapped));
}

/** Round to an integer rep count and clamp to the matrix rows (1–10). */
export function clampLookupReps(reps: number): number {
  return Math.min(MATRIX_MAX_REPS, Math.max(MATRIX_MIN_REPS, Math.round(reps)));
}

/** Sorted numeric keys of an object whose keys are numbers-as-strings. */
function numericKeys(obj: Record<number, number>): number[] {
  return Object.keys(obj)
    .map(Number)
    .sort((a, b) => a - b);
}

/**
 * Percentage of 1RM at (reps, rpe), as a decimal.
 *
 * Strategy: integer rep rows are looked up EXACTLY (reps are always integers in
 * prescription and logging, and the rows are user-editable, so interpolating
 * between rows would invent values nobody entered). Interpolation happens ONLY on
 * the RPE axis, linearly between the two bracketing columns. Off-grid RPE is
 * clamped to the row's own min/max column — we never extrapolate past the matrix
 * (an RPE above 10 or below 6 is not physically meaningful).
 */
export function matrixPct(
  matrix: RpeMatrix,
  reps: number,
  rpe: number,
): number {
  const r = clampLookupReps(reps);
  // Exact row, or the nearest present row (custom matrices may omit some rows).
  let row = matrix[r];
  if (!row) {
    const rows = Object.keys(matrix)
      .map(Number)
      .sort((a, b) => Math.abs(a - r) - Math.abs(b - r));
    if (rows.length === 0) {
      throw new Error("matrixPct: empty RPE matrix");
    }
    row = matrix[rows[0]];
  }

  const cols = numericKeys(row);
  const lo = cols[0];
  const hi = cols[cols.length - 1];
  const clampedRpe = Math.min(hi, Math.max(lo, rpe));

  // Exact column hit.
  if (row[clampedRpe] !== undefined) return row[clampedRpe];

  // Linear interpolation between the two bracketing RPE columns.
  let lower = lo;
  let upper = hi;
  for (const c of cols) {
    if (c <= clampedRpe) lower = c;
    if (c >= clampedRpe) {
      upper = c;
      break;
    }
  }
  if (upper === lower) return row[lower];
  const t = (clampedRpe - lower) / (upper - lower);
  return row[lower] + t * (row[upper] - row[lower]);
}

/**
 * The e1RM a (weight, reps, rpe) set implies: weight ÷ percentage. This is the
 * ANALYTICS e1RM (best honest set's estimated 1RM); it never feeds prescription.
 */
export function impliedE1rm(
  matrix: RpeMatrix,
  weight: number,
  reps: number,
  rpe: number,
): number {
  if (weight <= 0) return 0;
  const pct = matrixPct(matrix, reps, rpe);
  return pct > 0 ? weight / pct : 0;
}

/**
 * The weight a given e1RM (or c1RM) maps to at (reps, rpe): e1rm × percentage.
 * Returns the RAW unrounded weight — callers round (roundToLoadable) only AFTER
 * applying any ceiling cap, so the cap comparison stays on exact values.
 */
export function weightFromE1rm(
  matrix: RpeMatrix,
  e1rm: number,
  reps: number,
  rpe: number,
): number {
  return e1rm * matrixPct(matrix, reps, rpe);
}

/** Round a weight to the nearest loadable increment (LOADABLE_INCREMENT_KG = 0.1 kg by default). */
export function roundToLoadable(
  weight: number,
  increment: number = LOADABLE_INCREMENT_KG,
): number {
  if (increment <= 0) return weight;
  // toFixed(3) clears floating-point dust (e.g. 102.50000000000001).
  return Number((Math.round(weight / increment) * increment).toFixed(3));
}

/**
 * Whether a set is honest and near-limit enough to imply a usable e1RM: it must
 * carry an RPE ≥ 8 at ≤ 10 reps with real load. The shared gate for analytics'
 * e1RM chart and the cold-start c1RM seed. RPE is optional on a logged set, so a
 * set without one never qualifies.
 */
export function isQualifyingSet(set: LoggedSet): boolean {
  return (
    set.actualRpe != null &&
    set.actualRpe >= QUALIFYING_MIN_RPE &&
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
 * A relaxed gate used ONLY as a seeding fallback: an honest set with a real RPE,
 * reps and load but without the RPE ≥ 8 near-limit requirement. A sub-limit set
 * under-states true capacity, so seeding from it is conservative (the safe
 * direction) — and it lets a first session that never reached RPE 8 still anchor a
 * c1RM instead of staying anchorless.
 */
function isUsableSet(set: LoggedSet): boolean {
  return (
    set.actualRpe != null &&
    set.actualReps >= 1 &&
    set.actualReps <= QUALIFYING_MAX_REPS &&
    set.actualWeight > 0
  );
}

/**
 * The highest implied e1RM across a set list (peak, not mean — the best honest
 * set tracks capacity; averaging mixed-intent sets means nothing). Null when no
 * set is eligible. Stable tie-break: the first set achieving the max wins.
 *
 * `allowSubThreshold` widens the gate from "qualifying" (RPE ≥ 8) to "usable" (any
 * real RPE) — pass it for the cold-start seed fallback, never for analytics.
 */
export function peakImpliedE1rm(
  matrix: RpeMatrix,
  sets: LoggedSet[],
  allowSubThreshold = false,
): PeakE1rm | null {
  const eligible = allowSubThreshold ? isUsableSet : isQualifyingSet;
  let best: PeakE1rm | null = null;
  for (const set of sets) {
    if (!eligible(set)) continue;
    const e1rm = impliedE1rm(
      matrix,
      set.actualWeight,
      set.actualReps,
      set.actualRpe!,
    );
    if (best === null || e1rm > best.e1rm) best = { e1rm, set };
  }
  return best;
}

/**
 * Set a single matrix cell and repair monotonicity on its two adjacent RPE
 * columns in the SAME rep row, so a manual edit can't break the "pct rises with
 * RPE" ordering the lookup relies on. Pure — returns a new matrix; the input is
 * never mutated. Deliberately conservative: only the edited row's immediate
 * neighbours are touched (cross-row smoothing would surprise the editor's
 * deviation highlighting).
 */
export function setMatrixCell(
  matrix: RpeMatrix,
  reps: number,
  rpe: number,
  value: number,
): RpeMatrix {
  // Deep clone so callers (and Vue reactivity) never see in-place mutation.
  const next: RpeMatrix = {};
  for (const r of Object.keys(matrix).map(Number)) {
    next[r] = { ...matrix[r] };
  }
  if (!next[reps]) next[reps] = {};
  next[reps][rpe] = value;

  // pct rises with RPE within a row, so clamp the two adjacent columns back into
  // order if the edit broke it (conservative: neighbours only, no cascade).
  const row = next[reps];
  const cols = numericKeys(row);
  const idx = cols.indexOf(rpe);
  if (idx > 0) {
    const lo = cols[idx - 1];
    if (row[lo] > value) row[lo] = value; // lower RPE can't exceed the edit
  }
  if (idx < cols.length - 1) {
    const hi = cols[idx + 1];
    if (row[hi] < value) row[hi] = value; // higher RPE can't fall below the edit
  }
  return next;
}
