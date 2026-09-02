# Roadmap: Pokémon Champions Drafter

## Milestones

- ✅ **v1.0 Full Draft and Tournament** — Phases 1–5 (shipped 2026-09-02) — [archive](milestones/v1.0-ROADMAP.md)

## Phases

<details>
<summary>✅ v1.0 Full Draft and Tournament (Phases 1–5) — SHIPPED 2026-09-02</summary>

- [x] Phase 1: Draft Skeleton on a Real URL (11/11 plans) — completed 2026-08-06
- [x] Phase 2: Host-Configured Draft Night (13/13 plans) — completed 2026-08-15
- [x] Phase 3: Compiled Rules, Priority Cards, Swaps (12/12 plans) — completed 2026-08-19
- [x] Phase 4: Blind and Snake Bans (11/11 plans) — completed 2026-08-25
- [x] Phase 5: Full Tournament — Brackets, Standings, Archive (15/15 plans) — completed 2026-09-01

Full phase details, success criteria, requirement mapping and ordering constraints:
[`milestones/v1.0-ROADMAP.md`](milestones/v1.0-ROADMAP.md).
Shipped summary, decisions and known gaps: [`MILESTONES.md`](MILESTONES.md).

</details>

### 📋 v1.1 — Not yet defined

Run `/gsd-new-milestone` to define the next milestone (questioning → research → requirements →
roadmap). Carried-forward items that milestone should consider are recorded in
[`MILESTONES.md`](MILESTONES.md) under Known Gaps and in [`STATE.md`](STATE.md) under Deferred
Items.

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Draft Skeleton on a Real URL | v1.0 | 11/11 | Complete | 2026-08-06 |
| 2. Host-Configured Draft Night | v1.0 | 13/13 | Complete | 2026-08-15 |
| 3. Compiled Rules, Priority Cards, Swaps | v1.0 | 12/12 | Complete | 2026-08-19 |
| 4. Blind and Snake Bans | v1.0 | 11/11 | Complete | 2026-08-25 |
| 5. Full Tournament — Brackets, Standings, Archive | v1.0 | 15/15 | Complete | 2026-09-01 |

**v1.0 total:** 5 phases, 62 plans, 118 tasks — 100% complete.

## Ordering Constraints

These came out of v1.0 research and are recorded here because they outlive the milestone. Numbers
1–3 and 6 are now settled facts about the built codebase rather than predictions; they are kept
because a future phase that violates them causes rework, not just inconvenience.

1. **Roster classification precedes everything that touches the pool.** Forme, Mega, cosmetic and
   battle-only classification and the base-species draftable unit must be settled before pool
   building, bans, the compiler, or export.
2. **Persistence and undo precede the draft engine being real.** The append-only log and pure
   reducer exist from the first line of draft code; retrofitting undo onto mutable state is the
   classic rewrite trigger.
3. **The rules compiler precedes swaps.** The compiler establishes typed team slots and
   deliberately removes runtime validation — swaps built without typed slots silently violate
   composition rules with nothing left to catch them. The single most important ordering
   constraint in the project.
4. **Host-banlist mode early, blind/snake later.** Host banlist is a list of IDs and it unlocks the
   Mega-ban list the compiler needs; blind-ban pass-the-device UX is a separate, harder design
   problem.
5. **Brackets and standings are fully additive.** They consume only completed teams. A drafter
   without brackets still ships; brackets without a drafter are worthless.
6. **The feasibility solver splits across two concerns.** General pool arithmetic (RULE-07) belongs
   with the config screen; Mega-specific feasibility (RULE-09) is inseparable from the compiler,
   because it needs the compiled schedule to know how many Mega rounds exist.
