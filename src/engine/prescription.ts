import type {
  DoubleProgressionParams,
  LinearProgressionParams,
  MesocycleWeek,
  NoneProgressionParams,
  ProgressionModelType,
  ProgressionState,
  RoutineExerciseConfig,
  RpeMatrix,
  TopSetProgressionParams,
} from "../db/types";
import { FOCUS_MODIFIERS } from "../config/periodization";
import { DEFAULT_TARGET_RPE } from "./config";
import { roundToLoadable, snapRpe, weightFromE1rm } from "./matrix";
import { deloadMultiplier } from "./deload";

// ----------------------------------------------
// Per-session prescription pipeline:
//   1. base targets from the progression model's config (+ engine state)
//   2. mesocycle modifiers (multiplicative, lock-gated)
//   3. the active deload (multiplicative on intensity, decaying — never
//      lock-gated: locks protect user config from periodization, not from
//      fatigue safety)
//   4. weight from the matrix at the final reps/RPE, via the working e1RM
//   5. top set + back-off expansion
// ----------------------------------------------

export interface PrescribedSet {
  reps: number;
  rpe: number | null;
  weight: number | null; // null until a working e1RM has been seeded
  role: "straight" | "top" | "backoff";
}

export interface ExercisePrescription {
  exerciseId: string;
  model: ProgressionModelType;
  sets: PrescribedSet[];
  workingE1rm: number | null;
}

export interface PrescriptionInput {
  exerciseId: string;
  config: RoutineExerciseConfig;
  state?: ProgressionState;
  matrix: RpeMatrix;
  week?: MesocycleWeek;
}

const clampSets = (value: number): number => Math.max(1, Math.round(value));
const clampReps = (value: number): number => Math.max(1, Math.round(value));
// snapRpe also enforces the RPE ≤ 10 clamp (and the matrix floor of 6).
const clampRpe = (value: number): number => snapRpe(value);

export function prescribeExercise(
  input: PrescriptionInput,
): ExercisePrescription {
  const { exerciseId, config, state, matrix, week } = input;
  const locked = config.lockedFields ?? [];
  const focus = week ? FOCUS_MODIFIERS[week.focus] : null;
  // The active deload tapers the intensity (RPE) target, lowering the derived
  // load; it does not scale volume.
  const intensityDeload = deloadMultiplier(state?.deload ?? null);

  // Steps 2 + 3 for one target value. Mesocycle modifiers respect field locks;
  // the deload always applies. Rounding/clamping happens once at the end so the
  // two multiplicative layers don't accumulate rounding bias.
  const adjust = (
    value: number,
    axis: "volume" | "intensity",
    lockKey: string | null,
  ): number => {
    let adjusted = value;
    if (focus && lockKey !== null && !locked.includes(lockKey)) {
      adjusted *= focus[axis];
    }
    if (axis === "intensity") adjusted *= intensityDeload;
    return adjusted;
  };

  // The matrix derives the loadable weight from the working e1RM at the given
  // reps/RPE, rounded to the bar.
  const weightFor = (reps: number, rpe: number): number | null =>
    state?.e1rm == null
      ? null
      : roundToLoadable(weightFromE1rm(matrix, state.e1rm, reps, rpe));

  switch (config.progressionModel) {
    case "linear": {
      const params = config.progressionParams as LinearProgressionParams;
      const sets = clampSets(adjust(params.targetSets, "volume", "targetSets"));
      const reps = clampReps(adjust(params.targetReps, "volume", "targetReps"));
      const rpe = clampRpe(
        adjust(
          params.targetRpe ?? DEFAULT_TARGET_RPE,
          "intensity",
          "targetRpe",
        ),
      );
      const weight = weightFor(reps, rpe);
      return {
        exerciseId,
        model: "linear",
        workingE1rm: state?.e1rm ?? null,
        sets: Array.from({ length: sets }, () => ({
          reps,
          rpe,
          weight,
          role: "straight" as const,
        })),
      };
    }

    case "double": {
      const params = config.progressionParams as DoubleProgressionParams;
      const sets = clampSets(adjust(params.targetSets, "volume", "targetSets"));
      // The rep goal is engine state (advancing minReps → maxReps), so the
      // mesocycle never touches it (lockKey null); the deload only tapers
      // intensity, so the rep goal passes through unchanged.
      const reps = clampReps(
        adjust(state?.currentTargetReps ?? params.minReps, "volume", null),
      );
      const rpe = clampRpe(adjust(DEFAULT_TARGET_RPE, "intensity", null));
      const weight = weightFor(reps, rpe);
      return {
        exerciseId,
        model: "double",
        workingE1rm: state?.e1rm ?? null,
        sets: Array.from({ length: sets }, () => ({
          reps,
          rpe,
          weight,
          role: "straight" as const,
        })),
      };
    }

    case "topset_backoff": {
      const params = config.progressionParams as TopSetProgressionParams;
      const topReps = clampReps(
        adjust(params.topSetTargetReps, "volume", "topSetTargetReps"),
      );
      const topRpe = clampRpe(
        adjust(params.topSetTargetRpe, "intensity", "topSetTargetRpe"),
      );
      // The top set itself satisfies the sets ≥ 1 clamp, so back-offs may
      // legitimately be modified down to zero.
      const backOffCount = Math.max(
        0,
        Math.round(adjust(params.backOffSets, "volume", "backOffSets")),
      );
      const topWeight = weightFor(topReps, topRpe);
      // Back-off load is re-derived from the top-set weight every session, so
      // it automatically follows e1RM movement and intensity modifiers.
      const backOffWeight =
        topWeight === null
          ? null
          : roundToLoadable(topWeight * (1 - params.percentageDrop / 100));
      return {
        exerciseId,
        model: "topset_backoff",
        workingE1rm: state?.e1rm ?? null,
        sets: [
          {
            reps: topReps,
            rpe: topRpe,
            weight: topWeight,
            role: "top" as const,
          },
          ...Array.from({ length: backOffCount }, () => ({
            reps: topReps,
            rpe: null, // back-offs are load-prescribed; RPE is whatever it costs
            weight: backOffWeight,
            role: "backoff" as const,
          })),
        ],
      };
    }

    case "none": {
      const params = config.progressionParams as NoneProgressionParams;
      const sets = clampSets(adjust(params.targetSets, "volume", "targetSets"));
      const reps = clampReps(adjust(params.targetReps, "volume", "targetReps"));
      const rpe = clampRpe(
        adjust(
          params.targetRpe ?? DEFAULT_TARGET_RPE,
          "intensity",
          "targetRpe",
        ),
      );
      const weight = weightFor(reps, rpe);
      return {
        exerciseId,
        model: "none",
        workingE1rm: state?.e1rm ?? null,
        sets: Array.from({ length: sets }, () => ({
          reps,
          rpe,
          weight,
          role: "straight" as const,
        })),
      };
    }
  }
}
