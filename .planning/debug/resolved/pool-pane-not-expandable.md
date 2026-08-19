---
status: resolved
trigger: "there is no way to expand the pool pane, but there is one for the draft board"
created: 2026-08-14T21:17:02Z
updated: 2026-08-19T00:00:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: CONFIRMED — the absent pool expand control is intended, specified three times, and implemented exactly as planned. The code has no defect. The defect is at the spec/UX layer: the rule is enforced purely by omission, with no disabled control, no explanatory text and no announcement, which contradicts this same spec's stated convention for unavailable controls. A second, separate finding is that the UAT truth statement for test 9 was written from the unscoped D-18/D-19 wording and is stale.
test: (done) Read the spec, plan, implementation and tests; then ran `npx vitest run tests/ui/draft-panes.test.tsx`.
expecting: (met) `poolExpandable` proved to be `complete` and nothing else; the spec forbids the control mid-draft in two independent sections; the plan's own verification demands ZERO `Expand the pool` buttons mid-draft; and a passing test asserts the host's exact observation as correct.
next_action: None — diagnosis complete, `goal: find_root_cause_only`. Return ROOT CAUSE FOUND to the orchestrator. Do NOT fix; a gap-closure plan owns the remedy, and that remedy must NOT be "render the button" (see Resolution.constraints).

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: |
  During a draft, you can switch which pane is expanded, and that choice survives a page reload.
  (UAT test 9: with a valid config, `Start draft` leaves the form and shows the draft screen: pool
  on one side, board on the other. The board has a cell per player per round. The turn banner names
  whose pick it is, and the empty board names the first picker. You can switch which pane is
  expanded, and that choice survives a page reload.)
actual: "there is no way to expand the pool pane, but there is one for the draft board"
errors: none reported
reproduction: Test 9 in `.planning/phases/02-host-configured-draft-night/02-UAT.md`. Start a draft with a valid config, look at the two-pane draft screen.
started: Discovered during UAT of Phase 2, at commit `09d3d72`. Everything else on the draft screen passed.

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: "The pool expand button is missing because of a rendering/CSS fault — a control that should be there fails to paint."
  evidence: "`src/ui/components/SplitPanes.tsx:114-125` renders the expand button only when `!isFullWidth && expandable`, and `src/app.tsx:501` passes `poolExpandable = complete`. The button is never constructed mid-draft, so there is nothing for CSS to hide. `tests/ui/draft-panes.test.tsx:251` asserts its absence and passes."
  timestamp: 2026-08-14T21:29:00Z

- hypothesis: "`poolExpandable` depends on player count or pool size, and the host hit an edge case an ordinary 4-8 player draft would not."
  evidence: "`src/app.tsx:501` is `const poolExpandable = complete;` and `src/app.tsx:478` is `const complete = state !== null && selectIsComplete(state);`. Draft completeness is the only input. No player count, pool size, viewport, density or config value is read. Every 4-8 player draft hits this for its entire duration."
  timestamp: 2026-08-14T21:24:00Z

- hypothesis: "The two coercions (view-prefs union check and the app.tsx `pool` → `split` force) conflict and one of them wrongly suppresses the control."
  evidence: "They operate on different things and do not interact. `src/adapters/view-prefs.ts:94` validates the STORED value's union membership; `src/app.tsx:519` scopes the RENDERED value. Neither touches button rendering — that is governed solely by the `poolExpandable` prop. `tests/ui/draft-panes.test.tsx:383` shows a stored `pool` is honoured once `complete` is true, proving neither coercion is stuck on."
  timestamp: 2026-08-14T21:29:00Z

- hypothesis: "The executor deviated from 02-06-PLAN.md."
  evidence: "`02-06-PLAN.md:672` prescribes `poolExpandable={complete}` verbatim and `:738` demands zero `Expand the pool` buttons mid-draft as a verification assertion. The code matches both exactly."
  timestamp: 2026-08-14T21:27:00Z

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-08-14T21:17:02Z
  checked: `.planning/debug/` for an existing knowledge base
  found: Directory did not exist; no `knowledge-base.md`.
  implication: No prior-pattern shortcut available. Investigate from first principles.

- timestamp: 2026-08-14T21:22:00Z
  checked: `.planning/phases/02-host-configured-draft-night/02-UI-SPEC.md:104-124`, section "A tension in the locked set, resolved here"
  found: |
    The spec declares the asymmetry explicitly. It records that D-18/D-19 lock "either pane
    expandable to full width", that ROADMAP Phase 2 criterion 5 requires the board visible
    "at every moment", and that `pool-full` "puts the board behind a toggle". Its resolution
    table (line 116) reads: "Draft screen, draft in progress | `split` and `board-full` only.
    The pool pane's expand button is **not rendered.**" Line 117 grants all three states to
    the completed-draft screen. Lines 120-121: "If the persisted value is `pool-full` when a
    draft screen mounts, it is **coerced to `split`** and the coercion is silent."
  implication: |
    The missing control is INTENDED, not emergent. The behaviour the host reported is the
    specified behaviour. This is not an implementation defect — investigation must pivot to
    whether the absence is communicated.

- timestamp: 2026-08-14T21:23:00Z
  checked: `02-UI-SPEC.md:727-732`, the pool pane surface contract
  found: |
    Restates the same rule at the surface level: Row 1 carries "the expand button
    (**not rendered while a draft is in progress** — see §A tension in the locked set)."
  implication: The rule is stated twice in the spec, in two independent sections. Not a slip.

- timestamp: 2026-08-14T21:24:00Z
  checked: `src/app.tsx:478`, `src/app.tsx:501`, `src/app.tsx:519`
  found: |
    `const complete = state !== null && selectIsComplete(state);` (478)
    `const poolExpandable = complete;` (501)
    `const pane: PaneState = storedPane === 'pool' && !poolExpandable ? 'split' : storedPane;` (519)
    `poolExpandable` has exactly ONE input: draft completeness. It does not read player count,
    pool size, viewport, density, or config. It is `false` for the entire duration of every
    draft and becomes `true` only when the last pick lands.
  implication: |
    Answers the lead's question directly. Player count and pool size are irrelevant — the host
    did not hit an edge case. An ordinary 4-8 player draft NEVER renders the pool expand button
    at any point before the draft completes. The implementation matches the spec exactly.

- timestamp: 2026-08-14T21:25:00Z
  checked: `src/ui/components/SplitPanes.tsx:114-125`, `:141-160`
  found: |
    The expand button renders only when `!isFullWidth && expandable`. The pool side is passed
    `poolExpandable` (line 149); the board side is passed the literal `true` (line 159). So
    during a draft the board pane shows `Expand the draft board` and the pool pane shows an
    EMPTY `pane__chrome` div — no control, no text, no explanation. A collapsed side swaps in
    a restore button (`Show the pool` / `Show the draft board`), so `board-full` does give the
    host a way back to `split`.
  implication: |
    Confirms the reported observation precisely and exactly as designed. The host CAN toggle
    between `split` and `board-full`; what does not exist is any path to `pool-full`. The pool
    pane's chrome slot is rendered but empty — the absence has no visible or accessible marker.

- timestamp: 2026-08-14T21:26:00Z
  checked: `.planning/ROADMAP.md:104` — Phase 2 success criterion 5
  found: |
    "At every moment the shared screen shows whose turn it is, the full players × rounds board
    as pick history, and each player's team as it fills; every destructive action confirms
    before committing."
  implication: |
    The constraint driving the scoping rule is real and roadmap-level, not a local invention.
    `pool-full` collapses the board to a 44px strip, which is "behind a toggle". Any remedy that
    simply renders the pool expand button mid-draft would regress criterion 5.

- timestamp: 2026-08-14T21:27:00Z
  checked: `.planning/phases/02-host-configured-draft-night/02-06-PLAN.md:245-249`, `:555-556`, `:617-620`, `:672`, `:738`, `:1168`
  found: |
    The plan specifies the behaviour end to end, including a verification assertion at `:738`:
    "with `pane: 'split'` and a draft in progress, exactly one button with the accessible name
    `Expand the draft board` is present and zero with `Expand the pool`." Line 672 prescribes
    `poolExpandable={complete}` verbatim. T-02-24 at `:1168` treats the `pool` → `split`
    coercion as a security mitigation with two independent layers.
  implication: |
    The implementation did not drift from the plan. Spec, plan, code and tests all agree. Any
    remaining defect is definitionally upstream of the executor.

- timestamp: 2026-08-14T21:29:00Z
  checked: |
    Ran `npx vitest run tests/ui/draft-panes.test.tsx`. Inspected
    `tests/ui/draft-panes.test.tsx:251-257`, `:356-381`, `:383-391`.
  found: |
    18/18 pass. The test at `:251` is named "offers only the board expand while a draft is
    running" and asserts, against a real DOM:
      expect(buttonNamed('Expand the draft board')).toBeDefined();
      expect(buttonNamed('Expand the pool')).toBeUndefined();
    The test at `:383` proves the control returns once the draft is over.
  implication: |
    Direct observation, not inference. The exact condition the host reported as a bug is pinned
    green as the correct behaviour. This is the strongest possible evidence that the report is
    a spec/expectation mismatch rather than a code fault.

- timestamp: 2026-08-14T21:30:00Z
  checked: `02-UI-SPEC.md:787-790`, `:631-633`, `:696-699` — the spec's own conventions for unavailable controls
  found: |
    The same document states the opposite principle three times for other controls:
      - `Match all selected types`: "`aria-disabled="true"` ... but **always rendered** — a
        control that appears and disappears is worse on a shared screen than one that is
        predictably inert." (`:787-790`)
      - Ban mode `Blind`/`Snake`: "rendered, `disabled`, `aria-disabled="true"`, each with the
        visible suffix `— Not yet available`" (`:631-633`)
      - Blocked `Start draft`: kept focusable specifically because "a keyboard user could never
        reach the explanation — and the explanation is the whole point of RULE-07."
  implication: |
    The pool expand button is the one unavailable control in this phase that is handled by
    silent omission, and it does precisely what `:789-790` names as the worse option — it
    appears and disappears, materialising in the same chrome slot the moment the last pick
    lands. This is an internal inconsistency in the spec, which is why the host's report is a
    genuine finding rather than a misreading.

- timestamp: 2026-08-14T21:31:00Z
  checked: `src/ui/components/SplitPanes.css:71-75`
  found: |
    `.pane__chrome { flex: none; display: flex; justify-content: flex-end; }` — no `min-height`.
    With no button inside, the pool pane's chrome collapses to zero height while the board
    pane's holds a 44px button.
  implication: |
    Cosmetic corollary: the two panes' content starts are vertically misaligned by ~44px during
    a draft. That misalignment is itself a signal that reads as "something failed to render"
    rather than "this is deliberate", reinforcing the host's interpretation.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: |
  NOT AN IMPLEMENTATION BUG. The behaviour is correct per spec, plan and tests.

  The pool pane's expand button is deliberately not rendered while a draft is in progress.
  `src/app.tsx:501` sets `const poolExpandable = complete;` — the button exists only once the
  draft is over. This enacts `02-UI-SPEC.md:104-124` §"A tension in the locked set, resolved
  here", which declines part of D-18/D-19 ("either pane expandable to full width") because
  `pool-full` collapses the board to a 44px strip and ROADMAP criterion 5 (`.planning/ROADMAP.md:104`)
  requires the board visible "at every moment". `02-06-PLAN.md:738` makes the absence a
  verification assertion, and `tests/ui/draft-panes.test.tsx:251` pins it green.

  The actual defect has two parts, both upstream of the code:

  (1) THE RULE HAS NO AFFORDANCE. The spec mandates enforcement by pure omission — the pool
      pane's `pane__chrome` slot renders empty (`SplitPanes.tsx:105-126`), with no disabled
      control, no explanatory text and no announcement, and the persisted-value coercion is
      explicitly silent (`02-UI-SPEC.md:121`, `app.tsx:504-508`). This contradicts the same
      spec's stated convention for every other unavailable control in the phase: `Match all
      selected types` is "**always rendered**" because "a control that appears and disappears
      is worse on a shared screen than one that is predictably inert" (`02-UI-SPEC.md:787-790`);
      `Blind`/`Snake` ban modes render disabled with the visible suffix `— Not yet available`
      (`:631-633`); a blocked `Start draft` stays focusable so the explanation is reachable.
      The pool expand button does exactly what `:789-790` names as the worse option — it
      appears and disappears, materialising in the same slot when the last pick lands. A host
      cannot distinguish "deliberately unavailable" from "broken", which is precisely what
      happened.

  (2) THE UAT TRUTH STATEMENT IS STALE. Test 9's truth — "You can switch which pane is
      expanded" — is D-18/D-19's unscoped wording, which `02-UI-SPEC.md:116` partially
      declined months earlier. Mid-draft the honest statement is "you can expand the draft
      board and restore it; the pool expands only once the draft is complete." The UAT
      document never absorbed the spec resolution, so the test asked the host to verify
      something the phase deliberately does not do.

constraints_on_any_fix: |
  The remedy must NOT be "render the pool expand button mid-draft". That would let `pool-full`
  hide the board, regressing ROADMAP criterion 5 and reopening T-02-24, whose mitigation is
  two independent coercions (`02-06-PLAN.md:1168`). Preserve `poolExpandable = complete` and
  both coercions; change what the host is TOLD, not what the host is ALLOWED to do.

fix: (not applied — goal is find_root_cause_only; a gap-closure plan owns the remedy)
verification: (not applicable)
files_changed: []
