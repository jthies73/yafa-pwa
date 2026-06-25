import { describe, it, expect } from "vitest";
import { assertStructuredWorkoutsValid } from "../backup";
import type { Workout } from "../types";

const known = new Set(["ex-1"]);

const validSet = {
  id: "s1",
  timestamp: 100,
  targetReps: 5,
  actualReps: 5,
  targetWeight: 100,
  actualWeight: 100,
  failure: false,
};

const valid: Workout = {
  id: "w1",
  routineId: "r1",
  startTime: 100,
  exercises: [{ exerciseId: "ex-1", sets: [validSet] }],
};

describe("assertStructuredWorkoutsValid", () => {
  it("passes well-formed workouts whose exercises exist", () => {
    expect(() => assertStructuredWorkoutsValid([valid], known)).not.toThrow();
    expect(() => assertStructuredWorkoutsValid([], known)).not.toThrow();
  });

  it("throws on a dangling exerciseId", () => {
    const bad: Workout = {
      ...valid,
      exercises: [{ exerciseId: "missing", sets: [validSet] }],
    };
    expect(() => assertStructuredWorkoutsValid([bad], known)).toThrow();
  });

  it("throws on a malformed set", () => {
    const bad: Workout = {
      ...valid,
      exercises: [
        {
          exerciseId: "ex-1",
          // actualWeight not finite
          sets: [{ ...validSet, actualWeight: NaN }],
        },
      ],
    };
    expect(() => assertStructuredWorkoutsValid([bad], known)).toThrow();
  });

  it("throws when startTime is missing", () => {
    const bad = { ...valid, startTime: undefined } as unknown as Workout;
    expect(() => assertStructuredWorkoutsValid([bad], known)).toThrow();
  });
});
