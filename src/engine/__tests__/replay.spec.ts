import { describe, it, expect } from "vitest";
import { DEFAULT_RPE_MATRIX } from "../../db/rpeMatrix";
import type {
  Exercise,
  LinearProgressionParams,
  Routine,
  Set as LoggedSet,
  Workout,
} from "../../db/types";
import { replayHistory, type FoldTrace } from "../replay";
import { RESET_DROP } from "../constants";

// The engine trace is a REPLAY: it must reconstruct mid-history state from the
// same transitions the live fold uses. These specs pin the bookkeeping the UI
// leans on — set roles, streak chains, and reset timing — rather than re-testing
// the rules themselves (evaluation.spec / loop.spec own those).

const LINEAR: LinearProgressionParams = {
  targetSets: 3,
  targetReps: 5,
  targetRpe: 8,
  rpeCeiling: 9,
  weightIncrement: 2.5,
  incrementUnit: "kg",
  fatigueReduction: 0,
  fatigueReductionUnit: "percent",
};

const BENCH: Exercise = {
  id: "bench",
  name: "Bench Press",
  primaryMuscleGroups: ["Chest"],
  created_at: 0,
};

const ROUTINE: Routine = {
  id: "r1",
  name: "Push Day",
  exercises: [
    {
      exerciseId: "bench",
      config: { progressionModel: "linear", progressionParams: LINEAR },
    },
  ],
  created_at: 0,
};

const DAY = 24 * 60 * 60 * 1000;

/** Three straight sets logged at one weight/reps/RPE. */
function session(
  id: string,
  day: number,
  logged: { weight: number; reps: number; rpe?: number },
  count = 3,
): Workout {
  const sets: LoggedSet[] = Array.from({ length: count }, (_, i) => ({
    id: `${id}-s${i}`,
    timestamp: day * DAY + i * 60_000,
    targetReps: logged.reps,
    actualReps: logged.reps,
    targetWeight: logged.weight,
    actualWeight: logged.weight,
    actualRpe: logged.rpe,
    failure: false,
  }));
  return {
    id,
    routineId: "r1",
    startTime: day * DAY,
    endTime: day * DAY + 3_600_000,
    exercises: [{ exerciseId: "bench", sets }],
  };
}

const replay = (workouts: Workout[]): FoldTrace[] =>
  replayHistory({
    workouts,
    routines: new Map([["r1", ROUTINE]]),
    plans: [],
    exercises: new Map([["bench", BENCH]]),
    bodyweightEntries: [],
  });

describe("replayHistory — cold start", () => {
  it("seeds from the best honest set and names it", () => {
    const [trace] = replay([
      session("w1", 1, { weight: 100, reps: 5, rpe: 8 }),
    ]);

    expect(trace.reason).toBe("seed");
    expect(trace.before.c1rm).toBeNull();
    // 100 kg @ 5 reps RPE 8 ⇒ 100 / 0.79
    expect(trace.after.c1rm).toBeCloseTo(100 / DEFAULT_RPE_MATRIX[5][8], 6);
    // Identical sets: the first to reach the peak wins the tie, as peakImpliedE1rm does.
    expect(trace.sets.filter((s) => s.representative)).toHaveLength(1);
    expect(trace.sets.every((s) => s.qualifying)).toBe(true);
    // A seed never judges — there was no prescription to judge against.
    expect(trace.outcome).toBeNull();
    expect(trace.prescription).toBeNull();
  });

  it("replays chronologically regardless of input order", () => {
    const early = session("w1", 1, { weight: 100, reps: 5, rpe: 8 });
    const later = session("w2", 8, { weight: 100, reps: 5, rpe: 8 });
    const traces = replay([later, early]);

    expect(traces.map((t) => t.workoutId)).toEqual(["w1", "w2"]);
    expect(traces[0].reason).toBe("seed");
    expect(traces[1].reason).not.toBe("seed");
  });
});

describe("replayHistory — set roles", () => {
  // Seeding from 100 kg @ 5 @ 8 anchors c1RM at 100/0.79 ≈ 126.58, which
  // re-prescribes 5 @ 8 at exactly 100 kg — so the next session hits its target.
  const traces = replay([
    session("w1", 1, { weight: 100, reps: 5, rpe: 8 }),
    session("w2", 8, { weight: 100, reps: 5, rpe: 8 }),
  ]);
  const trace = traces[1];

  it("marks the sets the rules judged and the one that decided", () => {
    expect(trace.sets).toHaveLength(3);
    expect(trace.sets.every((s) => s.judged)).toBe(true);
    expect(trace.sets.filter((s) => s.decider)).toHaveLength(1);
  });

  it("pairs each logged set with its prescribed counterpart", () => {
    for (const s of trace.sets) {
      expect(s.prescribed?.reps).toBe(LINEAR.targetReps);
    }
  });

  it("reports the catch-up arithmetic even when it does not fire", () => {
    expect(trace.catchUp).not.toBeNull();
    expect(trace.catchUp!.qualifyingSets).toBe(3);
    expect(trace.catchUp!.thresholdPct).toBe(10);
    expect(trace.catchUp!.fired).toBe(false);
    expect(trace.catchUp!.result).toBe(trace.catchUp!.anchor);
  });

  it("sets logged beyond the prescribed count are traced but not judged", () => {
    const extra = replay([
      session("w1", 1, { weight: 100, reps: 5, rpe: 8 }),
      session("w2", 8, { weight: 100, reps: 5, rpe: 8 }, 5),
    ])[1];
    expect(extra.sets).toHaveLength(5);
    expect(extra.sets.filter((s) => s.judged)).toHaveLength(3);
  });
});

describe("replayHistory — regression streak and reset", () => {
  // Seed (anchor 126.58, prescription 100 kg), then grind at that prescribed
  // weight with reps at the floor: reps ≤ 5 at RPE > 8 while on prescription is
  // the linear regression clause. The implied e1RM stays within ±10% of the
  // anchor throughout, so catch-up never pre-empts the streak. The 5th session
  // is prescribed from the dropped anchor (113.92 ⇒ 90 kg) and hits it.
  const traces = replay([
    session("w1", 1, { weight: 100, reps: 5, rpe: 8 }),
    session("w2", 8, { weight: 100, reps: 4, rpe: 9 }),
    session("w3", 15, { weight: 100, reps: 4, rpe: 9 }),
    session("w4", 22, { weight: 100, reps: 4, rpe: 9 }),
    session("w5", 29, { weight: 90, reps: 5, rpe: 8 }),
  ]);

  it("accumulates the sessions that built the streak", () => {
    expect(traces.slice(1, 4).map((t) => t.reason)).toEqual([
      "regression",
      "regression",
      "regression",
    ]);
    expect(traces[1].streakChain.map((s) => s.workoutId)).toEqual(["w2"]);
    expect(traces[2].streakChain.map((s) => s.workoutId)).toEqual(["w2", "w3"]);
    expect(traces[3].streakChain.map((s) => s.workoutId)).toEqual([
      "w2",
      "w3",
      "w4",
    ]);
  });

  it("arms the reset on the third regression without moving c1RM", () => {
    expect(traces[1].resetArmed).toBe(false);
    expect(traces[3].resetArmed).toBe(true);
    expect(traces[3].after.c1rm).toBe(traces[3].before.c1rm);
  });

  it("consumes the drop at the NEXT session's prescription", () => {
    const armed = traces[3].after.c1rm!;
    expect(traces[3].resetConsumed).toBeNull();
    expect(traces[4].resetConsumed).toEqual({
      from: armed,
      to: armed * (1 - RESET_DROP),
    });
    // The dropped anchor is what that session was prescribed from.
    expect(traces[4].before.c1rm).toBeCloseTo(armed * (1 - RESET_DROP), 6);
    expect(traces[4].streakChain).toEqual([]);
  });
});

describe("replayHistory — catch-up", () => {
  it("fires on a large divergence and names the set it trusted", () => {
    // Seed low (60 kg @ 5 @ 8 ⇒ ~76 anchor), then demonstrate far more.
    const traces = replay([
      session("w1", 1, { weight: 60, reps: 5, rpe: 8 }),
      session("w2", 8, { weight: 120, reps: 5, rpe: 8 }),
    ]);
    const trace = traces[1];

    expect(trace.reason).toBe("recalibrate");
    expect(trace.catchUp!.fired).toBe(true);
    expect(trace.catchUp!.gapPct).toBeGreaterThan(10);
    expect(trace.after.c1rm).toBe(trace.catchUp!.result);
    expect(trace.sets.filter((s) => s.representative)).toHaveLength(1);
  });
});

describe("replayHistory — sets that carry no signal", () => {
  it("a session without RPE holds and qualifies nothing", () => {
    const traces = replay([
      session("w1", 1, { weight: 100, reps: 5, rpe: 8 }),
      session("w2", 8, { weight: 100, reps: 5 }),
    ]);
    const trace = traces[1];

    expect(trace.reason).toBe("hold");
    expect(trace.sets.every((s) => !s.qualifying)).toBe(true);
    expect(trace.catchUp!.qualifyingSets).toBe(0);
    expect(trace.catchUp!.estimate).toBeNull();
    expect(trace.matrixLearned).toBe(false);
  });

  it("an exercise missing from the routine is traced off-script", () => {
    const traces = replayHistory({
      workouts: [
        session("w1", 1, { weight: 100, reps: 5, rpe: 8 }),
        session("w2", 8, { weight: 100, reps: 5, rpe: 8 }),
      ],
      routines: new Map([["r1", { ...ROUTINE, exercises: [] }]]),
      plans: [],
      exercises: new Map([["bench", BENCH]]),
      bodyweightEntries: [],
    });

    // The first session still seeds (seeding needs no config), the second has no
    // config to evaluate against.
    expect(traces.map((t) => t.reason)).toEqual(["seed", "off-script"]);
    expect(traces[1].after.c1rm).toBe(traces[1].before.c1rm);
    expect(traces[1].outcome).toBeNull();
  });
});
