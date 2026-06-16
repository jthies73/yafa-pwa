import type {
  DoubleProgressionParams,
  LinearProgressionParams,
  ProgressionState,
  RpeMatrix,
  Set as LoggedSet,
  TopSetProgressionParams,
} from "../db/types";
import {
  DOUBLE_FAILURE_RESET_TRIGGER,
  LEARN_BLEND,
  LP_FAILURE_RESET_TRIGGER,
  QUALIFYING_MAX_REPS,
  RECALIBRATION_BLEND,
  RECALIBRATION_DIVERGENCE_THRESHOLD,
  TOP_SET_FAILURE_RESET_TRIGGER,
  TREND_WINDOW,
} from "./config";
import { impliedE1rm, peakImpliedE1rm } from "./matrix";
import { deloadCutE1rm, freshDeload, tickDeload } from "./deload";
import { evaluateDouble, evaluateLinear, evaluateTopSet } from "./progression";
import type { ExerciseSession } from "./sessions";

// ----------------------------------------------
// The single coherent state reducer. An exercise's engine state is the result
// of folding its logged sessions (oldest-first) through stepSession — there is
// no other writer of `e1rm`, `failureStreak`, `currentTargetReps`, `trend` or
// `deload`. Because state is a pure function of (sessions, matrix, confirmed
// recalibrations), it can never drift: a full re-fold always reproduces it, and
// editing a past workout is just folding the edited history.
//
// stepSession's ordered steps (this order is the contract):
//   0. tick the active deload (so a deload fired below starts fresh next session)
//   1. compute the e1RM the session DEMONSTRATED (fixed matrix, qualifying sets)
//   2. cold start → seed the scalar and return (calibration only, never judged)
//   3. passively blend the scalar toward the demonstrated trend for SMALL drift;
//      surface a proposal (don't auto-snap) for LARGE drift
//   4. apply the model's deliberate move (increment on success / deload on streak)
//   5. a user-confirmed recalibration, if any, has the final say on the scalar
// ----------------------------------------------

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** A pristine, unseeded checkpoint (no sessions folded yet). */
export function freshState(exerciseId: string): ProgressionState {
  return {
    exerciseId,
    e1rm: null,
    trend: [],
    failureStreak: 0,
    deload: null,
    lastWorkoutId: null,
    contentHash: "",
    updated_at: 0,
  };
}

/**
 * Cold-start seed for the working e1RM from the first logged session: the
 * heaviest honest set (reps on the grid, RPE supplied) is the best single
 * estimate of current capacity, so take the max implied e1RM rather than an
 * average that easy warm-up sets would drag down.
 */
export function seedE1rm(matrix: RpeMatrix, sets: LoggedSet[]): number | null {
  const candidates = sets.filter(
    (s) =>
      s.actualWeight > 0 &&
      s.actualReps >= 1 &&
      s.actualReps <= QUALIFYING_MAX_REPS &&
      s.actualRpe !== undefined,
  );
  if (!candidates.length) return null;
  const best = Math.max(
    ...candidates.map((s) =>
      impliedE1rm(matrix, s.actualWeight, s.actualReps, s.actualRpe!),
    ),
  );
  return round1(best);
}

/** Mean of the rolling demonstrated-e1RM window; null while empty. */
export function smoothedTrend(trend: number[]): number | null {
  if (!trend.length) return null;
  return trend.reduce((sum, v) => sum + v, 0) / trend.length;
}

/**
 * The recalibration target when a session's demonstrated e1RM has drifted far
 * from the working e1RM, or null when none is warranted (no scalar yet, or
 * within tolerance). Moves RECALIBRATION_BLEND of the way toward demonstrated —
 * short of a full snap so one outlier session can't fully rewrite the baseline.
 */
export function proposeRecalibrationE1rm(
  currentE1rm: number | null,
  sessionPeakE1rm: number | null,
): number | null {
  if (currentE1rm === null || currentE1rm <= 0 || sessionPeakE1rm === null) {
    return null;
  }
  const divergence = sessionPeakE1rm / currentE1rm - 1;
  if (Math.abs(divergence) < RECALIBRATION_DIVERGENCE_THRESHOLD) return null;
  return round1(
    currentE1rm + RECALIBRATION_BLEND * (sessionPeakE1rm - currentE1rm),
  );
}

function failureTrigger(model: string): number {
  switch (model) {
    case "topset_backoff":
      return TOP_SET_FAILURE_RESET_TRIGGER;
    case "double":
      return DOUBLE_FAILURE_RESET_TRIGGER;
    default:
      return LP_FAILURE_RESET_TRIGGER;
  }
}

const capTrend = (trend: number[]): number[] =>
  trend.length > TREND_WINDOW
    ? trend.slice(trend.length - TREND_WINDOW)
    : trend;

/** Fire a deload: lasting e1RM cut + a fresh decaying modifier, streak cleared. */
function applyDeload(state: ProgressionState): void {
  const trigger = state.e1rm ?? 0;
  state.deload = freshDeload(trigger);
  state.e1rm = round1(deloadCutE1rm(trigger));
  state.failureStreak = 0;
}

/** The drift a session surfaced for user confirmation (engine/service decorates it). */
export interface SessionRecalibration {
  from: number; // working e1RM the session was prescribed from
  demonstrated: number; // peak honest e1RM the session demonstrated
  to: number; // where a confirmed recalibration moves the scalar
}

export interface StepResult {
  state: ProgressionState;
  recalibration: SessionRecalibration | null;
}

export interface StepContext {
  matrix: RpeMatrix;
  confirmedByWorkout: Map<string, number>; // workoutId → confirmed e1RM snap
}

/** Fold one session into the state. Pure — returns a new state object. */
export function stepSession(
  state: ProgressionState,
  session: ExerciseSession,
  ctx: StepContext,
): StepResult {
  const next: ProgressionState = {
    ...state,
    trend: [...state.trend],
    deload: tickDeload(state.deload), // step 0
  };
  next.lastWorkoutId = session.workoutId;
  next.updated_at = session.at;

  const sets = session.sets;
  if (!sets.length) return { state: next, recalibration: null };

  const confirmed = ctx.confirmedByWorkout.get(session.workoutId);

  // Step 1: the e1RM this session demonstrated (fixed matrix, qualifying sets).
  const peak = peakImpliedE1rm(ctx.matrix, sets);
  const demonstrated = peak ? round1(peak.e1rm) : null;

  // Step 2: cold start — seed only, never judged against targets it wasn't
  // prescribed from.
  if (next.e1rm === null) {
    next.e1rm = seedE1rm(ctx.matrix, sets);
    if (next.e1rm !== null) next.trend = capTrend([...next.trend, next.e1rm]);
    return { state: next, recalibration: null };
  }

  const e0 = next.e1rm; // scalar the session was prescribed from

  // Step 3: fold demonstrated reality in — small drift passively, large drift
  // surfaced for confirmation (never auto-snapped).
  let recalibration: SessionRecalibration | null = null;
  let blended = e0;
  if (demonstrated !== null) {
    next.trend = capTrend([...next.trend, demonstrated]);
    const divergence = demonstrated / e0 - 1;
    if (Math.abs(divergence) >= RECALIBRATION_DIVERGENCE_THRESHOLD) {
      if (confirmed === undefined) {
        const to = proposeRecalibrationE1rm(e0, demonstrated);
        if (to !== null) recalibration = { from: e0, demonstrated, to };
      }
    } else {
      const target = smoothedTrend(next.trend)!;
      blended = round1(e0 + LEARN_BLEND * (target - e0));
    }
  }

  // Step 4: the progression model's deliberate move. The `max` of the passive
  // blend and the deliberate increment is what prevents the old double-count: a
  // session that also demonstrated a jump takes the larger move, not the sum.
  const config = session.config;
  const succeed = (increment: number) => {
    next.e1rm = Math.max(blended, round1(e0 + increment));
    next.failureStreak = 0;
  };
  const fail = (model: string) => {
    next.e1rm = blended;
    next.failureStreak += 1;
    if (next.failureStreak >= failureTrigger(model)) applyDeload(next);
  };

  switch (config?.progressionModel) {
    case "linear":
      if (evaluateLinear(sets) === "success") {
        succeed(
          (config.progressionParams as LinearProgressionParams).weightIncrement,
        );
      } else {
        fail("linear");
      }
      break;
    case "topset_backoff":
      if (evaluateTopSet(sets) === "success") {
        succeed(
          (config.progressionParams as TopSetProgressionParams).weightIncrement,
        );
      } else {
        fail("topset_backoff");
      }
      break;
    case "double": {
      const params = config.progressionParams as DoubleProgressionParams;
      const evaluation = evaluateDouble(params, next, sets);
      if (evaluation.weightProgressed) {
        succeed(params.weightIncrement);
      } else if (evaluation.outcome === "failure") {
        fail("double");
      } else {
        next.e1rm = blended;
        next.failureStreak = 0;
      }
      next.currentTargetReps = evaluation.nextTargetReps;
      break;
    }
    default:
      // "none", or a session logged without a progression config: the passive
      // blend (demonstrated-driven) is the only mover.
      next.e1rm = blended;
      break;
  }

  // Step 5: a user-confirmed recalibration has the final say on the scalar — a
  // re-baselined scalar makes a streak counted against the old baseline moot.
  if (confirmed !== undefined) {
    next.e1rm = confirmed;
    next.failureStreak = 0;
  }

  return { state: next, recalibration };
}

export interface FoldResult {
  state: ProgressionState;
  /** Per-session drift surfaced for confirmation, keyed by workoutId. */
  proposals: Map<string, SessionRecalibration>;
}

/** Fold an exercise's full session history into its current state. */
export function foldExercise(
  exerciseId: string,
  sessions: ExerciseSession[],
  matrix: RpeMatrix,
  confirmedByWorkout: Map<string, number> = new Map(),
): FoldResult {
  let state = freshState(exerciseId);
  const proposals = new Map<string, SessionRecalibration>();
  const ctx: StepContext = { matrix, confirmedByWorkout };

  for (const session of sessions) {
    const result = stepSession(state, session, ctx);
    state = result.state;
    if (result.recalibration)
      proposals.set(session.workoutId, result.recalibration);
  }

  return { state, proposals };
}
