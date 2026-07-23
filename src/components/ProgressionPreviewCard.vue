<script setup lang="ts">
import { computed, ref } from "vue";
import {
  Chart as ChartJS,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Filler,
  Tooltip,
  Legend,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import { Line } from "vue-chartjs";
import type {
  DoubleProgressionParams,
  LinearProgressionParams,
  NoneProgressionParams,
  ProgressionModelType,
  ProgressionParams,
  TopSetProgressionParams,
  WeightIncrementUnit,
} from "../db/types";
import { DEFAULT_RPE_MATRIX } from "../db/rpeMatrix";
import { normalizeProgressionParams } from "../config/progression";
import { matrixPct, roundToLoadable, weightFromE1rm } from "../engine/matrix";
import { solveReps } from "../engine/calculator";

ChartJS.register(
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Filler,
  Tooltip,
  Legend,
);

const props = defineProps<{
  model: ProgressionModelType;
  params: Record<string, number | WeightIncrementUnit>;
  c1rm?: number | null;
}>();

const isOpen = ref(false);

// Use actual c1RM if available, or fall back to 100 kg benchmark.
const previewC1rm = computed(() => props.c1rm ?? 100);
const roundedC1rm = computed(() => roundToLoadable(previewC1rm.value));
const isBenchmark = computed(() => props.c1rm == null);

const normalizedParams = computed<ProgressionParams>(() => {
  return normalizeProgressionParams(
    props.model,
    props.params as unknown as ProgressionParams,
  );
});

export interface SimulatedSession {
  sessionNum: number;
  setsDescription: string;
  loadValue: number;
  repsValue: number;
  loadText: string;
  rpeTargetText: string;
  triggerText: string;
  isSuccessStep?: boolean;
}

const forecast = computed<SimulatedSession[]>(() => {
  const model = props.model;
  const params = normalizedParams.value;
  const matrix = DEFAULT_RPE_MATRIX;
  const baseAnchor = previewC1rm.value;

  const calculateLoad = (anchor: number, reps: number, rpe: number): number => {
    return roundToLoadable(weightFromE1rm(matrix, anchor, reps, rpe));
  };

  const incrementAnchor = (
    current: number,
    val: number,
    unit: WeightIncrementUnit,
  ): number => {
    return unit === "percent" ? current * (1 + val / 100) : current + val;
  };

  const sessions: SimulatedSession[] = [];

  if (model === "linear") {
    const p = params as LinearProgressionParams;
    let anchor = baseAnchor;

    for (let i = 1; i <= 5; i++) {
      const load = calculateLoad(anchor, p.targetReps, p.targetRpe);
      const incLabel =
        p.incrementUnit === "percent"
          ? `+${p.weightIncrement}%`
          : `+${p.weightIncrement}kg`;

      sessions.push({
        sessionNum: i,
        setsDescription: `${p.targetSets} sets × ${p.targetReps} reps`,
        loadValue: load,
        repsValue: p.targetReps,
        loadText: `${load} kg`,
        rpeTargetText: `RPE ${p.targetRpe}`,
        triggerText: `Hit all sets @ RPE ≤ ${p.targetRpe} → ${incLabel} added to c1RM`,
        isSuccessStep: true,
      });

      anchor = incrementAnchor(anchor, p.weightIncrement, p.incrementUnit);
    }
  } else if (model === "double") {
    const p = params as DoubleProgressionParams;
    let anchor = baseAnchor;
    let currentRep = p.minReps;
    let sessionCount = 1;

    const incLabel =
      p.incrementUnit === "percent"
        ? `+${p.weightIncrement}%`
        : `+${p.weightIncrement}kg`;

    // Anchor load at minReps @ targetRpe
    while (sessionCount <= 6) {
      const load = calculateLoad(anchor, p.minReps, p.targetRpe);
      const isTop = currentRep >= p.maxReps;

      if (isTop) {
        sessions.push({
          sessionNum: sessionCount,
          setsDescription: `${p.targetSets} sets × ${currentRep} reps (Cycle Peak)`,
          loadValue: load,
          repsValue: currentRep,
          loadText: `${load} kg`,
          rpeTargetText: `RPE ${p.targetRpe}`,
          triggerText: `Hit ${p.maxReps} reps @ RPE ≤ ${p.targetRpe} → Success! ${incLabel} load & reset to ${p.minReps} reps`,
          isSuccessStep: true,
        });
        anchor = incrementAnchor(anchor, p.weightIncrement, p.incrementUnit);
        currentRep = p.minReps;
      } else {
        sessions.push({
          sessionNum: sessionCount,
          setsDescription: `${p.targetSets} sets × ${currentRep} reps`,
          loadValue: load,
          repsValue: currentRep,
          loadText: `${load} kg`,
          rpeTargetText: `RPE ${p.targetRpe}`,
          triggerText: `Hit ${currentRep} reps @ RPE ≤ ${p.targetRpe} → Step to ${currentRep + 1} reps next session`,
          isSuccessStep: false,
        });
        currentRep++;
      }
      sessionCount++;
    }
  } else if (model === "topset_backoff") {
    const p = params as TopSetProgressionParams;
    let anchor = baseAnchor;
    const backoffFraction = 1 - p.percentageDrop / 100;
    const incLabel =
      p.incrementUnit === "percent"
        ? `+${p.weightIncrement}%`
        : `+${p.weightIncrement}kg`;

    for (let i = 1; i <= 5; i++) {
      const topLoad = calculateLoad(
        anchor,
        p.topSetTargetReps,
        p.topSetTargetRpe,
      );
      const backLoad = roundToLoadable(topLoad * backoffFraction);
      const backPct =
        matrixPct(matrix, p.topSetTargetReps, p.topSetTargetRpe) *
        backoffFraction;
      const backReps = solveReps(matrix, 1, backPct, p.backOffRpe);

      sessions.push({
        sessionNum: i,
        setsDescription: `Top: 1 × ${p.topSetTargetReps} @ ${topLoad}kg (RPE ${p.topSetTargetRpe}) | Backoff: ${p.backOffSets} × ${backReps} @ ${backLoad}kg`,
        loadValue: topLoad,
        repsValue: p.topSetTargetReps,
        loadText: `${topLoad} kg top`,
        rpeTargetText: `Top RPE ${p.topSetTargetRpe}`,
        triggerText: `Hit Top Set @ RPE ≤ ${p.topSetTargetRpe} → ${incLabel} added to c1RM`,
        isSuccessStep: true,
      });

      anchor = incrementAnchor(anchor, p.weightIncrement, p.incrementUnit);
    }
  } else {
    const p = params as NoneProgressionParams;
    const load = calculateLoad(baseAnchor, p.targetReps, p.targetRpe);

    for (let i = 1; i <= 4; i++) {
      sessions.push({
        sessionNum: i,
        setsDescription: `${p.targetSets} sets × ${p.targetReps} reps`,
        loadValue: load,
        repsValue: p.targetReps,
        loadText: `${load} kg`,
        rpeTargetText: `RPE ${p.targetRpe}`,
        triggerText: `Fixed targets (load derived from c1RM without auto-increment)`,
        isSuccessStep: false,
      });
    }
  }

  return sessions;
});

const chartData = computed<ChartData<"line">>(() => {
  return {
    labels: forecast.value.map((s) => `S${s.sessionNum}`),
    datasets: [
      {
        label: "Load (kg)",
        data: forecast.value.map((s) => s.loadValue),
        borderColor: "#1fc7b9",
        backgroundColor: "rgba(31, 199, 185, 0.12)",
        fill: true,
        tension: 0.15,
        pointRadius: 4,
        pointHoverRadius: 6,
        yAxisID: "y",
      },
      {
        label: "Target Reps",
        data: forecast.value.map((s) => s.repsValue),
        borderColor: "#a855f7",
        backgroundColor: "transparent",
        borderDash: [4, 4],
        pointRadius: 3,
        pointStyle: "rectRot",
        yAxisID: "y1",
      },
    ],
  };
});

const chartOptions = computed<ChartOptions<"line">>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: true,
      position: "top",
      labels: {
        color: "#94a3b8",
        font: { size: 10, weight: "bold" },
        boxWidth: 12,
      },
    },
    tooltip: {
      mode: "index",
      intersect: false,
      callbacks: {
        label(ctx) {
          if (ctx.dataset.label === "Load (kg)") {
            return `Load: ${ctx.parsed.y} kg`;
          }
          return `Target Reps: ${ctx.parsed.y}`;
        },
      },
    },
  },
  scales: {
    x: {
      grid: { color: "rgba(148, 163, 184, 0.1)" },
      ticks: { color: "#94a3b8", font: { size: 10 } },
    },
    y: {
      type: "linear",
      position: "left",
      grid: { color: "rgba(148, 163, 184, 0.1)" },
      ticks: { color: "#1fc7b9", font: { size: 10 } },
      title: {
        display: true,
        text: "kg",
        color: "#1fc7b9",
        font: { size: 10 },
      },
    },
    y1: {
      type: "linear",
      position: "right",
      grid: { display: false },
      ticks: { color: "#a855f7", font: { size: 10 }, stepSize: 1 },
      title: {
        display: true,
        text: "reps",
        color: "#a855f7",
        font: { size: 10 },
      },
    },
  },
}));
</script>

<template>
  <div
    class="flex flex-col border border-border-light dark:border-border-dark rounded-xl bg-surface-light/50 dark:bg-surface-dark/50 overflow-hidden"
  >
    <!-- Toggle Header -->
    <button
      type="button"
      class="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-surface-light dark:hover:bg-surface-dark transition-colors duration-150 text-left w-full"
      @click="isOpen = !isOpen"
    >
      <div class="flex items-center gap-2 min-w-0">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="text-accent shrink-0"
        >
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
        </svg>
        <span
          class="text-xs font-bold uppercase tracking-wider text-text-h-light dark:text-text-h-dark truncate"
        >
          Progression Preview
        </span>
      </div>

      <div class="flex items-center gap-2 shrink-0">
        <span
          class="px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide whitespace-nowrap"
          :class="
            isBenchmark
              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
          "
        >
          {{
            isBenchmark ? "Sample Benchmark (100kg)" : `c1RM: ${roundedC1rm}kg`
          }}
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="text-text-light dark:text-text-dark opacity-60 transition-transform duration-150 shrink-0"
          :class="isOpen ? 'rotate-180' : ''"
        >
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>
    </button>

    <!-- Forecast Accordion Content -->
    <div
      v-if="isOpen"
      class="px-4 pb-4 pt-2 flex flex-col gap-4 border-t border-border-light/60 dark:border-border-dark/60"
    >
      <p
        class="text-xs text-text-light dark:text-text-dark opacity-75 leading-relaxed"
      >
        Multi-session forecast simulating load & rep evolution:
      </p>

      <!-- Chart Component -->
      <div
        class="h-44 w-full bg-surface-light dark:bg-surface-dark p-2 rounded-lg border border-border-light/40 dark:border-border-dark/40"
      >
        <Line :data="chartData" :options="chartOptions" />
      </div>

      <!-- Step Cards -->
      <div class="flex flex-col gap-2">
        <div
          v-for="s in forecast"
          :key="s.sessionNum"
          class="flex flex-col gap-1 p-2.5 rounded-lg bg-surface-light dark:bg-surface-dark border border-border-light/40 dark:border-border-dark/40"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-bold text-accent">
              Session {{ s.sessionNum }}
            </span>
            <span
              class="text-xs font-mono font-semibold text-text-h-light dark:text-text-h-dark"
            >
              {{ s.loadText }}
            </span>
          </div>
          <p class="text-xs font-mono text-text-h-light dark:text-text-h-dark">
            {{ s.setsDescription }}
          </p>
          <p
            class="text-[11px] text-text-light dark:text-text-dark opacity-70 italic"
          >
            {{ s.triggerText }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
