import { onBeforeUnmount, watch, type Ref } from "vue";

export interface SortableListOptions {
  /** Called on drop with the original and target indices (only when they differ). */
  onReorder: (from: number, to: number) => void | Promise<void>;
  /** Transition duration for the "make room" shift of non-dragged rows. */
  animationMs?: number;
  /** Pointer travel (px) before a press turns into a drag (a tap stays a tap). */
  threshold?: number;
  /** Class applied to the lifted row while dragging. */
  draggingClass?: string;
}

/**
 * Pointer-based drag-to-reorder for a list of direct child elements.
 *
 * Works on both touch and mouse without any third-party dependency. Visual
 * feedback during the drag is done purely with CSS transforms (the lifted row
 * follows the pointer, the others slide to open a gap); the DOM is never
 * mutated directly, so it never fights Vue's reconciliation. On drop we report
 * `(from, to)` and let the caller reorder its reactive data — keeping this
 * composable generic and the data flow one-directional.
 *
 * For touch, `touch-action: none` is set on the container so a drag is never
 * stolen by native scrolling; the drag is committed only after the pointer
 * travels past `threshold`, so a tap still falls through to a click.
 */
export function useSortableList(
  container: Ref<HTMLElement | null>,
  options: SortableListOptions,
) {
  const animationMs = options.animationMs ?? 150;
  const threshold = options.threshold ?? 8;
  const draggingClass = options.draggingClass ?? "";

  // --- Gesture state ---
  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let dragging = false;
  let suppressNextClick = false;

  // --- Drag geometry, captured once at drag start ---
  let items: HTMLElement[] = [];
  let tops: number[] = [];
  let heights: number[] = [];
  let fromIndex = -1;
  let toIndex = -1;
  let draggedEl: HTMLElement | null = null;

  const children = (): HTMLElement[] =>
    container.value
      ? (Array.from(container.value.children) as HTMLElement[])
      : [];

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const kids = children();
    const item = kids.find(
      (c) => c === e.target || c.contains(e.target as Node),
    );
    if (!item) return;

    fromIndex = kids.indexOf(item);
    draggedEl = item;
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    dragging = false;

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  };

  const beginDrag = () => {
    dragging = true;

    items = children();
    const rects = items.map((c) => c.getBoundingClientRect());
    tops = rects.map((r) => r.top);
    heights = rects.map((r) => r.height);
    toIndex = fromIndex;

    if (draggedEl) {
      draggedEl.style.position = "relative";
      draggedEl.style.zIndex = "20";
      draggedEl.style.willChange = "transform";
      draggedEl.style.opacity = "0.85";
      if (draggingClass) draggedEl.classList.add(draggingClass);
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!dragging) {
      if (Math.hypot(dx, dy) <= threshold) return;
      beginDrag();
    }

    e.preventDefault();

    // The lifted row tracks the pointer vertically.
    if (draggedEl) draggedEl.style.transform = `translateY(${dy}px)`;

    // Find which slot the dragged row's center now overlaps.
    const draggedCenter = tops[fromIndex] + heights[fromIndex] / 2 + dy;
    let to = fromIndex;
    for (let i = 0; i < items.length; i++) {
      if (i === fromIndex) continue;
      const center = tops[i] + heights[i] / 2;
      if (i < fromIndex && draggedCenter < center) to = Math.min(to, i);
      else if (i > fromIndex && draggedCenter > center) to = Math.max(to, i);
    }
    if (to !== toIndex) {
      toIndex = to;
      applyShift();
    }
  };

  const applyShift = () => {
    const h = heights[fromIndex];
    for (let i = 0; i < items.length; i++) {
      if (i === fromIndex) continue;
      let shift = 0;
      if (toIndex > fromIndex && i > fromIndex && i <= toIndex) shift = -h;
      else if (toIndex < fromIndex && i < fromIndex && i >= toIndex) shift = h;
      items[i].style.transition = `transform ${animationMs}ms ease`;
      items[i].style.transform = shift ? `translateY(${shift}px)` : "";
    }
  };

  const onPointerUp = () => {
    const didDrag = dragging;
    const from = fromIndex;
    const to = toIndex;
    reset();
    if (didDrag) {
      // Swallow the synthetic click that fires after releasing a drag.
      suppressNextClick = true;
      if (to !== -1 && to !== from) {
        Promise.resolve(options.onReorder(from, to));
      }
    }
  };

  const reset = () => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);

    for (const el of items) {
      el.style.transform = "";
      el.style.transition = "";
    }
    if (draggedEl) {
      draggedEl.style.position = "";
      draggedEl.style.zIndex = "";
      draggedEl.style.willChange = "";
      draggedEl.style.opacity = "";
      if (draggingClass) draggedEl.classList.remove(draggingClass);
    }

    items = [];
    tops = [];
    heights = [];
    draggedEl = null;
    pointerId = null;
    dragging = false;
    fromIndex = -1;
    toIndex = -1;
  };

  const onClickCapture = (e: MouseEvent) => {
    if (suppressNextClick) {
      suppressNextClick = false;
      e.stopPropagation();
      e.preventDefault();
    }
  };

  const bind = (el: HTMLElement | null) => {
    if (!el) return;
    // Keep native touch scrolling from stealing the drag gesture. Applies to
    // child rows too (touch-action is intersected down the ancestor chain).
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("click", onClickCapture, true);
  };
  const unbind = (el: HTMLElement | null) => {
    if (!el) return;
    el.style.touchAction = "";
    el.removeEventListener("pointerdown", onPointerDown);
    el.removeEventListener("click", onClickCapture, true);
  };

  const stopWatch = watch(
    container,
    (el, prev) => {
      unbind(prev ?? null);
      bind(el);
    },
    { immediate: true, flush: "post" },
  );

  onBeforeUnmount(() => {
    stopWatch();
    unbind(container.value);
    reset();
  });
}
