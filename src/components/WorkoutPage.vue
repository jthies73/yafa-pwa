<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { liveQuery } from "dexie";
import { db } from "../db/db";
import type { Routine } from "../db/types";

const router = useRouter();
const route = useRoute();

const routineId = computed(() => route.query.routineId as string | undefined);
const routine = ref<Routine | null>(null);
const loading = ref(true);
let subscription: any;

onMounted(() => {
  if (!routineId.value) {
    loading.value = false;
    return;
  }
  subscription = liveQuery(() => db.routines.get(routineId.value!)).subscribe({
    next: (r) => {
      loading.value = false;
      routine.value = r ?? null;
    },
    error: () => {
      loading.value = false;
    },
  });
});

onUnmounted(() => subscription?.unsubscribe());

const sessionLabel = computed(() =>
  routine.value ? routine.value.name : "Empty Workout",
);

const handleFinish = () => {
  console.log("Workout finished:", {
    routineId: routineId.value ?? null,
    routineName: sessionLabel.value,
    timestamp: new Date().toISOString(),
  });
  router.back();
};

const handleDiscard = () => {
  console.log("Workout discarded");
  router.back();
};
</script>

<template>
  <div class="p-6 relative min-h-full flex flex-col gap-6">
    <!-- Header -->
    <div class="flex items-start justify-between gap-4">
      <div class="flex-grow min-w-0">
        <p class="text-xs font-semibold uppercase tracking-wider text-text-light dark:text-text-dark opacity-50 mb-0.5">
          Active Session
        </p>
        <h1 class="text-3xl font-bold tracking-tight text-text-h-light dark:text-text-h-dark">
          {{ loading ? "Loading..." : sessionLabel }}
        </h1>
      </div>
      <button
        class="px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-red-500/10 text-red-500 hover:bg-red-500/20 dark:bg-red-500/15 dark:text-red-400 dark:hover:bg-red-500/25 transition-colors duration-150 cursor-pointer shrink-0 mt-1"
        @click="handleDiscard"
      >
        Discard
      </button>
    </div>

    <!-- Exercise list placeholder -->
    <div v-if="!loading" class="flex flex-col gap-3">
      <div
        v-if="routine && routine.exercises.length > 0"
        v-for="(ex, idx) in routine.exercises"
        :key="ex.exerciseId + idx"
        class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-4 shadow-sm flex items-center justify-between gap-3"
      >
        <div>
          <span class="text-xs text-text-light dark:text-text-dark opacity-40 mr-2">{{ idx + 1 }}.</span>
          <span class="font-bold text-text-h-light dark:text-text-h-dark text-sm">Exercise</span>
        </div>
        <span class="text-xs text-text-light dark:text-text-dark opacity-40 font-mono">— sets coming soon</span>
      </div>

      <div
        v-else
        class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-10 shadow-sm flex flex-col items-center justify-center text-center gap-2"
      >
        <p class="text-sm text-text-light dark:text-text-dark opacity-50">
          {{ routine ? "No exercises configured for this routine." : "Log your exercises freely." }}
        </p>
        <p class="text-xs text-text-light dark:text-text-dark opacity-30">
          Exercise logging coming soon.
        </p>
      </div>
    </div>

    <!-- Finish button -->
    <div class="mt-auto pt-4">
      <button
        class="w-full py-3.5 bg-accent hover:bg-accent/90 text-bg-dark font-bold rounded-xl cursor-pointer transition-colors duration-150 text-sm tracking-wide uppercase"
        @click="handleFinish"
      >
        Finish Workout
      </button>
    </div>
  </div>
</template>
