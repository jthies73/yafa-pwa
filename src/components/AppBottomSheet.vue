<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
import { useBottomSheetGestures } from "../composables/useBottomSheetGestures";

const props = defineProps<{
  title?: string;
  duration?: number; // animation duration in ms, default 300
  // When true the sheet opens full-height and drag-down docks it as a
  // persistent minimized header instead of dismissing it (e.g. a running
  // workout). When false the sheet drags down to close.
  minimizable?: boolean;
  /** Tailwind z-index class, defaults to "z-50" */
  zIndex?: string;
}>();

const open = defineModel<boolean>("open", { required: true });
const minimized = defineModel<boolean>("minimized", { default: false });

const sheetEl = ref<HTMLElement | null>(null);
const dragZoneEl = ref<HTMLElement | null>(null);
const visible = ref(false);
const translateY = ref(0);

const { isDragging, onDragStart, getSheetHeight, getDockTranslateY } =
  useBottomSheetGestures({
    sheetEl,
    dragZoneEl,
    translateY,
    minimized,
    open,
    minimizable: () => props.minimizable ?? false,
  });

const duration = computed(() => props.duration ?? 300);
const transition = computed(() => `${duration.value}ms ease`);

const sheetStyle = computed(() => ({
  transform: `translateY(${translateY.value}px)`,
  transition: isDragging.value ? "none" : `transform ${transition.value}`,
}));

const backdropStyle = computed(() => {
  const h = sheetEl.value?.offsetHeight ?? 0;
  const ratio = h > 0 ? 1 - translateY.value / h : visible.value ? 1 : 0;
  return {
    opacity: minimized.value ? 0 : 0.6 * Math.max(0, Math.min(1, ratio)),
    transition: isDragging.value ? "none" : `opacity ${transition.value}`,
    pointerEvents: (minimized.value ? "none" : "auto") as "none" | "auto",
  };
});

async function animateIn() {
  if (minimized.value) {
    translateY.value = window.innerHeight;
    visible.value = true;
    await nextTick();
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        translateY.value = getDockTranslateY();
      }),
    );
    return;
  }

  // Push off-screen before the sheet is visible so there's no position flash
  translateY.value = window.innerHeight;
  visible.value = true;
  await nextTick();
  // Double rAF ensures the off-screen position is committed to the GPU before animating
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      translateY.value = 0;
    }),
  );
}

function animateOut() {
  translateY.value = getSheetHeight();
  setTimeout(() => {
    visible.value = false;
    translateY.value = 0;
  }, duration.value);
}

watch(
  open,
  (isOpen) => {
    document.body.style.overflow = isOpen && !minimized.value ? "hidden" : "";
    if (isOpen) {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      animateIn();
    } else {
      animateOut();
    }
  },
  { immediate: true },
);

watch(
  () => minimized.value,
  async (isMinimized) => {
    document.body.style.overflow = open.value && !isMinimized ? "hidden" : "";
    // Minimizing keeps the sheet mounted, so any focused field would otherwise
    // hold the native keyboard / custom keypad open – blur it to close them.
    if (isMinimized) (document.activeElement as HTMLElement | null)?.blur();
    await nextTick();
    if (open.value) {
      translateY.value = isMinimized ? getDockTranslateY() : 0;
    }
  },
);

function handleKeydown(e: KeyboardEvent) {
  // ESC minimizes a minimizable sheet (never loses the workout); otherwise closes.
  if (e.key === "Escape") {
    e.preventDefault();
    if (props.minimizable) {
      if (!minimized.value) minimized.value = true;
    } else {
      open.value = false;
    }
  }
  // ENTER to submit (click the primary/accent button in footer)
  if (e.key === "Enter") {
    const primaryBtn = document.querySelector(
      "[role='dialog'] button.bg-accent, [role='dialog'] .bg-accent",
    ) as HTMLButtonElement;
    if (primaryBtn) {
      e.preventDefault();
      primaryBtn.click();
    }
  }
}

onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
});

onUnmounted(() => {
  document.body.style.overflow = "";
  window.removeEventListener("keydown", handleKeydown);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 animate-fade-in"
      :class="[zIndex || 'z-50', { 'pointer-events-none': minimized }]"
    >
      <!-- Backdrop -->
      <div
        class="absolute inset-0 bg-black"
        :style="backdropStyle"
        @click="minimizable ? (minimized = true) : (open = false)"
      />

      <!-- Sheet -->
      <div
        ref="sheetEl"
        :style="sheetStyle"
        class="absolute bottom-0 left-0 right-0 flex flex-col w-full rounded-t-2xl bg-bg-light dark:bg-bg-dark shadow-2xl select-none"
        :class="[
          minimized && minimizable
            ? 'pointer-events-none'
            : 'pointer-events-auto',
          minimizable ? 'h-[100dvh]' : 'max-h-[92vh]',
        ]"
      >
        <!-- Drag zone: handle bar + header -->
        <div
          ref="dragZoneEl"
          :class="[
            isDragging
              ? 'cursor-grabbing'
              : minimized
                ? 'cursor-pointer'
                : 'cursor-grab',
            minimized && minimizable
              ? 'rounded-t-2xl bg-black/10 dark:bg-white/10'
              : '',
            minimized && minimizable ? 'pointer-events-auto' : '',
          ]"
          class="shrink-0 touch-none select-none transition-colors duration-150"
          @pointerdown="onDragStart"
        >
          <!-- Handle bar -->
          <div class="flex justify-center pt-3 pb-1">
            <div class="w-10 h-1 rounded-full bg-black/20 dark:bg-white/20" />
          </div>

          <!-- Header -->
          <div
            class="flex items-center justify-between px-5 py-4 border-b border-border-light dark:border-border-dark"
          >
            <div class="min-w-0 flex-1">
              <slot name="title">
                <h2
                  class="text-lg font-bold text-text-h-light dark:text-text-h-dark truncate"
                >
                  {{ title }}
                </h2>
              </slot>
            </div>
          </div>
        </div>

        <!-- Subheader -->
        <slot name="subheader" />

        <!-- Body -->
        <div
          class="overflow-y-auto flex-1 flex flex-col relative"
          style="padding-bottom: var(--keypad-h, 0px)"
        >
          <slot />
        </div>

        <!-- Footer -->
        <div
          v-if="$slots.footer"
          class="px-5 py-4 border-t border-border-light dark:border-border-dark flex gap-3 shrink-0"
        >
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Teleport>
</template>
