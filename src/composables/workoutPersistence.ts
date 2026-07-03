// Persistence for the in-progress workout so a session survives an app close,
// reload, or phone reboot and resumes exactly where it was left. The whole live
// session is snapshotted as one JSON blob in localStorage (device-only, never in
// backups — like the route key it replaced).
//
// Pure module: the Storage is injected and there is no Vue runtime import, so it
// stays unit-testable. The Vue wiring (watchers, restore) lives in
// useActiveWorkout / useWorkoutTracker.

import type { Routine, Exercise } from "../db/types";
import type { ExercisePrescription } from "../engine/prescription";
import type { CalculatorSet } from "./useActiveWorkout";
import type { ExerciseCard } from "./useWorkoutTracker";

export const ACTIVE_WORKOUT_KEY = "yafa:activeWorkout";
// Bump to invalidate snapshots whose shape this code can no longer read.
// v2: prescriptions became a slot-aligned array (was keyed by exerciseId).
export const SNAPSHOT_VERSION = 2;

// The complete running session. `cards`/`addedNames` carry the tracker's live
// state (incl. pending inputs and adjusted targets) — `activeWorkout.exercises`
// alone only holds completed sets, so it can't reconstruct the session. Routine,
// exercises, and prescriptions are embedded so resume is independent of later DB
// edits and never re-runs the engine.
export interface WorkoutSessionSnapshot {
  version: number;
  workout: { id: string; routineId: string; startTime: number };
  routine: Routine | null;
  exercisesMap: Record<string, Exercise>;
  prescriptions: (ExercisePrescription | null)[]; // slot-aligned with routine.exercises
  plannedCounts: Record<string, number>;
  calculatorSets: CalculatorSet[];
  isMinimized: boolean;
  cards: ExerciseCard[];
  addedNames: Record<string, string>;
}

/** Read the session snapshot, or null when absent, corrupt, or a stale version. */
export function readWorkoutSnapshot(
  store: Pick<Storage, "getItem">,
): WorkoutSessionSnapshot | null {
  const raw = store.getItem(ACTIVE_WORKOUT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<WorkoutSessionSnapshot>;
    if (parsed?.version !== SNAPSHOT_VERSION || !parsed?.workout?.id)
      return null;
    return parsed as WorkoutSessionSnapshot;
  } catch {
    return null;
  }
}

/** Persist the session snapshot. JSON.stringify strips Vue reactive proxies. */
export function writeWorkoutSnapshot(
  store: Pick<Storage, "setItem">,
  snapshot: Omit<WorkoutSessionSnapshot, "version">,
): void {
  store.setItem(
    ACTIVE_WORKOUT_KEY,
    JSON.stringify({ ...snapshot, version: SNAPSHOT_VERSION }),
  );
}

/** Drop the persisted session (on finish or discard). */
export function clearWorkoutSnapshot(store: Pick<Storage, "removeItem">): void {
  store.removeItem(ACTIVE_WORKOUT_KEY);
}
