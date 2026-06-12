<script setup lang="ts">
import { ref, watch } from "vue";
import type {
  RoutineExerciseConfig,
  ProgressionModelType,
  ProgressionParams,
} from "../db/types";
import { LOCKABLE_FIELDS } from "../config/periodization";
import { useWeightUnit } from "../composables/useWeightUnit";
import { useWeightField } from "../composables/useWeightField";
import AppBottomSheet from "./AppBottomSheet.vue";
import ConfirmDialog from "./ConfirmDialog.vue";
import LockToggle from "./LockToggle.vue";
import ExerciseRpeMatrixEditor from "./ExerciseRpeMatrixEditor.vue";

const showConfirm = ref(false);
const matrixEditor = ref<InstanceType<typeof ExerciseRpeMatrixEditor> | null>(
  null,
);

const props = defineProps<{
  exerciseName: string;
  isEditing: boolean;
  exerciseId?: string;
  initialConfig?: RoutineExerciseConfig;
  periodizationEnabled?: boolean;
}>();

const open = defineModel<boolean>("open", { required: true });

const emit = defineEmits<{
  (e: "save", config: RoutineExerciseConfig): void;
  (e: "remove"): void;
}>();

const configModel = ref<ProgressionModelType>("linear");
const configParams = ref<Record<string, number>>({});
const configNotes = ref("");
const lockedFields = ref<Set<string>>(new Set());

// weightIncrement is stored in kg; show/edit it in the active unit. One bridge
// serves all three model variants (only one is rendered at a time).
const { label: weightUnit } = useWeightUnit();
const {
  buffer: incrementBuffer,
  onFocus: onIncrementFocus,
  commit: commitIncrement,
} = useWeightField({
  getKg: () =>
    typeof configParams.value.weightIncrement === "number"
      ? configParams.value.weightIncrement
      : null,
  setKg: (kg) => (configParams.value.weightIncrement = kg ?? 0),
});

const isLocked = (field: string) => lockedFields.value.has(field);

const toggleLock = (field: string) => {
  const next = new Set(lockedFields.value);
  if (next.has(field)) {
    next.delete(field);
  } else {
    next.add(field);
  }
  lockedFields.value = next;
};

const PROGRESSION_MODELS: { value: ProgressionModelType; label: string }[] = [
  { value: "linear", label: "Linear" },
  { value: "double", label: "Double" },
  { value: "topset_backoff", label: "Top Set" },
];

const DEFAULT_PARAMS: Record<ProgressionModelType, Record<string, number>> = {
  linear: { targetSets: 3, targetReps: 5, targetRpe: 8, weightIncrement: 2.5 },
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
      lockedFields.value = new Set(props.initialConfig.lockedFields ?? []);
    } else {
      configModel.value = "linear";
      configParams.value = { ...DEFAULT_PARAMS.linear };
      configNotes.value = "";
      lockedFields.value = new Set();
    }
  },
  { immediate: true },
);

const changeModel = (model: ProgressionModelType) => {
  configModel.value = model;
  configParams.value = { ...DEFAULT_PARAMS[model] };
  // Field keys differ per model, so drop any locks that no longer apply.
  lockedFields.value = new Set();
};

const close = () => {
  open.value = false;
};

const save = async () => {
  commitIncrement(); // flush the weight buffer to kg in case Save skipped blur
  // The matrix editor owns its own override persistence.
  await matrixEditor.value?.persist();
  // Only persist locks for fields that are lockable under the current model.
  const applicableLocks = LOCKABLE_FIELDS[configModel.value].filter((f) =>
    lockedFields.value.has(f),
  );
  const config: RoutineExerciseConfig = {
    progressionModel: configModel.value,
    progressionParams: {
      ...configParams.value,
    } as unknown as ProgressionParams,
    ...(configNotes.value ? { notes: configNotes.value } : {}),
    ...(applicableLocks.length ? { lockedFields: applicableLocks } : {}),
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

      <!-- Periodization lock hint -->
      <div
        v-if="periodizationEnabled"
        class="flex items-start gap-2.5 rounded-lg bg-accent/5 border border-accent/20 px-3.5 py-3"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="text-accent shrink-0 mt-0.5"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
        <p class="text-xs text-text-light dark:text-text-dark opacity-80">
          This plan uses periodization. Unlocked fields may be adjusted by the
          mesocycle when generating each workout. Lock a field to keep its value
          fixed.
        </p>
      </div>

      <!-- Linear params -->
      <div v-if="configModel === 'linear'" class="flex flex-col gap-4">
        <div class="grid grid-cols-3 gap-4">
          <div class="flex flex-col gap-1.5">
            <div class="flex items-center justify-between gap-1 min-h-[18px]">
              <label
                class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
              >
                Sets
              </label>
              <LockToggle
                v-if="periodizationEnabled"
                :locked="isLocked('targetSets')"
                @toggle="toggleLock('targetSets')"
              />
            </div>
            <input
              v-model.number="configParams.targetSets"
              v-numpad
              v-keynav
              type="number"
              min="1"
              max="20"
              step="1"
              class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg px-3 py-2.5 text-sm font-mono text-text-h-light dark:text-text-h-dark focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50"
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <div class="flex items-center justify-between gap-1 min-h-[18px]">
              <label
                class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
              >
                Reps
              </label>
              <LockToggle
                v-if="periodizationEnabled"
                :locked="isLocked('targetReps')"
                @toggle="toggleLock('targetReps')"
              />
            </div>
            <input
              v-model.number="configParams.targetReps"
              v-numpad
              v-keynav
              type="number"
              min="1"
              max="100"
              step="1"
              class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg px-3 py-2.5 text-sm font-mono text-text-h-light dark:text-text-h-dark focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50"
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <div class="flex items-center justify-between gap-1 min-h-[18px]">
              <label
                class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
              >
                Target RPE
              </label>
              <LockToggle
                v-if="periodizationEnabled"
                :locked="isLocked('targetRpe')"
                @toggle="toggleLock('targetRpe')"
              />
            </div>
            <input
              v-model.number="configParams.targetRpe"
              v-numpad
              v-keynav
              type="number"
              min="5"
              max="10"
              step="0.5"
              class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg px-3 py-2.5 text-sm font-mono text-text-h-light dark:text-text-h-dark focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50"
            />
          </div>
        </div>
        <div class="flex flex-col gap-1.5">
          <label
            class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
          >
            Weight Increment ({{ weightUnit }})
          </label>
          <input
            v-model="incrementBuffer"
            v-numpad="'decimal'"
            v-keynav
            type="text"
            class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg px-3 py-2.5 text-sm font-mono text-text-h-light dark:text-text-h-dark focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50"
            @focus="onIncrementFocus"
            @blur="commitIncrement"
          />
        </div>
      </div>

      <!-- Double progression params -->
      <div v-else-if="configModel === 'double'" class="flex flex-col gap-4">
        <div class="grid grid-cols-3 gap-4">
          <div class="flex flex-col gap-1.5">
            <div class="flex items-center justify-between gap-1 min-h-[18px]">
              <label
                class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
              >
                Sets
              </label>
              <LockToggle
                v-if="periodizationEnabled"
                :locked="isLocked('targetSets')"
                @toggle="toggleLock('targetSets')"
              />
            </div>
            <input
              v-model.number="configParams.targetSets"
              v-numpad
              v-keynav
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
              v-numpad
              v-keynav
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
              v-numpad
              v-keynav
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
            Weight Increment ({{ weightUnit }})
          </label>
          <input
            v-model="incrementBuffer"
            v-numpad="'decimal'"
            v-keynav
            type="text"
            class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg px-3 py-2.5 text-sm font-mono text-text-h-light dark:text-text-h-dark focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50"
            @focus="onIncrementFocus"
            @blur="commitIncrement"
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
            <div class="flex items-center justify-between gap-1 min-h-[18px]">
              <label
                class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
              >
                Top Set Reps
              </label>
              <LockToggle
                v-if="periodizationEnabled"
                :locked="isLocked('topSetTargetReps')"
                @toggle="toggleLock('topSetTargetReps')"
              />
            </div>
            <input
              v-model.number="configParams.topSetTargetReps"
              v-numpad
              v-keynav
              type="number"
              min="1"
              max="30"
              step="1"
              class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg px-3 py-2.5 text-sm font-mono text-text-h-light dark:text-text-h-dark focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50"
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <div class="flex items-center justify-between gap-1 min-h-[18px]">
              <label
                class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
              >
                Target RPE
              </label>
              <LockToggle
                v-if="periodizationEnabled"
                :locked="isLocked('topSetTargetRpe')"
                @toggle="toggleLock('topSetTargetRpe')"
              />
            </div>
            <input
              v-model.number="configParams.topSetTargetRpe"
              v-numpad
              v-keynav
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
            <div class="flex items-center justify-between gap-1 min-h-[18px]">
              <label
                class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
              >
                Back-Off Sets
              </label>
              <LockToggle
                v-if="periodizationEnabled"
                :locked="isLocked('backOffSets')"
                @toggle="toggleLock('backOffSets')"
              />
            </div>
            <input
              v-model.number="configParams.backOffSets"
              v-numpad
              v-keynav
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
              v-numpad
              v-keynav
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
            Weight Increment ({{ weightUnit }})
          </label>
          <input
            v-model="incrementBuffer"
            v-numpad="'decimal'"
            v-keynav
            type="text"
            class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg px-3 py-2.5 text-sm font-mono text-text-h-light dark:text-text-h-dark focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50"
            @focus="onIncrementFocus"
            @blur="commitIncrement"
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

      <!-- RPE Matrix -->
      <ExerciseRpeMatrixEditor
        ref="matrixEditor"
        :exercise-id="exerciseId"
        :open="open"
      />
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
        class="flex-1 py-3 text-sm font-bold rounded-lg cursor-pointer transition-colors duration-150 bg-accent hover:bg-accent-hover text-bg-dark"
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
