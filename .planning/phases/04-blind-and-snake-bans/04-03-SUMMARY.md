---
phase: 04-blind-and-snake-bans
plan: 03
subsystem: core-actions-fold
tags: [actions, reducer, import-guard, bans, d-11]
requires:
  - SCHEMA_VERSION = 4
  - TournamentConfig.bansPerPlayer
  - TournamentConfig.duplicateBanPolicy
provides:
  - BANS_PLACED / BANS_SUBMITTED / BANS_REVEALED
  - BansPlacedPayload / BansSubmittedPayload / BansRevealedPayload
  - BansPlacedAction / BansSubmittedAction / BansRevealedAction
  - bansPlaced / bansSubmitted / bansRevealed
  - isBansPlacedAction / isBansSubmittedAction / isBansRevealedAction
  - DraftState.banPlacements / banSubmissions / bansRevealed
  - BanPlacement / BanSubmission
  - RejectionReason banStageNotRunning / notYourBanTurn / alreadySubmitted / wrongBanCount / duplicateBanIds / banAlreadyPlaced / bansNotComplete / bansAlreadyRevealed
  - mode-conditional poolNotBuilt guards (D-11)
affects:
  - src/core/actions.ts
  - src/core/model.ts
  - src/core/reduce.ts
  - src/core/import-guard.ts
  - src/store.ts
  - src/core/undo.ts
tech-stack:
  added: []
  patterns:
    - six landing sites per action type, the sixth being buildLogEntry's arm
    - a nested array-of-records rebuilt by a named function, both levels copied
    - mode-conditional guard relaxation rather than guard deletion
    - canApply arms documented as backstops behind an offer that renders inert
key-files:
  created: []
  modified:
    - src/core/actions.ts
    - src/core/model.ts
    - src/core/reduce.ts
    - src/core/import-guard.ts
    - src/store.ts
    - src/core/undo.ts
    - tests/core/actions coverage lives in tests/core/import-guard.test.ts
    - tests/core/import-guard.test.ts
    - tests/core/model.test.ts
    - tests/core/reduce.test.ts
decisions:
  - D-11 both poolNotBuilt guards are conditioned on banMode === 'hostBanlist' rather than deleted, so the mode Phase 3 verified keeps byte-for-byte the same rule
  - bans/submitted carries the whole allotment because D-05 makes the lock-in one act and undo must walk back one act
  - bans/revealed is materialized rather than derived, on ScheduleCompiledPayload's precedent
  - wrongBanCount and duplicateBanIds stay apart because the host-facing copy differs
  - apply(BANS_REVEALED) is first-write-wins, so a hand-edited second reveal cannot rewrite the one the room watched
  - the serpentine derivation lives temporarily in reduce.ts as a private banTurn helper, because selectBanTurn is 04-04's and 04-04 runs a wave later
metrics:
  duration: ~40 min
  tasks: 2
  commits: 4
  files-changed: 9
  completed: 2026-08-21
---

# Phase 4 Plan 03: The Ban Vocabulary, Fold and Guards Summary

A ban now has three action types that survive an export round trip field by field, a fold
that stores the three facts and nothing derivable from them, eight backstop guards, and
`draft/started` ahead of the pool for blind and snake while `hostBanlist` is provably
unchanged.

## What Was Built

**`src/core/actions.ts`** gained `bans/placed`, `bans/submitted` and `bans/revealed` at all
six landing sites each — constant, payload interface, `Intent` member, `XAction` alias,
creator, structural guard. Every creator names each field explicitly and copies arrays
element by element; `bansRevealed` copies **both** levels, which is the one this file had no
precedent for. The three payload-design arguments live beside the code they justify: the
whole-allotment shape (D-05), the attribution array against its own derivability (D-13), and
the edge-stamped `pass` (`PickMadePayload.round`'s reason). No payload carries a
duplicate-policy field — that is `config.duplicateBanPolicy`, per D-10.

**`src/core/import-guard.ts`** gained the three `buildLogEntry` arms and one helper,
`buildRevealedBans`, for the only payload in the switch that is two levels deep. Three
bounds from two constants: `pass` and `monIds` by `MAX_BANS_PER_PLAYER`, the reveal's outer
array by `MAX_PLAYERS`. All three are allocation bounds; none is an integrity check.

**`src/core/model.ts`** gained `banPlacements`, `banSubmissions` and `bansRevealed` on
`DraftState`, plus the `BanPlacement` and `BanSubmission` records. The first two are sibling
arrays and never a `Record` keyed by `playerId` — the ban stage's turn is nothing but order,
and sync rule 14 forbids deriving anything order-sensitive from a key set. `bansRevealed`
starts `null`, and its doc block states that `null` and `[]` are different answers here and
that `[]` is unreachable in any document this build originates.

**`src/core/reduce.ts`** gained three `apply` arms, eight `RejectionReason` members, three
`canApply` arms carrying eleven rejects between them, and the D-11 relaxation. Both
`poolNotBuilt` guards became
`state.config.banMode === 'hostBanlist' && state.poolIds.length === 0`. `canApply(POOL_BUILT)`
was read and not edited — it asks about the pool and asserts nothing about the draft having
started, so a `pool/built` arriving last was already legal.

Four doc-comments that asserted the old ordering were corrected in the same change that made
them false: `reduce.ts`'s "After the pool, because a schedule is only meaningful against
one", `createTournament`'s ordering block in `store.ts`, the `NEVER_UNDONE` invariant
argument in `undo.ts`, and `DraftStartedPayload` plus `PoolBuiltPayload` in `actions.ts`.
`store.ts` and `undo.ts` are **comment-only** — `git diff -U0` on both, filtered to
non-comment lines, is empty.

## Task Commits

| Task | Gate  | Commit    | What                                                        |
| ---- | ----- | --------- | ----------------------------------------------------------- |
| 1    | RED   | `b2d379c` | Round-trip, extra-key, creator and structural-guard tests    |
| 1    | GREEN | `8b5e0b5` | Three types × six sites, three guard arms, `buildRevealedBans` |
| 2    | RED   | `111256d` | hostBanlist regression, blind sequence, serpentine, apply arms |
| 2    | GREEN | `69972a0` | The fold, eight guards, D-11 relaxation, four doc corrections |

## TDD Gate Compliance

Both tasks ran RED → GREEN with the RED commit preceding the GREEN commit in git history.
Task 1's RED failed 43 assertions, task 2's failed 35. No REFACTOR commit: neither
implementation had anything left to clean up.

Task 2's RED is worth one note, because part of it passed and was supposed to. The
`describe('the poolNotBuilt guards under hostBanlist')` block — three assertions that the
existing guards still refuse an empty pool — passed before the relaxation and passes after
it. That is its entire value: it is the regression net, and an assertion that failed in RED
would have meant it was testing the new behaviour rather than the old. Its sibling block for
blind and snake did fail, on all four assertions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `notYourBanTurn` needs a serpentine that does not exist yet**

- **Found during:** Task 2
- **Issue:** The plan's `<behavior>` requires `canApply(BANS_PLACED)` to refuse
  `notYourBanTurn` "when the player is not the serpentine selector's answer", and its
  acceptance criteria require `notYourBanTurn` to appear in a `reject(...)` call. That
  selector is `selectBanTurn`, which **04-04 builds, in wave 3, `depends_on: ["04-03"]`**.
  `reduce.ts` cannot import a function that lands a wave later, and a grep across the phase
  confirms **04-03 is the only plan in Phase 4 whose `files_modified` contains
  `src/core/reduce.ts`** — so deferring the guard body would have left it permanently
  unwired.
- **Fix:** The serpentine derivation is written once, as a private non-exported `banTurn`
  helper at the top of `reduce.ts`, tested through `canApply` rather than directly. Its doc
  block states where it belongs (`selectors.ts`, beside `selectStartingOrder`), cites
  `canApply(CARDS_PLAYED)`'s comment about what happened the last time a turn rotation lived
  in the reducer, names 04-04 as the owner, and instructs that the helper be **deleted and
  replaced with an import** when `selectBanTurn` lands.
- **Why not the alternatives:** building `selectBanOrder`/`selectBanTurn` in `selectors.ts`
  now would pre-empt 04-04's named artifacts and put untested exports in a test file outside
  this plan's scope. Duplicating the derivation permanently would be the exact "second copy
  of who is on the clock" the file already warns against.
- **Files modified:** `src/core/reduce.ts`
- **Commit:** `69972a0`
- **Conflict risk:** none in-wave. The concurrent sibling 04-02 touches `feasibility.ts`
  only; `feasibility.ts` was not read from or written to by this plan.

**→ HANDOFF TO 04-04, which reads this file:** replace `banTurn` in `reduce.ts:135-181`
with an import of `selectBanTurn`, and delete the local helper. The eight serpentine cases
pinned in `tests/core/reduce.test.ts` (`walks a true serpentine — 1,2,3,4 then 4,3,2,1`) run
through that arm, so a replacement that disagrees will fail them rather than diverge
quietly. Note that this makes `src/core/reduce.ts` a file 04-04 must edit even though its
`files_modified` does not list it.

### Deliberate Interpretation

**Three checks beyond the plan's eight, all reusing existing rejection reasons.** None adds
an API string; each closes a hole the plan's list leaves open on the imported-document path.

1. **`wrongSlot` when `bans/placed` carries a `pass` that disagrees with the clock.** `pass`
   is stamped at the edge and `apply` records it verbatim, so an unguarded mismatch files a
   ban under a column the board renders in the wrong place. `canApply(DRAFT_PICK_MADE)` makes
   exactly this check for `round` and `pickIndex`, under exactly this reason.
2. **`unknownPlayer` when somebody outside `state.order` submits a blind allotment.**
   Without it a stranger's submission folds into `banSubmissions`, appears in
   `selectSubmittedPlayerIds`, and is counted by nothing — the reveal would name a player the
   tournament does not have.
3. **`draftNotStarted` on all three ban arms.** The ban stage reads `state.order`; before
   `draft/started` there is nothing to read. Every other action-with-a-clock arm in the file
   opens with the same check.

**`apply(BANS_REVEALED)` is first-write-wins.** The plan says the arm "sets `bansRevealed`",
which last-write-wins satisfies literally. `apply(ORDER_RESOLVED)`'s own comment is the
precedent for the stricter reading — "a hand-edited file cannot rewrite a round the room
already played by appending a second opinion" — and a reveal is the same kind of watched
event. `canApply` refuses the second reveal on origination; the fold now agrees with it.

**`banStageNotRunning` also fires for the wrong mode's action.** The plan describes it as
firing "when `config.banMode === 'hostBanlist'`, and when the reveal has already landed". A
`bans/placed` in a `blind` document and a `bans/submitted` in a `snake` one are the same
failure from the host's side — the action names a stage this tournament is not in — so the
arms test `banMode !== 'snake'` and `banMode !== 'blind'` respectively, which is strictly
tighter and covers the `hostBanlist` case the plan names.

### Gate Phrasing Notes — not code defects

Two acceptance criteria are arithmetically or literally unsatisfiable as written. No code was
added or removed to satisfy either phrasing.

**1. `grep -cE "BANS_PLACED|BANS_SUBMITTED|BANS_REVEALED" src/core/actions.ts` returns 12,
not 18.** `grep -c` counts matching *lines*, and — more importantly — the SCREAMING_SNAKE
constant appears at only **four** of the six landing sites for *every* type in this file. The
`Intent` member and the `XAction` alias reference the **Payload interface**, not the
constant. The shipped precedent measures identically: `grep -c "SWAP_MADE" src/core/actions.ts`
returns **4**, and each of the three new types also returns 4 (12 ÷ 3). All six sites exist
per type — for `bans/placed`:

- `:52` constant, `:331` payload interface, `:395` `Intent` member, `:408` `BansPlacedAction`
  alias, `:553` creator, `:735` structural guard, plus `import-guard.ts`'s arm as the sixth.

**2. `grep -c "notInPool" src/core/reduce.ts` returns 4, where the criterion asks for the
count it had before (3).** The extra occurrence is at `reduce.ts:170`, inside the
`banAlreadyPlaced` doc block, and it is a **prohibition rather than a borrow**: "`notInPool`
is deliberately NOT borrowed for this. The ban stage runs BEFORE the pool exists…" The
criterion's stated intent — "no ban arm borrows it" — is measured exactly by
`grep -c "reject('notInPool')"`, which returns **2 before this plan and 2 after**. The
comment was kept because it warns a future reader off the exact mistake the criterion names,
and deleting it to satisfy a literal count would be the worse trade.

Every other criterion passes as written: `poolNotBuilt` = 3 with both `reject` calls inside a
`banMode === 'hostBanlist'` condition, the six-reason grep = 16 (≥ 12), the `DraftState` field
grep = 8 (≥ 6), `banCount|collisionSet|publicBanIds` = 0, `log.length` = 0, the stale
schedule comment = 0, `duplicatePolicy` = 0, creator spreads = 0, and the three `'bans/…'`
literals = 1 each.

## Authentication Gates

None.

## Verification

| Check                                                        | Result                     |
| ------------------------------------------------------------- | -------------------------- |
| `check:pure`                                                   | 0 violations, 18 files     |
| `check:nohtml`                                                 | 0 violations, 67 files     |
| `tsc --noEmit -p tsconfig.json` and `-p tsconfig.node.json`     | clean, both                |
| Full suite                                                     | 1653 passed, 53 files      |
| `tests/core/` alone                                            | 914 passed, 18 files       |
| `vite build` + `build-sw-manifest`                             | built, 322 URLs precached  |
| `git diff --stat package.json package-lock.json`                | empty                      |
| `git diff -U0 -- src/store.ts src/core/undo.ts`, non-comment lines | empty — comment-only   |
| `git diff --diff-filter=D` per commit                          | no deletions in any commit |

`npm run verify` was not invoked as one command: this worktree has no `node_modules` and the
instructions forbid linking the main checkout's. Each of its four stages was run instead by
invoking the main checkout's binaries with this worktree as cwd, which touches nothing
outside this tree. The output above is from those runs.

The four `build-sw-manifest:` warning lines that appear in the full-suite output are a
pre-existing test asserting that script's failure paths, not a defect.

## Known Stubs

None. The three `DraftState` fields, the eight rejection reasons and the ban action family
are read by nothing user-facing yet, which is this plan's stated nature rather than a stub —
its own frontmatter says "No user-facing behaviour changes in this plan — it is the second
and last shared-substrate plan." The consumers are 04-04 (selectors), 04-06/04-07 (snake
surfaces) and 04-09/04-10/04-11 (blind surfaces). Each new field, reason and type is covered
by a test in this plan, so none of them is unexercised.

The one carry-forward that is genuinely temporary is the `banTurn` helper documented under
Deviations, which 04-04 must delete.

## Threat Flags

None. The three `buildLogEntry` arms are new untrusted-input surface, and they are already in
the plan's threat register as T-04-11 (mitigated: rebuilt field by field, round-trip tests
asserting `pass` and the nested `monIds` survive) and T-04-12 (mitigated: the structural
guards are the only check `fold` performs, and the `canApply` arms are documented in the file
as origination-time backstops so nobody later mistakes them for a replay defence). T-04-13's
accepted posture is unchanged — an imported `banMode: 'blind'` document folds with an empty
pool, which is the intended behaviour and 04-02's gate is what stops the empty pool becoming a
`RangeError`. T-04-14's accepted plaintext posture is unchanged and the rejected
commit-then-reveal hash scheme was not reintroduced. No new endpoint, auth path, file access
or schema field.

## Self-Check: PASSED

- `src/core/actions.ts` — FOUND
- `src/core/model.ts` — FOUND
- `src/core/reduce.ts` — FOUND
- `src/core/import-guard.ts` — FOUND
- `src/store.ts` — FOUND
- `src/core/undo.ts` — FOUND
- `tests/core/import-guard.test.ts` — FOUND
- `tests/core/model.test.ts` — FOUND
- `tests/core/reduce.test.ts` — FOUND
- `.planning/phases/04-blind-and-snake-bans/04-03-SUMMARY.md` — FOUND
- `b2d379c`, `8b5e0b5`, `111256d`, `69972a0` — all FOUND in `git log`
