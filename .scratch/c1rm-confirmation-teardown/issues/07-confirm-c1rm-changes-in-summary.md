# 07: Confirm every c1RM change in the summary sheet

**What to build:** The lifter confirms every anchor change before it takes effect. The
summary sheet lists one row per proposed change — which exercise, what the anchor was, what
it would become — each ticked by default, with one button to apply what is ticked.
Dismissing the sheet in any way (swipe, close, app kill) discards every proposal and leaves
all anchors untouched. The workout itself is already saved by then, so dismissing never
costs a session.

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] The finished workout is persisted before the sheet appears, independent of what
      happens to the proposals
- [ ] Each proposal row shows the exercise, the reason, the anchor before and the anchor
      after, and is ticked by default
- [ ] Unticking one row leaves the other rows' proposals applying normally
- [ ] Confirming applies exactly the ticked rows and nothing else
- [ ] Swiping the sheet away, closing it, or killing the app applies nothing; every anchor
      stays where it was
- [ ] Confirming twice moves each anchor once
- [ ] Proposals that would not move an anchor do not produce a row, as today
- [ ] Applying-results doc updated in this change; `releases.json` entry added
