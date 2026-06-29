<script setup lang="ts">
import { computed } from "vue";

// A simple colored arrow for target shifts.
// It accepts a 'direction' prop: 'up' or 'down', an optional 'count' prop (1 or 2), and optional 'color'.
interface Props {
  direction: "up" | "down";
  count?: number; // 1 or 2
  color?: "green" | "red";
}

const props = withDefaults(defineProps<Props>(), {
  count: 1,
  color: undefined,
});

const colorClass = computed(() => {
  const c = props.color ?? (props.direction === "up" ? "red" : "green");
  return c === "green"
    ? "text-green-600 dark:text-green-400"
    : "text-red-600 dark:text-red-400";
});
</script>

<template>
  <span class="inline-flex items-center gap-0.5" :class="colorClass">
    <svg
      v-for="i in count"
      :key="i"
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="align-middle"
    >
      <template v-if="direction === 'up'">
        <line x1="12" y1="19" x2="12" y2="5"></line>
        <polyline points="5 12 12 5 19 12"></polyline>
      </template>
      <template v-else>
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <polyline points="19 12 12 19 5 12"></polyline>
      </template>
    </svg>
  </span>
</template>
