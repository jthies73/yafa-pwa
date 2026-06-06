<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { liveQuery } from "dexie";
import { db } from "../db/db";
import type { Plan, Routine } from "../db/types";
import { createPlan, type PlanInput } from "../db/repository";
import PlanCard from "./PlanCard.vue";
import AppFab from "./AppFab.vue";
import PlanFormSheet from "./PlanFormSheet.vue";

const router = useRouter();
const plans = ref<Plan[]>([]);
const routinesMap = ref<Record<string, Routine>>({});
const showForm = ref(false);

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
  showForm.value = true;
};

const handleSavePlan = async (input: PlanInput) => {
  const id = await createPlan(input);
  showForm.value = false;
  // Jump straight into the new plan so the user can add routines.
  router.push({ name: "plan-details", params: { id } });
};
</script>

<template>
  <div class="p-6 relative min-h-full flex flex-col pb-24">
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
      class="text-sm italic text-text-light dark:text-text-dark opacity-60"
    >
      No plans yet. Create your first training plan to start organizing your
      routines.
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

    <PlanFormSheet
      v-model:open="showForm"
      :is-editing="false"
      @save="handleSavePlan"
    />
  </div>
</template>
