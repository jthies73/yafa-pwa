import { ref, computed } from "vue";
import { db } from "../db/db";
import { updateExerciseNotes } from "../db/repository";
import { currentBodyweight } from "../db/measurements";
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
import type { ExerciseCard } from "./useWorkoutTracker";
import {
  readWorkoutSnapshot,
  clearWorkoutSnapshot,
} from "./workoutPersistence";

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
  prescriptions: (ExercisePrescription | null)[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  (r?.exercises ?? []).forEach((ex, i) => {
    const prescribed = prescriptions[i]?.sets.length;
    counts[ex.exerciseId] =
      (counts[ex.exerciseId] ?? 0) +
      (prescribed ?? getConfigSetCount(ex.config));
  });
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
// The just-finished workout, retained past reset() so the summary can offer
// "save as routine". Held alongside `summary` (outliving the session) and cleared
// by closeSummary, never by reset(). `finishedExerciseNames` snapshots the names
// (reset() wipes exercisesMap) so the save sheet can preview them.
const finishedWorkout = ref<Workout | null>(null);
const finishedExerciseNames = ref<Record<string, string>>({});
const exercisesMap = ref<Record<string, Exercise>>({});
// Engine prescriptions for the running workout, SLOT-ALIGNED with the routine's
// exercises (and hence with the tracker's initial cards). Duplicate slots of one
// exercise carry their own entries — session fatigue can prescribe a later slot
// lighter than the first, so folding by exerciseId would mis-render early slots.
const prescriptions = ref<(ExercisePrescription | null)[]>([]);
// Live completed/pending counts projected from the tracker, driving the
// finish-workout confirmation flow.
const trackerStats = ref({ completed: 0, pending: 0 });
const isMinimized = ref(false);
const showSheet = ref(false);
// Bodyweight (kg) at session start — the added↔total transform base for
// bodyweightFactor exercises. null when the user never logged one (offset 0).
const bodyweightKg = ref<number | null>(null);

// Calculator sets are kept separate from the tracker's exercise projection so
// that the tracker's continuous project() writes don't clobber them. Merged into
// the workout at finishWorkout() only.
const calculatorSets = ref<CalculatorSet[]>([]);

// Cards/addedNames captured from a persisted snapshot at restore, handed off to
// the tracker which consumes them once on mount (instead of rebuilding fresh).
let pendingRestore: {
  cards: ExerciseCard[];
  addedNames: Record<string, string>;
} | null = null;

/** Consume the one-shot restore handoff (null after the first read). */
export function takePendingRestore() {
  const p = pendingRestore;
  pendingRestore = null;
  return p;
}

/**
 * Rehydrate the running session from localStorage on app startup. Sets the
 * module refs and opens the sheet so the tracker, mounting next, picks up the
 * cards via takePendingRestore. No-op when nothing is persisted. Must run before
 * the app mounts so the tracker's immediate rebuild sees the handoff.
 */
export function restoreActiveWorkout() {
  const snap = readWorkoutSnapshot(localStorage);
  if (!snap) return;
  prescriptions.value = snap.prescriptions;
  plannedCounts.value = snap.plannedCounts;
  routine.value = snap.routine;
  exercisesMap.value = snap.exercisesMap;
  calculatorSets.value = snap.calculatorSets;
  trackerStats.value = { completed: 0, pending: 0 };
  bodyweightKg.value = snap.bodyweightKg ?? null;
  if (snap.bodyweightKg === undefined) {
    // Pre-feature snapshot: fetch lazily; prescriptions in it are already final.
    void currentBodyweight().then((bw) => (bodyweightKg.value = bw ?? null));
  }
  // exercises are re-projected from the hydrated cards by the tracker's project().
  activeWorkout.value = { ...snap.workout, exercises: [] };
  pendingRestore = { cards: snap.cards, addedNames: snap.addedNames };
  isMinimized.value = snap.isMinimized;
  showSheet.value = true;
}

// Clears the running workout's state. The post-workout summary is intentionally
// left untouched so it can outlive the session it describes (closeSummary owns
// it); a discard clears it too via discardWorkout.
function reset() {
  activeWorkout.value = null;
  routine.value = null;
  exercisesMap.value = {};
  prescriptions.value = [];
  plannedCounts.value = {};
  trackerStats.value = { completed: 0, pending: 0 };
  calculatorSets.value = [];
  bodyweightKg.value = null;
  isMinimized.value = false;
  showSheet.value = false;
  // A finished/discarded session must never resurface on the next launch.
  clearWorkoutSnapshot(localStorage);
}

export function useActiveWorkout() {
  const startWorkout = async (routineId?: string) => {
    let r: Routine | null = null;
    const eMap: Record<string, Exercise> = {};
    let rx: (ExercisePrescription | null)[] = [];

    // Captured once per session: prescriptions were rendered against this
    // bodyweight, so in-session transforms must use the same base.
    bodyweightKg.value = (await currentBodyweight()) ?? null;

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
      // tracker's rebuild sees them synchronously (no prefill race). The result
      // is slot-aligned with r.exercises (and thus with the tracker's initial
      // cards). A failing prescription must never block starting a workout.
      try {
        rx = await prescribeWorkout(routineId);
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

  /**
   * Edit the exercise's GLOBAL note (Exercise.notes) mid-workout: reflect it in the
   * live exercisesMap so the UI updates immediately, and persist to the DB. The
   * snapshot serializes exercisesMap, so the edit also survives a resume.
   */
  const setExerciseNote = (exerciseId: string, notes: string | undefined) => {
    const trimmed = notes?.trim() || undefined;
    const ex = exercisesMap.value[exerciseId];
    // Skip the DB write when the value is unchanged (sheet close re-emits the
    // current note even if the user never edited it).
    if (ex) {
      if (ex.notes === trimmed) return;
      ex.notes = trimmed;
    }
    void updateExerciseNotes(exerciseId, trimmed).catch((error) => {
      console.error("YAFA: failed to save exercise note", error);
    });
  };

  /**
   * Make sure an exercise added mid-session is in exercisesMap, so its custom
   * RPE matrix and bodyweightFactor are honored (not silently defaulted).
   */
  const ensureExerciseLoaded = (exerciseId: string) => {
    if (exercisesMap.value[exerciseId]) return;
    void db.exercises
      .get(exerciseId)
      .then((e) => {
        if (e) exercisesMap.value[exerciseId] = e;
      })
      .catch((error) => {
        console.error("YAFA: failed to load exercise", error);
      });
  };

  const logCalculatorSet = (entry: CalculatorSet) => {
    calculatorSets.value.push(entry);
  };

  const removeCalculatorSet = (setId: string) => {
    calculatorSets.value = calculatorSets.value.filter(
      (cs) => cs.set.id !== setId,
    );
  };

  /**
   * Every set logged this session for an exercise — the tracker's completed sets
   * plus any calculator sets — so callers (e.g. the calculator's live e1RM) react
   * to both. Reads the refs directly, so it stays reactive inside a computed.
   */
  const sessionSetsFor = (exerciseId: string): LoggedSet[] => {
    const tracker =
      activeWorkout.value?.exercises.find((e) => e.exerciseId === exerciseId)
        ?.sets ?? [];
    const calc = calculatorSets.value
      .filter((cs) => cs.exerciseId === exerciseId)
      .map((cs) => cs.set);
    return [...tracker, ...calc];
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
        // Drop exercises the user never touched — but keep one carrying a
        // workout note even with no logged sets (e.g. "skipped, shoulder hurt").
        exercises: merged.filter((e) => e.sets.length || e.note),
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
    // Snapshot exercise names before reset() wipes exercisesMap, so the summary's
    // save-as-routine sheet can preview them.
    const names: Record<string, string> = {};
    for (const e of completed.exercises) {
      const name = exercisesMap.value[e.exerciseId]?.name;
      if (name) names[e.exerciseId] = name;
    }

    reset();

    // Surface the summary only when the session actually had logged sets.
    if (nextSummary && completed.exercises.length) {
      summary.value = nextSummary;
      calibrations.value = changes;
      finishedWorkout.value = completed;
      finishedExerciseNames.value = names;
      showSummary.value = true;
    }
  };

  const closeSummary = () => {
    summary.value = null;
    calibrations.value = [];
    finishedWorkout.value = null;
    finishedExerciseNames.value = {};
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
    bodyweightKg: computed(() => bodyweightKg.value),
    exercisesMap: computed(() => exercisesMap.value),
    prescriptions: computed(() => prescriptions.value),
    plannedCounts: computed(() => plannedCounts.value),
    trackerStats: computed(() => trackerStats.value),
    calculatorSets: computed(() => calculatorSets.value),
    calculatorSetCount: computed(() => calculatorSets.value.length),
    summary: computed(() => summary.value),
    calibrations: computed(() => calibrations.value),
    finishedWorkout: computed(() => finishedWorkout.value),
    finishedExerciseNames: computed(() => finishedExerciseNames.value),
    // "Save as routine" is offered only for ad-hoc empty workouts (no source
    // routine) that actually logged something.
    canSaveAsRoutine: computed(
      () =>
        (finishedWorkout.value?.routineId ?? "") === "" &&
        (finishedWorkout.value?.exercises.length ?? 0) > 0,
    ),
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
    setExerciseNote,
    ensureExerciseLoaded,
    logCalculatorSet,
    removeCalculatorSet,
    sessionSetsFor,
  };
}
