<script setup lang="ts">
import { ref } from "vue";

defineProps<{
  index: number;
  state: "finished" | "current" | "upcoming";
}>();

const emit = defineEmits<{
  (e: "toggle"): void;
  // Fired when Enter is pressed on the weight field — parent handles focusing
  // the next row and optionally completing the set.
  (e: "complete"): void;
}>();

const reps = defineModel<string>("reps", { default: "" });
const weight = defineModel<string>("weight", { default: "" });

const repsInput = ref<HTMLInputElement | null>(null);
const weightInput = ref<HTMLInputElement | null>(null);

function focusReps() {
  repsInput.value?.focus();
}

defineExpose({ focusReps });

function onRepsEnter(e: KeyboardEvent) {
  e.preventDefault();
  weightInput.value?.focus();
}

function onWeightEnter(e: KeyboardEvent) {
  e.preventDefault();
  emit("complete");
}
</script>

<template>
  <div class="flex items-center gap-2.5">
    <!-- Set index -->
    <span
      class="w-5 shrink-0 text-center text-xs font-mono font-bold text-text-light dark:text-text-dark opacity-50"
    >
      {{ index }}
    </span>

    <!-- Reps -->
    <input
      ref="repsInput"
      v-model="reps"
      type="text"
      inputmode="numeric"
      placeholder="reps"
      class="min-w-0 flex-1 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg px-2.5 py-2 text-sm font-mono text-center text-text-h-light dark:text-text-h-dark placeholder-text-light/40 dark:placeholder-text-dark/40 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50"
      @keydown.enter="onRepsEnter"
    />

    <span class="text-xs text-text-light dark:text-text-dark opacity-30"
      >×</span
    >

    <!-- Weight -->
    <input
      ref="weightInput"
      v-model="weight"
      type="text"
      inputmode="decimal"
      placeholder="kg"
      class="min-w-0 flex-1 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg px-2.5 py-2 text-sm font-mono text-center text-text-h-light dark:text-text-h-dark placeholder-text-light/40 dark:placeholder-text-dark/40 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50"
      @keydown.enter="onWeightEnter"
    />

    <!-- Checkmark -->
    <div class="w-9 shrink-0 flex justify-center">
      <!-- Current set: prominent accent action -->
      <button
        v-if="state === 'current'"
        type="button"
        class="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-bg-dark hover:bg-accent/90 cursor-pointer transition-colors duration-150"
        title="Mark set complete"
        @click="$emit('toggle')"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </button>

      <!-- Finished set: muted, no background -->
      <button
        v-else-if="state === 'finished'"
        type="button"
        class="flex h-9 w-9 items-center justify-center rounded-lg text-text-light dark:text-text-dark opacity-40 hover:opacity-70 cursor-pointer transition-opacity duration-150"
        title="Undo set"
        @click="$emit('toggle')"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </button>

      <!-- Upcoming set: empty placeholder for alignment -->
      <div v-else class="h-9 w-9" />
    </div>
  </div>
</template>
