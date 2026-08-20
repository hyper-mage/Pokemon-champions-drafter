---
status: partial
phase: 03-compiled-rules-priority-cards-swaps
source: [03-VERIFICATION.md, 03-12-SUMMARY.md]
started: 2026-08-19T00:00:00Z
updated: 2026-08-20T00:00:00Z
---

## Current Test

[test 2 only, deferred to beta]

## Tests

### 1. Screen-reader pass on the four focus-moving transitions
setup: |
  Run `npm run dev`. Start a screen reader before opening the app — Windows Narrator needs no
  install (`Ctrl` + `Win` + `Enter`); NVDA is the plan's primary suggestion.
expected: |
  Walk four transitions and record, per transition, what was spoken and where focus landed:

  1. On the config screen, move a Mega round down one position with the keyboard. Is the newly
     focused button's own name (`Move down`) heard?
  2. Play the last card of a round. Is `Round {r} pick order: …` heard, and where does focus land?
  3. Collapse each pane. What is spoken?
  4. Expand each pane. What is spoken?

  The design does NOT depend on the answer — every fact is also carried by a focused control's own
  name or by persistent on-screen text — so a preempted announcement is a finding to record, not a
  failure. Record the screen reader and OS by name.

  This settles the open question at `src/ui/components/SplitPanes.tsx:215-227`, which Phase 2
  could not answer without a real screen reader. `03-UI-SPEC` §Interaction & Accessibility wants
  the outcome written into the `SchedulePreview`, `CardPanel` and `SplitPanes` doc blocks, not
  only here.
result: descoped
note: "Descoped by host decision on 2026-08-20 during the /gsd-audit-uat sweep: `it mostly works but I do not want this project to put anymore effort into screen reading`. Recorded as DESCOPED, not passed — the host's `mostly works` is an informal impression offered in passing, not the four-transition pass this test asks for, and writing it down as a pass would be exactly the fabrication the previous note refused. Nothing in the design depends on the answer, so descoping costs no verified behaviour; see `deferred-items.md` §7 for what would reopen it. The step text above is preserved verbatim so a future run needs no reconstruction."

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
note: "Deferred to beta by explicit host decision on 2026-08-19 — to be run once the whole tool is complete rather than at the end of Phase 3. Re-confirmed unchanged during the 2026-08-20 audit."

### 3. The 8-player board height at three metres
setup: |
  An 8-player draft, at least two rounds filled, `standard` density, viewed from three metres.
expected: |
  The board shows all eight rows with NO internal vertical scrollbar in the split pane.

  This is DRFT-14 assertion 12 and is structural rather than a legibility question, which is why
  it is carried separately from the rest of the three-metre pass.
result: pass
note: "Approved by the host on 2026-08-20 following the /gsd-audit-uat sweep, which surfaced this as the one item testable on one machine with no prerequisites. It completes the three-metre pass that PASSED on a ~24\" 1080p monitor on 2026-08-19 but did not itemise this fifth, structural check. Consistent with the measured budget recorded at `BoardGrid.css:67-72` — the 8-player board lands at ~683px against ~851px available at 1080p, so the pane's `overflow-y: auto` (`SplitPanes.css:141`) has headroom rather than being exercised. DRFT-14 assertion 12 is closed."

## Summary

total: 3
passed: 1
issues: 0
pending: 1
skipped: 0
blocked: 0
descoped: 1

## Gaps

- truth: "The two new focus-moving announcements are heard by a real screen reader, and the outcome is recorded either way (WR-02)"
  status: descoped
  reason: "Host decision 2026-08-20 — no further project effort on screen-reader verification for this milestone."
  severity: minor
  test: 1
  root_cause: "Not a code defect, and never was. The design deliberately does not depend on the answer: every fact an announcement carries is also carried by a focused control's own name or by persistent on-screen text, and 03-UI-SPEC states that a preempted announcement is a finding to record rather than a blocker. What the descope closes is the DOCUMENTATION obligation — the requirement that an outcome be written into three component doc blocks, and the Phase 2 question at SplitPanes.tsx:215-227. Both doc blocks now record the descope instead of an unmet obligation, so nothing in `src/` claims a check is owed."
  disposition: "Logged in deferred-items.md §7 with the two conditions that would reopen it. No code change was made and none is warranted."
