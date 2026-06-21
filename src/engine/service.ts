import { db } from "../db/db";
import type {
  Exercise,
  LinearProgressionParams,
  NoneProgressionParams,
  PeriodizationFocus,
  Plan,
  ProgressionModelType,
  ProgressionParams,
  ProgressionState,
  Routine,
  RoutineExerciseConfig,
  Set as LoggedSet,
  Workout,
} from "../db/types";
import { normalizeProgressionParams } from "../config/progression";
import { DEFAULT_RPE_MATRIX } from "../db/rpeMatrix";
import { getProgressionState, putProgressionState } from "../db/repository";
import { RESET_DROP, RPE_MATRIX_CORRECTION_MAX_DEVIATION } from "./constants";
import {
  applyMesoToParams,
  focusModifiers,
  weekFocus,
  type MesoModifiers,
} from "./mesocycle";
import { prescribeExercise, type ExercisePrescription } from "./prescription";
import { evaluate } from "./evaluation";
import { catchUpC1rm, consumeReset, corroboratedE1rm, step } from "./state";
import {
  correctRpeMatrix,
  impliedE1rm,
  isQualifyingSet,
  peakImpliedE1rm,
} from "./matrix";
import { groupSessionsFor, qualifyingE1rmSeries } from "./sessions";

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
// Reset timing: a pending reset is consumed at PRESCRIPTION (start), not at
// evaluation and not when merely previewing — so peeking at a workout never
// mutates state, and the drop lands exactly when the session begins.
// ----------------------------------------------

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** An active reset as it shapes the upcoming session (retained fraction ≤ 1). */
export interface ResetEffect {
  kind: "intensity" | "volume";
  multiplier: number;
  sessionsRemaining: number;
}

/** Everything that goes into one exercise's upcoming prescription. */
export interface ExercisePreview {
  exerciseId: string;
  name: string;
  config?: RoutineExerciseConfig;
  c1rm: number | null;
  originalC1rm?: number | null;
  resetPending?: boolean;
  failureStreak: number;
  currentTargetReps?: number;
  resetEffects: ResetEffect[];
  prescription: ExercisePrescription | null;
}

export interface MesocyclePosition {
  weekIndex: number; // 0-based, within the cycle
  weekCount: number;
  focus: PeriodizationFocus;
  workoutsThisWeek: number;
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

// ---- shared helpers ----

/** The plan that owns a routine (active plan wins), for mesocycle context. */
async function resolveOwningPlan(routineId: string): Promise<Plan | undefined> {
  const plans = await db.plans.toArray();
  return (
    plans.find((p) => p.active && p.routineIds.includes(routineId)) ??
    plans.find((p) => p.routineIds.includes(routineId))
  );
}

/** The 0-based week within the plan's repeating mesocycle at time `at`. */
function absoluteWeekIndex(plan: Plan | undefined, at: number): number {
  if (!plan) return 0;
  return Math.max(0, Math.floor((at - plan.created_at) / WEEK_MS));
}

/** The target shifts for the plan's current week (none when no mesocycle). */
function mesoModifiers(plan: Plan | undefined, at: number): MesoModifiers {
  const focus = weekFocus(plan?.mesocycle, absoluteWeekIndex(plan, at));
  return focus
    ? focusModifiers(focus)
    : { rpeDelta: 0, repDelta: 0, setDelta: 0 };
}

/** The display-only mesocycle position for the preview, or null. */
async function mesocyclePosition(
  plan: Plan | undefined,
  at: number,
): Promise<MesocyclePosition | null> {
  if (!plan?.mesocycle?.length) return null;
  const len = plan.mesocycle.length;
  const absWeek = absoluteWeekIndex(plan, at);
  const focus = plan.mesocycle[absWeek % len].focus;
  const weekStartTs = plan.created_at + absWeek * WEEK_MS;
  const inWeek = await db.workouts
    .where("startTime")
    .between(weekStartTs, weekStartTs + WEEK_MS)
    .toArray();
  return {
    weekIndex: absWeek % len,
    weekCount: len,
    focus,
    workoutsThisWeek: inWeek.filter((w) =>
      plan.routineIds.includes(w.routineId),
    ).length,
  };
}

/** The raw RPE ceiling (not periodized); "none" caps at its own target. */
function rpeCeilingOf(
  model: ProgressionModelType,
  params: ProgressionParams,
): number {
  return model === "none"
    ? (params as NoneProgressionParams).targetRpe
    : (params as LinearProgressionParams).rpeCeiling;
}

interface EffectiveConfig {
  model: ProgressionModelType;
  params: ProgressionParams; // normalized + mesocycle-shifted
  ceiling: number;
}

/** Normalize a config and apply the week's modifiers (honoring locks). */
function effectiveConfig(
  config: RoutineExerciseConfig | undefined,
  mods: MesoModifiers,
): EffectiveConfig {
  const model = config?.progressionModel ?? "none";
  const normalized = normalizeProgressionParams(
    model,
    config?.progressionParams,
  );
  const params = applyMesoToParams(
    model,
    normalized,
    mods,
    config?.lockedFields ?? [],
  );
  return { model, params, ceiling: rpeCeilingOf(model, params) };
}

/** Render a prescription from an already-effective state (reset already applied). */
function prescribeFrom(
  exercise: Exercise,
  eff: EffectiveConfig,
  state: ProgressionState,
): ExercisePrescription {
  return prescribeExercise({
    exerciseId: exercise.id,
    model: eff.model,
    params: eff.params,
    rpeCeiling: eff.ceiling,
    effectiveC1rm: state.c1rm,
    doubleRepCursor: state.doubleRepCursor,
    matrix: exercise.rpeMatrix ?? DEFAULT_RPE_MATRIX,
  });
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
  const routine = await db.routines.get(routineId);
  if (!routine) return null;
  const plan = await resolveOwningPlan(routineId);
  const mods = mesoModifiers(plan, at);
  const position = await mesocyclePosition(plan, at);

  const exercises: ExercisePreview[] = [];
  for (const re of routine.exercises) {
    const exercise = await db.exercises.get(re.exerciseId);
    if (!exercise) continue;

    let state = await getProgressionState(re.exerciseId);
    const originalC1rm = state.c1rm;
    const resetPending = state.resetPending;
    const failureStreak = state.regressionStreak;
    if (resetPending) state = consumeReset(state, at); // in memory only — preview never writes

    const eff = effectiveConfig(re.config, mods);
    exercises.push({
      exerciseId: re.exerciseId,
      name: exercise.name,
      config: re.config,
      c1rm: state.c1rm,
      originalC1rm: resetPending ? originalC1rm : undefined,
      resetPending,
      failureStreak,
      currentTargetReps: state.doubleRepCursor,
      resetEffects: resetPending
        ? [
            {
              kind: "intensity",
              multiplier: 1 - RESET_DROP,
              sessionsRemaining: 1,
            },
          ]
        : [],
      prescription: prescribeFrom(exercise, eff, state),
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
 */
export async function prescribeWorkout(
  routineId: string,
  at: number = Date.now(),
): Promise<ExercisePrescription[]> {
  const routine = await db.routines.get(routineId);
  if (!routine) return [];
  const plan = await resolveOwningPlan(routineId);
  const mods = mesoModifiers(plan, at);

  // Pre-fetch exercises so the transaction only spans progressionStates.
  const exMap = await loadExercises(routine);

  const prescriptions: ExercisePrescription[] = [];
  await db.transaction("rw", db.progressionStates, async () => {
    for (const re of routine.exercises) {
      const exercise = exMap.get(re.exerciseId);
      if (!exercise) continue;

      let state = await getProgressionState(re.exerciseId);
      if (state.resetPending) {
        // Duplicate slots: the first consume persists; the second reads it cleared.
        state = consumeReset(state, at);
        await putProgressionState(state);
      }
      prescriptions.push(
        prescribeFrom(exercise, effectiveConfig(re.config, mods), state),
      );
    }
  });
  return prescriptions;
}

/**
 * Post-session fold: seed or advance each exercise's c1RM from what was logged.
 * Idempotent via the per-exercise lastWorkoutId guard. Returns the c1RM changes
 * for the summary. Adherence/PRs are computed elsewhere and never enter here.
 */
export async function applyWorkoutResults(
  workout: Workout,
): Promise<CalibrationChange[]> {
  const routine = await db.routines.get(workout.routineId);
  const plan = await resolveOwningPlan(workout.routineId);
  // Re-render with the modifiers AS AT the session, so N/targets match what was
  // prescribed that day (not "what week is it now").
  const mods = mesoModifiers(plan, workout.startTime);

  // Merge duplicate slots into one set list per exercise.
  const byExercise = new Map<string, LoggedSet[]>();
  for (const we of workout.exercises) {
    if (!we.sets.length) continue;
    byExercise.set(we.exerciseId, [
      ...(byExercise.get(we.exerciseId) ?? []),
      ...we.sets,
    ]);
  }

  const exMap = await loadExercisesById([...byExercise.keys()]);
  const configByExercise = new Map<string, RoutineExerciseConfig | undefined>();
  for (const re of routine?.exercises ?? []) {
    if (!configByExercise.has(re.exerciseId)) {
      configByExercise.set(re.exerciseId, re.config);
    }
  }

  const changes: CalibrationChange[] = [];
  const finishedAt = workout.endTime ?? workout.startTime;

  await db.transaction("rw", [db.progressionStates, db.exercises], async () => {
    for (const [exerciseId, rawSets] of byExercise) {
      const exercise = exMap.get(exerciseId);
      if (!exercise) continue;

      const state = await getProgressionState(exerciseId);
      if (state.lastWorkoutId === workout.id) continue; // idempotency

      const sets = [...rawSets].sort((a, b) => a.timestamp - b.timestamp);
      const matrix = exercise.rpeMatrix ?? DEFAULT_RPE_MATRIX;

      // Cold start: seed the anchor from the best qualifying set, no progression.
      // Fall back to the best USABLE set (any real RPE) so a first session that
      // never reached RPE 8 still anchors a c1RM from its limited data.
      if (state.c1rm == null) {
        const seeded =
          (peakImpliedE1rm(matrix, sets) ?? peakImpliedE1rm(matrix, sets, true))
            ?.e1rm ?? null;
        await putProgressionState({
          ...state,
          c1rm: seeded,
          lastWorkoutId: workout.id,
        });
        changes.push({
          exerciseId,
          exerciseName: exercise.name,
          reason: "seed",
          before: null,
          after: seeded,
        });
        continue;
      }

      const config = configByExercise.get(exerciseId);
      if (!config) {
        // Logged off-script (not in the routine) — can't evaluate; just guard.
        await putProgressionState({ ...state, lastWorkoutId: workout.id });
        continue;
      }

      const eff = effectiveConfig(config, mods);
      const prescription = prescribeFrom(exercise, eff, state);
      const outcome = evaluate(eff.model, eff.params, prescription, sets);
      const next = step(
        state,
        outcome,
        eff.model,
        eff.params,
        workout.id,
        finishedAt,
      );

      // One c1RM move per session. Catch-up is evaluated on EVERY outcome (incl.
      // regression — a grind over the ceiling still yields qualifying observations).
      // When it fires (this session's demonstrated capacity strongly diverged from the
      // anchor) it takes FULL PRECEDENCE over the deterministic rules: the c1RM jumps
      // toward the estimate, the regression streak clears, and no reset is armed this
      // session. The 3-strike −10% reset is the fallback only for sustained SMALL
      // regressions that stay within the catch-up threshold. When catch-up does not
      // fire, `step` stands unchanged (streak/reset/cursor). The estimate is
      // session-local: it requires ≥2 qualifying sets in THIS session (corroboratedE1rm),
      // so a lone set never moves the anchor.
      const estimate = corroboratedE1rm(
        qualifyingE1rmSeries(matrix, groupSessionsFor([workout], exerciseId)),
        state.c1rm,
      );
      const caught = catchUpC1rm(state.c1rm, estimate);
      const fired = caught !== state.c1rm;
      const persisted = fired
        ? { ...next, c1rm: caught, regressionStreak: 0, resetPending: false }
        : next;

      changes.push({
        exerciseId,
        exerciseName: exercise.name,
        reason: fired
          ? "recalibrate"
          : outcome === "success"
            ? "increment"
            : outcome,
        before: state.c1rm,
        after: persisted.c1rm,
        resetArmed: persisted.resetPending,
      });
      await putProgressionState(persisted);

      // Learn the exercise's RPE curve from this session — applied LAST so it
      // never feeds this session's own prescription, evaluation, or catch-up
      // (those all read the matrix as it was). The representative set is picked
      // exactly like the catch-up's corroboratedE1rm: a lone qualifying set
      // (top-set programs) moves the curve directly; with ≥2 sets the single
      // furthest-from-anchor (a mistype/fluke) is dropped and the 2nd-furthest
      // is used. The anchor is the stable rules-driven c1RM (state.c1rm), not
      // the post-catch-up value. The ≤10% gate keeps corrections to honest sets
      // that already agree with the anchor, so this only refines curve shape
      // (the >10% divergence case is catch-up's job).
      const qualifying = sets.filter(isQualifyingSet);
      if (qualifying.length > 0 && state.c1rm !== null) {
        const anchor = state.c1rm;
        const ranked = qualifying
          .map((s) => ({
            set: s,
            e1rm: impliedE1rm(
              matrix,
              s.actualWeight,
              s.actualReps,
              s.actualRpe!,
            ),
          }))
          .sort(
            (a, b) => Math.abs(b.e1rm - anchor) - Math.abs(a.e1rm - anchor),
          );
        const rep = ranked[Math.min(1, ranked.length - 1)];
        const deviation = Math.abs(rep.e1rm - anchor) / anchor;
        if (deviation <= RPE_MATRIX_CORRECTION_MAX_DEVIATION) {
          const corrected = correctRpeMatrix(
            matrix,
            {
              actualWeight: rep.set.actualWeight,
              actualReps: rep.set.actualReps,
              actualRpe: rep.set.actualRpe!,
            },
            anchor,
          );
          await db.exercises.update(exerciseId, { rpeMatrix: corrected });
        }
      }
    }
  });
  return changes;
}

// ---- exercise loading (outside any transaction) ----

async function loadExercises(routine: Routine): Promise<Map<string, Exercise>> {
  return loadExercisesById([
    ...new Set(routine.exercises.map((e) => e.exerciseId)),
  ]);
}

async function loadExercisesById(
  ids: string[],
): Promise<Map<string, Exercise>> {
  const list = await Promise.all(ids.map((id) => db.exercises.get(id)));
  const map = new Map<string, Exercise>();
  for (const e of list) if (e) map.set(e.id, e);
  return map;
}
