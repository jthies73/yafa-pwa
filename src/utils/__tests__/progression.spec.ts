import { describe, it, expect } from "vitest";
import type {
  RoutineExerciseConfig,
  ProgressionParams,
  NoneProgressionParams,
  Set as LoggedSet,
  Workout,
  WorkoutExercise,
} from "../../db/types";
import { getConfigSetCount, workoutToRoutineExercises } from "../progression";

const config = (
  model: RoutineExerciseConfig["progressionModel"],
  params: Partial<ProgressionParams>,
): RoutineExerciseConfig => ({
  progressionModel: model,
  progressionParams: params as ProgressionParams,
});

const loggedSet = (actualReps: number): LoggedSet => ({
  id: crypto.randomUUID(),
  timestamp: 0,
  targetReps: actualReps,
  actualReps,
  targetWeight: 100,
  actualWeight: 100,
  failure: false,
});

const workout = (exercises: WorkoutExercise[]): Workout => ({
  id: "w1",
  routineId: "",
  startTime: 0,
  endTime: 1,
  exercises,
});

describe("getConfigSetCount", () => {
  it("defaults to 3 without a config", () => {
    expect(getConfigSetCount(undefined)).toBe(3);
  });

  it("counts top set + back-offs for topset_backoff", () => {
    expect(
      getConfigSetCount(config("topset_backoff", { backOffSets: 2 })),
    ).toBe(3);
  });

  it("backfills legacy configs via normalization (missing params → defaults)", () => {
    // Legacy topset config without backOffSets → default 3 back-offs + top = 4,
    // matching what the engine actually prescribes.
    expect(getConfigSetCount(config("topset_backoff", {}))).toBe(4);
    expect(getConfigSetCount(config("linear", {}))).toBe(3);
  });

  it("saved targetSets wins over the default", () => {
    expect(getConfigSetCount(config("double", { targetSets: 5 }))).toBe(5);
  });
});

describe("workoutToRoutineExercises", () => {
  it("emits one slot per exercise, in order, preserving duplicates", () => {
    const slots = workoutToRoutineExercises(
      workout([
        { exerciseId: "a", sets: [loggedSet(8)] },
        { exerciseId: "b", sets: [loggedSet(5)] },
        { exerciseId: "a", sets: [loggedSet(10)] },
      ]),
    );
    expect(slots.map((s) => s.exerciseId)).toEqual(["a", "b", "a"]);
  });

  it("uses the none model with all required params present", () => {
    const [slot] = workoutToRoutineExercises(
      workout([{ exerciseId: "a", sets: [loggedSet(8)] }]),
    );
    expect(slot.config?.progressionModel).toBe("none");
    const p = slot.config!.progressionParams as NoneProgressionParams;
    expect(p.targetSets).toBeDefined();
    expect(p.targetReps).toBeDefined();
    expect(p.targetRpe).toBeDefined();
    expect(p.fatigueReduction).toBeDefined();
    expect(p.fatigueReductionUnit).toBeDefined();
  });

  it("seeds targetSets from set count and targetReps from the modal reps", () => {
    const [slot] = workoutToRoutineExercises(
      workout([
        {
          exerciseId: "a",
          sets: [loggedSet(8), loggedSet(8), loggedSet(6)],
        },
      ]),
    );
    const p = slot.config!.progressionParams as NoneProgressionParams;
    expect(p.targetSets).toBe(3);
    expect(p.targetReps).toBe(8);
  });

  it("breaks a modal-reps tie toward the higher rep count", () => {
    const [slot] = workoutToRoutineExercises(
      workout([{ exerciseId: "a", sets: [loggedSet(6), loggedSet(10)] }]),
    );
    const p = slot.config!.progressionParams as NoneProgressionParams;
    expect(p.targetReps).toBe(10);
  });

  it("falls back to defaults for a note-only exercise (no sets)", () => {
    const [slot] = workoutToRoutineExercises(
      workout([{ exerciseId: "a", sets: [], note: "skipped" }]),
    );
    const p = slot.config!.progressionParams as NoneProgressionParams;
    expect(p.targetSets).toBe(3);
    expect(p.targetReps).toBe(8);
  });
});
