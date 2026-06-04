import { createApp } from "vue";
import "./style.css";
import App from "./App.vue";
import { seedDatabase } from "./db/seed";
import router from "./router";
import { db } from "./db/db";

async function bootstrap() {
  try {
    // Seed local database on start if empty
    await seedDatabase();

    // Load saved route state
    const appState = await db.appState.get("settings");
    if (appState && appState.activePage) {
      if (appState.activePage.startsWith("/")) {
        await router.replace(appState.activePage);
      } else if (appState.activePage === "plans") {
        await router.replace({ name: "plans" });
      } else {
        await router.replace({ name: "dashboard" });
      }
    }

    // Save active page on navigate
    router.afterEach(async (to) => {
      try {
        const state = await db.appState.get("settings");
        if (state) {
          state.activePage = to.fullPath;
          await db.appState.put(state);
        }
      } catch (err) {
        console.error("Failed to save appState", err);
      }
    });
  } catch (err) {
    console.error("YAFA: Bootstrap failed", err);
  }

  createApp(App).use(router).mount("#app");
}

bootstrap();
