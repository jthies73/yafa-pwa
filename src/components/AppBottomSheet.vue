<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";

const props = defineProps<{
  title?: string;
  duration?: number; // animation duration in ms, default 300
}>();

const open = defineModel<boolean>("open", { required: true });

const sheetEl = ref<HTMLElement | null>(null);
const visible = ref(false);
const translateY = ref(0);
const isDragging = ref(false);

let dragStartClientY = 0;
let dragStartTranslateY = 0;
let lastClientY = 0;
let lastEventTime = 0;
let releaseVelocity = 0; // px/ms, positive = downward

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
    opacity: 0.6 * Math.max(0, Math.min(1, ratio)),
    transition: isDragging.value ? "none" : `opacity ${transition.value}`,
  };
});

function getSheetHeight(): number {
  return sheetEl.value?.offsetHeight ?? window.innerHeight;
}

async function animateIn() {
  // Push off-screen before the sheet is visible so there's no position flash
  translateY.value = window.innerHeight;
  visible.value = true;
  await nextTick();
  // Double rAF ensures the off-screen position is committed to the GPU before animating
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      translateY.value = 0;
      // Focus the first editable element for accessibility
      setTimeout(() => {
        const firstEditable = sheetEl.value?.querySelector(
          "input, textarea, select",
        ) as HTMLElement;
        firstEditable?.focus();
      }, 0);
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
    document.body.style.overflow = isOpen ? "hidden" : "";
    if (isOpen) animateIn();
    else animateOut();
  },
  { immediate: true },
);

function handleKeydown(e: KeyboardEvent) {
  // ESC to close
  if (e.key === "Escape") {
    e.preventDefault();
    open.value = false;
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
  cleanupListeners();
});

// ── Drag (Pointer Events) ─────────────────────────────────────────────────────

let activePointerId: number | null = null;

function onDragStart(e: PointerEvent) {
  // Let buttons and inputs handle their own events.
  if ((e.target as HTMLElement).closest("button, a, input, select, textarea"))
    return;
  if (e.pointerType === "mouse" && e.button !== 0) return;

  activePointerId = e.pointerId;
  isDragging.value = true;
  dragStartClientY = e.clientY;
  dragStartTranslateY = translateY.value;
  lastClientY = e.clientY;
  lastEventTime = Date.now();
  releaseVelocity = 0;

  window.addEventListener("pointermove", onPointerMove, { passive: false });
  window.addEventListener("pointerup", onDragEnd);
  window.addEventListener("pointercancel", onDragEnd);
}

function onPointerMove(e: PointerEvent) {
  if (e.pointerId !== activePointerId) return;
  e.preventDefault();

  const now = Date.now();
  const dt = now - lastEventTime;
  if (dt > 0) releaseVelocity = (e.clientY - lastClientY) / dt;
  lastClientY = e.clientY;
  lastEventTime = now;
  translateY.value = Math.max(
    0,
    dragStartTranslateY + (e.clientY - dragStartClientY),
  );
}

function onDragEnd() {
  isDragging.value = false;
  activePointerId = null;
  cleanupListeners();

  const DISTANCE_THRESHOLD = getSheetHeight() * 0.35;
  const VELOCITY_THRESHOLD = 0.5; // px/ms

  if (
    translateY.value > DISTANCE_THRESHOLD ||
    releaseVelocity > VELOCITY_THRESHOLD
  ) {
    open.value = false;
  } else {
    translateY.value = 0; // snap back
  }
}

function cleanupListeners() {
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onDragEnd);
  window.removeEventListener("pointercancel", onDragEnd);
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="fixed inset-0 z-50">
      <!-- Backdrop -->
      <div
        class="absolute inset-0 bg-black"
        :style="backdropStyle"
        @click="open = false"
      />

      <!-- Sheet -->
      <div
        ref="sheetEl"
        :style="sheetStyle"
        class="absolute bottom-0 left-0 right-0 flex flex-col w-full max-h-[92vh] rounded-t-2xl bg-bg-light dark:bg-bg-dark"
      >
        <!-- Drag zone: handle bar + header -->
        <div
          :class="isDragging ? 'cursor-grabbing' : 'cursor-grab'"
          class="shrink-0 touch-none select-none"
          @pointerdown="onDragStart"
        >
          <!-- Handle bar -->
          <div class="flex justify-center pt-3 pb-1">
            <div
              class="w-10 h-1 rounded-full bg-border-light dark:bg-border-dark"
            />
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
        <div class="overflow-y-auto flex-1 flex flex-col relative">
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
