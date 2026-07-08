import type { Set as LoggedSet } from "../db/types";
// ----------------------------------------------
// Bodyweight lifting: the added↔total weight boundary.
//
// Sets store the ADDED weight the user put on the bar/belt; the engine's
// c1RM/e1RM space is the TOTAL load = added + bodyweightFactor × bodyweight.
// Callers "lift" logged sets into total space right before matrix/fold math
// and subtract the offset again before showing a weight to the user.
//
// Invariants (relied on across engine + analytics):
//   • Offset 0 is a strict identity — liftSets returns the SAME array, so
//     bodyweightFactor-0 exercises take exactly the pre-feature code path.
//   • Evaluation (prescribed vs actual) stays in added space on both sides;
//     never hand evaluate() lifted sets against an unlifted prescription.
//   • Lift BEFORE un-fatiguing: total = (added + offset) / fatigueScale —
//     the two transforms don't commute.
// ----------------------------------------------

/** kg the movement lifts "for free"; 0 when factor or bodyweight is unknown. */
export const bodyweightOffsetKg = (
  factor: number | undefined,
  bodyweightKg: number | null | undefined,
): number => (factor && bodyweightKg ? factor * bodyweightKg : 0);

/** A copy of the set with added→total weights, or the set itself at offset 0. */
export function liftSet(set: LoggedSet, offsetKg: number): LoggedSet {
  if (!offsetKg) return set;
  return {
    ...set,
    targetWeight: set.targetWeight + offsetKg,
    actualWeight: set.actualWeight + offsetKg,
  };
}

export function liftSets(sets: LoggedSet[], offsetKg: number): LoggedSet[] {
  if (!offsetKg) return sets;
  return sets.map((s) => liftSet(s, offsetKg));
}

/**
 * Bodyweight (kg) in effect at `ts`: the latest entry at or before it, else the
 * earliest known entry (points predating the first log reuse it), else
 * undefined when nothing was ever logged. Entries need not be pre-sorted.
 */
export function pickBodyweightAt(
  entries: { timestamp: number; value: number }[],
  ts: number,
): number | undefined {
  let before: { timestamp: number; value: number } | undefined;
  let earliest: { timestamp: number; value: number } | undefined;
  for (const e of entries) {
    if (e.timestamp <= ts && (!before || e.timestamp > before.timestamp))
      before = e;
    if (!earliest || e.timestamp < earliest.timestamp) earliest = e;
  }
  return (before ?? earliest)?.value;
}

/**
 * c1RM correction when an exercise's bodyweightFactor changes, keeping the
 * prescribed ADDED weights continuous across the edit. 0 without bodyweight
 * data — consistent with the offset contributing 0 there too.
 */
export const bodyweightShiftKg = (
  oldFactor: number,
  newFactor: number,
  bodyweightKg: number | undefined,
): number => (bodyweightKg ? (newFactor - oldFactor) * bodyweightKg : 0);
