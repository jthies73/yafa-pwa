// ----------------------------------------------
// Plain-language explanations for the app's domain terms, surfaced by InfoIcon.vue
// as a tap-to-open bottom sheet next to each label. Content only — no logic — so
// the copy lives in one editable place instead of scattered through templates.
//
// Keys are referenced by `<InfoIcon topic="…" />`. Bodies may use blank lines to
// separate paragraphs (rendered with whitespace preserved).
// ----------------------------------------------

export interface InfoTopic {
  title: string;
  body: string;
}

export const INFO_TOPICS: Record<string, InfoTopic> = {
  targetRpe: {
    title: "Target RPE",
    body: `RPE (Rate of Perceived Exertion) is how hard a set felt, from 6 (easy) to 10 (no reps left in the tank). The target RPE is the effort each working set aims for.

It does double duty: it sets the prescribed weight (via the RPE matrix) AND it's what your logged sets are judged against to decide whether you progress, hold, or regress.`,
  },
  rpeCeiling: {
    title: "RPE Ceiling",
    body: `A safety cap on prescribed load. If raising the weight would push the expected effort above the ceiling, the weight is held at the ceiling instead.

The ceiling only limits the load — it never decides success or failure. That's the target RPE's job.`,
  },
  adherenceScore: {
    title: "Adherence Score",
    body: `How closely the session followed its prescription, from 0 to 100. It's a feedback signal only — it never changes your training max.

Points come off for training harder or softer than the target RPE, for missing reps or weight, for skipping prescribed sets, and for piling on off-script "junk" volume. Tap "Why not 100%?" to see the exact breakdown.`,
  },
  rpeMatrix: {
    title: "RPE Matrix",
    body: `A lookup table mapping reps × RPE to a percentage of your 1-rep max. For example, 5 reps at RPE 8 might be ~84%.

It's the engine's model of effort. The app uses it both ways: to turn your training max into a prescribed weight, and to estimate a 1RM from any set you log. You can fine-tune the matrix per exercise if your numbers differ.`,
  },
  progressionModel: {
    title: "Progression Model",
    body: `How an exercise advances over time:

• Linear — add weight whenever you hit the target reps and RPE.
• Double — work up the rep range at a fixed weight first, then add weight and drop back down.
• Top Set + Back-off — one hard top set drives progression, followed by lighter back-off sets.
• None — fixed prescription, no automatic progression.`,
  },
  mesocycle: {
    title: "Mesocycle",
    body: `A multi-week training block where each week has a focus — hypertrophy, strength, peaking, or deload.

The focus nudges your targets (more volume, higher intensity, or a back-off week) without you re-planning every exercise. It shifts reps and target RPE; the weight always re-derives from those.`,
  },
  c1rm: {
    title: "Training Max (c1RM)",
    body: `Your "calculative 1RM" — the working anchor every prescription is built from. Prescribed weight = a matrix percentage of this number.

It moves deterministically: up by your set increment when you succeed, down after repeated regressions. It's intentionally separate from the estimated 1RM so a single great (or off) day doesn't whipsaw your programming.`,
  },
  e1rm: {
    title: "Estimated 1RM (e1RM)",
    body: `A 1-rep-max estimate read off any single set via the RPE matrix (weight ÷ the matrix percentage for those reps and RPE).

It's an analytics signal for tracking trend and spotting PRs. It doesn't directly set your weights — but a sustained gap between your e1RM and your training max gently nudges the training max back toward reality over time.`,
  },
  rpe: {
    title: "RPE",
    body: `Rate of Perceived Exertion — how hard a set felt on a 6–10 scale.

RPE 10 means a true max (no reps left); RPE 8 means about two reps in reserve. Logging RPE lets the app gauge effort and estimate your strength without you ever testing a true 1RM.`,
  },
  reset: {
    title: "Reset / Deload",
    body: `A built-in back-off when an exercise stalls. After several consecutive regressions, the next prescription drops your training max by a fixed amount and clears the streak.

It's an automatic recovery valve — a short step back to rebuild momentum, not a punishment.`,
  },
  volumeLoad: {
    title: "Volume Load",
    body: `Total tonnage for the session: every working set's weight × reps, summed.

A rough gauge of how much work you did. Useful for comparing sessions and tracking volume across a block.`,
  },
  prTypes: {
    title: "Personal Records",
    body: `Markers earned when a session beats your history:

• e1RM PR — your best estimated 1-rep max for the exercise.
• Volume PR — the most tonnage you've done for the exercise in one session.`,
  },
};
