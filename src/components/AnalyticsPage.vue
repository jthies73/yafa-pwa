<script setup lang="ts">
import { ref } from "vue";

const variables = [
  { key: "squat", label: "Squat", color: "text-accent bg-accent/10" },
  { key: "bench", label: "Bench Press", color: "text-blue-500 bg-blue-500/10" },
  {
    key: "deadlift",
    label: "Deadlift",
    color: "text-purple-500 bg-purple-500/10",
  },
  { key: "ohp", label: "OHP", color: "text-yellow-500 bg-yellow-500/10" },
];

const activeVariable = ref("squat");

const mockPoints = [60, 65, 62.5, 67.5, 70, 70, 72.5, 75, 72.5, 77.5, 80, 82.5];
const maxVal = Math.max(...mockPoints);
const minVal = Math.min(...mockPoints);
const range = maxVal - minVal || 1;

const chartWidth = 300;
const chartHeight = 100;
const pointToCoord = (val: number, idx: number) => ({
  x: (idx / (mockPoints.length - 1)) * chartWidth,
  y:
    chartHeight -
    ((val - minVal) / range) * chartHeight * 0.8 -
    chartHeight * 0.1,
});

const polyline = mockPoints
  .map((v, i) => {
    const c = pointToCoord(v, i);
    return `${c.x},${c.y}`;
  })
  .join(" ");
</script>

<template>
  <div class="p-6 relative min-h-full flex flex-col gap-6">
    <div>
      <h1
        class="text-3xl font-bold tracking-tight text-text-h-light dark:text-text-h-dark"
      >
        Analytics
      </h1>
      <p class="text-sm text-text-light dark:text-text-dark opacity-70 mt-1">
        Track your progression over time.
      </p>
    </div>

    <!-- Variable selector -->
    <div class="flex flex-wrap gap-2">
      <button
        v-for="v in variables"
        :key="v.key"
        class="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer transition-colors duration-150"
        :class="
          activeVariable === v.key
            ? v.color
            : 'text-text-light dark:text-text-dark border border-border-light dark:border-border-dark hover:bg-surface-light dark:hover:bg-surface-dark'
        "
        @click="activeVariable = v.key"
      >
        {{ v.label }}
      </button>
    </div>

    <!-- Main chart card -->
    <div
      class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-5 shadow-sm"
    >
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-base font-bold text-text-h-light dark:text-text-h-dark">
          {{ variables.find((v) => v.key === activeVariable)?.label }} — 1RM
          Estimate
        </h2>
        <span class="text-xs text-text-light dark:text-text-dark opacity-50"
          >Last 12 sessions</span
        >
      </div>

      <!-- SVG sparkline chart -->
      <div class="relative w-full overflow-hidden">
        <svg
          viewBox="0 0 300 120"
          class="w-full h-32"
          preserveAspectRatio="none"
        >
          <!-- Grid lines -->
          <line
            x1="0"
            y1="30"
            x2="300"
            y2="30"
            stroke="currentColor"
            stroke-width="0.5"
            class="text-border-light dark:text-border-dark opacity-40"
          />
          <line
            x1="0"
            y1="60"
            x2="300"
            y2="60"
            stroke="currentColor"
            stroke-width="0.5"
            class="text-border-light dark:text-border-dark opacity-40"
          />
          <line
            x1="0"
            y1="90"
            x2="300"
            y2="90"
            stroke="currentColor"
            stroke-width="0.5"
            class="text-border-light dark:text-border-dark opacity-40"
          />

          <!-- Fill area -->
          <polygon
            :points="`0,${chartHeight} ${polyline} ${chartWidth},${chartHeight}`"
            fill="currentColor"
            class="text-accent opacity-10"
          />

          <!-- Line -->
          <polyline
            :points="polyline"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linejoin="round"
            stroke-linecap="round"
            class="text-accent"
          />

          <!-- Last point dot -->
          <circle
            :cx="
              pointToCoord(
                mockPoints[mockPoints.length - 1],
                mockPoints.length - 1,
              ).x
            "
            :cy="
              pointToCoord(
                mockPoints[mockPoints.length - 1],
                mockPoints.length - 1,
              ).y
            "
            r="3"
            fill="currentColor"
            class="text-accent"
          />
        </svg>

        <!-- Y-axis labels -->
        <div
          class="absolute top-0 right-0 flex flex-col justify-between h-32 text-right pr-1 pointer-events-none"
        >
          <span
            class="text-[10px] text-text-light dark:text-text-dark opacity-40"
            >{{ maxVal }}kg</span
          >
          <span
            class="text-[10px] text-text-light dark:text-text-dark opacity-40"
            >{{ minVal }}kg</span
          >
        </div>
      </div>

      <!-- Latest value callout -->
      <div
        class="mt-3 pt-3 border-t border-border-light dark:border-border-dark flex items-baseline gap-2"
      >
        <span class="text-2xl font-bold text-accent"
          >{{ mockPoints[mockPoints.length - 1] }}kg</span
        >
        <span class="text-xs text-text-light dark:text-text-dark opacity-60"
          >latest session</span
        >
        <span class="ml-auto text-xs font-bold text-green-500">
          +{{
            (mockPoints[mockPoints.length - 1] - mockPoints[0]).toFixed(1)
          }}kg since start
        </span>
      </div>
    </div>

    <!-- Stat cards row -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div
        v-for="stat in [
          { label: 'Best Session', value: maxVal + 'kg' },
          { label: 'Total Sessions', value: mockPoints.length },
          { label: 'Avg Increment', value: '+2.5kg' },
          { label: 'Weeks Active', value: '6' },
        ]"
        :key="stat.label"
        class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-4 shadow-sm"
      >
        <div
          class="text-xs text-text-light dark:text-text-dark opacity-55 uppercase tracking-wider"
        >
          {{ stat.label }}
        </div>
        <div
          class="text-xl font-bold text-text-h-light dark:text-text-h-dark mt-1"
        >
          {{ stat.value }}
        </div>
      </div>
    </div>

    <!-- Coming soon note -->
    <div
      class="text-xs text-text-light dark:text-text-dark opacity-40 text-center pb-4"
    >
      Configurable variables and real workout data coming soon.
    </div>
  </div>
</template>
