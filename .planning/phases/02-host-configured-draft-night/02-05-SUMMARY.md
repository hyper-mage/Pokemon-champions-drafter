---
phase: 02-host-configured-draft-night
plan: 05
subsystem: pool-sizing-and-the-constrained-draw
tags: [numeric-field, nan-hole, pool-presets, constrained-draw, dual-mega, re-roll, tdd]

# Dependency graph
requires:
  - phase: 02-01
    provides: "checkFeasibility's ten-case precedence, poolSizeForPreset, and the two-stage drawPool"
  - phase: 02-02
    provides: "schema v2's megasRequiredPerTeam, dualMegaChoices and poolSize config fields, and pool/built.megaCapableCount"
  - phase: 02-03
    provides: "SegmentedControl with its required per-instance name, and the token set"
  - phase: 02-04
    provides: "ConfigScreen's group structure, the two independent seeds, the FeasibilityBar, and the createTournament seam"
provides:
  - "NumericField + parseNumericField — a free numeric input that parses to number | null"
  - "ConfigScreen group 3 (Mega rules) — the requirement field and roster-derived dual-Mega rows"
  - "ConfigScreen group 5 (Pool) — three presets, the free override, the draw readout, Re-roll pool"
  - "A pool draw constrained to players × megasRequiredPerTeam Mega-capable entries"
  - "The pool-dry invariant, pinned by a regression test rather than by defensive code"
affects:
  - "02-07 (inserts the Bans group BEFORE Pool; feeds bannedIds into the same single gate call and candidates into the same single draw)"
  - "02-09 (inserts a confirmation in front of handleRerollPool)"
  - "phase-03 (reads megasRequiredPerTeam and dualMegaChoices as compiler input, and pool/built.megaCapableCount as RULE-09's recorded figure)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A numeric field parses to number | null at the boundary so NaN never reaches an arithmetic comparison"
    - "An override holds string | null: null means 'tracking the preset', a string means 'this is mine now'"
    - "A derived-list config field is ordered by the rendered rows, never by the order the host clicked"
    - "An externally derived readout renders only while the configuration is satisfiable"

key-files:
  created:
    - src/ui/components/NumericField.tsx
    - src/ui/components/NumericField.css
    - tests/ui/config-feasibility.test.tsx
  modified:
    - src/ui/screens/ConfigScreen.tsx
    - src/ui/screens/ConfigScreen.css
    - tests/ui/config-screen.test.tsx

decisions:
  - "An emptied Pool size override BLOCKS rather than falling back to the preset — the plan's action text and one behaviour bullet said otherwise and lose to its own must_haves, behaviour block and acceptance criteria"
  - "The override is string | null so 'untouched' and 'emptied' are different answers; while untouched the field displays and follows the preset"
  - "dualMegaChoices is ordered by the rendered rows, so two hosts who made the same rulings get byte-identical documents"
  - "Choosing Either REMOVES a row's entry rather than recording it, because an absent entry already means Either"
  - "The readout reads drawPool's own ids.length, never the requested size, so the two cannot drift"
  - "Dual-Mega rows are labelled by a <p>, not a nested <legend> — every row already carries a self-describing legend"

requirements-completed: [DRFT-02, DRFT-03, DRFT-15, RULE-07]

# Metrics
duration: 29min
completed: 2026-08-11
---

# Phase 2 Plan 05: Pool Sizing and the Constrained Draw Summary

**The host now sizes the pool from three presets or types any size over them, sets how many
Megas each team must field, sees the resulting draw in numbers and re-rolls it — and an empty
or malformed pool size blocks Start with a sentence about the field they are typing in rather
than reporting all-clear on a draft with no pool.**

## Performance

- **Duration:** ~29 min
- **Started:** 2026-08-11T19:19Z
- **Completed:** 2026-08-11T19:48Z
- **Tasks:** 3 of 3, all TDD — six commits, RED then GREEN
- **Files:** 6 (3 created, 3 modified)
- **Tests:** 647 passing, up from 616 — 31 added across two files

## Task Commits

1. **Task 1: NumericField and the Mega rules group** — `0082009` (test) → `6e27c95` (feat)
2. **Task 2: the Pool group, and the NaN hole closed end to end** — `adff924` (test) → `1e9c28d` (feat)
3. **Task 3: constrain the draw and record the drawn count** — `b7cf688` (test) → `7392c18` (feat)

No REFACTOR commit was needed on any task — each GREEN implementation was already the shape
the plan specified.

## Accomplishments

- **The F-08 hole is closed at the boundary, not patched at the gate.** `parseNumericField`
  collapses `''`, `'   '`, `'abc'` and `'4e'` to `null`, so the value that reaches
  `checkFeasibility` is a case TypeScript forces it to handle rather than a `NaN` that
  silently passes both `> legal` and `< players × rounds`. `grep -c "Number(raw)"` on the
  config screen returns 0, and the absence is asserted rather than promised.
- **Emptying the pool size field blocks Start with the pool field's own sentence.** The test
  that pins this is named for what it defends —
  `an emptied pool size field blocks the start, rather than starting a draft with no pool`.
- **The drawn pool actually satisfies the Mega requirement.** At 8 players requiring 4 Megas
  each on a 48-card Exact pool the readout appears in under 500 ms with at least 32
  Mega-capable entries, and `pool/built.megaCapableCount` recounts against the roster exactly.
  `grep -rEc "while \(|for \(;;\)"` on the config screen returns 0: there is no retry loop,
  and the ~64 million expected redraws that would justify one are recorded in a comment at
  the call site so the next reader does not reintroduce them.
- **Dual-Mega rows come from the roster.** `entries.filter((entry) => entry.megaFormes.length > 1)`,
  with zero occurrences of `charizard` or `raichu` anywhere in `ConfigScreen.tsx`. The two
  rows sit in two different radio groups, which is asserted rather than assumed — a shared
  `name` would look like a rendering glitch rather than a naming bug.
- **Re-roll pool provably cannot disturb the starting order.** It draws a NEW seed; the test
  compares the rendered order before and after and then starts the draft to compare the pool
  ids against a `drawPool` run on the re-roll seed.
- **Runtime dependency count unchanged at two.** `git diff --stat package.json` is empty.

## Files Created/Modified

| File | What it does |
|------|-------------|
| `src/ui/components/NumericField.tsx` | `parseNumericField` plus a labelled `<input type="number">` whose raw string the caller holds. `min`/`max` are rendered as affordances and enforce nothing |
| `src/ui/components/NumericField.css` | Deliberately the same shape as `.config-screen__input`; tokens only, no raw hex |
| `src/ui/screens/ConfigScreen.tsx` | Groups 3 (`Mega rules`) and 5 (`Pool`), the effective-pool-size derivation, the constrained draw, the readout, `Re-roll pool` |
| `src/ui/screens/ConfigScreen.css` | `__subheading`, `__readout`, `__reroll` |
| `tests/ui/config-screen.test.tsx` | +12 tests — `parseNumericField`, the `NumericField` label binding, and the Mega rules group against both the fixture and the committed roster |
| `tests/ui/config-feasibility.test.tsx` | 19 tests, all against the real 235-entry roster — the presets, the override, every feasibility sentence, the readout, the re-roll, the constrained draw and the pool-dry invariant |

## Decisions Made

- **An emptied `Pool size override` blocks; it does not fall back to the preset.** This is
  the one genuine conflict inside the plan and it is resolved in favour of the plan's own
  `must_haves`, `<behavior>` block and acceptance criteria — see Deviation 1 below for the
  full argument, including the empirical reason (`abc` sanitizes to the empty string in a
  number input) that the alternative would make the defect this plan exists to close
  unreachable through the field it is about.
- **The override is `string | null`, not `string`.** `null` means "not overriding" and the
  field displays and follows the preset; a string means the host has taken it over. Two
  states rather than one, because "untouched" and "emptied" are different answers and the
  gate has to be able to tell them apart. The property the plan asked for — that clearing
  never resurrects a stale typed number — holds: while `null` the field IS the preset, and
  there is no remembered number anywhere to fall back to.
- **`dualMegaChoices` is ordered by the rendered rows, not by click order.** Two hosts who
  made the same rulings get byte-identical documents, which is what makes an exported
  tournament comparable. ARCHITECTURE sync rule 14 forbids taking order from a key set; this
  takes it from the roster's display order instead.
- **Choosing `Either` removes a row's entry.** An absent entry already means `either`
  (`model.ts`), so recording it would be a second encoding of one answer — and two encodings
  of one answer is how an importer ends up with a rule the host never set.
- **The dual-Mega rows are not re-sorted here.** `entries` arrives in display order
  (`app.tsx` sorts once, by dex number with an id tiebreak) and a filter preserves it, so the
  rows are deterministic without this screen owning a second comparator that could disagree
  with the pool grid's.
- **The readout reads `draw.ids.length`, not `poolSize`.** They agree, but only because the
  draw is what produced both; reading the requested size would be a number that can outlive
  the draw it claims to describe.
- **`Dual-Mega species` is a `<p>`, not a nested `<legend>`.** Each row below it already
  carries a self-describing legend (`Charizard Mega forme`), so the heading is a visual
  grouping aid and announcing it as structure would claim a level the form does not have.
- **The `?? 0` fallbacks on `megasRequiredPerTeam` are unreachable and stay.** At the two
  call sites that matter, `feasibility.blocked` is already false and a null field is itself a
  blocker. The compiler cannot see that, and inventing a number the host did not choose would
  be worse than the branch.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The plan contradicts itself about what an empty `Pool size override` does**

- **Found during:** Task 2
- **Issue:** The `<action>` block says "the effective pool size is … `poolSizeForPreset(...)`
  when it is empty. Clearing the field therefore returns to the preset", and one `<behavior>`
  bullet repeats it. But `must_haves.truths` says "Emptying the pool size field disables Start
  with a sentence about the pool size field", the `<behavior>` block says emptying blocks and
  names the exact sentence, and two acceptance criteria require `aria-disabled="true"` plus
  that sentence. These cannot both hold.
- **Fix:** Implemented the blocking reading. Three independent reasons: (a) it is the plan's
  own `must_haves`, which outrank a clause in the action prose; (b) it is the plan's stated
  purpose and the locked STATE.md decision — the whole point is that a naive gate enables
  Start on a broken config; (c) **empirically decisive** — `<input type="number">` sanitizes
  `abc` to the empty string (verified in happy-dom: `abc → ''`, `4e → '4e'`, `48.5 → '48.5'`),
  so under "empty means preset" the acceptance criterion "entering `48.5` and `4e` each yield
  the same sentence" is unsatisfiable and typing `abc` would silently produce a satisfiable
  configuration. The design that satisfies everything else is `string | null`: while `null`
  the field displays and tracks the preset, so the fallback target is the preset and never a
  stale typed number.
- **Files modified:** `src/ui/screens/ConfigScreen.tsx`
- **Verification:** `an emptied pool size field blocks the start…` and
  `says the same thing about a fraction and about a malformed number` both pass;
  `auto-sizes the pool from the player count at each preset` pins the tracking behaviour.
- **Committed in:** `1e9c28d`

**2. [Rule 3 - Blocking] `poolSize` became `number | null` and two call sites did not compile**

- **Found during:** Task 2
- **Issue:** The effective pool size is now nullable, and both the `drawPool` memo and
  `handleStart` treated it as a `number`. `npm run typecheck` — Task 2's own gate — fails.
- **Fix:** Added `poolSize === null` to both guards. Neither is reachable while
  `feasibility.blocked` is false (a null pool size is itself a blocker), and both are stated
  as compiler-visibility branches rather than as defence. `FeasibilityBar`'s `poolSize` prop
  was already typed `number | null` by 02-04 in anticipation, so no prop changed.
- **Files modified:** `src/ui/screens/ConfigScreen.tsx`
- **Verification:** `npm run typecheck` exits 0.
- **Committed in:** `1e9c28d`

**3. [Rule 2 - Missing critical] Two guard tests the plan's criteria do not require**

- **Found during:** Tasks 2 and 3
- **Issue:** (a) The subsequence criterion says "asserted with a forward two-cursor walk, not
  a set comparison", but nothing would catch a walk that silently degenerated into one.
  (b) The constrained-draw tests assert `megaCapableCount >= 32` — which a draw that ignored
  the requirement could still pass by luck on a different seed.
- **Fix:** (a) Added the reversed-array assertion beside the subsequence one, following the
  guard 02-01 established for the same helper in `tests/core/draw.test.ts`. (b) Added
  `leaves the draw unconstrained at a requirement of zero`, which asserts the SAME
  configuration draws fewer than 32 Megas with no requirement set — so the two tests together
  pin that the number moved because of the field rather than because of the seed. It failed
  at 19 on the RED commit, which is the evidence.
- **Files modified:** `tests/ui/config-feasibility.test.tsx`
- **Verification:** both guards pass; inverting `isSubsequence` fails its own test.
- **Committed in:** `b7cf688`

**4. [Rule 3 - Blocking] `tests/ui/config-screen.test.tsx` needed the committed roster, and the store singleton forced a test's position**

- **Found during:** Task 1
- **Issue:** Task 1's dual-Mega criteria are about what really exists, and that file's
  60-entry fixture carries no `megaFormes` at all. Separately, the file records that its
  feasibility-bar block runs before its `Start draft` block deliberately, because the store
  is a module singleton with no reset and `getDoc()` is only null until something creates a
  tournament — so a new test that starts a tournament could not live in the Mega rules block
  without breaking `expect(getDoc()).toBeNull()` three describes later.
- **Fix:** Added the committed snapshot and a `mountCommitted` helper alongside the existing
  fixture, and moved the one new test that clicks Start into the existing `Start draft` block
  at the end of the file.
- **Files modified:** `tests/ui/config-screen.test.tsx`
- **Verification:** all 34 tests in the file pass, including the pre-existing null assertions.
- **Committed in:** `0082009` / `6e27c95`

---

**Total deviations:** 4 auto-fixed (2 blocking, 1 bug, 1 missing critical)
**Impact on plan:** No scope change. Deviation 1 is a resolution of an internal contradiction,
decided in favour of the plan's own `must_haves`; the other three are mechanical.

## Deferred Issues

None new. The two carried from earlier plans are unchanged: the config screen still has no
route back to the landing screen (D2 in `deferred-items.md`, 02-09's natural home), and the
`\b235\b` acceptance grep from 02-01 still fails on nine Phase 1 doc comments. Neither is
touched by this plan.

## Known Stubs

Two, both values plan 02-07 authors, both already documented at the point of use by 02-04 and
carried forward unchanged:

| Value | Where | Resolved by |
|-------|-------|-------------|
| `bannedIds: []` | `ConfigScreen.tsx` — the single `checkFeasibility` call | 02-07 adds the `Bans` group |
| `bans: []` / `banMode: 'hostBanlist'` | `ConfigScreen.tsx` — the `TournamentConfig` built at Start | 02-07 |

Both are the honest value today rather than a placeholder: nothing on the screen can yet ban
anything, and `hostBanlist` is the only mode Phase 2 runs (D-12). The two stubs 02-04 listed
for this plan — the fixed Exact pool size and `megasRequiredPerTeam: 0` — are both resolved.

Neither remaining stub blocks this plan's goal: a host can size a pool three ways, override
it freely, require Megas, and start a draft whose pool satisfies that requirement.

## Threat Model Coverage

Every `mitigate` disposition in the plan's register is implemented.

| Threat ID | Mitigation | Where asserted |
|-----------|-----------|----------------|
| T-02-19 | `megasRequired` reaches the O(L) two-stage partition draw, with no loop bound and no retry | `grep -Ec "while \(\|for \(;;\)"` returns 0; `asks for players × megasRequiredPerTeam Megas, gets them, and does not hang` bounds the 8-player / k=4 / Exact case at 500 ms |
| T-02-20 | Emptiness and unparseability collapse to `null` at the field boundary | `grep -c "Number(raw)"` returns 0; `parseNumericField` asserted on `''`, `'   '`, `'abc'`, `'4e'`, `'48.5'`, `'-3'` |
| T-02-22 | `megaCapableCount` is the drawn set's own count, never an echo of the request | `records the drawn Mega-capable count into the log, recountable against the roster` recounts `pool.ids` against the roster's `megaCapable` flag |
| T-02-21, T-02-SC | Accepted, unchanged | The gate still recomputes on every keystroke with no debounce (D-16); `git diff --stat package.json` is empty |

## Threat Flags

None. This plan adds no network endpoint, no auth path, no file access pattern, and no schema
change — `megasRequiredPerTeam`, `dualMegaChoices` and `poolSize` were all added to schema v2
by 02-02 and are bounded by `import-guard` already.

## Verification

- `npm run verify` exits 0 — `check:pure` (0 violations, 14 files), `check:nohtml`
  (0 violations, 51 files), 647 tests across 31 files, clean build.
- `git diff --stat package.json` is empty; `package-lock.json` untouched.
- Task 1 greps: `export function parseNumericField` 1, `Math.min|Math.max|clamp` 0,
  `megaFormes.length > 1` 1, `'charizard'|"charizard"|'raichu'|"raichu"` 0, raw hex in
  `NumericField.css` 0.
- Task 2 greps: `Number(raw)` 0, `parseNumericField` 4 (≥ 2 required), `poolSizeForPreset` 2,
  `newSeed()` 4 (≥ 3 required), raw hex in `ConfigScreen.css` 0.
- Task 3 greps: `players.length * ` 1 and the matched line is the `megasRequired` argument,
  `megaCapableCount` 5, `while (|for (;;)` 0.
- `grep -rn "megasRequiredPerTeam" src/` outside `src/core/` shows it in exactly one file. It
  reaches the state derivation, the gate input, the draw's quota, the stored config, and the
  helper sentence. It builds no rounds and compiles no schedule — Phase 3 still owns all of
  that.

**Not verified by automation:** the plan's manual smoke on `npm run dev` (8 players, Megas
required 4, Exact — the readout appears without a visible stall and Start produces a 48-card
pool). The equivalent is asserted at component level against the real roster, including the
wall-clock bound and the recount of `pool/built.megaCapableCount`, but nothing in CI drives a
browser. Worth a minute at the phase's human-verify checkpoint, along with a look at whether
a field labelled `Pool size override` reading `48` on first paint says what it means.

## Issues Encountered

- The worktree spawned at `80d64e3`, several commits behind the required base `4711329`.
  HEAD was on the `worktree-agent-*` branch and the tree was clean, so the sanctioned
  `git reset --hard` applied cleanly.
- A fresh worktree has no `node_modules`. The first `mklink` invocation returned only the
  `cmd.exe` banner without creating anything — the arguments were mangled by the single-slash
  switch form. `cmd.exe //c mklink //J …` worked. No package was installed and no manifest
  was touched.
- The empty-versus-preset question in Deviation 1 was settled by measurement rather than by
  reading: a scratch test under happy-dom established that a number input sanitizes `abc` to
  the empty string but keeps `4e`, which is what makes one of the two readings unable to
  satisfy the plan's own acceptance criteria. The scratch file was deleted, not committed.

## User Setup Required

None — no external service configuration required.

## Next Plan Readiness

Ready. The seams the rest of the phase needs are in place:

- **02-07** adds the `Bans` group as group 4, BETWEEN `Mega rules` and `Pool`. There is still
  exactly one `checkFeasibility` call and exactly one `drawPool` call, and there must stay one
  of each: `bannedIds` goes into the first and a filtered `candidates` into the second. The
  gate already reports `legalCount`, `megaCapableLegalCount` and `banCount`, so every ban
  sentence is already interpolated correctly the moment a ban exists.
- **02-09** wraps `handleRerollPool` in a confirmation (D-36). It is already a single call
  site taking no argument, so that plan inserts a dialog rather than reshaping this component.
- **Phase 3** reads `config.megasRequiredPerTeam` and `config.dualMegaChoices` as compiler
  input, and `pool/built.megaCapableCount` as RULE-09's recorded figure. The comment at the
  `createTournament` call site records that Phase 3 must handle the day that figure and a
  rotated roster disagree.

Two things to carry forward. First, `ROUNDS` is still a module constant read by six
derivations now rather than four; Phase 3's variable round count changes it in one place, and
both `poolSizeForPreset`'s `Math.ceil` and the `max={ROUNDS}` on the Megas field are already
waiting for it. Second, `Pool size override` displays the preset value on first paint, which
reads correctly but means the word "override" describes what the host may do rather than what
they have done — worth a glance at the human-verify checkpoint before the copy is settled.

## Self-Check: PASSED

- All six claimed files exist and are tracked by git.
- All six task commits resolve in `git log`: `0082009`, `6e27c95`, `adff924`, `1e9c28d`,
  `b7cf688`, `7392c18`.
- `.planning/STATE.md` and `.planning/ROADMAP.md` are byte-identical to the base commit
  `4711329` — the orchestrator owns those writes after the wave merges. `REQUIREMENTS.md` is
  untouched for the same reason 02-03 and 02-04 give: it is a shared file and other plans in
  this wave claim `DRFT-` ids, so a per-worktree edit would conflict on merge. The ids this
  plan completes are in `requirements-completed` above.
- `git diff --diff-filter=D --name-only 4711329 HEAD` is empty: nothing was deleted.

---
*Phase: 02-host-configured-draft-night, plan 05*
*Completed: 2026-08-11*
