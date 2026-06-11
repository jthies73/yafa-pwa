<script setup lang="ts">
defineProps<{ locked: boolean }>();
const emit = defineEmits<{ (e: "toggle"): void }>();
</script>

<template>
  <button
    type="button"
    :class="
      locked
        ? 'text-accent hover:text-accent/80'
        : 'text-text-light dark:text-text-dark opacity-40 hover:opacity-70'
    "
    class="shrink-0 cursor-pointer transition-colors duration-150"
    :title="
      locked
        ? 'Locked — periodization will not modify this field'
        : 'Unlocked — periodization may modify this field'
    "
    @click="emit('toggle')"
  >
    <!-- Closed padlock when locked, open padlock when unlocked -->
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
      <path v-if="locked" d="M7 11V7a5 5 0 0 1 10 0v4"></path>
      <path v-else d="M7 11V7a5 5 0 0 1 9.9-1"></path>
    </svg>
  </button>
</template>
