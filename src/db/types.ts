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

export type ProgressionParams =
  | LinearProgressionParams
  | DoubleProgressionParams
  | TopSetProgressionParams;

export type ProgressionModelType = "linear" | "double" | "topset_backoff";

// Record<reps, Record<rpe, percentage_of_1rm>> — percentages stored as decimals (0..1).
export type RpeMatrix = Record<number, Record<number, number>>;

export interface Exercise {
  id: string;
  name: string;
  primaryMuscleGroups: string[];
  secondaryMuscleGroups?: string[];
  notes?: string;
  bodyweightFactor: number; // Decimal representing % of bodyweight moved (e.g. 1.0 for pullups, 0.65 for pushups, 0.0 for barbell/dumbbell lifts)
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

export type ResetKind = "intensity" | "volume";

// Corrective layer applied on top of a prescription after a reset. Its
// strength tapers linearly to zero over `decaySessions` post-reset sessions
// (effective = initialMagnitude × (1 − sessionsElapsed / decaySessions)),
// after which it is dropped from the queue.
export interface ResetModifier {
  kind: ResetKind;
  initialMagnitude: number; // fraction removed at full strength (0.1 ⇒ −10%)
  decaySessions: number;
  sessionsElapsed: number;
}

/**
 * Persistent per-exercise engine state. The engine tracks TWO distinct e1RM
 * concepts — they must never be conflated:
 *
 * - `workingE1rm` is the planning scalar: every weight prescription is derived
 *   from it via the RPE matrix. It moves deliberately — up by the configured
 *   `weightIncrement` on a successful session, down (lastingly) by an
 *   intensity reset. It is the single source of truth for prescriptions.
 * - `observedE1rms` holds the implied e1RMs of the last 10 qualifying sets
 *   (reps ≤ 10 AND RPE ≥ 8); their mean is the "observed e1RM". It is a
 *   DIAGNOSTIC only: it detects divergence from `workingE1rm` and serves as
 *   the re-baseline target when an intensity reset recalculates from recent
 *   performance. It never drives daily prescriptions directly.
 */
export interface ProgressionState {
  exerciseId: string;
  workingE1rm: number | null; // null until seeded from the first logged session
  observedE1rms: number[];
  failureStreak: number; // linear + top-set: consecutive failed sessions
  regressionStreak: number; // double: consecutive rep regressions at same weight
  plateauStreak: number; // double: consecutive identical-rep sessions at same weight
  currentTargetReps?: number; // double: rep goal advancing from minReps to maxReps
  lastSessionReps?: number; // double: previous session's total reps (comparison basis)
  lastSessionWeight?: number; // double: the weight those reps were achieved at
  resetModifiers: ResetModifier[];
  updated_at: number;
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
  // System types (currently only "Bodyweight") cannot be renamed, recategorised
  // or deleted — they link into the engine (bodyweight load) and analytics.
  isSystem: boolean;
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
// Global State
// ----------------------------------------------

// App preferences are persisted in localStorage (not IndexedDB).
// Keys are namespaced with "yafa:" to avoid collisions.
//   yafa:activePage  — last visited fullPath, restored on boot
//   yafa:units       — "metric" | "imperial"
//   theme            — "dark" | "light" (set by AppHeader, no namespace for legacy compat)
