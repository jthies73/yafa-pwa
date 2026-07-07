import { PRESCRIBED_WEIGHT_TOLERANCE_KG } from "./constants";

// ----------------------------------------------
// Shared prescribed-vs-actual comparisons. The single source of truth for how a
// logged set is measured against its prescription — evaluation (regression rules),
// in-session adjustment, and the adherence score all judge deviations through
// these helpers, so the three pipelines can never disagree on what "at the
// prescription" means. This is the only module that consumes
// PRESCRIBED_WEIGHT_TOLERANCE_KG.
// ----------------------------------------------

/** True when actual is within ±PRESCRIBED_WEIGHT_TOLERANCE_KG of target — "at prescribed". */
export const weightMatches = (actual: number, target: number): boolean =>
  Math.abs(actual - target) <= PRESCRIBED_WEIGHT_TOLERANCE_KG;

/**
 * Full |actual − target| in kg when beyond the tolerance band; 0 inside it.
 * The band is a dead zone, not a discount: once exceeded, the whole deviation
 * counts (full-beyond-band, by design).
 */
export const weightDeviationKg = (actual: number, target: number): number =>
  weightMatches(actual, target) ? 0 : Math.abs(actual - target);

/** weightDeviationKg as a percentage of target; 0 when target is not positive. */
export const weightDeviationPct = (actual: number, target: number): number =>
  target > 0 ? (weightDeviationKg(actual, target) / target) * 100 : 0;

/** RPE points above target; undershoot (easier than asked) is never a deviation. */
export const rpeOvershoot = (actual: number, target: number): number =>
  Math.max(0, actual - target);

/** Absolute rep deviation from target. */
export const repsDeviation = (actual: number, target: number): number =>
  Math.abs(actual - target);
