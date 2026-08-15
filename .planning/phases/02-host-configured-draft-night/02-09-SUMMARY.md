---
phase: 02-host-configured-draft-night
plan: 09
subsystem: ui
tags: [preact, accessibility, aria-disabled, css-tokens, uat-gap-closure]

# Dependency graph
requires:
  - phase: 02-host-configured-draft-night
    provides: "SplitPanes two-pane draft shell (02-06), the FeasibilityBar inert-control precedent (02-04)"
provides:
  - "An inert `Expand the pool` control that says why it is unavailable instead of vanishing"
  - "Reserved chrome height so both panes' content starts on the same line"
  - "Behavioural pins for the refusal across all four observable channels"
  - "02-UI-SPEC corrected — it no longer prescribes the silent omission it forbids elsewhere"
  - "02-UAT tests 9 and 16 re-runnable as written"
affects: [02-10, phase-03, phase-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Unavailability is a control's STATE, never its absence"
    - "`aria-disabled` without native `disabled` wherever a reason must stay keyboard-reachable"

key-files:
  created:
    - .planning/phases/02-host-configured-draft-night/02-09-SUMMARY.md
  modified:
    - src/ui/components/SplitPanes.tsx
    - src/ui/components/SplitPanes.css
    - tests/ui/draft-panes.test.tsx
    - .planning/phases/02-host-configured-draft-night/02-UI-SPEC.md
    - .planning/phases/02-host-configured-draft-night/02-UAT.md

key-decisions:
  - "The em dash separator is CSS-generated `::before` content so the copy constant stays byte-identical to the spec table and the test's exact-equality assertion — and it is recorded as PROBABLY ANNOUNCED and accepted as cosmetic, not as avoided"
  - "`side()` took an eighth positional parameter rather than being refactored to an options object; every other piece of copy it renders is already positional"
  - "The reason element's id is derived from the existing `key` parameter, so the function stays generic even though only the pool can currently reach the inert branch"

patterns-established:
  - "Inert-with-reason: `aria-disabled='true'`, no native `disabled`, `aria-describedby` to a visible reason, and a click handler whose early return IS the refusal"
  - "A refusal is pinned by exercise (press it, assert nothing moved) rather than by absence"

requirements-completed: [DRFT-10, DRFT-14]

# Metrics
duration: 12min
completed: 2026-08-14
---

# Phase 02 Plan 09: Gap Closure — Inert Pool Expand Summary

**The pool's expand control now renders inert with the visible reason `Available once the draft is complete` instead of being omitted, and `.pane__chrome` reserves a target's height so the two panes stop misaligning — the rule itself is untouched.**

## Performance

- **Duration:** ~12 min
- **Tasks:** 2 (Task 1 carried `tdd="true"`, so it produced a RED and a GREEN commit)
- **Files modified:** 5

## Accomplishments

- **Gap 1 closed by affordance, not by feature.** `poolExpandable = complete` is unchanged. What changed is that `expandable` left the chrome's membership test and became the control's state, so a host mid-draft now sees a dimmed `Expand the pool` with a reason beside it rather than an empty slot they read as a broken render.
- **The alignment defect fixed at its cause.** `.pane__chrome` had no reserved height, so an expanded pane's empty chrome collapsed to zero and its scroll track started a full target above the other pane's. `min-height: var(--target-min)` is commented as load-bearing.
- **Gap 2 closed with no code at all.** `TopBar.tsx:209-218` matches `02-UI-SPEC.md:1013` and its four tests pass. The defect was UAT test 16 having no setup, inheriting a zero-ban tournament, then asserting a count.
- **The spec's self-contradiction removed.** It mandated the silent omission at two sites while forbidding that exact pattern in section 8 item 3 and rendering the ban modes disabled-with-a-reason.

## Task Commits

1. **Task 1 (RED): repin the test that asserted absence** — `941349a` (test)
2. **Task 1 (GREEN): render the pool expand inert with its reason** — `110600a` (feat)
3. **Task 2: correct the spec and the two UAT tests** — `c56a205` (docs)

No REFACTOR commit — the GREEN implementation needed no cleanup.

## The exact reason string shipped

```
Available once the draft is complete
```

No trailing period; it is a fragment annotating a control, the same shape as the ban-mode options' `Not yet available` suffix. The em dash separator is **not** part of the string — `.pane__reason::before` supplies it, so the constant stays byte-identical across three places: `SplitPanes.tsx`, 02-UI-SPEC's Phase 2 string table, and the exact-equality assertion in `draft-panes.test.tsx`.

## Amended test names, and why the pin is stronger

One test, `offers only the board expand while a draft is running`, was replaced by three:

| Test | What it pins |
|------|--------------|
| `renders the pool expand inert, with its reason, while a draft is running` | The button exists, carries `aria-disabled="true"`, has **no** native `disabled`, and its `aria-describedby` resolves to an element reading exactly the reason string. The board's control is asserted to carry no `aria-disabled`. |
| `refuses the pool expand mid-draft, so the board cannot be hidden` | The click is pressed and refused: `data-pane` stays `split`, the live region does not carry `Pool expanded to full width.`, `localStorage`'s `pane` is not `pool`, and `.board` is still in the document. |
| `makes the pool expand real once the draft is complete` | At 12 picks the button carries no `aria-disabled`, no `.pane__reason` exists, and clicking sets `data-pane` to `pool`. |

**Why this is stronger, not weaker.** The deleted `expect(buttonNamed('Expand the pool')).toBeUndefined()` proved unreachability **by omission** — the button was not in the document, so no host could press it. The replacement proves the same invariant **by exercise**: the button is there, the host presses it, and nothing moves. Absence was only ever a proxy for unreachability, and it was a proxy that could not distinguish "refused" from "not built" — which is precisely the confusion the host hit in UAT test 9. The argument is recorded in a comment above the replacement, because a reviewer who sees a `toBeUndefined()` deleted is entitled to suspect the pin was loosened to fit the code.

The storage assertion is the load-bearing one: it proves the refusal happened **before** `onPaneChange`, not after.

## Constraint compliance — confirmed by diff, not by claim

`git diff 49b9c48 HEAD -- src/app.tsx src/adapters/view-prefs.ts package.json` returns **empty**.

- **`src/app.tsx` was not touched.** `const poolExpandable = complete;` stands exactly as written.
- **`src/adapters/view-prefs.ts` was not touched.** The T-02-24 union check is intact.
- **`package.json` was not touched.** Runtime dependencies remain exactly `preact` and `@preact/signals`.
- The T-02-24 pinning tests at `draft-panes.test.tsx` (the silent coercion and the honoured-once-complete cases) were left verbatim, as was the collapsed-strip `toHaveLength(1)` chrome count.

The inert control's early return is therefore a **third** independent layer over the existing two coercions, not a hole in them.

## Files Created/Modified

- `src/ui/components/SplitPanes.tsx` — `POOL_EXPAND_REASON` constant; `side()` gains an eighth positional `reason` parameter; the non-collapsed chrome branch renders on `!isFullWidth` alone with `aria-disabled` / `aria-describedby` and an early-returning click handler; header and prop doc blocks rewritten to record that availability is now carried by state.
- `src/ui/components/SplitPanes.css` — `.pane__chrome` gains `min-height: var(--target-min)`, `align-items: center`, `gap: var(--space-2)`; new `.pane__button[aria-disabled='true']`, `.pane__reason`, `.pane__reason::before`.
- `tests/ui/draft-panes.test.tsx` — three tests replace one; header's "cannot prove" list grows by two entries.
- `.planning/phases/02-host-configured-draft-night/02-UI-SPEC.md` — four edits (availability row, resolution note, pool-pane row, copy table).
- `.planning/phases/02-host-configured-draft-night/02-UAT.md` — test 9 truth scoped, test 16 given a setup and a second assertion, both `pending`, counts reconciled.

## Decisions Made

- **The em dash is generated content, and the reason is stated honestly.** Textual `::before` content IS included in the computed accessible description in current Chrome and Firefox, so the dash will most likely be announced. The stylesheet comment records this as **accepted cosmetic redundancy**, explicitly not as "kept out of what a screen reader announces" — the plan forbade carrying it under that false justification.
- **Fragment shorthand `<>` over the explicit `Fragment` import.** Both are established in this codebase; no `key` is needed here, so the shorthand is the smaller change.
- **Task 1's third test passes at RED, and that is correct.** It pins the already-working completed-draft case as a regression guard. The two tests covering new behaviour both failed at RED for the right reason (`expected undefined to be defined`), so the gate was genuine.

## Deviations from Plan

None — plan executed exactly as written. No deviation rule fired.

## Issues Encountered

- **The worktree started behind its expected base.** HEAD was at `80d64e3`; the branch check found `git merge-base` did not equal the required base `49b9c48`. The branch-namespace and protected-ref assertions passed first, the tree was clean, so `git reset --hard 49b9c48` corrected it as the startup protocol prescribes. No work was lost.

## Verification

- `npm run verify` passes: `check:pure`, `check:nohtml` (0 violations across 59 files), **879 tests in 43 files**, typecheck, and `vite build`.
- The plan's node gate prints `OK` — all eleven checks, including the four that specifically pin Edit 1 and Edit 2.
- No raw hex and no raw px entered `SplitPanes.css`; `0.45` is an opacity, matching the FeasibilityBar and FilterBar inert treatment exactly.

## Known Stubs

None.

## What is deliberately NOT verified here

- **Whether the two panes visually align.** happy-dom computes no layout. Plan 02-10 owns this check, and the test file's header now says so rather than implying coverage.
- **Whether the inert control reads as unavailable rather than broken on a real screen.** That is the human judgement UAT test 9 exists to make; it is now `pending`, not closed.
- **Whether the CSS em dash is announced.** Accepted as cosmetic, recorded in both the stylesheet and the test header.

`02-UAT.md`'s frontmatter `status:` and its `## Gaps` section were deliberately left untouched. Marking those closed belongs to the human re-verification run, not to the plan that made re-verification possible.

## Next Phase Readiness

- Both UAT gaps are closed at the code and document level and both tests are re-runnable as written. They await a human re-run, which is what `pending` records.
- Plan 02-10 inherits two named, scoped visual checks: chrome alignment across all pane-state combinations, and whether the inert control reads as unavailable at three metres.
- The inert-with-reason pattern is now established in two components (`FeasibilityBar`, `SplitPanes`) and is the phase's answer to any control that must be visible but unavailable.

## Self-Check: PASSED

All four claimed files exist on disk. All three task commits plus this metadata commit are
present in `git log`: `941349a`, `110600a`, `c56a205`, `d7f05b0`.

## TDD Gate Compliance

Task 1 carried `tdd="true"` and its gate sequence is intact in git history:

- **RED** — `941349a` `test(02-09)`, test-only, verified failing (2 failed / 18 passed, both
  failures `expected undefined to be defined` against `Expand the pool`).
- **GREEN** — `110600a` `feat(02-09)`, implementation, scoped run 20/20 then `npm run verify`
  green.
- **REFACTOR** — none. The implementation needed no cleanup, which the protocol permits.

---
*Phase: 02-host-configured-draft-night*
*Completed: 2026-08-14*
