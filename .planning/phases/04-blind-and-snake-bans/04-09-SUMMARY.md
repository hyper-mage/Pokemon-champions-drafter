---
phase: 04-blind-and-snake-bans
plan: 09
subsystem: ui
tags: [preact, secrecy, live-region, disclosure, tokens, config, blind]

# Dependency graph
requires:
  - phase: 04-blind-and-snake-bans
    provides: "04-08's `BanBoard` blind arm — the progress board whose props carry no species id"
  - phase: 04-blind-and-snake-bans
    provides: "04-05's `BanStageScreen`, its `'blindLocked'` stub arm, and its `topBar` prop bag"
  - phase: 04-blind-and-snake-bans
    provides: "04-04's `selectPublicBanIds`, `selectBanStageState` and `selectSubmittedPlayerIds`"
  - phase: 04-blind-and-snake-bans
    provides: "04-07's `{playerName}'s bans were removed.` undo announcement, already shipped in `store.ts`"
  - phase: 02-draft-core
    provides: "`TopBar`'s bans disclosure, `bannedEntries`, and `SegmentedControl`'s disabled-member mechanism"
provides:
  - "`BlindLocked` — the blind stage's resting destination, provably free of species names at every count"
  - "`BlindLocked.css` — one `--color-surface` panel from tokens only, and no motion rule at all (S9)"
  - "The `'blindLocked'` arm of `BanStageScreen`, mounting `BanBoard`'s blind arm and no panes"
  - "`Blind` as an enabled ban mode — selectable for the first time in the project's history"
  - "`bannedNames` sourced from `selectPublicBanIds`, so the one-click disclosure cannot hold an unrevealed ban"
  - "`onReveal` on `BanStageScreenProps`, and `handleRevealBans` materialising the attributed lists in starting order"
affects: [04-10 blind entry and the shield, 04-11 the reveal]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A component's props as the secrecy control at BOTH ends — 04-08 closed the board's blind arm, this closes the caller, so neither can be handed a species"
    - "`announce('')` on mount ONLY, so a clear cannot swallow a sentence another layer just wrote"
    - "A transition announcement driven by a prop INCREASE rather than by mount, so a resume is silent about things that did not just happen"
    - "One authority per fact: `nextPlayerName === null` decides the headline, the button and the helper, so they cannot disagree on the render that matters"
    - "Retarget a test whose subject was enabled rather than delete it — the mechanism it guards moves to the last surface that still has one"

key-files:
  created:
    - src/ui/components/BlindLocked.tsx
    - src/ui/components/BlindLocked.css
    - tests/ui/blind-locked.test.tsx
    - tests/ui/top-bar-bans.test.tsx
  modified:
    - src/app.tsx
    - src/ui/components/TopBar.tsx
    - src/ui/screens/BanStageScreen.tsx
    - src/ui/screens/ConfigScreen.tsx
    - tests/ui/ban-stage.test.tsx
    - tests/ui/config-bans.test.tsx
    - tests/ui/ban-mode.test.tsx

key-decisions:
  - "`announce('')` fires on MOUNT only, never on every render — an undo lowers `entered` while the locked screen is up, and 04-07's `bans were removed` sentence is the one thing telling the room what happened"
  - "The lock announcement fires on an INCREASE in `entered` within the component's lifetime, so a page resume at three entries announces nothing"
  - "`onReveal` carries NO payload: the screen reports the tap and `app.tsx` assembles the attributed lists, so the screen cannot become a second opinion about what was revealed"
  - "`primaryActionRef` is created by `BanStageScreen`, not by `BlindLocked` — a ref owned by the component that unmounts is null exactly when 04-10 needs somewhere to put focus"
  - "The row that flipped is found BY POSITION, not by name, because a host may legitimately name two players the same thing"
  - "Task 2 shipped before Task 3 so no commit in history has a selectable `Blind` sitting over a leaking disclosure"
  - "Two `@ts-expect-error` directives added beyond the plan, closing the `mode=\"public\"` mis-mount 04-08 explicitly handed forward"

patterns-established:
  - "When a plan enables an option, the tests that asserted its refusal are retargeted to the last refused option rather than deleted, so the mechanism keeps its guard"
  - "A clear of a shared broadcast channel is scoped to the transition that owns it, never to the render"

requirements-completed: [BAN-04, BAN-05]

# Metrics
duration: ~30min
completed: 2026-08-24
---

# Phase 4 Plan 09: The Blind Locked State and the Disclosure That Cannot Leak Summary

**A host picks `Blind` for the first time in this project's history, taps `Start draft`, and the shared screen says `Ada is next` over `0 of 6 entered` and a list of names — and the room can stare at it for an hour, open every control on the chrome above it, and learn nothing.**

## Performance

- **Duration:** ~30 min
- **Tasks:** 3 of 3, each TDD (RED → GREEN), plus one hardening commit
- **Commits:** 7
- **Tests:** **1908 passing in 58 files**, up from 1865 in 56 — 43 new

## Task Commits

| Task | RED | GREEN |
|------|-----|-------|
| 1 — the locked state | `bad9e69` | `9baeda5` |
| 2 — the disclosure | `f9b1aa8` | `9e9ca2e` |
| 3 — `Blind` selectable, the arm mounted | `485b8d2` | `7637ad7` |
| Hardening — the mis-mount closed | — | `f5aa7fb` |

## What Was Built

### Task 1 — `BlindLocked`, the plainest screen in the project

`04-UI-SPEC` §4's seven rows, top to bottom, every string verbatim: the `--text-display`
headline (`{name} is next`, or `All bans are in`), the muted `{n} of {m} entered`, the
conditional discard notice, the `Players` sub-heading, `BanBoard mode="blind"`, the
accent-filled primary action, and the reveal helper that exists only at `{m} of {m}`.

**Assertion S3 is written as a sweep, and it is the load-bearing test in the file.** The
fixture is the committed roster, so the sweep runs over all 235 real species names at
`entered` of 0, 3 and 6, plus a fourth case with a discard notice on screen. A test that
checked one name would pass against a component rendering a different one.

The reveal is a host tap and never an effect (D-08). The rejected alternative — revealing
when the last submission lands — is recorded in a source comment with its reason, which is
that it would show every player's bans to the last player while they stand at the screen
alone. A test counts the calls rather than checking the outcome, because "it did not happen
yet" is the only shape that catches an effect somebody adds later.

The stylesheet declares **no motion rule at all** (S9) and takes every value from
`tokens.css`. The prohibition is written in the file's own header, worded so it describes
the ban rather than restating it — a comment quoting a forbidden pattern makes the
mechanical check report its own documentation, which is the defect 04-05 already hit twice.

### Task 2 — the disclosure that never contains an unrevealed ban

`bannedNames` is now `bannedEntries(entries, selectPublicBanIds(state))`. One line at the
source, no branch on `banMode` anywhere, and `TopBar` gains no logic — only a doc block
recording that what it is handed is *what the room may see right now*, decided by the
selector, and that its `<details>` is one click from readable by everyone present.

`tests/ui/top-bar-bans.test.tsx` covers all four rows of Amendment 1's table against the
real `App`, **asserted on content**:

| Row | Assertion |
|-----|-----------|
| `hostBanlist` | `Bans (2)` → `Mon 0`, `Mon 1` — unchanged from before this phase |
| `snake` | `Bans (3)` → the host ban plus both placements, public the instant they land |
| `blind`, before the reveal | `Bans (1)` → the host ban ONLY, with `mon-5` and `mon-6` sitting in a submission in the log and absent from the list |
| `blind`, after the reveal | `Bans (4)` — **not five.** Two submissions name `mon-6`; a collision is one banned species |

The snake row was a live defect before this change, not only a blind one: snake bans are
public the instant they land (BAN-03) and the top bar was showing the host's banlist alone
for the whole stage.

### Task 3 — `Blind` becomes selectable, and the stage renders its locked arm

`BAN_MODE_OPTIONS`' `blind` member is now `{ value: 'blind', label: 'Blind' }`. That is the
one-line move 04-05 deferred and the whole of D-12's promised payoff.

The `'blindLocked'` arm maps the fold into `BlindLocked`'s props and owns no rule: rows are
`state.order` crossed with `selectSubmittedPlayerIds`, and `nextPlayerName` is read off
**those rows** rather than off the submissions, so "who is next" and "which row says
`Not yet`" are the same list and cannot disagree.

Three things were **verified by reading rather than changed**, exactly as the plan required,
because each was written to serve this moment and re-implementing any of them would create a
second authority:

- `handleStart` already routes `blind` through `createBanStage` — `hasPlayerBans` is
  `banMode !== 'hostBanlist'`, so no branch was added. Asserted by a new end-to-end case.
- 04-05's three-way shell branch already gives blind the `.app-shell` leg — it reads
  `banMode === 'snake'`, so blind falls to `app-shell` with no edit. Asserted with the
  mirror of the snake case 04-05 left pointing at this plan.
- 04-06's Amendment 2 rule already keeps the pane preference untouched — the blind path
  mounts no `SplitPanes`, so `storedPane` is never read and `onPaneChange` is never called.
  Asserted by writing a preference to storage, mounting and unmounting the stage, and
  comparing the raw string byte for byte.

`'blindEntry'` stays `return null` with 04-10 named. No placeholder entry surface was
invented: D-18's guarantee is that no half-private state exists, and a stub entry surface
would create exactly the state a leak bug lives in.

### Hardening — the `mode="public"` mis-mount, closed rather than reported

04-08's summary handed this forward explicitly: its union protects the blind *arm*, but does
not stop a caller mounting the public arm during the blind stage. **It is now closed at the
caller.** `BlindLockedProps` has no field that could carry a species or sprite metadata, so
the public arm cannot be fed from inside the component that owns the blind screen, and the
screen above it has nowhere to pass one either.

Two `@ts-expect-error` directives in `blind-locked.test.tsx` pin it — one smuggling a species
id onto a progress row, one supplying `spriteMeta`. `tsc --noEmit` reports no unused
directive, which is the proof both are suppressing a real error today; widening the props
turns each into an unused-directive error and fails the build on the file that explains why.
`vitest` cannot see either, and that is the point.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 2's blind rows could not render a `TopBar` until Task 3 landed**

- **Found during:** Task 2
- **Issue:** Amendment 1's rows 3 and 4 both need a rendered `TopBar` at `blind`. Before
  Task 3, `selectBanStageState` answers `'blindLocked'` and that arm returned `null`, so the
  screen rendered nothing at all — no chrome, no disclosure, nothing to assert against.
  Row 4 was reachable (a revealed blind tournament with a pool routes to the draft screen),
  row 3 was not.
- **Fix:** Task 2 shipped rows 1, 2 and 4 plus the two shipped behaviours; row 3's three
  cases landed with Task 3 in the same file. **Deliberately not solved by reordering the
  tasks**, because Task 3 first would have put a commit in history where `Blind` is
  selectable and the disclosure still leaks — a window with no upside.
- **Files modified:** `tests/ui/top-bar-bans.test.tsx`
- **Commits:** `f9b1aa8`, `485b8d2`

**2. [Rule 3 - Blocking] `tests/ui/ban-mode.test.tsx` asserted `blind` was refused**

- **Found during:** Task 3
- **Issue:** 04-05 narrowed that file's refusal case from "blind and snake" to "blind alone",
  naming this plan as the one that empties it. Enabling `blind` is this plan's point, so
  three cases and the file's doc block were false the moment the option changed.
- **Fix:** The refusal cases became `refuses none of them, now that all three stages are
  built` and `names each mode as itself`, both looping over every member so re-disabling any
  of them fails here. The doc block records that the file's rule is now the mirror image of
  the one it was written for, and that the suffix mechanism is **not** dead — `Re-ban` still
  carries it one control down.
- **Files modified:** `tests/ui/ban-mode.test.tsx`
- **Commit:** `7637ad7`

**3. [Rule 1 - Bug] A shipped test's subject disappeared, and deleting it would have dropped a real guard**

- **Found during:** Task 3
- **Issue:** `leaves the selection alone when a refused option is clicked` clicked the
  disabled `blind` label and asserted the selection did not move. With no refused ban mode
  left, the case passed vacuously — the click now genuinely selects `blind`.
- **Fix:** Retargeted to `Re-ban` in the duplicate-policy control, which is the last refused
  option on the screen, reached through `blind` (the only mode where that control is live).
  The rule it guards is unchanged and is exactly why a disabled member is safe to ship: a
  click on one must leave the selection where it was rather than merely LOOK greyed while
  writing a policy nothing implements into a saved tournament. `config-bans.test.tsx` keeps
  the attributes and the label; this keeps what a click does.
- **Files modified:** `tests/ui/ban-mode.test.tsx`
- **Commit:** `7637ad7`

**4. [Rule 3 - Blocking] `grep -c "flatMap" src/app.tsx` failed on my own comment**

- **Found during:** Task 2 verification
- **Issue:** The acceptance criterion requires 0. My new doc block named
  `revealed.flatMap(...).length` while explaining why it is wrong, which is the third time
  in this phase a comment restating a forbidden pattern has tripped its own gate (04-05
  deviation 4).
- **Fix:** Reworded to describe the mistake — "flattening the revealed submissions and taking
  the length" — with a sentence saying the expression is deliberately not written out,
  because a comment quoting a forbidden pattern is the first copy of it free to drift.
- **Files modified:** `src/app.tsx`
- **Commit:** `9e9ca2e`

**5. [Rule 2 - Missing critical functionality] `BanStageScreenProps` had no way to report the reveal**

- **Found during:** Task 3
- **Issue:** The plan instructs the `'blindLocked'` arm to "wire `onReveal` to dispatch
  `bans/revealed`". No component may reach `dispatch` (CLAUDE.md §Architecture — one write
  path), and the screen had no prop for it.
- **Fix:** `onReveal: () => void` on `BanStageScreenProps`, and `handleRevealBans` in
  `app.tsx` assembling `{ playerId, monIds }[]` from `state.banSubmissions` **in starting
  order** and dispatching `bansRevealed`. The payload is materialised rather than derived
  (D-13, ARCHITECTURE Pattern 5). It carries no payload from the screen at all, which is what
  keeps the screen from becoming a second opinion about what was revealed. `getState()`
  rather than the render's `state`, because the document at the moment of the tap is the one
  being revealed.
- **Files modified:** `src/ui/screens/BanStageScreen.tsx`, `src/app.tsx`, and both existing
  snake harnesses in `tests/ui/ban-stage.test.tsx`
- **Commit:** `7637ad7`

**6. [Rule 2 - Missing critical functionality] The plan's `<interfaces>` block left `primaryActionRef` unowned**

- **Found during:** Task 3
- **Issue:** `BlindLockedProps` declares it as required and says 04-10 wires it, but nothing
  in this plan created one, and 04-10 needs a target that survives the entry surface
  unmounting.
- **Fix:** `BanStageScreen` owns it via `useRef`, declared before the branches. A ref owned by
  the component that unmounts is null exactly when focus needs somewhere to go. `useRef` is
  outside the file's `useMemo|.filter(|.reduce(` prohibition, which was verified.
- **Files modified:** `src/ui/screens/BanStageScreen.tsx`
- **Commit:** `7637ad7`

**7. [Rule 2 - Missing critical functionality] Two doc blocks would have been stale on commit**

- **Found during:** Task 3
- **Issue:** `BAN_MODE_OPTIONS`' block explained why `blind` was disabled, and
  `DUPLICATE_POLICY_OPTIONS`' block matched its capital `N` against "the shipped form at
  `BAN_MODE_OPTIONS` above" — a reference that ceased to exist in the same edit. CLAUDE.md
  requires a superseded contract comment be corrected in the change that breaks it.
- **Fix:** Both rewritten. The `disabled`-plus-`aria-disabled` reasoning and the deliberate
  contrast with `FeasibilityBar`'s focusable `Start draft` were **moved** to
  `DUPLICATE_POLICY_OPTIONS` rather than deleted, because that is where the last refused
  option lives now.
- **Files modified:** `src/ui/screens/ConfigScreen.tsx`
- **Commit:** `7637ad7`

**8. [Beyond plan] The `mode="public"` mis-mount closed at the caller**

- **Found during:** post-Task-3 review against the executor brief
- **Issue:** 04-08's summary states its union does not stop a caller mounting the public arm
  during blind. Mounting the blind arm avoids it; it does not make it unrepresentable.
- **Fix:** Two `@ts-expect-error` directives asserting `BlindLockedProps` rejects a species id
  on a row and rejects `spriteMeta`. Both are confirmed live by `tsc` reporting no unused
  directive.
- **Files modified:** `tests/ui/blind-locked.test.tsx`
- **Commit:** `f5aa7fb`

---

**Total deviations:** 8 — 1 × Rule 1, 4 × Rule 2, 2 × Rule 3, 1 beyond plan.
**Impact on plan:** No scope creep and no architectural change. Deviations 5 and 6 are holes
the plan's own `<interfaces>` block implies but does not close; deviation 3 is the one that
would otherwise have shipped a test passing for the wrong reason.

## Issues Encountered

**The stale worktree base fired again — seven for seven.** `git merge-base` reported
`93f20ad`, a **Phase 3** commit, against the required base `3b753a9`. The startup assertion
caught it before a line was written and `git reset --hard` corrected it; the follow-up check
(`src/ui/components/BanBoard.tsx` present) confirmed wave 6's work was on disk before any
code was written. No work was lost and nothing was rebuilt.

**`canApply`'s `wrongBanCount` refused the first fixture submissions.** A blind submission
must be exactly `bansPerPlayer` ids long, so seeding one id against `bansPerPlayer: 2` was
silently refused and three cases failed on a screen that was correct. The fixture became
`submitEveryAllotment`, which seals a distinct disjoint pair per player — disjoint because a
collision is 04-11's subject, not this plan's.

## Verification Notes

All four `npm run verify` gates pass, run against the main checkout's binaries with this
worktree as cwd:

- `check:pure` — 0 violations in 18 files under `src/core`
- `check:nohtml` — 0 violations in 70 files under `src`
- `vitest run` — **58 files, 1908 tests, all passing**
- `tsc --noEmit` clean; `vite build` clean; `build-sw-manifest` — 322 URLs precached
- `git diff --stat package.json` — empty. This plan installs nothing.
- `git diff --diff-filter=D` across the whole plan — **no file deleted**

Every acceptance grep returns its required value:

| Check | Required | Actual |
|-------|----------|--------|
| `mode="blind"` in `BlindLocked.tsx` | ≥ 1 | 1 |
| `font-size\|font-weight\|#hex\|Npx` in `BlindLocked.css` | 0 | 0 |
| `transition\|animation\|@keyframes` in `BlindLocked.css` | 0 | 0 |
| `var(--text-display)` in `BlindLocked.css` | ≥ 1 | 1 |
| `announce('')` in `BlindLocked.tsx` | ≥ 1 | 1 |
| `monId\|entry.name\|RosterEntry` in `BlindLocked.tsx` | 0 | 0 |
| `selectPublicBanIds` in `app.tsx` | ≥ 1 | 3 |
| `bannedEntries` in `app.tsx` | ≥ 1 | 3 |
| `banMode ===\|banMode !==` in `TopBar.tsx` | 0 | 0 |
| `flatMap` in `app.tsx` | 0 | 0 |
| `Bans ({bannedNames.length})` in `TopBar.tsx` | 1 | 1 |
| `config.bans` in `TopBar.tsx` | 0 | 0 |
| `Blind — Not yet available` in `ConfigScreen.tsx` | 0 | 0 |
| `Snake — Not yet available` in `ConfigScreen.tsx` | 0 | 0 |
| `Re-ban — Not yet available` in `ConfigScreen.tsx` | 1 | 1 |
| `Not yet available` anywhere in `ConfigScreen.tsx` | exactly 1 line | 1 line (`:354`) |
| `BlindLocked` in `BanStageScreen.tsx` | ≥ 1 | 3 |

### One criterion reads differently than it was written

`grep -c "return null" src/ui/screens/BanStageScreen.tsx` is specified as **2** — one per
remaining stub arm. It returns **3**, and it returned 3 at the plan's base commit as well.
The file has never carried one `return null` per arm: 04-05 wrote a **single trailing
`return null`** whose comment names `'blindEntry'`, `'reveal'` and `'notRunning'` together,
and the other two hits are unrelated guards — the snake `turn === null` branch (04-05) and
`bannedIn`'s unresolvable-id lookup (04-08). The criterion's stated intent holds exactly:
`'blindEntry'` and `'reveal'` still render nothing and the comment above the trailing
`return null` still names 04-10 and 04-11 as their owners. Nothing was changed to satisfy the
number, because doing so would have meant splitting one honest branch into three.

## Known Stubs

- **`onEnter` is a no-op.** 04-10 owns the transition into the entry surface and the shield.
  The button is present and named (`Enter {playerName}'s bans`) because it is the locked
  state's primary action and the screen would be incomplete without it, but pressing it does
  nothing today. This is deliberate and its reason is in the source: a **visibly** unfinished
  button is safe, where a half-built entry surface is invisibly unsafe (D-18).
- **`discardedPlayerName` is always `null` from the screen.** The notice, its copy and its
  conditional rendering are built and tested; 04-10 supplies the three paths that raise it.
- **`'blindEntry'` and `'reveal'` still render `null`,** with 04-10 and 04-11 named in the
  comment that has always covered them.

None of these prevents this plan's goal: a host reaches a blind ban stage that shows progress
and nothing else, and the reveal works from a real tap.

## Threat Flags

None. No network endpoint, auth path, file-access pattern or trust-boundary schema change was
added. Every threat in the register is mitigated as specified:

| Threat | Mitigation, as shipped |
|--------|------------------------|
| T-04-39 | S3 as a sweep at 0, 3 and 6 over all 235 committed names, plus the same sweep at the screen level with real submissions in the log; the component's scope contains no species type |
| T-04-40 | S4 on **content** across all four Amendment 1 rows, with a submitted species named and required absent |
| T-04-41 | `announce('')` on entry to the locked state, and no permitted string names a species — asserted by sweeping the spoken text against the roster |
| T-04-42 | No effect reveals anything; the call count is asserted at zero on render and one after a tap |
| T-04-43 | `'blindEntry'` remains `null`; no placeholder entry surface exists |
| T-04-44 | `TopBar` has no `banMode` branch and `app.tsx` has none either — both greps return 0 |
| T-04-45 | Accepted; `check:nohtml` clean, no new markup path |
| T-04-SC | Accepted; `package.json` untouched |

## Notes for 04-10 and 04-11

**The lock announcement fires on a prop increase, not on mount.** `BlindLocked` announces
`{playerName}'s bans are locked in. …` when `entered` rises **while it stays mounted**, and
announces nothing on a fresh mount beyond `announce('')`. That is what keeps a page resume
silent about three submissions that did not just happen. **If 04-10 swaps `BlindLocked` out
for a full-screen entry surface and back**, the lock lands across a remount and the sentence
will not fire — the screen will be correct and silent. Either keep `BlindLocked` mounted
beneath the shield, or have the screen hand the just-locked player down; do not make the
component announce on mount, because that is the change that makes a resume lie.

**`announce('')` is mount-scoped on purpose.** Do not move it into the render path or a
dependency-free effect: an undo lowers `entered` while this screen is up, and `store.ts`'s
`{playerName}'s bans were removed.` is the only sentence telling the room what happened. A
test pins exactly that.

**`primaryActionRef` already resolves to the button's DOM node** and is owned by
`BanStageScreen`, so it survives the entry surface unmounting. Focus handoff is a
`useLayoutEffect` away.

**The discard notice is built, tested and wired to `null`.** Pass a name and it renders, in
full, with no further work — and it names no species, so it is safe in the locked state by
construction.

**04-11 inherits `handleRevealBans` complete.** It materialises `{ playerId, monIds }[]` in
starting order from `state.banSubmissions` and dispatches `bansRevealed`. `canApply` refuses
it until every player in `state.order` has submitted, so the reveal button at `{m} of {m}` is
the only path that can succeed.

## Self-Check

Created files present on disk: `src/ui/components/BlindLocked.tsx`,
`src/ui/components/BlindLocked.css`, `tests/ui/blind-locked.test.tsx`,
`tests/ui/top-bar-bans.test.tsx`.

All seven commits reachable from `HEAD`: `bad9e69`, `9baeda5`, `f9b1aa8`, `9e9ca2e`,
`485b8d2`, `7637ad7`, `f5aa7fb`.

---
*Phase: 04-blind-and-snake-bans*
*Completed: 2026-08-24*
