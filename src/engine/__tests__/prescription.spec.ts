import { describe, it, expect } from "vitest";
import { DEFAULT_RPE_MATRIX } from "../../db/rpeMatrix";
import type {
  DoubleProgressionParams,
  LinearProgressionParams,
  TopSetProgressionParams,
} from "../../db/types";
import { roundToLoadable, weightFromE1rm } from "../matrix";
import { prescribeExercise } from "../prescription";

const M = DEFAULT_RPE_MATRIX;

const LINEAR: LinearProgressionParams = {
  targetSets: 3,
  targetReps: 5,
  targetRpe: 8,
  rpeCeiling: 9,
  weightIncrement: 2.5,
  incrementUnit: "kg",
};

describe("prescribeExercise — linear", () => {
  it("renders N straight sets at the matrix-derived weight", () => {
    const p = prescribeExercise({
      exerciseId: "ex",
      model: "linear",
      params: LINEAR,
      rpeCeiling: 9,
      effectiveC1rm: 120,
      matrix: M,
    });
    expect(p.sets).toHaveLength(3);
    expect(p.sets[0]).toEqual({
      reps: 5,
      rpe: 8,
      weight: roundToLoadable(weightFromE1rm(M, 120, 5, 8)),
      role: "straight",
    });
    expect(p.workingE1rm).toBe(120);
  });

  it("cold start: weight null, reps/rpe present", () => {
    const p = prescribeExercise({
      exerciseId: "ex",
      model: "linear",
      params: LINEAR,
      rpeCeiling: 9,
      effectiveC1rm: null,
      matrix: M,
    });
    expect(p.sets.every((s) => s.weight === null)).toBe(true);
    expect(p.sets[0].reps).toBe(5);
    expect(p.workingE1rm).toBeNull();
  });

  it("caps the load at the ceiling but keeps the displayed RPE at target", () => {
    const capped = prescribeExercise({
      exerciseId: "ex",
      model: "linear",
      params: { ...LINEAR, targetRpe: 9.5 },
      rpeCeiling: 9,
      effectiveC1rm: 120,
      matrix: M,
    });
    expect(capped.sets[0].rpe).toBe(9.5); // target shown
    expect(capped.sets[0].weight).toBe(
      roundToLoadable(weightFromE1rm(M, 120, 5, 9)), // load at the ceiling
    );
  });

  it("no cap when target is at/under the ceiling", () => {
    const p = prescribeExercise({
      exerciseId: "ex",
      model: "linear",
      params: LINEAR,
      rpeCeiling: 9,
      effectiveC1rm: 120,
      matrix: M,
    });
    expect(p.sets[0].weight).toBe(
      roundToLoadable(weightFromE1rm(M, 120, 5, 8)),
    );
  });
});

describe("prescribeExercise — double", () => {
  const DOUBLE: DoubleProgressionParams = {
    targetSets: 3,
    minReps: 6,
    maxReps: 10,
    targetRpe: 8,
    rpeCeiling: 9,
    weightIncrement: 2.5,
    incrementUnit: "kg",
  };

  it("shows the cursor reps but holds weight at maxReps", () => {
    const p = prescribeExercise({
      exerciseId: "ex",
      model: "double",
      params: DOUBLE,
      rpeCeiling: 9,
      effectiveC1rm: 100,
      doubleRepCursor: 7,
      matrix: M,
    });
    expect(p.sets[0].reps).toBe(7); // cursor
    expect(p.sets[0].weight).toBe(
      roundToLoadable(weightFromE1rm(M, 100, 10, 8)),
    );
  });

  it("weight is identical across cursor values (constant load cycle)", () => {
    const w = (cursor: number) =>
      prescribeExercise({
        exerciseId: "ex",
        model: "double",
        params: DOUBLE,
        rpeCeiling: 9,
        effectiveC1rm: 100,
        doubleRepCursor: cursor,
        matrix: M,
      }).sets[0].weight;
    expect(w(6)).toBe(w(10));
  });

  it("defaults the cursor to minReps when absent", () => {
    const p = prescribeExercise({
      exerciseId: "ex",
      model: "double",
      params: DOUBLE,
      rpeCeiling: 9,
      effectiveC1rm: 100,
      matrix: M,
    });
    expect(p.sets[0].reps).toBe(6);
  });
});

describe("prescribeExercise — top set", () => {
  const TOPSET: TopSetProgressionParams = {
    topSetTargetReps: 5,
    topSetTargetRpe: 8,
    rpeCeiling: 9,
    backOffSets: 2,
    backOffReps: 8,
    percentageDrop: 10,
    weightIncrement: 2.5,
    incrementUnit: "kg",
  };

  it("renders a top set plus dropped back-offs (rpe null)", () => {
    const p = prescribeExercise({
      exerciseId: "ex",
      model: "topset_backoff",
      params: TOPSET,
      rpeCeiling: 9,
      effectiveC1rm: 120,
      matrix: M,
    });
    expect(p.sets).toHaveLength(3);
    const top = p.sets[0];
    expect(top.role).toBe("top");
    expect(p.sets[1].role).toBe("backoff");
    expect(p.sets[1].rpe).toBeNull();
    expect(p.sets[1].weight).toBe(
      roundToLoadable((top.weight as number) * 0.9),
    );
  });

  it("cold start: all weights null", () => {
    const p = prescribeExercise({
      exerciseId: "ex",
      model: "topset_backoff",
      params: TOPSET,
      rpeCeiling: 9,
      effectiveC1rm: null,
      matrix: M,
    });
    expect(p.sets.every((s) => s.weight === null)).toBe(true);
  });
});
