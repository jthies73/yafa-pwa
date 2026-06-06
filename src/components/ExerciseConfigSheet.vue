<script setup lang="ts">
import { ref, watch } from "vue";
import type { RoutineExerciseConfig, ProgressionModelType } from "../db/types";
import AppBottomSheet from "./AppBottomSheet.vue";
import ConfirmDialog from "./ConfirmDialog.vue";

const showConfirm = ref(false);

const props = defineProps<{
  exerciseName: string;
  isEditing: boolean;
  initialConfig?: RoutineExerciseConfig;
}>();

const open = defineModel<boolean>("open", { required: true });

const emit = defineEmits<{
  (e: "save", config: RoutineExerciseConfig): void;
  (e: "remove"): void;
}>();

const configModel = ref<ProgressionModelType>("linear");
const configParams = ref<Record<string, number>>({});
const configNotes = ref("");

const PROGRESSION_MODELS: { value: ProgressionModelType; label: string }[] = [
  { value: "linear", label: "Linear" },
  { value: "double", label: "Double" },
  { value: "topset_backoff", label: "Top Set" },
];

const DEFAULT_PARAMS: Record<ProgressionModelType, Record<string, number>> = {
  linear: { targetSets: 3, targetReps: 5, weightIncrement: 2.5 },
  double: { targetSets: 3, minReps: 6, maxReps: 10, weightIncrement: 2.5 },
  topset_backoff: {
    topSetTargetReps: 3,
    topSetTargetRpe: 8,
    backOffSets: 3,
    percentageDrop: 10,
    weightIncrement: 2.5,
  },
};

// Reset form state every time the sheet opens, based on current props
watch(
  open,
  (isOpen) => {
    if (!isOpen) return;
    if (props.initialConfig) {
      configModel.value = props.initialConfig.progressionModel;
      configParams.value = {
        ...(props.initialConfig.progressionParams as unknown as Record<
          string,
          number
        >),
      };
      configNotes.value = props.initialConfig.notes ?? "";
    } else {
      configModel.value = "linear";
      configParams.value = { ...DEFAULT_PARAMS.linear };
      configNotes.value = "";
    }
  },
  { immediate: true },
);

const changeModel = (model: ProgressionModelType) => {
  configModel.value = model;
  configParams.value = { ...DEFAULT_PARAMS[model] };
};

const close = () => {
  open.value = false;
};

const save = () => {
  const config: RoutineExerciseConfig = {
    progressionModel: configModel.value,
    progressionParams: { ...configParams.value } as any,
    ...(configNotes.value ? { notes: configNotes.value } : {}),
  };
  emit("save", config);
};
</script>

<template>
  <AppBottomSheet v-model:open="open">
    <template #title>
      <div class="flex items-center justify-between gap-4">
        <div class="min-w-0">
          <p
            class="text-xs font-semibold uppercase tracking-wider text-text-light dark:text-text-dark opacity-50 mb-0.5"
          >
            {{ isEditing ? "Edit Exercise" : "Add Exercise" }}
          </p>
          <h2
            class="text-lg font-bold text-text-h-light dark:text-text-h-dark truncate"
          >
            {{ exerciseName }}
          </h2>
        </div>
        <button
          v-if="isEditing"
          type="button"
          class="px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-red-500/10 text-red-500 hover:bg-red-500/20 dark:bg-red-500/15 dark:text-red-400 dark:hover:bg-red-500/25 transition-colors duration-150 cursor-pointer shrink-0"
          @click="showConfirm = true"
        >
          Remove
        </button>
      </div>
    </template>

    <div class="px-5 py-5 flex flex-col gap-6">
      <!-- Progression Model Selector -->
      <div class="flex flex-col gap-2">
        <label
          class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
        >
          Progression Model
        </label>
        <div
          class="flex gap-1 p-1 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl"
        >
          <button
            v-for="m in PROGRESSION_MODELS"
            :key="m.value"
            :class="
              configModel === m.value
                ? 'bg-accent text-bg-dark'
                : 'text-text-light dark:text-text-dark hover:text-text-h-light dark:hover:text-text-h-dark'
            "
            class="flex-1 text-xs font-bold py-2 px-2 rounded-lg cursor-pointer transition-colors duration-150"
            @click="changeModel(m.value)"
          >
            {{ m.label }}
          </button>
        </div>
      </div>

      <!-- Linear params -->
      <div v-if="configModel === 'linear'" class="flex flex-col gap-4">
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1.5">
            <label
              class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
            >
              Sets
            </label>
            <input
              v-model.number="configParams.targetSets"
              type="number"
              min="1"
              max="20"
              step="1"
              class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg px-3 py-2.5 text-sm font-mono text-text-h-light dark:text-text-h-dark focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50"
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <label
              class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
            >
              Reps
            </label>
            <input
              v-model.number="configParams.targetReps"
              type="number"
              min="1"
              max="100"
              step="1"
              class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg px-3 py-2.5 text-sm font-mono text-text-h-light dark:text-text-h-dark focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50"
            />
          </div>
        </div>
        <div class="flex flex-col gap-1.5">
          <label
            class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
          >
            Weight Increment (kg)
          </label>
          <input
            v-model.number="configParams.weightIncrement"
            type="number"
            min="0.25"
            max="20"
            step="0.25"
            class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg px-3 py-2.5 text-sm font-mono text-text-h-light dark:text-text-h-dark focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50"
          />
        </div>
      </div>

      <!-- Double progression params -->
      <div v-else-if="configModel === 'double'" class="flex flex-col gap-4">
        <div class="grid grid-cols-3 gap-4">
          <div class="flex flex-col gap-1.5">
            <label
              class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
            >
              Sets
            </label>
            <input
              v-model.number="configParams.targetSets"
              type="number"
              min="1"
              max="20"
              step="1"
              class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg px-3 py-2.5 text-sm font-mono text-text-h-light dark:text-text-h-dark focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50"
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <label
              class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
            >
              Min Reps
            </label>
            <input
              v-model.number="configParams.minReps"
              type="number"
              min="1"
              max="100"
              step="1"
              class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg px-3 py-2.5 text-sm font-mono text-text-h-light dark:text-text-h-dark focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50"
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <label
              class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
            >
              Max Reps
            </label>
            <input
              v-model.number="configParams.maxReps"
              type="number"
              min="1"
              max="100"
              step="1"
              class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg px-3 py-2.5 text-sm font-mono text-text-h-light dark:text-text-h-dark focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50"
            />
          </div>
        </div>
        <div class="flex flex-col gap-1.5">
          <label
            class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
          >
            Weight Increment (kg)
          </label>
          <input
            v-model.number="configParams.weightIncrement"
            type="number"
            min="0.25"
            max="20"
            step="0.25"
            class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg px-3 py-2.5 text-sm font-mono text-text-h-light dark:text-text-h-dark focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50"
          />
        </div>
      </div>

      <!-- Top Set + Backoff params -->
      <div
        v-else-if="configModel === 'topset_backoff'"
        class="flex flex-col gap-4"
      >
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1.5">
            <label
              class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
            >
              Top Set Reps
            </label>
            <input
              v-model.number="configParams.topSetTargetReps"
              type="number"
              min="1"
              max="30"
              step="1"
              class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg px-3 py-2.5 text-sm font-mono text-text-h-light dark:text-text-h-dark focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50"
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <label
              class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
            >
              Target RPE
            </label>
            <input
              v-model.number="configParams.topSetTargetRpe"
              type="number"
              min="5"
              max="10"
              step="0.5"
              class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg px-3 py-2.5 text-sm font-mono text-text-h-light dark:text-text-h-dark focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50"
            />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1.5">
            <label
              class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
            >
              Back-Off Sets
            </label>
            <input
              v-model.number="configParams.backOffSets"
              type="number"
              min="0"
              max="10"
              step="1"
              class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg px-3 py-2.5 text-sm font-mono text-text-h-light dark:text-text-h-dark focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50"
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <label
              class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
            >
              % Drop
            </label>
            <input
              v-model.number="configParams.percentageDrop"
              type="number"
              min="1"
              max="50"
              step="1"
              class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg px-3 py-2.5 text-sm font-mono text-text-h-light dark:text-text-h-dark focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50"
            />
          </div>
        </div>
        <div class="flex flex-col gap-1.5">
          <label
            class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
          >
            Weight Increment (kg)
          </label>
          <input
            v-model.number="configParams.weightIncrement"
            type="number"
            min="0.25"
            max="20"
            step="0.25"
            class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg px-3 py-2.5 text-sm font-mono text-text-h-light dark:text-text-h-dark focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50"
          />
        </div>
      </div>

      <!-- Notes -->
      <div class="flex flex-col gap-1.5">
        <label
          class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
        >
          Notes
          <span class="normal-case font-normal opacity-60 ml-1"
            >(optional)</span
          >
        </label>
        <textarea
          v-model="configNotes"
          rows="3"
          placeholder="Any specific cues or notes for this exercise..."
          class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg px-3 py-2.5 text-sm text-text-h-light dark:text-text-h-dark placeholder-text-light/40 dark:placeholder-text-dark/40 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50 resize-none"
        ></textarea>
      </div>
      <!-- Bottom padding -->
      <div class="h-2"></div>
    </div>

    <template #footer>
      <button
        class="flex-1 py-3 text-sm font-bold rounded-lg cursor-pointer transition-colors duration-150 border border-border-light dark:border-border-dark text-text-light dark:text-text-dark hover:bg-surface-light dark:hover:bg-surface-dark"
        @click="close"
      >
        Cancel
      </button>
      <button
        class="flex-1 py-3 text-sm font-bold rounded-lg cursor-pointer transition-colors duration-150 bg-accent hover:bg-accent/90 text-bg-dark"
        @click="save"
      >
        {{ isEditing ? "Save Changes" : "Add Exercise" }}
      </button>
    </template>
  </AppBottomSheet>

  <ConfirmDialog
    v-model:open="showConfirm"
    title="Remove exercise?"
    :message="`Remove '${exerciseName}' from this routine?`"
    confirm-label="Remove"
    @confirm="$emit('remove')"
  />
</template>
