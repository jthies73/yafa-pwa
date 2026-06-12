import { db } from "./db";
import type { Exercise, Routine, Plan, Workout } from "./types";

const exercises: Exercise[] = [
  {
    id: "barbell-back-squat",
    name: "Barbell Back Squat",
    primaryMuscleGroups: ["Quads"],
    secondaryMuscleGroups: ["Glutes", "Hamstrings", "Lower Back"],
    notes: "",
    bodyweightFactor: 0.0,
    created_at: Date.now(),
  },
  {
    id: "barbell-bench-press",
    name: "Barbell Bench Press",
    primaryMuscleGroups: ["Chest"],
    secondaryMuscleGroups: ["Front Delts", "Triceps"],
    notes: "",
    bodyweightFactor: 0.0,
    created_at: Date.now(),
  },
  {
    id: "conventional-deadlift",
    name: "Conventional Deadlift",
    primaryMuscleGroups: ["Hamstrings"],
    secondaryMuscleGroups: ["Glutes", "Lower Back", "Lats", "Forearms"],
    notes: "",
    bodyweightFactor: 0.0,
    created_at: Date.now(),
  },
  {
    id: "overhead-press",
    name: "Overhead Press",
    primaryMuscleGroups: ["Shoulders"],
    secondaryMuscleGroups: ["Triceps", "Upper Chest", "Core"],
    notes: "",
    bodyweightFactor: 0.0,
    created_at: Date.now(),
  },
  {
    id: "pull-ups",
    name: "Pull-ups",
    primaryMuscleGroups: ["Lats"],
    secondaryMuscleGroups: ["Biceps", "Upper Back", "Rear Delts"],
    notes: "",
    bodyweightFactor: 1.0,
    created_at: Date.now(),
  },
  {
    id: "push-ups",
    name: "Push-ups",
    primaryMuscleGroups: ["Chest"],
    secondaryMuscleGroups: ["Front Delts", "Triceps", "Core"],
    notes: "",
    bodyweightFactor: 0.65,
    created_at: Date.now(),
  },
  {
    id: "dumbbell-lateral-raise",
    name: "Dumbbell Lateral Raise",
    primaryMuscleGroups: ["Side Delts"],
    secondaryMuscleGroups: ["Traps"],
    notes: "",
    bodyweightFactor: 0.0,
    created_at: Date.now(),
  },
  {
    id: "bicep-curl",
    name: "Bicep Curl",
    primaryMuscleGroups: ["Biceps"],
    secondaryMuscleGroups: ["Forearms"],
    notes: "",
    bodyweightFactor: 0.0,
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

const workouts: Workout[] = [
  {
    id: "workout-past-1",
    routineId: "upper-day",
    startTime: Date.now() - 3 * 24 * 60 * 60 * 1000, // 3 days ago
    endTime: Date.now() - 3 * 24 * 60 * 60 * 1000 + 75 * 60 * 1000, // 75 mins later
    exercises: [
      {
        exerciseId: "barbell-bench-press",
        sets: [
          {
            id: "set-1",
            timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000 + 10 * 60 * 1000,
            targetReps: 5,
            actualReps: 5,
            targetWeight: 80,
            actualWeight: 80,
            targetRpe: 9,
            actualRpe: 9,
            failure: false,
          },
          {
            id: "set-2",
            timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000 + 15 * 60 * 1000,
            targetReps: 5,
            actualReps: 5,
            targetWeight: 72,
            actualWeight: 72,
            targetRpe: 8,
            actualRpe: 7.5,
            failure: false,
          },
          {
            id: "set-3",
            timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000 + 20 * 60 * 1000,
            targetReps: 5,
            actualReps: 5,
            targetWeight: 72,
            actualWeight: 72,
            targetRpe: 8,
            actualRpe: 8,
            failure: false,
          },
          {
            id: "set-4",
            timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000 + 25 * 60 * 1000,
            targetReps: 5,
            actualReps: 5,
            targetWeight: 72,
            actualWeight: 72,
            targetRpe: 8,
            actualRpe: 8.5,
            failure: false,
          },
        ],
      },
      {
        exerciseId: "pull-ups",
        sets: [
          {
            id: "set-5",
            timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000 + 35 * 60 * 1000,
            targetReps: 12,
            actualReps: 12,
            targetWeight: 0,
            actualWeight: 0,
            failure: false,
          },
          {
            id: "set-6",
            timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000 + 40 * 60 * 1000,
            targetReps: 12,
            actualReps: 10,
            targetWeight: 0,
            actualWeight: 0,
            failure: false,
          },
          {
            id: "set-7",
            timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000 + 45 * 60 * 1000,
            targetReps: 12,
            actualReps: 9,
            targetWeight: 0,
            actualWeight: 0,
            failure: true,
          },
        ],
      },
    ],
  },
];

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
      [db.exercises, db.routines, db.plans, db.workouts],
      async () => {
        await db.exercises.bulkAdd(exercises);
        await db.routines.bulkAdd(routines);
        await db.plans.add(plan);
        await db.workouts.bulkAdd(workouts);
      },
    );
    console.log("YAFA: Seeding completed successfully!");
  } catch (error) {
    console.error("YAFA: Error seeding database", error);
    throw error;
  }
}
