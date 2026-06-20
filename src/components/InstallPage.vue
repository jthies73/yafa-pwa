<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { detectPlatform, isStandalone, type OS } from "../utils/platform";

// Each instruction step; `glyph` (when set) renders a framed placeholder
// showing the actual control the user is looking for, with `caption` describing
// the screenshot that will sit there.
type Glyph = "share" | "add-to-home" | "menu-dots" | "install";
interface Step {
  title: string;
  body: string;
  glyph?: Glyph;
  caption?: string;
}

const { os, isIOSNonSafari } = detectPlatform();

// Standalone is effectively fixed per session, but track the display-mode query
// so the success state appears immediately if the app gets installed while open.
const installed = ref(isStandalone());
let mql: MediaQueryList | undefined;
const onDisplayModeChange = () => (installed.value = isStandalone());

onMounted(() => {
  mql = window.matchMedia("(display-mode: standalone)");
  mql.addEventListener("change", onDisplayModeChange);

  if (["development", "staging", "production"].includes(import.meta.env.MODE)) {
    const baseUrl = import.meta.env.VITE_API_BASE_URL;
    if (baseUrl) {
      fetch(`${baseUrl}/install-visits`, { method: "POST" }).catch(() => {});
    }
  }
});
onUnmounted(() => mql?.removeEventListener("change", onDisplayModeChange));

const HEADINGS: Record<OS, string> = {
  ios: "Install YAFA on iOS",
  android: "Install YAFA on Android",
  desktop: "Install YAFA Desktop App",
};

const STEPS: Record<OS, Step[]> = {
  ios: [
    {
      title: "Open in Safari",
      body: "Make sure you're viewing this page in the native Safari browser. In-app browsers (Instagram, Reddit, etc.) can't install apps.",
    },
    {
      title: "Tap Share",
      body: "Find the Share icon — Usually located on the bottom right on iPhone.",
      glyph: "share",
      caption: "The Share icon — a box with an upward arrow",
    },
    {
      title: "Add to Home Screen",
      body: "Scroll down the share menu and select Add to Home Screen.",
      glyph: "add-to-home",
      caption: 'The "Add to Home Screen" icon in the share menu',
    },
    {
      title: "Confirm",
      body: "Tap Add in the top-right corner. YAFA is now available on your home screen as a standalone app.",
    },
  ],
  android: [
    {
      title: "Open the menu",
      body: "Tap the Menu icon — three vertical dots — in the top-right corner of Chrome. (other browsers may not support installation)",
      glyph: "menu-dots",
      caption: "Chrome's 3-dot menu, top right",
    },
    {
      title: "Install app",
      body: 'Select Install app (or "Add to Home screen" on older versions) from the dropdown.',
      glyph: "install",
      caption: 'The "Install app" option in the menu',
    },
    {
      title: "Confirm",
      body: "Tap Install on the prompt. YAFA is now available on your home screen as a standalone app.",
    },
  ],
  desktop: [
    {
      title: "Find the install icon",
      body: "Look for the Install icon — a monitor with a downward arrow — on the right side of your browser's address bar.",
      glyph: "install",
      caption: "The install icon in the address bar",
    },
    {
      title: "Click Install",
      body: "Confirm the prompt to install YAFA as a native desktop application.",
    },
  ],
};

const heading = computed(() => HEADINGS[os]);
const steps = computed(() => STEPS[os]);

// Web Share API: on iOS the native share sheet is exactly where "Add to Home
// Screen" lives, so surfacing it here is the fastest path to installing.
const canShare = typeof navigator !== "undefined" && "share" in navigator;

const share = async () => {
  try {
    await navigator.share({
      title: "YAFA",
      text: "Add YAFA to your home screen",
      url: window.location.href,
    });
  } catch {
    // User dismissed the share sheet, or it's unavailable — nothing to do.
  }
};
</script>

<template>
  <div class="p-6 relative min-h-full flex flex-col animate-fade-in">
    <!-- Header -->
    <div class="mb-6">
      <h1
        class="text-3xl font-bold tracking-tight text-text-h-light dark:text-text-h-dark"
      >
        Install App
      </h1>
      <p class="text-sm text-text-light dark:text-text-dark opacity-70 mt-1">
        Add YAFA to your device for instant, full-screen access.
      </p>
    </div>

    <div class="flex flex-col gap-6 max-w-2xl w-full">
      <!-- Already installed: success state replaces the steps entirely -->
      <div
        v-if="installed"
        class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-8 shadow-sm flex flex-col items-center text-center gap-3"
      >
        <span
          class="flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 text-accent"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        <h2 class="text-lg font-bold text-text-h-light dark:text-text-h-dark">
          YAFA is installed
        </h2>
        <p class="text-sm text-text-light dark:text-text-dark opacity-70">
          You're running the installed app on this device. Nothing more to do.
        </p>
      </div>

      <template v-else>
        <!-- Native share: opens the OS share sheet, where "Add to Home Screen"
             lives on iOS. Shown only where the Web Share API is supported. -->
        <button
          v-if="canShare"
          type="button"
          class="flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white shadow-sm cursor-pointer hover:bg-accent/90 transition-colors duration-150"
          @click="share"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M12 2v13" />
            <path d="m8 6 4-4 4 4" />
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
          </svg>
          Open share menu
        </button>

        <!-- iOS-in-a-non-Safari-browser warning: installation needs Safari -->
        <div
          v-if="isIOSNonSafari"
          class="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-700 dark:text-amber-400"
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
            class="mt-0.5 shrink-0"
          >
            <path
              d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
            />
            <line x1="12" x2="12" y1="9" y2="13" />
            <line x1="12" x2="12.01" y1="17" y2="17" />
          </svg>
          <p class="text-sm font-medium">
            iOS requires you to open this page in Safari to install the app.
          </p>
        </div>

        <!-- Instruction card -->
        <div
          class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-6 shadow-sm"
        >
          <h2
            class="text-lg font-bold text-text-h-light dark:text-text-h-dark mb-5"
          >
            {{ heading }}
          </h2>

          <ol class="flex flex-col gap-5">
            <li v-for="(step, i) in steps" :key="i" class="flex flex-col gap-3">
              <div class="flex items-start gap-3">
                <!-- Step number badge -->
                <span
                  class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent"
                >
                  {{ i + 1 }}
                </span>
                <div class="min-w-0 pt-0.5">
                  <div
                    class="font-semibold text-sm text-text-h-light dark:text-text-h-dark"
                  >
                    {{ step.title }}
                  </div>
                  <p
                    class="text-sm text-text-light dark:text-text-dark opacity-70 mt-0.5"
                  >
                    {{ step.body }}
                  </p>
                </div>
              </div>

              <!-- Screenshot placeholder: framed box showing the real control
                   glyph plus a caption (inline SVG, never a stock image). -->
              <div
                v-if="step.glyph"
                class="ml-10 flex items-center gap-3 rounded-lg border border-dashed border-border-light dark:border-border-dark bg-bg-light dark:bg-bg-dark px-4 py-3"
              >
                <span
                  class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-light dark:bg-surface-dark text-accent"
                >
                  <!-- iOS Share -->
                  <svg
                    v-if="step.glyph === 'share'"
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M12 2v13" />
                    <path d="m8 6 4-4 4 4" />
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  </svg>
                  <!-- Add to Home Screen -->
                  <svg
                    v-else-if="step.glyph === 'add-to-home'"
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <rect width="18" height="18" x="3" y="3" rx="3" />
                    <path d="M12 8v8" />
                    <path d="M8 12h8" />
                  </svg>
                  <!-- 3-dot menu -->
                  <svg
                    v-else-if="step.glyph === 'menu-dots'"
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <circle cx="12" cy="5" r="1.6" />
                    <circle cx="12" cy="12" r="1.6" />
                    <circle cx="12" cy="19" r="1.6" />
                  </svg>
                  <!-- Install (monitor with down arrow) -->
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
                  >
                    <path d="M12 3v9" />
                    <path d="m8 9 4 3 4-3" />
                    <rect width="20" height="14" x="2" y="3" rx="2" />
                    <path d="M8 21h8" />
                    <path d="M12 17v4" />
                  </svg>
                </span>
                <span
                  class="text-xs text-text-light dark:text-text-dark opacity-60"
                >
                  {{ step.caption }}
                </span>
              </div>
            </li>
          </ol>
        </div>
      </template>
    </div>
  </div>
</template>
