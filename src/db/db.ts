import Dexie, { type Table } from "dexie";
import type {
  Exercise,
  Routine,
  Plan,
  Workout,
  ProgressionState,
  MeasurementType,
  MeasurementEntry,
  AnalyticsChartConfig,
} from "./types";

export class YafaDatabase extends Dexie {
  exercises!: Table<Exercise, string>;
  routines!: Table<Routine, string>;
  plans!: Table<Plan, string>;
  workouts!: Table<Workout, string>;
  progressionStates!: Table<ProgressionState, string>;
  measurementTypes!: Table<MeasurementType, string>;
  measurementEntries!: Table<MeasurementEntry, string>;
  analyticsCharts!: Table<AnalyticsChartConfig, string>;

  constructor() {
    super("YafaDatabase");

    this.version(1).stores({
      exercises: "id, name, *primaryMuscleGroups, created_at",
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

    // v4: primary muscle groups migrated to an array.
    this.version(4)
      .stores({
        exercises: "id, name, *primaryMuscleGroups, created_at",
      })
      .upgrade((tx) => {
        // Migrate old exercises that have `primaryMuscleGroup` (string) to `primaryMuscleGroups` (string[])
        return tx
          .table("exercises")
          .toCollection()
          .modify((e) => {
            if (e.primaryMuscleGroup) {
              e.primaryMuscleGroups = [e.primaryMuscleGroup];
              delete e.primaryMuscleGroup;
            } else if (!e.primaryMuscleGroups) {
              e.primaryMuscleGroups = [];
            }
          });
      });

    // v5: user-configured analytics charts (source × metric × time bucket).
    this.version(5).stores({
      analyticsCharts: "id, order",
    });
  }
}

export const db = new YafaDatabase();
