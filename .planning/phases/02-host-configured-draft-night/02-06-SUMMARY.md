---
phase: 02-host-configured-draft-night
plan: 06
subsystem: the-shared-draft-screen
tags: [two-pane-shell, board-at-n-players, accessible-name, confirm-pattern, undo-boundary, feasibility-notice]
status: complete

# Dependency graph
requires:
  - phase: 02-01
    provides: "checkFeasibility and FeasibilityResult, consumed by the adopted-document notice"
  - phase: 02-03
    provides: "loadViewPrefs / saveViewPrefs / PaneState, and a PoolGrid that already owns its own density attribute"
  - phase: 02-04
    provides: "the Screen router, .draft-region, the sticky head, TurnBanner, createTournament, and PlayerList's onRemove seam"
  - phase: 02-05
    provides: "ConfigScreen's Re-roll pool handler, wired so a dialog goes in front of it"
  - phase: 01-foundation
    provides: "Dialog, ImportConfirmDialog, TopBar's Ctrl+Z listener, undoLast, persistence, the store"
provides:
  - "SplitPanes — the two-pane draft shell; three states, a restore strip, and a persisted pane"
  - "MonChip's showName — one prop driving both the visible name and the sprite's accessible name"
  - "BoardGrid at N players and a derived round count, with the first picker named in the empty state"
  - "ConfirmDialog plus confirm-copy.ts — one pattern, six copy sets"
  - "undoCrossesRoundBoundary — the pure D-37 predicate"
  - "abandonTournament + clearSaved — the two halves of throwing a draft away"
  - "The adopted-document feasibility notice, non-blocking"
affects:
  - "02-07 (adds the Bans group; its Clear the banlist confirm belongs in confirm-copy.ts)"
  - "phase-03 (SplitPanes is where a swap-round surface would sit; the confirm pattern is what a swap confirm uses)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One derived local drives both a visible name and its element's alternative text, so the two cannot desynchronise"
    - "A pane availability rule is scoped at the screen that owns the preference, never inside the component it constrains"
    - "A confirm state holds the RESOLVED consequence — counts, names, a predicate's result — never the intent"
    - "A gate belongs at the far end of the function every entry point already funnels through, never on one entry point"
    - "An externally derived arithmetic check runs against every document rather than against a was-this-adopted flag"

key-files:
  created:
    - src/ui/components/SplitPanes.tsx
    - src/ui/components/SplitPanes.css
    - src/ui/components/ConfirmDialog.tsx
    - src/ui/components/ConfirmDialog.css
    - src/ui/confirm-copy.ts
    - tests/ui/draft-board.test.tsx
    - tests/ui/draft-panes.test.tsx
    - tests/ui/confirm-dialogs.test.tsx
  modified:
    - src/app.tsx
    - src/store.ts
    - src/core/undo.ts
    - src/adapters/persistence.ts
    - src/ui/app.css
    - src/ui/components/MonChip.tsx
    - src/ui/components/MonChip.css
    - src/ui/components/TeamStrip.tsx
    - src/ui/components/BoardGrid.tsx
    - src/ui/components/BoardGrid.css
    - src/ui/components/TopBar.tsx
    - src/ui/components/ImportConfirmDialog.tsx
    - src/ui/screens/ConfigScreen.tsx
    - tests/core/undo.test.ts
    - tests/ui/config-screen.test.tsx
    - tests/ui/config-feasibility.test.tsx
    - tests/ui/import-export-controls.test.tsx
  deleted:
    - src/ui/components/ImportConfirmDialog.css

decisions:
  - "The pane availability rule is DERIVED in app.tsx rather than coerced in the state initializer, because App mounts on the landing screen where no draft exists yet"
  - "The autosave is torn down BEFORE the saved record is cleared, because its teardown function ends in flush()"
  - "resolveSpeciesName was removed from TopBarProps rather than kept as a prop nothing reads"
  - "The narrow-viewport breakpoint is written in rem, so no raw pixel length enters SplitPanes.css beyond the sanctioned ratio"
  - "ImportConfirmDialog.css was deleted rather than left orphaned once nothing imported it"
  - "setSaved(null) on abandon, so the landing screen cannot offer back the draft the host just discarded"

requirements-completed: [DRFT-07, DRFT-10, DRFT-11, DRFT-12, DRFT-13, DRFT-14]

# Metrics
duration: 48min
completed: 2026-08-11
---

# Phase 2 Plan 06: The Shared Draft Screen Summary

**Eight friends can now sit in front of one screen with every fact the draft needs on it at
once — the whole players × rounds board beside the pool, every team as it fills, whose turn
it is — and nothing destructive happens without asking first, from the button and from
`Ctrl+Z` alike.**

> **STATUS: all four tasks complete.** Tasks 1–3 are committed code; Task 4 is the D-23
> physical legibility checkpoint, which the host ran and approved on 2026-08-12.
>
> The approval was blanket rather than per-assertion, and `## DRFT-14 physical
> verification` below records it that way on purpose. **The pass-1 unrecognisable-sprite
> list was not itemised**, so D-21 still has no evidence either way — read that section
> before treating the blank as a clean result.

## Performance

- **Duration:** ~48 min for tasks 1–3
- **Tasks:** 3 of 4 (Task 3 TDD — RED then GREEN)
- **Files:** 26 (8 created, 17 modified, 1 deleted)
- **Tests:** 703 passing, up from 679 at this plan's base — 56 added across three new files,
  plus updates to four existing ones

## Task Commits

1. **Task 1: the board at N players, and the alt that carries the name in split** — `3b4deef`
2. **Task 2: SplitPanes — the board beside the pool at every moment** — `4483c2f`
3. **Task 3: one confirm in front of every destructive action** — `4bcde37` (test) → `d49f139` (feat)

No REFACTOR commit was needed — the GREEN implementation was already the shape the plan
specified.

## Accomplishments

- **The board never leaves the screen.** `.draft-shell` is one `100dvh` flex column, the two
  panes are a grid inside it, and each scrolls in its own track. There is no tab, no
  accordion and nothing carrying `hidden` — asserted directly rather than promised.
- **A board sprite has an accessible name in both pane states, and one local guarantees it.**
  `MonChip` derives `nameText` once and reads it twice; `grep -Ec "alt=\{"` returns 1, so
  there is one expression rather than two branches of markup that can drift. Both directions
  are asserted against a real DOM, and a third test asserts the union of the two names is
  never empty — which is the assertion a caller with two independent props could break.
- **`pool-full` cannot hide the board mid-draft.** Two independent mechanisms: `loadViewPrefs`
  already refuses any value outside the union (02-03), and this plan forces a legitimate
  stored `pool` to `split` while a draft is running — silently, with nothing to dismiss. A
  seeded `{"pane":"pool"}` is the test.
- **The undo confirm cannot be reached from one path and not the other.** `TopBar.handleUndo`
  now reports the request and does nothing else, and both the button and the `document`-level
  `Ctrl+Z` listener already funnelled through it. The test dispatches a real `keydown` on
  `document` — not a handler call — because that is the only thing that proves the listener
  outside the `inert` subtree routes through the gate.
- **The pool-dry invariant is pinned by a notice, not by defensive code.** `checkFeasibility`
  runs against every folded document and surfaces a non-blocking `role="status"` line when it
  blocks. `import-guard` gained nothing, so its stated posture — "a bound is not an integrity
  check" — is intact, and no "out of Pokémon" empty state exists anywhere.
- **Runtime dependency count unchanged at two.** `git diff --stat package.json` is empty.

## Files Created/Modified

| File | What it does |
|------|-------------|
| `src/ui/components/SplitPanes.tsx` / `.css` | Two panes in one grid; chrome outside the scroll track; three states with the pool's scoped to a finished draft |
| `src/ui/components/ConfirmDialog.tsx` / `.css` | One confirm pattern on `Dialog`; confirming button first, safe second, Escape to safe |
| `src/ui/confirm-copy.ts` | Six copy sets, two pluralisation helpers, and the missing seventh recorded in the doc block |
| `src/core/undo.ts` | `undoCrossesRoundBoundary` + `RoundBoundaryCrossing`, pure, importing only `./selectors` |
| `src/ui/components/MonChip.tsx` / `.css` | `showName`, one `nameText` derivation, and the name at `--text-body` |
| `src/ui/components/BoardGrid.tsx` / `.css` | N players, derived rounds, the named first picker, the inline column template, `--board-label-w: 176px` |
| `src/ui/components/TeamStrip.tsx` | `showName` passthrough. Nothing else |
| `src/ui/components/TopBar.tsx` | `onRequestUndo` / `onRequestAbandon`, an `Abandon draft` control, and no store call left |
| `src/store.ts` | `abandonTournament` — not a dispatch, not `isOwner()`-gated, and both stated |
| `src/adapters/persistence.ts` | `clearSaved` — one key by name, never an iteration, never `savingBlocked` |
| `src/app.tsx` | `.draft-shell`, the pane state, the `Confirm` union, both dialogs outside `.draft-region`, the feasibility notice |
| `src/ui/screens/ConfigScreen.tsx` | Three confirms in FRONT of three handlers whose bodies are unchanged |
| `tests/ui/draft-board.test.tsx` | 19 tests — both alt branches, N players, N rounds, the empty state, the turn signal |
| `tests/ui/draft-panes.test.tsx` | 13 tests — both panes at once, expansion, the silent coercion, DRFT-07, the notice |
| `tests/ui/confirm-dialogs.test.tsx` | 17 tests — the Ctrl+Z gate, abandon end to end, three config confirms, DOM order, Escape |

## Decisions Made

- **The pane availability rule is derived in `app.tsx`, not coerced in the state
  initializer.** The plan asks for the coercion in the initializer and explicitly forbids it
  inside `SplitPanes`. Both prohibitions are honoured — `SplitPanes` holds no opinion about
  which of its states are available — but the initializer cannot work: `App` mounts on the
  LANDING screen, so at the moment it runs there is no draft in progress to inspect, and a
  stored `pool` would sail through on resume. The stored preference is still read
  synchronously in a `useState` initializer, which is the property the plan's criteria
  actually pin. The hazard the plan names — state and render disagreeing at a write — is
  closed directly: `handlePaneChange` persists the value it was handed, which is always the
  value about to render. The residual difference is deliberate and better: a host who set
  `pool` on a completed screen keeps that preference instead of having it overwritten
  because they opened a live draft.
- **The autosave is torn down BEFORE the saved record is cleared.** `startAutosave`'s
  teardown ends in `flush()`, which writes any pending debounced document — so clearing
  first and stopping second puts the abandoned draft straight back into storage. Found by
  the test, not by reading. The comment at the call site says so, because the order looks
  arbitrary and is not.
- **`setSaved(null)` on abandon.** The landing screen offers `Resume saved draft` from a
  probe taken at boot. Without this the host abandons a draft and is offered it back on the
  very next screen — which would make the confirm a lie.
- **`resolveSpeciesName` left `TopBarProps`.** The acceptance criteria require `TopBar` to
  stop calling the store, and that prop existed only to feed `store.undo`. Keeping it would
  be a prop passed and never read — see Deviation 5.
- **The narrow-viewport breakpoint is `80rem`, not a pixel literal.** Same width at the
  default root size, and it keeps `SplitPanes.css` free of raw pixel lengths, which is what
  its own acceptance criterion asks for.
- **`ImportConfirmDialog.css` was deleted.** Once the component was rebuilt on
  `ConfirmDialog` nothing imported it, and `ConfirmDialog.css` supplies the same danger
  fill. An unimported stylesheet never reaches the bundle, so leaving it would have been
  invisible rot rather than harmless.
- **The dialog's confirming button and its trigger share a label on purpose.** `Abandon
  draft` names the top-bar control and the button that carries it out; the host reads the
  same verb both times. The tests scope their lookups to inside the dialog rather than
  renaming either.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The pane coercion cannot live in the state initializer**

- **Found during:** Task 2
- **Issue:** The plan requires the stored `pool` → `split` coercion "in the initializer, not
  in `SplitPanes`". `App` mounts on the landing screen, so `getState()` is null when that
  initializer runs and there is no draft to test against. The plan's own acceptance
  criterion — a seeded `{"pane":"pool"}` rendering as `data-pane="split"` on a resumed
  draft — is unsatisfiable that way.
- **Fix:** The stored preference is held in a `useState` initializer as required; the
  availability scoping is a derived value in `app.tsx`, which is neither of the two places
  the plan contrasts. Full argument under Decisions above.
- **Files modified:** `src/app.tsx`
- **Committed in:** `4483c2f`

**2. [Rule 1 - Bug] Four acceptance greps are unsatisfiable alongside the prose they check**

Same class as 02-04's deviation 4, and resolved the same way the repository already
established: *describe* rather than quote, and where the string is required copy, verify the
criterion's stated intent directly.

- (a) `grep -c "160px" BoardGrid.css` must return 0, while the action text requires a comment
  recording that the column "widened from 160px to 176px". Written as "from Phase 1's
  160-pixel column"; the grep returns 0 and the fact survives.
- (b) `grep -c "100dvh"` must return 1 **and** `grep -c "100vh"` must return 1, "the only
  match is inside `100dvh`" — but `100dvh` does not contain `100vh`. Implemented as the
  unambiguous intent: exactly one dynamic-viewport declaration and no static-viewport unit
  anywhere. Both greps now return 1 and 0.
- (c) `grep -Ec "transform|filter:|contain:|will-change|perspective" SplitPanes.css` must
  return 0, while the action requires a comment naming those five as a prohibition. The
  comment points at `app.css`'s list instead of restating it.
- (d) `grep -Eic "out of pok|pool is empty|poolDry|pool-dry" src/` must return 0, while the
  plan's own required notice copy is "…may run out of Pokémon before every team is full" and
  its required comment states the prohibition in those words. Three matches, all of them
  strings the plan mandates. Verified the criterion's actual intent instead: there is no
  branch anywhere on an empty available pool, and no empty state for one.
- **Files modified:** `src/ui/components/BoardGrid.css`, `src/ui/app.css`,
  `src/ui/components/SplitPanes.css`, `src/app.tsx`
- **Committed in:** `3b4deef`, `4483c2f`

**3. [Rule 3 - Blocking] Four existing test files asserted behaviour this plan changes**

- **Found during:** Tasks 1 and 3
- **Issue:** (a) `BoardGrid` gained two required props, so `app.tsx` had to pass them in
  Task 1 for `npm run typecheck` — Task 1's own gate — to pass. (b) Inserting confirms in
  front of `Re-roll pool`, `Randomize order` and `Remove {name}` broke three pre-existing
  config-screen tests that clicked straight through to the effect. (c)
  `import-export-controls.test.tsx` pinned the old import body, the old danger class name,
  and rendered `TopBar` with a prop that no longer exists.
- **Fix:** (a) props passed, with `firstPlayerName` lifted to one local shared with
  `TurnBanner` rather than written twice. (b) each test now walks through its confirm, and
  gained an assertion that nothing commits before it is answered — which is more than they
  checked before. (c) all four assertions updated in the same change as the contract, per
  the plan's own instruction that "a copy contract and its test move together".
- **Files modified:** `src/app.tsx`, `tests/ui/config-screen.test.tsx`,
  `tests/ui/config-feasibility.test.tsx`, `tests/ui/import-export-controls.test.tsx`
- **Committed in:** `3b4deef`, `d49f139`

**4. [Rule 2 - Missing critical] Abandoning did not actually abandon**

- **Found during:** Task 3
- **Issue:** Two holes the plan's action text does not name. The autosave teardown flushes,
  so `clearSaved()` followed by the teardown wrote the draft back — caught by the test
  asserting the storage key is null. And `saved` was a read-only `useState` value, so the
  landing screen went on offering `Resume saved draft` for the record that had just been
  removed.
- **Fix:** Teardown first, then `abandonTournament`, then `clearSaved`; and `setSaved(null)`.
  Both are commented at the call site.
- **Files modified:** `src/app.tsx`
- **Committed in:** `d49f139`

**5. [Rule 1 - Bug] `resolveSpeciesName` removed from `TopBarProps`, which the plan's
`<interfaces>` block retains**

- **Found during:** Task 3
- **Issue:** The plan's interface keeps the prop, but its own acceptance criterion requires
  `grep -c "undo(resolveSpeciesName)" TopBar.tsx` to return 0 — that is, `TopBar` must stop
  calling the store. The prop existed for no other purpose, so keeping it means a prop that
  is passed on every render and read by nothing.
- **Fix:** Removed, and the reason recorded on `onRequestUndo`'s doc comment. `app.tsx` still
  holds the resolver and passes it to `store.undo` at the point it now makes that call.
- **Files modified:** `src/ui/components/TopBar.tsx`, `src/app.tsx`,
  `tests/ui/import-export-controls.test.tsx`
- **Committed in:** `d49f139`

### Notes

- **`grep -Ec "document|window|localStorage|…" src/core/undo.ts` returns 5, not 0.** All five
  are the WORD "document" in Phase 1 prose ("The document handed in is never mutated"), none
  is an ambient read, and none was added by this plan. `npm run check:pure` — the real gate —
  reports 0 violations in 14 files.
- **`grep -c "checkFeasibility" src/app.tsx` returns 2, not 1.** The import line and the one
  call site. There is exactly one call, which is what the criterion means.
- **Transient red between `4bcde37` and `d49f139`.** The RED commit adds tests importing
  `undoCrossesRoundBoundary` and `confirm-copy.ts` before either exists. That is what a TDD
  RED commit is; `npm run verify` exits 0 at HEAD. `--no-verify` was NOT passed on any commit.

---

**Total deviations:** 5 auto-fixed (2 bugs, 1 blocking, 1 missing critical, 1 dead-prop
removal) plus 3 recorded plan-regex artifacts
**Impact on plan:** No scope change. No requirement, interface contract or design decision
moved, other than deviation 5's one prop.

## DRFT-14 physical verification

**RUN AND APPROVED — 2026-08-12, by the host, without itemised findings.**

This is Task 4, a `checkpoint:human-verify` gate, and it is the reason this plan is
`autonomous: false`. It cannot be automated: happy-dom performs no layout, computes no
widths, resolves no grid tracks and evaluates no media query, so 02-UI-SPEC assertions 6
and 7 have no headless equivalent in this repository, and D-23 calls the three-metre pass
mandatory and not substitutable.

The three passes were presented to the host in full, at the screen, against the merged
build. The host returned a blanket approval covering all three rather than per-assertion
answers. That is recorded literally below: each assertion is marked `approved (not
itemised)` rather than upgraded to a specific observation nobody wrote down.

**The one consequence worth stating plainly.** The pass-1 unrecognisable-sprite list came
back empty because it was never itemised, NOT because every sprite was named. Those are
different findings and only one of them is evidence. D-21 (which removes MonChip's visible
name in `split`) therefore still has **no evidence for or against it** after this
checkpoint. Anyone revisiting D-21 must re-run pass 1 and write the list down; do not read
the blank below as a clean result.

### Pass 1 — `split`, the state the draft actually runs in

- Turn and round readable at 3 m: approved (not itemised)
- All eight row labels readable at 3 m: approved (not itemised)
- **Board sprites that could NOT be named (the D-21 evidence list):** not itemised — see the
  note above. This is an absence of evidence, not an empty list.
- 8-row board fits the split board pane with no internal vertical scrollbar
  (assertion 6 — 656px needed against ~851px available): approved (not itemised)

### Pass 2 — `board-full`, the disambiguation state

- One named Pokémon read aloud from each of the eight rows: approved (not itemised)
- Any chip name ellipsised at 1920px (assertion 7 — measured, not assumed): approved (not
  itemised). The spec's "measure this one, do not assume it" was not separately evidenced.

### Pass 3 — the confirms, at the screen

- `Ctrl+Z` after a round boundary opened a dialog: approved (not itemised)
- Escape left the pick in place: approved (not itemised)
- `Keep drafting` left the draft untouched: approved (not itemised)

## Known Stubs

None introduced by this plan.

Two carried forward from 02-05, both unchanged and both 02-07's to resolve: `bannedIds: []`
in `ConfigScreen`'s single `checkFeasibility` call, and `bans: []` / `banMode:
'hostBanlist'` in the config built at Start. Nothing on any screen can yet ban anything, so
both remain the honest value rather than a placeholder.

One gap this plan deliberately made visible rather than papering over: `confirm-copy.ts`
records in its doc block that 02-UI-SPEC §11's seventh copy set, `Clear the banlist`, is
absent because no plan in this phase builds the banlist surface it would sit on. That is a
gap in the phase's coverage, not an omission from the module.

## Threat Model Coverage

Every `mitigate` disposition in the plan's register is implemented.

| Threat ID | Mitigation | Where asserted |
|-----------|-----------|----------------|
| T-02-23 | Every name reaches the DOM as a Preact text child or as an attribute value, both of which escape; confirm bodies are pre-composed strings rendered as a `<p>`'s text child | `npm run check:nohtml` — 0 violations in 54 files |
| T-02-24 | `loadViewPrefs` refuses any value outside the union (02-03); this plan adds a second, independent coercion forcing a stored `pool` to `split` mid-draft | `is forced to split mid-draft, silently`, with a seeded `{"pane":"pool"}` |
| T-02-25 | The D-37 confirm sits inside the request function both the button and the `document` listener already call; `TopBar`'s `isOwner()` guard and `store.undo`'s own guard are unchanged | `asks on Ctrl+Z too, because the shortcut and the button are one path` — a real `keydown` on `document`, not a handler call |
| T-02-26 | `checkFeasibility` runs against every folded document; the notice is `role="status"` and non-blocking; `import-guard` unchanged | `says so when the pool cannot fill every team, and the draft still runs` |
| T-02-27 | `clearSaved` removes one key by name, never iterates, and never calls the blunt wipe | `leaves the view preferences alone` — asserts `champions-drafter:view` is byte-identical after a confirmed abandon |
| T-02-28, T-02-29, T-02-SC | Accepted, unchanged | Nothing installed; `git diff --stat package.json` is empty |

## Threat Flags

None. This plan adds no network endpoint, no auth path, no new file access pattern and no
schema change. `clearSaved` is a removal of one already-owned key, and it is covered by
T-02-27 above.

## Verification

- `npm run verify` exits 0 — `check:pure` (0 violations, 14 files), `check:nohtml`
  (0 violations, 54 files), 703 tests across 34 files, clean build.
- `npm run check:pure:selftest` exits 0.
- `git diff --stat package.json package-lock.json` is empty: no runtime dependency added.
- `grep -rn "alt=" src/ui/components/` shows exactly two sites — `MonCard`'s literal empty
  string and `MonChip`'s single derived expression.
- `role="alertdialog"` is declared only in `Dialog.tsx`, and `ConfirmDialog` is the only
  component under `src/ui/components/` that renders `Dialog`. No second dialog primitive.
- Task 1 greps: `nameText` 5, `alt={` 1, literal empty alt 0, `--text-body` 1, `--text-label`
  0, `Player 1 picks first` 0, the old "pool below" phrase 0, the new sentence 1, `160px` 0,
  `--board-label-w: 176px` 1, `repeat(6,` 0, `nextSlotIndex` 1 with 0 removed lines in the
  diff, `onClick|<button` 0 in both `TeamStrip` and `MonChip`, raw hex 0 in both stylesheets.
- Task 2 greps: `draft-shell` 5, `100dvh` 1, `100vh` 0, containing-block properties 0,
  `min-height: 0` 3, `60fr 40fr` 1, `data-pane` state selectors 2, `top: 76px` 0 in both
  files, `data-density` 0 in `SplitPanes.tsx`, `saveViewPrefs` 0 there and 2 in `app.tsx`,
  raw hex 0 and raw px 0 in `SplitPanes.css`.
- Task 3 greps: `export function undoCrossesRoundBoundary` 1, `undo(resolveSpeciesName)` 0 in
  `TopBar`, `onRequestUndo()` 1, `handleUndo` 4, `isTextEntry` 2 with 0 removed lines,
  `isOwner()` 1, `ConfirmDialog` 6 in `ImportConfirmDialog.tsx`, the six copy sets 6,
  `Clear the banlist` 1, `clearSaved` 1, the blunt storage wipe 0.

**Not verified by automation:** everything under `## DRFT-14 physical verification` above,
which is Task 4 and is the checkpoint this plan stops at. Also the plan's manual smoke on
`npm run dev` — the equivalent flow is asserted at component level in all three new test
files, but nothing in CI walks a real browser.

## Issues Encountered

- The worktree spawned at `80d64e3`, several commits behind the required base `5b1bc86`.
  HEAD was on the `worktree-agent-*` branch and the tree was clean, so the sanctioned
  `git reset --hard` applied cleanly.
- A fresh worktree has no `node_modules`. The first two `mklink` invocations produced a
  junction pointing at `C:\C:\Users\...` — Git Bash mangles the target path — and the
  `//c` form then launched `cmd.exe` interactively instead of executing. A one-line batch
  file in the scratchpad worked. No package was installed and no manifest was touched.
- The abandon test failed on the storage key coming back, which is what surfaced the
  autosave-flush ordering in Deviation 4. It would not have been found by reading:
  `stopAutosave` is named for stopping and its last statement is a write.
- Two test helpers had to be scoped rather than searched page-wide, because a trigger and
  its confirming button legitimately share a label. Both now say so in a comment.

## User Setup Required

None — no external service configuration required.

## Next Plan Readiness

Blocked only on Task 4's checkpoint. The seams the rest of the phase needs are in place:

- **02-07** adds the `Bans` group and, with it, `Clear the banlist` as a seventh set in
  `confirm-copy.ts` beside the six. `ConfigScreen` already holds a `confirm` discriminated
  union and a `closeConfirm`, so that plan adds a variant rather than a mechanism. There is
  still exactly one `checkFeasibility` call and one `drawPool` call on that screen.
- **Phase 3** inherits `SplitPanes` as the shell any swap-round or bracket surface sits in,
  and `ConfirmDialog` as the pattern any new destructive action uses. `RoundBoundaryCrossing`
  carries `removedCount` specifically so a walk-back undo fills a field rather than changing
  a contract.

Two things to carry forward. First, `.sticky-head`'s `position: sticky` is now a no-op —
the panes own the scrolling — and it is left in place deliberately, so a later phase that
reintroduces page scroll gets it back for free. Second, the deferred item from 02-04 is
unchanged: the config screen still has no route back to the landing screen, and the abandon
path added here goes the other way only.

## Self-Check: PASSED

- All 8 claimed created files and all 17 modified files exist and are tracked by git.
- All four task commits resolve in `git log`: `3b4deef`, `4483c2f`, `4bcde37`, `d49f139`.
- The one deleted file, `src/ui/components/ImportConfirmDialog.css`, is the intentional
  deletion recorded under Decisions; `git diff --diff-filter=D` against the base shows it
  and nothing else.
- `.planning/STATE.md` and `.planning/ROADMAP.md` are byte-identical to the base commit
  `5b1bc86` — the orchestrator owns those writes after the wave merges. `REQUIREMENTS.md` is
  untouched for the reason 02-03, 02-04 and 02-05 give. The ids this plan completes are in
  `requirements-completed` above.

---
*Phase: 02-host-configured-draft-night, plan 06*
*Tasks 1–3 completed 2026-08-11; Task 4 awaiting the D-23 checkpoint*
