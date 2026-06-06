import { ref, computed } from "vue";

export type KeypadMode = "integer" | "decimal";

// Module-level singleton: one on-screen keypad serves the whole app. The active
// input is tracked by element reference so key presses can be dispatched to it
// as native input/keydown events — existing v-model and Enter handlers then
// behave exactly as if the user had typed on a physical keyboard.
const activeEl = ref<HTMLInputElement | null>(null);
const mode = ref<KeypadMode>("decimal");
let hideRaf = 0;

const visible = computed(() => activeEl.value !== null);
const dotEnabled = computed(() => mode.value === "decimal");

function register(el: HTMLInputElement, m: KeypadMode) {
  if (hideRaf) {
    cancelAnimationFrame(hideRaf);
    hideRaf = 0;
  }
  activeEl.value = el;
  mode.value = m;
  // Keep the focused field clear of the keypad once it has rendered.
  requestAnimationFrame(() => el.scrollIntoView({ block: "nearest" }));
}

// Deferred so that moving focus directly from one keypad input to another
// (blur → focus) doesn't flicker the panel closed for a frame.
function scheduleHide(el: HTMLInputElement) {
  if (activeEl.value !== el) return;
  hideRaf = requestAnimationFrame(() => {
    activeEl.value = null;
    hideRaf = 0;
  });
}

type Mutator = (
  value: string,
  start: number,
  end: number,
) => { value: string; caret: number };

function editValue(el: HTMLInputElement, mutate: Mutator) {
  let start: number;
  let end: number;
  try {
    start = el.selectionStart ?? el.value.length;
    end = el.selectionEnd ?? el.value.length;
  } catch {
    start = end = el.value.length;
  }
  const next = mutate(el.value, start, end);
  el.value = next.value;
  try {
    el.setSelectionRange(next.caret, next.caret);
  } catch {
    /* selection unsupported on this input type */
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function pressDigit(d: string) {
  const el = activeEl.value;
  if (!el) return;
  editValue(el, (val, s, e) => ({
    value: val.slice(0, s) + d + val.slice(e),
    caret: s + 1,
  }));
}

function pressDot() {
  const el = activeEl.value;
  if (!el || mode.value !== "decimal") return;
  editValue(el, (val, s, e) => {
    // At most one decimal point — ignore if one already remains after the edit.
    if ((val.slice(0, s) + val.slice(e)).includes("."))
      return { value: val, caret: s };
    return { value: val.slice(0, s) + "." + val.slice(e), caret: s + 1 };
  });
}

function pressBackspace() {
  const el = activeEl.value;
  if (!el) return;
  editValue(el, (val, s, e) => {
    if (s !== e) return { value: val.slice(0, s) + val.slice(e), caret: s };
    if (s === 0) return { value: val, caret: 0 };
    return { value: val.slice(0, s - 1) + val.slice(s), caret: s - 1 };
  });
}

function pressEnter() {
  const el = activeEl.value;
  if (!el) return;
  // Replay a real Enter keydown so component handlers (set completion) and the
  // v-keynav field navigation run exactly as for a physical keyboard.
  const ev = new KeyboardEvent("keydown", {
    key: "Enter",
    code: "Enter",
    bubbles: true,
    cancelable: true,
  });
  el.dispatchEvent(ev);
  // Nothing consumed it → treat Enter as "done" and dismiss the keypad.
  if (!ev.defaultPrevented) el.blur();
}

export function useNumericKeypad() {
  return {
    visible,
    dotEnabled,
    register,
    scheduleHide,
    pressDigit,
    pressDot,
    pressBackspace,
    pressEnter,
    dismiss: () => activeEl.value?.blur(),
  };
}
