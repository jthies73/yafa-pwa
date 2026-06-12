// ----------------------------------------------
// Workout engine tuning constants.
// Every magic number of the engine lives here, named and commented, so the
// behaviour can be tuned (or made user-configurable later) in one place.
// ----------------------------------------------

// ---- RPE matrix bounds ----

// The matrix spans reps 1–10 × RPE 6.0–10.0 in 0.5 steps. Lookups outside the
// grid are clamped to its edges: a 12-rep prescription reuses the 10-rep row
// (percentages below 10 reps extrapolate too poorly to be worth modelling),
// and prescribed RPE can never leave the grid, so the matrix floor of 6 doubles
// as the prescription floor.
export const RPE_MIN = 6;
export const RPE_MAX = 10;
export const LOOKUP_REPS_MIN = 1;
export const LOOKUP_REPS_MAX = 10;

// ---- Matrix learning ----

// Only honest, near-limit sets calibrate the matrix and the observed e1RM:
// low-RPE or very-high-rep sets imply e1RMs with too much noise to learn from.
export const QUALIFYING_MIN_RPE = 8;
export const QUALIFYING_MAX_REPS = 10;

// Rolling window for the observed (diagnostic) e1RM.
export const OBSERVED_E1RM_WINDOW = 10;

// EMA step for nudging a matrix cell toward an observed percentage. Small on
// purpose: a single session must never reshape the matrix — only a consistent
// trend across many sessions should.
export const MATRIX_EMA_ALPHA = 0.1;

// Neighbor smoothing kernel: cells within ±1.0 RPE of a touched cell receive a
// fraction of its nudge, with linear (triangular) falloff — 50% at ±0.5,
// 25% at ±1.0. Triangular was chosen over equal bleed because it keeps the
// RPE axis locally smooth while preserving the relative spacing between cells,
// and because the bleed is bounded by the primary delta, a neighbor can never
// overshoot the observation that caused the nudge.
export const MATRIX_SMOOTHING_KERNEL: { offset: number; factor: number }[] = [
  { offset: 0.5, factor: 0.5 },
  { offset: 1.0, factor: 0.25 },
];

// ---- Prescription ----

// Fallback target RPE for models that don't carry one (double progression, and
// linear configs without an explicit targetRpe). Used consistently for both
// weight derivation and session evaluation so a prescription is always judged
// against the same RPE it was computed from.
export const DEFAULT_TARGET_RPE = 8;

// Smallest weight step a barbell can actually be loaded to (ususally a 1.25 kg plate
// pair). All prescribed weights are rounded to this.
// TODO: make increments configurable per exercise
export const LOADABLE_INCREMENT_KG = 2.5;

// ---- Reset triggers ----

export const LP_FAILURE_RESET_TRIGGER = 3; // consecutive LP failures
export const TOP_SET_FAILURE_RESET_TRIGGER = 3; // consecutive flagged top-set sessions
export const DOUBLE_REGRESSION_RESET_TRIGGER = 2; // consecutive rep regressions at same weight
export const DOUBLE_PLATEAU_RESET_TRIGGER = 4; // consecutive identical-rep sessions at same weight

// ---- Reset shape ----

// Lasting working-e1RM cut applied by an intensity reset (when no observed
// e1RM is available to re-baseline to).
export const INTENSITY_RESET_E1RM_DROP = 0.1;

// Initial magnitudes of the decaying corrective modifiers.
export const INTENSITY_RESET_MAGNITUDE = 0.1;
export const VOLUME_RESET_MAGNITUDE = 0.3;

// Decay windows. Intensity decays over a LONGER window than volume because the
// fatigue it answers is systemic/neurological, which clears more slowly than
// the local muscular fatigue behind a volume reset — and because re-entry
// after a lasting e1RM cut should be gradual rather than snapping straight
// back to near-limit RPEs.
export const VOLUME_RESET_DECAY_SESSIONS = 3;
export const INTENSITY_RESET_DECAY_SESSIONS = 5;
