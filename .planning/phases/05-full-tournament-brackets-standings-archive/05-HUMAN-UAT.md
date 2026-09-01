---
status: passed
phase: 05-full-tournament-brackets-standings-archive
source:
  [
    05-UI-SPEC.md §DRFT-14 as a Checkable Assertion — extended,
    05-UI-SPEC.md §Layout Budget,
    05-15-PLAN.md tasks 1 and 2,
    STATE.md §Blockers — the Phase 4 BLOCKING item (04-11 task 3),
  ]
started: 2026-09-01T00:00:00Z
updated: 2026-09-01T15:10:00Z
---

# Phase 5 human UAT — the tournament stage at three metres

Task 1 of `05-15-PLAN.md` filled in everything below that a machine can answer. Task 2 is the
physical check, and **only a person standing three metres from a 1080p screen can complete it.**
Nothing in this repository substitutes for it.

Two sessions are batched into one here, deliberately: Phase 4's outstanding physical pass and
Phase 5's new one. The rig is identical, so running them together costs one setup instead of two
and one interruption instead of two.

## Screen used

Fill this in before you start. The Phase 3 and Phase 4 passes were on a **~24" 1080p monitor**,
which is the pessimistic case in `05-UI-SPEC` §DRFT-14's arc-minute table. A result on a larger
screen is a different data point and has to be recorded as one.

```
physical_size:      24-27" (host reported a range, not a single measurement)
resolution:         1080p
distance:           three metres
date:               2026-09-01
```

## The closed remedy set — read this before you record a failure

Verbatim from `05-15-PLAN.md` §precedence and `05-UI-SPEC` §DRFT-14.

**A failure at 24px in a results-grid cell is a finding about `--text-heading` on a crowded shared
surface. It is not a licence to introduce a fifth font size.** The three remedies available inside
the contract are:

1. the existing four-size scale;
2. removing the metric from the cell, leaving it in the standings only;
3. raising `--results-col-min`, at the cost of the no-scroll threshold dropping from 8 players
   to 7.

**Anything else is a contract change and goes back to the owner.** Introducing a fifth `--text-*`
size is explicitly out of bounds. Report the failure rather than fixing it a fourth way.

Task 1 asserted that the scale still holds exactly four sizes **before** this pass ran, so the
constraint is established rather than argued about afterwards. See the fifth-size row below.

---

## Part 1 — the automated gate (Task 1, complete)

| Gate | Command | Result |
| --- | --- | --- |
| Purity, no-innerHTML, tests, build | `npm run verify` | **exit 1 — one known flake, see below** |
| The checker still catches a real violation | `npm run check:pure:selftest` | **exit 0 — passed** |
| Build stage, run separately | `npm run build` | **exit 0 — passed** |
| This plan changes no code | `git diff --stat src/ public/ package.json` | **empty — passed** |

**On the `npm run verify` non-zero exit.** `tests/build/sw-manifest.test.ts` timed out on one of its
eleven tests (`sorts the manifest so the output is reproducible`, 5000ms limit) under full-suite
parallel load — 2686 of 2687 tests passed. Re-run alone, the file passes **11/11 in 3.63s** against
19.7s under parallel load, which is the signature of a load-induced timeout rather than a defect.
Because `verify` short-circuits on a failing stage, `build` never ran inside it; it was run
separately and exited 0. **This is recorded as a pre-existing Windows parallel-load flake, not a
Phase 5 failure** — the same disposition `STATE.md` already carries for
`tests/ui/ban-list.test.tsx` (threat T-05-85, disposition `accept`).

### Assertions 17 to 23, checked from source

Each is measured against the **token**, not against a number in a component. `--text-heading` is
`600 24px / 1.25`; `--text-display` is `600 36px / 1.15`; `--target-min` is `44px`
(`src/ui/tokens.css:110-113`, `:76`).

| # | Assertion | Evidence — file, selector, token | Result |
| --- | --- | --- | --- |
| 17 | Every player name on the five named surfaces renders at ≥ 24px | Results-grid column header and row label: `ResultsGrid.css:96-101` `.results-grid__header, .results-grid__label { font: var(--text-heading) }`, call sites `ResultsGrid.tsx:280,287`. Standings row: `StandingsTable.css:100-104` `.standings-table__player` → `--text-heading`, call site `StandingsTable.tsx:170`. Bracket match slot: `MatchCard.css:55-59` `.match-card__slot { font: var(--text-heading) }`, call sites `MatchCard.tsx:162,163,227`. Tiebreak-override row: `TiebreakOrderer.css:67-70` `.tiebreak-orderer__player` → `--text-heading`, call site `TiebreakOrderer.tsx:223`. | **pass** |
| 18 | Every results-grid cell result renders at ≥ 24px | `ResultsGrid.css:127-135` `.results-grid__cell { font: var(--text-heading) }` — deliberately above the 18px body floor, per §Typography. `text-heading` appears 5 times in the file. | **pass** |
| 19 | The 8-player results grid fits with no horizontal scroll at 1920 × 1080 | `--results-col-min: 188px` declared **exactly once**, `ResultsGrid.css:28`. Consumed once, `ResultsGrid.tsx:273`: `grid-template-columns: var(--board-label-w) repeat(n, minmax(var(--results-col-min), 1fr))`. Label `--board-label-w: 176px` (`BoardGrid.css:41`), gap `--space-2` = 8px (`ResultsGrid.css:73`). Arithmetic: `176 + 8 × (188 + 8) = 1744 ≤ 1872`. | **pass** |
| 20 | The 8-player results grid fits with no vertical scroll at 1920 × 1080 | Declared inputs: cell padding `--space-2` (`ResultsGrid.css:131`) plus line box 24 × 1.25 = **46px**; row gap `--space-2` = 8px (`:73`). §Layout Budget totals 508px against ~765px available. Worst case with every cell recorded (`--border-w` 2px on both edges, so 50px cells): 76 header + 400 + 64 gaps = **540 < 765**. | **pass** |
| 21 | An 8-seed bracket fits with no vertical scroll at 1920 × 1080 | Declared inputs: `.match-card` padding `--space-2`, border `--hairline-w` (`MatchCard.css:26-40`); slot `min-height: 1.25em` at `--text-heading` = 30px (`:55-59`); body gap `--space-1` (`:41-44`); result row `min-height: 1.5em` at `--text-body` = 27px (`:84-88`); round gap `--space-4` (`BracketGrid.css:85-90`); round header `--text-label` (`:73-76`). See the precision note below. Composed round-1 height **552px against ~765px**. | **pass** |
| 22 | Every results-grid live cell and playable bracket card measures ≥ 44px in both axes | Results-grid cell: width `minmax(var(--results-col-min), 1fr)` = 188px ≥ 44 (`ResultsGrid.tsx:273`); height 46px by declaration (`ResultsGrid.css:131` plus the `--text-heading` line box). Bracket card: `MatchCard.css:26-40` declares `min-width: var(--target-min); min-height: var(--target-min)` explicitly, on **every** card including the ones that are not buttons. | **pass** |
| 23 | The champion's name renders at ≥ 36px once the final is recorded | `MatchCard.css:150-153` `.match-card__champion-name { font: var(--text-display) }`, call site `MatchCard.tsx:275`. | **pass** |

### Precision note on assertion 21 — recorded, not a failure

`05-UI-SPEC` §Layout Budget models a match card at **96px**. The shipped card composes to **113px**:
the model omits `.match-card__result`, which `MatchCard.css:83` states is *"present on every card in
every state"* and which reserves `1.5em` at `--text-body` = 27px, plus the body's second
`--space-1` gap and the card's `--hairline-w` borders.

Re-derived with the shipped figure, round 1 of an 8-seed bracket is
`4 × 113 + 3 × 24 = 524`, plus a `20 + 8` round header = **552px against ~765px available**.
**The assertion's conclusion holds with 213px of slack.** This is a documentation-accuracy finding
about the spec's intermediate arithmetic, not a layout failure, and it is recorded here rather than
silently corrected because §Layout Budget's numbers are cited by an acceptance criterion.

### Whole-phase style gates

Run across the thirteen stylesheets this phase added: `ResultsGrid`, `BracketGrid`, `MatchCard`,
`StandingsTable`, `TiebreakOrderer`, `CutControl`, `FinishedNotice`, `StalenessBanner`,
`RosterRefresh`, `RecapList`, `TournamentLibrary`, `MatchRecordDialog`, `TournamentScreen`.

| Gate | Expected | Actual | Result |
| --- | --- | --- | --- |
| No raw hex colour in any of the thirteen | 0 files | **0 files** — every one returns a count of 0 | **pass** |
| Raw px **declared** across the thirteen | exactly 1 | **exactly 1** — `ResultsGrid.css:28 --results-col-min: 188px` | **pass** |
| `tokens.css` still declares exactly four `--text-*` sizes | 4 | **4** — `body` 18px, `label` 14px, `heading` 24px, `display` 36px (`tokens.css:110-113`) | **pass** |
| No fifth `--text-*` token consumed anywhere under `src/` | 4 distinct | **4 distinct** — `--text-body`, `--text-label`, `--text-heading`, `--text-display` | **pass** |

**On the raw-px count.** A naive `grep -cE "[0-9]+px"` also matches `MatchCard.css:51`,
`RecapList.css:105-106`, `TournamentLibrary.css:9-10` and `TournamentScreen.css:36`. Every one of
those is **prose inside a comment** explaining the arithmetic, not a declaration. Restricted to
declarations, the count is exactly 1, as the acceptance criterion intends.

---

## Part 2 — the physical check (Task 2, AWAITING A HUMAN)

**Do not fill any of this in from the source. There is no automated fallback.**
`05-RESEARCH` §Environment Availability records this check as human-dependent, and
`05-UI-SPEC` §DRFT-14 records it as *"mandatory and not substitutable"*.

### Rig — set up once, run both parts

- **8 players**
- **`blind` ban mode, 2 bans each** (this is what Phase 4's item needs)
- **`standard` density**
- **a 1080p screen**
- **three metres of floor**

Then for Part 2b: `Draft, brackets and match log`, `Best of one` round robin, `Best of three`
bracket.

### Part 2a — Phase 4's outstanding item (04-11 task 3) — currently BLOCKING

This is **not** only a legibility question. It is also Phase 4's **secrecy** check, and it gates
BAN-05 and BAN-06 acceptance as well as DRFT-14.

```
setup: |
  Run the blind ban stage on the rig above. Stand three metres back from the locked screen
  before anyone has revealed.
expected: |
  1. Every ban-stage surface is legible at three metres — whose turn it is, the progress
     count, and which players show `Entered`.
  2. The secrecy half: you must not be able to name any Pokemon from the locked screen.
     Nothing on screen may reveal a submission before the reveal.
pass_condition: |
  Both halves hold. If either fails, this item stays BLOCKING.
result:   passed
note: |
  Host confirmed both halves. Legibility half: the ban-stage surfaces read at three metres.
  Secrecy half: nothing on the locked screen was readable as a Pokemon name before the reveal —
  confirmed explicitly on a direct question, because the orchestrator's first phrasing of the
  question inverted the pass condition and the ambiguous answer was not resolved by assumption.
  Phase 4's 04-11 task 3 BLOCKING item is cleared by this run; BAN-05 and BAN-06 secrecy
  acceptance is satisfied (threat T-05-84).
```

**If this part is not run in this session, it stays BLOCKING and must not be recorded as passed.**

### Part 2b — Phase 5's check 5, the tournament stage

Complete a draft on the same 8 players, then work through (a) to (e). **Record a result per
surface, not one overall verdict** — the Phase 3 pass was reported as a single pass and `STATE.md`
records the resulting ambiguity about which surfaces were marginal. This pass exists partly so that
is not repeated.

| # | Surface | What you do at three metres | Pass condition | Result | Note |
| --- | --- | --- | --- | --- | --- |
| a | The results grid, about half recorded | Read the **remaining-match count** aloud. Then, without moving closer, say roughly how many cells are still empty. | The **count** is the pass condition. The empty-cell estimate is evidence for or against the empty-cell treatment, recorded either way. | passed | Host reported a to e together as all passing. No empty-cell estimate was recorded separately. |
| b | Three recorded cells | Read aloud the two players from the headers and the result from the cell, for three different cells. | All three read correctly — both names and the result. | passed | |
| c | The standings table | Read every player name, every record, and the tiebreak note on any tied row. | Names and records read at 24px; the tiebreak note reads at 14px. | passed | |
| d | The 8-seed bracket, cut at 5 so three byes are drawn | Read every bracket slot aloud, including the byes and the `Winner of …` placeholders. | Every slot readable. Byes and placeholders identifiable as such. | passed | |
| e | The champion | Record the final. Read the champion's name aloud. | The name reads at 36px. | passed | |

**Density, not size, is what is new here.** Every *size* on these surfaces already passed a physical
check in Phase 3 or Phase 4 on the pessimistic screen. What is new is **28 cells in one view** where
the ban board had at most 8 columns of 8. That is why the remaining count is in words at 24px and
why unplayed cells are visually empty — neither asks you to resolve 28 small differences across a
room.

---

## Summary

Fill in once Part 2 is complete.

```
automated_assertions:  7 of 7 passed (17-23)
automated_gates:       4 of 4 passed (hex, px, four sizes, no fifth token consumed)
physical_part_2a:      passed (Phase 4's BLOCKING item — cleared)
physical_part_2b:      passed (a through e)
total_physical:        6
passed:                6
failed:                0
pending:               0
```

## Gaps

```
- truth: "The 8-player results grid, the 8-seed bracket and the champion's name are legible from
    three metres on a 1080p screen, verified by a person and recorded per surface"
  status: resolved
  severity: blocking
  test: [2b-a, 2b-b, 2b-c, 2b-d, 2b-e]
  reason: "Task 2 of 05-15-PLAN.md is a blocking checkpoint. 05-RESEARCH §Environment
    Availability records the physical check as human-dependent with NO automated fallback, and
    05-UI-SPEC §DRFT-14 records it as mandatory and not substitutable. Everything checkable from
    source was checked in Task 1 and all seven assertions pass."
  disposition: "Run 2026-09-01 at three metres on a 24-27\" 1080p screen. Host reported all five
    surfaces as passing. Recorded with one caveat on granularity: the host reported a to e together
    rather than surface by surface, so the record shows five passes on the host's word rather than
    five independently narrated readings. No surface was reported marginal. See the granularity
    gap below."

- truth: "Phase 4's outstanding physical check is run in the same session, so the project carries
    one unrun physical item rather than two"
  status: resolved
  severity: blocking
  test: [2a]
  reason: "04-11 task 3, recorded BLOCKING in STATE.md. Batched into this session by 05-15-PLAN.md
    because the rig is identical — 8 players, blind, 2 bans each, standard density, a 1080p screen
    and three metres. It doubles as Phase 4's secrecy check for BAN-05 and BAN-06."
  disposition: "Run 2026-09-01 in this session on the same rig. Both halves passed: ban-stage
    surfaces legible at three metres, and no Pokemon nameable from the locked screen before the
    reveal. 04-11 task 3 is cleared and Phase 4 no longer carries an unrun physical item."

- truth: "A physical pass is recorded per surface rather than as a single verdict (threat T-05-82)"
  status: partial
  severity: advisory
  test: [2b-a, 2b-b, 2b-c, 2b-d, 2b-e]
  reason: "T-05-82 exists because Phase 3's pass was reported as one verdict and STATE.md still
    carries the resulting ambiguity about which surfaces were marginal. This pass was requested
    per surface and answered as 'all approved', which is a single verdict again, and 2b-a's
    empty-cell estimate — evidence about the empty-cell treatment, not a pass condition — was not
    captured at all."
  disposition: "Not re-run. The five pass conditions are recorded as passed on the host's report
    and no surface was called marginal, so nothing is recorded as verified that the host did not
    assert. The missing empty-cell estimate is evidence rather than a gate, and the density
    question it informs can be revisited if a real draft night reports the grid as hard to read.
    Kept advisory so it surfaces in /gsd-audit-uat rather than being silently dropped."
```
