import { describe, it, expect } from "vitest";
import { DEFAULT_RPE_MATRIX } from "../../db/rpeMatrix";
import type {
  DoubleProgressionParams,
  LinearProgressionParams,
  TopSetProgressionParams,
} from "../../db/types";
import { matrixPct, roundToLoadable, weightFromE1rm } from "../matrix";
import { solveReps } from "../calculator";
import { prescribeExercise } from "../prescription";

const M = DEFAULT_RPE_MATRIX;

const LINEAR: LinearProgressionParams = {
  targetSets: 3,
  targetReps: 5,
  targetRpe: 8,
  rpeCeiling: 9,
  weightIncrement: 2.5,
  incrementUnit: "kg",
  fatigueReduction: 0,
  fatigueReductionUnit: "kg",
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
    expect(p.c1rm).toBe(120);
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
    expect(p.c1rm).toBeNull();
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
    fatigueReduction: 0,
    fatigueReductionUnit: "kg",
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
    backOffRpe: 7,
    percentageDrop: 10,
    weightIncrement: 2.5,
    incrementUnit: "kg",
    fatigueReduction: 0,
    fatigueReductionUnit: "kg",
  };

  it("renders a top set plus dropped back-offs carrying the back-off RPE", () => {
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
    expect(p.sets[1].rpe).toBe(TOPSET.backOffRpe);
    expect(p.sets[1].weight).toBe(
      roundToLoadable((top.weight as number) * 0.9),
    );
  });

  it("derives back-off reps from the back-off RPE + drop (not a fixed count)", () => {
    const at = (backOffRpe: number) =>
      prescribeExercise({
        exerciseId: "ex",
        model: "topset_backoff",
        params: { ...TOPSET, backOffRpe },
        rpeCeiling: 9,
        effectiveC1rm: 120,
        matrix: M,
      }).sets[1].reps;

    // Exact: reps solved against the dropped %-of-1RM at the back-off RPE.
    const backPct =
      matrixPct(M, TOPSET.topSetTargetReps, TOPSET.topSetTargetRpe) * 0.9;
    expect(at(7)).toBe(solveReps(M, 1, backPct, 7));
    // Within the matrix domain, and higher target RPE → more reps at the same load.
    expect(at(7)).toBeGreaterThanOrEqual(1);
    expect(at(9)).toBeLessThanOrEqual(10);
    expect(at(9)).toBeGreaterThanOrEqual(at(7));
  });

  it("cold start: weights null but reps are still derived and the drop fraction carried", () => {
    const p = prescribeExercise({
      exerciseId: "ex",
      model: "topset_backoff",
      params: TOPSET,
      rpeCeiling: 9,
      effectiveC1rm: null,
      matrix: M,
    });
    expect(p.sets.every((s) => s.weight === null)).toBe(true);
    // Reps derive from the matrix ratio, so they render even without a c1RM.
    expect(p.sets[1].reps).toBeGreaterThanOrEqual(1);
    expect(p.sets[1].reps).toBe(p.sets[2].reps);
    // The fraction lets the tracker fill back-off weights once the cold-start
    // top set is logged (its demonstrated weight × fraction).
    expect(p.sets[1].backoffFraction).toBe(0.9);
    expect(p.sets[2].backoffFraction).toBe(0.9);
  });

  it("fatigue reduction renders every set from the reduced anchor", () => {
    const p = prescribeExercise({
      exerciseId: "ex",
      model: "topset_backoff",
      params: TOPSET,
      rpeCeiling: 9,
      effectiveC1rm: 120,
      fatigueReduction: 12,
      matrix: M,
    });
    const top = roundToLoadable(weightFromE1rm(M, 108, 5, 8));
    expect(p.sets[0].weight).toBe(top);
    expect(p.sets[1].weight).toBe(roundToLoadable(top * 0.9));
    // The reported anchor stays unreduced; the reduction is echoed alongside.
    expect(p.c1rm).toBe(120);
    expect(p.fatigueReduction).toBe(12);
  });
});

describe("prescribeExercise — fatigue reduction", () => {
  it("subtracts from the anchor before the matrix lookup (linear)", () => {
    const p = prescribeExercise({
      exerciseId: "ex",
      model: "linear",
      params: LINEAR,
      rpeCeiling: 9,
      effectiveC1rm: 120,
      fatigueReduction: 10,
      matrix: M,
    });
    expect(p.sets[0].weight).toBe(
      roundToLoadable(weightFromE1rm(M, 110, 5, 8)),
    );
    expect(p.c1rm).toBe(120);
    expect(p.fatigueReduction).toBe(10);
  });

  it("cold start ignores the reduction and does not echo it", () => {
    const p = prescribeExercise({
      exerciseId: "ex",
      model: "linear",
      params: LINEAR,
      rpeCeiling: 9,
      effectiveC1rm: null,
      fatigueReduction: 10,
      matrix: M,
    });
    expect(p.sets.every((s) => s.weight === null)).toBe(true);
    expect(p.fatigueReduction).toBeUndefined();
  });

  it("a reduction at/over the anchor clamps the load to 0, not negative", () => {
    const p = prescribeExercise({
      exerciseId: "ex",
      model: "linear",
      params: LINEAR,
      rpeCeiling: 9,
      effectiveC1rm: 100,
      fatigueReduction: 150,
      matrix: M,
    });
    expect(p.sets[0].weight).toBe(0);
  });

  it("absent/zero reduction leaves the prescription untouched", () => {
    const base = prescribeExercise({
      exerciseId: "ex",
      model: "linear",
      params: LINEAR,
      rpeCeiling: 9,
      effectiveC1rm: 120,
      matrix: M,
    });
    const zero = prescribeExercise({
      exerciseId: "ex",
      model: "linear",
      params: LINEAR,
      rpeCeiling: 9,
      effectiveC1rm: 120,
      fatigueReduction: 0,
      matrix: M,
    });
    expect(zero).toEqual(base);
    expect(zero.fatigueReduction).toBeUndefined();
  });
});
