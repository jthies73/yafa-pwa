import type {
  PeriodizationFocus,
  MesocycleWeek,
  ProgressionModelType,
} from "../db/types";

/**
 * Single source of truth for periodization focuses.
 *
 * `intensity` and `volume` (0..1) are *approximate* values used only to draw the
 * mesocycle chart — they sketch the canonical curve (volume tapers while
 * intensity climbs to a peak, then a deload drops both). The per-week multipliers
 * the workout engine applies will be reintroduced when the engine is rewritten.
 *
 * `colorVar` references a CSS token from `style.css` `@theme`. SVG fills are
 * data-driven (one fill per focus), which Tailwind utility classes can't express
 * from runtime data, so the chart applies these via inline `var(--color-focus-*)`.
 */
export interface FocusMeta {
  label: string;
  short: string;
  intensity: number; // 0..1, visualization only
  volume: number; // 0..1, visualization only
  colorVar: string;
}

export const FOCUS_META: Record<PeriodizationFocus, FocusMeta> = {
  hypertrophy: {
    label: "Hypertrophy",
    short: "Hyp",
    intensity: 0.55,
    volume: 0.95,
    colorVar: "var(--color-focus-hypertrophy)",
  },
  strength: {
    label: "Strength",
    short: "Str",
    intensity: 0.8,
    volume: 0.65,
    colorVar: "var(--color-focus-strength)",
  },
  peaking: {
    label: "Peaking",
    short: "Peak",
    intensity: 1.0,
    volume: 0.3,
    colorVar: "var(--color-focus-peaking)",
  },
  deload: {
    label: "Deload",
    short: "DL",
    intensity: 0.4,
    volume: 0.2,
    colorVar: "var(--color-focus-deload)",
  },
};

/**
 * Param keys that periodization can modify — and therefore that the user may
 * lock in the ExerciseConfigSheet — per progression model. Keys not listed here
 * are never affected by periodization (e.g. double progression's rep range is
 * engine-driven state, so the mesocycle must not fight the model's own rep
 * advancement). Shared between the config sheet UI and the workout engine so
 * the two cannot disagree about what a lock protects.
 */
// rpeCeiling is intentionally absent everywhere: it is a fixed safety guardrail
// (caps the prescribed load), not a periodized target, so the mesocycle never
// touches it and there is nothing for the user to lock. The increment value/unit
// are likewise omitted — they tune progression, not the per-workout targets.
export const LOCKABLE_FIELDS: Record<ProgressionModelType, string[]> = {
  linear: ["targetReps", "targetRpe"],
  double: ["targetRpe"],
  topset_backoff: ["topSetTargetReps", "topSetTargetRpe"],
  none: ["targetReps", "targetRpe"],
};

/** Display/selection order for the focuses. */
export const FOCUS_ORDER: PeriodizationFocus[] = [
  "hypertrophy",
  "strength",
  "peaking",
  "deload",
];

const weeksOf = (focuses: PeriodizationFocus[]): MesocycleWeek[] =>
  focuses.map((focus) => ({ focus }));

/** One-click starting points surfaced as preset buttons in the editor. */
export const MESOCYCLE_PRESETS: { name: string; weeks: MesocycleWeek[] }[] = [
  {
    name: "Classic 6-week peak",
    weeks: weeksOf([
      "hypertrophy",
      "hypertrophy",
      "strength",
      "strength",
      "peaking",
      "deload",
    ]),
  },
  {
    name: "4-week accumulation",
    weeks: weeksOf(["hypertrophy", "hypertrophy", "hypertrophy", "deload"]),
  },
];
