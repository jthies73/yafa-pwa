<script setup lang="ts">
import { ref, computed, watch } from "vue";
import type { RoutineInput } from "../db/repository";
import AppBottomSheet from "./AppBottomSheet.vue";

const props = defineProps<{
  isEditing: boolean;
  initial?: { name: string };
}>();

const open = defineModel<boolean>("open", { required: true });

const emit = defineEmits<{
  (e: "save", input: RoutineInput): void;
}>();

const name = ref("");

watch(
  open,
  (isOpen) => {
    if (!isOpen) return;
    name.value = props.initial?.name ?? "";
  },
  { immediate: true },
);

const canSave = computed(() => name.value.trim().length > 0);

const close = () => {
  open.value = false;
};

const save = () => {
  if (!canSave.value) return;
  emit("save", { name: name.value });
};
</script>

<template>
  <AppBottomSheet
    v-model:open="open"
    :title="isEditing ? 'Rename Routine' : 'New Routine'"
  >
    <div class="flex flex-col gap-6 px-5 py-5">
      <div class="flex flex-col gap-1.5">
        <label
          class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
        >
          Routine Name
        </label>
        <input
          v-model="name"
          type="text"
          placeholder="e.g. Upper Day"
          class="rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark px-3 py-2.5 text-sm text-text-h-light dark:text-text-h-dark placeholder-text-light/40 dark:placeholder-text-dark/40 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/40"
          @keyup.enter="save"
        />
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
        {{ isEditing ? "Save Changes" : "Create Routine" }}
      </button>
    </template>
  </AppBottomSheet>
</template>
