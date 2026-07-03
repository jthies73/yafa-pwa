import { describe, it, expect } from "vitest";
import type { Exercise } from "../../db/types";
import { muscleProfileOf, priorsBySlot } from "../service";

const exercise = (
  id: string,
  primaryMuscleGroups: string[],
  secondaryMuscleGroups: string[] = [],
): Exercise => ({
  id,
  name: id,
  primaryMuscleGroups,
  secondaryMuscleGroups,
  created_at: 0,
});

describe("muscleProfileOf", () => {
  it("maps an exercise's muscle groups, defaulting a missing secondary to []", () => {
    const bench = exercise("bench", ["Chest"], ["Triceps"]);
    expect(muscleProfileOf(bench)).toEqual({
      primary: ["Chest"],
      secondary: ["Triceps"],
    });
    expect(
      muscleProfileOf({ ...bench, secondaryMuscleGroups: undefined }),
    ).toEqual({ primary: ["Chest"], secondary: [] });
  });
});

describe("priorsBySlot", () => {
  const bench = exercise("bench", ["Chest"]);
  const squat = exercise("squat", ["Quads"]);
  const byId = new Map([
    ["bench", bench],
    ["squat", squat],
  ]);
  const exerciseOf = (id: string) => byId.get(id);

  it("gives the first slot no priors", () => {
    expect(priorsBySlot(["bench"], exerciseOf)).toEqual([[]]);
  });

  it("accumulates earlier slots' muscle profiles in routine order", () => {
    const result = priorsBySlot(["bench", "squat"], exerciseOf);
    expect(result[1]).toEqual([muscleProfileOf(bench)]);
  });

  it("counts a repeated exercise's earlier slot as its own prior", () => {
    // Bench, Squat, Bench again: the 3rd slot's priors include the 1st
    // slot's own exercise — repeating a lift fatigues its own repeat, same
    // as any other overlapping exercise would.
    const result = priorsBySlot(["bench", "squat", "bench"], exerciseOf);
    expect(result[2]).toEqual([muscleProfileOf(bench), muscleProfileOf(squat)]);
  });

  it("a slot with no resolvable exercise contributes no prior and gets none", () => {
    const result = priorsBySlot(["missing", "bench"], exerciseOf);
    expect(result[0]).toEqual([]);
    expect(result[1]).toEqual([]); // "missing" was never recorded into `seen`
  });
});
