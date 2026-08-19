---
phase: 03-compiled-rules-priority-cards-swaps
reviewed: 2026-08-19T23:14:46Z
depth: standard
files_reviewed: 49
files_reviewed_list:
  - src/adapters/persistence.ts
  - src/app.tsx
  - src/core/actions.ts
  - src/core/cards.ts
  - src/core/compile.ts
  - src/core/draw.ts
  - src/core/feasibility.ts
  - src/core/import-guard.ts
  - src/core/mega.ts
  - src/core/migrate.ts
  - src/core/model.ts
  - src/core/reduce.ts
  - src/core/search.ts
  - src/core/selectors.ts
  - src/core/undo.ts
  - src/store.ts
  - src/ui/components/BanChipList.tsx
  - src/ui/components/BoardGrid.css
  - src/ui/components/BoardGrid.tsx
  - src/ui/components/CardFace.css
  - src/ui/components/CardFace.tsx
  - src/ui/components/CardPanel.css
  - src/ui/components/CardPanel.tsx
  - src/ui/components/FilterBar.css
  - src/ui/components/FilterBar.tsx
  - src/ui/components/HandStrip.css
  - src/ui/components/HandStrip.tsx
  - src/ui/components/MonCard.tsx
  - src/ui/components/MonChip.css
  - src/ui/components/MonChip.tsx
  - src/ui/components/PoolGrid.css
  - src/ui/components/PoolGrid.tsx
  - src/ui/components/SchedulePreview.css
  - src/ui/components/SchedulePreview.tsx
  - src/ui/components/SplitPanes.tsx
  - src/ui/components/SwapPanel.css
  - src/ui/components/SwapPanel.tsx
  - src/ui/components/TeamStrip.tsx
  - src/ui/components/TopBar.css
  - src/ui/components/TopBar.tsx
  - src/ui/components/TurnBanner.css
  - src/ui/components/TurnBanner.tsx
  - src/ui/components/TypeaheadField.tsx
  - src/ui/confirm-copy.ts
  - src/ui/screens/CompletedDraft.tsx
  - src/ui/screens/ConfigScreen.css
  - src/ui/screens/ConfigScreen.tsx
  - src/ui/sprite-src.ts
  - src/ui/tokens.css
findings:
  critical: 2
  critical_fixed: 2
  warning: 8
  info: 4
  total: 14
status: blockers_fixed
---

# Phase 3: Code Review Report

**Reviewed:** 2026-08-19T23:14:46Z
**Depth:** standard
**Files Reviewed:** 49
**Status:** blockers_fixed — both criticals resolved 2026-08-19; 8 warnings and 4 info remain open

## Resolution of the two blockers

Both were reproduced independently before being fixed, and both carry a regression test that
fails against the previous implementation.

**CR-01 — fixed in `fde7a83`.** `admitsDistinctRepresentatives` now decides Hall's condition by
Kuhn's matching rather than by subset enumeration. Equivalence was established first: 15150
exhaustive small cases (hands over 1–4 distinct values, 1–3 hands, with and without used values)
agree with the old implementation on every one. Measured on the reachable worst case —
24 players over 24 rounds, which is `players == rounds` and therefore passes GUARD 1 —
**11185ms before, 0.056ms after**. `tests/core/cards.test.ts` gains a 250ms budget on that shape.

*One correction to this report's CR-01 as written.* It states the exponential blowup is reachable
with a 20-player/20-round document, which is right, and implies the 32-bit overflow of
`1 << count` is reachable too, which is not. `cardOffer` returns at GUARD 1 whenever
`players > rounds`, and `MAX_ROUNDS` is 24, so `count` never exceeds 23 and the shift never
overflows through this call path. The overflow was a latent landmine — live only if GUARD 1 ever
changed or a second caller appeared — not a live defect. The matching removes it either way.

**CR-02 — fixed in `3601677`.** The staleness rule now lives in one derived `activeArmedSlot`,
which both the pool surface and `handlePoolPick` read; neither reads the raw `armedSlot` any
more. The report's severity call was sound but its impact framing needs one qualification:
`apply(SWAP_MADE)` matches on `pick.monId` and folds a disagreeing swap to a no-op (T-03-38), so
no document could be corrupted. The defect was an inescapable-looking armed state — the disarm
control gone from the screen while clicks still opened swap confirms — rather than data loss.
`tests/ui/swap.test.tsx` gains two cases, one of which was confirmed to fail against the old
handler.

The 8 warnings and 4 info findings below are **not** addressed and remain open. WR-02
(`handlePlayCard` deciding round-completion by length while `canApply` decides by set membership)
and WR-03 (`canApply(ORDER_RESOLVED)` validating nothing about the array that drives
`selectCurrentTurn`) are the two worth taking first, WR-03 especially — `canApply` is what a
future `receive(remoteAction)` runs at the sync seam.

## Summary

Phase 3 adds the compiled round schedule, Mega-forme banning, priority cards, mid-draft
swaps and dedicated swap rounds — 49 source files, +8186/-374 against `e663518`. The core
layer is careful and, in the small, correct: the `(value, seq)` comparator is genuinely
total, `apply(SWAP_MADE)` really does replace rather than append, `undo` really does re-fold
rather than reverse, `seq` is never derived from `log.length`, no `Set`/`Map`/`Date` reaches
the document, and the Showdown paste is blank-line separated with exact-equality assertions.
All 794 core tests pass.

The defects are at the seams the tests do not cross.

Two are blockers. The first is an **algorithmic denial of service reachable from an imported
file**: `admitsDistinctRepresentatives` enumerates `2^(players-1)` subsets, its own comment
asserts a bound of 127 iterations that the import guard does not enforce, and a 20-player /
20-round document freezes the main thread for ~10 seconds per card render — measured, not
estimated. At the guard's actual ceiling of 24 that is roughly three minutes. The second is a
**state-machine split between `armedSlot` and `swapArming`** in `app.tsx`: the click handler
reads the raw state while the only disarm control renders off the derived one, and nothing
clears the raw state on undo, abandon, import, or a turn change. The result is a pool the
host cannot pick from, whose only exit is a dialog button labelled for an action that does
nothing.

The warnings cluster around the same theme: `canApply` is careful about `draft/started`'s
order and indifferent about `order/resolved`'s; `handlePlayCard` decides "round complete" by
a length comparison while `canApply` decides it by set membership; the import guard dedupes
player *ids* but not player *names*, and `TurnBanner` then keys on the name. Each on its own
is small. Together they are the same class of gap — one authority checking a fact and a
second reader assuming it.

## Critical Issues

### CR-01: Hall's-condition enumeration is exponential and its stated bound is false — an imported file freezes the tab

**File:** `src/core/cards.ts:224-251` (comment at `:235`, loop at `:236`), reached via
`src/core/selectors.ts:498` (`selectCardOffer`) and `:525` (`selectPlayableCards`);
bounds at `src/core/import-guard.ts:106` (`MAX_ROUNDS = 24`) and `:116` (`MAX_PLAYERS = 64`).

**Issue:**
`admitsDistinctRepresentatives` iterates every non-empty subset of the remaining hands:

```ts
// `count` is bounded by `players - 1`, and the
// import guard caps players, so this is at most 127 iterations.
const subsets = 1 << count;
for (let mask = 1; mask < subsets; mask++) { ... }
```

`127 = 2^7 - 1` assumes `players <= 8`. The import guard caps players at **64** and rounds at
**24**. `cardOffer`'s pigeonhole guard (`cards.ts:181`) short-circuits when `players > rounds`,
so the matching only runs for `players <= rounds <= 24` — but that still admits 24 players,
which is `2^23` subsets **per candidate value**, with up to 24 candidates per play.

Measured on this machine with the exact algorithm transcribed out of the file:

| players = rounds | one `cardOffer` call |
|---|---|
| 8 | 1 ms |
| 12 | 16 ms |
| 16 | 308 ms |
| 20 | **9 793 ms** |

24 extrapolates to roughly three minutes. This is a synchronous main-thread computation
called from a `useMemo` during render (`app.tsx:869-872`) **and** from `canApply`
(`reduce.ts:409`), so it re-runs on every state change.

Reachability is not theoretical. `parseTournamentFile` accepts a document with
`config.rounds: 20`, twenty players, a `pool/built`, a `schedule/compiled` and a
`draft/started` — which is exactly the state `selectPhase` calls `'cards'`. Adopting that
file hangs the tab with no recovery but killing it. Untrusted file input is the one boundary
this project explicitly treats as hostile (`import-guard.ts` header), and this is the one
place a bounded-looking count becomes an unbounded computation.

It is also a direct hit on CLAUDE.md's scale constraint — *"4–8 players by default, must not
break at higher counts"*. Today `ConfigScreen` pins `ROUNDS = 6` so a natively-created
tournament always takes the pigeonhole path; the day rounds become configurable, this breaks
for a legitimate host with no file involved.

**Fix:** replace the subset enumeration with Kuhn's augmenting-path matching, which the
file's own doc block already names as the alternative and which is `O(V·E)` rather than
`O(2^V)`. Roughly forty lines and no new dependency:

```ts
/** Hopcroft-style augmenting path. `hands` are the players still to play, minus `used`. */
function admitsDistinctRepresentatives(
  hands: readonly (readonly number[])[],
  used: ReadonlySet<number>,
): boolean {
  const free = hands.map((hand) => hand.filter((value) => !used.has(value)));
  // value -> index of the player currently matched to it
  const matchedTo = new Map<number, number>();

  const augment = (player: number, seen: Set<number>): boolean => {
    for (const value of free[player] ?? []) {
      if (seen.has(value)) continue;
      seen.add(value);
      const holder = matchedTo.get(value);
      if (holder === undefined || augment(holder, seen)) {
        matchedTo.set(value, player);
        return true;
      }
    }
    return false;
  };

  for (let player = 0; player < free.length; player++) {
    if (!augment(player, new Set<number>())) return false;
  }
  return true;
}
```

Correct the `:235` comment to state the real bound, and add a core test at
`players = rounds = MAX_ROUNDS` with a wall-clock assertion so the bound stays regressable —
`tests/core/cards.test.ts` already has the sub-10 ms precedent, it is simply pinned at a
shape that never reaches the exponent.

---

### CR-02: `armedSlot` and `swapArming` can disagree, and the click handler reads the one the UI does not

**File:** `src/app.tsx:1091` (state), `:1173-1186` (derived), `:1367-1396` (`handlePoolPick`),
`:2185-2203` (confirm), `src/ui/components/PoolGrid.tsx:807-811` (the only disarm control).

**Issue:**
There are two representations of "a slot is armed":

- `armedSlot` — raw component state, set by `armSwap` (`app.tsx:1345`).
- `swapArming` — the derived object, `null` whenever the armed slot no longer holds
  `outMonId` (`app.tsx:1177`).

`PoolGrid` renders the armed heading, the restricted offer **and the `Keep {species}` disarm
button** off `swapArming`. `handlePoolPick` branches off `armedSlot`:

```ts
const handlePoolPick = useCallback((entry, meta) => {
  const current = getState();
  if (armedSlot !== null && current !== null) {
    setConfirm({ kind: 'swap', ... });
    return;
  }
  ...
  handlePick(entry);
}, [armedSlot, entryById]);
```

`setArmedSlot(null)` is called from exactly two places — `disarmSwap` (`:1122`) and
`confirmSwap` (`:1607`). Nothing clears it on undo, on abandon, on import, on a phase change,
or when the turn moves to another player. So `armedSlot !== null && swapArming === null` is
reachable, and in that state the pool renders as an ordinary pick grid with **no disarm
control** while every cell click opens a swap dialog for a slot that no longer exists.

Three routes, all ordinary host behaviour:

1. **Undo.** Arm a slot, then use `Undo last move` repeatedly until the armed pick is gone.
   `swapArming` goes null (`:1177`); `armedSlot` does not.
2. **Abandon / import.** Arm a slot, then `Abandon draft` (or import a different tournament).
   `discardTournament` (`:582-610`) resets `checkpointDismissed`, `filtersCleared`,
   `importFlow`, `confirm` and `screen` — and not `armedSlot`. The next tournament's very
   first pool click opens a swap dialog naming a player id from the tournament that no longer
   exists.
3. **Turn change.** Arm a slot, then undo once. `swapArming` survives (the pick is intact) but
   the clock has moved. The pool pane is now filtered to the *previous* player's slot offer
   while `TurnBanner` names someone else, and confirming dispatches a `swap/made` that
   `canApply` refuses as `notYourTurn` — silently, with no announcement (see WR-06).

The escape is actively misleading. `onSafe` is `closeConfirm` and, by design (`:2199-2201`),
leaves the slot armed — so `Keep {oldSpecies}`, the obviously-safe button, puts the host back
in the loop. Only the *primary* button, labelled `Swap in {species}`, clears `armedSlot`
(`:1607`) — and it performs no swap, because `handleSwap` is rejected.

**Fix:** make the derived value the single authority, and clear the raw state whenever it
stops being valid.

```ts
// 1. handlePoolPick branches on the SAME value the pool renders.
const handlePoolPick = useCallback(
  (entry: RosterEntry, meta: { filtersCleared: boolean }) => {
    const current = getState();

    if (swapArming !== null && armedSlot !== null && current !== null) {
      setConfirm({ kind: 'swap', /* ... */ });
      return;
    }

    setFiltersCleared(meta.filtersCleared);
    setLastMove(null);
    handlePick(entry);
  },
  [swapArming, armedSlot, entryById],
);

// 2. A stale arm is dropped rather than left to be discovered by a click.
useEffect(() => {
  if (armedSlot !== null && swapArming === null) setArmedSlot(null);
}, [armedSlot, swapArming]);
```

Additionally, `swapArming` should require the armed player to still be the one the clock names
— `armedSlot.playerId !== swapPlayerId` is a stale arm too, and route 3 is exactly that case.
`discardTournament` should call `setArmedSlot(null)` alongside its other resets, for the same
reason it already resets `confirm`.

## Warnings

### WR-01: disarming mid-draft drops keyboard focus to `<body>`

**File:** `src/app.tsx:1120-1123` and `:1491-1497`.

**Issue:** `disarmSwap` unconditionally targets the swap panel's pass button:

```ts
const disarmSwap = useCallback(() => {
  focusAfterSwapRoundRef.current = '.swap-panel__pass';
  setArmedSlot(null);
}, []);
```

`SwapPanel` only renders during a dedicated swap round (`app.tsx:2030`). During a **mid-draft**
swap the selector matches nothing, `document.querySelector(...)?.focus()` is a no-op, and the
`Keep {species}` button the host just activated has unmounted (`PoolGrid.tsx:807`) — so focus
falls to `<body>`. That is the exact regression `SplitPanes` and `SchedulePreview` both carry
explicit comments about avoiding.

**Fix:** choose the successor from the state the disarm lands in, the way `handlePassClick`
already does at `:1477`:

```ts
const disarmSwap = useCallback(() => {
  const current = getState();
  focusAfterSwapRoundRef.current =
    current !== null && selectCurrentSwapRound(current) !== null
      ? '.swap-panel__pass'
      : '.pool__grid .mon-card';
  setArmedSlot(null);
}, []);
```

---

### WR-02: "round complete" is a length comparison in the app and a set comparison in the reducer

**File:** `src/app.tsx:456` versus `src/core/reduce.ts:477-481`; guard at
`src/core/import-guard.ts:680-693`.

**Issue:** `handlePlayCard` decides whether to resolve the round by counting:

```ts
const plays = selectCardsPlayedThisRound(after, cardTurn.round);
if (plays.length < after.order.length) return move;
```

`canApply(ORDER_RESOLVED)` decides the same question by membership:

```ts
const played = new Set(selectCardsPlayedThisRound(state, action.round).map((p) => p.playerId));
if (!state.order.every((playerId) => played.has(playerId))) return reject('roundNotComplete');
```

The two agree only while `state.order` holds distinct ids. The import guard's `draft/started`
arm (`import-guard.ts:680`) copies `order` with `copyStringArray` and performs no dedupe —
`canApply` refuses duplicates at origination (`reduce.ts:328`) but `fold` never runs
`canApply`. With `order: ['p1','p1']`, one card play leaves `plays.length (1) < order.length (2)`,
so no resolution is dispatched; on the next render `selectCardTurn` finds every id in
`alreadyPlayed` and returns `null`. The screen then sits in `phase === 'cards'` with no
player on the clock, an empty `CardPanel` hand and **no turn banner at all** (`TurnBanner`
returns `null` at `:136` when `turnLine` is null). Only `Undo last move` gets out.

**Fix:** ask the same question in both places.

```ts
const stillToPlay = new Set(after.order);
for (const play of plays) stillToPlay.delete(play.playerId);
if (stillToPlay.size > 0) return move;
```

and dedupe `order` in `buildLogEntry`'s `draft/started` arm, the way `buildPlayers`
(`import-guard.ts:148-149`) already dedupes player ids.

---

### WR-03: `canApply(ORDER_RESOLVED)` validates nothing about the order it is recording

**File:** `src/core/reduce.ts:472-487`.

**Issue:** The arm checks that every player has played and that the round is not already
resolved. It never checks that `action.order` is a permutation of `state.order` — no length
check, no dedupe, no known-player check. Contrast `DRAFT_STARTED` three arms up
(`reduce.ts:326-329`), which does all three for the same kind of array.

`selectCurrentTurn` indexes straight into that array (`selectors.ts:789`). An
`order/resolved` carrying `['p1','p1']` puts `p1` on the clock for both slots of the round;
`canApply(DRAFT_PICK_MADE)` compares only against `turn.playerId`, so it accepts both. `p2`
never picks, `selectIsComplete` never returns true, and the draft cannot finish.

The file's own posture is that `canApply` exists so *"this build never originates one"* — but
`canApply` is also the gate a future `receive(remoteAction)` runs (ARCHITECTURE: `dispatch`
gains a sibling). Leaving the one array that drives the turn unvalidated is the gap most
likely to be inherited.

**Fix:** mirror `DRAFT_STARTED`'s three checks.

```ts
if (action.order.length !== state.order.length) return reject('unknownPlayer');
if (new Set(action.order).size !== action.order.length) return reject('unknownPlayer');
const known = new Set(state.order);
if (!action.order.every((playerId) => known.has(playerId))) return reject('unknownPlayer');
```

---

### WR-04: `TurnBanner` keys the pick-order list on the player NAME

**File:** `src/ui/components/TurnBanner.tsx:302`; guard at `src/core/import-guard.ts:128-152`.

**Issue:**

```tsx
{pickOrderSegments(pickOrder).map((segment, index) => (
  <Fragment key={segment.name}>
```

`pickOrder` is `pickOrderNames` (`app.tsx:829-834`) — display names, not ids. This is a
direct violation of CLAUDE.md §Identity (*"`id` for every comparison, key, and set membership;
`name` for rendering and export only"*), and it is not merely stylistic: `buildPlayers`
dedupes player **ids** but not player **names**, and `checkFeasibility`'s
`duplicatePlayerName` blocker only runs on the config screen. An imported tournament with two
players called `Ada` produces duplicate Preact keys and mis-reconciled list items on the one
element that is supposed to be scannable from across the room.

**Fix:** carry the id through and key on it.

```tsx
// app.tsx — keep the id beside the name
const pickOrderNames = useMemo<{ playerId: string; name: string }[]>(() => { ... });

// TurnBanner.tsx
<Fragment key={segment.playerId}>
```

---

### WR-05: the round-boundary confirm shows pick-specific copy over a card undo

**File:** `src/core/undo.ts:404` and `:508`, `src/app.tsx:2206-2221`,
`src/ui/confirm-copy.ts:62-72`.

**Issue:** `ROUND_COMPARABLE_KINDS = ['pick', 'card']`, so a `card` removal can set
`crosses: true`. `app.tsx:2206` routes everything that is not `'order'` into
`UNDO_BOUNDARY_CONFIRM`, whose body reads:

> This undoes {playerName}'s **pick** from round {r}, and the draft is currently on round {c}.

For a card play that sentence is a plain untruth, on the surface whose entire job is telling
the host what is about to change — which is the exact argument `undo.ts:265-267` uses to
exclude swaps from this dialog. Reachable only from a hand-edited or imported log (in normal
play a card at the top of the stack always has `removed.round === currentRound`), but the
allow-list deliberately admits `'card'`, so the copy has to cover it.

**Fix:** either drop `'card'` from `ROUND_COMPARABLE_KINDS` (matching the reasoning already
written for swaps and passes), or give the card case its own copy set the way `'order'` has
one. Do not leave the allow-list and the copy disagreeing.

---

### WR-06: a rejected swap or pass is swallowed with no feedback

**File:** `src/app.tsx:363-376` (`handleSwap`), `:393-407` (`handlePass`), `:1597-1621`
(`confirmSwap`).

**Issue:** `handleSwap` returns `dispatch(...).ok` and `confirmSwap` does
`if (!handleSwap(...)) return;` — no announcement, no message, no state change the host can
see. `handlePass` does the same with `return null`. `dispatch` returns a typed
`RejectionReason` (`notYourTurn`, `noSwapsLeft`, `notInPool`, `swapRoundComplete`…) and every
one of them is discarded.

CLAUDE.md §Copy requires that *"errors state the problem and the next action"*. Combined with
CR-02 route 3, the observable behaviour is a confirm dialog that closes and does nothing at
all, which is indistinguishable from a broken button.

**Fix:** announce the refusal.

```ts
const result = dispatch(swapMade({ ... }));
if (!result.ok) {
  announce(swapRefusalCopy(result.reason)); // one sentence per reason, in confirm-copy.ts
  return false;
}
```

At minimum surface `notYourTurn` and `noSwapsLeft`, which are the two a host can act on.

---

### WR-07: `undoLast`'s index fallback would delete `pool/built`

**File:** `src/core/undo.ts:393`.

**Issue:**

```ts
for (let position = indices.length - 1; position >= 0; position--) {
  log.splice(indices[position] ?? 0, 1);
}
```

`?? 0` exists only to satisfy `noUncheckedIndexedAccess`. If it ever fired it would splice
index 0 — which is always `pool/built`, the action `NEVER_UNDONE` exists to protect
(`undo.ts:32`) — silently destroying the pool and every id in it. A defensive default that
corrupts the document is worse than a throw or a bail-out.

**Fix:**

```ts
for (let position = indices.length - 1; position >= 0; position--) {
  const index = indices[position];
  if (index === undefined) return doc;   // unreachable; refuse rather than guess
  log.splice(index, 1);
}
```

---

### WR-08: `selectCurrentRound` and `selectIsComplete` measure against different populations

**File:** `src/core/selectors.ts:323-341` (`selectIsComplete`) and `:349-357`
(`selectCurrentRound`); consumed at `:769-800` (`selectCurrentTurn`).

**Issue:** `selectCurrentRound` divides `picks.length` by `state.order.length`;
`selectIsComplete` requires every entry of `config.players` to hold at least `config.rounds`
picks. The import guard checks neither that `draft/started.order` matches `config.players`
(explicitly, at `import-guard.ts:682-684` — *"a bound is not an integrity check"*) nor that
picks are evenly distributed.

A document where the two disagree — `players × rounds` picks in total but unevenly spread —
leaves `selectIsComplete` false while `selectCurrentRound` clamps to `config.rounds`.
`selectCurrentTurn` then names a player who already holds a full team, `canApply` accepts the
pick (its only slot check is `action.round === turn.round`), and `selectTeams` overwrites
`slots[round - 1]` last-write-wins. The overwritten species is lost from the board while
remaining in `picks`, so it never returns to the pool either.

**Fix:** have `selectCurrentTurn` refuse a turn for a player who already holds
`config.rounds` picks, which closes the hole without changing any legitimate path:

```ts
const playerId = resolved[pickIndex % resolved.length];
if (playerId === undefined) return null;
const held = state.picks.reduce((n, p) => (p.playerId === playerId ? n + 1 : n), 0);
if (held >= state.config.rounds) return null;
return { round, playerId, pickIndex };
```

## Info

### IN-01: `drawPool` computes and exports a value nothing reads

**File:** `src/core/draw.ts:97` and `:177-179`.

**Issue:** `megaEligibleCount` is added to `DrawResult` with a doc block, computed on every
draw, and consumed by no production code — `ConfigScreen` passes `draw.megaCapableCount`
(`ConfigScreen.tsx:1120`, `:1472`) and nothing else reads the new field.

**Fix:** either wire it into `pool/built` (which is where D-11's argument points — it is the
figure that actually answers "can the Mega rounds be filled") or drop it. A derived value with
no reader is a value free to be wrong.

---

### IN-02: three exports with no external consumer

**File:** `src/ui/components/CardFace.tsx:78` (`unplayableLabel`),
`src/ui/components/MonChip.tsx:51` (`swapCellName`), `src/core/undo.ts:93` (`lastPickAction`).

**Issue:** `unplayableLabel` and `swapCellName` are `export`ed and used only inside their own
file. `lastPickAction` is used only by `tests/core/undo.test.ts`. The first two widen the
module surface for nothing; the third is a production export kept alive by a test.

**Fix:** drop the `export` keyword on the first two. Keep `lastPickAction` if the test is the
point, but say so in its doc block — its current comment claims it *"answers a genuinely
narrower question"* without naming a caller that asks it.

---

### IN-03: `opacity: 0.45` is repeated across ten stylesheets, three of them new

**File:** `src/ui/components/CardFace.css:65`, `HandStrip.css:46`, `SchedulePreview.css:86`
(plus seven pre-existing sites).

**Issue:** The dimmed/inert opacity is a design decision spelled as a literal in ten places.
CLAUDE.md §Styling requires tokens for anything the table covers; this one is not in
`tokens.css`, so each new component re-decides it. The convention predates this phase, but
this phase added three more sites.

**Fix:** add `--opacity-dimmed: 0.45;` to `src/ui/tokens.css` beside `--card-min` and
reference it. One edit, and the inert treatment stops being ten independent decisions.

---

### IN-04: `handlePoolPick` drops the filters-cleared flag on the swap path

**File:** `src/app.tsx:1371-1394`, `src/ui/components/PoolGrid.tsx:270-297`.

**Issue:** `PoolGrid.handleActivate` clears the filters and reports `filtersCleared: true`
before calling `onPick`. On the armed-swap branch `handlePoolPick` returns without calling
`setFiltersCleared(meta.filtersCleared)`, so the filters visibly reset while the banner's
`. Filters cleared.` suffix is never spoken. A screen-reader host is told nothing about a
change they cannot see.

**Fix:** hoist `setFiltersCleared(meta.filtersCleared)` above the armed branch — it describes
what `PoolGrid` already did, regardless of which branch runs.

---

_Reviewed: 2026-08-19T23:14:46Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
