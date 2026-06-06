import type { Directive } from "vue";
import { isTouchDevice } from "../utils/device";

interface KeynavEl extends HTMLInputElement {
  _onKeynavKeydown?: (e: KeyboardEvent) => void;
}

// Focus the next visible, enabled [data-keynav] field in document order. The
// current field is blurred first so its keyboard (native or the custom keypad)
// is dismissed before the next field's keyboard opens — a clean handoff on
// mobile, where switching keyboard type mid-focus is otherwise unreliable.
function focusNextField(current: HTMLElement) {
  const fields = Array.from(
    document.querySelectorAll<HTMLInputElement>("[data-keynav]"),
  ).filter((n) => !n.disabled && n.getClientRects().length > 0);
  const next = fields[fields.indexOf(current as HTMLInputElement) + 1];
  current.blur();
  next?.focus();
}

/**
 * v-keynav: opt a field into ordered "Enter → next field" navigation. Listens
 * for a real Enter keydown, so it works the same whether Enter comes from the
 * native keyboard, a hardware keyboard, or the custom numeric keypad (which
 * dispatches a real keydown). A mixed text/number form can thus be filled
 * top-to-bottom with Enter and only ever submitted via its own button.
 * Touch-only — desktop keeps its native Enter behaviour.
 */
export const vKeynav: Directive<KeynavEl> = {
  mounted(el) {
    if (!isTouchDevice) return;
    el.setAttribute("data-keynav", "");
    el._onKeynavKeydown = (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      focusNextField(el);
    };
    el.addEventListener("keydown", el._onKeynavKeydown);
  },
  beforeUnmount(el) {
    if (el._onKeynavKeydown)
      el.removeEventListener("keydown", el._onKeynavKeydown);
  },
};
