import type { PeriodizationFocus } from "../db/types";

// ----------------------------------------------
// Engine tuning constants — the single source of every magic number the
// progression engine relies on. Pure data; no logic. Kept in one place so the
// locked domain rules (which are NOT tunable) stay visually separate from the
// heuristics (which are).
//
// Pipeline stage: cross-cutting — every stage (prescription, evaluation, state,
// mesocycle) reads from here.
// ----------------------------------------------

// --- Locked domain rules (decided by the user; do NOT tune casually) ---

/** Default RPE the prescribed load aims for AND the rules judge against. */
export const DEFAULT_TARGET_RPE = 8;
/** Default ceiling — only caps the rendered load, never judges. */
export const DEFAULT_RPE_CEILING = 9;
/** Consecutive regressions that arm a reset. The 3rd regression sets the flag. */
export const REGRESSION_RESET_TRIGGER = 3;
/** Fraction the c1RM drops when a reset is consumed (−10%). */
export const RESET_DROP = 0.1;

// --- Calibration / matrix mechanics ---

/** Granularity prescribed weights round to (a 2.5 kg jump = smallest plate pair). */
export const LOADABLE_INCREMENT_KG = 2.5;
/**
 * Tolerance band for the "weight == prescribed" clause in the regression rules.
 * A logged set within ±1.25 kg of the prescribed weight counts as "at" it, so
 * rounding/microplate noise never hides a genuine regression.
 */
export const PRESCRIBED_WEIGHT_TOLERANCE_KG = 1.25;

/**
 * A set only implies a usable e1RM when it is honest and near-limit: RPE ≥ 8 and
 * reps ≤ 10. These gate both analytics' e1RM chart and the cold-start c1RM seed,
 * so they live here as the shared definition.
 */
export const QUALIFYING_MIN_RPE = 8;
export const QUALIFYING_MAX_REPS = 10;

// --- RPE matrix grid bounds (mirror src/db/rpeMatrix.ts) ---

export const MATRIX_MIN_REPS = 1;
export const MATRIX_MAX_REPS = 10;
export const MATRIX_MIN_RPE = 6;
export const MATRIX_MAX_RPE = 10;
/** RPE columns are spaced every 0.5; snapRpe rounds to this grid. */
export const RPE_STEP = 0.5;

// --- Mesocycle modifiers (HEURISTIC — explicitly tunable) ---
//
// These shift an exercise's TARGETS per week focus; the load always re-renders
// from the shifted targets (there is no direct load multiplier). They sketch the
// canonical curve FOCUS_META draws: volume tapers and intensity climbs toward a
// peak, then a deload backs off both. They are a defensible first pass, NOT a
// locked domain rule — validate against real logs and adjust freely.

/** RPE added to the (top-set) targetRpe — intensity. */
export const MESO_RPE_DELTA: Record<PeriodizationFocus, number> = {
  hypertrophy: 0,
  strength: 0.5,
  peaking: 1,
  deload: -1.5,
};

/** Reps added to the rep target — negative trims reps as intensity rises. */
export const MESO_REP_DELTA: Record<PeriodizationFocus, number> = {
  hypertrophy: 1,
  strength: -1,
  peaking: -2,
  deload: 0,
};

/** Working sets added — volume. */
export const MESO_SET_DELTA: Record<PeriodizationFocus, number> = {
  hypertrophy: 1,
  strength: 0,
  peaking: -1,
  deload: -1,
};
