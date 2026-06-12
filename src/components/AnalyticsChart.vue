<script setup lang="ts">
import { computed } from "vue";
import {
  Chart as ChartJS,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Filler,
  type ChartData,
  type ChartOptions,
  type TooltipItem,
} from "chart.js";
import { Bar, Line } from "vue-chartjs";
import type { BucketPoint } from "../analytics/compute";
import type { ChartType } from "../analytics/presentation";

// Tree-shaken registration: bars, lines, the two axes and tooltips.
ChartJS.register(
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Filler,
);

const props = defineProps<{
  points: BucketPoint[];
  type: ChartType;
  formatValue: (value: number) => string;
  tooltipTitle: (point: BucketPoint) => string;
  tooltipLines: (point: BucketPoint) => string[];
}>();

// Chart.js draws to canvas and can't read CSS variables, so resolve the accent
// to a concrete color (same approach as MesocycleChart.vue).
const cssValue = (token: string, fallback: string) => {
  if (typeof window === "undefined") return fallback;
  return (
    getComputedStyle(document.documentElement).getPropertyValue(token).trim() ||
    fallback
  );
};
const accent = computed(() => cssValue("--color-accent", "#1fc7b9"));

const withAlpha = (hex: string, alpha: number): string => {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

// Neutral mid-tones, legible on both themes — the canvas needs no theme listener.
const TICK_COLOR = "#9ca3af";
const GRID_COLOR = "rgba(148, 163, 184, 0.15)";

const labels = computed(() => props.points.map((p) => p.label));

const barData = computed<ChartData<"bar">>(() => {
  const barStyle = { borderRadius: 2, maxBarThickness: 32 };
  if (props.type === "stackedBar") {
    return {
      labels: labels.value,
      datasets: [
        // Solid base: direct (×1.0) stimulus. Lighter top: indirect (×0.5) —
        // reduced opacity rather than a hatch pattern, in keeping with the
        // flat design language.
        {
          data: props.points.map((p) => p.direct),
          backgroundColor: accent.value,
          stack: "stimulus",
          ...barStyle,
        },
        {
          data: props.points.map((p) => p.indirect),
          backgroundColor: withAlpha(accent.value, 0.35),
          stack: "stimulus",
          ...barStyle,
        },
      ],
    };
  }
  return {
    labels: labels.value,
    datasets: [
      {
        data: props.points.map((p) => p.value),
        backgroundColor: accent.value,
        ...barStyle,
      },
    ],
  };
});

const lineData = computed<ChartData<"line">>(() => ({
  labels: labels.value,
  datasets: [
    {
      data: props.points.map((p) => p.value),
      borderColor: accent.value,
      backgroundColor: withAlpha(accent.value, 0.08),
      pointBackgroundColor: accent.value,
      pointRadius: props.points.length > 24 ? 0 : 3,
      pointHoverRadius: 4,
      borderWidth: 2,
      tension: 0.3,
      fill: "start",
    },
  ],
}));

// On tap/hover the tooltip shows the full math behind the point. With two
// stacked datasets `index` mode reports both segments — keep a single item and
// let the breakdown lines spell out direct vs indirect. Generic so the item
// type matches the chart type each options object is built for.
const tooltipPlugin = <T extends "bar" | "line">() => ({
  displayColors: false,
  filter: (item: TooltipItem<T>) => item.datasetIndex === 0,
  callbacks: {
    title: (items: TooltipItem<T>[]) =>
      items.length ? props.tooltipTitle(props.points[items[0].dataIndex]) : "",
    label: (item: TooltipItem<T>) =>
      props.tooltipLines(props.points[item.dataIndex]),
  },
});

const scaleOptions = (stacked: boolean, fitRange: boolean) => ({
  x: {
    stacked,
    grid: { display: false },
    border: { color: GRID_COLOR },
    ticks: {
      color: TICK_COLOR,
      font: { size: 10 },
      maxRotation: 0,
      autoSkip: true,
      maxTicksLimit: 6,
    },
  },
  y: {
    stacked,
    // Quantities grow from zero so bar heights stay honest; trend lines fit
    // the data range so period-to-period variance stays readable.
    beginAtZero: !fitRange,
    grace: fitRange ? "15%" : undefined,
    grid: { color: GRID_COLOR },
    border: { display: false },
    ticks: {
      color: TICK_COLOR,
      font: { size: 10 },
      maxTicksLimit: 5,
      callback: (value: string | number) => props.formatValue(Number(value)),
    },
  },
});

const barOptions = computed<ChartOptions<"bar">>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: "index", intersect: false },
  scales: scaleOptions(props.type === "stackedBar", false),
  plugins: { legend: { display: false }, tooltip: tooltipPlugin<"bar">() },
}));

const lineOptions = computed<ChartOptions<"line">>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: "index", intersect: false },
  scales: scaleOptions(false, true),
  plugins: { legend: { display: false }, tooltip: tooltipPlugin<"line">() },
}));
</script>

<template>
  <div class="relative h-44 w-full">
    <Line v-if="type === 'line'" :data="lineData" :options="lineOptions" />
    <Bar v-else :data="barData" :options="barOptions" />
  </div>
</template>
