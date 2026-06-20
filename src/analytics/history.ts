import type { Workout } from "../db/types";

// ----------------------------------------------
// Display-only helpers for the workout history page. NO metric math lives here —
// duration/volume/PRs come from the engine summary (analytics/summary.ts). This
// module only decides how completed sessions are bucketed and labelled for the
// list (week-of-month → month → year).
// ----------------------------------------------

export interface HistoryGroup {
  key: string; // stable v-for key, e.g. "2026-5-3"
  label: string; // e.g. "Week 3 | June 2026"
  weekOfMonth: number; // 1..5
  month: number; // 0..11
  year: number;
  workouts: Workout[];
}

/** Calendar week within the month (1..5), e.g. days 1-7 → week 1, 8-14 → week 2. */
function weekOfMonth(date: Date): number {
  return Math.ceil(date.getDate() / 7);
}

/**
 * Buckets already-sorted (newest-first) workouts into week-of-month groups.
 * Input order is preserved within and across groups, so a descending input
 * yields descending groups — no internal sorting.
 */
export function groupByWeek(workouts: Workout[]): HistoryGroup[] {
  const groups: HistoryGroup[] = [];
  const byKey = new Map<string, HistoryGroup>();

  for (const workout of workouts) {
    const date = new Date(workout.startTime);
    const year = date.getFullYear();
    const month = date.getMonth();
    const week = weekOfMonth(date);
    const key = `${year}-${month}-${week}`;

    let group = byKey.get(key);
    if (!group) {
      const monthName = date.toLocaleString(undefined, { month: "long" });
      group = {
        key,
        label: `Week ${week} · ${monthName} ${year}`,
        weekOfMonth: week,
        month,
        year,
        workouts: [],
      };
      byKey.set(key, group);
      groups.push(group);
    }
    group.workouts.push(workout);
  }

  return groups;
}
