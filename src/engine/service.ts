import { db } from "../db/db";
import { DEFAULT_RPE_MATRIX } from "../db/rpeMatrix";
import type {
  Exercise,
  PeriodizationFocus,
  ProgressionState,
  Recalibration,
  Routine,
  RoutineExerciseConfig,
  RpeMatrix,
  Workout,
} from "../db/types";
import { FOCUS_MODIFIERS, type FocusModifiers } from "../config/periodization";
import { effectiveMagnitude, isExpired } from "./deload";
import { foldExercise } from "./fold";
import { groupSessions, type ExerciseSession } from "./sessions";
import {
  mesocycleWeekIndex,
  resolveMesocycleWeek,
  weekStart,
} from "./mesocycle";
import { prescribeExercise, type ExercisePrescription } from "./prescription";

// ----------------------------------------------
// Engine service: the only layer that touches Dexie. It does NOT mutate engine
// state — it DERIVES it by folding logged history (engine/fold.ts) and memoizes
// the result in db.progressionStates, guarded by a content hash. A checkpoint
// whose inputs (sessions, matrix, confirmed recalibrations) still hash the same
// is returned as-is; otherwise it is recomputed and re-stored. State therefore
// can never drift from history — editing or deleting a past workout simply
// invalidates the hash and re-folds on the next derive.
// ----------------------------------------------

const effectiveMatrix = (exercise: Exercise | undefined): RpeMatrix =>
  exercise?.rpeMatrix ?? DEFAULT_RPE_MATRIX;

// djb2 over a compact projection of the fold inputs. Cheap and stable; only the
// fields the fold actually reads are included, so cosmetic changes don't bust
// the cache while any change to sets/config/matrix/recalibrations does.
function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function contentHash(
  sessions: ExerciseSession[],
  matrix: RpeMatrix,
  recals: Recalibration[],
): string {
  const projection = {
    s: sessions.map((session) => ({
      w: session.workoutId,
      c: session.config ?? null,
      k: session.sets.map((set) => [
        set.timestamp,
        set.targetReps,
        set.actualReps,
        set.targetWeight,
        set.actualWeight,
        set.targetRpe ?? null,
        set.actualRpe ?? null,
      ]),
    })),
    m: matrix,
    r: recals.map((rc) => [rc.workoutId, rc.e1rm]),
  };
  return hashString(JSON.stringify(projection));
}

/**
 * Derive an exercise's state from its checkpoint + the supplied fold inputs.
 * Returns the existing checkpoint unchanged on a cache hit (===), so callers can
 * skip the write; otherwise a freshly folded, hash-stamped state.
 */
function computeDerived(
  exerciseId: string,
  checkpoint: ProgressionState | undefined,
  workouts: Workout[],
  routinesById: Map<string, Routine>,
  matrix: RpeMatrix,
  recals: Recalibration[],
): ProgressionState {
  const sessions = groupSessions(workouts, routinesById, exerciseId);
  const hash = contentHash(sessions, matrix, recals);
  if (checkpoint && checkpoint.contentHash === hash) return checkpoint;

  const confirmed = new Map(recals.map((rc) => [rc.workoutId, rc.e1rm]));
  const { state } = foldExercise(exerciseId, sessions, matrix, confirmed);
  state.contentHash = hash;
  return state;
}

/**
 * The current derived state for one exercise, recomputing and re-memoizing the
 * checkpoint if its inputs changed. Safe to call anywhere a fresh scalar/streak
 * is needed (e.g. the in-workout calculator).
 */
export async function deriveState(
  exerciseId: string,
): Promise<ProgressionState> {
  const [checkpoint, workouts, routines, exercise, recals] = await Promise.all([
    db.progressionStates.get(exerciseId),
    db.workouts.toArray(),
    db.routines.toArray(),
    db.exercises.get(exerciseId),
    db.recalibrations.where("exerciseId").equals(exerciseId).toArray(),
  ]);
  const routinesById = new Map(routines.map((r) => [r.id, r]));
  const state = computeDerived(
    exerciseId,
    checkpoint,
    workouts,
    routinesById,
    effectiveMatrix(exercise),
    recals,
  );
  if (state !== checkpoint) await db.progressionStates.put(state);
  return state;
}

/** An active deload as it will shape the upcoming session. */
export interface ResetEffect {
  kind: "intensity" | "volume";
  multiplier: number; // effect on its axis this session (≤ 1)
  sessionsRemaining: number;
}

/** Everything that goes into one exercise's upcoming prescription. */
export interface ExercisePreview {
  exerciseId: string;
  name: string;
  config?: RoutineExerciseConfig;
  workingE1rm: number | null;
  failureStreak: number;
  currentTargetReps?: number;
  resetEffects: ResetEffect[];
  prescription: ExercisePrescription | null; // null without a config
}

export interface MesocyclePosition {
  weekIndex: number; // 0-based
  weekCount: number;
  focus: PeriodizationFocus;
  modifiers: FocusModifiers;
  workoutsThisWeek: number; // plan workouts logged in the current training week
}

export interface WorkoutPreview {
  routineId: string;
  routineName: string;
  mesocycle: MesocyclePosition | null;
  exercises: ExercisePreview[];
}

/** One exercise's proposed working-e1RM recalibration, pending user confirmation. */
export interface RecalibrationProposal {
  exerciseId: string;
  exerciseName: string;
  workoutId: string; // the session whose drift triggered the proposal
  currentE1rm: number; // working e1RM the session was prescribed from
  sessionE1rm: number; // peak honest e1RM the session demonstrated
  proposedE1rm: number; // where a confirmed recalibration moves the working e1RM
}

const deloadEffects = (state: ProgressionState): ResetEffect[] =>
  state.deload && !isExpired(state.deload)
    ? [
        {
          kind: "intensity",
          multiplier: 1 - effectiveMagnitude(state.deload),
          sessionsRemaining:
            state.deload.decaySessions - state.deload.sessionsElapsed,
        },
      ]
    : [];

/**
 * Assembles the full picture behind a routine's upcoming workout: per exercise
 * the base config, derived engine state (e1RM, streak, active deload) and the
 * resulting prescription, plus where the plan currently sits in its mesocycle.
 * Derives state through the memoized checkpoints (recomputing any that went
 * stale), but never advances state — previewing is logically read-only.
 */
export async function previewWorkout(
  routineId: string,
  at: number = Date.now(),
): Promise<WorkoutPreview | null> {
  const routine = await db.routines.get(routineId);
  if (!routine) return null;

  const [plans, workouts, routines, allRecals] = await Promise.all([
    db.plans.toArray(),
    db.workouts.toArray(),
    db.routines.toArray(),
    db.recalibrations.toArray(),
  ]);
  const routinesById = new Map(routines.map((r) => [r.id, r]));

  // The mesocycle week comes from the plan this routine belongs to — the active
  // plan wins when a routine is shared across plans.
  const owners = plans.filter((p) => p.routineIds.includes(routineId));
  const plan = owners.find((p) => p.active) ?? owners[0];
  const week = resolveMesocycleWeek(plan, at);
  const weekIndex = mesocycleWeekIndex(plan, at);

  let mesocycle: MesocyclePosition | null = null;
  if (plan && week && weekIndex !== null) {
    const start = weekStart(plan, at);
    const planRoutineIds = new Set(plan.routineIds);
    const inWeek = await db.workouts
      .where("startTime")
      .between(start, at + 1)
      .toArray();
    mesocycle = {
      weekIndex,
      weekCount: plan.mesocycle!.length,
      focus: week.focus,
      modifiers: FOCUS_MODIFIERS[week.focus],
      workoutsThisWeek: inWeek.filter((w) => planRoutineIds.has(w.routineId))
        .length,
    };
  }

  const exercises: ExercisePreview[] = [];
  for (const routineExercise of routine.exercises) {
    const exerciseId = routineExercise.exerciseId;
    const exercise = await db.exercises.get(exerciseId);
    if (!exercise) continue;

    const matrix = effectiveMatrix(exercise);
    const recals = allRecals.filter((rc) => rc.exerciseId === exerciseId);
    const checkpoint = await db.progressionStates.get(exerciseId);
    const state = computeDerived(
      exerciseId,
      checkpoint,
      workouts,
      routinesById,
      matrix,
      recals,
    );
    if (state !== checkpoint) await db.progressionStates.put(state);

    exercises.push({
      exerciseId,
      name: exercise.name,
      config: routineExercise.config,
      workingE1rm: state.e1rm,
      failureStreak: state.failureStreak,
      currentTargetReps: state.currentTargetReps,
      resetEffects: deloadEffects(state),
      // Without a progression config there is no model to prescribe from.
      prescription: routineExercise.config
        ? prescribeExercise({
            exerciseId,
            config: routineExercise.config,
            state,
            matrix,
            week,
          })
        : null,
    });
  }

  return { routineId, routineName: routine.name, mesocycle, exercises };
}

/**
 * Calculates the prescription for every configured exercise of a routine.
 * Read-only: prescribing a workout never advances engine state.
 */
export async function prescribeWorkout(
  routineId: string,
  at: number = Date.now(),
): Promise<ExercisePrescription[]> {
  const preview = await previewWorkout(routineId, at);
  return (preview?.exercises ?? [])
    .map((e) => e.prescription)
    .filter((p): p is ExercisePrescription => p !== null);
}

/** The distinct exercise ids logged in a workout. */
function loggedExerciseIds(workout: Workout): string[] {
  const ids = new Set<string>();
  for (const we of workout.exercises) {
    if (we.sets.length) ids.add(we.exerciseId);
  }
  return [...ids];
}

/**
 * Post-session pass, run once when a workout is finished: re-derives and
 * re-memoizes the checkpoint of every exercise the session touched (the new
 * workout is already persisted, so the fold now folds it in). Pure recompute —
 * no bespoke mutation, so it can never produce a state a full re-fold wouldn't.
 */
export async function applyWorkoutResults(workout: Workout): Promise<void> {
  const ids = loggedExerciseIds(workout);
  if (!ids.length) return;

  const [workouts, routines, allRecals] = await Promise.all([
    db.workouts.toArray(),
    db.routines.toArray(),
    db.recalibrations.toArray(),
  ]);
  const routinesById = new Map(routines.map((r) => [r.id, r]));

  for (const exerciseId of ids) {
    const [exercise, checkpoint] = await Promise.all([
      db.exercises.get(exerciseId),
      db.progressionStates.get(exerciseId),
    ]);
    const recals = allRecals.filter((rc) => rc.exerciseId === exerciseId);
    const state = computeDerived(
      exerciseId,
      checkpoint,
      workouts,
      routinesById,
      effectiveMatrix(exercise),
      recals,
    );
    if (state !== checkpoint) await db.progressionStates.put(state);
  }
}

/**
 * Recalibration proposals for a finished session: per exercise, the fold
 * surfaces when the e1RM the session demonstrated has drifted beyond tolerance
 * from the e1RM it was prescribed from. Read-only — proposals are confirmed via
 * applyRecalibrations. The workout MUST already be persisted (it is the session
 * the proposal is keyed to). Already-confirmed sessions yield no proposal.
 */
export async function computeRecalibrations(
  workout: Workout,
): Promise<RecalibrationProposal[]> {
  const ids = loggedExerciseIds(workout);
  if (!ids.length) return [];

  const [workouts, routines, allRecals] = await Promise.all([
    db.workouts.toArray(),
    db.routines.toArray(),
    db.recalibrations.toArray(),
  ]);
  const routinesById = new Map(routines.map((r) => [r.id, r]));

  const proposals: RecalibrationProposal[] = [];
  for (const exerciseId of ids) {
    const exercise = await db.exercises.get(exerciseId);
    if (!exercise) continue;
    const recals = allRecals.filter((rc) => rc.exerciseId === exerciseId);
    const sessions = groupSessions(workouts, routinesById, exerciseId);
    const confirmed = new Map(recals.map((rc) => [rc.workoutId, rc.e1rm]));
    const { proposals: byWorkout } = foldExercise(
      exerciseId,
      sessions,
      effectiveMatrix(exercise),
      confirmed,
    );
    const drift = byWorkout.get(workout.id);
    if (!drift) continue;
    proposals.push({
      exerciseId,
      exerciseName: exercise.name,
      workoutId: workout.id,
      currentE1rm: drift.from,
      sessionE1rm: drift.demonstrated,
      proposedE1rm: drift.to,
    });
  }
  return proposals;
}

/**
 * Records user-confirmed recalibrations as ground-truth facts and re-derives the
 * affected exercises so their checkpoints replay the snap. Because the snap is
 * persisted (not applied in place), it survives any later full recompute.
 */
export async function applyRecalibrations(
  proposals: RecalibrationProposal[],
): Promise<void> {
  if (!proposals.length) return;
  await db.transaction("rw", db.recalibrations, async () => {
    for (const p of proposals) {
      await db.recalibrations.put({
        exerciseId: p.exerciseId,
        workoutId: p.workoutId,
        e1rm: p.proposedE1rm,
      });
    }
  });
  const ids = [...new Set(proposals.map((p) => p.exerciseId))];
  for (const id of ids) await deriveState(id);
}
