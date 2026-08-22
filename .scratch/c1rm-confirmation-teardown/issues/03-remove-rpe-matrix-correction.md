# 03: Remove RPE matrix correction

**What to build:** Hand-edited RPE matrix values stay exactly where the lifter left them.
The adaptive correction that reshaped an exercise's RPE curve after every session is gone.
Everything else about the matrix is untouched: the global default, per-exercise overrides,
the hand-edit path with its monotonicity enforcement, and the read-only global view all
keep working. The per-exercise override field is deliberately kept — this feature is
expected to return later in a different form.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Finishing a session never writes an exercise's RPE matrix
- [ ] Editing a matrix by hand, saving, and finishing several sessions leaves the edited
      cells unchanged
- [ ] Per-exercise overrides still load, still highlight cells that deviate from the global
      matrix, and can still be reset to the global default
- [ ] The correction function, its smoothing kernel, its gate in the fold, and its two
      tuning constants are deleted
- [ ] The fold's "learn last, anchored on the pre-catch-up value" ordering invariant is
      removed from both code comments and docs
- [ ] Tests covering the deleted correction are removed; matrix lookup, monotonicity and
      cell-editing tests stay
- [ ] Glossary and RPE-matrix docs updated in this change; `releases.json` entry added
