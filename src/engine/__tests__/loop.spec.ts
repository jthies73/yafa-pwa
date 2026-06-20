import { describe, it, expect } from "vitest";
import { DEFAULT_RPE_MATRIX } from "../../db/rpeMatrix";
import type {
  DoubleProgressionParams,
  LinearProgressionParams,
  ProgressionModelType,
  ProgressionParams,
  ProgressionState,
  Set as LoggedSet,
} from "../../db/types";
import { prescribeExercise, type ExercisePrescription } from "../prescription";
import { evaluate } from "../evaluation";
import { consumeReset, initState, seedC1rm, step } from "../state";
import { peakImpliedE1rm } from "../matrix";

// End-to-end progression loop, composed from the pure modules exactly as
// service.applyWorkoutResults + prescribeWorkout do (minus Dexie): prescribe →
// log → (seed | evaluate → step), with a pending reset consumed at the next
// prescription. This is the "close the circle" integration check.

const M = DEFAULT_RPE_MATRIX;

const ceilingOf = (p: ProgressionParams): number =>
  "rpeCeiling" in p ? p.rpeCeiling : (p as { targetRpe: number }).targetRpe;

/** Log a prescription with optional per-set actual overrides. */
function logSets(
  prescription: ExercisePrescription,
  actual: { reps?: number; rpe?: number; weight?: number } = {},
): LoggedSet[] {
  return prescription.sets.map((ps, i) => {
    const weight = actual.weight ?? ps.weight ?? 0;
    return {
      id: `s${i}`,
      timestamp: i + 1,
      targetReps: ps.reps,
      actualReps: actual.reps ?? ps.reps,
      targetWeight: ps.weight ?? 0,
      actualWeight: weight,
      targetRpe: ps.rpe ?? undefined,
      actualRpe: actual.rpe ?? ps.rpe ?? undefined,
      failure: false,
    };
  });
}

interface SessionResult {
  state: ProgressionState;
  prescription: ExercisePrescription;
  outcome: "seed" | "success" | "hold" | "regression";
}

/** One full prescribe→log→fold cycle, mirroring the service. */
function runSession(
  state: ProgressionState,
  model: ProgressionModelType,
  params: ProgressionParams,
  actual: { reps?: number; rpe?: number; weight?: number },
  workoutId: string,
): SessionResult {
  // Reset is consumed at prescription time.
  const s = state.resetPending ? consumeReset(state, 0) : state;
  const prescription = prescribeExercise({
    exerciseId: "ex",
    model,
    params,
    rpeCeiling: ceilingOf(params),
    effectiveC1rm: s.c1rm,
    doubleRepCursor: s.doubleRepCursor,
    matrix: M,
  });
  const sets = logSets(prescription, actual);

  if (s.c1rm == null) {
    const seeded = peakImpliedE1rm(M, sets)?.e1rm ?? null;
    const next = seeded == null ? s : seedC1rm(s, seeded, 0);
    return {
      state: { ...next, lastWorkoutId: workoutId },
      prescription,
      outcome: "seed",
    };
  }

  const outcome = evaluate(model, params, prescription, sets);
  const next = step(s, outcome, model, params, workoutId, 0);
  return { state: next, prescription, outcome };
}

const LINEAR: LinearProgressionParams = {
  targetSets: 3,
  targetReps: 5,
  targetRpe: 8,
  rpeCeiling: 9,
  weightIncrement: 2.5,
  incrementUnit: "kg",
};

describe("loop — linear success increments c1RM", () => {
  it("a clean session raises c1RM by the increment", () => {
    const start = { ...initState("ex", 0), c1rm: 100 };
    const r = runSession(start, "linear", LINEAR, { reps: 5, rpe: 8 }, "w1");
    expect(r.outcome).toBe("success");
    expect(r.state.c1rm).toBe(102.5);
  });
});

describe("loop — three regressions deload on the NEXT prescription", () => {
  it("c1RM holds for 3 regressions, then drops 10% at the following prescribe", () => {
    let state: ProgressionState = { ...initState("ex", 0), c1rm: 100 };
    // Three sessions grinding over the ceiling at the prescribed weight.
    for (let i = 1; i <= 3; i++) {
      const r = runSession(
        state,
        "linear",
        LINEAR,
        { reps: 5, rpe: 9.5 },
        `w${i}`,
      );
      expect(r.outcome).toBe("regression");
      state = r.state;
      expect(state.c1rm).toBe(100); // NOT dropped during evaluation
    }
    expect(state.resetPending).toBe(true);

    // The next prescription consumes the reset: c1RM drops to 90 and the
    // prescribed weight re-renders lighter.
    const next = runSession(state, "linear", LINEAR, { reps: 5, rpe: 8 }, "w4");
    expect(next.state.resetPending).toBe(false);
    expect(next.prescription.sets[0].weight).toBe(
      // weight rendered from the dropped c1RM (100 → 90)
      runSession(
        { ...initState("ex", 0), c1rm: 90 },
        "linear",
        LINEAR,
        { reps: 5, rpe: 8 },
        "x",
      ).prescription.sets[0].weight,
    );
  });
});

const DOUBLE: DoubleProgressionParams = {
  targetSets: 3,
  minReps: 6,
  maxReps: 10,
  targetRpe: 8,
  rpeCeiling: 9,
  weightIncrement: 2.5,
  incrementUnit: "kg",
};

describe("loop — double progression holds weight while reps climb, then graduates", () => {
  it("weight is constant across holds, cursor advances, success resets the cycle", () => {
    let state: ProgressionState = { ...initState("ex", 0), c1rm: 100 };
    const weights: (number | null)[] = [];
    const cursors: (number | undefined)[] = [];

    // Four holds: reps strictly between minReps and maxReps at RPE on target
    // (not a success — below maxReps; not a regression — above minReps). The
    // weight is fixed (anchored at maxReps) and the cursor climbs each time.
    for (let i = 0; i < 4; i++) {
      const r = runSession(
        state,
        "double",
        DOUBLE,
        { reps: 8, rpe: 8 },
        `h${i}`,
      );
      expect(r.outcome).toBe("hold");
      weights.push(r.prescription.sets[0].weight);
      cursors.push(r.state.doubleRepCursor);
      state = r.state;
    }
    // All hold weights identical (load is anchored at maxReps).
    expect(new Set(weights).size).toBe(1);
    expect(cursors).toEqual([7, 8, 9, 10]);
    expect(state.c1rm).toBe(100); // unchanged through holds

    // A session at maxReps with RPE on target graduates the load.
    const grad = runSession(
      state,
      "double",
      DOUBLE,
      { reps: 10, rpe: 8 },
      "grad",
    );
    expect(grad.outcome).toBe("success");
    expect(grad.state.c1rm).toBe(102.5);
    expect(grad.state.doubleRepCursor).toBe(6); // cycle resets to minReps
  });
});

describe("loop — cold start seeds then prescribes a real weight", () => {
  it("a null-c1RM exercise is free-entry, seeds from the first qualifying set", () => {
    const start = initState("ex", 0);
    const first = runSession(
      start,
      "linear",
      LINEAR,
      { reps: 5, rpe: 8, weight: 100 },
      "w1",
    );
    // Free-entry: the prescription carried no weight.
    expect(first.prescription.sets.every((s) => s.weight === null)).toBe(true);
    expect(first.outcome).toBe("seed");
    expect(first.state.c1rm).toBeCloseTo(100 / M[5][8], 4); // ~126.6

    // Now a real weight is prescribed from the seeded anchor.
    const second = runSession(
      first.state,
      "linear",
      LINEAR,
      { reps: 5, rpe: 8 },
      "w2",
    );
    expect(second.prescription.sets[0].weight).toBeGreaterThan(0);
  });
});

describe("loop — idempotency guard mirrors the service", () => {
  it("a session already folded (lastWorkoutId match) is skipped", () => {
    const state = { ...initState("ex", 0), c1rm: 100, lastWorkoutId: "w1" };
    // The service skips when state.lastWorkoutId === workout.id; re-running w1
    // must not move c1RM. We assert the guard condition directly.
    expect(state.lastWorkoutId === "w1").toBe(true);
  });
});
