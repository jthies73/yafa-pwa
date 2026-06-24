<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { liveQuery } from "dexie";
import { db } from "../db/db";
import type { Exercise } from "../db/types";
import { createExercise, type ExerciseInput } from "../db/repository";
import { MUSCLE_GROUPS } from "../utils/constants";
import AppFab from "./AppFab.vue";
import ExerciseFormSheet from "./ExerciseFormSheet.vue";

const router = useRouter();

const exercises = ref<Exercise[]>([]);
const searchQuery = ref("");
const muscleFilter = ref<string | null>(null);
let subscription: { unsubscribe(): void } | undefined;

onMounted(() => {
  subscription = liveQuery(() =>
    db.exercises.orderBy("name").toArray(),
  ).subscribe({
    next: (result) => (exercises.value = result),
    error: (err) => console.error("Error loading exercises:", err),
  });
});

onUnmounted(() => subscription?.unsubscribe());

const filtered = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  const m = muscleFilter.value;
  return exercises.value.filter((e) => {
    if (q && !e.name.toLowerCase().includes(q)) return false;
    if (m && !e.primaryMuscleGroups.includes(m)) return false;
    return true;
  });
});

const hasActiveFilter = computed(
  () => searchQuery.value.trim() !== "" || muscleFilter.value !== null,
);

const clearFilters = () => {
  searchQuery.value = "";
  muscleFilter.value = null;
};

// --- Create form sheet (editing now lives on the exercise detail page) ---
const showForm = ref(false);

const openCreate = () => {
  showForm.value = true;
};

const openDetail = (exercise: Exercise) => {
  router.push({ name: "exercise-details", params: { id: exercise.id } });
};

const handleSave = async (input: ExerciseInput) => {
  await createExercise(input);
  showForm.value = false;
};
</script>

<template>
  <div class="relative flex min-h-full flex-col p-6 pb-24">
    <!-- Header -->
    <div class="mb-6">
      <h1
        class="text-3xl font-bold tracking-tight text-text-h-light dark:text-text-h-dark"
      >
        Exercises
      </h1>
      <p class="mt-1 text-sm text-text-light dark:text-text-dark opacity-70">
        Manage your exercise library
      </p>
    </div>

    <!-- Search + filter -->
    <div class="mb-6 flex flex-col gap-3">
      <div class="relative w-full max-w-md">
        <div
          class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="text-text-light dark:text-text-dark opacity-55"
          >
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </div>
        <input
          v-model="searchQuery"
          type="search"
          placeholder="Search exercises..."
          class="w-full rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark py-2.5 pl-10 pr-4 text-sm text-text-h-light dark:text-text-h-dark placeholder-text-light/50 dark:placeholder-text-dark/50 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
      </div>

      <!-- Muscle chips -->
      <div
        class="flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-none"
      >
        <button
          v-if="hasActiveFilter"
          class="shrink-0 rounded-lg border border-border-light dark:border-border-dark px-3 py-1.5 text-xs font-semibold text-text-light dark:text-text-dark hover:bg-surface-light dark:hover:bg-surface-dark cursor-pointer transition-colors duration-150"
          @click="clearFilters"
        >
          Clear
        </button>
        <button
          v-for="muscle in MUSCLE_GROUPS"
          :key="muscle"
          class="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors duration-150"
          :class="
            muscleFilter === muscle
              ? 'bg-accent text-bg-dark'
              : 'border border-border-light dark:border-border-dark text-text-light dark:text-text-dark hover:bg-surface-light dark:hover:bg-surface-dark'
          "
          @click="muscleFilter = muscleFilter === muscle ? null : muscle"
        >
          {{ muscle }}
        </button>
      </div>
    </div>

    <!-- Empty library -->
    <div
      v-if="exercises.length === 0"
      class="flex flex-grow flex-col items-center justify-center rounded-xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark p-8 text-center shadow-sm"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="56"
        height="56"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="mb-4 text-accent opacity-80"
      >
        <path d="M6.5 6.5 17.5 17.5" />
        <path d="m21 21-1-1" />
        <path d="m3 3 1 1" />
        <path d="m18 22 4-4" />
        <path d="m2 6 4-4" />
        <path d="m3 10 7-7" />
        <path d="m14 21 7-7" />
      </svg>
      <h2
        class="mb-2 text-xl font-semibold text-text-h-light dark:text-text-h-dark"
      >
        No exercises yet
      </h2>
      <p class="max-w-sm text-text-light dark:text-text-dark opacity-70">
        Build your exercise library to start composing routines and tracking
        progression.
      </p>
    </div>

    <!-- No search/filter results -->
    <div
      v-else-if="filtered.length === 0"
      class="flex flex-grow flex-col items-center justify-center py-16 text-center"
    >
      <p class="text-sm text-text-light dark:text-text-dark opacity-50">
        No exercises match your filters.
      </p>
    </div>

    <!-- Flat alphabetical list -->
    <div
      v-else
      class="overflow-hidden rounded-xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark shadow-sm"
    >
      <div
        v-for="exercise in filtered"
        :key="exercise.id"
        class="flex cursor-pointer items-center gap-3 border-b border-border-light dark:border-border-dark px-5 py-4 transition-colors duration-150 last:border-0 hover:bg-surface-light-hover dark:hover:bg-surface-dark-hover"
        @click="openDetail(exercise)"
      >
        <div class="min-w-0 flex-1">
          <div
            class="truncate text-sm font-bold text-text-h-light dark:text-text-h-dark"
          >
            {{ exercise.name }}
          </div>
          <div
            v-if="exercise.primaryMuscleGroups?.length"
            class="mt-0.5 truncate text-xs text-text-light dark:text-text-dark opacity-55"
          >
            {{ exercise.primaryMuscleGroups.join(", ") }}
          </div>
        </div>

        <!-- Edit chevron -->
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="shrink-0 text-text-light dark:text-text-dark opacity-30"
        >
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </div>
    </div>

    <!-- New Exercise FAB -->
    <AppFab label="New Exercise" @click="openCreate" />

    <ExerciseFormSheet
      v-model:open="showForm"
      :is-editing="false"
      @save="handleSave"
    />
  </div>
</template>
