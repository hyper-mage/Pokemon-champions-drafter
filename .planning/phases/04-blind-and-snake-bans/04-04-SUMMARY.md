---
phase: 04-blind-and-snake-bans
plan: 04
subsystem: core-selectors
tags: [selectors, serpentine, secrecy, bans, d-12, amendment-1]
requires:
  - DraftState.banPlacements / banSubmissions / bansRevealed
  - TournamentConfig.bansPerPlayer
  - TournamentConfig.banMode
  - bannedEntries (src/core/bans.ts)
provides:
  - selectBanOrder
  - selectBanTurn
  - selectBanStageState
  - selectPublicBanIds
  - selectAllBanIds
  - selectSubmittedPlayerIds
  - selectBanCollisions
  - BanTurn / BanStageState / BanCollision
affects:
  - src/core/selectors.ts
  - src/core/reduce.ts
tech-stack:
  added: []
  patterns:
    - a free function over primitives beside the state-shaped selectors
    - a screen mode decided in exactly one place, with a union member the fold never returns
    - a secrecy control branched on mode and nullability, never on a count
    - a computation-local Map that never leaves the function
key-files:
  created: []
  modified:
    - src/core/selectors.ts
    - src/core/reduce.ts
    - tests/core/selectors.test.ts
decisions:
  - the private banTurn helper 04-03 left in reduce.ts is deleted and replaced with an import, so exactly one serpentine derivation exists
  - selectBanTurn returns index as well as playerId and pass, so the board renders its cursor without recounting banPlacements
  - selectBanStageState answers 'snake' rather than 'reveal' for a snake stage with no sequence to walk, because 'reveal' is the terminal answer and is where Start draft lives
  - selectPublicBanIds dedupes on every row, including hostBanlist, so the union promise is true of the array it returns rather than only of what bannedEntries later does with it
  - a snake reveal in an imported document ends the snake stage, because canApply refuses every further ban once one has landed
metrics:
  duration: ~25 min
  tasks: 2
  commits: 4
  files-changed: 3
  completed: 2026-08-21
---

# Phase 4 Plan 04: The Ban Stage's Rules, as Pure Functions Summary

Seven selectors put the serpentine, the ban clock, the screen mode, the public banlist and
the collision set in `src/core/`, and the codebase now holds exactly one serpentine
derivation rather than the two 04-03 had to leave behind.

## What Was Built

**`selectBanOrder(order, bansPerPlayer)`** — the serpentine D-12 asks for and the codebase
has never had. A free function over primitives, matching `selectStartingOrder` rather than
the state-shaped selectors, because it depends on nothing else in the fold. It guards the
empty order first and copies before every `reverse()`, which are the two habits its
neighbours carry and the second is the trap `selectSwapRoundOrder:575-578` records. Eight
cases pin it, including the input-not-mutated one.

**`selectBanTurn(state)`** — `{ playerId, pass, index }`, composing `selectBanOrder` rather
than re-deriving the sequence. Its doc block carries `selectCardTurn`'s argument forward: a
second copy of "who is on the clock" is a second thing that can disagree with the log, and
here the board's columns, the turn banner and `canApply`'s `notYourBanTurn` all read the one
answer. `pass` is documented as a **column, not a round**, with `04-UI-SPEC` §6's reason.

**`selectBanStageState(state)`** — the one place the ban surface is decided, in `selectPhase`'s
shape: enumerated values in the doc block, one sentence each, and the explicit statement that
`app.tsx` and `BanStageScreen` branch on it and no component works it out. Its longest passage
explains why `'blindEntry'` is in the union and never returned — entry is transient, left by
four exits none of which is fold-visible, and D-18 requires the in-progress selection to die
with the component. A second passage records why `selectPhase` was **not** shielded: Pitfall 4
is real, and the remedy is 04-05's fourth `Screen` member, so the draft screen's `selectPhase`
branch is never evaluated during the ban stage.

**`selectPublicBanIds(state)`** — `04-UI-SPEC` Amendment 1's four rows and nothing else. It
branches on `config.banMode` and on `bansRevealed === null`, never on a count, because a count
cannot tell "blind, nobody has submitted" from "blind, everybody has" and those two must
produce the same output for the control to be worth anything. Its doc block names
`TopBar.tsx:209-217` as the leak channel it closes.

**`selectAllBanIds(state)`** — the deduped union the post-reveal re-check takes as `bannedIds`.
Its doc block states that it is **not** a display source and repeats the Phase-4 trap at the
function a careless caller would take a length from: `revealed.flatMap((entry) => entry.monIds).length`
overreports by exactly the number of collisions.

**`selectSubmittedPlayerIds(state)`** and **`selectBanCollisions(state)`** — ids and no species
for the locked screen; one record per collided species with `playerIds` in the rotation's order
for the reveal. Collisions group through a computation-local `Map` that never leaves the
function, are compared on `monId` only, exclude host bans because collisions are between
players, and are `[]` in snake by construction (D-20).

**`src/core/reduce.ts`** — the private `banTurn` helper 04-03 left at `:212-227` is **deleted**
and `canApply(BANS_PLACED)` now imports `selectBanTurn`. A comment at the call site records the
handoff so the next reader knows why the derivation was ever in two places. `selectPhase` was
not modified: `git diff | grep -c "^-.*selectPhase"` is 0.

## Task Commits

| Task | Gate  | Commit    | What                                                                 |
| ---- | ----- | --------- | -------------------------------------------------------------------- |
| 1    | RED   | `65ffdd7` | 22 failing — the eight serpentine cases, the clock, the stage mode    |
| 1    | GREEN | `168b39c` | The three selectors, and `reduce.ts`'s helper deleted for an import   |
| 2    | RED   | `da25fae` | 19 failing — Amendment 1's four rows, the collision set, freshness    |
| 2    | GREEN | `30f2f1e` | The four remaining selectors and `uniqueIds`                          |

## TDD Gate Compliance

Both tasks ran RED → GREEN with the RED commit preceding the GREEN commit in git history.
Task 1's RED failed 22 assertions, task 2's failed 19; every one of them failed, so no new
test passed before its implementation existed. No REFACTOR commit — neither implementation had
anything left to clean up.

## The 04-03 Handoff, Discharged

04-03's summary instructed this plan to delete `reduce.ts`'s private `banTurn` and replace it
with an import of `selectBanTurn`. Done, in task 1's GREEN commit:

- `grep -c "function banTurn" src/core/reduce.ts` → **0**
- `grep -c "export function selectBanOrder" src/core/selectors.ts` → **1**
- A grep for `serpentine` across `src/` returns nine hits, **all of them prose** — the
  derivation itself exists once, in `selectBanOrder`.

**The eight serpentine cases in `tests/core/reduce.test.ts` pass unweakened and unmodified.**
`git diff cf37317 HEAD --stat` shows `tests/core/reduce.test.ts` is not in the change set at
all. They were the contract and the replacement satisfies them: `canApply(BANS_PLACED)` walks
`p1,p2,p3,p4,p4,p3,p2,p1`, refuses all three other players at each of the eight steps, refuses
`wrongSlot` on a carried `pass` that disagrees, and refuses `notYourBanTurn` once the eighth
ban has landed. That is 213 assertions across `selectors` and `reduce` together.

## Deviations from Plan

### Deliberate Interpretation

**1. `selectBanStageState` answers `'snake'`, not `'reveal'`, for a snake stage with no
sequence to walk.**

The plan's behaviour bullets give `'snake'` while `selectBanTurn` is non-null and `'reveal'`
"for `snake` once every ban is placed". Composed literally as `selectBanTurn(state) === null
? 'reveal' : 'snake'`, a snake tournament whose `order` has not landed — or whose
`bansPerPlayer` is `0` — would also read `'reveal'`, because `selectBanTurn` is `null` in all
three situations. That is the terminal answer, and in snake the terminal answer is where
`Start draft` lives.

An explicit `selectBanOrder(state.order, state.config.bansPerPlayer).length === 0` guard
returns `'snake'` for those two, and the reason is written beside it: a stage with nothing to
walk has not *finished*, it has not *begun*. It is also the reading blind already takes of
exactly the same situation — the plan's own bullet makes blind-with-no-order `'blindLocked'`,
a pre-terminal state. Both plan bullets remain literally satisfied in every non-degenerate
document: when `order` is non-empty and `bansPerPlayer >= 1`, `selectBanTurn === null` is
equivalent to "every ban is placed". The guard composes `selectBanOrder` rather than
re-deriving anything, so there is still one serpentine.

**2. A landed reveal ends the snake stage too.** `bans/revealed` is not part of snake's ritual
and `canApply` refuses one, but an imported document can carry it — and once it has,
`canApply(BANS_PLACED)` refuses every further ban with `banStageNotRunning`. A `'snake'` answer
there would render a board on which every cell is inert with no explanation, so
`selectBanStageState` returns `'reveal'`. The plan's bullet already gives `'reveal'` "for
`blind` once `bansRevealed` is non-null"; this extends the same reading to the mode that can
only reach the state by import.

**3. `selectPublicBanIds` dedupes on the `hostBanlist` row as well.** Amendment 1 describes
that row as `config.bans`, "unchanged from today". The returned array is a deduped copy rather
than the field itself, which is the fresh-records rule this file follows and which the plan
requires. Deduping it cannot change what any surface renders, because `bannedEntries` dedupes
downstream through its own `Set`; what it buys is that "a union, deduped" is true of the array
this function hands back rather than only of what somebody else later does with it. A
`uniqueIds` helper, module-private, does the work for all four rows.

**4. `selectBanTurn` carries `index`.** The plan's `<interfaces>` block specifies it and the
`<behavior>` bullets define it, so this is not an addition — but it is worth recording that it
is what lets the board render its cursor without recounting `banPlacements`, which would be a
second thing able to disagree about how far the stage has walked.

### Gate Phrasing Note — not a code defect

`grep -cE "split\('-'\)|split\(\"-\"\)" src/core/selectors.ts` returned **1** on the first
implementation, against a criterion asking for 0. The occurrence was inside
`selectBanCollisions`' doc block, and it was a **prohibition** rather than a call — the same
situation 04-03 recorded for `notInPool`. Rather than delete a warning the plan's own
`<action>` asks for, the sentence was reworded to carry the identical warning without the
literal token: "never on a display name, and never by splitting one of those on its hyphens.
`Tauros-Paldea-Aqua` and `Mr. Rime` both punish the second." Both greps now return 0, and
`grep -c '\.split(' src/core/selectors.ts` is 0 as well — no selector in the file splits a
string at all.

## Authentication Gates

None.

## Verification

| Check                                                       | Result                        |
| ------------------------------------------------------------ | ----------------------------- |
| `check:pure`                                                  | 0 violations, 18 files        |
| `check:nohtml`                                                | 0 violations, 67 files        |
| `tsc --noEmit -p tsconfig.json` and `-p tsconfig.node.json`   | clean, both                   |
| `vitest run tests/core/selectors.test.ts`                     | 111 passed                    |
| `vitest run tests/core/selectors.test.ts tests/core/bans.test.ts` | 119 passed                |
| `vitest run tests/core/`                                      | 982 passed, 18 files          |
| Full suite                                                    | 1721 passed, 53 files         |
| `vite build` + `build-sw-manifest`                            | built, 322 URLs precached     |
| `git diff --stat package.json package-lock.json`              | empty                         |
| `git diff cf37317 HEAD --stat -- src/ui/`                     | empty — this plan is core only |
| `git diff --diff-filter=D --name-only cf37317 HEAD`           | no deletions in any commit    |
| `git status --short`                                          | clean, no untracked files     |

Acceptance-criteria greps, all as specified: `selectBanOrder` 1, `selectBanTurn` 1,
`selectBanStageState` 1, `selectPublicBanIds` 1, `selectAllBanIds` 1, `selectBanCollisions` 1,
`selectSubmittedPlayerIds` 1, `^-.*selectPhase` in the diff 0, in-place `order.reverse()` 0,
`split('-')` 0.

`npm run verify` was not invoked as one command: this worktree has no `node_modules` and the
instructions forbid linking the main checkout's. Each of its four stages was run instead by
invoking the main checkout's binaries with this worktree as cwd, which touches nothing outside
this tree. The two `build-sw-manifest:` warning lines in the full-suite output are a
pre-existing test asserting that script's failure paths, not a defect.

## Known Stubs

None. Every selector computes its answer from the fold; nothing returns a hardcoded value, and
the two functions that return `[]` unconditionally in a mode — `selectBanCollisions` in snake,
`selectPublicBanIds`' blind-before-reveal row — do so because that is the rule, and each has a
test asserting it against a fixture that would produce a non-empty answer under any other
reading.

`'blindEntry'` is a union member `selectBanStageState` never returns. That is a documented
design requirement rather than an unfinished branch: D-18 puts the in-progress selection in
component state, so nothing in the fold can imply the value, and the member exists only so
`BanStageScreen`'s branch is total. The doc block says so at length.

The seven selectors have no UI consumer yet, which is this plan's stated nature — it is the
gate 04-RESEARCH asks for before any ban surface is built. The consumers are 04-05 (the
`Screen` member and `app.tsx`'s branch), 04-06/04-07 (snake), 04-09/04-10/04-11 (blind), and
the `TopBar` call site at `app.tsx:1307` that Amendment 1 narrows. Every selector is covered
by tests in this plan, so none of them is unexercised.

## Threat Flags

None. This plan's changes are `src/core/` only and add no endpoint, auth path, file access or
schema field. Three register entries are discharged rather than deferred:

- **T-04-16** (information disclosure, blind before the reveal) — mitigated.
  `selectPublicBanIds` branches on `banMode` and `bansRevealed === null` and never on a count.
  The test asserts on **content**: a fixture with three submissions all naming `starmie`, and
  the assertion that `starmie`, `skarmory` and `charizard` are each absent from the output
  while `config.bans` comes back intact. A length-only test would have passed against a
  fixture nobody had submitted into.
- **T-04-17** (a component assembling the banlist itself) — mitigated by the selector existing:
  04-06 through 04-11 now have one thing to call.
- **T-04-18** (a count taken from an array length) — mitigated. `selectAllBanIds`' doc block
  names the trap, and a test pins the honest set: three players banning `starmie` yields four
  public ids where `revealed.flatMap((entry) => entry.monIds).length` would report six.
- **T-04-19** (a `Map` or `Set` reaching the document) — mitigated. `selectBanCollisions`'
  `Map` and `uniqueIds`' `Set` are computation-local; every return is a plain array of plain
  records, and four tests mutate a returned array and assert the fold is unchanged.

## Self-Check: PASSED

- `src/core/selectors.ts` — FOUND
- `src/core/reduce.ts` — FOUND
- `tests/core/selectors.test.ts` — FOUND
- `.planning/phases/04-blind-and-snake-bans/04-04-SUMMARY.md` — FOUND
- `65ffdd7`, `168b39c`, `da25fae`, `30f2f1e` — all FOUND in `git log`
