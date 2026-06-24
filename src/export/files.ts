import type {
  DoubleProgressionParams,
  Exercise,
  LinearProgressionParams,
  MeasurementEntry,
  MeasurementType,
  NoneProgressionParams,
  Plan,
  Routine,
  RoutineExercise,
  Set as LoggedSet,
  TopSetProgressionParams,
  Workout,
} from "../db/types";
import { DEFAULT_RPE_MATRIX } from "../db/rpeMatrix";
import { impliedE1rm, isQualifyingSet } from "../engine/matrix";
import { csvTable, formatDateTime, type CsvCell } from "../utils/csv";
import { roundTo } from "../utils/number";

// ----------------------------------------------
// Pure builders that turn in-memory rows into the CSV/text files of the export
// archive. No Dexie, no DOM — the archive layer gathers the data and hands it
// here, which keeps every shaping rule unit-testable.
// ----------------------------------------------

/** A `path → file-contents` map; the export layer's common currency. */
export type FileMap = Record<string, string>;

/** kg/cm → display number; the active-unit converter the archive passes in. */
export type ToDisplay = (value: number) => number;

const ILLEGAL = /[/\\:*?"<>|]/g;

/** Strip path-illegal characters; keep case/spaces so names stay readable. */
export function safeFileName(name: string): string {
  return name.replace(ILLEGAL, " ").replace(/\s+/g, " ").trim() || "unnamed";
}

/**
 * A unique `<dir>/<base>.<ext>` path within `used`, disambiguating same-named
 * entities with a short id suffix (then a counter, for the pathological case of
 * two identical ids). Records the chosen path in `used`.
 */
export function uniquePath(
  dir: string,
  base: string,
  id: string,
  ext: string,
  used: Set<string>,
): string {
  let name = base;
  if (used.has(`${dir}/${name}.${ext}`)) name = `${base} (${id.slice(0, 8)})`;
  let candidate = `${dir}/${name}.${ext}`;
  let n = 2;
  while (used.has(candidate)) candidate = `${dir}/${name} (${n++}).${ext}`;
  used.add(candidate);
  return candidate;
}

// ---- exercises/ : one CSV per exercise with logged sets ----

/**
 * `exercises/<name>.csv` for every exercise that has at least one logged set,
 * columns `timestamp,reps,weight,rpe` (actual values). Weight is the raw stored
 * value in kg — this is source-of-truth data, never unit-converted. Exercises
 * without logged sets are skipped.
 */
export function buildExerciseFiles(
  workouts: Workout[],
  exercisesById: Map<string, Exercise>,
): FileMap {
  const setsById = new Map<string, LoggedSet[]>();
  for (const w of workouts) {
    for (const wEx of w.exercises) {
      if (!wEx.sets.length) continue;
      const list = setsById.get(wEx.exerciseId) ?? [];
      list.push(...wEx.sets);
      setsById.set(wEx.exerciseId, list);
    }
  }

  const files: FileMap = {};
  const used = new Set<string>();
  for (const [exerciseId, sets] of setsById) {
    const rows: CsvCell[][] = [["timestamp", "reps", "weight", "rpe"]];
    for (const s of [...sets].sort((a, b) => a.timestamp - b.timestamp)) {
      rows.push([
        formatDateTime(s.timestamp),
        s.actualReps,
        roundTo(s.actualWeight, 2),
        s.actualRpe ?? "",
      ]);
    }
    const name = exercisesById.get(exerciseId)?.name ?? exerciseId;
    files[
      uniquePath("exercises", safeFileName(name), exerciseId, "csv", used)
    ] = csvTable(rows);
  }
  return files;
}

// ---- measurements/ : one CSV per measurement type with entries ----

/**
 * `measurements/<name>.csv` for every type that has entries, columns
 * `timestamp,value`. Values are the stored source-of-truth unit (kg/cm/raw %).
 */
export function buildMeasurementFiles(
  types: MeasurementType[],
  entriesByType: Map<string, MeasurementEntry[]>,
): FileMap {
  const files: FileMap = {};
  const used = new Set<string>();
  for (const type of types) {
    const entries = (entriesByType.get(type.id) ?? [])
      .slice()
      .sort((a, b) => a.timestamp - b.timestamp);
    if (!entries.length) continue;
    const rows: CsvCell[][] = [["timestamp", "value"]];
    for (const e of entries) rows.push([formatDateTime(e.timestamp), e.value]);
    files[
      uniquePath("measurements", safeFileName(type.name), type.id, "csv", used)
    ] = csvTable(rows);
  }
  return files;
}

// ---- plans/ : one CSV per plan, listing its routines + complete configs ----

const PROGRESSION_LABELS: Record<string, string> = {
  linear: "Linear",
  double: "Double",
  topset_backoff: "Top Set + Back-Off",
  none: "None",
};

// Every progression-param field, each optional, so a single row can carry the
// complete config of any model (only the fields its model uses are filled in).
type AllParams = Partial<
  LinearProgressionParams &
    DoubleProgressionParams &
    TopSetProgressionParams &
    NoneProgressionParams
>;

const PLAN_HEADER = [
  "Routine",
  "Exercise",
  "Primary Muscle Groups",
  "Secondary Muscle Groups",
  "Progression Model",
  "Target Sets",
  "Target Reps",
  "Min Reps",
  "Max Reps",
  "Target RPE",
  "RPE Ceiling",
  "Top Set Reps",
  "Top Set RPE",
  "Back-Off Sets",
  "Back-Off Reps",
  "Back-Off Drop %",
  "Weight Increment",
  "Increment Unit",
  "Locked Fields",
  "Notes",
] as const;

/** One fully-specified row (cells) for a routine-exercise slot. */
function planRow(
  routineName: string,
  rEx: RoutineExercise,
  exercisesById: Map<string, Exercise>,
  toDisplayWeight: ToDisplay,
  weightUnitLabel: string,
): CsvCell[] {
  const exercise = exercisesById.get(rEx.exerciseId);
  const config = rEx.config;
  const p: AllParams = config?.progressionParams ?? {};

  // The increment is either a raw percent of c1RM or an absolute load (kg →
  // active unit); the Increment Unit column says which so the value is unambiguous.
  const isPercent = p.incrementUnit === "percent";
  const increment =
    p.weightIncrement === undefined
      ? ""
      : isPercent
        ? p.weightIncrement
        : roundTo(toDisplayWeight(p.weightIncrement), 2);
  const incrementUnit =
    p.weightIncrement === undefined ? "" : isPercent ? "%" : weightUnitLabel;

  return [
    routineName,
    exercise?.name ?? rEx.exerciseId,
    exercise?.primaryMuscleGroups.join(", ") ?? "",
    exercise?.secondaryMuscleGroups?.join(", ") ?? "",
    config
      ? (PROGRESSION_LABELS[config.progressionModel] ?? config.progressionModel)
      : "",
    p.targetSets ?? "",
    p.targetReps ?? "",
    p.minReps ?? "",
    p.maxReps ?? "",
    p.targetRpe ?? "",
    p.rpeCeiling ?? "",
    p.topSetTargetReps ?? "",
    p.topSetTargetRpe ?? "",
    p.backOffSets ?? "",
    p.backOffReps ?? "",
    p.percentageDrop ?? "",
    increment,
    incrementUnit,
    config?.lockedFields?.join(", ") ?? "",
    config?.notes ?? "",
  ];
}

/**
 * `plans/<name>.csv` for each plan — its routines (in plan order) with the
 * complete progression config of every exercise. Routines not attached to any
 * plan are collected into `plans/Unassigned Routines.csv` so nothing is lost.
 */
export function buildPlanFiles(
  plans: Plan[],
  routines: Routine[],
  exercisesById: Map<string, Exercise>,
  toDisplayWeight: ToDisplay,
  weightUnitLabel: string,
): FileMap {
  const routinesById = new Map(routines.map((r) => [r.id, r]));
  const files: FileMap = {};
  const used = new Set<string>();

  const csvFor = (routineList: Routine[]): string => {
    const rows: CsvCell[][] = [[...PLAN_HEADER]];
    for (const routine of routineList) {
      for (const rEx of routine.exercises) {
        rows.push(
          planRow(
            routine.name,
            rEx,
            exercisesById,
            toDisplayWeight,
            weightUnitLabel,
          ),
        );
      }
    }
    return csvTable(rows);
  };

  for (const plan of plans) {
    const planRoutines = plan.routineIds
      .map((id) => routinesById.get(id))
      .filter((r): r is Routine => !!r);
    files[uniquePath("plans", safeFileName(plan.name), plan.id, "csv", used)] =
      csvFor(planRoutines);
  }

  const planRoutineIds = new Set(plans.flatMap((p) => p.routineIds));
  const orphans = routines.filter((r) => !planRoutineIds.has(r.id));
  if (orphans.length) {
    files[
      uniquePath("plans", "Unassigned Routines", "unassigned", "csv", used)
    ] = csvFor(orphans);
  }

  return files;
}

// ---- workouts/history.csv : flat per-set log across all sessions ----

/**
 * Every logged set with full session context, chronologically. Weights are
 * given in kg (the stored unit); when the active display unit is not kg, a
 * parallel column in that unit is added alongside each weight.
 */
export function buildHistoryCsv(
  workouts: Workout[],
  plans: Plan[],
  routines: Routine[],
  exercisesById: Map<string, Exercise>,
  toDisplayWeight: ToDisplay,
  weightUnitLabel: string,
): string {
  const routinesById = new Map(routines.map((r) => [r.id, r]));
  const plansByRoutine = new Map<string, string[]>();
  for (const plan of plans) {
    for (const rId of plan.routineIds) {
      const list = plansByRoutine.get(rId) ?? [];
      list.push(plan.name);
      plansByRoutine.set(rId, list);
    }
  }

  // kg is the source of truth; add a display-unit column only when it differs.
  const dual = weightUnitLabel !== "kg";
  const weightCols = (label: string): string[] =>
    dual
      ? [`${label} (kg)`, `${label} (${weightUnitLabel})`]
      : [`${label} (kg)`];
  const weightVals = (kg: number | null): CsvCell[] =>
    kg === null
      ? weightCols("").map(() => "")
      : dual
        ? [roundTo(kg, 2), roundTo(toDisplayWeight(kg), 2)]
        : [roundTo(kg, 2)];

  const rows: CsvCell[][] = [
    [
      "Date",
      "Plan(s)",
      "Routine",
      "Exercise",
      "Set Number",
      "Target Reps",
      "Actual Reps",
      ...weightCols("Target Weight"),
      ...weightCols("Actual Weight"),
      "Target RPE",
      "Actual RPE",
      ...weightCols("Estimated 1RM"),
    ],
  ];

  const sorted = workouts.slice().sort((a, b) => a.startTime - b.startTime);
  for (const w of sorted) {
    const routineName =
      routinesById.get(w.routineId)?.name ?? "Unknown Routine";
    const plansString = (plansByRoutine.get(w.routineId) ?? []).join(", ");
    const date = formatDateTime(w.startTime);

    for (const wEx of w.exercises) {
      const exercise = exercisesById.get(wEx.exerciseId);
      const exerciseName = exercise?.name ?? "Unknown Exercise";
      const matrix = exercise?.rpeMatrix ?? DEFAULT_RPE_MATRIX;

      wEx.sets.forEach((set, idx) => {
        const e1rm = isQualifyingSet(set)
          ? impliedE1rm(
              matrix,
              set.actualWeight,
              set.actualReps,
              set.actualRpe!,
            )
          : null;
        rows.push([
          date,
          plansString,
          routineName,
          exerciseName,
          idx + 1,
          set.targetReps,
          set.actualReps,
          ...weightVals(set.targetWeight),
          ...weightVals(set.actualWeight),
          set.targetRpe ?? "",
          set.actualRpe ?? "",
          ...weightVals(e1rm),
        ]);
      });
    }
  }

  return csvTable(rows);
}

// ---- README.txt : manifest ----

export interface ReadmeMeta {
  version: string;
  exportedAt: number;
  weightUnit: string;
  lengthUnit: string;
}

/** Short plain-text guide to the archive contents. */
export function buildReadme(meta: ReadmeMeta): string {
  return [
    `YAFA data export — v${meta.version} · ${formatDateTime(meta.exportedAt)}`,
    "",
    "backup.json    Full snapshot — re-import to restore everything.",
    "exercises/     Per exercise: timestamp, reps, weight (kg), rpe.",
    "measurements/  Per measurement: timestamp, value (kg / cm / %).",
    "chart_data/    Per analytics chart, full history.",
    "plans/         Per plan: routines + full progression config.",
    "workouts/      history.csv — every set with session context.",
    "",
    `Stored data (exercises, measurements) is in kg/cm; everything else uses your`,
    `display unit (${meta.weightUnit} / ${meta.lengthUnit}).`,
  ].join("\n");
}
