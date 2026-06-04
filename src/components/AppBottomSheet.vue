<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted, watch } from "vue";
import { createBottomSheet, type BottomSheetCore } from "@plainsheet/core";

defineProps<{
  title?: string;
}>();

const open = defineModel<boolean>("open", { required: true });

const contentWrapper = ref<HTMLElement | null>(null);
let sheet: BottomSheetCore | null = null;
let darkObserver: MutationObserver | null = null;

const isDark = () => document.documentElement.classList.contains("dark");

const syncDarkMode = () => {
  if (!sheet?.elements) return;
  const dark = isDark();
  const root = sheet.elements.bottomSheetRoot;
  const container = sheet.elements.bottomSheetContainer;
  const gapFiller = sheet.elements.bottomSheetContainerGapFiller;

  if (root) {
    root.classList.toggle("dark", dark);
  }

  // Override plainsheet's CSS variable for container background
  const bg = dark
    ? getComputedStyle(document.documentElement)
        .getPropertyValue("--color-bg-dark")
        .trim()
    : getComputedStyle(document.documentElement)
        .getPropertyValue("--color-bg-light")
        .trim();

  if (container) {
    container.style.setProperty("--pbs-container-background-color", bg);
    container.style.backgroundColor = bg;
  }
  if (gapFiller) {
    gapFiller.style.backgroundColor = bg;
  }
};

onMounted(() => {
  sheet = createBottomSheet({
    content: "",
    width: "100%",
    containerBorderRadius: "16px",
    shouldShowBackdrop: true,
    shouldShowHandle: true,
    expandable: false,
    backdropColor: "rgba(0, 0, 0, 0.6)",
    afterClose: () => {
      open.value = false;
    },
  });

  sheet.mount();

  // Grab the content wrapper for our Teleport
  if (sheet.elements.bottomSheetContentWrapper) {
    contentWrapper.value = sheet.elements.bottomSheetContentWrapper;
  }

  // Style the container/handle
  if (sheet.elements.bottomSheetContainer) {
    sheet.elements.bottomSheetContainer.style.width = "100%";
    sheet.elements.bottomSheetContainer.style.maxHeight = "92vh";
  }
  if (sheet.elements.bottomSheetHandleBar) {
    sheet.elements.bottomSheetHandleBar.style.backgroundColor = isDark()
      ? "#2e303a"
      : "#e5e4e7";
  }

  // Initial dark mode sync
  syncDarkMode();

  // Observe dark class changes on <html>
  darkObserver = new MutationObserver(() => {
    syncDarkMode();
    // Also update handle bar color
    if (sheet?.elements.bottomSheetHandleBar) {
      sheet.elements.bottomSheetHandleBar.style.backgroundColor = isDark()
        ? "#2e303a"
        : "#e5e4e7";
    }
  });
  darkObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });

  if (open.value) {
    nextTick(() => sheet?.open());
  }
});

watch(open, async (isOpen) => {
  if (!sheet) return;
  if (isOpen) {
    await nextTick();
    syncDarkMode();
    sheet.open();
  } else {
    sheet.close();
  }
});

onUnmounted(() => {
  darkObserver?.disconnect();
  sheet?.unmount();
});
</script>

<template>
  <Teleport v-if="contentWrapper" :to="contentWrapper">
    <!-- Header -->
    <div
      class="flex items-center justify-between px-5 py-4 border-b border-border-light dark:border-border-dark shrink-0"
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
        class="p-2 -mr-2 text-text-light dark:text-text-dark hover:text-text-h-light dark:hover:text-text-h-dark cursor-pointer shrink-0"
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
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>

    <!-- Subheader -->
    <slot name="subheader"></slot>

    <!-- Body -->
    <div class="overflow-y-auto flex-1 flex flex-col relative">
      <slot></slot>
    </div>

    <!-- Footer -->
    <div
      v-if="$slots.footer"
      class="px-5 py-4 border-t border-border-light dark:border-border-dark flex gap-3 shrink-0"
    >
      <slot name="footer"></slot>
    </div>
  </Teleport>
</template>

<style>
/* Override plainsheet's default content wrapper to use flexbox layout */
.pbs-content-wrapper {
  display: flex !important;
  flex-direction: column !important;
}

/* Override plainsheet's container to use full width on mobile */
.pbs-container {
  width: 100% !important;
}

/* Raise z-index above the FAB (z-40 = 40) */
.pbs-root {
  z-index: 50 !important;
}
.pbs-backdrop {
  z-index: 49 !important;
}
</style>
