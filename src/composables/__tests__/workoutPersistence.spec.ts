import { describe, it, expect } from "vitest";
import {
  ACTIVE_WORKOUT_KEY,
  SNAPSHOT_VERSION,
  readWorkoutSnapshot,
  writeWorkoutSnapshot,
  clearWorkoutSnapshot,
  type WorkoutSessionSnapshot,
} from "../workoutPersistence";

const fakeStore = (seed: Record<string, string> = {}) => {
  const map = new Map(Object.entries(seed));
  return {
    map,
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
};

const snapshot = (): Omit<WorkoutSessionSnapshot, "version"> => ({
  workout: { id: "w1", routineId: "r1", startTime: 1000 },
  routine: null,
  exercisesMap: {},
  prescriptions: [],
  plannedCounts: { ex1: 3 },
  calculatorSets: [],
  isMinimized: false,
  cards: [
    {
      id: "c1",
      exerciseId: "ex1",
      sets: [
        {
          id: "s1",
          reps: "5",
          weight: "100",
          rpe: "8",
          done: true,
          completedAt: 1234,
        },
      ],
    },
  ],
  addedNames: {},
});

describe("writeWorkoutSnapshot / readWorkoutSnapshot", () => {
  it("round-trips the session, stamping the current version", () => {
    const store = fakeStore();
    writeWorkoutSnapshot(store, snapshot());

    const stored = JSON.parse(store.map.get(ACTIVE_WORKOUT_KEY)!);
    expect(stored.version).toBe(SNAPSHOT_VERSION);

    const read = readWorkoutSnapshot(store);
    expect(read).toEqual({ version: SNAPSHOT_VERSION, ...snapshot() });
  });

  it("returns null when nothing is persisted", () => {
    expect(readWorkoutSnapshot(fakeStore())).toBeNull();
  });

  it("returns null on corrupt JSON", () => {
    expect(
      readWorkoutSnapshot(fakeStore({ [ACTIVE_WORKOUT_KEY]: "{not json" })),
    ).toBeNull();
  });

  it("returns null on a stale snapshot version", () => {
    const stale = JSON.stringify({
      ...snapshot(),
      version: SNAPSHOT_VERSION + 1,
    });
    expect(
      readWorkoutSnapshot(fakeStore({ [ACTIVE_WORKOUT_KEY]: stale })),
    ).toBeNull();
  });

  it("returns null when the workout id is missing", () => {
    const broken = JSON.stringify({
      ...snapshot(),
      version: SNAPSHOT_VERSION,
      workout: { id: "", routineId: "", startTime: 0 },
    });
    expect(
      readWorkoutSnapshot(fakeStore({ [ACTIVE_WORKOUT_KEY]: broken })),
    ).toBeNull();
  });
});

describe("clearWorkoutSnapshot", () => {
  it("removes a persisted session", () => {
    const store = fakeStore();
    writeWorkoutSnapshot(store, snapshot());
    expect(store.map.has(ACTIVE_WORKOUT_KEY)).toBe(true);

    clearWorkoutSnapshot(store);
    expect(store.map.has(ACTIVE_WORKOUT_KEY)).toBe(false);
    expect(readWorkoutSnapshot(store)).toBeNull();
  });
});
