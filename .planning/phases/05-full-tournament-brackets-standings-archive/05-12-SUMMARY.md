---
phase: 05-full-tournament-brackets-standings-archive
plan: 12
subsystem: ui
tags: [library, persistence, dialog, filing, eviction, landing-screen]
requires:
  - listLibrary, oldestEntry, fileTournament, openLibraryEntry, LIBRARY_CAP (05-09)
  - FILING_CONFIRM, EVICTION_CONFIRM, ABANDON_CONFIRM's changed body (05-09)
  - tournamentFilename, downloadJson (Phase 1, unchanged)
  - selectBracket, selectTournamentStage (05-03 / 05-06)
provides:
  - TournamentLibrary — the `Your tournaments` list, its row descriptions and two row actions
  - libraryDate() — the one absolute date format the list and the eviction confirm share
  - DOWNLOAD_JSON — the row action label, reused by two dialogs
  - the filing confirm, the eviction confirm and the refused-write report in app.tsx
  - library-first write ordering at the one place both writes happen
affects:
  - src/app.tsx (Confirm union gains three variants, one new write path, three dialogs)
  - src/ui/screens/LandingScreen.tsx (one new optional prop, one mounted section)
tech-stack:
  added: []
  patterns:
    - a three-button dialog builds on `Dialog`, never on `ConfirmDialog`
    - the vacate-live-slot teardown is extracted, so filing cannot reimplement it
    - a contract string lives in exactly one file, comments describe branches rather than quoting them
key-files:
  created:
    - src/ui/components/TournamentLibrary.tsx
    - src/ui/components/TournamentLibrary.css
    - tests/ui/tournament-library.test.tsx
  modified:
    - src/ui/screens/LandingScreen.tsx
    - src/app.tsx
decisions:
  - the library reads `listLibrary()` during render rather than taking a threaded prop
  - rows re-sort by `createdAt`; `listLibrary` orders by `filedAt` and the two legitimately disagree
  - `liveDocument` re-reads storage like `handleResume`, and deliberately never reads the store
  - the refused-write copy lives in `app.tsx`, because `confirm-copy.ts` holds confirmations
  - no roving tabindex — twelve rows is not a large uniform interactive set
metrics:
  duration: ~35 minutes
  completed: 2026-08-31
---

# Phase 5 Plan 12: The Tournament Library Summary

A night stops dead-ending: finished tournaments are listed on the landing screen, each one
openable and downloadable, and every gesture that files one says where it went and offers
the file before it touches anything.

## What Was Built

**`Your tournaments`, and nothing at all when there are none.** The section renders
`listLibrary()` with one row per entry — the document's `formatLabel` at `--text-heading`,
`{date} — {m} players, {status}` at `--text-body`, and two actions. At zero entries the
component returns `null` and owns that rule itself, so the landing screen has no
conditional to keep in step with it. A first visit still shows two buttons and a subtitle.

**Three status strings, three selector calls.** The champion when `championId` is non-null
— which is that field's whole contract, so the branch needs no second question about
whether the tournament finished. `draft complete, no bracket` when `selectTournamentStage`
answers `'notRunning'` on a **complete** tournament, the completeness gate being what keeps
an unfinished draft out of a branch it would otherwise match. The in-progress form
otherwise, with the pick count from a fold.

**`New tournament` stopped being destructive.** It raises `FILING_CONFIRM` — `default`
toned, informing rather than warning — files the document, and only then empties the live
slot. `Open tournament` raises the *same* dialog, per §12's "one filing path, not two".
With nothing live neither raises anything at all.

**The ordering rule, at its only caller.** `fileTournament` runs first; the live slot is
touched only on a `filed` or `evicted` outcome. A `quotaFailed` stops the gesture dead —
the live record is byte-identical, no tournament is created, no entry is opened — and the
host gets a report with the download as its primary button. It never raises the
storage-blocked signal, which means "this browser will not save your draft" and fires the
one banner in the app a host must read.

**The eviction asks first.** `oldestEntry()` is consulted **before** any write, so the
dialog names the night about to go, dates it, and offers its file while it still exists.
Declining leaves twelve entries in place.

## Key Implementation Details

- **The three dialogs build on `Dialog`, not `ConfirmDialog`.** Each needs a third button
  for the download, and `ConfirmDialog` renders exactly two. `MatchRecordDialog` set that
  precedent in 05-10 for the same structural reason. **Both of `ConfirmDialog`'s safety
  rules are preserved verbatim**: the confirming button is first in DOM order, the safe
  button is last, and `dismissible` maps Escape to the safe outcome. The download sits
  between them, where it is neither — asserted by test on DOM order.
- **`vacateLiveSlot` was extracted from `confirmAbandon`.** D-15 gives the live slot a
  second way to empty and the two differ only in what happened just before. The cross-tab
  ordering argument in that function's header — teardown, then `clearSaved`, then
  `notifyAbandoned` — is not something a second call site should be trusted to reproduce.
- **`libraryDate` is `YYYY-MM-DD` rather than a locale format,** and that is load-bearing
  twice: `tournamentFilename` dates a download the same way, so a host pairing a row
  against a file on disk compares two strings that already match; and a locale format would
  make a contract string depend on the host's ICU data.
- **Contract strings appear exactly once per file.** Three doc comments were rewritten to
  describe their branches rather than quote what they return, because the acceptance gates
  are plain text searches — the rule `app.css` already states about the one CSS declaration
  this project bans.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `liveDocument` read the store, and filed a document the screen was not showing**

- **Found during:** Task 2, when five previously-passing cases in
  `tests/ui/confirm-dialogs.test.tsx` began failing.
- **Issue:** The first implementation was `getDoc() ?? saved`. `getDoc()` is module-level
  store state that outlives a render, so a `New tournament` press could file whatever
  document a *previous* tournament had left in the store — a document the landing screen
  was not showing and the host had not been asked about. The failing tests were the symptom
  (that file's `afterEach` does not clear the store), but the defect was in production code:
  on the landing screen nothing has been adopted, and reaching into the store for a document
  this screen is not displaying is exactly the wrong source.
- **Fix:** `loadSavedTournament() ?? saved` — the same expression `handleResume` uses, and
  now for a stated reason rather than a coincidence. Both gestures that reach it live on the
  landing screen beside `Resume saved draft`, so filing must act on the document that button
  would have resumed or the host files one tournament and is offered a different one a moment
  later. The re-read also picks up `handleResume`'s two-tab staleness argument in full:
  filing the boot snapshot would write a document several picks behind storage and *then*
  empty the slot holding the better copy.
- **Files modified:** `src/app.tsx`
- **Commit:** 156e9c8

No test file outside this plan's `files_modified` was edited — the fix was in production
code and the five cases went green on their own.

**2. [Rule 2 - Missing functionality] A refused library write had no surface**

- **Found during:** Task 2.
- **Issue:** The plan requires that a failed filing "tells the host" and offers the download,
  and forbids routing it through the storage-blocked banner. No copy set existed for it:
  `FILING_CONFIRM` and `EVICTION_CONFIRM` are confirmations, and this asks nothing.
- **Fix:** `FILING_FAILED_HEADING` and `filingFailedBody` as module constants in `app.tsx`,
  beside the two import-error sentences and following the same house form — the problem,
  then the next action. Deliberately **not** added to `confirm-copy.ts`, whose header scopes
  it to "every confirmation's words"; this is a report with two ways of leaving. `Keep this
  one open` is reused from the filing set rather than given a label of its own, because the
  outcome is identical to having declined.
- **Files modified:** `src/app.tsx`
- **Commit:** 156e9c8

**3. [Rule 3 - Blocking] The test fixture inverted `filedAt`, not the code**

- **Found during:** Task 2, on three failing cap tests.
- **Issue:** `seedFullLibrary` wrote `filedAt: 1000 - index`, which makes `Night 11` the
  oldest, while the assertions named `Night 0`. `listLibrary` sorts descending by `filedAt`
  and `oldestEntry` returns the last, so the adapter was right and the fixture was wrong.
- **Fix:** `filedAt: 1_000 + index`, and the helper's doc comment now states which entry is
  the oldest rather than leaving it to be re-derived.
- **Files modified:** `tests/ui/tournament-library.test.tsx`
- **Commit:** 156e9c8

### Contract Readings Worth Recording

- **The filing confirm says `Start a new tournament` even when the host pressed
  `Open tournament`.** This reads oddly for a moment and it is what §12 asks for in as many
  words — "one filing path, not two". The question being answered is the filing one either
  way, and a second copy set for one act is how the two drift. Recorded here because it is
  the sort of thing a later reader will file as a bug.
- **`grep -c "fileTournament" src/app.tsx` returns 2, not 1** — the import and its single
  call site. The invariant holds exactly: there is one caller, which is what makes the
  library-then-live ordering decided in one place.
- **Opening a filed tournament leaves it in the library.** Filing it again later adds a
  second entry with the same document id; `openLibraryEntry` finds the newest, so nothing
  breaks. Deduplication would belong in `library.ts`, which this plan's `<verification>`
  requires to be unmodified. Noted rather than fixed.
- **The filing dialog's download uses `DOWNLOAD_JSON`, exported from `TournamentLibrary`,**
  on `ResultsGrid.metricLabel`'s precedent. `FILING_CONFIRM` has no `downloadLabel` — only
  `EVICTION_CONFIRM` does — and inventing a second label for the same act is how the row
  action and the dialog end up naming one thing two ways.

## Requirements Covered

| ID | How |
|----|-----|
| PERS-08 | A completed tournament is listed on the landing screen, re-opens as the whole document through `openLibraryEntry`, and is downloadable from its row under the same filename the live document uses |

## Known Stubs

None. Every row renders from a real fold of a real stored document, and all three write
paths reach storage.

## Threat Flags

None. No network path, no new storage key, no schema change. The one new write path goes
through `fileTournament`, which this plan does not modify; every string reaches the DOM as
a Preact text child; and the library section and both row actions render inside the
existing `inert` shell gate while the dialogs sit outside it, as the shipped dialogs do.

## Verification

- `npm run verify` exits 0 — `check:pure` (0 violations in 20 files), `check:nohtml` (0
  violations in 83 files), **2546 tests across 74 files**, and a production build with a
  322-URL precache manifest.
- `git diff --stat package.json` is empty — no dependency added.
- `git diff --stat src/core/ src/adapters/` is empty — the adapter landed in 05-09 and this
  plan is its caller, not its editor. `src/adapters/persistence.ts` likewise untouched, so
  the 05-09 ruling still holds.
- Task 1 greps all pass: `Your tournaments` ×1, `draft complete, no bracket` ×1,
  `Open tournament` ×1, `downloadJson` ×3, `ago|relative` ×0, `useRovingTabindex` ×0,
  `log.length` ×0, hex in the stylesheet ×0.
- Task 2 greps all pass: `fileTournament` ×2, `oldestEntry` ×5, `ABANDON_CONFIRM` ×8,
  added lines raising the storage-blocked signal ×0, and the literal filing heading ×0 in
  both `src/app.tsx` and `src/ui/screens/LandingScreen.tsx` — it is consumed by reference.
- The 05-10 `tests/build/sw-manifest.test.ts` flake did not recur.

## Worktree Provenance

`BASE_ON_ARRIVAL=93f20ad7de20976de91742d02463214f31974db1` — `docs(03): create phase plan`,
a **Phase 3 planning commit**. The worktree arrived stale for the second time on this plan,
and `git merge-base` returned HEAD itself, meaning HEAD was an *ancestor* of the dispatch
base rather than a descendant. **The reset was needed** and was performed
(`git reset --hard 5d4a883`). All four content greps then passed: `src/adapters/library.ts`
present, `TournamentScreen` present, `StandingsTable.tsx` present, `TOURNAMENT_MATCH_RECORDED`
present. No `node_modules` symlink or junction was created; `npx vitest` and `npm run verify`
both resolved dependencies through the parent checkout unaided.

## Self-Check: PASSED

All three created files exist on disk:

- `src/ui/components/TournamentLibrary.tsx` — FOUND
- `src/ui/components/TournamentLibrary.css` — FOUND
- `tests/ui/tournament-library.test.tsx` — FOUND

Both commits are in the log: `b60f9a8`, `156e9c8`.
