---
phase: 05-full-tournament-brackets-standings-archive
plan: 03
subsystem: core-tournament
tags: [round-robin, standings, tiebreak, partition-refinement, seeding, pure-core]
requires:
  - src/core/model.ts
  - src/core/selectors.ts
provides:
  - TournamentStage
  - RoundRobinMatch
  - StandingsRow
  - selectTournamentStage
  - selectRoundRobinMatches
  - selectRemainingMatchCount
  - selectStandings
  - selectSeeding
affects:
  - src/app.tsx
  - src/ui/screens/TournamentScreen.tsx
tech-stack:
  added: []
  patterns:
    - "Partition refinement instead of a comparator, so a non-transitive link cannot make the order engine-defined"
    - "Set-equality matching as a self-invalidation mechanism — no void action needed to retire a stale override"
    - "Index-based synthetic match ids (`rr:{i}:{j}`) so a player id containing `:` cannot collide two matches onto one key"
key-files:
  created:
    - src/core/tournament.ts
    - tests/core/tournament.test.ts
  modified: []
decisions: [D-02, D-03, D-13]
requirements: [TOUR-02, TOUR-08]
metrics:
  duration: ~20 min (this session; plan spans two sessions)
  completed: 2026-08-27
  tasks: 3
  commits: 6
  tests: 2136 passing
---

# Phase 5 Plan 03: The round robin and the standings chain

Adds `src/core/tournament.ts` — a pure module holding the tournament stage fold, the complete
derived round-robin pair set, the remaining-match count that gates the cut, and TOUR-08's
four-link tiebreak chain computed by partition refinement rather than by a comparator.

## What Was Built

**The stage fold.** `selectTournamentStage` returns `'notRunning' | 'roundRobin' | 'bracket'`,
gating on the existing `selectIsTournamentComplete` rather than re-deriving it. `draftOnly`
never reaches a tournament stage whatever else the fold holds, and a complete pick set with a
swap round still outstanding is still `'notRunning'`. `app.tsx` and `TournamentScreen` branch
on this; no component works it out.

**Every pairing, stored nowhere.** `selectRoundRobinMatches` derives the complete pair set from
the player list — `C(n,2)`, verified at 6/10/15/21/28 for 4–8 players. D-03 deletes the hard
part of a round robin: there is no circle-method schedule, no round structure, and no sit-out
round at odd counts, so there is nothing that can drift out of sync with reality. This
supersedes the ROADMAP's circle-method brief (RESEARCH Correction 2). Match ids are
`rr:{i}:{j}` from **indices**, never from player ids — `import-guard.buildPlayers` bounds a
player id only as a non-empty unique string, so ids containing `:` would let `a:b`/`c` and
`a`/`b:c` both produce `rr:a:b:c`: two matches on one key, silently, in the fold.

**The chain, as a refinement.** `selectStandings` partitions by wins, then (tier 3 only) by
metric, then resolves a block that has narrowed to exactly two by head-to-head, then falls to
the host's override. There is no `.sort()` call in the file and there must never be one: head-
to-head is non-transitive on a cycle, and ECMAScript leaves `Array.prototype.sort`'s output
implementation-defined for an inconsistent comparator — the standings would be *arbitrary*
rather than merely wrong, and arbitrary in a different direction in a different browser.

**Two rulings the plan made, now executable.** A still-tied block shares one position number
(`3 3 3`, never `3 4 5`), because `3 4 5` asserts the order the tool explicitly refused to
compute. And the automatic chain stops at a block of exactly two — including one that reached
two via the metric link — with three or more going straight to the override.

**The override that retires itself.** Link 4 matches a `tiebreakOrders` entry to a block by
**set equality**, highest `seq` winning. A subset and a superset are both rejected, which is
the entire safety property: when a corrected result changes a block from `{A,B,C}` to `{A,B}`,
the host's ordering for `{A,B,C}` stops matching anything and the block is unresolved again —
with **no void action anywhere**. This is why `tournament/resultsVoided` deliberately does not
list `tournament/tiebreakOrdered` among its cascade targets; voiding it explicitly would be a
second mechanism for one fact, and two mechanisms for one fact disagree eventually. D-13's
choice to name players rather than assign seed numbers *is* the invalidation mechanism: a
number carries no record of which players it was chosen for and could not self-invalidate.

## Key Decisions

**A computation-local `Set` is permitted; a stored one is not.** Set equality needs a `Set` to
be anything other than quadratic. `CLAUDE.md` §Serializability forbids one reaching the
document, and says nothing about one living for the length of a membership test. It never
leaves `isSameSet`, and the acceptance grep for `return new Set` / `: Set<` returns 0.

**Highest `seq`, not last-in-array.** `tiebreakOrders` is append-ordered by the fold, but `seq`
is the log's own ordering and is the one that means "more recent". Pinned by a test that puts
the higher-`seq` entry *first* in the array, so a last-wins implementation fails it.

**Link 4 also catches a two-player block with no head-to-head result.** Reachable after a D-10
void. Both that and a block of three or more are "still tied after the automatic chain", which
is the only condition the override cares about.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected a wrong expectation in my own new self-invalidation test**
- **Found during:** Task 3, GREEN
- **Issue:** The test asserted the post-correction order `['p2','p3','p4','p1']`. The fixture's
  correction is *p1 beat p4*, so head-to-head resolves the 1-win block p1-then-p4, making the
  correct order `['p2','p3','p1','p4']`. The implementation was right and the assertion wrong.
- **Fix:** Corrected the expectation and commented why p1 leads that block.
- **Files modified:** tests/core/tournament.test.ts
- **Commit:** 4a6327f (test), verified green at 0fe1adb

Otherwise the plan executed as written.

## Recovery Note

A provider quota limit killed the previous executor mid-plan. Its four commits (Tasks 1 and 2,
RED and GREEN each) were recovered by fast-forward from `worktree-agent-ad9e8f772eab69222` and
were **not** redone. This worktree had also forked from a stale Phase 3 base (`93f20ad`); the
`<worktree_branch_check>` assertion caught it and reset to the correct base before any read.

## TDD Gate Compliance

Both gates present for every task. Task 3: `4a6327f test(05-03)` (RED — 4 new failures
observed before implementation), then `0fe1adb feat(05-03)` (GREEN — 39/39). No REFACTOR
commit; none was needed.

## What Comes Next

05-06 extends this module with the bracket. 05-10 renders the round-robin grid and consumes
`selectRoundRobinMatches` plus `selectRemainingMatchCount` (whose two consumers — the
`{k} of {n} matches still to play.` line and the cut control's inert gate — must not diverge).
05-11 renders the standings table, the override control and the cut, and maps `decidedBy` 1:1
onto `05-UI-SPEC.md` §6's five-row note table.

## Verification

- `node scripts/check-pure-core.mjs src/core` — 0 violations in 20 files
- `node scripts/check-pure-core.mjs --nohtml src` — 0 violations in 75 files
- `tsc --noEmit` on both `tsconfig.json` and `tsconfig.node.json` — clean
- `vitest run` — 64 files, **2136 passing** (39 in `tests/core/tournament.test.ts`)
- `vite build` + `build-sw-manifest.mjs` — 322 URLs precached
- All eight contract symbols exported under their exact planned names

## Self-Check: PASSED

- FOUND: src/core/tournament.ts (600 lines, min_lines 200)
- FOUND: tests/core/tournament.test.ts
- FOUND: commit 4a6327f
- FOUND: commit 0fe1adb
- FOUND: recovered commits e2def7c, 72e845d, 1273292, c6d08a6
- No modifications to STATE.md, ROADMAP.md, or any other plan's files
