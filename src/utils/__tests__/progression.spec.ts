import { describe, it, expect } from "vitest";
import type { RoutineExerciseConfig, ProgressionParams } from "../../db/types";
import { getConfigSetCount } from "../progression";

const config = (
  model: RoutineExerciseConfig["progressionModel"],
  params: Partial<ProgressionParams>,
): RoutineExerciseConfig => ({
  progressionModel: model,
  progressionParams: params as ProgressionParams,
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
