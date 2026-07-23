import { describe, it, expect, vi, afterEach } from "vitest";
import { nextTick, ref } from "vue";
import { useAndroidBackDismiss } from "../useAndroidBackDismiss";

// history.back() is queued as an async task in jsdom (unlike pushState,
// which is synchronous), so asserting on real history.length after a back()
// call is flaky and can hang a cleanup loop waiting for it to settle. Spying
// on the calls instead keeps these tests synchronous and deterministic.
function pressBack() {
  window.dispatchEvent(new PopStateEvent("popstate"));
}

describe("useAndroidBackDismiss", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("dismisses on back button without reclaiming the history entry itself", async () => {
    const pushSpy = vi.spyOn(window.history, "pushState");
    const backSpy = vi
      .spyOn(window.history, "back")
      .mockImplementation(() => {});

    const open = ref(false);
    let dismissed = 0;
    useAndroidBackDismiss(open, () => {
      dismissed++;
      open.value = false;
    });

    open.value = true;
    await nextTick();
    expect(pushSpy).toHaveBeenCalledTimes(1);

    pressBack();
    await nextTick();

    expect(dismissed).toBe(1);
    expect(open.value).toBe(false);
    // The browser already popped the entry via the back button — we must
    // not call history.back() ourselves on top of that.
    expect(backSpy).not.toHaveBeenCalled();
  });

  it("pops its own history entry when closed without the back button", async () => {
    const pushSpy = vi.spyOn(window.history, "pushState");
    const backSpy = vi
      .spyOn(window.history, "back")
      .mockImplementation(() => {});

    const open = ref(false);
    useAndroidBackDismiss(open, () => {
      open.value = false;
    });

    open.value = true;
    await nextTick();
    expect(pushSpy).toHaveBeenCalledTimes(1);

    open.value = false;
    await nextTick();
    expect(backSpy).toHaveBeenCalledTimes(1);
  });

  it("only dismisses the topmost of two stacked sheets on a single back press", async () => {
    vi.spyOn(window.history, "pushState");
    vi.spyOn(window.history, "back").mockImplementation(() => {});

    const outer = ref(false);
    const inner = ref(false);
    let outerDismissed = 0;
    let innerDismissed = 0;

    useAndroidBackDismiss(outer, () => {
      outerDismissed++;
      outer.value = false;
    });
    useAndroidBackDismiss(inner, () => {
      innerDismissed++;
      inner.value = false;
    });

    outer.value = true;
    await nextTick();
    inner.value = true;
    await nextTick();

    pressBack();
    await nextTick();

    expect(innerDismissed).toBe(1);
    expect(outerDismissed).toBe(0);
    expect(inner.value).toBe(false);
    expect(outer.value).toBe(true);

    pressBack();
    await nextTick();

    expect(outerDismissed).toBe(1);
    expect(outer.value).toBe(false);
  });
});
