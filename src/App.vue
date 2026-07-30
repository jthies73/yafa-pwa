<script setup lang="ts">
import { onMounted } from "vue";
import AppHeader from "./components/layout/AppHeader.vue";
import WorkoutBottomSheet from "./components/WorkoutBottomSheet.vue";
import WorkoutSummarySheet from "./components/summary/WorkoutSummarySheet.vue";
import NumericKeypad from "./components/NumericKeypad.vue";
import IntroSheet from "./components/IntroSheet.vue";
import { useActiveWorkout } from "./composables/useActiveWorkout";
import { useIntroSheet } from "./composables/useIntroSheet";
import { detectPlatform, isStandalone } from "./utils/platform";
import { api } from "./utils/api";

const { activeWorkout } = useActiveWorkout();
const { showIfFirstOpen } = useIntroSheet();

onMounted(() => {
  // 0. Show the first-open intro sheet exactly once per device
  showIfFirstOpen();

  // 1. Record page visit
  api.recordPageVisit(window.location.pathname);

  // 2. Record PWA install if running in standalone mode for the first time
  // (Crucial for iOS Safari which doesn't support the 'appinstalled' event)
  if (isStandalone() && !localStorage.getItem("pwa_install_recorded")) {
    const platform = detectPlatform().os;
    api
      .recordPwaInstall(platform)
      .then(() => {
        localStorage.setItem("pwa_install_recorded", "true");
      })
      .catch(() => {});
  }

  // Real-time appinstalled listener (supported by Chrome / Android)
  window.addEventListener("appinstalled", () => {
    if (!localStorage.getItem("pwa_install_recorded")) {
      const platform = detectPlatform().os;
      api
        .recordPwaInstall(platform)
        .then(() => {
          localStorage.setItem("pwa_install_recorded", "true");
        })
        .catch(() => {});
    }
  });
});
</script>

<template>
  <div
    class="flex flex-col min-h-screen w-full bg-bg-light dark:bg-bg-dark text-text-light dark:text-text-dark transition-colors duration-300 select-none"
  >
    <AppHeader />
    <main
      class="grow flex flex-col w-full relative"
      :class="[activeWorkout ? 'pb-24' : 'pb-[calc(1rem+env(safe-area-inset-bottom))]']"
    >
      <router-view />
    </main>
    <WorkoutBottomSheet />
    <WorkoutSummarySheet />
    <NumericKeypad />
    <IntroSheet />
  </div>
</template>
