---
phase: 03-compiled-rules-priority-cards-swaps
plan: 09
subsystem: priority-cards-and-undo
tags: [CARD-04, D-20, D-21, WR-04, SHEL-06, halls-condition, undo]
requires:
  - "src/core/cards.ts — resolvePickOrder and the CardPlay shape (03-07)"
  - "src/core/selectors.ts — selectHand, selectCardPlayOrder, selectCardsPlayedThisRound (03-07)"
  - "src/ui/components/CardPanel.tsx, CardFace.tsx — the card-play step (03-08)"
  - "src/core/undo.ts — the re-fold mechanism and RoundBoundaryCrossing (01-07, 02-09)"
provides:
  - "playableValues / cardOffer — Hall's condition over the still-to-play hands"
  - "selectCardOffer / selectPlayableCards — the offer, and whether it was lifted"
  - "RejectionReason 'cardNotPlayable' — the reducer backstop behind the offer"
  - "CardFace 'unplayable' state — inert, focusable, reason in the accessible name"
  - "lastUndoableAction / undoRemoval — one undo stack across picks, cards and resolutions"
  - "UNDO_RESOLVED_ORDER_CONFIRM — the un-resolve confirm, with removedCount live"
affects:
  - "src/core/reduce.ts — canApply(CARDS_PLAYED) gains its final arm"
  - "src/store.ts — undo announcements branch per kind"
  - "src/app.tsx — feeds the offer to CardPanel, routes two undo confirm variants"
  - "tests/ui/config-feasibility.test.tsx, draft-panes.test.tsx — helpers that repeated a value"
tech-stack:
  added: []
  patterns:
    - "Hall's marriage theorem by subset enumeration, hand-written, no matching library"
    - "Constrain the offer rather than validate the action (D-21), with canApply as backstop"
    - "One vnode shape across playable and inert so focus survives the transition"
    - "Conditional ARIA by object spread, so the attribute is absent rather than 'false'"
key-files:
  created: []
  modified:
    - src/core/cards.ts
    - src/core/selectors.ts
    - src/core/reduce.ts
    - src/core/undo.ts
    - src/store.ts
    - src/ui/components/CardFace.tsx
    - src/ui/components/CardFace.css
    - src/ui/components/CardPanel.tsx
    - src/ui/components/CardPanel.css
    - src/ui/components/TopBar.tsx
    - src/ui/components/TopBar.css
    - src/ui/screens/CompletedDraft.tsx
    - src/ui/confirm-copy.ts
    - src/app.tsx
    - tests/core/cards.test.ts
    - tests/core/reduce.test.ts
    - tests/core/undo.test.ts
    - tests/store-ownership.test.ts
    - tests/ui/card-play.test.tsx
    - tests/ui/confirm-dialogs.test.tsx
    - tests/ui/config-feasibility.test.tsx
    - tests/ui/draft-panes.test.tsx
    - tests/ui/import-export-controls.test.tsx
    - tests/ui/pool-filter-announce.test.tsx
decisions:
  - "The pigeonhole suspension and the deadlock escape both widen the offer, so cardOffer reports `lifted` to tell them apart — only one puts a line on screen"
  - "undo uses a deny-list for the three origination actions AND a structural allow-list, so an unknown or malformed imported entry is not undoable"
  - "Un-resolving a pick order always confirms, because the draft is still standing in the round it just resolved and a round-number comparison would wave it through"
  - "RoundBoundaryCrossing.pickRound renamed removedRound — it now carries a card's round"
  - "Focus hands on when the pressed card survives Preact's keyed diff but turns inert"
metrics:
  duration: ~25 min
  completed: 2026-08-19
  tasks: 3
  commits: 3
  tests-added: 47
  tests-total: 1377
---

# Phase 3 Plan 09: Card Legality and One Undo Stack Summary

CARD-04's no-repeat rule enforced by constraining the offer with Hall's condition, so the
three-player deadlock 03-CONTEXT found is unreachable rather than refused — and undo
generalized from "the last pick" to "the last move", removing a resolved order together with
the card that triggered it.

## What Was Built

**Task 1 — `playableValues`, and the deadlock as a test (`6ba63e6`).**
`src/core/cards.ts` gains a direct transcription of Hall's marriage theorem: a value is
playable only if, after adding it to the round's used set, the players still to play admit a
system of distinct representatives from their hands. Subset enumeration by bitmask, at most
127 unions per candidate, hand-written from the theorem with no library and no new import —
the module's only import is still `type { CardPlay }`.

Two guards carry their own reasoning. `players > rounds` skips the check entirely, because
pigeonhole makes a repeat unavoidable and running the matching would mark every card
unplayable. When nothing is playable at all — reachable only from an imported log — the
constraint lifts for that one play rather than presenting a screen with zero legal actions.

`selectCardOffer` / `selectPlayableCards` compose the three existing card selectors, and
`canApply(CARDS_PLAYED)` gains `cardNotPlayable` at the attach point 03-07 marked.

**Task 2 — the inert card (`4bd671f`).**
`CardFace` renders the unplayable state on the *same* `<button>` vnode, so Preact reuses the
node and focus survives the transition. The reason is in the accessible name; the ARIA is
spread in conditionally so it is genuinely absent — not `'false'` — when the value becomes
playable again (WR-04). Dimmed and struck are two classes applied as a pair, the same
pattern and the same class names `HandStrip` already uses.

**Task 3 — one undo stack (`ce8359a`).**
`undo.ts` reads the last *undoable* action rather than the last pick. A resolved order comes
off together with the card play that triggered it, because resolution is automatic (D-17):
removing the resolution alone returns to a state where every card is down and the app
re-resolves on the next render, so the undo would appear to do nothing or loop.
`removedCount` reports 2 for that case, making `confirm-copy.ts`'s clause — dormant since
02-07 — reachable for the first time.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — missing correctness] Focus handed to a card the host cannot play**

- **Found during:** Task 2, then again in Task 2's full-suite run
- **Issue:** Two separate paths parked keyboard focus on an inert card. `CardPanel`'s focus
  handoff took `querySelector('button')`, which since D-21 is frequently the one value
  nobody may play. Worse, the handoff only fired when the pressed button was *disconnected* —
  but Preact's keyed diff **reuses** the node when the next player's hand holds the same
  value, which is the common case, so focus stayed on a button that had silently turned
  inert and whose click emits nothing.
- **Fix:** The handoff now selects `button:not([aria-disabled])`, and fires when the pressed
  card is gone **or** has become inert.
- **Files modified:** `src/ui/components/CardPanel.tsx`
- **Commit:** `4bd671f`

**2. [Rule 1 — bug] Two test helpers played a value twice inside one round**

- **Found during:** Task 2 full-suite run (6 failures across two files)
- **Issue:** `bidCurrentRound` in `config-feasibility.test.tsx` played "the lowest card still
  in hand" for every player, and `cardButtons()[0]` in `draft-panes.test.tsx` clicked the
  first face regardless. Both produce a repeated value inside one round, which CARD-04 now
  forbids — so the second click hit an inert card, emitted nothing, and hung the round.
- **Fix:** The helper now plays the lowest card the **offer** carries; `cardButtons()`
  filters out inert faces and a sibling `allCardButtons()` was added for asserting on them.
  These were the tests describing the old rule, not a defect in the new one.
- **Files modified:** `tests/ui/config-feasibility.test.tsx`, `tests/ui/draft-panes.test.tsx`
- **Commit:** `4bd671f`

**3. [Rule 2 — stale contract] Comments and a field name made false by this plan**

- **Found during:** Task 3
- **Issue:** The repo's standing rule is that a stale contract comment is worse than none.
  `RoundBoundaryCrossing.pickRound` now carries a card play's or a resolution's round;
  `removedCount`'s comment said "Always 1 while `undoLast` is single-step"; `undo.ts`'s
  header described undo as pick-only; and one `undo.test.ts` fixture comment described a
  repeated-value round without noting CARD-04 now makes it unreachable in a live draft.
- **Fix:** `pickRound` renamed `removedRound` (7 test sites, 1 app site); all four comments
  corrected in the same change that broke them.
- **Files modified:** `src/core/undo.ts`, `src/ui/confirm-copy.ts`, `src/app.tsx`,
  `tests/core/undo.test.ts`
- **Commit:** `ce8359a`

### Plan Interface Additions

Three exports beyond the plan's `<interfaces>` block, each because the stated shape could not
carry a fact a consumer needed:

- **`cardOffer` / `CardOffer`** — `playableValues` returns an array, and the pigeonhole
  suspension and the deadlock escape produce an *identical* array. Only one of them puts a
  line on screen, so the panel cannot tell them apart without being told. `playableValues`
  remains exactly the plan's signature and is defined as `cardOffer(...).values` — one
  implementation, two shapes.
- **`selectCardOffer`** — the same, at the selector layer.
- **`undoRemoval` / `UndoRemoval`** — the confirm copy needs the card value and the player,
  and so does the live-region announcement. `lastUndoableAction` (the plan's stated export,
  present and used) returns the raw action and cannot report the *compound* removal's size or
  its paired card. One description, two consumers, so the dialog and the announcement cannot
  disagree about what an undo just did.

### Worktree Base Correction

This worktree arrived based on `93f20ad` ("docs(03): create phase plan") — **before any of
waves 1–8**. The startup assertion caught it and `git reset --hard 8987db2` corrected it
before any work began. Worth recording: this is the second time in this phase.

## Verification

`npm run verify` **passes clean** — `check:pure` (0 violations, 18 files), `check:nohtml`
(0 violations, 66 files), 1377 tests across 50 files, typecheck, `vite build`, and the
service-worker manifest (322 URLs precached).

The `ban-list.test.tsx` timeout documented as deferred item 1 **did not reproduce** on any of
the three full-suite runs during this plan.

`git diff --stat package.json package-lock.json` is empty — nothing was installed. The
CARD-04 check is hand-written; a matching library would have been a third runtime dependency
and a constraint violation (T-03-SC).

### Acceptance criteria

| Check | Result |
|---|---|
| `grep -c "export function playableValues" src/core/cards.ts` | 1 |
| Third-party import in `cards.ts` | none — sole import is `type { CardPlay }` |
| CONTEXT deadlock reproduced and foreclosed by name | 3 tests, plus one through the real rotation |
| 8 players / 6 rounds returns the whole hand | asserted |
| Deadlock escape returns the whole hand, not `[]` | asserted |
| `cardNotPlayable` rejection | asserted |
| Timing under 10ms | asserted at 8×6 **and** at 8×8, the largest shape that actually runs the matching |
| `grep -c "disabled={" src/ui/components/CardFace.tsx` | 0 |
| Both panel strings verbatim | 1 each |
| `grep -c "export function lastUndoableAction" src/core/undo.ts` | 1 |
| Exclusion list names all three origination actions | 4 matches |
| `grep -c "Undo last move" src/ui/components/TopBar.tsx` | 3 |
| `grep -rc "Undo last pick" src/` | 0 |
| `grep -c "un-resolves" src/ui/confirm-copy.ts` | 1 |
| `grep -c "Always 1 while" src/core/undo.ts` | 0 |
| Compound undo removes 2 and reports `removedCount === 2` | asserted |
| After that undo: `selectPhase === 'cards'`, no `order/resolved` | asserted |
| Card undo returns the value to `selectHand`, picks unchanged | asserted |
| Read-only tab cannot undo | asserted, incl. a new card-shaped case (T-03-36) |

### Threat register

All six `mitigate` dispositions are implemented and asserted: T-03-33 (deadlock escape),
T-03-34 (bounded, timed), T-03-35 (compound removal + honest `removedCount`), T-03-36
(`isOwner()` unchanged, re-asserted), T-03-37 (offer + backstop, with a comment stating that
a rejection reaching a user is a bug rather than a user-facing state).

## Known Stubs

None. Every surface this plan touches is wired to a real selector.

## Notes for the Next Plan

- **`selectCardOffer` is the seam for swaps.** If swap legality needs the same "constrain the
  offer" treatment, it should follow this shape rather than adding a `canApply` arm first.
- **`isUndoable`'s allow-list is where `swap/made` and `swap/passed` attach.** The deny-list
  above it already guarantees the growth cannot reach the origination actions, and
  `undoRemoval` gains two `kind` members. `UndoRemoval.kind` and the two `RoundBoundaryCrossing`
  fields were shaped for exactly that.
- **The undo announcement table has two rows still unused** — 03-UI-SPEC lists `Undo, swap`
  and `Undo, pass` alongside the two this plan implemented.
- **CARD-05's conditional tie clause is now load-bearing.** With `players <= rounds` a tie on
  value is unreachable, which is why the phase line's tie sentence only renders when players
  outnumber rounds. Two test fixtures that relied on ties are annotated to say so.

## Self-Check: PASSED

All 24 modified files verified present. All 3 commits verified in `git log`:
`6ba63e6`, `4bd671f`, `ce8359a`.
