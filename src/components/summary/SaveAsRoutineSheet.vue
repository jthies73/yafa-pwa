<script lang="ts">
export type SaveAsRoutinePayload = {
  routineName: string;
  target:
    | { kind: "existing"; planId: string }
    | { kind: "new"; planName: string; active: boolean };
};
</script>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import AppBottomSheet from "../AppBottomSheet.vue";
import InfoIcon from "../InfoIcon.vue";
import { db } from "../../db/db";
import type { Plan } from "../../db/types";
import { useActiveWorkout } from "../../composables/useActiveWorkout";

const open = defineModel<boolean>("open", { required: true });

const emit = defineEmits<{
  (e: "save", payload: SaveAsRoutinePayload): void;
}>();

const { finishedWorkout, finishedExerciseNames } = useActiveWorkout();

const routineName = ref("");
const destination = ref<"existing" | "new">("new");
const plans = ref<Plan[]>([]);
const selectedPlanId = ref<string | null>(null);
const planName = ref("");
const setActive = ref(true);

const exerciseCount = computed(
  () => finishedWorkout.value?.exercises.length ?? 0,
);

const previewNames = computed(() => {
  const map = finishedExerciseNames.value;
  const seen = new Set<string>();
  const names: string[] = [];
  for (const ex of finishedWorkout.value?.exercises ?? []) {
    const name = map[ex.exerciseId];
    if (name && !seen.has(ex.exerciseId)) {
      seen.add(ex.exerciseId);
      names.push(name);
    }
  }
  return names;
});

const suggestedName = (): string => {
  const ts = finishedWorkout.value?.startTime ?? Date.now();
  const day = new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return `Workout — ${day}`;
};

// Seed the form each time the sheet opens; load plans and force "new" mode when
// the user has none yet.
watch(open, async (isOpen) => {
  if (!isOpen) return;
  routineName.value = suggestedName();
  planName.value = "";
  setActive.value = true;
  selectedPlanId.value = null;
  const all = await db.plans.toArray();
  plans.value = all.sort((a, b) => b.created_at - a.created_at);
  if (plans.value.length === 0) {
    destination.value = "new";
  } else {
    destination.value = "existing";
    selectedPlanId.value = plans.value[0].id;
  }
});

const canSave = computed(() => {
  if (!routineName.value.trim()) return false;
  return destination.value === "existing"
    ? !!selectedPlanId.value
    : planName.value.trim().length > 0;
});

const close = () => {
  open.value = false;
};

const save = () => {
  if (!canSave.value) return;
  const payload: SaveAsRoutinePayload =
    destination.value === "existing"
      ? {
          routineName: routineName.value,
          target: { kind: "existing", planId: selectedPlanId.value! },
        }
      : {
          routineName: routineName.value,
          target: {
            kind: "new",
            planName: planName.value,
            active: setActive.value,
          },
        };
  emit("save", payload);
};

const dismissKeyboard = (e: KeyboardEvent) => {
  (e.target as HTMLElement)?.blur?.();
};
</script>

<template>
  <AppBottomSheet v-model:open="open" title="Save as Routine">
    <div class="flex flex-col gap-6 px-5 py-5">
      <!-- Preview + info -->
      <div
        class="flex items-center justify-between gap-2 rounded-lg border border-accent/20 bg-accent/5 px-4 py-3"
      >
        <div class="min-w-0">
          <p
            class="text-sm font-semibold text-text-h-light dark:text-text-h-dark"
          >
            {{ exerciseCount }}
            {{ exerciseCount === 1 ? "exercise" : "exercises" }} · progression:
            none
          </p>
          <p
            v-if="previewNames.length"
            class="mt-0.5 truncate text-xs text-text-light dark:text-text-dark opacity-60"
          >
            {{ previewNames.join(", ") }}
          </p>
        </div>
        <InfoIcon topic="plansRoutines" />
      </div>

      <!-- Routine name -->
      <div class="flex flex-col gap-1.5">
        <label
          class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
        >
          Routine Name
        </label>
        <input
          v-model="routineName"
          type="text"
          placeholder="e.g. Upper Day"
          class="rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark px-3 py-2.5 text-sm text-text-h-light dark:text-text-h-dark placeholder-text-light/40 dark:placeholder-text-dark/40 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/40"
          @keyup.enter="dismissKeyboard"
        />
      </div>

      <!-- Destination -->
      <div class="flex flex-col gap-1.5">
        <label
          class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
        >
          Add to Plan
        </label>
        <!-- Segmented selector (hidden when there are no plans to pick) -->
        <div
          v-if="plans.length"
          class="flex gap-1 p-1 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl"
        >
          <button
            v-for="opt in [
              { value: 'existing', label: 'Existing plan' },
              { value: 'new', label: 'New plan' },
            ]"
            :key="opt.value"
            :class="
              destination === opt.value
                ? 'bg-accent text-bg-dark'
                : 'text-text-light dark:text-text-dark hover:text-text-h-light dark:hover:text-text-h-dark'
            "
            class="flex-1 text-xs font-bold py-2 px-2 rounded-lg cursor-pointer transition-colors duration-150"
            @click="destination = opt.value as 'existing' | 'new'"
          >
            {{ opt.label }}
          </button>
        </div>

        <!-- Existing plan picker -->
        <div v-if="destination === 'existing'" class="mt-1 flex flex-col gap-2">
          <button
            v-for="plan in plans"
            :key="plan.id"
            type="button"
            :class="
              selectedPlanId === plan.id
                ? 'border-accent bg-accent/10'
                : 'border-border-light dark:border-border-dark hover:bg-surface-light dark:hover:bg-surface-dark'
            "
            class="flex items-center justify-between rounded-lg border px-4 py-3 text-left cursor-pointer transition-colors duration-150"
            @click="selectedPlanId = plan.id"
          >
            <span
              class="truncate text-sm font-semibold text-text-h-light dark:text-text-h-dark"
            >
              {{ plan.name }}
            </span>
            <span
              v-if="plan.active"
              class="ml-2 shrink-0 rounded-md bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent"
            >
              Active
            </span>
          </button>
        </div>

        <!-- New plan fields -->
        <div v-else class="mt-1 flex flex-col gap-4">
          <input
            v-model="planName"
            type="text"
            placeholder="Plan name, e.g. Powerbuilding Split"
            class="rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark px-3 py-2.5 text-sm text-text-h-light dark:text-text-h-dark placeholder-text-light/40 dark:placeholder-text-dark/40 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/40"
            @keyup.enter="dismissKeyboard"
          />
          <div
            class="flex items-center justify-between rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark px-4 py-3"
          >
            <div>
              <div
                class="text-sm font-semibold text-text-h-light dark:text-text-h-dark"
              >
                Set as active plan
              </div>
              <div
                class="text-xs text-text-light dark:text-text-dark opacity-60"
              >
                Replaces the currently active plan
              </div>
            </div>
            <button
              type="button"
              class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
              :class="
                setActive ? 'bg-accent' : 'bg-border-light dark:bg-border-dark'
              "
              aria-label="Toggle set as active plan"
              @click="setActive = !setActive"
            >
              <span
                class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
                :class="setActive ? 'translate-x-5' : 'translate-x-0'"
              />
            </button>
          </div>
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
        class="flex-1 rounded-lg bg-accent py-3 text-sm font-bold text-bg-dark transition-colors duration-150 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
        :disabled="!canSave"
        @click="save"
      >
        Create Routine
      </button>
    </template>
  </AppBottomSheet>
</template>
