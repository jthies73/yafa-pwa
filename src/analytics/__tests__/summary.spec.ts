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
  it("a perfectly-executed workout scores 100 with no deductions", () => {
    const a = computeWorkoutSummary(
      input([{ exerciseId: "ex1", sets: [set(), set(), set()] }], { ex1: 3 }),
    ).adherence;
    expect(a.score).toBe(100);
    expect(a.missingSets).toBe(0);
    expect(a.deductions).toEqual({
      rpe: 0,
      reps: 0,
      load: 0,
      missing: 0,
      trash: 0,
    });
  });

  it("missing prescribed sets cut the score proportionally", () => {
    // 2 of 4 prescribed sets done, both perfect → −50 → 50.
    const a = computeWorkoutSummary(
      input([{ exerciseId: "ex1", sets: [set(), set()] }], { ex1: 4 }),
    ).adherence;
    expect(a.missingSets).toBe(2);
    expect(a.deductions.missing).toBe(50);
    expect(a.score).toBe(50);
  });

  it("an entirely skipped exercise counts its planned sets as missing", () => {
    // ex1 done perfectly (planned 3); ex2 (planned 2) never logged → 2 missing of 5 total → −40.
    const a = computeWorkoutSummary(
      input([{ exerciseId: "ex1", sets: [set(), set(), set()] }], {
        ex1: 3,
        ex2: 2,
      }),
    ).adherence;
    expect(a.missingSets).toBe(2);
    expect(a.score).toBe(60);
  });

  it("deductions decompose the score exactly", () => {
    // 2 of 3 done: one perfect, one RPE 9 (overshoot 1 → 12, meaned over 2 = 6);
    // 1 missing of 3 total → 33. total 39 → score 61.
    const a = computeWorkoutSummary(
      input([{ exerciseId: "ex1", sets: [set(), set({ actualRpe: 9 })] }], {
        ex1: 3,
      }),
    ).adherence;
    const d = a.deductions;
    expect(d.rpe).toBe(6);
    expect(d.missing).toBe(33);
    expect(d.rpe + d.reps + d.load + d.missing + d.trash).toBe(100 - a.score);
    expect(a.score).toBe(61);
  });

  it("off-script extra sets add a capped trash penalty", () => {
    // 3 planned, 5 perfect logged → 2 extra → −10 trash.
    const a = computeWorkoutSummary(
      input(
        [{ exerciseId: "ex1", sets: [set(), set(), set(), set(), set()] }],
        {
          ex1: 3,
        },
      ),
    ).adherence;
    expect(a.extraSets).toBe(2);
    expect(a.deductions.trash).toBe(10);
    expect(a.score).toBe(90);
  });
});
