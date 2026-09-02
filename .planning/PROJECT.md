# Pokémon Champions Drafter

## What This Is

A browser-based drafting tool for running fantasy-style Pokémon draft tournaments among friends, built around the legal roster and rules of Pokémon Champions. A host configures the tournament rules, the tool builds a draft pool, players take turns claiming Pokémon until everyone has a team of six, and each team exports to pokebase.app and Pokémon Showdown. It runs as a static site — open the link and play, no install, no server, no accounts.

It is for the author and their friends running casual draft tournaments, typically 4–8 players, scaling higher when wanted.

## Core Value

A group of friends can run an entire draft tournament — rules, bans, picks, swaps, brackets, results — start to finish inside the tool, without anyone reaching for a spreadsheet or a Discord message to track state.

## Requirements

### Validated

All 94 v1 requirements shipped in **v1.0** except the two called out below. Full text, phase
mapping and per-requirement evidence: [`milestones/v1.0-REQUIREMENTS.md`](milestones/v1.0-REQUIREMENTS.md).

- ✓ **Roster data** `ROST-01…12` — Champions-legal snapshot, regenerated from a pinned
  `pokemon-showdown` npm version with drift tripwires, regulation-stamped, prior regulation
  retained, hostile-species fixture covered — v1.0
- ✓ **App shell & state** `SHEL-01…07` — Pages URL with no install, Actions deploy, offline after
  first load, CI-enforced pure core, one serializable document over an append-only log, undo,
  seeded randomness stored in state — v1.0
- ✓ **Persistence** `PERS-01…09` — autosave through browser close, storage canary, two-tab write
  lock, JSON export/import with schema versioning, milestone checkpoints, completed tournaments
  stay viewable, recap folded from the log — v1.0
- ✓ **Draft core** `DRFT-01…16` — host config, auto-sized and overridable pool, sprite/typing/stats
  at three densities, search and composable filters, board grid, live rosters, on-the-clock
  indicator, confirmations, across-the-room legibility, dual-Mega X/Y/Either, order randomizer — v1.0
- ✓ **Priority cards** `CARD-01…08` — `1..R` hands over a visible schedule, open sequential
  rotating play, no repeat within a round, explicit deterministic tiebreak, spent cards, public
  hands, resolved order shown before picking — v1.0
- ✓ **Composition rules** `RULE-01…09` — rules compile to a round schedule rather than validating
  after the fact, N Mega rounds, Mega-ban list, typed slots that survive swaps, host reorder,
  config-time feasibility gate, post-reveal re-check, Mega-round arithmetic — v1.0
- ✓ **Bans** `BAN-01…06`, `BAN-08` — host banlist, snake, and blind modes; full-screen
  pass-the-device interstitial; back button cannot resurrect a private screen; banned Pokémon never
  reach the pool — v1.0
- ✓ **Swaps** `SWAP-01…07` — per-player budget, mid-draft spend, optional dedicated swap rounds
  with an explicit order source, slot-predicate-filtered targets, pass — v1.0
- ✓ **Tournament** `TOUR-01…09` — three depths, round robin with standings, single elim with byes,
  Bo3 counter, recorded and editable results, one differential field, the record → differential →
  head-to-head → host-override tiebreak chain, seeded top-N cut — v1.0
- ✓ **Export** `EXPO-01…03`, `EXPO-05`, `EXPO-06` — species-only pastes, `Species @ Stone` for Mega
  slots, blank-line record separator, pokebase import, reachable per player — v1.0
- ✓ **Roster refresh** `REFR-01…03` — in-app snapshot fetch, offline roster file import, staleness
  banner against `validUntil` with no network — v1.0

**Shipped incomplete — carried into the next milestone:**

- ⚠️ **`BAN-07`** duplicate-ban policy — **Partial by owner decision D-19.** `bothApply` is built;
  the `Re-ban` arm ships present-but-disabled so a later milestone enables an option rather than
  adding a control plus a schema bump. `duplicateBanPolicy` is written, validated and migrated but
  read by no reducer; documented as deliberate at `model.ts:330-343`.
- ⚠️ **`EXPO-04`** Showdown validator pass — **Pending; the requirement text is the defect.** No
  species-only paste can satisfy *"passes its team validator"* — Showdown reports four inherent
  problems per Pokémon (no ability, no moves, 0 stat points) regardless of implementation
  correctness. The discriminating signal (no `transforms in-battle` error) is verified against the
  real parser in `docs/export-verification.md`. Reword rather than build:
  > *"Export imports into play.pokemonshowdown.com's teambuilder as the correct species and items,
  > and a Mega slot produces no `transforms in-battle` validation error."*

### Active

**Not yet defined.** v1.0 shipped every requirement that was in scope for it. Run
`/gsd-new-milestone` to define v1.1 — questioning → research → requirements → roadmap.

Inputs that milestone starts from:

- The two carried-forward items above (`BAN-07` re-ban arm, `EXPO-04` reword).
- The v2 requirements already parked in the archive under `## v2 Requirements`.
- The card-mechanic beta playtest, deferred by host decision — the only outstanding human
  verification in the project (see `STATE.md` → Deferred Items).
- Tech debt carried forward, itemised in `MILESTONES.md`.
### Out of Scope

*Audited at v1.0 close: every exclusion below still holds and none was invalidated by shipping. Two are now load-bearing rather than merely declined — points/cost valuation conflicts directly with the round-structure-as-constraint design that turned out to be the project’s strongest idea, and live upstream roster parsing was cut outright in favour of the pinned build-time snapshot that made two-regulation support work.*

- **Real-time multiplayer across devices** — Requires a hosted backend, which breaks the zero-service constraint. Hot-seat covers the actual use case (friends on a call or in a room). Data model is kept sync-ready so this stays possible later.
- **Where battles are played** — Games happen in Pokémon Champions or on Showdown; the tool neither knows nor cares. Only results matter.
- **Replay parsing** — Auto-extracting winners or per-Pokémon performance from Showdown replay URLs. Large scope for marginal benefit when the host can click a winner in one second.
- **In-tool teambuilder** — Movesets, EVs, items, and natures. Export hands species to pokebase and Showdown, which already do this well. This is a drafter, not a second teambuilder.
- **Accounts, logins, and user profiles** — No backend, no identity. Players are names typed by the host.
- **Non-Champions formats** — VGC, Smogon OU, National Dex presets. Champions legality is the point of the tool.
- **Native or downloadable builds** — Static web only.
- **Points, cost, or tier valuation systems** — Every real draft league has one, so its absence will look like an oversight. It is a bottomless maintenance sinkhole and it conflicts directly with the round-structure-as-constraint design, which is the project's strongest idea.
- **Auction or nomination draft mode** — Needs bid clocks and nomination queues. Miserable through one mouse and a voice call.
- **Hard pick timers with auto-skip** — Actively hostile in a hot-seat voice-call context where the social clock already works.
- **Autodraft, pick recommendations, type-demand analysis** — Negative value with humans present and talking.
- **Double elimination, Swiss, consolation brackets** — Losers-bracket layout is where bracket rendering code goes to die. Round robin plus a seeded top-N single elim covers this audience.
- **Player-to-player trades** — A proposal and accept state machine for a rare event. Undo plus swaps already cover the real need.
- **Live upstream roster parsing in the browser** — 16 MB of payload for 330 KB of data, and a second parser guaranteed to drift from the build-time one. Cut outright, not deferred.
- **Automatic multi-link tiebreak chains** — Buchholz and friends. Ship one differential field plus a host override.
- **A full generic round-schedule editor** — Doubles the feasibility solver's surface area. Ship the derived schedule plus reordering.

## Context

**Current state — v1.0 shipped 2026-09-02.** The tool does the whole job end to end: a host
configures a tournament, runs one of three ban rituals, drafts over a compiled round schedule with
priority cards and swaps, cuts to a seeded bracket, records and corrects results, and exports every
team. 5 phases, 62 plans, 118 tasks, 584 commits across 30 days.

Codebase: 40,662 LOC under `src/`, 52,942 LOC under `tests/`. Runtime dependencies remain exactly
two — `preact@10.29.8` and `@preact/signals@2.10.1`, both exact-pinned. 81 test files, 2759 tests,
0 failures; `tests/core/**` runs with zero mocks. Document schema is at v5 with a complete v1→v5
migration chain. Service worker precaches 322 URLs / 1090 kB behind a content-derived cache
version. Two roster regulations ship: M-A (213 entries) and M-B (235, default).

The three architectural bets all paid: the append-only log made undo, the recap and export fall
out rather than be built; compiling composition rules into typed round slots let the runtime
validator be deleted outright; and the pure-core boundary held under CI rather than under review.
Nothing in the milestone forced a retreat from any of them.

Not yet validated by use: the tool has been verified but never run with the actual 4–8 friend
group. The card mechanics in particular (D-18 rotation advantage, D-23 low-plays-first) are built
and tested but their *feel* is unmeasured — that beta playtest is the single outstanding human
verification and the highest-value next signal.

**Delivery model.** The reference point the author gave is `https://xetoxyc.github.io/gothic-remake-lockpicker/` — a GitHub Pages site that opens instantly and just works. Same bar here: clone the repo or open the link, no npm install, no dev server, no executable. The "game jam demo" framing is deliberate; ease of access outranks polish of tooling.

**Why hot-seat.** Drafts happen with friends on a voice call or in the same room. One person drives the screen and enters picks as they are called out. This removes the entire networking problem without removing the experience. The scaling note stands: model tournament state as a single serializable object so that adding a sync layer later is an integration, not a rewrite.

**Blind bans on one screen.** Blind ban mode needs a pass-the-device or hide-input flow, since everyone can see the host's screen. This is a real UX problem specific to hot-seat and needs a deliberate solution, not a checkbox.

**Round structure as constraint solver.** The insight that shapes the draft engine: composition rules are not validated after picks, they determine the rounds. "Two Megas required" is not a rule to check — it is two rounds where the pool is filtered to Mega-capable Pokémon. Invalid teams become unrepresentable. Everything host-configurable about composition should compile down to a round schedule before the draft starts.

**Pokémon Champions roster volatility — resolved and quantified.** Research settled the open sourcing question: Pokémon Showdown ships a first-class `champions` mod, and it cross-checks exactly against PokeAPI's `champions` Pokédex. Canonical figures are 234 draftable non-Mega entries, 73 base species with at least one legal Mega, and 76 total Mega formes (Charizard, Raichu, and Meowstic each have two). Mega-capability is a join against the data, not manual curation.

The volatility is real and near-term: regulations rotate roughly every 10 weeks (M-A ran 8 Apr–17 Jun 2026, M-B runs 17 Jun–2 Sep 2026, M-C is due around 2 Sep 2026). Critically, `mod: 'champions'` always means "whatever is current," so a script hardcoding it will silently snapshot a different regulation with no error signal. Regulation labeling is therefore not deferrable polish — it belongs in the first phase.

**Export targets — verified.** Both destinations accept Showdown paste format, so one adapter serves both; pokebase.app's own shipped code calls a server action named `parseShowdownTeamPaste`. Two verified traps: entries must be separated by blank lines (single newlines silently import as one Pokémon), and Mega formes carry a `requiredItem` that Showdown's validator enforces, which is why the export rule carries a Mega exception.

**Data traps that will bite.** Verified against live Showdown source: filtering IDs by `includes('mega')` returns Meganium. Floette is not Mega-capable but Floette-Eternal is. `Meowstic-M-Mega` has `battleOnly: "Meowstic"` with no `-M`, so string surgery on names breaks. Cosmetic formes (19 Vivillon patterns, 8 Alcremie creams) and battle-only formes (Castform-Sunny, Aegislash-Blade) must be stripped. Eleven entries are marked `isNonstandard: "Future"` and a naive `!== 'Past'` filter wrongly admits them. Sprite ids follow two different rules, and Champions-original Megas (Eelektross, Falinks, Dragalge, Barbaracle, Staraptor) have no sprite art at all.

**Feasibility is arithmetic, and the ceilings are low.** Mega-capable species are the scarcest stratum and starve before the pool does: `players × megaRounds ≤ 73 − megaBans`. An 8-player, 2-Mega-round tournament with a generous Mega-ban list can already be infeasible. Absolute ceiling is roughly 34 players (`players × 6 ≤ 207`). Every deadlock is a pure function of config and roster, so it belongs in a pre-draft feasibility check, not a mid-draft discovery.

**Priority cards were redesigned.** The original spec was internally contradictory: cards fixed at 1–6 against a host-tunable round count, ties effectively guaranteed (72% at 4 players, 98.5% at 6, 100% at 7+) with no tiebreak rule, a final round offering no real decision, and swap rounds specified to run "in pick order" after every card is spent. The replacement is El Grande-style open sequential face-up play, described in Key Decisions.

**Undo is architectural.** Every researcher who touched it concluded independently that undo must be designed into the state model from the first line, not retrofitted. A hot-seat host typing names dictated over voice will misclick, and that is the single most likely real-world failure. It is also why the append-only action log wins: undo is `log.pop()` plus a re-fold, and a full tournament is only 350–500 actions.

**Browser storage is a convenience layer, not the system of record.** It evaporates in at least six ways: private mode, Safari's 7-day eviction of script-writable storage, storage pressure, two tabs last-writer-wins, and a crash mid-write. The JSON file is the actual durability guarantee.

## Constraints

- **Tech stack**: Vite + TypeScript + Preact + `@preact/signals`, two runtime dependencies total — Zero-friction access for the visitor is the delivery premise; a build step in the repo is fine, and the author's own reference project is itself a Vite + TS build
- **Hosting**: GitHub Pages via a GitHub Actions workflow — Matches the reference example; free, permanent, one link
- **Pure core**: Draft, rules, and tournament logic must not touch the DOM, clock, randomness, network, or storage — This is what keeps a future sync layer an integration rather than a rewrite
- **Offline**: Must work with no network after first load — Drafts happen wherever friends are; the committed roster snapshot exists for this
- **Persistence**: Browser storage plus JSON file import/export only — No server means no server-side saves
- **Data source**: Pokémon Champions legal roster, sourced upstream and committed — Legality is the product, not a filter
- **Scale**: 4–8 players by default, must not break at higher counts — Warn when pool math or rules become unsatisfiable rather than hard-capping

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Hot-seat on one screen, no networking | Preserves the real use case (friends on a call) while removing the entire backend problem | ✓ Good — v1.0. The single `dispatch` write path held for all 5 phases; the `BroadcastChannel` tab lock is the only ambient coordination in the codebase. Untested against a real group session |
| Serializable single-object tournament state | Keeps a future cross-device sync layer an integration rather than a rewrite | ✓ Good — v1.0. No `Set`, `Map`, `Date` or class instance reaches a persisted structure; proven by the v1→v5 migration chain and a per-action-kind import guard |
| Composition rules compile to round structure | Invalid teams become unrepresentable; no mid-draft validation or greyed-out picks needed | ✓ Good — v1.0. The project's strongest idea, confirmed. Typed slots made invalid teams unrepresentable and the runtime validator was deleted, not merely unused |
| Priority cards spent one per round | Creates real strategic tension about when to burn your 1, versus a static or host-assigned order | — Pending. Built and tested in Phase 3; the mechanic's *feel* is unmeasured until the beta playtest |
| Swaps as both mid-draft currency and post-draft rounds | Covers both the snipe-response moment and the deliberate late-draft rebalance | ✓ Good — v1.0. Both paths ship and share one slot-predicate filter, so neither can widen what a slot allows |
| Species-only export, no set data | pokebase and Showdown already build sets well; keeps this tool a drafter | ✓ Good — v1.0. One `toShowdownPaste` serves both targets; the Mega exception is the only set data that exists |
| Committed roster snapshot plus optional live refresh | Snapshot guarantees offline correctness; refresh means roster churn does not need a code release | ✓ Good — v1.0, and exercised: two regulations (M-A 213, M-B 235) ship together and an archived tournament survives the rotation |
| Host-selectable tournament depth | Draft-only nights and full-bracket leagues are both real; forcing bracket setup on a quick draft is friction | ✓ Good — v1.0. Three depths ship; the two controls that mean nothing at draft-only depth render inert-with-a-reason rather than vanishing |
| Host picks the ban mode | Blind, snake, and host-banlist all suit different groups; no single right answer | ✓ Good — v1.0. All three modes ship and share one `selectAllBanIds`, so no mode can leak a ban the pool filter misses |
| Champions legality only | Being the Champions drafter is the differentiator; generic format support dilutes it | ✓ Good — v1.0. No pressure emerged to widen it |
| Append-only action log plus a pure reducer | A full tournament is only 350–500 actions, so a complete re-fold is sub-millisecond. That single number removes every cost of the pattern — no snapshotting, no upcasting, no CQRS — while buying undo, a free draft recap, correct-by-construction export, and sync-readiness | ✓ Good — v1.0. The load-bearing decision. Undo, the recap, and correct-by-construction export all fell out rather than being built; re-fold cost never became visible |
| Undo designed in from line one | A hot-seat host typing names dictated over voice will misclick, and that is the most likely real failure. Retrofitting undo onto mutable state is the classic rewrite trigger | ✓ Good — v1.0. Never retrofitted. `isUndoable` covers every Phase 2–5 action kind and `undoAnnouncement` uses a `const exhaustive: never` default, so a missing arm is a compile error |
| Compiled rounds type the team slots | Without typed slots, a swap silently violates composition rules with nothing left to catch it — the compiler deliberately removed the runtime checker | ✓ Good — v1.0. The slot decides the export stone, never the species — which is exactly the failure the decision was made to prevent |
| The JSON file is the system of record | Browser storage evaporates in at least six documented ways, including Safari deleting script-writable storage after 7 days idle | ⚠️ Revisit — v1.0. Export, import, milestone checkpoints and the storage canary all ship, but `PERS-05`'s cross-machine round trip was only ever run on one machine |
| Config-time feasibility solver | Every deadlock is a pure function of config and roster. Catching it before Start converts a catastrophic mid-draft failure into a cheap pre-draft one | ✓ Good — v1.0. Split as research predicted: `RULE-07` arithmetic with the config screen, `RULE-09` Mega feasibility with the compiler. No config this build accepts can open an empty Mega round |
| Draftable unit is the base species | Picking Charizard gets you Charizard; Mega-capability is a flag on the slot. Keeps pool removal logic trivial and matches how drafting actually feels | ✓ Good — v1.0. Pool removal stayed trivial and `isMegaEligible` became one predicate with four named consumers |
| NFEs and alternate formes draftable, host can filter | Rotom-Wash and Tauros-Paldea are real competitive picks; a one-click "fully evolved only" toggle covers the other preference | ✓ Good — v1.0. Cosmetic, battle-only and `Future` entries excluded; regional forms, Rotom appliances and Tauros-Paldea retained, with a fixture over the hostile set |
| Host sets X, Y, or Either per dual-Mega species | Consistent with every other rule being a host option, and it removes the ambiguity from both the pool and the export | ✓ Good — v1.0. The X/Y pin compares `MegaForme.forme` and never a name, so `Meowstic-M-Mega`'s missing `-M` cannot break it |
| Export is species-only except `Species @ Stone` for Mega slots | Showdown's validator rejects a bare Mega line because a Mega forme's identity is its stone. One item line, still not a teambuilder | ✓ Good — v1.0, and the Phase 1 spike upgraded it from inference to fact: pokebase.app *interprets* the `@ Stone` line rather than merely tolerating it |
| Priority cards: open sequential, count derived from rounds | The original spec was internally contradictory and produced ties in 98.5% of rounds at 6 players with no tiebreak rule. Open sequential play also avoids recreating the blind-ban privacy problem once per round | ✓ Good on the defect it fixed — v1.0. The tie rate and the contradictory card count are gone. Whether open sequential is *fun* is the beta playtest's question |
| Roster refresh is Tier A only | Fetching the project's own pre-built snapshot works; live upstream parsing costs 16 MB for 330 KB and needs a second parser that will drift | ✓ Good — v1.0. One request the service worker declines to answer from cache; no second parser exists to drift |
| Snapshots are regulation-stamped and the script pins a SHA | `mod: 'champions'` silently means "whatever is current," so an unpinned script would swap regulations with no error signal. M-C lands around 2 Sep 2026 | ✓ Good — v1.0, amended in flight. The pin is the npm package version plus its sha512 integrity hash, not a repo SHA, because the build never checks out the git repo (`ROST-03`/`ROST-05` reworded accordingly) |
| Host picks the duplicate-ban policy | Both-apply-one-wasted and collision-grants-reban change the pool sizing arithmetic differently; the group should choose | Phase 4 — Partial (D-19): `bothApply` built; `Re-ban` ships present-but-disabled so a later milestone enables an option rather than adding a control plus a schema bump |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-09-02 after the **v1.0 Full Draft and Tournament** milestone was archived. 5 phases, 62 plans, 118 tasks, 584 commits, 2026-08-03 → 2026-09-02. 92 of 94 v1 requirements Complete; `BAN-07` Partial by owner decision D-19 and `EXPO-04` Pending on a requirement-text defect, both carried forward. All 22 open Key Decisions scored. Milestone record: `MILESTONES.md`. Archives: `milestones/v1.0-ROADMAP.md`, `milestones/v1.0-REQUIREMENTS.md`, `milestones/v1.0-MILESTONE-AUDIT.md`. Next: `/gsd-new-milestone` to define v1.1.*
