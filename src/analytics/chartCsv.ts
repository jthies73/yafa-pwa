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
import type { ChartSeries, Timeframe } from "./service";

// ----------------------------------------------
// Pure CSV serializer for a single analytics chart: a description block, the
// per-period table that draws the chart, and a one-line Excel charting hint.
// No Dexie, no DOM, no Vue — the caller passes the
// already-computed series and a unit descriptor, so this stays unit-testable.
// Unit conversion (kg⇄lbs, cm⇄in) is the caller's via `toDisplay`/`unitLabel`;
// numbers are written bare (unit named only in the header) so Excel charts them.
// ----------------------------------------------

export interface ChartCsvOptions {
  timeframe: Timeframe;
  unitLabel: string; // "kg" | "lbs" | "cm" | "in" | "%" | "" (count)
  toDisplay: (value: number) => number; // stored value → user's display number
  decimals: number;
  now?: number; // export timestamp; defaults to Date.now() (injectable for tests)
}

const withUnit = (label: string, unitLabel: string): string =>
  unitLabel ? `${label} (${unitLabel})` : label;

/** Serialize one chart's data + Excel guidance to a CSV string. */
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

  // --- Description block: what this chart shows and when it was exported ---
  lines.push(row("YAFA CHART EXPORT"));
  lines.push(row("Chart", title));
  lines.push(row("Metric", METRIC_LABELS[config.metric]));
  lines.push(row("Aggregation", BUCKET_LABELS[config.bucket]));
  lines.push(row("Timeframe", timeframeLabel));
  lines.push(row("Unit", opts.unitLabel || "count"));
  lines.push(row("Exported", isoDateTime(opts.now ?? Date.now())));
  lines.push("");

  // --- Per-period table (columns adapt to the chart type) ---
  const bestSet = (p: BucketPoint): string => {
    if (!p.bestSet) return "";
    const { weight, reps, rpe } = p.bestSet;
    const w = `${roundTo(opts.toDisplay(weight), opts.decimals)}${
      opts.unitLabel ? ` ${opts.unitLabel}` : ""
    }`;
    return `${w} × ${reps}${rpe !== undefined ? ` @ RPE ${rpe}` : ""}`;
  };

  let chartName: string;

  if (type === "stackedBar") {
    chartName = "Stacked Column";
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
    chartName = "Line";
    lines.push(
      row("Date", "Period", withUnit("e1RM", opts.unitLabel), "Best set"),
    );
    for (const p of series.points) {
      lines.push(row(isoDate(p.start), p.label, num(p.value), bestSet(p)));
    }
  } else if (type === "line") {
    // Measurement (metric "value"): one averaged value per period + sample count.
    chartName = "Line";
    lines.push(
      row("Date", "Period", withUnit(title, opts.unitLabel), "Samples"),
    );
    for (const p of series.points) {
      lines.push(row(isoDate(p.start), p.label, num(p.value), p.samples ?? ""));
    }
  } else {
    // bar: global / exercise quantities (workouts, sets, reps, volume).
    chartName = "Column";
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

  // To chart: select the table above and insert this chart type.
  lines.push("");
  lines.push(
    row(
      `To chart in Excel: select the table, then Insert → Charts → ${chartName}.`,
    ),
  );

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
 * on export — shared by the analytics card's CSV action and the ZIP archive.
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
