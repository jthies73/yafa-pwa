<script setup lang="ts">
import { watch } from "vue";
import AppBottomSheet from "../AppBottomSheet.vue";
import SummaryHero from "./SummaryHero.vue";
import PrHighlights from "./PrHighlights.vue";
import CalibrationSummary from "./CalibrationSummary.vue";
import { useActiveWorkout } from "../../composables/useActiveWorkout";

const { summary, calibrations, showSummary, closeSummary } = useActiveWorkout();

// Dragging/ESC closes the sheet (open → false); release the held summary so
// state never lingers between sessions.
watch(showSummary, (open) => {
  if (!open && summary.value) closeSummary();
});
</script>

<template>
  <AppBottomSheet v-if="summary" v-model:open="showSummary">
    <template #title>
      <div class="min-w-0">
        <p
          class="text-xs font-semibold uppercase tracking-wider text-text-light dark:text-text-dark opacity-50 mb-0.5"
        >
          Session Complete
        </p>
        <h2
          class="text-lg font-bold text-text-h-light dark:text-text-h-dark truncate"
        >
          Workout Summary
        </h2>
      </div>
    </template>

    <div class="px-5 py-6 flex flex-col gap-6">
      <SummaryHero :summary="summary" />
      <PrHighlights :prs="summary.prs" />
      <CalibrationSummary :calibrations="calibrations" />
    </div>

    <template #footer>
      <button
        class="w-full py-3.5 bg-accent hover:bg-accent-hover text-bg-dark font-bold rounded-xl cursor-pointer transition-colors duration-150 text-sm tracking-wide uppercase"
        @click="closeSummary"
      >
        Done
      </button>
    </template>
  </AppBottomSheet>
</template>
