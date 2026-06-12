<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { liveQuery } from "dexie";
import { db } from "../db/db";
import type { MeasurementEntry, MeasurementType } from "../db/types";
import {
  createMeasurementType,
  type MeasurementTypeInput,
} from "../db/measurements";
import { useMeasurementFormat } from "../composables/useMeasurementUnit";
import AppFab from "./AppFab.vue";
import MeasurementTypeFormSheet from "./MeasurementTypeFormSheet.vue";
import MeasurementHistorySheet from "./MeasurementHistorySheet.vue";

const { format } = useMeasurementFormat();

const types = ref<MeasurementType[]>([]);
const latestByType = ref<Record<string, MeasurementEntry>>({});
let subscription: { unsubscribe(): void } | undefined;

onMounted(() => {
  subscription = liveQuery(async () => {
    const [allTypes, allEntries] = await Promise.all([
      db.measurementTypes.toArray(),
      db.measurementEntries.toArray(),
    ]);
    return { allTypes, allEntries };
  }).subscribe({
    next: ({ allTypes, allEntries }) => {
      // System types (Bodyweight) lead; the rest follow alphabetically.
      types.value = allTypes.sort((a, b) => {
        if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      const latest: Record<string, MeasurementEntry> = {};
      for (const entry of allEntries) {
        const current = latest[entry.measurementTypeId];
        if (!current || entry.timestamp > current.timestamp) {
          latest[entry.measurementTypeId] = entry;
        }
      }
      latestByType.value = latest;
    },
    error: (err) => console.error("Error loading measurements:", err),
  });
});

onUnmounted(() => subscription?.unsubscribe());

const latestLabel = (type: MeasurementType): string => {
  const entry = latestByType.value[type.id];
  return entry ? format(entry.value, type.category) : "No data";
};

const hasData = (type: MeasurementType): boolean =>
  latestByType.value[type.id] !== undefined;

// --- Sheets ---
const showCreate = ref(false);
const showHistory = ref(false);
const activeType = ref<MeasurementType | null>(null);

const openCreate = () => (showCreate.value = true);

const openHistory = (type: MeasurementType) => {
  activeType.value = type;
  showHistory.value = true;
};

const handleCreate = async (input: MeasurementTypeInput) => {
  const id = await createMeasurementType(input);
  showCreate.value = false;
  // Transition straight into the new measurement's history/entry sheet.
  const created = await db.measurementTypes.get(id);
  if (created) openHistory(created);
};

const categoryLabel: Record<MeasurementType["category"], string> = {
  WEIGHT: "Weight",
  LENGTH: "Length",
  PERCENTAGE: "Percentage",
};
</script>

<template>
  <div class="relative flex min-h-full flex-col p-6 pb-24">
    <!-- Header -->
    <div class="mb-6">
      <h1
        class="text-3xl font-bold tracking-tight text-text-h-light dark:text-text-h-dark"
      >
        Measurements
      </h1>
      <p class="mt-1 text-sm text-text-light dark:text-text-dark opacity-70">
        Track bodyweight, anthropometrics and composition over time
      </p>
    </div>

    <!-- Grid -->
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      <button
        v-for="type in types"
        :key="type.id"
        class="flex cursor-pointer flex-col items-start gap-2 rounded-xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark p-5 text-left shadow-sm transition-colors duration-150 hover:bg-surface-light-hover dark:hover:bg-surface-dark-hover"
        @click="openHistory(type)"
      >
        <div class="flex w-full items-center justify-between gap-2">
          <h3
            class="truncate text-sm font-bold text-text-h-light dark:text-text-h-dark"
          >
            {{ type.name }}
          </h3>
          <span
            class="shrink-0 rounded-md border border-border-light dark:border-border-dark px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-light dark:text-text-dark opacity-55"
          >
            {{ categoryLabel[type.category] }}
          </span>
        </div>
        <div
          class="font-mono text-2xl font-bold"
          :class="
            hasData(type)
              ? 'text-text-h-light dark:text-text-h-dark'
              : 'text-text-light dark:text-text-dark opacity-40'
          "
        >
          {{ latestLabel(type) }}
        </div>
      </button>
    </div>

    <!-- New Measurement FAB -->
    <AppFab label="New Measurement" @click="openCreate" />

    <MeasurementTypeFormSheet v-model:open="showCreate" @save="handleCreate" />
    <MeasurementHistorySheet
      v-model:open="showHistory"
      :type="activeType"
      @deleted="showHistory = false"
    />
  </div>
</template>
