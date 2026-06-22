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
  unitLabel: "",
  toDisplay: (v: number) => v,
  decimals: 1,
};

const dataRow = (csv: string): string | undefined =>
  csv.split("\n").find((l) => l.startsWith("2026-01-06"));

describe("buildChartCsv", () => {
  it("emits a Direct/Indirect/Total table and stacked-column guidance for a muscle chart", () => {
    const series: ChartSeries = { valueKind: "count", points: [point()] };
    const csv = buildChartCsv(series, config(), "Chest", identityOpts);

    expect(csv).toContain("Date,Period,Direct,Indirect,Total");
    expect(dataRow(csv)).toBe("2026-01-06,Jan 6,40,10,50");
    expect(csv).toContain("Stacked Column");
  });

  it("includes a Samples column and line guidance for a measurement chart", () => {
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
      { ...identityOpts, unitLabel: "kg" },
    );

    expect(csv).toContain("Date,Period,Bodyweight (kg),Samples");
    expect(dataRow(csv)).toBe("2026-01-06,Jan 6,82.5,3");
    expect(csv).toContain("Line");
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
        unitLabel: "lbs",
        toDisplay: (v) => v * 2,
        decimals: 0,
      },
    );

    expect(csv).toContain("Date,Period,Volume (lbs)");
    expect(dataRow(csv)).toBe("2026-01-06,Jan 6,2000");
    expect(csv).toContain("Charts → Column");
    expect(csv).not.toContain("Stacked Column");
  });
});
