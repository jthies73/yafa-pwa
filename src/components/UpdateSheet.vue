<script setup lang="ts">
import { watch } from "vue";
import AppBottomSheet from "./AppBottomSheet.vue";
import { useAppUpdate } from "../composables/useAppUpdate";

const open = defineModel<boolean>("open", { required: true });

const {
  currentVersion,
  latestVersion,
  releases,
  status,
  errorMessage,
  check,
  runUpdate,
} = useAppUpdate();

// Check for updates each time the sheet is opened.
watch(open, (isOpen) => {
  if (isOpen) check();
});

const close = () => {
  open.value = false;
};
</script>

<template>
  <AppBottomSheet v-model:open="open" title="Update" z-index="z-[55]">
    <div class="flex flex-col gap-5 px-5 py-5">
      <!-- Description -->
      <p class="text-sm text-text-light dark:text-text-dark opacity-70">
        YAFA is a fully offline PWA — it runs entirely on your device. Updating
        fetches the latest app code and runs any pending data migrations.
      </p>

      <!-- Version summary -->
      <div
        class="rounded-xl border border-border-light dark:border-border-dark divide-y divide-border-light dark:divide-border-dark overflow-hidden"
      >
        <div class="flex items-center justify-between px-4 py-3">
          <span
            class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
          >
            Current version
          </span>
          <span
            class="text-sm font-mono font-semibold text-text-h-light dark:text-text-h-dark"
          >
            {{ currentVersion }}
          </span>
        </div>
        <div class="flex items-center justify-between px-4 py-3">
          <span
            class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
          >
            Latest version
          </span>
          <span
            class="text-sm font-mono font-semibold text-text-h-light dark:text-text-h-dark"
          >
            {{ latestVersion ?? "—" }}
          </span>
        </div>
        <div v-if="releases && releases.length > 0" class="divide-y divide-border-light dark:divide-border-dark border-t border-border-light dark:border-border-dark">
          <div v-for="release in releases" :key="release.version" class="px-4 py-3 bg-surface-light-hover dark:bg-surface-dark-hover">
            <span class="block text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60 mb-2">
              Version {{ release.version }}
            </span>
            <p class="text-sm text-text-h-light dark:text-text-h-dark whitespace-pre-wrap">{{ release.notes }}</p>
          </div>
        </div>
      </div>

      <!-- Status -->
      <div class="flex items-center gap-3 px-1 min-h-6">
        <!-- Checking -->
        <template v-if="status === 'checking'">
          <span
            class="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin shrink-0"
          />
          <span class="text-sm text-text-light dark:text-text-dark"
            >Checking for updates…</span
          >
        </template>

        <!-- Up to date -->
        <template v-else-if="status === 'up-to-date'">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="text-accent shrink-0"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <span class="text-sm text-text-h-light dark:text-text-h-dark">
            The application is up to date.
          </span>
        </template>

        <!-- Update available -->
        <template v-else-if="status === 'available'">
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
            class="text-accent shrink-0"
          >
            <path d="M12 16v-8" />
            <path d="m8 12 4 4 4-4" />
            <path d="M3 20h18" />
          </svg>
          <span class="text-sm text-text-h-light dark:text-text-h-dark">
            A new version is available.
          </span>
        </template>

        <!-- Updating -->
        <template v-else-if="status === 'updating'">
          <span
            class="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin shrink-0"
          />
          <span class="text-sm text-text-light dark:text-text-dark">
            Updating…
          </span>
        </template>

        <!-- Error -->
        <template v-else-if="status === 'error'">
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
            class="text-red-500 shrink-0"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span class="text-sm text-red-500">
            {{ errorMessage ?? "Update failed." }}
          </span>
        </template>
      </div>
    </div>

    <template #footer>
      <button
        v-if="status === 'available' || status === 'updating'"
        class="flex-1 rounded-lg bg-accent py-3 text-sm font-bold text-bg-dark transition-colors duration-150 hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
        :disabled="status === 'updating'"
        @click="runUpdate"
      >
        {{ status === "updating" ? "Updating…" : "Update now" }}
      </button>
      <button
        v-else
        class="flex-1 rounded-lg border border-border-light dark:border-border-dark py-3 text-sm font-bold text-text-light dark:text-text-dark transition-colors duration-150 hover:bg-surface-light dark:hover:bg-surface-dark cursor-pointer"
        @click="close"
      >
        Close
      </button>
    </template>
  </AppBottomSheet>
</template>
