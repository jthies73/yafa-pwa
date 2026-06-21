<script setup lang="ts">
import { computed, ref } from "vue";
import CircularGauge from "../CircularGauge.vue";
import InfoIcon from "../InfoIcon.vue";
import { useWeightUnit } from "../../composables/useWeightUnit";
import type { WorkoutSummary } from "../../analytics/summary";

const props = defineProps<{ summary: WorkoutSummary }>();

const showDetails = ref(false);

// The non-zero adherence deductions, labelled for the "why not 100%?" breakdown.
const deductionRows = computed(() => {
  const d = props.summary.adherence.deductions;
  return [
    { label: "RPE overshoot/undershoot", ...d.rpe },
    { label: "Rep deviation", ...d.reps },
    { label: "Load deviation", ...d.load },
    { label: "Missing sets", ...d.missing },
    { label: "Extra volume", ...d.trash },
  ].filter((r) => r.value > 0);
});

const { label: weightUnit, display: displayWeight } = useWeightUnit();

// Adherence colour bands (spec): green > 90, orange 75–89, red < 75.
const gaugeColor = computed(() => {
  const s = props.summary.adherence.score;
  if (s > 90) return "#22c55e";
  if (s >= 75) return "#f59e0b";
  return "#ef4444";
});

const scoreRounded = computed(() => Math.round(props.summary.adherence.score));

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
        {{ scoreRounded }}<span class="text-lg">%</span>
      </span>
      <span
        class="flex items-center gap-1 text-[0.65rem] font-semibold uppercase tracking-wider text-text-light dark:text-text-dark opacity-50"
      >
        Adherence
        <InfoIcon topic="adherenceScore" />
      </span>
    </CircularGauge>

    <!-- Adherence breakdown: what cost points -->
    <div v-if="deductionRows.length" class="w-full">
      <button
        type="button"
        class="mx-auto flex items-center gap-1 text-[0.7rem] font-semibold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60 hover:opacity-100 hover:text-accent cursor-pointer transition-colors duration-150"
        @click="showDetails = !showDetails"
      >
        {{ showDetails ? "Hide details" : "Why not 100%?" }}
        <svg
          class="h-3 w-3 transition-transform duration-150"
          :class="showDetails ? 'rotate-180' : ''"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
        >
          <path
            d="M6 9l6 6 6-6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <div
        v-if="showDetails"
        class="mt-3 flex flex-col gap-1.5 rounded-xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark p-3"
      >
        <div
          v-for="row in deductionRows"
          :key="row.label"
          class="flex items-start justify-between gap-3 text-xs"
        >
          <div class="flex flex-col gap-0.5">
            <span class="text-text-light dark:text-text-dark">{{
              row.label
            }}</span>
            <span
              v-if="row.exercises.length"
              class="text-text-light dark:text-text-dark opacity-50"
              >{{ row.exercises.join(", ") }}</span
            >
          </div>
          <span class="font-mono font-semibold text-red-500 shrink-0"
            >−{{ row.value }} %</span
          >
        </div>
      </div>
    </div>

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

      <!-- Working sets: completed / planned, overshoot in a warning tone -->
      <div
        class="flex flex-col items-center gap-1 rounded-xl border py-3"
        :class="
          summary.sets.overshoot
            ? 'border-amber-500/30 bg-amber-500/5'
            : 'border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark'
        "
      >
        <span
          class="text-base font-bold font-mono"
          :class="
            summary.sets.overshoot
              ? 'text-amber-500'
              : 'text-text-h-light dark:text-text-h-dark'
          "
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
