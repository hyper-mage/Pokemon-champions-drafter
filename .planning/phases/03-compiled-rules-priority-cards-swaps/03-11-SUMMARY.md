---
phase: 03-compiled-rules-priority-cards-swaps
plan: 11
subsystem: swap-rounds-and-completion
tags: [SWAP-03, SWAP-04, SWAP-07, D-28, D-29, D-30, D-31, undo, export-gate]
requires:
  - "03-07: selectResolvedOrder — the value the swap order is derived from"
  - "03-08: selectPhase as the single mode decision, and its swapRounds arm"
  - "03-09: the one undo stack, UndoRemoval, RoundBoundaryCrossing"
  - "03-10: swap/made in all five places, DraftState.swaps, selectSwapsRemaining, the arming flow"
provides:
  - "swap/passed in all five places, plus buildLogEntry's sixth"
  - "DraftState.passes and the SwapPass shape"
  - "selectSwapRoundOrder / selectSwapOrderSource — D-28's order and the source it names"
  - "selectCurrentSwapRound / selectSwapRoundPosition — the swap-round clock"
  - "selectIsTournamentComplete — the export gate, beside an untouched selectIsComplete"
  - "RejectionReason 'notSwapRound' and 'swapRoundComplete'"
  - "SwapPanel — the §11 surface, with Pass this swap and the pending-export sentence"
  - "SWAP_ROUND_EXPAND_REASON — Amendment 3's third row"
  - "swaps() exported from confirm-copy — one plural rule for three surfaces"
  - "swap and pass on the undo stack, with both announcement rows wired"
affects:
  - "Phase 4: selectIsTournamentComplete is the gate a bracket seeds behind"
tech-stack:
  added: []
  patterns:
    - "One action, two windows: the payload field names the window and canApply reads the matching clock"
    - "A recorded non-event, so a round can count moves rather than infer them"
    - "A new sibling selector rather than a retyped one, when every existing caller is already correct"
    - "An allow-list of kinds for a comparison, so adding a kind cannot change three others' behaviour"
key-files:
  created:
    - src/ui/components/SwapPanel.tsx
    - src/ui/components/SwapPanel.css
    - tests/ui/swap-rounds.test.tsx
  modified:
    - src/core/actions.ts
    - src/core/model.ts
    - src/core/reduce.ts
    - src/core/selectors.ts
    - src/core/import-guard.ts
    - src/core/undo.ts
    - src/store.ts
    - src/ui/components/TurnBanner.tsx
    - src/ui/components/SplitPanes.tsx
    - src/ui/components/PoolGrid.tsx
    - src/ui/confirm-copy.ts
    - src/app.tsx
    - tests/core/swaps.test.ts
    - tests/core/undo.test.ts
    - tests/core/import-guard.test.ts
    - tests/ui/turn-banner.test.tsx
decisions:
  - "DraftState gained a `passes` array beside `swaps` rather than a discriminated union — selectSwapsRemaining must never see a pass, and one forgotten filter would spend an allowance for a non-event"
  - "selectCurrentSwapRound was added beyond the plan's four selectors: sequencing and the rendered `{s}` both need it, and deriving it in the UI would put a rule in a component"
  - "canApply(SWAP_MADE) reads whichever clock `swapRound` names — one widened check, never a second arm"
  - "A swap and a pass never raise the round-boundary confirm; its copy is pick-specific and 03-UI-SPEC lists no such confirm"
  - "The pane restriction is gated on `swapRound !== null`, not on the phase, because selectPhase stays 'swapRounds' after the rounds close"
  - "Tasks 2 and 3 landed in one commit — splitting them would have produced a red intermediate"
requirements: [SWAP-03, SWAP-04, SWAP-07]
metrics:
  duration: ~55 minutes
  completed: 2026-08-19
  tasks: 3
  commits: 3
  tests-added: 71
  tests-total: 1525
---

# Phase 3 Plan 11: Swap Rounds and Two Completions Summary

The last pick lands and the screen reads `Swap round 1 of 2 — Cy swaps or passes` with
`Swap order reverses round 6.` beneath it; everyone swaps or passes in an order derived from
a value the log already held; and only when the last round closes do the export panels open.

## Worktree Base — read this first

**This worktree arrived on `93f20ad`** — the same pre-wave-1 commit three earlier waves in
this phase got. `git merge-base HEAD 08dd01b` returned `93f20ad`, not `08dd01b`, so the
`<worktree_branch_check>` assertion fired and reset to `08dd01b` ("docs(phase-03): update
tracking after wave 10"). The wave 9+10 sanity greps then confirmed `SWAP_MADE`,
`selectSwapTargets` and `playableValues` were all present before any work began.

That is the **fourth** occurrence of the stale base in this phase. The assertion is
load-bearing and should stay exactly as written.

Branch: `worktree-agent-a2f72c0864eb02e0e` — in namespace, never on a protected ref. The
working tree was clean at reset, so nothing was discarded.

## What Was Built

### Task 1 — a pass is an action, and completion splits in two

`swap/passed` landed in all five places plus `buildLogEntry`'s sixth. Its doc block carries
SWAP-07's reason for existing at all: a swap round advances by **counting** the moves
recorded for it, so a skip that left no entry would leave the clock sitting on that player
forever — and undo could not tell "has not gone yet" from "went, and chose nothing".

`selectSwapRoundOrder` reverses round `config.rounds`' resolved order. When that is missing —
a migrated schema-2 document, or an import — it reverses `state.order` instead, and
`selectSwapOrderSource` reports which. That second selector is not decoration: SWAP-04 asks
for the order to be **explicit**, and a fallback nobody was told about would not be (T-03-44).

`selectIsTournamentComplete` is a **new sibling** of `selectIsComplete`, whose body is
byte-identical after this plan — every `selectIsComplete` line in the diff is an addition,
in a doc block or in a new selector. Retyping it would have changed `selectPhase`,
`selectCurrentTurn` and `undoCrossesRoundBoundary` silently and all at once, which is the
D-31 bug rather than the D-31 fix.

`canApply(SWAP_MADE)` now reads **whichever clock `swapRound` names** — the pick clock at
`0`, the swap-round clock at `>= 1`. One widened check, exactly as 03-10's handover note
specified, because the budget, the slot predicate, the pool accounting and the replacement
are identical in both windows (D-29) and a second arm would be four duplicated rules kept in
step by hand.

### Task 2 — the surface, and the one swap flow

`SwapPanel` is a heading, two sentences and one button, and it decides nothing. `Pass this
swap` has **no confirm**: nothing is lost, the budget is untouched, and undo covers it. It
takes no accent fill either — the draft screen spends none of 03-UI-SPEC's three accent uses
on a button.

The load-bearing line is in `app.tsx`:

```
phase === 'swapRounds' && swapArming === null && swapRound !== null ? <SwapPanel …/>
```

`swapArming === null` is what makes "there is one swap flow, not two" true rather than
merely intended. The moment a slot is armed this branch falls through to `PoolGrid` — the
same component, the same offer and the same confirm a mid-draft swap uses — with `swapRound`
set to the round in progress. A test asserts the armed Mega slot renders **8 cells**, counted
from the DOM, because a build that filtered nothing would still produce a legal document.

### Task 3 — nobody copies a paste that is about to change

The completed view, the per-player export panels and the PERS-06 checkpoint all hang off
`selectIsTournamentComplete`. That is one re-pointed local rather than five edited call
sites, and the comment above it says why: every reader of `complete` already means "the
tournament is over", and re-pointing them one at a time is how one gets missed.

`Teams are not final until the swap rounds finish. Exports open then.` renders on the panel,
so the absence is explained rather than mysterious.

## Deviations from Plan

### Auto-fixed / necessary additions

**1. [Rule 3 — Blocking] `src/core/model.ts` gained `DraftState.passes` and `SwapPass`**
- **Found during:** Task 1
- **Issue:** `selectSwapRoundPosition` counts `swap/made` **plus** `swap/passed` for a round,
  and selectors only see the fold. `DraftState` had nowhere to hold a pass, so the round
  could never advance past one. `model.ts` is not in the plan's `files_modified`.
- **Fix:** `passes: SwapPass[]`, a sibling of `swaps` rather than a discriminated union. The
  doc block argues the split: `selectSwapsRemaining` counts `swaps` and must **never** see a
  pass, because a pass costs no budget — one forgotten filter over a merged array would
  spend an allowance for a non-event. Two arrays, one `+` at the single place the clock is
  derived, and neither reader can make that mistake. This is the same shape 03-10's
  `DraftState.swaps` deviation took.
- **Commit:** `bdc1ea0`

**2. [Rule 3 — Blocking] A fifth selector, `selectCurrentSwapRound`**
- **Found during:** Task 1
- **Issue:** The plan specifies four selectors. `selectSwapRoundPosition(state, s)` is
  per-round arithmetic and deliberately does not ask whether an *earlier* round is still
  running, so nothing prevented swap round 2 opening while round 1 was unfinished. The
  surface also has to render `Swap round {s} of {n}` and needs `{s}` from somewhere.
- **Fix:** `selectCurrentSwapRound` — the lowest unfinished round, `null` before the picks
  are complete and once every round is full. `canApply` uses it for sequencing;
  `selectIsTournamentComplete` is defined as `selectIsComplete && selectCurrentSwapRound ===
  null`, so the loop exists once; and `app.tsx` reads it for the heading. Deriving `{s}` in a
  component would have put a game rule in the UI, which CLAUDE.md forbids.
- **Commit:** `bdc1ea0`

**3. [Rule 2 — Correctness] `src/core/undo.ts` and `src/store.ts` — deferred item 5**
- **Found during:** Task 1, per the execution brief's explicit assignment
- **Issue:** `Undo last move` stepped **past** a swap to the last pick, and the swap survived.
  Neither file is in the plan's `files_modified`.
- **Fix:** Both guards on `isUndoable`; `UndoRemoval.kind` widened to five members; `monId`
  redefined as "returns to the POOL" with a new `outMonId` for "returns to the SLOT"; a new
  `swapRound` field, `null` for a mid-draft swap because `0` is no dedicated round; and both
  03-UI-SPEC announcement rows wired. Closed in place in `deferred-items.md` — see below.
- **Commit:** `bdc1ea0`

**4. [Rule 1 — Bug] A swap or a pass would have raised a pick-specific confirm**
- **Found during:** Task 1, writing the undo tests
- **Issue:** `undoCrossesRoundBoundary` compared `removed.round` against the current round for
  every kind. A swap's `round` is the **pick** round of the slot it changed, routinely round 1
  while the draft stands at round 6 — so undoing almost any swap would have opened
  `UNDO_BOUNDARY_CONFIRM`, whose body reads *"This undoes {name}'s pick from round {r}"*.
  That is a plain untruth over a swap, on the surface whose whole job is saying what is about
  to change.
- **Fix:** The comparison is gated on `ROUND_COMPARABLE_KINDS = ['pick', 'card']`, so the
  three pre-existing kinds keep their behaviour byte for byte and the two new ones never
  cross. 03-UI-SPEC §12 lists exactly three new confirm sets for this phase and neither of
  these is among them, so the spec already held this position.
- **Commit:** `bdc1ea0`

**5. [Rule 1 — Bug] The turn banner fell silent for the whole of every swap round**
- **Found during:** Task 2 verification
- **Issue:** `bannerPlayerName` read `selectCurrentTurn`, which is null once the picks are
  complete. The banner rendered **nothing at all** during a swap round — `turnLine` was null
  and the component returned early.
- **Fix:** A third arm for `phase === 'swapRounds'`, reading the swap-round clock. This is
  D-17's original failure arriving a second time by a second route, and the comment says so.
  `bannerRound` deliberately did **not** gain an arm: the swap headline counts swap rounds,
  not pick rounds.
- **Commit:** `1b25081`

**6. [Rule 1 — Bug] The board's expand stayed inert forever after the swap rounds closed**
- **Found during:** Task 2 verification
- **Issue:** `selectPhase` answers `'swapRounds'` for any tournament that runs them once the
  picks are in — including after the last one has closed, which its own doc block states.
  Gating the pane restriction on the phase left `aria-disabled` on the board expand for the
  rest of the tournament's life, on the screen where the export panels had just asked for the
  full width. Inert ARIA that is never shed is exactly what WR-04 forbids.
- **Fix:** Gated on `swapRound !== null` — whether a round is still **running** — which is
  also the condition the `SwapPanel` branch uses, so the two cannot drift.
- **Commit:** `1b25081`

**7. [Rule 1 — Bug] A swap-round swap's announcement was silently overwritten**
- **Found during:** Task 2
- **Issue:** `confirmSwap` called `announce` directly, which is correct mid-draft because a
  swap does not change the turn (D-25). A **swap-round** swap advances the clock, so the
  banner writes its own announcement in the same tick — and `announce` is a single signal, so
  the room would have heard the next player's name instead of what just happened.
- **Fix:** The sentence routes through `lastMove` when a swap round is running, which is the
  mechanism that field exists for. The window is read **before** the dispatch, because
  afterwards the clock may already have moved off the round.
- **Commit:** `1b25081`

**8. [Rule 2 — Correctness] Focus handoffs for two swap-round transitions**
- **Found during:** Task 2
- **Issue:** Disarming a slot during a swap round unmounts `PoolGrid` and the pressed
  `Keep {species}` button with it; the last pass of the last round unmounts `SwapPanel` and
  the pressed `Pass this swap`. Preact cannot reuse a node across a vnode type, so focus fell
  to `<body>` in both cases — the hazard 03-10 flagged for this plan.
- **Fix:** One `focusAfterSwapRoundRef` holding a **selector**, resolved in a `useLayoutEffect`
  that always clears itself. A selector matching nothing is a no-op, which keeps every
  mid-draft interaction unchanged. Both are asserted.
- **Commit:** `1b25081`

**9. [Design] `swaps()` exported from `confirm-copy.ts` — deferred item 6**
- **Found during:** Task 2
- **Issue:** §11's budget line renders `Cy has 1 swaps left.` at the most likely setting a
  host picks, and `PoolGrid` held a second private copy of the plural rule.
- **Fix:** `swaps` is exported — alone among the five helpers, and the module states the
  exception and its reason — and both `SwapPanel` and `PoolGrid` call it. The **sentences**
  stay separate, because §10's row and §11's differ in more than the number.
- **Commit:** `1b25081`

### Deviations of process

**Tasks 2 and 3 landed in one commit (`1b25081`).** D-31's gate is a single re-pointed local
inside the expression tree Task 2 restructured, and the pending-export sentence is a line in a
file Task 2 creates. Split, the intermediate commit would have been red — my export-gate tests
live in the file Task 2 adds. The commit message states this.

**Task 3's assertions live in `tests/ui/swap-rounds.test.tsx`, not
`tests/ui/completed-draft.test.tsx`.** All four of the plan's acceptance criteria for that
file are about whether `App` renders `CompletedDraft` **at all**, and about a paste produced
by a draft played to completion through the store. `completed-draft.test.tsx` mounts the
component directly with hand-built props and cannot express either. Duplicating this
fixture and its roster mock into that file would have been a second copy of one document,
free to drift. Every named criterion is asserted — in the file that already has the harness
they require, under a `describe('the export gate — D-31')` block.

## Deferred Items

**Item 5 is CLOSED in place**, marked `SETTLED in 03-11` in the same style item 2 uses, with
a `What 03-11 did` section recording all four handover points plus the confirm-copy defect
the handover did not predict.

**Item 6 is also CLOSED in place**, since this plan owned its remaining half.

Items 1–4 are **byte-untouched**: every hunk in the diff is at line 130 or later, and item 5
begins at line 130. Nothing was renumbered, rewritten or removed. No new item was logged —
nothing out of scope was discovered.

## Verification

`npm run verify` fails on **exactly one** test, and it is the documented pre-existing flake:

```
tests/ui/ban-list.test.tsx > survives 187 bans at eight players and Exact, and dies on the 188th
Error: Test timed out in 5000ms
```

That is item 1 in `deferred-items.md`, reproduces at `e663518` before Phase 3 began, and is
load-sensitive. Per the execution brief the suite was re-run at a higher timeout to confirm
it is otherwise green:

- `npx vitest run --testTimeout=30000` → **53 files, 1525 tests, 0 failures**
- `npm run check:pure` → 0 violations in 18 files
- `npm run check:nohtml` → 0 violations in 67 files
- `npx tsc --noEmit` → clean
- `npm run build` → 123.40 kB JS (40.25 kB gzip), sw manifest 322 URLs
- `git diff --stat package.json` → empty. No dependency added, none touched.

Nothing in `vitest.config.ts`, `vite.config.ts` or any shared test setting was changed.

### Acceptance criteria

| Check | Required | Actual |
|---|---|---|
| `grep -Ec "SWAP_PASSED\|swapPassed\|isSwapPassedAction" src/core/actions.ts` | ≥ 5 | 6 |
| `grep -Ec "export function (selectSwapRoundOrder\|selectSwapRoundPosition\|selectIsTournamentComplete\|selectSwapOrderSource)" src/core/selectors.ts` | 4 | 4 |
| `git diff src/core/selectors.ts` — `selectIsComplete` body | no change | no `-` line mentions it |
| `grep -c "export function SwapPanel" SwapPanel.tsx` | 1 | 1 |
| `grep -c "Pass this swap" SwapPanel.tsx` | ≥ 1 | 2 |
| `grep -c "var(--color-accent" SwapPanel.css` | 0 | 0 |
| `grep -c "selectIsTournamentComplete" src/app.tsx` | ≥ 1 | 4 |
| `git diff TurnBanner.tsx` — `draftCompleteCopy` body | no change | no `±` line mentions it |
| `git diff --stat package.json` | empty | empty |

Every named test assertion in the plan exists. Task 1: the reverse of round 6's resolved
order deep-equalled; the migrated fallback plus `selectSwapOrderSource === 'startingOrder'`;
a pass advancing the position by one with `selectSwapsRemaining` unchanged; the two
completion selectors agreeing at `swapRounds: 0` and disagreeing at `1` until every player
has moved; `swapRound: 4000000000` refused by the import guard. Task 2:
`Swap round 1 of 2 — Cy swaps or passes` in full; both phase-line variants in full against
two genuinely different documents; `Pass this swap` dispatching with no dialog; the
zero-budget sentence with zero interactive board cells; an armed slot rendering the same
pool surface with the same count-line sentence; the board expand inert with its reason and
shedding `aria-disabled` afterwards. Task 3: zero `ExportPanel` while pending; the pending
sentence in full; `swapRounds: 0` reaching the completed screen with the Phase 2 banner text;
and the post-swap paste asserted by **exact string equality on the whole paste**, including
the Mega slot's stone and every blank-line separator.

## Test Counts

| Suite | Added |
|---|---|
| `tests/core/swaps.test.ts` | 31 |
| `tests/core/undo.test.ts` | 8 |
| `tests/core/import-guard.test.ts` | 5 |
| `tests/ui/swap-rounds.test.tsx` | 27 (new file) |

## Known Stubs

None. Every sentence on the swap-round surface is composed from a selector's answer, and no
hardcoded empty value reaches a rendered component. `SwapPanel`'s `playerName={''}` /
`remaining={0}` fallbacks are unreachable — the branch that renders it requires
`swapRound !== null`, which implies a position and therefore a player.

## Threat Flags

None. Every surface in the plan's `<threat_model>` is mitigated and tested: T-03-43
(`swapRound` bounded by `MAX_SWAP_ROUNDS`, and refused at `0` because there is no mid-draft
pass), T-03-44 (the fallback is deterministic **and** named on screen, asserted as a whole
sentence), T-03-45 (position is the count of both kinds of recorded move), T-03-46 (the
export gate, asserted by playing a swap round and checking the paste before and after) and
T-03-47 (`selectIsComplete` not retyped, pinned by the diff). No new network endpoint, auth
path, file access pattern or trust-boundary schema change was introduced.

## Notes for the Next Plan

- **`selectPhase` answers `'swapRounds'` after the swap rounds have closed**, which is what
  its doc block says it means — "every team is full and this tournament runs swap rounds".
  It was left alone deliberately: `selectIsTournamentComplete` is the selector that answers
  "are they done", and giving `'complete'` a fourth meaning would be the parallel mode flag
  D-17 forbids. Anything gating on "a swap round is running" should read
  `selectCurrentSwapRound(state) !== null`, as `app.tsx` does.
- **`selectIsTournamentComplete` is the gate a bracket seeds behind.** Phase 4 should read
  it rather than `selectIsComplete`, for D-31's reason exactly.
- **`UndoRemoval` now has five kinds and three nullable payload fields.** A sixth kind should
  say which of `monId` / `outMonId` / `swapRound` / `cardValue` it fills, and check whether
  it belongs in `ROUND_COMPARABLE_KINDS`.
- **The swap round's clock has no tiebreak and needs none.** `selectSwapRoundOrder` reverses
  a total order; if a future rule ever makes the last round's resolution partial, the reverse
  inherits that and this is where it would surface.
- **Deferred items 5 and 6 are closed.** Items 1, 3 and 4 remain open and are unowned; item 1
  is the flaky-test decision the host has still not been asked about directly.
