import { useWeightUnit } from "./useWeightUnit";
import { useUnitField } from "./useUnitField";

// Bridges a kg-valued model to a text input shown in the user's weight unit.
// The model stays kg (source of truth); see useUnitField for the mechanics.
// Weight fields hold ADDED weights, where 0 (plain bodyweight) and negatives
// (assistance) are meaningful — hence allowNegative.
export function useWeightField(opts: {
  getKg: () => number | null;
  setKg: (kg: number | null) => void;
  decimals?: number;
}) {
  const { unit, toDisplay, toKg } = useWeightUnit();
  const field = useUnitField({
    unit,
    toDisplay,
    toBase: toKg,
    getBase: opts.getKg,
    setBase: opts.setKg,
    decimals: opts.decimals,
    allowNegative: true,
  });
  return { ...field, unit };
}
