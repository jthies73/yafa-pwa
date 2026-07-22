<script setup lang="ts">
import { ref, watch, computed } from "vue";
import type { MesocycleWeek, Plan, PeriodizationFocus } from "../db/types";
import {
  FOCUS_ORDER,
  FOCUS_META,
  MESOCYCLE_PRESETS,
} from "../config/periodization";
import { useSortableList } from "../composables/useSortableList";
import { mesocyclePosition } from "../engine/service";
import AppBottomSheet from "./AppBottomSheet.vue";
import MesocycleChart from "./MesocycleChart.vue";

const props = defineProps<{
  isEditing: boolean;
  initial?: MesocycleWeek[];
  plan?: Plan | null;
}>();

const open = defineModel<boolean>("open", { required: true });

const emit = defineEmits<{
  (
    e: "save",
    weeks: MesocycleWeek[],
    override?: Plan["mesocycleWeekOverride"],
  ): void;
}>();

const weeks = ref<MesocycleWeek[]>([]);
const weekOverride = ref<{
  weekIndex: number;
  alignToMonday: boolean;
} | null>(null);

// Reset on open, deep-cloning to plain objects so we never mutate the live plan.
watch(
  open,
  async (isOpen) => {
    if (!isOpen) return;
    weeks.value = (props.initial ?? []).map((w) => ({ focus: w.focus }));
    // Initialize the week override state from the plan's current position.
    if (props.plan?.mesocycle?.length) {
      const pos = await mesocyclePosition(props.plan, Date.now());
      const currentLap = Math.floor(
        (pos?.weekIndex ?? 0) / props.plan.mesocycle.length,
      );
      const absoluteIndex =
        currentLap * props.plan.mesocycle.length + (pos?.weekIndex ?? 0);
      weekOverride.value = {
        weekIndex: absoluteIndex,
        alignToMonday: props.plan.mesocycleWeekOverride?.alignToMonday ?? false,
      };
    } else {
      weekOverride.value = null;
    }
  },
  { immediate: true },
);

const weekListEl = ref<HTMLElement | null>(null);

useSortableList(weekListEl, {
  handle: ".drag-handle",
  draggingClass: "shadow-lg",
  onReorder: (from, to) => {
    const list = weeks.value.slice();
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    weeks.value = list;
  },
});

const currentWrappedWeekIndex = computed(() => {
  if (!weekOverride.value || !weeks.value.length) return -1;
  return weekOverride.value.weekIndex % weeks.value.length;
});

const addWeek = () => {
  const last = weeks.value[weeks.value.length - 1];
  weeks.value.push({ focus: last?.focus ?? "hypertrophy" });
};

const removeWeek = (idx: number) => {
  weeks.value.splice(idx, 1);
};

const setFocus = (idx: number, focus: PeriodizationFocus) => {
  weeks.value[idx].focus = focus;
};

const selectWeek = (idx: number) => {
  if (!weekOverride.value) return;
  // Preserve the current lap (how many complete cycles have passed).
  const lap = Math.floor(weekOverride.value.weekIndex / weeks.value.length);
  weekOverride.value.weekIndex = lap * weeks.value.length + idx;
};

const applyPreset = (preset: (typeof MESOCYCLE_PRESETS)[number]) => {
  weeks.value = preset.weeks.map((w) => ({ focus: w.focus }));
};

const close = () => {
  open.value = false;
};

const save = () => {
  const override = weekOverride.value
    ? {
        weekIndex: weekOverride.value.weekIndex,
        setAt: Date.now(),
        alignToMonday: weekOverride.value.alignToMonday,
      }
    : undefined;
  emit(
    "save",
    weeks.value.map((w) => ({ focus: w.focus })),
    override,
  );
};
</script>

<template>
  <AppBottomSheet
    v-model:open="open"
    :title="isEditing ? 'Edit Periodization' : 'Set Up Periodization'"
  >
    <div class="flex flex-col gap-6 px-5 py-5 select-none">
      <!-- Live preview -->
      <div
        v-if="weeks.length"
        class="rounded-xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark p-4"
      >
        <MesocycleChart
          :weeks="weeks"
          :current-week-index="
            currentWrappedWeekIndex >= 0 ? currentWrappedWeekIndex : undefined
          "
        />
      </div>
      <p
        v-else
        class="rounded-xl border border-dashed border-border-light dark:border-border-dark py-6 text-center text-sm text-text-light dark:text-text-dark opacity-60"
      >
        Add weeks or start from a preset below.
      </p>

      <!-- Presets -->
      <div class="flex flex-col gap-1.5">
        <span
          class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
        >
          Presets
        </span>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="preset in MESOCYCLE_PRESETS"
            :key="preset.name"
            type="button"
            class="rounded-lg border border-border-light dark:border-border-dark px-3 py-2 text-xs font-semibold text-text-light dark:text-text-dark transition-colors duration-150 hover:border-accent/50 hover:text-accent cursor-pointer"
            @click="applyPreset(preset)"
          >
            {{ preset.name }}
          </button>
        </div>
      </div>

      <!-- Monday alignment toggle -->
      <div v-if="weekOverride && weeks.length" class="flex flex-col gap-1.5">
        <span
          class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
        >
          Week Boundary
        </span>
        <button
          type="button"
          role="switch"
          :aria-checked="weekOverride.alignToMonday"
          class="flex gap-1 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark p-1"
          @click="weekOverride.alignToMonday = !weekOverride.alignToMonday"
        >
          <span
            class="flex-1 rounded-md py-1.5 text-xs font-bold transition-colors duration-150"
            :class="
              !weekOverride.alignToMonday
                ? 'bg-accent text-bg-dark'
                : 'text-text-light dark:text-text-dark opacity-60'
            "
          >
            Rolling
          </span>
          <span
            class="flex-1 rounded-md py-1.5 text-xs font-bold transition-colors duration-150"
            :class="
              weekOverride.alignToMonday
                ? 'bg-accent text-bg-dark'
                : 'text-text-light dark:text-text-dark opacity-60'
            "
          >
            Monday
          </span>
        </button>
      </div>

      <!-- Weeks editor -->
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between">
          <span
            class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
          >
            Weeks
          </span>
          <span class="text-xs text-text-light dark:text-text-dark opacity-50">
            Tap a week number to set it as your current week
          </span>
        </div>

        <div ref="weekListEl" class="flex flex-col gap-2">
          <div
            v-for="(week, idx) in weeks"
            :key="idx"
            class="flex items-center gap-2.5 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark p-2.5"
          >
            <!-- Drag handle -->
            <span
              class="drag-handle shrink-0 touch-none cursor-grab active:cursor-grabbing text-text-light dark:text-text-dark opacity-30 hover:opacity-60 transition-opacity duration-150 inline-flex h-5 w-3.5 items-center justify-center"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <circle cx="9" cy="5" r="1.5" />
                <circle cx="15" cy="5" r="1.5" />
                <circle cx="9" cy="12" r="1.5" />
                <circle cx="15" cy="12" r="1.5" />
                <circle cx="9" cy="19" r="1.5" />
                <circle cx="15" cy="19" r="1.5" />
              </svg>
            </span>

            <button
              type="button"
              class="shrink-0 w-7 rounded-md py-1 px-1.5 text-xs font-bold font-mono transition-colors duration-150 cursor-pointer"
              :class="
                currentWrappedWeekIndex === idx
                  ? 'bg-accent text-bg-dark'
                  : 'border border-border-light dark:border-border-dark text-text-light dark:text-text-dark opacity-50 hover:opacity-100'
              "
              @click="selectWeek(idx)"
            >
              W{{ idx + 1 }}
            </button>

            <!-- Focus selector -->
            <div class="grid flex-1 grid-cols-4 gap-1">
              <button
                v-for="focus in FOCUS_ORDER"
                :key="focus"
                type="button"
                class="rounded-md py-1.5 text-[11px] font-bold transition-colors duration-150 cursor-pointer"
                :class="
                  week.focus === focus
                    ? 'text-white'
                    : 'border border-border-light dark:border-border-dark text-text-light dark:text-text-dark opacity-70 hover:opacity-100'
                "
                :style="
                  week.focus === focus
                    ? { backgroundColor: FOCUS_META[focus].colorVar }
                    : {}
                "
                :title="FOCUS_META[focus].label"
                @click="setFocus(idx, focus)"
              >
                {{ FOCUS_META[focus].short }}
              </button>
            </div>

            <!-- Remove -->
            <button
              type="button"
              class="shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-text-light dark:text-text-dark opacity-40 hover:opacity-100 hover:text-red-500 dark:hover:text-red-400 cursor-pointer transition-colors duration-150"
              title="Remove week"
              @click="removeWeek(idx)"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Add week -->
        <button
          type="button"
          class="mt-1 w-full rounded-lg border border-dashed border-border-light dark:border-border-dark py-2.5 text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60 transition-colors duration-150 hover:opacity-100 hover:border-accent/50 hover:text-accent cursor-pointer"
          @click="addWeek"
        >
          + Add week
        </button>
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
        class="flex-1 rounded-lg bg-accent py-3 text-sm font-bold text-bg-dark transition-colors duration-150 hover:bg-accent-hover cursor-pointer"
        @click="save"
      >
        Save Changes
      </button>
    </template>
  </AppBottomSheet>
</template>
