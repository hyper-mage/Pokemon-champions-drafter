---
phase: 02-host-configured-draft-night
plan: 01
subsystem: core
tags: [feasibility, seeded-sampling, fisher-yates, search-predicates, roster-tripwire, tdd]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "src/core/rng.ts (nextInt), src/core/roster/types.ts (RosterEntry), the committed roster.mb.json snapshot, the pure-core gate and the zero-mock test convention"
provides:
  - "checkFeasibility — the RULE-07 gate, ten precedence-ordered reasons with verbatim UI-SPEC copy"
  - "poolSizeForPreset — DRFT-02's three presets with a Math.ceil rounding rule Phase 3 inherits"
  - "drawPool — the two-stage seeded partition draw, O(L), always terminating, display-order output"
  - "toSearchKey / matchesName / matchesTypes / matchesMega — the shared pool predicates"
  - "A regulation tripwire pinning 235 entries / 74 Mega-capable / 2 dual-Mega / 18 types"
affects: [02-04 feasibility bar, 02-05 pool sizing and draw, 02-07 host banlist, 02-08 filter bar, phase-03 round compiler and RULE-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Declared precedence array over emergent check order"
    - "Two-stage partition draw instead of rejection sampling"
    - "Roster figures pinned in tests, never in src/"

key-files:
  created:
    - src/core/feasibility.ts
    - src/core/draw.ts
    - src/core/search.ts
    - tests/core/feasibility.test.ts
    - tests/core/draw.test.ts
    - tests/core/search.test.ts
  modified:
    - tests/core/roster/fixtures.test.ts

key-decisions:
  - "Numeric config fields are typed number | null so an empty input is a case the compiler forces the gate to handle, closing the NaN hole where both pool comparisons silently pass"
  - "The feasibility precedence order is a declared PRECEDENCE array, deliberately deviating from 02-UI-SPEC §5 to put malformed-input blockers above arithmetic ones"
  - "tooManyPlayersForRoster added as a tenth reason because at the Exact preset poolTooSmall can never fire, so a 40-player host would be told to shrink a pool the tool computed"
  - "Two-stage partition draw over reject-and-redraw: the 8-player / 4-Mega / Exact configuration passes every blocker and would need ~64 million redraws"
  - "Non-uniformity when a Mega quota is in play is accepted and documented rather than fixed, because the only fix is the rejection sampling that hangs the browser"
  - "matchesName runs against entry.name, not entry.id, with the toID equality demoted to a tested assumption in the tripwire"
  - "Feasibility copy stays byte-for-byte with the approved table including 'after 1 bans'; the copy table is the thing to amend, not this module"

patterns-established:
  - "Precedence as data: checks are grouped by the field the host would change, then sorted by a declared array, so reporting order is a product decision rather than an artefact of evaluation order"
  - "Set-based legality counting: legalCount and megaCapableLegalCount are set differences over the roster, never a banlist array length"
  - "Subsequence assertions written as a forward two-cursor walk, plus a guard test proving a shuffled array fails them"
  - "Regulation tripwire: roster counts live in tests/core/roster/fixtures.test.ts and nowhere under src/"

requirements-completed: [RULE-07, DRFT-02, DRFT-03, DRFT-08, DRFT-09, BAN-08]

# Metrics
duration: 18min
completed: 2026-08-11
---

# Phase 2 Plan 01: Pure Draft Arithmetic Summary

**The feasibility gate, the two-stage seeded pool draw, and the shared pool predicates — 106 zero-mock tests over the real committed roster, with a tripwire that fails loudly when regulation M-C rotates in.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-08-11T08:36:00Z
- **Completed:** 2026-08-11T08:54:00Z
- **Tasks:** 3 (all TDD — 6 commits)
- **Files modified:** 7 (6 created, 1 extended)

## Accomplishments

- `checkFeasibility` gives ten precedence-ordered reasons with fully interpolated copy, and closes the three holes 02-RESEARCH found in the UI-SPEC's seven-item list: the `NaN` pool size that passes both comparisons, `megasRequiredPerTeam` above the round count, and `legalCount` computed from a banlist length that can contain duplicates.
- `drawPool` selects a set in O(L) with exactly `size` generator draws and no loop bound. The 8-player / 4-Mega / Exact configuration — the one rejection sampling cannot serve — completes well inside the 100 ms assertion.
- `src/core/search.ts` is the single home of the name, type and Mega predicates, so the pool filter bar and the ban typeahead cannot drift into two matchers.
- The roster tripwire pins 235 entries, 74 Mega-capable, exactly two dual-Mega species (`charizard`, `raichu`), 18 types, base-stat totals in 288–600, no stat above 200, a longest name of 20 characters, and `toSearchKey(name) === id` across all 235 entries and all 76 Mega formes.
- Runtime dependency count is unchanged at two. `git diff --stat package.json` is empty.

## Task Commits

Each task was committed atomically, RED then GREEN:

1. **Task 1: checkFeasibility — the ten-case gate** — `cc5b85c` (test) → `67ed492` (feat)
2. **Task 2: drawPool — the two-stage partition draw** — `e87785b` (test) → `14041ed` (feat)
3. **Task 3: pool predicates and the roster tripwire** — `2ff213e` (test) → `c3d2c20` (feat)

No REFACTOR commit was needed on any task — each GREEN implementation was already the shape the plan specified.

## Files Created/Modified

- `src/core/feasibility.ts` — RULE-07. `checkFeasibility`, `poolSizeForPreset`, the `FeasibilityCode` union, the `PRECEDENCE` array, and every reason string as a module constant or interpolation helper.
- `src/core/draw.ts` — DRFT-02 / BAN-08. `drawPool` plus the module-private `selectInPlace` partial Fisher-Yates.
- `src/core/search.ts` — DRFT-08 / DRFT-09. `toSearchKey`, `matchesName`, `matchesTypes`, `matchesMega`, `MegaFilterMode`.
- `tests/core/feasibility.test.ts` — 38 tests, including the named NaN-hole test, the duplicate-ban test, the 40-player test, and byte-for-byte assertions on every reason string.
- `tests/core/draw.test.ts` — 16 tests, including the subsequence walk, its own guard test, the timing assertion, and the input-immutability check.
- `tests/core/search.test.ts` — 30 tests over `Kommo-o`, `Mr. Rime`, `Rotom-Wash` and `Tauros-Paldea-Aqua`.
- `tests/core/roster/fixtures.test.ts` — extended with the `roster tripwire — regulation M-B` block (8 tests).

## Decisions Made

- **`number | null` over `number` for the two numeric config fields.** An empty `<input type="number">` yields `NaN`, and every relational comparison with `NaN` is false, so `N > legal` and `N < players × rounds` both pass and the gate reports all-clear on a configuration that cannot be drawn. Typing the field as nullable makes "the host has not finished typing" a case TypeScript forces the module to handle.
- **The precedence order is a declared array, and it is not the UI-SPEC's.** `poolSizeNotAnInteger` and `megasExceedRounds` sit above every arithmetic reason because reporting arithmetic computed from a malformed number produces a sentence with `NaN` in it. Recorded in the module doc block with all three reasons, as the plan required.
- **Checks are grouped by field, then sorted.** Evaluation order deliberately differs from `PRECEDENCE` (the Megas-per-team checks run last, `poolExactlyMinimum` runs before them), so the sort is genuinely load-bearing and the precedence test would fail if it were removed.
- **Blank rows are excluded from duplicate detection.** Two empty player names normalize to the same key, and reporting them as `Two players are both called ""` is worse than the blank-name reason they already produce.
- **`banCount` is `entries.length - legalCount`.** The figure every message quotes is the number of bans that hit the roster, so a duplicate counts once and a stale id counts zero.
- **The `Math.ceil` in `poolSizeForPreset` is unreachable today and stays anyway.** At six rounds all three presets are integers for every player count; the ceiling exists so Phase 3's variable round count inherits a rounding rule rather than discovering it needs one.

## Deviations from Plan

Two, both small and both inside the plan's own instructions rather than against them.

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reworded three doc comments that tripped the plan's own grep criteria**
- **Found during:** Task 1 (feasibility) and Task 2 (draw)
- **Issue:** The acceptance criteria are naive text greps that do not strip comments, unlike `check:pure`. Prose reading "never `bannedIds.length`" and "an imported document can carry ids" made `grep -c "bannedIds.length"` return 2 and `grep -Ec "document|window|..."` return 1. In `draw.ts`, markdown emphasis had split the mandated caveat phrase across two lines, so `grep -c "not uniform over the constraint-satisfying set"` returned 0.
- **Fix:** Reworded to "the raw length of the banlist" and "an imported file", and unwrapped the caveat sentence so the phrase is contiguous. No behaviour changed.
- **Files modified:** `src/core/feasibility.ts`, `src/core/draw.ts`
- **Verification:** All four greps now return their required values; tests still pass.
- **Committed in:** `67ed492` and `14041ed` (the task commits)

**2. [Rule 2 - Missing Critical] Added a guard test for the subsequence assertion**
- **Found during:** Task 2 (draw)
- **Issue:** The plan requires the subsequence check be a forward two-cursor walk "so shuffle order actually fails it". Nothing would have caught a walk that silently degenerated into a set comparison.
- **Fix:** Added `has a subsequence check that a shuffled result actually fails`, asserting the reversed result array fails the same helper.
- **Files modified:** `tests/core/draw.test.ts`
- **Verification:** The guard passes, and inverting the helper's logic fails it.
- **Committed in:** `e87785b` (the RED commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical)
**Impact on plan:** No scope creep. Neither touched a specified behaviour; one made the plan's own criteria checkable and one made an existing criterion honest.

## Deferred Issues

**The acceptance criterion `grep -Erc "\b235\b|\b74\b" src/ --include=*.ts --include=*.tsx` returns 0 for every file already failed on the base commit.** Nine Phase 1 files mention the figure in doc comments ("235 cells is unremarkable", "resolves for zero of the 235 entries"). None is a hardcoded constant, so D-17's real rule holds — nothing encodes a ceiling. The three modules this plan adds carry zero occurrences, which is the in-scope part. Full detail and the two options are in `.planning/phases/02-host-configured-draft-night/deferred-items.md`.

**`after 1 bans` is a visible grammar error in three reason strings.** 02-PATTERNS S-5 says interpolated counts get a singular/plural helper; 02-UI-SPEC gives the sentences with a bare `{b} bans` and this plan requires byte-for-byte agreement with them. The module follows the plan and records the tension in its doc block. The copy table is the thing to amend, not the module — the plural helper would put the gate out of agreement with the approved contract.

## Known Stubs

None. All three modules are complete implementations with no placeholder values, no hardcoded empty returns, and no TODO markers. They are not yet rendered by any surface — that is the plan's stated shape (02-04 renders the reasons, 02-05 the draw, 02-07 the banlist, 02-08 the filter bar), not an unfinished implementation.

## Threat Flags

None. The three modules are pure functions over roster data the app already ships publicly. No new network endpoint, auth path, file access pattern, or schema change. The plan's four registered threats are all addressed: T-02-01 by the terminating two-stage draw and its timing assertion, T-02-02 by set-based legality counting, T-02-03 by `Number.isSafeInteger` refusal ahead of every arithmetic reason, and T-02-SC by installing nothing.

## Issues Encountered

- The worktree spawned at `80d64e3`, one commit behind the required base `bc95fdd`. HEAD was on the `worktree-agent-*` branch and the tree was clean, so the sanctioned `git reset --hard` to the expected base applied cleanly.
- `tests/core/roster/fixtures.test.ts` produced a CRLF normalization warning on commit. The diff is 80 insertions, not a whole-file rewrite, so the file's line endings were not rewritten.

## Verification

- `npm run verify` exits 0 — `check:pure` (0 violations, 14 files), `check:nohtml` (0 violations, 41 files), 455 tests across 23 files, and a clean build.
- `npm run check:pure:selftest` exits 0 — the purity checker still detects a real violation.
- `npx vitest run tests/core/` exits 0 — 307 tests across 12 files.
- `git diff --stat package.json` is empty. No dependency was added.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

The three modules the rest of Phase 2 renders are done and under test. Every downstream plan in the phase is now a rendering exercise against a settled contract:

- **02-04** renders `problems[0].message` plus `problems.filter(blocking).length - 1` for the "other problems" line, and reads `legalCount` / `banCount` for the all-clear.
- **02-05** calls `poolSizeForPreset` for the three presets and `drawPool` for the draw, and materializes `megaCapableCount` into `pool/built` for Phase 3.
- **02-07** and **02-08** both import `matchesName` from `src/core/search.ts`. Neither may write its own matcher.
- **Phase 3** reads `megasRequiredPerTeam` and the recorded `megaCapableCount` rather than recomputing against a rotated roster, and composes its Mega-round restriction as a separate predicate rather than a fourth `MegaFilterMode` member.

One thing to carry forward: `checkFeasibility` takes `playerNames`, not `PlayerConfig[]`. The config screen holds pre-document form state, so it has names before it has ids — but whoever wires `createTournament` should not pass `players.map(p => p.name)` and call it validated. The gate checks names; id uniqueness is still `import-guard`'s and the store's business.

## Self-Check: PASSED

All nine claimed files are tracked in git. All six task commits plus the metadata commit
resolve in `git log`. `.planning/STATE.md` and `.planning/ROADMAP.md` are byte-identical to
the base commit — the orchestrator owns those writes after the wave merges.

---
*Phase: 02-host-configured-draft-night*
*Completed: 2026-08-11*
