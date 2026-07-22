<script setup lang="ts">
import { computed } from "vue";
import {
  Chart as ChartJS,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Filler,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import { Line } from "vue-chartjs";
import type { MesocycleWeek, PeriodizationFocus } from "../db/types";
import { FOCUS_META } from "../config/periodization";

// Tree-shaken registration: only what the two trend lines need.
ChartJS.register(
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Filler,
);

const props = withDefaults(
  defineProps<{
    weeks: MesocycleWeek[];
    showLegend?: boolean;
    caption?: string;
    currentWeekIndex?: number;
  }>(),
  { showLegend: true, caption: "", currentWeekIndex: undefined },
);

const count = computed(() => props.weeks.length);

// Chart.js draws to canvas and can't read CSS variables, so resolve the two
// (theme-independent) line colours to concrete values.
const cssValue = (token: string, fallback: string) => {
  if (typeof window === "undefined") return fallback;
  return (
    getComputedStyle(document.documentElement).getPropertyValue(token).trim() ||
    fallback
  );
};
const intensityColor = computed(() => cssValue("--color-accent", "#1fc7b9"));
const volumeColor = computed(() => cssValue("--color-chart-volume", "#64748b"));

const volumes = computed(() =>
  props.weeks.map((w) => FOCUS_META[w.focus].volume),
);
const intensities = computed(() =>
  props.weeks.map((w) => FOCUS_META[w.focus].intensity),
);

const markerRadius = computed(() => (count.value > 12 ? 2 : 3));

const lineDataset = (data: number[], color: string, width: number) => ({
  data,
  borderColor: color,
  backgroundColor: color,
  pointBackgroundColor: color,
  pointRadius: markerRadius.value,
  pointHoverRadius: markerRadius.value,
  borderWidth: width,
  tension: 0.3,
  fill: false,
});

const chartData = computed<ChartData<"line">>(() => ({
  labels: props.weeks.map((_, i) => i + 1),
  datasets: [
    lineDataset(volumes.value, volumeColor.value, 2),
    // Intensity is the primary metric — accent colour, drawn a touch heavier.
    lineDataset(intensities.value, intensityColor.value, 2.5),
  ],
}));

// Fit the y-range to the data (with a little padding) so the week-to-week
// rises and falls fill the plot and read prominently, rather than being
// squashed into a fixed 0..1 band.
const chartOptions = computed<ChartOptions<"line">>(() => {
  const all = [...volumes.value, ...intensities.value];
  const lo = all.length ? Math.min(...all) : 0;
  const hi = all.length ? Math.max(...all) : 1;
  return {
    responsive: true,
    maintainAspectRatio: false,
    events: [], // presentational; the clickable parent card gets the tap
    layout: { padding: { top: 4, bottom: 2 } },
    scales: {
      x: { display: false },
      y: { display: false, min: Math.max(0, lo - 0.12), max: hi + 0.12 },
    },
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
  };
});

// Show every Nth week number once the block gets long, but always the last one and current week.
const labelStep = computed(() => Math.ceil(count.value / 8) || 1);
const showLabel = (i: number) =>
  i % labelStep.value === 0 ||
  i === count.value - 1 ||
  i === props.currentWeekIndex;

// Distinct focuses actually used, in their canonical order, for the legend.
const legendFocuses = computed<PeriodizationFocus[]>(() => {
  const seen = new Set<PeriodizationFocus>();
  for (const w of props.weeks) seen.add(w.focus);
  return (Object.keys(FOCUS_META) as PeriodizationFocus[]).filter((f) =>
    seen.has(f),
  );
});

// Current week marker position (percent of container width, centered on the week).
const currentWeekLeft = computed(() => {
  const idx = props.currentWeekIndex;
  if (idx === undefined || idx < 0 || idx >= count.value) return null;
  return ((idx + 0.5) / count.value) * 100;
});
</script>

<template>
  <div v-if="count" class="flex flex-col gap-4">
    <!-- Volume + intensity trend lines + current week marker -->
    <div class="relative w-full h-36">
      <Line :data="chartData" :options="chartOptions" />
      <div
        v-if="currentWeekLeft !== null"
        class="absolute top-0 bottom-0 pointer-events-none z-10 flex flex-col items-center"
        :style="{ left: `${currentWeekLeft}%`, transform: 'translateX(-50%)' }"
      >
        <span
          class="w-2.5 h-2.5 rounded-full bg-accent border-2 border-bg-light dark:border-bg-dark shadow-sm shrink-0 -mt-1"
        />
        <span class="w-0 flex-1 border-r-2 border-dashed border-accent/70" />
        <span class="w-1.5 h-1.5 rounded-full bg-accent/80 shrink-0 -mb-0.5" />
      </div>
    </div>

    <!-- Focus-colored week tick strip (shared categorical axis) -->
    <div class="flex flex-col gap-1.5">
      <div class="relative">
        <div
          class="grid gap-1 items-center"
          :style="{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }"
        >
          <span
            v-for="(week, i) in weeks"
            :key="i"
            class="rounded-full transition-all duration-150"
            :class="[
              i === currentWeekIndex
                ? 'h-2.5 ring-2 ring-accent ring-offset-1 ring-offset-bg-light dark:ring-offset-bg-dark z-10'
                : 'h-1.5 opacity-80 hover:opacity-100',
            ]"
            :style="{ backgroundColor: FOCUS_META[week.focus].colorVar }"
            :title="`Week ${i + 1} — ${FOCUS_META[week.focus].label}`"
          />
        </div>
      </div>
      <div
        class="grid text-center"
        :style="{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }"
      >
        <span
          v-for="(_, i) in weeks"
          :key="i"
          class="text-[10px] font-mono transition-colors"
          :class="[
            i === currentWeekIndex
              ? 'font-bold text-accent opacity-100 text-xs'
              : 'text-text-light dark:text-text-dark opacity-50',
          ]"
        >
          {{ showLabel(i) ? i + 1 : "" }}
        </span>
      </div>
    </div>

    <!-- Legend: metrics then focuses -->
    <div v-if="showLegend" class="flex flex-col gap-2">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span
          class="inline-flex items-center gap-1.5 text-xs text-text-light dark:text-text-dark"
        >
          <span
            class="inline-block h-0.5 w-4 rounded-full"
            :style="{ backgroundColor: 'var(--color-chart-volume)' }"
          />
          Volume
        </span>
        <span
          class="inline-flex items-center gap-1.5 text-xs text-text-light dark:text-text-dark"
        >
          <span class="inline-block h-0.5 w-4 rounded-full bg-accent" />
          Intensity
        </span>
      </div>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span
          v-for="focus in legendFocuses"
          :key="focus"
          class="inline-flex items-center gap-1.5 text-xs text-text-light dark:text-text-dark"
        >
          <span
            class="inline-block h-2.5 w-2.5 rounded-sm"
            :style="{ backgroundColor: FOCUS_META[focus].colorVar }"
          />
          {{ FOCUS_META[focus].label }}
        </span>
      </div>
    </div>

    <p
      v-if="caption"
      class="text-xs text-text-light dark:text-text-dark opacity-60"
    >
      {{ caption }}
    </p>
  </div>
</template>
