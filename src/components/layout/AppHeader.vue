<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useFeatureFlags } from "../../config/features";
import AppSidebar from "./AppSidebar.vue";

const router = useRouter();

const features = useFeatureFlags();
const isStaging = computed(() => features.environment === "staging");
const isDevelopment = computed(() => features.environment === "development");

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

onMounted(() => {
  const saved = localStorage.getItem("theme");
  isDark.value =
    saved === "dark" ||
    (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches);
  if (isDark.value) document.documentElement.classList.add("dark");
});

const sidebar = ref<InstanceType<typeof AppSidebar> | null>(null);
</script>

<template>
  <header
    class="w-full flex items-center justify-between px-4 py-3 border-b border-border-light dark:border-border-dark bg-bg-light dark:bg-bg-dark sticky top-0 z-40 transition-colors duration-300"
  >
    <!-- Logo -->
    <a
      class="flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-accent rounded cursor-pointer"
      @click.prevent="router.push({ name: 'dashboard' })"
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
        Staging :)
      </span>
      <span
        v-if="isDevelopment"
        class="text-[10px] font-bold ml-5 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 select-none uppercase tracking-wider"
      >
        Development
      </span>
    </a>

    <!-- Burger button -->
    <button
      type="button"
      class="p-2 -mr-2 rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
      @click="sidebar?.open()"
    >
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

  <AppSidebar ref="sidebar" :is-dark="isDark" @toggle-theme="toggleTheme" />
</template>
