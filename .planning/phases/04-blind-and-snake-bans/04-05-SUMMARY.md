---
phase: 04-blind-and-snake-bans
plan: 05
subsystem: ui
tags: [preact, signals, segmented-control, inert, routing, serpentine, tdd]

# Dependency graph
requires:
  - phase: 04-01
    provides: schema 4, `bansPerPlayer` and `duplicateBanPolicy` on `TournamentConfig`, `MAX_BANS_PER_PLAYER`
  - phase: 04-02
    provides: the three `bansPerPlayer*` feasibility codes and the two new `FeasibilityInput` fields
  - phase: 04-04
    provides: `selectBanStageState`, `selectBanTurn`, `selectBanOrder`, `selectPublicBanIds`
provides:
  - "`createBanStage` — a sibling of `createTournament` taking no pool, with rollback on refusal"
  - "`Bans per player`, rendered only at blind or snake, bounded by `MAX_BANS_PER_PLAYER`"
  - "The `Duplicate bans` control with the re-ban branch shipped disabled (BAN-07 partial, D-19)"
  - "`Snake` enabled as a ban mode; `Blind` still disabled until 04-09"
  - "A fourth `Screen` member, `{ name: 'bans' }`, rendered inside the existing `inert` gate"
  - "`BanStageScreen`, which branches on `selectBanStageState` and computes nothing"
  - "`selectStillToBanThisPass` — who is left in the current serpentine column"
  - "`TurnBanner`'s ban branch: `Pass {p} of {passes} — {name} bans` plus its phase line"
  - "`screenForState` — the one place a document's screen is decided"
affects: [04-06, 04-07, 04-08, 04-09, 04-10, 04-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Disabled-member pattern for a partially-built requirement (D-19), reusing D-12's shipped form"
    - "Routing derived from a core selector rather than from the call site"
    - "A screen prop bag (`topBar`) for handlers the screen renders but does not own"

key-files:
  created:
    - src/ui/screens/BanStageScreen.tsx
    - src/ui/screens/BanStageScreen.css
    - tests/ui/config-bans.test.tsx
  modified:
    - src/store.ts
    - src/app.tsx
    - src/core/selectors.ts
    - src/ui/screens/ConfigScreen.tsx
    - src/ui/screens/ConfigScreen.css
    - src/ui/components/TurnBanner.tsx
    - tests/ui/ban-stage.test.tsx
    - tests/ui/turn-banner.test.tsx
    - tests/ui/read-only-shell.test.tsx
    - tests/ui/ban-mode.test.tsx
    - tests/core/selectors.test.ts

key-decisions:
  - "`Blind` stays a disabled option in this plan even though 04-UI-SPEC §1 enables it — 04-09 owns its locked state and 04-10 its shield, and a mode whose surfaces do not exist strands a host (T-04-21)"
  - "`BanStageScreenProps` gained a fifth field, `topBar`, because the plan's declared four cannot render the `TopBar` the same plan requires"
  - "The board pane renders nothing: `BanBoard` and the snake board pane are 04-08's, per that plan's own `files_modified`"
  - "`screenForState` replaced all four `setScreen({ name: 'draft' })` sites, not just the config screen's — resume, import and promotion can each be handed a snake ban stage"
  - "`selectStillToBanThisPass` was added rather than sliced in the component: `order.slice(index + 1)` is wrong on every even pass"

patterns-established:
  - "A wholly void affordance is absent, a merely inapplicable one is inert with a visible reason — both now demonstrated in one control group"
  - "Inert ARIA is derived from render state, never mirrored into `useState`, so WR-04's shedding is structural"

requirements-completed: [BAN-03, BAN-07, RULE-08]

# Metrics
duration: 48min
completed: 2026-08-24
---

# Phase 4 Plan 5: The Ban Stage Start Seam and Its Fourth Screen Summary

**A host picks `Snake`, types a bans-per-player number, taps `Start draft`, and the shared screen says `Pass 1 of 2 — Ada bans` over the full 235-entry roster — a ban stage that is a fourth screen inside the read-only gate rather than a mode inside the draft.**

## Performance

- **Duration:** ~48 min (this agent; Task 1 was executed earlier by a separate agent)
- **Tasks:** 3 of 3 complete
- **Files modified:** 15 (3 created, 12 modified) across both agents
- **Tests:** 1775 passing in 55 files, up from 1732 in 54

## Accomplishments

- **Snake is selectable and it goes somewhere.** `BAN_MODE_OPTIONS` lost the `— Not yet available` suffix on `snake`, `handleStart` branches on `banMode`, and `createBanStage` gives blind and snake a start seam that emits `schedule/compiled` then `draft/started` with no pool.
- **The ban stage is a fourth `Screen` member, inside the `inert` gate.** Pitfall 4 is real and the test proved it: before the fourth screen landed, a resumed snake ban stage rendered `Round 1 of 6 — Ada plays a card`, because `selectPhase` answers `'cards'` for a resolved order over an empty pool.
- **BAN-07's config surface is settled with its unbuilt half shipped disabled.** `Re-ban — Not yet available` is a disabled member of a real control, so 04-xx enables an option rather than adding a control plus a schema bump.
- **RULE-08's config-time surface is live.** `banMode` and the parsed `bansPerPlayer` now reach `checkFeasibility`, so the three blocking codes 04-02 built can finally fire.

## Task Commits

Each task was committed atomically, RED then GREEN.

1. **Task 1: `createBanStage`** — `774cf87` (test), `74b747d` (feat)
   **Executed by an earlier agent, not this one.** That agent was terminated by a provider session limit mid-Task-2. Both commits are already on `main` and were verified green there before this agent started; this agent re-verified them as its worktree base and did not re-do the work.
2. **Task 2: The `Bans` group grows** — `cc462f3` (test), `eb67ac0` (feat)
3. **Task 3: A fourth screen inside the inert gate** — `34199cf` (test), `be68933` (feat)

## Files Created/Modified

- `src/ui/screens/BanStageScreen.tsx` — the stage shell. Branches on `selectBanStageState`; three arms return `null` with a comment naming the plan that lands each and why it is unreachable now.
- `src/ui/screens/BanStageScreen.css` — deliberately rule-free, documenting the six stylesheets the stage inherits instead, in the shape `ConfigScreen.css`'s comment-only sections established.
- `src/ui/screens/ConfigScreen.tsx` — `Snake` enabled, `Bans per player`, `Duplicate bans`, the feasibility wiring, and `handleStart`'s branch.
- `src/app.tsx` — the fourth `Screen` member, `screenForState`, the three-way shell class, `handlePlaceBan`, and the render site inside the gate.
- `src/core/selectors.ts` — `selectStillToBanThisPass`, composing `selectBanOrder` rather than re-deriving the serpentine.
- `src/ui/components/TurnBanner.tsx` — the ban branch and its phase line; every other phase line is now guarded on `banLine === null`.
- `tests/ui/config-bans.test.tsx` — 19 cases, every visible string asserted in full.

## Decisions Made

**`Blind` stays disabled, against 04-UI-SPEC §1 and with the plan.** The spec enables both new modes; the plan enables only `snake` and its acceptance criteria demand `grep -c "Blind — Not yet available"` return 1. The plan is right on sequencing — 04-09 lands the locked state and 04-10 the shield — and enabling a mode with no surfaces is T-04-21. Recorded in the source above `BAN_MODE_OPTIONS`.

**`BanStageScreenProps` gained `topBar`.** The plan declares four props and separately requires the screen render `TopBar`, which needs six required handlers the four cannot supply. One bag keeps the declared four intact and makes explicit that the screen owns none of those concerns.

**The board pane is empty.** `04-08-PLAN.md` lists `BanBoard.tsx`, `BanBoard.css` and "the snake board pane" in its own `files_modified`. Building a stand-in here would be work 04-08 deletes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `tests/ui/ban-mode.test.tsx` asserted both new modes were refused**

- **Found during:** Task 2
- **Issue:** A Phase 2 test asserted `blind` AND `snake` were disabled with `— Not yet available` labels. Enabling `snake` is this plan's point, so the assertion had to move; the whole suite failed on it.
- **Fix:** Narrowed the refusal case to `blind` alone, added the mirror-image assertion that `snake` is enabled and unsuffixed, and corrected the file's doc block — CLAUDE.md requires a superseded contract comment be fixed in the change that breaks it.
- **Files modified:** `tests/ui/ban-mode.test.tsx`
- **Verification:** `vitest run` — 55 files, 1775 tests green.
- **Committed in:** `eb67ac0`

**2. [Rule 2 - Missing critical functionality] Three of four routing sites would have dropped a ban stage on the draft screen**

- **Found during:** Task 3
- **Issue:** The plan names `handleStart`'s route. `app.tsx` has three more — resume, import, and adopt-on-promotion — and every one can be handed a snake ban stage. Each would have rendered the draft screen against an empty pool, which is Pitfall 4 arriving through the router instead of through a mode. The seeded-resume test caught it concretely: `Round 1 of 6 — Ada plays a card` on a ban stage.
- **Fix:** Added `screenForState(state)`, which branches on `selectBanStageState`, and routed all four sites through it.
- **Files modified:** `src/app.tsx`
- **Verification:** `tests/ui/read-only-shell.test.tsx` resumes a seeded snake ban stage and asserts `.draft-shell` and `Pass 1 of 2 — Ada bans`.
- **Committed in:** `be68933`

**3. [Rule 3 - Blocking] The phase line needed a selector the plan did not name**

- **Found during:** Task 3
- **Issue:** `Still to ban this pass:` needs the players remaining in the current column. No 04-04 selector answers it, and the plan forbids computing it in the screen.
- **Fix:** Added `selectStillToBanThisPass` to `src/core/selectors.ts` with six core tests — following the plan's own instruction that a surface needing the UI to decide a rule means the selector is missing. The naive `order.slice(index + 1)` is wrong on every even pass and one test pins exactly that.
- **Files modified:** `src/core/selectors.ts`, `tests/core/selectors.test.ts`
- **Verification:** `check:pure` 0 violations; the reversed-leg case asserts `['p3','p2','p1']`.
- **Committed in:** `34199cf` (test), `be68933` (feat)

**4. [Rule 3 - Blocking] Three acceptance-criteria greps failed on prose, not on code**

- **Found during:** Tasks 2 and 3
- **Issue:** `grep -c "Re-ban — Not yet available" ConfigScreen.tsx` returned 2, `grep -cE "useMemo|\.filter\(|\.reduce\(" BanStageScreen.tsx` returned 2, and the `font-size|font-weight` grep on `BanStageScreen.css` returned 2 — every extra hit was a doc comment quoting the thing it forbade.
- **Fix:** Reworded each comment to describe rather than restate. The `Re-ban` label now exists exactly once in the file, which is also the better outcome: a comment restating a copy string is the first copy free to drift.
- **Files modified:** `src/ui/screens/ConfigScreen.tsx`, `src/ui/screens/BanStageScreen.tsx`, `src/ui/screens/BanStageScreen.css`
- **Verification:** All six Task 2 and Task 3 greps now return their required counts.
- **Committed in:** `eb67ac0`, `be68933`

---

**Total deviations:** 4 auto-fixed (2 × Rule 3 blocking, 1 × Rule 2, 1 × Rule 3 tooling)
**Impact on plan:** No scope creep. Deviation 2 is the one that mattered — it is a correctness hole the plan's own threat model implies but does not enumerate, and it would have shipped a broken resume for every snake tournament.

## Issues Encountered

**The worktree forked from a stale base, again.** `git merge-base` reported `93f20ad` — a Phase 3 commit — against an expected base of `e0ed5d6`. This is now six-for-six on Phase 4 worktrees. The startup assertion caught it and `git reset --hard` corrected it; the follow-up checks (`grep -c createBanStage src/store.ts`, `ls tests/ui/ban-stage.test.tsx`) confirmed Task 1's work was present before any code was written.

**The rescued Task 2 RED test had never been run, and three of its assumptions were wrong.** It queried `.feasibility-bar__problem`, a class that does not exist — `FeasibilityBar` renders `problems[0]` and a count of the rest, never a list — so its blocking-reason assertions would have passed vacuously against `[]`. It also carried an unnecessary `trimToTwoPlayers` helper built around a confirm dialog that blank player rows do not raise. Rewritten to resolve the reason through `aria-describedby`, which is the convention `config-feasibility.test.tsx` set and which asserts the wiring and the copy together. Its structure, its D-19/WR-04 reasoning and most of its cases were sound and were kept.

## Known Stubs

- **`BanStageScreen`'s board pane renders `null`.** 04-08 owns `BanBoard` and the snake board pane by its own `files_modified`. The pool pane — the only interactive surface on the screen — is fully wired, so the plan's goal is met.
- **Three `selectBanStageState` arms return `null`:** `'blindLocked'` (04-09), `'blindEntry'` (04-10), `'reveal'` (04-11). Each carries a comment naming its plan and why it is unreachable today. `'blindLocked'` and `'blindEntry'` are unreachable because `Blind` is a disabled option; `'reveal'` is reachable in snake the moment the last ban lands and is 04-11's.
- **An already-banned cell is not yet inert.** 04-06 owns that. Until then `canApply`'s `banAlreadyPlaced` refuses such a click — a real refusal rather than a crash, noted in the source.

## Threat Flags

None. The plan's threat register was followed: T-04-20 is asserted by a containment test in a read-only tab, T-04-21 by keeping `Blind` disabled, T-04-22 by moving the `draw === null` guard inside the `hostBanlist` branch and testing the snake start, T-04-24 by importing `MAX_BANS_PER_PLAYER` rather than restating 24. No new network endpoint, auth path, file access or trust-boundary schema change was introduced.

## Next Phase Readiness

`BanStageScreen` is the mount point 04-06 through 04-11 all plug into, and its `'snake'` arm is a working example of the shape. `selectStillToBanThisPass` joins 04-04's seven selectors. The one thing a later plan must not undo: the ban stage is a **sibling of the other three screens inside** the `inert` gate, and `read-only-shell.test.tsx` asserts containment rather than mere presence.

Two one-line moves are queued and deliberate: 04-09 flips `blind` to enabled in `BAN_MODE_OPTIONS`, and 04-08 fills `SplitPanes`' `board` prop.

## Self-Check: PASSED

Created files present on disk: `src/ui/screens/BanStageScreen.tsx`,
`src/ui/screens/BanStageScreen.css`, `tests/ui/config-bans.test.tsx`,
`.planning/phases/04-blind-and-snake-bans/04-05-SUMMARY.md`.

All seven commits present in history: `774cf87`, `74b747d` (Task 1, earlier agent, reachable
through the merge at `e0ed5d6`), `cc462f3`, `eb67ac0` (Task 2), `34199cf`, `be68933` (Task 3),
`c56d47d` (this summary).

Gates on the final tree: `check:pure` 0 violations in 18 files, `check:nohtml` 0 violations in
68 files, `tsc --noEmit` clean, `vite build` clean, `vitest run` 1775 passing in 55 files.

---
*Phase: 04-blind-and-snake-bans*
*Completed: 2026-08-24*
