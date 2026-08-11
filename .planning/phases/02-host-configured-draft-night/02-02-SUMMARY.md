---
phase: 02-host-configured-draft-night
plan: 02
subsystem: schema-and-persistence
tags: [schema-migration, import-guard, serialization, backwards-compatibility]

requires:
  - "src/core/model.ts — TournamentConfig, SCHEMA_VERSION"
  - "src/core/migrate.ts — migrate, SUPPORTED_SCHEMA_VERSIONS"
  - "src/core/import-guard.ts — the allow-list rebuild"
provides:
  - "SCHEMA_VERSION 2 and the six host-authored TournamentConfig fields"
  - "BanMode, TournamentDepth, DualMegaForme, DualMegaChoice types"
  - "V1_CONFIG_DEFAULTS — the v1 defaults in one place, imported by import-guard"
  - "migrateV1ToV2 — poolSize recovered from the materialized log"
  - "pool/built.seed, pool/built.megaCapableCount, draft/started.seed"
affects:
  - "02-04 (config screen authors these fields)"
  - "02-05 (pool sizing, Mega rules, constrained draw reads poolSize and megasRequiredPerTeam)"
  - "02-07 (host banlist writes bans and banMode)"
  - "Phase 3 RULE-09 (reads pool/built.megaCapableCount)"

tech-stack:
  added: []
  patterns:
    - "Absent-versus-malformed: an absent key is defaulted, a present-but-wrong key is refused"
    - "Literal-union validation via an `as const` runtime array mirroring the type"
    - "Migration as a chain of arms gated by SUPPORTED_SCHEMA_VERSIONS"

key-files:
  created:
    - "tests/core/model.test.ts"
  modified:
    - "src/core/model.ts"
    - "src/core/actions.ts"
    - "src/core/migrate.ts"
    - "src/core/import-guard.ts"
    - "src/store.ts"
    - "src/adapters/persistence.ts"
    - "tests/core/import-guard.test.ts"
    - "tests/core/migrate.test.ts"
    - "tests/core/reduce.test.ts"
    - "tests/core/selectors.test.ts"
    - "tests/core/undo.test.ts"
    - "tests/adapters/persistence.test.ts"
    - "tests/adapters/tab-lock.test.ts"
    - "tests/store-ownership.test.ts"

decisions:
  - "Seeds are validated as non-negative safe integers at the import boundary, not merely finite numbers, so nothing the guard admits is later dropped by isPoolBuiltAction"
  - "migrateV1ToV2 stamps seeds onto v1 log entries as well as widening the config — without it a restored Phase 1 draft folds to an empty pool"
  - "SUPPORTED_SCHEMA_VERSIONS is asked first in migrate, so the list stays the gate rather than becoming documentation"
  - "Phase 1's createTournament records a pool seed of 0 rather than reusing the order seed, because no pool draw was rolled"

metrics:
  duration: "~25 min"
  tasks_completed: 3
  commits: 6
  tests_added: 62
  tests_total: 443
  completed: 2026-08-11
---

# Phase 2 Plan 02: Schema Version 2 and the v1 Migration Summary

Bumped `SCHEMA_VERSION` to 2, widened `TournamentConfig` with the six fields the config
screen will author, and made every Phase 1 document — saved or exported — migrate rather
than be refused, at all three sites that compare a version.

## What Was Built

**The v2 document shape.** `TournamentConfig` gained `poolSize`, `bans`, `banMode`,
`megasRequiredPerTeam`, `dualMegaChoices` and `depth`, alongside three string-literal
unions (`BanMode`, `TournamentDepth`, `DualMegaForme`) and the `DualMegaChoice` interface.
`copyConfig` deep-copies both new arrays element by element; the compiler catches a
forgotten field but not a shallow copy, so `tests/core/model.test.ts` asserts reference
non-identity directly.

**The allow-list.** `import-guard.buildConfig` names all six fields with a bound each
(`poolSize` ≤ `MAX_POOL_IDS`, `bans` ≤ `MAX_POOL_IDS`, `megasRequiredPerTeam` ≤
`MAX_ROUNDS`, `dualMegaChoices` ≤ `MAX_POOL_IDS`), and `buildDualMegaChoices` follows
`buildPlayers` exactly — per-element `safeObject`, two named fields written out, duplicate
`speciesId` refused. Absent keys default from `V1_CONFIG_DEFAULTS`; present-but-malformed
keys refuse the whole config.

**The two config-time seeds.** `pool/built` carries `seed` and `megaCapableCount`,
`draft/started` carries `seed`, landed in all four required places: payload interface,
creator, structural guard, and `buildLogEntry`.

**The migration.** `migrateV1ToV2` recovers `poolSize` from the first `pool/built` ids
length rather than guessing at `players × rounds`, defaults the other five, and stamps the
seeds onto v1 log entries. `store.adoptTournament` and `persistence.load` both route
through `migrate` now; `load()`'s two separate defects — the wrapper version comparison and
the un-migrated return value — are both fixed.

## Key Decisions

**Seeds are non-negative safe integers at the boundary, not finite numbers.** The plan
specified `isFiniteNumber` for seeds in `buildLogEntry` while requiring `isPoolBuiltAction`
to reject a non-integer seed. That combination opens a hole: a document with `seed: 1.5`
imports successfully, then `apply` drops the action and the draft folds to an empty pool
with nothing said. `newSeed()` draws a `Uint32`, so the tighter check is also the accurate
one, and everything the guard admits the reducer now accepts.

**The migration touches the log, not just the config.** See Deviations — this is the
difference between must-have truth #1 holding and failing silently.

**Phase 1's recorded pool seed is `0`.** `createTournament` builds the pool from the whole
roster in display order; no draw is rolled. Recording the order seed there would be a
confidently wrong provenance claim, and 02-05's constrained draw supplies the real value.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `SUPPORTED_SCHEMA_VERSIONS` brought forward from Task 3 to Task 2**

- **Found during:** Task 2
- **Issue:** Task 1 set `SCHEMA_VERSION = 2` while the list stayed `[1]`, so `migrate`
  refused every document this build writes. 16 tests failed across four files, and Task 2's
  own tests could not run against a working import path.
- **Fix:** Moved `SUPPORTED_SCHEMA_VERSIONS = [1, 2]` and `V1_CONFIG_DEFAULTS` into Task 2.
  `V1_CONFIG_DEFAULTS` had to move regardless — Task 2's acceptance criteria require
  `import-guard.ts` to import it.
- **Files modified:** `src/core/migrate.ts`, `tests/core/migrate.test.ts`
- **Commit:** 36cc9aa

**2. [Rule 2 - Missing critical functionality] `migrateV1ToV2` also stamps the log's seeds**

- **Found during:** Task 3
- **Issue:** The plan describes `migrateV1ToV2` as widening the config only. But
  `isPoolBuiltAction` now requires `seed` and `megaCapableCount`, and `persistence.load`
  hands `migrate` the **raw parsed record** rather than a guard-rebuilt document. A v1
  `pool/built` therefore reaches `apply` without those fields, folds to "ignored", and the
  restored draft opens with an empty pool, no error, and every cell unavailable — exactly
  the failure decision 4 warns is invisible to import-only tests, arriving by another route.
  This would have broken must-have truth #1 while every test the plan specified still passed.
- **Fix:** `migrateV1ToV2` maps the log, defaulting absent seeds to `0`. Pinned by
  `folds to a POPULATED pool — the board renders, rather than coming back empty`.
- **Files modified:** `src/core/migrate.ts`, `tests/core/migrate.test.ts`
- **Commit:** 3a4adc4

**3. [Rule 3 - Blocking] `buildLogEntry` treats absent seeds as absent, not malformed**

- **Found during:** Task 2
- **Issue:** Requiring `seed` in `buildLogEntry` would refuse every Phase 1 export at the
  shape check — including the `pool/built` entry the migration recovers `poolSize` from.
- **Fix:** `optionalSeed` / `optionalCount` apply the same absent-versus-malformed rule
  `buildConfig` uses: absent yields `0`, present-but-wrong refuses.
- **Files modified:** `src/core/import-guard.ts`
- **Commit:** 36cc9aa

**4. [Rule 3 - Blocking] Config literals and creator callsites updated outside the named files**

- **Found during:** Tasks 1 and 2
- **Issue:** Widening `TournamentConfig` and changing the `poolBuilt` / `draftStarted`
  arities broke `npm run typecheck` at 9 config literals and 28 callsites across eight test
  files plus `src/store.ts`, none of which are in the tasks' `<files>` lists. Task 1's own
  verification gate is `npm run typecheck`.
- **Fix:** Added the six fields at their v1 defaults to every config literal, and the new
  arguments to every creator call. The plan's `<verification>` anticipates this ("except
  where a config literal gained the six fields").
- **Files modified:** eight test files, `src/store.ts`
- **Commits:** cf8b013, 36cc9aa

### Notes

- **Transient red between commits cf8b013 and 36cc9aa.** Task 1's gate (model test +
  typecheck) passes at cf8b013, but the full suite does not — the version-list coherence
  break above. The plan assigns whole-suite green to Task 3, and TDD RED commits are red by
  design, so this is consistent with the plan's own commit sequence. `npm run verify` exits
  0 at HEAD.
- **Acceptance grep adjusted.** The plan asks for
  `grep -c "SUPPORTED_SCHEMA_VERSIONS = \[1, 2\]"` to return 1; the declaration carries a
  type annotation (`: readonly number[]`), as it did before this plan, so the literal
  pattern does not match. Verified with the annotated pattern instead. Substance unchanged.
- **REQUIREMENTS.md deliberately not updated.** This plan's frontmatter states the
  requirement claim is foundational only — it touches no UI file, and DRFT-01, DRFT-03,
  DRFT-15, BAN-01 and BAN-02 are delivered as surfaces by 02-04, 02-05 and 02-07. Marking
  them complete here would record built surfaces that do not exist.

## Verification

- `npm run verify` exits 0 (`check:pure`, `check:nohtml`, 443 tests, build).
- `git diff --stat package.json` is empty — the two-runtime-dependency constraint holds.
- A Phase 1 JSON export imports and lands at `schemaVersion: 2` with its real pool size.
- A Phase 1 `localStorage` wrapper loads, migrates, and folds to a populated board.
- One v1 fixture walks `parseTournamentFile`, `persistence.load` and `adoptTournament` and
  reports version 2 from all three.
- `check:pure` reports 0 violations in 11 files under `src/core`.

## For the Next Plan

- `TournamentConfig` is ready to be authored: 02-04's config screen writes all six fields
  and they round-trip losslessly.
- `poolBuilt(ids, rosterVersion, checksum, seed, megaCapableCount)` — 02-05's constrained
  draw supplies the real pool seed in place of the `0` `createTournament` records today.
- `migrate` is now a chain. A version 3 needs one arm, one list entry, and one test.
- `store.ts` still carries `PHASE_ONE_PLAYERS` and `PHASE_ONE_ROUNDS`; 02-04 replaces the
  scaffolded config literal with the host's answers.

## Self-Check: PASSED

All 14 modified and 1 created file exist on disk. All 6 commits present in `git log`:
1e46d38, cf8b013, 2162ffe, 36cc9aa, 7a72f1f, 3a4adc4.
