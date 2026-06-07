import { ref, computed, watch, type Ref } from "vue";
import type { ExerciseInput } from "../db/repository";

export function useExerciseForm(
  initial: Ref<ExerciseInput | undefined>,
  isOpen: Ref<boolean>,
) {
  const name = ref("");
  const primaryMuscleGroup = ref("");
  const secondaryTags = ref<string[]>([]);
  const bodyweightFactor = ref(0);
  const notes = ref("");

  watch(
    isOpen,
    (open) => {
      if (!open) return;
      name.value = initial.value?.name ?? "";
      primaryMuscleGroup.value = initial.value?.primaryMuscleGroup ?? "";
      secondaryTags.value = [...(initial.value?.secondaryMuscleGroups ?? [])];
      bodyweightFactor.value = initial.value?.bodyweightFactor ?? 0;
      notes.value = initial.value?.notes ?? "";
    },
    { immediate: true },
  );

  const canSave = computed(
    () =>
      name.value.trim().length > 0 &&
      primaryMuscleGroup.value.trim().length > 0,
  );

  const removeTag = (tag: string) => {
    secondaryTags.value = secondaryTags.value.filter((t) => t !== tag);
  };

  const getFormData = (): ExerciseInput => ({
    name: name.value,
    primaryMuscleGroup: primaryMuscleGroup.value,
    secondaryMuscleGroups: secondaryTags.value,
    notes: notes.value,
    bodyweightFactor: Number(bodyweightFactor.value) || 0,
  });

  return {
    name,
    primaryMuscleGroup,
    secondaryTags,
    bodyweightFactor,
    notes,
    canSave,
    removeTag,
    getFormData,
  };
}
