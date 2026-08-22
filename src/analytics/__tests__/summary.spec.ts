import { describe, it, expect } from "vitest";
import type { Exercise, Set as LoggedSet, Workout } from "../../db/types";
import { computeWorkoutSummary, type SummaryInput } from "../summary";

// A "perfect" set by default — hits its target reps, weight and RPE (0 penalty).
let nextId = 0;
const set = (overrides: Partial<LoggedSet> = {}): LoggedSet => ({
  id: `set-${++nextId}`,
  timestamp: ++nextId,
  targetReps: 5,
  actualReps: 5,
  targetWeight: 100,
  actualWeight: 100,
  targetRpe: 8,
  actualRpe: 8,
  failure: false,
  ...overrides,
});

const workout = (
  exercises: { exerciseId: string; sets: LoggedSet[] }[],
): Workout => ({
  id: "w1",
  routineId: "r",
  startTime: 1000,
  endTime: 2000,
  exercises,
});

const input = (
  exercises: { exerciseId: string; sets: LoggedSet[] }[],
  plannedCounts: Record<string, number>,
): SummaryInput => ({
  workout: workout(exercises),
  history: [],
  exercisesById: new Map<string, Exercise>(), // empty → PR detection no-ops
  plannedCounts,
});

describe("computeWorkoutSummary — adherence", () => {
  const adherenceOf = (
    exercises: { exerciseId: string; sets: LoggedSet[] }[],
    plannedCounts: Record<string, number>,
  ) => computeWorkoutSummary(input(exercises, plannedCounts)).adherence;

  it("performing every prescribed set scores 100", () => {
    const a = adherenceOf(
      [{ exerciseId: "ex1", sets: [set(), set(), set()] }],
      {
        ex1: 3,
      },
    );
    expect(a.score).toBe(100);
    expect(a.prescribedSets).toBe(3);
    expect(a.completedSets).toBe(3);
    expect(a.missingSets).toBe(0);
  });

  it("the score is the share of prescribed sets performed", () => {
    // 2 of 4 prescribed sets done.
    const a = adherenceOf([{ exerciseId: "ex1", sets: [set(), set()] }], {
      ex1: 4,
    });
    expect(a.completedSets).toBe(2);
    expect(a.missingSets).toBe(2);
    expect(a.score).toBe(50);
  });

  it("rounds to a whole percent", () => {
    // 1 of 3 → 33.33… → 33.
    const a = adherenceOf([{ exerciseId: "ex1", sets: [set()] }], { ex1: 3 });
    expect(a.score).toBe(33);
  });

  it("an entirely skipped exercise counts its prescribed sets as missing", () => {
    // ex1 done (3 of 3); ex2 never logged (0 of 2) → 3 of 5.
    const a = adherenceOf(
      [{ exerciseId: "ex1", sets: [set(), set(), set()] }],
      {
        ex1: 3,
        ex2: 2,
      },
    );
    expect(a.missingSets).toBe(2);
    expect(a.score).toBe(60);
  });

  it("training harder than the target RPE costs nothing", () => {
    const a = adherenceOf(
      [
        {
          exerciseId: "ex1",
          sets: [set({ actualRpe: 10 }), set({ actualRpe: 10 }), set()],
        },
      ],
      { ex1: 3 },
    );
    expect(a.score).toBe(100);
  });

  it("reps and weight off the prescription cost nothing", () => {
    const a = adherenceOf(
      [
        {
          exerciseId: "ex1",
          sets: [set({ actualReps: 2 }), set({ actualWeight: 140 }), set()],
        },
      ],
      { ex1: 3 },
    );
    expect(a.score).toBe(100);
  });

  it("extra sets cost nothing and stay visible in the set counts", () => {
    // 3 prescribed, 5 logged.
    const summary = computeWorkoutSummary(
      input(
        [{ exerciseId: "ex1", sets: [set(), set(), set(), set(), set()] }],
        {
          ex1: 3,
        },
      ),
    );
    expect(summary.adherence.score).toBe(100);
    expect(summary.adherence.completedSets).toBe(3); // never exceeds prescribed
    expect(summary.sets.completed).toBe(5);
    expect(summary.sets.planned).toBe(3);
    expect(summary.sets.overshoot).toBe(true);
  });

  it("an off-script exercise neither helps nor hurts the score", () => {
    // ex2 was never prescribed; ex1 is half done.
    const a = adherenceOf(
      [
        { exerciseId: "ex1", sets: [set()] },
        { exerciseId: "ex2", sets: [set(), set(), set()] },
      ],
      { ex1: 2 },
    );
    expect(a.prescribedSets).toBe(2);
    expect(a.completedSets).toBe(1);
    expect(a.score).toBe(50);
  });

  it("a session with nothing prescribed scores 100", () => {
    const a = adherenceOf([{ exerciseId: "ex1", sets: [set()] }], {});
    expect(a.prescribedSets).toBe(0);
    expect(a.score).toBe(100);
  });
});

describe("computeWorkoutSummary — e1RM PRs with bodyweight factor", () => {
  const pullup: Exercise = {
    id: "pullup",
    name: "Pull Up",
    primaryMuscleGroups: ["Lats"],
    bodyweightFactor: 0.9,
    created_at: 0,
  };
  const exercisesById = new Map([[pullup.id, pullup]]);

  const historyWorkout = (
    startTime: number,
    sets: LoggedSet[],
    id: string,
  ): Workout => ({
    id,
    routineId: "r",
    startTime,
    exercises: [{ exerciseId: pullup.id, sets }],
  });

  it("PRs compare TOTAL loads, each session lifted by its own bodyweight", () => {
    // History: 15 kg added at bodyweight 90 → total 15 + 81 = 96.
    // Session: 20 kg added at bodyweight 80 → total 20 + 72 = 92 < 96: no PR
    // even though the ADDED weight rose.
    const summary = computeWorkoutSummary({
      workout: workout([
        {
          exerciseId: pullup.id,
          sets: [set({ actualWeight: 20, actualReps: 5, actualRpe: 8 })],
        },
      ]),
      history: [
        historyWorkout(
          500,
          [set({ actualWeight: 15, actualReps: 5, actualRpe: 8 })],
          "w0",
        ),
      ],
      exercisesById,
      plannedCounts: {},
      bodyweightEntries: [
        { timestamp: 400, value: 90 }, // in effect for the history session
        { timestamp: 900, value: 80 }, // in effect for the current session
      ],
    });
    expect(summary.prs.filter((p) => p.type === "e1rm")).toHaveLength(0);
  });

  it("reports the PR's weight as the ADDED weight the user loaded", () => {
    const summary = computeWorkoutSummary({
      workout: workout([
        {
          exerciseId: pullup.id,
          sets: [set({ actualWeight: 20, actualReps: 5, actualRpe: 8 })],
        },
      ]),
      history: [],
      exercisesById,
      plannedCounts: {},
      bodyweightEntries: [{ timestamp: 400, value: 80 }],
    });
    const pr = summary.prs.find((p) => p.type === "e1rm");
    expect(pr).toBeDefined();
    expect(pr!.weight).toBeCloseTo(20);
  });

  it("without bodyweight entries the detection matches pre-feature behavior", () => {
    const build = (
      bodyweightEntries?: { timestamp: number; value: number }[],
    ) =>
      computeWorkoutSummary({
        workout: workout([
          {
            exerciseId: pullup.id,
            sets: [set({ actualWeight: 20, actualReps: 5, actualRpe: 8 })],
          },
        ]),
        history: [
          historyWorkout(
            500,
            [set({ actualWeight: 15, actualReps: 5, actualRpe: 8 })],
            "w0",
          ),
        ],
        exercisesById,
        plannedCounts: {},
        bodyweightEntries,
      }).prs;
    expect(build([])).toEqual(build(undefined));
    // 20 kg added beats 15 kg added when no bodyweight is known (offset 0).
    expect(build([]).some((p) => p.type === "e1rm")).toBe(true);
  });
});
