---
phase: 05-full-tournament-brackets-standings-archive
plan: 15
subsystem: testing
tags: [uat, legibility, accessibility, design-tokens, layout-budget, human-verification, drft-14]
requires:
  - the bracket, match card and champion surfaces (05-07, 05-13)
  - the results grid, standings table and tiebreak orderer (05-10, 05-11)
  - the tournament library and recap surfaces (05-12, 05-14)
  - the four-size type scale and --target-min in src/ui/tokens.css (Phase 1)
  - STATE.md's Phase 4 BLOCKING item, 04-11 task 3
provides:
  - 05-HUMAN-UAT.md — the phase gate, with assertions 17-23 evidenced from source
  - a recorded physical pass at three metres on a 24-27" 1080p screen, 6 of 6
  - Phase 4's 04-11 task 3 BLOCKING item, cleared in the same session
  - a documentation-accuracy finding against 05-UI-SPEC §Layout Budget (96px vs 113px)
  - an advisory granularity gap against threat T-05-82, recorded rather than papered over
affects:
  - .planning/STATE.md (the Phase 4 blocker is closable; the orchestrator owns that write)
  - any future phase extending the arc-minute analysis — this is the 24-27" data point
tech-stack:
  added: []
  patterns:
    - an assertion is measured against the token, never against a number in a component
    - the closed remedy set is asserted BEFORE the human pass, not argued after a finding
    - a physical check records the screen's physical size, so a later phase knows which data point it extends
    - a shortfall in evidence is recorded as `status: partial, severity: advisory` rather than dropped
key-files:
  created:
    - .planning/phases/05-full-tournament-brackets-standings-archive/05-HUMAN-UAT.md
  modified: []
decisions:
  - "the physical check is batched with Phase 4's outstanding one — same rig, one interruption"
  - "the 96px-vs-113px discrepancy is recorded as a spec-accuracy finding, not corrected silently"
  - "the sw-manifest timeout is dispositioned pre-existing and environmental, not a Phase 5 defect"
  - "the per-surface granularity shortfall is kept advisory rather than re-running the host"
requirements-completed: [TOUR-02, TOUR-03, TOUR-04, TOUR-08]
metrics:
  duration: ~7h wall clock, dominated by the blocking human checkpoint
  completed: 2026-09-01
---

# Phase 5 Plan 15: The Phase Gate at Three Metres Summary

**DRFT-14 closed for Phase 5: seven assertions evidenced from tokens rather than component numbers, four style gates green across thirteen new stylesheets, and a person three metres from a 1080p screen passing all six physical checks — including Phase 4's outstanding BLOCKING secrecy item, batched into the same session.**

## Performance

- **Duration:** ~7h wall clock (Task 1 landed roughly seven minutes after wave-8 tracking; the remainder is the blocking human checkpoint, not machine work)
- **Started:** 2026-09-01T14:46:25Z
- **Completed:** 2026-09-01T21:47:32Z
- **Tasks:** 2
- **Files modified:** 1 (`05-HUMAN-UAT.md`, created then completed) — no source file touched

## Accomplishments

- **Every DRFT-14 assertion a machine can answer was answered by a machine**, so the human pass spent its attention only on what a person has to look at. Assertions 17 through 23 each record a file, a selector or call site, and the token they resolve to.
- **The four whole-phase style gates pass**: zero raw hex colours across the thirteen stylesheets this phase added, exactly one declared raw px (`--results-col-min: 188px`), `tokens.css` still declaring exactly four `--text-*` sizes, and no fifth size consumed anywhere under `src/`.
- **The physical check passed 6 of 6** on a 24-27" 1080p screen at three metres, recorded with the screen size beside it.
- **Phase 4 no longer carries an unrun physical item.** `04-11` task 3 was batched into this session and passed both halves, clearing a BLOCKING entry and satisfying BAN-05/BAN-06 secrecy acceptance.
- **A spec-accuracy finding was surfaced rather than buried** — `05-UI-SPEC` §Layout Budget's match-card figure is wrong, and the assertion that cites it still holds.

## What Was Built

**The assertions, measured against tokens.** `--text-heading` is `600 24px / 1.25`, `--text-display` is `600 36px / 1.15`, `--target-min` is `44px`. Assertion 17 resolves every player-name site across five surfaces — results-grid headers and labels, the standings row, the bracket match slot, the tiebreak-override row — to `--text-heading`. Assertion 18 puts `.results-grid__cell` on `--text-heading` too, deliberately above the 18px body floor. Assertions 19 to 21 are checked by confirming the declared inputs the arithmetic is built from rather than re-deriving totals. Assertion 22 finds `min-width` and `min-height` of `--target-min` declared explicitly on every match card, including the ones that are not buttons. Assertion 23 resolves `.match-card__champion-name` to `--text-display`.

**The closed remedy set, established before the pass rather than after a finding.** The four-size grep ran in Task 1, ahead of the human check, so a legibility failure at 24px in a results-grid cell could only be a finding about `--text-heading` on a crowded shared surface. The three remedies inside the contract are the existing four-size scale, moving the metric out of the cell and leaving it in the standings, and raising `--results-col-min` at the cost of the no-scroll threshold dropping from 8 players to 7. A fifth `--text-*` size was explicitly out of bounds — a contract change routed to the owner. The remedy set is reproduced verbatim in the UAT document so the person reading it at three metres has the options in front of them. **No remedy was needed.**

**The human verdict.** Rig: 8 players, `blind` bans, `standard` density, a 24-27" 1080p screen, three metres of floor, 2026-09-01.

| Check | Surface | Result |
| --- | --- | --- |
| 2a | Phase 4's `04-11` task 3 — ban-stage legibility **and** secrecy | passed, both halves |
| 2b-a | The results grid at about half recorded — the remaining-match count | passed |
| 2b-b | Three recorded cells — both names and the result | passed |
| 2b-c | The standings table — names, records, tiebreak notes | passed |
| 2b-d | The 8-seed bracket cut at 5, three byes drawn | passed |
| 2b-e | The champion's name at 36px | passed |

Part 2a is the one worth calling out, because it is not only a legibility question. The secrecy half — that no Pokémon is nameable from the locked screen before the reveal — was confirmed explicitly on a direct re-ask, because the orchestrator's first phrasing of the question inverted the pass condition. The ambiguous answer was resolved by asking again rather than by assumption. That clears Phase 4's BLOCKING item and satisfies threat T-05-84.

## Task Commits

1. **Task 1: Assert assertions 17 to 23 from source, and run the whole gate** — `c8ee7ff` (docs)
2. **Task 2: Three metres, a 1080p screen, and eight players** — `a581311` (test)

## Files Created/Modified

- `.planning/phases/05-full-tournament-brackets-standings-archive/05-HUMAN-UAT.md` — the phase gate. Task 1 created it with the automated half filled in and Part 2 left as an unfilled table; Task 2 recorded the host's verdict into it.

No source file, public asset, or manifest was touched. `git diff --stat src/ public/ package.json` is empty, as the plan requires.

## Decisions Made

- **The physical check was batched with Phase 4's.** The rig is identical, so running them together cost one setup and one interruption of the host instead of two. The project now carries zero unrun physical items rather than two.
- **The 96px-vs-113px discrepancy is recorded, not silently corrected.** §Layout Budget's numbers are cited by an acceptance criterion, so quietly editing them would erase the evidence that the criterion was ever checked against a wrong intermediate.
- **The granularity shortfall stays advisory rather than triggering a re-run.** Nothing is recorded as verified that the host did not assert, and no surface was called marginal, so a second interruption would buy narration rather than assurance.

## Issues Encountered

### 1. `05-UI-SPEC` §Layout Budget models a match card at 96px; the shipped card composes to 113px

**This is a documentation-accuracy issue, not a layout failure.** The spec's model omits `.match-card__result`, which `MatchCard.css:83` itself states is *"present on every card in every state"* and which reserves `1.5em` at `--text-body` = 27px, plus the body's second `--space-1` gap and the card's `--hairline-w` borders.

Re-derived with the shipped figure, round 1 of an 8-seed bracket is `4 × 113 + 3 × 24 = 524`, plus a `20 + 8` round header, giving **552px against about 765px available**. Assertion 21's conclusion holds with **213px of slack**. The spec's intermediate number is what is wrong, not the layout. Recorded in the UAT under "Precision note on assertion 21 — recorded, not a failure".

### 2. `npm run verify` exited 1 on a pre-existing, environmental flake

Stated plainly, because the headline number is misleading on its own:

- The run reported exit 1 **solely** because `tests/build/sw-manifest.test.ts` timed out on one case (`sorts the manifest so the output is reproducible`) at vitest's 5000ms default, under full-suite parallel load on Windows. **2686 of 2687 tests passed.**
- Run in isolation, that file passes **11/11 in 3.63s**, against 19.7s under parallel load. That ratio is the signature of a load-induced timeout, not a defect.
- Because `verify` short-circuits on a failing stage, `build` never ran inside it. Run separately, `npm run build` exits 0.
- `npm run check:pure:selftest` exits 0.

This is **already logged in this phase's `deferred-items.md`**, found during 05-10 against source that plan did not touch. Across this phase it has now failed roughly twice in eight full-suite runs, always the same file, always passing alone. It is the same disposition `STATE.md` already carries for `tests/ui/ban-list.test.tsx` — threat T-05-85, disposition `accept`. The fix is a per-case `testTimeout` on the filesystem-heavy cases, or moving the fixture build into `beforeAll`, and it belongs to whoever owns the build tests. **It is not a Phase 5 defect and this plan did not chase it.**

### 3. The per-surface granularity shortfall — advisory, carried forward

Threat T-05-82 asks for a result **per surface** precisely because Phase 3's pass was reported as a single verdict and `STATE.md` still carries the resulting ambiguity about which surfaces were marginal. This pass was requested per surface and answered as "all approved" — a single verdict again. Separately, 2b-a's empty-cell estimate was not captured at all.

Recorded honestly rather than papered over, as `status: partial`, `severity: advisory` in the UAT's Gaps block. What that means precisely:

- Nothing is recorded as verified that the host did not assert.
- No surface was reported marginal.
- The five pass conditions stand on the host's report.
- The missing item is **evidence, not a gate** — the empty-cell estimate informs the empty-cell treatment; it was never a pass condition.

Kept advisory so it surfaces in `/gsd-audit-uat` rather than disappearing. The density question it would have informed can be revisited if a real draft night reports the grid as hard to read.

## Deviations from Plan

None — the plan executed as written. Task 1 ran the gate and built the document; Task 2 stopped at the blocking checkpoint exactly as instructed and was resumed only after the host's verdict was recorded.

The one judgement call worth naming is that Task 1 did **not** treat `verify`'s exit 1 as a phase failure. The plan anticipated this in its `<action>` block and in threat T-05-85, instructing that a full-suite timeout be re-run alone and recorded as pre-existing. It named `tests/ui/ban-list.test.tsx`; the file that actually flaked was `tests/build/sw-manifest.test.ts`, already logged in the same phase's `deferred-items.md` under the same signature. Applying the plan's stated disposition to the file it actually happened to is following the instruction, not deviating from it.

## Verification

| Check | Result |
| --- | --- |
| `npm run verify` | exit 1 — the sw-manifest flake alone, 2686/2687 passing |
| `npm run build` (run separately, since `verify` short-circuits) | exit 0 |
| `npm run check:pure:selftest` | exit 0 |
| `git diff --stat src/ public/ package.json` | empty — this plan changes no code |
| Assertions 17-23 | 7 of 7 pass, each evidenced by file, selector and token |
| Style gates (hex, px, four sizes, no fifth consumed) | 4 of 4 pass |
| Physical checks 2a and 2b a-e | 6 of 6 pass, on a 24-27" 1080p screen at three metres |
| `05-HUMAN-UAT.md` records a result per assertion and per sub-check, plus the screen size | yes |

Re-confirmed independently while writing this summary: `tokens.css` declares exactly 4 `--text-*` sizes; exactly 4 distinct `--text-*` tokens are consumed under `src/`; `--results-col-min: 188px` is declared once; 0 of the 13 new stylesheets contain a raw hex colour; the only `px` occurrences outside that one declaration are prose inside comments in `MatchCard.css`, `RecapList.css`, `TournamentLibrary.css` and `TournamentScreen.css`.

## Requirements Covered

- **TOUR-02, TOUR-03, TOUR-04, TOUR-08** — the round-robin results grid, the standings and cut, the single-elimination bracket, and the finished tournament's readability, all verified legible on a shared screen at three metres.

Also cleared, though owned by Phase 4: **BAN-05** and **BAN-06** secrecy acceptance, via Part 2a.

## Known Stubs

None. This plan writes one planning document and changes no code.

## Threat Flags

None. No network endpoint, auth path, file access pattern, or schema change is introduced — the plan modifies a single Markdown file under `.planning/`.

## Next Phase Readiness

- **The phase gate is closed.** DRFT-14 is satisfied for every surface Phase 5 added.
- **`STATE.md`'s Phase 4 BLOCKING item (`04-11` task 3) is now closable** on this session's result. That write belongs to the orchestrator, not to this plan.
- **One advisory item carries forward:** the per-surface recording shortfall against T-05-82. It is not blocking and needs no action before the next phase.
- **One pre-existing deferred item carries forward:** the `tests/build/sw-manifest.test.ts` timeout under parallel load on Windows. It belongs to whoever owns the build tests.
- **This session is the 24-27" data point.** A future phase extending the arc-minute analysis should read it as such — the Phase 3 and Phase 4 passes were on a ~24" monitor, the pessimistic case.

## Self-Check: PASSED

- `05-HUMAN-UAT.md` exists on disk and carries both the automated half and the host's verdict.
- `05-15-SUMMARY.md` exists on disk.
- Commit `c8ee7ff` (Task 1) found in `git log`.
- Commit `a581311` (Task 2) found in `git log`.
- `git diff --stat src/ public/ package.json` is empty — no code changed.
- `STATE.md` and `ROADMAP.md` are untouched by this plan; the orchestrator owns those writes.

---
*Phase: 05-full-tournament-brackets-standings-archive*
*Completed: 2026-09-01*
