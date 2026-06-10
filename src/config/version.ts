import releases from "../../public/releases.json";

/**
 * Single source of truth for the app's current codebase version.
 *
 * Bump this on every release by updating public/releases.json.
 */
export const APP_VERSION = releases.latest;
