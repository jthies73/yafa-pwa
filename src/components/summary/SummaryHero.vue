<script setup lang="ts">
import { computed } from "vue";
import CircularGauge from "../CircularGauge.vue";
import InfoIcon from "../InfoIcon.vue";
import { useWeightUnit } from "../../composables/useWeightUnit";
import type { WorkoutSummary } from "../../analytics/summary";

const props = defineProps<{ summary: WorkoutSummary }>();

const { label: weightUnit, display: displayWeight } = useWeightUnit();

// Adherence colour bands (spec): green > 90, orange 75–89, red < 75.
const gaugeColor = computed(() => {
  const s = props.summary.adherence.score;
  if (s > 90) return "#22c55e";
  if (s >= 75) return "#f59e0b";
  return "#ef4444";
});

const durationLabel = computed(() => {
  const totalMin = Math.round(props.summary.durationMs / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
});

// Volume load is large and approximate — whole units read cleaner than decimals.
const volumeLabel = computed(
  () =>
    `${Math.round(displayWeight(props.summary.volumeLoad, 0)).toLocaleString()} ${weightUnit.value}`,
);
</script>

<template>
  <div class="flex flex-col items-center gap-5">
    <!-- Adherence gauge -->
    <CircularGauge :value="summary.adherence.score" :color="gaugeColor">
      <span
        class="text-3xl font-bold font-mono text-text-h-light dark:text-text-h-dark"
      >
        {{ summary.adherence.score }}<span class="text-lg">%</span>
      </span>
      <span
        class="flex items-center gap-1 text-[0.65rem] font-semibold uppercase tracking-wider text-text-light dark:text-text-dark opacity-50"
      >
        Adherence
        <InfoIcon topic="adherenceScore" />
      </span>
    </CircularGauge>

    <!-- Session stats -->
    <div class="grid grid-cols-3 gap-3 w-full">
      <!-- Duration -->
      <div
        class="flex flex-col items-center gap-1 rounded-xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark py-3"
      >
        <span
          class="text-base font-bold font-mono text-text-h-light dark:text-text-h-dark"
        >
          {{ durationLabel }}
        </span>
        <span
          class="text-[0.65rem] font-semibold uppercase tracking-wider text-text-light dark:text-text-dark opacity-50"
        >
          Duration
        </span>
      </div>

      <!-- Working sets: completed / planned -->
      <div
        class="flex flex-col items-center gap-1 rounded-xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark py-3"
      >
        <span
          class="text-base font-bold font-mono text-text-h-light dark:text-text-h-dark"
        >
          {{ summary.sets.completed }} / {{ summary.sets.planned }}
        </span>
        <span
          class="text-[0.65rem] font-semibold uppercase tracking-wider text-text-light dark:text-text-dark opacity-50"
        >
          Sets
        </span>
      </div>

      <!-- Volume load -->
      <div
        class="flex flex-col items-center gap-1 rounded-xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark py-3"
      >
        <span
          class="text-base font-bold font-mono text-text-h-light dark:text-text-h-dark truncate max-w-full px-1"
        >
          {{ volumeLabel }}
        </span>
        <span
          class="text-[0.65rem] font-semibold uppercase tracking-wider text-text-light dark:text-text-dark opacity-50"
        >
          Volume
        </span>
      </div>
    </div>
  </div>
</template>
