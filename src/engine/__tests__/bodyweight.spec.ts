import { describe, it, expect } from "vitest";
import type { Set as LoggedSet } from "../../db/types";
import {
  bodyweightOffsetKg,
  bodyweightShiftKg,
  liftSet,
  liftSets,
  pickBodyweightAt,
} from "../bodyweight";

const set = (weight: number): LoggedSet => ({
  id: "s1",
  timestamp: 1,
  targetReps: 5,
  actualReps: 5,
  targetWeight: weight,
  actualWeight: weight,
  targetRpe: 8,
  actualRpe: 8,
  failure: false,
});

describe("bodyweightOffsetKg", () => {
  it("is factor × bodyweight", () => {
    expect(bodyweightOffsetKg(0.9, 80)).toBeCloseTo(72);
  });

  it("is 0 when the factor is absent or 0", () => {
    expect(bodyweightOffsetKg(undefined, 80)).toBe(0);
    expect(bodyweightOffsetKg(0, 80)).toBe(0);
  });

  it("is 0 when no bodyweight is known", () => {
    expect(bodyweightOffsetKg(0.9, undefined)).toBe(0);
    expect(bodyweightOffsetKg(0.9, null)).toBe(0);
  });
});

describe("liftSet / liftSets", () => {
  it("lifts both target and actual weight into total space", () => {
    const lifted = liftSet(set(20), 72);
    expect(lifted.actualWeight).toBe(92);
    expect(lifted.targetWeight).toBe(92);
    expect(lifted.actualReps).toBe(5); // everything else untouched
  });

  it("offset 0 is a strict identity (same references)", () => {
    const s = set(20);
    const list = [s];
    expect(liftSet(s, 0)).toBe(s);
    expect(liftSets(list, 0)).toBe(list);
  });

  it("never mutates the input set", () => {
    const s = set(20);
    liftSet(s, 72);
    expect(s.actualWeight).toBe(20);
  });

  it("lifts negative added weights (assistance) toward the total", () => {
    expect(liftSet(set(-10), 72).actualWeight).toBe(62);
  });
});

describe("pickBodyweightAt", () => {
  const entries = [
    { timestamp: 100, value: 80 },
    { timestamp: 200, value: 82 },
    { timestamp: 300, value: 84 },
  ];

  it("picks the latest entry at or before the timestamp", () => {
    expect(pickBodyweightAt(entries, 250)).toBe(82);
    expect(pickBodyweightAt(entries, 200)).toBe(82);
    expect(pickBodyweightAt(entries, 999)).toBe(84);
  });

  it("falls back to the EARLIEST entry before the first log", () => {
    expect(pickBodyweightAt(entries, 50)).toBe(80);
  });

  it("is undefined when nothing was ever logged", () => {
    expect(pickBodyweightAt([], 100)).toBeUndefined();
  });

  it("does not require sorted input", () => {
    const shuffled = [entries[2], entries[0], entries[1]];
    expect(pickBodyweightAt(shuffled, 250)).toBe(82);
    expect(pickBodyweightAt(shuffled, 50)).toBe(80);
  });
});

describe("bodyweightShiftKg", () => {
  it("shifts by (new − old) × bodyweight in both directions", () => {
    expect(bodyweightShiftKg(0, 0.9, 80)).toBeCloseTo(72);
    expect(bodyweightShiftKg(0.9, 0.5, 80)).toBeCloseTo(-32);
  });

  it("is 0 without bodyweight data (matches the offset contributing 0)", () => {
    expect(bodyweightShiftKg(0, 0.9, undefined)).toBe(0);
  });
});
