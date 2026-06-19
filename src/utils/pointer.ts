export function shouldIgnorePointerEvent(e: PointerEvent): boolean {
  const formElements = (e.target as HTMLElement).closest(
    "input, textarea, select, button, a",
  );
  return !!(formElements || (e.pointerType === "mouse" && e.button !== 0));
}
