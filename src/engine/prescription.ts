import type {
  DoubleProgressionParams,
  LinearProgressionParams,
  NoneProgressionParams,
  ProgressionModelType,
  ProgressionParams,
  RpeMatrix,
  TopSetProgressionParams,
} from "../db/types";
import { matrixPct, roundToLoadable, weightFromE1rm } from "./matrix";
import { solveReps } from "./calculator";

// ----------------------------------------------
// Prescription. Turns an exercise's EFFECTIVE config (already normalized and
// mesocycle-shifted) plus its c1RM into the concrete sets the tracker renders.
//
// Pipeline stage: prescription. The service applies any pending reset to the
// c1RM BEFORE calling this, so prescribeExercise just renders from the effective
// c1RM it is handed — it is pure and stateless.
//
// Decisions encoded here:
//   • "Target judges, Ceiling caps load": the load aims for targetRpe, but if the
//     (possibly meso-raised) targetRpe exceeds rpeCeiling, the WEIGHT is rendered
//     at the ceiling. The set's displayed rpe still shows targetRpe — only the
//     load is capped.
//   • Double progression holds the weight CONSTANT across the rep cycle: the load
//     is computed at maxReps while the displayed rep target is the cursor.
//   • Cold start (c1rm == null): sets carry reps/rpe but weight: null, so the
//     tracker shows a free-entry row and the first qualifying session seeds c1RM.
//   • Same-session fatigue: an optional kg reduction (resolved by engine/fatigue.ts)
//     subtracts from the anchor before rendering. The output still reports the
//     UNREDUCED c1rm and echoes the reduction separately.
// ----------------------------------------------

export interface PrescribedSet {
  reps: number;
  rpe: number | null;
  weight: number | null; // null until a working c1RM has been seeded
  role: "straight" | "top" | "backoff";
  // Back-off only: load as a fraction of the top set's. Lets the tracker fill the
  // weight once a cold-start top set is logged (no c1RM yet → weight is null).
  backoffFraction?: number;
}

export interface ExercisePrescription {
  exerciseId: string;
  model: ProgressionModelType;
  sets: PrescribedSet[];
  c1rm: number | null; // the UNREDUCED post-reset anchor, even when fatigue applied
  // Same-session fatigue reduction (kg) the loads were rendered under. Transient:
  // echoed so the preview can show it and the tracker can re-derive scales; the
  // stored c1RM never changes. Absent/0 ⇒ none applied.
  fatigueReduction?: number;
}

export interface PrescriptionInput {
  exerciseId: string;
  model: ProgressionModelType;
  params: ProgressionParams; // normalized + mesocycle-shifted (effective targets)
  rpeCeiling: number; // raw guardrail (not periodized)
  effectiveC1rm: number | null; // reset already applied by the service if pending
  fatigueReduction?: number; // kg off the anchor, resolved by engine/fatigue.ts
  doubleRepCursor?: number; // double model only
  matrix: RpeMatrix;
}

export function prescribeExercise(
  input: PrescriptionInput,
): ExercisePrescription {
  const { model, params, rpeCeiling, effectiveC1rm: c1rm, matrix } = input;
  const fatigue = input.fatigueReduction ?? 0;

  // Weight at (reps, targetRpe), capped so its expected RPE never exceeds the
  // ceiling. Null until c1RM is seeded. Renders from the fatigue-reduced anchor;
  // being linear in it, every set (top and back-offs included) scales alike.
  const load = (reps: number, targetRpe: number): number | null => {
    if (c1rm == null) return null;
    const anchor = Math.max(0, c1rm - fatigue);
    const loadRpe = Math.min(targetRpe, rpeCeiling);
    return roundToLoadable(weightFromE1rm(matrix, anchor, reps, loadRpe));
  };

  const sets = buildSets(
    model,
    params,
    input.doubleRepCursor,
    load,
    matrix,
    rpeCeiling,
  );
  return {
    exerciseId: input.exerciseId,
    model,
    sets,
    c1rm,
    ...(fatigue > 0 && c1rm != null ? { fatigueReduction: fatigue } : {}),
  };
}

function buildSets(
  model: ProgressionModelType,
  params: ProgressionParams,
  cursor: number | undefined,
  load: (reps: number, targetRpe: number) => number | null,
  matrix: RpeMatrix,
  rpeCeiling: number,
): PrescribedSet[] {
  switch (model) {
    case "linear": {
      const p = params as LinearProgressionParams;
      return Array.from({ length: p.targetSets }, () => ({
        reps: p.targetReps,
        rpe: p.targetRpe,
        weight: load(p.targetReps, p.targetRpe),
        role: "straight" as const,
      }));
    }
    case "double": {
      const p = params as DoubleProgressionParams;
      const reps = cursor ?? p.minReps;
      // Weight is fixed at maxReps so it holds across the whole rep cycle.
      const weight = load(p.maxReps, p.targetRpe);
      return Array.from({ length: p.targetSets }, () => ({
        reps,
        rpe: p.targetRpe,
        weight,
        role: "straight" as const,
      }));
    }
    case "topset_backoff": {
      const p = params as TopSetProgressionParams;
      const topWeight = load(p.topSetTargetReps, p.topSetTargetRpe);
      const backoffFraction = 1 - p.percentageDrop / 100;
      const backWeight =
        topWeight == null ? null : roundToLoadable(topWeight * backoffFraction);
      // Back-off reps are DERIVED, not configured: at the dropped load, how many
      // reps land on backOffRpe? Independent of c1RM because the back-off's
      // %-of-1RM is just the top set's (at its capped load) scaled by the drop —
      // so it renders even at cold start. solveReps with e1rm=1 minimizes
      // |matrixPct(reps, backOffRpe) − backPct|.
      const loadRpe = Math.min(p.topSetTargetRpe, rpeCeiling);
      const backPct =
        matrixPct(matrix, p.topSetTargetReps, loadRpe) * backoffFraction;
      const backReps = solveReps(matrix, 1, backPct, p.backOffRpe);
      const sets: PrescribedSet[] = [
        {
          reps: p.topSetTargetReps,
          rpe: p.topSetTargetRpe,
          weight: topWeight,
          role: "top",
        },
      ];
      for (let i = 0; i < p.backOffSets; i++) {
        sets.push({
          reps: backReps,
          rpe: p.backOffRpe,
          weight: backWeight,
          role: "backoff",
          backoffFraction,
        });
      }
      return sets;
    }
    case "none": {
      const p = params as NoneProgressionParams;
      // "none" never prescribes above target → load at targetRpe (no ceiling cap).
      return Array.from({ length: p.targetSets }, () => ({
        reps: p.targetReps,
        rpe: p.targetRpe,
        weight: load(p.targetReps, p.targetRpe),
        role: "straight" as const,
      }));
    }
  }
}
