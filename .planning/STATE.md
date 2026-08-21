---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Phase 4 UI-SPEC approved
last_updated: "2026-08-21T17:53:17.792Z"
last_activity: 2026-08-21 -- Phase 04 execution started
progress:
  total_phases: 5
  completed_phases: 3
  total_plans: 47
  completed_plans: 36
  percent: 60
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-03)

**Core value:** A group of friends can run an entire draft tournament — rules, bans, picks, swaps, brackets, results — start to finish inside the tool, without anyone reaching for a spreadsheet or a Discord message to track state.
**Current focus:** Phase 04 — blind-and-snake-bans

## Current Position

Phase: 04 (blind-and-snake-bans) — EXECUTING
Plan: 1 of 11
Next: Phase 04 (blind-and-snake-bans) — not started, no directory, 0 plans
Status: Executing Phase 04
Last activity: 2026-08-21 -- Phase 04 execution started

Progress: [████████████░░░░░░░░] 36/36 plans in phases 1–3 (3 of 5 phases)

**Sequencing note (2026-08-20).** ROADMAP's execution order is 1→5, but Phase 5 depends only on
Phase 3 and its own entry says it is "independent of Phase 4 and buildable before it." Phase 5
carries REFR-01…03 — in-app roster refresh and the `validUntil` staleness banner — and this
file's own notes expect Champions regulation M-C around **2026-09-02**. If the rotation lands
before Phase 5 ships, the committed snapshot goes stale with no in-app path off it. Phase 4 has
no comparable clock, and its ROADMAP notes ask for a real playtest with the group — the same
session the one outstanding UAT item needs. Not decided; recorded so the choice is deliberate.

## Performance Metrics

**Velocity:**

- Total plans completed: 36
- Average duration: — (only 2 of 36 plans were timed)
- Total execution time: not tracked

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 11 | - | - |
| 02 | 13 | - | - |
| 03 | 12 | - | - (only P01/P02 timed, 70min combined) |

**Per-plan:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 03 P01 | 42min | 3 tasks | 24 files |
| Phase 03 P02 | 28min | 3 tasks | 18 files |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 03 P02 | 28min | 3 tasks | 18 files |
| Phase 03 P03 | 14min | 2 tasks | 6 files |
| Phase 03 P04 | 35min | 3 tasks | 22 files |
| Phase 03 P05 | 27min | 3 tasks | 10 files |
| Phase 03 P06 | 28min | 3 tasks | 11 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Coarse granularity kept deliberately at 94 requirements — 5 vertical MVP phases, Phase 1 is the heaviest at 32 requirements
- [Roadmap]: Walking skeleton folded into Phase 1 alongside the roster foundation rather than being its own phase
- [Roadmap]: Rules compiler and swaps share Phase 3, compiler first — typed slots are a hard prerequisite for swaps
- [Roadmap]: Phase 2 first satisfies a draft-only night; Phase 5 first satisfies a full bracketed tournament
- [Phase 03]: migrateV2ToV3 upgrades config only — nothing in schema 3 makes an existing log entry unfoldable, so no log surgery
- [Phase 03]: rules is derived from megasRequiredPerTeam in both migrate and the import guard, never defaulted — the document holds the true answer
- [Phase 03]: Migration arms are typed with Omit-derived V2Config/V2Doc rather than an as-cast, so each arm stays strictly checked against what it produces
- [Phase 03]: The Swaps config group adds no feasibility code — 03-05 owns what is satisfiable, and a second authority would be free to disagree with it
- [Phase 03]: canApply does not recheck index contiguity — the structural guard already pins it, so a second check would be unreachable code reading as a second authority
- [Phase 03]: compile() clamps for layout only and never repairs the config — the feasibility gate stays the only authority on satisfiability
- [Phase 03]: The schedule is materialized into the log because it carries a host reorder compile() cannot reproduce — origination is guarded by canApply, replay deliberately is not
- [Phase 03]: Reserved chrome is one element with a modifier class — an open round renders the same marker span with no text, so reordering never shifts the board grid
- [Phase 03]: The reorder is discarded by the Megas-required input handler, compared on the parsed value — one authority, and 2 to 3 to 2 genuinely discards
- [Phase 03]: A rule line whose condition can never be false renders unconditionally, with the reasoning recorded where the branch would have gone
- [Phase 03]: A schedule move swaps kinds between fixed round numbers and re-indexes, so the ordinal stays the row identity
- [Phase 03]: isMegaEligible is one pure predicate with four named consumers; the X/Y pin compares MegaForme.forme and never a name
- [Phase 03]: Pool cell, grid, typeahead and chip list widened over a PoolSubject type parameter rather than a bare union, so existing narrow call sites keep narrow handlers
- [Phase 03]: PoolGrid and FilterBar take an idPrefix — two grids now mount on one screen, which falsified 02-08's fixed-id assumption
- [Phase 03]: RULE-09 is measured over the candidate set, never the drawn pool — the draw is null whenever the gate has anything to say, and drawPool stage 2 carries the count into the pool by construction
- [Phase 03]: The pool draw partitions on Mega ELIGIBILITY, not the megaCapable flag — the flag lets the quota fill with species whose every forme is banned
- [Phase 03]: A host-typed numeric field is bounded at the same constant the import guard uses, so the build cannot create a document isValidTournament refuses to re-open
- [Phase 03]: swapRoundsOnExactPool sits above poolExactlyMinimum — the two always hold together and the bar renders only problems[0], so the lower one would be unrenderable
- [Phase 03]: A round's restriction is composed into matchesFilters rather than pre-filtering the entries prop — {total} in the of-form count has to be the whole leftover pool or the forced form says nothing
- [Phase 03]: The round restriction is applied from the prop on every compile and never held in filter state, so Clear filters, the empty-state resets and clear-on-pick cannot widen a round's offer
- [Phase 03]: An empty Mega-round offer is explained and never widened — a fallback allowing a non-Mega pick is the removed post-pick validator wearing a friendlier name
- [Phase 03]: The SLOT decides the export stone, never the species — CompletedDraft takes the fold rather than a teams record so a species and its stone cannot come from two copies

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

[Issues that affect future work]

- **Phase 1 verification chores (not design decisions):** resolve the 207-vs-208 base-species discrepancy by re-diffing Showdown's `champions` mod against PokeAPI, and re-verify the canonical 73 Mega-capable count against the fixture set.
- **Phase 1 export spike:** pokebase.app's acceptance of an `@ item` line specifically was inferred, not tested. Hand-verify both export targets with a Mega-containing team before building on the assumption.
- **Phase 3 rules compiler:** HIGH research need. The compilable-vs-non-compilable rule-class taxonomy has no prior art in surveyed draft tooling.
- **Phase 3 priority cards / Phase 4 blind bans:** MEDIUM research need each; both are novel hot-seat UX with only party-app and tabletop precedent. Both want a real playtest with the 4–8 friend group.
- **Roster rotation timing:** Champions regulation M-C is expected around 2026-09-02. Snapshot regulation-labeling must land in Phase 1, not later.
- Phase 3 verify gate: tests/ui/ban-list.test.tsx times out under full-suite parallel load. Pre-existing — reproduced with pre-plan src at e663518. Logged in 03/deferred-items.md; not this plan's to fix.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260813-tep | Fix WR-07 / T-02-15 — one inert gate around every screen, not just the draft | 2026-08-14 | d34cc2a | [260813-tep-wr-07-inert-shell-restructure](./quick/260813-tep-wr-07-inert-shell-restructure/) |
| 260820-l4u | Close Phase 3 human-UAT — board-height check passed, screen-reader pass descoped | 2026-08-20 | b495465 | [260820-l4u-close-phase-3-human-uat-pass-board-heigh](./quick/260820-l4u-close-phase-3-human-uat-pass-board-heigh/) |

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Human verification | 03-12 Task 1 — three-metre legibility pass (DRFT-14 assertions 9–12) | **passed 2026-08-19**; assertion 12 (8-player board height) separately **passed 2026-08-20** | — |
| Human verification | 03-12 Task 2 — screen-reader pass on the four focus-moving transitions (WR-02) | **DESCOPED 2026-08-20** — host decision, not a test result. See `03/deferred-items.md` §7 | closed |
| Human verification | 03-12 Task 3 — playtest the rotation and low-plays-first with real players (ROADMAP Notes) | deferred to beta test — **the one item still outstanding** | 2026-08-19 |

**Task 1 — passed.** Host verified at three metres on a **~24" 1080p monitor**. Reported as a
pass overall rather than itemised per surface; the five surfaces the plan names are the card
digit, the played-row name, the hand pip, the Mega marker, and the 8-player board height with no
internal scrollbar.

This is the *pessimistic* case in `03-UI-SPEC`'s arc-minute table (~92ppi: card digit ~11 arcmin,
pips ~7.6, marker ~5.7 against an acuity limit of ~5 and comfort at 16–20). The spec predicted
that on a 24" monitor only the card digit would be comfortable while the pips and marker were
**marginal** — readable but not comfortable. A pass here is consistent with that prediction rather
than falsifying it, and it means the surfaces clear the bar on the *harder* of the two screens the
spec models. On a TV-sized shared screen they have considerably more headroom.

**Task 2 — not run.** The host reports no screen reader configured and judged the check
unimportant for now. It is NOT passed and must not be recorded as such: `03-UI-SPEC` §Interaction
& Accessibility requires the outcome live in the `SchedulePreview`, `CardPanel` and `SplitPanes`
doc blocks, and the open question at `src/ui/components/SplitPanes.tsx:146-167` — whether a polite
announcement queued alongside a focus move is preempted — remains unsettled from Phase 2. The
design does not depend on the answer (every fact is also carried by a focused control's own name
or by persistent on-screen text), so this is a documentation gap, not a functional risk.

Windows Narrator needs no install (`Ctrl` + `Win` + `Enter`) if this is picked up later.

**Task 3 — deferred to beta.** Host's decision: run the playtest as part of a beta once the whole
tool is complete, rather than at the end of Phase 3. The two mechanics it would test — D-18's
rotation and D-23's low-plays-first — are each a one-line change in `selectCardPlayOrder` and
`resolvePickOrder` respectively, so deferring costs little.

**Consequence:** no `03-12-SUMMARY.md` is written, so plan 03-12 stays incomplete and Phase 03
stays open and unverified. Plans 03-01 through 03-11 are complete and green.

## Session Continuity

Last session: 2026-08-20T22:54:45.336Z
Stopped at: Phase 4 UI-SPEC approved
Resume file: .planning/phases/04-blind-and-snake-bans/04-UI-SPEC.md

### Phase 2 planning is complete

Next command: `/gsd-execute-phase 2`.

Eight plans, six waves, 19/19 requirement coverage. Written across four
planner runs (the first died on an account session limit), so the plans were
verified as a set rather than per-run.

| Wave | Plan | Slice |
|------|------|-------|
| 1 | 02-01 | Pure core — `feasibility.ts`, `draw.ts`, `search.ts`, roster tripwire |
| 1 | 02-02 | schemaVersion 1→2 migration across all three compare sites |
| 1 | 02-03 | Type pills, stat blocks, density prefs, pool grid |
| 2 | 02-04 | Landing + config screen, player list, feasibility bar |
| 3 | 02-05 | Pool sizing, Mega rules, numeric field, constrained draw |
| 4 | 02-06 | Shared draft screen — board, team strips, confirms *(not autonomous — D-23 checkpoint)* |
| 5 | 02-07 | Host banlist surfaces |
| 6 | 02-08 | Pool filter bar — search, type toolbar, roving tabindex |

**Plan-checker outcome:** 1 blocker + 5 warnings, all fixed inline (they were
frontmatter attribution and prose hygiene, no plan logic was wrong). The
blocker was DRFT-14 claimed by 02-04, which does no legibility work, while
02-06 — which owns the mandatory D-23 three-metre checkpoint — did not claim
it. Fixed by moving the claim. Checker verified clean on wave graph, forward
references, purity boundary, dependency count, threat models, and all 39
locked decisions tracing to an implementing task.

**Two recorded overrides — re-surface these at verify-phase:**

1. **Decision-coverage gate overridden.** `check.decision-coverage-plan`
   reports 3/39 because it scans only `must_haves` for `D-NN` citations. In
   fact 30 of 39 are cited by id in plan bodies, and the nine never cited by
   id anywhere — D-15, D-18, D-19, D-20, D-25, D-26, D-28, D-30, D-31 — were
   each verified content-covered by hand (D-15 → 02-01+02-04; D-18/19 →
   02-06 `SplitPanes`; D-20 → 02-03 `view-prefs.ts`; D-25/26/28/30/31 →
   02-03). Gate measures citation location, not coverage.
   **Re-hit and re-overridden 2026-08-15** on the `--gaps` run that added
   02-11/02-12/02-13 (3/39 again, now against 13 plans). The three new plans
   are a keyboard-focus regression fix and cite only D-21; requiring them to
   claim 36 config/pool/ban decisions they do not touch would be false
   traceability. Overridden with explicit user assent.

2. **02-06 Task 3 is knowingly over the 30% per-task context budget** (~35%,
   12 files). Left whole on purpose: a confirm on `Abandon draft` while
   `Re-roll pool` commits silently is an inconsistency, not a partial
   delivery. It carries a `<sizing_note>` telling the executor to stop and
   report rather than rush the copy. **Watch this task during execution.**

**Known deferral, recorded not dropped:** 02-08's `<coverage_note>` reports
02-UI-SPEC's "Pool grid keyboard navigation" and "Focus after a pick" rows
are unbuilt. They serve DRFT-07/DRFT-14, both covered elsewhere, and CONTEXT
reserves keyboard/touch support on the shared screen as Claude's discretion.
`use-roving-tabindex` ships generalized for that consumer, so adoption is
wiring rather than design.

**02-UI-SPEC.md is deliberately stale on one point** — its 7-item feasibility
precedence list. RESEARCH.md's corrected 10-case order is authoritative; see
decision 2 below. Worth folding back into the spec eventually; not blocking.

### Decisions locked before planning (do not re-litigate)

Research is `.planning/phases/02-host-configured-draft-night/02-RESEARCH.md`
(commit `820db72`, HIGH confidence, every figure computed against the
committed roster snapshot rather than recalled).

1. **The ROADMAP's `players × 6 ≤ 207` ceiling is wrong** — it used
   `counts.baseSpecies`. Measured: 235 draftable, 74 Mega-capable, 18 types,
   exactly 2 dual-Mega (Charizard, Raichu). True ceilings: Exact **39**
   players, ×1.5 **26**, ×2 **19**. Nothing hardcodes them (D-17).

2. **Plan against RESEARCH.md's corrected feasibility gate, not 02-UI-SPEC's
   7-item precedence list**, which has three holes. Worst: a free numeric
   pool-size field yields `NaN`, and `NaN > 235` and `NaN < 48` are *both*
   false — the gate reports all-clear and Start enables on a broken config.
   Also `megasRequiredPerTeam > rounds` uncaught at low player counts, and
   `legalCount = 235 − bans.length` breaks on a duplicate ban (count
   set-based). A ninth reason string covers "too many players at Exact".
   **02-UI-SPEC.md still carries the old list** — treat RESEARCH.md as
   authoritative on this one point.

3. **Two-stage partition draw**, not reject-and-redraw. Reject-and-redraw
   needs ~64M expected redraws at 8 players / 4 Megas / Exact
   (P = 1.56e-8) — a config that passes every blocker. Browser hang, not
   slowdown. Known caveat accepted: mildly biased toward Mega-heavy pools.

4. **Migrate Phase 1 saves; bump SCHEMA_VERSION 1 → 2.** Every new field has
   a lossless v1 default. Three sites compare `schemaVersion` and all must
   route through `migrate`: `store.ts:212`, `persistence.ts:222` (the
   *wrapper* record, before `isValidTournament`), `import-guard.ts:444`.
   Miss `persistence.ts` and `Resume saved draft` silently never appears for
   a Phase 1 save — invisible to import-only tests.

5. **No referential-integrity check in `import-guard`** — its "a bound is not
   an integrity check" posture stays. Run `checkFeasibility` on adopted docs
   and show a non-blocking notice instead.

6. **Config-time seeds live in action payloads**, stamped at the edge. A new
   payload field must land in four places or it is silently dropped on round
   trip: payload interface, creator, structural guard, `buildLogEntry`.

7. **Roll `orderSeed` on mount** so Start never depends on a prior click and
   "no order yet" is unrepresentable.

8. **F-03 name comparison normalizes** trim + lowercase + collapse internal
   whitespace, so `Sam` and `sam ` collide.

**Proven, worth a test rather than defensive code:** pool-dry mid-draft is
impossible once `pool/built` carries `N` distinct ids with `N ≥ p × r`. The
final picker's option count is exactly `N − p×r + 1`. The blocker *is* the
guarantee.
