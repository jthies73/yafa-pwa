// User body profile, persisted as an app preference in localStorage (the same
// place as theme/units — see db/types.ts). The engine reads bodyweight to turn
// bodyweight-loaded movements (pull-ups, dips, …) into total system load before
// any e1RM/matrix math, and back into "added weight" for display.
//   yafa:bodyweight — the lifter's bodyweight, stored in kg

export const BODYWEIGHT_KEY = "yafa:bodyweight";

/** The lifter's bodyweight in kg, or 0 when unset/invalid (⇒ no bodyweight load). */
export function getBodyweight(): number {
  const raw = Number(localStorage.getItem(BODYWEIGHT_KEY));
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

export function setBodyweight(weight: number): void {
  if (Number.isFinite(weight) && weight > 0) {
    localStorage.setItem(BODYWEIGHT_KEY, String(weight));
  } else {
    localStorage.removeItem(BODYWEIGHT_KEY);
  }
}
