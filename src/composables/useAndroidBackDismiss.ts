import { watch, onUnmounted, type Ref } from "vue";

// Android-specific: installed/standalone PWAs run without browser chrome, so
// the hardware/gesture back button falls through to whatever the WebView's
// session history says — with no entry to pop, it exits the app instead of
// dismissing whatever's on screen. Sheets and dialogs toggle local component
// state rather than navigating, so opening one leaves history untouched.
// This pushes a synthetic history entry while a sheet/dialog is "blocking"
// the screen and pops it back off when it stops, so the back button
// dismisses it first instead of closing the app. Desktop/iOS Safari ignore
// this (no hardware back button), so the pushState/popstate dance is inert
// there beyond one harmless extra history entry.
//
// A module-level stack (not per-instance) tracks the open order across all
// AppBottomSheet/ConfirmDialog instances at once, so with several stacked
// (e.g. a form sheet opened on top of a running workout sheet) a single back
// press only dismisses the topmost one, matching how one back press pops
// exactly one history entry.
const stack: symbol[] = [];

export function useAndroidBackDismiss(
  isBlocking: Ref<boolean>,
  onDismiss: () => void,
) {
  const id = Symbol();
  let poppedByBack = false;

  function handlePopState() {
    if (stack[stack.length - 1] !== id) return;
    poppedByBack = true;
    onDismiss();
  }

  function release() {
    window.removeEventListener("popstate", handlePopState);
    const idx = stack.lastIndexOf(id);
    if (idx !== -1) stack.splice(idx, 1);
  }

  watch(isBlocking, (blocking, wasBlocking) => {
    if (blocking) {
      stack.push(id);
      window.addEventListener("popstate", handlePopState);
      history.pushState({ androidBackDismiss: id.toString() }, "");
    } else if (wasBlocking) {
      release();
      // Only reclaim the entry ourselves when we didn't get here via the
      // back button — in that case the browser already popped it.
      if (!poppedByBack) history.back();
      poppedByBack = false;
    }
  });

  onUnmounted(release);
}
