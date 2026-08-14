---
status: complete
phase: 02-host-configured-draft-night
source: [02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md, 02-04-SUMMARY.md, 02-05-SUMMARY.md, 02-06-SUMMARY.md, 02-07-SUMMARY.md, 02-08-SUMMARY.md]
started: 2026-08-14T00:00:00Z
updated: 2026-08-14T00:00:00Z
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
expected: With a valid config, `Start draft` leaves the form and shows the draft screen: pool on one side, board on the other. The board has a cell per player per round. The turn banner names whose pick it is, and the empty board names the first picker. You can switch which pane is expanded, and that choice survives a page reload.
result: issue
reported: "there is no way to expand the pool pane, but there is one for the draft board"
severity: major

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
expected: During a draft, the `Bans (n)` disclosure expands to list the banned species by name. It contains no buttons — there is no way to add or remove a ban once the draft has started. The count matches what you set in config.
result: issue
reported: "pass, but i don't see a disclosure anywhere"
severity: major
note: "Host typed pass, but the caveat negates the test's subject — an unobservable surface verifies nothing, so this is recorded as an issue rather than a pass. Diagnosis to determine whether the disclosure is suppressed at zero bans (expected) or genuinely absent from the draft screen."

## Summary

total: 16
passed: 14
issues: 2
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "You can switch which pane is expanded, and that choice survives a page reload"
  status: failed
  reason: "User reported: there is no way to expand the pool pane, but there is one for the draft board"
  severity: major
  test: 9
  root_cause: ""     # Filled by diagnosis
  artifacts: []      # Filled by diagnosis
  missing: []        # Filled by diagnosis
  debug_session: ""  # Filled by diagnosis

- truth: "During a draft, the `Bans (n)` disclosure expands to list the banned species by name"
  status: failed
  reason: "User reported: pass, but i don't see a disclosure anywhere"
  severity: major
  test: 16
  root_cause: ""     # Filled by diagnosis
  artifacts: []      # Filled by diagnosis
  missing: []        # Filled by diagnosis
  debug_session: ""  # Filled by diagnosis
