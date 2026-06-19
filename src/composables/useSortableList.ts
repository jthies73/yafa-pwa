import { onBeforeUnmount, watch, type Ref } from "vue";
import { findScrollParent } from "../utils/dom";

export interface SortableListOptions {
  /** Called on drop with the original and target indices (only when they differ). */
  onReorder: (from: number, to: number) => void | Promise<void>;
  /** Transition duration for the "make room" shift of non-dragged rows. */
  animationMs?: number;
  /** Pointer travel (px) before a press turns into a drag (a tap stays a tap). */
  threshold?: number;
  /** Class applied to the lifted row while dragging. */
  draggingClass?: string;
  /**
   * CSS selector for a drag handle within each row. When set, a drag only starts
   * from a matching element and the container is left touch-scrollable (only the
   * handle needs `touch-action: none`, applied in markup). When omitted, the row
   * is draggable from anywhere and the whole container is made non-scrollable.
   */
  handle?: string;
  /**
   * Toggle a "collapsed" state on the rows for the duration of a drag (e.g. to
   * fold away each card's detail so only a compact header is dragged). Called
   * with `true` on press and `false` on release/cancel. When provided, the lift
   * is deferred until `collapseMs` has elapsed so the row geometry is measured
   * in its collapsed state — otherwise the cached tops/heights go stale the
   * moment the cards shrink.
   */
  onCollapse?: (collapsed: boolean) => void;
  /** Duration of the collapse animation; the lift waits this long before measuring. */
  collapseMs?: number;
  /**
   * Auto-scroll the nearest scrollable ancestor while the pointer hovers near
   * its top/bottom edge, so a row can be dragged past the visible area. On by
   * default; set to `false` to disable.
   */
  autoScroll?: boolean;
  /** Distance (px) from a scroll edge at which auto-scroll kicks in. */
  scrollEdge?: number;
  /** Maximum auto-scroll speed in px per animation frame. */
  scrollSpeed?: number;
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
  const onCollapse = options.onCollapse;
  const collapseMs = options.collapseMs ?? 150;
  const autoScroll = options.autoScroll ?? true;
  const scrollEdge = options.scrollEdge ?? 56;
  const scrollSpeed = options.scrollSpeed ?? 14;

  // --- Gesture state ---
  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let dragging = false;
  let suppressNextClick = false;

  // --- Collapse-before-lift state (only used when `onCollapse` is set) ---
  let wantsDrag = false;
  let collapseSettled = true;
  let collapseTimer: ReturnType<typeof setTimeout> | null = null;
  let lastClientY = 0;

  // --- Drag geometry, captured once at drag start ---
  let items: HTMLElement[] = [];
  let tops: number[] = [];
  let heights: number[] = [];
  let fromIndex = -1;
  let toIndex = -1;
  let draggedEl: HTMLElement | null = null;
  // The dragged row's viewport top at press time. If the rows fold away before
  // the lift (see `onCollapse`), the row shifts upward as the rows above it
  // shrink; this lets us re-anchor it under the cursor instead of leaving it
  // floating where it used to be.
  let pressElemTop = 0;
  let anchorAdjust = 0;

  // --- Auto-scroll state ---
  let scrollParent: HTMLElement | null = null;
  let startScroll = 0;
  let scrollRAF: number | null = null;

  // The page scrolls under the drag, so the captured geometry (viewport-relative
  // tops) stays valid only if we add back how far we've scrolled since the lift.
  // A "root" scroller (the document, or a body that scrolls because <html> is
  // overflow:hidden) fills the viewport, so its scroll bounds are the viewport —
  // but its scroll position is always read/written through `.scrollTop`, which
  // works for <body>, <html>, and any overflow container alike (unlike
  // `window.scrollBy`, which is a no-op when <html> itself can't scroll).
  const isRootScroller = (el: HTMLElement) =>
    el === document.scrollingElement ||
    el === document.documentElement ||
    el === document.body;

  const currentScroll = () => (scrollParent ? scrollParent.scrollTop : 0);

  const scrollBounds = () => {
    if (!scrollParent) return { top: 0, bottom: 0 };
    if (isRootScroller(scrollParent))
      return { top: 0, bottom: window.innerHeight };
    const r = scrollParent.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom };
  };

  const applyScroll = (delta: number) => {
    if (scrollParent) scrollParent.scrollTop += delta;
  };

  // px/frame, ramping up the deeper the pointer pushes into the edge zone.
  const edgeVelocity = (): number => {
    if (!autoScroll) return 0;
    const { top, bottom } = scrollBounds();
    if (lastClientY < top + scrollEdge)
      return -Math.ceil(
        ((top + scrollEdge - lastClientY) / scrollEdge) * scrollSpeed,
      );
    if (lastClientY > bottom - scrollEdge)
      return Math.ceil(
        ((lastClientY - (bottom - scrollEdge)) / scrollEdge) * scrollSpeed,
      );
    return 0;
  };

  const tickAutoScroll = () => {
    scrollRAF = null;
    if (!dragging) return;
    const v = edgeVelocity();
    if (v === 0) return;
    const before = currentScroll();
    applyScroll(v);
    if (currentScroll() === before) return; // hit the scroll boundary — stop
    track(lastClientY - startY); // re-glue the row + re-evaluate the target slot
    scrollRAF = requestAnimationFrame(tickAutoScroll);
  };

  const maybeAutoScroll = () => {
    if (scrollRAF === null && edgeVelocity() !== 0)
      scrollRAF = requestAnimationFrame(tickAutoScroll);
  };

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

    // In handle mode, only a press that lands on a handle inside this row drags.
    if (options.handle) {
      const handleEl = (e.target as Element | null)?.closest(options.handle);
      if (!handleEl || !item.contains(handleEl)) return;
    }

    fromIndex = kids.indexOf(item);
    draggedEl = item;
    pressElemTop = item.getBoundingClientRect().top; // before any collapse
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    lastClientY = e.clientY;
    dragging = false;
    wantsDrag = false;

    // Fold the rows away on press, then defer the lift until they've settled so
    // beginDrag() measures the collapsed geometry (see `onCollapse` docs).
    if (onCollapse) {
      collapseSettled = false;
      onCollapse(true);
      collapseTimer = setTimeout(() => {
        collapseTimer = null;
        collapseSettled = true;
        // The finger may already be past threshold and now held still — lift now.
        if (wantsDrag && !dragging) {
          beginDrag();
          track(lastClientY - startY);
        }
      }, collapseMs);
    } else {
      collapseSettled = true;
    }

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

    scrollParent = findScrollParent(
      container.value,
      (document.scrollingElement as HTMLElement) ?? document.documentElement,
    );
    startScroll = currentScroll();

    // How far the row drifted up while folding away — added to every translate so
    // the row jumps back under the cursor as the drag starts.
    anchorAdjust = pressElemTop - tops[fromIndex];

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
    lastClientY = e.clientY;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!dragging) {
      if (Math.hypot(dx, dy) <= threshold) return;
      wantsDrag = true;
      e.preventDefault(); // claim the gesture from native scrolling
      if (!collapseSettled) return; // hold off until the rows have folded away
      beginDrag();
    }

    e.preventDefault();
    track(dy);
    maybeAutoScroll();
  };

  const track = (dy: number) => {
    if (!dragging) return;

    // Add back the scroll travelled since the lift so the row stays glued to the
    // finger (and slot detection stays correct) even as the page auto-scrolls,
    // plus the fold-away drift so a collapsed row sits under the cursor.
    const eff = dy + (currentScroll() - startScroll) + anchorAdjust;

    // The lifted row tracks the pointer vertically.
    if (draggedEl) draggedEl.style.transform = `translateY(${eff}px)`;

    // Find which slot the dragged row's center now overlaps.
    const draggedCenter = tops[fromIndex] + heights[fromIndex] / 2 + eff;
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

    if (collapseTimer !== null) {
      clearTimeout(collapseTimer);
      collapseTimer = null;
    }
    if (scrollRAF !== null) {
      cancelAnimationFrame(scrollRAF);
      scrollRAF = null;
    }
    scrollParent = null;
    startScroll = 0;
    anchorAdjust = 0;
    // Unfold the rows back into view (covers both a real drop and a stray tap
    // on the handle that never crossed the threshold).
    if (onCollapse) onCollapse(false);
    wantsDrag = false;
    collapseSettled = true;

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
    // Without a handle, keep native touch scrolling from stealing the drag
    // gesture across the whole list (touch-action is intersected down to rows).
    // With a handle, only the handle suppresses scrolling (set in markup), so
    // the rest of the list stays scrollable.
    if (!options.handle) el.style.touchAction = "none";
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("click", onClickCapture, true);
  };
  const unbind = (el: HTMLElement | null) => {
    if (!el) return;
    if (!options.handle) el.style.touchAction = "";
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
