---
phase: 05-full-tournament-brackets-standings-archive
plan: 01
subsystem: core-document
tags: [schema, migration, import-guard, feasibility, tournament]
requires:
  - src/core/model.ts
  - src/core/migrate.ts
  - src/core/import-guard.ts
  - src/core/feasibility.ts
provides:
  - SCHEMA_VERSION 5
  - MatchMetric
  - StageFormat
  - MatchResult
  - TournamentConfig.matchMetric
  - TournamentConfig.roundRobinFormat
  - TournamentConfig.bracketFormat
  - DraftState.matchResults
  - DraftState.cut
  - DraftState.tiebreakOrders
  - DraftState.lastReopenSeq
  - V4_CONFIG_DEFAULTS
  - MATCH_METRICS
  - STAGE_FORMATS
  - FeasibilityCode.bracketNeedsFourPlayers
  - FeasibilityInput.depth
affects:
  - src/app.tsx
  - src/ui/screens/BanStageScreen.tsx
  - src/ui/screens/ConfigScreen.tsx
tech-stack:
  added: []
  patterns:
    - "Omit-chained version aliases: V2Config → V3Config → V4Config → TournamentConfig"
    - "Allow-list rebuild with refuse-on-out-of-union for fields that have readers"
key-files:
  created: []
  modified:
    - src/core/model.ts
    - src/core/migrate.ts
    - src/core/import-guard.ts
    - src/core/feasibility.ts
    - src/app.tsx
    - src/ui/screens/BanStageScreen.tsx
    - src/ui/screens/ConfigScreen.tsx
    - tests/core/model.test.ts
    - tests/core/migrate.test.ts
    - tests/core/import-guard.test.ts
    - tests/core/feasibility.test.ts
    - tests/core/bans.test.ts
decisions: [D-01, D-02, D-04, D-08]
requirements: [TOUR-01, TOUR-07]
metrics:
  duration: ~35 min
  completed: 2026-08-26
  tasks: 3
  commits: 6
  tests: 2081 passing
---

# Phase 5 Plan 01: Schema 5 — the document learns to hold a tournament

Bumps the tournament document to schema 5 with the host's match metric and per-stage
best-of format, gives `DraftState` the four fields a tournament fold lands in, migrates
schema 4 losslessly by argument rather than by assumption, and adds the one feasibility
sentence that warns a host configuring a bracket for three people without ever blocking them.

## What Was Built

**Three config fields.** `matchMetric` (`'pokemonLeft' | 'koDifference'`, D-04/TOUR-07) and
`roundRobinFormat` / `bracketFormat` (`'bo1' | 'bo3'`, D-08). Per-stage rather than
per-tournament because the common shape of a draft night is a quick best-of-one round robin
feeding a best-of-three bracket, and one field for both would force the whole night to one
length. All three are string unions rather than numbers: a stored `3` is ambiguous between a
game count and a win count the moment a best-of-five is ever wanted.

**Four fold fields.** `matchResults: MatchResult[]`, `cut: { seeds, seq } | null`,
`tiebreakOrders`, and `lastReopenSeq: number`. Two of the four start at a sentinel rather
than an empty collection, and both sentinels are load-bearing:

- `cut` is `null`, not `{ seeds: [], seq }`. An empty cut is a state no bracket can be built
  from, so initialising to one would open every new tournament on a bracket nobody seeded.
- `lastReopenSeq` is `-1`, not `0`. `store.ts` allocates `max(seq) + 1` from `0`, so `0` is a
  legal `seq` belonging to a real first action — a field initialised to `0` would read as
  "reopened by that action" on every tournament that has never been reopened, which is both
  wrong and invisible.

`MatchResult.seq` comes off the envelope, never off array length, because the log may
legally have gaps and `seq` is what a compensating action targets.

**The 4 → 5 migration.** `V4_CONFIG_DEFAULTS` plus `migrateV4ToV5`, wired as the outermost
call in all four chain arms so a version 1 document reaches schema 5 in one `migrate` call.
The lossless argument is stronger than any prior bump and is recorded beside the table: **a
version 4 document has no `tournament/*` entries at all**, because nothing in this build
before Phase 5 could originate one. There is no recorded match for a metric to score or a
format to describe, so every value is vacuously true rather than a guess.

**The guard.** `buildConfig` gains three arms taking `depth`'s shape — seeded from
`V4_CONFIG_DEFAULTS` when absent, `isOneOf` against `MATCH_METRICS` / `STAGE_FORMATS` when
present, `null` on anything outside the union. Deliberately **not** `duplicateBanPolicy`'s
coercing arm: that field has no reader, so a wrong string can only sit there, whereas these
three are read by the standings sort and would silently produce a tournament scored by a
metric the file never named.

**`bracketNeedsFourPlayers`.** Warning severity, never blocking, last in `PRECEDENCE`. Copy
byte-for-byte from `05-UI-SPEC` §1. No high-player-count gate, and a 16-player test pins the
absence so nobody adds one reflexively.

## Key Decisions

**The alias ladder was rechained, not extended.** `V3Config` was `Omit<TournamentConfig, …>`,
which silently re-inherited every new field. `V4Config` is now the one alias that names
`TournamentConfig`, and `V3Config` / `V2Config` chain off it downward. A sixth version widens
one place instead of four — and without this the migration arms type-check against shapes
that claim version 2 documents carry version 5 fields.

**Tier 3's `match log` is the numeric field plus the editable history, and nothing else.**
RESEARCH open question 4, recorded in `TournamentDepth`'s doc block so it does not reopen.
TOUR-10's free-text house-rules note is explicitly *not* the answer: it is a v2 surface with
its own storage question, and folding it in would make a host who wants to record KO counts
also choose a notes field, which is not the same want.

**A caller whose depth is settled passes `'draftOnly'`.** RESEARCH open question 3. The
bracket warning's entire value is the next action it offers — "choose Draft only, or add
players" — and neither half is available once a document exists. That is why there is no
post-adoption depth notice, and it is why `app.tsx` and `BanStageScreen` pass a value that
neutralises the field, on the same precedent `banMode: 'hostBanlist'` already set.

**`persistence.ts` and `store.ts` were confirmed to need no edit, and it is asserted rather
than assumed.** `persistence.ts:263` asks `SUPPORTED_SCHEMA_VERSIONS` rather than comparing
`SCHEMA_VERSION`, deliberately, so the bump moves that site by definition; both `store.ts`
document creators already write the constant. `git diff --stat` against the base is empty for
both (T-05-03).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 22 config fixtures across 21 test files gained the three fields**

- **Found during:** Task 1
- **Issue:** Adding three required fields to `TournamentConfig` breaks every construction
  site in the repository. `npm run typecheck` reported 27 errors across `tests/core/**`,
  `tests/ui/**`, `tests/adapters/**` and `tests/store-ownership.test.ts`.
- **Fix:** Inserted `matchMetric: 'pokemonLeft'`, `roundRobinFormat: 'bo1'`,
  `bracketFormat: 'bo1'` into each fixture literal. Mechanical, defaults only — none of
  these tests is about the new fields.
- **Commit:** `1ec31a4`

**2. [Rule 3 - Blocking] `ConfigScreen`'s config literal seeds the three fields**

- **Found during:** Task 3
- **Issue:** `ConfigScreen.tsx:1222` constructs the `TournamentConfig` that creates a
  tournament, so it cannot compile without the new fields. The plan assigns the *controls*
  to 05-05, but the literal still needs values today.
- **Fix:** Seeded from `V4_CONFIG_DEFAULTS` rather than three restated literals, so that
  until 05-05 lands, a tournament created here and a schema 4 tournament migrated forward
  say the same thing. Commented as 05-05's replacement site.
- **Commit:** `2e5c9f7`

**3. [Rule 3 - Blocking] `V2Config` re-inherited the version 5 fields**

- **Found during:** Task 3
- **Issue:** `V2Config` was `Omit<TournamentConfig, …>` naming only version 3 and 4
  additions, so it silently gained the three version 5 fields and `migrateV1ToV2` stopped
  type-checking against what it produces.
- **Fix:** Rechained as `Omit<V3Config, …>`. See Key Decisions.
- **Commit:** `2e5c9f7`

**4. [Rule 1 - Bug] Ten hardcoded schema-version assertions in pre-existing tests**

- **Found during:** Task 3 (full-suite run)
- **Issue:** Seven `toBe(4)` assertions in `tests/adapters/persistence.test.ts` and one in
  `tests/ui/ban-stage.test.tsx` asserted the old current version. Two fixtures used
  `schemaVersion: 5` as "a version this build has never supported" — now false.
- **Fix:** Bumped the eight to `5`; moved the two unsupported-version fixtures to `6`.
- **Commit:** `2e5c9f7`

**5. [Rule 1 - Bug] Two of my own new test fixtures asserted on unrelated problems**

- **Found during:** Task 3
- **Issue:** The 16-player case used `poolSize: 96`, which is exactly 16 × 6 and therefore
  fired `poolExactlyMinimum` — so `expect(result.problems).toEqual([])` was failing on a
  pre-existing warning rather than pinning the prohibition. The `blocked === false` case
  kept the two-player fixture's `poolSize: 12` while using three players, so it blocked on
  `poolTooSmall`.
- **Fix:** Widened to `poolSize: 144` and `poolSize: 24` respectively, each with a comment
  recording what the original number would have made the assertion pass on instead.
- **Commit:** `2e5c9f7`

### Not Deviations

The worktree arrived on a **stale base** (`93f20ad`, a Phase 3 planning commit) rather than
the expected `34216e4`. Corrected by the `reset --hard` the branch-check protocol specifies,
then fast-forwarded onto the recovered partial commit `340b15d`. Phase 1–4 code confirmed
present before any work began.

## Recovered Work

Task 1's RED commit `340b15d` was written by a previous executor killed by a provider quota
limit. It was fast-forwarded in, verified by reading, and **not** rewritten. Its 24 tests
are the RED gate this plan's first `feat` commit turned green.

## TDD Gate Compliance

All three tasks completed the RED → GREEN cycle with distinct commits:

| Task | RED | GREEN |
|------|-----|-------|
| 1 | `340b15d` (recovered) | `1ec31a4` |
| 2 | `f196e9c` | `aa55591` |
| 3 | `654f11e` | `2e5c9f7` |

No REFACTOR commits were needed. No gate was skipped, and no test passed unexpectedly during
a RED phase.

## Verification

`npm run verify` equivalent, run component by component from the worktree (the worktree has
no `node_modules`; Node's upward resolution reaches the main checkout's, so **no junction was
created** — see Notes):

- `check:pure` — 0 violations in 18 files under `src/core`
- `check:nohtml` — 0 violations in 73 files under `src`
- `typecheck` — clean, both tsconfigs
- `test` — **2081 passed, 61 files, 0 failures**
- `build` — 149.80 kB JS (47.21 kB gzip), SW manifest 322 URLs

Plan-level verification criteria:

- `git diff --stat package.json` against base — empty. No package added.
- `git diff --stat src/adapters/` against base — empty.
- `git diff --stat src/store.ts` against base — empty.
- `grep -rn "SCHEMA_VERSION" src/` outside `model.ts` — only `migrate.ts`,
  `import-guard.ts`, `store.ts`, `persistence.ts`, none a new comparison.
- `grep -rn "bracketNeedsFourPlayers" src/ui/ src/app.tsx` — 0 hits. The gate lives in
  `feasibility.ts` and nowhere else.

## Known Stubs

None. `ConfigScreen`'s three seeded config values are not stubs in the tracked sense — they
are real, valid, migration-consistent values that produce a correct tournament today. 05-05
replaces them with host-chosen ones, and the plan assigns those controls there.

## Notes for Future Plans

- **05-05** replaces the three `V4_CONFIG_DEFAULTS` lines in `ConfigScreen.tsx` with the
  `Match result`, `Round robin format` and `Bracket format` segmented controls.
  `MATCH_METRICS` and `STAGE_FORMATS` are exported from `import-guard.ts` for exactly this —
  render one option per member rather than hand-writing a second list.
- **05-08** owns the five `tournament/*` arms in `buildLogEntry` and the `matchId` pattern
  constant. `buildLogEntry` was deliberately untouched here.
- The worktree needs no `node_modules`: it is nested inside the main checkout, so
  `require.resolve` walks up and finds the main one. Run vitest/tsc/vite via
  `node <main>/node_modules/<tool>` from the worktree root.

## Self-Check: PASSED

All modified files exist on disk; all six commits verified present in `git log`.
