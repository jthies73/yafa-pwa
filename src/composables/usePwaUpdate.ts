import { useRegisterSW } from "virtual:pwa-register/vue";

// Register the service worker once at import time. With registerType "prompt"
// (see vite.config.ts), a freshly deployed worker waits instead of activating,
// and `needRefresh` flips to true so the UI can offer a manual update.
const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW();

/**
 * Shared PWA update state. `needRefresh` is true when a new version is waiting;
 * calling `update()` activates it and reloads the app with the server content.
 */
export function usePwaUpdate() {
  return {
    needRefresh,
    offlineReady,
    update: () => updateServiceWorker(true),
  };
}
