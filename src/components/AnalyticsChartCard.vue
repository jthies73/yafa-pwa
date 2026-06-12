<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { liveQuery } from "dexie";
import type { AnalyticsChartConfig } from "../db/types";
import {
  buildChartSeries,
  type ChartSeries,
  type Timeframe,
} from "../analytics/service";
import {
  BUCKET_LABELS,
  METRIC_LABELS,
  chartTypeFor,
  tooltipLines,
  tooltipTitle,
} from "../analytics/presentation";
import type { BucketPoint } from "../analytics/compute";
import { useWeightUnit } from "../composables/useWeightUnit";
import { useLengthUnit } from "../composables/useLengthUnit";
import AnalyticsChart from "./AnalyticsChart.vue";

const props = defineProps<{
  config: AnalyticsChartConfig;
  title: string;
  timeframe: Timeframe;
  // Folded down to the compact header while a card is dragged (mirrors
  // WorkoutTrackerCard).
  collapsed?: boolean;
}>();

const emit = defineEmits<{
  (e: "edit"): void;
}>();

const weight = useWeightUnit();
const length = useLengthUnit();

// liveQuery tracks every Dexie read inside buildChartSeries, so the chart
// recomputes whenever workouts, measurements or exercises change; the watcher
// re-subscribes when the config or the global timeframe changes.
const series = ref<ChartSeries | null>(null);
let subscription: { unsubscribe(): void } | undefined;

watch(
  () => [props.config, props.timeframe] as const,
  ([config, timeframe]) => {
    subscription?.unsubscribe();
    subscription = liveQuery(() =>
      buildChartSeries(config, timeframe),
    ).subscribe({
      next: (result) => (series.value = result),
      error: (err) => console.error("Error computing chart series:", err),
    });
  },
  { immediate: true, deep: true },
);

onUnmounted(() => subscription?.unsubscribe());

const roundTo = (value: number, decimals: number): number => {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
};

const formatValue = computed(() => {
  switch (series.value?.valueKind ?? "count") {
    case "weight": {
      // e1RM trends move in small steps — keep a decimal; volume totals don't.
      const decimals = props.config.metric === "e1rm" ? 1 : 0;
      return (v: number) => weight.format(v, decimals);
    }
    case "length":
      return (v: number) => length.format(v, 1);
    case "percentage":
      return (v: number) => `${roundTo(v, 1)} %`;
    default:
      // Fractional set counts (×0.5 multipliers) keep one decimal when needed.
      return (v: number) => `${roundTo(v, 1)}`;
  }
});

const chartType = computed(() => chartTypeFor(props.config));

const subtitle = computed(
  () =>
    `${METRIC_LABELS[props.config.metric]} · ${BUCKET_LABELS[props.config.bucket]}`,
);

const tooltipContext = computed(() => ({
  bucket: props.config.bucket,
  metric: props.config.metric,
  scopeLabel: props.title,
  formatValue: formatValue.value,
}));

const titleFor = (point: BucketPoint) =>
  tooltipTitle(point, tooltipContext.value);
const linesFor = (point: BucketPoint) =>
  tooltipLines(point, tooltipContext.value);
</script>

<template>
  <div
    class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl shadow-sm"
  >
    <!-- Header: drag handle, scope + metric, edit -->
    <div class="flex items-center gap-3 px-4 py-3">
      <span
        class="drag-handle shrink-0 cursor-grab active:cursor-grabbing text-text-light dark:text-text-dark opacity-30 hover:opacity-60 transition-opacity duration-150 h-5 w-3.5 inline-flex items-center justify-center"
        style="touch-action: none"
        @click.stop
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <circle cx="9" cy="5" r="1.5" />
          <circle cx="15" cy="5" r="1.5" />
          <circle cx="9" cy="12" r="1.5" />
          <circle cx="15" cy="12" r="1.5" />
          <circle cx="9" cy="19" r="1.5" />
          <circle cx="15" cy="19" r="1.5" />
        </svg>
      </span>

      <div class="flex-1 min-w-0">
        <div
          class="font-bold text-sm text-text-h-light dark:text-text-h-dark truncate"
        >
          {{ title }}
        </div>
        <div
          class="text-xs text-text-light dark:text-text-dark opacity-55 mt-0.5"
        >
          {{ subtitle }}
        </div>
      </div>

      <button
        class="shrink-0 p-2 rounded-lg text-text-light dark:text-text-dark opacity-40 hover:opacity-100 hover:text-accent cursor-pointer transition-colors duration-150"
        aria-label="Edit chart"
        @click="emit('edit')"
      >
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
        >
          <path d="M12 20h9"></path>
          <path
            d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
          ></path>
        </svg>
      </button>
    </div>

    <!-- Collapsible body: folds away while dragging so only the header travels -->
    <div
      class="grid transition-all duration-150"
      :class="
        collapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'
      "
    >
      <div class="overflow-hidden">
        <div class="px-4 pb-4">
          <AnalyticsChart
            v-if="series && series.points.length"
            :points="series.points"
            :type="chartType"
            :format-value="formatValue"
            :tooltip-title="titleFor"
            :tooltip-lines="linesFor"
          />
          <div
            v-else-if="series"
            class="h-44 flex items-center justify-center text-sm italic text-text-light dark:text-text-dark opacity-50"
          >
            No data in this timeframe.
          </div>
          <div
            v-else
            class="h-44 rounded-lg bg-black/5 dark:bg-white/5 animate-pulse"
          ></div>

          <!-- Direct/indirect legend for the stacked muscle view -->
          <div
            v-if="chartType === 'stackedBar' && series?.points.length"
            class="mt-3 flex items-center gap-4"
          >
            <span
              class="inline-flex items-center gap-1.5 text-xs text-text-light dark:text-text-dark"
            >
              <span class="inline-block h-2.5 w-2.5 rounded-sm bg-accent" />
              Direct ×1.0
            </span>
            <span
              class="inline-flex items-center gap-1.5 text-xs text-text-light dark:text-text-dark"
            >
              <span
                class="inline-block h-2.5 w-2.5 rounded-sm bg-accent opacity-35"
              />
              Indirect ×0.5
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
