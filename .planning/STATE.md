---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 03-03 — the schedule preview and its reorder
last_updated: "2026-08-18T03:53:49.355Z"
last_activity: 2026-08-18 -- Phase 03 plan 03 complete
progress:
  total_phases: 5
  completed_phases: 2
  total_plans: 36
  completed_plans: 27
  percent: 75
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-03)

**Core value:** A group of friends can run an entire draft tournament — rules, bans, picks, swaps, brackets, results — start to finish inside the tool, without anyone reaching for a spreadsheet or a Discord message to track state.
**Current focus:** Phase 03 — compiled-rules-priority-cards-swaps

## Current Position

Phase: 03 (compiled-rules-priority-cards-swaps) — EXECUTING
Plan: 4 of 12
Plans: 8 of 8 written, 6 waves
Status: Executing Phase 03 — 03-03 complete, 03-04 next
Last activity: 2026-08-18 -- Phase 03 plan 03 complete

Progress: [████████░░] 75%

## Performance Metrics

**Velocity:**

- Total plans completed: 33
- Average duration: —
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 11 | - | - |
| 02 | 13 | - | - |
| 03 | 2 | 70min | 35min |

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

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-08-18T03:53:11.835Z
Stopped at: Completed 03-02 — the compiled schedule, in the log and on the board
Resume file: None

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
