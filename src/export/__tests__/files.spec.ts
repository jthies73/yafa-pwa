import { describe, it, expect } from "vitest";
import {
  buildExerciseFiles,
  buildHistoryCsv,
  buildMeasurementFiles,
  buildPlanFiles,
  buildReadme,
  safeFileName,
} from "../files";
import type {
  Exercise,
  MeasurementEntry,
  MeasurementType,
  Plan,
  Routine,
  RoutineExercise,
  Set as LoggedSet,
  Workout,
  WorkoutExercise,
} from "../../db/types";

// Local times so formatDateTime (local getters) is timezone-stable.
const T1 = new Date(2026, 0, 6, 10, 30).getTime();
const T2 = new Date(2026, 0, 8, 9, 0).getTime();

const ex = (over: Partial<Exercise> = {}): Exercise => ({
  id: "e1",
  name: "Bench Press",
  primaryMuscleGroups: ["Chest"],
  secondaryMuscleGroups: ["Triceps"],
  created_at: 0,
  ...over,
});

const set = (over: Partial<LoggedSet> = {}): LoggedSet => ({
  id: "s1",
  timestamp: T1,
  targetReps: 5,
  actualReps: 5,
  targetWeight: 100,
  actualWeight: 100,
  targetRpe: 8,
  actualRpe: 8,
  failure: false,
  ...over,
});

const wEx = (exerciseId: string, sets: LoggedSet[]): WorkoutExercise => ({
  exerciseId,
  sets,
});

const workout = (over: Partial<Workout> = {}): Workout => ({
  id: "w1",
  routineId: "r1",
  startTime: T1,
  exercises: [],
  ...over,
});

const identity = (v: number) => v;
const lines = (csv: string) => csv.split("\n");

describe("safeFileName", () => {
  it("strips path-illegal characters but keeps case and spaces", () => {
    expect(safeFileName("Bench Press")).toBe("Bench Press");
    expect(safeFileName('Row: 1/2 "heavy"')).toBe("Row 1 2 heavy");
    expect(safeFileName("   ")).toBe("unnamed");
  });
});

describe("buildExerciseFiles", () => {
  it("writes timestamp,reps,weight,rpe rows sorted ascending, weight in raw kg", () => {
    const workouts = [
      workout({
        id: "wB",
        startTime: T2,
        exercises: [
          wEx("e1", [
            set({
              timestamp: T2,
              actualReps: 3,
              actualWeight: 110,
              actualRpe: 9,
            }),
          ]),
        ],
      }),
      workout({
        id: "wA",
        startTime: T1,
        exercises: [
          wEx("e1", [
            set({
              timestamp: T1,
              actualReps: 5,
              actualWeight: 100,
              actualRpe: 8,
            }),
          ]),
        ],
      }),
    ];
    const files = buildExerciseFiles(workouts, new Map([["e1", ex()]]));

    expect(Object.keys(files)).toEqual(["exercises/Bench Press.csv"]);
    const rows = lines(files["exercises/Bench Press.csv"]);
    expect(rows[0]).toBe("timestamp,reps,weight,rpe");
    // Earlier timestamp first despite later workout being listed first.
    expect(rows[1]).toBe("2026-01-06 10:30,5,100,8");
    expect(rows[2]).toBe("2026-01-08 09:00,3,110,9");
  });

  it("emits raw stored kg (no unit conversion) and blanks a missing rpe", () => {
    const workouts = [
      workout({
        exercises: [
          wEx("e1", [set({ actualRpe: undefined, actualWeight: 102.5 })]),
        ],
      }),
    ];
    const files = buildExerciseFiles(workouts, new Map([["e1", ex()]]));
    expect(lines(files["exercises/Bench Press.csv"])[1]).toBe(
      "2026-01-06 10:30,5,102.5,",
    );
  });

  it("skips exercises with no logged sets", () => {
    const workouts = [workout({ exercises: [wEx("e1", [])] })];
    const files = buildExerciseFiles(workouts, new Map([["e1", ex()]]));
    expect(files).toEqual({});
  });

  it("disambiguates same-named exercises with a short id suffix", () => {
    const workouts = [
      workout({ exercises: [wEx("e1", [set()]), wEx("e2longid99", [set()])] }),
    ];
    const exercisesById = new Map([
      ["e1", ex({ id: "e1" })],
      ["e2longid99", ex({ id: "e2longid99" })],
    ]);
    const files = buildExerciseFiles(workouts, exercisesById);
    expect(Object.keys(files).sort()).toEqual([
      "exercises/Bench Press (e2longid).csv",
      "exercises/Bench Press.csv",
    ]);
  });
});

describe("buildMeasurementFiles", () => {
  const type = (over: Partial<MeasurementType> = {}): MeasurementType => ({
    id: "m1",
    name: "Bodyweight",
    category: "WEIGHT",
    created_at: 0,
    ...over,
  });
  const entry = (over: Partial<MeasurementEntry> = {}): MeasurementEntry => ({
    id: "x1",
    measurementTypeId: "m1",
    value: 82.5,
    timestamp: T1,
    ...over,
  });

  it("writes timestamp,value rows sorted ascending", () => {
    const entries = new Map([
      [
        "m1",
        [
          entry({ timestamp: T2, value: 83 }),
          entry({ timestamp: T1, value: 82.5 }),
        ],
      ],
    ]);
    const files = buildMeasurementFiles([type()], entries);
    const rows = lines(files["measurements/Bodyweight.csv"]);
    expect(rows[0]).toBe("timestamp,value");
    expect(rows[1]).toBe("2026-01-06 10:30,82.5");
    expect(rows[2]).toBe("2026-01-08 09:00,83");
  });

  it("skips types with no entries", () => {
    expect(buildMeasurementFiles([type()], new Map())).toEqual({});
  });
});

describe("buildPlanFiles", () => {
  const rEx = (config?: RoutineExercise["config"]): RoutineExercise => ({
    exerciseId: "e1",
    config,
  });
  const routine = (
    exercises: RoutineExercise[],
    over: Partial<Routine> = {},
  ): Routine => ({
    id: "r1",
    name: "Push",
    exercises,
    created_at: 0,
    ...over,
  });
  const plan = (over: Partial<Plan> = {}): Plan => ({
    id: "p1",
    name: "PPL",
    routineIds: ["r1"],
    active: true,
    created_at: 0,
    ...over,
  });
  const exMap = new Map([["e1", ex()]]);

  const PLAN_HEADER =
    "Routine,Exercise,Primary Muscle Groups,Secondary Muscle Groups,Progression Model,Target Sets,Target Reps,Min Reps,Max Reps,Target RPE,RPE Ceiling,Top Set Reps,Top Set RPE,Back-Off Sets,Back-Off Reps,Back-Off Drop %,Weight Increment,Increment Unit,Locked Fields,Notes";

  it("writes one file per plan, named after the plan, with the full config header", () => {
    const r = routine([
      rEx({
        progressionModel: "linear",
        progressionParams: {
          targetSets: 3,
          targetReps: 5,
          targetRpe: 8,
          rpeCeiling: 9,
          weightIncrement: 2.5,
          incrementUnit: "kg",
        },
        lockedFields: ["targetSets"],
        notes: "warm up first",
      }),
    ]);
    const files = buildPlanFiles([plan()], [r], exMap, identity, "kg");
    expect(Object.keys(files)).toEqual(["plans/PPL.csv"]);

    const rows = lines(files["plans/PPL.csv"]);
    expect(rows[0]).toBe(PLAN_HEADER);
    // Routine, Exercise, muscles, model, sets, reps, (min,max blank), rpe, ceiling,
    // (top-set fields blank), increment 2.5, unit kg, locked, notes.
    expect(rows[1]).toBe(
      "Push,Bench Press,Chest,Triceps,Linear,3,5,,,8,9,,,,,,2.5,kg,targetSets,warm up first",
    );
  });

  it("fills only the relevant columns for a top-set config and converts a kg increment", () => {
    const r = routine([
      rEx({
        progressionModel: "topset_backoff",
        progressionParams: {
          topSetTargetReps: 3,
          topSetTargetRpe: 9,
          rpeCeiling: 9,
          backOffSets: 3,
          backOffReps: 8,
          percentageDrop: 10,
          weightIncrement: 2.5,
          incrementUnit: "kg",
        },
      }),
    ]);
    const files = buildPlanFiles([plan()], [r], exMap, (kg) => kg * 2, "lbs");
    const cells = lines(files["plans/PPL.csv"])[1].split(",");
    expect(cells[4]).toBe("Top Set + Back-Off"); // model
    expect(cells[5]).toBe(""); // Target Sets (not used by top-set)
    expect(cells[11]).toBe("3"); // Top Set Reps
    expect(cells[12]).toBe("9"); // Top Set RPE
    expect(cells[15]).toBe("10"); // Back-Off Drop %
    expect(cells[16]).toBe("5"); // Weight Increment: 2.5 kg → 5 (×2)
    expect(cells[17]).toBe("lbs"); // Increment Unit
  });

  it("keeps a percent increment raw with a % unit", () => {
    const r = routine([
      rEx({
        progressionModel: "double",
        progressionParams: {
          targetSets: 3,
          minReps: 8,
          maxReps: 12,
          targetRpe: 8,
          rpeCeiling: 9,
          weightIncrement: 5,
          incrementUnit: "percent",
        },
      }),
    ]);
    const files = buildPlanFiles([plan()], [r], exMap, identity, "kg");
    const cells = lines(files["plans/PPL.csv"])[1].split(",");
    expect(cells[7]).toBe("8"); // Min Reps
    expect(cells[8]).toBe("12"); // Max Reps
    expect(cells[16]).toBe("5"); // Weight Increment (raw percent value)
    expect(cells[17]).toBe("%"); // Increment Unit
  });

  it("collects routines not attached to any plan into Unassigned Routines.csv", () => {
    const r = routine(
      [
        rEx({
          progressionModel: "none",
          progressionParams: { targetSets: 3, targetReps: 10, targetRpe: 8 },
        }),
      ],
      { id: "orphan", name: "Solo" },
    );
    const files = buildPlanFiles([], [r], exMap, identity, "kg");
    expect(Object.keys(files)).toEqual(["plans/Unassigned Routines.csv"]);
    expect(
      lines(files["plans/Unassigned Routines.csv"])[1].startsWith(
        "Solo,Bench Press",
      ),
    ).toBe(true);
  });
});

describe("buildHistoryCsv", () => {
  const routine: Routine = {
    id: "r1",
    name: "Push",
    exercises: [],
    created_at: 0,
  };
  const plan: Plan = {
    id: "p1",
    name: "PPL",
    routineIds: ["r1"],
    active: true,
    created_at: 0,
  };

  it("emits one row per set with session context and a computed e1RM for qualifying sets", () => {
    const w = workout({
      exercises: [
        wEx("e1", [
          set({ actualReps: 5, actualWeight: 100, actualRpe: 9 }), // qualifying
          set({ actualReps: 5, actualWeight: 100, actualRpe: undefined }), // no rpe → no e1RM
        ]),
      ],
    });
    const csv = buildHistoryCsv(
      [w],
      [plan],
      [routine],
      new Map([["e1", ex()]]),
      identity,
      "kg",
    );
    const rows = lines(csv);
    expect(rows[0]).toContain("Estimated 1RM (kg)");

    const cells1 = rows[1].split(",");
    expect(cells1[0]).toBe("2026-01-06 10:30");
    expect(cells1[1]).toBe("PPL"); // Plan(s)
    expect(cells1[2]).toBe("Push"); // Routine
    expect(cells1[3]).toBe("Bench Press");
    expect(cells1[4]).toBe("1"); // Set Number
    expect(Number(cells1[11])).toBeGreaterThan(0); // e1RM present

    const cells2 = rows[2].split(",");
    expect(cells2[4]).toBe("2"); // Set Number increments
    expect(cells2[11]).toBe(""); // non-qualifying → blank e1RM
  });

  it("adds a parallel display-unit column when the display unit is not kg", () => {
    const w = workout({
      exercises: [wEx("e1", [set({ actualWeight: 100, actualRpe: 9 })])],
    });
    const csv = buildHistoryCsv(
      [w],
      [plan],
      [routine],
      new Map([["e1", ex()]]),
      (kg) => kg * 2,
      "lbs",
    );
    const rows = lines(csv);
    expect(rows[0]).toContain("Actual Weight (kg),Actual Weight (lbs)");
    expect(rows[0]).toContain("Estimated 1RM (kg),Estimated 1RM (lbs)");

    const cells = rows[1].split(",");
    expect(cells[9]).toBe("100"); // Actual Weight (kg)
    expect(cells[10]).toBe("200"); // Actual Weight (lbs) = ×2
    expect(Number(cells[14])).toBeCloseTo(Number(cells[13]) * 2); // e1RM lbs = kg ×2
  });
});

describe("buildReadme", () => {
  it("lists the folders and states the unit rule for the active units", () => {
    const txt = buildReadme({
      version: "0.9.0",
      exportedAt: T1,
      weightUnit: "kg",
      lengthUnit: "cm",
    });
    expect(txt).toContain("v0.9.0");
    expect(txt).toContain("backup.json");
    expect(txt).toContain("weight (kg)"); // exercises stored unit
    expect(txt).toContain("display unit (kg / cm)");
  });

  it("interpolates a non-metric display unit into the rule", () => {
    const txt = buildReadme({
      version: "0.9.0",
      exportedAt: T1,
      weightUnit: "lbs",
      lengthUnit: "in",
    });
    expect(txt).toContain("display unit (lbs / in)");
  });
});
