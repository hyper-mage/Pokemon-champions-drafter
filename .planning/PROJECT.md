# Pokémon Champions Drafter

## What This Is

A browser-based drafting tool for running fantasy-style Pokémon draft tournaments among friends, built around the legal roster and rules of Pokémon Champions. A host configures the tournament rules, the tool builds a draft pool, players take turns claiming Pokémon until everyone has a team of six, and each team exports to pokebase.app and Pokémon Showdown. It runs as a static site — open the link and play, no install, no server, no accounts.

It is for the author and their friends running casual draft tournaments, typically 4–8 players, scaling higher when wanted.

## Core Value

A group of friends can run an entire draft tournament — rules, bans, picks, swaps, brackets, results — start to finish inside the tool, without anyone reaching for a spreadsheet or a Discord message to track state.

## Requirements

### Validated

(None yet — ship to validate)

### Active

**Draft core**

- [ ] Host configures a tournament: player count, player names, format label (singles/doubles), and rule set
- [ ] Tool auto-sizes the draft pool from player count with enough leftovers for swaps; host can override the size
- [ ] Draft runs six rounds, one pick per player per round, until every player has a team of six
- [ ] Pool displays each Pokémon with sprite, typing, and base stats; host toggles display density (minimal / standard / full)
- [ ] Drafted Pokémon leave the pool immediately and cannot be picked again

**Pick order — priority cards**

- [ ] Each player holds priority cards numbered 1 through 6
- [ ] Before each round every player plays one card; lowest number picks first
- [ ] A played card is spent and unavailable for the remaining rounds
- [ ] Tool resolves and displays the resulting pick order for the round

**Bans**

- [ ] Host chooses the ban mode when creating the tournament
- [ ] Blind mode: each player submits bans privately, all revealed together before the pool is built
- [ ] Snake mode: players ban in turn order with previous bans visible
- [ ] Host mode: host defines the banlist directly, no per-player bans
- [ ] Banned Pokémon never appear in the pool at all

**Composition rules via round structure**

- [ ] Composition requirements are satisfied by construction, not by validating picks after the fact
- [ ] A requirement of N Mega Evolutions produces N Mega-only rounds where the pool is filtered to Mega-capable Pokémon
- [ ] Host can maintain a Mega-ban list: Pokémon that are Mega-capable but not permitted to Mega this tournament, excluded from Mega rounds
- [ ] Host can fine-tune round structure manually instead of accepting the derived default

**Swaps**

- [ ] Host sets a swap budget per player
- [ ] Swaps can be spent mid-draft as a currency, at any point during the six rounds
- [ ] Host can additionally enable dedicated swap rounds after round six, run in pick order, where a player drops a team member back to the pool and takes any leftover, or passes

**Tournament management (host-selectable depth)**

- [ ] Host chooses tournament depth: draft only, draft plus brackets, or draft plus brackets plus match log
- [ ] Round robin generation with standings
- [ ] Single elimination bracket generation, including byes for non-power-of-two player counts
- [ ] Best-of-three match configuration
- [ ] Host records the winner of each match; brackets and standings advance automatically

**Export**

- [ ] Each drafted team exports as a species-only paste — six names, no set data
- [ ] Export is valid for import into pokebase.app
- [ ] Export is valid for import into play.pokemonshowdown.com
- [ ] Export is reachable per player from the completed draft view

**Persistence**

- [ ] Tournament state autosaves to browser storage and survives refresh and browser close
- [ ] Host can export the full tournament as a JSON file
- [ ] Host can import a JSON file to restore or move a tournament to another machine
- [ ] Completed tournaments remain viewable after the draft ends

**Roster data**

- [ ] Pool is restricted to Pokémon legal in Pokémon Champions
- [ ] A committed roster snapshot ships in the repo and works fully offline
- [ ] A repo script regenerates the snapshot from an upstream source (Pokémon Showdown data or equivalent)
- [ ] Host can trigger an optional in-app refresh to pull the latest roster without waiting for a repo update
- [ ] Roster data records which Pokémon are Mega-capable, since Mega rounds depend on it

### Out of Scope

- **Real-time multiplayer across devices** — Requires a hosted backend, which breaks the zero-service constraint. Hot-seat covers the actual use case (friends on a call or in a room). Data model is kept sync-ready so this stays possible later.
- **Where battles are played** — Games happen in Pokémon Champions or on Showdown; the tool neither knows nor cares. Only results matter.
- **Replay parsing** — Auto-extracting winners or per-Pokémon performance from Showdown replay URLs. Large scope for marginal benefit when the host can click a winner in one second.
- **In-tool teambuilder** — Movesets, EVs, items, and natures. Export hands species to pokebase and Showdown, which already do this well. This is a drafter, not a second teambuilder.
- **Accounts, logins, and user profiles** — No backend, no identity. Players are names typed by the host.
- **Non-Champions formats** — VGC, Smogon OU, National Dex presets. Champions legality is the point of the tool.
- **Native or downloadable builds** — Static web only.

## Context

**Delivery model.** The reference point the author gave is `https://xetoxyc.github.io/gothic-remake-lockpicker/` — a GitHub Pages site that opens instantly and just works. Same bar here: clone the repo or open the link, no npm install, no dev server, no executable. The "game jam demo" framing is deliberate; ease of access outranks polish of tooling.

**Why hot-seat.** Drafts happen with friends on a voice call or in the same room. One person drives the screen and enters picks as they are called out. This removes the entire networking problem without removing the experience. The scaling note stands: model tournament state as a single serializable object so that adding a sync layer later is an integration, not a rewrite.

**Blind bans on one screen.** Blind ban mode needs a pass-the-device or hide-input flow, since everyone can see the host's screen. This is a real UX problem specific to hot-seat and needs a deliberate solution, not a checkbox.

**Round structure as constraint solver.** The insight that shapes the draft engine: composition rules are not validated after picks, they determine the rounds. "Two Megas required" is not a rule to check — it is two rounds where the pool is filtered to Mega-capable Pokémon. Invalid teams become unrepresentable. Everything host-configurable about composition should compile down to a round schedule before the draft starts.

**Pokémon Champions roster volatility.** Champions is a current title and its legal roster will move. The snapshot-plus-refresh approach exists because of this: the committed snapshot guarantees the tool always works, and the refresh path means a roster change does not require a code release. Sourcing the Champions-legal list and its Mega-capability flags is an open research question.

**Export targets.** Two destinations, both taking pasted text: pokebase.app and play.pokemonshowdown.com. Showdown's paste format is well known. pokebase.app's import format needs verification — it may accept the same format or may differ.

## Constraints

- **Tech stack**: Static site, no backend, no database, no build step required of the user — Zero-friction access is the whole delivery premise
- **Hosting**: GitHub Pages, served from the repo — Matches the reference example; free, permanent, one link
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
*Last updated: 2026-08-03 after initialization*
