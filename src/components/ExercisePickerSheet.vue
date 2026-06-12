<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { liveQuery } from "dexie";
import { db } from "../db/db";
import type { Exercise } from "../db/types";
import AppBottomSheet from "./AppBottomSheet.vue";

const open = defineModel<boolean>("open", { required: true });

const emit = defineEmits<{
  (e: "select", exercise: Exercise): void;
  (e: "create"): void;
}>();

const allExercises = ref<Exercise[]>([]);
const searchQuery = ref("");
let subscription: { unsubscribe(): void } | undefined;

// Live subscription keeps the list in sync as exercises are created or deleted.
onMounted(() => {
  subscription = liveQuery(() =>
    db.exercises.orderBy("name").toArray(),
  ).subscribe({
    next: (result) => (allExercises.value = result),
    error: (err) => console.error("Error loading exercises:", err),
  });
});

onUnmounted(() => subscription?.unsubscribe());

watch(open, (isOpen) => {
  if (isOpen) searchQuery.value = "";
});

const filteredExercises = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  if (!q) return allExercises.value;
  return allExercises.value.filter(
    (e) =>
      e.name.toLowerCase().includes(q) ||
      e.primaryMuscleGroups.some((g) => g.toLowerCase().includes(q)) ||
      e.secondaryMuscleGroups?.some((s) => s.toLowerCase().includes(q)),
  );
});

const select = (exercise: Exercise) => {
  emit("select", exercise);
};

const createNew = () => {
  emit("create");
};
</script>

<template>
  <AppBottomSheet v-model:open="open" title="Select Exercise">
    <template #subheader>
      <div class="px-5 py-3 shrink-0">
        <div class="relative">
          <div
            class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"
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
              class="text-text-light dark:text-text-dark opacity-50"
            >
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </div>
          <input
            v-model="searchQuery"
            type="search"
            placeholder="Search exercises..."
            class="w-full bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg py-2.5 pl-9 pr-4 text-sm text-text-h-light dark:text-text-h-dark placeholder-text-light/40 dark:placeholder-text-dark/40 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50"
          />
        </div>
      </div>
    </template>

    <!-- Create new exercise -->
    <button
      class="flex w-full items-center gap-3 border-b border-border-light dark:border-border-dark px-5 py-3.5 text-left font-semibold text-sm text-accent transition-colors duration-150 hover:bg-surface-light dark:hover:bg-surface-dark cursor-pointer"
      @click="createNew"
    >
      <span
        class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </span>
      Create new exercise
    </button>

    <!-- Empty DB state -->
    <div
      v-if="allExercises.length === 0"
      class="flex flex-col items-center justify-center py-16 text-center px-8"
    >
      <p class="text-sm text-text-light dark:text-text-dark opacity-50 mb-1">
        No exercises in your library yet.
      </p>
      <p class="text-xs text-text-light dark:text-text-dark opacity-35">
        Tap "Create new exercise" above to add your first one.
      </p>
    </div>

    <!-- No search results -->
    <div
      v-else-if="filteredExercises.length === 0"
      class="flex flex-col items-center justify-center py-16"
    >
      <p class="text-sm text-text-light dark:text-text-dark opacity-50">
        No exercises match "{{ searchQuery }}"
      </p>
    </div>

    <!-- Exercise rows -->
    <div
      v-for="exercise in filteredExercises"
      :key="exercise.id"
      class="flex w-full items-center gap-3 border-b border-border-light dark:border-border-dark px-5 py-3.5 last:border-0 cursor-pointer transition-colors duration-150 hover:bg-surface-light dark:hover:bg-surface-dark"
      @click="select(exercise)"
    >
      <div class="min-w-0 flex-1">
        <div
          class="truncate font-semibold text-sm text-text-h-light dark:text-text-h-dark"
        >
          {{ exercise.name }}
        </div>
        <div
          v-if="exercise.secondaryMuscleGroups?.length"
          class="mt-0.5 truncate text-xs text-text-light dark:text-text-dark opacity-55"
        >
          {{ exercise.secondaryMuscleGroups.join(", ") }}
        </div>
      </div>

      <span
        class="shrink-0 rounded-md border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark px-2 py-0.5 text-xs text-text-light dark:text-text-dark"
      >
        {{ exercise.primaryMuscleGroups?.join(", ") }}
      </span>
    </div>

    <!-- Bottom padding for safe area -->
    <div class="h-6"></div>
  </AppBottomSheet>
</template>
