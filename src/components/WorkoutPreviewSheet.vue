<script setup lang="ts">
import { ref, watch } from "vue";
import type { ProgressionModelType } from "../db/types";
import { FOCUS_META } from "../config/periodization";
import {
  DOUBLE_PLATEAU_RESET_TRIGGER,
  DOUBLE_REGRESSION_RESET_TRIGGER,
  LP_FAILURE_RESET_TRIGGER,
} from "../engine/config";
import type { PrescribedSet } from "../engine/prescription";
import {
  previewWorkout,
  type ExercisePreview,
  type ResetEffect,
  type WorkoutPreview,
} from "../engine/service";
import AppBottomSheet from "./AppBottomSheet.vue";
import { useWeightUnit } from "../composables/useWeightUnit";

const {
  label: weightUnit,
  display: displayWeight,
  format: fmtWeight,
} = useWeightUnit();

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
};

const ROLE_LABELS: Record<PrescribedSet["role"], string> = {
  straight: "Sets",
  top: "Top set",
  backoff: "Back-off",
};

const fmtMult = (m: number) => `×${Math.round(m * 100) / 100}`;

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
      ? `· ${fmtWeight(g.set.weight)}`
      : `· — ${weightUnit.value}`,
  );
  return parts.join(" ");
};

const baseConfigLine = (e: ExercisePreview): string => {
  if (!e.config) return "";
  const p = e.config.progressionParams as unknown as Record<string, number>;
  // weightIncrement is stored in kg; show it in the active unit.
  const inc = `+${displayWeight(p.weightIncrement, 2)} ${weightUnit.value}`;
  switch (e.config.progressionModel) {
    case "linear":
      return `${p.targetSets} × ${p.targetReps}${
        p.targetRpe != null ? ` @ RPE ${p.targetRpe}` : ""
      } · ${inc}`;
    case "double":
      return `${p.targetSets} × ${p.minReps}–${p.maxReps} · ${inc}`;
    case "topset_backoff":
      return `Top ${p.topSetTargetReps} @ RPE ${p.topSetTargetRpe} · ${p.backOffSets} back-off −${p.percentageDrop}% · ${inc}`;
  }
};

const FIELD_LABELS: Record<string, string> = {
  targetSets: "Sets",
  targetReps: "Reps",
  targetRpe: "RPE",
  topSetTargetReps: "Reps",
  topSetTargetRpe: "RPE",
  backOffSets: "Back-offs",
};

const lockedLine = (e: ExercisePreview): string =>
  (e.config?.lockedFields ?? []).map((f) => FIELD_LABELS[f] ?? f).join(", ");

const resetLine = (r: ResetEffect): string =>
  `${r.kind === "intensity" ? "Intensity" : "Volume"} reset ${fmtMult(
    r.multiplier,
  )} — ${r.sessionsRemaining} session${
    r.sessionsRemaining === 1 ? "" : "s"
  } left`;

const streakNotes = (e: ExercisePreview): string[] => {
  if (!e.config) return [];
  const notes: string[] = [];
  if (e.config.progressionModel === "double") {
    if (e.regressionStreak > 0)
      notes.push(
        `Regression streak ${e.regressionStreak}/${DOUBLE_REGRESSION_RESET_TRIGGER}`,
      );
    if (e.plateauStreak > 0)
      notes.push(
        `Plateau streak ${e.plateauStreak}/${DOUBLE_PLATEAU_RESET_TRIGGER}`,
      );
  } else if (e.failureStreak > 0) {
    notes.push(`Failure streak ${e.failureStreak}/${LP_FAILURE_RESET_TRIGGER}`);
  }
  return notes;
};

const e1rmLine = (e: ExercisePreview): string => {
  if (e.workingE1rm === null) return "Not calibrated";
  const working = `Working ${fmtWeight(e.workingE1rm)}`;
  return e.observedE1rm === null
    ? working
    : `${working} · observed ≈ ${fmtWeight(e.observedE1rm)}`;
};
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
          class="rounded-xl border border-accent/25 bg-accent/5 p-4 flex flex-col gap-2.5"
        >
          <div class="flex items-center justify-between gap-3">
            <span
              class="px-2.5 py-1 rounded-md bg-accent/15 text-accent text-xs font-bold uppercase tracking-wider"
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
            <span class="text-text-light dark:text-text-dark opacity-60">
              Mesocycle modifiers
            </span>
            <span
              class="font-mono font-semibold text-text-h-light dark:text-text-h-dark"
            >
              Volume {{ fmtMult(preview.mesocycle.modifiers.volume) }} ·
              Intensity {{ fmtMult(preview.mesocycle.modifiers.intensity) }}
            </span>
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
              <span class="text-text-light dark:text-text-dark opacity-60"
                >Base config</span
              >
              <span class="font-mono text-text-h-light dark:text-text-h-dark">
                {{ baseConfigLine(e) }}
              </span>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-text-light dark:text-text-dark opacity-60"
                >e1RM</span
              >
              <span class="font-mono text-text-h-light dark:text-text-h-dark">
                {{ e1rmLine(e) }}
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
            <p
              v-for="r in e.resetEffects"
              :key="r.kind + r.sessionsRemaining"
              class="font-semibold text-amber-600 dark:text-amber-400"
            >
              {{ resetLine(r) }}
            </p>
            <p
              v-for="note in streakNotes(e)"
              :key="note"
              class="font-semibold text-red-500 dark:text-red-400"
            >
              {{ note }}
            </p>
            <p
              v-if="e.workingE1rm === null"
              class="text-text-light dark:text-text-dark opacity-60 italic"
            >
              First session calibrates this exercise — weights appear next time.
            </p>
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
