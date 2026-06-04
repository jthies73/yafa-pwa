<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { liveQuery } from "dexie";
import { db } from "../db/db";
import type { Plan, Routine } from "../db/types";
import PlanCard from "./PlanCard.vue";
import AppFab from "./AppFab.vue";

const router = useRouter();
const plans = ref<Plan[]>([]);
const routinesMap = ref<Record<string, Routine>>({});

let subscription: any;

onMounted(() => {
  subscription = liveQuery(async () => {
    const p = await db.plans.toArray();
    const r = await db.routines.toArray();
    return { plans: p, routines: r };
  }).subscribe({
    next: (result) => {
      plans.value = result.plans;
      const rMap: Record<string, Routine> = {};
      for (const r of result.routines) {
        rMap[r.id] = r;
      }
      routinesMap.value = rMap;
    },
    error: (err) => console.error("Error fetching plans/routines:", err),
  });
});

onUnmounted(() => {
  if (subscription) subscription.unsubscribe();
});

const getRoutinesForPlan = (plan: Plan) => {
  return plan.routineIds.map((id) => routinesMap.value[id]).filter(Boolean);
};

const handlePlanClick = (plan: Plan) => {
  router.push({ name: "plan-details", params: { id: plan.id } });
};

const handleCreatePlan = () => {
  console.log("Create Plan FAB clicked");
};
</script>

<template>
  <div class="p-6 relative min-h-full flex flex-col animate-fade-in">
    <div class="mb-6 flex items-center justify-between">
      <h1
        class="text-3xl font-bold tracking-tight text-text-h-light dark:text-text-h-dark"
      >
        Plans
      </h1>
    </div>

    <!-- Empty State -->
    <div
      v-if="plans.length === 0"
      class="flex-grow flex flex-col items-center justify-center text-center p-8 bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark shadow-sm"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="64"
        height="64"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="text-accent mb-4 opacity-80"
      >
        <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
        <line x1="16" x2="16" y1="2" y2="6" />
        <line x1="8" x2="8" y1="2" y2="6" />
        <line x1="3" x2="21" y1="10" y2="10" />
        <path d="m9 16 2 2 4-4" />
      </svg>
      <h2
        class="text-xl font-semibold mb-2 text-text-h-light dark:text-text-h-dark"
      >
        No plans yet
      </h2>
      <p class="text-text-light dark:text-text-dark opacity-70 max-w-sm">
        Create your first training plan to start organizing your routines and
        track your progression.
      </p>
    </div>

    <!-- Plans List -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <PlanCard
        v-for="plan in plans"
        :key="plan.id"
        :plan="plan"
        :routines="getRoutinesForPlan(plan)"
        @click="handlePlanClick(plan)"
      />
    </div>

    <!-- FAB Button -->
    <AppFab label="New Plan" @click="handleCreatePlan" />
  </div>
</template>
