import { describe, it, expect } from "vitest";
import { DEFAULT_RPE_MATRIX } from "../../db/rpeMatrix";
import { proposeSetAdjustment } from "../adjustment";
import { roundToLoadable } from "../matrix";

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

  it("re-anchors UP when the previous set was easier than target", () => {
    // Prev 100×5 @ 6 (well under target RPE 8) → demonstrated capacity is higher.
    const adj = proposeSetAdjustment(
      M,
      { weight: 100, reps: 5, rpe: 6 },
      { reps: 5, rpe: 8, weight: 100 },
    );
    expect(adj).not.toBeNull();
    expect(adj!.weight).toBeGreaterThan(100);
    expect(adj!.rpe).toBe(8);
  });

  it("returns null when the result sits within the tolerance band", () => {
    // Prev on target → derived weight ≈ prescribed → nothing meaningful to change.
    expect(
      proposeSetAdjustment(
        M,
        { weight: 100, reps: 5, rpe: 8 },
        { reps: 5, rpe: 8, weight: 100 },
      ),
    ).toBeNull();
  });

  it("cold-start fill: derives a weight when the target has none yet", () => {
    // The governing first set's effort fills a remaining null-weight set.
    const adj = proposeSetAdjustment(
      M,
      { weight: 100, reps: 5, rpe: 8 },
      { reps: 5, rpe: 8, weight: null },
    );
    expect(adj).not.toBeNull();
    expect(adj!.weight).toBeGreaterThan(0);
    expect(adj!.reps).toBe(5);
    expect(adj!.rpe).toBe(8);
  });

  it("returns null for a back-off (null-RPE) target", () => {
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
    // Idempotent rounding ⇒ the proposed weight already sits on the loadable grid.
    expect(roundToLoadable(adj!.weight)).toBe(adj!.weight);
  });
});

describe("proposeSetAdjustment — bodyweight offset", () => {
  const OFFSET = 72; // e.g. 0.9 × 80 kg

  it("a 0-added bodyweight set is a valid governor (total > 0)", () => {
    const adj = proposeSetAdjustment(
      M,
      { weight: 0, reps: 5, rpe: 8 },
      { reps: 5, rpe: 8, weight: null },
      OFFSET,
    );
    expect(adj).not.toBeNull();
  });

  it("matrix math runs in total space; the proposal returns to added space", () => {
    const prev = { weight: 20, reps: 5, rpe: 9.5 };
    const target = { reps: 5, rpe: 8, weight: 20 };
    const withOffset = proposeSetAdjustment(M, prev, target, OFFSET)!;
    // Same demonstration lifted manually must give the same result.
    const liftedEquivalent = proposeSetAdjustment(
      M,
      { ...prev, weight: prev.weight + OFFSET },
      { ...target, weight: target.weight + OFFSET },
    )!;
    expect(withOffset.weight).toBeCloseTo(liftedEquivalent.weight - OFFSET, 10);
  });

  it("may propose a NEGATIVE added weight while the total stays positive", () => {
    // Very hard 0-added set → the target effort needs less than bodyweight.
    const adj = proposeSetAdjustment(
      M,
      { weight: 0, reps: 10, rpe: 10 },
      { reps: 10, rpe: 7, weight: null },
      OFFSET,
    );
    expect(adj).not.toBeNull();
    expect(adj!.weight).toBeLessThan(0);
    expect(adj!.weight + OFFSET).toBeGreaterThan(0);
  });

  it("returns null when even the TOTAL load would be non-positive", () => {
    expect(
      proposeSetAdjustment(
        M,
        { weight: -80, reps: 5, rpe: 8 },
        { reps: 5, rpe: 8, weight: null },
        OFFSET,
      ),
    ).toBeNull();
  });

  it("offset 0 matches the un-offset behavior exactly", () => {
    const prev = { weight: 100, reps: 5, rpe: 9.5 };
    const target = { reps: 5, rpe: 8, weight: 100 };
    expect(proposeSetAdjustment(M, prev, target, 0)).toEqual(
      proposeSetAdjustment(M, prev, target),
    );
  });
});
