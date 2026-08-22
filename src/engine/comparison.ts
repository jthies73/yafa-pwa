import { PRESCRIBED_WEIGHT_TOLERANCE_KG } from "./constants";

// ----------------------------------------------
// The shared prescribed-vs-actual comparison. The single source of truth for
// whether a logged set was loaded "at the prescription" — the regression rules
// and the in-session adjustment both judge it through here, so they can never
// disagree. This is the only module that consumes
// PRESCRIBED_WEIGHT_TOLERANCE_KG.
// ----------------------------------------------

/** True when actual is within ±PRESCRIBED_WEIGHT_TOLERANCE_KG of target — "at prescribed". */
export const weightMatches = (actual: number, target: number): boolean =>
  Math.abs(actual - target) <= PRESCRIBED_WEIGHT_TOLERANCE_KG;
