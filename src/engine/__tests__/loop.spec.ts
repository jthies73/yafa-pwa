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
import { liftSets } from "../bodyweight";
import { demonstratedSets, foldSession, learnedRpeMatrix } from "../fold";
import { effectiveConfig, type MesoModifiers } from "../mesocycle";
import { consumeReset, initState } from "../state";
import { impliedE1rm, matrixPct, roundToLoadable, seedE1rm } from "../matrix";

// End-to-end progression loop: prescribe → log → fold → prescribe, driven through
// the SAME seams the service drives — `effectiveConfig` for the week's config,
// `demonstratedSets` + `foldSession` for the per-session decision, `seedE1rm` for
// cold start, `consumeReset` at prescription time. Nothing here re-implements the
// orchestration: `evaluate`, `step` and the catch-up all run inside `foldSession`,
// so a change to how they compose shows up here instead of being mirrored twice.
// This is the "close the circle" integration check.

const M = DEFAULT_RPE_MATRIX;
const NO_MODS: MesoModifiers = { rpeDelta: 0, repDelta: 0 };

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
  /** The reason the fold reports — "seed" for the cold-start path. */
  reason: "seed" | "increment" | "hold" | "regression" | "recalibrate";
}

/** One full prescribe→log→fold cycle, mirroring service.foldExercise. */
function runSession(
  state: ProgressionState,
  model: ProgressionModelType,
  params: ProgressionParams,
  actual: { reps?: number; rpe?: number; weight?: number },
  workoutId: string,
  offsetKg = 0,
): SessionResult {
  // Reset is consumed at prescription time, before anything is rendered.
  const s = state.resetPending ? consumeReset(state, 0) : state;
  const eff = effectiveConfig(
    { progressionModel: model, progressionParams: params },
    NO_MODS,
  );
  const prescription = prescribeExercise({
    exerciseId: "ex",
    model: eff.model,
    params: eff.params,
    rpeCeiling: eff.ceiling,
    effectiveC1rm: s.c1rm,
    doubleRepCursor: s.doubleRepCursor,
    matrix: M,
    bodyweightOffsetKg: offsetKg,
  });
  const sets = logSets(prescription, actual);

  // Cold start seeds in TOTAL space and stops — no progression on the first session.
  if (s.c1rm == null) {
    const seeded = seedE1rm(M, liftSets(sets, offsetKg));
    return {
      state: { ...s, c1rm: seeded, lastWorkoutId: workoutId },
      prescription,
      reason: "seed",
    };
  }

  const { persisted, reason } = foldSession({
    state: s,
    eff,
    prescription,
    sets,
    demonstrated: demonstratedSets(M, sets, offsetKg, prescription),
    workoutId,
    finishedAt: 0,
  });
  return { state: persisted, prescription, reason };
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
  it("a clean session at the prescribed numbers raises c1RM by the increment", () => {
    const start = { ...initState("ex", 0), c1rm: 100 };
    const r = runSession(start, "linear", LINEAR, { reps: 5, rpe: 8 }, "w1");
    expect(r.reason).toBe("increment");
    expect(r.state.c1rm).toBe(102.5);
  });
});

// One c1RM move per session. Catch-up is weighed on EVERY outcome and, when the
// session's demonstrated capacity diverges past ±10% from the anchor, takes FULL
// PRECEDENCE over the rules — overwriting the c1RM, clearing the streak, disarming
// the reset. Below the threshold the deterministic step stands.
//
// Every case here is a session that can actually be logged: the divergence comes
// from what was performed at the prescribed weight, never from an injected estimate.
describe("loop — catch-up takes precedence over the progression rules", () => {
  it("a success far above the rep target catches up instead of taking the increment", () => {
    const start = { ...initState("ex", 0), c1rm: 100 };
    // Same prescribed weight, double the target reps at target RPE: still a
    // success by the rules, but it demonstrates ~+20% over the anchor.
    const r = runSession(start, "linear", LINEAR, { reps: 10, rpe: 8 }, "w1");
    const W = r.prescription.sets[0].weight!;
    const demonstrated = W / matrixPct(M, 10, 8);

    expect(r.reason).toBe("recalibrate");
    expect(r.state.c1rm).toBeCloseTo(100 + (demonstrated - 100) * 0.7, 6);
    expect(r.state.c1rm).not.toBe(102.5); // the increment was replaced, not added to
  });

  it("a modest overshoot stays inside the threshold — the increment stands", () => {
    const start = { ...initState("ex", 0), c1rm: 100 };
    // One rep over target: ~+4%, within ±10%.
    const r = runSession(start, "linear", LINEAR, { reps: 6, rpe: 8 }, "w1");
    expect(r.reason).toBe("increment");
    expect(r.state.c1rm).toBe(102.5);
  });

  it("overrides a REGRESSION downward: c1RM drops, streak clears, no reset armed", () => {
    const start = { ...initState("ex", 0), c1rm: 100 };
    // Bottomed out well under the rep target at RPE 10, at the prescribed
    // weight: a regression by the rules, and it demonstrates ~−14%.
    const r = runSession(start, "linear", LINEAR, { reps: 3, rpe: 10 }, "w1");
    const W = r.prescription.sets[0].weight!;
    const demonstrated = W / matrixPct(M, 3, 10);

    expect(r.reason).toBe("recalibrate");
    expect(r.state.c1rm).toBeCloseTo(100 + (demonstrated - 100) * 0.7, 6);
    expect(r.state.c1rm!).toBeLessThan(100); // caught DOWN, not held
    expect(r.state.regressionStreak).toBe(0); // streak wiped — catch-up won
    expect(r.state.resetPending).toBe(false); // no deload armed this session
  });
});

describe("loop — three regressions deload on the NEXT prescription", () => {
  it("c1RM holds for 3 regressions, then drops 10% at the following prescribe", () => {
    let state: ProgressionState = { ...initState("ex", 0), c1rm: 100 };
    // Three sessions grinding at the prescribed weight and rep target: a
    // regression each time, and only ~−6% demonstrated, so catch-up never fires
    // and the streak is allowed to accumulate.
    for (let i = 1; i <= 3; i++) {
      const r = runSession(
        state,
        "linear",
        LINEAR,
        { reps: 5, rpe: 9.5 },
        `w${i}`,
      );
      expect(r.reason).toBe("regression");
      state = r.state;
      expect(state.c1rm).toBe(100); // NOT dropped during the fold
      expect(state.regressionStreak).toBe(i);
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
  maxReps: 8,
  targetRpe: 8,
  rpeCeiling: 9,
  weightIncrement: 2.5,
  incrementUnit: "kg",
  fatigueReduction: 0,
  fatigueReductionUnit: "kg",
};

describe("loop — double progression holds weight while reps climb, then graduates", () => {
  it("weight is constant across holds, the cursor climbs only while the target is met, success resets the cycle", () => {
    let state: ProgressionState = { ...initState("ex", 0), c1rm: 100 };
    const weights: (number | null)[] = [];
    const cursors: (number | undefined)[] = [];

    // Three holds at 7 reps: strictly inside the rep range at target RPE, so
    // neither a success (below maxReps) nor a regression (above minReps). The
    // weight is anchored at minReps and never moves.
    for (let i = 0; i < 3; i++) {
      const r = runSession(
        state,
        "double",
        DOUBLE,
        { reps: 7, rpe: 8 },
        `h${i}`,
      );
      expect(r.reason).toBe("hold");
      weights.push(r.prescription.sets[0].weight);
      cursors.push(r.state.doubleRepCursor);
      state = r.state;
    }
    expect(new Set(weights).size).toBe(1);
    // The cursor advances only while the session met the rep target it was
    // prescribed: 6 → 7 → 8, then stalls, because 7 reps no longer meets 8.
    expect(cursors).toEqual([7, 8, 8]);
    expect(state.c1rm).toBe(100); // unchanged through holds

    // A session at maxReps with RPE on target graduates the load.
    const grad = runSession(state, "double", DOUBLE, { reps: 8, rpe: 8 }, "g");
    expect(grad.reason).toBe("increment");
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
    expect(first.reason).toBe("seed");
    expect(first.state.c1rm).toBeCloseTo(100 / matrixPct(M, 5, 8), 4);

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

// The RPE-curve refinement the fold applies LAST, through its real entry point:
// the representative qualifying set is picked by the same anti-fluke rule the
// catch-up uses (lone set used directly; with ≥2, the furthest-from-anchor is
// dropped), then gated on how far that set deviates from the anchor.
describe("loop — RPE matrix learning gate", () => {
  const ANCHOR = 100;

  /** A no-fatigue prescription at the anchor, so the demonstrated lens is 1:1. */
  const lens = () =>
    prescribeExercise({
      exerciseId: "ex",
      model: "linear",
      params: LINEAR,
      rpeCeiling: 9,
      effectiveC1rm: ANCHOR,
      matrix: M,
    });

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

  const learn = (sets: LoggedSet[]) =>
    learnedRpeMatrix(M, demonstratedSets(M, sets, 0, lens()), ANCHOR);

  it("a lone in-gate top set nudges its iso-effort cell (top-set program)", () => {
    // 82 kg @ 5 reps RPE 8 ⇒ implied e1RM ≈ 103.8, ~3.8% over the anchor.
    // pDemo = 0.82, so the 5@8 cell is pulled a tenth of the way toward it.
    const out = learn([mkSet(82, 5, 8)]);
    expect(out![5][8]).toBeCloseTo(M[5][8] + 0.1 * (0.82 - M[5][8]), 5);
    expect(out![5][8]).toBeGreaterThan(M[5][8]);
  });

  it("with ≥2 sets the lone outlier is dropped — learning comes from the 2nd-furthest", () => {
    // setA (82@5@8, e1RM ≈ 103.8) is in-gate; setB (140@1@10, e1RM 140) is a
    // +40% fluke and the furthest, so it is dropped.
    const out = learn([mkSet(82, 5, 8, 0), mkSet(140, 1, 10, 1)]);
    expect(out![5][8]).toBeCloseTo(M[5][8] + 0.1 * (0.82 - M[5][8]), 5);
    expect(out![1][10]).toBe(M[1][10]); // the fluke never moved its own cell
  });

  it("a deviation beyond the gate does not learn (catch-up's job)", () => {
    // Lone set 140 kg @ 1 rep RPE 10 ⇒ e1RM 140, +40% over the anchor.
    expect(learn([mkSet(140, 1, 10)])).toBeNull();
  });

  it("no qualifying set ⇒ nothing to learn from", () => {
    // RPE 6 is below the qualifying threshold (≥ 8).
    expect(learn([mkSet(80, 5, 6)])).toBeNull();
  });
});

// Sets store ADDED weight; the fold lifts them into total space (added + factor ×
// bodyweight) before any matrix math, and prescription subtracts the offset again
// on the way out.
describe("loop — bodyweight factor closes the circle in total space", () => {
  const OFFSET = 72; // 0.9 × 80 kg

  it("a 0-added session seeds a total anchor; the next prescription's added weight is ~0, then inches up", () => {
    // Cold start: free entry, the user does 3×5 @ RPE 8 with no added weight.
    const first = runSession(
      initState("ex", 0),
      "linear",
      LINEAR,
      { weight: 0, reps: 5, rpe: 8 },
      "w1",
      OFFSET,
    );
    expect(first.prescription.sets.every((s) => s.weight === null)).toBe(true);
    // The anchor lands in TOTAL space: bodyweight alone, at 5 reps @ RPE 8.
    expect(first.state.c1rm).toBeCloseTo(OFFSET / matrixPct(M, 5, 8), 6);

    // Next prescription converts back to added space: bodyweight reps again.
    const second = runSession(
      first.state,
      "linear",
      LINEAR,
      { reps: 5, rpe: 8 },
      "w2",
      OFFSET,
    );
    expect(second.prescription.sets[0].weight).toBe(0);

    // Performing it as written is a success: the TOTAL anchor takes the
    // increment, so the added weight rises by increment × pct — a small
    // positive step, not the full 2.5 kg.
    expect(second.reason).toBe("increment");
    const third = runSession(
      second.state,
      "linear",
      LINEAR,
      { reps: 5, rpe: 8 },
      "w3",
      OFFSET,
    );
    const added = third.prescription.sets[0].weight!;
    expect(added).toBeGreaterThan(0);
    expect(added).toBeLessThan(2.5);
    expect(added).toBeCloseTo(roundToLoadable(2.5 * matrixPct(M, 5, 8)), 10);
  });

  it("the fold un-fatigues AFTER lifting: total = (added + offset) / scale", () => {
    const anchor = 130; // total-space c1RM
    const fatigue = 13;
    const scale = (anchor - fatigue) / anchor; // 0.9, as the fold derives it

    // Prescribed added weight under fatigue, performed exactly as written.
    const prescription = prescribeExercise({
      exerciseId: "ex",
      model: "linear",
      params: LINEAR,
      rpeCeiling: 9,
      effectiveC1rm: anchor,
      fatigueReduction: fatigue,
      matrix: M,
      bodyweightOffsetKg: OFFSET,
    });
    const sets = logSets(prescription);

    // The fold's own lens recovers the unreduced total anchor (up to rounding).
    const demonstrated = demonstratedSets(M, sets, OFFSET, prescription);
    expect(demonstrated[0].e1rm).toBeCloseTo(anchor, 0);

    // Wrong order (un-fatigue the added weight, then lift) overstates the e1RM
    // by offset × (1/scale − 1) — the transforms do not commute.
    const wrong = impliedE1rm(
      M,
      sets[0].actualWeight / scale + OFFSET,
      sets[0].actualReps,
      sets[0].actualRpe!,
    );
    expect(Math.abs(wrong - anchor)).toBeGreaterThan(5);
  });
});
