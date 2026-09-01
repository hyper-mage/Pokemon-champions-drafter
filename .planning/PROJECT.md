# Pokémon Champions Drafter

## What This Is

A browser-based drafting tool for running fantasy-style Pokémon draft tournaments among friends, built around the legal roster and rules of Pokémon Champions. A host configures the tournament rules, the tool builds a draft pool, players take turns claiming Pokémon until everyone has a team of six, and each team exports to pokebase.app and Pokémon Showdown. It runs as a static site — open the link and play, no install, no server, no accounts.

It is for the author and their friends running casual draft tournaments, typically 4–8 players, scaling higher when wanted.

## Core Value

A group of friends can run an entire draft tournament — rules, bans, picks, swaps, brackets, results — start to finish inside the tool, without anyone reaching for a spreadsheet or a Discord message to track state.

## Requirements

### Validated

**Validated in Phase 2: Host-Configured Draft Night** — a group can configure a tournament for N
named players, ban directly, build a pool, and draft on one shared screen. Requirement IDs are
traced in `REQUIREMENTS.md`; `02-VERIFICATION.md` scores 11/11 must-haves.

- [x] Host configures a tournament: player count, player names, format label (singles/doubles), and rule set — `DRFT-01`
- [x] Tool auto-sizes the draft pool from player count with enough leftovers for swaps; host can override the size — `DRFT-02`, `DRFT-03`
- [x] Pool displays each Pokémon with sprite, typing, and base stats; host toggles display density (minimal / standard / full) — `DRFT-05`, `DRFT-06`
- [x] Drafted Pokémon leave the pool immediately and cannot be picked again — `DRFT-07`
- [x] Pool supports search by name — `DRFT-08`
- [x] Pool supports filtering by type and Mega-capability, composing with the round's own restriction — `DRFT-09`
- [x] A draft board grid (players × rounds) doubles as pick history — `DRFT-10`
- [x] Each player's roster is visible as it fills, during the draft and not only at completion — `DRFT-11`
- [x] A clear on-the-clock indicator shows whose turn it is — `DRFT-12`
- [x] Destructive actions confirm before committing — `DRFT-13`
- [x] Pool and board are legible from across a room, since everyone is reading one shared screen — `DRFT-14`
- [x] For dual-Mega species (Charizard, Raichu, Meowstic), the host sets X, Y, or Either at config time — `DRFT-15`
- [x] An initial player-order randomizer — `DRFT-16`
- [x] Host chooses the ban mode when creating the tournament — `BAN-01`
- [x] Host mode: host defines the banlist directly, no per-player bans — `BAN-02`
- [x] Banned Pokémon never appear in the pool at all — `BAN-08`
- [x] A config-time feasibility check runs before the draft starts, disabling Start with a stated reason when the rules, player count, bans, and roster cannot all be satisfied — `RULE-07`

> Phase 1's requirements (`ROST-*`, `SHEL-*`, `PERS-*`, `EXPO-01`–`03`) are marked Complete in
> `REQUIREMENTS.md` but were never migrated into this section when that phase closed. They belong
> here; migrating them is outstanding.

### Active

**Draft core**

- [ ] Draft runs six rounds, one pick per player per round, until every player has a team of six — `DRFT-04`, Phase 3
- [ ] Host can undo or edit the last pick at any point

**Pick order — priority cards**

- [ ] Each player holds priority cards numbered `1..R`, where R is the compiled pick-round count — not fixed at 6
- [ ] The full round schedule, including which rounds are Mega rounds, is visible before the first card is played
- [ ] Cards are played open and sequentially in a rotating order; later players see what has already been played
- [ ] When players ≤ rounds, a value already played this round cannot be played again, which eliminates ties entirely
- [ ] When players > rounds, ties resolve by an explicit, visible, deterministic rule — never a silent sort, which would make turn order depend on player-entry order
- [ ] A played card is spent and unavailable for the remaining rounds
- [ ] Tool resolves and displays the resulting pick order for the round

**Bans**

- [x] Blind mode: each player submits bans privately, all revealed together before the pool is built
- [x] Snake mode: players ban in turn order with previous bans visible
- [ ] Host chooses the duplicate-ban policy at config time: both bans apply with one wasted, or a collision grants a re-ban
      — **Partial after Phase 4 (D-19):** both-apply-one-wasted ships; the re-ban arm is present but disabled.
- [x] Blind mode uses a real full-screen pass-the-device interstitial, not an input mask, and the back button cannot resurrect a private screen

**Composition rules via round structure**

- [ ] Composition requirements are satisfied by construction, not by validating picks after the fact
- [ ] A requirement of N Mega Evolutions produces N Mega-only rounds where the pool is filtered to Mega-capable Pokémon
- [ ] Host can maintain a Mega-ban list: Pokémon that are Mega-capable but not permitted to Mega this tournament, excluded from Mega rounds
- [ ] Compiled rounds type the resulting team slots, so a slot's constraint survives swaps
- [ ] Host can reorder the derived round schedule; a full generic schedule editor is out of scope for v1
- [x] Feasibility is re-checked after the ban reveal, since bans change the arithmetic

**Swaps**

- [ ] Host sets a swap budget per player
- [ ] Swaps can be spent mid-draft as a currency, at any point during the six rounds
- [ ] Host can additionally enable dedicated swap rounds after the pick rounds, where a player drops a team member back to the pool and takes any leftover, or passes
- [ ] Swap rounds have their own explicit pick-order source, since every priority card is spent by then
- [ ] A swap can only take a Pokémon that satisfies the target slot's own filter, so swaps cannot silently violate composition rules

**Tournament management (host-selectable depth)**

- [ ] Host chooses tournament depth: draft only, draft plus brackets, or draft plus brackets plus match log
- [ ] Round robin generation with standings
- [ ] Single elimination bracket generation, including byes for non-power-of-two player counts
- [ ] Best-of-three as a label plus a 2-of-3 counter, not individual game modeling
- [ ] Host records the winner of each match; brackets and standings advance automatically
- [ ] Match records are editable after entry, since the host is a fallible scribe
- [ ] One numeric result field per match (Pokémon remaining or KO differential) to feed the standings tiebreak
- [ ] A short deterministic standings tiebreak chain — record, then differential, then head-to-head — ending in an explicit host override rather than an automatic Buchholz-style computation
- [ ] A seeded top-N cut connecting round robin into the elimination bracket
- [ ] A free-text house-rules field on the tournament page

**Export**

- [ ] Each drafted team exports as a species-only paste — six names, no EVs, natures, or movesets
- [ ] A drafted Mega slot exports as `Species @ StoneItemName`, the one structural exception: Showdown's validator rejects a bare Mega line because a Mega forme's identity is its stone
- [ ] Export is valid for import into pokebase.app (verified: its import path calls `parseShowdownTeamPaste`)
- [ ] Export is valid for import into play.pokemonshowdown.com
- [ ] Entries are separated by blank lines — verified that single-newline separation silently imports only the first Pokémon
- [ ] Export is reachable per player from the completed draft view

**Persistence**

- [ ] Tournament state autosaves to browser storage and survives refresh and browser close
- [ ] The JSON file is the system of record; browser storage is a convenience layer that is expected to fail
- [ ] A storage canary probe runs at config time and warns the host when storage is unavailable or restricted
- [ ] Two tabs of the same tournament cannot silently clobber each other
- [ ] A JSON checkpoint is offered automatically at hard milestones, so a lost draft is always recoverable
- [ ] Host can export the full tournament as a JSON file at any time
- [ ] Host can import a JSON file to restore or move a tournament to another machine
- [ ] Exported tournaments carry a schema version and import cleanly across app versions
- [ ] Completed tournaments remain viewable after the draft ends, including a draft recap rendered from the action log

**Roster data**

- [ ] Pool is restricted to Pokémon legal in the current Champions ranked Regulation Set
- [ ] A committed roster snapshot ships in the repo and works fully offline
- [ ] A repo script regenerates the snapshot from Pokémon Showdown's `champions` mod, pinned to a commit SHA, failing loudly on an unexpected count delta
- [ ] Every snapshot is stamped with regulation, validFrom, validUntil, upstreamCommit, generatedAt, counts, and checksum — never a bare array of names
- [ ] The prior regulation's frozen snapshot is retained, so completed tournaments stay meaningful across a rotation
- [ ] Host can refresh by fetching the project's own pre-built snapshot, or by importing a roster JSON file offline
- [ ] A staleness banner compares the current date against the snapshot's validUntil, with no network needed
- [ ] Roster data records Mega-capability and each Mega forme's stone item name
- [ ] The draftable unit is the base species; Mega-capability is a flag on it, not a separate pool row

### Out of Scope

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
| Hot-seat on one screen, no networking | Preserves the real use case (friends on a call) while removing the entire backend problem | — Pending |
| Serializable single-object tournament state | Keeps a future cross-device sync layer an integration rather than a rewrite | — Pending |
| Composition rules compile to round structure | Invalid teams become unrepresentable; no mid-draft validation or greyed-out picks needed | — Pending |
| Priority cards spent one per round | Creates real strategic tension about when to burn your 1, versus a static or host-assigned order | — Pending |
| Swaps as both mid-draft currency and post-draft rounds | Covers both the snipe-response moment and the deliberate late-draft rebalance | — Pending |
| Species-only export, no set data | pokebase and Showdown already build sets well; keeps this tool a drafter | — Pending |
| Committed roster snapshot plus optional live refresh | Snapshot guarantees offline correctness; refresh means roster churn does not need a code release | — Pending |
| Host-selectable tournament depth | Draft-only nights and full-bracket leagues are both real; forcing bracket setup on a quick draft is friction | — Pending |
| Host picks the ban mode | Blind, snake, and host-banlist all suit different groups; no single right answer | — Pending |
| Champions legality only | Being the Champions drafter is the differentiator; generic format support dilutes it | — Pending |
| Append-only action log plus a pure reducer | A full tournament is only 350–500 actions, so a complete re-fold is sub-millisecond. That single number removes every cost of the pattern — no snapshotting, no upcasting, no CQRS — while buying undo, a free draft recap, correct-by-construction export, and sync-readiness | — Pending |
| Undo designed in from line one | A hot-seat host typing names dictated over voice will misclick, and that is the most likely real failure. Retrofitting undo onto mutable state is the classic rewrite trigger | — Pending |
| Compiled rounds type the team slots | Without typed slots, a swap silently violates composition rules with nothing left to catch it — the compiler deliberately removed the runtime checker | — Pending |
| The JSON file is the system of record | Browser storage evaporates in at least six documented ways, including Safari deleting script-writable storage after 7 days idle | — Pending |
| Config-time feasibility solver | Every deadlock is a pure function of config and roster. Catching it before Start converts a catastrophic mid-draft failure into a cheap pre-draft one | — Pending |
| Draftable unit is the base species | Picking Charizard gets you Charizard; Mega-capability is a flag on the slot. Keeps pool removal logic trivial and matches how drafting actually feels | — Pending |
| NFEs and alternate formes draftable, host can filter | Rotom-Wash and Tauros-Paldea are real competitive picks; a one-click "fully evolved only" toggle covers the other preference | — Pending |
| Host sets X, Y, or Either per dual-Mega species | Consistent with every other rule being a host option, and it removes the ambiguity from both the pool and the export | — Pending |
| Export is species-only except `Species @ Stone` for Mega slots | Showdown's validator rejects a bare Mega line because a Mega forme's identity is its stone. One item line, still not a teambuilder | — Pending |
| Priority cards: open sequential, count derived from rounds | The original spec was internally contradictory and produced ties in 98.5% of rounds at 6 players with no tiebreak rule. Open sequential play also avoids recreating the blind-ban privacy problem once per round | — Pending |
| Roster refresh is Tier A only | Fetching the project's own pre-built snapshot works; live upstream parsing costs 16 MB for 330 KB and needs a second parser that will drift | — Pending |
| Snapshots are regulation-stamped and the script pins a SHA | `mod: 'champions'` silently means "whatever is current," so an unpinned script would swap regulations with no error signal. M-C lands around 2 Sep 2026 | — Pending |
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
*Last updated: 2026-09-01 after Phase 5 (Full Tournament — Brackets, Standings, Archive) completed — 15/15 plans,
5/5 success criteria verified against source, 14/14 requirement IDs closed: TOUR-01..09, PERS-08, PERS-09 and
REFR-01..03. **Phase 5 is the last phase of the milestone, so the project's success criterion — a real draft plus
bracket run end to end with nobody reaching for a spreadsheet — is now met in full.** The human three-metre pass ran
2026-09-01 on a 24-27" 1080p screen and recorded 6 of 6, which also cleared Phase 4's outstanding 04-11 task 3
(legibility and secrecy both), so no unrun physical verification item remains. A code review found 17 issues; the
critical library-eviction data-loss bug (d8597ca) and the undo/canApply gap (01070af) were fixed, and 15 lower-severity
findings are recorded and open in 05-REVIEW.md.
Phase 4 (Blind and Snake Bans) completed 2026-08-26, 11/11 plans. Phase 3 (Compiled Rules, Priority Cards, Swaps)
completed 2026-08-19, 12/12 plans.*
