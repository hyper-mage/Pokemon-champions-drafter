---
phase: 05-full-tournament-brackets-standings-archive
plan: 11
subsystem: ui
tags: [preact, signals, standings, tiebreak, seeding, bracket-cut, aria-disabled, focus-management]

# Dependency graph
requires:
  - phase: 05-03
    provides: selectStandings, StandingsRow.decidedBy, selectSeeding, the shared-position ruling for an unresolved block
  - phase: 05-06
    provides: byeCountForCut, selectCutSplitsTiedBlock, and the ruling that the cut's second inert reason is copy planning supplies
  - phase: 05-08
    provides: tiebreakOrdered and cutTaken action creators, and canApply's cutSplitsTiedBlock / cutSizeOutOfRange backstops
  - phase: 05-10
    provides: TournamentScreen's stage shell, ResultsGrid, metricLabel, and the locked-tournament inert treatment
provides:
  - StandingsTable — position, player, record, metric and tiebreak-note columns with the two depth captions
  - TiebreakOrderer — up/down reorder over the unresolved block, reported as one tiebreakOrdered action naming its players
  - CutControl — bounded size field, live bye preview, and two distinct inert reasons in the reducer's own precedence
  - BRACKET_HEADING_ID — the focus-target seam 05-13's bracket heading must carry
affects: [05-13, 05-14, 05-15]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A screen may call dispatch directly when nothing needs to escape the read-only inert gate; components still report intents only"
    - "A cross-plan focus target is a shared exported id constant, on TeamStrip's boardCellId precedent"
    - "A reorder list keys rows by SLOT so button DOM nodes survive a move and the ref-map focus handoff resolves"

key-files:
  created:
    - src/ui/components/StandingsTable.tsx
    - src/ui/components/StandingsTable.css
    - src/ui/components/TiebreakOrderer.tsx
    - src/ui/components/TiebreakOrderer.css
    - src/ui/components/CutControl.tsx
    - src/ui/components/CutControl.css
    - tests/ui/standings-table.test.tsx
    - tests/ui/tiebreak-orderer.test.tsx
    - tests/ui/cut-control.test.tsx
  modified:
    - src/ui/screens/TournamentScreen.tsx

key-decisions:
  - "The two new write paths are wired in TournamentScreen via dispatch rather than threaded through app.tsx, because app.tsx belongs to concurrent plan 05-12 and, unlike the record dialog, neither control needs to escape the read-only inert gate"
  - "TiebreakOrderer resolves the highest-placed unresolved block and re-renders for the next, keeping one accent action per screen state"
  - "The reorder rows are keyed by slot, not by player, so the ref map the focus handoff aims at cannot go stale"
  - "The move buttons' accessible names are the contract's exactly, with no invented reason appended to the inert ends — the ordered list already states first and last"
  - "A cut size the host has not chosen yet leaves the button inert with NO sentence; the two ruled reasons are about the tournament, not about a half-typed field"
  - "Non-integer cut sizes are refused, because slice would truncate 4.5 into a cut of four while the preview said Top 4.5 advance"
  - "BRACKET_HEADING_ID is exported from CutControl and the handoff lives in TournamentScreen, because CutControl unmounts on its own success"

patterns-established:
  - "Contract sentence split: when a plural helper is needed but a gate greps the tail, the tail becomes a single constant and only the lead branches (ResultsGrid precedent)"
  - "A doc block does not quote the package names its acceptance gate searches for (FeasibilityBar's rule, applied to a rejection rather than an attribute)"
  - "An inert control's reason region is rendered only when there is a reason, so aria-describedby can never dangle"

requirements-completed: [TOUR-08, TOUR-09]

# Metrics
duration: ~25min (tasks 2-3 only; task 1 was executed by a prior, quota-killed agent)
completed: 2026-09-01
---

# Phase 5 Plan 11: The Standings, the Override and the Cut Summary

**The round robin now produces a table that names the link deciding each row, an up/down override that records the host's order as an act with its players' names on it, and a top-N cut that previews its own byes and refuses — with two different sentences — both an unfinished round robin and one that would seed an arbitrary player into the bracket.**

## Performance

- **Duration:** ~25 min for tasks 2 and 3 (task 1 predates this agent)
- **Completed:** 2026-09-01T03:00Z
- **Tasks:** 3 of 3 (task 1 inherited complete, tasks 2 and 3 executed here)
- **Files modified:** 10 distinct across the plan

## Accomplishments

- **Task 2 — the override.** `TiebreakOrderer` renders only the block `selectStandings` left
  `decidedBy: 'tied'`, with `SchedulePreview`'s reorder reused down to the focus rule: a ref map,
  a pending-focus handoff in a layout effect, and focus that follows the moved **player** so a
  second press does not reverse the first. The working order is component state until
  `Confirm this order` reports it, and it resets by set equality **during render**, so a
  correction that changes who is tied can never be confirmed over a block that no longer exists.
- **Task 3 — the cut.** `CutControl` composes `NumericField` bounded 2 through the player count,
  previews `byeCountForCut`'s answer live as the host types, and gates the action on the same
  three questions `reduce.ts` asks in the same order — completeness, then size, then the tie
  split. The tie-split sentence is Pitfall 4's, supplied under 05-06's ruling and marked in the
  doc block as absent from `05-UI-SPEC` so a future reader does not conclude it was casual.
- **The focus seam to 05-13.** `BRACKET_HEADING_ID` is exported from `CutControl` and the handoff
  itself lives in `TournamentScreen`, because `CutControl` unmounts the moment the stage flips and
  an effect scheduled by a component being removed does not run.

## Task Commits

1. **Task 1: The standings table, and the caption that admits tier 2 has one link fewer** —
   `a34fcfa` (feat). Executed by the prior agent before it was killed by a provider quota limit;
   already merged into this agent's dispatch base `5d4a883`. **Not redone.**
2. **Task 2: The host orders the players the tool refused to separate** — `8cd8d18` (feat)
3. **Task 3: The cut, and the two reasons it can refuse** — `0afdf08` (feat)

## Files Created/Modified

- `src/ui/components/StandingsTable.tsx` / `.css` — task 1; the five columns, the two depth
  captions and the note table, with the metric column **absent** rather than greyed at tier 2
- `src/ui/components/TiebreakOrderer.tsx` / `.css` — the up/down reorder over the unresolved block
- `src/ui/components/CutControl.tsx` / `.css` — the bounded size field, the bye preview, both
  inert reasons, and the exported `BRACKET_HEADING_ID` and `CUT_REASON_ID` constants
- `src/ui/screens/TournamentScreen.tsx` — mounts all three below the results grid in the
  `'roundRobin'` branch, dispatches the two intents, and owns the post-cut focus handoff
- `tests/ui/standings-table.test.tsx` (task 1, 13 cases), `tests/ui/tiebreak-orderer.test.tsx`
  (17 cases), `tests/ui/cut-control.test.tsx` (19 cases)

## Decisions Made

See `key-decisions` in the frontmatter. The two worth restating:

**Where the dispatch lives.** The plan's `files_modified` excludes `src/app.tsx`, which plan 05-12
owns concurrently. `onSelectMatch` goes up to `app.tsx` for one stated structural reason only —
`inert` applies to a whole subtree, so the record dialog must be a **sibling** of the read-only
gate. Nothing about the override or the cut needs to escape that gate; both should be unreachable
in a read-only tab, which is what rendering them inside it achieves. So `TournamentScreen` turns
the two reported intents into actions itself, on `ConfigScreen`'s precedent for a screen calling
into `src/store.ts`. `dispatch` remains the single write path and neither component dispatches.

**Why an unchosen cut size gets no sentence.** The two ruled reasons are both about the
*tournament* — it is unfinished, or it is unsettled. An empty or out-of-range field is the host
mid-decision, and an inactive primary beside a field they have not filled in is the ordinary shape
of a form rather than a refusal that owes an explanation. The bounds are published where they
belong, as the field's own `min`/`max`. Inventing a third sentence would be exactly what
`StandingsTable`'s doc block refuses for the missing sixth note.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The two write paths wired in `TournamentScreen`, not `app.tsx`**
- **Found during:** Task 2
- **Issue:** Both new controls must dispatch, but the plan's `files_modified` excludes
  `src/app.tsx`, which concurrent plan 05-12 owns. Adding required props to
  `TournamentScreenProps` would also have broken `app.tsx` and `tests/ui/tournament-screen.test.tsx`
  at the type level.
- **Fix:** `TiebreakOrderer` and `CutControl` take intent callbacks and own no dispatch;
  `TournamentScreen` imports `dispatch` and the two action creators. The reasoning is written into
  `TournamentScreen`'s doc block so the asymmetry with `onSelectMatch` reads as deliberate.
- **Files modified:** `src/ui/screens/TournamentScreen.tsx`
- **Verification:** `npm run verify` (2546 tests); `app.tsx` untouched, `git status` clean
- **Committed in:** `8cd8d18`, extended in `0afdf08`

**2. [Rule 2 - Missing Critical] Non-integer cut sizes refused**
- **Found during:** Task 3
- **Issue:** `parseNumericField` deliberately returns `4.5` as itself. `reduce.ts` only checks
  `seeds.length`, which is always an integer, so nothing downstream would have caught it —
  `selectSeeding(state).slice(0, 4.5)` truncates to a cut of four while the preview line read
  `Top 4.5 advance. No byes at 4.5.`
- **Fix:** `Number.isInteger` added to both the gate and the preview predicate.
- **Files modified:** `src/ui/components/CutControl.tsx`
- **Verification:** test `shows no preview for a size that is not a cut` asserts `4.5` previews nothing
- **Committed in:** `0afdf08`

**3. [Rule 2 - Missing Critical] A third inert state with no ruled copy**
- **Found during:** Task 3
- **Issue:** `<behavior>` names two inert conditions and says the button sheds `aria-disabled`
  "once neither condition holds" — which, taken literally, would leave `Take the cut` **live** on
  an empty field, dispatching `cutTaken([])` for `canApply` to reject. A live button that does
  nothing is worse than an inert one.
- **Fix:** A third gate arm, ordered exactly as `reduce.ts:1258-1266` orders its rejections
  (`roundRobinNotComplete` → `cutSizeOutOfRange` → `cutSplitsTiedBlock`), carrying `reason: null`
  as an explicit union member so "inert for no stated reason" has to be written down to happen.
  No sentence invented — see Decisions.
- **Files modified:** `src/ui/components/CutControl.tsx`
- **Verification:** tests `reports nothing when the size has not been chosen` and
  `never takes the native disabled attribute`
- **Committed in:** `0afdf08`

### Acceptance-criteria wording corrections

Four criteria could not be satisfied as literally written. Each was met in substance and the
divergence is recorded here rather than silently absorbed.

| Criterion | What happened |
|---|---|
| `grep -c "disabled=" TiebreakOrderer.tsx` returns 0 | Unsatisfiable alongside the mandated `aria-disabled=`, which contains the substring. Verified instead with `grep -cE '(^\|[^-])disabled='` → **0**. The shipped `SchedulePreview.tsx` fails the literal form too. |
| `grep -cE "dnd\|draggable\|dragstart"` returns 0 | Initially **1**, from doc-block prose naming the two rejected packages. Reworded to cite `CLAUDE.md` without quoting the names — `FeasibilityBar`'s stated rule that a doc block must not quote what its gate searches for. Now **0**, and the rejection survives. |
| `grep -c "Record them all before you cut."` returns 1 | The contract sentence needs a singular branch (`1 match is still to play.`), and two full sentences would return 2. The tail is a single module constant and only the lead branches — `ResultsGrid`'s existing split, in the same direction. |
| `grep -rn "decidedBy ===" src/ui/` matches only `StandingsTable.tsx` | Actually **zero** matches in `StandingsTable.tsx` (it uses an exhaustive `switch`, which is stronger) and **two** in `TiebreakOrderer.tsx`, for the render condition §7 mandates. The intent holds: the chain is computed once in `selectStandings` and both components only read its verdict. |

### Other

- `src/ui/screens/TournamentScreen.css` is listed in `files_modified` but was **not** modified. The
  stage block's own `--space-4` gap already spaces the three added blocks, and §Spacing Scale puts
  that rhythm in the shell rather than in a margin any component declares.

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 missing-critical) plus 4 acceptance-criteria
wording corrections and 1 unmodified listed file.
**Impact on plan:** No scope creep. Nothing was added beyond the plan's own surfaces, no runtime
dependency was touched, and `src/core/`, `src/adapters/` and `package.json` are byte-identical to
the dispatch base.

## Issues Encountered

**The worktree arrived on a Phase 3 base — the tenth-plus occurrence.** `BASE_ON_ARRIVAL` was
`93f20ad` (`docs(03): create phase plan`), roughly two phases stale. `git merge-base HEAD
5d4a883` returned HEAD itself, confirming HEAD was an *ancestor* of the dispatch base rather than
a divergence. `git reset --hard 5d4a883` corrected it, and all four content greps then passed —
including the three that prove task 1's merged work was present. **Had the SHA assertion been
skipped, task 1 would have been silently rebuilt.**

**The focus target does not exist yet, and that is wave ordering rather than a stub.** §Interaction
requires focus to move to the bracket's `<h2 tabindex="-1">` after the cut. 05-13 mounts that
heading (its plan, line 308: "expose it as the focus target 05-11's cut control moves focus to").
The handoff here is complete and tested against the shared constant; until 05-13 lands,
`getElementById` returns `null` and focus stays where the click left it rather than dropping to
`<body>`. That degradation is deliberate and is written into `TournamentScreen`'s doc block.

## Known Stubs

None in this plan's code. One cross-plan seam, listed above and closed by 05-13:
`BRACKET_HEADING_ID` (`'tournament-bracket-heading'`) must be the `id` of the bracket region's
`<h2 tabindex="-1">`. It is imported, not re-typed, so a drift is a compile error rather than a
silent focus loss.

## Threat Flags

None. No new network endpoint, auth path, file access pattern or schema change. `package.json` is
untouched (T-05-SC: this plan installs nothing), and every player name renders as a Preact text
child or as an `aria-label` string rather than as markup (T-05-62), with `check:nohtml` reporting
0 violations across 84 files.

## Verification

- `npm run verify` exits 0 — `check:pure` 0 violations in 20 core files, `check:nohtml` 0 in 84,
  **2546 tests passing in 75 files**, `typecheck` clean, `vite build` + SW manifest (322 URLs).
- `git diff --stat 5d4a883 HEAD -- package.json src/core/ src/adapters/` is **empty**.
- Task 2's gate: `npx vitest run tests/ui/tiebreak-orderer.test.tsx tests/ui/schedule-reorder.test.tsx` — 38 passed.
- Task 3's gate: `npx vitest run tests/ui/cut-control.test.tsx tests/ui/standings-table.test.tsx tests/ui/tournament-screen.test.tsx` — passed.
- No `node_modules` symlink or junction was created; `npx vitest` resolved through the main
  checkout's ancestor `node_modules` unaided, as four prior executors found.

## Next Phase Readiness

- **05-13 (bracket, reopen)** — must put `id={BRACKET_HEADING_ID}` and `tabindex="-1"` on the
  bracket region's `<h2>`, importing the constant from `src/ui/components/CutControl.tsx`. That is
  the only coupling this plan creates.
- **05-14 (recap)** — §Copywriting → Recap's `The host ordered {playerNames} by hand.` reads the
  `tournament/tiebreakOrdered` actions this plan now produces. `StandingsTable` deliberately
  renders **no** note for `decidedBy: 'hostOrder'`, leaving the recap the one place the act is
  narrated.
- **Open copy gap for the phase verifier:** a host who types a cut size outside `2…{playerCount}`
  gets an inert button with no sentence. The refusal is carried by the field's own `min`/`max` and
  by `cutSizeOutOfRange` as backstop. No copy exists for it in `05-UI-SPEC` §8 and none was
  invented; if the contract should cover it, that is an amendment rather than a code change.

## Self-Check: PASSED

All 10 files claimed above exist on disk. All three task commits resolve in `git log`
(`a34fcfa`, `8cd8d18`, `0afdf08`). `npm run verify` exits 0.

---
*Phase: 05-full-tournament-brackets-standings-archive*
*Completed: 2026-09-01*
