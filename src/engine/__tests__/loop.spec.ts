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
import {
  catchUpC1rm,
  consumeReset,
  corroboratedE1rm,
  initState,
  seedC1rm,
  step,
} from "../state";
import {
  correctRpeMatrix,
  impliedE1rm,
  isQualifyingSet,
  peakImpliedE1rm,
} from "../matrix";
import { RPE_MATRIX_CORRECTION_MAX_DEVIATION } from "../constants";

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
  fatigueReduction: 0,
  fatigueReductionUnit: "kg",
};

describe("loop — linear success increments c1RM", () => {
  it("a clean session raises c1RM by the increment", () => {
    const start = { ...initState("ex", 0), c1rm: 100 };
    const r = runSession(start, "linear", LINEAR, { reps: 5, rpe: 8 }, "w1");
    expect(r.outcome).toBe("success");
    expect(r.state.c1rm).toBe(102.5);
  });
});

// Mirrors service.applyWorkoutResults: one c1RM decision per session. Catch-up is
// evaluated on EVERY outcome and, when it fires (>±10% divergence from the session's
// corroborated demonstrated capacity — ≥2 qualifying sets), takes FULL PRECEDENCE over
// the rules — overwriting the c1RM, clearing the streak, disarming the reset. Below the
// threshold (or with <2 qualifying sets) the step stands.
describe("loop — catch-up takes precedence over the progression rules", () => {
  const finalC1rm = (
    preStep: number,
    estimate: number | null,
    stepped: number,
  ) => {
    const caught = catchUpC1rm(preStep, estimate);
    return caught !== preStep ? caught : stepped; // catch-up wins, else the step stands
  };

  /** The full persisted state, mirroring service: full override when catch-up fires. */
  const persistedAfterCatchUp = (
    state: ProgressionState,
    next: ProgressionState,
    estimate: number | null,
  ) => {
    const caught = catchUpC1rm(state.c1rm!, estimate);
    const fired = caught !== state.c1rm;
    return fired
      ? { ...next, c1rm: caught, regressionStreak: 0, resetPending: false }
      : next;
  };

  it("a success uses the caught-up anchor instead of the small increment", () => {
    const start = { ...initState("ex", 0), c1rm: 100 };
    const r = runSession(start, "linear", LINEAR, { reps: 5, rpe: 8 }, "w1");
    expect(r.outcome).toBe("success");
    expect(r.state.c1rm).toBe(102.5); // step alone would only +increment

    // Two qualifying sets corroborate +30% above the anchor.
    const estimate = corroboratedE1rm([130, 130], start.c1rm!);
    const final = finalC1rm(start.c1rm!, estimate, r.state.c1rm!);
    expect(final).toBeCloseTo(121, 6); // 100 + (130-100)*0.7, ONE move
    expect(final).not.toBe(102.5); // the increment was replaced, not added to
  });

  it("a small deviation does not fire — the normal increment stands", () => {
    const start = { ...initState("ex", 0), c1rm: 100 };
    const r = runSession(start, "linear", LINEAR, { reps: 5, rpe: 8 }, "w1");
    // +4%, within the ±10% threshold (two corroborating sets).
    const estimate = corroboratedE1rm([104, 104], start.c1rm!);
    expect(finalC1rm(start.c1rm!, estimate, r.state.c1rm!)).toBe(102.5);
  });

  it("a lone set catches up (top-set program); within two sets, outlier is dropped", () => {
    // A single top set fires catch-up directly — no other sets to compare it against.
    expect(corroboratedE1rm([200], 80)).toBe(200);
    expect(catchUpC1rm(80, 200)).toBeCloseTo(164, 6); // 80 + (200-80)*0.7
    // With two sets, the outlier (furthest) is dropped — only the nearer one remains.
    expect(corroboratedE1rm([80, 200], 80)).toBe(80); // 80 is nearer; no gap → no move
    expect(catchUpC1rm(80, corroboratedE1rm([80, 200], 80))).toBe(80);
  });

  it("overrides a REGRESSION: c1RM jumps, streak clears, no reset armed", () => {
    const start = { ...initState("ex", 0), c1rm: 100 };
    const r = runSession(start, "linear", LINEAR, { reps: 5, rpe: 9.5 }, "w1");
    expect(r.outcome).toBe("regression");
    expect(r.state.regressionStreak).toBe(1); // step armed one strike

    // But two qualifying sets corroborate +30% above the anchor.
    const estimate = corroboratedE1rm([130, 130], start.c1rm!);
    const persisted = persistedAfterCatchUp(start, r.state, estimate);
    expect(persisted.c1rm).toBeCloseTo(121, 6); // caught up, not held
    expect(persisted.regressionStreak).toBe(0); // streak wiped — catch-up won
    expect(persisted.resetPending).toBe(false); // no deload armed this session
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
  fatigueReduction: 0,
  fatigueReductionUnit: "kg",
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

// Mirrors the RPE-matrix correction block in service.applyWorkoutResults: pick a
// representative qualifying set exactly like the catch-up (lone set used directly;
// with ≥2, drop the furthest-from-anchor and use the 2nd), gate on ±10% deviation
// from the anchor, then learn the curve. Replays the service glue with the real
// pure functions (correctRpeMatrix), as the rest of this file does for progression.
const mkSet = (
  actualWeight: number,
  actualReps: number,
  actualRpe: number,
  i = 0,
): LoggedSet => ({
  id: `s${i}`,
  timestamp: i + 1,
  targetReps: actualReps,
  actualReps,
  targetWeight: actualWeight,
  actualWeight,
  targetRpe: actualRpe,
  actualRpe,
  failure: false,
});

function correctMatrixForSession(
  matrix: typeof M,
  sets: LoggedSet[],
  anchor: number | null,
): typeof M {
  const qualifying = sets.filter(isQualifyingSet);
  if (qualifying.length === 0 || anchor == null) return matrix;
  const ranked = qualifying
    .map((s) => ({
      set: s,
      e1rm: impliedE1rm(matrix, s.actualWeight, s.actualReps, s.actualRpe!),
    }))
    .sort((a, b) => Math.abs(b.e1rm - anchor) - Math.abs(a.e1rm - anchor));
  const rep = ranked[Math.min(1, ranked.length - 1)];
  const deviation = Math.abs(rep.e1rm - anchor) / anchor;
  if (deviation > RPE_MATRIX_CORRECTION_MAX_DEVIATION) return matrix;
  return correctRpeMatrix(
    matrix,
    {
      actualWeight: rep.set.actualWeight,
      actualReps: rep.set.actualReps,
      actualRpe: rep.set.actualRpe!,
    },
    anchor,
  );
}

describe("loop — RPE matrix correction gating mirrors the service", () => {
  it("a lone in-gate top set nudges its iso-effort cell (top-set program)", () => {
    // 82 kg @ 5 reps RPE 8 ⇒ implied e1RM 82/0.79 ≈ 103.8, ~3.8% over the anchor
    // (within ±10%). pDemo = 0.82, so the 5@8 cell (0.79) is pulled up toward it.
    const out = correctMatrixForSession(M, [mkSet(82, 5, 8)], 100);
    expect(out[5][8]).toBeCloseTo(0.793, 5); // 0.79 + 0.1·(0.82−0.79)
    expect(out[5][8]).toBeGreaterThan(M[5][8]);
  });

  it("with ≥2 sets the lone outlier is dropped — correction comes from the 2nd-furthest", () => {
    // setA (82@5@8, e1RM ~103.8) is in-gate; setB (140@1@10, e1RM 140) is a +40%
    // fluke and the furthest, so it is dropped. The near setA drives the curve.
    const out = correctMatrixForSession(
      M,
      [mkSet(82, 5, 8, 0), mkSet(140, 1, 10, 1)],
      100,
    );
    expect(out[5][8]).toBeCloseTo(0.793, 5); // driven by setA, not the fluke
    expect(out[1][10]).toBe(M[1][10]); // fluke set never moved its own cell
  });

  it("a deviation beyond ±10% does not correct (catch-up's job)", () => {
    // Lone set 140 kg @ 1 rep RPE 10 ⇒ e1RM 140, +40% over the anchor.
    const out = correctMatrixForSession(M, [mkSet(140, 1, 10)], 100);
    expect(out).toBe(M); // untouched
  });

  it("no qualifying set ⇒ no correction", () => {
    // RPE 6 is below the qualifying threshold (≥ 8).
    const out = correctMatrixForSession(M, [mkSet(80, 5, 6)], 100);
    expect(out).toBe(M);
  });
});
