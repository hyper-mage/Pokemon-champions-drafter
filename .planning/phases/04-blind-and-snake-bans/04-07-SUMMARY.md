---
phase: 04-blind-and-snake-bans
plan: 07
subsystem: core+ui
tags: [undo, exhaustive-switch, live-region, confirm-copy, secrecy, typescript-never]

# Dependency graph
requires:
  - phase: 04-blind-and-snake-bans
    provides: "04-03's three ban action types and their guards"
  - phase: 04-blind-and-snake-bans
    provides: "04-05's `BanStageScreen` and `screenForState`, the fourth-screen route"
provides:
  - "`'banPlaced' | 'banSubmission' | 'banReveal'` on `UndoRemoval['kind']`, all three on the one undo stack"
  - "`monId: null` on every ban kind — no ban undo carries a species id at all"
  - "`undoAnnouncement` as an exhaustive `switch` with a `const exhaustive: never` default, so a new undo kind without an announcement arm is a COMPILE ERROR"
  - "`ALWAYS_CONFIRM_KINDS` — `crosses: true` set explicitly for the two blind kinds rather than by a round comparison"
  - "`ABANDON_BAN_STAGE_CONFIRM`, `UNDO_BAN_SUBMISSION_CONFIRM`, `UNDO_REVEAL_CONFIRM` — 04-UI-SPEC §8 verbatim, none naming a species"
  - "`UNDO_BOUNDARY_CONFIRM` demoted from catch-all to an explicitly-guarded last arm"
affects: [04-09 blind locked, 04-10 blind entry, 04-11 reveal]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "`const exhaustive: never` — the first in `src/`; turns a new union member into a type error at the point of omission rather than at the call site"
    - "A confirm set carrying the argument for its own existence, where the set reads as an inconsistency without it"
    - "Secrecy as a structural control rather than an observed property — no fall-through means no place for a species name to reach the live region"

key-files:
  created: []
  modified:
    - src/core/undo.ts
    - src/store.ts
    - src/ui/confirm-copy.ts
    - src/app.tsx
    - tests/core/undo.test.ts
    - tests/ui/confirm-dialogs.test.tsx

decisions:
  - "`monId: null` on all three ban kinds, deliberately — that field means 'the species returning to the pool', no pool exists during the ban stage, and a banned id there is precisely how a fall-through announcement would get a name to speak"
  - "`crosses: true` forced explicitly for `'banSubmission'` and `'banReveal'`; a round comparison would silently answer `false` and skip the confirm the whole design depends on"
  - "A second abandon copy set rather than a parameterised first — `This discards 0 picks` is a plain untruth on a stage where bans are what is at stake"
  - "`playersPossessive` composes `players()` rather than restating it, so the singular/plural decision still happens in exactly one place"

metrics:
  duration: "~2h across three agent sessions (two prior agents lost to provider session limits)"
  completed: 2026-08-24
  tasks: 3
  commits: 6
---

# Phase 4 Plan 07: Ban-Stage Undo and Its Confirmations Summary

Every ban action is undoable on the one existing stack, a new undo kind without an
announcement arm no longer compiles, and the undo that removes a thing the host cannot see
now explains what it will cost them — without naming a species anywhere.

## Execution note: three agents, one plan

Tasks 1 and 2 were executed by an **earlier agent** whose commits were already merged to
`main` before this session began. This agent executed **Task 3 only** and wrote this
SUMMARY covering all three.

| Task | Commits | Agent |
| ---- | ------- | ----- |
| 1 — Three undo kinds on the one stack | `d4815f2` (RED), `3fa4f63` (GREEN) | prior agent, merged |
| 2 — The announcement that cannot speak a private ban | `56074ba` (RED), `4d84c92` (GREEN) | prior agent, merged |
| 3 — Three confirmations | `a90ba20` (RED), `b0df7cc` (GREEN) | this agent |

A third agent was terminated mid-Task-3. Its RED test was committed but deliberately **not**
merged — merging a RED test with no GREEN would have left `main`'s suite failing — and its
partial implementation was never committed. Both were rescued to scratchpad and handed to
this agent to verify, adopt, adapt or discard.

## What was built

**Task 1 — the single stack.** `UndoRemoval['kind']` gained `'banPlaced' | 'banSubmission' |
'banReveal'`, with three `undoRemoval` arms and three structural guards on the `isUndoable`
**allow-list**. Pitfall 8 was the failure mode avoided: a ban action on neither list makes
`Undo last move` step *past* it to `draft/started`, which is correctly refused — so undo
silently does nothing and the host's correction path is a dead button. `NEVER_UNDONE` is
unchanged in content.

**Task 2 — the leak, closed at compile time.** `undoAnnouncement` was a chain of `if` arms
ending in an **unguarded** `return` interpolating a species name. Anything that was not
`'card' | 'order' | 'swap' | 'pass'` landed there. It is now an exhaustive `switch` with a
`const exhaustive: never` default; the `'pick'` case is explicit rather than the
fall-through, so there is no fall-through left to land on. `resolveSpeciesName` is consulted
only in `'pick'` and `'swap'`, which the rewrite makes structural instead of merely observed.

**Task 3 — the three confirmations.** Three copy sets verbatim from 04-UI-SPEC §8:

- `ABANDON_BAN_STAGE_CONFIRM` — `danger`, safe label `Keep the bans`.
- `UNDO_BAN_SUBMISSION_CONFIRM` — `default`, every string interpolating the player name and
  none naming a species.
- `UNDO_REVEAL_CONFIRM` — `default`, honest that un-revealing cannot un-read.

In `app.tsx`, `crossing.kind` routes to the right set and abandon routes by
`screen.name === 'bans'`. `UNDO_BOUNDARY_CONFIRM` stopped being the catch-all: its three
exclusions are now written out, because its pick-specific prose ("undoes {name}'s pick from
round {r}") would be a plain untruth over a removed blind submission — on the one surface
whose entire job is telling the host what is about to change.

`'banPlaced'` needed **no new code at all**: Task 1 reports `crosses: false` for it, so a
snake ban falls through the pre-existing silent path. That was confirmed by reading and then
pinned by a test, rather than by adding a branch.

## Deviations from Plan

### `[Rule 3 — Blocking]` Stale worktree base, corrected

**Found during:** setup, before Task 3.
**Issue:** the worktree forked from `93f20ad`, a **Phase 3** commit — the exact hazard the
prompt flagged as having fired on every Phase 4 worktree so far. Tasks 1–2 and sibling 04-06
were all absent.
**Fix:** `git reset --hard 31235d9`, per the sanctioned setup step, then verified Tasks 1–2
were present by commit hash and by reading `src/core/undo.ts`.

### `[Rule 1 — Verification]` Two rescued artifacts audited before adoption

**Found during:** Task 3.
**Issue:** neither rescued artifact had ever been run. The 04-05 precedent in this phase was
a rescued RED test querying a CSS class that does not exist, which made a family of negative
assertions pass **vacuously**.
**Fix:** every selector, helper and signature was verified against the real source before
adoption — `ROSTER_NAMES` is real, module-level and non-empty (the negative assertions bite);
`role="alertdialog"` is real in `Dialog.tsx:132` (the "no dialog" assertion is not vacuous);
`banStageDoc`, `bansPlaced(playerId, monId, pass)`, `ConfirmDialog`'s seven props,
`screen.name === 'bans'` and `RoundBoundaryCrossing.kind` all check out; the cited precedent
`CLEAR_MEGA_FORME_BANLIST_CONFIRM` exists and the set numbering 11–13 follows the existing
1–10. **Both adopted unmodified.** The rescued test proved to be a clean +161-line append,
not a truncated file.

### Plan acceptance criterion factually wrong when written

**Found during:** Task 3 verification.
**Issue:** the plan asserts `grep -c "Keep the bans" src/ui/confirm-copy.ts` returns **1**. It
returns **4**.
**Assessment:** not an implementation defect. `Keep the bans` was already the `safeLabel` of
two pre-existing sets — `CLEAR_BANLIST_CONFIRM` (`:175`) and `CLEAR_MEGA_FORME_BANLIST_CONFIRM`
(`:204`) — plus one doc-comment mention (`:309`) and the new set (`:321`). The criterion's
*intent*, that the new set carries that safe label, is met. No code changed to satisfy a
miscounted grep.

## Forward dependencies (not stubs)

`UNDO_BAN_SUBMISSION_CONFIRM` and `UNDO_REVEAL_CONFIRM` are **fully wired** in `app.tsx` and
will fire the moment a `bans/submitted` or `bans/revealed` action is undoable — which Task 1
already made true. Nothing in `src/` dispatches those two actions yet: the blind entry
surface is 04-10's and the reveal is 04-11's. Verified by
`grep -rn "bansSubmitted(\|bansRevealed(" src/` returning nothing outside `core/actions.ts`.

They are therefore asserted through their composers and through a directly rendered
`ConfirmDialog`, plus the `app.tsx` routing for the kind whose screen does exist. This is a
sequencing fact, not unfinished work — the copy and the routing are complete and the arriving
screens need add nothing here.

## Verification

`npm run verify` exits 0 — `check:pure`, `check:nohtml`, **55 test files / 1843 tests all
passing**, and `build` clean (322 URLs precached).

RED was genuine and precise: before the implementation, **7 of the 8 new tests failed**. The
eighth — "undoes a snake ban with no dialog at all" — passed already, correctly, because Task
1 had landed `crosses: false` for `'banPlaced'`; it is kept as the regression guard for that.
After the implementation, 44/44 in the file.

Ownership held: the diff against base touches exactly `src/app.tsx`, `src/ui/confirm-copy.ts`
and `tests/ui/confirm-dialogs.test.tsx`. No `package.json`, no `TopBar.tsx` (the Ctrl+Z
listener stays where it is, per T-04-33), and none of sibling 04-06's files — `PoolGrid`,
`MonCard`, `TypeaheadField`, `SplitPanes`, `BanStageScreen`. No file deletions in any commit.

## Threat mitigations delivered

| Threat | Status |
| ------ | ------ |
| T-04-30 — `undoAnnouncement` fall-through | Mitigated. Exhaustive `switch` + `const exhaustive: never`; omission is now a compile error. |
| T-04-31 — ban `UndoRemoval` carrying a species id | Mitigated. `monId: null` on all three kinds, asserted directly. Defence in depth behind T-04-30. |
| T-04-32 — the confirm dialogs | Mitigated. Three sets verbatim from §8; negative assertion runs against the **whole** fixture roster, both composed and rendered. |
| T-04-33 — a hoisted Ctrl+Z listener | Mitigated. Forbidden in a comment with the reason; `TopBar.tsx` untouched this plan. |
| T-04-34 — a ban action on neither undo list | Mitigated. All three guards on the allow-list; asserted by a test that undo removes nothing when only never-undone actions remain. |
| T-04-SC — package installs | Accepted. Nothing installed; `package.json` unmodified. |

## Self-Check: PASSED

- `.planning/phases/04-blind-and-snake-bans/04-07-SUMMARY.md` — FOUND
- `src/ui/confirm-copy.ts`, `src/app.tsx`, `tests/ui/confirm-dialogs.test.tsx` — FOUND, modified
- `src/core/undo.ts`, `src/store.ts` — FOUND, carry Tasks 1–2
- Commits `3fa4f63`, `4d84c92`, `56074ba` (prior agent, on `main`) — FOUND
- Commits `a90ba20`, `b0df7cc` (this agent) — FOUND
