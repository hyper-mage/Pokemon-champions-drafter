---
phase: 05-full-tournament-brackets-standings-archive
plan: 06
subsystem: core
tags: [bracket, single-elimination, seeding, byes, corrections, void-cascade, tournament]

# Dependency graph
requires:
  - phase: 05-full-tournament-brackets-standings-archive (plan 05-03)
    provides: selectTournamentStage, selectRoundRobinMatches, selectRemainingMatchCount, selectStandings, selectSeeding, hostOrderFor's set-equality override
  - phase: 05-full-tournament-brackets-standings-archive (plan 05-01)
    provides: schema 5 — DraftState.cut, matchResults, tiebreakOrders, lastReopenSeq
provides:
  - selectBracket — the whole single-elimination bracket derived from the cut and the results
  - byeCountForCut — the one place a cut's bye count is computed
  - selectTournamentLocked — D-17 read-only as a second fold, not a flag and not a stage
  - selectCutSplitsTiedBlock — Pitfall 4, the cut refused upstream of the click
  - selectVoidCascade — what a correction voids, knowable BEFORE the dispatch
  - Bracket, BracketMatch, VoidCascade interfaces
affects: [05-08 (actions and canApply), 05-10 (result recording UI), 05-11 (standings and cut UI), 05-13 (bracket screen)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Seed-order doubling recursion as the bye rule — no bye-assignment code exists"
    - "Locked as a second fold over the same document rather than a stage member or a flag"
    - "Cascade as a selector so the confirm button can state its own damage before it happens"

key-files:
  created: []
  modified:
    - src/core/tournament.ts
    - tests/core/tournament.test.ts

key-decisions:
  - "The cut's blocked-tie sentence is ruled here verbatim: `The cut at {n} splits a tie. Order the tied players yourself before you take it.` — 05-11 renders it, 05-08 refuses the action, and the rule lives in core"
  - "selectBracket returns null below two seeds as well as with no cut — one player is not a bracket and there is no final for Bracket.final to name"
  - "selectCutSplitsTiedBlock answers false while the round robin is incomplete; incompleteness is UI-SPEC section 8's separate reason and one control must not carry two"
  - "selectVoidCascade returns an empty cascade for a bye's match id — a bye is not played, so there is nothing to correct and nothing it could invalidate"
  - "A round-robin id naming a pairing this player list does not have returns an empty cascade, mirroring how selectRemainingMatchCount already declines to count one"
  - "The cascade collects every seq recorded for a match id, not only the live one, so voiding a correction cannot resurface the entry it replaced"

patterns-established:
  - "D-07 by construction: pad the seed list to the next power of two, treat a seed past N as a phantom, and byes land on the top B-N seeds with no branch. A hand-written placement loop would be a second authority on the same fact."
  - "Round labels come from matches-in-round, never the round index — at B=8 round 1 IS the quarter-final and at B=16 it is the round of 16."
  - "One selector supplies both the number the host reads and the seqs the action carries, so the confirm button cannot lie."

requirements-completed: [TOUR-03, TOUR-06, TOUR-09]

# Metrics
duration: 12min
completed: 2026-08-27
---

# Phase 05 Plan 06: The Bracket, the Lock and the Cascade Summary

**The bracket is now a fact about the cut and the recorded results — byes fall out of the seed recursion rather than out of placement code, a finished tournament is read-only because the log says so, and the tool can name exactly how many later results a correction will take with it before the host presses anything.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-08-27T13:26Z
- **Completed:** 2026-08-27T13:38Z
- **Tasks:** 3 of 3
- **Files modified:** 2 (`src/core/tournament.ts` +570, `tests/core/tournament.test.ts` +498)

## Worktree Base — occurrence #10

**Arrived on `93f20ad7de20976de91742d02463214f31974db1`** — the same stale Phase 3 commit every agent worktree in this repo has forked from so far. The startup assertion caught it and `git reset --hard` moved the worktree to the correct base `98847b4a85418b8f49e7cc806269ffcfb0b0e2e2` (`docs(phase-05): update tracking after wave 2`). Waves 1 and 2 were then confirmed present by grep — `SCHEMA_VERSION = 5` in `model.ts`, `selectTournamentStage` and `selectStandings` in `tournament.ts` — before a single line was written.

This is now ten out of ten. The worktree base assertion is not defensive ceremony in this repo; it is load-bearing on every dispatch.

## Accomplishments

- **The three player counts ROADMAP success criterion 1 names are asserted pairing by pairing**, not by count. 5 seeds: `br:1:1` = #1 vs bye, `br:1:2` = #4 vs #5, `br:1:3` = #2 vs bye, `br:1:4` = #3 vs bye. 6 seeds: `br:1:4` = #3 vs #6. 7 seeds: `br:1:3` = #2 vs #7. Every slot is an assertion, so a transposition cannot pass.
- **The `N − 1` real-match invariant holds at all ten counts** RESEARCH executed — 2, 3, 4, 5, 6, 7, 8, 9, 12, 16 → 1, 2, 3, 4, 5, 6, 7, 8, 11, 15 — with byes excluded.
- **D-07 has no code of its own.** `grep -c "assignBye" src/core/tournament.ts` returns 0. Padding to the next power of two and treating a seed past `N` as a phantom puts the byes on the top `B−N` seeds because `B+1−s > N` means `s ≤ B−N`. The derivation is in the doc block so nobody re-adds a placement loop as a "clarification".
- **`selectVoidCascade` is a selector**, so `05-UI-SPEC.md` §5 can relabel the primary button `Record and void {n} matches` while the host is still deciding whether to cause the damage.
- **All six frozen contract symbols exported under their exact planned names**, plus the three interfaces. Verified by grep, one occurrence each.
- **The ruled copy string landed verbatim** and is grep-confirmed byte-for-byte against the plan, because 05-11 asserts on it.

## Task Commits

1. **Task 1: The seed recursion, and the byes that fall out of it** — `c1e6b71` (test, RED) → `a05e259` (feat, GREEN)
2. **Task 2: Locked as a fold, and a cut that refuses to split a tie** — `9d76e37` (test, RED) → `0b6b644` (feat, GREEN)
3. **Task 3: What a correction voids, computed before it happens** — `38eedcf` (test, RED) → `385ee42` (feat, GREEN)

No REFACTOR commits: each implementation landed in the shape its doc block describes, and there was nothing to clean up that would not have been churn.

## TDD Gate Compliance

All three tasks ran RED → GREEN with the failing test committed first and verified failing before implementation:

| Task | RED result | GREEN result |
|------|-----------|--------------|
| 1 | 18 failed / 39 passed | 57 passed |
| 2 | 14 failed / 57 passed | 71 passed |
| 3 | 12 failed / 71 passed | 83 passed |

No test passed unexpectedly during a RED phase, so the fail-fast rule was never triggered.

## Files Created/Modified

- `src/core/tournament.ts` — extended (not created; 05-03 owns the first 600 lines). Adds `BracketMatch`, `Bracket`, `VoidCascade`, `selectBracket`, `byeCountForCut`, `selectTournamentLocked`, `selectCutSplitsTiedBlock`, `selectVoidCascade`, and the module-private `bracketSize`, `seedOrder`, `roundLabelFor`, `liveResultFor`, `winnerOf`, `seqsFor`, `locateBracketMatch`, `emptyCascade`, `BRACKET_MATCH_ID`.
- `tests/core/tournament.test.ts` — extended with 44 new cases: the three bye tables, the ten-count invariant, the round-label table, the no-collapse assertion, the locked fold's reopen/relock cycle, the tie-splitting cut with and without a host order, and the four cascade shapes.

## Decisions Made

Six, all recorded in the frontmatter above and each written into the code's doc blocks rather than only here. The two worth restating:

**The blocked-tie sentence is ruled, not invented downstream.** The plan flagged that `05-UI-SPEC.md` supplies no copy for a cut that splits an unresolved block. The sentence now lives in `selectCutSplitsTiedBlock`'s doc block, verbatim, alongside the note that it has two consumers — 05-11's inert control and 05-08's `canApply` — and that if the reducer arm ever fires for a real host, the two have disagreed and the inert control is the bug.

**`tournament/tiebreakOrdered` is deliberately not a cascade target.** 05-03 already resolves a stale override by set equality on the tied block, so the override self-invalidates when a correction changes the block's membership. Voiding it explicitly would be a second mechanism for one fact. The exclusion is documented in `selectVoidCascade`'s doc block, pointing at `hostOrderFor`, and asserted by a test using a fixture that carries a `tiebreakOrders` entry.

## Deviations from Plan

None that changed the plan's shape. Three small rulings were made where the plan's `<behavior>` list did not reach, each additive and each documented in code:

**1. [Rule 2 — Missing correctness guard] `selectBracket` returns `null` below two seeds**
- **Found during:** Task 1
- **Issue:** `Bracket.final` is a required `BracketMatch`, but a cut of 0 or 1 seeds produces no match for it to name. The plan specified `null` only for "no cut".
- **Fix:** `if (n < 2) return null`, documented as "one player is not a bracket... a phantom final would report a champion nobody played for".
- **Verification:** `byeCountForCut` carries the matching `n < 2 → 0` guard; the ten-count invariant test starts at 2.

**2. [Rule 2 — Missing correctness guard] `selectVoidCascade` returns an empty cascade for a bye**
- **Found during:** Task 3
- **Issue:** A bye's winner cannot change, so walking forward from one would report a cascade for a correction that cannot happen.
- **Fix:** Early return on `located.match.isBye`, with the reason in a comment. Consistent with `winnerOf`, which already ignores any recorded result on a bye's id.
- **Verification:** Test — `selectVoidCascade(cutState(5), 'br:1:1', 'p1').targetSeqs` is `[]`.

**3. [Rule 2 — Missing correctness guard] An unknown round-robin id returns an empty cascade**
- **Found during:** Task 3
- **Issue:** The plan requires "an unknown `matchId` returns an empty cascade rather than throwing", but a shape-valid `rr:9:9` naming a pairing this player list does not have would otherwise have voided the entire bracket under D-11.
- **Fix:** The rr branch checks membership in `selectRoundRobinMatches(state)` first — mirroring how `selectRemainingMatchCount` already declines to count a stray `rr:` id.
- **Verification:** Test — `selectVoidCascade(state, 'rr:9:9', 'p1').voidsCut` is `false` on a state that has a cut.

---

**Total deviations:** 3 auto-fixed (all Rule 2, missing correctness guards)
**Impact on plan:** None on scope. All three close holes the plan's behavior list did not reach and that would otherwise have been discovered by a downstream plan or by a room mid-tournament. No architectural change, no new dependency, no interface change.

## Issues Encountered

None material. One mechanical note: `bash` heredocs failed to parse the larger test blocks in this environment, so the appended chunks were staged through the scratchpad and concatenated. No effect on output.

## Verification

Full `npm run verify` equivalent, run with the main checkout's binaries per the no-`node_modules`-junction rule:

- `check:pure` — 0 violations in 20 files under `src/core`
- `check:nohtml` — 0 violations in 75 files under `src`
- `vitest run` — **2276 tests passed across 66 files**, 0 failed
- `tsc --noEmit` on both `tsconfig.json` and `tsconfig.node.json` — clean
- `vite build` — 152.51 kB JS / 48.02 kB gzipped
- `build-sw-manifest` — 322 URLs, 1012.4 kB precached, exit 0

Scope fence confirmed: `git diff --stat HEAD -- src/ui/ src/app.tsx src/adapters/ package.json` is empty. `STATE.md` and `ROADMAP.md` untouched — the orchestrator owns those.

Contract symbols, one occurrence each:

| Symbol | grep |
|--------|------|
| `selectBracket` | 1 |
| `selectTournamentLocked` | 1 |
| `selectVoidCascade` | 1 |
| `byeCountForCut` | 1 |
| `selectCutSplitsTiedBlock` | 1 |
| `Bracket` / `BracketMatch` / `VoidCascade` | exported interfaces |
| `assignBye` | **0** — D-07 has no code of its own |
| `'locked'` as a stage member | **0** — locked is a fold, not a stage |

## Known Stubs

None. Every function in this plan is fully wired to `state.cut` and `state.matchResults` and returns real derived data. Nothing returns a hardcoded empty value, and no placeholder copy was introduced.

## Threat Flags

None. No new network endpoint, auth path, file access or schema change — this plan is pure derivation over fields schema 5 already carries. The seven threats in the plan's register (T-05-25 through T-05-30 plus T-05-SC) are all `mitigate`/`accept` and each mitigation landed in the doc block of the function that owns it. `package.json` is unmodified; nothing was installed.

## Next Phase Readiness

Ready for the three plans that consume this by exact name:

- **05-08** — `canApply` can now implement `cutSplitsTiedBlock` and `tournamentLocked` arms against real predicates, and `tournament/resultsVoided` can carry the exact `targetSeqs` array `selectVoidCascade` returns.
- **05-10** — the result dialog can label its primary button from `matchCount` and `voidsCut` before dispatching.
- **05-11** — the standings screen can render `Take the cut` inert with the ruled sentence, and the cut preview line can read `byeCountForCut(n)`.
- **05-13** — the bracket screen can render `Bracket.rounds` directly; `roundLabel` is already the header string, and a `null` participant is already the `Winner of {roundLabel} {n}` case.

No blockers.

---
*Phase: 05-full-tournament-brackets-standings-archive*
*Completed: 2026-08-27*
