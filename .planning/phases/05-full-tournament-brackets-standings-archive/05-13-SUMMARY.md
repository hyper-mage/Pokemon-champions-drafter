---
phase: 05-full-tournament-brackets-standings-archive
plan: 13
subsystem: ui
tags: [bracket, match-card, byes, champion, finished, reopen, aria-disabled, focus-management]

# Dependency graph
requires:
  - phase: 05-06
    provides: selectBracket, BracketMatch.roundLabel, Bracket.final, byes, selectTournamentLocked
  - phase: 05-08
    provides: the reopened action creator and canApply's tournamentLocked backstop
  - phase: 05-09
    provides: REOPEN_CONFIRM — the reopen dialog's four strings, consumed by reference
  - phase: 05-10
    provides: TournamentScreen's stage shell, ResultsGrid, MatchRecordDialog, FINISHED_CELL_REASON, the aria-disabled idiom
  - phase: 05-11
    provides: BRACKET_HEADING_ID — the post-cut focus seam this plan's heading carries
provides:
  - MatchCard — the five bracket cell states, including a bye drawn as a settled result and the champion
  - BracketGrid — round columns, pseudo-element connectors, and the bracket heading focus target
  - FinishedNotice — D-17's locked sentence and `Reopen this tournament`
  - FINISHED_SENTENCE — one declaration of the locked sentence, imported by ResultsGrid
  - RESULTS_FIRST_CELL_ID — the reopen's focus destination on the crosstable's first live cell
affects: [05-14, 05-15]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bracket connectors are ::before/::after borders, never a drawn layer that would re-measure the grid"
    - "A round label is read off BracketMatch rather than computed from a column index"
    - "A modal raised from inside the read-only gate is rendered by app.tsx as a sibling of it"
    - "A cross-file focus target is a shared exported id constant (BRACKET_HEADING_ID, RESULTS_FIRST_CELL_ID)"
    - "A stylesheet describes the token its acceptance gate forbids rather than quoting it"

key-files:
  created:
    - src/ui/components/MatchCard.tsx
    - src/ui/components/MatchCard.css
    - src/ui/components/BracketGrid.tsx
    - src/ui/components/BracketGrid.css
    - src/ui/components/FinishedNotice.tsx
    - src/ui/components/FinishedNotice.css
    - tests/ui/match-card.test.tsx
    - tests/ui/bracket-grid.test.tsx
    - tests/ui/finished-reopen.test.tsx
  modified:
    - src/ui/screens/TournamentScreen.tsx
    - src/ui/screens/TournamentScreen.css
    - src/ui/components/ResultsGrid.tsx
    - src/app.tsx
    - tests/ui/cut-control.test.tsx
    - tests/ui/tournament-screen.test.tsx

key-decisions:
  - "FinishedNotice is a new component rather than a ReadOnlyBanner variant, because the inventory rules that one banner meaning three things is how a sentence stops being trusted"
  - "The reopen confirm is rendered by app.tsx as a sibling of the read-only gate, since inert applies to a whole subtree and the gate can go up while the dialog is open"
  - "The reopen button is NOT accent-filled: Color reservation 2 assigns the bracket stage's accent to `View the draft recap` once the final is recorded"
  - "FINISHED_SENTENCE moved to FinishedNotice and is imported by ResultsGrid, so the locked sentence has one declaration"
  - "RESULTS_FIRST_CELL_ID lands on the first live cell only; an id repeated across 28 cells is not an id"
  - "The FinishedNotice.css header describes the destructive token rather than naming it, so the acceptance gate reads declarations instead of prose"

patterns-established:
  - "Locked is asked on every render and never stored, which is what makes undoing a reopen need nothing reset"
  - "A test that counts controls on both sides of a state change is how inert-not-hidden is actually proven"

requirements-completed: [TOUR-03, TOUR-04, TOUR-06]

# Metrics
duration: ~35min (task 3 only; tasks 1 and 2 predate this agent)
completed: 2026-09-01
---

# Phase 5 Plan 13: The Bracket, the Champion and the Finished Tournament Summary

**The bracket is a CSS Grid whose elbows are borders, it labels its rounds by how many matches
are in them, a bye reads as a settled result rather than a forgotten one, and when the final
lands the champion is named on the card the room is already looking at — after which every
result control goes inert with a stated reason and a host can reopen the night in two clicks
and undo that too.**

## Continuation Context

**Tasks 1 and 2 were executed by a previous agent that a provider quota limit killed mid-run.**
Their work was already merged into this agent's dispatch base `027cca3` and was **not redone**:

| Task | Commit | State on arrival |
|------|--------|------------------|
| 1 — Five card states, and a bye that reads as a settled result | `084632a` | complete, merged |
| 2 — The bracket is a grid, and its elbows are borders | `ede6ec6` | complete, merged |
| 3 — Finished, read-only, and reopenable | `ab2891f` | **executed here** |

`BASE_ON_ARRIVAL` was `93f20ad7de20976de91742d02463214f31974db1` (`docs(03): create phase plan`)
— several phases stale, and **the reset to the dispatch base was needed**. See Deviations.

## Performance

- **Duration:** ~35 min for task 3
- **Completed:** 2026-09-01
- **Tasks:** 3 of 3 (2 inherited complete, 1 executed here)
- **Files:** 16 distinct across the plan

## Accomplishments

**Task 1 — the five card states.** `MatchCard` draws one `BracketMatch` and derives nothing:
participants, advancement, the champion and the round label all arrive on the object
`selectBracket` produced. A bye is a resolved `<div>` with the seeded player in the first slot
and the word `Bye` in the second — not a button and carrying no inert ARIA, because there is
nothing to refuse when there was never a game. Every state reserves the same chrome so a card
that resolves does not move every card under it. No accent in any state.

**Task 2 — the grid.** One column per round, `grid-auto-flow: column` between rounds and
`align-content: space-around` within one, which is what centres each round against the pair
feeding it without any code knowing a card's pixel position. Connectors are `::before` /
`::after` borders; there is no `<svg>` and no injected markup. Round headers come off
`BracketMatch.roundLabel`, so sixteen seeds reads `Round of 16` where eight reads
`Quarter-final`. The `BRACKET_HEADING_ID` focus handoff 05-11 aimed at is wired here — it was
already correct on arrival and was left untouched.

**Task 3 — finished, read-only, reopenable.** `FinishedNotice` renders above everything on the
bracket stage exactly when `selectTournamentLocked` holds, states
`This tournament is finished. Results are read-only.` in a `role="status"` region, and offers
`Reopen this tournament`. Confirming raises `REOPEN_CONFIRM` — consumed by reference, not
restated — dispatches one `tournament/reopened`, and hands focus to the crosstable's first live
cell, because the button the host just pressed does not survive its own success.

## Task Commits

1. **Five card states, and a bye that reads as a settled result** — `084632a` (feat). Prior agent.
2. **The bracket is a grid, and its elbows are borders** — `ede6ec6` (feat). Prior agent.
3. **Finished, read-only, and reopenable** — `ab2891f` (feat). This agent.

## Key Implementation Details

- **The dialog is a sibling of the gate.** `inert` applies to a whole subtree, and the gate can
  go up *while the reopen question is on screen* when another tab takes the lock. Rendered
  inside, the dialog would go inert with the screen behind it and trap focus in a panel refusing
  its own dismiss. So `onRequestReopen` escapes to `app.tsx` — the second and last intent to do
  so, for exactly the reason `onSelectMatch` does. A read-only tab still cannot reopen anything:
  the only route to `kind: 'reopen'` is the notice's button, and the notice is behind the gate.
- **The reopen button is not accent-filled**, and this was a contract reading rather than a
  preference. §Color reservation 2 enumerates the primary action of each screen state one by
  one, and for the bracket stage it says "none until the final is recorded, then
  `View the draft recap`". The accent on a finished bracket is spoken for by a control 05-14
  builds, so this takes the plain bordered treatment `Back to the draft` takes.
- **One declaration of the locked sentence.** 05-10 declared `RESULTS_FINISHED` in `ResultsGrid`
  with a comment naming `FinishedNotice` as the surface that would own it. It now does:
  `FINISHED_SENTENCE` lives in `FinishedNotice` and `ResultsGrid` imports it, on the same
  precedent `FINISHED_CELL_REASON` already set. The old name is re-exported so nothing importing
  it has to care which file currently declares it.
- **The inert half was already built.** 05-10 made the crosstable's cells inert and Task 1 made
  the cards inert, both reading `selectTournamentLocked` and both using `aria-disabled` without
  the native attribute. Task 3 added the notice, the reopen and the shed — no second idiom was
  introduced, and the native `disabled` attribute appears in neither file.
- **`Confirm`'s one field-less member.** Every other member of that union carries the resolved
  consequence its body sentence names. `REOPEN_CONFIRM.body` is a plain string because it
  describes what *correcting* will cost rather than what reopening costs, and that is the same
  sentence whatever the tournament held.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The worktree arrived on a stale base and was reset**

- **Found during:** the mandatory startup assertion, before any implementation
- **Issue:** `BASE_ON_ARRIVAL` was `93f20ad` (`docs(03): create phase plan`), not the dispatch
  base `027cca3`. Tasks 1 and 2, and all of wave 6, were absent from the tree.
- **Fix:** `git reset --hard 027cca3`, as the dispatch prompt's startup step sanctions. The
  content greps then passed: `MatchCard.tsx`, `BracketGrid.tsx`, `StandingsTable.tsx` and
  `TournamentLibrary.tsx` all present, `BRACKET_HEADING_ID` present in `BracketGrid.tsx`.
- **Note:** this is the eighth consecutive worktree in this project to arrive stale. The SHA
  assertion alone would have been enough here, but the content greps are what made it safe to
  proceed without re-reading every prior summary.

**2. [Rule 3 - Blocking] `src/app.tsx` was modified, though Task 3's `<files>` does not list it**

- **Found during:** Task 3, wiring the confirm
- **Issue:** The plan says the reopen "raises a `default`-toned `ConfirmDialog`", and 05-11
  recorded the structural rule that a dialog which must stay usable has to be a **sibling** of
  the read-only gate. Every route to a sibling placement goes through `app.tsx`, which holds the
  gate and all five existing dialogs. Rendering the confirm inside `TournamentScreen` would have
  put it inside the gate and reintroduced exactly the focus trap the placement rule exists to
  prevent.
- **Fix:** `app.tsx` gained a `{ kind: 'reopen' }` member, a `confirmReopen` callback, the focus
  handoff effect and one `ConfirmDialog` branch. 05-11 avoided `app.tsx` because plan 05-12 owned
  it concurrently; 05-12 is merged, so there is no contention now.
- **Files modified:** `src/app.tsx`
- **Commit:** `ab2891f`

**3. [Rule 1 - Bug] The `color-danger` acceptance grep matched my own comment**

- **Found during:** Task 3, running the acceptance criteria
- **Issue:** `grep -c "color-danger" src/ui/components/FinishedNotice.css` returned 1. The
  stylesheet does not *use* the token — the match was a header comment explaining why it must
  not be used. A gate matching documentation rather than declarations is a gate that passes on a
  stylesheet which has quietly started doing the forbidden thing.
- **Fix:** The comment now describes the prohibition without naming the token, on
  `FeasibilityBar`'s rule and 05-11's application of it to a rejection. The criterion now returns
  0 honestly. This is the same class of defect `<inherited_couplings>` item 4 warned about, in a
  comment rather than in an attribute.
- **Files modified:** `src/ui/components/FinishedNotice.css`
- **Commit:** `ab2891f`

**4. [Rule 3 - Blocking] Two existing test call sites needed the new required prop**

- **Found during:** Task 3, first `npm run typecheck`
- **Issue:** `onRequestReopen` is required on `TournamentScreenProps`, so
  `tests/ui/cut-control.test.tsx` and `tests/ui/tournament-screen.test.tsx` stopped compiling.
- **Fix:** Both render harnesses pass a no-op. Making the prop optional was rejected: a screen
  that silently cannot reopen is the failure D-17 exists to prevent.
- **Files modified:** `tests/ui/cut-control.test.tsx`, `tests/ui/tournament-screen.test.tsx`
- **Commit:** `ab2891f`

### Noted, not fixed

- **`readFileSync` with `new URL(..., import.meta.url)` silently fails under happy-dom** — the
  global `URL` is the DOM's, not Node's. `tests/ui/staleness-banner.test.tsx` already documents
  this trap; the new test uses `resolve(process.cwd(), …)` and carries the note.
- **The plan's `<verification>` block asserts `git diff --stat src/core/ src/adapters/` is
  empty.** It is: this plan touched neither. It also asserts `package.json` is unchanged, which
  holds — no dependency was added.

## Requirements Completed

- **TOUR-03** — the bracket renders with correct byes at 5, 6 and 7 seeds, labels its rounds by
  matches-in-round, and advances winners with nothing stored.
- **TOUR-04** — bracket results record through the same `MatchRecordDialog` the crosstable uses;
  best-of-three shows as games text on the card.
- **TOUR-06** — the champion is named on the final's card, the tournament goes read-only and says
  so, and the host can reopen it.

## Verification

`npm run verify` exits 0 — `check:pure`, `check:nohtml` (0 violations in 88 files), **79 test
files / 2644 tests passing**, and a clean production build (194.79 kB JS, 45.71 kB CSS; the
service worker manifest precached 322 URLs).

Task 3's acceptance criteria, re-run after the final edit:

| Criterion | Result |
|-----------|--------|
| `grep -c "This tournament is finished. Results are read-only." FinishedNotice.tsx` | 1 ✓ |
| `grep -c "Reopen this tournament" FinishedNotice.tsx` | 1 ✓ (≥1) |
| `grep -c "Reopen this tournament?" FinishedNotice.tsx` | 0 ✓ |
| `grep -c "color-danger" FinishedNotice.css` | 0 ✓ |
| `grep -c "selectTournamentLocked" ResultsGrid.tsx` | 2 ✓ (≥1) |
| `grep -cE 'aria-disabled="false"…'` on both files | 0, 0 ✓ |
| `grep -cE "#[0-9a-fA-F]{3,6}" FinishedNotice.css` | 0 ✓ |

Inherited-coupling checks: `<ResultsGrid` appears **twice** in `TournamentScreen.tsx` (the dual
mount is preserved), the native `disabled=` attribute appears **zero** times in `ResultsGrid.tsx`
and `FinishedNotice.tsx` under the boundary-safe `(^|[^-])disabled=` pattern, and
`BRACKET_HEADING_ID` still appears 3 times in `BracketGrid.tsx`.

`tests/ui/finished-reopen.test.tsx` — 19 cases, one per `<behavior>` bullet. The load-bearing
ones: control counts identical on both sides of the final being recorded (nothing hidden),
`getAttribute('aria-disabled') === null` asserted across **every** cell and card after the reopen
rather than sampled, locked restored by re-folding a log with the reopen entry dropped, and
`document.activeElement` on the crosstable's first live cell after the confirm.

## Known Stubs

None. Every surface this plan renders is wired to a selector, and no placeholder or hardcoded
empty value was introduced.

## Threat Flags

None. No new network endpoint, auth path, file access pattern or schema change. The plan's own
register is satisfied: round labels come from the selector (T-05-70), connectors are CSS with no
injected markup and `check:nohtml` passes (T-05-71), locked controls are inert with an early
return in the handler behind `canApply`'s backstop (T-05-72), the shed is asserted exhaustively
(T-05-73), nothing about the bracket is stored (T-05-74), and no losers-bracket artefact —
`bracketSide`, `losersRound`, `dropDown`, a multi-root structure or a third-place card — was
introduced (T-05-75). No package was installed (T-05-SC).

## Self-Check: PASSED

All created files present on disk and all three task commits present in `git log`.
