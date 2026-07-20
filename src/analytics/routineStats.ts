import type { Workout } from "../db/types";
import { weekStart } from "./compute";

export interface RoutineWeekStats {
  thisWeek: number; // sessions in the current calendar week
  lastPerformed: number | null; // startTime of most recent session, or null
}

/** Per-routine current-week count + last-performed time, keyed by routineId. */
export function computeRoutineStats(
  workouts: Workout[],
  now: number,
): Map<string, RoutineWeekStats> {
  const ws = weekStart(now);
  const stats = new Map<string, RoutineWeekStats>();
  for (const w of workouts) {
    const cur = stats.get(w.routineId) ?? { thisWeek: 0, lastPerformed: null };
    if (w.startTime >= ws) cur.thisWeek += 1;
    if (cur.lastPerformed === null || w.startTime > cur.lastPerformed) {
      cur.lastPerformed = w.startTime;
    }
    stats.set(w.routineId, cur);
  }
  return stats;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** "Today" | "Yesterday" | "3d ago" | "Jun 3" | "Never" */
export function formatLastPerformed(ts: number | null, now: number): string {
  if (ts === null) return "Never";
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const startOfThen = new Date(ts).setHours(0, 0, 0, 0);
  const days = Math.round((startOfToday - startOfThen) / DAY_MS);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}
