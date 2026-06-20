<script setup lang="ts">
import { computed } from "vue";
import type { WeightIncrementUnit } from "../db/types";
import { useWeightUnit } from "../composables/useWeightUnit";
import { useWeightField } from "../composables/useWeightField";

// The weight increment a progression model adds to the c1RM on a win. It can be
// expressed in kg OR as a percent of c1RM, so this field owns BOTH the value and
// the unit and renders the right input for each:
//   • kg      → reuse the kg/lbs bridge (value is stored in kg; shown/edited in
//               the user's display unit), identical to every other weight input.
//   • percent → a plain numeric input; the stored number is the raw percent of
//               c1RM and is NEVER unit-converted.
// Switching units reinterprets the existing number as-is (we do not convert
// between kg and %) — 2.5 kg and 2.5 % are both sensible starting points, and the
// user adjusts from there.

const value = defineModel<number>("value", { required: true });
const unit = defineModel<WeightIncrementUnit>("unit", { required: true });

const { label: weightUnit } = useWeightUnit();

// kg bridge — only meaningful while unit === "kg"; getKg/setKg proxy the value
// model (which holds kg in that mode). It stays instantiated regardless so the
// buffer is primed the moment we switch back to kg.
const {
  buffer: kgBuffer,
  onFocus: onKgFocus,
  commit: commitKg,
} = useWeightField({
  getKg: () => value.value,
  setKg: (kg) => (value.value = kg ?? 0),
});

// Suffix hint inside the input: the display weight unit in kg mode, "%" otherwise.
const suffix = computed(() =>
  unit.value === "percent" ? "%" : weightUnit.value,
);

const setUnit = (next: WeightIncrementUnit) => {
  if (unit.value === next) return;
  // Flush any pending kg edit before leaving kg mode so the latest typed number
  // survives the switch (it is then reinterpreted as a percent, and vice versa).
  if (unit.value === "kg") commitKg();
  unit.value = next;
};

const toggleUnit = () => setUnit(unit.value === "kg" ? "percent" : "kg");

// Let the parent flush the kg buffer on Save without a blur (matches the
// matrix-editor persist pattern). No-op in percent mode — that input is bound
// directly to the model and is always current.
const commit = () => {
  if (unit.value === "kg") commitKg();
};
defineExpose({ commit });

const inputClass =
  "w-full bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg pl-3 pr-11 py-2.5 text-sm font-mono text-text-h-light dark:text-text-h-dark focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50";
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label
      class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
    >
      Weight Increment
    </label>
    <div class="flex gap-2">
      <!-- Value input (suffix shows the active unit) -->
      <div class="relative flex-1">
        <input
          v-if="unit === 'kg'"
          v-model="kgBuffer"
          v-numpad="'decimal'"
          v-keynav
          type="text"
          :class="inputClass"
          @focus="onKgFocus"
          @blur="commitKg"
        />
        <input
          v-else
          v-model.number="value"
          v-numpad="'decimal'"
          v-keynav
          type="number"
          min="0"
          step="0.5"
          :class="inputClass"
        />
        <span
          class="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-text-light dark:text-text-dark opacity-50 pointer-events-none"
        >
          {{ suffix }}
        </span>
      </div>

      <!-- kg / % unit toggle -->
      <button
        type="button"
        class="flex items-center border border-border-light dark:border-border-dark rounded-lg overflow-hidden bg-black/5 dark:bg-white/5 w-24 cursor-pointer select-none shrink-0"
        role="switch"
        :aria-checked="unit === 'percent'"
        aria-label="Toggle increment unit"
        @click="toggleUnit"
      >
        <span
          class="flex-1 text-center py-1.5 text-xs font-semibold transition-colors duration-150"
          :class="
            unit === 'kg'
              ? 'bg-accent text-bg-dark font-bold'
              : 'text-text-h-light dark:text-text-h-dark hover:bg-surface-light-hover/40 dark:hover:bg-surface-dark-hover/40'
          "
        >
          {{ weightUnit }}
        </span>
        <span
          class="flex-1 text-center py-1.5 text-xs font-semibold transition-colors duration-150"
          :class="
            unit === 'percent'
              ? 'bg-accent text-bg-dark font-bold'
              : 'text-text-h-light dark:text-text-h-dark hover:bg-surface-light-hover/40 dark:hover:bg-surface-dark-hover/40'
          "
        >
          %
        </span>
      </button>
    </div>
  </div>
</template>
