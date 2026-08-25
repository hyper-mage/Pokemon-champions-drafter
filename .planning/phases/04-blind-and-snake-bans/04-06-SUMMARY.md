---
phase: 04-blind-and-snake-bans
plan: 06
subsystem: ui
tags: [preact, aria-disabled, typeahead, pool-grid, accessibility, selectors]

# Dependency graph
requires:
  - phase: 04-blind-and-snake-bans
    provides: "04-04's `selectPublicBanIds` — the stage-aware answer to which bans the room may see"
  - phase: 04-blind-and-snake-bans
    provides: "04-05's `BanStageScreen`, the fourth screen and its snake arm"
provides:
  - "`PoolGrid.banInert` — one prop carrying the closed ids, a per-id reason and the rule line"
  - "`TypeaheadField.optionState` — per-option inert state with a reason, defaulted once inside the component"
  - "`MonCard.inert` — a cell that carries `aria-disabled`, renders struck through and refuses its own click"
  - "The snake pool pane wired to `selectPublicBanIds`, with both reason forms and the ban field beside the grid"
  - "Amendment 2's pane-state scoping rows, recorded on `SplitPanes` and at the blind arm"
affects: [04-08 ban board, 04-09 blind locked, 04-10 blind entry, 04-11 reveal]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "The constraint upstream of the click — an option that may not be chosen renders inert with a stated reason rather than being refused after the fact"
    - "One prop carrying every field the copy needs, so a partially-supplied caller is unrepresentable"
    - "One selector call feeding every surface that must not disagree"

key-files:
  created: []
  modified:
    - src/ui/components/PoolGrid.tsx
    - src/ui/components/PoolGrid.css
    - src/ui/components/MonCard.tsx
    - src/ui/components/MonCard.css
    - src/ui/components/TypeaheadField.tsx
    - src/ui/components/SplitPanes.tsx
    - src/ui/screens/BanStageScreen.tsx
    - src/ui/screens/BanStageScreen.css
    - tests/ui/pool-search.test.tsx
    - tests/ui/ban-stage.test.tsx

key-decisions:
  - "`aria-disabled` alone, never native `disabled`, so a closed cell stays focusable and its reason stays reachable by keyboard"
  - "The inert attribute is derived from the prop on every render and never latched, so an undo that returns a species to the pool sheds it (WR-04)"
  - "The ids come from `selectPublicBanIds` and the reasons are composed by the screen — the selector owns the rule, the screen owns the copy"
  - "Per-cell visible reasons rejected: one rule line above a 235-cell grid, with the per-cell answer in the accessible name"
  - "Results are never silently filtered — a closed species stays in the typeahead and says why"

patterns-established:
  - "Inert-with-a-reason as the phase's governing interaction: `selectCardOffer`'s doc block quoted at the wiring site"
  - "A negative requirement gets a comment at the site it applies to, because a thing a file does not do is invisible in the file"

requirements-completed: [BAN-03]

# Metrics
duration: ~24min (across two agent sessions)
completed: 2026-08-24
---

# Phase 4 Plan 06: The Snake Pool Knows What Is Already Gone Summary

**A snake player sees which Pokémon are already banned and who spent them — struck through, `aria-disabled`, with the reason in the accessible name — and the click is refused before it is made rather than after, in the grid and the ban field alike.**

## Performance

- **Duration:** ~24 min of execution across two agent sessions (Task 1 by an earlier agent, Task 2 here)
- **Started:** 2026-08-24T21:35Z (Task 1, earlier agent) / 2026-08-25T02:03Z (Task 2, this agent)
- **Completed:** 2026-08-25T02:15Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Both ban surfaces can now close an option with a stated reason. `PoolGrid` takes one
  `banInert` prop carrying the ids, a per-id reason function and the rule line; `TypeaheadField`
  takes `optionState`, defaulted to `() => null` once inside the component so `undefined` can
  never read as a reason.
- The snake pool pane is wired to `selectPublicBanIds`, called exactly once and feeding both
  surfaces, so the grid and the field cannot disagree about which species are gone.
- The two reason forms are distinguishable in full: `{name} — banned by the host` and
  `{name} — already banned by {playerName}`, which is what lets the room tell a config-time
  removal from a turn somebody spent.
- Clicking a closed cell records nothing — asserted against the log length, which is the
  assertion proving the constraint sits upstream of the click rather than in `canApply`'s
  `banAlreadyPlaced` backstop.
- A closed species stays in the typeahead results with its reason attached, because a name the
  host typed and cannot find reads as a broken search.
- Amendment 2's two pane-state rows are recorded: the snake coercion, and the blind row's
  negative requirement that the stored preference is neither read nor written.

## Task Commits

Each task was committed atomically, RED then GREEN.

1. **Task 1: An inert cell and an inert option, each with one prop carrying the whole answer**
   - `df7ed93` (test) — failing tests for an inert cell and an inert option
   - `4b78722` (feat) — close an option with a reason, on both ban surfaces
2. **Task 2: The snake pool pane knows what is already gone**
   - `f9ef4f3` (test) — failing tests for the snake pool pane's closed cells
   - `0717742` (feat) — show the snake pool what is already gone, and who spent it

**Task 1 was executed by an earlier agent**, which was terminated by a provider session limit
partway through Task 2. Its Task 1 commits were merged to `main` before this agent started and
were verified present on this worktree's base (`c34aa78`) before any work began. Task 2's RED
test and a partial, never-run implementation were rescued from that agent and handed to this
one; both were re-verified against the real code before being adopted, and neither was trusted
on sight — see Issues Encountered.

## Files Created/Modified

**Task 1 (earlier agent):**

- `src/ui/components/PoolGrid.tsx` — `BanInertState` interface and the `banInert` prop; the rule
  line above the grid; per-cell reason resolution on every render.
- `src/ui/components/PoolGrid.css` — the struck-through inert treatment, tokens only.
- `src/ui/components/MonCard.tsx` — the `inert` prop, the composed inert accessible name, the
  present-or-absent `aria-disabled` spread, and the early return that makes the attribute honest.
- `src/ui/components/MonCard.css` — `opacity` and `line-through` for the closed cell.
- `src/ui/components/TypeaheadField.tsx` — the `optionState` prop and the single `select()`
  guard both the press and the Enter key route through.
- `tests/ui/pool-search.test.tsx` — the behaviour cases plus the regression block over every
  shipped `PoolGrid` caller.

**Task 2 (this agent):**

- `src/ui/screens/BanStageScreen.tsx` — the one `selectPublicBanIds(state)` call, `reasonFor`,
  the `banInert` value, `optionState`, the shared `place` handler, the `TypeaheadField` mounted
  beside the grid, and the blind arm's negative-requirement comment.
- `src/ui/screens/BanStageScreen.css` — one rule, `.ban-stage__pool`, giving the pane's two
  children a token-scale gap. The file's own doc block previously said it contained no rule; it
  now says which one arrived and why, rather than leaving the paragraph false.
- `src/ui/components/SplitPanes.tsx` — the pane-state scoping table, including Amendment 2's two
  ban-stage rows. Documentation only; the component still holds no opinion about availability.
- `tests/ui/ban-stage.test.tsx` — the ten cases for the closed cells, the ban field and the pane
  preference.

## Decisions Made

- **The ids come from the selector; the reasons are composed by the screen.** A component that
  assembled the public banlist itself would be a second authority on what the room may see,
  free to disagree at exactly the moment secrecy matters (T-04-25). The copy, on the other hand,
  is the only thing here that needs a player's display name, and `src/core/` may not hold a
  rendered string.
- **`bannedIds` and `banInert` are both passed the same set.** They mean different things — one
  is a pressed state, one is a refusal — and they coincide at snake because every public ban is
  also already spent. `MonCard`'s prop block already records that they will not coincide on
  04-10's blind entry surface, so this is a coincidence stated rather than a shortcut taken.
- **`reasonFor` tests the host's banlist first.** A species can be both host-banned and
  player-placed only in a hand-edited document; the host's ban was in force before the stage
  opened, so it is the honest answer there.
- **A placement by a player the config does not list falls back to the raw id, not an empty
  name.** `already banned by p7` reads as "somebody who is not in this tournament", which is
  true. An empty name reads as a rendering bug and tells the room nothing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `MonCard` had no way to render a closed cell**

- **Found during:** Task 1 (earlier agent)
- **Issue:** The plan's `files_modified` named `PoolGrid.tsx` and `PoolGrid.css` but not
  `MonCard.tsx` / `MonCard.css`. `PoolGrid` does not render a cell — `MonCard` does — so
  `banInert` had nothing to hand its answer to.
- **Fix:** `MonCard` gained an `inert?: { reason: string } | null` prop, the composed inert
  accessible name, the present-or-absent `aria-disabled` spread and the early-return refusal.
- **Files modified:** `src/ui/components/MonCard.tsx`, `src/ui/components/MonCard.css`
- **Verification:** `npm run verify` green on the merged result — 1823 tests at the time.
- **Committed in:** `4b78722` (Task 1 GREEN commit)

**2. [Rule 3 - Blocking] The plan's `SplitPanes` read_first pointed at a table that does not exist**

- **Found during:** Task 2
- **Issue:** The plan directs the executor to `SplitPanes.tsx:140-175` for "the announce-vs-focus
  note and its pane-state scoping table", and to add "one coercion row" there. Lines 140-175 are
  the `SideOptions` interface, and no scoping table exists anywhere under `src/` — a grep for
  `Screen state` / `States available` returns nothing. The rows the plan wanted extended had
  never been written down.
- **Fix:** Added the scoping table to `SplitPanes.tsx`'s header doc block, covering the four
  shipped draft states plus Amendment 2's two ban-stage rows, and stated explicitly that the
  component decides none of it. Documentation only — no behaviour changed, and the component's
  standing rule that it holds no opinion about availability is restated rather than weakened.
- **Files modified:** `src/ui/components/SplitPanes.tsx`
- **Verification:** `tests/ui/draft-panes.test.tsx` and the full suite pass unchanged.
- **Committed in:** `0717742` (Task 2 GREEN commit)

**3. [Rule 3 - Blocking] `BanStageScreen.css`'s doc block asserted the file contained no rule**

- **Found during:** Task 2
- **Issue:** The pool pane now holds two children — the ban field and the grid — and
  `.pane__scroll` supplies no gap, so the input sat flush against the grid's border and read as
  part of it. Adding the rule made the stylesheet's own opening paragraph false.
- **Fix:** Added `.ban-stage__pool` (flex column, `gap: var(--space-3)`) and amended the doc
  block to say which rule arrived and why, keeping the surrounding prohibition on restating
  inherited geometry intact.
- **Files modified:** `src/ui/screens/BanStageScreen.css`
- **Verification:** `grep -cE 'font-size|#[0-9a-fA-F]{3,6}|[0-9]+px'` returns 0 — tokens only.
- **Committed in:** `0717742`

### Acceptance criterion that cannot be met as literally written

`grep -c "selectPublicBanIds" src/ui/screens/BanStageScreen.tsx` returns **3**, not the **1** the
plan asks for. `grep -c` counts matching *lines*, and three lines legitimately name the selector:
the import, the call, and a comment explaining why it is the right selector rather than
`config.bans` or `selectAllBanIds`. The criterion's *intent* — exactly one call feeding both
surfaces — is met and is checkable as `grep -c "selectPublicBanIds(state)"`, which returns **1**.
Recorded here rather than satisfied by deleting the explanatory comment, which would have been
the only way to make the literal number come out right.

---

**Total deviations:** 3 auto-fixed (1 missing critical, 2 blocking) + 1 stale acceptance criterion recorded
**Impact on plan:** No scope creep. Two of the three are documentation catching up with code the
plan itself required; the third is the cell component the plan's file list omitted.

## Issues Encountered

**Two agents were killed by provider session limits during this plan.** Task 1's agent died
partway through Task 2; a second rescue attempt was not made. The RED test and a partial patch
were carried forward on disk instead of in context.

**The rescued artefacts were verified rather than trusted, and that mattered.** An earlier
rescued test in this phase (plan 04-05) queried a CSS class that did not exist, which would have
made a family of negative assertions pass vacuously. Every selector and literal the rescued
04-06 test depends on was checked against the real code before adoption:

| Assumption | Verdict |
|---|---|
| `.pool__ban-rule` | Real — `PoolGrid.tsx:875` |
| `.typeahead__option` | Real — `TypeaheadField.tsx:308` |
| `.dialog` | Real — `Dialog.tsx:130`, `dialog dialog--${tone}` |
| `.draft-panes[data-pane]` | Real — `SplitPanes.tsx:469` |
| `champions-drafter:view` | Real — `view-prefs.ts:27` |
| `venusaur` / `rotomwash` / `garchomp` ids and type pairs | Real — checked against `public/data/roster.mb.json` |
| Each query matching exactly one entry under `toSearchKey` | Verified by running the normalizer over the snapshot |

All held. The rescued partial implementation stopped at the JSX and was adopted for its constants
and `reasonFor` logic; the wiring, the shared click handler, the CSS and the two Amendment 2 sites
are this agent's.

**One rescued assertion was strengthened rather than adopted.** The blind row's test asserted the
stored pane preference is unchanged across a mount and unmount, but its `onPaneChange` was a
no-op that never wrote to storage — so the storage assertion could not fail whatever the screen
did. It now persists exactly as `app.tsx`'s handler does, and additionally asserts the handler was
never called. A negative requirement asserted by something that cannot fail is worse than one left
unasserted, because it reads as covered.

**The worktree arrived on a stale base**, forked from `93f20ad` — a Phase 3 commit — as every
Phase 4 worktree so far has. Caught by the base assertion and corrected to `c34aa78` before any
work; Task 1's landed code was then confirmed present rather than assumed.

## Verification

- `vitest run` — **55 files, 1835 tests, all passing** (was 1823 before Task 2's ten cases).
- `check:pure` — 0 violations in 18 files under `src/core`.
- `check:nohtml` — 0 violations in 68 files under `src`.
- `tsc --noEmit` — clean.
- `vite build` — clean, 134.67 kB JS / 28.73 kB CSS.
- `build-sw-manifest` — 322 URLs precached, no warnings.
- `git diff --stat package.json` — empty. No dependency was added.
- No file was deleted by either commit.
- `src/app.tsx`, `src/core/undo.ts`, `src/store.ts` and `src/ui/confirm-copy.ts` are untouched —
  sibling plan 04-07 owns all four.

The test file is genuinely RED before the implementation and GREEN after: nine cases failed on
`f9ef4f3`'s tree and all thirty-one pass on `0717742`'s. The two pane-preference cases passed at
both points, which is correct — they guard behaviour 04-05 landed, and this plan must not break it.

## Known Stubs

None introduced by this plan.

The board pane still renders `null`. That is 04-08's `BanBoard`, which claims those files in its
own `files_modified`, and it was already documented as such by 04-05. The comment beside it has
been left in place and still names the backstop, which is now genuinely redundant for the case it
described: a click on an already-banned species is refused by the surface before `canApply` ever
sees it.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **04-08 (`BanBoard`)** can fill the board pane. The pool pane is complete and the screen's shape
  is settled; nothing in this plan touches the board slot.
- **04-10 (blind entry)** mounts both surfaces built here. `MonCard`'s prop block already records
  the case that plan has to get right: on the blind entry surface a player's own selection is
  *pressed* while another player's ban is *closed*, so `bannedIds` and `banInert` must be given
  two different sets there — not one, as they are at snake.
- **04-09 and 04-11** inherit Amendment 2's blind row. The rule is now written at both the
  `SplitPanes` table and the `BanStageScreen` arm: mount no panes, and neither read nor write the
  stored pane preference.

## Self-Check: PASSED

All ten modified files exist on disk. All five commits are reachable — `df7ed93` and `4b78722`
(Task 1, inherited from `main` via base `c34aa78`), `f9ef4f3` and `0717742` (Task 2), and
`1d36cd0` (this summary). Working tree clean, no untracked files.

---
*Phase: 04-blind-and-snake-bans*
*Completed: 2026-08-24*
