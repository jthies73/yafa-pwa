import { describe, it, expect } from "vitest";
import { effectScope } from "vue";
import type { PrescribedSet } from "../../engine/prescription";
import {
  useWorkoutTracker,
  nextUnfinishedSet,
  setValid,
  type SetEntry,
  type ExerciseCard,
} from "../useWorkoutTracker";

const setEntry = (overrides: Partial<SetEntry> = {}): SetEntry => ({
  id: "set",
  reps: "",
  weight: "",
  rpe: "",
  done: false,
  completedAt: null,
  ...overrides,
});

// A logged/finished set: done with valid reps + weight (RPE is not part of done).
const doneSet = (overrides: Partial<SetEntry> = {}): SetEntry =>
  setEntry({
    reps: "5",
    weight: "100",
    done: true,
    completedAt: 1,
    ...overrides,
  });

const card = (id: string, sets: SetEntry[]): ExerciseCard => ({
  id,
  exerciseId: `ex-${id}`,
  sets,
});

describe("setValid", () => {
  it("accepts 0 and negative weights (bodyweight / assisted sets)", () => {
    expect(setValid(setEntry({ reps: "5", weight: "0" }))).toBe(true);
    expect(setValid(setEntry({ reps: "5", weight: "-10" }))).toBe(true);
    expect(setValid(setEntry({ reps: "5", weight: "100" }))).toBe(true);
  });

  it("still rejects an empty or non-numeric weight and invalid reps", () => {
    expect(setValid(setEntry({ reps: "5", weight: "" }))).toBe(false);
    expect(setValid(setEntry({ reps: "5", weight: "abc" }))).toBe(false);
    expect(setValid(setEntry({ reps: "0", weight: "100" }))).toBe(false);
    expect(setValid(setEntry({ reps: "", weight: "100" }))).toBe(false);
  });
});

describe("nextUnfinishedSet", () => {
  it("returns the next still-unfinished set in the same card", () => {
    const c = card("a", [doneSet(), setEntry(), setEntry()]);
    expect(nextUnfinishedSet([c], 0, 0)).toEqual({ cardIndex: 0, setIndex: 1 });
  });

  it("skips finished sets (e.g. cold-start filled rows that are already logged)", () => {
    const c = card("a", [doneSet(), doneSet(), setEntry()]);
    expect(nextUnfinishedSet([c], 0, 0)).toEqual({ cardIndex: 0, setIndex: 2 });
  });

  it("crosses into the next card when the current one is fully logged", () => {
    const a = card("a", [doneSet(), doneSet()]);
    const b = card("b", [doneSet(), setEntry()]);
    expect(nextUnfinishedSet([a, b], 0, 1)).toEqual({
      cardIndex: 1,
      setIndex: 1,
    });
  });

  it("never walks backward to an earlier unfinished set in the same card", () => {
    const c = card("a", [setEntry(), doneSet()]);
    // Submitting set 1 (last) leaves set 0 unfinished, but focus does not jump back.
    expect(nextUnfinishedSet([c], 0, 1)).toBeNull();
  });

  it("returns null when nothing remains to log", () => {
    const c = card("a", [doneSet(), doneSet()]);
    expect(nextUnfinishedSet([c], 0, 1)).toBeNull();
  });
});

// ── proposalFor: the set-adjustment recommendation visibility rule ─────────────
// A green dot is offered ONLY on an unfinished set whose immediately-preceding
// set has been submitted (done, with valid reps/weight/RPE) AND whose outcome
// triggers a meaningfully different re-prescription.
const withTracker = <T>(
  fn: (t: ReturnType<typeof useWorkoutTracker>) => T,
): T => {
  const scope = effectScope();
  try {
    return scope.run(() => fn(useWorkoutTracker()))!;
  } finally {
    scope.stop();
  }
};

const target: PrescribedSet = { reps: 5, rpe: 8, weight: 100, role: "top" };

describe("proposalFor", () => {
  it("offers a proposal when a submitted, divergent predecessor precedes an unfinished set", () => {
    withTracker((t) => {
      // Prev 100×5 @ 9.5 is far harder than the target RPE 8 → propose lighter.
      const c = card("a", [
        doneSet({ id: "prev", rpe: "9.5" }),
        setEntry({ id: "cur", target }),
      ]);
      expect(t.proposalFor(c, 1)).not.toBeNull();
    });
  });

  it("offers nothing until the predecessor is submitted", () => {
    withTracker((t) => {
      const c = card("a", [
        setEntry({ id: "prev", reps: "5", weight: "100", rpe: "9.5" }), // not done
        setEntry({ id: "cur", target }),
      ]);
      expect(t.proposalFor(c, 1)).toBeNull();
    });
  });

  it("offers nothing on a set that is already finished", () => {
    withTracker((t) => {
      const c = card("a", [
        doneSet({ id: "prev", rpe: "9.5" }),
        doneSet({ id: "cur", rpe: "8", target }),
      ]);
      expect(t.proposalFor(c, 1)).toBeNull();
    });
  });

  it("offers nothing when the predecessor's outcome is on target (no re-prescription)", () => {
    withTracker((t) => {
      const c = card("a", [
        doneSet({ id: "prev", rpe: "8" }), // 100×5 @ 8 == target → within tolerance
        setEntry({ id: "cur", target }),
      ]);
      expect(t.proposalFor(c, 1)).toBeNull();
    });
  });

  it("offers nothing when the submitted predecessor carries no RPE", () => {
    withTracker((t) => {
      const c = card("a", [
        doneSet({ id: "prev", rpe: "" }), // can't imply an e1RM without RPE
        setEntry({ id: "cur", target }),
      ]);
      expect(t.proposalFor(c, 1)).toBeNull();
    });
  });

  it("offers nothing for the first set (no predecessor)", () => {
    withTracker((t) => {
      const c = card("a", [setEntry({ id: "cur", target })]);
      expect(t.proposalFor(c, 0)).toBeNull();
    });
  });
});
