import type {
  RoutineExercise,
  RoutineExerciseConfig,
  TopSetProgressionParams,
  LinearProgressionParams,
  DoubleProgressionParams,
  ProgressionParams,
  Workout,
  WorkoutExercise,
} from "../db/types";
import { normalizeProgressionParams } from "../config/progression";

export function getConfigSetCount(config?: RoutineExerciseConfig): number {
  if (!config) return 3;
  // Normalize so legacy configs missing optional params count the same sets the
  // engine actually prescribes.
  const p = normalizeProgressionParams(
    config.progressionModel,
    config.progressionParams,
  );
  if (config.progressionModel === "topset_backoff") {
    return 1 + (p as TopSetProgressionParams).backOffSets;
  }
  return (p as LinearProgressionParams | DoubleProgressionParams).targetSets;
}

/** The most frequent actualReps across a slot's sets; ties break to the higher
 * rep count. Returns undefined when there are no sets. */
function modalReps(ex: WorkoutExercise): number | undefined {
  if (!ex.sets.length) return undefined;
  const counts = new Map<number, number>();
  for (const s of ex.sets)
    counts.set(s.actualReps, (counts.get(s.actualReps) ?? 0) + 1);
  let best: number | undefined;
  let bestCount = -1;
  for (const [reps, count] of counts) {
    if (count > bestCount || (count === bestCount && reps > (best ?? -1))) {
      best = reps;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Map a finished workout to routine exercise slots, one slot per workout exercise
 * (in order, so duplicate movements stay separate slots). Every slot uses the
 * "none" progression model, with targetSets/targetReps seeded from what was
 * actually logged; note-only exercises (no sets) fall back to the model defaults.
 */
export function workoutToRoutineExercises(workout: Workout): RoutineExercise[] {
  return workout.exercises.map((ex) => {
    const setCount = ex.sets.length;
    const reps = modalReps(ex);
    const seed = {
      // Omit (leave undefined) when there's nothing logged so the default applies.
      targetSets: setCount > 0 ? setCount : undefined,
      targetReps: reps,
    } as unknown as ProgressionParams;
    return {
      exerciseId: ex.exerciseId,
      config: {
        progressionModel: "none",
        progressionParams: normalizeProgressionParams("none", seed),
      },
    };
  });
}
