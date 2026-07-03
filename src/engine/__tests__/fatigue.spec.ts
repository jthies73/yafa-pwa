import { describe, it, expect } from "vitest";
import {
  computeFatigueAdjustment,
  muscleOverlapTier,
  type MuscleProfile,
} from "../fatigue";

const CHEST: MuscleProfile = {
  primary: ["Lower Chest", "Upper Chest"],
  secondary: ["Front Delts", "Triceps"],
};
const DELTS: MuscleProfile = {
  primary: ["Front Delts", "Side Delts"],
  secondary: ["Triceps"],
};
const LEGS: MuscleProfile = { primary: ["Quads", "Glutes"], secondary: [] };

describe("muscleOverlapTier", () => {
  it("grades the four overlap tiers", () => {
    // primary ← primary: chest pressing after chest pressing
    expect(muscleOverlapTier(CHEST, CHEST)).toBe(1);
    // primary ← secondary: delts pressing after chest work that hit delts as secondary
    expect(muscleOverlapTier(DELTS, CHEST)).toBe(0.75);
    // secondary ← primary: chest pressing after direct delt work
    expect(muscleOverlapTier(CHEST, DELTS)).toBe(0.5);
    // secondary ← secondary only
    expect(
      muscleOverlapTier(
        { primary: ["Lats"], secondary: ["Triceps"] },
        { primary: ["Quads"], secondary: ["Triceps"] },
      ),
    ).toBe(0.25);
  });

  it("takes the best tier when several pairings overlap", () => {
    // Triceps overlap (secondary↔secondary) must not undercut the primary hit.
    expect(
      muscleOverlapTier(CHEST, {
        primary: ["Upper Chest"],
        secondary: ["Triceps"],
      }),
    ).toBe(1);
  });

  it("returns 0 with no overlap or empty profiles", () => {
    expect(muscleOverlapTier(CHEST, LEGS)).toBe(0);
    expect(muscleOverlapTier(LEGS, DELTS)).toBe(0);
  });
});

describe("computeFatigueAdjustment", () => {
  const base = {
    reduction: 10,
    unit: "kg" as const,
    c1rm: 100,
    current: CHEST,
  };

  it("applies the full reduction for a primary←primary prior", () => {
    const adj = computeFatigueAdjustment({ ...base, priors: [CHEST] });
    expect(adj).not.toBeNull();
    expect(adj!.reductionKg).toBeCloseTo(10);
    expect(adj!.scale).toBeCloseTo(0.9);
    expect(adj!.tierFactor).toBe(1);
  });

  it("scales the reduction by the overlap tier", () => {
    // Chest after direct delt work: secondary←primary → half the base.
    const adj = computeFatigueAdjustment({ ...base, priors: [DELTS] });
    expect(adj!.reductionKg).toBeCloseTo(5);
    expect(adj!.tierFactor).toBe(0.5);
  });

  it("interprets a percent reduction against the c1RM", () => {
    const adj = computeFatigueAdjustment({
      ...base,
      reduction: 5,
      unit: "percent",
      c1rm: 200,
      priors: [CHEST],
    });
    expect(adj!.reductionKg).toBeCloseTo(10);
    expect(adj!.scale).toBeCloseTo(0.95);
  });

  it("lets the strongest overlap win across priors (never a sum)", () => {
    const adj = computeFatigueAdjustment({
      ...base,
      priors: [LEGS, DELTS, CHEST],
    });
    expect(adj!.tierFactor).toBe(1);
    expect(adj!.reductionKg).toBeCloseTo(10);
  });

  it("returns null when nothing applies", () => {
    expect(computeFatigueAdjustment({ ...base, priors: [] })).toBeNull();
    expect(
      computeFatigueAdjustment({ ...base, reduction: 0, priors: [CHEST] }),
    ).toBeNull();
    expect(
      computeFatigueAdjustment({ ...base, c1rm: 0, priors: [CHEST] }),
    ).toBeNull();
    expect(
      computeFatigueAdjustment({ ...base, priors: [LEGS] }), // no overlap
    ).toBeNull();
  });

  it("clamps the reduction to the anchor", () => {
    const adj = computeFatigueAdjustment({
      ...base,
      reduction: 150,
      priors: [CHEST],
    });
    expect(adj!.reductionKg).toBe(100);
    expect(adj!.scale).toBe(0);
  });
});
