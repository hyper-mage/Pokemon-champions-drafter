---
phase: 02-host-configured-draft-night
plan: 11
subsystem: ui
tags: [accessibility, focus-management, preact, regression, refactor]
requires:
  - src/ui/components/SplitPanes.tsx
  - src/ui/components/SplitPanes.css
  - src/adapters/view-prefs.ts
provides:
  - "One chrome vnode shape across every pane state, so Preact reuses the control's DOM node"
  - "A focus handoff for the one transition that genuinely removes the activated control"
  - "PaneAvailability — a union in which an unavailable expand without its reason does not compile"
affects:
  - src/ui/components/SplitPanes.tsx
  - tests/ui/draft-panes.test.tsx
tech-stack:
  added: []
  patterns:
    - "useLayoutEffect + useRef focus management, matching Dialog.tsx's established posture"
    - "isConnected as the effect's own precondition, rather than a map from pane transitions to outcomes"
    - "Discriminated union replacing an independent boolean/nullable-string parameter pair"
key-files:
  created: []
  modified:
    - src/ui/components/SplitPanes.tsx
    - tests/ui/draft-panes.test.tsx
decisions:
  - "useLayoutEffect shipped; the useEffect fallback the plan sanctioned was not needed"
  - "ref={collapsed ? collapsedControlRef : null} — null not undefined, forced by exactOptionalPropertyTypes"
  - "Reversed 02-09's eighth-positional-parameter decision in favour of a named options object"
metrics:
  duration: ~25 min
  completed: 2026-08-15
---

# Phase 02 Plan 11: Pane Focus Regression and the Availability Union Summary

Closed CR-01 and WR-08 — the pane controls dropped `document.activeElement` to `<body>` in
both directions — by giving the chrome one vnode shape and handing focus to the successor
control on the one transition that genuinely removes the activated button; then made
`(expandable: false, reason: null)` unrepresentable via a `PaneAvailability` union.

## What Was Built

**Task 1 — one chrome shape, one focus handoff** (`b583abb` RED, `c9bdc7a` GREEN)

The chrome's `collapsed ? <button> : <>…</>` ternary became a single `hasControl &&
<>…</>` Fragment rendered in every state, so Preact matches the button by type and reuses
the DOM node instead of unmounting and remounting it. `collapsed` now changes only the
control's label, its `aria-disabled`, and what its click does.

`showReason` gained a `!collapsed` guard. That guard is new and load-bearing: while the two
chrome states were separate subtrees the collapsed branch simply had no span to render, and
now that both share one subtree it is the only thing keeping a 38-character reason out of a
strip one `--target-min` wide whose button is `writing-mode: vertical-rl`.

For the split→full-width direction the fix is not to keep the node — an expanded pane
correctly carries no control, because the restore lives on the collapsed strip opposite —
so a `useLayoutEffect` hands focus to `collapsedControlRef`. It fires only when both
conditions hold: the activated element **was** `document.activeElement` at activation time,
and it is no longer `isConnected`.

**Task 2 — availability and its explanation are one value** (`24e2ea6`)

`side()` now takes one `SideOptions` object carrying a `PaneAvailability` discriminated
union. Narrowing supplies the reason, so there is no cast, no non-null assertion and no
optional chaining standing in for a proof.

## Key Decisions

**`useLayoutEffect` shipped — the fallback was not needed.** The plan sanctioned dropping to
`useEffect` if `useLayoutEffect` did not flush under `preact/test-utils` `act` in happy-dom.
It flushed on the first run; all 22 pane tests passed without touching the effect. Recorded
because the plan asked for the answer either way.

**`isConnected` rather than keying the effect on `pane`.** The effect states its own
precondition — "the control the host was on has left the document" — instead of encoding a
mapping from pane transitions to outcomes that a later change to the membership rule would
silently invalidate. It also means the collapsed→split case needs no special handling: the
button is reused, `isConnected` is true, and the effect returns.

**No dependency array on the effect.** It runs after every render and always clears
`activatedControlRef` first, so a recorded control can never survive into a later unrelated
render.

**Reversing 02-09's positional-parameter decision.** `02-09-SUMMARY.md:38` records the
deliberate choice to take an eighth positional parameter "rather than being refactored to an
options object; every other piece of copy it renders is already positional". That decision is
reversed, not forgotten, and the reason is in the `SideOptions` doc block: eight parameters
with four adjacent strings means transposing any two is clean at compile time and surfaces as
the wrong copy on a shared screen.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `ref={collapsed ? collapsedControlRef : undefined}` did not type-check**

- **Found during:** Task 1, at the `npm run verify` gate
- **Issue:** `tsconfig` has `exactOptionalPropertyTypes: true`, and Preact's
  `Ref<T> = RefObject<T> | RefCallback<T> | null` does not include `undefined`. Typecheck
  failed with:
  ```
  src/ui/components/SplitPanes.tsx(225,16): error TS2375: ... Types of property 'ref' are
  incompatible. Type 'undefined' is not assignable to type 'Ref<HTMLButtonElement>'.
  ```
- **Fix:** `ref={collapsed ? collapsedControlRef : null}`. Preact detaches on either, since
  it only re-attaches for a truthy ref. Commented in place so the next reader does not
  "tidy" it back to `undefined`.
- **Files modified:** `src/ui/components/SplitPanes.tsx`
- **Commit:** `c9bdc7a`

**2. [Rule 3 - Blocking] Two acceptance-criteria greps were defeated by my own prose**

- **Found during:** Task 1 and Task 2 acceptance checks
- **Issue:** The doc blocks this plan required me to write quote the old code they explain.
  `grep -c "<button"` returned `2` (one element, one prose mention of the old shape) and
  `grep -c "reason: string | null"` returned `1` (a prose mention of the removed signature).
  Both criteria demand the grep itself prove the change, so prose that inflates the count
  makes the proof useless to the next reader running the same command.
- **Fix:** Reworded both comments — "a bare button vnode", and "an `expandable` boolean, and
  a nullable `reason` string". No meaning lost; both greps now return the specified values.
- **Files modified:** `src/ui/components/SplitPanes.tsx`
- **Commits:** `c9bdc7a`, `24e2ea6`

### Environment

The worktree had no `node_modules`. Rather than reinstalling 144 MB of
`pokemon-showdown`, a directory junction to the main checkout's `node_modules` was created.
`node_modules` is gitignored (`.gitignore:1`), so nothing entered the diff. No package was
installed, added, or upgraded; `package.json` and `package-lock.json` are untouched.

## RED Failure Text (required by the plan)

Both new focus tests were confirmed failing against the unmodified component before any
implementation was written:

```
× keeps focus on the restore control across the collapse-to-split change 21ms
× moves focus to the collapsed pane's restore control when a pane expands 32ms
AssertionError: expected <body><div>…(2)</div></body> to be <button type="button" …(1)></button> // Object.is equality
```

`Test Files 1 failed (1) | Tests 2 failed | 20 passed (22)`

Both fail at `expect(document.activeElement).toBe(restore)` with `activeElement` being
`<body>` — exactly the reported defect, in both directions. The other three additions
(the refusal focus pin, the mount `document.body` pin, and the IN-02 strip tightening) are
pins rather than regression tests and passed at RED, as expected.

## Acceptance Criteria — Exact Command Output

```
$ grep -c "<button" src/ui/components/SplitPanes.tsx
1

$ grep -n "hasControl\|isConnected\|useLayoutEffect\|collapsedControlRef\|activatedControlRef" src/ui/components/SplitPanes.tsx
2:import { useLayoutEffect, useRef } from 'preact/hooks';
137:  const collapsedControlRef = useRef<HTMLButtonElement | null>(null);
143:  const activatedControlRef = useRef<HTMLButtonElement | null>(null);
...      (isConnected at 159/161/165, useLayoutEffect at 170, hasControl at 233/260)

$ grep -c "document.activeElement" tests/ui/draft-panes.test.tsx
8          (>= 4 required)

$ grep -c "reason: string | null" src/ui/components/SplitPanes.tsx
0

$ grep -n "available: true\|available: false" src/ui/components/SplitPanes.tsx
79:type PaneAvailability = { available: true } | { available: false; reason: string };
341:          ? { available: true }
342:          : { available: false, reason: POOL_EXPAND_REASON },
354:        availability: { available: true },

$ grep -c "side({" src/ui/components/SplitPanes.tsx
2

$ grep -n "as PaneAvailability\|availability!\|ts-expect-error" src/ui/components/SplitPanes.tsx
(no output)

$ git diff --name-only HEAD~1 -- tests/ | wc -l
0          (Task 2 touched no test file)

$ git diff --name-only 2acdaff HEAD
src/ui/components/SplitPanes.tsx
tests/ui/draft-panes.test.tsx
```

## Constraint Confirmation

`git diff 2acdaff HEAD -- src/app.tsx src/adapters/view-prefs.ts src/ui/components/SplitPanes.css package.json`
produces **zero lines**. Confirmed unmodified:

- `src/app.tsx` — `poolExpandable = complete` and the `app.tsx:519` coercion stand as written
- `src/adapters/view-prefs.ts` — the T-02-24 union check at line 94 stands
- `src/ui/components/SplitPanes.css` — stylesheet warnings remain plan 02-12's
- `package.json` — runtime dependencies are still exactly `preact` and `@preact/signals`

## The "Does Not Compile" Claim, Proven

The success criterion "`{ available: false }` without a `reason` does not compile" was
verified rather than asserted. The board call site was temporarily changed to
`availability: { available: false }` and `npm run typecheck` run:

```
src/ui/components/SplitPanes.tsx(354,9): error TS2322: Type '{ available: false; }' is not assignable to type 'PaneAvailability'.
```

The probe was reverted with `git checkout -- src/ui/components/SplitPanes.tsx`;
`git status --short` is clean and the probe is in no commit.

## Verification

`npm run verify` passes in full — `check:pure` (0 violations, 15 files), `check:nohtml`
(0 violations, 59 files), **43 test files / 881 tests passing**, typecheck clean, build clean.

Test count went 879 → 881: the two new focus tests. The pane file went 20 → 22. Task 2 left
both numbers unchanged, which is the proof that the refactor was behaviour-preserving.

### What is NOT verified here, stated rather than implied

- **Pointer activation in a real browser.** happy-dom's `element.click()` does not focus its
  target, and Safari genuinely does not focus a button on click. These tests pin the
  **keyboard** path — `focusAndClick` focuses explicitly and asserts the focus took before
  clicking. Plan 02-13 owns the real-browser confirmation of both directions.
- **Anything about layout.** happy-dom computes no widths and resolves no grid tracks.

## Threat Model Confirmation

| Threat ID | Disposition | Status |
|-----------|-------------|--------|
| T-02-24 | mitigate (stay closed) | Untouched. Both coercions are in files absent from the diff, and both pinning tests in `draft-panes.test.tsx` are byte-identical. |
| T-02-11-01 | mitigate | Focus moves only when the activated element was `document.activeElement` AND is no longer `isConnected`. Pinned by the mount test asserting `document.activeElement` is `document.body`. |
| T-02-11-02 | mitigate | The membership rule is unchanged. The handler's early return is preserved and Task 2 re-expressed availability as a type rather than weakening the runtime check. |
| T-02-11-03 | accept | Unchanged — the reason is a static UI constant. |
| T-02-11-SC | not applicable | Nothing installed. See Environment note above. |

## Known Stubs

None.

## Self-Check: PASSED

- `src/ui/components/SplitPanes.tsx` — FOUND
- `tests/ui/draft-panes.test.tsx` — FOUND
- `.planning/phases/02-host-configured-draft-night/02-11-SUMMARY.md` — FOUND
- Commit `b583abb` — FOUND
- Commit `c9bdc7a` — FOUND
- Commit `24e2ea6` — FOUND
</content>
</invoke>
