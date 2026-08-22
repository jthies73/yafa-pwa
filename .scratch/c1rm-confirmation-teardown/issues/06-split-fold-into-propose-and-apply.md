# 06: Split the fold into proposing and applying

**What to build:** Invisible to the lifter — sessions still finish exactly as they do now,
with every anchor change applied automatically. Underneath, deciding is separated from
persisting: one entry point loads what the fold needs and returns proposals without
writing anything, and a second thin entry point takes decisions and persists them. This is
what makes user confirmation possible in the next ticket.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] Finishing a session behaves exactly as before: the same anchors move by the same
      amounts, and the summary reports the same changes
- [ ] The propose entry point performs no database writes
- [ ] `foldSession` returns a proposal — exercise, reason, anchor before, anchor after, and
      any non-anchor state that advances regardless — rather than a state to persist
- [ ] The four reasons are seed, increment, cut and recalibrate; nothing is armed for later
- [ ] The idempotency guard changes meaning from "this session already folded" to "this
      session's proposals were already applied", and applying twice moves an anchor once
- [ ] No decision logic lives in either entry point: they load and they write
- [ ] The decision surface is covered through `foldSession` at the seam established in 01
- [ ] Applying-results doc updated in this change
