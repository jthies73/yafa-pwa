import { ref, watch } from "vue";
import type {
  LinearProgressionParams,
  DoubleProgressionParams,
  TopSetProgressionParams,
  Set as LoggedSet,
  WorkoutExercise,
} from "../db/types";
import type { PrescribedSet } from "../engine/prescription";
import { useActiveWorkout } from "./useActiveWorkout";

export interface SetEntry {
  id: string; // stable identity — becomes the persisted Set's id
  reps: string;
  weight: string;
  rpe: string;
  done: boolean;
  completedAt: number | null; // stamped when the set is marked done
  target?: PrescribedSet; // engine prescription backing this row, if any
}

export interface ExerciseCard {
  id: string; // stable key so reordering never re-creates the wrong card
  exerciseId: string;
  sets: SetEntry[];
}

// Mirror the row's own validity checks exactly (RPE is not required to complete).
export const setValid = (s: SetEntry) =>
  parseInt(s.reps, 10) >= 1 && parseFloat(s.weight) > 0;

// A set counts as completed only while its inputs remain valid, so clearing a
// value auto-uncompletes the set and retyping a valid one restores it.
export const isDone = (s: SetEntry) => s.done && setValid(s);

const newSet = (): SetEntry => ({
  id: crypto.randomUUID(),
  reps: "",
  weight: "",
  rpe: "",
  done: false,
  completedAt: null,
});

/** A tracker row prefilled with a prescribed set — one tap logs it as planned. */
export const prescribedSetEntry = (target: PrescribedSet): SetEntry => ({
  ...newSet(),
  reps: String(target.reps),
  weight: target.weight != null ? String(target.weight) : "",
  rpe: target.rpe != null ? String(target.rpe) : "",
  target,
});

/**
 * Converts a completed tracker row into the persisted Set record the engine
 * consumes. Targets come from the prescription when the row has one and fall
 * back to the actuals (the schema requires them). The timestamp is clamped
 * monotonic per exercise so the engine's sort-by-timestamp always reproduces
 * row order — row 1 stays the top set even when sets are completed out of
 * order.
 */
export function toSetRecord(entry: SetEntry, prevTimestamp: number): LoggedSet {
  const actualReps = parseInt(entry.reps, 10);
  const actualWeight = parseFloat(entry.weight);
  return {
    id: entry.id,
    timestamp: Math.max(entry.completedAt ?? 0, prevTimestamp + 1),
    targetReps: entry.target?.reps ?? actualReps,
    actualReps,
    targetWeight: entry.target?.weight ?? actualWeight,
    actualWeight,
    targetRpe: entry.target?.rpe ?? undefined,
    actualRpe: entry.rpe ? parseFloat(entry.rpe) : undefined,
    failure: false,
  };
}

export function useWorkoutTracker() {
  const {
    activeWorkout,
    routine,
    exercisesMap,
    prescriptions,
    syncExercises,
    syncProgress,
  } = useActiveWorkout();

  const cards = ref<ExerciseCard[]>([]);

  // Names of exercises added on the fly (not part of the original routine) so the
  // card header can resolve them without round-tripping through the composable.
  const addedNames = ref<Record<string, string>>({});

  function plannedSetCount(index: number): number {
    const config = routine.value?.exercises[index]?.config;
    if (!config) return 3;
    const p = config.progressionParams;
    if (config.progressionModel === "topset_backoff") {
      return 1 + ((p as TopSetProgressionParams).backOffSets ?? 0);
    }
    return (
      (p as LinearProgressionParams | DoubleProgressionParams).targetSets ?? 3
    );
  }

  function rebuild() {
    if (!activeWorkout.value) {
      cards.value = [];
      return;
    }
    addedNames.value = {};
    cards.value = activeWorkout.value.exercises.map((we, i) => {
      const prescription = prescriptions.value[we.exerciseId];
      return {
        id: crypto.randomUUID(),
        exerciseId: we.exerciseId,
        sets: prescription
          ? prescription.sets.map(prescribedSetEntry)
          : Array.from({ length: plannedSetCount(i) }, newSet),
      };
    });
  }

  watch(() => activeWorkout.value?.id, rebuild, { immediate: true });

  // Continuous projection: every card mutation re-derives the workout's
  // exercises (completed sets only, in final card order) so finishing the
  // workout needs no extra data path — activeWorkout is always truthful.
  function project() {
    const exercises: WorkoutExercise[] = [];
    let completed = 0;
    let pending = 0;
    for (const card of cards.value) {
      const sets: LoggedSet[] = [];
      let prevTimestamp = 0;
      for (const entry of card.sets) {
        if (isDone(entry)) {
          const record = toSetRecord(entry, prevTimestamp);
          prevTimestamp = record.timestamp;
          sets.push(record);
          completed += 1;
        } else {
          pending += 1;
        }
      }
      exercises.push({ exerciseId: card.exerciseId, sets });
    }
    syncExercises(exercises);
    syncProgress({ completed, pending });
  }

  watch(cards, project, { deep: true });

  const exerciseName = (id: string) =>
    exercisesMap.value[id]?.name || addedNames.value[id] || "Exercise";

  const addSet = (card: ExerciseCard) => {
    card.sets.push(newSet());
  };

  const deleteSet = (card: ExerciseCard, i: number) => {
    card.sets.splice(i, 1);
  };

  const deleteExercise = (card: ExerciseCard) => {
    cards.value = cards.value.filter((c) => c.id !== card.id);
  };

  const setState = (
    card: ExerciseCard,
    i: number,
  ): "finished" | "current" | "upcoming" => {
    if (isDone(card.sets[i])) return "finished";
    // The lowest set that isn't effectively done is the one to act on next.
    const firstIncomplete = card.sets.findIndex((s) => !isDone(s));
    return i === firstIncomplete ? "current" : "upcoming";
  };

  const completeSet = (card: ExerciseCard, i: number) => {
    const set = card.sets[i];
    set.done = true;
    set.completedAt ??= Date.now();
  };

  const toggleSet = (card: ExerciseCard, i: number) => {
    const set = card.sets[i];
    set.done = !set.done;
    if (set.done) set.completedAt ??= Date.now();
    else set.completedAt = null;
  };

  const addCardFor = (id: string, name: string) => {
    addedNames.value[id] = name;
    cards.value.push({
      id: crypto.randomUUID(),
      exerciseId: id,
      sets: [newSet()],
    });
  };

  const reorderCards = (from: number, to: number) => {
    const list = cards.value.slice();
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    cards.value = list;
  };

  return {
    cards,
    addedNames,
    exerciseName,
    addSet,
    deleteSet,
    deleteExercise,
    setState,
    completeSet,
    toggleSet,
    addCardFor,
    reorderCards,
    setValid,
    isDone,
  };
}
