# Phase 5: Full Tournament — Brackets, Standings, Archive - Research

**Researched:** 2026-08-26
**Domain:** Tournament structure (round robin, seeded single elimination, standings tiebreaks) over an append-only log; roster refresh against a service-worker-precached same-origin snapshot
**Confidence:** HIGH on brackets/standings/log shapes (derived and executed this session); HIGH on roster-refresh transport (probed live this session); MEDIUM on the library's storage failure modes (reasoned from shipped code, not measured under quota pressure)

---

## Summary

This phase is two unrelated problems wearing one phase number. The bracket half is arithmetic
with a locked design: `05-CONTEXT.md` D-03 deletes the round-robin scheduling problem outright
(a fill-in-any-order grid, no circle method, no sit-out rounds), and D-07 fixes bye placement
to standard top-seed seeding — which, verified by execution this session, **falls out of the
classic seed-order recursion for free with no special-casing**. The genuine work in that half is
not the algorithms; it is expressing D-09's "later beats earlier", D-10's explicit clearing
action and D-11's cut invalidation as appends on a log whose reducer sees one action at a time,
without inventing a second write path.

The roster half is the only place where something was actually unknown, and it resolved
concretely. Probed live today: `raw.githubusercontent.com` serves this repo's own
`public/data/roster.index.json` with `Access-Control-Allow-Origin: *`, `Cache-Control: max-age=300`
and `Content-Type: text/plain`; the deployed Pages origin serves the same file with
`Cache-Control: max-age=600` and `application/json`, and honours an ignored query string
identically. But the deciding fact is not CORS — it is that **`public/sw.js` is cache-first with
`ignoreSearch: true`, so a same-origin refresh fetch is answered by the precache forever, and
`cache: 'reload'` does not bypass a service worker.** Same-origin refresh therefore requires a
three-line, one-test change to `public/sw.js`; off-origin requires none, because the worker
already returns early for cross-origin. That trade is stated honestly below, and the
recommendation still lands on same-origin — for sprite coverage and offline totality, not for
the invariant the CONTEXT cites.

Two corrections to upstream documents are recorded below rather than absorbed silently: T-01-25
is **not** asserted by a test (§Correction 1), and D-10's two-action shape has an atomicity
question that a single action would answer better (§Conflicts With Locked Decisions).

**Primary recommendation:** Add one action family (`tournament/*`, five types), one new pure
module (`src/core/tournament.ts`) holding seeding, bracket structure, standings and the void
cascade, one doc-taking recap module (`src/core/recap.ts` — the recap needs the log, which
`DraftState` does not carry), and a **separate `localStorage` key** for the library so
`PersistedRecord`, `generation` and the tab-ownership lock are untouched. Bump schema 4 → 5 for
three config fields. Make REFR-01 a same-origin fetch with `?refresh=1` plus a matching early
return in `public/sw.js`.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

Copied from `.planning/phases/05-full-tournament-brackets-standings-archive/05-CONTEXT.md`
§Implementation Decisions. All D-01…D-26 are locked. Every recommendation in this document
is subordinate to them; the one place where a recommendation would deviate is flagged in
§Conflicts With Locked Decisions rather than applied.

**Depth — what each tier generates**

- **D-01:** Both deeper depths run the same structure: round robin → seeded cut → single
  elimination. The third tier adds the match log, not the bracket. `draftAndBrackets` records
  winners only. `draftBracketsAndLog` records the same structure plus TOUR-07's numeric field
  and the editable match history. `draftOnly` skips every bracket screen entirely.
- **D-02:** At `draftAndBrackets` the tiebreak chain is record → head-to-head → host override,
  and the differential column is simply not rendered. A greyed-out differential column was
  considered and rejected.

**The round robin**

- **D-03:** Round robin is a fill-in-any-order results grid, not a generated round-by-round
  pairing schedule. Every pairing is present from the moment the round robin starts and the
  host records results in whatever order the games actually happen. No circle-method schedule,
  no sit-out rounds at odd player counts, no round structure to keep in sync with reality. The
  consequence to design for: nothing in the tool tells the group what to play next, so the grid
  itself has to make "what is left" obvious at a glance.
- **D-04:** The TOUR-07 metric — Pokémon remaining or KO differential — is a host choice at
  config time. A new `TournamentConfig` field beside `depth`, in the same shape `swapBudget`,
  `swapRounds` and `bansPerPlayer` already take. The standings column header and the match
  input's label both read from it. It only has an effect at `draftBracketsAndLog` per D-01.
- **D-05:** Recording a match is ONE action carrying both the winner and the number. A match is
  never half-recorded, so standings never have to read a match that has a winner and no
  differential, and TOUR-08's second link is never partly blind.

**The cut and the bracket**

- **D-06:** The top-N cut size is chosen AFTER the round robin, from the standings screen. Not
  at config time. A config-time default that is confirmable later was explicitly rejected.
- **D-07:** Byes go to the top seeds, standard bracket seeding. Seed 1 first, then seed 2, and
  so on — 7 players take 1 bye, 6 take 2, 5 take 3. A seeded-RNG draw and a host-assigned bye
  were both rejected.
- **D-08:** Best-of-three is set per stage — round robin and bracket separately. Two config
  values. A match cell renders a 2-of-3 counter or a single winner depending on which stage it
  sits in. Per-match toggling was rejected.

**Corrections — TOUR-06 against an append-only log**

- **D-09:** A correction is a second `match/recorded` for the same match id, and the fold reads
  the latest entry per match. No `match/corrected` family and no clear-then-record pair. The
  fold must state in as many words that later beats earlier.
- **D-10:** A correction that changes who is in a downstream match ALSO appends an explicit
  clearing action naming the matches voided. With an explicit clear: nothing resurrects, the
  recap shows exactly what was voided, and undo puts the whole correction back in one step. The
  host is told what will be cleared before confirming.
- **D-11:** Correcting a round-robin result after the cut has been taken invalidates the cut and
  everything after it. Deliberately harsh and the consistent answer.
- **D-12:** Match records join the single undo stack that already covers picks, cards, swaps and
  bans.

**Standings and the tiebreak**

- **D-13:** The TOUR-08 host override is: the host puts the still-tied block in an order by
  hand. Recorded as a log action naming exactly which players it resolved. Picking a winner
  pair-by-pair was rejected (cycles). Typing seed numbers was rejected (collisions and gaps).

**The library — PERS-08**

- **D-14:** A capped multi-tournament library in `localStorage`, listed on the landing screen,
  holding WHOLE documents. Each entry is the full log, re-foldable, re-exportable. A compacted
  summary was rejected outright. This is a deliberate expansion beyond the one-slot design that
  shipped in Phase 1. The JSON file remains the system of record, and every path that files a
  tournament must keep offering the download.
- **D-15:** Starting a new tournament files the current one into the library automatically. The
  confirm names where it went; it does not warn about replacement.
- **D-16:** The library is bounded by a fixed cap on entries. At the cap the oldest is offered
  for download and then dropped. The host is told before anything goes. The cap NUMBER is
  Claude's to choose and defend.
- **D-17:** A tournament goes read-only once the final is recorded, and `tournament/reopened` is
  a log action. Locked is therefore a fold — a final recorded with no later reopen. Correcting
  anything in a finished tournament requires reopening it first. That is the intended friction.
- **D-18:** When the final is recorded, the bracket stays on screen with the champion named on
  it. No new summary screen.

**The recap — PERS-09**

- **D-19:** Chronological — the night in order, top to bottom.
- **D-20:** The recap covers everything the log holds — bans, card plays, picks, swaps, passes
  and match results.
- **D-21:** Blind bans render from `bans/revealed` and its collisions ONLY — never from the raw
  `bans/submitted` entries. The recap reads `selectPublicBanIds` / `selectAttributedBans`.
- **D-22:** The recap shows corrections. It says a result was recorded and then corrected, and
  what got voided downstream.

**Roster refresh — REFR-01/02/03**

- **D-23:** The refresh control lives on the config screen, beside the roster the tournament is
  being created against.
- **D-24:** A tournament — live or filed — loads its OWN snapshot by `rosterVersion` and keeps
  working unchanged. **Consequence for planning:** the app must be able to hold more than one
  snapshot resolved at once — the live document's and the default — rather than assuming
  `loadRoster()`'s single answer.
- **D-25:** The staleness banner warns and never blocks, with refresh as its stated next action.
  Blocking a new tournament was rejected because it would also block a host with no network.
- **D-26 (derived, flagged):** A staleness banner shown anywhere other than the config screen
  routes to the config screen rather than duplicating the refresh control, and REFR-02's offline
  roster-JSON import sits beside the refresh control on the config screen.

### Claude's Discretion

Surfaced as gray areas and deliberately left to research and planning. Decide them, record the
reasoning, and do not re-ask the owner.

- **Where REFR-01's refresh actually fetches from.** Same-origin re-fetch with the
  service-worker cache bypassed, vs. `raw.githubusercontent.com` against the project's own repo.
  If off-origin wins, the `roster-source.ts:1-13` doc block and its test change deliberately,
  with the reasoning written down.
- **Where the automatic tiebreak chain stops and D-13's override begins.** Head-to-head applies
  only to 2-way ties and anything larger goes straight to the override; or a mini-table among
  the tied group first. Whichever is chosen, the standings must SAY which link is currently
  deciding the order.
- **The library cap number in D-16**, and its defence.
- **The schema 4 → 5 migration, and the library's own storage versioning.**
- **What tier 3's "match log" holds beyond the numeric field.** TOUR-10's free-text house-rules
  field is v2 and is not the answer.
- **Whether the config-time feasibility gate says anything about depth.** If depth gets a gate,
  it goes in `feasibility.ts` and nowhere else.
- **Three-metre legibility for every new surface.**
- **Whether a live region can announce a match result usefully.**

Four of these are already resolved by `05-UI-SPEC.md` (approved this phase) and must not be
re-decided by planning: the cap is **12**, head-to-head is **two-way ties only**, the depth
feasibility gate is a **`warning` at fewer than 4 players**, and the refresh recommendation is
**same-origin**. This document supplies the evidence for the last of those and the mechanism for
all four.

### Deferred Ideas (OUT OF SCOPE)

- **A copy-to-clipboard or shareable text form of the recap.** PERS-09 says the recap is
  *rendered*. A recap text export belongs in its own phase.
- **The free-text house-rules field on the tournament page.** TOUR-10, v2.
- **Double elimination, Swiss, and consolation brackets.** PROJECT.md §Out of Scope.
- **Multi-client play with every player on their own device.** `dispatch` remains the single
  seam it would integrate through.

Additionally deferred by `05-UI-SPEC.md` §Deferred and carried here so planning does not
rediscover them: removing a library entry by hand; TOUR-11 game-by-game logging inside a Bo3;
REFR-04 regulation selector; the WR-02 screen-reader check; a results grid above 8 players
fitting without horizontal scroll.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TOUR-01 | Host chooses tournament depth — draft only, draft plus brackets, or draft plus brackets plus match log | `config.depth` already ships (`model.ts:108`, `:213`). §Architecture Patterns → Pattern 1 gives the stage selector that consumes it; §Standard Stack → schema 5 gives the two format fields and the metric field D-04/D-08 need beside it |
| TOUR-02 | Round robin generation with standings | §Bracket & Standings Algorithms → Round Robin (derived pair set, no schedule — D-03); §Standings gives the group-then-refine algorithm and `selectStandings` |
| TOUR-03 | Single elimination bracket generation, including byes for non-power-of-two player counts | §Bracket & Standings Algorithms → Seeded Single Elimination, with the executed 5/6/7 tables and the `N − 1` invariant |
| TOUR-04 | Best-of-three as a label plus a 2-of-3 counter | §Action Vocabulary → `winnerGames` / `loserGames`, bounded by the stage format from `config` (D-08) |
| TOUR-05 | Host records the winner of each match, and brackets and standings advance automatically | §Action Vocabulary → `tournament/matchRecorded`; advancement is a selector, never stored (§Pattern 2) |
| TOUR-06 | Match records are editable after entry | §Corrections as Appends — D-09's "latest wins" fold arm plus D-10's cascade |
| TOUR-07 | One numeric result field per match — Pokémon remaining or KO differential — feeds the standings tiebreak | §Action Vocabulary → `metric`, `MAX_MATCH_METRIC = 18`; §Standings link 2 |
| TOUR-08 | Standings tiebreak runs record, then differential, then head-to-head, ending in an explicit host override | §Standings → the four-link chain, the two-way head-to-head rule, `tournament/tiebreakOrdered` and its set-equality self-invalidation |
| TOUR-09 | A seeded top-N cut connects round robin into the elimination bracket | §Action Vocabulary → `tournament/cutTaken { seeds }` materialized; §Pitfall 4 — the cut must be inert when it splits an unresolved tie block |
| PERS-08 | Completed tournaments remain viewable after the draft ends | §The Library — a separate `localStorage` key, whole documents, cap 12 |
| PERS-09 | A draft recap is rendered directly from the action log | §The Recap Needs The Log — `src/core/recap.ts` takes `TournamentDoc`, not `DraftState` |
| REFR-01 | Host can fetch the project's own pre-built roster snapshot from within the app | §Roster Refresh — probed transports, the service-worker obstacle, the recommended `?refresh=1` + `cache: 'reload'` shape |
| REFR-02 | Host can import a roster JSON file with no network access | §Roster Refresh → Validation, shared with the fetch path; `file-io.ts` + `LandingScreen`'s hidden-input pattern reused |
| REFR-03 | A staleness banner compares the current date against the snapshot's validUntil, needing no network | §Staleness — half-open interval verified against `roster.index.json`, ISO string comparison, `todayIso()` at the edge |
</phase_requirements>

---

## Project Constraints (from CLAUDE.md)

Binding on every recommendation below. Restated because several of them decide a design
question in this phase rather than merely constraining it.

| Directive | Where it decides something in Phase 5 |
|-----------|---------------------------------------|
| Runtime `dependencies` is exactly `preact` and `@preact/signals`, exact-pinned | No bracket, charting, DnD or virtualization package. §Package Legitimacy Audit records zero installs. |
| `src/core/` is pure — no DOM, clock, randomness, network, storage, timers, no `preact` import | The staleness comparison cannot read a clock (§Staleness). `crypto` is a forbidden token (`check-pure-core.mjs:72`), so any digest verification is an adapter (§Roster Refresh → Validation). |
| One append-only log; corrections are compensating actions, never edits | §Corrections as Appends. D-09 and D-10 are both appends; `undoLast` remains the only removal. |
| Nothing derived is stored | Bracket structure, standings, seeding, remaining-match count and match participants are all selectors. Only `pool/built`-class host acts are materialized (§Pattern 2). |
| Ambient values stamped at the edge in `dispatch` | `seq`, `at`, `actorId` on every new `tournament/*` action; `todayIso` handed into the pure staleness comparison. |
| Externally derived results materialized into the log | `tournament/cutTaken` carries `seeds`, following `pool/built`'s `ids` + `rosterVersion` + `checksum` precedent. |
| Serializability — no `Set`, `Map`, `Date`, class instance persisted | New payload fields are strings, numbers and string arrays only. `DraftState` additions stay plain arrays (§Fold Shape). |
| `seq` is `max(seq) + 1`, strictly increasing, MAY have gaps | Void targeting by `seq` inherits `draft/pickUndone`'s tolerance for a missing target. |
| Identity is `id`, never a display name; never `split('-')` a species name | §Pitfall 1 — a concatenated match id built from player ids is ambiguous because `import-guard.buildPlayers` bounds an id only as "non-empty unique string". |
| Plain CSS from `tokens.css`; no raw hex, no raw px the token table covers; one stylesheet per component | Thirteen new components, thirteen new stylesheets (`05-UI-SPEC.md` §Component inventory). |
| No `innerHTML` / `dangerouslySetInnerHTML` (`check:nohtml` across all of `src/`) | Bracket connectors are CSS borders, not injected SVG markup. |
| Hand-written `public/sw.js`; cache version hashes file CONTENT; never `vite-plugin-pwa` | §Roster Refresh → the service-worker obstacle, and the three-line change it forces. |
| `tests/core/**` mirrors `src/core/**` with ZERO mocks; default vitest env is `node`; a UI test opts in with `// @vitest-environment happy-dom` as the FIRST line | Every algorithm below is stated as a pure function precisely so its test needs no DOM. |

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Round-robin pair set, bracket structure, bye placement, seeding | `src/core/` (new `tournament.ts`) | — | Pure arithmetic over `config.players` and the fold. Zero-mock tests are the whole payoff. |
| Standings, tiebreak chain, which link decided a row | `src/core/tournament.ts` | — | A rule in a component is a rule that cannot be tested at 5, 6 and 7 players in a `node` environment. |
| Which matches a correction voids | `src/core/tournament.ts` | — | The UI must show the count *before* dispatch (`Record and void {n} matches`), so it must be a selector, not a reducer side effect. |
| Match record / cut / override / void / reopen as events | `src/core/actions.ts` + `reduce.ts` | `src/store.ts` (`dispatch` stamps the envelope) | Established seven-site pattern: constant, payload interface, `Intent` member, creator, structural guard, `buildLogEntry` arm, `apply`/`canApply` arms. |
| Locked / reopened | `src/core/tournament.ts` selector over the fold | — | D-17: a fold, not a flag, so an imported document cannot claim to be unlocked. |
| Draft recap | `src/core/recap.ts` (takes `TournamentDoc` **and** `DraftState`) | — | Needs the whole log including superseded results (D-22). `DraftState` holds only the latest per match. `undo.ts` sets the doc-taking precedent. |
| Staleness comparison | `src/core/roster/staleness.ts` (pure, takes two ISO strings) | `src/adapters/clock.ts` supplies `todayIso()` | `new Date` and `Date.now` are forbidden tokens in core. |
| Roster fetch, roster-JSON file read, multi-snapshot resolution | `src/adapters/roster-source.ts` | `public/sw.js` (one early return) | `fetch` is a forbidden token in core; the precache is what makes the fetch a no-op without the worker change. |
| Tournament library storage | `src/adapters/library.ts` (new, separate key) | `src/adapters/persistence.ts` unchanged | Reshaping `PersistedRecord` would put the tab-ownership `generation` comparison at risk for no gain. |
| Which surface to render | `src/app.tsx` + `src/ui/screens/TournamentScreen.tsx` | — | Branches on the stage selector; computes nothing (`05-UI-SPEC.md` §Pure-core boundary). |

---

## Standard Stack

### Core

No packages are added. The stack for this phase is the repository as it stands.

| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| `preact` | `10.29.8` (exact-pinned, shipped) | UI rendering | Locked by `CLAUDE.md` §Constraints. [VERIFIED: `package.json` read this session] |
| `@preact/signals` | `2.10.1` (exact-pinned, shipped) | Reactive state | Locked. [VERIFIED: `package.json`] |
| `vitest` | `^4.1.10` (devDependency, shipped) | Tests, `node` env by default | `vite.config.ts` `test.environment: 'node'`, `include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx']`. [VERIFIED: `vite.config.ts` read this session] |
| `happy-dom` | `^20.11.1` (devDependency, shipped) | UI test environment, opt-in per file | `// @vitest-environment happy-dom` as the first line. [VERIFIED: `package.json`, `CLAUDE.md` §Conventions] |
| Node | `v24.15.0` local, `24` in CI | Build and test runtime | [VERIFIED: `node --version`, `.github/workflows/deploy.yml`] |

### Supporting — new modules, not new packages

| Module | Path | Purpose |
|--------|------|---------|
| Tournament rules | `src/core/tournament.ts` (new) | Seeding, bracket structure, byes, round-robin pair set, standings, tiebreak chain, void cascade, locked fold |
| Recap fold | `src/core/recap.ts` (new) | Chronological recap over `TournamentDoc.log` (D-19…D-22) |
| Staleness | `src/core/roster/staleness.ts` (new) | `isSnapshotStale(validUntil, todayIso)` — pure string comparison |
| Library storage | `src/adapters/library.ts` (new) | Its own `localStorage` key, its own wrapper version |
| Snapshot registry | extend `src/adapters/roster-source.ts` | `loadRoster(regulationId?)`, `refreshRoster()`, `readRosterFile(file)`, `resolveSnapshot(rosterVersion)` (D-24) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled bracket in `src/core/tournament.ts` | `brackets-manager` / `tournament-organizer` | Constraint violation (third runtime dependency), and both impose a CRUD storage abstraction that fights a single serializable document. `CLAUDE.md` §What NOT to Use names them. **Rejected before evaluation.** |
| A new `localStorage` key for the library | Reshaping `PersistedRecord` to hold an array | Reshaping puts `generation` — the field `loadIfNewer` compares to prevent cross-tab clobber (`persistence.ts:323-350`) — inside a restructure, for zero benefit. A separate key means an older install simply has no library key and needs no migration at all. **Recommend separate key.** |
| Same-origin refresh + a 3-line `sw.js` change | `raw.githubusercontent.com` refresh, no `sw.js` change | See §Roster Refresh → The Two Transports, Weighed. Off-origin is genuinely cheaper on the service worker and dearer on sprites and offline totality. |
| `matchId: string` with a pinned pattern | A discriminated payload (`stage` + `playerIds` / `bracketRound` + `bracketSlot`) | One field vs four, one regex in the guard vs a union arm. See §Pitfall 1 for why the pattern must be index-based, not id-based. |

**Installation:** none. `npm install` adds nothing for this phase.

---

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| *(none)* | — | — | — | — | not run | **No packages installed by this phase** |

**Packages removed due to slopcheck `[SLOP]` verdict:** none — none were proposed.
**Packages flagged as suspicious `[SUS]`:** none.

This phase installs nothing. `CLAUDE.md` caps runtime `dependencies` at `preact` and
`@preact/signals`, both already present and exact-pinned, and §What NOT to Use rejects by name
every package category this phase might otherwise reach for (bracket generation, bracket
rendering, virtualization, drag-and-drop, state management, PWA tooling). The legitimacy gate is
satisfied vacuously and the planner must treat **any** `npm install` task in a Phase 5 plan as a
constraint violation to be escalated, not a trade-off to be weighed.

---

## Architecture Patterns

### System Architecture Diagram

```
                         ┌──────────────────────────────────────────┐
  host click ───────────►│ src/ui/screens/TournamentScreen.tsx      │
  (grid cell,            │  branches on selectTournamentStage       │
   bracket card,         │  computes nothing                        │
   Take the cut,         └───────────────┬──────────────────────────┘
   Confirm this order,                   │ intent
   Reopen)                               ▼
                         ┌──────────────────────────────────────────┐
                         │ src/store.ts  dispatch(intent)           │
                         │  stamps seq = max(seq)+1, at = now(),    │  ◄── src/adapters/clock.ts
                         │  actorId = 'host'; asks canApply         │
                         └───────────────┬──────────────────────────┘
                                         │ Action
                    ┌────────────────────┴─────────────────────┐
                    ▼                                          ▼
        ┌───────────────────────┐               ┌──────────────────────────┐
        │ doc.log  (append)     │               │ apply(state, action)     │
        │  append-only, never   │──── fold ────►│  reduce.ts               │
        │  edited               │               │  matchResults / cut /    │
        └──────────┬────────────┘               │  overrides / reopenSeq   │
                   │                            └────────────┬─────────────┘
                   │ (whole log)                             │ DraftState
                   ▼                                         ▼
        ┌───────────────────────┐        ┌──────────────────────────────────────┐
        │ src/core/recap.ts     │        │ src/core/tournament.ts  (pure)       │
        │  buildRecap(doc,state)│◄───────│  selectRoundRobinMatches             │
        │  D-19 chronological   │        │  selectStandings   (4-link chain)    │
        │  D-21 revealed bans   │        │  selectSeeding                       │
        │  D-22 corrections     │        │  selectBracket     (byes, N−1)       │
        └───────────────────────┘        │  selectVoidCascade (D-10 / D-11)     │
                                         │  selectTournamentStage / Locked      │
                                         └──────────────┬───────────────────────┘
                                                        │ derived view
                                                        ▼
                                              back to TournamentScreen

  ─── separate concern, no log involvement ────────────────────────────────────

  Check for a new roster ─► roster-source.refreshRoster()
                              fetch(BASE + 'data/roster.index.json?refresh=1',
                                    { cache: 'reload', credentials: 'omit' })
                                      │
                                      ▼
                              public/sw.js fetch handler
                                url.searchParams.has('refresh') → return (no respondWith)
                                      │ network
                                      ▼
                              GitHub Pages origin (same origin)
                                      │
                                      ▼
                              parseSnapshotStrict → snapshot registry (in memory)
                                      │                    ▲
                              Import roster JSON… ──────────┘  (same validator, no network)

  Landing / Config ─► isSnapshotStale(snapshot.validUntil, todayIso())   ◄── clock.ts
                        pure string compare, no network            (REFR-03)

  New tournament / Open ─► src/adapters/library.ts  (localStorage, its OWN key)
                             writes library FIRST, then the live slot
```

### Recommended Project Structure

```
src/
├── core/
│   ├── tournament.ts          # NEW — seeding, bracket, standings, cascade  (pure)
│   ├── recap.ts               # NEW — chronological fold over the LOG       (pure)
│   ├── roster/
│   │   └── staleness.ts       # NEW — isSnapshotStale(validUntil, todayIso) (pure)
│   ├── actions.ts             # +5 types, +5 payloads, +5 creators, +5 guards
│   ├── model.ts               # SCHEMA_VERSION 5; 3 config fields; DraftState +4
│   ├── reduce.ts              # +5 apply arms, +5 canApply arms, +~10 reasons
│   ├── migrate.ts             # V4_CONFIG_DEFAULTS, migrateV4ToV5, SUPPORTED += 5
│   ├── import-guard.ts        # 3 config fields, 5 buildLogEntry arms, MAX_MATCH_METRIC
│   ├── undo.ts                # isUndoable +4, removalIndices pairs record+void,
│   │                          #   UndoRemoval.kind +5
│   ├── feasibility.ts         # +1 warning code: bracketNeedsFourPlayers
│   └── selectors.ts           # unchanged (tournament selectors go in tournament.ts)
├── adapters/
│   ├── library.ts             # NEW — champions-drafter:library, own wrapper version
│   ├── roster-source.ts       # loadRoster(id?), refreshRoster(), readRosterFile()
│   ├── clock.ts               # + todayIso(): 'YYYY-MM-DD' from LOCAL date parts
│   └── persistence.ts         # UNCHANGED except the schema-5 constant it already reads
├── ui/
│   ├── screens/TournamentScreen.tsx + .css     # NEW
│   └── components/ …13 components, 13 stylesheets  (05-UI-SPEC §Component inventory)
├── store.ts                   # undoAnnouncement +5 arms (exhaustive `never` forces it)
└── app.tsx                    # Screen union += 'tournament'; routing; library wiring
public/
└── sw.js                      # +1 early return for ?refresh=1
tests/
├── core/
│   ├── tournament.test.ts     # NEW — 5/6/7 byes, N−1 invariant, chain, cascade
│   ├── recap.test.ts          # NEW — chronological order, D-21 blind-ban rule
│   └── roster/staleness.test.ts   # NEW — half-open interval, no clock
├── adapters/library.test.ts   # NEW — cap, eviction order, bad-entry tolerance
└── build/sw-behaviour.test.ts # +1 case: a ?refresh= request is not answered from cache
```

### Pattern 1 — A stage is a fold, not a flag

`selectPhase` (`selectors.ts:754`) and `selectBanStageState` (`:985`) both derive a screen mode
from the log so an imported document cannot declare a state it is not in. The tournament stage
follows them exactly, including the `'notRunning'` member name.

```ts
// src/core/tournament.ts
// Source: mirrors src/core/selectors.ts:985 selectBanStageState
export type TournamentStage = 'notRunning' | 'roundRobin' | 'bracket';

export function selectTournamentStage(state: DraftState): TournamentStage {
  if (state.config.depth === 'draftOnly') return 'notRunning';
  if (!selectIsTournamentComplete(state)) return 'notRunning';
  return state.cut === null ? 'roundRobin' : 'bracket';
}
```

`selectIsTournamentComplete` (`selectors.ts:709`) is the exact moment the bracket stage becomes
reachable, and it is picks-complete **and** no swap round outstanding — which is already the
condition the export panels and the PERS-06 checkpoint open on (`app.tsx:835`). Reuse it; do not
re-derive it.

**Locked is a second, separate fold** (D-17), not a fourth stage member, because D-18 keeps the
bracket on screen when it fires:

```ts
export function selectTournamentLocked(state: DraftState): boolean {
  const final = selectBracket(state)?.final ?? null;
  const result = final === null ? null : findResult(state, final.matchId);
  return result !== null && result.seq > state.lastReopenSeq;
}
```

`state.lastReopenSeq` starts at `-1` and is set by the `tournament/reopened` arm. Because undo
removes the entry and **re-folds** (`undo.ts` module header — "the entire implementation is
remove the action and fold again"), the reopen unwinds for free with no inverse logic.

### Pattern 2 — Materialize the host act, derive everything downstream

`pool/built` carries `ids` + `rosterVersion` + `checksum` + `seed`; `order/resolved` carries the
resolved order; `bans/revealed` carries the attributed reveal. Each is a host act or an ambient
input at a point in the log that replay could not reproduce. `actions.ts:387-401` argues it out
for the reveal.

Two Phase 5 acts qualify and **must** be materialized:

- `tournament/cutTaken { seeds: string[] }` — the ordered player ids that advanced. Not just a
  size. D-11 says the cut is invalidated by a later round-robin correction; a cut that stored
  only a size would silently re-seed itself from changed standings and disagree with the bracket
  the room played.
- `tournament/tiebreakOrdered { playerIds: string[] }` — the host's hand-made order, naming
  exactly which players it resolved (D-13).

Everything else is derived and stored nowhere: the round-robin pair set, which matches remain,
standings, seeding, bracket structure, bye placement, who is in which bracket slot, the champion,
and the remaining-match count.

### Pattern 3 — Corrections are appends; the fold states "later wins" out loud

D-09 requires the fold to say it in as many words. In `apply`:

```ts
case TOURNAMENT_MATCH_RECORDED: {
  if (!isMatchRecordedAction(action)) return state;
  // D-09, IN AS MANY WORDS: LATER BEATS EARLIER. A correction is a second entry for the
  // same `matchId`, so this arm REPLACES rather than appends. Appending would leave two
  // entries for one match and every reader would have to re-derive which of them counts
  // — a second authority on one result, which is exactly what an append-only log is
  // supposed to make impossible.
  const others = state.matchResults.filter((r) => r.matchId !== action.matchId);
  return { ...state, matchResults: [...others, toMatchResult(action)] };
}
```

The superseded entry is still in `doc.log`, which is where D-22's recap reads it from — the fold
deliberately does not keep it, and the recap deliberately does not read the fold (§The Recap
Needs The Log).

### Pattern 4 — A compensating action names its targets by `seq`

`draft/pickUndone { targetSeq }` (`actions.ts:214`) is the established shape and `apply`'s arm
(`reduce.ts:235-251`) is the established idiom: filter by `seq`, and if nothing matched return
`state` unchanged. `tournament/resultsVoided { targetSeqs: number[], causedBySeq: number }`
follows it, and `seq` targeting is right rather than `matchId` targeting because it uniformly
names a match result, a cut, or both:

```ts
case TOURNAMENT_RESULTS_VOIDED: {
  if (!isResultsVoidedAction(action)) return state;
  const voided = action.targetSeqs;
  return {
    ...state,
    matchResults: state.matchResults.filter((r) => !voided.includes(r.seq)),
    cut: state.cut !== null && voided.includes(state.cut.seq) ? null : state.cut,
  };
}
```

Note what is **not** voided: `tournament/tiebreakOrdered`. An override self-invalidates by set
equality (§Standings link 4), so voiding it explicitly would be a second mechanism for one fact.
Write that reasoning into the arm's comment.

### Anti-Patterns to Avoid

- **A comparator-based standings sort.** `Array.prototype.sort` with a head-to-head comparator is
  non-transitive (A beats B, B beats C, C beats A) and the ECMAScript spec makes the output
  implementation-defined for an inconsistent comparator. Use group-then-refine (§Standings).
- **Storing the bracket.** Every bracket fact is derivable from `cut.seeds` + `matchResults`.
  A stored bracket would need patching on every correction — which is the mutable-state design
  D-10 and D-11 exist to avoid.
- **A `match/corrected` action family.** Explicitly rejected by D-09. A second type would mean
  two arms that can disagree about what a result is.
- **Deriving the recap from `DraftState`.** It cannot show a correction (§The Recap Needs The Log).
- **Reshaping `PersistedRecord` to hold the library.** It carries `generation`, which
  `loadIfNewer` compares to stop a promoted secondary tab clobbering the owner's work
  (`persistence.ts:323`). Add a key; do not restructure the one the lock depends on.
- **`registration.update()` + `skipWaiting` to force a new roster live.** `public/sw.js`'s header
  states the two lifecycle overrides are deliberately absent and that `npm run build`'s verify
  greps for them. Do not reintroduce either.
- **A "next match" indicator anywhere.** `05-UI-SPEC.md` §The reframe: D-03 means nothing tells
  the group what to play next; "what is left" is a count and a hole in the grid.
- **A losers bracket, a Swiss pairing, a consolation final, or Buchholz.** §Scope Fence.

---

## Bracket & Standings Algorithms

### The Round Robin — D-03 deletes the hard part

The ROADMAP's research brief asks for circle-method pairing and odd-count byes. **D-03 makes that
moot and it must not be built.** There is no round structure, no sit-out round, and no schedule
to keep in sync. The round robin is the complete pair set, present from the moment the round
robin starts.

```ts
// src/core/tournament.ts — derived, stored nowhere
export function selectRoundRobinMatches(state: DraftState): readonly RoundRobinMatch[] {
  const players = state.config.players;
  const out: RoundRobinMatch[] = [];
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      out.push({ matchId: `rr:${i}:${j}`, aId: players[i].id, bId: players[j].id });
    }
  }
  return out;
}
```

Counts, computed this session: **4 → 6, 5 → 10, 6 → 15, 7 → 21, 8 → 28.**
[VERIFIED: executed `node` this session] — 28 at eight players is the figure
`05-UI-SPEC.md` §4 sizes the grid against.

The remaining-match count that `05-UI-SPEC.md` makes load-bearing (`{k} of {n} matches still to
play.`, and the cut's gate) is `selectRoundRobinMatches(state).length` minus the number of those
matchIds present in `state.matchResults`. One selector, two consumers.

### Seeded Single Elimination — the recursion gives D-07 for free

The classic seed-order recursion: `order(1) = [1]`, and doubling maps each `s` to `[s, 2B+1−s]`.
Pair adjacent entries and you have round one.

```ts
function seedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    const next: number[] = [];
    for (const s of order) { next.push(s, n + 1 - s); }
    order = next;
  }
  return order;
}
```

Executed this session:

- `seedOrder(8)  = 1, 8, 4, 5, 2, 7, 3, 6`
- `seedOrder(16) = 1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11`

**Bye placement needs no code of its own.** Let `B` = the next power of two ≥ `N`. Pad the seed
list to `B`; a seed number greater than `N` is a phantom. Seed `s` faces seed `B+1−s`, so a
phantom opponent means `B+1−s > N`, i.e. `s ≤ B−N` — **the top `B−N` seeds, exactly what D-07
requires**, with no branch, no sort and no special case. The recursion is the bye rule.

The three counts ROADMAP success criterion 1 names, computed and printed this session
[VERIFIED: executed]:

**5 players — B = 8, 3 byes to seeds 1, 2, 3; 3 rounds; 4 real matches**

| Round 1 slot | Pairing | State |
|---|---|---|
| `br:1:1` | #1 vs — | **Bye**, seed 1 advances |
| `br:1:2` | #4 vs #5 | playable |
| `br:1:3` | #2 vs — | **Bye**, seed 2 advances |
| `br:1:4` | #3 vs — | **Bye**, seed 3 advances |

Semi-finals: `br:2:1` = seed 1 vs winner of `br:1:2` (waits); `br:2:2` = seed 2 vs seed 3
(**playable immediately**). Final `br:3:1`.

**6 players — B = 8, 2 byes to seeds 1, 2; 3 rounds; 5 real matches**

| Round 1 slot | Pairing | State |
|---|---|---|
| `br:1:1` | #1 vs — | **Bye** |
| `br:1:2` | #4 vs #5 | playable |
| `br:1:3` | #2 vs — | **Bye** |
| `br:1:4` | #3 vs #6 | playable |

**7 players — B = 8, 1 bye to seed 1; 3 rounds; 6 real matches**

| Round 1 slot | Pairing | State |
|---|---|---|
| `br:1:1` | #1 vs — | **Bye** |
| `br:1:2` | #4 vs #5 | playable |
| `br:1:3` | #2 vs #7 | playable |
| `br:1:4` | #3 vs #6 | playable |

**Advancement:** `br:r:s` feeds `br:(r+1):ceil(s/2)`. Slot parity decides which half of the
parent card the winner lands in — odd `s` is the upper slot.

**Round labelling** (`05-UI-SPEC.md` §9: `Quarter-final` · `Semi-final` · `Final`, and
`Round of {n}` for larger brackets) is decided by matches-in-round, never by round index —
because at `B = 8` round 1 *is* the quarter-final and at `B = 16` it is the round of 16:

| Matches in round | Label |
|---|---|
| 1 | `Final` |
| 2 | `Semi-final` |
| 4 | `Quarter-final` |
| `m ≥ 8` | `Round of {2 × m}` |

**No round collapsing at 5 players.** Three rounds render even though round 1 has one real
match. Collapsing would put seeds 2 and 3 in a "quarter-final" against each other on one screen
and a "semi-final" on another for the same game.

**The single best invariant test:** real matches (byes excluded) `= N − 1`, for every `N`.
Executed at N = 2, 3, 4, 5, 6, 7, 8, 9, 12, 16 → 1, 2, 3, 4, 5, 6, 7, 8, 11, 15.
[VERIFIED: executed this session]

### Standings — group-then-refine, never a comparator

Four links (D-02 drops link 2 at `draftAndBrackets`). The algorithm is a partition refinement,
not a sort, and this is the whole reason head-to-head is safe here:

```
1. Partition by wins, descending.                       → decidedBy 'record'
2. Within each block of size > 1, and ONLY at tier 3:
   partition by metric summed across every match, desc. → decidedBy 'metric'
3. Within each block that is now EXACTLY 2:
   order by their head-to-head result.                  → decidedBy 'headToHead'
   (If they have no recorded result — possible only after a void — leave unresolved.)
4. Any block still of size ≥ 2:
   apply `tournament/tiebreakOrdered` iff its playerIds
   are the SAME SET as the block.                       → decidedBy 'hostOrder'
   Otherwise the block is unresolved.                   → decidedBy 'tied'
```

Two consequences worth stating because they are easy to get wrong:

- **Head-to-head applies wherever a block has narrowed to two, not only to a two-way record
  tie.** At tier 3, three players tied on record whose metric splits them into `{A}` and `{B,C}`
  reach head-to-head legitimately for `{B, C}`. The rule is "the block is size 2", not "the
  record group is size 2".
- **The override self-invalidates.** Matching an override to a block by *set equality* means a
  later correction that changes the block's membership silently drops the override, and the
  block is unresolved again — no void action needed, and no stale hand-ordering can survive a
  changed table. This is why D-13 names the players rather than assigning seed numbers, and it
  is worth a test of its own.

`decidedBy` is a five-member union that maps 1:1 onto `05-UI-SPEC.md` §6's note table
(`'record' | 'metric' | 'headToHead' | 'hostOrder' | 'tied'`), which is what satisfies the
CONTEXT's requirement that "the standings must SAY which link is currently deciding the order".

```ts
export interface StandingsRow {
  playerId: string;
  position: number;      // shared across the members of an unresolved block
  wins: number;
  losses: number;
  metric: number;        // 0 at draftAndBrackets — never rendered there (D-02)
  decidedBy: 'record' | 'metric' | 'headToHead' | 'hostOrder' | 'tied';
}
export function selectStandings(state: DraftState): readonly StandingsRow[];
```

### The Cut

`selectSeeding(state)` is `selectStandings(state).map(r => r.playerId)` — the standings order
*is* the seeding order, which is the entire point of D-06 placing the cut on the standings
screen. `tournament/cutTaken { seeds }` carries the first `n` of them.

---

## Action Vocabulary

Five new types. Every one lands in the **seven** places `actions.ts`'s header and STATE.md
decision 6 name: the exported constant, the payload interface, the `Intent` union member, the
creator, the structural guard (`is…Action`), `import-guard.buildLogEntry`'s arm, and
`reduce.apply` + `reduce.canApply`. Miss `buildLogEntry` and the field is silently dropped on
round trip; miss `undoAnnouncement` and the compiler now says so (`UndoRemoval.kind`'s
`exhaustive: never`).

```ts
// src/core/actions.ts — additions
export const TOURNAMENT_MATCH_RECORDED  = 'tournament/matchRecorded';
export const TOURNAMENT_RESULTS_VOIDED  = 'tournament/resultsVoided';
export const TOURNAMENT_CUT_TAKEN       = 'tournament/cutTaken';
export const TOURNAMENT_TIEBREAK_ORDERED = 'tournament/tiebreakOrdered';
export const TOURNAMENT_REOPENED        = 'tournament/reopened';
```

| Payload | Fields | Notes |
|---------|--------|-------|
| `MatchRecordedPayload` | `matchId: string`, `winnerId: string`, `loserId: string`, `winnerGames: number`, `loserGames: number`, `metric: number` | D-05: one action, both facts. `loserId` is CARRIED, not derived — it is what makes D-10's "the participants changed" check possible for a bracket slot whose participants are themselves derived. |
| `ResultsVoidedPayload` | `targetSeqs: number[]`, `causedBySeq: number` | D-10's explicit clearing action. `causedBySeq` names the `matchRecorded` it accompanies, so `removalIndices` can pair them exactly rather than guessing (`triggeringCardIndex`'s stated concern, `undo.ts:200-214`). |
| `CutTakenPayload` | `seeds: string[]` | Materialized (Pattern 2). `size` is `seeds.length` and is not a second field. |
| `TiebreakOrderedPayload` | `playerIds: string[]` | The block, in the host's order. D-13. |
| `ReopenedPayload` | *(envelope only)* | D-17. Undoable like everything else. |

**Games.** Two fields rather than one, so `Won 2–1` renders straight off the payload and a future
TOUR-11 per-game log replaces the pair rather than reinterpreting a single number. Bounds live in
`import-guard.ts` (`winnerGames` 1–2, `loserGames` 0–1) and the *format* rule lives in `canApply`
— exactly the guard/`canApply` split `actions.ts`'s header illustrates with `cards/played`: a
guard can say it is a small integer; only `canApply` can say the stage's `config` format permits
it.

**Metric.** `metric: number` bounded `0 … MAX_MATCH_METRIC` where **`MAX_MATCH_METRIC = 18`**
(six Pokémon × three games, and the value `05-UI-SPEC.md` sized `--results-col-min` against).
Declare it in `import-guard.ts` beside `MAX_SWAP_BUDGET` and `MAX_BANS_PER_PLAYER`, and have the
`NumericField` read *that* constant — Phase 3's rule, so the build cannot create a document
`isValidTournament` refuses to reopen. Required rather than optional; it is `0` at
`draftAndBrackets` and never read there (D-01/D-02). Say so in the field's doc block.

### `matchId` shape — and why it must be index-based

```
^(rr:\d+:\d+|br:\d+:\d+)$
```

- `rr:{i}:{j}` — `i < j`, 0-based indices into `config.players`.
- `br:{round}:{slot}` — both 1-based.

Pin it with a module constant in the same style as `SNAPSHOT_FILE_PATTERN`
(`roster-source.ts:72`) and `SPRITE_FILE_PATTERN` (`sprite-src.ts:50`), and check it in
`buildLogEntry` — an unparseable id must fail the arm, not fold to a match nothing addresses.
§Pitfall 1 explains why player ids cannot be used here.

### New `canApply` rejection reasons

`RejectionReason` is a flat union in `reduce.ts:72-178`. Add:

`tournamentNotRunning`, `tournamentLocked`, `unknownMatch`, `matchNotPlayable`,
`wrongMatchParticipants`, `resultUnchanged`, `gamesNotForFormat`, `metricNotForDepth`,
`cutAlreadyTaken`, `cutSizeOutOfRange`, `roundRobinNotComplete`, `cutSplitsTiedBlock`,
`tiebreakBlockNotTied`, `notReopenable`, `nothingToVoid`.

`resultUnchanged` is not merely tidiness. `undo.ts:76-79` states the failure it prevents:
an action that changes nothing on screen is an undo step that appears to do nothing.
`05-UI-SPEC.md` §5 already makes the button inert for that case; the reducer is the second
layer, and the two together are what make the live-region announcement safe from
`LiveRegion`'s byte-identical limitation.

### Fold shape — four additions to `DraftState`

```ts
// src/core/model.ts — DraftState additions. All plain, all serializable-by-construction,
// though DraftState itself is never persisted.
matchResults: MatchResult[];          // latest per matchId (D-09); each carries its own seq
cut: { seeds: string[]; seq: number } | null;
tiebreakOrders: { playerIds: string[]; seq: number }[];   // latest per player SET
lastReopenSeq: number;                // -1 when never reopened
```

`seq` on each is off the **envelope**, never off array length — `cards/played`'s arm already
states why (`reduce.ts:258-260`) and `CLAUDE.md` §Conventions makes the gap tolerance explicit.

### Undo — D-12

- `isUndoable` gains all five guards. `NEVER_UNDONE` is unchanged: it names
  `pool/built`, `schedule/compiled`, `draft/started` and none of these is one of them.
  `undo.ts:113-160` argues the deny-list-plus-allow-list shape; an action in **neither** list is
  silently stepped past, which is the exact failure 04-RESEARCH Pitfall 8 records.
- `removalIndices` gains a second pairing arm beside `order/resolved`+`cards/played`: when the
  top entry is `tournament/resultsVoided`, take the `tournament/matchRecorded` at
  `causedBySeq` with it. That is what makes D-10's "undo puts the whole correction back in one
  step" true rather than intended.
- `UndoRemoval.kind` gains `'match' | 'void' | 'cut' | 'tiebreak' | 'reopen'`, and
  `undoAnnouncement` in `store.ts` gains five arms — the `const exhaustive: never` in its
  `default` makes that a compile error rather than a silent omission (`undo.ts:250-256`).
- `UndoRemoval.round` for all five: follow the ban precedent (`undo.ts:266-281`) and pass
  `config.rounds`, so a caller comparing it against the current round hears "no round was
  crossed". These all happen after the draft.

---

## Corrections as Appends — D-09, D-10, D-11 made concrete

`selectVoidCascade` is the one function the whole correction design rests on, and it must be a
**selector**, because `05-UI-SPEC.md` §5 relabels the primary button *before* dispatch
(`Record and void {n} matches`).

```ts
export interface VoidCascade {
  /** Log seqs to void. Empty means nothing downstream is affected. */
  targetSeqs: readonly number[];
  /** How many MATCH results are in `targetSeqs` — the `{n}` the button interpolates. */
  matchCount: number;
  /** True when the cut itself is voided — the `Record and void the bracket` label. */
  voidsCut: boolean;
}

export function selectVoidCascade(
  state: DraftState,
  matchId: string,
  nextWinnerId: string,
): VoidCascade;
```

**Round-robin match, no cut taken:** empty cascade. Button reads `Record the result`.

**Round-robin match, cut taken (D-11):** `voidsCut: true`; `targetSeqs` = the cut's `seq` plus
every bracket result's `seq`. **Unconditional on whether the winner changed** — D-11's wording is
unconditional, and at tier 3 a metric-only change can reorder standings and therefore reseed.
Button reads `Record and void the bracket`.

**Bracket match, winner unchanged:** empty cascade (a games or metric correction cannot change
who is in the next match). Button reads `Record the result`.

**Bracket match, winner changed (D-10):** walk forward from `br:(r+1):ceil(s/2)` to the final,
collecting the `seq` of every match on that path that has a recorded result. At most
`log2(B) − r` entries. Button reads `Record and void {n} matches`.

**Why an explicit clear and not "ignore results whose participants no longer match".** D-10
states the case: correct a semi-final, record a new final, correct the semi-final back — a purely
derived fold would resurrect the original final, which nothing on screen predicts. The void
removes it from the fold; re-recording is a fresh act. Write that sentence into the arm.

**Ordering.** Dispatch `matchRecorded` first, then `resultsVoided` with `causedBySeq` read back
off `getDoc()` — `app.tsx:514` sets the precedent ("Re-read: the play is in the log now"). Both
dispatches are synchronous in one handler and autosave is a 300ms trailing debounce
(`persistence.ts:52`), so there is no window in which a partial correction can be persisted.
The reverse order would be worse: a crash after the void would show a result vanishing for no
stated reason.

**Locked interaction (D-17).** `canApply` refuses `matchRecorded`, `cutTaken`,
`tiebreakOrdered` and `resultsVoided` with `tournamentLocked` while
`selectTournamentLocked(state)` holds. The UI renders every result control inert with the
stated reason rather than hidden (`05-UI-SPEC.md` §10) — constraint upstream of the click, the
`selectCardOffer` / `selectRoundEligibleIds` move.

---

## The Recap Needs The Log

**This is the single structural finding a planner is most likely to miss.**

Every existing selector takes `DraftState`. `DraftState` holds only the *latest* result per
match, because that is what D-09's fold arm does. D-22 requires the recap to show
"a result was recorded and then corrected, and what got voided downstream" — which is precisely
the information the fold discards.

Therefore the recap cannot be a `DraftState` selector. It takes the document:

```ts
// src/core/recap.ts — NEW module, mirroring undo.ts's doc-taking convention
export function buildRecap(doc: TournamentDoc, state: DraftState): readonly RecapEntry[];
```

`undo.ts` already establishes doc-taking pure functions in the core (`lastPickAction(doc)`,
`undoRemoval(doc)`, `undoCrossesRoundBoundary(doc, …)`), so this is a precedent, not an
exception. `state` is passed alongside because D-21 requires the ban section to read
`selectPublicBanIds` / `selectAttributedBans`, which are `DraftState` selectors.

Three rules to write into the module header:

1. **D-21 secrecy.** Read `state.bansRevealed` via the two attributed-ban selectors, never
   `state.banSubmissions` and never a `bans/submitted` log entry — even though the recap has the
   whole log in hand and the submissions are plaintext in it (Phase 4 D-06). The case this
   protects is a blind tournament abandoned before the reveal and filed into the library; its
   recap has no `Bans` section, and that is correct.
2. **Corrections are marked, not struck.** A superseded `matchRecorded` stays in chronological
   position carrying `Corrected later`; the later one carries `Corrects an earlier result`
   (`05-UI-SPEC.md` §11 — strike-through in this project means *gone*, and a corrected result is
   not gone).
3. **Never name a variable `document`.** `check-pure-core.mjs:70` forbids the bare token
   anywhere under `src/core` and is deliberately strict about it. Use `doc`, as `undo.ts` does.

Section order follows the log itself (D-19): `Bans` · `Priority cards` · `Round {n}` · `Swaps` ·
`Round robin` · `Bracket`. Because the log is already chronological and `seq` is strictly
increasing, the fold is close to a formatting pass — which is D-19's stated reason for choosing
chronological.

---

## Roster Refresh — REFR-01, REFR-02, REFR-03

### What was probed, today

All figures below are live HTTP responses captured on 2026-08-26.

| Probe | Result |
|-------|--------|
| `GET raw.githubusercontent.com/hyper-mage/Pokemon-champions-drafter/main/public/data/roster.index.json` with `Origin: https://hyper-mage.github.io` | `200`. `Access-Control-Allow-Origin: *`, `Cross-Origin-Resource-Policy: cross-origin`, `Cache-Control: max-age=300`, `Content-Type: text/plain; charset=utf-8`, `Content-Security-Policy: default-src 'none'; sandbox`, `Vary: Authorization,Accept-Encoding` [VERIFIED: curl this session] |
| `GET hyper-mage.github.io/Pokemon-champions-drafter/data/roster.index.json` | `200`. `Access-Control-Allow-Origin: *`, `Cache-Control: max-age=600`, `Content-Type: application/json; charset=utf-8`, `ETag: "6a837bb6-73a"` [VERIFIED: curl] |
| Same URL with `?refresh=1` | `200`, identical `ETag`, identical `Content-Length`. GitHub Pages ignores an unknown query string. [VERIFIED: curl] |
| `GET …/data/roster.mb.json` | `200`, `140,170` bytes, `application/json`, `max-age=600` [VERIFIED: curl] |
| Site is live | Pages root `200` [VERIFIED: curl] |
| Deployed vs committed roster | `checksum` fields **identical** for both `mb` and `ma`. Byte counts differ: 140,170 deployed vs 147,021 on disk. [VERIFIED: curl + `wc -c`] |

**That byte discrepancy is a finding, not noise.** `git config core.autocrlf` is `true`, there is
no `.gitattributes`, and `od -c` shows the local snapshot opens `{ \r \n`. CI checks out on Linux
with LF. The 6,851-byte difference is exactly the line count. **Never compare a fetched snapshot
to the committed one by bytes or by length; compare the `checksum` field, which is computed over
`canonicalJson(entries)` from parsed values and is therefore line-ending independent.**
[VERIFIED: `od -c`, `git config`, checksum comparison this session]

### The real obstacle is the service worker, not CORS

`public/sw.js` intercepts every same-origin `GET` and answers from the precache:

```js
if (request.method !== 'GET') return;
if (new URL(request.url).origin !== self.location.origin) return;
event.respondWith(
  caches.open(CACHE_NAME)
    .then((cache) => cache.match(request, { ignoreSearch: true }))
    .then((hit) => hit || fetch(request)),
);
```

Three facts combine into a dead end:

1. `scripts/build-sw-manifest.mjs` excludes only `sw.js`, `.nojekyll` and `*.map`, so
   **everything under `public/data/` is precached.** [VERIFIED: `EXCLUDED` set read this session]
2. `ignoreSearch: true` means a cache-busting query string still matches the precached entry.
   [VERIFIED: `public/sw.js` read, and `tests/build/sw-behaviour.test.ts`'s `FakeCache.match`
   reproduces the strip]
3. `cache: 'reload'` bypasses the HTTP cache but **does not bypass the service worker** — the
   worker still intercepts. `Request.cache` is readable inside the fetch handler and is Baseline
   widely available since January 2018. [CITED: developer.mozilla.org/en-US/docs/Web/API/Request/cache]

So a same-origin refresh, written naively, is answered from a cache that by construction holds
the roster the app already has. It would report "already current" forever.

### The Two Transports, Weighed

| | Same-origin (Pages) | `raw.githubusercontent.com` |
|---|---|---|
| CORS | not applicable | `Access-Control-Allow-Origin: *` verified today |
| Service-worker change needed | **Yes** — one early return, one test case | **No** — the worker already returns early for cross-origin |
| `roster-source.ts:1-13` "no third-party origin at runtime (T-01-25)" | preserved | broken deliberately, doc block rewritten |
| Sprites for a new regulation | on the same origin, fetchable, and precached on the next SW update | **not solvable** — 300+ PNGs are not fetched from `raw` |
| Content type | `application/json` | `text/plain` (harmless to `response.json()`, but no defence in depth) |
| Freshness advantage | none in practice — a commit and a Pages deploy are effectively the same moment for this repo | ~2 minutes at most |
| New failure mode | none | GitHub availability, rate limits, and a failure sentence that must distinguish "GitHub is unreachable" from "you are offline" (`05-UI-SPEC.md` §2 says exactly this) |

**Recommendation: same-origin**, matching `05-UI-SPEC.md` §2. Not because the invariant is
expensive to break — see Correction 1, it is cheaper than the CONTEXT states — but because the
off-origin path cannot bring sprites and therefore cannot deliver a *usable* new regulation.

### The mechanism

```ts
// src/adapters/roster-source.ts
/**
 * REFR-01. The `?refresh` marker is what `public/sw.js` looks for to step aside; the
 * `cache: 'reload'` is what steps past the HTTP cache Pages sets to `max-age=600`.
 * BOTH are required and neither is sufficient — a service worker intercepts a
 * `reload` request like any other, and `ignoreSearch: true` makes the query alone
 * invisible to the cache lookup.
 */
const REFRESH_MARKER = '?refresh=1';
```

```js
// public/sw.js — inside the fetch listener, beside the two existing early returns
//
// REFR-01. An explicit refresh is the one request that must never be answered from
// the precache: the precache holds, by construction, exactly the roster the app is
// already running. Returning without calling respondWith leaves the request entirely
// to the browser. Offline it fails, which is correct — that is what REFR-02's file
// import exists for, and the failure copy names it.
//
// A query marker rather than `request.cache === 'reload'`: a hard reload gives every
// SUBRESOURCE cache mode 'reload', so that test would take the whole page off the
// precache and break an offline hard-reload. No other URL in this build carries a
// query string.
if (new URL(request.url).searchParams.has('refresh')) return;
```

`tests/build/sw-behaviour.test.ts` needs one new case and **no harness change** — `FakeRequest`
is `{ url, method }` and a `?refresh=1` URL is enough to exercise the branch.

### What gets fetched, and what happens next

1. `GET data/roster.index.json?refresh=1` with `{ cache: 'reload', credentials: 'omit' }`.
2. Compare the index's `default` regulation and its `checksum` against the currently resolved
   snapshot's `regulation` / `checksum`. Equal → **already current**, stop. This is one 1.8 KB
   request and it is the common case.
3. Different → `GET data/{regulation.json}?refresh=1`, `parseSnapshotStrict`, and — if a new
   regulation adds species — `GET data/sprite-meta.json?refresh=1`.
4. Adopt into the in-memory snapshot registry as the new default. The config screen re-derives
   against it.

**`parseIndex` must be extended.** It currently reads only `id`, `label` and `json`
(`roster-source.ts:105-127`) and drops `validFrom`, `validUntil`, `checksum` and `counts`, all of
which are present in `public/data/roster.index.json`. REFR-03 needs `validUntil` and step 2 needs
`checksum`, so the parse widens. Keep `SNAPSHOT_FILE_PATTERN` gating on `json` — it is the reason
"a filename from data" can never become "an arbitrary URL".

### Validation — shared by REFR-01 and REFR-02

`parseSnapshot` today deliberately skips per-row validation, with a stated reason: the file is
generated by a tested pure transform and pinned by `tests/core/roster/fixtures.test.ts`
(`roster-source.ts:129-139`). **That reasoning does not extend to REFR-02's host-supplied file.**
Add `parseSnapshotStrict`, used by both refresh paths, checking:

- `entries` is a non-empty array within a bound, and every row has `id`, `name`, `num`, `types`,
  `baseStats` (six numeric keys), `megaCapable`, `megaFormes`;
- every `id` is unique — a duplicate would make `entryById` disagree with `entries.length`;
- `counts.draftable === entries.length` — the cheapest cross-check in the file, and the one that
  catches truncation;
- `regulation`, `validFrom`, `validUntil` are `YYYY-MM-DD`-shaped strings and `checksum` is a
  non-empty string;
- no `__proto__` / `constructor` / `prototype` own properties, reusing `import-guard.ts`'s
  `POISON_KEYS` posture. `JSON.parse` runs without a reviver in both paths.

**Do not recompute the SHA-256.** Three reasons: (1) the checksum is *self-declared* by the file,
so recomputing proves internal consistency, not authenticity — exactly what the structural checks
above already prove more cheaply; (2) it would require shipping `canonicalJson`, which today
exists only in `scripts/build-roster.mjs:64-74`; (3) **`crypto.subtle` is undefined outside a
secure context**, and `src/adapters/id.ts:9-14` already documents the case this project cares
about — "a phone opening the host's laptop over `http://192.168.x.x`". `getRandomValues` has an
insecure-context fallback; `crypto.subtle` has none. A verification step that silently cannot run
on the exact deployment the codebase already worries about is worse than no verification step.
Keep the checksum as an *identity* value, which is what `config.rosterChecksum` and
`pool/built.checksum` already use it for.

### D-24 — a tournament loads its OWN snapshot

`loadRoster()` resolves exactly one regulation today (`roster-source.ts:159`). D-24 needs the app
to hold more than one resolved at once. The change is small and its shape matters:

```ts
export async function loadRoster(regulationId?: string): Promise<RosterBundle>;
export function resolveSnapshot(rosterVersion: string): RosterBundle | null;   // registry read
```

An in-memory `Map<string, RosterBundle>` in the adapter, keyed by regulation id, populated by
`loadRoster` and by `refreshRoster`. `public/data/roster.ma.json` is already committed and
already precached, so the M-A case works offline today.

**The case planning must answer explicitly:** a document names a `rosterVersion` the registry
cannot resolve — a filed M-C night opened on a build that only ships M-A and M-B, or a snapshot
refreshed in one session and evicted before the next. The right answer is **say so and offer
REFR-02's file import as the recovery**, not silently substitute the default. Substituting would
render a completed tournament against a roster that never contained its picks, and `app.tsx`
already has the surface for that class of statement — `rosterDriftNotice` and
`missingFromRoster` (`app.tsx:2330-2338`). Reuse it rather than inventing a second sentence.

### Staleness — REFR-03

Verified against `public/data/roster.index.json` this session: M-A is
`validFrom 2026-04-08 → validUntil 2026-06-17`, M-B is `2026-06-17 → 2026-09-02`. **The intervals
are half-open** — M-A's `validUntil` *is* M-B's `validFrom` — so a snapshot is stale when
`today >= validUntil`, not `>`.

```ts
// src/core/roster/staleness.ts — pure, zero mocks, no clock
/**
 * REFR-03. Both arguments are `YYYY-MM-DD`. Compared as STRINGS, deliberately.
 *
 * `new Date('2026-09-02')` parses as UTC midnight while `new Date()` is local, so a
 * Date comparison is off by a day for every host west of UTC in the evening. A
 * zero-padded ISO date sorts lexicographically exactly as it sorts chronologically,
 * which makes the comparison both correct and something `check:pure` allows here at all
 * — `new Date` is a forbidden token under `src/core` (check-pure-core.mjs:62).
 *
 * The interval is HALF-OPEN: roster.index.json gives M-A validUntil 2026-06-17 and M-B
 * validFrom 2026-06-17, so validUntil is the first day the snapshot is stale.
 */
export function isSnapshotStale(validUntil: string, todayIso: string): boolean {
  return todayIso >= validUntil;
}
```

```ts
// src/adapters/clock.ts — the second export in the file allowed to read the wall clock
/** Today, LOCAL, as `YYYY-MM-DD`. Never `toISOString()` — that is UTC. */
export function todayIso(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
```

Verified: `'2026-08-26' >= '2026-09-02'` is `false`; `'2026-09-02' >= '2026-09-02'` is `true`;
`'2026-09-03' >= '2026-09-02'` is `true`. [VERIFIED: executed this session]

**The banner fires on 2026-09-02 — seven days from today — on the committed snapshot, with
nobody doing anything.** `05-CONTEXT.md` §Phase Boundary says so and it is arithmetic, not a
hypothetical. Plan the acceptance check to hit it.

Zero network: `validUntil` is a field on the already-loaded snapshot; `todayIso()` is a local
clock read. REFR-03 is satisfied by construction.

### Sprites and offline, stated rather than discovered

A refreshed regulation adds species whose PNGs are on the origin but **not in the current
precache** — the worker only gains them when a new deploy changes the content hash and the new
worker activates on a later load. Offline, those rows fall back to the committed placeholder,
because `handleSpriteError` swaps in `_placeholder.png` on any `<img>` error and guards against
looping (`sprite-src.ts:88-102`). That is a stated, acceptable degradation and it should be in
the refresh doc block so nobody debugs it later as a bug.

---

## The Library — PERS-08, D-14 / D-15 / D-16

### Use a separate key. Do not reshape `PersistedRecord`.

`05-UI-SPEC.md` Amendment 3 says "the persistence wrapper holds a library, not a slot" and
explicitly leaves the storage shape to planning. The right shape keeps `PersistedRecord`,
`STORAGE_KEY`, `save`, `load`, `loadIfNewer`, `clearSaved` and the `generation` counter **exactly
as they are**, and adds a sibling module:

```ts
// src/adapters/library.ts — NEW
const LIBRARY_KEY = 'champions-drafter:library';
export const LIBRARY_CAP = 12;              // 05-UI-SPEC §The Library Cap; three defences
export const SUPPORTED_LIBRARY_VERSIONS: readonly number[] = [1];

interface LibraryWrapper { schemaVersion: number; entries: LibraryEntry[]; }
interface LibraryEntry   { filedAt: number; doc: TournamentDoc; }
```

Four things this buys, each of which the alternative costs:

1. **No migration at all.** An older install has no library key → an empty library →
   `05-UI-SPEC.md` §12's "at zero entries the section is not rendered". That is the CONTEXT's
   discretion question "what does an older record look like" answered by making the question not
   arise.
2. **`generation` is untouched**, so `loadIfNewer`'s cross-tab clobber check
   (`persistence.ts:323-350`) keeps working unexamined. That check is the one thing standing
   between a promoted read-only tab and overwriting the owner's picks.
3. **Two independent version surfaces stay independent** — the document's `schemaVersion` (now 5)
   and the library wrapper's own (1). The CONTEXT names this as a discretion item; separate keys
   is what makes them separable.
4. `tab-lock.ts` uses `BroadcastChannel`, not the `storage` event
   [VERIFIED: grepped this session], so a new key produces no cross-tab side effects.

### Rules that are load-bearing

- **Write the library first, then touch the live slot.** They are two `setItem` calls and can
  partially fail. Library-then-live means a failure leaves the live document exactly where it
  was and the host is told; the reverse order loses a night.
- **A bad entry is dropped, not fatal.** Each `entry.doc` goes through the same
  `isValidTournament` + `migrate` pair `load()` uses (`persistence.ts:259-300`). One unreadable
  entry must not take the other eleven with it.
- **A quota failure while filing is not `savingBlocked`.** That signal means "this browser will
  not save your draft" and fires a banner the host must read (`persistence.ts:79-90`). A library
  write that could not fit is a different event with a different next action: name the file, and
  offer the download.
- **The cap check precedes the write.** D-16 tells the host before anything goes; discovering the
  cap by catching `QuotaExceededError` is exactly the failure D-16 rejects.
- **Every filing path keeps offering the download.** D-14's stated eviction reason: Safari
  deletes script-written storage after seven days idle, and that now takes the whole library
  rather than one document.

### Sizing — the cap of 12 is already defended

`05-UI-SPEC.md` §The Library Cap measures a synthetic worst case at 21,572 characters for a
153-action document (~125 characters per log entry), projects ~65 KB at PROJECT.md's 500-action
upper bound, budgets 80 KB, and lands at `12 × 80 KB + 80 KB live = 1.04 MB` against a
conservative 5 MB — 21% used. Do not re-derive it; do write the three defences into the
constant's doc block, because the eviction copy interpolates the number and the landing screen's
height budget is sized against it.

---

## Schema 4 → 5

Three config fields, all authored on the config screen beside `depth`:

```ts
// src/core/model.ts — TournamentConfig additions
matchMetric: 'pokemonLeft' | 'koDifference';   // D-04, TOUR-07
roundRobinFormat: 'bo1' | 'bo3';               // D-08
bracketFormat: 'bo1' | 'bo3';                  // D-08
```

Every one is a string-literal union written into saved documents and read back by later builds,
so each gets a comment-per-member in the style of `BanMode` and `RoundKind` — renaming a member
breaks every tournament already on disk (`actions.ts:118-124` says exactly this).

**The bump lands in these sites, and STATE.md decision 4 says missing one of them is invisible to
import-only tests:**

| Site | Change |
|------|--------|
| `src/core/model.ts:54` | `SCHEMA_VERSION = 5` |
| `src/core/migrate.ts:65` | `SUPPORTED_SCHEMA_VERSIONS = [1, 2, 3, 4, 5]` |
| `src/core/migrate.ts` | `export const V4_CONFIG_DEFAULTS`, and a `migrateV4ToV5` arm; the `migrate` chain gains `version === 5` passthrough and rewires 4/3/2/1 |
| `src/core/model.ts:551` `copyConfig` | three fields copied by name |
| `src/core/import-guard.ts` `buildConfig` | three fields validated against their unions via `isOneOf` |
| `src/adapters/persistence.ts:263` | **no edit** — it asks `SUPPORTED_SCHEMA_VERSIONS` rather than comparing `SCHEMA_VERSION`, deliberately, "so that every bump moves this site by definition rather than by remembering to". Confirm it, do not touch it. |
| `src/store.ts:239`, `:346` | both document creators already write `SCHEMA_VERSION`; confirm both |

**The defaults are lossless and the argument is specific**, exactly as `V3_CONFIG_DEFAULTS`'s
doc block models it: a version 4 document has no `tournament/*` entries at all, because nothing
in this build before Phase 5 could originate one. Any value is therefore true for every document
that exists at version 4. Recommend `matchMetric: 'pokemonLeft'`, `roundRobinFormat: 'bo1'`,
`bracketFormat: 'bo1'`. As with `bansPerPlayer`, note in the doc block whether these coincide
with the config screen's own defaults or deliberately differ — two constants answering two
questions must not be unified.

---

## Feasibility — the one addition

`05-UI-SPEC.md` §1 resolves the CONTEXT's discretion item: depth gets a gate, it is a
`warning`, never `blocking`, and it lives in `feasibility.ts` and nowhere else.

- New `FeasibilityCode` member: `bracketNeedsFourPlayers`, `severity: 'warning'`.
- `FeasibilityInput` gains `depth: TournamentDepth`.
- Message, verbatim from the contract: `A bracket needs at least 4 players to mean much. At {p}
  players the round robin already decides it. Choose Draft only, or add players.`
- **No high-player-count gate.** A 16-player round robin is 120 matches and a long night, and it
  is a legitimate choice. `05-UI-SPEC.md` records this so nobody adds one reflexively.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Undo for match records | A per-surface undo stack, an inverse patch, or a redo | `undo.ts`'s existing single stack — add four guards to `isUndoable` and one pairing arm to `removalIndices` | D-12 and Phase 3 D-20. Two stacks let a host undo a pick made after a match and leave the document in an order the room never played. |
| Cross-tab safety for the tournament surfaces | New ownership machinery | The existing `inert` shell gate in `app.tsx:2150-2160` | Every tournament surface renders inside it, so a read-only tab can reach none of the record, cut, override or reopen controls. `05-UI-SPEC.md` §Interaction states this and it is free. |
| A confirm before a destructive correction | A new dialog pattern stacked on the record form | The primary button's relabel (`Record and void the bracket`) | `05-UI-SPEC.md` §5: a second modal for one gesture is a second pattern. |
| Reordering the tied block | Drag-and-drop, or typed seed numbers | `SchedulePreview`'s up/down buttons, down to the focus rule (`SchedulePreview.tsx:168-188`) | D-13 rejects both alternatives by name; `CLAUDE.md` §What NOT to Use rejects DnD libraries and notes up/down is more reliable on touch. |
| Bracket connectors | Inline SVG or a rendering library | CSS Grid + pseudo-element borders, `align-content: space-around` | `05-UI-SPEC.md` §9. `check:nohtml` forbids the injected-markup route anyway. |
| Making a fetched roster reach a returning visitor | `registration.update()` + `skipWaiting` + `clients.claim` | The `?refresh=1` early return, plus letting the normal SW lifecycle deliver the precache on a later load | `public/sw.js`'s header: both overrides are deliberately absent and `npm run build`'s verify greps for them. |
| A "which tiebreak link applies" rule per surface | Deciding it in `StandingsTable` | `StandingsRow.decidedBy` from `selectStandings` | `05-UI-SPEC.md` §Pure-core boundary: "If a surface here seems to need the UI to decide a rule, the selector is missing." |
| Roster snapshot integrity | A hand-rolled SHA-256, or shipping `canonicalJson` | `parseSnapshotStrict` + `counts.draftable === entries.length` | §Roster Refresh → Validation. `crypto` is a forbidden core token and `crypto.subtle` is undefined outside a secure context. |
| Date comparison for staleness | `Date` arithmetic | `YYYY-MM-DD` string comparison | Timezone off-by-one, and `new Date` is a forbidden token under `src/core`. |
| Virtualizing the results grid or the bracket | Any virtualization package | Plain CSS Grid; `overflow-x: auto` + sticky label column, already shipped in `BoardGrid.css:54` | 28 cells and ≤ 15 cards. `CLAUDE.md` §What NOT to Use. |

**Key insight:** every temptation in this phase is a temptation to add a *second authority* — a
stored bracket beside the log, a per-surface undo beside the stack, a UI-side tiebreak beside the
selector, a second banner beside the first. The codebase's entire defence is that there is one of
each, and the Phase 5 surfaces are numerous enough that the pressure to duplicate is higher here
than in any previous phase.

---

## Common Pitfalls

### Pitfall 1 — A match id built from player ids is ambiguous

**What goes wrong:** `rr:${playerA.id}:${playerB.id}` looks obvious and is unsafe.
`import-guard.buildPlayers` (`import-guard.ts:347-371`) bounds a player id only as a *non-empty
unique string*. An imported document can carry ids containing `:`, at which point players
`a:b`/`c` and `a`/`b:c` both produce `rr:a:b:c` — two different matches with one key. The
resulting corruption is silent and lands in the fold.

**Why it happens:** every other identity in this codebase is a roster id or a UUID, both of which
happen to be colon-free, so the hazard is invisible until an imported file exercises it.

**How to avoid:** index-based ids, `rr:{i}:{j}` and `br:{round}:{slot}`, pinned by
`/^(rr:\d+:\d+|br:\d+:\d+)$/` in `buildLogEntry` — the `SNAPSHOT_FILE_PATTERN` /
`SPRITE_FILE_PATTERN` precedent. The *participants* remain player ids on the payload
(`winnerId`, `loserId`), so `CLAUDE.md`'s identity rule is honoured where it applies. Do **not**
solve it by tightening `buildPlayers`, which would reject documents that are valid today.

**Warning signs:** any string concatenation of two `config.players[].id` values.

### Pitfall 2 — A cache-busting query string does not bust this cache

**What goes wrong:** `fetch(url + '?t=' + Date.now())` is the reflex, and `ignoreSearch: true`
in the service worker's `cache.match` makes it a precache hit anyway. The refresh reports
"already current" forever, on every browser that has visited the site twice, and works perfectly
in `npm run dev` where no worker is registered (`main.tsx` registers PROD-only).

**Why it happens:** the failure is invisible in development and on a first visit, and the
`ignoreSearch` option is three lines away from the code that appears to bust the cache.

**How to avoid:** the `?refresh=1` early return in `public/sw.js` (§Roster Refresh), plus
`cache: 'reload'` for the HTTP cache. Both, not either.

**Warning signs:** a refresh that works in `npm run dev` and never reports an update on the
deployed site.

### Pitfall 3 — Sorting standings with a head-to-head comparator

**What goes wrong:** `rows.sort(compare)` where `compare` falls through to head-to-head is
non-transitive on a cycle (A beats B, B beats C, C beats A). The ECMAScript spec leaves the
result implementation-defined for an inconsistent comparator, so the standings are *arbitrary*
rather than merely wrong — and different in different engines.

**Why it happens:** a comparator is the natural shape for "sort by this, then that, then that",
and it is correct right up to the link that is not a total order.

**How to avoid:** group-then-refine (§Standings). Head-to-head is applied only to a block that
has already narrowed to exactly two, where it is a total order by construction. A block of three
or more goes to D-13's override, which is `PROJECT.md` §Out of Scope's position on automatic
multi-link chains and `05-UI-SPEC.md` §6's decision.

**Warning signs:** a `.sort()` call anywhere in `selectStandings`. Sorting *within* a partition
by a numeric key is fine; a comparator that can reach head-to-head is not.

### Pitfall 4 — A cut that splits an unresolved tie block

**What goes wrong:** the round robin completes, seeds 3, 4 and 5 are still tied with no host
override, and the host cuts to top 4. Seed 4 is one of three players who are not in an order.
Whoever the bracket puts there is arbitrary, and the room will notice.

**Why it happens:** `05-UI-SPEC.md` §8 gates the cut control on *completeness* — "`{k} matches
are still to play. Record them all before you cut.`" — and completeness does not imply
resolution. A complete round robin can be tied.

**How to avoid:** a second inert condition on `Take the cut`, with its own stated reason, when
`selectStandings(state)[n-1]` and `selectStandings(state)[n]` are members of the same
unresolved block. `canApply` refuses it as `cutSplitsTiedBlock`. This is
constraint-upstream-of-the-click, not a caught error, and it is the phase's clearest case for it.
**Not covered by `05-UI-SPEC.md`** — the planner must add the copy.

**Warning signs:** a bracket whose seeds 3 and 4 swap between two folds of the same document.

### Pitfall 5 — A new payload field silently dropped on round trip

**What goes wrong:** the field works in memory and in autosave, and disappears the moment the
host shares the JSON. `import-guard.ts:868-878` records exactly this for `bans/placed`'s `pass`:
"a dropped `pass` survives in memory and in autosave, and turns every ban into a first-pass ban
the moment a host shares the file."

**Why it happens:** `buildLogEntry` rebuilds every known type **field by field**. A field not
named there is not an error; it is an omission with no symptom locally.

**How to avoid:** STATE.md decision 6's four places, and `actions.ts`'s header raises it to six.
For Phase 5 the count is five types × seven sites. Add a round-trip assertion per type, in the
style `tests/core/import-guard.test.ts:624-633` already uses
(`expect(fold(parse(exported(original)).doc)).toEqual(fold(original))`).

**Warning signs:** a test that only exercises `dispatch` → `fold`, never `export` → `parse` →
`fold`.

### Pitfall 6 — An action in neither undo list

**What goes wrong:** `isUndoable` is a deny-list **plus** an allow-list. A type in neither is
silently *stepped past*, and the next entry below is often `draft/started`, which the deny-list
correctly refuses — so `Undo last move` does nothing at all. `undo.ts:157-160` records this as
04-RESEARCH Pitfall 8, arriving in Phase 4 on the one stage that most needed the correction path.

**Why it happens:** the deny-list is where attention goes, and adding to it is not required.

**How to avoid:** add all five guards to `isUndoable`'s allow-list in the same change that adds
the types. The `UndoRemoval.kind` union's `exhaustive: never` in `undoAnnouncement` catches the
*announcement* omission at compile time but cannot catch this one.

**Warning signs:** `Undo last move` enabled but inert after recording a match.

### Pitfall 7 — Comparing a fetched snapshot to the committed one by bytes

**What goes wrong:** the local checkout has CRLF (`core.autocrlf = true`, no `.gitattributes`)
and the deployed file has LF. `roster.mb.json` is 147,021 bytes on disk and 140,170 on the
origin, with **identical** `checksum`. Any length or byte-equality comparison reports a change on
every Windows checkout, forever.

**Why it happens:** the file looks like a static artifact whose bytes should be stable, and on
CI they are.

**How to avoid:** compare `snapshot.checksum` and `snapshot.regulation`. The checksum is computed
over `canonicalJson(entries)` from parsed values (`scripts/build-roster.mjs:235`) and is
line-ending independent. [VERIFIED this session]

**Warning signs:** a refresh that always reports an update on a developer's machine and never on
CI.

### Pitfall 8 — Deriving the recap from the fold

**What goes wrong:** `buildRecap(state)` compiles, renders, and cannot show a correction (D-22),
because the fold keeps only the latest result per match by design (D-09).

**How to avoid:** `buildRecap(doc, state)`. §The Recap Needs The Log.

**Warning signs:** the recap's `Round robin` section has exactly as many lines as there are
matches, no matter how many corrections the log holds.

---

## Scope Fence — say it out loud

`PROJECT.md` §Out of Scope, `05-CONTEXT.md` §Phase Boundary and the ROADMAP's own note
("the real discipline is refusing scope") all agree, and this section exists so a planner can
point at it:

**OUT, unconditionally, in this phase:**

- **Double elimination.** A losers bracket is not a variant of the CSS Grid in
  `05-UI-SPEC.md` §9; it is a second bracket with its own drop-down edges. PROJECT.md's own
  words: "losers-bracket layout is where bracket rendering code goes to die."
- **Swiss pairing.** D-03 removes even the *round-robin* schedule; Swiss would reintroduce
  round-by-round pairing as the core mechanic.
- **Consolation / third-place brackets.** Same class as double elimination.
- **Automatic multi-link tiebreak chains (Buchholz, Sonneborn-Berger, opponents' win
  percentage).** TOUR-12, v2. The chain ends at a host override by decision, not by omission.
- **Per-game logging inside a Bo3.** TOUR-11, v2. `MAX_MATCH_METRIC = 18` is the seam.
- **A free-text house-rules field.** TOUR-10, v2 — and `05-CONTEXT.md` names it explicitly as
  *not* the answer to "what else does tier 3 hold". Tier 3 holds the numeric field and the
  editable history and nothing else (D-01).
- **A regulation selector for a new tournament.** REFR-04, v2.
- **Live upstream roster parsing in the browser.** Tier A only: the app fetches the project's
  own pre-built snapshot and never Showdown or PokeAPI at runtime.
- **Removing a library entry by hand.** `05-UI-SPEC.md` §Deferred — the only removal path is
  D-16's at-cap eviction.
- **A recap text export or clipboard copy.** `05-CONTEXT.md` §Deferred.

**Recommendations that would drag one of these in, and must be flagged if they appear in a plan:**

- Any `MatchResult` field named `bracketSide`, `losersRound`, `dropDown` or similar.
- A `tiebreakOrdered` payload carrying anything other than a flat ordered player list — a
  weight, a score or an opponent set is a Buchholz chain wearing a small name.
- A bracket data structure with more than one root.
- Any per-game array on `matchRecorded`.
- Any fetch in `roster-source.ts` whose host is not this project's own origin.

---

## Code Examples

### The seed order and byes, in full

```ts
// src/core/tournament.ts
// Verified by execution 2026-08-26 at N = 2,3,4,5,6,7,8,9,12,16.

/**
 * The classic single-elimination seed order, built by doubling.
 *
 * `order(1) = [1]`; each doubling maps every `s` to `[s, 2B+1-s]`. Pair adjacent entries
 * and round one is done. The property that matters: seeds 1 and 2 can only meet in the
 * final, 1 and 3 only in the semi, and so on down.
 */
function seedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    const next: number[] = [];
    for (const s of order) { next.push(s, n + 1 - s); }
    order = next;
  }
  return order;
}

/**
 * D-07 needs NO CODE OF ITS OWN, and that is the finding rather than a shortcut.
 *
 * Pad the seed list to the next power of two with phantoms. Seed `s` faces seed
 * `B+1-s`, so a phantom opponent means `B+1-s > N`, i.e. `s <= B-N` — the top `B-N`
 * seeds, which is exactly "byes go to the top seeds, seed 1 first". Any hand-written
 * bye-assignment loop beside this is a second authority on the same fact.
 */
export function selectBracket(state: DraftState): Bracket | null {
  if (state.cut === null) return null;
  const seeds = state.cut.seeds;
  const n = seeds.length;
  let size = 1;
  while (size < n) size *= 2;

  const order = seedOrder(size);
  const firstRound: BracketMatch[] = [];
  for (let i = 0; i < order.length; i += 2) {
    const a = order[i] as number;
    const b = order[i + 1] as number;
    firstRound.push({
      matchId: `br:1:${firstRound.length + 1}`,
      // A seed number past `n` is a phantom: its slot is a bye, not an empty match.
      upperId: a > n ? null : (seeds[a - 1] as string),
      lowerId: b > n ? null : (seeds[b - 1] as string),
    });
  }
  // …later rounds derive their participants from recorded results; a match with an
  // unrecorded feeder renders `Winner of {roundLabel} {n}` and is aria-disabled.
}
```

### The two-way head-to-head link

```ts
/**
 * Applied ONLY to a block that has already narrowed to exactly two — which is where
 * head-to-head is a total order and therefore safe. `05-UI-SPEC` §6 and PROJECT.md
 * §Out of Scope both stop the automatic chain here; a block of three or more is D-13's
 * override, and the row says so.
 *
 * `null` when they have no recorded result. In a complete round robin that is
 * unreachable, and after a D-10 void it is not, so it is answered rather than asserted.
 */
function headToHead(state: DraftState, aId: string, bId: string): string | null {
  const result = state.matchResults.find(
    (r) => (r.winnerId === aId && r.loserId === bId) || (r.winnerId === bId && r.loserId === aId),
  );
  return result === undefined ? null : result.winnerId;
}
```

### The service-worker early return, and its test

```js
// public/sw.js — inside the existing fetch listener
if (request.method !== 'GET') return;
if (new URL(request.url).origin !== self.location.origin) return;
// REFR-01: see §Roster Refresh. The precache holds, by construction, the roster the app
// is already running, so an explicit refresh must never be answered from it.
if (new URL(request.url).searchParams.has('refresh')) return;
```

```ts
// tests/build/sw-behaviour.test.ts — one new case, no harness change
it('leaves an explicit ?refresh request entirely alone', async () => {
  const worker = loadWorker();
  await worker.install();
  const event = worker.fetchEvent({ url: `${BASE}data/roster.index.json?refresh=1`, method: 'GET' });
  // Returning without calling respondWith is the whole behaviour: the browser handles it.
  expect(event.respondedWith).toBe(false);
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Round-robin circle method with a sit-out slot at odd counts | A complete pair set, filled in any order | `05-CONTEXT.md` D-03, 2026-08-25 | The pairing-schedule research the ROADMAP asked for is moot. Do not build it. |
| Bye assignment as an explicit rule | A consequence of padding the seed list to a power of two | derived and executed this session | One fewer function, one fewer place D-07 can be got wrong |
| `Request.cache` as a way to bypass a service worker | It is not one — the worker still intercepts | Baseline since Jan 2018; documented on MDN | The `?refresh=1` marker is required |
| `PersistedRecord` as the single tournament wrapper | A sibling library key, wrapper untouched | recommended here | No migration, `generation` untouched |

**Deprecated / outdated in this repository:**

- `ConfigScreen.tsx:138-139` `DEPTH_NOTE` — "Round robin and brackets arrive with the tournament
  screens." This phase makes it false. `05-UI-SPEC.md` Amendment 2 replaces it with a per-option
  note. Correcting the string is part of the change that breaks it, not a follow-up.
- `confirm-copy.ts` `ABANDON_CONFIRM`'s **body only** — Amendment 1 gains the clause that
  abandoning does not file. Heading, both labels and tone are unchanged.
- `roster-source.ts:105-127` `parseIndex` — drops `validFrom`, `validUntil`, `checksum` and
  `counts`, all present in the file and all needed now.
- `roster-source.ts:159` `loadRoster()` — resolves exactly one regulation; D-24 needs more.

---

## Conflicts With Locked Decisions

Recorded rather than resolved. The planner should carry these to the owner if they matter.

**1. D-10's two-action shape is less atomic than a single action would be.**

D-10 says a correction that changes a downstream participant "ALSO appends an explicit clearing
action naming the matches voided". Taken literally that is two log entries, and this document
recommends exactly that. The alternative — one `tournament/matchRecorded` carrying
`voids: number[]` — would be atomic by construction, would need no `causedBySeq`, would need no
pairing arm in `removalIndices`, and would satisfy every *stated purpose* of D-10 (nothing
resurrects; the recap shows what was voided; undo takes the whole correction in one step).

**Recommendation: follow D-10 literally (two actions).** The atomicity risk is nil in practice —
both dispatches are synchronous in one event handler and autosave is a 300ms trailing debounce,
so no partial correction can reach storage — and D-10's phrase "an explicit clearing action" is
specific enough that reading it as a field would be an override, not an interpretation.
The cost of the literal reading is one extra payload field (`causedBySeq`) and one extra arm in
`removalIndices`, both of which have exact precedent (`order/resolved` + `cards/played`).

**2. `05-CONTEXT.md` §Discretion states that the T-01-25 invariant is "asserted by a test".
It is not.** See Correction 1 below. This does not change the recommendation, but it does change
the *price* attributed to the off-origin option, and the owner made a discretionary framing on
that price.

---

## Corrections to Upstream Documents

**Correction 1 — T-01-25 has no test.** `05-CONTEXT.md` §Claude's Discretion says choosing an
off-origin fetch "costs an invariant that is currently stated in the code **and asserted by a
test**". Searched this session: `T-01-25` appears in exactly three places —
`.planning/phases/01-draft-skeleton-on-a-real-url/01-05-PLAN.md:358` (a threat-register row),
`01-05-SUMMARY.md:379` (its mitigation record), and `src/adapters/roster-source.ts:9` (the doc
block). There is no `tests/adapters/roster-source.test.ts` and no test anywhere references
`loadRoster`, `RosterLoadError` or a third-party origin. What *is* enforced is
`check-pure-core.mjs`'s ban on the `fetch` token under `src/core`, which is a different
invariant. **If off-origin were ever chosen, what changes is a doc block and a threat-register
row — not a test.**

**Correction 2 — the round-robin figure in the ROADMAP brief.** The ROADMAP's research note asks
for "round-robin pairing at 4–8+ players including the odd-count bye (circle method)". D-03,
locked after the ROADMAP was written, removes the round structure entirely. There is no
odd-count bye in the round robin; the only byes in this phase are D-07's bracket byes.

---

## Runtime State Inventory

This phase is neither a rename nor a refactor, but two of the five categories are genuinely
live here and the answers matter, so the table is included rather than omitted.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `localStorage['champions-drafter:tournament']` — one `PersistedRecord` holding one `TournamentDoc` at `schemaVersion` 1–4. Also `champions-drafter:probe` (canary) and the view-preferences key. | **Code edit only, no data migration.** The schema 4 → 5 bump is handled by `migrateV4ToV5`; `persistence.ts:263` already asks `SUPPORTED_SCHEMA_VERSIONS`. The new library key does not exist on any install, so there is nothing to migrate into it. |
| Live service config | GitHub Pages deployment at `https://hyper-mage.github.io/Pokemon-champions-drafter/`, last deployed 2026-08-17 (`Last-Modified` on the served index). Deploy is `.github/workflows/deploy.yml` on push to `main`; no config lives outside git. | **None.** |
| OS-registered state | **None** — verified: this is a static browser app with no scheduler, daemon or service registration. |
| Secrets / env vars | **None** — verified: no `.env`, no secrets in `deploy.yml` beyond the GitHub-issued Pages OIDC token, `permissions: contents: read`. |
| Build artifacts | **A registered service worker in every returning visitor's browser**, holding a precache named `champions-drafter-<content-hash>` that includes every file under `public/data/`. This is the one item with real teeth: it is the reason a same-origin refresh needs a `public/sw.js` change (§Roster Refresh), and the reason a refreshed regulation's sprites are absent offline until a later load. | **Code edit** to `public/sw.js` plus one test case. No manual cache invalidation — `build-sw-manifest.mjs` hashes content, so changing `sw.js` changes the cache name automatically. |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | build, tests, `build:data` | ✓ | `v24.15.0` local, `24` in CI | — |
| npm | `npm run verify` | ✓ | `11.12.1` | — |
| vitest | all tests | ✓ | `^4.1.10` (devDependency) | — |
| happy-dom | UI tests only | ✓ | `^20.11.1` | — |
| Network to `hyper-mage.github.io` | REFR-01 acceptance | ✓ | site live, `200` | REFR-02 file import is the *product* fallback and is in scope |
| Network to `raw.githubusercontent.com` | only if off-origin is chosen | ✓ | `200`, CORS `*` | not recommended |
| `pokemon-showdown@0.11.11` | `npm run build:data` only | ✓ (devDependency) | — | Not needed by this phase — no roster regeneration is required |
| A ~24" 1080p screen and 3 metres of floor | `05-UI-SPEC.md` §DRFT-14 physical check 5 | **human-dependent** | — | **None.** No automated substitute exists. |

**Missing dependencies with no fallback:**

- **The three-metre physical pass (check 5).** Five sub-checks (a–e) in `05-UI-SPEC.md`
  §DRFT-14. It cannot be automated and it gates DRFT-14 for every new surface in this phase.
- **Phase 4's physical pass is still outstanding and is recorded as BLOCKING**
  (`.planning/STATE.md` §Blockers — "04-11 task 3 … All code is built, committed and green").
  Phase 5 adds a fifth check to a list that already has one unrun item. The planner should
  decide whether check 5 is a checkpoint task in this phase or is batched with Phase 4's.

**Missing dependencies with fallback:**

- None. Everything the automated pipeline needs is present.

---

## Security Domain

Included because `security_enforcement` is not set to `false`. Scoped honestly: this is a static,
serverless, accountless, single-origin browser application with no authentication, no session, no
server-side data and no user-to-user data flow.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | **no** | No accounts, no login, no credentials. `CLAUDE.md` §Project: "no install, no server, no accounts." |
| V3 Session Management | **no** | No sessions. Tab ownership is a `BroadcastChannel` advisory lock (`tab-lock.ts`), not a security boundary — its own header says so. |
| V4 Access Control | **no** | Single local user; every surface is inside one `inert` shell gate whose purpose is data integrity across tabs, not authorization. |
| V5 Input Validation | **yes** | `src/core/import-guard.ts` — allow-list rebuild, `POISON_KEYS` refusal, `MAX_*` allocation bounds, `JSON.parse` with no reviver. Phase 5 extends it: 3 config fields, 5 log-entry arms, `MAX_MATCH_METRIC`, and `parseSnapshotStrict` for REFR-01/02. |
| V6 Cryptography | **no** (and §Roster Refresh recommends keeping it that way) | `crypto.getRandomValues` for the seed and UUID fallback (`adapters/id.ts`), nothing else. No hashing is added; no key material exists. |
| V5 (output encoding) | **yes** | `npm run check:nohtml` across all of `src/` — `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `dangerouslySetInnerHTML`. Preact escapes text children. |
| V14 Configuration | **yes** | `deploy.yml` `permissions: contents: read` only; `credentials: 'omit'` on every fetch; explicit worker `scope` so the worker cannot control sibling Pages projects. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation | Phase 5 change |
|---------|--------|---------------------|----------------|
| Malicious imported tournament JSON | Tampering | `isValidTournament` allow-list rebuild + `POISON_KEYS` + size cap (`MAX_IMPORT_BYTES = 5 MB`) | 5 new `buildLogEntry` arms; a `matchId` that fails the pattern must fail the arm, not fold to an unaddressed match |
| Malicious imported **roster** JSON (new in REFR-02) | Tampering | **New** — `parseSnapshotStrict`: per-entry shape, unique ids, `counts.draftable === entries.length`, ISO date shapes, poison-key refusal | The current `parseSnapshot` deliberately skips row validation because its input is a committed generated file. A host-supplied file is not that. |
| Prototype pollution via `JSON.parse` | Tampering / EoP | `POISON_KEYS` own-property refusal; no reviver anywhere | Applies to the roster path too — `parseSnapshotStrict` must reuse the posture |
| Poisoned `localStorage` entry | Tampering | `load()` routes storage through the same guard as an imported file (`persistence.ts:270-300`) | The library must do the same, per entry, and drop a bad entry rather than fail the whole library |
| String from data interpolated into a URL | Tampering / SSRF-analogue | `SNAPSHOT_FILE_PATTERN` (`roster-source.ts:72`), `SPRITE_FILE_PATTERN` (`sprite-src.ts:50`) | Keep both gating the refresh path; the `?refresh=1` marker is a fixed literal, never interpolated |
| Third-party origin contacted at runtime (T-01-25) | Tampering | Same-origin only; `credentials: 'omit'` | **Preserved** by the same-origin recommendation |
| Stale worker serving old bytes indefinitely | DoS-analogue | Content-hashed cache name (`build-sw-manifest.mjs`); `updateViaCache: 'none'` on registration | The `?refresh=1` early return must not weaken the cross-origin or non-GET returns above it |
| A refresh being used to smuggle sprites | Tampering | Sprite filenames stay `^[0-9]+\.png$` and come from `spriteMeta.byRosterId` | A refreshed `sprite-meta.json` goes through `parseSpriteMeta` unchanged |

**No new secret, credential, key, token or network write is introduced by this phase.**

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `Request.cache === 'reload'` for hard-reload *subresources*, which is why a query marker is preferred over reading `request.cache` in the worker | Roster Refresh → mechanism | Low. If wrong, reading `request.cache` would also be viable; the query marker works either way and is strictly more explicit. |
| A2 | The recommended `matchId` grammar `^(rr\|br):\d+:\d+$` is sufficient for every bracket size this app permits | Pitfall 1 | Low. `MAX_PLAYERS = 64` bounds both indices well inside integer range. |
| A3 | A single `setItem` of a 12-entry library is within `localStorage`'s per-write tolerance on every target browser | The Library | Medium. Not measured under quota pressure. The mitigation is already designed in (library-first write ordering, cap check before write, a distinct quota message) rather than assumed away. |
| A4 | `crypto.subtle` is undefined in an insecure context and has no fallback | Roster Refresh → Validation | Low, and the recommendation does not depend on it — the recommendation is to not use `crypto.subtle` at all. |
| A5 | A plain `location.reload()` may or may not activate a waiting service worker on a single-tab client | Don't Hand-Roll | **None for this design** — the recommendation deliberately does not rely on forcing a waiting worker active, because `public/sw.js` forbids both lifecycle overrides. Recorded so nobody builds on it. |
| A6 | The deployed Pages build is byte-current with `main` for `public/data/` | Roster Refresh → probes | Low. Checksums for both `mb` and `ma` were compared and are identical; only line endings differ. |

---

## Open Questions (RESOLVED)

> All four were ruled during planning and are cited as binding in the plans’ `<precedence>` blocks:
> Q1 → 05-10 (fifth `Screen` member, explicit host act, `screenForState` unchanged); Q2 → 05-03, rendered 05-11 (`3 3 3`);
> Q3 → 05-01, 05-05 (config time only); Q4 → 05-01 (nothing else; recorded in the `TournamentDepth` doc block).
> None is open. Each `**Recommendation:**` below is the adopted ruling.

1. **Does the tournament stage get a fifth `Screen` union member, or a branch inside `draft`?**
   - What we know: `05-UI-SPEC.md` §Layout Budget forces `.draft-shell` (full-bleed) and shows
     the 8-player crosstable needs 204px columns that `.app-shell`'s 114px cannot give. The
     `Screen` doc block (`app.tsx:130-153`) argues that the ban stage earned a *fourth member*
     because a mode inside the draft screen would have to shield five selectors individually.
     `CompletedDraft` conversely replaces only the pool pane so the top bar and undo stay
     reachable, and D-18 inherits that posture.
   - What's unclear: whether the transition is automatic (routed by `screenForState` the moment
     `selectIsTournamentComplete` flips) or a host act. Automatic routing would yank the host off
     the per-player export panels the instant the last pick lands, which is wrong.
   - **Recommendation:** a fifth member `{ name: 'tournament' }`, reached by an explicit control
     on `CompletedDraft` and left by an explicit `Back to the draft`, with the top bar rendered
     on both. `screenForState` is *not* changed to route into it — the same reasoning
     `CompletedDraft` already carries. No log action is involved: the round robin exists the
     moment the draft completes, because every pairing is derived.

2. **Where does the still-tied block's `position` number land?**
   - What we know: `05-UI-SPEC.md` §6 gives the Position column as `1`…`n` and gives the tied row
     the note `Tied — order these yourself`.
   - What's unclear: whether three tied players read `3 4 5` (implying an order that does not
     exist) or `3 3 3`.
   - **Recommendation:** share the block's starting position across its members (`3 3 3`). It is
     the only rendering that does not assert an order the tool has refused to compute. Costs one
     copy decision the planner should make explicit.

3. **Is the depth feasibility warning evaluated against the pre-draft player count only?**
   - What we know: `feasibility.ts` runs at config time and is re-run on adopted documents
     (STATE.md decision 5).
   - What's unclear: nothing blocking — the warning is about a not-yet-created tournament, so
     config time is the only moment it can act.
   - **Recommendation:** config time only. Do not add a post-adoption depth notice; `app.tsx`
     already renders three draft notices and a fourth would be noise.

4. **Does anything else belong in tier 3's "match log"?**
   - What we know: D-01 makes the numeric field and the editable history the tier-3 difference;
     `05-CONTEXT.md` names TOUR-10 as explicitly *not* the answer.
   - **Recommendation:** nothing else. The tier's own name is the specification. Record the
     answer in the `TournamentDepth` doc block so the question does not reopen.

---

## Sources

### Primary (HIGH confidence)

- **Repository source, read this session:** `src/core/actions.ts`, `model.ts`, `reduce.ts`,
  `selectors.ts`, `undo.ts`, `migrate.ts`, `import-guard.ts`, `feasibility.ts`,
  `roster/types.ts`; `src/adapters/roster-source.ts`, `persistence.ts`, `clock.ts`, `id.ts`,
  `tab-lock.ts`; `src/store.ts`, `src/app.tsx`, `src/main.tsx`; `src/ui/sprite-src.ts`,
  `tokens.css`, `screens/LandingScreen.tsx`, `screens/CompletedDraft.tsx`,
  `components/SchedulePreview.tsx`; `public/sw.js`; `scripts/build-roster.mjs`,
  `build-sw-manifest.mjs`, `check-pure-core.mjs`; `tests/build/sw-behaviour.test.ts`;
  `vite.config.ts`, `package.json`, `.github/workflows/deploy.yml`;
  `public/data/roster.index.json`, `public/data/roster.mb.json`.
- **Live HTTP probes, 2026-08-26:** `raw.githubusercontent.com` CORS/caching headers with an
  explicit `Origin`; GitHub Pages headers for `data/roster.index.json` (with and without a query
  string) and `data/roster.mb.json`; deployed-vs-committed checksum comparison; CRLF detection
  via `od -c` and `git config core.autocrlf`.
- **Executed derivations, 2026-08-26:** `seedOrder(8)`, `seedOrder(16)`, bracket shape and bye
  placement at N = 2, 3, 4, 5, 6, 7, 8, 9, 12, 16; the `N − 1` real-match invariant; round-robin
  counts at 4–8; ISO-string staleness comparison at the boundary.
- `.planning/phases/05-full-tournament-brackets-standings-archive/05-CONTEXT.md` — D-01…D-26.
- `.planning/phases/05-full-tournament-brackets-standings-archive/05-UI-SPEC.md` — the approved
  UI contract, read in full.
- `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md` §Phase 5 and §Ordering Constraints,
  `.planning/STATE.md` §Decisions locked / §Blockers / §Deferred Items, `./CLAUDE.md`.

### Secondary (MEDIUM confidence)

- [MDN — `Request.cache`](https://developer.mozilla.org/en-US/docs/Web/API/Request/cache) —
  cache-mode values, readability inside a service worker fetch handler, and the explicit
  statement that `cache: 'reload'` does **not** bypass service-worker interception. Baseline
  widely available since January 2018.

### Tertiary (LOW confidence)

- None. Every claim in this document is either a repository read, a live probe, an executed
  derivation, or an explicitly tagged assumption in §Assumptions Log.

---

## Metadata

**Confidence breakdown:**

- **Standard stack: HIGH** — zero packages are added; the entire stack was read out of
  `package.json` and `vite.config.ts` this session.
- **Bracket / standings algorithms: HIGH** — the seed order, bye placement at 5/6/7, the `N − 1`
  invariant and the round-robin counts were executed, not recalled. The tiebreak chain's shape is
  locked by D-02/D-13 and `05-UI-SPEC.md` §6; the non-transitivity argument for group-then-refine
  is a property of the algorithm, not a citation.
- **Log / action / migration shapes: HIGH** — every site named was opened and, where a line
  number is given, confirmed. The seven-site rule comes from `actions.ts`'s own header and
  STATE.md decision 6.
- **Roster refresh transport: HIGH** — CORS, caching, content types, query-string handling and
  the deployed-vs-committed checksum were probed live today. The service-worker obstacle was
  derived from the shipped worker and its shipped test harness.
- **Library storage failure modes: MEDIUM** — the design is reasoned from `persistence.ts` and
  `tab-lock.ts` as shipped and from `05-UI-SPEC.md`'s measured sizing, but no write was performed
  under quota pressure. Logged as A3.
- **Pitfalls: HIGH** — six of the eight are drawn from failures this codebase has already
  recorded in its own comments (`undo.ts`, `import-guard.ts`, `sprite-src.ts`); the other two
  (matchId ambiguity, CRLF byte comparison) were verified against the repository this session.

**Research date:** 2026-08-26
**Valid until:** 2026-09-25 for the repository findings (they are facts about committed code and
change only when it does). **2026-09-02 for the roster figures** — M-B's `validUntil`, and the
date M-C is expected. The staleness banner is designed to fire on that date; re-read
`public/data/roster.index.json` before treating any regulation figure here as current.
