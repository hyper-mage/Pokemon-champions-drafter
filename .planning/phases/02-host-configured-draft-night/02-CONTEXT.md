# Phase 2: Host-Configured Draft Night - Context

**Gathered:** 2026-08-06
**Status:** Ready for planning

<domain>
## Phase Boundary

A host configures a real tournament — player names, format label, tournament depth, pool
size, dual-Mega X/Y/Either, a species banlist — passes a feasibility gate, and 4–8 friends
draft through it on one shared screen with search, type and Mega filters, three display
densities, a players × rounds board, per-player teams, a turn indicator, and confirmation
on destructive actions.

Covers 19 requirements: DRFT-01, 02, 03, 05–16, BAN-01, BAN-02, BAN-08, RULE-07.

**Explicitly not this phase:** the rules compiler and typed round schedule, priority cards,
swaps (all Phase 3) · blind and snake ban flows and the pass-the-device interstitial
(Phase 4) · round robin, standings, brackets, match records, roster refresh (Phase 5).
Pick order stays the plain randomized rotating order `selectCurrentTurn` already
implements; Phase 3 replaces it with priority-card resolution.

**One scope expansion, deliberate.** A `megasRequiredPerTeam` config field lands in this
phase — see D-08. It is compiler *input*, not the compiler.

</domain>

<decisions>
## Implementation Decisions

### Entry Point and Config Screen

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

### Pool Sizing and the Draw

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

### Host Banlist

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

### Feasibility Gate (RULE-07)

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

### Shared-Screen Layout

- **D-18:** **Side-by-side panes**: pool ≈60%, board ≈40%, each independently scrollable,
  **either pane expandable to full width**. Rejected the stacked sticky-board alternative
  because criterion 5 requires the board visible "at every moment" and panes deliver that
  without the board consuming 590px of a 1080p screen at 8 players.
- **D-19:** **Expansion is an expand button in each pane header** — three discrete states
  (split, pool-full, board-full), with a restore control on the collapsed edge. No
  draggable splitter: pointer-drag code is awkward on touch, needs a keyboard equivalent,
  and a free ratio has to be persisted anyway.
- **D-20:** **Pane state and density persist in browser storage, never in the tournament
  document.** They are view preferences, not facts about the tournament, and they must not
  travel through JSON export or a future sync layer.
- **D-21:** **Board cells are sprite-only in split view; names appear when the board pane
  is expanded.** Expanding the board is therefore the answer to "what is that one", which
  gives the expand control a job beyond preference.
  *Known risk, accepted:* Charizard and Charizard-Mega-X share a base sprite in this
  pipeline and the Rotom appliances read alike at 48px, so a split-view board can be
  genuinely ambiguous.
  **Implementation requirement, not optional:** `MonChip` currently sets `alt=""`
  *because* adjacent name text supplies the button's accessible name (see the comment
  block in `MonChip.tsx`). Removing that text in split view therefore leaves the cell with
  no accessible name at all. The sprite must carry `alt={entry.name}` whenever the name
  text is not rendered.
- **D-22:** **DRFT-12 needs no new build.** The existing `TurnBanner` plus the existing
  `board__cell--next` highlight in `TeamStrip` are the two signals: one loud enough for
  the back of the room, one precise about which slot fills next. Rejected dimming the
  seven inactive rows — it fights criterion 5's "each player's team as it fills".
- **D-23:** **DRFT-14 is verified two ways.** A stated numeric target in the UI spec —
  board name text ≥ 18px, sprite ≥ 48px at standard density, readable at 3 m on a 1080p
  screen — **and** a physical check: stand back from the screen with 8 players configured.
  The number makes it reviewable and regressable; the physical check is what the
  requirement actually means. Neither alone is sufficient.
- **D-24:** **Density affects the pool only.** The board keeps fixed sizing, so a host
  chasing more pool cannot accidentally make the shared board illegible. The board's size
  is dictated by player count, which density cannot help with anyway.

### Display Density and Card Content

- **D-25:** **Densities change content, not only scale.** Minimal = sprite + name.
  Standard = + typing + stat total. Full = + all six base stats.
  **This amends the Phase 2 density contract written in `src/ui/tokens.css:10`** ("the
  densities change exactly four tokens — `--sprite-lg`, `--cell-min`, `--cell-h`,
  `--text-label`. Nothing else."), and therefore amends Phase 1's D-07. Record it as a
  deliberate revision, not drift: pure scaling cannot deliver a usable "full" density,
  because six 14px numbers in a 112px cell are unreadable at any scale. **The comment in
  `tokens.css` must be updated in the same change that breaks it.**
- **D-26:** **Typing renders as colour-coded pills with the type name inside.** Colour
  plus text, so nothing relies on colour alone and contrast rules are satisfied honestly.
  **This amends Phase 1's reserved-colour rule** (`tokens.css:80`, colour reserved for
  accent, danger, and focus — "Reserved use 3 of 3"). Eighteen type colours is a real
  expansion of the token system and must be documented as such in the token table.
- **D-27:** **Palette source: canonical Pokémon type hues, with pill ink chosen per type**
  (dark or light, whichever clears 4.5:1 against that hue). Preserves the recognition that
  was the entire reason to choose colour. Rejected darkening all 18 to suit a single ink —
  Ice, Fairy, Electric, and Ground stop looking like themselves. Every pairing's measured
  ratio goes in the token table beside the existing ones.
- **D-28:** **Three-letter uppercase type codes at standard density** (`ELE`, `FLY`,
  `WAT`), full type names at full density. Two full-name pills do not fit a 112px cell —
  `Electric` + `Flying` at 14px is roughly 130px of text before padding. Colour carries
  identity; the text disambiguates.
- **D-29:** **Type colour appears on pool cards and on the DRFT-09 type filter controls,
  and nowhere else.** The filter and the thing it filters speak the same language. Board
  chips stay monochrome: 48 saturated pills would compete with the accent-coloured
  next-slot highlight, which is the one signal that must never be missed.
- **D-30:** **Stat total at standard density; all six at full**, as HP/Atk/Def/SpA/SpD/Spe
  in two rows of three. The total is the figure a drafter compares at a glance, and
  Champions' stat-point budget makes it meaningful rather than arbitrary.
- **D-31:** **The density control is a three-way segmented control in the pool pane
  header**, beside search and the expand button. Default **Standard** — the setting that
  satisfies DRFT-05 and DRFT-14 at the same time.

### Search and Filters

- **D-32:** **DRFT-08 is a live normalized substring match.** Lowercase and strip
  non-alphanumerics from both query and name — the same normalization as Showdown's
  `toID` — then substring match. `mr rime`, `Mr. Rime`, and `mrrime` all hit; `rotom`
  returns every appliance; `aqua` finds `Tauros-Paldea-Aqua`. **No name splitting
  anywhere**, per CLAUDE.md. Rejected prefix matching precisely because `wash` and `aqua`
  are how people refer to those species.
- **D-33:** **Type filter is OR by default, with a visible "match both" toggle for AND.**
  OR is what "show me the water mons" means; AND answers "which Water/Flying mons are
  left". Two behaviours, one control, and the default is the one people intend.
- **D-34:** **Mega filter is a three-way segmented control — All / Mega-capable /
  Non-Mega**, default All. Non-Mega is a genuine query for a host who set a Mega
  requirement and wants to see what remains for the ordinary rounds. The shape composes
  with DRFT-09's "the round's own restriction" as a separate constraint, which Phase 3
  adds without reshaping this control.
- **D-35:** **Search text and all filters clear the moment a pick commits.** On one shared
  screen the alternative is the real hazard: player 5 picks from player 4's leftover "Fire
  only" filter and never notices the other 30 options. Filter state is ephemeral UI state
  and never enters the tournament document.

### Destructive Confirmations (DRFT-13)

- **D-36:** **Five actions confirm:** abandon draft / start a new tournament; import JSON
  over a live draft (already built as `ImportConfirmDialog` in plan 01-10 — inherited
  deliberately, not by accident); re-roll pool; re-randomize starting order; remove a
  player or clear the banlist. Picking never confirms — D-08 from Phase 1 stands.
- **D-37:** **Undo confirms only when it crosses a round boundary.** Undoing a pick inside
  the current round is one click; undoing a pick belonging to an *earlier* round than the
  one the draft is currently on confirms, because that is where several players' picks are
  at stake. Walking back two rounds therefore costs one or two confirms, not one per pick.
  This narrows D-10's "unlimited undo, one click" — the mechanism is unchanged, the cheap
  case stays cheap, and the expensive case gains a stop.
- **D-38:** **Reuse `Dialog.tsx` for every confirm**, following `ImportConfirmDialog`'s
  shape. Focus trapping, Escape handling, and return-focus are already solved there;
  a second pattern is where accessibility bugs come from.
- **D-39:** **Copy pattern is a consequence sentence plus verb-object buttons.** Body
  states what is lost, in numbers: "This discards 34 picks across 6 players. Nothing
  recovers it." Buttons read "Abandon draft" / "Keep drafting" — both name a verb and its
  object, so the host can act on the button text without re-reading the question. No
  button is labelled OK, Submit, Yes, or Cancel alone, per CLAUDE.md.

### Claude's Discretion

The user selected a concrete option on every question. These four were surfaced as
available for discussion and consciously left unexplored — they are in scope for Phase 2
and are the planner's and researcher's calls:

- **The `TournamentConfig` schema bump and migration.** `TournamentConfig` (`src/core/model.ts:42`)
  currently holds `formatLabel`, `players`, `rounds`, `rosterVersion`, `rosterChecksum`.
  This phase adds at minimum: bans, pool size, `megasRequiredPerTeam`, dual-Mega
  preferences, tournament depth, and ban mode. That is a `SCHEMA_VERSION` bump and a
  `migrate()` path (`src/core/migrate.ts` exists) for Phase 1 documents already sitting in
  browser storage and in exported JSON files. Whether a Phase 1 save is migrated or
  rejected with a stated reason was not discussed.
- **Whether tournament depth (DRFT-01) does anything visible in Phase 2.** Phase 5 is what
  consumes it ("draft-only skips every bracket screen entirely"). Storing it now and
  showing nothing is defensible; so is a short explanatory note in config.
- **Keyboard and touch support on the shared screen** — tab order across two panes,
  whether the pool is keyboard-navigable as a grid, and touch targets against the existing
  `--target-min: 44px` token.
- **What `CompletedDraft.tsx` becomes at 8 players.** Phase 1's per-player export panels
  (D-09) were built for two.

Also Claude's discretion, being constrained by locked decisions rather than open:
- Where `megasRequiredPerTeam` sits in the config form's order, and its exact label.
- Whether the constrained draw is implemented as reject-and-redraw or as a two-stage draw
  (Mega-capable quota first, remainder uniform). Both are pure and seeded; only
  reproducibility from the seed is non-negotiable.
- Which selectors are added versus extended in `src/core/selectors.ts`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project scope and requirements
- `.planning/PROJECT.md` — Core value, the Key Decisions table, and the Constraints block.
  The **Scale** constraint ("4–8 players by default, must not break at higher counts —
  Warn when pool math or rules become unsatisfiable rather than hard-capping") is what
  D-17 implements. Every row of the Key Decisions table is locked.
- `.planning/REQUIREMENTS.md` — Full text of this phase's 19 requirements: DRFT-01, 02,
  03, 05–16 (lines 49–64), BAN-01, BAN-02, BAN-08 (lines 91–98), RULE-07 (line 85). Also
  read DRFT-04 and RULE-09 to see what is deliberately *not* here.
- `.planning/ROADMAP.md` §"Phase 2: Host-Configured Draft Night" — Goal, the five success
  criteria that define done, and the Notes block. §"Ordering Constraints" 4 and 6 both
  bear on this phase and **both are amended by decisions above** (D-08 deviates from 6;
  D-11 declines the assumption behind 4).

### Architecture — binding
- `.planning/research/ARCHITECTURE.md` — Read before planning.
  - §"Pattern 1: Append-Only Action Log + Pure Reducer" — every config change and every
    pick goes through `dispatch`; nothing mutates the document.
  - §"Pattern 2: Pure Core / Impure Shell with Injected Ambients" — the seed for the pool
    draw and the order roll is drawn at the edge, never inside a reducer.
  - §"Pattern 5: Materialize External Results Into the Log" — why `pool/built` carries
    actual ids plus `rosterVersion` and `checksum`. The constrained draw (D-08) and the
    re-roll (D-07) both emit materialized results, never instructions to rebuild.
  - §"Sync-Readiness: Concrete Structural Rules" 1–19 — non-negotiable. Rule 3 (nothing
    derived is stored) is what keeps filter state, pane state, and density out of the
    document. Rule 18's CI grep is `npm run check:pure`.
- `.planning/research/STACK.md` — Pinned versions and the "what NOT to use" table. It
  rejects virtualization by name at this scale and rejects drag-and-drop libraries, which
  is why D-19 uses buttons rather than a splitter.
- `.planning/research/PITFALLS.md` — Roster classification traps. Directly bears on D-32:
  never `split('-')` a species name, and `Kommo-o`, `Mr. Rime`, `Tauros-Paldea-Aqua`,
  `Rotom-Wash` are the fixtures that punish name handling.
- `.planning/research/FEATURES.md`, `.planning/research/SUMMARY.md` — feature-level
  research and cross-cutting synthesis.

### Phase 1 output — the ground this phase builds on
- `.planning/phases/01-draft-skeleton-on-a-real-url/01-CONTEXT.md` — **D-06 through D-13
  are load-bearing here.** D-06 (real components, extended not replaced), D-07 (token
  system, amended by D-25/D-26 above), D-08 (one-click pick, preserved by D-36), D-10
  (unlimited undo, narrowed by D-37), D-13 (storage canary moves into the real config
  screen — D-01 is where it lands).
- `.planning/phases/01-draft-skeleton-on-a-real-url/01-UI-SPEC.md` — The approved design
  contract `tokens.css` was transcribed from, including the full token table with measured
  contrast ratios. D-26 and D-27 extend that table; follow its format.
- `.planning/phases/01-draft-skeleton-on-a-real-url/01-VERIFICATION.md` — What was
  actually verified, and the "literally double-click index.html" documented behaviour.
- `.planning/phases/01-draft-skeleton-on-a-real-url/deferred-items.md` — Open items from
  Phase 1 execution (stale `master` branch, no `.gitattributes`, Node 20 action warnings).
  None block this phase.

### Project instructions
- `CLAUDE.md` — §Conventions and §Architecture are now populated and describe the repo as
  it is. The Identity rule (`id` for comparison, `name` for rendering only), the Sprites
  rule (filenames from `spriteMeta.byRosterId`, never constructed), the Styling rule (no
  raw hex, no raw px where a token exists), and the Copy rule (D-39 implements it) all
  constrain this phase directly.
- `src/core/README.md` — The purity boundary as the code states it.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`PoolGrid.tsx`** — Its own doc comment names this phase's additions: "Phase 2 extends
  with search (DRFT-08), type and Mega filters (DRFT-09) and the density toggle (DRFT-06)
  — not scaffolding to be replaced." The `{n} available` count is already derived from
  what is rendered rather than the snapshot total, so it follows a filter for free.
  Also the surface D-10's ban mode reuses.
- **`MonCard.tsx`** — Renders sprite + name today; its comment states "Phase 2 adds typing
  and base stats here (DRFT-05). The props are shaped so that is an addition rather than a
  rewrite." Sprite `alt=""` is deliberate and documented — the adjacent name is the
  button's accessible name.
- **`BoardGrid.tsx` + `TeamStrip.tsx`** — **DRFT-10 and DRFT-11 are already one surface.**
  A board row *is* a `TeamStrip`; `TeamStrip` returns a fragment so its cells land in the
  parent grid. `BoardGrid.tsx:11-17` states the players-as-rows orientation was chosen
  specifically to survive eight players. `board__cell--next` already implements the
  turn highlight D-22 relies on. Do not build a separate "your team" panel.
- **`MonChip.tsx`** — The board-cell representation, sprite at `--sprite-sm` (48px, an
  exact 2:1 downscale of the measured 96px source). D-21 modifies its `alt` handling.
- **`Dialog.tsx` + `ImportConfirmDialog.tsx`** — The confirm pattern D-38 reuses.
- **`selectors.ts`** — `selectCurrentTurn` (line 103) already generalizes to N players with
  no change; its comment says so. `selectTeams` (line 63) keys by player id and sizes slot
  arrays from `config.rounds`. `selectStartingOrder` (line 135) sorts ids before shuffling
  so the outcome depends on the *set* of players and the seed, not on entry order — which
  is exactly what D-04's re-roll needs.
- **`tokens.css`** — 82 lines. Spacing, size, type, and colour tokens. **Two of its stated
  contracts are amended by this phase** — see D-25 and D-26.
- **`migrate.ts`, `import-guard.ts`** — Already exist for the untrusted-JSON path; the
  schema bump extends them rather than starting fresh.

### Established Patterns

- **`dispatch` in `src/store.ts` is the only write path.** No component mutates the
  document. Config changes made *before* the tournament exists are pre-document form
  state; everything after is an action.
- **`npm run check:pure` fails the build** on any DOM, clock, randomness, network, storage,
  or `preact` import under `src/core/`. The feasibility gate, the constrained draw, the
  search normalization, and every filter predicate are core logic and must be pure.
- **`npm run check:nohtml`** forbids `innerHTML` and `dangerouslySetInnerHTML` anywhere
  under `src/`.
- **`npm run verify`** is the single gate: `check:pure`, `check:nohtml`, `test`, `build`.
- **`tests/core/**` mirrors `src/core/**` with zero mocks**; default test environment is
  `node`, and a UI test opts in with `// @vitest-environment happy-dom` as the **first**
  line. `announce` is a module-level signal and needs resetting in `beforeEach`.
- **One stylesheet per component, beside it.** No raw hex, no raw px where a token covers
  it — which is why D-27's 18 colours must become tokens rather than inline values.
- **`seq` is `max(seq) + 1`, never `log.length`,** and may have gaps.

### Integration Points

- **`src/store.ts:50`** — `PHASE_ONE_PLAYERS` and `PHASE_ONE_ROUNDS` are hardcoded, and
  `createTournament()` (line 168) synthesizes config from them with
  `formatLabel: \`Champions ${snapshot.regulation}\``. This is the seam the config screen
  replaces: `createTournament` must take a host-authored config instead of inventing one.
- **`src/core/model.ts:42`** — `TournamentConfig` gains bans, pool size,
  `megasRequiredPerTeam`, dual-Mega preferences, depth, and ban mode.
  `SCHEMA_VERSION` (line 28) bumps; `copyConfig` (line 110) must copy every new field,
  including deep-copying the ban list.
- **`src/app.tsx`** — 552 lines, and line 212's comment ("Restore before creating, never
  after") marks the load-order constraint. The auto-create-on-load path becomes the
  landing screen of D-01.
- **`public/data/roster.mb.json`** — 235 draftable entries, 74 Mega-capable, 18 types,
  exactly 2 dual-Mega species. `roster.ma.json` is the retained prior regulation.
  Loaded via `src/adapters/roster-source.ts`.

</code_context>

<specifics>
## Specific Ideas

- **Measured roster facts that decisions depend on.** 235 draftable rows; 74 Mega-capable;
  73 distinct Mega-capable base species; 76 Mega formes; 18 types; **exactly two dual-Mega
  species — Charizard and Raichu**. Read from `public/data/roster.mb.json` during this
  discussion. DRFT-15 is a two-row control because of this, not by simplification.
- **The 34-vs-39 discrepancy is real and now moot.** ROADMAP Phase 2 Notes derive a
  34-player ceiling from `players × 6 ≤ 207` (the `baseSpecies` count). The pool actually
  draws from 235 draftable rows, giving 39. D-17 removes the cap entirely, so no constant
  encodes either number and neither has to be adjudicated.
- **The board pane's width is the constraint that shaped three decisions.** At 40% of
  1920px the board has roughly 108px per round cell after the player-name column. That
  single number drove D-21 (sprite-only in split), D-28 (three-letter type codes), and
  D-19's choice of discrete expand states over a free ratio.
- **Everything visible at once is an acceptance criterion, not a preference.** Criterion 5
  says the shared screen shows the turn, the full board, and every team "at every moment".
  Any proposal that puts the board behind a tab or a toggle fails it.
- **DRFT-14 is not polish.** ROADMAP Notes say so explicitly: "The legibility requirement
  (DRFT-14) is an acceptance criterion for the whole shared screen, not a polish item."
  D-23's physical check is the only thing that actually tests it.
- **Three Phase 1 contracts are amended here, deliberately.** The four-token density note
  (`tokens.css:10`), the reserved-colour rule (`tokens.css:80`), and D-10's one-click undo.
  Each amendment is recorded above with its reason. **The comments in `tokens.css` must be
  updated in the same change that breaks them** — a stale contract comment is worse than
  no comment, because the next reader trusts it.

</specifics>

<deferred>
## Deferred Ideas

No out-of-phase capabilities were raised — discussion stayed inside the phase boundary.

Two items move work *into other phases* rather than out of this one, and both are
consequences of decisions above rather than new ideas:

- **Mega-forme bans (Phase 3).** D-11 chose species-only bans, so the compiler's Mega-ban
  list — assumed by ROADMAP ordering constraint 4 and required by Phase 3 success
  criterion 1 — does not exist after Phase 2. Phase 3 must add it: a `SCHEMA_VERSION` bump
  plus a second banlist surface, on top of the compiler work already planned there.
- **Mega feasibility (RULE-09, Phase 3) reads a Phase 2 field.** D-08 puts
  `megasRequiredPerTeam` in Phase 2 config and D-09 records the drawn pool's Mega-capable
  count. Phase 3's gate consumes both rather than recomputing, which also means Phase 3
  must handle the case where the two disagree after a roster rotation.

</deferred>

---

*Phase: 2-Host-Configured Draft Night*
*Context gathered: 2026-08-06*
