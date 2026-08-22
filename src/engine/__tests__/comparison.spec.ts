import { describe, it, expect } from "vitest";
import { weightMatches } from "../comparison";

describe("weightMatches", () => {
  it("matches inside and at the ±2.5 kg band edge, in both directions", () => {
    expect(weightMatches(100, 100)).toBe(true);
    expect(weightMatches(102.5, 100)).toBe(true);
    expect(weightMatches(97.5, 100)).toBe(true);
    expect(weightMatches(102.6, 100)).toBe(false);
    expect(weightMatches(97.4, 100)).toBe(false);
  });
});
