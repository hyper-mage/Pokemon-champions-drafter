---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: planning
stopped_at: Phase 2 UI-SPEC approved
last_updated: "2026-08-07T02:37:10.498Z"
last_activity: 2026-08-06
progress:
  total_phases: 5
  completed_phases: 1
  total_plans: 11
  completed_plans: 11
  percent: 20
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-03)

**Core value:** A group of friends can run an entire draft tournament — rules, bans, picks, swaps, brackets, results — start to finish inside the tool, without anyone reaching for a spreadsheet or a Discord message to track state.
**Current focus:** Phase 2 — host configured draft night

## Current Position

Phase: 2
Plan: 5 of 6 written
Status: Planning incomplete — 02-06 missing, plan-checker not yet run
Last activity: 2026-08-07

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 11
- Average duration: —
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 11 | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Coarse granularity kept deliberately at 94 requirements — 5 vertical MVP phases, Phase 1 is the heaviest at 32 requirements
- [Roadmap]: Walking skeleton folded into Phase 1 alongside the roster foundation rather than being its own phase
- [Roadmap]: Rules compiler and swaps share Phase 3, compiler first — typed slots are a hard prerequisite for swaps
- [Roadmap]: Phase 2 first satisfies a draft-only night; Phase 5 first satisfies a full bracketed tournament

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

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-08-07
Stopped at: Phase 2 planning, 5 of 6 plans written — planner terminated on an account session limit
Resume file: .planning/phases/02-host-configured-draft-night/02-01-PLAN.md

### Resuming Phase 2 planning

Run `/gsd-plan-phase 2` and choose **Add more plans**. Do not replan from
scratch — 02-01..02-05 are complete, validated, and committed at `f25e46d`.

**What is missing:** plan `02-06`, the shared draft screen. It is the only
uncovered work and it is one coherent slice: DRFT-07 (drafted Pokémon leave
the pool), DRFT-10 (players × rounds board as pick history), DRFT-11 (each
team visible as it fills), DRFT-12 (on-the-clock indicator), DRFT-13
(destructive actions confirm). Coverage today is 14/19; 02-06 closes it to
19/19 and satisfies Success Criterion 5.

**Then run the plan-checker over all six.** It has never seen any of these
plans — the session limit hit before verification. Do not execute Phase 2
until it has.

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
