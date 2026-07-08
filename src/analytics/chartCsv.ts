import type { AnalyticsChartConfig } from "../db/types";
import { roundTo } from "../utils/number";
import {
  csvRow as row,
  formatDate as isoDate,
  formatDateTime as isoDateTime,
} from "../utils/csv";
import type { BucketPoint } from "./compute";
import {
  BUCKET_LABELS,
  METRIC_LABELS,
  TIMEFRAME_OPTIONS,
  chartTypeFor,
} from "./presentation";
import {
  CHART_TYPE_LABELS,
  CSV_FIELD_LABELS,
  SOURCE_KIND_LABELS,
  chartGuideLines,
} from "./chartCsvText";
import type { ChartSeries, Timeframe } from "./service";

// ----------------------------------------------
// Pure CSV serializer for a single analytics chart: a config block, the
// per-period table that draws the chart, and an Excel/Google-Sheets guide for
// rebuilding it. No Dexie, no DOM, no Vue — the caller passes the
// already-computed series and a unit descriptor, so this stays unit-testable.
// Unit conversion (kg⇄lbs, cm⇄in) is the caller's via `toDisplay`/`unitLabel`;
// numbers are written bare (unit named only in the header) so Excel charts them.
// ----------------------------------------------

export interface ChartCsvOptions {
  timeframe: Timeframe;
  scopeLabel: string; // resolved data scope (exercise / measurement / muscle / "All training")
  unitLabel: string; // "kg" | "lbs" | "cm" | "in" | "%" | "" (count)
  toDisplay: (value: number) => number; // stored value → user's display number
  decimals: number;
  now?: number; // export timestamp; defaults to Date.now() (injectable for tests)
}

const withUnit = (label: string, unitLabel: string): string =>
  unitLabel ? `${label} (${unitLabel})` : label;

/** Serialize one chart's config, data and Excel/Sheets guidance to a CSV string. */
export function buildChartCsv(
  series: ChartSeries,
  config: AnalyticsChartConfig,
  title: string,
  opts: ChartCsvOptions,
): string {
  const type = chartTypeFor(config);
  const num = (v: number): number => roundTo(opts.toDisplay(v), opts.decimals);
  const timeframeLabel =
    TIMEFRAME_OPTIONS.find((o) => o.value === opts.timeframe)?.label ??
    opts.timeframe;

  const lines: string[] = [];

  // --- Config block: what this chart shows and when it was exported ---
  lines.push(row("YAFA CHART EXPORT"));
  lines.push(row(CSV_FIELD_LABELS.chart, title));
  lines.push(
    row(CSV_FIELD_LABELS.source, SOURCE_KIND_LABELS[config.sourceKind]),
  );
  lines.push(row(CSV_FIELD_LABELS.scope, opts.scopeLabel));
  lines.push(row(CSV_FIELD_LABELS.chartType, CHART_TYPE_LABELS[type]));
  lines.push(row(CSV_FIELD_LABELS.metric, METRIC_LABELS[config.metric]));
  lines.push(row(CSV_FIELD_LABELS.aggregation, BUCKET_LABELS[config.bucket]));
  lines.push(row(CSV_FIELD_LABELS.timeframe, timeframeLabel));
  lines.push(row(CSV_FIELD_LABELS.unit, opts.unitLabel || "count"));
  lines.push(
    row(CSV_FIELD_LABELS.exported, isoDateTime(opts.now ?? Date.now())),
  );
  lines.push("");

  // --- Per-period table (columns adapt to the chart type) ---
  const bestSet = (p: BucketPoint): string => {
    if (!p.bestSet) return "";
    const { weight, reps, rpe, bodyweightOffsetKg } = p.bestSet;
    const unit = opts.unitLabel ? ` ${opts.unitLabel}` : "";
    const w = `${roundTo(opts.toDisplay(weight), opts.decimals)}${unit}`;
    // Added weight + the bodyweight share folded into the e1RM (mirrors tooltip).
    const bw = bodyweightOffsetKg
      ? ` + ${roundTo(opts.toDisplay(bodyweightOffsetKg), opts.decimals)}${unit} BW`
      : "";
    return `${w}${bw} × ${reps}${rpe !== undefined ? ` @ RPE ${rpe}` : ""}`;
  };

  if (type === "stackedBar") {
    lines.push(row("Date", "Period", "Direct", "Indirect", "Total"));
    for (const p of series.points) {
      lines.push(
        row(
          isoDate(p.start),
          p.label,
          num(p.direct),
          num(p.indirect),
          num(p.value),
        ),
      );
    }
  } else if (type === "line" && config.metric === "e1rm") {
    lines.push(
      row("Date", "Period", withUnit("e1RM", opts.unitLabel), "Best set"),
    );
    for (const p of series.points) {
      lines.push(row(isoDate(p.start), p.label, num(p.value), bestSet(p)));
    }
  } else if (type === "line") {
    // Measurement (metric "value"): one averaged value per period + sample count.
    lines.push(
      row("Date", "Period", withUnit(title, opts.unitLabel), "Samples"),
    );
    for (const p of series.points) {
      lines.push(row(isoDate(p.start), p.label, num(p.value), p.samples ?? ""));
    }
  } else {
    // bar: global / exercise quantities (workouts, sets, reps, volume).
    lines.push(
      row(
        "Date",
        "Period",
        withUnit(METRIC_LABELS[config.metric], opts.unitLabel),
      ),
    );
    for (const p of series.points) {
      lines.push(row(isoDate(p.start), p.label, num(p.value)));
    }
  }

  // Step-by-step guide for rebuilding this chart in Excel / Google Sheets.
  lines.push("");
  for (const line of chartGuideLines(type)) lines.push(row(line));

  return lines.join("\n");
}

/** A weight/length unit's display side (kg⇄lbs, cm⇄in) — what CSV export needs. */
export interface UnitView {
  label: string;
  toDisplay: (value: number) => number;
}

/**
 * Derive the unit/decimals slice of {@link ChartCsvOptions} from a series'
 * `valueKind`. The single source of truth for how chart values are unit-mapped
 * on export, used by the analytics card's CSV action.
 */
export function chartCsvOptions(
  series: ChartSeries,
  config: AnalyticsChartConfig,
  units: { weight: UnitView; length: UnitView },
): Pick<ChartCsvOptions, "unitLabel" | "toDisplay" | "decimals"> {
  switch (series.valueKind) {
    case "weight":
      // e1RM trends move in small steps — keep a decimal; volume totals don't.
      return {
        unitLabel: units.weight.label,
        toDisplay: units.weight.toDisplay,
        decimals: config.metric === "e1rm" ? 1 : 0,
      };
    case "length":
      return {
        unitLabel: units.length.label,
        toDisplay: units.length.toDisplay,
        decimals: 1,
      };
    case "percentage":
      return { unitLabel: "%", toDisplay: (v) => v, decimals: 1 };
    default:
      // count: fractional set shares (×0.5) keep one decimal when needed.
      return { unitLabel: "", toDisplay: (v) => v, decimals: 1 };
  }
}
