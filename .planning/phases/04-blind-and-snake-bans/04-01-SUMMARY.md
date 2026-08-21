---
phase: 04-blind-and-snake-bans
plan: 01
subsystem: core-schema
tags: [schema, migration, import-guard, bans]
requires: []
provides:
  - SCHEMA_VERSION = 4
  - TournamentConfig.bansPerPlayer
  - TournamentConfig.duplicateBanPolicy
  - DuplicateBanPolicy union
  - V3_CONFIG_DEFAULTS
  - migrateV3ToV4
  - MAX_BANS_PER_PLAYER
  - DUPLICATE_BAN_POLICIES
affects:
  - src/core/model.ts
  - src/core/migrate.ts
  - src/core/import-guard.ts
  - src/ui/screens/ConfigScreen.tsx
tech-stack:
  added: []
  patterns:
    - Omit-derived V3Config/V3Doc arm typing, never an as-cast
    - defaults table exported once and imported by the guard, never re-declared
    - coerce-not-refuse for a bounded field with no reader
key-files:
  created: []
  modified:
    - src/core/model.ts
    - src/core/migrate.ts
    - src/core/import-guard.ts
    - src/ui/screens/ConfigScreen.tsx
    - tests/core/model.test.ts
    - tests/core/migrate.test.ts
    - tests/core/import-guard.test.ts
    - tests/adapters/persistence.test.ts
decisions:
  - D-10 bansPerPlayer is 0 at hostBanlist and >= 1 at blind/snake, and the >= 1 half is the feasibility gate's question rather than the type's
  - D-19/D-20 duplicateBanPolicy is stored and read by nothing this phase, taking depth's posture
  - duplicateBanPolicy coerces to bothApply on an unrecognised value while every other config field refuses the file — justified by it being the only field with no reader
  - V3_CONFIG_DEFAULTS.bansPerPlayer = 0 is deliberately NOT the config screen's eventual default of 1, and the two constants must not be unified
metrics:
  duration: ~35 min
  tasks: 2
  commits: 4
  files-changed: 26
  completed: 2026-08-21
---

# Phase 4 Plan 01: Schema 4 and the Two Ban Config Fields Summary

The tournament document is at schema 4 carrying `bansPerPlayer` and `duplicateBanPolicy`,
a Phase 3 save still resumes and reports version 4, and both fields are bounded at the one
place untrusted input enters.

## What Was Built

`TournamentConfig` gained two fields and `SCHEMA_VERSION` became `4`. `migrate.ts` gained
`V3_CONFIG_DEFAULTS` and a config-only `migrateV3ToV4` arm that passes the log through
entry for entry; versions 1 and 2 chain into it, and version 4 is the identity passthrough.
`import-guard.ts` gained `MAX_BANS_PER_PLAYER = 24` and `DUPLICATE_BAN_POLICIES`, and
`buildConfig` now rebuilds both fields from the imported `V3_CONFIG_DEFAULTS`.

`src/adapters/persistence.ts` was not edited, by design. It asks
`SUPPORTED_SCHEMA_VERSIONS` rather than comparing `SCHEMA_VERSION`, so adding `4` to that
list moved the wrapper compare by construction. `git diff` against the phase base confirms
the file is byte-identical.

## Task Commits

| Task | Gate  | Commit    | What                                              |
| ---- | ----- | --------- | ------------------------------------------------- |
| 1    | RED   | `b005f50` | Moved assertions, v3→v4 arm tests, Phase 3 resume |
| 1    | GREEN | `1d1a38d` | Schema 4, both config fields, `migrateV3ToV4`     |
| 2    | RED   | `0459eb9` | Hostile-value table, union coercion, round trip    |
| 2    | GREEN | `434c56a` | `MAX_BANS_PER_PLAYER`, `DUPLICATE_BAN_POLICIES`   |

## TDD Gate Compliance

Both tasks ran RED → GREEN with the RED commit preceding the GREEN commit in git history.
No REFACTOR commit: neither implementation had anything to clean up that the GREEN step had
not already written in its final shape.

One RED-phase assertion passed rather than failed, and it was expected to. In
`describe('a draft saved by Phase 3')`, the assertion that `load()` is not null for a
wrapper at version 3 passes before the bump, because wrapper version 3 was already
supported. Its value is at the moment of the bump: it fails if the list is edited by
*replacing* 3 with 4 rather than appending, which is the exact regression the plan's
Pitfall 5 describes. Its sibling assertions in the same block did fail in RED.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `ConfigScreen.handleStart` could not compile**

- **Found during:** Task 1
- **Issue:** `ConfigScreen.tsx:1076` builds an explicitly typed
  `const config: TournamentConfig = { … }`. Two new required fields make that literal a
  `TS2739` error, so `npm run typecheck` — and therefore `npm run build` and
  `npm run verify` — could not pass. The plan's `files_modified` does not list the file,
  but `04-RESEARCH.md` §Discretion 6 names `ConfigScreen.handleStart` as one of the **five**
  sites a new config field must land, so the omission is in the frontmatter rather than in
  the analysis.
- **Fix:** Added `bansPerPlayer: 0` and `duplicateBanPolicy: 'bothApply'` as literals with
  a comment recording that 04-05 owns the actual controls and that `0` is correct only
  because `blind` and `snake` are still disabled on that screen. No control, no label and
  no UI surface was added — the BAN-07 surface remains 04-05's, per D-19.
- **Files modified:** `src/ui/screens/ConfigScreen.tsx`
- **Commit:** `1d1a38d`
- **Conflict risk:** none in-wave. 04-01 is alone in wave 1; 04-05 is wave 4.

**2. [Rule 3 - Blocking] 19 test config fixtures could not compile**

- **Found during:** Task 1
- **Issue:** `tsconfig.json` includes `tests`, so every `TournamentConfig` literal in the
  suite fails to type-check once two required fields are added. Nineteen files beyond the
  three the plan lists were affected.
- **Fix:** Added the two fields at their `hostBanlist` values to each fixture. Mechanical
  and behaviour-preserving; every one of these fixtures is a `hostBanlist` tournament, so
  `0` / `'bothApply'` is the value they already described.
- **Files modified:** `tests/adapters/tab-lock.test.ts`, `tests/core/cards.test.ts`,
  `tests/core/reduce.test.ts`, `tests/core/selectors.test.ts`, `tests/core/swaps.test.ts`,
  `tests/core/undo.test.ts`, `tests/store-ownership.test.ts`, and 11 files under `tests/ui/`
- **Commit:** `1d1a38d`

**3. [Rule 1 - Bug] Two shipped assertions the research checklist did not list**

- **Found during:** Task 1
- **Issue:** `04-RESEARCH.md` §Discretion 6 enumerates six shipped assertions the bump
  breaks. Two more exist, both of the same literal-beside-the-constant shape:
  `tests/core/migrate.test.ts:242` (`migrateV1ToV2` → `.toBe(3)`) and `:327`
  (`migrateV2ToV3` → `it('returns a document at version 3')`). Both break because
  `migrated()` runs the whole chain, which now reaches 4.
- **Fix:** Moved both to `4` alongside their `SCHEMA_VERSION` companions, and renamed the
  two test titles that had gone stale ("two arms away" → "three arms away").
- **Files modified:** `tests/core/migrate.test.ts`
- **Commit:** `b005f50`

### Deliberate Interpretation

**`duplicateBanPolicy` coerces where `banMode` refuses.** The plan's `<action>` says to
guard it "exactly as `banMode` is guarded", and `banMode` returns `null` for an unrecognised
value. The `<behavior>` bullets, the acceptance criteria and threat T-04-02 all three
specify coercion to `'bothApply'` instead. Coercion was implemented, on the reading that
"exactly as `banMode`" refers to the `isOneOf`-against-a-`readonly`-array mechanism rather
than to the refusal disposition. The departure from the file's refuse-do-not-repair posture
is documented at the branch itself: this is the only field in `buildConfig` that nothing
reads, so a bad value cannot produce a wrong tournament, only a wrong stored string.

### Gate Phrasing Note — not a code defect

The acceptance criterion `grep -v '^ \*' src/core/model.ts | grep -c "duplicateBanPolicy"`
is specified as returning at least 3 for "interface field, `copyConfig`, type alias use".
It returns **2**, because `grep -c` counts matching *lines* and `copyConfig`'s line mentions
the identifier twice. All three named things exist:

- `src/core/model.ts:89` — `export type DuplicateBanPolicy =`
- `src/core/model.ts:268` — `duplicateBanPolicy: DuplicateBanPolicy;`
- `src/core/model.ts:505` — `duplicateBanPolicy: config.duplicateBanPolicy,`

`grep -o | wc -l` returns 3 and case-insensitive `grep -ci` returns 3. No code was added to
satisfy the literal phrasing. The `bansPerPlayer` companion criterion (at least 2) passes as
written.

## Authentication Gates

None.

## Verification

| Check                                                     | Result             |
| --------------------------------------------------------- | ------------------ |
| `check:pure`                                               | 0 violations, 18 files |
| `check:nohtml`                                             | 0 violations, 67 files |
| Full suite                                                 | 1570 passed, 53 files |
| `tsc -p tsconfig.json` and `-p tsconfig.node.json`         | clean              |
| `vite build` + `build-sw-manifest`                         | built, 322 URLs precached |
| `git diff --stat src/adapters/persistence.ts`              | empty              |
| `git diff --stat package.json package-lock.json`           | empty              |
| `grep -rn "schemaVersion ===" src/`                        | no sites at all    |
| `grep -c "a draft saved by Phase 3"` in persistence tests  | 1                  |

`npm run verify` itself was not invoked as one command: this worktree has no
`node_modules`, and the instructions forbid linking the main checkout's. Each of its four
stages was run instead by invoking the main checkout's binaries with the worktree as cwd,
which touches nothing outside this tree. Output above is from those runs.

## Known Stubs

None that block this plan's goal. `duplicateBanPolicy` is stored and read by nothing, which
is the deliberate `depth` posture recorded in D-19 and in the field's own doc block, not a
stub. The `bansPerPlayer: 0` / `duplicateBanPolicy: 'bothApply'` literals in
`ConfigScreen.handleStart` are placeholders that 04-05 replaces with host-chosen values when
it builds the controls; they are correct today because `blind` and `snake` are disabled.

## Threat Flags

None. This plan adds two scalar fields and no new object shape, endpoint, auth path or file
access. T-04-05 (prototype pollution) is unchanged and was re-asserted by a test.

## Self-Check: PASSED

- `src/core/model.ts` — FOUND
- `src/core/migrate.ts` — FOUND
- `src/core/import-guard.ts` — FOUND
- `.planning/phases/04-blind-and-snake-bans/04-01-SUMMARY.md` — FOUND
- `b005f50`, `1d1a38d`, `0459eb9`, `434c56a` — all FOUND in `git log`
