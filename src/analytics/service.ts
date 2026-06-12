import { db } from "../db/db";
import { BODYWEIGHT_TYPE_ID } from "../db/measurements";
import type { AnalyticsChartConfig, MeasurementCategory } from "../db/types";
import {
  computeMeasurementSeries,
  computeWorkoutSeries,
  type BucketPoint,
  type MesocycleSpec,
  type WorkoutMetric,
  type WorkoutScope,
} from "./compute";

// ----------------------------------------------
// Analytics service: the only analytics layer that touches Dexie. Loads the
// raw data, applies the global timeframe and hands off to the pure compute
// module. All reads go through Dexie tables, so wrapping buildChartSeries in
// a liveQuery keeps a chart in sync with new workouts and measurements.
// ----------------------------------------------

export type Timeframe = "max" | "year" | "month" | "week";

const DAY_MS = 24 * 60 * 60 * 1000;

// Trailing windows behind the global timeframe toggle ("Last Month" is defined
// as the trailing 4 weeks, "Last Year" as the trailing 12 months).
const TIMEFRAME_WINDOW_MS: Record<Timeframe, number | null> = {
  max: null,
  year: 365 * DAY_MS,
  month: 28 * DAY_MS,
  week: 7 * DAY_MS,
};

/** How the y-values of a series should be formatted for display. */
export type ValueKind = "count" | "weight" | "length" | "percentage";

const CATEGORY_VALUE_KIND: Record<MeasurementCategory, ValueKind> = {
  WEIGHT: "weight",
  LENGTH: "length",
  PERCENTAGE: "percentage",
};

export interface ChartSeries {
  points: BucketPoint[];
  valueKind: ValueKind;
}

/**
 * The active plan's mesocycle as a bucketing grid (anchored to the plan's
 * created_at, like engine/mesocycle.ts), or undefined when no active plan has
 * one — the config UI uses this to disable the Mesocycle bucket option.
 */
export async function activeMesocycleSpec(): Promise<
  MesocycleSpec | undefined
> {
  const plans = await db.plans.toArray();
  const active = plans.find((p) => p.active && p.mesocycle?.length);
  return active
    ? { anchor: active.created_at, weeks: active.mesocycle!.length }
    : undefined;
}

/** Loads, filters and aggregates the series behind one configured chart. */
export async function buildChartSeries(
  config: AnalyticsChartConfig,
  timeframe: Timeframe,
): Promise<ChartSeries> {
  const window = TIMEFRAME_WINDOW_MS[timeframe];
  // Source data is filtered BEFORE bucketing, so buckets that lose all their
  // data to the timeframe disappear entirely instead of lingering as zero bars.
  const cutoff = window === null ? -Infinity : Date.now() - window;
  const mesocycle =
    config.bucket === "mesocycle" ? await activeMesocycleSpec() : undefined;

  if (config.sourceKind === "measurement") {
    const typeId = config.measurementTypeId ?? "";
    const [type, entries] = await Promise.all([
      db.measurementTypes.get(typeId),
      db.measurementEntries.where("measurementTypeId").equals(typeId).toArray(),
    ]);
    const points = computeMeasurementSeries({
      entries: entries.filter((e) => e.timestamp >= cutoff),
      bucket: config.bucket,
      mesocycle,
    });
    return {
      points,
      valueKind: type ? CATEGORY_VALUE_KIND[type.category] : "count",
    };
  }

  const [workouts, exercises, bodyweightEntries] = await Promise.all([
    db.workouts.toArray(),
    db.exercises.toArray(),
    db.measurementEntries
      .where("measurementTypeId")
      .equals(BODYWEIGHT_TYPE_ID)
      .toArray(),
  ]);

  const scope: WorkoutScope =
    config.sourceKind === "global"
      ? { kind: "global" }
      : config.sourceKind === "muscle"
        ? { kind: "muscle", muscleGroup: config.muscleGroup ?? "" }
        : { kind: "exercise", exerciseId: config.exerciseId ?? "" };

  const points = computeWorkoutSeries({
    scope,
    // "value" only exists for the measurement source, handled above.
    metric: config.metric as WorkoutMetric,
    bucket: config.bucket,
    workouts: workouts.filter((w) => w.startTime >= cutoff),
    exercisesById: new Map(exercises.map((e) => [e.id, e])),
    // Bodyweight entries deliberately ignore the timeframe cutoff: a workout
    // inside the window may need a weigh-in logged before it.
    bodyweightEntries,
    mesocycle,
  });

  return {
    points,
    valueKind:
      config.metric === "volume" || config.metric === "e1rm"
        ? "weight"
        : "count",
  };
}
