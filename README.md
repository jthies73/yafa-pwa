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

## 📈 V1 Progression Models

YAFA V1 implements core progression engines designed for varying fatigue profiles and exercise types. Users assign a specific engine per exercise.

### 1. Linear Progression (LP)

- **Application**: Main compound lifts during short-term strength peaking or re-sensitization phases.
- **Logic**: Fixed weight increments applied session-to-session, provided target sets and reps are completed.
- **Config Parameters**: `target_sets`, `target_reps`, `weight_increment`.
- **Execution Rule**: Increase load by `weight_increment` for the next session if `actual_reps >= target_reps` across all sets.

### 2. Double Progression

- **Application**: Hypertrophy-focused accessory movements and isolation exercises.
- **Logic**: Repetitions are expanded within a defined range. Weight is increased only when the rep ceiling is achieved across all sets, resetting reps to the floor.
- **Config Parameters**: `target_sets`, `min_reps`, `max_reps`, `weight_increment`.
- **Execution Rule**: Increase load by `weight_increment` and reset target to `min_reps` if `actual_reps >= max_reps` across all sets.

### 3. Top Set + Back-Off

- **Application**: Primary strength lifts requiring high-intensity exposure without excessive systemic fatigue.
- **Logic**: A heavy top set near maximal RPE is followed by back-off sets at a lower percentage to accumulate clean volume.
- **Config Parameters**: `top_set_target_reps`, `top_set_target_rpe`, `back_off_sets`, `percentage_drop`, `weight_increment`.
- **Execution Rule**: Increase top set load by `weight_increment` if performance targets are met at or below target RPE; dynamically recalculate back-off loads.

### 🛑 Fatigue Management & Automated Resets

YAFA utilizes specific rulesets to distinguish between an isolated bad training day and a true performance plateau, tailored to the progression model in use:

#### A. Top Set Progression Ruleset

- **Trigger:** 3 consecutive sessions of failure on the top set. A single session is flagged if:
  - _Target Failure:_ `(actual_reps < target_reps && actual_rpe > target_rpe)`
  - _Systemic Cost Too High:_ `(actual_rpe - 1 > target_rpe)`
- **Action:** Prompt an **Intensity Reset**. The system recalculates the e1RM based on recent performance or applies a structural load reduction.
- **Reasoning:** Top sets generate high central nervous system (CNS) fatigue. Using a 3-session trend distinguishes between a single bad day and a true plateau. Resetting the intensity allows the nervous system to recover and restores the athlete's capacity to express strength before resuming the progression.

#### B. Linear Progression Ruleset

- **Trigger:** 3 consecutive sessions of failure (`actual_reps < target_reps` OR `actual_rpe - 1 > target_rpe`).
- **Action:** Prompt an **Intensity Reset** (-10% of working weight).
- **Reasoning:** Linear progression relies on continuous, aggressive load increases. Failing multiple times indicates that fatigue accumulation has outpaced physical adaptation. Taking a 10% step back provides a "runway" to clear fatigue, build momentum, and break past the previous sticking point.

#### C. Double Progression Ruleset

- **Trigger:**
  - _Regression:_ `actual_reps < previous_actual_reps` at the same weight for 2 consecutive sessions.
  - _Hard Plateau:_ `actual_reps == previous_actual_reps` for 4+ consecutive sessions.
- **Action:** Prompt an **Exercise Rotation** or **Volume Reset**. The weight is _not_ dropped.
- **Reasoning:** Double progression is typically used for hypertrophy-focused accessory work where dropping absolute load is counterproductive. Instead, rotating the exercise (e.g., swapping Dumbbell OHP for Machine OHP) alters the resistance profile to spur new growth, or dropping a set clears local muscular fatigue without sacrificing intensity.
