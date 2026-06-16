import { describe, it, expect } from "vitest";
import { DEFAULT_RPE_MATRIX } from "../../db/rpeMatrix";
import type { RoutineExerciseConfig, Set as LoggedSet } from "../../db/types";
import { weightFromE1rm } from "../matrix";
import { foldExercise, stepSession, freshState } from "../fold";
import type { ExerciseSession } from "../sessions";

const M = DEFAULT_RPE_MATRIX;

let setSeq = 0;
const set = (
  actualReps: number,
  targetReps: number,
  actualRpe: number | undefined,
  targetRpe: number | undefined,
  weight: number,
): LoggedSet => ({
  id: `s${++setSeq}`,
  timestamp: ++setSeq,
  targetReps,
  actualReps,
  targetWeight: weight,
  actualWeight: weight,
  targetRpe,
  actualRpe,
  failure: false,
});

/** A clean working set at the load that implies `e1rm` for (reps, rpe). */
const cleanSet = (reps: number, rpe: number, e1rm: number) =>
  set(reps, reps, rpe, rpe, weightFromE1rm(M, e1rm, reps, rpe));

/** A failed set (reps short, RPE over) at the load that implies `e1rm`. */
const failedSet = (reps: number, rpe: number, e1rm: number) =>
  set(reps, reps + 1, rpe, rpe - 1, weightFromE1rm(M, e1rm, reps, rpe));

let wSeq = 0;
const session = (
  sets: LoggedSet[],
  config?: RoutineExerciseConfig,
): ExerciseSession => {
  const n = ++wSeq;
  return { workoutId: `w${n}`, at: n, sets, config };
};

const LINEAR: RoutineExerciseConfig = {
  progressionModel: "linear",
  progressionParams: {
    targetSets: 3,
    targetReps: 5,
    targetRpe: 9,
    weightIncrement: 2.5,
  },
};

const ctx = (confirmed: Map<string, number> = new Map()) => ({
  matrix: M,
  confirmedByWorkout: confirmed,
});

const fold = (sessions: ExerciseSession[], confirmed?: Map<string, number>) =>
  foldExercise("ex", sessions, M, confirmed).state;

describe("cold-start seed", () => {
  it("seeds the scalar from the first session and never judges it", () => {
    const s = fold([session([cleanSet(5, 9, 100)], LINEAR)]);
    expect(s.e1rm).toBeCloseTo(100, 6);
    expect(s.failureStreak).toBe(0);
    expect(s.deload).toBeNull();
    expect(s.trend).toHaveLength(1);
  });
});

describe("deliberate progression", () => {
  it("a clean linear session adds the weight increment", () => {
    const s = fold([
      session([cleanSet(5, 9, 100)], LINEAR), // seed → 100
      session([cleanSet(5, 9, 100)], LINEAR), // success → 102.5
    ]);
    expect(s.e1rm).toBeCloseTo(102.5, 4);
    expect(s.failureStreak).toBe(0);
  });
});

describe("deload on a failure streak", () => {
  it("fires on the third consecutive failure: cuts the e1RM and clears the streak", () => {
    const sessions = [
      session([cleanSet(5, 9, 100)], LINEAR), // seed → 100
      session([failedSet(5, 9, 100)], LINEAR), // streak 1
      session([failedSet(5, 9, 100)], LINEAR), // streak 2
      session([failedSet(5, 9, 100)], LINEAR), // streak 3 → deload
    ];
    const s = fold(sessions);
    expect(s.deload).not.toBeNull();
    expect(s.failureStreak).toBe(0);
    expect(s.e1rm).toBeCloseTo(90, 1); // 100 × (1 − 0.10)
  });

  it("does not fire below the trigger", () => {
    const s = fold([
      session([cleanSet(5, 9, 100)], LINEAR),
      session([failedSet(5, 9, 100)], LINEAR),
      session([failedSet(5, 9, 100)], LINEAR),
    ]);
    expect(s.deload).toBeNull();
    expect(s.failureStreak).toBe(2);
  });
});

describe("recalibration (large drift)", () => {
  const sessions = [
    session([cleanSet(5, 9, 100)], LINEAR), // seed → 100
    session([cleanSet(5, 9, 130)], LINEAR), // demonstrates 130 (+30%)
  ];

  it("surfaces a proposal but does NOT auto-snap the scalar", () => {
    const { state, proposals } = foldExercise("ex", sessions, M);
    const drift = proposals.get(sessions[1].workoutId);
    expect(drift).toBeDefined();
    expect(drift!.from).toBeCloseTo(100, 4);
    expect(drift!.demonstrated).toBeCloseTo(130, 0);
    expect(drift!.to).toBeCloseTo(120, 0); // 100 + 2/3 × 30
    // The deliberate +2.5 still applies; the big jump is NOT folded in.
    expect(state.e1rm).toBeCloseTo(102.5, 1);
  });

  it("a confirmed recalibration snaps the scalar and emits no further proposal", () => {
    const confirmed = new Map([[sessions[1].workoutId, 120]]);
    const { state, proposals } = foldExercise("ex", sessions, M, confirmed);
    expect(state.e1rm).toBe(120);
    expect(state.failureStreak).toBe(0);
    expect(proposals.has(sessions[1].workoutId)).toBe(false);
  });
});

describe("derived-state coherence", () => {
  const history = [
    session([cleanSet(5, 9, 100)], LINEAR),
    session([cleanSet(5, 9, 100)], LINEAR),
    session([failedSet(5, 9, 102.5)], LINEAR),
    session([cleanSet(5, 9, 102.5)], LINEAR),
  ];

  it("appending one session equals folding the whole history", () => {
    const full = fold(history);

    const prefix = foldExercise("ex", history.slice(0, -1), M).state;
    const appended = stepSession(
      prefix,
      history[history.length - 1],
      ctx(),
    ).state;

    expect(appended).toEqual(full);
  });

  it("deleting a past session equals folding the shortened history", () => {
    const withoutThird = [history[0], history[1], history[3]];
    const refolded = fold(withoutThird);
    // A fresh fold of the edited history is the source of truth — it must match
    // an independent fold of the same sessions, proving state never drifts.
    expect(refolded).toEqual(fold(withoutThird));
    // And it differs from the full history (the deleted failure is gone).
    expect(refolded).not.toEqual(fold(history));
  });

  it("a fresh state folds to itself with no sessions", () => {
    expect(fold([])).toEqual(freshState("ex"));
  });
});
