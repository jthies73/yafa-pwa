<script setup lang="ts">
import type { Plan, Routine } from "../db/types";

defineProps<{
  plan: Plan;
  routines: Routine[];
}>();

defineEmits<{
  (e: "click"): void;
}>();
</script>

<template>
  <div
    class="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark shadow-sm overflow-hidden flex flex-col cursor-pointer transition-colors duration-150 hover:bg-surface-light-hover dark:hover:bg-surface-dark-hover"
    @click="$emit('click')"
  >
    <!-- Card Header -->
    <div class="p-5 border-b border-border-light dark:border-border-dark">
      <div class="flex items-start justify-between mb-2">
        <h3
          class="text-xl font-bold text-text-h-light dark:text-text-h-dark truncate pr-4"
        >
          {{ plan.name }}
        </h3>
        <span
          v-if="plan.active"
          class="px-2 py-1 text-xs font-semibold bg-accent/20 text-accent rounded-md uppercase tracking-wider"
        >
          Active
        </span>
      </div>
      <p
        v-if="plan.description"
        class="text-sm text-text-light dark:text-text-dark opacity-80 line-clamp-2"
      >
        {{ plan.description }}
      </p>
    </div>

    <!-- Routines List Section -->
    <div class="p-5 bg-black/5 dark:bg-white/5 flex-grow">
      <h4
        class="text-xs font-semibold text-text-light dark:text-text-dark uppercase tracking-wider mb-3 opacity-60"
      >
        Routines
      </h4>
      <ul class="space-y-2">
        <li
          v-for="routine in routines"
          :key="routine.id"
          class="flex items-center gap-2 text-sm text-text-h-light dark:text-text-h-dark"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-accent"></span>
          {{ routine.name }}
        </li>
        <li
          v-if="routines.length === 0"
          class="text-sm italic opacity-50 text-text-light dark:text-text-dark"
        >
          No routines configured for this plan.
        </li>
      </ul>
    </div>
  </div>
</template>
