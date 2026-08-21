# Phase 4: Blind and Snake Bans - Pattern Map

**Mapped:** 2026-08-20
**Files analyzed:** 33 (13 modified core/store, 3 adapters, 12 UI, 8 test groups)
**Analogs found:** 30 / 33

> **How to read this.** Every excerpt below was read from source this session and carries a
> real path and line number. Where `04-RESEARCH.md` already prescribes a shape, this document
> does not repeat the prescription — it names the *shipped code the new file should look like*
> and the specific habit to copy. Where no analog exists, the file is listed under
> §No Analog Found with what to fall back to.
>
> **The one recurring failure mode in this repository is a second authority on a fact that
> already has one.** Every analog below was chosen because copying it keeps authority in one
> place. `04-RESEARCH.md` §Don't Hand-Roll says the same thing in a table.

---

## File Classification

### `src/core/` — pure

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/core/model.ts` (mod) | model | transform | `swapBudget` / `swapRounds` fields, `model.ts:193-208` + `copyConfig:421` + `initialState:445` | exact |
| `src/core/actions.ts` (mod) | model / action vocabulary | event-driven | `swap/made` + `swap/passed` family, `actions.ts:43-44, 262-272, 307, 434, 576` | exact |
| `src/core/reduce.ts` (mod) | reducer | event-driven | `apply(SWAP_MADE)` `reduce.ts:239`; `canApply(DRAFT_STARTED)` `:371`; `RejectionReason` `:65-127` | exact |
| `src/core/selectors.ts` (mod) | selector | transform | `selectCardTurn:464`, `selectCardPlayOrder:402`, `selectPhase:733`, `selectStartingOrder:810` | exact |
| `src/core/feasibility.ts` (mod) | validation gate | transform | `swapBudgetTooLarge` pair `:310` + `notEnoughMegasMessage:294` + `PRECEDENCE:179` | exact |
| `src/core/migrate.ts` (mod) | migration | transform | `V2_CONFIG_DEFAULTS:84` + `migrateV2ToV3:224` + chain `:265-268` | exact |
| `src/core/undo.ts` (mod) | core / undo | event-driven | the `swap` + `pass` widening — `UndoRemoval:219`, `isUndoable:135`, `NEVER_UNDONE:107` | exact |
| `src/core/import-guard.ts` (mod) | guard | transform | `case 'swap/made'` `:737`; `MAX_SWAP_BUDGET:141`; `buildConfig:472` | exact |
| serpentine derivation `selectBanOrder` | selector (pure fn) | transform | `selectStartingOrder:810` (shape) + `selectCardPlayOrder:402` (habits) | **role-match — algorithm is new** |

### `src/adapters/`

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/adapters/ban-shield.ts` (new) | adapter / lifecycle | event-driven | `tab-lock.ts installLifecycle:620` (handler shape) + `persistence.ts startAutosave:431` (teardown shape) | exact ×2 |

### `src/store.ts`

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `createBanStage` (new sibling) | store / write path | event-driven | `createTournament:220` + `CreateTournamentInput:154` | exact |
| `undoAnnouncement` exhaustive rewrite | store / copy composer | transform | `matchesMega` `search.ts:136` and `poolSizeForPreset` `feasibility.ts:586` | **role-match — no `never` default ships yet** |

### `src/ui/`

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/app.tsx` (mod) | composition root / route | request-response | `Screen` union `:120`, `useState` `:474`, shell gate `:1897`, `handleRequestUndo:1538` | exact |
| `src/ui/screens/ConfigScreen.tsx` (mod) | screen / form | request-response | `BAN_MODE_OPTIONS:275`, `Swaps` fieldset `:1409-1428`, `handleStart:1073` | exact |
| `src/ui/screens/BanStageScreen.tsx` + `.css` (new) | screen shell | request-response | `ConfigScreen.tsx` + `ConfigScreen.css` pair; branch shape from `app.tsx` `selectPhase` routing | exact |
| `src/ui/components/BlindLocked.tsx` + `.css` (new) | component / panel | request-response | `CardPanel.tsx` + `CardPanel.css` | exact |
| `src/ui/components/BlindEntry.tsx` + `.css` (new) | component / form surface | request-response | `ConfigScreen.tsx:1341-1397` Bans fieldset + `FeasibilityBar.css:9` sticky footer | exact |
| `src/ui/components/BanBoard.tsx` + `.css` (new) | component / grid | transform | `BoardGrid.tsx` + `BoardGrid.css:54` (`--board-label-w`) | exact |
| `src/ui/components/BanReveal.tsx` + `.css` (new) | component / summary | transform | `CompletedDraft.tsx` (per-player rows + one action) + `FeasibilityBar.tsx` (blocked control) | role-match |
| `src/ui/components/PoolGrid.tsx` (extend) | component / grid | transform | its own `roundRestriction:130` and `megaInertReason:113` props | exact |
| `src/ui/components/TypeaheadField.tsx` (extend) | component / combobox | request-response | its own `candidates` widening `:88-95`; default-applied-once from `PoolGrid:113` | exact |
| `src/ui/components/TopBar.tsx` (extend) | component / chrome | transform | its own bans disclosure `:209-217` + `bannedNames` prop `:61-64` | exact |
| `src/ui/components/TurnBanner.tsx` (extend) | component / status | transform | the `swapLine` branch `:212-226` | exact |
| `src/ui/confirm-copy.ts` (extend) | config / copy table | transform | `ABANDON_CONFIRM:58` + the `bans()` plural helper `:46` | exact |
| `src/ui/components/SegmentedControl.tsx` | component | — | **unchanged.** New instance only — `SegmentedOption:30`, disabled handling `:74-92` | exact |

### `tests/`

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `tests/core/selectors.test.ts` (ext) | test — pure selector | node, zero mocks | itself, header `:1-11` + fixture builders `:56+` | exact |
| `tests/core/reduce.test.ts` (ext) | test — reducer | node | itself | exact |
| `tests/core/migrate.test.ts` (ext) | test — migration | node | `SUPPORTED_SCHEMA_VERSIONS` block `:160-175`, v2 arm `:380-400`, `docAtVersion:21` | exact |
| `tests/adapters/persistence.test.ts` (ext) | test — resume path | node + fake storage | `describe('a draft saved by Phase 2')` `:524-575`; three-doors `:427-445` | exact |
| `tests/core/feasibility.test.ts` (ext) | test — gate | node | itself | exact |
| `tests/core/undo.test.ts` (ext) | test — undo | node | itself | exact |
| `tests/adapters/ban-shield.test.ts` (new) | test — adapter | happy-dom, real events | `tests/adapters/tab-lock.test.ts:1-19` header + `:498-520` drive-the-transition | role-match |
| `tests/ui/ban-stage*.test.tsx` (new) | test — UI | happy-dom | `tests/ui/ban-mode.test.tsx:1, 26-68, 135-136` | exact |

---

## Pattern Assignments

### `src/core/model.ts` — `bansPerPlayer` + `duplicateBanPolicy`, schema 3 → 4

**Analog:** the Phase-3 `swapBudget` / `swapRounds` pair in the same interface.

**Field-declaration pattern** (`model.ts:193-208`) — every field carries its requirement id,
its zero-value meaning, and who owns the bound:

```ts
  /**
   * SWAP-01. How many swaps each player gets for the whole tournament. ONE budget spent
   * at either of two moments — mid-draft or in a swap round — rather than two separate
   * allowances that would let a player who saved theirs mid-draft outspend one who did
   * not (D-29). `0` means no swaps.
   */
  swapBudget: number;
  /**
   * SWAP-03. Dedicated swap rounds after the pick rounds, each one full pass over every
   * player. Default `0`, which means the draft ends with the last pick. Judged by the
   * feasibility gate rather than clamped by the control that sets it (D-30) — the gate is
   * the only authority on what is satisfiable.
   */
  swapRounds: number;
```

**`copyConfig` — element by element, never a spread** (`model.ts:411-442`). This is the second
of the five config-field sites and the one TypeScript cannot check:

```ts
/**
 * Deep copy of config, so folded state can never alias the caller's object.
 *
 * Every array is copied ELEMENT BY ELEMENT, and that is not stylistic. TypeScript checks
 * this function for a field it forgot — the return is an explicit object literal typed
 * `TournamentConfig`, so `strict` errors on an omission — but it cannot see a shallow
 * copy: `bans: config.bans` type-checks and quietly shares one array between the caller
 * and the folded state.
 */
function copyConfig(config: TournamentConfig): TournamentConfig {
  return {
    ...
    swapBudget: config.swapBudget,
    swapRounds: config.swapRounds,
  };
}
```

**`DraftState` additions pattern** (`model.ts:300`, and the `swaps` / `passes` doc blocks at
`:331-371`) — two sibling arrays, never a `Record` keyed by `playerId`, with the doc block
stating why the array is not a derivation:

```ts
  /**
   * Every pass recorded in a dedicated swap round, in log order, from `swap/passed`.
   *
   * ## Why it is a sibling of {@link DraftState.swaps} and not folded into it
   * ...
   * Nothing derived is stored here either. Which player is on the clock, whether the round
   * is finished and whether the tournament is complete are all computed from these entries
   * on every read — see `selectSwapRoundPosition` and `selectIsTournamentComplete`.
   */
  passes: SwapPass[];
```

**`initialState` arm** (`model.ts:445-459`): every new `DraftState` field gets its empty literal
here. `banPlacements: []`, `banSubmissions: []`, `bansRevealed: null`.

---

### `src/core/actions.ts` — the `bans/*` family

**Analog:** `swap/made` and `swap/passed`, which attached together in Phase 3 for the same
reason `bans/placed` + `bans/submitted` + `bans/revealed` attach together here.

**The six sites, stated by the file's own header** (`actions.ts:16-19`):

```
 * it lands in the same five places every type here does: constant, payload interface,
 * `Intent` member, creator, structural guard — plus `buildLogEntry`'s arm in
 * `import-guard.ts`, which is the sixth and the one a round trip fails silently without.
```

| # | Site | Line today |
|---|------|-----------|
| 1 | `export const SWAP_MADE = 'swap/made';` | `actions.ts:43` |
| 2 | `export interface SwapMadePayload {` | `actions.ts:262` |
| 3 | `Intent` union member | `actions.ts:307-315` |
| 4 | `SwapMadeAction = SwapMadePayload & ActionEnvelope` | `actions.ts:317-325` |
| 5 | `export function swapMade(...)` | `actions.ts:434` |
| 6 | `export function isSwapMadeAction(...)` | `actions.ts:576` |
| 7 | `case 'swap/made':` in `buildLogEntry` | `import-guard.ts:737` |

**Creator pattern — every field named, never a spread** (`actions.ts:440-449`):

```ts
}): SwapMadePayload {
  return {
    type: SWAP_MADE,
    playerId: swap.playerId,
    round: swap.round,
    outMonId: swap.outMonId,
    inMonId: swap.inMonId,
    swapRound: swap.swapRound,
  };
}
```

The rule is stated twice in the file: *"A spread of the caller's object would type-check and
would silently carry whatever else that object held into a log entry."* For `bansSubmitted`,
`monIds` must be copied element by element — `orderResolved` and `scheduleCompiled` both do
this because *a payload that aliased a component's array lets a later render mutate a log entry
that has already been written*.

**Structural-guard pattern — types only, and the omission is the design**
(`actions.ts:534-542`, verbatim doc block over `isCardsPlayedAction`):

```ts
/**
 * Types only — and the omission is the design rather than an oversight.
 *
 * Whether `value` is in `1..config.rounds`, whether that card is still in the player's hand,
 * and whether this player is the one on the card clock are all questions about the STATE,
 * and this function sees one action in isolation. They live in `canApply`, which sees both.
 * A guard that reached for the config would be a second authority on the same rules, free
 * to disagree with the first.
 */
export function isCardsPlayedAction(action: AnyAction): action is CardsPlayedAction {
  if (action.type !== CARDS_PLAYED || !isRecord(action)) return false;
  return (
    typeof action['playerId'] === 'string' &&
    isSafeInteger(action['value']) &&
    isSafeInteger(action['round'])
  );
}
```

`isBansSubmittedAction` copies this exactly: `typeof playerId === 'string' && isStringArray(monIds)`.
It does **not** check `monIds.length === config.bansPerPlayer`. The private helpers
`isRecord`, `isStringArray`, `isSafeInteger` already exist at `actions.ts:470-479`.

---

### `src/core/reduce.ts` — `bans/*` arms and mode-conditional guards

**Analog:** `apply(SWAP_MADE)` (`reduce.ts:239-303`) and `canApply(DRAFT_STARTED)` (`:371-388`).

**`seq` comes off the envelope, never off the array's length** (`reduce.ts:296-299`):

```ts
        swaps: [
          ...state.swaps,
          {
            playerId: action.playerId,
            ...
            // Off the ENVELOPE, never off the array's length — the log may legally have gaps.
            seq: action.seq,
          },
        ],
```

**`canApply` guard shape, and the one that must become mode-conditional** (`reduce.ts:371-374`):

```ts
    case DRAFT_STARTED: {
      if (!isDraftStartedAction(action)) return reject('malformedPayload');
      if (state.poolIds.length === 0) return reject('poolNotBuilt');
```

`canApply(SCHEDULE_COMPILED)` at `reduce.ts:351-358` carries the same `poolNotBuilt` reject plus
the doc-comment `// After the pool, because a schedule is only meaningful against one` that goes
false under D-11. **The precedent for reading `state.config` inside `canApply` already exists** —
`canApply(SWAP_MADE)` consults `config.swapBudget`. `04-RESEARCH.md` §Code Examples gives the
exact replacement text; copy it verbatim rather than re-deriving.

**`RejectionReason` shape — one `/** */` line per member, and one reason for several
situations when the host could not act differently** (`reduce.ts:119-127`):

```ts
  /**
   * No dedicated swap round is running that this action could belong to — SWAP-03.
   *
   * ONE reason for three situations, on `nothingToSwap`'s precedent: the picks are not
   * complete, the number is outside `1..config.swapRounds`, or an earlier swap round has
   * not finished. From the host's side they are the same failure — the action names a swap
   * round this tournament is not in — and no host could act differently on the difference.
   */
  | 'notSwapRound'
```

**Set-membership duplicate check** to copy for `duplicateBanIds` (`reduce.ts:347`):

```ts
      if (new Set(action.ids).size !== action.ids.length) return reject('duplicatePoolIds');
```

---

### `src/core/selectors.ts` — ban stage turn / progress / public-ban derivations

**Analog cluster:** the card-phase selectors, which are the closest thing in the codebase to a
"whose turn is it in a sub-stage" family.

**`selectBanTurn` copies `selectCardTurn`** (`selectors.ts:464-475`) — compose from selectors
that already exist rather than re-deriving:

```ts
export function selectCardTurn(state: DraftState): CardTurn | null {
  if (state.order.length === 0) return null;

  const round = selectCurrentRound(state);
  const alreadyPlayed = new Set(
    selectCardsPlayedThisRound(state, round).map((play) => play.playerId),
  );
  const playerId = selectCardPlayOrder(state, round).find((id) => !alreadyPlayed.has(id));

  return playerId === undefined ? null : { round, playerId };
}
```

Its doc block (`:441-463`) states the rule the ban selectors inherit: *"A second copy of 'who is
on the clock' is a second thing that can disagree with the log about whose turn it is."*

**`selectBanOrder` copies `selectStartingOrder`'s signature shape** — a free function over
primitives, not over `DraftState` (`selectors.ts:810`):

```ts
export function selectStartingOrder(seed: number, playerIds: readonly string[]): string[] {
  const order = [...playerIds].sort(compareIds);
  ...
}
```

**Two habits from `selectCardPlayOrder`** (`selectors.ts:402-416`) — guard the empty order
first, and skip an `undefined` indexed read rather than asserting (`noUncheckedIndexedAccess`
is on):

```ts
export function selectCardPlayOrder(state: DraftState, round: number): string[] {
  const playerCount = state.order.length;
  if (playerCount === 0) return [];

  const order: string[] = [];
  for (let offset = 0; offset < playerCount; offset++) {
    ...
    const playerId = state.order[position];
    if (playerId === undefined) continue;
    order.push(playerId);
  }

  return order;
}
```

**The `reverse()` trap — copy first** (`selectors.ts:575-578`, and its doc block says so):

```ts
export function selectSwapRoundOrder(state: DraftState): string[] {
  const resolved = selectResolvedOrder(state, state.config.rounds);
  return [...(resolved ?? state.order)].reverse();
}
```

**Fresh records, never a reference into `state`** (`selectors.ts:430-443`) — the rule every
selector in this file follows, and `selectBanCollisions` / `selectPublicBanIds` must too:

```ts
export function selectCardsPlayedThisRound(state: DraftState, round: number): CardPlay[] {
  return state.cardsPlayed
    .filter((play) => play.round === round)
    .map((play) => ({
      playerId: play.playerId,
      value: play.value,
      round: play.round,
      seq: play.seq,
    }));
}
```

**`selectBanStageState` copies `selectPhase`** (`selectors.ts:733-745`) — the ONE place a screen
mode is decided, with the enumerated values in the doc block and `app.tsx` branching on it:

```ts
/**
 * Which mode the screen is in — and the ONE place that is decided (D-17).
 *
 * `app.tsx` branches on this to choose a panel; no component works it out. That is what
 * makes "played but not yet resolved" unrepresentable as a screen state ...
 *
 *   `'cards'`       the current round has not resolved, so a card is on the clock
 *   `'picking'`     it has, and some team is still short of `config.rounds`
 *   `'swapRounds'`  every team is full and this tournament runs swap rounds
 *   `'complete'`    every team is full and it does not
 */
export function selectPhase(state: DraftState): DraftPhase {
```

**`selectCardOffer`'s posture doc block is the phase's governing pattern** (`selectors.ts:477-483`)
— quote it in the plan for every inert ban surface:

```ts
/**
 * This is the same shape `selectRoundEligibleIds` and `checkFeasibility` take: a pure
 * selector the EDGE consults BEFORE dispatching. The constraint belongs upstream of the
 * click, not in a rejection after it — a card the offer excludes renders inert with a
 * reason, so the deadlock CARD-04 otherwise creates is never entered rather than refused
 * on entry. `canApply`'s `cardNotPlayable` arm exists behind this as a backstop; if it
 * ever fires for a real host, the offer and the rule have disagreed and that is a bug.
 */
```

---

### `src/core/feasibility.ts` — D-21 pessimistic gate + RULE-08 re-check

**Analog:** the two swap fields, which are the most recent pair of host-typed numerics added to
this gate and carry the whole shape: two codes, a bound imported from `import-guard`, a
composer, a `PRECEDENCE` position.

**The two-question malformed/out-of-bounds pattern** (`feasibility.ts:509-523`) — copy verbatim
for `bansPerPlayerNotAnInteger` / `bansPerPlayerTooLarge`:

```ts
  // — the two swap fields —
  if (swapBudgetMalformed) {
    problems.push(blocking('swapBudgetNotAnInteger', SWAP_BUDGET_NOT_AN_INTEGER));
  } else if (swapBudget === null) {
    problems.push(
      blocking('swapBudgetTooLarge', swapBudgetTooLargeMessage(MAX_SWAP_BUDGET)),
    );
  }
```

The `asSafeInteger` helper the two questions run through is at `feasibility.ts:365-371`, and its
comment gives the reason for the ordering: *an emptied field is `null` and every relational
comparison with `NaN` is false*.

**Bounds are imported, never restated** (`feasibility.ts:78`, and the header at `:58-65` states
the invariant):

```ts
import { MAX_SWAP_BUDGET, MAX_SWAP_ROUNDS } from './import-guard';
```

> `MAX_SWAP_BUDGET` and `MAX_SWAP_ROUNDS` are imported from `import-guard.ts` rather than
> restated. They have to be the SAME two numbers ... One number, two readers — the alternative
> is a build that creates documents it will not re-open.

`MAX_BANS_PER_PLAYER` goes in `import-guard.ts` beside `MAX_SWAP_BUDGET` (`:141`) and is
imported here. Not the other way round.

**One composer, two arms** (`feasibility.ts:294-303`) — the `hostBanlist` string must stay
byte-identical while the blind/snake arm adds a clause:

```ts
function notEnoughMegasMessage(
  ...
  formeBans: number,
): string {
  return `Not enough Pokémon can Mega. ${players} players × ${megaRounds} Mega rounds needs ${needed}; ${available} can still Mega after ${speciesBans} species bans and ${formeBans} Mega-forme bans. Lower the Mega requirement, or unban a Mega forme.`;
}
```

**`PRECEDENCE` is data, and position is load-bearing** (`feasibility.ts:173-197`):

```ts
/**
 * The order reasons are reported in. Declared, not emergent.
 *
 * Fixing the first problem usually changes the rest, which is why the gate shows one reason
 * at a time — so which one is "first" is a product decision and lives here as data rather
 * than as the incidental order the checks happen to run in below.
 */
const PRECEDENCE: readonly FeasibilityCode[] = [
  ...
  'swapBudgetNotAnInteger',
  'swapRoundsNotAnInteger',
```

**The RULE-09 predicate that gains D-21's `q` term** (`feasibility.ts:548-565`) — note the
existing variable already has host bans and forme bans subtracted, which is the double-subtraction
trap `04-RESEARCH.md` flags:

```ts
  if (megasPerTeam !== null && players * megasPerTeam > megaEligibleLegalCount) {
    problems.push(
      blocking(
        'notEnoughMegas',
        notEnoughMegasMessage(
          players, megasPerTeam, players * megasPerTeam,
          megaEligibleLegalCount, banCount, megaFormeBanCount,
        ),
      ),
    );
  }
```

**For the post-reveal re-check: call `checkFeasibility` itself** (`feasibility.ts:387`). Do not
write a second arithmetic. `04-RESEARCH.md` §The post-reveal re-check gives the full argument
object.

---

### `src/core/migrate.ts` — the 3 → 4 arm

**Analog:** `migrateV2ToV3` and `V2_CONFIG_DEFAULTS`, which are one version old and structurally
identical to what schema 4 needs.

**The defaults table, exported and imported by the guard** (`migrate.ts:78-90`):

```ts
/**
 * What every version 3 config field is worth in a version 2 document.
 *
 * Same contract as {@link V1_CONFIG_DEFAULTS}: one place, imported by
 * `import-guard.buildConfig` rather than repeated, because two copies of a default table
 * is two tables that can disagree about what a Phase 2 tournament was.
 * ...
 */
export const V2_CONFIG_DEFAULTS = {
  megaFormeBans: [],
  swapBudget: 0,
  swapRounds: 0,
} as const;
```

**The arm — config only, log passed through unchanged, fresh literals**
(`migrate.ts:224-248`):

```ts
function migrateV2ToV3(doc: V2Doc): TournamentDoc {
  const { config } = doc;

  return {
    schemaVersion: 3,
    id: doc.id,
    createdAt: doc.createdAt,
    config: {
      ...config,
      players: config.players.map((player) => ({ id: player.id, name: player.name })),
      bans: config.bans.map((id) => id),
      dualMegaChoices: config.dualMegaChoices.map((choice) => ({
        speciesId: choice.speciesId,
        forme: choice.forme,
      })),
      rules: [{ kind: 'mega', count: config.megasRequiredPerTeam }],
      megaFormeBans: [...V2_CONFIG_DEFAULTS.megaFormeBans],
      swapBudget: V2_CONFIG_DEFAULTS.swapBudget,
      swapRounds: V2_CONFIG_DEFAULTS.swapRounds,
    },
    rng: { seed: doc.rng.seed, cursor: doc.rng.cursor },
    log: [...doc.log],
  };
}
```

Its doc block (`:203-218`) carries the log-passthrough argument verbatim — reuse it for
`migrateV3ToV4` rather than writing a new one.

**The type alias for the older shape** (`migrate.ts:37-39`) — write `V3Config` / `V3Doc` the
same way, as an `Omit` rather than a cast, so each arm stays strictly typed:

```ts
type V2Config = Omit<TournamentConfig, 'rules' | 'megaFormeBans' | 'swapBudget' | 'swapRounds'>;

type V2Doc = Omit<TournamentDoc, 'config'> & { config: V2Config };
```

**The version list and the chain** (`migrate.ts:48` and `:265-268`):

```ts
export const SUPPORTED_SCHEMA_VERSIONS: readonly number[] = [1, 2, 3];
...
  if (version === 3) return { ok: true, doc };
  if (version === 2) return { ok: true, doc: migrateV2ToV3(doc) };
  if (version === 1) return { ok: true, doc: migrateV2ToV3(migrateV1ToV2(doc)) };
```

Adding `4` to the list at `:48` is what moves `persistence.ts:261-263` automatically — that site
asks the list rather than comparing `SCHEMA_VERSION`, so it needs **no code change**. The risk
has shifted from "forget the site" to "forget the test" (see §Shared Patterns → Schema bump).

---

### `src/core/undo.ts` — three new `UndoRemoval` kinds

**Analog:** the `swap` + `pass` widening in Phase 3, which is the last time this type grew and
is documented as the template.

**The deny-list plus allow-list, and why both** (`undo.ts:107` and `:135-144`):

```ts
const NEVER_UNDONE: readonly string[] = [POOL_BUILT, SCHEDULE_COMPILED, DRAFT_STARTED];
...
function isUndoable(action: Action): boolean {
  if (NEVER_UNDONE.includes(action.type)) return false;
  return (
    isPickMadeAction(action) ||
    isCardsPlayedAction(action) ||
    isOrderResolvedAction(action) ||
    isSwapMadeAction(action) ||
    isSwapPassedAction(action)
  );
}
```

The doc block above it (`:110-134`) is the one that must be **re-read and corrected** in the same
change, because it reasons about `pool/built` never being reachable by a growing allow-list — and
after D-11 `pool/built` is the last action of a blind/snake stage:

> The DENY-LIST is the invariant. It states the boundary in one place, so when the swap
> actions joined the allow-list below nobody had to re-derive whether a growing allow-list
> could reach `pool/built`. It could not, and that was the point of writing it that way.

It also states the pairing rule that applies to `bans/submitted` + `bans/revealed` +
`bans/placed`: *"`swap/made` and `swap/passed` attach TOGETHER … adding the first alone would
have meant reshaping the same type twice."*

**The `kind` union and the `round` field's honest-answer precedent** (`undo.ts:219-232`):

```ts
export interface UndoRemoval {
  /** Which of the undoable actions is at the top of the stack. */
  kind: 'pick' | 'card' | 'order' | 'swap' | 'pass';
  /**
   * 1-based round of the action being removed.
   *
   * ... For a PASS, `config.rounds`: a pass belongs to a swap round rather than a pick round,
   * and `config.rounds` is where the draft is standing while the swap rounds run, so a caller
   * comparing this against the current round gets the honest answer "no round was crossed".
   */
  round: number;
```

**`monId` must stay `null` for every ban kind** — its own doc block (`:234-241`) says the field
means *"the species returning to the POOL"*, and no pool exists during the ban stage. This is
also the second layer of the live-region defence: no name to interpolate.

**The confirm is obtained by the discriminant, not by new machinery** (`undo.ts:404` +
`:406-427`):

```ts
const ROUND_COMPARABLE_KINDS: readonly UndoRemoval['kind'][] = ['pick', 'card'];
...
export interface RoundBoundaryCrossing {
  /** True when the undo needs a confirm — see {@link undoCrossesRoundBoundary}. */
  crosses: boolean;
  /** Which kind of move is at the top of the stack. The UI picks its copy from this. */
  kind: UndoRemoval['kind'];
```

A ban kind is not round-comparable, so it stays off `ROUND_COMPARABLE_KINDS` and gets
`crosses` set explicitly.

---

### `src/core/import-guard.ts` — `buildLogEntry` arms + config fields + `MAX_BANS_PER_PLAYER`

**Analog:** the `swap/made` arm, which is the file's own worked warning about the silent-drop
failure.

**The arm, and the comment that must be echoed for `bans/*`** (`import-guard.ts:737-772`):

```ts
    case 'swap/made': {
      // Every field NAMED, `swapRound` included, and that is the whole point of this arm.
      // Payloads are rebuilt field by field here, so a field this switch does not mention
      // is dropped SILENTLY on every round trip. `swapRound` has no consumer until 03-11's
      // dedicated swap rounds, which is exactly the condition under which it would be
      // forgotten ...
      const playerId = raw['playerId'];
      ...
      if (typeof playerId !== 'string') return null;
      ...
      return {
        type: 'swap/made',
        playerId, round, outMonId, inMonId, swapRound,
        ...envelope,
      };
    }
```

**The bounded-array arm to copy for `bans/submitted.monIds`** (`import-guard.ts:725-735`,
`order/resolved`) — `copyStringArray(value, MAX)` with a bound chosen for what the array holds:

```ts
    case 'order/resolved': {
      // Bounded by the PLAYER cap, because that is what the array holds ... Whether these
      // ids are the document's configured players is referential integrity, which this
      // function deliberately does not check.
      const order = copyStringArray(raw['order'], MAX_PLAYERS);
```

`isBansRevealedAction` / the `bans/revealed` arm validate a nested array-of-records; the shape
to copy is `buildRoundSpecs` (`import-guard.ts:422`).

**The bound constant, with its allocation argument** (`import-guard.ts:126-141`):

```ts
/**
 * ... Twenty-four is past anything a 4–8 player night describes ... and it is
 * bounded INDEPENDENTLY of `MAX_ROUNDS` because the two numbers answer different
 * questions and would drift the moment either changed for its own reasons.
 */
export const MAX_SWAP_BUDGET = 24;
```

**Config-field pattern in `buildConfig` — absent means default, malformed means refuse**
(`import-guard.ts:513-524`):

```ts
  let banMode: BanMode = V1_CONFIG_DEFAULTS.banMode;
  if (raw['banMode'] !== undefined) {
    if (!isOneOf(raw['banMode'], BAN_MODES)) return null;
    banMode = raw['banMode'];
  }
```

`DuplicateBanPolicy` needs a runtime mirror array beside `BAN_MODES` (`import-guard.ts:279`):

```ts
/**
 * The permitted members of each string-literal union, as runtime data.
 *
 * A union exists only in the type system, so nothing about `BanMode` survives to check an
 * imported string against. These arrays are that check, and they are `as const` so the
 * compiler errors if one drifts from the union it mirrors.
 */
const BAN_MODES: readonly BanMode[] = ['hostBanlist', 'blind', 'snake'];
```

---

### `src/adapters/ban-shield.ts` (new) — BAN-06 / D-17 / D-18

**Two analogs, one per half.**

**Handler shape and the `event.persisted` read** — `tab-lock.ts:620-637`, verbatim:

```ts
function installLifecycle(): void {
  if (typeof window === 'undefined') return;

  const onPageHide = (): void => lock?.release();
  const onPageShow = (event: PageTransitionEvent): void => {
    // Restored from the back/forward cache. `release()` put the lock back to idle on the
    // way out, so this re-runs the boot protocol rather than leaving a restored tab
    // stuck behind a banner it can never clear.
    if (event.persisted) lock?.claim();
  };

  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);

  lifecycleTeardown = () => {
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
  };
}
```

Copy the `typeof window === 'undefined'` guard and the `event.persisted` read. **Do not add the
ban guard to this function** — it is a module-level singleton owned by the lock, torn down
through one module-level variable, and a second concern in it couples the ban stage's lifetime
to the lock's.

**Subscribe-and-return-teardown shape, and the `window` / `document` asymmetry** —
`persistence.ts:431-453`, verbatim:

```ts
export function startAutosave(source: AutosaveSource): () => void {
  const unsubscribe = source.subscribe(() => { ... });

  const onPageHide = (): void => flush();
  const onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') flush();
  };

  window.addEventListener('pagehide', onPageHide);
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    unsubscribe();
    window.removeEventListener('pagehide', onPageHide);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    flush();
  };
}
```

**`pageshow`/`pagehide` on `window`; `visibilitychange` on `document`.** That asymmetry is
correct and must be copied exactly. `04-RESEARCH.md` §Prescribed shape gives the finished
`installBanShield(onLock)` body.

---

### `src/store.ts` — `createBanStage` sibling and the exhaustive announcement

**Analog for the sibling:** `createTournament` (`store.ts:220-265`), whose rollback-on-refusal
shape is the part that must be copied, not the three dispatches.

```ts
export function createTournament(input: CreateTournamentInput): TournamentDoc | null {
  const previousDoc = docSignal.peek();
  const previousState = stateSignal.peek();

  docSignal.value = { schemaVersion: SCHEMA_VERSION, id: newId(), createdAt: now(),
                      config: input.config, rng: { seed: newSeed(), cursor: 0 }, log: [] };
  stateSignal.value = initialState(input.config);

  const pool = dispatch(poolBuilt(...));
  const compiled = pool.ok ? dispatch(scheduleCompiled(input.schedule)) : pool;
  const started = compiled.ok ? dispatch(draftStarted(input.order, input.orderSeed)) : compiled;

  if (!started.ok) {
    // `started` carries the FIRST refusal of the three, because each dispatch is skipped
    // once an earlier one failed. ...
    docSignal.value = previousDoc;
    stateSignal.value = previousState;
    return null;
  }

  return docSignal.peek();
}
```

Its own doc block (`:186-198`) contains the **ordering paragraph that becomes false** under D-11
and must be corrected in the same change.

**`CreateTournamentInput`'s posture** (`store.ts:145-176`) — the sibling's input type copies it:
*"Each field is a result the config screen already computed and already showed the host …
Passing the results rather than the instructions is what makes 'the tournament that starts is
the one on screen' structural."* `createBanStage` takes `{ config, order, orderSeed, schedule }`
and **not** `poolIds` / `poolSeed` / `megaCapableCount`.

**`nextSeq`, never `log.length`** (`store.ts:100-114`) — unchanged, quoted so the plan does not
reinvent it:

```ts
function nextSeq(log: readonly Action[]): number {
  let highest = -1;
  for (const action of log) {
    if (action.seq > highest) highest = action.seq;
  }
  return highest + 1;
}
```

**`undoAnnouncement` — the fall-through that must become exhaustive** (`store.ts:416-447`). The
current tail, verbatim, is the leak:

```ts
  if (removed.kind === 'pass') {
    return `Undid ${playerName}'s pass in swap round ${removed.swapRound}.`;
  }

  return `Undid Round ${removed.round} — ${speciesName(removed.monId)} is back in the pool.`;
```

**There is no `const exhaustive: never` anywhere in `src/` today.** The closest shipped pattern
is a `switch` over a string-literal union with **no default**, where the declared return type is
what makes an omission a compile error — `matchesMega` (`search.ts:136-143`):

```ts
export function matchesMega(entry: FilterableEntry, mode: MegaFilterMode): boolean {
  switch (mode) {
    case 'all':
      return true;
    case 'mega':
      return entry.megaCapable === true;
    case 'nonMega':
      return entry.megaCapable !== true;
  }
}
```

and `poolSizeForPreset` (`feasibility.ts:586-597`), same shape. Either idiom works; the
`never`-typed default is stricter and is what `04-RESEARCH.md` §The exhaustive undo announcement
supplies verbatim, including the ban arms that name no species.

---

### `src/app.tsx` — a fourth `Screen` member inside the existing `inert` gate

**Analog:** the `Screen` union itself and the three shell-gate children beside it.

**The union and its doc block** (`app.tsx:110-120`):

```ts
/**
 * Which screen the app is showing — D-01.
 *
 * A discriminated union in the same style as `LoadState` and `ImportFlow`, and the reason
 * it exists at all is that Phase 1 had no concept of a screen ...
 */
type Screen = { name: 'landing' } | { name: 'config' } | { name: 'draft' };
```

Held at `app.tsx:474`: `const [screen, setScreen] = useState<Screen>({ name: 'landing' });`

**The shell gate — everything goes inside it, never beside it** (`app.tsx:1896-1899`):

```tsx
      <div
        class={screen.name === 'draft' ? 'draft-shell' : 'app-shell'}
        inert={readOnly ? true : undefined}
      >
```

The gate's doc block (`app.tsx:1836-1884`) records exactly why a screen must not be a sibling:

> Gating the draft alone was not enough, and the hole was not in the draft. A secondary tab
> could walk the landing screen to `New tournament`, fill the config form, click `Start draft`,
> and hold a DIFFERENT tournament from the owner's ... The landing and config screens were
> siblings of the gate, so they are now children of it.

`LiveRegion`, `ReadOnlyBanner` and the three dialogs stay **outside**, and that is documented at
`:1861-1875`. Do not move them.

**Screen-mount branch shape to copy** (`app.tsx:1903-1935`) — a `screen.name === '…' &&` guard
per screen, with any additional readiness condition split into its own branch:

```tsx
        {screen.name === 'config' && load.status === 'ready' && (
          <ConfigScreen
            snapshot={load.bundle.snapshot}
            entries={entries}
            spriteMeta={load.bundle.spriteMeta}
            onStarted={() => setScreen({ name: 'draft' })}
          />
        )}
```

**Undo routing — the confirm is obtained by setting `crossing.crosses`, no new machinery**
(`app.tsx:1538-1560`):

```ts
  const handleRequestUndo = useCallback(() => {
    const currentDoc = getDoc();
    const currentState = getState();
    if (currentDoc === null || currentState === null) return;

    const crossing = undoCrossesRoundBoundary(currentDoc, currentState);
    if (crossing === null || !crossing.crosses) {
      setFiltersCleared(false);
      undo(resolveSpeciesName);
      return;
    }

    setConfirm({
      kind: 'undo',
      crossing,
      playerName: selectPlayerName(currentState, crossing.playerId) ?? crossing.playerId,
    });
  }, [resolveSpeciesName]);
```

**The `bannedNames` prop feeding `TopBar`** (`app.tsx:1300-1307`) — this is the exact expression
Amendment 1 narrows to `selectPublicBanIds(state)`:

```ts
   * Its length IS the set cardinality by construction: `bannedEntries` intersects the stored
   ...
    () => (state === null ? [] : bannedEntries(entries, state.config.bans).map((entry) => entry.name)),
```

---

### `src/ui/screens/ConfigScreen.tsx` — enable two options, add two controls

**Analog:** the shipped `Bans` fieldset and the `Swaps` fieldset immediately below it.

**The two lines that change** (`ConfigScreen.tsx:275-279`), verbatim today:

```ts
const BAN_MODE_OPTIONS: readonly SegmentedOption<BanMode>[] = [
  { value: 'hostBanlist', label: 'Host banlist' },
  { value: 'blind', label: 'Blind — Not yet available', disabled: true },
  { value: 'snake', label: 'Snake — Not yet available', disabled: true },
];
```

Its doc block (`:254-274`) explains the native-`disabled`-plus-`aria-disabled` choice and
forbids unifying it with `FeasibilityBar`'s `Start draft`. The new `DUPLICATE_POLICY_OPTIONS`
constant is a sibling of this one and reuses the **`{Option} — Not yet available`** label form
with a capital `N`.

**`NumericField` instance pattern** (`ConfigScreen.tsx:1409-1428`) — `Bans per player` is a
fourth instance of exactly this:

```tsx
      <fieldset class="config-screen__group">
        <legend class="config-screen__legend">Swaps</legend>

        <NumericField
          label={SWAP_BUDGET_LABEL}
          value={swapBudgetRaw}
          onInput={setSwapBudgetRaw}
          helper={SWAP_BUDGET_HELPER}
          min={0}
        />
```

with the raw string held in state and parsed once (`ConfigScreen.tsx:612`):

```ts
  const swapBudget = useMemo(() => parseNumericField(swapBudgetRaw), [swapBudgetRaw]);
```

and the fieldset's own comment stating the no-second-authority rule (`:1400-1408`):

> There is deliberately NO blocking reason attached here for an emptied field:
> `swapBudgetNotAnInteger` and `swapRoundsNotAnInteger` belong to `feasibility.ts`, which its
> own doc block names as the single authority on what is satisfiable.

**The `Bans` fieldset composition** (`ConfigScreen.tsx:1341-1397`) — this is the three-surface
arrangement `BlindEntry` reuses: `SegmentedControl` → `TypeaheadField` → `BanChipList` →
`PoolGrid`, all over one flat id list, with the "never filter the candidates" comment:

```tsx
        {/*
          `candidates` is the FULL entry list, not the entries minus the banlist. Filtering
          the banned ones out would make `No Pokémon matches "{query}".` false for a species
          that plainly does match and is simply already banned ...
        */}
        <TypeaheadField
          id="config-ban"
          label={BAN_FIELD_LABEL}
          placeholder={BAN_FIELD_PLACEHOLDER}
          candidates={entries}
          onSelect={handleAddBan}
        />

        <BanChipList banned={banned} onRemove={handleRemoveBan} />
        ...
        <PoolGrid
          entries={entries}
          spriteMeta={spriteMeta}
          onPick={toggleBan}
          bannedIds={bannedIdSet}
        />
```

**The count is `bannedEntries(...).length`, always** (`ConfigScreen.tsx:679` and `:720`):

```ts
  const banned = useMemo(() => bannedEntries(entries, bans), [entries, bans]);
...
      announce(banAnnouncement(entry.name, next, bannedEntries(entries, nextBans).length));
```

**`handleStart` — the config write, and the branch point for D-01** (`ConfigScreen.tsx:1073-1074`):

```ts
  const handleStart = useCallback(() => {
    if (feasibility.blocked || draw === null || poolSize === null) return;
```

The `draw === null` clause must move inside the `hostBanlist` branch — blind and snake have no
draw yet. The `?? 0` idiom for a null numeric (`:1088-1091`) is the pattern for `bansPerPlayer`:

```ts
      // `?? 0` is unreachable: `feasibility.blocked` is false here, and a null field is
      // itself a blocker. It exists because the compiler cannot see that, and inventing a
      // number the host did not choose would be worse than the branch.
      megasRequiredPerTeam: megasRequiredPerTeam ?? 0,
```

**Fresh arrays into the document** (`ConfigScreen.tsx:1082`, `:1103`): `bans: [...bans]`,
`megaFormeBans: [...megaFormeBans]` — *"the document must not share an array with this screen's
state."*

---

### `src/ui/components/PoolGrid.tsx` (extend) — an inert cell with a reason

**Analog:** its own `roundRestriction` and `megaInertReason` props, which are the two most recent
widenings and both state the rule the new one must follow.

**One prop carrying every field the copy needs** (`PoolGrid.tsx:114-130`):

```ts
  /**
   * The restriction the CURRENT ROUND imposes, or `null` when the round admits the whole
   * pool — RULE-03, D-16.
   *
   * ONE prop carrying the kind, the round number and the ids, for the reason `bannedIds`
   * above is one prop rather than a mode plus a set: "a Mega round with no eligibility
   * data" and "an open round carrying some" are both unrepresentable. ...
   *
   * The component decides nothing. It renders the restriction it is handed and composes
   * the copy for it; which ids a round admits is `selectRoundEligibleIds`' answer, because
   * a UI component may not own a game rule.
   */
  roundRestriction?: MegaRoundRestriction | null;
```

**The default applied once inside the component, so `undefined` can never read as a reason**
(`PoolGrid.tsx:100-113`):

```ts
   * OPTIONAL, defaulting to `null`, and the default is load-bearing rather than a
   * convenience: `FilterBar` treats any non-null value as a reason, so an omitted prop
   * arriving as `undefined` would read as "inert with the reason `undefined`". The default
   * is applied here, once, so that value can never reach the control.
   */
  megaInertReason?: string | null;
```

**Ban mode is derived from data, not a flag** (`PoolGrid.tsx:474`):

```ts
  const banMode = bannedIds !== null;
```

**`idPrefix` already exists for the second grid** (`PoolGrid.tsx:94-100`) — the blind entry
surface's grid passes one; the default keeps every shipped id unchanged.

**The unmount rule, and where it comes from** — `ANNOUNCE_DEBOUNCE_MS` at `PoolGrid.tsx:378`
with the timer cleared at `:606` and on unmount only. This is why the entry surface must
**unmount** rather than hide: a hidden-but-mounted grid leaves a pending `announce` that fires
after the locked state cleared the region.

---

### `src/ui/components/TypeaheadField.tsx` (extend) — an inert option with a reason

**Analog:** its own `candidates` widening and `subject` default.

```ts
export interface TypeaheadFieldProps<T extends PoolSubject> {
  /** Visually hidden. */
  label: string;
  placeholder: string;
  /**
   * What the host may still choose. The caller decides what belongs here.
   *
   * A WIDENING, not a second mode. `MegaForme` carries the `id` this component keys and
   * addresses options by and the `name` the shared predicate matches, which is everything
   * read here — so the Mega-forme banlist gets the same combobox rather than a second one
   * that can drift from it.
   */
  candidates: readonly T[];
  onSelect: (entry: T) => void;
  /**
   * The singular noun in the no-match line. Defaults to `Pokémon`.
   *
   * The whole sentence is NOT the prop, so the two surfaces cannot end up phrasing it
   * differently — only the noun varies, and the shape is one composer above.
   */
  subject?: string;
  /**
   * Unique prefix for the input, the listbox and every option id. Required, because the
   * input addresses an option by id and two fields on one page that shared a prefix would
   * address each other's options.
   */
  id: string;
}
```

The new `optionState?: (entry: T) => { inert: true; reason: string } | null` follows both habits:
optional with the default applied once inside the component, and only the *reason* varies while
the sentence shape stays here. **Results are never silently filtered** — the `candidates`
comment at `ConfigScreen.tsx:1352-1357` gives the reason.

---

### `src/ui/components/BanBoard.tsx` + `.css` (new)

**Analog:** `BoardGrid.tsx` + `BoardGrid.css`.

**The label-column token, which must be reused rather than redeclared** (`BoardGrid.css:53-58`):

```css
.board__grid {
  --board-label-w: 176px;

  display: grid;
  gap: var(--space-2);
  align-items: stretch;
}
```

**Header labels as constants with a fallback** (`BoardGrid.tsx:27-33`) — `Pass {n}` follows this:

```ts
/**
 * The contract names the round headers `R1`…`R6` literally, so they are written
 * literally. The fallback keeps the component honest if a later phase ever runs a
 * different round count rather than silently rendering six columns of nothing.
 */
const ROUND_LABELS = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'] as const;

function roundLabel(round: number): string {
  return ROUND_LABELS[round - 1] ?? `R${round}`;
}
```

**The empty state as a composer, not inline JSX** (`BoardGrid.tsx:68-84`) — `No bans yet.
{firstPlayerName} bans first.` is the same shape:

```ts
/** Unchanged from Phase 1, and the only half of the empty state that survives a null name. */
const EMPTY_HEADING = 'No picks yet';
...
 * Held as a composer rather than written inline: JSX collapses whitespace between text
 * lines, and this string is a contract asserted on exact equality (S-5).
 */
function emptyBody(firstPlayerName: string): string {
  return `${firstPlayerName} picks first. Choose any Pokémon in the pool to start Round 1.`;
}
```

**No invented ARIA** (`BoardGrid.tsx:41-46`): *"these header cells are `<div>`s with no
programmatic association to the grid cells they sit above, and a fabricated one would be worse
than the text — it would assert a relationship the markup does not have."* `BanBoard` takes no
`role="grid"`.

**The component decides nothing** (`BoardGrid.tsx:56-63`, `isMegaRound`): it renders the kind it
is given.

---

### `src/ui/components/BlindLocked.tsx` + `.css`, `BanReveal.tsx` + `.css` (new)

**Analog:** `CardPanel.tsx` + `CardPanel.css` — the most recent new panel component, whose doc
block is the template for a Phase-4 panel header.

```ts
/**
 * The card-play step — the hand on the clock, what is already down, and who is still to
 * come (CARD-01, CARD-03, CARD-05).
 *
 * ## This component decides nothing
 *
 * The hand, the play rotation and the resolved order are RULES, so they arrive as props from
 * `selectHand`, `selectCardPlayOrder` and `selectCardsPlayedThisRound` and are never worked
 * out here. Nothing in this file imports the store, and it does not know which phase the
 * screen is in — `selectPhase` decides that and `app.tsx` branches on it (D-17). If this
 * file ever seems to need to know whether a card is legal, the selector is missing.
 */

const PANEL_HEADING = 'Priority cards';
```

**The stylesheet header, which every new `.css` copies** (`CardPanel.css:1-10`):

```css
/*
 * CardPanel — the card-play step, in the pool pane's place.
 *
 * Tokens only: no raw hex and no raw length. No :focus rule — the global accent ring in
 * app.css covers every focusable element.
 *
 * No accent anywhere in this file. 03-UI-SPEC §Colour keeps the accent at exactly three
 * uses and the card surfaces add none: playing a card is the action and the faces are its
 * target.
 */

.card-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-3);
  background: var(--color-surface);
}

.card-panel__heading {
  margin: 0;
  font: var(--text-heading);
  color: var(--color-text);
}
```

Note `font: var(--text-heading)` as a **complete shorthand** — never `font-size` alone
(`tokens.css:34-36`).

**For `BanReveal`'s blocked `Start draft`:** `FeasibilityBar.tsx:17-49` is the analog, and its
doc block forbids "fixing" it into agreement with `TopBar`'s natively-disabled undo:

```ts
 * ## `aria-disabled` WITHOUT native `disabled` — deliberate, do not "fix" it
 *
 * A natively disabled button is not focusable, so a keyboard user could never reach the
 * explanation — and the explanation is the entire point of RULE-07. So `Start draft` takes
 * `aria-disabled` alone, stays in the tab order, and its click handler returns early.
 ...
/**
 * The reason element's id, and the id the Start button names as its description.
 *
 * A module constant rather than a generated id because there is exactly one feasibility
 * bar per screen — it is pinned, and a second one would be two answers to one question.
 */
const REASON_ID = 'feasibility-reason';
```

**For `BlindEntry`'s sticky footer:** `FeasibilityBar.css:9` (`position: sticky;`) is the shipped
mechanism the UI-SPEC names.

---

### `src/ui/components/TopBar.tsx` (extend) — Amendment 1

**Analog:** the disclosure as it ships (`TopBar.tsx:209-217`), which changes only in what feeds
`bannedNames`:

```tsx
        {bannedNames.length > 0 && (
          <details class="top-bar__bans">
            <summary class="top-bar__bans-summary">Bans ({bannedNames.length})</summary>
            <ul class="top-bar__bans-list">
              {bannedNames.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </details>
        )}
```

The prop doc at `TopBar.tsx:58-64` already states that the array comes from `bannedEntries` and
that *"its length is the set cardinality by construction"*. The narrowing is entirely at the
`app.tsx:1307` call site: swap `state.config.bans` for `selectPublicBanIds(state)`.

**Do not hoist the Ctrl+Z listener.** It is registered inside `TopBar` (`TopBar.tsx:152`, cleanup
`:154`) and gated on `isOwner()` at `:146`. `04-UI-SPEC` gives the entry surface no top bar, so
unmounting `TopBar` removes the listener — that is the structural reason no species-naming undo
is one keystroke from a shielded screen.

---

### `src/ui/components/TurnBanner.tsx` (extend) — one snake branch

**Analog:** the `swapLine` branch, added in Phase 3 for the same reason (`TurnBanner.tsx:203-226`):

```ts
  /*
    The swap-round line is worked out FIRST and separately, because it is the one headline
    that is not about a pick round: it counts swap rounds, not rounds, so it takes neither
    `round` nor `rounds` and cannot be folded into `turnCopy`'s ternary without one of them
    reaching a sentence it does not belong in.

    Null when the phase is anything else, so the expression below reads as "the swap line,
    or the ordinary one".
  */
  const swapLine =
    phase === 'swapRounds' && swapRound !== null && playerName !== null
      ? swapTurnCopy(swapRound, swapRounds, playerName)
      : null;
```

`Pass {p} of {passes} — {playerName} bans` is the same category: a headline that counts passes,
not rounds, so it gets its own `banLine` computed first and folded into the same expression.

---

### `src/ui/confirm-copy.ts` (extend) — three new sets

**Analog:** `ABANDON_CONFIRM` (`confirm-copy.ts:50-65`) and the plural helpers above it.

```ts
/**
 * 1. Abandoning a draft — D-36.
 *
 * `danger` toned, and one of only two of the six that qualify. This is genuine data loss
 * with no way back ... The body says exactly that rather than implying a recovery that
 * does not exist.
 */
export const ABANDON_CONFIRM = {
  heading: 'Abandon this draft?',
  tone: 'danger' as const,
  confirmLabel: 'Abandon draft',
  safeLabel: 'Keep drafting',
  body: (pickCount: number, playerCount: number): string =>
    `This discards ${picks(pickCount)} across ${players(playerCount)}. Nothing recovers it unless you have already downloaded the tournament JSON.`,
};
```

**The plural helper rule** (`confirm-copy.ts:37-48`) — every interpolated count gets one, and
`bans()` already exists:

```ts
function bans(count: number): string {
  return count === 1 ? '1 ban' : `${count} bans`;
}
```

The file header (`:1-19`) states why all copy lives here: *"one pattern and six sets of copy
rather than six components. Splitting the copy per caller would recreate the thing the pattern
exists to prevent."* Phase 4's three sets are sets 8, 9 and 10 in the same module.

---

## Shared Patterns

### Ambient values stamped at the edge

**Source:** `src/core/actions.ts:6-11`, enforced by `npm run check:pure`.
**Apply to:** every `bans/*` creator, the serpentine selector, `feasibility.ts`.

```
 * The creators below return the PAYLOAD only. They do not stamp `seq`, `at` or
 * `actorId` — `dispatch` does that at the impure edge, because a creator that reached
 * for a clock would be an ambient read inside the core and `npm run check:pure` would
 * fail the build for it. That split is the point, not an inconvenience.
```

`document`, `window`, `crypto`, `setTimeout`, `Math.random`, `Date.now` are whole-word forbidden
identifiers in `src/core` (`scripts/check-pure-core.mjs:63-82`). **Name the tournament document
`doc`, never `document`** — a parameter named `document` fails the build. `migrate.ts:249` and
`store.ts:286` both already do this.

---

### Constraint upstream of the click, never validation after it

**Source:** `src/core/selectors.ts:477-483` (`selectCardOffer`'s doc block, quoted in full above).
**Apply to:** every ban surface — snake's already-banned cells, the typeahead's already-banned
options, `Lock in` before `{m}` are chosen, `Start draft` when RULE-08 blocks.

Consequence for planning: every new `canApply` ban arm is a **backstop**. A test that reaches one
is testing the imported-document path, not the host path.

---

### `aria-disabled` alone for a computed reason; both attributes for a static one

**Source:** `ConfigScreen.tsx:254-267` and `SegmentedControl.tsx:74-80`.
**Apply to:** `Start draft` at the reveal, every inert ban cell, every inert typeahead option,
the not-yet-complete `Lock in` button (`aria-disabled` alone) — and the duplicate-policy control's
`reBan` member (both).

```ts
          // Both attributes, deliberately. `disabled` is what actually refuses the
          // click; `aria-disabled` is what survives the styling, since a natively
          // disabled control's state is reported inconsistently once a label is doing
          // the rendering. A caller that wants a visible suffix such as
          // `— Not yet available` puts it in `label`; this component does not
          // synthesize copy.
```

The `ConfigScreen` doc block ends *"Do not 'fix' either of them into agreement with the other."*

---

### The displayed ban count is `bannedEntries(...).length`, never anything else

**Source:** `src/core/bans.ts:57-72`.
**Apply to:** `TopBar`'s disclosure, `BanReveal`'s `<h1>`, the entry surface's count line, every
feasibility sentence.

```ts
/**
 * The roster entries a banlist actually excludes, sorted by `name` for display.
 *
 * The length of the returned array is `|B ∩ rosterIds|` — the same figure
 * `checkFeasibility` reports as `banCount`. A duplicate id counts once and an id that is
 * not in the roster counts zero, so this is the only correct source of a displayed ban
 * count anywhere in the UI. `bans.length` is never that number.
 */
export function bannedEntries(
  entries: readonly RosterEntry[],
  bans: readonly string[],
): RosterEntry[] {
  const banned = new Set(bans);
  // `filter` allocates, so the sort below runs on a fresh array and `entries` is untouched.
  return entries.filter((entry) => banned.has(entry.id)).sort(compareNames);
}
```

**Phase-4 addition:** `revealed.flatMap(r => r.monIds).length` is *also* wrong, because a
collision is two submissions and one banned species.

---

### The schema bump — four sites, and the one that is a test rather than code

**Source:** `migrate.ts:48`, `persistence.ts:255-263`, `store.ts:286`, `import-guard.ts:903`
and `:946`.
**Apply to:** the whole 3 → 4 change.

The wrapper site is bump-proof by construction because it asks the list:

```ts
  const wrapperVersion = parsed['schemaVersion'];
  if (typeof wrapperVersion !== 'number') return null;
  if (!SUPPORTED_SCHEMA_VERSIONS.includes(wrapperVersion)) return null;
```

with its own warning comment above it (`persistence.ts:247-260`):

> This is the THIRD `schemaVersion` compare site ... `SUPPORTED_SCHEMA_VERSIONS` is asked rather
> than `SCHEMA_VERSION` compared precisely so that every bump moves this site by definition
> rather than by remembering to.

**So the risk is the test.** The template is `tests/adapters/persistence.test.ts:518-575`:

```ts
/** The wrapper record Phase 2 wrote — `schemaVersion: 2` on the WRAPPER. */
function v2Record(): string {
  return JSON.stringify({ schemaVersion: 2, generation: 3, savedAt: 0, doc: v2Doc() });
}

describe('a draft saved by Phase 2', () => {
  it('is still offered as a resumable draft after the schema 3 bump', () => {
    // The failure this pins is invisible to every import-only test: the WRAPPER version is
    // compared a step before `isValidTournament`, so a version list that did not move with
    // the bump drops the record here and `Resume saved draft` silently never appears.
    storage.backing.set(STORAGE_KEY, v2Record());

    expect(load()).not.toBeNull();
  });
```

Phase 4 adds `describe('a draft saved by Phase 3')` with a `v3Record()` helper. `04-RESEARCH.md`
§Discretion 6 lists the six shipped assertions that break on the bump.

---

### Test conventions

**Source:** `vite.config.ts` `test.environment: 'node'`; `tests/ui/ban-mode.test.tsx:1`;
`LiveRegion.tsx:13`.

**Core test header** (`tests/core/selectors.test.ts:1-11`) — states what boundary the file pins,
not just what it checks:

```ts
/**
 * Selectors — every piece of derived data, and nothing stored.
 *
 * Sync rule 3: the available pool, the teams, the current turn and completion are all
 * computed from the folded log. None of them is a field. These tests exist as much to
 * pin that boundary as to check the arithmetic ...
 *
 * Zero mocks, as everywhere in `src/core`.
 */
```

**UI test opt-in — first line of the file, before the doc block**
(`tests/ui/ban-mode.test.tsx:1`):

```ts
// @vitest-environment happy-dom
```

**Hoisted fixture for `vi.mock` factories** (`tests/ui/ban-mode.test.tsx:26`):

```ts
/** Hoisted so both `vi.mock` factories below can see it — `vi.mock` lifts above imports. */
const fixture = vi.hoisted(() => { ... });
```

**Live-region reset in `beforeEach`** (`tests/ui/ban-mode.test.tsx:135-136`, and the same two
lines in eight other UI test files):

```ts
  // `announce` writes a module-level signal that outlives every render.
  announce('');
```

**Adapter test posture — drive the transition, do not inspect the listener**
(`tests/adapters/tab-lock.test.ts:508-512`):

```ts
    // The recovery is driven rather than inspected. `pageshow` calls `claim()` on a
    // bfcache restore, and `claim()` refuses unless the status is idle — so if `release()`
    // abandoned the window instead of resolving it, this second protocol run does nothing
    // and the tab never owns anything again.
```

Phase 4 does **both**: drive `onLock` in a `node` selector test, and fire real synthetic events
in one `happy-dom` adapter test. The synthetic-event forms are new — see §No Analog Found.

---

## No Analog Found

Three things have no close match in this codebase. The planner should use `04-RESEARCH.md`'s
prescriptions, which give each of them verbatim.

| File / unit | Role | Data Flow | Reason | Fall back to |
|-------------|------|-----------|--------|--------------|
| `selectBanOrder` — the serpentine derivation (D-12) | selector (pure fn) | transform | **No serpentine exists anywhere.** A grep for `snake\|serpentine\|reverse()` across `src/core` and `src/ui` returns only the `BanMode` literal, `import-guard.ts:279`'s `BAN_MODES`, `ConfigScreen.tsx:278`'s disabled label, and `selectSwapRoundOrder`'s single `[...].reverse()` at `selectors.ts:577` | `04-RESEARCH.md` §Serpentine Order Derivation — full body plus the eight tests to pin. Signature shape from `selectStartingOrder:810`; empty-guard and `undefined`-skip habits from `selectCardPlayOrder:402`; copy-before-`reverse()` from `selectSwapRoundOrder:575` |
| `undoAnnouncement`'s `const exhaustive: never` default | store / copy composer | transform | **No `never`-typed exhaustiveness default ships in `src/`.** The closest shipped idiom is a `switch` over a string-literal union with no default, where the declared return type errors on an omission — `matchesMega` (`search.ts:136`) and `poolSizeForPreset` (`feasibility.ts:586`) | `04-RESEARCH.md` §The exhaustive undo announcement — the whole rewritten function including the three ban arms that name no species |
| `tests/adapters/ban-shield.test.ts` synthetic-event forms | test — adapter | happy-dom | **No shipped test dispatches a real `pageshow` or `visibilitychange`.** `tab-lock.test.ts` deliberately leaves `installLifecycle` untested and drives `claim()`/`release()` directly. And `new PageTransitionEvent('pageshow', { persisted: true }).persisted` is `undefined` under the installed `happy-dom@20.11.1` — measured, not recalled | `04-RESEARCH.md` §The test seam and §The bfcache test that actually tests something — the working forms are `Object.assign(new Event('pageshow'), { persisted: true })` and `Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })`. Both polarities must be asserted. File header style from `tests/adapters/tab-lock.test.ts:1-19` |

**Partial analogs worth naming rather than omitting:**

- **`BlindEntry` as a surface outside both shells.** No shipped screen renders outside
  `.app-shell` and `.draft-shell` — `StorageBlocked.tsx` is a `Dialog`, not a shell escape. The
  closest structural precedent is `CompletedDraft.tsx`, which *replaces one pane and nothing
  else* and states why. `BlindEntry` replaces the whole shell instead, which is new; the
  `app.css:73` / `:114` shell definitions are the two it must not use.
- **`BanReveal` as a per-player attribution list.** `CompletedDraft.tsx` renders per-player
  blocks from selector output with one primary action and mounts `CheckpointPrompt`
  (`CompletedDraft.tsx:105`) — that mount is also the analog for D-09's deferred PERS-06
  checkpoint firing after the reveal.

---

## Metadata

**Analog search scope:** `src/core/`, `src/adapters/`, `src/ui/`, `src/store.ts`, `src/app.tsx`,
`tests/core/`, `tests/adapters/`, `tests/ui/`
**Files scanned:** 33 read in full or by targeted range; 148 enumerated
**Every line number in this document was resolved by `grep -n` against working-tree HEAD
(`8cffabd`) this session.** Where `04-CONTEXT.md` cites a Phase-2 line number, the current one is
used instead and `04-RESEARCH.md` §Discretion 6 records the drift.
**Pattern extraction date:** 2026-08-20
