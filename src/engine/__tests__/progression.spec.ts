import { describe, it, expect } from "vitest";
import type {
  DoubleProgressionParams,
  ProgressionState,
  Set as LoggedSet,
} from "../../db/types";
import { evaluateDouble, evaluateLinear, evaluateTopSet } from "../progression";

let setSeq = 0;
const makeSet = (
  actualReps: number,
  targetReps: number,
  actualRpe?: number,
  targetRpe?: number,
  actualWeight = 100,
  targetWeight = 100,
): LoggedSet => ({
  id: `set-${++setSeq}`,
  timestamp: setSeq,
  targetReps,
  actualReps,
  targetWeight,
  actualWeight,
  targetRpe,
  actualRpe,
  failure: false,
});

// Shorthand: set where actual === target (clean hit)
const hitSet = (reps: number, rpe?: number, weight = 100) =>
  makeSet(reps, reps, rpe, rpe, weight, weight);

// Shorthand: set where reps and RPE are both off at the prescribed weight
const failSet = (
  actualReps: number,
  targetReps: number,
  actualRpe: number,
  targetRpe: number,
  weight = 100,
) => makeSet(actualReps, targetReps, actualRpe, targetRpe, weight, weight);

const doubleState = (currentTargetReps?: number): ProgressionState => ({
  exerciseId: "ex",
  e1rm: 100,
  trend: [],
  failureStreak: 0,
  currentTargetReps,
  deload: null,
  lastWorkoutId: null,
  contentHash: "",
  updated_at: 0,
});

describe("evaluateLinear — set failure condition", () => {
  it("fails only when reps short AND RPE over AND weight matches", () => {
    expect(evaluateLinear([failSet(4, 5, 9, 8)])).toBe("failure");
  });

  it("success when reps short but RPE on target", () => {
    expect(evaluateLinear([makeSet(4, 5, 8, 8)])).toBe("success");
  });

  it("success when reps short but RPE not supplied", () => {
    expect(evaluateLinear([makeSet(4, 5)])).toBe("success");
  });

  it("success when reps short and RPE over but weight was changed", () => {
    // Actual weight differs from target → the set is an intentional adjustment.
    expect(evaluateLinear([makeSet(4, 5, 9, 8, 97.5, 100)])).toBe("success");
  });

  it("success when reps met even if RPE is high", () => {
    expect(evaluateLinear([hitSet(5, 9.5)])).toBe("success");
  });

  it("success on empty set list", () => {
    expect(evaluateLinear([])).toBe("success");
  });
});

describe("evaluateTopSet", () => {
  it("only the top set (first) drives the outcome — back-off failures ignored", () => {
    const sets = [hitSet(5, 8), failSet(2, 5, 10, 8), failSet(1, 5, 10, 8)];
    expect(evaluateTopSet(sets)).toBe("success");
  });

  it("a failed top set is a failure regardless of back-offs", () => {
    const sets = [failSet(4, 5, 9, 8), hitSet(5, 8)];
    expect(evaluateTopSet(sets)).toBe("failure");
  });

  it("success on empty set list", () => {
    expect(evaluateTopSet([])).toBe("success");
  });
});

describe("evaluateDouble", () => {
  const params: DoubleProgressionParams = {
    targetSets: 3,
    minReps: 8,
    maxReps: 12,
    weightIncrement: 2.5,
  };

  it("hitting maxReps on every set flags weight progress and restarts at minReps", () => {
    const sets = [hitSet(12, 9, 50), hitSet(12, 9, 50), hitSet(13, 9.5, 50)];
    const evaluation = evaluateDouble(params, doubleState(12), sets);
    expect(evaluation.weightProgressed).toBe(true);
    expect(evaluation.nextTargetReps).toBe(8);
  });

  it("advances the rep target from the worst set, never backwards", () => {
    const advancing = evaluateDouble(params, doubleState(9), [
      makeSet(10, 10, undefined, undefined, 50),
      makeSet(9, 9, undefined, undefined, 50),
    ]);
    expect(advancing.weightProgressed).toBe(false);
    expect(advancing.nextTargetReps).toBe(10);

    const badDay = evaluateDouble(params, doubleState(11), [
      makeSet(7, 7, undefined, undefined, 50),
    ]);
    expect(badDay.nextTargetReps).toBe(11); // never moves backward
  });

  it("reports failure when a set is short on reps and over on RPE", () => {
    const evaluation = evaluateDouble(params, doubleState(8), [
      failSet(7, 8, 9, 8, 50),
    ]);
    expect(evaluation.outcome).toBe("failure");
    expect(evaluation.weightProgressed).toBe(false);
  });
});
