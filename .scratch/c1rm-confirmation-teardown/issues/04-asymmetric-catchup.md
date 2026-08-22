# 04: Make catch-up asymmetric

**What to build:** When a session demonstrates capacity well below the anchor, the anchor
closes the whole gap instead of 70% of it — a lifter who has lost strength stops being
prescribed weights they can no longer lift. Upward catch-up keeps closing 70% of the gap,
and the engage threshold stays symmetric at ±10%.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] A demonstrated e1RM more than 10% below the anchor moves the anchor to that estimate
      exactly
- [ ] A demonstrated e1RM more than 10% above the anchor moves it 70% of the way
- [ ] Divergence inside ±10% still leaves the anchor untouched in both directions
- [ ] Catch-up still reads only qualifying sets, still drops the furthest-from-anchor
      observation when two or more exist, and still uses a lone qualifying set directly
- [ ] The directional close fraction is expressed as named constants, not inline numbers
- [ ] Glossary catch-up entry and the applying-results doc updated in this change;
      `releases.json` entry added
