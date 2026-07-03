import { describe, it, expect } from "vitest";
import type {
  DoubleProgressionParams,
  LinearProgressionParams,
  ProgressionState,
  Set as LoggedSet,
} from "../../db/types";
import { DEFAULT_RPE_MATRIX } from "../../db/rpeMatrix";
import { impliedE1rm, matrixPct } from "../matrix";
import {
  advanceDoubleCursor,
  applyIncrement,
  applyReset,
  catchUpC1rm,
  consumeReset,
  corroboratedE1rm,
  initState,
  liveEffectiveE1rm,
  seedC1rm,
  step,
} from "../state";

const LINEAR_KG: LinearProgressionParams = {
  targetSets: 3,
  targetReps: 5,
  targetRpe: 8,
  rpeCeiling: 9,
  weightIncrement: 2.5,
  incrementUnit: "kg",
  fatigueReduction: 0,
  fatigueReductionUnit: "kg",
};
const LINEAR_PCT: LinearProgressionParams = {
  ...LINEAR_KG,
  weightIncrement: 2.5,
  incrementUnit: "percent",
};
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

const base = (overrides: Partial<ProgressionState> = {}): ProgressionState => ({
  ...initState("ex", 0),
  c1rm: 100,
  ...overrides,
});

describe("applyIncrement", () => {
  it("adds a flat amount in kg mode", () => {
    expect(applyIncrement(100, LINEAR_KG)).toBe(102.5);
  });

  it("adds a percent of the current c1RM in percent mode", () => {
    expect(applyIncrement(100, LINEAR_PCT)).toBeCloseTo(102.5, 6);
    expect(applyIncrement(200, LINEAR_PCT)).toBeCloseTo(205, 6); // proves %-of-c1RM, not flat
  });

  it("compounds across successive percent gains (unrounded)", () => {
    const a = applyIncrement(100, LINEAR_PCT);
    const b = applyIncrement(a, LINEAR_PCT);
    expect(b).toBeCloseTo(105.0625, 6);
  });
});

describe("applyReset / consumeReset", () => {
  it("applyReset drops 10%", () => {
    expect(applyReset(100)).toBeCloseTo(90, 6);
  });

  it("consumeReset drops c1RM, clears flag + streak", () => {
    const out = consumeReset(
      base({ resetPending: true, regressionStreak: 3 }),
      5,
    );
    expect(out.c1rm).toBeCloseTo(90, 6);
    expect(out.resetPending).toBe(false);
    expect(out.regressionStreak).toBe(0);
  });

  it("is a no-op without a pending reset", () => {
    const s = base({ resetPending: false });
    expect(consumeReset(s, 5)).toBe(s);
  });

  it("is null-safe at cold start", () => {
    const out = consumeReset(base({ c1rm: null, resetPending: true }), 5);
    expect(out.c1rm).toBeNull();
    expect(out.resetPending).toBe(false);
  });
});

describe("seedC1rm", () => {
  it("seeds when null, no-ops when already set", () => {
    expect(seedC1rm(base({ c1rm: null }), 120, 1).c1rm).toBe(120);
    expect(seedC1rm(base({ c1rm: 100 }), 120, 1).c1rm).toBe(100);
  });
});

describe("advanceDoubleCursor", () => {
  it("advances one rep and stops at maxReps", () => {
    expect(advanceDoubleCursor(6, DOUBLE)).toBe(7);
    expect(advanceDoubleCursor(10, DOUBLE)).toBe(10);
    expect(advanceDoubleCursor(undefined, DOUBLE)).toBe(7); // from minReps
  });
});

describe("step", () => {
  it("success increments, clears streak/reset, resets double cursor to minReps", () => {
    const out = step(
      base({ regressionStreak: 2, doubleRepCursor: 9 }),
      "success",
      "double",
      DOUBLE,
      "w1",
      5,
    );
    expect(out.c1rm).toBe(102.5);
    expect(out.regressionStreak).toBe(0);
    expect(out.resetPending).toBe(false);
    expect(out.doubleRepCursor).toBe(6);
    expect(out.lastWorkoutId).toBe("w1");
  });

  it("hold leaves c1RM, zeroes streak, advances double cursor", () => {
    const out = step(
      base({ doubleRepCursor: 6 }),
      "hold",
      "double",
      DOUBLE,
      "w1",
      5,
    );
    expect(out.c1rm).toBe(100);
    expect(out.regressionStreak).toBe(0);
    expect(out.doubleRepCursor).toBe(7);
  });

  it("3 consecutive regressions arm a reset without dropping c1RM", () => {
    let s = base();
    s = step(s, "regression", "linear", LINEAR_KG, "w1", 1);
    expect(s.regressionStreak).toBe(1);
    expect(s.resetPending).toBe(false);
    s = step(s, "regression", "linear", LINEAR_KG, "w2", 2);
    expect(s.regressionStreak).toBe(2);
    s = step(s, "regression", "linear", LINEAR_KG, "w3", 3);
    expect(s.regressionStreak).toBe(3);
    expect(s.resetPending).toBe(true);
    expect(s.c1rm).toBe(100); // NOT dropped here — happens at next prescribe
  });

  it("a hold breaks the consecutive regression streak", () => {
    let s = step(base(), "regression", "linear", LINEAR_KG, "w1", 1);
    s = step(s, "hold", "linear", LINEAR_KG, "w2", 2);
    expect(s.regressionStreak).toBe(0);
  });

  it("does not mutate the input state", () => {
    const s = base();
    step(s, "success", "linear", LINEAR_KG, "w1", 5);
    expect(s.c1rm).toBe(100);
  });
});

describe("corroboratedE1rm", () => {
  it("returns null only when there are no positive qualifying sets", () => {
    expect(corroboratedE1rm([], 100)).toBeNull();
    expect(corroboratedE1rm([0, -5], 100)).toBeNull();
  });

  it("uses a lone set directly (top-set program — no outlier to drop)", () => {
    expect(corroboratedE1rm([130], 100)).toBe(130);
    expect(corroboratedE1rm([130, 0], 100)).toBe(130); // only one positive
  });

  it("drops a single high outlier and trusts the 2nd-furthest (up)", () => {
    // One mistyped set far above can't carry the move; the corroborating 130 does.
    expect(corroboratedE1rm([130, 1000], 100)).toBe(130);
  });

  it("drops a single low outlier and trusts the 2nd-furthest (down)", () => {
    // A typo'd 20 is dropped; the genuine 195 stands → no real divergence.
    expect(corroboratedE1rm([195, 20], 200)).toBe(195);
  });

  it("uses the nearer of two corroborating sets (conservative)", () => {
    expect(corroboratedE1rm([130, 128], 100)).toBe(128);
  });
});

describe("catchUpC1rm", () => {
  it("is a no-op within the threshold or without an estimate", () => {
    expect(catchUpC1rm(100, null)).toBe(100);
    expect(catchUpC1rm(100, 108)).toBe(100); // 8% < 10% threshold
    expect(catchUpC1rm(0, 200)).toBe(0); // no anchor
  });

  it("closes most of the gap in one move when it deviates up", () => {
    // gap 20, beyond threshold → close 70% → 114.
    expect(catchUpC1rm(100, 120)).toBeCloseTo(114, 6);
  });

  it("catches up downward too", () => {
    // gap −20 → 100 + (−20)*0.7 = 86.
    expect(catchUpC1rm(100, 80)).toBeCloseTo(86, 6);
  });
});

describe("liveEffectiveE1rm", () => {
  const M = DEFAULT_RPE_MATRIX;
  // A set whose impliedE1rm is exactly `e1rm` at (reps, rpe).
  const setImplying = (e1rm: number, reps: number, rpe: number): LoggedSet => {
    const weight = e1rm * matrixPct(M, reps, rpe);
    return {
      id: "s",
      timestamp: 0,
      targetReps: reps,
      actualReps: reps,
      targetWeight: weight,
      actualWeight: weight,
      targetRpe: rpe,
      actualRpe: rpe,
      failure: false,
    };
  };

  it("returns null with no anchor and no sets", () => {
    expect(liveEffectiveE1rm(M, [], null)).toBeNull();
  });

  it("seeds from the session's best qualifying set when there is no c1RM", () => {
    const s = setImplying(130, 5, 8); // RPE 8 qualifies
    expect(liveEffectiveE1rm(M, [s], null)).toBeCloseTo(130, 6);
  });

  it("seeds from a sub-threshold set (relaxed) when no qualifying set exists", () => {
    const sub = setImplying(120, 5, 6); // RPE 6 does not qualify
    expect(liveEffectiveE1rm(M, [sub], null)).toBeCloseTo(
      impliedE1rm(M, sub.actualWeight, 5, 6),
      6,
    );
  });

  it("keeps the c1RM when the session has no qualifying sets", () => {
    const sub = setImplying(200, 5, 6); // not qualifying → ignored
    expect(liveEffectiveE1rm(M, [sub], 100)).toBe(100);
  });

  it("keeps the c1RM when a qualifying set is within the catch-up threshold", () => {
    const s = setImplying(105, 3, 9); // 5% over → no catch-up
    expect(liveEffectiveE1rm(M, [s], 100)).toBe(100);
  });

  it("jumps to the caught-up value when a qualifying set diverges past the threshold", () => {
    const s = setImplying(130, 3, 9); // 30% over → catch-up fires
    // 100 + (130 − 100) * 0.7 = 121.
    expect(liveEffectiveE1rm(M, [s], 100)).toBeCloseTo(121, 6);
  });
});
