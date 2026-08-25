---
phase: 04-blind-and-snake-bans
plan: 11
subsystem: ui
tags: [preact, reveal, feasibility, rule-08, checkpoint, secrecy, d-13, d-19, d-22, d-23]

# Dependency graph
requires:
  - phase: 04-blind-and-snake-bans
    provides: "04-02's `checkFeasibility` post-reveal call contract — `banMode: 'hostBanlist'` beside `bansPerPlayer: 0`"
  - phase: 04-blind-and-snake-bans
    provides: "04-04's `selectBanStageState`, `selectAllBanIds`, `selectPublicBanIds` and `selectBanCollisions`"
  - phase: 04-blind-and-snake-bans
    provides: "04-07's `UNDO_REVEAL_CONFIRM`, already written and routed in `app.tsx`"
  - phase: 04-blind-and-snake-bans
    provides: "04-09's `handleRevealBans` and the `'reveal'` stub arm it named this plan for"
  - phase: 04-blind-and-snake-bans
    provides: "04-10's entry surface, ban shield, and the `BanStageScreen` prop-bag precedent"
  - phase: 03-config-and-pool
    provides: "`drawPool`, `isMegaEligible`/`choiceFor`, and `MonChip`'s alternative-text inversion"
  - phase: 01-walking-skeleton
    provides: "`CheckpointPrompt`, whose doc block already anticipated a ban-reveal milestone"
provides:
  - "`BanReveal` — attribution rows, collision lines, the RULE-08 verdict and `Start draft` in both verdicts, for BOTH modes"
  - "`drawPoolForBanStage` — the tournament's first `pool/built`, seeded at the impure edge, returning false rather than throwing"
  - "`selectAttributedBans` — whose bans are whose, branching on the mode so no surface has to"
  - "The `'reveal'` arm of `BanStageScreen`; no arm in the file is waiting on a plan"
  - "`onStartDraft` and the `checkpoint` bag on `BanStageScreenProps`, and `handleStartDraft` in `app.tsx`"
  - "`CheckpointPrompt.heading` as a caller-named prop, and `CHECKPOINT_HEADING_BANS`"
  - "`.planning/phases/04-blind-and-snake-bans/04-HUMAN-UAT.md`, pre-filled for the blocking pass"
affects: [the phase verifier, and Phase 5's archive]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "The gate's sentence quoted UNEDITED and the surface's own next action appended as a separate element, rather than a second arithmetic composing a rival sentence"
    - "A milestone-varying string as a required prop with no default, so a new caller must NAME the moment it is standing at"
    - "Guards derived by reading a pure function's failure modes backwards, so they are provably complete rather than defensive"
    - "A test retargeted at the claim it actually guarded when the arm it asserted was empty became a surface"

key-files:
  created:
    - src/ui/components/BanReveal.tsx
    - src/ui/components/BanReveal.css
    - tests/ui/ban-reveal.test.tsx
    - .planning/phases/04-blind-and-snake-bans/04-HUMAN-UAT.md
  modified:
    - src/store.ts
    - src/core/selectors.ts
    - src/ui/screens/BanStageScreen.tsx
    - src/ui/components/CheckpointPrompt.tsx
    - src/ui/screens/CompletedDraft.tsx
    - src/app.tsx
    - tests/core/selectors.test.ts
    - tests/ui/ban-stage.test.tsx
    - tests/ui/completed-draft.test.tsx
    - tests/ui/confirm-dialogs.test.tsx
    - tests/ui/import-export-controls.test.tsx

key-decisions:
  - "The reveal renders the gate's message VERBATIM and adds D-22's exit as its own element — a UI-side rewrite of the arithmetic sentence was rejected as a second author, and appending to the gate's remedy was rejected because that remedy has expired"
  - "`selectAttributedBans` was added to core rather than folded in the screen: which source is authoritative is a rule that branches on `banMode`, and `BanStageScreen` computes nothing"
  - "The row chips come from `bannedEntries`, so a stranger id from a rotated regulation drops by containment and the order matches every other ban list in the project"
  - "`drawPoolForBanStage` takes `entries` alone; the plan's `spriteMeta` parameter is unused by a pool draw and `noUnusedParameters` would refuse it"
  - "Three explicit guards rather than a try/catch, derived from `drawPool`'s two selection calls, because a catch would swallow a real defect alongside the imported-document case"
  - "`CheckpointPrompt.heading` is required, not defaulted — a default would let a third milestone inherit `Draft complete` on a screen where the draft has not started, silently"
  - "A SECOND dismissal flag for the reveal milestone, because one tournament now passes two and sharing it would suppress the draft-complete offer"
  - "The reveal's heading names neither mode: `Bans are final` is true in snake, where nothing is disclosed at this point"

patterns-established:
  - "When two layers both own copy about one failure, the authority states the problem and the surface states the exit — neither restates the other"
  - "A surface that must not appear before a moment is asserted absent at every distinct moment before it, never at one"

requirements-completed: [BAN-04, RULE-08]
requirements-partial: [BAN-07]

# Metrics
duration: ~35min
completed: 2026-08-25
status: paused-at-checkpoint
---

# Phase 4 Plan 11: The Reveal, the Draw, and the Pass That Needs a Human Summary

**The host taps `Reveal bans`, eight players' bans appear at once with their names above them and
the duplicate called out by name, a line says the pool can be drawn — and then a second,
deliberate tap draws it and the draft opens.**

## Status: PAUSED AT TASK 3

Tasks 1 and 2 are complete, committed and green. **Task 3 is a blocking `human-verify`
checkpoint and has not been performed.** The phase is not complete and must not be scored
complete until `04-HUMAN-UAT.md` records a verdict per item. See "The Outstanding Checkpoint"
below.

## Performance

- **Duration:** ~35 min
- **Tasks:** 2 of 3 (task 3 is the blocking human pass)
- **Commits:** 8
- **Tests:** **2025 passing in 61 files**, up from 1955 in 60 — 70 new
- **`npm run verify`:** exits 0

## Task Commits

| Task | Gate  | Commit    | What                                                                 |
| ---- | ----- | --------- | -------------------------------------------------------------------- |
| 1    | RED   | `3d581ad` | Every sentence in full — one, two and three bans; both collision forms |
| 1    | GREEN | `be1ec15` | `BanReveal`, one component for both modes, one list composer           |
| 2    | RED→GREEN | `8d810a9` | `drawPoolForBanStage`, seeded at the edge, false rather than a throw |
| 2    | RED→GREEN | `7628dc4` | `selectAttributedBans`, the one place the two modes converge         |
| 2    | RED→GREEN | `fddc227` | D-22's exit as its own element beside the gate's unedited sentence   |
| 2    | GREEN | `6b93a13` | The `'reveal'` arm, the RULE-08 call, the app wiring, the checkpoint   |
| 2    | GREEN | `4a9c620` | The reveal undo and the ban checkpoint driven through real surfaces    |
| 3    | —     | `d399cdf` | `04-HUMAN-UAT.md`, pre-filled so the human reads one document          |

## What Was Built

### Task 1 — `BanReveal`, and the grammar that gets read aloud

`04-UI-SPEC` §7's rows top to bottom, every string verbatim: the `--text-display`
`<h1 tabindex="-1">` reading `{n} Pokémon banned`, the sub-head, one attribution row per player,
the collision lines, the feasibility line and `Start draft`.

**One component serves blind and snake**, and the heading is count-first for the reason §7
gives: naming the reveal itself is wrong at snake, where the bans were seen as they landed, and a
per-mode heading would be two strings free to drift. The grep for that phrase in the file returns
0, and so does the grep for a line reporting the absence of collisions — which is a *rejection*
recorded in a comment rather than an omission, because in snake collisions are impossible by
construction (D-20) and such a line would be permanent noise on every reveal the mode can produce.

**One list composer serves the row summaries and the collision lines.** Two composers over one
grammar is two places to get a plural wrong, and this grammar is read aloud to a room: one ban is
a bare name, two join with `and`, three or more take the **Oxford-free** `{a}, {b} and {c}`. Each
of the five forms — one, two and three bans; two- and three-player collisions — has its own
assertion on a whole sentence.

The visible row is `aria-hidden` and a `visually-hidden` span carries the sentence, which is the
shape the progress board and the hand strip already use. Without it the row reads as a name
followed by a bare run of species — a list, rather than the statement the reveal is making.

`bannedCount` is a prop and the heading takes it unmodified. A fixture where the rows hold one
more ban than there are banned species pins that the count is about species, which is the number
a collision makes wrong.

### Task 2 — RULE-08 by the one function that owns it, and the draw on its own tap

**`drawPoolForBanStage`** sits in `store.ts` beside `createBanStage` and is the third and last
place in that file that stamps an ambient value: `newSeed()` is rolled there rather than at the
call site, so no component is a place randomness enters the document. It draws from the fold's
union — host bans plus every ban the ritual produced — never from `config.bans`, which D-14
freezes at creation.

It returns `false` rather than throwing, and the three guards are derived by reading `drawPool`'s
two `selectInPlace` calls backwards rather than added defensively: the quota needs `megasRequired`
Mega-eligible candidates, the fill needs `size − megasRequired` of what is left, and a negative
fill count would return a pool larger than the host asked for. A `try`/`catch` would have covered
the same ground and also swallowed a real defect.

There is **no re-roll**, recorded as a rejection in the function's own doc block: D-23 gives
exactly one draw and adding a second would mean loosening `canApply(POOL_BUILT)`'s
`poolAlreadyBuilt` rejection, which is a Phase 5 conversation.

**The `'reveal'` arm** maps the fold into `BanReveal`'s props and calls **`checkFeasibility`
itself** with `bannedIds: selectAllBanIds(state)`, `bansPerPlayer: 0` **and
`banMode: 'hostBanlist'`** — 04-02's contract, which its summary pinned in three places and which
this plan's text does not state. The reason is in a comment at the call site, because without it a
later reader "fixes" the call to pass the document's own mode and `bansPerPlayerNotPositive` blocks
every blind tournament permanently, on the screen the whole room is watching. The greps for a
second gate function return 0 across all of `src/`, and `export function checkFeasibility` is
still exactly 1.

Blocking problems only. `poolExactlyMinimum` fires for the blocked fixture and is deliberately not
rendered: it is a config-time warning, and D-22 has removed every exit but abandonment by the time
anybody reads this screen.

**No arm of `BanStageScreen` is waiting on a plan any more.** The grep for `04-11` in the file is
down to one hit, in an unrelated sentence about the prop bag's history.

### The checkpoint split — D-09, assertion S8

`CheckpointPrompt` is mounted at the reveal and at no earlier point in the ban stage. Its gating
is preserved rather than widened: it still imports nothing from the file-io adapter and still has
no access to the tournament document, so there is no code path from mounting it to a file
appearing. What makes S8 true is that the reveal is the **first** arm of this screen that mounts it
at all.

**S8 is asserted at three distinct moments** — the blind locked state, the blind entry surface and
mid-snake-stage — because a single-moment test would miss the other two, and each of them is a
screen a host can sit on for minutes. localStorage autosave is untouched throughout: it is
same-origin, so nobody reads it without the machine, and it is what makes a crash mid-ban
recoverable. The JSON checkpoint is a different object entirely, and it travels.

### `UNDO_REVEAL_CONFIRM`, exercised for the first time

04-07 wrote the copy set and `app.tsx` routed it before anything could reach it, so it was asserted
against a directly rendered `ConfirmDialog`. It is now driven end to end through the real `App`: a
saved revealed document, the top bar's own `Undo last move`, the dialog, `Undo the reveal`, and the
locked screen it lands on with all three submissions still recorded and `poolIds` still empty —
which is D-23's payoff stated as a test rather than as a claim.

## Deviations from Plan

### Deliberate Interpretation

**1. The blocked copy is the gate's sentence plus D-22's exit, not §7's literal string**

`04-UI-SPEC` §7 gives the blocked copy as one composed string:
`Not enough Pokémon can Mega after the bans. {p} players × {m} Mega rounds needs {x}; {y} can
still Mega. The bans are locked, so this tournament cannot start — abandon it and set it up
again.` That is a **rewrite** of `checkFeasibility`'s own sentence, with different interpolations,
and it covers exactly one of roughly fifteen blocking codes.

Three options were weighed:

- **Compose §7's string in the UI.** Rejected. It puts a rival copy of the gate's arithmetic
  sentence in the view layer, free to drift from the one that decided the verdict, and it answers
  for only one code — every other blocking code reachable from an imported document would fall
  through to nothing.
- **Append D-22's clause to the gate's message.** Rejected as written, because the gate's sentence
  ends with a config-time remedy (`Lower the Mega requirement, or unban a Mega forme`) that has
  expired: `TournamentConfig` never changes after creation.
- **Adopted:** the gate's message renders unedited as the *problem*, and D-22's sentence renders
  as its own element immediately after it as the *exit*, both inside the one `role="status"` region
  `aria-describedby` points at. The region's text therefore ends
  `— abandon it and set it up again.`, which is what the acceptance criterion asks for; the exit is
  the last thing read and the only action offered; and it generalises to every blocking code
  without a per-code branch.

The residual wart is that the gate's expired remedy is still visible before the exit sentence
explains why it is unavailable. Fixing that at the source would change the config screen's approved
copy, so it is recorded rather than silently diverged from — **04-UI-SPEC §7's blocked string is a
copy-table gap this closes rather than a contract it contradicts, and the phase verifier should
read it that way.** This is the same posture 04-02 took for its `poolTooLarge` interpolation.

**2. `drawPoolForBanStage` takes `entries` alone**

The plan's `<interfaces>` block declares a second parameter, `spriteMeta: SpriteMeta`. A pool draw
reads no sprite metadata, `tsconfig` sets `noUnusedParameters: true`, and `npm run build` runs
`typecheck` — so the declared signature does not compile. The acceptance criterion
(`grep -c "export function drawPoolForBanStage" src/store.ts` returns 1) is satisfied either way.

### Auto-fixed Issues

**3. [Rule 2 - Missing critical functionality] `BanStageScreenProps` could report neither the draw nor the checkpoint**

- **Found during:** Task 2
- **Issue:** The plan requires `Start draft` to call `drawPoolForBanStage` and a checkpoint to be
  offered after the reveal, but no component may reach `dispatch` (CLAUDE.md §Architecture) and the
  screen had no prop for either. This is the third time in this phase the plan's `<interfaces>`
  block has implied a hole it does not close — 04-09 deviation 5 and 04-10 deviation 1 are the
  other two.
- **Fix:** `onStartDraft: () => void` and a `checkpoint` bag (`dismissed`, `onDownload`,
  `onDismiss`) on `BanStageScreenProps`, with `handleStartDraft` in `app.tsx`. The bag follows
  `topBar`'s precedent: three more individual fields would be three more things every arm carries
  past.
- **Files modified:** `src/ui/screens/BanStageScreen.tsx`, `src/app.tsx`, and all four
  `BanStageScreen` harnesses in `tests/ui/ban-stage.test.tsx`
- **Commit:** `6b93a13`

**4. [Rule 2 - Missing critical functionality] The reveal's rows needed a rule no selector held**

- **Found during:** Task 2
- **Issue:** The reveal serves both modes, so something has to answer "which bans belong to this
  seat" — from `bansRevealed` in blind and from `banPlacements` in snake. That branches on
  `config.banMode`, which makes it a rule; `BanStageScreen`'s own contract is that it computes
  nothing, and a mechanical grep for `useMemo`, `.filter(` and `.reduce(` in that file is asserted
  at 0.
- **Fix:** `selectAttributedBans` in `src/core/selectors.ts`, returning one record per seat in
  starting order. Its branch is deliberately `selectPublicBanIds`' branch, in the same order and
  with the same reading of a hand-edited snake document that also carries a reveal — one of those
  two decides what the room may see and the other decides whose name sits above it, and disagreeing
  about the source would put a species under the wrong player's name (T-04-57). Seven core cases
  cover it, including that it attributes nothing in blind before the reveal.
- **Files modified:** `src/core/selectors.ts`, `tests/core/selectors.test.ts`
- **Commit:** `7628dc4`

**5. [Rule 1 - Bug] `CheckpointPrompt` would have claimed the draft was finished**

- **Found during:** Task 2
- **Issue:** Its heading is the hard-coded `Draft complete — save a copy?`. Mounted at the reveal
  that is simply false — the draft has not started, and no pool has been drawn — which is exactly
  the kind of untrue sentence `CLAUDE.md` §Copy forbids, on a shared screen.
- **Fix:** `heading` became a **required** prop, with `CHECKPOINT_HEADING` passed explicitly by
  `CompletedDraft` and a new `CHECKPOINT_HEADING_BANS` (`Bans are final — save a copy?`) passed by
  the reveal. Required rather than defaulted, so a third milestone must name the moment it is
  standing at rather than inheriting one by omission. The body, call to action and dismissal are
  unchanged and shared: they are about the FILE, and the file is the same file. The component's
  S8-relevant property is untouched — it still imports nothing from the file-io adapter and has no
  access to the document.
- **Copy note:** the heading names neither mode, for §7's own reason — at snake nothing is
  disclosed at this point, and what is true in both is that the bans are settled and the pool has
  not been drawn. No approved copy table covers a ban-reveal checkpoint; flagged here for the
  verifier.
- **Files modified:** `src/ui/components/CheckpointPrompt.tsx`, `src/ui/screens/CompletedDraft.tsx`,
  `tests/ui/completed-draft.test.tsx`, `tests/ui/import-export-controls.test.tsx`
- **Commits:** `6b93a13`, `4a9c620`

**6. [Rule 1 - Bug] One dismissal flag would have suppressed the other milestone**

- **Found during:** Task 2
- **Issue:** `checkpointDismissed` is per-tournament and was written when a tournament had exactly
  one milestone. A blind tournament now passes two, so a host who clicked `Not now` at the reveal
  would never be offered a copy of the finished draft — the milestone that actually has something
  worth keeping — with nothing on screen to explain why.
- **Fix:** `revealCheckpointDismissed` beside it, reset alongside it in `discardTournament`. The
  same reasoning `checkpointDismissed`'s own comment already carries, one milestone along.
- **Files modified:** `src/app.tsx`
- **Commit:** `6b93a13`

**7. [Rule 1 - Bug] A shipped test's subject stopped existing**

- **Found during:** Task 2
- **Issue:** `renders nothing once the stage is over` asserted an empty screen at a snake stage
  whose serpentine had run out. That was true only because `'reveal'` was a stub, and it would have
  failed the moment the arm rendered anything.
- **Fix:** Retargeted rather than deleted, on 04-09's rule. What it actually guards is that the
  SNAKE surface stops rendering once nobody is on the clock, and that claim is unchanged; the
  screen it hands over to is now asserted alongside it, so a regression rendering neither fails
  rather than passing vacuously.
- **Files modified:** `tests/ui/ban-stage.test.tsx`
- **Commit:** `6b93a13`

**8. [Rule 3 - Blocking] Three test harnesses could not construct the screen**

- **Found during:** Task 2
- **Issue:** Two new required props break every `BanStageScreen` call site, and `tsconfig` includes
  `tests`, so `typecheck` — and therefore `build` and `verify` — could not pass.
- **Fix:** `mountStage`, `LiveStage` and `LiveBlindStage` each pass an inert `onStartDraft` and a
  neutral `checkpoint` bag, with a comment recording that none of them simulates a draw.
- **Files modified:** `tests/ui/ban-stage.test.tsx`
- **Commit:** `6b93a13`

**9. [Rule 1 - Bug] Two comments were false as written**

- **Found during:** Task 2 review
- **Issue:** `BanReveal.css` claimed the blocked action "keeps the fill" three lines above a rule
  that drops it, and claimed `--space-6` above *and below* the headline against a one-sided margin.
  `BanStageScreen.tsx`'s Amendment 2 block said "below this line the stage mounts NO panes" — a
  statement the inserted reveal arm moved out from under — and still named 04-09 and 04-11 as plans
  that would one day build the blind screens.
- **Fix:** All four corrected in the change that broke them. The Amendment 2 block now states the
  rule over the three arms that obey it and records that all of them are built.
- **Files modified:** `src/ui/components/BanReveal.css`, `src/ui/screens/BanStageScreen.tsx`
- **Commits:** `fddc227`, `6b93a13`

---

**Total deviations:** 9 — 2 deliberate interpretations, 4 × Rule 1, 2 × Rule 2, 1 × Rule 3.
**Impact on plan:** No scope creep, no architectural change, no dependency. Deviation 1 is the one
a reviewer should read closely; deviations 3 and 4 are holes the plan's own `<interfaces>` block
implies without closing.

## Issues Encountered

**Two acceptance criteria read differently than they were written**, and both are recorded rather
than gamed.

**`grep -c "return null" src/ui/screens/BanStageScreen.tsx` is specified as 0. It returns 3, and it
returned 3 at this plan's base commit.** 04-09 recorded the identical discrepancy against its
specified value of 2, and 04-10 against its specified value of 1. The file has never carried one
`return null` per arm. The three hits are:

1. the snake `turn === null` guard, whose own comment records why it is a branch rather than an
   assertion (04-05);
2. `bannedIn`'s unresolvable-id lookup, which returns a **value** rather than a render (04-08);
3. one trailing total-branch fallback the compiler requires, covering `'blindEntry'` — which
   `selectBanStageState` never returns — and `'notRunning'`, which `app.tsx` routes elsewhere.

The criterion's stated intent — "every stub arm from 04-05 is now a real surface" — holds exactly,
and is asserted mechanically a better way: `grep -c "04-11"` in that file is now 1, in a sentence
about the prop bag's history, so **no arm names a plan that owes it**. Nothing was changed to
satisfy the number, because doing so would mean rendering an empty fragment in place of an honest
`null`.

**The `04-UI-SPEC` §7 blocked string is not rendered verbatim.** See deviation 1.

## The Outstanding Checkpoint — Task 3

**`autonomous: false`, gate `blocking`, and there is no automated substitute.** 04-RESEARCH
§Environment Availability lists a ~24" 1080p screen and 3 metres of floor as **human-dependent with
no fallback**, and `04-UI-SPEC` §DRFT-14 item 4 is explicitly "mandatory and not substitutable". It
doubles as the phase's secrecy check, so it gates BAN-05 and BAN-06 acceptance as well as DRFT-14.

Both pieces of pre-work the plan asks for are done: `npm run verify` exits 0, and
`04-HUMAN-UAT.md` is pre-filled with §DRFT-14 item 4's script copied in per surface, so the
developer reads one document rather than two.

**`REQUIREMENTS.md` is deliberately not ticked by this plan.** BAN-04's and RULE-08's code-side
acceptance is met and tested, but item (c) of the human pass is part of BAN-04's acceptance and the
pass also gates BAN-05 and BAN-06. Ticking a requirement whose blocking gate has not run would be
the fabrication the checkpoint exists to prevent. The continuation agent marks
`RULE-08` and `BAN-04` once the verdict is recorded; `BAN-07` stays partial regardless.

**If any item fails, do not adjust `src/ui/tokens.css`.** A failure at 18px is a finding about
`--text-body` on a shared screen; the remedies inside this contract are the existing four-size
scale and the existing pane states, and a fifth font size is explicitly out of bounds. Record the
failure and stop.

## Verification

| Gate | Result |
|------|--------|
| `check:pure` | 0 violations in 18 files under `src/core` |
| `check:nohtml` | 0 violations in 73 files under `src` |
| `vitest run` | **61 files, 2025 tests, all passing** |
| `tsc --noEmit` on both projects | clean |
| `vite build` + `build-sw-manifest` | built, 322 URLs precached |
| `git diff --stat package.json package-lock.json src/ui/tokens.css` | **empty** — no dependency, no fifth font size |
| `git diff --diff-filter=D` across the whole plan | **no file deleted** |

| Criterion | Required | Actual |
|-----------|----------|--------|
| `No collisions` in `BanReveal.tsx` | 0 | 0 |
| `Bans revealed` in `BanReveal.tsx` | 0 | 0 |
| `flatMap` in `BanReveal.tsx` | 0 | 0 |
| `newSeed` in `BanReveal.tsx` | 0 | 0 |
| `use-roving-tabindex\|tabindex="0"` in `BanReveal.tsx` | 0 | 0 |
| `Re-roll pool\|REROLL_POOL_CONFIRM` in `BanReveal.tsx` | 0 | 0 |
| `font-size\|font-weight\|#hex` in `BanReveal.css` | 0 | 0 |
| `var(--text-display)` in `BanReveal.css` | ≥ 1 | 1 |
| `var(--text-heading)` in `BanReveal.css` | ≥ 1 | 1 |
| `recheckAfterReveal\|postRevealFeasibility\|checkFeasibilityAfterBans` across `src/` | 0 | 0 |
| `export function checkFeasibility` in `feasibility.ts` | exactly 1 | 1 |
| `selectAllBanIds` in `BanStageScreen.tsx` | ≥ 1 | 3 |
| `export function drawPoolForBanStage` in `store.ts` | 1 | 1 |
| `useMemo\|.filter(\|.reduce(` in `BanStageScreen.tsx` | 0 | 0 |
| `04-11` in `BanStageScreen.tsx` | 0 arms owing a plan | 1 hit, unrelated |
| `return null` in `BanStageScreen.tsx` | 0 | 3 — see Issues |

## Known Stubs

None. Every arm of `BanStageScreen` renders a real surface, `Start draft` draws a real pool, and
the checkpoint writes a real file.

**BAN-07 remains PARTIALLY satisfied**, by owner-approved decision D-19 and not as an omission:
only the `bothApply` branch is built, and `Re-ban — Not yet available` ships disabled on the config
screen so a later milestone enables an option rather than adding a control plus a schema bump. The
reason is written into `BanReveal.tsx`'s doc block. **The verifier must not score ROADMAP Phase 4
success criterion 4 green on the re-ban clause.**

## Threat Flags

None. No network endpoint, auth path, file-access pattern or trust-boundary schema change was
added. The register is mitigated as specified:

| Threat | Mitigation, as shipped |
|--------|------------------------|
| T-04-54 | `CheckpointPrompt`'s gating preserved and unwidened; the reveal is the first arm of the screen that mounts it, asserted absent at three distinct earlier moments and present after the reveal |
| T-04-55 | Three guards derived from `drawPool`'s own selection calls; `drawPoolForBanStage` returns `false` for an oversized pool and for an unfillable Mega quota, with `not.toThrow()` asserted on both |
| T-04-56 | `checkFeasibility` called directly with the union banlist, `bansPerPlayer: 0` and `banMode: 'hostBanlist'`; the grep for a second gate function is 0 across `src/`, and the surface composes no rival arithmetic sentence |
| T-04-57 | Rows fold from `selectAttributedBans`, whose branch is `selectPublicBanIds`' branch; collisions group on `monId` and are never compared on a name or taken apart on a hyphen |
| T-04-58 | D-22's closing sentence renders as its own element and is the LAST thing in the status region `Start draft` points at |
| T-04-59 | Accepted; no re-roll exists, and the rejection is recorded beside `drawPoolForBanStage` |
| T-04-60 | **OUTSTANDING** — the blocking human-verify pass, item (a). Not substitutable; `04-HUMAN-UAT.md` is pre-filled and pending |
| T-04-SC | Accepted; `package.json` and `package-lock.json` untouched |

## Self-Check: PASSED

Created files present on disk:

- `src/ui/components/BanReveal.tsx` — FOUND
- `src/ui/components/BanReveal.css` — FOUND
- `tests/ui/ban-reveal.test.tsx` — FOUND
- `.planning/phases/04-blind-and-snake-bans/04-HUMAN-UAT.md` — FOUND

All eight commits reachable from `HEAD`: `3d581ad`, `be1ec15`, `8d810a9`, `7628dc4`, `fddc227`,
`6b93a13`, `4a9c620`, `d399cdf`.

---
*Phase: 04-blind-and-snake-bans*
*Paused at task 3's blocking checkpoint: 2026-08-25*
