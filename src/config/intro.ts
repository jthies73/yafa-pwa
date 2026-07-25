// Device-only "has the user seen the first-open intro sheet" flag.
// Deliberately NOT added to PORTABLE_SETTING_KEYS (settings.ts) — this must
// never travel in an export/import backup, same reasoning as
// yafa:dismissedInstallBanner.

export const INTRO_SEEN_KEY = "yafa:hasSeenIntro";

export function hasSeenIntro(store: Pick<Storage, "getItem">): boolean {
  return store.getItem(INTRO_SEEN_KEY) === "true";
}

export function markIntroSeen(store: Pick<Storage, "setItem">): void {
  store.setItem(INTRO_SEEN_KEY, "true");
}
