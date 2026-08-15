# Phase 3: Compiled Rules, Priority Cards, Swaps - Context

**Gathered:** 2026-08-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Composition requirements compile into a typed round schedule before the draft starts;
players bid priority cards for turn order over that visible schedule; swaps — mid-draft and
in dedicated post-draft rounds — can only take something the target slot's own predicate
allows. Mega-forme bans and the Mega feasibility gate arrive with the compiler, because the
compiler is what knows how many Mega rounds exist.

Covers 23 requirements: DRFT-04, RULE-01…06, RULE-09, CARD-01…08, SWAP-01…07.

**Explicitly not this phase:** blind and snake ban flows, the pass-the-device interstitial,
and the post-reveal feasibility re-check (RULE-08) — all Phase 4 · round robin, standings,
brackets, match records, the draft recap, and roster refresh — all Phase 5 · a full generic
round-schedule editor (RULE-11, v2) · composition rule kinds beyond Mega count (see
`<deferred>`).

**Ordering inside the phase is not negotiable.** ROADMAP §"Ordering Constraints" 3: the
compiler establishes typed slots, and swaps built before typed slots exist can silently
violate composition rules with nothing left to catch them, because the compiler
deliberately removes runtime validation. Compiler first, then cards, then swaps.

</domain>

<decisions>
## Implementation Decisions

### The Rules Compiler

- **D-01:** **The v1 rule vocabulary is exactly one kind: a Mega count.** A rule compiles
  only if it has the shape "N rounds whose pool is filtered by predicate P" — a per-team
  count of a monotone predicate. Relations between picks ("no two of the same type") and
  aggregate caps ("total BST ≤ X") cannot compile and are not offered. RULE-03 is the only
  requirement any project document names, and `megasRequiredPerTeam` already ships in
  config from Phase 2's D-08. This is the smallest vocabulary that makes Phase 3's success
  criteria true, and it is deliberate rather than incidental.
- **D-02:** **Config carries a rule list, currently of length one.** A
  `CompositionRule[]` holding exactly one `{ kind: 'mega', count }`, and
  `compile(rules, rounds)` returns the schedule. RULE-01's wording is "a rule set", and
  this honours it: a second rule kind becomes a new union member plus a predicate, not a
  new architecture. Costs one type and a migration that wraps the existing scalar.
- **D-03:** **The "pick guard" escape hatch is named in code only.** A doc comment on the
  `CompositionRule` union states which rule classes compile and which would need a runtime
  pick guard — the validator the compiler deliberately removed. No runtime surface, no UI,
  no dead code. ROADMAP Notes require this be "a named, unbuilt extension point rather than
  building it speculatively"; the comment is where the name lives. The next person adding a
  rule kind reads the class boundary before they cross it.
- **D-04:** **Non-Mega rounds are unrestricted — the requirement is "at least N".** A
  requirement of 2 Megas over 6 rounds compiles to 2 Mega-only rounds and 4 open rounds
  offering the whole remaining pool, Mega-capable species included. A Mega-capable species
  drafted into an open round occupies an untyped slot and **exports bare, with no stone**:
  the slot decides whether EXPO-02's `Species @ StoneItemName` form applies, never the
  species. Matches `megasRequiredPerTeam`'s shipped doc comment ("Minimum Mega-capable
  Pokémon each team must end up with", `model.ts:132`).

### The Compiled Schedule

- **D-05:** **The schedule is materialized into the log as a new `schedule/compiled`
  action**, written at Start beside `pool/built` and `draft/started`. A document reopened
  after a compiler change or a roster rotation renders the schedule it was drafted under
  rather than one recomputed now. Same argument that put resolved `ids` in `pool/built`
  (ARCHITECTURE Pattern 5). It is also where RULE-06's host reorder is recorded, which is
  what makes the reorder survive reload. Costs one action type, one structural guard, one
  migration case.
- **D-06:** **The round count stays 6 and every derivation reads `config.rounds`.** A team
  is six Pokémon because that is what a Pokémon team is and what export produces, so
  DRFT-04's "team of six" stands unamended. "Compiled" means the rounds get *typed*, not
  that there is a different number of them. Card count (CARD-01's `1..R`), slot-array
  length, and schedule length all read `config.rounds` — **no literal `6` may appear in a
  derivation.** `ConfigScreen.tsx:82`'s comment predicting the opposite must be corrected
  in the same change (see `<specifics>`).
- **D-07:** **A `RoundSpec` carries a tag, not a resolved id list** —
  `{ index, kind: 'mega' | 'open' }`. Eligibility for a Mega round is
  `entry.megaCapable && the entry still has a legal Mega forme`, evaluated against the
  roster snapshot the document already pins via `rosterVersion` / `rosterChecksum`. The
  pool is already a frozen id list, so the eligible set cannot drift underneath a live
  draft, and Mega-capability keeps one source of truth. Rejected duplicating up to ~74 ids
  per Mega round into the log.
- **D-08:** **A slot's type is derived from the schedule by index, never stored on the
  pick.** Slot `i`'s type is `schedule[i].kind`. `selectTeams` already sizes slot arrays
  from `config.rounds` and files a round-`r` pick into slot `r - 1`, so the join exists.
  Sync rule 3 (nothing derived is stored), and more concretely: a second copy of the
  constraint could disagree with the first after a migration, and the runtime validator
  that would have caught it is gone by design.

### Mega Bans and RULE-09

- **D-09:** **Mega bans are per Mega forme, not per species.** The host can ban
  Charizardite X while leaving Mega-Y legal. The roster carries `megaFormes[]` per entry;
  measured, there are 74 Mega-capable entries, 76 Mega formes, and exactly two dual-Mega
  species (Charizard, Raichu). This is the finer of the two options and was chosen
  deliberately over mirroring D-11's species-only shape. Consequences the planner owns: a
  species is Mega-eligible when it has **at least one** legal forme, and RULE-09's count is
  over eligible *species*, not formes, because a player drafts a species.
- **D-10:** **A Mega ban beats DRFT-15's X/Y pin, and a species with zero legal formes
  simply leaves the Mega rounds.** Eligibility is "has at least one forme that is both
  unbanned and permitted by the X/Y/Either choice". Charizard pinned to X with X banned has
  no legal forme, so it is not offered in Mega rounds — and remains draftable in open
  rounds. One predicate, evaluated once; the RULE-09 count falls out of it automatically.
  No new error state and no tenth `FeasibilityCode` for the contradiction, because the
  contradiction has an honest reading: "Charizard cannot Mega here."
- **D-11:** **RULE-09 measures the drawn pool, post-ban.** Count pool entries that still
  have a legal Mega forme after Mega bans and X/Y pinning, and require
  `players × megaRounds ≤ that count`. The roster-wide figure REQUIREMENTS states can pass
  while the pool starves, which is exactly the mid-draft death RULE-07 exists to prevent.
  **This amends Phase 2's D-09 and the 02-CONTEXT deferral that says Phase 3's gate
  "consumes" the recorded `pool/built.megaCapableCount` rather than recomputing.** That
  count was measured *before* Mega bans existed, so it cannot be the gate's input. It
  remains useful as a pre-ban upper bound and as a cross-check that the pool and the roster
  still agree after a rotation. The config screen already holds the roster the gate needs.
- **D-12:** **The Mega-ban input reuses D-10's pair: a Mega-mode `PoolGrid` plus a
  typeahead chip list.** The grid is filtered to the 74 Mega-capable entries, and dual-Mega
  cells offer both formes. Same components and the same interaction the host just used one
  config group above, with search and type filters working in it for free. The two-forme
  affordance on a cell is the one genuinely new piece.

### Schedule Reorder and Display

- **D-13:** **RULE-06's reorder is config-time only, frozen at Start.** Config is already
  "everything decided before the first action and never changed afterwards"
  (`model.ts:111`), and because D-08 derives slot types from schedule position, a mid-draft
  reorder would retype slots players have already filled — with no validator left to catch
  the resulting violation.
- **D-14:** **The reorder control is up/down buttons per row.** Six rows reading
  "Round 3 — Mega" / "Round 4 — Open", each with move-up and move-down. Keyboard-operable
  and touch-reliable with no new dependency and no pointer-drag code. STACK rejects
  drag-and-drop libraries by name; D-19 (Phase 2) already set this precedent by choosing
  buttons over a draggable splitter.
- **D-15:** **The schedule renders in the board's existing `R1`…`R6` column headers**, with
  Mega rounds marked. CARD-02 is satisfied with no new real estate on a screen that
  criterion 5 already requires show the turn, the full board, and every team at once — and
  the marker sits directly above the column of slots it types, which also answers "which of
  my slots is the Mega one".
- **D-16:** **During a Mega round, D-34's All / Mega-capable / Non-Mega filter renders
  inert with a stated reason** — "Round 3 is a Mega round" — following exactly the pattern
  02-09 built for the pool expand control, **including shedding its inert ARIA when the
  round ends** (the WR-04 correction from Phase 2's review). The round's own restriction is
  stated in the pool header beside the count. DRFT-09's composition still holds: search and
  the type filters stay live and compose with the round restriction.

### Priority Cards — Flow

- **D-17:** **Card play is a distinct step per round, not inline and not a modal.** Between
  rounds the draft screen enters a card-play state showing every player's remaining hand
  (CARD-07), what has been played this round, and whose turn it is to play. When the last
  card lands, the resolved order renders (CARD-08) and picking begins. One thing is on the
  clock at a time, which is what a room reading one screen needs, and the state boundary
  makes "played but not yet resolved" unrepresentable.
- **D-18:** **Card-play order rotates the seeded starting order.** Round `r` begins with
  `order[(r - 1) % players]` and proceeds around, where `order` is the value already
  materialized into `draft/started`. Playing last is an advantage — you see every card
  already down — so the rotation is what makes it fair, and over six rounds at 4–6 players
  everyone holds the last seat a comparable number of times. Independent of card outcomes,
  so it cannot be manipulated, and it reuses a value the log already carries.
- **D-19:** **One action per card, then one resolution action.** `cards/played
  { playerId, value }` lands as each player commits, so the shared screen renders from the
  log rather than from component state and a refresh mid-bidding loses nothing. When the
  last card is down, `order/resolved { order, … }` materializes the result — which is what
  `selectors.ts:98-102` already prescribes ("the resolved order becomes another
  materialized log entry rather than a computation here"). Roughly `6 × players` extra
  actions against a log PROJECT.md sizes at 350–500.
- **D-20:** **Undo is one stack spanning cards and picks.** SHEL-06 says "the last action
  at any point", and a misplayed card is the same class of error as a misclicked pick — a
  host typing what someone called out over voice, which PROJECT.md names as the single most
  likely real-world failure. Undoing back past `order/resolved` un-resolves the round,
  which is honest: the order was computed from cards that no longer stand. **D-37's
  round-boundary confirm extends to cover that crossing.**

### Priority Cards — Legality and Tiebreak

- **D-21:** **CARD-04's no-repeat rule is enforced by constraining the offer, so the
  deadlock it otherwise creates is unrepresentable.** A card is playable only if playing it
  still leaves every later player in the round a legal card — a bipartite matching check
  over at most 8 players × 6 values, run per candidate, entirely in the pure core.
  Unplayable cards render inert with a reason. This is the same posture the compiler takes
  toward invalid teams: prevent, do not validate. **The deadlock is real and reachable —
  see `<specifics>` for the worked example.**
- **D-22:** **Ties break by who played the value first.** CARD-05 requires an explicit,
  visible, deterministic rule that never depends on player-entry order; the room watched
  the cards go down, so this needs one sentence and no state beyond the log's own ordering.
  It also counterweights the flow: playing late buys information, playing early buys
  tiebreak priority. **It uses no randomness, which makes `actions.ts:44`'s "`doc.rng` …
  reserved for the pure generator that Phase 3's priority-card tie-breaks will advance"
  stale — that comment must be corrected in the same change.**
- **D-23:** **Low plays first.** `1` is the strongest card: play it and you pick first this
  round. Matches PROJECT.md's "when to burn your 1" and the priority conventions players
  bring from other games. The resolved order is an ascending sort of played values, ties by
  play order per D-22.
- **D-24:** **Remaining hands render in the board rows.** Each player's board row gains a
  compact hand strip — six pips, spent ones struck through — on the line that already
  carries their name and team. Scales to 8 players by construction because the board
  already does, and "who still holds a 1" is read beside "what have they drafted". Costs
  board-pane width, which D-21 (Phase 2) already made tight — the planner must check this
  against the ~108px-per-cell figure in `<specifics>`.

### Swaps — Mid-Draft

- **D-25:** **A swap is spent while you are on the clock, and your round pick still
  happens.** Being on the clock is when a swap may be spent; the turn still ends by filling
  the round's slot. A swap replaces a team member and never fills a new slot, so charging
  the turn for it would leave the team short of six and break DRFT-04. The swap's cost is
  the budget (SWAP-01), not a lost pick. Keeps one thing on the clock, keeps the turn
  indicator's meaning single, and keeps round arithmetic deriving from filled slots.
- **D-26:** **The swapped-out Pokémon returns to the pool for everyone.** PROJECT.md
  describes a swap round as "drops a team member back to the pool and takes any leftover".
  Keeps the pool a conserved set, makes a later swapper's options include what an earlier
  one discarded, and gives the ×1.5 / ×2 presets their purpose. `selectAvailablePool`
  computes availability as pool minus picked, so a returned id falls out of the same
  subtraction rather than needing a second list.
- **D-27:** **A swap starts by clicking your own filled slot, then the pool.** Selecting
  the slot is what names the predicate, so the leftover pool filters correctly on the first
  frame (SWAP-06) and "a Mega slot cannot be swapped into a non-Mega Pokémon" (SWAP-05) is
  true by construction rather than by rejection — which is the whole point of removing
  runtime validation. Board cells are already buttons (`MonChip`), so the affordance
  exists; it needs a swap mode and a confirm.

### Swaps — Dedicated Rounds

- **D-28:** **Swap-round order is the reverse of the last pick round's resolved order.**
  SWAP-04 requires a stated pick-order source because every priority card is spent by then.
  Whoever picked last in round 6 swaps first — computed from a value the log already holds,
  with no new randomness and no new config field. On screen as one sentence: "Swap order
  reverses round 6."
- **D-29:** **One swap budget, spent either way.** A dedicated swap round is a structured
  opportunity to spend the same SWAP-01 budget, not a separate allowance. One number for a
  player to track and one number on screen. Matches PROJECT.md's framing of swaps as "both
  mid-draft currency and post-draft rounds" — one thing, two moments. Passing (SWAP-07) is
  what you do when you are out of budget or simply content.
- **D-30:** **Swap-round count is a host-set number, default 0.** One numeric field beside
  the swap budget, following D-06 (Phase 2)'s precedent that numeric config is a free input
  judged by the feasibility gate rather than clamped. Default 0 makes SWAP-03's "host can
  enable" genuinely opt-in, and a group that does not want swap rounds never sees the
  screen. The budget caps what a player can actually do across them.
- **D-31:** **Two completion states, and the existing selector keeps its meaning.**
  Picks-complete ends the pick phase and starts the swap rounds; tournament-complete fires
  when the last swap round closes. The completed-draft view, the per-player export panels,
  and PERS-06's completion checkpoint hang off the **second**, so nobody copies a paste
  that is about to change. `selectIsComplete` keeps its current definition — every player
  holds `config.rounds` picks — and a second selector names the new state, which keeps
  every existing caller correct rather than silently retyping it.
- **D-32:** **Exact pool + swap rounds is a warning, not a blocker.** At D-05 (Phase 2)'s
  Exact preset the pool is exactly `players × rounds`, so when the last pick lands the pool
  is empty and the first swapper can only take what someone else drops. Exact is the
  default and passes every blocking check, which is precisely why D-14 (Phase 2) has a
  second severity. The reason states the arithmetic. The config is satisfiable, just
  degenerate — and the second and later swappers do have the first swapper's drop.

### Claude's Discretion

The user selected a concrete option on every question asked. These are the planner's and
researcher's calls, constrained by the decisions above rather than open:

- **The `SCHEMA_VERSION` 2 → 3 migration.** Config gains at minimum: the composition rule
  list (D-02), the Mega-forme ban list (D-09), the swap budget (SWAP-01), and the
  swap-round count (D-30). `migrate.ts` owns the upgrade and **three sites compare
  `schemaVersion`** — `store.ts`, `adapters/persistence.ts` (the *wrapper* record, before
  `isValidTournament`), and `import-guard.ts`. Phase 2's decision 4 records that missing
  `persistence.ts` makes "Resume saved draft" silently never appear for an older save, and
  that this is invisible to import-only tests. Every new field needs a lossless default.
- **Where the new config controls sit in the form's group order**, and their exact labels.
  The `Mega rules` group is the obvious home for Mega-forme bans and the schedule preview;
  swaps have no group yet. 02-UI-SPEC's group-order table is the reference.
- **Exact copy strings** for the new feasibility reasons, the round-restriction statement,
  the inert-control reasons, the tiebreak sentence, and the swap-order sentence. CLAUDE.md
  §Copy and D-15 / D-39 (Phase 2) are binding: a sentence plus the numbers, verb-object
  buttons, nothing labelled OK / Submit / Yes / Cancel alone.
- **Which selectors are added versus extended** in `src/core/selectors.ts`, and whether the
  card-legality matching check lives there or in its own module.
- **The card-play step's own layout and its legibility target.** DRFT-14 is an acceptance
  criterion for the whole shared screen, not just the two panes; D-23 (Phase 2)'s numeric
  target plus physical check is the pattern to follow.
- **Whether the pool re-roll (D-07, Phase 2) stays available once a schedule is compiled**,
  and how a re-roll interacts with the RULE-09 gate's pool-based measurement.
- **Keyboard and touch support on the new surfaces**, carried forward from Phase 2's
  discretion list. `use-roving-tabindex.ts` already ships generalized for this.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project scope and requirements

- `.planning/PROJECT.md` — Core value, Constraints, and the Key Decisions table. Four rows
  bear directly on this phase and are locked: "Composition rules compile to round
  structure", "Compiled rounds type the team slots", "Priority cards: open sequential,
  count derived from rounds", and "Swaps as both mid-draft currency and post-draft rounds".
  §Context "Round structure as constraint solver" and "Priority cards were redesigned" are
  the design rationale D-01 and D-17…D-23 implement.
- `.planning/REQUIREMENTS.md` — Full text of this phase's 23 requirements: DRFT-04
  (line 52), CARD-01…08 (lines 68–75), RULE-01…06 and RULE-09 (lines 79–87), SWAP-01…07
  (lines 102–108). Also read RULE-08 and BAN-03…07 to see what is deliberately Phase 4.
  **Note:** D-11 amends how RULE-09's inequality is measured, and D-04 settles a "minimum"
  reading of `megasRequiredPerTeam` that RULE-03 leaves open.
- `.planning/ROADMAP.md` §"Phase 3: Compiled Rules, Priority Cards, Swaps" — Goal, the five
  success criteria that define done, and the Notes block (research need HIGH on the
  compiler, MEDIUM on the card redesign). §"Ordering Constraints" 3 and 6 are both binding:
  3 forces compiler-before-swaps; 6 places Mega feasibility here.

### Architecture — binding

- `.planning/research/ARCHITECTURE.md` — Read before planning.
  - §"Pattern 1: Append-Only Action Log + Pure Reducer" — `schedule/compiled`,
    `cards/played`, `order/resolved`, and the swap actions all go through `dispatch`;
    nothing mutates the document.
  - §"Pattern 5: Materialize External Results Into the Log" — the argument behind D-05 and
    D-19, and the reason D-07 stops short of materializing eligible id lists.
  - §"Sync-Readiness: Concrete Structural Rules" 1–19 — non-negotiable. Rule 3 (nothing
    derived is stored) is what makes D-08 derive slot types rather than store them. Rule 14
    (nothing order-sensitive from `Object.keys()`) governs every new list. Rule 18's CI grep
    is `npm run check:pure`.
- `.planning/research/STACK.md` — Pinned versions and the "what NOT to use" table. It
  rejects drag-and-drop libraries by name, which is why D-14 uses buttons.
- `.planning/research/PITFALLS.md` — Roster classification traps. Bears on D-09 and D-10:
  `Meowstic-M-Mega` has `battleOnly: "Meowstic"` with no `-M`, and filtering ids by
  `includes('mega')` returns Meganium. Forme identity comes from `megaFormes[].id`, never
  from string surgery on a name.
- `.planning/research/FEATURES.md`, `.planning/research/SUMMARY.md` — feature-level
  research and cross-cutting synthesis.

### Phase 2 output — the ground this phase builds on

- `.planning/phases/02-host-configured-draft-night/02-CONTEXT.md` — **D-05, D-07, D-08,
  D-09, D-10, D-11, D-13, D-14, D-15, D-18, D-19, D-21, D-34, D-36, D-37, D-38, D-39 are
  all load-bearing here.** Its `<deferred>` section names the two items this phase owes:
  Mega-forme bans, and the RULE-09 gate. **Its statement that Phase 3's gate "consumes"
  the recorded `megaCapableCount` rather than recomputing is amended by D-11 above** —
  follow D-11, not the deferral.
- `.planning/phases/02-host-configured-draft-night/02-RESEARCH.md` — Authoritative on
  feasibility arithmetic and the measured roster figures. Its corrected 10-case precedence
  order supersedes 02-UI-SPEC §5's 7-item list; the new RULE-09 and swap-round reasons slot
  into that order.
- `.planning/phases/02-host-configured-draft-night/02-UI-SPEC.md` — The approved design
  contract, including the token table with measured contrast ratios, the config-screen
  group-order table, and the Copywriting Contract. **Deliberately stale on its feasibility
  precedence list** — see above.
- `.planning/phases/02-host-configured-draft-night/02-VERIFICATION.md` and `02-UAT.md` —
  What was actually verified, including the D-23 three-metre legibility check.
- `.planning/phases/02-host-configured-draft-night/02-REVIEW.md`, `02-REVIEW-FIX.md` — The
  WR-01…WR-08 findings. WR-04 (a reused button must shed its inert ARIA on collapse) is
  directly reused by D-16 and D-21.
- `.planning/phases/01-draft-skeleton-on-a-real-url/01-CONTEXT.md` — D-08 (one-click pick)
  and D-10 (unlimited undo, narrowed by Phase 2's D-37 and extended by D-20 here).
- `.planning/phases/01-draft-skeleton-on-a-real-url/01-UI-SPEC.md` — The token table format
  any new token must follow.

### Project instructions

- `CLAUDE.md` — §Conventions and §Architecture describe the repo as it is. Binding on this
  phase: the Identity rule (`id` for every comparison and set membership; never `split('-')`
  a species name — critical for D-09's forme ids), Serializability (no `Set`, `Map`, `Date`
  or class instance ever persisted — the D-21 matching check's sets are computation-local),
  `seq` allocation as `max(seq) + 1` with gaps permitted, the Copy rule, the Styling rule,
  and `npm run verify` as the single gate.
- `src/core/README.md` — The purity boundary as the code states it. The compiler, the
  card-legality check, the tiebreak, the swap predicates, and the RULE-09 gate are all core
  logic and must be pure.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`src/core/feasibility.ts`** (17 KB) — `checkFeasibility` collects **all** problems and
  sorts them by a declared `PRECEDENCE`, unlike `canApply` in `reduce.ts` which returns the
  first failure. The RULE-09 reason (D-11) and the Exact-plus-swap-rounds warning (D-32) are
  new `FeasibilityCode` members plus new precedence rows. Its module comment explains why
  numeric fields are `number | null` — an empty `<input type="number">` yields `NaN` and
  every comparison with `NaN` is false, so the gate would report all-clear on a broken
  config. **The new swap-budget and swap-round-count fields inherit that rule.**
- **`src/core/selectors.ts`** — `selectCurrentTurn` (line 103) is the seam: its own comment
  says the resolved order becomes a materialized log entry in this phase. `selectTeams`
  (line 63) files a round-`r` pick into slot `r - 1`, which is the join D-08 uses.
  `selectAvailablePool` (line 40) is pool minus picked, which is what makes D-26's return
  free. `selectStartingOrder` (line 135) sorts ids before shuffling, so the outcome depends
  on the *set* of players and the seed, never on entry order — the property D-18 rotates.
- **`src/core/actions.ts`** — The vocabulary to extend. Every new action needs five things:
  the payload interface, the creator (payload only, never the envelope), the discriminant
  constant, the structural guard (an imported document is untrusted — a `cards/played` with
  no `value` must fold to "ignored"), and a `Intent` union member. Phase 2's decision 6
  records that a new payload field must land in **four** places or it is silently dropped on
  round trip.
- **`src/core/undo.ts`** — `lastPickAction`, `canUndo`, `undoLast`, and
  `undoCrossesRoundBoundary` already exist. D-20 generalizes "last pick" to "last action",
  and D-37's boundary confirm extends to the `order/resolved` crossing.
- **`src/core/search.ts`** — `PoolFilters` / `compileFilters` / `matchesFilters`. The
  round restriction (D-16) composes as a **separate** constraint alongside the compiled
  filters, per Phase 2's D-34 which shaped the Mega control specifically so Phase 3 could
  add this without reshaping it.
- **`src/core/bans.ts`** — `bannedEntries` for the species banlist. The Mega-forme ban list
  (D-09) is a sibling, not an extension: it is keyed by forme id, not roster-entry id.
- **`src/ui/components/PoolGrid.tsx` + `FilterBar.tsx` + `TypeaheadField.tsx` +
  `BanChipList.tsx`** — D-12's Mega-mode banlist reuses the exact pair D-10 built.
- **`src/ui/components/BoardGrid.tsx` + `TeamStrip.tsx` + `MonChip.tsx`** — DRFT-10 and
  DRFT-11 are already one surface; a board row *is* a `TeamStrip` returning a fragment into
  the parent grid. D-15's Mega markers go in the round headers, D-24's hand strips go in the
  rows, and D-27's swap flow makes `MonChip` a swap-target button.
- **`src/ui/components/Dialog.tsx` + `ConfirmDialog.tsx` + `confirm-copy.ts`** — The confirm
  pattern (Phase 2's D-38). The swap confirm and the extended undo confirm both reuse it.
- **`src/ui/components/SegmentedControl.tsx`, `NumericField.tsx`** — The controls the new
  config fields are built from; `NumericField` already implements D-06's no-clamp rule.
- **`src/ui/use-roving-tabindex.ts`** — Shipped generalized in 02-08 for exactly this kind
  of new consumer; the reorder list and the card-play hand are candidates.

### Established Patterns

- **`dispatch` in `src/store.ts` is the only write path.** Config authored before Start is
  pre-document form state; everything after is an action. `ConfigScreen.tsx`'s module
  comment is explicit that the banlist "most looks like it wants an action and most does
  not" — and that adding a ban action "would be a Phase 3 schema decision rather than a
  convenience". D-13 declines it: reorder is config-time, so the schedule needs no
  mid-draft mutation either.
- **`npm run check:pure` fails the build** on any DOM, clock, randomness, network, storage,
  or `preact` import under `src/core/`. The compiler, the matching check, the tiebreak, the
  swap predicates, and the RULE-09 gate all live there.
- **`npm run check:nohtml`**, and **`npm run verify`** (`check:pure`, `check:nohtml`,
  `test`, `build`) as the single gate before every commit.
- **`tests/core/**` mirrors `src/core/**` with zero mocks.** Default environment is `node`;
  a UI test opts in with `// @vitest-environment happy-dom` as the **first** line. `announce`
  is a module-level signal and needs resetting in `beforeEach`.
- **One stylesheet per component, beside it. No raw hex, no raw px** where a token covers it.
- **`seq` is `max(seq) + 1`, never `log.length`,** and may have gaps.

### Integration Points

- **`src/core/model.ts:39`** — `SCHEMA_VERSION = 2` bumps to 3. `TournamentConfig`
  (line 121) gains the rule list, the Mega-forme ban list, the swap budget, and the
  swap-round count. **`copyConfig` (line 207) must copy every new field element by element**
  — its comment explains that TypeScript catches an omitted field but cannot see a shallow
  copy, and that `fold` runs `initialState` on every undo, so a shared array surfaces as
  "undoing a pick changed the banlist".
- **`src/core/migrate.ts`** — Owns the 2 → 3 upgrade. It is the only module that knows how;
  `store.ts`, `adapters/persistence.ts` and `import-guard.ts` all route through it.
- **`src/core/import-guard.ts`** (28 KB) — Every new action type and payload field needs a
  structural guard and a bound. Phase 2's decision 5 keeps its "a bound is not an integrity
  check" posture: run `checkFeasibility` on adopted documents and show a non-blocking
  notice rather than adding referential-integrity checks.
- **`src/ui/screens/ConfigScreen.tsx`** — `const ROUNDS = 6` at line 82, five config groups
  in a declared order, and `createTournament` as the seam. Gains the schedule preview and
  reorder (D-13/D-14), the Mega-ban surface (D-12), and the swap fields (D-29/D-30).
- **`src/app.tsx`** — Routes the screens; gains the card-play step (D-17) and the
  swap-round state (D-31). Line 212's "Restore before creating, never after" marks the
  load-order constraint.
- **`public/data/roster.mb.json`** — 235 draftable entries, 74 Mega-capable, 76 Mega
  formes, 18 types, exactly 2 dual-Mega species. Loaded via `src/adapters/roster-source.ts`.

</code_context>

<specifics>
## Specific Ideas

- **The CARD-04 deadlock is real, reachable, and was found during this discussion.** The
  no-repeat rule can strand a player with cards in hand and no legal play. Smallest case,
  3 players / 3 rounds: R1 `P1→1, P2→2, P3→3`. R2 `P1→2, P2→1` — now P3 holds `{1, 2}`,
  both already played this round, and has nothing legal. The same mechanism reaches 4–6
  players over 6 rounds, most easily in the late rounds when hands are small: a player is
  stuck in round `r` whenever their remaining hand of `7 − r` values is a subset of the
  `≤ players − 1` values already down. D-21 constrains the offer so this state cannot be
  entered. **This must be a test, not a comment.**

- **Three code comments become false in this phase and must be corrected in the same change
  that breaks them.** A stale contract comment is worse than no comment, because the next
  reader trusts it. Phase 2 set this precedent with `tokens.css`.
  1. `src/core/actions.ts:44-47` — "`doc.rng` is a single `{ seed, cursor }` reserved for
     the pure generator that Phase 3's priority-card tie-breaks will advance." D-22 breaks
     the tie with play order and consumes no randomness. Either re-reserve `doc.rng` for a
     named future consumer or say plainly that nothing advances it.
  2. `src/ui/screens/ConfigScreen.tsx:78-82` — "Phase 3 makes the round count a host
     decision." D-06 says it does not; `ROUNDS = 6` stays, and the point of the constant
     (one place rather than a `6` scattered through four derivations) is what actually
     carries forward.
  3. `src/core/selectors.ts:98-102` — "**Phase 2** replaces this with priority-card
     resolution." It is Phase 3, and this phase is the one that does it.

- **`PROJECT.md`'s "cards are `1..R` … not fixed at 6" is satisfied, not contradicted.**
  D-06 keeps `R = config.rounds`, which is 6 — the requirement is that no derivation
  hardcodes the literal, and that holds.

- **The board pane's width is still the binding layout constraint.** At 40% of 1920px the
  board has roughly 108px per round cell after the player-name column — the number that
  drove Phase 2's D-21 (sprite-only cells in split view), D-28 (three-letter type codes),
  and D-19 (discrete expand states). D-24's hand strips and D-15's Mega markers both spend
  from that same budget and must be checked against it, not assumed into it.

- **Measured roster facts the decisions rest on**, read from `public/data/roster.mb.json`:
  235 draftable rows, 74 Mega-capable entries, 73 distinct Mega-capable base species, 76
  Mega formes, 18 types, **exactly two dual-Mega species — Charizard and Raichu**. D-09's
  per-forme granularity is meaningful for exactly those two rows plus whatever a future
  regulation adds; D-12's Mega-mode grid renders 74 cells, not 235.
  *(Note: PROJECT.md §Context names Meowstic as a third dual-Mega species and cites 73
  Mega-capable. The measured snapshot says otherwise. Trust the snapshot, and derive rows
  from `megaFormes.length > 1` per Phase 2's D-03 — never a hardcoded list.)*

- **Two Phase 2 decisions are amended here, deliberately.** D-09 (Phase 2)'s promise that
  the recorded `megaCapableCount` would be the RULE-09 gate's input — amended by D-11,
  because that count predates Mega bans. And D-37 (Phase 2)'s undo-confirm boundary —
  extended by D-20 to cover un-resolving a round's card play.

- **"The compiler deliberately removes runtime validation" is the load-bearing sentence of
  the phase.** Every decision that could have been "validate and reject" was resolved as
  "constrain the offer so the invalid state is unreachable": D-04 (slot decides Mega
  export), D-10 (a species with no legal forme simply is not offered), D-16 (the filter goes
  inert rather than returning nothing), D-21 (illegal cards are not playable), D-27
  (slot-first, so the pool is pre-filtered). A planner reaching for a post-hoc check should
  treat that as a signal the constraint belongs upstream.

</specifics>

<deferred>
## Deferred Ideas

No out-of-phase capabilities were proposed — discussion stayed inside the phase boundary.
Three items were considered and consciously routed elsewhere:

- **Composition rule kinds beyond a Mega count** — type minimums ("at least one Water"),
  stat thresholds, fully-evolved-only, and a general predicate-count builder. D-01 keeps v1
  to one rule kind, and D-02 shapes the config so a second kind is a new union member
  rather than a rewrite. This is adjacent to the existing v2 items RULE-10 (overlap
  warnings) and RULE-11 (a full generic schedule editor) in `REQUIREMENTS.md`; a new rule
  kind would also need its own feasibility stratum and a draw constrained on more than one
  axis at once.

- **Mid-draft schedule reorder** — moving a round that has not started yet, so a group can
  say "let's do the Mega round last after all". D-13 keeps reorder at config time because
  D-08 derives slot types from schedule position. Would need a `schedule/reordered` action,
  a rule about which rounds are still movable, and board headers that change mid-draft.

- **Host-selectable team size** — the option that would have made "the compiled number of
  rounds" literally true. D-06 declines it: DRFT-04 says six, and a shorter team exports a
  paste Showdown accepts but a Champions match does not. Revisit only if a group actually
  asks for quick three-pick drafts.

</deferred>

---

*Phase: 3-Compiled Rules, Priority Cards, Swaps*
*Context gathered: 2026-08-15*
