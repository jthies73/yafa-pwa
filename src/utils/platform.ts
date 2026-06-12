// ----------------------------------------------
// Platform detection for the PWA install guide. Pure parsing functions (UA +
// the couple of navigator bits that matter) kept separate from the globals
// they read, so the branching logic is unit-testable without a real browser.
// ----------------------------------------------

export type OS = "ios" | "android" | "desktop";

export interface PlatformInfo {
  os: OS;
  // iOS only: the page is open in a non-Safari browser (Chrome/Firefox/Edge/
  // Opera on iOS), where Add-to-Home-Screen is unavailable — drives the
  // "open in Safari" warning banner.
  isIOSNonSafari: boolean;
}

// iPadOS 13+ reports the desktop Safari UA ("Macintosh"), so a Mac UA backed by
// a touchscreen is really an iPad. This is the standard way to tell them apart.
function isIpadOS(
  ua: string,
  platform: string,
  maxTouchPoints: number,
): boolean {
  const looksLikeMac = platform === "MacIntel" || /Macintosh/i.test(ua);
  return looksLikeMac && maxTouchPoints > 1;
}

/** The operating system family, for picking which instruction set to show. */
export function detectOS(
  ua: string,
  platform: string,
  maxTouchPoints: number,
): OS {
  // Android UAs also contain "Linux", so match Android before anything else.
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua) || isIpadOS(ua, platform, maxTouchPoints))
    return "ios";
  return "desktop";
}

/**
 * Whether an iOS UA belongs to a non-Safari browser. Each iOS browser appends
 * its own token (Chrome → CriOS, Firefox → FxiOS, Edge → EdgiOS, Opera → OPiOS);
 * genuine Safari carries none of them.
 */
export function isIOSNonSafariBrowser(ua: string): boolean {
  return /crios|fxios|edgios|opios/i.test(ua);
}

/** Reads the live navigator/UA and resolves the platform for the guide. */
export function detectPlatform(): PlatformInfo {
  if (typeof navigator === "undefined") {
    return { os: "desktop", isIOSNonSafari: false };
  }
  const ua = navigator.userAgent;
  const os = detectOS(ua, navigator.platform, navigator.maxTouchPoints ?? 0);
  return {
    os,
    isIOSNonSafari: os === "ios" && isIOSNonSafariBrowser(ua),
  };
}

/**
 * Whether the app is currently running as an installed PWA. The display-mode
 * media query covers Android/desktop; iOS Safari instead exposes the legacy
 * `navigator.standalone` flag.
 */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const displayMode =
    window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  const iosStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
    true;
  return displayMode || iosStandalone;
}
