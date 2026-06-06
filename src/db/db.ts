import Dexie, { type Table } from "dexie";
import type { Exercise, Routine, Plan, Workout } from "./types";

export class YafaDatabase extends Dexie {
  exercises!: Table<Exercise, string>;
  routines!: Table<Routine, string>;
  plans!: Table<Plan, string>;
  workouts!: Table<Workout, string>;

  constructor() {
    super("YafaDatabase");

    this.version(1).stores({
      exercises: "id, name, primaryMuscleGroup, created_at",
      routines: "id, name, created_at",
      plans: "id, name, active, created_at",
      workouts: "id, routineId, startTime, endTime",
    });
  }
}

export const db = new YafaDatabase();
