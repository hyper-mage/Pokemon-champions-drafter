---
status: partial
phase: 03-compiled-rules-priority-cards-swaps
source: [03-VERIFICATION.md, 03-12-SUMMARY.md]
started: 2026-08-19T00:00:00Z
updated: 2026-08-19T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Screen-reader pass on the four focus-moving transitions
setup: |
  Run `npm run dev`. Start a screen reader before opening the app — Windows Narrator needs no
  install (`Ctrl` + `Win` + `Enter`); NVDA is the plan's primary suggestion.
expected: |
  Walk four transitions and record, per transition, what was spoken and where focus landed:

  1. On the config screen, move a Mega round down one position with the keyboard. Is the newly
     focused button's own name (`Move down to round {n}`) heard?
  2. Play the last card of a round. Is `Round {r} pick order: …` heard, and where does focus land?
  3. Collapse each pane. What is spoken?
  4. Expand each pane. What is spoken?

  The design does NOT depend on the answer — every fact is also carried by a focused control's own
  name or by persistent on-screen text — so a preempted announcement is a finding to record, not a
  failure. Record the screen reader and OS by name.

  This settles the open question at `src/ui/components/SplitPanes.tsx:146-167`, which Phase 2
  could not answer without a real screen reader. `03-UI-SPEC` §Interaction & Accessibility wants
  the outcome written into the `SchedulePreview`, `CardPanel` and `SplitPanes` doc blocks, not
  only here.
result: pending
note: "Not run. Host reported no screen reader configured on 2026-08-19 and judged the check unimportant at this stage. Deliberately not recorded as passed — the three component doc blocks are left without an outcome rather than carrying a fabricated one."

### 2. Card-mechanic playtest with real players
setup: |
  A real session with the 4–8 friend group, or stand-ins. At least two full rounds of card play.
expected: |
  Four questions, answers recorded verbatim:

  1. Did playing last feel like an advantage? (D-18 assumes it does — that is what the rotation
     exists to distribute.)
  2. Did anyone expect **high** to pick first rather than low? (D-23.)
  3. Was the struck-through unplayable card understood without explanation, or did it need one?
  4. Did the resolved pick order stay findable during picking, or did anyone ask again?

  If the room wants a different rule, name the single function that would change and stop — do not
  change it as part of the test. The rotation is `selectCardPlayOrder`; low-plays-first is
  `resolvePickOrder`. Both are one-line changes; nothing in the contract hardcodes either.
result: pending
note: "Deferred to beta by explicit host decision on 2026-08-19 — to be run once the whole tool is complete rather than at the end of Phase 3."

### 3. The 8-player board height at three metres
setup: |
  An 8-player draft, at least two rounds filled, `standard` density, viewed from three metres.
expected: |
  The board shows all eight rows with NO internal vertical scrollbar in the split pane.

  This is DRFT-14 assertion 12 and is structural rather than a legibility question, which is why
  it is carried separately from the rest of the three-metre pass.
result: pending
note: "The three-metre legibility pass PASSED on a ~24\" 1080p monitor on 2026-08-19, but this particular check was not separately itemised in the host's report. Carried as pending rather than assumed — it is cheap to re-check on the next 8-player draft, and no evidence suggests a problem."

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps

- truth: "The two new focus-moving announcements are heard by a real screen reader, and the outcome is recorded either way (WR-02)"
  status: pending
  reason: "Not run — no screen reader configured on the host machine."
  severity: minor
  test: 1
  root_cause: "Not a code defect. The design deliberately does not depend on the answer: every fact an announcement carries is also carried by a focused control's own name or by persistent on-screen text, and 03-UI-SPEC states that a preempted announcement is a finding to record rather than a blocker. What remains open is the documentation requirement that the outcome live in three component doc blocks, and the Phase 2 question at SplitPanes.tsx:146-167."
  missing:
    - "Run the four transitions under a named screen reader and OS"
    - "Write the per-transition outcome into the SchedulePreview, CardPanel and SplitPanes doc blocks"
