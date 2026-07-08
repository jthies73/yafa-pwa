<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from "vue";
import { liveQuery } from "dexie";
import { db } from "../db/db";
import type {
  MeasurementCategory,
  MeasurementEntry,
  MeasurementType,
} from "../db/types";
import {
  logMeasurementEntry,
  deleteMeasurementEntry,
  deleteMeasurementType,
} from "../db/measurements";
import {
  useMeasurementField,
  useMeasurementFormat,
} from "../composables/useMeasurementUnit";
import {
  computeMeasurementSeries,
  type BucketPoint,
} from "../analytics/compute";
import { guardWeightKey } from "../utils/numericInput";
import AnalyticsChart from "./AnalyticsChart.vue";
import AppBottomSheet from "./AppBottomSheet.vue";
import ConfirmDialog from "./ConfirmDialog.vue";

const open = defineModel<boolean>("open", { required: true });

const props = defineProps<{
  type: MeasurementType | null;
}>();

const emit = defineEmits<{
  (e: "deleted"): void;
}>();

const { format } = useMeasurementFormat();

// --- Entries (live) ---
const entries = ref<MeasurementEntry[]>([]);
let subscription: { unsubscribe(): void } | undefined;

watch(
  () => props.type?.id,
  (typeId) => {
    subscription?.unsubscribe();
    subscription = undefined;
    entries.value = [];
    if (!typeId) return;
    subscription = liveQuery(() =>
      db.measurementEntries.where("measurementTypeId").equals(typeId).toArray(),
    ).subscribe({
      next: (rows) =>
        (entries.value = rows.sort((a, b) => b.timestamp - a.timestamp)),
      error: (err) => console.error("Error loading measurement entries:", err),
    });
  },
  { immediate: true },
);

onUnmounted(() => subscription?.unsubscribe());

// --- Data entry ---
const category = computed<MeasurementCategory>(
  () => props.type?.category ?? "LENGTH",
);

// --- Inline trend chart ---
// Fixed 3-month window, deliberately independent of the analytics page's
// global timeframe toggle: this chart answers "where am I trending right now",
// shown before the user logs a new entry.
const TREND_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

const trendPoints = computed<BucketPoint[]>(() => {
  const cutoff = Date.now() - TREND_WINDOW_MS;
  return computeMeasurementSeries({
    entries: entries.value.filter((e) => e.timestamp >= cutoff),
    bucket: "session",
  });
});

const formatTrendValue = (value: number) => format(value, category.value);
const trendTitle = (point: BucketPoint) =>
  `${point.label} — ${format(point.value, category.value)}`;
const trendLines = () => [];

const pendingValue = ref<number | null>(null);
const { buffer, onFocus, commit, unitLabel } = useMeasurementField({
  category,
  getValue: () => pendingValue.value,
  setValue: (v) => (pendingValue.value = v),
  decimals: 1,
});

const toLocalInput = (epoch: number): string => {
  const d = new Date(epoch);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
};

// Epoch milliseconds are the source of truth for the entry time; it defaults to
// "now" with full precision. The datetime-local <input> below only has minute
// resolution, so it's a display proxy (see entryTimeLocal): editing it keeps the
// existing sub-minute component, and an untouched field logs the live timestamp.
// This keeps rapid same-minute entries distinct and correctly ordered — two
// truncated-to-the-minute timestamps would collide on the trend chart.
const entryTimestamp = ref(Date.now());

const entryTimeLocal = computed<string>({
  get: () => toLocalInput(entryTimestamp.value),
  set: (local) => {
    const minute = new Date(local).getTime();
    if (Number.isFinite(minute)) {
      entryTimestamp.value = minute + (entryTimestamp.value % 60_000);
    }
  },
});

const resetEntryForm = () => {
  pendingValue.value = null;
  entryTimestamp.value = Date.now();
};

watch(
  open,
  (isOpen) => {
    if (isOpen) resetEntryForm();
  },
  { immediate: true },
);

const onValueKeydown = (e: KeyboardEvent) => {
  if (e.key === "Enter") {
    e.preventDefault();
    (e.target as HTMLElement).blur();
    return;
  }
  guardWeightKey(e);
};

const onLog = async () => {
  if (!props.type) return;
  const base = commit(); // flush buffer → pendingValue, returns source-of-truth value
  if (base == null || base <= 0) return;
  await logMeasurementEntry({
    measurementTypeId: props.type.id,
    value: base,
    timestamp: entryTimestamp.value,
  });
  resetEntryForm();
};

// --- History formatting ---
const formatTimestamp = (epoch: number): string => {
  const d = new Date(epoch);
  const date = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${date} · ${time}`;
};

// --- Deletion (confirmed) ---
const confirmOpen = ref(false);
const confirmTitle = ref("");
const confirmMessage = ref("");
let confirmAction: (() => void | Promise<void>) | null = null;

const requestConfirm = (
  title: string,
  message: string,
  action: () => void | Promise<void>,
) => {
  confirmTitle.value = title;
  confirmMessage.value = message;
  confirmAction = action;
  confirmOpen.value = true;
};

const onConfirm = () => {
  const action = confirmAction;
  confirmAction = null;
  action?.();
};

const requestDeleteEntry = (entry: MeasurementEntry) => {
  requestConfirm(
    "Delete entry?",
    `Delete the ${format(entry.value, category.value)} entry from ${formatTimestamp(entry.timestamp)}?`,
    () => deleteMeasurementEntry(entry.id),
  );
};

const requestDeleteType = () => {
  const type = props.type;
  if (!type) return;
  requestConfirm(
    "Delete measurement?",
    `Delete "${type.name}" and all its logged entries? This cannot be undone.`,
    async () => {
      await deleteMeasurementType(type.id);
      open.value = false;
      emit("deleted");
    },
  );
};
</script>

<template>
  <AppBottomSheet v-model:open="open">
    <template #title>
      <div class="flex items-center justify-between gap-4 w-full">
        <h2
          class="truncate text-lg font-bold text-text-h-light dark:text-text-h-dark"
        >
          {{ type?.name }}
        </h2>
        <button
          v-if="type && !type.isSystem"
          type="button"
          class="px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-red-500/10 text-red-500 hover:bg-red-500/20 dark:bg-red-500/15 dark:text-red-400 dark:hover:bg-red-500/25 transition-colors duration-150 cursor-pointer shrink-0"
          @click="requestDeleteType"
        >
          Delete
        </button>
      </div>
    </template>

    <!-- Trend (same line style as the analytics charts) -->
    <div
      v-if="trendPoints.length >= 2"
      class="border-b border-border-light dark:border-border-dark px-5 py-4"
    >
      <div class="mb-2 flex items-center justify-between">
        <h3
          class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-50"
        >
          Trend
        </h3>
        <span class="text-xs text-text-light dark:text-text-dark opacity-40">
          Last 3 months
        </span>
      </div>
      <AnalyticsChart
        :points="trendPoints"
        type="line"
        :format-value="formatTrendValue"
        :tooltip-title="trendTitle"
        :tooltip-lines="trendLines"
      />
    </div>

    <!-- Data entry -->
    <div
      class="flex flex-col gap-3 border-b border-border-light dark:border-border-dark px-5 py-4"
    >
      <div class="flex items-end gap-2">
        <div class="relative flex-1">
          <input
            v-model="buffer"
            v-numpad="'decimal'"
            type="text"
            inputmode="decimal"
            placeholder="0"
            class="w-full rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark py-3 pl-4 pr-12 text-2xl font-bold font-mono text-text-h-light dark:text-text-h-dark focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/40"
            @focus="onFocus"
            @blur="commit"
            @keydown="onValueKeydown"
          />
          <span
            class="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-semibold text-text-light dark:text-text-dark opacity-50"
          >
            {{ unitLabel }}
          </span>
        </div>
      </div>

      <input
        v-model="entryTimeLocal"
        type="datetime-local"
        data-no-select
        class="w-full max-w-full rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark px-3 py-2 text-sm text-text-h-light dark:text-text-h-dark focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/40"
      />

      <button
        class="w-full rounded-lg bg-accent py-2.5 text-sm font-bold uppercase tracking-wider text-bg-dark transition-colors duration-150 hover:bg-accent-hover cursor-pointer"
        @click="onLog"
      >
        Log Measurement
      </button>
    </div>

    <!-- History -->
    <div class="flex flex-col px-5 py-4">
      <h3
        class="mb-2 text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-50"
      >
        History
      </h3>

      <div
        v-if="entries.length === 0"
        class="py-6 text-center text-sm italic text-text-light dark:text-text-dark opacity-50"
      >
        No entries logged yet.
      </div>

      <ul v-else class="flex flex-col">
        <li
          v-for="entry in entries"
          :key="entry.id"
          class="flex items-center justify-between gap-3 border-b border-border-light dark:border-border-dark py-3 last:border-0"
        >
          <div class="min-w-0">
            <div
              class="font-mono text-sm font-bold text-text-h-light dark:text-text-h-dark"
            >
              {{ format(entry.value, category) }}
            </div>
            <div class="text-xs text-text-light dark:text-text-dark opacity-55">
              {{ formatTimestamp(entry.timestamp) }}
            </div>
          </div>
          <button
            class="shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-text-light dark:text-text-dark opacity-40 hover:opacity-100 hover:text-red-500 dark:hover:text-red-400 cursor-pointer transition-colors duration-150"
            aria-label="Delete entry"
            @click="requestDeleteEntry(entry)"
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
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </button>
        </li>
      </ul>

      <div class="h-4"></div>
    </div>
  </AppBottomSheet>

  <ConfirmDialog
    v-model:open="confirmOpen"
    :title="confirmTitle"
    :message="confirmMessage"
    @confirm="onConfirm"
  />
</template>
