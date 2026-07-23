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
    body: `How closely the session followed its prescription, from 0 to 100. It's a feedback signal only — it never changes your training max (c1RM).

Points come off for training harder than the target RPE, for missing reps, for weight off the prescription by more than 2.5 kg, for skipping prescribed sets, and for piling on off-script "junk" volume. Training easier than the target RPE or staying within the 2.5 kg band costs nothing. Tap "Why not 100%?" to see the exact breakdown.`,
  },
  rpeMatrix: {
    title: "RPE Matrix",
    body: `A lookup table mapping reps × RPE to a percentage of your 1-rep max. For example, 5 reps at RPE 8 might be ~84%.

It's the engine's model of effort. The app uses it both ways: to turn your training max (c1RM) into a prescribed weight, and to estimate a 1RM from any set you log. You can fine-tune the matrix per exercise if your numbers differ.`,
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

It's an analytics signal for tracking trend and spotting PRs. It doesn't directly set your weights — but a sustained gap between your e1RM and your training max (c1RM) gently nudges the training max back toward reality over time.`,
  },
  rpe: {
    title: "RPE",
    body: `Rate of Perceived Exertion — how hard a set felt on a 6–10 scale.

RPE 10 means a true max (no reps left); RPE 8 means about two reps in reserve. Logging RPE lets the app gauge effort and estimate your strength without you ever testing a true 1RM.`,
  },
  reset: {
    title: "Reset / Deload",
    body: `A built-in back-off when an exercise stalls. After several consecutive regressions, the next prescription drops your training max (c1RM) by a fixed amount and clears the streak.

It's an automatic recovery valve — a short step back to rebuild momentum, not a punishment.`,
  },
  regressionStreak: {
    title: "Regression Streak",
    body: `How many sessions in a row this exercise came in under target. A success or a hold resets the count to 0 — only back-to-back regressions add up.

At 3 in a row, a reset is armed: the NEXT prescription for this exercise drops the training max (c1RM) by 10% and the streak clears, giving you a lighter session to rebuild from.`,
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
  percentageDrop: {
    title: "% Drop",
    body: `How much lighter the back-off sets are relative to the top set, expressed as a percentage.

For example, a 10% drop means back-off sets are prescribed at 90% of the top-set weight. The app rounds to your weight increment.`,
  },
  backOffSets: {
    title: "Back-Off Sets",
    body: `The number of lighter sets performed after the top set. These sets use the reduced weight defined by the % Drop and accumulate volume at a lower intensity to aid recovery and hypertrophy.`,
  },
  backOffRpe: {
    title: "Back-Off RPE",
    body: `The target effort for your back-off sets. The reps aren't fixed — the app derives how many reps land on this RPE at the dropped weight (set by the % Drop), using the exercise's RPE matrix.

A lower back-off RPE means more reps in reserve on the lighter sets.`,
  },
  weightIncrement: {
    title: "Weight Increment",
    body: `How much your training max (c1RM) rises after a successful session — set it in kg or as a percent of your current training max (c1RM).

A flat kg amount gives consistent jumps regardless of where you are on the strength curve. A percent amount scales with your training max (c1RM), so early gains are larger and increments slow naturally as you approach your ceiling.

Keep it conservative: the app never skips a progression step, so a small increment that sticks every session outperforms an optimistic one that repeatedly stalls.`,
  },
  fatigueReduction: {
    title: "Fatigue Reduction (config)",
    body: `How much to lower this exercise's prescribed weights when earlier exercises in the same session taxed the same muscles — set it in kg or as a percent of your training max (c1RM). 0 turns it off.

The reduction scales with muscle overlap: full effect for the same primary muscles, less for secondary overlap. Keep the value modest; it only shapes the session's prescription, never your stored training max (c1RM).`,
  },
  previewFatigue: {
    title: "Fatigue",
    body: `The crossed-out c1RM is your usual training max; the value after the arrow is what today's sets are actually prescribed from — lowered because earlier exercises in this session share muscle groups with this one.

If a reset is also pending for this exercise, you'll see an extra amber step first: that's the −10% reset drop, applied before fatigue reduces the anchor further.

The fatigue reduction is subtracted from the anchor before calculating each set, so straight sets, top sets, and back-offs all scale proportionally. It's transient: it shapes today's prescription only and never alters your stored training max (c1RM).`,
  },
  calculatorFatigue: {
    title: "Session Fatigue",
    body: `Reduces the training max (c1RM) used for this calculation based on muscle overlap with exercises already performed in this session.

The calculator always uses a fixed 10% reduction at full overlap, scaled down for weaker overlap — the per-exercise Fatigue Reduction setting only shapes routine prescriptions, not this calculation.`,
  },
  plansRoutines: {
    title: "Plans & Routines",
    body: `Saving this session as a routine turns a one-off workout into something you can repeat and improve.

• Routine — a reusable list of exercises for one training day. Start it any time and the app prescribes your sets from your training max.
• Plan — a collection of routines that make up your week or training block. One plan is active at a time and drives your dashboard.
• Progression — each saved exercise can move off "None" to Linear, Double, or Top Set + Back-off so the app adds weight for you as you get stronger.

Reusing routines is what unlocks the engine: consistent exercises let it track your training max, spot PRs, and adjust load session to session.`,
  },
  calculator: {
    title: "RPE Calculator",
    body: `Enter any two of reps, weight, and RPE — the third is calculated using your training max (c1RM) and the exercise's RPE matrix.

Results are most accurate in the 1–10 rep range at RPE 7–10. Outside that window the calcualtion is unreliable since the calculation is clamped at the boundaries of your exercise-specific RPE matrix.`,
  },
};
