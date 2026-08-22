# 10: History and anchor on the exercise card

**What to build:** During a session, the exercise card shows one line under the exercise
name: what the last session on this lift looked like on the left, and the anchor the
current numbers came from on the right — so a surprising prescribed weight is explainable
without leaving the workout. When the slot does not calibrate, the anchor is replaced by a
marker saying so, and "no proposal appeared for this lift" stops being a mystery.

**Blocked by:** 09

**Status:** ready-for-agent

- [ ] The card shows how long ago the last session on this exercise was and its best set as
      reps × weight @ RPE
- [ ] The card shows the raw anchor, never the session-fatigue-reduced one
- [ ] A slot whose calibration toggle is off shows a "no anchor" marker in place of the
      anchor
- [ ] An exercise with no history and no anchor renders the line without empty scaffolding
- [ ] The line folds away with the sets while a card is dragged
- [ ] The last-session figure is a pure function over logged workouts, tested as such — not
      computed inside the Vue composable
- [ ] The anchor rides on the existing slot-aligned prescription result rather than being
      loaded a second time, so card and prescription cannot disagree
- [ ] History is loaded once when the workout starts, not lazily per card
- [ ] Execution docs updated in this change; `releases.json` entry added
