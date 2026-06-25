import { describe, it, expect } from "vitest";
import { buildChartCsv } from "../chartCsv";
import type { ChartSeries } from "../service";
import type { BucketPoint } from "../compute";
import type { AnalyticsChartConfig } from "../../db/types";

// Local date so isoDate (local getFullYear/Month/Date) is timezone-stable.
const JAN6 = new Date(2026, 0, 6, 10).getTime();

const point = (overrides: Partial<BucketPoint> = {}): BucketPoint => ({
  key: "w:1",
  start: JAN6,
  label: "Jan 6",
  value: 50,
  direct: 40,
  indirect: 10,
  contributions: [],
  ...overrides,
});

const config = (
  overrides: Partial<AnalyticsChartConfig> = {},
): AnalyticsChartConfig => ({
  id: "c1",
  sourceKind: "muscle",
  muscleGroups: ["Chest"],
  metric: "sets",
  bucket: "week",
  order: 0,
  created_at: 0,
  ...overrides,
});

const identityOpts = {
  timeframe: "max" as const,
  scopeLabel: "Chest",
  unitLabel: "",
  toDisplay: (v: number) => v,
  decimals: 1,
};

const dataRow = (csv: string): string | undefined =>
  csv.split("\n").find((l) => l.startsWith("2026-01-06"));

describe("buildChartCsv", () => {
  it("emits a Direct/Indirect/Total table for a muscle chart", () => {
    const series: ChartSeries = { valueKind: "count", points: [point()] };
    const csv = buildChartCsv(series, config(), "Chest", identityOpts);

    expect(csv).toContain("Date,Period,Direct,Indirect,Total");
    expect(dataRow(csv)).toBe("2026-01-06,Jan 6,40,10,50");
  });

  it("includes a Samples column for a measurement chart", () => {
    const series: ChartSeries = {
      valueKind: "weight",
      points: [point({ value: 82.5, direct: 82.5, indirect: 0, samples: 3 })],
    };
    const csv = buildChartCsv(
      series,
      config({
        sourceKind: "measurement",
        metric: "value",
        muscleGroups: undefined,
      }),
      "Bodyweight",
      { ...identityOpts, scopeLabel: "Bodyweight", unitLabel: "kg" },
    );

    expect(csv).toContain("Date,Period,Bodyweight (kg),Samples");
    expect(dataRow(csv)).toBe("2026-01-06,Jan 6,82.5,3");
    expect(csv).not.toContain("Stacked Column");
  });

  it("quotes a metadata value containing a comma", () => {
    const series: ChartSeries = { valueKind: "count", points: [point()] };
    const csv = buildChartCsv(series, config(), "Chest, Triceps", identityOpts);
    expect(csv).toContain('Chart,"Chest, Triceps"');
  });

  it("applies toDisplay conversion and names the unit in the header", () => {
    const series: ChartSeries = {
      valueKind: "weight",
      points: [point({ value: 1000, direct: 1000, indirect: 0 })],
    };
    const csv = buildChartCsv(
      series,
      config({
        sourceKind: "exercise",
        metric: "volume",
        muscleGroups: undefined,
      }),
      "Squat",
      {
        ...identityOpts,
        scopeLabel: "Squat",
        unitLabel: "lbs",
        toDisplay: (v) => v * 2,
        decimals: 0,
      },
    );

    expect(csv).toContain("Date,Period,Volume (lbs)");
    expect(dataRow(csv)).toBe("2026-01-06,Jan 6,2000");
    expect(csv).not.toContain("Stacked Column");
  });

  it("lists the chart config block (source, scope, chart type)", () => {
    const series: ChartSeries = { valueKind: "count", points: [point()] };
    const csv = buildChartCsv(
      series,
      config({ name: "My Chest View" }),
      "My Chest View",
      {
        ...identityOpts,
        scopeLabel: "Chest",
      },
    );

    expect(csv).toContain("Chart,My Chest View");
    expect(csv).toContain("Source,Muscle group(s)");
    expect(csv).toContain("Scope,Chest");
    expect(csv).toContain("Chart type,Stacked Column");
    expect(csv).toContain("Metric,Sets");
    expect(csv).toContain("Aggregation,Weekly");
  });

  it("appends an Excel + Google Sheets guide tailored to the chart type", () => {
    const series: ChartSeries = { valueKind: "count", points: [point()] };

    const stacked = buildChartCsv(series, config(), "Chest", identityOpts);
    expect(stacked).toContain("How to chart this data:");
    expect(stacked).toMatch(/Excel:.*Stacked Column/);
    expect(stacked).toMatch(/Google Sheets:.*Stacked column/);
    expect(stacked).toContain("skip Total");

    const bar = buildChartCsv(
      series,
      config({
        sourceKind: "exercise",
        metric: "sets",
        muscleGroups: undefined,
      }),
      "Squat",
      { ...identityOpts, scopeLabel: "Squat" },
    );
    expect(bar).toMatch(/Excel:.*Clustered Column/);
    expect(bar).toMatch(/Google Sheets:.*Column chart/);
  });
});
