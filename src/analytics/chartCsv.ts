import type { AnalyticsChartConfig } from "../db/types";
import { roundTo } from "../utils/number";
import type { BucketPoint } from "./compute";
import {
  BUCKET_LABELS,
  METRIC_LABELS,
  TIMEFRAME_OPTIONS,
  chartTypeFor,
} from "./presentation";
import type { ChartSeries, Timeframe } from "./service";

// ----------------------------------------------
// Pure CSV serializer for a single analytics chart: a metadata block, the
// per-period table that draws the chart, and a chart-type-tailored "how to
// build this in Excel" footer. No Dexie, no DOM, no Vue — the caller passes the
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

function escapeCsvCell(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

const row = (...cells: (string | number | null | undefined)[]): string =>
  cells.map(escapeCsvCell).join(",");

const pad = (n: number): string => String(n).padStart(2, "0");

const isoDate = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const isoDateTime = (ts: number): string => {
  const d = new Date(ts);
  return `${isoDate(ts)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

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

  // --- Metadata block ---
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
  let selectionHint: string;

  if (type === "stackedBar") {
    chartName = "Stacked Column";
    selectionHint = "the Period column plus the Direct and Indirect columns";
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
    selectionHint = "the Period column and the e1RM column";
    lines.push(
      row("Date", "Period", withUnit("e1RM", opts.unitLabel), "Best set"),
    );
    for (const p of series.points) {
      lines.push(row(isoDate(p.start), p.label, num(p.value), bestSet(p)));
    }
  } else if (type === "line") {
    // Measurement (metric "value"): one averaged value per period + sample count.
    chartName = "Line";
    selectionHint = "the Period column and the value column";
    lines.push(
      row("Date", "Period", withUnit(title, opts.unitLabel), "Samples"),
    );
    for (const p of series.points) {
      lines.push(row(isoDate(p.start), p.label, num(p.value), p.samples ?? ""));
    }
  } else {
    // bar: global / exercise quantities (workouts, sets, reps, volume).
    chartName = "Column";
    selectionHint = "the Period column and the value column";
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

  // --- Excel how-to ---
  lines.push("");
  lines.push(row("HOW TO CHART THIS IN EXCEL"));
  lines.push(
    row(
      "1. Open this file in Excel (or Data → From Text/CSV if it does not open directly).",
    ),
  );
  lines.push(
    row(
      `2. Select ${selectionHint} — the data rows above only, not these instructions.`,
    ),
  );
  lines.push(
    row(`3. Insert → Charts → ${chartName} (or Insert → Recommended Charts).`),
  );
  lines.push(
    row("4. The Period column becomes the horizontal (category) axis."),
  );

  return lines.join("\n");
}
