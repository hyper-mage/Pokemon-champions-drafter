---
phase: 02-host-configured-draft-night
fixed_at: 2026-08-15T20:30:00Z
review_path: .planning/phases/02-host-configured-draft-night/02-REVIEW.md
iteration: 1
fix_scope: critical_warning
findings_in_scope: 5
fixed: 4
skipped: 1
status: partial
files_modified:
  - src/ui/components/SplitPanes.tsx
  - src/ui/components/SplitPanes.css
  - tests/ui/draft-panes.test.tsx
---

# Phase 02: Code Review Fix Report

**Fixed at:** 2026-08-15T20:30:00Z
**Source review:** `.planning/phases/02-host-configured-draft-night/02-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (WR-01 … WR-05; zero Critical)
- Fixed: 4
- Skipped: 1 (WR-02 — needs a real screen reader; open question recorded)

`npm run verify` was run before every commit and passed each time. Final state:
**43 test files / 882 tests, 0 purity violations, typecheck and build clean.** The suite gained
exactly one test (881 → 882); the other three fixes added assertions to existing tests or changed
comments only.

**Total production-code change across all five findings is three lines** — the `onKeyDown` guard
in `SplitPanes.tsx`. Everything else is test assertions and comments.

## Fixed Issues

### WR-01: Held Enter turns the focus handoff into an unbounded pane oscillation

**Files modified:** `src/ui/components/SplitPanes.tsx`, `tests/ui/draft-panes.test.tsx`
**Commit:** `3d3138e`
**Status:** fixed — **requires human verification in a real browser** (see below)

Applied the reviewer's fix at the source: `onKeyDown` cancels an `Enter` keydown when
`event.repeat` is true. The handoff itself is left alone, as the review asked.

Scoped to `Enter` deliberately. A button activates on Space's *keyup*, so Space repeats activate
nothing and there is nothing to refuse — while cancelling their `keydown` would suppress the
press itself. That narrowing is pinned by an assertion.

**I did not write the test the review suggested, and this is the one place I departed from it.**
The review said to "activate the focused element three times in a row and assert the pane ended
where one press would leave it." I probed happy-dom directly first: **a dispatched `keydown` on a
button produces zero `click` events** — happy-dom does not implement Enter activation at all. So
that test has two failure modes and no success mode. Driven by `.click()` it bypasses the guard
entirely and fails; driven by `keydown` nothing ever activates, so it passes identically against a
component with no guard whatsoever. That is precisely the "looks like coverage but is not"
assertion the phase constraints and the test file's own header forbid.

What the new test pins instead is the guard's **decision**: a repeat is cancelled, a first press
is not, and Space is untouched. I falsified it — with the guard removed the test fails on the
repeat assertion — so it is a real pin rather than a tautology.

**Human verification needed:** that `preventDefault()` on `keydown` suppresses the activation is
browser behaviour this environment cannot execute. The review lists the same premise under "what I
could not evaluate". It is standard and well-specified, but the end-to-end claim — hold Enter, the
panes do not walk — has not been observed anywhere yet. This is worth a few seconds at the next
human checkpoint.

### WR-03: The split→expanded focus test passed without proving node reuse

**Files modified:** `tests/ui/draft-panes.test.tsx`
**Commit:** `0e38992`
**Status:** fixed

Captured the pool's control before the change and asserted `expect(restore).toBe(poolControl)`,
exactly as the sibling test does for the opposite direction. Added `expect(poolControl).toBeDefined()`
first, so a pair of `undefined`s cannot satisfy the identity assertion — `buttonNamed` returns
`HTMLButtonElement | undefined` and `toBe` would otherwise pass vacuously.

Falsified: forcing a remount (a differing vnode `key` on the button) fails the new assertion.
Reuse in this direction is correct today, so this closed a coverage defect, not a live bug — as
the review said.

### WR-04: Nothing asserted the reused button sheds its inert ARIA

**Files modified:** `tests/ui/draft-panes.test.tsx`
**Commit:** `2bb348d`
**Status:** fixed

Added the two assertions the review asked for, **plus** the setup that makes them mean what their
comment claims. The review's own suggested comment says "the same node was the inert expand a
render ago" — but on a node that never carried the attributes, "no `aria-disabled`" proves nothing
at all. So the test now captures the inert control's attributes *before* the collapse and asserts
node identity *after* it. The assertions then genuinely say **cleared** rather than merely absent.

Falsified: widening `isInert` to drop its `!collapsed` guard fails the new assertion.

### WR-05: The `flex-wrap` justification stated behaviour CSS does not have

**Files modified:** `src/ui/components/SplitPanes.css`
**Commit:** `bb1a5b6`
**Status:** fixed (comment only)

Replaced both false claims:

1. *"neither of which shrinks below its content"* → both shrink. `flex-shrink` defaults to `1` and
   a flex item's automatic minimum size is `min-content`; neither the button nor the span opts out.
   The comment now names **two** thresholds — wrap at the sum of max-content widths (~370 px),
   overflow only at the sum of min-content widths (under 150 px, which no reachable viewport
   produces).
2. *"wrapping changes nothing wherever the row fits"* → the band between those thresholds is real,
   reachable on a phone inside the single-column query, and was not broken before. The comment now
   says so, and records that this is the case 02-13's host confirmed reads correctly on two rows.

Kept the correct parts: the start-edge overflow argument, the `min-height`-is-a-floor sentence, and
the `FeasibilityBar.css:14` precedent. Added a closing note that the figures are arithmetic over
this file's own tokens rather than measurements, since nothing in the suite computes layout.

**The built CSS bundle hash is unchanged** (`index-CsbEd73w.css`, 23.05 kB, before and after) —
mechanical proof the shipped stylesheet is byte-identical and no layout behaviour moved.

## Skipped Issues

### WR-02: The pane announcement and the focus move are committed together

**File:** `src/ui/components/SplitPanes.tsx:143-146` with `:192-200`
**Reason:** requires a real screen reader (NVDA/VoiceOver), which this environment does not have.
**Partial action taken — commit `23c9965` (documentation only, JS bundle hash unchanged).**

The finding's own fix is "check it with a real screen reader before treating WR-08 as closed." I
cannot run one, and I deliberately did not take the *contingent* code action either. Removing the
announcements on the two focus-moving transitions would change phase-specified copy that the suite
pins by exact equality, on the strength of a premise nobody has tested — trading a *possible*
silence for a *certain* one. The collapse-to-split transition moves no focus and the announcement
is the only signal a screen-reader user gets there.

What I did do is the half the review explicitly asked for: *"Record whichever way it goes in the
component's doc block, because the next reader will otherwise re-derive it."* Since it has not gone
either way, the doc block now records the interaction, why it is open, what would settle it, what
the resolution should be if it is confirmed, and why it was not resolved by guessing.

**This finding is not closed.** It needs a human with a screen reader on the two expand transitions.

## Escalation check: IN-01 (`SideOptions.key`)

The brief asked me to read IN-01 before touching WR-03, on the theory that a Preact-reserved prop
name could undermine the node reuse WR-03 proves. **I checked, and it cannot. No escalation.**

`key` never reaches Preact:

- `side` is never used as a JSX component — `<Side` matches nothing in `src/` or `tests/`.
- It is invoked as a plain function, `side({ … })`, at `SplitPanes.tsx:384` and `:397`.
- `options` is never spread into a vnode, and **no vnode in the file carries a `key` prop at all**.
- Inside `side()`, `key` is used only for `data-side={key}`, the `reasonId` template, and
  `isFullWidth = pane === key`.

So it is an ordinary object field with no path to vnode creation, and it has zero effect on the
node reuse WR-03 asserts. It remains a genuine latent trap for anyone who later promotes `side()`
to a component — which is what the review filed it as — but it is a naming hazard, not an identity
mechanism. Left as Info, as the brief directed for this outcome.

## Constraints observed

- `src/app.tsx`, `src/adapters/view-prefs.ts` and `package.json` were **not touched**. The diff is
  the three in-scope files, confirmed by `git diff --stat`.
- `poolExpandable = complete` untouched; both mid-draft coercions intact. Nothing here makes the
  pool expand work mid-draft, so threat T-02-24 stays closed.
- **None of 02-13's six human-confirmed behaviours changed.** The CSS bundle hash is byte-identical
  across the whole run, and the only functional change is that a *repeated* Enter keydown is now
  cancelled — which touches none of focus visibility, the hover exclusion, pane alignment, or the
  reason line's content and wrapping.
- No assertion was written that happy-dom cannot actually evaluate. Where the honest test was
  weaker than the reviewer's suggestion (WR-01), the test says so in its own doc block and names
  what a real browser still owns.

---

_Fixed: 2026-08-15T20:30:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
