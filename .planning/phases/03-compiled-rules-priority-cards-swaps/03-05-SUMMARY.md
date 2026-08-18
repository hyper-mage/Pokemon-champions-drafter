---
phase: 03-compiled-rules-priority-cards-swaps
plan: 05
subsystem: core+ui
tags: [feasibility, rule-09, mega-eligibility, pool-draw, swaps, fail-closed]

# Dependency graph
requires:
  - phase: 03-compiled-rules-priority-cards-swaps
    plan: 04
    provides: isMegaEligible, choiceFor, the Mega-forme banlist, config.megaFormeBans
  - phase: 03-compiled-rules-priority-cards-swaps
    plan: 01
    provides: config.swapBudget / config.swapRounds, MAX_SWAP_BUDGET, MAX_SWAP_ROUNDS, schema 3
  - phase: 03-compiled-rules-priority-cards-swaps
    plan: 02
    provides: compile(), which makes megasRequiredPerTeam and the Mega-round count one number
  - phase: 02-host-configured-draft-night
    provides: checkFeasibility, drawPool, FeasibilityBar, the pinned gate on the config screen
provides:
  - FeasibilityResult.megaEligibleLegalCount — RULE-09's right-hand side
  - notEnoughMegas re-measured over the species that can STILL Mega, with both ban counts named
  - swapBudgetNotAnInteger / swapRoundsNotAnInteger — the NaN rule extended to the swap fields
  - swapBudgetTooLarge / swapRoundsTooLarge — the config-time half of the import guard's bounds
  - swapRoundsOnExactPool — D-32's warning, ABOVE poolExactlyMinimum so it is renderable
  - DrawInput.megaEligibleIds / DrawResult.megaEligibleCount — the quota drawn from eligible species
affects:
  [
    03-06 Mega-round pool filter (same predicate, third consumer),
    03-09 swap budget consumption (the budget it spends is now gate-checked),
    03-10 swap target filter (fourth consumer),
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'A gate that accepts a value the import guard refuses creates documents the build cannot re-open — bound both from one constant'
    - 'A warning that always co-occurs with a higher-precedence warning is unrenderable; order the more informative one first'
    - 'A required input field, never an optional one with a default — a default lets a caller silently keep the old behaviour'
    - 'A fixture roster whose flags and arrays disagree models a roster that cannot exist, and fails the first predicate that reads both'

key-files:
  created: []
  modified:
    - src/core/feasibility.ts
    - src/core/draw.ts
    - src/ui/screens/ConfigScreen.tsx
    - src/app.tsx
    - tests/core/feasibility.test.ts
    - tests/core/draw.test.ts
    - tests/core/bans.test.ts
    - tests/ui/config-feasibility.test.tsx
    - tests/ui/config-screen.test.tsx
    - tests/ui/ban-list.test.tsx

key-decisions:
  - 'RULE-09 is measured over the CANDIDATE set, not the drawn pool — the draw is null whenever the gate has anything to say, and drawPool stage 2 carries the count into the pool by construction'
  - 'One re-measured notEnoughMegas rather than two codes: both conditions resolve to the same next action, so the sentence names both ban lists instead'
  - 'megaCapableLegalCount is kept beside megaEligibleLegalCount — the two are different numbers and the older one is D-11 pre-ban upper bound'
  - 'swapBudget and swapRounds are bounded at MAX_SWAP_BUDGET / MAX_SWAP_ROUNDS, imported from import-guard rather than restated, so this build cannot create a document isValidTournament refuses'
  - 'swapRoundsOnExactPool sits ABOVE poolExactlyMinimum, because the bar renders problems[0] and the two always hold together'
  - 'DrawInput.megaEligibleIds is required, not optional with a default — an optional field would let a caller keep Pitfall 7 with nothing to read in the diff'

patterns-established:
  - 'Bound a host-typed numeric field at the same constant the import guard uses, so the create path and the load path cannot disagree'
  - 'Two counts of one stratum, each named for what it measures, when a flag and a derivation stop agreeing'

requirements-completed: [RULE-09]

# Metrics
duration: 27min
completed: 2026-08-18
---

# Phase 3 Plan 05: The RULE-09 Gate and the Draw That Honours It Summary

**A host who bans three Mega formes at twelve players requiring six Megas reads `Not enough
Pokémon can Mega. 12 players × 6 Mega rounds needs 72; 71 can still Mega after 0 species bans
and 3 Mega-forme bans. Lower the Mega requirement, or unban a Mega forme.` with `Start draft`
disabled — and a host who passes that gate gets a pool whose Mega quota was drawn from species
that can still Mega, so no configuration this build accepts can open a Mega round with nothing
in it.**

## Performance

- **Duration:** 27 min
- **Started:** 2026-08-18T15:03:00Z
- **Completed:** 2026-08-18T15:30:00Z
- **Tasks:** 3
- **Files modified:** 10 (4 source, 6 test; nothing created)

## Accomplishments

- **The gate fails closed, and the host can see which number to change.** `notEnoughMegas`
  now reads `megaEligibleLegalCount` — entries that survive the species banlist *and* still
  carry a Mega forme after forme bans and the X/Y pin. Its sentence names the players, the
  Mega rounds, the requirement, the surviving count, **both** ban counts and the action that
  moves the number. 03-RESEARCH proves a 4–8 player party can only reach this gate through
  forme bans, so a sentence that sent the host to the species banlist would send them to the
  wrong screen.
- **The draw can no longer starve a Mega round.** `drawPool`'s stage-1 partition tests
  membership in `megaEligibleIds` instead of the `megaCapable` flag. Partitioning on the flag
  lets the quota be filled entirely with species whose every forme is banned — a pool that
  passes every check, records a healthy `megaCapableCount`, and opens a Mega round empty, with
  no runtime validator left to catch it because the compiler removed it by design. Two
  end-to-end tests assert that a configuration passing the gate draws a pool whose
  still-eligible count covers every Mega round.
- **Both swap fields inherit the `number | null` rule.** An emptied field blocks Start with its
  own sentence rather than reaching the arithmetic as `NaN`, where every comparison is false
  and the gate would report all-clear.
- **The Exact-pool swap warning is actually readable.** Ordered as the plan specified it would
  never have rendered: it and `poolExactlyMinimum` hold together by construction and
  `FeasibilityBar` shows `problems[0]`. It now sits above the sentence it supersedes.
- **`Re-roll pool` survives, and the reason is asserted.** RESEARCH Open Question 1 resolved in
  the plan's favour: the gate measures the candidate set, so a re-roll provably cannot move the
  verdict. A test re-rolls and asserts the reason string is byte-identical.
- **Every count is set membership over the roster.** A duplicated forme ban counts once, a
  forme id this regulation dropped counts zero, and both are asserted directly (T-03-19).

## Task Commits

1. **Task 1: The RULE-09 gate, re-measured, plus new codes** — `266d4c0`
2. **Task 2: The draw's Mega quota comes from eligible species** — `5f8a1ab`
3. **Task 3: Wire the gate and the draw to what the host configured** — `bee5947`

Tasks 1 and 2 carried `tdd="true"`. The plan is `type: execute`, so the RED/GREEN split was
not committed separately — running a RED commit would have left `npm run typecheck` failing,
which CLAUDE.md's "run `npm run verify` before every commit" forbids. RED was observed and
recorded instead: Task 1's new tests failed 18 assertions against the old module, Task 2's
failed 4 while all 18 pre-existing draw assertions passed untouched. Recorded here rather than
claimed as a gate sequence that does not exist in the log, following 03-04's precedent.

## Files Created/Modified

- `src/core/feasibility.ts` — five new `FeasibilityCode` members, four new `FeasibilityInput`
  fields, `megaEligibleLegalCount` on the result, six new precedence rows, three message
  constants and three composers. The doc block gained two sections: why two Mega counts are
  returned, and why the swap bounds are imported from `import-guard` rather than restated.
- `src/core/draw.ts` — `megaEligibleIds` on `DrawInput`, `megaEligibleCount` on `DrawResult`,
  the stage-1 partition, and a doc-block paragraph naming Pitfall 7 as the reason the predicate
  changed. The two-stage structure and the accepted uniformity caveat are untouched;
  `megaCapableCount`'s comment now says it is the pre-ban upper bound rather than the gate's
  input.
- `src/ui/screens/ConfigScreen.tsx` — the four new gate inputs with their dependency entries,
  and `megaEligibleIds` computed inside the `draw` memo from the same candidate set the draw
  already uses, with the D-11 reasoning beside it so the next reader does not try to measure
  `draw.ids`. The draw's guard on `feasibility.blocked` is unchanged.
- `src/app.tsx` — the adoption-path `checkFeasibility` call reads all four fields from the
  adopted document's own config. Still a non-blocking notice.
- `tests/core/feasibility.test.ts` — 22 new cases across four suites plus three extended ones;
  every message asserted byte for byte after interpolation. Forme ids are read from the
  snapshot through a `formeIdOf` helper that looks a forme up by its `forme` FIELD.
- `tests/core/draw.test.ts` — a `request()` helper so the unbanned eligibility list is supplied
  once, five new Pitfall-7 cases, and a tripwire pinning that the `megaCapable` flag and a
  non-empty `megaFormes` array name the same set on today's snapshot. No fixture pinning drawn
  ids moved, and that tripwire is why.
- `tests/ui/config-feasibility.test.tsx` — 12 new cases across three suites: the swap fields
  reaching the gate, RULE-09 on screen, and the draw honouring the eligibility the gate
  measured.
- `tests/core/bans.test.ts`, `tests/ui/config-screen.test.tsx`, `tests/ui/ban-list.test.tsx` —
  see Deviations.

## Decisions Made

- **`megaEligibleLegalCount` is measured over the candidate set, and the argument is recorded
  in code.** D-11's wording — "count pool entries that still have a legal Mega forme" — is
  literally unreachable: `ConfigScreen` guards the draw on `feasibility.blocked`, so the pool
  does not exist while the gate has anything to say. Measuring the candidate set satisfies
  D-11's intent exactly, because `drawPool`'s stage 2 takes the quota from that same set and
  carries the count into the pool by construction. Both halves of that argument are comments
  in the two files that implement them.
- **One `notEnoughMegas`, not two codes.** `feasibility.ts`'s own test for splitting a code is
  that each condition names its own next action. Species bans and forme bans both resolve to
  "lower the requirement or unban something", so the sentence names both lists and the module
  keeps one precedence row.
- **`swapBudget` and `swapRounds` are bounded at the import guard's constants.** See
  Deviations, item 1 — this is the largest departure from the plan's letter and the one most
  worth reading.
- **`swapRoundsOnExactPool` sits above `poolExactlyMinimum`.** See Deviations, item 2.
- **`DrawInput.megaEligibleIds` is required.** An optional field defaulting to "everything
  that can Mega" would have let every existing call site keep Pitfall 7 with nothing to read
  in the diff — which is precisely the failure mode the field exists to close. Required cost
  four mechanical call-site updates and bought a compiler error at every future one.
- **The gate call passes the RAW `dualMegaChoices` state, not `dualMegaChoicesForConfig`.** The
  ordered copy is declared further down the component and reading it earlier would be a
  temporal-dead-zone `ReferenceError` on first render. It exists so two hosts who made the same
  rulings write byte-identical documents; `choiceFor` looks a species up rather than iterating,
  so the gate cannot tell the two apart. The reason is a comment at the call site.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing] The two swap fields were gate-checked for shape but not for bound**

- **Found during:** Task 1
- **Issue:** The plan's `<behavior>` lists `null`, `NaN`, `-1` and `2.5` for the two new
  numeric codes, all of which `Number.isSafeInteger` plus a non-negative floor catches. The
  plan's own threat register (T-03-17) additionally names `4e9` as a blocking problem — and
  `4e9` **is** a safe integer, so the stated check lets it through. That is not a cosmetic
  gap: `import-guard.ts` bounds `swapBudget` and `swapRounds` at 24 apiece, and
  `persistence.load` runs every restored document through `isValidTournament`, which runs
  `buildConfig`, which enforces those bounds. A host who typed `25` would have passed the
  gate, created a document, autosaved it, and found `Resume saved draft` silently absent on
  the next visit. The build would have been creating tournaments it refuses to re-open.
- **Fix:** Two more codes, `swapBudgetTooLarge` and `swapRoundsTooLarge`, in the module's own
  established shape — the same malformed-versus-bound split `megasRequiredNotAnInteger` and
  `megasExceedRounds` already use one field along, and for the same stated reason: "Swap
  budget needs a whole number" is a false sentence about a value that *is* one, and CLAUDE.md
  requires the stated next action to be the one that resolves the problem. The bounds are
  **imported** from `import-guard.ts` rather than restated, so the create path and the load
  path cannot drift apart.
- **Files modified:** `src/core/feasibility.ts`, `tests/core/feasibility.test.ts`
- **Verification:** `refuses a budget past the bound the import guard enforces (T-03-17)` and
  its swap-rounds sibling assert `4e9` and `MAX + 1` both block, and that they do **not**
  report the "needs a whole number" code.
- **Committed in:** `266d4c0`

**2. [Rule 1 - Bug] `swapRoundsOnExactPool` as ordered was unrenderable**

- **Found during:** Task 3
- **Issue:** The plan places the new warning "beside `poolExactlyMinimum`", and it was first
  written below it. Both warnings fire on exactly one condition — `poolSize === players ×
  rounds` — so they always hold together, and `FeasibilityBar` renders `problems[0]` plus a
  count of the remaining **blockers** only. The new sentence could therefore never appear on
  screen at any configuration, which makes D-32's whole point dead code. The plan's own
  acceptance criterion ("shows the `Warning — ` prefixed sentence") would have passed against
  the *older* warning's sentence without anyone noticing.
- **Fix:** `swapRoundsOnExactPool` moved above `poolExactlyMinimum` in `PRECEDENCE`, with the
  reasoning recorded there. It is also strictly the more informative of the two: it states the
  pool size the other one states **and** what that costs the first swapper, so a host reading
  it needs no second sentence.
- **Files modified:** `src/core/feasibility.ts`, `tests/core/feasibility.test.ts`
- **Verification:** `warns without blocking when swap rounds run on an Exact pool (D-32)` in
  `tests/ui/config-feasibility.test.tsx` asserts the visible reason is the swap sentence in
  full, with `Start draft` enabled.
- **Committed in:** `bee5947`

**3. [Rule 3 - Blocking] Four required interface fields broke every caller**

- **Found during:** Tasks 1 and 2
- **Issue:** `FeasibilityInput` gained four required fields and `DrawInput` one, so
  `src/app.tsx`, `src/ui/screens/ConfigScreen.tsx`, `tests/core/bans.test.ts`,
  `tests/core/draw.test.ts` and `tests/ui/config-feasibility.test.tsx` all stopped compiling.
  `FeasibilityResult` gaining `megaEligibleLegalCount` broke two hand-built fixtures in
  `tests/ui/config-screen.test.tsx` that construct a result to hand `FeasibilityBar` directly.
- **Fix:** Every call site updated. The two source call sites landed with the full reasoning
  comments the plan asked for rather than a mechanical patch, so the wiring is complete in the
  commit that breaks it and no commit in this plan leaves `npm run typecheck` failing.
- **Files modified:** as listed above.
- **Verification:** `npm run typecheck` clean at every commit; `npm run verify` clean at
  `5f8a1ab`.
- **Committed in:** `266d4c0`, `5f8a1ab`

**4. [Rule 1 - Bug] `config-screen.test.tsx`'s fixture roster modelled a roster that cannot exist**

- **Found during:** Task 1
- **Issue:** The 60-entry fixture sets `megaCapable: index % 4 === 0` with `megaFormes: []` for
  every row. On the committed snapshot the flag and a non-empty formes array name the same set
  — `tests/core/roster/fixtures.test.ts` pins it — so the fixture describes a roster the data
  pipeline cannot produce. The moment the gate started counting species that can *still* Mega,
  that fixture reported zero eligible species and four unrelated tests failed, including three
  about the compiled schedule that have nothing to do with Megas.
- **Fix:** A Mega-capable fixture row now carries one Mega forme, with the reason in a comment
  beside it. Not "make the test pass": a fixture that disagrees with the real roster's own
  invariant will mislead the next predicate that reads both.
- **Files modified:** `tests/ui/config-screen.test.tsx`
- **Verification:** `reports the Mega-capable shortfall when the roster cannot supply the
  quota` now reads 15 eligible in 60, which is the figure its own comment always claimed.
- **Committed in:** `266d4c0`

**5. [Rule 3 - Blocking] Three assertions pinned the superseded `notEnoughMegas` sentence**

- **Found during:** Task 1
- **Issue:** `tests/core/feasibility.test.ts`, `tests/ui/config-screen.test.tsx` and
  `tests/ui/ban-list.test.tsx` each assert the old copy. Not test rot — each was correct about
  the sentence that shipped, and 03-UI-SPEC §5 explicitly supersedes it.
- **Fix:** All three updated to the new sentence. `ban-list.test.tsx`'s was strengthened from
  `toContain` to full-string equality while it was being touched, because the whole point of
  the new copy is the numbers inside it.
- **Files modified:** `tests/core/feasibility.test.ts`, `tests/ui/config-screen.test.tsx`,
  `tests/ui/ban-list.test.tsx`
- **Committed in:** `266d4c0`

**6. [Rule 3 - Blocking] `config-screen.test.tsx` asserted that an empty swap budget does not block**

- **Found during:** Task 1
- **Issue:** `leaves an emptied field empty rather than coercing it back to 0` asserted
  `Start draft` stays enabled, with a comment naming **this plan** as the one that changes it:
  "03-05 is the plan that adds the blocking reason — until then an empty budget is simply not
  a blocker on this screen."
- **Fix:** The assertion inverted and the comment rewritten to record what the split now is —
  the field still keeps the host's empty string, and the *bar* is what refuses. The test's
  actual subject (the control does not rewrite or clamp the field) is unchanged.
- **Files modified:** `tests/ui/config-screen.test.tsx`
- **Committed in:** `266d4c0`

### Plan Text Not Followed

**The `megaEligibleIds` filter uses `dualMegaChoices`, not `dualMegaChoicesForConfig`.** The
plan's Task 3 action names the ordered copy. It is declared roughly 150 lines below both the
gate call and the draw memo, so reading it from either would be a temporal-dead-zone
`ReferenceError` on first render rather than a type error. The two hold the same set — the
ordered copy exists to make two hosts' documents byte-identical, and `choiceFor` resolves by
lookup rather than by iteration — so the substitution is invisible to both consumers. Recorded
at both call sites.

**One acceptance criterion is unsatisfiable exactly as written and was evaluated on its
intent**, following the precedent 03-03 and 03-04 set:

| Criterion | Why it cannot return the stated value | Evaluated as | Result |
|-----------|---------------------------------------|--------------|--------|
| `grep -c "entry.megaCapable" src/core/draw.ts` returns exactly 1 | The same task's `<action>` requires a doc-block paragraph explaining that the partition is no longer `entry.megaCapable`, and Pitfall 7's whole point is naming the wrong predicate | The criterion's own stated intent — "only the `megaCapableCount` tally, never the partition" — read as no code path. The three comments were reworded to say "the `megaCapable` FLAG", which keeps every warning and removes the literal | **1** |

The sibling criterion `grep -c "megaFormeBans.length" src/core/feasibility.ts` returns 0 was
satisfied the same way: the comment now warns against "the RAW LENGTH of the forme banlist",
which is the same instruction without the token.

---

**Total deviations:** 6 auto-fixed (2 × Rule 1, 3 × Rule 3, 1 × Rule 2), 1 documented departure
from plan text, 1 acceptance criterion evaluated on intent.
**Impact on plan:** No new dependency, no schema change, no new render path.
`package.json` and `package-lock.json` are byte-identical. `FeasibilityBar.tsx` is byte-identical.

## Issues Encountered

**The known `tests/ui/ban-list.test.tsx` timeout reproduced, and was checked rather than
waved through.** The brief is explicit that this plan re-measures the feasibility gate, so a
genuine regression would look identical to the flake. Three things were checked:

1. **The verdict is unchanged.** `survives 187 bans at eight players and Exact` reaches
   `tooManyPlayersForRoster` / `poolTooLarge`, neither of which reads Mega eligibility. Its
   sibling `survives 26 Mega-capable bans…`, which *does* reach `notEnoughMegas`, passes and
   now asserts the new sentence in full.
2. **The cost did not balloon.** The gate gained two reduces over 235 entries per call — one
   calling `isMegaEligible` over a `megaFormes` array of length 0 or 1, one summing forme-ban
   hits. Measured: the file runs in **2.50 s** of test time in isolation and **3.25 s** wall,
   against the ~4.2 s `deferred-items.md` recorded before this plan. It did not get slower.
3. **It passes at every smaller scope.** `tests/ui/ban-list.test.tsx` alone: 17 passed.
   `tests/ui/` (24 files, 433 tests): all passed, ban-list included. It fails only under the
   full 47-file parallel run, which is exactly the signature item 1 documents. It also passed
   under a full `npm run verify` at `5f8a1ab` during this plan and failed at `bee5947`, on a
   commit that touches no ban surface — machine-and-load dependent, as recorded.

It stays as `deferred-items.md` item 1, unchanged.

**`scripts/build-sw-manifest.mjs`'s base-path error prints during `npm run test`.** It appears
in `npm run verify` output and looks alarming beside a test failure. It is
`tests/build/sw-manifest.test.ts` deliberately exercising the failure branch — `npx vitest run
tests/build/` reports 25 passed, and `npm run build` alone emits the ordinary
`322 URLs / 966.4 kB precached` line. Not a defect and not logged.

## Verification Evidence

`npm run verify` at `5f8a1ab`: `check:pure` 0 violations in 17 files, `check:nohtml` 0
violations in 62 files, **1113 tests passed across 47 files**, typecheck clean on both
projects, `vite build` succeeded. At `bee5947` the same run reports **1123 passed, 1 failed** —
the known `ban-list` timeout above, and nothing else.

Task 1 acceptance criteria:

| # | Check | Expected | Actual |
|---|-------|----------|--------|
| 1 | `npx vitest run tests/core/feasibility.test.ts` | exit 0 | 61 passed |
| 2 | `npm run check:pure` | exit 0 | 0 violations |
| 3 | `grep -Ec` the three new codes | ≥ 9 | 10 |
| 4 | `grep -c "megaEligibleLegalCount"` | ≥ 3 | 6 |
| 5 | `grep -c "megaCapableLegalCount"` | ≥ 2 | 5 |
| 6 | `grep -c "megaFormeBans.length"` | 0 | 0 |
| 7 | `Not enough Pokémon can Mega.` present / old string absent | 1 / 0 | 1 / 0 |
| 8 | full interpolated `notEnoughMegas` asserted | present | `names both ban lists with their own counts…` |
| 9 | `swapRounds: 2` at Exact → not blocked, warning severity | present | `warns without blocking when swap rounds run on an exactly-minimum pool` |
| 10 | `swapBudget: NaN` → blocked, `problems[0]` is the code | present | `blocks an empty field…` + `blocks NaN, a negative and a fraction…` |
| 11 | duplicated forme ban leaves the count unchanged | present | `counts a duplicated Mega-forme ban once and a stranger id zero (T-03-19)` |

Task 2 acceptance criteria:

| # | Check | Expected | Actual |
|---|-------|----------|--------|
| 1 | `npx vitest run tests/core/draw.test.ts` | exit 0 | 22 passed |
| 2 | `npm run check:pure` | exit 0 | 0 violations |
| 3 | `grep -c "megaEligibleIds" src/core/draw.ts` | ≥ 3 | 4 |
| 4 | `grep -c "entry.megaCapable" src/core/draw.ts` (see table above) | 1 | 1 |
| 5 | `grep -c "megaEligibleCount" src/core/draw.ts` | ≥ 2 | 3 |
| 6 | a Pitfall-7 test bans every forme of a species block | present | `still fills the quota when the first twenty Mega-capable species lose every forme` |
| 7 | subsequence, determinism, no-mutation, cursor all still pass | present | all 18 pre-existing assertions unchanged and passing |
| 8 | `grep -c "not uniform over the constraint-satisfying set"` | 1 | 1 |

Task 3 acceptance criteria:

| # | Check | Expected | Actual |
|---|-------|----------|--------|
| 1 | `npx vitest run tests/ui/` | exit 0 | 433 passed across 24 files |
| 2 | `npm run check:nohtml` | exit 0 | 0 violations |
| 3 | `grep -c "megaFormeBans" …/ConfigScreen.tsx` | ≥ 2 | 12 |
| 4 | `grep -c "megaEligibleIds" …/ConfigScreen.tsx` | ≥ 1 | 2 |
| 5 | `grep -c "swapBudget" src/app.tsx` | ≥ 1 | 1 |
| 6 | `git diff --stat …/FeasibilityBar.tsx` | empty | empty |
| 7 | clearing the swap budget blocks, sentence in full | present | `blocks the start when the swap budget is emptied` |
| 8 | the RULE-09 sentence in full, both ban counts | present | `blocks the start with the arithmetic and both ban counts` |
| 9 | swap rounds > 0 at Exact leaves Start enabled, `Warning — ` shown | present | `warns without blocking when swap rounds run on an Exact pool (D-32)` |
| 10 | `Re-roll pool` still rendered | present | `keeps Re-roll pool available, and a re-roll does not move the verdict` |

Plan-level `<verification>`:

- `npm run verify` — clean at `5f8a1ab`; at `bee5947`, one pre-existing failure documented above.
- `npx vitest run tests/core/` — passes, and no draw fixture needed re-pinning (the flag and
  the formes array name the same set today, and a new tripwire pins that premise).
- The cross-check that a passing configuration draws a pool whose eligible count covers every
  Mega round: two configurations, `draws a pool that can fill every Mega round at eight players
  requiring four` (≥ 32 of 48) and `at six players requiring six` (36 of 36).
- `git diff --stat package.json` — empty.

## Known Stubs

None. Every surface this plan touched is wired end to end: the config screen's forme bans, X/Y
pins and both swap fields reach `checkFeasibility`, the same eligibility reaches `drawPool`,
and the created document is read back off the store in two tests.

## Threat Flags

None. All four mitigations the plan assigned are in place, and the one accepted disposition is
unchanged:

- **T-03-17 (DoS, the two numeric fields).** Both typed `number | null` and refused before any
  arithmetic. `null`, `NaN`, `Infinity`, `-1`, `2.5` and `4e9` are all blocking problems — the
  last of those needed the bound described in Deviations item 1.
- **T-03-18 (DoS, empty Mega round).** The gate blocks on `players × megaRounds >
  megaEligibleLegalCount` and `drawPool` fills the quota from eligible species. Together they
  make an empty Mega-round offer unreachable for documents this build creates, which is the
  same "the blocker **is** the guarantee" posture STATE.md records for pool-dry.
- **T-03-19 (Tampering, counting by length).** Every count is set membership over the roster.
  Asserted directly for the forme banlist, and `grep -c "megaFormeBans.length"` is 0.
- **T-03-20 (Tampering, an imported document the gate would fail).** Accepted as planned:
  reported through the existing non-blocking notice, never refused or repaired. `app.tsx` now
  passes the four new fields from the adopted document's own config, and the existing
  `the adopted-document feasibility notice` suite still passes.
- **T-03-SC (npm installs).** Nothing installed; `package.json` untouched.

One new intra-core import edge: `feasibility.ts` now imports `MAX_SWAP_BUDGET` /
`MAX_SWAP_ROUNDS` from `import-guard.ts` and `isMegaEligible` / `choiceFor` from `mega.ts`. No
cycle (`import-guard` imports neither), no new network endpoint, no file access, no schema
change at a trust boundary.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Ready.

- **03-06** is the third consumer of `isMegaEligible`, for the Mega-round pool filter. The
  candidate-set eligibility list this plan computes on the config screen is the same shape that
  filter needs, and `FilterBar.megaInertReason` from 03-04 is still waiting for its string.
- **03-09/03-10** inherit a `swapBudget` and `swapRounds` that are gate-checked at config time
  against the same bounds `import-guard` enforces, so no swap-consuming code has to defend
  against a budget the document should never have carried.
- **A note for whoever builds the swap rounds:** `swapRoundsOnExactPool` is a warning about a
  configuration that is satisfiable but degenerate. The first swapper genuinely has nothing to
  take. If the swap round's UI needs an empty state, this is the configuration that reaches it.

**Carried forward in `deferred-items.md`:** items 1, 3 and 4, all unchanged. Nothing new was
logged — every issue this plan found was inside its own files and was fixed.

---
*Phase: 03-compiled-rules-priority-cards-swaps*
*Completed: 2026-08-18*

## Self-Check: PASSED

Every file this summary claims exists, and all three commit hashes it cites resolve in
`git log --all`. Checked 2026-08-18 at `bee5947`.
