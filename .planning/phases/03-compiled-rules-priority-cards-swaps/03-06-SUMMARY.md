---
phase: 03-compiled-rules-priority-cards-swaps
plan: 06
subsystem: core+ui
tags: [mega-round, pool-filter, round-restriction, export, mega-stone, inert-aria, adoption-notice]

# Dependency graph
requires:
  - phase: 03-compiled-rules-priority-cards-swaps
    plan: 05
    provides: the RULE-09 gate and drawPool's eligible-species quota, which make an empty Mega offer unreachable for documents this build creates
  - phase: 03-compiled-rules-priority-cards-swaps
    plan: 04
    provides: isMegaEligible, choiceFor, config.megaFormeBans, FilterBar.megaInertReason, FilterableEntry
  - phase: 03-compiled-rules-priority-cards-swaps
    plan: 02
    provides: selectSchedule / selectRoundKind / selectSlotKind, and the schedule/compiled action
  - phase: 01-roster-and-walking-skeleton
    provides: PasteSlot.megaStone, toShowdownPaste, declaredStone
provides:
  - PoolFilters.restrictTo / CompiledPoolFilters.restrictTo — the round's rule as a composed clause
  - FilterableEntry.id — the only field the restriction clause compares
  - selectRoundEligibleIds — the offer the edge consults before dispatching
  - selectSlotStone — D-04, the slot's answer to which stone an export carries
  - legalMegaForme — the unbanned-and-permitted conjunction, written once
  - PoolGrid.roundRestriction — kind, round and ids in one prop
  - the Mega-round count form, restriction sentence and three empty states
  - the schedule-violation adoption notice
affects:
  [
    03-08 priority cards (the pool pane it hands back to),
    03-10 swap target filter (both selectors, second consumer),
    03-11 swap rounds (the empty-offer state a degenerate config reaches),
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'A rule the schedule imposes is composed into the predicate, never held in the state a Clear button resets'
    - 'A forced `{n} of {total}` form is only worth forcing when `{total}` is the unrestricted set — narrowing upstream makes the two numbers equal and the form silent'
    - 'An empty state with no action, because the only action anyone could add to it is the one the design forbids'
    - 'One prop carrying kind + subject + data, so the invalid combinations are unrepresentable — the shape `bannedIds` already uses in the same file'

key-files:
  created:
    - tests/ui/mega-round.test.tsx
  modified:
    - src/core/search.ts
    - src/core/selectors.ts
    - src/core/mega.ts
    - src/ui/components/PoolGrid.tsx
    - src/ui/components/PoolGrid.css
    - src/app.tsx
    - src/ui/screens/CompletedDraft.tsx
    - tests/core/search.test.ts
    - tests/core/selectors.test.ts
    - tests/ui/completed-draft.test.tsx

key-decisions:
  - 'The pool is narrowed by COMPOSING restrictTo, not by pre-filtering the entries prop — 03-UI-SPEC §9 forces `{n} of {total}` during a Mega round, and a pre-filtered array leaves n === total with nothing to say'
  - 'restrictTo is applied from the prop on every compile and never stored in filter state, so Clear filters, the three empty-state resets and D-35 clear-on-pick cannot reach it'
  - 'An empty Mega offer renders an empty state with NO action button — the only button anyone could add there is the widen-the-offer button RESEARCH Open Question 2 rules out'
  - 'legalMegaForme is exported from mega.ts and isMegaEligible becomes a `!== null` over it, rather than selectors.ts re-writing the unbanned-and-permitted conjunction'
  - 'CompletedDraft takes the FOLD and the roster in place of a teams record — the stone and the species it belongs to must be resolved from one copy'
  - 'The schedule-violation notice is the THIRD role="status", not the second: feasibility, roster drift and this one are three unrelated facts'
  - 'A pick naming a species the roster no longer carries is skipped by that notice, because accusing a regulation rotation of breaking a rule sends the host to the wrong screen'

patterns-established:
  - 'restrictTo — a schedule-imposed clause that composes with the host filters and that no reset path can reach'
  - 'MegaRoundRestriction — kind, round and ids as one prop, so an open round carrying eligibility data is unrepresentable'

requirements-completed: [RULE-03]

# Metrics
duration: 28min
completed: 2026-08-18
---

# Phase 3 Plan 06: The Mega Round's Pool and the Slot That Decides the Export Summary

**Round 1 of a two-Mega tournament opens with `8 of 24 available` and
`Round 1 is a Mega round — only Pokémon that can still Mega are shown.` beside it, the
`Mega capability` control inert with `— Round 1 is a Mega round` and shedding that ARIA the
moment round 3 arrives, search and the eighteen type filters composing with a restriction
`Clear filters` cannot reach — and the finished team exports
`Venusaur @ Venusaurite\n\nKommo-o\n\nFarfetch'd\n` from a Mega slot while the same
Mega-capable species exports bare from an open one.**

## Performance

- **Duration:** 28 min
- **Started:** 2026-08-18T14:52:00Z
- **Completed:** 2026-08-18T15:20:00Z
- **Tasks:** 3
- **Files modified:** 11 (7 source, 3 test modified, 1 test created)

## Accomplishments

- **The offer is constrained, so an illegal pick is unreachable rather than rejected.**
  This is the plan where "the compiler deliberately removes runtime validation" is cashed
  in. `selectRoundEligibleIds` is the pure selector the edge consults, `canApply` gains no
  eligibility arm, `apply` gains no rule check, and `selectTeams` is not filtered — the
  board still shows what the log says. All four of those non-changes are recorded in the
  selector's own doc block so the next reader finds the argument before the absence.
- **`Clear filters` cannot switch off a rule, and three separate mechanisms agree on it.**
  `hasActiveFilters` excludes `restrictTo` (pinned by test), `PoolGrid` never puts the
  restriction into filter state so every reset path misses it structurally, and the
  `Clear filters` button is asserted absent during an unfiltered Mega round. Any one of
  those alone would be a comment; together they are the guarantee.
- **The count line says something.** `8 of 24 available` with `{total}` the whole leftover
  pool is the number that makes a short grid legible. Narrowing the `entries` prop upstream
  — which the plan's action text suggested — would have produced `8 of 8 available`, and
  03-UI-SPEC's insistence on forcing the `of` form would have bought nothing. See
  Deviations.
- **An empty Mega round is explained, and the explanation has no button.** RESEARCH Open
  Question 2 resolved as the plan required: `No Pokémon can Mega here` with the round named
  and zero cells rendered. The empty state carries no action at all, because the only
  action anyone could put there is the widen-the-offer button the whole phase exists to
  make impossible.
- **The slot decides the stone, and the test proves it from the slot side.** Venusaur can
  Mega, and the same species with the same roster entry exports `Venusaur @ Venusaurite`
  from a Mega slot and `Venusaur` from an open one — two whole-paste equality assertions
  over one fixture. `paste.ts` is byte-identical: Phase 1 shipped `PasteSlot.megaStone` for
  exactly this caller.
- **A document whose picks disagree with its own schedule is reported and left alone.** A
  third `role="status"` notice names the count and the next action, repairs nothing, and
  fires on neither a legal pick in an open round nor a species the roster has dropped.
- **WR-04's second consumer needed no second mechanism.** 03-04 built
  `FilterBar.megaInertReason` with the early-return, restore-the-radios and shed-the-ARIA
  shape; this plan supplies a string and resolves two disjoint callers to one value in
  `PoolGrid`. `FilterBar.tsx` is byte-identical.

## Task Commits

1. **Task 1: The round restriction composes, and the slot decides the stone** — `81d5a61`
2. **Task 2: The pool during a Mega round** — `25a6f7c`
3. **Task 3: The slot decides the export** — `c7dd8b8`

Task 1 carried `tdd="true"`. The plan is `type: execute`, so the RED/GREEN split was not
committed separately — a RED commit would have left `npm run typecheck` failing, which
CLAUDE.md's "run `npm run verify` before every commit" forbids. RED was observed and
recorded rather than claimed as a gate sequence that does not exist in the log, following
03-04's and 03-05's precedent: the new `restrictTo` suite failed 8 assertions against the
old `search.ts` (the field did not exist), and every `selectRoundEligibleIds` /
`selectSlotStone` case failed to import against the old `selectors.ts`.

## Files Created/Modified

- `src/core/search.ts` — `restrictTo` on `PoolFilters` and `CompiledPoolFilters`, carried
  through `compileFilters`, and one clause in `matchesFilters` placed FIRST because it is
  the one thing there that is not the host's to change. `FilterableEntry` gained `id` (see
  Deviations). The Phase 3 seam paragraph now records that the seam was taken up rather
  than predicting it, and says why the restriction is composed rather than pre-applied.
  `hasActiveFilters`' doc block gained the second omission beside `matchAll`'s.
- `src/core/selectors.ts` — `selectRoundEligibleIds` and `selectSlotStone`, a private
  `entriesById` helper carrying the "the roster is ambient data the core receives" note,
  and doc blocks carrying the four non-changes and D-04 in the words a reader needs them.
- `src/core/mega.ts` — `legalMegaForme` exported and `isMegaEligible` reduced to a
  `!== null` over it; the module header names the fifth consumer.
- `src/ui/components/PoolGrid.tsx` `.css` — the `roundRestriction` prop and its
  `MegaRoundRestriction` type, the composed `restrictTo`, the forced count form, the
  restriction sentence, five new copy composers, an `EmptyState` shape whose `action` is
  nullable, and the two-disjoint-callers resolution for `megaInertReason`.
  `.pool__restriction` at `--text-body` in `--color-text`, with the reason for not using
  the muted label beside it.
- `src/app.tsx` — `roundRestriction` and `scheduleViolations` memos, the third
  `role="status"` notice and its composer, and `CompletedDraft`'s new props.
- `src/ui/screens/CompletedDraft.tsx` — `toSlots(state, entries, playerId)` mapping every
  slot index through `selectSlotStone`; the "Phase 1 never produces a Mega-typed slot"
  paragraph replaced with D-04.
- `tests/core/search.test.ts` — the `restrictTo` suite (7 cases) plus the
  `hasActiveFilters` omission, with the composition case derived from the snapshot rather
  than named.
- `tests/core/selectors.test.ts` — 21 cases across the two new selectors, every forme id
  read from the snapshot through a `formeOf` helper that looks a forme up by its `forme`
  FIELD.
- `tests/ui/mega-round.test.tsx` — **new.** 23 cases: 17 over `PoolGrid` against the real
  committed snapshot, 6 over `App` against a saved two-Mega document.
- `tests/ui/completed-draft.test.tsx` — the fixtures rebuilt around a `DraftState`, and a
  6-case export block asserting whole pastes byte for byte.

## Decisions Made

- **The restriction is composed, not pre-applied.** See Deviations, the first entry — this
  is the largest departure from the plan's letter and the one most worth reading.
- **`restrictTo` never enters filter state.** `PoolGrid` builds
  `compileFilters({ ...filters, restrictTo })` from the prop on every compile. Holding it
  in state would put it inside `NO_FILTERS`' blast radius, and three separate code paths
  reset to `NO_FILTERS`. This makes the guarantee structural rather than a rule three call
  sites have to remember.
- **The empty-offer state has no action.** `EmptyState.action` is nullable for exactly one
  variant. A `Show the whole pool` button there is one commit away from being the post-pick
  validator the phase removed, and there is no filter to clear.
- **A Mega round with BOTH a query and a control active reuses the unrestricted `both`
  sentence.** 03-UI-SPEC §9 gives two restricted variants and no third. Reaching for the
  round-specific one would print `Nothing in round 1's Mega-only pool matches "gar".` when
  Garchomp matches the query, can Mega, and was excluded by a type pill — a false sentence.
  Existing true copy beat invented copy, and the reasoning is a comment at the branch.
- **`CompletedDraft` lost its `teams` prop rather than gaining `state` beside it.** See
  Deviations, item 3.
- **The violation notice skips picks the roster no longer carries.** They are
  `missingFromRoster`'s subject and they already have their own sentence; naming a
  regulation rotation as a rule break would send the host to a screen that cannot help.
- **The notice's reference set is computed against a picks-free state.**
  `selectRoundEligibleIds` subtracts picked ids, so asking it directly would report every
  pick in the draft as illegal. The question is whether the SPECIES was admissible, never
  whether it was still free — that second question is `canApply`'s and it already answers
  it. The reasoning is a doc block on the memo.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Narrowing the `entries` prop would have made the forced count form say nothing**

- **Found during:** Task 2
- **Issue:** The plan's action text says to "narrow the entries handed to `PoolGrid` through
  `selectRoundEligibleIds(...)`". Taken literally, `PoolGrid.entries` becomes the eligible
  list, so `entries.length` IS the eligible count and the count line reads `8 of 8
  available` with no user filter active. 03-UI-SPEC §9 requires that `of` form "even with no
  user filter active … because the pool **is** filtered", and the plan's own action text
  repeats the reasoning — both of which are only true when `{total}` is the unrestricted
  leftover pool. Worse, `restrictTo` would then have had no consumer anywhere in `src/`,
  while the plan's own `<artifacts>` list requires the field.
- **Fix:** `app.tsx` passes the whole `availableEntries` plus a `roundRestriction` prop
  carrying the eligible ids, and `matchesFilters` composes the two. This is the shape
  `search.ts`'s own seam paragraph specified in 02-01 ("one clause in this function"), it
  gives `restrictTo` its first real consumer, and it leaves `{total}` a number worth
  printing. `selectRoundEligibleIds` is still what produces the ids — the narrowing route
  changed, the authority did not.
- **Files modified:** `src/app.tsx`, `src/ui/components/PoolGrid.tsx`, `src/core/search.ts`
- **Verification:** `uses the "of" count form even with no filter touched, because the pool
  IS filtered` asserts `${ELIGIBLE.length} of ${POOL.length} available` with both figures
  derived from the snapshot, and `narrows round 1 to the species that can still Mega, and
  says so` asserts the same through `App` end to end.
- **Committed in:** `25a6f7c`

**2. [Rule 3 - Blocking] `FilterableEntry` had no `id` to compare**

- **Found during:** Task 1
- **Issue:** The restriction is a set of ids and CLAUDE.md §Identity admits no exception —
  membership is by `id`, never by a display name. `matchesFilters` takes a
  `FilterableEntry`, which carried `name`, `types` and an optional `megaCapable` and no id
  at all, so the clause the plan specifies could not be written.
- **Fix:** `id: string` added to `FilterableEntry`, with a comment recording that only
  `matchesFilters` reads it and why it is on the interface rather than bolted onto one
  signature. Both subjects the widening admits — `RosterEntry` and `MegaForme` — already
  carry one, so no call site changed and no test literal broke.
- **Files modified:** `src/core/search.ts`
- **Verification:** `ignores an id the roster does not carry rather than inventing a row for
  it` and `excludes an entry outside the set whatever every other filter says`.
- **Committed in:** `81d5a61`

**3. [Rule 2 - Missing] `selectors.ts` had no way to reach a forme without re-writing the pin**

- **Found during:** Task 1
- **Issue:** `selectSlotStone` needs the forme's `requiredItem`; `isMegaEligible` returns a
  boolean and `permittedByChoice` is module-private. Writing the "unbanned AND permitted by
  the X/Y pin" conjunction a second time inside `selectors.ts` is exactly the duplication
  `mega.ts`'s opening paragraph exists to prevent — and the two copies would disagree the
  first time a regulation changed the forme vocabulary.
- **Fix:** `legalMegaForme` exported from `mega.ts`, with `isMegaEligible` reduced to
  `legalMegaForme(...) !== null`. `find` returning the first match preserves `some`'s
  semantics exactly, so no existing behaviour moved. `mega.ts` is not in Task 1's file list;
  the alternative was a second copy of the rule.
- **Files modified:** `src/core/mega.ts`, `src/core/selectors.ts`
- **Verification:** `tests/core/mega.test.ts` — 20 pre-existing cases unchanged and passing;
  `resolves an unpinned dual-Mega species through the ban list` and `follows the X/Y pin for
  a dual-Mega species` in `selectors.test.ts`.
- **Committed in:** `81d5a61`

**4. [Rule 2 - Missing] `CompletedDraft` would have held two copies of one fold**

- **Found during:** Task 3
- **Issue:** The plan changes `toSlots` to take the state, the entries and the player id
  while the component still took a `teams` record. `selectSlotStone` resolves the slot's
  species from `selectTeams(state)`, so the species named on a paste line and the stone
  beside it would have come from two different objects — at the LAST surface in the app,
  with nothing downstream to catch a disagreement. The test file would have had to keep the
  two in sync by hand, which is the same bug with a maintenance schedule.
- **Fix:** `teams` removed and derived inside the component from `state`. `app.tsx` passes
  `state={state}` and `entries={entries}` where it passed `teams={selectTeams(state)}`.
- **Files modified:** `src/ui/screens/CompletedDraft.tsx`, `src/app.tsx`,
  `tests/ui/completed-draft.test.tsx`
- **Verification:** every pre-existing assertion in `completed-draft.test.tsx` passes
  unchanged against a migrated (empty) schedule, which is also the plan's own
  byte-identical-export requirement.
- **Committed in:** `c7dd8b8`

**5. [Rule 1 - Bug] The adoption notice is the THIRD notice, not the second**

- **Found during:** Task 2
- **Issue:** The plan says to add it "as a **second** `role="status"` paragraph beside
  `feasibilityNotice`". There are already two: `feasibilityNotice` and 02-09's
  `rosterDriftNotice`.
- **Fix:** Added as a third sibling under the same stated rule — three unrelated facts,
  three sentences, none folded into another's clause. The rule the plan invokes is honoured;
  only the ordinal was stale.
- **Files modified:** `src/app.tsx`
- **Committed in:** `25a6f7c`

**6. [Rule 2 - Missing] The violation check needed a picks-free reference set**

- **Found during:** Task 2
- **Issue:** The plan says to "use `selectRoundEligibleIds` per round against the document's
  picks". That selector subtracts picked ids by construction, so every pick under test is
  absent from it and the check would have reported an entire clean draft as illegal.
- **Fix:** The reference set is `selectRoundEligibleIds({ ...state, picks: [] }, entries, r)`
  — the ids a Mega round would have OFFERED, availability aside — computed once, since the
  kind is the only input. The reasoning is a doc block on the memo, naming what the two
  questions are and which layer owns each.
- **Files modified:** `src/app.tsx`
- **Verification:** `says nothing about a document whose picks agree with its schedule` and
  `says nothing about a legal pick in an open round` are the two negatives that would fail
  against the naive reading; `reports a pick its own schedule would never have offered` is
  the positive.
- **Committed in:** `25a6f7c`

### Plan Text Not Followed

**The pool is narrowed by composition rather than by pre-filtering.** See Deviations item 1.
The plan's `key_links` entry — "`selectRoundEligibleIds` narrows the pool before `PoolGrid`
sees it" — holds in substance: the selector's output is what narrows the grid, and it is
computed in `app.tsx` before `PoolGrid` renders. What changed is that the narrowing arrives
as a set the core composes rather than as a shortened array, which is the only form that
leaves `{n} of {total}` two different numbers.

**Two acceptance criteria are unsatisfiable exactly as written and were evaluated on their
intent**, following the precedent 03-03, 03-04 and 03-05 set:

| Criterion | Why it cannot return the stated value | Evaluated as | Result |
|-----------|---------------------------------------|--------------|--------|
| `grep -c "toContain" tests/ui/completed-draft.test.tsx` does not increase | The criterion's own next clause is "they use equality", and it does not distinguish a positive substring assertion from a negated one | Every new POSITIVE assertion is whole-string equality. The three additions are one prose mention in a doc block warning against `toContain`, and two `not.toContain(' @ ')` lines each sitting directly beneath a full-paste equality on the same value | **15 → 18, zero new positive substring assertions** |
| `grep -Ec "'all'\|'mega'\|'nonMega'" src/core/search.ts` shows `MegaFilterMode` still has three members | The same file's `matchesMega` switch, `NO_FILTERS` and two doc paragraphs all contain those literals, so the count was never three | The criterion's stated intent — the union has exactly three members and no fourth — read as the declaration plus a test | **8 matches; the union declares exactly `all`, `mega`, `nonMega`, and `keeps MegaFilterMode at exactly three members` pins it** |

---

**Total deviations:** 6 auto-fixed (2 × Rule 1, 3 × Rule 2, 1 × Rule 3), 1 documented
departure from plan text, 2 acceptance criteria evaluated on intent.
**Impact on plan:** No new dependency, no schema change, no new action, no new render path.
`package.json` and `package-lock.json` are byte-identical. `src/core/export/paste.ts` and
`src/ui/components/FilterBar.tsx` are byte-identical.

## Issues Encountered

**The known `tests/ui/ban-list.test.tsx` timeout did not reproduce.** `npm run verify`
reported **1180 passed, 0 failed** at `c7dd8b8`. This plan does touch a surface that file
renders — `PoolGrid` gained a prop and a compile-time composition — so the caution in the
brief was checked rather than waved through: the ban grid passes no `roundRestriction`, so
`restrictTo` is `null` on that surface, `compileFilters` carries one extra `null` field per
change, and `matchesFilters` short-circuits on the first clause before any set is consulted.
Its 188 clicks each perform the work they did before plus one null comparison per entry per
render. It stays as `deferred-items.md` item 1, unchanged.

**`scripts/build-sw-manifest.mjs`'s four error lines print during `npm run test`.** As
03-05 recorded: that is `tests/build/sw-manifest.test.ts` deliberately exercising the
failure branches. `npm run build` alone emits the ordinary `322 URLs / 969.0 kB precached`
line. Not a defect and not logged.

**Nothing new was added to `deferred-items.md`.** Every issue this plan found was inside its
own files and was fixed; items 1, 3 and 4 carry forward unchanged.

## Verification Evidence

`npm run verify` at `c7dd8b8`: `check:pure` 0 violations in 17 files, `check:nohtml` 0
violations in 62 files, **1180 tests passed across 48 files**, typecheck clean on both
projects, `vite build` succeeded, service worker manifest 322 URLs / 969.0 kB precached.

Task 1 acceptance criteria:

| # | Check | Expected | Actual |
|---|-------|----------|--------|
| 1 | `npx vitest run tests/core/` | exit 0 | 582 passed across 16 files |
| 2 | `npm run check:pure` | exit 0 | 0 violations |
| 3 | `grep -c "restrictTo" src/core/search.ts` | ≥ 4 | 6 |
| 4 | `hasActiveFilters` excludes it, asserted by test | present | `ignores restrictTo, because a rule is not a filter the host can clear (RULE-03)` |
| 5 | `MegaFilterMode` still has three members (see table above) | 3 members | 3 |
| 6 | `grep -Ec "export function (selectRoundEligibleIds\|selectSlotStone)"` | 2 | 2 |
| 7 | a Mega-capable species in an OPEN slot yields `null` | present | `is null for a Mega-CAPABLE species sitting in an open slot` |
| 8 | Charizard pinned `'y'` yields the snapshot's Charizardite Y | present | `follows the X/Y pin for a dual-Mega species`, asserting `formeOf('charizard', 'Mega-Y').requiredItem` |
| 9 | `git diff src/core/export/paste.ts` | empty | empty |
| 10 | `grep -c "entries" src/core/model.ts` — no roster field on `DraftState` | no field | 1 match, and it is the D-03 `guardPick` doc line |

Task 2 acceptance criteria:

| # | Check | Expected | Actual |
|---|-------|----------|--------|
| 1 | `npx vitest run tests/ui/` | exit 0 | 462 passed across 25 files |
| 2 | `npm run check:nohtml` | exit 0 | 0 violations |
| 3 | the restriction sentence is a composer, and round 1 asserted in full | present | `megaRoundRestrictionLine`; `states the restriction beside the count, in full` |
| 4 | `grep -c "megaInertReason" src/ui/components/PoolGrid.tsx` | ≥ 1 | 4 |
| 5 | `grep -c "selectRoundEligibleIds" src/app.tsx` | ≥ 2 | 5 |
| 6 | cell count equals the eligible count and is smaller than the pool | present | `offers only species that can still Mega` + `narrows round 1 to the species that can still Mega, and says so` |
| 7 | `aria-disabled` present in round 1, absent in round 3 | present | `sheds the ARIA when the round ends` + `opens back up in round 3, and the control sheds its reason with the round` |
| 8 | a search matching nothing renders the round-specific body in full | present | `names the round and the query when a search matches nothing` |
| 9 | the empty-offer state renders and the cell count is 0 | present | `explains an empty offer and offers nothing else` |
| 10 | `grep -Ec "#[0-9a-fA-F]{3,6}" src/ui/components/PoolGrid.css` | 0 | 0 |

Task 3 acceptance criteria:

| # | Check | Expected | Actual |
|---|-------|----------|--------|
| 1 | `npx vitest run tests/ui/completed-draft.test.tsx tests/core/export/paste.test.ts` | exit 0 | 56 passed |
| 2 | `git diff --stat src/core/export/paste.ts` | empty | empty |
| 3 | `grep -c "selectSlotStone" src/ui/screens/CompletedDraft.tsx` | ≥ 1 | 5 |
| 4 | whole paste for a Mega team asserted byte for byte | present | `emits Species @ StoneItemName for a slot the schedule typed as Mega` |
| 5 | a Mega-capable species in an open slot produces no ` @ ` | present | `emits a Mega-CAPABLE species bare when its slot is open` |
| 6 | an all-open schedule matches the pre-Phase-3 expectation | present | `exports a migrated schema-2 document byte-identically to before Phase 3`, which also pins the compiled all-open route to the same bytes |
| 7 | `toContain` does not increase (see table above) | equality only | 15 → 18, all three non-positive |

Plan-level `<verification>`:

- `npm run verify` exits 0 — yes, 1180/1180, including the file the brief warned about.
- A two-Mega tournament played through round 3 shows a restricted pool in rounds 1–2 and the
  full pool in round 3 — `narrows round 1 …` and `opens back up in round 3 …`, both through
  `App` over a saved document.
- The exported paste for a Mega-containing team is asserted by exact string equality — six
  such assertions.
- `git diff --stat package.json` — empty.

## Known Stubs

None. Every surface this plan built is wired end to end: `selectRoundEligibleIds` reaches
the rendered grid through `app.tsx`, `selectSlotStone` reaches the paste text through
`CompletedDraft`, and both are asserted through `App` over a saved document rather than only
at the component boundary.

## Threat Flags

None. All four mitigations the plan assigned are in place, and the one accepted disposition
is unchanged:

- **T-03-21 (Tampering, an imported document violating its own schedule).** Accepted with a
  stated report, as planned. No validator: `canApply` is untouched, `apply` is untouched,
  `selectTeams` is unfiltered. The third `role="status"` notice names the count and the next
  action and repairs nothing, and two negative tests prove it does not fire on a clean
  document or on a legal pick in an open round.
- **T-03-22 (Tampering, `src/core/export/paste.ts`).** Unchanged, byte for byte.
  `declaredStone` still re-derives the stone from the entry's own copy, so the worst a
  tampered document achieves is losing a Mega it was not entitled to. Re-asserted for the
  new caller by `emits a Mega slot bare when the species has no legal forme left`.
- **T-03-23 (Tampering, the Mega-round offer).** The offer is constrained before render, so
  an illegal pick is unreachable through the UI, and the empty-offer state is never widened
  — asserted with a zero cell count and a `null` action.
- **T-03-24 (Tampering, `hasActiveFilters`).** `restrictTo` is excluded by design and pinned
  by test, and `PoolGrid` additionally keeps the restriction out of the state every reset
  path touches.
- **T-03-SC (npm installs).** Nothing installed; `package.json` and `package-lock.json`
  untouched.

One new intra-core import edge: `selectors.ts` now imports `choiceFor`, `isMegaEligible` and
`legalMegaForme` from `mega.ts`. No cycle — `mega.ts` imports two type-only modules and
nothing else. No new network endpoint, no file access, no schema change at a trust boundary,
and no new persisted field: `restrictTo` is a `Set` living only in ephemeral view state
(D-35), and the eligible id list is recomputed per fold rather than logged (D-07).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Ready, and the two selectors this plan adds are the contracts the swap unit was waiting for.

- **03-10** is the second consumer of both. `selectSlotKind` names the target slot's
  predicate and `selectRoundEligibleIds`' Mega branch is the same filter the swap offer
  needs; the `{n} of {total} available for this slot` copy in 03-UI-SPEC is the same count
  shape `PoolGrid` now renders, and `roundRestriction` is the prop that carries it.
- **03-11** inherits the empty-offer state. 03-05's note that `swapRoundsOnExactPool` warns
  about a satisfiable but degenerate configuration points at exactly the case that reaches
  `No Pokémon can Mega here` — the copy and the no-action shape are already settled.
- **03-08** hands the pool pane back after the cards resolve. `roundRestriction` is derived
  from `selectCurrentTurn`, so a card-play phase that changes what "the current round" means
  needs to re-check that memo rather than the grid.
- **A note for whoever touches `PoolGrid` next:** the restriction is deliberately NOT in
  filter state. Anyone who "tidies" it into `PoolFilters` state to remove the prop will
  reintroduce a `Clear filters` that widens a Mega round's offer, and no test outside
  `mega-round.test.tsx` would catch it.

**Carried forward in `deferred-items.md`:** items 1, 3 and 4, all unchanged. Nothing new was
logged.

---
*Phase: 03-compiled-rules-priority-cards-swaps*
*Completed: 2026-08-18*

## Self-Check: PASSED

Every file this summary claims exists, and all three commit hashes it cites resolve in
`git log --all`. Checked 2026-08-18 at `c7dd8b8`.
