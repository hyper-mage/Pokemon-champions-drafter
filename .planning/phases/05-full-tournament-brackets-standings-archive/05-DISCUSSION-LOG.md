# Phase 5: Full Tournament — Brackets, Standings, Archive - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-25
**Phase:** 5-full-tournament-brackets-standings-archive
**Areas discussed:** Round robin shape & result entry; The cut, byes and Bo3; Editing a match that already advanced; The tiebreak host override; Completed tournament & archive scope; The draft recap; Roster refresh & staleness banner

All seven offered gray areas were selected for discussion.

---

## Round Robin Shape & Result Entry

### What each deeper depth generates

| Option | Description | Selected |
|--------|-------------|----------|
| Both run RR → cut → elim; tier 3 adds the log | `draftAndBrackets` = round robin, seeded cut, single elim, winner-only records. `draftBracketsAndLog` = same structure plus the numeric field and editable history. Matches TOUR-01's wording literally. | ✓ |
| Tier 2 = bracket only, tier 3 = RR + cut + bracket | Tier 2 seeds a single elim straight off the draft's starting order. Fewer matches for a short night. | |
| Tier 2 = RR + standings only, tier 3 adds the bracket | Tier 2 stops at a round-robin table. Reads oddly against the label "draft plus brackets". | |
| You decide | Leave the depth mapping to research and planning. | |

**User's choice:** Both deeper tiers run the same structure; the third adds the match log.
**Notes:** Claude flagged the consequence immediately — with no numeric at tier 2, TOUR-08's differential link does not exist there. Confirmed later in the tiebreak area.

### Round-robin presentation

| Option | Description | Selected |
|--------|-------------|----------|
| Generated round-by-round pairings (circle method) | N-1 rounds at even counts, one sit-out per round at odd counts. Deterministic, folds from the log with no stored schedule. | |
| A fill-in-any-order results grid | N×N matrix of every pairing; record in whatever order games happen. Nothing tells the group what to play next. | ✓ |
| Pairings generated, recordable in any order | Rounds shown as guidance, any match recordable at any time. More UI than either pure option. | |

**User's choice:** Fill-in-any-order results grid.
**Notes:** Accepts that the tool does not schedule the night. Raises a legibility question at 8 players (28 live cells) recorded as Claude's discretion.

### The TOUR-07 numeric metric

| Option | Description | Selected |
|--------|-------------|----------|
| Winner's Pokémon remaining (0–6), fixed | One number for the winner only; differential derived as ± that value. | |
| KO differential, fixed | A signed number. More expressive, easier to mis-enter, needs a sign convention. | |
| Host picks the metric at config time | A config field stored beside depth; the standings header follows it. | ✓ |
| You decide | Leave it to research and planning. | |

**User's choice:** Host picks at config time.
**Notes:** Only has an effect at `draftBracketsAndLog` per the depth decision — an inertness question the codebase already has a pattern for.

---

## The Cut, Byes and Bo3

### Recording one match

| Option | Description | Selected |
|--------|-------------|----------|
| Winner and number together, one action | A match is never half-recorded; standings never read a winner with no differential. | ✓ |
| Winner now, number optional and addable later | Friendlier at the table; standings must handle a recorded match with no differential. | |
| You decide | Leave the gesture to research and planning. | |

**User's choice:** One action carrying both.

### When the cut size is chosen

| Option | Description | Selected |
|--------|-------------|----------|
| After the round robin, from the standings screen | The host sees the final table and picks the cut size then. | ✓ |
| At config time, beside depth | Checked by the feasibility gate; the group knows what they are playing for from the start. | |
| Config-time default, changeable at the cut | Two authorities on one number, which this codebase has refused elsewhere. | |

**User's choice:** After the round robin.

### Bye placement

| Option | Description | Selected |
|--------|-------------|----------|
| Top seeds, standard bracket seeding | Seed 1 first, then seed 2. Needs no explanation, rewards the round robin. | ✓ |
| Byes drawn from the tournament seed | Deterministic and reproducible, but hands a free round to someone who did not earn it. | |
| Host assigns byes explicitly | Maximum control, no rule to point at when someone objects. | |

**User's choice:** Top seeds.

### Best-of-three scope

| Option | Description | Selected |
|--------|-------------|----------|
| Per stage — round robin and bracket set separately | The usual shape for real events: Bo1 pool, Bo3 top cut. Two config values. | ✓ |
| One tournament-wide toggle | Simplest possible; the counter exists everywhere or nowhere. | |
| Per match, host toggles as they go | Standings would compare matches played under different formats. | |

**User's choice:** Per stage.

---

## Editing a Match That Already Advanced

### How a correction reaches the log

| Option | Description | Selected |
|--------|-------------|----------|
| A second `match/recorded` for the same match; last wins on fold | Ordinary append, no new action family, recap gets the correction history free. | ✓ |
| A distinct `match/corrected` action | Names the event; one more family, arm and guard. | |
| `match/cleared`, then a fresh `match/recorded` | Two actions per correction and a window with no result. | |

**User's choice:** Second `match/recorded`, last wins.

### Downstream results

| Option | Description | Selected |
|--------|-------------|----------|
| Downstream results are dropped and the bracket re-derives | A final between players no longer in it is debris; the host is told what will be cleared. | ✓ |
| Block the edit until the host clears downstream themselves | The established inert-with-a-reason move; the host unwinds by hand. | |
| Keep the downstream record and show the contradiction | Puts an invalid state on the shared screen. | |

**User's choice:** Drop downstream, re-derive.
**Notes:** Claude then surfaced a follow-up: a pure fold would let a corrected-back semifinal resurrect the old final. See "Orphaned downstream records" below.

### Correcting a round-robin result after the cut

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, and it invalidates the cut and everything after it | Same rule one level up. Consistent, and harsh when needed. | ✓ |
| Yes, standings update but the cut and bracket stay | The cut would have to be materialized; the table can then disagree with the bracket. | |
| No, taking the cut freezes the round robin | Simplest, makes a late-discovered scoring error unfixable. | |

**User's choice:** Invalidates the cut and everything after.

### Undo coverage

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, one stack for the whole night | Phase 3 established one stack; Phase 4 kept it. | ✓ |
| Yes, but editing is the only path once the match is not the last action | Same stack, two clearly separated gestures. | |
| You decide | Leave it to research and planning. | |

**User's choice:** One stack for the whole night.

---

## The Tiebreak Host Override

### Orphaned downstream records

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit clear — the correction also appends a clearing action | Nothing resurrects; the recap shows what was voided; undo restores in one step. One more action family. | ✓ |
| The fold ignores orphans; correcting back resurrects the old result | No extra machinery, and a genuinely surprising outcome nobody would predict from the screen. | |
| You decide | Leave it to research and planning. | |

**User's choice:** Explicit clearing action.
**Notes:** The more expensive option, chosen specifically to avoid the resurrection surprise.

### What the override is

| Option | Description | Selected |
|--------|-------------|----------|
| The host orders the tied block by hand | Recorded as an action naming which players it resolved. | ✓ |
| The host picks a winner of the tie, one pair at a time | Narrower gesture; a 3-way tie can produce a cycle. | |
| The host types a seed number for each tied player | Most explicit, invites collisions and gaps. | |

**User's choice:** Order the tied block by hand.

### How far the automatic chain goes

| Option | Description | Selected |
|--------|-------------|----------|
| Head-to-head applies only to a 2-way tie; 3+ goes straight to the override | Matches PROJECT.md's rejection of automatic multi-link chains. | |
| Head-to-head runs as a mini-table among the tied group, then override | Resolves some 3-way ties; the ones it cannot are the cyclic ones. | |
| You decide | Leave the boundary to research and planning. | ✓ |

**User's choice:** You decide.
**Notes:** Recorded in CONTEXT.md under Claude's Discretion with a stated lean toward the 2-way-only boundary and a requirement that the standings say which link is deciding.

### Tier 2 without a differential

| Option | Description | Selected |
|--------|-------------|----------|
| Chain is record → head-to-head → override; the column is simply not there | Two links instead of three; the host reaches the override sooner. | ✓ |
| Tier 2 shows the differential column inert with a reason | Keeps the two depths' tables the same shape. | |
| Move the numeric field down to tier 2 as well | Would contradict the depth decision already given. | |

**User's choice:** No differential column at tier 2.

---

## Completed Tournament & Archive Scope

### What "archive" means

| Option | Description | Selected |
|--------|-------------|----------|
| One slot — the finished tournament stays live until a new one starts; JSON is the archive | Consistent with "the JSON file is the system of record". Claude's recommendation. | |
| A multi-tournament library in localStorage, listed on the landing screen | Past nights browsable in-app. Adds a storage schema, a quota question, and Safari eviction applied to a whole library. | ✓ |
| One slot plus an explicit "Archive this tournament" | Two records in storage that can disagree; needs its own compaction story. | |

**User's choice:** Multi-tournament library.
**Notes:** A deliberate expansion past the one-slot design, chosen with the eviction cost stated. Claude flagged that it collided with two of the other answers in this same set and reconciled them in a follow-up.

### "New tournament" with a finished one saved

| Option | Description | Selected |
|--------|-------------|----------|
| Confirm that names what is being replaced, with a download offered in the same dialog | Reuses the existing confirm pattern. | ✓ |
| Confirm only — the checkpoint was already offered at completion | A host who dismissed the checkpoint gets no second chance. | |
| Block until downloaded or explicitly discarded | Nothing lost silently; a gate in front of the most common next action. | |

**User's choice:** Confirm with a download offered.
**Notes:** Superseded in framing by the library follow-up — nothing is replaced, so the dialog informs rather than warns. The download stays offered.

### Locking a completed tournament

| Option | Description | Selected |
|--------|-------------|----------|
| Fully correctable forever | Consistent with TOUR-06 and one undo stack. Claude's recommendation. | |
| Read-only once the final is recorded, with an explicit Reopen control | Protects the finished record from a stray click on a screen people are reading. | ✓ |
| You decide | Leave it to research and planning. | |

**User's choice:** Read-only with Reopen.
**Notes:** Claude flagged that this is a state change an append-only log has to express; resolved in the follow-up.

### The screen when the final is recorded

| Option | Description | Selected |
|--------|-------------|----------|
| The bracket stays, with the champion named on it | No new screen; the room is already looking at the bracket. | ✓ |
| A tournament summary view | A real destination for a finished tournament; one more screen in the union. | |
| You decide | Leave the ending surface to the UI design contract. | |

**User's choice:** The bracket stays.

---

## Completed Tournament & Archive Scope — Reconciliation Follow-up

### What the "New tournament" confirm protects

| Option | Description | Selected |
|--------|-------------|----------|
| Starting a new one files the current one automatically; the confirm just says so | Nothing is lost; the download stays offered because localStorage still evaporates. | ✓ |
| The host explicitly files it, and the confirm warns if they have not | Filing is a deliberate act; a host who never files accumulates nothing. | |
| Only FINISHED tournaments file automatically | Two paths through one control. | |

**User's choice:** Automatic filing; the confirm informs.

### What one library entry holds

| Option | Description | Selected |
|--------|-------------|----------|
| The whole document — full log, re-foldable, re-exportable | PERS-09's recap is folded from the log, so a summary could never render one. | ✓ |
| A compacted summary — standings, teams, champion, no log | Far smaller; permanently gives up the recap, re-export and undo for anything filed. | |
| You decide | Leave it to research and planning. | |

**User's choice:** Whole documents.

### How the library is bounded

| Option | Description | Selected |
|--------|-------------|----------|
| A fixed cap; the oldest is offered for download and dropped at the cap | Predictable, and the host is told before anything goes. | ✓ |
| Unbounded until a write fails, then surface the quota error | The failure lands while the host is trying to save a night. | |
| Unbounded, with a visible size indicator and manual delete | No surprise failures if they look at the indicator. | |
| You decide | Leave the policy to research and planning. | |

**User's choice:** Fixed cap, oldest offered then dropped. The cap number is Claude's to choose.

### How Reopen works against an append-only log

| Option | Description | Selected |
|--------|-------------|----------|
| `tournament/reopened` is a log action, undoable like everything else | Locked becomes a fold, matching `selectPhase` and `selectBanStageState`. | ✓ |
| Read-only is a UI toggle held outside the document | Does not survive reload, does not travel with an export, two tabs disagree. | |
| You decide | Leave it to research and planning. | |

**User's choice:** A log action.

---

## The Draft Recap (PERS-09)

### Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Chronological — the night in order, top to bottom | Closest to what the log is; reads as a story of the evening. | ✓ |
| Per round — a section per round, cards and picks together | Easier to answer "what happened in round 4". | |
| Per player — each player's night in one block | Loses the interleaving, which is where the sniping lives. | |

**User's choice:** Chronological.

### Contents

| Option | Description | Selected |
|--------|-------------|----------|
| Everything the log holds — bans, cards, picks, swaps, passes, match results | Phase 4's D-13 kept ban attribution expressly for this. | ✓ |
| The draft only — results live on the bracket | PERS-09 says "draft recap". | |
| Picks and swaps only | Discards the card bluffs and the ban round. | |

**User's choice:** Everything the log holds.

### Blind bans in the recap

| Option | Description | Selected |
|--------|-------------|----------|
| Only the reveal — never the raw submissions | One source for what the room may see; an abandoned-before-reveal document has no ban section, which is correct. | ✓ |
| Submissions too, since the reveal has happened by recap time | Would make the recap the one surface that leaks a private ban in an abandoned document. | |
| You decide | Leave it to research and planning. | |

**User's choice:** Reveal only.

### Corrections in the recap

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — corrections are part of what happened | The honest record when someone asks why the bracket looks different. | ✓ |
| No — the recap shows the final state of each match | Cleaner read; a summary of outcomes rather than a record of the evening. | |
| You decide | Leave it to research and planning. | |

**User's choice:** Show corrections.

---

## Roster Refresh & Staleness Banner

### Where REFR-01 fetches from

| Option | Description | Selected |
|--------|-------------|----------|
| Same-origin re-fetch, bypassing the service worker cache | Keeps the "no third-party origin at runtime" invariant that `roster-source.ts` documents and T-01-25 asserts. | |
| `raw.githubusercontent.com` from the project repo | Gets a new regulation the instant it is committed; costs the invariant and needs CORS re-confirmed. | |
| Same-origin by default, raw.githubusercontent as an explicit opt-in | Two paths, two failure modes; the invariant becomes conditional. | |
| You decide | Leave it to research and planning. | ✓ |

**User's choice:** You decide.
**Notes:** Recorded in CONTEXT.md under Claude's Discretion, with the T-01-25 invariant cost stated explicitly so the choice is made deliberately rather than by accident.

### Where the refresh control lives

| Option | Description | Selected |
|--------|-------------|----------|
| On the staleness banner itself, plus the landing screen | The banner states the problem and offers the next action in one place. | |
| The config screen, beside the roster the tournament is created against | Refresh happens where the choice of roster matters. | ✓ |
| A dedicated settings surface | A fifth screen for two controls and a banner. | |

**User's choice:** The config screen.
**Notes:** Creates a tension with the banner's "next action" — resolved as D-26: a banner shown elsewhere routes to the config screen rather than duplicating the control. Recorded as derived, not separately asked.

### A document pinned to an older snapshot

| Option | Description | Selected |
|--------|-------------|----------|
| It loads its own snapshot by `rosterVersion` and keeps working, unchanged | `roster.ma.json` is already committed; regulation stamping went into Phase 1 for exactly this. | ✓ |
| It loads, with a banner saying which regulation it belongs to | One more banner competing with the staleness one. | |
| It refuses to open if its snapshot is unavailable | Turns a rotation into a wall. | |

**User's choice:** Loads its own snapshot, unchanged.

### What the staleness banner does

| Option | Description | Selected |
|--------|-------------|----------|
| Warns and never blocks, with refresh as its next action | Consistent with the project's warn-rather-than-hard-cap posture. | ✓ |
| Warns, and blocks starting a NEW tournament until refreshed or dismissed | Would also block a host with no network, breaking the offline premise. | |
| You decide | Leave it to research and planning. | |

**User's choice:** Warns, never blocks.

---

## Claude's Discretion

Explicitly handed over by the user, or surfaced as open in CONTEXT.md:

- Where REFR-01's refresh fetches from — same-origin cache-bypass vs `raw.githubusercontent.com`, weighed against the T-01-25 invariant.
- Where the automatic tiebreak chain stops and the host override begins (the 3-way head-to-head boundary).
- The library cap number, sized against a 350–500-action document and localStorage's ~5 MB.
- The schema 4 → 5 migration and the library's own storage versioning.
- What tier 3's "match log" holds beyond the numeric field.
- Whether the config-time feasibility gate says anything about depth.
- Three-metre legibility for the standings table, the results grid and the bracket.
- Whether a live region can announce a match result usefully.

## Deferred Ideas

- A copy-to-clipboard or shareable text form of the recap — raised while designing the recap, not pursued. A new capability; its own phase.
- The free-text house-rules field — already tracked as TOUR-10 in v2 requirements; PROJECT.md's Active list is drifted.
- Double elimination, Swiss, consolation brackets — PROJECT.md Out of Scope, and the ROADMAP's own note for this phase names refusing scope as the discipline.
- Multi-client play with every player on their own device — carried forward from Phase 4.

## Closing Check

Offered three further gray areas at the end — the feasibility gate and depth, schema 4 → 5 and library versioning, and what tier 3's match log holds. User chose "I'm ready for context"; all three are recorded under Claude's Discretion instead.
