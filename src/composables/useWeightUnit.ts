import { computed, ref } from "vue";
import { roundTo } from "../utils/number";

// Weight unit is a pure DISPLAY concern: kg is the single source of truth for
// every stored weight (DB, engine, prescriptions, bodyweight). This module is
// the one place that converts kg ⇄ the user's chosen unit, and it is reactive
// so switching units updates every weight in the app at once.

export type WeightUnit = "kg" | "lbs";

const STORAGE_KEY = "yafa:weightUnit";
const KG_PER_LB = 0.45359237;

const readStored = (): WeightUnit =>
  localStorage.getItem(STORAGE_KEY) === "lbs" ? "lbs" : "kg";

// Module-scoped singleton: every component shares (and reacts to) one unit.
const unit = ref<WeightUnit>(readStored());

export function useWeightUnit() {
  const setUnit = (next: WeightUnit) => {
    unit.value = next;
    localStorage.setItem(STORAGE_KEY, next);
  };

  /** kg (source of truth) → the numeric value in the active unit. */
  const toDisplay = (kg: number): number =>
    unit.value === "lbs" ? kg / KG_PER_LB : kg;

  /** A value entered in the active unit → kg for storage. */
  const toKg = (value: number): number =>
    unit.value === "lbs" ? value * KG_PER_LB : value;

  /** Rounded display number for a kg value (e.g. for prefilling an input). */
  const display = (kg: number, decimals = 1): number =>
    roundTo(toDisplay(kg), decimals);

  /** "82.5 kg" / "181.9 lbs" — value + unit label. */
  const format = (kg: number, decimals = 1): string =>
    `${display(kg, decimals)} ${unit.value}`;

  return {
    unit: computed(() => unit.value),
    label: computed(() => unit.value),
    setUnit,
    toDisplay,
    toKg,
    display,
    format,
  };
}
