import type {
  Exercise,
  PeriodizationFocus,
  Plan,
  ProgressionParams,
  ProgressionModelType,
  ProgressionState,
  Routine,
  RoutineExerciseConfig,
  RpeMatrix,
  Set as LoggedSet,
  Workout,
} from "../db/types";
import { DEFAULT_RPE_MATRIX } from "../db/rpeMatrix";
import { bodyweightOffsetKg, liftSet, pickBodyweightAt } from "./bodyweight";
import { CATCHUP_THRESHOLD, REGRESSION_RESET_TRIGGER } from "./constants";
import { explainOutcome, type OutcomeExplanation } from "./evaluation";
import {
  demonstratedSets,
  foldSession,
  learnedRpeMatrix,
  type DemonstratedSet,
} from "./fold";
import { priorsBySlot, type MuscleProfile } from "./fatigue";
import {
  absoluteWeekIndex,
  effectiveConfig,
  modifiersAt,
  weekFocus,
  type MesoModifiers,
} from "./mesocycle";
import { impliedE1rm, isQualifyingSet, seedSource } from "./matrix";
import {
  prescribeConfigured,
  type ExercisePrescription,
  type PrescribedSet,
} from "./prescription";
import { buildConfigMap, groupSetsByExercise } from "./sessions";
import {
  catchUpC1rm,
  consumeReset,
  corroboratedE1rm,
  initState,
  representativeByDistance,
} from "./state";

// ----------------------------------------------
// Engine trace — a deterministic REPLAY of the whole fold pipeline over workout
// history, recording every intermediate the decision rested on. This is the
// debugging surface behind History → Engine: it answers "which sets made this a
// progression / hold / reset, and by which numbers".
//
// Pipeline stage: none — it OBSERVES the pipeline. Pure and read-only: it walks
// the same modules the live fold uses (prescribeConfigured → explainOutcome →
// foldSession) over an in-memory copy of ProgressionState, so a trace can only
// ever describe what the engine actually does with these rules.
//
// Two deliberate departures from a bit-exact re-enactment, both because the
// inputs they'd need are no longer recoverable — and both in the direction that
// makes the tool USEFUL for tuning (rerun history under the current rules):
//   • The RPE matrix is held at each exercise's CURRENT curve. Replaying learning
//     from it would compound a curve that has already learned; instead each fold
//     reports whether it WOULD learn (matrixLearned).
//   • Prescriptions are re-rendered, exactly as the live fold re-renders them —
//     an in-session re-prescription is not part of the judgement either way.
// ----------------------------------------------

/** One logged set's role in the decision. */
export interface SetTrace {
  set: LoggedSet;
  /** The rules examined this set (top-set model: the top set alone). */
  judged: boolean;
  /** The set the outcome hinged on — the worst set, or the top set. */
  decider: boolean;
  /** The positionally matching prescribed set, when one exists. */
  prescribed: PrescribedSet | null;
  /** Honest + near-limit (RPE ≥ 8, ≤ 10 reps) → it fed the capacity math. */
  qualifying: boolean;
  /** Implied e1RM in total-load space, un-fatigued; null when it doesn't count. */
  e1rm: number | null;
  /**
   * The anti-fluke pick: the set catch-up and matrix learning weighed (or, on a
   * seed, the set the anchor came from).
   */
  representative: boolean;
}

/** The catch-up arithmetic for one fold. */
export interface CatchUpTrace {
  anchor: number;
  qualifyingSets: number;
  /** corroboratedE1rm — demonstrated capacity, outlier dropped. */
  estimate: number | null;
  /** Signed divergence of the estimate from the anchor, in percent. */
  gapPct: number | null;
  thresholdPct: number;
  fired: boolean;
  /** The anchor after catch-up; equals `anchor` when it didn't fire. */
  result: number;
}

export type TraceReason =
  "seed" | "increment" | "hold" | "regression" | "recalibrate" | "off-script";

/** One exercise's fold within one workout, with everything it was decided from. */
export interface FoldTrace {
  workoutId: string;
  startTime: number;
  routineId: string;
  routineName: string;
  exerciseId: string;
  exerciseName: string;
  reason: TraceReason;
  model: ProgressionModelType;
  /** Effective params — normalized and mesocycle-shifted, as prescribed from. */
  params: ProgressionParams | null;
  ceiling: number | null;
  focus: PeriodizationFocus | null;
  prescription: ExercisePrescription | null;
  fatigueReductionKg: number;
  bodyweightOffsetKg: number;
  outcome: OutcomeExplanation | null;
  catchUp: CatchUpTrace | null;
  sets: SetTrace[];
  /** State this session was prescribed from (any pending reset already consumed). */
  before: ProgressionState;
  after: ProgressionState;
  /** The −10% drop this session's prescription consumed, when it did. */
  resetConsumed: { from: number; to: number } | null;
  /** A reset is now armed — the NEXT session for this exercise drops 10%. */
  resetArmed: boolean;
  resetTrigger: number;
  /** Would this session refine the exercise's RPE curve? */
  matrixLearned: boolean;
  /**
   * The regressed sessions making up the streak this fold leaves behind, oldest →
   * newest (this one last). Empty whenever the streak is 0 — this is the answer to
   * "which sessions armed the reset".
   */
  streakChain: { workoutId: string; startTime: number }[];
}

export interface ReplayInput {
  workouts: Workout[]; // any order; replayed oldest → newest
  routines: Map<string, Routine>;
  plans: Plan[];
  exercises: Map<string, Exercise>;
  bodyweightEntries: { timestamp: number; value: number }[];
}

/** The plan that owns a routine (active plan wins) — mirrors the service. */
function owningPlan(plans: Plan[], routineId: string): Plan | undefined {
  return (
    plans.find((p) => p.active && p.routineIds.includes(routineId)) ??
    plans.find((p) => p.routineIds.includes(routineId))
  );
}

/**
 * Replay every workout in chronological order and return one trace per
 * exercise-session, oldest → newest. Progression state starts cold and moves only
 * through the real transitions, so mid-history states are reconstructed rather
 * than read from the (post-everything) stored ones.
 */
export function replayHistory(input: ReplayInput): FoldTrace[] {
  const workouts = [...input.workouts].sort(
    (a, b) => a.startTime - b.startTime,
  );
  const states = new Map<string, ProgressionState>();
  const chains = new Map<string, { workoutId: string; startTime: number }[]>();
  const traces: FoldTrace[] = [];

  const stateOf = (exerciseId: string, at: number): ProgressionState =>
    states.get(exerciseId) ?? initState(exerciseId, at);

  for (const workout of workouts) {
    const routine = input.routines.get(workout.routineId);
    const plan = owningPlan(input.plans, workout.routineId);
    const at = workout.startTime;
    const mods = modifiersAt(plan, at);
    const focus = weekFocus(plan?.mesocycle, absoluteWeekIndex(plan, at));
    const bodyweight = pickBodyweightAt(input.bodyweightEntries, at);

    const slotIds = routine?.exercises.map((re) => re.exerciseId) ?? [];
    const slotPriors = priorsBySlot(slotIds, (id) => input.exercises.get(id));
    // Duplicate slots fold to their LAST slot's priors — as the fold does.
    const priors = new Map(slotIds.map((id, i) => [id, slotPriors[i]]));
    const configs = buildConfigMap(routine);

    // ---- Prescribe phase: consume pending resets, exactly as prescribeWorkout
    // does — for every routine SLOT, whether or not the exercise gets logged.
    const consumed = new Map<string, { from: number; to: number }>();
    for (const id of slotIds) {
      const prior = stateOf(id, at);
      if (!prior.resetPending) continue;
      const next = consumeReset(prior, at);
      if (prior.c1rm != null && next.c1rm != null) {
        consumed.set(id, { from: prior.c1rm, to: next.c1rm });
      }
      states.set(id, next);
      chains.set(id, []); // consuming clears the streak
    }

    // ---- Fold phase, per logged exercise.
    for (const [exerciseId, sets] of groupSetsByExercise(workout)) {
      const exercise = input.exercises.get(exerciseId);
      if (!exercise) continue; // deleted exercise — the fold skips it too

      const before = stateOf(exerciseId, at);
      const matrix = exercise.rpeMatrix ?? DEFAULT_RPE_MATRIX;
      const offsetKg = bodyweightOffsetKg(
        exercise.bodyweightFactor,
        bodyweight,
      );
      const base: TraceBase = {
        workoutId: workout.id,
        startTime: at,
        routineId: workout.routineId,
        routineName: routine?.name ?? "Workout",
        exerciseId,
        exerciseName: exercise.name,
        focus,
        bodyweightOffsetKg: offsetKg,
        resetConsumed: consumed.get(exerciseId) ?? null,
        resetTrigger: REGRESSION_RESET_TRIGGER,
        before,
      };

      const config = configs.get(exerciseId);
      const trace =
        before.c1rm == null
          ? traceSeed(base, { matrix, sets, offsetKg })
          : config == null
            ? traceOffScript(base, sets)
            : traceFold(base, {
                exercise,
                config,
                mods,
                matrix,
                sets,
                offsetKg,
                bodyweight,
                priors: priors.get(exerciseId) ?? [],
                finishedAt: workout.endTime ?? at,
                chain: chains.get(exerciseId) ?? [],
              });

      states.set(exerciseId, trace.after);
      chains.set(exerciseId, trace.streakChain);
      traces.push(trace);
    }
  }

  return traces;
}

/** Shared trace fields resolved before the fold branches. */
type TraceBase = Pick<
  FoldTrace,
  | "workoutId"
  | "startTime"
  | "routineId"
  | "routineName"
  | "exerciseId"
  | "exerciseName"
  | "focus"
  | "bodyweightOffsetKg"
  | "resetConsumed"
  | "resetTrigger"
  | "before"
>;

/** What a branch fills in when there was no rule decision to report. */
const NO_DECISION = {
  params: null,
  ceiling: null,
  prescription: null,
  fatigueReductionKg: 0,
  outcome: null,
  catchUp: null,
  matrixLearned: false,
  resetArmed: false,
} as const;

/**
 * Cold start: the anchor is seeded from the best honest set and the session does
 * not progress. Every set carrying an RPE gets its implied e1RM so the seed's
 * provenance is visible, and the set the anchor came from is the representative.
 */
function traceSeed(
  base: TraceBase,
  input: { matrix: RpeMatrix; sets: LoggedSet[]; offsetKg: number },
): FoldTrace {
  const { matrix, sets, offsetKg } = input;
  const lifted = sets.map((s) => liftSet(s, offsetKg));
  const seed = seedSource(matrix, lifted);
  return {
    ...base,
    ...NO_DECISION,
    model: "none",
    reason: "seed",
    sets: sets.map((set, i) => ({
      set,
      judged: false,
      decider: false,
      prescribed: null,
      qualifying: isQualifyingSet(lifted[i]),
      e1rm: usableE1rm(matrix, lifted[i]),
      representative: seed?.set === lifted[i],
    })),
    after: {
      ...base.before,
      c1rm: seed?.e1rm ?? null,
      lastWorkoutId: base.workoutId,
    },
    streakChain: [],
  };
}

/** Logged off-script (not in the routine): stamped, never evaluated. */
function traceOffScript(base: TraceBase, sets: LoggedSet[]): FoldTrace {
  return {
    ...base,
    ...NO_DECISION,
    model: "none",
    reason: "off-script",
    sets: sets.map((set) => ({
      set,
      judged: false,
      decider: false,
      prescribed: null,
      qualifying: false,
      e1rm: null,
      representative: false,
    })),
    after: { ...base.before, lastWorkoutId: base.workoutId },
    streakChain: [],
  };
}

/** The full fold: prescribe → evaluate → step → catch-up, all of it recorded. */
function traceFold(
  base: TraceBase,
  input: {
    exercise: Exercise;
    config: RoutineExerciseConfig;
    mods: MesoModifiers;
    matrix: RpeMatrix;
    sets: LoggedSet[];
    offsetKg: number;
    bodyweight: number | undefined;
    priors: MuscleProfile[];
    finishedAt: number;
    chain: { workoutId: string; startTime: number }[];
  },
): FoldTrace {
  const { exercise, config, mods, matrix, sets, offsetKg } = input;
  const before = base.before;
  const eff = effectiveConfig(config, mods);
  const prescription = prescribeConfigured({
    exercise,
    eff,
    state: before,
    priors: input.priors,
    bodyweightKg: input.bodyweight,
  });

  const demonstrated = demonstratedSets(matrix, sets, offsetKg, prescription);
  const outcome = explainOutcome(eff.model, eff.params, prescription, sets);
  const { persisted, reason } = foldSession({
    state: before,
    eff,
    prescription,
    sets,
    demonstrated,
    workoutId: base.workoutId,
    finishedAt: input.finishedAt,
  });

  // Non-null: the caller routes cold-start exercises to traceSeed.
  const anchor = before.c1rm!;
  const estimate = corroboratedE1rm(
    demonstrated.map((d) => d.e1rm),
    anchor,
  );
  const caught = catchUpC1rm(anchor, estimate);
  // The same anti-fluke pick catch-up and matrix learning both weigh.
  const representative = representativeByDistance(
    demonstrated,
    (d) => d.e1rm,
    anchor,
  );

  const bySource = new Map<string, DemonstratedSet>(
    demonstrated.map((d) => [d.source.id, d]),
  );
  const judged = new Set(outcome.judged.map((s) => s.id));

  return {
    ...base,
    reason,
    model: eff.model,
    params: eff.params,
    ceiling: eff.ceiling,
    prescription,
    fatigueReductionKg: prescription.fatigueReduction ?? 0,
    outcome,
    catchUp: {
      anchor,
      qualifyingSets: demonstrated.length,
      estimate,
      gapPct: estimate != null ? ((estimate - anchor) / anchor) * 100 : null,
      thresholdPct: CATCHUP_THRESHOLD * 100,
      fired: caught !== anchor,
      result: caught,
    },
    sets: sets.map((set, i) => {
      const shown = bySource.get(set.id);
      return {
        set,
        judged: judged.has(set.id),
        decider: outcome.decider?.id === set.id,
        prescribed: prescription.sets[i] ?? null,
        qualifying: shown != null,
        e1rm: shown?.e1rm ?? null,
        representative: representative?.source.id === set.id,
      };
    }),
    after: persisted,
    resetArmed: persisted.resetPending,
    matrixLearned: learnedRpeMatrix(matrix, demonstrated, anchor) != null,
    // Only a regression leaves a streak behind, so a cleared streak means the
    // chain is spent — the reset it was building toward can no longer fire.
    streakChain:
      persisted.regressionStreak === 0
        ? []
        : [
            ...input.chain,
            { workoutId: base.workoutId, startTime: base.startTime },
          ],
  };
}

/** The e1RM a set implies when it carries enough to imply one at all. */
function usableE1rm(matrix: RpeMatrix, set: LoggedSet): number | null {
  if (set.actualRpe == null || set.actualWeight <= 0 || set.actualReps < 1) {
    return null;
  }
  const e1rm = impliedE1rm(
    matrix,
    set.actualWeight,
    set.actualReps,
    set.actualRpe,
  );
  return e1rm > 0 ? e1rm : null;
}
