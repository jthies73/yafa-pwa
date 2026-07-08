<script setup lang="ts">
import { ref, computed, watch } from "vue";
import type { Exercise, Workout, Set as LoggedSet } from "../db/types";
import type { PrType, WorkoutSummary } from "../analytics/summary";
import { deleteWorkout } from "../db/repository";
import { bodyweightAt } from "../db/measurements";
import { bodyweightOffsetKg, liftSet } from "../engine/bodyweight";
import { impliedE1rm, isQualifyingSet } from "../engine/matrix";
import { DEFAULT_RPE_MATRIX } from "../db/rpeMatrix";
import { useWeightUnit } from "../composables/useWeightUnit";
import AppBottomSheet from "./AppBottomSheet.vue";
import ConfirmDialog from "./ConfirmDialog.vue";

const props = defineProps<{
  workout: Workout | null;
  summary?: WorkoutSummary;
  exercisesById: Map<string, Exercise>;
  routineName: string;
}>();

const open = defineModel<boolean>("open", { required: true });

const emit = defineEmits<{
  (e: "deleted"): void;
}>();

const { display: displayWeight, format: formatWeight, label } = useWeightUnit();

const exerciseName = (id: string): string =>
  props.exercisesById.get(id)?.name ?? "Exercise";

// An exercise can earn several PR kinds in one session (e.g. e1RM + Volume);
// group them so each kind gets its own badge.
const prTypesByExercise = computed(() => {
  const map = new Map<string, PrType[]>();
  for (const pr of props.summary?.prs ?? []) {
    const list = map.get(pr.exerciseId);
    if (list) list.push(pr.type);
    else map.set(pr.exerciseId, [pr.type]);
  }
  return map;
});

const PR_LABELS: Record<PrType, string> = {
  e1rm: "e1RM PR",
  rep: "Rep PR",
  volume: "Volume PR",
};

const formatDate = (ts: number): string =>
  new Date(ts).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const formatDuration = (ms: number): string =>
  ms > 0 ? `${Math.round(ms / 60000)} min` : "—";

// Bodyweight (kg) at the shown workout's time — lifts bodyweightFactor
// exercises' sets to total load for their e1RM readouts.
const workoutBodyweight = ref<number | undefined>(undefined);
watch(
  () => props.workout?.startTime,
  async (ts) => {
    workoutBodyweight.value = ts != null ? await bodyweightAt(ts) : undefined;
  },
  { immediate: true },
);

/** Implied e1RM (raw kg, total load) for a near-limit set; null when the set isn't honest enough to count. */
const setE1rm = (set: LoggedSet, exerciseId: string): number | null => {
  const exercise = props.exercisesById.get(exerciseId);
  const lifted = liftSet(
    set,
    bodyweightOffsetKg(exercise?.bodyweightFactor, workoutBodyweight.value),
  );
  if (!isQualifyingSet(lifted)) return null;
  const matrix = exercise?.rpeMatrix ?? DEFAULT_RPE_MATRIX;
  const e1rm = impliedE1rm(
    matrix,
    lifted.actualWeight,
    lifted.actualReps,
    lifted.actualRpe!,
  );
  return e1rm > 0 ? e1rm : null;
};

// --- Delete ---
const confirmOpen = ref(false);

const onConfirmDelete = async () => {
  if (!props.workout) return;
  await deleteWorkout(props.workout.id);
  open.value = false;
  emit("deleted");
};
</script>

<template>
  <AppBottomSheet v-model:open="open">
    <template #title>
      <div class="flex w-full items-center justify-between gap-3">
        <div class="min-w-0">
          <h2
            class="truncate text-lg font-bold text-text-h-light dark:text-text-h-dark"
          >
            {{ routineName }}
          </h2>
          <p
            v-if="workout"
            class="truncate text-xs text-text-light dark:text-text-dark opacity-60"
          >
            {{ formatDate(workout.startTime) }}
          </p>
        </div>
        <button
          type="button"
          class="px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-red-500/10 text-red-500 hover:bg-red-500/20 dark:bg-red-500/15 dark:text-red-400 dark:hover:bg-red-500/25 transition-colors duration-150 cursor-pointer shrink-0"
          @click="confirmOpen = true"
        >
          Delete
        </button>
      </div>
    </template>

    <!-- Summary strip -->
    <div
      v-if="summary"
      class="grid grid-cols-4 gap-3 border-b border-border-light dark:border-border-dark px-5 py-4"
    >
      <div class="flex flex-col gap-1">
        <span
          class="text-[10px] font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-40"
        >
          Duration
        </span>
        <span class="font-mono text-sm text-text-h-light dark:text-text-h-dark">
          {{ formatDuration(summary.durationMs) }}
        </span>
      </div>
      <div class="flex flex-col gap-1">
        <span
          class="text-[10px] font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-40"
        >
          Volume
        </span>
        <span class="font-mono text-sm text-text-h-light dark:text-text-h-dark">
          {{ formatWeight(summary.volumeLoad, 0) }}
        </span>
      </div>
      <div class="flex flex-col gap-1">
        <span
          class="text-[10px] font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-40"
        >
          Sets
        </span>
        <span class="font-mono text-sm text-text-h-light dark:text-text-h-dark">
          {{ summary.sets.completed }}
        </span>
      </div>
      <div class="flex flex-col gap-1">
        <span
          class="text-[10px] font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-40"
        >
          Exercises
        </span>
        <span class="font-mono text-sm text-text-h-light dark:text-text-h-dark">
          {{ workout?.exercises.length ?? 0 }}
        </span>
      </div>
    </div>

    <!-- Per-exercise breakdown -->
    <div v-if="workout" class="flex flex-col px-5 py-4">
      <div
        v-for="(ex, exIndex) in workout.exercises"
        :key="`${ex.exerciseId}-${exIndex}`"
        class="flex flex-col gap-2 border-b border-border-light dark:border-border-dark py-4 first:pt-0 last:border-0 last:pb-0"
      >
        <div class="flex flex-wrap items-center gap-2">
          <h3 class="text-sm font-bold text-text-h-light dark:text-text-h-dark">
            {{ exerciseName(ex.exerciseId) }}
          </h3>
          <span
            v-for="prType in prTypesByExercise.get(ex.exerciseId) ?? []"
            :key="prType"
            class="rounded-md bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent"
          >
            {{ PR_LABELS[prType] }}
          </span>
        </div>
        <div
          v-if="ex.note"
          class="flex items-start gap-1.5 text-xs italic text-text-light dark:text-text-dark opacity-70"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="mt-0.5 h-3.5 w-3.5 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path
              d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
            />
            <polyline points="14 2 14 8 20 8" />
            <line x1="8" y1="13" x2="16" y2="13" />
            <line x1="8" y1="17" x2="13" y2="17" />
          </svg>
          <span class="whitespace-pre-wrap">{{ ex.note }}</span>
        </div>
        <ul class="flex flex-col gap-1.5">
          <li
            v-for="(set, setIndex) in ex.sets"
            :key="set.id"
            class="flex items-center gap-3"
          >
            <span
              class="w-4 shrink-0 font-mono text-xs text-text-light dark:text-text-dark opacity-40"
            >
              {{ setIndex + 1 }}
            </span>
            <!-- Performance: weight × reps @ rpe, operators dimmed for breathing room -->
            <div
              class="flex min-w-0 flex-1 items-baseline gap-1.5 font-mono text-sm text-text-h-light dark:text-text-h-dark"
            >
              <span>
                {{ displayWeight(set.actualWeight) }}
                <span
                  class="text-[10px] text-text-light dark:text-text-dark opacity-40"
                >
                  {{ label }}
                </span>
              </span>
              <span class="opacity-30">×</span>
              <span>{{ set.actualReps }}</span>
              <template v-if="set.actualRpe != null">
                <span class="opacity-30">@</span>
                <span>{{ set.actualRpe }}</span>
              </template>
            </div>
            <span
              v-if="set.failure"
              class="shrink-0 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-500"
            >
              Failure
            </span>
            <!-- e1RM derived from this set (near-limit sets only) -->
            <div
              v-if="setE1rm(set, ex.exerciseId) != null"
              class="flex shrink-0 items-baseline gap-1.5"
            >
              <span
                class="text-[10px] font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-40"
              >
                e1RM
              </span>
              <span class="font-mono text-sm font-bold text-accent">
                {{ formatWeight(setE1rm(set, ex.exerciseId)!, 0) }}
              </span>
            </div>
          </li>
        </ul>
      </div>
    </div>

    <ConfirmDialog
      v-model:open="confirmOpen"
      title="Delete workout?"
      message="Delete this logged session? This cannot be undone."
      @confirm="onConfirmDelete"
    />
  </AppBottomSheet>
</template>
