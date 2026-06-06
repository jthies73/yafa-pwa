/**
 * Feature flags, defined via VITE_FEATURE_* environment variables at build time.
 * Set these in GitHub Actions or during local builds.
 * Defaults are permissive (flags are ON unless explicitly disabled).
 */

export interface FeatureFlags {
  environment: "development" | "staging" | "production";
  seedDatabase: boolean;
  fastStartAnimation: boolean;
  showBuyMeACoffee: boolean;
}

function parseEnvBoolean(
  value: string | undefined,
  defaultValue: boolean,
): boolean {
  if (value === undefined) return defaultValue;
  return value !== "false" && value !== "0" && value !== "no";
}

export function getFeatureFlags(): FeatureFlags {
  return {
    environment: import.meta.env.MODE as
      | "development"
      | "staging"
      | "production",
    seedDatabase: parseEnvBoolean(import.meta.env.VITE_SEED_DATABASE, true),
    fastStartAnimation: parseEnvBoolean(
      import.meta.env.VITE_FAST_START_ANIMATION,
      false,
    ),
    showBuyMeACoffee: import.meta.env.VITE_SHOW_BUY_ME_A_COFFEE || false,
  };
}

// Cached instance
let _flags: FeatureFlags | null = null;

export function initializeFeatures(): FeatureFlags {
  _flags = getFeatureFlags();
  return _flags;
}

export function useFeatureFlags(): FeatureFlags {
  if (!_flags) {
    _flags = getFeatureFlags();
  }
  return _flags;
}
