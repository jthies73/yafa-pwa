// ----------------------------------------------
// Planning
// ----------------------------------------------

export interface LinearProgressionParams {
  targetSets: number;
  targetReps: number;
  targetRpe?: number;
  weightIncrement: number;
}

export interface DoubleProgressionParams {
  targetSets: number;
  minReps: number;
  maxReps: number;
  weightIncrement: number;
}

export interface TopSetProgressionParams {
  topSetTargetReps: number;
  topSetTargetRpe: number;
  backOffSets: number;
  percentageDrop: number;
  weightIncrement: number;
}

export interface NoneProgressionParams {
  targetSets: number;
  targetReps: number;
  targetRpe?: number;
}

export type ProgressionParams =
  | LinearProgressionParams
  | DoubleProgressionParams
  | TopSetProgressionParams
  | NoneProgressionParams;

export type ProgressionModelType =
  | "linear"
  | "double"
  | "topset_backoff"
  | "none";

// Record<reps, Record<rpe, percentage_of_1rm>> — percentages stored as decimals (0..1).
export type RpeMatrix = Record<number, Record<number, number>>;

export interface Exercise {
  id: string;
  name: string;
  primaryMuscleGroups: string[];
  secondaryMuscleGroups?: string[];
  notes?: string;
  rpeMatrix?: RpeMatrix; // Present ⇒ custom override; absent ⇒ inherits the global matrix.
  created_at: number;
}

export interface RoutineExerciseConfig {
  progressionModel: ProgressionModelType;
  progressionParams: ProgressionParams;
  targetSets?: number;
  targetReps?: number;
  minReps?: number;
  maxReps?: number;
  targetRpe?: number;
  weightIncrement?: number;
  notes?: string;
  // Progression-param keys (e.g. "targetSets", "topSetTargetRpe") that periodization
  // must leave untouched when computing a workout. Absent/empty ⇒ nothing locked.
  lockedFields?: string[];
}

export interface RoutineExercise {
  exerciseId: string;
  config?: RoutineExerciseConfig;
}

export interface Routine {
  id: string;
  name: string;
  exercises: RoutineExercise[]; // Ordered list of exercises (allows duplicate movements per day)
  created_at: number;
}

export type PeriodizationFocus =
  | "hypertrophy"
  | "strength"
  | "peaking"
  | "deload";

// An object (not a bare PeriodizationFocus string) so future iterations can
// attach per-week tuning (intensity/volume overrides, planned RPE caps, notes)
// without a breaking shape change or a data migration.
export interface MesocycleWeek {
  focus: PeriodizationFocus;
}

export interface Plan {
  id: string;
  name: string;
  description?: string;
  routineIds: string[];
  active: boolean;
  created_at: number;
  mesocycle?: MesocycleWeek[]; // absent ⇒ no periodization configured
}

// ----------------------------------------------
// Workout / History Items
// ----------------------------------------------

export interface Set {
  id: string;
  timestamp: number; // ISO timestamp
  targetReps: number;
  actualReps: number;
  targetWeight: number;
  actualWeight: number;
  targetRpe?: number;
  actualRpe?: number;
  failure: boolean;
}

export interface WorkoutExercise {
  exerciseId: string;
  sets: Set[];
}

export interface Workout {
  id: string;
  routineId: string;
  startTime: number;
  endTime?: number;
  exercises: WorkoutExercise[];
}

// ----------------------------------------------
// Progression Engine State
// ----------------------------------------------

// The single active deload's decaying corrective layer. Its strength tapers
// linearly to zero over `decaySessions` post-trigger sessions
// (effective = initialMagnitude × (1 − sessionsElapsed / decaySessions)), after
// which it is dropped. At most one deload is active at a time — a fresh failure
// cascade replaces it rather than stacking a second modifier.
export interface DeloadState {
  e1rmAtTrigger: number; // the working e1RM when the deload fired (telemetry)
  initialMagnitude: number; // fraction removed at full strength (0.1 ⇒ −10%)
  decaySessions: number;
  sessionsElapsed: number;
}

/**
 * Per-exercise engine state. This is NOT an independently-mutated source of
 * truth: it is a memoized CHECKPOINT of folding the exercise's logged history
 * (engine/fold.ts) through the single ordered reducer. It is recomputed whenever
 * `contentHash` no longer matches its inputs (config, logged sets, matrix,
 * confirmed recalibrations), so it can never drift out of sync with history —
 * editing or deleting a past workout retro-corrects it on the next derive.
 *
 * `e1rm` is the single strength scalar: every weight prescription derives from
 * it via the RPE matrix. It moves only through the reducer (progression
 * increment, deload cut, passive blend toward demonstrated reality, or a
 * user-confirmed recalibration snap).
 */
export interface ProgressionState {
  exerciseId: string;
  e1rm: number | null; // null until seeded from the first logged session
  trend: number[]; // rolling window of recent demonstrated e1RMs (smoothing + analytics)
  failureStreak: number; // consecutive failed sessions (all progression models)
  currentTargetReps?: number; // double: rep goal advancing from minReps to maxReps
  deload: DeloadState | null;
  lastWorkoutId: string | null; // newest workout folded into this checkpoint
  contentHash: string; // hash of the fold inputs; mismatch ⇒ recompute
  updated_at: number;
}

/**
 * A user-confirmed recalibration: ground truth that the working e1RM of
 * `exerciseId` was deliberately snapped to `e1rm` at the session `workoutId`.
 * The fold reads these as inputs and replays the snap, so a confirmed
 * recalibration survives any later full recompute.
 */
export interface Recalibration {
  exerciseId: string;
  workoutId: string;
  e1rm: number;
}

// ----------------------------------------------
// Body Measurements
// ----------------------------------------------

// Which physical quantity a measurement tracks. This — not cm/kg — is what the
// user picks; the concrete display unit (cm/in, kg/lbs) is a global preference
// resolved at render time. PERCENTAGE is unit-less (body-fat %, etc.).
export type MeasurementCategory = "WEIGHT" | "LENGTH" | "PERCENTAGE";

export interface MeasurementType {
  id: string;
  name: string; // e.g. "Biceps", "Waist", "Bodyweight"
  category: MeasurementCategory;
  created_at: number;
}

export interface MeasurementEntry {
  id: string;
  measurementTypeId: string;
  // Stored in the source-of-truth unit for the type's category: kg for WEIGHT,
  // cm for LENGTH, raw percent for PERCENTAGE. Imperial never reaches the DB.
  value: number;
  timestamp: number; // epoch ms the measurement was taken
}

// ----------------------------------------------
// Analytics
// ----------------------------------------------

export type AnalyticsSourceKind =
  | "global"
  | "muscle"
  | "exercise"
  | "measurement";

// "value" is the raw logged measurement and only exists for the measurement
// source; every other metric is workout-derived.
export type AnalyticsMetric =
  | "workouts"
  | "sets"
  | "reps"
  | "volume"
  | "e1rm"
  | "value";

export type AnalyticsBucket = "session" | "week" | "month" | "mesocycle";

// A user-configured chart on the analytics page. Flat optional source fields
// (instead of a discriminated union) keep the shape Dexie-friendly; exactly
// the field matching `sourceKind` is set.
export interface AnalyticsChartConfig {
  id: string;
  name?: string;
  sourceKind: AnalyticsSourceKind;
  muscleGroup?: string; // sourceKind === "muscle"
  exerciseId?: string; // sourceKind === "exercise"
  measurementTypeId?: string; // sourceKind === "measurement"
  metric: AnalyticsMetric;
  bucket: AnalyticsBucket;
  order: number; // manual drag-to-reorder position on the analytics page
  created_at: number;
}

// ----------------------------------------------
// Global State
// ----------------------------------------------

// App preferences are persisted in localStorage (not IndexedDB).
// Keys are namespaced with "yafa:" to avoid collisions.
//   yafa:activePage  — last visited fullPath, restored on boot
//   yafa:units       — "metric" | "imperial"
//   theme            — "dark" | "light" (set by AppHeader, no namespace for legacy compat)
