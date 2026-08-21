# 01: Drive the progression loop test through `foldSession`

**What to build:** No user-visible change. The end-to-end progression test currently
re-composes the fold and prescribe pipeline by hand out of the pure modules — its own
comment says so — and directly exercises two functions later tickets delete. Rewrite it to
drive `foldSession`, so that every later ticket verifies its decisions at the seam that
actually runs in production instead of against a hand-built replica of the orchestration.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The end-to-end progression test reaches its per-session decisions through
      `foldSession` rather than by calling evaluate / step / catch-up in sequence itself
- [ ] Prescribe → log → fold → prescribe round trips still assert the same observable
      outcomes as before: seeding a cold-start exercise, an increment on a success, a hold,
      a sustained-regression deload, and a catch-up firing past the threshold
- [ ] Any assertion that only held because the test built the pipeline itself (rather than
      because the engine behaves that way) is dropped, not preserved by reaching around
      `foldSession`
- [ ] No production module changes in this ticket
- [ ] Full test suite green
