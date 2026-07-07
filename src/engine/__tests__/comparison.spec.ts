import { describe, it, expect } from "vitest";
import {
  repsDeviation,
  rpeOvershoot,
  weightDeviationKg,
  weightDeviationPct,
  weightMatches,
} from "../comparison";

describe("weightMatches", () => {
  it("matches inside and at the ±2.5 kg band edge, in both directions", () => {
    expect(weightMatches(100, 100)).toBe(true);
    expect(weightMatches(102.5, 100)).toBe(true);
    expect(weightMatches(97.5, 100)).toBe(true);
    expect(weightMatches(102.6, 100)).toBe(false);
    expect(weightMatches(97.4, 100)).toBe(false);
  });
});

describe("weightDeviationKg", () => {
  it("is 0 inside the band, the FULL deviation beyond it (full-beyond-band)", () => {
    expect(weightDeviationKg(102.5, 100)).toBe(0);
    expect(weightDeviationKg(102.6, 100)).toBeCloseTo(2.6);
    expect(weightDeviationKg(95, 100)).toBe(5);
  });
});

describe("weightDeviationPct", () => {
  it("scales the kg deviation by the target", () => {
    expect(weightDeviationPct(102, 100)).toBe(0);
    expect(weightDeviationPct(110, 100)).toBeCloseTo(10);
    expect(weightDeviationPct(45, 50)).toBeCloseTo(10);
  });

  it("is 0 for a non-positive target (no prescription to deviate from)", () => {
    expect(weightDeviationPct(100, 0)).toBe(0);
  });
});

describe("rpeOvershoot", () => {
  it("counts only points above target — undershoot is never a deviation", () => {
    expect(rpeOvershoot(9.5, 8)).toBeCloseTo(1.5);
    expect(rpeOvershoot(8, 8)).toBe(0);
    expect(rpeOvershoot(6, 8)).toBe(0);
  });
});

describe("repsDeviation", () => {
  it("is symmetric and absolute", () => {
    expect(repsDeviation(5, 5)).toBe(0);
    expect(repsDeviation(3, 5)).toBe(2);
    expect(repsDeviation(7, 5)).toBe(2);
  });
});
