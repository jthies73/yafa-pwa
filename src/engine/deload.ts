import type { DeloadState } from "../db/types";
import {
  DELOAD_DECAY_SESSIONS,
  DELOAD_E1RM_DROP,
  DELOAD_MAGNITUDE,
} from "./config";

// ----------------------------------------------
// Deload: the single decaying corrective layer a failure streak fires. Pure —
// the fold reducer owns when a deload is created/ticked; prescription reads its
// current multiplier. At most one deload is active per exercise at a time.
// ----------------------------------------------

/** Current strength of the deload: linear taper from full to zero. */
export function effectiveMagnitude(deload: DeloadState): number {
  const remaining = 1 - deload.sessionsElapsed / deload.decaySessions;
  return Math.max(0, deload.initialMagnitude * remaining);
}

export function isExpired(deload: DeloadState): boolean {
  return deload.sessionsElapsed >= deload.decaySessions;
}

/**
 * Intensity multiplier (≤ 1) the active deload applies to a prescription's RPE
 * target. 1 (no effect) when there is no deload or it has expired.
 */
export function deloadMultiplier(deload: DeloadState | null): number {
  if (!deload || isExpired(deload)) return 1;
  return 1 - effectiveMagnitude(deload);
}

/**
 * Advance a deload by one completed session, or drop it once spent. Called
 * post-session, AFTER the session consumed the current magnitude — so a freshly
 * created deload applies at full strength to the NEXT session.
 */
export function tickDeload(deload: DeloadState | null): DeloadState | null {
  if (!deload) return null;
  const next = { ...deload, sessionsElapsed: deload.sessionsElapsed + 1 };
  return isExpired(next) ? null : next;
}

/** A fresh deload at full strength, anchored to the e1RM that triggered it. */
export function freshDeload(e1rmAtTrigger: number): DeloadState {
  return {
    e1rmAtTrigger,
    initialMagnitude: DELOAD_MAGNITUDE,
    decaySessions: DELOAD_DECAY_SESSIONS,
    sessionsElapsed: 0,
  };
}

/**
 * The LASTING working-e1RM cut a deload applies. This cut — not the decaying
 * modifier — is what prevents deload oscillation on a true plateau: without it,
 * prescriptions would return to the exact loads that caused the failures and
 * immediately re-trigger. The decaying modifier only smooths the re-entry.
 */
export function deloadCutE1rm(e1rm: number): number {
  return e1rm * (1 - DELOAD_E1RM_DROP);
}
