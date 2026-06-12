import { db } from "./db";
import { APP_VERSION } from "../config/version";
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
import { ensureSystemMeasurements } from "./measurements";

/**
 * Full snapshot of the local database. Because YAFA is offline-only, this file
 * is the user's sole backup/restore mechanism — export to a file, import to
 * restore (or move to another device).
 */
export interface BackupFile {
  app: "yafa";
  version: string;
  exportedAt: string;
  data: {
    exercises: Exercise[];
    routines: Routine[];
    plans: Plan[];
    workouts: Workout[];
    // Optional so backups created before the progression engine still import.
    progressionStates?: ProgressionState[];
    // Optional so backups created before body measurements still import.
    measurementTypes?: MeasurementType[];
    measurementEntries?: MeasurementEntry[];
    // Optional so backups created before analytics charts still import.
    analyticsCharts?: AnalyticsChartConfig[];
  };
}

/** Read every table into a serializable backup object. */
export async function exportData(): Promise<BackupFile> {
  const [
    exercises,
    routines,
    plans,
    workouts,
    progressionStates,
    measurementTypes,
    measurementEntries,
    analyticsCharts,
  ] = await Promise.all([
    db.exercises.toArray(),
    db.routines.toArray(),
    db.plans.toArray(),
    db.workouts.toArray(),
    db.progressionStates.toArray(),
    db.measurementTypes.toArray(),
    db.measurementEntries.toArray(),
    db.analyticsCharts.toArray(),
  ]);
  return {
    app: "yafa",
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      exercises,
      routines,
      plans,
      workouts,
      progressionStates,
      measurementTypes,
      measurementEntries,
      analyticsCharts,
    },
  };
}

/**
 * Replace all local data with the contents of a backup. Runs in a single
 * transaction so a failure leaves the database untouched.
 */
export async function importData(backup: BackupFile): Promise<void> {
  if (backup?.app !== "yafa" || !backup.data) {
    throw new Error("This file is not a valid YAFA backup.");
  }
  const { data } = backup;
  await db.transaction(
    "rw",
    [
      db.exercises,
      db.routines,
      db.plans,
      db.workouts,
      db.progressionStates,
      db.measurementTypes,
      db.measurementEntries,
      db.analyticsCharts,
    ],
    async () => {
      await Promise.all([
        db.exercises.clear(),
        db.routines.clear(),
        db.plans.clear(),
        db.workouts.clear(),
        db.progressionStates.clear(),
        db.measurementTypes.clear(),
        db.measurementEntries.clear(),
        db.analyticsCharts.clear(),
      ]);
      await db.exercises.bulkAdd(data.exercises ?? []);
      await db.routines.bulkAdd(data.routines ?? []);
      await db.plans.bulkAdd(data.plans ?? []);
      await db.workouts.bulkAdd(data.workouts ?? []);
      await db.progressionStates.bulkAdd(data.progressionStates ?? []);
      await db.measurementTypes.bulkAdd(data.measurementTypes ?? []);
      await db.measurementEntries.bulkAdd(data.measurementEntries ?? []);
      await db.analyticsCharts.bulkAdd(data.analyticsCharts ?? []);
    },
  );

  // The imported set may lack the system Bodyweight type or change the latest
  // entry — re-bootstrap and refresh the synchronous bodyweight cache.
  await ensureSystemMeasurements();
}
