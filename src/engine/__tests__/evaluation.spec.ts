import { describe, it, expect } from "vitest";
import type {
  DoubleProgressionParams,
  LinearProgressionParams,
  ProgressionModelType,
  Set as LoggedSet,
  TopSetProgressionParams,
} from "../../db/types";
import type { ExercisePrescription, PrescribedSet } from "../prescription";
import { evaluate } from "../evaluation";

let nextId = 0;
const set = (overrides: Partial<LoggedSet> = {}): LoggedSet => ({
  id: `set-${++nextId}`,
  timestamp: ++nextId,
  targetReps: 5,
  actualReps: 5,
  targetWeight: 100,
  actualWeight: 100,
  actualRpe: 8,
  failure: false,
  ...overrides,
});

const prescription = (
  model: ProgressionModelType,
  sets: PrescribedSet[],
): ExercisePrescription => ({
  exerciseId: "ex",
  model,
  sets,
  workingE1rm: 126,
});

const straight = (
  n: number,
  weight = 100,
  reps = 5,
  rpe = 8,
): PrescribedSet[] =>
  Array.from({ length: n }, () => ({
    reps,
    rpe,
    weight,
    role: "straight" as const,
  }));

const LINEAR: LinearProgressionParams = {
  targetSets: 3,
  targetReps: 5,
  targetRpe: 8,
  rpeCeiling: 9,
  weightIncrement: 2.5,
  incrementUnit: "kg",
};

describe("evaluate — linear", () => {
  const presc = prescription("linear", straight(3));

  it("success: all sets hit reps & RPE at the prescribed weight", () => {
    const sets = [set(), set(), set()];
    expect(evaluate("linear", LINEAR, presc, sets)).toBe("success");
  });

  it("regression: worst set grinds over target RPE at the prescribed weight", () => {
    const sets = [set(), set(), set({ actualReps: 5, actualRpe: 9.5 })];
    expect(evaluate("linear", LINEAR, presc, sets)).toBe("regression");
  });

  it("hold: a set short of reps but RPE on target", () => {
    const sets = [set(), set(), set({ actualReps: 4, actualRpe: 7.5 })];
    expect(evaluate("linear", LINEAR, presc, sets)).toBe("hold");
  });

  it("tolerance: within ±1.25 kg counts as the prescribed weight, beyond does not", () => {
    expect(
      evaluate("linear", LINEAR, presc, [
        set(),
        set(),
        set({ actualWeight: 101.25, actualRpe: 9.5 }),
      ]),
    ).toBe("regression");
    // 1.5 kg off → not "at prescribed" → can't be the keyed regression → hold.
    expect(
      evaluate("linear", LINEAR, presc, [
        set(),
        set(),
        set({ actualWeight: 98.5, actualRpe: 9.5 }),
      ]),
    ).toBe("hold");
  });

  it("a re-prescribed-down set does not mask a regression (evaluate vs original)", () => {
    // Set 1 over the ceiling at the original 100; sets 2-3 re-prescribed to 90.
    const sets = [
      set({ actualWeight: 100, actualReps: 5, actualRpe: 9.5, timestamp: 1 }),
      set({ actualWeight: 90, actualReps: 5, actualRpe: 8, timestamp: 2 }),
      set({ actualWeight: 90, actualReps: 5, actualRpe: 8, timestamp: 3 }),
    ];
    expect(evaluate("linear", LINEAR, presc, sets)).toBe("regression");
  });

  it("missing RPE → never success, falls through to hold", () => {
    const sets = [set({ actualRpe: undefined }), set(), set()];
    expect(evaluate("linear", LINEAR, presc, sets)).toBe("hold");
  });

  it("fewer sets than prescribed → not a success", () => {
    expect(evaluate("linear", LINEAR, presc, [set(), set()])).toBe("hold");
  });

  it("extra sets beyond the prescribed N are ignored", () => {
    const sets = [set(), set(), set(), set({ actualRpe: 10, actualReps: 1 })];
    expect(evaluate("linear", LINEAR, presc, sets)).toBe("success");
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

describe("evaluate — double", () => {
  const presc = prescription("double", straight(3, 80, 10));

  it("success: all sets at maxReps with worst RPE ≤ target", () => {
    const sets = [
      set({ actualWeight: 80, actualReps: 10, actualRpe: 7.5 }),
      set({ actualWeight: 80, actualReps: 10, actualRpe: 8 }),
      set({ actualWeight: 80, actualReps: 10, actualRpe: 8 }),
    ];
    expect(evaluate("double", DOUBLE, presc, sets)).toBe("success");
  });

  it("hold: at least one set below maxReps", () => {
    const sets = [
      set({ actualWeight: 80, actualReps: 10, actualRpe: 8 }),
      set({ actualWeight: 80, actualReps: 8, actualRpe: 8 }),
      set({ actualWeight: 80, actualReps: 8, actualRpe: 8 }),
    ];
    expect(evaluate("double", DOUBLE, presc, sets)).toBe("hold");
  });

  it("regression at minReps when grinding (RPE+1 > target)", () => {
    const sets = [
      set({ actualWeight: 80, actualReps: 6, actualRpe: 7.5 }),
      set({ actualWeight: 80, actualReps: 6, actualRpe: 8 }),
      set({ actualWeight: 80, actualReps: 6, actualRpe: 8 }),
    ];
    expect(evaluate("double", DOUBLE, presc, sets)).toBe("regression");
  });

  it("just under the regression boundary → hold", () => {
    // worst RPE 6.5, +1 = 7.5, not > 8 → not a regression.
    const sets = [
      set({ actualWeight: 80, actualReps: 6, actualRpe: 6.5 }),
      set({ actualWeight: 80, actualReps: 6, actualRpe: 6.5 }),
      set({ actualWeight: 80, actualReps: 6, actualRpe: 6.5 }),
    ];
    expect(evaluate("double", DOUBLE, presc, sets)).toBe("hold");
  });
});

const TOPSET: TopSetProgressionParams = {
  topSetTargetReps: 5,
  topSetTargetRpe: 8,
  rpeCeiling: 9,
  backOffSets: 2,
  backOffReps: 8,
  percentageDrop: 10,
  weightIncrement: 2.5,
  incrementUnit: "kg",
};

describe("evaluate — top set", () => {
  const presc = prescription("topset_backoff", [
    { reps: 5, rpe: 8, weight: 100, role: "top" },
    { reps: 8, rpe: null, weight: 90, role: "backoff" },
    { reps: 8, rpe: null, weight: 90, role: "backoff" },
  ]);

  it("success: top set hits reps & RPE (back-offs ignored)", () => {
    const sets = [
      set({ timestamp: 1, actualWeight: 100, actualReps: 5, actualRpe: 8 }),
      set({ timestamp: 2, actualWeight: 90, actualReps: 8, actualRpe: 9.5 }),
      set({ timestamp: 3, actualWeight: 90, actualReps: 8, actualRpe: 9.5 }),
    ];
    expect(evaluate("topset_backoff", TOPSET, presc, sets)).toBe("success");
  });

  it("regression: top set grinds over target RPE at the prescribed weight", () => {
    const sets = [
      set({ timestamp: 1, actualWeight: 100, actualReps: 4, actualRpe: 9.5 }),
      set({ timestamp: 2, actualWeight: 90, actualReps: 8, actualRpe: 8 }),
    ];
    expect(evaluate("topset_backoff", TOPSET, presc, sets)).toBe("regression");
  });
});

describe("evaluate — none", () => {
  it("always holds", () => {
    const presc = prescription("none", straight(3));
    expect(evaluate("none", LINEAR, presc, [set(), set(), set()])).toBe("hold");
  });
});
