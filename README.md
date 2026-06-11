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
- **Intelligent Smoothing** _(roadmap)_: A future smoothing pass (e.g., linear interpolation) will proportionally adjust surrounding cells when one is edited to maintain a logical progression curve.

---

## ⚙️ Workout Engine Architecture

YAFA's workout engine is highly modular, separating concerns into independently testable units: progression models, the RPE matrix + e1RM subsystem, the reset/modifier subsystem, and the per-session prescription pipeline.

### Core Concepts: The Two e1RMs

To decouple physiological variance from prescribed weights, YAFA tracks two distinct estimated one-rep max (e1RM) values per exercise:

- **`working_e1rm`**: A persistent planning scalar. Every weight prescription is computed from this. It increases by `weight_increment` on a successful session and is reduced by an intensity reset. It is the absolute source of truth for daily prescriptions.
- **`observed_e1rm`**: A rolling average of implied e1RMs from the last 10 qualifying sets (reps ≤ 10 AND RPE ≥ 8). This is a **diagnostic only**—used to detect divergence from `working_e1rm` and as a re-baseline target during an intensity reset. It is *never* used directly for daily prescriptions.

### Matrix-Derived Weights & Updates

Weight is always calculated as: `weight = working_e1rm × rpe_matrix[reps][rpe]` (rounded to loadable increments). `weight_increment` is the amount added to `working_e1rm` on a successful session, not a direct load delta.

The RPE matrix maps `(reps, rpe)` to a percentage of e1RM (axes: reps 1–10, RPE 6.0–10.0 in 0.5 steps). Post-session, the matrix is updated dynamically for qualifying sets:
1. Recomputes `observed_e1rm`.
2. Nudges the cell toward reality: `observed_pct = set_weight / observed_e1rm`, updating the cell using a slow-moving EMA (Exponential Moving Average).
3. Smooths across neighboring cells within ±1.0 RPE of the touched cell.

### Per-Session Prescription Pipeline

For each exercise in a workout, prescriptions are calculated dynamically:
1. **Resolve base targets** from the progression model.
2. **Apply Mesocycle Modifiers** (multiplicative). Deload weeks are simply treated as normal weeks with modifiers that make the goal easy. Modifiers are only applied to fields not locked in the `ExerciseConfigSheet`.
3. **Apply Active Reset Modifiers** (decaying fatigue modifiers) multiplicatively.
4. **Compute weight** from the matrix using `working_e1rm` and the final reps/RPE.
5. **Top Set + Back-Off**: Compute top set, then recalculate back-off loads from the top-set weight every session.

All targets are clamped to sensible limits (sets ≥ 1, reps ≥ 1, RPE ≤ 10).

---

## 📈 Progression Models

Each exercise is assigned a single progression model that dictates how `working_e1rm` adapts.

### 1. Linear Progression (LP)

- **Application**: Main compound lifts during strength peaking.
- **Outcome logic**:
  - **Progress**: `actual_reps >= target_reps` AND `actual_rpe <= target_rpe` across all sets → `working_e1rm += weight_increment`; zero the failure streak.
  - **Failure**: `actual_reps < target_reps` OR `(actual_rpe - 1) > target_rpe` → increment failure streak.
  - **Hold**: Anything in between → no change.

### 2. Double Progression

- **Application**: Hypertrophy-focused accessory movements.
- **Outcome logic**:
  - If `actual_reps >= max_reps` across all sets → `working_e1rm += weight_increment`; reset current target reps to `min_reps`.
  - Otherwise advance target reps toward `max_reps`.
  - Tracks regression and plateau streaks based on the previous session's reps at the same weight.

### 3. Top Set + Back-Off

- **Application**: Primary strength lifts requiring high-intensity exposure.
- **Outcome logic**: Only the **top set** drives progression and fatigue evaluation. If top-set targets are met at or below target RPE → `working_e1rm += weight_increment`; zero the failure streak. Back-off sets are never evaluated for progression, but still feed the RPE matrix updates.

---

## 🛑 Fatigue Management & Resets

A reset zeroes the relevant streak counter and applies corrective modifiers to ease the lifter back into progression.

### Reset Triggers

- **Top Set**: 3 consecutive flagged sessions (`actual_reps < target_reps && actual_rpe > target_rpe` OR `actual_rpe - 1 > target_rpe`) → **Intensity Reset**.
- **Linear Progression**: 3 consecutive failures → **Intensity Reset**.
- **Double Progression**: Regression (2 consecutive sessions) or Hard Plateau (4+ consecutive sessions) → **Volume Reset**.

### Decaying Modifier Queue

Instead of permanent structural changes (outside of `working_e1rm` drops), resets apply as corrective multipliers that taper linearly to zero over a configurable number of sessions.

- **Intensity Reset**: Causes a LASTING reduction of `working_e1rm` (e.g., -10% or snapped to `observed_e1rm`) to clear systemic fatigue, PLUS a decaying intensity modifier to ramp back in gently.
- **Volume Reset**: Applies a decaying volume modifier only (reduces sets/reps). No change to `working_e1rm` or weight.
- **Decay Windows**: Intensity decays over a longer window (≈5 sessions) than volume (≈3 sessions) because neurological/systemic fatigue takes longer to clear than local muscular fatigue.

---

## 📅 Periodization & Mesocycles

YAFA supports structuring training blocks into **Mesocycles** using the visual `MesocycleSheet` component. Users can plan out multiple weeks where each week is assigned a specific training focus.

### Mesocycle Features

- **Week-by-Week Focus Allocation**: Assign specific training phases (e.g., Hypertrophy, Strength, Peaking, Deload) to each week.
- **Dynamic Variable Adjustment**: Dynamically passes down Volume and Intensity Modifiers to the workout calculation based on the mesocycle week when applicable.
