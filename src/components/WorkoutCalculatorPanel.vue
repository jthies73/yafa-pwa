<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { db } from "../db/db";
import type { Exercise, Set as LoggedSet, RpeMatrix } from "../db/types";
import { DEFAULT_RPE_MATRIX } from "../db/rpeMatrix";
import { createExercise, type ExerciseInput } from "../db/repository";
import {
  guardRepsKey,
  guardWeightKey,
  sanitizeReps,
  sanitizeWeight,
} from "../utils/numericInput";
import { useWeightUnit } from "../composables/useWeightUnit";
import { useActiveWorkout } from "../composables/useActiveWorkout";
import { solveWeight, solveReps, solveRpe } from "../engine/calculator";
import { impliedE1rm } from "../engine/matrix";
import ExercisePickerSheet from "./ExercisePickerSheet.vue";
import ExerciseFormSheet from "./ExerciseFormSheet.vue";

const { label: weightUnit, toKg, format } = useWeightUnit();
const { logCalculatorSet, removeCalculatorSet, calculatorSets } =
  useActiveWorkout();

// ── Exercise selection ────────────────────────────────────────────────────────

const selected = ref<Exercise | null>(null);
const showPicker = ref(false);
const showForm = ref(false);

const matrix = computed<RpeMatrix>(
  () => selected.value?.rpeMatrix ?? DEFAULT_RPE_MATRIX,
);

// The persisted working e1RM was removed with the engine teardown; until the
// engine is rewritten the calculator anchors only to this session's logged sets.
const sessionE1rm = computed(() => {
  if (!selected.value) return null;
  const sets = calculatorSets.value.filter(
    (cs) => cs.exerciseId === selected.value!.id,
  );
  return sets.length ? sets[sets.length - 1].e1rm : null;
});

const effectiveE1rm = computed(() => sessionE1rm.value);

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

// ── Inputs ────────────────────────────────────────────────────────────────────

const RPE_VALUES = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];

const reps = ref("");
const weight = ref("");
const rpe = ref<number | null>(null);

const repsNum = computed(() => {
  const n = parseInt(reps.value, 10);
  return Number.isFinite(n) && n >= 1 ? n : null;
});
const weightNum = computed(() => {
  const n = parseFloat(weight.value);
  return Number.isFinite(n) && n > 0 ? n : null;
});

function onRepsKeydown(e: KeyboardEvent) {
  if (e.key === "Enter") {
    e.preventDefault();
    (e.target as HTMLElement).blur();
    return;
  }
  guardRepsKey(e);
}

function onWeightKeydown(e: KeyboardEvent) {
  if (e.key === "Enter") {
    e.preventDefault();
    (e.target as HTMLElement).blur();
    return;
  }
  guardWeightKey(e);
}

// ── Calculation ───────────────────────────────────────────────────────────────

interface CalcResult {
  reps: number;
  rpe: number;
  weightKg: number; // resolved weight in kg
  e1rm: number;
}

/** Which dimension is absent when exactly two of three are filled. */
const missing = computed<"reps" | "weight" | "rpe" | null>(() => {
  const has = [
    repsNum.value != null,
    weightNum.value != null,
    rpe.value != null,
  ];
  if (has.filter(Boolean).length !== 2) return null;
  if (!has[0]) return "reps";
  if (!has[1]) return "weight";
  return "rpe";
});

const calc = computed<CalcResult | null>(() => {
  const e1rm = effectiveE1rm.value;
  if (!e1rm || !missing.value) return null;

  const m = matrix.value;
  let r = repsNum.value;
  let rp = rpe.value;
  let weightKg: number;

  if (missing.value === "weight") {
    weightKg = solveWeight(m, e1rm, r!, rp!);
  } else if (missing.value === "reps") {
    weightKg = toKg(weightNum.value!);
    r = solveReps(m, e1rm, weightKg, rp!);
  } else {
    weightKg = toKg(weightNum.value!);
    rp = solveRpe(m, e1rm, weightKg, r!);
  }

  return { reps: r!, rpe: rp!, weightKg, e1rm };
});

const allFilled = computed(() => {
  return (
    repsNum.value !== null && weightNum.value !== null && rpe.value !== null
  );
});

const manualE1rm = computed(() => {
  if (
    !selected.value ||
    repsNum.value === null ||
    weightNum.value === null ||
    rpe.value === null
  ) {
    return null;
  }
  return impliedE1rm(
    matrix.value,
    toKg(weightNum.value),
    repsNum.value,
    rpe.value,
  );
});

// ── Actual confirmation ───────────────────────────────────────────────────────

// After calculation the user must confirm their actual performed value for the
// calculated dimension before logging. The fields are auto-prefilled with the
// prediction but remain editable.
const actualText = ref(""); // weight or reps
const actualRpeChip = ref<number | null>(null); // rpe

watch(missing, (next, prev) => {
  if (next === prev) return;
  actualText.value = "";
  actualRpeChip.value = null;
});

watch(calc, (c) => {
  if (!c || !missing.value) return;
  if (missing.value === "rpe" && actualRpeChip.value === null) {
    actualRpeChip.value = c.rpe;
  } else if (missing.value === "reps" && actualText.value === "") {
    actualText.value = String(c.reps);
  }
});

const canLog = computed(() => {
  if (selected.value && allFilled.value) return true;
  if (!calc.value || !missing.value || !selected.value) return false;
  if (missing.value === "weight") return true; // weight is fixed — log immediately
  if (missing.value === "rpe") return actualRpeChip.value !== null;
  const n = parseInt(actualText.value, 10);
  return Number.isFinite(n) && n >= 1;
});

// ── Log set ───────────────────────────────────────────────────────────────────

const onLogSet = () => {
  if (!selected.value || !canLog.value) return;

  let actualReps: number;
  let actualWeight: number;
  let actualRpe: number;
  let targetReps: number;
  let targetWeight: number;
  let targetRpe: number;
  let e1rm: number;

  if (allFilled.value) {
    actualReps = repsNum.value!;
    actualWeight = toKg(weightNum.value!);
    actualRpe = rpe.value!;
    targetReps = repsNum.value!;
    targetWeight = toKg(weightNum.value!);
    targetRpe = rpe.value!;
    e1rm = effectiveE1rm.value ?? manualE1rm.value ?? 0;
  } else {
    if (!calc.value || !missing.value) return;
    const {
      reps: calcReps,
      weightKg,
      rpe: calcRpe,
      e1rm: calcE1rm,
    } = calc.value;
    targetReps = calcReps;
    targetWeight = weightKg;
    targetRpe = calcRpe;
    e1rm = calcE1rm;

    if (missing.value === "weight") {
      actualReps = repsNum.value!;
      actualWeight = weightKg; // calculated weight is fixed — load the bar to this
      actualRpe = rpe.value!;
    } else if (missing.value === "reps") {
      actualReps = parseInt(actualText.value, 10);
      actualWeight = toKg(weightNum.value!);
      actualRpe = rpe.value!;
    } else {
      actualReps = repsNum.value!;
      actualWeight = toKg(weightNum.value!);
      actualRpe = actualRpeChip.value!;
    }
  }

  const set: LoggedSet = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    targetReps,
    actualReps,
    targetWeight,
    actualWeight,
    targetRpe,
    actualRpe,
    failure: false,
  };

  logCalculatorSet({
    exerciseId: selected.value.id,
    exerciseName: selected.value.name,
    e1rm,
    set,
  });

  reps.value = "";
  weight.value = "";
  rpe.value = null;
  actualText.value = "";
  actualRpeChip.value = null;
};
</script>

<template>
  <div class="flex flex-col gap-6 p-5 select-none">
    <!-- Header -->
    <div>
      <p
        class="text-xs font-semibold uppercase tracking-wider text-text-light dark:text-text-dark opacity-50"
      >
        Calculator
      </p>
      <p class="mt-0.5 text-sm text-text-light dark:text-text-dark opacity-60">
        Enter any two values — the third is calculated.
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
        class="flex items-center justify-between gap-3 rounded-lg border border-border-light bg-surface-light px-3 py-2.5 text-left transition-colors duration-150 cursor-pointer hover:bg-surface-light-hover dark:border-border-dark dark:bg-surface-dark dark:hover:bg-surface-dark-hover"
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

    <!-- No e1RM calibration notice -->
    <div
      v-if="selected && effectiveE1rm === null"
      class="flex items-start gap-2.5 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2.5"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="mt-0.5 shrink-0 text-amber-500"
      >
        <path
          d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
        />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      <p class="text-xs leading-relaxed text-amber-600 dark:text-amber-400">
        No history yet. Log an initial set in the Tracker to calibrate the
        calculator for this exercise.
      </p>
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
          v-numpad="'integer'"
          type="text"
          inputmode="numeric"
          placeholder="—"
          class="rounded-lg border border-border-light bg-surface-light px-3 py-2.5 font-mono text-sm text-text-h-light placeholder-text-light/40 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/40 dark:border-border-dark dark:bg-surface-dark dark:text-text-h-dark dark:placeholder-text-dark/40"
          @keydown="onRepsKeydown"
          @blur="reps = sanitizeReps(reps)"
        />
      </div>
      <div class="flex flex-col gap-1.5">
        <label
          class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
        >
          Weight ({{ weightUnit }})
        </label>
        <input
          ref="weightInput"
          v-model="weight"
          v-numpad="'decimal'"
          type="text"
          inputmode="decimal"
          placeholder="—"
          class="rounded-lg border border-border-light bg-surface-light px-3 py-2.5 font-mono text-sm text-text-h-light placeholder-text-light/40 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/40 dark:border-border-dark dark:bg-surface-dark dark:text-text-h-dark dark:placeholder-text-dark/40"
          @keydown="onWeightKeydown"
          @blur="weight = sanitizeWeight(weight)"
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
          v-for="v in RPE_VALUES"
          :key="v"
          type="button"
          :class="
            rpe === v
              ? 'bg-accent text-bg-dark border-accent'
              : 'border-border-light bg-surface-light text-text-light hover:text-text-h-light dark:border-border-dark dark:bg-surface-dark dark:text-text-dark dark:hover:text-text-h-dark'
          "
          class="min-w-[2.75rem] flex-1 cursor-pointer rounded-lg border px-2 py-2 font-mono text-xs font-bold transition-colors duration-150"
          @click="rpe = rpe === v ? null : v"
        >
          {{ v }}
        </button>
      </div>
    </div>

    <!-- Result card (when calc or manual set is available) -->
    <div
      v-if="calc || (selected && allFilled)"
      class="flex flex-col gap-4 rounded-xl border border-accent/25 bg-accent/5 p-4"
    >
      <!-- Predicted value + e1RM reference OR Manual Set details -->
      <div class="flex items-center justify-between gap-3">
        <template v-if="allFilled">
          <div>
            <p
              class="text-xs font-bold uppercase tracking-wider text-accent opacity-70"
            >
              Manual Set
            </p>
            <p class="mt-0.5 font-mono text-2xl font-bold text-accent">
              {{ reps }} × {{ weight }}{{ weightUnit }} @ {{ rpe }}
            </p>
          </div>
          <div class="text-right">
            <p class="text-xs text-text-light dark:text-text-dark opacity-50">
              e1RM
            </p>
            <p
              class="font-mono text-sm font-bold text-text-h-light dark:text-text-h-dark"
            >
              {{ manualE1rm !== null ? format(manualE1rm) : "—" }}
            </p>
          </div>
        </template>
        <template v-else-if="calc">
          <div>
            <p
              class="text-xs font-bold uppercase tracking-wider text-accent opacity-70"
            >
              {{
                missing === "weight"
                  ? "Weight"
                  : missing === "reps"
                    ? "Reps"
                    : "RPE"
              }}
            </p>
            <p class="mt-0.5 font-mono text-2xl font-bold text-accent">
              <template v-if="missing === 'weight'">{{
                format(calc.weightKg)
              }}</template>
              <template v-else-if="missing === 'reps'"
                >{{ calc.reps }} reps</template
              >
              <template v-else>RPE {{ calc.rpe }}</template>
            </p>
          </div>
          <div class="text-right">
            <p class="text-xs text-text-light dark:text-text-dark opacity-50">
              e1RM
            </p>
            <p
              class="font-mono text-sm font-bold text-text-h-light dark:text-text-h-dark"
            >
              {{ format(calc.e1rm) }}
            </p>
          </div>
        </template>
      </div>

      <!-- Actual confirmation (only for calculated reps or RPE — weight is fixed, not shown for manual sets) -->
      <div
        v-if="!allFilled && calc && missing !== 'weight'"
        class="flex flex-col gap-1.5"
      >
        <label
          class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
        >
          <template v-if="missing === 'reps'">Actual Reps</template>
          <template v-else>Actual RPE</template>
        </label>

        <!-- RPE chips for actual RPE -->
        <div v-if="missing === 'rpe'" class="flex flex-wrap gap-1.5">
          <button
            v-for="v in RPE_VALUES"
            :key="v"
            type="button"
            :class="
              actualRpeChip === v
                ? 'bg-accent text-bg-dark border-accent'
                : 'border-border-light bg-surface-light text-text-light hover:text-text-h-light dark:border-border-dark dark:bg-surface-dark dark:text-text-dark dark:hover:text-text-h-dark'
            "
            class="min-w-[2.75rem] flex-1 cursor-pointer rounded-lg border px-2 py-2 font-mono text-xs font-bold transition-colors duration-150"
            @click="actualRpeChip = actualRpeChip === v ? null : v"
          >
            {{ v }}
          </button>
        </div>

        <!-- Text input for actual reps -->
        <input
          v-else
          v-model="actualText"
          v-numpad="'integer'"
          type="text"
          inputmode="numeric"
          placeholder="—"
          class="rounded-lg border border-border-light bg-surface-light px-3 py-2.5 font-mono text-sm text-text-h-light placeholder-text-light/40 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/40 dark:border-border-dark dark:bg-surface-dark dark:text-text-h-dark dark:placeholder-text-dark/40"
          @keydown="onRepsKeydown"
          @blur="actualText = sanitizeReps(actualText)"
        />
      </div>

      <!-- Log Set -->
      <button
        :disabled="!canLog"
        :class="
          canLog
            ? 'bg-accent hover:bg-accent-hover cursor-pointer'
            : 'cursor-not-allowed bg-accent/30'
        "
        class="w-full rounded-lg py-2.5 text-sm font-bold uppercase tracking-wider text-bg-dark transition-colors duration-150"
        @click="onLogSet"
      >
        Log Set
      </button>
    </div>

    <!-- Logged sets (all calculator sets this session) -->
    <div v-if="calculatorSets.length > 0" class="flex flex-col gap-2">
      <h3
        class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-50"
      >
        Logged Sets
      </h3>
      <ul class="flex flex-col gap-1.5">
        <li
          v-for="entry in calculatorSets"
          :key="entry.set.id"
          class="flex items-center justify-between gap-3 rounded-lg border border-border-light bg-surface-light px-3 py-2.5 dark:border-border-dark dark:bg-surface-dark"
        >
          <div class="min-w-0">
            <p
              class="truncate text-xs font-semibold text-text-h-light dark:text-text-h-dark"
            >
              {{ entry.exerciseName }}
            </p>
            <p
              class="mt-0.5 font-mono text-xs text-text-light dark:text-text-dark opacity-60"
            >
              {{ entry.set.actualReps }}× {{ format(entry.set.actualWeight) }} ·
              RPE {{ entry.set.actualRpe }} · e1RM {{ format(entry.e1rm) }}
            </p>
          </div>
          <button
            class="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-text-light opacity-40 transition-colors duration-150 hover:text-red-500 hover:opacity-100 dark:text-text-dark dark:hover:text-red-400"
            aria-label="Remove set"
            @click="removeCalculatorSet(entry.set.id)"
          >
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
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </button>
        </li>
      </ul>
    </div>

    <div class="h-2"></div>
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
