# 02: Reduce adherence to performed prescribed sets

**What to build:** The adherence score in the post-workout summary becomes the share of
prescribed sets the lifter actually performed — a number they can verify in their head.
Training harder, heavier, or for more reps than prescribed costs nothing. Extra sets cost
nothing but stay visible as a neutral count. The "why not 100%?" deduction breakdown
disappears from the summary.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The score is the rounded percentage of prescribed sets performed, clamped to 0–100
- [ ] A session that performs every prescribed set scores 100 regardless of RPE, rep or
      load deviation
- [ ] A session that skips an exercise entirely still counts that exercise's prescribed
      sets as missing
- [ ] Extra (off-script) sets do not lower the score and remain visible as a count
- [ ] The weight table, the per-set penalty computation, the five deduction categories and
      their per-exercise attribution are removed, along with the deduction rows in the
      summary UI
- [ ] The three deviation helpers in the shared prescribed-vs-actual comparison module that
      lose their last caller are deleted; the "at prescription" weight check stays
- [ ] The existing summary tests are rewritten against the new formula, not deleted
- [ ] Glossary and analytics docs updated in this change; `releases.json` entry added
