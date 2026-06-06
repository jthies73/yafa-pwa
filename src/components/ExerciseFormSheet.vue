<script setup lang="ts">
import { ref, computed, watch } from "vue";
import type { ExerciseInput } from "../db/repository";
import { countExerciseUsage } from "../db/repository";
import type { RpeMatrix } from "../db/types";
import { DEFAULT_RPE_MATRIX } from "../db/rpeMatrix";
import AppBottomSheet from "./AppBottomSheet.vue";
import ConfirmDialog from "./ConfirmDialog.vue";
import RpeMatrixTable from "./RpeMatrixTable.vue";

const clone = (m: RpeMatrix): RpeMatrix =>
  JSON.parse(JSON.stringify(m)) as RpeMatrix;

const props = defineProps<{
  isEditing: boolean;
  exerciseId?: string;
  initial?: ExerciseInput;
}>();

const open = defineModel<boolean>("open", { required: true });

const emit = defineEmits<{
  (e: "save", input: ExerciseInput): void;
  (e: "delete"): void;
}>();

// --- Delete confirmation ---
const showConfirm = ref(false);
const pendingUsage = ref(0);

const confirmMessage = computed(() => {
  const name = props.initial?.name ?? "this exercise";
  if (pendingUsage.value > 0) {
    return `"${name}" is used in ${pendingUsage.value} routine slot${
      pendingUsage.value === 1 ? "" : "s"
    }. Deleting it will remove it from those routines. This cannot be undone.`;
  }
  return `Delete "${name}" from your exercise library? This cannot be undone.`;
});

const requestDelete = async () => {
  if (props.exerciseId == null) return;
  pendingUsage.value = await countExerciseUsage(props.exerciseId);
  showConfirm.value = true;
};

const confirmDelete = () => {
  emit("delete");
};

// Common muscle groups surfaced as datalist suggestions (free text still allowed).
const MUSCLE_GROUPS = [
  "Chest",
  "Upper Chest",
  "Back",
  "Lats",
  "Upper Back",
  "Lower Back",
  "Traps",
  "Shoulders",
  "Front Delts",
  "Side Delts",
  "Rear Delts",
  "Biceps",
  "Triceps",
  "Forearms",
  "Quads",
  "Hamstrings",
  "Glutes",
  "Calves",
  "Core",
  "Abs",
  "Obliques",
];

const name = ref("");
const primaryMuscleGroup = ref("");
const secondaryTags = ref<string[]>([]);
const tagDraft = ref("");
const bodyweightFactor = ref(0);
const notes = ref("");

// --- RPE matrix ---
const globalMatrix = DEFAULT_RPE_MATRIX;
const overrideRpe = ref(false);
const customMatrix = ref<RpeMatrix | null>(null);

// The table shows the editable custom copy when overriding, else the live global.
const displayMatrix = computed<RpeMatrix>(() =>
  overrideRpe.value && customMatrix.value ? customMatrix.value : globalMatrix,
);

// Enabling the override seeds the editable copy from the current global values;
// disabling discards it (the exercise reverts to inheriting global on save).
const toggleOverride = () => {
  overrideRpe.value = !overrideRpe.value;
  if (overrideRpe.value && !customMatrix.value) {
    customMatrix.value = clone(globalMatrix);
  }
};

watch(
  open,
  (isOpen) => {
    if (!isOpen) return;
    name.value = props.initial?.name ?? "";
    primaryMuscleGroup.value = props.initial?.primaryMuscleGroup ?? "";
    secondaryTags.value = [...(props.initial?.secondaryMuscleGroups ?? [])];
    tagDraft.value = "";
    bodyweightFactor.value = props.initial?.bodyweightFactor ?? 0;
    notes.value = props.initial?.notes ?? "";
    overrideRpe.value = !!props.initial?.rpeMatrix;
    customMatrix.value = props.initial?.rpeMatrix
      ? clone(props.initial.rpeMatrix)
      : null;
  },
  { immediate: true },
);

const canSave = computed(
  () =>
    name.value.trim().length > 0 && primaryMuscleGroup.value.trim().length > 0,
);

const addTag = () => {
  const value = tagDraft.value.trim();
  if (!value) return;
  if (
    !secondaryTags.value.some((t) => t.toLowerCase() === value.toLowerCase())
  ) {
    secondaryTags.value.push(value);
  }
  tagDraft.value = "";
};

const removeTag = (index: number) => {
  secondaryTags.value.splice(index, 1);
};

const onTagKeydown = (e: KeyboardEvent) => {
  if (e.key === "Enter" || e.key === ",") {
    e.preventDefault();
    addTag();
  } else if (e.key === "Backspace" && tagDraft.value.length === 0) {
    secondaryTags.value.pop();
  }
};

const close = () => {
  open.value = false;
};

const save = () => {
  // Commit any partially-typed secondary tag before saving.
  addTag();
  if (!canSave.value) return;
  emit("save", {
    name: name.value,
    primaryMuscleGroup: primaryMuscleGroup.value,
    secondaryMuscleGroups: secondaryTags.value,
    notes: notes.value,
    bodyweightFactor: Number(bodyweightFactor.value) || 0,
    // Persist a custom matrix only while overriding; otherwise inherit global.
    rpeMatrix:
      overrideRpe.value && customMatrix.value
        ? clone(customMatrix.value)
        : undefined,
  });
};
</script>

<template>
  <AppBottomSheet v-model:open="open">
    <template #title>
      <div class="flex items-center justify-between gap-4">
        <h2
          class="text-lg font-bold text-text-h-light dark:text-text-h-dark truncate"
        >
          {{ isEditing ? "Edit Exercise" : "New Exercise" }}
        </h2>
        <button
          v-if="isEditing"
          type="button"
          class="px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-red-500/10 text-red-500 hover:bg-red-500/20 dark:bg-red-500/15 dark:text-red-400 dark:hover:bg-red-500/25 transition-colors duration-150 cursor-pointer shrink-0"
          @click="requestDelete"
        >
          Delete
        </button>
      </div>
    </template>
    <div class="flex flex-col gap-6 px-5 py-5">
      <!-- Name -->
      <div class="flex flex-col gap-1.5">
        <label
          class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
        >
          Exercise Name
        </label>
        <input
          v-model="name"
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
          Primary Muscle Group
        </label>
        <input
          v-model="primaryMuscleGroup"
          type="text"
          list="muscle-group-options"
          placeholder="e.g. Quads"
          class="rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark px-3 py-2.5 text-sm text-text-h-light dark:text-text-h-dark placeholder-text-light/40 dark:placeholder-text-dark/40 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
        <datalist id="muscle-group-options">
          <option v-for="g in MUSCLE_GROUPS" :key="g" :value="g" />
        </datalist>
      </div>

      <!-- Secondary muscle groups (tag input) -->
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
          class="flex flex-wrap items-center gap-2 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark px-2.5 py-2 focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-accent/40"
        >
          <span
            v-for="(tag, idx) in secondaryTags"
            :key="tag"
            class="inline-flex items-center gap-1 rounded-md bg-accent/15 py-1 pl-2.5 pr-1 text-xs font-semibold text-accent"
          >
            {{ tag }}
            <button
              type="button"
              class="flex h-4 w-4 items-center justify-center rounded-sm text-accent/80 transition-colors duration-150 hover:bg-accent/20 hover:text-accent cursor-pointer"
              aria-label="Remove muscle group"
              @click="removeTag(idx)"
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
          <input
            v-model="tagDraft"
            type="text"
            list="muscle-group-options"
            :placeholder="secondaryTags.length ? '' : 'Add a muscle group…'"
            class="min-w-[7rem] flex-1 bg-transparent py-1 text-sm text-text-h-light dark:text-text-h-dark placeholder-text-light/40 dark:placeholder-text-dark/40 focus:outline-none"
            @keydown="onTagKeydown"
            @blur="addTag"
          />
        </div>
        <p class="text-xs text-text-light dark:text-text-dark opacity-50">
          Press Enter or comma to add.
        </p>
      </div>

      <!-- Bodyweight factor -->
      <div class="flex flex-col gap-1.5">
        <label
          class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
        >
          Bodyweight Factor
        </label>
        <input
          v-model.number="bodyweightFactor"
          type="number"
          min="0"
          max="2"
          step="0.05"
          class="rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark px-3 py-2.5 font-mono text-sm text-text-h-light dark:text-text-h-dark focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
        <p class="text-xs text-text-light dark:text-text-dark opacity-50">
          Share of bodyweight moved — 1.0 pull-ups, 0.65 push-ups, 0 for
          barbell/dumbbell lifts.
        </p>
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

      <!-- RPE Matrix -->
      <div class="flex flex-col gap-2.5">
        <button
          type="button"
          role="switch"
          :aria-checked="overrideRpe"
          class="flex items-center justify-between gap-4 text-left cursor-pointer group"
          @click="toggleOverride"
        >
          <div class="min-w-0">
            <span
              class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
            >
              Overwrite RPE matrix
            </span>
            <p
              class="mt-0.5 text-xs text-text-light dark:text-text-dark opacity-50"
            >
              {{
                overrideRpe
                  ? "Custom % of 1RM for this exercise."
                  : "Inheriting the global matrix."
              }}
            </p>
          </div>
          <span
            class="relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200"
            :class="
              overrideRpe ? 'bg-accent' : 'bg-border-light dark:bg-border-dark'
            "
          >
            <span
              class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200"
              :class="overrideRpe ? 'translate-x-5' : 'translate-x-0'"
            />
          </span>
        </button>

        <div
          class="transition-opacity duration-200"
          :class="overrideRpe ? '' : 'opacity-60'"
        >
          <RpeMatrixTable
            :model-value="displayMatrix"
            :editable="overrideRpe"
            @update:model-value="customMatrix = $event"
          />
        </div>
      </div>

      <div class="h-2"></div>
    </div>

    <template #footer>
      <button
        class="flex-1 rounded-lg border border-border-light dark:border-border-dark py-3 text-sm font-bold text-text-light dark:text-text-dark transition-colors duration-150 hover:bg-surface-light dark:hover:bg-surface-dark cursor-pointer"
        @click="close"
      >
        Cancel
      </button>
      <button
        class="flex-1 rounded-lg bg-accent py-3 text-sm font-bold text-bg-dark transition-colors duration-150 hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
        :disabled="!canSave"
        @click="save"
      >
        {{ isEditing ? "Save Changes" : "Create Exercise" }}
      </button>
    </template>
  </AppBottomSheet>

  <ConfirmDialog
    v-model:open="showConfirm"
    title="Delete exercise?"
    :message="confirmMessage"
    confirm-label="Delete"
    @confirm="confirmDelete"
  />
</template>
