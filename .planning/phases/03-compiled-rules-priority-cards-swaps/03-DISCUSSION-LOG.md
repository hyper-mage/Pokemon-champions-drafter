# Phase 3: Compiled Rules, Priority Cards, Swaps - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-15
**Phase:** 3-compiled-rules-priority-cards-swaps
**Areas discussed:** Rule vocabulary, Schedule shape + round count, Mega-ban list + RULE-09, Reorder + schedule display, Card play flow, Tiebreak rule, Mid-draft swap mechanics, Post-draft swap rounds

All eight offered gray areas were selected for discussion. Thirty-two questions were asked;
the user chose a concrete option on every one, with no "you decide" responses.

---

## Rule vocabulary

**Q1 — What composition requirements can a host state in v1?**

| Option | Description | Selected |
|--------|-------------|----------|
| Mega count only | RULE-03 is the only named requirement; `megasRequiredPerTeam` already ships. Compiler is real, vocabulary is one rule | ✓ |
| Mega count + type minimums | Adds "at least N Water"; each type stratum needs its own feasibility check | |
| General predicate-count builder | Host composes any number of {predicate, count} rules; N-stratum solver and constrained draw | |

**Q2 — What shape does the compiler's input take?**

| Option | Description | Selected |
|--------|-------------|----------|
| Rule list of one | `CompositionRule[]` of length one; a second kind is a union member, not an architecture | ✓ |
| Keep the scalar field | `compile(megasRequiredPerTeam, rounds)`; no schema bump, but RULE-01's "rule set" becomes aspirational | |
| You decide | Planner's call | |

**Q3 — Where does the unbuilt "pick guard" extension point live?**

| Option | Description | Selected |
|--------|-------------|----------|
| In the code only | Doc comment on the `CompositionRule` union naming which classes compile; no runtime surface | ✓ |
| Code plus a config note | Same comment plus a sentence in the config form | |
| Nothing named anywhere | Boundary lives only in planning artifacts | |

**Q4 — What predicate do the non-Mega rounds carry?**

| Option | Description | Selected |
|--------|-------------|----------|
| Unrestricted — at least N | Open rounds offer the whole pool; a Mega-capable species in an untyped slot exports bare | ✓ |
| Mega-capable excluded — exactly N | Open rounds filter out 74 entries; contradicts the field's "minimum" wording | |
| Host chooses at config time | A minimum/exactly toggle; doubles compiler, feasibility, and draw cases | |

**Notes:** The compilable/non-compilable boundary was stated up front — a rule compiles only
if it has the shape "N rounds filtered by predicate P". Relations between picks and aggregate
caps were named as the classes that cannot.

---

## Schedule shape + round count

**Q1 — Where does the compiled schedule live?**

| Option | Description | Selected |
|--------|-------------|----------|
| Materialized `schedule/compiled` action | Resolved `RoundSpec[]` into the log at Start, beside `pool/built`; survives compiler changes and rotations | ✓ |
| Derived in selectors | `compile()` runs on every fold; zero schema cost, but reorder must live elsewhere | |
| You decide | Planner's call | |

**Q2 — Does the round count become a host decision?**

| Option | Description | Selected |
|--------|-------------|----------|
| Stays 6, R derived from `config.rounds` | DRFT-04's "team of six" stands; no literal 6 in any derivation; correct the ConfigScreen comment | ✓ |
| Host sets team size | Makes "the compiled number of rounds" literal; needs a REQUIREMENTS amendment and exports short teams | |
| You decide | Planner's call | |

**Q3 — What does a `RoundSpec` carry for a Mega round?**

| Option | Description | Selected |
|--------|-------------|----------|
| Tag only, resolved against the pinned snapshot | `{ index, kind }`; one source of truth for Mega-capability; pool is already frozen | ✓ |
| Tag plus resolved eligible ids | Fully self-contained across a rotation; duplicates ~74 ids per Mega round | |
| You decide | Planner's call | |

**Q4 — How does a team slot know its type?**

| Option | Description | Selected |
|--------|-------------|----------|
| Derived from the schedule by index | `schedule[i].kind`; `selectTeams` already provides the join; nothing derived is stored | ✓ |
| Stamped onto the pick action | Log reads standalone, but two records can disagree with no validator left to catch it | |

---

## Mega-ban list + RULE-09

**Q1 — At what granularity does the Mega-ban list work?**

| Option | Description | Selected |
|--------|-------------|----------|
| Per species | Mirrors D-11's flat shape; feasibility stays one subtraction | |
| Per Mega forme | Ban Charizardite X while Mega-Y stays legal; eligibility becomes "at least one unbanned forme" | ✓ |
| You decide | Planner's call | |

**Q2 — Host pins Charizard to X and Mega-bans Charizardite X. What happens?**

| Option | Description | Selected |
|--------|-------------|----------|
| Ban wins; species drops out of Mega rounds | One predicate covering both controls; no new error state; still draftable in open rounds | ✓ |
| Blocking feasibility reason | Makes the contradiction loud; costs a tenth `FeasibilityCode` and blocks a readable config | |
| Merge into one control | Dual-Mega row becomes X / Y / Either / Neither; single-forme species still need a second surface | |

**Q3 — Which set does the RULE-09 gate measure?**

| Option | Description | Selected |
|--------|-------------|----------|
| The drawn pool, post-ban | The constraint that actually binds; the recorded count becomes a pre-ban cross-check | ✓ |
| The post-ban roster | Literal REQUIREMENTS wording; a starved pool would pass and die mid-draft | |
| Both, at different severities | Two reasons, two next actions; more code, sharper guidance | |

**Q4 — What surface does the host use to Mega-ban?**

| Option | Description | Selected |
|--------|-------------|----------|
| Mega-mode `PoolGrid` + typeahead chips | Reuses D-10's exact pair, filtered to 74 entries; needs a two-forme cell affordance | ✓ |
| Flat forme list only | 76 rows, forme granularity native to the control; new component, breaks the group's rhythm | |
| Typeahead chips only | Smallest build; no way to browse what is bannable | |

**Notes:** Choosing per-forme granularity is what produced Q2 — the collision with DRFT-15's
X/Y/Either pin, which already exists for the same two species.

---

## Reorder + schedule display

**Q1 — When can the host reorder the schedule?**

| Option | Description | Selected |
|--------|-------------|----------|
| Config time only | Frozen at Start; a mid-draft reorder would retype filled slots with no validator left | ✓ |
| Also mid-draft, future rounds only | Groups do change their minds aloud; needs a reorder action and changing board headers | |

**Q2 — What is the reorder control?**

| Option | Description | Selected |
|--------|-------------|----------|
| Up/down buttons per row | Keyboard and touch reliable, no dependency; STACK rejects DnD and D-19 set the precedent | ✓ |
| Drag with native HTML5 DnD | Direct manipulation; unreliable on touch, needs a parallel keyboard path anyway | |
| Mega rounds positioned, not reordered | Six toggles instead of a permutable list; composes badly with a second rule kind | |

**Q3 — Where does the schedule live on the draft screen?**

| Option | Description | Selected |
|--------|-------------|----------|
| In the board's round headers | Zero new real estate; the marker sits above the column of slots it types | ✓ |
| A dedicated schedule strip | Reads as a progress bar; costs vertical space the panes are sized against | |
| A TopBar disclosure | Zero permanent cost; CARD-02 requires visible, and behind a disclosure it is not | |

**Q4 — What happens to the Mega filter during a Mega round?**

| Option | Description | Selected |
|--------|-------------|----------|
| Inert with a stated reason | 02-09's pattern including the WR-04 ARIA shed; search and type filters stay live | ✓ |
| Stays live, can return nothing | Fewer states; an empty pool mid-turn on a shared screen reads as a bug | |
| Hidden during Mega rounds | No dead control; chrome appearing and disappearing shifts a layout 02-09 reserved height for | |

---

## Card play flow

**Q1 — What does card play look like on the shared screen?**

| Option | Description | Selected |
|--------|-------------|----------|
| A distinct card step per round | One thing on the clock at a time; "played but not yet resolved" is unrepresentable | ✓ |
| Inline in the existing panes | Pool stays visible for planning; the turn indicator has to mean two things | |
| A modal over the draft screen | Reuses `Dialog.tsx`; hides the board players want to read while bidding | |

**Q2 — Who plays a card first each round?**

| Option | Description | Selected |
|--------|-------------|----------|
| Rotate the seeded starting order | `order[(r-1) % players]`; independent of card outcomes, reuses a materialized value | ✓ |
| Reverse of last round's pick order | Catch-up loop; lets a player bid to manipulate next round's seating | |
| Same order every round | Simplest; one player holds the last seat all six rounds | |

**Q3 — What does the log record for card play?**

| Option | Description | Selected |
|--------|-------------|----------|
| One action per card, then `order/resolved` | Screen renders from the log; refresh mid-bidding loses nothing; undo reaches one bad card | ✓ |
| One action per round | Fewer actions, atomic per round; mid-bidding state lives outside the document | |

**Q4 — Does undo reach card plays?**

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, one undo stack | SHEL-06 says "the last action at any point"; undoing past `order/resolved` un-resolves the round | ✓ |
| Picks only; cards are final | A spent card is public information others acted on; leaves a misclick unrecoverable | |
| You decide | Planner's call | |

---

## Tiebreak rule

**Opened with a finding rather than a question.** CARD-04's no-repeat rule can strand a
player holding cards with no legal play. Worked example presented: 3 players / 3 rounds,
R1 `P1→1, P2→2, P3→3`, R2 `P1→2, P2→1` — P3 holds `{1,2}`, both already down.

**Q1 — How should that deadlock be handled?**

| Option | Description | Selected |
|--------|-------------|----------|
| Constrain the offer so it cannot arise | Bipartite matching check over ≤8 players × 6 values; illegal cards inert with a reason | ✓ |
| Relax the rule when a player is stuck | Allow a replay and let the tiebreak resolve it; CARD-04's guarantee becomes conditional | |
| Drop no-repeat entirely | One rule instead of two; contradicts CARD-04 and removes the "no ties" property | |

**Q2 — What breaks a tie between equal played values?**

| Option | Description | Selected |
|--------|-------------|----------|
| First to play the value wins | The room watched it; no randomness; counterweights late-play's information advantage | ✓ |
| Seeded roll off `doc.rng` | Uses the reserved seam; a roll players cannot see coming | |
| Reverse of last round's resolved order | Deterministic catch-up; round 1 needs a second rule anyway | |

**Q3 — Which direction does the card run?**

| Option | Description | Selected |
|--------|-------------|----------|
| Low plays first | 1 is strongest; matches PROJECT.md's "burn your 1" | ✓ |
| High plays first | Auction intuition; inverts the phrase the design was described with | |

**Q4 — Where do remaining hands render?**

| Option | Description | Selected |
|--------|-------------|----------|
| In the board rows | Six pips per row, spent struck through; scales to 8 because the board already does | ✓ |
| Only during the card step | Maximum legibility while it matters; CARD-07 is worded without qualification | |
| A dedicated hands strip | Easy cross-player scan; costs vertical space at 8 players | |

**Notes:** Selecting play-order as the tiebreak means nothing advances `doc.rng` in this
phase, which makes the reservation comment in `actions.ts` stale. Recorded in CONTEXT.

---

## Mid-draft swap mechanics

**Q1 — When can a player spend a swap?**

| Option | Description | Selected |
|--------|-------------|----------|
| On your turn | One thing on the clock; log stays a clean sequence | ✓ |
| On your turn, in addition to picking | Two actions per turn breaks the round/pick-count derivation | |
| Any time, host-mediated | Closest to how a room behaves; interrupts another player's turn | |

**Q2 — Follow-up: does the round pick still happen? (Asked because a swap replaces a member and never fills a slot, so charging the turn would leave the team short of six.)**

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — swap resolves, then you pick | Teams always reach six; DRFT-04 unchanged; the cost is the budget, not a lost pick | ✓ |
| No — the swap is your turn | Genuinely expensive; needs a DRFT-04 amendment and either catch-up rounds or short exports | |

**Q3 — Where does the swapped-out Pokémon go?**

| Option | Description | Selected |
|--------|-------------|----------|
| Back into the pool for everyone | Matches PROJECT.md's wording; `selectAvailablePool`'s subtraction handles it free | ✓ |
| Out of play entirely | Prevents handing a rival what they wanted; shrinks the pool and starves swap rounds | |

**Q4 — How does a swap start?**

| Option | Description | Selected |
|--------|-------------|----------|
| Click your own filled slot, then the pool | Slot names the predicate, so the pool is pre-filtered and SWAP-05 holds by construction | ✓ |
| Click the pool entry, then your slot | Matches the impulse order; forces post-hoc rejection, which is what the compiler removes | |
| A dedicated swap dialog | Focus trap solved; a modal hides the board and pool the room is reading | |

---

## Post-draft swap rounds

**Q1 — What is the swap-round pick-order source?**

| Option | Description | Selected |
|--------|-------------|----------|
| Reverse of the last round's resolved order | Computed from a value the log holds; reads as compensation for the worst final pick | ✓ |
| Reverse of the round-1 resolved order | Equally deterministic; six rounds stale, so it reads arbitrary | |
| A fresh seeded roll | Nothing to plan around; a roll on a round meant for considered correction | |
| Host chooses at config time | Group decides; a config surface and a schema field for a defaultable choice | |

**Q2 — Do the swap budget and swap rounds share one currency?**

| Option | Description | Selected |
|--------|-------------|----------|
| One budget, spent either way | One number to track; matches "both mid-draft currency and post-draft rounds" | ✓ |
| Swap rounds are free | Guarantees the round is worth running; two counters, no reward for hoarding | |
| Separate budgets | Most tunable; two fields and a distinction to keep straight during play | |

**Q3 — How many dedicated swap rounds?**

| Option | Description | Selected |
|--------|-------------|----------|
| A host-set count, default 0 | Follows D-06's free-numeric-input precedent; opt-in, gate judges satisfiability | ✓ |
| Exactly one, on or off | Simplest control; a group wanting two passes needs a code change | |
| You decide | Planner's call | |

**Q4 — When is the draft "done"?**

| Option | Description | Selected |
|--------|-------------|----------|
| Two states: picks done, then tournament done | `selectIsComplete` keeps its meaning; a second selector names the new state | ✓ |
| One state, moved to the end | Single notion of done; silently retypes every existing caller | |
| Complete at round 6; swaps run on top | Teams on screen sooner; a host can copy a paste that is superseded | |

**Q5 — Exact pool preset plus swap rounds leaves nothing to swap into. How should the gate treat it?**

| Option | Description | Selected |
|--------|-------------|----------|
| Warning, not blocking | Uses D-14's second severity, which exists because Exact is the default | ✓ |
| Blocking with a stated reason | Strongest guarantee; forbids a config that does work for later swappers | |
| Silent — the swap round just runs | Legal under SWAP-07; the group discovers a dead round during the round | |

**Notes:** Q5 was raised by Claude rather than pre-selected — the Exact preset is Phase 2's
default and passes every blocking check, so the interaction is live for a typical config.

---

## Claude's Discretion

The user chose a concrete option on all 32 questions. Nothing was answered "you decide".
The items listed under CONTEXT.md's `### Claude's Discretion` heading were never surfaced as
questions — they are downstream calls constrained by the locked decisions:

- The `SCHEMA_VERSION` 2 → 3 migration shape and its three comparison sites
- Placement and labels for the new config controls within the form's group order
- Exact copy strings for new feasibility reasons, inert-control reasons, and the tiebreak
  and swap-order sentences
- Which selectors are added versus extended, and where the card-legality matching check lives
- The card-play step's own layout and its DRFT-14 legibility target
- Whether the pool re-roll stays available once a schedule is compiled
- Keyboard and touch support on the new surfaces

## Deferred Ideas

- **Composition rule kinds beyond a Mega count** — type minimums, stat thresholds, a
  general predicate-count builder. Adjacent to existing v2 items RULE-10 and RULE-11.
- **Mid-draft schedule reorder** — moving a round that has not started yet.
- **Host-selectable team size** — the option that would make "the compiled number of
  rounds" literally true; declined against DRFT-04's "team of six".
