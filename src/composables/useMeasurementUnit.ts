import { computed, type Ref } from "vue";
import type { MeasurementCategory } from "../db/types";
import { roundTo } from "../utils/number";
import { useWeightUnit } from "./useWeightUnit";
import { useLengthUnit } from "./useLengthUnit";
import { useUnitField } from "./useUnitField";

// Routes a measurement's category to the right display unit. WEIGHT and LENGTH
// reuse the global kg/lbs and cm/in systems (source of truth stays kg / cm);
// PERCENTAGE is unit-less and never converted. Everything here is reactive, so
// flipping a unit in Settings reformats every measurement at once.

/** Read-only formatting helpers for displaying stored (source-of-truth) values. */
export function useMeasurementFormat() {
  const weight = useWeightUnit();
  const length = useLengthUnit();

  const unitLabel = (category: MeasurementCategory): string => {
    switch (category) {
      case "WEIGHT":
        return weight.label.value;
      case "LENGTH":
        return length.label.value;
      case "PERCENTAGE":
        return "%";
    }
  };

  /** "85.2 kg" / "42 in" / "15 %" from a source-of-truth value. */
  const format = (
    value: number,
    category: MeasurementCategory,
    decimals = 1,
  ): string => {
    switch (category) {
      case "WEIGHT":
        return weight.format(value, decimals);
      case "LENGTH":
        return length.format(value, decimals);
      case "PERCENTAGE":
        return `${roundTo(value, decimals)} %`;
    }
  };

  return { format, unitLabel };
}

/**
 * Text-input bridge for a single measurement entry, mirroring useWeightField /
 * useLengthField but driven by a reactive category (the History sheet is reused
 * across measurement types). The model stays in source-of-truth units.
 */
export function useMeasurementField(opts: {
  category: Ref<MeasurementCategory>;
  getValue: () => number | null;
  setValue: (value: number | null) => void;
  decimals?: number;
}) {
  const weight = useWeightUnit();
  const length = useLengthUnit();

  const unitLabel = computed(() => {
    if (opts.category.value === "WEIGHT") return weight.label.value;
    if (opts.category.value === "LENGTH") return length.label.value;
    return "%";
  });

  const toDisplay = (base: number): number => {
    switch (opts.category.value) {
      case "WEIGHT":
        return weight.toDisplay(base);
      case "LENGTH":
        return length.toDisplay(base);
      default:
        return base;
    }
  };

  const toBase = (value: number): number => {
    switch (opts.category.value) {
      case "WEIGHT":
        return weight.toKg(value);
      case "LENGTH":
        return length.toCm(value);
      default:
        return value;
    }
  };

  const field = useUnitField({
    // Re-sync the buffer whenever the category or the active unit changes.
    unit: unitLabel,
    toDisplay,
    toBase,
    getBase: opts.getValue,
    setBase: opts.setValue,
    decimals: opts.decimals ?? 1,
  });

  return { ...field, unitLabel };
}
