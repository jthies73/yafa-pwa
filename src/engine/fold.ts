import type {
  DoubleProgressionParams,
  ProgressionState,
  RpeMatrix,
  Set as LoggedSet,
} from "../db/types";
import { liftSets } from "./bodyweight";
import { evaluate, isDoubleCursorAdvancementEligible } from "./evaluation";
import { impliedE1rm, isQualifyingSet } from "./matrix";
import type { EffectiveConfig } from "./mesocycle";
import type { ExercisePrescription } from "./prescription";
import { catchUpC1rm, corroboratedE1rm, step } from "./state";

// ----------------------------------------------
// Post-session fold. Turns one finished session into the single c1RM move it
// earned. Pure — the service supplies the persisted state and writes the result
// back.
//
// Pipeline stage: finish workout → evaluate → step → catch-up.
//
// Ordering that is load-bearing here:
//   • Evaluation sees ADDED-space sets against an added-space prescription (the
//     bodyweight offset cancels), while capacity math sees TOTAL space.
//   • Lift into total space BEFORE un-fatiguing — the transforms don't commute.
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

/**
 * The e1RMs a session's qualifying sets demonstrated, restated against the
 * UNREDUCED anchor so the two can be compared like with like: lifted into total
 * space, then divided by the fatigue scale the loads were rendered under (a
 * reduced session logs lighter weights, which would otherwise read as lost
 * capacity and could false-trigger catch-up).
 */
export function demonstratedE1rms(
  matrix: RpeMatrix,
  sets: LoggedSet[],
  offsetKg: number,
  prescription: ExercisePrescription,
): number[] {
  const scale = fatigueScaleOf(prescription);
  return liftSets(sets, offsetKg)
    .filter(isQualifyingSet)
    .map((s) =>
      impliedE1rm(matrix, s.actualWeight / scale, s.actualReps, s.actualRpe!),
    );
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
  demonstrated: number[]; // this session's demonstrated e1RMs
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
  const caught = catchUpC1rm(anchor, corroboratedE1rm(demonstrated, anchor));
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
