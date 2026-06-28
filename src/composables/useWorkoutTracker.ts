import { ref, watch, onScopeDispose } from "vue";
import { getConfigSetCount } from "../utils/progression";
import type { Set as LoggedSet, WorkoutExercise } from "../db/types";
import type { PrescribedSet } from "../engine/prescription";
import { DEFAULT_RPE_MATRIX } from "../db/rpeMatrix";
import { proposeSetAdjustment, type SetAdjustment } from "../engine/adjustment";
import { roundToLoadable } from "../engine/matrix";
import { useActiveWorkout, takePendingRestore } from "./useActiveWorkout";
import { writeWorkoutSnapshot } from "./workoutPersistence";

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
  note?: string; // workout-specific remark, persisted onto WorkoutExercise.note
}

// Mirror the row's own validity checks exactly (RPE is not required to complete).
export const setValid = (s: SetEntry) =>
  parseInt(s.reps, 10) >= 1 && parseFloat(s.weight) > 0;

// A set counts as completed only while its inputs remain valid, so clearing a
// value auto-uncompletes the set and retyping a valid one restores it.
export const isDone = (s: SetEntry) => s.done && setValid(s);

/**
 * Location of the next set still needing input after (cardIndex, setIndex):
 * the rest of that card, then the following cards. Done sets are skipped so a
 * cold-start-filled-but-unlogged row is still a valid focus target. Null when
 * nothing remains — submitting the last set leaves focus where it is.
 */
export function nextUnfinishedSet(
  cards: ExerciseCard[],
  cardIndex: number,
  setIndex: number,
): { cardIndex: number; setIndex: number } | null {
  const card = cards[cardIndex];
  if (card) {
    for (let s = setIndex + 1; s < card.sets.length; s++) {
      if (!isDone(card.sets[s])) return { cardIndex, setIndex: s };
    }
  }
  for (let c = cardIndex + 1; c < cards.length; c++) {
    const s = cards[c].sets.findIndex((set) => !isDone(set));
    if (s !== -1) return { cardIndex: c, setIndex: s };
  }
  return null;
}

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

/**
 * Pure projection of tracker cards into the workout's exercises: keeps only
 * completed sets (in card order, with monotonic timestamps), carries each card's
 * workout-specific note, and counts completed/pending sets. The reactive project()
 * wires this to the active workout; kept pure so it's independently testable.
 */
export function projectCards(cards: ExerciseCard[]): {
  exercises: WorkoutExercise[];
  completed: number;
  pending: number;
} {
  const exercises: WorkoutExercise[] = [];
  let completed = 0;
  let pending = 0;
  for (const card of cards) {
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
    exercises.push({
      exerciseId: card.exerciseId,
      sets,
      ...(card.note ? { note: card.note } : {}),
    });
  }
  return { exercises, completed, pending };
}

export function useWorkoutTracker() {
  const {
    activeWorkout,
    routine,
    exercisesMap,
    prescriptions,
    plannedCounts,
    calculatorSets,
    isMinimized,
    syncExercises,
    syncProgress,
  } = useActiveWorkout();

  const cards = ref<ExerciseCard[]>([]);

  // Names of exercises added on the fly (not part of the original routine) so the
  // card header can resolve them without round-tripping through the composable.
  const addedNames = ref<Record<string, string>>({});

  function plannedSetCount(index: number): number {
    return getConfigSetCount(routine.value?.exercises[index]?.config);
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
        ...(we.note ? { note: we.note } : {}),
      };
    });
  }

  // On mount, prefer a persisted snapshot (resume) over a fresh rebuild. The
  // handoff is one-shot, so a later startWorkout (new id) always rebuilds.
  function rebuildOrRestore() {
    const pending = takePendingRestore();
    if (pending && activeWorkout.value) {
      cards.value = pending.cards;
      addedNames.value = pending.addedNames;
      // The cards/project watcher isn't registered yet at this immediate run,
      // so project once to repopulate activeWorkout.exercises and trackerStats.
      project();
      return;
    }
    rebuild();
  }

  watch(() => activeWorkout.value?.id, rebuildOrRestore, { immediate: true });

  // Continuous projection: every card mutation re-derives the workout's
  // exercises (completed sets only, in final card order) so finishing the
  // workout needs no extra data path — activeWorkout is always truthful.
  function project() {
    const { exercises, completed, pending } = projectCards(cards.value);
    syncExercises(exercises);
    syncProgress({ completed, pending });
  }

  watch(cards, project, { deep: true });

  // ── Persist the running session ─────────────────────────────────────────────
  // Debounced snapshot of the whole live session to localStorage so it survives
  // an app close/reload. Pending inputs and adjusted targets live in `cards`, so
  // the save is keyed off cards plus the satellite session state.
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  function writeSnapshot() {
    const w = activeWorkout.value;
    if (!w) return;
    writeWorkoutSnapshot(localStorage, {
      workout: { id: w.id, routineId: w.routineId, startTime: w.startTime },
      routine: routine.value,
      exercisesMap: exercisesMap.value,
      prescriptions: prescriptions.value,
      plannedCounts: plannedCounts.value,
      calculatorSets: calculatorSets.value,
      isMinimized: isMinimized.value,
      cards: cards.value,
      addedNames: addedNames.value,
    });
  }

  function persist() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      writeSnapshot();
    }, 400);
  }

  function flush() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    writeSnapshot();
  }

  watch([cards, addedNames, calculatorSets, isMinimized], persist, {
    deep: true,
  });

  // Flush synchronously when the page is backgrounded/hidden (the "phone shut
  // off" case) — a debounced write would otherwise lose the last edits.
  const onVisibility = () => {
    if (document.visibilityState === "hidden") flush();
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", flush);
  onScopeDispose(() => {
    if (saveTimer) clearTimeout(saveTimer);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", flush);
  });

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
    fillColdStartFromGovernor(card);
  };

  const toggleSet = (card: ExerciseCard, i: number) => {
    const set = card.sets[i];
    set.done = !set.done;
    set.completedAt = set.done ? (set.completedAt ?? Date.now()) : null;
    if (set.done) fillColdStartFromGovernor(card);
  };

  /**
   * Cold-start governor fill: a first-ever exercise prescribes every set with a
   * null weight (free entry). Once the FIRST set is logged it GOVERNS — its
   * demonstrated e1RM populates the remaining still-empty sets so the lifter isn't
   * guessing a weight on every set. Idempotent and non-destructive: only fills
   * pending sets that still have no prescribed weight, so it never clobbers a set
   * the lifter already filled or edited, and is a no-op on a normal (anchored)
   * prescription. Established-target divergence stays a user-confirmed green-dot
   * proposal (applyProposal) — only the truly empty cold-start sets auto-fill.
   */
  function fillColdStartFromGovernor(card: ExerciseCard): void {
    const gov = card.sets[0];
    if (!gov || !isDone(gov)) return;
    const gReps = parseInt(gov.reps, 10);
    const gWeight = parseFloat(gov.weight);
    const gRpe = parseFloat(gov.rpe);
    if (!(gReps >= 1) || !(gWeight > 0) || isNaN(gRpe)) return;

    const matrix =
      exercisesMap.value[card.exerciseId]?.rpeMatrix ?? DEFAULT_RPE_MATRIX;
    for (let j = 1; j < card.sets.length; j++) {
      const s = card.sets[j];
      if (isDone(s) || !s.target || s.target.weight != null) continue;

      // Back-off sets carry no target RPE to re-anchor against — their load is a
      // fixed drop off the top set, so fill it directly from the demonstrated
      // top weight rather than the RPE-derived path below.
      if (s.target.role === "backoff" && s.target.backoffFraction != null) {
        const weight = roundToLoadable(gWeight * s.target.backoffFraction);
        if (weight > 0) {
          applyAdjustmentToSet(s, { reps: s.target.reps, weight, rpe: null });
        }
        continue;
      }

      const proposal = proposeSetAdjustment(
        matrix,
        { weight: gWeight, reps: gReps, rpe: gRpe },
        { reps: s.target.reps, rpe: s.target.rpe, weight: s.target.weight },
      );
      if (proposal) applyAdjustmentToSet(s, proposal);
    }
  }

  /**
   * Proposed re-prescription for the set at `setIndex`, derived from the
   * IMMEDIATELY PRECEDING completed set's outcome via the exercise's RPE matrix.
   * Null unless: the predecessor is done with valid reps/weight/RPE, this set is
   * still pending and prescription-backed, and the proposal actually differs
   * from the current target (so trivial deviations surface nothing).
   */
  function proposalFor(
    card: ExerciseCard,
    setIndex: number,
  ): SetAdjustment | null {
    if (setIndex <= 0) return null;
    const cur = card.sets[setIndex];
    if (!cur || isDone(cur) || !cur.target) return null;
    const prev = card.sets[setIndex - 1];
    if (!prev || !isDone(prev)) return null;

    const pReps = parseInt(prev.reps, 10);
    const pWeight = parseFloat(prev.weight);
    const pRpe = parseFloat(prev.rpe);
    if (!(pReps >= 1) || !(pWeight > 0) || isNaN(pRpe)) return null;

    const matrix =
      exercisesMap.value[card.exerciseId]?.rpeMatrix ?? DEFAULT_RPE_MATRIX;
    return proposeSetAdjustment(
      matrix,
      { weight: pWeight, reps: pReps, rpe: pRpe },
      { reps: cur.target.reps, rpe: cur.target.rpe, weight: cur.target.weight },
    );
  }

  /**
   * Writes a re-prescription onto a set: rewrites its prescription target (so it
   * becomes the new adherence baseline) and prefills the inputs, mirroring how a
   * freshly prescribed row starts. The held RPE is preserved (null stays null).
   * Shared by the user-confirmed green-dot path and the cold-start governor fill.
   */
  function applyAdjustmentToSet(set: SetEntry, proposal: SetAdjustment): void {
    if (!set.target) return;
    set.target = {
      ...set.target,
      reps: proposal.reps,
      weight: proposal.weight,
      rpe: proposal.rpe ?? set.target.rpe,
    };
    set.reps = String(proposal.reps);
    set.weight = String(proposal.weight);
    if (proposal.rpe != null) set.rpe = String(proposal.rpe);
  }

  /** Applies the green-dot proposal the user confirmed for a specific set. */
  function applyProposal(card: ExerciseCard, setIndex: number): void {
    const proposal = proposalFor(card, setIndex);
    const set = card.sets[setIndex];
    if (proposal && set) applyAdjustmentToSet(set, proposal);
  }

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
    proposalFor,
    applyProposal,
    addCardFor,
    reorderCards,
    setValid,
    isDone,
  };
}
