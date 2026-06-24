<script setup lang="ts">
import { ref, computed, watch } from "vue";
import type { ExerciseInput } from "../db/repository";
import AppBottomSheet from "./AppBottomSheet.vue";
import ExerciseMusclePicker from "./ExerciseMusclePicker.vue";
import ExerciseRpeMatrixEditor from "./ExerciseRpeMatrixEditor.vue";
import { useExerciseForm } from "../composables/useExerciseForm";

const props = defineProps<{
  isEditing: boolean;
  exerciseId?: string;
  initial?: ExerciseInput;
}>();

const open = defineModel<boolean>("open", { required: true });

const emit = defineEmits<{
  (e: "save", input: ExerciseInput): void;
}>();

// --- Form State ---
const initialProp = computed(() => props.initial);
const {
  name,
  primaryMuscleGroups,
  secondaryTags,
  notes,
  canSave,
  removePrimaryTag,
  removeTag,
  getFormData,
} = useExerciseForm(initialProp, open);

// --- Picker UI State ---
const selectingMode = ref<"primary" | "secondary" | null>(null);
const wrapper = ref<HTMLElement | null>(null);
const currentPage = ref<1 | 2>(1);

watch(open, (isOpen) => {
  if (isOpen) {
    currentPage.value = 1;
    selectingMode.value = null;
  }
});

const openMusclePicker = (mode: "primary" | "secondary") => {
  selectingMode.value = mode;
  currentPage.value = 2;
  wrapper.value?.closest(".overflow-y-auto")?.scrollTo({
    top: 0,
    behavior: "smooth",
  });
};

const goToPage1 = () => {
  currentPage.value = 1;
  wrapper.value?.closest(".overflow-y-auto")?.scrollTo({
    top: 0,
    behavior: "smooth",
  });
};

const handleMuscleToggle = (group: string) => {
  if (selectingMode.value === "primary") {
    if (primaryMuscleGroups.value.includes(group)) {
      primaryMuscleGroups.value = primaryMuscleGroups.value.filter(
        (t) => t !== group,
      );
    } else {
      primaryMuscleGroups.value.push(group);
    }
  } else {
    if (secondaryTags.value.includes(group)) {
      secondaryTags.value = secondaryTags.value.filter((t) => t !== group);
    } else {
      secondaryTags.value.push(group);
    }
  }
};

const close = () => {
  open.value = false;
};

const matrixEditor = ref<InstanceType<typeof ExerciseRpeMatrixEditor> | null>(
  null,
);

const save = async () => {
  if (!canSave.value) return;
  // The matrix editor owns its own per-exercise override persistence.
  await matrixEditor.value?.persist();
  emit("save", getFormData());
};
</script>

<template>
  <AppBottomSheet v-model:open="open">
    <template #title>
      <h2
        class="text-lg font-bold text-text-h-light dark:text-text-h-dark truncate"
      >
        {{ isEditing ? "Edit Exercise" : "New Exercise" }}
      </h2>
    </template>

    <div ref="wrapper" class="w-full overflow-x-hidden relative">
      <div
        class="flex w-[200%] items-start transition-transform duration-300 ease-in-out"
        :style="{
          transform: `translateX(${currentPage === 1 ? '0' : '-50%'})`,
        }"
      >
        <!-- Page 1: Main Form Fields -->
        <div class="w-1/2 shrink-0 flex flex-col gap-6 px-5 py-5 pb-8">
          <!-- Name -->
          <div class="flex flex-col gap-1.5">
            <label
              class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
            >
              Exercise Name
            </label>
            <input
              v-model="name"
              v-keynav
              type="text"
              placeholder="e.g. Barbell Back Squat"
              class="rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark px-3 py-2.5 text-sm text-text-h-light dark:text-text-h-dark placeholder-text-light/40 dark:placeholder-text-dark/40 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>

          <!-- Primary muscle group -->
          <div class="flex flex-col gap-1.5">
            <label
              class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
            >
              Primary Muscle Groups
            </label>
            <div
              role="button"
              tabindex="0"
              class="flex items-center justify-between gap-2 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark px-3 py-2 cursor-pointer focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-accent/40 min-h-[46px] transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              @click="openMusclePicker('primary')"
              @keydown.enter="openMusclePicker('primary')"
            >
              <div class="flex flex-wrap items-center gap-2 flex-1">
                <span
                  v-for="tag in primaryMuscleGroups"
                  :key="tag"
                  class="inline-flex items-center gap-1 rounded-md bg-accent/15 py-1 pl-2.5 pr-1 text-xs font-semibold text-accent"
                >
                  {{ tag }}
                  <button
                    type="button"
                    class="flex h-4 w-4 items-center justify-center rounded-sm text-accent/80 transition-colors duration-150 hover:bg-accent/20 hover:text-accent cursor-pointer"
                    aria-label="Remove muscle group"
                    @click.stop="removePrimaryTag(tag)"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="3"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </span>
                <span
                  v-if="!primaryMuscleGroups.length"
                  class="text-sm text-text-light/40 dark:text-text-dark/40"
                >
                  Add primary muscle groups...
                </span>
              </div>
              <svg
                class="w-4 h-4 opacity-50 shrink-0"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </div>
          </div>

          <!-- Secondary muscle groups -->
          <div class="flex flex-col gap-1.5">
            <label
              class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
            >
              Secondary Muscle Groups
              <span class="ml-1 font-normal normal-case opacity-60"
                >(optional)</span
              >
            </label>
            <div
              role="button"
              tabindex="0"
              class="flex items-center justify-between gap-2 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark px-3 py-2 cursor-pointer focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-accent/40 min-h-[46px] transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              @click="openMusclePicker('secondary')"
              @keydown.enter="openMusclePicker('secondary')"
            >
              <div class="flex flex-wrap items-center gap-2 flex-1">
                <span
                  v-for="tag in secondaryTags"
                  :key="tag"
                  class="inline-flex items-center gap-1 rounded-md bg-accent/15 py-1 pl-2.5 pr-1 text-xs font-semibold text-accent"
                >
                  {{ tag }}
                  <button
                    type="button"
                    class="flex h-4 w-4 items-center justify-center rounded-sm text-accent/80 transition-colors duration-150 hover:bg-accent/20 hover:text-accent cursor-pointer"
                    aria-label="Remove muscle group"
                    @click.stop="removeTag(tag)"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="3"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </span>
                <span
                  v-if="!secondaryTags.length"
                  class="text-sm text-text-light/40 dark:text-text-dark/40"
                >
                  Add secondary muscle groups...
                </span>
              </div>
              <svg
                class="w-4 h-4 opacity-50 shrink-0"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </div>
          </div>

          <!-- Notes -->
          <div class="flex flex-col gap-1.5">
            <label
              class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
            >
              Notes
              <span class="ml-1 font-normal normal-case opacity-60"
                >(optional)</span
              >
            </label>
            <textarea
              v-model="notes"
              rows="3"
              placeholder="Form cues, setup notes, variations…"
              class="resize-none rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark px-3 py-2.5 text-sm text-text-h-light dark:text-text-h-dark placeholder-text-light/40 dark:placeholder-text-dark/40 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/40"
            ></textarea>
          </div>

          <!-- RPE Matrix (existing exercises only) -->
          <ExerciseRpeMatrixEditor
            ref="matrixEditor"
            :exercise-id="exerciseId"
            :open="open"
          />
        </div>

        <!-- Page 2: Muscle Picker Component -->
        <div class="w-1/2 shrink-0">
          <ExerciseMusclePicker
            :mode="selectingMode"
            :primary-selected="primaryMuscleGroups"
            :secondary-selected="secondaryTags"
            @toggle="handleMuscleToggle"
            @back="goToPage1"
          />
        </div>
      </div>
    </div>

    <template #footer>
      <template v-if="currentPage === 1">
        <button
          class="flex-1 rounded-lg border border-border-light dark:border-border-dark py-3 text-sm font-bold text-text-light dark:text-text-dark transition-colors duration-150 hover:bg-surface-light dark:hover:bg-surface-dark cursor-pointer"
          @click="close"
        >
          Cancel
        </button>
        <button
          class="flex-1 rounded-lg bg-accent py-3 text-sm font-bold text-bg-dark transition-colors duration-150 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          :disabled="!canSave"
          @click="save"
        >
          {{ isEditing ? "Save Changes" : "Create Exercise" }}
        </button>
      </template>
      <template v-else>
        <button
          class="flex-1 rounded-lg bg-accent py-3 text-sm font-bold text-bg-dark transition-colors duration-150 hover:bg-accent-hover cursor-pointer"
          @click="goToPage1"
        >
          Done
        </button>
      </template>
    </template>
  </AppBottomSheet>
</template>
