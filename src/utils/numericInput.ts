const PASS = [
  "Backspace",
  "Delete",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Tab",
];

export function guardRepsKey(e: KeyboardEvent): void {
  if (e.ctrlKey || e.metaKey || PASS.includes(e.key) || /^\d$/.test(e.key))
    return;
  e.preventDefault();
}

export function guardWeightKey(e: KeyboardEvent): void {
  if (e.ctrlKey || e.metaKey || PASS.includes(e.key)) return;
  const input = e.target as HTMLInputElement;
  if (e.key === "." && !input.value.includes(".")) return;
  // A single leading minus — negative added weight means assistance.
  if (e.key === "-" && !input.value.includes("-") && input.selectionStart === 0)
    return;
  if (/^\d$/.test(e.key)) return;
  e.preventDefault();
}

export function sanitizeReps(val: string): string {
  const n = parseInt(val, 10);
  return n >= 1 ? String(Math.min(n, 999)) : "";
}

export function sanitizeWeight(val: string): string {
  const n = parseFloat(val);
  // 0 and negative added weights are valid (bodyweight / assisted sets).
  return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : "";
}
