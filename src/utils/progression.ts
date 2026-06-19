import type {
  RoutineExerciseConfig,
  TopSetProgressionParams,
  LinearProgressionParams,
  DoubleProgressionParams,
} from "../db/types";

export function getConfigSetCount(config?: RoutineExerciseConfig): number {
  if (!config) return 3;
  const p = config.progressionParams;
  if (config.progressionModel === "topset_backoff") {
    return 1 + ((p as TopSetProgressionParams).backOffSets ?? 0);
  }
  return (
    (p as LinearProgressionParams | DoubleProgressionParams).targetSets ?? 3
  );
}
