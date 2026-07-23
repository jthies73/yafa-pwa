<script setup lang="ts">
import { watch, onMounted, onUnmounted } from "vue";
import { useAndroidBackDismiss } from "../composables/useAndroidBackDismiss";

withDefaults(
  defineProps<{
    title?: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
  }>(),
  {
    title: "Are you sure?",
    message: "",
    confirmLabel: "Delete",
    cancelLabel: "Cancel",
    danger: true,
  },
);

const open = defineModel<boolean>("open", { required: true });

useAndroidBackDismiss(open, () => {
  open.value = false;
});

const emit = defineEmits<{
  (e: "confirm"): void;
}>();

function handleKeydown(e: KeyboardEvent) {
  if (!open.value) return;
  if (e.key === "Escape") {
    e.preventDefault();
    open.value = false;
  }
}

watch(open, (isOpen) => {
  document.body.style.overflow = isOpen ? "hidden" : "";
});

onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
});

onUnmounted(() => {
  document.body.style.overflow = "";
  window.removeEventListener("keydown", handleKeydown);
});

const confirm = () => {
  emit("confirm");
  open.value = false;
};
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm-fade">
      <div
        v-if="open"
        class="fixed inset-0 z-[60] flex items-center justify-center p-6"
        role="alertdialog"
        aria-modal="true"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/50" @click="open = false" />

        <!-- Dialog -->
        <div
          class="relative w-full max-w-sm flex flex-col gap-4 rounded-2xl border border-border-light dark:border-border-dark bg-bg-light dark:bg-bg-dark p-6 shadow-xl"
        >
          <div class="flex flex-col gap-2">
            <h2
              class="text-lg font-bold text-text-h-light dark:text-text-h-dark"
            >
              {{ title }}
            </h2>
            <p
              v-if="message"
              class="text-sm leading-relaxed text-text-light dark:text-text-dark opacity-80"
            >
              {{ message }}
            </p>
          </div>

          <div class="mt-1 flex gap-3">
            <button
              class="flex-1 rounded-lg border border-border-light dark:border-border-dark py-2.5 text-sm font-bold text-text-light dark:text-text-dark transition-colors duration-150 hover:bg-surface-light dark:hover:bg-surface-dark cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent"
              @click="open = false"
            >
              {{ cancelLabel }}
            </button>
            <button
              class="flex-1 rounded-lg py-2.5 text-sm font-bold transition-colors duration-150 cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1"
              :class="
                danger
                  ? 'bg-red-500 text-white hover:bg-red-600 focus:ring-red-500'
                  : 'bg-accent text-bg-dark hover:bg-accent-hover focus:ring-accent'
              "
              @click="confirm"
            >
              {{ confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.confirm-fade-enter-active,
.confirm-fade-leave-active {
  transition: opacity 0.2s ease;
}

.confirm-fade-enter-from,
.confirm-fade-leave-to {
  opacity: 0;
}
</style>
