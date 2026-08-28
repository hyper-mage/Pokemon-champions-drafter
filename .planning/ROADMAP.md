# Roadmap: Pokémon Champions Drafter

## Overview

The journey runs from "a URL that works" to "a full tournament nobody tracked in a spreadsheet." Phase 1 proves the whole delivery model at once — a deployed GitHub Pages site, a correctly classified Champions roster snapshot, an append-only action log with undo, autosave that survives a browser close, and a paste that actually imports into Showdown and pokebase — using a deliberately thin two-player draft as the vehicle. Phase 2 turns that skeleton into a draft night a real group can run: host config, N players, pool auto-sizing, a host banlist, and a shared screen legible from across a room. Phase 3 installs the project's strongest idea — composition rules compiled into a typed round schedule — and the two mechanics that hang off it, priority cards and swaps. Phase 4 adds the ban rituals that need genuine hidden-information UX on one shared screen. Phase 5 carries the night past the draft into round robin, a seeded cut, a single-elimination bracket, and an archive that stays readable after the roster rotates.

Each phase is a vertical slice: it ends with something a group of friends can actually do together, not a technical layer waiting on the next one.

## Success Criterion Coverage

The project's success criterion: *"You and your friends run a real draft plus bracket end to end in the tool, and nobody reaches for a Google Sheet or Discord message to track anything."*

- **First phase that satisfies a draft-only night: Phase 2.** After Phase 2 a host can configure a real tournament for 4–8 named players, ban directly, build a pool, and run six flat rounds in a randomized rotating order on one shared screen, ending in exportable teams. No spreadsheet required for a plain draft.
- **Phase 3 makes that night the designed one** — composition rules compiled to rounds, priority cards for turn order, swaps against typed slots. This is the draft the spec actually describes.
- **First phase that satisfies a full bracketed tournament: Phase 5.** Round robin, standings with a deterministic tiebreak chain, a seeded top-N cut, a single-elim bracket with byes, and editable match records. This is where the stated success criterion is met in full.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Draft Skeleton on a Real URL** - Deployed, offline-capable two-player draft on the real Champions roster with undo, autosave, and working export (completed 2026-08-06)
- [x] **Phase 2: Host-Configured Draft Night** - A real group drafts on one shared screen: config, N players, pool, host banlist, board, feasibility gate (completed 2026-08-12)
- [x] **Phase 3: Compiled Rules, Priority Cards, Swaps** - Composition requirements compile into a typed round schedule; cards decide turn order, swaps respect slot constraints (completed 2026-08-19)
- [x] **Phase 4: Blind and Snake Bans** - The ban ritual on one shared screen, with a real pass-the-device flow that cannot leak (completed 2026-08-25)
- [ ] **Phase 5: Full Tournament — Brackets, Standings, Archive** - Round robin, seeded cut, single elim, match records, recap, and roster refresh across a regulation rotation

## Phase Details

### Phase 1: Draft Skeleton on a Real URL

**Goal**: A group can open a public URL with no install and no account, run a two-player six-round draft against the real Champions roster, undo a misclick, close the browser and come back to it, and paste both teams straight into Showdown and pokebase
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: ROST-01, ROST-02, ROST-03, ROST-04, ROST-05, ROST-06, ROST-07, ROST-08, ROST-09, ROST-10, ROST-11, ROST-12, SHEL-01, SHEL-02, SHEL-03, SHEL-04, SHEL-05, SHEL-06, SHEL-07, PERS-01, PERS-02, PERS-03, PERS-04, PERS-05, PERS-06, PERS-07, EXPO-01, EXPO-02, EXPO-03, EXPO-04, EXPO-05, EXPO-06
**Success Criteria** (what must be TRUE):

  1. Anyone opens the GitHub Pages URL on a machine with no install, account, or payment, and after first load the draft keeps working with the network off.
  2. Two players alternate picks for six rounds against the committed, regulation-stamped Champions snapshot: Meganium and Feraligatr are offered as Mega-capable while Typhlosion is not — proving Mega-capability is derived from the Champions mod rather than a stale pre-2026 Mega list — cosmetic Vivillon patterns and battle-only formes do not appear, Rotom appliances and Tauros-Paldea do, Charizard carries both Mega options, every entry shows a sprite or a visible fallback, and a picked species leaves the pool immediately.
  3. The host undoes the last pick at any point and the board returns exactly to its prior state.
  4. A refresh, a closed browser, or a second open tab never loses or silently overwrites a draft; the host is warned up front when browser storage is unavailable or restricted, is offered a JSON checkpoint at milestones, and can download the tournament as JSON and re-import it on another machine.
  5. Each finished team copies out as a blank-line-separated species-only paste that imports into both play.pokemonshowdown.com and pokebase.app, with a Mega slot exported as `Species @ StoneItemName` and producing **no `transforms in-battle` error** from Showdown's team validator. (A species-only paste can never fully pass the validator: it reports four problems per Pokémon — no ability, no moves, 0 stat points — which are inherent to the format and are exactly what the teambuilder fills in. Verified against `gen9championsvgc2026regmb`: `Charizard @ Charizardite X` yields 0 `transforms in-battle` errors, the bare `Charizard-Mega-X` forme yields 1. That single line is the signal that discriminates a correct Mega export from a broken one.)

**Plans**: 11 plans

Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Scaffold Vite + TypeScript + Preact with exactly two runtime dependencies, and build the CI purity gate (SHEL-04)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — Live GitHub Pages URL deployed by a workflow that gates on purity and tests (SHEL-01, SHEL-02) — verified live at https://hyper-mage.github.io/Pokemon-champions-drafter/ (HTTP 200; JS, roster JSON, and sprites all served)
- [x] 01-03-PLAN.md — Committed regulation-stamped Champions roster snapshot, fail-loud regeneration script, hostile-species fixture test, and the 207-vs-208 re-diff (ROST-01, 03–10, 12)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-04-PLAN.md — Committed PokeAPI sprite set with measured native dimensions, placeholder, spriteMissing flags, and the PokeAPI LICENCE.txt resolution (ROST-11)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 01-05-PLAN.md — Token system from the UI Design Contract, app shell, and the pool grid rendering the real roster with art (ROST-02, ROST-11)

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 01-06-PLAN.md — Append-only log, pure reducer, selectors, seeded RNG, click-to-pick, turn banner, and the draft board (SHEL-04, SHEL-05, SHEL-07)

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 01-07-PLAN.md — Unlimited undo, localStorage autosave with a pagehide flush, and the blocking storage canary (SHEL-06, PERS-01, PERS-02)
- [x] 01-08-PLAN.md — toShowdownPaste with the blank-line separator and Mega stone form, plus the hand-verified export spike against both targets (EXPO-01…05)

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 01-09-PLAN.md — BroadcastChannel write-ownership lock with heartbeat, stale recovery, and the read-only tab surface (PERS-03)

**Wave 8** *(blocked on Wave 7 completion)*

- [x] 01-10-PLAN.md — JSON download and import with a prototype-pollution-safe guard, the replace-draft confirmation, the completion checkpoint, and per-player export panels (PERS-04…07, EXPO-06)

**Wave 9** *(blocked on Wave 8 completion)*

- [x] 01-11-PLAN.md — Cache-first service worker precaching the whole inventory, plus the offline, `file://`, and phase close-out verification (SHEL-03, ROST-02)

**UI hint**: yes
**Notes**: Research need LOW — the roster pipeline mechanics are already empirically verified; remaining work is execution against the fixture set. Two verification chores belong here and must not be skipped: (a) an export spike hand-verifying both targets with a Mega-containing team, since pokebase.app's acceptance of an `@ item` line specifically was inferred rather than tested; (b) a numeric re-diff resolving the 207-vs-208 base-species discrepancy and re-verifying the canonical 73 Mega-capable count against the fixture set. Also decide and test the module-vs-classic-script question by literally double-clicking `index.html`, and read PokeAPI's `LICENCE.txt` before shipping sprites. SHEL-04 (pure core) is verified by a CI check and SHEL-07 (seeded randomness) by reproducibility after reload rather than by a user-visible behavior — they are enabling constraints for everything downstream. The two hardcoded players are scaffolding, replaced in Phase 2. **Plan count revised from 3 to 11 at planning time**: 32 requirements plus greenfield scaffolding plus six mandated verification chores cannot fit three plans at the 2–3-task, ~50%-context ceiling. The plan chain 01-01 through 01-06 is the walking skeleton proper (see `SKELETON.md`); 01-07 through 01-11 layer the remaining acceptance requirements onto it.

### Phase 2: Host-Configured Draft Night

**Goal**: A host sets up a real tournament for their group — names, format, pool size, banlist — and 4–8 friends draft through it on one shared screen with everything they need visible at once
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: DRFT-01, DRFT-02, DRFT-03, DRFT-05, DRFT-06, DRFT-07, DRFT-08, DRFT-09, DRFT-10, DRFT-11, DRFT-12, DRFT-13, DRFT-14, DRFT-15, DRFT-16, BAN-01, BAN-02, BAN-08, RULE-07
**Success Criteria** (what must be TRUE):

  1. The host enters player names, a format label, and a tournament depth, sets X / Y / Either for each dual-Mega species, randomizes the starting order, and starts a draft; the pool auto-sizes from player count with surplus left for swaps, and the host can override that size.
  2. The host excludes Pokémon via a host banlist and those Pokémon never appear in the pool at all.
  3. Start is disabled with a stated reason whenever player count, pool size, bans, and roster cannot all be satisfied — the group never discovers a dead draft mid-session.
  4. Anyone at the table finds a Pokémon by name or narrows the pool by type and Mega-capability, and reads its sprite, typing, and base stats from across the room at any of the three density settings.
  5. At every moment the shared screen shows whose turn it is, the full players × rounds board as pick history, and each player's team as it fills; every destructive action confirms before committing.

**Plans**: 13 plans

Plans:
**Wave 1**

- [x] 02-01-PLAN.md — feasibility gate, constrained pool draw, shared pool predicates, roster tripwire
- [x] 02-02-PLAN.md — schema version 2, widened config, v1 migration at all three comparison sites
- [x] 02-03-PLAN.md — type pills, base stats, three display densities, the view-preference adapter

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 02-04-PLAN.md — landing screen, config form, feasibility bar, the createTournament seam

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 02-05-PLAN.md — Mega rules and Pool config groups, free numeric fields, the constrained draw

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 02-06-PLAN.md — the shared draft screen: two panes, the N-player board, and every destructive confirm

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 02-07-PLAN.md — the host banlist: typeahead and ban grid over one list, ban mode, and a pool the bans are absent from

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 02-08-PLAN.md — the pool filter bar: name search, the type toolbar and its roving tabindex, and the Mega filter

**Wave 7** *(gap closure, from 02-UAT.md)*

- [x] 02-09-PLAN.md — the pool expand control rendered inert with a reason, reserved chrome height, and the spec and UAT corrections both gaps need

**Wave 8** *(blocked on Wave 7 completion)*

- [x] 02-10-PLAN.md — human verification of the affordance and the pane alignment, which happy-dom cannot compute

**Wave 9** *(gap closure, from 02-VERIFICATION.md CR-01 — new set, plan frontmatter `wave: 1`)*

- [x] 02-11-PLAN.md — one chrome vnode shape and a focus handoff, so a pane change never drops keyboard focus to `<body>` in either direction (CR-01, WR-08, WR-07, IN-02)

**Wave 10** *(blocked on Wave 9 completion — plan frontmatter `wave: 2`)*

- [x] 02-12-PLAN.md — hover excluded on the inert control, a chrome row that wraps, comments corrected to the real mechanism, the whole visible reason string under one assertion, and the deferrals written down (WR-01, WR-02, WR-03, WR-05, WR-06)

**Wave 11** *(blocked on Wave 10 completion — plan frontmatter `wave: 3`)*

- [x] 02-13-PLAN.md — human verification of focus, hover, alignment, copy and wrapping, none of which happy-dom can compute

**UI hint**: yes
**Notes**: This is the first phase that satisfies a draft-only night end to end. Research need MEDIUM-LOW, concentrated in the general feasibility arithmetic: pool-dry, worst-case ban starvation, and the ~34-player absolute ceiling (`players × 6 ≤ 207`). Mega-specific feasibility deliberately does NOT belong here — it needs the compiled schedule from Phase 3 to know how many Mega rounds exist. Pick order in this phase is a plain randomized rotating order; Phase 3 replaces it with priority cards. DRFT-09's "composing with the round's own restriction" is trivially satisfied here (no round restrictions exist yet) and becomes load-bearing in Phase 3. The legibility requirement (DRFT-14) is an acceptance criterion for the whole shared screen, not a polish item.

### Phase 3: Compiled Rules, Priority Cards, Swaps

**Goal**: The draft becomes the one the spec describes — composition requirements compile into a round schedule that types the team slots, players bid priority cards for turn order over that visible schedule, and swaps can only take something the target slot allows
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: DRFT-04, RULE-01, RULE-02, RULE-03, RULE-04, RULE-05, RULE-06, RULE-09, CARD-01, CARD-02, CARD-03, CARD-04, CARD-05, CARD-06, CARD-07, CARD-08, SWAP-01, SWAP-02, SWAP-03, SWAP-04, SWAP-05, SWAP-06, SWAP-07
**Success Criteria** (what must be TRUE):

  1. The host states composition requirements at config time and the tool compiles them into a round schedule before the draft starts — a requirement of N Megas produces N Mega-only rounds whose pool is filtered to Mega-capable species minus the host's Mega-ban list — with no post-pick validation anywhere in the system, and the draft runs the compiled number of rounds until every player has six.
  2. The host reorders the derived schedule, and the full schedule with Mega rounds marked is on screen before any priority card is played.
  3. Start is blocked with the arithmetic shown whenever `players × megaRounds` exceeds Mega-capable species minus Mega bans.
  4. Each player holds cards `1..R` matching the compiled round count, plays them face-up one per round in a rotating order while seeing what has already been played and what everyone has left, and the resolved pick order is displayed before picking begins; when players outnumber rounds, ties break by a visible deterministic rule that never depends on player-entry order.
  5. A player spends a swap mid-draft, or passes or swaps in a dedicated post-draft swap round that has its own stated pick-order source, and the leftover pool they are shown is filtered by the target slot's own predicate — a Mega slot cannot be swapped into a non-Mega Pokémon.

**Plans**: 12 plans

Plans:
**Wave 1**

- [x] 03-01-PLAN.md — schema 3 across every config site, and the Swaps config group (SWAP-01)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 03-02-PLAN.md — compile(), the schedule/compiled action, the schedule selectors, and typed board round headers (RULE-02, CARD-02)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 03-03-PLAN.md — the compiled-schedule preview and its up/down reorder, config-time only (RULE-01, RULE-06)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 03-04-PLAN.md — isMegaEligible, and the 76-cell Mega-forme ban surface (RULE-04)

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 03-05-PLAN.md — the RULE-09 gate re-measured over eligible species, three new feasibility codes, and the draw's eligibility partition (RULE-09)

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 03-06-PLAN.md — the Mega round at the table: a filtered pool, an inert Mega control, and the slot deciding the export stone (RULE-03)

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 03-07-PLAN.md — cards/played and order/resolved, the derived hands and the rotation, and the board-row hand strips (CARD-01, CARD-06, CARD-07)

**Wave 8** *(blocked on Wave 7 completion)*

- [x] 03-08-PLAN.md — selectPhase, the rewritten turn selector and its three callers, and the card-play step on screen (CARD-03, CARD-05, CARD-08, DRFT-04)

**Wave 9** *(blocked on Wave 8 completion)*

- [x] 03-09-PLAN.md — Hall's-condition card legality, the inert card face, and one undo stack for the whole log (CARD-04)

**Wave 10** *(blocked on Wave 9 completion)*

- [x] 03-10-PLAN.md — the mid-draft swap: replace-in-place, a swappable board cell, and a pool already filtered by the target slot (SWAP-02, SWAP-05, SWAP-06, RULE-05)

**Wave 11** *(blocked on Wave 10 completion)*

- [x] 03-11-PLAN.md — dedicated swap rounds, passing, and the two completion states that gate the exports (SWAP-03, SWAP-04, SWAP-07)

**Wave 12** *(blocked on Wave 11 completion)*

- [x] 03-12-PLAN.md — the three-metre legibility pass, the screen-reader pass, and the card-mechanic playtest *(not autonomous — three blocking checkpoints)*

**UI hint**: yes
**Notes**: Research need HIGH on the rules compiler — the compilable-vs-non-compilable rule-class taxonomy is reasoned analysis with no prior art found in any surveyed draft tooling; validate the class boundaries against real host configuration attempts and keep the "pick guard" escape hatch as a named, unbuilt extension point rather than building it speculatively. Research need MEDIUM on the priority-card redesign — an El Grande-style open-sequential mechanic retrofitted mid-spec; the tiebreak rule and the play flow should be playtested with the target 4–8 friend group, not just implemented from the write-up. Ordering inside this phase is not negotiable: the compiler establishes typed slots, and swaps built before typed slots exist can silently violate composition rules with nothing left to catch them, because the compiler deliberately removes runtime validation. **Plan count revised from 3 to 12 at planning time**: 23 requirements over three strictly ordered units, a schema 2 to 3 migration, five new action families and eleven new or reshaped surfaces do not fit three plans at the 2-3-task, ~50%-context ceiling — Phase 2 was roadmapped at 8 and shipped 13 for less. The three units survive as the wave order: 03-01 through 03-06 are the compiler, 03-07 through 03-09 the cards, 03-10 and 03-11 the swaps, and 03-12 is the physical and human acceptance happy-dom cannot give.

### Phase 4: Blind and Snake Bans

**Goal**: Groups run the ban ritual their own way on one shared screen, and nobody sees what they should not have seen
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: BAN-03, BAN-04, BAN-05, BAN-06, BAN-07, RULE-08
**Success Criteria** (what must be TRUE):

  1. In snake mode, players ban in turn order with all previous bans visible on the shared screen.
  2. In blind mode, each player enters their bans behind a real full-screen pass-the-device interstitial — not an input mask — and no other player's ban is visible on screen before the reveal.
  3. Pressing the back button or restoring the tab from cache cannot resurrect a player's private ban screen.
  4. All blind bans reveal together, the host-chosen duplicate policy — both apply with one wasted, or a collision grants a re-ban — is applied and displayed, and feasibility is re-checked against the post-ban pool before the draft is allowed to start.

**Plans**: 11 plans

Plans:
**Wave 1**

- [x] 04-01-PLAN.md — schema 4: `bansPerPlayer`, `duplicateBanPolicy`, and every door a v3 document comes through (BAN-07)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 04-02-PLAN.md — the pessimistic feasibility gate, and the `drawPool` RangeError it closes (RULE-08)
- [x] 04-03-PLAN.md — the ban action family, the fold, the eight guards, and D-11's `draft/started` reorder (BAN-03, BAN-04)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 04-04-PLAN.md — the ban stage selectors: the serpentine, whose turn it is, and what the room may see (BAN-03, BAN-04)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 04-05-PLAN.md — `createBanStage`, the two config controls, and the fourth Screen (BAN-03, BAN-07, RULE-08)

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 04-06-PLAN.md — inert cells and inert typeahead options: the snake pool pane knows what is gone (BAN-03)
- [x] 04-07-PLAN.md — undo across the ban stage, and the exhaustive announcement that cannot speak a private ban (BAN-03, BAN-04)

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 04-08-PLAN.md — the player × pass ban board, whose blind arm cannot hold a species (BAN-03, BAN-04)

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 04-09-PLAN.md — the blind locked state, the narrowed `Bans (N)` disclosure, and `Blind` enabled (BAN-04, BAN-05)

**Wave 8** *(blocked on Wave 7 completion)*

- [x] 04-10-PLAN.md — the full-screen entry surface and the bfcache / visibility shield (BAN-04, BAN-05, BAN-06)

**Wave 9** *(blocked on Wave 8 completion)*

- [x] 04-11-PLAN.md — the reveal, collisions, RULE-08's re-check, D-23's separate pool draw, and the three-metre human pass (BAN-04, BAN-07, RULE-08) — **checkpoint, not autonomous**. Tasks 1 and 2 built, committed and green (`04-11-SUMMARY.md`); **task 3's blocking human pass is outstanding** and `04-HUMAN-UAT.md` is pre-filled and pending.

**UI hint**: yes
**Notes**: Research need MEDIUM and it is a UX problem, not a technical one — the nearest precedents are party apps (Werewolf, Mafia, Spy) and tabletop games, not draft tools; no surveyed Pokémon draft tool attempts bans at all. This needs an actual playtest with the target group. The back-button leak (BAN-06) is a bfcache / `pageshow` guard and is easy to get silently wrong. Host banlist mode already shipped in Phase 2 and already unblocked the compiler's Mega-ban list, which is why this phase can sit this late without holding anything up.

### Phase 5: Full Tournament — Brackets, Standings, Archive

**Goal**: The night runs past the draft — round robin, a seeded cut, a single-elimination bracket, results recorded and correctable — and the finished tournament stays readable and re-runnable after the Champions roster rotates
**Mode:** mvp
**Depends on**: Phase 3 (needs completed teams; independent of Phase 4 and buildable before it if blind bans are not wanted first)
**Requirements**: TOUR-01, TOUR-02, TOUR-03, TOUR-04, TOUR-05, TOUR-06, TOUR-07, TOUR-08, TOUR-09, PERS-08, PERS-09, REFR-01, REFR-02, REFR-03
**Success Criteria** (what must be TRUE):

  1. The host's depth choice is honoured: draft-only skips every bracket screen entirely, while the deeper modes generate a round robin and/or a single-elimination bracket with correct byes at non-power-of-two counts (verified at 5, 6, and 7 players).
  2. The host records a winner and one numeric result per match with a best-of-three shown as a label plus a 2-of-3 counter; standings and brackets advance automatically, and a mis-entered result can be edited afterwards without corrupting the bracket.
  3. Standings break ties by record, then differential, then head-to-head, ending in an explicit host override rather than a silent computation, and a seeded top-N cut carries the round robin into the elimination bracket.
  4. A completed tournament stays viewable after the draft ends, including a draft recap rendered directly from the action log.
  5. The host refreshes the roster to a new regulation from inside the app, or imports a roster JSON with no network at all, and a staleness banner warns when the current snapshot's `validUntil` has passed — also with no network.

**Plans**: 15 plans

Plans:
**Wave 1**

- [x] 05-01-PLAN.md — schema 5: the metric, both stage formats, four fold fields, and the depth gate (TOUR-01, TOUR-07)
- [x] 05-02-PLAN.md — staleness with no network, and the one service-worker line a refresh needs (REFR-03, REFR-01)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 05-03-PLAN.md — the pair set, the stage fold, and standings by partition refinement (TOUR-02, TOUR-08)
- [x] 05-04-PLAN.md — the snapshot registry: refresh, strict parse, and a tournament's own roster (REFR-01, REFR-02, REFR-03)
- [x] 05-05-PLAN.md — config screen: depth, the metric and the two formats (TOUR-01, TOUR-04, TOUR-07)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 05-06-PLAN.md — the bracket, its byes, the locked fold and the void cascade (TOUR-03, TOUR-06, TOUR-09)
- [x] 05-07-PLAN.md — roster refresh and the staleness banner on screen (REFR-01, REFR-02, REFR-03)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 05-08-PLAN.md — five `tournament/*` actions across seven landing sites each (TOUR-05, TOUR-06, TOUR-09)
- [x] 05-09-PLAN.md — the library adapter, its cap of 12, and the phase's confirm copy (PERS-08)

**Wave 5** *(blocked on Wave 4 completion)*

- [ ] 05-10-PLAN.md — the tournament screen and the round-robin results grid (TOUR-02, TOUR-04, TOUR-05, TOUR-06)

**Wave 6** *(blocked on Wave 5 completion)*

- [ ] 05-11-PLAN.md — standings, the tiebreak override, and the cut (TOUR-08, TOUR-09)
- [ ] 05-12-PLAN.md — the library on the landing screen, and filing a night (PERS-08)

**Wave 7** *(blocked on Wave 6 completion)*

- [ ] 05-13-PLAN.md — the bracket, the champion, and reopening a finished tournament (TOUR-03, TOUR-04, TOUR-06)

**Wave 8** *(blocked on Wave 7 completion)*

- [ ] 05-14-PLAN.md — the recap, folded from the log (PERS-09, PERS-08)

**Wave 9** *(blocked on Wave 8 completion)*

- [ ] 05-15-PLAN.md — the three-metre pass and the phase gate *(not autonomous — blocking human check)* (TOUR-02, TOUR-03, TOUR-04, TOUR-08)
**UI hint**: yes
**Notes**: This phase first satisfies the full success criterion (a real draft plus bracket, end to end, nothing tracked elsewhere). Research need LOW on brackets and standings — well-trodden tournament-software territory; the real discipline is refusing scope, since double elimination, Swiss, and consolation brackets are explicitly out of scope and are where bracket rendering code goes to die. Research need MEDIUM on roster refresh — re-confirm `raw.githubusercontent.com` CORS and caching behavior at implementation time, and note this is Tier A only: the app fetches the project's own pre-built snapshot, never live upstream data. Brackets and standings are fully additive — they consume only completed teams — which is why they come last among feature work.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Draft Skeleton on a Real URL | 11/11 | Complete   | 2026-08-06 |
| 2. Host-Configured Draft Night | 13/13 | Complete   | 2026-08-15 |
| 3. Compiled Rules, Priority Cards, Swaps | 12/12 | Complete   | 2026-08-19 |
| 4. Blind and Snake Bans | 11/11 | Complete   | 2026-08-25 |
| 5. Full Tournament — Brackets, Standings, Archive | 9/15 | In Progress|  |

## Requirement Coverage

All 94 v1 requirements are mapped to exactly one phase. No orphans, no duplicates.

| Phase | Requirements | Count |
|-------|--------------|-------|
| 1 | ROST-01…12, SHEL-01…07, PERS-01…07, EXPO-01…06 | 32 |
| 2 | DRFT-01, 02, 03, 05…16, BAN-01, BAN-02, BAN-08, RULE-07 | 19 |
| 3 | DRFT-04, RULE-01…06, RULE-09, CARD-01…08, SWAP-01…07 | 23 |
| 4 | BAN-03…07, RULE-08 | 6 |
| 5 | TOUR-01…09, PERS-08, PERS-09, REFR-01…03 | 14 |
| **Total** | | **94** |

## Ordering Constraints

These came out of research and hold regardless of how aggressively phases are compressed. Violating them causes rework, not just inconvenience.

1. **Roster classification precedes everything that touches the pool** (Phase 1 before all). Forme, Mega, cosmetic, and battle-only classification and the base-species draftable unit must be settled before pool building, bans, the compiler, or export.
2. **Persistence and undo precede the draft engine being real** (Phase 1 before Phase 2). The append-only log and pure reducer exist from the first line of draft code; retrofitting undo onto mutable state is the classic rewrite trigger, flagged independently by every researcher.
3. **The rules compiler precedes swaps** (both in Phase 3, compiler first). The compiler establishes typed team slots and deliberately removes runtime validation — swaps built without typed slots silently violate composition rules with nothing left to catch them. This is the single most important ordering constraint in the project.
4. **Host-banlist mode early, blind/snake later** (Phase 2 vs Phase 4). Host banlist is just a list of IDs and it unlocks the Mega-ban list the compiler needs; blind-ban pass-the-device UX is a separate and harder design problem.
5. **Brackets and standings are fully additive** (Phase 5, last among feature work). They consume only completed teams. A drafter without brackets still ships; brackets without a drafter are worthless.
6. **The feasibility solver splits across two phases.** General pool arithmetic (RULE-07) belongs with the config screen in Phase 2. Mega-specific feasibility (RULE-09) is inseparable from the compiler in Phase 3, because it needs the compiled schedule to know how many Mega rounds exist.
