import { ref, computed } from "vue";
import { db } from "../db/db";
import type { Workout, Routine, Exercise } from "../db/types";

const activeWorkout = ref<Workout | null>(null);
const routine = ref<Routine | null>(null);
const exercisesMap = ref<Record<string, Exercise>>({});
const isMinimized = ref(false);
const showSheet = ref(false);

export function useActiveWorkout() {
  const startWorkout = async (routineId?: string) => {
    let r: Routine | null = null;
    const eMap: Record<string, Exercise> = {};

    if (routineId) {
      r = (await db.routines.get(routineId)) ?? null;
      if (r) {
        const exerciseIds = new Set<string>();
        for (const e of r.exercises) {
          exerciseIds.add(e.exerciseId);
        }
        const eList = await Promise.all(
          Array.from(exerciseIds).map((id) => db.exercises.get(id)),
        );
        for (const e of eList) {
          if (e) eMap[e.id] = e;
        }
      }
    }

    const workoutExercises = (r?.exercises || []).map((ex) => ({
      exerciseId: ex.exerciseId,
      sets: [],
    }));

    activeWorkout.value = {
      id: crypto.randomUUID(),
      routineId: routineId || "",
      startTime: Date.now(),
      exercises: workoutExercises,
    };

    routine.value = r;
    exercisesMap.value = eMap;
    isMinimized.value = false;
    showSheet.value = true;
  };

  const finishWorkout = async () => {
    if (!activeWorkout.value) return;

    const completedWorkout: Workout = {
      ...activeWorkout.value,
      endTime: Date.now(),
    };

    await db.workouts.add(completedWorkout);

    activeWorkout.value = null;
    routine.value = null;
    exercisesMap.value = {};
    isMinimized.value = false;
    showSheet.value = false;
  };

  const discardWorkout = () => {
    activeWorkout.value = null;
    routine.value = null;
    exercisesMap.value = {};
    isMinimized.value = false;
    showSheet.value = false;
  };

  const minimize = () => {
    isMinimized.value = true;
  };

  const maximize = () => {
    // Reliably reopen, even if the sheet was previously dragged closed
    // while a workout was still active.
    showSheet.value = true;
    isMinimized.value = false;
  };

  return {
    activeWorkout: computed(() => activeWorkout.value),
    routine: computed(() => routine.value),
    exercisesMap: computed(() => exercisesMap.value),
    isMinimized: computed({
      get: () => isMinimized.value,
      set: (val) => {
        isMinimized.value = val;
      },
    }),
    showSheet: computed({
      get: () => showSheet.value,
      set: (val) => {
        showSheet.value = val;
      },
    }),
    startWorkout,
    finishWorkout,
    discardWorkout,
    minimize,
    maximize,
  };
}
