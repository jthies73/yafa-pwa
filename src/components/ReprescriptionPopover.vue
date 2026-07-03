<script setup lang="ts">
import { computed } from "vue";
import type { PrescribedSet } from "../engine/prescription";
import type { SetAdjustment } from "../engine/adjustment";
import { useWeightUnit } from "../composables/useWeightUnit";

const props = defineProps<{
  open: boolean;
  anchorRect: DOMRect | null;
  current: PrescribedSet | null;
  proposal: SetAdjustment | null;
}>();

const emit = defineEmits<{
  (e: "apply"): void;
  (e: "dismiss"): void;
  (e: "close"): void;
}>();

const { format: fmtWeight } = useWeightUnit();

const PANEL_WIDTH = 232; // px

// Anchored just below the index badge, clamped to the viewport's right edge.
const panelStyle = computed(() => {
  const r = props.anchorRect;
  if (!r) return {};
  const margin = 8;
  const left = Math.min(
    Math.max(margin, r.left),
    window.innerWidth - PANEL_WIDTH - margin,
  );
  return {
    top: `${r.bottom + 6}px`,
    left: `${left}px`,
    width: `${PANEL_WIDTH}px`,
  };
});

const weightUp = computed(
  () =>
    props.current?.weight != null &&
    props.proposal != null &&
    props.proposal.weight >= props.current.weight,
);
const repsUp = computed(
  () =>
    props.current != null &&
    props.proposal != null &&
    props.proposal.reps >= props.current.reps,
);
const repsChanged = computed(
  () => props.current != null && props.proposal?.reps !== props.current.reps,
);
</script>

<template>
  <Teleport to="body">
    <div v-if="open && proposal && current" class="fixed inset-0 z-[65]">
      <!-- Transparent click-catcher: tapping away closes without dismissing -->
      <div class="absolute inset-0" @click="emit('close')" />

      <div
        class="absolute flex flex-col gap-2.5 rounded-xl border border-border-light dark:border-border-dark bg-bg-light dark:bg-bg-dark p-3.5 shadow-xl"
        :style="panelStyle"
      >
        <span
          class="text-[0.65rem] font-semibold uppercase tracking-wider text-text-light dark:text-text-dark opacity-50"
        >
          Suggested adjustment
        </span>

        <!-- Load -->
        <div class="flex items-center justify-between gap-3">
          <span class="text-xs text-text-light dark:text-text-dark opacity-60"
            >Load</span
          >
          <span class="flex items-center gap-1.5 font-mono text-sm">
            <span
              class="text-text-light dark:text-text-dark opacity-50 line-through"
            >
              {{ current.weight != null ? fmtWeight(current.weight) : "—" }}
            </span>
            <span class="opacity-40">→</span>
            <span
              class="font-bold"
              :class="
                weightUp
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-amber-500'
              "
            >
              {{ fmtWeight(proposal.weight) }}
            </span>
          </span>
        </div>

        <!-- Reps -->
        <div class="flex items-center justify-between gap-3">
          <span class="text-xs text-text-light dark:text-text-dark opacity-60"
            >Reps</span
          >
          <span class="flex items-center gap-1.5 font-mono text-sm">
            <span
              class="text-text-light dark:text-text-dark"
              :class="
                repsChanged
                  ? 'opacity-50 line-through'
                  : 'font-bold text-text-h-light dark:text-text-h-dark'
              "
            >
              {{ current.reps }}
            </span>
            <template v-if="repsChanged">
              <span class="opacity-40">→</span>
              <span
                class="font-bold"
                :class="
                  repsUp
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-amber-500'
                "
              >
                {{ proposal.reps }}
              </span>
            </template>
          </span>
        </div>

        <p
          class="text-[0.65rem] text-text-light dark:text-text-dark opacity-50"
        >
          Applies to all remaining sets for this exercise.
        </p>

        <!-- Actions -->
        <div class="mt-0.5 flex gap-2">
          <button
            type="button"
            class="flex-1 rounded-lg border border-border-light dark:border-border-dark py-2 text-xs font-bold uppercase tracking-wide text-text-light dark:text-text-dark hover:bg-surface-light dark:hover:bg-surface-dark cursor-pointer transition-colors duration-150"
            @click="emit('dismiss')"
          >
            Dismiss
          </button>
          <button
            type="button"
            class="flex-1 rounded-lg bg-accent py-2 text-xs font-bold uppercase tracking-wide text-bg-dark hover:bg-accent-hover cursor-pointer transition-colors duration-150"
            @click="emit('apply')"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
