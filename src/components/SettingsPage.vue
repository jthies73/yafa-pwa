<script setup lang="ts">
import { ref, onMounted } from "vue";
import { DEFAULT_RPE_MATRIX } from "../db/rpeMatrix";
import RpeMatrixTable from "./RpeMatrixTable.vue";

const isDark = ref(false);
const weightUnit = ref("kg");
const distanceUnit = ref("km");

const rpeMatrix = DEFAULT_RPE_MATRIX;

onMounted(() => {
  const savedTheme = localStorage.getItem("theme");
  isDark.value =
    savedTheme === "dark" ||
    (!savedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches);

  weightUnit.value = localStorage.getItem("yafa:weightUnit") ?? "kg";
  distanceUnit.value = localStorage.getItem("yafa:distanceUnit") ?? "km";
});

const toggleTheme = () => {
  isDark.value = !isDark.value;
  if (isDark.value) {
    document.documentElement.classList.add("dark");
    localStorage.setItem("theme", "dark");
  } else {
    document.documentElement.classList.remove("dark");
    localStorage.setItem("theme", "light");
  }
};

const setWeightUnit = (unit: string) => {
  weightUnit.value = unit;
  localStorage.setItem("yafa:weightUnit", unit);
};

const setDistanceUnit = (unit: string) => {
  distanceUnit.value = unit;
  localStorage.setItem("yafa:distanceUnit", unit);
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
            <div class="text-xs text-text-light dark:text-text-dark opacity-60">
              Enable dark theme styling
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
            <div class="text-xs text-text-light dark:text-text-dark opacity-60">
              Preferred system for exercises
            </div>
          </div>
          <div
            class="flex items-center border border-border-light dark:border-border-dark rounded-lg overflow-hidden bg-black/5 dark:bg-white/5"
          >
            <button
              class="px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors duration-150"
              :class="
                weightUnit === 'kg'
                  ? 'bg-accent text-bg-dark'
                  : 'text-text-h-light dark:text-text-h-dark hover:bg-surface-light-hover dark:hover:bg-surface-dark-hover'
              "
              @click="setWeightUnit('kg')"
            >
              kg
            </button>
            <button
              class="px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors duration-150"
              :class="
                weightUnit === 'lbs'
                  ? 'bg-accent text-bg-dark'
                  : 'text-text-h-light dark:text-text-h-dark hover:bg-surface-light-hover dark:hover:bg-surface-dark-hover'
              "
              @click="setWeightUnit('lbs')"
            >
              lbs
            </button>
          </div>
        </div>

        <!-- Distance Units -->
        <div class="flex items-center justify-between py-3">
          <div>
            <div
              class="font-semibold text-text-h-light dark:text-text-h-dark text-sm sm:text-base"
            >
              Distance Units
            </div>
            <div class="text-xs text-text-light dark:text-text-dark opacity-60">
              Preferred system for cardio
            </div>
          </div>
          <div
            class="flex items-center border border-border-light dark:border-border-dark rounded-lg overflow-hidden bg-black/5 dark:bg-white/5"
          >
            <button
              class="px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors duration-150"
              :class="
                distanceUnit === 'km'
                  ? 'bg-accent text-bg-dark'
                  : 'text-text-h-light dark:text-text-h-dark hover:bg-surface-light-hover dark:hover:bg-surface-dark-hover'
              "
              @click="setDistanceUnit('km')"
            >
              km
            </button>
            <button
              class="px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors duration-150"
              :class="
                distanceUnit === 'mi'
                  ? 'bg-accent text-bg-dark'
                  : 'text-text-h-light dark:text-text-h-dark hover:bg-surface-light-hover dark:hover:bg-surface-dark-hover'
              "
              @click="setDistanceUnit('mi')"
            >
              mi
            </button>
          </div>
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
    </div>
  </div>
</template>
