---
phase: 03-compiled-rules-priority-cards-swaps
plan: 04
subsystem: core+ui
tags: [mega-eligibility, bans, config-form, widening, aria-disabled, generics, preact]

# Dependency graph
requires:
  - phase: 03-compiled-rules-priority-cards-swaps
    plan: 01
    provides: TournamentConfig.megaFormeBans, MAX_MEGA_FORME_BANS, schema 3
  - phase: 03-compiled-rules-priority-cards-swaps
    plan: 03
    provides: .config-screen__section / __section-heading, the sub-section shape
  - phase: 02-host-configured-draft-night
    provides: the Bans fieldset template, PoolGrid's ban mode, TypeaheadField, BanChipList, FilterBar's inert shape, sprite-src's byRosterId lookup
provides:
  - isMegaEligible — the one Mega-eligibility predicate, with four named consumers
  - megaFormeRows / bannedMegaFormes / choiceFor
  - FilterableEntry and SpriteSubject — the two structural minimums that widen the render path
  - PoolSubject — a Mega forme is a first-class pool cell, chip and combobox option
  - FilterBar.megaInertReason — the Mega control inert with a caller-supplied reason
  - PoolGrid.idPrefix / FilterBar.idPrefix — two grids on one screen without id collisions
  - the Mega-forme bans sub-section inside the Mega rules group
  - CLEAR_MEGA_FORME_BANLIST_CONFIRM
  - the dual-Mega X/Y fixture tripwire
affects:
  [
    03-05 RULE-09 gate and the draw's Mega quota,
    03-06 Mega-round pool filter (second consumer of megaInertReason),
    03-10 swap target filter,
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'A widening is a type PARAMETER constrained to the union, not the bare union — a bare union forces every existing caller to weaken a handler it can never actually receive'
    - 'An inert radio GROUP restores every radio from state, because unchecking only the clicked one leaves a state the value can never express'
    - 'Only the NOUN varies across two copies of one sentence; the sentence is composed once'
    - 'A fixed literal id is a bet that two instances never mount together — write the forward note, then honour it when the bet loses'

key-files:
  created:
    - src/core/mega.ts
    - tests/core/mega.test.ts
    - tests/ui/mega-ban.test.tsx
  modified:
    - src/core/search.ts
    - src/ui/sprite-src.ts
    - src/ui/components/MonCard.tsx
    - src/ui/components/PoolGrid.tsx
    - src/ui/components/TypeaheadField.tsx
    - src/ui/components/BanChipList.tsx
    - src/ui/components/FilterBar.tsx
    - src/ui/components/FilterBar.css
    - src/ui/screens/ConfigScreen.tsx
    - src/ui/screens/ConfigScreen.css
    - src/ui/confirm-copy.ts
    - tests/core/roster/fixtures.test.ts
    - tests/core/search.test.ts
    - tests/ui/sprite-resolution.test.ts
    - tests/ui/pool-filter.test.tsx
    - tests/ui/ban-grid.test.tsx
    - tests/ui/ban-list.test.tsx
    - tests/ui/ban-mode.test.tsx
    - tests/ui/config-screen.test.tsx

key-decisions:
  - 'The widening is a `PoolSubject` type PARAMETER, not a bare `RosterEntry | MegaForme` union — a bare union would have forced six existing call sites to widen handlers that can never receive a forme, weakening four types in exchange for nothing'
  - 'The inert Mega control restores the whole radio group from state on a refused change, because a controlled input that does not re-render leaves the DOM lying'
  - '`PoolGrid.idPrefix` / `FilterBar.idPrefix` — 02-08 wrote the forward note for the day two grids mounted together, and this is that day'
  - '`Dual-Mega species` became an `<h2>` on `.config-screen__section`, and `.config-screen__subheading` was deleted rather than left unused'
  - 'The typeahead and the chip list vary by a NOUN prop, never by a whole-sentence prop, so two surfaces cannot phrase one contract two ways'

patterns-established:
  - 'PoolSubject — the structural union a pool cell, chip and combobox option accept, carried as a constrained type parameter'
  - 'idPrefix — one prefix per mounted instance for every id and radio-group name a component owns'

requirements-completed: [RULE-04]

# Metrics
duration: 35min
completed: 2026-08-18
---

# Phase 3 Plan 04: The Mega-Forme Banlist and Its Predicate Summary

**A host scrolls a capped grid of all 76 Mega formes inside `Mega rules`, bans
`Charizard-Mega-X` by name or by clicking its cell, reads `1 of 76 Mega formes banned` with
`Charizard-Mega-Y` still unpressed, and starts a tournament whose `config.megaFormeBans`
carries that one forme id — while `isMegaEligible` becomes the single answer the RULE-09
gate, the draw, the Mega-round filter and the swap filter will all read.**

## Performance

- **Duration:** 35 min
- **Started:** 2026-08-18T09:18:00Z
- **Completed:** 2026-08-18T09:53:00Z
- **Tasks:** 3
- **Files modified:** 22 (1 source created, 11 source modified, 2 tests created, 8 tests modified)

## Accomplishments

- **Bans are per forme, and one assertion proves it.** `bans one forme and leaves its
  sibling legal` clicks `Charizard-Mega-X` and asserts `Charizard-Mega-Y`'s cell reports
  `aria-pressed="false"`. A species-level implementation passes nearly every other test in
  the file and fails exactly that one — which is the whole of D-09.
- **D-10 ships as behaviour, not as an error state.** `isMegaEligible(charizard, {X banned},
  'x')` is `false` and nothing anywhere reports a problem: the species leaves the Mega rounds
  and stays draftable in an open round. The helper line under the sub-heading is what stops a
  host reading that as a bug, and it is asserted verbatim.
- **The predicate has four named consumers and exactly one definition.** `src/core/mega.ts`
  imports two type-only modules and nothing else, splits no name, and substring-matches no
  id. `tests/core/mega.test.ts` reaches `74` eligible entries with no bans by a route
  completely different from `fixtures.test.ts`'s `megaCapable` count — two independent
  computations of the RULE-09 inequality's right-hand side, pinned equal.
- **A Mega forme renders through the same card, grid, typeahead and chip list a species
  does.** No second render path, no `mode` prop and no "is this a forme" branch anywhere:
  `FilterableEntry` and `SpriteSubject` name the structural minimums, and `PoolSubject`
  carries the widening. `Charizard-Mega-X` announces as `Charizard-Mega-X, Fire Dragon` while
  its base species is Fire/Flying, which is the information a merged two-forme cell would
  have had to hide.
- **The dual-Mega tripwire is in place.** A future regulation that put an `M-Mega`/`F-Mega`
  pair on ONE draftable row would make both X/Y pins exclude both formes and drop the species
  out of the Mega rounds silently. Three assertions in `fixtures.test.ts` now fail loudly
  instead.
- **The `Mega rules` group finally reads as one thing.** All four sub-sections —
  `Megas required per team`, `Round schedule`, `Dual-Mega species`, `Mega-forme bans` — take
  the same `<h2>` on `.config-screen__section`. `deferred-items.md` item 2 is closed.

## Task Commits

1. **Task 1: `isMegaEligible` — one predicate, and the dual-Mega tripwire** — `de2b39d`
2. **Task 2: A Mega forme is a first-class pool cell** — `0aba052`
3. **Task 3: The `Mega-forme bans` sub-section** — `d34688c`

All three are `feat`. Task 1 carried `tdd="true"`; the plan is `type: execute` rather than
`type: tdd`, and the RED/GREEN split was not committed separately — the tests and the module
landed in one commit. Recorded here rather than claimed as a gate sequence that does not
exist in the log.

## Files Created/Modified

- `src/core/mega.ts` — **new.** `isMegaEligible`, `megaFormeRows`, `bannedMegaFormes`,
  `choiceFor`, and the module-private `permittedByChoice`. The doc block carries the four
  consumers by name, D-10's reading as behaviour, the identity rule, and the reason
  `permittedByChoice` has no `M-Mega`/`F-Mega` fallback (a runtime branch would hide the
  data change; the tripwire surfaces it).
- `tests/core/mega.test.ts` — **new.** 20 cases over the committed snapshot. Forme ids are
  READ from the roster, never constructed from a name.
- `tests/ui/mega-ban.test.tsx` — **new.** 20 cases across six groups: the grid, banning, the
  two surfaces, the inert filter, the clear confirm, and Start.
- `src/core/search.ts` — `FilterableEntry` added and exported; the four predicates take it.
  `matchesMega` reads an absent `megaCapable` as not Mega-capable, with the reason in its doc
  block. `matchesFilters`'s body is unchanged apart from the parameter type — the
  round-restriction clause is still 03-06's.
- `src/ui/sprite-src.ts` — `SpriteSubject`. The trap paragraph is intact and gained one line:
  the same map holds every forme id, so a forme resolves through exactly the same lookup.
- `src/ui/components/MonCard.tsx` — `PoolSubject` declared and exported here (the cell is the
  narrowest place all four components can import it from); `MonCardProps<T>`.
- `src/ui/components/PoolGrid.tsx` — `PoolGridProps<T>`, `banSubject`, `idPrefix`,
  `megaInertReason`, and the corrected radio-group-name comment.
- `src/ui/components/TypeaheadField.tsx` — `TypeaheadFieldProps<T>` plus `subject`, the noun
  in `No {subject} matches "{query}".`
- `src/ui/components/BanChipList.tsx` — `BanChipListProps<T>` plus `listName`, the noun phrase
  in `Remove {name} from the {listName}`.
- `src/ui/components/FilterBar.tsx` `.css` — `megaInertReason`, `idPrefix`,
  `restoreMegaControl`, the wrapper carrying `aria-disabled`, the reason rendered with the
  `— ` separator as markup, and `opacity: 0.45` on the group only (never on the reason).
- `src/ui/screens/ConfigScreen.tsx` `.css` — the `Mega-forme bans` sub-section, the
  `megaFormeBans` state and its idempotent write path, the fifth confirm variant,
  `handleStart` recording a fresh copy, `Dual-Mega species` promoted to `<h2>`, and
  `.config-screen__subheading` deleted with a note in its place.
- `src/ui/confirm-copy.ts` — `CLEAR_MEGA_FORME_BANLIST_CONFIRM` and its own plural helper.
- `tests/core/roster/fixtures.test.ts` — the dual-Mega X/Y tripwire, three assertions.
- `tests/core/search.test.ts` — the predicates over a Mega forme, including the Fire/Dragon
  vs Fire/Flying case.
- `tests/ui/sprite-resolution.test.ts` — formes are passed AS THEMSELVES; the synthetic
  `asEntry` adapter is gone, plus two new forme assertions.
- `tests/ui/pool-filter.test.tsx` — five cases for the inert Mega control.
- `tests/ui/ban-grid.test.tsx`, `ban-list.test.tsx`, `ban-mode.test.tsx`,
  `config-screen.test.tsx` — selectors scoped to the surface they are about (see Deviations).

## Decisions Made

- **The widening is a constrained type PARAMETER, not a bare union.** The plan's
  `<interfaces>` says "accept `RosterEntry | MegaForme`", and the bare union was written
  first. It produced six type errors in files the plan does not list —
  `src/app.tsx:1083`, three in `ConfigScreen.tsx`, and two test files — all of the shape
  "`(entry: RosterEntry) => void` is not assignable to `(entry: RosterEntry | MegaForme) =>
  void`". Fixing them by widening each handler would have weakened four call sites' types to
  accept a value they can never receive, and would have edited files the plan's own file list
  excludes. `PoolSubject` as a type parameter satisfies the constraint the plan states, keeps
  every existing narrow handler narrow, and touched exactly the declared files.
  `SegmentedControl<T extends string>` already establishes generic components in this repo.
- **The inert Mega control restores the WHOLE radio group.** The match-all checkbox restores
  itself in one assignment because it is one input; a radio group cannot. Unchecking only the
  clicked radio leaves the group with nothing checked, which `value.mega` can never express.
  The wrapper hears the bubbled `change` after the early return refuses it and re-asserts
  every radio from state — necessary because a refused change moves no state and therefore
  triggers no re-render.
- **`aria-disabled` sits on a wrapper, never `disabled` on the options.**
  `SegmentedControl` already accepts `disabled` per option, and using it would have been
  fewer lines. It is the native attribute wearing an object literal: it takes the group out
  of the tab order, so the reason beside it — the entire point of rendering an unusable
  control — becomes unreachable by the route that most needs it. The wrapper is the smallest
  element containing both the group and its reason, and `SegmentedControl` was not modified.
- **Only the noun varies between two copies of one sentence.** `TypeaheadField.subject`,
  `BanChipList.listName` and `PoolGrid.banSubject` are all nouns. Passing whole strings
  instead would have let the species surface and the forme surface phrase one contract two
  ways, which is the drift `search.ts`'s opening paragraph exists to prevent, arriving on a
  different axis.
- **`.config-screen__subheading` was deleted rather than left unused.** A CSS rule with no
  markup is a rule the next reader wires something to. The comment in its place records what
  the superseded argument was, why four sub-sections make the level real, and what to do if a
  run of controls ever needs a label that genuinely is not one.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `handleStart`'s dependency array omitted `megaFormeBans`**

- **Found during:** Task 3
- **Issue:** The `useCallback` closed over the initial empty array, so a host who banned a
  forme and pressed `Start draft` created a document with `megaFormeBans: []`. Caught by
  `records the list on the created document`, which is the plan's own acceptance criterion —
  every on-screen assertion passed while the document was wrong.
- **Fix:** Added `megaFormeBans` to the array, positioned to match the config literal's
  field order.
- **Files modified:** `src/ui/screens/ConfigScreen.tsx`
- **Verification:** `npx vitest run tests/ui/mega-ban.test.tsx` — 20 passed.
- **Committed in:** `d34688c`

**2. [Rule 3 - Blocking] Two `PoolGrid`s on one screen shared ids and radio-group names**

- **Found during:** Task 3
- **Issue:** `FilterBar` used the fixed literals `pool-search`, `pool-match-all` and
  `pool-mega-filter`, and `PoolGrid` used `pool-density`, on the stated assumption that "two
  `PoolGrid`s are never mounted at once, because the ban grid is on the config screen and the
  pool is on the draft screen". The Mega-forme grid falsified it. Two elements sharing a DOM
  id break `<label for>` — clicking the second bar's label focuses the first bar's input —
  and two radio groups sharing a `name` merge, so choosing a density or a Mega mode in one
  bar silently unsets the other's.
- **Fix:** `PoolGrid.idPrefix` (defaulting to `pool`, so every shipped id is unchanged) and
  `FilterBar.idPrefix` (required, always supplied by `PoolGrid`). The config screen passes
  `mega-forme-ban`. This is precisely the change 02-08's forward note prescribed — "three
  ids, one edit, not three edits discovered one bug report at a time" — and both comments
  were rewritten to say the bet was called rather than left predicting a future that arrived.
- **Files modified:** `src/ui/components/FilterBar.tsx`, `src/ui/components/PoolGrid.tsx`,
  `src/ui/screens/ConfigScreen.tsx`
- **Verification:** `keeps its own control ids, so the species grid below it is untouched`
  asserts one of each id on the screen.
- **Committed in:** `d34688c`

**3. [Rule 3 - Blocking] Four Phase 2 test files selected across both ban surfaces**

- **Found during:** Task 3
- **Issue:** 18 tests failed the moment the second grid mounted. `.typeahead__input`,
  `.pool__count`, `.ban-chip` and `.mon-card` are unscoped in `ban-grid.test.tsx`,
  `ban-list.test.tsx` and `ban-mode.test.tsx`, and the `Mega rules` group renders ABOVE
  `Bans` — so every one of them found the Mega surface first. Not test rot: each assertion is
  correct about the species banlist and simply no longer says which surface it means.
- **Fix:** A `bansGroup()` helper in each file, scoping to the fieldset whose legend is
  `Bans` and falling back to the whole host for the cases that mount `PoolGrid` directly.
  Separately, `config-screen.test.tsx`'s `renders nothing about dual Megas` asserted
  `not.toContain(' Mega forme')`, which is now a substring of `Ban a Mega forme by name`; it
  was rewritten to assert on the dual-Mega ROWS (`input[name^="dual-mega-"]` and the legend
  set), which is what it was always about.
- **Files modified:** `tests/ui/ban-grid.test.tsx`, `tests/ui/ban-list.test.tsx`,
  `tests/ui/ban-mode.test.tsx`, `tests/ui/config-screen.test.tsx`
- **Verification:** `npx vitest run tests/ui/` — 402 passed before `mega-ban.test.tsx`, 422
  after.
- **Committed in:** `d34688c`

**4. [Rule 2 - Missing] Three surfaces needed a noun prop the plan did not name**

- **Found during:** Task 2
- **Issue:** The plan requires `No Mega forme matches "{query}".`,
  `Remove {formeName} from the Mega-forme banlist` and `{n} of {total} Mega formes banned`,
  but `TypeaheadField`, `BanChipList` and `PoolGrid` each hardcoded the species wording. The
  widening alone could not produce the required copy.
- **Fix:** `subject`, `listName` and `banSubject`, all optional, all defaulting to the
  shipped strings so no existing call site changed, and all NOUNS rather than sentences.
- **Files modified:** `src/ui/components/TypeaheadField.tsx`,
  `src/ui/components/BanChipList.tsx`, `src/ui/components/PoolGrid.tsx`
- **Verification:** asserted verbatim in `tests/ui/mega-ban.test.tsx`.
- **Committed in:** `0aba052`

**5. [Rule 2 - Missing] `PoolGrid` had to forward `megaInertReason`**

- **Found during:** Task 2
- **Issue:** `PoolGrid` is the only component that mounts `FilterBar`, so the plan's
  `megaInertReason` had no route from the config screen to the control it governs.
- **Fix:** A documented pass-through, OPTIONAL with a default of `null`. The default is
  load-bearing rather than tidy: `FilterBar` treats any non-null value as a reason, so an
  omitted prop arriving as `undefined` would render the control inert with the reason
  `undefined`. Applying the default once, here, makes that unreachable.
- **Files modified:** `src/ui/components/PoolGrid.tsx`
- **Committed in:** `0aba052`

**6. [Rule 2 - Missing] Two acceptance criteria demanded tests in files the plan does not list**

- **Found during:** Task 2
- **Issue:** "A test asserts `matchesFilters` over a forme matches a type query for the
  forme's own types" and "A test asserts `FilterBar` with `megaInertReason: null` renders no
  `aria-disabled`" have no home in `tests/ui/sprite-resolution.test.ts`, the only test file
  Task 2 names.
- **Fix:** Added to their natural homes — `tests/core/search.test.ts` (the predicates over a
  Mega forme, 3 cases) and `tests/ui/pool-filter.test.tsx` (the inert control, 5 cases).
- **Committed in:** `0aba052`

### Plan Text Not Followed

**The widening is a type parameter, not a bare union.** See Decisions Made, first entry. The
constraint the plan states holds exactly — every one of the five props accepts
`RosterEntry | MegaForme` and nothing else — and the sizing note's test is passed: there is
no second render path, no `mode` prop and no branch on "is this a forme" anywhere in the five
components.

**Three acceptance criteria are unsatisfiable exactly as written and were evaluated on their
intent.** Recorded rather than quietly passed, following 03-03's precedent:

| Criterion | Why it cannot return 0 | Evaluated as | Result |
|-----------|------------------------|--------------|--------|
| `grep -c "includes('mega')" src/core/mega.ts` returns 0 | The same task's `<action>` instructs the doc block to state "`includes('mega')` returns Meganium" | Reworded to "a `mega` substring test returns **Meganium**" — the warning intact, the literal gone | **0** |
| `grep -c "disabled={" src/ui/components/FilterBar.tsx` returns 0 | `aria-disabled={` CONTAINS `disabled={`, and the same file is required to carry `aria-disabled` | `grep -Ec '(^\|[^-])disabled=\{'` — native `disabled` only | **0** |
| `grep -Erc "\b74\b\|\b76\b" src/` returns 0 for every file | Four files carried the figures in PROSE before this plan | The criterion's own stated intent — "no roster figure is hardcoded in source" — read as no LITERAL VALUE | **0 values; 3 prose mentions remain, all pre-existing** |

The third one changed one file: `ConfigScreen.tsx`'s "reaches for 76 forme bans" became "a
full sweep of forme bans", because that file is this plan's to edit and D-17 forbids the
figure in a comment. The three in `import-guard.ts`, `roster/transform.ts` and
`NumericField.tsx` are outside this plan's files and are logged as `deferred-items.md` item 4
rather than swept up.

The same intent reading applies to `grep -Erc "spriteId\}\.png|\$\{.*spriteId" src/` — it
returns 2, both in doc comments that WARN against the construction (`sprite-src.ts:11` and
`roster-source.ts:39`), and both predate this plan. Zero code paths construct a sprite URL
from a slug.

---

**Total deviations:** 6 auto-fixed (1 × Rule 1, 2 × Rule 3, 3 × Rule 2), 1 documented
departure from plan text, 3 acceptance criteria evaluated on intent.
**Impact on plan:** No new dependency, no new render path, no schema change.
`package.json` and `package-lock.json` are byte-identical.

## Issues Encountered

**The known `tests/ui/ban-list.test.tsx` timeout did not reproduce**, at `d34688c` or at any
point during this plan — `npm run verify` reported **1086 passed, 0 failed**. This plan DOES
touch the ban path, so the caution in the brief was checked rather than waved through: the
species ban grid's render cost is unchanged (its `entries` prop, its cell count and its
feasibility recomputation are all untouched), and the only edits inside `ban-list.test.tsx`
are three helper selectors that scope an existing query to a fieldset. The test's 188 clicks
each still perform exactly the work they did before. It stays in `deferred-items.md` as item
1, unchanged.

**Two `PoolGrid`s on one screen keep independent densities.** Discovered while fixing the id
collisions, and deliberately NOT fixed: density lives on each component's own state by
design, and `PoolGrid`'s doc block argues at length against lifting its view state into
`ConfigScreen`. Changing that is an architectural call about where view state lives, not a
correctness fix, and the visible effect is cosmetic. Logged as `deferred-items.md` item 3
with the two candidate resolutions.

## Verification Evidence

`npm run verify` at `d34688c`: `check:pure` 0 violations in 17 files, `check:nohtml` 0
violations in 62 files, **1086 tests passed across 47 files**, typecheck clean on both
projects, `vite build` succeeded, service worker manifest 322 URLs / 964.4 kB precached.

Task 1 acceptance criteria:

| # | Check | Expected | Actual |
|---|-------|----------|--------|
| 1 | `npx vitest run tests/core/mega.test.ts tests/core/roster/fixtures.test.ts` | exit 0 | 60 passed |
| 2 | `npm run check:pure` | exit 0 | 0 violations |
| 3 | `grep -Ec "export function (isMegaEligible\|megaFormeRows\|bannedMegaFormes\|choiceFor)"` | 4 | 4 |
| 4 | `includes('mega')` / `split(` in `mega.ts` | 0 / 0 | 0 / 0 |
| 5 | `grep -Ec "^import" src/core/mega.ts` | 2, both type-only | 2, `./model` and `./roster/types` |
| 6 | `megaFormeRows(ENTRIES).length === 76` | present | `returns every Mega forme on the snapshot` |
| 7 | eligible count with no bans is `74` | present | `counts 74 eligible entries…` |
| 8 | Charizard `'x'` with X banned ineligible, `'either'` eligible | present | `lets a Mega ban beat the X/Y pin` |
| 9 | tripwire deep-equals `['charizard','raichu']`, formes from `{Mega-X, Mega-Y}` | present | `the dual-Mega X/Y assumption (RULE-04)` |
| 10 | no roster figure hardcoded in `src/` | 0 values | 0 values (3 prose, all pre-existing) |

Task 2 acceptance criteria:

| # | Check | Expected | Actual |
|---|-------|----------|--------|
| 1 | `npx vitest run tests/ui/` | exit 0 | 402 passed (422 with the new file) |
| 2 | `npm run check:nohtml` | exit 0 | 0 violations |
| 3 | `grep -c "export interface FilterableEntry" src/core/search.ts` | 1 | 1 |
| 4 | `grep -c "export interface SpriteSubject" src/ui/sprite-src.ts` | 1 | 1 |
| 5 | `grep -c "megaInertReason" …/FilterBar.tsx` | ≥ 3 | 4 |
| 6 | native `disabled={` in `FilterBar.tsx` (see table above) | 0 | 0 |
| 7 | sprite URL from a slug | 0 code paths | 0 (2 warning comments, pre-existing) |
| 8 | `charizardmegax` resolves from `byRosterId`, not the placeholder | present | `resolves a dual-Mega forme to its own art…` |
| 9 | `matchesFilters` over a forme matches its OWN types | present | `matches a type query against the formes own types…` |
| 10 | `megaInertReason: null` renders no `aria-disabled` | present | `renders no aria-disabled at all when there is no reason` |
| 11 | `matchesFilters`'s body unchanged beyond parameter types | present | `git diff` shows the signature only |

Task 3 acceptance criteria:

| # | Check | Expected | Actual |
|---|-------|----------|--------|
| 1 | `npx vitest run tests/ui/` | exit 0 | 422 passed across 24 files |
| 2 | `npm run check:nohtml` | exit 0 | 0 violations |
| 3 | `grep -c "Mega-forme bans" …/ConfigScreen.tsx` | ≥ 1 | 5 |
| 4 | the helper's second sentence, verbatim | present | 1, and asserted in the suite |
| 5 | `grep -c "CLEAR_MEGA_FORME_BANLIST_CONFIRM" src/ui/confirm-copy.ts` | 1 | 1 |
| 6 | `megaFormeRows` present / `\b76\b` absent in `ConfigScreen.tsx` | ≥ 1 / 0 | 4 / 0 |
| 7 | the grid renders 76 cells | present | `renders one cell per Mega forme…` |
| 8 | ban X → `1 of 76 Mega formes banned`, Y not pressed | present | `bans one forme and leaves its sibling legal` |
| 9 | banning the same forme twice leaves one entry | present | `adds one chip for a forme selected twice, not two` |
| 10 | typeahead and grid produce the same list | present | `bans the same forme from the typeahead as from the grid` |
| 11 | `Clear the Mega-forme banlist` absent when empty | present | `is not rendered while nothing is banned` |
| 12 | `config.megaFormeBans` contains the banned id | present | `records the list on the created document` |
| 13 | `grep -Ec "#[0-9a-fA-F]{3,6}" …/ConfigScreen.css` | 0 | 0 |

Plan-level `<verification>`:

- `npm run verify` exits 0 — yes, 1086/1086.
- `git diff --stat package.json` — empty.
- The eligible count with no Mega-forme bans is 74 — asserted in `tests/core/mega.test.ts`.
- Every existing Phase 2 pool, ban and filter test passes. Four files needed selector
  scoping, not assertion changes; the one assertion rewritten (`config-screen.test.tsx`'s
  dual-Mega absence check) asserts the same fact by a stricter route.

## Known Stubs

None. Every surface this plan built is wired end to end: the grid writes state, the state
reaches `TournamentConfig`, and a test reads it back off the created document.

`isMegaEligible` has no consumer in `src/` yet — 03-05, 03-06 and 03-10 are its four call
sites, and the plan's objective says so explicitly. It is a completed contract awaiting its
callers, not a stub: it is fully implemented, fully tested against the real snapshot, and
nothing renders a placeholder in its absence.

## Threat Flags

None. All three mitigations the plan assigned are in place:

- **T-03-13 (Tampering, `sprite-src.ts`).** `SpriteSubject` changed the parameter type only.
  `resolveSpriteFile` still tests the mapped filename against `/^[0-9]+\.png$/`, so the only
  thing that can reach a sprite URL is a run of digits — re-asserted for all 76 formes by
  `resolves every Mega forme to a sprite file that exists on disk`, which now passes the
  forme itself rather than a synthetic entry.
- **T-03-14 (Tampering, `mega.ts`).** Identity is `megaFormes[].id` and the pin compares the
  `forme` field. Asserted by the fixture tripwire and by the `includes` / `split` greps.
- **T-03-16 (DoS, the 76-cell grid).** Accepted as planned: 76 cells in a capped
  `max-height: 60vh` scroll region, a third of the 235 the pool already renders. No
  virtualization.

No new network endpoint, auth path, file access pattern or schema change at a trust boundary.
`src/core/` gained one pure module with two type-only imports.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Ready, and three downstream plans have their contracts.

- **03-05** imports `isMegaEligible` and `choiceFor` for the RULE-09 gate and the draw's Mega
  quota. The measured pre-ban figure is 74; `megaFormeBanSet` on the config screen is the
  shape the gate's own `Set` should take.
- **03-06** is the second consumer of `FilterBar.megaInertReason`, passing
  `Round {r} is a Mega round`. The prop, its restore behaviour, its CSS and its shed-the-ARIA
  test all exist; that plan supplies a string and nothing else. Its round-restriction clause
  still joins at the seam `search.ts` documents — `matchesFilters`'s body was deliberately
  left alone.
- **03-10** reads the same predicate for the swap target filter.

**Carried forward in `deferred-items.md`:** item 1 (the `ban-list` timeout, unchanged and
still not reproduced), item 3 (two grids, two independent densities — new), item 4 (three
roster figures in `src/` comments — new). Item 2 is closed by this plan.

---
*Phase: 03-compiled-rules-priority-cards-swaps*
*Completed: 2026-08-18*

## Self-Check: PASSED

Every file this summary claims exists, and all three commit hashes it cites resolve in
`git log --all`. Checked 2026-08-18 at `d34688c`.
