# 09: Per-slot toggle for whether an exercise drives the anchor

**What to build:** Each exercise in a routine gets a toggle deciding whether its sets move
the anchor, on by default, so accessory work stops redefining the strength the main lifts
are prescribed from. Because it lives on the routine slot, the same movement can calibrate
on a heavy day and not on a pump day. Turning it off is not turning the exercise off: it is
still prescribed, still counts for adherence, still earns PRs.

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] The toggle appears in the per-exercise routine configuration and defaults to on,
      following the repo's binary-toggle pattern
- [ ] Existing routines behave exactly as before without migration — the field is optional
      and absent means on
- [ ] With the toggle off, the exercise produces no increment, no cut and no recalibrate
      proposal
- [ ] With the toggle off and no anchor yet, a first anchor is still proposed — the
      exercise never becomes permanently unprescribable
- [ ] Prescription, adherence, PRs and session fatigue are unaffected by the flag
- [ ] The same exercise can have the toggle on in one routine and off in another
- [ ] Gating and the seed exemption are covered through `foldSession`
- [ ] Data-model and planning docs updated in this change; `releases.json` entry added
