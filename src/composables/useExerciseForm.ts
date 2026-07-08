import { ref, computed, watch, type Ref } from "vue";
import type { ExerciseInput } from "../db/repository";

export function useExerciseForm(
  initial: Ref<ExerciseInput | undefined>,
  isOpen: Ref<boolean>,
) {
  const name = ref("");
  const primaryMuscleGroups = ref<string[]>([]);
  const secondaryTags = ref<string[]>([]);
  const notes = ref("");
  // Displayed as a whole percent ("90"); stored as a 0..1 decimal. Empty ⇒ 0.
  const bodyweightPct = ref("");

  watch(
    isOpen,
    (open) => {
      if (!open) return;
      name.value = initial.value?.name ?? "";
      primaryMuscleGroups.value = [
        ...(initial.value?.primaryMuscleGroups ?? []),
      ];
      secondaryTags.value = [...(initial.value?.secondaryMuscleGroups ?? [])];
      notes.value = initial.value?.notes ?? "";
      const factor = initial.value?.bodyweightFactor ?? 0;
      bodyweightPct.value = factor > 0 ? String(Math.round(factor * 100)) : "";
    },
    { immediate: true },
  );

  const canSave = computed(
    () => name.value.trim().length > 0 && primaryMuscleGroups.value.length > 0,
  );

  const removePrimaryTag = (tag: string) => {
    primaryMuscleGroups.value = primaryMuscleGroups.value.filter(
      (t) => t !== tag,
    );
  };

  const removeTag = (tag: string) => {
    secondaryTags.value = secondaryTags.value.filter((t) => t !== tag);
  };

  const parsedBodyweightFactor = (): number => {
    const pct = parseInt(bodyweightPct.value, 10);
    if (!Number.isFinite(pct)) return 0;
    return Math.min(100, Math.max(0, pct)) / 100;
  };

  const getFormData = (): ExerciseInput => ({
    name: name.value,
    primaryMuscleGroups: primaryMuscleGroups.value,
    secondaryMuscleGroups: secondaryTags.value,
    notes: notes.value,
    bodyweightFactor: parsedBodyweightFactor(),
  });

  return {
    name,
    primaryMuscleGroups,
    secondaryTags,
    notes,
    bodyweightPct,
    canSave,
    removePrimaryTag,
    removeTag,
    getFormData,
  };
}
