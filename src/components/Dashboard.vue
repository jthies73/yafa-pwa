<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";

const router = useRouter();

const today = computed(() => {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
});

const quickStats = [
  {
    label: "Active Plan",
    value: "Powerbuilding Split",
    icon: "M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z",
    colorClass: "text-accent bg-accent/10",
  },
  {
    label: "Workouts Logged",
    value: "18 sessions",
    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
    colorClass: "text-blue-500 bg-blue-500/10",
  },
  {
    label: "Workout Streak",
    value: "4 days",
    icon: "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z",
    colorClass: "text-red-500 bg-red-500/10",
  },
  {
    label: "Active Routines",
    value: "3 routines",
    icon: "M4 6h16M4 10h16M4 14h16M4 18h16",
    colorClass: "text-yellow-500 bg-yellow-500/10",
  },
];

const recentWorkouts = [
  {
    name: "Push Day A",
    plan: "Powerbuilding Split",
    date: "Yesterday",
    duration: "45m",
    status: "Completed",
  },
  {
    name: "Pull Day B",
    plan: "Powerbuilding Split",
    date: "3 days ago",
    duration: "52m",
    status: "Completed",
  },
  {
    name: "Legs Day C",
    plan: "Powerbuilding Split",
    date: "5 days ago",
    duration: "58m",
    status: "Completed",
  },
];

const navigateTo = (routeName: string) => {
  router.push({ name: routeName });
};
</script>

<template>
  <div class="p-6 relative min-h-full flex flex-col animate-fade-in gap-6">
    <!-- Welcome Header -->
    <div
      class="flex flex-col md:flex-row md:items-center md:justify-between gap-4"
    >
      <div>
        <h1
          class="text-3xl font-bold tracking-tight text-text-h-light dark:text-text-h-dark"
        >
          Dashboard
        </h1>
        <p class="text-sm text-text-light dark:text-text-dark opacity-70 mt-1">
          Welcome back! Here is your training progression overview.
        </p>
      </div>
      <div
        class="text-sm font-semibold py-1.5 px-3 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg self-start text-text-h-light dark:text-text-h-dark"
      >
        {{ today }}
      </div>
    </div>

    <!-- Quick Stats Grid -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div
        v-for="stat in quickStats"
        :key="stat.label"
        class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark p-5 rounded-xl flex items-center gap-4 shadow-sm"
      >
        <div
          class="w-12 h-12 rounded-lg flex items-center justify-center shrink-0"
          :class="stat.colorClass"
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
            <path :d="stat.icon" />
          </svg>
        </div>
        <div>
          <div
            class="text-xs text-text-light dark:text-text-dark opacity-60 uppercase tracking-wider"
          >
            {{ stat.label }}
          </div>
          <div
            class="text-lg font-bold text-text-h-light dark:text-text-h-dark mt-0.5"
          >
            {{ stat.value }}
          </div>
        </div>
      </div>
    </div>

    <!-- Main Content Section: Quick Actions & Recent Activity -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Quick Actions (Left Column) -->
      <div
        class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-6 shadow-sm flex flex-col gap-4"
      >
        <h2
          class="text-lg font-bold text-text-h-light dark:text-text-h-dark flex items-center gap-2"
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
            class="text-accent"
          >
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          Quick Actions
        </h2>

        <div class="flex flex-col gap-3">
          <button
            class="w-full bg-accent hover:bg-accent/90 text-bg-dark font-bold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 cursor-pointer transition-colors duration-150 text-sm tracking-wide uppercase"
            @click="() => console.log('Start workout clicked')"
          >
            Start Active Workout
          </button>
          <button
            class="w-full bg-black/5 dark:bg-white/5 border border-border-light dark:border-border-dark hover:bg-surface-light-hover dark:hover:bg-surface-dark-hover text-text-h-light dark:text-text-h-dark font-semibold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 cursor-pointer transition-colors duration-150 text-sm"
            @click="navigateTo('plans')"
          >
            Configure Training Plans
          </button>
          <button
            class="w-full bg-black/5 dark:bg-white/5 border border-border-light dark:border-border-dark hover:bg-surface-light-hover dark:hover:bg-surface-dark-hover text-text-h-light dark:text-text-h-dark font-semibold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 cursor-pointer transition-colors duration-150 text-sm"
            @click="navigateTo('exercises')"
          >
            Browse Exercise Library
          </button>
        </div>
      </div>

      <!-- Recent Workout History (Right Column) -->
      <div
        class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-6 shadow-sm flex flex-col gap-4 lg:col-span-2"
      >
        <h2
          class="text-lg font-bold text-text-h-light dark:text-text-h-dark flex items-center gap-2"
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
            class="text-accent"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          Recent Activity
        </h2>

        <div class="flex flex-col gap-3">
          <div
            v-for="workout in recentWorkouts"
            :key="workout.name"
            class="flex items-center justify-between p-3.5 bg-black/5 dark:bg-white/5 border border-border-light dark:border-border-dark rounded-lg"
          >
            <div class="flex items-center gap-3">
              <div
                class="w-8 h-8 rounded-full bg-green-500/10 text-green-500 flex items-center justify-center shrink-0"
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
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <div>
                <div
                  class="font-bold text-text-h-light dark:text-text-h-dark text-sm sm:text-base"
                >
                  {{ workout.name }}
                </div>
                <div
                  class="text-xs text-text-light dark:text-text-dark opacity-60"
                >
                  {{ workout.plan }} • {{ workout.duration }}
                </div>
              </div>
            </div>
            <div class="text-right">
              <div
                class="text-xs font-semibold text-text-h-light dark:text-text-h-dark"
              >
                {{ workout.status }}
              </div>
              <div
                class="text-[10px] text-text-light dark:text-text-dark opacity-50 mt-0.5"
              >
                {{ workout.date }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
