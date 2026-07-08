import type { RpeMatrix } from "../db/types";
import { weightMatches } from "./comparison";
import { impliedE1rm, roundToLoadable, weightFromE1rm } from "./matrix";

// ----------------------------------------------
// In-session re-prescription. From a logged set's demonstrated effort (its implied
// e1RM via the matrix) re-anchor a remaining set to the weight that should hit its
// target reps at its target RPE. Two jobs, one piece of math:
//   • Cold start — the prescribed weight is null until a c1RM exists, so the FIRST
//     logged set GOVERNS: its e1RM fills the remaining sets' weights (any positive
//     derived weight is the fill; there is nothing to compare it to).
//   • Established target — a logged set that diverges from plan (harder OR easier)
//     proposes moving the remaining load DOWN or UP to match today's capacity.
// Deviations inside the tolerance band surface nothing (no noise).
//
// Pipeline stage: execution → in-session re-prescription. The tracker applies the
// proposal by rewriting the pending set's target (no new data structure); the set
// that triggered this was logged at its ORIGINAL target and still drives the
// post-workout worst-set evaluation, so a re-prescription can't mask a regression.
//
// This NEVER touches the c1RM — it is a today-only guardrail. The c1RM's own
// correction from a divergent demonstrated capacity is the post-session catch-up
// (see state.ts), not this.
// ----------------------------------------------

export interface SetAdjustment {
  reps: number;
  weight: number;
  rpe: number | null;
}

export function proposeSetAdjustment(
  matrix: RpeMatrix,
  prev: { weight: number; reps: number; rpe: number },
  target: { reps: number; rpe: number | null; weight: number | null },
  // bodyweightFactor × bodyweight (kg): prev.weight and the proposed weight are
  // ADDED weights; the matrix math in between runs on the TOTAL load.
  bodyweightOffsetKg = 0,
): SetAdjustment | null {
  // Need a target effort (reps + RPE) to re-anchor against. Back-off sets carry a
  // null RPE — their load is a consequence of the top set, not a target — so they
  // are left alone.
  if (target.rpe == null) return null;
  // Defensive: the tracker pre-guards, but never trust raw inputs. Weight gates
  // test the TOTAL load — a 0-added bodyweight set is a valid demonstration.
  if (
    !(prev.reps >= 1) ||
    !(prev.weight + bodyweightOffsetKg > 0) ||
    Number.isNaN(prev.rpe)
  ) {
    return null;
  }

  const demoE1rm = impliedE1rm(
    matrix,
    prev.weight + bodyweightOffsetKg,
    prev.reps,
    prev.rpe,
  );
  const newWeight = roundToLoadable(
    weightFromE1rm(matrix, demoE1rm, target.reps, target.rpe) -
      bodyweightOffsetKg,
  );
  if (!(newWeight + bodyweightOffsetKg > 0)) return null;

  // Cold start: no prescribed weight yet, so the governing set's derived weight is
  // the fill outright (no comparison band applies).
  if (target.weight == null) {
    return { reps: target.reps, weight: newWeight, rpe: target.rpe };
  }

  // Established target: surface a proposal in EITHER direction, but only when it
  // differs meaningfully — trivial deviations within the tolerance band are noise.
  if (weightMatches(newWeight, target.weight)) {
    return null;
  }
  return { reps: target.reps, weight: newWeight, rpe: target.rpe };
}
