---
phase: 03-compiled-rules-priority-cards-swaps
plan: 08
subsystem: core+ui
tags: [priority-cards, phase-routing, card-panel, pick-order, pane-availability, focus-handoff]

# Dependency graph
requires:
  - phase: 03-compiled-rules-priority-cards-swaps
    plan: 07
    provides: resolvePickOrder, cards/played, order/resolved, and the five card selectors this plan reads and never recomputes
  - phase: 03-compiled-rules-priority-cards-swaps
    plan: 02
    provides: schedule/compiled, which is the half of the deals-cards gate that separates a v3 draft at round 1 from a migrated one
  - phase: 02-the-draft-screen
    provides: SplitPanes' PaneAvailability union, TurnBanner's spoken mirroring, and the CompletedDraft precedent for replacing the pool pane
provides:
  - selectPhase — the one place the screen's mode is decided, and the reason "played but not yet resolved" is unrepresentable
  - selectDealsCards — the migrated-document gate, one definition and three readers
  - selectCardTurn — the card clock, moved out of canApply which held the only copy
  - selectCurrentTurn rewritten to read order/resolved, with the schema-2 fallback gated on the document rather than the round
  - cardsNotResolved — a pick during bidding reports the real reason rather than draftComplete
  - CardFace and CardPanel, and --card-min in the token table
  - the sticky head's second line — the card rule during bidding, the resolved order for the whole of picking
  - SplitPanes.boardExpandable and phaseReason — Amendment 3's two rows
affects:
  [
    03-09 D-21's offer constraint (attaches at the marked comment in canApply(CARDS_PLAYED); the inert card is an attribute change on CardFace's existing button vnode),
    03-10 undo across cards (D-20 walks back cards/played and order/resolved together; undoCrossesRoundBoundary now reports the true current round),
    03-11 swap rounds (selectPhase already returns 'swapRounds'; TurnBanner's phase line has the branch to extend),
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A phase derived from the log rather than stored: a document cannot declare a mode it is not in, and a round with cards but no resolution reads as exactly what it is"
    - "A fallback gated on the DOCUMENT rather than on the round — per-round it would fire for every round before its resolution, which is the card phase itself"
    - "The live region is one signal, so an event and the turn it causes are ONE composed string, never two announces"
    - "A rule the reducer needs and the UI needs is a selector, not a reducer-local: canApply held the only copy of the card clock until the panel needed it too"

# Key files
key-files:
  created:
    - src/ui/components/CardFace.tsx
    - src/ui/components/CardFace.css
    - src/ui/components/CardPanel.tsx
    - src/ui/components/CardPanel.css
    - tests/ui/card-play.test.tsx
  modified:
    - src/core/selectors.ts
    - src/core/reduce.ts
    - src/core/undo.ts
    - src/app.tsx
    - src/ui/components/TurnBanner.tsx
    - src/ui/components/TurnBanner.css
    - src/ui/components/SplitPanes.tsx
    - src/ui/tokens.css
    - tests/core/selectors.test.ts
    - tests/core/reduce.test.ts
    - tests/core/undo.test.ts
    - tests/ui/turn-banner.test.tsx
    - tests/ui/draft-panes.test.tsx
    - tests/ui/mega-round.test.tsx
    - tests/ui/config-feasibility.test.tsx

decisions:
  - "The migrated-document gate needs the SCHEDULE as well as cardsPlayed. Gated on cardsPlayed alone, as the plan's action text says, a brand-new v3 draft at round 1 has an empty cardsPlayed too and would be read as migrated — the card phase would never open and the whole plan would be dead code"
  - "selectCardTurn deliberately does NOT ask whether the round has resolved. A document whose round resolved while somebody still held a card must reach canApply's roundAlreadyResolved arm with that player named, which 03-07 tests; the is-the-screen-bidding question is selectPhase's"
  - "The card-played announcement is composed into TurnBanner's spoken string rather than announced separately, because announce writes one signal and the play and the turn change it causes land in the same tick"
  - "A pane availability pair stays (boolean, phaseReason) rather than becoming a PaneAvailability prop, so SplitPanes keeps owning its own copy and the WR-07 'unavailable with no reason' state stays untypeable"
  - "Focus after a play is asserted on the OUTCOME, not on isConnected: when both players hold the same value Preact reuses the pressed node, and asserting the handoff fired would be asserting a detail of the keyed diff"

metrics:
  duration: ~65 min
  completed: 2026-08-18
  tasks: 3
  commits: 5
  files-changed: 20
  tests-added: 61
---

# Phase 3 Plan 08: The Card-Play Step and the Phase Routing Summary

The round opens on a card panel in the pool pane, each player in turn puts a card down face
up, the last card resolves the order without a click, and the sticky head reads
`Pick order: 1 Ada · 2 Bo` for the whole of the picking that follows.

## What Was Built

**`selectPhase` — the one place the screen's mode is decided.** Four answers: `'cards'`
while the current round has no `order/resolved`, `'picking'` once it has, `'swapRounds'`
when the picks are done and the tournament runs them, `'complete'` otherwise. Derived from
the log rather than stored, which is what makes "played but not yet resolved"
unrepresentable as a screen state and what stops an imported document declaring a mode it
is not in (T-03-29). `app.tsx` branches on it; **no component calls it** — the only two
mentions under `src/ui/` are prose in doc blocks, and the only imports from `core/selectors`
in a component are `type` imports.

**`selectCurrentTurn`, rewritten.** It reads the round's resolved order, so a round whose
rotation reversed the starting order picks in the reversed order — the case a selector still
reading `state.order` gets wrong while looking right in round 1. `null` now covers three
states rather than two, and the stale doc comment claiming Phase 2 would replace this
selector is gone, replaced by what is now true.

**The three callers that would have silently misread the third null.** `canApply(DRAFT_PICK_MADE)`
gained `cardsNotResolved`, branching *after* the completion check so `draftComplete` keeps
its own meaning — a pick during bidding used to report the opposite end of the draft.
`undoCrossesRoundBoundary` now reads `selectCurrentRound`; its `config.rounds` fallback was
written for the one null that existed then, and between two rounds of a six-round draft it
would have described every undo as reaching back from round six. `app.tsx` and `BoardGrid`
were the third, and are covered by the UI tests.

**`CardFace` and `CardPanel`.** One digit at `--text-display` on a `--card-min` square, in a
playable state that is a real button and a played state that is not a control at all. The
panel shows the hand on the clock, the played row **in play order** — which is also the
tiebreak order, so the row is the rule made visible rather than a description of it — and
the still-to-play line. It replaces the pool pane's content and nothing else; the board
stays beside it throughout.

**The sticky head's second line.** `The lowest card picks first.` during bidding, with
` Ties go to whoever played the value first.` appended to the same composed string only when
`players > rounds`. During picking it becomes `Pick order: 1 Ada · 2 Bo · 3 Cy` and stays
there — CARD-08 asks for the order to be readable at the fourth pick, not only at the moment
it resolves, and the test asserts it after picks have been made for exactly that reason.

**Amendment 3's two pane rows.** During card play both expands render inert with
`Available once the round's cards are played`, and a stored `pool-full` **or** `board-full`
coerces to `split` silently. `board-full` is refused for a reason `pool-full` never had: the
pool pane holds the only control that can play a card.

## Key Implementation Details

**The deals-cards gate needs both halves, and the plan's action text only names one.**
`selectDealsCards` is `schedule.length > 0 || cardsPlayed.length > 0`. The plan says to gate
the migrated-document fallback on "the document having no `cardsPlayed` at all". That alone
is wrong in the one direction that matters: a brand-new v3 draft standing at round 1 also
has an empty `cardsPlayed`, so it would be read as migrated, `selectPhase` would answer
`'picking'`, and the card panel would never open — the plan would ship as dead code. The
schedule is what separates the two, which is the same gate `app.tsx`'s `hands` memo already
used and 03-UI-SPEC already specified. It is now one exported definition with three readers,
and `app.tsx`'s memo reads it rather than holding a third copy.

**`selectCardTurn` deliberately does not ask whether the round resolved.** It answers "first
player in the rotation who has not played", full stop. Adding the resolved check inside it
would have broken 03-07's `roundAlreadyResolved` test, and correctly: a document whose round
resolved while somebody still held a card must reach that arm with the player named, rather
than being turned away as out of turn. The is-the-screen-bidding question belongs to
`selectPhase`, and `app.tsx` gates on the phase before consulting the clock.

**The announcement is one string, not two.** `announce` writes a single signal, so the last
write in a tick is the only one heard. A card play changes the turn in the same tick, so
`handlePlayCard` **returns** what happened and `app.tsx` threads it to `TurnBanner` as
`lastMove`, which prepends it to the composed turn line: `Ada plays 4. Round 1 of 6 — Bo
plays a card`. This is the construction `. Filters cleared.` already uses, and its own
comment gives the reason. On the last card of a round the returned string carries both the
play and the resolution, so neither is lost.

**Two focus handoffs, not one.** Inside a round the panel handles it: the played card leaves
the hand, and the panel focuses the first card of the new one. On the LAST card the panel
unmounts entirely, so its effect never runs — `app.tsx` arms a second handoff to the pool
grid's first cell. Both reuse `SplitPanes`' shape: record the activated control only when
the keyboard was genuinely on it, then move focus only once the node has left the document.

**Pane availability stayed a pair rather than becoming a union prop.** `boardExpandable`
plus `phaseReason`, with the unions still built inside `SplitPanes`. Passing
`PaneAvailability` from `app.tsx` was the tempting refactor, but the union's whole job is to
make "unavailable, no reason given" untypeable *inside the component that renders it*, and
moving construction out would relocate the guarantee rather than keep it. `phaseReason` is
consulted first for both sides, so the pool says the nearer thing during card play instead
of naming a wait the host is not in.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The migrated-document gate as specified would have disabled the card phase entirely**

- **Found during:** Task 1
- **Issue:** The plan's action text says to gate the schema-2 fallback on "the document
  having no `cardsPlayed` at all rather than on the round". A fresh v3 document at round 1,
  before the first card, also has no `cardsPlayed` — so it would take the fallback,
  `selectPhase` would answer `'picking'`, and no round would ever be bid.
- **Fix:** `selectDealsCards` is the schedule **or** any card played, matching the gate
  `app.tsx`'s `hands` memo and 03-UI-SPEC already use. The plan's stated intent — "so a v3
  document mid-bidding is never mistaken for a migrated one" — is preserved and extended to
  a v3 document that has not started bidding yet.
- **Files modified:** `src/core/selectors.ts`
- **Commit:** 50df7fc

**2. [Rule 2 - Missing critical functionality] The card clock existed only inside `canApply`**

- **Found during:** Task 3
- **Issue:** The card panel needs to know whose card is on the clock, and the only
  implementation of that rule lived inline in `canApply(CARDS_PLAYED)`. The UI's two options
  were importing from the reducer or deriving the rotation a second time, and 03-UI-SPEC's
  pure-core boundary says plainly that if a surface seems to need the UI to decide a rule,
  the selector is missing.
- **Fix:** Added `selectCardTurn` and refactored `canApply` to consume it. Byte-equivalent
  behaviour — the empty clock still fails the comparison and is still refused as
  `notYourTurn`, which 03-07's tests pin.
- **Files modified:** `src/core/selectors.ts`, `src/core/reduce.ts`
- **Commit:** f33d834

**3. [Rule 3 - Blocking] Four test fixtures compiled a schedule but never resolved a round**

- **Found during:** Task 1
- **Issue:** `tests/ui/mega-round.test.tsx` and `tests/ui/config-feasibility.test.tsx` drove
  picks against documents that now stand in the card phase, so the pool showed no round
  restriction and `selectCurrentTurn` was null. `tests/core/reduce.test.ts`'s pick-legality
  block had the same shape. None of these files is in any task's `<files>` list.
- **Fix:** `withCardedPicks` in `reduce.test.ts` plays each round's cards and resolution
  before that round's picks; `mega-round` resolves every round up front because it is a test
  about the pool, not the bidding; `config-feasibility` gained `bidCurrentRound`, which is
  what the card panel does for the host. Every player plays the round's own number, so the
  round ties on value and `seq` resolves it back into `state.order` — the pick order is the
  same strict alternation those fixtures always assumed.
- **Files modified:** `tests/core/reduce.test.ts`, `tests/ui/mega-round.test.tsx`,
  `tests/ui/config-feasibility.test.tsx`
- **Commits:** 50df7fc

**4. [Rule 1 - Bug] `CardPanel` never attached the ref its focus handoff read**

- **Found during:** Task 2
- **Issue:** The layout effect queried `handGroupRef.current`, which was never attached to
  the hand group, so focus fell to `<body>` after every play. Caught by the test written for
  it rather than by review.
- **Fix:** Attached the ref.
- **Files modified:** `src/ui/components/CardPanel.tsx`
- **Commit:** 87dc305

### Two acceptance criteria whose literal grep cannot express what they mean

Recorded rather than quietly satisfied, following 03-07's `board-label-w` precedent:

- **`git diff src/core/selectors.ts | grep -c "selectIsComplete"` returns 2, not 0.** The
  criterion asks that `selectIsComplete`'s body be unchanged, and it is — every diff hunk in
  that file is at line 381 or later, and its definition sits at 245-257. The two matches are
  ADDED lines: `selectPhase` and `selectCurrentTurn` both call it. There is no way to add a
  caller without the string appearing in the diff.
- **`grep -c "selectPhase" src/ui/components/` returns 2, not 0.** Both are prose inside doc
  blocks explaining that the component does *not* compute the phase. `grep -rn "selectPhase("
  src/ui/` returns nothing, and the only `core/selectors` imports in components are `type`
  imports.

The same applies to `git diff src/ui/components/TurnBanner.tsx | grep -c "draftCompleteCopy"`,
which shows one removed line: a JSX **call site** re-indented when the return was wrapped in
a Fragment. The function definition is untouched, and
`Draft complete — 12 picks, 2 teams` is asserted on exact equality.

### Scope Notes, Not Deviations

- `DraftPhase` and `CardTurn` are named type aliases rather than the inline literal union the
  plan's `<interfaces>` block writes. Structurally identical, and it is what lets `TurnBanner`
  take the phase as a `type` import instead of restating the four strings.
- D-21's unplayable card, the deadlock escape and the unplayable rule line are **not** built.
  They are 03-09's, as the plan says, and `CardFace` keeps exactly one button vnode so that
  the inert state is an attribute change on it rather than a second shape.
- `selectPhase` answers `'picking'` for a document whose draft has not started. There is no
  rotation to put anybody on the clock, so a card panel there would name nobody; `'picking'`
  is the behaviour that screen had before the card phase existed.

## Authentication Gates

None.

## Testing

61 tests were added, and the full suite is **1325 tests across 50 files, all passing**.

- **`tests/core/selectors.test.ts` (19)** — `selectPhase`'s four answers including the
  migrated and not-yet-started documents; `selectCurrentTurn` null while bidding and reading
  the round-2 resolved order, which is the reverse of `state.order` in that fixture;
  `selectDealsCards` true for a v3 draft with an empty `cardsPlayed`; and DRFT-04 at six
  rounds with every hand emptied.
- **`tests/core/reduce.test.ts` (5)** — `cardsNotResolved` before the first card and with
  every card down, the resolved order's first picker accepted the moment the round resolves,
  `draftComplete` still winning at a full draft, and the arm never firing for a migrated
  document.
- **`tests/core/undo.test.ts` (3)** — the boundary check reporting the round being bid on
  rather than `config.rounds`.
- **`tests/ui/card-play.test.tsx` (16, new)** — `Play 3` on exact equality, the played row in
  play order for a round where the third player played the lowest value, the empty-row
  sentence, `Still to play` absent for the last player, focus landing on a button inside the
  hand group and not on `<body>`, and no accent-filled button on the surface.
- **`tests/ui/turn-banner.test.tsx` (7 new, 5 rewritten onto a `mount` helper)** — the
  card-phase headline in full, the tie clause present at 8 players and absent at 4, the pick
  order still there after two picks, and the announcement composed as one string.
- **`tests/ui/draft-panes.test.tsx` (11)** — both expands inert with the card-phase reason,
  the ARIA shed once picking begins, `board-full` coerced and then honoured again, the round
  resolving on the last card with no `Start picking` control anywhere, focus handed to the
  pool grid, and a **six-round draft played start to finish through the UI** — 24 clicks,
  ending at `Draft complete — 12 picks, 2 teams`.

`npm run check:pure` (0 violations, 18 core files), `npm run check:nohtml` (0 violations, 66
files), `npm run check:pure:selftest` and `npm run build` (322 URLs precached) all pass.
`git diff --stat package.json` is empty.

**One caveat about `npm run verify`, stated plainly.** At vitest's default 5000ms timeout,
two tests intermittently time out on this machine: `ban-list`'s 187-ban case (measured at
8362ms) and two `sw-manifest` cases that shell out to a build script. Both pass in isolation,
and the entire suite passes at `--testTimeout=30000`. Neither file touches anything this plan
changed — `ConfigScreen` renders no banner, no panes and no card surface. They are logged in
`deferred-items.md` with the evidence and a suggested fix, and were **not** fixed here
because the remedy is a change to shared test configuration for a pre-existing environmental
sensitivity.

The 64px card face and the three-metre legibility question remain DRFT-14 human-verify items
for plan 03-12. happy-dom performs no layout, and `card-play.test.tsx` says so in its header
beside the assertions it can make.

## Known Stubs

None. Every surface this plan names is wired to a selector and reachable through the UI: the
card panel dispatches real actions, the resolution is automatic, the phase line reads
`order/resolved`, and the pane rows are live. The deliberate absences — D-21's offer
constraint and the unplayable card state — are 03-09's scope, marked with a comment at the
attachment point rather than with dead code, and `selectPhase`'s `'swapRounds'` arm is
answered correctly today with 03-11 owning the surface behind it.

## Threat Flags

None. Every boundary this plan crosses was in its own register and each is mitigated:
`selectPhase` derives the mode from the log so a document cannot declare one (T-03-29); both
expands coerce rather than leaving a screen with no available action, and are inert **with a
reason** rather than removed (T-03-30); the resolved order is a materialized log entry
dispatched the instant the last card lands, so the room's reading and the record cannot
diverge (T-03-31); and `cardsNotResolved` makes a pick during bidding impossible through
every path rather than misreported (T-03-32). No new network endpoint, auth path, file access
pattern or schema change at a trust boundary. `package.json` is untouched (T-03-SC).

## Self-Check: PASSED

Created files verified present:

- `src/ui/components/CardFace.tsx` — FOUND
- `src/ui/components/CardFace.css` — FOUND
- `src/ui/components/CardPanel.tsx` — FOUND
- `src/ui/components/CardPanel.css` — FOUND
- `tests/ui/card-play.test.tsx` — FOUND
- `.planning/phases/03-compiled-rules-priority-cards-swaps/deferred-items.md` — FOUND

Commits verified in `git log`:

- `55fc226` test(03-08): add failing tests for selectPhase and the resolved-order turn — FOUND
- `50df7fc` feat(03-08): selectPhase, the resolved-order turn, and its three callers — FOUND
- `87dc305` feat(03-08): CardFace and CardPanel — FOUND
- `f33d834` feat(03-08): route the phase, and the sticky head that carries the order — FOUND
- `06a7019` test(03-08): a six-round draft played start to finish through the UI — FOUND

## TDD Gate Compliance

Task 1 is the plan's only `tdd="true"` task and ran RED then GREEN, with the failing run
recorded before the implementation commit:

- `55fc226` (test — 16 failures observed across the three core files)
- `50df7fc` (feat — 678 core tests passing)

No REFACTOR commit was needed; the implementation had no duplication to remove once green.
Tasks 2 and 3 are not TDD tasks. Task 2 nonetheless landed its component and its test file in
one commit with the test written alongside, and Task 3's regression — `CardPanel`'s unattached
ref — was caught by a test rather than by review.
