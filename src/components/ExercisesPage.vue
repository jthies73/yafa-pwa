<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { liveQuery } from "dexie";
import { db } from "../db/db";
import type { Exercise } from "../db/types";
import {
  createExercise,
  updateExercise,
  deleteExercise,
  countExerciseUsage,
  type ExerciseInput,
} from "../db/repository";
import AppFab from "./AppFab.vue";
import ExerciseFormSheet from "./ExerciseFormSheet.vue";
import ConfirmDialog from "./ConfirmDialog.vue";

const exercises = ref<Exercise[]>([]);
const searchQuery = ref("");
let subscription: any;

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
  if (!q) return exercises.value;
  return exercises.value.filter(
    (e) =>
      e.name.toLowerCase().includes(q) ||
      e.primaryMuscleGroup.toLowerCase().includes(q) ||
      e.secondaryMuscleGroups?.some((s) => s.toLowerCase().includes(q)),
  );
});

// Group exercises by primary muscle group, alphabetically.
const grouped = computed(() => {
  const groups: Record<string, Exercise[]> = {};
  for (const e of filtered.value) {
    (groups[e.primaryMuscleGroup] ??= []).push(e);
  }
  return Object.keys(groups)
    .sort((a, b) => a.localeCompare(b))
    .map((group) => ({ group, items: groups[group] }));
});

// --- Form sheet ---
const showForm = ref(false);
const editingExercise = ref<Exercise | null>(null);

const formInitial = computed<ExerciseInput | undefined>(() => {
  const e = editingExercise.value;
  if (!e) return undefined;
  return {
    name: e.name,
    primaryMuscleGroup: e.primaryMuscleGroup,
    secondaryMuscleGroups: e.secondaryMuscleGroups,
    notes: e.notes,
    bodyweightFactor: e.bodyweightFactor,
  };
});

const openCreate = () => {
  editingExercise.value = null;
  showForm.value = true;
};

const openEdit = (exercise: Exercise) => {
  editingExercise.value = exercise;
  showForm.value = true;
};

const handleSave = async (input: ExerciseInput) => {
  if (editingExercise.value) {
    await updateExercise(editingExercise.value.id, input);
  } else {
    await createExercise(input);
  }
  showForm.value = false;
};

// --- Delete confirmation ---
const showConfirm = ref(false);
const pendingDelete = ref<Exercise | null>(null);
const pendingUsage = ref(0);

const requestDelete = async (exercise: Exercise) => {
  pendingDelete.value = exercise;
  pendingUsage.value = await countExerciseUsage(exercise.id);
  showConfirm.value = true;
};

const confirmMessage = computed(() => {
  const e = pendingDelete.value;
  if (!e) return "";
  if (pendingUsage.value > 0) {
    return `"${e.name}" is used in ${pendingUsage.value} routine slot${
      pendingUsage.value === 1 ? "" : "s"
    }. Deleting it will remove it from those routines. This cannot be undone.`;
  }
  return `Delete "${e.name}" from your exercise library? This cannot be undone.`;
});

const confirmDelete = async () => {
  if (pendingDelete.value) await deleteExercise(pendingDelete.value.id);
  pendingDelete.value = null;
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

    <!-- Search -->
    <div class="relative mb-6 w-full max-w-md">
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

    <!-- No search results -->
    <div
      v-else-if="filtered.length === 0"
      class="flex flex-grow flex-col items-center justify-center py-16 text-center"
    >
      <p class="text-sm text-text-light dark:text-text-dark opacity-50">
        No exercises match "{{ searchQuery }}"
      </p>
    </div>

    <!-- Grouped list -->
    <div v-else class="flex flex-col gap-6">
      <section v-for="section in grouped" :key="section.group">
        <h2
          class="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-50"
        >
          {{ section.group }}
        </h2>
        <div
          class="overflow-hidden rounded-xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark shadow-sm"
        >
          <div
            v-for="exercise in section.items"
            :key="exercise.id"
            class="flex cursor-pointer items-center gap-3 border-b border-border-light dark:border-border-dark px-5 py-4 transition-colors duration-150 last:border-0 hover:bg-surface-light-hover dark:hover:bg-surface-dark-hover"
            @click="openEdit(exercise)"
          >
            <div class="min-w-0 flex-1">
              <div
                class="truncate text-sm font-bold text-text-h-light dark:text-text-h-dark"
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

            <!-- Bodyweight indicator -->
            <span
              v-if="exercise.bodyweightFactor > 0"
              class="shrink-0 rounded-md border border-border-light dark:border-border-dark px-2 py-0.5 font-mono text-xs text-text-light dark:text-text-dark"
              title="Bodyweight factor"
            >
              BW ×{{ exercise.bodyweightFactor }}
            </span>

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

            <!-- Delete -->
            <button
              class="-mr-1 shrink-0 cursor-pointer p-1.5 text-text-light dark:text-text-dark transition-colors duration-150 hover:text-red-500"
              title="Delete exercise"
              @click.stop="requestDelete(exercise)"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
                <path d="M10 11v6M14 11v6"></path>
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
              </svg>
            </button>
          </div>
        </div>
      </section>
    </div>

    <!-- New Exercise FAB -->
    <AppFab label="New Exercise" @click="openCreate" />

    <ExerciseFormSheet
      v-model:open="showForm"
      :is-editing="editingExercise !== null"
      :initial="formInitial"
      @save="handleSave"
    />

    <ConfirmDialog
      v-model:open="showConfirm"
      title="Delete exercise?"
      :message="confirmMessage"
      confirm-label="Delete"
      @confirm="confirmDelete"
    />
  </div>
</template>
