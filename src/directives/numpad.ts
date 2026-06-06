import type { Directive } from "vue";
import {
  useNumericKeypad,
  type KeypadMode,
} from "../composables/useNumericKeypad";
import { isTouchDevice } from "../utils/device";

const { register, scheduleHide } = useNumericKeypad();

interface NumpadEl extends HTMLInputElement {
  _numpadMode?: KeypadMode;
  _onFocus?: () => void;
  _onBlur?: () => void;
}

// Explicit "integer"/"decimal" wins; otherwise infer from a numeric `step`
// (whole step → integer, fractional → decimal), defaulting to decimal.
function resolveMode(el: HTMLInputElement, v: unknown): KeypadMode {
  if (v === "integer" || v === "decimal") return v;
  const step = el.getAttribute("step");
  if (step && Number(step) % 1 === 0) return "integer";
  return "decimal";
}

/**
 * v-numpad: routes a number input through the global on-screen keypad on touch
 * devices. Forces the field to plain text (so intermediate values like "0." are
 * valid) and suppresses the native virtual keyboard via inputmode="none". Pass
 * "integer"/"decimal" explicitly, or let it infer from the `step` attribute.
 */
export const vNumpad: Directive<NumpadEl, KeypadMode | undefined> = {
  mounted(el, binding) {
    if (!isTouchDevice) return;
    el._numpadMode = resolveMode(el, binding.value);
    el.type = "text";
    el.setAttribute("inputmode", "none");
    el._onFocus = () => register(el, el._numpadMode!);
    el._onBlur = () => scheduleHide(el);
    el.addEventListener("focus", el._onFocus);
    el.addEventListener("blur", el._onBlur);
  },
  updated(el, binding) {
    if (!isTouchDevice) return;
    el._numpadMode = resolveMode(el, binding.value);
  },
  beforeUnmount(el) {
    if (el._onFocus) el.removeEventListener("focus", el._onFocus);
    if (el._onBlur) el.removeEventListener("blur", el._onBlur);
    scheduleHide(el);
  },
};
