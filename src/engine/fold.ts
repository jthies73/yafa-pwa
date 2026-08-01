import type {
  DoubleProgressionParams,
  ProgressionState,
  RpeMatrix,
  Set as LoggedSet,
} from "../db/types";
import { RPE_MATRIX_CORRECTION_MAX_DEVIATION } from "./constants";
import { liftSets } from "./bodyweight";
import { evaluate, isDoubleCursorAdvancementEligible } from "./evaluation";
import { correctRpeMatrix, impliedE1rm, isQualifyingSet } from "./matrix";
import type { EffectiveConfig } from "./mesocycle";
import type { ExercisePrescription } from "./prescription";
import {
  catchUpC1rm,
  corroboratedE1rm,
  representativeByDistance,
  step,
} from "./state";

// ----------------------------------------------
// Post-session fold. Turns one finished session into the single c1RM move it
// earned, plus any refinement to the exercise's RPE curve. Pure — the service
// supplies the persisted state and writes the result back.
//
// Pipeline stage: finish workout → evaluate → step → catch-up → (last) learn.
//
// Ordering that is load-bearing here:
//   • Evaluation sees ADDED-space sets against an added-space prescription (the
//     bodyweight offset cancels), while capacity math sees TOTAL space.
//   • Lift into total space BEFORE un-fatiguing — the transforms don't commute.
//   • Matrix learning runs last and anchors on the PRE-catch-up c1RM, so it can
//     only ever shape future sessions.
// ----------------------------------------------

/** The multiplicative scale a session's loads were rendered under. */
function fatigueScaleOf(prescription: ExercisePrescription): number {
  if (!prescription.c1rm) return 1;
  const scale =
    (prescription.c1rm - (prescription.fatigueReduction ?? 0)) /
    prescription.c1rm;
  // Scale 0 (the reduction consumed the whole anchor) would make un-fatiguing a
  // divide-by-zero, and such a session carries no usable signal anyway.
  return scale > 0 ? scale : 1;
}

/** A qualifying set restated in the space the anchor lives in. */
interface DemonstratedSet {
  weight: number; // TOTAL load, un-fatigued
  reps: number;
  rpe: number;
  e1rm: number;
}

/**
 * The session's qualifying sets restated against the UNREDUCED anchor, so the
 * two can be compared like with like: lifted into total space, then divided by
 * the fatigue scale the loads were rendered under (a reduced session logs
 * lighter weights, which would otherwise read as lost capacity and could
 * false-trigger catch-up).
 *
 * Both the catch-up estimate and the RPE-curve correction read the session
 * through this one lens, so they can never disagree on what it demonstrated.
 */
export function demonstratedSets(
  matrix: RpeMatrix,
  sets: LoggedSet[],
  offsetKg: number,
  prescription: ExercisePrescription,
): DemonstratedSet[] {
  const scale = fatigueScaleOf(prescription);
  return liftSets(sets, offsetKg)
    .filter(isQualifyingSet)
    .map((s) => {
      const weight = s.actualWeight / scale;
      return {
        weight,
        reps: s.actualReps,
        rpe: s.actualRpe!,
        e1rm: impliedE1rm(matrix, weight, s.actualReps, s.actualRpe!),
      };
    });
}

export interface SessionFold {
  persisted: ProgressionState;
  reason: "increment" | "hold" | "regression" | "recalibrate";
}

/**
 * One c1RM move per session. Catch-up is evaluated on EVERY outcome (including
 * regression — a grind over the ceiling still yields qualifying observations).
 * When it fires, this session's demonstrated capacity diverged strongly from the
 * anchor and it takes FULL PRECEDENCE over the deterministic rules: the c1RM
 * jumps toward the estimate, the regression streak clears, and no reset is armed
 * this session. The 3-strike −10% reset is the fallback only for sustained SMALL
 * regressions that stay inside the catch-up threshold. When catch-up does not
 * fire, `step` stands unchanged (streak/reset/cursor).
 */
export function foldSession(input: {
  state: ProgressionState;
  eff: EffectiveConfig;
  prescription: ExercisePrescription;
  sets: LoggedSet[]; // added space, timestamp-sorted
  demonstrated: DemonstratedSet[];
  workoutId: string;
  finishedAt: number;
}): SessionFold {
  const { state, eff, prescription, sets, demonstrated } = input;

  const outcome = evaluate(eff.model, eff.params, prescription, sets);
  const next = step(
    state,
    outcome,
    eff.model,
    eff.params,
    input.workoutId,
    input.finishedAt,
    {
      advanceDoubleCursor:
        eff.model === "double"
          ? isDoubleCursorAdvancementEligible(
              eff.params as DoubleProgressionParams,
              prescription,
              sets,
            )
          : undefined,
    },
  );

  // Non-null: the caller routes cold-start exercises to seeding instead.
  const anchor = state.c1rm!;
  const caught = catchUpC1rm(
    anchor,
    corroboratedE1rm(
      demonstrated.map((d) => d.e1rm),
      anchor,
    ),
  );
  const fired = caught !== anchor;

  return {
    persisted: fired
      ? { ...next, c1rm: caught, regressionStreak: 0, resetPending: false }
      : next,
    reason: fired
      ? "recalibrate"
      : outcome === "success"
        ? "increment"
        : outcome,
  };
}

/**
 * Refine the exercise's RPE curve from this session, or null to leave it alone.
 * The representative set is chosen by the same anti-fluke rule the catch-up uses
 * (`representativeByDistance`), so the two can never weigh a different set.
 *
 * The deviation gate keeps corrections to honest sets that already broadly agree
 * with the anchor: this only refines curve SHAPE, while a larger divergence is
 * catch-up's job to resolve by moving the anchor instead.
 */
export function learnedRpeMatrix(
  matrix: RpeMatrix,
  demonstrated: DemonstratedSet[],
  anchor: number,
): RpeMatrix | null {
  const rep = representativeByDistance(demonstrated, (d) => d.e1rm, anchor);
  if (!rep) return null;
  if (
    Math.abs(rep.e1rm - anchor) / anchor >
    RPE_MATRIX_CORRECTION_MAX_DEVIATION
  )
    return null;

  return correctRpeMatrix(
    matrix,
    { actualWeight: rep.weight, actualReps: rep.reps, actualRpe: rep.rpe },
    anchor,
  );
}
