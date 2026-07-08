import type {
  AnalyticsBucket,
  AnalyticsChartConfig,
  AnalyticsMetric,
} from "../db/types";
import type { BucketPoint } from "./compute";
import type { Timeframe } from "./service";

// ----------------------------------------------
// Analytics presentation layer: chart-type assignment, labels and tooltip
// text. Pure string/enum logic (no Chart.js, no Vue) so it stays testable
// independently of rendering.
// ----------------------------------------------

export type ChartType = "bar" | "stackedBar" | "line";

/**
 * Chart type per configuration (spec §3): trends (e1RM, measurements) read as
 * lines; quantities read as bars; muscle-scope quantities split into a
 * direct/indirect stack so the stimulus composition stays visible.
 */
export function chartTypeFor(
  config: Pick<AnalyticsChartConfig, "sourceKind" | "metric">,
): ChartType {
  if (config.sourceKind === "measurement" || config.metric === "e1rm")
    return "line";
  return config.sourceKind === "muscle" ? "stackedBar" : "bar";
}

/** Named entities a chart title resolves against (exercise / measurement name). */
export interface ChartTitleContext {
  exercisesById: Record<string, { name: string }>;
  measurementTypesById: Record<string, { name: string }>;
}

/**
 * The display title for a chart config: an explicit name wins, otherwise it is
 * derived from the scope. Shared by the analytics page and the data export so
 * both name a chart identically. Mirrors `muscleGroupsOf` for the legacy single
 * `muscleGroup` field without importing the Dexie-bound helper into this pure
 * module.
 */
export function chartTitle(
  config: AnalyticsChartConfig,
  ctx: ChartTitleContext,
): string {
  if (config.name) return config.name;
  switch (config.sourceKind) {
    case "global":
      return "All Training";
    case "muscle": {
      const groups =
        config.muscleGroups ?? (config.muscleGroup ? [config.muscleGroup] : []);
      return groups.join(", ") || "Muscle Group";
    }
    case "exercise":
      return (
        ctx.exercisesById[config.exerciseId ?? ""]?.name ?? "Unknown Exercise"
      );
    case "measurement":
      return (
        ctx.measurementTypesById[config.measurementTypeId ?? ""]?.name ??
        "Unknown Measurement"
      );
  }
}

export const METRIC_LABELS: Record<AnalyticsMetric, string> = {
  workouts: "Workouts",
  sets: "Sets",
  reps: "Reps",
  volume: "Volume",
  e1rm: "e1RM",
  value: "Value",
};

export const BUCKET_LABELS: Record<AnalyticsBucket, string> = {
  session: "Per session",
  week: "Weekly",
  month: "Monthly",
  mesocycle: "Per mesocycle",
};

export const TIMEFRAME_OPTIONS: { value: Timeframe; label: string }[] = [
  { value: "max", label: "Max" },
  { value: "year", label: "Year" },
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
];

export interface TooltipContext {
  bucket: AnalyticsBucket;
  metric: AnalyticsMetric;
  scopeLabel: string;
  formatValue: (value: number) => string;
}

const bucketPrefix = (bucket: AnalyticsBucket, point: BucketPoint): string =>
  bucket === "week" ? `Week of ${point.label}` : point.label;

/** Headline: period label and formatted value — scope/metric are in the card header already. */
export function tooltipTitle(point: BucketPoint, ctx: TooltipContext): string {
  return `${bucketPrefix(ctx.bucket, point)}: ${ctx.formatValue(point.value)}`;
}

// Cap the per-exercise listing so a busy global bucket can't produce a
// screen-filling tooltip; the dropped remainder is summarized.
const MAX_BREAKDOWN_EXERCISES = 6;

/**
 * The full mathematical breakdown under the headline — one line per recruitment
 * role listing every contributing exercise with its multiplier, e.g.
 * "6 indirect sets (Bench Press ×0.5, OHP ×0.5)".
 */
export function tooltipLines(
  point: BucketPoint,
  ctx: TooltipContext,
): string[] {
  if (ctx.metric === "e1rm") {
    if (!point.bestSet) return [];
    const { weight, reps, rpe, bodyweightOffsetKg } = point.bestSet;
    const rpePart = rpe !== undefined ? ` @ RPE ${rpe}` : "";
    // Added weight + the bodyweight share folded into the plotted e1RM.
    const bwPart = bodyweightOffsetKg
      ? ` + ${ctx.formatValue(bodyweightOffsetKg)} BW`
      : "";
    return [
      `Best set: ${ctx.formatValue(weight)}${bwPart} × ${reps}${rpePart}`,
    ];
  }
  if (ctx.metric === "value") {
    return point.samples && point.samples > 1
      ? [`Average of ${point.samples} entries`]
      : [];
  }
  if (ctx.metric === "workouts") return [];

  const lines: string[] = [];
  for (const role of ["direct", "indirect"] as const) {
    const group = point.contributions.filter((c) => c.role === role);
    if (!group.length) continue;
    const total = group.reduce((sum, c) => sum + c.value, 0);
    const shown = group
      .slice(0, MAX_BREAKDOWN_EXERCISES)
      .map((c) => `${c.label} ×${c.multiplier}`)
      .join(", ");
    const more =
      group.length > MAX_BREAKDOWN_EXERCISES
        ? `, +${group.length - MAX_BREAKDOWN_EXERCISES} more`
        : "";
    lines.push(`${ctx.formatValue(total)} ${role} (${shown}${more})`);
  }
  return lines;
}
