import { db } from "../db/db";
import type {
  Exercise,
  PeriodizationFocus,
  Plan,
  ProgressionState,
  Routine,
  RoutineExerciseConfig,
  Set as LoggedSet,
  Workout,
} from "../db/types";
import { DEFAULT_RPE_MATRIX } from "../db/rpeMatrix";
import {
  getExercisesByIds,
  getPlans,
  getProgressionState,
  getProgressionStates,
  getRoutine,
  getWorkoutsBetween,
  putProgressionState,
  setExerciseRpeMatrix,
} from "../db/repository";
import { bodyweightAt, currentBodyweight } from "../db/measurements";
import { bodyweightOffsetKg, liftSets } from "./bodyweight";
import { WEEK_MS } from "./constants";
import {
  effectiveConfig,
  modifiersAt,
  weekBoundary,
  weekProgressFrom,
  type EffectiveConfig,
  type MesoModifiers,
} from "./mesocycle";
import { prescribeExercise, type ExercisePrescription } from "./prescription";
import {
  computeFatigueAdjustment,
  muscleProfileOf,
  priorsBySlot,
  type MuscleProfile,
} from "./fatigue";
import { demonstratedSets, foldSession, learnedRpeMatrix } from "./fold";
import { consumeReset } from "./state";
import { seedE1rm } from "./matrix";

// ----------------------------------------------
// Engine service — the ONLY impure (Dexie) layer. It orchestrates the pure
// modules along the planning pipeline:
//
//   config + mesocycle + state ─► prescription ─► (execution) ─► evaluation ─► state
//
// Three entrypoints:
//   • previewWorkout    — READ-ONLY view of the upcoming session (never writes).
//   • prescribeWorkout  — called at workout START; consumes a pending reset
//                         (persisting the −10% c1RM drop exactly once).
//   • applyWorkoutResults — post-session fold; advances/seeds c1RM. Idempotent.
//
// All three share `routineContext` so they can never disagree about the week's
// modifiers or the fatigue priors — a preview that showed different loads than
// the session then prescribes is the bug class this file exists to prevent.
//
// Reset timing: a pending reset is consumed at PRESCRIPTION (start), not at
// evaluation and not when merely previewing — so peeking at a workout never
// mutates state, and the drop lands exactly when the session begins.
// ----------------------------------------------

/** Everything that goes into one exercise's upcoming prescription. */
export interface ExercisePreview {
  exerciseId: string;
  name: string;
  config?: RoutineExerciseConfig;
  c1rm: number | null;
  // The anchor before a pending reset was applied. Present ⇔ this preview
  // applied one, so it doubles as the "reset pending" flag.
  preResetC1rm?: number;
  failureStreak: number;
  prescription: ExercisePrescription | null;
  // kg of bodyweight folded into the (total-space) c1rm; 0 unless the exercise
  // has a bodyweightFactor and a bodyweight is known. Display context only.
  bodyweightOffsetKg: number;
  // The exercise has a bodyweightFactor but no bodyweight was ever logged, so
  // the engine runs without the bodyweight share — worth a UI hint.
  bodyweightMissing: boolean;
}

export interface MesocyclePosition {
  weekIndex: number; // 0-based, within the cycle
  weekCount: number;
  focus: PeriodizationFocus;
  workoutsThisWeek: number;
  // Fraction (0..1) through the current mesocycle week, honoring the plan's
  // week-boundary convention (Monday-aligned or rolling from a mid-week anchor).
  weekProgress: number;
}

export interface WorkoutPreview {
  routineId: string;
  routineName: string;
  mesocycle: MesocyclePosition | null;
  exercises: ExercisePreview[];
}

/**
 * One exercise's c1RM change from a finished session, surfaced read-only in the
 * post-workout summary (the deterministic engine applies it — there is no
 * confirmation step).
 */
export interface CalibrationChange {
  exerciseId: string;
  exerciseName: string;
  reason: "seed" | "increment" | "hold" | "regression" | "recalibrate";
  before: number | null;
  after: number | null;
  resetArmed?: boolean; // 3rd consecutive regression — next prescription deloads −10%
}

// ---- shared context ----

/** The plan that owns a routine (active plan wins), for mesocycle context. */
async function resolveOwningPlan(routineId: string): Promise<Plan | undefined> {
  const plans = await getPlans();
  return (
    plans.find((p) => p.active && p.routineIds.includes(routineId)) ??
    plans.find((p) => p.routineIds.includes(routineId))
  );
}

interface RoutineContext {
  plan: Plan | undefined;
  mods: MesoModifiers;
  exercises: Map<string, Exercise>;
  bodyweight: number | undefined;
  /** Fatigue priors per routine SLOT, index-aligned with routine.exercises. */
  slotPriors: MuscleProfile[][];
}

/**
 * Everything the prescribing paths need about a routine at time `at`. The four
 * reads are mutually independent, so they run concurrently.
 *
 * `bodyweight` is passed in as an unawaited promise rather than fetched here
 * because WHICH bodyweight differs by caller: prescribing uses the current one,
 * while re-rendering a finished session must use the one in effect AT the
 * session, or the fold stops reproducing itself. `extraExerciseIds` covers
 * exercises that were logged off-script (not in the routine).
 */
async function routineContext(
  routine: Routine | undefined,
  at: number,
  bodyweight: Promise<number | undefined>,
  extraExerciseIds: string[] = [],
): Promise<RoutineContext> {
  const slotIds = routine?.exercises.map((re) => re.exerciseId) ?? [];
  const [plan, exercises, resolvedBodyweight] = await Promise.all([
    routine ? resolveOwningPlan(routine.id) : undefined,
    getExercisesByIds([...slotIds, ...extraExerciseIds]),
    bodyweight,
  ]);
  return {
    plan,
    mods: modifiersAt(plan, at),
    exercises,
    bodyweight: resolvedBodyweight,
    slotPriors: priorsBySlot(slotIds, (id) => exercises.get(id)),
  };
}

/** Render a prescription from an already-effective state (reset already applied). */
function prescribeFrom(
  exercise: Exercise,
  eff: EffectiveConfig,
  state: ProgressionState,
  priors: MuscleProfile[],
  bodyweightKg: number | undefined,
): ExercisePrescription {
  return prescribeExercise({
    exerciseId: exercise.id,
    model: eff.model,
    params: eff.params,
    rpeCeiling: eff.ceiling,
    effectiveC1rm: state.c1rm,
    fatigueReduction: fatigueReductionFor(exercise, eff, state, priors),
    doubleRepCursor: state.doubleRepCursor,
    matrix: exercise.rpeMatrix ?? DEFAULT_RPE_MATRIX,
    bodyweightOffsetKg: bodyweightOffsetKg(
      exercise.bodyweightFactor,
      bodyweightKg,
    ),
  });
}

/** The kg to shave off the anchor given the session's prior exercises so far. */
function fatigueReductionFor(
  exercise: Exercise,
  eff: EffectiveConfig,
  state: ProgressionState,
  priors: MuscleProfile[],
): number {
  if (state.c1rm == null || !priors.length) return 0;
  return (
    computeFatigueAdjustment({
      reduction: eff.params.fatigueReduction,
      unit: eff.params.fatigueReductionUnit,
      c1rm: state.c1rm,
      current: muscleProfileOf(exercise),
      priors,
    })?.reductionKg ?? 0
  );
}

// ---- mesocycle position (display only) ----

/** The display-only mesocycle position for the preview, or null. */
export async function mesocyclePosition(
  plan: Plan | undefined,
  at: number,
): Promise<MesocyclePosition | null> {
  if (!plan?.mesocycle?.length) return null;
  const len = plan.mesocycle.length;
  const { absWeek, weekStartTs } = weekBoundary(plan, at);
  const inWeek = await getWorkoutsBetween(weekStartTs, weekStartTs + WEEK_MS);
  return {
    weekIndex: absWeek % len,
    weekCount: len,
    focus: plan.mesocycle[absWeek % len].focus,
    workoutsThisWeek: inWeek.filter((w) =>
      plan.routineIds.includes(w.routineId),
    ).length,
    weekProgress: weekProgressFrom(weekStartTs, at),
  };
}

// ---- entrypoints ----

/**
 * Read-only preview of the upcoming workout. Computes each exercise's
 * prescription (applying any pending reset IN MEMORY so the shown weight matches
 * what the session will use) WITHOUT persisting anything.
 */
export async function previewWorkout(
  routineId: string,
  at: number = Date.now(),
): Promise<WorkoutPreview | null> {
  const routine = await getRoutine(routineId);
  if (!routine) return null;

  const ctx = await routineContext(routine, at, currentBodyweight());
  const [position, states] = await Promise.all([
    mesocyclePosition(ctx.plan, at),
    getProgressionStates(routine.exercises.map((re) => re.exerciseId)),
  ]);

  const exercises: ExercisePreview[] = [];
  for (const [i, re] of routine.exercises.entries()) {
    const exercise = ctx.exercises.get(re.exerciseId);
    if (!exercise) continue;

    // Non-null: getProgressionStates populates every id it was asked for.
    const stored = states.get(re.exerciseId)!;
    // In memory only — previewing never writes.
    const state = consumeReset(stored, at);

    exercises.push({
      exerciseId: re.exerciseId,
      name: exercise.name,
      config: re.config,
      c1rm: state.c1rm,
      ...(stored.resetPending && stored.c1rm != null
        ? { preResetC1rm: stored.c1rm }
        : {}),
      failureStreak: stored.regressionStreak,
      prescription: prescribeFrom(
        exercise,
        effectiveConfig(re.config, ctx.mods),
        state,
        ctx.slotPriors[i],
        ctx.bodyweight,
      ),
      bodyweightOffsetKg: bodyweightOffsetKg(
        exercise.bodyweightFactor,
        ctx.bodyweight,
      ),
      bodyweightMissing:
        (exercise.bodyweightFactor ?? 0) > 0 && ctx.bodyweight == null,
    });
  }

  return {
    routineId,
    routineName: routine.name,
    mesocycle: position,
    exercises,
  };
}

/**
 * Prescribe the workout at START. Consumes any pending reset (dropping c1RM 10%)
 * and persists that consumption exactly once per exercise, inside a transaction.
 *
 * SLOT-ALIGNED with routine.exercises (null where the exercise is missing):
 * fatigue makes duplicate slots of one exercise prescribe differently once an
 * overlapping exercise sits between them, so consumers must NOT fold the result
 * into a per-exerciseId map — that would render the last slot's (reduced) loads
 * for every slot, diverging from the preview.
 */
export async function prescribeWorkout(
  routineId: string,
  at: number = Date.now(),
): Promise<(ExercisePrescription | null)[]> {
  const routine = await getRoutine(routineId);
  if (!routine) return [];

  // Everything is prefetched so the transaction only spans progressionStates.
  const ctx = await routineContext(routine, at, currentBodyweight());

  const prescriptions: (ExercisePrescription | null)[] = [];
  await db.transaction("rw", db.progressionStates, async () => {
    for (const [i, re] of routine.exercises.entries()) {
      const exercise = ctx.exercises.get(re.exerciseId);
      if (!exercise) {
        prescriptions.push(null);
        continue;
      }

      let state = await getProgressionState(re.exerciseId);
      if (state.resetPending) {
        // Duplicate slots: the first consume persists; the second reads it cleared.
        state = consumeReset(state, at);
        await putProgressionState(state);
      }
      prescriptions.push(
        prescribeFrom(
          exercise,
          effectiveConfig(re.config, ctx.mods),
          state,
          ctx.slotPriors[i],
          ctx.bodyweight,
        ),
      );
    }
  });
  return prescriptions;
}

/** Merge duplicate exercise slots into one timestamp-sorted set list per exercise. */
function groupSetsByExercise(workout: Workout): Map<string, LoggedSet[]> {
  const map = new Map<string, LoggedSet[]>();
  for (const we of workout.exercises) {
    // An exercise that logged nothing must not reach the fold at all — it would
    // be stamped as processed and its cold start silently consumed.
    if (!we.sets.length) continue;
    map.set(we.exerciseId, [...(map.get(we.exerciseId) ?? []), ...we.sets]);
  }
  for (const sets of map.values())
    sets.sort((a, b) => a.timestamp - b.timestamp);
  return map;
}

/** Index a routine's exercise configs by exercise id (first slot wins). */
function buildConfigMap(
  routine: Routine | undefined,
): Map<string, RoutineExerciseConfig | undefined> {
  const map = new Map<string, RoutineExerciseConfig | undefined>();
  for (const re of routine?.exercises ?? []) {
    if (!map.has(re.exerciseId)) map.set(re.exerciseId, re.config);
  }
  return map;
}

/** The context one exercise's fold reads, shared across the session's loop. */
interface FoldContext {
  workout: Workout;
  finishedAt: number;
  mods: MesoModifiers;
  bodyweight: number | undefined;
  exercises: Map<string, Exercise>;
  configs: Map<string, RoutineExerciseConfig | undefined>;
  priors: Map<string, MuscleProfile[]>;
}

/**
 * Fold one exercise's logged sets into its progression state, returning the
 * change to report (or null when there is nothing to report). Every exit
 * persists exactly once, including the guard-only paths — the lastWorkoutId
 * stamp is what makes re-running this session a no-op.
 */
async function foldExercise(
  exerciseId: string,
  sets: LoggedSet[],
  ctx: FoldContext,
): Promise<CalibrationChange | null> {
  const exercise = ctx.exercises.get(exerciseId);
  if (!exercise) return null;

  const state = await getProgressionState(exerciseId);
  if (state.lastWorkoutId === ctx.workout.id) return null; // idempotency

  const matrix = exercise.rpeMatrix ?? DEFAULT_RPE_MATRIX;
  const offsetKg = bodyweightOffsetKg(
    exercise.bodyweightFactor,
    ctx.bodyweight,
  );

  // Cold start: seed the anchor and stop — no progression on the first session.
  // Lifted sets so the seed lands in total space.
  if (state.c1rm == null) {
    const seeded = seedE1rm(matrix, liftSets(sets, offsetKg));
    await putProgressionState({
      ...state,
      c1rm: seeded,
      lastWorkoutId: ctx.workout.id,
    });
    return {
      exerciseId,
      exerciseName: exercise.name,
      reason: "seed",
      before: null,
      after: seeded,
    };
  }

  const config = ctx.configs.get(exerciseId);
  if (!config) {
    // Logged off-script (not in the routine) — can't evaluate; just guard.
    await putProgressionState({ ...state, lastWorkoutId: ctx.workout.id });
    return null;
  }

  const eff = effectiveConfig(config, ctx.mods);
  const prescription = prescribeFrom(
    exercise,
    eff,
    state,
    ctx.priors.get(exerciseId) ?? [],
    ctx.bodyweight,
  );
  const demonstrated = demonstratedSets(matrix, sets, offsetKg, prescription);
  const { persisted, reason } = foldSession({
    state,
    eff,
    prescription,
    sets,
    demonstrated,
    workoutId: ctx.workout.id,
    finishedAt: ctx.finishedAt,
  });
  await putProgressionState(persisted);

  // Learn the exercise's RPE curve LAST, so it never feeds this session's own
  // prescription, evaluation, or catch-up (those all read the prior matrix).
  // The anchor is the stable rules-driven c1RM, not the post-catch-up value.
  const corrected = learnedRpeMatrix(matrix, demonstrated, state.c1rm);
  if (corrected) await setExerciseRpeMatrix(exerciseId, corrected);

  return {
    exerciseId,
    exerciseName: exercise.name,
    reason,
    before: state.c1rm,
    after: persisted.c1rm,
    resetArmed: persisted.resetPending,
  };
}

/**
 * Post-session fold: seed or advance each exercise's c1RM from what was logged.
 * Idempotent via the per-exercise lastWorkoutId guard. Returns the c1RM changes
 * for the summary. Adherence/PRs are computed elsewhere and never enter here.
 */
export async function applyWorkoutResults(
  workout: Workout,
): Promise<CalibrationChange[]> {
  const byExercise = groupSetsByExercise(workout);
  const routine = await getRoutine(workout.routineId);

  // Re-render with the modifiers AS AT the session, so N/targets match what was
  // prescribed that day (not "what week is it now"), on the bodyweight in effect
  // then. Unlogged routine exercises still matter: they were assumed as fatigue
  // priors when the session was prescribed, so they shape that re-render.
  const ctx = await routineContext(
    routine,
    workout.startTime,
    bodyweightAt(workout.startTime),
    [...byExercise.keys()],
  );

  const foldCtx: FoldContext = {
    workout,
    finishedAt: workout.endTime ?? workout.startTime,
    mods: ctx.mods,
    bodyweight: ctx.bodyweight,
    exercises: ctx.exercises,
    configs: buildConfigMap(routine),
    // Duplicate exercises fold to their LAST routine slot's priors — later slots
    // overwrite earlier ones as the map is built.
    priors: new Map(
      (routine?.exercises ?? []).map(
        (re, i) => [re.exerciseId, ctx.slotPriors[i]] as const,
      ),
    ),
  };

  const changes: CalibrationChange[] = [];
  await db.transaction("rw", [db.progressionStates, db.exercises], async () => {
    for (const [exerciseId, sets] of byExercise) {
      const change = await foldExercise(exerciseId, sets, foldCtx);
      if (change) changes.push(change);
    }
  });
  return changes;
}
