import type { MesocycleWeek, Plan } from "../db/types";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * 0-based index of the mesocycle week a point in time falls into, or null when
 * the plan has no mesocycle. Anchored to the plan's created_at (plans don't
 * carry an explicit start date yet — when one lands, only this module changes)
 * and wrapping, so a finished mesocycle repeats from week 1 until the user
 * edits the plan.
 */
export function mesocycleWeekIndex(
  plan: Plan | undefined,
  at: number,
): number | null {
  const weeks = plan?.mesocycle;
  if (!plan || !weeks?.length) return null;
  const weeksElapsed = Math.max(
    0,
    Math.floor((at - plan.created_at) / WEEK_MS),
  );
  return weeksElapsed % weeks.length;
}

/** The mesocycle week a point in time falls into (see mesocycleWeekIndex). */
export function resolveMesocycleWeek(
  plan: Plan | undefined,
  at: number,
): MesocycleWeek | undefined {
  const index = mesocycleWeekIndex(plan, at);
  return index === null ? undefined : plan!.mesocycle![index];
}

/** Start of the training week `at` falls in, on the plan's week grid. */
export function weekStart(plan: Plan, at: number): number {
  const weeksElapsed = Math.max(
    0,
    Math.floor((at - plan.created_at) / WEEK_MS),
  );
  return plan.created_at + weeksElapsed * WEEK_MS;
}
