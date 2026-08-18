---
phase: 03-compiled-rules-priority-cards-swaps
plan: 01
subsystem: database
tags: [schema-migration, typescript, preact, import-guard, serialization]

# Dependency graph
requires:
  - phase: 02-host-configured-draft-night
    provides: schemaVersion 2, migrateV1ToV2, buildConfig's absent-versus-malformed posture, NumericField, the five-group config screen
provides:
  - SCHEMA_VERSION 3 and the migrateV2ToV3 arm, config-only, log untouched
  - TournamentConfig.rules — the CompositionRule union carrying the D-03 pick-guard doc comment
  - TournamentConfig.megaFormeBans, swapBudget and swapRounds
  - DraftState.schedule, empty until schedule/compiled
  - RoundKind and RoundSpec as types in actions.ts, no action family yet
  - V2_CONFIG_DEFAULTS, imported by import-guard rather than re-literalled
  - MAX_SWAP_BUDGET, MAX_SWAP_ROUNDS, MAX_COMPOSITION_RULES, MAX_MEGA_FORME_BANS
  - the Swaps config group — swap budget and swap rounds reaching TournamentConfig
affects: [03-02 schedule compiler, 03-03 Mega rules coupling, 03-04 Mega-forme bans, 03-05 feasibility gate, 03-10 swap spending, 03-11 swap rounds]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Migration arms are typed against the shape they produce (V2Doc / V2Config via Omit), not cast"
    - "A config field with a true answer in the document is derived, never defaulted"
    - "A rule union carries its own non-compilability taxonomy as a doc comment, with nothing implementing it"

key-files:
  created:
    - .planning/phases/03-compiled-rules-priority-cards-swaps/deferred-items.md
  modified:
    - src/core/model.ts
    - src/core/actions.ts
    - src/core/migrate.ts
    - src/core/import-guard.ts
    - src/adapters/persistence.ts
    - src/ui/screens/ConfigScreen.tsx
    - src/ui/screens/ConfigScreen.css

key-decisions:
  - "migrateV2ToV3 performs no log surgery — nothing in schema 3 makes an existing entry unfoldable, and a spliced synthetic schedule/compiled would need a fresh seq and be stamped after picks it logically precedes"
  - "rules is derived from megasRequiredPerTeam rather than defaulted, in both migrate and the import guard, so a pre-field file and a migrated file agree"
  - "megasRequiredPerTeam stays alongside the rule list — one fact in two shapes, the scalar host-facing and the list compiler-facing"
  - "The v1 and v2 migration arms are typed with Omit-derived V2Config / V2Doc rather than an as-cast, so each arm stays strictly checked against what it actually produces"
  - "persistence.ts needed no code change — it already asks SUPPORTED_SCHEMA_VERSIONS rather than comparing SCHEMA_VERSION, so the bump moved it by definition"
  - "The Swaps group adds no feasibility code — swapBudgetNotAnInteger and swapRoundsNotAnInteger are 03-05's, and a second authority on satisfiability is what feasibility.ts's doc block forbids"

patterns-established:
  - "Migration arm typing: Omit<TournamentConfig, ...new fields> names the older shape so the chain cannot be skipped"
  - "Bound constants are independent of each other by default — MAX_SWAP_BUDGET and MAX_SWAP_ROUNDS do not reuse MAX_ROUNDS, because they answer different questions"
  - "COMPOSITION_RULE_KINDS mirrors the union as runtime data, the same shape BAN_MODES and DEPTHS use"

requirements-completed: [SWAP-01]

# Metrics
duration: 42min
completed: 2026-08-17
---

# Phase 3 Plan 01: Schema 3 and the Swaps Config Group Summary

**Document schema 3 across all four config sites — a `CompositionRule` rule list derived
from `megasRequiredPerTeam`, a Mega-forme ban list, and the two swap numbers the host now
types on a new `Swaps` fieldset — with a `migrateV2ToV3` arm that upgrades a Phase 2 save
without touching one log entry.**

## Performance

- **Duration:** 42 min
- **Started:** 2026-08-17T20:54:00Z
- **Completed:** 2026-08-17T21:36:00Z
- **Tasks:** 3
- **Files modified:** 24 (7 source, 16 test, 1 planning doc created)

## Accomplishments

- `SCHEMA_VERSION` is 3, and all three version-compare sites (`store.ts`,
  `adapters/persistence.ts`, `import-guard.ts`) route through `migrate`. A Phase 1 document
  now reaches version 3 through both arms inside one `migrate` call.
- `migrateV2ToV3` is config-only. `migrated(doc).log` is deep-equal to `doc.log`, asserted
  directly, and the reason no synthetic `schedule/compiled` is spliced in is recorded in the
  function's doc block.
- `CompositionRule` carries the full D-03 pick-guard comment — the compilation criterion
  verbatim, the three non-compilable classes with an example each, `guardPick`'s shape and
  why it cannot be a `canApply` arm, and a plain statement that nothing implements it.
  Nothing does: `grep -c "kind: 'custom'"` is 0 and there is no `predicate:` field.
- The untrusted boundary bounds all four new fields and refuses rather than clamps.
  `rules[].kind` is checked against the union and `rules[].count` against the document's own
  `rounds`, so a file cannot declare a rule kind this build has no compiler for.
- The host sets a swap budget and a swap-round count on a new `Swaps` fieldset sitting
  between `Bans` and `Pool`, and both survive Start into `TournamentConfig`.

## Task Commits

1. **Task 1: Schema 3 — the config shape and the version 2 upgrade arm**
   - `e077090` (test — RED)
   - `eb3c8cb` (feat — GREEN)
2. **Task 2: The untrusted boundary — bounds for four new fields**
   - `74cedd2` (test — RED)
   - `5974003` (feat — GREEN)
3. **Task 3: The Swaps config group** — `b86bb11` (feat)

## Files Created/Modified

- `src/core/model.ts` — `SCHEMA_VERSION = 3`; `CompositionRule` and its D-03 comment; four
  new `TournamentConfig` fields; `DraftState.schedule`; `copyConfig` copies `rules` and
  `megaFormeBans` element by element; `initialState` seeds `schedule: []`.
- `src/core/actions.ts` — `RoundKind` and `RoundSpec` as types only, beside
  `PoolBuiltPayload`. No constant, payload, creator, guard or `Intent` member — that is 03-02.
- `src/core/migrate.ts` — `SUPPORTED_SCHEMA_VERSIONS` is `[1, 2, 3]`; `V2_CONFIG_DEFAULTS`;
  `migrateV2ToV3`; the arm chain `3 → identity`, `2 → migrateV2ToV3`,
  `1 → migrateV2ToV3(migrateV1ToV2(doc))`; `V2Config` / `V2Doc` types.
- `src/core/import-guard.ts` — four bound constants; `buildCompositionRules`;
  `COMPOSITION_RULE_KINDS`; the four fields read from `raw` with `V2_CONFIG_DEFAULTS` as the
  absent case and `rules` derived rather than defaulted.
- `src/adapters/persistence.ts` — comment only. The third compare site already asked
  `SUPPORTED_SCHEMA_VERSIONS`; the addition names why no import-only test can see this branch.
- `src/ui/screens/ConfigScreen.tsx` — the `Swaps` fieldset, two raw-string states with parsed
  derivations, four new fields in the `handleStart` config literal, two new `useCallback`
  dependencies, corrected group-order doc block.
- `src/ui/screens/ConfigScreen.css` — a comment recording that the group needs no geometry of
  its own and why `--space-5` is deliberately not used there.
- 16 test files — every `TournamentConfig` literal widened field by field; new blocks for the
  v2→v3 arm, the version 3 boundary, a version 2 document, a Phase 2 resume, and the `Swaps` group.
- `.planning/phases/03-compiled-rules-priority-cards-swaps/deferred-items.md` — created.

## Decisions Made

- **Migration arms are typed, not cast.** `migrateV1ToV2` now returns `V2Doc`
  (`Omit<TournamentConfig, 'rules' | 'megaFormeBans' | 'swapBudget' | 'swapRounds'>` on the
  config). The alternative — `as unknown as TournamentDoc` on the return — would have
  disabled field checking on the whole literal at exactly the point where a dropped field is
  invisible. A current `TournamentDoc` is still assignable to `V2Doc`, so the version 2 arm
  hands `migrate`'s own argument straight through.
- **`persistence.ts` needed no code change.** Phase 2's decision 4 already replaced the
  `SCHEMA_VERSION` comparison with a `SUPPORTED_SCHEMA_VERSIONS.includes` check, so the bump
  moved that site by definition. The plan's action anticipated a change; the correct action
  was to prove it with a test and record why the branch is invisible to import-only tests.
  Five new assertions in `tests/adapters/persistence.test.ts` cover the schema-2 resume, the
  derived rule list, the lossless swap defaults, the empty folded schedule, and the schema-4
  refusal — all of which passed on first run, which is the evidence.
- **The `Swaps` group holds raw strings shaped like `megasRequiredRaw`, not like
  `poolOverride`.** `poolOverride` is `string | null` because it has a preset to fall back
  to; the swap fields have no preset, so `useState('0')` plus a `parseNumericField` `useMemo`
  is the closer analog. The load-bearing property the plan named — raw string and parsed
  value held separately, no clamping — holds either way.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `import-guard.buildConfig` and `ConfigScreen.handleStart` had to
construct the four fields inside Task 1**

- **Found during:** Task 1 (Schema 3)
- **Issue:** Task 1's own acceptance criterion is `npx vitest run tests/core/` exits 0. It
  could not: widening `TournamentConfig` left `buildConfig` returning a config without
  `rules`, so `copyConfig` threw `Cannot read properties of undefined (reading 'map')` in
  `tests/core/import-guard.test.ts`'s round-trip test. `tsc` failed at both sites for the
  same reason. This is the exact failure the plan's `<sizing_note>` predicts: the schema bump
  cannot be half-shipped.
- **Fix:** Task 1 added the *construction* at both sites — `rules` derived from
  `megasRequiredPerTeam`, the other three from `V2_CONFIG_DEFAULTS` / literals. Task 2 then
  replaced the import guard's hardcoded defaults with bounded reads of `raw`, and Task 3
  replaced ConfigScreen's `0`s with the host's state. No work was duplicated; the split moved
  by one task so that every commit leaves the tree building.
- **Files modified:** `src/core/import-guard.ts`, `src/ui/screens/ConfigScreen.tsx`
- **Verification:** `npx vitest run tests/core/` and `npx tsc --noEmit` both clean at `eb3c8cb`.
- **Committed in:** `eb3c8cb`

**2. [Rule 3 - Blocking] Five hardcoded `toBe(2)` schema assertions in
`tests/adapters/persistence.test.ts`**

- **Found during:** Task 1
- **Issue:** Three tests asserted `SCHEMA_VERSION` *and* the literal `2` on adjacent lines.
  The literal is the point of those assertions — it stops the two constants agreeing
  vacuously — so it had to move with the bump rather than be deleted.
- **Fix:** Updated to `3`, and renamed `comes back at version 2, …` to `comes back at the
  current version, …` so the test name does not go stale on the next bump.
- **Files modified:** `tests/adapters/persistence.test.ts`
- **Verification:** `npx vitest run tests/adapters/persistence.test.ts` — 36 passed.
- **Committed in:** `eb3c8cb`

**3. [Rule 2 - Missing correctness] `migrate.ts`'s module header claimed the file did nothing**

- **Found during:** Task 1
- **Issue:** The header still read "There is one schema version and version 1 is a
  passthrough, so this file does nothing today" — stale since Phase 2 and doubly false after
  this plan. `migrate.ts` is the file a reader opens to answer "can this build read this
  document"; a header that misdescribes it by two versions is an active hazard.
- **Fix:** Rewritten to describe three versions and two arms while keeping the structural
  argument the original made for the file existing before it did anything.
- **Files modified:** `src/core/migrate.ts`
- **Verification:** `npm run check:pure` clean; no behaviour change.
- **Committed in:** `eb3c8cb`

**4. [Rule 3 - Blocking] `import-guard.buildConfig`'s doc block described six optional keys**

- **Found during:** Task 2
- **Issue:** The absent-versus-malformed doc block named only the version 2 keys and only
  `V1_CONFIG_DEFAULTS`. With four more optional keys and a second defaults table, following
  it would have led a reader to require the version 3 keys and refuse every Phase 2 file.
- **Fix:** Extended to name both tables and to record `rules` as the version 3 field with the
  same derived-not-defaulted exception `poolSize` has.
- **Files modified:** `src/core/import-guard.ts`
- **Verification:** `npx vitest run tests/core/import-guard.test.ts` — 126 passed.
- **Committed in:** `5974003`

---

**Total deviations:** 4 auto-fixed (3 × Rule 3, 1 × Rule 2)
**Impact on plan:** All four were forced by the schema bump landing atomically, which the
plan's own `<sizing_note>` predicted. No scope creep: no new field, no new bound, no new
control beyond what `<interfaces>` specifies.

## Issues Encountered

**`tests/ui/ban-list.test.tsx` times out under full-suite parallel load — pre-existing, not
fixed.** One Phase 2 test (`survives 187 bans at eight players and Exact, and dies on the
188th`) exceeds vitest's default 5000 ms timeout when `npm run verify` runs all 43 files in
parallel. It passes in isolation at every commit tried, and it takes ~4.2 s solo on this
machine, so it has almost no headroom.

Proved pre-existing rather than assumed: `src/` was checked out at `e663518` — the last
commit before this plan — with the current `tests/` in place, and the full suite was run. The
same test failed with the same message. Nothing in this plan touches its path: the
ConfigScreen change is inside `handleStart`, a callback this test never invokes, and
`copyConfig`'s two new `.map()` calls run only on `fold`, which this test never reaches.

Logged to
`.planning/phases/03-compiled-rules-priority-cards-swaps/deferred-items.md` with a suggested
fix, and deliberately not fixed here — SCOPE BOUNDARY puts an unrelated Phase 2 test outside
this plan, and widening a measured worst-case assertion to make a gate green would be worse
than the flake.

**Consequence for the gate:** `npm run verify` reports `1 failed | 943 passed`. Every other
step is clean, run individually:

| Step | Result |
|------|--------|
| `npm run check:pure` | 0 violations in 15 files |
| `npm run check:pure:selftest` | passed |
| `npm run check:nohtml` | 0 violations in 59 files |
| `npm run build` (typecheck + vite + sw manifest) | built, 322 URLs precached |
| `npx vitest run tests/core/` | 414 passed |
| `npx vitest run tests/ui/` | 361 passed |
| `npx vitest run tests/adapters/` | passed |
| `npx vitest run tests/ui/ban-list.test.tsx` alone | 17 passed |

## Verification Evidence

- `grep -c "SCHEMA_VERSION = 3" src/core/model.ts` → 1
- `grep -c "export const V2_CONFIG_DEFAULTS" src/core/migrate.ts` → 1
- `grep -c "migrateV2ToV3" src/core/migrate.ts` → 6 (declaration, doc references, both call sites)
- `grep -c "\[1, 2, 3\]" src/core/migrate.ts` → 1
- `grep -c "kind: 'custom'" src/core/model.ts` → 0
- `grep -c "guardPick" src/core/model.ts` → 1 (named in the comment, never declared)
- `grep -v '^ \*' src/core/model.ts | grep -c "predicate:"` → 0
- `grep -Ec "export const (MAX_SWAP_BUDGET|MAX_SWAP_ROUNDS|MAX_COMPOSITION_RULES|MAX_MEGA_FORME_BANS)" src/core/import-guard.ts` → 4
- `grep -c "V2_CONFIG_DEFAULTS" src/core/import-guard.ts` → 5
- `grep -c "swapBudget" src/ui/screens/ConfigScreen.tsx` → 7
- `grep -Ec "#[0-9a-fA-F]{3,6}" src/ui/screens/ConfigScreen.css` → 0
- `git diff --stat e663518 HEAD -- package.json` → empty. No dependency added; runtime
  `dependencies` is still exactly `preact` and `@preact/signals`.

## Known Stubs

None that block this plan's goal. Two placeholders are recorded because a later plan replaces
them, and both are stated in code rather than left to be discovered:

| Placeholder | File | Replaced by |
|-------------|------|-------------|
| `megaFormeBans: []` in `handleStart` | `src/ui/screens/ConfigScreen.tsx` | 03-04 — the host's Mega-forme ban surface. SWAP-01 does not depend on it. |
| `DraftState.schedule` folds as `[]` for every document | `src/core/model.ts` | 03-02 — the `schedule/compiled` action family. An empty schedule folding as all-open is the specified behaviour for a migrated schema-2 document, not a gap. |

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Ready. Every plan in wave 2 onward can now read a config field this plan added:

- **03-02** owns `schedule/compiled` and consumes `RoundKind` / `RoundSpec` exactly as
  declared here. `DraftState.schedule` exists and folds empty.
- **03-03** owns keeping `megasRequiredPerTeam` and `rules[0].count` in step. This plan
  deliberately left them free to disagree at the import boundary (T-03-04, accepted), so
  03-03 is the only place that reconciles them.
- **03-04** replaces `megaFormeBans: []` in `handleStart` with the host's list. The field, its
  bound, and its element-by-element copy are already in place.
- **03-05** adds `swapBudgetNotAnInteger`, `swapRoundsNotAnInteger` and
  `swapRoundsOnExactPool`. This plan added no feasibility code on purpose, so 03-05 arrives at
  a `feasibility.ts` with one authority in it.
- **03-10 / 03-11** spend `swapBudget` and run `swapRounds`. Both values now round-trip
  through autosave, export and import.

**Carried forward:** the `ban-list` timeout in `deferred-items.md`. It will make
`npm run verify` red on this machine until someone gives that test an explicit timeout.

---
*Phase: 03-compiled-rules-priority-cards-swaps*
*Completed: 2026-08-17*

## Self-Check: PASSED

Every file this summary claims exists, and every commit hash it cites resolves in
`git log --all`. Checked 2026-08-17.
