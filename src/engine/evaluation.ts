import type {
  DoubleProgressionParams,
  LinearProgressionParams,
  ProgressionModelType,
  ProgressionParams,
  Set as LoggedSet,
  TopSetProgressionParams,
} from "../db/types";
import type { ExercisePrescription } from "./prescription";
import { weightMatches } from "./comparison";

// ----------------------------------------------
// Per-model outcome judgment. Given an exercise's effective config, the original
// prescription, and the logged sets, decide whether the session was a success,
// a hold, or a regression — deterministically from the locked rules.
//
// Pipeline stage: finish workout → evaluate. The outcome feeds state.step, which
// is what actually moves the c1RM. This module is the ONLY place the rules live.
//
// Two cross-cutting decisions:
//   • "Worst set decides" — for multi-set models the hardest set (highest RPE,
//     tie-break fewest reps) drives a regression; success needs every set.
//   • "Evaluate against the original prescription" — weights are compared to the
//     re-rendered original prescribed weight, so an in-session re-prescription
//     DOWN never disguises a miss as success. The set that triggered the
//     re-prescription was logged at the original weight and, being the hardest,
//     is the worst set anyway.
// Missing actualRpe can neither confirm a success nor trigger an RPE-regression,
// so it falls through to "hold" — the safe, non-progressing outcome.
//
// Every rule is expressed ONCE, as a list of RuleChecks: `explainOutcome` builds
// them and `evaluate` is literally its `.outcome`, so the debugging trace
// (engine/replay.ts) can never describe a rule the engine didn't apply.
// ----------------------------------------------

export type ProgressionOutcome = "success" | "hold" | "regression";

/** One clause of a model's rule, with the numbers it compared. */
export interface RuleCheck {
  label: string;
  passed: boolean;
  // Unit-free (counts, reps, RPE) — weights are the caller's to format.
  detail?: string;
}

/**
 * Why a session got the outcome it did: the sets the rules examined, the set
 * that decided it, the thresholds used, and every clause with its verdict.
 * Success needs all `successChecks`; a regression needs all `regressionChecks`.
 */
export interface OutcomeExplanation {
  outcome: ProgressionOutcome;
  /** The sets the success clause examined (top-set model: the top set alone). */
  judged: LoggedSet[];
  /** The set the outcome hinged on — worst set, or the top set. */
  decider: LoggedSet | null;
  /** Prescribed weight the weight clauses compared against; null at cold start. */
  prescribedWeight: number | null;
  /** Reps at/below which the regression clause can fire. */
  repFloor: number | null;
  /** RPE above which the regression clause can fire. */
  rpeThreshold: number | null;
  successChecks: RuleCheck[];
  regressionChecks: RuleCheck[];
}

/** The prescribed working sets that were actually performed, in prescribed order. */
function orderedWorkingSets(
  prescription: ExercisePrescription,
  loggedSets: LoggedSet[],
): LoggedSet[] {
  const n = prescription.sets.length;
  return [...loggedSets].sort((a, b) => a.timestamp - b.timestamp).slice(0, n);
}

/**
 * The shared regression shape, identical across all three models: the deciding
 * set bottomed out on reps AND ground past the RPE threshold, WHILE loaded at
 * the prescribed weight. The weight clause is what makes a grind at a
 * self-selected load a "hold" — it says nothing about the prescribed one. A
 * missing actualRpe can never trigger this, so it falls through to hold.
 *
 * Every clause fails on a missing set, so an unlogged decider can never regress.
 */
function regressionChecks(
  set: LoggedSet | null | undefined,
  prescribedWeight: number | null | undefined,
  repFloor: number,
  rpeThreshold: number,
): RuleCheck[] {
  return [
    {
      label: `deciding set reps ≤ ${repFloor}`,
      passed: set != null && set.actualReps <= repFloor,
      detail: set ? `${set.actualReps} reps` : "no set logged",
    },
    {
      label: "deciding set at the prescribed weight",
      passed:
        set != null &&
        prescribedWeight != null &&
        weightMatches(set.actualWeight, prescribedWeight),
      detail: prescribedWeight == null ? "no prescribed weight" : undefined,
    },
    {
      label: `deciding set RPE > ${rpeThreshold}`,
      passed: set?.actualRpe != null && set.actualRpe > rpeThreshold,
      detail:
        set == null
          ? "no set logged"
          : set.actualRpe == null
            ? "no RPE logged"
            : `RPE ${set.actualRpe}`,
    },
  ];
}

const allPassed = (checks: RuleCheck[]): boolean =>
  checks.every((c) => c.passed);

/** Every judged set satisfies `pred`; failures are counted in the detail. */
function everySetCheck(
  label: string,
  sets: LoggedSet[],
  pred: (set: LoggedSet) => boolean,
): RuleCheck {
  const off = sets.filter((s) => !pred(s)).length;
  return {
    label,
    passed: off === 0,
    detail: off > 0 ? `${off} of ${sets.length} sets off` : undefined,
  };
}

/** All prescribed working sets were actually performed. */
function performedCheck(
  prescription: ExercisePrescription,
  working: LoggedSet[],
): RuleCheck {
  const n = prescription.sets.length;
  return {
    label: `all ${n} prescribed sets performed`,
    passed: working.length >= n,
    detail: `${working.length} of ${n} logged`,
  };
}

/** Every judged set sat within tolerance of the prescribed weight. */
function atPrescribedCheck(
  sets: LoggedSet[],
  prescribedWeight: number | null,
): RuleCheck {
  if (prescribedWeight == null) {
    return {
      label: "every set at the prescribed weight",
      passed: false,
      detail: "no prescribed weight",
    };
  }
  return everySetCheck("every set at the prescribed weight", sets, (s) =>
    weightMatches(s.actualWeight, prescribedWeight),
  );
}

/** The hardest set: highest RPE, tie-break fewest reps. Null for an empty list. */
function worstSet(sets: LoggedSet[]): LoggedSet | null {
  if (sets.length === 0) return null;
  return sets.reduce((worst, s) => {
    const sr = s.actualRpe ?? -Infinity;
    const wr = worst.actualRpe ?? -Infinity;
    if (sr > wr) return s;
    if (sr === wr && s.actualReps < worst.actualReps) return s;
    return worst;
  });
}

/** The outcome alone — `explainOutcome().outcome`, which owns the rules. */
export function evaluate(
  model: ProgressionModelType,
  params: ProgressionParams,
  prescription: ExercisePrescription,
  loggedSets: LoggedSet[],
): ProgressionOutcome {
  return explainOutcome(model, params, prescription, loggedSets).outcome;
}

/**
 * The full rule trace behind a session's outcome. The ONLY implementation of the
 * per-model criteria — `evaluate` reads its outcome and the engine-trace UI reads
 * the checks, so an explanation can never drift from the applied rule.
 */
export function explainOutcome(
  model: ProgressionModelType,
  params: ProgressionParams,
  prescription: ExercisePrescription,
  loggedSets: LoggedSet[],
): OutcomeExplanation {
  const working = orderedWorkingSets(prescription, loggedSets);
  switch (model) {
    case "linear":
      return explainLinear(
        params as LinearProgressionParams,
        prescription,
        working,
      );
    case "double":
      return explainDouble(
        params as DoubleProgressionParams,
        prescription,
        working,
      );
    case "topset_backoff":
      return explainTopSet(
        params as TopSetProgressionParams,
        prescription,
        working,
      );
    case "none":
      return {
        outcome: "hold",
        judged: [],
        decider: null,
        prescribedWeight: prescription.sets[0]?.weight ?? null,
        repFloor: null,
        rpeThreshold: null,
        successChecks: [
          {
            label: "model progresses",
            passed: false,
            detail: "model is 'none' — always holds",
          },
        ],
        regressionChecks: [],
      };
  }
}

/**
 * Resolve success-first, then the regression clause — the precedence every model
 * shares. `regression` needs all its checks; anything else falls through to hold.
 */
function resolve(
  parts: Omit<OutcomeExplanation, "outcome">,
): OutcomeExplanation {
  const outcome: ProgressionOutcome = allPassed(parts.successChecks)
    ? "success"
    : allPassed(parts.regressionChecks) && parts.regressionChecks.length > 0
      ? "regression"
      : "hold";
  return { ...parts, outcome };
}

function explainLinear(
  p: LinearProgressionParams,
  prescription: ExercisePrescription,
  working: LoggedSet[],
): OutcomeExplanation {
  const W = prescription.sets[0]?.weight ?? null; // straight sets share one weight
  return resolve({
    judged: working,
    decider: worstSet(working),
    prescribedWeight: W,
    repFloor: p.targetReps,
    rpeThreshold: p.targetRpe,
    successChecks: [
      performedCheck(prescription, working),
      everySetCheck(
        `every set ≥ ${p.targetReps} reps`,
        working,
        (s) => s.actualReps >= p.targetReps,
      ),
      everySetCheck(
        `every set RPE ≤ ${p.targetRpe}`,
        working,
        (s) => s.actualRpe != null && s.actualRpe <= p.targetRpe,
      ),
      atPrescribedCheck(working, W),
    ],
    regressionChecks: regressionChecks(
      worstSet(working),
      W,
      p.targetReps,
      p.targetRpe,
    ),
  });
}

/**
 * For double progression, check if the session met target reps and target RPE to
 * qualify for rep cursor advancement on a "hold" outcome.
 */
export function isDoubleCursorAdvancementEligible(
  p: DoubleProgressionParams,
  prescription: ExercisePrescription,
  loggedSets: LoggedSet[],
): boolean {
  const working = orderedWorkingSets(prescription, loggedSets);
  if (working.length < prescription.sets.length) return false;
  const targetReps = prescription.sets[0]?.reps ?? p.minReps;
  const hitsTarget = working.every((s) => s.actualReps >= targetReps);
  const worst = worstSet(working);
  const worstRpeOk = worst?.actualRpe != null && worst.actualRpe <= p.targetRpe;
  return hitsTarget && worstRpeOk;
}

function explainDouble(
  p: DoubleProgressionParams,
  prescription: ExercisePrescription,
  working: LoggedSet[],
): OutcomeExplanation {
  const worst = worstSet(working);
  const W = prescription.sets[0]?.weight ?? null; // double holds one weight across sets

  // Regression threshold NOTE (locked-but-watch): the rule as specified is
  // `RPE + 1 > targetRpe`, i.e. the threshold is `targetRpe − 1`. At the default
  // target 8 this fires whenever the worst set's RPE exceeds 7 while reps are
  // at/under minReps — aggressive. Encoded exactly as specified; revisit with
  // real logs.
  const rpeThreshold = p.targetRpe - 1;

  return resolve({
    judged: working,
    decider: worst,
    prescribedWeight: W,
    repFloor: p.minReps,
    rpeThreshold,
    // Success: every set hit the top of the rep range and the hardest set stayed
    // at/under target RPE → the load has been earned; advance it.
    successChecks: [
      performedCheck(prescription, working),
      everySetCheck(
        `every set ≥ ${p.maxReps} reps (top of the range)`,
        working,
        (s) => s.actualReps >= p.maxReps,
      ),
      {
        label: `hardest set RPE ≤ ${p.targetRpe}`,
        passed: worst?.actualRpe != null && worst.actualRpe <= p.targetRpe,
        detail:
          worst?.actualRpe == null ? "no RPE logged" : `RPE ${worst.actualRpe}`,
      },
    ],
    // Regression: bottomed out at minReps and grinding, at the prescribed weight.
    regressionChecks: regressionChecks(worst, W, p.minReps, rpeThreshold),
  });
}

function explainTopSet(
  p: TopSetProgressionParams,
  prescription: ExercisePrescription,
  working: LoggedSet[],
): OutcomeExplanation {
  const top = working[0] ?? null; // first by timestamp = the top set
  const W = prescription.sets.find((s) => s.role === "top")?.weight ?? null;

  return resolve({
    judged: top ? [top] : [],
    decider: top,
    prescribedWeight: W,
    repFloor: p.topSetTargetReps,
    rpeThreshold: p.topSetTargetRpe,
    // Success keys on reps + RPE only (no weight clause, per the rule).
    successChecks: [
      {
        label: "top set logged",
        passed: top != null,
      },
      {
        label: `top set ≥ ${p.topSetTargetReps} reps`,
        passed: top != null && top.actualReps >= p.topSetTargetReps,
        detail: top ? `${top.actualReps} reps` : undefined,
      },
      {
        label: `top set RPE ≤ ${p.topSetTargetRpe}`,
        passed: top?.actualRpe != null && top.actualRpe <= p.topSetTargetRpe,
        detail:
          top?.actualRpe == null ? "no RPE logged" : `RPE ${top.actualRpe}`,
      },
    ],
    regressionChecks: regressionChecks(
      top,
      W,
      p.topSetTargetReps,
      p.topSetTargetRpe,
    ),
  });
}
