import type { WeightIncrementUnit } from "../db/types";

// ----------------------------------------------
// Fatigue. Computes the transient c1RM reduction for an exercise whose muscles
// were already taxed earlier in the same session.
//
// Pipeline stage: prescription input. The service feeds it the muscle profiles
// of the session's PRIOR exercises (routine order), so the preview and the
// workout start already show the fatigue-adjusted loads. The reduction is
// transient — it shapes the rendered loads of one session and is never
// persisted to ProgressionState.c1rm.
//
// Decisions encoded here:
//   • Muscle-specific, not effort-specific: an RPE-driven scaling was
//     considered and DISCARDED — all that matters is WHICH muscles a prior
//     exercise engaged and in which role, not how hard it was.
//   • Each prior exercise contributes its own candidate (base × overlapTier);
//     the LARGEST candidate wins — candidates are never summed.
//   • Overlap ladder weighs the CURRENT exercise's role heavier than the prior's:
//     primary←primary 1.0, primary←secondary 0.75, secondary←primary 0.5,
//     secondary←secondary 0.25.
//   • The reduction subtracts from the ANCHOR (c1RM), not the final weight, so
//     one multiplicative scale covers straight, top and back-off sets alike.
// ----------------------------------------------

export interface MuscleProfile {
  primary: string[];
  secondary: string[]; // pass [] for exercises without secondary muscles
}

export interface FatigueInput {
  reduction: number; // fatigueReduction param; kg, or percent of c1RM
  unit: WeightIncrementUnit;
  c1rm: number;
  current: MuscleProfile;
  priors: MuscleProfile[];
}

export interface FatigueAdjustment {
  reductionKg: number; // effective reduction in c1RM-space, ≤ c1rm
  scale: number; // (c1rm − reductionKg) / c1rm, clamped to [0, 1]
  tierFactor: number; // winning prior's overlap tier
}

const overlaps = (a: string[], b: string[]): boolean =>
  a.some((m) => b.includes(m));

/** Highest-value muscle pairing between the two exercises; 0 = no overlap. */
export function muscleOverlapTier(
  current: MuscleProfile,
  prior: MuscleProfile,
): number {
  if (overlaps(current.primary, prior.primary)) return 1;
  if (overlaps(current.primary, prior.secondary)) return 0.75;
  if (overlaps(current.secondary, prior.primary)) return 0.5;
  if (overlaps(current.secondary, prior.secondary)) return 0.25;
  return 0;
}

/**
 * The winning fatigue reduction for the current exercise, or null when nothing
 * applies (feature off, no anchor, no overlapping prior).
 */
export function computeFatigueAdjustment(
  input: FatigueInput,
): FatigueAdjustment | null {
  const { reduction, unit, c1rm, current, priors } = input;
  if (reduction <= 0 || c1rm <= 0) return null;
  const baseKg = unit === "percent" ? (c1rm * reduction) / 100 : reduction;

  let tierFactor = 0;
  for (const prior of priors) {
    tierFactor = Math.max(tierFactor, muscleOverlapTier(current, prior));
  }
  if (tierFactor === 0) return null;

  const reductionKg = Math.min(baseKg * tierFactor, c1rm);
  return {
    reductionKg,
    scale: (c1rm - reductionKg) / c1rm,
    tierFactor,
  };
}
