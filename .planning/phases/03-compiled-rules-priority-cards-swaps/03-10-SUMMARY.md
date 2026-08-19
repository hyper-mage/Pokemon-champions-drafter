---
phase: 03-compiled-rules-priority-cards-swaps
plan: 10
subsystem: draft-swaps
tags: [swaps, typed-slots, mega-eligibility, confirm-dialog, focus-management]
requires:
  - "03-02: selectSlotKind, selectSchedule, schedule/compiled"
  - "03-06: selectRoundEligibleIds, selectSlotStone, the round-restriction pool surface"
  - "03-08: selectPhase as the single mode decision, selectCurrentTurn over order/resolved"
  - "03-09: the one undo stack, confirm-copy.ts's established pattern"
provides:
  - "swap/made in all five places, plus buildLogEntry's arm"
  - "apply(SWAP_MADE): in-place replacement of a pick, preserving seq"
  - "DraftState.swaps and the SwapRecord shape"
  - "selectSwapsRemaining, selectSwapTargets"
  - "MonChip's swappable mode and swapCellName"
  - "boardCellId — the focus-return handle for a swapped slot"
  - "PoolGrid's SwapArming / SwapBudget props and the §10 header mode"
  - "SWAP_CONFIRM"
affects:
  - "03-11: consumes swapRound != 0, selectSwapsRemaining, the arming flow and the confirm"
tech-stack:
  added: []
  patterns:
    - "A replacement arm in an append-only log: the log appends, the FOLD replaces"
    - "Slot-first offer construction — the predicate filters before the click exists"
    - "Focus-return override via a ref plus useLayoutEffect, over Dialog's default"
key-files:
  created:
    - tests/core/swaps.test.ts
    - tests/ui/swap.test.tsx
  modified:
    - src/core/actions.ts
    - src/core/model.ts
    - src/core/reduce.ts
    - src/core/selectors.ts
    - src/core/import-guard.ts
    - src/ui/components/MonChip.tsx
    - src/ui/components/MonChip.css
    - src/ui/components/TeamStrip.tsx
    - src/ui/components/BoardGrid.tsx
    - src/ui/components/PoolGrid.tsx
    - src/ui/components/PoolGrid.css
    - src/ui/confirm-copy.ts
    - src/app.tsx
    - tests/core/import-guard.test.ts
    - tests/ui/draft-board.test.tsx
decisions:
  - "DraftState gained a `swaps` array — replacement erases the event from `picks`, so the budget would be underivable without it"
  - "selectSwapTargets DELEGATES to selectRoundEligibleIds rather than recomposing the predicate"
  - "swap/made is NOT added to undo's allow-list — it attaches with swap/passed in 03-11"
  - "The swap budget line is pluralised against 03-UI-SPEC's literal `{n} swaps` slot"
  - "An armed slot supersedes the round restriction rather than intersecting with it"
requirements: [SWAP-02, SWAP-05, SWAP-06, RULE-05]
metrics:
  duration: ~40 minutes
  completed: 2026-08-19
---

# Phase 3 Plan 10: Mid-Draft Swaps Summary

A player on the clock clicks their own filled board cell, the pool restates itself as that
slot's offer already filtered by the slot's own predicate, they confirm, and the outgoing
Pokémon returns to the pool for everyone — while `picks.length`, the turn and the replaced
pick's `seq` all stay exactly where they were.

## Worktree Base — read this first

**This worktree arrived on `93f20ad`**, which is a commit from *before* any of waves 1–9.
The `<worktree_branch_check>` assertion caught it and reset to `26fb85d` ("docs(phase-03):
update tracking after wave 9"), then confirmed wave 9 was present via the
`playableValues` / `undoRemoval` sanity greps. This is the **third** occurrence of the stale
base in this phase; the assertion is load-bearing and should stay.

Branch: `worktree-agent-a0ed0a29ae6636676` — in namespace, never on a protected ref.

## What Was Built

### Task 1 — `swap/made`, and the arm that replaces rather than appends

`swap/made` landed in all five places in `actions.ts` plus `buildLogEntry`'s sixth. The
payload carries `playerId`, `round`, `outMonId`, `inMonId` and `swapRound`, and is
self-describing: `apply` replaces a pick only when `playerId`, `round` **and** `outMonId` all
agree, so a disagreeing log folds to a no-op rather than swapping the wrong slot (T-03-38).

The `apply` arm copies `DRAFT_PICK_UNDONE`'s filter-and-rebuild shape, **not**
`DRAFT_PICK_MADE`'s append, and both halves of the argument are written above it — because
`selectTeams` renders the right team either way, so the wrong choice fails silently on the
board and shows up only as a Pokémon that never came back to the pool.

`canApply` rejects in order: `malformedPayload`, `draftNotStarted`, `notYourTurn`,
`nothingToSwap`, `notInPool`, `noSwapsLeft` — and carries a comment stating what it
deliberately does not check (the slot predicate) and why it structurally cannot.

### Task 2 — a board cell you can swap out of

`MonChip` gained a `swappable` mode. The doc block that said board cells are "not
interactive, in this phase or any planned one" is gone, replaced by Amendment 1's four
conditions with the original misclick reasoning preserved rather than overturned — it was an
argument about a *no-confirm* surface, and a swap confirms.

The key mechanic is that `swapName` is derived beside `nameText` and **inverts** it: when the
button owns the accessible name, the sprite takes `alt=""` in *both* pane states rather than
only in `board-full`. Written as independent props, a `split` swappable cell would announce
its species twice and its purpose never.

### Task 3 — arm a slot, and the pool restates itself

The armed slot is `app.tsx` view state; the **offer** is `selectSwapTargets`. `PoolGrid`
gained a second header mode — the `Swapping {species} out of round {r}` heading, both
count-line variants, the `Keep {species}` disarm, and the `Nothing can fill this slot` empty
state. The confirm states the resolved consequence in numbers and names, is rendered as a
**sibling** of the `inert` region, and overrides `Dialog`'s focus return to the board cell now
holding the incoming species.

## Deviations from Plan

### Auto-fixed / necessary additions

**1. [Rule 3 — Blocking] `src/core/model.ts` gained `DraftState.swaps` and `SwapRecord`**
- **Found during:** Task 1
- **Issue:** The plan specifies `selectSwapsRemaining` as "`config.swapBudget` minus the count
  of that player's `swap/made` entries", but `DraftState` had nowhere to hold them. Because
  `apply` **replaces** the pick, the post-fold `picks` array is byte-identical to one where
  the player had drafted the incoming species originally — the swap is unrecoverable from
  `picks`, and the budget it spent with it.
- **Fix:** Added `swaps: SwapRecord[]` to `DraftState` and `[]` to `initialState`, with a doc
  block arguing why this is not "storing derived data": it is the only surviving trace of the
  event, and the *remaining count* is still derived from it on every read.
- **Files:** `src/core/model.ts`
- **Commit:** `cbf8ad7`

**2. [Rule 3 — Blocking] `src/ui/components/BoardGrid.tsx` gained `swapPlayerId` / `onArmSwap`**
- **Found during:** Task 2
- **Issue:** The plan lists `TeamStrip.tsx` but not `BoardGrid.tsx`. `TeamStrip` is rendered
  only by `BoardGrid`, so the mode physically cannot reach it otherwise.
- **Fix:** Two optional props defaulting to `null`, resolved into a per-row handler exactly as
  `nextSlotIndex` already is. Every existing caller is unaffected.
- **Commit:** `84bd7a2`

**3. [Rule 2 — Correctness] The swap budget line is pluralised**
- **Found during:** Task 3
- **Issue:** 03-UI-SPEC writes `{name} has {n} swaps left` literally, which renders
  `Ada has 1 swaps left`. `swapBudget: 1` is the most likely setting a host picks, and every
  budget passes through 1 on its way to being spent.
- **Fix:** Pluralised in `PoolGrid`'s `swapBudgetLine`, and a `swaps()` helper added to
  `confirm-copy.ts` beside the four (`picks`, `players`, `bans`, `steps`) that module has
  carried since Phase 1 for exactly this class of slot. Logged as deferred item 6 so 03-11
  gives §11's swap-panel line the same treatment.
- **Commit:** `6f44950`

**4. [Design] `MonChip` gained an `id`, and the non-button chip a `tabIndex={-1}`**
- **Found during:** Task 3
- **Issue:** 03-UI-SPEC requires focus to land on "the board cell that now holds the
  swapped-in species". At `swapBudget: 1` — the common case — that cell stops being a button
  in the same render, so there was nothing focusable to hand focus to and it fell to `<body>`.
- **Fix:** `boardCellId(playerId, round)` exported from `TeamStrip` as one composer; the
  non-button chip takes `tabIndex={-1}` when it has an id. This is stated plainly in
  `MonChip`'s doc block rather than glossed: two attributes ARE new on every filled cell, and
  neither is interactivity (no tab stop, nothing announced, no ring under `:focus-visible`).
- **Commit:** `6f44950`

### Deliberately NOT done

**`swap/made` is not on `isUndoable`'s allow-list.** 03-09's own handover note states that
`swap/made` and `swap/passed` attach together and that `undoRemoval` gains *two* `kind`
members; the second does not exist until 03-11, and `UndoRemoval.monId` is a single field
where the swap announcement needs both ids. `undo.ts` is also not in this plan's
`files_modified`. Nothing corrupts in the meantime — undoing past the targeted pick makes
`apply(SWAP_MADE)` find no match and fold to a no-op, which is the T-03-38 containment doing
its job. Logged as deferred item 5 with the full handover.

## Verification

`npm run verify` fails on **exactly one** test, and it is the documented pre-existing flake:

```
tests/ui/ban-list.test.tsx > survives 187 bans at eight players and Exact, and dies on the 188th
Error: Test timed out in 5000ms
```

This is item 1 in `deferred-items.md`, reproduces at `e663518` (before Phase 3 began), and is
load-sensitive. Per the execution brief, the suite was re-run at a higher timeout to confirm
it is otherwise green:

- `npx vitest run --testTimeout=30000` → **52 files, 1454 tests, 0 failures**
- `npm run check:pure` → 0 violations in 18 files
- `npm run check:nohtml` → 0 violations in 66 files
- `npm run build` → typecheck clean, 118.80 kB JS (39.05 kB gzip), sw manifest 322 URLs
- `git diff --stat package.json` → empty. No dependency added, none touched.

Nothing in `vitest.config.ts`, `vite.config.ts` or any shared test setting was changed.

### Acceptance criteria

| Check | Required | Actual |
|---|---|---|
| `grep -Ec "SWAP_MADE\|swapMade\|isSwapMadeAction" src/core/actions.ts` | ≥ 5 | 6 |
| `grep -c "swapRound" src/core/import-guard.ts` | ≥ 1 | 12 |
| `grep -Ec "nothingToSwap\|noSwapsLeft" src/core/reduce.ts` | ≥ 4 | 4 |
| `grep -c "Not interactive, in this phase or any planned one" MonChip.tsx` | 0 | 0 |
| `grep -c "swappable" src/ui/components/MonChip.tsx` | ≥ 2 | 4 |
| `grep -c "board__cell--swappable" src/ui/components/TeamStrip.tsx` | 1 | 1 |
| `grep -Ec "#[0-9a-fA-F]{3,6}" src/ui/components/MonChip.css` | 0 | 0 |
| `grep -c "Swapping" src/ui/components/PoolGrid.tsx` | ≥ 1 | 2 |
| `grep -c "selectSwapTargets" src/app.tsx` | ≥ 1 | 6 |

Every named test assertion in the plan exists: `picks.length` unchanged, `seq` preserved,
`outMonId` back in `selectAvailablePool`, `selectCurrentTurn` deep-equal, mismatched
`outMonId` leaving `picks` deep-equal, Mega-slot targets Mega-eligible only, export → import →
fold reproducing `picks`; the `Swap Blastoise out of round 1` accessible name, a non-clock
player's cell not a button, zero `<button>` in the grid at `swapBudget: 0`, `alt=""` on a
swappable sprite; both count-line sentences asserted in full, the Mega-armed cell count equal
to the Mega-eligible available count, one dispatch with the board and pool swapping places,
focus on the board cell and not `document.body`, `Keep {species}` disarming without
dispatching, the budget line disappearing at zero, and the confirm body in full.

## Test Counts

| Suite | Added |
|---|---|
| `tests/core/swaps.test.ts` | 34 (new file) |
| `tests/core/import-guard.test.ts` | 8 |
| `tests/ui/draft-board.test.tsx` | 9 |
| `tests/ui/swap.test.tsx` | 26 (new file) |

## Known Stubs

None. Every surface this plan touches is wired to a real selector, and no hardcoded empty
value reaches a rendered component.

## Threat Flags

None. The plan's `<threat_model>` covers every surface added: T-03-38 (self-describing arm) is
mitigated and tested, T-03-40 (pool accounting under replacement) is mitigated and tested from
the pool side, T-03-41 (derived budget) is mitigated and tested including the overspent-import
case, T-03-42 (bounds) is mitigated with `round` and `swapRound` bounded independently, and
T-03-39 (slot-predicate violation in an imported document) is accepted, stated in `canApply`'s
comment, and pinned by a test asserting that `canApply` does **not** reject it — so a future
validator cannot be added silently.

## Notes for the Next Plan (03-11)

- **`swapRound` is already carried end to end.** Payload, creator, guard, `apply`, the
  `SwapRecord` in the fold, and `buildLogEntry` all name it, and a test asserts a non-zero
  value survives the round trip. 03-11 only needs to start emitting it.
- **`canApply(SWAP_MADE)`'s turn check is the seam.** It reads `selectCurrentTurn`, which is
  null once the picks are complete — correct for a `swapRound: 0` spend and wrong for a
  dedicated round. Widen that one check on `action.swapRound`; do not add a second arm.
- **`selectSwapsRemaining` already counts both kinds** — it filters `state.swaps` by player and
  never looks at `swapRound`, which is D-29's one budget spent either way.
- **The arming flow is reusable whole.** 03-UI-SPEC §11 says "arming a slot switches the pool
  pane to exactly the surface §10 specifies. There is one swap flow, not two." `armedSlot`,
  `armSwap`, `disarmSwap`, `swapArming` and the confirm are all already that surface; 03-11
  needs the swap-round *clock* and `swap/passed`, not a second flow.
- **`selectIsComplete` is untouched**, so D-31's second completion state is still 03-11's to add.
- **Deferred items 5 and 6 are addressed to 03-11 specifically** — undo's allow-list, and §11's
  unpluralised budget line.

## Self-Check: PASSED

All 16 files verified present on disk (2 created, 14 modified). All 5 commits verified in
`git log`: `d5ab062` (RED), `cbf8ad7`, `84bd7a2`, `6f44950`, `b3a74c0`. No file deletions in
any commit (`git diff --diff-filter=D` empty at every step), no untracked files left behind,
`package.json` untouched, and no `node_modules` link, junction or install created anywhere in
the worktree.
