# Phase 4: Blind and Snake Bans - Context

**Gathered:** 2026-08-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Per-player ban rituals. Snake mode runs bans in turn order with previous bans visible on the
shared screen. Blind mode collects each player's bans behind a full-screen shield and reveals
them all together, attributed, before the pool is drawn. The duplicate-collision outcome is
displayed rather than silently absorbed, and feasibility is re-checked against the post-ban
pool before the draft is allowed to start.

Covers 6 requirements: BAN-03, BAN-04, BAN-05, BAN-06, BAN-07 (partially — see D-19), RULE-08.

**Explicitly not this phase:** round robin, standings, brackets, match records, the draft
recap, and roster refresh — all Phase 5 · the host banlist itself (BAN-01, BAN-02, BAN-08 all
shipped in Phase 2) · the Mega-forme ban surface (shipped in Phase 3) · the re-ban duplicate
policy (descoped, see D-19) · every-player-on-their-own-device multi-client play (see
`<deferred>`).

**The load-bearing reframe.** The host is the scribe. Players hand their bans over out of band
— Discord, usually — and the host types them in on the shared machine. True hot-seating, where
the device is physically passed around, is the exception rather than the norm. This is stated
by the project owner and it is what makes D-03, D-04 and D-05 the shape they are. BAN-05's
"pass-the-device interstitial" is therefore satisfied as a full-screen shield defending against
the room reading the screen over the host's shoulder, not as a per-player identity handshake.
Do not re-derive the design from the requirement's wording without reading this paragraph.

</domain>

<decisions>
## Implementation Decisions

### The Ban Stage

- **D-01:** **Ban mode stays a config-screen choice and `hostBanlist` keeps today's path
  exactly.** Picking `hostBanlist` changes nothing: the pool is drawn on the config screen and
  `createTournament` stays the atomic three-dispatch seam it is at `store.ts:220-265`. Only
  `blind` and `snake` route anywhere new. This deliberately accepts two places that decide when
  a pool gets built, in exchange for zero regression risk on the mode that already passed Phase
  2 verification. The alternative — one seam for all three modes — was considered and rejected
  on that basis.
- **D-02:** **Blind and snake route to a draft-style stage that runs before the draft begins.**
  Shared-screen shell, the same visual language as the draft, sequenced ahead of it. The stage
  renders the full roster rather than a pool, because the pool does not exist yet — which is
  exactly what Phase 2's D-10 ban-mode `PoolGrid` already does with all 235 entries. Whether
  this is literally a fourth `Screen` member or a mode inside the draft screen is left to
  planning; the requirement is that the draft screen's existing components keep their
  assumption that `poolIds` is populated.
- **D-03:** **Full undo throughout the ban stage, on the same single stack.** Phase 3
  established one undo stack for the whole log and that stands here. This is mandatory, not
  preferred: the host is entering other people's bans off a Discord message and will pick the
  wrong Pokémon. An abandon-only ban stage would suit a milestone where every player enters
  their own bans on their own device; it does not suit this one.
- **D-04:** **One entry flow serves both the host-as-scribe case and the hot-seat case.** The
  stage steps player by player and each step is shielded full-screen. Whoever is holding the
  device types — the host reading off Discord, or the player themselves. The tool never needs
  to know which, and there is no "I'm Sam" identity handshake to tap through. This satisfies
  BAN-05's full-screen-shield requirement literally while matching how the tool is actually
  run.
- **D-05:** **Nothing but progress is on screen until the reveal.** During blind entry the
  shared screen shows `3 of 6 entered` and no species name anywhere — not for the current
  player, not for the finished ones. A host who steps away cannot leave a leak on screen, and
  the "no other player's ban is visible before the reveal" criterion holds with zero discipline
  required from the room. Undo still works during this window; it removes the last entry
  without re-displaying it.

### Secrecy and the Log

- **D-06:** **Pre-reveal blind submissions are plaintext in the log.** `bans/submitted` carries
  `{ playerId, monIds }` in the clear. The defence is the screen shield, not the file: the host
  typed every ban off Discord and already knows all of them, so the log holds nothing the host
  does not have. Obfuscation-at-rest and a commit-then-reveal hash scheme were both considered
  and rejected — the former is a speed bump that adds a second representation of a ban id
  against CLAUDE.md §Identity, and the latter needs `crypto.subtle`, which is async, would land
  in an adapter, and would leave the pure reducer unable to verify its own log. It also solves
  a cheating problem that host-as-scribe makes structurally impossible.
- **D-07:** **Submissions are log actions because undo is a log operation.** This is a derived
  constraint, not a preference: D-03 makes full undo mandatory, undo re-folds the log, and an
  in-memory holding pen cannot be undone. Crash recovery falls out for free. Planning must not
  "improve" secrecy by keeping submissions out of the log — that silently removes undo.
- **D-08:** **The reveal is host-triggered.** The last submission drops the shield to a
  `6 of 6 entered — Reveal bans` state showing nothing, and the host taps when the room is
  gathered. An automatic reveal on the last submission would show everyone's bans to the last
  player while they are still standing at the screen alone, which is the small unfairness the
  ritual exists to avoid.
- **D-09:** **Autosave runs during the ban stage; the PERS-06 JSON checkpoint does not.**
  localStorage autosave is what makes a crash mid-ban recoverable and is same-origin, so nobody
  reads it without the machine. The automatic JSON checkpoint produces a *file* the host might
  hand around, and handing around unrevealed bans defeats the mode. The checkpoint fires after
  the reveal instead.

### Ban Counts and Order

- **D-10:** **`bansPerPlayer` is a new `TournamentConfig` field — schema bump 3 → 4.** The host
  types a number beside the ban-mode selector, in the same shape `swapBudget` and `swapRounds`
  already take. The feasibility gate reads it (see D-21), so an over-banned configuration is
  caught at config time, before anyone has banned anything. A derived default was rejected on
  Phase 3 D-30's reasoning: it would be a second authority on what is sensible, sitting beside
  the gate that already owns satisfiability.
- **D-11:** **`draft/started` moves ahead of the ban stage.** The starting order is resolved
  first and the ban stage reads it, so DRFT-16's randomizer stays the single source of turn
  order for the whole night — bans and picks alike. This requires `draft/started` to stop
  implying "the pool exists"; that is a doc-comment and structural-guard change, not new
  machinery. A separate `bans/ordered` action with its own seed was rejected because two orders
  in one tournament invite the group to assume they match.
- **D-12:** **Snake is a true serpentine** — `1→2→3→4`, then `4→3→2→1`, repeating until every
  player has their allotment. This is what "snake" means everywhere else in drafting, so it
  needs no explanation at the table, and it corrects the first-mover advantage a straight
  rotation would compound on every pass.

### Where Revealed Bans Land

- **D-13:** **`bans/revealed` keeps attribution** — `{ playerId, monIds }[]`, folded to a flat
  set by the pool draw. Attribution costs nothing to store and buys two things: the reveal
  screen can say "Sam banned Garchomp", which is the entire social payoff of blind mode, and
  Phase 5's draft recap — rendered straight from the action log — gets the ban round for free.
- **D-14:** **Revealed bans are a log action, never written back into `config.bans`.**
  `TournamentConfig` is documented at `model.ts` as "everything decided before the first action
  and never changed afterwards". The pool draw therefore reads the fold — host bans ∪ player
  bans — rather than a mutated config. This is a hard architectural constraint, not a
  preference.
- **D-15:** **The host banlist coexists with player bans in every mode.** The host still wants
  to remove the obviously-broken thing before players spend their own bans on it. BAN-02
  constrains host mode ("no per-player bans"), not the reverse. Note that Phase 3's
  `megaFormeBans` has no choice about this — the compiler needs it regardless of ban mode — so
  a host ban surface is on the config screen in blind and snake anyway.
- **D-16:** **Players ban species only.** One flat list of species ids, matching Phase 2's D-11
  and reusing the ban-mode `PoolGrid` exactly as it ships. Mega-forme bans stay a host tool —
  that is what Phase 3's 76-cell surface was built for. Keeps the ritual explainable at the
  table in one sentence and keeps the draw on one predicate.

### BAN-06 — The Back-Button Guard

- **D-17:** **`pageshow` with `event.persisted`, mirroring `tab-lock.ts:624-636`.** The app has
  no router — `Screen` is `useState` at `app.tsx:474` and nothing touches `history` — so "back"
  means leaving the page and the return path is a bfcache restore. On a persisted `pageshow`,
  force the ban stage to its locked state. History-push plus `popstate` was rejected: it
  introduces history management to an app that deliberately has none, and every other screen
  would then have to decide whether it participates.
- **D-18:** **A half-finished entry is discarded on restore, and `visibilitychange` to hidden
  also locks.** Mid-entry selections live in component state and die with it; the restore lands
  on the locked screen and the player re-enters. Nothing half-private needs to survive a
  restore, which means there is no state for a leak bug to live in. Already-locked submissions
  are in the log and are untouched. The `visibilitychange` lock covers the ordinary room
  mishap: the host alt-tabs to Discord to read the next player's bans and comes back to an
  exposed screen.

### BAN-07 — Duplicate Policy

- **D-19:** **No re-ban is built. Collisions resolve as "both apply, one wasted", named
  explicitly at the reveal.** Both players' bans are recorded and attributed (D-13), the
  species is banned once, and the reveal renders a row saying so. The config screen still ships
  the duplicate-policy control with `Re-ban — not yet available` rendered disabled — exactly
  the move Phase 2's D-12 used for blind and snake themselves, so BAN-07's config-time shape is
  settled now rather than rearranged around a late arrival, and a later milestone enables an
  option instead of adding a control plus a schema bump.

  **This is a deliberate, owner-approved narrowing of a written requirement.** BAN-07 and
  ROADMAP Phase 4 success criterion 4 both say the host *selects* between "both apply with one
  wasted" **or** "a collision grants a re-ban". Only the first branch is built. BAN-07 must be
  recorded as partially satisfied rather than complete, and the verifier must not be allowed to
  score success criterion 4 green on the re-ban clause.
- **D-20:** **The duplicate policy is blind-mode-only, and the control says so.** In snake mode
  previous bans are visible (BAN-03), so the ban surface renders already-banned species as
  unavailable and a collision is impossible by construction. Offering a policy choice that can
  never fire in snake would be a control with no effect.

### RULE-08 — The Post-Reveal Re-Check

- **D-21:** **The config-time gate is fully pessimistic about player bans.** It assumes every
  player ban lands on a Mega-capable species and blocks unless
  `players × megaRounds ≤ megaEligible − megaBans − players × bansPerPlayer`. This matches the
  project's stated posture that the group never discovers a dead draft mid-session (RULE-07,
  Phase 2 D-14). With roughly 74 Mega-eligible species the bound is rarely binding at 4–8
  players, so it costs almost nothing in practice.

  Note the arithmetic that makes RULE-08 belt-and-braces rather than a live trap: a collision
  *wastes* a ban rather than removing an extra species, so the post-reveal pool is always at
  least as large as the config-time worst case on raw size. The only thing the config gate
  cannot predict is *which* species get banned — specifically how many land on Mega-capable
  ones, which is where RULE-09's arithmetic bites.
- **D-22:** **A failed post-reveal check blocks, and the only exit is abandoning back to
  config.** The reveal shows the arithmetic and Start stays disabled. There is no config edit
  to offer, because `TournamentConfig` never changes after creation (D-14). Two alternatives
  were considered and rejected: a host-voids-specific-bans compensating action, which makes the
  host publicly overrule a named player with no rule to point at; and a `config/amended`
  action, which breaks the immutability `model.ts` states in as many words and would reach
  migration, the import guard and the compiler. With D-21's pessimistic gate this remedy is
  near-unreachable, which is the right cost profile for a harsh one.
- **D-23:** **The pool is drawn on a separate `Start draft` tap, after the reveal.** The reveal
  screen shows the bans, the attributions, the collisions and a feasibility line; the host then
  taps to draw the pool and dispatch `pool/built`. The group reads the reveal before the screen
  changes under them, and a failed RULE-08 check never has to un-draw anything.

### Claude's Discretion

These were surfaced as gray areas and deliberately left to research and planning. Decide them,
record the reasoning, and do not re-ask the owner.

- **The interstitial's exact contract** — the handoff step sequence, whether a review-before-
  lock step exists, whether a panic/hide-now control exists, and the copy for each. D-04 and
  D-05 fix the constraints (one flow for both cases, no identity handshake, nothing visible
  until reveal); the sequence inside those constraints is open.
- **How snake mode displays previous bans** on the shared screen — a running list, a board, or
  a reuse of the existing `BanChipList` / top-bar `Bans (N)` disclosure from Phase 2's D-13.
  Note that D-13's disclosure copy and count now have to accommodate player bans, and
  `bannedEntries` in `src/core/bans.ts` is the one correct source of any displayed ban count.
- **Whether the live region can leak a ban name during blind entry.** `announce` is a
  module-level signal that outlives any render (CLAUDE.md §Tests). A polite announcement naming
  a banned species during entry would defeat D-05 through a channel the shield does not cover.
  Phase 3's screen-reader verification was descoped, so this must be reasoned about in code
  rather than confirmed by a manual pass.
- **Whether the reveal itself is undoable**, and what undoing it means for a pool that has not
  been drawn yet (D-23 means it has not been).
- **Three-metre legibility for every new surface** — DRFT-14 is an acceptance criterion for the
  whole shared screen, not a polish item, and the ban stage is a shared-screen surface.
- **The schema 3 → 4 migration** — `bansPerPlayer` and the duplicate-policy field both need
  lossless v3 defaults, and Phase 2's decision 4 names the three sites that compare
  `schemaVersion` and must all route through `migrate`: `store.ts:212`, `persistence.ts:222`
  (the wrapper record, *before* `isValidTournament`), and `import-guard.ts:444`. Missing
  `persistence.ts` makes `Resume saved draft` silently never appear for an older save, and that
  failure is invisible to import-only tests.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/ROADMAP.md` §"Phase 4: Blind and Snake Bans" — goal, the four success criteria,
  and the Notes flagging research need MEDIUM as a UX problem and BAN-06 as easy to get
  silently wrong
- `.planning/ROADMAP.md` §"Ordering Constraints" 4 — why host-banlist mode shipped in Phase 2
  and blind/snake sits this late
- `.planning/REQUIREMENTS.md` lines 86, 93–97 — RULE-08 and BAN-03…07 verbatim
- `.planning/PROJECT.md` §Requirements → Active → "Bans" — the same requirements in the
  owner's own words

### Decisions inherited from earlier phases
- `.planning/phases/02-host-configured-draft-night/02-CONTEXT.md` §"Host Banlist" (D-10…D-14)
  — two input surfaces over one flat list, species-only bans, BAN-08 taken literally, the
  disabled blind/snake selector this phase enables, and the feasibility gate's blocking-vs-
  warning split
- `.planning/phases/03-compiled-rules-priority-cards-swaps/03-CONTEXT.md` — the compiled
  schedule, `megaFormeBans`, and the RULE-09 Mega arithmetic that D-21 extends
- `.planning/STATE.md` §"Decisions locked before planning" items 4 and 6 — the three
  `schemaVersion` comparison sites, and the rule that a new payload field must land in four
  places (payload interface, creator, structural guard, `buildLogEntry`) or it is silently
  dropped on round trip

### Project-wide constraints
- `CLAUDE.md` §Architecture — one document, one write path, nothing derived is stored, ambient
  values stamped at the edge, externally derived results materialized into the log
- `CLAUDE.md` §Conventions — the purity boundary, identity by `id`, `seq` allocation,
  serializability, styling and copy rules

### Code the phase builds on
- `src/adapters/tab-lock.ts:624-636` — the working `pageshow` handler D-17 mirrors
- `src/core/bans.ts` — `bannedEntries`, the one correct source of any displayed ban count
- `src/store.ts:220-265` — `createTournament`, the atomic seam D-01 leaves intact for
  `hostBanlist` and D-11/D-23 reorder for blind and snake
- `src/core/model.ts` — `BanMode`, `TournamentConfig` and its immutability contract
- `src/ui/screens/ConfigScreen.tsx:275-278` — `BAN_MODE_OPTIONS`, the disabled entries this
  phase enables

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`src/ui/components/PoolGrid.tsx` in ban mode** (`banMode = bannedIds !== null`, line 474) —
  renders all 235 roster entries with click-to-toggle. This is already the player ban picker;
  it takes an `idPrefix` (Phase 3) so a second grid can mount alongside an existing one.
- **`src/ui/components/TypeaheadField.tsx` + `BanChipList.tsx`** — Phase 2's D-10 second input
  surface over the same flat list. Directly reusable for entering a player's bans by name,
  which is the likely host-as-scribe path (reading names off Discord).
- **`src/adapters/tab-lock.ts:624-636`** — a live `pageshow` handler including the
  `event.persisted` reasoning at lines 537-544. D-17's guard is the same shape against a
  different target state.
- **`src/core/bans.ts` `bannedEntries`** — resolves ids against the roster, dedupes, drops
  strangers, sorts by name for display. Its length is the ban count; `bans.length` never is.
- **`src/ui/components/SegmentedControl.tsx`** — what D-19's duplicate-policy control and the
  existing ban-mode selector both use, including the `disabled` member pattern.
- **`src/core/feasibility.ts`** — the `blocking` / `warning` split and the existing reason
  codes D-21 extends.

### Established Patterns
- **Append-only log, folded state.** Every ban is an action; nothing derived is stored. The
  pool draw reads the fold, never a mutated config (D-14).
- **Ambient values stamped at the edge.** Seeds, ids and timestamps are captured before the
  reducer sees them. A ban action carries `seq`, `at`, `actorId` like every other.
- **Constraint upstream of the click, not validation after it.** Phase 3's `selectCardOffer`
  and `selectRoundEligibleIds` both render an inert option with a stated reason rather than
  refusing a dispatch. A ban surface should render an already-banned species inert with a
  reason (D-20's snake case) rather than rejecting the click.
- **Purity boundary.** `bans/*` reducer arms, the serpentine order derivation, and the extended
  feasibility arithmetic are all `src/core/`; the shield, the `pageshow` guard and the
  `visibilitychange` lock are all `src/adapters/` or `src/ui/`. `npm run check:pure` enforces
  it in CI.

### Integration Points
- **`src/store.ts:220`** — `createTournament`. D-01 keeps it whole for `hostBanlist`; D-11 and
  D-23 split the pool draw out of it for blind and snake.
- **`src/app.tsx:120`** — the `Screen` union and the `inert` shell gate that wraps every screen
  (Phase 2 D-36 / quick task 260813-tep). Any new stage lands inside that gate, not beside it.
- **`src/core/model.ts` `TournamentConfig`** — gains `bansPerPlayer` and the duplicate-policy
  field; schema 3 → 4 across `migrate.ts`, `import-guard.ts`, `persistence.ts` and `store.ts`.
- **`src/core/actions.ts`** — new action family. Every new payload field must land in the
  payload interface, the creator, the structural guard and `buildLogEntry`.
- **`src/core/selectors.ts`** — the ban stage's turn/progress derivations belong here beside
  `selectCardTurn` and `selectStartingOrder`, not in a component.

</code_context>

<specifics>
## Specific Ideas

- **"The host will be grabbing banned mons from users outside of the program and then enter
  them in."** The project owner's own description of how the tool is used. Every entry-flow
  decision in this phase follows from it. A design that assumes players are queueing up to
  touch the device is designing for the exception.
- **"The host can accidentally pick the wrong mon so full undo is mandatory."** D-03 is not a
  convenience — it is the correction path for the primary input method.
- **Phase 2's D-12 is the template for D-19.** Rendering a not-yet-built option as a disabled
  member of a shipped control, labelled `Not yet available`, is an established move in this
  codebase (`ConfigScreen.tsx:277-278`). Reuse the label form exactly rather than inventing a
  second way to say it.

</specifics>

<deferred>
## Deferred Ideas

- **Everyone inside the tool on their own device, fantasy-football style.** The owner named
  this explicitly as belonging to a new milestone. It would flip the host-as-scribe assumption
  the entire phase rests on, and it would make abandon-only undo (rather than D-03's full undo)
  the correct call, because a player's private submission would no longer be something the host
  already knows. Multi-client sync is also exactly what CLAUDE.md's "one write path" seam was
  designed to accommodate: `dispatch` gains a `broadcast(action)` and a sibling
  `receive(remoteAction)`. Not this phase.
- **The re-ban duplicate policy.** Descoped per D-19, with the config control shipped disabled
  so a later milestone enables it rather than adding it. Tracked as BAN-07's unbuilt half.

</deferred>

---

*Phase: 4-Blind and Snake Bans*
*Context gathered: 2026-08-20*
