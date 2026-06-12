import { db } from "./db";
import type { MeasurementCategory, MeasurementEntry } from "./types";
// ----------------------------------------------
// Body measurements: types (what to track) + entries (timestamped values).
//
// Source of truth lives entirely in Dexie. The "Bodyweight" type is special:
// it is the SINGLE source of truth for the lifter's bodyweight, which the
// progression engine reads to calculate total system load.
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

/**
 * Boot-time idempotent bootstrap. Ensures the system "Bodyweight" type exists
 * (for both fresh and pre-existing databases), migrates any legacy localStorage
 * bodyweight into a seeded entry. Safe to run on every launch.
 */
export async function ensureSystemMeasurements(): Promise<void> {
  const existing = await db.measurementTypes.get(BODYWEIGHT_TYPE_ID);
  if (!existing) {
    await db.measurementTypes.add({
      id: BODYWEIGHT_TYPE_ID,
      name: "Bodyweight",
      category: "WEIGHT",
      isSystem: true,
      created_at: Date.now(),
    });
  }

  // Migrate a bodyweight set before measurements existed into a real entry, so
  // the localStorage value and the entry history never disagree.
  const entryCount = await db.measurementEntries
    .where("measurementTypeId")
    .equals(BODYWEIGHT_TYPE_ID)
    .count();
  if (entryCount === 0) {
    const raw = Number(localStorage.getItem("yafa:bodyweight"));
    const legacy = Number.isFinite(raw) && raw > 0 ? raw : 0;
    if (legacy > 0) {
      await db.measurementEntries.add({
        id: uid(),
        measurementTypeId: BODYWEIGHT_TYPE_ID,
        value: legacy,
        timestamp: Date.now(),
      });
    }
  }
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
    isSystem: false,
    created_at: Date.now(),
  });
  return id;
}

/**
 * Deletes a measurement type and all its entries. System types (Bodyweight) are
 * protected and silently ignored — the UI must not offer to delete them.
 */
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
