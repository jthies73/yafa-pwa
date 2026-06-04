import Dexie, { type Table } from "dexie";
import type { Exercise, Routine, Plan, Workout, AppState } from "./types";

export class YafaDatabase extends Dexie {
  exercises!: Table<Exercise, string>;
  routines!: Table<Routine, string>;
  plans!: Table<Plan, string>;
  workouts!: Table<Workout, string>;
  appState!: Table<AppState & { id: string }, string>; // IndexedDB stores a single appState doc keyed by 'settings'

  constructor() {
    super("YafaDatabase");

    // Define tables and columns (indexes)
    // The first property listed is the primary key. Subsequent keys are indexed fields.
    this.version(1).stores({
      exercises: "id, name, primaryMuscleGroup, created_at",
      routines: "id, name, created_at",
      plans: "id, name, active, created_at",
      workouts: "id, routineId, startTime, endTime",
      appState: "id",
    });
  }
}

export const db = new YafaDatabase();
