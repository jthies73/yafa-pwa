import { db } from "./db";
import { BODYWEIGHT_TYPE_ID } from "./measurements";
import type {
  Exercise,
  MeasurementType,
  Routine,
  Plan,
} from "./types";

const measurementTypes: MeasurementType[] = [
  {
    id: BODYWEIGHT_TYPE_ID,
    name: "Bodyweight",
    category: "WEIGHT",
    created_at: Date.now(),
  },
];

const exercises: Exercise[] = [
  {
    id: "barbell-back-squat",
    name: "Barbell Back Squat",
    primaryMuscleGroups: ["Quads"],
    secondaryMuscleGroups: ["Glutes", "Hamstrings", "Lower Back"],
    notes: "",
    created_at: Date.now(),
  },
  {
    id: "barbell-bench-press",
    name: "Barbell Bench Press",
    primaryMuscleGroups: ["Chest"],
    secondaryMuscleGroups: ["Front Delts", "Triceps"],
    notes: "",
    created_at: Date.now(),
  },
  {
    id: "conventional-deadlift",
    name: "Conventional Deadlift",
    primaryMuscleGroups: ["Hamstrings"],
    secondaryMuscleGroups: ["Glutes", "Lower Back", "Lats", "Forearms"],
    notes: "",
    created_at: Date.now(),
  },
  {
    id: "overhead-press",
    name: "Overhead Press",
    primaryMuscleGroups: ["Shoulders"],
    secondaryMuscleGroups: ["Triceps", "Upper Chest", "Core"],
    notes: "",
    created_at: Date.now(),
  },
  {
    id: "pull-ups",
    name: "Pull-ups",
    primaryMuscleGroups: ["Lats"],
    secondaryMuscleGroups: ["Biceps", "Upper Back", "Rear Delts"],
    notes: "",
    created_at: Date.now(),
  },
  {
    id: "push-ups",
    name: "Push-ups",
    primaryMuscleGroups: ["Chest"],
    secondaryMuscleGroups: ["Front Delts", "Triceps", "Core"],
    notes: "",
    created_at: Date.now(),
  },
  {
    id: "dumbbell-lateral-raise",
    name: "Dumbbell Lateral Raise",
    primaryMuscleGroups: ["Side Delts"],
    secondaryMuscleGroups: ["Traps"],
    notes: "",
    created_at: Date.now(),
  },
  {
    id: "bicep-curl",
    name: "Bicep Curl",
    primaryMuscleGroups: ["Biceps"],
    secondaryMuscleGroups: ["Forearms"],
    notes: "",
    created_at: Date.now(),
  },
];

const routines: Routine[] = [
  {
    id: "upper-day",
    name: "Upper Day",
    exercises: [
      {
        exerciseId: "barbell-bench-press",
        config: {
          progressionModel: "topset_backoff",
          progressionParams: {
            topSetTargetReps: 5,
            topSetTargetRpe: 9,
            backOffSets: 3,
            percentageDrop: 10,
            weightIncrement: 2.5,
          },
          targetSets: 4,
          notes: "",
        },
      },
      {
        exerciseId: "pull-ups",
        config: {
          progressionModel: "double",
          progressionParams: {
            targetSets: 3,
            minReps: 8,
            maxReps: 12,
            weightIncrement: 2.5,
          },
          minReps: 8,
          maxReps: 12,
          targetSets: 3,
          notes: "",
        },
      },
      {
        exerciseId: "overhead-press",
        config: {
          progressionModel: "linear",
          progressionParams: {
            targetSets: 3,
            targetReps: 5,
            weightIncrement: 2.5,
          },
          targetSets: 3,
          targetReps: 5,
          notes: "",
        },
      },
      {
        exerciseId: "dumbbell-lateral-raise",
        config: {
          progressionModel: "double",
          progressionParams: {
            targetSets: 3,
            minReps: 12,
            maxReps: 15,
            weightIncrement: 1.0,
          },
          minReps: 12,
          maxReps: 15,
          targetSets: 3,
          notes: "",
        },
      },
    ],
    created_at: Date.now(),
  },
  {
    id: "lower-day",
    name: "Lower Day",
    exercises: [
      {
        exerciseId: "barbell-back-squat",
        config: {
          progressionModel: "topset_backoff",
          progressionParams: {
            topSetTargetReps: 5,
            topSetTargetRpe: 8.5,
            backOffSets: 2,
            percentageDrop: 8,
            weightIncrement: 2.5,
          },
          targetSets: 3,
          notes: "",
        },
      },
      {
        exerciseId: "conventional-deadlift",
        config: {
          progressionModel: "linear",
          progressionParams: {
            targetSets: 1,
            targetReps: 5,
            weightIncrement: 5.0,
          },
          targetSets: 1,
          targetReps: 5,
          notes: "",
        },
      },
    ],
    created_at: Date.now(),
  },
];

const plan: Plan = {
  id: "powerbuilding-split",
  name: "Powerbuilding Split (Upper/Lower)",
  description:
    "A 4-day Upper/Lower split designed to maximize both strength peaking and hypertrophic muscle growth through autoregulated compound lifts and double progression accessory work.",
  routineIds: ["upper-day", "lower-day"],
  active: true,
  created_at: Date.now(),
  mesocycle: [
    { focus: "hypertrophy" },
    { focus: "hypertrophy" },
    { focus: "strength" },
    { focus: "strength" },
    { focus: "peaking" },
    { focus: "deload" },
  ],
};

/**
 * Checks if the database is empty, and if so, seeds it with initial default data.
 */
export async function seedDatabase() {
  const count = await db.exercises.count();
  if (count > 0) {
    console.log("YAFA: Database already contains data. Skipping seeding.");
    return;
  }

  console.log("YAFA: Database is empty. Seeding initial data...");

  try {
    await db.transaction(
      "rw",
      [db.exercises, db.routines, db.plans, db.measurementTypes],
      async () => {
        await db.exercises.bulkAdd(exercises);
        await db.routines.bulkAdd(routines);
        await db.plans.add(plan);
        await db.measurementTypes.bulkAdd(measurementTypes);
      },
    );
    console.log("YAFA: Seeding completed successfully!");
  } catch (error) {
    console.error("YAFA: Error seeding database", error);
    throw error;
  }
}
