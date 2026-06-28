// ----------------------------------------------
// Planning
// ----------------------------------------------

// Exercise configuration is the HEAD of the yafa planning pipeline:
//   config → mesocycle → prescription → execution → finish → c1RM update → next prescription
// Everything the (future) engine prescribes for an exercise derives from these
// params, so they are the contract the rest of the pipeline reads against.
//
// Two RPE knobs work together (decision: "Target judges, Ceiling caps load"):
//   • targetRpe  — the RPE the prescribed load AIMS for, and the threshold the
//                  progression rules judge success/regression against.
//   • rpeCeiling — a prescription guardrail ONLY: never prescribe a load whose
//                  expected RPE would exceed it. It never enters the success/
//                  regression decision.
// Both are REQUIRED here so the engine never has to special-case a missing RPE;
// older stored configs predating these fields are backfilled at read time by
// normalizeProgressionParams (src/config/progression.ts) — there is no migration.

// The weight increment can be expressed two ways; `incrementUnit` discriminates
// how `weightIncrement` is interpreted when the engine raises the c1RM on a win.
export type WeightIncrementUnit = "kg" | "percent";

export interface LinearProgressionParams {
  targetSets: number;
  targetReps: number;
  targetRpe: number; // aims the load + judges the outcome (default 8)
  rpeCeiling: number; // only caps the prescribed load (default 9)
  weightIncrement: number; // kg, or a raw percent of c1RM when incrementUnit === "percent"
  incrementUnit: WeightIncrementUnit;
}

export interface DoubleProgressionParams {
  targetSets: number;
  minReps: number;
  maxReps: number;
  targetRpe: number; // default 8
  rpeCeiling: number; // default 9
  weightIncrement: number;
  incrementUnit: WeightIncrementUnit;
}

export interface TopSetProgressionParams {
  topSetTargetReps: number;
  topSetTargetRpe: number; // "Target RPE" for the top set (name kept for back-compat)
  rpeCeiling: number; // default 9
  backOffSets: number;
  backOffRpe: number; // target effort for back-offs; drives the derived rep count
  percentageDrop: number;
  weightIncrement: number;
  incrementUnit: WeightIncrementUnit;
}

export interface NoneProgressionParams {
  targetSets: number;
  targetReps: number;
  targetRpe: number; // default 8; no ceiling — "none" never prescribes above target
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
  weeklyTarget?: number; // Sessions/week to aim for; absent ⇒ no target
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
  // A one-off remark for this session ("felt heavy", "switch next meso"). Distinct
  // from the exercise's global Exercise.notes (reusable setup info).
  note?: string;
}

export interface Workout {
  id: string;
  routineId: string;
  startTime: number;
  endTime?: number;
  exercises: WorkoutExercise[];
}

// Per-exercise progression state — one row per exercise, keyed by exerciseId.
// c1RM ("calculative 1RM") is the working anchor every prescribed weight derives
// from (load = matrixPct(reps, targetRpe) × c1rm) and the ONLY value progression
// advances. The analytics e1RM (impliedE1rm) is a separate, display-only number
// and is never stored here. State is persisted (not folded from history each time)
// because percentage increments and resets make the c1RM path-dependent.
export interface ProgressionState {
  exerciseId: string;
  c1rm: number | null; // null until seeded from the first qualifying session
  regressionStreak: number; // consecutive regressed sessions; 3 arms a reset
  resetPending: boolean; // set at the 3rd regression; consumed (−10% c1RM) at next prescribe
  doubleRepCursor?: number; // double model only: the rep target advancing minReps → maxReps
  lastWorkoutId: string | null; // idempotency guard for applyWorkoutResults
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
  muscleGroups?: string[]; // sourceKind === "muscle" — folded together, each set counted once
  /** @deprecated legacy single group; read via muscleGroupsOf (back-compat for old records/backups). */
  muscleGroup?: string;
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
//   yafa:activeWorkout — in-progress session snapshot, resumed on boot (device-only, not in backups)
//   yafa:units         — "metric" | "imperial"
//   theme              — "dark" | "light" (set by AppHeader, no namespace for legacy compat)
