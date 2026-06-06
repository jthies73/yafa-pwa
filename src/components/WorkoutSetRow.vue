<script setup lang="ts">
import { ref, computed } from "vue";
import {
  guardRepsKey,
  guardWeightKey,
  sanitizeReps,
  sanitizeWeight,
} from "../utils/numericInput";

defineProps<{
  index: number;
  state: "finished" | "current" | "upcoming";
}>();

const emit = defineEmits<{
  (e: "toggle"): void;
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

const repsValid = computed(() => parseInt(reps.value, 10) >= 1);
const weightValid = computed(() => parseFloat(weight.value) > 0);
const canComplete = computed(() => repsValid.value && weightValid.value);

const repsError = ref(false);
const weightError = ref(false);
let repsTimer = 0;
let weightTimer = 0;

function flashErrors() {
  if (!repsValid.value) {
    clearTimeout(repsTimer);
    repsError.value = true;
    repsTimer = window.setTimeout(() => {
      repsError.value = false;
    }, 600);
  }
  if (!weightValid.value) {
    clearTimeout(weightTimer);
    weightError.value = true;
    weightTimer = window.setTimeout(() => {
      weightError.value = false;
    }, 600);
  }
  if (!repsValid.value) repsInput.value?.focus();
  else weightInput.value?.focus();
}

function tryComplete() {
  if (canComplete.value) emit("complete");
  else flashErrors();
}

function tryToggle() {
  if (canComplete.value) emit("toggle");
  else flashErrors();
}

function onRepsKeydown(e: KeyboardEvent) {
  if (e.key === "Enter") {
    e.preventDefault();
    weightInput.value?.focus();
    return;
  }
  guardRepsKey(e);
}

function onWeightKeydown(e: KeyboardEvent) {
  if (e.key === "Enter") {
    e.preventDefault();
    tryComplete();
    return;
  }
  guardWeightKey(e);
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
      class="min-w-0 flex-1 bg-surface-light dark:bg-surface-dark border rounded-lg px-2.5 py-2 text-sm font-mono text-center text-text-h-light dark:text-text-h-dark placeholder-text-light/40 dark:placeholder-text-dark/40 focus:outline-none focus:ring-2 transition-colors duration-150"
      :class="
        repsError
          ? 'border-red-500 dark:border-red-400 focus:border-red-500 focus:ring-red-500/20'
          : 'border-border-light dark:border-border-dark focus:border-accent/50 focus:ring-accent/40'
      "
      @keydown="onRepsKeydown"
      @blur="reps = sanitizeReps(reps)"
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
      class="min-w-0 flex-1 bg-surface-light dark:bg-surface-dark border rounded-lg px-2.5 py-2 text-sm font-mono text-center text-text-h-light dark:text-text-h-dark placeholder-text-light/40 dark:placeholder-text-dark/40 focus:outline-none focus:ring-2 transition-colors duration-150"
      :class="
        weightError
          ? 'border-red-500 dark:border-red-400 focus:border-red-500 focus:ring-red-500/20'
          : 'border-border-light dark:border-border-dark focus:border-accent/50 focus:ring-accent/40'
      "
      @keydown="onWeightKeydown"
      @blur="weight = sanitizeWeight(weight)"
    />

    <!-- Checkmark -->
    <div class="w-9 shrink-0 flex justify-center">
      <!-- Current set -->
      <button
        v-if="state === 'current'"
        type="button"
        class="flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-150 cursor-pointer"
        :class="
          canComplete
            ? 'bg-accent text-bg-dark hover:bg-accent/90'
            : 'bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark text-text-light dark:text-text-dark opacity-40'
        "
        title="Mark set complete"
        @click="tryToggle"
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

      <!-- Finished set -->
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

      <div v-else class="h-9 w-9" />
    </div>
  </div>
</template>
