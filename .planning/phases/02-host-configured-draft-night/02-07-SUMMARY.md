---
phase: 02-host-configured-draft-night
plan: 07
subsystem: the-host-banlist
tags: [one-list-two-surfaces, combobox, set-based-counts, ban-mode, seventh-confirm, read-only-disclosure]
status: complete

# Dependency graph
requires:
  - phase: 02-01
    provides: "matchesName / toSearchKey, checkFeasibility's bannedIds and set-based banCount, and drawPool's caller-filtered candidates"
  - phase: 02-02
    provides: "TournamentConfig.bans and .banMode at schema v2, and import-guard's bounded rebuild of both"
  - phase: 02-03
    provides: "PoolGrid with its density root, MonCard's density branching, and SegmentedControl's disabled-option handling"
  - phase: 02-04
    provides: "ConfigScreen's group conventions, the single checkFeasibility memo, the single drawPool memo, and the createTournament seam"
  - phase: 02-05
    provides: "the declared group order this plan inserts Bans into, between Mega rules and Pool"
  - phase: 02-06
    provides: "ConfirmDialog, confirm-copy.ts and its six sets, ConfigScreen's confirm union, and TopBar's Abandon draft row"
provides:
  - "bannedEntries — the one set-based, roster-intersected, name-sorted ban derivation"
  - "TypeaheadField — a combobox over the shared search predicate, the by-name ban surface"
  - "BanChipList — name-sorted removable chips, membership and removal by id"
  - "PoolGrid's ban mode — the second surface over the same one list"
  - "CLEAR_BANLIST_CONFIRM — the seventh copy set 02-06 recorded as absent"
  - "The Bans ({n}) draft-screen disclosure, read-only by construction"
affects:
  - "02-08 / 02-09 (the Bans group is now group 4; any further config work inserts around it)"
  - "phase-04 (enables blind and snake on the control this plan shaped, rather than redesigning it)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A mode travels on its data — one nullable prop rather than a mode flag plus a payload, so both incoherent combinations are unrepresentable"
    - "One idempotent write path behind two input surfaces, so the surfaces cannot double-write or announce differently"
    - "Every displayed count of a set is one derivation whose length is pinned equal to the gate's independently computed figure"
    - "An option whose reason is static carries the native disabled attribute; only a computed reason earns the focusable ARIA-only form"
    - "A combobox activates its options on press, not on click, because click fires after blur has already unmounted them"

key-files:
  created:
    - src/core/bans.ts
    - src/ui/components/TypeaheadField.tsx
    - src/ui/components/TypeaheadField.css
    - src/ui/components/BanChipList.tsx
    - src/ui/components/BanChipList.css
    - tests/core/bans.test.ts
    - tests/ui/ban-list.test.tsx
    - tests/ui/ban-grid.test.tsx
    - tests/ui/ban-mode.test.tsx
  modified:
    - src/app.tsx
    - src/ui/confirm-copy.ts
    - src/ui/screens/ConfigScreen.tsx
    - src/ui/screens/ConfigScreen.css
    - src/ui/components/PoolGrid.tsx
    - src/ui/components/PoolGrid.css
    - src/ui/components/MonCard.tsx
    - src/ui/components/MonCard.css
    - src/ui/components/TopBar.tsx
    - src/ui/components/TopBar.css
    - tests/ui/config-screen.test.tsx
    - tests/ui/config-feasibility.test.tsx
    - tests/ui/pool-density.test.tsx
    - tests/ui/import-export-controls.test.tsx
  deleted: []

decisions:
  - "At the Exact preset 188 bans blocks with `Too many players for the roster.`, not `Pool is too large.` — the plan's acceptance string contradicts 02-01's documented precedence, and the gate is right"
  - "PoolGridProps.bannedIds and ConfigScreenProps.spriteMeta forced src/app.tsx and four test files to change in Task 2; a required prop with no call site does not compile"
  - "toggleBan is declared in Task 2 rather than Task 1, because noUnusedLocals refuses a callback whose only consumer is the next commit"
  - "The `after {b} bans` copy defect is left recorded rather than fixed — it is one of two instances of one class, and feasibility.ts is outside this plan's file scope"
  - "Tests use Rotom-Wash rather than the plan's worked example Landorus, which is not in the committed Champions roster"
  - "The typeahead's candidates are the full roster, not the roster minus the banlist, so the no-match sentence is never false about a species that plainly matches"

requirements-completed: [BAN-01, BAN-02, BAN-08, DRFT-13]

# Metrics
duration: 35min
completed: 2026-08-12
---

# Phase 2 Plan 07: The Host Banlist Summary

**The host excludes Pokémon by typing a name or clicking a cell in the full roster grid, the
two surfaces are one list rather than two that agree, the feasibility gate recomputes against
the smaller legal count, and the draft that starts contains none of them anywhere — with the
top bar answering "wait, where's Landorus?" without anyone leaving the tool.**

This is ROADMAP Phase 2 Success Criterion 2, and nothing before this plan built a ban surface.

## Performance

- **Duration:** ~35 min
- **Started:** 2026-08-12T10:08Z
- **Completed:** 2026-08-12T10:43Z
- **Tasks:** 3 of 3 — Task 1 TDD (RED then GREEN), Tasks 2 and 3 plain
- **Files:** 23 (9 created, 14 modified, 0 deleted)
- **Tests:** 757 passing, up from 703 at this plan's base — 54 added across four new files,
  plus prop updates to four existing ones

## Task Commits

1. **Task 1: ban by name — the typeahead, the chips, and a pool the ban is missing from** —
   `dd8e7f7` (test) → `e0639dc` (feat)
2. **Task 2: the 235-cell ban grid — the second surface, the same one list** — `c2ba396`
3. **Task 3: ban mode, clearing the banlist, and where a missing Pokémon went** — `e6398ef`

No REFACTOR commit was needed — the GREEN implementation was already the shape the plan
specified.

## Accomplishments

- **Every ban count in the application is one derivation, and a core test pins it to the
  gate's.** `bannedEntries` intersects the banlist with the roster; `checkFeasibility` reaches
  the same figure by subtracting its own set-based legal count. The equality is asserted
  directly, including for `['pikachu','pikachu','not-a-real-id']`, where both are 1. The raw
  array length appears in no count expression anywhere: the grep over `ConfigScreen.tsx` and
  `app.tsx` returns 0 in both, and the absence is checkable rather than promised.
- **The two surfaces are provably one list.** `a species banned by name is already pressed in
  the grid` bans through the typeahead and then asserts the grid cell without touching it.
  That assertion is the only one that can distinguish one list read two ways from two lists
  that happen to agree today, and it is named for what it defends.
- **BAN-08 is enforced in exactly one place.** The `drawPool` memo's `candidates` is the entry
  list minus the banlist, which is what `DrawInput.candidates`' own contract asks of its
  caller. Starting a draft with `Rotom-Wash` banned yields `config.bans` containing its id and
  `state.poolIds` containing it zero times — absent, not dimmed (D-13).
- **The idempotent write path is asserted, not assumed.** Selecting the same species twice
  leaves one chip and does not move the count, which is 02-RESEARCH F-10's stated failure mode
  closed structurally rather than by every count happening to be set-based as well.
- **`1 ban` / `{n} bans` everywhere a count is interpolated.** One helper on the config screen
  for the announcements, one beside its two siblings in `confirm-copy.ts` for the dialog body.
  Both are asserted at 1 and at 3, because "1 bans" is reachable on the very first ban a host
  makes.
- **The disclosure cannot disagree with the gate.** A folded document carrying a duplicate ban
  id and one from a rotated regulation renders `Bans (1)`, and the test is named for the
  hand-edited import it defends against.
- **`confirm-copy.ts`'s stale note is gone in the same change that made it false.** The
  seventh set is real copy now, and the sentence recording it as absent was deleted rather
  than left for the next reader to trust.
- **Runtime dependency count unchanged at two.** `git diff --stat package.json` is empty. No
  combobox library, no icon package, no CSS framework.

## Files Created/Modified

| File | What it does |
|------|-------------|
| `src/core/bans.ts` | `bannedEntries` — set-based, roster-intersected, name-sorted. One import, pure, 72 lines mostly doc block |
| `src/ui/components/TypeaheadField.tsx` / `.css` | Combobox over the shared search predicate; capped at 8, arrow-key walk with wraparound, press-not-click activation, its own no-match status line |
| `src/ui/components/BanChipList.tsx` / `.css` | The chip IS the remove control; accessible name contains the visible name (SC 2.5.3); renders nothing when empty; does not sort |
| `src/ui/components/PoolGrid.tsx` / `.css` | `bannedIds` carries the mode; ban mode drops the heading, counts by membership, and scrolls inside a capped region |
| `src/ui/components/MonCard.tsx` / `.css` | `banned: boolean \| null`; one pressed-state expression; two non-hue signals on a banned cell; the empty `alt` unchanged |
| `src/ui/confirm-copy.ts` | The seventh set, a third plural helper, and the absence note deleted |
| `src/ui/screens/ConfigScreen.tsx` / `.css` | Group 4 in its declared position; ban mode, field, chips, clear, grid; one write path; `bannedIds` into the one gate and a filtered candidate list into the one draw |
| `src/ui/components/TopBar.tsx` / `.css` | A native read-only `<details>` after `Abandon draft`, absent at zero bans |
| `src/app.tsx` | `bannedNames` through `bannedEntries`; `spriteMeta` to the config screen; `bannedIds: null` on the draft pool |
| `tests/core/bans.test.ts` | 8 tests — the duplicate, the stranger, the sort, non-mutation, and the F-10 tripwire twice |
| `tests/ui/ban-list.test.tsx` | 17 tests — the combobox end to end, the chips, and both starvation modes against the real roster |
| `tests/ui/ban-grid.test.tsx` | 13 tests — both modes of `PoolGrid`, the grid on the screen, and the one-list assertion |
| `tests/ui/ban-mode.test.tsx` | 16 tests — the three modes, the confirm by DOM position, and the disclosure against a seeded document |

## Decisions Made

- **`Too many players for the roster.` is the right sentence at 188 bans, and the plan's
  acceptance string is wrong.** Full argument in Deviation 1. The short version: at the Exact
  preset the requested pool size IS `players × rounds`, so `poolTooLarge` and
  `tooManyPlayersForRoster` reach their threshold on the same ban, and `feasibility.ts`
  deliberately suppresses the former — its doc block says why, and 02-01 wrote the suppression
  on purpose.
- **The mode travels on the data.** `bannedIds: ReadonlySet<string> | null` rather than a
  `mode` prop plus a set. "Ban mode with no ban data" and "draft mode carrying ban data" are
  then both unrepresentable, which is 02-06's `MonChip.showName` discipline applied to a
  larger surface.
- **Ban mode's two unavailable options take the native `disabled` attribute AND the ARIA
  one**, deliberately unlike `FeasibilityBar`'s `Start draft`. Their reason is static and sits
  inside the option's own accessible name (`— Not yet available`), which a natively disabled
  radio still announces; `Start draft`'s reason is computed, changes on every keystroke, and
  lives in a separate element only a focusable control can point at. Both call sites now carry
  a comment saying so, so a reviewer does not "fix" either into agreement with the other.
- **The ban grid renders no `<h2>` and takes no accessible name.** The copywriting contract
  gives `Pool` under the draft screen only and gives the ban grid one string, its count line.
  Inside the `Bans` fieldset the legend already names the region, so ban mode is a
  `<div class="pool pool--ban">` rather than a landmark with an invented name.
- **The typeahead's candidates are the whole roster.** Filtering the banlist out would make
  `No Pokémon matches "{query}".` false for a species that plainly matches and is simply
  already banned, and the idempotent write path already makes a repeat selection harmless.
- **Clearing announces nothing.** The dialog stated the consequence in numbers and the chip
  list emptying is the visible feedback; a third statement of one authorised change would be
  noise. Commented at the handler so the omission reads as a decision.
- **The disclosure is read-only by construction, not by policy.** It renders `<li>` text and
  holds no control, asserted with a zero-`<button>` check. The banlist is written once, at
  Start, through `createTournament`; a mid-draft editor would be a Phase 3 schema decision.
- **`Landorus` is not in the committed Champions roster.** It is the plan's worked example
  throughout and in its manual smoke script. Every assertion uses `Rotom-Wash` instead, which
  is what the plan's own acceptance criteria use, and the test file says so at the top. The
  smoke script's species should be corrected before anyone runs it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The 188-ban acceptance string contradicts the gate 02-01 shipped**

- **Found during:** Task 1
- **Issue:** The plan requires that 188 bans at eight players on the Exact preset blocks Start
  with a reason beginning `Pool is too large.` It cannot. At Exact, `poolSize === players ×
  rounds === 48`, so `48 > legalCount` and `needed > legalCount` become true on the same ban —
  and `feasibility.ts:305` guards `poolTooLarge` with `!tooManyPlayers` precisely so the host
  is not told the pool is too large when the fix is fewer players or fewer bans. Its doc block
  states the reason, and `tooManyPlayersForRoster` outranks `poolTooLarge` in the declared
  precedence besides.
- **Fix:** Implemented and asserted the plan's *intent* — 187 bans survives, the 188th blocks
  — against the sentence the gate actually produces. The test carries the full argument in its
  doc comment so the next reader does not re-derive it. `Pool is too large.` remains reachable
  through bans at a preset where the requested size exceeds the minimum, and nothing about the
  gate changed.
- **Files modified:** `tests/ui/ban-list.test.tsx`
- **Committed in:** `dd8e7f7` / `e0639dc`

**2. [Rule 3 - Blocking] Two new required props forced changes outside their tasks' file lists**

- **Found during:** Task 2
- **Issue:** `PoolGridProps.bannedIds` and `ConfigScreenProps.spriteMeta` are both required,
  and `npm run typecheck` — which Task 2's own gate runs through `npm run build` — fails on
  every call site that does not pass them. `src/app.tsx` holds both, and it is Task 3's file,
  not Task 2's. Four existing test files mount one component or the other.
- **Fix:** `src/app.tsx` updated in Task 2 (`bannedIds={null}` on the draft pool, `spriteMeta`
  to the config screen), plus `config-screen.test.tsx`, `config-feasibility.test.tsx`,
  `pool-density.test.tsx` and `ban-list.test.tsx`. Each new prop carries a comment at its call
  site saying which surface it is and why. Making either optional was rejected: a default would
  let a future draft-screen grid silently acquire ban semantics, which is exactly what the
  nullable-set design exists to prevent.
- **Files modified:** `src/app.tsx`, four test files
- **Committed in:** `c2ba396`

**3. [Rule 3 - Blocking] `toggleBan` cannot be declared a commit before its consumer**

- **Found during:** Task 1
- **Issue:** The plan puts `toggleBan` in Task 1 and its only caller — the ban grid — in
  Task 2. `noUnusedLocals` is on, so Task 1 would not have typechecked.
- **Fix:** Declared it in Task 2 beside the grid that reads it, with a comment in Task 1 at
  the exact spot naming what arrives and why it is not there yet. `applyBan`'s idempotence,
  which is the part of the write path that matters, landed in Task 1 as specified.
- **Files modified:** `src/ui/screens/ConfigScreen.tsx`
- **Committed in:** `e0639dc`, `c2ba396`

**4. [Rule 3 - Blocking] Three existing tests asserted page-wide facts this plan legitimately
widens**

- **Found during:** Tasks 1 and 3
- **Issue:** (a) `config-screen.test.tsx` collected every `label.visually-hidden` on the screen
  and compared it to the five player rows — the ban field's hidden label is a sixth. (b)
  `import-export-controls.test.tsx` renders `TopBar` directly and did not pass the new prop.
- **Fix:** (a) the query is scoped to `.player-list`, which is what the assertion was always
  about. (b) `bannedNames={[]}` with a comment recording that an empty list renders no
  disclosure, which is also what keeps that file's control-count assertions measuring what they
  were written to measure.
- **Files modified:** `tests/ui/config-screen.test.tsx`, `tests/ui/import-export-controls.test.tsx`
- **Committed in:** `e0639dc`, `e6398ef`

**5. [Rule 2 - Missing critical] Two assertions the plan's criteria would have let pass
vacuously**

- **Found during:** Task 3
- **Issue:** (a) The Escape criterion is "leaves the chip count unchanged" — which an Escape
  that did nothing at all satisfies just as well as one that took the safe path. (b) The
  ban-mode disabled criterion checks the attributes but not that the click is actually refused.
- **Fix:** (a) the test asserts the dialog is gone AND the chips are intact, and says in a
  comment why one without the other proves nothing. It also dispatches on `.dialog-backdrop`
  where `Dialog` actually listens, following `confirm-dialogs.test.tsx`'s helper and its stated
  reason — a `document`-level dispatch proves nothing about a real keystroke's path, and it
  failed when tried. (b) a separate test clicks the `Blind` label and asserts the host-banlist
  radio is still checked.
- **Files modified:** `tests/ui/ban-mode.test.tsx`
- **Committed in:** `e6398ef`

### Notes

**The `after {b} bans` copy defect is recorded, not fixed — and this is a decision.**

Three feasibility reason strings interpolate `after {b} bans`, which renders "after 1 bans".
This plan makes that reachable for the first time, because before it `banCount` was always 0.
It was left alone for three reasons, and the recommendation is that the copy table be amended
rather than the code patched here:

1. It is **one of two instances of one class**, not an isolated defect.
   `FeasibilityBar.otherProblemsMessage` renders "1 other problems also block the start." and
   has been reachable since 02-04. Both sites carry the same recorded posture — "the copy table
   is the thing to amend" — written independently by 02-01 and 02-04. Fixing one and not the
   other replaces a consistent known wart with an inconsistency nobody documented.
2. `src/core/feasibility.ts` is **outside this plan's `files_modified`**, and changing its
   strings breaks exact-string assertions in `tests/core/feasibility.test.ts` — a blast radius
   the plan neither scoped nor budgeted.
3. The repository has now recorded this decision **twice, in two files, deliberately**.
   Reversing it unilaterally inside a plan that does not list either file is the kind of
   silent divergence the doc blocks exist to prevent.

**Suggested amendment for whoever owns the copy table:** route both `after {b} bans` and
`{n} other problems also block the start.` through singular/plural helpers in one change, and
delete the two "known wart" notes in the same commit that makes them false — which is what
this plan did for `confirm-copy.ts`'s seventh-set note.

### Acceptance-grep artifacts

Four criteria are unsatisfiable as literal counts. Same class 02-06 recorded three of, and
resolved the same way: verify the criterion's stated intent.

- `grep -c "matchesName" TypeaheadField.tsx` and `grep -c "toSearchKey"` must each return 1.
  Both return **2** — the shared import line plus exactly one call site each. A function cannot
  be imported and called in one line. The criterion's intent, "the shared predicate, not a
  second matcher", holds exactly: one call site each, and no second matcher anywhere. Precedent
  is 02-06's `grep -c "checkFeasibility" src/app.tsx` returning 2.
- `grep -c "auto-fill" PoolGrid.css` must return 1. It returns **2**, and both are
  pre-existing: 02-03's comment explaining the choice, and the declaration. Nothing in this
  plan touched either.
- `grep -rEc "\b235\b|\b74\b" src/` must return 0 for every file. Four pre-existing Phase 1 /
  02-03 doc-comment lines still match, in `PoolGrid.tsx` and `MonCard.tsx`. 02-05 already
  records this as carried forward from 02-01. **This plan introduced none** — verified with
  `git diff HEAD -- src | grep "^+" | grep -E "\b235\b|\b74\b"`, which is empty. Two comments
  written during this plan that would have matched were rewritten before the commit.

---

**Total deviations:** 5 auto-fixed (1 bug, 3 blocking, 1 missing critical), plus one recorded
copy decision and four grep artifacts
**Impact on plan:** No scope change. No requirement, interface contract or design decision
moved. Deviation 1 resolves a conflict between the plan and the module it consumes, in favour
of the module.

## Deferred Issues

None new. The two carried from earlier plans are unchanged: the config screen still has no
route back to the landing screen (D2 in `deferred-items.md`), and `FilterBar` /
`use-roving-tabindex` remain unbuilt by any plan in this phase — the coverage gap 02-07-PLAN's
`<coverage_note>` reports to the orchestrator and explicitly does not close. D-10's "search and
the type filters work in ban mode for free" is true by construction and stays true: the ban
grid reuses `PoolGrid` whole and inherits whatever its header carries, which today is the
density control and nothing else.

One correction for the orchestrator: **the phase's manual smoke script names `Landorus`,
which is not in the committed roster.** Substitute any real species before running it.

## Known Stubs

**None. Both stubs 02-05 and 02-06 recorded for this plan are resolved:**

| Value | Was | Now |
|-------|-----|-----|
| `bannedIds: []` in the single `checkFeasibility` call | literal | `bans`, the screen's state |
| `bans: []` in the config built at Start | literal | a fresh copy of the state array |
| `banMode: 'hostBanlist'` in that config | literal | the `banMode` state the control shows |

The third gap 02-06 made visible — `confirm-copy.ts`'s note recording the seventh copy set as
deliberately absent — is closed by the real copy, and the note is deleted.

Nothing new was introduced. `banMode` stores `blind` and `snake` as values nothing reads: that
is D-12's design rather than a stub, and the control's comment says so.

## Threat Model Coverage

Every `mitigate` disposition in the plan's register is implemented.

| Threat ID | Mitigation | Where asserted |
|-----------|-----------|----------------|
| T-02-30 | Every species name and every host-typed query reaches the DOM as a Preact text child or an attribute value, both of which escape; the no-match sentence is a pre-composed string rendered as a paragraph's text child, never JSX prose | `npm run check:nohtml` — 0 violations in 57 files |
| T-02-31 | `bannedEntries` intersects against the roster, so a stale or hostile id renders no chip, no disclosure row and no count — dropped by construction, not by a check that could be forgotten. `import-guard` gained nothing | `a duplicate and a stale ban id cannot make the top bar disagree with the gate` — `['mon-5','mon-5','not-a-real-id']` renders `Bans (1)` |
| T-02-32 | One derivation feeds the chips, the grid count, the announcement, the confirm body and the disclosure; a core test pins its length equal to `checkFeasibility`'s `banCount` | `agrees with checkFeasibility banCount, duplicates and strangers included`; the array-length grep returns 0 in `ConfigScreen.tsx` and `app.tsx` |
| T-02-33 | `applyBan` returns early when membership already matches, so two surfaces cannot double-write one species; every count is set-based regardless | `adds one chip for a species selected twice, not two` |
| T-02-34 | Accepted, unchanged | The query is normalized once per keystroke and the result sliced to 8; same posture as D-16's undebounced gate |
| T-02-35 | The disclosure renders list text and holds no control; no ban action exists in the vocabulary and none was added | `is read-only: the disclosure holds no control` — zero buttons and zero inputs |
| T-02-SC | Accepted, unchanged | Nothing installed; `git diff --stat package.json package-lock.json` is empty |

## Threat Flags

None. This plan adds no network endpoint, no auth path, no new file access pattern and no
schema change — `bans` and `banMode` were added to schema v2 by 02-02 and are bounded by
`import-guard` already. `git diff --stat` against the base for `model.ts`, `actions.ts`,
`import-guard.ts` and `migrate.ts` is empty.

## Verification

- `npm run verify` exits 0 — `check:pure` (0 violations, 15 files), `check:nohtml`
  (0 violations, 57 files), 757 tests across 38 files, clean build.
- `npm run check:pure:selftest` exits 0.
- `git diff --stat package.json package-lock.json` is empty: no runtime dependency added.
- `git diff --stat 06a9bd4 HEAD -- src/core/model.ts src/core/actions.ts
  src/core/import-guard.ts src/core/migrate.ts` is empty.
- Task 1 greps: `export function bannedEntries` 1, `^import` in `bans.ts` 1, ambient
  identifiers 0, the locale-aware comparator 0, name-splitting 0, array-length counts in
  `ConfigScreen.tsx` 0, `bannedEntries` there 4, `dispatch(` there 0, the ban-action vocabulary
  0 across `src/`, both `[]` literals 0, combobox role 1, listbox role 1, the active-descendant
  attribute 1, the press handler 1, `sort(` in `BanChipList.tsx` 0, the chip label 1, raw hex
  in both new stylesheets 0.
- Task 2 greps: `key={entry.id}` 1, `content-visibility` 0 in both stylesheets, the empty `alt`
  1, the pressed-state expression 1, `bannedIds.size` 0, `of 235 banned` 0, containing-block
  properties in `PoolGrid.css` 0, `max-height: 60vh` 1, raw hex in both stylesheets 0.
- Task 3 greps: `CLEAR_BANLIST_CONFIRM` 1, `deliberately absent` 0, the body's second sentence
  1, `Keep the bans` 1, bare count interpolation 0, `Not yet available` 2, the two mode values
  2, the `banMode` literal 0, `aria-checked` 0, `<details` 1, `<summary` 1, `Bans (0)` 0,
  `handleUndo` 4 with zero removed lines in the diff, `isTextEntry` 2 with zero removed lines,
  `config.bans.length` 0, `bannedEntries` in `app.tsx` 3, raw hex in `TopBar.css` 0.
- Four criteria are artifacts of a literal text search; see the section above.

**Not verified by automation:** the plan's manual smoke on `npm run dev` — landing → New
tournament → four players → ban a species by name → the chip appears and the grid cell dims and
strikes → Start draft → no such cell anywhere in the pool → the top bar names it. Every step is
asserted at component level against the real roster, but nothing in CI drives a browser. Note
that the smoke script's species, `Landorus`, does not exist in the committed roster.

Also unverified headlessly: whether the ban grid's capped scroll region is the right height,
whether `opacity: 0.45` plus a struck name reads as "excluded" rather than "unavailable" at
three metres, and whether the disclosure panel overlaps the board when opened. happy-dom
performs no layout, so all three belong at the phase's human-verify checkpoint.

## Issues Encountered

- The worktree spawned at `80d64e3`, several commits behind the required base `06a9bd4`. HEAD
  was on the `worktree-agent-*` branch and the tree was clean, so the sanctioned
  `git reset --hard` applied cleanly.
- A fresh worktree has no `node_modules`. The batch-file `mklink` route 02-06 recorded still
  ran `cmd.exe` interactively — Git Bash rewrites the bare `/c` switch into a path. Adding
  `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'` to the same invocation worked first time and is
  worth carrying forward. No package was installed and no manifest was touched.
- Escape dispatched on `document` did not close the confirm dialog, which surfaced that
  `Dialog` binds its key handler to `.dialog-backdrop` and relies on the focus trap. Found by
  the strengthened assertion in Deviation 5, not by reading — the weaker version of that test
  passed against an Escape that did nothing at all.
- The 188-ban loop drives 188 real typeahead selections against a mounted 235-cell grid. It
  runs in about a second, so no shortcut was needed; worth knowing before anyone adds a second
  such loop.

## User Setup Required

None — no external service configuration required.

## Next Plan Readiness

Ready. The seams the rest of the phase needs are in place:

- **The `Bans` group is group 4**, between `Mega rules` and `Pool`. There is still exactly one
  `checkFeasibility` call and exactly one `drawPool` call on the config screen, and there must
  stay one of each.
- **`confirm-copy.ts` now holds all seven sets**, and `ConfigScreen`'s confirm union has four
  variants. An eighth destructive action adds a copy set and a variant, not a mechanism.
- **`PoolGrid` takes a mode.** A filter bar (DRFT-08 / DRFT-09) added to its header would land
  on both surfaces at once, which is what "the ban grid reuses `PoolGrid` whole" was built to
  give for free — and both count lines already derive from what is rendered, so both would
  follow a filter with no further change.
- **Phase 4** enables `blind` and `snake` by removing two `disabled` flags and building the
  screens behind them. The values are already in `BanMode`, already stored, and already
  round-trip through `import-guard`, so no saved tournament needs migrating.

Two things to carry forward. First, the copy-table amendment recommended under Notes — it is
now the only known grammar defect in shipped copy, and it has two instances. Second,
`ConfigScreen` now renders the whole roster on the config screen, which makes that screen's
first paint materially heavier than it was; worth a glance at the human-verify checkpoint on a
slower machine, alongside whether `Pool size override` reading `48` on first paint says what it
means.

## Self-Check: PASSED

- All 9 claimed created files and all 14 modified files exist and are tracked by git.
- All four task commits resolve in `git log`: `dd8e7f7`, `e0639dc`, `c2ba396`, `e6398ef`.
- `git diff --diff-filter=D --name-only 06a9bd4 HEAD` is empty: nothing was deleted.
- `.planning/STATE.md`, `.planning/ROADMAP.md` and `.planning/REQUIREMENTS.md` are
  byte-identical to the base commit `06a9bd4` — the orchestrator owns those writes after the
  wave merges. The ids this plan completes are in `requirements-completed` above.

---
*Phase: 02-host-configured-draft-night, plan 07*
*Completed: 2026-08-12*
