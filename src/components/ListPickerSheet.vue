<script setup lang="ts">
import AppBottomSheet from "./AppBottomSheet.vue";

// Generic single-select bottom sheet for short option lists (muscle groups,
// measurement types, …) — the ExercisePickerSheet pattern without the search
// and create affordances.
export interface ListPickerOption {
  value: string;
  label: string;
  sub?: string;
}

defineProps<{
  title: string;
  options: ListPickerOption[];
}>();

const open = defineModel<boolean>("open", { required: true });

const emit = defineEmits<{
  (e: "select", value: string): void;
}>();
</script>

<template>
  <AppBottomSheet v-model:open="open" :title="title">
    <div
      v-if="options.length === 0"
      class="flex flex-col items-center justify-center py-16"
    >
      <p class="text-sm text-text-light dark:text-text-dark opacity-50">
        Nothing to select yet.
      </p>
    </div>

    <div
      v-for="option in options"
      :key="option.value"
      class="flex w-full items-center gap-3 border-b border-border-light dark:border-border-dark px-5 py-3.5 last:border-0 cursor-pointer transition-colors duration-150 hover:bg-surface-light dark:hover:bg-surface-dark"
      @click="emit('select', option.value)"
    >
      <div class="min-w-0 flex-1">
        <div
          class="truncate font-semibold text-sm text-text-h-light dark:text-text-h-dark"
        >
          {{ option.label }}
        </div>
      </div>
      <span
        v-if="option.sub"
        class="shrink-0 rounded-md border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark px-2 py-0.5 text-xs text-text-light dark:text-text-dark"
      >
        {{ option.sub }}
      </span>
    </div>

    <!-- Bottom padding for safe area -->
    <div class="h-6"></div>
  </AppBottomSheet>
</template>
