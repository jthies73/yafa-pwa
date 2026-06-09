import { db } from "./db";
import { APP_VERSION } from "../config/version";
import type { Exercise, Routine, Plan, Workout } from "./types";

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
  };
}

/** Read every table into a serializable backup object. */
export async function exportData(): Promise<BackupFile> {
  const [exercises, routines, plans, workouts] = await Promise.all([
    db.exercises.toArray(),
    db.routines.toArray(),
    db.plans.toArray(),
    db.workouts.toArray(),
  ]);
  return {
    app: "yafa",
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    data: { exercises, routines, plans, workouts },
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
    db.exercises,
    db.routines,
    db.plans,
    db.workouts,
    async () => {
      await Promise.all([
        db.exercises.clear(),
        db.routines.clear(),
        db.plans.clear(),
        db.workouts.clear(),
      ]);
      await db.exercises.bulkAdd(data.exercises ?? []);
      await db.routines.bulkAdd(data.routines ?? []);
      await db.plans.bulkAdd(data.plans ?? []);
      await db.workouts.bulkAdd(data.workouts ?? []);
    },
  );
}
