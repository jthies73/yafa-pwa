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
