import { ref, computed, watch, onMounted, onUnmounted, type Ref } from "vue";

export interface SwipeDownToDismissOptions {
  panelEl: Ref<HTMLElement | null>;
  visible: Ref<boolean>;
  dismiss: () => void;
}

const INTENT = 6; // px of travel before a drag direction is committed
const FLICK = 0.4; // px/ms downward flick that dismisses regardless of distance

/**
 * Drag-down-to-dismiss for a bottom-anchored panel.
 *
 * The panel position is always `offset = clamp(0, height, pointerY - anchorY)`;
 * the two entry points differ only in their anchor:
 *  - handle drag → anchor is the press position, so the panel tracks the finger
 *    1:1 from where the drag began (no jump).
 *  - outside drag → anchor is the panel's top edge, so nothing moves until the
 *    finger crosses into the panel, then the edge sticks to the finger. Scroll
 *    above the panel is never blocked because we only preventDefault once that
 *    crossing engages the drag.
 */
export function useSwipeDownToDismiss({
  panelEl,
  visible,
  dismiss,
}: SwipeDownToDismissOptions) {
  const isDragging = ref(false);
  const offset = ref(0);

  let pid: number | null = null;
  let anchorY = 0;
  let topEdge = 0; // viewport Y of the panel's top when fully open
  let panelH = 240;
  let startX = 0;
  let startY = 0;
  let lastY = 0;
  let lastT = 0;
  let velocity = 0;
  let absolute = false;
  let engaged = false;
  let suppressClick = false;

  function begin(e: PointerEvent, mode: "handle" | "outside") {
    if (pid !== null || (e.pointerType === "mouse" && e.button !== 0)) return;
    pid = e.pointerId;
    startX = e.clientX;
    startY = lastY = e.clientY;
    lastT = e.timeStamp;
    velocity = 0;
    engaged = false;
    absolute = mode === "outside";
    panelH = panelEl.value?.offsetHeight || 240;
    topEdge = window.innerHeight - panelH;
    anchorY = absolute ? topEdge : e.clientY;
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
  }

  function onMove(e: PointerEvent) {
    if (e.pointerId !== pid) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!engaged) {
      // Abandon clearly horizontal gestures — leave them to the page.
      if (Math.abs(dx) > INTENT && Math.abs(dx) > Math.abs(dy)) return stop();
      // Engage on a downward handle drag, or once an outside drag crosses in.
      const ready = absolute ? e.clientY >= topEdge : dy > INTENT;
      if (!ready) return;
      engaged = true;
      isDragging.value = true;
    }

    e.preventDefault();
    offset.value = Math.max(0, Math.min(panelH, e.clientY - anchorY));

    const dt = e.timeStamp - lastT;
    if (dt > 0) velocity = (e.clientY - lastY) / dt;
    lastY = e.clientY;
    lastT = e.timeStamp;
  }

  function onEnd() {
    if (engaged) {
      suppressClick = true;
      if (velocity > FLICK || offset.value > panelH / 2) {
        // Freeze at the current position; dismiss() flips `visible`, and the
        // watcher below releases the drag so the close transition runs from
        // here instead of snapping to 0 first.
        cleanup();
        pid = null;
        dismiss();
        return;
      }
    }
    stop();
  }

  function stop() {
    cleanup();
    isDragging.value = false;
    offset.value = 0;
    engaged = false;
    pid = null;
  }

  function cleanup() {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onEnd);
    window.removeEventListener("pointercancel", onEnd);
  }

  watch(visible, (v) => {
    if (!v && isDragging.value) stop();
  });

  // A press that begins outside the panel arms the "outside" drag.
  function onDocPointerDown(e: PointerEvent) {
    if (!visible.value || panelEl.value?.contains(e.target as Node)) return;
    begin(e, "outside");
  }

  // Used by the handle: a real tap dismisses; a drag-end suppresses the click.
  const beginHandleDrag = (e: PointerEvent) => begin(e, "handle");
  const onHandleClick = () => {
    if (suppressClick) suppressClick = false;
    else dismiss();
  };

  onMounted(() => document.addEventListener("pointerdown", onDocPointerDown));
  onUnmounted(() => {
    cleanup();
    document.removeEventListener("pointerdown", onDocPointerDown);
  });

  const panelStyle = computed(() =>
    isDragging.value
      ? { transform: `translateY(${offset.value}px)`, transition: "none" }
      : {
          transform: visible.value ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.2s ease",
        },
  );

  return { isDragging, panelStyle, beginHandleDrag, onHandleClick };
}
