# Phase 3: Compiled Rules, Priority Cards, Swaps - Research

**Researched:** 2026-08-15
**Domain:** Internal rules design — a constraint compiler, a bidding mechanic, and a slot-typed
mutation, all inside an existing pure append-only-log codebase
**Confidence:** HIGH (every claim traces to a file in this repository or to a measurement run
against the committed roster snapshot this session)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

`.planning/phases/03-compiled-rules-priority-cards-swaps/03-CONTEXT.md` is **authoritative**.
The table below is an index into it, not a copy — a second copy of thirty-two decisions is a
second thing that can drift, which is the failure mode this whole codebase is built to avoid
(`model.ts:186`, `selectors.ts:1-17`). Read CONTEXT.md in full before planning. Every decision
below is **locked** and this research explores none of their alternatives.

### Locked Decisions — index

| # | Locked decision (headline) | CONTEXT.md |
|---|---------------------------|-----------|
| D-01 | The v1 rule vocabulary is exactly one kind: a Mega count | `:35` |
| D-02 | Config carries a rule list, currently of length one | `:42` |
| D-03 | The "pick guard" escape hatch is named in code only | `:47` |
| D-04 | Non-Mega rounds are unrestricted — the requirement is "at least N" | `:54` |
| D-05 | The schedule is materialized into the log as `schedule/compiled` | `:63` |
| D-06 | The round count stays 6; every derivation reads `config.rounds` | `:71` |
| D-07 | A `RoundSpec` carries a tag, not a resolved id list | `:77` |
| D-08 | A slot's type is derived from the schedule by index, never stored on the pick | `:84` |
| D-09 | Mega bans are per Mega forme, not per species | `:93` |
| D-10 | A Mega ban beats DRFT-15's X/Y pin; zero legal formes leaves the Mega rounds | `:100` |
| D-11 | RULE-09 measures the drawn pool, post-ban | `:107` |
| D-12 | The Mega-ban input reuses D-10's pair: Mega-mode `PoolGrid` + typeahead chips | `:116` |
| D-13 | RULE-06's reorder is config-time only, frozen at Start | `:124` |
| D-14 | The reorder control is up/down buttons per row | `:130` |
| D-15 | The schedule renders in the board's existing `R1`…`R6` column headers | `:135` |
| D-16 | During a Mega round, the All/Mega/Non-Mega filter renders inert with a reason | `:139` |
| D-17 | Card play is a distinct step per round, not inline and not a modal | `:146` |
| D-18 | Card-play order rotates the seeded starting order | `:153` |
| D-19 | One action per card, then one resolution action | `:160` |
| D-20 | Undo is one stack spanning cards and picks | `:167` |
| D-21 | CARD-04's no-repeat rule is enforced by constraining the offer | `:176` |
| D-22 | Ties break by who played the value first | `:184` |
| D-23 | Low plays first — `1` is the strongest card | `:191` |
| D-24 | Remaining hands render in the board rows | `:196` |
| D-25 | A swap is spent while you are on the clock, and your round pick still happens | `:204` |
| D-26 | The swapped-out Pokémon returns to the pool for everyone | `:211` |
| D-27 | A swap starts by clicking your own filled slot, then the pool | `:218` |
| D-28 | Swap-round order is the reverse of the last pick round's resolved order | `:225` |
| D-29 | One swap budget, spent either way | `:231` |
| D-30 | Swap-round count is a host-set number, default 0 | `:236` |
| D-31 | Two completion states, and `selectIsComplete` keeps its meaning | `:242` |
| D-32 | Exact pool + swap rounds is a warning, not a blocker | `:249` |

### Claude's Discretion — verbatim from CONTEXT.md `:253-281`

> The user selected a concrete option on every question asked. These are the planner's and
> researcher's calls, constrained by the decisions above rather than open:
>
> - **The `SCHEMA_VERSION` 2 → 3 migration.** Config gains at minimum: the composition rule
>   list (D-02), the Mega-forme ban list (D-09), the swap budget (SWAP-01), and the
>   swap-round count (D-30). `migrate.ts` owns the upgrade and **three sites compare
>   `schemaVersion`** — `store.ts`, `adapters/persistence.ts` (the *wrapper* record, before
>   `isValidTournament`), and `import-guard.ts`. Phase 2's decision 4 records that missing
>   `persistence.ts` makes "Resume saved draft" silently never appear for an older save, and
>   that this is invisible to import-only tests. Every new field needs a lossless default.
> - **Where the new config controls sit in the form's group order**, and their exact labels.
>   The `Mega rules` group is the obvious home for Mega-forme bans and the schedule preview;
>   swaps have no group yet. 02-UI-SPEC's group-order table is the reference.
> - **Exact copy strings** for the new feasibility reasons, the round-restriction statement,
>   the inert-control reasons, the tiebreak sentence, and the swap-order sentence. CLAUDE.md
>   §Copy and D-15 / D-39 (Phase 2) are binding: a sentence plus the numbers, verb-object
>   buttons, nothing labelled OK / Submit / Yes / Cancel alone.
> - **Which selectors are added versus extended** in `src/core/selectors.ts`, and whether the
>   card-legality matching check lives there or in its own module.
> - **The card-play step's own layout and its legibility target.** DRFT-14 is an acceptance
>   criterion for the whole shared screen, not just the two panes; D-23 (Phase 2)'s numeric
>   target plus physical check is the pattern to follow.
> - **Whether the pool re-roll (D-07, Phase 2) stays available once a schedule is compiled**,
>   and how a re-roll interacts with the RULE-09 gate's pool-based measurement.
> - **Keyboard and touch support on the new surfaces**, carried forward from Phase 2's
>   discretion list. `use-roving-tabindex.ts` already ships generalized for this.

### Deferred Ideas (OUT OF SCOPE) — verbatim from CONTEXT.md `:518-541`

> No out-of-phase capabilities were proposed — discussion stayed inside the phase boundary.
> Three items were considered and consciously routed elsewhere:
>
> - **Composition rule kinds beyond a Mega count** — type minimums ("at least one Water"),
>   stat thresholds, fully-evolved-only, and a general predicate-count builder. D-01 keeps v1
>   to one rule kind, and D-02 shapes the config so a second kind is a new union member
>   rather than a rewrite. This is adjacent to the existing v2 items RULE-10 (overlap
>   warnings) and RULE-11 (a full generic schedule editor) in `REQUIREMENTS.md`; a new rule
>   kind would also need its own feasibility stratum and a draw constrained on more than one
>   axis at once.
>
> - **Mid-draft schedule reorder** — moving a round that has not started yet, so a group can
>   say "let's do the Mega round last after all". D-13 keeps reorder at config time because
>   D-08 derives slot types from schedule position. Would need a `schedule/reordered` action,
>   a rule about which rounds are still movable, and board headers that change mid-draft.
>
> - **Host-selectable team size** — the option that would have made "the compiled number of
>   rounds" literally true. D-06 declines it: DRFT-04 says six, and a shorter team exports a
>   paste Showdown accepts but a Champions match does not. Revisit only if a group actually
>   asks for quick three-pick drafts.

**Also out of this phase** (CONTEXT.md `:18-21`): blind and snake ban flows, the
pass-the-device interstitial, RULE-08's post-reveal feasibility re-check (all Phase 4); round
robin, standings, brackets, match records, the draft recap, roster refresh (all Phase 5); a
full generic round-schedule editor (RULE-11, v2).

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description (`REQUIREMENTS.md`) | Research support |
|----|--------------------------------|------------------|
| DRFT-04 | Draft runs the compiled number of pick rounds until every player has a team of six | §Compiled Schedule — `config.rounds` stays 6 (D-06); every derivation reads it; §Don't Hand-Roll bans the literal `6` |
| RULE-01 | Host defines composition requirements as a rule set at config time | §The Rule-Class Taxonomy — `CompositionRule[]` shape and the union's doc comment |
| RULE-02 | Composition requirements compile into a round schedule before the draft starts | §Compiled Schedule — `compile(rules, rounds)` at config time, `schedule/compiled` at Start |
| RULE-03 | N Megas produces N Mega-only rounds filtered to Mega-capable Pokémon | §The Rule-Class Taxonomy, §The Mega-Eligibility Predicate |
| RULE-04 | Host maintains a Mega-ban list | §The Mega-Eligibility Predicate — per-forme, keyed on `megaFormes[].id` |
| RULE-05 | Compiled rounds type the team slots, so a slot's constraint survives swaps | §Typed Slots and the Swap Predicate |
| RULE-06 | Host can reorder the derived round schedule | §Compiled Schedule — reorder is pre-document form state, not an action |
| RULE-09 | `players × megaRounds ≤ megaCapableSpecies − megaBans` | §Feasibility Arithmetic — measured numbers, gate location, precedence rows |
| CARD-01 | Cards numbered `1..R`, R = compiled pick-round count | §Priority Cards — hand is derived, never stored |
| CARD-02 | Full schedule with Mega rounds visible before the first card | §Compiled Schedule (config preview) + D-15 board headers |
| CARD-03 | Cards played open and sequentially in a rotating order | §Priority Cards — `cardPlayOrder(round)` from `draft/started.order` |
| CARD-04 | A value already played this round cannot be played again (`players ≤ rounds`) | §Priority Cards — Hall's-condition offer constraint; the deadlock proof |
| CARD-05 | `players > rounds` ties resolve by an explicit visible deterministic rule | §Priority Cards — `(value, seq)` is a total order; no fallback comparator exists |
| CARD-06 | A played card is spent | §Priority Cards — `selectHand` subtracts played values |
| CARD-07 | Every player's remaining cards visible to everyone | §Priority Cards + D-24 board-row hand strips; §Layout Budget |
| CARD-08 | Resolved pick order displayed before picking begins | §Priority Cards — `order/resolved`, `selectPhase` |
| SWAP-01 | Host sets a swap budget per player | §Swaps — `config.swapBudget`, `selectSwapsRemaining` |
| SWAP-02 | Player can spend a swap mid-draft | §Swaps — `swap/made` while on the clock (D-25) |
| SWAP-03 | Host can enable dedicated swap rounds | §Swaps — `config.swapRounds`, default 0 |
| SWAP-04 | Swap rounds use an explicit pick-order source | §Swaps — reverse of round-`R` `order/resolved` (D-28) |
| SWAP-05 | A swap can only take a Pokémon satisfying the target slot's filter | §Typed Slots and the Swap Predicate |
| SWAP-06 | The leftover pool view during a swap is filtered by the target slot's predicate | §Typed Slots — slot-first flow makes it true on the first frame |
| SWAP-07 | Player can pass on a swap round | §Swaps — `swap/passed` is a recorded action, never an absence |

</phase_requirements>

---

## Project Constraints (from CLAUDE.md)

Binding on every recommendation below. Verified against the repository this session.

| Constraint | Where enforced | Consequence for Phase 3 |
|-----------|----------------|------------------------|
| Runtime deps are exactly `preact` + `@preact/signals`, exact-pinned | `package.json:22-25` | **No library is recommended anywhere in this document.** The bipartite matching check, the compiler and the bracket-free schedule are all hand-written and small. |
| `src/core/` is pure — no DOM, clock, randomness, network, storage, timers, no `preact` import | `npm run check:pure` (`scripts/check-pure-core.mjs`) | Compiler, card legality, tiebreak, swap predicates and the RULE-09 gate all live in `src/core/`. Ambient values arrive as arguments — the precedent is `checkFeasibility(input.entries)` and `bannedEntries(entries, bans)`. |
| One append-only log; everything visible is a fold; derived state is never stored | `reduce.ts:1-20`, `selectors.ts:1-17` | Slot types, hands, spent counts and swap budgets are all selectors. |
| Ambient values stamped at the edge (`seq`, `at`, `actorId`) | `store.ts:110-136` | `cards/played` and every swap action carry only decision data; `seq` comes from `dispatch`. |
| Externally derived results are materialized (Pattern 5) | `actions.ts:38-58` | The compiled schedule qualifies — see §Compiled Schedule for the argument. |
| Document survives `JSON.stringify` → `JSON.parse` unchanged | `model.ts:14-19` | Every new payload is arrays of primitives. The matching check's `Set`s are computation-local, exactly as `bans.ts:44` and `feasibility.ts:52` state. |
| `seq` is `max(seq) + 1`, may have gaps | `store.ts:102-108` | Card resolution keys on `seq` and must never assume contiguity. |
| `id` for comparison/keys/membership; `name` for rendering and export only | `bans.ts:28-33`, `search.ts:24-29` | Mega bans key on `megaFormes[].id`. Never `includes('mega')` — that returns Meganium (`PITFALLS`). |
| `npm run check:nohtml` forbids `innerHTML` / `dangerouslySetInnerHTML` | `package.json:16` | Card pips, Mega markers and swap chips are elements, not markup strings. |
| Plain CSS from `src/ui/tokens.css`; one stylesheet per component, beside it | CLAUDE.md §Styling | New components (card-play step, schedule editor) each get a sibling `.css`. |
| Copy: second person, present tense, no exclamation marks, no emoji; buttons name a verb and its object | CLAUDE.md §Copy | Every new sentence in §Copy Surfaces follows this. |
| `tests/core/**` mirrors `src/core/**`, zero mocks, `node` environment; UI tests opt in with `// @vitest-environment happy-dom` as the **first** line | `vite.config.ts:16-20`, CLAUDE.md §Tests | Every rule in this phase is testable without a DOM. |
| `npm run verify` is the single gate | `package.json:18` | `check:pure`, `check:nohtml`, `test`, `build`. |

---

## Summary

Phase 3 adds no dependency, no new architectural layer, and no new write path. It adds **five
action types, one config-shape bump, one predicate, and roughly eight selectors** to a codebase
that was explicitly shaped for them — `search.ts:184-195`, `selectors.ts:95-102`,
`actions.ts:44-57`, `paste.ts:64-72` and `feasibility.ts:398-400` each contain a written-down
seam that this phase is the named consumer of. The research effort therefore went almost
entirely into three questions the existing code does not answer: where the rule-class boundary
actually lies, how the compiled schedule reaches `DraftState` without violating "nothing derived
is stored", and where "no post-pick validation anywhere in the system" turns out to be
unachievable.

The rule-class boundary reduces to one sentence: **a rule compiles iff the admissible set for
slot `i` is a function of `(roster, config)` alone and not of what occupies slots `j ≠ i`.**
Everything D-01 offers sits inside that boundary; everything the deferred list names sits
outside it. Stress-testing twelve concrete host configurations against it surfaced two findings
worth the planner's time: under D-04 a floor of N Megas already yields **exactly** N exported
Megas (because only a typed slot carries a stone), so no "at most N" rule is needed in v1; and
"we want a Mega-less tournament" is already satisfied by `megasRequiredPerTeam = 0` rather than
needing 76 forme bans — but the host has no way to know that from the screen, so it is a copy
problem, not a feature gap.

The one place the phase's own load-bearing sentence cannot be honored is **`canApply`**.
Round eligibility is a fact about a roster entry, `DraftState` holds no roster, and D-07
deliberately declines to materialize eligible id lists into the log. So the reducer physically
cannot reject a Mega-round pick of a non-Mega species, and a hand-edited or imported document
can therefore contain one. That is not a reason to build a validator; it is a reason to route
the constraint through a pure selector the UI consults before dispatching (the shape
`feasibility.ts` and `bans.ts` already use) and to extend Phase 2's existing non-blocking
adoption notice to cover it. Stated plainly so the planner does not discover it at execution.

**Primary recommendation:** build in three strictly ordered units — compiler (schema 3, the
eligibility predicate, `schedule/compiled`, the RULE-09 gate, the config surfaces) → cards
(`cards/played`, `order/resolved`, the rewritten `selectCurrentTurn`, the compound undo) →
swaps (`swap/made`, `swap/passed`, the two completion states) — and treat "typed slots are
readable from `DraftState`" as the hard gate between unit one and everything after it.

---

## Architectural Responsibility Map

| Capability | Primary tier | Secondary tier | Rationale |
|-----------|-------------|----------------|-----------|
| Rule compilation (`compile(rules, rounds)`) | `src/core/` | — | Pure function of config. `check:pure` enforces (CLAUDE.md §Architecture). |
| Mega-eligibility predicate | `src/core/` | — | Function of a roster entry plus config; roster arrives as an argument, exactly as in `feasibility.ts:102`. |
| Round schedule storage | Log (`schedule/compiled`) | `DraftState.schedule` | Materialized result carrying the host's reorder — see §Compiled Schedule. |
| Slot type | `src/core/selectors.ts` | — | Derived from schedule index (D-08). Never stored on a pick. |
| RULE-09 feasibility gate | `src/core/feasibility.ts` | `ConfigScreen` renders | Config-time, pure, all-problems-collected (`feasibility.ts:44`). |
| Card hands / spent state | `src/core/selectors.ts` | — | `1..rounds` minus played values. Derived (rule 3). |
| Card legality (CARD-04) | `src/core/` (own module) | — | Bipartite matching; pure; ≤ 8 × 6. |
| Pick-order resolution | Log (`order/resolved`) | `src/core/` computes it | D-19, and `selectors.ts:98-102` already prescribes it. |
| Card-play rotation | `src/core/selectors.ts` | — | `order[(r-1+i) % p]` from `draft/started.order` (D-18). |
| Swap budget remaining | `src/core/selectors.ts` | — | `config.swapBudget` minus counted `swap/made`. |
| Swap-round order | `src/core/selectors.ts` | — | Reverse of round-`R` resolved order (D-28). |
| Reorder interaction (up/down) | `src/ui/screens/ConfigScreen.tsx` | — | Pre-document form state; nothing dispatches (`ConfigScreen.tsx:51-67`). |
| Card-play step, hand strips, Mega markers, swap mode | `src/ui/` | — | Rendering only; no rule (02-UI-SPEC §Pure-core boundary). |
| Envelope stamping, the only write path | `src/store.ts` | — | Unchanged. `dispatch` gains nothing but new intents. |

---

## The Rule-Class Taxonomy

> ROADMAP Notes: *"the compilable-vs-non-compilable rule-class taxonomy is reasoned analysis
> with no prior art found in any surveyed draft tooling; validate the class boundaries against
> real host configuration attempts."* CONTEXT.md D-01 locks the vocabulary. This section
> restates the boundary precisely, tests it, and says where the escape hatch is named.

### The boundary, in one sentence

**A composition rule compiles into a round schedule if and only if the set of roster entries
admissible for slot `i` is a function of `(roster, config)` alone — never a function of what
occupies slots `j ≠ i`.**

Equivalent phrasings, all of them the same statement:

- The predicate is **monotone in draft time**: an entry that satisfies P at Start still
  satisfies P at the last pick. (D-01's "monotone predicate".)
- The rule is a **per-team count of a per-entry predicate**, not a relation and not an aggregate.
- The rule's satisfaction is decided by **which slots you filled**, never by **what you put in
  the other ones**.

The mechanism the boundary enables is exactly D-08: slot `i` is typed by `schedule[i].kind`, and
a typed slot's constraint is a fixed predicate that never consults its siblings. That is why
runtime validation can be removed — and why any rule that would need to consult a sibling has
nowhere to be enforced.

### The three classes

| Class | Definition | Compiles? | v1 offers it? |
|-------|-----------|-----------|---------------|
| **A — per-entry count** | `⟨floor \| cap \| exact⟩ N of predicate P`, P decidable from one entry plus config | **Yes.** Partition the `R` rounds into P-typed, ¬P-typed and open rounds. Floor N → N P-rounds. Cap N → `R−N` ¬P-rounds. Exact N → N P-rounds + `R−N` ¬P-rounds. | **Only `floor N of megaEligible`** (D-01). The other forms compile but have no control. |
| **B — multi-rule interaction** | Two or more Class-A rules over overlapping predicates | **Yes, structurally** (`ΣNᵢ ≤ R`), **but the feasibility arithmetic needs Hall's condition** when predicates overlap, not a sum. | No — v1 has one rule (D-01/D-02). This is REQUIREMENTS.md **RULE-10** (v2). |
| **C — relational / aggregate / cross-team** | Slot `i`'s admissible set depends on slots `j ≠ i`, on a running total, or on another player's team | **No.** Needs a runtime **pick guard**. | No, and it never will without building the guard (D-03). |

Class-C examples, each named in the `CompositionRule` doc comment per D-03:

- *Relational:* "no two Pokémon of the same type", "no two from the same evolution line", "no
  duplicate base species". Admissible set for pick 4 depends on picks 1–3.
- *Aggregate:* "team BST ≤ 3000", "average Speed ≥ 80". Admissible set for the last slot depends
  on the running sum; feasibility becomes a knapsack rather than an inequality.
- *Cross-team:* "each of the 18 types must be represented somewhere in the tournament". Not
  per-team at all, so there is no slot to type.
- *Order-dependent:* "your round-1 pick must be your highest-BST Pokémon". Depends on the future.

### Stress test — twelve configurations a 4–8 friend group would actually try

Verdicts are against **the shipped v1 vocabulary**, not against the abstract class boundary.

| # | What the host says | Class | Verdict in v1 |
|---|-------------------|-------|--------------|
| 1 | "Everyone needs 2 Megas" | A floor | **Compiles.** 2 Mega rounds + 4 open. This is the whole of v1. |
| 2 | "Everyone needs 6 Megas" (8 players) | A floor | **Compiles and passes.** `8 × 6 = 48 ≤ 74` eligible; at Exact preset the whole 48-entry pool is Mega-eligible. Degenerate but legal. Blocks at 13 players (`78 > 74`). |
| 3 | "No Megas at all this time" | A cap-0 | **Not offered as a rule — but already achieved.** Set `megasRequiredPerTeam = 0`: every slot is untyped, and D-04 says an untyped slot **exports bare, with no stone**. So zero Megas are exported without banning a single forme. **The host has no way to learn this from the screen.** See §Copy Surfaces — this is the most likely host confusion in the phase. |
| 4 | "At most 1 Mega" | A cap | **Not offered.** Would compile as 5 ¬Mega rounds + 1 open — but under D-04 it is *unnecessary*: a floor of N already yields exactly N exported Megas, because only typed slots carry stones. **v1's floor is an exact count in practice.** Worth stating in the doc comment so the next person does not add a cap that changes nothing. |
| 5 | "At least one Water type each" | A floor, different P | **Compiles structurally, no control exists.** Exactly the case D-02's union shape is for: one new member `{ kind: 'type', typeName, count }` plus one predicate. Deferred (CONTEXT `<deferred>`). |
| 6 | "Fully evolved only" | A floor with `N = R` | **Compiles, and is equivalent to a pool restriction.** The honest v1 answer is the species banlist, which already ships. A Class-A rule with `N = R` is a pool filter wearing a schedule's clothes. |
| 7 | "No two of the same type on a team" | **C** | **Cannot compile.** Named in the doc comment. Would need the pick guard. |
| 8 | "Team BST under 3000" | **C** | **Cannot compile.** Named. Also breaks the feasibility gate's inequality shape. |
| 9 | "2 Megas, and the Mega rounds go last" | A + RULE-06 | **Compiles.** The reorder control (D-14) is the mechanism; the reordered schedule is what `schedule/compiled` records. |
| 10 | "2 Megas for Sam, 1 for everyone else" | Out of vocabulary | **Not offered.** `CompositionRule[]` is tournament-wide. This is a *config-shape* limit, not a rule-class limit — worth naming separately in the doc comment so it is not mistaken for pick-guard territory. |
| 11 | "At least 2 Megas **and** at least 1 Water" | **B** | **Not offered.** Satisfaction is unambiguous (each slot is typed by its own round), but the feasibility count is not a sum — a Mega Water is a candidate for both round kinds, so the gate needs Hall's condition over the two predicates. This is RULE-10. |
| 12 | "3 Megas at 8 players, with Charizardite X and Y both banned" | A floor + D-10 | **Compiles.** Charizard has no legal forme, so it leaves the Mega rounds and stays draftable in open rounds. Eligible drops 74 → 73. `24 ≤ 73` passes. No error state, no tenth feasibility code — D-10's stated design. |

**Two configurations that produce an honest surprise, not a bug:**

- Case 3 above (Mega-less by floor-0). Copy must say so.
- A host who bans every forme of every species they dislike and then sets a Mega requirement
  gets a *blocking* gate rather than a *filtered* one. That is correct — a Mega round with an
  empty offer is the mid-draft death RULE-07 exists to prevent — but the message must name the
  Mega-forme banlist, not the species banlist, as the thing to change.

### Where "no post-pick validation anywhere in the system" cannot be honored

Two places. Both are stated rather than fixed, because fixing either would build the validator
the phase exists to remove.

**1. `canApply` cannot check round eligibility.** `canApply(state, action)` sees only
`DraftState`, which is `config + poolIds + rosterVersion + rosterChecksum + order + picks`
(`model.ts:186-195`). Round eligibility is a fact about a **roster entry** (`entry.megaFormes`),
and:

- D-07 explicitly rejects materializing eligible id lists into the log ("Rejected duplicating up
  to ~74 ids per Mega round").
- Putting the roster into `DraftState` would make the fold's cache hold a 235-entry snapshot,
  contradicting `model.ts:11-13` ("`DraftState` … is a cache of the log") and the serializability
  posture.
- Widening `canApply`'s signature would touch the single write path for one rule.

**Consequence:** a `draft/pickMade` naming a non-Mega species in a Mega round is **accepted by
the reducer**. Reachable only by a hand-edited file or an imported document — `import-guard.ts`
states its own posture at `:139` and Phase 2 decision 5 locks it ("a bound is not an integrity
check"). **Recommended mitigation, matching what already ships:** route the rule through a pure
selector the edge consults before dispatching, and extend Phase 2's existing non-blocking
adoption notice (`app.tsx` `feasibilityNotice`) to also report schedule violations found on
adoption. No new validator, no new blocking path.

**2. `selectTeams` will render an illegal team if one is in the log.** Same root cause, same
mitigation. Do **not** add a filter to `selectTeams` — the board must show what the log says
(`reduce.ts:16-19`: "folding a hand-edited log will happily reproduce whatever that log says").

### The pick guard as a named, unbuilt extension point (D-03)

D-03 locks: a doc comment on the `CompositionRule` union, no runtime surface, no UI, no dead
code. The comment must carry exactly four things, and nothing else:

1. **The compilation criterion**, verbatim: *a rule compiles iff the admissible set for slot `i`
   is a function of `(roster, config)` alone and not of what occupies slots `j ≠ i`.*
2. **The three non-compilable classes**, one example each (relational, aggregate, cross-team).
3. **The name `pick guard`, and where it would attach** — a pure
   `guardPick(state, entries, action): GuardResult` consulted by the edge alongside
   `selectRoundEligibleIds`, **not** a new arm in `canApply` (see above for why `canApply`
   cannot host it).
4. **An explicit statement that nothing implements it**, so a reader does not go looking.

Anti-pattern to reject in review: a `kind: 'custom'` union member, a `predicate` function field
on a config type (unserializable — `model.ts:14-19`), or a stubbed `guardPick` returning `ok`.
All three are the speculative build ROADMAP Notes forbid.

---

## Compiled Schedule and the Log

### The decision, unambiguously

**The compiled schedule is materialized into the log as a single `schedule/compiled` action,
emitted by `createTournament` between `pool/built` and `draft/started`. The host's reorder is
NOT an action — it is pre-document form state, resolved before that single action is written.**

### Why materialize, against "nothing derived is stored"

Three arguments, strongest first.

1. **The schedule is not derived — it carries a host decision `compile()` cannot reproduce.**
   `compile(rules, rounds)` yields a canonical order; RULE-06 lets the host permute it. A
   document that recorded only `rules` would recompute the canonical order on every load and the
   reorder would silently not survive a reload. The reorder is the external input, and Pattern 5
   is for exactly that class. This argument is decisive on its own and is stronger than D-05's
   own phrasing.
2. **A compiler change or a roster rotation would retype slots in a finished draft.** D-08
   derives slot type from schedule position; if the schedule were recomputed, a v1.1 compiler
   that emits Mega rounds last would reinterpret a completed team. `pool/built` carries resolved
   `ids` for the same reason (`actions.ts:38-47`, `store.ts:170-178`).
3. **The reducer and the selectors need the schedule in `DraftState`.** `canApply`'s round
   checks, `selectRoundKind`, the swap predicate and the pool filter all read it, and the only
   route into `DraftState` is through the fold.

### Recommended action shape

```ts
// actions.ts
export const SCHEDULE_COMPILED = 'schedule/compiled';

/** What a round's pool is filtered by. A tag, never a resolved id list — D-07. */
export type RoundKind = 'mega' | 'open';

/**
 * One round of the compiled schedule.
 *
 * `index` is 1-based, matching `DraftPick.round`, the `R1`…`R6` board headers and the
 * `Round {r} of 6` banner. It is carried EXPLICITLY rather than taken from array position,
 * matching `PickMadePayload.round`'s own reason — and the structural guard pins
 * `rounds[i].index === i + 1`, so position and field can never disagree.
 */
export interface RoundSpec {
  index: number;
  kind: RoundKind;
}

/**
 * The schedule the host approved, after any RULE-06 reorder. Written once, at Start.
 *
 * There is no `schedule/reordered`. The reorder is config-time (D-13) and therefore
 * pre-document form state, exactly like the banlist (`ConfigScreen.tsx:62-67`); only the
 * resolved result reaches the log. A mid-draft reorder is CONTEXT `<deferred>`.
 */
export interface ScheduleCompiledPayload {
  type: typeof SCHEDULE_COMPILED;
  /** `length === config.rounds`, `index` contiguous from 1. */
  rounds: RoundSpec[];
}
```

`Intent` gains the member; `scheduleCompiled(rounds)` is the creator (payload only);
`isScheduleCompiledAction` is the structural guard. Phase 2 decision 6: **a new payload field
must land in four places** — payload interface, creator, structural guard,
`import-guard.buildLogEntry` — **or it is silently dropped on round trip.**

### Reducer, `DraftState`, and the empty-schedule case

```ts
// model.ts — DraftState gains one field, in the shape `order` and `poolIds` already use
schedule: RoundSpec[];   // [] until schedule/compiled; initialState returns []
```

```ts
// selectors.ts — one selector, one answer
export function selectSchedule(state: DraftState): RoundSpec[] {
  if (state.schedule.length === state.config.rounds) {
    return state.schedule.map((spec) => ({ index: spec.index, kind: spec.kind }));
  }
  // A schema-2 tournament drafted before the compiler existed ran flat rounds, and the log
  // is right about that. All-open is what happened, not a default that guesses.
  return Array.from({ length: state.config.rounds }, (_, i) => ({ index: i + 1, kind: 'open' as const }));
}

export function selectRoundKind(state: DraftState, round: number): RoundKind {
  return selectSchedule(state)[round - 1]?.kind ?? 'open';
}
```

**This is the recommended migration strategy and it is materially simpler than the alternative.**
A schema-2 document is upgraded by wrapping its scalar (`rules: [{ kind: 'mega', count:
config.megasRequiredPerTeam }]`, per D-02) and adding the three new config fields with lossless
defaults — **and its log is left alone.** The empty schedule folds as all-open, which is exactly
what that tournament ran. The alternative — `migrate.ts` splicing a synthetic `schedule/compiled`
into an existing log with a fresh `seq` — is log surgery for no gain and creates an action
stamped after picks it logically precedes.

Origination is guarded so a *new* document can never have an empty schedule:
`canApply(DRAFT_STARTED)` gains a `scheduleNotCompiled` rejection. `canApply` does not run on
fold (`reduce.ts:198-200`), so migrated documents are unaffected.

New `RejectionReason` members: `'scheduleAlreadyCompiled'`, `'scheduleNotCompiled'`,
`'malformedSchedule'` (wrong length or non-contiguous indices).

### `createTournament` ordering

```
pool/built  →  schedule/compiled  →  draft/started
```

`schedule/compiled` after `pool/built` because the schedule is meaningful only against a pool;
before `draft/started` because `canApply(DRAFT_STARTED)` now requires it and because CARD-02
demands the schedule be on screen before the first card. `CreateTournamentInput` gains
`schedule: readonly RoundSpec[]` — a **result** the config screen already showed the host, not
an instruction to recompute, matching `store.ts:139-145` ("Passing the results rather than the
instructions is what makes 'the tournament that starts is the one on screen' structural").

### The compiler itself

```ts
// src/core/compile.ts  (new module — small enough to live in selectors.ts, but it is a
// vocabulary with a doc comment that deserves a file)
export type CompositionRule = { kind: 'mega'; count: number };

export function compile(rules: readonly CompositionRule[], rounds: number): RoundSpec[];
```

Canonical output for `[{ kind: 'mega', count: k }]` at `rounds = R`: **Mega rounds first**, i.e.
indices `1..k` are `'mega'` and `k+1..R` are `'open'`. Any deterministic order is defensible;
first is recommended because the host's reorder control reads top-down and "the constrained
rounds are the ones you have to plan around" is the more useful default. `k > R` is not the
compiler's problem — `megasExceedRounds` already blocks it (`feasibility.ts:363`).

`compile` is total, pure, and never throws: `k` is clamped to `[0, rounds]` at the type level by
the gate that runs before it, and the function itself takes whatever it is given and emits
`rounds` specs.

---

## The Mega-Eligibility Predicate

> One predicate, **four** consumers. `search.ts:184-195` already wrote down that this joins in
> `matchesFilters` as a separate clause; `feasibility.ts:8-9` already wrote down that one place
> knows what is satisfiable. Writing it twice is the failure both comments exist to prevent.

### Measured roster facts (run against `public/data/roster.mb.json` this session)

| Fact | Value | Source |
|------|-------|--------|
| Regulation | `M-B`, checksum `sha256-952dc…` | `roster.mb.json` |
| Draftable entries | **235** | `entries.length` |
| Mega-capable entries | **74** | `entries.filter(e => e.megaCapable).length` |
| Mega formes | **76** | `Σ entries[].megaFormes.length` |
| Entries with `megaFormes.length > 1` | **2** — `charizard`, `raichu` | measured |
| `megaCapable === true` with 0 formes | **0** | measured — the flag and the array never disagree |
| `megaCapable === false` with >0 formes | **0** | measured |
| Distinct `megaFormes[].forme` values | `Mega`, `Mega-X`, `Mega-Y`, `M-Mega`, `F-Mega` | measured |
| Mega formes with a resolved sprite | **76 / 76** (`sprite-meta.json.byRosterId` holds 311 = 235 + 76) | measured |

**Meowstic, resolved.** `PROJECT.md` §Context names Meowstic as a third dual-Mega species;
CONTEXT.md `<specifics>` says to trust the snapshot instead. The snapshot explains the
discrepancy: Meowstic is **two separate draftable rows** — `meowstic` carrying one `M-Mega`
forme and `meowsticf` carrying one `F-Mega` forme. It is two species with one Mega each, not one
species with two. So `dualMegaRows = entries.filter(e => e.megaFormes.length > 1)`
(`ConfigScreen.tsx:368-371`) correctly yields exactly Charizard and Raichu, and D-09's per-forme
ban list handles Meowstic with **zero special-casing**. `PITFALLS`'s warning stands and is
independent: `Meowstic-M-Mega` has `battleOnly: "Meowstic"` with no `-M`, and `includes('mega')`
returns Meganium.

**Recommended tripwire test** (the roster fixture suite already carries this class of assertion —
`tests/core/roster/fixtures.test.ts`): assert that every entry with `megaFormes.length > 1` has
its formes' `forme` values drawn from exactly `{'Mega-X', 'Mega-Y'}`. If a future regulation adds
an `M-Mega` + `F-Mega` pair on one row, the X/Y pin would exclude both formes and the species
would leave the Mega rounds silently. A failing test is a better discovery than a missing species.

### The predicate

```ts
// src/core/mega.ts (new)

/**
 * Does this entry still have a Mega forme it is allowed to become? — D-09, D-10.
 *
 * Eligibility is "at least one forme that is both unbanned and permitted by the X/Y/Either
 * choice". A species with zero legal formes simply leaves the Mega rounds and stays draftable
 * in open rounds — no error state, no tenth FeasibilityCode, because the contradiction has an
 * honest reading: "Charizard cannot Mega here."
 *
 * The `forme` FIELD is compared, never the display name. `Meowstic-M-Mega`, `Kommo-o` and
 * `Tauros-Paldea-Aqua` all punish string surgery (PITFALLS Pitfall 4).
 */
export function isMegaEligible(
  entry: RosterEntry,
  bannedFormeIds: ReadonlySet<string>,
  choice: DualMegaForme,          // 'either' when absent — DualMegaChoice's own contract
): boolean {
  return entry.megaFormes.some(
    (forme) => !bannedFormeIds.has(forme.id) && permittedByChoice(forme, choice),
  );
}

function permittedByChoice(forme: MegaForme, choice: DualMegaForme): boolean {
  if (choice === 'either') return true;
  return choice === 'x' ? forme.forme === 'Mega-X' : forme.forme === 'Mega-Y';
}
```

`choice` is looked up by the caller from `config.dualMegaChoices` — **absent means `'either'`**
(`model.ts:101-104`). The `Set` is computation-local and never stored (CLAUDE.md
§Serializability; the precedent is `bans.ts:69` and `feasibility.ts:277`).

### The four consumers

| Consumer | What it needs | Where |
|---------|--------------|-------|
| RULE-09 gate | count of eligible entries among post-species-ban candidates | `feasibility.ts` |
| The draw's Mega quota | the partition stage-1 predicate | `draw.ts:113` — **see §Feasibility Arithmetic, this is a required change** |
| Mega-round pool filter (RULE-03, D-16) | per-entry boolean | `search.ts` — a new field on `PoolFilters`/`CompiledPoolFilters` and one clause in `matchesFilters` |
| Swap target filter (SWAP-05/06) | per-entry boolean for the slot's kind | `selectors.ts` / the swap surface |

`search.ts:184-195` specifies the join precisely and pre-emptively: *"A round's own pool
restriction joins HERE. It adds one field to `PoolFilters` and `CompiledPoolFilters` and one
clause to this function, and it changes no UI file… `MegaFilterMode` does NOT gain a fourth
member."* Follow it literally.

---

## Feasibility Arithmetic (RULE-09)

### The inequality, with real numbers

```
megaRounds        = |{ spec ∈ schedule : spec.kind === 'mega' }|   ( = rules' mega count = megasRequiredPerTeam )
megaEligibleLegal = |{ e ∈ entries : e.id ∉ bans  ∧  isMegaEligible(e, megaFormeBans, choiceFor(e)) }|

BLOCK when   players × megaRounds  >  megaEligibleLegal
```

Pre-ban, `megaEligibleLegal = 74` — every Mega-capable entry has at least one forme and none is
banned. Player ceilings (from 02-RESEARCH §The hard ceilings, re-verified against the snapshot):

| `k` (Megas per team) | Mega cap `⌊74/k⌋` | Effective max players (with the 39-player pool cap) |
|---|---|---|
| 0 | — | 39 |
| 1 | 74 | 39 |
| 2 | 37 | 37 |
| 3 | 24 | 24 |
| 4 | 18 | 18 |
| 5 | 14 | 14 |
| 6 | 12 | 12 |

At the phase's stated 4–8 players, **no value of `k` from 0 to 6 blocks pre-ban** (`8 × 6 = 48 ≤
74`). **The RULE-09 gate can therefore only fire because of Mega-forme bans.** That is the crisp
statement the planner should build the copy around.

Max tolerable Mega-forme bans at 8 players, expressed as species made ineligible
(`74 − 8k` must remain):

| `k` | Need | Species that may be made ineligible |
|---|---|---|
| 1 | 8 | 66 |
| 2 | 16 | 58 |
| 3 | 24 | 50 |
| 4 | 32 | 42 |
| 5 | 40 | 34 |
| 6 | 48 | 26 |

A single-forme species needs **one** forme ban to become ineligible; Charizard and Raichu need
**two** — or one plus a matching X/Y pin (D-10). So a host banning formes to starve the pool
spends between 26 and 60 clicks at `k = 6`; this is not a configuration anyone reaches by
accident, which is the right reason for the gate to be blocking rather than warning.

### Reconciling D-11's wording with the code's data flow

D-11 says *"Count pool entries that still have a legal Mega forme after Mega bans and X/Y
pinning."* Taken literally that means measuring `draw.ids`. **That is not reachable from where
the gate runs**, and the reason is structural rather than incidental:
`ConfigScreen.tsx:512-513` guards the draw on `feasibility.blocked`, so the draw is `null`
whenever the gate has anything to say. The gate cannot read a value that only exists once the
gate has passed.

**Resolution — and it satisfies D-11's intent exactly.** Measure over the **draw's candidate
set** (`entries` minus species bans), which is available unconditionally at
`ConfigScreen.tsx:404-407`, and rely on `drawPool`'s own stage-2 guarantee to carry the count
into the pool: stage 2 takes exactly `megasRequired` entries from the Mega partition, so
`|eligible ∩ pool| ≥ players × megaRounds` holds by construction of the draw. D-11's real
objection — that `pool/built.megaCapableCount` was *measured before Mega bans existed* and
therefore cannot be the gate's input — is fully honored: nothing reads that recorded number as
the gate's input, and it stays useful as a pre-ban upper bound and a post-rotation cross-check
exactly as D-11 says. This is the same posture STATE.md records for pool-dry: *"the blocker **is**
the guarantee."*

**This makes one change to `draw.ts` mandatory.** Stage 1 currently partitions on
`entry.megaCapable` (`draw.ts:113`). Under Mega-forme bans that is the wrong predicate: the quota
could be filled entirely with species whose every forme is banned, producing a pool that passes
every check and starves the Mega rounds — with no runtime validator left to catch it.

```ts
// draw.ts — DrawInput gains one field, data-shaped like `bannedIds` elsewhere
export interface DrawInput {
  candidates: readonly RosterEntry[];
  size: number;
  megasRequired: number;
  /** Ids among `candidates` that still have a legal Mega forme — D-09/D-10. The quota is
   *  drawn from THESE, not from `entry.megaCapable`, or a Mega round can starve. */
  megaEligibleIds: readonly string[];
  seed: number;
  cursor?: number;
}
```

Then `draw.ts:113-114` becomes a partition on `eligible.has(entry.id)` rather than
`entry.megaCapable`, and `DrawResult.megaCapableCount` should be joined by a
`megaEligibleCount` (the recorded `megaCapableCount` keeps its meaning and its `pool/built`
field — it is what D-11 calls the pre-ban upper bound).

**Two consequences the planner must schedule:**
- The seed→pool mapping changes, so any fixture in `tests/core/draw.test.ts` pinning specific
  drawn ids will change. 02-RESEARCH §"Ordering matters and is easy to get wrong" applies.
- The uniformity caveat in `draw.ts:17-28` is unchanged in character — do not attempt to fix it.

### New `FeasibilityCode` members and their precedence rows

`checkFeasibility` collects **all** problems and sorts by the declared `PRECEDENCE`
(`feasibility.ts:127-139`). Four additions:

| Code | Severity | Precedence position | Why it is its own code |
|------|----------|--------------------|----------------------|
| `swapBudgetNotAnInteger` | blocking | beside `megasRequiredNotAnInteger` | `feasibility.ts:14-21`'s NaN rule: an empty `<input type="number">` yields `NaN`, and every comparison with `NaN` is false. **Every new numeric field inherits `number \| null`.** |
| `swapRoundsNotAnInteger` | blocking | beside the above | same |
| `notEnoughMegas` — **re-measured** | blocking | unchanged position | Its arithmetic moves from `megaCapableLegalCount` to `megaEligibleLegalCount`, so its **message must name the Mega-forme banlist as well as the species banlist**. |
| `swapRoundsOnExactPool` | **warning** | beside `poolExactlyMinimum` | D-32. At the Exact preset the pool is empty when the last pick lands, so the first swapper can only take what someone else drops. |

**`notEnoughMegas`: one code re-measured, or two codes?** Recommendation: **one code,
re-measured, new message.** Two codes with near-identical stated next actions violate the
module's own test for splitting a code — `feasibility.ts:29-34` splits
`megasRequiredNotAnInteger` from `megasExceedRounds` precisely because *"each condition names its
own next action"*, and here both conditions resolve to "lower the requirement or unban
something". The counter-argument (species bans and forme bans are two different lists, so two
next actions) is real; the message can name both lists in one sentence, which is cheaper than a
second precedence row. Exact copy is Claude's discretion per CONTEXT.

`FeasibilityInput` gains `megaFormeBans: readonly string[]`, `dualMegaChoices: readonly
DualMegaChoice[]`, `swapBudget: number | null`, `swapRounds: number | null`.
`FeasibilityResult` gains `megaEligibleLegalCount: number` (keep `megaCapableLegalCount` — the
two are different numbers and `feasibility.ts:111` already argues that a derivable-looking pair
must be two fields).

**The gate is config-time and blocking, never runtime.** It runs in `checkFeasibility` on every
keystroke (`ConfigScreen.tsx:489-504`), it disables `Start draft`, and there is no mid-draft
re-check in this phase — RULE-08's post-reveal re-check is Phase 4 (CONTEXT `:18-21`).

---

## Priority Cards

### State, all of it derived

```ts
// model.ts — DraftState gains two arrays, in the shape `picks` already uses
cardsPlayed: CardPlay[];        // { playerId, value, round, seq }
resolvedOrders: ResolvedOrder[]; // { round, order: string[] }
```

Arrays, never `Record`s — sync rule 14 forbids taking order from a key set, and `bans.ts` /
`model.ts:89-104` both record the same reasoning for `DualMegaChoice[]`.

`CardPlay` carries `seq` for exactly the reason `DraftPick` does (`model.ts:169-176`): it is what
a compensating action targets, and an array index would not survive a retraction earlier in the
log. It carries `round` for the reason `PickMadePayload.round` does: the round is stamped at the
edge from the current state and must not be re-derived from position after an undo.

**Nothing stores a hand.** CARD-01/CARD-06:

```ts
export function selectHand(state: DraftState, playerId: string): number[] {
  const spent = new Set(
    state.cardsPlayed.filter((play) => play.playerId === playerId).map((play) => play.value),
  );
  // `config.rounds`, never the literal 6 — D-06.
  return Array.from({ length: state.config.rounds }, (_, i) => i + 1).filter((v) => !spent.has(v));
}
```

### Actions

```ts
export const CARDS_PLAYED = 'cards/played';
export const ORDER_RESOLVED = 'order/resolved';

/** One player commits one card, face up. Lands as it happens so the shared screen renders
 *  from the log and a refresh mid-bidding loses nothing — D-19. */
export interface CardsPlayedPayload {
  type: typeof CARDS_PLAYED;
  playerId: string;
  /** 1..config.rounds. */
  value: number;
  /** 1-based, stamped at the edge from `selectCurrentRound` — mirrors `PickMadePayload.round`. */
  round: number;
}

/** The round's pick order, materialized when the last card lands — D-19, and what
 *  `selectors.ts:98-102` already prescribes. */
export interface OrderResolvedPayload {
  type: typeof ORDER_RESOLVED;
  round: number;
  order: string[];
}
```

`canApply(CARDS_PLAYED)` rejects: `malformedPayload`; `draftNotStarted`; `notYourTurn` (the
player is not the one on the card-play clock); `wrongSlot` (`action.round !==
selectCurrentRound(state)` — mirrors the pick path's existing check at `reduce.ts:164`);
`cardAlreadySpent`; `cardNotPlayable` (D-21's offer constraint); `roundAlreadyResolved`.
`canApply(ORDER_RESOLVED)` rejects unless every player has played this round and no
`order/resolved` for that round exists.

### The rotation (D-18, CARD-03)

```ts
/** Who plays the r-th round's cards, in order. Independent of every card outcome, so it
 *  cannot be manipulated — and it reuses a value the log already carries. */
export function selectCardPlayOrder(state: DraftState, round: number): string[] {
  const p = state.order.length;
  return Array.from({ length: p }, (_, i) => state.order[(round - 1 + i) % p]!);
}
```

`state.order` is `draft/started.order` — the seeded shuffle from `selectStartingOrder`, whose own
doc comment records that it sorts ids before shuffling *"so the outcome depends only on the set
of players and the seed, not on the order the caller happened to pass them in"*
(`selectors.ts:132-134`). DRFT-16's `Randomize order` keeps its meaning and gains a second one.

### Resolution and the tiebreak (D-22, D-23, CARD-05, CARD-08)

```ts
/** Low plays first — D-23. `1` is the strongest card. Ties break by who played the value
 *  first — D-22, and the room watched the cards go down. */
export function resolvePickOrder(plays: readonly CardPlay[]): string[] {
  return [...plays]
    .sort((a, b) => (a.value - b.value) || (a.seq - b.seq))
    .map((play) => play.playerId);
}
```

**Why entry order provably cannot leak in.** Two facts, both checkable:

1. **The comparator is a total order with no ties at all.** `seq` is unique across the whole log
   by construction — `nextSeq` returns `max(seq) + 1` (`store.ts:102-108`) — so no two plays
   share a `seq`, so `(value, seq)` never returns `0`. **There is no third comparator, hence no
   place for a fallback to entry order to exist.** The tiebreak needs no tiebreak.
2. **Sort stability is therefore irrelevant, and the input array's order is too.** A comparator
   that returned `0` on equal values would defer to the input array's order, which comes from
   `state.cardsPlayed`, which is log order — which happens to agree with `seq` order for
   documents this build originates but need not for an imported one. Comparing `seq` explicitly
   closes that gap.

Contrast with `selectStartingOrder`, which has to sort ids before shuffling to reach the same
property. Card resolution needs no such sort because `seq` is already total. **Test the property
directly:** shuffle the input array, assert byte-identical output.

`seq` also keys D-22 in the only way that survives undo: the log may have `seq` gaps (CLAUDE.md
§`seq`), and a resolution keyed on array position would reorder a round after an undo elsewhere.

### CARD-04, the deadlock, and the offer constraint (D-21)

**When the rule applies.** CARD-04's text is *"When players are fewer than or equal to rounds"*.
That qualifier is load-bearing: with `players > rounds` there are fewer distinct values than
players, so by pigeonhole a repeat is unavoidable and the no-repeat rule must be **suspended**,
with CARD-05's tiebreak carrying the round. This is the only place the two card requirements
interact and it is easy to miss.

**The deadlock is real** — CONTEXT `<specifics>` gives the minimal case and requires it be a
test, not a comment. Working it through confirms the constraint must run **per candidate at
every play**, not once at round start:

> 3 players, 3 rounds. R1: `P1→1, P2→2, P3→3`. R2 hands: `P1{2,3}`, `P2{1,3}`, `P3{1,2}`.
> `P1` plays `2` → `U = {2}`; remaining `P2{1,3}`, `P3{1}`; a matching exists (`P3→1`, `P2→3`),
> so `P1→2` is legal. `P2` then wants `1` → `U = {1,2}`; `P3`'s hand `{1,2}` minus `U` is
> **empty**. So `P2→1` must be refused and `P2` must play `3`.

**The check.** A card `v` is playable by the player on the clock iff, after adding `v` to the
round's used set `U`, the remaining players `q₁…q_m` (in play order) admit a system of distinct
representatives from their hands minus `U`.

**Recommended implementation: Hall's condition over subsets.** For every non-empty
`S ⊆ {q₁…q_m}`, require `|⋃_{q∈S} (H_q \ U)| ≥ |S|`. With `m ≤ 7` remaining players and values
bounded by `config.rounds`, that is at most `2⁷ = 128` subset unions of ≤ 6 elements per
candidate, and at most `rounds` candidates per play. A few thousand operations per render —
irrelevant beside the 235-cell pool grid the same screen already renders on every keystroke
(02-RESEARCH §Rendering ~235 Pool Cells).

Hall's condition is recommended over Kuhn's augmenting-path matching because it is a **direct
transcription of the theorem** with no bookkeeping to get wrong, and because the failing subset
is available for free if a diagnostic is ever wanted. Kuhn's (~20 lines, `O(V·E)`) is the
alternative if the subset enumeration ever bothers anyone; both are hand-written — **no library**
(CLAUDE.md §Dependencies).

**Two guards the check needs:**

- **Skip entirely when `players > rounds`.** The matching is infeasible by construction
  (`m > |values|`), so running it would mark every card unplayable.
- **If no card is playable, lift the constraint for that one play and state why.** An imported
  or hand-edited log can arrive already deadlocked, and a screen with zero legal actions is worse
  than a stated exception. This is the honest failure mode of "constrain the offer"; the copy is
  Claude's discretion.

Unplayable cards render **inert with a reason**, following the WR-04 correction from Phase 2's
review — *a reused button must shed its inert ARIA when the condition lifts* (CONTEXT
`:346-348`). Same pattern D-16 uses for the Mega filter.

### Where cards meet Phase 2's turn-order selector

`selectCurrentTurn` (`selectors.ts:103-116`) is **superseded, not wrapped**. Its own comment
already says so — and misnames the phase, which CONTEXT `<specifics>` requires be corrected in
the same change.

```ts
/** The round the draft is standing in, valid during card play AND picking. */
export function selectCurrentRound(state: DraftState): number {
  const p = state.order.length;
  if (p === 0) return 1;
  return Math.min(Math.floor(state.picks.length / p) + 1, state.config.rounds);
}

export function selectCurrentTurn(state: DraftState): Turn | null {
  if (state.order.length === 0 || selectIsComplete(state)) return null;
  const round = selectCurrentRound(state);
  const resolved = selectResolvedOrder(state, round);
  if (resolved === null) return null;   // card play is on the clock, not picking
  const pickIndex = state.picks.length;
  const playerId = resolved[pickIndex % resolved.length];
  return playerId === undefined ? null : { round, playerId, pickIndex };
}
```

**Three known blast-radius items the planner must schedule, all found by reading the callers:**

1. `canApply(DRAFT_PICK_MADE)` maps a null turn to `reject('draftComplete')`
   (`reduce.ts:158-159`). During card play that is now the **wrong reason**. Add
   `'cardsNotResolved'` and branch before the null check.
2. `undoCrossesRoundBoundary` reads `selectCurrentTurn(state)?.round ?? state.config.rounds`
   (`undo.ts:153`) with a comment explaining why the fallback is the last round. During card play
   the fallback now fires wrongly and would report a boundary crossing on every undo. **Switch it
   to `selectCurrentRound`.**
3. `TurnBanner` receives `round={turn === null ? null : turn.round}` (`app.tsx:1030`) and
   `BoardGrid` derives `nextSlotIndex` from `currentTurn` (`BoardGrid.tsx:137-141`). During card
   play both correctly show "no cell is next" — verify that reads as intended rather than as a
   completed draft.

Add `selectPhase(state): 'cards' | 'picking' | 'swapRounds' | 'complete'` as the one place the
screen's mode is decided (D-17's *"the state boundary makes 'played but not yet resolved'
unrepresentable"*). `app.tsx` branches on it; no component works it out.

### Undo across cards (D-20) — the one non-obvious interaction

Generalize `undo.ts`'s `lastPickIndex` to the last **undoable** action: `draft/pickMade`,
`cards/played`, `order/resolved`, `swap/made`, `swap/passed`. Never `pool/built`,
`schedule/compiled` or `draft/started` — undo unwinds the draft, it does not un-create the
tournament (`undo.ts:82-85`).

**The trap.** Resolution is automatic: `order/resolved` is emitted the instant the last card
lands (D-17/D-19). So undoing `order/resolved` alone returns to a state where every card is down
— and the app immediately re-resolves. The undo appears to do nothing, or loops.

**Fix:** when the last undoable action is `order/resolved`, `undoLast` removes **it and the
immediately preceding `cards/played` together**, as one step. `RoundBoundaryCrossing.removedCount`
already exists as precisely this seam — `undo.ts:127-133` calls it *"the seam a walk-back undo
would fill, not a number waiting to be deleted"*, and the confirm copy at `confirm-copy.ts:152-154`
already gates a clause on `removedCount > 1`. **The dormant clause becomes live here.** The
alternative — making resolution a host click — costs a click per round and contradicts D-17.

D-37's round-boundary confirm extends to cover the `order/resolved` crossing (D-20). That is a
new variant of `UNDO_BOUNDARY_CONFIRM`, not a second confirm mechanism.

### `doc.rng` is now unreserved

`actions.ts:44-47` and `store.ts:183-187` both reserve `doc.rng` for *"the pure generator that
Phase 3's priority-card tie-breaks will advance"*. **D-22 breaks ties with play order and
consumes no randomness.** Both comments are false the moment this phase lands and must be
corrected in the same change (CONTEXT `<specifics>` item 2). Either re-reserve `doc.rng` for a
named future consumer or say plainly that nothing advances it. `rng.cursor` stays `0` for the
life of every Phase 3 document — that is a testable assertion, and worth asserting.

---

## Typed Slots and the Swap Predicate

### A slot's predicate, represented and recovered

There is no stored slot type. D-08:

```ts
/** Slot `i` (0-based) is typed by the schedule at that index. `selectTeams` already files a
 *  round-`r` pick into slot `r - 1` (`selectors.ts:63-79`), which is the join this uses. */
export function selectSlotKind(state: DraftState, slotIndex: number): RoundKind {
  return selectRoundKind(state, slotIndex + 1);
}
```

Recovery at swap time is therefore a single array read, and the predicate follows from the kind:
`'open'` → everything; `'mega'` → `isMegaEligible`.

**"What happens to a slot's predicate when a swap targets a slot produced by a round that was
reordered?" — nothing, and the question cannot arise.** The reorder happens at config time, in
pre-document form state; `schedule/compiled` records the post-reorder result; there is exactly
one schedule for the life of the document and D-13 forbids a second. A planner tempted to store
`slotKind` on the pick "so it survives reordering" would be storing derived data (sync rule 3),
creating a second copy of a constraint that can disagree after a migration — with the runtime
validator that would have caught it gone by design (D-08's own reasoning). Mid-draft reorder is
CONTEXT `<deferred>` and would need a `schedule/reordered` action.

### The leftover pool, filtered (SWAP-05, SWAP-06)

`selectAvailablePool` is `poolIds` minus picked ids (`selectors.ts:40-43`). The swap view is that
set intersected with the slot's predicate. **Slot first, then pool** (D-27) is what makes the
filter correct on the first frame and makes "a Mega slot cannot be swapped into a non-Mega" true
by construction rather than by rejection.

### The swap actions

```ts
export const SWAP_MADE = 'swap/made';
export const SWAP_PASSED = 'swap/passed';

/**
 * Replace one filled slot. Never fills a new slot — D-25: the turn still ends by making the
 * round's pick, and charging the turn for a swap would leave the team short of six.
 */
export interface SwapMadePayload {
  type: typeof SWAP_MADE;
  playerId: string;
  /** 1-based; identifies the slot, and therefore its predicate, via `selectSlotKind`. */
  round: number;
  /** Self-describing, so a disagreeing log folds to a no-op rather than swapping the wrong
   *  slot — the same containment `pickUndone` uses at `reduce.ts:115-117`. */
  outMonId: string;
  inMonId: string;
  /** 0 for a mid-draft spend; 1-based for a dedicated swap round. */
  swapRound: number;
}

/** SWAP-07. A RECORDED action, never an absence — the swap round cannot advance past a
 *  player who is not represented in the log, and undo cannot distinguish "has not gone yet"
 *  from "passed". */
export interface SwapPassedPayload {
  type: typeof SWAP_PASSED;
  playerId: string;
  swapRound: number;
}
```

**`apply(SWAP_MADE)` REPLACES the pick in place; it does not append a second one.** This is the
single most important implementation detail in the swap unit, and both halves of the argument
matter:

- **D-26 (the mon returns to the pool) requires it.** `selectAvailablePool` subtracts
  `picks.map(p => p.monId)`. Appending a second pick for the same round would leave `outMonId` in
  that set and the swapped-out Pokémon would never return — D-26's *"a returned id falls out of
  the same subtraction rather than needing a second list"* only holds under replacement.
- **D-25 (the turn is not consumed) requires it.** `selectPickCount` is `picks.length`
  (`selectors.ts:30-32`) and drives `selectCurrentTurn`'s `pickIndex`. Replacement keeps the
  length constant; appending would silently advance the turn.

Note that `selectTeams` would render the right team either way — it assigns last-write-wins into
`slots[round - 1]` (`selectors.ts:70-76`). That is exactly why the wrong choice here fails
*silently on the board* and only shows up as a Pokémon that never came back to the pool.

The replaced `DraftPick` keeps its **original `seq`** — it is still the same slot-filling event,
and `draft/pickUndone` targets that identity.

### Budget, windows and completion

| Question | Answer | Source |
|---------|--------|--------|
| Where does the budget live? | `config.swapBudget: number`. One budget, spent either way — a dedicated round is a structured opportunity to spend the same allowance, not a separate one. | D-29, SWAP-01 |
| How is spend counted? | `selectSwapsRemaining(state, playerId) = config.swapBudget − count(swap/made by playerId)`. Derived, never stored. A pass is not a spend. | D-29, rule 3 |
| When may a mid-draft swap be spent? | While that player is on the clock: `selectCurrentTurn(state)?.playerId === action.playerId`. The turn still ends with a pick. | D-25 |
| How many swap rounds? | `config.swapRounds: number`, default `0`, free numeric input judged by the gate rather than clamped. | D-30, and `NumericField`'s no-clamp rule |
| What order do swap rounds run in? | `[...selectResolvedOrder(state, config.rounds)].reverse()` — whoever picked last in the last round swaps first. No new randomness, no new config field. | D-28, SWAP-04 |
| What if that resolved order is missing? | Fall back to `[...state.order].reverse()` and say which source is in use. Reachable only from a migrated schema-2 document or an import; a v3 document always has it. | — |
| How does a swap round advance? | Position = count of `swap/made` + `swap/passed` for that `swapRound`. Both actions therefore **must** carry `swapRound`. | SWAP-07 |
| When is the draft complete? | **Two states.** `selectIsComplete` keeps its exact current definition — every player holds `config.rounds` picks — and is *picks-complete*. A new `selectIsTournamentComplete` adds "every swap round has `players` recorded moves". They coincide when `swapRounds === 0`. | D-31 |
| What hangs off which? | The completed-draft view, the per-player export panels and PERS-06's completion checkpoint all hang off the **second**, so nobody copies a paste that is about to change. Every existing caller of `selectIsComplete` stays correct. | D-31 |

`canApply(SWAP_MADE)` rejects: `malformedPayload`; `draftNotStarted`; `notYourTurn`;
`nothingToSwap` (no pick at `(playerId, round)`, or its `monId !== outMonId`); `notInPool`
(`inMonId` not in `selectAvailablePool`); `noSwapsLeft`. It **cannot** reject a slot-predicate
violation, for the same roster-access reason as picks — see §Where "no post-pick validation…"
cannot be honored. The predicate is enforced by the filtered offer (D-27) plus a pure selector
the edge consults.

### D-32: the Exact-pool warning

At the Exact preset the pool is exactly `players × rounds`, so when the last pick lands the pool
is empty and the first swapper of swap round 1 can only take what someone else drops. Exact is
the **default** and passes every blocking check, which is precisely why `checkFeasibility` has a
second severity (`feasibility.ts:264-266`). The config is satisfiable, just degenerate — the
second and later swappers do have the first swapper's drop. Warning, not blocker.

---

## Existing Code to Build On

Every path verified this session. Line numbers are current at `2c6c84b`.

### `src/core/` — where every rule in this phase lives

| File | Symbols Phase 3 extends | What changes |
|------|------------------------|--------------|
| `model.ts` | `SCHEMA_VERSION` (`:39`), `TournamentConfig` (`:121`), `DraftState` (`:186`), `DraftPick` (`:170`), `copyConfig` (`:207`), `initialState` (`:227`) | Bump to `3`. Config gains `rules`, `megaFormeBans`, `swapBudget`, `swapRounds`. `DraftState` gains `schedule`, `cardsPlayed`, `resolvedOrders`. **`copyConfig` must copy every new array element by element** — `:197-206` explains that TypeScript catches an omitted field but cannot see a shallow copy, and `fold` runs `initialState` on every undo, so a shared array surfaces as "undoing a pick changed the banlist". |
| `actions.ts` | `POOL_BUILT`/`DRAFT_STARTED`/`DRAFT_PICK_MADE`/`DRAFT_PICK_UNDONE`, `Intent` (`:94`), the guards (`:184-213`) | Five new types. Each needs **five things**: payload interface, creator (payload only, never the envelope), discriminant constant, structural guard, `Intent` member. **Correct the stale `doc.rng` comment at `:44-47`.** |
| `reduce.ts` | `apply` (`:69`), `canApply` (`:131`), `RejectionReason` (`:41`) | Five new `apply` arms, five new `canApply` arms, ~7 new rejection reasons. `apply` stays total (`:16-19`). |
| `selectors.ts` | `selectAvailablePool` (`:40`), `selectTeams` (`:63`), `selectIsComplete` (`:82`), `selectCurrentTurn` (`:103`), `selectStartingOrder` (`:135`), `compareIds` (`:50`) | `selectCurrentTurn` rewritten (see above). ~8 selectors added. **Correct the "Phase 2 replaces this" comment at `:98-102` — it is Phase 3.** |
| `feasibility.ts` | `checkFeasibility` (`:272`), `FeasibilityCode` (`:63`), `PRECEDENCE` (`:127`), `FeasibilityInput` (`:94`), `poolSizeForPreset` (`:400`) | 3 new codes + `notEnoughMegas` re-measured. New numeric fields inherit the `number \| null` rule (`:14-21`). `poolSizeForPreset`'s `Math.ceil` at `:407` was written for a variable round count — D-06 keeps rounds at 6, so it stays unreachable and stays written. |
| `draw.ts` | `drawPool` (`:108`), `DrawInput` (`:44`), `DrawResult` (`:55`) | Stage-1 partition moves from `entry.megaCapable` (`:113`) to Mega-**eligible**. Do not touch the two-stage structure or attempt to fix the uniformity caveat (`:17-28`). |
| `search.ts` | `PoolFilters` (`:127`), `CompiledPoolFilters` (`:138`), `compileFilters` (`:168`), `matchesFilters` (`:196`), `matchesMega` (`:108`), `hasActiveFilters` (`:216`) | One new field + one new clause, per the seam written at `:184-195`. **`MegaFilterMode` does not gain a fourth member.** |
| `bans.ts` | `bannedEntries` (`:65`) | Untouched. The Mega-forme ban list is a **sibling**, not an extension — it keys on `megaFormes[].id`, not on `RosterEntry.id`. A parallel `bannedMegaFormes(entries, formeBans)` is the analog. |
| `undo.ts` | `lastPickAction` (`:64`), `canUndo` (`:77`), `undoLast` (`:93`), `undoCrossesRoundBoundary` (`:142`), `RoundBoundaryCrossing` (`:104`) | Generalize "last pick" → "last undoable action" (`:38-45` predicted exactly this). Compound removal for `order/resolved`. `removedCount` goes live. |
| `migrate.ts` | `SUPPORTED_SCHEMA_VERSIONS` (`:32`), `V1_CONFIG_DEFAULTS` (`:46`), `migrate` (`:165`) | Add `3` to the list, add `V2_CONFIG_DEFAULTS`, add a `migrateV2ToV3` arm. **No log surgery** — see §Compiled Schedule. |
| `import-guard.ts` | `buildConfig` (`:353`), `buildLogEntry` (`:461`), `buildLog` (`:560`), `MAX_ROUNDS` (`:105`), `MAX_PLAYERS` (`:115`), `MAX_POOL_IDS` (`:125`) | Five new `switch` arms at `:477`, four new config fields, bounds for each. Keep the "a bound is not an integrity check" posture (Phase 2 decision 5). |
| `export/paste.ts` | `toShowdownPaste` (`:98`), `PasteSlot` (`:73`), `declaredStone` (`:128`) | **No signature change.** `PasteSlot.megaStone` was shipped in Phase 1 for exactly this (`:64-72`). The caller resolves the stone: **the slot decides**, never the species (D-04). An untyped slot holding a Mega-capable species passes `megaStone: null` and exports bare. |
| `roster/types.ts` | `RosterEntry` (`:84`), `MegaForme` (`:68`), `DualMegaForme`-adjacent fields | Types only, no change. `MegaForme.forme` is the field the X/Y pin compares. |
| `rng.ts` | `nextInt` | Untouched. Nothing in Phase 3 advances `doc.rng`. |

### `src/ui/` — the surfaces

| File | Role in Phase 3 |
|------|----------------|
| `screens/ConfigScreen.tsx` (1036 lines) | `const ROUNDS = 6` at `:82` **stays** — correct the comment at `:78-82` that predicts otherwise (D-06). Five declared config groups (`:71-74`); gains the Mega-forme ban surface (D-12), the schedule preview + reorder (D-13/D-14) and the swap fields. `handleStart` (`:684`) is the one write path and now also passes `schedule`. Its module comment at `:51-67` explains why nothing here dispatches — the schedule reorder inherits that posture exactly. |
| `components/PoolGrid.tsx` (472) + `FilterBar.tsx` (261) + `TypeaheadField.tsx` (239) + `BanChipList.tsx` (64) | D-12's Mega-mode ban surface reuses the exact pair D-10 built. `PoolGrid` filtered to the 74 Mega-capable entries; dual-Mega cells offer both formes (the one genuinely new affordance). All 76 forme sprites resolve. |
| `components/BoardGrid.tsx` (151) | `ROUND_LABELS` (`:29`) and `roundLabel` (`:31`) already carry an `R${round}` fallback for a different round count. D-15's Mega markers go in `board__round` header cells. |
| `components/TeamStrip.tsx` (90) | Returns a fragment into the parent grid (`:16-19`). D-24's hand strips go in the `board__label` cell. Its own comment at `:12-14` predicts this phase: *"Typed-slot team panels arrive with the Phase 3 rules compiler."* |
| `components/MonChip.tsx` (68) | Board cells are already buttons; D-27's swap flow makes one a swap-target button. |
| `components/Dialog.tsx` (149) + `ConfirmDialog.tsx` (74) + `confirm-copy.ts` | The swap confirm and the extended undo confirm both reuse the pattern. `UNDO_BOUNDARY_CONFIRM` (`confirm-copy.ts:146`) gains a card-crossing variant and its `removedCount > 1` clause goes live. |
| `components/SegmentedControl.tsx` (104) + `NumericField.tsx` (105) | The new config controls. `parseNumericField` (`NumericField.tsx:52`) is what feeds the `number \| null` rule. |
| `components/FeasibilityBar.tsx` (148) | Renders the new codes with no change beyond copy. |
| `use-roving-tabindex.ts` | Shipped generalized in 02-08 for exactly this. `RovingTabindexOptions.count` must be derived from the same array you map, never a constant (`:55-63`). Candidates: the reorder list (single-axis), the card-play hand (single-axis). |
| `components/LiveRegion.tsx` | `announce` is a **module-level signal that outlives any render** — a test touching it resets it in `beforeEach` (CLAUDE.md §Tests). |
| `app.tsx` (1156) | Routes screens at `:948-1106`. Gains the card-play step (D-17) and the swap-round state (D-31). `handlePick` (`:215`) is where `selectRoundEligibleIds` is consulted. `:212`'s "Restore before creating, never after" marks the load-order constraint. The `inert` region and its **sibling** dialog placement (`:1109-1115`) is a trap to preserve. |

### `src/adapters/` and `src/store.ts`

| File | Change |
|------|--------|
| `store.ts` | `dispatch` (`:110`) unchanged. `CreateTournamentInput` (`:147`) gains `schedule`. `createTournament` (`:196`) emits a third action. `undo` (`:346`) keeps its `isOwner()` gate and its injected `resolveSpeciesName`; the announcement string must now cover card and swap undos. **Correct the stale `rng` comment at `:183-187`.** |
| `adapters/persistence.ts` (446) | One of the **three** `schemaVersion` compare sites — the *wrapper* record, before `isValidTournament`. Phase 2 decision 4: missing it makes "Resume saved draft" silently never appear for an older save, **and that is invisible to import-only tests.** |
| `adapters/roster-source.ts` (180) | `RosterBundle` / `SpriteMeta` unchanged. `spriteMeta.byRosterId` holds all 76 Mega-forme ids. |
| `adapters/id.ts` | `newSeed()` unchanged — Phase 3 draws no new seed. |

### `tests/` — the analog files to point an executor at

| New test | Model it on | Why that one |
|---------|-------------|-------------|
| `tests/core/compile.test.ts` | `tests/core/draw.test.ts` (226) | Pure function of config, table-driven, zero mocks. |
| `tests/core/mega.test.ts` | `tests/core/bans.test.ts` (115) | Same shape: a predicate over roster entries plus a ban list, asserted against the real snapshot. |
| `tests/core/cards.test.ts` | `tests/core/selectors.test.ts` (332) — note `makeDoc` at `:68` | Selector-heavy; needs a document builder. **Must contain the CONTEXT `<specifics>` deadlock case as a test, not a comment.** |
| `tests/core/swaps.test.ts` | `tests/core/reduce.test.ts` (530) — `makeDoc` at `:86` | Reducer + `canApply` behaviour, including the fold-equivalence property. |
| feasibility additions | `tests/core/feasibility.test.ts` (530) | Already the largest core suite; new codes slot into its existing structure. |
| migration additions | `tests/core/migrate.test.ts` (244) | Must assert a schema-2 document folds to an all-open schedule. |
| import-guard additions | `tests/core/import-guard.test.ts` (1035) | One block per new action type. |
| UI | `tests/ui/draft-board.test.tsx`, `tests/ui/config-feasibility.test.tsx` | `// @vitest-environment happy-dom` as the **first** line; reset `announce` in `beforeEach`. |

---

## Ordering, Waves, and Plan Boundaries

> ROADMAP §Ordering Constraints 3: *"The compiler establishes typed team slots and deliberately
> removes runtime validation — swaps built without typed slots silently violate composition rules
> with nothing left to catch them. This is the single most important ordering constraint in the
> project."*

### Three units, strictly sequential

**Unit A — Compiler.** Schema 3 + migration across all three compare sites; `CompositionRule`
union with the D-03 doc comment; `compile()`; `isMegaEligible`; `schedule/compiled` (payload,
creator, guard, reducer arm, `canApply` arms, `import-guard` arm); `DraftState.schedule`;
`selectSchedule` / `selectRoundKind` / `selectSlotKind`; the `draw.ts` eligibility change; the
RULE-09 gate and the three other new feasibility codes; the Mega-forme ban surface (D-12); the
schedule preview + reorder (D-13/D-14); the swap config fields (values only, no behaviour); the
round restriction composed into `matchesFilters` (D-16); Mega markers in board headers (D-15).

> **Exit gate before Unit B may start — all four must be true:**
> 1. `selectRoundKind(state, r)` returns the compiled kind for every `r` in `1..config.rounds`.
> 2. A Mega round's pool grid offers **only** Mega-eligible entries, and the All/Mega/Non-Mega
>    control is inert with a stated reason that is shed when the round ends.
> 3. `schedule/compiled` round-trips: export → import → fold produces the same schedule, and a
>    schema-2 document folds to all-open.
> 4. `Start draft` is blocked with the arithmetic shown when `players × megaRounds >
>    megaEligibleLegal`.

**Unit B — Cards.** `cards/played`, `order/resolved`; `selectHand`, `selectCardPlayOrder`,
`selectPlayableCards` (Hall's), `resolvePickOrder`, `selectResolvedOrder`, `selectCurrentRound`,
`selectPhase`; the rewritten `selectCurrentTurn` and its three blast-radius fixes; the undo
generalization and the compound `order/resolved` removal; the card-play step (D-17); the board
hand strips (D-24); the resolved-order display (CARD-08).

> **Exit gate before Unit C may start:**
> 1. Every round's pick order comes from `order/resolved`; `selectCurrentTurn` is correct in both
>    the card and the pick phase.
> 2. `undo` crossing `order/resolved` un-resolves the round in one step and confirms.
> 3. Round `config.rounds`'s `order/resolved` exists in a finished draft — **Unit C's swap-round
>    order is derived from it.**

**Unit C — Swaps.** `swap/made`, `swap/passed`; the in-place pick replacement;
`selectSwapsRemaining`, `selectSwapRoundOrder`, `selectIsTournamentComplete`; the swap mode on
`MonChip` and its confirm; the swap-round screen; the pass control; re-pointing the completed
view, the export panels and the PERS-06 checkpoint at the second completion state.

### Why the order is forced, concretely

- **C after A:** the swap target's predicate *is* `schedule[i].kind`. A swap built first would
  filter on nothing, and there is no validator downstream to notice.
- **C after B:** swap-round order is the reverse of round `R`'s `order/resolved` (D-28), which
  does not exist until B lands; and mid-draft swap legality is gated on `selectCurrentTurn`,
  which B rewrites.
- **B after A:** CARD-01's card count and CARD-02's visible schedule both read the compiled
  schedule; the card-play step renders it.

### Plan-sizing note (honest, not prescriptive)

ROADMAP says 3 plans. Phase 2 was roadmapped at 8 and shipped 13 (`STATE.md`), with the schema
1→2 migration alone taking a whole plan (02-02) and the ban surfaces another (02-07). This phase
carries a schema 2→3 migration *and* a Mega-mode reuse of that ban surface *and* three action
families. The three units above are the **ordering** constraint; how many plans each becomes is
the planner's call, but a single plan per unit would put the schema bump, the eligibility
predicate, the draw change, four feasibility codes and three config surfaces in one plan — larger
than 02-06, which STATE.md already records as knowingly over budget.

---

## Don't Hand-Roll

| Problem | Do not build | Use instead | Why |
|--------|-------------|-------------|-----|
| Round count anywhere | A literal `6` in a derivation | `config.rounds` | D-06 is explicit: card count, slot-array length and schedule length all read it. `ConfigScreen.ts`'s `ROUNDS = 6` stays as **one constant in one place**, not a value scattered through four derivations. |
| A second "is this species banned" answer | A new `Set` at a new call site | `bannedIdSet` / `bannedEntries` | `ConfigScreen.tsx:374-380` and `bans.ts:4-27`: `bans.length` is never a ban count. |
| A second pool matcher | A bespoke filter for Mega rounds | one clause in `matchesFilters` | `search.ts:1-10`: two matchers produce a name the host can find in one surface and not the other. |
| A second completion answer | Redefining `selectIsComplete` | a new `selectIsTournamentComplete` beside it | D-31 — retyping the existing selector silently changes every caller. |
| Undo machinery | Inverse patches, a snapshot stack, redo | remove the action and re-fold | `undo.ts:12-25`. Re-folding a few hundred actions is sub-millisecond. |
| A schedule stored on the pick | `DraftPick.slotKind` | `selectSlotKind(state, i)` | Sync rule 3, D-08 — and the validator that would catch the disagreement is gone by design. |
| A drag-and-drop reorder | any DnD library or pointer-drag code | up/down buttons (D-14) | STACK rejects DnD libraries by name; buttons are keyboard-operable and touch-reliable. |
| A matching library for CARD-04 | `npm install` anything | ~25 lines of Hall's condition | Two runtime dependencies, exact-pinned. A third is a constraint violation. |
| An `Object.keys()` ordering | `Record<playerId, …>` iterated for order | arrays of `{ id, … }` | Sync rule 14. `model.ts:89-100` records the same choice for `DualMegaChoice[]`. |
| A `Set` or `Map` in the document | persisting either | arrays of primitives | CLAUDE.md §Serializability. Computation-local `Set`s are fine and are the shipped pattern. |
| A post-pick composition validator | a rule check in `apply` or a filter in `selectTeams` | constrain the offer; extend the adoption notice | The load-bearing sentence of the phase. |

**Key insight:** every decision in CONTEXT.md that *could* have been "validate and reject" was
resolved as "constrain the offer so the invalid state is unreachable" — D-04, D-10, D-16, D-21,
D-27. A planner reaching for a post-hoc check should treat that as a signal the constraint belongs
upstream (CONTEXT `<specifics>`).

---

## Common Pitfalls

### Pitfall 1: A new payload field lands in three places instead of four
**What goes wrong:** the field is silently dropped on export → import round trip.
**Why:** `import-guard.buildLogEntry` (`:461`) rebuilds every action field by field; a field it
does not name does not survive. Phase 2 decision 6 records this as a lived experience.
**Avoid:** payload interface, creator, structural guard, `buildLogEntry` — four places, every time.
**Warning sign:** a test that exercises `dispatch` and `fold` but never `parseTournamentFile`.

### Pitfall 2: The migration misses `adapters/persistence.ts`
**What goes wrong:** "Resume saved draft" silently never appears for an older save.
**Why:** three sites compare `schemaVersion` and `persistence.ts` checks the **wrapper** record
*before* `isValidTournament` runs.
**Avoid:** all three route through `migrate` (`migrate.ts:31-37`).
**Warning sign:** migration tests that only build documents in memory. Phase 2 decision 4: *"this
is invisible to import-only tests."*

### Pitfall 3: `copyConfig` shallow-copies a new array
**What goes wrong:** undoing a pick changes the Mega-forme ban list.
**Why:** `initialState` runs `copyConfig` on every `fold`, and `fold` runs on every undo, so a
shared array is observable. TypeScript catches an omitted field and **cannot** see a shallow copy
(`model.ts:197-206`).
**Avoid:** every new array copied element by element.

### Pitfall 4: `apply(SWAP_MADE)` appends instead of replacing
**What goes wrong:** the board looks right and the swapped-out Pokémon never returns to the pool.
**Why:** `selectTeams` is last-write-wins per slot, so the board hides the bug;
`selectAvailablePool` subtracts every `picks[].monId`, so the stale id stays taken. The turn also
silently advances, because `selectPickCount` is `picks.length`.
**Avoid:** map over `picks` and replace. Test the pool, not the board.

### Pitfall 5: Undoing `order/resolved` loops
**What goes wrong:** resolution is automatic, so removing it alone re-resolves immediately.
**Avoid:** compound removal of `order/resolved` + the preceding `cards/played`, reported through
`RoundBoundaryCrossing.removedCount` — the field `undo.ts:127-133` reserved for exactly this.

### Pitfall 6: The tiebreak leaks player-entry order
**What goes wrong:** two hosts fold one document to two different pick orders.
**Why:** a comparator that returns `0` on equal card values defers to input-array order.
**Avoid:** compare `(value, seq)`. `seq` is unique log-wide, so the comparator is total and there
is no tie left to break.
**Warning sign:** any use of `Array.prototype.sort`'s stability as an argument.

### Pitfall 7: `drawPool` fills the Mega quota with ineligible species
**What goes wrong:** the pool passes every check and the Mega round starves, with no runtime
validator to notice.
**Why:** stage 1 partitions on `entry.megaCapable`, which is true for a species whose every forme
is banned.
**Avoid:** partition on Mega-**eligible**.

### Pitfall 8: `selectCurrentTurn` returning null is read as "complete"
**What goes wrong:** `canApply` reports `draftComplete` during card play; `undoCrossesRoundBoundary`
reports the last round and confirms on every undo.
**Avoid:** add `selectCurrentRound` and `selectPhase`; fix all three callers in the same change.

### Pitfall 9: A species name is taken apart
**What goes wrong:** `Meowstic-M-Mega` has `battleOnly: "Meowstic"` with no `-M`; filtering ids by
`includes('mega')` returns **Meganium**; `Kommo-o` is a base species with a hyphen.
**Avoid:** forme identity comes from `megaFormes[].id` and `megaFormes[].forme`, never from string
surgery on a name (`PITFALLS` Pitfall 4, CLAUDE.md §Identity).

### Pitfall 10: A stale contract comment survives the change that breaks it
**What goes wrong:** the next reader trusts it. Phase 2 set the precedent with `tokens.css`.
**Three comments become false in this phase and must be corrected in the same change** (CONTEXT
`<specifics>`):
1. `actions.ts:44-47` — `doc.rng` reserved for card tiebreaks. **D-22 consumes no randomness.**
   (`store.ts:183-187` repeats the same claim and needs the same fix.)
2. `ConfigScreen.tsx:78-82` — "Phase 3 makes the round count a host decision." **D-06 says it does
   not.**
3. `selectors.ts:98-102` — "**Phase 2** replaces this with priority-card resolution." **It is
   Phase 3.**

---

## Layout Budget (D-15, D-24)

CONTEXT `<specifics>` requires the board's width budget be **checked, not assumed**. Measured
against the shipped stylesheet:

| Figure | Value | Source |
|--------|-------|--------|
| Board pane at 40% of 1920px | 768px | 02-CONTEXT D-21 |
| Player-name column | **176px** | `BoardGrid.css:54` — `--board-label-w: 176px` |
| Remaining for 6 round cells | 592px | derived |
| Per round cell | **~99px** before gaps and padding | derived |

CONTEXT quotes "roughly 108px per round cell". The shipped token gives **~99px**, so the budget
is if anything tighter than the decisions assumed. Two independent budgets, not one:

- **D-15 (Mega markers)** spend from the **~99px round-header** cell, alongside the existing
  `R1`…`R6` label. A marker plus a two-character label has room; a word does not.
- **D-24 (hand strips)** spend from the **176px label column**, alongside the player name. Six
  pips at a legible size plus gaps is roughly 90–100px, leaving ~75px for a name at 8 players —
  which truncates. The planner should expect to stack the strip below the name inside the label
  cell rather than beside it, and must check it against DRFT-14's three-metre legibility target
  (Phase 2's D-23 pattern: a numeric target plus a physical check).

---

## Copy Surfaces (Claude's discretion — the list, not the strings)

CLAUDE.md §Copy and 02-UI-SPEC §Copywriting Contract are binding: second person, present tense,
no exclamation marks, no emoji; errors state the problem and the next action; buttons name a verb
and its object; nothing labelled `OK`, `Submit`, `Yes` or `Cancel` alone.

| Surface | What it must say |
|---------|-----------------|
| RULE-09 blocker | The arithmetic — `players × megaRounds` versus eligible — and **which ban list** to change (species vs Mega formes). |
| `swapBudgetNotAnInteger` / `swapRoundsNotAnInteger` | Name the field, name what it needs, name the keystroke that supplies it — the shape `MEGAS_REQUIRED_NOT_AN_INTEGER` (`feasibility.ts:166`) uses. |
| `swapRoundsOnExactPool` warning (D-32) | The arithmetic: the pool is empty when the last pick lands, so the first swapper takes only what someone drops. |
| Mega-round pool header (D-16) | The round's restriction, beside the count. |
| Inert Mega-filter reason (D-16) | e.g. "Round 3 is a Mega round" — and the inert ARIA **must be shed when the round ends** (WR-04). |
| Inert card reason (D-21) | Why this value would strand someone. |
| Tiebreak sentence (D-22/D-23) | One sentence: low plays first, ties go to whoever played the value first. |
| Swap-order sentence (D-28) | "Swap order reverses round 6." |
| Swap confirm (D-27) | The resolved consequence — who, which slot, out and in — never the intent. |
| Undo confirm across `order/resolved` (D-20) | That the round's card play is un-resolved, with `removedCount`. |
| **Mega-less tournaments** (stress-test case 3) | The `Megas required per team` helper should say what `0` means for export: no slot is a Mega slot, so nothing exports with a stone. Without it, a host who wants a Mega-less night will reach for 76 forme bans. |

---

## Tests That Must Exist

CONTEXT.md and STATE.md both record the house posture: *a proven property is worth a test rather
than defensive code.* These are the assertions this phase's design depends on.

| Test | Asserts | Why it must be a test |
|------|---------|----------------------|
| CARD-04 deadlock | The CONTEXT `<specifics>` 3-player/3-round sequence is **unreachable** under D-21 | CONTEXT: *"This must be a test, not a comment."* |
| Tiebreak order-independence | Shuffling the input array to `resolvePickOrder` yields byte-identical output | The whole of CARD-05's "never depends on player-entry order". |
| Tiebreak totality | No two `CardPlay`s in a document share a `seq` | The reason there is no fallback comparator. |
| `rng.cursor === 0` | Nothing in a Phase 3 document advances `doc.rng` | Replaces the comment D-22 invalidates. |
| Schedule round-trip | export → import → fold reproduces the schedule; a schema-2 document folds to all-open | The migration's whole contract. |
| Schedule/position agreement | `rounds[i].index === i + 1` is enforced by the guard | Two encodings that cannot disagree. |
| Swap returns to pool | After `swap/made`, `outMonId` is in `selectAvailablePool` and `picks.length` is unchanged | Pitfall 4 fails silently on the board. |
| Slot predicate survives a swap | A Mega slot's offer is Mega-eligible only, before and after any swap | RULE-05 / SWAP-05 in one assertion. |
| Draw eligibility | With every forme of the drawn Mega quota banned, the draw still yields `players × k` eligible entries | Pitfall 7. |
| Dual-Mega tripwire | Every entry with `megaFormes.length > 1` has formes in `{Mega-X, Mega-Y}` | A future `M-Mega`/`F-Mega` pair would silently drop a species from Mega rounds. |
| Feasibility cross-check | The candidate-set eligible count equals the drawn pool's eligible count for every passing config | Reconciles D-11's wording with the code's data flow. |
| Completion split | `selectIsComplete` and `selectIsTournamentComplete` coincide iff `swapRounds === 0` | D-31, and it protects every existing caller. |

`tests/core/**` mirrors `src/core/**` with **zero mocks**; default environment is `node`, so core
cannot reach a DOM by accident. A UI test opts in with `// @vitest-environment happy-dom` as the
**first** line, and resets `announce` in `beforeEach` because it is a module-level signal that
outlives any render.

---

## Security Domain

Threat surface is unchanged from Phase 2 and remains narrow: a static site with no backend, no
accounts, no network dependency after first load, and one untrusted input.

| ASVS category | Applies | Control |
|--------------|---------|---------|
| V2 Authentication | no | No accounts (REQUIREMENTS.md §Out of Scope). |
| V3 Session Management | no | No sessions. The tab lock is a concurrency device, not auth. |
| V4 Access Control | no | Single-device hot seat. |
| **V5 Input Validation** | **yes** | `src/core/import-guard.ts` — every new action type and payload field needs a structural guard and a bound. Keep the "a bound is not an integrity check" posture (Phase 2 decision 5). |
| V6 Cryptography | no | Nothing is signed or encrypted. `rng.ts` is a deterministic hash, not a CSPRNG, and is not used for anything security-relevant. |

| Threat | STRIDE | Mitigation |
|--------|--------|-----------|
| Hostile JSON import (unbounded allocation) | Denial of Service | `MAX_IMPORT_BYTES`, `MAX_LOG_ENTRIES`, `MAX_ROUNDS`, `MAX_PLAYERS`, `MAX_POOL_IDS` — each new list bounded on the same pattern. |
| Injected text reaching an external paste | Tampering | `paste.ts:119-136` — every emitted character originates in the committed snapshot; an unresolved id is dropped, never emitted. Unchanged by this phase. |
| Markup injection | Tampering | `npm run check:nohtml` forbids `innerHTML` / `dangerouslySetInnerHTML` under `src/`. |
| Illegal composition in an imported document | Tampering | **Accepted and stated.** No validator (§Where "no post-pick validation…"). Mitigated by the existing non-blocking adoption notice, extended to cover schedule violations. |
| Second-tab clobber | Tampering | `adapters/tab-lock.ts`, unchanged. `store.undo` keeps its `isOwner()` gate. |

---

## Package Legitimacy Audit

**Not applicable — this phase installs nothing.** Runtime `dependencies` stays exactly
`preact@10.29.8` and `@preact/signals@2.10.1`, both exact-pinned. `devDependencies` gains nothing.
Adding a third runtime dependency is a constraint violation, not a trade-off (CLAUDE.md
§Conventions). No package name is recommended anywhere in this document.

---

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|-------|---------|--------------|
| A1 | `compile()` emits Mega rounds **first** in canonical order | §Compiled Schedule | Cosmetic only — the host reorders. Any deterministic order satisfies RULE-02; if the planner prefers Mega rounds last, nothing downstream changes. |
| A2 | Hall's-condition subset enumeration is fast enough at 8 players | §Priority Cards | Low. Worst case ~128 subset unions × 6 candidates per play, beside a 235-cell grid re-render. If it ever bites, Kuhn's matching is the drop-in. |
| A3 | One `notEnoughMegas` code re-measured beats two codes | §Feasibility Arithmetic | Copy-level only. CONTEXT lists exact feasibility copy as Claude's discretion; a second code is a mechanical addition if the planner disagrees. |
| A4 | The empty-schedule-folds-as-open migration is preferred over splicing an action into the log | §Compiled Schedule | Moderate. Both are correct; the log-surgery variant costs a synthetic `seq` and an action ordered after picks it precedes. Named so the planner can choose consciously. |
| A5 | `swap/made` carries `round` rather than `targetSeq` | §Swaps | Low. `targetSeq` is the `pickUndone` precedent; `round` is the D-08 join and is human-readable. Carrying `outMonId` makes either safe. |
| A6 | The board's label column is where D-24's hand strips must stack rather than sit beside the name | §Layout Budget | Low, and measured — 176px minus ~95px of pips leaves ~75px for a name at 8 players. Verify physically per DRFT-14. |

*Every other claim in this document is `[VERIFIED]` against a file in this repository or against
`public/data/roster.mb.json`, measured this session.*

---

## Open Questions (RESOLVED)

1. **Does the pool re-roll stay available once a schedule is compiled?** (CONTEXT lists this as
   Claude's discretion.)
   - *What we know:* the re-roll is `setPoolSeed(newSeed())` at config time
     (`ConfigScreen.tsx:576-578`), behind a confirm, and it is provably independent of the order
     roll. The RULE-09 gate under this research's recommendation measures the **candidate set**,
     not the drawn pool, so a re-roll cannot change the gate's verdict.
   - *What is unclear:* whether a re-roll should also be offered after the schedule preview is on
     screen, or whether that reads as re-rolling the schedule too.
   - *Recommendation:* keep it, unchanged, and place the schedule preview **above** the pool
     readout so the group order still ends with the readout that reflects everything above it
     (`ConfigScreen.tsx:69-74`).

2. **What does a Mega round do when the round's eligible offer is empty mid-draft?**
   - *What we know:* the RULE-09 gate makes this unreachable for documents this build creates —
     the same "the blocker **is** the guarantee" argument STATE.md records for pool-dry.
   - *What is unclear:* an imported document can reach it.
   - *Recommendation:* an empty Mega-round pool renders the existing empty state with a stated
     reason. Do **not** add a fallback that widens the offer — that is the validator by another
     name.

3. **Should the schedule preview appear before or after the host has named the players?**
   - *What we know:* CARD-02 requires it visible before the first card, which the board headers
     already satisfy (D-15). The config preview is the reorder surface (D-14).
   - *What is unclear:* group placement — CONTEXT lists this as Claude's discretion, referencing
     02-UI-SPEC's group-order table.
   - *Recommendation:* inside the existing `Mega rules` group, below the Megas-per-team field,
     since the schedule is that field's visible consequence.

4. **Playtesting.** ROADMAP Notes: *"the tiebreak rule and the play flow should be playtested with
   the target 4–8 friend group, not just implemented from the write-up."* Nothing in this research
   substitutes for that. The two mechanics most likely to change on contact are D-18's rotation
   (does playing last actually feel like the advantage the design assumes?) and D-23's "low plays
   first" (players may expect high). Both are one-line changes in `resolvePickOrder` and
   `selectCardPlayOrder`; keep them that way.

---

## Sources

### Primary — repository code read this session (HIGH)

`src/core/model.ts`, `actions.ts`, `reduce.ts`, `selectors.ts`, `feasibility.ts`, `draw.ts`,
`search.ts`, `bans.ts`, `undo.ts`, `migrate.ts`, `export/paste.ts`, `roster/types.ts`,
`import-guard.ts` (outline); `src/store.ts`; `src/app.tsx` (structure + draft screen);
`src/ui/screens/ConfigScreen.tsx`; `src/ui/components/BoardGrid.tsx`, `TeamStrip.tsx`,
`BoardGrid.css`; `src/ui/use-roving-tabindex.ts`, `confirm-copy.ts`; `package.json`,
`vite.config.ts`; `tests/` layout.

### Primary — measured this session (HIGH)

`public/data/roster.mb.json` — 235 draftable, 74 Mega-capable, 76 Mega formes, 2 entries with
`megaFormes.length > 1` (`charizard`, `raichu`), forme values
`{Mega, Mega-X, Mega-Y, M-Mega, F-Mega}`, zero flag/array disagreements, Meowstic split across
two draftable rows. `public/data/sprite-meta.json` — 311 `byRosterId` entries, all 76 Mega formes
resolved, zero missing.

### Primary — planning documents (HIGH)

`.planning/phases/03-…/03-CONTEXT.md` (authoritative on every decision);
`.planning/REQUIREMENTS.md`; `.planning/ROADMAP.md` §Phase 3 + §Ordering Constraints;
`.planning/STATE.md`; `.planning/phases/02-…/02-RESEARCH.md` §Feasibility Arithmetic; `CLAUDE.md`.

### Referenced but not re-derived

`.planning/research/ARCHITECTURE.md` (Patterns 1 and 5, sync rules 3/11/12/14/15/19),
`.planning/research/PITFALLS.md` (roster classification traps),
`.planning/research/STACK.md` (the "what NOT to use" table),
`.planning/phases/02-…/02-UI-SPEC.md` (deliberately stale on feasibility precedence),
`02-CONTEXT.md`, `02-VERIFICATION.md`, `02-REVIEW.md` (WR-04).

### Web sources

**None.** No external question arose. This phase is internal rules design against a committed
data snapshot, and every claim above is verifiable from this repository.

---

## Metadata

**Confidence breakdown:**

| Area | Level | Reason |
|------|-------|--------|
| Rule-class taxonomy | HIGH | Reasoned from the D-08 slot-typing mechanism the codebase already implements, and stress-tested against twelve concrete configurations. No prior art claimed or needed. |
| Compiled-schedule representation | HIGH | Every argument traces to a written-down comment in the shipped code (`actions.ts:38-58`, `store.ts:170-178`, `model.ts:11-13`). |
| Priority cards | HIGH on the mechanism, **MEDIUM on the feel** | The tiebreak's order-independence is a proof from `store.ts:102-108`; whether the rotation and "low plays first" feel right is a playtest question ROADMAP flags and this research cannot answer. |
| Swaps and typed slots | HIGH | The replace-not-append finding is derived directly from `selectors.ts:30-43` and D-25/D-26. |
| Feasibility arithmetic | HIGH | Every figure recomputed against `roster.mb.json` this session; cross-checked against 02-RESEARCH's tables. |
| Existing-code inventory | HIGH | Every path and line number read this session. |
| Layout budget | HIGH on the numbers, MEDIUM on the conclusion | `--board-label-w: 176px` is measured; whether six pips fit legibly at three metres needs the physical check DRFT-14 requires. |

**Research date:** 2026-08-15
**Valid until:** stable indefinitely for the design conclusions; the roster figures are pinned to
regulation `M-B` (`sha256-952dc…`) and change on the next rotation, roughly every 2.5 months.
