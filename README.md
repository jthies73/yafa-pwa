# YAFA - Yet Another Fitness App

![Yafa Logo](./public/favicon.svg)

**YAFA** is a highly customizable workout companion designed to adapt to individual recovery constraints and training responses. YAFA prioritizes flexibility, autoregulation, and an evidence-based approach to fitness tracking.

For Version 1 (V1), our primary focus is on **strength and hypertrophy progression** (Powerbuilding).

---

## 🏋️ Core Philosophy

Unlike traditional fitness apps that lock users into rigid percentage-based programs, **nothing in YAFA is fixed**. The system adapts to the user's current physical state using established principles of exercise science:

- **Progressive Overload**: Systematically increasing volume or intensity to drive neuromuscular and hypertrophic adaptations.
- **Autoregulation**: Utilizing RPE (Rate of Perceived Exertion) and RIR (Reps in Reserve) to adjust daily loads based on immediate readiness and fatigue.
- **Fatigue Management**: Structuring volume and progression to respect individual recovery capacities (e.g., sleep constraints, physiological stress).
- **Flexible Calculations**: Dynamically generating sets, reps, and target weights based on user inputs, e1RM, and confgured progression models.

### 🎛️ Cell-Based RPE Matrix

The RPE-to-percentage engine is a fully editable grid of reps (1–10) × RPE (10 → 6), where each cell holds a target % of 1RM:

- **Global Matrix**: A single global matrix is configured under **Settings** and persisted in the database (seeded once from the built-in evidence-based RTS defaults, then the source of truth). It can be reset to defaults at any time.
- **Hierarchical Cascade**: Exercises inherit the global matrix by default. Toggling **"Overwrite RPE matrix"** in the exercise editor stores an exercise-specific grid; clearing the toggle reverts the exercise to inheriting global values.
- **Granular Control**: When overriding, any single cell of the exercise-specific grid can be edited independently.
- **Automatic Curve Learning**: After each qualifying session the exercise's grid is nudged toward demonstrated performance (see **Adaptive RPE Matrix Correction** below), which materializes a per-exercise override. Manual cell edits, by contrast, stay deliberately conservative — only the adjacent RPE columns in the same row are re-ordered, so a hand-edit never silently reshapes the whole grid.

---

## ⚙️ Workout Engine Architecture

YAFA's workout engine is highly modular, separating concerns into independently testable units: progression models, the RPE matrix + e1RM subsystem (including the c1RM catch-up and adaptive matrix correction), the regression/reset and mesocycle-modifier subsystems, and the per-session prescription pipeline. Everything except the thin persistence layer is a pure function, so the whole progression history can be replayed deterministically.

### Core Concepts: c1RM vs. Demonstrated Capacity

To decouple physiological day-to-day variance from prescribed weights, YAFA separates the persistent planning anchor from what a session actually demonstrates:

- **`c1rm`** (calculative 1RM): the persistent planning anchor. Every weight prescription is computed from it. It rises by `weight_increment` on a success, can drop −10% on a reset, and can jump to track a large divergence (see **c1RM Catch-Up** below). It is kept **unrounded** — only the rendered prescribed weight is snapped to loadable increments — and is the only value progression persists.
- **Demonstrated e1RM**: the e1RM _implied_ by a logged set, `set_weight ÷ rpe_matrix[reps][rpe]`, computed only for **qualifying sets** (RPE ≥ 8 AND reps ≤ 10). It is never used directly for prescriptions; it is the signal the catch-up and the matrix correction weigh against `c1rm` to decide whether the anchor or the curve has drifted.

### Matrix-Derived Weights

Weight is always `weight = c1rm × rpe_matrix[reps][rpe]`, rounded to loadable increments after any RPE-ceiling cap. `weight_increment` is what's added to `c1rm` on a success (a flat kg amount, or a percent of `c1rm`), never a direct load delta. The matrix maps `(reps, rpe)` to a percentage of 1RM (axes: reps 1–10, RPE 6.0–10.0 in 0.5 steps); off-grid RPE interpolates linearly between columns and clamps at the row endpoints (no extrapolation).

### c1RM Catch-Up

Because `c1rm` only nudges by one increment per success, it can fall far behind (or ahead of) true capacity — after a layoff, a peak, or a mis-seeded anchor. The **catch-up** corrects this in a single move:

- After every session, a **demonstrated e1RM** is corroborated from that session's qualifying sets — a lone qualifying set (e.g. top-set programs) is used directly; with two or more, the single furthest-from-anchor set is dropped as a possible fluke and the next-furthest is used.
- If that estimate diverges from `c1rm` by more than **±10%**, `c1rm` jumps **70% of the way** toward it immediately (fast convergence, not a per-session nibble).
- When it fires it takes **full precedence** over the deterministic progression rules for that session: the regression streak clears and no reset is armed. Below the ±10% threshold the normal rules drive instead.

### Adaptive RPE Matrix Correction

Within the ±10% band — where a session broadly agrees with the anchor — the engine instead refines the _shape_ of the exercise's RPE curve so future prescriptions fit the lifter:

1. It reframes the grid as a 1-D **reps-to-failure** axis, `n = reps + (10 − RPE)`, so cells representing the same effort are learned together.
2. The representative set (same corroboration as the catch-up) gives a demonstrated fraction `pDemo = set_weight ÷ c1rm`. Each cell is nudged toward it with a slow learning rate (0.1) through a triangular kernel that fades over a radius of 3 in `n`-space.
3. A safety rule forbids _raising_ the percentage for rep counts higher than were actually performed, and the grid is re-checked for monotonicity afterward (% rises with RPE, falls with reps).
4. The correction is applied **last** — after the session's own prescription, evaluation, and catch-up — so it only shapes _future_ sessions, and it persists as a per-exercise matrix override.

### Per-Session Prescription Pipeline

For each exercise in a workout, prescriptions are calculated dynamically:

1. **Resolve base targets** from the progression model.
2. **Apply Mesocycle Modifiers** — additive shifts to the _targets_ (RPE and reps), never a direct load multiplier; the load re-renders from the shifted targets. Deload weeks are just weeks whose focus eases those targets. Only fields not locked in the `ExerciseConfigSheet` are touched (see **Periodization & Mesocycles** below).
3. **Consume a pending reset** — if a reset is armed, `c1rm` is dropped 10% once before rendering (this happens at workout start, not while previewing).
4. **Subtract session fatigue** — a transient reduction off the anchor when earlier exercises in the session tax the same muscles (see **Session Fatigue Reduction** below).
5. **Compute weight** from the matrix using the (possibly fatigue-reduced) anchor and the final reps/RPE.
6. **Top Set + Back-Off**: Compute the top set, then recalculate back-off loads from the top-set weight every session.

All targets are clamped to sensible limits (sets ≥ 1, reps ≥ 1, RPE ≤ 10).

### Session Fatigue Reduction

Exercises later in a session don't start fresh. Each exercise can configure a **Fatigue Reduction** — a maximum amount (kg or % of `c1rm`, default 10%; 0 disables it) shaved off the anchor before its loads render. The reduction is purely **muscle-overlap based** (an RPE-driven scaling was considered and discarded): each prior exercise contributes `base × muscle-overlap tier`, with the **largest candidate winning** (never a sum).

- **Overlap ladder** (current exercise's role weighs heavier): its primary muscle was a prior exercise's primary → **100%** of base; primary←secondary → **75%**; secondary←primary → **50%**; secondary←secondary → **25%**; no overlap → nothing.

Priors are the exercises earlier in routine order, so the reduction is known at prescription time and the preview already shows the reduced loads. Post-session evaluation re-renders this same baseline with fatigue accounted for, so outcomes are judged against the weights that were actually prescribed.

The reduction is session-transient: it shapes rendered loads only and never moves the stored `c1rm`. When a set is logged, a green-dot proposal can still surface if the demonstrated capacity differs materially from the prescribed load — accepting it recalibrates the exercise's remaining sets to that capacity.

---

## 📈 Progression Models

Each exercise is assigned a single progression model that dictates how `c1rm` adapts. Every session resolves to one of three outcomes — **success**, **hold**, or **regression** — judged deterministically against the _originally prescribed_ weight. For multi-set models the **worst set** (highest RPE, tie-break fewest reps) decides a regression, while a success requires _every_ set; a set logged without an RPE can neither confirm a success nor trigger a regression, so it falls through to a hold.

### 1. Linear Progression (LP)

- **Application**: Main compound lifts during strength peaking.
- **Outcome logic**:
  - **Success**: every set hits `reps ≥ target_reps` at `rpe ≤ target_rpe` and the prescribed weight → `c1rm += weight_increment`; clear the regression streak.
  - **Regression**: the worst set is at the prescribed weight with `reps ≤ target_reps` but `rpe > target_rpe` (grinding) → increment the regression streak.
  - **Hold**: anything in between → no change.

### 2. Double Progression

- **Application**: Hypertrophy-focused accessory movements.
- **Outcome logic**:
  - **Success**: every set reaches `max_reps` and the worst set stays `≤ target_rpe` → `c1rm += weight_increment`; reset the rep cursor to `min_reps`.
  - **Regression**: the worst set bottomed out at `≤ min_reps` while grinding (`rpe + 1 > target_rpe`) → increment the regression streak.
  - **Hold**: otherwise → advance the rep-target cursor one step toward `max_reps` at the same weight.

### 3. Top Set + Back-Off

- **Application**: Primary strength lifts requiring high-intensity exposure.
- **Outcome logic**: only the **top set** drives progression.
  - **Success**: top set `reps ≥ target_reps` at `rpe ≤ target_rpe` (judged on reps + RPE, no weight clause) → `c1rm += weight_increment`; clear the streak.
  - **Regression**: top set at the prescribed weight with `reps ≤ target_reps` and `rpe > target_rpe` → increment the streak.
  - Back-off sets never drive progression, but every qualifying set (top _or_ back-off) still feeds the RPE-matrix correction.

---

## 🛑 Regression Tracking & Reset

A regression never changes the load on the spot — it arms a counter, so a single bad day can't derail progression. The same `regression_streak` is shared across all models (each one's own rules decide what counts as a regression).

- **Arming**: each consecutive regression increments `regression_streak`. The **3rd** consecutive regression sets `reset_pending`. `c1rm` is _not_ dropped during evaluation.
- **Consuming**: the _next_ prescription applies the reset — `c1rm × 0.9` (−10%) — and clears both the streak and the flag. This two-phase timing is why a regression session shows no load change until the following workout, and why the lighter weight re-renders only then.
- **Recovery**: a success or a hold anywhere in the streak clears it. The [catch-up](#c1rm-catch-up) can also clear it outright — when demonstrated capacity has clearly moved past ±10%, it overrides the reset bookkeeping entirely. The −10% reset is therefore the fallback for _sustained, small_ regressions that stay within the catch-up band.

---

## 📅 Periodization & Mesocycles

YAFA supports structuring training blocks into **Mesocycles** using the visual `MesocycleSheet` component. Users can plan out multiple weeks where each week is assigned a specific training focus.

### Mesocycle Features

- **Week-by-Week Focus Allocation**: Assign specific training phases (e.g., Hypertrophy, Strength, Peaking, Deload) to each week.
- **Target Shifts, Not Load Multipliers**: a week's focus shifts an exercise's **RPE and rep targets** _additively_ (e.g. strength raises target RPE and trims reps; a deload eases both), and the prescribed load then re-renders from those shifted targets via the matrix. Working-set counts are left as configured — volume is not auto-periodized. The shift wraps around a repeating cycle, and any field the user locked (or that a given model never periodizes) is left untouched.

---

## 💾 Data, Backup & Restore

YAFA is **offline-first** — everything lives in IndexedDB on the device. A single portable **`backup.json`** is the way to safeguard or move it.

- **Export** writes one `backup.json` holding exercises, routines, plans, workouts, body measurements, analytics charts and portable settings (theme, units, chart timeframes).
- **Import** is a **non-destructive merge**: records are matched by id and upserted, so re-importing the same file (or one that overlaps existing data) never duplicates anything and never deletes data that is only on this device.
- **Resilient workouts**: because logged workouts can't be recreated by hand, the backup also stores them in a forgiving, name-keyed raw form (`exercise name → [{ timestamp, reps, weight, rpe }]`). If the structured workouts can't be restored (corrupt shape, an exercise that no longer resolves), YAFA falls back to this raw copy — recreating any missing exercises with a default config and rebuilding **one workout per calendar day**. The originating routine can't be recovered from raw, so those sessions are left under an unknown routine.
- **Per-chart CSV**: any analytics chart can be exported as a CSV that lists its configuration and includes a short step-by-step guide for rebuilding the chart in Excel or Google Sheets.
