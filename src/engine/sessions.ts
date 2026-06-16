import type {
  RoutineExerciseConfig,
  Routine,
  Set as LoggedSet,
  Workout,
} from "../db/types";

// ----------------------------------------------
// History → per-exercise session list. Pure grouping the fold consumes: one
// entry per workout that logged the exercise, ordered oldest-first, with sets
// merged across duplicate routine slots of the same movement and the config that
// shaped that session resolved from its workout's routine.
// ----------------------------------------------

export interface ExerciseSession {
  workoutId: string;
  at: number; // endTime ?? startTime — when the session is anchored in time
  sets: LoggedSet[]; // this exercise's logged sets, sorted by timestamp
  config?: RoutineExerciseConfig; // the routine config in effect for this session
}

/**
 * Every session in which `exerciseId` was logged, oldest-first. Duplicate slots
 * of the movement within one workout are merged (mirroring the engine's
 * "duplicate slots share the first slot's config" rule); workouts that logged no
 * sets for the exercise are omitted.
 */
export function groupSessions(
  workouts: Workout[],
  routinesById: Map<string, Routine>,
  exerciseId: string,
): ExerciseSession[] {
  const sessions: ExerciseSession[] = [];

  for (const workout of workouts) {
    const sets: LoggedSet[] = [];
    for (const we of workout.exercises) {
      if (we.exerciseId === exerciseId) sets.push(...we.sets);
    }
    if (!sets.length) continue;

    const routine = routinesById.get(workout.routineId);
    const config = routine?.exercises.find(
      (e) => e.exerciseId === exerciseId,
    )?.config;

    sessions.push({
      workoutId: workout.id,
      at: workout.endTime ?? workout.startTime,
      sets: [...sets].sort((a, b) => a.timestamp - b.timestamp),
      config,
    });
  }

  // Oldest-first; workoutId breaks ties so the fold order is fully deterministic.
  sessions.sort(
    (a, b) => a.at - b.at || a.workoutId.localeCompare(b.workoutId),
  );
  return sessions;
}
