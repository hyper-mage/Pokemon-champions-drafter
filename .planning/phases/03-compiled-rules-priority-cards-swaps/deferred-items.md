# Phase 03 — Deferred Items

Out-of-scope discoveries logged during execution. Nothing here was fixed; each entry
records what was found, who owns it, and the evidence that it is not this phase's doing.

---

## 1. `tests/ui/ban-list.test.tsx` times out under full-suite parallel load

**Found during:** 03-01 Task 1 verification
**Owner:** unassigned — a Phase 2 test, not a Phase 3 surface
**Severity:** flaky gate, not a product defect

`bans reaching the feasibility gate > survives 187 bans at eight players and Exact, and dies
on the 188th` exceeds vitest's default 5000 ms `testTimeout` when `npm run verify` runs the
whole suite in parallel. The test performs 188 sequential ban clicks, each one a full
re-render of the 235-cell ban grid plus a feasibility recomputation; it takes ~4.2 s in
isolation on this machine, so it sits just under the limit with no headroom.

**Proof it predates this phase.** `src/` was checked out at `e663518` (the last commit before
03-01 began) with the current `tests/` in place, and the full suite was run. The same test
failed with the same `Test timed out in 5000ms`. It also passes when
`tests/ui/ban-list.test.tsx` is run alone, at every commit tried. Nothing in 03-01 touches
the ban path: the ConfigScreen change is four fields inside `handleStart`, a `useCallback`
body this test never invokes, and `copyConfig`'s two new `.map()` calls run only on `fold`,
which this test never reaches.

**What it is not.** Not a regression, not a correctness bug, and not something a Phase 3 plan
should paper over by widening a Phase 2 assertion.

**Suggested fix when someone owns it:** give this one test an explicit timeout argument, or
set `testTimeout` in `vite.config.ts`'s `test` block. Do not reduce the ban count — 187/188 is
the measured worst-case boundary from `02-RESEARCH §Worst-case ban starvation` and is the
whole point of the test.

**Re-confirmed and widened during 03-08.** The same symptom appears in a second file:
`tests/build/sw-manifest.test.ts`, two cases, which shell out to
`scripts/build-sw-manifest.mjs` per case. Both files fail only ever with
`Test timed out in 5000ms`, never with an assertion failure, and both pass in isolation
(`npx vitest run tests/ui/ban-list.test.tsx` → 17 passed). The whole suite passes at
`--testTimeout=30000`: 50 files, 1324 tests, 0 failures. The ban-list case was measured at
8362 ms in one full run — higher than the ~4.2 s recorded above, which is what "load-sensitive"
means here. Neither file touches anything 03-08 changed: `ConfigScreen` renders no
`TurnBanner`, no `SplitPanes` and no card surface, and nothing on that path calls
`selectPhase`.

**Why 03-08 did not fix it either.** The remedy is a per-test timeout or a global
`testTimeout` in the shared vitest config, which changes project-wide test settings for a
pre-existing environmental sensitivity. That is a decision about the project's test
configuration, not a defect any Phase 3 plan introduced. A concrete proposal, if someone
takes it: raise `testTimeout` to 15000, or mark the three known-slow cases individually so a
genuine hang elsewhere is still caught quickly.

---

## 2. ~~`Dual-Mega species` is still a `--text-label` `<p>`~~ — SETTLED in 03-04

**Found during:** 03-03 Task 2
**Settled by:** 03-04 Task 3
**Status:** closed

03-UI-SPEC §1 lists four sub-sections inside `Mega rules` and says they are `--text-heading`
headings. 03-03 built `Round schedule` to that contract and left `Dual-Mega species` as a
`--text-label` `<p>` for 03-04 to decide, because 03-04 is the plan that adds the fourth
sub-section and therefore the change that fixes the group's hierarchy.

**What 03-04 did.** `Dual-Mega species` moved onto `.config-screen__section` /
`.config-screen__section-heading` as a real `<h2>`, in the same change that added
`Mega-forme bans` on the same treatment — so all four sub-sections now render identically.
`.config-screen__subheading` was DELETED from `ConfigScreen.css` rather than left unused,
and the comment that argued the superseded rule was replaced with a note recording what the
argument was, why it no longer holds, and what to do if a run of controls ever needs a label
that is genuinely not a sub-section.

---

## 3. Two `PoolGrid`s on the config screen keep independent densities

**Found during:** 03-04 Task 3
**Owner:** unassigned — a consequence of the shipped component design, not of a plan
**Severity:** cosmetic inconsistency, no data or accessibility impact

`Mega rules` now mounts a `PoolGrid` and `Bans` mounts another, one above the other. Density
lives on each component's own state, seeded from `champions-drafter:view` at mount (`PoolGrid`
documents this deliberately: the config screen must not hold a duplicate copy of the pool's
view state). So changing density in one grid does not move the other, and both write the same
storage key — whichever was touched last is what both grids adopt on the next mount.

**What 03-04 did fix.** The genuine defects the second mount created: the two grids shared DOM
ids (`pool-search`, `pool-match-all`, `pool-mega-filter-*`) and radio-group names
(`pool-density`, `pool-mega-filter`), so `<label for>` bound across grids and the two radio
groups merged. `PoolGrid.idPrefix` and `FilterBar.idPrefix` close both, which is exactly the
forward note 02-08 left in `FilterBar` for this day.

**What it is not.** Not the id bug above, which is fixed. Not an accessibility failure — each
control is correctly labelled and operable within its own grid.

**Suggested fix when someone owns it:** either lift the density preference to a shared signal
in `src/adapters/view-prefs`, or accept the divergence and say so in `PoolGrid`'s doc block.
Do not lift the FILTER state — `PoolGrid`'s doc block already argues that one out.

---

## 4. Three roster figures are still written into `src/` comments

**Found during:** 03-04 Task 1 acceptance checks
**Owner:** unassigned — all three predate this phase
**Severity:** documentation drift, not a defect

D-17 forbids a roster figure appearing anywhere under `src/`, "including in a comment, because
it dates the moment the count rotates" (`TypeaheadField.tsx` states the rule). Three comments
break it:

- `src/core/import-guard.ts:168` — "snapshot holds 76 Mega formes"
- `src/core/roster/transform.ts:36` — "count from 76 to 74"
- `src/ui/components/NumericField.tsx:28` — "18 is far below the roster's 74"

03-04 removed the one in its own file (`ConfigScreen.tsx`'s "76 forme bans") because an
acceptance criterion required it. The other three are in files this plan does not touch and
were left alone under the scope boundary.

**What it is not.** Not a hardcoded VALUE anywhere — every one of them is prose. No derivation
in `src/` reads a roster figure from a literal.

**Suggested fix when someone owns it:** reword each to name the derivation instead of the
number, in whichever plan next edits that file.

---

## 5. `swap/made` is not on `isUndoable`'s allow-list yet

**Found during:** 03-10 Task 1
**Owner:** 03-11 — the plan that adds `swap/passed`
**Severity:** UX gap, not a correctness bug

`src/core/undo.ts`'s `isUndoable` allows `draft/pickMade`, `cards/played` and
`order/resolved`. `swap/made` is deliberately not added here, so `Undo last move` currently
steps PAST a swap to the last pick and the swap survives.

**Why this plan did not do it.** 03-09's own "Notes for the Next Plan" states the shape:
*"`isUndoable`'s allow-list is where `swap/made` and `swap/passed` attach … `undoRemoval`
gains two `kind` members."* The two attach together, and the second does not exist until
03-11. Doing half of it here means `UndoRemoval` — whose `monId` is a single field — gets
reshaped once for swaps and again for passes, and 03-UI-SPEC's `Undo, swap` announcement
(`Undid the swap — {in} is back in the pool and {out} returns to {name}'s round {r} slot.`)
needs BOTH ids, so the field has to change either way. `undo.ts` is also not in 03-10's
`files_modified`.

**Why it is safe to leave.** Nothing corrupts. Undoing past the pick a swap targeted removes
that pick, and `apply(SWAP_MADE)` then finds no matching `(playerId, round, outMonId)` and
folds to a no-op — the T-03-38 containment doing exactly what it was built for. The document
stays consistent at every step; the only loss is that the swap cannot be walked back
directly.

**What 03-11 needs to do:** add `isSwapMadeAction` (and the pass guard) to `isUndoable`,
widen `UndoRemoval.kind` to include `'swap'` and `'pass'`, carry both mon ids on the removal,
and wire the two unused announcement rows in 03-UI-SPEC §Live-region announcements.

---

## 6. 03-UI-SPEC's swap-count copy slots are not pluralised

**Found during:** 03-10 Task 3
**Owner:** 03-11 for the swap-panel line; 03-10 already fixed the pool-header one
**Severity:** copy defect in the most common configuration

03-UI-SPEC writes the budget slots literally as `{name} has {n} swaps left` (§10, pool header)
and `{playerName} has {n} swaps left.` (§11, swap panel). Rendered verbatim at one remaining
swap they read `Ada has 1 swaps left`, and `swapBudget: 1` is the most likely setting a host
picks — every budget also passes through 1 on its way to being spent, so this is the common
case rather than an edge.

**What 03-10 did.** Pluralised the §10 pool-header line inside `PoolGrid`'s `swapBudgetLine`,
and pluralised the swap confirm's `{n} swaps` slot via a `swaps()` helper in
`confirm-copy.ts`, matching the four helpers that module has carried since Phase 1 for exactly
this class of slot (`picks`, `players`, `bans`, `steps`). `confirm-copy.ts` states the reason:
a visible grammar error in a dialog reads as a tool that was not finished.

**What is left.** §11's swap-panel line is 03-11's surface and should take the same treatment.
Consider exporting one `swaps(count)` helper rather than a third private copy.

**What it is not.** Not a deviation from the spec's substance — the numbers, the subject and
the sentence order are unchanged. Only the plural agreement differs, and the spec's own
copywriting contract is what requires the change.
