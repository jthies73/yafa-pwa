<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { liveQuery } from "dexie";
import { db } from "../db/db";
import { getWorkouts } from "../db/repository";
import type { Exercise, Routine, Workout } from "../db/types";
import {
  computeWorkoutSummary,
  type WorkoutSummary,
} from "../analytics/summary";
import { groupByWeek, type HistoryGroup } from "../analytics/history";
import { useWeightUnit } from "../composables/useWeightUnit";
import WorkoutDetailSheet from "./WorkoutDetailSheet.vue";

const { format: formatWeight } = useWeightUnit();

const groups = ref<HistoryGroup[]>([]);
const summaries = ref<Map<string, WorkoutSummary>>(new Map());
const exercisesById = ref<Map<string, Exercise>>(new Map());
const routineNames = ref<Map<string, Routine>>(new Map());
let subscription: { unsubscribe(): void } | undefined;

onMounted(() => {
  subscription = liveQuery(async () => {
    const [workouts, exercises, routines] = await Promise.all([
      getWorkouts(),
      db.exercises.toArray(),
      db.routines.toArray(),
    ]);
    return { workouts, exercises, routines };
  }).subscribe({
    next: ({ workouts, exercises, routines }) => {
      const exMap = new Map(exercises.map((e) => [e.id, e]));
      const rtMap = new Map(routines.map((r: Routine) => [r.id, r]));
      exercisesById.value = exMap;
      routineNames.value = rtMap;

      // Metrics come from the engine summary path (stubbed today) so the page
      // lights up with real numbers once the engine is rewritten — no changes here.
      const next = new Map<string, WorkoutSummary>();
      for (const w of workouts) {
        next.set(
          w.id,
          computeWorkoutSummary({
            workout: w,
            history: workouts.filter((other) => other.id !== w.id),
            exercisesById: exMap,
            plannedCounts: {},
          }),
        );
      }
      summaries.value = next;
      groups.value = groupByWeek(workouts);
    },
    error: (err) => console.error("Error loading workout history:", err),
  });
});

onUnmounted(() => subscription?.unsubscribe());

const routineName = (w: Workout): string =>
  routineNames.value.get(w.routineId)?.name ?? "Workout";

const formatDate = (ts: number): string =>
  new Date(ts).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

const formatDuration = (ms: number): string =>
  ms > 0 ? `${Math.round(ms / 60000)} min` : "—";

const summaryFor = (w: Workout): WorkoutSummary | undefined =>
  summaries.value.get(w.id);

// --- Detail sheet ---
const showDetail = ref(false);
const activeWorkout = ref<Workout | null>(null);

const openDetail = (w: Workout) => {
  activeWorkout.value = w;
  showDetail.value = true;
};
</script>

<template>
  <div class="relative flex min-h-full flex-col p-6 pb-24">
    <!-- Header -->
    <div class="mb-6">
      <h1
        class="text-3xl font-bold tracking-tight text-text-h-light dark:text-text-h-dark"
      >
        History
      </h1>
    </div>

    <!-- Empty state -->
    <div
      v-if="groups.length === 0"
      class="text-sm italic text-text-light dark:text-text-dark opacity-60"
    >
      No workouts logged yet. Completed sessions will show up here.
    </div>

    <!-- Grouped history -->
    <div v-else class="flex flex-col gap-8">
      <section v-for="group in groups" :key="group.key">
        <h2
          class="mb-3 text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-50"
        >
          {{ group.label }}
        </h2>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <button
            v-for="workout in group.workouts"
            :key="workout.id"
            class="flex cursor-pointer flex-col items-start gap-3 rounded-xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark p-5 text-left shadow-sm transition-colors duration-150 hover:bg-surface-light-hover dark:hover:bg-surface-dark-hover"
            @click="openDetail(workout)"
          >
            <div class="flex w-full items-center justify-between gap-2">
              <h3
                class="truncate text-sm font-bold text-text-h-light dark:text-text-h-dark"
              >
                {{ routineName(workout) }}
              </h3>
              <span
                v-if="(summaryFor(workout)?.prs.length ?? 0) > 0"
                class="shrink-0 rounded-md bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent"
              >
                PR
              </span>
            </div>
            <span
              class="text-xs font-medium text-text-light dark:text-text-dark opacity-60"
            >
              {{ formatDate(workout.startTime) }}
            </span>
            <div
              class="flex w-full flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-text-light dark:text-text-dark opacity-80"
            >
              <span>{{
                formatDuration(summaryFor(workout)?.durationMs ?? 0)
              }}</span>
              <span>{{
                formatWeight(summaryFor(workout)?.volumeLoad ?? 0, 0)
              }}</span>
              <span>{{ summaryFor(workout)?.sets.completed ?? 0 }} sets</span>
              <span>{{ workout.exercises.length }} exercises</span>
            </div>
          </button>
        </div>
      </section>
    </div>

    <WorkoutDetailSheet
      v-model:open="showDetail"
      :workout="activeWorkout"
      :summary="activeWorkout ? summaryFor(activeWorkout) : undefined"
      :exercises-by-id="exercisesById"
      :routine-name="activeWorkout ? routineName(activeWorkout) : ''"
      @deleted="showDetail = false"
    />
  </div>
</template>
