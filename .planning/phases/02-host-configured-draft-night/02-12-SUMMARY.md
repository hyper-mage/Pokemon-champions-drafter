---
phase: 02-host-configured-draft-night
plan: 12
subsystem: ui
tags: [accessibility, css, copy, gap-closure, review-closure]
requires:
  - src/ui/components/SplitPanes.tsx
  - src/ui/components/SplitPanes.css
  - tests/ui/draft-panes.test.tsx
provides:
  - "A hover response that excludes the inert state, so the refused control stops signalling pressable"
  - "A chrome row that wraps rather than pushing its button past an unreachable start edge"
  - "The whole visible reason line, separator included, under one exact-equality assertion"
  - "A written disposition for every review finding this phase produced"
affects:
  - src/ui/components/SplitPanes.css
  - src/ui/components/SplitPanes.tsx
  - tests/ui/draft-panes.test.tsx
  - .planning/phases/02-host-configured-draft-night/02-UI-SPEC.md
  - .planning/phases/02-host-configured-draft-night/deferred-items.md
tech-stack:
  added: []
  patterns:
    - "hover excluded via :not([aria-disabled='true']), because the state is an attribute rather than native disabled"
    - "flex-wrap: wrap on a flex-end chrome row, matching FeasibilityBar.css:14"
    - "A separator between two sibling elements is aria-hidden markup; a separator inside one control's accessible name is part of the string"
key-files:
  created: []
  modified:
    - src/ui/components/SplitPanes.css
    - src/ui/components/SplitPanes.tsx
    - tests/ui/draft-panes.test.tsx
    - .planning/phases/02-host-configured-draft-night/02-UI-SPEC.md
    - .planning/phases/02-host-configured-draft-night/deferred-items.md
decisions:
  - "Kept .pane__chrome's min-height and corrected only its comment — the host verified this layout under 02-10"
  - "Took WR-03's markup shape over ::before, so the separator is both hidden from the description and testable"
  - "The two dash shapes in this repo are one rule about two patterns, not two conventions"
  - "Rewrote the test header's stale ::before bullet rather than appending beside a false claim"
metrics:
  duration: ~20 min
  completed: 2026-08-15
---

# Phase 02 Plan 12: Review Warning Closure on the Pane Chrome Summary

Closed WR-01, WR-02, WR-03, WR-05 and WR-06 on the three files plan 02-11 had just touched —
a hover response that no longer contradicts `cursor: not-allowed`, a chrome row that wraps
instead of overflowing an unreachable edge, a separator moved out of untested CSS into
`aria-hidden` markup — and wrote WR-04, WR-06's remediation and IN-01 down as deferred.

## What Was Built

**Task 1 — the hover signal, the overflow, and three comments that did not survive checking**
(`2cb69d8`)

`.pane__button:hover` became `.pane__button:hover:not([aria-disabled='true'])`. The
declaration is unchanged. The attribute is named rather than `:disabled` because 02-09
deliberately dropped the native attribute to keep the control focusable — `:not(:disabled)`
would have matched every button in the file and excluded nothing.

`.pane__chrome` gained `flex-wrap: wrap`. `flex: none`, `justify-content: flex-end`,
`align-items: center`, `gap` and `min-height` are all untouched.

**Task 2 — the whole visible line under one assertion** (`652ac4f`)

The separator is now a nested `<span aria-hidden="true">{'— '}</span>` inside `.pane__reason`,
`.pane__reason::before` is gone, and the test asserts exact equality on
`— Available once the draft is complete` plus the separator element itself.
`POOL_EXPAND_REASON` is byte-identical.

**Task 3 — the deferrals** (`f87e2eb`)

D3 (WR-04), D4 (WR-06's remediation) and D5 (IN-01) appended to `deferred-items.md` in the
established D1/D2 shape, with a closing line naming the eight findings closed in 02-11 and
02-12.

## The Reachable-State Enumeration Behind the Corrected `.pane__chrome` Comment

Derived from `side()` in `SplitPanes.tsx` rather than taken from the review. The three inputs
are `isFullWidth = pane === key`, `collapsed` (passed as `boardExpanded` for the pool and
`poolExpanded` for the board), and `hasControl = collapsed || !isFullWidth`. The reason span is
additionally gated by `showReason = !collapsed && reason !== null`.

| `pane` | Pool: collapsed / isFullWidth / hasControl | Pool chrome | Board: collapsed / isFullWidth / hasControl | Board chrome | Visible scroll tracks |
|--------|--------------------------------------------|-------------|---------------------------------------------|--------------|------------------------|
| `split`, mid-draft (`poolExpandable: false`) | false / false / **true** | button + reason (2) | false / false / **true** | button (1) | 2 |
| `split`, complete (`poolExpandable: true`) | false / false / **true** | button (1) | false / false / **true** | button (1) | 2 |
| `pool` (POOL-FULL) | false / **true** / **false** | **empty (0)** | **true** / false / true | button (1) | 1 — board's `.pane__scroll` is `display: none` |
| `board` (BOARD-FULL) | **true** / false / true | button (1) | false / **true** / **false** | **empty (0)** | 1 — pool's `.pane__scroll` is `display: none` |

Two conclusions, and both are what the comment now says:

1. A chrome is empty **only** when `!collapsed && isFullWidth`, and in exactly those two states
   the sibling is `pane--collapsed` with its scroll track at `display: none`. There is no
   reachable state with an empty chrome and two visible scroll tracks.
2. In both states that do show two tracks, each chrome holds a button, and `.pane__button`
   carries `min-height: var(--target-min)` of its own. So the button's own floor — not the
   chrome's — is what equalises the two chromes.

This agrees with `02-REVIEW.md`'s dump from the real app and with `02-VERIFICATION.md`'s
independent read, so the comment was written rather than the plan stopped.

## Before/After of Every Comment Changed

### 1. `SplitPanes.css` — `.pane__chrome`

**Before (the two false claims, verbatim):**

> The `min-height` is LOAD-BEARING, not cosmetic. […] Reserving the height makes both panes'
> content start on the same line in every combination of states — that misalignment is what UAT
> test 9 reported as a failed render.
>
> `align-items: center` keeps the button and its reason on one row, so the chrome stays exactly
> one target tall rather than growing to two.

**After (four paragraphs, summarised with the load-bearing phrases verbatim):**

- What equalises the two chromes "is the button's own `min-height` on `.pane__button` below.
  Rendering that button is what fixed UAT test 9; the misalignment reported there was a symptom
  of the control being omitted, not a separate defect", followed by the enumeration above in one
  sentence.
- What the reservation does: "hold the row open in the two full-width states, so an expanded
  pane's empty chrome does not jump its content upward on every toggle", with the cost stated
  in the same breath — "one target's worth of scroll height, in a pane whose whole premise is
  `100dvh`".
- Why it is kept: "dropping it moves content in exactly those two states, and a host confirmed
  this layout on a real screen under plan 02-10."
- `align-items: center` "does NOT prevent a wrap, and never did — nothing does now that
  `flex-wrap` is declared, and a single row comes from the row fitting. What it buys is
  vertically centring the shorter reason span against the taller button." The `flex-wrap`
  paragraph cites `FeasibilityBar.css:14` and names the start-edge overflow.

### 2. `SplitPanes.css` — the hover rule

**Before:** no comment at all.

**After:** a new block naming the contradiction ("one signal saying pressable and one saying
not-pressable on the same element, followed by a click that does nothing"), why the attribute
rather than `:disabled`, and the three precedents by file and line — `TopBar.css:70`,
`SegmentedControl.css:105`, `app.css:228`.

### 3. `SplitPanes.css` — `.pane__button[aria-disabled='true']`

**Before:** the four-line block about colour never being the only signal. **Unchanged and
kept.**

**After:** two paragraphs appended under a `--- WHAT THE DIMMING REACHES, AND WHAT IT
DELIBERATELY DOES NOT ---` heading. `.pane__reason` "is a SIBLING of this button, not a child,
so the explanation sits deliberately outside the dimmed subtree and measures 7.65:1", with the
reason it is recorded (so nobody tidies the span inside the button), all four measured figures
(4.04:1 label against a 4.5:1 threshold, 1.76:1 border, 3.32:1 focus ring, 7.65:1 reason), the
1.4.3 exemption argument, and a pointer to D4.

### 4. `SplitPanes.css` — `.pane__reason` and the deleted `::before`

**Before:** `.pane__reason` had no comment; a nine-line block above `.pane__reason::before`
explained that the dash was generated to keep the constant byte-identical and conceded that
`::before` content "IS included in the computed accessible description in current Chrome and
Firefox, so the dash will most likely be announced. Accepted as cosmetic".

**After:** the rule and its comment are deleted. `.pane__reason` keeps `font` and `color`
unchanged and gains a block carrying only the honest half — that generated content is included
in the computed accessible description, "which is why the separator moved into markup that can
be marked hidden rather than staying here" — plus the deciding half, that a separator living in
the stylesheet "put half of a visible line outside every test in the repository". The claim
02-09 was forbidden from writing is not restated.

### 5. `SplitPanes.tsx` — `POOL_EXPAND_REASON`

**Before:** "The em dash separator is NOT part of this string — `SplitPanes.css` generates it,
so the constant stays byte-identical to 02-UI-SPEC's copy table and to the exact-equality
assertion in `draft-panes.test.tsx`."

**After:** the no-trailing-period sentence is kept; the CSS paragraph is replaced by
`--- WHERE THE EM DASH LIVES, AS A RULE RATHER THAN A CONVENIENCE ---`, which records that a
separator **between two sibling elements** is `aria-hidden` markup and therefore covered by the
copy's own test, that a separator **inside one control's own accessible name** is part of the
string (`ConfigScreen.tsx:157`'s `Blind — Not yet available`, "one label with a suffix, not two
elements, so there is nothing for a sibling to be hidden from"), and that "WR-03's finding was
that this repo carried two conventions for one pattern. The resolution is that they were two
patterns." The byte-identity of the constant is restated as the point rather than the excuse.

### 6. `SplitPanes.tsx` — the separator span (new)

New inline comment on why it is markup, why `aria-hidden`, why it carries no class ("a class
with no stylesheet entry is dead weight"), and why the content is an expression container
holding a string literal — "JSX collapses trailing whitespace, and the space is half of the two
characters".

### 7. `draft-panes.test.tsx` — the header's "cannot prove" list

**Before:** "The em dash […] is CSS-generated `::before` content. Whether it reaches the
control's accessible description is not observable here — and it most likely DOES reach it in a
real browser. That is accepted as cosmetic, not avoided."

**After:** the same bullet, rewritten rather than appended to, because Task 2 made the first
sentence false: the dash "was generated content when that was written. Plan 02-12 moved it into
an `aria-hidden` span (WR-03), and the part that stays unobservable is the same either way:
happy-dom computes no accessible name and no accessible description, so what the assertions
below pin is the MECHANISM that keeps the separator out of the description, never the
description itself." See Deviations.

### 8. `draft-panes.test.tsx` — the two assertions

**Before:** `// Exact equality, never \`includes\` — this is a contract string.`

**After:** that line plus the WR-03 reason — the dash "used to be `content: '— '` in
`SplitPanes.css`, so half of what a host reads lived in a stylesheet nothing asserted on" — and
a second comment on the separator assertion explaining that the shape "is what makes the
assertion above possible".

### 9. `02-UI-SPEC.md` line 1013

**Before:** ``| Expand pool, unavailable | `Available once the draft is complete` — the reason
beside the inert control. The `— ` separator is CSS-generated and is not part of the string. |``

**After:** ``| Expand pool, unavailable | `Available once the draft is complete` — the reason
beside the inert control. The visible line is `— Available once the draft is complete`; the
`— ` separator is rendered as an `aria-hidden` span beside the reason rather than as generated
content, and the constant excludes it so the string table, the source constant and the test
assertion stay one value (amended by plan 02-12, WR-03). |``

One physical line, String column byte-identical, no other section of the document touched.

## Node Gate Output

**Task 1 gate (eight checks, comment-stripped for code and whitespace-normalized for prose):**

```
$ node -e '…hover excludes the inert state / no unguarded hover rule / chrome can wrap /
           chrome keeps its floor / stale alignment claim gone / stale wrap claim gone /
           real mechanism named / reason outside the dimmed subtree recorded…'
OK
```

**Task 1 raw-value gate:**

```
$ node -e '…if(/#[0-9a-fA-F]{3}/.test(s)||/[0-9]px/.test(s))…'
OK
```

**Task 2 gate (six checks, including the two 02-09 spec anchors):**

```
$ node -e '…constant byte-identical / separator is markup / generated dash gone /
           test pins the whole visible string / spec row corrected /
           02-09 gate anchors intact…'
OK
```

**Task 3 gate:**

```
$ node -e '…["## D3","## D4","## D5","WR-04","WR-06","IN-01","Decision needed:",
           "02-UAT.md","4.04:1","useId"]…'
OK
```

## Acceptance Criteria — Exact Command Output

```
$ git diff -U0 -- src/ui/components/SplitPanes.css   # Task 1, non-comment lines only
+  flex-wrap: wrap;
-.pane__button:hover {
+.pane__button:hover:not([aria-disabled='true']) {

$ grep -c "pane__reason::before" src/ui/components/SplitPanes.css
0

$ grep -n "min-height: var(--target-min)" src/ui/components/SplitPanes.css
109:  min-height: var(--target-min);       (.pane__chrome — the host-verified floor, kept)
151:  min-height: var(--target-min);       (.pane__button — what actually equalises the chromes)

$ git diff -- src/ui/components/SplitPanes.tsx | grep -E "^[-+].*POOL_EXPAND_REASON ="
(no output — the constant's declaration line is not in the diff)

$ git diff dbdb2bf HEAD --name-only
.planning/phases/02-host-configured-draft-night/02-UI-SPEC.md
.planning/phases/02-host-configured-draft-night/deferred-items.md
src/ui/components/SplitPanes.css
src/ui/components/SplitPanes.tsx
tests/ui/draft-panes.test.tsx
```

## Constraint Confirmation

```
$ git diff dbdb2bf HEAD -- src/app.tsx src/adapters/view-prefs.ts package.json \
    .planning/phases/02-host-configured-draft-night/02-UAT.md | wc -l
0
```

Confirmed unmodified, each for its own reason:

- **`.planning/phases/02-host-configured-draft-night/02-UAT.md`** — tests 9 and 16 stay at
  `result: pending` with their `expected:` text intact, which is exactly what makes WR-04 a
  deferral (D3) rather than a fix.
- **`src/app.tsx`** — `poolExpandable = complete` and the mid-draft coercion stand as written.
  The line 02-09, 02-11 and 02-12 have each held.
- **`src/adapters/view-prefs.ts`** — the T-02-24 union check at line 94 stands.
- **`package.json`** — runtime dependencies are still exactly `preact` and `@preact/signals`.
  Nothing installed, added or upgraded.

`.pane__chrome`'s `min-height: var(--target-min)` survives — checked mechanically above,
because it is the one line a well-meaning reading of WR-02 would have deleted.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The test file's header bullet was rewritten, not appended to**

- **Found during:** Task 2
- **Issue:** The plan asked to "add one line to the header block's list of what this file
  cannot prove". But the existing bullet at lines 28-31 states that the em dash "is
  CSS-generated `::before` content" and that it "most likely DOES reach it in a real browser
  […] accepted as cosmetic, not avoided" — all three clauses made false by this very task.
  Appending a true line beside a false one would leave the file asserting both, in a codebase
  whose stated convention treats comments as contracts and in a plan whose entire premise is
  that a comment which does not survive checking sends the next reader after the wrong rule.
- **Fix:** rewrote the bullet so it records the history ("was generated content when that was
  written"), the change, and the part that genuinely remains unprovable here — that happy-dom
  computes no accessible description, so the assertions pin the mechanism rather than the
  description. Net effect is still one bullet and still two items in that list.
- **Files modified:** `tests/ui/draft-panes.test.tsx`
- **Commit:** `652ac4f`

### Not Done, and Why

**`REQUIREMENTS.md` was not touched.** `DRFT-14` already reads `Complete` in the traceability
table at line 232 before this plan ran, and the plan states plainly that the requirement is
claimed as a re-touch of an already-SATISFIED requirement rather than as new coverage — so
there is no transition to record. Separately, `REQUIREMENTS.md:62` carries `DRFT-14` as an
unchecked box while line 232 calls it Complete. That inconsistency predates this plan and is
out of scope by the scope-boundary rule; it is recorded here rather than fixed.

`STATE.md` and `ROADMAP.md` were not touched either — this executor ran in a worktree and the
orchestrator owns those writes after the wave.

### Environment

The worktree had no `node_modules`, and **no junction, symlink or other reparse point was
created**. None was needed: the worktree lives at
`<main>/.claude/worktrees/agent-afe9c6fce687d2216`, so Node's ancestor resolution walks up to
the main checkout's `node_modules` on its own. `npm run verify`, `npx vitest` and `npx tsc` all
ran unmodified with the worktree as the working directory.

## Verification

`npm run verify` passes in full at the end of every task:

```
check:pure   — 0 violations in 15 file(s) under src/core
check:nohtml — 0 violations in 59 file(s) under src
Test Files   43 passed (43)
Tests        881 passed (881)
typecheck    clean
build        ✓ built in 257ms — 322 URLs (312 sprites, 6 data), 952.2 kB precached
```

Test count stays at 881, which is the correct signal: Task 2 strengthened two assertions inside
an existing test and added a third to the same test rather than adding a test. The pane file
holds at 22.

### What Is NOT Verified Here — and it is two of this plan's three real changes

happy-dom computes no layout, resolves no grid track and evaluates no media query. No test in
this repository can see either of the following, and writing one that appeared to would be
worse than writing none:

- **The hover response on the inert control.** That `.pane__button:hover:not([aria-disabled='true'])`
  leaves the mid-draft `Expand the pool` visually unchanged under the pointer while the live
  `Expand the draft board` still lights up.
- **The chrome at a viewport narrow enough that the button and its reason cannot share a row.**
  That it wraps to a second line with the button still on screen, rather than pushing the button
  past the start edge — and that `min-height` still holds the row to exactly one target at every
  width where the row does fit.

A third, unchanged by this plan but adjacent to it: that the panes still align in every state
after these edits, which is the layout a host signed off on under 02-10.

## Flagged for Plan 02-13, by Name

Two things a human has to look at on a real screen:

1. **The hover response on the inert pool expand.** Mid-draft, hover `Expand the pool` — its
   background must not change, and `cursor: not-allowed` must be the only signal. Hover
   `Expand the draft board` in the same session as the control: it must still light up.
2. **The chrome at a narrow viewport.** Below 80rem, or at large text, narrow until the button
   and `— Available once the draft is complete` cannot share a row. The button must remain fully
   on screen on a second line. Nothing may overflow the start edge, and the draft shell must not
   become horizontally scrollable.

## Threat Model Confirmation

| Threat ID | Disposition | Status |
|-----------|-------------|--------|
| T-02-24 | mitigate (stay closed) | Untouched. `view-prefs.ts` and `app.tsx` are absent from the diff, and both pinning tests in `draft-panes.test.tsx` are byte-identical. |
| T-02-12-01 | mitigate | The false "pressable" hover signal is gone from the refused control. The refusal itself is still the handler's early return, not styling, so no stylesheet edit can grant the action. |
| T-02-12-02 | mitigate | `flex-wrap: wrap` declared; `min-height` retained as a floor. Confirmation that it behaves as reasoned is 02-13's, per the section above. |
| T-02-12-03 | accept | Unchanged. The reason and its separator are static UI constants — no tournament data, no player name, no interpolation. |
| T-02-12-04 | mitigate | The separator is a text child of a JSX element. `check:nohtml` reports 0 violations across 59 files. |
| T-02-12-SC | not applicable | Nothing installed. `package.json` and `package-lock.json` untouched. |

## Threat Flags

None. No new endpoint, auth path, file access pattern or schema change — this plan changed two
CSS declarations, moved a separator into markup, and edited two planning documents.

## Known Stubs

None.

## Self-Check: PASSED

- `src/ui/components/SplitPanes.css` — FOUND
- `src/ui/components/SplitPanes.tsx` — FOUND
- `tests/ui/draft-panes.test.tsx` — FOUND
- `.planning/phases/02-host-configured-draft-night/02-UI-SPEC.md` — FOUND
- `.planning/phases/02-host-configured-draft-night/deferred-items.md` — FOUND
- `.planning/phases/02-host-configured-draft-night/02-12-SUMMARY.md` — FOUND
- Commit `2cb69d8` — FOUND
- Commit `652ac4f` — FOUND
- Commit `f87e2eb` — FOUND
