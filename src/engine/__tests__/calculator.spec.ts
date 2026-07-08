import { describe, it, expect } from "vitest";
import { DEFAULT_RPE_MATRIX } from "../../db/rpeMatrix";
import { impliedE1rm, roundToLoadable } from "../matrix";
import { solveReps, solveRpe, solveWeight } from "../calculator";

const M = DEFAULT_RPE_MATRIX;

describe("solveWeight", () => {
  it("inverts impliedE1rm (within loadable rounding)", () => {
    const e1rm = impliedE1rm(M, 100, 5, 8); // ~126.6
    expect(solveWeight(M, e1rm, 5, 8)).toBe(100);
  });

  it("returns a loadable weight", () => {
    const w = solveWeight(M, 137, 3, 8);
    expect(roundToLoadable(w)).toBe(w); // already on the loadable grid
  });

  it("returns 0 for a non-positive e1RM", () => {
    expect(solveWeight(M, 0, 5, 8)).toBe(0);
  });

  it("bodyweight offset: returns the ADDED weight, rounded in added space", () => {
    const offset = 73.17; // off the loadable grid on purpose
    const total = solveWeight(M, 150, 5, 8);
    const added = solveWeight(M, 150, 5, 8, offset);
    expect(added).toBe(roundToLoadable(150 * M[5][8] - offset));
    expect(added).toBeLessThan(total);
    // Round-trip: added + offset inverts back to the same reps.
    expect(solveReps(M, 150, added + offset, 8)).toBe(5);
  });

  it("bodyweight offset: may return a negative added weight (assistance)", () => {
    expect(solveWeight(M, 80, 5, 8, 90)).toBeLessThan(0);
  });
});

describe("solveReps", () => {
  it("recovers the rep count of a matching load", () => {
    const e1rm = 100;
    const weight = e1rm * M[5][8]; // exactly the 5@8 load
    expect(solveReps(M, e1rm, weight, 8)).toBe(5);
  });

  it("clamps to the matrix domain for out-of-range loads", () => {
    expect(solveReps(M, 100, 100, 8)).toBe(1); // load above 1-rep capacity
    expect(solveReps(M, 100, 1, 8)).toBe(15); // load below 15-rep
  });
});

describe("solveRpe", () => {
  it("recovers the RPE of a matching load and snaps to the grid", () => {
    const e1rm = 100;
    const weight = e1rm * M[5][8];
    expect(solveRpe(M, e1rm, weight, 5)).toBe(8);
  });

  it("clamps to 6–10", () => {
    expect(solveRpe(M, 100, 100, 5)).toBe(10); // very heavy
    expect(solveRpe(M, 100, 1, 5)).toBe(6); // very light
  });
});
