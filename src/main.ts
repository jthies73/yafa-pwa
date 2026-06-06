import { createApp } from "vue";
import "./style.css";
import App from "./App.vue";
import { seedDatabase } from "./db/seed";
import router from "./router";

const ACTIVE_PAGE_KEY = "yafa:activePage";

document.addEventListener("focusin", (e) => {
  const target = e.target as HTMLElement;
  if (
    (target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement) &&
    !target.hasAttribute("data-no-select")
  ) {
    target.select();
  }
});

async function bootstrap() {
  try {
    await seedDatabase();

    // Restore last active route from localStorage.
    const savedPage = localStorage.getItem(ACTIVE_PAGE_KEY);
    if (savedPage) {
      await router.replace(savedPage).catch(() => {
        // If the saved path is no longer valid just land on dashboard.
        router.replace({ name: "dashboard" });
      });
    }

    // Persist the current route on every navigation.
    router.afterEach((to) => {
      localStorage.setItem(ACTIVE_PAGE_KEY, to.fullPath);
    });
  } catch (err) {
    console.error("YAFA: Bootstrap failed", err);
  }

  createApp(App).use(router).mount("#app");
}

bootstrap();
