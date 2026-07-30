<script setup lang="ts">
import { watch } from "vue";
import { useRouter } from "vue-router";
import AppBottomSheet from "./AppBottomSheet.vue";
import { useIntroSheet } from "../composables/useIntroSheet";
import { markIntroSeen } from "../config/intro";

type FeatureIcon = "c1rm" | "periodization" | "rpe-dial" | "layers" | "data";

interface Feature {
  icon: FeatureIcon;
  title: string;
  body: string;
}

const FEATURES: Feature[] = [
  {
    icon: "rpe-dial",
    title: "RPE + RPE Matrix",
    body: "Relies on RPE for autoregulation. Backed by a tuneable per-exercise RPE matrix.",
  },
  {
    icon: "layers",
    title: "Progression Models",
    body: "Linear, double progression, or top-set/back-off — set per lift.",
  },
  {
    icon: "periodization",
    title: "Mesocycles",
    body: "Define your mesocycle structure. Weekly target shifts; volume stays yours.",
  },
  {
    icon: "c1rm",
    title: "Analytics",
    body: "Fully customizable analytics and CSV exports.",
  },
  {
    icon: "data",
    title: "Data Ownership",
    body: "Everything runs offline. Your device. Your data. No accounts. (BACK UP YOUR DATA REGULARLY!!)",
  },
];

const { open } = useIntroSheet();
const router = useRouter();

// Any dismissal — backdrop, ESC, drag-down, or the CTA — counts as "seen."
// Idempotent on replay (menu → About), so no special-casing needed there.
watch(open, (isOpen) => {
  if (!isOpen) markIntroSeen(localStorage);
});

const goToPlans = () => {
  open.value = false;
  router.push({ name: "plans" });
};
</script>

<template>
  <AppBottomSheet v-model:open="open" title="Welcome to YAFA" fullHeight>
    <div class="flex flex-col gap-5 px-5 py-5">
      <div>
        <h2 class="text-xl font-bold text-text-h-light dark:text-text-h-dark">
          Autoregulation, not guesswork.
        </h2>
        <p class="text-sm text-text-light dark:text-text-dark opacity-70 mt-2">
          This app is not for beginners. It is aimed at lifters who already
          track RPE and want control over their training — not a canned program,
          not gamified.
        </p>
      </div>

      <ul class="flex flex-col gap-5">
        <li
          v-for="feature in FEATURES"
          :key="feature.title"
          class="flex items-start gap-3"
        >
          <span
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-light dark:bg-surface-dark text-accent"
          >
            <!-- c1RM: trending line -->
            <svg
              v-if="feature.icon === 'c1rm'"
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
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            <!-- Periodization: calendar-check -->
            <svg
              v-else-if="feature.icon === 'periodization'"
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
              <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
              <line x1="16" x2="16" y1="2" y2="6" />
              <line x1="8" x2="8" y1="2" y2="6" />
              <line x1="3" x2="21" y1="10" y2="10" />
              <path d="m9 16 2 2 4-4" />
            </svg>
            <!-- RPE dial: two independent sliders (target vs. ceiling) -->
            <svg
              v-else-if="feature.icon === 'rpe-dial'"
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
              <line x1="4" y1="8" x2="20" y2="8" />
              <circle cx="9" cy="8" r="2" fill="currentColor" stroke="none" />
              <line x1="4" y1="16" x2="20" y2="16" />
              <circle cx="16" cy="16" r="2" fill="currentColor" stroke="none" />
            </svg>
            <!-- Layers: per-exercise configurability -->
            <svg
              v-else-if="feature.icon === 'layers'"
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
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
            <!-- Data ownership: download tray -->
            <svg
              v-else
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
          </span>
          <div class="min-w-0 pt-0.5">
            <div
              class="font-semibold text-sm text-text-h-light dark:text-text-h-dark"
            >
              {{ feature.title }}
            </div>
            <p
              class="text-sm text-text-light dark:text-text-dark opacity-70 mt-0.5"
            >
              {{ feature.body }}
            </p>
          </div>
        </li>
      </ul>

      <div
        class="border-t border-border-light dark:border-border-dark pt-5 flex flex-col gap-1"
      >
        <span
          class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
        >
          Next step
        </span>
        <p class="text-sm text-text-h-light dark:text-text-h-dark">
          Build your first Plan.
        </p>
      </div>
    </div>

    <template #footer>
      <button
        class="flex-1 rounded-lg bg-accent py-3 text-sm font-bold text-bg-dark transition-colors duration-150 hover:bg-accent-hover cursor-pointer"
        @click="goToPlans"
      >
        Go to Plans
      </button>
    </template>
  </AppBottomSheet>
</template>
