import { ref, onUnmounted, type Ref } from 'vue';

export interface BottomSheetGesturesOptions {
  sheetEl: Ref<HTMLElement | null>;
  dragZoneEl: Ref<HTMLElement | null>;
  translateY: Ref<number>;
  minimized: Ref<boolean>;
  open: Ref<boolean>;
  minimizable: () => boolean;
}

export function useBottomSheetGestures(options: BottomSheetGesturesOptions) {
  const isDragging = ref(false);

  function getSheetHeight(): number {
    return options.sheetEl.value?.offsetHeight ?? window.innerHeight;
  }

  function getMinimizedHeight(): number {
    return options.dragZoneEl.value?.offsetHeight ?? 60;
  }

  function getDockTranslateY(): number {
    return getSheetHeight() - getMinimizedHeight();
  }

  function clampTranslateY(y: number): number {
    const max = options.minimizable() ? getDockTranslateY() : getSheetHeight();
    return Math.max(0, Math.min(max, y));
  }

  let activePointerId: number | null = null;
  let dragStartClientY = 0;
  let dragStartTranslateY = 0;
  let lastClientY = 0;
  let lastEventTime = 0;
  let releaseVelocity = 0; // px/ms, positive = downward
  let hasMoved = false;

  function onDragStart(e: PointerEvent) {
    if ((e.target as HTMLElement).closest("button, a, input, select, textarea"))
      return;
    if (e.pointerType === "mouse" && e.button !== 0) return;

    activePointerId = e.pointerId;
    isDragging.value = true;
    dragStartClientY = e.clientY;
    dragStartTranslateY = options.translateY.value;
    lastClientY = e.clientY;
    lastEventTime = Date.now();
    releaseVelocity = 0;
    hasMoved = false;

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onDragEnd);
    window.addEventListener("pointercancel", onDragEnd);
  }

  function onPointerMove(e: PointerEvent) {
    if (e.pointerId !== activePointerId) return;
    e.preventDefault();

    if (Math.abs(e.clientY - dragStartClientY) > 5) {
      hasMoved = true;
    }

    const now = Date.now();
    const dt = now - lastEventTime;
    if (dt > 0) releaseVelocity = (e.clientY - lastClientY) / dt;
    lastClientY = e.clientY;
    lastEventTime = now;
    options.translateY.value = clampTranslateY(
      dragStartTranslateY + (e.clientY - dragStartClientY)
    );
  }

  function onDragEnd() {
    isDragging.value = false;
    activePointerId = null;
    cleanupListeners();

    const dock = getDockTranslateY();
    const minH = getMinimizedHeight();
    const VELOCITY_THRESHOLD = 0.5; // px/ms

    // ── Minimizable sheet: dock / expand, never dismiss by drag ──────────────
    if (options.minimizable()) {
      if (options.minimized.value) {
        // A tap (no drag) or a deliberate upward drag re-expands the sheet.
        const draggedUp =
          !hasMoved ||
          options.translateY.value < dock - minH * 0.5 ||
          releaseVelocity < -VELOCITY_THRESHOLD;
        if (draggedUp) {
          options.minimized.value = false;
          options.translateY.value = 0;
        } else {
          options.translateY.value = dock; // settle back into the dock
        }
      } else {
        // Expanded: a downward drag past half the travel docks it.
        const draggedDown =
          options.translateY.value > dock * 0.5 ||
          releaseVelocity > VELOCITY_THRESHOLD;
        if (draggedDown) {
          options.minimized.value = true;
          options.translateY.value = dock;
        } else {
          options.translateY.value = 0; // snap back to fully open
        }
      }
      return;
    }

    // ── Regular sheet: drag down to dismiss ──────────────────────────────────
    const DISTANCE_THRESHOLD = getSheetHeight() * 0.35;
    if (
      options.translateY.value > DISTANCE_THRESHOLD ||
      releaseVelocity > VELOCITY_THRESHOLD
    ) {
      options.open.value = false;
    } else {
      options.translateY.value = 0; // snap back
    }
  }

  function cleanupListeners() {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onDragEnd);
    window.removeEventListener("pointercancel", onDragEnd);
  }

  onUnmounted(() => {
    cleanupListeners();
  });

  return {
    isDragging,
    onDragStart,
    getSheetHeight,
    getMinimizedHeight,
    getDockTranslateY,
    clampTranslateY,
  };
}
