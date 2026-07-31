<script setup lang="ts">
import AppBottomSheet from "./AppBottomSheet.vue";

const open = defineModel<boolean>("open", { required: true });

defineProps<{
  // Currently selected RPE as a string (empty ⇒ none chosen yet).
  current?: string;
}>();

const emit = defineEmits<{
  (e: "select", rpe: string): void;
}>();

interface RpeOption {
  value: number;
  label: string;
  shortDesc: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  activeBorderClass: string;
}

// Standard RPE scale (6–10 in 0.5 steps) with custom effort color mapping and concise labels
const RPE_OPTIONS: RpeOption[] = [
  {
    value: 10,
    label: "@10",
    shortDesc: "Max Effort",
    bgClass: "bg-red-500/10 dark:bg-red-500/15",
    borderClass:
      "border-red-500/20 dark:border-red-500/15 hover:border-red-500/40",
    textClass: "text-red-700 dark:text-red-400",
    activeBorderClass:
      "border-red-500 dark:border-red-400 ring-2 ring-red-500/20",
  },
  {
    value: 9.5,
    label: "@9.5",
    shortDesc: "~0 Reps Left",
    bgClass: "bg-orange-600/10 dark:bg-orange-600/15",
    borderClass:
      "border-orange-600/20 dark:border-orange-600/15 hover:border-orange-600/40",
    textClass: "text-orange-700 dark:text-orange-400",
    activeBorderClass:
      "border-orange-600 dark:border-orange-400 ring-2 ring-orange-600/20",
  },
  {
    value: 9,
    label: "@9",
    shortDesc: "1 Rep Left",
    bgClass: "bg-orange-500/10 dark:bg-orange-500/15",
    borderClass:
      "border-orange-500/20 dark:border-orange-500/15 hover:border-orange-500/40",
    textClass: "text-orange-700 dark:text-orange-400",
    activeBorderClass:
      "border-orange-500 dark:border-orange-400 ring-2 ring-orange-500/20",
  },
  {
    value: 8.5,
    label: "@8.5",
    shortDesc: "1-2 Reps Left",
    bgClass: "bg-amber-600/10 dark:bg-amber-600/15",
    borderClass:
      "border-amber-600/20 dark:border-amber-600/15 hover:border-amber-600/40",
    textClass: "text-amber-700 dark:text-amber-400",
    activeBorderClass:
      "border-amber-600 dark:border-amber-600 ring-2 ring-amber-600/20",
  },
  {
    value: 8,
    label: "@8",
    shortDesc: "2 Reps Left",
    bgClass: "bg-amber-500/10 dark:bg-amber-500/15",
    borderClass:
      "border-amber-500/20 dark:border-amber-500/15 hover:border-amber-500/40",
    textClass: "text-amber-700 dark:text-amber-400",
    activeBorderClass:
      "border-amber-500 dark:border-amber-500 ring-2 ring-amber-500/20",
  },
  {
    value: 7.5,
    label: "@7.5",
    shortDesc: "2-3 Reps Left",
    bgClass: "bg-yellow-600/10 dark:bg-yellow-600/15",
    borderClass:
      "border-yellow-600/20 dark:border-yellow-600/15 hover:border-yellow-600/40",
    textClass: "text-yellow-700 dark:text-yellow-400",
    activeBorderClass:
      "border-yellow-600 dark:border-yellow-600 ring-2 ring-yellow-600/20",
  },
  {
    value: 7,
    label: "@7",
    shortDesc: "3 Reps Left",
    bgClass: "bg-yellow-500/10 dark:bg-yellow-500/15",
    borderClass:
      "border-yellow-500/20 dark:border-yellow-500/15 hover:border-yellow-500/40",
    textClass: "text-yellow-700 dark:text-yellow-400",
    activeBorderClass:
      "border-yellow-500 dark:border-yellow-500 ring-2 ring-yellow-500/20",
  },
  {
    value: 6.5,
    label: "@6.5",
    shortDesc: "3-4 Reps Left",
    bgClass: "bg-emerald-600/10 dark:bg-emerald-600/15",
    borderClass:
      "border-emerald-600/20 dark:border-emerald-600/15 hover:border-emerald-600/40",
    textClass: "text-emerald-700 dark:text-emerald-400",
    activeBorderClass:
      "border-emerald-600 dark:border-emerald-600 ring-2 ring-emerald-600/20",
  },
  {
    value: 6,
    label: "@6",
    shortDesc: "Light / Warmup",
    bgClass: "bg-emerald-500/10 dark:bg-emerald-500/15",
    borderClass:
      "border-emerald-500/20 dark:border-emerald-500/15 hover:border-emerald-500/40",
    textClass: "text-emerald-700 dark:text-emerald-400",
    activeBorderClass:
      "border-emerald-500 dark:border-emerald-500 ring-2 ring-emerald-500/20",
  },
];

const pick = (rpe: number) => {
  emit("select", String(rpe));
  open.value = false;
};
</script>

<template>
  <AppBottomSheet v-model:open="open" title="Select RPE">
    <!-- Short description explaining RPE on top -->
    <div class="px-5 py-3">
      <p
        class="text-xs text-text-light/50 dark:text-text-dark/50 leading-relaxed"
      >
        Rate of Perceived Exertion (RPE) measures effort from 10 (maximum
        effort) to 6 (warmup), based on Reps in Reserve (RIR).
      </p>
    </div>

    <div class="flex flex-col gap-3 px-5 py-2">
      <!-- 3-column grid layout -->
      <div class="grid grid-cols-3 gap-2">
        <button
          v-for="opt in RPE_OPTIONS"
          :key="opt.value"
          type="button"
          class="flex flex-col items-center justify-center py-2.5 rounded-xl border transition-all duration-150 cursor-pointer text-center relative"
          :class="[
            opt.bgClass,
            String(opt.value) === current
              ? opt.activeBorderClass
              : opt.borderClass,
          ]"
          @click="pick(opt.value)"
        >
          <span class="font-mono text-base font-bold" :class="opt.textClass">
            {{ opt.label }}
          </span>
          <span
            class="text-[10px] font-semibold text-text-light/50 dark:text-text-dark/50 mt-0.5 uppercase tracking-wide"
          >
            {{ opt.shortDesc }}
          </span>
        </button>
      </div>

      <!-- Clear selection -->
      <!-- <button
        type="button"
        class="w-full px-4 py-3 rounded-xl border border-dashed border-border-light dark:border-border-dark text-center text-sm font-semibold text-text-light dark:text-text-dark opacity-60 transition-all duration-150 hover:opacity-100 hover:border-accent hover:text-accent cursor-pointer"
        @click="clear"
      >
        Clear RPE
      </button> -->
    </div>
  </AppBottomSheet>
</template>
