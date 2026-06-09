<script setup lang="ts">
import { ref, computed, watch } from "vue";
import type { PlanInput } from "../db/repository";
import AppBottomSheet from "./AppBottomSheet.vue";

const props = defineProps<{
  isEditing: boolean;
  initial?: { name: string; description?: string };
}>();

const open = defineModel<boolean>("open", { required: true });

const emit = defineEmits<{
  (e: "save", input: PlanInput): void;
}>();

const name = ref("");
const description = ref("");
const setActive = ref(true);

// Reset the form every time the sheet opens, seeded from props.
watch(
  open,
  (isOpen) => {
    if (!isOpen) return;
    name.value = props.initial?.name ?? "";
    description.value = props.initial?.description ?? "";
    setActive.value = true;
  },
  { immediate: true },
);

const canSave = computed(() => name.value.trim().length > 0);

const close = () => {
  open.value = false;
};

const save = () => {
  if (!canSave.value) return;
  emit("save", {
    name: name.value,
    description: description.value,
    ...(props.isEditing ? {} : { active: setActive.value }),
  });
};

const dismissKeyboard = (e: KeyboardEvent) => {
  (e.target as HTMLElement)?.blur?.();
};
</script>

<template>
  <AppBottomSheet
    v-model:open="open"
    :title="isEditing ? 'Edit Plan' : 'New Plan'"
  >
    <div class="flex flex-col gap-6 px-5 py-5">
      <!-- Name -->
      <div class="flex flex-col gap-1.5">
        <label
          class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
        >
          Plan Name
        </label>
        <input
          v-model="name"
          type="text"
          placeholder="e.g. Powerbuilding Split"
          class="rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark px-3 py-2.5 text-sm text-text-h-light dark:text-text-h-dark placeholder-text-light/40 dark:placeholder-text-dark/40 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/40"
          @keyup.enter="dismissKeyboard"
        />
      </div>

      <!-- Description -->
      <div class="flex flex-col gap-1.5">
        <label
          class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
        >
          Description
          <span class="ml-1 font-normal normal-case opacity-60"
            >(optional)</span
          >
        </label>
        <textarea
          v-model="description"
          rows="3"
          placeholder="What is this plan designed to achieve?"
          class="resize-none rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark px-3 py-2.5 text-sm text-text-h-light dark:text-text-h-dark placeholder-text-light/40 dark:placeholder-text-dark/40 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/40"
        ></textarea>
      </div>

      <!-- Set active (create only) -->
      <div
        v-if="!isEditing"
        class="flex items-center justify-between rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark px-4 py-3"
      >
        <div>
          <div
            class="text-sm font-semibold text-text-h-light dark:text-text-h-dark"
          >
            Set as active plan
          </div>
          <div class="text-xs text-text-light dark:text-text-dark opacity-60">
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
        {{ isEditing ? "Save Changes" : "Create Plan" }}
      </button>
    </template>
  </AppBottomSheet>
</template>
