import { createRouter, createWebHistory } from "vue-router";
import Dashboard from "../components/Dashboard.vue";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      name: "dashboard",
      component: Dashboard,
    },
    {
      path: "/plans",
      name: "plans",
      component: () => import("../components/PlansPage.vue"),
    },
    {
      path: "/exercises",
      name: "exercises",
      component: () => import("../components/ExercisesPage.vue"),
    },
    {
      path: "/settings",
      name: "settings",
      component: () => import("../components/SettingsPage.vue"),
    },
  ],
});

export default router;
