<script setup lang="ts">
import { ref, watch } from "vue";
import type { RpeMatrix } from "../db/types";
import { db } from "../db/db";
import { DEFAULT_RPE_MATRIX } from "../db/rpeMatrix";
import { setMatrixCell } from "../engine/matrix";
import ConfirmDialog from "./ConfirmDialog.vue";
import RpeMatrixTable from "./RpeMatrixTable.vue";
import InfoIcon from "./InfoIcon.vue";

const props = defineProps<{
  exerciseId?: string;
  /** Sheet open state — reloads the matrix each time the sheet opens. */
  open: boolean;
}>();

const showResetConfirm = ref(false);

// The exercise's live RPE matrix (override or inherited global). It belongs to
// the Exercise entity, so it is loaded and persisted here directly rather than
// travelling through the host sheet's save event.
const matrix = ref<RpeMatrix | null>(null);
const dirty = ref(false);
const baseline = DEFAULT_RPE_MATRIX;

watch(
  () => [props.open, props.exerciseId] as const,
  async ([isOpen]) => {
    matrix.value = null;
    dirty.value = false;
    if (!isOpen || !props.exerciseId) return;
    const exercise = await db.exercises.get(props.exerciseId);
    // Plain deep copy: edits must not mutate the live record, and Dexie's
    // structured clone rejects reactive proxies on save.
    matrix.value = JSON.parse(
      JSON.stringify(exercise?.rpeMatrix ?? DEFAULT_RPE_MATRIX),
    );
  },
  { immediate: true },
);

const onCellEdit = (reps: number, rpe: number, value: number) => {
  if (!matrix.value) return;
  // Conservative neighbour repair only — a manual edit must not silently shift
  // cells across the whole grid (that whole-matrix smoothing is the automatic,
  // post-session path). Keeps the editor's deviation highlighting predictable.
  matrix.value = setMatrixCell(matrix.value, reps, rpe, value);
  dirty.value = true;
};

const reset = () => {
  matrix.value = JSON.parse(JSON.stringify(DEFAULT_RPE_MATRIX));
  dirty.value = true;
};

// Called by the host sheet's save handler. Persists the per-exercise override
// (same materialization as engine learning), independent of the routine config.
const persist = async () => {
  if (!props.exerciseId || !matrix.value || !dirty.value) return;
  await db.exercises.update(props.exerciseId, {
    rpeMatrix: JSON.parse(JSON.stringify(matrix.value)),
  });
  dirty.value = false;
};

defineExpose({ persist });
</script>

<template>
  <div v-if="matrix" class="flex flex-col gap-1.5">
    <div class="flex items-center justify-between gap-2">
      <span class="flex min-w-0 items-center gap-1">
        <label
          class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
        >
          RPE Matrix
          <span class="normal-case font-normal opacity-60 ml-1"
            >(% of e1RM)</span
          >
        </label>
        <InfoIcon topic="rpeMatrix" />
      </span>
      <button
        type="button"
        class="px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark text-text-light dark:text-text-dark hover:bg-border-light dark:hover:bg-border-dark transition-colors duration-150 cursor-pointer shrink-0"
        @click="showResetConfirm = true"
      >
        Reset
      </button>
    </div>
    <RpeMatrixTable
      :model-value="matrix"
      :baseline="baseline"
      editable
      @cell-edit="onCellEdit"
    />
    <p class="text-xs text-text-light dark:text-text-dark opacity-60">
      Highlighted cells deviate from the global matrix.
    </p>
  </div>

  <ConfirmDialog
    v-model:open="showResetConfirm"
    title="Reset matrix?"
    message="This will restore all cells to the global default values. Any learned or hand-edited calibration for this exercise will be lost."
    confirm-label="Reset"
    @confirm="reset"
  />
</template>
