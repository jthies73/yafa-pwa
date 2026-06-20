import { ref, watch, type WatchSource } from "vue";
import { roundTo } from "../utils/number";

// Generic bridge between a base-unit model (kg, cm, …) and a text input shown
// in the user's chosen display unit. The model stays in the base unit (the
// source of truth); the input edits a display buffer that re-syncs whenever the
// model or the unit changes — but never while the field is focused, so live
// typing (incl. trailing dots/decimals) is preserved. Conversions are injected,
// so weight and length share one implementation.
export function useUnitField(opts: {
  /** Reactive unit, used only as a re-sync trigger. */
  unit: WatchSource;
  toDisplay: (base: number) => number;
  toBase: (value: number) => number;
  getBase: () => number | null;
  setBase: (base: number | null) => void;
  decimals?: number;
}) {
  const decimals = opts.decimals ?? 2;
  const buffer = ref("");
  const editing = ref(false);

  const sync = () => {
    if (editing.value) return;
    const base = opts.getBase();
    buffer.value =
      base == null || !Number.isFinite(base)
        ? ""
        : String(roundTo(opts.toDisplay(base), decimals));
  };

  watch([opts.unit, () => opts.getBase()], sync, { immediate: true });

  const onFocus = () => {
    editing.value = true;
  };

  /** Parse the buffer and write the base unit back to the model. */
  const commit = (): number | null => {
    editing.value = false;
    const n = parseFloat(buffer.value);
    const base = Number.isFinite(n) && n > 0 ? opts.toBase(n) : null;
    opts.setBase(base);
    sync();
    return base;
  };

  return { buffer, editing, onFocus, commit };
}
