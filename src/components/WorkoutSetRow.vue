<script setup lang="ts">
import { ref, computed, nextTick } from "vue";
import type { PrescribedSet } from "../engine/prescription";
import {
  guardRepsKey,
  guardWeightKey,
  sanitizeReps,
} from "../utils/numericInput";
import { useWeightField } from "../composables/useWeightField";
import { useWeightUnit } from "../composables/useWeightUnit";

const props = defineProps<{
  index: number;
  state: "finished" | "current" | "upcoming";
  /** Engine prescription backing this row — shown as placeholder targets. */
  target?: PrescribedSet;
  /** A re-prescription is available — surfaces a green dot on the index. */
  hasProposal?: boolean;
  /** This row's target was adjusted in-session — surfaces an accent marker. */
  represcribed?: boolean;
}>();

const { display: displayWeight } = useWeightUnit();

// Cleared inputs keep showing the prescribed target as ghost text.
const repsPlaceholder = computed(() =>
  props.target ? String(props.target.reps) : "-",
);
const weightPlaceholder = computed(() =>
  props.target?.weight != null
    ? String(displayWeight(props.target.weight))
    : "-",
);
const rpePlaceholder = computed(() =>
  props.target?.rpe != null ? String(props.target.rpe) : "–",
);

const emit = defineEmits<{
  (e: "toggle"): void;
  (e: "complete"): void;
  (e: "edit-rpe"): void;
  (e: "delete"): void;
  (e: "open-proposal", rect: DOMRect): void;
}>();

const indexEl = ref<HTMLButtonElement | null>(null);
function openProposal() {
  if (indexEl.value)
    emit("open-proposal", indexEl.value.getBoundingClientRect());
}

const reps = defineModel<string>("reps", { default: "" });
const weight = defineModel<string>("weight", { default: "" });
const rpe = defineModel<string>("rpe", { default: "" });

// The model stays in kg; this buffer is what the user sees/edits in their unit.
const {
  buffer: weightBuffer,
  onFocus: onWeightFocus,
  commit: commitWeight,
} = useWeightField({
  getKg: () => (weight.value === "" ? null : parseFloat(weight.value)),
  setKg: (kg) => (weight.value = kg == null ? "" : String(kg)),
  // Match the 1-decimal precision of the prescription placeholder and every
  // other weight readout — a loadable kg value (0.1 kg) otherwise renders with
  // a spurious second decimal once converted to lbs.
  decimals: 1,
});

const repsInput = ref<HTMLInputElement | null>(null);
const weightInput = ref<HTMLInputElement | null>(null);

function focusReps() {
  repsInput.value?.focus();
}
defineExpose({ focusReps });

const repsValid = computed(() => parseInt(reps.value, 10) >= 1);
const weightValid = computed(() => parseFloat(weight.value) > 0);
const rpeValid = computed(() => rpe.value !== "");
// Back-off sets carry no target RPE — their load is a consequence of the top
// set, not a target — so RPE is optional to complete them.
const rpeRequired = computed(() => props.target?.role !== "backoff");
const canComplete = computed(
  () =>
    repsValid.value &&
    weightValid.value &&
    (!rpeRequired.value || rpeValid.value),
);

const repsError = ref(false);
const weightError = ref(false);
const rpeError = ref(false);
let repsTimer = 0;
let weightTimer = 0;
let rpeTimer = 0;

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
  if (rpeRequired.value && !rpeValid.value) {
    clearTimeout(rpeTimer);
    rpeError.value = true;
    rpeTimer = window.setTimeout(() => {
      rpeError.value = false;
    }, 600);
  }
  if (!repsValid.value) repsInput.value?.focus();
  else if (!weightValid.value) weightInput.value?.focus();
  else if (rpeRequired.value && !rpeValid.value) emit("edit-rpe");
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

async function onWeightKeydown(e: KeyboardEvent) {
  if (e.key === "Enter") {
    e.preventDefault();
    commitWeight(); // flush the buffer to the kg model before validating
    await nextTick(); // wait for the defineModel prop update to round-trip
    tryComplete();
    return;
  }
  guardWeightKey(e);
}
</script>

<template>
  <div class="flex items-center gap-2.5">
    <!-- Set index — clickable with a green dot when a re-prescription is offered -->
    <button
      v-if="hasProposal"
      ref="indexEl"
      type="button"
      class="relative w-5 shrink-0 text-center text-xs font-mono font-bold text-text-h-light dark:text-text-h-dark cursor-pointer"
      title="Suggested adjustment"
      @click="openProposal"
    >
      {{ index }}
      <span
        class="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-green-500"
      />
    </button>
    <span
      v-else
      class="relative w-5 shrink-0 text-center text-xs font-mono font-bold text-text-light dark:text-text-dark opacity-50"
      :title="represcribed ? 'Adjusted in-session' : undefined"
    >
      {{ index }}
      <span
        v-if="represcribed"
        class="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-accent"
      />
    </span>

    <!-- Reps -->
    <input
      ref="repsInput"
      v-model="reps"
      v-numpad="'integer'"
      type="text"
      :placeholder="repsPlaceholder"
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
      v-model="weightBuffer"
      v-numpad="'decimal'"
      type="text"
      :placeholder="weightPlaceholder"
      class="min-w-0 flex-1 bg-surface-light dark:bg-surface-dark border rounded-lg px-2.5 py-2 text-sm font-mono text-center text-text-h-light dark:text-text-h-dark placeholder-text-light/40 dark:placeholder-text-dark/40 focus:outline-none focus:ring-2 transition-colors duration-150"
      :class="
        weightError
          ? 'border-red-500 dark:border-red-400 focus:border-red-500 focus:ring-red-500/20'
          : 'border-border-light dark:border-border-dark focus:border-accent/50 focus:ring-accent/40'
      "
      @focus="onWeightFocus"
      @keydown="onWeightKeydown"
      @blur="commitWeight"
    />

    <span class="text-xs text-text-light dark:text-text-dark opacity-30"
      >@</span
    >

    <!-- RPE -->
    <button
      type="button"
      class="w-14 shrink-0 bg-surface-light dark:bg-surface-dark border rounded-lg px-1.5 py-2 text-sm font-mono text-center text-text-h-light dark:text-text-h-dark hover:border-accent/50 cursor-pointer transition-colors duration-150"
      :class="
        rpeError
          ? 'border-red-500 dark:border-red-400 focus:border-red-500 focus:ring-red-500/20'
          : 'border-border-light dark:border-border-dark'
      "
      title="Set RPE"
      @click="$emit('edit-rpe')"
    >
      <span :class="{ 'opacity-40': !rpe }">{{ rpe || rpePlaceholder }}</span>
    </button>

    <!-- Checkmark -->
    <div class="w-9 shrink-0 flex justify-center">
      <!-- Current set -->
      <button
        v-if="state === 'current'"
        type="button"
        class="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-bg-dark hover:bg-accent-hover transition-colors duration-150 cursor-pointer"
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

      <!-- Upcoming set: no completion state yet, so allow removal -->
      <button
        v-else
        type="button"
        class="flex h-9 w-9 items-center justify-center rounded-lg text-text-light dark:text-text-dark opacity-30 hover:opacity-100 hover:text-red-500 dark:hover:text-red-400 cursor-pointer transition-colors duration-150"
        title="Delete set"
        @click="$emit('delete')"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
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
    </div>
  </div>
</template>
