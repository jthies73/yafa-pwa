<script setup lang="ts">
import { ref, computed, watch } from "vue";
import AppBottomSheet from "./AppBottomSheet.vue";
import {
  exportData,
  importData,
  parseBackupFile,
  previewImport,
  type BackupFile,
  type ImportPreview,
  type EntityCounts,
} from "../db/backup";
import { downloadBlob } from "../utils/download";
import { readPortableSettings } from "../config/settings";

const open = defineModel<boolean>("open", { required: true });

type Status =
  "idle" | "exporting" | "previewing" | "importing" | "done" | "error";
const status = ref<Status>("idle");
const message = ref<string | null>(null);
const pendingFile = ref<File | null>(null);
const parsedBackup = ref<BackupFile | null>(null);
const preview = ref<ImportPreview | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

// Reset transient state whenever the sheet is (re)opened.
watch(open, (isOpen) => {
  if (isOpen) {
    status.value = "idle";
    message.value = null;
    pendingFile.value = null;
    parsedBackup.value = null;
    preview.value = null;
  }
});

const exportJson = async () => {
  status.value = "exporting";
  message.value = null;
  try {
    const backup = await exportData();
    const json = JSON.stringify(backup, null, 2);
    const date = new Date().toISOString().slice(0, 10);
    downloadBlob(
      `yafa-backup-${date}.json`,
      new Blob([json], { type: "application/json" }),
    );
    status.value = "done";
    message.value = "Export complete.";
  } catch (err) {
    status.value = "error";
    message.value = (err as Error).message;
  }
};

const chooseFile = () => fileInput.value?.click();

const clearPending = () => {
  pendingFile.value = null;
  parsedBackup.value = null;
  preview.value = null;
  status.value = "idle";
  message.value = null;
};

const onFileSelected = async (e: Event) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  input.value = ""; // allow re-selecting the same file later
  if (!file) return;

  pendingFile.value = file;
  parsedBackup.value = null;
  preview.value = null;
  status.value = "previewing";
  message.value = null;

  try {
    const backup = await parseBackupFile(file);
    parsedBackup.value = backup;
    preview.value = await previewImport(backup);
    status.value = "idle";
  } catch (err) {
    status.value = "error";
    message.value = (err as Error).message;
    pendingFile.value = null;
  }
};

const confirmImport = async () => {
  if (!parsedBackup.value) return;
  status.value = "importing";
  message.value = null;
  try {
    const plainBackup = JSON.parse(JSON.stringify(parsedBackup.value));
    await importData(plainBackup);
    // Success: show the summary. The reload waits for the Done button — it's
    // needed only so imported settings (theme/units) take effect, since Dexie
    // liveQuery already rebinds the restored DB data on its own.
    status.value = "done";
  } catch (err) {
    status.value = "error";
    message.value = (err as Error).message;
    clearPending();
  }
};

const finishAndReload = () => location.reload();

// ── Preview display helpers ──────────────────────────────────────────────────

interface PreviewRow {
  label: string;
  counts: EntityCounts;
}

// Every entity present in the backup (any of new/updated/unchanged) gets a row;
// the right-hand status reflects its three-state classification.
const settingsCounts = computed<EntityCounts>(() => {
  const backupSettings = parsedBackup.value?.settings;
  if (!backupSettings) {
    return { new: 0, updated: 0, unchanged: 0 };
  }
  const localSettings = readPortableSettings(localStorage);
  let newCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;

  for (const [key, backupVal] of Object.entries(backupSettings)) {
    const localVal = localSettings[key];
    if (localVal === undefined) {
      newCount++;
    } else if (localVal !== backupVal) {
      updatedCount++;
    } else {
      unchangedCount++;
    }
  }

  return { new: newCount, updated: updatedCount, unchanged: unchangedCount };
});

const previewRows = computed<PreviewRow[]>(() => {
  const p = preview.value;
  if (!p) return [];

  const candidates: PreviewRow[] = [
    { label: "Exercises", counts: p.exercises },
    { label: "Routines", counts: p.routines },
    { label: "Plans", counts: p.plans },
    ...(p.workouts.mode === "structured"
      ? [{ label: "Workouts", counts: p.workouts.counts }]
      : []),
    { label: "Measurement types", counts: p.measurementTypes },
    { label: "Measurements", counts: p.measurementEntries },
    { label: "Charts", counts: p.analyticsCharts },
    ...(hasSettings.value
      ? [{ label: "Settings", counts: settingsCounts.value }]
      : []),
  ];

  return candidates.filter(
    (r) => r.counts.new + r.counts.updated + r.counts.unchanged > 0,
  );
});

// Sum of items the import will actually change, for the success summary.
const importTotals = computed(() => {
  const p = preview.value;
  if (!p) return { new: 0, updated: 0 };
  const counts: EntityCounts[] = [
    p.exercises,
    p.routines,
    p.plans,
    p.measurementTypes,
    p.measurementEntries,
    p.analyticsCharts,
    ...(p.workouts.mode === "structured" ? [p.workouts.counts] : []),
    ...(hasSettings.value ? [settingsCounts.value] : []),
  ];
  let newCount = counts.reduce((s, c) => s + c.new, 0);
  const updatedCount = counts.reduce((s, c) => s + c.updated, 0);
  // Reconstruction synthesizes exercises + workouts not present in the entity
  // diffs above — fold them into the "new" tally so the summary isn't empty.
  if (p.workouts.mode === "reconstructed") {
    newCount += p.workouts.exercisesToCreate + p.workouts.workoutsToCreate;
  }
  return { new: newCount, updated: updatedCount };
});

const pluralize = (n: number, singular: string, plural = `${singular}s`) =>
  `${n} ${n === 1 ? singular : plural}`;

const hasSettings = computed(() => !!parsedBackup.value?.settings);

const close = () => {
  open.value = false;
};
</script>

<template>
  <AppBottomSheet v-model:open="open" title="Import / Export" z-index="z-[55]">
    <div class="flex flex-col gap-6 px-5 py-5">
      <!-- Description -->
      <p class="text-sm text-text-light dark:text-text-dark opacity-70">
        YAFA keeps all your data on this device. Export a single backup file to
        safeguard it or move it to another device — it includes your workouts,
        exercises, plans, body measurements, charts and settings. Importing
        merges a backup back in without deleting anything you already have.
      </p>

      <!-- Export -->
      <div class="flex flex-col gap-2">
        <span
          class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
        >
          Export
        </span>
        <button
          class="flex items-center justify-center gap-2 rounded-lg border border-border-light dark:border-border-dark py-3 text-sm font-bold text-text-light dark:text-text-dark transition-colors duration-150 hover:bg-surface-light dark:hover:bg-surface-dark cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="status === 'exporting'"
          @click="exportJson"
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
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          {{ status === "exporting" ? "Exporting…" : "Export backup" }}
        </button>
      </div>

      <!-- Import -->
      <div class="flex flex-col gap-2">
        <span
          class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
        >
          Import
        </span>
        <input
          ref="fileInput"
          type="file"
          accept="application/json,.json,application/zip,.zip"
          class="hidden"
          @change="onFileSelected"
        />

        <!-- Step 1: choose a file -->
        <button
          v-if="!pendingFile"
          class="flex items-center justify-center gap-2 rounded-lg border border-border-light dark:border-border-dark py-3 text-sm font-bold text-text-light dark:text-text-dark transition-colors duration-150 hover:bg-surface-light dark:hover:bg-surface-dark cursor-pointer"
          @click="chooseFile"
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
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Choose backup file
        </button>

        <!-- Step 3: import succeeded -->
        <div v-else-if="status === 'done'" class="flex flex-col gap-3">
          <div
            class="flex flex-col items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-4 py-5 text-center"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="text-accent"
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <p class="text-sm font-bold text-text-light dark:text-text-dark">
              Import complete
            </p>
            <p class="text-sm text-text-light dark:text-text-dark opacity-70">
              <template v-if="importTotals.new + importTotals.updated > 0">
                Added {{ importTotals.new }} new and merged
                {{ importTotals.updated }} updated
                {{
                  importTotals.new + importTotals.updated === 1
                    ? "item"
                    : "items"
                }}.
              </template>
              <template v-else> Everything was already up to date. </template>
            </p>
          </div>
          <p
            class="text-center text-xs text-text-light dark:text-text-dark opacity-50"
          >
            Reload to apply the imported theme and units.
          </p>
          <button
            class="rounded-lg bg-accent py-2.5 text-sm font-bold text-bg-dark transition-colors duration-150 hover:bg-accent/90 cursor-pointer"
            @click="finishAndReload"
          >
            Done
          </button>
        </div>

        <!-- Step 2: confirm merge -->
        <div v-else class="flex flex-col gap-3">
          <!-- File name -->
          <p class="text-sm text-text-light dark:text-text-dark">
            <span class="font-semibold">{{ pendingFile.name }}</span>
          </p>

          <!-- Import overview -->
          <div class="flex flex-col gap-1">
            <span
              class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
            >
              Overview
            </span>

            <!-- Loading -->
            <p
              v-if="status === 'previewing'"
              class="text-sm text-text-light dark:text-text-dark opacity-50 py-1"
            >
              Analysing backup…
            </p>

            <template v-else-if="preview">
              <!-- Entity rows -->
              <div
                v-if="previewRows.length > 0"
                class="divide-y divide-border-light dark:divide-border-dark"
              >
                <div
                  v-for="row in previewRows"
                  :key="row.label"
                  class="flex items-center justify-between py-1.5 text-sm"
                >
                  <span
                    class="text-text-light dark:text-text-dark opacity-70"
                    >{{ row.label }}</span
                  >
                  <div class="flex items-center gap-1.5 font-semibold text-sm">
                    <template
                      v-if="row.counts.new > 0 || row.counts.updated > 0"
                    >
                      <span v-if="row.counts.new > 0" class="text-accent">
                        +{{ row.counts.new }}
                      </span>
                      <span
                        v-if="row.counts.new > 0 && row.counts.updated > 0"
                        class="text-text-light dark:text-text-dark opacity-35 font-normal"
                      >
                        ·
                      </span>
                      <span
                        v-if="row.counts.updated > 0"
                        class="text-indigo-500 dark:text-indigo-400"
                      >
                        ~{{ row.counts.updated }}
                      </span>
                    </template>
                    <span
                      v-else
                      class="text-text-light dark:text-text-dark opacity-40 font-normal"
                    >
                      Up to date
                    </span>
                  </div>
                </div>
              </div>

              <!-- Legend -->
              <div
                v-if="previewRows.length > 0"
                class="flex items-center gap-3 text-sm text-text-light dark:text-text-dark opacity-55 mt-2"
              >
                <span class="flex items-center gap-0.5">
                  <span class="text-accent font-bold">+</span> New
                </span>
                <span class="text-text-light dark:text-text-dark opacity-30"
                  >·</span
                >
                <span class="flex items-center gap-0.5">
                  <span class="text-indigo-500 dark:text-indigo-400 font-bold"
                    >~</span
                  >
                  Updated
                </span>
              </div>

              <!-- Workouts: reconstruction warning (replaces the workout row) -->
              <div
                v-if="preview.workouts.mode === 'reconstructed'"
                class="mt-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-400"
              >
                <p class="font-semibold mb-0.5">
                  Backup workout data couldn't be read
                </p>
                <p class="opacity-90 text-xs leading-relaxed">
                  <template
                    v-if="
                      preview.workouts.exercisesToCreate +
                        preview.workouts.workoutsToCreate >
                      0
                    "
                  >
                    Falling back to per-exercise reconstruction — this will
                    create
                    <span class="font-semibold">{{
                      pluralize(preview.workouts.exercisesToCreate, "exercise")
                    }}</span>
                    and
                    <span class="font-semibold">{{
                      pluralize(preview.workouts.workoutsToCreate, "workout")
                    }}</span>
                    from raw exercise data.
                  </template>
                  <template v-else>
                    Workout history is already up to date.
                  </template>
                </p>
                <p class="opacity-60 text-[11px] leading-relaxed mt-1">
                  {{ preview.workouts.reason }}
                </p>
              </div>

              <!-- Workouts: unrecoverable (replaces the workout row) -->
              <div
                v-else-if="preview.workouts.mode === 'unrecoverable'"
                class="mt-1 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-sm text-red-700 dark:text-red-400"
              >
                <p class="font-semibold mb-0.5">
                  Workout data can't be imported
                </p>
                <p class="opacity-90 text-xs leading-relaxed">
                  It's corrupted and there's no raw fallback to rebuild it from.
                  Workouts will be skipped — all other data still imports.
                </p>
                <p class="opacity-60 text-[11px] leading-relaxed mt-1">
                  {{ preview.workouts.reason }}
                </p>
              </div>

              <!-- Nothing in the backup at all -->
              <p
                v-else-if="previewRows.length === 0"
                class="text-sm text-text-light dark:text-text-dark opacity-50 py-1"
              >
                This backup contains no data to import.
              </p>
            </template>
          </div>

          <!-- Cancel / Import -->
          <div class="flex gap-3">
            <button
              class="flex-1 rounded-lg border border-border-light dark:border-border-dark py-2.5 text-sm font-bold text-text-light dark:text-text-dark transition-colors duration-150 hover:bg-surface-light dark:hover:bg-surface-dark cursor-pointer disabled:opacity-40"
              :disabled="status === 'importing'"
              @click="clearPending"
            >
              Cancel
            </button>
            <button
              class="flex-1 rounded-lg bg-accent py-2.5 text-sm font-bold text-bg-dark transition-colors duration-150 hover:bg-accent/90 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
              :disabled="status === 'importing' || status === 'previewing'"
              @click="confirmImport"
            >
              {{ status === "importing" ? "Importing…" : "Import" }}
            </button>
          </div>
        </div>
      </div>

      <!-- Status message -->
      <p
        v-if="message"
        class="text-sm"
        :class="status === 'error' ? 'text-red-500' : 'text-accent'"
      >
        {{ message }}
      </p>
    </div>

    <template #footer>
      <button
        class="flex-1 rounded-lg border border-border-light dark:border-border-dark py-3 text-sm font-bold text-text-light dark:text-text-dark transition-colors duration-150 hover:bg-surface-light dark:hover:bg-surface-dark cursor-pointer"
        @click="close"
      >
        Close
      </button>
    </template>
  </AppBottomSheet>
</template>
