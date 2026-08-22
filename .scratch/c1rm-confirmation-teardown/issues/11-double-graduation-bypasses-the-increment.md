# 11: Double progression's configured increment is inert for wide rep ranges

**What to build:** Undecided — this ticket carries a question, not a specification.

For double progression the prescribed weight is anchored at `minReps`, while a graduation
session demonstrates capacity at `maxReps`. The ratio between those two matrix percentages
decides whether the session's demonstrated e1RM clears the ±10% catch-up threshold. For
wide ranges it does, so catch-up fires and the configured `weightIncrement` never applies:
the anchor jumps by whatever closing 70% of that gap produces instead.

Measured against the default matrix at a c1RM of 100, a graduation session performed
exactly at `maxReps` and target RPE:

| Rep range | Reason reported | Resulting c1RM |
| --------- | --------------- | -------------- |
| 6–8       | `increment`     | 102.5          |
| 6–9       | `recalibrate`   | 108.2          |
| 6–10      | `recalibrate`   | 110.6          |
| 8–12      | `increment`     | 102.5          |
| 3–5       | `increment`     | 102.5          |

So a lifter on a 6–10 range has a `weightIncrement` setting that does nothing on the
session it is supposed to govern, and one on an 8–12 range has a setting that works — with
no way to tell which situation they are in. Nothing is broken; a decision was simply never
made here. It surfaced while rewriting the progression loop test for ticket 01, which is
why that test deliberately uses a 6–8 range: a wider one would have silently exercised
catch-up while claiming to verify the increment.

The question is which of these the app means:

1. **Fine as-is** — a lifter who adds four reps at target RPE really has gained more than
   one increment, and catch-up reporting that is correct. Then `weightIncrement` should be
   documented as not applying to wide double ranges, and the UI should probably say so.
2. **Graduation should be exempt from catch-up** — a success by the rules takes its
   configured increment and nothing else, and catch-up only weighs sessions the rules did
   not already explain.
3. **The weight should be anchored differently** — anchoring the load at the rep cursor
   rather than at `minReps` would keep demonstrated capacity near the anchor throughout the
   cycle, at the cost of a load that moves every session within a range.

**Blocked by:** None (can start immediately) — but it needs a decision before it can be
built, and it overlaps the deferred progression-model question from the original teardown
list, so it may belong to that effort instead.

**Status:** needs-triage

- [ ] A decision is recorded between the three options above (or a fourth)
- [ ] If the behaviour changes, the progression loop test covers a wide rep range rather
      than avoiding one
- [ ] If the behaviour stays, the glossary and progression-models doc state that catch-up
      supersedes the configured increment on wide double ranges
