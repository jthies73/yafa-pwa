export function findScrollParent(
  el: HTMLElement | null,
  fallback?: HTMLElement | null,
): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const oy = getComputedStyle(node).overflowY;
    if (
      (oy === "auto" || oy === "scroll") &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return fallback ?? null;
}
