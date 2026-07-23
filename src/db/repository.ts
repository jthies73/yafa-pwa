import { db } from "./db";
import { currentBodyweight } from "./measurements";
import { bodyweightShiftKg } from "../engine/bodyweight";
import type {
  Exercise,
  Plan,
  Routine,
  RoutineExercise,
  RoutineExerciseConfig,
  MesocycleWeek,
  Workout,
  ProgressionState,
} from "./types";
import type { RpeMatrix } from "./types"; // used by ExerciseInput

// ----------------------------------------------
// Centralised create / update / delete operations.
// Keeping these in one place guarantees consistent ID generation, timestamps,
// and — crucially — cascade behaviour so the database never accumulates orphaned
// references (e.g. a plan pointing at a deleted routine, or a routine pointing at
// a deleted exercise).
// ----------------------------------------------

function uid(): string {
  return crypto.randomUUID();
}

// ---- Input shapes (the editable surface of each entity) ----

export interface PlanInput {
  name: string;
  description?: string;
  active?: boolean;
}

export interface RoutineInput {
  name: string;
  weeklyTarget?: number;
  exercises?: RoutineExercise[];
}

export interface ExerciseInput {
  name: string;
  primaryMuscleGroups: string[];
  secondaryMuscleGroups?: string[];
  notes?: string;
  rpeMatrix?: RpeMatrix; // Present ⇒ custom override; absent ⇒ inherits the global matrix.
  bodyweightFactor?: number; // 0..1 fraction of bodyweight the movement lifts; absent ⇒ 0
}

// ---- Plans ----

export async function createPlan(input: PlanInput): Promise<string> {
  const id = uid();
  const plan: Plan = {
    id,
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    routineIds: [],
    active: input.active ?? false,
    created_at: Date.now(),
  };

  await db.transaction("rw", db.plans, async () => {
    if (plan.active) {
      // Only one plan may be active at a time.
      const all = await db.plans.toArray();
      for (const p of all) {
        if (p.active) await db.plans.update(p.id, { active: false });
      }
    }
    await db.plans.add(plan);
  });

  return id;
}

export async function updatePlan(id: string, input: PlanInput): Promise<void> {
  await db.plans.update(id, {
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
  });
}

/**
 * Persists a plan's mesocycle (periodization weeks). Kept separate from
 * `updatePlan` so the name/description form contract stays untouched. An empty
 * list clears the field entirely, reverting the plan to "no periodization".
 */
export async function setPlanMesocycle(
  id: string,
  weeks: MesocycleWeek[],
): Promise<void> {
  // Strip Vue/Dexie proxies to plain objects before persisting (same reason as
  // toPlainConfig for routine exercises).
  const mesocycle: MesocycleWeek[] = weeks.map((w) => ({ focus: w.focus }));
  await db.plans.update(id, {
    mesocycle: mesocycle.length ? mesocycle : undefined,
  });
}

/**
 * Persists a plan's mesocycle week override (manual "current week" adjustment).
 * Passing `undefined` clears any existing override, reverting to calendar-based math.
 */
export async function setPlanWeekOverride(
  id: string,
  override: Plan["mesocycleWeekOverride"] | undefined,
): Promise<void> {
  await db.plans.update(id, {
    mesocycleWeekOverride: override,
  });
}

export async function setPlanActive(
  id: string,
  active: boolean,
): Promise<void> {
  await db.transaction("rw", db.plans, async () => {
    if (active) {
      const all = await db.plans.toArray();
      for (const p of all) {
        await db.plans.update(p.id, { active: p.id === id });
      }
    } else {
      await db.plans.update(id, { active: false });
    }
  });
}

/**
 * Deletes a plan. Any routine referenced *only* by this plan is removed too, so
 * routines never become orphaned (they are only reachable via a parent plan).
 * Routines shared with another plan are preserved.
 */
export async function deletePlan(id: string): Promise<void> {
  await db.transaction("rw", [db.plans, db.routines], async () => {
    const plan = await db.plans.get(id);
    if (!plan) return;

    const otherPlans = (await db.plans.toArray()).filter((p) => p.id !== id);
    const referencedElsewhere = new Set<string>();
    for (const p of otherPlans) {
      for (const rid of p.routineIds) referencedElsewhere.add(rid);
    }

    const orphanRoutineIds = plan.routineIds.filter(
      (rid) => !referencedElsewhere.has(rid),
    );
    if (orphanRoutineIds.length) await db.routines.bulkDelete(orphanRoutineIds);

    await db.plans.delete(id);
  });
}

// ---- Routines ----

/**
 * Flattens a routine exercise slot to plain objects before persisting — IndexedDB's
 * structured clone rejects Vue/Dexie proxies. Mirrors toPlainConfig in
 * RoutineDetailsPage: only progressionModel, progressionParams, and lockedFields
 * are stored (the other RoutineExerciseConfig fields are vestigial).
 */
function toPlainRoutineExercise(ex: RoutineExercise): RoutineExercise {
  const cfg = ex.config;
  const plainConfig: RoutineExerciseConfig | undefined = cfg
    ? {
        progressionModel: cfg.progressionModel,
        progressionParams: { ...cfg.progressionParams },
        ...(cfg.lockedFields?.length
          ? { lockedFields: [...cfg.lockedFields] }
          : {}),
      }
    : undefined;
  return { exerciseId: ex.exerciseId, config: plainConfig };
}

/**
 * Creates a routine and, when a planId is supplied, appends it to that plan's
 * ordered routine list. Exercise slots (if provided) are stripped to plain objects.
 */
export async function createRoutine(
  input: RoutineInput,
  planId?: string,
): Promise<string> {
  const id = uid();
  const routine: Routine = {
    id,
    name: input.name.trim(),
    exercises: (input.exercises ?? []).map(toPlainRoutineExercise),
    weeklyTarget: input.weeklyTarget,
    created_at: Date.now(),
  };

  await db.transaction("rw", [db.routines, db.plans], async () => {
    await db.routines.add(routine);
    if (planId) {
      const plan = await db.plans.get(planId);
      if (plan && !plan.routineIds.includes(id)) {
        await db.plans.update(planId, {
          routineIds: [...plan.routineIds, id],
        });
      }
    }
  });

  return id;
}

/**
 * Creates a brand-new plan and a routine inside it, in a single transaction so a
 * failure never leaves an empty plan. Honors the single-active-plan invariant
 * (same as createPlan) when the new plan is set active.
 */
export async function createRoutineInNewPlan(
  routine: RoutineInput,
  plan: PlanInput,
): Promise<{ planId: string; routineId: string }> {
  const planId = uid();
  const routineId = uid();
  const now = Date.now();

  const routineDoc: Routine = {
    id: routineId,
    name: routine.name.trim(),
    exercises: (routine.exercises ?? []).map(toPlainRoutineExercise),
    weeklyTarget: routine.weeklyTarget,
    created_at: now,
  };
  const planDoc: Plan = {
    id: planId,
    name: plan.name.trim(),
    description: plan.description?.trim() || undefined,
    routineIds: [routineId],
    active: plan.active ?? false,
    created_at: now,
  };

  await db.transaction("rw", [db.plans, db.routines], async () => {
    if (planDoc.active) {
      const all = await db.plans.toArray();
      for (const p of all) {
        if (p.active) await db.plans.update(p.id, { active: false });
      }
    }
    await db.routines.add(routineDoc);
    await db.plans.add(planDoc);
  });

  return { planId, routineId };
}

export async function updateRoutine(
  id: string,
  input: RoutineInput,
): Promise<void> {
  await db.routines.update(id, {
    name: input.name.trim(),
    weeklyTarget: input.weeklyTarget,
  });
}

/**
 * Deletes a routine and strips its id from every plan that references it.
 */
export async function deleteRoutine(id: string): Promise<void> {
  await db.transaction("rw", [db.routines, db.plans], async () => {
    const plans = await db.plans.toArray();
    for (const p of plans) {
      if (p.routineIds.includes(id)) {
        await db.plans.update(p.id, {
          routineIds: p.routineIds.filter((rid) => rid !== id),
        });
      }
    }
    await db.routines.delete(id);
  });
}

// ---- Exercises ----

export async function createExercise(input: ExerciseInput): Promise<string> {
  const id = uid();
  const secondary = (input.secondaryMuscleGroups ?? [])
    .map((s) => s.trim())
    .filter(Boolean);

  const exercise: Exercise = {
    id,
    name: input.name.trim(),
    primaryMuscleGroups: input.primaryMuscleGroups
      .map((s) => s.trim())
      .filter(Boolean),
    secondaryMuscleGroups: secondary.length ? secondary : undefined,
    notes: input.notes?.trim() || undefined,
    // Absent unless the user opted into a custom matrix; otherwise inherits global.
    rpeMatrix: input.rpeMatrix,
    bodyweightFactor: input.bodyweightFactor ?? 0,
    created_at: Date.now(),
  };

  await db.exercises.add(exercise);
  return id;
}

export async function updateExercise(
  id: string,
  input: ExerciseInput,
): Promise<void> {
  const secondary = (input.secondaryMuscleGroups ?? [])
    .map((s) => s.trim())
    .filter(Boolean);

  // A bodyweightFactor change re-bases the (total-load) c1RM anchor: shifting
  // it by (new − old) × current bodyweight keeps the estimated total capacity
  // consistent, so prescribed ADDED weights stay continuous (exact at the 1RM
  // point; matrix-scaled targets shift by at most Δfactor × bw × (1 − pct),
  // which the next session's catch-up absorbs). Path-dependent state (streaks,
  // resets) is untouched. Bodyweight is read before the transaction (tx scope).
  const before = await db.exercises.get(id);
  const oldFactor = before?.bodyweightFactor ?? 0;
  const newFactor = input.bodyweightFactor ?? 0;
  const shift =
    newFactor !== oldFactor
      ? bodyweightShiftKg(oldFactor, newFactor, await currentBodyweight())
      : 0;

  await db.transaction("rw", [db.exercises, db.progressionStates], async () => {
    // Passing `undefined` removes the optional key in Dexie — so clearing the
    // override reverts the exercise to inheriting the global matrix.
    await db.exercises.update(id, {
      name: input.name.trim(),
      primaryMuscleGroups: input.primaryMuscleGroups
        .map((s) => s.trim())
        .filter(Boolean),
      secondaryMuscleGroups: secondary.length ? secondary : undefined,
      notes: input.notes?.trim() || undefined,
      rpeMatrix: input.rpeMatrix,
      bodyweightFactor: newFactor,
    });
    if (shift !== 0) {
      const state = await db.progressionStates.get(id);
      if (state?.c1rm != null) {
        await db.progressionStates.put({
          ...state,
          c1rm: state.c1rm + shift,
          updated_at: Date.now(),
        });
      }
    }
  });
}

/**
 * Update only the global note, leaving every other exercise field untouched.
 * Used by the routine config sheet and the in-workout notes editor — both of which
 * must not rewrite name/muscles/matrix the way updateExercise does.
 */
export async function updateExerciseNotes(
  id: string,
  notes: string | undefined,
): Promise<void> {
  await db.exercises.update(id, { notes: notes?.trim() || undefined });
}

/**
 * Counts how many routine slots currently reference this exercise. Used to warn
 * the user before deletion (an exercise may appear multiple times in a routine).
 */
export async function countExerciseUsage(id: string): Promise<number> {
  const routines = await db.routines.toArray();
  return routines.reduce(
    (acc, r) => acc + r.exercises.filter((e) => e.exerciseId === id).length,
    0,
  );
}

/**
 * Deletes an exercise and removes every reference to it from all routines.
 */
export async function deleteExercise(id: string): Promise<void> {
  await db.transaction(
    "rw",
    [db.exercises, db.routines, db.progressionStates],
    async () => {
      const routines = await db.routines.toArray();
      for (const r of routines) {
        if (r.exercises.some((e) => e.exerciseId === id)) {
          await db.routines.update(r.id, {
            exercises: r.exercises.filter((e) => e.exerciseId !== id),
          });
        }
      }
      // The progression state is a pure orphan once the exercise is gone (a
      // re-created exercise gets a fresh UUID and seeds anew).
      await db.progressionStates.delete(id);
      await db.exercises.delete(id);
    },
  );
}

// ---- Workouts ----

/** Completed workouts, newest first (indexed on startTime). */
export async function getWorkouts(): Promise<Workout[]> {
  return db.workouts.orderBy("startTime").reverse().toArray();
}

/** Removes a logged session. Nothing references a workout, so no cascade. */
export async function deleteWorkout(id: string): Promise<void> {
  await db.workouts.delete(id);
}

// ---- Progression state ----
//
// One row per exercise holding the c1RM anchor and progression bookkeeping. The
// engine service reads/writes these; the helpers here keep the default-row shape
// in one place so reads never have to special-case a never-trained exercise.

/** A blank progression row for an exercise that has never been trained. */
export function freshProgressionState(exerciseId: string): ProgressionState {
  return {
    exerciseId,
    c1rm: null,
    regressionStreak: 0,
    resetPending: false,
    lastWorkoutId: null,
    updated_at: Date.now(),
  };
}

/**
 * The stored state for an exercise, or a fresh default if none exists yet. Pure
 * read — it never persists the default (callers persist explicitly when they
 * actually change something).
 */
export async function getProgressionState(
  exerciseId: string,
): Promise<ProgressionState> {
  return (
    (await db.progressionStates.get(exerciseId)) ??
    freshProgressionState(exerciseId)
  );
}

export async function getAllProgressionStates(): Promise<ProgressionState[]> {
  return db.progressionStates.toArray();
}

/** Persist a progression row, stamping updated_at. */
export async function putProgressionState(
  state: ProgressionState,
): Promise<void> {
  await db.progressionStates.put({ ...state, updated_at: Date.now() });
}
