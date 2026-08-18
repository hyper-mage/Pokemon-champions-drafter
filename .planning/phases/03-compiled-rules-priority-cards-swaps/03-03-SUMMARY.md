---
phase: 03-compiled-rules-priority-cards-swaps
plan: 03
subsystem: ui
tags: [config-form, reorder, accessibility, aria-disabled, focus-management, preact]

# Dependency graph
requires:
  - phase: 03-compiled-rules-priority-cards-swaps
    plan: 02
    provides: compile(), the schedule/compiled action, CreateTournamentInput.schedule
  - phase: 03-compiled-rules-priority-cards-swaps
    plan: 01
    provides: RoundSpec and RoundKind, CompositionRule, schema 3
  - phase: 02-host-configured-draft-night
    provides: ConfigScreen's pre-document form-state model, PlayerList's row/button pattern, SplitPanes' PaneAvailability union, NumericField's raw-string contract
provides:
  - SchedulePreview — the ordered schedule rows, the reorder buttons, the nothing-to-reorder state
  - the Round schedule sub-section inside the Mega rules group
  - the amended Megas required per team helper (RULE-01's surface)
  - a config-time reorder that survives Start and reaches the log (RULE-06)
  - .config-screen__section / __section-heading — the sub-section shape 03-UI-SPEC §1 asks for
  - a corrected ROUNDS comment
affects:
  [
    03-04 Mega-forme bans (fourth sub-section in the same group),
    03-06 Mega-round pool filter,
    03-08 priority cards,
    03-10 swap predicate,
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'A control whose inert condition can never be false renders unconditionally, with the reason recorded where the branch would have gone'
    - 'Focus follows the thing that moved, not the control that moved it — otherwise a second press reverses the first'
    - 'Form state that derives from a field is discarded by the field''s own handler, compared on the PARSED value so a no-op edit keeps it'
    - 'A reorder swaps KINDS between fixed ordinals and re-indexes, so the ordinal stays the row''s identity'

key-files:
  created:
    - src/ui/components/SchedulePreview.tsx
    - src/ui/components/SchedulePreview.css
    - tests/ui/schedule-reorder.test.tsx
  modified:
    - src/ui/screens/ConfigScreen.tsx
    - src/ui/screens/ConfigScreen.css
    - tests/ui/config-screen.test.tsx

key-decisions:
  - 'The single rule line renders unconditionally rather than behind "at least one button is inert" — in any schedule that renders buttons at all, row 1''s Move up and the last row''s Move down are both inert, so the branch could never take its false arm'
  - 'The reorder is discarded by the Megas-required input handler, compared on the parsed value, rather than by a basis field checked at render — one authority, and 2 → 3 → 2 genuinely discards instead of resurrecting'
  - 'onMove reports the 0-based ARRAY POSITION, not spec.index, and the prop doc says so — the two differ by one and the collision is the obvious way to get this wrong'
  - 'The rule list is one memo with two consumers (compile and the config literal) rather than two constructions of the same array'
  - 'Round schedule is a real <h2>, matching Starting order inside the Players group; Dual-Mega species is left as-is and logged for 03-04'

patterns-established:
  - 'MoveAvailability — the PaneAvailability union applied a second time, so an inert control with no reason does not type-check'
  - 'A ref map keyed {direction}:{position} plus a layout effect is how focus reaches a control that only holds the moved value after the parent re-renders'

requirements-completed: [RULE-01, RULE-06]

# Metrics
duration: 14min
completed: 2026-08-17
---

# Phase 3 Plan 03: The Schedule Preview and Its Reorder Summary

**A host types `2` into `Megas required per team`, sees six rows reading `Round 1 — Mega`
down to `Round 6 — Open` appear directly beneath the field, walks both Mega rounds to the
bottom with `Move down`, and starts a draft whose `schedule/compiled` entry carries
`open, open, open, open, mega, mega` — the order they left, not the one the compiler would
emit.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-08-17T22:36:00Z
- **Completed:** 2026-08-17T22:50:00Z
- **Tasks:** 2
- **Files modified:** 6 (2 source created, 2 source modified, 1 test created, 1 test modified)

## Accomplishments

- **RULE-06's permutation now exists, and it is the reason `schedule/compiled` is in the
  log at all.** Before this plan the canonical order genuinely was the approved schedule, so
  a document that recorded only the rules would have folded to the same thing. It no longer
  would: eight button presses produce a schedule the compiler will never emit from any
  requirement, and the plan's headline test asserts exactly that — reorder, Start, then read
  the created document's payload. It is the one assertion a recompute-at-Start
  implementation fails while passing every other test in the file.
- **The reorder buttons say why they are inert, and shed the ARIA when they stop being
  inert.** All five 03-UI-SPEC accessible-name cases are implemented and each one contains
  its visible label as a substring (SC 2.5.3). `aria-disabled` is `undefined` rather than
  `'false'` when the move becomes possible — WR-04, and the assertion that catches it is
  `getAttribute('aria-disabled') === null`, because `'false'` would pass every other test in
  the file and still be read as disabled by anything that believes it.
- **Focus follows the moved round, so a Mega round can walk from round 1 to round 6 by
  keyboard.** A test presses whatever currently holds focus five times and asserts the Mega
  round lands on round 6; leaving focus on the pressed button makes press two undo press
  one, which is invisible on screen and fatal to keyboard use.
- **`Megas required per team` now states a rule set rather than a number.** The amended
  helper's first clause — `0 means no Mega requirement, and no slot is a Mega slot — nothing
  exports with a Mega Stone.` — is the answer to 03-RESEARCH's stress-test case 3, where a
  host wanting a Mega-less night reaches for 76 forme bans instead of typing `0`.
- **The stale `ROUNDS` comment is gone.** It predicted "Phase 3 makes the round count a host
  decision"; D-06 declines that. The replacement says what actually carries forward — one
  constant in one place, every derivation reading `config.rounds`, no literal `6` anywhere —
  and records host-selectable team size as deferred rather than leaving the next reader to
  rediscover that it was considered.

## Task Commits

1. **Task 1: `SchedulePreview` — six rows, two buttons each, and the reasons they are
   inert** — `6280867`
2. **Task 2: The `Round schedule` sub-section, and the rule set the host is stating** —
   `05f52ad`

Both are `feat`. No RED/GREEN split: the plan is `type: execute`, not `type: tdd`, and
neither task carries `tdd="true"`.

## Files Created/Modified

- `src/ui/components/SchedulePreview.tsx` — **new.** `SchedulePreview`, `MoveDirection`, the
  `MoveAvailability` union, `availabilityOf`, `moveName`, and the copy constants. The doc
  block argues the four decisions a later reader will otherwise reopen: why it owns no
  state, why the rows ARE an `<ol>` when `PlayerList`'s name rows are not, why a move swaps
  kinds rather than rows, and why there is no roving tabindex.
- `src/ui/components/SchedulePreview.css` — **new.** Rows, controls, the inert treatment at
  `opacity: 0.45`, and the rule line. Tokens only; zero hex; no `:focus` rule.
- `tests/ui/schedule-reorder.test.tsx` — **new.** 21 tests across five groups: the rows, the
  accessible names, the inert behaviour, the nothing-to-reorder states, and what happens
  after a successful move. Includes a `Harness` that performs the swap, which is what the
  focus assertions need somewhere to land.
- `src/ui/screens/ConfigScreen.tsx` — the `reorderedSchedule` state, the `rules` and
  `canonicalSchedule` memos, `handleMegasRequiredInput`, `handleMoveRound`, the
  `Round schedule` sub-section markup, `handleStart` passing the preview state, the amended
  helper, the corrected `ROUNDS` comment, and the module block's group-order paragraph
  naming the sub-sections.
- `src/ui/screens/ConfigScreen.css` — `.config-screen__section` and
  `.config-screen__section-heading`.
- `tests/ui/config-screen.test.tsx` — `mountAnnouncing`, `liveRegionText`, `scheduleRows`,
  `moveButton`, the amended-helper assertion, and six new cases.

## Decisions Made

- **The single rule line renders unconditionally, and the comment says why rather than the
  code pretending to check.** 03-UI-SPEC words it as "renders when at least one button is
  inert". Any schedule that renders buttons at all is a mixed one, and in a mixed schedule
  row 1's `Move up` is inert (already first) and the last row's `Move down` is inert
  (already last) — always, for every requirement from 1 to 5. A conditional there could
  never take its false arm. This is the same call 03-02 made about `canApply`'s contiguity
  branch, for the same reason: unreachable code that looks like a check is worse than no
  check, because the next reader has to work out which authority wins. A test asserts the
  line is present with a mixed schedule and absent with a uniform one, which is the whole of
  the observable contract.
- **The reorder is discarded by the field's own handler, not by a basis compared at
  render.** The obvious alternative — store `{ basis, rounds }` and use the permutation only
  while `basis === megasRequiredPerTeam` — has a visible bug: 2 → 3 → 2 resurrects a
  permutation the host was told had been discarded. Discarding in `handleMegasRequiredInput`
  is one authority and matches the word "discard". It compares the PARSED value, so `0` →
  `00` is not a new requirement and does not throw away a schedule the host is looking at.
- **`onMove` reports the 0-based array position, and the prop doc block says so in
  capitals.** `RoundSpec.index` is the 1-based round number, so a prop named `index` that
  meant something else by one is the obvious way to get this wrong. The plan fixed the
  signature; this is the doc that makes it survivable.
- **`rules` is one memo with two consumers.** `compile` reads it and `handleStart` copies
  from it. The plan's `<behavior>` quotes the literal
  `[{ kind: 'mega', count: megasRequiredPerTeam ?? 0 }]` staying inline in the config
  literal; keeping it there as well as building it for `compile` would be two constructions
  of one fact, which is the thing every other derivation on this screen is written to avoid.
  The document's `rules` value is byte-identical either way, and the existing test asserting
  `config.rules` deep-equals `[{ kind: 'mega', count: 2 }]` still passes untouched.
- **A move swaps kinds between fixed round numbers, then re-indexes from position.** Rows
  are keyed by `spec.index`, so the button DOM nodes survive a move — which is what makes
  the focus handoff possible at all — and the rows can never render `Round 3` above
  `Round 2`. A test asserts ascending round numbers after two moves, and the Start test
  asserts `[1,2,3,4,5,6]` after eight.
- **`Round schedule` is a real `<h2>`.** `PlayerList`'s `Starting order` already sets that
  precedent inside a fieldset, and this sub-section holds a list plus a rule line, which is
  a level the form genuinely has. `--space-5` of separation is expressed as `--space-3` of
  margin on top of the group's own `--space-3` flex gap; the stylesheet states the
  arithmetic and names the dependency rather than leaving it to be rediscovered.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `config-screen.test.tsx` asserted the superseded helper string**

- **Found during:** Task 2
- **Issue:** `interpolates the helper from the player count and the value on screen`
  asserted `0 means no Mega requirement. A requirement of 2 needs at least 8 Mega-capable
  Pokémon in the pool.` — the Phase 2 copy this plan is required to replace. Not a test to
  delete: the interpolation it guards is exactly what the amendment keeps.
- **Fix:** Updated to the 03-UI-SPEC string, with a comment saying what the amendment's
  first clause is for.
- **Files modified:** `tests/ui/config-screen.test.tsx`
- **Verification:** `npx vitest run tests/ui/` — 395 passed.
- **Committed in:** `05f52ad`

**2. [Rule 1 - Bug] The first `liveRegionText` helper selected the wrong status element**

- **Found during:** Task 2
- **Issue:** `host.querySelector('[role="status"]')` returned the feasibility bar's reason
  line, not the global live region — three elements on this screen carry that role. The test
  failed with `Every player needs a name. Player 1 is blank.`, which is a correct string in
  the wrong element.
- **Fix:** Selected by `[aria-live="polite"]`, matching `ban-list.test.tsx`'s helper and its
  comment, which had already found and documented this.
- **Files modified:** `tests/ui/config-screen.test.tsx`
- **Verification:** `npx vitest run tests/ui/` — 395 passed.
- **Committed in:** `05f52ad`

### Plan Text Not Followed

**The single rule line is not behind a condition.** See Decisions Made, first entry. The
`<behavior>` bullet's substance holds — the line is present whenever a button can be inert
and absent when none can be — but it is carried by the same `uniform` branch that decides
whether buttons render at all, rather than by a second test that can only ever be true.

**Two acceptance criteria are unsatisfiable exactly as written and were evaluated on their
intent.** Both are recorded here rather than quietly passed:

| Criterion | Why it cannot return 0 | Evaluated as | Result |
|-----------|------------------------|--------------|--------|
| `grep -c "disabled={" src/ui/components/SchedulePreview.tsx` returns 0 | `aria-disabled={` CONTAINS `disabled={` as a substring, and the same file is required to carry `aria-disabled` | `grep -Ec '(^\|[^-])disabled=\{'` — native `disabled` only | **0** |
| `grep -c "dispatch" src/ui/screens/ConfigScreen.tsx` returns 0 | The file carried three prose mentions before this plan (`## Nothing here dispatches`, and two sentences about what `dispatch` returns) | The `<behavior>` bullet's own wording — "finds nothing new" — plus `grep -Ec '\bdispatch\('` | **3 lines, unchanged from before this plan; 0 calls** |

The second one changed the code: a new doc block initially read "NOTHING here dispatches",
taking the count to 4. It was reworded to "A reorder writes NO action — see the module block
above", which says the same thing, avoids repeating a rule the module block already states,
and keeps the count where the plan expects it.

**One acceptance criterion was met by rewording rather than by omission.**
`grep -c "use-roving-tabindex"` must return 0. The doc block explains why the hook is not
wired (03-UI-SPEC asks for that explanation explicitly), and naming the module verbatim
would have failed the grep. It names the export, `useRovingTabindex`, which is also how
`SegmentedControl` refers to the concept in prose.

---

**Total deviations:** 2 auto-fixed (1 × Rule 3, 1 × Rule 1), 1 documented departure from
plan text, 3 acceptance criteria evaluated on intent with the reasoning recorded.
**Impact on plan:** None on scope. No new field, no new control beyond the two the plan
specifies, no dependency. `package.json` and `package-lock.json` are byte-identical.

## Issues Encountered

**The known `tests/ui/ban-list.test.tsx` timeout did not reproduce.** `npm run verify`
reported **1030 passed, 0 failed** at `05f52ad`. As 03-02 recorded, that is not evidence the
flake is fixed — nothing in this plan touches the ban path — so it stays in
`deferred-items.md` unchanged.

**One inconsistency was created and logged rather than fixed.** `Mega rules` now holds two
sub-heading treatments: `Round schedule` at `--text-heading` inside `.config-screen__section`
(03-UI-SPEC §1's contract) and `Dual-Mega species` still at `--text-label` in a `<p>`. Fixing
the second is 03-04's change to make, because that plan adds the group's fourth sub-section
and is therefore the change that decides the group's internal hierarchy. Recorded as
`deferred-items.md` item 2, with the stylesheet comment that would need rewriting named.

## Verification Evidence

`npm run verify` at `05f52ad`: `check:pure` 0 violations in 16 files, `check:nohtml` 0
violations in 61 files, **1030 tests passed across 45 files**, typecheck clean on both
projects, `vite build` succeeded, service worker manifest 322 URLs / 961.7 kB precached.

Task 1 acceptance criteria, run against the tree at `6280867`:

| # | Check | Expected | Actual |
|---|-------|----------|--------|
| 1 | `npx vitest run tests/ui/schedule-reorder.test.tsx` | exit 0 | 21 passed |
| 2 | `npm run check:nohtml` | exit 0 | 0 violations |
| 3 | `grep -c "export function SchedulePreview" …/SchedulePreview.tsx` | 1 | 1 |
| 4 | `grep -c "aria-disabled" …/SchedulePreview.tsx` | ≥ 1 | 2 |
| 5 | native `disabled={` (see the table above) | 0 | 0 |
| 6 | `grep -c "use-roving-tabindex" …/SchedulePreview.tsx` | 0 | 0 |
| 7 | six row texts asserted in document order at `count: 2` | present | `the schedule rows` |
| 8 | row 1 `Move up` name is `Move up — round 1 is already first` and contains `Move up` | present | `the accessible names` |
| 9 | clicking an inert button emits no `onMove` | present | `an inert move` |
| 10 | `getAttribute('aria-disabled')` is `null` once movable | present | `an inert move` |
| 11 | all-open renders no `Move up` and says so | present | `when there is nothing to reorder` |
| 12 | focus after a move is on the destination row's same-named button | present | `after a successful move` |
| 13 | `grep -Ec "#[0-9a-fA-F]{3,6}" …/SchedulePreview.css` | 0 | 0 |

Task 2 acceptance criteria, run against the tree at `05f52ad`:

| # | Check | Expected | Actual |
|---|-------|----------|--------|
| 1 | `npx vitest run tests/ui/` | exit 0 | 395 passed across 23 files |
| 2 | `npm run check:nohtml` | exit 0 | 0 violations |
| 3 | `grep -c "Round schedule" src/ui/screens/ConfigScreen.tsx` | ≥ 1 | 3 |
| 4 | the schedule helper string, verbatim | present | 1 |
| 5 | `0 means no Mega requirement, and no slot is a Mega slot` | present | 1 |
| 6 | `grep -c "Phase 3 makes the round count a host decision" …` | 0 | 0 |
| 7 | `grep -c "const ROUNDS = 6" …` | 1 | 1 |
| 8 | `dispatch` (see the table above) | nothing new | 3 lines, unchanged; 0 calls |
| 9 | reorder → Start → payload kinds deep-equal `['open','open','open','open','mega','mega']` | present | `Start draft on a satisfiable configuration` |
| 10 | 2 → 3 re-seeds to three leading Mega rounds | present | `the Mega rules group` |
| 11 | row texts stay in ascending round order after a move | present | `the Mega rules group` |

Plan-level `<verification>`:

- `npm run verify` exits 0 — yes, 1030/1030.
- Reordering and starting yields a `schedule/compiled` payload matching what was on
  screen — asserted on both the kinds and the indices.
- `git diff --stat package.json package-lock.json` — empty.
- Keyboard-only walk: covered by `lets a Mega round walk to the bottom without the pointer`,
  which presses whatever holds focus five times rather than the same button five times.

## Known Stubs

None. 03-02's one recorded stub — `schedule: compile(config.rules, ROUNDS)` in `handleStart`
— was this plan's job to replace, and it is replaced: that call site now passes the preview
state and the temporary-shape comment is gone. `compile` is still called on this screen, once,
to seed the preview.

## Threat Flags

None. Both mitigations the plan assigned to this file are in place:

- **T-03-10 (Tampering, reorder state).** The reordered schedule is passed to
  `createTournament` as a result and never recomputed at Start, asserted by
  `starts the draft with the schedule the host reordered, not a recompiled one`.
- **T-03-11 (DoS, `compile` via the numeric field).** `compile` is total for every
  `number | null` the field can hold; the memo passes `megasRequiredPerTeam ?? 0`, an emptied
  field compiles to an all-open schedule, and a requirement above `ROUNDS` lays out an
  all-Mega schedule that `megasExceedRounds` blocks. Nothing throws.

No new network endpoint, auth path, file access pattern or schema change at a trust boundary
was introduced. Nothing in `src/core/` was touched.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Ready. The `Mega rules` group now holds three of its four 03-UI-SPEC §1 sub-sections.

- **03-04** adds the fourth (`Mega-forme bans`) to the same group, directly below the
  dual-Mega rows. `.config-screen__section` / `.config-screen__section-heading` are the shape
  to reuse, and `deferred-items.md` item 2 is the one thing that plan should sweep up.
- **03-06 / 03-08 / 03-10** are unaffected: they read `selectRoundKind` and `selectSlotKind`,
  which fold from the log, and this plan changed what reaches the log rather than how it is
  read.
- **The reorder is config-time and stays that way.** There is no `schedule/reordered` action
  and no in-draft reorder surface. T-03-12 is accepted, not deferred work.

**Carried forward:** the `ban-list` timeout, unchanged; and the `Dual-Mega species`
sub-heading treatment, newly logged for 03-04.

---
*Phase: 03-compiled-rules-priority-cards-swaps*
*Completed: 2026-08-17*

## Self-Check: PASSED

Every file this summary claims exists, and both commit hashes it cites resolve in
`git log --all`. Checked 2026-08-17 at `05f52ad`.
