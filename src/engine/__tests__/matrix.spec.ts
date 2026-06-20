import { describe, it, expect } from "vitest";
import { DEFAULT_RPE_MATRIX } from "../../db/rpeMatrix";
import type { Set as LoggedSet } from "../../db/types";
import {
  clampLookupReps,
  impliedE1rm,
  isQualifyingSet,
  matrixPct,
  peakImpliedE1rm,
  roundToLoadable,
  setMatrixCell,
  snapRpe,
  weightFromE1rm,
} from "../matrix";

const M = DEFAULT_RPE_MATRIX;

let nextId = 0;
const makeSet = (overrides: Partial<LoggedSet> = {}): LoggedSet => ({
  id: `set-${++nextId}`,
  timestamp: nextId,
  targetReps: 5,
  actualReps: 5,
  targetWeight: 100,
  actualWeight: 100,
  actualRpe: 8,
  failure: false,
  ...overrides,
});

describe("matrixPct", () => {
  it("returns the exact cell on a grid hit", () => {
    expect(matrixPct(M, 5, 8)).toBe(0.79);
    expect(matrixPct(M, 3, 6)).toBe(0.79);
    expect(matrixPct(M, 1, 10)).toBe(1.0);
  });

  it("interpolates linearly on the RPE axis", () => {
    // reps 5: RPE 8 → 0.79, RPE 8.5 → 0.81; midpoint 8.25 → 0.80.
    expect(matrixPct(M, 5, 8.25)).toBeCloseTo(0.8, 5);
  });

  it("clamps RPE below/above the grid to the row endpoints (no extrapolation)", () => {
    expect(matrixPct(M, 5, 5)).toBe(matrixPct(M, 5, 6)); // 0.72
    expect(matrixPct(M, 5, 11)).toBe(matrixPct(M, 5, 10)); // 0.86
  });

  it("clamps reps outside 1–10", () => {
    expect(matrixPct(M, 0, 8)).toBe(matrixPct(M, 1, 8));
    expect(matrixPct(M, 99, 8)).toBe(matrixPct(M, 10, 8));
  });

  it("rounds fractional reps to the nearest integer row", () => {
    expect(matrixPct(M, 4.6, 8)).toBe(matrixPct(M, 5, 8));
  });
});

describe("impliedE1rm / weightFromE1rm", () => {
  it("round-trips weight ↔ e1rm at the same (reps, rpe)", () => {
    const e1rm = impliedE1rm(M, 100, 5, 8);
    expect(weightFromE1rm(M, e1rm, 5, 8)).toBeCloseTo(100, 6);
  });

  it("impliedE1rm = weight / pct", () => {
    expect(impliedE1rm(M, 79, 5, 8)).toBeCloseTo(100, 6); // 79 / 0.79
  });

  it("weightFromE1rm returns the raw (unrounded) weight", () => {
    // 123 × 0.79 = 97.17 — not a loadable number, must come back raw.
    expect(weightFromE1rm(M, 123, 5, 8)).toBeCloseTo(97.17, 6);
  });

  it("guards non-positive weight", () => {
    expect(impliedE1rm(M, 0, 5, 8)).toBe(0);
    expect(impliedE1rm(M, -5, 5, 8)).toBe(0);
  });
});

describe("roundToLoadable", () => {
  it("rounds to 2.5 kg by default", () => {
    expect(roundToLoadable(101.2)).toBe(100);
    expect(roundToLoadable(101.3)).toBe(102.5);
    expect(roundToLoadable(103.74)).toBe(102.5);
    expect(roundToLoadable(103.76)).toBe(105);
  });

  it("honors a custom increment", () => {
    expect(roundToLoadable(101, 5)).toBe(100);
    expect(roundToLoadable(103, 5)).toBe(105);
  });

  it("passes through a non-positive increment", () => {
    expect(roundToLoadable(101.234, 0)).toBe(101.234);
  });

  it("clears floating-point dust", () => {
    expect(roundToLoadable(102.5)).toBe(102.5);
    expect(Number.isInteger(roundToLoadable(100) / 2.5)).toBe(true);
  });
});

describe("snapRpe / clampLookupReps", () => {
  it("snaps RPE half-up to the 0.5 grid and clamps 6–10", () => {
    expect(snapRpe(8.24)).toBe(8);
    expect(snapRpe(8.25)).toBe(8.5);
    expect(snapRpe(11)).toBe(10);
    expect(snapRpe(5)).toBe(6);
  });

  it("rounds and clamps reps to 1–10", () => {
    expect(clampLookupReps(4.6)).toBe(5);
    expect(clampLookupReps(0)).toBe(1);
    expect(clampLookupReps(50)).toBe(10);
  });
});

describe("isQualifyingSet", () => {
  it("accepts an honest near-limit set", () => {
    expect(isQualifyingSet(makeSet({ actualRpe: 8, actualReps: 10 }))).toBe(
      true,
    );
  });

  it("rejects low RPE, high reps, no RPE, and zero weight", () => {
    expect(isQualifyingSet(makeSet({ actualRpe: 7.5 }))).toBe(false);
    expect(isQualifyingSet(makeSet({ actualReps: 11 }))).toBe(false);
    expect(isQualifyingSet(makeSet({ actualRpe: undefined }))).toBe(false);
    expect(isQualifyingSet(makeSet({ actualWeight: 0 }))).toBe(false);
  });
});

describe("peakImpliedE1rm", () => {
  it("returns the max across qualifying sets", () => {
    const a = makeSet({ actualWeight: 100, actualReps: 5, actualRpe: 8 }); // ~126.6
    const b = makeSet({ actualWeight: 110, actualReps: 5, actualRpe: 8 }); // ~139.2
    const peak = peakImpliedE1rm(M, [a, b]);
    expect(peak?.set).toBe(b);
  });

  it("ignores non-qualifying sets and returns null when none qualify", () => {
    expect(peakImpliedE1rm(M, [makeSet({ actualRpe: 6 })])).toBeNull();
  });
});

describe("setMatrixCell", () => {
  it("sets the edited cell and never mutates the input", () => {
    const before = M[5][8];
    const next = setMatrixCell(M, 5, 8, 0.85);
    expect(next[5][8]).toBe(0.85);
    expect(M[5][8]).toBe(before); // original untouched (purity)
  });

  it("repairs monotonicity on adjacent RPE columns only", () => {
    // Raising 5@8 above its higher neighbour (5@8.5 = 0.81) pulls the neighbour up.
    const next = setMatrixCell(M, 5, 8, 0.9);
    expect(next[5][8.5]).toBeGreaterThanOrEqual(next[5][8] - 1e-9);
    // A different row is untouched.
    expect(next[6]).toEqual(M[6]);
  });
});
