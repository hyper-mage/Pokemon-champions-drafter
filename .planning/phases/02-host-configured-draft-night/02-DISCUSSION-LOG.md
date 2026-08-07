# Phase 2: Host-Configured Draft Night - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-06
**Phase:** 2-Host-Configured Draft Night
**Areas discussed:** Config screen flow, Pool sizing math, Host banlist UX, Feasibility gate, Shared-screen layout, Density levels, Search and filters, Destructive confirms

**Pacing:** User selected batched questions (3–4 per area, one turn per area) over the
default one-question-per-turn flow. Eight areas were offered across two multi-select
questions; the user selected all eight.

---

## Pacing

| Option | Description | Selected |
|--------|-------------|----------|
| Batch 3-4 per area | One turn per area, 3–4 related questions together, ~8–10 turns | ✓ |
| One question per turn | Default flow, most adaptive, ~32+ turns | |
| Batch, and you decide the small stuff | Only surface decisions that change the build, ~6 turns | |

---

## Config screen flow

| Option | Description | Selected |
|--------|-------------|----------|
| One scrolling form | Everything on one page, Start pinned with the live feasibility reason; survives the common backtrack when player count invalidates pool size and bans | ✓ |
| Stepped wizard | Players → Format/depth → Pool + bans → Review; less overwhelming but painful to re-edit after a feasibility failure | |
| Progressive reveal | One page, later sections gated on earlier ones | |

| Option | Description | Selected |
|--------|-------------|----------|
| Landing with three actions | New / Resume (if a save exists) / Import; storage canary runs and blocks here | ✓ |
| Straight to config screen | Config is the landing; Resume and Import as top-bar links | |
| Resume-first | Restore a saved draft immediately if one exists | |

| Option | Description | Selected |
|--------|-------------|----------|
| Two inline rows in config | Three-way X / Y / Either toggle per dual-Mega species, default Either, derived from `megaFormes.length > 1` | ✓ |
| Only show when relevant | Block appears only if a dual-Mega species survives the banlist | |
| Skip the UI, always Either | Store `either` and defer the control to Phase 3 | |

| Option | Description | Selected |
|--------|-------------|----------|
| Randomize button, re-rollable, order shown | Numbered list of the result; re-roll allowed because a group will re-roll regardless | ✓ |
| Randomize plus manual reorder | Adds up/down buttons (no DnD library, per STACK.md) | |
| One-shot randomize at Start | No preview; order revealed when the draft starts | |

**Notes:** Roster inspection during this area established that exactly two dual-Mega
species exist (Charizard, Raichu), which reduced DRFT-15 from a presumed screen to a
two-row control.

---

## Pool sizing math

| Option | Description | Selected |
|--------|-------------|----------|
| players × rounds × 1.5 | 4p=36, 8p=72; ratio-based so Phase 3's variable round count carries it | (recommended, not taken as-is) |
| players × rounds × 2 | 4p=48, 8p=96; safest against bans and Mega starvation | |
| Whole legal set minus bans | Always 235 minus bans; makes DRFT-02's auto-sizing vestigial | |

**User's choice (free text):** "Should be an option for none left over, option 1's version,
or option 2's version" — i.e. three presets rather than one formula.
**Follow-up asked:** which preset is the default.

| Option | Description | Selected |
|--------|-------------|----------|
| ×1.5 default | Exact / ×1.5 / ×2 presets, ×1.5 as landing default | |
| Exact default | Zero surplus by default; hosts opt into surplus | ✓ |
| ×2 default | Most forgiving, least draft-like tension | |

**Notes:** Exact as default is what made the two-severity feasibility gate necessary — an
Exact pool passes every blocking check while leaving the final picker one option and swaps
nothing to trade into.

| Option | Description | Selected |
|--------|-------------|----------|
| Seeded uniform random, re-rollable | Materialized into `pool/built`; re-roll defuses a bad draw | ✓ (with a constraint added) |
| Seeded uniform, no re-roll | One draw, take it | |
| Stratified draw | Guarantee proportional Mega and type spread | |

**User's choice (free text):** "option 1, but it needs to consider if the host wants mega's
mandatory for their tournament (example: all teams require at least 2 mega pokemon, so two
rounds of the draft will be only mega-able pokemon to fit the bill. that means the
randomizer needs to have at least x number of mega's IF the host has that as a requirement)"

**Notes:** This is the scope question of the phase. ROADMAP ordering constraint 6 places
Mega-specific feasibility (RULE-09) wholly in Phase 3 "because it needs the compiled
schedule to know how many Mega rounds exist". The user's requirement needs the Mega count
known at Phase 2 draw time. Concern stated, three resolutions offered.

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal Mega-count field in Phase 2 | One number, used only as a draw constraint and a feasibility input; deviates from ordering constraint 6 | ✓ |
| Keep it in Phase 3, make the pool re-drawable | Roadmap-faithful; `pool/built` stops being one-shot and the pool changes under the host | |
| Guarantee the worst case now | No field; draw always supports up to six Mega rounds, forcing 48 of 72 pool slots Mega-capable at 8 players | |

| Option | Description | Selected |
|--------|-------------|----------|
| Free number, feasibility gate judges it | One authority on satisfiability instead of two | ✓ |
| Clamped input | Impossible to enter a broken value; clamp shifts under the host as they edit | |
| Three presets plus custom | Frames the trade-off in words | |

| Option | Description | Selected |
|--------|-------------|----------|
| Record the count, gate in Phase 3 | Phase 2 stores the drawn pool's Mega-capable count for Phase 3's gate | ✓ |
| Floor the draw at a safe Mega count | Hardcodes a guess about a rule that does not exist yet | |
| Ignore it entirely | Phase 3 inherits whatever it gets | |

---

## Host banlist UX

| Option | Description | Selected |
|--------|-------------|----------|
| Ban mode on the real pool grid | Reuses PoolGrid + MonCard; host bans by sight; search and filters work for free | |
| Typeahead add-to-list | Compact and keyboard-fast, but demands exact names | |
| Both | Grid for browsing, typeahead for the host who knows; two surfaces, one banlist | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — two ban kinds | Species ban and Mega-forme ban; supplies the Phase 3 compiler's Mega-ban list | (recommended, not taken) |
| Species bans only | One flat list; Phase 3 must add Mega-forme bans to a shipped config shape | ✓ |
| Species bans plus a global no-Megas toggle | Cannot express "no Mega Charizard-Y specifically" | |

**Notes:** Recommendation cited ROADMAP ordering constraint 4 and Phase 3 success criterion
1, both of which assume this phase's banlist supplies the Mega-ban list. User chose
species-only with the consequence stated: Phase 3 needs a schema bump plus a second
banlist surface. Recorded in CONTEXT.md D-11 and in Deferred Ideas.

| Option | Description | Selected |
|--------|-------------|----------|
| Visible but disabled, labelled | All three modes shown; blind and snake disabled as "Not yet available"; Phase 4 enables rather than redesigns | ✓ |
| Only host-banlist, no selector | Least misleading, but BAN-01 asks for a mode selector | |
| Selectable, with a stub screen | Host configures a tournament they cannot run | |

| Option | Description | Selected |
|--------|-------------|----------|
| Banned entries absent, list viewable on demand | BAN-08 literal; collapsed "Bans (N)" disclosure answers table arguments inside the tool | ✓ |
| Absent, and not shown anywhere | Cleanest screen; the table argument has no in-tool resolution | |
| Shown dimmed and struck in the pool | Contradicts BAN-08 outright | |

---

## Feasibility gate

| Option | Description | Selected |
|--------|-------------|----------|
| Two — blocking errors and warnings | Blocking disables Start; warnings flag satisfiable-but-degenerate setups such as an Exact pool | ✓ |
| One — blocking only | A degenerate Exact setup passes silently | |
| One — warnings only | Contradicts RULE-07 | |

| Option | Description | Selected |
|--------|-------------|----------|
| Sentence plus the numbers | "8 players × 6 rounds needs 48 Pokémon; the pool is 40 after 12 bans." | ✓ |
| Sentence only | Host must hunt for which of four fields to change | |
| Full arithmetic panel | Permanent wall of arithmetic | |

| Option | Description | Selected |
|--------|-------------|----------|
| Live on every change | Pure functions, sub-millisecond, no debounce | ✓ |
| Live, errors after blur | Avoids flashing errors mid-typing; more state | |
| On Start | Defeats RULE-07's purpose | |

| Option | Description | Selected |
|--------|-------------|----------|
| No cap; the arithmetic is the only limit | Nothing hardcodes 34 or 39, so the discrepancy never needs adjudicating; honours PROJECT.md warn-don't-cap | ✓ |
| No cap, plus a soft warning past 8 | Honest about legibility degrading; risks reading as discouragement | |
| Hard cap at the computed maximum | Ruled out by PROJECT.md's scale constraint | |

**Notes:** This area surfaced a live documentation discrepancy — ROADMAP Phase 2 Notes
derive a 34-player ceiling from `players × 6 ≤ 207` (baseSpecies count) while the pool
draws from 235 draftable rows (→ 39). The chosen answer dissolves it rather than resolving
it.

---

## Shared-screen layout

**Pre-empted, not asked:** whether the board and the team strips are one surface or two.
Phase 1 already settled it — `BoardGrid` rows *are* `TeamStrip`s, and `BoardGrid.tsx:11-17`
states the players-as-rows orientation was chosen specifically to survive eight players.

| Option | Description | Selected |
|--------|-------------|----------|
| Sticky board, pool scrolls beneath | Keeps Phase 1's stacked shape; board pinned so it never scrolls out of view | (recommended, not taken) |
| Side-by-side panes | Pool ~60% / board ~40%, independently scrollable; nothing ever leaves the screen | ✓ (with expansion added) |
| Board chips shrink as players increase | Trades away DRFT-14 exactly when the room is fullest | |

**User's choice (free text):** "choice 2 by default but should be able to open either pane
for more viewing area"
**Follow-up asked:** expansion mechanism, persistence, and what a ~108px board cell renders.

| Option | Description | Selected |
|--------|-------------|----------|
| Expand button per pane header | Three discrete states; keyboard-reachable, touch-friendly, no pointer-drag code | ✓ |
| Draggable splitter | Familiar desktop idiom; awkward on touch, needs a keyboard equivalent | |
| Both | Best experience, double the surface to build | |

| Option | Description | Selected |
|--------|-------------|----------|
| Stays until changed, remembered locally | Sticky view preference in browser storage, never in the document | ✓ |
| Stays for the session only | Resets on reload, which is a supported path here | |
| Auto-reverts to split after each pick | Animates the whole screen every pick | |

| Option | Description | Selected |
|--------|-------------|----------|
| Sprite plus truncated name, full name when expanded | Sprite for recognition, name for disambiguation | (recommended, not taken) |
| Sprite only in split view, names when expanded | Cleaner and more legible; ambiguous for shared base sprites | ✓ |
| Sprite plus name on two lines | Costs vertical space, reintroducing the overflow problem | |

**Notes:** Recommendation flagged that Charizard and Charizard-Mega-X share a base sprite
and Rotom appliances read alike at 48px. User accepted that risk. Follow-on correctness
requirement recorded in CONTEXT.md D-21: `MonChip` sets `alt=""` *because* adjacent name
text supplies the accessible name, so removing the text requires `alt={entry.name}` or the
cell has no accessible name at all.

| Option | Description | Selected |
|--------|-------------|----------|
| Banner plus the highlighted board cell | Both already exist — no new build | ✓ |
| Banner, cell highlight, and a dimmed row for everyone else | Fights criterion 5 | |
| Full-width colour-coded banner per player | Needs 8 accessible colours the theme does not have | |

| Option | Description | Selected |
|--------|-------------|----------|
| Stated target plus a real-room check | Numeric target in the spec, plus physically standing back at 8 players | ✓ |
| Numeric target only | Can pass on paper while the screen is unreadable | |
| Manual judgement only | Nothing to check against, nothing to regress on | |

| Option | Description | Selected |
|--------|-------------|----------|
| Pool only | Board keeps fixed sizing; density cannot make the shared board illegible | ✓ |
| Both | Lets the host trade away DRFT-14 on the board | |
| Separate controls | Two controls for a setting most groups touch once | |

---

## Density levels

| Option | Description | Selected |
|--------|-------------|----------|
| Content too — amend the contract | Minimal = sprite+name, Standard = +typing+total, Full = +six stats; amends the `tokens.css:10` four-token note | ✓ |
| Scale only — honour the contract | Minimal becomes six numbers too small to read | |
| Content too, and re-scope the four tokens | "Whatever they need to be" is not a contract | |

| Option | Description | Selected |
|--------|-------------|----------|
| Monochrome bordered pills | Zero new colour tokens, no contrast auditing | (recommended, not taken) |
| 18 colour-coded type pills | Fastest recognition, but colour-only | |
| Colour-coded pills with the type name inside | Colour plus text, so nothing relies on colour alone; 18 new tokens | ✓ |

**Follow-up asked:** palette source and contrast handling, pill fit in a 112px cell, and
how far the colour reaches.

| Option | Description | Selected |
|--------|-------------|----------|
| Canonical hues, ink chosen per type | Preserves recognition; every pairing audited to 4.5:1 | ✓ |
| Canonical hues, darkened until one ink works | Ice, Fairy, Electric, Ground stop looking like themselves | |
| Dark-theme-native palette derived from type hues | Most cohesive, furthest from what eyes already know | |

| Option | Description | Selected |
|--------|-------------|----------|
| Three-letter type codes | ELE / FLY / WAT; two fit inside 112px with room | ✓ |
| Stack the two pills vertically | Adds a text line of height to every cell | |
| Widen --cell-min at standard density | Cuts cells-per-row by a third | |

| Option | Description | Selected |
|--------|-------------|----------|
| Pool cards and the DRFT-09 type filter | Filter and filtered speak the same language; board stays monochrome | ✓ |
| Everywhere including board chips | 48 saturated colours competing with the accent next-slot highlight | |
| Pool cards only | Filter and its target look unrelated | |

| Option | Description | Selected |
|--------|-------------|----------|
| Total at standard, six at full | The total is what drafters compare at a glance; Champions' stat budget makes it meaningful | ✓ |
| Always all six, sized by density | Decoration at minimal | |
| Six as a compact bar chart | Better for scanning, but a new primitive to design and make accessible | |

| Option | Description | Selected |
|--------|-------------|----------|
| Pool pane header, default Standard | Beside search and expand; Standard satisfies DRFT-05 and DRFT-14 together | ✓ |
| Top bar, default Standard | Separates the control from the only thing it affects | |
| Pool pane header, default Full | Most informative, fewest cells visible | |

---

## Search and filters

| Option | Description | Selected |
|--------|-------------|----------|
| Normalized substring, live | `toID`-style normalization then substring; `wash` finds Rotom-Wash, `aqua` finds Tauros-Paldea-Aqua; no name splitting | ✓ |
| Normalized prefix match, live | Would miss `wash` and `aqua`, which is how people refer to those | |
| Fuzzy match | Confident wrong answers over 235 short strings | |

| Option | Description | Selected |
|--------|-------------|----------|
| OR, with an AND toggle | OR is the common intent; a "match both" switch answers "which Water/Flying are left" | ✓ |
| OR only | Cannot express a dual-type query | |
| AND only | Three types selected returns nothing, ever | |

| Option | Description | Selected |
|--------|-------------|----------|
| Three-way: All / Mega-capable / Non-Mega | Non-Mega is a real query for a host who set a Mega requirement; composes with Phase 3's round restriction | ✓ |
| Single Mega-capable checkbox | Cannot express "only non-Mega" | |
| Mega filter folded into the type pills | Implies Mega is a type and inherits OR/AND logic wrongly | |

| Option | Description | Selected |
|--------|-------------|----------|
| Clear both on every completed pick | Prevents player 5 picking from player 4's leftover filter without noticing | ✓ |
| Persist across turns | A forgotten filter silently hides most of the pool | |
| Persist, with a visible active-filter banner | Keeps intentional filtering but relies on the next player reading the banner | |

---

## Destructive confirms

| Option | Description | Selected |
|--------|-------------|----------|
| Abandon draft / new tournament | Destroys a night's state, unrecoverable once overwritten | ✓ |
| Import JSON over a live draft | Already built as `ImportConfirmDialog` (plan 01-10, PERS-04) | ✓ |
| Re-roll pool / re-randomize order at config | Discards a result the group may have already discussed | ✓ |
| Remove a player, or clear the banlist | Discards a name and shifts order; discards dozens of clicks | ✓ |

**User's choice:** all four (multi-select). Picking was excluded from the list — D-08 is locked.

| Option | Description | Selected |
|--------|-------------|----------|
| No — undo stays one click | Undo is recovery, not destruction; a dialog taxes the net the pick flow depends on | (recommended, not taken) |
| Yes — confirm past the current round | Free inside the current round; confirms when discarding earlier rounds | ✓ |
| Yes — always confirm | Maximum protection, directly taxes D-10 | |

**Notes:** Interpreted and recorded as: the confirm fires when the pick being undone belongs
to a round earlier than the one the draft is currently on. Walking back two rounds therefore
costs one or two confirms, not one per pick. Stated to the user before writing CONTEXT.md.

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse the existing Dialog component | Focus trapping, Escape, and return-focus already solved there | ✓ |
| Inline two-step button | Easy to double-click straight through | |
| Dialog for irreversible, inline for cheap | Proportionate, but two patterns and a boundary to explain | |

| Option | Description | Selected |
|--------|-------------|----------|
| Consequence sentence plus verb-object buttons | "This discards 34 picks across 6 players." / "Abandon draft" / "Keep drafting" | ✓ |
| Question heading plus verb-object buttons | Does not say what is lost | |
| Consequence sentence plus a typed confirmation | Heavy-handed for a friendly draft tool | |

---

## Claude's Discretion

The user selected a concrete option on every question asked; no "you decide" answers were
given. The following were offered as further gray areas, and the user chose to write
CONTEXT.md rather than explore them — so they are in scope for Phase 2 and become the
planner's and researcher's calls:

- The `TournamentConfig` schema bump and whether Phase 1 saves already in browser storage
  are migrated or rejected with a stated reason.
- Whether tournament depth (DRFT-01) does anything visible in Phase 2 or is stored for
  Phase 5.
- Keyboard and touch support across the two panes.
- What `CompletedDraft.tsx` becomes at 8 players — Phase 1's per-player export panels were
  built for two.

Constrained by locked decisions rather than genuinely open:

- Where `megasRequiredPerTeam` sits in the config form and its exact label.
- Whether the constrained draw is reject-and-redraw or a two-stage draw. Both are pure and
  seeded; only reproducibility from the seed is non-negotiable.
- Which selectors are added versus extended in `src/core/selectors.ts`.

## Deferred Ideas

No out-of-phase capabilities were raised — discussion stayed inside the phase boundary.
Two items push work into Phase 3 as consequences of decisions taken here:

- **Mega-forme bans**, because D-11 chose species-only bans and Phase 3 success criterion 1
  requires a Mega-ban list.
- **Phase 3's RULE-09 gate reads two Phase 2 fields** (`megasRequiredPerTeam` and the
  recorded pool Mega-capable count) rather than recomputing, so it must also handle the two
  disagreeing after a roster rotation.
