---
status: pending
phase: 04-blind-and-snake-bans
source: [04-UI-SPEC.md §DRFT-14 item 4, 04-RESEARCH.md §Environment Availability, 04-11-PLAN.md task 3]
started: 2026-08-25T00:00:00Z
updated: 2026-08-25T00:00:00Z
---

## Screen used

physical_size: [record the diagonal in inches, e.g. `24"`]
resolution: [expect 1080p]
distance: [expect 3 metres]

## Before you start

Configure **8 players, `blind` mode, 2 bans per player, `standard` density**. Everything below
is one continuous session on that tournament except (d), which reconfigures.

`npm run verify` exits 0 as of the commit this file was written at — 61 files, 2025 tests, and
a clean build.

**If a size fails, that is a finding about that `--text-*` token on a shared screen. The
remedies available are the existing four-size scale and the existing pane states. It is not a
licence to introduce a fifth font size — record the failure and stop.**

## Tests

### (a) The locked state
setup: |
  Start the tournament. Do not enter anyone's bans yet. Stand 3 metres back from the locked
  screen.
expected: |
  Read aloud, from 3 metres:

  1. Whose turn it is (`{name} is next`).
  2. The progress count (`{n} of 8 entered`).
  3. Which players show `Entered`.

  Then answer the question this phase exists for:

  **Can you name any Pokémon from this screen? You must not be able to.**

  Open the top bar's bans disclosure while you are there. It may show the host's banlist and
  nothing else.
result: pending
note: ""

### (b) The three discard paths
setup: |
  Tap `Enter {player}'s bans` and choose ONE Pokémon. Do **not** lock in.
expected: |
  Trigger each path in turn, returning to the entry surface between them:

  1. Tap `Hide these bans`.
  2. Alt-tab to another window and back.
  3. Press the browser Back button, then Forward.

  Confirm, for each of the three separately:

  - it lands on the locked state;
  - it shows the **same** discard notice;
  - it retains **nothing** — re-enter that player's bans and confirm no chip is pre-selected.
result: pending
note: ""

### (c) The reveal
setup: |
  Enter all 8 players' bans, arranging at least one deliberate duplicate between two players.
  Tap `Reveal bans`. Stand 3 metres back.
expected: |
  Read aloud, from 3 metres:

  1. The heading (`{n} Pokémon banned`).
  2. Every attributed ban — each player's name and every species under it.
  3. The collision line, in full.

  Confirm the collision line names both players and says the second ban is spent.
result: pending
note: ""

### (d) Snake
setup: |
  Abandon, reconfigure as `snake` with the same counts (8 players, 2 bans each, `standard`),
  and place several bans. Keep the ban board on screen.
expected: |
  Read aloud, from 3 metres:

  1. The turn banner (`Pass {p} of {passes} — {name} bans`).
  2. The `Pass {n}` column headers.
  3. The board rows — the player name on each row and the species in its cells.

  Then place every remaining ban to reach the snake reveal, and repeat (c)'s reading there.
  Confirm again that no Pokémon can be named from a locked screen — snake has none, so this
  half of (a) does not apply here.
result: pending
note: ""

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0
descoped: 0

## Gaps

- truth: "A human standing three metres from the shared screen can read every attributed ban and every collision line, and could name no Pokémon from the locked screen (DRFT-14 item 4)"
  status: pending
  reason: "Awaiting the physical pass. 04-RESEARCH §Environment Availability records the ~24\" 1080p screen and 3 metres of floor as human-dependent with NO automated fallback, and 04-UI-SPEC §DRFT-14 item 4 as 'mandatory and not substitutable'."
  severity: blocking
  test: [a, b, c, d]
  root_cause: "Not a defect. Every type size on every Phase 4 surface is one of the four `--text-*` tokens, and all three sizes in use were physically verified on the pessimistic screen during Phase 3 (STATE.md, 2026-08-19 and 2026-08-20). What automation cannot do is stand three metres back, and this pass doubles as the phase's secrecy check for BAN-05 and BAN-06."
  disposition: "Blocking checkpoint at 04-11 task 3. The phase is not complete until this file records a verdict per item."
