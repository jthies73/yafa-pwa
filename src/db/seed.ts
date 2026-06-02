import { db } from "./db";
import type { Exercise, Routine, Plan, Workout, AppState } from "./types";

// Standard evidence-based RTS (Reactive Training Systems) RPE-to-percentage-of-1RM matrix.
// Keyed by reps (1-10) and then by RPE (6-10). Value is percentage of 1RM as a decimal.
const DEFAULT_RPE_MATRIX: Record<number, Record<number, number>> = {
  1: {
    10: 1.0,
    9.5: 0.98,
    9: 0.96,
    8.5: 0.94,
    8: 0.92,
    7.5: 0.91,
    7: 0.89,
    6.5: 0.88,
    6: 0.86,
  },
  2: {
    10: 0.96,
    9.5: 0.94,
    9: 0.92,
    8.5: 0.91,
    8: 0.89,
    7.5: 0.88,
    7: 0.86,
    6.5: 0.84,
    6: 0.82,
  },
  3: {
    10: 0.92,
    9.5: 0.91,
    9: 0.89,
    8.5: 0.88,
    8: 0.86,
    7.5: 0.84,
    7: 0.82,
    6.5: 0.81,
    6: 0.79,
  },
  4: {
    10: 0.89,
    9.5: 0.88,
    9: 0.86,
    8.5: 0.84,
    8: 0.82,
    7.5: 0.81,
    7: 0.79,
    6.5: 0.77,
    6: 0.76,
  },
  5: {
    10: 0.86,
    9.5: 0.84,
    9: 0.82,
    8.5: 0.81,
    8: 0.79,
    7.5: 0.77,
    7: 0.76,
    6.5: 0.74,
    6: 0.72,
  },
  6: {
    10: 0.84,
    9.5: 0.82,
    9: 0.81,
    8.5: 0.79,
    8: 0.76,
    7.5: 0.74,
    7: 0.72,
    6.5: 0.7,
    6: 0.68,
  },
  7: {
    10: 0.81,
    9.5: 0.79,
    9: 0.76,
    8.5: 0.74,
    8: 0.72,
    7.5: 0.7,
    7: 0.68,
    6.5: 0.66,
    6: 0.64,
  },
  8: {
    10: 0.79,
    9.5: 0.76,
    9: 0.74,
    8.5: 0.72,
    8: 0.7,
    7.5: 0.68,
    7: 0.66,
    6.5: 0.64,
    6: 0.62,
  },
  9: {
    10: 0.76,
    9.5: 0.74,
    9: 0.72,
    8.5: 0.7,
    8: 0.68,
    7.5: 0.66,
    7: 0.64,
    6.5: 0.62,
    6: 0.59,
  },
  10: {
    10: 0.74,
    9.5: 0.72,
    9: 0.7,
    8.5: 0.68,
    8: 0.66,
    7.5: 0.64,
    7: 0.62,
    6.5: 0.59,
    6: 0.56,
  },
};

const exercises: Exercise[] = [
  {
    id: "barbell-back-squat",
    name: "Barbell Back Squat",
    primaryMuscleGroup: "Quads",
    secondaryMuscleGroups: ["Glutes", "Hamstrings", "Lower Back"],
    notes: "High bar or low bar. Focus on depth and control.",
    bodyweightFactor: 0.0,
    rpeMatrix: DEFAULT_RPE_MATRIX,
    created_at: Date.now(),
  },
  {
    id: "barbell-bench-press",
    name: "Barbell Bench Press",
    primaryMuscleGroup: "Chest",
    secondaryMuscleGroups: ["Front Delts", "Triceps"],
    notes: "Touch the chest, drive with legs, keep shoulder blades retracted.",
    bodyweightFactor: 0.0,
    rpeMatrix: DEFAULT_RPE_MATRIX,
    created_at: Date.now(),
  },
  {
    id: "conventional-deadlift",
    name: "Conventional Deadlift",
    primaryMuscleGroup: "Hamstrings",
    secondaryMuscleGroups: ["Glutes", "Lower Back", "Lats", "Forearms"],
    notes: "Keep bar close, pull shoulders back, drive through feet.",
    bodyweightFactor: 0.0,
    rpeMatrix: DEFAULT_RPE_MATRIX,
    created_at: Date.now(),
  },
  {
    id: "overhead-press",
    name: "Overhead Press",
    primaryMuscleGroup: "Shoulders",
    secondaryMuscleGroups: ["Triceps", "Upper Chest", "Core"],
    notes: "Barbell press from collarbone. Squeeze glutes and core.",
    bodyweightFactor: 0.0,
    rpeMatrix: DEFAULT_RPE_MATRIX,
    created_at: Date.now(),
  },
  {
    id: "pull-ups",
    name: "Pull-ups",
    primaryMuscleGroup: "Lats",
    secondaryMuscleGroups: ["Biceps", "Upper Back", "Rear Delts"],
    notes: "Full range of motion. Dead hang to chin over bar.",
    bodyweightFactor: 1.0,
    rpeMatrix: DEFAULT_RPE_MATRIX,
    created_at: Date.now(),
  },
  {
    id: "push-ups",
    name: "Push-ups",
    primaryMuscleGroup: "Chest",
    secondaryMuscleGroups: ["Front Delts", "Triceps", "Core"],
    notes:
      "Controlled eccentric, push up explosively. Maintain a straight line.",
    bodyweightFactor: 0.65,
    rpeMatrix: DEFAULT_RPE_MATRIX,
    created_at: Date.now(),
  },
  {
    id: "dumbbell-lateral-raise",
    name: "Dumbbell Lateral Raise",
    primaryMuscleGroup: "Side Delts",
    secondaryMuscleGroups: ["Traps"],
    notes: "Lead with elbows, slight forward lean, control the descent.",
    bodyweightFactor: 0.0,
    rpeMatrix: DEFAULT_RPE_MATRIX,
    created_at: Date.now(),
  },
  {
    id: "bicep-curl",
    name: "Bicep Curl",
    primaryMuscleGroup: "Biceps",
    secondaryMuscleGroups: ["Forearms"],
    notes: "Dumbbell or barbell curl. Avoid swinging or shoulder flexion.",
    bodyweightFactor: 0.0,
    rpeMatrix: DEFAULT_RPE_MATRIX,
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
          notes:
            "Heavy top set of 5 at RPE 9, then 3 back-off sets with 10% load reduction.",
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
          notes: "Increase weight when hitting 3 sets of 12 reps.",
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
          notes: "Add 2.5kg each session when all sets reach 5 reps.",
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
          notes: "Build up reps to 15, then increase weight.",
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
          notes: "Top set at RPE 8.5, followed by 2 back-off sets.",
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
          notes: "Single heavy set of 5. Progression: 5kg increment.",
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
};

const state: AppState & { id: string } = {
  id: "settings",
  activeWorkoutId: null,
  theme: "dark",
  units: "metric",
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
      [db.exercises, db.routines, db.plans, db.workouts, db.appState],
      async () => {
        await db.exercises.bulkAdd(exercises);
        await db.routines.bulkAdd(routines);
        await db.plans.add(plan);
        await db.workouts.bulkAdd(workouts);
        await db.appState.add(state);
      },
    );
    console.log("YAFA: Seeding completed successfully!");
  } catch (error) {
    console.error("YAFA: Error seeding database", error);
    throw error;
  }
}
