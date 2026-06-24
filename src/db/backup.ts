import { db } from "./db";
import { APP_VERSION } from "../config/version";
import { readZipText } from "../utils/zip";
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
    // Optional so backups created before body measurements still import.
    measurementTypes?: MeasurementType[];
    measurementEntries?: MeasurementEntry[];
    // Optional so backups created before analytics charts still import.
    analyticsCharts?: AnalyticsChartConfig[];
    // Optional so backups created before the engine rebuild still import; a
    // missing list just means exercises re-seed their c1RM on first prescribe.
    progressionStates?: ProgressionState[];
  };
}

/** Read every table into a serializable backup object. */
export async function exportData(): Promise<BackupFile> {
  const [
    exercises,
    routines,
    plans,
    workouts,
    measurementTypes,
    measurementEntries,
    analyticsCharts,
    progressionStates,
  ] = await Promise.all([
    db.exercises.toArray(),
    db.routines.toArray(),
    db.plans.toArray(),
    db.workouts.toArray(),
    db.measurementTypes.toArray(),
    db.measurementEntries.toArray(),
    db.analyticsCharts.toArray(),
    db.progressionStates.toArray(),
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
      measurementTypes,
      measurementEntries,
      analyticsCharts,
      progressionStates,
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
      db.measurementTypes,
      db.measurementEntries,
      db.analyticsCharts,
      db.progressionStates,
    ],
    async () => {
      await Promise.all([
        db.exercises.clear(),
        db.routines.clear(),
        db.plans.clear(),
        db.workouts.clear(),
        db.measurementTypes.clear(),
        db.measurementEntries.clear(),
        db.analyticsCharts.clear(),
        db.progressionStates.clear(),
      ]);
      await db.exercises.bulkAdd(data.exercises ?? []);
      await db.routines.bulkAdd(data.routines ?? []);
      await db.plans.bulkAdd(data.plans ?? []);
      await db.workouts.bulkAdd(data.workouts ?? []);
      await db.measurementTypes.bulkAdd(data.measurementTypes ?? []);
      await db.measurementEntries.bulkAdd(data.measurementEntries ?? []);
      await db.analyticsCharts.bulkAdd(data.analyticsCharts ?? []);
      await db.progressionStates.bulkAdd(data.progressionStates ?? []);
    },
  );
}

/**
 * Parse a user-selected backup file into a {@link BackupFile}. Accepts either a
 * raw `.json` backup or a `.zip` export (from which `backup.json` is extracted).
 * Structural validation happens in {@link importData}.
 */
export async function parseBackupFile(file: File): Promise<BackupFile> {
  const isZip =
    file.name.toLowerCase().endsWith(".zip") || file.type.includes("zip");
  let text: string | null;
  if (isZip) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    text = readZipText(bytes, "backup.json");
    if (text === null) {
      throw new Error("This ZIP does not contain a YAFA backup.json.");
    }
  } else {
    text = await file.text();
  }
  return JSON.parse(text) as BackupFile;
}
