import { exportData } from "../db/backup";
import { APP_VERSION } from "../config/version";
import type { MeasurementEntry } from "../db/types";
import { buildChartSeries } from "../analytics/service";
import {
  buildChartCsv,
  chartCsvOptions,
  type UnitView,
} from "../analytics/chartCsv";
import { chartTitle } from "../analytics/presentation";
import {
  buildExerciseFiles,
  buildHistoryCsv,
  buildMeasurementFiles,
  buildPlanFiles,
  buildReadme,
  safeFileName,
  uniquePath,
  type FileMap,
} from "./files";
import { zipTextFiles } from "../utils/zip";

// ----------------------------------------------
// Assembles the export ZIP: gathers every table once via exportData(), shapes
// the human-readable folders with the pure builders in ./files, and folds the
// raw backup.json (the re-importable file) in at the root. Unit conversion is
// the caller's — it passes the active weight/length display views.
// ----------------------------------------------

export interface ExportUnits {
  weight: UnitView;
  length: UnitView;
}

/** Build the full export archive as a downloadable ZIP Blob. */
export async function buildExportArchive(units: ExportUnits): Promise<Blob> {
  const backup = await exportData();
  const { data } = backup;
  const exercises = data.exercises ?? [];
  const workouts = data.workouts ?? [];
  const plans = data.plans ?? [];
  const routines = data.routines ?? [];
  const measurementTypes = data.measurementTypes ?? [];
  const measurementEntries = data.measurementEntries ?? [];
  const charts = data.analyticsCharts ?? [];

  const exercisesById = new Map(exercises.map((e) => [e.id, e]));
  const entriesByType = new Map<string, MeasurementEntry[]>();
  for (const e of measurementEntries) {
    const list = entriesByType.get(e.measurementTypeId) ?? [];
    list.push(e);
    entriesByType.set(e.measurementTypeId, list);
  }

  const files: FileMap = {
    "backup.json": JSON.stringify(backup, null, 2),
    ...buildExerciseFiles(workouts, exercisesById),
    ...buildMeasurementFiles(measurementTypes, entriesByType),
    ...buildPlanFiles(
      plans,
      routines,
      exercisesById,
      units.weight.toDisplay,
      units.weight.label,
    ),
    "workouts/history.csv": buildHistoryCsv(
      workouts,
      plans,
      routines,
      exercisesById,
      units.weight.toDisplay,
      units.weight.label,
    ),
  };

  // chart_data/: one CSV per configured chart with data, reusing the same
  // series + CSV machinery as the analytics page's per-chart export.
  const titleCtx = {
    exercisesById: Object.fromEntries(exercises.map((e) => [e.id, e])),
    measurementTypesById: Object.fromEntries(
      measurementTypes.map((m) => [m.id, m]),
    ),
  };
  const usedChartPaths = new Set<string>();
  for (const config of charts) {
    const series = await buildChartSeries(config, "max");
    if (!series.points.length) continue;
    const title = chartTitle(config, titleCtx);
    const csv = buildChartCsv(series, config, title, {
      timeframe: "max",
      ...chartCsvOptions(series, config, units),
    });
    const path = uniquePath(
      "chart_data",
      safeFileName(title),
      config.id,
      "csv",
      usedChartPaths,
    );
    files[path] = csv;
  }

  files["README.txt"] = buildReadme({
    version: APP_VERSION,
    exportedAt: Date.now(),
    weightUnit: units.weight.label,
    lengthUnit: units.length.label,
  });

  return new Blob([zipTextFiles(files)], { type: "application/zip" });
}
