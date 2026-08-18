---
phase: 03-compiled-rules-priority-cards-swaps
plan: 02
subsystem: core
tags: [rules-compiler, event-sourcing, action-family, selectors, import-guard, preact]

# Dependency graph
requires:
  - phase: 03-compiled-rules-priority-cards-swaps
    plan: 01
    provides: schema 3, CompositionRule, DraftState.schedule, RoundKind and RoundSpec as types
  - phase: 02-host-configured-draft-night
    provides: createTournament's two-dispatch shape, buildLogEntry's field-by-field rebuild, BoardGrid's round headers
provides:
  - compile(rules, rounds) — the total, pure rule compiler, Mega rounds first
  - the schedule/compiled action family in all five places plus import-guard's arm
  - selectSchedule, selectRoundKind, selectSlotKind
  - DraftState.schedule written by the reducer
  - three RejectionReason members — scheduleAlreadyCompiled, scheduleNotCompiled, malformedSchedule
  - CreateTournamentInput.schedule, and a three-dispatch createTournament
  - typed board round headers with a reserved marker line
affects:
  [
    03-03 schedule preview and reorder,
    03-04 Mega-forme bans,
    03-06 Mega-round pool filter,
    03-08 priority cards,
    03-10 swap predicate,
    03-11 swap rounds,
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'A compiler that a validation gate runs alongside is total and never throws — the gate owns satisfiability, the compiler owns layout'
    - 'A check the structural guard already makes is not repeated in canApply; the reason is written where the second check would have gone'
    - 'Reserved chrome is a structural element with a modifier class, never a conditionally-rendered one'
    - "A line box reserved as `1.5em` against `font: var(--text-body)` names no pixel and follows the token"

key-files:
  created:
    - src/core/compile.ts
    - tests/core/compile.test.ts
  modified:
    - src/core/actions.ts
    - src/core/reduce.ts
    - src/core/selectors.ts
    - src/core/import-guard.ts
    - src/store.ts
    - src/app.tsx
    - src/ui/screens/ConfigScreen.tsx
    - src/ui/components/BoardGrid.tsx
    - src/ui/components/BoardGrid.css
    - tests/core/selectors.test.ts
    - tests/core/reduce.test.ts
    - tests/core/import-guard.test.ts
    - tests/core/undo.test.ts
    - tests/store-ownership.test.ts
    - tests/ui/draft-board.test.tsx
    - tests/ui/config-screen.test.tsx

key-decisions:
  - 'canApply does NOT recheck index contiguity — isScheduleCompiledAction already pins it, so the branch the plan specified would have been unreachable code reading as a second authority'
  - 'compile clamps for layout only and never repairs the config; the config keeps its unsatisfiable number and keeps failing the feasibility gate'
  - 'The reserved marker line is one element with a --mega modifier, so only the paint is conditional and the structure never is'
  - 'The import guard bounds rounds by MAX_ROUNDS and types each spec, but never compares the length against config.rounds — a bound is not an integrity check'
  - 'openingLog() in reduce.test.ts grew the third action; undo.test.ts deliberately did not, because a Phase 2 log is exactly what that file must keep working against'

patterns-established:
  - 'A new action lands in five places plus buildLogEntry, and this plan is the worked example the phase cites'
  - 'Where two layers could both check something, the lower one checks it and the upper one records why it does not'

requirements-completed: [RULE-02, CARD-02]

# Metrics
duration: 28min
completed: 2026-08-17
---

# Phase 3 Plan 02: The Compiled Schedule Summary

**A host's `Megas required per team: 2` becomes two Mega rounds in the log before the first
pick — compiled by a pure, total `compile()`, materialized by a `schedule/compiled` action
that survives export and re-import including a reordering the compiler would never emit, and
rendered as `Mega` above the two columns it types.**

## Performance

- **Duration:** 28 min
- **Started:** 2026-08-17T22:00:00Z
- **Completed:** 2026-08-17T22:28:00Z
- **Tasks:** 3
- **Files modified:** 18 (9 source, 7 test modified, 2 created)

## Accomplishments

- **`compile()` is total and the feasibility gate stays the only authority on
  satisfiability.** `compile([{ kind: 'mega', count: 9 }], 6)` returns six Mega specs and
  does not throw, because it runs while the host is still typing against a config
  `megasExceedRounds` has already blocked — a compiler that threw there turns a blocked
  Start into a blank screen. The clamp lays out the array; it never rewrites the config,
  which keeps its unsatisfiable number and keeps failing the gate.
- **The schedule reaches the log in all six required places.** Constant, payload interface,
  `Intent` member, creator, structural guard, and `buildLogEntry`'s arm — the sixth being
  the one whose absence is silent. A document exported after a **reordered** schedule
  (`open, mega, open, mega, open, open`) re-imports and folds to exactly that, which is the
  single case a recompute-on-load implementation would pass every other test and fail.
- **Origination is guarded; replay deliberately is not.** `canApply(DRAFT_STARTED)` refuses
  `scheduleNotCompiled`, so this build cannot create a document without a schedule. `fold`
  does not run `canApply`, so a Phase 2 save with no `schedule/compiled` in its log still
  opens, and `selectSchedule` folds its empty schedule to all-open — which is what that
  draft actually ran, not a default that guesses.
- **The board says which rounds are Mega rounds, and a reorder never moves it.** The marker
  line is rendered in every header and carries text only on a Mega round, so the reserved
  height is structural. The `1.5em` that reserves it is `--text-body`'s own line-height
  factor rather than a pixel, so it follows the token if the token moves.
- **Both stale `doc.rng` comments are gone,** replaced with what is now true: nothing in
  this build advances the generator, `rng.cursor` stays `0` for the life of a Phase 3
  document, and the field remains for the provenance argument. A third copy of the same
  stale claim was found in `tests/store-ownership.test.ts` and corrected with them.

## Task Commits

1. **Task 1: `compile()` and the three schedule selectors**
   - `7083d4c` (test — RED)
   - `b0c32d7` (feat — GREEN)
2. **Task 2: `schedule/compiled` — action, reducer, guard, third dispatch**
   - `7153686` (test — RED)
   - `5ddb532` (feat — GREEN)
   - `f96e06e` (test — the config screen's two log-length assertions, see Deviation 1)
3. **Task 3: Typed round headers on the board** — `642be41` (feat)

## Files Created/Modified

- `src/core/compile.ts` — **new.** `compile(rules, rounds)`, `kindAt`, and a doc block
  arguing the compile-don't-validate decision, the Mega-rounds-first default (a default,
  not a rule — the host permutes it), and why totality is load-bearing rather than defensive.
- `src/core/actions.ts` — `SCHEDULE_COMPILED`, `ScheduleCompiledPayload` with the Pattern 5
  argument strongest-first, the `Intent` member, `ScheduleCompiledAction`,
  `scheduleCompiled()` copying element by element, `ROUND_KINDS`, and
  `isScheduleCompiledAction` pinning `rounds[i].index === i + 1` and each `kind` against the
  union. The `PoolBuiltPayload` `doc.rng` paragraph and the module header both corrected.
- `src/core/reduce.ts` — three `RejectionReason` members, the `apply` arm copying spec by
  spec, `canApply(SCHEDULE_COMPILED)` with four ordered rejections, and
  `canApply(DRAFT_STARTED)`'s `scheduleNotCompiled` with the fold-does-not-validate note.
- `src/core/selectors.ts` — `selectSchedule`, `selectRoundKind`, `selectSlotKind`, placed
  beside `selectTeams` because they invert its round-to-slot join.
- `src/core/import-guard.ts` — `ROUND_KINDS`, `buildRoundSpecs`, and the
  `case 'schedule/compiled'` arm.
- `src/store.ts` — `CreateTournamentInput.schedule`, the second dispatch between
  `pool/built` and `draft/started`, a rollback branch covering all three, and the twin
  `doc.rng` correction.
- `src/ui/screens/ConfigScreen.tsx` — `handleStart` passes `compile(config.rules, ROUNDS)`,
  with the comment naming 03-03 as the plan that replaces this exact line.
- `src/app.tsx` — `schedule={selectSchedule(state)}`.
- `src/ui/components/BoardGrid.tsx` / `.css` — the `schedule` prop, `MEGA_MARKER` and its
  visually-hidden suffix, `isMegaRound`, the two-line header, and the reserved marker line.
- Seven test files — `compile.test.ts` created; `selectors`, `reduce`, `import-guard`,
  `store-ownership`, `draft-board` and `config-screen` extended.

## Decisions Made

- **`canApply` does not recheck index contiguity, and the comment says why it does not.**
  The plan specified `malformedSchedule` for both a wrong length and non-contiguous indices.
  Implementing the second half produced a failing test that turned out to be right:
  `isScheduleCompiledAction` runs first and already pins index against position, so the
  contiguity branch in `canApply` was unreachable. Unreachable code that looks like a check
  is worse than no check — the next reader has to work out which of the two authorities
  wins. The branch was removed and replaced with a comment recording that contiguity is the
  structural guard's question (asked on every action, including on every fold through
  `apply`) while length-against-`config.rounds` is `canApply`'s, because the guard types an
  action in isolation and cannot see the config. The test now asserts a non-contiguous
  schedule is rejected as `malformedPayload` and states that this is the right reason rather
  than a near miss.
- **`compile` clamps for layout and never for repair.** `Math.min(Math.max(required, 0), total)`
  decides how many positions are Mega rounds. `config.megasRequiredPerTeam` is untouched, so
  a host who typed 9 still sees `megasExceedRounds` on the gate rather than a silently
  fixed-up config that starts.
- **The reserved marker line is one element with a modifier class, not two branches.**
  `.board__round-mark` carries the structure and the reserved height for every round;
  `.board__round-mark--mega` adds only fill, radius and padding. An always-rendered element
  that also carried the fill would paint a small empty pill above every open round, and a
  conditionally-rendered one would give up the reserved height the whole design rests on.
- **`openingLog()` grew the third action in `reduce.test.ts` but deliberately did not in
  `undo.test.ts`.** The reducer fixture claims to be what `createTournament` emits and must
  stay true to that. The undo fixture is a Phase 2 log, which is exactly the shape that file
  must keep working against; its comment now says so instead of claiming parity it no longer
  has.
- **`1.5em` rather than `27px` for the reserved line.** The marker sets
  `font: var(--text-body)`, so `1.5em` resolves against its own 18px font size to exactly
  one line box. It names no pixel and follows the token if the type scale ever moves.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Two `config-screen.test.tsx` assertions were written against the
two-action log**

- **Found during:** Task 3 (surfaced by the first full-suite run after Task 2 landed)
- **Issue:** `expect(doc?.log).toHaveLength(2)` and `const started = log[1]` both encode the
  store's old dispatch count. The third dispatch is this plan's whole point, so these were
  not tests to preserve — but they were also not tests to delete, since the log's exact
  shape is what they are for.
- **Fix:** Updated to 3 and `log[2]`, added `state?.schedule` to the first, and added a new
  end-to-end case asserting the plan's own `<verification>` line: a tournament created with
  `megasRequiredPerTeam: 2` has `schedule/compiled` as its second log entry carrying exactly
  two `'mega'` specs, and `getState().schedule` equal to it.
- **Files modified:** `tests/ui/config-screen.test.tsx`
- **Verification:** `npx vitest run tests/ui/config-screen.test.tsx` — 43 passed.
- **Committed in:** `f96e06e`

**2. [Rule 3 - Blocking] `tests/store-ownership.test.ts` had to gain the new input field**

- **Found during:** Task 2
- **Issue:** `CreateTournamentInput` gaining a required `schedule` breaks every construction
  of it. `sixPlayerInput` is the only one outside `ConfigScreen`.
- **Fix:** Added `APPROVED_SCHEDULE` — deliberately a **reordered** one, so a store that
  recompiled instead of recording what it was handed would emit a valid-looking schedule and
  still fail this file. Extended the emission test to assert all three types by position,
  and added a rollback case for a refused **middle** dispatch, which the plan's rollback
  requirement needed and no existing test covered.
- **Files modified:** `tests/store-ownership.test.ts`
- **Verification:** `npx vitest run tests/store-ownership.test.ts` — passed.
- **Committed in:** `5ddb532`

**3. [Rule 2 - Missing correctness] A third copy of the stale `doc.rng` claim, in a test**

- **Found during:** Task 2
- **Issue:** The plan named two stale comments, in `actions.ts` and `store.ts`.
  `tests/store-ownership.test.ts` carried a third — *"the document's own RNG seed is
  reserved for Phase 3's priority-card tie-breaks"* — sitting directly above the
  `rng.cursor` assertion, which is the place a reader most likely to act on it would read it.
- **Fix:** Corrected to match the two source comments, and it now names the assertion's real
  meaning: the cursor is 0 at creation and stays 0 for the life of the document.
- **Files modified:** `tests/store-ownership.test.ts`
- **Verification:** `npm run verify` clean.
- **Committed in:** `5ddb532`

**4. [Rule 2 - Missing correctness] Two module-level comments this plan made false**

- **Found during:** Task 2
- **Issue:** `actions.ts`'s header said "All four types exist from day one" — this plan adds
  a fifth. `undo.test.ts`'s `openingLog` said "exactly as `createTournament` emits them",
  which stopped being true the moment the third dispatch landed.
- **Fix:** The `actions.ts` header now separates Phase 1's four from Phase 3's fifth and
  states the five-places-plus-`buildLogEntry` rule where a reader adding a sixth type will
  find it. The `undo.test.ts` comment now says what its fixture actually is — a Phase 2 log
  — and why keeping it that way is the point.
- **Files modified:** `src/core/actions.ts`, `tests/core/undo.test.ts`
- **Verification:** `npm run check:pure` clean; no behaviour change.
- **Committed in:** `5ddb532`

### Plan Text Not Followed

**`canApply(SCHEDULE_COMPILED)`'s contiguity check was not implemented.** See Decisions
Made, first entry. The `<behavior>` bullet's substance holds — a non-contiguous schedule is
refused — but by the structural guard, with a more precise reason, one layer down. The
plan's acceptance criterion for this file
(`grep -Ec "scheduleAlreadyCompiled|scheduleNotCompiled|malformedSchedule" src/core/reduce.ts`
returns at least 6) still passes at exactly 6.

---

**Total deviations:** 4 auto-fixed (2 × Rule 3, 2 × Rule 2), 1 documented departure from
plan text.
**Impact on plan:** None on scope. No new field, no new bound, no new control, no
dependency. `package.json` is byte-identical.

## Issues Encountered

**The known `tests/ui/ban-list.test.tsx` timeout did not reproduce on this run.** It is
logged in `deferred-items.md` as a pre-existing flake that exceeds vitest's 5000 ms default
under full-suite parallel load. `npm run verify` reported **1003 passed, 0 failed** at
`642be41`. That is not evidence the flake is fixed — nothing in this plan touches its path,
and it takes ~4.2 s solo with almost no headroom — so it stays in `deferred-items.md`
unchanged. It should be expected to reappear on a busier machine.

## Verification Evidence

`npm run verify` at `642be41`: `check:pure` 0 violations in 16 files, `check:nohtml` 0
violations in 60 files, **1003 tests passed across 44 files**, typecheck clean on both
projects, `vite build` succeeded, service worker manifest 322 URLs / 957.9 kB precached.

Every acceptance criterion, run against the tree at `642be41`:

| # | Check | Expected | Actual |
|---|-------|----------|--------|
| 1 | `grep -c "export function compile" src/core/compile.ts` | 1 | 1 |
| 2 | `grep -vE '^\s*(\*\|//)' src/core/compile.ts \| grep -Ec "\b6\b"` | 0 | 0 |
| 3 | `grep -Ec "export function (selectSchedule\|selectRoundKind\|selectSlotKind)" src/core/selectors.ts` | 3 | 3 |
| 4 | `grep -c "slotKind" src/core/model.ts` | 0 | 0 |
| 5 | `grep -c "SCHEDULE_COMPILED" src/core/actions.ts` | ≥ 4 | 4 |
| 6 | `grep -c "schedule/compiled" src/core/import-guard.ts` | ≥ 1 | 2 |
| 7 | `grep -Ec "scheduleAlreadyCompiled\|scheduleNotCompiled\|malformedSchedule" src/core/reduce.ts` | ≥ 6 | 6 |
| 8 | `grep -c "scheduleCompiled(" src/store.ts` | 1, between the two | 1, at `:244` between `:235` and `:247` |
| 9 | `grep -c "priority-card tie-breaks will advance" src/core/actions.ts` | 0 | 0 |
| 10 | `grep -c "priority-card tie-breaks will advance" src/store.ts` | 0 | 0 |
| 11 | `grep -c "schedule/reordered" src/core/actions.ts` | 0 | 0 |
| 12 | `grep -c "schedule" src/ui/components/BoardGrid.tsx` | ≥ 2 | 9 |
| 13 | `grep -Ec "#[0-9a-fA-F]{3,6}" src/ui/components/BoardGrid.css` | 0 | 0 |
| 14 | `grep -c -- "--pill-h" src/ui/components/BoardGrid.css` | 0 | 0 |

Behavioural assertions the plan named specifically, all present and passing:

- `compile([{ kind: 'mega', count: 9 }], 6)` returns 6 specs and does not throw —
  `tests/core/compile.test.ts`.
- `selectSchedule` on an empty schedule returns `config.rounds` open specs —
  `tests/core/selectors.test.ts`.
- Mutating `selectSchedule(state)[0].kind` leaves `state.schedule` unchanged —
  `tests/core/selectors.test.ts`.
- Export → import → fold reproduces `['open','mega','open','mega','open','open']` —
  `tests/core/import-guard.test.ts`.
- `canApply(draft/started)` with no schedule returns `{ ok: false, reason: 'scheduleNotCompiled' }`
  — `tests/core/reduce.test.ts`.
- A migrated schema-2 document folds without throwing and yields `state.schedule === []` —
  `tests/core/reduce.test.ts`.
- A 400-round `schedule/compiled` is refused by the import guard —
  `tests/core/import-guard.test.ts`.
- Exactly two header cells contain `Mega` at `count: 2`; the marker element is in all six and
  empty in four; a Mega header's accessible text is `Mega round`; an all-open board renders
  no `Mega` anywhere — `tests/ui/draft-board.test.tsx`.
- `git diff --stat 7083d4c~1 HEAD -- package.json package-lock.json` → empty. Runtime
  `dependencies` is still exactly `preact` and `@preact/signals`.

## Known Stubs

One, stated in code rather than left to be discovered:

| Placeholder | File | Replaced by |
|-------------|------|-------------|
| `schedule: compile(config.rules, ROUNDS)` in `handleStart` | `src/ui/screens/ConfigScreen.tsx` | 03-03 — the host's reordered preview state. The line carries a comment saying so. It is not a stub in the sense that blocks this plan's goal: with no reorder control yet there is nothing to permute, so the canonical order genuinely IS the approved schedule, and RULE-02's surface is fully delivered. |

## Threat Flags

None. Every file this plan touched that sits at a trust boundary was already in the plan's
`<threat_model>`: `import-guard.ts` (T-03-06), the structural guard (T-03-07), `reduce.ts`'s
`canApply` (T-03-08). T-03-09 stays accepted and unmitigated as specified — an imported
document whose schedule contradicts its picks folds, because `DraftState` holds no roster
and `canApply` cannot ask a question about types or base stats. No new endpoint, auth path,
file access pattern or schema change at a trust boundary was introduced.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Ready. `selectRoundKind(state, r)` answers correctly for every `r`, which is this plan's
stated exit gate and what every later plan in the phase reads.

- **03-03** replaces one line — `schedule: compile(config.rules, ROUNDS)` in `handleStart` —
  with the host's reordered preview state. `scheduleCompiled` already copies element by
  element, so a preview array re-rendered after Start cannot mutate a written log entry.
- **03-04 / 03-06** filter a Mega round's pool through `selectRoundKind`. The tag is a tag
  (D-07): nothing is materialized as an id list.
- **03-10 / 03-11** read `selectSlotKind` for the swap predicate. Recovery is one array read
  and nothing stores a second copy of the constraint (D-08).
- **03-08** can assert `rng.cursor === 0` freely — it is now stated in three places that
  nothing advances it.

**Carried forward:** the `ban-list` timeout in `deferred-items.md`, unchanged and unfixed.
It passed on this machine this run; that is luck, not a resolution.

---
*Phase: 03-compiled-rules-priority-cards-swaps*
*Completed: 2026-08-17*

## Self-Check: PASSED

Every file this summary claims exists, and all six commit hashes it cites resolve in
`git log --all`. Checked 2026-08-17 at `642be41`.
