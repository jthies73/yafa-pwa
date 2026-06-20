import type { Exercise, Set as LoggedSet, Workout } from "../db/types";
import { DEFAULT_RPE_MATRIX } from "../db/rpeMatrix";
import {
  impliedE1rm,
  isQualifyingSet,
  peakImpliedE1rm,
} from "../engine/matrix";

// ----------------------------------------------
// Post-workout summary (pure). Reports what happened in a session: duration,
// volume, how closely it tracked the prescription (adherence), and any PRs.
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

export interface AdherenceResult {
  score: number; // 0..100
  prescribedSets: number;
  extraSets: number;
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
}

// Adherence penalty weights — TUNABLE. Ordered by importance per the spec: an RPE
// overshoot (trained too hard) is penalized heaviest, then rep deviation, then
// load deviation; undershooting RPE (easier than asked) is forgiven lightly.
// Off-script "trash volume" is a small capped penalty.
export const ADHERENCE_WEIGHTS = {
  rpeOver: 12, // per RPE point above target
  rpeUnder: 3, // per RPE point below target
  rep: 4, // per rep off target
  load: 0.5, // per percent off the target weight
  trashPerExtraSet: 5,
  trashCap: 20,
};

const volumeOf = (sets: LoggedSet[]) =>
  sets.reduce((sum, s) => sum + s.actualWeight * s.actualReps, 0);

/** All sets logged for an exercise within a single workout (merged slots). */
function setsForExercise(workout: Workout, exerciseId: string): LoggedSet[] {
  return workout.exercises
    .filter((e) => e.exerciseId === exerciseId)
    .flatMap((e) => e.sets);
}

function penaltyForSet(set: LoggedSet): number {
  let p = 0;
  if (set.targetRpe != null && set.actualRpe != null) {
    const d = set.actualRpe - set.targetRpe;
    p +=
      d > 0 ? d * ADHERENCE_WEIGHTS.rpeOver : -d * ADHERENCE_WEIGHTS.rpeUnder;
  }
  p += Math.abs(set.actualReps - set.targetReps) * ADHERENCE_WEIGHTS.rep;
  if (set.targetWeight > 0) {
    const loadPct =
      (Math.abs(set.actualWeight - set.targetWeight) / set.targetWeight) * 100;
    p += loadPct * ADHERENCE_WEIGHTS.load;
  }
  return p;
}

function computeAdherence(input: SummaryInput): AdherenceResult {
  const { workout, plannedCounts } = input;
  const judged: LoggedSet[] = []; // prescribed sets that carry a target
  let prescribedSets = 0;
  let extraSets = 0;

  const seen = new Set<string>();
  for (const we of workout.exercises) {
    if (seen.has(we.exerciseId)) continue; // merge duplicate slots once
    seen.add(we.exerciseId);
    const sets = setsForExercise(workout, we.exerciseId);
    const planned = plannedCounts[we.exerciseId] ?? sets.length;
    const prescribed = sets.slice(0, planned);
    prescribedSets += prescribed.length;
    extraSets += Math.max(0, sets.length - planned);
    // Only sets with a real target inform the deviation score.
    for (const s of prescribed)
      if (s.targetRpe != null || s.targetWeight > 0) judged.push(s);
  }

  const meanPenalty =
    judged.length === 0
      ? 0
      : judged.reduce((sum, s) => sum + penaltyForSet(s), 0) / judged.length;
  const trashPenalty = Math.min(
    ADHERENCE_WEIGHTS.trashCap,
    extraSets * ADHERENCE_WEIGHTS.trashPerExtraSet,
  );
  const score = Math.max(0, Math.min(100, 100 - meanPenalty - trashPenalty));
  return { score: Math.round(score), prescribedSets, extraSets };
}

function detectPrs(input: SummaryInput): PrResult[] {
  const { workout, history, exercisesById } = input;
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
    const sessionPeak = peakImpliedE1rm(matrix, sessionSets);
    if (sessionPeak) {
      let historicalBest = 0;
      for (const w of history) {
        for (const s of setsForExercise(w, we.exerciseId)) {
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
          weight: sessionPeak.set.actualWeight,
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
