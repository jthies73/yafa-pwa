import { computed, ref } from "vue";
import { roundTo } from "../utils/number";

// Length unit is a pure DISPLAY concern: centimeters are the single source of
// truth for every stored length/height. This module is the one place that
// converts cm ⇄ the user's chosen unit, reactively, so switching units updates
// every length in the app at once. Mirrors useWeightUnit.

export type LengthUnit = "cm" | "in";

const STORAGE_KEY = "yafa:lengthUnit";
const CM_PER_IN = 2.54;

const readStored = (): LengthUnit =>
  localStorage.getItem(STORAGE_KEY) === "in" ? "in" : "cm";

// Module-scoped singleton: every component shares (and reacts to) one unit.
const unit = ref<LengthUnit>(readStored());

export function useLengthUnit() {
  const setUnit = (next: LengthUnit) => {
    unit.value = next;
    localStorage.setItem(STORAGE_KEY, next);
  };

  /** cm (source of truth) → the numeric value in the active unit. */
  const toDisplay = (cm: number): number =>
    unit.value === "in" ? cm / CM_PER_IN : cm;

  /** A value entered in the active unit → cm for storage. */
  const toCm = (value: number): number =>
    unit.value === "in" ? value * CM_PER_IN : value;

  /** Rounded display number for a cm value (e.g. for prefilling an input). */
  const display = (cm: number, decimals = 1): number =>
    roundTo(toDisplay(cm), decimals);

  /** "180 cm" / "70.9 in" — value + unit label. */
  const format = (cm: number, decimals = 1): string =>
    `${display(cm, decimals)} ${unit.value}`;

  return {
    unit: computed(() => unit.value),
    label: computed(() => unit.value),
    setUnit,
    toDisplay,
    toCm,
    display,
    format,
  };
}
