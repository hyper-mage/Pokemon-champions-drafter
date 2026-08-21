---
phase: 04-blind-and-snake-bans
plan: 02
subsystem: core-feasibility
tags: [feasibility, rule-07, rule-08, bans, copy]
requires:
  - MAX_BANS_PER_PLAYER
  - TournamentConfig.bansPerPlayer
  - BanMode
provides:
  - FeasibilityInput.banMode
  - FeasibilityInput.bansPerPlayer
  - bansPerPlayerNotAnInteger
  - bansPerPlayerNotPositive
  - bansPerPlayerTooLarge
  - the q term on notEnoughMegas, poolTooLarge and tooManyPlayersForRoster
  - the two-arm notEnoughMegas composer
  - the RULE-08 post-reveal call contract
affects:
  - src/core/feasibility.ts
  - src/app.tsx
  - src/ui/screens/ConfigScreen.tsx
tech-stack:
  added: []
  patterns:
    - three-question malformed/positivity/bound ladder, extending the swap fields' two
    - one composer with two arms, arm selected by a `number | null` that is also an interpolation
    - pessimistic figures interpolated into an unchanged sentence, never a fourth sentence
    - bounds imported from import-guard, never restated
key-files:
  created: []
  modified:
    - src/core/feasibility.ts
    - tests/core/feasibility.test.ts
    - src/app.tsx
    - src/ui/screens/ConfigScreen.tsx
    - tests/core/bans.test.ts
decisions:
  - A caller whose player bans are already materialised into bannedIds passes banMode 'hostBanlist' as well as bansPerPlayer 0 — the two fields together mean "bans not yet in the banlist", and this is the only reading under which both of the plan's stated truths hold
  - poolTooLarge and tooManyPlayersForRoster interpolate legalCount − q and banCount + q into their unchanged Phase 2 sentences, for the same reason {y} becomes megaEligible − q
  - q is NaN while the bans-per-player field is malformed, which suppresses all three arithmetic sentences — the posture poolSizeNotAnInteger takes one field along
  - all three bansPerPlayer codes sit contiguously in PRECEDENCE rather than split across the malformed and bound groups the way the swap fields are
metrics:
  duration: ~30 min
  tasks: 2
  commits: 5
  files-changed: 5
  completed: 2026-08-21
---

# Phase 4 Plan 02: The Pessimistic Feasibility Gate Summary

The config-time gate now assumes every player spends every ban on a species the tournament
needed, on all three predicates that can be starved by one — which makes `drawPool`'s
deliberate `RangeError` unreachable from the ordinary config flow for the first time.

## What Was Built

`FeasibilityInput` gained `banMode` and `bansPerPlayer`. Three blocking codes —
`bansPerPlayerNotAnInteger`, `bansPerPlayerNotPositive`, `bansPerPlayerTooLarge` — validate
the new field through a three-question ladder extending the swap fields' two, gated on the
mode so the field stays wholly void at `hostBanlist`. `bansPerPlayerTooLarge` compares
against `MAX_BANS_PER_PLAYER` imported from `import-guard.ts`; the file contains no literal
`24`.

`notEnoughMegasMessage` became one composer with two arms. `{y}` is
`Math.max(0, megaEligibleLegalCount − q)` in both, so at `q === 0` the `hostBanlist` arm is
byte-identical to Phase 3's string by construction rather than by coincidence — and a test
pins that literal.

`q = banMode === 'hostBanlist' ? 0 : players × bansPerPlayer` now sits on `notEnoughMegas`,
`poolTooLarge` and `tooManyPlayersForRoster`. The second and third are the correction D-21
does not name, and they are the important ones: `poolTooLarge` fired only *above*
`legalCount`, the pool-size field is deliberately unclamped (D-06) and `drawPool` deliberately
does not clamp either, so 8 players banning 2 each on a pool sized to the legal roster reached
`Start draft` and threw on a shared screen mid-ritual. `draw.ts` is byte-identical: the throw
is upstream policy being honoured, not a bug to fix downstream.

The RULE-08 post-reveal contract is recorded in the module header. There is no second gate
function, and the greps for one return 0.

## Task Commits

| Task | Gate  | Commit    | What                                                        |
| ---- | ----- | --------- | ----------------------------------------------------------- |
| 1    | RED   | `3ab3e33` | Three ban-field codes, the void-at-hostBanlist cases, both Mega arms |
| 1    | RED   | `2cb90c4` | Re-based the two Mega-arm cases onto Phase 3's predicate      |
| 1    | GREEN | `ee78a7e` | The two input fields, three codes, one two-arm composer       |
| 2    | RED   | `d01537d` | Pitfall 2, the q term on two more predicates, the reuse contract |
| 2    | GREEN | `e243586` | `q` on all three predicates, pessimistic interpolations, header contract |

## TDD Gate Compliance

Both tasks ran RED → GREEN with the RED commit preceding the GREEN commit in git history.
No REFACTOR commit: neither implementation had anything left to clean up.

Task 1's RED needed a second test commit, `2cb90c4`, and the reason is worth recording. The
two Mega-arm copy cases as first written could only *fire* once the predicate carried `q` —
`8 × 6 = 48` sits under the 74 eligible species — so task 1's suite would have depended on
task 2 and the plan's own `<verify>` for task 1 (`vitest run tests/core/feasibility.test.ts`
exits 0) could not have held. Both cases were re-based onto Phase 3's predicate with host
species bans supplying the shortfall, which also makes them better tests: they now vary the
arm selector and nothing else against the pinned `hostBanlist` case.

In task 2's RED, four of the eight new cases failed and four passed. The four that passed are
deliberate: the boundary case, the seven-configuration `hostBanlist` regression and the two
post-reveal cases all pin behaviour that must *not* change, and a RED that failed them would
have meant the `q` term was about to break something.

## Deviations from Plan

### Deliberate Interpretation

**1. A materialised caller passes `banMode: 'hostBanlist'`, not the document's stored mode**

The plan states two truths that cannot both hold on a naive reading:

- "`Bans per player` at 0 in blind or snake blocks Start with a next action naming both
  remedies" (task 1 behaviour, and a `must_haves` truth), and
- "the post-reveal re-check is `checkFeasibility` called with a union banlist and zero pending
  player bans", with an acceptance criterion that it returns `blocked === false`.

Taken literally, a reveal passing `banMode: 'blind'` and `bansPerPlayer: 0` trips
`bansPerPlayerNotPositive` and every blind tournament is permanently blocked at the reveal —
`04-11`'s whole surface, dead.

Resolved by reading the two fields as one question, which is what the plan's own interface
comment says: `banMode`'s doc line is "`'hostBanlist'` contributes no player bans", and
`bansPerPlayer`'s is "player bans NOT YET reflected in `bannedIds`". So **both** fields
describe pending bans, and a caller whose bans are already in the banlist passes
`'hostBanlist'` and `0` together. Validating a field the host can no longer edit would state
a problem with no next action, which `CLAUDE.md` §Copy forbids outright.

Recorded in three places so `04-11` cannot miss it: the module header's RULE-08 section, the
`banMode` field's own doc block (in bold), and this summary — which `04-11-PLAN.md`'s
`read_first` names as "the contract this task consumes and must not violate".

**`04-11` must pass `banMode: 'hostBanlist'` alongside `bannedIds: selectAllBanIds(state)` and
`bansPerPlayer: 0`.** Its plan text names only the latter two.

**2. `poolTooLarge` and `tooManyPlayersForRoster` quote the pessimistic figures**

Neither sentence is changed by a byte; only what is interpolated moves. Without this, the
Pitfall 2 case renders `Pool is too large. Only 235 Pokémon are draftable after 0 bans; the
pool is set to 235.` — a blocking reason that reads as no problem at all, on a shared screen,
with no next action a host can act on. Interpolating `legalCount − q` and `banCount + q`
makes the sentence true under D-21's stated assumption and needs no new copy, no fourth code
and no spec amendment. It is exactly the move `04-RESEARCH` §"The `{y}` ambiguity" prescribes
for the Mega sentence, applied to its two neighbours. At `q === 0` both reduce to the figures
Phase 2 verified, and a seven-configuration regression test pins that.

`04-UI-SPEC` §2 does not mention either sentence, so this is a gap being closed rather than a
contract being contradicted — flagged here for the phase verifier.

**3. A malformed `Bans per player` makes `q` NaN rather than 0**

Every relational comparison with `NaN` is false, so all three arithmetic sentences are
suppressed while the field is unreadable. This is `poolSizeNotAnInteger`'s posture one field
along, and the host is blocked by `bansPerPlayerNotAnInteger` regardless, so nothing reaches
the draw. A test pins that a blind configuration with an empty field reports exactly one code.

### Auto-fixed Issues

**4. [Rule 3 - Blocking] Three `checkFeasibility` call sites could not compile**

- **Found during:** Task 1
- **Issue:** Two required fields on `FeasibilityInput` break every object-literal call site.
  `tsconfig.json` includes `tests`, so `npm run typecheck` — and therefore `build` and
  `verify` — could not pass. The plan's `files_modified` lists neither file.
- **Fix:**
  - `src/ui/screens/ConfigScreen.tsx:830` — passes the real `banMode` state and
    `bansPerPlayer: 0`, with `banMode` added to the `useMemo` dependency array. `blind` and
    `snake` are still rendered disabled there, so `banMode` is `'hostBanlist'` in every
    reachable state and none of the three new codes can fire: the screen stays byte-identical
    to what Phase 2 verified. 04-05 owns the `Bans per player` control, and the moment it
    enables the other two modes `bansPerPlayerNotPositive` blocks Start until a real value is
    wired — which is the right failure rather than a silent one.
  - `src/app.tsx:1010` — the adoption notice passes `'hostBanlist'` and `0` per deviation 1.
  - `tests/core/bans.test.ts` — two fixtures at their `hostBanlist` values; the equality those
    tests assert is about `banCount`, which no ban mode moves.
- **Files modified:** `src/ui/screens/ConfigScreen.tsx`, `src/app.tsx`, `tests/core/bans.test.ts`
- **Commit:** `ee78a7e`
- **Conflict risk:** none in-wave. The concurrent sibling (04-03) owns `actions.ts`,
  `model.ts`, `reduce.ts` and `import-guard.ts`; none of those was edited. `model.ts` and
  `import-guard.ts` are read from by `import`/`import type` only.

**5. [Rule 1 - Bug] The module header tripped its own acceptance grep**

- **Found during:** Task 2
- **Issue:** The RULE-08 section named `recheckAfterReveal` as the thing not to write, which
  made `grep -cE "recheckAfterReveal|postRevealFeasibility|checkFeasibilityAfterBans"` return
  1 rather than 0 — a criterion of this plan *and* of `04-11`, where the grep is `-r` across
  all of `src/`.
- **Fix:** Reworded to "NOT a second gate function beside it" and made the grep itself part of
  the stated contract, so the next reader knows why the name is not spelled.
- **Files modified:** `src/core/feasibility.ts`
- **Commit:** `e243586`

## Authentication Gates

None.

## Verification

`npm run verify` was not invoked as one command: this worktree has no `node_modules`, and the
instructions forbid linking the main checkout's. Each stage was run by invoking the main
checkout's binaries with the worktree as cwd, which touches nothing outside this tree.

| Check                                                             | Result                      |
| ----------------------------------------------------------------- | --------------------------- |
| `check:pure`                                                       | 0 violations, 18 files      |
| `check:nohtml`                                                     | 0 violations, 67 files      |
| `check:pure:selftest`                                              | passed                      |
| `vitest run tests/core/feasibility.test.ts tests/core/draw.test.ts` | 110 passed                  |
| `vitest run tests/core/`                                           | 858 passed, 18 files        |
| Full suite                                                         | 1597 passed, 53 files       |
| `tsc --noEmit -p tsconfig.json` and `-p tsconfig.node.json`        | clean                       |
| `vite build` + `build-sw-manifest`                                 | built, 322 URLs precached   |
| `git diff --stat src/core/draw.ts package.json package-lock.json`  | empty                       |

Acceptance greps against `src/core/feasibility.ts`:

| Criterion                                                              | Required | Actual |
| ---------------------------------------------------------------------- | -------- | ------ |
| the three codes, comment lines excluded                                 | ≥ 9      | 11     |
| `MAX_BANS_PER_PLAYER`                                                   | ≥ 1      | 4      |
| `= 24` / `> 24` / `24;`                                                 | 0        | 0      |
| `Math.max(0,`                                                           | ≥ 1      | 1      |
| `function notEnoughMegasMessage`                                        | exactly 1| 1      |
| `poolTooLarge`                                                          | ≥ 3      | 4      |
| `tooManyPlayersForRoster`                                               | ≥ 3      | 6      |
| `recheckAfterReveal|postRevealFeasibility|checkFeasibilityAfterBans`    | 0        | 0      |
| `export function checkFeasibility`                                      | exactly 1| 1      |

## Known Stubs

None. `bansPerPlayer: 0` in `ConfigScreen`'s gate call is a placeholder 04-05 replaces, and it
is correct today because `blind` and `snake` are still disabled on that screen — the same
posture 04-01 recorded for the same literal in `handleStart`.

## Threat Flags

None. This plan adds no endpoint, auth path, file access or object shape. T-04-06, T-04-07,
T-04-08 and T-04-09 are all mitigated as the register specifies, each with a named test.

## Self-Check: PASSED

- `src/core/feasibility.ts` — FOUND
- `tests/core/feasibility.test.ts` — FOUND
- `.planning/phases/04-blind-and-snake-bans/04-02-SUMMARY.md` — FOUND
- `3ab3e33`, `2cb90c4`, `ee78a7e`, `d01537d`, `e243586` — all FOUND in `git log`
