import { db } from "./db";
import type { AnalyticsChartConfig } from "./types";

// ----------------------------------------------
// Analytics chart configs: persistence for the user-built charts on the
// analytics page. Mirrors the repository conventions (uid, timestamps) and
// owns the manual `order` used by drag-to-reorder.
// ----------------------------------------------

function uid(): string {
  return crypto.randomUUID();
}

/** The editable surface of a chart config (id/order/created_at are managed here). */
export type ChartConfigInput = Omit<
  AnalyticsChartConfig,
  "id" | "order" | "created_at"
>;

/**
 * Normalizes the flat source fields so only the one matching `sourceKind`
 * survives — an edit that switches the source must not leave a stale
 * exerciseId/muscleGroup behind on the stored record.
 */
function toRecordFields(input: ChartConfigInput): ChartConfigInput {
  return {
    sourceKind: input.sourceKind,
    muscleGroup: input.sourceKind === "muscle" ? input.muscleGroup : undefined,
    exerciseId: input.sourceKind === "exercise" ? input.exerciseId : undefined,
    measurementTypeId:
      input.sourceKind === "measurement" ? input.measurementTypeId : undefined,
    metric: input.metric,
    bucket: input.bucket,
  };
}

export async function createChartConfig(
  input: ChartConfigInput,
): Promise<string> {
  const id = uid();
  await db.transaction("rw", db.analyticsCharts, async () => {
    const existing = await db.analyticsCharts.toArray();
    const order = existing.reduce((max, c) => Math.max(max, c.order), -1) + 1;
    await db.analyticsCharts.add({
      id,
      ...toRecordFields(input),
      order,
      created_at: Date.now(),
    });
  });
  return id;
}

export async function updateChartConfig(
  id: string,
  input: ChartConfigInput,
): Promise<void> {
  const existing = await db.analyticsCharts.get(id);
  if (!existing) return;
  await db.analyticsCharts.put({
    id,
    ...toRecordFields(input),
    order: existing.order,
    created_at: existing.created_at,
  });
}

export async function deleteChartConfig(id: string): Promise<void> {
  await db.analyticsCharts.delete(id);
}

/** Persists a drag-reorder: each chart's order becomes its index in the list. */
export async function reorderChartConfigs(orderedIds: string[]): Promise<void> {
  await db.transaction("rw", db.analyticsCharts, async () => {
    await Promise.all(
      orderedIds.map((id, index) =>
        db.analyticsCharts.update(id, { order: index }),
      ),
    );
  });
}
