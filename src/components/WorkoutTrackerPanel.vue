<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
import type {
  LinearProgressionParams,
  DoubleProgressionParams,
  TopSetProgressionParams,
  Exercise,
} from "../db/types";
import { createExercise, type ExerciseInput } from "../db/repository";
import { useActiveWorkout } from "../composables/useActiveWorkout";
import WorkoutSetRow from "./WorkoutSetRow.vue";
import ExercisePickerSheet from "./ExercisePickerSheet.vue";
import ExerciseFormSheet from "./ExerciseFormSheet.vue";
import RpeSheet from "./RpeSheet.vue";

const { activeWorkout, routine, exercisesMap } = useActiveWorkout();

interface SetEntry {
  reps: string;
  weight: string;
  rpe: string;
  done: boolean;
}
interface ExerciseCard {
  exerciseId: string;
  sets: SetEntry[];
}

const cards = ref<ExerciseCard[]>([]);

// Names of exercises added on the fly (not part of the original routine) so the
// card header can resolve them without round-tripping through the composable.
const addedNames = ref<Record<string, string>>({});

const newSet = (): SetEntry => ({
  reps: "",
  weight: "",
  rpe: "",
  done: false,
});

// Mirror the row's own validity checks exactly (RPE is not required to complete).
const setValid = (s: SetEntry) =>
  parseInt(s.reps, 10) >= 1 && parseFloat(s.weight) > 0;

// A set counts as completed only while its inputs remain valid, so clearing a
// value auto-uncompletes the set and retyping a valid one restores it.
const isDone = (s: SetEntry) => s.done && setValid(s);

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
  cards.value = activeWorkout.value.exercises.map((we, i) => ({
    exerciseId: we.exerciseId,
    sets: Array.from({ length: plannedSetCount(i) }, newSet),
  }));
}

watch(() => activeWorkout.value?.id, rebuild, { immediate: true });

const exerciseName = (id: string) =>
  exercisesMap.value[id]?.name || addedNames.value[id] || "Exercise";

const addSet = (card: ExerciseCard) => {
  card.sets.push(newSet());
};

const deleteSet = (card: ExerciseCard, i: number) => {
  card.sets.splice(i, 1);
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

const toggleSet = (card: ExerciseCard, i: number) => {
  card.sets[i].done = !card.sets[i].done;
};

const doneCount = (card: ExerciseCard) => card.sets.filter(isDone).length;

const rowRefs = ref<Record<string, InstanceType<typeof WorkoutSetRow> | null>>(
  {},
);
const setRowRef = (key: string) => (el: unknown) => {
  rowRefs.value[key] = el as InstanceType<typeof WorkoutSetRow> | null;
};

const onComplete = (cardIndex: number, setIndex: number) => {
  const card = cards.value[cardIndex];
  if (!card) return;
  // The row only emits `complete` when valid, so just mark it done — no pointer
  // math means editing a finished set never drags the "current" set backward.
  card.sets[setIndex].done = true;
  const nextKey =
    setIndex + 1 < card.sets.length
      ? `${cardIndex}-${setIndex + 1}`
      : `${cardIndex + 1}-0`;
  rowRefs.value[nextKey]?.focusReps();
};

// ── Add exercise (existing picker, with create-new flow) ──────────────────────
const showPicker = ref(false);
const showExerciseForm = ref(false);

const addCardFor = (id: string, name: string) => {
  addedNames.value[id] = name;
  cards.value.push({ exerciseId: id, sets: [newSet()] });
};

const handleSelectExercise = (exercise: Exercise) => {
  addCardFor(exercise.id, exercise.name);
  showPicker.value = false;
};

const handleCreateExercise = async () => {
  showPicker.value = false;
  await nextTick();
  showExerciseForm.value = true;
};

const handleSaveNewExercise = async (input: ExerciseInput) => {
  const id = await createExercise(input);
  addCardFor(id, input.name.trim());
  showExerciseForm.value = false;
};

// ── RPE picker ────────────────────────────────────────────────────────────────
const showRpeSheet = ref(false);
const rpeTarget = ref<{ cardIndex: number; setIndex: number } | null>(null);

const rpeCurrent = computed(() => {
  const t = rpeTarget.value;
  return t ? (cards.value[t.cardIndex]?.sets[t.setIndex]?.rpe ?? "") : "";
});

const editRpe = (cardIndex: number, setIndex: number) => {
  rpeTarget.value = { cardIndex, setIndex };
  showRpeSheet.value = true;
};

const onSelectRpe = (rpe: string) => {
  const t = rpeTarget.value;
  if (!t) return;
  const card = cards.value[t.cardIndex];
  const set = card?.sets[t.setIndex];
  if (!set) return;

  set.rpe = rpe;

  // Picking an RPE that leaves a not-yet-done set fully valid auto-advances it;
  // changing a finished set's RPE leaves its completion (and the pointer) alone.
  if (!set.done && setValid(set)) {
    onComplete(t.cardIndex, t.setIndex);
  }
};
</script>

<template>
  <div class="flex flex-col gap-4 p-5 select-none">
    <div v-if="cards.length" class="flex flex-col gap-3">
      <div
        v-for="(card, cardIndex) in cards"
        :key="card.exerciseId + cardIndex"
        class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-4 shadow-sm flex flex-col gap-3"
      >
        <!-- Card header -->
        <div class="mb-3 flex items-center justify-between gap-3">
          <span
            class="font-bold text-sm text-text-h-light dark:text-text-h-dark truncate"
          >
            {{ exerciseName(card.exerciseId) }}
          </span>
          <span
            class="shrink-0 text-xs font-mono text-text-light dark:text-text-dark opacity-50"
          >
            {{ doneCount(card) }}/{{ card.sets.length }}
          </span>
        </div>

        <!-- Sets -->
        <div class="flex flex-col gap-2">
          <!-- Column labels -->
          <div class="flex items-center gap-2.5 px-0.5">
            <span class="w-5 shrink-0" />
            <span
              class="flex-1 text-center text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-40"
              >Reps</span
            >
            <span class="text-xs opacity-0">×</span>
            <span
              class="flex-1 text-center text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-40"
              >Weight</span
            >
            <span class="text-xs opacity-0">@</span>
            <span
              class="w-14 shrink-0 text-center text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-40"
              >RPE</span
            >
            <span class="w-9 shrink-0" />
          </div>

          <WorkoutSetRow
            v-for="(set, setIndex) in card.sets"
            :key="setIndex"
            :ref="setRowRef(`${cardIndex}-${setIndex}`)"
            v-model:reps="set.reps"
            v-model:weight="set.weight"
            v-model:rpe="set.rpe"
            :index="setIndex + 1"
            :state="setState(card, setIndex)"
            @toggle="toggleSet(card, setIndex)"
            @complete="onComplete(cardIndex, setIndex)"
            @edit-rpe="editRpe(cardIndex, setIndex)"
            @delete="deleteSet(card, setIndex)"
          />

          <!-- Add set -->
          <button
            type="button"
            class="mt-1 w-full rounded-lg border border-dashed border-border-light dark:border-border-dark py-2 text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-50 transition-colors duration-150 hover:opacity-100 hover:border-accent/50 hover:text-accent cursor-pointer"
            @click="addSet(card)"
          >
            + Add set
          </button>
        </div>
      </div>
    </div>

    <!-- Empty hint -->
    <p
      v-else
      class="text-center text-sm text-text-light dark:text-text-dark opacity-50 py-6"
    >
      No exercises yet — add one to get started.
    </p>

    <!-- Add exercise -->
    <button
      type="button"
      class="w-full rounded-xl border border-dashed border-border-light dark:border-border-dark py-4 text-sm font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60 transition-colors duration-150 hover:opacity-100 hover:border-accent/50 hover:text-accent cursor-pointer"
      @click="showPicker = true"
    >
      + Add exercise
    </button>
  </div>

  <ExercisePickerSheet
    v-model:open="showPicker"
    @select="handleSelectExercise"
    @create="handleCreateExercise"
  />

  <ExerciseFormSheet
    v-model:open="showExerciseForm"
    :is-editing="false"
    @save="handleSaveNewExercise"
  />

  <RpeSheet
    v-model:open="showRpeSheet"
    :current="rpeCurrent"
    @select="onSelectRpe"
  />
</template>
