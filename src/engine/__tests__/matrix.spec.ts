import { describe, it, expect } from "vitest";
import { DEFAULT_RPE_MATRIX } from "../../db/rpeMatrix";
import type { Set as LoggedSet } from "../../db/types";
import {
  clampLookupReps,
  correctRpeMatrix,
  enforceMatrixMonotonicity,
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
  it("rounds to the given increment", () => {
    expect(roundToLoadable(101.2, 2.5)).toBe(100);
    expect(roundToLoadable(101.3, 2.5)).toBe(102.5);
    expect(roundToLoadable(103.74, 2.5)).toBe(102.5);
    expect(roundToLoadable(103.76, 2.5)).toBe(105);
  });

  it("defaults to a fine 0.1 kg increment (precise targets)", () => {
    expect(roundToLoadable(101.23)).toBe(101.2);
    expect(roundToLoadable(101.27)).toBe(101.3);
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
    expect(roundToLoadable(100)).toBe(100);
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

  it("allowSubThreshold widens the gate to any real-RPE set (seed fallback)", () => {
    const subLimit = makeSet({ actualWeight: 80, actualReps: 5, actualRpe: 6 });
    expect(peakImpliedE1rm(M, [subLimit])).toBeNull(); // strict gate
    const peak = peakImpliedE1rm(M, [subLimit], true);
    expect(peak?.set).toBe(subLimit);
    expect(peak!.e1rm).toBeGreaterThan(0);
  });

  it("seeds from a high-rep set (>10) via the fallback, clamped to the 10-rep row", () => {
    // A program above 10 reps would otherwise never anchor a c1RM. The strict
    // qualifying gate still rejects it (keeps catch-up/analytics at ≤10 reps); only
    // the seed fallback accepts it, scoring it as a conservative 10-rep set.
    const highRep = makeSet({ actualWeight: 60, actualReps: 15, actualRpe: 9 });
    expect(peakImpliedE1rm(M, [highRep])).toBeNull(); // strict gate still rejects
    const seed = peakImpliedE1rm(M, [highRep], true);
    expect(seed?.set).toBe(highRep);
    expect(seed!.e1rm).toBeCloseTo(impliedE1rm(M, 60, 10, 9), 5); // clamped to 10 reps
  });
});

describe("setMatrixCell", () => {
  it("sets the edited cell and never mutates the input", () => {
    const before = M[5][8];
    const next = setMatrixCell(M, 5, 8, 0.85);
    expect(next[5][8]).toBe(0.85);
    expect(M[5][8]).toBe(before); // original untouched (purity)
  });

  it("propagates the additive delta along the diagonal and preserves monotonicity", () => {
    const oldVal = M[5][8];
    const targetVal = oldVal + 0.1;
    const next = setMatrixCell(M, 5, 8, targetVal);

    expect(next[5][8]).toBeCloseTo(targetVal, 5);

    // Cell on the same diagonal (n = 7) like 6 reps @ RPE 9 should receive the delta.
    // Note: It might be clamped slightly below M[6][9] + 0.1 by enforceMatrixMonotonicity
    // due to neighboring cells outside the full-weight radius.
    expect(next[6][9]).toBeGreaterThan(M[6][9]);
    // It should be close to the intended smoothed value (0.91) but clamped by the solver
    expect(next[6][9]).toBeGreaterThanOrEqual(0.85);

    // It should also preserve monotonicity
    expect(next[5][8.5]).toBeGreaterThanOrEqual(next[5][8] - 1e-9);
  });
});

describe("enforceMatrixMonotonicity", () => {
  it("restores row-wise and column-wise monotonicity", () => {
    const dirty = { ...M };
    for (const r of Object.keys(dirty).map(Number)) {
      dirty[r] = { ...dirty[r] };
    }
    // Row 5: RPE 8 is normally 0.79. Let's make it 0.95 (violates both row & col monotonicity)
    dirty[5][8] = 0.95;

    const clean = enforceMatrixMonotonicity(dirty);

    // Verify row monotonicity: clean[r][c1] <= clean[r][c2] for c1 < c2
    for (const r of Object.keys(clean).map(Number)) {
      const row = clean[r];
      const cols = Object.keys(row)
        .map(Number)
        .sort((a, b) => a - b);
      for (let i = 0; i < cols.length - 1; i++) {
        expect(row[cols[i]]).toBeLessThanOrEqual(row[cols[i + 1]] + 1e-9);
      }
    }

    // Verify column monotonicity: clean[r1][c] >= clean[r2][c] for r1 < r2
    const repsList = Object.keys(clean)
      .map(Number)
      .sort((a, b) => a - b);
    for (let i = 0; i < repsList.length - 1; i++) {
      const r1 = repsList[i];
      const r2 = repsList[i + 1];
      const row1 = clean[r1];
      const row2 = clean[r2];
      for (const c of Object.keys(row1).map(Number)) {
        if (row2[c] !== undefined) {
          expect(row1[c]).toBeGreaterThanOrEqual(row2[c] - 1e-9);
        }
      }
    }
  });
});

describe("correctRpeMatrix", () => {
  it("performs downward correction safely on all iso-effort cells", () => {
    // Completed 8 reps @ RPE 9. Weight 100kg, anchorE1rm 200kg.
    // nSet = 8 + (10 - 9) = 9.
    // pDemo = 100 / 200 = 0.50.
    // Downward correction (0.50 < 0.74 at 8@9).
    const completedSet = { actualWeight: 100, actualReps: 8, actualRpe: 9 };
    const result = correctRpeMatrix(M, completedSet, 200, 0.1, 3.0);

    // Target reps-to-failure n = 9.
    // 8 reps @ RPE 9: n = 9, reps = 8. w = 1.0. Old: 0.74. New: 0.74 + 0.1 * 1.0 * (0.50 - 0.74) = 0.716.
    expect(result[8][9]).toBeCloseTo(0.716, 5);

    // 7 reps @ RPE 8: n = 9, reps = 7. w = 1.0. Old: 0.72. New: 0.72 + 0.1 * 1.0 * (0.50 - 0.72) = 0.698.
    expect(result[7][8]).toBeCloseTo(0.698, 5);

    // 9 reps @ RPE 10: n = 9, reps = 9. w = 1.0. Old: 0.76. New: 0.76 + 0.1 * 1.0 * (0.50 - 0.76) = 0.734.
    // Since it's downward, safety constraint does not trigger.
    expect(result[9][10]).toBeCloseTo(0.734, 5);
  });

  it("applies safety constraint for upward corrections (no upward correction for higher reps)", () => {
    // Completed 8 reps @ RPE 9. Weight 170kg, anchorE1rm 200kg.
    // nSet = 8 + (10 - 9) = 9.
    // pDemo = 170 / 200 = 0.85.
    // Upward correction (0.85 > 0.74 at 8@9).
    const completedSet = { actualWeight: 170, actualReps: 8, actualRpe: 9 };
    const result = correctRpeMatrix(M, completedSet, 200, 0.1, 3.0);

    // 8 reps @ RPE 9: reps = 8 <= 8. Allowed. Old: 0.74. New: 0.74 + 0.1 * 1.0 * (0.85 - 0.74) = 0.751.
    expect(result[8][9]).toBeCloseTo(0.751, 5);

    // 7 reps @ RPE 8: reps = 7 <= 8. Allowed. Old: 0.72. New: 0.72 + 0.1 * 1.0 * (0.85 - 0.72) = 0.733.
    expect(result[7][8]).toBeCloseTo(0.733, 5);

    // 9 reps @ RPE 10: reps = 9 > 8. NOT allowed upwards. So it should not increase.
    // (It might be slightly adjusted down if monotonicity drags it, but it cannot be > 0.79).
    expect(result[9][10]).toBeLessThanOrEqual(M[9][10] + 1e-9);
  });

  it("clamps percentages to at most 100% (1.0)", () => {
    // Attempt to make a set with massive weight to trigger > 1.0 adjustment
    const completedSet = { actualWeight: 500, actualReps: 1, actualRpe: 10 };
    const result = correctRpeMatrix(M, completedSet, 100, 1.0, 3.0);

    // No cell in result should exceed 1.0
    for (const r of Object.keys(result).map(Number)) {
      for (const c of Object.keys(result[r]).map(Number)) {
        expect(result[r][c]).toBeLessThanOrEqual(1.0 + 1e-9);
      }
    }
  });
});
