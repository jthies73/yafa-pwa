<script setup lang="ts">
import { ref, watch, computed } from "vue";
import type { ProgressionModelType } from "../db/types";
import { FOCUS_META } from "../config/periodization";
import type { PrescribedSet } from "../engine/prescription";
import {
  previewWorkout,
  type ExercisePreview,
  type WorkoutPreview,
} from "../engine/service";
import AppBottomSheet from "./AppBottomSheet.vue";
import ModifierArrow from "./ModifierArrow.vue";
import InfoIcon from "./InfoIcon.vue";
import { useWeightUnit } from "../composables/useWeightUnit";

const { label: weightUnit, format: fmtWeight } = useWeightUnit();

const props = defineProps<{
  routineId: string | null;
}>();

const open = defineModel<boolean>("open", { required: true });

const emit = defineEmits<{
  (e: "start", routineId: string): void;
}>();

const preview = ref<WorkoutPreview | null>(null);
const loading = ref(false);

// Re-assemble the preview every time the sheet opens so it always reflects the
// latest engine state (e.g. right after another workout was finished).
watch(
  [open, () => props.routineId],
  async ([isOpen, id]) => {
    if (!isOpen || !id) return;
    loading.value = true;
    preview.value = null;
    try {
      preview.value = await previewWorkout(id);
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

const start = () => {
  if (props.routineId) emit("start", props.routineId);
};

// ── Formatting ────────────────────────────────────────────────────────────────

const MODEL_LABELS: Record<ProgressionModelType, string> = {
  linear: "Linear",
  double: "Double",
  topset_backoff: "Top Set",
  none: "None",
};

const ROLE_LABELS: Record<PrescribedSet["role"], string> = {
  straight: "Sets",
  top: "Top set",
  backoff: "Back-off",
};

interface SetGroup {
  count: number;
  set: PrescribedSet;
}

/** Collapse consecutive identical prescribed sets into "n × reps" groups. */
const groupSets = (sets: PrescribedSet[]): SetGroup[] => {
  const groups: SetGroup[] = [];
  for (const set of sets) {
    const last = groups[groups.length - 1];
    if (
      last &&
      last.set.role === set.role &&
      last.set.reps === set.reps &&
      last.set.rpe === set.rpe &&
      last.set.weight === set.weight
    ) {
      last.count += 1;
    } else {
      groups.push({ count: 1, set });
    }
  }
  return groups;
};

const groupLine = (g: SetGroup): string => {
  const parts = [`${g.count} × ${g.set.reps}`];
  if (g.set.rpe != null) parts.push(`@ RPE ${g.set.rpe}`);
  parts.push(
    g.set.weight != null
      ? `| ${fmtWeight(g.set.weight)}`
      : `| — ${weightUnit.value}`,
  );
  return parts.join(" ");
};

const FIELD_LABELS: Record<string, string> = {
  targetSets: "Sets",
  targetReps: "Reps",
  targetRpe: "RPE",
  rpeCeiling: "RPE cap",
  topSetTargetReps: "Reps",
  topSetTargetRpe: "RPE",
  backOffSets: "Back-offs",
  backOffReps: "Back-off reps",
};

const lockedLine = (e: ExercisePreview): string =>
  (e.config?.lockedFields ?? []).map((f) => FIELD_LABELS[f] ?? f).join(", ");

// The c1RM is the planning scalar every prescribed weight derives from,
// so it is the honest "calculation input" to show here. The observed e1RM (the
// rolling diagnostic) is intentionally not shown: when it drifts from the
// c1RM, that divergence is surfaced and actioned in the post-workout
// recalibration prompt instead.
const c1rmLine = (e: ExercisePreview): string =>
  e.c1rm !== null ? fmtWeight(e.c1rm) : "Not calibrated";
interface ArrowConfig {
  direction: "up" | "down";
  count: number;
}

const volumeArrow = computed<ArrowConfig | null>(() => {
  const focus = preview.value?.mesocycle?.focus;
  if (!focus) return null;
  if (focus === "hypertrophy") return { direction: "up", count: 1 };
  if (focus === "strength") return { direction: "down", count: 1 };
  if (focus === "peaking") return { direction: "down", count: 1 };
  if (focus === "deload") return { direction: "down", count: 2 };
  return null;
});

const intensityArrow = computed<ArrowConfig | null>(() => {
  const focus = preview.value?.mesocycle?.focus;
  if (!focus) return null;
  if (focus === "hypertrophy") return { direction: "down", count: 1 };
  if (focus === "strength") return { direction: "up", count: 1 };
  if (focus === "peaking") return { direction: "up", count: 2 };
  if (focus === "deload") return { direction: "down", count: 2 };
  return null;
});
</script>

<template>
  <AppBottomSheet v-model:open="open">
    <template #title>
      <div class="min-w-0">
        <p
          class="text-xs font-semibold uppercase tracking-wider text-text-light dark:text-text-dark opacity-50 mb-0.5"
        >
          Workout Preview
        </p>
        <h2
          class="text-lg font-bold text-text-h-light dark:text-text-h-dark truncate"
        >
          {{ preview?.routineName ?? "…" }}
        </h2>
      </div>
    </template>

    <div class="px-5 py-5 flex flex-col gap-4">
      <!-- Loading skeleton -->
      <div v-if="loading" class="flex flex-col gap-3">
        <div class="h-20 bg-black/5 dark:bg-white/5 rounded-xl animate-pulse" />
        <div class="h-32 bg-black/5 dark:bg-white/5 rounded-xl animate-pulse" />
      </div>

      <template v-else-if="preview">
        <!-- Mesocycle position -->
        <div
          v-if="preview.mesocycle"
          class="rounded-xl border p-4 flex flex-col gap-2.5"
          :style="{
            borderColor: `color-mix(in srgb, ${FOCUS_META[preview.mesocycle.focus].colorVar} 25%, transparent)`,
            backgroundColor: `color-mix(in srgb, ${FOCUS_META[preview.mesocycle.focus].colorVar} 5%, transparent)`,
          }"
        >
          <div class="flex items-center justify-between gap-3">
            <span
              class="px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider"
              :style="{
                color: FOCUS_META[preview.mesocycle.focus].colorVar,
                backgroundColor: `color-mix(in srgb, ${FOCUS_META[preview.mesocycle.focus].colorVar} 15%, transparent)`,
              }"
            >
              {{ FOCUS_META[preview.mesocycle.focus].label }}
            </span>
            <span
              class="text-xs font-bold text-text-h-light dark:text-text-h-dark"
            >
              Week {{ preview.mesocycle.weekIndex + 1 }} of
              {{ preview.mesocycle.weekCount }}
            </span>
          </div>
          <div class="flex items-center justify-between gap-3 text-xs">
            <span class="text-text-light dark:text-text-dark opacity-60"
              >Volume</span
            >
            <ModifierArrow
              v-if="volumeArrow"
              :direction="volumeArrow.direction"
              :count="volumeArrow.count"
            />
          </div>
          <div class="flex items-center justify-between gap-3 text-xs">
            <span class="text-text-light dark:text-text-dark opacity-60"
              >Intensity</span
            >
            <ModifierArrow
              v-if="intensityArrow"
              :direction="intensityArrow.direction"
              :count="intensityArrow.count"
            />
          </div>
          <div class="flex items-center justify-between gap-3 text-xs">
            <span class="text-text-light dark:text-text-dark opacity-60">
              Workouts this week
            </span>
            <span
              class="font-mono font-semibold text-text-h-light dark:text-text-h-dark"
            >
              {{ preview.mesocycle.workoutsThisWeek }}
            </span>
          </div>
        </div>
        <p
          v-else
          class="text-xs text-text-light dark:text-text-dark opacity-60 px-1"
        >
          No periodization configured — base exercise targets apply.
        </p>

        <!-- Per-exercise calculation breakdown -->
        <div
          v-for="(e, i) in preview.exercises"
          :key="`${e.exerciseId}-${i}`"
          class="rounded-xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark p-4 flex flex-col gap-2.5"
        >
          <div class="flex items-center justify-between gap-3">
            <span
              class="min-w-0 flex-1 font-bold text-sm text-text-h-light dark:text-text-h-dark truncate"
            >
              {{ e.name }}
            </span>
            <span
              v-if="e.config"
              class="shrink-0 px-2 py-0.5 rounded-md bg-black/5 dark:bg-white/5 text-xs font-bold text-text-light dark:text-text-dark"
            >
              {{ MODEL_LABELS[e.config.progressionModel] }}
            </span>
          </div>

          <!-- Resulting prescription -->
          <div v-if="e.prescription" class="flex flex-col gap-1">
            <div
              v-for="(g, gi) in groupSets(e.prescription.sets)"
              :key="gi"
              class="flex items-center justify-between gap-3"
            >
              <span
                class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-45"
              >
                {{ ROLE_LABELS[g.set.role] }}
              </span>
              <span
                class="font-mono text-sm font-semibold text-text-h-light dark:text-text-h-dark"
              >
                {{ groupLine(g) }}
              </span>
            </div>
          </div>
          <p
            v-else
            class="text-xs italic text-text-light dark:text-text-dark opacity-50"
          >
            No progression config — tracker rows start empty.
          </p>

          <!-- Calculation inputs -->
          <div
            v-if="e.config"
            class="border-t border-border-light dark:border-border-dark pt-2 flex flex-col gap-1 text-xs"
          >
            <div class="flex items-center justify-between gap-3">
              <span class="flex items-center gap-1.5"
                ><span class="text-text-light dark:text-text-dark opacity-60"
                  >c1RM</span
                ><InfoIcon topic="c1rm"
              /></span>
              <span
                class="font-mono text-text-h-light dark:text-text-h-dark flex items-center gap-1.5"
              >
                <template
                  v-if="
                    e.resetPending && e.originalC1rm != null && e.c1rm != null
                  "
                >
                  <span
                    class="text-text-light dark:text-text-dark opacity-50 line-through"
                  >
                    {{ fmtWeight(e.originalC1rm) }}
                  </span>
                  <span class="opacity-40">→</span>
                  <span class="font-bold text-amber-500">
                    {{ fmtWeight(e.c1rm) }}
                  </span>
                </template>
                <template v-else>
                  {{ c1rmLine(e) }}
                </template>
              </span>
            </div>
            <div
              v-if="
                e.config.progressionModel !== 'none' && e.failureStreak >= 1
              "
              class="flex items-center justify-between gap-3"
            >
              <span class="text-text-light dark:text-text-dark opacity-60"
                >Regression streak</span
              >
              <span
                class="font-mono text-text-h-light dark:text-text-h-dark"
                :class="e.failureStreak >= 3 ? 'text-amber-500 font-bold' : ''"
              >
                {{ e.failureStreak }}/3
              </span>
            </div>
            <div
              v-if="lockedLine(e)"
              class="flex items-center justify-between gap-3"
            >
              <span class="text-text-light dark:text-text-dark opacity-60"
                >Locked fields</span
              >
              <span class="font-mono text-text-h-light dark:text-text-h-dark">
                {{ lockedLine(e) }}
              </span>
            </div>
          </div>
        </div>
      </template>
      <!-- Bottom padding -->
      <div class="h-2"></div>
    </div>

    <template #footer>
      <button
        class="flex-1 py-3 text-sm font-bold rounded-lg cursor-pointer transition-colors duration-150 border border-border-light dark:border-border-dark text-text-light dark:text-text-dark hover:bg-surface-light dark:hover:bg-surface-dark"
        @click="open = false"
      >
        Cancel
      </button>
      <button
        class="flex-1 py-3 text-sm font-bold rounded-lg cursor-pointer transition-colors duration-150 bg-accent hover:bg-accent-hover text-bg-dark"
        @click="start"
      >
        Start Workout
      </button>
    </template>
  </AppBottomSheet>
</template>
