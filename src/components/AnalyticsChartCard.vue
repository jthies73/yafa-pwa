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
import { buildChartCsv, chartCsvOptions } from "../analytics/chartCsv";
import { useWeightUnit } from "../composables/useWeightUnit";
import { useLengthUnit } from "../composables/useLengthUnit";
import { downloadCsv, slugify } from "../utils/download";
import AnalyticsChart from "./AnalyticsChart.vue";
import AppBottomSheet from "./AppBottomSheet.vue";

const props = defineProps<{
  config: AnalyticsChartConfig;
  title: string;
  timeframe: Timeframe;
  // Folded down to the compact header while a card is dragged (mirrors
  // WorkoutTrackerCard).
  collapsed?: boolean;
  // Detail-page usage: drop the drag handle and the Edit action (there's no
  // reorder or chart-config editor there), keeping only Export.
  static?: boolean;
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

// --- Actions menu (kebab → bottom sheet) ---
const showActions = ref(false);

// CSV export ignores the on-screen timeframe toggle and always spans full
// history ("max"), but keeps the chart's configured bucket — so the file holds
// every datapoint ever recorded at the user's chosen grouping. Numbers are
// written bare (unit named in the column header) so Excel charts them directly.
const exportCsv = async () => {
  const s = await buildChartSeries(props.config, "max");
  if (!s.points.length) {
    showActions.value = false;
    return;
  }

  const csv = buildChartCsv(s, props.config, props.title, {
    timeframe: "max",
    scopeLabel: props.title,
    ...chartCsvOptions(s, props.config, {
      weight: { label: weight.label.value, toDisplay: weight.toDisplay },
      length: { label: length.label.value, toDisplay: length.toDisplay },
    }),
  });
  const date = new Date().toISOString().slice(0, 10);
  downloadCsv(`yafa-chart-${slugify(props.title)}-${date}.csv`, csv);
  showActions.value = false;
};

const editFromMenu = () => {
  showActions.value = false;
  emit("edit");
};
</script>

<template>
  <div
    class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl shadow-sm"
  >
    <!-- Header: drag handle, scope + metric, edit -->
    <div class="flex items-center gap-3 px-4 py-3">
      <span
        v-if="!static"
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
        aria-label="Chart options"
        @click="showActions = true"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <circle cx="12" cy="5" r="1.75" />
          <circle cx="12" cy="12" r="1.75" />
          <circle cx="12" cy="19" r="1.75" />
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

  <!-- Kebab actions: edit / export -->
  <AppBottomSheet v-model:open="showActions" :title="title">
    <div class="flex flex-col px-2 py-2">
      <button
        v-if="!static"
        class="flex w-full items-center gap-3 rounded-lg px-3 py-3.5 text-left text-text-h-light dark:text-text-h-dark hover:bg-surface-light dark:hover:bg-surface-dark cursor-pointer transition-colors duration-150"
        @click="editFromMenu"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="shrink-0 text-text-light dark:text-text-dark"
        >
          <path d="M12 20h9"></path>
          <path
            d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
          ></path>
        </svg>
        <span class="text-sm font-semibold">Edit</span>
      </button>

      <button
        class="flex w-full items-center gap-3 rounded-lg px-3 py-3.5 text-left text-text-h-light dark:text-text-h-dark hover:bg-surface-light dark:hover:bg-surface-dark cursor-pointer transition-colors duration-150"
        @click="exportCsv"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="shrink-0 text-text-light dark:text-text-dark"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        <span class="text-sm font-semibold">Export as CSV</span>
      </button>
    </div>
  </AppBottomSheet>
</template>
