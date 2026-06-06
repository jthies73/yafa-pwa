<script setup lang="ts">
import { ref } from "vue";
import AppBottomSheet from "./AppBottomSheet.vue";
import ConfirmDialog from "./ConfirmDialog.vue";
import { useActiveWorkout } from "../composables/useActiveWorkout";
import { useWorkoutTimer } from "../composables/useWorkoutTimer";

const {
  activeWorkout,
  routine,
  exercisesMap,
  isMinimized,
  showSheet,
  finishWorkout,
  discardWorkout,
} = useActiveWorkout();

const { timerString } = useWorkoutTimer(() => activeWorkout.value?.startTime);

const confirmingDiscard = ref(false);
</script>

<template>
  <AppBottomSheet
    v-model:open="showSheet"
    v-model:minimized="isMinimized"
    minimizable
  >
    <template #title>
      <div class="flex items-center justify-between w-full pr-2">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span
              class="w-2.5 h-2.5 rounded-full bg-accent animate-pulse shrink-0"
            ></span>
            <h2
              class="text-base font-bold text-text-h-light dark:text-text-h-dark truncate"
            >
              {{ routine?.name || "Empty Workout" }}
            </h2>
          </div>
          <div
            class="text-xs font-mono text-text-light dark:text-text-dark opacity-60 mt-0.5"
          >
            {{ timerString }}
          </div>
        </div>
        <div class="flex items-center gap-3 shrink-0">
          <button
            class="px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-red-500/10 text-red-500 hover:bg-red-500/20 dark:bg-red-500/15 dark:text-red-400 dark:hover:bg-red-500/25 transition-colors duration-150 cursor-pointer shrink-0"
            @click.stop="confirmingDiscard = true"
          >
            Discard
          </button>
        </div>
      </div>
    </template>

    <div v-if="activeWorkout" class="p-5 flex flex-col gap-4 flex-1">
      <p
        class="text-xs font-semibold uppercase tracking-wider text-text-light dark:text-text-dark opacity-50 mb-1"
      >
        Exercises
      </p>

      <div class="flex flex-col gap-3">
        <template v-if="activeWorkout.exercises.length > 0">
          <div
            v-for="(ex, idx) in activeWorkout.exercises"
            :key="ex.exerciseId + idx"
            class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-4 shadow-sm flex items-center justify-between gap-3"
          >
            <div>
              <span
                class="text-xs text-text-light dark:text-text-dark opacity-40 mr-2"
              >
                {{ idx + 1 }}.
              </span>
              <span
                class="font-bold text-text-h-light dark:text-text-h-dark text-sm"
              >
                {{ exercisesMap[ex.exerciseId]?.name || "Exercise" }}
              </span>
            </div>
            <span
              class="text-xs text-text-light dark:text-text-dark opacity-40 font-mono"
            >
              — sets coming soon
            </span>
          </div>
        </template>

        <div
          v-else
          class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-10 shadow-sm flex flex-col items-center justify-center text-center gap-2"
        >
          <p class="text-sm text-text-light dark:text-text-dark opacity-50">
            Log your exercises freely.
          </p>
          <p class="text-xs text-text-light dark:text-text-dark opacity-30">
            Exercise logging coming soon.
          </p>
        </div>
      </div>
    </div>

    <template #footer>
      <button
        class="w-full py-3.5 bg-accent hover:bg-accent/90 text-bg-dark font-bold rounded-xl cursor-pointer transition-colors duration-150 text-sm tracking-wide uppercase"
        @click="finishWorkout"
      >
        Finish Workout
      </button>
    </template>
  </AppBottomSheet>

  <ConfirmDialog
    v-model:open="confirmingDiscard"
    title="Discard Workout?"
    message="Are you sure you want to discard this workout? All progress will be lost."
    confirm-label="Discard"
    @confirm="discardWorkout"
  />
</template>
