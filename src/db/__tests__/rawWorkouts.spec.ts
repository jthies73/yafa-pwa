import { describe, it, expect } from "vitest";
import {
  UNKNOWN_ROUTINE_ID,
  buildRawWorkouts,
  reconstructWorkoutsFromRaw,
  type RawWorkouts,
} from "../rawWorkouts";
import type { Exercise, Set as WorkoutSet, Workout } from "../types";

const ex = (id: string, name: string): Exercise => ({
  id,
  name,
  primaryMuscleGroups: [],
  created_at: 0,
});

const wset = (over: Partial<WorkoutSet>): WorkoutSet => ({
  id: "s",
  timestamp: 0,
  targetReps: 0,
  actualReps: 0,
  targetWeight: 0,
  actualWeight: 0,
  failure: false,
  ...over,
});

// Counter-based id factory + TZ-free day key (floor(ts/100)) keep tests deterministic.
const counter = () => {
  let n = 0;
  return () => `id${++n}`;
};
const dayKey = (ts: number) => String(Math.floor(ts / 100));

describe("buildRawWorkouts", () => {
  it("maps actual* fields, omits rpe when absent, and skips unnamed exercises", () => {
    const workout: Workout = {
      id: "w1",
      routineId: "r1",
      startTime: 100,
      exercises: [
        {
          exerciseId: "ex-bench",
          sets: [
            wset({
              timestamp: 101,
              actualReps: 5,
              actualWeight: 100,
              actualRpe: 8,
            }),
            wset({ timestamp: 102, actualReps: 5, actualWeight: 100 }), // no rpe
          ],
        },
        // exerciseId not in the map → can't be named → skipped entirely
        {
          exerciseId: "ghost",
          sets: [wset({ timestamp: 103, actualReps: 1, actualWeight: 1 })],
        },
      ],
    };
    const raw = buildRawWorkouts(
      [workout],
      new Map([["ex-bench", ex("ex-bench", "Bench Press")]]),
    );

    expect(Object.keys(raw)).toEqual(["Bench Press"]);
    expect(raw["Bench Press"][0]).toEqual({
      timestamp: 101,
      reps: 5,
      weight: 100,
      rpe: 8,
    });
    expect(raw["Bench Press"][1]).toEqual({
      timestamp: 102,
      reps: 5,
      weight: 100,
    });
    expect("rpe" in raw["Bench Press"][1]).toBe(false);
  });

  it("returns {} for no workouts", () => {
    expect(buildRawWorkouts([], new Map())).toEqual({});
  });
});

describe("reconstructWorkoutsFromRaw", () => {
  const raw: RawWorkouts = {
    "Bench Press": [
      { timestamp: 101, reps: 5, weight: 100, rpe: 8 },
      { timestamp: 102, reps: 5, weight: 100 }, // no rpe
    ],
    Squat: [
      { timestamp: 150, reps: 3, weight: 140, rpe: 9 }, // same day as bench
      { timestamp: 205, reps: 3, weight: 145 }, // next day
    ],
  };

  it("groups by day, merges exercises within a day, and dedups exercises by name", () => {
    const { exercisesToAdd, workoutsToPut } = reconstructWorkoutsFromRaw({
      raw,
      existingExercises: [ex("ex-bench", " bench PRESS ")], // matched by normalized name
      existingWorkouts: [],
      routineId: UNKNOWN_ROUTINE_ID,
      now: 0,
      newId: counter(),
      dayKey,
    });

    // Only Squat is new (Bench matched the existing exercise by normalized name).
    expect(exercisesToAdd).toHaveLength(1);
    expect(exercisesToAdd[0].name).toBe("Squat");
    expect(exercisesToAdd[0].primaryMuscleGroups).toEqual([]);

    // Two days → two workouts, ascending.
    expect(workoutsToPut).toHaveLength(2);

    const day1 = workoutsToPut[0];
    expect(day1.routineId).toBe(UNKNOWN_ROUTINE_ID);
    expect(day1.startTime).toBe(101);
    expect(day1.endTime).toBe(150);
    expect(day1.exercises).toHaveLength(2); // bench + squat same day

    const bench = day1.exercises.find((e) => e.exerciseId === "ex-bench")!;
    expect(bench.sets).toHaveLength(2);
    expect(bench.sets[0]).toMatchObject({
      timestamp: 101,
      targetReps: 5,
      actualReps: 5,
      targetWeight: 100,
      actualWeight: 100,
      targetRpe: 8,
      actualRpe: 8,
      failure: false,
    });
    expect("actualRpe" in bench.sets[1]).toBe(false); // rpe omitted carries through

    const day2 = workoutsToPut[1];
    expect(day2.startTime).toBe(205);
    expect(day2.endTime).toBe(205);
    expect(day2.exercises).toHaveLength(1);
  });

  it("is idempotent: skips days already on the imported routine", () => {
    const existingWorkouts: Workout[] = [
      {
        id: "w1",
        routineId: UNKNOWN_ROUTINE_ID,
        startTime: 120,
        endTime: 160,
        exercises: [],
      }, // day "1"
      {
        id: "w2",
        routineId: UNKNOWN_ROUTINE_ID,
        startTime: 205,
        endTime: 205,
        exercises: [],
      }, // day "2"
    ];
    const { exercisesToAdd, workoutsToPut } = reconstructWorkoutsFromRaw({
      raw,
      existingExercises: [
        ex("ex-bench", "Bench Press"),
        ex("ex-squat", "Squat"),
      ],
      existingWorkouts,
      routineId: UNKNOWN_ROUTINE_ID,
      now: 0,
      newId: counter(),
      dayKey,
    });
    expect(exercisesToAdd).toEqual([]);
    expect(workoutsToPut).toEqual([]);
  });
});
