---
status: resolved
phase: 02-host-configured-draft-night
source: [02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md, 02-04-SUMMARY.md, 02-05-SUMMARY.md, 02-06-SUMMARY.md, 02-07-SUMMARY.md, 02-08-SUMMARY.md]
started: 2026-08-14T00:00:00Z
updated: 2026-08-19T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Fresh `npm run dev` with both localStorage keys cleared boots clean to the landing screen. No console errors, roster loads, nothing auto-created, `Resume saved draft` not offered.
result: pass

### 2. Landing Screen — three actions
expected: Landing screen offers exactly three actions — `New tournament`, `Resume saved draft`, `Import JSON…`. Nothing is created until you click something. If browser storage is blocked (try a private window with storage disabled), a warning surfaces rather than failing silently.
result: pass
note: "Host observed `Resume saved draft` does not appear at cold start. This is the designed behaviour — test 1 expected it absent-or-unavailable with nothing saved. Test 14 exercises the populated case."

### 3. Players and starting order
expected: `New tournament` opens one scrolling config form. You can add players, type names into each row, and remove a row. A numbered starting order is shown. `Randomize order` reshuffles the numbers and asks for confirmation first. Removing a player also asks for confirmation.
result: pass

### 4. Mega rules group
expected: The Mega rules group takes a "Megas required per team" number. Dual-Mega species (the roster's two) each get their own row where you choose a forme or leave it as Either. Choosing Either is the default state, not an extra selection you must make.
result: pass

### 5. Pool sizing — presets, override, re-roll
expected: The Pool group offers three presets. Picking one fills the pool size; the readout shows the drawn pool count. Typing your own number into the override takes over from the preset. Clearing the override to empty BLOCKS the form (it does not silently fall back to the preset). `Re-roll pool` asks for confirmation, then draws a different pool at the same size.
result: pass

### 6. Feasibility gate blocks Start with a reason
expected: Make the config impossible — e.g. set Megas required per team higher than the pool can supply, or set 40 players. `Start draft` becomes unavailable but stays focusable and reachable by keyboard, and a single sentence explains which field to change. Fix that field and the reason updates or clears. Emptying a numeric field also blocks rather than being read as zero.
result: pass

### 7. Banlist — add by name
expected: The Bans group has a search field. Typing filters to matching species; pressing/selecting an option adds it. Added species appear as removable chips, sorted by name. The ban count shown beside the group matches the number of chips. Banning the same species twice does not double-count.
result: pass

### 8. Banlist — ban from the pool grid, and clear
expected: The pool grid offers a ban mode where clicking a card toggles its ban. A species banned by name shows as banned in the grid, and vice versa — one list behind both surfaces. `Clear the banlist` asks for confirmation and names how many bans it will remove.
result: pass

### 9. Start draft → the two-pane draft screen
expected: |
  With a valid config, `Start draft` leaves the form and shows the draft screen: pool on one
  side, board on the other. The board has a cell per player per round. The turn banner names
  whose pick it is, and the empty board names the first picker. You can expand the draft board
  to full width and restore it, and that choice survives a page reload — reached via
  `Resume saved draft` on the landing screen, since the app never auto-enters a draft (test 2).

  The pool's own expand control is visible but inert while the draft runs, dimmed with a reason
  beside it, and clicking it does nothing.

  Amended after Phase 3 — the reason string is phase-dependent, and neither expand is always
  available:

  - Outside card play and swap rounds, the pool's reason reads
    `Available once the draft is complete`.
  - During a round's card play, the BOARD expand is also inert, reading
    `Available once the round's cards are played` (`boardExpandable = !cardPhase && !swapPhase`,
    app.tsx:945). The pool pane holds the only control that can act, so hiding it would hide the
    only available action — Amendment 3.
  - `complete` became tournament-complete in 03-11, so with swap rounds configured the pool
    expand stays inert through those too, not merely until the last pick.
result: pass
note: |
  Host verified 2026-08-19. Two observations, both confirmed as specified behaviour rather than
  defects:

  1. "When I reloaded the page I had to resume draft, not a big deal." — Correct and designed.
     The landing screen offers `Resume saved draft` (test 2, passed); the app deliberately never
     boots straight into a draft. The pane choice did survive the reload once resumed, which is
     what this test asserts.
  2. "I could not expand the draft until after players picked their round numbers, also not a
     big deal." — Correct and designed. That is Amendment 3's card-phase restriction, with
     `CARD_PHASE_EXPAND_REASON` naming the reason on screen. The host hit the rule at exactly
     the moment it applies.

  The affordance this test's gap demanded was built under 02-09: the pool expand renders inert
  with a visible reason instead of being omitted. Both observations above are recorded in the
  expected text so a future re-run is not misled by them.

### 10. Pool filters
expected: The filter bar has a search box, eighteen type buttons, a match-all toggle, a Mega filter, and `Clear filters`. Filtering narrows the grid and the count line updates. Tab moves into the type toolbar as ONE stop — arrow keys move between the eighteen buttons, Tab leaves the group. With no matches you get an empty state that names your query. Filters clear when a pick is committed.
result: pass

### 11. Display density, type pills, stats
expected: The `Display density` control switches the pool cells between three sizes, and the choice survives a reload. Each species shows its type(s) as coloured pills with the type name legible inside them. The stat block shows Total always, with the six individual stats behind a toggle. Text never shrinks below a readable size at the smallest density.
result: pass

### 12. Undo across a round boundary
expected: Make a pick, then Ctrl+Z (or the Undo control). Undoing within a round just undoes. Undoing a pick that would cross back into the previous round asks for confirmation first, and says so. Both the keyboard shortcut and the button behave identically.
result: pass

### 13. Abandon the draft
expected: `Abandon draft` asks for confirmation, and the dialog states that the exported JSON is the only durable record. Confirming returns you to the landing screen and clears the saved draft — reloading does not bring the abandoned tournament back.
result: pass

### 14. Resume and import
expected: Start a draft, make a pick, reload the page. `Resume saved draft` restores it with the pick intact. Export a JSON, then `Import JSON…` that file into a fresh state — it loads and matches. If you still have a Phase 1 export (schema v1) around, importing it also works rather than erroring.
result: pass

### 15. Read-only second tab cannot start a rival tournament
expected: |
  This is the check the security audit deferred to a human — automated tests cannot prove it
  because the test DOM implements neither focus nor pointer semantics.

  With a draft running in tab A, open the same URL in a second tab (tab B). Tab B shows a
  read-only banner naming tab A as the owner. In tab B, clicking `New tournament` does
  NOTHING — the click does not land, the config form does not open, and you cannot tab into
  any control on the screen behind the banner.

  At the same time, the banner's own `Take over drafting here` button IS clickable and IS
  reachable by keyboard, and screen-reader announcements still work. The gate must block the
  screens without locking you out of the takeover.
result: pass
note: "Closes the human-verify step the Phase 2 security audit deferred for T-02-15 / WR-07. happy-dom implements neither focus nor pointer semantics, so no automated test could prove the click is refused. Confirmed by hand at 132eaec: the gate blocks the screens and leaves the takeover reachable."

### 16. Bans disclosure on the draft screen is read-only
setup: |
  This test needs bans of its own — it must not inherit whatever the previous test left
  behind. From the landing screen choose `New tournament`, add two players, then in the Bans
  group ban two species by name. Confirm the group's own count reads `2 bans` before you
  leave the form, then `Start draft`.
expected: |
  During the draft you just started, the top bar shows `Bans (2)`. Expanding it lists exactly
  the two species you banned, by name. It contains no buttons — there is no way to add or
  remove a ban once the draft has started.

  Then the zero-ban case: start a second tournament with no bans at all. No disclosure
  appears — not `Bans (0)`, nothing. Absence is the specified behaviour there
  (`02-UI-SPEC.md:1013`), not a missing render.
result: pass
note: "Host verified 2026-08-19 with the added setup, and it passed. No code change was warranted at any point. `TopBar.tsx:211` matches `02-UI-SPEC.md:1013` and its tests at `tests/ui/ban-mode.test.tsx` pass. The original defect was this test's missing setup: with no setup step it inherited a zero-ban tournament from test 14 and then asserted a count, which is unobservable as written — so the host's `i don't see a disclosure anywhere` was a correct observation of correct behaviour. Setup added under plan 02-09; that setup is what made this test runnable."

## Summary

total: 16
passed: 16
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "You can switch which pane is expanded, and that choice survives a page reload"
  status: resolved
  reason: "User reported: there is no way to expand the pool pane, but there is one for the draft board"
  severity: major
  test: 9
  root_cause: "Not a code bug. `src/app.tsx:501` sets `poolExpandable = complete`, so the pool expand control appears only after the draft is over. The rule is deliberate, specified twice (02-UI-SPEC.md:116 and :731), prescribed verbatim by 02-06-PLAN.md:672, and pinned green by tests/ui/draft-panes.test.tsx:251 ('offers only the board expand while a draft is running'). It exists because pool-full collapses the board to a 44px strip, which would regress ROADMAP criterion 5 (board visible at every moment). The real defect is that the rule has NO AFFORDANCE — the pool's `pane__chrome` slot renders empty with no disabled control, no text and no announcement, so the host cannot distinguish 'unavailable' from 'broken'. This contradicts the same spec's own stated convention at 02-UI-SPEC.md:787-790 ('a control that appears and disappears is worse on a shared screen than one that is predictably inert') and the `— Not yet available` precedent at :631-633. Compounding it, `.pane__chrome` has no min-height (SplitPanes.css:71-75), so the empty chrome collapses to 0 and the two panes' content misaligns by ~44px, which reads as a failed render."
  artifacts:
    - path: "src/app.tsx:501"
      issue: "`poolExpandable = complete` — the whole rule. Correct; must NOT be changed."
    - path: "src/ui/components/SplitPanes.tsx:105-126"
      issue: "Pool `pane__chrome` renders empty mid-draft. This is where an affordance belongs."
    - path: "src/ui/components/SplitPanes.css:71-75"
      issue: "`.pane__chrome` has no reserved height, so it collapses to 0 and misaligns the panes."
    - path: ".planning/phases/02-host-configured-draft-night/02-UI-SPEC.md:104-124, :731"
      issue: "Source of the rule; internally inconsistent with its own :787-790 and :631-633 conventions."
    - path: ".planning/phases/02-host-configured-draft-night/02-UAT.md:49"
      issue: "Test 9's truth is D-18/D-19's unscoped wording, which 02-UI-SPEC.md:116 declined. Stale."
  missing:
    - "Render the pool expand control inert mid-draft (aria-disabled=\"true\", dimmed) with a brief reason, matching the :787-790 principle and the `— Not yet available` precedent"
    - "Reserve `min-height: var(--target-min)` on `.pane__chrome` so the panes stay aligned whether or not the slot has a control"
    - "Correct test 9's truth to: you can expand the draft board and restore it; the pool expands once the draft completes"
  constraint: "Do NOT render a WORKING pool expand button mid-draft. That lets pool-full hide the board, regressing ROADMAP criterion 5 and reopening T-02-24, whose mitigation is two independent coercions. Keep `poolExpandable = complete` and both coercions."
  debug_session: .planning/debug/resolved/pool-pane-not-expandable.md

- truth: "During a draft, the `Bans (n)` disclosure expands to list the banned species by name"
  status: resolved
  reason: "User reported: pass, but i don't see a disclosure anywhere"
  severity: major
  test: 16
  root_cause: "Not a product defect. The disclosure renders at `src/ui/components/TopBar.tsx:209-218` — the only `<details>` in `src/` — gated on `bannedNames.length > 0` and nothing else (not ownership, not sub-screen, not a flag). 02-UI-SPEC.md:1013 specifies exactly that: `| Bans disclosure, no bans | not rendered. No Bans (0). |`. Implementation matches spec. Four tests at tests/ui/ban-mode.test.tsx:506-548 render the full <App/>, resume to the draft screen and query `details.top-bar__bans`; 16/16 pass at HEAD. Styling is not the issue either — TopBar.css:95-109 gives it the same hairline border, radius and --target-min height as the four buttons beside it, so it reads as a fifth button. The `inert` restructure did not affect it: app.tsx:1000-1021 renders TopBar inside `.sticky-head` on the normal draft screen. The host's tournament simply had zero bans — test 8 ended by confirming `Clear the banlist`, test 13 abandoned, test 14 started fresh, and tests 15-16 added none. Nothing was in the DOM to overlook. The defect is in UAT test 16, which carries no setup step, inherits a zero-ban tournament, then asserts 'the count matches what you set in config' — unobservable as written."
  artifacts:
    - path: ".planning/phases/02-host-configured-draft-night/02-UAT.md:90-95"
      issue: "Test 16 has no setup step and inherits a zero-ban tournament, making its own expectation unobservable."
    - path: "src/ui/components/TopBar.tsx:209-218"
      issue: "None — correct as written, no change warranted."
    - path: ".planning/phases/02-host-configured-draft-night/02-UI-SPEC.md:1013"
      issue: "None — the governing spec line, which the implementation matches."
  missing:
    - "Give test 16 its own setup: create a tournament with at least two bans, start it, then confirm `Bans (2)` in the top bar, expand to two names, and assert no button inside"
    - "Add the zero-ban non-render as an explicit second assertion — that is what the host actually verified, and it passed"
  constraint: "Close this gap in 02-UAT.md, not in src/. No implementation change is warranted."
  debug_session: .planning/debug/resolved/bans-disclosure-not-visible.md
