<script setup lang="ts">
import { ref } from "vue";
import { db } from "../db/db";
import type { Exercise } from "../db/types";
import { createExercise, type ExerciseInput } from "../db/repository";
import ExercisePickerSheet from "./ExercisePickerSheet.vue";
import ExerciseFormSheet from "./ExerciseFormSheet.vue";

// ── UI scaffold state ────────────────────────────────────────────────────────
// The third variable is computed from the other two by the (upcoming) calc
// engine. For now this is purely the input structure.
const selected = ref<Exercise | null>(null);
const reps = ref("");
const weight = ref("");
const rpe = ref<number | null>(null);

const showPicker = ref(false);
const showForm = ref(false);

// Standard RPE scale: 6 → 10 in half-point steps.
const RPE_VALUES = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];

const weightInput = ref<HTMLInputElement | null>(null);

// ── Input validation ─────────────────────────────────────────────────────────

const PASS = ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Tab"];

function onRepsKeydown(e: KeyboardEvent) {
  if (e.key === "Enter") { e.preventDefault(); weightInput.value?.focus(); return; }
  if (e.ctrlKey || e.metaKey) return;
  if (PASS.includes(e.key)) return;
  if (!/^\d$/.test(e.key)) e.preventDefault();
}

function onWeightKeydown(e: KeyboardEvent) {
  if (e.ctrlKey || e.metaKey) return;
  if (PASS.includes(e.key)) return;
  if (e.key === "." && !(e.target as HTMLInputElement).value.includes(".")) return;
  if (!/^\d$/.test(e.key)) e.preventDefault();
}

function onRepsBlur() {
  const n = parseInt(reps.value, 10);
  reps.value = n >= 1 ? String(Math.min(n, 999)) : "";
}

function onWeightBlur() {
  const n = parseFloat(weight.value);
  weight.value = n > 0 ? String(Math.round(n * 100) / 100) : "";
}

const onSelect = (exercise: Exercise) => {
  selected.value = exercise;
  showPicker.value = false;
};

const onCreate = () => {
  showPicker.value = false;
  showForm.value = true;
};

const onSaveNew = async (input: ExerciseInput) => {
  const id = await createExercise(input);
  selected.value = (await db.exercises.get(id)) ?? null;
  showForm.value = false;
};

// Tapping the active RPE clears it (it is the optional third variable).
const selectRpe = (value: number) => {
  rpe.value = rpe.value === value ? null : value;
};
</script>

<template>
  <div class="flex flex-col gap-6 p-5 select-none">
    <div>
      <p
        class="text-xs font-semibold uppercase tracking-wider text-text-light dark:text-text-dark opacity-50"
      >
        Calculator
      </p>
      <p class="text-sm text-text-light dark:text-text-dark opacity-60 mt-0.5">
        Work out a single set. Enter any two values — the third is calculated.
      </p>
    </div>

    <!-- Exercise selector -->
    <div class="flex flex-col gap-1.5">
      <label
        class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
      >
        Exercise
      </label>
      <button
        type="button"
        class="flex items-center justify-between gap-3 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg px-3 py-2.5 text-left cursor-pointer hover:bg-surface-light-hover dark:hover:bg-surface-dark-hover transition-colors duration-150"
        @click="showPicker = true"
      >
        <span
          class="truncate text-sm font-semibold"
          :class="
            selected
              ? 'text-text-h-light dark:text-text-h-dark'
              : 'text-text-light dark:text-text-dark opacity-50'
          "
        >
          {{ selected?.name || "Select an exercise" }}
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="shrink-0 text-text-light dark:text-text-dark opacity-50"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>

    <!-- Reps + Weight -->
    <div class="grid grid-cols-2 gap-4">
      <div class="flex flex-col gap-1.5">
        <label
          class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
        >
          Reps
        </label>
        <input
          v-model="reps"
          type="text"
          inputmode="numeric"
          placeholder="—"
          class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg px-3 py-2.5 text-sm font-mono text-text-h-light dark:text-text-h-dark placeholder-text-light/40 dark:placeholder-text-dark/40 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50"
          @keydown="onRepsKeydown"
          @blur="onRepsBlur"
        />
      </div>
      <div class="flex flex-col gap-1.5">
        <label
          class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
        >
          Weight (kg)
        </label>
        <input
          ref="weightInput"
          v-model="weight"
          type="text"
          inputmode="decimal"
          placeholder="—"
          class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg px-3 py-2.5 text-sm font-mono text-text-h-light dark:text-text-h-dark placeholder-text-light/40 dark:placeholder-text-dark/40 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50"
          @keydown="onWeightKeydown"
          @blur="onWeightBlur"
        />
      </div>
    </div>

    <!-- Target RPE -->
    <div class="flex flex-col gap-2">
      <label
        class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
      >
        Target RPE
      </label>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="value in RPE_VALUES"
          :key="value"
          type="button"
          :class="
            rpe === value
              ? 'bg-accent text-bg-dark border-accent'
              : 'bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark border-border-light dark:border-border-dark hover:text-text-h-light dark:hover:text-text-h-dark'
          "
          class="min-w-[2.75rem] flex-1 rounded-lg border px-2 py-2 text-xs font-bold font-mono cursor-pointer transition-colors duration-150"
          @click="selectRpe(value)"
        >
          {{ value }}
        </button>
      </div>
    </div>
  </div>

  <ExercisePickerSheet
    v-model:open="showPicker"
    @select="onSelect"
    @create="onCreate"
  />

  <ExerciseFormSheet
    v-model:open="showForm"
    :is-editing="false"
    @save="onSaveNew"
  />
</template>
