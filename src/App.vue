<script setup lang="ts">
import AppHeader from "./components/layout/AppHeader.vue";
import WorkoutBottomSheet from "./components/WorkoutBottomSheet.vue";
import { useActiveWorkout } from "./composables/useActiveWorkout";

const { activeWorkout } = useActiveWorkout();
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
  </div>
</template>
