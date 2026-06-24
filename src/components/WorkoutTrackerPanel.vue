<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import type { Exercise } from "../db/types";
import { createExercise, type ExerciseInput } from "../db/repository";
import { useWorkoutTracker } from "../composables/useWorkoutTracker";
import { useActiveWorkout } from "../composables/useActiveWorkout";
import { useSortableList } from "../composables/useSortableList";
import type { SetAdjustment } from "../engine/adjustment";
import WorkoutTrackerCard from "./WorkoutTrackerCard.vue";
import ExercisePickerSheet from "./ExercisePickerSheet.vue";
import ExerciseFormSheet from "./ExerciseFormSheet.vue";
import RpeSheet from "./RpeSheet.vue";
import ConfirmDialog from "./ConfirmDialog.vue";
import SetProposalPopover from "./SetProposalPopover.vue";

const {
  cards,
  exerciseName,
  addSet,
  deleteSet,
  deleteExercise,
  completeSet,
  toggleSet,
  proposalFor,
  applyProposal,
  addCardFor,
  reorderCards,
  setValid,
} = useWorkoutTracker();

const router = useRouter();
const { isMinimized } = useActiveWorkout();

// Tapping an exercise name jumps to its detail page; minimize the running sheet
// first so the page is visible (the workout stays live behind the docked bar).
const openExerciseDetail = (exerciseId: string) => {
  isMinimized.value = true;
  router.push({ name: "exercise-details", params: { id: exerciseId } });
};

// ── Prescription adjustment proposals ─────────────────────────────────────────
// A green dot offers a re-prescription of the next set based on the previous
// set's outcome. Dismissed proposals are remembered by signature so they re-show
// only if the predecessor changes (producing a different proposal).
const dismissed = ref<Record<string, string>>({});
const sig = (p: SetAdjustment) => `${p.weight}|${p.reps}`;

const proposalFlags = computed(() =>
  cards.value.map((card) =>
    card.sets.map((set, i) => {
      const p = proposalFor(card, i);
      return !!p && dismissed.value[set.id] !== sig(p);
    }),
  ),
);

const proposalLoc = ref<{ cardIndex: number; setIndex: number } | null>(null);
const proposalRect = ref<DOMRect | null>(null);
const proposalOpen = ref(false);

const activeProposal = computed(() => {
  const loc = proposalLoc.value;
  return loc ? proposalFor(cards.value[loc.cardIndex], loc.setIndex) : null;
});
const activeTarget = computed(() => {
  const loc = proposalLoc.value;
  return loc
    ? (cards.value[loc.cardIndex]?.sets[loc.setIndex]?.target ?? null)
    : null;
});

const openProposal = (cardIndex: number, setIndex: number, rect: DOMRect) => {
  proposalLoc.value = { cardIndex, setIndex };
  proposalRect.value = rect;
  proposalOpen.value = true;
};
const closeProposal = () => {
  proposalOpen.value = false;
  proposalLoc.value = null;
};
const applyActiveProposal = () => {
  const loc = proposalLoc.value;
  if (loc) applyProposal(cards.value[loc.cardIndex], loc.setIndex);
  closeProposal();
};
const dismissActiveProposal = () => {
  const loc = proposalLoc.value;
  const p = activeProposal.value;
  const set = loc ? cards.value[loc.cardIndex]?.sets[loc.setIndex] : null;
  if (set && p) dismissed.value[set.id] = sig(p);
  closeProposal();
};

// The anchor rect goes stale on scroll/resize, so close rather than drift.
const onViewportChange = () => {
  if (proposalOpen.value) closeProposal();
};
onMounted(() => {
  window.addEventListener("scroll", onViewportChange, true);
  window.addEventListener("resize", onViewportChange);
});
onUnmounted(() => {
  window.removeEventListener("scroll", onViewportChange, true);
  window.removeEventListener("resize", onViewportChange);
});

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
        :proposal-flags="proposalFlags[cardIndex]"
        @open-detail="openExerciseDetail(card.exerciseId)"
        @request-delete-exercise="requestDeleteExercise(cardIndex)"
        @request-delete-set="requestDeleteSet(cardIndex, $event)"
        @edit-rpe="editRpe(cardIndex, $event)"
        @complete="onComplete(cardIndex, $event)"
        @add-set="addSet(card)"
        @toggle-set="toggleSet(card, $event)"
        @open-proposal="
          (setIndex: number, rect: DOMRect) =>
            openProposal(cardIndex, setIndex, rect)
        "
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

  <SetProposalPopover
    :open="proposalOpen"
    :anchor-rect="proposalRect"
    :current="activeTarget"
    :proposal="activeProposal"
    @apply="applyActiveProposal"
    @dismiss="dismissActiveProposal"
    @close="closeProposal"
  />
</template>
