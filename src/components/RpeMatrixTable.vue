<script setup lang="ts">
import type { RpeMatrix } from "../db/types";

const props = defineProps<{
  modelValue: RpeMatrix;
  editable?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: RpeMatrix): void;
}>();

const RPE_COLS = [10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5, 6];
const REP_ROWS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const pct = (v: number | undefined) =>
  v == null ? "" : String(Math.round(v * 1000) / 10);

const tint = (v: number | undefined) => {
  if (v == null) return "";
  const t = Math.max(0, Math.min(1, (v - 0.5) / 0.5));
  return `background-color:rgba(31,199,185,${(t * 0.18).toFixed(3)})`;
};

const onInput = (reps: number, rpe: number, raw: string) => {
  const n = parseFloat(raw);
  emit("update:modelValue", {
    ...props.modelValue,
    [reps]: {
      ...props.modelValue[reps],
      [rpe]: Number.isNaN(n) ? 0 : Math.max(0, Math.min(100, n)) / 100,
    },
  });
};
</script>

<template>
  <div
    class="overflow-hidden rounded-lg border border-border-light dark:border-border-dark"
  >
    <div class="overflow-x-auto">
      <table
        class="w-full border-separate border-spacing-0 text-xs font-mono tabular-nums"
      >
        <thead>
          <tr
            class="divide-x divide-border-light dark:divide-border-dark bg-black/[0.04] dark:bg-white/[0.04]"
          >
            <!-- Corner cell: opaque so scrolling row labels don't bleed through -->
            <th
              class="sticky left-0 z-10 h-8 px-3 text-left font-semibold lowercase tracking-wide text-text-h-light dark:text-text-h-dark bg-surface-light dark:bg-surface-dark"
            >
              rep
            </th>
            <th
              v-for="rpe in RPE_COLS"
              :key="rpe"
              class="h-8 min-w-[2.75rem] px-1 text-center font-bold text-accent border-b border-border-light dark:border-border-dark"
            >
              {{ rpe }}
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border-light dark:divide-border-dark">
          <tr
            v-for="reps in REP_ROWS"
            :key="reps"
            class="divide-x divide-border-light dark:divide-border-dark"
          >
            <!-- Row label: opaque so data cells don't bleed through when scrolling -->
            <th
              class="sticky left-0 z-10 h-8 px-3 text-left font-bold text-text-light dark:text-text-dark bg-surface-light dark:bg-surface-dark"
            >
              {{ reps }}
            </th>
            <td
              v-for="rpe in RPE_COLS"
              :key="rpe"
              class="h-8 p-0"
              :style="tint(modelValue[reps]?.[rpe])"
            >
              <input
                v-if="editable"
                type="number"
                min="0"
                max="100"
                step="0.5"
                inputmode="decimal"
                :value="pct(modelValue[reps]?.[rpe])"
                class="h-full w-full bg-transparent text-center text-text-h-light dark:text-text-h-dark caret-accent focus:bg-accent/10 focus:outline-none"
                @input="
                  onInput(reps, rpe, ($event.target as HTMLInputElement).value)
                "
              />
              <span
                v-else
                class="flex h-full w-full items-center justify-center text-text-light dark:text-text-dark"
              >
                {{ pct(modelValue[reps]?.[rpe]) || "—" }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
/*
 * box-shadow instead of border-right: sticky cells' borders render under
 * adjacent non-sticky cells. box-shadow paints in the element's own stacking
 * context and stays visible at all scroll positions.
 */
.axis {
  box-shadow: 1px 0 0 0 var(--color-border-light);
}
:global(.dark) .axis {
  box-shadow: 1px 0 0 0 var(--color-border-dark);
}

input[type="number"]::-webkit-outer-spin-button,
input[type="number"]::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
input[type="number"] {
  -moz-appearance: textfield;
  appearance: textfield;
}
</style>
