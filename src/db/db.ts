import Dexie, { type Table } from "dexie";
import type {
  Exercise,
  Routine,
  Plan,
  Workout,
  MeasurementType,
  MeasurementEntry,
  AnalyticsChartConfig,
  ProgressionState,
} from "./types";

export class YafaDatabase extends Dexie {
  exercises!: Table<Exercise, string>;
  routines!: Table<Routine, string>;
  plans!: Table<Plan, string>;
  workouts!: Table<Workout, string>;
  measurementTypes!: Table<MeasurementType, string>;
  measurementEntries!: Table<MeasurementEntry, string>;
  analyticsCharts!: Table<AnalyticsChartConfig, string>;
  progressionStates!: Table<ProgressionState, string>;

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

    // v8: core engine teardown. The progression engine and its persisted state
    // are removed pending a rewrite, so both engine tables are dropped.
    this.version(8).stores({
      progressionStates: null,
      recalibrations: null,
    });

    // v9: progression engine rebuild. Re-introduces per-exercise progression
    // state keyed by exerciseId (c1RM anchor, regression streak, reset flag,
    // double rep cursor). No upgrade — v8 dropped the table, so there is no
    // legacy data; rows are created lazily as each exercise is first prescribed.
    this.version(9).stores({
      progressionStates: "exerciseId",
    });

    // v10: same-session fatigue prescription. The (required) fatigueReduction /
    // fatigueReductionUnit params are stamped onto every stored routine-exercise
    // config so records on disk stay fully populated, using the feature's
    // default (10% of c1RM — the same value normalizeProgressionParams
    // backfills at read time for imports of older backups).
    this.version(10).upgrade(async (tx) => {
      await tx
        .table("routines")
        .toCollection()
        .modify((r) => {
          for (const ex of r.exercises ?? []) {
            const p = ex.config?.progressionParams;
            if (!p) continue;
            p.fatigueReduction ??= 10;
            p.fatigueReductionUnit ??= "percent";
          }
        });
    });
  }
}

export const db = new YafaDatabase();
