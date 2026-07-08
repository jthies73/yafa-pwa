import { db } from "./db";
import { BODYWEIGHT_TYPE_ID } from "./measurements";
import type {
  Exercise,
  MeasurementType,
  Routine,
  Plan,
  AnalyticsChartConfig,
} from "./types";

const measurementTypes: MeasurementType[] = [
  {
    id: BODYWEIGHT_TYPE_ID,
    name: "Bodyweight",
    category: "WEIGHT",
    isSystem: true,
    created_at: Date.now(),
  },
];

const defaultCharts: AnalyticsChartConfig[] = [
  {
    id: "default-workouts-per-week",
    name: "Workouts Per Week",
    sourceKind: "global",
    metric: "workouts",
    bucket: "week",
    order: 0,
    created_at: Date.now(),
  },
];

const exercises: Exercise[] = [
  // ── jthies73's favourites ────────────────────────────────────────────────────
  {
    id: "barbell-back-squat",
    name: "Barbell Back Squat",
    primaryMuscleGroups: ["Quads", "Glutes", "Hamstrings"],
    secondaryMuscleGroups: ["Lower Back", "Core"],
    notes: "",
    created_at: Date.now(),
  },
  {
    id: "barbell-bench-press",
    name: "Barbell Bench Press",
    primaryMuscleGroups: ["Lower Chest", "Upper Chest"],
    secondaryMuscleGroups: ["Front Delts", "Triceps", "Core"],
    notes: "",
    created_at: Date.now(),
  },
  {
    id: "bicep-curl",
    name: "Barbell Bicep Curl",
    primaryMuscleGroups: ["Biceps"],
    secondaryMuscleGroups: ["Forearms"],
    notes: "",
    created_at: Date.now(),
  },
  {
    id: "conventional-deadlift",
    name: "Conventional Deadlift",
    primaryMuscleGroups: ["Hamstrings", "Glutes", "Lower Back"],
    secondaryMuscleGroups: ["Quads", "Lats", "Traps", "Forearms"],
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
    id: "overhead-press",
    name: "Overhead Press",
    primaryMuscleGroups: ["Front Delts", "Side Delts"],
    secondaryMuscleGroups: ["Triceps", "Upper Chest", "Core"],
    notes: "",
    created_at: Date.now(),
  },
  {
    id: "hyperextensions",
    name: "Hyperextensions",
    primaryMuscleGroups: ["Hamstrings", "Glutes", "Lower Back"],
    secondaryMuscleGroups: [],
    notes: "",
    created_at: Date.now(),
  },
  {
    id: "leg-extensions",
    name: "Leg Extensions",
    primaryMuscleGroups: ["Quads"],
    secondaryMuscleGroups: [],
    notes: "",
    created_at: Date.now(),
  },
  {
    id: "leg-curl",
    name: "Leg Curl",
    primaryMuscleGroups: ["Hamstrings"],
    secondaryMuscleGroups: [],
    notes: "",
    created_at: Date.now(),
  },
  {
    id: "leg-press",
    name: "Leg Press",
    primaryMuscleGroups: ["Quads", "Hamstrings", "Glutes"],
    secondaryMuscleGroups: ["Calves"],
    notes: "",
    created_at: Date.now(),
  },
  {
    id: "pendley-row",
    name: "Pendley Row",
    primaryMuscleGroups: ["Upper Back"],
    secondaryMuscleGroups: ["Lats", "Lower Back"],
    notes: "",
    created_at: Date.now(),
  },
  {
    id: "pull-ups-weighted",
    name: "Pull Ups (Weighted)",
    primaryMuscleGroups: ["Lats", "Upper Back"],
    secondaryMuscleGroups: ["Biceps", "Forearms"],
    notes: "",
    created_at: Date.now(),
  },
  {
    id: "seated-row",
    name: "Seated Row",
    primaryMuscleGroups: ["Upper Back", "Lats"],
    secondaryMuscleGroups: ["Forearms"],
    notes: "",
    created_at: Date.now(),
  },
  {
    id: "triceps-pushdowns",
    name: "Triceps Pushdowns",
    primaryMuscleGroups: ["Triceps"],
    secondaryMuscleGroups: [],
    notes: "",
    created_at: Date.now(),
  },
  // ── Other ────────────────────────────────────────────────────
  // TODO: fill this with more exercises
];

const routines: Routine[] = [
  {
    id: "upper-body",
    name: "Upper Body",
    exercises: [
      {
        exerciseId: "overhead-press",
        config: {
          progressionModel: "topset_backoff",
          progressionParams: {
            topSetTargetReps: 6,
            topSetTargetRpe: 8,
            rpeCeiling: 9.5,
            backOffSets: 3,
            backOffRpe: 7,
            percentageDrop: 10,
            weightIncrement: 2.5,
            incrementUnit: "kg",
            fatigueReduction: 10,
            fatigueReductionUnit: "percent",
          },
        },
      },
      {
        exerciseId: "pull-ups-weighted",
        config: {
          progressionModel: "double",
          progressionParams: {
            targetSets: 2,
            minReps: 6,
            maxReps: 10,
            targetRpe: 8,
            rpeCeiling: 9,
            weightIncrement: 2.5,
            incrementUnit: "kg",
            fatigueReduction: 10,
            fatigueReductionUnit: "percent",
          },
          minReps: 6,
          maxReps: 10,
          targetSets: 2,
        },
      },
      {
        exerciseId: "barbell-bench-press",
        config: {
          progressionModel: "linear",
          progressionParams: {
            targetSets: 2,
            targetReps: 10,
            targetRpe: 8,
            rpeCeiling: 9,
            weightIncrement: 2.5,
            incrementUnit: "kg",
            fatigueReduction: 10,
            fatigueReductionUnit: "percent",
          },
          targetSets: 2,
          targetReps: 10,
        },
      },
      {
        exerciseId: "seated-row",
        config: {
          progressionModel: "double",
          progressionParams: {
            targetSets: 2,
            minReps: 8,
            maxReps: 12,
            targetRpe: 8,
            rpeCeiling: 9,
            weightIncrement: 2.5,
            incrementUnit: "kg",
            fatigueReduction: 10,
            fatigueReductionUnit: "percent",
          },
          minReps: 8,
          maxReps: 12,
          targetSets: 2,
        },
      },
      {
        exerciseId: "triceps-pushdowns",
        config: {
          progressionModel: "double",
          progressionParams: {
            targetSets: 3,
            minReps: 12,
            maxReps: 15,
            targetRpe: 8,
            rpeCeiling: 9,
            weightIncrement: 2.5,
            incrementUnit: "kg",
            fatigueReduction: 10,
            fatigueReductionUnit: "percent",
          },
          minReps: 12,
          maxReps: 15,
          targetSets: 3,
        },
      },
    ],
    created_at: Date.now(),
  },
  {
    id: "lower-body",
    name: "Lower Body",
    exercises: [
      {
        exerciseId: "barbell-back-squat",
        config: {
          progressionModel: "topset_backoff",
          progressionParams: {
            topSetTargetReps: 5,
            topSetTargetRpe: 8,
            rpeCeiling: 9.5,
            backOffSets: 2,
            backOffRpe: 7,
            percentageDrop: 10,
            weightIncrement: 2.5,
            incrementUnit: "kg",
            fatigueReduction: 10,
            fatigueReductionUnit: "percent",
          },
        },
      },
      {
        exerciseId: "hyperextensions",
        config: {
          progressionModel: "linear",
          progressionParams: {
            targetSets: 2,
            targetReps: 10,
            targetRpe: 9,
            rpeCeiling: 9.5,
            weightIncrement: 2.5,
            incrementUnit: "kg",
            fatigueReduction: 10,
            fatigueReductionUnit: "percent",
          },
          targetSets: 2,
          targetReps: 10,
        },
      },
      {
        exerciseId: "leg-extensions",
        config: {
          progressionModel: "double",
          progressionParams: {
            targetSets: 2,
            minReps: 10,
            maxReps: 15,
            targetRpe: 8,
            rpeCeiling: 9,
            weightIncrement: 2.5,
            incrementUnit: "kg",
            fatigueReduction: 10,
            fatigueReductionUnit: "percent",
          },
          minReps: 10,
          maxReps: 15,
          targetSets: 2,
        },
      },
    ],
    created_at: Date.now(),
  },
  {
    id: "full-body",
    name: "Full Body",
    exercises: [
      {
        exerciseId: "conventional-deadlift",
        config: {
          progressionModel: "topset_backoff",
          progressionParams: {
            topSetTargetReps: 4,
            topSetTargetRpe: 8,
            rpeCeiling: 9.5,
            backOffSets: 3,
            backOffRpe: 7,
            percentageDrop: 10,
            weightIncrement: 5,
            incrementUnit: "kg",
            fatigueReduction: 10,
            fatigueReductionUnit: "percent",
          },
        },
      },
      {
        exerciseId: "barbell-bench-press",
        config: {
          progressionModel: "double",
          progressionParams: {
            targetSets: 2,
            minReps: 8,
            maxReps: 12,
            targetRpe: 8,
            rpeCeiling: 9,
            weightIncrement: 2.5,
            incrementUnit: "kg",
            fatigueReduction: 10,
            fatigueReductionUnit: "percent",
          },
          minReps: 8,
          maxReps: 12,
          targetSets: 2,
        },
      },
      {
        exerciseId: "pendley-row",
        config: {
          progressionModel: "linear",
          progressionParams: {
            targetSets: 2,
            targetReps: 8,
            targetRpe: 9,
            rpeCeiling: 9.5,
            weightIncrement: 2.5,
            incrementUnit: "kg",
            fatigueReduction: 10,
            fatigueReductionUnit: "percent",
          },
          targetSets: 2,
          targetReps: 8,
        },
      },
      {
        exerciseId: "bicep-curl",
        config: {
          progressionModel: "double",
          progressionParams: {
            targetSets: 2,
            minReps: 12,
            maxReps: 15,
            targetRpe: 8,
            rpeCeiling: 9,
            weightIncrement: 2.5,
            incrementUnit: "kg",
            fatigueReduction: 10,
            fatigueReductionUnit: "percent",
          },
          minReps: 12,
          maxReps: 15,
          targetSets: 2,
        },
      },
    ],
    created_at: Date.now(),
  },
];

const plans: Plan[] = [
  {
    id: "plan-powerbuilding-2026",
    name: "Powerbuilding 2026",
    routineIds: ["upper-body", "lower-body", "full-body"],
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
      [
        db.exercises,
        db.routines,
        db.plans,
        db.measurementTypes,
        db.analyticsCharts,
      ],
      async () => {
        await db.exercises.bulkAdd(exercises);
        await db.routines.bulkAdd(routines);
        await db.plans.bulkAdd(plans);
        await db.measurementTypes.bulkAdd(measurementTypes);
        await db.analyticsCharts.bulkAdd(defaultCharts);
      },
    );
    console.log("YAFA: Seeding completed successfully!");
  } catch (error) {
    console.error("YAFA: Error seeding database", error);
    throw error;
  }
}
