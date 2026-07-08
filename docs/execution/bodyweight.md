---
title: Bodyweight Exercises
aliases:
  [Bodyweight, Bodyweight Offset, bodyweightFactor, Added Weight, Total Load]
tags: [yafa/execution, yafa/engine]
area: execution
order: 4
updated: 2026-07-09
---

# Bodyweight Exercises

Since v0.17.0, exercises can declare a **bodyweight factor** — the share of the lifter's bodyweight the movement lifts (e.g. ~90% for pull-ups or dips, 0% for barbell lifts). The engine then reasons about the _true_ load while the user keeps entering only what goes on the belt. The whole model lives in `src/engine/bodyweight.ts`; everything else calls its helpers at well-defined boundaries.

## The added↔total model

Two weight spaces, with one conversion between them:

- **Added weight** — what the user enters and sees: plates on the belt, `0` for a plain bodyweight rep, _negative_ for assistance. **Stored set weights are always added weights.**
- **Total load** — what the muscles experience: `total = added + offset`, where `offset = bodyweightFactor × bodyweight (kg)`. [[concepts#c1RM|c1RM]] and every e1RM live in **total-load space**; for factor-0 exercises the two spaces coincide.

The bodyweight comes from the **Bodyweight measurement** (`BODYWEIGHT_TYPE_ID` in `src/db/measurements.ts`) — a protected _system_ measurement type that can't be deleted. Missing bodyweight simply means offset 0 (the engine runs as if no factor were set); the UI surfaces a "log your bodyweight" hint rather than an error.

Helpers in `src/engine/bodyweight.ts`:

| Function                                                | Purpose                                                                                                                                        |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `bodyweightOffsetKg(factor, bodyweightKg)`              | The offset; 0 when either input is missing                                                                                                     |
| `liftSet` / `liftSets`                                  | Copy sets into total space (`+ offset`); **offset 0 returns the identical object** — factor-0 exercises take exactly the pre-feature code path |
| `pickBodyweightAt(entries, ts)`                         | Bodyweight in effect at a timestamp: latest entry ≤ ts, else earliest known                                                                    |
| `bodyweightShiftKg(oldFactor, newFactor, bodyweightKg)` | c1RM re-base delta when the factor is edited                                                                                                   |

## Invariants

1. **Lift at the boundary**: callers lift sets into total space immediately before matrix/fold/seed math, and subtract the offset again before displaying or storing any weight.
2. **Evaluation stays in added space** on both sides — prescribed vs. actual compares added weights, so the offset cancels; never hand `evaluate` lifted sets against an unlifted prescription ([[applying-results#Evaluation semantics|applying-results]]).
3. **Lift before un-fatiguing**: `total = (added + offset) ÷ fatigueScale` — the transforms don't commute ([[fatigue-and-slots]]).
4. **Round after subtracting**: prescriptions compute the total from the anchor, subtract the offset, _then_ `roundToLoadable` — so displayed added weights land on the loadable grid (and may legitimately be negative for assisted work).
5. **Time basis**: prescriptions use the _current_ bodyweight (captured once at session start); folds and historical analytics use the _workout-time_ bodyweight (`bodyweightAt` / `pickBodyweightAt`) so results are reproducible and past PRs are immune to later bodyweight changes.
6. **Qualifying is judged in total space** — a plain bodyweight rep (0 added) becomes a positive total after lifting and can [[concepts#Qualifying set|qualify]].

## Where each subsystem hooks in

- **Prescription** — `prescribeExercise` takes a `bodyweightOffsetKg`; the load closure subtracts it before rounding. Top-set back-off drops apply to the **total** (`(top + offset) × fraction − offset`). The preview carries `bodyweightOffsetKg` (shown as a "Bodyweight share" row) and a `bodyweightMissing` hint. ([[prescription-pipeline]])
- **Tracking** — `useActiveWorkout` captures `bodyweightKg` once at session start and stores it in the snapshot (additive field; `SNAPSHOT_VERSION` stays 2, old snapshots refetch). Set validation accepts 0 and negative added weights. Green-dot proposals and the cold-start governor pass the offset into `proposeSetAdjustment`, which runs its matrix math in total space and gates on `weight + offset > 0`. ([[workout-tracking]])
- **Calculator** — `solveWeight` subtracts the offset from its result; `solveReps`/`solveRpe` receive `added + offset` as input. The numeric keypad gained a **±** key for assistance weights. ([[workout-tracking#Calculator panel|workout-tracking]])
- **Fold** — `applyWorkoutResults` lifts logged sets (with the session-time bodyweight) before seeding, corroborating, and matrix learning. ([[applying-results]])
- **Analytics** — the e1RM metric, PR detection, tooltips, and CSV export all lift per-workout (`pickBodyweightAt` per session); best sets render as `added + offset BW`. ([[analytics]])
- **Data layer** — `Exercise.bodyweightFactor?` (absent ⇒ 0); migration v11 backfills the factor and re-protects the Bodyweight measurement type (reversing v6); backups normalize both on import ([[data-model]], [[backup-restore]]).
- **Factor edits re-base c1RM** — `updateExercise` shifts the anchor by `bodyweightShiftKg` in a transaction so prescribed added weights stay continuous; streak/reset state is untouched and any residual drift is absorbed by the next [[concepts#Catch-up|catch-up]].

## Configuration UI

`ExerciseFormSheet.vue` exposes the factor as a "Bodyweight Involvement" percentage (0–100), with a warning when a factor is set but no bodyweight has ever been logged. `MeasurementsPage.vue` badges the Bodyweight type as "System"; its delete action is hidden and `deleteMeasurementType` refuses system types.

## Key functions

| Function                             | File                       | Note                                      |
| ------------------------------------ | -------------------------- | ----------------------------------------- |
| `bodyweightOffsetKg`                 | `src/engine/bodyweight.ts` | `factor × bodyweight`, 0 on missing input |
| `liftSet` / `liftSets`               | `src/engine/bodyweight.ts` | Added → total; offset-0 identity          |
| `pickBodyweightAt`                   | `src/engine/bodyweight.ts` | Historical bodyweight resolution          |
| `bodyweightShiftKg`                  | `src/engine/bodyweight.ts` | Factor-edit re-base delta                 |
| `currentBodyweight` / `bodyweightAt` | `src/db/measurements.ts`   | Latest vs. at-timestamp reads             |
| Migration v11                        | `src/db/db.ts`             | Factor backfill + system-type protection  |
| `normalizeBackupData`                | `src/db/backup.ts`         | Import-side backfill                      |

`src/engine/__tests__/bodyweight.spec.ts` (plus the bodyweight cases in `loop.spec.ts`) is the executable specification of the invariants above.
