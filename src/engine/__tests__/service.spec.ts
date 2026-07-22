import { describe, it, expect } from "vitest";
import type { Exercise, Plan } from "../../db/types";
import {
  muscleProfileOf,
  priorsBySlot,
  absoluteWeekIndex,
  mostRecentMonday,
} from "../service";

const exercise = (
  id: string,
  primaryMuscleGroups: string[],
  secondaryMuscleGroups: string[] = [],
): Exercise => ({
  id,
  name: id,
  primaryMuscleGroups,
  secondaryMuscleGroups,
  created_at: 0,
});

describe("muscleProfileOf", () => {
  it("maps an exercise's muscle groups, defaulting a missing secondary to []", () => {
    const bench = exercise("bench", ["Chest"], ["Triceps"]);
    expect(muscleProfileOf(bench)).toEqual({
      primary: ["Chest"],
      secondary: ["Triceps"],
    });
    expect(
      muscleProfileOf({ ...bench, secondaryMuscleGroups: undefined }),
    ).toEqual({ primary: ["Chest"], secondary: [] });
  });
});

describe("priorsBySlot", () => {
  const bench = exercise("bench", ["Chest"]);
  const squat = exercise("squat", ["Quads"]);
  const byId = new Map([
    ["bench", bench],
    ["squat", squat],
  ]);
  const exerciseOf = (id: string) => byId.get(id);

  it("gives the first slot no priors", () => {
    expect(priorsBySlot(["bench"], exerciseOf)).toEqual([[]]);
  });

  it("accumulates earlier slots' muscle profiles in routine order", () => {
    const result = priorsBySlot(["bench", "squat"], exerciseOf);
    expect(result[1]).toEqual([muscleProfileOf(bench)]);
  });

  it("counts a repeated exercise's earlier slot as its own prior", () => {
    // Bench, Squat, Bench again: the 3rd slot's priors include the 1st
    // slot's own exercise — repeating a lift fatigues its own repeat, same
    // as any other overlapping exercise would.
    const result = priorsBySlot(["bench", "squat", "bench"], exerciseOf);
    expect(result[2]).toEqual([muscleProfileOf(bench), muscleProfileOf(squat)]);
  });

  it("a slot with no resolvable exercise contributes no prior and gets none", () => {
    const result = priorsBySlot(["missing", "bench"], exerciseOf);
    expect(result[0]).toEqual([]);
    expect(result[1]).toEqual([]); // "missing" was never recorded into `seen`
  });
});

describe("mostRecentMonday", () => {
  it("returns a Monday at 00:00 local time", () => {
    const tuesday = new Date("2024-03-05T15:30:00").getTime();
    const result = mostRecentMonday(tuesday);
    const resultDate = new Date(result);
    // Verify it's a Monday (getDay() === 1)
    expect(resultDate.getDay()).toBe(1);
    // Verify it's at 00:00:00
    expect(resultDate.getHours()).toBe(0);
    expect(resultDate.getMinutes()).toBe(0);
    expect(resultDate.getSeconds()).toBe(0);
    expect(resultDate.getMilliseconds()).toBe(0);
  });

  it("returns a date <= the input date", () => {
    const thursday = new Date("2024-03-07T15:30:00").getTime();
    const result = mostRecentMonday(thursday);
    expect(result).toBeLessThanOrEqual(thursday);
  });

  it("returns a Monday that is at most 6 days before the input", () => {
    const sunday = new Date("2024-03-03T00:00:00").getTime();
    const result = mostRecentMonday(sunday);
    const daysDiff = (sunday - result) / (24 * 60 * 60 * 1000);
    expect(daysDiff).toBeLessThanOrEqual(6);
    const resultDate = new Date(result);
    expect(resultDate.getDay()).toBe(1); // Monday
  });

  it("works consistently across different days of the week", () => {
    const days = [
      "2024-03-04", // Monday
      "2024-03-05", // Tuesday
      "2024-03-06", // Wednesday
      "2024-03-07", // Thursday
      "2024-03-08", // Friday
      "2024-03-09", // Saturday
      "2024-03-10", // Sunday
    ];
    const results = days.map((day) => {
      const date = new Date(`${day}T12:00:00`).getTime();
      const monday = mostRecentMonday(date);
      const mondayDate = new Date(monday);
      return {
        day,
        isMonday: mondayDate.getDay() === 1,
        isAtMidnight:
          mondayDate.getHours() === 0 &&
          mondayDate.getMinutes() === 0 &&
          mondayDate.getSeconds() === 0,
      };
    });
    results.forEach((r) => {
      expect(r.isMonday).toBe(true);
      expect(r.isAtMidnight).toBe(true);
    });
  });
});

describe("absoluteWeekIndex", () => {
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  const plan = (created_at: number): Plan => ({
    id: "plan1",
    name: "Test Plan",
    routineIds: [],
    active: false,
    created_at,
  });

  it("returns 0 when no plan provided", () => {
    expect(absoluteWeekIndex(undefined, Date.now())).toBe(0);
  });

  it("computes week from creation time when no override", () => {
    const now = Date.now();
    const twoWeeksAgo = now - 2 * WEEK_MS;
    const p = plan(twoWeeksAgo);
    expect(absoluteWeekIndex(p, now)).toBe(2);
  });

  it("returns 0 when asking about times before plan creation", () => {
    const now = Date.now();
    const p = plan(now + WEEK_MS);
    expect(absoluteWeekIndex(p, now)).toBe(0);
  });

  it("uses calendar math when override is in the future", () => {
    const now = Date.now();
    const twoWeeksAgo = now - 2 * WEEK_MS;
    const p = plan(twoWeeksAgo);
    p.mesocycleWeekOverride = {
      weekIndex: 5,
      setAt: now + WEEK_MS, // future override
      alignToMonday: false,
    };
    // Since we're asking about `now` (before the override), use the original math
    expect(absoluteWeekIndex(p, now)).toBe(2);
  });

  it("uses override math when time >= override setAt, no alignment", () => {
    const overrideTime = Date.now();
    const oneWeekAfter = overrideTime + WEEK_MS;
    const p = plan(overrideTime - 10 * WEEK_MS);
    p.mesocycleWeekOverride = {
      weekIndex: 5,
      setAt: overrideTime,
      alignToMonday: false,
    };
    // 1 week after the override was set, should be at week 6
    expect(absoluteWeekIndex(p, oneWeekAfter)).toBe(6);
  });

  it("respects that overrides don't apply to times before setAt", () => {
    const now = Date.now();
    const oneWeekAgo = now - WEEK_MS;
    const p = plan(oneWeekAgo - 5 * WEEK_MS);
    p.mesocycleWeekOverride = {
      weekIndex: 8,
      setAt: now, // override set now
      alignToMonday: false,
    };
    // One week ago, the override didn't exist yet
    const indexOneWeekAgo = absoluteWeekIndex(p, oneWeekAgo);
    // Now, the override applies
    const indexNow = absoluteWeekIndex(p, now);
    // They should be different (override adds an offset)
    expect(indexNow).toBeGreaterThan(indexOneWeekAgo);
  });

  it("handles Monday alignment when override is set", () => {
    // Set override at a known time
    const overrideTime = Date.now();
    const twoWeeksAfterOverride = overrideTime + 2 * WEEK_MS;
    const p = plan(overrideTime - 3 * WEEK_MS);

    // With Monday alignment, the anchor shifts to the most recent Monday before setAt
    p.mesocycleWeekOverride = {
      weekIndex: 5,
      setAt: overrideTime,
      alignToMonday: true,
    };

    // After 2 weeks from the override, we should advance by 2 weeks from the Monday anchor
    const result = absoluteWeekIndex(p, twoWeeksAfterOverride);
    // The result should be week 5 + 2 = 7 (if the Monday anchor is at or before overrideTime)
    expect(result).toBeGreaterThanOrEqual(7);
  });
});
