import { describe, it, expect } from "vitest";
import { DEFAULT_RPE_MATRIX } from "../../db/rpeMatrix";
import { proposeSetAdjustment } from "../adjustment";

const M = DEFAULT_RPE_MATRIX;

describe("proposeSetAdjustment", () => {
  it("re-anchors DOWN when the previous set was harder than target", () => {
    // Prev 100×5 @ 9.5 (much harder than target RPE 8) → propose a lighter load.
    const adj = proposeSetAdjustment(
      M,
      { weight: 100, reps: 5, rpe: 9.5 },
      { reps: 5, rpe: 8, weight: 100 },
    );
    expect(adj).not.toBeNull();
    expect(adj!.weight).toBeLessThan(100);
    expect(adj!.reps).toBe(5);
    expect(adj!.rpe).toBe(8);
  });

  it("returns null when the previous set was at/easier than target", () => {
    expect(
      proposeSetAdjustment(
        M,
        { weight: 100, reps: 5, rpe: 8 },
        { reps: 5, rpe: 8, weight: 100 },
      ),
    ).toBeNull();
    expect(
      proposeSetAdjustment(
        M,
        { weight: 100, reps: 5, rpe: 7 },
        { reps: 5, rpe: 8, weight: 100 },
      ),
    ).toBeNull();
  });

  it("returns null for a cold-start or free-entry target", () => {
    expect(
      proposeSetAdjustment(
        M,
        { weight: 100, reps: 5, rpe: 9.5 },
        { reps: 5, rpe: 8, weight: null },
      ),
    ).toBeNull();
    expect(
      proposeSetAdjustment(
        M,
        { weight: 100, reps: 5, rpe: 9.5 },
        { reps: 5, rpe: null, weight: 100 },
      ),
    ).toBeNull();
  });

  it("returns null for invalid previous inputs", () => {
    expect(
      proposeSetAdjustment(
        M,
        { weight: 0, reps: 5, rpe: 9.5 },
        { reps: 5, rpe: 8, weight: 100 },
      ),
    ).toBeNull();
    expect(
      proposeSetAdjustment(
        M,
        { weight: 100, reps: 0, rpe: 9.5 },
        { reps: 5, rpe: 8, weight: 100 },
      ),
    ).toBeNull();
  });

  it("returns a loadable weight", () => {
    const adj = proposeSetAdjustment(
      M,
      { weight: 102.5, reps: 4, rpe: 9.5 },
      { reps: 5, rpe: 8, weight: 100 },
    );
    expect(adj).not.toBeNull();
    expect(Number.isInteger(adj!.weight / 2.5)).toBe(true);
  });
});
