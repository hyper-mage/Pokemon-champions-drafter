---
phase: 05-full-tournament-brackets-standings-archive
plan: 05
subsystem: ui
tags: [preact, segmented-control, aria-disabled, accessibility, config-screen, feasibility]

# Dependency graph
requires:
  - phase: 05-01
    provides: "`matchMetric`, `roundRobinFormat` and `bracketFormat` on the schema 5 config; `V4_CONFIG_DEFAULTS`; `bracketNeedsFourPlayers` and `FeasibilityInput.depth` in `feasibility.ts`"
  - phase: 02
    provides: "`ConfigScreen`, `SegmentedControl`, `FeasibilityBar`, the inert-with-a-reason mechanism and the `Tournament` fieldset"
  - phase: 04
    provides: "`.config-screen__inert-reason` and the `Duplicate bans` inert wrapper this generalises"
provides:
  - "The host chooses depth, the TOUR-07 match metric and a best-of format per stage before the draft starts, and all three land in the document `handleStart` writes exactly once"
  - "A per-option depth note that states what each tier actually generates, replacing the sentence Phase 2 left promising the tournament screens were still to come"
  - "The round-robin size line `A round robin at {p} players is {n} matches.` at the two deeper tiers"
  - "`InertibleSegmentedControl` — a whole-control `aria-disabled` wrapper with a keyboard-reachable visible reason, generalising the `Duplicate bans` shape"
  - "The three-player bracket warning surfaced on screen through `FeasibilityBar`, warning severity, `Start draft` stays enabled"
affects: [05-06, 05-07, match-record-entry, standings, cut, bracket]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Whole-control inertness: `aria-disabled` on a wrapper around `SegmentedControl`, chosen over the component's per-option `disabled` when every member is unavailable"
    - "Inert ARIA and its `aria-describedby` shed together — both `undefined` when live, never the string false"
    - "One vnode shape across an inert boundary: only the reason appears, the focusable radios never unmount"

key-files:
  created:
    - tests/ui/config-tournament.test.tsx
  modified:
    - src/ui/screens/ConfigScreen.tsx
    - src/ui/screens/ConfigScreen.css
    - src/ui/confirm-copy.ts
    - tests/ui/config-screen.test.tsx

key-decisions:
  - "The three inert-able controls go through one `InertibleSegmentedControl` component rather than three inline copies of the wrapper — the same widget three times is exactly when a component is right, and three copies are three chances to diverge on the shed rule"
  - "Three pinned reason ids, not one shared between the two format controls, even though both render the same sentence: two elements with one id is invalid markup and `aria-describedby` resolves to whichever the parser saw first"
  - "`aria-describedby` sheds with `aria-disabled` rather than being set unconditionally as `FeasibilityBar` does — the reason element only exists while inert, and a dangling id reference is a promise the DOM does not keep"
  - "The three-player bracket tests select the `2×` pool preset: `bracketNeedsFourPlayers` is deliberately LAST in the precedence order, so at the default `Exact` preset `poolExactlyMinimum` correctly outranks it in `problems[0]`"
  - "The new doc block describes the forbidden attribute value instead of quoting it, following `FeasibilityBar`'s stated rule that a comment quoting what it forbids makes a text-search gate match its own documentation"

patterns-established:
  - "InertibleSegmentedControl: legend/name/options/value/onChange plus inert/reason/reasonId, with the early return inside the wrapper so no call site can forget it"
  - "Inert reason ids are module constants named per control, because there is exactly one config screen"

requirements-completed: [TOUR-01, TOUR-04, TOUR-07]

# Metrics
duration: 34min
completed: 2026-08-27
---

# Phase 5 Plan 5: Config screen tournament controls Summary

**The `Tournament` group grew from one depth control plus a static note into four controls with a note that changes with the selection, two of them inert-with-a-reason at the depths where they mean nothing, and all three new values written into the document exactly once.**

## Performance

- **Duration:** ~34 min (this session; Task 1 was recovered from a prior run killed by a quota limit)
- **Completed:** 2026-08-27
- **Tasks:** 2
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments

- **The host configures the whole shape of the night on one screen.** `Match result`
  (`Pokémon left` · `KO difference`), `Round robin format` and `Bracket format`
  (`Best of one` · `Best of three` each) sit in the `Tournament` group beside the depth
  control, and `handleStart` carries all three into the config the document is created with.
- **Each depth option states what it generates.** `DEPTH_NOTE` — which promised that
  "round robin and brackets arrive with the tournament screens" — is gone from the
  repository, replaced by `DEPTH_NOTES`, a `Record<TournamentDepth, string>` holding
  05-UI-SPEC §Copywriting's three sentences byte-for-byte.
- **The round-robin size is a stated fact before the host commits to it.**
  `A round robin at {p} players is {n} matches.` at the two deeper tiers, `n = p(p−1)/2`,
  pluralised through `confirm-copy.ts`'s `matches` helper. Pinned at 5 players (10) and
  8 players (28), and at 2 players it reads `1 match`.
- **Every unavailable control explains itself without leaving the tab order.**
  `aria-disabled` on the whole control without native `disabled`, a visible reason
  associated by `aria-describedby`, and an early return in the change handler so the ARIA
  and the behaviour cannot drift.
- **The attribute is shed, not falsified.** All three controls drop `aria-disabled` and
  `aria-describedby` entirely in the same render the depth deepens, and take them back when
  it shallows.
- **One authority on the three-player bracket.** The sentence appears exactly once on the
  screen, rendered by `FeasibilityBar` from `checkFeasibility`'s `problems`; it does not
  appear in `ConfigScreen.tsx` at all, and `Start draft` stays enabled.

## Task Commits

1. **Task 1: Three controls, three notes, and the sentence that stopped being true** — `f9ef92a` (feat)
   _Committed by the prior executor before it was killed; recovered by fast-forward, verified green, not rewritten._
2. **Task 2: Inert with a reason, and shed the moment it lifts** — `6ca786e` (feat)

## Files Created/Modified

- `src/ui/screens/ConfigScreen.tsx` — `DEPTH_NOTES`, `hasMatches`, `roundRobinSizeLine`,
  `MATCH_METRIC_OPTIONS`, `STAGE_FORMAT_OPTIONS`, the two inert reasons and their three
  pinned ids, the `InertibleSegmentedControl` wrapper, the `matchMetricInert` /
  `stageFormatInert` derivations, three new render sites and three new fields in
  `handleStart`.
- `src/ui/screens/ConfigScreen.css` — `.config-screen__inert-control` (a `--space-1`
  column at 60ch) and its `[aria-disabled='true'] .segmented` opacity echo, plus Task 1's
  note rules. Zero raw hex, zero raw px.
- `src/ui/confirm-copy.ts` — the phase's `matches` singular/plural helper, beside the
  shipped `picks` / `players` / `bans`.
- `tests/ui/config-tournament.test.tsx` — **created**, 37 tests: the three notes and that
  they change across all three selections, the size line at 5 and 8 and 2 players, the
  option labels and independent radio-group names, the inertness table, the
  absent-not-`'false'` assertion, the shed assertion across all three controls in one test,
  the reason copy and its `aria-describedby` association, the bracket warning, and three
  `Start draft` cases including the write-path refusal.
- `tests/ui/config-screen.test.tsx` — the one case asserting the superseded `DEPTH_NOTE`
  was inverted rather than deleted, so a re-appearing false promise fails the build.

## Decisions Made

Recorded in the frontmatter `key-decisions`. The two worth restating:

- **A wrapper component, not three inline copies.** The plan described the inert treatment
  three times; writing it three times would have been three places for the shed rule, the
  early return and the id pinning to drift apart. `InertibleSegmentedControl` holds the
  early return *inside* it, so no call site can forget it.
- **The `2×` pool preset in the bracket-warning tests is load-bearing, not incidental.**
  05-01 put `bracketNeedsFourPlayers` last in the precedence order on purpose, and
  `FeasibilityBar` renders `problems[0]`. At 3 players on the default `Exact` preset the
  pool sentence wins — correctly. The tests clear it so they assert the sentence they are
  named for, and the reasoning is written into the test file so the next reader does not
  "fix" the ordering.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] The three-player bracket tests asserted against a sentence the bar was correctly not showing**

- **Found during:** Task 2 (the bracket warning suite)
- **Issue:** Two new tests set 3 players and a deeper depth, then asserted the bracket
  warning was on screen. Both failed. `FeasibilityBar` renders `problems[0]` only, and
  `feasibility.ts:275-284` places `bracketNeedsFourPlayers` *last*, below both pool
  warnings — deliberately, so a host whose pool arithmetic is also degenerate reads the
  sentence that changes what the draft does first. At 3 players on the default `Exact`
  preset, `poolExactlyMinimum` outranks it. The implementation was right; the test setup
  was wrong.
- **Fix:** Extracted a `threePlayersWithABracket(depth)` helper that also selects the `2×`
  pool preset, with a doc block citing `feasibility.ts:275-284` so the interaction is
  stated rather than rediscovered. Added a fourth case covering `draftBracketsAndLog`.
- **Files modified:** `tests/ui/config-tournament.test.tsx`
- **Verification:** 37/37 in the file; 2134/2134 across the suite.
- **Committed in:** `6ca786e`

**2. [Rule 2 — Missing Critical] The new doc block quoted the attribute value it forbids**

- **Found during:** Task 2 acceptance greps
- **Issue:** The acceptance criterion `grep -c "aria-disabled=\"false\"..." ` must return 0.
  My `InertibleSegmentedControl` doc block explained the rule by quoting the forbidden
  value, so the gate matched its own documentation — exactly the failure mode
  `FeasibilityBar`'s doc block records as a repository convention ("the acceptance checks
  for this file are plain text searches, and a doc block that quotes what it is explaining
  makes the gate match its own documentation").
- **Fix:** Reworded the block to describe the attribute values rather than quote them, and
  stated the convention and its source inline.
- **Files modified:** `src/ui/screens/ConfigScreen.tsx`
- **Verification:** The grep now returns only the one pre-existing occurrence (below).
- **Committed in:** `6ca786e`

### Accepted Scope Boundaries

**`grep -c "aria-disabled=\"false\"..." src/ui/screens/ConfigScreen.tsx` returns 1, not 0.**

The remaining hit is `ConfigScreen.tsx:1893`, a comment inside the `Duplicate bans` block
that shipped in an earlier phase and explains why that control does *not* use the value.
It predates this plan, so the criterion as literally written was already unmeetable at
planning time. The criterion's substance is met: **zero** rendered occurrences — every
inert control in the file sets `undefined` when live, and a test asserts
`getAttribute('aria-disabled')` is `null` rather than `'false'`. Rewriting a prior phase's
comment is outside this plan's scope boundary, so it was left alone and recorded here.

### Files Beyond the Declared `files_modified`

Two files outside the plan's frontmatter list were touched, both by Task 1 and both
directed by the plan's own `<action>` prose:

- `src/ui/confirm-copy.ts` — the plan states "`confirm-copy.ts:20-46` is where this phase's
  `matches` helper lives, and the config screen imports it rather than declaring a second
  one." 05-UI-SPEC §Copywriting likewise names `matches` as one of the two helpers this
  phase adds there.
- `tests/ui/config-screen.test.tsx` — held the only assertion on the superseded
  `DEPTH_NOTE` string. Amendment 2 makes that sentence false, so the file could not stay
  green unchanged. The case was inverted rather than deleted.

Neither touches `src/core/`, `src/adapters/`, `package.json`, `STATE.md` or `ROADMAP.md`,
and neither is a file another wave-2 plan owns.

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical) + 1 accepted scope boundary
+ 2 plan-directed file additions.
**Impact on plan:** No scope creep. Both auto-fixes were necessary — the first corrected a
test that would have mis-asserted 05-01's deliberate precedence ordering, the second
restored a stated repository convention.

## Issues Encountered

- **The worktree forked from a stale base.** The assertion caught it: the worktree HEAD was
  at `93f20ad` ("docs(03): create phase plan"), four phases behind the expected
  `9dbe317`. Corrected with the sanctioned startup `git reset --hard`, then verified
  Wave 1 was present (`bracketNeedsFourPlayers` in `src/core/feasibility.ts`) before
  writing anything. This is the recurring hazard already recorded in memory; the assertion
  earned its place again.
- **Task 1 was recovered, not redone.** `git merge --ff-only worktree-agent-a0ca072e5cbaa8bf4`
  fast-forwarded cleanly to `f9ef92a`. Its 30 tests were run green before Task 2 began, so
  the recovery was verified rather than assumed. Contrary to the prior agent's last words,
  Task 1's test suites *had* landed; only Task 2 remained entirely undone.
- `SegmentedControl` accepts no `aria-*` props, and it is not in this plan's
  `files_modified`. Resolved without touching it, by wrapping — which is also what
  05-UI-SPEC §1 asks for ("the whole control is `aria-disabled`") and what the
  `Duplicate bans` block already does.

## Verification

Full `npm run verify` equivalent, run from the worktree against the main checkout's
`node_modules` (no `npm install`, no junction):

- `check:pure` — 0 violations in 19 files under `src/core`
- `check:nohtml` — 0 violations in 74 files under `src`
- `tsc --noEmit` on both `tsconfig.json` and `tsconfig.node.json` — clean
- `vitest run` — **2134 passed / 2134**, 64 files
- `vite build` — built in 362 ms; `build-sw-manifest` produced 322 URLs, 1011.4 kB precached
- `git diff --stat` against the base for `package.json` — **empty**
- `git diff --stat` against the base for `src/core/ src/adapters/` — **empty**

## Known Stubs

None. Every control on this screen is wired to real state and writes a real value into the
document. The three new fields are consumed by the surfaces later plans in this phase build;
that is a dependency, not a stub.

## Next Phase Readiness

- Every document created from this screen onward carries `depth`, `matchMetric`,
  `roundRobinFormat` and `bracketFormat`, so the round-robin grid, match record entry, the
  standings tiebreak and the bracket can all read their configuration rather than infer it.
- `InertibleSegmentedControl` is available for the phase's remaining inert surfaces — the
  cut control inert until the round robin completes (§8) is the obvious next consumer, and
  it needs the same shed behaviour.
- `confirm-copy.ts` now has `matches`; 05-UI-SPEC §Copywriting also names `tournaments`,
  which the library plan will need to add.
- No blockers.

## Self-Check: PASSED

- All six claimed files present on disk.
- Both task commits present in `git log`: `f9ef92a`, `6ca786e`.
- `package.json`, `src/core/` and `src/adapters/` unchanged against the base `9dbe317`.
- `STATE.md` and `ROADMAP.md` untouched — the orchestrator owns those writes.

---
*Phase: 05-full-tournament-brackets-standings-archive*
*Completed: 2026-08-27*
