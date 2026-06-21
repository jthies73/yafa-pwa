<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { liveQuery } from "dexie";
import { db } from "../db/db";
import type {
  AnalyticsChartConfig,
  Exercise,
  MeasurementType,
} from "../db/types";
import {
  createChartConfig,
  deleteChartConfig,
  muscleGroupsOf,
  reorderChartConfigs,
  updateChartConfig,
  type ChartConfigInput,
} from "../db/analyticsCharts";
import type { Timeframe } from "../analytics/service";
import { TIMEFRAME_OPTIONS } from "../analytics/presentation";
import { useSortableList } from "../composables/useSortableList";
import AppFab from "./AppFab.vue";
import AnalyticsChartCard from "./AnalyticsChartCard.vue";
import AnalyticsChartFormSheet from "./AnalyticsChartFormSheet.vue";

// --- Global timeframe toggle (persisted, applies to every chart) ---
const TIMEFRAME_STORAGE_KEY = "yafa:analyticsTimeframe";

const readStoredTimeframe = (): Timeframe => {
  const stored = localStorage.getItem(TIMEFRAME_STORAGE_KEY);
  return TIMEFRAME_OPTIONS.some((o) => o.value === stored)
    ? (stored as Timeframe)
    : "max";
};

const timeframe = ref<Timeframe>(readStoredTimeframe());

const setTimeframe = (next: Timeframe) => {
  timeframe.value = next;
  localStorage.setItem(TIMEFRAME_STORAGE_KEY, next);
};

// --- Live data: chart configs + names for scope labels ---
const charts = ref<AnalyticsChartConfig[]>([]);
const exercisesById = ref<Record<string, Exercise>>({});
const measurementTypesById = ref<Record<string, MeasurementType>>({});
const loading = ref(true);
const subscriptions: { unsubscribe(): void }[] = [];

onMounted(() => {
  subscriptions.push(
    liveQuery(() => db.analyticsCharts.orderBy("order").toArray()).subscribe({
      next: (rows) => {
        charts.value = rows;
        loading.value = false;
      },
      error: (err) => console.error("Error loading charts:", err),
    }),
    liveQuery(() => db.exercises.toArray()).subscribe({
      next: (rows) =>
        (exercisesById.value = Object.fromEntries(rows.map((e) => [e.id, e]))),
      error: (err) => console.error("Error loading exercises:", err),
    }),
    liveQuery(() => db.measurementTypes.toArray()).subscribe({
      next: (rows) =>
        (measurementTypesById.value = Object.fromEntries(
          rows.map((t) => [t.id, t]),
        )),
      error: (err) => console.error("Error loading measurement types:", err),
    }),
  );
});

onUnmounted(() => subscriptions.forEach((s) => s.unsubscribe()));

const titleFor = (config: AnalyticsChartConfig): string => {
  if (config.name) return config.name;
  switch (config.sourceKind) {
    case "global":
      return "All Training";
    case "muscle":
      return muscleGroupsOf(config).join(", ") || "Muscle Group";
    case "exercise":
      return (
        exercisesById.value[config.exerciseId ?? ""]?.name ?? "Unknown Exercise"
      );
    case "measurement":
      return (
        measurementTypesById.value[config.measurementTypeId ?? ""]?.name ??
        "Unknown Measurement"
      );
  }
};

// --- Drag-to-reorder chart cards ---
const chartListEl = ref<HTMLElement | null>(null);

// While a card is dragged, fold every card down to its compact header so only
// a small card travels with the pointer (same pattern as WorkoutTrackerPanel).
const dragging = ref(false);

useSortableList(chartListEl, {
  handle: ".drag-handle",
  draggingClass: "shadow-lg",
  onCollapse: (collapsed) => (dragging.value = collapsed),
  onReorder: async (from, to) => {
    const list = charts.value.slice();
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    charts.value = list; // instant visual update
    await reorderChartConfigs(list.map((c) => c.id)); // background sync (echoed via liveQuery)
  },
});

// --- Create / edit sheet ---
const showForm = ref(false);
const editing = ref<AnalyticsChartConfig | null>(null);

const openCreate = () => {
  editing.value = null;
  showForm.value = true;
};

const openEdit = (config: AnalyticsChartConfig) => {
  editing.value = config;
  showForm.value = true;
};

const handleSave = async (input: ChartConfigInput) => {
  if (editing.value) {
    await updateChartConfig(editing.value.id, input);
  } else {
    await createChartConfig(input);
  }
  showForm.value = false;
};

const handleDelete = async () => {
  if (editing.value) await deleteChartConfig(editing.value.id);
  showForm.value = false;
};
</script>

<template>
  <div class="p-6 relative min-h-full flex flex-col gap-6 pb-24">
    <!-- Header with the global timeframe toggle (top-right, applies to all charts) -->
    <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
      <div class="min-w-0">
        <h1
          class="text-3xl font-bold tracking-tight text-text-h-light dark:text-text-h-dark"
        >
          Analytics
        </h1>
        <p class="text-sm text-text-light dark:text-text-dark opacity-70 mt-1">
          Track your progression over time.
        </p>
      </div>

      <div
        class="flex self-start sm:self-auto shrink-0 gap-1 rounded-xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark p-1"
      >
        <button
          v-for="option in TIMEFRAME_OPTIONS"
          :key="option.value"
          class="rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors duration-150 cursor-pointer"
          :class="
            timeframe === option.value
              ? 'bg-accent text-bg-dark'
              : 'text-text-light dark:text-text-dark hover:text-text-h-light dark:hover:text-text-h-dark'
          "
          @click="setTimeframe(option.value)"
        >
          {{ option.label }}
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div
      v-if="loading"
      class="flex-grow flex flex-col items-center justify-center p-12"
    >
      <div
        class="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin"
      ></div>
    </div>

    <!-- Empty state -->
    <div
      v-else-if="charts.length === 0"
      class="flex-grow flex flex-col items-center justify-center text-center px-8 py-16"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="40"
        height="40"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="mb-4 text-text-light dark:text-text-dark opacity-30"
      >
        <line x1="18" y1="20" x2="18" y2="10"></line>
        <line x1="12" y1="20" x2="12" y2="4"></line>
        <line x1="6" y1="20" x2="6" y2="14"></line>
      </svg>
      <p
        class="text-sm font-semibold text-text-h-light dark:text-text-h-dark mb-1"
      >
        No charts yet
      </p>
      <p class="text-xs text-text-light dark:text-text-dark opacity-50">
        Create your first chart to visualize volume, performance and body
        measurements.
      </p>
    </div>

    <!-- Chart cards (drag by the handle to reorder) -->
    <div v-else ref="chartListEl" class="flex flex-col gap-4">
      <AnalyticsChartCard
        v-for="config in charts"
        :key="config.id"
        :config="config"
        :title="titleFor(config)"
        :timeframe="timeframe"
        :collapsed="dragging"
        @edit="openEdit(config)"
      />
    </div>

    <!-- New chart FAB -->
    <AppFab label="New Chart" @click="openCreate" />

    <AnalyticsChartFormSheet
      v-model:open="showForm"
      :editing="editing"
      @save="handleSave"
      @delete="handleDelete"
    />
  </div>
</template>
