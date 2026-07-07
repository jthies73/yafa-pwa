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
      rpe: { value: 0, exercises: [] },
      reps: { value: 0, exercises: [] },
      load: { value: 0, exercises: [] },
      missing: { value: 0, exercises: [] },
      trash: { value: 0, exercises: [] },
    });
  });

  it("missing prescribed sets cut the score proportionally", () => {
    // 2 of 4 prescribed sets done, both perfect → −50 → 50.
    const a = computeWorkoutSummary(
      input([{ exerciseId: "ex1", sets: [set(), set()] }], { ex1: 4 }),
    ).adherence;
    expect(a.missingSets).toBe(2);
    expect(a.deductions.missing.value).toBe(50);
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
    expect(d.rpe.value).toBe(6);
    expect(d.missing.value).toBe(33);
    expect(
      d.rpe.value +
        d.reps.value +
        d.load.value +
        d.missing.value +
        d.trash.value,
    ).toBe(100 - a.score);
    expect(a.score).toBe(61);
  });

  it("weight within the ±2.5 kg tolerance band costs nothing", () => {
    // Mirrors the engine: within the band the set is "at prescribed".
    const a = computeWorkoutSummary(
      input(
        [
          {
            exerciseId: "ex1",
            sets: [
              set({ actualWeight: 102.5 }),
              set({ actualWeight: 97.5 }),
              set(),
            ],
          },
        ],
        { ex1: 3 },
      ),
    ).adherence;
    expect(a.deductions.load.value).toBe(0);
    expect(a.score).toBe(100);
  });

  it("weight beyond the band is penalized on the full deviation", () => {
    // One set 10% off (110 vs 100) → 10 × 0.5 = 5, meaned over 3 sets ≈ 2.
    const a = computeWorkoutSummary(
      input(
        [
          {
            exerciseId: "ex1",
            sets: [set({ actualWeight: 110 }), set(), set()],
          },
        ],
        { ex1: 3 },
      ),
    ).adherence;
    expect(a.deductions.load.value).toBe(2);
    expect(a.score).toBe(98);
  });

  it("undershooting the target RPE costs nothing", () => {
    const a = computeWorkoutSummary(
      input(
        [
          {
            exerciseId: "ex1",
            sets: [set({ actualRpe: 6 }), set({ actualRpe: 7 }), set()],
          },
        ],
        { ex1: 3 },
      ),
    ).adherence;
    expect(a.deductions.rpe.value).toBe(0);
    expect(a.score).toBe(100);
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
    expect(a.deductions.trash.value).toBe(10);
    expect(a.score).toBe(90);
  });
});
