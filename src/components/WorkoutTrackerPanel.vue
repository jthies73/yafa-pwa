<script setup lang="ts">
import { ref, watch } from "vue";
import type {
  Workout,
  Routine,
  Exercise,
  LinearProgressionParams,
  DoubleProgressionParams,
  TopSetProgressionParams,
} from "../db/types";
import WorkoutSetRow from "./WorkoutSetRow.vue";

const props = defineProps<{
  routine: Routine | null;
  activeWorkout: Workout | null;
  exercisesMap: Record<string, Exercise>;
}>();

// ── UI scaffold state ────────────────────────────────────────────────────────
// Set values and completion are tracked locally for now. Real generation /
// persistence of sets lands with the execution layer.
interface SetEntry {
  reps: string;
  weight: string;
}
interface ExerciseCard {
  exerciseId: string;
  sets: SetEntry[];
  completed: number; // number of sets marked done (sequential)
}

const cards = ref<ExerciseCard[]>([]);

// Number of planned sets for the exercise at the given index, derived from its
// routine progression config (falls back to 3 when no config is present).
function plannedSetCount(index: number): number {
  const config = props.routine?.exercises[index]?.config;
  if (!config) return 3;
  const params = config.progressionParams;
  if (config.progressionModel === "topset_backoff") {
    return 1 + ((params as TopSetProgressionParams).backOffSets ?? 0);
  }
  return (
    (params as LinearProgressionParams | DoubleProgressionParams).targetSets ??
    3
  );
}

function rebuild() {
  const workout = props.activeWorkout;
  if (!workout) {
    cards.value = [];
    return;
  }
  cards.value = workout.exercises.map((we, index) => ({
    exerciseId: we.exerciseId,
    sets: Array.from({ length: plannedSetCount(index) }, () => ({
      reps: "",
      weight: "",
    })),
    completed: 0,
  }));
}

// Rebuild whenever a different workout becomes active.
watch(() => props.activeWorkout?.id, rebuild, { immediate: true });

const exerciseName = (id: string) => props.exercisesMap[id]?.name || "Exercise";

const setState = (
  card: ExerciseCard,
  setIndex: number,
): "finished" | "current" | "upcoming" => {
  if (setIndex < card.completed) return "finished";
  if (setIndex === card.completed) return "current";
  return "upcoming";
};

// Toggling the current set completes it; toggling a finished set reverts to it.
const toggleSet = (card: ExerciseCard, setIndex: number) => {
  card.completed = setIndex < card.completed ? setIndex : setIndex + 1;
};

// Row ref registry keyed by "cardIndex-setIndex" for Enter-key navigation.
const rowRefs = ref<Record<string, InstanceType<typeof WorkoutSetRow> | null>>(
  {},
);
const setRowRef = (key: string) => (el: unknown) => {
  rowRefs.value[key] = el as InstanceType<typeof WorkoutSetRow> | null;
};

// Called when Enter is pressed on the weight field of a set row.
// Marks the set complete then focuses the reps field of the next set.
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
    <!-- Active routine summary -->
    <div class="flex items-baseline justify-between gap-3">
      <div class="min-w-0">
        <p
          class="text-xs font-semibold uppercase tracking-wider text-text-light dark:text-text-dark opacity-50"
        >
          Tracking
        </p>
        <h3
          class="text-lg font-bold text-text-h-light dark:text-text-h-dark truncate"
        >
          {{ routine?.name || "Empty Workout" }}
        </h3>
      </div>
      <span
        v-if="cards.length"
        class="shrink-0 text-xs font-mono text-text-light dark:text-text-dark opacity-50"
      >
        {{ cards.length }} exercise{{ cards.length !== 1 ? "s" : "" }}
      </span>
    </div>

    <!-- Exercise cards -->
    <div v-if="cards.length" class="flex flex-col gap-3">
      <div
        v-for="(card, cardIndex) in cards"
        :key="card.exerciseId + cardIndex"
        class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-4 shadow-sm flex flex-col gap-3"
      >
        <!-- Card header -->
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center min-w-0">
            <span
              class="font-bold text-sm text-text-h-light dark:text-text-h-dark truncate"
            >
              {{ exerciseName(card.exerciseId) }}
            </span>
          </div>
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
