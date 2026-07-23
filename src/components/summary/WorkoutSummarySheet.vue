<script setup lang="ts">
import { ref, watch } from "vue";
import { useRouter } from "vue-router";
import AppBottomSheet from "../AppBottomSheet.vue";
import SummaryHero from "./SummaryHero.vue";
import PrHighlights from "./PrHighlights.vue";
import CalibrationSummary from "./CalibrationSummary.vue";
import SaveAsRoutineSheet from "./SaveAsRoutineSheet.vue";
import type { SaveAsRoutinePayload } from "./SaveAsRoutineSheet.vue";
import { useActiveWorkout } from "../../composables/useActiveWorkout";
import { workoutToRoutineExercises } from "../../utils/progression";
import { createRoutine, createRoutineInNewPlan } from "../../db/repository";

const {
  summary,
  calibrations,
  showSummary,
  closeSummary,
  finishedWorkout,
  canSaveAsRoutine,
} = useActiveWorkout();

const router = useRouter();
const showSaveSheet = ref(false);
const saving = ref(false);

// Dragging/ESC closes the sheet (open → false); release the held summary so
// state never lingers between sessions.
watch(showSummary, (open) => {
  if (!open && summary.value) closeSummary();
});

const handleSave = async (payload: SaveAsRoutinePayload) => {
  const workout = finishedWorkout.value;
  if (!workout || saving.value) return;
  saving.value = true;
  try {
    const exercises = workoutToRoutineExercises(workout);
    let routineId: string;
    if (payload.target.kind === "existing") {
      routineId = await createRoutine(
        { name: payload.routineName, exercises },
        payload.target.planId,
      );
    } else {
      ({ routineId } = await createRoutineInNewPlan(
        { name: payload.routineName, exercises },
        { name: payload.target.planName, active: payload.target.active },
      ));
    }
    showSaveSheet.value = false;
    closeSummary();
    router.push({ name: "routine-details", params: { id: routineId } });
  } catch (error) {
    // Keep the summary open so the user can retry.
    console.error("YAFA: failed to save workout as routine", error);
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <AppBottomSheet v-if="summary" v-model:open="showSummary">
    <template #title>
      <div class="min-w-0">
        <p
          class="text-xs font-semibold uppercase tracking-wider text-text-light dark:text-text-dark opacity-50 mb-0.5"
        >
          Session Complete
        </p>
        <h2
          class="text-lg font-bold text-text-h-light dark:text-text-h-dark truncate"
        >
          Workout Summary
        </h2>
      </div>
    </template>

    <div class="px-5 py-6 flex flex-col gap-6">
      <SummaryHero :summary="summary" />
      <PrHighlights :prs="summary.prs" />
      <CalibrationSummary :calibrations="calibrations" />
    </div>

    <template #footer>
      <button
        v-if="canSaveAsRoutine"
        class="flex-1 py-3.5 rounded-xl border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-bold cursor-pointer transition-colors duration-150 hover:bg-surface-light dark:hover:bg-surface-dark text-sm tracking-wide uppercase"
        @click="showSaveSheet = true"
      >
        Save as Routine
      </button>
      <button
        class="flex-1 py-3.5 bg-accent hover:bg-accent-hover text-bg-dark font-bold rounded-xl cursor-pointer transition-colors duration-150 text-sm tracking-wide uppercase"
        @click="closeSummary"
      >
        Done
      </button>
    </template>
  </AppBottomSheet>

  <SaveAsRoutineSheet v-model:open="showSaveSheet" @save="handleSave" />
</template>
