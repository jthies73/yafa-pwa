import { describe, it, expect } from "vitest";
import { detectOS, isIOSNonSafariBrowser } from "../platform";

// Representative UA strings for the platforms the install guide branches on.
const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/119.0.6045.109 Mobile/15E148 Safari/604.1",
  iphoneFirefox:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/119.0 Mobile/15E148 Safari/604.1",
  ipadOS:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36",
  desktopChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
  macDesktop:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
};

describe("detectOS", () => {
  it("detects iPhone regardless of browser", () => {
    expect(detectOS(UA.iphoneSafari, "iPhone", 5)).toBe("ios");
    expect(detectOS(UA.iphoneChrome, "iPhone", 5)).toBe("ios");
  });

  it("detects iPadOS reporting the desktop Mac UA via touch points", () => {
    expect(detectOS(UA.ipadOS, "MacIntel", 5)).toBe("ios");
  });

  it("does not mistake a real Mac (no touch) for an iPad", () => {
    expect(detectOS(UA.macDesktop, "MacIntel", 0)).toBe("desktop");
  });

  it("detects Android", () => {
    expect(detectOS(UA.androidChrome, "Linux armv8l", 5)).toBe("android");
  });

  it("falls back to desktop for everything else", () => {
    expect(detectOS(UA.desktopChrome, "Win32", 0)).toBe("desktop");
  });
});

describe("isIOSNonSafariBrowser", () => {
  it("flags iOS Chrome and Firefox", () => {
    expect(isIOSNonSafariBrowser(UA.iphoneChrome)).toBe(true);
    expect(isIOSNonSafariBrowser(UA.iphoneFirefox)).toBe(true);
  });

  it("does not flag genuine iOS Safari", () => {
    expect(isIOSNonSafariBrowser(UA.iphoneSafari)).toBe(false);
  });
});
