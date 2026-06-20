import type { RpeMatrix, Set as LoggedSet, Workout } from "../db/types";
import { peakImpliedE1rm } from "./matrix";

// ----------------------------------------------
// History → per-exercise sessions. Flattens workout history into an ordered
// stream of sessions per exercise (oldest → newest), merging duplicate slots of
// the same exercise within one workout into a single session.
//
// Pipeline stage: cold-start seeding + the rebuild path. The c1RM for a never-
// trained exercise seeds from the peak honest e1RM ever demonstrated; and because
// every transition (evaluate → step) is pure, the service can replay these
// ordered sessions to reconstruct ProgressionState from scratch if needed.
// ----------------------------------------------

export interface ExerciseSession {
  workoutId: string;
  startTime: number;
  sets: LoggedSet[]; // timestamp-sorted
}

const byTimestamp = (a: LoggedSet, b: LoggedSet) => a.timestamp - b.timestamp;

/** All sessions for one exercise across history, oldest → newest. */
export function groupSessionsFor(
  history: Workout[],
  exerciseId: string,
): ExerciseSession[] {
  const sessions: ExerciseSession[] = [];
  const workouts = [...history].sort((a, b) => a.startTime - b.startTime);
  for (const workout of workouts) {
    // Merge every slot of this exercise in the workout into one session.
    const sets = workout.exercises
      .filter((e) => e.exerciseId === exerciseId)
      .flatMap((e) => e.sets);
    if (sets.length === 0) continue;
    sessions.push({
      workoutId: workout.id,
      startTime: workout.startTime,
      sets: [...sets].sort(byTimestamp),
    });
  }
  return sessions;
}

/** Sessions for every exercise, keyed by exerciseId, each oldest → newest. */
export function groupAllSessions(
  history: Workout[],
): Map<string, ExerciseSession[]> {
  const ids = new Set<string>();
  for (const w of history) for (const e of w.exercises) ids.add(e.exerciseId);
  const map = new Map<string, ExerciseSession[]>();
  for (const id of ids) map.set(id, groupSessionsFor(history, id));
  return map;
}

/** The peak honest e1RM across a set of sessions — the cold-start c1RM seed. */
export function seedC1rmFromHistory(
  matrix: RpeMatrix,
  sessions: ExerciseSession[],
): number | null {
  const allSets = sessions.flatMap((s) => s.sets);
  return peakImpliedE1rm(matrix, allSets)?.e1rm ?? null;
}
