import { describe, it, expect } from "vitest";
import type { Workout } from "../../db/types";
import { groupByWeek } from "../history";

let nextId = 0;
const makeWorkout = (startTime: number): Workout => ({
  id: `w-${++nextId}`,
  routineId: "r1",
  startTime,
  exercises: [],
});

// Local time to match groupByWeek (uses getFullYear/getMonth/getDate).
const at = (y: number, m: number, d: number) => new Date(y, m, d, 10).getTime();

describe("groupByWeek", () => {
  it("places day 7 and day 8 in different week-of-month buckets", () => {
    const groups = groupByWeek([
      makeWorkout(at(2026, 5, 8)),
      makeWorkout(at(2026, 5, 7)),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].weekOfMonth).toBe(2); // June 8 → ceil(8/7) = 2
    expect(groups[1].weekOfMonth).toBe(1); // June 7 → ceil(7/7) = 1
  });

  it("collapses workouts in the same week into one group, preserving order", () => {
    const a = makeWorkout(at(2026, 5, 17));
    const b = makeWorkout(at(2026, 5, 15));
    const groups = groupByWeek([a, b]);
    expect(groups).toHaveLength(1);
    expect(groups[0].weekOfMonth).toBe(3);
    expect(groups[0].workouts).toEqual([a, b]);
  });

  it("formats the label with a pipe separator and full month name", () => {
    const [group] = groupByWeek([makeWorkout(at(2026, 5, 15))]);
    expect(group.label).toBe("Week 3 | June 2026");
  });

  it("separates the same week-of-month across different months and years", () => {
    const groups = groupByWeek([
      makeWorkout(at(2027, 0, 3)), // Jan 2027, week 1
      makeWorkout(at(2026, 11, 3)), // Dec 2026, week 1
      makeWorkout(at(2026, 5, 3)), // Jun 2026, week 1
    ]);
    expect(groups).toHaveLength(3);
    expect(groups.map((g) => g.key)).toEqual([
      "2027-0-1",
      "2026-11-1",
      "2026-5-1",
    ]);
  });
});
