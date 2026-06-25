import { db } from "./db";
import { APP_VERSION } from "../config/version";
import { readZipText } from "../utils/zip";
import {
  applyPortableSettings,
  readPortableSettings,
  type PortableSettings,
} from "../config/settings";
import {
  UNKNOWN_ROUTINE_ID,
  buildRawWorkouts,
  reconstructWorkoutsFromRaw,
  type RawWorkouts,
} from "./rawWorkouts";
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
 * restore (or move to another device). Import MERGES (upsert by id), so
 * re-importing the same file creates no duplicates and never deletes data that
 * is only on this device.
 */
export interface BackupFile {
  app: "yafa";
  version: string;
  exportedAt: string;
  // Portable preferences (theme, units, chart timeframes). Optional so backups
  // created before settings were carried still import.
  settings?: PortableSettings;
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
    // Forgiving, name-keyed copy of the workouts — the recovery source if the
    // structured `workouts` can't be imported. Optional for old backups.
    rawWorkouts?: RawWorkouts;
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
  const exercisesById = new Map(exercises.map((e) => [e.id, e]));
  return {
    app: "yafa",
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: readPortableSettings(localStorage),
    data: {
      exercises,
      routines,
      plans,
      workouts,
      measurementTypes,
      measurementEntries,
      analyticsCharts,
      progressionStates,
      rawWorkouts: buildRawWorkouts(workouts, exercisesById),
    },
  };
}

/**
 * Validate that structured workouts are usable: well-formed shape, sane set
 * numbers, and every referenced exercise exists. A throw is the signal to fall
 * back to the raw reconstruction. Pure (no Dexie) so it stays unit-testable.
 */
export function assertStructuredWorkoutsValid(
  workouts: Workout[],
  knownExerciseIds: Set<string>,
): void {
  for (const w of workouts) {
    if (!w || typeof w.id !== "string" || !w.id) {
      throw new Error("A workout is missing its id.");
    }
    if (typeof w.startTime !== "number" || !Number.isFinite(w.startTime)) {
      throw new Error(`Workout ${w.id} has no valid startTime.`);
    }
    if (!Array.isArray(w.exercises)) {
      throw new Error(`Workout ${w.id} has no exercises list.`);
    }
    for (const we of w.exercises) {
      if (!we || !knownExerciseIds.has(we.exerciseId)) {
        throw new Error(
          `Workout ${w.id} references unknown exercise "${we?.exerciseId}".`,
        );
      }
      if (!Array.isArray(we.sets)) {
        throw new Error(`Workout ${w.id} has a malformed set list.`);
      }
      for (const s of we.sets) {
        const ok =
          !!s &&
          Number.isFinite(s.timestamp) &&
          Number.isFinite(s.actualReps) &&
          Number.isFinite(s.actualWeight);
        if (!ok) throw new Error(`Workout ${w.id} has a malformed set.`);
      }
    }
  }
}

/**
 * Merge a backup into the local database. Idempotent: every table is upserted
 * by primary key (`bulkPut`), so re-importing the same file overwrites matching
 * rows and adds new ones without ever duplicating or deleting local-only data.
 * Workouts are restored from the structured list when possible, otherwise
 * reconstructed from the raw fallback.
 */
export async function importData(backup: BackupFile): Promise<void> {
  if (backup?.app !== "yafa" || !backup.data) {
    throw new Error("This file is not a valid YAFA backup.");
  }
  const { data } = backup;

  // 1) Settings first — independent of the DB; unknown keys are ignored.
  applyPortableSettings(backup.settings, localStorage);

  // 2) Idempotent merge of every non-workout table.
  await db.transaction(
    "rw",
    [
      db.exercises,
      db.routines,
      db.plans,
      db.measurementTypes,
      db.measurementEntries,
      db.analyticsCharts,
      db.progressionStates,
    ],
    async () => {
      await db.exercises.bulkPut(data.exercises ?? []);
      await db.routines.bulkPut(data.routines ?? []);
      await db.plans.bulkPut(data.plans ?? []);
      await db.measurementTypes.bulkPut(data.measurementTypes ?? []);
      await db.measurementEntries.bulkPut(data.measurementEntries ?? []);
      await db.analyticsCharts.bulkPut(data.analyticsCharts ?? []);
      await db.progressionStates.bulkPut(data.progressionStates ?? []);
    },
  );

  // 3) Workouts: structured first, raw reconstruction as a resilient fallback.
  await importWorkouts(data);
}

/** Restore workouts: try the structured list, fall back to raw on any failure. */
async function importWorkouts(data: BackupFile["data"]): Promise<void> {
  const structured = data.workouts ?? [];
  const raw = data.rawWorkouts;
  const hasRaw = !!raw && Object.keys(raw).length > 0;

  try {
    if (!structured.length) {
      // No structured workouts: use raw if present, else a clean no-op.
      if (hasRaw) await reconstructAndPersist(raw);
      return;
    }
    const knownExerciseIds = new Set(
      (await db.exercises.toArray()).map((e) => e.id),
    );
    assertStructuredWorkoutsValid(structured, knownExerciseIds);
    await db.workouts.bulkPut(structured); // idempotent: same ids overwrite
  } catch (err) {
    if (hasRaw) {
      await reconstructAndPersist(raw);
      return;
    }
    throw err; // nothing to fall back to — surface the failure
  }
}

/**
 * Rebuild exercises + workouts from the raw map and persist them. The fallback
 * only recovers exercises (created with a basic default config) and the sets;
 * the originating routine is unrecoverable from raw, so reconstructed workouts
 * carry the "unknown routine" sentinel rather than fabricating or guessing one.
 */
async function reconstructAndPersist(raw: RawWorkouts): Promise<void> {
  await db.transaction("rw", [db.exercises, db.workouts], async () => {
    const [existingExercises, existingWorkouts] = await Promise.all([
      db.exercises.toArray(),
      db.workouts.where("routineId").equals(UNKNOWN_ROUTINE_ID).toArray(),
    ]);
    const { exercisesToAdd, workoutsToPut } = reconstructWorkoutsFromRaw({
      raw,
      existingExercises,
      existingWorkouts,
      routineId: UNKNOWN_ROUTINE_ID,
      now: Date.now(),
      newId: () => crypto.randomUUID(),
    });
    await db.exercises.bulkPut(exercisesToAdd);
    await db.workouts.bulkPut(workoutsToPut);
  });
}

/**
 * Parse a user-selected backup file into a {@link BackupFile}. Accepts either a
 * raw `.json` backup or a `.zip` export (from which `backup.json` is extracted)
 * for backward compatibility with archives produced by older versions.
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
