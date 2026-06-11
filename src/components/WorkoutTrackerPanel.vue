<script setup lang="ts">
import { ref, computed, nextTick } from "vue";
import type { Exercise } from "../db/types";
import { createExercise, type ExerciseInput } from "../db/repository";
import { useWorkoutTracker } from "../composables/useWorkoutTracker";
import { useSortableList } from "../composables/useSortableList";
import WorkoutTrackerCard from "./WorkoutTrackerCard.vue";
import ExercisePickerSheet from "./ExercisePickerSheet.vue";
import ExerciseFormSheet from "./ExerciseFormSheet.vue";
import RpeSheet from "./RpeSheet.vue";
import ConfirmDialog from "./ConfirmDialog.vue";

const {
  cards,
  exerciseName,
  addSet,
  deleteSet,
  deleteExercise,
  completeSet,
  toggleSet,
  addCardFor,
  reorderCards,
  setValid,
} = useWorkoutTracker();

// ── Reorder exercises (drag by the card handle) ───────────────────────────────
const cardsListEl = ref<HTMLElement | null>(null);

// While a card is being dragged, fold every card down to its compact header so
// only a small card travels with the pointer; it unfolds again on release.
const dragging = ref(false);

useSortableList(cardsListEl, {
  handle: ".drag-handle",
  draggingClass: "shadow-lg",
  onReorder: reorderCards,
  onCollapse: (collapsed) => (dragging.value = collapsed),
});

// ── Delete confirmation (shared by set + exercise removal) ────────────────────
const confirmOpen = ref(false);
const confirmTitle = ref("");
const confirmMessage = ref("");
let pendingDelete: (() => void) | null = null;

const requestDeleteSet = (cardIndex: number, setIndex: number) => {
  const card = cards.value[cardIndex];
  confirmTitle.value = "Delete set?";
  confirmMessage.value = `Remove set ${setIndex + 1} from ${exerciseName(card.exerciseId)}?`;
  pendingDelete = () => deleteSet(card, setIndex);
  confirmOpen.value = true;
};

const requestDeleteExercise = (cardIndex: number) => {
  const card = cards.value[cardIndex];
  confirmTitle.value = "Remove exercise?";
  confirmMessage.value = `Remove ${exerciseName(card.exerciseId)} and its ${card.sets.length} set${card.sets.length === 1 ? "" : "s"} from this workout?`;
  pendingDelete = () => deleteExercise(card);
  confirmOpen.value = true;
};

const onConfirmDelete = () => {
  pendingDelete?.();
  pendingDelete = null;
};

const cardRefs = ref<
  Record<number, InstanceType<typeof WorkoutTrackerCard> | null>
>({});

const setCardRef = (index: number) => (el: unknown) => {
  cardRefs.value[index] = el as InstanceType<typeof WorkoutTrackerCard> | null;
};

const onComplete = (cardIndex: number, setIndex: number) => {
  const card = cards.value[cardIndex];
  if (!card) return;
  // The row only emits `complete` when valid, so just mark it done — no pointer
  // math means editing a finished set never drags the "current" set backward.
  completeSet(card, setIndex);

  if (setIndex + 1 < card.sets.length) {
    cardRefs.value[cardIndex]?.focusSet(setIndex + 1);
  } else if (cardIndex + 1 < cards.value.length) {
    cardRefs.value[cardIndex + 1]?.focusSet(0);
  }
};

// ── Add exercise (existing picker, with create-new flow) ──────────────────────
const showPicker = ref(false);
const showExerciseForm = ref(false);

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
    <div v-if="cards.length" ref="cardsListEl" class="flex flex-col gap-3">
      <WorkoutTrackerCard
        v-for="(card, cardIndex) in cards"
        :key="card.id"
        :ref="setCardRef(cardIndex)"
        :card="card"
        :exercise-name="exerciseName(card.exerciseId)"
        :collapsed="dragging"
        @request-delete-exercise="requestDeleteExercise(cardIndex)"
        @request-delete-set="requestDeleteSet(cardIndex, $event)"
        @edit-rpe="editRpe(cardIndex, $event)"
        @complete="onComplete(cardIndex, $event)"
        @add-set="addSet(card)"
        @toggle-set="toggleSet(card, $event)"
      />
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

  <ConfirmDialog
    v-model:open="confirmOpen"
    :title="confirmTitle"
    :message="confirmMessage"
    confirm-label="Delete"
    @confirm="onConfirmDelete"
  />
</template>
