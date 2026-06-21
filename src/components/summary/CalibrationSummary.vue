<script setup lang="ts">
import { computed } from "vue";
import { useWeightUnit } from "../../composables/useWeightUnit";
import InfoIcon from "../InfoIcon.vue";
import type { CalibrationChange } from "../../engine/service";

// Read-only view of how each exercise's c1RM (training anchor) moved this
// session. The engine applies these deterministically — there is no confirm
// step; this just reports what happened (seed / increment / hold / regression).
const props = defineProps<{ calibrations: CalibrationChange[] }>();

const { format: fmtWeight } = useWeightUnit();

// Only changes worth showing: a fresh seed, a real c1RM move, or an automatic
// recalibration. Holds and regressions (which leave c1RM untouched until a later
// deload) are quiet.
const shown = computed(() =>
  props.calibrations.filter(
    (c) =>
      c.reason === "seed" ||
      c.reason === "increment" ||
      c.reason === "recalibrate" ||
      c.resetArmed,
  ),
);

const label = (c: CalibrationChange): string => {
  if (c.reason === "seed") return "Calibrated";
  if (c.reason === "increment") return "Progressed";
  if (c.reason === "recalibrate") return "Recalibrated";
  return "Deload armed";
};

const isUp = (c: CalibrationChange) => {
  if (c.reason === "increment" || c.reason === "seed") return true;
  // A recalibration can go either way — compare the anchor before/after.
  if (c.reason === "recalibrate" && c.before != null && c.after != null)
    return c.after >= c.before;
  return false;
};
</script>

<template>
  <div
    v-if="shown.length"
    class="flex flex-col gap-3 rounded-xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark p-3.5"
  >
    <!-- Header -->
    <div class="flex flex-col gap-0.5">
      <div class="flex items-center gap-1.5">
        <span
          class="text-[0.65rem] font-semibold uppercase tracking-wider text-text-light dark:text-text-dark opacity-50"
        >
          Calibration
        </span>
        <InfoIcon topic="c1rm" />
      </div>
      <p class="text-xs text-text-light dark:text-text-dark opacity-60">
        How each lift's training anchor moved — applied automatically for the
        next prescription.
      </p>
    </div>

    <!-- Per-exercise change -->
    <div class="flex flex-col">
      <div
        v-for="(c, i) in shown"
        :key="i"
        class="flex items-center justify-between gap-3 py-2 border-t border-border-light dark:border-border-dark first:border-t-0"
      >
        <div class="min-w-0 flex-1">
          <p
            class="text-sm font-semibold text-text-h-light dark:text-text-h-dark truncate"
          >
            {{ c.exerciseName }}
          </p>
          <p class="text-xs text-text-light dark:text-text-dark opacity-50">
            {{ label(c) }}
            <template
              v-if="
                (c.reason === 'increment' || c.reason === 'recalibrate') &&
                c.before != null
              "
            >
              · from {{ fmtWeight(c.before) }}
            </template>
            <template v-if="c.resetArmed"> · next session −10% </template>
          </p>
        </div>

        <div class="flex items-center gap-2.5 shrink-0">
          <template v-if="c.resetArmed && c.after != null">
            <span
              class="text-base font-bold font-mono text-text-light dark:text-text-dark opacity-50 line-through"
            >
              {{ fmtWeight(c.after) }}
            </span>
            <span class="opacity-40">→</span>
            <span class="text-base font-bold font-mono text-amber-500">
              {{ fmtWeight(c.after * 0.9) }}
            </span>
          </template>
          <template v-else>
            <span
              v-if="c.after != null"
              class="text-base font-bold font-mono text-text-h-light dark:text-text-h-dark"
            >
              {{ fmtWeight(c.after) }}
            </span>
            <span
              class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-xs font-bold font-mono"
              :class="
                isUp(c)
                  ? 'text-green-600 dark:text-green-400 bg-green-500/10'
                  : 'text-text-light dark:text-text-dark bg-border-light/40 dark:bg-border-dark/40'
              "
            >
              {{ c.reason === "seed" ? "new" : isUp(c) ? "↑" : "↓" }}
            </span>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
