<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { liveQuery } from "dexie";
import { db } from "../db/db";
import type {
  AnalyticsChartConfig,
  Exercise,
  Routine,
  Workout,
} from "../db/types";
import {
  getWorkouts,
  updateExercise,
  deleteExercise,
  countExerciseUsage,
  type ExerciseInput,
} from "../db/repository";
import {
  computeWorkoutSummary,
  type WorkoutSummary,
} from "../analytics/summary";
import type { PrType } from "../analytics/summary";
import { peakImpliedE1rm } from "../engine/matrix";
import { DEFAULT_RPE_MATRIX } from "../db/rpeMatrix";
import { TIMEFRAME_OPTIONS } from "../analytics/presentation";
import type { Timeframe } from "../analytics/service";
import { useWeightUnit } from "../composables/useWeightUnit";
import AnalyticsChartCard from "./AnalyticsChartCard.vue";
import ExerciseFormSheet from "./ExerciseFormSheet.vue";
import WorkoutDetailSheet from "./WorkoutDetailSheet.vue";
import ConfirmDialog from "./ConfirmDialog.vue";

const props = defineProps<{ id: string }>();
const router = useRouter();
const { format: formatWeight } = useWeightUnit();

// --- Live data ---
const exercise = ref<Exercise | null>(null);
const exerciseWorkouts = ref<Workout[]>([]); // sessions containing this exercise, newest first
const exercisesById = ref<Map<string, Exercise>>(new Map());
const routinesById = ref<Map<string, Routine>>(new Map());
const summaries = ref<Map<string, WorkoutSummary>>(new Map());
const loading = ref(true);
let subscription: { unsubscribe(): void } | undefined;

onMounted(() => {
  subscription = liveQuery(async () => {
    const [ex, workouts, exercises, routines] = await Promise.all([
      db.exercises.get(props.id),
      getWorkouts(),
      db.exercises.toArray(),
      db.routines.toArray(),
    ]);
    return { ex: ex ?? null, workouts, exercises, routines };
  }).subscribe({
    next: ({ ex, workouts, exercises, routines }) => {
      loading.value = false;
      exercise.value = ex;
      exercisesById.value = new Map(exercises.map((e) => [e.id, e]));
      routinesById.value = new Map(routines.map((r) => [r.id, r]));

      const mine = workouts.filter((w) =>
        w.exercises.some((e) => e.exerciseId === props.id),
      );
      exerciseWorkouts.value = mine;

      // PRs are detected against full history, so each summary sees every other
      // session (mirrors WorkoutHistoryPage). Only the relevant sessions are built.
      const next = new Map<string, WorkoutSummary>();
      for (const w of mine) {
        next.set(
          w.id,
          computeWorkoutSummary({
            workout: w,
            history: workouts.filter((o) => o.id !== w.id),
            exercisesById: exercisesById.value,
            plannedCounts: {},
          }),
        );
      }
      summaries.value = next;
    },
    error: (err) => {
      loading.value = false;
      console.error("Error loading exercise details:", err);
    },
  });
});

onUnmounted(() => subscription?.unsubscribe());

const goBack = () => router.back();

// --- Progress chart (in-memory, exercise-scoped e1RM line) ---
const TIMEFRAME_KEY = "yafa:exerciseChartTimeframe";
const readTimeframe = (): Timeframe => {
  const stored = localStorage.getItem(TIMEFRAME_KEY);
  return TIMEFRAME_OPTIONS.some((o) => o.value === stored)
    ? (stored as Timeframe)
    : "max";
};
const timeframe = ref<Timeframe>(readTimeframe());
const setTimeframe = (next: Timeframe) => {
  timeframe.value = next;
  localStorage.setItem(TIMEFRAME_KEY, next);
};

const chartConfig = computed<AnalyticsChartConfig>(() => ({
  id: `exercise-${props.id}`,
  sourceKind: "exercise",
  exerciseId: props.id,
  metric: "e1rm",
  bucket: "session",
  order: 0,
  created_at: 0,
}));

// --- History rows (best set + e1RM + PRs), paginated ---
const PR_LABELS: Record<PrType, string> = {
  e1rm: "e1RM PR",
  rep: "Rep PR",
  volume: "Volume PR",
};

const formatDate = (ts: number): string =>
  new Date(ts).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

interface HistoryRow {
  workout: Workout;
  date: string;
  routineName: string;
  setCount: number;
  best: { weight: number; reps: number; rpe?: number; e1rm: number } | null;
  prTypes: PrType[];
}

const rows = computed<HistoryRow[]>(() => {
  const matrix = exercise.value?.rpeMatrix ?? DEFAULT_RPE_MATRIX;
  return exerciseWorkouts.value.map((w) => {
    const sets = w.exercises
      .filter((e) => e.exerciseId === props.id)
      .flatMap((e) => e.sets);
    const peak = peakImpliedE1rm(matrix, sets);
    return {
      workout: w,
      date: formatDate(w.startTime),
      routineName: routinesById.value.get(w.routineId)?.name ?? "Workout",
      setCount: sets.length,
      best: peak
        ? {
            weight: peak.set.actualWeight,
            reps: peak.set.actualReps,
            rpe: peak.set.actualRpe,
            e1rm: peak.e1rm,
          }
        : null,
      prTypes: (summaries.value.get(w.id)?.prs ?? [])
        .filter((p) => p.exerciseId === props.id)
        .map((p) => p.type),
    };
  });
});

const PAGE_SIZE = 10;
const visibleCount = ref(PAGE_SIZE);
const visibleRows = computed(() => rows.value.slice(0, visibleCount.value));
const loadMore = () => (visibleCount.value += PAGE_SIZE);

// --- Edit ---
const showForm = ref(false);
const formInitial = computed<ExerciseInput | undefined>(() => {
  const e = exercise.value;
  if (!e) return undefined;
  return {
    name: e.name,
    primaryMuscleGroups: e.primaryMuscleGroups,
    secondaryMuscleGroups: e.secondaryMuscleGroups,
    notes: e.notes,
    rpeMatrix: e.rpeMatrix,
  };
});
const handleSave = async (input: ExerciseInput) => {
  await updateExercise(props.id, input);
  showForm.value = false;
};

// --- Delete (usage-aware confirm, moved off ExerciseFormSheet) ---
const showConfirm = ref(false);
const pendingUsage = ref(0);
const deleteMessage = computed(() => {
  const name = exercise.value?.name ?? "this exercise";
  if (pendingUsage.value > 0) {
    return `"${name}" is used in ${pendingUsage.value} routine slot${
      pendingUsage.value === 1 ? "" : "s"
    }. Deleting it will remove it from those routines. This cannot be undone.`;
  }
  return `Delete "${name}" from your exercise library? This cannot be undone.`;
});
const requestDelete = async () => {
  pendingUsage.value = await countExerciseUsage(props.id);
  showConfirm.value = true;
};
const confirmDelete = async () => {
  await deleteExercise(props.id);
  goBack();
};

// --- Workout detail sheet ---
const showDetail = ref(false);
const activeWorkout = ref<Workout | null>(null);
const openDetail = (w: Workout) => {
  activeWorkout.value = w;
  showDetail.value = true;
};
const routineNameOf = (w: Workout): string =>
  routinesById.value.get(w.routineId)?.name ?? "Workout";
</script>

<template>
  <div class="p-6 relative min-h-full flex flex-col gap-6 pb-24">
    <!-- Back button & header -->
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

      <div
        v-if="exercise"
        class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"
      >
        <div class="min-w-0 mb-3">
          <h1
            class="text-3xl font-bold tracking-tight text-text-h-light dark:text-text-h-dark"
          >
            {{ exercise.name }}
          </h1>
          <p
            v-if="exercise.primaryMuscleGroups.length"
            class="mt-1 text-sm text-text-light dark:text-text-dark opacity-70"
          >
            {{ exercise.primaryMuscleGroups.join(", ") }}
          </p>
        </div>
        <div class="flex items-center gap-2 self-start md:shrink-0">
          <button
            class="p-2.5 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark hover:text-accent hover:bg-surface-light-hover dark:hover:bg-surface-dark-hover cursor-pointer transition-colors duration-150"
            title="Edit exercise"
            @click="showForm = true"
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
            title="Delete exercise"
            @click="requestDelete"
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

    <!-- Loading spinner -->
    <div
      v-if="loading"
      class="flex-grow flex flex-col items-center justify-center p-12"
    >
      <div
        class="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin"
      ></div>
    </div>

    <!-- Detail -->
    <div v-else-if="exercise" class="flex flex-col gap-6">
      <!-- Progress chart -->
      <div class="border-t border-border-light dark:border-border-dark pt-6">
        <div class="mb-4 flex items-center justify-between gap-3">
          <h2 class="text-xl font-bold text-text-h-light dark:text-text-h-dark">
            Progress
          </h2>
          <div
            class="flex gap-1 p-1 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl"
          >
            <button
              v-for="tf in TIMEFRAME_OPTIONS"
              :key="tf.value"
              class="flex-1 text-xs font-bold py-1.5 px-3 rounded-lg cursor-pointer transition-colors duration-150"
              :class="
                timeframe === tf.value
                  ? 'bg-accent text-bg-dark'
                  : 'text-text-light dark:text-text-dark hover:text-text-h-light dark:hover:text-text-h-dark'
              "
              @click="setTimeframe(tf.value)"
            >
              {{ tf.label }}
            </button>
          </div>
        </div>
        <AnalyticsChartCard
          :config="chartConfig"
          :title="exercise.name"
          :timeframe="timeframe"
          static
        />
      </div>

      <!-- History -->
      <div class="border-t border-border-light dark:border-border-dark pt-6">
        <h2
          class="text-xl font-bold text-text-h-light dark:text-text-h-dark mb-4"
        >
          History
        </h2>

        <div
          v-if="rows.length === 0"
          class="text-sm italic text-text-light dark:text-text-dark opacity-60"
        >
          No logged sessions for this exercise yet.
        </div>

        <div v-else class="flex flex-col gap-3">
          <button
            v-for="row in visibleRows"
            :key="row.workout.id"
            class="flex w-full cursor-pointer flex-col items-start gap-1.5 rounded-xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark p-4 text-left shadow-sm transition-colors duration-150 hover:bg-surface-light-hover dark:hover:bg-surface-dark-hover"
            @click="openDetail(row.workout)"
          >
            <div class="flex w-full items-center justify-between gap-2">
              <span
                class="truncate text-sm font-bold text-text-h-light dark:text-text-h-dark"
              >
                {{ row.date }} · {{ row.routineName }}
              </span>
              <span
                v-for="t in row.prTypes"
                :key="t"
                class="shrink-0 rounded-md bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent"
              >
                {{ PR_LABELS[t] }}
              </span>
            </div>
            <div
              class="font-mono text-xs text-text-light dark:text-text-dark opacity-80"
            >
              {{ row.setCount }} set{{ row.setCount === 1 ? "" : "s" }}
              <template v-if="row.best">
                · best {{ formatWeight(row.best.weight) }} × {{ row.best.reps
                }}<template v-if="row.best.rpe != null">
                  @ {{ row.best.rpe }}</template
                >
                · e1RM {{ formatWeight(row.best.e1rm, 0) }}
              </template>
            </div>
          </button>

          <button
            v-if="visibleRows.length < rows.length"
            class="self-center mt-1 rounded-lg border border-border-light dark:border-border-dark px-4 py-2 text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark hover:bg-surface-light dark:hover:bg-surface-dark cursor-pointer transition-colors duration-150"
            @click="loadMore"
          >
            Load more
          </button>
        </div>
      </div>
    </div>

    <!-- Not found -->
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
        Exercise not found
      </h2>
      <p class="text-sm text-text-light dark:text-text-dark opacity-70 mb-4">
        The requested exercise could not be located in the database.
      </p>
      <button
        class="px-4 py-2 bg-accent hover:bg-accent-hover text-bg-dark text-xs font-bold rounded-lg cursor-pointer transition-colors duration-150 tracking-wider uppercase"
        @click="goBack"
      >
        Go Back
      </button>
    </div>
  </div>

  <ExerciseFormSheet
    v-model:open="showForm"
    :is-editing="true"
    :exercise-id="id"
    :initial="formInitial"
    @save="handleSave"
  />

  <WorkoutDetailSheet
    v-model:open="showDetail"
    :workout="activeWorkout"
    :summary="activeWorkout ? summaries.get(activeWorkout.id) : undefined"
    :exercises-by-id="exercisesById"
    :routine-name="activeWorkout ? routineNameOf(activeWorkout) : ''"
    @deleted="showDetail = false"
  />

  <ConfirmDialog
    v-model:open="showConfirm"
    title="Delete exercise?"
    :message="deleteMessage"
    confirm-label="Delete"
    @confirm="confirmDelete"
  />
</template>
