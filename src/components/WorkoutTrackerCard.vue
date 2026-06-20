<script setup lang="ts">
import { ref } from "vue";
import type { ExerciseCard } from "../composables/useWorkoutTracker";
import { isDone } from "../composables/useWorkoutTracker";
import WorkoutSetRow from "./WorkoutSetRow.vue";

const props = defineProps<{
  card: ExerciseCard;
  exerciseName: string;
  /** Fold the sets section away (used while the card is being dragged). */
  collapsed?: boolean;
  /** Per-set flag: whether a re-prescription proposal is available. */
  proposalFlags?: boolean[];
}>();

const emit = defineEmits<{
  (e: "request-delete-exercise"): void;
  (e: "request-delete-set", index: number): void;
  (e: "edit-rpe", index: number): void;
  (e: "complete", index: number): void;
  (e: "add-set"): void;
  (e: "toggle-set", index: number): void;
  (e: "open-proposal", index: number, rect: DOMRect): void;
}>();

const rowRefs = ref<Record<number, InstanceType<typeof WorkoutSetRow> | null>>(
  {},
);

const setRowRef = (index: number) => (el: unknown) => {
  rowRefs.value[index] = el as InstanceType<typeof WorkoutSetRow> | null;
};

const setState = (i: number): "finished" | "current" | "upcoming" => {
  if (isDone(props.card.sets[i])) return "finished";
  // The lowest set that isn't effectively done is the one to act on next.
  const firstIncomplete = props.card.sets.findIndex((s) => !isDone(s));
  return i === firstIncomplete ? "current" : "upcoming";
};

const focusSet = (index: number) => {
  rowRefs.value[index]?.focusReps();
};

defineExpose({
  focusSet,
});
</script>

<template>
  <div
    class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-4 shadow-sm flex flex-col gap-3 select-none"
  >
    <!-- Card header -->
    <div class="mb-3 flex items-center gap-2.5">
      <!-- Drag handle -->
      <span
        class="drag-handle shrink-0 touch-none cursor-grab active:cursor-grabbing text-text-light dark:text-text-dark opacity-30 hover:opacity-60 transition-opacity duration-150 inline-flex items-center justify-center h-5 w-3.5"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <circle cx="9" cy="5" r="1.5" />
          <circle cx="15" cy="5" r="1.5" />
          <circle cx="9" cy="12" r="1.5" />
          <circle cx="15" cy="12" r="1.5" />
          <circle cx="9" cy="19" r="1.5" />
          <circle cx="15" cy="19" r="1.5" />
        </svg>
      </span>
      <span
        class="min-w-0 flex-1 font-bold text-sm text-text-h-light dark:text-text-h-dark truncate"
      >
        {{ exerciseName }}
      </span>
      <!-- Delete exercise -->
      <button
        type="button"
        class="shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-text-light dark:text-text-dark opacity-40 hover:opacity-100 hover:text-red-500 dark:hover:text-red-400 cursor-pointer transition-colors duration-150"
        title="Remove exercise"
        @click="emit('request-delete-exercise')"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6M14 11v6" />
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
        </svg>
      </button>
    </div>

    <!-- Sets (folds away while dragging) -->
    <div
      class="grid transition-[grid-template-rows,opacity] duration-150 ease-out"
      :class="
        collapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'
      "
    >
      <div class="min-h-0 overflow-hidden">
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
            :ref="setRowRef(setIndex)"
            v-model:reps="set.reps"
            v-model:weight="set.weight"
            v-model:rpe="set.rpe"
            :index="setIndex + 1"
            :state="setState(setIndex)"
            :target="set.target"
            :has-proposal="proposalFlags?.[setIndex] ?? false"
            :represcribed="set.represcribed ?? false"
            @toggle="emit('toggle-set', setIndex)"
            @complete="emit('complete', setIndex)"
            @edit-rpe="emit('edit-rpe', setIndex)"
            @delete="emit('request-delete-set', setIndex)"
            @open-proposal="
              (rect: DOMRect) => emit('open-proposal', setIndex, rect)
            "
          />

          <!-- Add set -->
          <button
            type="button"
            class="mt-1 w-full rounded-lg border border-dashed border-border-light dark:border-border-dark py-2 text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-50 transition-colors duration-150 hover:opacity-100 hover:border-accent/50 hover:text-accent cursor-pointer"
            @click="emit('add-set')"
          >
            + Add set
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
