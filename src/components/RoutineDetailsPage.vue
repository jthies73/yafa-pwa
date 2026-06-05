<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { liveQuery } from "dexie";
import Sortable from "sortablejs";
import { db } from "../db/db";
import type { Routine, Exercise, RoutineExerciseConfig } from "../db/types";
import {
  updateRoutine,
  deleteRoutine,
  createExercise,
  type RoutineInput,
  type ExerciseInput,
} from "../db/repository";
import AppFab from "./AppFab.vue";
import ExercisePickerSheet from "./ExercisePickerSheet.vue";
import ExerciseConfigSheet from "./ExerciseConfigSheet.vue";
import ExerciseFormSheet from "./ExerciseFormSheet.vue";
import RoutineFormSheet from "./RoutineFormSheet.vue";
import ConfirmDialog from "./ConfirmDialog.vue";

const props = defineProps<{ id: string }>();
const router = useRouter();

// --- Live data ---
const routine = ref<Routine | null>(null);
const exercisesMap = ref<Record<string, Exercise>>({});
const loading = ref(true);
let subscription: any;

onMounted(() => {
  subscription = liveQuery(async () => {
    const r = await db.routines.get(props.id);
    if (!r) return null;
    const exerciseIds = new Set<string>();
    for (const e of r.exercises) exerciseIds.add(e.exerciseId);
    const eList = await Promise.all(
      Array.from(exerciseIds).map((id) => db.exercises.get(id)),
    );
    const eMap: Record<string, Exercise> = {};
    for (const e of eList) if (e) eMap[e.id] = e;
    return { routine: r, exercisesMap: eMap };
  }).subscribe({
    next: (result) => {
      loading.value = false;
      if (result) {
        routine.value = result.routine;
        exercisesMap.value = result.exercisesMap;
      }
    },
    error: (err) => {
      loading.value = false;
      console.error("Error loading routine details:", err);
    },
  });
});

onUnmounted(() => {
  subscription?.unsubscribe();
  sortable?.destroy();
});

watch(
  () => routine.value?.exercises.length,
  async (len) => {
    if (len === undefined) return;
    await nextTick();
    initSortable();
  },
);

const goBack = () => router.back();

// --- Rename routine ---
const showRoutineForm = ref(false);

const routineFormInitial = computed(() =>
  routine.value ? { name: routine.value.name } : undefined,
);

const handleRenameRoutine = async (input: RoutineInput) => {
  if (!routine.value) return;
  await updateRoutine(routine.value.id, input);
  showRoutineForm.value = false;
};

// --- Delete routine ---
const showConfirm = ref(false);

const deleteMessage = computed(() =>
  routine.value
    ? `Delete "${routine.value.name}" and its exercise configuration? This cannot be undone.`
    : "",
);

const confirmDeleteRoutine = async () => {
  if (!routine.value) return;
  await deleteRoutine(routine.value.id);
  goBack();
};

// --- Exercise Picker Sheet ---
const showPicker = ref(false);

// --- New Exercise Sheet (create in library, then add to this routine) ---
const showExerciseForm = ref(false);

const handleCreateExercise = async () => {
  showPicker.value = false;
  await nextTick();
  showExerciseForm.value = true;
};

const handleSaveNewExercise = async (input: ExerciseInput) => {
  const id = await createExercise(input);
  showExerciseForm.value = false;
  // Flow straight into configuring the freshly created exercise for this routine.
  configExerciseId.value = id;
  configExerciseName.value = input.name.trim();
  editingIndex.value = null;
  await nextTick();
  showConfig.value = true;
};

// --- Config Sheet ---
const showConfig = ref(false);
const editingIndex = ref<number | null>(null);
const configExerciseId = ref("");
const configExerciseName = ref("");
const saving = ref(false);

const initialConfig = computed(() => {
  if (editingIndex.value !== null && routine.value) {
    return routine.value.exercises[editingIndex.value].config;
  }
  return undefined;
});

const handleSelectExercise = async (exercise: Exercise) => {
  configExerciseId.value = exercise.id;
  configExerciseName.value = exercise.name;
  editingIndex.value = null;
  showPicker.value = false;
  await nextTick();
  showConfig.value = true;
};

const editExercise = (idx: number) => {
  const rEx = routine.value!.exercises[idx];
  configExerciseId.value = rEx.exerciseId;
  configExerciseName.value =
    exercisesMap.value[rEx.exerciseId]?.name ?? "Exercise";
  editingIndex.value = idx;
  showConfig.value = true;
};

const toPlainConfig = (
  cfg?: RoutineExerciseConfig,
): RoutineExerciseConfig | undefined => {
  if (!cfg) return undefined;
  return {
    progressionModel: cfg.progressionModel,
    progressionParams: { ...cfg.progressionParams } as any,
    ...(cfg.notes ? { notes: cfg.notes } : {}),
  };
};

const handleSaveConfig = async (config: RoutineExerciseConfig) => {
  if (!routine.value || saving.value) return;
  saving.value = true;
  try {
    // Reconstruct exercises array, stripping Proxies from existing exercises
    const exercises = routine.value.exercises.map((ex) => ({
      exerciseId: ex.exerciseId,
      config: toPlainConfig(ex.config),
    }));
    if (editingIndex.value === null) {
      exercises.push({ exerciseId: configExerciseId.value, config });
    } else {
      exercises[editingIndex.value] = {
        exerciseId: configExerciseId.value,
        config,
      };
    }
    await db.routines.update(routine.value.id, { exercises });
    showConfig.value = false;
  } finally {
    saving.value = false;
  }
};

const removeExercise = async (idx: number) => {
  if (!routine.value) return;
  const exercises = routine.value.exercises
    .filter((_, i) => i !== idx)
    .map((ex) => ({
      exerciseId: ex.exerciseId,
      config: toPlainConfig(ex.config),
    }));
  await db.routines.update(routine.value.id, { exercises });
};

const handleRemoveExercise = async () => {
  if (editingIndex.value !== null) {
    await removeExercise(editingIndex.value);
    editingIndex.value = null;
    showConfig.value = false;
  }
};

// --- Sortable exercise list ---
const exerciseListEl = ref<HTMLElement | null>(null);
let sortable: Sortable | null = null;

const initSortable = () => {
  if (!exerciseListEl.value) return;
  sortable?.destroy();
  sortable = Sortable.create(exerciseListEl.value, {
    animation: 150,
    ghostClass: "opacity-30",
    onEnd: async ({ oldIndex, newIndex }) => {
      if (
        oldIndex === undefined ||
        newIndex === undefined ||
        oldIndex === newIndex ||
        !routine.value
      )
        return;
      const exercises = routine.value.exercises.map((ex) => ({
        exerciseId: ex.exerciseId,
        config: toPlainConfig(ex.config),
      }));
      const [moved] = exercises.splice(oldIndex, 1);
      exercises.splice(newIndex, 0, moved);
      await db.routines.update(routine.value.id, { exercises });
    },
  });
};

// --- Display helpers ---
const getProgressionLabel = (config?: RoutineExerciseConfig) => {
  if (!config) return "Not configured";
  if (config.progressionModel === "linear") return "Linear Progression";
  if (config.progressionModel === "double") return "Double Progression";
  if (config.progressionModel === "topset_backoff") return "Top Set + Back-Off";
  return "Custom";
};

const getSummary = (config?: RoutineExerciseConfig) => {
  if (!config?.progressionParams) return "—";
  const p = config.progressionParams as unknown as Record<string, number>;
  if (config.progressionModel === "linear")
    return `${p.targetSets} × ${p.targetReps}`;
  if (config.progressionModel === "double")
    return `${p.targetSets} × ${p.minReps}–${p.maxReps}`;
  if (config.progressionModel === "topset_backoff")
    return `1 × ${p.topSetTargetReps} + ${p.backOffSets}×`;
  return "—";
};
</script>

<template>
  <div class="p-6 relative min-h-full flex flex-col gap-6 pb-24">
    <!-- Back Button & Page Header -->
    <div class="flex flex-col gap-4">
      <button
        class="inline-flex items-center gap-2 text-sm font-semibold text-text-light dark:text-text-dark hover:text-accent cursor-pointer transition-colors duration-150 self-start"
        @click="goBack"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="19" y1="12" x2="5" y2="12"></line>
          <polyline points="12 19 5 12 12 5"></polyline>
        </svg>
        Back
      </button>

      <div v-if="routine" class="flex items-start justify-between gap-4">
        <div class="flex-grow min-w-0">
          <h1
            class="text-3xl font-bold tracking-tight text-text-h-light dark:text-text-h-dark"
          >
            {{ routine.name }}
          </h1>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button
            class="p-2.5 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark hover:text-accent hover:bg-surface-light-hover dark:hover:bg-surface-dark-hover cursor-pointer transition-colors duration-150"
            title="Rename routine"
            @click="showRoutineForm = true"
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
              <path d="M12 20h9"></path>
              <path
                d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
              ></path>
            </svg>
          </button>
          <button
            class="p-2.5 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark hover:text-red-500 hover:bg-surface-light-hover dark:hover:bg-surface-dark-hover cursor-pointer transition-colors duration-150"
            title="Delete routine"
            @click="showConfirm = true"
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
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
              <path d="M10 11v6M14 11v6"></path>
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
            </svg>
          </button>
        </div>
      </div>
      <div
        v-else-if="loading"
        class="h-10 w-48 bg-black/5 dark:bg-white/5 animate-pulse rounded-lg mt-2"
      ></div>
    </div>

    <!-- Loading Spinner -->
    <div
      v-if="loading"
      class="flex-grow flex flex-col items-center justify-center p-12"
    >
      <div
        class="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin"
      ></div>
    </div>

    <!-- Exercises List -->
    <div v-else-if="routine" class="flex flex-col gap-6">
      <div class="border-t border-border-light dark:border-border-dark pt-6">
        <h2
          class="text-xl font-bold text-text-h-light dark:text-text-h-dark mb-4"
        >
          Exercises
        </h2>

        <div
          v-if="routine.exercises.length === 0"
          class="text-sm italic text-text-light dark:text-text-dark opacity-60"
        >
          No exercises configured for this routine.
        </div>

        <div
          v-else
          ref="exerciseListEl"
          class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl shadow-sm overflow-hidden"
        >
          <div
            v-for="(rEx, idx) in routine.exercises"
            :key="rEx.exerciseId + '-' + idx"
            class="flex items-center gap-3 px-5 py-4 border-b border-border-light dark:border-border-dark last:border-0 cursor-grab active:cursor-grabbing hover:bg-surface-light-hover dark:hover:bg-surface-dark-hover transition-colors duration-150"
            @click="editExercise(idx)"
          >
            <!-- Drag handle -->
            <span
              class="drag-handle shrink-0 cursor-grab active:cursor-grabbing text-text-light dark:text-text-dark opacity-30 hover:opacity-60 transition-opacity duration-150"
              @click.stop
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

            <!-- Index -->
            <span
              class="text-sm font-semibold text-text-light dark:text-text-dark opacity-35 w-6 text-center shrink-0 tabular-nums"
            >
              {{ idx + 1 }}.
            </span>

            <!-- Name + progression type -->
            <div class="flex-1 min-w-0">
              <div
                class="font-bold text-sm text-text-h-light dark:text-text-h-dark truncate"
              >
                {{ exercisesMap[rEx.exerciseId]?.name || "Unknown Exercise" }}
              </div>
              <div
                class="text-xs text-text-light dark:text-text-dark opacity-55 mt-0.5"
              >
                {{ getProgressionLabel(rEx.config) }}
              </div>
            </div>

            <!-- Sets × Reps summary -->
            <span
              class="text-xs font-mono font-semibold text-text-h-light dark:text-text-h-dark shrink-0"
            >
              {{ getSummary(rEx.config) }}
            </span>

            <!-- Edit indicator -->
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
              class="text-text-light dark:text-text-dark opacity-30 shrink-0"
            >
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </div>
        </div>
      </div>
    </div>

    <!-- Not Found -->
    <div
      v-else
      class="flex-grow flex flex-col items-center justify-center p-12 text-center"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="text-red-500 mb-3"
      >
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <h2
        class="text-xl font-bold text-text-h-light dark:text-text-h-dark mb-1"
      >
        Routine not found
      </h2>
      <p class="text-sm text-text-light dark:text-text-dark opacity-70 mb-4">
        The requested routine could not be located in the database.
      </p>
      <button
        class="px-4 py-2 bg-accent hover:bg-accent/90 text-bg-dark text-xs font-bold rounded-lg cursor-pointer transition-colors duration-150 tracking-wider uppercase"
        @click="goBack"
      >
        Go Back
      </button>
    </div>
  </div>

  <!-- Add Exercise FAB -->
  <AppFab v-if="routine" label="Add Exercise" @click="showPicker = true" />

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

  <ExerciseConfigSheet
    v-model:open="showConfig"
    :exercise-name="configExerciseName"
    :is-editing="editingIndex !== null"
    :initial-config="initialConfig"
    @save="handleSaveConfig"
    @remove="handleRemoveExercise"
  />

  <RoutineFormSheet
    v-model:open="showRoutineForm"
    :is-editing="true"
    :initial="routineFormInitial"
    @save="handleRenameRoutine"
  />

  <ConfirmDialog
    v-model:open="showConfirm"
    title="Delete routine?"
    :message="deleteMessage"
    confirm-label="Delete"
    @confirm="confirmDeleteRoutine"
  />
</template>
