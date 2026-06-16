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

// ---- e1RM calibration ----

// Only honest, near-limit sets calibrate the demonstrated e1RM: low-RPE or
// very-high-rep sets imply e1RMs with too much noise to estimate capacity from.
export const QUALIFYING_MIN_RPE = 8;
export const QUALIFYING_MAX_REPS = 10;

// Rolling window of recent demonstrated e1RMs. Its mean is the passive-learning
// target the single working e1RM gently tracks (see LEARN_BLEND) and the source
// for trend analytics.
export const TREND_WINDOW = 10;

// Fraction of the way the working e1RM moves toward the smoothed demonstrated
// trend each session, for SMALL drift (within RECALIBRATION_DIVERGENCE_THRESHOLD).
// Small on purpose: passive tracking, not a snap — a single session never
// reshapes the scalar. Large drift is surfaced for confirmation instead.
export const LEARN_BLEND = 0.25;

// Neighbor smoothing kernel for MANUAL matrix-cell edits (setMatrixCell): cells
// within ±1.0 RPE of an edited cell absorb a fraction of the change, with linear
// (triangular) falloff — 50% at ±0.5, 25% at ±1.0 — so a hand edit bends the
// curve locally instead of leaving a step in it.
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

// ---- Deload triggers ----

export const LP_FAILURE_RESET_TRIGGER = 3; // consecutive LP failures
export const TOP_SET_FAILURE_RESET_TRIGGER = 3; // consecutive flagged top-set sessions
export const DOUBLE_FAILURE_RESET_TRIGGER = 3; // consecutive failures in double progression

// ---- Deload shape ----

// Lasting working-e1RM cut applied when a failure streak triggers a deload. This
// cut — not the decaying modifier — is what stops a deload from oscillating on a
// true plateau: without it, prescriptions would return to the loads that caused
// the failures and immediately re-trigger.
export const DELOAD_E1RM_DROP = 0.1;

// Initial magnitude of the decaying corrective deload modifier (it tapers the
// prescription's intensity back toward baseline over DELOAD_DECAY_SESSIONS).
export const DELOAD_MAGNITUDE = 0.1;

// Decay window. The deload decays slowly because the systemic/neurological
// fatigue it answers clears more slowly than local muscular fatigue, and because
// re-entry after a lasting e1RM cut should be gradual.
export const DELOAD_DECAY_SESSIONS = 5;

// ---- Recalibration ----

// When the e1RM a session actually demonstrated (its peak honest set) diverges
// from the working e1RM by at least this fraction in EITHER direction, the
// working scalar is treated as stale and a recalibration is offered. ±10%.
export const RECALIBRATION_DIVERGENCE_THRESHOLD = 0.1;

// How far a confirmed recalibration moves the working e1RM toward the
// demonstrated value (0 = no move, 1 = full snap). Larger than the matrix EMA
// because this is a deliberate, user-confirmed correction rather than passive
// per-session learning — but short of a full snap so a single outlier session
// can't fully rewrite the baseline.
export const RECALIBRATION_BLEND = 2 / 3;
