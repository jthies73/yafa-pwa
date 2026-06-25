import type { AnalyticsSourceKind } from "../db/types";
import type { ChartType } from "./presentation";

// ----------------------------------------------
// Display text for the per-chart CSV export: the config-block field labels, the
// human names for source/chart-type, and the step-by-step "rebuild this chart in
// Excel / Google Sheets" guide. Kept out of chartCsv.ts so the serializer holds
// no prose and the wording lives in one editable place.
// ----------------------------------------------

/** Left-column labels for the config block at the top of the CSV. */
export const CSV_FIELD_LABELS = {
  chart: "Chart",
  source: "Source",
  scope: "Scope",
  chartType: "Chart type",
  metric: "Metric",
  aggregation: "Aggregation",
  timeframe: "Timeframe",
  unit: "Unit",
  exported: "Exported",
} as const;

/** What the chart draws its data from. */
export const SOURCE_KIND_LABELS: Record<AnalyticsSourceKind, string> = {
  global: "All training",
  muscle: "Muscle group(s)",
  exercise: "Exercise",
  measurement: "Measurement",
};

/** The spreadsheet chart type each YAFA chart maps to. */
export const CHART_TYPE_LABELS: Record<ChartType, string> = {
  bar: "Column",
  stackedBar: "Stacked Column",
  line: "Line",
};

/**
 * A short, chart-type-specific guide (one entry per CSV line) for recreating the
 * chart from the table above it in Excel or Google Sheets.
 */
export function chartGuideLines(type: ChartType): string[] {
  const header = "How to chart this data:";
  switch (type) {
    case "stackedBar":
      return [
        header,
        "Excel: select the Date, Direct and Indirect columns (skip Total), then Insert > Charts > Stacked Column.",
        "Google Sheets: select the Date, Direct and Indirect columns (skip Total), then Insert > Chart and choose Stacked column chart.",
      ];
    case "line":
      return [
        header,
        "Excel: select the Date column and the value column, then Insert > Charts > Line.",
        "Google Sheets: select the Date column and the value column, then Insert > Chart and choose Line chart.",
      ];
    default:
      return [
        header,
        "Excel: select the Date column and the value column, then Insert > Charts > Clustered Column.",
        "Google Sheets: select the Date column and the value column, then Insert > Chart and choose Column chart.",
      ];
  }
}
