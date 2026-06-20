import { ref, computed } from "vue";
import { db } from "../db/db";
import { getConfigSetCount } from "../utils/progression";
import type {
  Workout,
  WorkoutExercise,
  Routine,
  Exercise,
  Set as LoggedSet,
} from "../db/types";
import {
  applyWorkoutResults,
  prescribeWorkout,
  type CalibrationChange,
} from "../engine/service";
import { buildWorkoutSummary } from "../analytics/service";
import type { WorkoutSummary } from "../analytics/summary";
import type { ExercisePrescription } from "../engine/prescription";

export interface CalculatorSet {
  exerciseId: string;
  exerciseName: string;
  e1rm: number; // workingE1rm used as the reference for this set
  set: LoggedSet;
}

/**
 * Planned working sets per exerciseId for adherence scoring, summed across
 * duplicate routine slots. A live prescription (which periodization may have
 * scaled) is authoritative; otherwise we fall back to the raw config count.
 */
function buildPlannedCounts(
  r: Routine | null,
  prescriptions: Record<string, ExercisePrescription>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const ex of r?.exercises ?? []) {
    const prescribed = prescriptions[ex.exerciseId]?.sets.length;
    counts[ex.exerciseId] =
      (counts[ex.exerciseId] ?? 0) +
      (prescribed ?? getConfigSetCount(ex.config));
  }
  return counts;
}

const activeWorkout = ref<Workout | null>(null);
const routine = ref<Routine | null>(null);
const plannedCounts = ref<Record<string, number>>({});
const summary = ref<WorkoutSummary | null>(null);
const showSummary = ref(false);
// c1RM changes from the just-finished session (seed/increment/hold/regression),
// shown read-only in the summary. Held alongside `summary` (outliving the
// session) and cleared by closeSummary, never by reset().
const calibrations = ref<CalibrationChange[]>([]);
const exercisesMap = ref<Record<string, Exercise>>({});
// Engine prescriptions for the running workout, keyed by exerciseId. Duplicate
// movements in a routine share one prescription, mirroring the engine's
// "duplicate slots share the first slot's config" semantics.
const prescriptions = ref<Record<string, ExercisePrescription>>({});
// Live completed/pending counts projected from the tracker, driving the
// finish-workout confirmation flow.
const trackerStats = ref({ completed: 0, pending: 0 });
const isMinimized = ref(false);
const showSheet = ref(false);

// Calculator sets are kept separate from the tracker's exercise projection so
// that the tracker's continuous project() writes don't clobber them. Merged into
// the workout at finishWorkout() only.
const calculatorSets = ref<CalculatorSet[]>([]);

// Clears the running workout's state. The post-workout summary is intentionally
// left untouched so it can outlive the session it describes (closeSummary owns
// it); a discard clears it too via discardWorkout.
function reset() {
  activeWorkout.value = null;
  routine.value = null;
  exercisesMap.value = {};
  prescriptions.value = {};
  plannedCounts.value = {};
  trackerStats.value = { completed: 0, pending: 0 };
  calculatorSets.value = [];
  isMinimized.value = false;
  showSheet.value = false;
}

export function useActiveWorkout() {
  const startWorkout = async (routineId?: string) => {
    let r: Routine | null = null;
    const eMap: Record<string, Exercise> = {};
    let rx: Record<string, ExercisePrescription> = {};

    if (routineId) {
      r = (await db.routines.get(routineId)) ?? null;
      if (r) {
        const ids = new Set(r.exercises.map((e) => e.exerciseId));
        const list = await Promise.all(
          [...ids].map((id) => db.exercises.get(id)),
        );
        for (const e of list) if (e) eMap[e.id] = e;
      }

      // Resolve prescriptions before the workout becomes active so the
      // tracker's rebuild sees them synchronously (no prefill race). A failing
      // prescription must never block starting a workout.
      try {
        const list = await prescribeWorkout(routineId);
        rx = Object.fromEntries(list.map((p) => [p.exerciseId, p]));
      } catch (error) {
        console.error("YAFA: failed to prescribe workout", error);
      }
    }

    prescriptions.value = rx;
    plannedCounts.value = buildPlannedCounts(r, rx);
    trackerStats.value = { completed: 0, pending: 0 };
    activeWorkout.value = {
      id: crypto.randomUUID(),
      routineId: routineId ?? "",
      startTime: Date.now(),
      exercises: (r?.exercises ?? []).map((ex) => ({
        exerciseId: ex.exerciseId,
        sets: [],
      })),
    };
    routine.value = r;
    exercisesMap.value = eMap;
    isMinimized.value = false;
    showSheet.value = true;
  };

  /** Replaces the workout's exercises with the tracker's projection. */
  const syncExercises = (exercises: WorkoutExercise[]) => {
    if (!activeWorkout.value) return;
    activeWorkout.value = { ...activeWorkout.value, exercises };
  };

  const syncProgress = (stats: { completed: number; pending: number }) => {
    trackerStats.value = stats;
  };

  const logCalculatorSet = (entry: CalculatorSet) => {
    calculatorSets.value.push(entry);
  };

  const removeCalculatorSet = (setId: string) => {
    calculatorSets.value = calculatorSets.value.filter(
      (cs) => cs.set.id !== setId,
    );
  };

  const finishWorkout = async () => {
    if (!activeWorkout.value) return;

    // Merge calculator sets onto the tracker's exercise list before persisting.
    const merged = activeWorkout.value.exercises.map((e) => ({
      ...e,
      sets: [...e.sets],
    }));
    for (const cs of calculatorSets.value) {
      const existing = merged.find((e) => e.exerciseId === cs.exerciseId);
      if (existing) {
        existing.sets.push(cs.set);
      } else {
        merged.push({ exerciseId: cs.exerciseId, sets: [cs.set] });
      }
    }

    // Strip Vue reactivity proxies before persisting — IndexedDB's structured
    // clone rejects them (same reason setPlanMesocycle flattens its weeks).
    const completed: Workout = JSON.parse(
      JSON.stringify({
        ...activeWorkout.value,
        endTime: Date.now(),
        // Exercises the user never logged carry no information — drop them.
        exercises: merged.filter((e) => e.sets.length),
      }),
    );
    // Build the summary BEFORE persisting/learning: PR comparisons must see
    // history without this session and use the pre-learning matrices. A failure
    // here must never block saving the workout.
    let nextSummary: WorkoutSummary | null = null;
    try {
      nextSummary = await buildWorkoutSummary(completed, plannedCounts.value);
    } catch (error) {
      console.error("YAFA: failed to build workout summary", error);
    }

    await db.workouts.add(completed);
    // Post-session engine pass: seeds or advances each exercise's c1RM
    // deterministically and returns the changes to surface in the summary.
    // No-ops for exercises without logged sets; idempotent on re-finish.
    let changes: CalibrationChange[] = [];
    try {
      changes = await applyWorkoutResults(completed);
    } catch (error) {
      console.error("YAFA: failed to apply workout results", error);
    }
    reset();

    // Surface the summary only when the session actually had logged sets.
    if (nextSummary && completed.exercises.length) {
      summary.value = nextSummary;
      calibrations.value = changes;
      showSummary.value = true;
    }
  };

  const closeSummary = () => {
    summary.value = null;
    calibrations.value = [];
    showSummary.value = false;
  };

  const discardWorkout = () => {
    closeSummary();
    reset();
  };

  const maximize = () => {
    showSheet.value = true;
    isMinimized.value = false;
  };

  return {
    activeWorkout: computed(() => activeWorkout.value),
    routine: computed(() => routine.value),
    exercisesMap: computed(() => exercisesMap.value),
    prescriptions: computed(() => prescriptions.value),
    trackerStats: computed(() => trackerStats.value),
    calculatorSets: computed(() => calculatorSets.value),
    calculatorSetCount: computed(() => calculatorSets.value.length),
    summary: computed(() => summary.value),
    calibrations: computed(() => calibrations.value),
    showSummary: computed({
      get: () => showSummary.value,
      set: (val) => {
        showSummary.value = val;
      },
    }),
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
    closeSummary,
    maximize,
    syncExercises,
    syncProgress,
    logCalculatorSet,
    removeCalculatorSet,
  };
}
