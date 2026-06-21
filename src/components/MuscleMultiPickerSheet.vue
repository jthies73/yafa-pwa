<script setup lang="ts">
import { MUSCLE_GROUPS } from "../utils/constants";
import AppBottomSheet from "./AppBottomSheet.vue";

// Multi-select muscle list (green-check pattern, mirrors ExerciseMusclePicker)
// for folding several groups into a single analytics chart. Kept separate from
// ExerciseMusclePicker, which is coupled to the exercise form's primary/
// secondary two-page layout.
defineProps<{
  selected: string[];
}>();

const open = defineModel<boolean>("open", { required: true });

const emit = defineEmits<{
  (e: "toggle", group: string): void;
}>();
</script>

<template>
  <AppBottomSheet v-model:open="open" title="Select Muscle Groups">
    <div class="flex flex-col gap-2 px-5 py-4">
      <label
        v-for="group in MUSCLE_GROUPS"
        :key="group"
        class="flex items-center justify-between p-3.5 rounded-xl border border-border-light dark:border-border-dark cursor-pointer transition-colors"
        :class="
          selected.includes(group)
            ? 'bg-accent/10 border-accent/30'
            : 'hover:bg-surface-light dark:hover:bg-surface-dark'
        "
      >
        <span
          class="text-sm font-semibold"
          :class="
            selected.includes(group)
              ? 'text-accent'
              : 'text-text-h-light dark:text-text-h-dark'
          "
        >
          {{ group }}
        </span>
        <svg
          v-if="selected.includes(group)"
          class="w-5 h-5 text-accent"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="3"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M5 13l4 4L19 7"
          />
        </svg>
        <input
          type="checkbox"
          class="sr-only"
          :checked="selected.includes(group)"
          @change="emit('toggle', group)"
        />
      </label>
    </div>

    <template #footer>
      <button
        class="flex-1 rounded-lg bg-accent py-3 text-sm font-bold text-bg-dark transition-colors duration-150 hover:bg-accent-hover cursor-pointer"
        @click="open = false"
      >
        Done
      </button>
    </template>
  </AppBottomSheet>
</template>
