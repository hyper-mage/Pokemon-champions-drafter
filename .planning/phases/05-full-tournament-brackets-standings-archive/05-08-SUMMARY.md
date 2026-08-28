---
phase: 05-full-tournament-brackets-standings-archive
plan: 08
subsystem: core
tags: [append-only-log, reducer, undo, import-guard, tournament, corrections]

# Dependency graph
requires:
  - phase: 05-01
    provides: "schema 5 — DraftState.matchResults, cut, tiebreakOrders, lastReopenSeq, and the MatchResult shape"
  - phase: 05-03
    provides: "selectTournamentStage, selectRoundRobinMatches, selectRemainingMatchCount, selectStandings"
  - phase: 05-06
    provides: "selectBracket, selectTournamentLocked, selectCutSplitsTiedBlock, selectVoidCascade"
provides:
  - "Five `tournament/*` action types across all seven landing sites"
  - "MAX_MATCH_METRIC and MATCH_ID_PATTERN in import-guard.ts"
  - "Fifteen new RejectionReason members and their canApply arms"
  - "Match records, voids, cuts, tiebreak orders and reopens on the one undo stack"
  - "The causedBySeq pairing arm in removalIndices — a correction undoes in one press"
affects: [05-10, 05-11, 05-12, 05-13, 05-14]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-action correction (D-10 literal): matchRecorded then resultsVoided carrying causedBySeq"
    - "Index-based match ids, pinned by a module-private regex at the import boundary"
    - "Round-trip assertion at the rebuilt log entry, not only at the fold"

key-files:
  created: []
  modified:
    - src/core/actions.ts
    - src/core/import-guard.ts
    - src/core/reduce.ts
    - src/core/undo.ts
    - src/store.ts
    - tests/core/import-guard.test.ts
    - tests/core/reduce.test.ts
    - tests/core/undo.test.ts

key-decisions:
  - "D-10 followed literally as two actions; the single `matchRecorded { voids: [] }` shape was not substituted"
  - "matchRecorded's apply arm REPLACES on DRAFT_PICK_UNDONE's filter-and-rebuild model, never appends"
  - "Task 1's round trip asserts the rebuilt log entry, because a fold-only assertion is vacuous for any field the reducer does not yet read"
  - "canApply's cutSplitsTiedBlock arm carries the code only; the English lives in 05-11"
  - "namesTiedBlock answers false for an already-ordered block; changing one's mind is Undo, which is the one stack D-12 names"

patterns-established:
  - "Seven landing sites, enumerated in actions.ts's own header, with the two failure modes named: buildLogEntry fails silently, undoAnnouncement fails at compile time"
  - "copySeqArray beside copyStringArray — a number-array rebuild bounded by MAX_LOG_ENTRIES"
  - "causingRecordIndex pairs by seq exactly, contrasted in-comment against triggeringCardIndex's heuristic search"

requirements-completed: [TOUR-05, TOUR-06, TOUR-09]

# Metrics
duration: 24min
completed: 2026-08-27
---

# Phase 5 Plan 08: The Tournament Write Path Summary

**The log learns to carry a tournament: five `tournament/*` types across all seven landing sites, a fold that says out loud that later beats earlier, a correction that names what it voids and comes back in one undo press, and a round-trip assertion per type so no field this phase adds can vanish between an export and an import.**

## Performance

- **Duration:** ~24 min
- **Tasks:** 3 of 3
- **Files modified:** 8 (5 source, 3 test)
- **Tests:** 2416 passing across 68 files (up from 2366 at the base commit)

## Base Commit

**Arrived on `93f20ad`** — the stale Phase 3 base, the tenth consecutive occurrence in this
repository. Reset to `735d7eb` per the startup assertion, and waves 1–3 confirmed present
afterwards: `SCHEMA_VERSION = 5` in `model.ts`, and `selectVoidCascade`,
`selectTournamentLocked` and `selectCutSplitsTiedBlock` in `tournament.ts`.

## The Seven Landing Sites, Verified Rather Than Assumed

Enumerated from `actions.ts` before starting, then checked type by type:

| Site | Where | matchRecorded | resultsVoided | cutTaken | tiebreakOrdered | reopened |
|------|-------|:---:|:---:|:---:|:---:|:---:|
| 1. Exported constant | `actions.ts` | ✓ | ✓ | ✓ | ✓ | ✓ |
| 2. Payload interface | `actions.ts` | ✓ | ✓ | ✓ | ✓ | ✓ |
| 3. `Intent` member + `…Action` alias | `actions.ts` | ✓ | ✓ | ✓ | ✓ | ✓ |
| 4. Creator | `actions.ts` | ✓ | ✓ | ✓ | ✓ | ✓ |
| 5. Structural guard | `actions.ts` | ✓ | ✓ | ✓ | ✓ | ✓ |
| 6. `buildLogEntry` arm | `import-guard.ts` | ✓ | ✓ | ✓ | ✓ | ✓ |
| 7. `apply` + `canApply` arms | `reduce.ts` | ✓ | ✓ | ✓ | ✓ | ✓ |

Plus the undo sites Task 3 owns: `isUndoable`'s allow-list, `UndoRemoval.kind`,
`undoRemoval`'s arms, and `undoAnnouncement`'s — five each.

The header at `actions.ts:1` now states the count as seven and names which two sites fail
how: a missing `buildLogEntry` arm drops a field silently on round trip, and a missing
`undoAnnouncement` arm is a compile error via `UndoRemoval.kind`'s `const exhaustive: never`.
Only one of the two tells you.

## Accomplishments

- **D-10 implemented literally.** Two actions — `tournament/matchRecorded` plus a separate
  `tournament/resultsVoided` carrying `causedBySeq` — paired by a `removalIndices` arm beside
  the shipped `order/resolved` + `cards/played` one. The single-`voids[]` shape RESEARCH
  considered and rejected was not substituted, and `ResultsVoidedPayload`'s doc block records
  why in the plan's own words.
- **The replace arm carries D-09 in as many words,** in `SWAP_MADE`'s register: *THIS ARM
  REPLACES A RESULT. IT DOES NOT APPEND ONE.* — built on `DRAFT_PICK_UNDONE`'s filter-and-rebuild,
  explicitly not on `DRAFT_PICK_MADE`. The superseded entry stays in `doc.log` for 05-14's recap;
  the fold deliberately does not keep it.
- **Match ids are index-based and pinned.** `MATCH_ID_PATTERN = /^(rr:\d+:\d+|br:\d+:\d+)$/`
  is checked inside `buildLogEntry`, and an unparseable id **fails the arm** rather than
  folding onto a match nothing addresses. Seven rejection cases are tested, including all four
  the plan named.
- **Wave 3's selectors are consumed under their frozen names.** `canApply` calls
  `selectTournamentStage`, `selectTournamentLocked`, `selectCutSplitsTiedBlock`,
  `selectRemainingMatchCount`, `selectRoundRobinMatches`, `selectBracket` and
  `selectStandings`. Nothing was renamed and nothing was reimplemented — `git diff --stat
  src/core/tournament.ts` against the base is empty.
- **One undo stack, not two.** All five guards land in `isUndoable`'s allow-list in the same
  change that declared the types, with a comment stating that `UndoRemoval.kind`'s
  exhaustiveness catches the *announcement* omission at compile time and cannot catch this one.

## Task Commits

1. **Task 1: The vocabulary, and the round trip that proves no field was dropped**
   - `f427662` (test — RED)
   - `b86cdf0` (feat — GREEN)
2. **Task 2: The reducer arm that replaces, the arm that clears, and fifteen reasons to refuse**
   - `27c81e6` (test — RED)
   - `a1b3402` (feat — GREEN)
3. **Task 3: One undo stack, and a correction that comes back in one step**
   - `5e148e1` (test — RED)
   - `2f48eac` (feat — GREEN)

No REFACTOR commits: none of the three arms needed cleaning after going green.

## Files Modified

- `src/core/actions.ts` — five constants, five payload interfaces, five creators, five
  structural guards, the widened `Intent` union and `…Action` alias block, and a header that
  now enumerates all seven landing sites.
- `src/core/import-guard.ts` — `MAX_MATCH_METRIC = 18`, the module-private
  `MATCH_ID_PATTERN`, a `copySeqArray` helper beside `copyStringArray`, and five
  `buildLogEntry` arms rebuilt field by field with the envelope spread last.
- `src/core/reduce.ts` — fifteen `RejectionReason` members, five `apply` arms, five
  `canApply` arms, and six tournament helpers (`liveResult`, `bracketSlot`, `isSameSet`,
  `namesTiedBlock`, `formatFor`, `participantsOf`, `isUnchangedResult`).
- `src/core/undo.ts` — five guards on `isUndoable`'s allow-list, `causingRecordIndex`, the
  `removalIndices` pairing arm, five `UndoRemoval.kind` members and five `undoRemoval` arms.
- `src/store.ts` — five `undoAnnouncement` arms. `dispatch` and `nextSeq` untouched, pinned
  by the plan's own `git diff` criterion (returns 0).
- `tests/core/import-guard.test.ts` — +348 lines: round trip per type, seven match-id
  rejections, the metric and games bounds, creator array-copy cases, guard cases.
- `tests/core/reduce.test.ts` — +538 lines: the replace-not-append fold, the
  tiebreak-survives-a-void assertion, the `gamesNotForFormat` pair reading a different config
  field per prefix, and every rejection reason.
- `tests/core/undo.test.ts` — +158 lines: `isUndoable` per type, kind and round per type, the
  paired undo, a tolerated missing target, and pairing by `seq` rather than by adjacency.

## Decisions Made

1. **`namesTiedBlock` answers `false` for a block the host has already ordered.** The
   consequence is that a second `tiebreakOrdered` for the same set is refused. This is
   consistent with `05-UI-SPEC.md` §7, which renders the override only for a still-tied block,
   so no control can originate one; changing one's mind is `Undo last move`, which D-12 makes
   the single stack for exactly this. Written into the function's doc block so it reads as a
   decision rather than an oversight.
2. **`loserGames` is validated as `0 <= loserGames < winnerGames`** rather than as two
   per-format tables. One comparison yields `0` at bo1 and `0 or 1` at bo3, and two tables
   would be two things that can drift apart.
3. **`UndoRemoval.playerId` is the WINNER for a `'match'` removal** and `''` for the other
   four. A match record is the one tournament action about a single identifiable player, so
   the announcement can name them truthfully; the other four are host acts about the whole
   tournament, and naming a player would imply the undo did something to them in particular.
   `''` follows the shipped `'banReveal'` precedent.
4. **`canApply` does not range-check `metric` against `MAX_MATCH_METRIC`.** The plan's
   fifteen reasons contain none for it, and T-05-38 places that bound at the dialog's
   `NumericField` and at `import-guard.ts` — the gate's bound and the guard's bound being one
   number. Adding a sixteenth reason would have been inventing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Task 1's round-trip assertions were vacuous without Task 2's `apply` arms**

- **Found during:** Task 1 (the vocabulary and the round trip)
- **Issue:** The plan puts the per-type round-trip assertions in Task 1 (`actions.ts`,
  `import-guard.ts`, `tests/core/import-guard.test.ts`) and the `apply` arms in Task 2
  (`reduce.ts`). `fold(parse(exported(doc)).doc)` deep-equals `fold(doc)` is only *sensitive*
  once `apply` reads the payload — before that, both sides fold to the same nothing and the
  assertion passes however badly `buildLogEntry` is written. Asserting on the fold's contents
  instead left four tests red at the end of Task 1, which contradicts its own acceptance
  criterion that `vitest run tests/core/import-guard.test.ts` exits 0.
- **Fix:** Task 1 asserts on the **rebuilt log entry** — a full `toEqual` over every payload
  field plus the envelope, via a `reimportedTail` helper that also performs the fold
  comparison the plan requires. That is sensitive to a dropped field with no reducer involved,
  which is exactly what `buildLogEntry` is responsible for, and it is what catches
  `causedBySeq` — a field that reaches no fold at all and therefore no fold-based test could
  ever cover. What each field does to the fold is asserted in `tests/core/reduce.test.ts`, on
  the split `tests/core/tournament.test.ts`'s own header already describes.
- **Files modified:** `tests/core/import-guard.test.ts`
- **Verification:** Every round-trip test fails if its arm is removed from `buildLogEntry`;
  all 281 tests in the file pass with the arms present.
- **Committed in:** `b86cdf0`

---

**Total deviations:** 1 auto-fixed (1 × Rule 3).
**Impact on plan:** None on scope. The change makes Task 1's stated purpose — proving no
field was dropped — actually true at Task 1, rather than becoming true one commit later.

## Issues Encountered

- **The Bash tool refused compound heredocs and multi-command chains** inside the worktree
  (its containment verifier could not prove the command stayed inside). File edits went
  through the `Edit`/`Write` tools instead; every git command was run as a single plain
  invocation. No effect on output.
- **Stale worktree base, as warned.** Handled by the startup assertion; recorded above.

## User Setup Required

None.

## Verification

All plan-level verification criteria pass:

| Criterion | Result |
|-----------|--------|
| `npm run verify` (check:pure, check:nohtml, test, build) | ✓ — 0 purity violations, 0 innerHTML, 2416 tests, build + sw manifest clean |
| `git diff --stat package.json` empty | ✓ |
| `git diff --stat src/ui/ src/adapters/` empty | ✓ |
| `git diff --stat src/core/tournament.ts` empty | ✓ |
| `vitest run tests/core/` | ✓ |

Task acceptance greps: constants 5, creators 5, guards 5, `MAX_MATCH_METRIC` 1,
`MATCH_ID_PATTERN` 3, `TOURNAMENT_` in `actions.ts` 25, rejection reasons 40 matches,
`IT DOES NOT APPEND` 2, `selectTournamentLocked` 9, `selectCutSplitsTiedBlock` 3,
`action.seq` 10, undo guards 17, `causedBySeq` 6, `UndoRemoval` kinds 10,
`NEVER_UNDONE` diff 0, `dispatch`/`nextSeq` diff 0, `exhaustive: never` 1.

## Known Stubs

None. Every arm added here is reachable and asserted; nothing is a placeholder awaiting a
later plan.

## Next Phase Readiness

The write path 05-10, 05-11 and 05-13 dispatch through exists and is complete. The exact
names in the plan's `<interfaces>` block are what shipped, so those surfaces can be written
against it directly:

- `matchRecorded(matchId, winnerId, loserId, winnerGames, loserGames, metric)` — six
  positional arguments, each named into the returned object.
- `resultsVoided(targetSeqs, causedBySeq)` — dispatch it **after** `matchRecorded`, reading
  `causedBySeq` back off `getDoc()` (`app.tsx:514`'s "the play is in the log now" precedent).
  Both dispatches are synchronous in one handler.
- `cutTaken(seeds)`, `tiebreakOrdered(playerIds)`, `reopened()`.
- `MAX_MATCH_METRIC` is exported from `src/core/import-guard.ts` and is the number the match
  dialog's `NumericField` must read for its `max`.

Two notes for the surfaces:

1. **`canApply` is the backstop, not the mechanism.** Three arms say so in comments —
   `tournamentLocked`, `resultUnchanged` and `cutSplitsTiedBlock`. Each expects a control
   already rendered inert with the same stated reason. If one of them fires for a real host,
   the inert control is the bug.
2. **`cutSplitsTiedBlock` carries no English.** `05-UI-SPEC.md` §8 does not cover this case;
   05-11 must supply the copy — the plan's own line is *"The cut at {n} splits a tie. Order
   the tied players yourself before you take it."*

No blockers.

---
*Phase: 05-full-tournament-brackets-standings-archive*
*Completed: 2026-08-27*
