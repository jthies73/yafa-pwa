// ----------------------------------------------
// Planning
// ----------------------------------------------

export interface LinearProgressionParams {
  targetSets: number;
  targetReps: number;
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
  primaryMuscleGroup: string;
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

export interface Plan {
  id: string;
  name: string;
  description?: string;
  routineIds: string[];
  active: boolean;
  created_at: number;
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
// Global State
// ----------------------------------------------

// App preferences are persisted in localStorage (not IndexedDB).
// Keys are namespaced with "yafa:" to avoid collisions.
//   yafa:activePage  — last visited fullPath, restored on boot
//   yafa:units       — "metric" | "imperial"
//   theme            — "dark" | "light" (set by AppHeader, no namespace for legacy compat)
