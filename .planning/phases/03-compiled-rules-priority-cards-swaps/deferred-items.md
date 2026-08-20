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

## 5. ~~`swap/made` is not on `isUndoable`'s allow-list yet~~ — SETTLED in 03-11

**Found during:** 03-10 Task 1
**Settled by:** 03-11 Task 1
**Status:** closed

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

**What 03-11 did.** All four, in the order above, plus one thing the handover did not
predict.

`isUndoable` gained `isSwapMadeAction` and `isSwapPassedAction` together, exactly as 03-09
specified. `UndoRemoval.kind` is now `'pick' | 'card' | 'order' | 'swap' | 'pass'`.

The type widened by **two** fields rather than one. `monId` was redefined as "the species
returning to the POOL" — a pick's own species, or a swap's incoming one — and a sibling
`outMonId` carries "the species returning to the SLOT", which only a swap has. A pass needed
a third: `swapRound`, `null` for every other kind *and for a mid-draft swap*, whose
`swapRound` is `0` and which belongs to no dedicated round. That null is what the crossing
check reads, so the field earns its place rather than merely describing a pass.

Both announcement rows are wired in `src/store.ts`'s `undoAnnouncement`, and
`resolveSpeciesName` is now consulted for a pick **and** a swap, which its doc block says.

**The unpredicted part: a swap and a pass never raise the round-boundary confirm.**
`undoCrossesRoundBoundary` used to compare `removed.round` against the current round for
every kind. A swap's `round` is the PICK round of the slot it changed, which is routinely
round 1 while the draft stands at round 6 — so the bare comparison would have fired
`UNDO_BOUNDARY_CONFIRM` on almost every swap undo, and that dialog reads *"This undoes
{name}'s pick from round {r}"*, which is pick-specific prose and a plain untruth over a
swap. 03-UI-SPEC §12 lists exactly three new confirm sets for this phase and neither of
these is among them, so the spec already held this position. The comparison is now gated on
an explicit `ROUND_COMPARABLE_KINDS` allow-list of `['pick', 'card']`, which leaves the
three pre-existing kinds byte-identical in behaviour.

`undo.ts` and `store.ts` were **not** in 03-11's `files_modified` either. They were changed
anyway, under deviation Rule 2: `Undo last move` silently skipping the one move a host is
most likely to regret is a correctness gap in a shipped control, and the execution brief
assigned this item to this plan explicitly.

---

## 6. ~~03-UI-SPEC's swap-count copy slots are not pluralised~~ — SETTLED in 03-11

**Found during:** 03-10 Task 3
**Settled by:** 03-11 Task 2 (03-10 had already fixed the pool-header one)
**Status:** closed

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

**What 03-11 did.** Took the suggestion rather than the minimum. `swaps` is now **exported**
from `confirm-copy.ts` — alone among the five helpers, and the module says why — and both
remaining readers call it: `SwapPanel`'s §11 line (`Cy has 1 swap left.`) and `PoolGrid`'s
§10 line, whose private copy of the rule was replaced. One plural rule, three surfaces, no
third copy to drift.

The SENTENCES stay where they are. §10's line and §11's are two rows of the copy table and
differ in more than the number — a shared composer taking a noun would put one string behind
two contract rows, which is the argument `CLEAR_MEGA_FORME_BANLIST_CONFIRM` already makes
against parameterizing its sibling.

Asserted at one remaining in `tests/ui/swap-rounds.test.tsx`, on the whole sentence.

**What it was not.** Not a deviation from the spec's substance — the numbers, the subject and
the sentence order are unchanged. Only the plural agreement differed, and the spec's own
copywriting contract is what required the change.

---

## 7. Screen-reader verification is DESCOPED for this milestone

**Found during:** `/gsd-audit-uat` sweep, 2026-08-20
**Owner:** host — this is a scope decision, not an engineering finding
**Severity:** none open; the obligation is closed, not outstanding

The WR-02 question — whether an `aria-live="polite"` announcement queued in the same commit as
a `.focus()` call is actually heard, or is preempted by the newly focused control's own name —
has been open since Phase 2. Phase 3 added two more surfaces to the check list (the
`SchedulePreview` reorder move and the card-resolution handoff from `CardPanel` to `PoolGrid`),
and 03-12 Task 2 recorded it as NOT RUN because no screen reader was configured on the host's
machine.

**The decision.** On 2026-08-20 the host descoped it: *"it mostly works but I do not want this
project to put anymore effort into screen reading."* Archived at their direction.

**Recorded as descoped, not passed — deliberately.** "Mostly works" is an informal impression
offered in passing, not the four-transition walk `03-HUMAN-UAT` test 1 specifies. Writing it
down as a pass would fabricate a result, which is the exact thing 03-12 refused to do when it
reported the check as not run rather than assumed.

**What is still true, and why this costs nothing verified.** The design never depended on the
answer. Every fact an announcement carries is redundantly carried by something else: the
schedule reorder's destination is in the newly focused button's own accessible name, the
resolved pick order is persistent on-screen text, and each pane's restore control names the
new state as it takes focus. That redundancy is why `03-UI-SPEC` called a preempted
announcement *a finding to record* rather than a blocker. Descoping the check removes an
observation, not a guarantee.

**What changed in `src/`.** Nothing behavioural. Two doc blocks that asserted an outstanding
obligation would otherwise have become false, and CLAUDE.md treats comments as contracts:

- `SchedulePreview.tsx` — the `## Screen-reader check still owed` block now records the
  descope. The reasoning about why the surface does not depend on the answer is unchanged.
- `SplitPanes.tsx` — the `UNRESOLVED, and deliberately not resolved by guessing` block, which
  closed with `Record the outcome here either way`, now records the outcome: descoped. Its
  analysis of what an honest fix would look like *if* preemption were ever observed is kept
  verbatim, because that is the design note a future reader needs.
- `CardPanel.tsx` — untouched. It never carried a screen-reader claim, so it has nothing stale.

**What would reopen it.** Either of two things, and nothing less:

1. A real user of this tool uses a screen reader. The friend group is the entire audience; if
   that changes, so does this.
2. Someone removes the redundancy the descope leans on — makes an announcement the *only*
   carrier of a fact, rather than a second carrier. `SplitPanes.tsx`'s block names the specific
   case: the collapse-to-split transition moves no focus, so its announcement is already the
   sole signal there, and it was kept for that reason. Adding another such case reopens this.

**Suggested first step if it is reopened:** Windows Narrator needs no install
(`Ctrl` + `Win` + `Enter`). `03-HUMAN-UAT` test 1 preserves the four-transition script verbatim
so a future run needs no reconstruction.
