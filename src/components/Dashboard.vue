<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useRouter } from "vue-router";
import { liveQuery } from "dexie";
import { db } from "../db/db";
import type { Plan, Routine } from "../db/types";
import { useActiveWorkout } from "../composables/useActiveWorkout";

const router = useRouter();
const { activeWorkout, routine: activeRoutine, startWorkout, maximize } = useActiveWorkout();

const activePlan = ref<Plan | null>(null);
const planRoutines = ref<Routine[]>([]);
const loading = ref(true);
let subscription: { unsubscribe(): void } | undefined;

onMounted(() => {
  subscription = liveQuery(async () => {
    const plans = await db.plans.toArray();
    const plan = plans.find((p) => p.active) ?? null;
    if (!plan) return { plan: null, routines: [] };
    const routines = (
      await Promise.all(plan.routineIds.map((id) => db.routines.get(id)))
    ).filter((r): r is Routine => !!r);
    return { plan, routines };
  }).subscribe({
    next: (result) => {
      loading.value = false;
      activePlan.value = result.plan;
      planRoutines.value = result.routines;
    },
    error: () => {
      loading.value = false;
    },
  });
});

onUnmounted(() => {
  subscription?.unsubscribe();
  if (intervalId) clearInterval(intervalId);
});

const today = computed(() =>
  new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  }),
);

const startRoutine = (routineId: string) => {
  startWorkout(routineId);
};

const startEmptyWorkout = () => {
  startWorkout();
};

const timerString = ref("00:00");
let intervalId: any = null;

const updateTimer = () => {
  if (!activeWorkout.value) {
    timerString.value = "00:00";
    return;
  }
  const diff = Date.now() - activeWorkout.value.startTime;
  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    timerString.value = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  } else {
    timerString.value = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
};

watch(
  () => activeWorkout.value?.startTime,
  (newStartTime) => {
    if (intervalId) clearInterval(intervalId);
    if (newStartTime) {
      updateTimer();
      intervalId = setInterval(updateTimer, 1000);
    } else {
      timerString.value = "00:00";
    }
  },
  { immediate: true },
);

const recentWorkouts = [
  {
    name: "Push Day A",
    plan: "Powerbuilding Split",
    date: "Yesterday",
    duration: "45m",
  },
  {
    name: "Pull Day B",
    plan: "Powerbuilding Split",
    date: "3 days ago",
    duration: "52m",
  },
  {
    name: "Legs Day C",
    plan: "Powerbuilding Split",
    date: "5 days ago",
    duration: "58m",
  },
];
</script>

<template>
  <div class="p-6 relative min-h-full flex flex-col gap-6">
    <!-- Page header -->
    <div class="flex items-center justify-between gap-4">
      <h1
        class="text-3xl font-bold tracking-tight text-text-h-light dark:text-text-h-dark"
      >
        Dashboard
      </h1>
      <div
        class="text-sm font-semibold py-1.5 px-3 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg text-text-h-light dark:text-text-h-dark shrink-0"
      >
        {{ today }}
      </div>
    </div>

    <!-- 1) START WORKOUT — hero card -->
    <div
      class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-5 shadow-sm flex flex-col gap-4"
    >
      <div v-if="activeWorkout" class="flex flex-col gap-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 class="text-lg font-bold text-accent">
              Workout in Progress
            </h2>
            <p class="text-sm font-bold text-text-h-light dark:text-text-h-dark mt-1">
              Active Session: {{ activeRoutine?.name || "Empty Workout" }}
            </p>
            <p class="text-xs text-text-light dark:text-text-dark opacity-55 mt-0.5 font-mono">
              Running time: {{ timerString }}
            </p>
          </div>
          <span class="w-3.5 h-3.5 rounded-full bg-accent animate-pulse shrink-0 mt-1.5"></span>
        </div>
        <button
          class="w-full py-3 bg-accent hover:bg-accent/90 text-bg-dark font-bold rounded-xl cursor-pointer transition-colors duration-150 text-sm tracking-wide uppercase"
          @click="maximize"
        >
          Resume Workout
        </button>
      </div>

      <div v-else class="flex flex-col gap-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 class="text-lg font-bold text-text-h-light dark:text-text-h-dark">
              Start a Workout
            </h2>
            <p
              class="text-xs text-text-light dark:text-text-dark opacity-55 mt-0.5"
            >
              Pick a routine from your active plan or start fresh.
            </p>
          </div>
          <div
            v-if="!loading && activePlan"
            class="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-accent/15 text-accent text-xs font-bold uppercase tracking-wider shrink-0"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <circle cx="12" cy="12" r="10" />
            </svg>
            Active
          </div>
        </div>

        <!-- Active plan routines -->
        <div v-if="!loading && activePlan" class="flex flex-col gap-2">
          <p
            class="text-xs font-bold uppercase tracking-wider text-text-light dark:text-text-dark opacity-45"
          >
            {{ activePlan.name }}
          </p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              v-for="routine in planRoutines"
              :key="routine.id"
              class="flex items-center justify-between px-4 py-3 bg-black/5 dark:bg-white/5 border border-border-light dark:border-border-dark rounded-lg hover:bg-surface-light-hover dark:hover:bg-surface-dark-hover cursor-pointer transition-colors duration-150 text-left"
              @click="startRoutine(routine.id)"
            >
              <div class="min-w-0">
                <span
                  class="font-bold text-sm text-text-h-light dark:text-text-h-dark truncate block"
                >
                  {{ routine.name }}
                </span>
                <span
                  class="text-xs text-text-light dark:text-text-dark opacity-50"
                >
                  {{ routine.exercises.length }} exercise{{
                    routine.exercises.length !== 1 ? "s" : ""
                  }}
                </span>
              </div>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="text-accent shrink-0 ml-3"
              >
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </button>
            <p
              v-if="planRoutines.length === 0"
              class="text-sm italic text-text-light dark:text-text-dark opacity-50 col-span-full px-1"
            >
              No routines in this plan yet.
            </p>
          </div>
        </div>

        <!-- No active plan state -->
        <div
          v-else-if="!loading"
          class="flex items-center gap-3 px-4 py-3 bg-black/5 dark:bg-white/5 border border-border-light dark:border-border-dark rounded-lg"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="text-text-light dark:text-text-dark opacity-40 shrink-0"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p class="text-sm text-text-light dark:text-text-dark opacity-60">
            No active plan.
            <button
              class="text-accent hover:text-accent/80 cursor-pointer transition-colors duration-150 font-semibold"
              @click="router.push({ name: 'plans' })"
            >
              Set one in Plans →
            </button>
          </p>
        </div>

        <div
          v-else
          class="h-10 bg-black/5 dark:bg-white/5 rounded-lg animate-pulse"
        />

        <!-- Divider + empty workout -->
        <div class="border-t border-border-light dark:border-border-dark pt-3">
          <button
            class="w-full py-2.5 text-sm font-semibold text-text-light dark:text-text-dark border border-border-light dark:border-border-dark rounded-lg hover:bg-surface-light dark:hover:bg-surface-dark cursor-pointer transition-colors duration-150"
            @click="startEmptyWorkout"
          >
            + Empty Workout
          </button>
        </div>
      </div>
    </div>

    <!-- 2 + 3) Analytics & Active Plan nav cards -->
    <div class="grid grid-cols-2 gap-4">
      <!-- Analytics -->
      <button
        class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-4 shadow-sm flex flex-col gap-2.5 text-left hover:bg-surface-light-hover dark:hover:bg-surface-dark-hover cursor-pointer transition-colors duration-150"
        @click="router.push({ name: 'analytics' })"
      >
        <div
          class="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center"
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
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
        </div>
        <div>
          <div
            class="font-bold text-sm text-text-h-light dark:text-text-h-dark"
          >
            Analytics
          </div>
          <div
            class="text-xs text-text-light dark:text-text-dark opacity-55 mt-0.5"
          >
            Track progress
          </div>
        </div>
      </button>

      <!-- Active Plan -->
      <button
        class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-4 shadow-sm flex flex-col gap-2.5 text-left hover:bg-surface-light-hover dark:hover:bg-surface-dark-hover cursor-pointer transition-colors duration-150"
        @click="
          activePlan
            ? router.push({
                name: 'plan-details',
                params: { id: activePlan.id },
              })
            : router.push({ name: 'plans' })
        "
      >
        <div
          class="w-9 h-9 rounded-lg bg-accent/10 text-accent flex items-center justify-center"
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
            <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
            <line x1="16" x2="16" y1="2" y2="6" />
            <line x1="8" x2="8" y1="2" y2="6" />
            <line x1="3" x2="21" y1="10" y2="10" />
            <path d="m9 16 2 2 4-4" />
          </svg>
        </div>
        <div class="min-w-0">
          <div
            class="font-bold text-sm text-text-h-light dark:text-text-h-dark"
          >
            Active Plan
          </div>
          <div
            class="text-xs text-text-light dark:text-text-dark opacity-55 mt-0.5 truncate"
          >
            {{ loading ? "—" : (activePlan?.name ?? "None set") }}
          </div>
        </div>
      </button>
    </div>

    <!-- 4) Recent Workouts -->
    <div class="flex flex-col gap-3">
      <h2 class="text-base font-bold text-text-h-light dark:text-text-h-dark">
        Recent Workouts
      </h2>
      <div class="flex flex-col gap-2">
        <div
          v-for="workout in recentWorkouts"
          :key="workout.name"
          class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl px-4 py-3.5 shadow-sm flex items-center justify-between gap-3"
        >
          <div class="flex items-center gap-3 min-w-0">
            <div
              class="w-8 h-8 rounded-full bg-green-500/10 text-green-500 flex items-center justify-center shrink-0"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div class="min-w-0">
              <div
                class="font-bold text-sm text-text-h-light dark:text-text-h-dark truncate"
              >
                {{ workout.name }}
              </div>
              <div
                class="text-xs text-text-light dark:text-text-dark opacity-55 truncate"
              >
                {{ workout.plan }} · {{ workout.duration }}
              </div>
            </div>
          </div>
          <span
            class="text-xs text-text-light dark:text-text-dark opacity-40 shrink-0"
            >{{ workout.date }}</span
          >
        </div>
        <p
          class="text-xs text-text-light dark:text-text-dark opacity-35 text-center pt-1"
        >
          Real workout history coming soon.
        </p>
      </div>
    </div>
  </div>
</template>
