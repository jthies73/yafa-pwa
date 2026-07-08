import { describe, it, expect } from "vitest";
import {
  assertStructuredWorkoutsValid,
  diffEntities,
  normalizeBackupData,
  type BackupFile,
} from "../backup";
import { BODYWEIGHT_TYPE_ID } from "../measurements";
import type { Exercise, MeasurementType, Workout } from "../types";

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

describe("normalizeBackupData", () => {
  const data = (
    over: Partial<BackupFile["data"]> = {},
  ): BackupFile["data"] => ({
    exercises: [],
    routines: [],
    plans: [],
    workouts: [],
    ...over,
  });

  it("stamps bodyweightFactor 0 onto exercises from pre-feature backups", () => {
    const legacy = {
      id: "ex-1",
      name: "Bench",
      primaryMuscleGroups: ["Chest"],
      created_at: 1,
    } as Exercise;
    const d = data({ exercises: [legacy] });
    normalizeBackupData(d);
    expect(d.exercises[0].bodyweightFactor).toBe(0);
    // A diff against a migration-stamped local row now reads as unchanged.
    expect(
      diffEntities(d.exercises, [{ ...legacy, bodyweightFactor: 0 }]),
    ).toEqual({ new: 0, updated: 0, unchanged: 1 });
  });

  it("keeps an explicit bodyweightFactor untouched", () => {
    const d = data({
      exercises: [
        {
          id: "ex-1",
          name: "Pull Up",
          primaryMuscleGroups: ["Lats"],
          bodyweightFactor: 0.9,
          created_at: 1,
        },
      ],
    });
    normalizeBackupData(d);
    expect(d.exercises[0].bodyweightFactor).toBe(0.9);
  });

  it("re-asserts isSystem on the bodyweight measurement type", () => {
    const d = data({
      measurementTypes: [
        {
          id: BODYWEIGHT_TYPE_ID,
          name: "Bodyweight",
          category: "WEIGHT",
          created_at: 1,
        } as MeasurementType,
        { id: "biceps", name: "Biceps", category: "LENGTH", created_at: 1 },
      ],
    });
    normalizeBackupData(d);
    expect(d.measurementTypes![0].isSystem).toBe(true);
    expect(d.measurementTypes![1].isSystem).toBeUndefined();
  });

  it("tolerates backups without measurement tables", () => {
    const d = data();
    expect(() => normalizeBackupData(d)).not.toThrow();
  });
});

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

describe("diffEntities", () => {
  const local = [
    { id: "a", name: "Alpha", created_at: 1 },
    { id: "b", name: "Beta", created_at: 2 },
  ];

  it("counts a backup item with a fresh id as new", () => {
    const backup = [{ id: "c", name: "Gamma", created_at: 3 }];
    expect(diffEntities(backup, local)).toEqual({
      new: 1,
      updated: 0,
      unchanged: 0,
    });
  });

  it("counts an identical item as unchanged, not updated", () => {
    const backup = [{ id: "a", name: "Alpha", created_at: 1 }];
    expect(diffEntities(backup, local)).toEqual({
      new: 0,
      updated: 0,
      unchanged: 1,
    });
  });

  it("counts a field-only divergence as updated, not new", () => {
    const backup = [{ id: "a", name: "Alpha renamed", created_at: 1 }];
    expect(diffEntities(backup, local)).toEqual({
      new: 0,
      updated: 1,
      unchanged: 0,
    });
  });

  it("classifies a mixed batch", () => {
    const backup = [
      { id: "a", name: "Alpha", created_at: 1 }, // unchanged
      { id: "b", name: "Beta v2", created_at: 2 }, // updated
      { id: "z", name: "Zeta", created_at: 9 }, // new
    ];
    expect(diffEntities(backup, local)).toEqual({
      new: 1,
      updated: 1,
      unchanged: 1,
    });
  });

  it("treats an empty or undefined backup list as all zeros", () => {
    expect(diffEntities([], local)).toEqual({
      new: 0,
      updated: 0,
      unchanged: 0,
    });
    expect(diffEntities(undefined, local)).toEqual({
      new: 0,
      updated: 0,
      unchanged: 0,
    });
  });
});
