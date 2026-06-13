<script setup lang="ts">
import { ref, computed, watch } from "vue";
import AppBottomSheet from "./AppBottomSheet.vue";
import ConfirmDialog from "./ConfirmDialog.vue";
import WorkoutTrackerPanel from "./WorkoutTrackerPanel.vue";
import WorkoutCalculatorPanel from "./WorkoutCalculatorPanel.vue";
import { useActiveWorkout } from "../composables/useActiveWorkout";
import { useWorkoutTimer } from "../composables/useWorkoutTimer";
import { useSwipePager } from "../composables/useSwipePager";

const {
  activeWorkout,
  routine,
  isMinimized,
  showSheet,
  trackerStats,
  calculatorSetCount,
  finishWorkout,
  discardWorkout,
} = useActiveWorkout();
const { timerString } = useWorkoutTimer(() => activeWorkout.value?.startTime);

const confirmingDiscard = ref(false);

// ── Finish flow ──────────────────────────────────────────────────────────────
// Nothing logged → finishing would save an empty record, so offer discard
// instead. Incomplete sets → confirm they'll be dropped. Otherwise finish
// straight away (only completed sets are ever persisted).
const confirmingFinish = ref(false);

const onFinishClick = () => {
  const { completed, pending } = trackerStats.value;
  if (completed + calculatorSetCount.value === 0) {
    confirmingDiscard.value = true;
  } else if (pending > 0) {
    confirmingFinish.value = true;
  } else {
    finishWorkout();
  }
};

const finishMessage = computed(() => {
  const n = trackerStats.value.pending;
  return `${n} incomplete set${n === 1 ? "" : "s"} will be discarded. Finish anyway?`;
});

// ── Tracker / Calculator pager ───────────────────────────────────────────────
const TABS = ["Tracker", "Calculator"] as const;
const page = ref(0);
const pagerEl = ref<HTMLElement | null>(null);

const { onSwipeStart, trackStyle } = useSwipePager({
  page,
  pageCount: () => TABS.length,
  container: pagerEl,
});

watch(
  () => activeWorkout.value?.id,
  () => (page.value = 0),
);
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
        <button
          class="px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-red-500/10 text-red-500 hover:bg-red-500/20 dark:bg-red-500/15 dark:text-red-400 dark:hover:bg-red-500/25 transition-colors duration-150 cursor-pointer shrink-0"
          @click.stop="confirmingDiscard = true"
        >
          Discard
        </button>
      </div>
    </template>

    <template #subheader>
      <div
        class="flex border-b border-border-light dark:border-border-dark shrink-0"
      >
        <button
          v-for="(tab, index) in TABS"
          :key="tab"
          type="button"
          :class="
            page === index
              ? 'text-accent border-b-2 border-accent -mb-px'
              : 'text-text-light dark:text-text-dark opacity-50 hover:opacity-80'
          "
          class="flex-1 py-2.5 text-xs font-semibold cursor-pointer transition-colors duration-150"
          @click="page = index"
        >
          {{ tab }}
        </button>
      </div>
    </template>

    <!-- Swipeable pages -->
    <div
      ref="pagerEl"
      class="absolute inset-0 overflow-hidden touch-pan-y"
      @pointerdown="onSwipeStart"
    >
      <div class="flex h-full will-change-transform" :style="trackStyle">
        <div class="w-full h-full shrink-0 overflow-y-auto">
          <WorkoutTrackerPanel />
        </div>
        <div class="w-full h-full shrink-0 overflow-y-auto">
          <WorkoutCalculatorPanel />
        </div>
      </div>
    </div>

    <template #footer>
      <button
        class="w-full py-3.5 bg-accent hover:bg-accent-hover text-bg-dark font-bold rounded-xl cursor-pointer transition-colors duration-150 text-sm tracking-wide uppercase"
        @click="onFinishClick"
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

  <ConfirmDialog
    v-model:open="confirmingFinish"
    title="Finish Workout?"
    :message="finishMessage"
    confirm-label="Finish"
    @confirm="finishWorkout"
  />
</template>
