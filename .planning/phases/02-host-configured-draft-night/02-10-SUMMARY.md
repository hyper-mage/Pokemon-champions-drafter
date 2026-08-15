---
phase: 02-host-configured-draft-night
plan: 10
subsystem: testing
tags: [uat, human-verification, accessibility, css-grid, layout]

# Dependency graph
requires:
  - phase: 02-host-configured-draft-night
    provides: "Plan 02-09's inert pool expand control and the `.pane__chrome` min-height alignment fix"
provides:
  - "Host confirmation that the inert expand control reads as unavailable-with-a-reason rather than broken"
  - "Host confirmation that the pool and board panes' content starts on the same line"
  - "Clearance to re-run 02-UAT.md tests 9 and 16"
affects: [draft-screen, split-panes, uat]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Layout and perception claims that happy-dom cannot evaluate are closed by a scoped human-verify plan, not by an assertion"

key-files:
  created:
    - .planning/phases/02-host-configured-draft-night/02-10-SUMMARY.md
  modified: []

key-decisions:
  - "Ran as a non-autonomous checkpoint on the main working tree, not in a worktree — the plan declares `files_modified: []` and its only task is a blocking human gate"
  - "02-UAT.md was left untouched: closing tests 9 and 16 belongs to the re-run, not to this plan"

patterns-established:
  - "Perception failures get a human-verify plan: when the original defect was 'this looked broken', only a person looking at the screen can close it"

requirements-completed: [DRFT-10, DRFT-14]

# Metrics
duration: 4min
completed: 2026-08-14
---

# Phase 02 Plan 10: Human Verification of the Pool Expand Affordance

**Host confirmed on a real screen that the inert `Expand the pool` control reads as unavailable-with-a-reason and that the pool and board panes now start on the same line — the two claims happy-dom cannot evaluate.**

## Performance

- **Duration:** ~4 min
- **Tasks:** 1/1
- **Files modified:** 0 (verification-only plan)

## Why this plan existed

`tests/ui/draft-panes.test.tsx` runs in happy-dom, which computes no widths, resolves no grid
tracks and evaluates no media query — its own header block says so. Plan 02-09's two
user-visible outcomes therefore sit outside what any test in this repo can assert:

1. the `.pane__chrome` `min-height` alignment fix, which is a computed-layout result, and
2. whether the inert control *reads* as deliberately unavailable rather than broken, which is
   a perception judgement.

Both are exactly what the host reported in UAT test 9. The original bug was a perception
failure, not a logic failure, so a person had to close it.

## Verdict

The host ran the plan's setup — two players, valid pool, `Start draft`, one pick — against the
dev server and answered **approved**, covering all six checks:

| # | Check | Result |
|---|-------|--------|
| 1 | `Expand the pool` renders dimmed with `Available once the draft is complete` beside it, and reads as unavailable on purpose | ✓ |
| 2 | Pool grid's top edge and draft board's top edge start on the same line | ✓ |
| 3 | Clicking the control mid-draft is refused — layout unchanged, board stays at normal size | ✓ |
| 4 | Tab reaches the control, it shows a focus ring, and Enter/Space do nothing | ✓ |
| 5 | `Expand the draft board` still works, and panes remain aligned after returning from the collapsed strip | ✓ |
| 6 | Once the draft completes the control is at full strength with no reason text, and clicking it does expand | ✓ |

Check 6 was the control case: an identical appearance in steps 1 and 6 would have meant the
inert styling was not landing. The host reported no such failure.

## Task Commits

1. **Task 1: Confirm the affordance reads correctly and the panes align** — no code commit; this
   task is a `checkpoint:human-verify` gate whose only artifact is this summary.

**Plan metadata:** this file (docs: complete plan)

## Files Created/Modified

None. `files_modified` in the plan frontmatter is empty by design.

## Decisions Made

- Executed as a non-autonomous checkpoint directly on the main working tree rather than in a
  git worktree. The plan produces no code, so worktree isolation would have bought nothing and
  the merge would have carried only this file.
- `02-UAT.md`'s frontmatter `status:` and its `## Gaps` section were deliberately left as plan
  02-09 left them. This plan asserts nothing about the bans disclosure in UAT test 16, so it
  cannot close that gap; both gaps close on the UAT re-run.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

Port 5173 was already in use, so Vite served on 5174. No effect on the verification.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- UAT tests 9 and 16 in `02-UAT.md` are ready to be re-run. Both currently sit at `pending`
  with counts reconciled to 14 passed / 0 issues / 2 pending. That re-run — not this plan — is
  what closes the two recorded gaps.
- No blockers. Phase 02's ten plans all have summaries.

---
*Phase: 02-host-configured-draft-night*
*Completed: 2026-08-14*
