# 08: Make the proposed anchor editable, and surface the rep cursor

**What to build:** When the lifter knows the proposed number is wrong, they type the one
they believe in instead of choosing between a wrong anchor and no anchor. The value on each
proposal row is tappable and edited through the app's existing numeric keypad, the same way
sets are entered. For double progression, the row also states that the rep target advanced,
as information only.

**Blocked by:** 07

**Status:** ready-for-agent

- [ ] Tapping a proposed value opens the app's numeric keypad, not a native number field
- [ ] An edited value is stored verbatim and unrounded; only rendered weights snap to the
      loadable increment
- [ ] The value is edited in total-load space — the same space the anchor is stored and
      displayed in — with no separate added-weight field for bodyweight exercises
- [ ] Confirming a row with an edited value persists the edited number, not the proposal
- [ ] A double-progression row states the advanced rep target as information and offers no
      veto; the cursor advances whether or not the row's anchor change is confirmed
- [ ] Applying-results doc updated in this change; `releases.json` entry added
