import { ref } from "vue";
import { APP_VERSION } from "../config/version";
import { usePwaUpdate } from "./usePwaUpdate";

export type UpdateStatus =
  "idle" | "checking" | "up-to-date" | "available" | "updating" | "error";

export interface ReleaseInfo {
  version: string;
  notes: string;
}

export interface ReleaseManifest {
  latest: string;
  releases?: ReleaseInfo[];
}

// Shared, single-instance state so the sheet reflects the same status anywhere.
const currentVersion = ref(APP_VERSION);
const latestVersion = ref<string | null>(null);
const releases = ref<ReleaseInfo[]>([]);
const status = ref<UpdateStatus>("idle");
const errorMessage = ref<string | null>(null);

/** Compare two dotted versions ("1.2.0"). Returns <0, 0, or >0. */
function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

export function useAppUpdate() {
  // Importing this keeps the service worker registered and tracks if a new SW is waiting.
  const { needRefresh, update: applyCodeUpdate } = usePwaUpdate();

  async function check(): Promise<void> {
    if (status.value === "updating") return;
    status.value = "checking";
    errorMessage.value = null;
    try {
      const res = await fetch(`/releases.json`, { cache: "no-store" });
      if (!res.ok)
        throw new Error(`Could not load releases (HTTP ${res.status})`);

      const data = (await res.json()) as ReleaseManifest;
      latestVersion.value = data.latest;
      releases.value = (data.releases ?? []).filter(
        (r) => compareVersions(r.version, currentVersion.value) > 0,
      );

      const isNewer = compareVersions(data.latest, currentVersion.value) > 0;

      // An update is available if the server manifest is newer OR if the service worker has already downloaded a new bundle.
      status.value = isNewer || needRefresh.value ? "available" : "up-to-date";
    } catch (err) {
      errorMessage.value = (err as Error).message;
      status.value = "error";
    }
  }

  async function runUpdate(): Promise<void> {
    if (status.value === "updating") return;
    status.value = "updating";
    errorMessage.value = null;
    try {
      // If the service worker hasn't downloaded the update yet, force it to.
      if (!needRefresh.value && "serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          await reg.update();
          // Poll until the service worker finishes downloading and goes into the waiting state.
          let attempts = 0;
          while (!needRefresh.value && attempts < 40) {
            await new Promise((resolve) => setTimeout(resolve, 250));
            attempts++;
          }
        }
      }

      // Activating the new service worker automatically reloads the page.
      if (needRefresh.value) {
        await applyCodeUpdate();
      } else if (!("serviceWorker" in navigator)) {
        // Dev mode: no SW support, a hard reload is the only option.
        location.reload();
      } else {
        status.value = "error";
        errorMessage.value = "Update not detected. Please try again later.";
      }
    } catch (err) {
      errorMessage.value = (err as Error).message;
      status.value = "error";
    }
  }

  return {
    currentVersion,
    latestVersion,
    releases,
    status,
    errorMessage,
    check,
    runUpdate,
  };
}
