<script setup lang="ts">
import type { RpeMatrix } from "../db/types";

const props = defineProps<{
  modelValue: RpeMatrix;
  editable?: boolean;
  /** Reference matrix; cells deviating from it get a highlighted tint. */
  baseline?: RpeMatrix;
}>();

const emit = defineEmits<{
  (e: "cell-edit", reps: number, rpe: number, value: number): void;
}>();

const RPE_COLS = [10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5, 6];
const REP_ROWS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const pct = (v: number | undefined) =>
  v == null ? "" : String(Math.round(v * 1000) / 10);

// Below 0.05% the displayed (0.1%-rounded) value is identical — not a deviation.
const deviates = (reps: number, rpe: number) => {
  if (!props.baseline) return false;
  const value = props.modelValue[reps]?.[rpe];
  const base = props.baseline[reps]?.[rpe];
  if (value == null || base == null) return value !== base;
  return Math.abs(value - base) > 0.0005;
};

const tint = (reps: number, rpe: number) => {
  const v = props.modelValue[reps]?.[rpe];
  if (v == null) return "";

  // Gradient: 100% (1.0) -> Red (239, 68, 68), 78% (0.78) -> Yellow (245, 158, 11), 50% (0.50) -> Yafa Green (31, 199, 185)
  let r = 31,
    g = 199,
    b = 185;
  const clamped = Math.max(0.5, Math.min(1.0, v));

  if (clamped >= 0.78) {
    const t = (clamped - 0.78) / (1.0 - 0.78);
    r = Math.round(245 + t * (239 - 245));
    g = Math.round(158 + t * (68 - 158));
    b = Math.round(11 + t * (68 - 11));
  } else {
    const t = (clamped - 0.5) / (0.78 - 0.5);
    r = Math.round(31 + t * (245 - 31));
    g = Math.round(199 + t * (158 - 199));
    b = Math.round(185 + t * (11 - 185));
  }

  const alpha = deviates(reps, rpe) ? 0.37 : 0.25;
  return `background-color: rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// Committed on change (blur/Enter), not per keystroke — intermediate typing
// states must never reach the parent, which may smooth neighbors on each edit.
const onCellChange = (reps: number, rpe: number, raw: string) => {
  const n = parseFloat(raw);
  // Accept fractional percentages, clamped to [0, 100] and rounded to the 0.1%
  // resolution the table displays (pct()), so what you type is what redisplays.
  const clamped = Number.isNaN(n) ? 0 : Math.max(0, Math.min(100, n));
  emit("cell-edit", reps, rpe, Math.round(clamped * 10) / 1000);
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
              :style="tint(reps, rpe)"
            >
              <input
                v-if="editable"
                v-numpad="'decimal'"
                type="number"
                min="0"
                max="100"
                step="0.1"
                :value="pct(modelValue[reps]?.[rpe])"
                class="h-full w-full bg-transparent text-center text-text-h-light dark:text-text-h-dark caret-accent focus:bg-accent/10 focus:outline-none"
                @change="
                  onCellChange(
                    reps,
                    rpe,
                    ($event.target as HTMLInputElement).value,
                  )
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
