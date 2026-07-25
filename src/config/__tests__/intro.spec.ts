import { describe, it, expect } from "vitest";
import { hasSeenIntro, markIntroSeen, INTRO_SEEN_KEY } from "../intro";

const fakeStore = (seed: Record<string, string> = {}) => {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
  };
};

describe("hasSeenIntro / markIntroSeen", () => {
  it("is false until marked, then true", () => {
    const store = fakeStore();
    expect(hasSeenIntro(store)).toBe(false);
    markIntroSeen(store);
    expect(hasSeenIntro(store)).toBe(true);
  });

  it("uses the yafa:-namespaced key", () => {
    expect(INTRO_SEEN_KEY).toBe("yafa:hasSeenIntro");
    expect(hasSeenIntro(fakeStore({ [INTRO_SEEN_KEY]: "true" }))).toBe(true);
  });
});
