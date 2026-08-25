---
phase: 04-blind-and-snake-bans
plan: 08
subsystem: ui
tags: [preact, discriminated-union, css-grid, accessibility, secrecy, board]

# Dependency graph
requires:
  - phase: 04-blind-and-snake-bans
    provides: "04-04's `selectBanOrder` and `selectBanTurn` — the serpentine and the cell it points at"
  - phase: 04-blind-and-snake-bans
    provides: "04-05's `BanStageScreen`, its snake arm and its empty board pane"
  - phase: 04-blind-and-snake-bans
    provides: "04-06's wiring of the pool pane, and the `topBar` prop bag its screen actually carries"
  - phase: 02-draft-core
    provides: "`BoardGrid`'s cell classes and `--board-label-w`; `MonChip`'s `showName` inversion rule"
provides:
  - "`BanBoard` — a two-arm discriminated union on `mode`, whose blind arm carries `{ playerName, entered }` and no species id"
  - "`BanBoard.css` — the board geometry over the shared `--board-label-w`, no literal label width"
  - "The snake board pane: rows in starting order, one column per pass, the next cell marked"
  - "`--board-label-w` promoted to `:root`, still declared once, so a second board can read it"
affects: [04-09 blind locked, 04-11 reveal]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A discriminated union as a secrecy control — the arm that renders during the secret half receives no field that could carry a species, so the leak is unrepresentable rather than reviewable"
    - "`@ts-expect-error` as the assertion for a compile-time guarantee, because a props widening changes nothing on screen and would break no rendering test"
    - "One accessible sentence per row, with both visible halves hidden from assistive technology — `MonChip`'s alt inversion, one rung up"
    - "Reuse a sibling component's cell classes rather than restating them, so one visual pattern has one definition"

key-files:
  created:
    - src/ui/components/BanBoard.tsx
    - src/ui/components/BanBoard.css
    - tests/ui/ban-board.test.tsx
  modified:
    - src/ui/components/BoardGrid.css
    - src/ui/screens/BanStageScreen.tsx
    - src/ui/screens/BanStageScreen.css
    - tests/ui/ban-stage.test.tsx
    - tests/ui/ban-list.test.tsx

key-decisions:
  - "Both arms built in one plan, in one file: the two halves of assertion S2 cannot live in two files and still be one guarantee"
  - "`showName: boolean` on the public arm rather than the plan's `density: PoolDensity`, which names a type this repository does not have — the shipped board's prop, decided by the composition root"
  - "`--board-label-w` promoted from `.board__grid` to `:root`, still one declaration in `BoardGrid.css`: a custom property on `.board__grid` cannot be read by a second board, and the alternative was writing the number twice"
  - "The draft board's `.board__cell*` classes are reused rather than copied, so the dashed empty slot and the accent next-cell mark have one definition across both boards"
  - "An unresolvable species id renders as an empty cell rather than as raw text: `BanBoard` takes resolved entries rather than ids, which is exactly what keeps its blind arm incapable of holding a species"
  - "No cap, no warning and no gate for a large `bansPerPlayer`, asserted by a test so the omission reads as deliberate"

patterns-established:
  - "The props ARE the defence: when a rule is about what a component may not show, express it as a field the component does not have"
  - "A negative requirement gets an executable test, not a comment — the twelve-pass case is the record that no cap exists"

requirements-completed: [BAN-03, BAN-04]

# Metrics
duration: ~25min
completed: 2026-08-25
---

# Phase 4 Plan 08: The Ban Board, In Both Arms Summary

**The room can read the whole ban round off the shared screen — Ada took one in pass 1, Sam took one in pass 2, and Cy is next — and the same component's blind arm is structurally incapable of naming a species, because its props carry none.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-08-25T02:41Z
- **Completed:** 2026-08-25T03:06Z
- **Tasks:** 2, both TDD (RED → GREEN)
- **Tests:** 1865 passing, 22 of them new (14 on `BanBoard`, 8 on the board pane)

## What Was Built

### Task 1 — `BanBoard`, and the union that is the leak defence

`BanBoardProps` is a discriminated union on `mode`. The `'public'` arm takes resolved
`RosterEntry` values, a pass count, the cell to fill next, `showName` and `spriteMeta`. The
`'blind'` arm takes `{ playerName, entered }[]` and **nothing else** — no cells, no entries,
no sprite metadata, no id of any kind.

That is `04-UI-SPEC` assertion S2 made structural. The component doc block says so in the
imperative, because the failure mode is a well-meaning contributor merging the two arms into
one props type with optional fields: it would compile, it would look tidier, nothing on
screen would change, and the only guarantee the blind stage has would be gone.

The guarantee is asserted where it lives. `tests/ui/ban-board.test.tsx` carries two
`@ts-expect-error` directives — one supplying `cells` to a blind row, one supplying
`spriteMeta` to the blind arm — and both are checked by `tsc --noEmit`, which `npm run build`
runs first. Widening the props turns each into an unused-directive error, so the build fails
on the file that explains why. `vitest` cannot see either of them, and that is the point.

The public arm reuses the draft board's `.board__cell`, `--empty`, `--filled` and `--next`
classes, so the dashed empty slot and the accent-bordered next cell have one definition
across both boards. Headers read `Pass {n}` and the word `Round` appears nowhere in the
output — asserted over the whole rendered text, not just the headers.

Blind rows carry one accessible sentence each, with both visible halves marked
`aria-hidden`, so a name is never announced twice. The negative case inverts: the room reads
`Not yet`, a screen reader hears `not yet entered`, because two words with no verb are not a
sentence.

Neither arm is a control. No buttons, no anchors, nothing in the tab order, and no `grid`,
`row` or `gridcell` semantics invented — asserted across both arms in one loop.

### Task 2 — the snake board pane

`BanStageScreen`'s board pane, which 04-05 deliberately left empty for this plan, now maps
selector output into the public arm and owns no rule:

- **Rows** are `state.order` — the starting order the serpentine itself is built from, so the
  board's rows and its columns agree by construction.
- **Cells** are a lookup: the placement matching `(playerId, pass)`, resolved to an entry by
  `id`. Never by name, never by taking a name apart.
- **`nextCell`** is `selectBanTurn`'s two ids turned into two positions, and `null` when the
  order does not contain the player on the clock — which only a hand-edited document
  produces, and where an unmarked board is the honest answer.
- **Empty state** `No bans yet. {firstPlayerName} bans first.`, named from
  `selectBanTurn` rather than `order[0]` so the sentence and the turn banner above it cannot
  disagree about who is first.

The load-bearing test is the undo. The board is a fold of the log, so removing the last
placement moves the marked cell back and empties the filled one with no board-specific
bookkeeping anywhere. A pane that kept its own state would pass every other test in the file
and fail that one.

**No scroll container, no cap, no warning and no gate** for a large `bansPerPlayer`. A test
renders twelve passes as twelve columns; that omission is `04-UI-SPEC` §Deferred's explicit
instruction and it is now recorded in executable form so nobody adds one reflexively.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `PoolDensity` is not a type this repository has**

- **Found during:** Task 1
- **Issue:** The plan's `<interfaces>` block declares `density: PoolDensity` on the public
  arm. No such type exists in `src/`. The nearest thing, `Density` in
  `src/adapters/view-prefs.ts`, is `'minimal' | 'standard' | 'full'` — the POOL grid's
  density (D-31), which by design never reaches the board at all. The behaviour the plan
  actually specifies is "`showName={false}` at `split` and `true` at `board-full`", which is
  a pane state, not a density.
- **Fix:** The public arm takes `showName: boolean`, byte-identical to `BoardGridProps`'s
  shipped prop, and the composition root decides it with `pane === 'board'` — the same
  expression `src/app.tsx:2291` already uses for the draft board. One implementation of
  D-21 rather than two.
- **Blast radius:** none for 04-09, which mounts the **blind** arm and never sees this field.
- **Files modified:** `src/ui/components/BanBoard.tsx`
- **Commit:** `8f52caf`

**2. [Rule 3 - Blocking] `--board-label-w` was unreadable outside `.board__grid`**

- **Found during:** Task 1
- **Issue:** The plan requires `BanBoard.css` to reference `var(--board-label-w)` and to
  declare no literal label width, and its `key_links` names `BoardGrid.css` as the source.
  But the property was declared **on `.board__grid`**, so it reached that element's own
  subtree and nothing else. `BanBoard` is a sibling tree: the reference would have resolved
  to nothing and silently collapsed the whole `grid-template-columns` declaration. The only
  alternatives were a fallback literal or a second declaration, both of which are the drift
  the plan exists to prevent.
- **Fix:** promoted the declaration from `.board__grid` to `:root`, **still inside
  `BoardGrid.css`**, with the reasoning written beside it. One declaration, two readers. It
  was deliberately not moved into `tokens.css` — this is one layout's geometry rather than a
  value the token table covers, and `BoardGrid.css` is where its justification already lives.
- **Files modified:** `src/ui/components/BoardGrid.css` (outside the plan's `files_modified`)
- **Commit:** `8f52caf`

**3. [Rule 3 - Blocking] the 188-ban gate test was passing on luck**

- **Found during:** Task 2 verification
- **Issue:** `tests/ui/ban-list.test.tsx`'s "survives 187 bans at eight players" case is 188
  typeahead selections, each re-rendering a 235-entry config screen against the real
  committed roster. It lands either side of vitest's 5-second default depending on how many
  suites share the worker pool. Adding eight tests to `ban-stage.test.tsx` tipped it over —
  measured at 5964ms — and `npm run verify` went red. It passes in isolation, and the main
  checkout's suite (1843 tests) passes, which is what identified the cause as contention
  rather than anything this plan changed in behaviour.
- **Fix:** an explicit 30s timeout on that one test, which is what vitest's own timeout
  message recommends. Deliberately generous rather than snug — a bound tuned to this machine
  is the same defect again. The alternative was a suite whose green depends on how many other
  tests exist.
- **Files modified:** `tests/ui/ban-list.test.tsx` (outside the plan's `files_modified`)
- **Commit:** `4c2aa39`

### Stale worktree base — the confirmed phase hazard fired again

This worktree forked from `93f20ad`, a **Phase 3** commit, rather than from the phase base
`e9aecda`. That is the fifth Phase 4 worktree to do so and the assertion in the executor
brief caught it before any work began; `git reset --hard e9aecda` corrected it, and the two
required post-reset checks (`BanStageScreen.tsx` present, `selectPublicBanIds` referenced in
it three times) both passed. No work was lost and nothing was rebuilt.

## Verification Notes

`npm run verify`'s four gates all pass, run individually against the main checkout's binaries
with this worktree as cwd:

- `check:pure` — 0 violations in 18 files under `src/core`
- `check:nohtml` — 0 violations in 69 files under `src`
- `vitest run` — **56 files, 1865 tests, all passing**
- `tsc --noEmit` + `vite build` + `build-sw-manifest` — clean; 322 URLs precached
- `git diff --stat package.json` — empty. This plan installs nothing.

Every acceptance grep in the plan returns its required value:

| Check | Required | Actual |
|-------|----------|--------|
| `var(--board-label-w)` in `BanBoard.css` | ≥ 1 | 1 |
| `176px\|[0-9]+px` in `BanBoard.css` | 0 | 0 |
| `font-size\|font-weight\|#hex` in `BanBoard.css` | 0 | 0 |
| `role="grid\|row\|gridcell"` in `BanBoard.tsx` | 0 | 0 |
| `use-roving-tabindex` in `BanBoard.tsx` | 0 | 0 |
| `tabindex\|tabIndex\|onClick` in `BanBoard.tsx` | 0 | 0 |
| `@ts-expect-error` in `ban-board.test.tsx` | ≥ 1 | 3 (2 directives + 1 prose reference) |
| `selectBanTurn` in `BanStageScreen.tsx` | ≥ 1 | 5 |
| `bansPerPlayer > 8\|too many passes\|tooManyPasses` in `BanStageScreen.tsx` | 0 | 0 |
| `font-size\|#hex\|[0-9]+px` in `BanStageScreen.css` | 0 | 0 |
| `overflow-x\|overflow: auto` in `BanStageScreen.css` | 0 | 0 |

### One verification criterion reads differently than it was written

The plan's `<verification>` asks that `grep -rn "176px" src/ui/components/` return **only**
`BoardGrid.css`. It returns `BoardGrid.css` plus two **pre-existing Phase 3 comments** —
`HandStrip.css:6` and `:13`, which cite the 176px label column while explaining the hand
strip's layout budget, and `TeamStrip.tsx:91`, which does the same. None is a declaration.
The criterion's stated intent — "the label width has one declaration" — holds exactly: the
sole declaration is `BoardGrid.css:41`. Those comments predate this plan and are out of its
scope, so they were left alone rather than edited to satisfy a grep.

## Known Stubs

None introduced. The stub this plan was written to remove — `board={null}` in
`BanStageScreen` — is gone.

`BanStageScreen`'s `'blindLocked'`, `'blindEntry'` and `'reveal'` arms still return `null`.
Those are 04-05's documented stubs, each with a written reason and an owning plan (04-09,
04-10, 04-11), and they are unchanged by this work.

## Notes for 04-09 and 04-11

**Mount the blind arm, never the public one.** The union protects the blind arm by giving it
no field that can carry a species; it does **not** stop a caller mounting `mode="public"`
during blind, which is a legitimate configuration for snake and would be a full leak in
blind. The locked state's board is `<BanBoard mode="blind" rows={…} />` and nothing else.
`04-UI-SPEC` §4 puts a `Players` sub-heading above it at `--text-heading`; that heading
belongs to the locked screen, not to this component.

**The blind rows already carry their own accessible sentences.** Do not add a second label
around them, and do not repeat the player's name in surrounding copy expecting it to be
announced once — the visible name is `aria-hidden` and the sentence is the whole row.

**`--board-label-w` is now a `:root` property.** Any third board reads it directly; nothing
needs to be nested inside `.board__grid` to see it.

## Threat Flags

None. No network endpoint, auth path, file-access pattern or schema change was added. Player
names and species names render as escaped text children, which `check:nohtml` enforces
(T-04-37, accepted). T-04-35 and T-04-36 are both mitigated as the register specifies —
the first by the union and its two `@ts-expect-error` directives, the second by the undo
test.

## Self-Check: PASSED

All created files exist on disk and all five commits are reachable from `HEAD`. See the
verification block below.
