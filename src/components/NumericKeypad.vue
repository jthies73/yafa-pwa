<script setup lang="ts">
import { useNumericKeypad } from "../composables/useNumericKeypad";

const {
  visible,
  dotEnabled,
  pressDigit,
  pressDot,
  pressBackspace,
  pressEnter,
  dismiss,
} = useNumericKeypad();

interface Key {
  label: string;
  area: string;
  digit?: string;
  act?: "dot" | "back" | "enter";
}

// 4-column grid: digits 1-9 fill columns 1-3, a tall Enter spans the right
// column under the backspace key, "0" spans the bottom-left two cells.
const KEYS: Key[] = [
  { label: "1", digit: "1", area: "1 / 1 / 2 / 2" },
  { label: "2", digit: "2", area: "1 / 2 / 2 / 3" },
  { label: "3", digit: "3", area: "1 / 3 / 2 / 4" },
  { label: "back", act: "back", area: "1 / 4 / 2 / 5" },
  { label: "4", digit: "4", area: "2 / 1 / 3 / 2" },
  { label: "5", digit: "5", area: "2 / 2 / 3 / 3" },
  { label: "6", digit: "6", area: "2 / 3 / 3 / 4" },
  { label: "enter", act: "enter", area: "2 / 4 / 5 / 5" },
  { label: "7", digit: "7", area: "3 / 1 / 4 / 2" },
  { label: "8", digit: "8", area: "3 / 2 / 4 / 3" },
  { label: "9", digit: "9", area: "3 / 3 / 4 / 4" },
  { label: "0", digit: "0", area: "4 / 1 / 5 / 3" },
  { label: ".", act: "dot", area: "4 / 3 / 5 / 4" },
];

const onKey = (k: Key) => {
  if (k.digit) pressDigit(k.digit);
  else if (k.act === "dot") pressDot();
  else if (k.act === "back") pressBackspace();
  else if (k.act === "enter") pressEnter();
};
</script>

<template>
  <Transition name="kp">
    <div
      v-show="visible"
      class="fixed inset-x-0 bottom-0 z-[70] border-t border-border-light dark:border-border-dark bg-bg-light dark:bg-bg-dark shadow-[0_-8px_24px_rgba(0,0,0,0.12)] select-none"
    >
      <!-- Dismiss handle -->
      <div class="flex justify-center py-1.5">
        <button
          type="button"
          class="flex h-7 w-12 items-center justify-center rounded-md text-text-light dark:text-text-dark opacity-50 hover:opacity-90 cursor-pointer transition-opacity duration-150"
          aria-label="Hide keypad"
          @pointerdown.prevent
          @click="dismiss"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      <!-- Keys -->
      <div
        class="grid gap-1.5 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]"
        style="
          grid-template-columns: repeat(4, 1fr);
          grid-template-rows: repeat(4, 3rem);
        "
      >
        <button
          v-for="k in KEYS"
          :key="k.label"
          type="button"
          :style="{ gridArea: k.area }"
          :disabled="k.act === 'dot' && !dotEnabled"
          class="flex items-center justify-center rounded-lg text-xl font-mono font-semibold cursor-pointer transition-colors duration-150 disabled:opacity-30 disabled:cursor-default"
          :class="
            k.act === 'enter'
              ? 'bg-accent text-bg-dark hover:bg-accent/90'
              : 'bg-surface-light dark:bg-surface-dark text-text-h-light dark:text-text-h-dark border border-border-light dark:border-border-dark enabled:hover:bg-surface-light-hover dark:enabled:hover:bg-surface-dark-hover'
          "
          @pointerdown.prevent
          @click="onKey(k)"
        >
          <!-- Backspace icon -->
          <svg
            v-if="k.act === 'back'"
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
            <line x1="18" x2="12" y1="9" y2="15" />
            <line x1="12" x2="18" y1="9" y2="15" />
          </svg>
          <!-- Enter icon -->
          <svg
            v-else-if="k.act === 'enter'"
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="9 10 4 15 9 20" />
            <path d="M20 4v7a4 4 0 0 1-4 4H4" />
          </svg>
          <span v-else>{{ k.label }}</span>
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.kp-enter-active,
.kp-leave-active {
  transition: transform 0.2s ease;
}
.kp-enter-from,
.kp-leave-to {
  transform: translateY(100%);
}
</style>
