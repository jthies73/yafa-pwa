<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted } from "vue";

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
    isOpen ? animateIn() : animateOut();
  },
  { immediate: true },
);

onUnmounted(() => {
  document.body.style.overflow = "";
  cleanupListeners();
});

// ── Drag ─────────────────────────────────────────────────────────────────────

function onDragStart(e: Event) {
  // Let buttons and inputs handle their own events
  if ((e.target as HTMLElement).closest("button, a, input, select, textarea"))
    return;

  isDragging.value = true;
  const y = getEventY(e);
  dragStartClientY = y;
  dragStartTranslateY = translateY.value;
  lastClientY = y;
  lastEventTime = Date.now();
  releaseVelocity = 0;

  if (e instanceof TouchEvent) {
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onDragEnd);
  } else {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onDragEnd);
  }
}

function onTouchMove(e: TouchEvent) {
  e.preventDefault();
  applyDrag(e.touches[0].clientY);
}

function onMouseMove(e: MouseEvent) {
  applyDrag(e.clientY);
}

function applyDrag(y: number) {
  const now = Date.now();
  const dt = now - lastEventTime;
  if (dt > 0) releaseVelocity = (y - lastClientY) / dt;
  lastClientY = y;
  lastEventTime = now;
  translateY.value = Math.max(0, dragStartTranslateY + (y - dragStartClientY));
}

function onDragEnd() {
  isDragging.value = false;
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
  window.removeEventListener("touchmove", onTouchMove);
  window.removeEventListener("touchend", onDragEnd);
  window.removeEventListener("mousemove", onMouseMove);
  window.removeEventListener("mouseup", onDragEnd);
}

function getEventY(e: Event): number {
  if (e instanceof TouchEvent) return e.touches[0]?.clientY ?? 0;
  if (e instanceof MouseEvent) return e.clientY;
  return 0;
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
          @touchstart="onDragStart"
          @mousedown="onDragStart"
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
            <div class="min-w-0">
              <slot name="title">
                <h2
                  class="text-lg font-bold text-text-h-light dark:text-text-h-dark truncate"
                >
                  {{ title }}
                </h2>
              </slot>
            </div>

            <button
              @click="open = false"
              class="p-2 -mr-2 cursor-pointer text-text-light dark:text-text-dark hover:text-text-h-light dark:hover:text-text-h-dark shrink-0"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
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
