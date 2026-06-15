<script setup lang="ts">
import { onMounted } from "vue";
import AppHeader from "./components/layout/AppHeader.vue";
import WorkoutBottomSheet from "./components/WorkoutBottomSheet.vue";
import WorkoutSummarySheet from "./components/summary/WorkoutSummarySheet.vue";
import NumericKeypad from "./components/NumericKeypad.vue";
import { useActiveWorkout } from "./composables/useActiveWorkout";

const { activeWorkout } = useActiveWorkout();

onMounted(() => {
  if (['development', 'staging', 'production'].includes(import.meta.env.MODE)) {
    const baseUrl = import.meta.env.VITE_API_BASE_URL;
    if (baseUrl) {
      fetch(`${baseUrl}/page-visits`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path: window.location.pathname }),
      }).catch(() => {});
    }
  }
});
</script>

<template>
  <div
    class="flex flex-col min-h-screen w-full bg-bg-light dark:bg-bg-dark text-text-light dark:text-text-dark transition-colors duration-300 select-none"
  >
    <AppHeader />
    <main
      class="grow flex flex-col w-full relative"
      :class="{ 'pb-24': activeWorkout }"
    >
      <router-view />
    </main>
    <WorkoutBottomSheet />
    <WorkoutSummarySheet />
    <NumericKeypad />
  </div>
</template>
