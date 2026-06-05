<script setup lang="ts">
import { ref, onMounted } from "vue";
import {
  DialogRoot,
  DialogTrigger,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "reka-ui";
import { useRouter, useRoute } from "vue-router";

// Routing logic
const router = useRouter();
const route = useRoute();

const navigateTo = (routeName: string) => {
  router.push({ name: routeName });
  sidebarOpen.value = false;
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

// Sidebar open/close reactive control
const sidebarOpen = ref(false);

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
});
</script>

<template>
  <header
    class="w-full flex items-center justify-between px-4 py-3 border-b border-border-light dark:border-border-dark bg-bg-light dark:bg-bg-dark sticky top-0 z-40 transition-colors duration-300"
  >
    <!-- Logo on the left -->
    <a
      @click.prevent="navigateTo('dashboard')"
      class="flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-accent rounded cursor-pointer"
    >
      <img
        src="/src/assets/Logo_Full.svg"
        alt="YAFA Logo"
        class="h-8 w-8 object-contain"
      />
      <span
        class="font-bold text-text-h-light dark:text-text-h-dark tracking-widest uppercase text-sm hidden sm:inline-block"
        >Y A F A</span
      >
    </a>

    <!-- Burger Menu + Sidebar on the right -->
    <DialogRoot v-model:open="sidebarOpen">
      <DialogTrigger
        as="button"
        class="p-2 -mr-2 rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
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
      </DialogTrigger>

      <DialogPortal>
        <Transition name="overlay-transition">
          <DialogOverlay
            v-if="sidebarOpen"
            class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
          />
        </Transition>
        <Transition name="sidebar-transition">
          <DialogContent
            v-if="sidebarOpen"
            class="fixed right-0 top-0 bottom-0 z-50 w-3/4 max-w-xs bg-bg-light dark:bg-bg-dark text-text-light dark:text-text-dark shadow-2xl p-6 focus:outline-none border-l border-border-light dark:border-border-dark flex flex-col justify-between h-full"
          >
            <div class="flex flex-col gap-6">
              <div class="flex items-center justify-between">
                <DialogTitle
                  class="text-lg font-bold tracking-wider text-accent uppercase"
                >
                  Menu
                </DialogTitle>
                <DialogClose
                  as="button"
                  class="text-text-light dark:text-text-dark p-2 -mr-2 rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
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
                </DialogClose>
              </div>

              <DialogDescription class="sr-only">
                Main navigation menu
              </DialogDescription>

              <nav class="flex flex-col gap-4">
                <!-- Execute Routine / Execute with Calculator / Analytics -->
                <a
                  href="#"
                  @click.prevent="navigateTo('dashboard')"
                  :class="[
                    'flex items-center gap-3 font-medium text-lg transition-colors cursor-pointer group',
                    route.name === 'dashboard'
                      ? 'text-accent'
                      : 'text-text-light dark:text-text-dark hover:text-accent',
                  ]"
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
                  @click.prevent="navigateTo('plans')"
                  :class="[
                    'flex items-center gap-3 font-medium text-lg transition-colors cursor-pointer group',
                    ['plans', 'plan-details', 'routine-details'].includes(
                      route.name as string,
                    )
                      ? 'text-accent'
                      : 'text-text-light dark:text-text-dark hover:text-accent',
                  ]"
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
                  @click.prevent="navigateTo('analytics')"
                  :class="[
                    'flex items-center gap-3 font-medium text-lg transition-colors cursor-pointer group',
                    route.name === 'analytics'
                      ? 'text-accent'
                      : 'text-text-light dark:text-text-dark hover:text-accent',
                  ]"
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
                  @click.prevent="navigateTo('exercises')"
                  :class="[
                    'flex items-center gap-3 font-medium text-lg transition-colors cursor-pointer group',
                    route.name === 'exercises'
                      ? 'text-accent'
                      : 'text-text-light dark:text-text-dark hover:text-accent',
                  ]"
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
                  @click.prevent="navigateTo('settings')"
                  :class="[
                    'flex items-center gap-3 font-medium text-lg transition-colors cursor-pointer group',
                    route.name === 'settings'
                      ? 'text-accent'
                      : 'text-text-light dark:text-text-dark hover:text-accent',
                  ]"
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
              <span
                class="text-sm font-medium text-text-light dark:text-text-dark"
                >Theme</span
              >
              <button
                @click="toggleTheme"
                class="p-2 rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus:outline-none focus:ring-2 focus:ring-accent flex items-center justify-center cursor-pointer"
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
          </DialogContent>
        </Transition>
      </DialogPortal>
    </DialogRoot>
  </header>
</template>

<style scoped>
/* Sidebar transition (slides and fades in/out) */
.sidebar-transition-enter-active,
.sidebar-transition-leave-active {
  transition:
    transform 0.25s cubic-bezier(0.16, 1, 0.3, 1),
    opacity 0.25s ease-out;
}

.sidebar-transition-enter-from,
.sidebar-transition-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

/* Overlay transition (fades in/out) */
.overlay-transition-enter-active,
.overlay-transition-leave-active {
  transition: opacity 0.25s ease-out;
}

.overlay-transition-enter-from,
.overlay-transition-leave-to {
  opacity: 0;
}
</style>
