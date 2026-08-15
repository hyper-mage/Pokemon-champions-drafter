---
phase: 02-host-configured-draft-night
plan: 13
subsystem: testing
tags: [uat, human-verification, accessibility, focus-management, css-layout]

# Dependency graph
requires:
  - phase: 02-host-configured-draft-night
    provides: "Plan 02-11's focus restoration and single-vnode chrome, and plan 02-12's hover exclusion, wrapping chrome row and markup separator"
provides:
  - "Host confirmation that keyboard focus lands on a visible control after every pane change"
  - "Host confirmation that the inert expand does not respond to hover while the live one still does"
  - "Host confirmation that the 02-10 pane alignment verdict still holds after this round"
  - "Host confirmation that the reason line reads correctly and wraps rather than clipping"
  - "Clearance to close the CR-01 gap recorded in 02-VERIFICATION.md by a re-verification run"
affects: [draft-screen, split-panes, uat]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A focus fix pinned by document.activeElement assertions is still closed by a person looking at the screen, because a focus ring the host cannot see is not a fix"
    - "Every hover/disabled check carries its control case: a check with no control case cannot tell a fix from a breakage"

key-files:
  created:
    - .planning/phases/02-host-configured-draft-night/02-13-SUMMARY.md
  modified: []

key-decisions:
  - "Ran as a non-autonomous checkpoint inline on the main working tree, not in a worktree — the plan declares `files_modified: []` and its only task is a blocking human gate, matching how plan 02-10 was run"
  - "Both executor deviations (02-11's exactOptionalPropertyTypes ref fix, 02-12's Rule 1 bullet rewrite) were surfaced to the host before they started, per the plan's read_first instruction"

patterns-established:
  - "Deviations recorded by prior plans are read out at the checkpoint before the host begins: a checkpoint that describes work which did not happen is worse than no checkpoint"

requirements-completed: [DRFT-10, DRFT-14]

# Metrics
duration: 5min
completed: 2026-08-15
---

# Phase 02 Plan 13: Human Verification of the Pane Focus and Chrome Fixes

**Host confirmed on a real screen that keyboard focus lands on a visible control after every pane
change, that the inert expand no longer responds to hover while the live one still does, that the
panes still align as approved under plan 02-10, and that the reason line reads correctly and wraps
rather than clipping.**

## Performance

- **Duration:** ~5 min
- **Tasks:** 1/1
- **Files modified:** 0 (verification-only plan)

## Why this plan existed

CR-01 was a keyboard defect nobody could see without a keyboard, on a control whose entire job is
recovery. Plan 02-11 pinned the mechanical half with `document.activeElement` assertions, but
happy-dom computes no layout: no widths, no grid tracks, no media queries, no hover state and no
accessible description. How a real browser moves focus on **pointer** activation differs between
engines, and a focus ring the host cannot see is not a fix.

Closing CR-01 on the strength of a happy-dom assertion alone would have been closing it the same
way it was shipped.

## Deviations surfaced before the host started

The plan requires prior-plan deviations be read out first. Both were:

- **02-11** — `ref={… : undefined}` does not type-check under `exactOptionalPropertyTypes`, because
  Preact's `Ref<T>` admits `null` but not `undefined`. Changed to `null`. Two code comments were
  also reworded: their prose quoted the *old* element shape and was tripping the plan's own
  acceptance greps (`grep -c "<button"` returned 2, `grep -c "reason: string | null"` returned 1,
  both from comments describing the removed shape).
- **02-12** — Rule 1 deviation. The plan said to *append* a line to the test header's cannot-prove
  list. That existing bullet asserted the dash is CSS-generated `::before` content, which Task 2 of
  the same plan had just made false. The executor rewrote the bullet rather than appending beside a
  claim its own work had falsified. Still one bullet, still two items.

## Host verdict, per step

The host's response was **`approved`**, which the plan's resume-signal defines as all six checks
holding. No failure was reported at any step, so there is no verbatim failure text to record.

| Step | Check | Verdict |
|------|-------|---------|
| 1 | Keyboard, expanding — focus ring lands on `Show the pool` on the collapsed strip, does not vanish, one Tab does not restart at the top bar | Confirmed |
| 2 | Keyboard, restoring — ring stays on that same button, now reading `Expand the pool` and dimmed; no jump, no disappearance | Confirmed |
| 3 | Panes still line up — pool grid and draft board top edges on the same line, and still so after a full-width round trip (regression guard against the 02-10 verdict) | Confirmed |
| 4 | Hover, with its control case — inert `Expand the pool` background does not change and shows a not-allowed cursor; live `Expand the draft board` background does change | Confirmed |
| 5 | The reason line — reads `— Available once the draft is complete`, one em dash, on the same row as the button, in the same muted grey | Confirmed |
| 6 | Narrow the window — reason drops to a second row, the whole button stays visible and clickable, no left-edge clipping, no horizontal scrollbar; widening returns it to one line | Confirmed |

Steps 1 and 2 are the ones this round existed for. Step 3 is the regression guard. Step 4's second
half is the control case.

## Verification state of the tree the host looked at

`npm run verify` passed on the exact tree presented:

- `check:pure` — 0 violations in 15 files under `src/core`
- `check:nohtml` — 0 violations in 59 files under `src`
- 43 test files / 881 tests passed
- `tsc --noEmit` clean on both tsconfigs, `vite build` clean
- service worker manifest — 322 URLs (312 sprites, 6 data), 953.7 kB precached

`git diff --name-only -- src tests` was empty before and after this plan. No source file was
modified.

The dev server was served from `http://localhost:5174/Pokemon-champions-drafter/`. Port 5173 was
occupied by an earlier dev-server process that outlived its harness task; it was stopped so exactly
one server was serving the tree under test.

## What this closes, and what it does not

**Closes:** the CR-01 gap recorded in `02-VERIFICATION.md` is now ready to be closed by a
re-verification run. The review warnings 02-12 addressed are confirmed on a real screen.

**Does not close:** `02-UAT.md` tests 9 and 16 are still awaiting their own human re-run. This plan
asserts nothing about the bans disclosure and does not touch them.

**On the `requirements:` claim.** `DRFT-10` and `DRFT-14` are both re-touches of already-SATISFIED
requirements, matching what plans 02-09 and 02-10 claimed for this same surface. Nothing new is
covered here.

## Self-Check: PASSED

- [x] Host answered every one of the six checks, each recorded against its step number
- [x] No failure reported, so no verbatim failure text was required
- [x] `npm run verify` passed on the tree the host looked at, and this summary says so
- [x] No source file modified — `git diff --name-only` lists nothing under `src/` or `tests/`
