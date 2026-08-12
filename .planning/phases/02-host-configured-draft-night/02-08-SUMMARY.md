---
phase: 02-host-configured-draft-night
plan: 08
subsystem: the-pool-filter-bar
tags: [one-predicate-chain, roving-tabindex, ephemeral-view-state, debounced-announcement, phase-3-seam]
status: complete

# Dependency graph
requires:
  - phase: 02-01
    provides: "toSearchKey, matchesName, matchesTypes, matchesMega and MegaFilterMode — the four predicates this plan composes and does not reimplement"
  - phase: 02-03
    provides: "SegmentedControl, TYPE_CODES / typeDisplay, the Density union, and PoolGrid's header and data-density root"
  - phase: 02-04
    provides: "TurnBanner with its literals derived from config, and the app.tsx screen router"
  - phase: 02-06
    provides: "SplitPanes, availableEntries — the DRFT-07 removal this filter must not be confused with — and the undo path"
  - phase: 02-07
    provides: "PoolGrid's bannedIds ban-mode branch, which the filter bar renders in as well as out of"
provides:
  - "PoolFilters / CompiledPoolFilters / NO_FILTERS / compileFilters / matchesFilters / hasActiveFilters — the one composed predicate chain, and the Phase 3 round-restriction seam written down in it"
  - "useRovingTabindex — one tab stop over a set of buttons, written and tested for both of its declared consumers"
  - "FilterBar — search, the eighteen-type toolbar, the match-all toggle, the Mega segmented control, Clear filters"
  - "PoolGrid's ephemeral filter state, the filtered count line, and the three empty states"
  - "The D-35 clear-on-commit rule, delivered on the turn announcement rather than beside it"
affects:
  - "phase-03 (a round's pool restriction joins matchesFilters as one field and one clause; no UI file changes)"
  - "the later plan that owns pool-grid keyboard navigation (the hook is generalized for it already)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A hook owns the navigation RULE and takes the DOM MEASUREMENT as an injected function, so the rule stays provable in a renderer that performs no layout"
    - "Ephemeral view state lives in the component both surfaces mount, so reusing the component reuses the state rather than duplicating the predicate call"
    - "One boolean leaves a component through an existing callback rather than a second announcement racing the first"
    - "A live-region repeat is cleared and re-spoken at the one call site that repeats, never by making the shared announcer two-frame for every caller"
    - "An effect that fires on several dependencies asks which one moved before deciding it has news"

key-files:
  created:
    - src/ui/components/FilterBar.tsx
    - src/ui/components/FilterBar.css
    - src/ui/use-roving-tabindex.ts
    - tests/ui/pool-search.test.tsx
    - tests/ui/roving-tabindex.test.tsx
    - tests/ui/pool-filter.test.tsx
    - tests/ui/pool-filter-announce.test.tsx
  modified:
    - src/core/search.ts
    - src/ui/components/PoolGrid.tsx
    - src/ui/components/PoolGrid.css
    - src/ui/components/TurnBanner.tsx
    - src/app.tsx
    - tests/core/search.test.ts
    - tests/ui/ban-grid.test.tsx
    - tests/ui/pool-density.test.tsx
    - tests/ui/turn-banner.test.tsx
  deleted: []

decisions:
  - "RovingTabindex takes a container element type parameter defaulting to HTMLElement, because Preact's RefObject holds a mutable current and RefObject<HTMLElement> is not assignable to the Ref<HTMLDivElement> a div declares"
  - "Cancelling the pending announcement on a pick is necessary and NOT sufficient: the clear is itself a filter change, and a pick with no filters active still moves entries.length — both paths are closed and both are asserted"
  - "The announcement effect asks whether the FILTERS moved, not merely whether a dependency did; entries moving is a pick or an undo and the turn announcement already covers it"
  - "TurnBannerProps.filtersCleared is required rather than optional, which forced five call sites in turn-banner.test.tsx"
  - "Three page-wide test queries were scoped to what they were always about — a pressed CELL, and one control's own radio group"

requirements-completed: [DRFT-08, DRFT-09]

# Metrics
duration: 25min
completed: 2026-08-12
---

# Phase 2 Plan 08: The Pool Filter Bar Summary

**Anyone at the table types `wash` and Rotom-Wash is the only cell left, presses `Water` and
`Flying` to see what is still available in those types, switches the Mega control to
`Non-Mega` to see what is left for the ordinary rounds — and every one of those narrows the
same one predicate chain, on both the draft pool and the config screen's ban grid, without
a second matcher existing anywhere.**

This is the second half of ROADMAP Phase 2 Success Criterion 4. 02-03 delivered the reading
half; before this plan nothing in the application could find anything.

## Performance

- **Duration:** ~25 min
- **Started:** 2026-08-12T15:52Z
- **Completed:** 2026-08-12T16:17Z
- **Tasks:** 3 of 3 — Tasks 1 and 2 TDD (RED then GREEN), Task 3 plain
- **Files:** 16 (7 created, 9 modified, 0 deleted)
- **Tests:** 847 passing across 42 files. **88 added by this plan** — 22 in
  `pool-search.test.tsx`, 18 in `roving-tabindex.test.tsx`, 24 in `pool-filter.test.tsx`,
  12 in `pool-filter-announce.test.tsx`, and 12 appended to `tests/core/search.test.ts`.

## Task Commits

1. **Task 1: search the pool by name, end to end (DRFT-08)** — `2ea01ad` (test) →
   `1059192` (feat)
2. **Task 2: the type toolbar's keyboard model, and the Mega filter (DRFT-09)** —
   `dc4cda6` (test) → `e0e673a` (feat)
3. **Task 3: the filter-result announcement, and the one that must not be overwritten** —
   `7e06105`

No REFACTOR commit was needed on either TDD task — both GREEN implementations were already
the shape the plan specified.

## Accomplishments

- **The composed predicate is additive and provably so.** `src/core/search.ts` gained six
  exports and none of 02-01's four changed signature, body or doc comment — the diff shows
  zero removed export lines. `matchesFilters` contains no matching logic: three calls,
  ANDed. `grep -Ec "split\(|substring|substr"` over the module returns 0, so no name is
  separator-parsed, and the module still has exactly one import.
- **The conjunction is asserted AS a conjunction.** `query: 'rotom'` selects six species,
  `mega: 'mega'` selects the whole Mega partition, and the two together select zero. A
  `matchesFilters` that ORed its clauses, or that quietly dropped one, passes every
  single-clause assertion and fails this one.
- **The Phase 3 seam is written down rather than left to be rediscovered.** One field on
  `PoolFilters` and `CompiledPoolFilters`, one clause in `matchesFilters`, no UI file
  changes — because a round restriction is a rule the compiled schedule imposes rather than
  a preference a host expresses, so it gets no widget. `MegaFilterMode` does not gain a
  fourth member, and the doc block points at where 02-01 recorded that decision.
- **No matching logic reached a `.tsx` file.** `grep -c "toSearchKey"` and
  `grep -c "includes("` over `FilterBar.tsx` both return 0.
- **`hasActiveFilters` ignores `matchAll` on its own, and the omission is pinned.** With
  fewer than two selected types the AND and the OR behaviours are identical, so calling it
  active would put a `Clear filters` button on screen that visibly clears nothing. A test
  asserts both halves — the predicate and the unchanged cell count — so nobody "fixes" it.
- **Eighteen buttons are one tab stop, and the whole two-dimensional rule is proved
  headlessly.** `useRovingTabindex` takes an injected `columns`, so a test passes `() => 4`
  over twelve buttons and asserts every wrap: Down from 1 lands on 5, Up from 1 lands on 9,
  Down from 10 lands on 2. happy-dom performs no layout, so a hook that measured its own
  container would have shipped that behaviour untested.
- **Tab, Enter and Space reach the platform untouched**, asserted directly —
  `event.defaultPrevented` is false and the active index does not move. The six handled
  keys are asserted prevented. A hook that swallowed Tab would trap a keyboard host inside
  the toolbar, which is worse than the eighteen stops it replaced.
- **The active index is clamped where it is read.** Shrinking the set from six items to
  three moves the tab stop to the last surviving item in the same render, with no effect
  correcting it a frame later.
- **D-10's "search and the type filters work in ban mode for free" is now literally true.**
  The bar renders outside 02-07's mode branch, so the config screen's ban grid acquired it
  without `ConfigScreen.tsx` being edited at all. The ban count line follows the filter —
  `1 of 6 banned` with `rotom` typed — which is the property 02-07's own doc block was
  written to preserve.
- **The filter and the pick are provably two mechanisms.** A test named for exactly that
  filters Rotom-Wash out, clears the filter, gets it back and picks it; then picks it and
  shows that clearing the filter does not bring it back. That pair is the only assertion
  that can tell hiding from removal apart.
- **The filter bar cannot overwrite whose turn it is**, and the test that defends it is
  named for the failure a person at the table would notice and be unable to explain. Both
  routes are closed and both are asserted: a pending announcement at the moment of the
  click, and the fresh one the clear itself would schedule.
- **Pitfall 10 is closed at the one call site that repeats it.** Two queries producing the
  same count leave the region committed empty on the debounce tick and holding the sentence
  again one macrotask later. `LiveRegion.tsx` is byte-identical to its base — making
  `announce` two-frame would have made every existing synchronous assertion in 02-03's,
  02-06's and 02-07's suites racy.
- **Filter state reached nothing.** `git diff --stat` against the base is empty for
  `model.ts`, `actions.ts`, `import-guard.ts`, `migrate.ts` and `store.ts`. No action was
  invented, nothing entered the schema, nothing entered `champions-drafter:view`.
- **Runtime dependency count unchanged at two.** `git diff --stat package.json
  package-lock.json` is empty.

## Files Created/Modified

| File | What it does |
|------|-------------|
| `src/core/search.ts` | Six additive exports; the conjunction, the neutral value, and the Phase 3 seam. Still one import, still no ambient identifier |
| `src/ui/use-roving-tabindex.ts` | The navigation rule as arithmetic; injected column count; clamped where the index is read; six keys and no others |
| `src/ui/components/FilterBar.tsx` / `.css` | Search, eighteen type toggles from the closed map, the ARIA-only inert match-all toggle, the Mega control, `Clear filters` |
| `src/ui/components/PoolGrid.tsx` / `.css` | Owns the filter state; two memos; the filtered count line in both modes; three empty states; the D-35 clear scoped to draft mode; the debounced announcement and its cancellation |
| `src/ui/components/TurnBanner.tsx` | One added prop, one composed string, and a rendered `<p>` that never carries the suffix |
| `src/app.tsx` | Holds `filtersCleared`, writes it afresh on every pick, resets it on both undo paths, and records the removal-versus-hiding distinction on `availableEntries` |
| `tests/core/search.test.ts` | 12 added — the neutral value, the conjunction as a conjunction, non-mutation, and the `matchAll` omission |
| `tests/ui/pool-search.test.tsx` | 22 — the field, the count line, the search empty state, D-35, ban mode's exemption, and the filter-versus-pick pair |
| `tests/ui/roving-tabindex.test.tsx` | 18 — both axes, both wraps, the untouched keys, the clamp, and mouse focus |
| `tests/ui/pool-filter.test.tsx` | 24 — the toolbar, both type modes, the inert toggle, the Mega partition, composition, and one-click clearing |
| `tests/ui/pool-filter-announce.test.tsx` | 12 — the debounce, the collapse, the repeat clear, and the ordering guarantee against the real `App` |

## Decisions Made

- **`RovingTabindex` takes a container element type parameter, defaulting to
  `HTMLElement`.** Full argument in Deviation 1. The short version: Preact's `RefObject<T>`
  holds a mutable `current`, so `RefObject<HTMLElement>` is not assignable to the
  `Ref<HTMLDivElement>` a `<div>` declares, and the alternative was a cast at every
  consumer's container — which is a place the wrong element can be attached silently.
  `RovingTabindex` written with no argument is exactly the shape the plan pinned.
- **Cancelling the pending announcement on a pick is necessary and not sufficient.** Full
  argument in Deviation 4. Two further paths reach the same failure and the plan named
  neither: clearing the filters is itself a filter change and schedules a fresh timer, and
  a pick with no filters active still moves `entries.length`. Both are closed, and the
  guard that closes the second — "did the FILTERS move, or did something else?" — is what
  makes the effect's own dependency list honest.
- **The empty state's heading is an `<h3>`, following `BoardGrid`'s `board__empty-heading`.**
  It renders only when a filter is active, so it never appears in ban mode's asserted
  zero-`<h2>` region and never competes with `Pool` on the draft screen.
- **The three empty states were all wired in Task 1 even though only one was reachable**,
  which is what let Task 2 add controls rather than a branch. Each action resets exactly
  the part of the state its sentence blames.
- **The filter pill is not a `TypePill`.** `TypePill` is a `<span>` at the 24px card-pill
  height; 02-UI-SPEC requires a filter pill to be 44 x 44 and says in as many words that
  this is why filter pills do not take that token. The shared thing is `typeDisplay()` —
  the data — which is the only place a drift between the two could actually happen. The
  card-pill height token is referenced nowhere in `FilterBar.css`.
- **The pressed state is a border in `--color-text`, never a hue change.** `tokens.css`
  records that five of the eighteen fills measure between 2.48:1 and 2.97:1 against the
  surface *precisely because* the pressed state is carried by a border. The unpressed
  border is declared `transparent` rather than omitted, so pressing a pill never resizes it.
- **The match-all toggle takes the ARIA-only inert treatment**, deliberately unlike 02-07's
  ban-mode options, which take the native attribute plus the ARIA one. That case's reason
  is static and lives inside the option's own accessible name; this one's is structural and
  already on screen, since the toolbar directly above shows how many pills are pressed. The
  handler's early return — which puts the checkbox back where the state says it is — is
  what keeps the attribute honest, and it is asserted.
- **`TurnBannerProps.filtersCleared` is required.** A default of `false` would let a future
  turn surface silently never announce the clear, which is the class of defect 02-07's
  required `bannedIds` exists to prevent. Cost: five call sites in `turn-banner.test.tsx`,
  each now stating which case it is.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `RefObject<HTMLElement>` cannot attach to any JSX element**

- **Found during:** Task 2
- **Issue:** The plan pins `containerRef: RefObject<HTMLElement>`. Preact's `RefObject<T>`
  is `{ current: T | null }` with a mutable property, so it is checked covariantly:
  `RefObject<HTMLElement>` is not assignable to the `Ref<HTMLDivElement>` a `<div ref=…>`
  declares. `npm run typecheck` failed with
  `Property 'align' is missing in type 'HTMLElement' but required in type 'HTMLDivElement'`.
- **Fix:** `RovingTabindex<T extends HTMLElement = HTMLElement>` and
  `useRovingTabindex<T extends HTMLElement = HTMLElement>(…): RovingTabindex<T>`. The
  default makes `RovingTabindex` with no argument exactly the pinned shape, so nothing
  about the contract narrowed. The rejected alternative was a cast at each consumer's
  container element, which type-checks and silently permits attaching the ref to the wrong
  element.
- **Files modified:** `src/ui/use-roving-tabindex.ts`, `tests/ui/roving-tabindex.test.tsx`
- **Committed in:** `e0e673a`

**2. [Rule 3 - Blocking] Three page-wide test queries this plan legitimately widens**

- **Found during:** Task 2
- **Issue:** Adding real toggles and a second radio group to the pool header broke three
  assertions that measured the whole rendered tree. (a) `ban-grid.test.tsx`'s
  `puts no pressed state on a cell that is not a toggle` counted every `[aria-pressed]` on
  the page — the eighteen filter buttons genuinely ARE toggles. (b) The same file's ban-mode
  twin counted them too. (c) `pool-density.test.tsx`'s `checks exactly the current level`
  counted every checked radio, and `Mega capability` is checked at `All` by default.
- **Fix:** Each query scoped to what the assertion was always about — `.mon-card[aria-pressed]`
  for the two cell assertions, `input[name="pool-density"]` for the radio one — with a
  comment at each site naming what 02-08 added and why an unscoped query would report the
  filter bar working as the older component's regression. Same class 02-07 recorded as its
  Deviation 4, and resolved the same way.
- **Files modified:** `tests/ui/ban-grid.test.tsx`, `tests/ui/pool-density.test.tsx`
- **Committed in:** `e0e673a`

**3. [Rule 3 - Blocking] A required `filtersCleared` forces five call sites outside its task**

- **Found during:** Task 3
- **Issue:** `TurnBannerProps.filtersCleared` is declared required by the plan's
  `<interfaces>`, and `npm run typecheck` fails on every call site that does not pass it.
  `turn-banner.test.tsx` — 02-04's file, not this plan's — mounts the component five times.
- **Fix:** All five updated to `filtersCleared={false}`, with a comment at the first
  recording that this file is about the VISIBLE banner, which is identical either way, and
  pointing at where the suffix is actually asserted. Making the prop optional was rejected
  for 02-07's stated reason about `bannedIds`: a default lets a future surface acquire the
  wrong behaviour silently.
- **Files modified:** `tests/ui/turn-banner.test.tsx`
- **Committed in:** `7e06105`

**4. [Rule 2 - Missing critical] Cancelling the pending timer does not close the failure**

- **Found during:** Task 3
- **Issue:** The plan's mitigation is "cancel the pending timer in `handleActivate` when it
  clears the filters". That alone leaves the announcement able to overwrite the turn by two
  further routes. **(a)** Clearing the filters IS a filter change, so the effect re-runs on
  the very next render and schedules a *fresh* 300ms timer for the cleared state — which
  fires after the cancellation and lands `{total} of {total} Pokémon match.` on top of
  `Round 2 of 6 — Bo picks`. **(b)** A pick with no filters active changes `entries.length`,
  which is one of the effect's declared dependencies, so it would announce a filter result
  for a turn nobody filtered — contradicting the plan's own behaviour bullet that such a
  pick announces the turn with no suffix.
- **Fix:** Two guards, both in the effect. A `suppressNext` ref set by `handleActivate`
  alongside the cancellation, consumed by the run the clear itself triggers — which is
  guaranteed to happen, so it cannot go stale. And a `filtersChanged` check that compares
  the filter object by reference against the previous run: `entries` moving is a pick or an
  undo, and the turn announcement already covers both. Comparing by reference is sound
  because filter state is replaced wholesale and never edited. Both paths are asserted
  directly — one test advances 300ms before the click so an announcement was genuinely
  spoken, another advances only 100ms so a timer is genuinely in flight, and both then
  advance 1000ms and assert the turn string is untouched.
- **Files modified:** `src/ui/components/PoolGrid.tsx`
- **Committed in:** `7e06105`

### Notes

**`FilterBar`'s `density` prop is declared in Task 1's commit and destructured in Task 2's.**
`noUnusedLocals` refuses a binding whose only consumer is the next commit, and the only
thing that reads `density` is the type toolbar's label form. The interface carries it from
the first commit so the contract lives in one place; the comment at the function signature
names what arrives and when. Identical shape to 02-07's `toggleBan`.

**The `after {b} bans` / `{n} other problems` copy defect was left alone, as instructed.**
It is outside this plan's file scope and wants one change covering both instances.
02-07-SUMMARY.md carries the concrete amendment recommendation and this plan does not
disturb it.

### Acceptance-grep artifacts

Three criteria are unsatisfiable as literal counts. Same class 02-07 and 02-06 both
recorded, and resolved the same way: verify the criterion's stated intent.

- `grep -c "useRovingTabindex" src/ui/components/FilterBar.tsx` must return 1. It returns
  **2** — the import line plus exactly one call site. A function cannot be imported and
  called on one line. The intent, "the shared hook rather than a hand-rolled roving
  tabindex", holds exactly: one call site, and no second implementation anywhere.
  Precedent is 02-07's `grep -c "matchesName" TypeaheadField.tsx`.
- `grep -c "disabled=" src/ui/components/FilterBar.tsx` must return 0. It returns **1**,
  because `aria-disabled=` contains the substring the pattern searches for. The intent —
  no native `disabled` attribute — holds: `grep -cE '[^-]disabled='` returns **0**, and
  `grep -c "aria-disabled"` returns exactly 1.
- `grep -c "300" src/ui/components/PoolGrid.tsx` must return at least 1 with the value a
  named module constant. It returns **2**: `const ANNOUNCE_DEBOUNCE_MS = 300` and its
  single use by name. Both halves of the criterion hold.

The plan's `grep -rEc "\b235\b|\b74\b|\b18\b" src/` check finds five pre-existing
doc-comment matches in `view-prefs.ts`, `MonCard.tsx`, `NumericField.tsx`, `TypePill.tsx`
and `type-codes.ts`, all carried forward from earlier plans. **This plan introduced none** —
verified with `git diff bbe1381 HEAD -- src | grep "^+" | grep -E "\b235\b|\b74\b|\b18\b"`,
which is empty. The toolbar's eighteen buttons come from `Object.keys(TYPE_CODES)`.

---

**Total deviations:** 4 auto-fixed (3 blocking, 1 missing critical), plus one sequencing
note and three grep artifacts
**Impact on plan:** No scope change. No requirement, interface contract or design decision
moved. Deviation 4 strengthens the plan's own stated guarantee rather than altering it.

## Deferred Issues

**The residual coverage item this plan was told not to close is still open, and it is not
cheaper than the plan estimated.** 02-UI-SPEC §Interaction & Accessibility Baseline row
"Pool grid keyboard navigation" and §8's "Focus after a pick" remain unbuilt. The plan asked
that the executor say so if the wiring turned out cheap and in scope. **It is not.** Three
things stand between the hook and the grid, and only the first is mechanical:

1. `MonCard` needs `tabIndex` and `onFocus` props — a file claimed by 02-03 and 02-07, and
   one whose prop surface both plans deliberately kept minimal.
2. The `columns()` function has to read the rendered track count off a
   `repeat(auto-fill, …)` grid, which is the one thing happy-dom cannot observe at all. The
   hook is written for that case and tested for it, but the *measurement* would arrive with
   no headless coverage and no way to give it any.
3. "Focus must move to the cell that now occupies that grid position" interacts with D-35:
   a pick clears the filters, so the pool repopulates in the same commit and the cell at
   that position is not the one the contract had in mind. That is a design question, not a
   wiring one, and it wants deciding rather than guessing.

The hook ships generalized for exactly this consumer — two axes, injected measurement,
`focusItem` for restoring focus when the set changes — so the later plan that owns it
inherits a tested rule and spends its budget on the three items above.

Carried from earlier plans and unchanged: the config screen still has no route back to the
landing screen (D2 in `deferred-items.md`), and the `after {b} bans` copy-table amendment
02-07 recommended is still outstanding and is still the only known grammar defect in
shipped copy.

## Known Stubs

**None.** The two gaps 02-07 recorded for this plan are both closed: `FilterBar` and
`use-roving-tabindex` are real, and D-10's "search and the type filters work in ban mode for
free" is now true by construction rather than by prediction — the ban grid's count line
follows a filter, asserted at `1 of 6 banned`.

Nothing new was introduced. `useRovingTabindex`'s `columns` parameter has one caller that
omits it, which is the documented single-axis default rather than an unused branch: its
two-dimensional behaviour is exercised by eighteen assertions in
`tests/ui/roving-tabindex.test.tsx`.

## Threat Model Coverage

Every `mitigate` disposition in the plan's register is implemented.

| Threat ID | Mitigation | Where asserted |
|-----------|-----------|----------------|
| T-02-40 | The host's query reaches the DOM only as a Preact text child — inside a pre-composed empty-state string rendered as a paragraph's child, and as an input's `value` — never as JSX prose and never as markup | `npm run check:nohtml` — 0 violations in 59 files; the empty-state body is asserted by exact string equality with `"zzz"` interpolated |
| T-02-41 | Filter state is a `useState` inside `PoolGrid` and reaches `dispatch` by no path at all | `git diff --stat` against the base is empty for `model.ts`, `actions.ts`, `import-guard.ts`, `migrate.ts` and `store.ts`; `grep -Ec "dispatch\(\|poolFilters\|filters:"` returns 0 in both core files |
| T-02-42 | Accepted, unchanged. Each of the eighteen buttons sets exactly two CSS custom properties from the closed `TYPE_CODES` map; roster data and host input reach neither, and a type with no entry renders no button | `git diff --stat src/ui/type-codes.ts src/ui/components/TypePill.*` is empty; `grep -Ec "'(Water\|Fire\|Dragon)'"` in `FilterBar.tsx` returns 0 |
| T-02-43 | Accepted, unchanged. One `toSearchKey` per change and one bounded pass per entry, in a single `useMemo`. No virtualization, no `content-visibility` | `grep -c "content-visibility"` returns 0 in both stylesheets; `grep -c "key={entry.id}"` returns 1 |
| T-02-44 | Exactly one pending debounce at a time, held in a ref, cleared on every re-run, on unmount, and explicitly on a pick commit — plus the suppression Deviation 4 adds, without which the cancellation is defeated by the clear it performs | `a pick that clears a filter announces the turn, and nothing arrives after it` and `cancels an announcement that was still pending when the pick landed` |
| T-02-45 | Accepted, unchanged. No secret, no network, no storage write, no PII; the query never leaves the tab | — |
| T-02-SC | Accepted, unchanged. Nothing installed | `git diff --stat package.json package-lock.json` is empty |

## Threat Flags

None. This plan adds no network endpoint, no auth path, no new file access pattern and no
schema change. Its one new untrusted-shaped input — the host's own query — is untrusted in
shape only, and its most security-relevant property is an absence: filter state reaches no
action, no reducer, no storage key and no exported JSON.

## Verification

- `npm run verify` exits 0 — `check:pure` (0 violations, 15 files), `check:nohtml`
  (0 violations, 59 files), 847 tests across 42 files, clean build.
- `npm run check:pure:selftest` exits 0.
- `git diff --stat package.json package-lock.json` is empty.
- `git diff --stat bbe1381 HEAD` is empty for `src/core/model.ts`, `src/core/actions.ts`,
  `src/core/import-guard.ts`, `src/core/migrate.ts`, `src/store.ts`, `src/ui/type-codes.ts`,
  `src/ui/components/TypePill.tsx`, `src/ui/components/TypePill.css` and
  `src/ui/components/LiveRegion.tsx` — nine files read as sources of truth, none modified.
- `git diff --diff-filter=D --name-only bbe1381 HEAD` is empty: nothing was deleted.
- Task 1 greps: the three new function exports 3, `NO_FILTERS` 1, imports in `search.ts` 1,
  ambient identifiers 0, name-splitting 0, `toSearchKey` in `FilterBar.tsx` 0, `includes(`
  there 0, `key={entry.id}` 1, `content-visibility` 0 in both stylesheets,
  containing-block properties in `FilterBar.css` 0, raw hex 0, raw px 0, `type="search"` 1,
  the search label 1.
- Task 2 greps: `src/ui/use-roving-tabindex.ts` exists and `src/ui/useRovingTabindex.ts`
  does not, `export function useRovingTabindex` 1, `role="toolbar"` 1,
  `aria-label="Filter by type"` 1, `aria-pressed` 1, `Object.keys(TYPE_CODES)` 1, literal
  type names 0, `aria-disabled` 1, native `disabled` 0, `aria-checked` 0, the card-pill
  height token in `FilterBar.css` 0, raw hex 0, raw px 0.
- Task 3 greps: `ANNOUNCE_DEBOUNCE_MS` declared once and used once by name, `filtersCleared`
  in `TurnBanner.tsx` 3, `Filters cleared.` there 1, `filtersCleared` in `app.tsx` 4,
  `Pokémon match` in `PoolGrid.tsx` 3.
- Three criteria are artifacts of a literal text search; see the section above.

**Not verified by automation:** the plan's manual smoke on `npm run dev` — landing → New
tournament → four players → Start draft → type `wash` and Rotom-Wash is the only cell →
press `Water` and `Flying`, tick `Match all selected types` → Tab from the search field
lands on the toolbar once and the arrow keys move inside it → set `Mega capability` to
`Non-Mega` → pick and every control returns to neutral in the same frame the board cell
fills. Every step is asserted at component level against the real roster, but nothing in CI
drives a browser. Note that the phase's smoke script still names `Landorus`, which 02-07
recorded as absent from the committed roster.

Also unverified headlessly, and belonging at the phase's human-verify checkpoint:

- **Whether the toolbar fits.** 02-UI-SPEC predicts the three-letter row fits one line at
  1109px of pool pane and wraps to two at full density. happy-dom computes no widths, so
  neither is observable here.
- **Whether the arrow keys feel right on a wrapped toolbar.** The bar wraps visually but
  the hook navigates it as one flat sequence, deliberately — `ArrowDown` behaves as
  `ArrowRight`. That is the correct rule for a control the host reads left to right, and it
  is the one decision in this plan whose rightness is a judgement rather than a fact.
- **Whether the pressed border reads as "pressed" at three metres** on the five type fills
  that sit below 3:1 against the surface.
- **Whether the filter bar's second header row crowds the pool pane** at split width, and
  whether it pushes the ban grid's capped scroll region uncomfortably far down the config
  screen — which 02-07 already flagged as materially heavier than it was.

## Issues Encountered

- The worktree spawned at `80d64e3`, several commits behind the required base `bbe1381`.
  HEAD was on the `worktree-agent-*` branch and the tree was clean, so the sanctioned
  `git reset --hard` applied cleanly. This is now the third consecutive plan to hit it.
- The `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'` junction route 02-07 recorded worked
  first time again. Worth keeping in the phase notes verbatim. No package was installed and
  no manifest was touched.
- `vi.advanceTimersByTime(0)` does not run a `setTimeout(…, 0)` scheduled during the
  preceding advance. The repeat-clear assertion needed `advance(1)`. Worth knowing before
  anyone writes a second zero-delay macrotask test.
- Deviation 4 was found by asking what the effect's dependency list actually implies, not
  by a failing test — the plan's own acceptance criteria would have passed against the
  weaker implementation, because none of them picks with no filter active AND then advances
  the clock. Both cases are now covered.

## User Setup Required

None — no external service configuration required.

## Next Plan Readiness

Ready. This is the last plan in Phase 2. The seams the next phase inherits:

- **`matchesFilters` is the round-restriction seam**, and its doc block states the shape:
  one field on `PoolFilters` and `CompiledPoolFilters`, one clause in the function, no UI
  file changes, and no fourth `MegaFilterMode` member. A Phase 3 planner should find that
  before they find the union.
- **`useRovingTabindex` has one consumer and is written for two.** The second is the pool
  grid, and the three things standing in the way are enumerated under Deferred Issues rather
  than left to be rediscovered.
- **`PoolGrid` now owns two pieces of ephemeral view state**, density and filters, and both
  travel with the component to whichever screen mounts it. A third surface that mounts it
  gets both for free and neither needs lifting.
- **The live region's repeat limitation is now half-solved.** `LiveRegion`'s doc block still
  says no surface in this phase repeats a message, and that sentence is now false — the
  filter bar does, and it handles the repeat itself. Whoever adds the third repeating
  surface should either copy that call-site pattern or promote it, and should correct
  `LiveRegion`'s doc block in the same change that makes it true again. **This is the one
  stale comment this plan knowingly leaves behind**, because rewriting it would mean editing
  a file the plan's verification requires to be byte-identical.

## Self-Check: PASSED

- All 7 claimed created files and all 9 modified files exist and are tracked by git;
  `git diff --name-status bbe1381 HEAD` lists exactly those sixteen and nothing else.
- All five task commits resolve in `git log`: `2ea01ad`, `1059192`, `dc4cda6`, `e0e673a`,
  `7e06105`.
- `git diff --diff-filter=D --name-only bbe1381 HEAD` is empty: nothing was deleted.
- `git diff --name-only bbe1381 HEAD -- .planning` is empty at the time of writing —
  `STATE.md`, `ROADMAP.md` and `REQUIREMENTS.md` are untouched, because the orchestrator
  owns those writes after the wave merges. The ids this plan completes are in
  `requirements-completed` above.

---
*Phase: 02-host-configured-draft-night, plan 08*
*Completed: 2026-08-12*
