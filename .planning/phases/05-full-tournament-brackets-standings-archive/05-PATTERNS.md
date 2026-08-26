# Phase 5: Full Tournament — Brackets, Standings, Archive - Pattern Map

**Mapped:** 2026-08-26
**Files analyzed:** 47 (17 new source files + 13 new stylesheets + 10 modified source files + 7 new/extended test files)
**Analogs found:** 45 / 47 (2 have no analog — see §No Analog Found)

> **Read this before planning.** Phases 1–4 shipped 47 plans, so nearly every file in this
> phase has a real precedent in the tree. Every excerpt below is quoted from the file named,
> at the line numbers named. Where a plan action says "follow the analog", it means *copy the
> shape and the doc-block discipline shown here*, not "write something similar".

---

## File Classification

### `src/core/` — pure

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/core/tournament.ts` **(new)** | selector module (pure rules) | transform | `src/core/selectors.ts` | exact |
| `src/core/recap.ts` **(new)** | doc-taking pure fold | transform | `src/core/undo.ts` | exact |
| `src/core/roster/staleness.ts` **(new)** | pure predicate | transform | `src/core/mega.ts` / `src/core/bans.ts` | role-match |
| `src/core/actions.ts` | action vocabulary | event-driven | itself (`bans/*` family, `actions.ts:354-434`) | exact |
| `src/core/model.ts` | model / schema | state | itself (schema 3→4 bump) | exact |
| `src/core/reduce.ts` | reducer | event-driven | itself (`DRAFT_PICK_UNDONE` arm, `reduce.ts:236-251`) | exact |
| `src/core/migrate.ts` | migration | transform | `migrateV3ToV4` (`migrate.ts:309-332`) | exact |
| `src/core/import-guard.ts` | validation guard | transform | `buildLogEntry` arms (`import-guard.ts:717-...`) | exact |
| `src/core/undo.ts` | pure stack | event-driven | itself (the three ban arms, 04-07) | exact |
| `src/core/feasibility.ts` | rules gate | transform | `swapRoundsOnExactPool` warning (`feasibility.ts:107-146`) | exact |

### `src/adapters/` — ambient

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/adapters/library.ts` **(new)** | storage adapter | CRUD | `src/adapters/view-prefs.ts` (own key, own module) + `persistence.ts` (record wrapper, validation) | exact (split across two) |
| `src/adapters/roster-source.ts` | network + parse adapter | request-response | itself (`loadRoster`, `roster-source.ts:159-180`) | exact |
| `src/adapters/clock.ts` | ambient read | — | itself (`now()`, `clock.ts:11-14`) | exact |
| `src/adapters/persistence.ts` | storage adapter | CRUD | **no edit** — confirm only (`persistence.ts:263`) | n/a |

### `src/ui/` — render

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `screens/TournamentScreen.tsx` + `.css` **(new)** | screen shell | request-response | `src/ui/screens/BanStageScreen.tsx` (stage branch) + `CompletedDraft.tsx` (narrow replacement posture) | exact |
| `components/ResultsGrid.tsx` + `.css` **(new)** | grid component | request-response | `components/BanBoard.tsx:164-240` + `components/BoardGrid.css` | exact |
| `components/MatchRecordDialog.tsx` + `.css` **(new)** | modal form | request-response | `components/ConfirmDialog.tsx` (built on `Dialog`) + `NumericField` + `SegmentedControl` | role-match |
| `components/StandingsTable.tsx` + `.css` **(new)** | table component | transform | `components/PlayerList.tsx` + `BoardGrid.css` label column | role-match |
| `components/TiebreakOrderer.tsx` + `.css` **(new)** | reorder control | event-driven | `components/SchedulePreview.tsx:166-283` | exact |
| `components/CutControl.tsx` + `.css` **(new)** | bounded numeric + gate | request-response | `components/NumericField.tsx` + `components/FeasibilityBar.tsx` (inert-with-reason) | exact |
| `components/BracketGrid.tsx` + `.css` **(new)** | CSS-Grid layout | transform | `components/BoardGrid.tsx:159-215` (inline `gridTemplateColumns`) | role-match |
| `components/MatchCard.tsx` + `.css` **(new)** | cell component | request-response | `components/CardFace.tsx` / `MonChip.tsx` | role-match |
| `components/FinishedNotice.tsx` + `.css` **(new)** | banner | — | `components/ReadOnlyBanner.tsx` + `.css` | exact |
| `components/RecapList.tsx` + `.css` **(new)** | list renderer | transform | `components/BanChipList.tsx` / `BanReveal.tsx` | role-match |
| `components/TournamentLibrary.tsx` + `.css` **(new)** | list + row actions | CRUD | `screens/LandingScreen.tsx:136-166` (`saved` block) | exact |
| `components/StalenessBanner.tsx` + `.css` **(new)** | banner | — | `components/ReadOnlyBanner.tsx` + `.css` | exact |
| `components/RosterRefresh.tsx` + `.css` **(new)** | fetch + file-picker group | request-response | `screens/LandingScreen.tsx:100-166` (hidden input) + `FeasibilityBar` (`role="status"`) | exact |
| `screens/ConfigScreen.tsx` + `.css` | form screen | request-response | itself (`ConfigScreen.tsx:120-139`, `:1369-1377`) | exact |
| `screens/LandingScreen.tsx` | screen | request-response | itself (`LandingScreen.tsx:136-149`) | exact |
| `ui/confirm-copy.ts` | copy table | — | itself (`confirm-copy.ts:20-64`) | exact |
| `src/app.tsx` | router / shell | request-response | itself (`app.tsx:150-172`, `:2064-2200`) | exact |
| `src/store.ts` | write path | event-driven | itself (`store.ts:682-750`) | exact |
| `public/sw.js` | service worker | request-response | itself (`sw.js:56-75`) | exact |

### `tests/`

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `tests/core/tournament.test.ts` **(new)** | zero-mock core test | — | `tests/core/undo.test.ts:1-14` | exact |
| `tests/core/recap.test.ts` **(new)** | zero-mock core test | — | `tests/core/undo.test.ts:1-14` | exact |
| `tests/core/roster/staleness.test.ts` **(new)** | zero-mock core test | — | `tests/core/roster/transform.test.ts` | exact |
| `tests/adapters/library.test.ts` **(new)** | adapter test with storage stub | — | `tests/adapters/view-prefs.test.ts:1-55` | exact |
| `tests/build/sw-behaviour.test.ts` | build test | — | itself (`:17-50`, `:52-100`) | exact |
| `tests/ui/*.test.tsx` (7 new) | happy-dom UI tests | — | `tests/ui/schedule-reorder.test.tsx:1-40` | exact |

---

## Pattern Assignments

### `src/core/tournament.ts` (new — selector module, transform)

**Analog:** `src/core/selectors.ts`

**Why:** RESEARCH puts every tournament rule here — round-robin pair set, standings, the
tiebreak chain, seeding, bracket structure, bye placement, the void cascade, stage and locked
folds. `selectors.ts:1-16` states the contract these functions must honour, and
`selectBanStageState` (`selectors.ts:985-1005`) is the exact shape `selectTournamentStage`
takes. A **separate file** rather than growing `selectors.ts` is RESEARCH's call
(`05-RESEARCH.md` §Recommended Project Structure: `selectors.ts` unchanged).

**Module-header contract to copy** (`src/core/selectors.ts:1-16`):

```ts
/**
 * selectors.ts — every piece of derived data in the application, in one file.
 *
 * Sync rule 3: derived data is never stored. ...
 *
 * Everything here reads. Nothing here writes: no function in this file assigns into the
 * state it was handed, and the arrays and objects returned are always freshly built, so
 * a caller cannot mutate state through a selector's return value either.
 *
 * The UI-SPEC makes this a UI rule too: "if a surface seems to need the UI to decide a
 * rule, the selector is missing — add the selector, do not add the logic to the
 * component."
 */
```

**Stage-as-a-fold pattern to copy** (`src/core/selectors.ts:985-1005`) — note the
`'notRunning'` member name, the early returns ordered from cheapest fact to most derived, and
the doc block that names each member with a one-line meaning:

```ts
export function selectBanStageState(state: DraftState): BanStageState {
  if (state.config.banMode === 'hostBanlist') return 'notRunning';
  if (state.poolIds.length > 0) return 'notRunning';

  if (state.config.banMode === 'blind') {
    return state.bansRevealed === null ? 'blindLocked' : 'reveal';
  }
  ...
}
```

`selectTournamentStage` mirrors it exactly (`05-RESEARCH.md` §Pattern 1), gated on
`selectIsTournamentComplete` (`selectors.ts:709`) — **reuse it, do not re-derive it**:

```ts
export function selectIsTournamentComplete(state: DraftState): boolean {
  return selectIsComplete(state) && selectCurrentSwapRound(state) === null;
}
```

**Exact names carried through from RESEARCH — use these, do not rename:**
`selectTournamentStage`, `selectTournamentLocked`, `selectRoundRobinMatches`,
`selectStandings`, `selectSeeding`, `selectBracket`, `selectVoidCascade`;
`TournamentStage = 'notRunning' | 'roundRobin' | 'bracket'`;
`StandingsRow.decidedBy = 'record' | 'metric' | 'headToHead' | 'hostOrder' | 'tied'`;
`VoidCascade { targetSeqs, matchCount, voidsCut }`; match ids `rr:{i}:{j}` (0-based, `i < j`)
and `br:{round}:{slot}` (both 1-based).

**Freshness rule the analog enforces** (`selectors.ts:1187-1189`, `selectAttributedBans`):

```
 * The arrays are FRESH. A caller that pushed into one would otherwise be writing into the
 * fold, and the fold is a cache of the log rather than somewhere to keep things.
```

**Test file:** `tests/core/tournament.test.ts`.

---

### `src/core/recap.ts` (new — doc-taking pure fold, transform)

**Analog:** `src/core/undo.ts`

**Why:** This is the one structural finding a planner is most likely to miss. Every existing
selector takes `DraftState`, which holds only the *latest* result per match (D-09's fold arm).
D-22 needs the superseded entries, so the recap must take the document. `undo.ts` is the
precedent — it already exports doc-taking pure functions.

**Doc-taking signature pattern** (`src/core/undo.ts:97-101`, `:331`):

```ts
export function lastPickAction(doc: TournamentDoc): PickMadeAction | null {
  const index = lastPickIndex(doc);
  if (index === -1) return null;
  return doc.log[index] as PickMadeAction;
}
...
export function undoRemoval(doc: TournamentDoc): UndoRemoval | null {
```

`buildRecap` follows it, taking `state` alongside because D-21 requires the ban section to
read `DraftState` selectors:

```ts
export function buildRecap(doc: TournamentDoc, state: DraftState): readonly RecapEntry[];
```

**Structural-guard-before-read discipline** (`src/core/undo.ts:74-77`) — the recap reads
untrusted log entries and must apply the same rule:

```
 * `isPickMadeAction` rather than a bare `type` comparison, because an imported or
 * hand-edited log is untrusted input (plan 01-10 folds one). A pick-shaped entry with
 * no `monId` folds to nothing, so offering to undo it would remove an action and change
 * nothing on screen.
```

**Three rules for the module header (RESEARCH, verbatim):**
1. **D-21 secrecy** — read `selectPublicBanIds` (`selectors.ts:1053`) / `selectAttributedBans`
   (`selectors.ts:1190`), never `state.banSubmissions` and never a `bans/submitted` log entry.
   `selectAttributedBans`'s own doc block already states the equivalent contract for the
   reveal screen (`selectors.ts:1183-1186`) and this is the second surface over the same log.
2. **Corrections are marked, not struck** — `Corrected later` / `Corrects an earlier result`.
3. **Never name a variable `document`** — `scripts/check-pure-core.mjs:70` forbids the bare
   token under `src/core`. Use `doc`, as `undo.ts` does.

**Test file:** `tests/core/recap.test.ts`.

---

### `src/core/roster/staleness.ts` (new — pure predicate, transform)

**Analog:** `src/core/mega.ts` (a small pure predicate module under `src/core/` with a
sibling-mirrored test), and the existing `src/core/roster/` directory shape
(`types.ts`, `transform.ts` → `tests/core/roster/`).

**Why:** `src/core/roster/` already exists with a mirrored test directory
(`tests/core/roster/fixtures.test.ts`, `tests/core/roster/transform.test.ts`), so the file
and its test land in an established pair.

**The whole implementation is one line and the doc block is the artifact** (RESEARCH, verbatim
— the `new Date` prohibition is enforced by `scripts/check-pure-core.mjs:62`):

```ts
export function isSnapshotStale(validUntil: string, todayIso: string): boolean {
  return todayIso >= validUntil;
}
```

Compared as **strings**, deliberately; the interval is **half-open** (`roster.index.json` gives
M-A `validUntil 2026-06-17` and M-B `validFrom 2026-06-17`). `validUntil` lives on
`RosterSnapshot` (`src/core/roster/types.ts:140-155`), so no new type is needed.

**Test file:** `tests/core/roster/staleness.test.ts`.

---

### `src/core/actions.ts` (modified — action vocabulary, event-driven)

**Analog:** itself — the `bans/*` family added in Phase 4 (`actions.ts:354-434`, `:576-633`,
`:762-...`). RESEARCH names **seven** landing sites per type; the header at `actions.ts:1-41`
lists them and is the doc block that must be extended.

**Constants block to append to** (`src/core/actions.ts:43-54`):

```ts
export const POOL_BUILT = 'pool/built';
export const SCHEDULE_COMPILED = 'schedule/compiled';
...
export const BANS_REVEALED = 'bans/revealed';
```

Add the five RESEARCH names verbatim: `TOURNAMENT_MATCH_RECORDED = 'tournament/matchRecorded'`,
`TOURNAMENT_RESULTS_VOIDED = 'tournament/resultsVoided'`,
`TOURNAMENT_CUT_TAKEN = 'tournament/cutTaken'`,
`TOURNAMENT_TIEBREAK_ORDERED = 'tournament/tiebreakOrdered'`,
`TOURNAMENT_REOPENED = 'tournament/reopened'`.

**Materialized-payload pattern** (`src/core/actions.ts:103-113`) — `tournament/cutTaken { seeds }`
copies `pool/built`'s posture of carrying the resolved outcome, not the instruction:

```ts
export interface PoolBuiltPayload {
  type: typeof POOL_BUILT;
  ids: string[];
  rosterVersion: string;
  checksum: string;
  /** The pool seed that produced `ids`. `0` when no draw was rolled. */
  seed: number;
  /** How many of `ids` can Mega Evolve, measured against `rosterVersion`. */
  megaCapableCount: number;
}
```

The argument to reuse for the reveal-style "why materialize" doc block is at
`actions.ts:387-401` (`BansRevealedPayload`).

**Compensating-action payload** (`src/core/actions.ts:213-217`) —
`tournament/resultsVoided { targetSeqs, causedBySeq }` follows it:

```ts
/** Retracts the pick recorded by the action whose `seq` is `targetSeq`. */
export interface PickUndonePayload {
  type: typeof DRAFT_PICK_UNDONE;
  targetSeq: number;
}
```

**Creator pattern — fresh arrays, named fields, never a spread** (`src/core/actions.ts:603-615`):

```ts
export function bansRevealed(
  bans: readonly { playerId: string; monIds: readonly string[] }[],
): BansRevealedPayload {
  return {
    type: BANS_REVEALED,
    bans: bans.map((entry) => ({
      playerId: entry.playerId,
      monIds: entry.monIds.map((id) => id),
    })),
  };
}
```

`cutTaken(seeds)` and `tiebreakOrdered(playerIds)` both copy element by element for the reason
stated at `actions.ts:580-586` (the caller's array is one render away from being rebuilt).

**Structural guard pattern** (`src/core/actions.ts:614-644`, helpers then guard):

```ts
function isRecord(value: unknown): value is Record<string, unknown> { ... }
function isStringArray(value: unknown): value is string[] { ... }
function isSafeInteger(value: unknown): value is number { ... }

export function isPoolBuiltAction(action: AnyAction): action is PoolBuiltAction {
  if (action.type !== POOL_BUILT || !isRecord(action)) return false;
  return (
    isStringArray(action['ids']) &&
    typeof action['rosterVersion'] === 'string' &&
    ...
  );
}
```

**The guard/`canApply` split is doctrine, not preference** (`src/core/actions.ts:695-701`) —
`winnerGames`/`loserGames` are typed here and the *format* rule (`config.roundRobinFormat` vs
`config.bracketFormat`) is `canApply`'s:

```
 * Whether `value` is in `1..config.rounds`, whether that card is still in the player's hand,
 * and whether this player is the one on the card clock are all questions about the STATE,
 * and this function sees one action in isolation. They live in `canApply`, which sees both.
 * A guard that reached for the config would be a second authority on the same rules, free
 * to disagree with the first.
```

Also extend: the `Intent` union (`actions.ts:408-419`) and the `…Action = …Payload &
ActionEnvelope` alias block (`actions.ts:421-434`).

---

### `src/core/reduce.ts` (modified — reducer, event-driven)

**Analog:** itself.

**"Later beats earlier" arm** — the analog is **`DRAFT_PICK_UNDONE` (filter and rebuild),
not `DRAFT_PICK_MADE` (append)**. `src/core/reduce.ts:236-251`:

```ts
case DRAFT_PICK_UNDONE: {
  if (!isPickUndoneAction(action)) return state;
  // The compensating action drops the pick recorded by the targeted action.
  // ... `apply` receives one action and no log — `fold` is `log.reduce(apply, ...)`,
  // so the log is structurally out of reach here, and must be.
  const remaining = state.picks.filter((pick) => pick.seq !== action.targetSeq);
  if (remaining.length === state.picks.length) return state;
  return { ...state, picks: remaining };
}
```

`SWAP_MADE` (`reduce.ts:315-...`) carries the sharpest version of the same warning —
"THIS ARM REPLACES A PICK. IT DOES NOT APPEND ONE." — and `TOURNAMENT_MATCH_RECORDED` needs
the equivalent sentence in as many words (D-09).

**`seq` off the envelope, never off array length** (`src/core/reduce.ts:258-268`):

```ts
case CARDS_PLAYED: {
  if (!isCardsPlayedAction(action)) return state;
  // `seq` comes off the ENVELOPE, never off the array's length. It is what a
  // compensating action targets and what the tiebreak orders on, and the log may
  // legally have gaps in it.
  return { ...state, cardsPlayed: [...state.cardsPlayed, { ..., seq: action.seq }] };
}
```

**`RejectionReason` is a flat union with a comment per member** (`src/core/reduce.ts:66-178`):

```ts
/**
 * Why an action was refused. These strings are stable — plan 01-07's undo and plan
 * 01-10's import both branch on them, and a rejection reason is closer to an API than
 * to a log message.
 */
export type RejectionReason =
  | 'unknownAction'
  | 'malformedPayload'
  ...
  /** Wrong length for this document's round count, or indices not contiguous from 1. */
  | 'malformedSchedule'
```

Add RESEARCH's fifteen: `tournamentNotRunning`, `tournamentLocked`, `unknownMatch`,
`matchNotPlayable`, `wrongMatchParticipants`, `resultUnchanged`, `gamesNotForFormat`,
`metricNotForDepth`, `cutAlreadyTaken`, `cutSizeOutOfRange`, `roundRobinNotComplete`,
`cutSplitsTiedBlock`, `tiebreakBlockNotTied`, `notReopenable`, `nothingToVoid`.

**`canApply` ordering discipline** (`src/core/reduce.ts:518-524`) — check order is a design
decision, stated in a comment:

```ts
// AFTER the completion check and BEFORE the null turn, which is the whole of the
// ordering: the end of the draft keeps its own reason, and the card phase — the
// other state that yields a null turn — no longer borrows it.
if (selectPhase(state) === 'cards') return reject('cardsNotResolved');
```

**`canApply` nothing-to-target arm** (`src/core/reduce.ts:543-549`) — the shape
`tournament/resultsVoided`'s `nothingToVoid` copies:

```ts
case DRAFT_PICK_UNDONE: {
  if (!isPickUndoneAction(action)) return reject('malformedPayload');
  if (!state.picks.some((pick) => pick.seq === action.targetSeq)) {
    return reject('nothingToUndo');
  }
  return OK;
}
```

**The backstop-not-the-rule comment** (`src/core/reduce.ts:592-600`) is the model for
`resultUnchanged` and `tournamentLocked`: the UI renders the control inert with the stated
reason, and the reducer is the second layer.

---

### `src/core/model.ts` (modified — model / schema, state)

**Analog:** itself, the schema 3 → 4 bump.

**`SCHEMA_VERSION` and its doc block** (`src/core/model.ts:40-54`) — the comment naming the
three routing sites has to be updated in the same change:

```ts
 * `migrate.ts` owns that upgrade step and is the only module that knows how to perform
 * it. Nothing else compares a document's version against this constant: `store.ts`,
 * `adapters/persistence.ts` and `import-guard.ts` all route through `migrate` instead,
 * so there is one answer to "can this build read this document" rather than three that
 * can drift apart.
 */
export const SCHEMA_VERSION = 4;
```

**String-literal-union-with-a-comment-per-member** (`src/core/model.ts:105-116`) — the three
new config fields (`matchMetric`, `roundRobinFormat`, `bracketFormat`) each take this shape:

```ts
/**
 * How far past the last pick the tournament runs.
 *
 * Phase 2 only records this. Phase 5 is what consumes it, and recording it early is what
 * keeps a host from having to re-declare the shape of their night halfway through it.
 */
export type TournamentDepth =
  /** Draft six, export the teams, done. */
  | 'draftOnly'
  ...
```

The "these strings are an API" argument is at `src/core/model.ts:62-68` (`BanMode`) and must
be restated for each new union.

**`TournamentConfig` field doc pattern** (`src/core/model.ts:237-243`, `swapRounds`) — every
bounded numeric names the `import-guard.ts` constant that owns its bound rather than
restating a number. `MAX_MATCH_METRIC = 18` follows `MAX_BANS_PER_PLAYER`'s doc
(`import-guard.ts:144-164`).

**`copyConfig` — explicit literal, element-by-element, never a spread**
(`src/core/model.ts:542-578`):

```ts
    // Both version 4 fields are scalars, so they are named rather than spread. A spread
    // would be shorter and would defeat the whole reason this function is written out: the
    // compiler's omission check only works against an explicit literal.
    bansPerPlayer: config.bansPerPlayer,
    duplicateBanPolicy: config.duplicateBanPolicy,
```

**`DraftState` additions and `initialState`** (`src/core/model.ts:360-...`, `:580-599`). The
four new fields are `matchResults`, `cut`, `tiebreakOrders`, `lastReopenSeq: -1`. The
"why does this exist when nothing derived is stored" doc block to model on is
`DraftState.swaps` (`model.ts:390-410`) — it argues the case for an array that is the only
surviving trace of an event. `initialState`'s comment on `bansRevealed` (`model.ts:596-598`)
is the model for `cut: null` and `lastReopenSeq: -1`:

```ts
    // `null`, not `[]`. See the field's own doc block: the two are different answers and
    // only `null` means "the reveal has not happened".
    bansRevealed: null,
```

---

### `src/core/migrate.ts` (modified — migration, transform)

**Analog:** `migrateV3ToV4` (`src/core/migrate.ts:295-332`) — the smallest arm in the file and
the exact shape `migrateV4ToV5` takes.

**Defaults table** (`src/core/migrate.ts:107-135`, `V3_CONFIG_DEFAULTS`):

```
 * What every version 4 config field is worth in a version 3 document.
 *
 * Same contract as {@link V1_CONFIG_DEFAULTS} and {@link V2_CONFIG_DEFAULTS}: one place,
 * imported by `import-guard.buildConfig` rather than repeated, because two copies of a
 * default table is two tables that can disagree about what a Phase 3 tournament was.
 *
 * Both values are LOSSLESS rather than merely reasonable, and the argument is specific to
 * this bump. ...
```

`V4_CONFIG_DEFAULTS` needs the same lossless argument, and RESEARCH supplies it: a version 4
document has no `tournament/*` entries at all, because nothing in this build before Phase 5
could originate one. Recommended values `matchMetric: 'pokemonLeft'`, `roundRobinFormat: 'bo1'`,
`bracketFormat: 'bo1'`. Note in the doc block whether these coincide with the config screen's
own defaults or deliberately differ (the `bansPerPlayer` precedent, `migrate.ts:127-135`).

**The migration arm** (`src/core/migrate.ts:309-332`) — log passed through unchanged, every
array copied element by element, fresh literals:

```ts
function migrateV3ToV4(doc: V3Doc): TournamentDoc {
  const { config } = doc;
  return {
    schemaVersion: 4,
    id: doc.id,
    createdAt: doc.createdAt,
    config: {
      ...config,
      players: config.players.map((player) => ({ id: player.id, name: player.name })),
      ...
      bansPerPlayer: V3_CONFIG_DEFAULTS.bansPerPlayer,
      duplicateBanPolicy: V3_CONFIG_DEFAULTS.duplicateBanPolicy,
    },
    rng: { seed: doc.rng.seed, cursor: doc.rng.cursor },
    log: [...doc.log],
  };
}
```

**The chain** (`src/core/migrate.ts:334-364`) — `SUPPORTED_SCHEMA_VERSIONS` at
`migrate.ts:64` becomes `[1, 2, 3, 4, 5]`, `version === 5` becomes the identity passthrough,
and every existing arm gains a `migrateV4ToV5(...)` wrap:

```ts
  if (version === 4) return { ok: true, doc };
  if (version === 3) return { ok: true, doc: migrateV3ToV4(doc) };
  if (version === 2) return { ok: true, doc: migrateV3ToV4(migrateV2ToV3(doc)) };
  if (version === 1) return { ok: true, doc: migrateV3ToV4(migrateV2ToV3(migrateV1ToV2(doc))) };
```

Also: `type V4Doc = Omit<TournamentDoc, 'config'> & { config: V4Config }` on the `V3Doc`
precedent (`migrate.ts:55`), which is what makes `migrateV4ToV5` mandatory in the chain rather
than optional.

---

### `src/core/import-guard.ts` (modified — validation guard, transform)

**Analog:** itself.

**Bound constant doc pattern** (`src/core/import-guard.ts:144-164`, `MAX_BANS_PER_PLAYER`) —
`MAX_MATCH_METRIC = 18` goes here, beside it, and the `NumericField` in
`MatchRecordDialog` reads **this constant**:

```
 * `feasibility.ts` imports THIS constant rather than restating 24. The gate's bound and
 * the guard's bound must be one number: `handleStart` writes whatever the gate accepted,
 * `persistence.load` runs the result back through `isValidTournament`, and a value the
 * gate allowed but this guard refuses is a tournament the host cannot resume.
 */
export const MAX_BANS_PER_PLAYER = 24;
```

**`matchId` pattern constant** — copy the shape and the reasoning from
`src/adapters/roster-source.ts:66-72` and `src/ui/sprite-src.ts:47-52`:

```ts
/**
 * Sprite files are named by PokeAPI numeric id. Testing the resolved filename against
 * this shape means the only thing that can ever be interpolated into a sprite URL is a
 * run of digits, so no roster-supplied string reaches the network (T-01-27).
 */
const SPRITE_FILE_PATTERN = /^[0-9]+\.png$/;
```

→ `const MATCH_ID_PATTERN = /^(rr:\d+:\d+|br:\d+:\d+)$/;` checked in `buildLogEntry`, because
an unparseable id must fail the arm rather than fold to a match nothing addresses.

**`buildConfig` field pattern** (`src/core/import-guard.ts:646-681`) — absent-versus-malformed,
one `let` per field seeded from the defaults table, `isOneOf` for a union:

```ts
  let swapRounds: number = V2_CONFIG_DEFAULTS.swapRounds;
  if (raw['swapRounds'] !== undefined) {
    const value_ = raw['swapRounds'];
    if (!isNonNegativeInteger(value_) || value_ > MAX_SWAP_ROUNDS) return null;
    swapRounds = value_;
  }
```

and for the three new string unions, `depth`'s arm (`import-guard.ts:616-620`):

```ts
  let depth: TournamentDepth = V1_CONFIG_DEFAULTS.depth;
  if (raw['depth'] !== undefined) {
    if (!isOneOf(raw['depth'], DEPTHS)) return null;
    depth = raw['depth'];
  }
```

**`buildLogEntry` arm pattern** (`src/core/import-guard.ts:717-760`) — rebuild field by field,
`...envelope` last, `null` on any failure. The header at `:704-716` states why an unknown type
keeps its envelope and loses its payload, and is the doc block a reviewer will check the five
new arms against.

**Untrusted-input posture for `parseSnapshotStrict`** — `POISON_KEYS`
(`src/core/import-guard.ts:206`) and `buildPlayers` (`:347-370`) are the two things
`roster-source.parseSnapshotStrict` must reuse in spirit; `buildPlayers` is the exact
allow-list-rebuild shape:

```ts
function buildPlayers(value: unknown): PlayerConfig[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (value.length > MAX_PLAYERS) return null;
  ...
    // Two named fields, written out. A player carrying a third field loses it here, which
    // is the intended outcome rather than a limitation.
    players.push({ id, name });
  ...
  // Ids are the key everything else in the document references. Duplicates would make
  // `selectTeams` and `selectCurrentTurn` disagree about who is who.
  const ids = new Set(players.map((player) => player.id));
  if (ids.size !== players.length) return null;
  return players;
}
```

> **Note for the planner:** `buildPlayers` bounds a player id only as "non-empty unique
> string". That is precisely why `matchId` must be **index-based** (`rr:{i}:{j}`) and never
> built from player ids — RESEARCH §Pitfall 1.

---

### `src/core/undo.ts` (modified — pure stack, event-driven)

**Analog:** itself, the three ban arms added in 04-07.

**Deny-list stays; allow-list grows** (`src/core/undo.ts:110`, `:161-179`):

```ts
const NEVER_UNDONE: readonly string[] = [POOL_BUILT, SCHEDULE_COMPILED, DRAFT_STARTED];
...
function isUndoable(action: Action): boolean {
  if (NEVER_UNDONE.includes(action.type)) return false;
  return (
    isPickMadeAction(action) ||
    isCardsPlayedAction(action) ||
    ...
    isBansRevealedAction(action)
  );
}
```

Add all five `tournament/*` guards. The failure to avoid is named in the doc block
(`undo.ts:154-160`): **an action in neither list is silently stepped past.**

**Pairing arm** (`src/core/undo.ts:207-246`) — `triggeringCardIndex` + `removalIndices` is the
precedent `tournament/resultsVoided` + `tournament/matchRecorded` copies, except that
`causedBySeq` makes the search exact rather than heuristic (RESEARCH cites
`triggeringCardIndex`'s stated concern at `undo.ts:200-214`):

```ts
function removalIndices(doc: TournamentDoc): number[] {
  const index = lastUndoableIndex(doc);
  if (index === -1) return [];

  const action = doc.log[index];
  if (action !== undefined && isOrderResolvedAction(action)) {
    const cardIndex = triggeringCardIndex(doc, index, action.round);
    if (cardIndex !== -1) return [cardIndex, index];
  }

  return [index];
}
```

**`UndoRemoval.kind` and the exhaustiveness contract** (`src/core/undo.ts:248-260`):

```ts
  /**
   * Which of the undoable actions is at the top of the stack.
   *
   * EVERY MEMBER NEEDS AN ARM IN `undoAnnouncement` (`store.ts`), and since 04-07 the
   * compiler says so: that function's `default` assigns this field to a `const
   * exhaustive: never`, so widening this union without widening the announcement is a
   * type error rather than a species name spoken into a room.
   */
  kind: 'pick' | 'card' | 'order' | 'swap' | 'pass' | 'banPlaced' | 'banSubmission' | 'banReveal';
```

Add `'match' | 'void' | 'cut' | 'tiebreak' | 'reopen'`.

**`UndoRemoval.round` for a non-pick-round action** (`src/core/undo.ts:283-296`, and the three
ban arms at `:396-455`) — pass `config.rounds` for all five new kinds, on the `'pass'`
precedent, so a caller comparing against the current round hears "no round was crossed".

---

### `src/core/feasibility.ts` (modified — rules gate, transform)

**Analog:** itself, the two `warning`-severity codes already present.

**Code union with a comment per member** (`src/core/feasibility.ts:105-146`):

```ts
/**
 * Every reason the gate can give. Closer to an API than to a log message — the config
 * screen switches on these, so adding one is a deliberate act.
 */
export type FeasibilityCode =
  ...
  /** Satisfiable but degenerate: swap rounds open on a pool the last pick emptied — D-32. */
  | 'swapRoundsOnExactPool';
```

Add `bracketNeedsFourPlayers`.

**Severity helper** (`src/core/feasibility.ts:483-490`):

```ts
function warning(code: FeasibilityCode, message: string): FeasibilityProblem {
  return { code, severity: 'warning', message };
}
```

**`FeasibilityInput` gains `depth: TournamentDepth`** on the `banMode` precedent
(`feasibility.ts:171-185`), whose doc block states exactly *what the gate reads the field for*
and what a caller passes when the question is already answered — the same discipline the depth
field needs.

**Message, verbatim from `05-UI-SPEC.md` §1** (the module header at `feasibility.ts:87-92`
records that these sentences are byte-for-byte from the copy contract and that a wart is fixed
in the contract, not here):

> `A bracket needs at least 4 players to mean much. At {p} players the round robin already decides it. Choose Draft only, or add players.`

---

### `src/adapters/library.ts` (new — storage adapter, CRUD)

**Analogs:** `src/adapters/view-prefs.ts` (own key, own module, everything fails soft) **and**
`src/adapters/persistence.ts` (the record wrapper, `isValidTournament` + `migrate`).

> **Conflict to resolve, flagged rather than silently absorbed.** `05-UI-SPEC.md` §Pure-core
> boundary item 4 says "The library's storage — `src/adapters/persistence.ts`".
> `05-RESEARCH.md` (dated a day later) §The Library recommends a **new** `src/adapters/library.ts`
> with a **separate key**, and gives four reasons: no migration at all, `generation` untouched,
> two version surfaces stay separable, and `tab-lock.ts` uses `BroadcastChannel` rather than the
> `storage` event so a new key has no cross-tab side effects. **Follow RESEARCH.** The UI-SPEC
> item is a layer statement (`src/adapters/`), not a filename ruling.

**Own-key module header and key constant** (`src/adapters/view-prefs.ts:1-27`):

```ts
/** One key, one set of view preferences. Namespaced like `champions-drafter:tournament`. */
const VIEW_KEY = 'champions-drafter:view';
```

→ `const LIBRARY_KEY = 'champions-drafter:library';`

**Read path — never throws, rebuilds field by field** (`src/adapters/view-prefs.ts:59-100`):

```ts
export function loadViewPrefs(): ViewPrefs {
  let raw: string | null;
  try { raw = localStorage.getItem(VIEW_KEY); } catch { return defaults(); }
  if (raw === null) return defaults();

  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return defaults(); }
  if (!isPlainRecord(parsed)) return defaults();
  ...
  // Rebuilt field by field rather than returned as parsed, so an object carrying extra
  // keys — or `__proto__` as an own property — cannot travel any further than this line.
  return { density: density as Density, pane: pane as PaneState };
}
```

Library's read differs in one way RESEARCH makes load-bearing: **a bad entry is dropped, not
fatal** — one unreadable entry must not take the other eleven with it.

**Per-entry validation — the exact pair `persistence.load` uses**
(`src/adapters/persistence.ts:272-300`):

```ts
  const stored = parsed['doc'];
  if (!isValidTournament(stored)) return null;
  ...
  const migrated = migrate(stored);
  if (!migrated.ok) return null;
  return migrated.doc;
```

**Write path — silent-on-failure and deliberately NOT `savingBlocked`**
(`src/adapters/view-prefs.ts:102-121`):

```
 * It deliberately does NOT raise the persistence module's saving-blocked signal, and
 * that is the point of this note rather than an omission. That signal means "this
 * browser will not save your draft", it fires a banner, and it is the one warning in the
 * app a host genuinely must read.
```

RESEARCH's variant: a library quota failure is a different event with a different next action
— name the file and offer the download.

**`LIBRARY_CAP = 12`** is a constant with a doc block citing all three defences from
`05-UI-SPEC.md` §The Library Cap (storage math, regulation rotation, landing-screen height),
because the eviction copy interpolates it. Model the doc block on `MAX_BANS_PER_PLAYER`
(`import-guard.ts:144-164`).

**Ordering rule to write into the module header (RESEARCH):** write the library **first**, then
touch the live slot; and the cap check **precedes** the write.

**Test file:** `tests/adapters/library.test.ts`.

---

### `src/adapters/roster-source.ts` (modified — network + parse adapter, request-response)

**Analog:** itself.

**The invariant doc block that either holds or changes deliberately**
(`src/adapters/roster-source.ts:1-13`):

```
 * Everything it reads is a same-origin static asset that ships in this repository —
 * no third-party origin is contacted at runtime (T-01-25). Every URL is built from a
 * fixed template prefixed with `import.meta.env.BASE_URL`; a path that merely starts
 * with `/` would resolve to the domain root and 404 on the deployed project sub-path
 * while working perfectly on localhost.
 */
```

RESEARCH and `05-UI-SPEC.md` §2 both land on **same-origin**, so this block **stays** and gains
a paragraph about `?refresh=1`.

**Fetch pattern** (`src/adapters/roster-source.ts:94-102`) — `refreshRoster` adds
`{ cache: 'reload' }` and the `?refresh=1` marker to this same shape:

```ts
async function fetchJson(path: string): Promise<unknown> {
  const url = `${import.meta.env.BASE_URL}${path}`;
  // Same-origin static assets. `credentials: 'omit'` states that plainly rather than
  // relying on the same-origin default staying the default.
  const response = await fetch(url, { credentials: 'omit' });
  if (!response.ok) {
    throw new Error(`${url} responded ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as unknown;
}
```

**`parseIndex` widens** (`src/adapters/roster-source.ts:105-127`) — it currently drops
`validFrom`, `validUntil`, `checksum` and `counts`, all of which are present in
`public/data/roster.index.json`. REFR-03 needs `validUntil`; the already-current check needs
`checksum`. Keep `SNAPSHOT_FILE_PATTERN` (`:72`) gating on `json`.

**`parseSnapshot`'s stated exemption does not extend to a host file**
(`src/adapters/roster-source.ts:129-139`):

```ts
  // The entry shape itself is generated by a tested pure transform and pinned by
  // tests/core/roster/fixtures.test.ts, so re-validating all 235 rows at runtime on
  // every page load would cost more than it proves.
  return value as unknown as RosterSnapshot;
```

Add `parseSnapshotStrict` beside it for both refresh paths, with the reason for the split in
its own doc block.

**`loadRoster` grows an optional argument and a registry**
(`src/adapters/roster-source.ts:153-180`) — `loadRoster(regulationId?)`,
`refreshRoster()`, `readRosterFile(file)`, `resolveSnapshot(rosterVersion)`, backed by an
in-memory `Map<string, RosterBundle>`. The unresolvable-`rosterVersion` case reuses
`app.tsx`'s existing `rosterDriftNotice` / `missingFromRoster` surface rather than inventing a
second sentence.

**`readRosterFile` reuses** `src/adapters/file-io.ts:130-155` (`readJsonFile`) — the size gate
before the read, and the `file.size`-is-authoritative comment.

---

### `src/adapters/clock.ts` (modified — ambient read)

**Analog:** itself. `todayIso()` becomes the second export in the file allowed to read the wall
clock, and the header at `clock.ts:1-9` states why that list is short.

```ts
/** Epoch milliseconds. Always an integer, so it survives JSON unchanged. */
export function now(): number {
  return Date.now();
}
```

The **local**-not-UTC formatting already exists in the tree — copy it from
`src/adapters/file-io.ts:70-82` (`isoDate`), including its stated reason:

```ts
  // Local rather than `toISOString`, which is UTC: a host drafting at 6pm in UTC-8 would
  // otherwise find tomorrow's date on tonight's file, and the date on the file is there
  // to help them find it again.
```

---

### `src/ui/screens/TournamentScreen.tsx` + `.css` (new — screen shell, request-response)

**Analogs:** `src/ui/screens/BanStageScreen.tsx` (branches on a stage selector) and
`src/ui/screens/CompletedDraft.tsx` (the narrow-replacement posture D-18 inherits).

**The posture to copy verbatim** (`src/ui/screens/CompletedDraft.tsx:7-21`):

```
 * It replaces the pool grid and nothing else. The top bar and the draft board stay
 * exactly where they were, which is a requirement rather than an oversight: a host who
 * realises on this screen that the last pick was wrong must still be able to unwind it,
 * and `Undo last move` lives in the top bar. A completed-draft screen that swapped out
 * the whole draft region would make the final pick the one pick in the tournament that
 * could not be taken back.
```

D-18 and the recap (§11) both inherit this: the bracket stays, the recap replaces the main
region only, the top bar never goes.

**Branch, compute nothing.** `05-UI-SPEC.md` §Component inventory says so and
`FeasibilityBar.tsx:6-16` is the shipped statement of the same rule:

```
 * ## It renders a result and computes nothing
 *
 * `problems` arrives already sorted by the declared precedence order ... `src/core/feasibility.ts`
 * is the single authority; a component that re-derived any part of that answer would be a
 * second one, and two authorities on the same question is how a host ends up arguing with
 * an input box.
```

**Shell class:** `.draft-shell`, chosen by the arithmetic in `05-UI-SPEC.md` §Layout Budget.
The four-way shell expression lives in `src/app.tsx:2149-2157` and gains an arm there, not here.

---

### `src/ui/components/ResultsGrid.tsx` + `.css` (new — grid component, request-response)

**Analog:** `src/ui/components/BanBoard.tsx:164-240` (the second board, built by reusing the
first), with `src/ui/components/BoardGrid.css` supplying the tokens.

**Inline column template — the one thing set in the component**
(`src/ui/components/BanBoard.tsx:171-183`):

```tsx
    /*
      The column template is the ONE thing set inline, and for the reason the draft board
      sets its own inline: CSS `repeat()` takes an integer at parse time and cannot read a
      custom property for its count ... The label column's width stays a token —
      `--board-label-w`, declared once in `BoardGrid.css` — so no raw length moves into this
      component and the two boards beside each other cannot drift apart.
    */
    <div
      class="ban-board__grid"
      style={{
        gridTemplateColumns: `var(--board-label-w) repeat(${passes}, minmax(0, 1fr))`,
      }}
    >
      {/* Sits above the label column, opposite the pass headers. Deliberately empty. */}
      <div class="board__corner" />
```

`ResultsGrid` uses `var(--board-label-w) repeat(${players.length}, minmax(var(--results-col-min), 1fr))`.

**Reuse the shipped cell classes rather than restating them**
(`src/ui/components/BanBoard.tsx:206-220`):

```
              The cell classes are the DRAFT BOARD's, reused rather than restated. The dashed
              hairline on an empty cell and the accent border plus soft tint on the next one
              are shipped mechanisms with their justifications written beside them, and a
              second copy here would be a second thing that can disagree about what an empty
              slot looks like.
```

The unplayed-cell treatment is already in `BoardGrid.css:174-181`:

```css
.board__cell--empty {
  border: var(--hairline-w) dashed var(--color-border-strong);
  background: transparent;
}
```

**Scroll wrapper and label column** (`BoardGrid.css:70-72`, `:40-42`, `:136-166`):

```css
:root { --board-label-w: 176px; }
.board__scroll { overflow-x: auto; }
```

`--results-col-min: 188px` is declared in `ResultsGrid.css` with its derivation comment, on
`--board-label-w`'s precedent (`BoardGrid.css:1-38` — "one declaration, in the file that owns
the reasoning").

**Truncation rule differs deliberately.** `BoardGrid.css:161-166` ellipsises the row label;
`05-UI-SPEC.md` §Layout Budget requires the results-grid **column header to wrap**
(`overflow-wrap: anywhere`), not ellipsise. Note the divergence in the stylesheet comment.

**Roving tabindex, 1-D mode:** `src/ui/use-roving-tabindex.ts:111-113` — `columns` defaults to
`ONE_COLUMN`, so **omit it**; the live cell set is triangular and a fixed stride is wrong on
every row.

**Accessible name carries both axes** — `BanBoard.tsx:158` shows the shipped idiom
(`<span class="visually-hidden">{blindRowSentence(...)}</span>`); `05-UI-SPEC.md` §4 gives the
three sentences verbatim.

---

### `src/ui/components/MatchRecordDialog.tsx` + `.css` (new — modal form, request-response)

**Analog:** `src/ui/components/ConfirmDialog.tsx` for how to build on `Dialog`; **not**
`ConfirmDialog` itself, because this has inputs (`05-UI-SPEC.md` §Component inventory).

**Build on `Dialog`, add nothing it already does** (`src/ui/components/ConfirmDialog.tsx:5-13`):

```
 * A thin generalisation of Phase 1's `ImportConfirmDialog`, which is now built on it. It
 * adds no focus management, no escape handling and no markup of its own beyond two
 * buttons and a paragraph: `Dialog` already implements the focus trap, the initial focus
 * and the restore, and a second dialog primitive would be a second set of those
 * behaviours to keep in step.
```

`Dialog`'s three focus guarantees are documented at `src/ui/components/Dialog.tsx:14-26`
(moved in / trapped / restored) — the restore is what makes `05-UI-SPEC.md`'s "focus after
recording a match" free, and an override would be a second focus authority.

**Button order and Escape** (`src/ui/components/ConfirmDialog.tsx:15-21`):

```
 * The confirming button is FIRST in DOM order and the safe button is SECOND, so the safe
 * one is the last thing focus reaches and the last thing read. And Escape maps to the
 * safe callback, not to the confirming one ...
```

Safe label here is `Keep the recorded result`.

**Fields:** `SegmentedControl` (`src/ui/components/SegmentedControl.tsx:66-100`) for winner and
games; `NumericField` (`src/ui/components/NumericField.tsx:61-105`) for the metric, bounded
`0 … MAX_MATCH_METRIC` read from `import-guard.ts`. `NumericField`'s own doc block
(`:20-30`) records that `min`/`max` are affordances, not enforcement — so `canApply` is the
authority, exactly as `checkFeasibility` is for the config fields.

**Inert primary with a stated reason** — `FeasibilityBar.tsx:18-25`:

```
 * A natively disabled button is not focusable, so a keyboard user could never reach the
 * explanation — and the explanation is the entire point of RULE-07. So `Start draft` takes
 * `aria-disabled` alone, stays in the tab order, and its click handler returns early.
```

Applied here to the identical-result state (`This is already the recorded result.`), which is
also what makes the live-region announcement safe from `LiveRegion`'s byte-identical limit
(`src/ui/components/LiveRegion.tsx:16-25`).

**Surface-local `role="status"`** for the cascade sentence — `FeasibilityBar.tsx:27-32`
sanctions exactly this second form and forbids routing it through `announce` as well.

---

### `src/ui/components/StandingsTable.tsx` + `.css` (new — table, transform)

**Analog:** `src/ui/components/PlayerList.tsx` (rows without list semantics where the ordinal
is not the information) and `BoardGrid.css:136-166` for the `--board-label-w` name column.

**The list-semantics decision is explicit in the tree** and must be made deliberately here —
`src/ui/components/SchedulePreview.tsx:17-23`:

```
 * `PlayerList` deliberately does NOT wrap its name rows in a list element, because each
 * row is already announced by its own label and "list, 4 items" would add nothing. Its
 * numbered starting order below them IS an `<ol>`, because there the ordinal is the
 * information.
```

Standings position **is** the information, so the `<ol>` arm applies.

**No UI-side rule:** `decidedBy` comes from `selectStandings`, never from the component
(`05-UI-SPEC.md` §Pure-core boundary; `FeasibilityBar.tsx:6-16` is the shipped precedent).

**No roving tabindex** — `SchedulePreview.tsx:31-37` states the rule for a small row set and
names it as a decision rather than an omission.

---

### `src/ui/components/TiebreakOrderer.tsx` + `.css` (new — reorder control, event-driven)

**Analog:** `src/ui/components/SchedulePreview.tsx:166-283`. This is the closest match in the
phase — `05-UI-SPEC.md` §7 says "reused down to the focus rule".

**Ref map + pending-focus handoff** (`src/ui/components/SchedulePreview.tsx:167-189`):

```tsx
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef<string | null>(null);

  /**
   * Focus follows the moved round, not the pressed button.
   *
   * Leaving focus where it was makes a second press REVERSE the first ... The handoff runs
   * in a layout effect rather than in the click handler because the destination button only
   * holds the moved kind after the parent has re-rendered with the new array.
   */
  useLayoutEffect(() => {
    const key = pendingFocus.current;
    if (key === null) return;
    pendingFocus.current = null;
    buttons.current.get(key)?.focus();
  });
```

**One vnode shape, `aria-disabled` shed, early return keeps ARIA honest**
(`src/ui/components/SchedulePreview.tsx:224-254`):

```tsx
                      // ONE vnode shape across the availability boundary. A bare button in
                      // one branch and a Fragment in the other unmounts the node and drops
                      // focus to `<body>` — the regression 02-11 fixed on `SplitPanes`.
                      class={availability.movable ? MOVE_CLASS : `${MOVE_CLASS} ${MOVE_CLASS}--inert`}
                      // `undefined`, never `'false'`: the attribute is SHED the moment the
                      // move becomes possible (WR-04). `aria-disabled` and never native
                      // `disabled`, because a natively disabled button is not focusable and
                      // its reason would be unreachable by keyboard.
                      aria-disabled={availability.movable ? undefined : 'true'}
                      aria-label={moveName(direction, availability, spec.index + step)}
                      ...
                      onClick={() => {
                        // The early return is what keeps the attribute honest. Without it
                        // the ARIA would claim the control is inert while a click still
                        // changed the schedule.
                        if (!availability.movable) return;
                        pendingFocus.current = `${direction}:${position + step}`;
                        onMove(position, direction);
                      }}
```

**Owns no state; reports an intent** (`SchedulePreview.tsx:10-15`) — the ordering is component
state until `Confirm this order` dispatches one `tournament/tiebreakOrdered`.

**Test file:** model on `tests/ui/schedule-reorder.test.tsx` (the three things it says are worth
a test — accessible-name destinations, `aria-disabled` absent not `'false'`, the focus handoff —
all apply verbatim).

---

### `src/ui/components/CutControl.tsx` + `.css` (new — bounded numeric + gate, request-response)

**Analogs:** `src/ui/components/NumericField.tsx` and `src/ui/components/FeasibilityBar.tsx`.

**The caller holds the raw string** (`src/ui/components/NumericField.tsx:32-36`, `:61-70`):

```
 * `value` is the text, not a number, and the caller holds both it and the parsed result.
 * A component that held the number would have to invent something to display while the
 * host is mid-edit — and "what is showing" and "what the gate is judging" would be two
 * facts that can disagree.
```

**`parseNumericField` returns `number | null`** (`NumericField.tsx:50-58`) — the `NaN` argument
in its doc block is why the cut's gate must take `number | null` too.

**Inert-with-a-reason + `aria-describedby`** — `FeasibilityBar.tsx:42-48` shows the
module-constant id pattern for a single-instance reason region:

```ts
/**
 * The reason element's id, and the id the Start button names as its description.
 *
 * A module constant rather than a generated id because there is exactly one feasibility
 * bar per screen — it is pinned, and a second one would be two answers to one question.
 */
const REASON_ID = 'feasibility-reason';
```

Reason copy: `{k} matches are still to play. Record them all before you cut.`

---

### `src/ui/components/BracketGrid.tsx` + `.css` and `MatchCard.tsx` + `.css` (new)

**Analog:** `src/ui/components/BoardGrid.tsx:159-215` for the grid, `MonChip` / `CardFace` for
a small self-contained cell component with its own stylesheet.

**Grid declared in CSS, count-dependent template inline** — same split as `BoardGrid`
(`BoardGrid.css:73-77`, `BoardGrid.tsx:196-202`). `05-UI-SPEC.md` §9 gives the two rules:

```css
.bracket        { display: grid; grid-auto-flow: column; gap: var(--space-6); }
.bracket__round { display: grid; align-content: space-around; gap: var(--space-4); }
```

**Connectors are CSS borders, never SVG** — `check:nohtml` forbids the injected-markup route
anyway, and `05-UI-SPEC.md` §Design System gives the "second authority on card position"
argument. The precedent for a purely decorative, token-driven marker that carries no
information on its own is `BoardGrid.css:120-134` (`.board__round-mark--mega`):

```css
/*
 * Only a Mega round paints. ... The fill is decorative. The WORD carries the signal, which
 * is what keeps this row of "colour is never the only signal" satisfied
 */
```

**Reserved-chrome rule** (`BoardGrid.css:99-113`, `.board__round-mark`) — a bye card and a
recorded card must be the same height as an unresolved one, for the reason stated there: a
header that grew a line would move every row under it.

**Champion state**: `--text-display` name + `Champion` at `--text-label` + `--border-w solid
var(--color-text)` — the shipped selected/pending treatment, no hue.

---

### `src/ui/components/FinishedNotice.tsx` + `.css` and `StalenessBanner.tsx` + `.css` (new)

**Analog:** `src/ui/components/ReadOnlyBanner.tsx` + `.css` — same shape, deliberately **not**
the same component.

`05-UI-SPEC.md` §Component inventory: "`ReadOnlyBanner` means *another tab owns this document*;
making one banner mean three different things is how a sentence stops being trusted."

**Copy as module constants** (`src/ui/components/ReadOnlyBanner.tsx:42-51`):

```ts
/**
 * Verbatim from the approved UI-SPEC copywriting table.
 *
 * Held as constants rather than inline JSX prose because JSX collapses whitespace
 * between text lines, and these are contracts down to the full stop.
 */
export const READ_ONLY_SENTENCE = 'Another tab is drafting this tournament. This tab is read-only.';
export const STALE_SENTENCE = 'The tab that was drafting has stopped responding.';
export const TAKEOVER_LABEL = 'Take over drafting here';
```

**Sentence + one action, `role="status"`** (`ReadOnlyBanner.tsx:73-87`):

```tsx
    <div class="read-only-banner">
      <p class="read-only-banner__text" role="status">{sentence}</p>
      <button type="button" class="read-only-banner__action" onClick={requestTakeover}>
        {TAKEOVER_LABEL}
      </button>
    </div>
```

**Not danger-toned, and the stylesheet says why** (`ReadOnlyBanner.css:24-32`, and
`ReadOnlyBanner.tsx:39-41`):

```
 * Read-only is emphatically not a *danger* state — nothing is wrong, another tab simply
 * got there first — so `--color-danger` is reserved for the two surfaces that own it.
```

`FinishedNotice` takes `--color-surface-raised` for exactly this reason (D-17, §10).
`StalenessBanner` likewise (D-25 — warns, never blocks).

**Stylesheet header shape** (`ReadOnlyBanner.css:1-10`) — states what the file must NOT become
("It is NOT sticky and must not become sticky") and asserts "Declares no raw colour and no raw
length."

---

### `src/ui/components/RecapList.tsx` + `.css` (new — list renderer, transform)

**Analogs:** `src/ui/components/BanChipList.tsx` (a list of `MonChip` rows) and
`src/ui/components/BanReveal.tsx` (sections with collisions called out).

**Renders a pure fold; decides nothing.** `buildRecap` returns typed entries; this component
maps them to lines. The `MonChip` at `--sprite-sm` is the only sprite on any new surface
(`05-UI-SPEC.md` §Size tokens).

**Never a strike-through for a correction** (`05-UI-SPEC.md` §11): strike-through in this
project means *gone or unavailable* (the snake ban-list treatment); a corrected result is
neither.

---

### `src/ui/components/TournamentLibrary.tsx` + `.css` (new — list + row actions, CRUD)

**Analog:** `src/ui/screens/LandingScreen.tsx:136-149` — the `saved` block, including the
no-empty-state rule.

**Zero entries renders nothing** (`src/ui/screens/LandingScreen.tsx:136-140`):

```tsx
            {/*
              Rendered only when a save exists. There is deliberately no "no saved drafts"
              empty state: a first visit shows two buttons and the subtitle, and saying
              "nothing here" would be noise on the screen with the least to say.
            */}
            {saved !== null && (
```

`05-UI-SPEC.md` §12 applies the same rule and the same reason to the library section.

**Row description composer with plural helpers** (`src/ui/screens/LandingScreen.tsx:47-73`):

```ts
export function savedDraftDescription(doc: TournamentDoc): string {
  const playerCount = doc.config.players.length;
  const total = playerCount * doc.config.rounds;
  const picks = selectPickCount(fold(doc));

  const playerNoun = playerCount === 1 ? 'player' : 'players';
  const pickNoun = total === 1 ? 'pick' : 'picks';

  return `${doc.config.formatLabel} — ${playerCount} ${playerNoun}, ${picks} of ${total} ${pickNoun}`;
}
```

`libraryRowDescription` copies this exactly, including "the pick count is taken from a fold
rather than from the log's length". `05-UI-SPEC.md` §12 adds `{date}` from `createdAt` and
notes it does not contradict this function's no-relative-time rule.

**`Download JSON` per row** — `src/adapters/file-io.ts:85-88` (`tournamentFilename`) and
`:99-120` (`downloadJson`) already exist and are reused unchanged.

---

### `src/ui/components/RosterRefresh.tsx` + `.css` (new — fetch + file picker, request-response)

**Analog:** `src/ui/screens/LandingScreen.tsx:100-166` for the hidden-input pattern (and
`TopBar.tsx` for the same pattern a second time).

**Hidden file input, cleared before the file is handed on**
(`src/ui/screens/LandingScreen.tsx:105-117`):

```tsx
      // Cleared BEFORE the file is handed on, exactly as `TopBar` does and for the same
      // reason: a file input does not fire `change` when the same path is chosen twice
      // running, so a host who fixes a bad file and re-picks it would otherwise get
      // silence — and silence after an error message reads as the app having stopped.
      input.value = '';

      if (file === undefined) return;
      onImportFile(file);
```

and the `hidden` attribute's justification (`LandingScreen.tsx:151-158`):

```
              Hidden rather than visually-hidden, for the reason `TopBar` records: a file
              input styled off-screen stays in the tab order, so a keyboard user would meet
              an unlabelled second control doing the same thing as the button beside it.
```

**Result region** — a surface-owned `role="status"` holding one sentence, replaced on each
attempt. `FeasibilityBar.tsx:27-32` sanctions the surface-local region and forbids duplicating
it through `announce`.

**Five states, each with a sentence** (`05-UI-SPEC.md` §2): idle (none), checking, already
current, updated, failed. The failure sentence names the offline path because REFR-02 exists
for that host.

---

### `src/ui/screens/ConfigScreen.tsx` + `.css` (modified — form screen)

**Analog:** itself.

**The strings that become false** (`src/ui/screens/ConfigScreen.tsx:120-139`) — Amendment 2
replaces `DEPTH_NOTE` with a per-option note, and the doc block above `DEPTH_OPTIONS` must be
corrected in the same change (`05-UI-SPEC.md` §Amendments: "a stale contract comment is worse
than no comment"):

```ts
const DEPTH_OPTIONS: readonly SegmentedOption<TournamentDepth>[] = [
  { value: 'draftOnly', label: 'Draft only' },
  { value: 'draftAndBrackets', label: 'Draft and brackets' },
  { value: 'draftBracketsAndLog', label: 'Draft, brackets and match log' },
];

const DEPTH_NOTE =
  'Depth is recorded now. Round robin and brackets arrive with the tournament screens.';
```

**Render site** (`src/ui/screens/ConfigScreen.tsx:1369-1378`) — the three new controls join this
fieldset:

```tsx
        <SegmentedControl
          legend="Tournament depth"
          name="tournament-depth"
          options={DEPTH_OPTIONS}
          value={depth}
          onChange={setDepth}
        />

        <p class="config-screen__note">{DEPTH_NOTE}</p>
      </fieldset>
```

**Whole-control-inert vs disabled-member.** `05-UI-SPEC.md` §1 is explicit that `Match result`
takes `Start draft`'s pattern (`FeasibilityBar.tsx:18-25`, `aria-disabled` without native
`disabled`), **not** `SegmentedControl`'s per-option `disabled`
(`SegmentedControl.tsx:73-79`) — because here every member is unavailable, not one of them.

**Field + its visible consequence, adjacent** (`ConfigScreen.tsx:1391-1399`) — the `Roster`
group (heading, current line, `Check for a new roster`, `Import roster JSON…`, result region)
follows the same "directly beneath the field" placement rule.

---

### `src/ui/confirm-copy.ts` (modified — copy table)

**Analog:** itself.

**Plural helpers** (`src/ui/confirm-copy.ts:20-46`) — this phase adds `matches` and
`tournaments` here and nowhere else:

```ts
function picks(count: number): string { return count === 1 ? '1 pick' : `${count} picks`; }
function players(count: number): string { ... }
function bans(count: number): string { ... }
```

with the reason at `:21-28` ("a visible grammar error in a dialog that destroys work reads as a
tool that was not finished").

**Set shape** (`src/ui/confirm-copy.ts:48-64`) — the new filing, at-cap eviction and reopen sets
each take this literal shape, and `ABANDON_CONFIRM` keeps its heading, tone and both labels
while **only its body changes** (Amendment 1):

```ts
export const ABANDON_CONFIRM = {
  heading: 'Abandon this draft?',
  tone: 'danger' as const,
  confirmLabel: 'Abandon draft',
  safeLabel: 'Keep drafting',
  body: (pickCount: number, playerCount: number): string =>
    `This discards ${picks(pickCount)} across ${players(playerCount)}. Nothing recovers it unless you have already downloaded the tournament JSON.`,
};
```

New body, verbatim from `05-UI-SPEC.md` §Copywriting:
`This discards {n} picks across {m} players and does not file it with your tournaments. Nothing recovers it unless you have already downloaded the tournament JSON.`

---

### `src/app.tsx` (modified — router / shell)

**Analog:** itself.

**`Screen` union and its doc block** (`src/app.tsx:127-154`) — the fourth member's
justification is the template for the fifth:

```ts
 *   `landing`  the front door — resume, import, or a new tournament
 *   `config`   the form, which writes a document exactly once
 *   `bans`     the blind or snake ban stage, BEFORE the draft (D-11)
 *   `draft`    the pool, the board and the rest of the tournament
 */
type Screen =
  | { name: 'landing' }
  | { name: 'config' }
  | { name: 'bans' }
  | { name: 'draft' };
```

**`screenForState` — the one place routing is decided** (`src/app.tsx:156-172`). Every route
that lands a document on a screen must ask it, and the tournament stage joins the branch:

```ts
function screenForState(state: DraftState | null): Screen {
  if (state === null) return { name: 'draft' };
  return selectBanStageState(state) === 'notRunning' ? { name: 'draft' } : { name: 'bans' };
}
```

Its doc block (`:158-165`) names the failure a forgotten call site produces — copy that
discipline for the tournament arm.

**Inside the `inert` gate, never beside it** (`src/app.tsx:2064-2160`). The block at
`:2088-2105` states what may sit outside (`LiveRegion`, `ReadOnlyBanner`, the dialogs) and the
block at `:2141-2148` states why a new screen goes inside:

```
          ALL FOUR ARMS ARE THE SAME ELEMENT, which is the point. This is the element that
          carries `inert`, and the entry surface has to be under it: a read-only tab handed a
          live ban screen is a rival-tournament hole (T-04-20) and a secrecy one. Moving the
          entry surface out to a sibling would look identical on screen and reopen both.
```

`05-UI-SPEC.md` §Interaction makes this free for the whole phase: "No new ownership machinery."

**Re-read the doc after a dispatch** (`app.tsx:514` — "Re-read: the play is in the log now") is
the precedent RESEARCH cites for reading `causedBySeq` back off `getDoc()` between the
`matchRecorded` and `resultsVoided` dispatches.

**Snapshot registry wiring:** the unresolvable-`rosterVersion` sentence reuses
`rosterDriftNotice` / `missingFromRoster` (`app.tsx:2330-2338`).

---

### `src/store.ts` (modified — write path)

**Analog:** itself.

**`undoAnnouncement` gains five arms; the compiler enforces it**
(`src/store.ts:682-750`):

```ts
    default: {
      // A new kind with no arm is a COMPILE ERROR rather than a species name spoken into a
      // room. This assignment is the whole reason the chain of `if`s became a switch.
      const exhaustive: never = removed.kind;
      return exhaustive;
    }
```

**`dispatch` is untouched** (`src/store.ts:121-147`) — the five new intents flow through it as
they stand; `nextSeq` (`:113-119`) already allocates `max(seq) + 1`.

---

### `public/sw.js` (modified — service worker) and `tests/build/sw-behaviour.test.ts`

**Analog:** itself.

**The two existing early returns** (`public/sw.js:56-62`) — the new one goes beside them:

```js
  // Non-GET and cross-origin never touch the cache. Returning without calling
  // respondWith leaves the browser's own handling completely untouched.
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;
```

→ `if (new URL(request.url).searchParams.has('refresh')) return;`

**What must not be reintroduced** (`public/sw.js:16-21`):

```
 * D-15  Versioned cache, activate on next load. The two lifecycle overrides that
 *       force a waiting worker active and seize already-open clients are
 *       deliberately absent ... `npm run build`'s verify greps this file for both of
 *       them; do not reintroduce either.
```

**The test needs no harness change** — `FakeRequest` is `{ url, method }`
(`tests/build/sw-behaviour.test.ts:22-25`) and `FakeCache.match` already reproduces the
`ignoreSearch` strip (`:38-45`), so a `?refresh=1` URL exercises the branch:

```ts
  match(request: FakeRequest, options?: { ignoreSearch?: boolean }): Promise<string | undefined> {
    const url =
      options?.ignoreSearch === true ? (request.url.split('?')[0] ?? request.url) : request.url;
    return Promise.resolve(this.entries.get(url));
  }
```

---

## Shared Patterns

### 1. Doc-block-first authoring

**Source:** every file in `src/core/` and `src/adapters/`.
**Apply to:** all 17 new source files.

Every module in this repository opens with a header that states what it is, what it deliberately
does **not** contain, and which constraint forces each choice. `src/core/undo.ts:26-38` is the
sharpest example — a list of machinery the file does not have, with a reason each:

```
 *   No inverse patches.   Re-folding a few hundred actions is sub-millisecond, so the
 *                         cost of depth is zero and unlimited undo is free (D-10).
 *   No snapshot stack.    A snapshot would be a second copy of the truth, and the two
 *                         could disagree.
 *   No redo.              Popped actions would have to live outside the log ...
```

A Phase 5 file without this header is not finished. The doc block is where D-09's "later beats
earlier", D-10's "why an explicit clear", D-16's cap defence and REFR-01's transport choice are
recorded.

### 2. Stale contract comments are corrected in the change that breaks them

**Source:** `src/ui/confirm-copy.ts:15-18`, `src/ui/components/BoardGrid.css:24-38`.
**Apply to:** `ConfigScreen.tsx:120-139` (`DEPTH_NOTE`), `persistence.ts:39` and `:75`'s
"one key, one tournament" wording, `roster-source.ts:1-13`, `model.ts:108-116` (`depth` is
"read by nothing"), `model.ts:277-280` (`duplicateBanPolicy` comparison to `depth`).

```
 * The seventh arrived with 02-07's `Bans` group; the note recording it as absent was deleted
 * in the same change that made it false, because a stale contract comment is worse than none
 * — the next reader trusts it.
```

### 3. `aria-disabled` without native `disabled`, and always shed

**Source:** `src/ui/components/FeasibilityBar.tsx:18-25`,
`src/ui/components/SchedulePreview.tsx:232-238`.
**Apply to:** the metric control below tier 3, both format controls at `draftOnly`, the cut
control before the round robin completes, unknown-participant match cards, every cell of a
finished tournament, the reorder end buttons, the record dialog's identical-result state
(seven consumers — `05-UI-SPEC.md` §Interaction).

```tsx
  aria-disabled={availability.movable ? undefined : 'true'}
```

`undefined`, never `'false'` (WR-04). And the click handler returns early, because that is what
keeps the attribute honest.

### 4. Constraint upstream of the click, enforced twice

**Source:** `src/core/reduce.ts:592-600`.
**Apply to:** every locked-tournament control and every unplayable match cell.

```ts
      // This is the BACKSTOP, not the rule. `selectPlayableCards` is the same answer,
      // consulted by the card panel before a click is possible, and the value the panel
      // renders inert is exactly the value this refuses. Enforced twice on purpose
      // (T-03-37) — and if this ever fires for a real host, the two have disagreed.
```

### 5. Copy as module constants, verbatim from the contract

**Source:** `src/ui/components/ReadOnlyBanner.tsx:42-51`,
`src/ui/screens/LandingScreen.tsx:32-45`, `src/ui/confirm-copy.ts:1-18`.
**Apply to:** every new component and to `confirm-copy.ts`.

```
 * Held as constants rather than inline JSX prose because JSX collapses whitespace
 * between text lines, and these are contracts down to the full stop.
```

Plus the interpolation rule: every count goes through a singular/plural helper, all of them in
`confirm-copy.ts` (`:20-46`).

### 6. Stylesheet header states the tokens rule and the file's own prohibitions

**Source:** `src/ui/components/ReadOnlyBanner.css:1-10`,
`src/ui/components/BoardGrid.css:1-38`.
**Apply to:** all 13 new stylesheets.

```
 * A full-width bar above the top bar. It is NOT sticky and must not become sticky ...
 *
 * Declares no raw colour and no raw length. Every value comes from tokens.css.
```

The one sanctioned exception this phase adds is `--results-col-min: 188px`, which is declared in
`ResultsGrid.css` with its derivation, on `--board-label-w`'s precedent.

### 7. Test-file conventions

**Source:** `tests/core/undo.test.ts:1-14`, `tests/ui/schedule-reorder.test.tsx:1-22`,
`tests/adapters/view-prefs.test.ts:1-55`.
**Apply to:** all new tests.

Core (`node` env, zero mocks) — `tests/core/undo.test.ts:1-14`:

```
 * Zero mocks, by construction. `canUndo` and `undoLast` are pure functions of the
 * document they are handed; if a test in this file ever needs a fake clock or a fake id
 * generator, an ambient value has leaked into the core and `npm run check:pure` should
 * already have failed the build.
```

UI — `tests/ui/schedule-reorder.test.tsx:1` is literally the **first line**:

```ts
// @vitest-environment happy-dom
```

and any test touching `announce` resets it in `beforeEach` (CLAUDE.md §Tests; the module-level
signal is at `src/ui/components/LiveRegion.tsx:14`).

Adapters — `tests/adapters/view-prefs.test.ts:23-56` gives the storage stub and its installer,
reused verbatim by `tests/adapters/library.test.ts`:

```ts
function makeStorage(overrides: Partial<Storage> = {}): StorageStub { ... }
function install(storage: Storage): void {
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
}
```

with the stated reason (`:10-11`): "Mocks, like `tests/adapters/persistence.test.ts` and for the
same reason: a working localStorage is the case that needs no test."

### 8. New-payload-field landing sites (the silent-failure checklist)

**Source:** `src/core/actions.ts:1-41` (the header enumerates them), `STATE.md` decision 6.
**Apply to:** all five new action types.

Seven sites per type: the exported constant, the payload interface, the `Intent` union member,
the creator, the structural guard (`is…Action`), `import-guard.buildLogEntry`'s arm, and
`reduce.apply` + `reduce.canApply`. Missing `buildLogEntry` drops the field silently on round
trip; missing `undoAnnouncement` is now a compile error (`store.ts:746`).

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/core/tournament.ts` — the **seed-order recursion and bye placement** specifically | pure algorithm | transform | No bracket, seeding or byes exist anywhere in the tree. The *module* has an exact analog (`selectors.ts`) and the *file conventions* are fully covered above, but the arithmetic itself is new. Use `05-RESEARCH.md` §Seeded Single Elimination — it carries the executed `seedOrder` function, the 5/6/7 tables, the `br:r:s → br:(r+1):ceil(s/2)` advancement rule, the matches-in-round labelling table, and the `N − 1` invariant, all verified by execution. Do not re-derive them. |
| `src/core/tournament.ts` — the **group-then-refine standings partition** | pure algorithm | transform | Nothing in the tree sorts under a non-transitive relation. `05-RESEARCH.md` §Standings gives the four-link partition-refinement algorithm and §Pitfall 3 gives the reason a comparator is forbidden (`Array.prototype.sort` output is implementation-defined for an inconsistent comparator). The nearest *shape* precedent is `src/core/cards.ts`'s `resolvePickOrder`, which orders on `(value, seq)` — but it is a total order and is therefore not a safe model for this one. |

Everything else in the phase has a real precedent, cited above.

---

## Metadata

**Analog search scope:** `src/core/`, `src/core/roster/`, `src/adapters/`, `src/ui/`,
`src/ui/components/`, `src/ui/screens/`, `src/`, `public/`, `scripts/`, `tests/core/`,
`tests/core/roster/`, `tests/adapters/`, `tests/build/`, `tests/ui/`
**Files scanned:** 178 (full inventory with line counts)
**Files read for excerpts:** 33
**Pattern extraction date:** 2026-08-26

**Two upstream conflicts recorded for the planner, not resolved here:**

1. **Library module location.** `05-UI-SPEC.md` §Pure-core boundary item 4 says
   `src/adapters/persistence.ts`; `05-RESEARCH.md` §The Library (one day later) says a new
   `src/adapters/library.ts` with its own key, and gives four reasons. RESEARCH wins; the
   UI-SPEC line is a layer statement.
2. **`05-UI-SPEC.md` line 44 states "There is no `05-RESEARCH.md`."** That was true when the
   contract was written on 2026-08-25. `05-RESEARCH.md` exists, is dated 2026-08-26, and
   explicitly reconciles itself to the contract (it adopts the cap of 12, two-way head-to-head,
   the `warning`-severity depth gate, and same-origin refresh). Where the two disagree on a
   *mechanism*, RESEARCH is later and carries the probes; where they disagree on *copy,
   layout or a token*, the UI-SPEC governs.
