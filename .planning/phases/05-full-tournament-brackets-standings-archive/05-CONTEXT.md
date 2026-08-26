# Phase 5: Full Tournament — Brackets, Standings, Archive - Context

**Gathered:** 2026-08-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Everything after the last pick. `config.depth` — which ships today and is read by nothing —
starts deciding what the night does next: a round robin with standings, a seeded top-N cut,
a single-elimination bracket with byes at 5, 6 and 7 players, and match records that stay
correctable. Alongside it, a finished tournament stops dead-ending: it is filed into a
browsable library, it carries a recap folded straight from the action log, and the roster it
was played on can be refreshed to a new regulation from inside the app with a staleness
banner warning when the current snapshot has expired.

Covers 14 requirements: TOUR-01…09, PERS-08, PERS-09, REFR-01…03.

**Explicitly not this phase:** double elimination, Swiss, and consolation brackets (PROJECT.md
§Out of Scope — "losers-bracket layout is where bracket rendering code goes to die") ·
automatic multi-link tiebreak chains such as Buchholz (same section) · replay parsing · any
knowledge of where the games are actually played · live upstream roster parsing in the browser
· the free-text house-rules field, which is **TOUR-10 and lives in v2**, not here, despite
appearing in PROJECT.md's Active list.

**The clock on this phase.** M-B's `validUntil` is `2026-09-02` and today is `2026-08-25`.
REFR-03's staleness banner will fire within days of shipping, on the committed snapshot,
without anyone doing anything. This is not a hypothetical acceptance path.

</domain>

<decisions>
## Implementation Decisions

### Depth — What Each Tier Actually Generates

- **D-01:** **Both deeper depths run the same structure: round robin → seeded cut → single
  elimination. The third tier adds the match log, not the bracket.** `draftAndBrackets`
  records winners only. `draftBracketsAndLog` records the same structure plus TOUR-07's
  numeric field and the editable match history. This is TOUR-01's wording taken literally —
  the third tier's own name is "plus match log" — and it means the structural code has one
  shape rather than two. `draftOnly` skips every bracket screen entirely, which is ROADMAP
  criterion 1's first clause.
- **D-02:** **At `draftAndBrackets` the tiebreak chain is record → head-to-head → host
  override, and the differential column is simply not rendered.** This is D-01's direct
  consequence, not a separate choice: with no numeric field there is no differential to break
  a tie on. The standings table at tier 2 has two links where tier 3 has three, and the host
  reaches the manual override sooner. That is the honest cost of the lighter depth and it must
  be stated on screen rather than left for the room to notice. A greyed-out differential column
  was considered and rejected — an empty column is not the same statement as a table that has
  two tiebreak links.

### The Round Robin

- **D-03:** **Round robin is a fill-in-any-order results grid, not a generated round-by-round
  pairing schedule.** Every pairing is present from the moment the round robin starts and the
  host records results in whatever order the games actually happen. No circle-method schedule,
  no sit-out rounds at odd player counts, no round structure to keep in sync with reality.
  The consequence to design for: nothing in the tool tells the group what to play next, so the
  grid itself has to make "what is left" obvious at a glance.
- **D-04:** **The TOUR-07 metric — Pokémon remaining or KO differential — is a host choice at
  config time.** A new `TournamentConfig` field beside `depth`, in the same shape `swapBudget`,
  `swapRounds` and `bansPerPlayer` already take. The standings column header and the match
  input's label both read from it. Note it only has an effect at `draftBracketsAndLog` per
  D-01, which is a control-inertness question the codebase already has an established answer
  for (`SegmentedControl`'s disabled-member pattern, `ConfigScreen.tsx:275-278`).
- **D-05:** **Recording a match is ONE action carrying both the winner and the number.** A
  match is never half-recorded, so standings never have to read a match that has a winner and
  no differential, and TOUR-08's second link is never partly blind. The alternative — winner
  now, number later — was considered and rejected on that basis.

### The Cut and the Bracket

- **D-06:** **The top-N cut size is chosen AFTER the round robin, from the standings screen.**
  Not at config time. Nothing typed before the draft can be right about a tournament that has
  not been played yet, and a 5-player night that ends four-way tied should not be locked into a
  number chosen hours earlier. A config-time default that is confirmable later was explicitly
  rejected: two authorities on one number is a shape this codebase has refused repeatedly
  (Phase 3 D-30, Phase 4 D-10).
- **D-07:** **Byes go to the top seeds, standard bracket seeding.** Seed 1 first, then seed 2,
  and so on — 7 players take 1 bye, 6 take 2, 5 take 3. It needs no explanation at the table
  and it is the thing that makes seeding the cut worth doing. A seeded-RNG draw and a
  host-assigned bye were both rejected: neither has a rule to point at when somebody objects.
- **D-08:** **Best-of-three is set per stage — round robin and bracket separately.** Two config
  values, matching how real events actually run: Bo1 through the pool, Bo3 in the top cut. A
  match cell renders a 2-of-3 counter or a single winner depending on which stage it sits in.
  Per-match toggling was rejected because it would let standings compare matches played under
  different formats.

### Corrections — TOUR-06 Against an Append-Only Log

- **D-09:** **A correction is a second `match/recorded` for the same match id, and the fold
  reads the latest entry per match.** No `match/corrected` family and no clear-then-record
  pair. The fold must state in as many words that later beats earlier, or two entries silently
  disagree. The recap gets the whole correction history for free (see D-22).
- **D-10:** **A correction that changes who is in a downstream match ALSO appends an explicit
  clearing action naming the matches voided.** This is the decision that keeps the bracket from
  behaving surprisingly. If the fold merely ignored records whose participants no longer match,
  a host who corrected a semifinal, recorded a new final, then corrected the semifinal back
  would find the original final waiting for them — an outcome nothing on screen predicts. With
  an explicit clear: nothing resurrects, the recap shows exactly what was voided, and undo puts
  the whole correction back in one step. The host is told what will be cleared before
  confirming (DRFT-13 already requires the confirm).
- **D-11:** **Correcting a round-robin result after the cut has been taken invalidates the cut
  and everything after it.** Same rule as D-10, one level up: the standings change, so the
  seeding changes, so the bracket is no longer the bracket those standings produced. This is
  deliberately harsh and it is the consistent answer — a frozen round robin would make a
  late-discovered scoring error unfixable without abandoning the bracket, and a cut that
  survived would have to be materialized into the log and would then be free to disagree with
  the table above it.
- **D-12:** **Match records join the single undo stack that already covers picks, cards, swaps
  and bans.** Phase 3 established one stack for the whole log; Phase 4 kept it (D-03). Undo is
  the fast path for "that was the wrong winner"; the correction flow of D-09/D-10 is for a
  mistake three matches back.

### Standings and the Tiebreak

- **D-13:** **The TOUR-08 host override is: the host puts the still-tied block in an order by
  hand.** The standings show which players remain tied after record, differential and
  head-to-head, and the host orders them. Recorded as a log action naming exactly which players
  it resolved, so both the recap and the bracket seeding point at a deliberate host act rather
  than a silent sort. Picking a winner pair-by-pair was rejected — it lets the host produce a
  cycle. Typing seed numbers was rejected — it invites collisions and gaps.

### The Library — PERS-08

- **D-14:** **A capped multi-tournament library in `localStorage`, listed on the landing
  screen, holding WHOLE documents.** Each entry is the full log, re-foldable, re-exportable.
  A compacted summary was rejected outright: PERS-09's recap is folded from the action log, so
  a summary entry could never render one, and re-export and undo would go with it.

  **This is a deliberate expansion beyond the one-slot design that shipped in Phase 1**
  (`persistence.ts:39`, a single `champions-drafter:tournament` key). It is the owner's
  explicit choice. The cost is real and must be designed for rather than discovered: Safari
  deletes script-written storage after 7 days idle, and that now takes the whole library rather
  than one document. The JSON file remains the system of record, and every path that files a
  tournament must keep offering the download.
- **D-15:** **Starting a new tournament files the current one into the library automatically.
  The confirm names where it went; it does not warn about replacement.** Nothing is lost, so the
  dialog's job changes from warning to informing. The download stays offered in that same
  dialog anyway, for D-14's eviction reason.
- **D-16:** **The library is bounded by a fixed cap on entries. At the cap the oldest is offered
  for download and then dropped.** The host is told before anything goes. An unbounded library
  that fails on quota was rejected — that failure lands at the worst possible moment, while the
  host is trying to save a night. The cap NUMBER is Claude's to choose and defend (see
  Discretion).
- **D-17:** **A tournament goes read-only once the final is recorded, and `tournament/reopened`
  is a log action.** Locked is therefore a fold — a final recorded with no later reopen — in
  exactly the way `selectPhase` and `selectBanStageState` already work, rather than a flag
  something sets. It survives reload, it travels with an exported JSON, two tabs cannot
  disagree about it, and an imported document cannot claim to be unlocked when it is not.
  Reopen is undoable like everything else. **Note the interaction with D-10 and D-11: correcting
  anything in a finished tournament requires reopening it first.** That is the intended friction.
- **D-18:** **When the final is recorded, the bracket stays on screen with the champion named on
  it.** No new summary screen. The bracket is already the record of what happened, the room is
  already looking at it when the last game ends, and the recap is reachable from it.

### The Recap — PERS-09

- **D-19:** **Chronological — the night in order, top to bottom.** Bans, then cards, then each
  round's picks in resolved order, then swaps, then match results. Closest to what the log
  actually is, so the fold is close to a formatting pass, and it reads as a story of the
  evening rather than a table of outcomes.
- **D-20:** **The recap covers everything the log holds** — bans, card plays, picks, swaps,
  passes and match results. Phase 4's D-13 kept ban attribution specifically so this would get
  the ban round for free. Every action family is already in the log; omitting one would be a
  deliberate choice rather than a saving.
- **D-21:** **Blind bans render from `bans/revealed` and its collisions ONLY — never from the
  raw `bans/submitted` entries.** Phase 4's D-06 puts pre-reveal submissions in the log as
  plaintext, defended by the screen shield rather than by the file. The recap is a new surface
  over that same log and it must honour the same contract, reading `selectPublicBanIds` /
  `selectAttributedBans` rather than the submissions array. The case this protects: a blind
  tournament abandoned BEFORE the reveal and filed into D-14's library. Its recap has no ban
  section, which is correct — those bans were never public.
- **D-22:** **The recap shows corrections.** It says a result was recorded and then corrected,
  and what got voided downstream. That is the honest record when somebody asks why the bracket
  does not look the way they remember, and it is what D-19's chronological framing promises.

### Roster Refresh — REFR-01/02/03

- **D-23:** **The refresh control lives on the config screen, beside the roster the tournament
  is being created against.** Refresh happens where the choice of roster actually matters.
- **D-24:** **A tournament — live or filed — loads its OWN snapshot by `rosterVersion` and keeps
  working unchanged.** `config.rosterVersion` and `rosterChecksum` already pin it and ROST-06
  already keeps the prior regulation's frozen snapshot committed: `public/data/roster.ma.json`
  is on disk right now. A filed M-B night stays an M-B night after M-C lands. This is precisely
  why regulation stamping went into Phase 1 rather than being deferred. **Consequence for
  planning:** the app must be able to hold more than one snapshot resolved at once — the live
  document's and the default — rather than assuming `loadRoster()`'s single answer.
- **D-25:** **The staleness banner warns and never blocks, with refresh as its stated next
  action.** Consistent with the project's warn-rather-than-hard-cap posture and with the copy
  rule that an error states the problem and the next action. A group mid-rotation can still run
  a night on last regulation's roster deliberately; the banner only stops them doing it by
  accident. Blocking a new tournament was rejected because it would also block a host with no
  network, which breaks the offline premise.
- **D-26 (derived, flagged):** **A staleness banner shown anywhere other than the config screen
  routes to the config screen rather than duplicating the refresh control**, and **REFR-02's
  offline roster-JSON import sits beside the refresh control on the config screen.** These
  follow from D-23 and D-25 rather than being separately chosen — D-25 gives the banner a next
  action and D-23 puts the control somewhere specific, so the two only reconcile by routing.
  Recorded explicitly so planning does not resolve the tension by growing a second control.

### Claude's Discretion

Surfaced as gray areas and deliberately left to research and planning. Decide them, record the
reasoning, and do not re-ask the owner.

- **Where REFR-01's refresh actually fetches from.** The two candidates are a same-origin
  re-fetch with the service-worker cache bypassed, and `raw.githubusercontent.com` against the
  project's own repo. The second is what PROJECT.md's "Tier A" language anticipates and what
  the ROADMAP asks to have re-confirmed for CORS and caching at implementation time — but it
  **costs an invariant that is currently stated in the code and asserted by a test**:
  `src/adapters/roster-source.ts:1-13` says in as many words that "no third-party origin is
  contacted at runtime (T-01-25)". If off-origin wins, that doc block and that test change
  deliberately, with the reasoning written down. If same-origin wins, note that for THIS
  project a commit and a Pages deploy are effectively the same moment, so the practical gap
  between the two options is small.
- **Where the automatic tiebreak chain stops and D-13's override begins.** Head-to-head is well
  defined for a 2-way tie and famously not for three (A beats B, B beats C, C beats A). The
  candidates are: head-to-head applies only to 2-way ties and anything larger goes straight to
  the override; or a mini-table among the tied group first. The first is more consistent with
  PROJECT.md's explicit rejection of automatic multi-link tiebreak chains, and the ties the
  second cannot resolve are exactly the cyclic ones — at which point the host has to be told
  why the computation gave up. Whichever is chosen, the standings must SAY which link is
  currently deciding the order.
- **The library cap number in D-16**, and its defence. Size a tournament document first — a
  full night is roughly 350–500 actions per PROJECT.md — against `localStorage`'s ~5 MB shared
  with the live document, and choose a cap with headroom rather than one that sounds round.
- **The schema 4 → 5 migration, and the library's own storage versioning.** Two separate
  version surfaces now exist: the tournament document's `schemaVersion`, and the wrapper record
  that `persistence.ts` writes. Phase 2's decision 4 names the three sites that compare
  `schemaVersion` and must all route through `migrate` — `store.ts:212`,
  `persistence.ts:222` (the wrapper record, *before* `isValidTournament`), and
  `import-guard.ts:444`. Missing `persistence.ts` makes `Resume saved draft` silently never
  appear for an older save, and that failure is invisible to import-only tests. A library
  changes the shape of what `persistence.ts` stores, so it needs its own answer to "what does an
  older record look like".
- **What tier 3's "match log" holds beyond the numeric field.** D-01 makes the numeric and the
  editable history the tier-3 difference. Whether anything else belongs there is open — but
  TOUR-10's free-text house-rules field is **v2** and is not the answer.
- **Whether the config-time feasibility gate says anything about depth.** A bracket needs a
  minimum player count to mean anything, and `feasibility.ts` already owns the
  blocking/warning split (`feasibility.ts:149`) and is the project's single authority on
  satisfiability. If depth gets a gate, it goes there and nowhere else.
- **Three-metre legibility for every new surface.** DRFT-14 is an acceptance criterion for the
  whole shared screen, not a polish item, and the standings table, the results grid and the
  bracket are all shared-screen surfaces. D-03's grid is the sharpest case: 8 players is 28
  live cells plus a diagonal, on a screen people are reading from across a room.
- **Whether a live region can announce a match result usefully**, given `announce` is a
  module-level signal that outlives any render (CLAUDE.md §Tests). Phase 3's screen-reader pass
  was descoped, so this is reasoned about in code rather than confirmed by a manual pass.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/ROADMAP.md` §"Phase 5: Full Tournament — Brackets, Standings, Archive" — the goal,
  the five success criteria (note criterion 1 names 5, 6 and 7 players explicitly for bye
  verification), and the Notes flagging research LOW on brackets, MEDIUM on roster refresh, and
  "the real discipline is refusing scope"
- `.planning/ROADMAP.md` §"Ordering Constraints" 5 — why brackets and standings are fully
  additive and come last
- `.planning/REQUIREMENTS.md` lines 44–45 (PERS-08, PERS-09), 116–124 (TOUR-01…09), 137–139
  (REFR-01…03) — the requirements verbatim
- `.planning/REQUIREMENTS.md` line 154 — **TOUR-10 (house-rules field) is v2**, not this phase
- `.planning/PROJECT.md` §Requirements → Active → "Tournament management (host-selectable
  depth)" — the same requirements in the owner's own words
- `.planning/PROJECT.md` §Out of Scope — double elim, Swiss, consolation brackets, automatic
  multi-link tiebreak chains, replay parsing, live upstream roster parsing. Every one of these
  is a thing a bracket implementation drifts toward.

### Decisions inherited from earlier phases
- `.planning/phases/04-blind-and-snake-bans/04-CONTEXT.md` §"Where Revealed Bans Land" (D-13,
  D-14) — ban attribution was kept expressly so this phase's recap gets the ban round free, and
  revealed bans are a log action never written back into config
- `.planning/phases/04-blind-and-snake-bans/04-CONTEXT.md` §"Secrecy and the Log" (D-06) — why
  pre-reveal submissions are plaintext, which is what D-21 above has to honour
- `.planning/phases/03-compiled-rules-priority-cards-swaps/03-CONTEXT.md` — the compiled
  schedule, the single undo stack D-12 extends, and the pattern of materializing an externally
  derived result into the log
- `.planning/phases/02-host-configured-draft-night/02-CONTEXT.md` §"Host Banlist" (D-12) — the
  render-a-not-yet-built-option-disabled pattern, which is how `depth` reached the config screen
  ahead of this phase
- `.planning/STATE.md` §"Decisions locked before planning" items 4 and 6 — the three
  `schemaVersion` comparison sites, and the rule that a new payload field must land in four
  places (payload interface, creator, structural guard, `buildLogEntry`) or it is silently
  dropped on round trip

### Project-wide constraints
- `CLAUDE.md` §Architecture — one document, one write path, nothing derived is stored, ambient
  values stamped at the edge, externally derived results materialized into the log. D-09, D-10
  and D-17 are all direct applications of these.
- `CLAUDE.md` §Conventions — the purity boundary, identity by `id`, `seq` allocation and its
  gaps, serializability, styling and copy rules

### Code the phase builds on
- `src/core/model.ts:108` — `TournamentDepth`, already a three-member union
- `src/core/model.ts:213` — `config.depth`, stored since schema 2 and read by nothing
- `src/ui/screens/ConfigScreen.tsx:120-139` — `DEPTH_OPTIONS` (all three enabled) and
  `DEPTH_NOTE`, whose copy — "Round robin and brackets arrive with the tournament screens" —
  this phase makes false and must update
- `src/core/selectors.ts:709` — `selectIsTournamentComplete`, the exact moment the bracket
  stage begins
- `src/core/selectors.ts:754` — `selectPhase` and its `DraftPhase` union, the established
  pattern for a screen mode derived from the log rather than held
- `src/core/feasibility.ts:149` — the `blocking` / `warning` severity split, the single
  authority on satisfiability
- `src/adapters/persistence.ts:39` — `STORAGE_KEY`, the one slot D-14 expands into a library
- `src/adapters/persistence.ts:75` — `PersistedRecord`, the wrapper whose shape a library changes
- `src/adapters/roster-source.ts:1-13` — the "no third-party origin is contacted at runtime"
  invariant (T-01-25) that REFR-01's fetch choice either keeps or deliberately breaks
- `src/adapters/roster-source.ts:159` — `loadRoster`, which resolves exactly one regulation
  today and which D-24 needs to stop assuming
- `public/data/roster.index.json` — the manifest, already carrying M-A and M-B with
  `validFrom` / `validUntil` / `checksum`. **M-B expires 2026-09-02.**
- `src/app.tsx:150` — the `Screen` union and the `inert` shell gate every screen lands inside
- `src/core/actions.ts:43-54` — the ten existing action-type constants and the shape a new
  family follows
- `src/core/undo.ts` — the single-stack contract D-12 extends

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`src/core/model.ts:108` `TournamentDepth` and `config.depth`** — the phase's entry point
  already exists, stored on every document since schema 2. Nothing reads it. D-01 is what
  starts.
- **`src/ui/components/NumericField.tsx`** — the host-typed bounded numeric control used by
  `swapBudget`, `swapRounds` and `bansPerPlayer`. D-04's metric input and D-05's per-match
  number both want it, and Phase 3's rule applies: a numeric field is bounded at the same
  constant `import-guard.ts` uses, so the build cannot create a document `isValidTournament`
  refuses to re-open.
- **`src/ui/components/SegmentedControl.tsx`** — what `depth`, ban mode and duplicate policy all
  use, including the `disabled` member pattern D-04's tier-2 inertness will want.
- **`src/ui/components/ConfirmDialog.tsx` and `ImportConfirmDialog.tsx`** — the existing
  destructive-confirm surfaces. D-10's "here is what will be cleared", D-15's "here is where the
  night went, and here is the download", and D-17's reopen all take this shape. DRFT-13 already
  requires the confirm.
- **`src/core/feasibility.ts`** — the `blocking` / `warning` split and the reason-code
  vocabulary, if depth turns out to need a gate.
- **`src/ui/screens/CompletedDraft.tsx`** — 130 lines, and deliberately narrow: it replaces the
  pool grid and nothing else so the top bar's `Undo last move` stays reachable. D-18 keeps that
  posture — the bracket stays, the champion is named on it, no screen is swapped out from under
  a host who needs to unwind something.
- **`src/ui/screens/LandingScreen.tsx`** — `New tournament` / `Resume saved draft` /
  `Import JSON…` and `savedDraftDescription`. D-14's library list lands here and D-15 changes
  what `New tournament` means.
- **`src/adapters/persistence.ts` `probeStorage`** — the existing storage canary, which a
  library makes more load-bearing rather than less.

### Established Patterns
- **Append-only log, folded state, nothing derived stored.** Standings, seeding, the bracket
  and who is in which match are all folds of match results. This is why D-10 and D-11 cascade
  rather than patch: there is nothing to patch.
- **Corrections are compensating actions, never edits.** D-09's second `match/recorded` and
  D-10's clearing action are both appends. TOUR-06's "editable" is satisfied by appending, not
  by mutating.
- **A screen mode is a fold, not a flag.** `selectPhase` and `selectBanStageState` both derive
  the screen from the log so an imported document cannot declare a state it is not in. D-17's
  locked/reopened follows exactly this.
- **Materialize an externally derived result, derive everything else.** `pool/built` and
  `schedule/compiled` carry actual outcomes because they encode a host act or an ambient input
  that replay could not reproduce. D-06's cut and D-13's tiebreak override are host acts and
  belong in the log; the bracket structure that follows from them does not.
- **Constraint upstream of the click.** `selectCardOffer` and `selectRoundEligibleIds` render an
  inert option with a stated reason rather than refusing a dispatch. A locked tournament's edit
  controls (D-17) and an unplayable match cell should read the same way.
- **Purity boundary.** Standings, the tiebreak chain, bracket generation, bye placement and the
  cut all belong in `src/core/`. The library's storage, the refresh fetch and the staleness
  date comparison are all `src/adapters/`. `npm run check:pure` enforces it in CI, and the
  staleness comparison in particular reads a clock — that is an adapter concern stamped at the
  edge, never a core one.

### Integration Points
- **`src/core/model.ts` `TournamentConfig`** — gains D-04's metric field and D-08's two Bo3
  values. Schema 4 → 5 across `migrate.ts`, `import-guard.ts`, `persistence.ts` and `store.ts`.
- **`src/core/actions.ts`** — new action families for match records, the clearing action, the
  cut, the tiebreak override and `tournament/reopened`. Every new payload field must land in
  the payload interface, the creator, the structural guard and `buildLogEntry`.
- **`src/core/selectors.ts`** — standings, the tiebreak chain, seeding, bracket structure, bye
  placement and the recap fold all belong here beside `selectIsTournamentComplete`, not in a
  component.
- **`src/app.tsx:150`** — the `Screen` union gains the tournament surfaces, inside the existing
  `inert` shell gate rather than beside it.
- **`src/adapters/persistence.ts`** — the single-slot design becomes a library. This is the
  largest adapter change in the phase.
- **`src/adapters/roster-source.ts`** — `loadRoster` stops resolving exactly one regulation
  (D-24) and gains refresh (REFR-01) and file import (REFR-02).
- **`tests/core/**` mirrors `src/core/**` and runs with zero mocks.** Bracket generation at 5,
  6 and 7 players, the tiebreak chain, and the cascade of D-10/D-11 are all pure-core tests with
  no DOM — which is the observable payoff of the purity rule and the reason ROADMAP criterion 1
  names those three player counts.

</code_context>

<specifics>
## Specific Ideas

- **The library is the owner's deliberate expansion, chosen over the one-slot design after the
  eviction cost was stated.** Do not "simplify" it back to a single slot during planning. The
  correct response to the eviction risk is to keep offering the download at every filing point
  (D-15), not to remove the library.
- **"Downstream results are dropped and the bracket re-derives", then, on being shown that a
  pure fold would let the old result resurrect: "explicit clear".** The owner chose the more
  expensive option specifically to avoid a surprising outcome. D-10 is not a tidiness decision.
- **The cut size is chosen when the standings are on screen, not before.** The owner rejected
  both a config-time value and a config-time-default-confirmed-later. One authority, chosen at
  the moment the information exists.
- **Depth tier 3's name is the specification.** "Draft, brackets and match log" — the third
  tier adds a log, so the structural difference between tiers 2 and 3 is the numeric field and
  the editable history, and nothing else.

</specifics>

<deferred>
## Deferred Ideas

- **A copy-to-clipboard or shareable text form of the recap.** Raised while designing D-19/D-20
  and not pursued. PERS-09 says the recap is *rendered*, and the export surface in this project
  is species-only pastes for two specific targets. A recap text export is a new capability and
  belongs in its own phase.
- **The free-text house-rules field on the tournament page.** Already tracked as **TOUR-10 in
  `.planning/REQUIREMENTS.md` §v2 Requirements**. It appears in PROJECT.md's Active list, which
  is a documentation drift rather than a scope claim on this phase.
- **Double elimination, Swiss, and consolation brackets.** PROJECT.md §Out of Scope, and the
  ROADMAP's own note for this phase says the real discipline here is refusing scope.
- **Multi-client play with every player on their own device.** Carried forward from Phase 4's
  deferred list. Untouched by this phase; `dispatch` remains the single seam it would integrate
  through.

</deferred>

---

*Phase: 5-Full Tournament — Brackets, Standings, Archive*
*Context gathered: 2026-08-25*
