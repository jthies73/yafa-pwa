<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type {
  RoutineExerciseConfig,
  ProgressionModelType,
  ProgressionParams,
  WeightIncrementUnit,
} from "../db/types";
import { LOCKABLE_FIELDS } from "../config/periodization";
import { normalizeProgressionParams } from "../config/progression";
import AppBottomSheet from "./AppBottomSheet.vue";
import ConfirmDialog from "./ConfirmDialog.vue";
import LockToggle from "./LockToggle.vue";
import ExerciseRpeMatrixEditor from "./ExerciseRpeMatrixEditor.vue";
import WeightIncrementField from "./WeightIncrementField.vue";
import InfoIcon from "./InfoIcon.vue";

const showConfirm = ref(false);
const matrixEditor = ref<InstanceType<typeof ExerciseRpeMatrixEditor> | null>(
  null,
);
// Only one model's WeightIncrementField is mounted at a time (the others sit
// behind v-if), so a single ref resolves to whichever is active. Same for the
// fatigue-reduction instance of the field.
const incrementField = ref<InstanceType<typeof WeightIncrementField> | null>(
  null,
);
const fatigueField = ref<InstanceType<typeof WeightIncrementField> | null>(
  null,
);

const props = defineProps<{
  exerciseName: string;
  isEditing: boolean;
  exerciseId?: string;
  initialConfig?: RoutineExerciseConfig;
  // The exercise's GLOBAL note (Exercise.notes) — edited here and saved back to the
  // exercise, not the routine slot, so it's shared everywhere the exercise is used.
  initialNotes?: string;
  periodizationEnabled?: boolean;
}>();

const open = defineModel<boolean>("open", { required: true });

const emit = defineEmits<{
  (e: "save", config: RoutineExerciseConfig): void;
  (e: "save-notes", notes: string | undefined): void;
  (e: "remove"): void;
  (e: "open-detail"): void;
}>();

const configModel = ref<ProgressionModelType>("linear");
// Params now hold mixed value types (numbers + the increment-unit string). Each
// model renders only the keys it owns; normalizeProgressionParams guarantees the
// required fields (targetRpe/rpeCeiling/incrementUnit) are present even for
// configs saved before those fields existed (see config/progression.ts).
const configParams = ref<Record<string, number | WeightIncrementUnit>>({});
const configNotes = ref("");
const lockedFields = ref<Set<string>>(new Set());
// Advanced (RPE target/ceiling + increment) starts collapsed on every open so
// the sheet leads with the everyday Sets/Reps fields.
const advancedOpen = ref(false);

// Typed bridges for the WeightIncrementField models — keeps its number/unit
// contract clean against the loosely-typed configParams record.
const incrementValue = computed<number>({
  get: () => Number(configParams.value.weightIncrement ?? 0),
  set: (v) => (configParams.value.weightIncrement = v),
});
const incrementUnit = computed<WeightIncrementUnit>({
  get: () => (configParams.value.incrementUnit as WeightIncrementUnit) ?? "kg",
  set: (v) => (configParams.value.incrementUnit = v),
});
const fatigueValue = computed<number>({
  get: () => Number(configParams.value.fatigueReduction ?? 0),
  set: (v) => (configParams.value.fatigueReduction = v),
});
const fatigueUnit = computed<WeightIncrementUnit>({
  get: () =>
    (configParams.value.fatigueReductionUnit as WeightIncrementUnit) ?? "kg",
  set: (v) => (configParams.value.fatigueReductionUnit = v),
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
  { value: "none", label: "None" },
];

// Normalized params as the loose record the form binds to.
const paramsFor = (
  model: ProgressionModelType,
  saved?: ProgressionParams,
): Record<string, number | WeightIncrementUnit> =>
  normalizeProgressionParams(model, saved) as unknown as Record<
    string,
    number | WeightIncrementUnit
  >;

// Reset form state every time the sheet opens, based on current props.
watch(
  open,
  (isOpen) => {
    if (!isOpen) return;
    advancedOpen.value = false;
    // The note is the exercise's global note, independent of the progression config.
    configNotes.value = props.initialNotes ?? "";
    if (props.initialConfig) {
      configModel.value = props.initialConfig.progressionModel;
      configParams.value = paramsFor(
        props.initialConfig.progressionModel,
        props.initialConfig.progressionParams,
      );
      lockedFields.value = new Set(props.initialConfig.lockedFields ?? []);
    } else {
      configModel.value = "linear";
      configParams.value = paramsFor("linear");
      lockedFields.value = new Set();
    }
  },
  { immediate: true },
);

const changeModel = (model: ProgressionModelType) => {
  configModel.value = model;
  configParams.value = paramsFor(model);
  // Field keys differ per model, so drop any locks that no longer apply.
  lockedFields.value = new Set();
};

const close = () => {
  open.value = false;
};

const save = async () => {
  incrementField.value?.commit(); // flush the kg buffers in case Save skipped blur
  fatigueField.value?.commit();
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
    ...(applicableLocks.length ? { lockedFields: applicableLocks } : {}),
  };
  // The note saves to the exercise (global), separate from the routine config.
  emit("save-notes", configNotes.value.trim() || undefined);
  emit("save", config);
};
</script>

<template>
  <AppBottomSheet v-model:open="open">
    <template #title>
      <div class="flex items-center justify-between gap-4 w-full">
        <div class="min-w-0">
          <p
            class="text-xs font-semibold uppercase tracking-wider text-text-light dark:text-text-dark opacity-50 mb-0.5"
          >
            {{ isEditing ? "Edit Exercise" : "Add Exercise" }}
          </p>
          <button
            v-if="exerciseId"
            type="button"
            class="text-left text-lg font-bold text-text-h-light dark:text-text-h-dark truncate cursor-pointer hover:text-accent transition-colors duration-150"
            title="View exercise details"
            @click="emit('open-detail')"
          >
            {{ exerciseName }}
          </button>
          <h2
            v-else
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
        <span class="flex items-center gap-1">
          <label
            class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
          >
            Progression Model
          </label>
          <InfoIcon topic="progressionModel" />
        </span>
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
        <!-- Basic -->
        <div class="grid grid-cols-2 gap-4">
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
        </div>

        <!-- Advanced -->
        <button
          type="button"
          class="flex items-center justify-between gap-2 cursor-pointer group"
          @click="advancedOpen = !advancedOpen"
        >
          <span
            class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60 group-hover:opacity-90 transition-opacity"
          >
            Advanced
          </span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="text-text-light dark:text-text-dark opacity-50 transition-transform duration-150"
            :class="advancedOpen ? 'rotate-90' : ''"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
        <div
          class="grid transition-[grid-template-rows,opacity] duration-150 ease-out"
          :class="
            advancedOpen
              ? 'grid-rows-[1fr] opacity-100'
              : 'grid-rows-[0fr] opacity-0'
          "
        >
          <div class="min-h-0 overflow-hidden">
            <div class="flex flex-col gap-4 pt-1">
              <div class="grid grid-cols-2 gap-4">
                <div class="flex flex-col gap-1.5">
                  <div
                    class="flex items-center justify-between gap-1 min-h-[18px]"
                  >
                    <span class="flex items-center gap-1">
                      <label
                        class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
                      >
                        Target RPE
                      </label>
                      <InfoIcon topic="targetRpe" />
                    </span>
                    <LockToggle
                      v-if="periodizationEnabled"
                      :locked="isLocked('targetRpe')"
                      @toggle="toggleLock('targetRpe')"
                    />
                  </div>
                  <input
                    v-model.number="configParams.targetRpe"
                    v-numpad="'decimal'"
                    v-keynav
                    type="number"
                    min="5"
                    max="10"
                    step="0.5"
                    class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg px-3 py-2.5 text-sm font-mono text-text-h-light dark:text-text-h-dark focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50"
                  />
                </div>
                <div class="flex flex-col gap-1.5">
                  <div class="flex items-center gap-1">
                    <label
                      class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
                    >
                      RPE Ceiling
                    </label>
                    <InfoIcon topic="rpeCeiling" />
                  </div>
                  <input
                    v-model.number="configParams.rpeCeiling"
                    v-numpad="'decimal'"
                    v-keynav
                    type="number"
                    min="5"
                    max="10"
                    step="0.5"
                    class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg px-3 py-2.5 text-sm font-mono text-text-h-light dark:text-text-h-dark focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50"
                  />
                </div>
              </div>
              <WeightIncrementField
                ref="incrementField"
                v-model:value="incrementValue"
                v-model:unit="incrementUnit"
                info-topic="weightIncrement"
              />
              <WeightIncrementField
                ref="fatigueField"
                v-model:value="fatigueValue"
                v-model:unit="fatigueUnit"
                label="Fatigue Reduction"
                info-topic="fatigueReduction"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Double progression params -->
      <div v-else-if="configModel === 'double'" class="flex flex-col gap-4">
        <!-- Basic -->
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

        <!-- Advanced -->
        <button
          type="button"
          class="flex items-center justify-between gap-2 cursor-pointer group"
          @click="advancedOpen = !advancedOpen"
        >
          <span
            class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60 group-hover:opacity-90 transition-opacity"
          >
            Advanced
          </span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="text-text-light dark:text-text-dark opacity-50 transition-transform duration-150"
            :class="advancedOpen ? 'rotate-90' : ''"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
        <div
          class="grid transition-[grid-template-rows,opacity] duration-150 ease-out"
          :class="
            advancedOpen
              ? 'grid-rows-[1fr] opacity-100'
              : 'grid-rows-[0fr] opacity-0'
          "
        >
          <div class="min-h-0 overflow-hidden">
            <div class="flex flex-col gap-4 pt-1">
              <div class="grid grid-cols-2 gap-4">
                <div class="flex flex-col gap-1.5">
                  <div
                    class="flex items-center justify-between gap-1 min-h-[18px]"
                  >
                    <span class="flex items-center gap-1">
                      <label
                        class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
                      >
                        Target RPE
                      </label>
                      <InfoIcon topic="targetRpe" />
                    </span>
                    <LockToggle
                      v-if="periodizationEnabled"
                      :locked="isLocked('targetRpe')"
                      @toggle="toggleLock('targetRpe')"
                    />
                  </div>
                  <input
                    v-model.number="configParams.targetRpe"
                    v-numpad="'decimal'"
                    v-keynav
                    type="number"
                    min="5"
                    max="10"
                    step="0.5"
                    class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg px-3 py-2.5 text-sm font-mono text-text-h-light dark:text-text-h-dark focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50"
                  />
                </div>
                <div class="flex flex-col gap-1.5">
                  <div class="flex items-center gap-1">
                    <label
                      class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
                    >
                      RPE Ceiling
                    </label>
                    <InfoIcon topic="rpeCeiling" />
                  </div>
                  <input
                    v-model.number="configParams.rpeCeiling"
                    v-numpad="'decimal'"
                    v-keynav
                    type="number"
                    min="5"
                    max="10"
                    step="0.5"
                    class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg px-3 py-2.5 text-sm font-mono text-text-h-light dark:text-text-h-dark focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50"
                  />
                </div>
              </div>
              <WeightIncrementField
                ref="incrementField"
                v-model:value="incrementValue"
                v-model:unit="incrementUnit"
                info-topic="weightIncrement"
              />
              <WeightIncrementField
                ref="fatigueField"
                v-model:value="fatigueValue"
                v-model:unit="fatigueUnit"
                label="Fatigue Reduction"
                info-topic="fatigueReduction"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Top Set + Backoff params -->
      <div
        v-else-if="configModel === 'topset_backoff'"
        class="flex flex-col gap-4"
      >
        <!-- Basic -->
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
            <div class="flex items-center gap-1">
              <label
                class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
              >
                % Drop
              </label>
              <InfoIcon topic="percentageDrop" />
            </div>
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
          <div class="flex flex-col gap-1.5">
            <div class="flex items-center gap-1">
              <label
                class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
              >
                Back-Off Sets
              </label>
              <InfoIcon topic="backOffSets" />
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
            <div class="flex items-center gap-1">
              <label
                class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
              >
                Back-Off RPE
              </label>
              <InfoIcon topic="backOffRpe" />
            </div>
            <input
              v-model.number="configParams.backOffRpe"
              v-numpad="'decimal'"
              v-keynav
              type="number"
              min="5"
              max="10"
              step="0.5"
              class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg px-3 py-2.5 text-sm font-mono text-text-h-light dark:text-text-h-dark focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50"
            />
          </div>
        </div>

        <!-- Advanced -->
        <button
          type="button"
          class="flex items-center justify-between gap-2 cursor-pointer group"
          @click="advancedOpen = !advancedOpen"
        >
          <span
            class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60 group-hover:opacity-90 transition-opacity"
          >
            Advanced
          </span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="text-text-light dark:text-text-dark opacity-50 transition-transform duration-150"
            :class="advancedOpen ? 'rotate-90' : ''"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
        <div
          class="grid transition-[grid-template-rows,opacity] duration-150 ease-out"
          :class="
            advancedOpen
              ? 'grid-rows-[1fr] opacity-100'
              : 'grid-rows-[0fr] opacity-0'
          "
        >
          <div class="min-h-0 overflow-hidden">
            <div class="flex flex-col gap-4 pt-1">
              <div class="grid grid-cols-2 gap-4">
                <div class="flex flex-col gap-1.5">
                  <div
                    class="flex items-center justify-between gap-1 min-h-[18px]"
                  >
                    <span class="flex items-center gap-1">
                      <label
                        class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
                      >
                        Target RPE
                      </label>
                      <InfoIcon topic="targetRpe" />
                    </span>
                    <LockToggle
                      v-if="periodizationEnabled"
                      :locked="isLocked('topSetTargetRpe')"
                      @toggle="toggleLock('topSetTargetRpe')"
                    />
                  </div>
                  <input
                    v-model.number="configParams.topSetTargetRpe"
                    v-numpad="'decimal'"
                    v-keynav
                    type="number"
                    min="5"
                    max="10"
                    step="0.5"
                    class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg px-3 py-2.5 text-sm font-mono text-text-h-light dark:text-text-h-dark focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50"
                  />
                </div>
                <div class="flex flex-col gap-1.5">
                  <div class="flex items-center gap-1">
                    <label
                      class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
                    >
                      RPE Ceiling
                    </label>
                    <InfoIcon topic="rpeCeiling" />
                  </div>
                  <input
                    v-model.number="configParams.rpeCeiling"
                    v-numpad="'decimal'"
                    v-keynav
                    type="number"
                    min="5"
                    max="10"
                    step="0.5"
                    class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg px-3 py-2.5 text-sm font-mono text-text-h-light dark:text-text-h-dark focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50"
                  />
                </div>
              </div>
              <WeightIncrementField
                ref="incrementField"
                v-model:value="incrementValue"
                v-model:unit="incrementUnit"
                info-topic="weightIncrement"
              />
              <WeightIncrementField
                ref="fatigueField"
                v-model:value="fatigueValue"
                v-model:unit="fatigueUnit"
                label="Fatigue Reduction"
                info-topic="fatigueReduction"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- No progression params -->
      <div v-else-if="configModel === 'none'" class="flex flex-col gap-4">
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
              <span class="flex items-center gap-1">
                <label
                  class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
                >
                  Target RPE
                </label>
                <InfoIcon topic="targetRpe" />
              </span>
              <LockToggle
                v-if="periodizationEnabled"
                :locked="isLocked('targetRpe')"
                @toggle="toggleLock('targetRpe')"
              />
            </div>
            <input
              v-model.number="configParams.targetRpe"
              v-numpad="'decimal'"
              v-keynav
              type="number"
              min="5"
              max="10"
              step="0.5"
              class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg px-3 py-2.5 text-sm font-mono text-text-h-light dark:text-text-h-dark focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50"
            />
          </div>
        </div>
        <p class="text-xs text-text-light dark:text-text-dark opacity-55">
          Weight targets are derived from your e1RM but won't auto-increment
          after sessions.
        </p>

        <!-- Advanced -->
        <button
          type="button"
          class="flex items-center justify-between gap-2 cursor-pointer group"
          @click="advancedOpen = !advancedOpen"
        >
          <span
            class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60 group-hover:opacity-90 transition-opacity"
          >
            Advanced
          </span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="text-text-light dark:text-text-dark opacity-50 transition-transform duration-150"
            :class="advancedOpen ? 'rotate-90' : ''"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
        <div
          class="grid transition-[grid-template-rows,opacity] duration-150 ease-out"
          :class="
            advancedOpen
              ? 'grid-rows-[1fr] opacity-100'
              : 'grid-rows-[0fr] opacity-0'
          "
        >
          <div class="min-h-0 overflow-hidden">
            <div class="flex flex-col gap-4 pt-1">
              <WeightIncrementField
                ref="fatigueField"
                v-model:value="fatigueValue"
                v-model:unit="fatigueUnit"
                label="Fatigue Reduction"
                info-topic="fatigueReduction"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Notes (global, saved to the exercise) -->
      <div class="flex flex-col gap-1.5">
        <label
          class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
        >
          Exercise Note
          <span class="normal-case font-normal opacity-60 ml-1"
            >(presented during workout)</span
          >
        </label>
        <textarea
          v-model="configNotes"
          rows="3"
          placeholder="Seat height, machine setup, form cues…"
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
