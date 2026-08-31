---
phase: 05-full-tournament-brackets-standings-archive
plan: 10
subsystem: ui
tags: [tournament, round-robin, results-grid, match-record, dialog, a11y]
requires:
  - selectTournamentStage, selectRoundRobinMatches, selectRemainingMatchCount (05-03)
  - selectVoidCascade, selectBracket, selectTournamentLocked (05-06)
  - tournament/matchRecorded, tournament/resultsVoided, MAX_MATCH_METRIC (05-08)
  - matches() plural helper (05-09)
provides:
  - a fifth Screen union member, `tournament`, entered by an explicit host act
  - TournamentScreen — the stage shell 05-11, 05-13 and 05-14 mount into
  - ResultsGrid — the round-robin crosstable, and metricLabel()
  - MatchRecordDialog — the four primary labels, the cascade sentences, the inert states
  - handleRecordMatch in app.tsx — the record-then-void dispatch pairing
affects:
  - src/app.tsx (Screen union, shell class, dialog placement, one new write path)
  - src/ui/screens/CompletedDraft.tsx (an added control, and its first stylesheet)
tech-stack:
  added: []
  patterns:
    - the grid reuses BoardGrid's cell classes rather than restating them
    - use-roving-tabindex in its 1-D mode over a triangular live set
    - aria-disabled without native disabled, absent rather than "false"
    - a modal is a sibling of the inert gate, never a child
key-files:
  created:
    - src/ui/screens/TournamentScreen.tsx
    - src/ui/screens/TournamentScreen.css
    - src/ui/screens/CompletedDraft.css
    - src/ui/components/ResultsGrid.tsx
    - src/ui/components/ResultsGrid.css
    - src/ui/components/MatchRecordDialog.tsx
    - src/ui/components/MatchRecordDialog.css
    - tests/ui/tournament-screen.test.tsx
    - tests/ui/results-grid.test.tsx
    - tests/ui/match-record.test.tsx
  modified:
    - src/app.tsx
    - src/ui/screens/CompletedDraft.tsx
    - tests/ui/completed-draft.test.tsx
decisions:
  - the crosstable stays mounted at the bracket stage, because D-11 has no other surface
  - the record dialog is a sibling of the inert gate, so a mid-entry takeover cannot trap focus
  - the void announcement is deferred one render, because two announce calls in one handler overwrite
  - an unchosen winner and an out-of-range metric are inert states, not defaults
metrics:
  duration: ~40 minutes
  completed: 2026-08-31
---

# Phase 5 Plan 10: The Round Robin On A Screen Summary

The round robin is playable: every pairing visible from the start, results recorded in any
order through one dialog that dispatches one action, and corrections whose primary button
names what they will void before it is pressed.

## What Was Built

**A fifth `Screen`, entered on purpose.** `screenForState` is unchanged and now carries a
doc block saying why the omission is deliberate: routing on the fold would move the host off
the per-player export panels the instant the last pick landed. `CompletedDraft` offers
`Go to the tournament` — gated on `selectTournamentStage(state) !== 'notRunning'`, which is
what makes a `draftOnly` night skip every bracket surface without that file knowing what
`draftOnly` is — and `TournamentScreen` offers `Back to the draft`. The screen joins the
`.draft-shell` arm of the existing four-way shell expression, inside the `inert` gate.

**The crosstable.** Upper triangle only — 28 live cells at 8 players, 10 at 5 — with the
diagonal and lower triangle `aria-hidden` and textless. An unplayed cell renders **empty** on
`BoardGrid`'s shipped dashed treatment, because D-03 makes the hole the signal. Above it,
`{k} of {n} matches still to play.` and, at tier 3 only, the metric caption. One tab stop via
`use-roving-tabindex` with the column argument omitted, since a triangular set has no fixed
stride. No accent anywhere, no next indicator, no grid roles.

**The record dialog.** Built on `Dialog`, not on `ConfirmDialog` — it has inputs. Winner
always, games at a `bo3` stage, metric at tier 3 bounded by `MAX_MATCH_METRIC` itself. The
primary button relabels live from one `selectVoidCascade` call, and that same cascade is what
the caller voids, so the label cannot understate its own cost. `app.tsx` dispatches
`matchRecorded` then `resultsVoided`, reading `causedBySeq` back off the document between the
two.

## Key Implementation Details

- **Identity.** The pairing travels with the match id from the grid to the dialog. Nothing
  parses a match id, which is the operation `selectRoundRobinMatches` refuses to perform
  because a player id may legally contain a colon.
- **`--results-col-min: 188px`** is declared in `ResultsGrid.css` beside the derivation that
  produces it, on `--board-label-w`'s "one declaration, in the file that owns the reasoning"
  precedent. It is the only raw length in the file.
- **`metricLabel()`** lives in `ResultsGrid` because the caption is the one place the unit is
  stated; the dialog imports it, so the two cannot name the metric differently.
- **The dialog is a sibling of the gate.** The three shipped dialogs sit there because
  `inert` applies to a whole subtree. For this one the case is not hypothetical: the gate can
  go up *while the dialog is open*, when another tab takes the lock mid-entry.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] The crosstable is mounted at the bracket stage too**
- **Found during:** Task 3, writing the two-dispatch test
- **Issue:** The plan says "Mount the grid in `TournamentScreen`'s `'roundRobin'` branch."
  But `selectVoidCascade` returns an empty cascade for every `rr:` id while `cut === null`,
  and `cut === null` is exactly what defines the round-robin stage. So D-11 —
  `Record and void the bracket`, this plan's must-have truth 6 and §5's fourth
  primary-button row — was unreachable from any surface the plan shipped, and the dialog's
  cascade branch was dead code.
- **Fix:** The same `ResultsGrid` renders in the `'bracket'` branch as well, with a comment
  recording that 05-13 mounts the bracket beside it rather than instead of it.
- **Files modified:** `src/ui/screens/TournamentScreen.tsx`
- **Commit:** ea31503

**2. [Rule 2 - Missing functionality] A finished tournament's cells are inert**
- **Found during:** Task 3, as a consequence of deviation 1
- **Issue:** With the grid on the bracket stage, a document imported with its final already
  recorded showed live-looking cells. `canApply` refuses those records with
  `tournamentLocked`, so the dispatch failed and nothing on screen explained why — a control
  that silently does nothing. The import path is not gated on 05-13 existing.
- **Fix:** `05-UI-SPEC` §10's two sentences — one visible above the grid, one appended to
  every cell's accessible name — plus `aria-disabled` without the native attribute and an
  early return in the click handler. `FinishedNotice` and `Reopen this tournament` remain
  05-13's; this is the inert half only.
- **Files modified:** `src/ui/components/ResultsGrid.tsx`, `src/ui/components/ResultsGrid.css`
- **Commit:** 242cf29

**3. [Rule 2 - Missing functionality] Two inert reasons the copy table does not carry**
- **Found during:** Task 3
- **Issue:** `SegmentedControl` needs a value, so a fresh match would have opened with player
  A pre-selected and `Record the result` would have recorded a winner nobody chose. Separately,
  `NumericField` states that its `min`/`max` are affordances rather than enforcement, and
  `canApply` does **not** bound the metric — only `import-guard` does, at the file boundary.
  So the build could write a document `isValidTournament` refuses to re-open, which is
  T-05-56 and Phase 3's rule.
- **Fix:** `NO_WINNER_REASON` (`Choose a winner.`) and `METRIC_RANGE_REASON`
  (`Enter a number from 0 to 18.`, interpolated from `MAX_MATCH_METRIC`), both as inert
  states in the shape §5 already uses for the identical result. Both follow the house form:
  the problem, then the next action.
- **Files modified:** `src/ui/components/MatchRecordDialog.tsx`
- **Commit:** ea31503

**4. [Rule 1 - Bug] The void announcement is deferred by one render**
- **Found during:** Task 3
- **Issue:** §Interaction asks for two announcements, record first and void after. Two
  `announce` calls in one handler write one signal twice and the room hears only the second
  — the exact failure `confirmSwap` records at `app.tsx` and routes around.
- **Fix:** The void sentence is armed on a ref and spoken by a `useEffect` with no dependency
  array that always clears its own flag, matching the two focus handoffs in the same file.
  `LiveRegion`'s own header names a two-frame write as the real fix for its byte-identical
  limit; this is that shape applied to two different sentences.
- **Files modified:** `src/app.tsx`
- **Commit:** ea31503

**5. [Rule 3 - Blocking] `CompletedDraft` had no stylesheet**
- **Found during:** Task 1
- **Issue:** `.completed-draft` was an unstyled container — correct while the screen only
  mounted components that bring their own rules. The new entry control would have rendered as
  a browser-default button, missing `--target-min` and the tokens rule.
- **Fix:** `CompletedDraft.css` with one rule, beside the component as the convention
  requires. Deliberately not accent-coloured: §Accent reserved for gives each screen one
  accent action and `CheckpointPrompt`'s `Download tournament JSON` already spends it here.
- **Files modified:** `src/ui/screens/CompletedDraft.css` (new)
- **Commit:** f1ae353

### Contract Readings Worth Recording

- **`grep -rn "selectVoidCascade" src/ui/ | wc -l` returns 2, not the 1 the plan's
  `<verification>` predicts.** The two lines are the import and its single call site; there
  is no way to have both on one line without aliasing the import, which would cost more in
  readability than the count is worth. The invariant the check exists for holds exactly:
  `grep -rln` returns **1 file**, the dialog.
- **`matches still to play` is spelled out rather than assembled around the plural helper.**
  The acceptance gate searches for the contract sentence as a contiguous run, so the sentence
  has to be one. The singular branch still goes through `matches()` from `confirm-copy.ts`.
  This is `FeasibilityBar`'s stated rule read from the other side, and the same rule is why
  three doc blocks here describe the strings and roles they forbid rather than quoting them.
- **`All 1 match are recorded.`** is reachable at two players. The verb is the copy table's
  and is left alone, on `FeasibilityBar`'s posture for `1 other problems`: the table is the
  thing to amend, and fixing it in one component would put the two out of agreement.

## Deferred

- **`tests/build/sw-manifest.test.ts` flake** — one filesystem-heavy case times out at
  vitest's 5000ms default under parallel load on Windows; it passes in ~3s run alone. Not
  caused by this plan (no build script is touched). Logged in `deferred-items.md`.
- **`FinishedNotice` and `Reopen this tournament`** remain 05-13's, per §10.

## Requirements Covered

| ID | How |
|----|-----|
| TOUR-02 | The crosstable renders every pairing from the moment the round robin starts, with the remaining count above it |
| TOUR-04 | One dialog collects winner, games and metric and reports once |
| TOUR-05 | `tournament/matchRecorded` reaches the log through `dispatch`, one action per gesture |
| TOUR-06 | A recorded result is corrected by re-recording the same match id; the fold keeps the later one |

## Threat Flags

None. Every surface added here sits behind the existing `inert` gate, no network or storage
path is touched, and the one new write path is `dispatch`.

## Verification

- `npm run verify` exits 0 — `check:pure` (0 violations), `check:nohtml` (0 violations in 81
  files), 2491 tests across 72 files, and a production build with a 322-URL precache manifest.
- `git diff --stat package.json` is empty — no dependency added.
- `git diff --stat src/core/ src/adapters/` is empty — this plan is surfaces and one route.
- Task acceptance greps all pass: `--results-col-min: 188px` ×1, `overflow-wrap: anywhere` ≥1,
  zero hex and exactly one `px` in `ResultsGrid.css`, zero grid roles, zero `color-accent`,
  zero `columns`, `matches still to play` ×1, `Record and void the bracket` ×1,
  `Keep the recorded result` ×1, `This is already the recorded result.` ×1, `MAX_MATCH_METRIC`
  ≥1 with no `max={18}`, zero `ConfirmDialog`, `causedBySeq` ≥1, zero `.focus()`, zero
  `aria-disabled="false"`.

## Self-Check: PASSED

All eleven created files exist on disk. All five commits are in the log:
`f1ae353`, `581fdac`, `ea31503`, `242cf29`, `339ac54`.
