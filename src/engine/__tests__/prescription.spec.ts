import { describe, it, expect } from "vitest";
import { DEFAULT_RPE_MATRIX } from "../../db/rpeMatrix";
import type { ProgressionState, RoutineExerciseConfig } from "../../db/types";
import { prescribeExercise } from "../prescription";
import { freshDeload } from "../deload";

const makeState = (
  overrides: Partial<ProgressionState> = {},
): ProgressionState => ({
  exerciseId: "ex",
  e1rm: 100,
  trend: [],
  failureStreak: 0,
  deload: null,
  lastWorkoutId: null,
  contentHash: "",
  updated_at: 0,
  ...overrides,
});

describe("prescription pipeline", () => {
  it("derives top set and back-offs from the working e1RM via the matrix", () => {
    const config: RoutineExerciseConfig = {
      progressionModel: "topset_backoff",
      progressionParams: {
        topSetTargetReps: 5,
        topSetTargetRpe: 9,
        backOffSets: 3,
        percentageDrop: 10,
        weightIncrement: 2.5,
      },
    };
    const { sets } = prescribeExercise({
      exerciseId: "ex",
      config,
      state: makeState(),
      matrix: DEFAULT_RPE_MATRIX,
    });
    // 100 × matrix[5][9] (0.82) = 82 → loadable 82.5; back-off −10% → 74.25 → 75.
    expect(sets).toHaveLength(4);
    expect(sets[0]).toEqual({ reps: 5, rpe: 9, weight: 82.5, role: "top" });
    expect(sets[1]).toEqual({
      reps: 5,
      rpe: null,
      weight: 75,
      role: "backoff",
    });
  });

  it("applies deload multipliers only to unlocked fields, with clamps", () => {
    const config: RoutineExerciseConfig = {
      progressionModel: "linear",
      progressionParams: {
        targetSets: 3,
        targetReps: 5,
        targetRpe: 8,
        weightIncrement: 2.5,
      },
      lockedFields: ["targetReps"],
    };
    const { sets } = prescribeExercise({
      exerciseId: "ex",
      config,
      state: makeState(),
      matrix: DEFAULT_RPE_MATRIX,
      week: { focus: "deload" },
    });
    // volume ×0.5: sets 3→2 (reps locked at 5); intensity ×0.85: RPE 6.8→7.
    expect(sets).toHaveLength(2);
    expect(sets[0].reps).toBe(5);
    expect(sets[0].rpe).toBe(7);
  });

  it("never prescribes below one set and never above RPE 10", () => {
    const config: RoutineExerciseConfig = {
      progressionModel: "linear",
      progressionParams: {
        targetSets: 1,
        targetReps: 5,
        targetRpe: 9.5,
        weightIncrement: 2.5,
      },
    };
    const deload = prescribeExercise({
      exerciseId: "ex",
      config,
      state: makeState(),
      matrix: DEFAULT_RPE_MATRIX,
      week: { focus: "deload" },
    });
    expect(deload.sets).toHaveLength(1);

    const peaking = prescribeExercise({
      exerciseId: "ex",
      config,
      state: makeState(),
      matrix: DEFAULT_RPE_MATRIX,
      week: { focus: "peaking" },
    });
    expect(peaking.sets[0].rpe).toBe(10); // 9.5 × 1.05 snapped and capped
  });

  it("a fresh deload reduces prescribed weight for double progression", () => {
    const config: RoutineExerciseConfig = {
      progressionModel: "double",
      progressionParams: {
        targetSets: 3,
        minReps: 8,
        maxReps: 12,
        weightIncrement: 2.5,
      },
    };
    const baseline = prescribeExercise({
      exerciseId: "ex",
      config,
      state: makeState({ currentTargetReps: 10 }),
      matrix: DEFAULT_RPE_MATRIX,
    });
    const withReset = prescribeExercise({
      exerciseId: "ex",
      config,
      state: makeState({
        currentTargetReps: 10,
        deload: freshDeload(100),
      }),
      matrix: DEFAULT_RPE_MATRIX,
    });
    // A fresh deload at full strength tapers the intensity (RPE) target, so the
    // prescribed weight should be lower than the baseline.
    expect(withReset.sets[0].weight).toBeLessThan(baseline.sets[0].weight!);
  });

  it("prescribes structure but no weight before a working e1RM is seeded", () => {
    const config: RoutineExerciseConfig = {
      progressionModel: "linear",
      progressionParams: {
        targetSets: 3,
        targetReps: 5,
        targetRpe: 8,
        weightIncrement: 2.5,
      },
    };
    const { sets, workingE1rm } = prescribeExercise({
      exerciseId: "ex",
      config,
      matrix: DEFAULT_RPE_MATRIX,
    });
    expect(workingE1rm).toBeNull();
    expect(sets).toHaveLength(3);
    expect(sets[0].weight).toBeNull();
    expect(sets[0].reps).toBe(5);
  });
});
