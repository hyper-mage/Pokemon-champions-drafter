# Requirements: Pokémon Champions Drafter

**Defined:** 2026-08-03
**Core Value:** A group of friends can run an entire draft tournament — rules, bans, picks, swaps, brackets, results — start to finish inside the tool, without anyone reaching for a spreadsheet or a Discord message to track state.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Roster Data

- [x] **ROST-01**: Pool is restricted to Pokémon legal in the current Champions ranked Regulation Set
- [x] **ROST-02**: A committed roster snapshot ships in the repo and the app works fully offline with it
- [x] **ROST-03**: A repo script regenerates the snapshot from Pokémon Showdown's `champions` mod, pinned to an exact, verifiable upstream version — the `pokemon-showdown` npm package at an exact version plus its tarball integrity hash. (Originally worded "pinned to a commit SHA". The build consumes the npm devDependency and never checks out the git repo, so a repo SHA would be decorative metadata nothing verifies, while the sha512 integrity hash covers the exact bytes the snapshot was generated from. Amended after 01-03 shipped `upstreamRef` rather than a SHA.)
- [x] **ROST-04**: The regeneration script fails loudly when species or Mega counts drift unexpectedly, rather than silently committing a different regulation
- [x] **ROST-05**: Every snapshot carries regulation, validFrom, validUntil, `upstreamRef`, generatedAt, counts, and checksum. (Field originally named `upstreamCommit`; renamed to match what the pin actually is — `npm:pokemon-showdown@0.11.11 (sha512-…)` — since the source is an npm package, not a git commit.)
- [x] **ROST-06**: The prior regulation's frozen snapshot is retained, so completed tournaments stay meaningful after a rotation
- [x] **ROST-07**: Roster records Mega-capability per base species and each Mega forme's stone item name
- [x] **ROST-08**: The draftable unit is the base species; Mega-capability is a flag on it, not a separate pool row
- [x] **ROST-09**: Cosmetic formes, battle-only formes, and `isNonstandard: "Future"` entries are excluded from the draftable set
- [x] **ROST-10**: Genuinely distinct alternate formes — regional forms, Rotom appliances, Tauros-Paldea — remain draftable
- [x] **ROST-11**: Every roster entry resolves to a sprite, with a visible fallback for species that have no art
- [x] **ROST-12**: A fixture test covers the known-hostile species set: Meganium, Floette-Eternal, Meowstic-M-Mega, Castform-Sunny, Kommo-o, Mr. Rime, Farfetch'd, Charizard and Raichu Mega X/Y, Vivillon, Alcremie, Aegislash-Blade

### App Shell & State

- [x] **SHEL-01**: App is reachable at a GitHub Pages URL requiring no install, account, or payment
- [x] **SHEL-02**: Deployment runs from a GitHub Actions workflow on push to the default branch
- [x] **SHEL-03**: App works with no network after first load
- [x] **SHEL-04**: Draft, rules, and tournament logic are pure — no DOM, clock, randomness, network, or storage access — enforced by a CI check
- [x] **SHEL-05**: Tournament state is one serializable JSON document driven by an append-only action log and a pure reducer
- [x] **SHEL-06**: Host can undo the last action at any point during the draft
- [x] **SHEL-07**: Any randomness the tool uses is seeded, with the seed stored in state, so a reloaded tournament reproduces the same outcome

### Persistence

- [x] **PERS-01**: Tournament state autosaves and survives page refresh and browser close
- [x] **PERS-02**: A storage canary probe at config time warns the host when browser storage is unavailable or restricted
- [x] **PERS-03**: Two tabs of the same tournament cannot silently overwrite each other
- [x] **PERS-04**: Host can export the full tournament as a JSON file at any time
- [x] **PERS-05**: Host can import a tournament JSON file to restore it or move it to another machine
- [x] **PERS-06**: A JSON checkpoint is offered automatically at hard milestones, so a lost draft is always recoverable
- [x] **PERS-07**: Exported tournaments carry a schema version and import cleanly across app versions
- [ ] **PERS-08**: Completed tournaments remain viewable after the draft ends
- [ ] **PERS-09**: A draft recap is rendered directly from the action log

### Draft Core

- [ ] **DRFT-01**: Host configures a tournament — player count, player names, format label, tournament depth
- [ ] **DRFT-02**: Tool auto-sizes the draft pool from player count, leaving enough surplus for swaps
- [ ] **DRFT-03**: Host can override the computed pool size
- [ ] **DRFT-04**: Draft runs the compiled number of pick rounds until every player has a team of six
- [ ] **DRFT-05**: Pool displays each Pokémon with sprite, typing, and base stats
- [ ] **DRFT-06**: Host toggles display density between minimal, standard, and full
- [ ] **DRFT-07**: Drafted Pokémon leave the pool immediately and cannot be picked again
- [ ] **DRFT-08**: Player can search the pool by name
- [ ] **DRFT-09**: Player can filter the pool by type and Mega-capability, composing with the round's own restriction
- [ ] **DRFT-10**: A draft board grid of players by rounds shows the full pick history
- [ ] **DRFT-11**: Each player's roster is visible as it fills, during the draft and not only at completion
- [ ] **DRFT-12**: An on-the-clock indicator shows whose turn it is
- [ ] **DRFT-13**: Destructive actions confirm before committing
- [ ] **DRFT-14**: Pool and draft board are legible from across a room
- [ ] **DRFT-15**: Host sets X, Y, or Either for each dual-Mega species at config time
- [ ] **DRFT-16**: Host can randomize initial player order at config time

### Priority Cards

- [ ] **CARD-01**: Each player holds priority cards numbered `1..R`, where R is the compiled pick-round count
- [ ] **CARD-02**: The full round schedule, including which rounds are Mega rounds, is visible before the first card is played
- [ ] **CARD-03**: Cards are played open and sequentially in a rotating order, so later players see what has already been played
- [ ] **CARD-04**: When players are fewer than or equal to rounds, a value already played this round cannot be played again
- [ ] **CARD-05**: When players outnumber rounds, ties resolve by an explicit, visible, deterministic rule — never a silent sort
- [ ] **CARD-06**: A played card is spent and unavailable for the remaining rounds
- [ ] **CARD-07**: Every player's remaining cards are visible to everyone
- [ ] **CARD-08**: The resolved pick order for the round is displayed before picking begins

### Composition Rules

- [ ] **RULE-01**: Host defines composition requirements as a rule set at config time
- [ ] **RULE-02**: Composition requirements compile into a round schedule before the draft starts, rather than validating picks afterward
- [ ] **RULE-03**: A requirement of N Mega Evolutions produces N Mega-only rounds where the pool is filtered to Mega-capable Pokémon
- [ ] **RULE-04**: Host maintains a Mega-ban list of Mega-capable Pokémon not permitted to Mega this tournament
- [ ] **RULE-05**: Compiled rounds type the resulting team slots, so a slot's constraint survives swaps
- [ ] **RULE-06**: Host can reorder the derived round schedule
- [ ] **RULE-07**: A feasibility check runs at config time and disables Start with a stated reason when the rules, player count, bans, and roster cannot all be satisfied
- [ ] **RULE-08**: Feasibility is re-checked after the ban reveal, since bans change the arithmetic
- [ ] **RULE-09**: Mega-round feasibility enforces `players × megaRounds ≤ megaCapableSpecies − megaBans`

### Bans

- [ ] **BAN-01**: Host selects the ban mode at config time — blind, snake, or host banlist
- [ ] **BAN-02**: Host banlist mode lets the host exclude Pokémon directly, with no per-player bans
- [ ] **BAN-03**: Snake mode runs bans in turn order with previous bans visible
- [ ] **BAN-04**: Blind mode collects each player's bans privately and reveals them together
- [ ] **BAN-05**: Blind mode uses a full-screen pass-the-device interstitial, not an input mask
- [ ] **BAN-06**: Returning via the back button cannot resurrect a private ban screen
- [ ] **BAN-07**: Host selects the duplicate-ban policy at config time — both apply with one wasted, or a collision grants a re-ban
- [ ] **BAN-08**: Banned Pokémon never appear in the pool at all

### Swaps

- [ ] **SWAP-01**: Host sets a swap budget per player
- [ ] **SWAP-02**: Player can spend a swap mid-draft to replace a team member with a Pokémon from the pool
- [ ] **SWAP-03**: Host can enable dedicated swap rounds after the pick rounds
- [ ] **SWAP-04**: Swap rounds use an explicit pick-order source, since every priority card is spent by then
- [ ] **SWAP-05**: A swap can only take a Pokémon that satisfies the target slot's own filter
- [ ] **SWAP-06**: The leftover pool view during a swap is filtered by the target slot's predicate
- [ ] **SWAP-07**: Player can pass on a swap round

### Tournament

- [ ] **TOUR-01**: Host chooses tournament depth — draft only, draft plus brackets, or draft plus brackets plus match log
- [ ] **TOUR-02**: Round robin generation with standings
- [ ] **TOUR-03**: Single elimination bracket generation, including byes for non-power-of-two player counts
- [ ] **TOUR-04**: Best-of-three as a label plus a 2-of-3 counter
- [ ] **TOUR-05**: Host records the winner of each match, and brackets and standings advance automatically
- [ ] **TOUR-06**: Match records are editable after entry
- [ ] **TOUR-07**: One numeric result field per match — Pokémon remaining or KO differential — feeds the standings tiebreak
- [ ] **TOUR-08**: Standings tiebreak runs record, then differential, then head-to-head, ending in an explicit host override
- [ ] **TOUR-09**: A seeded top-N cut connects round robin into the elimination bracket

### Export

- [x] **EXPO-01**: Each drafted team exports as a species-only paste — no EVs, natures, or movesets
- [x] **EXPO-02**: A drafted Mega slot exports as `Species @ StoneItemName`
- [x] **EXPO-03**: Entries are separated by blank lines, since single-newline separation silently imports only the first Pokémon
- [ ] **EXPO-04**: Export imports into play.pokemonshowdown.com and passes its team validator, including Mega-containing teams
- [x] **EXPO-05**: Export imports into pokebase.app
- [x] **EXPO-06**: Export is reachable per player from the completed draft view

### Roster Refresh

- [ ] **REFR-01**: Host can fetch the project's own pre-built roster snapshot from within the app
- [ ] **REFR-02**: Host can import a roster JSON file with no network access
- [ ] **REFR-03**: A staleness banner compares the current date against the snapshot's validUntil, needing no network

## v2 Requirements

Deferred to a future release. Tracked but not in the current roadmap.

### Draft

- **CARD-09**: Second-device short-code submission for blind bans, replacing pass-the-device
- **RULE-10**: Warnings when composition predicates overlap and force redundant picks
- **RULE-11**: A full generic round-schedule editor, beyond reordering the derived schedule
- **DRFT-17**: Type-coverage panel showing a team's defensive and offensive gaps

### Tournament

- **TOUR-10**: Free-text house-rules field on the tournament page
- **TOUR-11**: Game-by-game logging within a best-of-three, rather than a 2-of-3 counter
- **TOUR-12**: Automatic multi-link tiebreak chains such as Buchholz

### Roster

- **REFR-04**: Regulation selector letting the host pin a tournament to a specific snapshotted regulation
- **REFR-05**: CI job that regenerates the snapshot on upstream drift and opens a PR

### Sharing

- **SHAR-01**: Shareable draft-summary image
- **SHAR-02**: Pick-announcement flourish and draft-day presentation mode

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Real-time multiplayer across devices | Requires a hosted backend, breaking the zero-service constraint. Hot-seat covers the actual use case; the state model stays sync-ready so this remains possible later |
| Points, cost, or tier valuation systems | Bottomless maintenance sinkhole, and it conflicts directly with the round-structure-as-constraint design that is the project's strongest idea |
| Auction or nomination draft mode | Needs bid clocks and nomination queues; miserable through one mouse and a voice call |
| Hard pick timers with auto-skip | Actively hostile in a hot-seat voice-call context where the social clock already works |
| Autodraft, pick recommendations, type-demand analysis | Negative value with humans present and talking |
| Double elimination, Swiss, consolation brackets | Losers-bracket layout is where bracket rendering code goes to die; round robin plus a seeded top-N single elim covers this audience |
| Player-to-player trades | A proposal-and-accept state machine for a rare event; undo plus swaps already cover the real need |
| In-tool teambuilder (movesets, EVs, items, natures) | Champions uses its own 66-stat-point system, an entirely separate data model. pokebase and Showdown already do this well |
| Live upstream roster parsing in the browser | 16 MB of payload for 330 KB of data, plus a second parser guaranteed to drift from the build-time one. Cut outright, not deferred |
| Replay parsing | Champions battles do not happen on Showdown, so there are no replays to parse |
| Accounts, logins, user profiles | No backend, no identity. Players are names typed by the host |
| Non-Champions formats (VGC, Smogon OU, National Dex) | Champions legality is the differentiator; generic format support dilutes it |
| Native or downloadable builds | Static web only |
| Tracking where battles are played | Games happen in Champions or on Showdown; only results matter |

## Traceability

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ROST-01 | Phase 1 | Complete |
| ROST-02 | Phase 1 | Complete |
| ROST-03 | Phase 1 | Complete |
| ROST-04 | Phase 1 | Complete |
| ROST-05 | Phase 1 | Complete |
| ROST-06 | Phase 1 | Complete |
| ROST-07 | Phase 1 | Complete |
| ROST-08 | Phase 1 | Complete |
| ROST-09 | Phase 1 | Complete |
| ROST-10 | Phase 1 | Complete |
| ROST-11 | Phase 1 | Complete |
| ROST-12 | Phase 1 | Complete |
| SHEL-01 | Phase 1 | Complete |
| SHEL-02 | Phase 1 | Complete |
| SHEL-03 | Phase 1 | Complete |
| SHEL-04 | Phase 1 | Complete |
| SHEL-05 | Phase 1 | Complete |
| SHEL-06 | Phase 1 | Complete |
| SHEL-07 | Phase 1 | Complete |
| PERS-01 | Phase 1 | Complete |
| PERS-02 | Phase 1 | Complete |
| PERS-03 | Phase 1 | Complete |
| PERS-04 | Phase 1 | Complete |
| PERS-05 | Phase 1 | Complete |
| PERS-06 | Phase 1 | Complete |
| PERS-07 | Phase 1 | Complete |
| PERS-08 | Phase 5 | Pending |
| PERS-09 | Phase 5 | Pending |
| DRFT-01 | Phase 2 | Complete |
| DRFT-02 | Phase 2 | Complete |
| DRFT-03 | Phase 2 | Complete |
| DRFT-04 | Phase 3 | Pending |
| DRFT-05 | Phase 2 | Complete |
| DRFT-06 | Phase 2 | Complete |
| DRFT-07 | Phase 2 | Complete |
| DRFT-08 | Phase 2 | Complete |
| DRFT-09 | Phase 2 | Complete |
| DRFT-10 | Phase 2 | Complete |
| DRFT-11 | Phase 2 | Complete |
| DRFT-12 | Phase 2 | Complete |
| DRFT-13 | Phase 2 | Complete |
| DRFT-14 | Phase 2 | Complete |
| DRFT-15 | Phase 2 | Complete |
| DRFT-16 | Phase 2 | Complete |
| CARD-01 | Phase 3 | Pending |
| CARD-02 | Phase 3 | Pending |
| CARD-03 | Phase 3 | Pending |
| CARD-04 | Phase 3 | Pending |
| CARD-05 | Phase 3 | Pending |
| CARD-06 | Phase 3 | Pending |
| CARD-07 | Phase 3 | Pending |
| CARD-08 | Phase 3 | Pending |
| RULE-01 | Phase 3 | Pending |
| RULE-02 | Phase 3 | Pending |
| RULE-03 | Phase 3 | Pending |
| RULE-04 | Phase 3 | Pending |
| RULE-05 | Phase 3 | Pending |
| RULE-06 | Phase 3 | Pending |
| RULE-07 | Phase 2 | Complete |
| RULE-08 | Phase 4 | Pending |
| RULE-09 | Phase 3 | Pending |
| BAN-01 | Phase 2 | Complete |
| BAN-02 | Phase 2 | Complete |
| BAN-03 | Phase 4 | Pending |
| BAN-04 | Phase 4 | Pending |
| BAN-05 | Phase 4 | Pending |
| BAN-06 | Phase 4 | Pending |
| BAN-07 | Phase 4 | Pending |
| BAN-08 | Phase 2 | Complete |
| SWAP-01 | Phase 3 | Pending |
| SWAP-02 | Phase 3 | Pending |
| SWAP-03 | Phase 3 | Pending |
| SWAP-04 | Phase 3 | Pending |
| SWAP-05 | Phase 3 | Pending |
| SWAP-06 | Phase 3 | Pending |
| SWAP-07 | Phase 3 | Pending |
| TOUR-01 | Phase 5 | Pending |
| TOUR-02 | Phase 5 | Pending |
| TOUR-03 | Phase 5 | Pending |
| TOUR-04 | Phase 5 | Pending |
| TOUR-05 | Phase 5 | Pending |
| TOUR-06 | Phase 5 | Pending |
| TOUR-07 | Phase 5 | Pending |
| TOUR-08 | Phase 5 | Pending |
| TOUR-09 | Phase 5 | Pending |
| EXPO-01 | Phase 1 | Complete |
| EXPO-02 | Phase 1 | Complete |
| EXPO-03 | Phase 1 | Complete |
| EXPO-04 | Phase 1 | Pending |
| EXPO-05 | Phase 1 | Complete |
| EXPO-06 | Phase 1 | Complete |
| REFR-01 | Phase 5 | Pending |
| REFR-02 | Phase 5 | Pending |
| REFR-03 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 94 total
- Mapped to phases: 94 ✓
- Unmapped: 0

**Per phase:**

| Phase | Name | Requirements |
|-------|------|--------------|
| 1 | Draft Skeleton on a Real URL | 32 |
| 2 | Host-Configured Draft Night | 19 |
| 3 | Compiled Rules, Priority Cards, Swaps | 23 |
| 4 | Blind and Snake Bans | 6 |
| 5 | Full Tournament — Brackets, Standings, Archive | 14 |

---
*Requirements defined: 2026-08-03*
*Last updated: 2026-08-03 after roadmap creation (traceability populated)*
