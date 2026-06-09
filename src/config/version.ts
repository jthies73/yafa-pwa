import manifest from "../../public/migrations/manifest.json";

/**
 * Single source of truth for the app's data version.
 *
 * Bump this on every release that ships a data migration by updating
 * public/migrations/manifest.json.
 * Fresh installs seed their persisted data version from this constant; existing
 * installs migrate from their persisted version up to the server's latest.
 */
export const APP_VERSION = manifest.latest;
