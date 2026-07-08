import type { AnalyticsBucket, Exercise, Workout } from "../db/types";
import { DEFAULT_RPE_MATRIX } from "../db/rpeMatrix";
import {
  bodyweightOffsetKg,
  liftSet,
  pickBodyweightAt,
} from "../engine/bodyweight";
import { impliedE1rm, isQualifyingSet } from "../engine/matrix";

// ----------------------------------------------
// Analytics data layer: fractional muscle coefficients, time bucketing and
// metric aggregation. Pure and persistence-free (mirrors engine/matrix.ts) so
// every formula is unit-testable without Dexie. Chart types, colors and
// tooltip text live in the presentation layer (presentation.ts + components).
// ----------------------------------------------

export type WorkoutMetric = "workouts" | "sets" | "reps" | "volume" | "e1rm";

export type WorkoutScope =
  | { kind: "global" }
  | { kind: "muscle"; muscleGroups: string[] } // folded together; each set counted once
  | { kind: "exercise"; exerciseId: string };

export type MuscleRole = "direct" | "indirect";

// ---- Fractional stimulus coefficients ----
//
// A working set stimulates every muscle it recruits, so the SAME set
// intentionally appears in MULTIPLE muscle charts at once: ×1.0 in the chart
// of each primary (target) muscle and ×0.5 in the chart of each secondary
// (synergist) muscle. This is NOT a double-counting bug — each muscle chart
// answers "how much stimulus did THIS muscle receive", which is exactly the
// per-muscle distribution of shared work. Systemic metrics stay undistorted
// because the Global scope applies a flat ×1.0 per set instead of summing the
// per-muscle splits.
export const DIRECT_MULTIPLIER = 1.0;
export const INDIRECT_MULTIPLIER = 0.5;

/** The active plan's mesocycle as a bucketing grid. */
export interface MesocycleSpec {
  anchor: number; // epoch ms where cycle 0 starts (the plan's created_at)
  weeks: number; // cycle length in weeks
}

export interface TimestampedValue {
  timestamp: number;
  value: number;
}

/** Per-exercise share of a bucket's metric — the tooltip's "full math". */
export interface BucketContribution {
  label: string; // exercise name
  role: MuscleRole;
  multiplier: number;
  sets: number; // raw set count (before the multiplier)
  value: number; // multiplier-weighted contribution to the bucket's metric
}

// The set behind an e1RM bucket's max. `weight` is the ADDED weight the user
// loaded; `bodyweightOffsetKg` (present when > 0) is the bodyweight share that
// was folded into the plotted e1RM — the tooltip renders the breakdown.
export interface BestSet {
  weight: number;
  reps: number;
  rpe?: number;
  bodyweightOffsetKg?: number;
}

export interface BucketPoint {
  key: string;
  start: number; // bucket start, epoch ms (sort key)
  label: string; // x-axis label
  value: number; // the metric value (direct + indirect for muscle scope)
  direct: number; // ×1.0 share (equals value outside muscle scope)
  indirect: number; // ×0.5 share (0 outside muscle scope)
  contributions: BucketContribution[];
  bestSet?: BestSet; // e1RM buckets only
  samples?: number; // measurement buckets: number of entries averaged
}

// ---- Time bucketing ----

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

const dayLabel = (ts: number): string =>
  new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

const monthLabel = (ts: number): string =>
  new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });

/** Start of the local calendar week (Monday 00:00) containing ts. */
export function weekStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

/** Start of the local calendar month containing ts. */
export function monthStart(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

interface BucketSlot {
  key: string;
  start: number;
  label: string;
}

/**
 * The bucket a point in time falls into. Buckets only ever materialize from
 * actual data, so periods without any qualifying data are OMITTED from a chart
 * instead of rendering as zero bars — a gap is "didn't train", which reads
 * honestly; a zero bar would claim a measured zero.
 */
function slotFor(
  bucket: AnalyticsBucket,
  ts: number,
  sessionKey: string,
  mesocycle?: MesocycleSpec,
): BucketSlot | null {
  switch (bucket) {
    case "session":
      return { key: `s:${sessionKey}`, start: ts, label: dayLabel(ts) };
    case "week": {
      const start = weekStart(ts);
      return { key: `w:${start}`, start, label: dayLabel(start) };
    }
    case "month": {
      const start = monthStart(ts);
      return { key: `m:${start}`, start, label: monthLabel(start) };
    }
    case "mesocycle": {
      // Without an active mesocycle there is no grid to bucket on; the config
      // UI disables the option, so this only happens for orphaned configs
      // (e.g. the plan was deleted) — they render as an empty chart.
      if (!mesocycle || mesocycle.weeks <= 0) return null;
      const cycleMs = mesocycle.weeks * WEEK_MS;
      const index = Math.floor((ts - mesocycle.anchor) / cycleMs);
      // Label is assigned in a post-pass (relabelMesocycles) once the earliest
      // charted cycle is known.
      return {
        key: `c:${index}`,
        start: mesocycle.anchor + index * cycleMs,
        label: "",
      };
    }
  }
}

/**
 * Number cycles relative to the earliest charted one ("Meso 1") while
 * preserving gaps: a cycle without data is omitted, not renumbered away.
 */
function relabelMesocycles(
  points: BucketPoint[],
  bucket: AnalyticsBucket,
): void {
  if (bucket !== "mesocycle" || !points.length) return;
  const indices = points.map((p) => Number(p.key.slice(2)));
  const min = Math.min(...indices);
  points.forEach((p, i) => (p.label = `Meso ${indices[i] - min + 1}`));
}

/** How (and whether) an exercise contributes to the given scope. */
function roleFor(
  scope: WorkoutScope,
  exercise: Exercise,
): { role: MuscleRole; multiplier: number } | null {
  switch (scope.kind) {
    case "global":
      // Global is the systemic view: a flat ×1.0 per set, NOT the sum of the
      // per-muscle splits — this is what keeps fractional per-muscle counting
      // from inflating systemic totals.
      return { role: "direct", multiplier: DIRECT_MULTIPLIER };
    case "exercise":
      return exercise.id === scope.exerciseId
        ? { role: "direct", multiplier: DIRECT_MULTIPLIER }
        : null;
    case "muscle":
      // Folded scope: an exercise resolves to ONE role across all selected
      // groups (so a set shared by two of them is still counted once). Primary
      // wins — direct if any selected group is a target, else indirect if any
      // is only a synergist.
      if (
        exercise.primaryMuscleGroups?.some((m) =>
          scope.muscleGroups.includes(m),
        )
      )
        return { role: "direct", multiplier: DIRECT_MULTIPLIER };
      if (
        exercise.secondaryMuscleGroups?.some((m) =>
          scope.muscleGroups.includes(m),
        )
      )
        return { role: "indirect", multiplier: INDIRECT_MULTIPLIER };
      return null;
  }
}

// ---- Aggregation ----

interface BucketAcc {
  slot: BucketSlot;
  workoutIds: Set<string>;
  contributions: Map<string, BucketContribution>;
  e1rmMax: number | null;
  bestSet?: BestSet;
}

export interface WorkoutSeriesOptions {
  scope: WorkoutScope;
  metric: WorkoutMetric;
  bucket: AnalyticsBucket;
  workouts: Workout[];
  exercisesById: Map<string, Exercise>;
  mesocycle?: MesocycleSpec;
  // All logged bodyweight entries (NOT timeframe-filtered — points before the
  // first entry fall back to the earliest). e1rm metric only: lifts each set
  // by its workout-time bodyweight share so plotted e1RMs are total-load.
  bodyweightEntries?: TimestampedValue[];
}

/** Buckets and aggregates one workout-derived metric into a chartable series. */
export function computeWorkoutSeries(
  opts: WorkoutSeriesOptions,
): BucketPoint[] {
  const buckets = new Map<string, BucketAcc>();
  const accFor = (slot: BucketSlot): BucketAcc => {
    let acc = buckets.get(slot.key);
    if (!acc) {
      acc = {
        slot,
        workoutIds: new Set(),
        contributions: new Map(),
        e1rmMax: null,
      };
      buckets.set(slot.key, acc);
    }
    return acc;
  };

  for (const workout of opts.workouts) {
    // All sets of a session land in the session's bucket (keyed off its start),
    // so a workout never straddles two weeks.
    const slot = slotFor(
      opts.bucket,
      workout.startTime,
      workout.id,
      opts.mesocycle,
    );
    if (!slot) continue;

    // Global session counting is unconditional — a logged session counts even
    // if an exercise was deleted from the library since.
    if (opts.metric === "workouts" && opts.scope.kind === "global") {
      accFor(slot).workoutIds.add(workout.id);
      continue;
    }

    const workoutBodyweight =
      opts.metric === "e1rm"
        ? pickBodyweightAt(opts.bodyweightEntries ?? [], workout.startTime)
        : undefined;

    for (const workoutExercise of workout.exercises) {
      const exercise = opts.exercisesById.get(workoutExercise.exerciseId);
      if (!exercise || !workoutExercise.sets.length) continue;
      const role = roleFor(opts.scope, exercise);
      if (!role) continue;

      const acc = accFor(slot);
      acc.workoutIds.add(workout.id);
      if (opts.metric === "workouts") continue; // only counting sessions

      if (opts.metric === "e1rm") {
        const matrix = exercise.rpeMatrix ?? DEFAULT_RPE_MATRIX;
        const offsetKg = bodyweightOffsetKg(
          exercise.bodyweightFactor,
          workoutBodyweight,
        );
        for (const set of workoutExercise.sets) {
          // Lift into total-load space first: qualifying and the implied e1RM
          // both work on added + bodyweight share (0-added bodyweight sets
          // qualify). The plotted value is the total-load e1RM.
          const lifted = liftSet(set, offsetKg);
          // Only honest near-limit sets (RPE ≥ 8, reps ≤ 10) imply a usable
          // e1RM; buckets without one are omitted, never interpolated.
          if (!isQualifyingSet(lifted)) continue;
          const e1rm = impliedE1rm(
            matrix,
            lifted.actualWeight,
            lifted.actualReps,
            lifted.actualRpe!,
          );
          // MAX, not mean: the peak estimated 1RM in a period is the
          // meaningful signal. Sessions mix top sets and back-offs at varying
          // intent — averaging their implied e1RMs has no interpretable
          // meaning, while the period's best honest set tracks capacity.
          if (acc.e1rmMax === null || e1rm > acc.e1rmMax) {
            acc.e1rmMax = e1rm;
            acc.bestSet = {
              weight: set.actualWeight, // ADDED weight, as the user loaded it
              reps: set.actualReps,
              rpe: set.actualRpe,
              ...(offsetKg > 0 ? { bodyweightOffsetKg: offsetKg } : {}),
            };
          }
        }
        continue;
      }

      // sets / reps / volume — accumulate the multiplier-weighted metric and
      // remember the per-exercise share for the tooltip breakdown.
      let value = 0;
      for (const set of workoutExercise.sets) {
        if (opts.metric === "sets") {
          value += role.multiplier;
        } else if (opts.metric === "reps") {
          value += set.actualReps * role.multiplier;
        } else {
          value += set.actualReps * set.actualWeight * role.multiplier;
        }
      }
      const key = `${exercise.name}|${role.role}`;
      const contribution = acc.contributions.get(key) ?? {
        label: exercise.name,
        role: role.role,
        multiplier: role.multiplier,
        sets: 0,
        value: 0,
      };
      contribution.sets += workoutExercise.sets.length;
      contribution.value += value;
      acc.contributions.set(key, contribution);
    }
  }

  const points: BucketPoint[] = [];
  for (const acc of buckets.values()) {
    // Omitted, never interpolated: a bucket exists only when it has data for
    // the metric.
    if (opts.metric === "e1rm" && acc.e1rmMax === null) continue;
    if (
      opts.metric !== "workouts" &&
      opts.metric !== "e1rm" &&
      acc.contributions.size === 0
    )
      continue;

    const contributions = [...acc.contributions.values()].sort(
      (a, b) => b.value - a.value,
    );
    const direct = contributions
      .filter((c) => c.role === "direct")
      .reduce((sum, c) => sum + c.value, 0);
    const indirect = contributions
      .filter((c) => c.role === "indirect")
      .reduce((sum, c) => sum + c.value, 0);

    const value =
      opts.metric === "workouts"
        ? acc.workoutIds.size
        : opts.metric === "e1rm"
          ? acc.e1rmMax!
          : direct + indirect;

    points.push({
      key: acc.slot.key,
      start: acc.slot.start,
      label: acc.slot.label,
      value,
      direct:
        opts.metric === "workouts" || opts.metric === "e1rm" ? value : direct,
      indirect:
        opts.metric === "workouts" || opts.metric === "e1rm" ? 0 : indirect,
      contributions,
      bestSet: acc.bestSet,
    });
  }

  points.sort((a, b) => a.start - b.start);
  relabelMesocycles(points, opts.bucket);
  return points;
}

export interface MeasurementSeriesOptions {
  entries: TimestampedValue[];
  bucket: AnalyticsBucket;
  mesocycle?: MesocycleSpec;
}

/**
 * Buckets measurement entries (bodyweight, BF%, …) into a chartable series.
 *
 * Measurements are logged on their own cadence, rarely aligned with training:
 * a Week/Month/Mesocycle bucket therefore shows the AVERAGE of all entries
 * inside it. Averaging — rather than first/last/closest — is what makes a
 * measurement overlay comparable with a workout chart bucketed on the same
 * grid: both then describe the period as a whole.
 */
export function computeMeasurementSeries(
  opts: MeasurementSeriesOptions,
): BucketPoint[] {
  const sorted = [...opts.entries].sort((a, b) => a.timestamp - b.timestamp);

  if (opts.bucket === "session") {
    // Finest granularity: every entry is its own point.
    return sorted.map((entry) => ({
      key: `e:${entry.timestamp}`,
      start: entry.timestamp,
      label: dayLabel(entry.timestamp),
      value: entry.value,
      direct: entry.value,
      indirect: 0,
      contributions: [],
      samples: 1,
    }));
  }

  const buckets = new Map<
    string,
    { slot: BucketSlot; sum: number; count: number }
  >();
  for (const entry of sorted) {
    const slot = slotFor(opts.bucket, entry.timestamp, "", opts.mesocycle);
    if (!slot) continue;
    const acc = buckets.get(slot.key) ?? { slot, sum: 0, count: 0 };
    acc.sum += entry.value;
    acc.count += 1;
    buckets.set(slot.key, acc);
  }

  const points: BucketPoint[] = [...buckets.values()].map((acc) => ({
    key: acc.slot.key,
    start: acc.slot.start,
    label: acc.slot.label,
    value: acc.sum / acc.count,
    direct: acc.sum / acc.count,
    indirect: 0,
    contributions: [],
    samples: acc.count,
  }));

  points.sort((a, b) => a.start - b.start);
  relabelMesocycles(points, opts.bucket);
  return points;
}
