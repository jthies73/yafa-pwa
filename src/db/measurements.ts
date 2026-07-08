import { db } from "./db";
import { pickBodyweightAt } from "../engine/bodyweight";
import type { MeasurementCategory, MeasurementEntry } from "./types";
// ----------------------------------------------
// Body measurements: types (what to track) + entries (timestamped values).
//
// Source of truth lives entirely in Dexie. "Bodyweight" is a non-deletable
// SYSTEM type (isSystem): the engine reads it to lift added weights into
// total-load space for bodyweightFactor exercises. All other types are
// ordinary, user-managed records.
// ----------------------------------------------

export const BODYWEIGHT_TYPE_ID = "bodyweight";

function uid(): string {
  return crypto.randomUUID();
}

/** Most recent entry for a type, or undefined when none logged yet. */
export async function latestEntry(
  typeId: string,
): Promise<MeasurementEntry | undefined> {
  const entries = await db.measurementEntries
    .where("measurementTypeId")
    .equals(typeId)
    .toArray();
  if (!entries.length) return undefined;
  return entries.reduce((a, b) => (b.timestamp > a.timestamp ? b : a));
}

/** Latest bodyweight (kg), or undefined when none logged. Prescriptions use this. */
export async function currentBodyweight(): Promise<number | undefined> {
  return (await latestEntry(BODYWEIGHT_TYPE_ID))?.value;
}

/**
 * Bodyweight (kg) in effect at `timestamp` (latest entry ≤ it, falling back to
 * the earliest entry), or undefined when none logged. Folds and historical
 * analytics use this so results are reproducible.
 */
export async function bodyweightAt(
  timestamp: number,
): Promise<number | undefined> {
  const entries = await db.measurementEntries
    .where("measurementTypeId")
    .equals(BODYWEIGHT_TYPE_ID)
    .toArray();
  return pickBodyweightAt(entries, timestamp);
}

// ---- Measurement types ----

export interface MeasurementTypeInput {
  name: string;
  category: MeasurementCategory;
}

export async function createMeasurementType(
  input: MeasurementTypeInput,
): Promise<string> {
  const id = uid();
  await db.measurementTypes.add({
    id,
    name: input.name.trim(),
    category: input.category,
    created_at: Date.now(),
  });
  return id;
}

/** Deletes a measurement type and all its entries. System types are protected. */
export async function deleteMeasurementType(id: string): Promise<void> {
  const type = await db.measurementTypes.get(id);
  if (!type || type.isSystem) return;

  await db.transaction(
    "rw",
    [db.measurementTypes, db.measurementEntries],
    async () => {
      const entryIds = await db.measurementEntries
        .where("measurementTypeId")
        .equals(id)
        .primaryKeys();
      if (entryIds.length) await db.measurementEntries.bulkDelete(entryIds);
      await db.measurementTypes.delete(id);
    },
  );
}

// ---- Measurement entries ----

export async function logMeasurementEntry(input: {
  measurementTypeId: string;
  value: number; // already in source-of-truth units (kg / cm / %)
  timestamp: number;
}): Promise<string> {
  const id = uid();
  await db.measurementEntries.add({
    id,
    measurementTypeId: input.measurementTypeId,
    value: input.value,
    timestamp: input.timestamp,
  });
  return id;
}

export async function deleteMeasurementEntry(id: string): Promise<void> {
  await db.measurementEntries.delete(id);
}
