<script setup lang="ts">
import { ref, watch } from "vue";
import type {
  LinearProgressionParams,
  DoubleProgressionParams,
  TopSetProgressionParams,
} from "../db/types";
import { useActiveWorkout } from "../composables/useActiveWorkout";
import WorkoutSetRow from "./WorkoutSetRow.vue";

const { activeWorkout, routine, exercisesMap } = useActiveWorkout();

interface SetEntry {
  reps: string;
  weight: string;
}
interface ExerciseCard {
  exerciseId: string;
  sets: SetEntry[];
  completed: number;
}

const cards = ref<ExerciseCard[]>([]);

function plannedSetCount(index: number): number {
  const config = routine.value?.exercises[index]?.config;
  if (!config) return 3;
  const p = config.progressionParams;
  if (config.progressionModel === "topset_backoff") {
    return 1 + ((p as TopSetProgressionParams).backOffSets ?? 0);
  }
  return (
    (p as LinearProgressionParams | DoubleProgressionParams).targetSets ?? 3
  );
}

function rebuild() {
  if (!activeWorkout.value) {
    cards.value = [];
    return;
  }
  cards.value = activeWorkout.value.exercises.map((we, i) => ({
    exerciseId: we.exerciseId,
    sets: Array.from({ length: plannedSetCount(i) }, () => ({
      reps: "",
      weight: "",
    })),
    completed: 0,
  }));
}

watch(() => activeWorkout.value?.id, rebuild, { immediate: true });

const exerciseName = (id: string) => exercisesMap.value[id]?.name || "Exercise";

const setState = (
  card: ExerciseCard,
  i: number,
): "finished" | "current" | "upcoming" =>
  i < card.completed
    ? "finished"
    : i === card.completed
      ? "current"
      : "upcoming";

const toggleSet = (card: ExerciseCard, i: number) => {
  card.completed = i < card.completed ? i : i + 1;
};

const rowRefs = ref<Record<string, InstanceType<typeof WorkoutSetRow> | null>>(
  {},
);
const setRowRef = (key: string) => (el: unknown) => {
  rowRefs.value[key] = el as InstanceType<typeof WorkoutSetRow> | null;
};

const onComplete = (cardIndex: number, setIndex: number) => {
  const card = cards.value[cardIndex];
  if (!card) return;
  toggleSet(card, setIndex);
  const nextKey =
    setIndex + 1 < card.sets.length
      ? `${cardIndex}-${setIndex + 1}`
      : `${cardIndex + 1}-0`;
  rowRefs.value[nextKey]?.focusReps();
};
</script>

<template>
  <div class="flex flex-col gap-4 p-5 select-none">
    <div v-if="cards.length" class="flex flex-col gap-3">
      <div
        v-for="(card, cardIndex) in cards"
        :key="card.exerciseId + cardIndex"
        class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-4 shadow-sm flex flex-col gap-3"
      >
        <!-- Card header -->
        <div class="mb-3 flex items-center justify-between gap-3">
          <span
            class="font-bold text-sm text-text-h-light dark:text-text-h-dark truncate"
          >
            {{ exerciseName(card.exerciseId) }}
          </span>
          <span
            class="shrink-0 text-xs font-mono text-text-light dark:text-text-dark opacity-50"
          >
            {{ card.completed }}/{{ card.sets.length }}
          </span>
        </div>

        <!-- Sets -->
        <div class="flex flex-col gap-2">
          <WorkoutSetRow
            v-for="(set, setIndex) in card.sets"
            :key="setIndex"
            :ref="setRowRef(`${cardIndex}-${setIndex}`)"
            v-model:reps="set.reps"
            v-model:weight="set.weight"
            :index="setIndex + 1"
            :state="setState(card, setIndex)"
            @toggle="toggleSet(card, setIndex)"
            @complete="onComplete(cardIndex, setIndex)"
          />
        </div>
      </div>
    </div>

    <!-- Empty workout state -->
    <div
      v-else
      class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-10 shadow-sm flex flex-col items-center justify-center text-center gap-2"
    >
      <p class="text-sm text-text-light dark:text-text-dark opacity-50">
        No exercises in this workout yet.
      </p>
      <p class="text-xs text-text-light dark:text-text-dark opacity-30">
        Adding exercises on the fly is coming soon.
      </p>
    </div>
  </div>
</template>
