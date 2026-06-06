<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from "vue";
import { useRouter, useRoute } from "vue-router";

const props = defineProps<{ isDark: boolean }>();
const emit = defineEmits<{ (e: "toggle-theme"): void }>();

const router = useRouter();
const route = useRoute();

const sidebarOpen = ref(false);
const sidebarEl = ref<HTMLElement | null>(null);

const closeSidebar = () => (sidebarOpen.value = false);

const navigateTo = (routeName: string) => {
  router.push({ name: routeName });
  closeSidebar();
};

defineExpose({ open: () => (sidebarOpen.value = true) });

watch(sidebarOpen, (open) => {
  document.body.style.overflow = open ? "hidden" : "";
});

onUnmounted(() => {
  teardown();
  document.body.style.overflow = "";
});

// ── Gesture handling ─────────────────────────────────────────────────────────

const EDGE_ZONE = 24;
const INTENT_THRESHOLD = 8;
const VELOCITY_THRESHOLD = 0.5;

const isDragging = ref(false);
const dragOffset = ref(0);
const sidebarWidth = ref(0);

let pointerId: number | null = null;
let startX = 0;
let startY = 0;
let lastX = 0;
let lastT = 0;
let velocity = 0;
let intent: "none" | "horizontal" | "vertical" = "none";
let suppressNextClick = false;

const measureWidth = () =>
  sidebarEl.value?.offsetWidth ?? Math.min(window.innerWidth * 0.75, 320);

const offsetFromPointer = (clientX: number) => {
  const w = sidebarWidth.value;
  return Math.max(0, Math.min(w, clientX - (window.innerWidth - w)));
};

const beginDrag = (e: PointerEvent) => {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  pointerId = e.pointerId;
  startX = lastX = e.clientX;
  startY = e.clientY;
  lastT = e.timeStamp;
  velocity = 0;
  intent = "none";
  sidebarWidth.value = measureWidth();
  window.addEventListener("pointermove", onMove, { passive: false });
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);
};

const onEdgePointerDown = (e: PointerEvent) => {
  if (window.innerWidth - e.clientX > EDGE_ZONE) return;
  beginDrag(e);
};

const onOverlayPointerDown = (e: PointerEvent) => {
  if (sidebarOpen.value) beginDrag(e);
};

const onOverlayClick = () => {
  if (suppressNextClick) { suppressNextClick = false; return; }
  closeSidebar();
};

const onMove = (e: PointerEvent) => {
  if (e.pointerId !== pointerId) return;
  const dx = e.clientX - startX;
  const dy = e.clientY - startY;

  if (intent === "none") {
    if (Math.abs(dx) < INTENT_THRESHOLD && Math.abs(dy) < INTENT_THRESHOLD) return;
    intent = Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
    if (intent === "vertical") { teardown(); return; }
    isDragging.value = true;
  }

  e.preventDefault();
  dragOffset.value = offsetFromPointer(e.clientX);

  const dt = e.timeStamp - lastT;
  if (dt > 0) velocity = (e.clientX - lastX) / dt;
  lastX = e.clientX;
  lastT = e.timeStamp;
};

const endDrag = () => {
  if (intent === "horizontal") {
    const w = sidebarWidth.value;
    if (velocity < -VELOCITY_THRESHOLD) sidebarOpen.value = true;
    else if (velocity > VELOCITY_THRESHOLD) sidebarOpen.value = false;
    else sidebarOpen.value = dragOffset.value < w / 2;
    suppressNextClick = true;
  }
  teardown();
};

const teardown = () => {
  window.removeEventListener("pointermove", onMove);
  window.removeEventListener("pointerup", endDrag);
  window.removeEventListener("pointercancel", endDrag);
  isDragging.value = false;
  dragOffset.value = 0;
  intent = "none";
  pointerId = null;
};

const sidebarStyle = computed(() => {
  if (isDragging.value)
    return { transform: `translateX(${dragOffset.value}px)`, transition: "none" };
  return { transform: sidebarOpen.value ? "translateX(0)" : "translateX(100%)" };
});

const overlayStyle = computed(() => {
  if (!isDragging.value) return {};
  const w = sidebarWidth.value || 1;
  return { opacity: String(1 - dragOffset.value / w), transition: "none" };
});

const isActive = (names: readonly string[] | string) => {
  const list = Array.isArray(names) ? names : [names];
  return list.includes(route.name as string);
};
</script>

<template>
  <!-- Edge swipe zone: initiates an open-drag from the right edge when closed -->
  <div
    v-show="!sidebarOpen"
    class="fixed top-0 right-0 z-30 h-full w-4 touch-pan-y"
    @pointerdown="onEdgePointerDown"
  />

  <!-- Overlay -->
  <div
    class="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm transition-opacity duration-300"
    :class="sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'"
    :style="overlayStyle"
    @pointerdown="onOverlayPointerDown"
    @click="onOverlayClick"
  />

  <!-- Sidebar panel -->
  <aside
    ref="sidebarEl"
    role="dialog"
    aria-modal="true"
    aria-label="Main navigation menu"
    class="fixed right-0 top-0 bottom-0 z-[60] w-3/4 max-w-xs bg-bg-light dark:bg-bg-dark text-text-light dark:text-text-dark shadow-2xl p-6 border-l border-border-light dark:border-border-dark flex flex-col justify-between h-full transition-transform duration-300 touch-pan-y"
    :style="sidebarStyle"
    @pointerdown="beginDrag"
  >
    <div class="flex flex-col gap-6">
      <!-- Header row -->
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-bold tracking-wider text-accent uppercase">Menu</h2>
        <button
          type="button"
          class="text-text-light dark:text-text-dark p-2 -mr-2 rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
          @click="closeSidebar"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
          </svg>
          <span class="sr-only">Close menu</span>
        </button>
      </div>

      <!-- Nav links -->
      <nav class="flex flex-col gap-4">
        <a
          v-for="item in [
            { name: 'dashboard', label: 'Dashboard', match: ['dashboard'] },
            { name: 'plans', label: 'Plans', match: ['plans', 'plan-details', 'routine-details'] },
            { name: 'analytics', label: 'Analytics', match: ['analytics'] },
            { name: 'exercises', label: 'Exercises', match: ['exercises'] },
            { name: 'settings', label: 'Settings', match: ['settings'] },
          ]"
          :key="item.name"
          href="#"
          class="flex items-center gap-3 font-medium text-lg transition-colors cursor-pointer group"
          :class="isActive(item.match) ? 'text-accent' : 'text-text-light dark:text-text-dark hover:text-accent'"
          @click.prevent="navigateTo(item.name)"
        >
          <!-- Dashboard icon -->
          <svg v-if="item.name === 'dashboard'" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 transition-colors" :class="isActive(item.match) ? 'text-accent' : 'text-text-light/70 dark:text-text-dark/70 group-hover:text-accent'">
            <rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" />
          </svg>
          <!-- Plans icon -->
          <svg v-else-if="item.name === 'plans'" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 transition-colors" :class="isActive(item.match) ? 'text-accent' : 'text-text-light/70 dark:text-text-dark/70 group-hover:text-accent'">
            <rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" /><path d="m9 16 2 2 4-4" />
          </svg>
          <!-- Analytics icon -->
          <svg v-else-if="item.name === 'analytics'" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 transition-colors" :class="isActive(item.match) ? 'text-accent' : 'text-text-light/70 dark:text-text-dark/70 group-hover:text-accent'">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <!-- Exercises icon -->
          <svg v-else-if="item.name === 'exercises'" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 transition-colors" :class="isActive(item.match) ? 'text-accent' : 'text-text-light/70 dark:text-text-dark/70 group-hover:text-accent'">
            <path d="M18 8h2a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2" /><path d="M6 8H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" /><rect x="6" y="5" width="2" height="14" rx="1" /><rect x="16" y="5" width="2" height="14" rx="1" /><line x1="8" x2="16" y1="12" y2="12" />
          </svg>
          <!-- Settings icon -->
          <svg v-else-if="item.name === 'settings'" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 transition-colors" :class="isActive(item.match) ? 'text-accent' : 'text-text-light/70 dark:text-text-dark/70 group-hover:text-accent'">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" />
          </svg>
          <span>{{ item.label }}</span>
        </a>
      </nav>
    </div>

    <!-- Theme toggle -->
    <div class="pt-6 border-t border-border-light dark:border-border-dark flex items-center justify-between mt-auto">
      <span class="text-sm font-medium text-text-light dark:text-text-dark">Theme</span>
      <button
        class="p-2 rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus:outline-none focus:ring-2 focus:ring-accent flex items-center justify-center cursor-pointer"
        @click="$emit('toggle-theme')"
      >
        <!-- Sun (shown in dark mode) -->
        <svg v-if="isDark" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-yellow-400">
          <circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
        </svg>
        <!-- Moon (shown in light mode) -->
        <svg v-else xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-indigo-600">
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
        <span class="sr-only">Toggle theme</span>
      </button>
    </div>
  </aside>
</template>
