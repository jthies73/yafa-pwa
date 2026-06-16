import Dexie, { type Table } from "dexie";
import type {
  Exercise,
  Routine,
  Plan,
  Workout,
  ProgressionState,
  Recalibration,
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
  recalibrations!: Table<Recalibration, [string, string]>;
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

    // v6: bodyweight feature removed — drop the per-exercise bodyweightFactor
    // and the measurement-type system flag (bodyweight is now an ordinary type).
    this.version(6).upgrade(async (tx) => {
      await tx
        .table("exercises")
        .toCollection()
        .modify((e) => {
          delete e.bodyweightFactor;
        });
      await tx
        .table("measurementTypes")
        .toCollection()
        .modify((t) => {
          delete t.isSystem;
        });
    });

    // v7: engine rewrite to a single derived-state reducer. progressionStates
    // are now memoized fold checkpoints with a new shape, so the old rows are
    // discarded (they recompute from logged history on first derive). Adds the
    // recalibrations table — confirmed e1RM snaps the fold replays as inputs.
    this.version(7)
      .stores({
        recalibrations: "[exerciseId+workoutId], exerciseId, workoutId",
      })
      .upgrade(async (tx) => {
        await tx.table("progressionStates").clear();
      });
  }
}

export const db = new YafaDatabase();
