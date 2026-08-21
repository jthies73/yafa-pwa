import type { Exercise, Set as LoggedSet, Workout } from "../db/types";
import { DEFAULT_RPE_MATRIX } from "../db/rpeMatrix";
import {
  bodyweightOffsetKg,
  liftSets,
  pickBodyweightAt,
} from "../engine/bodyweight";
import {
  impliedE1rm,
  isQualifyingSet,
  peakImpliedE1rm,
} from "../engine/matrix";
import type { TimestampedValue } from "./compute";

// ----------------------------------------------
// Post-workout summary (pure). Reports what happened in a session: duration,
// volume, the share of prescribed sets performed (adherence), and any PRs.
//
// Pipeline stage: finish workout (display only). Adherence is ANALYTICS-ONLY and
// never feeds the progression step — the engine's c1RM update is judged solely by
// the deterministic rules, not by this score.
// ----------------------------------------------

/** Completed vs planned working-set counts; overshoot flags junk volume. */
export interface SetCounts {
  completed: number;
  planned: number;
  overshoot: boolean;
}

/**
 * Adherence: the share of prescribed sets that were actually performed. Nothing
 * else deducts — training harder, heavier, or for different reps than prescribed
 * costs nothing, and off-script sets neither help nor hurt. Deliberately a number
 * the user can verify in their head from the set counts next to it.
 */
export interface AdherenceResult {
  score: number; // 0..100
  prescribedSets: number; // the denominator: what the prescription asked for
  completedSets: number; // how many of those were performed; never exceeds it
  missingSets: number;
}

export type PrType = "e1rm" | "rep" | "volume";

/** One progression marker earned in the session. */
export interface PrResult {
  exerciseId: string;
  exerciseName: string;
  type: PrType;
  e1rm?: number;
  weight?: number;
  reps?: number;
  rpe?: number;
  volume?: number;
}

export interface WorkoutSummary {
  durationMs: number;
  sets: SetCounts;
  volumeLoad: number;
  adherence: AdherenceResult;
  prs: PrResult[];
}

export interface SummaryInput {
  workout: Workout;
  history: Workout[]; // MUST exclude the current session
  exercisesById: Map<string, Exercise>;
  plannedCounts: Record<string, number>;
  // All logged bodyweight entries. e1RM PRs compare TOTAL loads: each session's
  // sets are lifted by ITS OWN workout-time bodyweight (capacity at the time),
  // so logging a new bodyweight never creates or destroys past PRs.
  bodyweightEntries?: TimestampedValue[];
}

const volumeOf = (sets: LoggedSet[]) =>
  sets.reduce((sum, s) => sum + s.actualWeight * s.actualReps, 0);

/** All sets logged for an exercise within a single workout (merged slots). */
function setsForExercise(workout: Workout, exerciseId: string): LoggedSet[] {
  return workout.exercises
    .filter((e) => e.exerciseId === exerciseId)
    .flatMap((e) => e.sets);
}

function computeAdherence(input: SummaryInput): AdherenceResult {
  const { workout, plannedCounts } = input;
  let prescribedSets = 0;
  let completedSets = 0;

  // Only prescribed exercises are counted, so an exercise logged off-script
  // cannot dilute the score — and a prescribed one that was never logged still
  // counts every set it asked for as missing.
  for (const [exerciseId, planned] of Object.entries(plannedCounts)) {
    const logged = setsForExercise(workout, exerciseId).length; // merged slots
    prescribedSets += planned;
    completedSets += Math.min(logged, planned);
  }

  return {
    score:
      prescribedSets === 0
        ? 100 // nothing was asked for, so nothing was missed
        : Math.round((completedSets / prescribedSets) * 100),
    prescribedSets,
    completedSets,
    missingSets: prescribedSets - completedSets,
  };
}

function detectPrs(input: SummaryInput): PrResult[] {
  const { workout, history, exercisesById } = input;
  const bwEntries = input.bodyweightEntries ?? [];
  const sessionBodyweight = pickBodyweightAt(bwEntries, workout.startTime);
  const prs: PrResult[] = [];
  const seen = new Set<string>();

  for (const we of workout.exercises) {
    if (seen.has(we.exerciseId)) continue;
    seen.add(we.exerciseId);
    const exercise = exercisesById.get(we.exerciseId);
    if (!exercise) continue;
    const matrix = exercise.rpeMatrix ?? DEFAULT_RPE_MATRIX;
    const sessionSets = setsForExercise(workout, we.exerciseId);

    // e1RM PR: the session's best honest set beats every prior honest set.
    // Both sides are lifted to total load with their own workout-time bodyweight.
    const sessionOffset = bodyweightOffsetKg(
      exercise.bodyweightFactor,
      sessionBodyweight,
    );
    const sessionPeak = peakImpliedE1rm(
      matrix,
      liftSets(sessionSets, sessionOffset),
    );
    if (sessionPeak) {
      let historicalBest = 0;
      for (const w of history) {
        const offset = bodyweightOffsetKg(
          exercise.bodyweightFactor,
          pickBodyweightAt(bwEntries, w.startTime),
        );
        for (const s of liftSets(setsForExercise(w, we.exerciseId), offset)) {
          if (!isQualifyingSet(s)) continue;
          historicalBest = Math.max(
            historicalBest,
            impliedE1rm(matrix, s.actualWeight, s.actualReps, s.actualRpe!),
          );
        }
      }
      if (sessionPeak.e1rm > historicalBest) {
        prs.push({
          exerciseId: we.exerciseId,
          exerciseName: exercise.name,
          type: "e1rm",
          e1rm: sessionPeak.e1rm,
          // Back to the ADDED weight the user loaded (the peak set is lifted).
          weight: sessionPeak.set.actualWeight - sessionOffset,
          reps: sessionPeak.set.actualReps,
          rpe: sessionPeak.set.actualRpe,
        });
      }
    }

    // Volume PR: session tonnage beats every prior session's for this exercise.
    const sessionVolume = volumeOf(sessionSets);
    if (sessionVolume > 0) {
      let historicalVolume = 0;
      for (const w of history) {
        historicalVolume = Math.max(
          historicalVolume,
          volumeOf(setsForExercise(w, we.exerciseId)),
        );
      }
      if (sessionVolume > historicalVolume) {
        prs.push({
          exerciseId: we.exerciseId,
          exerciseName: exercise.name,
          type: "volume",
          volume: sessionVolume,
        });
      }
    }
  }
  return prs;
}

export function computeWorkoutSummary(input: SummaryInput): WorkoutSummary {
  const { workout, plannedCounts } = input;

  const allSets = workout.exercises.flatMap((e) => e.sets);
  const completed = allSets.length;
  const planned = Object.values(plannedCounts).reduce((a, b) => a + b, 0);

  return {
    durationMs:
      workout.endTime && workout.startTime
        ? Math.max(0, workout.endTime - workout.startTime)
        : 0,
    sets: { completed, planned, overshoot: completed > planned },
    volumeLoad: volumeOf(allSets),
    adherence: computeAdherence(input),
    prs: detectPrs(input),
  };
}
