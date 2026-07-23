<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import AppBottomSheet from "./AppBottomSheet.vue";

const props = defineProps<{
  exerciseName: string;
  // The exercise's global note (Exercise.notes) — shared everywhere it's used.
  globalNote?: string;
  // The remark for this session only (persists onto WorkoutExercise.note).
  workoutNote?: string;
}>();

const open = defineModel<boolean>("open", { required: true });

const emit = defineEmits<{
  (e: "update:globalNote", v: string | undefined): void;
  (e: "update:workoutNote", v: string | undefined): void;
  (e: "remove"): void;
}>();

// Local drafts so we don't write to the DB / workout on every keystroke. The
// global note reads first (a pinned reference) and only swaps to an input on edit.
const globalDraft = ref("");
const workoutDraft = ref("");
const editingGlobal = ref(false);
const globalInput = ref<HTMLTextAreaElement | null>(null);

const commitGlobal = () =>
  emit("update:globalNote", globalDraft.value.trim() || undefined);
const commitWorkout = () =>
  emit("update:workoutNote", workoutDraft.value.trim() || undefined);

const startEditGlobal = async () => {
  editingGlobal.value = true;
  await nextTick();
  globalInput.value?.focus();
};

const finishEditGlobal = () => {
  commitGlobal();
  editingGlobal.value = false;
};

// Seed drafts when the sheet opens; flush on close (backdrop/drag can skip blur).
// No immediate run — the sheet mounts closed, so there's nothing to seed/flush yet.
watch(open, (isOpen) => {
  if (isOpen) {
    globalDraft.value = props.globalNote ?? "";
    workoutDraft.value = props.workoutNote ?? "";
    editingGlobal.value = false;
  } else {
    if (editingGlobal.value) commitGlobal();
    commitWorkout();
    editingGlobal.value = false;
  }
});
</script>

<template>
  <AppBottomSheet v-model:open="open">
    <template #title>
      <div class="flex w-full items-center justify-between gap-4">
        <div class="min-w-0">
          <p
            class="mb-0.5 text-xs font-semibold uppercase tracking-wider text-text-light dark:text-text-dark opacity-50"
          >
            Notes
          </p>
          <h2
            class="truncate text-lg font-bold text-text-h-light dark:text-text-h-dark"
          >
            {{ exerciseName }}
          </h2>
        </div>
        <button
          type="button"
          class="shrink-0 cursor-pointer rounded-md bg-red-500/10 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-red-500 transition-colors duration-150 hover:bg-red-500/20 dark:bg-red-500/15 dark:text-red-400 dark:hover:bg-red-500/25"
          @click="emit('remove')"
        >
          Remove
        </button>
      </div>
    </template>

    <div class="flex flex-col gap-5 px-5 py-5">
      <!-- Exercise note — the pinned reference (read first, pencil to edit) -->
      <div class="rounded-xl border border-accent/20 bg-accent/5 px-4 py-3.5">
        <div class="flex items-center justify-between gap-2">
          <span
            class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-accent"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <line x1="12" y1="17" x2="12" y2="22" />
              <path
                d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"
              />
            </svg>
            Exercise note
          </span>
          <button
            v-if="!editingGlobal"
            type="button"
            class="shrink-0 cursor-pointer text-accent opacity-70 transition-opacity duration-150 hover:opacity-100"
            aria-label="Edit exercise note"
            @click="startEditGlobal"
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
            >
              <path d="M12 20h9" />
              <path
                d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
              />
            </svg>
          </button>
        </div>
        <p
          class="mt-0.5 text-[11px] text-text-light dark:text-text-dark opacity-55"
        >
          Shown every time you do this exercise
        </p>

        <!-- Read mode: the note (tap to edit) or an empty prompt -->
        <button
          v-if="!editingGlobal"
          type="button"
          class="mt-2 w-full cursor-text text-left"
          @click="startEditGlobal"
        >
          <span
            v-if="globalDraft"
            class="block whitespace-pre-wrap text-sm text-text-h-light dark:text-text-h-dark"
          >
            {{ globalDraft }}
          </span>
          <span
            v-else
            class="block text-sm text-text-light dark:text-text-dark opacity-50"
          >
            + Add setup notes…
          </span>
        </button>

        <!-- Edit mode -->
        <textarea
          v-else
          ref="globalInput"
          v-model="globalDraft"
          rows="3"
          placeholder="Seat height, machine setup, form cues…"
          class="mt-2 w-full resize-none rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark px-3 py-2.5 text-sm text-text-h-light dark:text-text-h-dark placeholder-text-light/40 dark:placeholder-text-dark/40 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/40"
          @blur="finishEditGlobal"
        ></textarea>
      </div>

      <!-- Today's note — the primary input -->
      <div class="flex flex-col gap-1.5">
        <span
          class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-60"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          Today's note
        </span>
        <textarea
          v-model="workoutDraft"
          rows="4"
          placeholder="e.g. notes about how you felt during today's exercise..."
          class="resize-none rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark px-3 py-2.5 text-sm text-text-h-light dark:text-text-h-dark placeholder-text-light/40 dark:placeholder-text-dark/40 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/40"
          @blur="commitWorkout"
        ></textarea>
      </div>
    </div>

    <template #footer>
      <button
        class="w-full cursor-pointer rounded-xl bg-accent py-3.5 text-sm font-bold uppercase tracking-wide text-bg-dark transition-colors duration-150 hover:bg-accent-hover"
        @click="open = false"
      >
        Done
      </button>
    </template>
  </AppBottomSheet>
</template>
