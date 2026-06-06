import { ref, computed, onUnmounted, type Ref } from "vue";

export interface SwipePagerOptions {
  page: Ref<number>;
  pageCount: () => number;
  container: Ref<HTMLElement | null>;
}

export function useSwipePager({
  page,
  pageCount,
  container,
}: SwipePagerOptions) {
  const isSwiping = ref(false);
  const dragDx = ref(0);

  const INTENT = 8;
  const VELOCITY = 0.4;
  const DISTANCE = 0.25;
  const EDGE_RESISTANCE = 0.35;

  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastT = 0;
  let velocity = 0;
  let axis: "none" | "horizontal" | "vertical" = "none";

  const width = () => container.value?.offsetWidth ?? window.innerWidth;

  function onSwipeStart(e: PointerEvent) {
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
        teardown();
        return;
      }
      isSwiping.value = true;
    }

    e.preventDefault();
    const max = pageCount() - 1;
    const atEdge =
      (page.value === 0 && dx > 0) || (page.value === max && dx < 0);
    dragDx.value = atEdge ? dx * EDGE_RESISTANCE : dx;

    const dt = e.timeStamp - lastT;
    if (dt > 0) velocity = (e.clientX - lastX) / dt;
    lastX = e.clientX;
    lastT = e.timeStamp;
  }

  function onEnd() {
    if (axis === "horizontal") {
      const w = width() || 1;
      const max = pageCount() - 1;
      let target = page.value;
      if (velocity < -VELOCITY || dragDx.value < -w * DISTANCE)
        target = Math.min(max, target + 1);
      else if (velocity > VELOCITY || dragDx.value > w * DISTANCE)
        target = Math.max(0, target - 1);
      page.value = target;
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
    transform: `translateX(calc(${-page.value * 100}% + ${dragDx.value}px))`,
    transition: isSwiping.value ? "none" : "transform 300ms ease",
  }));

  onUnmounted(teardown);

  return { onSwipeStart, trackStyle };
}
