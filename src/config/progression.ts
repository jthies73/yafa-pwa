import type {
  ProgressionModelType,
  ProgressionParams,
  LinearProgressionParams,
  DoubleProgressionParams,
  TopSetProgressionParams,
  NoneProgressionParams,
} from "../db/types";

// Single source of truth for progression-param defaults, and the normalization
// contract that lets the rest of the pipeline assume a fully-populated config.
//
// Why this file exists: targetRpe / rpeCeiling / incrementUnit are REQUIRED on
// the param types, but configs are stored embedded in `routine.exercises[]` with
// no migration, so a config saved before those fields existed is missing them at
// runtime. `normalizeProgressionParams` backfills the gaps from the defaults
// below (saved values always win) and MUST be applied at every read boundary
// (ExerciseConfigSheet on load, WorkoutPreviewSheet, and the engine's service
// layer). Centralizing it here keeps the required-field typing honest and the
// per-model defaults DRY across the config UI, the preview, and the engine.

export const DEFAULT_PROGRESSION_PARAMS: {
  linear: LinearProgressionParams;
  double: DoubleProgressionParams;
  topset_backoff: TopSetProgressionParams;
  none: NoneProgressionParams;
} = {
  linear: {
    targetSets: 3,
    targetReps: 5,
    targetRpe: 8,
    rpeCeiling: 9,
    weightIncrement: 2.5,
    incrementUnit: "kg",
  },
  double: {
    targetSets: 3,
    minReps: 6,
    maxReps: 10,
    targetRpe: 8,
    rpeCeiling: 9,
    weightIncrement: 2.5,
    incrementUnit: "kg",
  },
  topset_backoff: {
    topSetTargetReps: 3,
    topSetTargetRpe: 8,
    rpeCeiling: 9,
    backOffSets: 3,
    backOffReps: 8,
    percentageDrop: 10,
    weightIncrement: 2.5,
    incrementUnit: "kg",
  },
  none: {
    targetSets: 3,
    targetReps: 8,
    targetRpe: 8,
  },
};

/**
 * Return progression params for `model` with every required field present:
 * defaults fill any gaps, saved values win. Pass `undefined` to get the bare
 * defaults (e.g. for a brand-new exercise). An explicit `undefined` value in
 * `saved` is treated as "absent" so it can never clobber a default.
 */
export function normalizeProgressionParams(
  model: ProgressionModelType,
  saved?: ProgressionParams,
): ProgressionParams {
  const merged: Record<string, unknown> = {
    ...DEFAULT_PROGRESSION_PARAMS[model],
  };
  if (saved) {
    for (const [key, value] of Object.entries(saved)) {
      if (value !== undefined) merged[key] = value;
    }
  }
  return merged as unknown as ProgressionParams;
}
