import { describe, it, expect } from "vitest";
import type { Workout } from "../../db/types";
import { computeRoutineStats, formatLastPerformed } from "../routineStats";

// Fixed local dates: Tue Jan 6 / Thu Jan 8 2026 share a Monday-start week;
// Sun Jan 4 falls in the previous one.
const SUN_PREV = new Date(2026, 0, 4, 10).getTime();
const MON = new Date(2026, 0, 5, 9).getTime();
const TUE = new Date(2026, 0, 6, 10).getTime();
const THU = new Date(2026, 0, 8, 18).getTime();
const NOW = new Date(2026, 0, 8, 20).getTime();

let nextId = 0;
const makeWorkout = (routineId: string, startTime: number): Workout => ({
  id: `w-${++nextId}`,
  routineId,
  startTime,
  exercises: [],
});

describe("computeRoutineStats", () => {
  it("returns an empty map for no workouts", () => {
    expect(computeRoutineStats([], NOW).size).toBe(0);
  });

  it("counts only sessions in the current calendar week", () => {
    const stats = computeRoutineStats(
      [
        makeWorkout("r1", SUN_PREV), // previous week — excluded
        makeWorkout("r1", MON),
        makeWorkout("r1", THU),
      ],
      NOW,
    );
    expect(stats.get("r1")?.thisWeek).toBe(2);
  });

  it("tracks last-performed across weeks, picking the latest", () => {
    const stats = computeRoutineStats(
      [makeWorkout("r1", THU), makeWorkout("r1", SUN_PREV)],
      NOW,
    );
    expect(stats.get("r1")?.lastPerformed).toBe(THU);
  });

  it("buckets multiple routines independently", () => {
    const stats = computeRoutineStats(
      [
        makeWorkout("r1", TUE),
        makeWorkout("r2", THU),
        makeWorkout("r2", MON),
        makeWorkout("r3", SUN_PREV),
      ],
      NOW,
    );
    expect(stats.get("r1")).toEqual({ thisWeek: 1, lastPerformed: TUE });
    expect(stats.get("r2")).toEqual({ thisWeek: 2, lastPerformed: THU });
    expect(stats.get("r3")).toEqual({ thisWeek: 0, lastPerformed: SUN_PREV });
  });
});

describe("formatLastPerformed", () => {
  it("returns Never for null", () => {
    expect(formatLastPerformed(null, NOW)).toBe("Never");
  });

  it("returns Today for the same calendar day", () => {
    const earlierToday = new Date(2026, 0, 8, 6).getTime();
    expect(formatLastPerformed(earlierToday, NOW)).toBe("Today");
  });

  it("returns Yesterday for the previous calendar day", () => {
    expect(formatLastPerformed(new Date(2026, 0, 7, 23).getTime(), NOW)).toBe(
      "Yesterday",
    );
  });

  it("returns Nd ago within the last week", () => {
    expect(formatLastPerformed(new Date(2026, 0, 5, 12).getTime(), NOW)).toBe(
      "3d ago",
    );
  });

  it("returns a short date for older sessions", () => {
    const old = new Date(2025, 11, 25, 12).getTime();
    expect(formatLastPerformed(old, NOW)).toBe(
      new Date(old).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
    );
  });
});
