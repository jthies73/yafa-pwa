import { db } from "./db";
import { BODYWEIGHT_TYPE_ID } from "./measurements";
import type {
  AnalyticsChartConfig,
  MeasurementEntry,
  Set as LoggedSet,
  Workout,
  WorkoutExercise,
} from "./types";

// ----------------------------------------------
// DEVELOPMENT-ONLY sample data. Kept in its own module and dynamically imported
// behind `import.meta.env.DEV` (see main.ts) so neither this code nor the
// generated arrays ship in production builds. Seeds ~12 weeks of logged
// workouts + bodyweight entries plus one chart per export shape, so the CSV
// export can be exercised end-to-end. Assumes seedDatabase() has already added
// the base exercises / plan / Bodyweight measurement type.
// ----------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const SAMPLE_WEEKS = 12;

interface SampleSlot {
  exerciseId: string;
  sets: number;
  reps: number; // ≤ 10 so the top set qualifies for an e1RM estimate
  topRpe: number; // ≥ 8 on the first set → qualifying e1RM set
  baseWeight: number; // kg at the oldest week; grows over time
}

// One session per routine per week; dayOffset spaces them within the week.
const sampleSessions: {
  routineId: string;
  dayOffset: number;
  slots: SampleSlot[];
}[] = [
  {
    routineId: "upper-body",
    dayOffset: 6,
    slots: [
      {
        exerciseId: "overhead-press",
        sets: 3,
        reps: 6,
        topRpe: 8,
        baseWeight: 45,
      },
      {
        exerciseId: "pull-ups-weighted",
        sets: 2,
        reps: 8,
        topRpe: 8,
        baseWeight: 7.5,
      },
      {
        exerciseId: "barbell-bench-press",
        sets: 3,
        reps: 8,
        topRpe: 8,
        baseWeight: 75,
      },
      {
        exerciseId: "seated-row",
        sets: 2,
        reps: 10,
        topRpe: 8,
        baseWeight: 60,
      },
      {
        exerciseId: "triceps-pushdowns",
        sets: 3,
        reps: 12,
        topRpe: 8,
        baseWeight: 25,
      },
    ],
  },
  {
    routineId: "lower-body",
    dayOffset: 4,
    slots: [
      {
        exerciseId: "barbell-back-squat",
        sets: 3,
        reps: 5,
        topRpe: 8,
        baseWeight: 95,
      },
      {
        exerciseId: "hyperextensions",
        sets: 2,
        reps: 10,
        topRpe: 8,
        baseWeight: 20,
      },
      {
        exerciseId: "leg-extensions",
        sets: 2,
        reps: 12,
        topRpe: 8,
        baseWeight: 50,
      },
    ],
  },
  {
    routineId: "full-body",
    dayOffset: 2,
    slots: [
      {
        exerciseId: "conventional-deadlift",
        sets: 3,
        reps: 4,
        topRpe: 8,
        baseWeight: 115,
      },
      {
        exerciseId: "barbell-bench-press",
        sets: 2,
        reps: 10,
        topRpe: 8,
        baseWeight: 70,
      },
      {
        exerciseId: "pendley-row",
        sets: 2,
        reps: 8,
        topRpe: 8,
        baseWeight: 65,
      },
      {
        exerciseId: "bicep-curl",
        sets: 2,
        reps: 12,
        topRpe: 8,
        baseWeight: 25,
      },
    ],
  },
];

const roundToHalf = (w: number): number => Math.round(w / 2.5) * 2.5;

function buildWorkouts(now: number): Workout[] {
  const workouts: Workout[] = [];
  let n = 0;
  // Oldest week first so weights trend upward toward the present.
  for (let weeksAgo = SAMPLE_WEEKS - 1; weeksAgo >= 0; weeksAgo--) {
    const progress = 1 + (SAMPLE_WEEKS - 1 - weeksAgo) * 0.012; // ~+13% over 12 weeks
    for (const session of sampleSessions) {
      const startTime =
        now - (weeksAgo * 7 + session.dayOffset) * DAY_MS - 18 * HOUR_MS;
      const exercises: WorkoutExercise[] = session.slots.map((slot) => {
        const weight = roundToHalf(slot.baseWeight * progress);
        const sets: LoggedSet[] = Array.from({ length: slot.sets }, (_, i) => ({
          id: `dev-set-${n++}`,
          timestamp: startTime + i * 3 * 60 * 1000,
          targetReps: slot.reps,
          actualReps: slot.reps,
          targetWeight: weight,
          actualWeight: weight,
          targetRpe: slot.topRpe,
          // First set is the top set (qualifies for e1RM); back-offs sit lower.
          actualRpe: i === 0 ? slot.topRpe : Math.max(6, slot.topRpe - 1.5),
          failure: false,
        }));
        return { exerciseId: slot.exerciseId, sets };
      });
      workouts.push({
        id: `dev-workout-${n++}`,
        routineId: session.routineId,
        startTime,
        endTime: startTime + HOUR_MS,
        exercises,
      });
    }
  }
  return workouts;
}

function buildBodyweight(now: number): MeasurementEntry[] {
  const entries: MeasurementEntry[] = [];
  for (let weeksAgo = SAMPLE_WEEKS - 1; weeksAgo >= 0; weeksAgo--) {
    const value = 82 - (SAMPLE_WEEKS - 1 - weeksAgo) * 0.25; // 82 → ~79.25 kg
    entries.push({
      id: `dev-bw-${weeksAgo}`,
      measurementTypeId: BODYWEIGHT_TYPE_ID,
      value: Math.round(value * 10) / 10,
      timestamp: now - weeksAgo * 7 * DAY_MS,
    });
  }
  return entries;
}

// One chart per export shape: stacked muscle, value bar, e1RM line, measurement line.
function buildCharts(now: number): AnalyticsChartConfig[] {
  return [
    {
      id: "dev-lower-body-sets",
      name: "Lower Body Sets",
      sourceKind: "muscle",
      muscleGroups: ["Quads", "Hamstrings", "Glutes", "Calves"],
      metric: "sets",
      bucket: "week",
      order: 1,
      created_at: now,
    },
    {
      id: "dev-squat-volume",
      name: "Squat Volume",
      sourceKind: "exercise",
      exerciseId: "barbell-back-squat",
      metric: "volume",
      bucket: "week",
      order: 2,
      created_at: now,
    },
    {
      id: "dev-bench-e1rm",
      name: "Bench e1RM",
      sourceKind: "exercise",
      exerciseId: "barbell-bench-press",
      metric: "e1rm",
      bucket: "week",
      order: 3,
      created_at: now,
    },
    {
      id: "dev-bodyweight",
      name: "Bodyweight",
      sourceKind: "measurement",
      measurementTypeId: BODYWEIGHT_TYPE_ID,
      metric: "value",
      bucket: "week",
      order: 4,
      created_at: now,
    },
  ];
}

/**
 * Seeds throwaway workouts, bodyweight entries and demo charts. Idempotent: a
 * no-op once any workout exists, so it only populates a freshly-seeded dev DB.
 */
export async function seedDevSampleData(): Promise<void> {
  if ((await db.workouts.count()) > 0) return;

  const now = Date.now();
  console.log("YAFA [dev]: seeding sample workouts, measurements and charts…");

  await db.transaction(
    "rw",
    [db.workouts, db.measurementEntries, db.analyticsCharts],
    async () => {
      await db.workouts.bulkAdd(buildWorkouts(now));
      await db.measurementEntries.bulkAdd(buildBodyweight(now));
      await db.analyticsCharts.bulkAdd(buildCharts(now));
    },
  );
}
