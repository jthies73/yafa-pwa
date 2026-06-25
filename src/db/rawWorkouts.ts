import type {
  Exercise,
  Set as WorkoutSet,
  Workout,
  WorkoutExercise,
} from "./types";

// ----------------------------------------------
// RAW workout representation + reconstruction fallback.
//
// Workouts are the only data a user cannot recreate by hand, so a backup also
// carries them in a forgiving, name-keyed shape: exercise name → list of
// { timestamp, reps, weight, rpe }. If the structured `workouts` import ever
// fails (corrupt shape, dangling exerciseId, schema drift), we rebuild from this
// raw map instead of losing the history.
//
// Reconstruction assumes ONE workout per calendar day: every set logged on the
// same local day is folded into a single Workout. Pure module (no Dexie, no
// DOM) — callers pass in existing rows and persist the returned objects.
// ----------------------------------------------

export interface RawSet {
  timestamp: number;
  reps: number;
  weight: number; // kg (source-of-truth, same as the structured store)
  rpe?: number;
}

export type RawWorkouts = Record<string /* exercise name */, RawSet[]>;

// Sentinel routineId for reconstructed workouts: the raw fallback can only
// recover exercises + sets, so the originating routine is unknown. It also
// scopes the idempotency check (see reconstructWorkoutsFromRaw) so repeated raw
// imports add nothing. The app already tolerates workouts whose routine doesn't
// exist (History shows "Workout"), so no routine row is created.
export const UNKNOWN_ROUTINE_ID = "unknown";

/**
 * Flatten structured workouts into the name-keyed raw map. Sets whose
 * `exerciseId` has no matching Exercise are skipped — they can't be named, so
 * they'd be unrecoverable on the raw path anyway.
 */
export function buildRawWorkouts(
  workouts: Workout[],
  exercisesById: Map<string, Exercise>,
): RawWorkouts {
  const raw: RawWorkouts = {};
  for (const workout of workouts) {
    for (const we of workout.exercises) {
      const name = exercisesById.get(we.exerciseId)?.name;
      if (!name) continue;
      const list = (raw[name] ??= []);
      for (const set of we.sets) {
        const rawSet: RawSet = {
          timestamp: set.timestamp,
          reps: set.actualReps,
          weight: set.actualWeight,
        };
        if (set.actualRpe !== undefined) rawSet.rpe = set.actualRpe;
        list.push(rawSet);
      }
    }
  }
  return raw;
}

const normalizeName = (name: string): string => name.trim().toLowerCase();

/** "YYYY-MM-DD" in local time — the identity for "same day = same workout". */
const localDayKey = (ts: number): string => {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export interface ReconstructInput {
  raw: RawWorkouts;
  existingExercises: Exercise[]; // find-or-create dedup by normalized name
  existingWorkouts: Workout[]; // workouts already on the imported routine (idempotency)
  routineId: string;
  now: number;
  newId: () => string;
  dayKey?: (ts: number) => string; // injectable for tests; defaults to local day
}

export interface ReconstructResult {
  exercisesToAdd: Exercise[]; // only genuinely-new exercises
  workoutsToPut: Workout[]; // one per day not already reconstructed
}

/**
 * Rebuild Exercises + Workouts from the raw map, deduping exercises by name and
 * skipping days already present on the imported routine so a repeated import
 * adds nothing.
 */
export function reconstructWorkoutsFromRaw(
  input: ReconstructInput,
): ReconstructResult {
  const { raw, existingExercises, existingWorkouts, routineId, now, newId } =
    input;
  const dayKey = input.dayKey ?? localDayKey;

  // 1) Resolve every raw key to an Exercise id, creating missing ones once.
  const byName = new Map<string, Exercise>();
  for (const ex of existingExercises) byName.set(normalizeName(ex.name), ex);

  const exercisesToAdd: Exercise[] = [];
  const idForName = new Map<string, string>(); // raw key → exerciseId
  for (const name of Object.keys(raw)) {
    const norm = normalizeName(name);
    let exercise = byName.get(norm);
    if (!exercise) {
      exercise = {
        id: newId(),
        name,
        primaryMuscleGroups: [],
        created_at: now,
      };
      byName.set(norm, exercise);
      exercisesToAdd.push(exercise);
    }
    idForName.set(name, exercise.id);
  }

  // 2) Days already reconstructed — skip them so re-import is idempotent.
  const presentDays = new Set(existingWorkouts.map((w) => dayKey(w.startTime)));

  // 3) Group every raw set by day, then by exercise within the day.
  //    Map<dayKey, Map<exerciseId, WorkoutSet[]>>
  const days = new Map<string, Map<string, WorkoutSet[]>>();
  for (const [name, sets] of Object.entries(raw)) {
    const exerciseId = idForName.get(name)!;
    for (const rs of sets) {
      const key = dayKey(rs.timestamp);
      if (presentDays.has(key)) continue;
      const byExercise = days.get(key) ?? new Map<string, WorkoutSet[]>();
      if (!days.has(key)) days.set(key, byExercise);
      const list = byExercise.get(exerciseId) ?? [];
      if (!byExercise.has(exerciseId)) byExercise.set(exerciseId, list);
      const set: WorkoutSet = {
        id: newId(),
        timestamp: rs.timestamp,
        targetReps: rs.reps,
        actualReps: rs.reps,
        targetWeight: rs.weight,
        actualWeight: rs.weight,
        failure: false,
      };
      if (rs.rpe !== undefined) {
        set.targetRpe = rs.rpe;
        set.actualRpe = rs.rpe;
      }
      list.push(set);
    }
  }

  // 4) One Workout per day (ascending), start/end spanning the day's sets.
  const workoutsToPut: Workout[] = [];
  for (const key of [...days.keys()].sort()) {
    const byExercise = days.get(key)!;
    const exercises: WorkoutExercise[] = [];
    let startTime = Infinity;
    let endTime = -Infinity;
    for (const [exerciseId, sets] of byExercise) {
      exercises.push({ exerciseId, sets });
      for (const s of sets) {
        if (s.timestamp < startTime) startTime = s.timestamp;
        if (s.timestamp > endTime) endTime = s.timestamp;
      }
    }
    workoutsToPut.push({
      id: newId(),
      routineId,
      startTime,
      endTime,
      exercises,
    });
  }

  return { exercisesToAdd, workoutsToPut };
}
