---
phase: 05-full-tournament-brackets-standings-archive
reviewed: 2026-09-01T00:00:00Z
depth: standard
files_reviewed: 80
files_reviewed_list:
  - public/sw.js
  - src/adapters/clock.ts
  - src/adapters/library.ts
  - src/adapters/roster-source.ts
  - src/app.tsx
  - src/core/actions.ts
  - src/core/feasibility.ts
  - src/core/import-guard.ts
  - src/core/migrate.ts
  - src/core/model.ts
  - src/core/recap.ts
  - src/core/reduce.ts
  - src/core/roster/staleness.ts
  - src/core/tournament.ts
  - src/core/undo.ts
  - src/store.ts
  - src/ui/components/BracketGrid.css
  - src/ui/components/BracketGrid.tsx
  - src/ui/components/CutControl.css
  - src/ui/components/CutControl.tsx
  - src/ui/components/FinishedNotice.css
  - src/ui/components/FinishedNotice.tsx
  - src/ui/components/MatchCard.css
  - src/ui/components/MatchCard.tsx
  - src/ui/components/MatchRecordDialog.css
  - src/ui/components/MatchRecordDialog.tsx
  - src/ui/components/RecapList.css
  - src/ui/components/RecapList.tsx
  - src/ui/components/ResultsGrid.css
  - src/ui/components/ResultsGrid.tsx
  - src/ui/components/RosterRefresh.css
  - src/ui/components/RosterRefresh.tsx
  - src/ui/components/StalenessBanner.css
  - src/ui/components/StalenessBanner.tsx
  - src/ui/components/StandingsTable.css
  - src/ui/components/StandingsTable.tsx
  - src/ui/components/TiebreakOrderer.css
  - src/ui/components/TiebreakOrderer.tsx
  - src/ui/components/TournamentLibrary.css
  - src/ui/components/TournamentLibrary.tsx
  - src/ui/confirm-copy.ts
  - src/ui/screens/BanStageScreen.tsx
  - src/ui/screens/CompletedDraft.css
  - src/ui/screens/CompletedDraft.tsx
  - src/ui/screens/ConfigScreen.css
  - src/ui/screens/ConfigScreen.tsx
  - src/ui/screens/LandingScreen.tsx
  - src/ui/screens/TournamentScreen.css
  - src/ui/screens/TournamentScreen.tsx
  - tests/adapters/clock.test.ts
  - tests/adapters/library.test.ts
  - tests/adapters/roster-source.test.ts
  - tests/build/sw-behaviour.test.ts
  - tests/core/bans.test.ts
  - tests/core/feasibility.test.ts
  - tests/core/import-guard.test.ts
  - tests/core/migrate.test.ts
  - tests/core/model.test.ts
  - tests/core/recap.test.ts
  - tests/core/reduce.test.ts
  - tests/core/roster/staleness.test.ts
  - tests/core/tournament.test.ts
  - tests/core/undo.test.ts
  - tests/ui/bracket-grid.test.tsx
  - tests/ui/completed-draft.test.tsx
  - tests/ui/config-screen.test.tsx
  - tests/ui/config-tournament.test.tsx
  - tests/ui/confirm-dialogs.test.tsx
  - tests/ui/cut-control.test.tsx
  - tests/ui/finished-reopen.test.tsx
  - tests/ui/match-card.test.tsx
  - tests/ui/match-record.test.tsx
  - tests/ui/recap.test.tsx
  - tests/ui/results-grid.test.tsx
  - tests/ui/roster-refresh.test.tsx
  - tests/ui/staleness-banner.test.tsx
  - tests/ui/standings-table.test.tsx
  - tests/ui/tiebreak-orderer.test.tsx
  - tests/ui/tournament-library.test.tsx
  - tests/ui/tournament-screen.test.tsx
findings:
  critical: 1
  warning: 11
  info: 5
  total: 17
fixed:
  critical: 1
  warning: 11
  info: 0
  total: 12
remaining:
  info: 5
fix_commits:
  CR-01: d8597ca
  WR-01: 01070af
  WR-02: 0a4c9de
  WR-09: c84b26c
  WR-05: 5fc9c4c
  WR-06: 064e1dd
  WR-11: 1b33e43
  WR-07: 2b7cdf8
  WR-08: e246252
  WR-03: d4c865f
  WR-04: 7861bcc
  WR-10: 9caa640
carried_forward:
  - "WR-09 residue: TiebreakOrderer renders for the first unresolved block wherever it sits, so a
    block entirely BELOW the chosen cut leaves Take the cut correctly live and accent-filled while
    Confirm this order is also on screen. Not transient. Needs a decision about whether the orderer
    should render at all for a below-cut block."
  - "WR-02 copy: `The cut at {n} splits a tie.` is now inaccurate when the tie is wholly inside the
    cut -- nothing is split. Ruled verbatim by 05-06 and greppable by an 05-11 plan gate, so changing
    it is a plan-copy decision. Its next action (Order the tied players yourself) is still correct."
  - "IN-01..IN-05 deliberately unfixed -- outside --fix's default Critical+Warning scope."
status: fixed_with_open_info
---

# Phase 5: Code Review Report

**Reviewed:** 2026-09-01
**Depth:** standard
**Files Reviewed:** 80
**Status:** issues_found

## Summary

Nine plans across nine waves landed the tournament layer: the stage fold, the round-robin
pair set, the standings chain, the seeded bracket, the void cascade, the finished/reopen
lock, the recap and the tournament library. The pure core is genuinely strong — the
partition-refinement standings avoid the non-transitive-comparator trap by construction,
`selectBracket` derives byes from the seeding recursion rather than a hand-written loop, and
every `seq` target is a `seq` rather than an index. I found no purity violation, no
name-based identity logic, no `Set`/`Map`/`Date` reaching a persisted document, and no
newline-separated export.

The defects concentrate at the **seams between plans**, exactly as expected:

- The library filing path (05-12) and the library adapter (05-12) disagree about which entry
  a filing gesture may drop, and the disagreement destroys the tournament the host asked to
  open. That is the one Critical.
- Two *pairs* of write paths disagree about the same fact: `undo` versus `canApply` about
  whether a finished tournament is editable; `standingRoundRobinResults` versus
  `selectRemainingMatchCount` about which `rr:` ids count.
- Three surfaces (05-08's record handler, 05-11's cut control, 05-14's recap) each carry a
  comment asserting a property that the shipped code does not have. In two of those the
  comment is load-bearing (`§Color` reservation, D-17 friction) rather than decorative.
- The live-region contract is the weakest surface in the phase: one cascade is never
  announced at all, one announcement quotes a count from the wrong stage (and a test pins it),
  and two announcements have bare plurals the codebase already has a helper for.

## Critical Issues

### CR-01: Opening the oldest filed tournament at the cap deletes it and strands the host

**File:** `src/app.tsx:2593-2616` (`navigateAfterFiling`), `src/app.tsx:2636-2652`
(`fileAndProceed`), `src/adapters/library.ts:189-238`

**Issue:** `Open tournament` routes through `requestFiling({ kind: 'openEntry', id })`, which
at the cap raises the eviction confirm and then calls `fileAndProceed(doc, after)`. That
function files the live document **first** — evicting `oldestEntry()` — and only afterwards
calls `openLibraryEntry(after.id)`.

When the host presses `Open tournament` on the entry that `oldestEntry()` names, the sequence is:

1. `fileTournament(doc)` returns `{ kind: 'evicted', dropped }` where `dropped.doc.id === after.id`.
2. `vacateLiveSlot()` discards the live document, clears the saved slot and broadcasts an
   abandonment.
3. `navigateAfterFiling({ kind: 'openEntry', id })` → `openLibraryEntry(id)` returns `null`
   (the entry was just evicted) → **bare `return`**: no navigation, no message, no recovery.

Result: the tournament the host asked to open is permanently deleted from storage, the live
tournament has been filed and discarded from the live slot, and the host is left on the
landing screen with no explanation. There is no redo and no undo for a library write.

This is reachable in ordinary use because `TournamentLibrary` sorts the visible list by
`doc.createdAt` (`TournamentLibrary.tsx:194-196`) while `oldestEntry()` selects by `filedAt`
(`library.ts:189-193`), so the row the host clicks is **not** necessarily the row that
visually reads as oldest. The eviction dialog does name the dropped tournament by
`formatLabel`, but nothing in it says "and it is the one you asked to open", and a group that
reuses format labels across nights will not spot the collision.

**Fix:** Refuse the eviction when the entry being opened is the entry that would be dropped,
and make a failed open loud rather than silent.

```ts
// src/app.tsx — requestFiling
const requestFiling = useCallback(
  (after: AfterFiling) => {
    const doc = liveDocument();
    if (doc === null) {
      navigateAfterFiling(after);
      return;
    }

    const dropped = oldestEntry();
    // The gesture cannot destroy its own destination. Filing the live document to make
    // room would drop the entry the host just asked to open.
    if (dropped !== null && after.kind === 'openEntry' && dropped.doc.id === after.id) {
      setConfirm({ kind: 'openWouldEvictTarget', doc, dropped });
      return;
    }

    if (dropped !== null) {
      setConfirm({ kind: 'evict', doc, dropped, after });
      return;
    }

    setConfirm({ kind: 'file', doc, after });
  },
  [liveDocument, navigateAfterFiling],
);

// src/app.tsx — navigateAfterFiling: a null open is a reportable failure, not a no-op.
const opened = openLibraryEntry(after.id);
if (opened === null || !adoptTournament(opened)) {
  setConfirm({ kind: 'openFailed', id: after.id });
  return;
}
```

A smaller alternative that also closes it: have `fileAndProceed` capture the target document
via `openLibraryEntry(after.id)` **before** calling `fileTournament`, and adopt that captured
object afterwards. The entry would still be evicted from storage, so the confirm-side fix
above is the one that preserves the host's data.

## Warnings

### WR-01: `Undo last move` removes the final result on a finished tournament with no reopen and no confirm

**File:** `src/core/undo.ts:180-197`, `src/core/undo.ts:687`, `src/app.tsx:2147-2175`

**Issue:** D-17 makes a finished tournament read-only, and `canApply` enforces it: every
`tournament/*` arm except `tournament/reopened` returns `tournamentLocked`
(`reduce.ts:1186`, `1232`, `1248`, `1280`). Reopening is deliberately gated behind
`FinishedNotice` + `REOPEN_CONFIRM`, and `confirm-copy.ts:536-542` spends a whole dialog on
the consequence.

`undo` bypasses all of it. `undoLast` never consults `canApply` (by design, for picks), and
`isUndoable` now accepts `tournament/matchRecorded`. `undoCrossesRoundBoundary` puts `'match'`
in neither `ROUND_COMPARABLE_KINDS` nor `ALWAYS_CONFIRM_KINDS`, so `crosses` is `false` and
`handleRequestUndo` (`app.tsx:2147`) takes the no-dialog path. One press of `Undo last move`
— or `Ctrl+Z`, which `TopBar` registers on `document` — deletes the recorded final, un-crowns
the champion, unlocks the tournament and speaks `Undid the recorded result. …'s win no longer
stands.` with no confirm at all. There is no redo.

So the two write paths give opposite answers to "may this finished tournament be changed",
which is precisely the "two mechanisms for one fact" failure the rest of this phase argues
against by name.

**Fix:** Add `'match'` (and the other four tournament kinds, which are equally destructive
and equally unconfirmed) to the always-confirm set, or gate them on the lock:

```ts
// src/core/undo.ts
const ALWAYS_CONFIRM_KINDS: readonly UndoRemoval['kind'][] = [
  'banSubmission',
  'banReveal',
  // D-17: a finished tournament is read-only, and undo must not be the one path that
  // ignores that. `canApply` refuses every tournament change while locked; this is the
  // same rule on the removal side.
  'match',
  'void',
  'cut',
];
```

and give `confirm-copy.ts` the matching copy sets (`UNDO_MATCH_CONFIRM` etc.), so the
`UNDO_BOUNDARY_CONFIRM` pick prose is not reused over a match.

### WR-02: An unresolved tie *entirely inside* the cut silently decides who gets a bye

**File:** `src/core/tournament.ts:960-980` (`selectCutSplitsTiedBlock`),
`src/core/tournament.ts:598-600` (`selectSeeding`)

**Issue:** `selectCutSplitsTiedBlock` only inspects the two rows straddling the cut line. A
block the chain could not resolve that sits wholly **inside** the cut passes the gate — and
`tests/core/tournament.test.ts:1096` pins that (`selectCutSplitsTiedBlock(state, 5) === false`
with p3/p4/p5 tied at position 3).

The consequence is the same one Pitfall 4 exists to prevent, one step further in. At six
players cut to five, `selectSeeding` returns the standings order, which inside a tied block is
`config.players` order — arbitrary relative to anything the room played. `bracketSize(5) = 8`,
`seedOrder(8) = [1,8,4,5,2,7,3,6]`, so seed 3 draws a **bye** into the semi-final while seeds 4
and 5 play each other. Which of the three tied players gets that bye is decided by their
position in the config screen's player list. The standings table on the same screen reads
`3 3 3`; the bracket beside it hands one of them a free round.

It is deterministic across folds, so the T-05-26 warning sign (seeds swapping between two
folds of one document) does not fire — which is why it survived. The room will still notice.

**Fix:** Extend the gate from "the line splits a tied block" to "a tied block is inside the
cut", and reuse `tieSplitReason`'s shape for the copy:

```ts
export function selectCutSplitsTiedBlock(state: DraftState, n: number): boolean {
  if (selectRemainingMatchCount(state) > 0) return false;

  const rows = selectStandings(state);
  if (n < 1 || n > rows.length) return false;

  // Any unresolved block with a member inside the cut, whether or not the line cuts it.
  // Seed order inside the cut decides the byes, so an unordered block is as arbitrary at
  // seeds 3-4-5 as it is at the boundary.
  for (let i = 0; i < n; i++) {
    const row = rows[i];
    if (row !== undefined && row.decidedBy === 'tied') return true;
  }
  return false;
}
```

If that is judged too strict, the minimum honest change is a second sentence on the cut
control naming the block whose seed order is about to be decided arbitrarily.

### WR-03: Voiding the cut with no bracket results recorded produces no live-region announcement

**File:** `src/app.tsx:2394-2402`

**Issue:** `handleRecordMatch` arms the void announcement only when `cascade.matchCount > 0`.
`MatchRecordDialog.tsx:333-339` explicitly documents the case that breaks it: a round-robin
correction after the cut, with no bracket result recorded yet, yields
`targetSeqs = [cut.seq]` and `matchCount === 0`. The reducer voids the cut, the bracket
disappears, the stage reverts to `roundRobin` — and the only thing the live region says is
`"{winner} beat {loser}. 0 matches left."`.

The dialog's own comment calls that sentence "the only warning the host gets that the cut is
about to go", and the announcement contract then drops the follow-through. Anybody not
watching the screen — which on a shared draft screen is most of the room — hears a routine
result correction while the bracket is deleted.

**Fix:** Key the announcement on `targetSeqs`, not on `matchCount`, and branch on `voidsCut`
the way the dialog's own sentence does:

```ts
if (cascade.voidsCut) {
  voidAnnouncementRef.current =
    cascade.matchCount > 0
      ? `The cut and ${matches(cascade.matchCount)} were voided.`
      : 'The cut was voided. The bracket is gone.';
} else if (cascade.matchCount > 0) {
  voidAnnouncementRef.current = `${matches(cascade.matchCount)} were voided.`;
}
```

### WR-04: The result announcement quotes the round-robin count after a bracket match

**File:** `src/app.tsx:2396-2398`; test that pins it: `tests/ui/match-record.test.tsx:807`

**Issue:** `selectRemainingMatchCount` counts only round-robin pairings
(`tournament.ts:169-178`). The announcement uses it for **every** recorded match, bracket
matches included. A bracket match can only be recorded once the cut has been taken, and the
cut requires `selectRemainingMatchCount(state) === 0` — so every bracket result in the
tournament is announced as `"{winner} beat {loser} 2–1. 0 matches left."`.

The existing test asserts exactly that string, so the defect is currently pinned rather than
caught.

**Fix:** Choose the count from the stage the match belongs to, or drop the clause when it is
not the round robin's:

```ts
const stage = selectTournamentStage(settled);
const tail =
  stage === 'roundRobin'
    ? ` ${matches(selectRemainingMatchCount(settled))} still to play.`
    : '';
announce(`${winnerName} beat ${loserName}${games}.${tail}`);
```

and update `tests/ui/match-record.test.tsx:807` to the corrected contract.

### WR-05: The standings count `rr:`-shaped results the pair set does not have; the remaining count does not

**File:** `src/core/tournament.ts:257-274` (`standingRoundRobinResults`) versus
`src/core/tournament.ts:169-178` (`selectRemainingMatchCount`)

**Issue:** `selectRemainingMatchCount` matches results against the derived pair set and
explicitly declines a "stray `rr:` id naming a pairing this player list does not have".
`standingRoundRobinResults`, four functions later, filters on the **regex alone**
(`ROUND_ROBIN_MATCH_ID.test`). So the two disagree about what a round-robin result is.

`import-guard.MATCH_ID_PATTERN` accepts any `rr:\d+:\d+`, does not require `i < j`, does not
bound the indices against `config.players.length`, and does not require `winnerId !== loserId`
(`import-guard.ts:1051-1091`). A shared document carrying `rr:9:9` with a real `winnerId` adds
a phantom win to that player's record and metric total, moving the standings, the seeding and
therefore the whole bracket — while the grid above it reads `All N matches are recorded.` and
shows nothing amiss. `canApply` refuses origination (`unknownMatch`), so this is import-only,
but importing a friend's JSON is a first-class path in this app.

**Fix:** Route the standings through the same pair set the count uses:

```ts
function standingRoundRobinResults(state: DraftState): MatchResult[] {
  const known = new Set(selectRoundRobinMatches(state).map((match) => match.matchId));
  const live: MatchResult[] = [];

  for (const result of state.matchResults) {
    // The PAIR SET, not the id shape — `selectRemainingMatchCount` already declines a
    // stray `rr:` id, and the two must not disagree about what a round-robin result is.
    if (!known.has(result.matchId)) continue;
    ...
  }
  return live;
}
```

### WR-06: `library.readEntry` adopts the raw parsed object, discarding the guard's rebuilt document

**File:** `src/adapters/library.ts:117-132`

**Issue:** `readEntry` calls `isValidTournament(stored)` — a **predicate** that builds a
sanitised document and throws it away (`import-guard.ts:1237-1241`) — and then calls
`migrate(stored)` on the raw `JSON.parse` output. For a schema-5 entry, `migrate` returns the
argument **by identity** (`migrate.ts:449`), so what reaches `adoptTournament` is the raw
parsed object: every unvalidated own property on the document, on `config`, on `rng` and on
every log entry survives into `docSignal`, into the autosave and into the next JSON export.

The same function is scrupulous about this one line lower — "Rebuilt field by field rather
than returned as parsed, so a wrapper carrying extra keys cannot travel any further than this
line" — for the *wrapper*, and then hands the *document* through unrebuilt. It is also
inconsistent with `parseTournamentFile`, which returns `migrate(buildDoc(parsed)).doc`
(`import-guard.ts:1279-1286`).

The bounds and poison-key checks still run as a predicate, so this is not an unbounded
allocation or a prototype-pollution hole; it is unvalidated data reaching the store from a
hand-edited `localStorage` key.

**Fix:** Export a builder from the guard and use its output.

```ts
// src/core/import-guard.ts
export function buildTournament(value: unknown): TournamentDoc | null {
  return buildDoc(value);
}

// src/adapters/library.ts
const rebuilt = buildTournament(value['doc']);
if (rebuilt === null) return null;

const migrated = migrate(rebuilt);
if (!migrated.ok) return null;

return { filedAt: filedAt as number, doc: migrated.doc };
```

`src/adapters/persistence.ts:272-300` carries the same shape and should be corrected with it.

### WR-07: An imported roster file silently overwrites a committed regulation's snapshot

**File:** `src/adapters/roster-source.ts:801-825` (`readRosterFile`),
`src/adapters/roster-source.ts:583-590` (`register`)

**Issue:** `readRosterFile` calls `register(snapshot.regulation, bundle)` with no check that
the label is already held, and `register` unconditionally overwrites both registry keys. So a
host who picks a roster JSON whose `regulation` field reads `M-B` replaces the committed,
checksum-pinned M-B snapshot for the rest of the session — for `resolveSnapshot`, for the
recap's species names, for `selectSlotStone`, and therefore for the Showdown/pokebase export
text. Nothing is compared against `roster.index.json`'s published `checksum`, and the contract
has no sentence for a successful import (`RosterRefresh.tsx:38-46`), so there is no notice
either.

The documented intent is narrower — "a night filed under a regulation this build has never
shipped becomes readable" — and the code does more than that.

**Fix:** Refuse or ring-fence a collision with a regulation the manifest already pins.

```ts
const existing = registry.get(snapshot.regulation);
if (existing !== undefined && existing.snapshot.checksum !== snapshot.checksum) {
  // REFR-02 exists to make an UNKNOWN regulation readable. Silently replacing a committed
  // one would re-point the recap, the stones and the export text at a file the manifest
  // never published, with nothing on screen to say so.
  return null;
}
```

### WR-08: Duplicate `key` in the library list when a tournament is filed twice

**File:** `src/ui/components/TournamentLibrary.tsx:206`

**Issue:** *(Extension of already-known item 4.)* Opening a filed tournament leaves the
original entry in place and files a second copy with the same `doc.id`; that much is recorded
as deliberate, and `openLibraryEntry` returning the newest is why "nothing breaks". What is
not recorded is that the visible list keys on `entry.doc.id`, so two entries with one id
produce **two children with the same Preact key** in the same `<ul>`. Preact's keyed diff
assumes uniqueness; the practical results are a spurious duplicate row for one night and DOM
reuse across the two rows on re-render, which can attach the wrong `onClick` closure to the
wrong `Download JSON` button after a sort change.

**Fix:** Key on the pair that is actually unique, and — better — deduplicate on read so the
duplicate row never renders:

```tsx
<li key={`${entry.doc.id}-${entry.filedAt}`} class="tournament-library__row">
```

The stronger fix is for `fileTournament` to replace an entry with a matching `doc.id` rather
than prepend a second one, which also stops the cap being consumed by re-filings.

### WR-09: Two accent-filled primary actions render together on the round-robin stage

**File:** `src/ui/components/CutControl.css:51-67`,
`src/ui/components/TiebreakOrderer.css:115-128`,
`src/ui/screens/TournamentScreen.tsx:293-305`

**Issue:** `§Color` reservation 2 allows one accent-filled action per screen state. Both
`Take the cut` and `Confirm this order` are accent-filled, and both are rendered
unconditionally in the `roundRobin` block — `TiebreakOrderer` renders whenever any row is
`tied`, and `CutControl` renders always. `cut-control__action--inert` only sets
`opacity: 0.45`; the accent fill and the accent border stay.

Two files carry a comment asserting this cannot happen, and both are wrong:

- `TiebreakOrderer.tsx:268-272` — "`Take the cut`, is inert for as long as this control is on
  screen (an unresolved block splits the cut)".
- `TournamentScreen.tsx:296-297` — "The cut is inert for as long as the override is on screen,
  so the sequence is enforced by the gate rather than only implied by the layout."

Neither is true: `selectCutSplitsTiedBlock` only fires when the block straddles the cut line
(see WR-02), so a tie inside the cut leaves `Take the cut` fully live and fully accented
beside `Confirm this order`. This is a cross-plan seam — 05-11 wrote both controls and each
assumed the other was suppressed.

**Fix:** Either strip the accent from the inert cut (`.cut-control__action--inert { background:
transparent; color: var(--color-text); border-color: var(--color-border); }`), or — the fix
that also resolves WR-02 — make an unresolved block anywhere in the cut block the button, so
the two comments become true. Correct the two comments either way.

### WR-10: Leaving the recap drops focus to `<body>` if the final was undone while it was open

**File:** `src/ui/screens/TournamentScreen.tsx:196-203`, `:374-383`

**Issue:** `View the draft recap` renders only inside the `!recapShowing && stage === 'bracket'`
block and only when `finalRecorded`. The top bar — including `Undo last move` and the
document-level `Ctrl+Z` handler — stays mounted above the recap, deliberately. So the host can
undo the final while the recap is on screen, at which point `finalRecorded` becomes `false`.
Pressing `Back to the bracket` then arms `pendingRecapActionFocus`, the layout effect runs
`document.getElementById(RECAP_ACTION_ID)?.focus()`, the element no longer exists, and focus
falls to `<body>` — the exact failure `RECAP_ACTION_ID`'s own doc block exists to prevent.

**Fix:** Fall back to the surface the recap replaced when the arming target has gone.

```ts
useLayoutEffect(() => {
  if (!pendingRecapActionFocus.current) return;
  pendingRecapActionFocus.current = false;

  // The control can have gone while the recap was open — undoing the final removes it.
  // Falling back to the bracket heading keeps focus on the surface the recap replaced.
  const target =
    document.getElementById(RECAP_ACTION_ID) ?? document.getElementById(BRACKET_HEADING_ID);
  target?.focus();
});
```

### WR-11: `koDifference` cannot express a negative value, which is half of that metric's range

**File:** `src/core/import-guard.ts:1079`, `src/ui/components/MatchRecordDialog.tsx:196-200`,
`:323`

**Issue:** `config.matchMetric` offers `koDifference`, described in `model.ts:162` as "KOs
scored minus KOs conceded". The guard bounds the field with
`isNonNegativeInteger(metric) && metric <= MAX_MATCH_METRIC`, the dialog's gate repeats
`parsedMetric >= 0`, the field publishes `min={0}`, and the inert reason reads `Enter a number
from 0 to 18.` A signed difference is therefore truncated at zero: a winner who took a
best-of-three 2–1 while conceding more KOs than they scored has no legal value to enter, and
the host is forced to type a number that is not the one the metric names. The standings' link 2
then sorts on a systematically wrong total.

`MAX_MATCH_METRIC`'s own doc block derives 18 as "six Pokémon times three games", which is the
`pokemonLeft` range — the `koDifference` case was not carried through.

**Fix:** Bound the field by the metric. Either make the range metric-dependent
(`-MAX_MATCH_METRIC … MAX_MATCH_METRIC` for `koDifference`, `0 … MAX_MATCH_METRIC` for
`pokemonLeft`), threading the same constant into `NumericField`'s `min` and into
`METRIC_RANGE_REASON`; or, if a signed field is unwanted, remove `koDifference` from
`MATCH_METRICS` and from `MATCH_METRIC_OPTIONS` rather than shipping a metric the app cannot
record. Note that widening the range is a schema-compatibility change: `isNonNegativeInteger`
is the current guard, so documents written with a negative metric would be refused by any
build that has not been updated.

## Info

### IN-01: Three `isSameSet` implementations, one of which is not the same function

**File:** `src/core/tournament.ts:378-385`, `src/core/reduce.ts:689-694`,
`src/ui/components/TiebreakOrderer.tsx:119-122`

**Issue:** The first two are byte-equivalent and both reject a duplicated id via the
`members.size !== a.length` check that `tournament.ts:375-376` documents as load-bearing. The
third omits it and uses `a.every(...) && b.every(...)`, so `['a','a','b']` and `['a','b','b']`
compare equal. The inputs happen to be unique today (`block` comes from the selector, `order`
is a permutation of it), so nothing is currently wrong — but the UI copy has silently dropped
the safety property its two siblings advertise.

**Fix:** Export the core implementation once (`src/core/tournament.ts`) and import it at the
other two sites; a set-equality predicate over player ids is core's question, not a component's.

### IN-02: Live-region announcements use bare plurals the codebase has a helper for

**File:** `src/app.tsx:2397`, `src/app.tsx:2401`

**Issue:** `"… {n} matches left."` and `"{n} matches were voided."` render `1 matches left.`
and `1 matches were voided.` `confirm-copy.matches()` exists for exactly this and is used by
`ResultsGrid`, `CutControl`, `MatchRecordDialog`, `RecapList` and `roundRobinSizeLine`. The
documented "the bare plural is the contract's" exemption covers the three *rendered* sentences
that a plan-level gate greps for as contiguous runs; neither of these two is one of them.

**Fix:** `import { matches } from './ui/confirm-copy'` (already imported in `app.tsx` for the
undo copy) and interpolate it.

### IN-03: `1 players` in two config-screen sentences

**File:** `src/core/feasibility.ts:482`, `src/ui/screens/ConfigScreen.tsx:192-194`

**Issue:** `bracketNeedsFourPlayersMessage(1)` renders `At 1 players the round robin already
decides it.` and `roundRobinSizeLine(1)` renders `A round robin at 1 players is 0 matches.`
Both are reachable: `TOO_FEW_PLAYERS` blocks at fewer than two but does not stop these two
sentences rendering beside it. `feasibility.ts:478-479` anticipates the two-player case
explicitly and stops there. `TournamentLibrary.libraryRowDescription` already has the
`player`/`players` idiom.

**Fix:** Add a `players(count)` helper beside `matches(count)` in `confirm-copy.ts` and route
both sentences through it, or gate `roundRobinSizeLine` on `players.length >= 2`.

### IN-04: Three surfaces resolve "the standing result" with `find` rather than highest-`seq`

**File:** `src/ui/components/ResultsGrid.tsx:199-201`,
`src/ui/components/BracketGrid.tsx:118-120`, `src/ui/components/MatchRecordDialog.tsx:174`

**Issue:** `tournament.ts:250-255` and `reduce.ts:666-673` both resolve a match's standing
result as "highest `seq` per match id", and both note that this is an identity only "with the
one entry per pairing that `DraftState.matchResults` promises". Three UI surfaces take the
first array match instead. Today they agree; the moment the fold's `TOURNAMENT_MATCH_RECORDED`
arm stops replacing in place — which its own comment contemplates — the grid, the bracket and
the record dialog will show a superseded result while the standings show the current one, and
nothing would flag the divergence.

**Fix:** Export `liveResultFor` from `src/core/tournament.ts` and use it at all three sites, so
"what stands" has one definition.

### IN-05: A refused `tournament/resultsVoided` leaves a half-applied correction with no signal

**File:** `src/app.tsx:2369-2375`

**Issue:** `handleRecordMatch` dispatches the record, closes the dialog, then dispatches the
void and ignores its `CanApplyResult`. If that second dispatch is refused, the corrected result
stands while the downstream results it was supposed to clear remain in the fold — a bracket
seeded from a table that no longer holds, which is the exact state D-11 exists to prevent — and
nothing on screen says so. The handler's own doc block reasons carefully about the *ordering*
of the two dispatches but not about the second one failing.

I could not construct a reachable path to the refusal (`tournamentLocked` cannot become true
from a record with a non-empty cascade, since the final's cascade is always empty), so this is
defence-in-depth rather than a live bug.

**Fix:** Branch on the result and report, on the precedent `fileAndProceed` sets for a refused
library write:

```ts
const cleared = dispatch(resultsVoided(cascade.targetSeqs, causedBySeq));
if (!cleared.ok) setConfirm({ kind: 'voidFailed', reason: cleared.reason });
```

---

_Reviewed: 2026-09-01_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
