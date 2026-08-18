---
phase: 03-compiled-rules-priority-cards-swaps
plan: 07
subsystem: core+ui
tags: [priority-cards, hand-strip, tiebreak, log-vocabulary, import-guard, aria-summary]

# Dependency graph
requires:
  - phase: 03-compiled-rules-priority-cards-swaps
    plan: 02
    provides: schedule/compiled and DraftState.schedule, which is half the gate that decides whether a document deals cards at all
  - phase: 03-compiled-rules-priority-cards-swaps
    plan: 01
    provides: schema 3 and the version 3 config fields every test fixture in this plan declares
  - phase: 01-roster-and-walking-skeleton
    provides: the append-only log, store.ts's max(seq) + 1 allocation, and the board row that already carried the player name
provides:
  - CardPlay and ResolvedOrder on DraftState — cardsPlayed and resolvedOrders, both derived from the log and never stored otherwise
  - resolvePickOrder — the (value, seq) total order, with no third comparator clause
  - selectHand / selectCardPlayOrder / selectCurrentRound / selectCardsPlayedThisRound / selectResolvedOrder
  - cards/played and order/resolved in all six places each, including the import guard's arms
  - three RejectionReason members — cardAlreadySpent, roundAlreadyResolved, roundNotComplete
  - HandStrip — six bare-digit pips and one spoken summary, inside the row height the board already reserved
  - BoardGrid.hands / TeamStrip.hand — the null-means-this-draft-dealt-none contract
affects:
  [
    03-08 the card-play step (dispatches both actions, reads all five selectors, rewrites selectCurrentTurn),
    03-09 D-21's offer constraint (attaches at the marked comment in canApply(CARDS_PLAYED)),
    03-10 undo across cards (D-20 walks back cards/played and order/resolved together),
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'A comparator whose totality is a proof, not a preference: uniqueness upstream is what makes a third clause unreachable rather than merely unnecessary'
    - 'A rule the UI renders arrives as a prop from a selector; the component owns the pips and the sentence and nothing else'
    - 'null and empty are different answers — no strip versus every pip struck through'
    - 'A structural guard types an action in isolation; a range that depends on config belongs to canApply and is still malformedPayload'

# Key files
key-files:
  created:
    - src/core/cards.ts
    - src/ui/components/HandStrip.tsx
    - src/ui/components/HandStrip.css
    - tests/core/cards.test.ts
  modified:
    - src/core/model.ts
    - src/core/actions.ts
    - src/core/reduce.ts
    - src/core/selectors.ts
    - src/core/import-guard.ts
    - src/ui/components/TeamStrip.tsx
    - src/ui/components/BoardGrid.tsx
    - src/ui/components/BoardGrid.css
    - src/app.tsx
    - tests/core/selectors.test.ts
    - tests/core/reduce.test.ts
    - tests/core/import-guard.test.ts
    - tests/ui/draft-board.test.tsx

decisions:
  - 'The tiebreak needs no tiebreak: (value, seq) is total because seq is unique log-wide, so there is no third comparator for player-entry order to reach — asserted by a shuffle test and a rotation test, not by a comment'
  - 'A card value out of range is malformedPayload rather than a new reason, because the structural guard could not have seen config.rounds and it is a payload this build never writes'
  - 'apply(ORDER_RESOLVED) appends rather than replaces, and selectResolvedOrder answers with the FIRST match, so a hand-edited file cannot rewrite a played round by appending a second opinion'
  - 'hands: null and hands: {} are different states — the first renders no strip (a migrated schema-2 draft), the second renders every pip struck through'
  - 'BoardGrid.roundNumbers doubles as the card value list, because a player holds one card per pick round and deriving 1..rounds twice would be two places to disagree'
  - 'D-21 offer constraint deliberately not started: half of it would refuse plays the card panel has no way yet to steer a player away from'

metrics:
  duration: ~35 min
  completed: 2026-08-18
  tasks: 3
  commits: 5
  files-changed: 17
  tests-added: 66
---

# Phase 3 Plan 07: Priority Card Vocabulary and Hand Strips Summary

The log learns to say a card was played and a round resolved, hands become `1..config.rounds`
minus what was spent, and every board row shows the cards its player still holds — struck
through as they go — inside the row height the board already had.

## What Was Built

**`src/core/cards.ts` — `resolvePickOrder`.** Ascending on `value`, then ascending on `seq`.
Low plays first (D-23), and a tie goes to whoever put the card down first (D-22). The doc block
carries the argument this plan exists to make checkable: `seq` is unique across the whole log
because `store.ts` allocates `max(seq) + 1`, so the comparator never returns `0`, so **there is
nowhere for a third clause to be reached**. Sort stability is therefore irrelevant and so is the
input array's own order — which matters because an imported document's `cardsPlayed` array order
need not agree with its `seq` order. The module consumes no randomness at all, which is the other
half of the correction 03-02 made when it stopped reserving `doc.rng` for this.

**`src/core/model.ts` — two record types and two `DraftState` arrays.** `CardPlay` carries
`seq` for the reason `DraftPick` does (a compensating action targets it, an array index would
not survive a retraction earlier in the log) and `round` for the reason `PickMadePayload` does
(the round must not be re-derived from position after an undo). Arrays rather than records,
because sync rule 14 forbids taking order from a key set and order is the whole of what this
list feeds.

**Five selectors.** `selectCurrentRound` exposes the round arithmetic on its own so the card
phase can have it before any of that round's picks exist. `selectHand` builds `1..config.rounds`
and subtracts a computation-local set — no literal 6 anywhere, so a four-round tournament deals
four cards without a second code path. `selectCardPlayOrder` is `order[(round - 1 + i) % p]`,
independent of every card outcome, which is what makes D-18's rotation unmanipulable.
`selectCardsPlayedThisRound` and `selectResolvedOrder` complete the set. `selectCurrentTurn` was
left exactly as it was — 03-08 rewrites it, and rewriting it here would break the pick path
before the card phase exists to replace it.

**`cards/played` and `order/resolved`, in all six places each.** Constant, payload interface,
`Intent` member, creator, structural guard, and `buildLogEntry`'s arm at the untrusted boundary.
Both `apply` arms guard first and stay total. Both `canApply` arms return the first failure in
the order the plan specified.

**Hand strips.** `HandStrip` renders bare digits — no box, no fill, no border, no padding — with
the spent ones dimmed **and** struck through, and hides the pips from assistive technology behind
one composed sentence per row (`Ada holds 2, 5 and 6.`). It is stacked below the player name
inside `board__label`, which became a two-line column; the label column's width is unchanged,
because a bare digit needs no box and six pips plus their gaps come to roughly 104px inside 176px.

## Key Implementation Details

**The card clock.** `canApply(CARDS_PLAYED)`'s `notYourTurn` is the first player in the round's
rotation who has not played yet — the rotation filtered by this round's plays. Because the
rotation reads only `state.order` and the round number, nothing a player does except playing can
move it.

**`roundAlreadyResolved` on a card play is reachable, and only from a file.** Once every player
has played, the clock is empty and `notYourTurn` fires first. The case this arm actually catches
is a document whose round resolved while somebody still held a card — which `fold` reproduces
faithfully, because `fold` runs no `canApply` at all. That is the case worth refusing on
origination, and it is tested with a hand-built log.

**`apply(ORDER_RESOLVED)` appends.** It does not replace an existing entry for the same round.
`canApply` refuses a duplicate on origination, and `selectResolvedOrder` answers with the first
match, so an appended second opinion in a hand-edited file cannot rewrite a round the room
already played.

**`hands: null` versus `hands: {}`.** `app.tsx` returns `null` when the document has an empty
schedule **and** no `cards/played` — a migrated Phase 2 draft, which ran strict alternation and
dealt nothing. `BoardGrid` maps a missing player entry inside a non-null `hands` to `[]` instead,
so "this tournament deals no cards" and "this player has spent everything" render differently.

**The import guard's bounds.** `order` is bounded by `MAX_PLAYERS`, and `value` and `round` by
`MAX_ROUNDS` — both for the allocation reason rather than an integrity one. A card value becomes
a pip in every board row's hand strip, so `"value": 4000000000` is an out-of-memory abort wearing
a small number's clothes exactly the way `rounds` is. `buildLog`'s `seq` rule was left untouched:
strictly increasing, gaps allowed, starting at 0. The round-trip test uses `seq` values of 40, 77
and 900 on purpose.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `src/ui/components/BoardGrid.tsx` had to be modified, and the plan's
`files_modified` list omitted it**

- **Found during:** Task 3
- **Issue:** The plan routes hands from `app.tsx` to `TeamStrip`, and `BoardGrid` is the only
  thing that renders `TeamStrip`. The prop could not reach its consumer without passing through.
  The plan listed `BoardGrid.css` but not `BoardGrid.tsx`.
- **Fix:** Added a `hands: Record<string, number[]> | null` prop with its own doc block, and
  passed `roundNumbers` down as `cardValues` rather than deriving `1..rounds` a second time.
- **Files modified:** `src/ui/components/BoardGrid.tsx`
- **Commit:** 169acd3

**2. [Rule 1 - Bug] A test helper played every player's card when the test meant to play one**

- **Found during:** Task 2
- **Issue:** `withCardPlays(log, round, values)` iterated the whole play order and defaulted a
  missing value to `1`, so a partial round was impossible to express. Three tests
  (`roundAlreadyResolved`, `roundNotComplete`, and the clock-moves-on case) were asserting
  against full rounds and passing or failing for the wrong reason.
- **Fix:** The helper now slices the play order to `values.length`, so fewer values means a
  genuinely partial round — which is also what a real round looks like between the first card
  and the last.
- **Files modified:** `tests/core/reduce.test.ts`
- **Commit:** c5e7bc1

**3. [Rule 3 - Blocking] A BoardGrid.css comment tripped the plan's own acceptance check**

- **Found during:** Task 3
- **Issue:** The acceptance criterion `git diff src/ui/components/BoardGrid.css | grep -c
  "board-label-w"` must return 0, as a proxy for "the label column width is unchanged". A new
  comment referred to the custom property by name and matched the grep, even though the
  declaration itself was untouched.
- **Fix:** Reworded the comment to say the same thing without naming the token, so the check
  reads only real changes to the width.
- **Files modified:** `src/ui/components/BoardGrid.css`
- **Commit:** 169acd3

### Scope Notes, Not Deviations

- `tests/core/cards.test.ts` builds `cardsPlayed` onto a folded state directly rather than
  through a log, because Task 1 precedes the action Task 2 adds. The file says so in its header.
  Task 2 then asserts the same properties — distinct `seq`, order independence, hands derived —
  through a real log in `tests/core/reduce.test.ts`, so neither claim rests on the fixture.
- `canApply(CARDS_PLAYED)` has **no** `cardNotPlayable` arm, as the plan instructed. D-21's
  offer constraint is 03-09's, and the comment marking where it attaches is in place.

## Authentication Gates

None.

## Testing

`npm run verify` passes: `check:pure` (0 violations across 19 core files), `check:nohtml`
(0 violations across 64 files), 1264 tests across 49 files, and a clean production build.

66 tests were added:

- **`tests/core/cards.test.ts` (39)** — the hand at six rounds and at four, the rotation and its
  wrap, `selectCurrentRound`'s clamp, and `resolvePickOrder` under a fixed permutation and under
  every rotation of its input. Plus the two facts the comparator rests on: every `CardPlay.seq`
  in a built document is distinct, and `doc.rng` still reads `{ seed, cursor: 0 }` after a full
  round of card play with every card selector run over it.
- **`tests/core/reduce.test.ts` (24)** — both `apply` arms including the malformed-payload cases,
  both `canApply` arms in the specified rejection order, and a card round folded with no
  `canApply` at all, whose `seq` gap the tiebreak reads correctly.
- **`tests/core/import-guard.test.ts` (9)** — the round trip over a log with deliberate `seq`
  gaps of 40, 77 and 900, and the `MAX_PLAYERS` / `MAX_ROUNDS` bounds on `order`, `value` and
  `round`.
- **`tests/ui/draft-board.test.tsx` (11)** — the three summary shapes on exact string equality,
  both spent classes on the same pip, a migrated schema-2 board with no strip at all, and the
  structural half of the zero-added-height claim.

The physical 64px measurement remains a DRFT-14 human-verify item — happy-dom performs no layout,
and the test says so beside the assertion, following that file's existing note about what it
cannot prove.

## Known Stubs

None. `resolvePickOrder`, all five selectors, both action families and the hand strip are fully
wired. The one deliberate absence — D-21's offer constraint — is a future plan's scope rather
than a stub, and is marked with a comment at its attachment point rather than with dead code.

## Threat Flags

None. The two trust boundaries this plan crosses were both in the plan's own threat register and
both mitigated: `buildLogEntry` bounds every new field (T-03-25), and `resolvePickOrder`'s
totality closes the imported-array-order gap (T-03-26). No new network endpoint, auth path, file
access pattern or schema change at a trust boundary was introduced. `package.json` is untouched.

## Self-Check: PASSED

Created files verified present:

- `src/core/cards.ts` — FOUND
- `src/ui/components/HandStrip.tsx` — FOUND
- `src/ui/components/HandStrip.css` — FOUND
- `tests/core/cards.test.ts` — FOUND

Commits verified in `git log`:

- `5678f68` test(03-07): add failing tests for the hand, the rotation and the tiebreak — FOUND
- `0e96ba8` feat(03-07): the hand, the rotation, and the tiebreak that has no tiebreak — FOUND
- `51731a3` test(03-07): add failing tests for cards/played and order/resolved — FOUND
- `c5e7bc1` feat(03-07): cards/played and order/resolved in all six places each — FOUND
- `169acd3` feat(03-07): hand strips in the board rows — FOUND

## TDD Gate Compliance

Both `tdd="true"` tasks ran RED then GREEN, with the failing run recorded before the
implementation commit:

- Task 1 — `5678f68` (test, 5 failures observed) then `0e96ba8` (feat)
- Task 2 — `51731a3` (test, 32 failures observed) then `c5e7bc1` (feat)

No REFACTOR commit was needed for either; neither implementation had duplication to remove once
green. Task 3 is not a TDD task and landed as a single `feat` commit.
