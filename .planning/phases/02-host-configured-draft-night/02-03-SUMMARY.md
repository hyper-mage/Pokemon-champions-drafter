---
phase: 02-host-configured-draft-night
plan: 03
subsystem: ui-tokens-and-pool-density
tags: [design-tokens, type-palette, wcag-contrast, density, segmented-control, native-radio, localStorage, preact]

requires:
  - 01-05 (tokens.css, app shell, LiveRegion, PoolGrid/MonCard, check:nohtml)
  - 01-03 (RosterEntry.types and BaseStats; the committed roster snapshot)
  - 01-04 (spriteMeta.byRosterId; spriteMissing)
  - 01-07 (persistence.ts — the storage-key convention and the fail-silent posture)
provides:
  - src/ui/tokens.css — 18 type hues, two inks, --pill-h, and both amended Phase 1 contracts
  - src/ui/type-codes.ts — the explicit 18-entry TYPE_CODES map and typeDisplay
  - src/ui/components/TypePill — one type as a hue with its text inside it
  - src/ui/components/StatBlock — Total always, six stats behind showAll
  - src/ui/components/SegmentedControl — fieldset + native radios; the shape six surfaces reuse
  - src/adapters/view-prefs.ts — champions-drafter:view, density and pane, fail-silent
  - density-aware MonCard and the Display density control on PoolGrid
affects: [02-04, 02-05, 02-06, 02-07, 02-08, 02-09, 03]

tech-stack:
  added: []
  patterns:
    - "A segmented control is a fieldset of visually-hidden native radios with styled labels; never buttons with hand-rolled ARIA state"
    - "The radio is CLIPPED, never removed from rendering — a radio outside the box tree is not focusable and the whole group stops working while still looking correct"
    - "The focus ring reaches a clipped input's label through `input:focus-visible + label`, declared byte-identically to app.css's global ring"
    - "Density is one attribute on the pool pane root redeclaring three tokens; the board cannot inherit it because it is not a descendant"
    - "tokens.css declares values and never styles an element, so the [data-density] selectors live in PoolGrid.css"
    - "View preferences fail to their defaults for every failure mode without distinguishing between them, and never escalate to the draft-saving warning"
    - "A cell height is a floor (min-height), not a fixed height, once any row inside it can wrap"
    - "Closed enumerated sets are written out, never derived from a name string, even when the derivation would be correct today"
    - "Ink is a role, not a coincidence of value: --type-ink-dark is not aliased to --color-bg"
    - "Explanatory comments describe forbidden markup rather than quoting it, so text-based CI checks cannot match their own documentation"

key-files:
  created:
    - src/ui/type-codes.ts
    - src/ui/components/TypePill.tsx
    - src/ui/components/TypePill.css
    - src/ui/components/StatBlock.tsx
    - src/ui/components/StatBlock.css
    - src/ui/components/SegmentedControl.tsx
    - src/ui/components/SegmentedControl.css
    - src/adapters/view-prefs.ts
    - tests/ui/type-codes.test.ts
    - tests/adapters/view-prefs.test.ts
    - tests/ui/pool-density.test.tsx
  modified:
    - src/ui/tokens.css
    - src/ui/components/MonCard.tsx
    - src/ui/components/MonCard.css
    - src/ui/components/PoolGrid.tsx
    - src/ui/components/PoolGrid.css

key-decisions:
  - "Both broken Phase 1 token contracts were rewritten in the same commit that broke them, so no stale contract comment ever existed in the repository's history"
  - "--text-label was removed from the density-varying set, which is stricter than Phase 1 rather than looser and makes sub-14px text structurally impossible"
  - "The [data-density] selectors live in PoolGrid.css, not tokens.css, because tokens.css declares values and never styles an element"
  - "loadViewPrefs discards BOTH fields when either is unrecognised — one rule, no partial state to reason about"
  - "saveViewPrefs deliberately does not raise the persistence saving-blocked signal; borrowing that banner would train a host to dismiss the one warning that matters"
  - "PoolGrid re-reads the stored preferences before writing a density, so the density control cannot clobber the pane preference stored beside it"
  - "The density is read in a useState initializer, not an effect, so no reload flashes the wrong layout"

patterns-established:
  - "Six SegmentedControl instances in this phase now have a working reference implementation and a required `name` prop that documents why it is required"
  - "A type hue never appears without its code or full name as real text inside the same element"

requirements-completed: [DRFT-05, DRFT-06, DRFT-14]

duration: 23min
completed: 2026-08-11
---

# Phase 2 Plan 03: Type Pills, Base Stats and the Three Densities Summary

**The pool now shows colour-coded typing and base stats, and the host switches between three display densities that change both the token scale and the card's content — a choice that survives a reload in `champions-drafter:view` and never touches the tournament document.**

## Performance

- **Duration:** 23 min
- **Started:** 2026-08-11T13:34Z
- **Completed:** 2026-08-11T13:57Z
- **Tasks:** 3 of 3
- **Files created/modified:** 16 (11 created, 5 modified)
- **Tests:** 424 passing, up from 385 — 39 added across three files

## Accomplishments

- **The two Phase 1 contracts this phase breaks are rewritten in the commit that breaks them.** `tokens.css` no longer claims the densities change four tokens, and no longer counts colour's reserved uses as three of three. Neither stale comment ever existed in the repository.
- **Eighteen type hues with every measured WCAG ratio recorded beside its token**, plus the two inks — and the note explaining why five fills sit at 2.48–2.97:1 against the surface and why SC 1.4.3 rather than 1.4.11 is the criterion that applies.
- **`SegmentedControl` landed against a real consumer**, not a hypothetical one. It is a genuine `fieldset` of native radios, so grouping, arrow keys, the single tab stop and the checked state cost nothing to maintain, and the five remaining instances in this phase inherit all of it.
- **A pool card is now readable across a room at any of three densities**, and the density cannot put text below 14px because the type scale was deliberately removed from the density-varying set.

## Task Commits

1. **Task 1: amend the token contract and land the 18-hue type palette** — `acf9df2` (feat)
2. **Task 2: SegmentedControl, StatBlock, and the view-preference adapter** — `b0878a5` (feat)
3. **Task 3: density-aware MonCard and the density control on the pool** — `4d055bd` (feat)

## Files Created/Modified

| File | What it does |
|------|-------------|
| `src/ui/tokens.css` | 18 `--type-*` hues + 2 inks with measured ratios; `--pill-h: 24px`; `--cell-min` 112→128px, `--cell-h` 144→188px; both amended contract comments |
| `src/ui/type-codes.ts` | The explicit 18-entry `TYPE_CODES` map and `typeDisplay`, which returns `null` rather than a partial entry |
| `src/ui/components/TypePill.tsx` / `.css` | One type as a pill; binds only two custom properties, both from the closed map |
| `src/ui/components/StatBlock.tsx` / `.css` | `Total {n}` always; six labelled stats as a description list behind `showAll` |
| `src/ui/components/SegmentedControl.tsx` / `.css` | Fieldset, legend, clipped native radios, styled labels; required `name` prop |
| `src/adapters/view-prefs.ts` | `champions-drafter:view`; `loadViewPrefs` never throws and never returns null, `saveViewPrefs` never escalates |
| `src/ui/components/MonCard.tsx` / `.css` | `density` prop, cumulative content, `height` → `min-height` |
| `src/ui/components/PoolGrid.tsx` / `.css` | `data-density` root, the `Display density` control, the three density blocks |
| `tests/ui/type-codes.test.ts` | 10 tests, `node` env, pinned against the real committed roster |
| `tests/adapters/view-prefs.test.ts` | 16 tests, every failure mode including T-02-11 and T-02-12 |
| `tests/ui/pool-density.test.tsx` | 23 tests, `happy-dom`, every bullet of the plan's `<behavior>` block |

## Decisions Made

- **`loadViewPrefs` discards both fields when either is unrecognised.** The plan's contract says "returns the defaults", singular. Salvaging the good field would create a partial state with no test that describes it, and the case it gives up on — a hand-edited key with exactly one field corrupted — costs one click to repair. Recorded in the function's own doc comment.
- **`PoolGrid` re-reads storage before writing a density.** `saveViewPrefs({ ...loadViewPrefs(), density: next })` rather than holding the pane in component state. The pane control does not exist yet (plan 02-06), and this means it will not need `PoolGrid` changed when it arrives. Covered by a test.
- **The `content-visibility` note lives in `PoolGrid.tsx`, not `MonCard.css`.** The plan asked for the escape-hatch note and its acceptance criteria simultaneously required `grep -c "content-visibility" MonCard.css` to return 0. `PoolGrid.tsx`'s doc block already carried the note from Phase 1, so it was extended there instead, with the new `min-height` conflict recorded in `MonCard.tsx`'s header.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The plan's type-token acceptance regex cannot match the two ink tokens**

- **Found during:** Task 1
- **Issue:** The criterion `grep -Ec -- "^\s+--type-[a-z]+:" src/ui/tokens.css` returns 20 (18 hues + 2 inks) is unsatisfiable as written. `--type-ink-dark` and `--type-ink-light` carry a hyphen after `--type-`, and `[a-z]+` followed by `:` can never match across it. The literal regex returns 18.
- **Fix:** Kept the token names, which are fixed verbatim by 02-UI-SPEC §Color and load-bearing for the "ink is a role, not a coincidence of value" rule. Ran the check as `^\s+--type-[a-z-]+:`, which returns **20** as the criterion intended.
- **Files modified:** none — the plan's verification expression was wrong, not the code
- **Verification:** `grep -Ec -- "^\s+--type-[a-z-]+:" src/ui/tokens.css` → `20`
- **Committed in:** `acf9df2`

**2. [Rule 1 - Bug] Two Task 3 acceptance criteria contradict each other**

- **Found during:** Task 3
- **Issue:** The plan requires `grep -c "min-height: var(--cell-h)" MonCard.css` to return 1 **and** `grep -c "height: var(--cell-h);" MonCard.css` to return 0. The string `min-height: var(--cell-h);` contains the substring `height: var(--cell-h);`, so satisfying the first guarantees failing the second.
- **Fix:** Implemented the intent — no fixed-height declaration on `--cell-h` survives — and verified it with the anchored form the criterion meant.
- **Files modified:** none — the plan's verification expression was wrong, not the code
- **Verification:** `grep -Ec '^\s*height: var\(--cell-h\);' src/ui/components/MonCard.css` → `0`; `grep -c 'min-height: var(--cell-h)'` → `1`
- **Committed in:** `4d055bd`

**3. [Rule 3 - Blocking] No `node_modules` in the worktree**

- **Found during:** setup, before Task 1
- **Issue:** A fresh git worktree has no `node_modules` (it is gitignored), so `vitest`, `tsc` and `vite` were all unavailable and no verification could run.
- **Fix:** Linked the main checkout's existing install with a Windows directory junction (`fs.symlinkSync(target, 'node_modules', 'junction')`). **No package was installed and no manifest was touched** — this is deliberately not a package-manager install, and re-downloading `pokemon-showdown` (144 MB, devDependency only) would have been the alternative.
- **Files modified:** none. `node_modules` is gitignored; `git diff --stat package.json` is empty and `package-lock.json` is untouched.
- **Verification:** `npm run verify` exits 0
- **Committed in:** n/a — no repository change

---

**Total deviations:** 3 auto-fixed (2 × Rule 1, 1 × Rule 3)
**Impact on plan:** None on scope. Two were errors in the plan's own grep expressions where the code was already correct; the third was environment setup. No requirement, interface or design decision changed.

## Issues Encountered

**Explanatory comments kept tripping the plan's text-based acceptance greps.** Six criteria (`aria-checked` → 0, `display: none` → 0, `slice|substring|substr` → 0, `<dl` → 1, `<fieldset`/`<legend`/`type="radio"` → 1 each, `Reserved use 3 of 3` → 0, `the densities change exactly four tokens` → 0) were initially failed not by the implementation but by doc comments that *quoted* the forbidden markup while explaining why it was forbidden.

Resolved by rewording every such comment to **describe** rather than quote — "a fieldset with a legend", "a hand-rolled checked state in ARIA", "a description list of term-and-value pairs". This is the same hazard `MonCard.tsx` already documents in its own `<img>` notes block ("kept out of the markup so the CI text checks cannot match their own documentation"), and it is now recorded as a repository pattern. No explanation was lost, only requoted.

## Threat Model Coverage

Every `mitigate` disposition in the plan's register is implemented and asserted.

| Threat ID | Mitigation | Where asserted |
|-----------|-----------|----------------|
| T-02-10 | Every name, type label and stat is a Preact text child, which escapes | `npm run check:nohtml` — 0 violations in 43 files |
| T-02-11 | A stored value outside the declared unions can never reach a `data-density` attribute | `view-prefs.test.ts` "when both fields carry a value outside the declared unions"; `pool-density.test.tsx` "defaulting to standard when the stored value is not a density" |
| T-02-12 | Both `JSON.stringify` and the write are wrapped; a failure never escalates | `view-prefs.test.ts` "does not raise the persistence warning signal" |
| T-02-13 | The inline `style` binds two custom properties whose values come only from `TYPE_CODES`; an unmapped type renders no pill | `type-codes.test.ts` "returns null for inherited Object properties" and "names every fill as a --type-* custom property reference" |
| T-02-SC | Nothing installed | `git diff --stat package.json` is empty |

## Known Stubs

None. Every surface this plan renders is wired to real data: the pills and stats read `RosterEntry.types` and `RosterEntry.baseStats` from the committed snapshot, and the density reads and writes real browser storage. No placeholder text, no hardcoded empty collection, no component receiving mock data.

## Flags for the Phase Checkpoint

**A description list renders inside a `<button>` at full density.** `MonCard` is a `<button>` whose HTML content model is phrasing content; `StatBlock`'s description list is flow content. Both halves are mandated: 02-UI-SPEC §10 requires the list ("not a table and not bare spans, so the label/value relationship survives"), and §3 and §6 require the whole cell to be one `<button type="button">`. Browsers render it and `happy-dom` parses it, and the 23 DOM assertions all pass.

Two consequences worth a human's eye at the phase's verification checkpoint:

1. It is a spec-invalid nesting, so an HTML validator will flag it if one is ever added to CI.
2. A button's accessible name is computed from its contents, so at `full` density a cell announces as roughly *"Venusaur Grass Poison Total 525 HP 80 Atk 82 Def 83 SpA 100 SpD 100 Spe 80"*.

This was **not** resolved unilaterally because either fix contradicts a locked decision — dropping the list contradicts D-30, and splitting the cell so the button is not the whole card contradicts D-13 and the Phase 1 target-size rule. That is Rule 4 territory and belongs to the host, not to the executor. Screen-reader behaviour at `full` density is worth adding to the phase's human-verify script.

## Next Plan Readiness

Ready. This plan deliberately front-loaded the shared pieces the rest of the phase consumes:

- **`SegmentedControl`** is proven against a real consumer and its `name` prop already documents the merge hazard the dual-Mega rows (one control per species) will hit.
- **`TypePill`** takes a `form` prop, which is exactly what the type filter toolbar (D-29, plan 02-08) needs to follow the pool density.
- **`view-prefs`** already carries `pane`, so `SplitPanes` (plan 02-06) adds a consumer rather than a key, and `PoolGrid` already merges rather than overwrites.
- **`--cell-min`/`--cell-h`/`--sprite-lg`** are density-scoped on `.pool`, so the config ban grid reuses `PoolGrid` whole (D-10) and inherits the density for free.

No blockers. `npm run verify` exits 0.

## Self-Check: PASSED

- All 16 claimed source and test files exist and are tracked by git (`git ls-files` returns all 16, plus this summary).
- All four claimed commits exist on `worktree-agent-a70adcd8aa54d64c5`: `acf9df2`, `b0878a5`, `4d055bd`, `fb23272`.
- `npm run verify` exits 0 (`check:pure`, `check:nohtml`, 424 tests, build).
- `git diff --stat package.json` is empty; `package-lock.json` untouched; runtime dependencies still exactly `preact` and `@preact/signals`.
- No file under `src/ui/` outside `tokens.css` declares a raw hex value.
- `STATE.md` and `ROADMAP.md` are untouched, as required in worktree mode. `REQUIREMENTS.md` was also left to the orchestrator: it is a shared file and other plans in this wave claim `DRFT-` ids, so a per-worktree edit would conflict on merge. The ids this plan completes are in `requirements-completed` above.

---
*Phase: 02-host-configured-draft-night, plan 03*
*Completed: 2026-08-11*
