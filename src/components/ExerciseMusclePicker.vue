<script setup lang="ts">
import { MUSCLE_GROUPS } from "../utils/constants";

const props = defineProps<{
  mode: "primary" | "secondary" | null;
  primarySelected: string[];
  secondarySelected: string[];
}>();

const emit = defineEmits<{
  (e: "toggle", group: string): void;
  (e: "back"): void;
}>();

const isSelected = (group: string) => {
  if (props.mode === "primary") {
    return props.primarySelected.includes(group);
  } else {
    return props.secondarySelected.includes(group);
  }
};
</script>

<template>
  <div class="w-full shrink-0 flex flex-col gap-4 px-5 py-5 pb-8">
    <div class="flex items-center gap-3">
      <button
        type="button"
        class="p-1 -ml-1 text-text-light dark:text-text-dark opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
        aria-label="Back to main form"
        @click="emit('back')"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M15 19l-7-7 7-7"
          />
        </svg>
      </button>
      <h3 class="font-bold text-lg text-text-h-light dark:text-text-h-dark">
        {{
          mode === "primary"
            ? "Primary Muscle Group"
            : "Secondary Muscle Groups"
        }}
      </h3>
    </div>

    <div class="flex flex-col gap-2 mt-2">
      <label
        v-for="group in MUSCLE_GROUPS"
        :key="group"
        class="flex items-center justify-between p-3.5 rounded-xl border border-border-light dark:border-border-dark cursor-pointer transition-colors"
        :class="
          isSelected(group)
            ? 'bg-accent/10 border-accent/30'
            : 'hover:bg-surface-light dark:hover:bg-surface-dark'
        "
      >
        <span
          class="text-sm font-semibold"
          :class="
            isSelected(group)
              ? 'text-accent'
              : 'text-text-h-light dark:text-text-h-dark'
          "
        >
          {{ group }}
        </span>
        <svg
          v-if="isSelected(group)"
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
          :checked="isSelected(group)"
          @change="emit('toggle', group)"
        />
      </label>
    </div>
  </div>
</template>
