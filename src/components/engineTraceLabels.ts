import type { TraceReason } from "../engine/replay";

// Shared presentation for a fold's outcome, so the list and the detail sheet can
// never label the same trace differently.

export const REASON_LABEL: Record<TraceReason, string> = {
  seed: "Calibrated",
  increment: "Progressed",
  hold: "Held",
  regression: "Regressed",
  recalibrate: "Recalibrated",
  "off-script": "Off-script",
};

export const REASON_TONE: Record<TraceReason, string> = {
  seed: "bg-accent/15 text-accent",
  increment: "bg-green-500/15 text-green-600 dark:text-green-400",
  hold: "bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark",
  regression: "bg-amber-500/15 text-amber-600 dark:text-amber-500",
  recalibrate: "bg-accent/15 text-accent",
  "off-script":
    "bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark opacity-60",
};

/** Filter buckets over the outcomes, in the order the chips render. */
export const REASON_FILTERS: { value: TraceReason | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "increment", label: "Progressed" },
  { value: "hold", label: "Held" },
  { value: "regression", label: "Regressed" },
  { value: "recalibrate", label: "Recalibrated" },
  { value: "seed", label: "Calibrated" },
];
