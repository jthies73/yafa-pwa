import type {
  Routine,
  RoutineExerciseConfig,
  RpeMatrix,
  Set as LoggedSet,
  Workout,
} from "../db/types";
import { seedE1rm } from "./matrix";

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

/**
 * Merge duplicate exercise slots of ONE workout into a timestamp-sorted set list
 * per exercise, in the order the exercises were logged. An exercise that logged
 * nothing is omitted entirely — it must not reach the fold, which would stamp it
 * as processed and silently consume its cold start.
 */
export function groupSetsByExercise(
  workout: Workout,
): Map<string, LoggedSet[]> {
  const map = new Map<string, LoggedSet[]>();
  for (const we of workout.exercises) {
    if (!we.sets.length) continue;
    map.set(we.exerciseId, [...(map.get(we.exerciseId) ?? []), ...we.sets]);
  }
  for (const sets of map.values()) sets.sort(byTimestamp);
  return map;
}

/** Index a routine's exercise configs by exercise id (first slot wins). */
export function buildConfigMap(
  routine: Routine | undefined,
): Map<string, RoutineExerciseConfig | undefined> {
  const map = new Map<string, RoutineExerciseConfig | undefined>();
  for (const re of routine?.exercises ?? []) {
    if (!map.has(re.exerciseId)) map.set(re.exerciseId, re.config);
  }
  return map;
}

/**
 * The peak honest e1RM across a set of sessions — the cold-start c1RM seed.
 * Prefers qualifying (RPE ≥ 8) sets, but falls back to the best usable set so even
 * a history of sub-limit work still establishes an anchor.
 */
export function seedC1rmFromHistory(
  matrix: RpeMatrix,
  sessions: ExerciseSession[],
): number | null {
  return seedE1rm(
    matrix,
    sessions.flatMap((s) => s.sets),
  );
}
