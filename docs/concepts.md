---
title: Concepts & Glossary
aliases: [Glossary, Concepts, Terminology]
tags: [yafa/concepts]
area: shared
order: 1
source-commit: 326169d
updated: 2026-07-09
---

# Concepts & Glossary

Canonical definitions for the terms used across this documentation set. **Definitions live here; mechanics live in the linked home docs.** Every other doc links a term here on first mention and never redefines it.

> User-facing overview of the underlying philosophy: [README — Core Philosophy](../README.md)

## Adherence

A 0–100 score of how faithfully a session followed its prescription, computed from RPE overshoot, rep deviation, weight deviation, and missing/trashed sets. Adherence is **analytics-only**: it colors the post-workout summary gauge but never feeds progression decisions. Anchor: `computeAdherence` (internal) in `src/analytics/summary.ts`, weights in `ADHERENCE_WEIGHTS`.
Mechanics: [[analytics#Workout summary, adherence and PRs|analytics]]

## c1RM

The **calculative 1RM** — the persistent planning anchor for one exercise. Every prescribed weight is `c1rm × matrixPct(reps, rpe)`. It rises by `weightIncrement` on a success, drops −10% when a pending reset is consumed, and can jump via [[#Catch-up|catch-up]]. It is kept **unrounded** (only rendered weights snap to loadable increments) and is the only value progression persists. Distinct from [[#Demonstrated e1RM|demonstrated e1RM]] and the analytics-only [[#Implied e1RM|implied e1RM]]. Anchor: `ProgressionState.c1rm`, `src/db/types.ts`.
Mechanics: [[applying-results]] (movement), [[prescription-pipeline]] (consumption)

## Catch-up

The single-move correction that fires when a session's [[#Demonstrated e1RM|demonstrated e1RM]] diverges from [[#c1RM|c1RM]] by more than ±`CATCHUP_THRESHOLD` (currently 10%): c1RM jumps `CATCHUP_CLOSE_FRACTION` (currently 70%) of the gap toward the estimate. When it fires it takes **full precedence** over the deterministic progression rules for that session — the regression streak clears and no reset is armed. Anchor: `catchUpC1rm` in `src/engine/state.ts`.
Mechanics: [[applying-results#Catch-up|applying-results]]

## Cold start

The state before an exercise's [[#c1RM|c1RM]] is seeded: prescriptions render with `weight: null` (free-entry rows). The first logged set governs the rest of the session (the tracker auto-fills remaining sets from its demonstrated capacity), and the first qualifying session seeds c1RM without running progression. Anchors: `prescribeExercise` in `src/engine/prescription.ts` (null weights), `fillColdStartFromGovernor` in `src/composables/useWorkoutTracker.ts`, cold-start branch of `applyWorkoutResults` in `src/engine/service.ts`.
Mechanics: [[prescription-pipeline#Cold start|prescription-pipeline]], [[workout-tracking#Green dot represcription|workout-tracking]]

## Demonstrated e1RM

The e1RM a session actually **demonstrated**, corroborated from that session's [[#Qualifying set|qualifying sets]]: a lone qualifying set is used directly; with two or more, the single furthest-from-anchor set is dropped as a possible fluke and the next-furthest is used. It is never used for prescriptions directly — it is the signal the [[#Catch-up|catch-up]] and the [[#RPE matrix correction|matrix correction]] weigh against c1RM. Anchor: `corroboratedE1rm` in `src/engine/state.ts`.
Mechanics: [[applying-results#Catch-up|applying-results]]

## Fold

Shorthand for the post-session application of workout results to progression state: evaluate the outcome, step the state, weigh the catch-up, then (last) learn the RPE matrix — **one c1RM move per session**, guarded for idempotency by `lastWorkoutId`. Anchor: `applyWorkoutResults` / `foldQualifiedSession` (internal) in `src/engine/service.ts`.
Mechanics: [[applying-results]]

## Green dot

The in-session **represcription proposal**. When a completed set demonstrates capacity materially different from a remaining set's prescribed load, the set index turns into a clickable green dot; accepting recalculates the remaining sets of that exercise card. Proposals are today-only guardrails — they **never touch c1RM**. Anchor: `proposeSetAdjustment` in `src/engine/adjustment.ts`, UI in `ReprescriptionPopover.vue`.
Mechanics: [[workout-tracking#Green dot represcription|workout-tracking]]

## Implied e1RM

The analytics-side e1RM implied by any logged set: `weight ÷ matrixPct(reps, rpe)`. Used for charts, PRs, and history — it never feeds prescription (which always renders from [[#c1RM|c1RM]]). Anchor: `impliedE1rm` in `src/engine/matrix.ts`.
Mechanics: [[rpe-matrix#Lookup and derivation|rpe-matrix]], [[analytics]]

## Loadable increment

The granularity rendered weights snap to (`LOADABLE_INCREMENT_KG`, currently 0.1 kg). Rounding happens **after** any RPE-ceiling cap and only on the rendered weight — [[#c1RM|c1RM]] itself stays unrounded. Not to be confused with `weightIncrement`, the per-success c1RM bump. Anchor: `roundToLoadable` in `src/engine/matrix.ts`.
Mechanics: [[rpe-matrix#Lookup and derivation|rpe-matrix]]

## lockedFields

Per-exercise-config list of progression-param keys that periodization must leave untouched. Only fields in `LOCKABLE_FIELDS[model]` can be locked; `rpeCeiling` and the increment fields are deliberately never lockable (they are guardrails/tuning, not periodized targets). Anchors: `RoutineExerciseConfig.lockedFields` in `src/db/types.ts`, `LOCKABLE_FIELDS` in `src/config/periodization.ts`.
Mechanics: [[mesocycles#Application pipeline|mesocycles]], [[progression-models#Lockable fields|progression-models]]

## Mesocycle focus

The training emphasis assigned to one week of a plan's mesocycle: `hypertrophy`, `strength`, `peaking`, or `deload`. A focus shifts an exercise's RPE and rep **targets additively** (never a direct load multiplier); the load then re-renders from the shifted targets through the [[#RPE matrix|RPE matrix]]. Set counts are never periodized. Anchors: `PeriodizationFocus` in `src/db/types.ts`, `MESO_RPE_DELTA`/`MESO_REP_DELTA` in `src/engine/constants.ts`.
Mechanics: [[mesocycles]]

## Qualifying set

A logged set honest enough to inform calibration: `actualRpe ≥ QUALIFYING_MIN_RPE` (currently 8), `reps` between 1 and `QUALIFYING_MAX_REPS` (currently 10), and positive weight. Only qualifying sets produce [[#Demonstrated e1RM|demonstrated e1RMs]], seed [[#c1RM|c1RM]], drive the [[#Catch-up|catch-up]], or count toward e1RM PRs. Anchor: `isQualifyingSet` in `src/engine/matrix.ts`.
Mechanics: [[rpe-matrix#Qualifying sets|rpe-matrix]]

## Regression streak

Counter of **consecutive** regression outcomes for one exercise, shared across all progression models (each model's own rules decide what counts as a regression). A success or hold anywhere clears it; the 3rd consecutive regression (`REGRESSION_RESET_TRIGGER`) arms a [[#Two-phase reset|reset]]. Anchor: `ProgressionState.regressionStreak`, stepped in `src/engine/state.ts`.
Mechanics: [[applying-results#Two-phase reset|applying-results]]

## RPE matrix

The grid mapping `(reps 1–15, RPE 6–10 in 0.5 steps)` to a percentage of 1RM. One global default (`DEFAULT_RPE_MATRIX`, seeded from RTS-style values) with optional per-exercise overrides; lookups interpolate **only on the RPE axis** (rep rows are exact) and clamp at the grid edges. All weight math — prescription, implied e1RM, the calculator — flows through it. Anchors: `RpeMatrix` in `src/db/types.ts`, `matrixPct` in `src/engine/matrix.ts`.
Mechanics: [[rpe-matrix]]

## RPE matrix correction

The adaptive learning step that reshapes an exercise's RPE curve toward demonstrated performance. Fires only when the session broadly **agrees** with the anchor (deviation ≤ `RPE_MATRIX_CORRECTION_MAX_DEVIATION`, currently 5%) — larger divergence is [[#Catch-up|catch-up]] territory. Cells are nudged with learning rate `RPE_MATRIX_CORRECTION_ALPHA` (0.1) through a triangular kernel over reps-to-failure space, applied **last** in the [[#Fold|fold]] so it only shapes future sessions. Anchor: `correctRpeMatrix` in `src/engine/matrix.ts`, gated by `learnedRpeMatrix` (internal) in `src/engine/service.ts`.
Mechanics: [[rpe-matrix#Adaptive correction|rpe-matrix]], [[applying-results#Ordering invariants|applying-results]]

## Slot alignment

Prescriptions are arrays **aligned to routine slot positions**, never keyed by exercise id. The same exercise can appear in multiple slots of one routine, and [[#Session fatigue|session fatigue]] makes those slots prescribe different loads — folding by exercise id would mis-render. Every consumer (tracker, snapshot, evaluation grouping) preserves slot order. Anchor: `prescribeWorkout` return contract in `src/engine/service.ts`.
Mechanics: [[fatigue-and-slots#Why slots, not exercise ids|fatigue-and-slots]]

## Session fatigue

A transient reduction shaved off the anchor when earlier exercises in the same session taxed overlapping muscles. Purely muscle-overlap based (tiers 100/75/50/25%, the **largest candidate wins**, never a sum), capped by the exercise's configured `fatigueReduction` (kg or % of c1RM, default 10%). It shapes rendered loads only and never moves the stored [[#c1RM|c1RM]]. Anchor: `computeFatigueAdjustment` in `src/engine/fatigue.ts`.
Mechanics: [[fatigue-and-slots]]

## Target vs Ceiling

Two RPE knobs with different jobs: **`targetRpe` judges** — the load aims for it and progression outcomes are judged against it; **`rpeCeiling` caps load** — a prescription guardrail that caps the RPE used for the load calculation (`min(targetRpe, rpeCeiling)`) without changing the displayed target, and never enters the success/regression decision. Anchor: the `load()` closure in `prescribeExercise`, `src/engine/prescription.ts`.
Mechanics: [[prescription-pipeline#Target judges, Ceiling caps|prescription-pipeline]]

## Two-phase reset

The deload mechanism for sustained small regressions. **Phase 1 (arming):** the 3rd consecutive regression sets `resetPending` during evaluation — c1RM is _not_ dropped yet. **Phase 2 (consuming):** the next prescription applies `c1rm × (1 − RESET_DROP)` (−10%) once and clears both streak and flag. This is why a regression session shows no load change until the following workout. A [[#Catch-up|catch-up]] overrides the bookkeeping entirely. Anchors: `step` (arming) and `consumeReset` (consuming) in `src/engine/state.ts`.
Mechanics: [[applying-results#Two-phase reset|applying-results]] (arming), [[prescription-pipeline#Reset consumption|prescription-pipeline]] (consuming)
