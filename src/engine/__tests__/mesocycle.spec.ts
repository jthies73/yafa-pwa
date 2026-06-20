import { describe, it, expect } from "vitest";
import type {
  DoubleProgressionParams,
  LinearProgressionParams,
  MesocycleWeek,
  TopSetProgressionParams,
} from "../../db/types";
import { DEFAULT_PROGRESSION_PARAMS } from "../../config/progression";
import { applyMesoToParams, focusModifiers, weekFocus } from "../mesocycle";

const weeks = (...f: MesocycleWeek["focus"][]): MesocycleWeek[] =>
  f.map((focus) => ({ focus }));

describe("focusModifiers", () => {
  it("returns the tuned deltas per focus", () => {
    expect(focusModifiers("strength")).toEqual({
      rpeDelta: 0.5,
      repDelta: -1,
      setDelta: 0,
    });
    expect(focusModifiers("deload")).toEqual({
      rpeDelta: -1.5,
      repDelta: 0,
      setDelta: -1,
    });
  });
});

describe("weekFocus", () => {
  it("returns null without a mesocycle", () => {
    expect(weekFocus(undefined, 0)).toBeNull();
    expect(weekFocus([], 2)).toBeNull();
  });

  it("wraps past the cycle length and is negative-safe", () => {
    const m = weeks("hypertrophy", "strength", "peaking");
    expect(weekFocus(m, 0)).toBe("hypertrophy");
    expect(weekFocus(m, 3)).toBe("hypertrophy");
    expect(weekFocus(m, 4)).toBe("strength");
    expect(weekFocus(m, -1)).toBe("peaking");
  });
});

describe("applyMesoToParams", () => {
  const linear = () =>
    ({ ...DEFAULT_PROGRESSION_PARAMS.linear }) as LinearProgressionParams;

  it("shifts linear targets for a strength week", () => {
    const out = applyMesoToParams(
      "linear",
      linear(),
      focusModifiers("strength"),
    ) as LinearProgressionParams;
    expect(out.targetRpe).toBe(8.5); // 8 + 0.5
    expect(out.targetReps).toBe(4); // 5 − 1
    expect(out.targetSets).toBe(3); // setDelta 0
  });

  it("respects a locked field", () => {
    const out = applyMesoToParams(
      "linear",
      linear(),
      focusModifiers("strength"),
      ["targetReps"],
    ) as LinearProgressionParams;
    expect(out.targetReps).toBe(5); // locked → unchanged
    expect(out.targetRpe).toBe(8.5); // still shifted
  });

  it("never periodizes double's rep range", () => {
    const dbl = {
      ...DEFAULT_PROGRESSION_PARAMS.double,
    } as DoubleProgressionParams;
    const out = applyMesoToParams(
      "double",
      dbl,
      focusModifiers("hypertrophy"),
    ) as DoubleProgressionParams;
    expect(out.minReps).toBe(dbl.minReps); // untouched
    expect(out.maxReps).toBe(dbl.maxReps); // untouched
    expect(out.targetSets).toBe(dbl.targetSets + 1); // setDelta +1
  });

  it("shifts top-set targets and leaves backOffReps alone", () => {
    const ts = {
      ...DEFAULT_PROGRESSION_PARAMS.topset_backoff,
    } as TopSetProgressionParams;
    const out = applyMesoToParams(
      "topset_backoff",
      ts,
      focusModifiers("peaking"),
    ) as TopSetProgressionParams;
    expect(out.topSetTargetRpe).toBe(9); // 8 + 1
    expect(out.backOffSets).toBe(ts.backOffSets - 1); // setDelta −1
    expect(out.backOffReps).toBe(ts.backOffReps); // untouched
  });

  it("clamps RPE to the 6–10 grid and reps/sets ≥ 1", () => {
    const ts = {
      ...DEFAULT_PROGRESSION_PARAMS.topset_backoff,
      topSetTargetRpe: 6,
      backOffSets: 1,
      topSetTargetReps: 1,
    } as TopSetProgressionParams;
    const out = applyMesoToParams(
      "topset_backoff",
      ts,
      focusModifiers("deload"),
    ) as TopSetProgressionParams;
    expect(out.topSetTargetRpe).toBe(6); // 6 − 1.5 clamps to 6
    expect(out.backOffSets).toBeGreaterThanOrEqual(1);
  });

  it("does not mutate the input params", () => {
    const p = linear();
    applyMesoToParams("linear", p, focusModifiers("strength"));
    expect(p.targetRpe).toBe(8);
  });
});
