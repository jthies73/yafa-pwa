<script setup lang="ts">
import { ref, computed } from "vue";
import type { Exercise, Workout } from "../db/types";
import type { WorkoutSummary } from "../analytics/summary";
import { deleteWorkout } from "../db/repository";
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

// Engine summary marks PRs per exercise (stubbed today → empty set).
const prExerciseIds = computed(
  () => new Set((props.summary?.prs ?? []).map((p) => p.exerciseId)),
);

const formatDate = (ts: number): string =>
  new Date(ts).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const formatDuration = (ms: number): string =>
  ms > 0 ? `${Math.round(ms / 60000)} min` : "—";

/** "100 × 8 @ 8" — actual values in the user's unit. */
const setLine = (set: {
  actualWeight: number;
  actualReps: number;
  actualRpe?: number;
}): string => {
  const base = `${displayWeight(set.actualWeight)} ${label.value} × ${set.actualReps}`;
  return set.actualRpe != null ? `${base} @ ${set.actualRpe}` : base;
};

const targetDiffers = (set: {
  targetWeight: number;
  actualWeight: number;
  targetReps: number;
  actualReps: number;
}): boolean =>
  set.targetWeight !== set.actualWeight || set.targetReps !== set.actualReps;

const targetLine = (set: {
  targetWeight: number;
  targetReps: number;
  targetRpe?: number;
}): string => {
  const base = `target ${displayWeight(set.targetWeight)} × ${set.targetReps}`;
  return set.targetRpe != null ? `${base} @ ${set.targetRpe}` : base;
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

    <!-- Summary row -->
    <div
      v-if="summary"
      class="flex flex-wrap gap-x-6 gap-y-1 border-b border-border-light dark:border-border-dark px-5 py-4 font-mono text-sm text-text-light dark:text-text-dark"
    >
      <span>{{ formatDuration(summary.durationMs) }}</span>
      <span>{{ formatWeight(summary.volumeLoad, 0) }}</span>
      <span>{{ summary.sets.completed }} sets</span>
      <span>{{ workout?.exercises.length ?? 0 }} exercises</span>
    </div>

    <!-- Per-exercise breakdown -->
    <div v-if="workout" class="flex flex-col gap-5 px-5 py-4">
      <div
        v-for="(ex, exIndex) in workout.exercises"
        :key="`${ex.exerciseId}-${exIndex}`"
        class="flex flex-col gap-2"
      >
        <div class="flex items-center gap-2">
          <h3 class="text-sm font-bold text-text-h-light dark:text-text-h-dark">
            {{ exerciseName(ex.exerciseId) }}
          </h3>
          <span
            v-if="prExerciseIds.has(ex.exerciseId)"
            class="rounded-md bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent"
          >
            PR
          </span>
        </div>
        <ul class="flex flex-col gap-1">
          <li
            v-for="(set, setIndex) in ex.sets"
            :key="set.id"
            class="flex items-center gap-2 font-mono text-sm"
          >
            <span
              class="w-5 shrink-0 text-text-light dark:text-text-dark opacity-40"
            >
              {{ setIndex + 1 }}
            </span>
            <span class="text-text-h-light dark:text-text-h-dark">
              {{ setLine(set) }}
            </span>
            <span
              v-if="targetDiffers(set)"
              class="text-xs text-text-light dark:text-text-dark opacity-50"
            >
              {{ targetLine(set) }}
            </span>
            <span
              v-if="set.failure"
              class="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-500"
            >
              Failure
            </span>
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
