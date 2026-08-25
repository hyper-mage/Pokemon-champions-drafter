---
phase: 04-blind-and-snake-bans
plan: 10
subsystem: ui
tags: [preact, adapters, bfcache, lifecycle, secrecy, live-region, blind, focus]

# Dependency graph
requires:
  - phase: 04-blind-and-snake-bans
    provides: "04-09's `BlindLocked`, its `discardedPlayerName` notice and the screen-owned `primaryActionRef`"
  - phase: 04-blind-and-snake-bans
    provides: "04-05's `BanStageScreen`, its `'blindEntry'` stub arm and its `topBar` prop bag"
  - phase: 04-blind-and-snake-bans
    provides: "04-04's `selectBanStageState` and `selectSubmittedPlayerIds`"
  - phase: 03-config-and-pool
    provides: "`PoolGrid`'s ban mode, `idPrefix`, `banCountLine` and the `.pool--ban` capped scroll region"
  - phase: 02-draft-core
    provides: "`TypeaheadField`, `BanChipList`, and `FeasibilityBar`'s sticky-footer mechanism"
provides:
  - "`installBanShield` — the lifecycle guard, in adapters, proved able to fail by mutation"
  - "`BlindEntry` — the full-screen entry surface, with no import path to the broadcast region"
  - "The entry transition on `BanStageScreen`, and one exit path serving all four ways out"
  - "`onSubmitBans` on `BanStageScreenProps`, and `handleSubmitBans` in `app.tsx`"
  - "`lockedPlayerName` on `BlindLockedProps`, closing 04-09's live-region handover"
  - "`BanChipList`'s list name as a complete noun phrase, so a possessive can name a list"
affects: [04-11 the reveal]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A gate proved able to fail by MUTATION rather than by inspection — the always-fires guard was run against the suite and broke exactly one case"
    - "Test helpers that BUILD an event and never dispatch one, so the window/document asymmetry stays visible at every call site"
    - "A latest-value ref for the caller's handler, so a stable callback's stability is a property of the component rather than a promise every caller keeps"
    - "The screen hands down WHAT JUST HAPPENED rather than the component inferring it, so a page resume is silent by construction"
    - "A determiner belongs to the noun phrase it determines — moving an article into a parameter rather than adding a second parameter or a branch"

key-files:
  created:
    - src/adapters/ban-shield.ts
    - src/ui/components/BlindEntry.tsx
    - src/ui/components/BlindEntry.css
    - tests/adapters/ban-shield.test.ts
    - tests/ui/blind-entry.test.tsx
  modified:
    - src/app.tsx
    - src/ui/components/BanChipList.tsx
    - src/ui/components/BlindLocked.tsx
    - src/ui/screens/BanStageScreen.tsx
    - src/ui/screens/BanStageScreen.css
    - src/ui/screens/ConfigScreen.tsx
    - tests/ui/ban-stage.test.tsx
    - tests/ui/blind-locked.test.tsx

key-decisions:
  - "The bfcache gate was verified by MUTATION: `if (true) onLock()` was run against the suite and failed exactly one case, which is the proof the plan asked for and that inspection cannot give"
  - "Test helpers build the event and the test dispatches it, so `dispatchEvent` appears at every call site and the `window`/`document` split is readable where it matters"
  - "`leaveEntry` closes over NOTHING — the entering seat and the caller's submit handler are both read through refs — so the shield cannot churn even if a caller passes an inline arrow"
  - "`lockedPlayerName` rather than announce-on-mount: it is the SCREEN'S MEMORY of a transition, and that memory dies on reload, which is what keeps a resume silent"
  - "No cells are closed on the entry surface. `banInert` there could only hold ANOTHER PLAYER'S bans, which is the exact thing being kept secret"
  - "The grid caps the selection at the allotment, because the copy contract gives exactly one blocked reason and an over-full selection would be a state with no sentence for it"
  - "`BanChipList`'s hard-coded `the` moved into the list-name phrase; every shipped string is byte-identical and a possessive is now expressible"

patterns-established:
  - "A mechanical gate is not trusted until it has been made to fail on purpose"
  - "When a transition spans a remount, the parent that owns the transition reports it; the child never infers it from its own props"

requirements-completed: [BAN-04, BAN-05, BAN-06]

# Metrics
duration: ~25min
completed: 2026-08-25
---

# Phase 4 Plan 10: The Blind Entry Surface and the Shield That Guards It Summary

**The host taps `Enter Ada's bans`, the screen becomes nothing but Ada's ban entry, two names go
in, `Lock in Ada's bans` puts the screen back to `1 of 4 entered` — and a browser Back, an
alt-tab, or a tap on `Hide these bans` all land in exactly the same place with nothing kept.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 3 of 3
- **Commits:** 5
- **Tests:** **1955 passing in 60 files**, up from 1908 in 58 — 47 new

## Task Commits

| Task | RED | GREEN |
|------|-----|-------|
| 1 — the shield | `e6c0b6e` | `28cdab5` |
| 2 — the entry surface | `2448683` | `040e297` |
| 3 — four exits, one destination | — (see deviation 4) | `992bdc2` |

## What Was Built

### Task 1 — `installBanShield`, and a gate that was made to fail on purpose

`src/adapters/ban-shield.ts` registers `pageshow` and `pagehide` on `window` and
`visibilitychange` on `document`, and returns its own teardown. The asymmetry is copied from
`persistence.ts:438-451` verbatim with a comment on it, because it reads like an inconsistency
and normalising it would make D-18 a silent no-op in whichever browsers do not forward
`visibilitychange` on `window`.

It is deliberately **not** in `tab-lock.ts`'s `installLifecycle`, which is a module-level
singleton torn down through one module-level variable — a second concern there would tie the ban
stage's lifetime to the lock's. `git diff --stat src/adapters/tab-lock.ts` is empty.

**The load-bearing thing in this task is not the adapter — it is that its test can fail.**
04-RESEARCH measured that constructing a `PageTransitionEvent` with `{ persisted: true }` yields
`persisted === undefined` under the installed happy-dom, so the obvious test exercises the falsy
branch and proves nothing. Rather than trust that, the guard was mutated to `onLock()`
unconditionally and the suite re-run: **one case failed, the non-persisted `pageshow`.** The
file was restored and re-verified green. That is recorded here because "we wrote both polarities"
and "the gate can fail" are different claims and only the second one matters.

### Task 2 — `BlindEntry`, the whole working area

`04-UI-SPEC` §5's six rows top to bottom, every string verbatim: the `--text-display` `<h1
tabindex="-1">` reading `{playerName}'s bans`, the `{k} of {m} chosen` progress line, the
typeahead, the chip list, the ban-mode `PoolGrid` over all 235 entries under its own `idPrefix`,
and the sticky footer on `FeasibilityBar`'s mechanism.

Focus goes to the **heading**, not the field. The reason is in the source: the one fact that must
never be got wrong is which player is being entered, and an auto-focused input has the field read
out instead of the name.

`Lock in` takes `aria-disabled` through an object spread, so both it and `aria-describedby` are
genuinely **absent** at the allotment rather than set to a negative string (WR-04) — `MonCard`'s
`inertProps` shape one component over. Native `disabled` appears on neither control.

**Assertion S1 holds by imports:** the module reaches nothing in `LiveRegion`. The doc block
spends a paragraph on why that is *not* "the entry surface gives no feedback", because that is a
wrong reading a later contributor could act on — `aria-pressed`, `aria-activedescendant` and the
chip list are focus-scoped and are not the broadcast region.

One thing was deliberately **not** built, and it is written into the doc block: no cells are
closed. `PoolGrid`'s own `banInert` block anticipates this surface, but the only set it could
hold here is another player's bans — which is precisely what the ritual is keeping secret. A
struck-through cell would disclose one to whoever is at the screen. `canApply` agrees: it refuses
duplicates only *within* one submission, because a collision across players is legal under D-19.

### Task 3 — four exits, one destination

The `'blindEntry'` arm is built. `selectBanStageState` still never returns it — entry is a
transient component state this screen owns, and D-18 requires the in-progress selection to die
with the component, so `entering` is a `useState` with the reason for not lifting it written in
place.

**The surface is conditionally rendered and never hidden.** Both verified reasons are in the
source: a hidden component keeps its state, and `PoolGrid`'s 300 ms debounce plus its zero-delay
repeat timer are cancelled *only* on unmount, so a hidden-but-mounted grid would speak after the
locked state cleared the region (S7). Unmounting satisfies S9 for free, because there is no
change-over for an effect to attach to.

All four exits run through one `leaveEntry`, which **closes over nothing** — the entering seat and
the caller's submit handler are both read through refs — so `handleShieldLock` is stable no matter
what the caller passes and the shield cannot re-register on a render. Focus lands on
`primaryActionRef` through a no-dependency `useLayoutEffect` that always clears its own flag,
which is `app.tsx`'s shape for its two existing handoffs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] `BanStageScreenProps` had no way to record a submission**

- **Found during:** Task 3
- **Issue:** The plan requires locking in to "dispatch `bans/submitted` with the player's whole
  allotment", but no component may reach `dispatch` (CLAUDE.md §Architecture — one write path) and
  the screen had no prop for it. This is the identical hole 04-09 hit with `onReveal`.
- **Fix:** `onSubmitBans: (playerId, monIds) => void` on `BanStageScreenProps`, and
  `handleSubmitBans` in `app.tsx`. The whole allotment in one call, because `canApply`'s
  `wrongBanCount` refuses anything that is not exactly `bansPerPlayer` long — a per-species prop
  would be a prop whose every call is refused.
- **Files modified:** `src/ui/screens/BanStageScreen.tsx`, `src/app.tsx`, and the three
  `BanStageScreen` harnesses in `tests/ui/ban-stage.test.tsx`
- **Commit:** `992bdc2`

**2. [Rule 2 - Missing critical functionality] The live-region hazard 04-09 handed forward**

- **Found during:** Task 3
- **Issue:** `BlindLocked` speaks the lock sentence on an **increase** in `entered` within its own
  lifetime. The entry surface swaps it out and back, so the submission lands across a remount and
  the increase never fires: the screen would have been correct and completely silent about the one
  thing the room is waiting to hear. 04-09's note named this explicitly and offered two
  resolutions.
- **Fix:** The second of them — the screen hands the just-locked player down as
  `lockedPlayerName`. The first (keeping `BlindLocked` mounted beneath the shield) was **rejected
  on evidence**: it requires the locked state to be present but off-screen, which is exactly the
  hidden-not-unmounted pattern this plan's own acceptance criteria grep for. `BlindLocked`'s mount
  effect now speaks the discard notice, the lock sentence or `''`, still mount-scoped and still
  one write, so S7 is unchanged. **This is not "announce on mount", which 04-09 warned makes a
  resume lie:** the prop is the screen's memory of a transition, held in component state one level
  up, so a reload starts at `null` and stays silent.
- **Also fixed the same gap for the discard**, which 04-09 built as a visible notice with no
  spoken counterpart even though `04-UI-SPEC` lists it as a permitted announcement.
- **Files modified:** `src/ui/components/BlindLocked.tsx`, `src/ui/screens/BanStageScreen.tsx`,
  `tests/ui/blind-locked.test.tsx`
- **Commit:** `992bdc2`

**3. [Rule 1 - Bug] `BanChipList` could not name a possessive list**

- **Found during:** Task 2
- **Issue:** `04-UI-SPEC` §5 gives the chip accessible name as `Remove {name} from {playerName}'s
  bans`. The shipped composer hard-codes the article — `Remove ${name} from the ${listName}` —
  which yields **`Remove Venusaur from the Sam's bans`**. Not English, and not the contract string.
- **Fix:** The determiner moved into the noun phrase it determines. `DEFAULT_LIST_NAME` became
  `the banlist` and `MEGA_BAN_LIST_NAME` became `the Mega-forme banlist`; a caller that supplies
  the phrase now supplies all of it. Rejected: a second parameter for the article, and a branch on
  whether the name is possessive — both add a decision where a phrase already carries one.
  **Every shipped string is byte-identical**, confirmed by `ban-grid`, `ban-list` and `mega-ban`
  passing untouched.
- **Files modified:** `src/ui/components/BanChipList.tsx`, `src/ui/screens/ConfigScreen.tsx`
- **Commit:** `040e297`

**4. [Rule 3 - Blocking] Task 3 could not have a compiling RED commit**

- **Found during:** Task 3
- **Issue:** Its tests reference `onSubmitBans`, which does not exist until the prop is added. A
  RED commit would have failed `tsc`, and `tsc` is inside `npm run build` and therefore inside
  `npm run verify` — so the RED state was not committable without leaving the tree failing a gate
  for reasons unrelated to the behaviour under test.
- **Fix:** Task 3 landed as one commit with its tests. Tasks 1 and 2 kept the full RED → GREEN
  pair, and Task 1's RED was confirmed failing for the right reason (`installBanShield` absent)
  before the adapter was written.
- **Commit:** `992bdc2`

**5. [Rule 3 - Blocking] Three comments tripped their own greps**

- **Found during:** Tasks 2 and 3
- **Issue:** The fourth, fifth and sixth occurrences of this defect in the phase. `BlindEntry.tsx`
  explained the focus rule with the words "an auto-focused input **announces** the field" against
  a grep requiring zero matches for `announce`, and cited `SplitPanes` as precedent against a grep
  requiring zero matches for the three chrome component names.
- **Fix:** Reworded to describe rather than to name — "has a screen reader read out the field",
  and "the pool cell, the card face and the pane controls". The same discipline was applied
  pre-emptively to `BlindEntry.css` and `BanStageScreen.css`, both of which document the motion
  prohibition without writing any of the three forbidden property names, with a sentence saying
  why they are phrased that way.
- **Files modified:** `src/ui/components/BlindEntry.tsx`
- **Commit:** `040e297`

**6. [Rule 1 - Bug] A new test asserted a shape the store does not produce**

- **Found during:** Task 3 verification
- **Issue:** `expect(getState()?.banSubmissions).toEqual([{ playerId, monIds }])` failed because a
  submission also carries `seq`. The screen was correct; the assertion was not.
- **Fix:** `toMatchObject`, with a comment recording that `seq` is the store's business and the
  handle 04-07's undo finds a submission by.
- **Files modified:** `tests/ui/ban-stage.test.tsx`
- **Commit:** `992bdc2`

---

**Total deviations:** 6 — 2 × Rule 1, 2 × Rule 2, 2 × Rule 3.
**Impact on plan:** No scope creep and no architectural change. Deviations 1 and 2 are holes the
plan's own `<interfaces>` block implies but does not close, and deviation 2 is the one the
executor brief named as a success criterion in its own right.

## Issues Encountered

**The stale worktree base fired again — eight for eight.** `git merge-base` reported `93f20ad`,
the same **Phase 3** commit every previous Phase 4 worktree forked from, against the required base
`cf55800`. The startup assertion caught it before a line was written, `git reset --hard` corrected
it, and the follow-up check confirmed `src/ui/components/BlindLocked.tsx` was on disk before any
code was written. No work was lost and wave 7 was not rebuilt.

**The blind harness rendered no live region.** `announce` writes a module-level signal with
`LiveRegion` as its only reader, so `announce.value` does not exist and the four announcement
assertions could not be written that way. `mountBlindStage` now renders a `LiveRegion` beside the
stage for every case rather than only the announcement ones, so all of them exercise the same
surface. It stays empty unless something spoke, which is what the existing S3 leak sweep in that
file depends on.

## Verification Notes

All four `npm run verify` gates pass, run against the main checkout's binaries with this worktree
as cwd. **No `node_modules` junction, symlink or copy was created in this worktree.**

- `check:pure` — 0 violations in 18 files under `src/core`. `ban-shield.ts` is in
  `src/adapters/`, where a lifecycle guard belongs, and nothing in core imports it.
- `check:nohtml` — 0 violations in 72 files under `src`
- `vitest run` — **60 files, 1955 tests, all passing**
- `tsc --noEmit` clean on both projects; `vite build` clean; `build-sw-manifest` — 322 URLs
- `git diff --stat package.json` — empty. This plan installs nothing.
- `git diff --stat src/adapters/tab-lock.ts` — empty
- `git diff --diff-filter=D` across the whole plan — **no file deleted**

| Check | Required | Actual |
|-------|----------|--------|
| `export function installBanShield` in `ban-shield.ts` | 1 | 1 |
| `event.persisted` in `ban-shield.ts` | 1 | 1 |
| `window.addEventListener('pageshow'` in `ban-shield.ts` | 1 | 1 |
| `document.addEventListener('visibilitychange'` in `ban-shield.ts` | 1 | 1 |
| the `PageTransitionEvent` constructor form, anywhere in `tests/` | 0 | 0 |
| `Object.assign(new Event('pageshow')` in `ban-shield.test.ts` | ≥ 1 | 1 |
| `dispatchEvent` in `ban-shield.test.ts` | ≥ 6 | 11 |
| `announce` in `BlindEntry.tsx` | 0 | 0 |
| `TopBar\|TurnBanner\|SplitPanes` in `BlindEntry.tsx` | 0 | 0 |
| `\bdisabled=\{` in `BlindEntry.tsx` | 0 | 0 |
| `idPrefix` in `BlindEntry.tsx` | ≥ 1 | 1 |
| `transition\|animation\|@keyframes` in `BlindEntry.css` | 0 | 0 |
| `font-size\|font-weight\|#hex` in `BlindEntry.css` | 0 | 0 |
| `var(--text-display)` in `BlindEntry.css` | ≥ 1 | 1 |
| `installBanShield` in `BanStageScreen.tsx` | ≥ 1 | 3 |
| `useCallback` in `BanStageScreen.tsx` | ≥ 1 | 5 |
| `hidden=\{\|style=\{\{ display` in `BanStageScreen.tsx` | 0 | 0 |
| `display: none\|visibility: hidden` in `BanStageScreen.css` | 0 | 0 |
| `transition\|animation\|@keyframes` in `BanStageScreen.css` | 0 | 0 |
| `useMemo\|.filter(\|.reduce(` in `BanStageScreen.tsx` | 0 | 0 |

### Two criteria read differently than they were written

**`grep -c "return null" src/ui/screens/BanStageScreen.tsx` is specified as 1. It returns 3, and
it returned 3 at this plan's base commit too** — 04-09 recorded the identical discrepancy against
its own specified value of 2. The file has never carried one `return null` per arm: 04-05 wrote a
**single trailing `return null`** whose comment covers the remaining arms together, and the other
two hits are unrelated guards (the snake `turn === null` branch, and `bannedIn`'s unresolvable-id
lookup). The criterion's stated intent — "only `'reveal'` remains, still naming 04-11" — holds
exactly: `'reveal'` and `'notRunning'` are the only arms that render nothing, and the comment
above the trailing `return null` now records `'blindEntry'` as **built**, describing where it is
mounted from instead of naming a plan that owes it. Nothing was changed to satisfy the number,
because doing so would mean splitting one honest branch into three.

**"All four exits produce the same discard notice string" is asserted for the three that produce
one.** Locking in is a submission, not a discard, and `BlindLocked`'s own composer documents the
notice as "ONE string for three paths". The test compares the three discard notices against one
another rather than against a literal, and separately asserts that locking in produces **no**
notice — which is the stronger claim, since a fourth identical notice there would be a bug.

## Known Stubs

- **`'reveal'` still renders `null`,** with 04-11 named. Untouched by this plan.

Nothing this plan built is stubbed. `onEnter` is wired, `discardedPlayerName` is wired and raised
by three real paths, and the entry surface is mounted from a real tap.

## Threat Flags

None. No network endpoint, auth path, file-access pattern or trust-boundary schema change was
added. Every threat in the register is mitigated as specified:

| Threat | Mitigation, as shipped |
|--------|------------------------|
| T-04-46 | `event.persisted` read on `pageshow`, plus `pagehide`; both polarities asserted at the adapter AND the screen, and the guard was mutated to always-fire to prove the suite breaks |
| T-04-47 | `visibilitychange` to `hidden` discards; `visible` does not, asserted at both levels |
| T-04-48 | `Hide these bans` always live, no confirm, wired to the same one transition |
| T-04-49 | Conditional rendering only. `hidden=`, `style={{ display`, `display: none` and `visibility: hidden` all grep to 0 |
| T-04-50 | No motion rule in `BlindEntry.css`, `BlindLocked.css` or `BanStageScreen.css`; unmounting leaves nothing to attach one to |
| T-04-51 | `BlindEntry.tsx` reaches nothing in `LiveRegion`; grep returns 0 |
| T-04-52 | The shield is scoped to the surface's mount, and `leaveEntry` closes over nothing, so its identity is stable regardless of the caller. A test asserts a restore after the surface is gone raises nothing |
| T-04-53 | Accepted; no history push and no `popstate`, exactly as D-17 rejected |
| T-04-SC | Accepted; `package.json` untouched |

## Notes for 04-11

**`lockedPlayerName` and `discardedPlayerName` are mutually exclusive and both are the screen's
own state.** If the reveal adds a third arrival kind, add a third prop rather than deriving any of
them from the fold — the property that makes all of this safe on a page resume is that the screen
forgets, and a fold-derived value does not forget.

**The shield tears down with the entry surface**, so nothing is listening once the locked state is
up. A reveal screen that wants its own lifecycle guard installs its own; do not widen this one.

**`handleSubmitBans` is complete and `handleRevealBans` was complete before this plan.** The
reveal path is untouched here.

**`BanChipList`'s `listName` now includes its article.** A new call site supplies the whole noun
phrase — `the banlist`, `the Mega-forme banlist`, `Sam's bans`.

## Self-Check

Created files present on disk: `src/adapters/ban-shield.ts`, `src/ui/components/BlindEntry.tsx`,
`src/ui/components/BlindEntry.css`, `tests/adapters/ban-shield.test.ts`,
`tests/ui/blind-entry.test.tsx`.

All five commits reachable from `HEAD`: `e6c0b6e`, `28cdab5`, `2448683`, `040e297`, `992bdc2`.

**Self-Check: PASSED.** All five created files present on disk, all five task commits present in
`git log` against the plan's base `cf55800`, and the working tree is clean.

---
*Phase: 04-blind-and-snake-bans*
*Completed: 2026-08-25*
