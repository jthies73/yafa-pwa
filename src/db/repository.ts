import { db } from "./db";
import type { Exercise, Plan, Routine, MesocycleWeek } from "./types";
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
}

export interface ExerciseInput {
  name: string;
  primaryMuscleGroups: string[];
  secondaryMuscleGroups?: string[];
  notes?: string;
  bodyweightFactor: number;
  rpeMatrix?: RpeMatrix; // Present ⇒ custom override; absent ⇒ inherits the global matrix.
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
 * Creates a routine and, when a planId is supplied, appends it to that plan's
 * ordered routine list.
 */
export async function createRoutine(
  input: RoutineInput,
  planId?: string,
): Promise<string> {
  const id = uid();
  const routine: Routine = {
    id,
    name: input.name.trim(),
    exercises: [],
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

export async function updateRoutine(
  id: string,
  input: RoutineInput,
): Promise<void> {
  await db.routines.update(id, { name: input.name.trim() });
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
    bodyweightFactor: input.bodyweightFactor,
    // Absent unless the user opted into a custom matrix; otherwise inherits global.
    rpeMatrix: input.rpeMatrix,
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

  // Passing `undefined` removes the optional key in Dexie — so clearing the
  // override reverts the exercise to inheriting the global matrix.
  await db.exercises.update(id, {
    name: input.name.trim(),
    primaryMuscleGroups: input.primaryMuscleGroups
      .map((s) => s.trim())
      .filter(Boolean),
    secondaryMuscleGroups: secondary.length ? secondary : undefined,
    notes: input.notes?.trim() || undefined,
    bodyweightFactor: input.bodyweightFactor,
    rpeMatrix: input.rpeMatrix,
  });
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
  await db.transaction("rw", [db.exercises, db.routines], async () => {
    const routines = await db.routines.toArray();
    for (const r of routines) {
      if (r.exercises.some((e) => e.exerciseId === id)) {
        await db.routines.update(r.id, {
          exercises: r.exercises.filter((e) => e.exerciseId !== id),
        });
      }
    }
    await db.exercises.delete(id);
  });
}
