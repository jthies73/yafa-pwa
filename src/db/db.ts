import Dexie, { type Table } from "dexie";
import type {
  Exercise,
  Routine,
  Plan,
  Workout,
  ProgressionState,
  MeasurementType,
  MeasurementEntry,
} from "./types";

export class YafaDatabase extends Dexie {
  exercises!: Table<Exercise, string>;
  routines!: Table<Routine, string>;
  plans!: Table<Plan, string>;
  workouts!: Table<Workout, string>;
  progressionStates!: Table<ProgressionState, string>;
  measurementTypes!: Table<MeasurementType, string>;
  measurementEntries!: Table<MeasurementEntry, string>;

  constructor() {
    super("YafaDatabase");

    this.version(1).stores({
      exercises: "id, name, primaryMuscleGroup, created_at",
      routines: "id, name, created_at",
      plans: "id, name, active, created_at",
      workouts: "id, routineId, startTime, endTime",
    });

    // v2: per-exercise progression engine state (working e1RM, streaks, resets).
    this.version(2).stores({
      progressionStates: "exerciseId",
    });

    // v3: body measurements (anthropometrics + composition over time).
    this.version(3).stores({
      measurementTypes: "id, name, created_at",
      measurementEntries: "id, measurementTypeId, timestamp",
    });
  }
}

export const db = new YafaDatabase();
