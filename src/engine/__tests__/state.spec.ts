import { describe, it, expect } from "vitest";
import type {
  DoubleProgressionParams,
  LinearProgressionParams,
  ProgressionState,
} from "../../db/types";
import {
  advanceDoubleCursor,
  applyIncrement,
  applyReset,
  consumeReset,
  initState,
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
