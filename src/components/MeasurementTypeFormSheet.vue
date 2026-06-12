<script setup lang="ts">
import { ref, watch } from "vue";
import AppBottomSheet from "./AppBottomSheet.vue";
import type { MeasurementCategory } from "../db/types";
import type { MeasurementTypeInput } from "../db/measurements";

const open = defineModel<boolean>("open", { required: true });

const emit = defineEmits<{
  (e: "save", input: MeasurementTypeInput): void;
}>();

const CATEGORIES: { value: MeasurementCategory; label: string }[] = [
  { value: "LENGTH", label: "Length" },
  { value: "WEIGHT", label: "Weight" },
  { value: "PERCENTAGE", label: "Percentage" },
];

const name = ref("");
const category = ref<MeasurementCategory>("LENGTH");

// Reset the form each time the sheet opens.
watch(open, (isOpen) => {
  if (isOpen) {
    name.value = "";
    category.value = "LENGTH";
  }
});

const canSave = () => name.value.trim().length > 0;

const save = () => {
  if (!canSave()) return;
  emit("save", { name: name.value.trim(), category: category.value });
};
</script>

<template>
  <AppBottomSheet v-model:open="open" title="New Measurement">
    <div class="flex flex-col gap-5 px-5 py-4">
      <!-- Name -->
      <div class="flex flex-col gap-2">
        <label
          class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
        >
          Name
        </label>
        <input
          v-model="name"
          type="text"
          placeholder="e.g. Left Calve"
          class="w-full rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark px-3 py-2.5 text-sm text-text-h-light dark:text-text-h-dark placeholder-text-light/50 dark:placeholder-text-dark/50 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/40"
          @keydown.enter.prevent="save"
        />
      </div>

      <!-- Unit type -->
      <div class="flex flex-col gap-2">
        <label
          class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
        >
          Unit Type
        </label>
        <div
          class="flex gap-1 rounded-xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark p-1"
        >
          <button
            v-for="c in CATEGORIES"
            :key="c.value"
            class="flex-1 cursor-pointer rounded-lg px-2 py-2 text-xs font-bold transition-colors duration-150"
            :class="
              category === c.value
                ? 'bg-accent text-bg-dark'
                : 'text-text-light dark:text-text-dark hover:text-text-h-light dark:hover:text-text-h-dark'
            "
            @click="category = c.value"
          >
            {{ c.label }}
          </button>
        </div>
        <p class="text-xs text-text-light dark:text-text-dark opacity-50">
          The display unit (cm/in, kg/lbs) follows your global settings.
        </p>
      </div>
    </div>

    <template #footer>
      <button
        class="flex-1 rounded-lg border border-border-light dark:border-border-dark py-2.5 text-sm font-bold text-text-light dark:text-text-dark transition-colors duration-150 hover:bg-surface-light dark:hover:bg-surface-dark cursor-pointer"
        @click="open = false"
      >
        Cancel
      </button>
      <button
        class="flex-1 rounded-lg bg-accent py-2.5 text-sm font-bold text-bg-dark transition-colors duration-150 hover:bg-accent-hover cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="!canSave()"
        @click="save"
      >
        Save
      </button>
    </template>
  </AppBottomSheet>
</template>
