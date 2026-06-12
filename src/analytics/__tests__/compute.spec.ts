import { describe, it, expect } from "vitest";
import type { Exercise, Set as LoggedSet, Workout } from "../../db/types";
import { DEFAULT_RPE_MATRIX } from "../../db/rpeMatrix";
import { impliedE1rm } from "../../engine/matrix";
import {
  bodyweightAt,
  computeMeasurementSeries,
  computeWorkoutSeries,
  weekStart,
} from "../compute";

// Fixed local dates: Tue Jan 6 / Thu Jan 8 2026 share a Monday-start week;
// Tue Jan 13 falls in the next one.
const TUE = new Date(2026, 0, 6, 10).getTime();
const THU = new Date(2026, 0, 8, 10).getTime();
const NEXT_TUE = new Date(2026, 0, 13, 10).getTime();

let nextId = 0;
const uid = (prefix: string) => `${prefix}-${++nextId}`;

const makeExercise = (overrides: Partial<Exercise> = {}): Exercise => ({
  id: uid("ex"),
  name: "Exercise",
  primaryMuscleGroups: ["Chest"],
  bodyweightFactor: 0,
  created_at: 0,
  ...overrides,
});

const makeSet = (overrides: Partial<LoggedSet> = {}): LoggedSet => ({
  id: uid("set"),
  timestamp: TUE,
  targetReps: 10,
  actualReps: 10,
  targetWeight: 100,
  actualWeight: 100,
  failure: false,
  ...overrides,
});

const makeWorkout = (
  startTime: number,
  exercises: { exerciseId: string; sets: LoggedSet[] }[],
): Workout => ({ id: uid("w"), routineId: "r1", startTime, exercises });

const byId = (...exercises: Exercise[]) =>
  new Map(exercises.map((e) => [e.id, e]));

describe("fractional coefficient application", () => {
  const bench = makeExercise({
    name: "Bench Press",
    primaryMuscleGroups: ["Chest"],
    secondaryMuscleGroups: ["Triceps"],
  });
  const pushdown = makeExercise({
    name: "Triceps Pushdown",
    primaryMuscleGroups: ["Triceps"],
  });
  // 4 bench sets of 10 × 100 kg, 4 pushdown sets of 10 × 50 kg, one session.
  const workouts = [
    makeWorkout(TUE, [
      {
        exerciseId: bench.id,
        sets: Array.from({ length: 4 }, () => makeSet()),
      },
      {
        exerciseId: pushdown.id,
        sets: Array.from({ length: 4 }, () => makeSet({ actualWeight: 50 })),
      },
    ]),
  ];
  const exercisesById = byId(bench, pushdown);

  it("splits a compound's sets into ×1.0 direct and ×0.5 indirect per muscle chart", () => {
    const chest = computeWorkoutSeries({
      scope: { kind: "muscle", muscleGroup: "Chest" },
      metric: "sets",
      bucket: "session",
      workouts,
      exercisesById,
    });
    expect(chest).toHaveLength(1);
    expect(chest[0].direct).toBe(4); // bench ×1.0
    expect(chest[0].indirect).toBe(0);
    expect(chest[0].value).toBe(4);

    // The SAME bench sets appear again in the triceps chart — as indirect.
    const triceps = computeWorkoutSeries({
      scope: { kind: "muscle", muscleGroup: "Triceps" },
      metric: "sets",
      bucket: "session",
      workouts,
      exercisesById,
    });
    expect(triceps).toHaveLength(1);
    expect(triceps[0].direct).toBe(4); // pushdown ×1.0
    expect(triceps[0].indirect).toBe(2); // bench 4 sets ×0.5
    expect(triceps[0].value).toBe(6);
  });

  it("weights reps and volume by the same multipliers", () => {
    const triceps = (metric: "reps" | "volume") =>
      computeWorkoutSeries({
        scope: { kind: "muscle", muscleGroup: "Triceps" },
        metric,
        bucket: "session",
        workouts,
        exercisesById,
      })[0];
    expect(triceps("reps").value).toBe(40 + 40 * 0.5); // pushdown + bench×0.5
    expect(triceps("volume").value).toBe(4 * 10 * 50 + 4 * 10 * 100 * 0.5);
  });

  it("keeps the global scope flat ×1.0 so secondary muscles never inflate systemic totals", () => {
    const global = computeWorkoutSeries({
      scope: { kind: "global" },
      metric: "volume",
      bucket: "session",
      workouts,
      exercisesById,
    });
    expect(global[0].value).toBe(4 * 10 * 100 + 4 * 10 * 50);
  });

  it("exposes the per-exercise breakdown behind each bucket", () => {
    const [point] = computeWorkoutSeries({
      scope: { kind: "muscle", muscleGroup: "Triceps" },
      metric: "sets",
      bucket: "session",
      workouts,
      exercisesById,
    });
    expect(point.contributions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Triceps Pushdown",
          role: "direct",
          multiplier: 1,
          sets: 4,
          value: 4,
        }),
        expect.objectContaining({
          label: "Bench Press",
          role: "indirect",
          multiplier: 0.5,
          sets: 4,
          value: 2,
        }),
      ]),
    );
  });
});

describe("e1RM bucketing", () => {
  const bench = makeExercise({ name: "Bench Press" });
  const exercisesById = byId(bench);

  it("uses max, not mean, across a multi-session week", () => {
    const workouts = [
      makeWorkout(TUE, [
        {
          exerciseId: bench.id,
          sets: [makeSet({ actualWeight: 100, actualReps: 5, actualRpe: 9 })],
        },
      ]),
      makeWorkout(THU, [
        {
          exerciseId: bench.id,
          sets: [
            makeSet({ actualWeight: 105, actualReps: 5, actualRpe: 9 }),
            // Heavier but below the qualifying RPE — must not count.
            makeSet({ actualWeight: 110, actualReps: 5, actualRpe: 7 }),
          ],
        },
      ]),
    ];
    const points = computeWorkoutSeries({
      scope: { kind: "exercise", exerciseId: bench.id },
      metric: "e1rm",
      bucket: "week",
      workouts,
      exercisesById,
    });
    expect(points).toHaveLength(1);

    const low = impliedE1rm(DEFAULT_RPE_MATRIX, 100, 5, 9);
    const high = impliedE1rm(DEFAULT_RPE_MATRIX, 105, 5, 9);
    expect(points[0].value).toBeCloseTo(high);
    expect(points[0].value).not.toBeCloseTo((low + high) / 2);
    expect(points[0].bestSet).toEqual({ weight: 105, reps: 5, rpe: 9 });
  });

  it("omits buckets without a qualifying set instead of interpolating", () => {
    const workouts = [
      makeWorkout(TUE, [
        {
          exerciseId: bench.id,
          // RPE 7 and 12 reps: neither set qualifies (rpe ≥ 8, reps ≤ 10).
          sets: [
            makeSet({ actualRpe: 7 }),
            makeSet({ actualReps: 12, actualRpe: 9 }),
          ],
        },
      ]),
      makeWorkout(NEXT_TUE, [
        {
          exerciseId: bench.id,
          sets: [makeSet({ actualWeight: 100, actualReps: 5, actualRpe: 9 })],
        },
      ]),
    ];
    const points = computeWorkoutSeries({
      scope: { kind: "exercise", exerciseId: bench.id },
      metric: "e1rm",
      bucket: "week",
      workouts,
      exercisesById,
    });
    expect(points).toHaveLength(1);
    expect(points[0].start).toBe(weekStart(NEXT_TUE));
  });
});

describe("measurement bucket alignment", () => {
  it("averages all entries inside a time bucket", () => {
    const points = computeMeasurementSeries({
      entries: [
        { timestamp: TUE, value: 80 },
        { timestamp: THU, value: 82 },
        { timestamp: NEXT_TUE, value: 90 },
      ],
      bucket: "week",
    });
    expect(points).toHaveLength(2);
    expect(points[0]).toMatchObject({
      start: weekStart(TUE),
      value: 81,
      samples: 2,
    });
    expect(points[1]).toMatchObject({
      start: weekStart(NEXT_TUE),
      value: 90,
      samples: 1,
    });
  });

  it("keeps every entry as its own point at session granularity", () => {
    const points = computeMeasurementSeries({
      entries: [
        { timestamp: THU, value: 82 },
        { timestamp: TUE, value: 80 },
      ],
      bucket: "session",
    });
    expect(points.map((p) => p.value)).toEqual([80, 82]);
  });
});

describe("workout counting", () => {
  const bench = makeExercise({
    name: "Bench Press",
    primaryMuscleGroups: ["Chest"],
    secondaryMuscleGroups: ["Triceps"],
  });
  const squat = makeExercise({
    name: "Squat",
    primaryMuscleGroups: ["Quads"],
  });
  const exercisesById = byId(bench, squat);
  const workouts = [
    makeWorkout(TUE, [{ exerciseId: bench.id, sets: [makeSet()] }]),
    makeWorkout(THU, [
      { exerciseId: bench.id, sets: [makeSet()] },
      { exerciseId: squat.id, sets: [makeSet()] },
    ]),
    makeWorkout(NEXT_TUE, [{ exerciseId: squat.id, sets: [makeSet()] }]),
  ];

  const count = (
    scope: Parameters<typeof computeWorkoutSeries>[0]["scope"],
  ): number =>
    computeWorkoutSeries({
      scope,
      metric: "workouts",
      bucket: "month",
      workouts,
      exercisesById,
    }).reduce((sum, p) => sum + p.value, 0);

  it("counts unique sessions for all three scope kinds", () => {
    expect(count({ kind: "global" })).toBe(3);
    expect(count({ kind: "muscle", muscleGroup: "Chest" })).toBe(2);
    expect(count({ kind: "exercise", exerciseId: squat.id })).toBe(2);
  });

  it("never counts a session twice when an exercise fills multiple slots", () => {
    const doubled = [
      makeWorkout(TUE, [
        { exerciseId: bench.id, sets: [makeSet()] },
        { exerciseId: bench.id, sets: [makeSet()] },
      ]),
    ];
    const points = computeWorkoutSeries({
      scope: { kind: "exercise", exerciseId: bench.id },
      metric: "workouts",
      bucket: "month",
      workouts: doubled,
      exercisesById,
    });
    expect(points[0].value).toBe(1);
  });
});

describe("bodyweight exercise volume", () => {
  const pullup = makeExercise({
    name: "Pull Up",
    primaryMuscleGroups: ["Lats"],
    bodyweightFactor: 1,
  });
  const exercisesById = byId(pullup);
  const workouts = [
    makeWorkout(TUE, [
      {
        exerciseId: pullup.id,
        sets: [makeSet({ actualWeight: 10, actualReps: 5 })],
      },
    ]),
  ];

  it("folds the bodyweight on record into the moved load", () => {
    const points = computeWorkoutSeries({
      scope: { kind: "exercise", exerciseId: pullup.id },
      metric: "volume",
      bucket: "session",
      workouts,
      exercisesById,
      bodyweightEntries: [{ timestamp: TUE - 1000, value: 80 }],
    });
    expect(points[0].value).toBe((10 + 80) * 5);
  });

  it("yields zero volume without a bodyweight, while sets and reps still count", () => {
    const base = {
      scope: { kind: "exercise", exerciseId: pullup.id } as const,
      bucket: "session" as const,
      workouts,
      exercisesById,
    };
    expect(computeWorkoutSeries({ ...base, metric: "volume" })[0].value).toBe(
      0,
    );
    expect(computeWorkoutSeries({ ...base, metric: "sets" })[0].value).toBe(1);
    expect(computeWorkoutSeries({ ...base, metric: "reps" })[0].value).toBe(5);
  });

  it("backfills workouts logged before the first weigh-in from the earliest entry", () => {
    expect(bodyweightAt([{ timestamp: TUE, value: 80 }], TUE - 1000)).toBe(80);
    expect(
      bodyweightAt(
        [
          { timestamp: TUE, value: 80 },
          { timestamp: THU, value: 82 },
        ],
        NEXT_TUE,
      ),
    ).toBe(82);
  });
});
