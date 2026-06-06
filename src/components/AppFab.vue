<script setup lang="ts">
import { useActiveWorkout } from "../composables/useActiveWorkout";

defineProps<{
  label?: string;
}>();

defineEmits<{
  (e: "click"): void;
}>();

const { activeWorkout } = useActiveWorkout();
</script>

<template>
  <button
    class="fixed right-6 bg-accent hover:bg-accent/90 text-bg-dark font-bold px-5 py-3 rounded-full shadow-lg shadow-accent/10 flex items-center gap-2 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent z-40 cursor-pointer tracking-wide"
    :class="activeWorkout ? 'bottom-28' : 'bottom-6'"
    :aria-label="label"
    @click="$emit('click')"
  >
    <!-- Default Plus Icon -->
    <slot name="icon">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
    </slot>
    <span v-if="label" class="text-sm font-semibold uppercase tracking-wider">
      {{ label }}
    </span>
  </button>
</template>
