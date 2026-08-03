# Project Research Summary

**Project:** Pokémon Champions Drafter
**Domain:** Zero-backend, offline-capable static web app — turn-based draft/tournament state, hot-seat multiplayer on one shared screen
**Researched:** 2026-08-03
**Confidence:** HIGH, with specific MEDIUM pockets (rules-compiler taxonomy, hot-seat blind-ban/priority-card UX, a handful of unresolved roster counts and an unverified export edge case) — see Confidence Assessment.

## Executive Summary

This is a rules-heavy, state-heavy draft-tournament tool that happens to have zero backend — the correct comparison class is turn-based game state management (boardgame.io, Redux-style pure reducers), not a typical CRUD web app. Four researchers agree, independently, on the shape of the solution: a single serializable tournament document driven by an append-only action log and a pure reducer (`log.reduce(apply, initialState)`), with composition rules ("2 Megas required") compiled into a round schedule *before* the draft starts rather than validated after the fact. That compiled schedule, plus a committed, regulation-labeled Champions roster snapshot generated from Pokémon Showdown's own `champions` mod (cross-checked against PokeAPI), forms the architectural backbone. Undo is not a nice-to-have bolted on later — every researcher who touched it (Architecture, Features, Pitfalls) independently concluded it must be designed into the state model from the first line of code, because a hot-seat host typing names dictated over voice will misclick, and misclicks are the single most likely real-world failure.

The recommended approach: build a thin, deployed, end-to-end walking skeleton first (2 hardcoded players, no bans/cards/rules, but full log+reducer+undo+autosave+export architecture and zero-build delivery proven), then layer in the real draft engine, then the rules compiler (the project's single largest architectural risk and its strongest genuinely novel idea — nothing surveyed does this), then swaps (which structurally depend on the compiler's "typed slots"), then ban modes, then optional tournament depth (brackets/standings), which is fully additive and can be cut without breaking the core product. Three items across the research are explicitly BLOCKING and must land before the draft engine is real: the roster data model (which forme is the draftable unit, and Mega/cosmetic/battle-only classification), the persistence layer (browser storage silently evaporates in at least six ways — the JSON file, not localStorage, must be treated as the system of record), and a config-time feasibility solver (every deadlock — pool running dry, a Mega round with too few Mega-capable Pokémon left, priority-card ties — is a pure function of the configuration and must be caught before the draft starts, not discovered mid-session).

The key risks are not technical unknowns so much as internal contradictions the researchers surfaced in the current requirements, and this document's job is to resolve them: the priority-card mechanic as specified is internally contradictory (fixed 1–6 cards vs. a variable round count, guaranteed ties above 6 players, a forced no-decision final round) and needs a concrete redesign before Phase 3; the "species-only export" decision needs a one-line, structural exception for Mega slots or the exported teams will import successfully and then fail Showdown's battle validator; and "in-app roster refresh" as literally specified (fetch-and-parse live upstream data) is not practically buildable at reasonable cost, but a narrower version of it (fetch the project's own pre-built snapshot) is. None of these break the project — all have a clear, stated resolution below — but all three must be decided before roadmap phases are locked in, because each one changes what a phase actually delivers.

## Key Findings

### Recommended Stack

Vite + TypeScript + Preact + `@preact/signals`, deployed via GitHub Actions to GitHub Pages, is the recommended stack — verified directly against the author's own reference project (`xetoxyc/gothic-remake-lockpicker`), which is itself a Vite+TS build with a GitHub Actions Pages workflow, confirming that "no install, no build step" is a promise to the *visitor*, not the *repo*. The draft/bracket/pool logic is rule-heavy and stateful enough that hand-rolled vanilla DOM is a false economy; Preact costs ~4 KB and turns every "state changed → recompute the screen" case into a plain function. `localStorage` (not IndexedDB) is the right persistence primitive because it can be flushed synchronously on `pagehide`, but research is unanimous that browser storage is a *convenience* layer only — the JSON file export is the actual durability guarantee, because Safari deletes all script-writable storage after 7 days of no interaction, private-mode storage can throw immediately, and two tabs of the same tournament will silently clobber each other with last-writer-wins. No bracket/state-management/virtualization libraries are needed at this scale (~234 pool entries, ~350–500 total actions per tournament); build brackets and the state store by hand (~150–200 lines combined).

**Core technologies:**
- Vite 8.x + TypeScript (pinned `~5.9`/`~6.0`, not floating `latest`) — build tool and type safety for a rule-heavy draft engine
- Preact 10.x + `@preact/signals` — ~4 KB reactive UI over one serializable tournament object
- `pokemon-showdown` npm package (build-time only, devDependency) — the only source that ships Champions legality (`Dex.mod('champions')`); `@pkmn/dex` is verified to lack it
- `localStorage` + `pagehide` flush + JSON file import/export — persistence, with the file as the true system of record
- Hand-written bracket/standings logic and a hand-written ~30-line service worker — no `brackets-manager`, no `vite-plugin-pwa`

### Expected Features

Every generic draft/tournament tool surveyed (FanDraft, Clicky Draft, Commish Kit, PHP Draft) treats single-device "commissioner mode" as a legitimate, sold product category, not a degraded fallback — this validates the hot-seat architecture directly. But feature research also found the current Active requirements missing several things every comparable tool treats as non-negotiable, and found one mechanic (priority cards) internally broken as specified. See the consolidated gap list and priority-card section below.

**Must have (table stakes) not yet in requirements:**
- Undo/edit the last pick — universal across every commissioner-driven tool surveyed; architecturally load-bearing, not a UI add-on
- Pool search by name and filter by type/Mega-capability, composing with the round's own restriction
- Draft board (players × rounds grid) doubling as pick history
- Live per-player roster panels during the draft, not only at completion
- A visible round schedule before any priority card is played (see below)

**Should have (differentiators, already well-aimed):**
- Composition rules compiled into round structure — nothing surveyed does this; it is the strongest genuinely novel idea in the design
- A blind ban phase that actually works on a shared screen — no Pokémon draft tool attempts bans at all today
- Zero install/account/cost, fully offline — every real competitor is a paid or signup-gated hosted service; the Smogon community's actual incumbent is a hand-maintained Google Sheet

**Defer to v2+ / cut outright:** a points/cost/tier valuation system, auction draft mode, hard pick timers with auto-skip, autodraft/recommendation engines, double elimination/Swiss/consolation brackets, player-to-player trades, an in-tool teambuilder. Full prioritized cut list below.

### Architecture Approach

Four commitments carry the project: the tournament is a document (one JSON object: `{schemaVersion, config, ruleSet, schedule, log[]}`), not a session; the core state-transition logic is pure and the impure edge (storage, network, clock, randomness) is a thin, enumerable shell; composition rules compile to a round schedule before the draft starts, and that schedule *types the team slots* so swaps can't silently violate it; and the roster is a build-time artifact — a committed snapshot is the offline guarantee, live refresh is an override, never a dependency. Commitments 1 and 2 together are the entire "sync-ready" requirement from PROJECT.md — there is no separate sync work item, only a set of coding rules followed from day one.

**Major components:**
1. `core/` (pure) — `model.js`, `reduce.js`/`canApply.js`, `rules/compile.js` + `predicates.js` + `feasibility.js`, `draft/pool.js` + `order.js` + `picks.js` + `swaps.js`, `tournament/standings.js` + `bracket.js`, `selectors.js` — zero access to DOM/clock/randomness/network/storage, enforced by CI grep
2. `store.js` — the single orchestration point: `dispatch(intent)` stamps ambient values, appends to the log, applies, notifies, schedules a save; this is the entire future sync seam
3. `adapters/` (impure) — persistence, file-io, export-paste, roster-source, clock/id — the only files allowed to touch the outside world
4. `data/` — committed, regulation-labeled roster snapshot(s) + one offline spritesheet, generated by a Node script that shares its parsing logic with the optional browser refresh path

### Critical Pitfalls

1. **Browser storage quietly evaporates** (private mode, Safari's 7-day eviction, storage pressure, two-tab last-writer-wins, crash mid-write) — treat `localStorage` as convenience only; auto-download a JSON checkpoint at hard milestones, probe storage at config time, and use Web Locks/a generation counter to stop two tabs from clobbering each other.
2. **"No build step" silently breaks** the moment an ES module, a `fetch()` of a local file, or a leading `/` asset path is introduced — `file://` gives an opaque origin that blocks both. Decide the module-vs-classic-script trade explicitly in Phase 1/2 and test by literally double-clicking `index.html`.
3. **"Legal in Champions" is at least three different lists** that differ by ~80 entries, and the upstream identifier Showdown uses for "current regulation" (`mod: 'champions'`) is a moving target that will silently point at a different roster after the next rotation with no error signal.
4. **Forme identity has several live traps**: Meganium is not a Mega despite matching a naive substring test; a Mega is the base species holding a stone, not a separate team slot, and three base species (Charizard, Raichu, Meowstic) have two legal Megas each; cosmetic formes (Vivillon ×17, Alcremie ×8, etc.) and battle-only formes (Castform-Sunny) must be filtered out; species names with hyphens/apostrophes/periods (`Kommo-o`, `Mr. Rime`, `Farfetch'd` with U+2019) break naive string parsing.
5. **A species-only Showdown paste for a Mega slot imports fine and then fails battle validation** because Mega formes carry a `requiredItem` — this is a direct structural conflict with the "no set data" export decision (resolved below).

## Cross-Cutting Reconciliations

The four researchers produced numbers and recommendations that partly conflict. These are resolved explicitly below rather than left for the roadmapper to average or guess at.

### 1. Numeric disagreements — one canonical set, by definition

Three axes were reported differently by different researchers. Reconciling them (not averaging) gives:

| Quantity | Canonical value | Who agrees | Definition | Outlier / caveat |
|---|---|---|---|---|
| **Draftable non-Mega entries** (base species + genuinely distinct alternate formes, cosmetic/battle-only-non-Mega stripped) | **234** | Stack (`Dex.mod('champions').species.all()`, filtered) **and** Architecture (`champions/formats-data.ts` × `pokedex.ts`, filtered) computed this independently and matched exactly | This is the pool size if the draftable unit is the *base species*, before Mega formes are considered at all | — |
| **Base species with ≥1 legal Mega forme** | **73** | Architecture and Pitfalls agree, and the arithmetic is internally consistent (73 base + 3 species with a second Mega = 76 total Mega formes) | "Can this species Mega Evolve at all" | Stack reports 71 (elsewhere 72) — almost certainly an undercount in Stack's own classifier (e.g. a Floette-Eternal-style edge case). **Treat 73 as canonical; re-verify Stack's classifier during Phase 1, don't trust 71/72.** |
| **Total legal Mega formes** (if the Mega forme, not the base species, is the draftable unit) | **76** | Pitfalls' direct count and Architecture's arithmetic (310 total − 234 non-Mega = 76) agree exactly | Charizard, Raichu, and Meowstic each have two legal Megas (X/Y or M/F), so 76 = 73 base species + 3 duplicates | — |
| **Total legal entries, all formes** (raw, before any pool-shaping filter) | **~310–311** | Pitfalls (311, direct parse) and Architecture (310, arithmetic) agree to within one entry | Base species + alternate formes + Mega formes, before dropping cosmetic/battle-only junk | Stack's raw pull via a *built* Dex (which auto-generates cosmetic formes) got 347 — this is not a competing "true" count, it is the same population read through a source that includes ~36 additional cosmetic duplicates that the other two methods correctly exclude at the source level |
| **Total base species (all, Mega-capable or not)** | **207 (Pitfalls) or 208 (Stack, PokeAPI cross-checked)** | Genuinely unresolved — off by exactly one | "How many distinct Pokémon are Champions-legal" | **Re-diff Showdown vs. PokeAPI directly during Phase 1 to find the one species causing the discrepancy.** This is a verification task, not a policy decision. |

**Bottom line for the roadmapper:** use **234** for pool-sizing math if the draftable unit is the base species, **73** for "how many Mega-capable species exist" (this is the hard ceiling that drives Mega-round feasibility: `players × megaRounds ≤ 73 − megaBans`), and **76** only if the decision below is "Mega forme is a separate draftable unit." The 207-vs-208 gap does not change any of the above and can be resolved as a Phase 1 chore.

### 2. Species-only export vs. Mega stone requirement — resolved

The Key Decision "species-only export, no set data" is **not wrong, but it needs one explicit, structural exception**: Showdown's team-validator rejects a bare Mega-forme species line (verified directly against `pokemon-showdown`'s source — `Venusaur-Mega` with no item produces `"Venusaur-Mega transforms in-battle with Venusaurite, please fix its item."`) because a Mega forme's entire identity is defined by holding its stone. There is no way to export a functioning Mega-drafted team without that one item line.

**Resolution:** the export rule becomes *"species-only, except a drafted Mega slot exports as `SpeciesName @ StoneItemName`"* (e.g. `Venusaur @ Venusaurite`). This is still not a teambuilder — no EVs, no nature, no moveset, exactly one item line that exists purely to make the Pokémon's Mega status functional — and it does not undermine the rationale behind the original decision ("pokebase and Showdown already build sets well"). Both export targets are unaffected in practice: pokebase.app's own shipped code confirms it accepts standard Showdown paste syntax including `@ item` lines, and one adapter still serves both targets — the Stack finding that "one export format serves both" survives intact. **This requires a one-line amendment to the PROJECT.md requirement text and Key Decision**, and it means the roster snapshot must carry each Mega forme's stone item name (a small, already-available field).

### 3. In-app roster refresh vs. no viable endpoint — resolved

Architecture verified both plausible refresh endpoints are CORS-open (`Access-Control-Allow-Origin: *`) for in-browser `fetch()`. Pitfalls separately found that the *content* behind those endpoints is not practically usable at runtime: `teambuilder-tables.js` is 16.1 MB for ~330 KB of actual Champions data, and the lean alternative (`raw.githubusercontent.com/.../formats-data.ts`) is raw TypeScript source that would need its own in-browser parser — a second parser, differently shaped from the one the build-time script already uses, guaranteeing drift between the two over time.

**These are not actually in conflict — they describe two different tiers of the same feature**, and Architecture's own pipeline design already distinguishes them: Tier A is fetching the **project's own already-generated, already-committed** `data/roster.<reg>.json` from `raw.githubusercontent.com` (small, pre-parsed, no TS parsing, no drift risk), and Tier B is fetching and parsing **raw upstream Showdown/PokeAPI data live in the browser** (the 16 MB tax and dual-parser risk Pitfalls correctly rejects).

**Resolution: in-app refresh survives v1, scoped to Tier A only.** It fetches the maintainer's own pre-built snapshot file, with a manual "Import roster JSON" (a GitHub Release artifact) as the zero-network fallback — which conveniently reuses the tournament-JSON-import machinery the persistence requirement already needs. Tier B (live upstream parsing) is cut, not deferred — it should not appear on the roadmap at all under the current architecture.

### 4. Priority-card mechanic — consolidated problem and resolution

Features research found the mechanic as specified is internally contradictory in four ways, and Pitfalls independently quantified the most severe one:

- Cards are hardcoded 1–6 while the round count is host-tunable (Mega rounds, manual schedule edits) — the two cannot both be true.
- **Ties are the normal case, not an edge case, once players exceed the card count.** Verified probability of at least one tie in a round: 16.7% at 2 players, 44.4% at 3, **72.2% at 4, 90.7% at 5, 98.5% at 6, and a mathematical certainty (100%) at 7+** — squarely inside the project's stated 4–8 player range, and there is currently no tiebreak rule at all.
- The final round has no real decision (every player has exactly one card left), so the mechanic offers R−1 real decisions, not R.
- The post-draft swap rounds are specified to run "in pick order" at a point where every card has already been spent — no pick order source exists for them.

**Resolution (single consolidated redesign, replacing the current spec):**
- Card count derives from the round schedule: cards are `1..R` where `R` = the number of pick rounds actually compiled, not a fixed 6.
- Adopt **El Grande-style open sequential, face-up play** (not Libertalia-style simultaneous reveal): players play cards in a rotating order, later players see what's already played. This avoids re-creating the hidden-information/hot-seat problem five more times per draft (the 7 Wonders app shipped with no pass-and-play mode for exactly this reason).
- When players ≤ rounds, add El Grande's rule that a value already played in the round cannot be played again — ties disappear entirely in that regime.
- When players > rounds (ties now mathematically guaranteed), adopt an explicit, deterministic, visible tiebreak — a passing "priority token" that the loser of a tie holds and wins the next tie is the most auditable option with no randomness to explain; a seeded, on-screen "coin flip" (with the seed stored in state so it's reproducible after reload) is an acceptable, equally defensible alternative. Either is fine; a silent stable sort on card value is not — it invisibly means "whoever was entered first goes first."
- The full round schedule (including which rounds are Mega rounds) must be visible before the first card is played, since the priority-card feature depends on the round-schedule feature for its entire strategic point.
- Post-draft swap rounds need an explicit, separate pick-order source once all cards are spent — reusing (or reversing) an already-resolved round's order is the simplest option and matches the "worst record picks first" convention real leagues use for free agency.

### 5. Roster rotation — concrete pipeline implications

Champions regulations rotate roughly every 10 weeks (M-A: 8 Apr–17 Jun 2026; M-B: 17 Jun–2 Sep 2026; M-C expected ~2 Sep 2026 — about a month after this research). Showdown's `mod: 'champions'` always means "whatever regulation is current," so hardcoding that string in the regeneration script will silently re-point the snapshot at a new regulation with no diff signal beyond the roster contents changing. Concretely, the pipeline must:

1. Explicitly define "legal" as *the current ranked Regulation Set* (not "ever obtainable," not a tiered competitive format) and record that as a Key Decision.
2. Stamp every snapshot with `{regulation, validFrom, validUntil, upstreamCommit, generatedAt, speciesCount, megaCount, checksum}` — never ship a bare array of names.
3. Pin the generation script to a commit SHA, and make it **fail loudly** on an unexpected count delta (>10%) rather than silently committing a different regulation under the same label.
4. Show a zero-network staleness banner comparing `Date.now()` to `validUntil`.
5. Keep the prior regulation's frozen snapshot too (Showdown itself keeps `championsregma` alongside `champions`), so completed tournaments and any host who wants to pin a regulation both stay meaningful.
6. This directly reinforces the Tier-A-only refresh decision above — fetching the project's own regenerated, correctly-labeled snapshot is exactly the mechanism that survives a rotation without a full code release.

Because the next rotation is expected within roughly a month of this research, regulation-labeling infrastructure is not deferrable polish — it needs to exist essentially from Phase 1.

## Consolidated Requirement Gaps

Collected from Features research for the requirements-definition step. None of these are currently in PROJECT.md's Active list, and every comparable tool surveyed treats the first group as non-negotiable.

**Architecturally load-bearing (design in from day one, not retrofittable):**
- Undo / edit the last pick
- Pool search by name
- Pool filter by type and Mega-capability, composing with the round's own pool restriction
- Draft board (players × rounds grid), doubling as pick history
- Live per-player roster panels during the draft, not only at completion
- Priority-card count derived from the compiled round count, not fixed at 6
- An explicit, visible tiebreak rule for equal priority cards
- An explicit pick-order source for post-draft swap rounds
- The full round schedule visible before the first priority card is played
- A stated duplicate-ban resolution policy for blind mode (feeds pool auto-sizing math)

**Expected and cheap, load-bearing for the tournament half:**
- One numeric result field per match (Pokémon remaining / KO differential) to enable a standard tiebreaker
- A short, explicit standings tiebreak chain (record → differential → head-to-head → host override)
- A seeded top-N cut path from round robin into the bracket
- An initial player-order randomizer
- A regulation-set label on the roster snapshot (and ideally host selection between snapshotted sets)
- A free-text house-rules/notes field on the tournament page
- An explicit "legible from across the room" acceptance criterion for the pool and board

## Recommended Cuts (prioritized)

To protect the success criterion ("run one full tournament end to end without touching a spreadsheet"), consolidated across all four researchers:

**Do not build, full stop:**
- A points/cost/tier valuation system — bottomless maintenance sinkhole, conflicts directly with the round-structure-as-constraint design
- Auction/nomination draft mode — needs bid clocks and nomination queues; miserable over one mouse and a voice call
- Hard pick timer with auto-skip — actively hostile in a voice-call hot-seat context where the social clock already works
- Autodraft / pick recommendations / "type demand" analysis — negative value with humans present and talking
- Double elimination, Swiss, consolation brackets — losers-bracket layout is "where bracket rendering code goes to die"; round robin + top-N seeded single elim covers this audience
- Player-to-player trades — needs a proposal/accept state machine for a rare event; undo + swaps already cover the real need
- In-tool teambuilder (movesets/EVs/items) — Champions uses its own 66-stat-point system, a second data model entirely; ChampDex already does this well

**Defer past v1 (ship a minimal version now, the full version only if asked):**
- Manual round-structure fine-tuning — ship only the derived schedule + a plain reorder; a full generic editor doubles the feasibility solver's surface
- Automatic tiebreak chains beyond one link (Buchholz, game differential) — ship wins-only + one differential field + explicit host override for ties
- Tier-B in-app roster refresh (live upstream fetch+parse) — cut per the reconciliation above; ship Tier-A + manual JSON import instead
- Blind ban's fancier flows (second-device short-code submission) — ship pass-the-device and host-as-scribe first; design the pass-the-device flow properly, treat the short-code as a v1.x delight
- Best-of-three detailed game-by-game log — ship as a label + a 2-of-3 counter, not individual game modeling
- Dedicated post-draft swap rounds — mid-draft swap currency may be sufficient on its own; add the dedicated rounds only if a group asks
- Type-coverage panel, pick-announcement flourish, shareable draft-summary image — cheap polish, explicitly non-essential

## Implications for Roadmap

Ten phases, merging Architecture's proposed sequencing with Pitfalls' three explicitly BLOCKING items (placed at the point each becomes load-bearing) and Features' undo/gap findings (folded into the phases where they naturally land).

### Phase 1: Roster Data Foundation
**Rationale:** Everything downstream — pool, bans, the rules compiler, export, sprites — depends on a correctly classified roster. This is where the numeric reconciliation above must be re-verified against live data, and where the draftable-unit open decision must be answered before any pool-building code is written.
**Delivers:** Pure `roster/transform.js` shared by the build script and any future refresh path; committed `data/roster.<reg>.json` with a full regulation metadata header; the draftable-unit decision encoded; forme/Mega/cosmetic/battle-only classification with a fixture test over the known-hostile set (Kommo-o, Mr. Rime, Meowstic-M/F-Mega, Floette-Mega, Castform-Sunny, Charizard/Raichu-Mega-X/Y, Meganium, Vivillon); sprite-id derivation (`toID(baseSpecies)` / `toID(base)+'-'+toID(forme)`) plus a missing-sprite audit; a hand-verification spike of both export targets, including a Mega-containing team, since the answer determines whether Mega stone names must live in the snapshot at all.
**Addresses:** Roster data requirements (Champions-legal pool, Mega-capability flag).
**Avoids:** Pitfalls #3 (three different "legal" lists), #4 (forme identity traps), #5 (sprite naming), #10 (sprite-source licensing).

### Phase 2: App Shell, Persistence & Walking Skeleton
**Rationale:** Proves the delivery model (GitHub Pages, offline, zero build for the visitor) and the state architecture in one thin vertical slice before any real feature is built on top of it. Undo and the durability of autosave must exist before the draft engine is real — retrofitting either onto mutable state is the classic rewrite trigger every researcher independently flagged.
**Delivers:** Deployed GitHub Pages URL; append-only action log + pure `apply`/`canApply` + selectors; a 2-hardcoded-player linear 6-round draft with no bans/cards/composition rules; species-only paste export (validated against the Phase 1 spike); `localStorage` autosave with a canary probe, a Web Locks tab guard, a generation counter, and a rolling autosave ring; JSON file export/import as the actual system of record (not a "backup"); undo, built in from line one; the module-vs-classic-script decision made and tested by literally double-clicking `index.html`.
**Uses:** Vite/TS/Preact/@preact/signals, `localStorage`, `Blob`+`<a download>`, `<input type=file>`.
**Addresses:** Persistence requirements; closes Features' #1 gap (undo).
**Avoids:** Pitfalls #1 (storage evaporation — BLOCKING), #2 (zero-build promise silently broken — BLOCKING).

### Phase 3: Real Draft Engine
**Rationale:** The playable product without composition rules yet. General pool-arithmetic feasibility (pool-dry, worst-case ban starvation, player-count ceiling) is checkable independent of Mega/composition rules and must exist here — it does not need to wait for the rules compiler.
**Delivers:** Host config screen (players, names, format label, depth, ban-mode selection); pool build with auto-sizing + host override; a live feasibility panel disabling "Start" with a stated reason; pool browser with name search, type/Mega filter, density toggle, sprite fallback; the redesigned priority cards (open sequential play, card count = round count, explicit deterministic tiebreak); draft board grid doubling as pick history; live per-player roster panels; on-the-clock/up-next indicators; confirm-then-commit on every destructive action.
**Addresses:** Draft-core requirements; Features' P1 gaps (search, filter, board, live rosters, card-count derivation, tiebreak rule).
**Avoids:** Pitfalls D1/D2/D5/D7 (general feasibility — BLOCKING here), D4 (priority-card ties, now a designed rule), #7 (misclicks and turn-clarity, via confirm+commit and a loud turn indicator).

### Phase 4: Rules Compiler (composition → round schedule)
**Rationale:** The single largest architectural risk and the project's strongest genuinely novel idea. Doing it now, before swaps/ban-modes/tournament depth exist, means little has to be rewritten later. Establishes typed team slots, which Phase 5 structurally depends on, and makes the full round schedule visible — closing the priority-card dependency from Phase 3.
**Delivers:** `RuleSet` config + `compileSchedule()`; serializable predicate descriptors + a pure evaluator; Mega rounds + a Mega-ban list; host-authored banlist mode (the simplest ban mode, and the one that unlocks the Mega-ban list); typed team slots; Mega-round-specific feasibility (`players × megaRounds ≤ 73 − megaBans`); overlap-predicate warnings; manual schedule override limited to reordering the derived schedule, not a full generic editor.
**Addresses:** Composition-rules-via-round-structure requirements; the "full schedule visible before cards played" gap.
**Avoids:** Anti-Pattern of validating composition after picks; Pitfall D3 (Mega-round starvation — BLOCKING); the scope trap of an unbounded rule-configuration surface.

### Phase 5: Swaps
**Rationale:** Structurally depends on typed slots from Phase 4. Building swaps earlier would produce a system that can silently violate composition rules with nothing left to catch it, since the whole point of the compiler is removing runtime validation.
**Delivers:** Swap budget ledger; mid-draft swap currency, slot-filter-preserving; optional post-draft swap rounds with an explicit pick-order source (reuse/reverse an already-resolved round's order); a leftovers view filtered by the target slot's own predicate.
**Addresses:** Swap requirements; the "pick order for swap rounds" gap.
**Avoids:** Swaps bypassing the round schedule; Pitfall D6 (a swap returning a Pokémon that violates composition).

### Phase 6: Ban Modes (Blind + Snake)
**Rationale:** Host-banlist mode already unblocked the compiler in Phase 4; blind-ban UX is a genuine, separate design problem — the highest UX risk in the project — that deserves dedicated attention. Reuses the commit/reveal sub-module the priority-card system already needed in Phase 3.
**Delivers:** Snake-mode bans (visible turn order); blind-mode bans with a real full-screen pass-the-device interstitial, not an input mask; a bfcache/`pageshow` guard so the back button cannot resurrect a private screen; an explicit, displayed duplicate-ban resolution policy.
**Addresses:** Ban requirements; the blind-ban differentiator.
**Avoids:** Pitfall #7(a) (hidden-information leaks); the duplicate-ban-policy gap.

### Phase 7: Tournament Depth (brackets & standings)
**Rationale:** Fully additive — consumes only completed teams and nothing else. The only subsystem genuinely separable from the draft, hence last among feature phases: a working drafter with no brackets is still valuable, brackets with no drafter are worthless. The success criterion is met for a draft-only night at the end of Phase 4/5, and for a full bracketed tournament here.
**Delivers:** Depth selector; round-robin generation + standings (win/loss + one differential field + a short deterministic tiebreak chain ending in an explicit host override — not automatic Buchholz); single-elim bracket with byes, tested at N=1,2,3,5,6,7; seeded top-N cut from round robin into the bracket; Bo3 as a label + 2-of-3 counter; editable match recording.
**Addresses:** Tournament management requirements; the standings-tiebreak and seeded-cut gaps.
**Avoids:** Pitfall #9(a) (bracket/standings scope balloon — explicitly excludes double-elim/Swiss/consolation); D8/D9 (bye clustering, cyclic-tie non-determinism).

### Phase 8: Portability & Archive
**Rationale:** The log makes recap nearly free once it exists; export/import only needs `schemaVersion` + `migrate()` to be trustworthy across app versions and browser sessions.
**Delivers:** JSON export/import with schema migration; a completed-tournament list; a draft recap rendered directly from the log.
**Addresses:** Remaining persistence requirements (import/export, viewable-after-completion).

### Phase 9: Roster Refresh (reframed, Tier A only)
**Rationale:** The committed snapshot already satisfies the offline/correctness requirement; refresh is convenience whose value appears only at the next regulation rotation (expected within about a month of this research). Deferred deliberately, and scoped per the reconciliation above.
**Delivers:** In-app fetch of the project's own committed `data/roster.<reg>.json` (not raw upstream data) from `raw.githubusercontent.com`; a regulation selector/precedence UI; manual "Import roster JSON" as the zero-network fallback, reusing the tournament-JSON-import machinery; a staleness banner; an optional CI job that regenerates the snapshot and opens a PR on drift.
**Avoids:** Pitfall #9(c) (the 16 MB-for-330 KB tax and dual-parser drift risk of live upstream parsing — explicitly cut from this phase).

### Phase 10: Polish
**Rationale:** Last, as always.
**Delivers:** Display density modes; a shared-screen legibility pass; empty/error states; an attribution footer (credits, fan disclaimer, `APP_VERSION`, roster regulation + `generatedAt`).
**Avoids:** Pitfall #10 (IP/attribution).

### Phase Ordering Rationale

- The three BLOCKING items land where they become load-bearing, not all at the front: roster classification (Phase 1) must precede anything that touches the pool; general persistence durability (Phase 2) must precede the draft engine, because the draft engine is what makes losing data expensive; the feasibility solver is split — general pool arithmetic belongs with Phase 3's config screen, and Mega-specific feasibility is inseparable from Phase 4's compiler, because it needs the compiled schedule to know how many Mega rounds exist.
- Phase 4 before Phase 5 because typed slots are a prerequisite, not a nicety, for swaps.
- Phase 4 before Phase 6 because host-banlist mode is enough to close the bans→compile→pool loop, and the compiler is the higher architectural risk — do it while there is little to rewrite.
- Phase 7 last among feature phases because it is the only fully additive subsystem.
- Phase 9 deliberately late and narrowed to Tier A: the committed snapshot already works, and Tier B (live upstream parsing) is cut outright, not merely deferred.

### Research Flags

Needs deeper research during planning:
- **Phase 4 (Rules Compiler):** HIGH — Architecture's own rules-compiler taxonomy is reasoned analysis with no direct prior art found in surveyed draft tooling; validate the compilable/non-compilable rule-class boundaries against real configuration attempts.
- **Phase 6 (Blind Ban Pass-the-Device UX):** MEDIUM — nearest precedents are party apps (Werewolf/Mafia/Spy) and board games, not a direct draft-tool precedent for hidden information on one shared screen.
- **Phase 3 (Priority-card redesign):** MEDIUM — this is a novel mechanic being retrofitted mid-spec; the tiebreak-rule choice and the open-sequential-play flow should be validated with an actual playtest, not just implemented from the write-up.
- **Phase 9 (Roster refresh):** MEDIUM — confirm `raw.githubusercontent.com`'s CORS and caching behavior still holds at implementation time, and pin the exact fetch/parse strategy before building.

Standard patterns (skip research-phase):
- **Phase 1 (Roster pipeline):** the mechanics are already fully verified empirically in this research; remaining work is execution against the specified fixture tests.
- **Phase 2 (State architecture):** well-documented (Redux Style Guide, boardgame.io) and directly precedented.
- **Phase 5 (Swaps):** a direct, low-risk consequence of Phase 4's typed slots.
- **Phase 7 (Brackets/round-robin):** well-trodden tournament-software territory.
- **Phase 8 (JSON export/import/migration):** standard practice.

## Open Decisions Requiring a Human Answer

These surfaced across the research and need an explicit answer — not an inferred default — before the roadmap phases above are locked in, because each one changes what a phase delivers.

1. **Draftable unit:** does a "pick" consume a base species (73 of which are flagged Mega-capable, Mega chosen separately) or a specific Mega forme as its own row (76 rows, including Charizard-Mega-X *and* -Y as distinct picks)? Recommendation leaning: base species — but it needs sign-off.
2. **Mega-X/Y choice timing:** for the three base species with two legal Megas (Charizard, Raichu, Meowstic), is the X/Y or M/F choice made at draft time, or left open until export?
3. **NFEs and alternate formes:** are not-fully-evolved Pokémon and non-Mega alternate formes (regional forms, Rotom appliances, Tauros-Paldea variants) draftable by default, or does the host need a one-click "fully evolved only" filter?
4. **Mega export representation:** confirmed amendment — does the species-only export rule become "species-only, except a Mega slot exports as `Species @ Stone`"? (Recommended yes; see reconciliation above.)
5. **Priority-card redesign:** adopt the El Grande-style open-sequential redesign (card count = round count, explicit tiebreak above the round count) as a replacement for the current fixed-1–6/simultaneous spec — yes/no?
6. **In-app roster refresh scope:** confirmed amendment — is v1's refresh limited to Tier A (the project's own pre-built snapshot) plus manual JSON import, with Tier B (live upstream parsing) cut entirely rather than deferred?
7. **Duplicate-ban policy:** when two players blind-ban the same Pokémon, do both bans apply with one wasted (the LoL rule), or does a wasted ban grant a re-ban? This changes the pool auto-sizing arithmetic.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Nearly every claim executed and verified directly (paste-import behavior, CORS headers, sprite availability, the reference project's actual tooling) rather than assumed. |
| Features | MEDIUM-HIGH | Draft-league norms and generic draft-board UX are HIGH (official Smogon articles, live league rulesets, vendor docs, OSS repos). Champions format specifics are MEDIUM-HIGH (three independent sources agree, but regulations rotate every ~10 weeks). Hot-seat hidden-information UX is MEDIUM — real precedent exists in party apps and esports draft, but not for a blind ban phase on one shared screen specifically. |
| Architecture | HIGH for state/sync patterns and the roster pipeline (directly verified against source data and official docs); MEDIUM for the rules-compiler taxonomy, which is reasoned analysis with no direct prior art found. |
| Pitfalls | HIGH on storage/hosting/data (verified against WebKit/MDN docs and live HTTP probes/Showdown source); MEDIUM on draft-logic and scope framing (derived from the project's own rules plus first principles). |

**Overall confidence:** HIGH, with the specific gaps below carried forward rather than glossed over.

### Gaps to Address

- **207 vs. 208 base species:** two researchers used slightly different methodologies against what should be the same underlying data and landed one apart. Re-diff Showdown's `champions` mod against PokeAPI's `champions` Pokédex directly during Phase 1; this is a verification task, not a design decision.
- **Stack's 71/72 Mega-capable count vs. the canonical 73:** likely an undercount in Stack's own forme classifier (possibly a Floette-Eternal-style edge case). Re-run the fixture test from Pitfall #4 against Stack's actual code path during Phase 1.
- **pokebase.app's exact acceptance of an `@ item` line specifically** (as opposed to Showdown paste format generally) was inferred from its stated acceptance of "Showdown paste format," not tested with a literal Mega export. Verify in the Phase 1 export spike, alongside the already-planned Showdown Validate check.
- **PokeAPI sprite licensing:** `LICENSE` 404s at the repo root; a `LICENCE.txt` exists and must actually be read before shipping. Low risk, must not be skipped.
- **Rules-compiler taxonomy (compilable vs. non-compilable rule classes):** reasoned analysis, not tested against real host configuration attempts. Validate during Phase 4 build, and keep the "pick guard" escape hatch as a named, unbuilt extension point rather than building it speculatively.
- **Hot-seat blind-ban and priority-card UX:** no direct one-screen software precedent exists for either; the tabletop analogs (El Grande, Libertalia) and party-app analogs (Werewolf, Spy) are strong but indirect. Treat Phase 3 and Phase 6 as needing an actual playtest with the target 4–8 friend group, not just an implementation of the write-up.

## Sources

### Primary (HIGH confidence)
- `pokemon-showdown@0.11.11` — `Dex.mod('champions')` species enumeration and `Teams.import()` paste-format tests, executed directly
- `smogon/pokemon-showdown` GitHub repo — `data/mods/champions/formats-data.ts`, `data/mods/championsregma/`, `data/pokedex.ts`, `sim/teams.ts`, `sim/team-validator.ts`, `champions/rulesets.ts` — read and parsed directly
- `https://pokeapi.co/api/v2/pokedex/champions` — 208-species cross-check against Showdown
- pokebase.app — 50 production JS chunks downloaded and read directly for its import/export code paths
- Live HTTP probes — GitHub Pages cache headers, Showdown sprite availability (`gen5/`, `dex/`), CORS headers on all refresh-candidate endpoints
- MDN — Storage quotas and eviction criteria; `StorageManager.persist()`; `beforeunload`
- WebKit — Updates to Storage Policy (7-day script-writable storage eviction)
- Redux Style Guide; boardgame.io documentation (Randomness, Game API)

### Secondary (MEDIUM confidence)
- Smogon community draft-league resources, real league rulesets (Frost, IPF, ARK's) — draft-league conventions (standings, tiebreaks, tier slots, free agency)
- Victory Road / Bulbapedia / Game8 — Champions regulation cadence and roster deltas (M-A → M-B)
- El Grande / Libertalia rules (UltraBoardGames, BGG) — priority-card mechanic precedent
- Generic draft-board tools (FanDraft, Clicky Draft, Commish Kit, DraftDex, Drafty Sports) — commissioner-mode / single-device UX precedent
- Martin Fowler / Azure Architecture Center — event-sourcing trade-offs (adopted the shape, rejected the infrastructure)

### Tertiary (LOW confidence)
- PokeAPI sprites licensing (`LICENCE.txt`, unread at research time) — must be resolved before shipping
- App-store reviews (theDraftNight) — anecdotal UX warning, not systematic user research

---
*Research completed: 2026-08-03*
*Ready for roadmap: yes*
