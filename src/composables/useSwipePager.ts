import { ref, computed, onUnmounted, type Ref } from "vue";

export interface SwipePagerOptions {
  /** Currently visible page index (two-way). */
  page: Ref<number>;
  /** Number of pages in the pager. */
  pageCount: () => number;
  /** The element that clips the track — used to measure page width. */
  container: Ref<HTMLElement | null>;
}

/**
 * Horizontal pager gesture: lets the user swipe left/right between full-width
 * pages. Detects gesture axis first so vertical scrolling (and the bottom
 * sheet's own vertical drag) is never hijacked.
 */
export function useSwipePager(options: SwipePagerOptions) {
  const isSwiping = ref(false);
  const dragDx = ref(0); // live horizontal offset in px during a drag

  const INTENT = 8; // px of travel before we commit to an axis
  const VELOCITY = 0.4; // px/ms flick speed that forces a page change
  const DISTANCE = 0.25; // fraction of width dragged that forces a page change
  const EDGE_RESISTANCE = 0.35; // rubber-banding past the first/last page

  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastT = 0;
  let velocity = 0;
  let axis: "none" | "horizontal" | "vertical" = "none";

  function width(): number {
    return options.container.value?.offsetWidth ?? window.innerWidth;
  }

  function onSwipeStart(e: PointerEvent) {
    // Let interactive controls keep their own pointer behaviour.
    if ((e.target as HTMLElement).closest("input, textarea, select, button, a"))
      return;
    if (e.pointerType === "mouse" && e.button !== 0) return;

    pointerId = e.pointerId;
    startX = lastX = e.clientX;
    startY = e.clientY;
    lastT = e.timeStamp;
    velocity = 0;
    axis = "none";

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
  }

  function onMove(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (axis === "none") {
      if (Math.abs(dx) < INTENT && Math.abs(dy) < INTENT) return;
      axis = Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
      if (axis === "vertical") {
        // Hand the gesture back to native vertical scrolling.
        teardown();
        return;
      }
      isSwiping.value = true;
    }

    e.preventDefault();

    const max = options.pageCount() - 1;
    const atEdge =
      (options.page.value === 0 && dx > 0) ||
      (options.page.value === max && dx < 0);
    dragDx.value = atEdge ? dx * EDGE_RESISTANCE : dx;

    const dt = e.timeStamp - lastT;
    if (dt > 0) velocity = (e.clientX - lastX) / dt;
    lastX = e.clientX;
    lastT = e.timeStamp;
  }

  function onEnd() {
    if (axis === "horizontal") {
      const w = width() || 1;
      const max = options.pageCount() - 1;
      let target = options.page.value;
      if (velocity < -VELOCITY || dragDx.value < -w * DISTANCE)
        target = Math.min(max, target + 1);
      else if (velocity > VELOCITY || dragDx.value > w * DISTANCE)
        target = Math.max(0, target - 1);
      options.page.value = target;
    }
    teardown();
  }

  function teardown() {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onEnd);
    window.removeEventListener("pointercancel", onEnd);
    isSwiping.value = false;
    dragDx.value = 0;
    axis = "none";
    pointerId = null;
  }

  const trackStyle = computed(() => ({
    transform: `translateX(calc(${-options.page.value * 100}% + ${dragDx.value}px))`,
    transition: isSwiping.value ? "none" : "transform 300ms ease",
  }));

  onUnmounted(teardown);

  return { isSwiping, dragDx, onSwipeStart, trackStyle };
}
