import { describe, it, expect } from "vitest";
import { DEFAULT_RPE_MATRIX } from "../../db/rpeMatrix";
import type { Set as LoggedSet, Workout } from "../../db/types";
import {
  groupAllSessions,
  groupSessionsFor,
  seedC1rmFromHistory,
} from "../sessions";

const M = DEFAULT_RPE_MATRIX;

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

const workout = (
  id: string,
  startTime: number,
  exercises: { exerciseId: string; sets: LoggedSet[] }[],
): Workout => ({ id, routineId: "r", startTime, exercises });

describe("groupSessionsFor", () => {
  it("orders sessions oldest → newest", () => {
    const history = [
      workout("w2", 200, [{ exerciseId: "squat", sets: [set()] }]),
      workout("w1", 100, [{ exerciseId: "squat", sets: [set()] }]),
    ];
    const sessions = groupSessionsFor(history, "squat");
    expect(sessions.map((s) => s.workoutId)).toEqual(["w1", "w2"]);
  });

  it("merges duplicate slots in one workout into a single session, timestamp-sorted", () => {
    const a = set({ timestamp: 30 });
    const b = set({ timestamp: 10 });
    const history = [
      workout("w1", 100, [
        { exerciseId: "squat", sets: [a] },
        { exerciseId: "squat", sets: [b] },
      ]),
    ];
    const sessions = groupSessionsFor(history, "squat");
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sets.map((s) => s.timestamp)).toEqual([10, 30]);
  });

  it("ignores other exercises and empty sessions", () => {
    const history = [
      workout("w1", 100, [{ exerciseId: "bench", sets: [set()] }]),
    ];
    expect(groupSessionsFor(history, "squat")).toEqual([]);
  });
});

describe("groupAllSessions", () => {
  it("keys sessions by exerciseId", () => {
    const history = [
      workout("w1", 100, [
        { exerciseId: "squat", sets: [set()] },
        { exerciseId: "bench", sets: [set()] },
      ]),
    ];
    const map = groupAllSessions(history);
    expect([...map.keys()].sort()).toEqual(["bench", "squat"]);
    expect(map.get("squat")).toHaveLength(1);
  });
});

describe("seedC1rmFromHistory", () => {
  it("returns the peak implied e1RM across sessions", () => {
    const sessions = groupSessionsFor(
      [
        workout("w1", 100, [
          {
            exerciseId: "squat",
            sets: [set({ actualWeight: 100, actualReps: 5, actualRpe: 8 })],
          },
        ]),
        workout("w2", 200, [
          {
            exerciseId: "squat",
            sets: [set({ actualWeight: 110, actualReps: 5, actualRpe: 8 })],
          },
        ]),
      ],
      "squat",
    );
    const seed = seedC1rmFromHistory(M, sessions);
    expect(seed).toBeCloseTo(110 / M[5][8], 4); // peak from the heavier session
  });

  it("returns null when no set qualifies", () => {
    const sessions = groupSessionsFor(
      [
        workout("w1", 100, [
          { exerciseId: "squat", sets: [set({ actualRpe: 6 })] },
        ]),
      ],
      "squat",
    );
    expect(seedC1rmFromHistory(M, sessions)).toBeNull();
  });
});
