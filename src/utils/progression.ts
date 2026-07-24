import type {
  RoutineExerciseConfig,
  TopSetProgressionParams,
  LinearProgressionParams,
  DoubleProgressionParams,
} from "../db/types";
import { normalizeProgressionParams } from "../config/progression";

export function getConfigSetCount(config?: RoutineExerciseConfig): number {
  if (!config) return 3;
  // Normalize so legacy configs missing optional params count the same sets the
  // engine actually prescribes.
  const p = normalizeProgressionParams(
    config.progressionModel,
    config.progressionParams,
  );
  if (config.progressionModel === "topset_backoff") {
    return 1 + (p as TopSetProgressionParams).backOffSets;
  }
  return (p as LinearProgressionParams | DoubleProgressionParams).targetSets;
}
