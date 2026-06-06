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
  if (e.key === "." && !(e.target as HTMLInputElement).value.includes("."))
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
  return n > 0 ? String(Math.round(n * 100) / 100) : "";
}
