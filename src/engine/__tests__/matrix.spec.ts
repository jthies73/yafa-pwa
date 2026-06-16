import { describe, it, expect } from "vitest";
import { DEFAULT_RPE_MATRIX } from "../../db/rpeMatrix";
import type { Set as LoggedSet } from "../../db/types";
import {
  clampLookupReps,
  impliedE1rm,
  isQualifyingSet,
  peakImpliedE1rm,
  roundToLoadable,
  setMatrixCell,
  snapRpe,
  weightFromE1rm,
} from "../matrix";

let setSeq = 0;
const makeSet = (
  actualReps: number,
  actualRpe: number | undefined,
  actualWeight: number,
): LoggedSet => ({
  id: `set-${++setSeq}`,
  timestamp: setSeq,
  targetReps: actualReps,
  actualReps,
  targetWeight: actualWeight,
  actualWeight,
  targetRpe: actualRpe,
  actualRpe,
  failure: false,
});

describe("grid clamping", () => {
  it("snaps RPE to the 0.5 grid within 6..10", () => {
    expect(snapRpe(8.3)).toBe(8.5);
    expect(snapRpe(8.2)).toBe(8);
    expect(snapRpe(11)).toBe(10);
    expect(snapRpe(5)).toBe(6);
  });

  it("clamps lookup reps to the matrix rows", () => {
    expect(clampLookupReps(12)).toBe(10);
    expect(clampLookupReps(0)).toBe(1);
  });

  it("rounds weights to loadable increments", () => {
    expect(roundToLoadable(82.4)).toBe(82.5);
    expect(roundToLoadable(73.7)).toBe(72.5);
  });
});

describe("e1RM math against the fixed table", () => {
  it("implied e1RM and derived weight are inverses at a cell", () => {
    // [5][9] = 0.82: 82kg implies 100kg, and 100kg prescribes 82kg back.
    expect(impliedE1rm(DEFAULT_RPE_MATRIX, 82, 5, 9)).toBeCloseTo(100, 6);
    expect(weightFromE1rm(DEFAULT_RPE_MATRIX, 100, 5, 9)).toBeCloseTo(82, 6);
  });
});

describe("isQualifyingSet", () => {
  it("accepts honest near-limit sets and rejects the rest", () => {
    expect(isQualifyingSet(makeSet(5, 8, 80))).toBe(true);
    expect(isQualifyingSet(makeSet(10, 9, 80))).toBe(true);
    expect(isQualifyingSet(makeSet(5, 7.5, 80))).toBe(false); // RPE < 8
    expect(isQualifyingSet(makeSet(11, 9, 80))).toBe(false); // reps > 10
    expect(isQualifyingSet(makeSet(5, undefined, 80))).toBe(false); // no RPE
    expect(isQualifyingSet(makeSet(5, 9, 0))).toBe(false); // no load
  });
});

describe("peakImpliedE1rm", () => {
  it("returns the heaviest implied e1RM among qualifying sets", () => {
    // Loads derived from the matrix so each set implies a known e1RM.
    const lighter = weightFromE1rm(DEFAULT_RPE_MATRIX, 100, 5, 9);
    const heavier = weightFromE1rm(DEFAULT_RPE_MATRIX, 110, 3, 9);
    const peak = peakImpliedE1rm(DEFAULT_RPE_MATRIX, [
      makeSet(5, 9, lighter), // implies ≈ 100
      makeSet(3, 9, heavier), // implies ≈ 110 (the peak)
      makeSet(5, 7, 500), // off-anchor (RPE < 8) — ignored despite huge load
    ]);
    expect(peak?.e1rm).toBeCloseTo(110, 0);
    expect(peak?.set.actualReps).toBe(3);
  });

  it("is null when no set qualifies", () => {
    expect(peakImpliedE1rm(DEFAULT_RPE_MATRIX, [makeSet(5, 7, 80)])).toBeNull();
  });
});

describe("setMatrixCell (direct edit)", () => {
  it("writes the cell exactly and smooths ±1.0 RPE neighbors by the kernel", () => {
    // [5][9] = 0.82 → 0.85: delta +0.03; ±0.5 get +0.015, ±1.0 get +0.0075.
    const next = setMatrixCell(DEFAULT_RPE_MATRIX, 5, 9, 0.85);
    expect(next[5][9]).toBe(0.85);
    expect(next[5][8.5]).toBeCloseTo(0.81 + 0.015, 9);
    expect(next[5][9.5]).toBeCloseTo(0.84 + 0.015, 9);
    expect(next[5][8]).toBeCloseTo(0.79 + 0.0075, 9);
    expect(next[5][10]).toBeCloseTo(0.86 + 0.0075, 9);
    // Beyond the kernel and other rows: untouched. Input not mutated.
    expect(next[5][7.5]).toBe(DEFAULT_RPE_MATRIX[5][7.5]);
    expect(next[4][9]).toBe(DEFAULT_RPE_MATRIX[4][9]);
    expect(DEFAULT_RPE_MATRIX[5][9]).toBe(0.82);
  });
});
