---
phase: 02-host-configured-draft-night
scope: gap-closure-delta
scope_note: >-
  This is a --gaps-only re-review of plans 02-09 and 02-10 ONLY. It is NOT a full-phase
  review. The first eight plans of phase 02 were reviewed at standard depth on 2026-08-12;
  that report is preserved in git at commit 49259a2 and is NOT carried forward here.
  Findings below cover only the three source files changed between 49b9c48 and HEAD.
reviewed: 2026-08-15T00:38:14Z
depth: standard
diff_base: 49b9c489d80cb136304bc8df851d6f96154c1171
diff_head: 4bf34ae89fbedd097d9b9319acc9f29c456f8951
files_reviewed: 3
files_reviewed_list:
  - src/ui/components/SplitPanes.tsx
  - src/ui/components/SplitPanes.css
  - tests/ui/draft-panes.test.tsx
findings:
  critical: 1
  warning: 7
  info: 2
  total: 10
status: issues_found
---

# Phase 02 (gap closure 02-09 / 02-10): Code Review Report

**Reviewed:** 2026-08-15T00:38:14Z
**Depth:** standard
**Scope:** gap-closure delta only — `49b9c48..HEAD`, three files
**Files Reviewed:** 3
**Status:** issues_found

## Scope

This report covers **only** the gap-closure delta produced by plans 02-09 and 02-10:
the pool expand control moving from omission to an inert rendered state, the
`.pane__chrome` height reservation, and the `.pane__reason` treatment.

It deliberately does **not** re-review the first eight plans of phase 02 and does not
carry forward or re-litigate that report's findings. The earlier full-phase review is in
git at `49259a2`. A reader arriving at this file later should not read it as a
whole-phase verdict.

## Summary

The change does what it set out to do: mid-draft the pool expand is present, focusable,
`aria-disabled="true"`, carries an associated visible reason, and its click handler
refuses. `poolExpandable = complete` in `src/app.tsx` and both T-02-24 coercions are
untouched, so criterion 5 is still defended by three independent layers. Typecheck is
clean and all 879 tests across 43 files pass.

The defects are in what the change did *not* look at.

The one blocker is a keyboard-focus regression that the restructuring introduced as a
side effect. Wrapping the expand branch in a Fragment changed the vnode type Preact sees
on the collapsed→split transition, so the restore button is now destroyed and recreated
instead of reused, and focus lands on `<body>`. This is verified below, not inferred: the
pre-02-09 shape reuses the node, the post-02-09 shape does not.

Beyond that, several of the change's own load-bearing comments do not survive checking.
`.pane__chrome`'s reserved `min-height` cannot produce the alignment it claims, because
the empty-chrome state only ever coexists with a collapsed sibling whose scroll track is
`display: none`. The em dash split between TSX and CSS leaves half the visible copy
untested and contradicts the in-repo precedent it cites. And the reason string promises
that the pool expands once the draft is complete, at which point the pane no longer
contains the pool.

Evidence for the DOM-shape and focus claims comes from throwaway probe tests run against
the real `App` and then deleted; no source file was modified.

---

## Critical Issues

### CR-01: Restoring a collapsed pane now drops keyboard focus to `<body>`

**File:** `src/ui/components/SplitPanes.tsx:157-182`
**Severity:** BLOCKER — behavioural regression introduced by this change, no test covers it

Before 02-09 both branches of the chrome ternary produced a bare `<button>` vnode:

```tsx
{collapsed ? <button …>{restoreLabel}</button> : (!isFullWidth && expandable && <button …>{expandLabel}</button>)}
```

Preact matched them by type, reused the DOM element, and swapped its text and handler.
A keyboard user who pressed Enter on `Show the draft board` kept focus on that same
element, now reading `Expand the draft board`.

02-09 wrapped the expand branch in a Fragment so the reason span could sit beside the
button. The chrome's single child is now `<button>` in one state and `Fragment` in the
other. Differing types make Preact unmount the old subtree and mount a new one, so the
focused element is removed from the document and `document.activeElement` falls back to
`<body>`.

Verified two ways. Against the real app, focusing `Show the pool` and clicking it leaves
`document.activeElement.tagName === 'BODY'`. In isolation, rendering the two shapes side
by side gives:

```
{"oldReusedNode":true,"newReusedNode":false,"activeIsBody":true,"activeTag":"BODY"}
```

The consequence on the draft screen is not cosmetic. The restore control is the only way
back from a collapsed pane; a keyboard or switch user who uses it is dumped to the top of
the document and has to tab past the top bar, the turn banner, the expand control, the
density segmented control, the whole filter bar and up to 234 pool cells to reach
anything. This is the same class of failure as WCAG 2.4.3, on the control whose entire
job is recovery.

`.pane--collapsed .pane__button` also carries `writing-mode: vertical-rl`, so the
recreated element loses nothing visually and the bug is invisible without a keyboard.

**Fix:** make both states render the same vnode shape so Preact matches the button. The
chrome carries a control whenever the pane is collapsed *or* not full width, so the
branch can be hoisted out of the ternary entirely:

```tsx
const hasControl = collapsed || !isFullWidth;
const showReason = !collapsed && !expandable && reason !== null;

<div class="pane__chrome">
  {hasControl && (
    <>
      <button
        type="button"
        class="pane__button"
        aria-disabled={collapsed || expandable ? undefined : 'true'}
        aria-describedby={showReason ? reasonId : undefined}
        onClick={() => {
          if (collapsed) {
            change('split', SPLIT_MESSAGE);
            return;
          }
          // The early return IS the refusal.
          if (!expandable) return;
          change(key, expandedMessage);
        }}
      >
        {collapsed ? restoreLabel : expandLabel}
      </button>

      {showReason && (
        <span class="pane__reason" id={reasonId}>
          {reason}
        </span>
      )}
    </>
  )}
</div>
```

Note `showReason` must gain `!collapsed`: today the collapsed branch happens to render no
span, but once both states share one subtree the guard has to be explicit or the strip
would grow a reason it has no room for.

Add a regression test that asserts node identity rather than focus alone, since
`element.click()` in happy-dom does not itself move focus:

```tsx
it('keeps the restore control focused across a pane change', async () => {
  await reachDraft();
  await click(buttonNamed('Expand the draft board'));

  const restore = buttonNamed('Show the pool');
  restore?.focus();
  await click(restore);

  // Same DOM node, relabelled — not a new one, which would drop focus to <body>.
  expect(document.activeElement).toBe(buttonNamed('Expand the pool'));
});
```

---

## Warnings

### WR-01: The inert expand still lights up on hover, inviting the click it refuses

**File:** `src/ui/components/SplitPanes.css:140-142`
**Severity:** WARNING

`.pane__button:hover { background: var(--color-surface-raised); }` has no exclusion for
the disabled state, so the mid-draft pool expand gets the identical hover response as the
live board expand. `cursor: not-allowed` from line 156 applies at the same time, so the
host gets one signal saying "pressable" and one saying "not pressable" on the same
element — and then a click that does nothing at all, with no announcement.

That is a weaker version of the exact confusion UAT test 9 raised. It also breaks a
three-way in-repo precedent:

- `src/ui/components/TopBar.css:70` — `.top-bar__button:hover:not(:disabled)`, on a button
  whose declaration block is otherwise character-for-character the same recipe
- `src/ui/components/SegmentedControl.css:105` — an explicit rule neutralising hover on a
  disabled option
- `src/ui/app.css:228` — `.landing__action:hover:not(…)`

**Fix:** the state here is `aria-disabled`, not native `disabled`, so the exclusion has to
name the attribute:

```css
.pane__button:hover:not([aria-disabled='true']) {
  background: var(--color-surface-raised);
}
```

### WR-02: `.pane__chrome`'s `min-height` cannot do what its comment says it does

**File:** `src/ui/components/SplitPanes.css:71-88`
**Severity:** WARNING

The comment states the reservation "makes both panes' content start on the same line in
every combination of states — that misalignment is what UAT test 9 reported as a failed
render". Neither half holds after 02-09.

Enumerating `side()`, a chrome is empty only when `!collapsed && isFullWidth`, and that is
true only for the pane that currently owns the full width — whose sibling is therefore
`pane--collapsed` and whose sibling's `.pane__scroll` is `display: none`. Dumped from the
real app:

```
SPLIT/mid-draft   pool{collapsed:false, chromeKids:2}  board{collapsed:false, chromeKids:1}
BOARD-FULL        pool{collapsed:true,  chromeKids:1}  board{collapsed:false, chromeKids:0}
SPLIT/complete    pool{collapsed:false, chromeKids:1}  board{collapsed:false, chromeKids:1}
POOL-FULL         pool{collapsed:false, chromeKids:0}  board{collapsed:true,  chromeKids:1}
```

There is no reachable state with an empty chrome and two visible scroll tracks. In both
split states each chrome holds a button, and `.pane__button` already carries
`min-height: var(--target-min)`, so the chromes were the same height with or without this
rule. What actually fixed UAT test 9 was rendering the button — the misalignment was a
symptom of the omission, not a separate defect.

Worse, in the two states where the rule does apply it does not align anything either: the
collapsed strip's chrome holds a `writing-mode: vertical-rl` button whose height is set by
the label length (`Show the draft board` at 14px is well over 100px), so the two chromes
differ by far more than one target regardless. The measurable net effect is 44px of scroll
height given up in the expanded pane, inside a layout whose whole premise is `100dvh` and
fitting eight board rows without an internal scrollbar.

Separately, `align-items: center` is credited with keeping "the button and its reason on
one row, so the chrome stays exactly one target tall rather than growing to two".
`align-items` controls cross-axis alignment and has no effect on wrapping; the single line
comes from the default `flex-wrap: nowrap`. What `align-items: center` actually buys is
vertically centring the shorter span against the taller button — worth having, but not
what the comment claims, and the claim is exactly the kind a later reader would rely on
before adding `flex-wrap` (see WR-05).

**Fix:** either drop `min-height` and correct the comment, or keep it and rewrite the
comment to what it does — "reserves the row so an expanded pane's empty chrome does not
jump its content upward on every toggle" — which is a defensible reason and is testable
by eye. Do not leave the current text: this codebase's comments are treated as contracts,
and one that misattributes a fix will send the next reader after the wrong rule.

### WR-03: Half the visible reason copy lives in CSS and nothing tests it

**File:** `src/ui/components/SplitPanes.css:166-179`, `src/ui/components/SplitPanes.tsx:55-63`, `tests/ui/draft-panes.test.tsx:301`
**Severity:** WARNING

What the host reads is `— Available once the draft is complete`. The tested contract is
`Available once the draft is complete`. The separator is `content: '— '` in a stylesheet
with no test of any kind, so changing it to a hyphen, an en dash, or deleting it silently
changes shipped copy and the suite stays green. The exact-equality assertion the comment
points at protects the half that was never at risk.

The justification — keeping the constant byte-identical to 02-UI-SPEC's string table — is
a constraint the authors set and already amended in this same change (the table now reads
`` `Available once the draft is complete` — the reason beside the inert control. The `— `
separator is CSS-generated ``). And the precedent the TSX doc block cites for the shape
does the opposite: `src/ui/screens/ConfigScreen.tsx:157-158` bakes the dash straight into
the label, `'Blind — Not yet available'`. So the codebase now carries two contradictory
conventions for one pattern, and the newer one is the untested one.

The accessible-description question the executor recorded is real but is the smaller half.
CSS generated content is included in the accname computation in Chrome and Firefox, so the
description does become `— Available once the draft is complete`; most screen readers drop
an em dash at default punctuation levels, so the practical cost is low. What makes it worth
raising is that the trade-off was not forced. Both goals are satisfiable at once:

```tsx
<span class="pane__reason" id={reasonId}>
  <span class="pane__reason-dash" aria-hidden="true">{'— '}</span>
  {reason}
</span>
```

or, if the dash must stay presentational, point `aria-describedby` at an inner span and put
`::before` on the outer one. Either keeps the constant byte-identical, keeps the dash out of
the description, and puts the whole visible string under one test.

**Fix:** pick one convention and apply it to both this control and the ban-mode options.
Whichever is chosen, assert the string the host actually sees.

### WR-04: The reason promises the pool expands, and the pool is gone by then

**File:** `src/ui/components/SplitPanes.tsx:63`, `src/app.tsx:1067-1078`
**Severity:** WARNING

`Available once the draft is complete` tells the host that `Expand the pool` starts
working when the draft ends. It does — and at that same moment `src/app.tsx` swaps the
pane's contents from `PoolGrid` to `CompletedDraft`. Probed against the real app at 12 of
12 picks:

```
pool pane holds .pool grid?  false
pool pane scroll text:       "Draft complete — save a copy? Download the tournament JSON so you can…"
```

So the control labelled `Expand the pool`, having explained that it will be available once
the draft is complete, becomes available at the instant it stops expanding the pool and
starts expanding the export panels. The collapsed strip then offers `Show the pool` for the
same non-pool content.

The mislabelling of `Expand the pool` / `Show the pool` predates 02-09. What is new is the
sentence that makes the contradiction explicit and puts it on screen for the entire draft.

**Fix:** either make the label follow the pane's contents, or make the reason stop naming
completion as the unlock. The smaller change is the reason, e.g. `Available once every
team is full`, which is true of both the timing and the thing being expanded. If the labels
are changed instead, 02-UI-SPEC's copy table and the `buttonNamed(…)` lookups in
`tests/ui/draft-panes.test.tsx` move with them.

### WR-05: The chrome cannot wrap and is right-aligned, so its content can overflow out of reach

**File:** `src/ui/components/SplitPanes.css:81-88`
**Severity:** WARNING

`.pane__chrome` is `display: flex` with `justify-content: flex-end` and no `flex-wrap`.
Its two children are a button and a ~38-character label, neither of which can shrink below
its content (`min-width: auto` on a flex item). At the widths this phase targets that is
fine. When the row no longer fits — the single-column layout below 80rem on a narrow
phone, or a host running large text — a `flex-end` row overflows its **start** edge, and
overflow past the start edge is not reachable by scrolling. The button, not the label, is
what goes off the side.

`.pane` sets `min-width: 0` but declares no overflow behaviour outside `.pane--collapsed`,
so the excess escapes into `.draft-shell` and turns the one screen that is deliberately not
page-scrollable into a horizontally scrolling one.

The codebase already solves this for the structurally identical bar:
`src/ui/components/FeasibilityBar.css:14` declares `flex-wrap: wrap` on a sticky row
holding a button plus a reason.

This is a static reading, not a measured failure — happy-dom computes no layout, so no test
in this phase can see it either way.

**Fix:**

```css
.pane__chrome {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--target-min);
}
```

`min-height` stays a floor, so the chrome is still one target tall whenever the row fits
and grows only when the alternative is losing the control. If a second row is genuinely
unacceptable, the alternative is `.pane__reason { min-width: 0; overflow: hidden;
text-overflow: ellipsis; }` — but truncating the explanation is the worse of the two, and
should be argued rather than defaulted into.

### WR-06: The inert label measures 4.04:1 against the page background

**File:** `src/ui/components/SplitPanes.css:156-159`
**Severity:** WARNING

`opacity: 0.45` on `--color-text` `#e8edf2` over `--color-bg` `#0f1216` composites to
`rgb(113 117 121)`, which is **4.04:1**. The label is `--text-label`, 600 weight at 14px,
which is not large text, so the AA threshold is 4.5:1. The button's hairline border lands
at 1.76:1. The focus ring survives at 3.32:1, so the tab stop is still findable.

Two things keep this out of the blocker tier. WCAG 1.4.3 exempts inactive components, and
`aria-disabled="true"` is a defensible claim to that exemption. And the same `opacity:
0.45` recipe is established in `FeasibilityBar.css:41` and `TopBar.css:80`, so this rule
inherits a convention rather than inventing one.

It is still worth recording, because this control is the one case where the exemption sits
least comfortably: 02-09's entire argument for dropping native `disabled` is that the host
must be able to reach and read this control. The mitigation is that `.pane__reason` is a
sibling rather than a child, so the explanation itself is unaffected and measures 7.65:1 —
worth stating in the comment so nobody later "tidies" the span inside the button.

**Fix:** no change required here if the exemption is accepted; if it is not, the
project-wide fix is a dedicated muted-ink token instead of compositing, applied to all
three call sites at once rather than to this one. Either way, add a line to the comment
recording that the reason is deliberately outside the dimmed subtree.

### WR-07: `expandable: false` with `reason: null` is representable, and reproduces the exact defect 02-09 removed

**File:** `src/ui/components/SplitPanes.tsx:109-127`
**Severity:** WARNING

`side()` takes `expandable: boolean` and `reason: string | null` as independent positional
parameters. The pair `(false, null)` compiles, renders an `aria-disabled` control with no
`aria-describedby` and no visible text, and produces precisely the state UAT test 9
reported: a control the host cannot use and cannot find out why. The doc block asserts
"the explanation is the whole reason for rendering the control", but nothing enforces it.

Compounding it, `side()` now takes eight positional arguments, five of them strings
(`children` aside: `expandLabel`, `restoreLabel`, `expandedMessage`, `reason`) in adjacent
positions. Transposing any two is silent at compile time and would surface as the wrong
copy on screen. The call sites are currently correct — both were checked argument by
argument — but the delta added a fifth string to a list that was already at the limit of
what positional passing can be trusted with.

**Fix:** collapse the two into one parameter so an unavailable state cannot exist without
its explanation, and take an options object so the strings are named at the call site:

```tsx
type Availability = { available: true } | { available: false; reason: string };

function side(options: {
  key: 'pool' | 'board';
  collapsed: boolean;
  children: ComponentChildren;
  expandLabel: string;
  restoreLabel: string;
  expandedMessage: string;
  availability: Availability;
}) { … }
```

### WR-08: Expanding a pane also unmounts the focused control (pre-existing, same root cause as CR-01)

**File:** `src/ui/components/SplitPanes.tsx:157`
**Severity:** WARNING

The `!isFullWidth &&` guard means the pane that has just been expanded carries no chrome
control, so the button the host just activated is removed from the document and focus
falls to `<body>`. Confirmed against the real app: focusing `Expand the draft board` and
clicking it leaves `document.activeElement === document.body`.

This behaviour predates 02-09 — the guard is unchanged — but it sits on a line this change
rewrote, it is the other half of CR-01, and any fix for CR-01 that does not consider it
will leave the pane toggle dropping focus in one direction out of two. `announce()` covers
the screen-reader half of the story; it does nothing about where the next Tab starts.

**Fix:** after a successful `change()`, move focus to the control that replaced the one
being removed — the opposite pane's restore button. A `ref` on the button plus a
`useLayoutEffect` keyed on `pane` is enough; the restore control is guaranteed to exist in
both full-width states, which is what makes this safe to do unconditionally.

---

## Info

### IN-01: `reasonId` is a document-global id derived only from `key`

**File:** `src/ui/components/SplitPanes.tsx:126`
**Issue:** `` `${key}-expand-reason` `` yields the fixed string `pool-expand-reason`. It is
unique today because `SplitPanes` is mounted once, but 02-UI-SPEC's own availability table
contemplates the config screen's ban-grid section as a second consumer of this control. Two
instances would emit duplicate ids and every `aria-describedby` would resolve to the first.
**Fix:** derive the prefix from a per-instance id (`useId()` equivalent, or a prop) rather
than from `key`, at the point a second instance is introduced. Not worth changing before
then — recorded so it is not rediscovered as a bug.

### IN-02: No test would notice the reason leaking into the collapsed strip

**File:** `tests/ui/draft-panes.test.tsx:377-378`
**Issue:** The collapse test asserts `chrome?.querySelectorAll('button')` has length 1. The
reason is a `<span>`, so a regression that rendered `.pane__reason` inside a
`--target-min`-wide vertical strip would pass. This matters more after CR-01's fix, which
merges the two chrome branches into one subtree and makes the `!collapsed` guard on
`showReason` the only thing keeping the span out.
**Fix:** tighten to `expect(chrome?.childElementCount).toBe(1)` and add
`expect(strip?.querySelector('.pane__reason')).toBeNull()`.

---

## Verification Performed

- `npm run typecheck` — clean
- `npx vitest run` — 43 files, 879 tests, all passing
- Two throwaway probe tests written under `tests/ui/`, run, and deleted in the same
  command; `git status --porcelain` confirmed clean afterwards. They collected DOM shapes
  per pane state from the real `App`, `document.activeElement` after each pane change, and
  Preact node identity across the pre- and post-02-09 chrome shapes.
- Contrast ratios computed with the WCAG 2.x relative-luminance formula against the
  literal token values in `src/ui/tokens.css`.

No source file was modified during this review.

---

_Reviewed: 2026-08-15T00:38:14Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard — gap-closure delta only (`49b9c48..HEAD`)_
