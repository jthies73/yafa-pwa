import { ref, computed, watch, type Ref } from "vue";
import type { ExerciseInput } from "../db/repository";

export function useExerciseForm(
  initial: Ref<ExerciseInput | undefined>,
  isOpen: Ref<boolean>,
) {
  const name = ref("");
  const primaryMuscleGroups = ref<string[]>([]);
  const secondaryTags = ref<string[]>([]);
  const bodyweightFactor = ref(0);
  const notes = ref("");

  watch(
    isOpen,
    (open) => {
      if (!open) return;
      name.value = initial.value?.name ?? "";
      primaryMuscleGroups.value = [...(initial.value?.primaryMuscleGroups ?? [])];
      secondaryTags.value = [...(initial.value?.secondaryMuscleGroups ?? [])];
      bodyweightFactor.value = initial.value?.bodyweightFactor ?? 0;
      notes.value = initial.value?.notes ?? "";
    },
    { immediate: true },
  );

  const canSave = computed(
    () =>
      name.value.trim().length > 0 &&
      primaryMuscleGroups.value.length > 0,
  );

  const removePrimaryTag = (tag: string) => {
    primaryMuscleGroups.value = primaryMuscleGroups.value.filter((t) => t !== tag);
  };

  const removeTag = (tag: string) => {
    secondaryTags.value = secondaryTags.value.filter((t) => t !== tag);
  };

  const getFormData = (): ExerciseInput => ({
    name: name.value,
    primaryMuscleGroups: primaryMuscleGroups.value,
    secondaryMuscleGroups: secondaryTags.value,
    notes: notes.value,
    bodyweightFactor: Number(bodyweightFactor.value) || 0,
  });

  return {
    name,
    primaryMuscleGroups,
    secondaryTags,
    bodyweightFactor,
    notes,
    canSave,
    removePrimaryTag,
    removeTag,
    getFormData,
  };
}
