---
phase: 02-host-configured-draft-night
reviewed: 2026-08-15T17:12:49Z
depth: standard
scope: gap-closure (plans 02-11 and 02-12)
supersedes_note: "Full-phase review preserved in git history at commit abd8b89"
files_reviewed: 3
files_reviewed_list:
  - src/ui/components/SplitPanes.tsx
  - src/ui/components/SplitPanes.css
  - tests/ui/draft-panes.test.tsx
findings:
  critical: 0
  warning: 5
  info: 6
  total: 11
status: issues_found
---

# Phase 02: Code Review Report (gap-closure scope)

**Reviewed:** 2026-08-15T17:12:49Z
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Scope of this report — read this first

**This report covers the 02-11 / 02-12 gap closure only: three files.** It is not a review of
phase 02 as a whole.

Phase 02 was reviewed in full earlier; that report — status `issues_found`, carrying CR-01 and
the review warnings — is preserved in git history at commit **`abd8b89`**
(`docs(02): add code review report`) and can be recovered with
`git show abd8b89:.planning/phases/02-host-configured-draft-night/02-REVIEW.md`. Plans 02-11 and
02-12 were written to close those findings; `git diff 2acdaff..HEAD` over non-planning paths is
exactly the three files listed above. This file overwrites that report at the same path. A
reader must not conclude that phase 02 was only ever reviewed across three files.

No `<structural_findings>` pre-pass was supplied for this run, so there is no structural section.

## Summary

The two fixes are sound. I verified them by construction rather than by reading the doc blocks:

- **CR-01 (node reuse) is genuinely fixed, in both directions.** A temporary instrumented probe
  (written to the scratchpad, run, deleted — the working tree is unchanged) confirmed that the
  pool's chrome button is the *same DOM node* across `split → board` **and** `board → split`,
  and that `aria-disabled` and `aria-describedby` are correctly *removed* when that reused node
  becomes the restore control and re-applied when it becomes the expand again. Stale ARIA on a
  reused node is the characteristic failure of this kind of fix; it is not present.
- **The `PaneAvailability` union really is uncompilable in the invalid pair.** Type-probed under
  the project's own flags: `{ available: false }` errors (TS2322), `{ available: true, reason }`
  errors on excess-property checking (TS2353), and a `boolean`-widened `available` errors
  (TS2322). No escape via optional field, default, or inferred helper return.
- **The inert control is refused in code, not by attribute.** `if (isInert) return` precedes
  every write, and the suite pins it on the storage side, which is the assertion that actually
  distinguishes "refused" from "coerced back by the parent".
- **`useLayoutEffect` ordering is correct.** Preact 10.29.8 applies the ref queue in
  `commitRoot` *before* `options._commit` flushes layout effects (`preact/src/diff/index.js:364`),
  so `collapsedControlRef.current` is always the freshly attached successor when the effect reads
  it. The two non-activation transitions the brief asked about — the stored-preference restore on
  mount and the mid-draft coercion — both leave `activatedControlRef` null and move no focus;
  probed and confirmed.
- **The CSS `flex-wrap` cannot break the 02-10 alignment.** Above the `80rem` query the pool pane
  is ≥ ~725 CSS px against a button + reason row of ~370 px, so the row never wraps; below it the
  panes are stacked grid *rows*, so chrome alignment between them is not a thing that exists.

What is left is one behavioural regression the fix introduced (WR-01), one accessibility
interaction nobody has checked (WR-02), two test gaps where the new tests pass for a weaker
reason than they appear to (WR-03, WR-04), and a set of load-bearing comments that state things
CSS and browsers do not actually do (WR-05, IN-02, IN-06). In a codebase where the comment *is*
the specification, the last group is not cosmetic.

`npm run typecheck` is clean and all 881 tests across 43 files pass.

## Narrative Findings (AI reviewer)

### Critical

None. Nothing in these three files is an incorrect-behaviour, security, or data-loss defect.
(The workflow treats `critical:` and `blocker:` as tier-equivalent; the count above is zero
under either label.)

### Warnings

#### WR-01: The focus handoff turns a held Enter key into an unbounded pane oscillation

**File:** `src/ui/components/SplitPanes.tsx:192-200` (effect) with `:306-326` (click handler)
**Severity:** WARNING

**Issue.** The effect hands focus to the collapsed strip's restore control, which is itself
activated by the same key that caused the handoff. In Chrome and Firefox, holding `Enter` on a
focused `<button>` auto-repeats the activation, so each repeat lands on the control focus was
just moved to. Before 02-11 focus fell to `<body>` and repeats did nothing; now they drive a
four-state cycle. Demonstrated on a completed draft with a throwaway probe (each line is one
activation of whatever currently holds focus):

```
start  focus="Expand the draft board"  pane=split
step0  pane=board  focus="Show the pool"          live="Draft board expanded to full width."
step1  pane=split  focus="Expand the pool"        live="Pool and draft board shown side by side."
step2  pane=pool   focus="Show the draft board"   live="Pool expanded to full width."
step3  pane=split  focus="Expand the draft board" live="Pool and draft board shown side by side."
step4  pane=board  focus="Show the pool"          ... (cycles indefinitely)
```

Every step also runs `handlePaneChange` → `saveViewPrefs` → `localStorage.setItem`, so a
one-second hold is roughly 15–30 storage writes and 15–30 live-region rewrites, and the host
lands on whichever pane the key release happened to fall on. Mid-draft the cycle self-terminates
after two steps only because the pool expand is inert — that is luck, not a guard.

**Fix.** Refuse repeat activations at the source; the handoff itself is correct and should stay.

```tsx
<button
  type="button"
  class="pane__button"
  // A held Enter auto-repeats the activation, and 02-11's handoff puts the next
  // control under the same key. One press, one pane change.
  onKeyDown={(event) => {
    if (event.key === 'Enter' && event.repeat) event.preventDefault();
  }}
  onClick={/* unchanged */}
>
```

Pin it with a test that activates the focused element three times in a row on a completed draft
and asserts the pane ended where one press would leave it.

---

#### WR-02: The pane announcement and the focus move are committed together, and the focus move will preempt it

**File:** `src/ui/components/SplitPanes.tsx:143-146` (`change`) with `:192-200` (effect)
**Severity:** WARNING

**Issue.** `change()` writes `announce(message)` and, in the same commit, the layout effect moves
focus to a different control. A focus change causes assistive technology to speak the newly
focused control immediately; a `aria-live="polite"` update queued in the same tick is routinely
dropped or preempted by that speech. The two expand transitions — the only ones that move focus —
are therefore the two where `Pool expanded to full width.` / `Draft board expanded to full width.`
is most likely never heard. That announcement is the phase's stated mechanism for telling a
screen-reader user what changed, and 02-11 changed the conditions it operates under without
re-checking it.

02-13's human checkpoint does not cover this. Its `provides` list is focus visibility, the hover
exclusion, the 02-10 alignment verdict and the reason line — nothing about whether the
announcement is still spoken.

**Fix.** Check it with a real screen reader (NVDA/VoiceOver) before treating WR-08 as closed. If
the message is preempted, the honest resolution is to stop announcing on the two transitions that
move focus — the restore control's own name (`Show the pool`) already states the new state on
focus — rather than to keep an announcement that is emitted and swallowed. Record whichever way
it goes in the component's doc block, because the next reader will otherwise re-derive it.

---

#### WR-03: The split→expanded focus test passes without proving node reuse, and the effect masks a remount there

**File:** `tests/ui/draft-panes.test.tsx:466-478`
**Severity:** WARNING

**Issue.** `keeps focus on the restore control across the collapse-to-split change` (`:448-464`)
pins node identity with `expect(buttonNamed('Expand the pool')).toBe(restore)` — a real pin, and
it does catch a reintroduced two-shape chrome in the `board → split` direction. The opposite
direction has no such pin. `moves focus to the collapsed pane's restore control when a pane
expands` asserts only that focus lands on *a* button named `Show the pool`. If Preact remounted
the pool's button on `split → board`, the freshly mounted node would receive
`collapsedControlRef` and the effect would focus it, and this test would still pass. The focus
effect is precisely the thing that hides the regression CR-01 was about.

(Reuse in that direction *is* correct today — probed, `reused-node=true` — so this is a coverage
defect, not a live bug.)

**Fix.** Capture the node before the change and compare identity, exactly as the sibling test does:

```tsx
it("moves focus to the collapsed pane's restore control when a pane expands", async () => {
  await reachDraft();

  const poolControl = buttonNamed('Expand the pool');
  await focusAndClick(buttonNamed('Expand the draft board'));

  const restore = buttonNamed('Show the pool');
  // Node IDENTITY in this direction too — otherwise the handoff below would pass
  // just as happily against a button Preact had destroyed and recreated.
  expect(restore).toBe(poolControl);
  expect(document.activeElement).toBe(restore);
});
```

---

#### WR-04: Nothing asserts that the reused button sheds its inert ARIA state when it becomes the restore

**File:** `tests/ui/draft-panes.test.tsx:407-437`
**Severity:** WARNING

**Issue.** 02-11's whole change is that one DOM node now serves as both the inert
`Expand the pool` and the live `Show the pool`. The characteristic failure of node reuse is an
attribute that gets set but never cleared — here, a restore control left announcing itself as
`aria-disabled="true"` and pointing `aria-describedby` at an id that no longer exists. The
collapse test checks `chrome.childElementCount === 1` and the absence of `.pane__reason`; it
never looks at the button's attributes. Behaviour is currently correct (probed: both attributes
are removed on collapse and restored on the way back), and the pane-change assertion would catch
a *functional* regression, but a control that works while announcing itself disabled would ship
green.

**Fix.** Two lines in the existing test, next to the child-count assertions:

```tsx
const restore = buttonNamed('Show the pool');
// The same node was the inert expand a render ago. Reuse means these have to be
// CLEARED, not merely not-set.
expect(restore?.hasAttribute('aria-disabled')).toBe(false);
expect(restore?.hasAttribute('aria-describedby')).toBe(false);
```

---

#### WR-05: The `flex-wrap` justification states behaviour CSS does not have

**File:** `src/ui/components/SplitPanes.css:88-96`
**Severity:** WARNING

**Issue.** The comment is the specification for this rule, and two of its load-bearing claims are
wrong:

1. *"This row holds a button and a ~38-character label, **neither of which shrinks below its
   content**"* — both shrink. `flex-shrink` defaults to `1` and a flex item's automatic minimum
   size is `min-content`, and neither `<button>` nor `<span>` opts out. The start-edge overflow
   the rule is said to prevent therefore requires the sum of *min-content* widths (roughly
   `Expand` + `complete`, well under 150 px) to exceed the row — which no reachable viewport
   produces.
2. *"At every width where the row fits, wrapping changes nothing; it only changes the case that
   was broken"* — there is a band, between "max-content no longer fits" and "min-content no
   longer fits", where the old rule shrank both items and wrapped the reason's text *beside* the
   button, and the new rule breaks the line and puts the reason *below* it. That band is
   reachable (roughly < 400 CSS px of pane width, i.e. a phone in the single-column query) and it
   was not broken before.

The rule itself is harmless and 02-13's host confirmed the resulting line reads correctly, so
this is a documentation defect rather than a layout one — but a future reader deciding whether
`flex-wrap` may be removed will decide it on these two sentences.

**Fix.** Replace the two claims with what is actually true and testable: the row wraps only below
roughly 400 px of pane width, that width only occurs inside the `max-width: 80rem` query where
the panes are stacked rows and chrome alignment is irrelevant, and `flex-wrap` is kept because a
`justify-content: flex-end` row that does overflow does so past the start edge, which no scroll
can reach. Keep the `min-height`-is-a-floor sentence; that one is correct.

### Info

#### IN-01: `SideOptions.key` is a Preact-reserved prop name

**File:** `src/ui/components/SplitPanes.tsx:116`, used at `:239-241`, `:369`, `:382`
**Issue:** `side()` is a plain function today, so `key` is an ordinary field and nothing is wrong.
The moment anyone promotes `side()` to a component — which the surrounding doc block invites by
calling it "generic" — `<Side key="pool" …>` hands `key` to the vnode and the component receives
`undefined`, producing `undefined-expand-reason` ids and an `isFullWidth` that is never true. The
failure is silent and the compiler does not see it.
**Fix:** Rename the field to `side` or `paneKey`. Three call-site edits and one interface edit.

---

#### IN-02: The hover-exclusion comment cites three precedents, and none of them is this pattern

**File:** `src/ui/components/SplitPanes.css:168-171`
**Issue:** The line numbers are right; the characterisation is not. `TopBar.css:70` is
`.top-bar__button:hover:not(:disabled)` — the *native* attribute, which is the selector this
comment argues against. `SegmentedControl.css:105` is
`.segmented__input:disabled + .segmented__label:hover { background: var(--color-surface); }` —
an override that re-asserts the base background, not a `:not()` exclusion. `app.css:228` excludes
by class (`:not(.landing__action--primary)`), nothing to do with a disabled state. And
`FeasibilityBar`, which this file cites throughout as *the* `aria-disabled` precedent, carries no
hover rule at all. So `:hover:not([aria-disabled='true'])` is a new pattern introduced here, and
the repo now has three different mechanisms for one visual state — which is the same "two
conventions for one pattern" finding WR-03 originally raised, one level down.
**Fix:** Say that this is the first `[aria-disabled]` hover exclusion in the repo and why the
native-attribute precedents cannot be reused here, or apply the pattern to
`FeasibilityBar.css` in the same pass so the claim becomes true.

---

#### IN-03: The test file's "what this cannot prove" list gained focus but not hover

**File:** `tests/ui/draft-panes.test.tsx:22-40`
**Issue:** The header is explicit that an assertion which only appears to cover something is
worse than none, and it enumerates layout, the accessible description, and (new under 02-11)
pointer-path focus. 02-12 added `.pane__button:hover:not([aria-disabled='true'])`, which
happy-dom cannot evaluate for exactly the same reason it cannot evaluate the media query — and
the list does not mention it. It is genuinely covered, by 02-13's human checkpoint; the omission
just leaves the next reader unable to tell "verified elsewhere" from "not verified".
**Fix:** Add a fourth bullet naming the hover rule and pointing at 02-13, matching how the
`min-height` bullet points at 02-10.

---

#### IN-04: Only one of the two non-activation transitions carries a focus pin

**File:** `tests/ui/draft-panes.test.tsx:534-559`
**Issue:** `restores the stored pane on the first render` earned
`expect(document.activeElement).toBe(document.body)` at `:529` with a comment explaining that the
handoff must fire for a host who pressed a button and for nobody else. The mid-draft coercion is
the other member of that set and got no such pin. Confirmed correct by probe (the coercion moves
no focus, on mount and on the coercion *lift* when a final pick completes the draft), so this is
a missing pin rather than a bug.
**Fix:** Add the same one-line assertion to `is forced to split mid-draft, silently`.

---

#### IN-05: The handoff silently no-ops when there is no collapsed sibling

**File:** `src/ui/components/SplitPanes.tsx:199`
**Issue:** `collapsedControlRef.current?.focus()` is reached only when the activated control has
left the document, i.e. exactly when focus is already on `<body>` and something must catch it. If
`current` is null at that moment the optional chain swallows it and focus stays on `<body>` —
the CR-01 symptom, restored, with nothing recording that it happened. That state is unreachable
today (every expanded pane has a collapsed sibling), which is precisely why a later change to
the membership rule could reach it without anyone noticing.
**Fix:** Give the effect a fallback its own precondition can guarantee — focus the collapsed
`<section>` via a `tabIndex={-1}` ref, or at minimum assert the invariant in a test that
enumerates the three pane states and requires a focusable control in each.

---

#### IN-06: The `activeElement` guard is described as excluding pointer users; on the dominant platforms it does not

**File:** `src/ui/components/SplitPanes.tsx:314-318`
**Issue:** The comment justifies the guard as protecting "a pointer user who clicked without
focusing" from having focus yanked. In Chrome, Firefox and Edge on Windows and Linux, `mousedown`
on a `<button>` focuses it, so `document.activeElement === button` is true for mouse users too
and they get the handoff as well. The guard actually excludes exactly two cases: Safari (which
does not focus a clicked button) and programmatic `.click()`. The resulting behaviour is fine —
a programmatically moved focus after a mouse click does not match `:focus-visible`, so no ring
appears — but the comment names the wrong population, and the header at
`tests/ui/draft-panes.test.tsx:36-40` repeats it.
**Fix:** State the guard's real scope: it exists so an activation that never focused the control
(Safari's pointer path, and any programmatic `click()`) does not move focus somewhere the host
never put it.

---

## What I could not evaluate

Stated rather than implied, in the style this repo already uses:

- Whether the polite announcement survives the focus move (WR-02) needs a real screen reader.
- Whether `Enter` auto-repeat behaves as described (WR-01) was reproduced through repeated
  activation of the focused element, not through real key events; the browser-level premise
  (Enter activates on keydown, keydown auto-repeats) is standard but unverified here.
- All rendered geometry — the wrap threshold in WR-05, the `min-height` alignment, the contrast
  figures recorded at `SplitPanes.css:196-205` — is invisible to happy-dom and belongs to the
  human checkpoints, as the test file itself says.

---

_Reviewed: 2026-08-15T17:12:49Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
_Scope: 02-11 / 02-12 gap closure — prior full-phase review at commit abd8b89_
