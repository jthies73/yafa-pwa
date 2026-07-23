import type {
  DoubleProgressionParams,
  LinearProgressionParams,
  ProgressionModelType,
  ProgressionParams,
  Set as LoggedSet,
  TopSetProgressionParams,
} from "../db/types";
import type { ExercisePrescription } from "./prescription";
import { weightMatches } from "./comparison";

// ----------------------------------------------
// Per-model outcome judgment. Given an exercise's effective config, the original
// prescription, and the logged sets, decide whether the session was a success,
// a hold, or a regression — deterministically from the locked rules.
//
// Pipeline stage: finish workout → evaluate. The outcome feeds state.step, which
// is what actually moves the c1RM. This module is the ONLY place the rules live.
//
// Two cross-cutting decisions:
//   • "Worst set decides" — for multi-set models the hardest set (highest RPE,
//     tie-break fewest reps) drives a regression; success needs every set.
//   • "Evaluate against the original prescription" — weights are compared to the
//     re-rendered original prescribed weight, so an in-session re-prescription
//     DOWN never disguises a miss as success. The set that triggered the
//     re-prescription was logged at the original weight and, being the hardest,
//     is the worst set anyway.
// Missing actualRpe can neither confirm a success nor trigger an RPE-regression,
// so it falls through to "hold" — the safe, non-progressing outcome.
// ----------------------------------------------

export type ProgressionOutcome = "success" | "hold" | "regression";

/** The prescribed working sets that were actually performed, in prescribed order. */
function orderedWorkingSets(
  prescription: ExercisePrescription,
  loggedSets: LoggedSet[],
): LoggedSet[] {
  const n = prescription.sets.length;
  return [...loggedSets].sort((a, b) => a.timestamp - b.timestamp).slice(0, n);
}

/** The hardest set: highest RPE, tie-break fewest reps. Null for an empty list. */
function worstSet(sets: LoggedSet[]): LoggedSet | null {
  if (sets.length === 0) return null;
  return sets.reduce((worst, s) => {
    const sr = s.actualRpe ?? -Infinity;
    const wr = worst.actualRpe ?? -Infinity;
    if (sr > wr) return s;
    if (sr === wr && s.actualReps < worst.actualReps) return s;
    return worst;
  });
}

export function evaluate(
  model: ProgressionModelType,
  params: ProgressionParams,
  prescription: ExercisePrescription,
  loggedSets: LoggedSet[],
): ProgressionOutcome {
  const working = orderedWorkingSets(prescription, loggedSets);
  switch (model) {
    case "linear":
      return evaluateLinear(
        params as LinearProgressionParams,
        prescription,
        working,
      );
    case "double":
      return evaluateDouble(
        params as DoubleProgressionParams,
        prescription,
        working,
      );
    case "topset_backoff":
      return evaluateTopSet(
        params as TopSetProgressionParams,
        prescription,
        working,
      );
    case "none":
      return "hold";
  }
}

function evaluateLinear(
  p: LinearProgressionParams,
  prescription: ExercisePrescription,
  working: LoggedSet[],
): ProgressionOutcome {
  const W = prescription.sets[0]?.weight; // straight sets share one weight
  const allPerformed = working.length >= prescription.sets.length;

  const success =
    allPerformed &&
    W != null &&
    working.every(
      (s) =>
        s.actualReps >= p.targetReps &&
        s.actualRpe != null &&
        s.actualRpe <= p.targetRpe &&
        weightMatches(s.actualWeight, W),
    );
  if (success) return "success";

  const worst = worstSet(working);
  if (
    worst &&
    W != null &&
    worst.actualReps <= p.targetReps &&
    weightMatches(worst.actualWeight, W) &&
    worst.actualRpe != null &&
    worst.actualRpe > p.targetRpe
  ) {
    return "regression";
  }
  return "hold";
}

/**
 * For double progression, check if the session met target reps and target RPE to
 * qualify for rep cursor advancement on a "hold" outcome.
 */
export function isDoubleCursorAdvancementEligible(
  p: DoubleProgressionParams,
  prescription: ExercisePrescription,
  loggedSets: LoggedSet[],
): boolean {
  const working = orderedWorkingSets(prescription, loggedSets);
  if (working.length < prescription.sets.length) return false;
  const targetReps = prescription.sets[0]?.reps ?? p.minReps;
  const hitsTarget = working.every((s) => s.actualReps >= targetReps);
  const worst = worstSet(working);
  const worstRpeOk = worst?.actualRpe != null && worst.actualRpe <= p.targetRpe;
  return hitsTarget && worstRpeOk;
}

function evaluateDouble(
  p: DoubleProgressionParams,
  prescription: ExercisePrescription,
  working: LoggedSet[],
): ProgressionOutcome {
  const allPerformed = working.length >= prescription.sets.length;
  const worst = worstSet(working);
  const W = prescription.sets[0]?.weight; // double holds one weight across sets

  // Success: every set hit the top of the rep range and the hardest set stayed
  // at/under target RPE → the load has been earned; advance it.
  const allMax =
    allPerformed && working.every((s) => s.actualReps >= p.maxReps);
  const worstRpeOk = worst?.actualRpe != null && worst.actualRpe <= p.targetRpe;
  if (allMax && worstRpeOk) return "success";

  // Regression: bottomed out at minReps and grinding (RPE+1 > target), at the
  // prescribed weight — a grind at a deviated load says nothing about the
  // prescribed one, so it holds (same weight clause as linear/top-set).
  // NOTE (locked-but-watch): `RPE + 1 > targetRpe` ⇔ `RPE > targetRpe − 1`, so at
  // the default target 8 this fires whenever the worst set's RPE exceeds 7 while
  // reps are at/under minReps. Encoded exactly as specified; revisit with real logs.
  if (
    worst &&
    W != null &&
    worst.actualReps <= p.minReps &&
    weightMatches(worst.actualWeight, W) &&
    worst.actualRpe != null &&
    worst.actualRpe + 1 > p.targetRpe
  ) {
    return "regression";
  }
  return "hold";
}

function evaluateTopSet(
  p: TopSetProgressionParams,
  prescription: ExercisePrescription,
  working: LoggedSet[],
): ProgressionOutcome {
  const top = working[0]; // first by timestamp = the top set
  if (!top) return "hold";
  const W = prescription.sets.find((s) => s.role === "top")?.weight;

  // Success keys on reps + RPE only (no weight clause, per the rule).
  if (
    top.actualReps >= p.topSetTargetReps &&
    top.actualRpe != null &&
    top.actualRpe <= p.topSetTargetRpe
  ) {
    return "success";
  }

  if (
    W != null &&
    top.actualReps <= p.topSetTargetReps &&
    weightMatches(top.actualWeight, W) &&
    top.actualRpe != null &&
    top.actualRpe > p.topSetTargetRpe
  ) {
    return "regression";
  }
  return "hold";
}
