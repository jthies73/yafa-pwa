<script setup lang="ts">
import { ref } from "vue";
import { useWeightUnit } from "../../composables/useWeightUnit";
import type { RecalibrationProposal } from "../../engine/service";

defineProps<{ recalibrations: RecalibrationProposal[] }>();
const emit = defineEmits<{ confirm: [] }>();

const { format: fmtWeight } = useWeightUnit();

// Local latch: once applied, swap the action for a confirmed state so the
// prompt resolves in place rather than vanishing.
const applied = ref(false);

const apply = () => {
  if (applied.value) return;
  applied.value = true;
  emit("confirm");
};

// The change actually being applied (working → proposed), so the % matches the
// new value shown beside it rather than the raw session divergence.
const changePct = (p: RecalibrationProposal): number =>
  Math.round((p.proposedE1rm / p.currentE1rm - 1) * 100);

const changeLabel = (p: RecalibrationProposal): string => {
  const pct = changePct(p);
  return `${pct > 0 ? "+" : ""}${pct}%`;
};

const isUp = (p: RecalibrationProposal): boolean =>
  p.proposedE1rm >= p.currentE1rm;
</script>

<template>
  <div
    v-if="recalibrations.length"
    class="flex flex-col gap-3 rounded-xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark p-3.5"
  >
    <!-- Header -->
    <div class="flex flex-col gap-0.5">
      <span
        class="text-[0.65rem] font-semibold uppercase tracking-wider text-text-light dark:text-text-dark opacity-50"
      >
        Recalibration
      </span>
      <p class="text-xs text-text-light dark:text-text-dark opacity-60">
        Demonstrated strength has drifted from the working estimate. Apply to
        re-baseline future prescriptions.
      </p>
    </div>

    <!-- Per-exercise: new e1RM + signed change lead -->
    <div class="flex flex-col">
      <div
        v-for="(p, i) in recalibrations"
        :key="i"
        class="flex items-center justify-between gap-3 py-2 border-t border-border-light dark:border-border-dark first:border-t-0"
      >
        <div class="min-w-0 flex-1">
          <p
            class="text-sm font-semibold text-text-h-light dark:text-text-h-dark truncate"
          >
            {{ p.exerciseName }}
          </p>
          <p class="text-xs text-text-light dark:text-text-dark opacity-50">
            from {{ fmtWeight(p.currentE1rm) }}
          </p>
        </div>

        <div class="flex items-center gap-2.5 shrink-0">
          <span
            class="text-base font-bold font-mono text-text-h-light dark:text-text-h-dark"
          >
            {{ fmtWeight(p.proposedE1rm) }}
          </span>
          <span
            class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-xs font-bold font-mono"
            :class="
              isUp(p)
                ? 'text-green-600 dark:text-green-400 bg-green-500/10'
                : 'text-red-600 dark:text-red-400 bg-red-500/10'
            "
          >
            <svg
              viewBox="0 0 24 24"
              class="w-3 h-3"
              :class="{ 'rotate-180': !isUp(p) }"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M12 19V5" />
              <path d="m5 12 7-7 7 7" />
            </svg>
            {{ changeLabel(p) }}
          </span>
        </div>
      </div>
    </div>

    <!-- Action / confirmed state -->
    <button
      v-if="!applied"
      class="w-full py-2.5 bg-accent hover:bg-accent-hover text-bg-dark font-bold rounded-lg cursor-pointer transition-colors duration-150 text-xs tracking-wide uppercase"
      @click="apply"
    >
      Apply Recalibration
    </button>
    <p v-else class="text-xs font-semibold text-accent text-center py-1.5">
      Recalibration applied
    </p>
  </div>
</template>
