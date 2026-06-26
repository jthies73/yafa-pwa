<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { DEFAULT_RPE_MATRIX } from "../db/rpeMatrix";
import RpeMatrixTable from "./RpeMatrixTable.vue";
import ConfirmDialog from "./ConfirmDialog.vue";
import { useWeightUnit, type WeightUnit } from "../composables/useWeightUnit";
import { useLengthUnit, type LengthUnit } from "../composables/useLengthUnit";
import { db } from "../db/db";

const router = useRouter();

const isDark = ref(false);
const rpeMatrix = DEFAULT_RPE_MATRIX;

// Reactive, app-wide weight unit. Switching it reconverts every weight in the
// app (kg stays the stored source of truth).
const { label: weightUnit, setUnit } = useWeightUnit();

onMounted(() => {
  const savedTheme = localStorage.getItem("yafa:theme");
  isDark.value =
    savedTheme === "dark" ||
    (!savedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches);
});

const toggleTheme = () => {
  isDark.value = !isDark.value;
  if (isDark.value) {
    document.documentElement.classList.add("dark");
    localStorage.setItem("yafa:theme", "dark");
  } else {
    document.documentElement.classList.remove("dark");
    localStorage.setItem("yafa:theme", "light");
  }
};

const { label: lengthUnit, setUnit: setLengthUnitRaw } = useLengthUnit();

const setWeightUnit = (unit: WeightUnit) => setUnit(unit);
const setLengthUnit = (unit: LengthUnit) => setLengthUnitRaw(unit);

const toggleWeightUnit = () => {
  setWeightUnit(weightUnit.value === "kg" ? "lbs" : "kg");
};
const toggleLengthUnit = () => {
  setLengthUnit(lengthUnit.value === "cm" ? "in" : "cm");
};

// <!-- Delete all data -->
const showDeleteConfirm = ref(false);
const showDeleteTypeConfirm = ref(false);
const deleteConfirmText = ref("");
const deleteReady = computed(
  () => deleteConfirmText.value.trim().toLowerCase() === "yes i am sure",
);

const onFirstConfirm = () => {
  showDeleteTypeConfirm.value = true;
  deleteConfirmText.value = "";
};

const cancelTypeConfirm = () => {
  showDeleteTypeConfirm.value = false;
  deleteConfirmText.value = "";
};

const deleteAllData = async () => {
  await Promise.all([
    db.exercises.clear(),
    db.routines.clear(),
    db.plans.clear(),
    db.workouts.clear(),
    db.measurementTypes.clear(),
    db.measurementEntries.clear(),
    db.analyticsCharts.clear(),
    db.progressionStates.clear(),
  ]);
  localStorage.clear();
  showDeleteTypeConfirm.value = false;
  router.push("/");
};
</script>

<template>
  <div class="p-6 relative min-h-full flex flex-col animate-fade-in">
    <!-- Header Section -->
    <div class="mb-6">
      <h1
        class="text-3xl font-bold tracking-tight text-text-h-light dark:text-text-h-dark"
      >
        Settings
      </h1>
      <p class="text-sm text-text-light dark:text-text-dark opacity-70 mt-1">
        Configure your preferences and autoregulation defaults
      </p>
    </div>

    <div class="flex flex-col gap-6 max-w-4xl">
      <!-- Preferences Card -->
      <div
        class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-6 shadow-sm flex flex-col"
      >
        <h2
          class="text-lg font-bold text-text-h-light dark:text-text-h-dark mb-4 flex items-center gap-2"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="text-accent"
          >
            <path
              d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
            />
            <circle cx="12" cy="12" r="3" />
          </svg>
          Preferences
        </h2>

        <!-- Theme Option -->
        <div
          class="flex items-center justify-between py-3 border-b border-border-light dark:border-border-dark"
        >
          <div>
            <div
              class="font-semibold text-text-h-light dark:text-text-h-dark text-sm sm:text-base"
            >
              Dark Mode
            </div>
          </div>
          <button
            class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
            :class="
              isDark ? 'bg-accent' : 'bg-border-light dark:bg-border-dark'
            "
            aria-label="Toggle dark mode"
            @click="toggleTheme"
          >
            <span
              class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
              :class="isDark ? 'translate-x-5' : 'translate-x-0'"
            />
          </button>
        </div>

        <!-- Weight Units -->
        <div
          class="flex items-center justify-between py-3 border-b border-border-light dark:border-border-dark"
        >
          <div>
            <div
              class="font-semibold text-text-h-light dark:text-text-h-dark text-sm sm:text-base"
            >
              Weight Units
            </div>
          </div>
          <button
            type="button"
            class="flex items-center border border-border-light dark:border-border-dark rounded-lg overflow-hidden bg-black/5 dark:bg-white/5 w-24 cursor-pointer select-none"
            role="switch"
            :aria-checked="weightUnit === 'lbs'"
            aria-label="Toggle weight unit"
            @click="toggleWeightUnit"
          >
            <span
              class="flex-1 text-center py-1.5 text-xs font-semibold transition-colors duration-150"
              :class="
                weightUnit === 'kg'
                  ? 'bg-accent text-bg-dark font-bold'
                  : 'text-text-h-light dark:text-text-h-dark hover:bg-surface-light-hover/40 dark:hover:bg-surface-dark-hover/40'
              "
            >
              kg
            </span>
            <span
              class="flex-1 text-center py-1.5 text-xs font-semibold transition-colors duration-150"
              :class="
                weightUnit === 'lbs'
                  ? 'bg-accent text-bg-dark font-bold'
                  : 'text-text-h-light dark:text-text-h-dark hover:bg-surface-light-hover/40 dark:hover:bg-surface-dark-hover/40'
              "
            >
              lbs
            </span>
          </button>
        </div>

        <!-- Length Units -->
        <div class="flex items-center justify-between py-3">
          <div>
            <div
              class="font-semibold text-text-h-light dark:text-text-h-dark text-sm sm:text-base"
            >
              Length Units
            </div>
          </div>
          <button
            type="button"
            class="flex items-center border border-border-light dark:border-border-dark rounded-lg overflow-hidden bg-black/5 dark:bg-white/5 w-24 cursor-pointer select-none"
            role="switch"
            :aria-checked="lengthUnit === 'in'"
            aria-label="Toggle length unit"
            @click="toggleLengthUnit"
          >
            <span
              class="flex-1 text-center py-1.5 text-xs font-semibold transition-colors duration-150"
              :class="
                lengthUnit === 'cm'
                  ? 'bg-accent text-bg-dark font-bold'
                  : 'text-text-h-light dark:text-text-h-dark hover:bg-surface-light-hover/40 dark:hover:bg-surface-dark-hover/40'
              "
            >
              cm
            </span>
            <span
              class="flex-1 text-center py-1.5 text-xs font-semibold transition-colors duration-150"
              :class="
                lengthUnit === 'in'
                  ? 'bg-accent text-bg-dark font-bold'
                  : 'text-text-h-light dark:text-text-h-dark hover:bg-surface-light-hover/40 dark:hover:bg-surface-dark-hover/40'
              "
            >
              in
            </span>
          </button>
        </div>
      </div>

      <!-- Global RPE Matrix Card -->
      <div
        class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-6 shadow-sm flex flex-col"
      >
        <div class="flex items-start justify-between gap-4 mb-4">
          <div class="min-w-0">
            <h2
              class="text-lg font-bold text-text-h-light dark:text-text-h-dark flex items-center gap-2"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="text-accent"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="9" y1="9" x2="9" y2="21" />
              </svg>
              Global RPE Matrix
            </h2>
            <p
              class="text-xs text-text-light dark:text-text-dark opacity-60 mt-1"
            >
              Target % of 1RM per reps × RPE. Exercises without a custom
              override inherit these values.
            </p>
          </div>
        </div>

        <RpeMatrixTable :model-value="rpeMatrix" />
      </div>

      <!-- Danger Zone Card -->
      <div
        class="bg-red-500/10 border border-red-500/40 rounded-xl p-6 shadow-sm flex flex-col"
      >
        <h2
          class="text-lg font-bold text-red-500 mb-4 flex items-center gap-2"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          Danger Zone
        </h2>

        <div class="flex items-center justify-between">
          <div>
            <div class="font-semibold text-text-h-light dark:text-text-h-dark text-sm">
              Delete All Data
            </div>
            <p class="text-xs text-text-light dark:text-text-dark opacity-60 mt-0.5">
              Permanently wipes all plans, exercises, routines, workouts, and settings from this device.
            </p>
          </div>
          <button
            type="button"
            class="ml-4 shrink-0 rounded-lg border border-red-500 px-4 py-2 text-sm font-bold text-red-500 hover:bg-red-500 hover:text-white transition-colors duration-150 cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500"
            @click="showDeleteConfirm = true"
          >
            Delete All
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Step 1: initial confirmation -->
  <ConfirmDialog
    v-model:open="showDeleteConfirm"
    title="Delete all data?"
    message="This will permanently erase every plan, exercise, routine, workout, measurement, and setting stored on this device. This cannot be undone."
    confirm-label="Continue"
    cancel-label="Cancel"
    @confirm="onFirstConfirm"
  />

  <!-- Step 2: type-to-confirm dialog -->
  <Teleport to="body">
    <Transition name="confirm-fade">
      <div
        v-if="showDeleteTypeConfirm"
        class="fixed inset-0 z-[60] flex items-center justify-center p-6"
        role="alertdialog"
        aria-modal="true"
      >
        <div class="absolute inset-0 bg-black/50" @click="cancelTypeConfirm" />
        <div
          class="relative w-full max-w-sm flex flex-col gap-4 rounded-2xl border border-red-500/50 bg-bg-light dark:bg-bg-dark p-6 shadow-xl"
        >
          <div class="flex flex-col gap-2">
            <h2 class="text-lg font-bold text-red-500">Are you absolutely sure?</h2>
            <p class="text-sm leading-relaxed text-text-light dark:text-text-dark opacity-80">
              Type <span class="font-mono font-bold text-text-h-light dark:text-text-h-dark">yes I am sure</span> to confirm permanent deletion.
            </p>
          </div>
          <input
            v-model="deleteConfirmText"
            type="text"
            placeholder="yes I am sure"
            class="w-full rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark px-3 py-2.5 text-sm text-text-h-light dark:text-text-h-dark placeholder-text-light/40 dark:placeholder-text-dark/40 focus:outline-none focus:ring-2 focus:ring-red-500"
            @keydown.enter="deleteReady && deleteAllData()"
          />
          <div class="flex gap-3">
            <button
              class="flex-1 rounded-lg border border-border-light dark:border-border-dark py-2.5 text-sm font-bold text-text-light dark:text-text-dark transition-colors duration-150 hover:bg-surface-light dark:hover:bg-surface-dark cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent"
              @click="cancelTypeConfirm"
            >
              Cancel
            </button>
            <button
              class="flex-1 rounded-lg py-2.5 text-sm font-bold transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-red-500"
              :class="
                deleteReady
                  ? 'bg-red-500 text-white hover:bg-red-600 cursor-pointer'
                  : 'bg-red-500/30 text-white/50 cursor-not-allowed'
              "
              :disabled="!deleteReady"
              @click="deleteAllData"
            >
              Delete Everything
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.confirm-fade-enter-active,
.confirm-fade-leave-active {
  transition: opacity 0.2s ease;
}
.confirm-fade-enter-from,
.confirm-fade-leave-to {
  opacity: 0;
}
</style>
