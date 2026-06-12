import { useLengthUnit } from "./useLengthUnit";
import { useUnitField } from "./useUnitField";

// Bridges a cm-valued model to a text input shown in the user's length unit.
// The model stays cm (source of truth); see useUnitField for the mechanics.
export function useLengthField(opts: {
  getCm: () => number | null;
  setCm: (cm: number | null) => void;
  decimals?: number;
}) {
  const { unit, toDisplay, toCm } = useLengthUnit();
  const field = useUnitField({
    unit,
    toDisplay,
    toBase: toCm,
    getBase: opts.getCm,
    setBase: opts.setCm,
    decimals: opts.decimals,
  });
  return { ...field, unit };
}
