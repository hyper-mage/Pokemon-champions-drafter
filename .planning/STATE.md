---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: Full Draft and Tournament
status: Awaiting next milestone
stopped_at: v1.0 archived; next milestone undefined
last_updated: "2026-09-02T19:44:03.000Z"
last_activity: 2026-09-02 — Milestone v1.0 completed and archived
progress:
  total_phases: 5
  completed_phases: 5
  total_plans: 62
  completed_plans: 62
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-02 after the v1.0 milestone review)

**Core value:** A group of friends can run an entire draft tournament — rules, bans, picks, swaps, brackets, results — start to finish inside the tool, without anyone reaching for a spreadsheet or a Discord message to track state.
**Current focus:** v1.0 shipped and archived 2026-09-02. Next milestone is undefined — run `/gsd-new-milestone` (questioning → research → requirements → roadmap). `.planning/REQUIREMENTS.md` was archived and removed; the next milestone writes a fresh one.

## Current Position

Phase: — (v1.0 complete, phases 1–5 archived)
Plan: —
Status: Awaiting next milestone definition
Last activity: 2026-09-02 — Milestone v1.0 completed and archived

## Performance Metrics

**Velocity:**

- Total plans completed: 62
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
| Phase 04 P11 | ~35min | 2 of 3 tasks | 15 files |

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
- [Phase 04]: The post-reveal re-check passes `banMode: 'hostBanlist'` as well as `bansPerPlayer: 0` — both fields mean "player bans not yet in the banlist", and at the reveal there are none
- [Phase 04]: The blocked reveal quotes the gate's sentence unedited and adds D-22's exit as its own element — a UI-composed rival sentence would be a second author, and appending to a remedy that has expired would offer an action the host cannot take
- [Phase 04]: `selectAttributedBans` branches on `banMode` in `selectPublicBanIds`' shape, so what the room may see and whose name sits above it cannot disagree about the authoritative source
- [Phase 04]: `drawPoolForBanStage` returns false rather than throwing, guarded by three conditions read backwards off `drawPool`'s own selection calls rather than by a catch
- [Phase 04]: `CheckpointPrompt.heading` is a required prop with no default, so a new milestone must name the moment it is standing at rather than inherit `Draft complete` on a screen where the draft has not started

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

[Issues that affect future work]

Every v1.0-era blocker is resolved. Resolved entries were cleared at the v1.0 close on 2026-09-02;
the ones that mattered are recorded as outcomes in `MILESTONES.md` and
`milestones/v1.0-ROADMAP.md` → Issues Resolved. Items still open are carried in **Deferred Items**
below rather than duplicated here.

Open, and relevant to whatever comes next:

- **Nothing has been run with the real 4–8 friend group.** The tool is verified but unplayed. The
  card-mechanic playtest (Deferred Items) is the highest-value next signal, and it is the only
  unrun human verification in the project.
- **Regulation M-C was due around 2026-09-02** — i.e. now. The snapshot pipeline is built for this
  (`ROST-03`/`ROST-05` pin an exact npm version plus sha512, and the drift tripwire fails loudly),
  but M-C has not been generated or diffed. Expect `npm run build:data` plus a fixture re-check as
  early next-milestone work.
- **`BAN-07` and `EXPO-04`** are the two v1 requirements that did not ship Complete. See Deferred
  Items for what each actually needs.


### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260813-tep | Fix WR-07 / T-02-15 — one inert gate around every screen, not just the draft | 2026-08-14 | d34cc2a | [260813-tep-wr-07-inert-shell-restructure](./quick/260813-tep-wr-07-inert-shell-restructure/) |
| 260820-l4u | Close Phase 3 human-UAT — board-height check passed, screen-reader pass descoped | 2026-08-20 | b495465 | [260820-l4u-close-phase-3-human-uat-pass-board-heigh](./quick/260820-l4u-close-phase-3-human-uat-pass-board-heigh/) |

## Deferred Items

Items acknowledged and deferred at the **v1.0 milestone close on 2026-09-02**. All were disclosed
before close, not discovered at it. Full context in `MILESTONES.md` and
`milestones/v1.0-MILESTONE-AUDIT.md`.

| Category | Item | Status |
|----------|------|--------|
| human_verification | Phase 3 — card-mechanic playtest with real players (D-18 rotation advantage, D-23 low-plays-first, struck-through card comprehension, pick-order findability) | deferred to beta — **the one genuinely open item** |
| requirement | `BAN-07` — duplicate-ban policy `Re-ban` arm | Partial by owner decision D-19; ships present-but-disabled |
| requirement | `EXPO-04` — Showdown validator clause | Pending; requirement-text defect, needs a reword not a build |
| uat | Phase 3 — screen-reader pass on the four focus-moving transitions (WR-02) | DESCOPED 2026-08-20 by host decision; documentation gap, not a functional risk |
| tech_debt | 24 warnings + 16 info findings open across Phases 1–3 (Phases 4–5 carry none) | accepted; itemised in `MILESTONES.md` |
| tech_debt | `tests/build/sw-manifest.test.ts` and `tests/ui/ban-list.test.tsx` flaky under full-suite parallel load | accepted; neither failed in the audit-time run |
| tech_debt | `PERS-05` cross-machine JSON round trip only ever run on one machine | accepted |
| tech_debt | GitHub Actions pinned to floating major tags rather than commit SHAs | accepted |
| tech_debt | Remote branch `master` is stale and is still GitHub's default branch | accepted |
| tech_debt | No `.gitattributes`; `git add` on Windows emits CRLF warnings | accepted |

**Not deferred items — tooling artifacts.** `gsd-sdk query audit-open` reports both quick tasks as
`[missing]` and counts Phases 02 and 05 as UAT gaps at 0 pending scenarios each. Neither is a repo
defect: `scanQuickTasks` reads an unprefixed `SUMMARY.md` while the GSD quick workflow writes
`<id>-SUMMARY.md`, so every quick task reports `[missing]` regardless of contents. Both quick tasks
are complete on disk. Recorded here so a future close does not re-investigate it.

**Phase 3 detail — the deferred playtest.** Host's decision 2026-08-19, re-confirmed 2026-08-20:
run the playtest as part of a beta once the whole tool is complete, rather than at the end of
Phase 3. The two mechanics it would test are each a one-line change — `selectCardPlayOrder` for
D-18 and `resolvePickOrder` for D-23 — so deferring costs little. This is the sole item behind
Phase 3's `human_needed` verification status, and the only unrun human verification in the project.

**Screen-reader detail.** The host reports no screen reader configured and judged the check
unimportant for now. It is NOT passed and must not be recorded as such: `03-UI-SPEC`
§Interaction & Accessibility requires the outcome to live in the `SchedulePreview`, `CardPanel`
and `SplitPanes` doc blocks, and the open question at `src/ui/components/SplitPanes.tsx:146-167` —
whether a polite announcement queued alongside a focus move is preempted — remains unsettled. The
design does not depend on the answer: every fact is also carried by a focused control's own name
or by persistent on-screen text. Windows Narrator needs no install (`Ctrl` + `Win` + `Enter`) if
this is picked up later.


## Session Continuity

Last session: 2026-09-02 — v1.0 milestone archived.
Stopped at: milestone close complete; next milestone undefined.
Resume file: none — start with `/gsd-new-milestone`.

Phase-level planning context for phases 1–5 has been retired from this file. All of it is on disk
and unchanged:

- Phase plans, summaries, verifications, UAT and review documents: `.planning/phases/01…05/`
- Per-phase research and UI specs: alongside each phase's plans
- Roadmap as it stood at close, with full phase details, success criteria, requirement mapping and
  ordering constraints: `milestones/v1.0-ROADMAP.md`
- All 94 v1 requirements with per-requirement evidence: `milestones/v1.0-REQUIREMENTS.md`
- Coverage, integration and E2E-flow analysis: `milestones/v1.0-MILESTONE-AUDIT.md`

The durable rules that outlived the milestone — the purity boundary, `id`-not-`name`, sprite
filename resolution, `seq` allocation, serializability, the blank-line export separator, styling
tokens, copy voice, and the `npm run verify` gate — live in `CLAUDE.md` and are the authority for
new work.


## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
