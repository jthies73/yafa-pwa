# Spec: User-confirmed c1RM, and a teardown of the machinery around it

**Status:** ready-for-agent

## Problem Statement

The engine moves the training anchor behind the user's back. A session finishes, the
[[fold]] runs, and the c1RM has already changed by the time the summary sheet appears —
the sheet only reports what happened. When the engine is right, that is invisible and
good. When it is wrong, the user has no way to say so: there is no manual c1RM entry
anywhere in the app, so a bad anchor can only be corrected by training against it until
the engine notices.

Around that core problem sits machinery whose cost the user never sees returned:

- **Two-phase reset.** A hard session shows no load change at all; the drop arrives one
  workout later, after three consecutive regressions. The user experiences a delay they
  cannot explain and did not ask for.
- **Regression streak.** A counter the user must be taught (it has its own info topic and
  a preview-sheet line) purely to explain that delay.
- **RPE matrix correction.** An adaptive learning step that silently reshapes an
  exercise's RPE curve. It is the most complex single piece of the engine and its effect
  is invisible until it has already changed prescriptions.
- **Adherence score.** A five-category weighted deduction model — RPE overshoot, rep
  deviation, load deviation, missing sets, off-script volume — presented as a
  "why not 100%?" breakdown. It is analytics-only, feeds no decision, and the weights are
  unexplainable to the person reading them.
- **Blanket calibration.** Every exercise in a routine moves the anchor. There is no way
  to say "this accessory lift should not redefine my strength."

There is also no information on the exercise card during a session: the user sees the
prescribed sets but not what they did last time or what anchor those numbers came from.

## Solution

**The user confirms every c1RM change.** After a session, the summary sheet lists one row
per exercise whose anchor the engine wants to move, each with the proposed new value. Rows
are ticked by default — the engine's decision is the recommendation, not a question — and
the value itself is tappable, so the user can correct the number instead of only accepting
or rejecting it. One button applies what is ticked. Anything else — swiping the sheet away,
closing the app, killing it — discards the proposals and leaves every anchor where it was.

**A hard session cuts immediately.** A single regression proposes a −10% anchor drop, on
the spot, in that same sheet. The streak and the one-workout delay disappear: the safety
mechanism that justified waiting for a third strike is now the human reading the row.

**Each exercise in a routine decides whether it calibrates.** A per-slot toggle, on by
default. Off means this exercise's sets never move the anchor — though a first-ever anchor
is still proposed, because an exercise with no c1RM can never be prescribed a weight.

**Adherence becomes one number the user can derive in their head:** the share of
prescribed sets they actually performed. Nothing else deducts.

**The RPE matrix stops learning.** The grid stays exactly as editable by hand as it is
today, per exercise and globally; only the automatic correction is removed. This feature is
intended to return later in a different form.

**The exercise card carries its own history.** One line under the exercise name: what the
last session on this lift looked like, and the anchor the current numbers came from.

## User Stories

1. As a lifter finishing a session, I want to see every proposed c1RM change before it
   takes effect, so that the engine never silently redefines my strength.
2. As a lifter, I want each proposed change ticked by default, so that accepting the
   engine's judgment costs me one tap and not one tap per exercise.
3. As a lifter who disagrees with a proposal, I want to untick that one exercise, so that
   the rest of the session's proposals still apply.
4. As a lifter who knows the proposed number is wrong, I want to type the anchor I believe
   in, so that I am not forced to choose between a wrong number and no number.
5. As a lifter, I want an untouched anchor when I dismiss the sheet, so that closing the
   app is never a decision I did not intend to make.
6. As a lifter, I want to see which exercise each proposal belongs to and what the anchor
   was before, so that I can judge the size of the move.
7. As a lifter having a bad day, I want a single failed session to propose a cut right
   away, so that my next session is prescribed something I can actually lift.
8. As a lifter, I want that cut to be a proposal like any other, so that one bad session
   under unusual circumstances does not cost me my anchor.
9. As a lifter, I want no unexplained one-workout delay between a hard session and a load
   change, so that the app's behaviour matches what I just experienced.
10. As a lifter, I want the app to stop teaching me about regression streaks and pending
    resets, so that there is less machinery between me and the next set.
11. As a lifter whose demonstrated capacity has drifted far above the anchor, I want the
    engine to propose closing most of that gap, so that I catch up in one move instead of
    a dozen increments.
12. As a lifter whose demonstrated capacity has dropped well below the anchor, I want the
    engine to propose closing that gap fully, so that I am not prescribed weights I can no
    longer lift.
13. As a lifter, I want at most one proposal per exercise per session, so that the sheet
    is a list of decisions and not a log of engine internals.
14. As a routine author, I want a per-exercise toggle for whether it calibrates, so that
    accessory work does not redefine the anchor my main lifts are prescribed from.
15. As a routine author, I want that toggle on by default, so that existing routines behave
    exactly as they did before.
16. As a routine author, I want the same exercise to calibrate in one routine and not in
    another, so that a heavy day and a pump day can share a movement.
17. As a lifter using a non-calibrating exercise for the first time, I want its first
    anchor proposed anyway, so that the exercise is not stuck without a prescribed weight
    forever.
18. As a lifter, I want a non-calibrating exercise to still be prescribed, still count for
    adherence, and still earn PRs, so that turning off calibration is not turning off the
    exercise.
19. As a lifter mid-session, I want to see on the exercise card what I did on this lift
    last time, so that I can judge the prescribed numbers against something real.
20. As a lifter mid-session, I want to see the anchor the prescription came from, so that
    a surprising weight is explainable without leaving the workout.
21. As a lifter, I want the card to show the raw anchor rather than a fatigue-reduced one,
    so that the number I see is one that actually exists in my data.
22. As a lifter, I want a visible marker on cards whose exercise does not calibrate, so
    that "no proposal appeared for this lift" is never a mystery.
23. As a lifter, I want that history line to fold away while I drag a card, so that
    reordering stays as legible as it is today.
24. As a lifter reading my summary, I want the adherence score to be the share of
    prescribed sets I performed, so that I can verify the number myself.
25. As a lifter, I want extra sets to cost me nothing, so that finishing with an extra
    back-off set is not punished.
26. As a lifter, I want training harder or heavier than prescribed to cost me nothing on
    the score, so that the number measures whether I showed up, not whether I obeyed.
27. As a lifter, I want the deduction breakdown gone, so that the summary stops explaining
    weights I cannot reason about.
28. As a lifter editing an RPE matrix by hand, I want my edits to stay exactly as I left
    them, so that the grid stops drifting between sessions.
29. As a lifter, I want per-exercise matrix overrides to keep working, so that the lifts
    where I have tuned the curve keep their tuning.
30. As a lifter using double progression, I want to see that the rep target advanced, so
    that the next session's higher reps are not a surprise.
31. As a lifter using double progression, I want that rep advance to happen without asking
    me, so that only anchor changes need my confirmation.
32. As a lifter, I want my in-progress workout saved the moment I finish it, regardless of
    what I do with the proposals, so that dismissing a sheet never costs me a session.
33. As a lifter who confirms twice (double tap, re-opened sheet), I want the second
    confirmation to change nothing, so that the anchor moves once per session.
34. As a lifter with bodyweight exercises, I want the anchor I edit to be the same
    total-load number the app stores, so that there is one anchor and not two.
35. As a maintainer, I want the planning path to perform no writes, so that previewing and
    starting a workout cannot mutate progression state.

## Implementation Decisions

### The fold becomes a proposal

`foldSession` stops returning a state to persist and starts returning a **proposal**: the
exercise, the reason, the anchor before, the anchor after, and whatever non-anchor state
advances regardless (the double-progression rep cursor). It keeps its current shape —
everything injected, no clock, no database — so the whole decision surface stays pure.

`applyWorkoutResults` splits in two:

- a **propose** entry point that loads what the fold needs, maps over `foldSession`, and
  returns the proposals. It performs **no writes**.
- an **apply** entry point that takes the user's decisions (which rows, and any edited
  value) and persists them, guarded for idempotency by `lastWorkoutId` — which changes
  role from "this session already folded" to "this session's proposals were already
  confirmed."

Both stay deliberately thin. No decision lives in either: they load and they write.

### Reasons

Four proposal reasons survive: `seed`, `increment`, `cut`, `recalibrate`. `cut` is new and
replaces the [[two-phase reset]] entirely. `resetArmed` disappears as a concept — nothing
is armed for later any more.

At most **one** proposal per exercise per session. When a [[catch-up]] and a `cut` would
both fire, catch-up wins: the [[demonstrated e1RM]] is the better-informed number than a
flat percentage.

### Regression becomes an immediate cut

The [[regression streak]] counter and the pending-reset flag are removed from progression
state, along with the arming step and the consuming step. A single regression outcome
proposes `c1rm × (1 − RESET_DROP)` — the existing −10% constant is reused as the cut size;
the three-strike trigger constant is deleted.

Because nothing is pending any more, **the planning path stops writing.** The prescribe
path currently consumes a pending reset and persists the result before returning
prescriptions; that write disappears, leaving prescription a pure read.

### Catch-up becomes asymmetric

The engage threshold stays symmetric at ±10% of the anchor. The close fraction becomes
directional: **70% of the gap upward, 100% downward.** Everything else about catch-up is
unchanged — it still reads only [[qualifying set]]s, still requires two or more of them to
drop the furthest-from-anchor observation as a possible fluke, and still uses a lone
qualifying set directly.

### Per-slot calibration toggle

A new optional boolean on the routine exercise config, absent meaning **true**. It lives on
the routine slot, not on the exercise, so the same movement can calibrate in one routine
and not in another.

When false, the exercise produces no `increment`, no `cut`, and no `recalibrate` proposal.
It still produces a `seed` proposal — a [[cold start]] exercise with no anchor is prescribed
`weight: null` forever otherwise, and the toggle means "do not let this lift *move* my
anchor," not "make this lift unusable." Prescription, [[adherence]], PRs and
[[session fatigue]] are all unaffected by the flag.

Because the field is optional with a safe default, it needs no migration.

### The RPE matrix stops learning

The adaptive correction is removed: the correction function, its smoothing kernel, its two
tuning constants, the gate that decides whether to apply it, and the write at the end of
the fold. Nothing else about the [[RPE matrix]] changes — the global default, per-exercise
overrides, the hand-edit path with its monotonicity enforcement, and the read-only global
view all stay. The feature is expected to return in a different form later, which is why
the per-exercise override field is kept rather than dropped.

An ordering invariant disappears with it: the fold no longer has a "learn last, anchored on
the pre-catch-up value" step, so the fold reduces to evaluate → propose.

### Adherence

The score becomes `round(100 × performed prescribed sets ÷ total prescribed sets)`, clamped
to 0–100. The weight table, the per-set penalty function, the five deduction categories and
their per-exercise attribution, and the off-script volume penalty are all removed, as is
the deduction breakdown in the summary UI. The result keeps only the score and the set
counts. Extra sets remain visible as a neutral count — not hidden, not penalised.

Three deviation helpers in the shared prescribed-vs-actual comparison module lose their
last caller and are deleted with it. The one that judges whether a logged weight is "at
prescription" stays: [[evaluation]] and the [[green dot]] still need it.

### Confirmation UI

The calibration section of the summary sheet becomes interactive: one row per proposal,
each with a tick (on by default) and a tappable value. Value editing reuses the app's
existing numeric keypad rather than a native number field, matching set entry.

The edited value is taken **verbatim**: the c1RM is stored unrounded, and only rendered
weights snap to the [[loadable increment]]. It is edited in **total-load space** — the same
space the anchor is stored and displayed in — with no separate added-weight field for
bodyweight exercises.

The double-progression rep cursor appears as an information line on the row. It advances
automatically and cannot be vetoed: it is not an anchor.

Rows whose reason produces no anchor movement do not appear, exactly as today.

### Exercise card insight

The card gains one line under the exercise name: the last session on this exercise (how
long ago, and its best set as reps × weight @ RPE) on the left, the raw anchor on the right
— or a "no anchor" marker when the slot's calibration toggle is off. The line folds away
with the sets while a card is being dragged.

The last-session figure is computed by a **new pure function** over logged workouts, not
inside the Vue composable — the same computation the exercise details page performs inline
today. The anchor rides on the existing slot-aligned prescription result rather than being
loaded a second time, so the card and the prescription can never disagree. The card shows
the **raw** anchor, never the [[session fatigue]]-reduced one: a reduced anchor is a number
no session ever had.

History is loaded once when the workout starts, not lazily per card.

### Schema and migration

Progression state loses two fields: the regression streak counter and the pending-reset
flag. That is a structural change to stored records, so it requires a real Dexie version
bump and migration, not read-time backfill.

The calibration toggle is a genuinely optional new field with a safe default and is
therefore exempt.

## Testing Decisions

A good test here asserts what a lifter would notice — "a single failed session proposes a
−10% anchor", "dismissing the sheet leaves the anchor untouched", "an exercise with
calibration off still gets its first anchor" — and never that a particular helper was
called or a particular intermediate shape was produced.

**The rich seam is `foldSession`.** It is pure, receives everything injected, and after
this change it carries the entire decision surface: the cut, the asymmetric catch-up, the
calibration gating with its seed exemption, the reason selection, and the rep cursor. Every
behavioural decision in this spec is testable there without a database.

**The propose and apply entry points stay untested, by construction.** There is no Dexie
test infrastructure in this repo, and adding it is out of scope. This is precisely why no
decision may live in them: they load and they write, and everything worth asserting sits
one level down in the pure fold.

**Adherence tests through the existing summary computation seam**, which already has
substantial coverage of the old deduction model. Those tests get rewritten against the new
formula rather than deleted.

**The card's last-session figure tests as a pure function** over logged workouts, which is
why it is extracted rather than left in the composable.

**Prior art, and one prefactor.** The end-to-end progression test currently re-composes the
pipeline by hand out of the pure modules — its own comment says it mirrors what the fold and
the prescribe path do, minus Dexie — and it directly exercises two functions this work
deletes. It should be driven **through `foldSession`** before anything else changes, so the
rest of the work is verified at the seam instead of against a hand-built replica of the
orchestration. Per-module tests for the matrix, evaluation, state, prescription and
mesocycle modules are the prior art for everything else.

## Out of Scope

- **Progression model simplification.** The `none` model stays exactly as it is. It was
  considered and explicitly rejected: collapsing it into "linear plus calibration off"
  would need a migration of existing configs for no user-visible gain.
- **Mesocycle modifiers.** The observation that they feel weak because set counts are never
  periodized is recorded and deferred to its own effort.
- **Re-implementing matrix learning.** Only the removal is in scope. The per-exercise
  override field is kept so a future implementation has somewhere to land.
- **Manual c1RM editing outside the summary sheet.** The confirmation row is the only place
  an anchor can be set by hand. A dedicated editor elsewhere is not needed while a
  regression proposes a cut on its own.
- **Recovering a dismissed proposal.** Dismissal is final. No pending-calibration state is
  persisted and no sheet reappears later.
- **Dexie test infrastructure.** Worth doing, but not here.

## Further Notes

The glossary and the docs set describe several things this work removes or changes:
the matrix correction, the regression streak, the two-phase reset, catch-up's single close
fraction, adherence's deduction model, and the fold's ordering invariants. Each ticket
updates the docs it invalidates in the same change, per this repo's docs convention, and
`releases.json` gets an entry.

The best structural outcome is a side effect rather than a goal: with nothing pending
between sessions, the whole planning path becomes write-free, and prescription reduces to a
pure read over stored state.
