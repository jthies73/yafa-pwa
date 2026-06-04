<script setup lang="ts">
import { ref, onMounted } from "vue";

const isDark = ref(false);
const weightUnit = ref("kg");
const distanceUnit = ref("km");

onMounted(() => {
  const savedTheme = localStorage.getItem("theme");
  isDark.value =
    savedTheme === "dark" ||
    (!savedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches);
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
  console.log(`Weight unit set to: ${unit}`);
};

const setDistanceUnit = (unit: string) => {
  distanceUnit.value = unit;
  console.log(`Distance unit set to: ${unit}`);
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
        Configure your preferences and view application info
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
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
            @click="toggleTheme"
            aria-label="Toggle dark mode"
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

      <!-- Application Info Card -->
      <div
        class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-6 shadow-sm flex flex-col justify-between"
      >
        <div>
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
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            System Information
          </h2>

          <div class="space-y-3.5">
            <div class="flex items-center justify-between text-sm">
              <span class="text-text-light dark:text-text-dark opacity-60"
                >App Name</span
              >
              <span class="font-bold text-text-h-light dark:text-text-h-dark"
                >Y A F A</span
              >
            </div>
            <div class="flex items-center justify-between text-sm">
              <span class="text-text-light dark:text-text-dark opacity-60"
                >Database status</span
              >
              <span
                class="font-bold text-green-500 dark:text-green-400 flex items-center gap-1.5"
              >
                <span
                  class="w-2 h-2 rounded-full bg-green-500 dark:bg-green-400"
                ></span>
                Connected (IndexedDB)
              </span>
            </div>
            <div class="flex items-center justify-between text-sm">
              <span class="text-text-light dark:text-text-dark opacity-60"
                >IndexedDB Wrapper</span
              >
              <span
                class="font-semibold text-text-h-light dark:text-text-h-dark"
                >Dexie.js v4.4.3</span
              >
            </div>
            <div class="flex items-center justify-between text-sm">
              <span class="text-text-light dark:text-text-dark opacity-60"
                >PWA Status</span
              >
              <span
                class="font-semibold text-text-h-light dark:text-text-h-dark"
                >Active (Offline Mode Ready)</span
              >
            </div>
          </div>
        </div>

        <div
          class="pt-6 border-t border-border-light dark:border-border-dark mt-6 text-center text-xs text-text-light dark:text-text-dark opacity-50 font-mono"
        >
          Yafa fitness companion v0.0.0
        </div>
      </div>
    </div>
  </div>
</template>
