# Phase 2: Host-Configured Draft Night - Research

**Researched:** 2026-08-07
**Domain:** Draft-configuration arithmetic, seeded constrained sampling, and extending an
existing pure-core / signals / Preact codebase
**Confidence:** HIGH

> **Provenance key.** `[VERIFIED: <source>]` = confirmed by running a tool against a file on
> disk in this session. `[CITED: <path>:<line>]` = quoted from a document or source file that
> was read. `[ASSUMED]` = training knowledge, not verified here. Every number in the
> Feasibility Arithmetic section is `[VERIFIED]` unless marked otherwise.

---

<user_constraints>

## User Constraints (from 02-CONTEXT.md)

### Locked Decisions

Copied verbatim. All 39 are locked; the planner may not substitute an alternative.

**Entry Point and Config Screen**

- **D-01:** The app opens on a **landing screen with three actions** — New tournament,
  Resume saved draft (rendered only when a save exists), Import JSON. The D-13 storage
  canary runs here and its blocking acknowledge screen fires from here. This replaces
  `app.tsx`'s current behaviour of auto-creating a tournament on load, and it gives JSON
  import the front door it does not have today.
- **D-02:** Config is **one scrolling form**, not a wizard and not progressive reveal.
  Player names, format label, depth, pool size, Mega requirement, dual-Mega preferences,
  banlist, and starting order are all reachable at once. Start is pinned at the bottom
  with the live feasibility reason beside it. Chosen because player count invalidates pool
  size, bans, and feasibility simultaneously — a wizard makes that backtrack painful, and
  backtracking is the normal case, not the exception.
- **D-03:** **DRFT-15 is two rows.** The roster carries exactly two dual-Mega species,
  Charizard (Mega-X / Mega-Y) and Raichu (Mega-X / Mega-Y). A "Dual-Mega species" block
  renders one three-way X / Y / Either toggle per row, defaulting to **Either**. Rows are
  derived from `megaFormes.length > 1`, never from a hardcoded list, so a regulation that
  adds a third dual-Mega species just appears.
- **D-04:** **DRFT-16 randomize is re-rollable and shows its result.** Host clicks
  Randomize, the order renders as a numbered list, and clicking again re-rolls. A group
  that dislikes a roll will re-roll regardless; hiding the button does not prevent it, it
  just moves the argument outside the tool. The resolved order is still materialized into
  `draft/started` on Start, exactly as it is today.

**Pool Sizing and the Draw**

- **D-05:** **DRFT-02 offers three presets: Exact (`players × rounds`), ×1.5, and ×2.**
  Exact is the **default**. Expressed as ratios rather than a flat `+N` surplus so Phase
  3's variable round count carries them unchanged. Exact means zero surplus: the last
  picker in the final round chooses from one remaining Pokémon and swaps have nothing to
  trade into. That is a legitimate choice and it is now the landing default — which is
  precisely why D-09's warning severity exists.
- **D-06:** **DRFT-03's override is a free numeric input.** No clamping. Anything
  unsatisfiable fails the RULE-07 gate with the arithmetic stated. One authority on what
  is satisfiable instead of two — a silent clamp and a feasibility gate can disagree, and
  then the host is arguing with an input box.
- **D-07:** The pool is a **seeded uniform random draw, re-rollable at config time**,
  materialized into `pool/built` (which already carries `ids`, `rosterVersion`, and
  `checksum`). Re-roll is the escape hatch for a draw the group dislikes, and it defuses
  draw variance without building Phase 3's Mega feasibility check early.
- **D-08:** **Config gains one new field: `megasRequiredPerTeam` (0..rounds, default 0).**
  Phase 2 uses it for exactly two things — constraining the draw to contain at least
  `players × N` Mega-capable entries, and feeding the feasibility gate. It builds **no**
  Mega-only rounds and **no** schedule compiling; Phase 3 still owns all of that and reads
  this field as compiler input.
  **This is a deliberate deviation from ROADMAP §"Ordering Constraints" 6**, which places
  Mega-specific feasibility (RULE-09) wholly in Phase 3. The reason for deviating: a pool
  drawn in Phase 2 blind to the Mega requirement can be dead on arrival in Phase 3, and
  the alternative — re-emitting `pool/built` during Phase 3 config — makes the host
  configure a pool and then watch it change. The planner must record this deviation
  explicitly rather than silently absorbing it.
- **D-09:** The number of Mega-capable entries in the drawn pool is **recorded** so Phase
  3's RULE-09 gate reads it instead of recomputing against a rotated roster.

**Host Banlist**

- **D-10:** **Two input surfaces, one banlist.** A ban-mode `PoolGrid` renders all 235
  entries and clicking toggles a ban (cell dims); a typeahead field with a removable chip
  list covers the host who already knows the name. Search and the type filters work in
  ban mode for free. Both write the same flat list.
- **D-11:** **Species bans only.** One flat list of banned species ids satisfying BAN-02
  and BAN-08. The host cannot ban a Mega forme while keeping the species draftable.
  *Consequence, accepted knowingly:* ROADMAP §"Ordering Constraints" 4 and Phase 3 success
  criterion 1 both assume this phase's banlist supplies the compiler's Mega-ban list. It
  does not. Phase 3 must add Mega-forme bans to a config shape that has already shipped —
  a schema bump plus a second banlist surface. Plan for that in Phase 3; do not smuggle it
  into Phase 2.
- **D-12:** **BAN-01's three modes are all visible; blind and snake are disabled** and
  labelled "Not yet available". The selector's shape is therefore set now, and Phase 4
  enables two options rather than redesigning the control.
- **D-13:** **BAN-08 is taken literally.** Banned entries are absent from the pool — not
  dimmed, not struck, not rendered. A collapsed **"Bans (N)"** disclosure in the top bar
  shows the list on demand, so "wait, where's Landorus?" has an answer inside the tool.
  That mattering is the whole product thesis.

**Feasibility Gate (RULE-07)**

- **D-14:** **Two severities.** *Blocking* disables Start: pool smaller than
  `players × rounds`, pool larger than the post-ban legal count, more Megas required than
  exist post-ban, duplicate or empty player names, fewer than two players. *Warning* does
  not disable: satisfiable but degenerate, chiefly an Exact pool leaving the final picker
  one option. One severity is insufficient specifically because Exact is now the default
  and it passes every blocking check.
- **D-15:** **A blocking reason is a sentence plus the numbers.** "Pool is too small.
  8 players × 6 rounds needs 48 Pokémon; the pool is 40 after 12 bans." States the problem
  and the next action per CLAUDE.md's copy rule, and the numbers show which of four
  interacting fields to change.
- **D-16:** **The gate recomputes live on every change.** Start's enabled state and its
  reason update immediately. Pure functions over a few hundred ids — no debounce, no
  Check button. RULE-07 exists so the group never discovers a dead draft late, and a
  disabled button carrying a visible reason is a stronger signal than a rejection.
- **D-17:** **No player-count cap of any kind.** The arithmetic is the only limit, so no
  constant hardcodes a ceiling. This resolves a live discrepancy without needing to pick a
  side: ROADMAP Phase 2 Notes cite `players × 6 ≤ 207` (→ 34 players) from the
  `baseSpecies` count, but the pool draws from **235 draftable rows** (→ 39). Because
  nothing hardcodes either figure, neither number needs to be right. Honours PROJECT.md's
  scale constraint — "Warn when pool math or rules become unsatisfiable rather than
  hard-capping" — by construction. The UI still tunes its layout for 4–8.

**Shared-Screen Layout**

- **D-18:** **Side-by-side panes**: pool ≈60%, board ≈40%, each independently scrollable,
  **either pane expandable to full width**.
- **D-19:** **Expansion is an expand button in each pane header** — three discrete states
  (split, pool-full, board-full), with a restore control on the collapsed edge. No
  draggable splitter.
- **D-20:** **Pane state and density persist in browser storage, never in the tournament
  document.** They are view preferences, not facts about the tournament, and they must not
  travel through JSON export or a future sync layer.
- **D-21:** **Board cells are sprite-only in split view; names appear when the board pane
  is expanded.** *Known risk, accepted:* Charizard and Charizard-Mega-X share a base sprite
  in this pipeline and the Rotom appliances read alike at 48px.
  **Implementation requirement, not optional:** `MonChip` currently sets `alt=""`
  *because* adjacent name text supplies the button's accessible name. The sprite must carry
  `alt={entry.name}` whenever the name text is not rendered.
- **D-22:** **DRFT-12 needs no new build.** The existing `TurnBanner` plus the existing
  `board__cell--next` highlight in `TeamStrip` are the two signals.
- **D-23:** **DRFT-14 is verified two ways.** A stated numeric target in the UI spec —
  board name text ≥ 18px, sprite ≥ 48px at standard density, readable at 3 m on a 1080p
  screen — **and** a physical check: stand back from the screen with 8 players configured.
- **D-24:** **Density affects the pool only.** The board keeps fixed sizing.

**Display Density and Card Content**

- **D-25:** **Densities change content, not only scale.** Minimal = sprite + name.
  Standard = + typing + stat total. Full = + all six base stats.
  **This amends the Phase 2 density contract written in `src/ui/tokens.css:10`** and
  therefore amends Phase 1's D-07. **The comment in `tokens.css` must be updated in the
  same change that breaks it.**
- **D-26:** **Typing renders as colour-coded pills with the type name inside.**
  **This amends Phase 1's reserved-colour rule** (`tokens.css:80`).
- **D-27:** **Palette source: canonical Pokémon type hues, with pill ink chosen per type**
  (dark or light, whichever clears 4.5:1 against that hue).
- **D-28:** **Three-letter uppercase type codes at standard density** (`ELE`, `FLY`,
  `WAT`), full type names at full density.
- **D-29:** **Type colour appears on pool cards and on the DRFT-09 type filter controls,
  and nowhere else.** Board chips stay monochrome.
- **D-30:** **Stat total at standard density; all six at full**, as HP/Atk/Def/SpA/SpD/Spe
  in two rows of three.
- **D-31:** **The density control is a three-way segmented control in the pool pane
  header**, beside search and the expand button. Default **Standard**.

**Search and Filters**

- **D-32:** **DRFT-08 is a live normalized substring match.** Lowercase and strip
  non-alphanumerics from both query and name — the same normalization as Showdown's
  `toID` — then substring match. **No name splitting anywhere**, per CLAUDE.md.
- **D-33:** **Type filter is OR by default, with a visible "match both" toggle for AND.**
- **D-34:** **Mega filter is a three-way segmented control — All / Mega-capable /
  Non-Mega**, default All.
- **D-35:** **Search text and all filters clear the moment a pick commits.** Filter state
  is ephemeral UI state and never enters the tournament document.

**Destructive Confirmations (DRFT-13)**

- **D-36:** **Five actions confirm:** abandon draft / start a new tournament; import JSON
  over a live draft; re-roll pool; re-randomize starting order; remove a player or clear
  the banlist. Picking never confirms — D-08 from Phase 1 stands.
- **D-37:** **Undo confirms only when it crosses a round boundary.**
- **D-38:** **Reuse `Dialog.tsx` for every confirm**, following `ImportConfirmDialog`'s
  shape.
- **D-39:** **Copy pattern is a consequence sentence plus verb-object buttons.**

### Claude's Discretion

The user selected a concrete option on every question. These four were surfaced as
available for discussion and consciously left unexplored — they are in scope for Phase 2
and are the planner's and researcher's calls:

- **The `TournamentConfig` schema bump and migration.** `TournamentConfig`
  (`src/core/model.ts:42`) currently holds `formatLabel`, `players`, `rounds`,
  `rosterVersion`, `rosterChecksum`. This phase adds at minimum: bans, pool size,
  `megasRequiredPerTeam`, dual-Mega preferences, tournament depth, and ban mode. That is a
  `SCHEMA_VERSION` bump and a `migrate()` path (`src/core/migrate.ts` exists) for Phase 1
  documents already sitting in browser storage and in exported JSON files. Whether a Phase
  1 save is migrated or rejected with a stated reason was not discussed.
- **Whether tournament depth (DRFT-01) does anything visible in Phase 2.**
- **Keyboard and touch support on the shared screen.**
- **What `CompletedDraft.tsx` becomes at 8 players.**

Also Claude's discretion, being constrained by locked decisions rather than open:
- Where `megasRequiredPerTeam` sits in the config form's order, and its exact label.
- Whether the constrained draw is implemented as reject-and-redraw or as a two-stage draw
  (Mega-capable quota first, remainder uniform). Both are pure and seeded; only
  reproducibility from the seed is non-negotiable.
- Which selectors are added versus extended in `src/core/selectors.ts`.

### Deferred Ideas (OUT OF SCOPE)

No out-of-phase capabilities were raised. Two items move work *into other phases*:

- **Mega-forme bans (Phase 3).** D-11 chose species-only bans, so the compiler's Mega-ban
  list does not exist after Phase 2. Phase 3 must add it: a `SCHEMA_VERSION` bump plus a
  second banlist surface.
- **Mega feasibility (RULE-09, Phase 3) reads a Phase 2 field.** D-08 puts
  `megasRequiredPerTeam` in Phase 2 config and D-09 records the drawn pool's Mega-capable
  count. Phase 3's gate consumes both rather than recomputing, and must handle the case
  where the two disagree after a roster rotation.

**Also out of scope for this research, per the phase brief:** Mega *round* feasibility
(needs Phase 3's compiled schedule), priority cards, swap rounds, brackets, standings,
exports.

</user_constraints>

---

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DRFT-01 | Host configures a tournament — player count, player names, format label, tournament depth | §Phase 1 Inventory (config seam at `store.ts:168`), §Schema Bump and Migration |
| DRFT-02 | Tool auto-sizes the draft pool from player count, leaving enough surplus for swaps | §Feasibility Arithmetic → Pool Sizing Formula (exact preset values, surplus per preset) |
| DRFT-03 | Host can override the computed pool size | §Feasibility Arithmetic → Failure Case F-08 (the NaN hole in a free numeric input) |
| DRFT-05 | Pool displays each Pokémon with sprite, typing, and base stats | §Phase 1 Inventory (`MonCard.tsx`, `RosterEntry.types`/`baseStats`), §Roster Facts (stat bounds) |
| DRFT-06 | Host toggles display density between minimal, standard, and full | §Rendering ~235 Cells, §Phase 1 Inventory (`tokens.css` density contract to amend) |
| DRFT-07 | Drafted Pokémon leave the pool immediately and cannot be picked again | Already shipped — `selectAvailablePool` (`selectors.ts:40`) + `canApply` `notInPool` (`reduce.ts:167`) |
| DRFT-08 | Player can search the pool by name | §Search: `toID` Is Already the Identity Key (verified across all 235 entries) |
| DRFT-09 | Player can filter the pool by type and Mega-capability | §Filters (18 types, 74 Mega-capable, verified), §Rendering ~235 Cells |
| DRFT-10 | A draft board grid of players by rounds shows the full pick history | Already shipped — `BoardGrid.tsx` + `selectTeams` generalize to N players unchanged |
| DRFT-11 | Each player's roster is visible as it fills | Already shipped — `TeamStrip` IS the board row |
| DRFT-12 | An on-the-clock indicator shows whose turn it is | Already shipped — `TurnBanner` + `board__cell--next` (D-22) |
| DRFT-13 | Destructive actions confirm before committing | §Phase 1 Inventory (`Dialog.tsx` focus contract), §Don't Hand-Roll |
| DRFT-14 | Pool and draft board are legible from across a room | §Rendering ~235 Cells; 02-UI-SPEC §DRFT-14 as a Checkable Assertion owns the numbers |
| DRFT-15 | Host sets X, Y, or Either for each dual-Mega species at config time | §Roster Facts — exactly 2 dual-Mega species, derived from `megaFormes.length > 1` |
| DRFT-16 | Host can randomize initial player order at config time | §Seeded Randomness at the Edge; `selectStartingOrder` (`selectors.ts:135`) already correct |
| BAN-01 | Host selects the ban mode at config time | §Schema Bump (a three-value literal union field) |
| BAN-02 | Host banlist mode lets the host exclude Pokémon directly | §Feasibility Arithmetic → `legalCount` must be a set intersection, not `bans.length` |
| BAN-08 | Banned Pokémon never appear in the pool at all | §Feasibility Arithmetic — bans are subtracted **before** the draw; structurally impossible to appear |
| RULE-07 | A feasibility check runs at config time and disables Start with a stated reason | §Feasibility Arithmetic (whole section) — 9 blocking cases + 1 warning, each with a predicate |

</phase_requirements>

---

## Project Constraints (from CLAUDE.md)

Extracted as actionable directives. Treat with the same authority as locked decisions.

| # | Directive | Enforcement |
|---|-----------|-------------|
| C-1 | Runtime `dependencies` is exactly `preact` + `@preact/signals`, both exact-pinned. A third is a constraint violation, not a trade-off. | `package.json` review; verified two entries `[VERIFIED: package.json]` |
| C-2 | `src/core/` is pure: no DOM, clock, randomness, network, storage, timers; no imports from `src/adapters/`, `src/ui/`, `preact`, `@preact/signals`. | `npm run check:pure` — a real parser, not a grep (`scripts/check-pure-core.mjs`) |
| C-3 | No `innerHTML` / `dangerouslySetInnerHTML` / `outerHTML` / `insertAdjacentHTML` anywhere under `src/`. | `npm run check:nohtml` |
| C-4 | `id` for every comparison, key, and set membership; `name` for rendering and export only. Never `split('-')` a species name. | Code review; `Kommo-o`, `Mr. Rime`, `Tauros-Paldea-Aqua`, `Rotom-Wash` are the fixtures |
| C-5 | Sprite filenames come from `spriteMeta.byRosterId[entry.id].file`. Never construct `${spriteId}.png` — it resolves for zero of 235. | `tests/ui/sprite-resolution.test.ts` |
| C-6 | `seq` is `max(seq) + 1`, never `log.length`. Strictly increasing, **may have gaps**. | `store.ts:110-116`; `import-guard.ts:366-385` accepts gaps deliberately |
| C-7 | The document must survive `JSON.stringify` → `JSON.parse` unchanged. No `Set`, `Map`, `Date`, or class instance is ever persisted. | `model.ts` doc block; tests |
| C-8 | Showdown pastes separate records with a **blank line**. Assert exact string equality, never `includes`. | Not touched this phase, but `CompletedDraft` scales to N players |
| C-9 | Plain CSS driven by `src/ui/tokens.css`. No raw hex, no raw px for anything the token table covers. One stylesheet per component, beside it. | Code review; 02-UI-SPEC sanctions exactly two raw lengths (`176px` label column, `60fr 40fr`) |
| C-10 | Copy: second person, present tense, no exclamation marks, no emoji. Errors state the problem and the next action. Buttons name a verb and its object; nothing is `OK`/`Submit`/`Yes`/`Cancel` alone. | 02-UI-SPEC §Copywriting Contract gives every literal string |
| C-11 | `tests/core/**` mirrors `src/core/**` and runs with **zero mocks**. Default env is `node`; a UI test opts in with `// @vitest-environment happy-dom` as the **first line**. `announce` is a module-level signal — reset it in `beforeEach`. | `vite.config.ts:14-19` sets `environment: 'node'` |
| C-12 | `npm run verify` is the single gate: `check:pure`, `check:nohtml`, `test`, `build`. Run before every commit. | `package.json` scripts |
| C-13 | `npm run build:data` is deliberate, never automatic. **Do not regenerate the roster in this phase.** | — |
| C-14 | GSD workflow enforcement — file changes go through a GSD command. | — |

**No conflicts found** between CLAUDE.md and any locked decision in 02-CONTEXT.md.

---

## Summary

Phase 2 is not a research-heavy phase, and the ROADMAP is right that the risk concentrates
in one place: the feasibility arithmetic. Everything else is extension of a codebase that
was built to be extended — `PoolGrid`, `MonCard`, `BoardGrid`, `TeamStrip`, `Dialog` and
`selectors.ts` all carry doc comments naming this phase's additions, and `selectCurrentTurn`,
`selectTeams` and `BoardGrid` already generalize to N players and R rounds with no change.

The load-bearing findings are three. **First**, the arithmetic is small enough to state
completely: with the committed snapshot at 235 draftable entries and 74 Mega-capable, the
whole gate is six inequalities, and the true player ceiling is **39** at the Exact preset
(not the 34 the ROADMAP Notes cite from the `baseSpecies` count, and not 34 or 39 as a
constant — D-17 correctly removes the cap). Pool-dry mid-draft is **structurally impossible**
once `poolSize ≥ players × rounds` holds, and the final picker's choice count is exactly
`poolSize − players × rounds + 1`. **Second**, the 02-UI-SPEC's seven-item precedence list
has three real holes — a free numeric pool-size input yields `NaN` on empty, and `NaN`
silently passes *both* the too-large and too-small comparisons; `megasRequiredPerTeam > rounds`
is caught by no listed blocker at low player counts; and `legalCount` computed as
`235 − bans.length` is wrong the moment the banlist can contain a duplicate. **Third**, the
choice between the two constrained-draw implementations CONTEXT leaves to discretion is not
actually a free choice: reject-and-redraw hangs the browser on configurations the feasibility
gate passes. At 8 players, 4 Megas required, Exact pool, the probability a uniform 48-draw
satisfies the constraint is 1.6 × 10⁻⁸ — about 64 million expected redraws. The two-stage
draw is O(L) and always terminates.

No new runtime dependency is needed, considered, or permitted. Every capability this phase
adds — typeahead combobox, segmented controls, roving tabindex, two-pane splitter, seeded
sampling, feasibility gate, search normalization — is hand-built, and 02-UI-SPEC §Registry
Safety already forecloses the alternative.

**Primary recommendation:** Build `src/core/feasibility.ts` and `src/core/draw.ts` as pure,
seeded, fully-tested modules **first**, before any config UI exists — they are the phase's
only genuine logic, they are testable with zero mocks, and every UI surface in the phase is a
renderer of their output. Implement the draw as a **two-stage partition draw**, not
reject-and-redraw. Bump `SCHEMA_VERSION` to 2 and **migrate** Phase 1 documents rather than
rejecting them; every new field has a lossless default derivable from a v1 document.

---

## Architectural Responsibility Map

This project's tiers are the three directories, not client/server. The dependency arrow only
ever points inward.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Feasibility gate (all 10 reasons) | `src/core/` | `src/ui/` renders | Pure arithmetic over ids and counts. C-2 forbids it anywhere else; 02-UI-SPEC §Pure-core boundary makes it a UI rule too |
| Constrained pool draw | `src/core/` | `src/adapters/` supplies the seed | Pure given `(entries, size, megasRequired, seed)`. The seed is the only ambient input |
| Seed generation (pool + order) | `src/adapters/id.ts` | — | `crypto.getRandomValues` is a forbidden token under `src/core/` (`check-pure-core.mjs:70`) |
| Starting-order shuffle | `src/core/selectors.ts` | — | Already there and already correct (`selectStartingOrder`, line 135) |
| Search predicate / normalization | `src/core/` | `src/ui/` calls it | D-32 and the typeahead (§4 of the UI-SPEC) must share **one** predicate, one module, one test suite |
| Type / Mega filter predicates | `src/core/` | `src/ui/` calls them | Same reason; also lets Phase 3 compose the round's own restriction as a third predicate |
| Config form state (pre-Start) | `src/ui/` | — | Not a fact about a tournament until Start. CONTEXT §Established Patterns: "Config changes made *before* the tournament exists are pre-document form state" |
| Config → document stamping | `src/store.ts` | — | `createTournament` is the seam (`store.ts:168`); it is the only place ambient values reach the document |
| Density / pane preference | `src/adapters/` | `src/ui/` reads | D-20 + 02-UI-SPEC §View preferences in storage: one key `champions-drafter:view`, owned by adapters, never by core and never by a component |
| Filter / search state | `src/ui/` | — | D-35: ephemeral, never persisted, never in the document |
| Schema migration v1 → v2 | `src/core/migrate.ts` | — | Pure by design (`migrate.ts:20`) |
| Untrusted-input validation of new fields | `src/core/import-guard.ts` | `src/adapters/file-io.ts` measures bytes | The one untrusted boundary; byte length is measured at the edge because the core may not |
| Roving tabindex column count | `src/ui/` hook | — | A DOM measurement. 02-UI-SPEC names it as one of exactly two UI-layer-by-necessity items |
| Filter-announcement debounce (300ms) | `src/ui/` | — | A timer. The other named UI-layer-by-necessity item |

**The trap this map exists to prevent:** the feasibility gate is the one thing in this phase
that *feels* like form-validation and therefore *feels* like it belongs in the config
component. It does not. Put it in a component and `npm run check:pure` will not catch it —
the gate has no forbidden token — but Phase 3's RULE-09 gate then has nowhere to compose with
it, and the gate becomes untestable without a DOM.

---

## Roster Facts (measured this session)

Every figure below was read from `public/data/roster.mb.json` on 2026-08-07 by running Node
against the committed file. Do not take these from memory; they rotate with the regulation
(`validUntil: 2026-09-02`).

| Fact | Value | Source |
|------|-------|--------|
| Regulation | `M-B` | `[VERIFIED: roster.mb.json .regulation]` |
| Valid from / until | `2026-06-17` / `2026-09-02` | `[VERIFIED]` |
| Checksum | `sha256-952dc741977d3db0236743f146f78f76ca34c215acfa0308e074a8f8ff9f7230` | `[VERIFIED]` |
| **Draftable entries (`entries.length`)** | **235** | `[VERIFIED]` — this is the pool's universe |
| **Mega-capable draftable entries** | **74** | `[VERIFIED: entries.filter(megaCapable).length]` |
| Dual-Mega species (`megaFormes.length > 1`) | **2** — `charizard` (Charizard-Mega-X / -Y), `raichu` (Raichu-Mega-X / -Y) | `[VERIFIED]` — confirms D-03's two rows |
| Distinct types | **18** | `[VERIFIED]` — Bug, Dark, Dragon, Electric, Fairy, Fighting, Fire, Flying, Ghost, Grass, Ground, Ice, Normal, Poison, Psychic, Rock, Steel, Water |
| Entries with 2 types / 1 type / >2 | 150 / 85 / **0** | `[VERIFIED]` — the pill row is never more than two pills |
| Base-stat totals | min **288**, max **600** | `[VERIFIED]` — confirms the UI-SPEC's 288–600 |
| Largest single base stat | **200** | `[VERIFIED]` — every stat is at most three digits |
| Longest display name | **20** chars — `Tauros-Paldea-Combat` | `[VERIFIED]` |
| `spriteMissing` count | **0** | `[VERIFIED]` — no placeholder appears in this regulation |
| `counts.baseSpecies` (legal set, no forme) | 207 | `[VERIFIED]` — this is where ROADMAP's 34-player figure comes from; it is **not** the pool's universe |
| `counts.distinctBaseSpecies` (draftable rows) | 208 | `[VERIFIED]` — the 207-vs-208 discrepancy STATE.md flags is these two fields measuring different sets |
| `counts.megaFormes` | 76 | `[VERIFIED]` — 74 species, 76 formes, because 2 species carry two each |
| `counts.megaCapableBaseSpecies` | 73 | `[VERIFIED]` — 74 draftable rows collapse to 73 distinct base species |
| Three-letter type codes | all 18 distinct | `[VERIFIED]` — `BUG DAR DRA ELE FAI FIG FIR FLY GHO GRA GRO ICE NOR POI PSY ROC STE WAT`; confirms 02-UI-SPEC §Color |

**On the 34-vs-39 discrepancy.** Both figures are correct measurements of different sets.
`players × 6 ≤ 207` uses `counts.baseSpecies`, which counts *legal entries with no forme* —
it excludes Rotom-Wash, Tauros-Paldea-Aqua, and every other genuinely-distinct alternate
forme, all of which **are** draftable. The pool draws from `entries` (235). D-17 removes the
cap so nothing needs to encode either number, but the planner should know that **39 is the
right answer** if the question is ever asked.

---

## Feasibility Arithmetic

This is the load-bearing section. Every inequality is stated so it can be pasted into an
acceptance criterion.

### Symbols

| Symbol | Meaning | Source |
|--------|---------|--------|
| `R` | Draftable roster size = **235** | `snapshot.entries.length` |
| `M` | Mega-capable draftable entries = **74** | `entries.filter(e => e.megaCapable).length` |
| `p` | Player count | `config.players.length` |
| `r` | Rounds = **6**, constant in Phase 2 | `config.rounds`; **not** host-configurable — see below |
| `B` | The banlist, as a **set** of roster ids | `config.bans` |
| `b` | `\|B ∩ rosterIds\|` — **set cardinality, not array length** | see F-10 |
| `L` | Legal count after bans = `R − b` | derived |
| `M_L` | Mega-capable count after bans = `\|megaCapableIds \ B\|` | derived |
| `N` | Requested pool size | `config.poolSize` |
| `k` | `megasRequiredPerTeam`, 0..r | `config.megasRequiredPerTeam` (new, D-08) |
| `q` | Mega quota for the draw = `p × k` | derived |

**`r` is not host-configurable in Phase 2.** Verified by absence: 02-CONTEXT §Decisions lists
every config field and rounds is not among them; 02-UI-SPEC §Config screen's group table
(Players / Tournament / Mega rules / Bans / Pool) has no rounds control. `config.rounds`
already exists (`model.ts:45`) and stays at 6. DRFT-04 ("the compiled number of pick rounds")
is Phase 3. `[VERIFIED: absence in 02-CONTEXT.md and 02-UI-SPEC.md]`

### Pool sizing formula (DRFT-02, D-05)

```
Exact  N = p × r
×1.5   N = p × r × 3 / 2
×2     N = p × r × 2
```

At `r = 6` all three are integers for every `p` (`p × 6 × 3/2 = 9p`), so **no rounding rule
is needed in Phase 2**. Phase 3's variable `r` will need one — recommend `Math.ceil`, and
write it now so Phase 3 inherits it rather than discovering it.

**Surplus** — the figure DRFT-02's "leaving enough surplus for swaps" names:

| Preset | `N` at `p = 8` | Surplus `N − p×r` | Options for the final picker (`N − p×r + 1`) |
|--------|---------------|-------------------|---------------------------------------------|
| Exact | 48 | **0** | **1** ← D-14's warning fires here |
| ×1.5 | 72 | 24 | 25 |
| ×2 | 96 | 48 | 49 |

### The hard ceilings

Both ceilings follow from blockers F-04 and F-05 below. Nothing hardcodes them (D-17).

**Pool ceiling.** `p × r ≤ L` ⟹ with `b = 0`, `r = 6`, `R = 235`:

| Preset | `N(p)` | Max `p` | `N` at max |
|--------|--------|---------|-----------|
| Exact | `6p` | **39** | 234 |
| ×1.5 | `9p` | **26** | 234 |
| ×2 | `12p` | **19** | 228 |

`[VERIFIED: computed against roster.mb.json]` — 39 × 6 = 234 ≤ 235; 40 × 6 = 240 > 235.

**Mega ceiling.** `p × k ≤ M_L` ⟹ with `b = 0`, `M = 74`:

| `k` | Pool cap | Mega cap `⌊74/k⌋` | **Effective max `p`** |
|-----|----------|-------------------|----------------------|
| 0 | 39 | — | **39** |
| 1 | 39 | 74 | **39** |
| 2 | 39 | 37 | **37** |
| 3 | 39 | 24 | **24** |
| 4 | 39 | 18 | **18** |
| 5 | 39 | 14 | **14** |
| 6 | 39 | 12 | **12** |

`[VERIFIED]`

### Worst-case ban starvation

**Pool starvation** — the requested pool becomes unsatisfiable when

```
b > R − N          (equivalently: N > L)
```

At `p = 8`, `[VERIFIED]`:

| Preset | `N` | Max tolerable bans | Fails at |
|--------|-----|-------------------|----------|
| Exact | 48 | 187 | b = 188 |
| ×1.5 | 72 | 163 | b = 164 |
| ×2 | 96 | 139 | b = 140 |

**Mega starvation** — the Mega requirement becomes unsatisfiable when

```
b_mega > M − p × k        where b_mega = |B ∩ megaCapableIds|
```

At `p = 8`, `[VERIFIED]`:

| `k` | Need `q = 8k` | Max Mega-capable bans |
|-----|--------------|----------------------|
| 1 | 8 | 66 |
| 2 | 16 | 58 |
| 3 | 24 | 50 |
| 4 | 32 | 42 |
| 5 | 40 | 34 |
| 6 | 48 | 26 |

**The two starvation modes are independent.** A banlist of 30 that happens to be 30
Mega-capable species leaves the pool arithmetic untouched (`L = 205`, still ≥ 48) while
killing `k = 6` at 8 players (`M_L = 44 < 48`). This is why blocker F-06 counts
Mega-capable bans separately, and why `legalCount` and `megaCapableLegalCount` are two
numbers, not one derived from the other.

### Pool-dry mid-draft: proven impossible

**Claim:** once `pool/built` is emitted with `|ids| = N` distinct ids and `N ≥ p × r`, the
draft cannot run out of Pokémon.

**Proof, grounded in the shipped reducer:**

1. `canApply(POOL_BUILT)` rejects `duplicatePoolIds` — `new Set(ids).size !== ids.length`
   (`reduce.ts:137`). So `|ids|` is a true cardinality.
2. `canApply(DRAFT_STARTED)` rejects unless `order.length === config.players.length`, the
   order has no duplicates, and every id is a configured player (`reduce.ts:146-149`). So
   the rotation length is exactly `p`.
3. `selectIsComplete` is true when every configured player holds ≥ `r` picks
   (`selectors.ts:82-93`), and `selectCurrentTurn` returns `null` from that point
   (`selectors.ts:105`). So the draft terminates after exactly `p × r` picks.
4. `selectAvailablePool` is `poolIds` minus the set of picked `monId`s (`selectors.ts:40-43`),
   and `canApply(DRAFT_PICK_MADE)` rejects `notInPool` (`reduce.ts:167`), so each accepted
   pick removes exactly one distinct id.
5. Therefore available count before the 0-based pick `j` is exactly `N − j`. The last pick
   is `j = p × r − 1`, at which available = **`N − p×r + 1`**.

**Corollaries the planner can use directly:**

- Available ≥ 1 throughout ⟺ `N ≥ p × r` ⟺ blocker F-05 holds. **F-05 is exactly the
  pool-dry guarantee**, not merely a sanity check.
- The final picker's option count is exactly `N − p×r + 1`. At Exact that is **1**, which is
  precisely D-14's warning and 02-UI-SPEC's warning copy.
- Undo does not weaken the bound: `undoLast` removes a `draft/pickMade` action
  (`undo.ts:92-100`) and the state re-folds, returning the id to `selectAvailablePool`.

**The one way to reach pool-dry: an imported document.** `import-guard.ts` deliberately
performs no referential integrity — its own comment at the `draft/started` case says "Checking
it against the configured roster would be referential integrity, which this function
deliberately does not do … A bound is not an integrity check." A hand-written file declaring
8 players × 6 rounds with a 3-id `pool/built` passes every bound (`MAX_PLAYERS 64`,
`MAX_ROUNDS 24`, `MAX_POOL_IDS 5000`) and folds cleanly, then stalls at pick 4 with silent
`notInPool` rejections and an empty pool pane. See Open Question 3.

### The complete failure-case enumeration

Ten distinct cases. The first seven are 02-UI-SPEC §Feasibility bar's declared precedence
order; **F-08, F-09 and F-10 are gaps this research found and the planner must close.**

| # | Predicate | Severity | Copy (02-UI-SPEC §Feasibility reasons) |
|---|-----------|----------|----------------------------------------|
| F-01 | `p < 2` | blocking | `Add at least one more player. A draft needs two players.` |
| F-02 | `∃i: players[i].name.trim() === ''` | blocking | `Every player needs a name. Player {i} is blank.` |
| F-03 | `∃i≠j: norm(name_i) === norm(name_j)` | blocking | `Two players are both called "{name}". Give each player a different name.` |
| F-04 | `N > L` | blocking | `Pool is too large. Only {legal} Pokémon are draftable after {b} bans; the pool is set to {n}.` |
| F-05 | `N < p × r` | blocking | `Pool is too small. {p} players × {r} rounds needs {n} Pokémon; the pool is {m} after {b} bans.` |
| F-06 | `p × k > M_L` | blocking | `Not enough Mega-capable Pokémon. {p} players × {n} Megas needs {x}; {y} are draftable after {b} bans.` |
| F-07 | `N === p × r` | **warning** | `Warning — the pool is exactly {n}. The last player to pick in Round {r} will have one Pokémon to choose from.` |
| **F-08** | **`!Number.isSafeInteger(N) \|\| N < 1`** | **blocking** | **NEW — see below** |
| **F-09** | **`!Number.isSafeInteger(k) \|\| k < 0 \|\| k > r`** | **blocking** | **NEW — see below** |
| **F-10** | *(not a reason — a computation fix)* | — | `L` and `M_L` must be **set** operations |

Plus the all-clear line: `{p} players, {r} rounds, {n} Pokémon in the pool.`

#### F-08 — the NaN hole (highest-severity gap found)

D-06 makes the pool-size override "a free numeric input. No clamping." In the DOM,
`<input type="number">` with an empty value yields `valueAsNumber === NaN`, and
`Number('')` is `0` while `Number('  ')` is also `0` and `Number('4e')` is `NaN`.

**Both F-04 and F-05 silently pass on `NaN`**, because `NaN > 235` is `false` and
`NaN < 48` is `false`. The gate reports all-clear, Start enables, and `drawPool` is asked
for `NaN` entries. Similarly `48.5` passes both.

`[VERIFIED: IEEE-754 / ECMAScript comparison semantics — every relational comparison with NaN
is false]`

**Required:** an explicit blocker, and it must sit **before** F-04 in the precedence order so
the host sees a reason about the field they are typing in rather than one about bans.
Suggested copy, matching the contract's register:

> `Pool size needs a whole number. Enter how many Pokémon the pool should hold.`

The same hole exists on `Megas required per team` (F-09) and, less severely, on any future
numeric field. **Recommendation:** the gate's input type should make it unrepresentable —
have the config screen parse each numeric field once into `number | null` and have
`checkFeasibility` take `poolSize: number | null`, so `null` is a case TypeScript forces the
gate to handle rather than a value that silently satisfies comparisons.

#### F-09 — `megasRequiredPerTeam` above the round count

D-08 bounds `k` at `0..rounds`; 02-UI-SPEC specifies "numeric input, 0–6". **HTML's `max`
attribute does not prevent typing a larger value** — it only makes the input
`:invalid`. `[ASSUMED — standard HTML form-control behaviour, not re-verified in a browser
this session]`

F-06 catches large `k` only when `p × k > 74`. At `p = 2, k = 9`: `18 ≤ 74`, F-06 passes;
`N = 12` at Exact, and the draw is asked for a quota of 18 Megas inside a 12-entry pool.

Note the useful lemma: **when `k ≤ r` and F-05 holds, `q ≤ N` is automatic**
(`q = p×k ≤ p×r ≤ N`). So `q > N` never needs its own blocker — *provided* `k ≤ r` is
enforced. F-09 is what makes that proviso true. Suggested copy:

> `A team has {r} slots, so at most {r} of them can be Megas. Lower the Megas required per team.`

#### F-10 — `legalCount` must be a set operation

`L = 235 − bans.length` is wrong in two ways:

1. **Duplicates.** Two input surfaces write one banlist (D-10). The ban-mode grid toggles
   (idempotent) but the typeahead adds; a host who types a name already banned by a grid
   click double-counts unless the write path dedupes. `L` then undercounts and F-04 fires
   spuriously.
2. **Non-roster ids.** Unreachable from the two Phase 2 surfaces, but reachable from an
   imported or migrated document, and certain after a regulation rotation.

**Required:** `L = |rosterIds \ B|` and `M_L = |megaCapableIds \ B|`, both computed from
`Set`s built from the roster on each recompute. Cost at 235 entries is negligible even at
D-16's every-keystroke cadence. And per C-7, the `Set` is a **computation-local** value — it
is never stored in the document.

### Precedence order, revised

The revision inserts the two new blockers and keeps the spec's rationale ("fixing the first
usually changes the rest"):

```
1. p < 2                                    F-01
2. a player name is blank                   F-02
3. two players share a name                 F-03
4. pool size is not a whole number ≥ 1      F-08   ← NEW
5. Megas required exceeds the round count   F-09   ← NEW
6. pool larger than the post-ban legal count F-04
7. pool smaller than players × rounds       F-05
8. more Megas required than exist post-ban  F-06
9. (warning) pool exactly players × rounds  F-07
```

F-08 and F-09 go above F-04/F-05 because they are *malformed input*, not *unsatisfiable
arithmetic*, and reporting an arithmetic problem computed from a malformed number produces a
sentence with `NaN` in it.

### A known legibility wart, stated rather than fixed

At the **Exact** preset, `N = p × r` identically, so F-05 (`N < p×r`) can never fire and F-04
(`N > L`) is the only pool blocker that can. A host who sets 40 players and leaves the default
preset sees:

> `Pool is too large. Only 235 Pokémon are draftable after 0 bans; the pool is set to 240.`

The real fix is "fewer players", and the sentence does not say so — though the numbers make it
recoverable, which is exactly D-15's design intent. **Recommendation:** the planner should
consider a distinct reason when the preset is Exact and `p × r > L`, e.g.

> `Too many players for the roster. {p} players × {r} rounds needs {n} Pokémon; only {legal} are draftable after {b} bans.`

This is an addition inside D-15's stated pattern (sentence plus numbers), not a change to any
locked decision. Flagged as Open Question 1 rather than asserted as required.

### Recommended module shape

```ts
// src/core/feasibility.ts — pure. No DOM, no clock, no randomness, no storage.

export type FeasibilityCode =
  | 'tooFewPlayers' | 'blankPlayerName' | 'duplicatePlayerName'
  | 'poolSizeNotAnInteger' | 'megasExceedRounds'
  | 'poolTooLarge' | 'poolTooSmall' | 'notEnoughMegas'
  | 'poolExactlyMinimum';

export interface FeasibilityProblem {
  code: FeasibilityCode;
  severity: 'blocking' | 'warning';
  /** Fully interpolated, verbatim from 02-UI-SPEC §Feasibility reasons. */
  message: string;
}

export interface FeasibilityInput {
  playerNames: readonly string[];
  rounds: number;
  /** null when the numeric field is empty or unparseable. */
  poolSize: number | null;
  megasRequiredPerTeam: number | null;
  bannedIds: readonly string[];
  entries: readonly RosterEntry[];   // core may import core/roster/types
}

export interface FeasibilityResult {
  blocked: boolean;
  /** Sorted by the declared precedence order. */
  problems: readonly FeasibilityProblem[];
  /** Derived figures the config readout also needs — computed once, here. */
  legalCount: number;
  megaCapableLegalCount: number;
  banCount: number;
}

export function checkFeasibility(input: FeasibilityInput): FeasibilityResult;
```

Taking `entries` rather than pre-computed counts is deliberate: it makes the caller unable to
pass an inconsistent `(legalCount, megaCapableLegalCount)` pair, which is D-06's "one authority
on what is satisfiable" applied one level down. The 02-UI-SPEC's `{n} other problems also block
the start.` line is `problems.filter(blocking).length - 1`.

---

## The Constrained Draw

CONTEXT leaves the implementation to discretion: "reject-and-redraw or a two-stage draw …
Both are pure and seeded; only reproducibility from the seed is non-negotiable." **This
research finds the choice is not actually free.**

### Reject-and-redraw hangs on configurations the gate passes

Draw `N` uniformly from `L`, count Mega-capable, redraw if `< q`. The count is
Hypergeometric(`L`, `M`, `N`). `[VERIFIED: computed exactly, L=235 M=74]`

| `p` | Preset (`N`) | `k` | `q` | P(a draw satisfies) | Expected redraws |
|-----|-------------|-----|-----|--------------------|------------------|
| 8 | Exact (48) | 1 | 8 | 0.997 | 1.0 |
| 8 | Exact (48) | 2 | 16 | 0.442 | 2.3 |
| 8 | Exact (48) | 3 | 24 | 2.14 × 10⁻³ | **468** |
| 8 | Exact (48) | 4 | 32 | **1.56 × 10⁻⁸** | **64,040,125** |
| 8 | Exact (48) | 5 | 40 | 4.50 × 10⁻¹⁷ | 2.2 × 10¹⁶ |
| 8 | Exact (48) | 6 | 48 | 2.21 × 10⁻³¹ | 4.5 × 10³⁰ |
| 8 | ×2 (96) | 5 | 40 | 4.16 × 10⁻³ | 241 |
| 4 | Exact (24) | 3 | 12 | 3.66 × 10⁻² | 27.3 |
| 4 | Exact (24) | 4 | 16 | 1.98 × 10⁻⁴ | 5,053 |

**Every row above passes the feasibility gate.** At `p = 8, k = 4`, F-06 checks
`32 ≤ 74` ✓ and F-05 checks `48 ≥ 48` ✓. Start enables, the host clicks it, and the browser
freezes. This is a correctness bug with a performance disguise, and it is exactly the class
`.planning/research/ARCHITECTURE.md` §Performance flags first
(`[CITED: ARCHITECTURE.md — "This is the first real failure mode and it is a correctness bug, not a performance one"]`).

### Two-stage partition draw — recommended

```
1. Partition candidates (roster minus bans) into  megaCapable  and  rest,
   both in the input's display order.
2. Select q = p × k ids uniformly from megaCapable   (partial Fisher-Yates, cursor advances q times)
3. Select N − q ids uniformly from (megaCapable \ chosen) ∪ rest   (partial Fisher-Yates)
4. Emit the union filtered back into the input order, so pool/built.ids is in dex order.
```

- **Always terminates.** O(L) work, exactly `N` rng draws, no loop bound needed.
- **Deterministic and reproducible** from `(seed, candidates, N, q)`; the cursor advance is
  a pure function of the inputs.
- **Feasible exactly when the gate says so:** stage 2 needs `q ≤ M_L` (F-06) and stage 3
  needs `N − q ≤ L − q`, i.e. `N ≤ L` (F-04). No third condition.

**Honest caveat on uniformity.** D-07 says "seeded **uniform** random draw". The two-stage
draw is uniform when `k = 0` — which is the default and the overwhelmingly common case,
because stage 2 selects nothing and stage 3 is a plain uniform `N`-subset draw. When `k > 0`
it is **not** uniform over the set of constraint-satisfying pools: a Mega-heavy pool has more
distinct (stage-2, stage-3) paths that produce it, so it is over-weighted. Uniformity over the
constrained set requires rejection sampling, which the table above rules out. State this in
the module's doc comment rather than claiming uniformity the code does not deliver.

### Ordering matters and is easy to get wrong

`selectAvailablePool`'s doc comment (`selectors.ts:36-39`) says: "the pool ids are built in
display order, so a filter that reordered them would reshuffle the grid under the host's
cursor on every pick." The current display order is `byDexOrder` (`app.tsx:111-116`) — `num`
ascending, tie-broken on `id`, because Rotom and its five appliances all share `num` 479.

**Therefore:** the draw selects a *set*, and the emitted `ids` array must be the ordered
candidate list filtered by set membership — never the shuffle's output order. Getting this
wrong produces a pool grid in random order, which is not obviously a bug on first sight and
is deeply annoying at a table.

### Recommended module shape

```ts
// src/core/draw.ts — pure.

export interface DrawInput {
  /** Roster entries in DISPLAY order, bans already removed by the caller. */
  candidates: readonly RosterEntry[];
  size: number;
  /** p × megasRequiredPerTeam. 0 means unconstrained. */
  megasRequired: number;
  seed: number;
  /** Where in the seed's stream to start. 0 for a fresh roll. */
  cursor?: number;
}

export interface DrawResult {
  /** Selected ids, in the candidates' display order. */
  ids: string[];
  /** D-09: recorded so Phase 3's RULE-09 gate reads it rather than recomputing. */
  megaCapableCount: number;
  /** The advanced cursor, so a caller that draws twice cannot reuse the stream. */
  cursor: number;
}

export function drawPool(input: DrawInput): DrawResult;
```

`megaCapableCount` is the D-09 figure. It is `≥ megasRequired` but usually larger, because
stage 3 draws from a set that still contains unused Mega-capable entries.

---

## Seeded Randomness at the Edge

### What exists today

| Piece | Location | Behaviour |
|-------|----------|-----------|
| `RngState` | `model.ts:56-59` | `{ seed: number; cursor: number }` on the document root |
| `nextInt(seed, cursor, max)` | `rng.ts:28-42` | Pure integer hash; returns `{ value, cursor: cursor + 1 }`. Throws `RangeError` for `max < 1` |
| `newSeed()` | `adapters/id.ts:18-22` | `crypto.getRandomValues` into a `Uint32Array`. Forbidden token under `src/core/` (`check-pure-core.mjs:70`) |
| Seed draw | `store.ts:180` | Once, in `createTournament`. `rng: { seed, cursor: 0 }` |
| `selectStartingOrder(seed, playerIds)` | `selectors.ts:135-152` | Sorts ids first (so the result depends on the *set*, not entry order), then Fisher-Yates from cursor 0 |
| Materialization | `store.ts:192-195` | `pool/built` carries actual ids; `draft/started` carries the resolved order |

`selectStartingOrder` **already does exactly what D-04 needs** — its doc comment says the
pre-sort makes the outcome depend on the set of players plus the seed, which is what makes a
re-roll meaningful and an entry-order change not.

### The warning already written into the codebase

`store.ts:163-166`, verbatim:

> "Phase 1 makes exactly one derivation and always from cursor 0, and because its result is
> materialized a replay never rolls again — so the cursor stays at 0 and stays honest. The
> first feature that needs a *second* draw (Phase 2's priority-card tie-breaks) must
> materialize the advanced cursor into the log as well, or two consumers will silently share
> one draw."

Phase 2 has exactly this problem, one phase earlier than the comment predicted: **two
independent, independently re-rollable derivations** — the pool draw (D-07) and the starting
order (D-04). Sharing one `(seed, cursor)` makes them collide.

### Why the collision is easier than it looks

Both rolls happen **before the document exists**. CONTEXT §Established Patterns: "Config
changes made *before* the tournament exists are pre-document form state; everything after is
an action." So both re-rolls are config-screen state, and `createTournament` is the single
moment either result becomes a fact.

Both results are also **materialized** (ARCHITECTURE Pattern 5): `pool/built.ids` and
`draft/started.order` carry the outcomes verbatim, and a replay reads them rather than
re-rolling. So reproducibility across reload/import/replay does not depend on the seed at all.

**Recommended shape:**

- The config screen holds **two independent seeds** as form state: `poolSeed` and `orderSeed`,
  each drawn by `newSeed()` at the impure edge, each re-drawn (not advanced) by its own
  re-roll button. Both consume their stream from cursor 0 via the existing pure functions.
  Independent re-roll is then trivially correct: re-rolling the pool cannot disturb the order.
- `doc.rng` stays `{ seed, cursor }`, drawn once at Start, reserved for Phase 3's
  priority-card tie-breaks. Nothing in Phase 2 advances it. The `store.ts:163` warning stays
  true and stays relevant.

**Where the two config-time seeds go — decide this explicitly.**

| Option | Shape | Pro | Con |
|--------|-------|-----|-----|
| **A. In the action payloads** (recommended) | `pool/built` gains `seed`; `draft/started` gains `seed` | Exactly ARCHITECTURE Pattern 5 — a materialized result carrying its provenance, same reason `pool/built` already carries `rosterVersion` and `checksum`. A Phase 3 re-roll emits a *new* `pool/built` with a new seed and contradicts no config field | `import-guard.buildLogEntry` rebuilds payloads field by field (`import-guard.ts:305-347`); an unlisted field is **silently dropped**. Both cases must be extended or a round-trip loses the seeds |
| B. In `RngState` | `{ seed, cursor, poolSeed, orderSeed }` | One place | `import-guard.buildDoc` rebuilds `rng` from two named fields (`import-guard.ts:424`) — same extension needed. And it stores config-time-only values on a lifetime-RNG object |
| C. Nowhere | Seeds are ephemeral form state, never persisted | Zero schema surface | SHEL-07 says "the seed is stored in state". Loses draw provenance for a Phase 5 recap (PERS-09) |

**Recommendation: A.** The extension is one field per case in `import-guard` plus a test.
`isFiniteNumber` already exists there as a helper. C is defensible — reproducibility is
already guaranteed by materialization — but it reads as a quiet retreat from SHEL-07's literal
text. This is Claude's discretion territory; the planner should pick one and record the choice.

### Purity check on the whole path

Every ambient read stays outside `src/core/`:

- `newSeed()` → `adapters/id.ts` (already)
- `now()` → `adapters/clock.ts` (already, stamped by `dispatch`)
- `newId()` for player ids → `adapters/id.ts` — **new consumer this phase.** Player ids are
  currently the literals `'p1'`/`'p2'` (`store.ts:50-53`). Host-authored players need
  generated ids, and per sync rule 9 they are generated **at the edge and passed in**, never
  inside a reducer.
- `drawPool` and `selectStartingOrder` take `seed` as an argument. Pure.

---

## Phase 1 Inventory

Everything below was read from disk this session. Line numbers are current as of
commit `6a71817`.

### `src/core/` — pure logic

| File | Exports the planner will touch | Notes |
|------|-------------------------------|-------|
| `model.ts` | `SCHEMA_VERSION = 1` (:28), `PlayerConfig` (:30), `TournamentConfig` (:42), `RngState` (:56), `TournamentDoc` (:61), `DraftPick` (:82), `DraftState` (:98), `copyConfig` (:110), `initialState` (:121) | **`copyConfig` must deep-copy every new field**, including the ban array. It currently copies five fields by hand — a new field silently missing from it becomes an aliasing bug that only shows up under undo |
| `actions.ts` | `POOL_BUILT`, `DRAFT_STARTED`, `DRAFT_PICK_MADE`, `DRAFT_PICK_UNDONE`; `ActionEnvelope {seq, at, actorId}` (:32); creators (:99-128); payload guards (:150-177) | Creators return **payload only**; `dispatch` stamps the envelope. Every guard is a real structural check, not a discriminant test — extend the guard whenever the payload gains a field |
| `reduce.ts` | `apply` (:69), `canApply` (:131), `fold` (:198), `RejectionReason` (:41) | `apply` is total and tolerates unknown types; `canApply` refuses them. `RejectionReason` strings are "closer to an API than to a log message" — adding one is a deliberate act |
| `selectors.ts` | `selectPickCount` (:30), `selectAvailablePool` (:40), `selectTeams` (:63), `selectIsComplete` (:82), `selectCurrentTurn` (:103), `selectPlayerName` (:119), `selectStartingOrder` (:135) | **All five draft selectors already generalize to N players and R rounds with zero change.** `selectCurrentTurn` uses `pickIndex % order.length` and `floor(pickIndex / order.length) + 1` |
| `rng.ts` | `nextInt` (:28), `RngDraw` (:21) | Throws `RangeError` for `max < 1` — deliberate, so an empty-range draw surfaces at the call site |
| `undo.ts` | `lastPickAction` (:63), `canUndo` (:76), `undoLast` (:92) | `lastPickIndex` scans backward for a `draft/pickMade` specifically, "because Phase 2 interleaves priority-card plays, bans and swaps into the same log" |
| `migrate.ts` | `SUPPORTED_SCHEMA_VERSIONS = [1]` (:32), `MigrateResult`, `migrate` (:51) | Currently a passthrough. Comment: "When version 2 arrives, this becomes a chain of small upgrade steps and each one gets its own test" |
| `import-guard.ts` | `MAX_IMPORT_BYTES` 5 MB (:72), `MAX_LOG_ENTRIES` 20000 (:81), `MAX_ROUNDS` 24 (:97), `MAX_PLAYERS` 64 (:107), `MAX_POOL_IDS` 5000 (:117); `isValidTournament` (:444), `parseTournamentFile` (:457) | **Allow-list rebuild** — a field this file does not name cannot reach state. Every new config field needs a line here or it is dropped on import |
| `roster/types.ts` | `BaseStats`, `RosterEntry` (:84), `MegaForme` (:68), `RosterSnapshot` (:152), `RosterCounts` (:103) | Types-only module, fully erased at runtime. `RosterEntry` carries `types: string[]`, `baseStats`, `megaCapable`, `megaFormes[]`, `spriteId`, `spriteMissing` — **everything DRFT-05, DRFT-09 and DRFT-15 need is already there** |
| `export/paste.ts` | `toShowdownPaste` | Not touched this phase except that `CompletedDraft` now renders N panels |

### `src/adapters/` — the impure edge

| File | Relevant surface |
|------|-----------------|
| `id.ts` | `newSeed()` (:18), `newId()` (:44) — `randomUUID` with a `getRandomValues` fallback for insecure contexts |
| `clock.ts` | `now()` |
| `persistence.ts` | `STORAGE_KEY = 'champions-drafter:tournament'` (:38), `PROBE_KEY` (:41), `AUTOSAVE_DEBOUNCE_MS = 300` (:51), `probeStorage()` (:120), `save()` (:159), `load()` (:204), `loadIfNewer()` (:269), `startAutosave()` (:377), `savingBlocked` signal (:90). Record shape `{schemaVersion, generation, savedAt, doc}` (:74) |
| `roster-source.ts` | `loadRoster()` (:159) → `{ snapshot, spriteMeta }`; `SpriteMeta.byRosterId` (:45); `ROSTER_LOAD_FAILURE_MESSAGE` (:22) |
| `file-io.ts` | `downloadJson`, `readJsonFile`, `tournamentFilename` |
| `tab-lock.ts` | `claimOwnership`, `isOwner`, `notifySaved`, `disposeTabLock`, `CLAIM_WINDOW_MS` |

**The view-preference key `champions-drafter:view` (D-20) does not exist yet** and belongs
here, beside `STORAGE_KEY`, per 02-UI-SPEC §View preferences in storage.

### `src/store.ts` — the one write path

| Symbol | Line | Contract |
|--------|------|----------|
| `ACTOR_HOST = 'host'` | 46 | Stamped on every action |
| `PHASE_ONE_ROUNDS = 6`, `PHASE_ONE_PLAYERS` | 49-53 | **The scaffolding this phase deletes.** Comment: "Phase 2 configures both" |
| `tournamentDoc`, `draftState` | 59, 64 | `ReadonlySignal`s. Components read them and re-render automatically |
| `getDoc()`, `getState()` | 66, 70 | `.peek()` — for non-render reads |
| `subscribe(listener)` | 81 | For non-component consumers (the autosave) |
| `nextSeq(log)` | 110 | `max(seq) + 1` — **C-6** |
| **`dispatch(intent): CanApplyResult`** | **118** | Stamp → validate → append → advance. Returns the `canApply` result. Rejected actions never enter the log |
| **`createTournament(snapshot, entries)`** | **168** | **The seam the config screen replaces.** Synthesizes config from constants; draws the seed; emits `pool/built` then `draft/started` |
| `adoptTournament(doc)` | 211 | Refuses `schemaVersion !== SCHEMA_VERSION`; re-folds from scratch |
| `undo(resolveSpeciesName?)` | 275 | The deliberate second write path. `isOwner()`-gated (`dispatch` deliberately is not — see the long comment at :261) |

**`createTournament`'s new signature.** It must take a host-authored config plus the drawn
pool ids plus the resolved order, and stop inventing any of them. Something like:

```ts
export function createTournament(input: {
  config: TournamentConfig;      // host-authored, ids already generated at the edge
  poolIds: readonly string[];    // drawPool output, in display order
  order: readonly string[];      // selectStartingOrder output
  rosterVersion: string;
  checksum: string;
  poolSeed: number;              // if Option A above is taken
  orderSeed: number;
}): TournamentDoc | null;
```

Note the ordering constraint inside it: `docSignal`/`stateSignal` must be set **before** the
two `dispatch` calls, because `dispatch` returns `{ok: false, reason: 'draftNotStarted'}` when
either signal is null (`store.ts:121-123`).

### `src/ui/` — components

| Component | Status | What this phase does to it |
|-----------|--------|---------------------------|
| `PoolGrid.tsx` (46 lines) | **extend** | Its own doc comment names this phase's additions verbatim. `{n} available` already derives from `entries.length`, so it follows a filter for free. Also the ban-mode surface (D-10) |
| `MonCard.tsx` (55 lines) | **extend** | Comment: "Phase 2 adds typing and base stats here (DRFT-05). The props are shaped so that is an addition rather than a rewrite." `alt=""` is deliberate and documented — `MonCard` always renders its name so it stays correct |
| `MonCard.css` | **extend** | `height: var(--cell-h)` → `min-height`, per 02-UI-SPEC §Density Contract |
| `PoolGrid.css` | mostly unchanged | `repeat(auto-fill, minmax(var(--cell-min), 1fr))` with `gap: var(--space-2)`. `auto-fill` not `auto-fit` is load-bearing and documented |
| `MonChip.tsx` (42 lines) | **extend** | `showName` prop. **D-21's `alt` rule is the single most breakable contract in the phase** — `alt={entry.name}` iff `showName === false` |
| `TeamStrip.tsx` (63 lines) | **extend** | Returns a **fragment** so its cells land in the parent grid — no `display: contents`, deliberately. Passes `showName` through |
| `BoardGrid.tsx` (106 lines) | **extend** | `ROUND_LABELS` (:29) is a literal array of 6 with an `R${round}` fallback (:32) — already survives a different round count. Label column 160px → 176px. Empty-state body names the first player |
| `TurnBanner.tsx` (76 lines) | **extend** | `DRAFT_COMPLETE_COPY` and `Round ${round} of 6` are literals (:36, :53); both become derived from config. Mirrors into `announce` via `useEffect` on the spoken string |
| `TopBar.tsx` | **extend** | `Bans ({n})` disclosure; `Abandon draft`; undo through the D-37 round-boundary gate. Registers `Ctrl+Z` on `document` with an `isOwner()` guard (:126) — **the new confirm must sit inside `handleUndo`, not only on the button**, or the keyboard path bypasses it |
| `Dialog.tsx` (149 lines) | **unchanged** | Focus moved-in / trapped / restored, all three implemented (:72-79, :81-125). `role="alertdialog"`, `aria-modal`, `tone: 'default' \| 'danger'`, `dismissible` |
| `ImportConfirmDialog.tsx` | **refactor** | Rebuilt on the new `ConfirmDialog` so there is one pattern |
| `LiveRegion.tsx` (39 lines) | **unchanged** | Module-level `message` signal. **Documented limit:** byte-identical consecutive announcements are silent, and clearing first does not fix it because Preact batches. 02-UI-SPEC shows the duplicate-name blocker (F-03) is what protects this |
| `CompletedDraft.tsx` | **extend** | Per-player export panels built for two; N panels stack in the pool pane |
| `sprite-src.ts` | **unchanged** | `resolveSpriteFile`, `spriteSrc`, `placeholderSrc`, `handleSpriteError`. **C-5's enforcement lives here** |
| `tokens.css` (82 lines) | **extend + amend** | Two stated contracts are broken this phase (`:10-11` four-token density, `:80` reserved-colour). Both comments must change in the same commit |

### `src/app.tsx` (552 lines) — the orchestration to restructure

| Line | Thing | Phase 2 impact |
|------|-------|---------------|
| 111-116 | `byDexOrder` | Stays. It is the display order the draw must preserve |
| 130-145 | `handlePick` | Unchanged. Reads the turn from a selector, dispatches, owns no rule |
| 156 | `probeStorage()` in a `useState` initializer | D-01 moves the **blocking screen** to the landing screen. The probe itself can stay — it is synchronous and cheap |
| 197-200 | `entries` memo — all 235, sorted | Stays as the roster; the *pool* becomes a subset |
| 205-226 | Boot effect: restore-or-create, then `startAutosave` | **D-01 replaces this.** Comment at :214 ("Restore before creating, never after") records a constraint that dissolves once restore and create are two distinct user actions. But `load()` must still be probed at landing to decide whether `Resume saved draft` renders, and to build its description line |
| 253-265 | `claimOwnership` effect | Unchanged |
| 276-288 | `entryById` map + `availableEntries` memo | The filter/search predicates compose here |
| 314-426 | Download / import flow, `IMPORT_WRONG_SHAPE`, `IMPORT_NEWER_SCHEMA` | Import gets a front door (D-01). If Phase 1 saves are **rejected** rather than migrated, a third sentence is needed — see Open Question 2 |
| 479 | `inert={readOnly ? true : undefined}` | The read-only mechanism. New surfaces must sit inside or outside it deliberately; note the comment at :536 explaining why dialogs render **outside** |

### `tests/` — patterns to follow

```
tests/core/{selectors,reduce,rng,undo,migrate,import-guard}.test.ts
tests/core/roster/{transform,fixtures}.test.ts
tests/core/export/paste.test.ts
tests/adapters/{persistence,tab-lock}.test.ts
tests/ui/{completed-draft,import-export-controls,read-only-banner,read-only-shell}.test.tsx
tests/ui/sprite-resolution.test.ts     ← reads the REAL committed data and the REAL files on disk
tests/build/{sw-manifest,sw-behaviour}.test.ts
tests/check-pure-core.test.ts
tests/store-ownership.test.ts
```

- Default env `node` (`vite.config.ts:16`). UI tests start with `// @vitest-environment happy-dom`
  **on line 1**.
- `tests/core/selectors.test.ts` shows the shape: a module-level `CONFIG`, a `POOL` of real
  roster ids, and a local `stamp(intent, seq)` helper that adds the envelope by hand. **Copy
  this.** New core tests should not reach for the store.
- `tests/ui/sprite-resolution.test.ts` is the model for a data-fixture test: it walks the
  committed roster against files on disk. **A test asserting the roster still has exactly 2
  dual-Mega species and 74 Mega-capable entries belongs in this family** — it is the tripwire
  that catches a regulation rotation breaking D-03's two-row control.

---

## Rendering ~235 Pool Cells at Three Densities

### Phase 1 already shipped the 235-cell case

`createTournament(load.bundle.snapshot, entries)` (`app.tsx:217`) passes **all 235 sorted
entries** as the pool, and `PoolGrid` renders every one. `01-VERIFICATION.md` records the
deployed site verified end-to-end with no performance observation of any kind, and
`sw-manifest.test.ts` confirms 312 sprite files precached.

**So the 235-cell render is not a new risk — it is a shipped, verified behaviour.**
`[VERIFIED: app.tsx:217 + 01-VERIFICATION.md]`

What *is* new is content-per-cell at `full` density, and the ban grid's 235 cells living
inside a `max-height: 60vh` scroll region.

### Node arithmetic (the thing that actually changes)

| Density | Elements per cell | 235 cells | 48-cell live pool |
|---------|------------------|-----------|-------------------|
| minimal | button + img + name ≈ **3** | ~705 | ~144 |
| standard | + 1–2 pills + total line ≈ **7** | ~1,645 | ~336 |
| full | + `<dl>` with 6 `<dt>`/`<dd>` pairs ≈ **20** | **~4,700** | ~960 |

`[VERIFIED: 02-UI-SPEC §Density Contract content table + 150 two-type / 85 one-type entries
measured this session]`

~4,700 elements is a large-but-ordinary DOM. The worst case is the **config ban grid at
`full` density** — and note it is genuinely reachable, because D-10 reuses `PoolGrid` whole
including the shared density preference, so a host who set `full` on the draft screen gets it
on the ban grid too.

**The live draft pool is 48–96 cells** (02-UI-SPEC §6). Filtering and search only ever operate
on that.

### Keying

`PoolGrid` already keys by `entry.id` (`PoolGrid.tsx:41`). That is correct and stable under
filtering — Preact's keyed reconciliation reuses the surviving nodes and only creates/destroys
the delta. **Do not change it.** In particular do not key by array index; a filter change
would then rewrite every cell's contents in place, which is both slower and breaks the
focus-restoration contract below.

### Filter and search recomputation cost

**The key finding: `toID(entry.name) === entry.id` for all 235 entries and all 76 Mega formes.**
`[VERIFIED: computed this session with `s.toLowerCase().replace(/[^a-z0-9]+/g,'')`; 0 mismatches]`

This is not a coincidence — `roster/types.ts:35` documents `RawSpecies.id` as "Showdown
`toID`: lowercase, `[^a-z0-9]+` stripped. THE identity key", and the transform carries it
through. Consequences:

1. **The search predicate needs no per-entry normalization.** Normalize the *query* once per
   keystroke, then `entry.id.includes(normalizedQuery)`. 235 `String.prototype.includes` calls
   is sub-millisecond by any measure.
2. **It satisfies every D-32 example directly:** `mr rime` → `mrrime` ⊂ `mrrime` ✓;
   `rotom` matches all five appliances ✓; `aqua` ⊂ `taurospaldeaaqua` ✓; `wash` ⊂ `rotomwash` ✓.
3. **It obeys C-4 with no effort** — no name splitting, no `split('-')`, and the thing being
   matched is the identity key rather than a display string.
4. **Do NOT hardcode the equality as an assumption.** Write the predicate to normalize
   `entry.name`, and add a test asserting `toID(name) === id` across the whole committed
   snapshot. If a future regulation ever breaks it, the test fails loudly instead of search
   silently missing a species. (Cost of normalizing 235 names per keystroke is still trivial;
   the id shortcut is an optimization, not a correctness dependency.)

Type filter: `entry.types.some(t => selected.has(t))` (OR) or `.every(...)` over the selection
(AND). At most 2 types per entry (verified: zero entries have >2). Mega filter: one boolean
field read. Combined per-keystroke cost across 235 entries is well under a frame.

**The real cost is the re-render, not the predicate.** Keep the filtered list in a single
`useMemo` (or a `computed`) keyed on `[availableEntries, query, selectedTypes, matchAll,
megaMode]` so one keystroke produces one recomputation and one render, not one per filter.

### Is `content-visibility: auto` warranted?

**No — do not ship it.** 02-UI-SPEC §6 already states this and names it as "the one sanctioned
escape hatch". Two reasons to keep it unshipped, both concrete:

1. **Phase 1 already renders 235 cells with no observed problem.** Adding a mitigation for a
   problem that has not appeared is how a codebase acquires unexplainable CSS.
2. **It conflicts with the `min-height` change.** `content-visibility: auto` requires
   `contain-intrinsic-size` to supply a size for skipped subtrees. 02-UI-SPEC changes
   `MonCard.css` from `height: var(--cell-h)` to `min-height: var(--cell-h)` precisely because
   a wrapped pill row can exceed `--cell-h` at `full` density. A skipped cell would then be
   measured at `--cell-h` and a rendered one taller, producing scrollbar jitter as rows enter
   and leave the viewport. If it is ever adopted, the intrinsic height and the real height must
   be reconciled first. `[ASSUMED — CSS Containment spec behaviour; not measured in a browser
   this session]`

If it does become necessary, the sanctioned form is exactly
`content-visibility: auto; contain-intrinsic-size: var(--cell-min) var(--cell-h);` on
`.mon-card`, and nothing else.

### Two rendering contracts that are easy to drop

- **Focus after a pick** (02-UI-SPEC §8): the picked cell's DOM node is removed, so focus must
  move to the cell now occupying that grid position, or the last cell if the pool shrank at the
  end. Without it, a keyboard pick drops focus to `<body>`. This interacts with D-35 — filters
  clear on the same commit, so the whole list changes in that render and the focus move must
  run **after** it.
- **Column count for arrow-key Up/Down** must be read from the rendered grid, not assumed.
  `auto-fill` means the app does not know it statically. 02-UI-SPEC names this as one of
  exactly two legitimately-UI-layer items.

---

## Schema Bump and Migration

### The new `TournamentConfig`

| Field | Type | Default | Bound for `import-guard` |
|-------|------|---------|--------------------------|
| `formatLabel` | `string` | `Champions {regulation}` | existing |
| `players` | `PlayerConfig[]` | — | existing, `MAX_PLAYERS` 64 |
| `rounds` | `number` | 6 | existing, `MAX_ROUNDS` 24 |
| `rosterVersion`, `rosterChecksum` | `string` | — | existing |
| **`poolSize`** | `number` | `players.length × rounds` | positive integer ≤ `MAX_POOL_IDS` |
| **`bans`** | `string[]` | `[]` | `copyStringArray(raw, MAX_POOL_IDS)`; **dedupe on write** |
| **`banMode`** | `'hostBanlist' \| 'blind' \| 'snake'` | `'hostBanlist'` | literal union |
| **`megasRequiredPerTeam`** | `number` | `0` | non-negative integer ≤ `MAX_ROUNDS` |
| **`dualMegaChoices`** | see below | `[]` | see below |
| **`depth`** | `'draftOnly' \| 'draftAndBrackets' \| 'draftBracketsAndLog'` | `'draftOnly'` | literal union |

**On `dualMegaChoices` — prefer an array over a record.** A `Record<speciesId, 'x'|'y'|'either'>`
is the obvious shape and has two problems: sync rule 14 forbids order-sensitive `Object.keys()`
iteration, and an unbounded key count is an unbounded allocation the import guard must bound
separately. An array is order-explicit, validates with the existing helper patterns, and
sidesteps both:

```ts
export interface DualMegaChoice {
  speciesId: string;
  forme: 'x' | 'y' | 'either';
}
```

Whichever shape is chosen: rows render from `megaFormes.length > 1`, never a hardcoded list
(D-03), so an absent entry means `'either'` and a stale entry (post-rotation) is ignored.

### `copyConfig` is a trap

`model.ts:110-118` copies exactly five fields by hand. Every new field must be added, and the
two array fields must be **deep**-copied (`bans.map(id => id)`, `dualMegaChoices.map(c => ({...c}))`).
A missed field is not a type error — `copyConfig`'s return type is `TournamentConfig`, so
TypeScript catches an omission at the object literal. `[VERIFIED: it is an explicit object
literal, so `strict` will error on a missing required field]` — good, the compiler protects
this one. But it will **not** catch a shallow array copy, which is the real hazard: the folded
state would alias the caller's array, and `initialState` is called on every `fold` (which
means every undo).

### Migrate or reject?

`SUPPORTED_SCHEMA_VERSIONS = [1]` and `SCHEMA_VERSION = 1` today. **Recommendation: bump to 2
and migrate.** Every new field has a lossless default derivable from a v1 document:

| Field | v1 → v2 derivation |
|-------|-------------------|
| `bans` | `[]` — a v1 tournament had no bans |
| `banMode` | `'hostBanlist'` |
| `megasRequiredPerTeam` | `0` |
| `dualMegaChoices` | `[]` — all default to `'either'` |
| `depth` | `'draftOnly'` |
| `poolSize` | the length of the `pool/built` action's `ids`, which is materialized in the log — **this is not a guess, it is the number that actually produced the pool** |

Rejecting instead costs a **third** import failure sentence. The two that exist
(`app.tsx:80-83`) are "not a Champions Drafter tournament" and "saved by a newer version" —
neither is true of a v1 file, so shipping rejection without new copy would show the host a
false statement about their own file. Migration costs one function plus its test.

Also note `persistence.load()` (`persistence.ts:222`) checks
`parsed['schemaVersion'] !== SCHEMA_VERSION` on the **wrapper record**, before
`isValidTournament` runs. A v1 wrapper would be dropped there regardless of what `migrate`
says about the inner doc. Both call sites must be updated together, or `Resume saved draft`
silently never appears for a Phase 1 save.

`adoptTournament` (`store.ts:212`) has the same shape: `if (doc.schemaVersion !== SCHEMA_VERSION) return false`.
It must run `migrate` instead of comparing.

**Three places compare `schemaVersion` today:** `store.ts:212`, `persistence.ts:222`,
`import-guard.ts` (via `migrate`). All three must agree after the bump.

---

## Architecture Patterns

### System architecture

```
                    ┌─────────────────────────────────────────────────┐
   host input ─────▶│  src/ui/  ConfigScreen (pre-document form state) │
                    │    playerNames, formatLabel, depth, banMode,     │
                    │    bans[], poolPreset, poolSizeOverride,         │
                    │    megasRequiredPerTeam, dualMegaChoices         │
                    └───────────┬──────────────────────┬──────────────┘
                                │ every keystroke      │ Randomize / Re-roll pool
                                ▼                      ▼
              ┌──────────────────────────┐   ┌────────────────────────────┐
              │ src/core/feasibility.ts  │   │ src/adapters/id.ts         │
              │  checkFeasibility(...)   │   │  newSeed()  ← the ONLY     │
              │  → problems[], counts    │   │  ambient read on this path │
              └────────────┬─────────────┘   └─────────────┬──────────────┘
                           │ blocked / reason              │ poolSeed, orderSeed
                           ▼                               ▼
              ┌──────────────────────────┐   ┌────────────────────────────┐
              │ FeasibilityBar           │   │ src/core/draw.ts drawPool  │
              │  Start aria-disabled     │   │ src/core/selectors.ts      │
              │  + role="status" reason  │   │   selectStartingOrder      │
              └────────────┬─────────────┘   └─────────────┬──────────────┘
                           │  Start draft (only when !blocked)            │
                           └───────────────┬─────────────────────────────┘
                                           ▼
                           ┌───────────────────────────────────────┐
                           │ src/store.ts  createTournament(...)   │
                           │  stamps id, createdAt, rng.seed       │
                           │  dispatch(poolBuilt(ids, ...))        │  ← MATERIALIZED
                           │  dispatch(draftStarted(order))        │  ← MATERIALIZED
                           └───────────────┬───────────────────────┘
                                           ▼
                           ┌───────────────────────────────────────┐
                           │  TournamentDoc { config, rng, log[] } │
                           │  docSignal  ──▶  persistence.save()   │
                           │      │           (debounced 300ms,    │
                           │      │            isOwner()-gated)    │
                           │      ▼                                │
                           │  fold(doc) ──▶ stateSignal            │
                           └───────────────┬───────────────────────┘
                                           ▼
       ┌───────────────────────────────────────────────────────────────────┐
       │  src/core/selectors.ts   (nothing derived is ever stored)          │
       │   selectAvailablePool · selectTeams · selectCurrentTurn ·          │
       │   selectIsComplete · selectPickCount · selectPlayerName            │
       └───────┬──────────────────────────────────────────┬────────────────┘
               │ pool ids                                 │ teams, turn
               ▼                                          ▼
   ┌───────────────────────────┐              ┌──────────────────────────┐
   │ pool pane (≈60%)          │              │ board pane (≈40%)        │
   │  FilterBar → predicates   │              │  BoardGrid → TeamStrip   │
   │   (pure, src/core)        │              │   → MonChip              │
   │  PoolGrid → MonCard       │              │  board__cell--next       │
   │   click ──▶ handlePick ───┼──────────────┼──▶ dispatch(pickMade)    │
   └───────────────────────────┘              └──────────────────────────┘
               ▲                                          ▲
               └───── D-35: filters clear on commit ──────┘

   src/adapters/persistence.ts also owns 'champions-drafter:view'
     { density, pane }  ← NEVER enters TournamentDoc (D-20, sync rule 3)
```

### Pattern 1: Pure gate, rendered reason

**What:** the feasibility gate returns data (`code`, `severity`, fully-interpolated `message`),
and the bar renders the first blocking problem plus a count of the rest.

**When to use:** every config-time validation in this phase and Phase 3's RULE-09.

```ts
// src/core/feasibility.ts — the precedence order is a declared array, not emergent
const PRECEDENCE: readonly FeasibilityCode[] = [
  'tooFewPlayers',
  'blankPlayerName',
  'duplicatePlayerName',
  'poolSizeNotAnInteger',   // F-08 — before the arithmetic reasons
  'megasExceedRounds',      // F-09
  'poolTooLarge',
  'poolTooSmall',
  'notEnoughMegas',
  'poolExactlyMinimum',     // warning
];
```

```tsx
// src/ui/components/FeasibilityBar.tsx
const blockers = result.problems.filter((p) => p.severity === 'blocking');
const shown = result.problems[0];           // already precedence-sorted
const extra = Math.max(0, blockers.length - 1);
// Start uses aria-disabled + stays focusable (02-UI-SPEC §Feasibility bar), NOT native disabled
```

### Pattern 2: One predicate, two consumers

**What:** the DRFT-08 pool search and the ban typeahead (02-UI-SPEC §4) use literally the same
exported function.

**Why:** two matchers drift. 02-UI-SPEC says so explicitly: "one predicate, one module, one
test suite. Not a second matcher that can drift."

```ts
// src/core/search.ts — pure
/** Showdown's toID: lowercase, strip everything that is not [a-z0-9]. */
export function toSearchKey(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** True when `entry` matches `query` under D-32's normalized substring rule. */
export function matchesName(entry: RosterEntry, normalizedQuery: string): boolean {
  if (normalizedQuery === '') return true;
  return toSearchKey(entry.name).includes(normalizedQuery);
}
```

Normalize the query **once per keystroke** at the call site, not once per entry.

### Pattern 3: Materialize, with provenance

**What:** `pool/built` already carries `ids`, `rosterVersion` and `checksum`
(`actions.ts:39-44`). The draw's result — and, if Option A is taken, its seed and Mega count —
join it.

**Why:** `store.ts:154-158` states it: "Champions regulations rotate roughly every 2.5 months;
a document that recorded only 'build a pool' would reopen next regulation as a different
tournament." D-09's recorded Mega-capable count is the same argument applied one field further.

### Pattern 4: Segmented control as a real fieldset

**What:** `<fieldset>` + `<legend>` + visually-hidden `<input type="radio">` + styled `<label>`.
Six instances (density, Mega capability, pool size, ban mode, depth, one per dual-Mega row).

**Why:** grouping, arrow-key navigation, one tab stop and `:checked` state all come from the
platform. 02-UI-SPEC: "Never a set of buttons with `aria-checked` hand-rolled."

### Anti-patterns to avoid

- **Putting the gate in the config component.** It has no forbidden token, so
  `check:pure` will not save you. Phase 3's RULE-09 then has nothing to compose with.
- **Storing the filtered pool, the legal count, or the Mega-capable count in the document.**
  Sync rule 3. `pool/built.ids` is materialized because it is an *external* result; a filter
  result is not.
- **Deriving `seq` from `log.length`.** C-6. `store.ts:110-116` explains why, and
  `import-guard.ts:366-385` accepts gaps deliberately.
- **Constructing a sprite URL from `entry.spriteId`.** C-5. Resolves for zero of 235, silently.
- **Reading `Object.keys()` on the dual-Mega map for anything order-sensitive.** Sync rule 14 —
  and the reason an array is recommended instead.
- **A second confirm-dialog pattern.** D-38. `Dialog.tsx` already solves focus trap, Escape
  and return-focus; a second implementation is where the a11y bug lands.
- **Guarding the undo confirm only on the button.** `TopBar` registers `Ctrl+Z` on `document`
  (`TopBar.tsx:132`), outside any `inert` subtree. The D-37 gate must live inside the shared
  `handleUndo`.

---

## Don't Hand-Roll

Inverted for this project: the default is to hand-roll, because C-1 caps runtime dependencies
at two. So this table lists what already exists **in this repository** that must be reused
rather than rebuilt.

| Problem | Don't build | Use instead | Why |
|---------|-------------|-------------|-----|
| Modal focus trap / Escape / return-focus | A second overlay | `src/ui/components/Dialog.tsx` | All three focus behaviours are implemented and commented. D-38 |
| Confirm-dialog copy pattern | Ad-hoc dialogs per action | One `ConfirmDialog` on top of `Dialog`, seven sets of copy | 02-UI-SPEC §11 gives every literal string as data |
| Seeded shuffle | A new Fisher-Yates | `selectStartingOrder` (`selectors.ts:135`) | Already pre-sorts ids so the result depends on the set, not entry order — exactly D-04's need |
| Seeded integer draw | `Math.random` (forbidden) or a new PRNG | `nextInt` (`rng.ts:28`) | Pure `(seed, cursor) → {value, cursor}`. Throws on an empty range deliberately |
| Sprite URL resolution | `sprites/${entry.spriteId}.png` | `spriteSrc(entry, spriteMeta)` (`sprite-src.ts`) | Resolves for zero of 235 otherwise; verified 404 on the deployed site |
| Untrusted-JSON validation | A schema library (violates C-1) | Extend `import-guard.ts`'s allow-list rebuild | 495 lines of considered defence: size gate before parse, poison-key reviver, allow-list rebuild, per-count bounds |
| Live-region announcements | A per-component `aria-live` | `announce()` from `LiveRegion.tsx` | Exactly one global polite region; a surface-local `role="status"` is the sanctioned second form |
| Turn / team / completion derivation | New logic in a component | `selectCurrentTurn`, `selectTeams`, `selectIsComplete` | All three already generalize to N players and R rounds |
| Board row vs "your team" panel | A second team component | `TeamStrip` **is** the board row | DRFT-10 and DRFT-11 are one surface. A second rendering is the shape that drifts |
| Pool virtualization | Any windowing library | Nothing — plain grid | C-1; CLAUDE.md rejects it by name; Phase 1 ships 235 cells verified |
| Drag-and-drop reordering | Any DnD library | Buttons | CLAUDE.md rejects it by name; D-19 chose discrete expand states for the same reason |
| ID generation | `nanoid` or similar | `newId()` (`adapters/id.ts:44`) | `randomUUID` with a `getRandomValues` fallback for insecure contexts (a phone on `http://192.168.x.x`) |

**Key insight:** every reuse above is also a **purity** decision. Rebuilding any of them inside
a component moves a rule out of `src/core/`, and `check:pure` cannot catch a rule that carries
no forbidden token. The gate protects the boundary; the reuse discipline protects the design.

---

## Common Pitfalls

### Pitfall 1: `NaN` passes every numeric feasibility check

**What goes wrong:** empty or malformed pool-size input yields `NaN`; both `NaN > L` and
`NaN < p×r` are `false`; the gate reports all-clear and Start enables.
**Why it happens:** D-06 mandates a free numeric input with no clamping, and IEEE-754 makes
every relational comparison with `NaN` false.
**How to avoid:** F-08 blocker, placed above F-04 in precedence. Type the gate's input as
`number | null` so the case is unrepresentable rather than merely handled.
**Warning signs:** an all-clear line reading `… , NaN Pokémon in the pool.`

### Pitfall 2: reject-and-redraw hangs on a passing configuration

**What goes wrong:** 8 players, 4 Megas required, Exact pool passes every blocker; a rejection
sampler needs ~6.4 × 10⁷ redraws.
**Why it happens:** the constraint is far out in the hypergeometric tail, and the gate checks
*existence* (`p×k ≤ M_L`), not *sampling tractability*.
**How to avoid:** two-stage partition draw. O(L), always terminates.
**Warning signs:** the tab freezes on `Start draft` and the profiler shows one long task.

### Pitfall 3: `legalCount` computed as `bans.length`

**What goes wrong:** duplicate ban ids undercount `L`, so F-04 fires spuriously and the host
cannot start a perfectly satisfiable draft.
**Why it happens:** two input surfaces write one list (D-10); only the grid toggle is idempotent.
**How to avoid:** set-difference against the roster id set, and dedupe on write.
**Warning signs:** `{n} of 235 banned` disagrees with the number in the F-04 sentence.

### Pitfall 4: the draw's output order becomes the pool's display order

**What goes wrong:** the pool grid renders in shuffle order instead of dex order.
**Why it happens:** the natural implementation returns the shuffle's prefix directly.
**How to avoid:** filter the ordered candidate list by set membership before emitting.
**Warning signs:** Rotom's five appliances scattered across the grid instead of adjacent.

### Pitfall 5: `MonChip`'s accessible name disappears in split view

**What goes wrong:** D-21 removes the name text from board cells in split view; `MonChip` sets
`alt=""` *because* that text supplied the accessible name. The cell ends up with none.
**Why it happens:** the two are one decision written as two independent props.
**How to avoid:** write them in one expression — `alt={showName ? '' : entry.name}` — never as
two props a caller can desynchronise. Test both branches.
**Warning signs:** an accessibility audit reporting an image with no accessible name inside a
board cell. 02-UI-SPEC calls this "the single most breakable contract in this phase".

### Pitfall 6: the undo confirm is bypassed by `Ctrl+Z`

**What goes wrong:** D-37's round-boundary confirm is wired to the button; the keyboard
shortcut skips it.
**Why it happens:** `TopBar` registers the listener on `document` (`TopBar.tsx:132`), which is
outside the `inert` draft region and outside the button's handler.
**How to avoid:** put the gate inside the shared `handleUndo`, which both paths already call
(`TopBar.tsx:82`, `:129`, `:144`).
**Warning signs:** two rounds vanish from the board with no dialog.

### Pitfall 7: `copyConfig` shallow-copies a new array field

**What goes wrong:** the folded state aliases the caller's `bans` array; a later mutation is
visible in state that was supposed to be a copy.
**Why it happens:** `copyConfig` (`model.ts:110`) is a hand-written literal; TypeScript catches
a *missing* field but not a shared reference.
**How to avoid:** `bans: [...config.bans]` and `dualMegaChoices: config.dualMegaChoices.map(c => ({...c}))`.
Assert non-identity in a test.
**Warning signs:** an undo (which re-folds via `initialState` → `copyConfig`) changes something
it should not.

### Pitfall 8: schema version compared in three places

**What goes wrong:** `migrate` learns about v1 but `persistence.load()` (`:222`) or
`adoptTournament` (`store.ts:212`) still compares against `SCHEMA_VERSION` directly, so
`Resume saved draft` never appears for a Phase 1 save.
**How to avoid:** route all three through `migrate`, and add a test that a v1 fixture survives
each entry point.

### Pitfall 9: the roster rotates mid-phase

**What goes wrong:** `validUntil` is **2026-09-02**, three-and-a-bit weeks out. A rotation
changes 235, 74, and possibly the dual-Mega count, invalidating every hardcoded number.
**How to avoid:** D-17's principle — no constant encodes a roster figure. Derive `R`, `M`, and
the dual-Mega rows from `snapshot.entries` at runtime. Add a fixture test (in the
`sprite-resolution.test.ts` family) asserting the *current* counts, so a rotation produces a
loud failure rather than a subtly wrong feasibility gate.
**Warning signs:** any literal `235`, `74`, `39` or `2` in `src/`.

### Pitfall 10: the live region goes silent on a repeated announcement

**What goes wrong:** `LiveRegion` announces changes; byte-identical consecutive text is silent
the second time, and clearing first does not help because Preact batches
(`LiveRegion.tsx:18-27`).
**Why this phase is safe:** consecutive turn announcements always differ (round or name
changes), and the one way two could be identical — two players sharing a name — is blocking
error F-03. **If F-03 is ever relaxed, `LiveRegion` needs a two-frame clear.** Record the
dependency.

---

## Code Examples

### Two-stage seeded draw (the core of `src/core/draw.ts`)

```ts
import { nextInt } from './rng';
import type { RosterEntry } from './roster/types';

/**
 * Select `count` items from `pool` uniformly, in place, using a partial Fisher-Yates.
 * Returns the advanced cursor. `pool` is a working copy the caller owns.
 */
function selectInPlace(
  pool: RosterEntry[],
  count: number,
  seed: number,
  cursor: number,
): { taken: RosterEntry[]; cursor: number } {
  const taken: RosterEntry[] = [];
  let next = cursor;

  for (let index = 0; index < count; index++) {
    const remaining = pool.length - index;
    const draw = nextInt(seed, next, remaining);   // throws on remaining < 1 — a caller bug
    next = draw.cursor;

    const chosenIndex = index + draw.value;
    const chosen = pool[chosenIndex];
    const displaced = pool[index];
    if (chosen === undefined || displaced === undefined) continue;
    pool[chosenIndex] = displaced;
    pool[index] = chosen;
    taken.push(chosen);
  }

  return { taken, cursor: next };
}

export function drawPool(input: DrawInput): DrawResult {
  const { candidates, size, megasRequired, seed } = input;
  let cursor = input.cursor ?? 0;

  // Stage 1 — partition, preserving display order inside each part.
  const megaCapable = candidates.filter((entry) => entry.megaCapable);
  const rest = candidates.filter((entry) => !entry.megaCapable);

  // Stage 2 — the Mega quota. Skipped entirely when megasRequired is 0,
  // which makes the default path a plain uniform draw.
  const quota = selectInPlace([...megaCapable], megasRequired, seed, cursor);
  cursor = quota.cursor;

  // Stage 3 — the remainder, from everything not already taken.
  const chosen = new Set(quota.taken.map((entry) => entry.id));
  const remainder = [...megaCapable.filter((e) => !chosen.has(e.id)), ...rest];
  const fill = selectInPlace(remainder, size - megasRequired, seed, cursor);
  cursor = fill.cursor;

  for (const entry of fill.taken) chosen.add(entry.id);

  // Emit in the CANDIDATES' order, never the shuffle's — selectors.ts:36 depends on it.
  const ids = candidates.filter((entry) => chosen.has(entry.id)).map((entry) => entry.id);
  const megaCapableCount = candidates.filter(
    (entry) => entry.megaCapable && chosen.has(entry.id),
  ).length;

  return { ids, megaCapableCount, cursor };
}
```

### The gate's set-based counts (F-10)

```ts
const banned = new Set(input.bannedIds);
const legalCount = input.entries.reduce(
  (total, entry) => (banned.has(entry.id) ? total : total + 1),
  0,
);
const megaCapableLegalCount = input.entries.reduce(
  (total, entry) => (entry.megaCapable && !banned.has(entry.id) ? total + 1 : total),
  0,
);
// banCount is the number of bans that HIT the roster, which is the figure the copy quotes.
const banCount = input.entries.length - legalCount;
```

### Stamping a host-authored config (the `store.ts` seam)

```ts
// src/store.ts — every ambient value read here, none inside a reducer.
export function createTournament(input: CreateTournamentInput): TournamentDoc | null {
  docSignal.value = {
    schemaVersion: SCHEMA_VERSION,
    id: newId(),                    // adapters/id.ts
    createdAt: now(),               // adapters/clock.ts
    config: input.config,
    rng: { seed: newSeed(), cursor: 0 },   // reserved for Phase 3's tie-breaks
    log: [],
  };
  stateSignal.value = initialState(input.config);

  // Both signals MUST be set first — dispatch returns 'draftNotStarted' otherwise (store.ts:121).
  dispatch(poolBuilt(input.poolIds, input.rosterVersion, input.checksum));
  dispatch(draftStarted(input.order));

  return docSignal.peek();
}
```

### Config-screen seed handling (pre-document form state)

```tsx
// src/ui/screens/ConfigScreen.tsx — two independent, independently re-rollable seeds.
const [poolSeed, setPoolSeed] = useState(() => newSeed());
const [orderSeed, setOrderSeed] = useState(() => newSeed());

// Pure derivations. Stable unless the config or the corresponding seed changes.
const draw = useMemo(
  () => drawPool({ candidates, size: poolSize, megasRequired: players.length * megasPerTeam, seed: poolSeed }),
  [candidates, poolSize, players.length, megasPerTeam, poolSeed],
);
const order = useMemo(
  () => selectStartingOrder(orderSeed, players.map((p) => p.id)),
  [orderSeed, players],
);

// Re-roll draws a NEW seed rather than advancing a cursor, so the two never share a stream.
const rerollPool  = () => setPoolSeed(newSeed());
const rerollOrder = () => setOrderSeed(newSeed());
```

### A core test, in the house style

```ts
// tests/core/feasibility.test.ts — zero mocks, node environment, no store.
import { describe, expect, it } from 'vitest';
import { checkFeasibility } from '../../src/core/feasibility';
import { ENTRIES } from './fixtures/roster';   // or read roster.mb.json directly

describe('checkFeasibility', () => {
  it('blocks an empty pool-size field instead of reporting all clear', () => {
    const result = checkFeasibility({
      playerNames: ['Ada', 'Bo'], rounds: 6, poolSize: null,
      megasRequiredPerTeam: 0, bannedIds: [], entries: ENTRIES,
    });
    expect(result.blocked).toBe(true);
    expect(result.problems[0]?.code).toBe('poolSizeNotAnInteger');
  });

  it('warns but does not block at exactly players × rounds', () => {
    const result = checkFeasibility({
      playerNames: ['Ada', 'Bo'], rounds: 6, poolSize: 12,
      megasRequiredPerTeam: 0, bannedIds: [], entries: ENTRIES,
    });
    expect(result.blocked).toBe(false);
    expect(result.problems.map((p) => p.code)).toEqual(['poolExactlyMinimum']);
  });
});
```

---

## Standard Stack

**No stack change. No new dependency of any kind — runtime or dev.**

### Runtime (the entire list)

| Library | Version | Purpose | Why standard |
|---------|---------|---------|--------------|
| `preact` | `10.29.8` (exact) | UI rendering | C-1. Exact-pinned in `package.json` `[VERIFIED]` |
| `@preact/signals` | `2.10.1` (exact) | Reactive state | C-1. Exact-pinned `[VERIFIED]` |

### Build / test (unchanged, no additions)

| Package | Version | Purpose |
|---------|---------|---------|
| `vite` | `8.2.0` | Build + dev server |
| `@preact/preset-vite` | `2.10.6` | JSX + prefresh |
| `typescript` | `~5.9` | Types |
| `vitest` | `^4.1.10` | Tests |
| `happy-dom` | `^20.11.1` | Opt-in DOM for UI tests |
| `pokemon-showdown` | `0.11.11` | Roster generation only. **Not run this phase** (C-13) |
| `@types/node` | `^24.0.0` | Node types for scripts |

`[VERIFIED: package.json read this session]`

### Alternatives considered

| Instead of | Could use | Verdict |
|------------|-----------|---------|
| Hand-built combobox | Any headless combobox package | **Rejected — C-1.** 02-UI-SPEC §Registry Safety forecloses it by name |
| Hand-built segmented control | A UI kit | **Rejected — C-1.** `<fieldset>` + radios is better anyway: grouping and arrow keys come free |
| Hand-built feasibility gate | A validation schema library | **Rejected — C-1**, and it is the wrong tool: this is arithmetic over a roster, not shape validation |
| Windowing for the ban grid | Any virtualization library | **Rejected — C-1** and unnecessary: Phase 1 ships 235 cells verified |

**Installation:** none. `npm install` is not run in this phase.

---

## Package Legitimacy Audit

**Not applicable — this phase installs no packages.**

The Package Legitimacy Gate protocol was not executed because there is nothing to audit.
C-1 caps runtime dependencies at exactly two, both already installed and exact-pinned; the
devDependency list is unchanged; and 02-UI-SPEC §Registry Safety records (verified 2026-08-06)
that no `components.json`, `tailwind.config.*` or `postcss.config.*` exists and none may be
added.

**Planner instruction:** if any plan in this phase proposes an `npm install` of anything, that
is a constraint violation, not a trade-off, and it must be escalated rather than gated behind
a checkpoint.

---

## Runtime State Inventory

Not a rename/refactor phase, but the schema bump does touch persisted runtime state. Scoped
inventory:

| Category | Items found | Action required |
|----------|-------------|-----------------|
| Stored data | `localStorage` key `champions-drafter:tournament` holding `{schemaVersion:1, generation, savedAt, doc}` (`persistence.ts:38,74`) — a Phase 1 save on any machine that ran the deployed site | **Migration.** Three schema comparisons must route through `migrate` (`store.ts:212`, `persistence.ts:222`, `import-guard` via `migrate`) |
| Stored data | `localStorage` key `champions-drafter:probe` — written, read, removed by the canary; never persists | None |
| Stored data | **New:** `champions-drafter:view` `{density, pane}` (D-20). Absent/unparseable/unknown → silent fallback to `standard`/`split` | New adapter, no migration (nothing to migrate from) |
| Live service config | None — GitHub Pages static deploy, no external service holds state | None. Verified by absence: no service config in the repo beyond the Actions workflow |
| OS-registered state | None | None — this is a browser app with no OS registration |
| Secrets / env vars | None. `import.meta.env.BASE_URL` is Vite's build-time base (`/Pokemon-champions-drafter/`, `vite.config.ts:8`), not a secret | None |
| Build artifacts | `public/sw.js` precache manifest is regenerated by `scripts/build-sw-manifest.mjs` after `vite build`; cache version hashes file **content** | None manual — `npm run build` does it. New assets are picked up automatically |
| Build artifacts | `public/data/roster.*.json`, `public/sprites/*.png` | **None — do not regenerate** (C-13). Regeneration is deliberate and this phase does not need it |
| Exported files | User-held `.json` tournament exports at `schemaVersion: 1` | Same migration path as the stored save |

**Explicitly nothing found:** no database, no live external service configuration, no OS
scheduler entry, no secret. Verified by reading `package.json`, `vite.config.ts`,
`src/adapters/` in full, and listing `public/`.

---

## Environment Availability

| Dependency | Required by | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | build, tests, scripts | ✓ | `@types/node ^24`; scripts declare Node 18+ | — |
| npm | `verify`, `build`, `test` | ✓ | — | — |
| `preact` 10.29.8 | runtime | ✓ | exact-pinned, installed | — |
| `@preact/signals` 2.10.1 | runtime | ✓ | exact-pinned, installed | — |
| `vitest` + `happy-dom` | UI tests | ✓ | `^4.1.10` / `^20.11.1` | — |
| `pokemon-showdown` 0.11.11 | roster regeneration only | ✓ (devDep) | 144 MB installed | **Not needed** — C-13 forbids regeneration this phase |
| Committed roster snapshot | the entire phase | ✓ | `roster.mb.json`, regulation M-B, 235 entries | `roster.ma.json` is the retained prior regulation |
| Committed sprites | pool + board rendering | ✓ | 312 files precached per `sw-manifest.test.ts` | `_placeholder.png`; `spriteMissing` count is 0 this regulation |
| A 1920 × 1080 screen | **D-23's mandatory physical check** | unknown | — | **None.** The 3-metre legibility pass cannot be automated and cannot be substituted |
| A real browser (not happy-dom) | `inert` focus semantics, `content-visibility`, 200% zoom | unknown | — | **None.** `read-only-shell.test.tsx` already records that happy-dom parses `inert` but does not implement its focus semantics |

**Missing dependencies with no fallback:**
- **The D-23 physical check.** It requires a person, a 1080p screen and three metres. 02-UI-SPEC
  §DRFT-14 as a Checkable Assertion specifies two passes (`split` and `board-full`) and requires
  both results recorded in the verification document. The planner must schedule this as a
  `checkpoint:human-verify`, not as an automated assertion.
- **Assertion 7** ("No board name text ellipsises in `board-full` at 1920px") — 02-UI-SPEC says
  explicitly "measure this one, do not assume it".

**Missing dependencies with fallback:** none.

---

## Security Domain

Threat surface is narrow by construction: a static, offline-capable site with no backend, no
accounts, no network reads except same-origin assets it ships itself, and exactly one untrusted
input.

### Applicable ASVS categories

| ASVS category | Applies | Standard control |
|---------------|---------|-----------------|
| V2 Authentication | **no** | No accounts, no identity. PROJECT.md excludes them |
| V3 Session Management | **no** | No sessions. The tab lock (`tab-lock.ts`) is a write-ownership coordination mechanism, not auth |
| V4 Access Control | **no** | Single-user, single-origin, no privilege boundary |
| V5 Input Validation | **yes** | `src/core/import-guard.ts` — hand-rolled by constraint (C-1), 495 lines: size gate before parse, poison-key reviver, allow-list rebuild, per-count bounds. **Every new config field needs a line here** |
| V6 Cryptography | **partial** | `crypto.getRandomValues` for seeds and ids (`adapters/id.ts`). `rng.ts` is explicitly non-cryptographic and says so — correct, since it buys reproducibility, not unpredictability. **Nothing hand-rolled that should not be** |
| V12 Files & Resources | **yes** | `file-io.ts` reads a user-chosen file; `MAX_IMPORT_BYTES` 5 MB gates before parse |
| V14 Configuration | **partial** | `check:nohtml` (C-3) enforces no raw-HTML sink anywhere under `src/` |

### Known threat patterns for this stack

| Pattern | STRIDE | Standard mitigation | Status in this phase |
|---------|--------|--------------------|---------------------|
| Prototype pollution via `JSON.parse` of a hostile file | Tampering | Reviver dropping `__proto__` / `constructor` / `prototype`, plus an own-property check using `Object.prototype.hasOwnProperty.call` | **Shipped** (`import-guard.ts:129`, `:168`). New fields inherit it automatically because every descent goes through `safeObject` |
| DOM XSS via a roster display name | Tampering | Render text children only; Preact escapes them. `check:nohtml` enforces it | **Shipped.** New surfaces (typeahead results, ban chips, feasibility sentences) all render names as text |
| Resource exhaustion via a small-but-huge count (`"rounds": 4e9`) | DoS | Per-count bounds separate from the size gate (`MAX_ROUNDS`, `MAX_PLAYERS`, `MAX_POOL_IDS`) | **Shipped.** **New fields need new bounds** — `poolSize`, `bans` length, `megasRequiredPerTeam`, `dualMegaChoices` length |
| URL injection via roster-supplied strings | Tampering | `SPRITE_FILE_PATTERN = /^[0-9]+\.png$/` — only digits can reach a sprite URL (`sprite-src.ts`); `SNAPSHOT_FILE_PATTERN` for snapshot filenames (`roster-source.ts:75`) | **Shipped, unchanged** |
| Cross-tab clobber | Tampering | `isOwner()` gate on `save()` (`persistence.ts:160`) and `undo()` (`store.ts:276`) | **Shipped.** New write paths (config Start) run before any tournament exists, so the window the lock protects has not opened |
| Third-party origin contact | Info disclosure | Every fetch is same-origin, `credentials: 'omit'`, prefixed with `import.meta.env.BASE_URL` (`roster-source.ts:98-101`) | **Shipped, unchanged.** This phase adds no fetch |

**The one new security-relevant surface in this phase** is the widened `TournamentConfig`. Each
new field is an allow-list line in `import-guard.buildConfig` (`import-guard.ts:248-274`) with
its own bound. A field added to `model.ts` but not to `import-guard.ts` is silently dropped on
import — which fails safe, but produces a tournament missing its banlist with no message.
**Add a test asserting round-trip fidelity of every config field.**

---

## State of the Art

| Old approach | Current approach | When changed | Impact on this phase |
|--------------|-----------------|--------------|---------------------|
| Two hardcoded players, six rounds (`store.ts:49-53`) | Host-authored config | **This phase** | `createTournament`'s signature changes; `PHASE_ONE_*` constants are deleted |
| Auto-create a tournament on load (`app.tsx:208-226`) | Landing screen with three actions (D-01) | **This phase** | The "restore before creating" load-order constraint dissolves; `startAutosave` moves to after a tournament exists |
| Pool = every draftable entry (`app.tsx:217`) | Pool = a seeded, ban-filtered, Mega-constrained draw | **This phase** | The 235-cell case moves from the draft pool to the config ban grid |
| Four-token density contract (`tokens.css:10-11`) | Three tokens + content branching (D-25) | **This phase** | The comment must be rewritten in the same commit that breaks it |
| Colour reserved for three roles (`tokens.css:80`) | Four roles — 18-hue type palette added (D-26) | **This phase** | 20 new tokens with measured ratios; the "Reserved use 3 of 3" comment must be rewritten |
| Unlimited one-click undo (Phase 1 D-10) | Confirms only across a round boundary (D-37) | **This phase** | The gate goes in `handleUndo`, so `Ctrl+Z` routes through it |
| `SCHEMA_VERSION = 1`, `migrate` a passthrough | Version 2 with a real upgrade step | **This phase** | Three comparison sites must route through `migrate` |

**Deprecated / to delete:**
- `PHASE_ONE_ROUNDS`, `PHASE_ONE_PLAYERS` (`store.ts:49-53`) — explicitly labelled scaffolding.
- The literal `6` in `TurnBanner.tsx:53` and `DRAFT_COMPLETE_COPY` at `:36`.
- `BoardGrid`'s empty-state body naming "Player 1" (`BoardGrid.tsx:67`) — it names the actual
  first player now, and drops "below" because the pool is beside the board.

---

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|-------|---------|--------------|
| A1 | HTML `<input type="number" max="6">` does not prevent typing a larger value; it only marks the input `:invalid` | §F-09 | If wrong, F-09 is redundant belt-and-braces — harmless. If right and F-09 is skipped, a low-player-count config reaches the draw with an impossible quota |
| A2 | `content-visibility: auto` requires `contain-intrinsic-size` for correct scroll sizing, and a `min-height` cell taller than the intrinsic size causes scrollbar jitter | §Rendering | Only matters if the escape hatch is adopted, which is currently recommended against |
| A3 | Preact's keyed reconciliation reuses surviving nodes across a filter change rather than rewriting cell contents | §Keying | If wrong, filtering is slower than estimated but still correct; the fix is the same (keep `key={entry.id}`) |
| A4 | Two-stage partition sampling is not uniform over the constraint-satisfying set (biased toward Mega-heavy pools) | §The Constrained Draw | Stated as a caveat, not relied upon. If wrong, the draw is *more* uniform than claimed — no downside |
| A5 | A regulation rotation on 2026-09-02 will change at least one of 235 / 74 / the dual-Mega count | §Pitfall 9 | If it changes nothing, the tripwire test simply keeps passing |

**Everything else in this document is `[VERIFIED]` against a file on disk in this session or
`[CITED]` from a document that was read in full.** In particular every roster figure, every
feasibility ceiling, every hypergeometric probability, and every file/line reference.

---

## Open Questions (RESOLVED)

**All six were decided by the orchestrator before planning and are implemented in the plans.**
Each recommendation below was accepted as written. Resolution map:

| # | Question | Resolution | Implemented in |
|---|----------|-----------|----------------|
| 1 | Distinct reason string for "too many players at Exact"? | **Yes** — added as a ninth code, `tooManyPlayersForRoster`, precedence-ordered above `poolTooLarge` | 02-01 |
| 2 | Migrate or reject Phase 1 saves? | **Migrate** — bump `SCHEMA_VERSION` 1 → 2; all three compare sites route through `migrate` | 02-02 |
| 3 | Pool-size integrity check in `import-guard`? | **No** — run `checkFeasibility` on adopted docs, non-blocking notice; guard's posture unchanged | 02-02, 02-06 |
| 4 | Where do the two config-time seeds live? | **Option A — action payloads**, stamped at the edge | 02-02, 02-04 |
| 5 | Must `Randomize order` be clicked before Start? | **No** — roll `orderSeed` on mount so "no order yet" is unrepresentable | 02-04 |
| 6 | F-03 player-name normalization | **trim + lowercase + collapse internal whitespace** | 02-04 |

The original questions and their reasoning are preserved below for the record.

1. **Should "too many players at the Exact preset" get its own reason string?**
   - *What we know:* at Exact, `N = p × r` identically, so F-05 can never fire and F-04 is the
     only pool blocker. A host at 40 players sees "Pool is too large" when the fix is fewer
     players. The numbers in the sentence make it recoverable — that is D-15's design intent.
   - *What's unclear:* whether adding a ninth reason string is inside D-15's pattern (it is:
     sentence plus numbers) or a change to a locked decision (it is not).
   - *Recommendation:* add it. Suggested copy in §Feasibility Arithmetic. Cost is one string and
     one branch; the alternative is the group's most likely first misconfiguration producing the
     least helpful sentence.

2. **Migrate or reject Phase 1 saves?** — explicitly Claude's discretion per CONTEXT.
   - *What we know:* every new field has a lossless v1 default, and `poolSize` is recoverable
     from the materialized `pool/built.ids` length. Rejecting requires a third import-failure
     sentence because neither existing one is true of a v1 file.
   - *Recommendation:* **migrate.** One function, one test, three call sites routed through it.

3. **Should `import-guard` gain a `poolIds.length ≥ players × rounds` check?**
   - *What we know:* it is the only way to reach pool-dry, and `import-guard` deliberately does
     no referential integrity ("A bound is not an integrity check"). A hostile or hand-edited
     file stalls the draft silently at the pick where the pool empties.
   - *What's unclear:* whether adding one integrity check erodes the module's stated posture.
   - *Recommendation:* **do not add it to `import-guard`.** Instead, run `checkFeasibility` (or a
     narrow subset) on an adopted document and surface a non-blocking notice on the draft screen.
     That keeps the guard's posture intact, reuses the gate the phase is already building, and
     gives the host a sentence rather than a stall. Alternatively accept the risk and document
     it — the input is self-inflicted.

4. **Where do the two config-time seeds live?** — §Seeded Randomness gives three options with a
   recommendation (A: in the action payloads). Needs a decision and a recorded rationale, since
   whichever is chosen constrains `import-guard`.

5. **Does `Randomize order` need to have been clicked before Start?**
   - *What we know:* D-04 makes randomize re-rollable and shows its result. `draft/started`
     requires an order (`canApply` rejects a mismatch). Nothing states whether the order is
     rolled implicitly at Start if the host never clicked.
   - *Recommendation:* roll `orderSeed` on mount and render the numbered list immediately, so
     `Randomize order` always re-rolls a visible order and Start never depends on a click. This
     also makes the "no order yet" state unrepresentable.

6. **Player name normalization for the F-03 duplicate check.**
   - *What we know:* 02-UI-SPEC gives the copy but not the comparison. The live-region argument
     (§Live-region announcements) depends on names being distinguishable when *spoken*.
   - *Recommendation:* trim, lowercase, collapse internal whitespace. `Sam` and `sam ` should
     collide, because a screen reader cannot tell them apart and neither can the table.

---

## Sources

### Primary (HIGH confidence) — read or executed this session

- `public/data/roster.mb.json` — every roster figure, computed with Node, not recalled
- `package.json`, `vite.config.ts` — dependency list, test environment, base path
- `src/core/{model,actions,reduce,selectors,rng,undo,migrate,import-guard}.ts` — read in full
- `src/core/roster/types.ts` — read in full
- `src/store.ts` — read in full
- `src/app.tsx` — read in full
- `src/adapters/{roster-source,persistence,id}.ts` — read in full
- `src/ui/components/{PoolGrid,MonCard,MonChip,BoardGrid,TeamStrip,TurnBanner,Dialog,LiveRegion}.tsx` — read in full
- `src/ui/components/{PoolGrid,MonCard}.css`, `src/ui/tokens.css`, `src/ui/sprite-src.ts` — read in full
- `scripts/check-pure-core.mjs` — the exact forbidden-token list and layering rules
- `.planning/phases/02-host-configured-draft-night/02-CONTEXT.md` — read in full (D-01…D-39)
- `.planning/phases/02-host-configured-draft-night/02-UI-SPEC.md` — read in full (1216 lines)
- `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md` §Phase 2 + §Ordering Constraints, `.planning/STATE.md`
- `.planning/research/ARCHITECTURE.md` §Sync-Readiness rules 1–19
- `.planning/phases/01-draft-skeleton-on-a-real-url/01-VERIFICATION.md` (grepped for perf/235)
- `CLAUDE.md` — read in full via project instructions

### Computed this session (HIGH confidence — reproducible)

- Roster counts, dual-Mega enumeration, type set, stat bounds, longest name
- `toID(name) === id` across all 235 entries and all 76 Mega formes (0 mismatches)
- Player ceilings by preset and by `megasRequiredPerTeam`
- Ban-starvation thresholds, pool and Mega, at `p = 8`
- Hypergeometric P(draw satisfies) and expected redraw counts across 30 configurations
- Three-letter type code distinctness (18/18)

### Not consulted, and why

- **Context7 / external documentation:** not needed. Every question in this phase is about this
  codebase's own contracts, this repository's committed data, and arithmetic. No third-party
  library API is in question, and no new dependency may be added (C-1). Consulting external
  docs would have produced authority without relevance.
- **WebSearch:** same reason. The one external-behaviour claim (A1, HTML `max` semantics) is
  marked `[ASSUMED]` rather than dressed up with a search result, and it is a belt-and-braces
  concern either way.

---

## Metadata

**Confidence breakdown:**

| Area | Level | Reason |
|------|-------|--------|
| Feasibility arithmetic | **HIGH** | Every number computed against the committed snapshot this session; the pool-dry proof is grounded in specific reducer lines |
| Constrained draw | **HIGH** | Hypergeometric probabilities computed exactly; the recommendation follows from the numbers, not from preference |
| Phase 1 inventory | **HIGH** | Every file read in full; line numbers current as of `6a71817` |
| Seeded randomness | **HIGH** | The codebase's own `store.ts:163` comment states the hazard; the shape follows from CONTEXT's pre-document-form-state rule |
| Schema bump / migration | **MEDIUM-HIGH** | The three comparison sites and the `import-guard` allow-list are verified; the exact new-field shapes are recommendations, and CONTEXT marks this Claude's discretion |
| Rendering / perf | **MEDIUM-HIGH** | Node arithmetic is verified and Phase 1's 235-cell render is verified shipped; frame-budget claims are reasoned, not measured in a browser |
| Pitfalls | **HIGH** | Nine of ten are grounded in a specific file and line; the tenth (roster rotation) is grounded in `validUntil` |

**Research date:** 2026-08-07
**Valid until:** **2026-09-02** — the roster snapshot's `validUntil`. Every figure in
§Roster Facts and §Feasibility Arithmetic is regulation-specific and must be recomputed after
rotation to M-C. The file references and architectural findings do not expire.
