# 05: Replace the two-phase reset with an immediate cut

**What to build:** A single hard session drops the anchor 10% right away, instead of
counting to three and arming a reset that lands one workout later. The lifter no longer
experiences an unexplained delay between a failed session and a load change, and the app
stops having to teach regression streaks and pending resets at all.

**Blocked by:** 01, 04

**Status:** ready-for-agent

- [ ] A single regression outcome drops the anchor by the existing 10% reset fraction, in
      that session
- [ ] No state survives a session waiting to be applied at the next prescription
- [ ] Starting or previewing a workout performs no writes — the planning path is a pure
      read over stored state
- [ ] The regression streak counter and the pending-reset flag are removed from progression
      state, with a Dexie version bump and migration (structural change, not read-time
      backfill)
- [ ] The three-strike trigger constant is deleted; the 10% reset fraction is kept as the
      cut size
- [ ] The workout preview no longer shows a pre-reset anchor or a failure streak, and the
      regression-streak info topic is removed
- [ ] When a catch-up and a cut would both apply to one exercise, catch-up wins — at most
      one anchor move per exercise per session
- [ ] Glossary entries for regression streak and two-phase reset removed; applying-results
      and prescription-pipeline docs updated in this change; `releases.json` entry added
