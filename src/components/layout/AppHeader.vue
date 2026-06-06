<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useFeatureFlags } from "../../config/features";

// Routing logic
const router = useRouter();
const route = useRoute();

const features = useFeatureFlags();
const isStaging = computed(() => features.environment === "staging");
const isDevelopment = computed(() => features.environment === "development");

const navigateTo = (routeName: string) => {
  router.push({ name: routeName });
  closeSidebar();
};

// Theme toggling logic
const isDark = ref(false);

const toggleTheme = () => {
  isDark.value = !isDark.value;
  if (isDark.value) {
    document.documentElement.classList.add("dark");
    localStorage.setItem("theme", "dark");
  } else {
    document.documentElement.classList.remove("dark");
    localStorage.setItem("theme", "light");
  }
};

// --- Sidebar open/close state ---
const sidebarOpen = ref(false);
const sidebarEl = ref<HTMLElement | null>(null);

const openSidebar = () => (sidebarOpen.value = true);
const closeSidebar = () => (sidebarOpen.value = false);

// --- Drag-to-open / drag-to-close ---
// The sidebar enters from the right. Dragging it left reveals it; dragging it
// right dismisses it. `dragOffset` is the live translateX in px applied while a
// drag is in progress (0 = fully open, sidebarWidth = fully closed).
const EDGE_ZONE = 24; // px-wide strip on the right edge that initiates an open-swipe
const INTENT_THRESHOLD = 8; // px of movement before we commit to a drag axis
const VELOCITY_THRESHOLD = 0.5; // px/ms flick speed that forces a decision

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
let dragMode: "open" | "close" = "open";

const measureWidth = () =>
  sidebarEl.value?.offsetWidth ?? Math.min(window.innerWidth * 0.75, 320);

const beginDrag = (e: PointerEvent, mode: "open" | "close") => {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  pointerId = e.pointerId;
  startX = lastX = e.clientX;
  startY = e.clientY;
  lastT = e.timeStamp;
  velocity = 0;
  intent = "none";
  dragMode = mode;
  sidebarWidth.value = measureWidth();
  window.addEventListener("pointermove", onMove, { passive: false });
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);
};

const onPanelPointerDown = (e: PointerEvent) => beginDrag(e, "close");

const onEdgePointerDown = (e: PointerEvent) => {
  if (window.innerWidth - e.clientX > EDGE_ZONE) return;
  beginDrag(e, "open");
};

const onMove = (e: PointerEvent) => {
  if (e.pointerId !== pointerId) return;
  const dx = e.clientX - startX;
  const dy = e.clientY - startY;

  if (intent === "none") {
    if (Math.abs(dx) < INTENT_THRESHOLD && Math.abs(dy) < INTENT_THRESHOLD)
      return;
    intent = Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
    if (intent === "vertical") {
      // Let the browser handle vertical scrolling.
      teardown();
      return;
    }
    isDragging.value = true;
  }

  e.preventDefault();
  const w = sidebarWidth.value;
  const base = dragMode === "open" ? w : 0;
  dragOffset.value = Math.max(0, Math.min(w, base + dx));

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

// While dragging we drive position with an inline transform (no transition);
// otherwise the open/closed classes animate it.
const contentStyle = computed(() =>
  isDragging.value
    ? { transform: `translateX(${dragOffset.value}px)`, transition: "none" }
    : {},
);

const overlayStyle = computed(() => {
  if (!isDragging.value) return {};
  const w = sidebarWidth.value || 1;
  return {
    opacity: String(1 - dragOffset.value / w),
    transition: "none",
  };
});

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === "Escape") closeSidebar();
};

watch(sidebarOpen, (open) => {
  document.body.style.overflow = open ? "hidden" : "";
});

onMounted(() => {
  // Check local storage or system preference
  const savedTheme = localStorage.getItem("theme");
  if (
    savedTheme === "dark" ||
    (!savedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches)
  ) {
    isDark.value = true;
    document.documentElement.classList.add("dark");
  } else {
    isDark.value = false;
    document.documentElement.classList.remove("dark");
  }

  window.addEventListener("keydown", onKeydown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKeydown);
  teardown();
  document.body.style.overflow = "";
});
</script>

<template>
  <header
    class="w-full flex items-center justify-between px-4 py-3 border-b border-border-light dark:border-border-dark bg-bg-light dark:bg-bg-dark sticky top-0 z-40 transition-colors duration-300"
  >
    <!-- Logo on the left -->
    <a
      class="flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-accent rounded cursor-pointer"
      @click.prevent="navigateTo('dashboard')"
    >
      <svg
        viewBox="0 0 108 30"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        class="h-8 w-auto"
      >
        <g clip-path="url(#clip0_1665_5096)">
          <path
            d="M15 30L30 0L0 0L15 30Z"
            :fill="isDark ? '#1FC7B9' : '#373737'"
          />
          <path
            d="M10.3613 3.19995L15.0143 12.5056L19.6673 3.19995H23.2674L12.4335 24.867L10.6335 21.2669L13.2143 16.1056L6.76123 3.19995H10.3613Z"
            :fill="isDark ? '#373737' : '#1FC7B9'"
          />
        </g>
        <path
          d="M35.6102 22L41.9102 8H44.4702L50.7902 22H48.0702L42.6502 9.38H43.6902L38.2902 22H35.6102ZM38.5102 18.76L39.2102 16.72H46.7702L47.4702 18.76H38.5102ZM69.5506 14.44H76.5306V16.64H69.5506V14.44ZM69.7706 22H67.1706V8H77.3906V10.18H69.7706V22ZM91.9195 22L98.2195 8H100.78L107.1 22H104.38L98.9595 9.38H99.9995L94.5995 22H91.9195ZM94.8195 18.76L95.5195 16.72H103.08L103.78 18.76H94.8195Z"
          :fill="isDark ? '#e5e7eb' : '#373737'"
        />
      </svg>
      <span
        v-if="isStaging"
        class="text-[10px] font-bold ml-5 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 select-none uppercase tracking-wider"
      >
        Staging
      </span>
      <span
        v-if="isDevelopment"
        class="text-[10px] font-bold ml-5 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 select-none uppercase tracking-wider"
      >
        Development
      </span>
    </a>

    <!-- Burger Menu -->
    <button
      type="button"
      class="p-2 -mr-2 rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
      @click="openSidebar"
    >
      <!-- Burger Icon -->
      <svg
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
        <line x1="4" x2="20" y1="12" y2="12" />
        <line x1="4" x2="20" y1="6" y2="6" />
        <line x1="4" x2="20" y1="18" y2="18" />
      </svg>
      <span class="sr-only">Open menu</span>
    </button>
  </header>

  <!-- Edge swipe zone: lets a closed sidebar be dragged in from the right -->
  <div
    v-show="!sidebarOpen"
    class="fixed top-0 right-0 z-30 h-full w-4 touch-pan-y"
    @pointerdown="onEdgePointerDown"
  ></div>

  <!-- Overlay -->
  <div
    class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity duration-300"
    :class="sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'"
    :style="overlayStyle"
    @click="closeSidebar"
  ></div>

  <!-- Sidebar -->
  <aside
    ref="sidebarEl"
    role="dialog"
    aria-modal="true"
    aria-label="Main navigation menu"
    class="fixed right-0 top-0 bottom-0 z-50 w-3/4 max-w-xs bg-bg-light dark:bg-bg-dark text-text-light dark:text-text-dark shadow-2xl p-6 focus:outline-none border-l border-border-light dark:border-border-dark flex flex-col justify-between h-full transition-transform duration-300 touch-pan-y"
    :class="sidebarOpen ? 'translate-x-0' : 'translate-x-full'"
    :style="contentStyle"
    @pointerdown="onPanelPointerDown"
  >
    <div class="flex flex-col gap-6">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-bold tracking-wider text-accent uppercase">
          Menu
        </h2>
        <button
          type="button"
          class="text-text-light dark:text-text-dark p-2 -mr-2 rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
          @click="closeSidebar"
        >
          <!-- Close Icon -->
          <svg
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
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
          <span class="sr-only">Close menu</span>
        </button>
      </div>

      <nav class="flex flex-col gap-4">
        <!-- Execute Routine / Execute with Calculator / Analytics -->
        <a
          href="#"
          :class="[
            'flex items-center gap-3 font-medium text-lg transition-colors cursor-pointer group',
            route.name === 'dashboard'
              ? 'text-accent'
              : 'text-text-light dark:text-text-dark hover:text-accent',
          ]"
          @click.prevent="navigateTo('dashboard')"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            :class="[
              'w-5 h-5 transition-colors',
              route.name === 'dashboard'
                ? 'text-accent'
                : 'text-text-light/70 dark:text-text-dark/70 group-hover:text-accent',
            ]"
          >
            <rect width="7" height="9" x="3" y="3" rx="1" />
            <rect width="7" height="5" x="14" y="3" rx="1" />
            <rect width="7" height="9" x="14" y="12" rx="1" />
            <rect width="7" height="5" x="3" y="16" rx="1" />
          </svg>
          <span>Dashboard</span>
        </a>

        <!-- Configure / Activate Plans & Routines -->
        <a
          href="#"
          :class="[
            'flex items-center gap-3 font-medium text-lg transition-colors cursor-pointer group',
            ['plans', 'plan-details', 'routine-details'].includes(
              route.name as string,
            )
              ? 'text-accent'
              : 'text-text-light dark:text-text-dark hover:text-accent',
          ]"
          @click.prevent="navigateTo('plans')"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            :class="[
              'w-5 h-5 transition-colors',
              ['plans', 'plan-details', 'routine-details'].includes(
                route.name as string,
              )
                ? 'text-accent'
                : 'text-text-light/70 dark:text-text-dark/70 group-hover:text-accent',
            ]"
          >
            <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
            <line x1="16" x2="16" y1="2" y2="6" />
            <line x1="8" x2="8" y1="2" y2="6" />
            <line x1="3" x2="21" y1="10" y2="10" />
            <path d="m9 16 2 2 4-4" />
          </svg>
          <span>Plans</span>
        </a>

        <!-- Analytics -->
        <a
          href="#"
          :class="[
            'flex items-center gap-3 font-medium text-lg transition-colors cursor-pointer group',
            route.name === 'analytics'
              ? 'text-accent'
              : 'text-text-light dark:text-text-dark hover:text-accent',
          ]"
          @click.prevent="navigateTo('analytics')"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            :class="[
              'w-5 h-5 transition-colors',
              route.name === 'analytics'
                ? 'text-accent'
                : 'text-text-light/70 dark:text-text-dark/70 group-hover:text-accent',
            ]"
          >
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <span>Analytics</span>
        </a>

        <!-- Configure Exercises -->
        <a
          href="#"
          :class="[
            'flex items-center gap-3 font-medium text-lg transition-colors cursor-pointer group',
            route.name === 'exercises'
              ? 'text-accent'
              : 'text-text-light dark:text-text-dark hover:text-accent',
          ]"
          @click.prevent="navigateTo('exercises')"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            :class="[
              'w-5 h-5 transition-colors',
              route.name === 'exercises'
                ? 'text-accent'
                : 'text-text-light/70 dark:text-text-dark/70 group-hover:text-accent',
            ]"
          >
            <path d="M18 8h2a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2" />
            <path d="M6 8H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" />
            <rect x="6" y="5" width="2" height="14" rx="1" />
            <rect x="16" y="5" width="2" height="14" rx="1" />
            <line x1="8" x2="16" y1="12" y2="12" />
          </svg>
          <span>Exercises</span>
        </a>

        <!-- App Settings -->
        <a
          href="#"
          :class="[
            'flex items-center gap-3 font-medium text-lg transition-colors cursor-pointer group',
            route.name === 'settings'
              ? 'text-accent'
              : 'text-text-light dark:text-text-dark hover:text-accent',
          ]"
          @click.prevent="navigateTo('settings')"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            :class="[
              'w-5 h-5 transition-colors',
              route.name === 'settings'
                ? 'text-accent'
                : 'text-text-light/70 dark:text-text-dark/70 group-hover:text-accent',
            ]"
          >
            <path
              d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
            />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <span>Settings</span>
        </a>
      </nav>
    </div>

    <!-- Bottom Theme Switcher -->
    <div
      class="pt-6 border-t border-border-light dark:border-border-dark flex items-center justify-between mt-auto"
    >
      <span class="text-sm font-medium text-text-light dark:text-text-dark"
        >Theme</span
      >
      <button
        class="p-2 rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus:outline-none focus:ring-2 focus:ring-accent flex items-center justify-center cursor-pointer"
        @click="toggleTheme"
      >
        <!-- Sun icon (shows in dark mode) -->
        <svg
          v-if="isDark"
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="text-yellow-400"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="m4.93 4.93 1.41 1.41" />
          <path d="m17.66 17.66 1.41 1.41" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="m6.34 17.66-1.41 1.41" />
          <path d="m19.07 4.93-1.41 1.41" />
        </svg>
        <!-- Moon icon (shows in light mode) -->
        <svg
          v-else
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="text-indigo-600"
        >
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
        <span class="sr-only">Toggle theme</span>
      </button>
    </div>
  </aside>
</template>
