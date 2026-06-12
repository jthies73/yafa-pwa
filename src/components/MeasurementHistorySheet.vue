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
import { guardWeightKey } from "../utils/numericInput";
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

// datetime-local <input> bound to the entry timestamp; defaults to "now".
const entryTimeLocal = ref(toLocalInput(Date.now()));

const resetEntryForm = () => {
  pendingValue.value = null;
  entryTimeLocal.value = toLocalInput(Date.now());
};

watch(open, (isOpen) => {
  if (isOpen) resetEntryForm();
}, { immediate: true });

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
  const ts = entryTimeLocal.value
    ? new Date(entryTimeLocal.value).getTime()
    : Date.now();
  await logMeasurementEntry({
    measurementTypeId: props.type.id,
    value: base,
    timestamp: Number.isFinite(ts) ? ts : Date.now(),
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
  if (!type || type.isSystem) return;
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
      <div class="flex items-center gap-2">
        <h2
          class="truncate text-lg font-bold text-text-h-light dark:text-text-h-dark"
        >
          {{ type?.name }}
        </h2>
        <span
          v-if="type?.isSystem"
          class="shrink-0 rounded-md bg-accent/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent"
        >
          System
        </span>
      </div>
    </template>

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
        class="w-full rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark px-3 py-2 text-sm text-text-h-light dark:text-text-h-dark focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/40"
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
            class="shrink-0 cursor-pointer rounded-md p-1.5 text-text-light dark:text-text-dark opacity-40 transition-colors duration-150 hover:bg-red-500/10 hover:text-red-500 hover:opacity-100"
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
              <path d="M3 6h18" />
              <path
                d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
              />
            </svg>
          </button>
        </li>
      </ul>

      <!-- Delete the whole measurement type (non-system only) -->
      <button
        v-if="type && !type.isSystem"
        class="mt-5 w-full cursor-pointer rounded-lg border border-red-500/30 py-2.5 text-sm font-bold text-red-500 transition-colors duration-150 hover:bg-red-500/10"
        @click="requestDeleteType"
      >
        Delete Measurement
      </button>

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
