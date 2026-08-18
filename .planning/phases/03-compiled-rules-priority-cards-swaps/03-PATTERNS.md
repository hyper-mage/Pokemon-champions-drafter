# Phase 3: Compiled Rules, Priority Cards, Swaps — Pattern Map

**Mapped:** 2026-08-17
**Files analyzed:** 47 (12 new source, 6 new test, 29 modified)
**Analogs found:** 45 / 47
**Analog search scope:** `src/core/**`, `src/ui/**`, `src/adapters/**`, `src/store.ts`, `tests/**`
**Line numbers current at:** `f5ee08f`

> **How to read this.** Every new file in this phase has a sibling already in the repository that
> solves the same problem in the same layer. Nothing here is a new architectural shape. Where a
> file is *modified*, the analog is **in-file**: the existing sibling case (the `pool/built` arm,
> the `notEnoughMegas` code, the `V1_CONFIG_DEFAULTS` table) is the shape the new one copies.
>
> Three CI gates make some of these mandatory rather than advisory: `npm run check:pure`
> (no DOM/clock/randomness/network/storage/`preact` under `src/core/`), `npm run check:nohtml`
> (no `innerHTML` anywhere under `src/`), and `npm run verify` as the single pre-commit gate.

---

## File Classification

### New source files

| New file | Role | Data flow | Closest analog | Match |
|----------|------|-----------|----------------|-------|
| `src/core/compile.ts` | core rule module | transform (config → `RoundSpec[]`) | `src/core/bans.ts` + `src/core/model.ts:54-64` (`BanMode` union) | role-match |
| `src/core/mega.ts` | core predicate module | transform (entry + bans → boolean) | `src/core/bans.ts` | **exact** |
| `src/core/cards.ts` | core algorithm module | transform (hands + used set → legal set) | `src/core/draw.ts` | role-match |
| `src/ui/components/SchedulePreview.tsx` | component (config form) | event-driven (row reorder) | `src/ui/components/PlayerList.tsx` | **exact** |
| `src/ui/components/SchedulePreview.css` | stylesheet | — | `src/ui/components/BanChipList.css` | **exact** |
| `src/ui/components/CardFace.tsx` | component (leaf control) | request-response (click → dispatch) | `src/ui/components/BanChipList.tsx` chip button + `SplitPanes.tsx:265-331` inert shape | role-match |
| `src/ui/components/CardFace.css` | stylesheet | — | `src/ui/components/BanChipList.css` | **exact** |
| `src/ui/components/CardPanel.tsx` | component (pane surface) | event-driven | `src/ui/screens/CompletedDraft.tsx` | **exact** |
| `src/ui/components/CardPanel.css` | stylesheet | — | `src/ui/components/BanChipList.css` | **exact** |
| `src/ui/components/HandStrip.tsx` | component (presentational) | read-only render | `src/ui/components/StatBlock.tsx` | **exact** |
| `src/ui/components/HandStrip.css` | stylesheet | — | `src/ui/components/BanChipList.css` | **exact** |
| `src/ui/components/SwapPanel.tsx` | component (pane surface) | event-driven | `src/ui/screens/CompletedDraft.tsx` | **exact** |
| `src/ui/components/SwapPanel.css` | stylesheet | — | `src/ui/components/BanChipList.css` | **exact** |

### New test files

| New file | Role | Data flow | Closest analog | Match |
|----------|------|-----------|----------------|-------|
| `tests/core/compile.test.ts` | test (core) | table-driven pure fn | `tests/core/draw.test.ts` | **exact** |
| `tests/core/mega.test.ts` | test (core) | predicate over real snapshot | `tests/core/bans.test.ts` | **exact** |
| `tests/core/cards.test.ts` | test (core) | selector over a built doc | `tests/core/selectors.test.ts` | **exact** |
| `tests/core/swaps.test.ts` | test (core) | reducer + `canApply` | `tests/core/reduce.test.ts` | **exact** |
| `tests/ui/card-play.test.tsx` | test (ui) | render + interaction | `tests/ui/draft-board.test.tsx` | **exact** |
| `tests/ui/schedule-reorder.test.tsx` | test (ui) | render + interaction | `tests/ui/config-screen.test.tsx` | **exact** |

### Modified files — analog is the in-file sibling

| Modified file | Role | What lands | In-file analog |
|---------------|------|-----------|----------------|
| `src/core/model.ts` | model | `SCHEMA_VERSION` → 3; 4 config fields; 3 `DraftState` fields | `DualMegaChoice` (`:106`), `copyConfig` (`:207`) |
| `src/core/actions.ts` | model | 5 action families × 5 parts each | `PoolBuiltPayload` (`:59`) + `poolBuilt` (`:131`) + `isPoolBuiltAction` (`:184`) |
| `src/core/reduce.ts` | reducer | 5 `apply` arms, 5 `canApply` arms, ~7 reasons | `DRAFT_PICK_MADE` arms (`:86`, `:153`) |
| `src/core/selectors.ts` | selector | ~10 selectors; `selectCurrentTurn` rewritten | `selectTeams` (`:63`), `selectAvailablePool` (`:40`) |
| `src/core/feasibility.ts` | validation | 3 codes + `notEnoughMegas` re-measured | `notEnoughMegas` (`:83`, `:205`, `:366`) |
| `src/core/draw.ts` | core algorithm | stage-1 partition on eligibility | `DrawInput` (`:44`), `drawPool:113-114` |
| `src/core/search.ts` | core filter | 1 field + 1 clause | `matchesMega` (`:108`), the written seam (`:184-195`) |
| `src/core/undo.ts` | core | "last pick" → "last undoable"; compound removal | `lastPickIndex` (`:49`), `RoundBoundaryCrossing` (`:104`) |
| `src/core/migrate.ts` | migration | `V2_CONFIG_DEFAULTS` + `migrateV2ToV3` | `V1_CONFIG_DEFAULTS` (`:46`), `migrateV1ToV2` (`:120`) |
| `src/core/import-guard.ts` | validation | 5 `switch` arms + 4 config fields + bounds | `case 'pool/built'` (`:478`) |
| `src/store.ts` | orchestration | `CreateTournamentInput.schedule`; 3rd dispatch | `createTournament` (`:196`) |
| `src/adapters/persistence.ts` | adapter | third `schemaVersion` compare site | its own existing compare |
| `src/ui/screens/ConfigScreen.tsx` | screen | 2 sub-sections + 1 group; corrected comment | `Bans` fieldset (`:840-898`) |
| `src/app.tsx` | routing | card-play step, swap-round state | pool-pane branch (`:1067-1088`) |
| `src/ui/components/BoardGrid.tsx` `.css` | component | typed round headers | `.board__round` (`BoardGrid.css:66`) |
| `src/ui/components/TeamStrip.tsx` | component | hand strip in the label cell | `:44` `board__label` |
| `src/ui/components/MonChip.tsx` `.css` | component | `swappable` button mode | `nameText` single-derivation (`:44`) |
| `src/ui/components/TurnBanner.tsx` `.css` | component | 3 headline strings + phase line | `spoken` (`:71-85`) |
| `src/ui/components/PoolGrid.tsx` | component | Mega-ban mode, restriction line, 3 empty states | its existing `bannedIds` mode |
| `src/ui/components/FilterBar.tsx` | component | Mega control inert with reason | `matchAllInert` (`:113`, `:212`) |
| `src/ui/components/MonCard.tsx` | component | accepts a `MegaForme` | its `RosterEntry` prop |
| `src/ui/components/TopBar.tsx` | component | `Undo last move` | its existing label constant |
| `src/ui/components/SplitPanes.tsx` | component | 2 new inert reasons | `PaneAvailability` (`:101`), `POOL_EXPAND_REASON` (`:86`) |
| `src/ui/confirm-copy.ts` | copy module | 3 new sets | `UNDO_BOUNDARY_CONFIRM` (`:146`) |
| `src/ui/tokens.css` | config | `--card-min: 64px` | `--pill-h` (`:85`) |

---

## Shared Patterns

These apply across many new files. Each is cited once here and referenced by the per-file sections.

### S-1. A new action lands in **five** places, and a payload field in **four**

**Source:** `src/core/actions.ts` (the whole file is the template) + `src/core/import-guard.ts:478`
**Apply to:** `schedule/compiled`, `cards/played`, `order/resolved`, `swap/made`, `swap/passed`

Constant → payload interface → `Intent` member → creator (payload only) → structural guard.
`actions.ts:19` / `:59-68` / `:94-98` / `:131-139` / `:184-193`:

```typescript
export const POOL_BUILT = 'pool/built';

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

export type Intent =
  | PoolBuiltPayload
  | DraftStartedPayload
  | PickMadePayload
  | PickUndonePayload;

export function poolBuilt(
  ids: readonly string[],
  rosterVersion: string,
  checksum: string,
  seed: number,
  megaCapableCount: number,
): PoolBuiltPayload {
  return { type: POOL_BUILT, ids: [...ids], rosterVersion, checksum, seed, megaCapableCount };
}

export function isPoolBuiltAction(action: AnyAction): action is PoolBuiltAction {
  if (action.type !== POOL_BUILT || !isRecord(action)) return false;
  return (
    isStringArray(action['ids']) &&
    typeof action['rosterVersion'] === 'string' &&
    typeof action['checksum'] === 'string' &&
    isSafeInteger(action['seed']) &&
    isSafeInteger(action['megaCapableCount'])
  );
}
```

The **fourth place a payload field must land** is `import-guard.buildLogEntry` (`import-guard.ts:478-504`),
which rebuilds every action field by field. A field it does not name is silently dropped on
export → import round trip:

```typescript
    case 'draft/pickMade': {
      const playerId = raw['playerId'];
      const monId = raw['monId'];
      const round = raw['round'];
      const pickIndex = raw['pickIndex'];
      if (typeof playerId !== 'string' || typeof monId !== 'string') return null;
      if (!isPositiveInteger(round) || !isNonNegativeInteger(pickIndex)) return null;
      return { type: 'draft/pickMade', playerId, monId, round, pickIndex, ...envelope };
    }
```

The creators take **no envelope**. `dispatch` stamps `seq`, `at`, `actorId` at the impure edge
(`store.ts:117-122`), and `nextSeq` is `max(seq) + 1`, never `log.length` (`store.ts:102-108`).

### S-2. `apply` / `canApply` are two arms, never one

**Source:** `src/core/reduce.ts`
**Apply to:** every new action type

`apply` is total and guards first (`reduce.ts:86-101`); `canApply` returns the **first** failure
(`reduce.ts:153-169`). Note the in-place-replace shape at `:103-118` — that is the analog for
`apply(SWAP_MADE)`, which must **replace** the pick rather than append (Research Pitfall 4):

```typescript
    case DRAFT_PICK_MADE: {
      if (!isPickMadeAction(action)) return state;
      return {
        ...state,
        picks: [
          ...state.picks,
          { playerId: action.playerId, monId: action.monId,
            round: action.round, pickIndex: action.pickIndex, seq: action.seq },
        ],
      };
    }

    case DRAFT_PICK_UNDONE: {
      if (!isPickUndoneAction(action)) return state;
      const remaining = state.picks.filter((pick) => pick.seq !== action.targetSeq);
      if (remaining.length === state.picks.length) return state;
      return { ...state, picks: remaining };
    }
```

```typescript
    case DRAFT_PICK_MADE: {
      if (!isPickMadeAction(action)) return reject('malformedPayload');
      if (state.order.length === 0) return reject('draftNotStarted');
      if (selectIsComplete(state)) return reject('draftComplete');

      const turn = selectCurrentTurn(state);
      if (turn === null) return reject('draftComplete');
      if (action.playerId !== turn.playerId) return reject('notYourTurn');
      if (action.round !== turn.round || action.pickIndex !== turn.pickIndex) {
        return reject('wrongSlot');
      }
      if (!selectAvailablePool(state).includes(action.monId)) return reject('notInPool');
      return OK;
    }
```

`RejectionReason` (`reduce.ts:41-55`) is a flat string union; add the ~7 new members there.

### S-3. Selector signature and the "nothing derived is stored" rule

**Source:** `src/core/selectors.ts`
**Apply to:** all ~10 new selectors

Every selector takes `state: DraftState` first, returns a **freshly built** array/object, reads
`state.config.rounds` (never a literal `6`), and sorts with a hand-written comparator rather than
`localeCompare`. `selectors.ts:40-79`:

```typescript
export function selectAvailablePool(state: DraftState): string[] {
  const taken = new Set(state.picks.map((pick) => pick.monId));
  return state.poolIds.filter((id) => !taken.has(id));
}

function compareIds(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function selectTeams(state: DraftState): Record<string, (string | null)[]> {
  const teams: Record<string, (string | null)[]> = {};
  for (const playerId of playerIdsInOrder(state)) {
    teams[playerId] = Array.from({ length: state.config.rounds }, () => null);
  }
  for (const pick of state.picks) {
    const slots = teams[pick.playerId];
    if (slots === undefined) continue;
    const slotIndex = pick.round - 1;
    if (slotIndex < 0 || slotIndex >= slots.length) continue;
    slots[slotIndex] = pick.monId;
  }
  return teams;
}
```

`selectTeams`'s `pick.round - 1` is the join D-08 uses for `selectSlotKind`. Computation-local
`Set`s are the shipped pattern; a `Set` is never returned or stored.

### S-4. Component + stylesheet pairing

**Source:** `src/ui/components/BanChipList.tsx` + `BanChipList.css`
**Apply to:** all five new components

Import order: types → components → `import './X.css'` last. One stylesheet per component, beside
it, tokens only, no `:focus` rule (the global accent ring in `app.css` owns it), motion budget
≤ 120 ms colour-only. `BanChipList.tsx:1-3, 42-64`:

```typescript
import type { RosterEntry } from '../../core/roster/types';

import './BanChipList.css';

export interface BanChipListProps {
  /** Already name-sorted by `bannedEntries`. This component does not sort. */
  banned: readonly RosterEntry[];
  onRemove: (entry: RosterEntry) => void;
}

export function BanChipList({ banned, onRemove }: BanChipListProps) {
  if (banned.length === 0) return null;

  return (
    <ul class="ban-chip-list">
      {banned.map((entry) => (
        <li key={entry.id} class="ban-chip-list__item">
          <button
            type="button"
            class="ban-chip"
            aria-label={`Remove ${entry.name} from the banlist`}
            onClick={() => onRemove(entry)}
          >
            <span class="ban-chip__name">{entry.name}</span>
            <span class="ban-chip__glyph" aria-hidden="true">×</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
```

`BanChipList.css` — the whole stylesheet is the template (tokens only, no raw hex, no raw px):

```css
.ban-chip {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--target-min);
  padding: 0 var(--space-3);
  background: var(--color-surface-raised);
  color: var(--color-text);
  border: var(--hairline-w) solid var(--color-border-strong);
  border-radius: var(--radius);
  font: var(--text-label);
  cursor: pointer;
  /* Motion budget: colour only, at most 120ms. No layout or entrance animation. */
  transition: background-color 120ms ease;
}
```

**Key it by `id`, never by name or index** (`key={entry.id}`) — CLAUDE.md §Identity.

### S-5. Inert-with-a-reason, and shedding the ARIA when the condition lifts

**Source:** `src/ui/components/SplitPanes.tsx:101, 265-331`; `FilterBar.tsx:113, 212-220`
**Apply to:** the inert Mega filter (D-16), unplayable cards (D-21), inert reorder buttons (D-14),
two new pane-expand reasons (Amendment 3)

The union makes "unavailable with no reason given" unrepresentable (`SplitPanes.tsx:101`):

```typescript
type PaneAvailability = { available: true } | { available: false; reason: string };
```

The control keeps **one vnode shape** across the boundary — a bare button in one branch and a
Fragment in the other unmounts the node and drops focus to `<body>` (`SplitPanes.tsx:251-257`).
`aria-disabled`, never native `disabled`, because the explanation is the whole reason for
rendering the control (`SplitPanes.tsx:311-315, 318-331`):

```typescript
    const reasonId = `${key}-expand-reason`;
    const isInert = !collapsed && !availability.available;
    const reason = availability.available ? null : availability.reason;
    const showReason = !collapsed && reason !== null;
    ...
              <button
                type="button"
                class="pane__button"
                aria-disabled={isInert ? 'true' : undefined}
                aria-describedby={showReason ? reasonId : undefined}
```

The `undefined` (not `'false'`) is what sheds the ARIA — that is WR-04, and this phase adds four
consumers of it. The handler must return early or the attribute lies (`FilterBar.tsx:213-219`):

```typescript
          aria-disabled={matchAllInert ? 'true' : undefined}
          onChange={(event) => {
            if (matchAllInert) {
              event.currentTarget.checked = value.matchAll;
              return;
            }
```

### S-6. Copy lives in a module constant or a composer, never inline in JSX

**Source:** `src/ui/confirm-copy.ts`; `src/core/feasibility.ts:153-217`; `BoardGrid.tsx:52-54`
**Apply to:** every new string in the 03-UI-SPEC Copywriting Contract

JSX collapses whitespace between text lines, and these are contracts asserted on exact equality.
`confirm-copy.ts:46-48, 146-156` — and note the `removedCount > 1` clause that D-20 makes live:

```typescript
function bans(count: number): string {
  return count === 1 ? '1 ban' : `${count} bans`;
}

export const UNDO_BOUNDARY_CONFIRM = {
  heading: 'Undo a pick from an earlier round?',
  tone: 'default' as const,
  confirmLabel: 'Undo the pick',
  safeLabel: 'Keep the pick',
  body: (playerName: string, pickRound: number, currentRound: number, removedCount: number): string => {
    const first = `This undoes ${playerName}'s pick from round ${pickRound}, and the draft is currently on round ${currentRound}.`;
    if (removedCount <= 1) return first;
    return `${first} Picks made after it are undone too — ${removedCount} in total.`;
  },
};
```

Feasibility messages are module constants or single-purpose composers (`feasibility.ts:205-213`):

```typescript
function notEnoughMegasMessage(
  players: number, megasPerTeam: number, needed: number, available: number, bans: number,
): string {
  return `Not enough Mega-capable Pokémon. ${players} players × ${megasPerTeam} Megas needs ${needed}; ${available} are draftable after ${bans} bans.`;
}
```

### S-7. Core test file header — zero mocks, real snapshot, node environment

**Source:** `tests/core/bans.test.ts:1-34`
**Apply to:** `compile.test.ts`, `mega.test.ts`, `cards.test.ts`, `swaps.test.ts`, and the
feasibility / migrate / import-guard additions

```typescript
/**
 * bannedEntries — the one ban derivation, and the tripwire that pins it to the gate.
 * ...
 * Real ids from the committed snapshot, zero mocks, and no import of `src/store.ts` — the
 * observable payoff of the purity rule.
 */

import { describe, expect, it } from 'vitest';

import committedSnapshot from '../../public/data/roster.mb.json';
import { bannedEntries } from '../../src/core/bans';
import { checkFeasibility } from '../../src/core/feasibility';
import type { RosterEntry, RosterSnapshot } from '../../src/core/roster/types';

const SNAPSHOT = committedSnapshot as unknown as RosterSnapshot;
const ENTRIES: readonly RosterEntry[] = SNAPSHOT.entries;
```

No `// @vitest-environment` line — `node` is the default and core must not reach a DOM.

### S-8. UI test file header — `happy-dom` on the FIRST line, `announce` reset

**Source:** `tests/ui/draft-board.test.tsx:1-36`
**Apply to:** `card-play.test.tsx`, `schedule-reorder.test.tsx`, and every UI test touched

```typescript
// @vitest-environment happy-dom

/**
 * ... What this file cannot prove: happy-dom performs no layout. Whether eight rows fit the
 * split board pane without an internal scrollbar ... belong to this plan's human-verify
 * checkpoint. Nothing here measures a pixel.
 */

import { render } from 'preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
...
import { announce } from '../../src/ui/components/LiveRegion';
```

`announce` is a module-level signal that outlives any render — a test touching the live region
resets it in `beforeEach`. DRFT-14 assertions 9–12 are **physical** checks, not happy-dom ones.

### S-9. Document builder for selector/reducer tests

**Source:** `tests/core/selectors.test.ts:45-95`
**Apply to:** `cards.test.ts`, `swaps.test.ts`

```typescript
const CONFIG: TournamentConfig = { /* every field, explicitly */ };

function stamp(intent: Intent, seq: number): Action {
  return { ...intent, seq, at: CREATED_AT + seq, actorId: 'host' };
}

function makeDoc(log: readonly Action[]): TournamentDoc {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'tournament-fixture',
    createdAt: CREATED_AT,
    config: CONFIG,
    rng: { seed: 1, cursor: 0 },
    log: [...log],
  };
}

function stateAfter(count: number) {
  const log: Action[] = [
    stamp(poolBuilt(POOL, CONFIG.rosterVersion, CONFIG.rosterChecksum, 7, 0), 0),
    stamp(draftStarted(ORDER, 9), 1),
  ];
  ...
  return fold(makeDoc(log));
}
```

`CONFIG` at `:45-60` gains the four new fields in the same edit that bumps `SCHEMA_VERSION`, in
**every** test file that declares one.

---

## Pattern Assignments — Unit A (Compiler)

### `src/core/compile.ts` (core rule module, transform) — NEW

**Analog:** `src/core/bans.ts` for the module shape; `src/core/model.ts:54-64` for the union.

**Why:** `bans.ts` is the closest existing "one pure derivation the whole app reads, with the
argument for its own existence in the doc block" module. `BanMode` is the closest existing
string-literal union whose members are persisted into a document and therefore "closer to an API
than to a label" — which is exactly `CompositionRule`'s and `RoundKind`'s situation, and where
D-03's pick-guard doc comment attaches.

**Union-with-per-member-comment pattern** (`model.ts:46-64`) — copy this shape for
`CompositionRule` and `RoundKind`, and hang the D-03 four-part comment off the union itself:

```typescript
/**
 * How Pokémon leave the pool before the first pick.
 *
 * A string-literal union rather than a boolean pair or an enum, and every member carries
 * its own comment, because these exact strings are written into a saved document and read
 * back by a later build. That makes them closer to an API than to a label: renaming one
 * breaks every tournament already on disk.
 */
export type BanMode =
  /** The host names the bans up front and everyone can see them. Phase 2 runs only this. */
  | 'hostBanlist'
  /** Every player submits bans privately ... Phase 4 builds it ... */
  | 'blind'
  /** Players take turns banning in snake order. Phase 4, disabled in Phase 2 (D-12). */
  | 'snake';
```

**Total pure function pattern** (`bans.ts:65-72`) — `compile(rules, rounds)` returns a fresh array,
never throws, and takes ambient data as an argument:

```typescript
export function bannedEntries(
  entries: readonly RosterEntry[],
  bans: readonly string[],
): RosterEntry[] {
  const banned = new Set(bans);
  // `filter` allocates, so the sort below runs on a fresh array and `entries` is untouched.
  return entries.filter((entry) => banned.has(entry.id)).sort(compareNames);
}
```

**Do not** put a `predicate` function field on `CompositionRule` — `model.ts:15-19` forbids any
non-serializable field in a config type.

---

### `src/core/mega.ts` (core predicate module, transform) — NEW

**Analog:** `src/core/bans.ts` — **exact match**. Same role (a pure predicate over roster entries
plus a host-authored ban list), same data flow, same computation-local `Set`, same identity rule.

**Why this and not `search.ts`:** `matchesMega` in `search.ts:108-117` is a *view preference*
predicate; `isMegaEligible` is a *rule*. `bans.ts` is the rule-shaped sibling, and its module
comment already states the two traps this file inherits verbatim.

**Module doc-block pattern to copy** (`bans.ts:28-45`):

```typescript
/**
 * ## The sort is display order and nothing else
 *
 * Membership, removal and every comparison anywhere in the application stay keyed on `id`
 * (CLAUDE.md §Identity). Nothing here splits, slices or separator-indexes a name —
 * `Tauros-Paldea-Aqua` and `Mr. Rime` both punish that, and `Kommo-o` is a base species with
 * a hyphen in it.
 * ...
 * Pure, like everything under `src/core`. The `Set` below is computation-local and is never
 * returned or stored (CLAUDE.md §Serializability) — a banlist that persisted as a `Set` would
 * not survive `JSON.stringify` → `JSON.parse` ...
 */
```

**The types it reads** (`src/core/roster/types.ts:68-77`) — `forme` is the field the X/Y pin
compares. Never `includes('mega')` (returns Meganium), never `split('-')`:

```typescript
/** A legal Mega forme, folded onto the draftable entry it belongs to. */
export interface MegaForme {
  id: string;
  name: string;
  forme: string;
  /** The Mega Stone. Always present — a Mega with no stone is not a Mega. */
  requiredItem: string;
  spriteId: string | null;
  types: string[];
  baseStats: BaseStats;
}
```

---

### `src/core/model.ts` (model) — MODIFIED

**Analog:** in-file. `DualMegaChoice` (`:89-109`) is the shape for any new config array;
`copyConfig` (`:207-224`) is the pattern every new field must land in.

**Config-array pattern — array of records, never `Record<>`** (`model.ts:89-100`):

```typescript
/**
 * An ARRAY of `{ speciesId, forme }` rather than a `Record<speciesId, forme>`, for two
 * reasons that are both structural:
 *
 *   1. ARCHITECTURE sync rule 14 forbids deriving anything order-sensitive from
 *      `Object.keys()`, and a record invites exactly that when the choices are rendered.
 *   2. A record's key count is unbounded, which makes it an unbounded allocation the
 *      import guard would have to bound with a bespoke check.
 */
```

**`copyConfig` — element by element, and the reason** (`model.ts:197-224`):

```typescript
/**
 * Deep copy of config, so folded state can never alias the caller's object.
 *
 * Every array is copied ELEMENT BY ELEMENT, and that is not stylistic. TypeScript checks
 * this function for a field it forgot ... but it cannot see a shallow
 * copy: `bans: config.bans` type-checks and quietly shares one array between the caller
 * and the folded state. `initialState` runs this on every `fold`, and `fold` runs on
 * every undo, so a shared array shows up as undoing a pick changing the banlist.
 */
function copyConfig(config: TournamentConfig): TournamentConfig {
  return {
    ...
    bans: config.bans.map((id) => id),
    dualMegaChoices: config.dualMegaChoices.map((choice) => ({
      speciesId: choice.speciesId,
      forme: choice.forme,
    })),
    depth: config.depth,
  };
}
```

`rules`, `megaFormeBans` copy element by element; `swapBudget` and `swapRounds` are scalars.

**`DraftState` additions** follow `poolIds` / `order` (`model.ts:186-195`) — materialized results,
`[]` from `initialState` (`:227-236`).

---

### `src/core/actions.ts` (model) — MODIFIED

**Analog:** in-file `PoolBuiltPayload` — see **S-1** for the full five-part excerpt.

`schedule/compiled` is Pattern 5 for the same reason `pool/built` is, and its doc comment should
sit where `PoolBuiltPayload`'s does (`actions.ts:38-58`).

**Correct the stale comment in the same change** (`actions.ts:44-47`):

> `doc.rng` is a single `{ seed, cursor }` reserved for the pure generator that Phase 3's
> priority-card tie-breaks will advance

D-22 breaks ties with `(value, seq)` and consumes no randomness. `store.ts:183-187` repeats the
same claim and needs the same fix.

---

### `src/core/reduce.ts` (reducer) — MODIFIED

**Analog:** in-file — see **S-2**.

New `RejectionReason` members go in the flat union at `:41-55`, which already carries the exact
vocabulary shape (`'poolAlreadyBuilt'`, `'poolNotBuilt'`, `'wrongSlot'`). The three schedule
reasons (`scheduleAlreadyCompiled`, `scheduleNotCompiled`, `malformedSchedule`) mirror the
pool pair exactly.

`canApply` does **not** run on fold (`reduce.ts:198-200`), so a `canApply(DRAFT_STARTED)` guard on
`scheduleNotCompiled` cannot break migrated schema-2 documents:

```typescript
export function fold(doc: TournamentDoc): DraftState {
  return doc.log.reduce<DraftState>(apply, initialState(doc.config));
}
```

---

### `src/core/feasibility.ts` (validation) — MODIFIED

**Analog:** in-file `notEnoughMegas` — the code (`:83`), the message composer (`:205-213`), the
precedence row (`:137`), and the check (`:366-379`). All four move together.

**The four-part addition shape** (`feasibility.ts:63-85`, `:127-139`, `:260-266`, `:366-379`):

```typescript
export type FeasibilityCode =
  ...
  /** The Megas-per-team field is empty, fractional, unsafe, or negative. */
  | 'megasRequiredNotAnInteger'
  ...
  /** Satisfiable but degenerate: the last picker of the last round has one option. */
  | 'poolExactlyMinimum';

const PRECEDENCE: readonly FeasibilityCode[] = [
  'tooFewPlayers', 'blankPlayerName', 'duplicatePlayerName', 'poolSizeNotAnInteger',
  'megasRequiredNotAnInteger', 'megasExceedRounds', 'tooManyPlayersForRoster',
  'poolTooLarge', 'poolTooSmall', 'notEnoughMegas', 'poolExactlyMinimum',
];

function blocking(code: FeasibilityCode, message: string): FeasibilityProblem {
  return { code, severity: 'blocking', message };
}
function warning(code: FeasibilityCode, message: string): FeasibilityProblem {
  return { code, severity: 'warning', message };
}
```

**The `number | null` rule the two new numeric fields inherit** (`feasibility.ts:11-18`, `:301-305`):

```typescript
  const megasRequiredMalformed =
    asSafeInteger(input.megasRequiredPerTeam, 0, Number.MAX_SAFE_INTEGER) === null;
  const megasPerTeam = megasRequiredMalformed
    ? null
    : asSafeInteger(input.megasRequiredPerTeam, 0, rounds);
```

`swapBudget: number | null` and `swapRounds: number | null` in `FeasibilityInput` (`:94-103`);
`megaEligibleLegalCount: number` added to `FeasibilityResult` beside `megaCapableLegalCount`
(`:105-115`) — the file's own comment at `:111` argues that a derivable-looking pair must be
two fields.

**Set-membership counting, never `bans.length`** (`feasibility.ts:277-287`) — the Mega-forme ban
count follows this identically:

```typescript
  const banned = new Set(bannedIds);
  const legalCount = entries.reduce(
    (total, entry) => (banned.has(entry.id) ? total : total + 1), 0);
  const megaCapableLegalCount = entries.reduce(
    (total, entry) => (entry.megaCapable && !banned.has(entry.id) ? total + 1 : total), 0);
  const banCount = entries.length - legalCount;
```

---

### `src/core/draw.ts` (core algorithm) — MODIFIED

**Analog:** in-file. `DrawInput` (`:44-53`) is where `megaEligibleIds: readonly string[]` lands,
data-shaped like `bannedIds` elsewhere. The change is one line at `:113-114`:

```typescript
  // Stage 1 — partition, preserving the input's display order inside each part.
  const megaCapable = candidates.filter((entry) => entry.megaCapable);
  const rest = candidates.filter((entry) => !entry.megaCapable);
```

becomes a partition on eligibility. **Do not touch** the two-stage structure or the uniformity
caveat at `:17-28`. `DrawResult` (`:55-67`) gains `megaEligibleCount` beside `megaCapableCount`;
the latter keeps its meaning and its `pool/built` field.

**Consequence to schedule:** the seed→pool mapping changes, so fixtures in `tests/core/draw.test.ts`
pinning specific drawn ids will change.

---

### `src/core/search.ts` (core filter) — MODIFIED

**Analog:** in-file — the seam is already written (`search.ts:184-195`). Follow it literally:
one field on `PoolFilters` (`:127-135`) **and** `CompiledPoolFilters` (`:138-143`), carried through
`compileFilters` (`:168-175`), one clause in `matchesFilters` (`:196-202`):

```typescript
export function matchesFilters(entry: RosterEntry, compiled: CompiledPoolFilters): boolean {
  return (
    matchesName(entry, compiled.key) &&
    matchesTypes(entry, compiled.types, compiled.matchAll) &&
    matchesMega(entry, compiled.mega)
  );
}
```

`MegaFilterMode` does **not** gain a fourth member (`search.ts:100-107` is the argument).
`hasActiveFilters` (`:216-218`) must **not** count the round restriction — it is a rule, not a
preference, and `Clear filters` cannot clear it.

---

### `src/core/migrate.ts` (migration) — MODIFIED

**Analog:** in-file `V1_CONFIG_DEFAULTS` (`:46-52`) + `migrateV1ToV2` (`:120-163`) + the arm chain
in `migrate` (`:183-192`).

**Defaults table pattern** (`migrate.ts:34-52`) — one place, imported by `import-guard.buildConfig`
rather than repeated:

```typescript
/**
 * What every version 2 config field is worth in a version 1 document.
 *
 * One place, and `import-guard.buildConfig` imports it rather than repeating the literals ...
 * two copies of a default table is two tables that can disagree about what a Phase 1
 * tournament was.
 */
export const V1_CONFIG_DEFAULTS = {
  bans: [],
  banMode: 'hostBanlist',
  megasRequiredPerTeam: 0,
  dualMegaChoices: [],
  depth: 'draftOnly',
} as const;
```

**Version arm chain** (`migrate.ts:32`, `:183-192`):

```typescript
export const SUPPORTED_SCHEMA_VERSIONS: readonly number[] = [1, 2];
...
  if (version === 2) return { ok: true, doc };
  if (version === 1) return { ok: true, doc: migrateV1ToV2(doc) };
```

becomes `[1, 2, 3]` with `version === 3` the identity passthrough, `version === 2` →
`migrateV2ToV3(doc)`, and `version === 1` → `migrateV2ToV3(migrateV1ToV2(doc))`.

**No log surgery.** `migrateV1ToV2` rewrote log entries only because `isPoolBuiltAction` requires
fields a v1 entry lacks (`:110-115`). Nothing in schema 3 makes an existing entry unfoldable, so
`migrateV2ToV3` touches config only and the empty schedule folds as all-open.

---

### `src/core/import-guard.ts` (validation) — MODIFIED

**Analog:** in-file `case 'pool/built'` (`:478-504`) — see **S-1** for the `draft/pickMade` arm.

**The posture to keep** (`import-guard.ts:507-510`):

```typescript
      // Bounded by the player cap rather than by `config.players`. Checking it against the
      // configured roster would be referential integrity, which this function deliberately
      // does not do — every entry is typed in isolation. A bound is not an integrity check.
```

`buildLog`'s `seq` rule (`:560-579`) is unchanged and must stay: strictly increasing, **gaps
allowed**, starts at 0.

---

### `src/store.ts` (orchestration) — MODIFIED

**Analog:** in-file `createTournament` (`:196-234`).

**Two dispatches become three, in order `pool/built → schedule/compiled → draft/started`**
(`store.ts:210-231`):

```typescript
  const pool = dispatch(
    poolBuilt(
      input.poolIds,
      input.config.rosterVersion,
      input.config.rosterChecksum,
      input.poolSeed,
      input.megaCapableCount,
    ),
  );

  const started = pool.ok
    ? dispatch(draftStarted(input.order, input.orderSeed))
    : pool;

  if (!started.ok) {
    docSignal.value = previousDoc;
    stateSignal.value = previousState;
    return null;
  }
```

The rollback branch must cover all three. `CreateTournamentInput` (`:147-160`) gains
`schedule: readonly RoundSpec[]` — a **result** the config screen already showed the host, matching
`:139-145`'s "Passing the results rather than the instructions".

`dispatch` itself (`:110-136`) is **unchanged**. `undo` (`:346-365`) keeps its `isOwner()` gate and
injected `resolveSpeciesName`; only the announcement string branches on what was removed.

**Correct the stale comment** at `store.ts:183-187` in the same change (see `actions.ts:44-47`).

---

### `src/ui/components/SchedulePreview.tsx` + `.css` (component, event-driven) — NEW

**Analog:** `src/ui/components/PlayerList.tsx` — **exact match**. Same role (a config-form list of
rows with per-row buttons), same data flow (event-driven, no state of its own), same
accessible-name-contains-visible-label constraint, same "plain tab stops, no roving tabindex"
call, and the same `<ol>`-when-the-ordinal-is-the-information rule the schedule needs.

**Stateless-with-callbacks + the list-semantics decision** (`PlayerList.tsx:11-22`):

```typescript
/**
 * It owns no state. Names, the roster of rows and the resolved order all arrive as props,
 * and every change goes back out as a callback — which is what keeps `ConfigScreen` the
 * one place that knows the config screen is pre-document form state, and keeps this
 * component from being the second place that could dispatch.
 *
 * ## The rows are not a list element, and that is on purpose
 * ...
 * The numbered starting order below IS an `<ol>`, because there the ordinal is the
 * information.
 */
```

**Per-row button whose accessible name contains its visible label** (`PlayerList.tsx:89-95` and
`rowLabel` at `:40-50`) — this is SC 2.5.3, and 03-UI-SPEC §2's accessible-name table
(`Move up to round {n−1}`) is the same construction:

```typescript
              <button
                type="button"
                class="player-list__remove"
                onClick={() => onRemove(player.id)}
              >
                Remove {rowLabel(player, index)}
              </button>
```

**The `<ol>` for the schedule rows** (`PlayerList.tsx:118-130`):

```typescript
      {/*
        An ordered list because the ordinal IS the information here — this is the one
        place on the config screen where position means something.
      */}
      <ol class="player-list__order">
```

**Inert reorder buttons** — apply **S-5** (`aria-disabled` + early return + shed on lift).
**"Nothing to reorder" renders no controls at all** — the shipped precedent is
`ConfigScreen.tsx:868-881`:

```typescript
        {/*
          Not rendered while the list is empty (02-UI-SPEC §Empty and edge states), for the
          same reason the chip list is not: a control that clears nothing is a control the
          host has to read and dismiss on every visit to a form they have not used yet.
        */}
        {banned.length > 0 && (
          <button type="button" class="config-screen__reroll" onClick={requestClearBans}>
            Clear the banlist
          </button>
        )}
```

Stylesheet: **S-4**.

---

### `src/ui/screens/ConfigScreen.tsx` (screen) — MODIFIED

**Analog:** in-file — the `Bans` fieldset (`:840-898`) is the template for the whole Mega-forme ban
sub-section, and the ban write path (`:380-457`) is the template for the forme-ban write path.

**The idempotent single write path, with a computation-local `Set`** (`ConfigScreen.tsx:373-435`) —
copy this shape for `megaFormeBans`, keyed on `megaFormes[].id`:

```typescript
  const bannedIdSet = useMemo(() => new Set(bans), [bans]);
  const banned = useMemo(() => bannedEntries(entries, bans), [entries, bans]);

  const applyBan = useCallback(
    (entry: RosterEntry, next: boolean) => {
      if (bannedIdSet.has(entry.id) === next) return;

      const nextBans = next
        ? [...bans, entry.id]
        : bans.filter((id) => id !== entry.id);

      setBans(nextBans);
      announce(banAnnouncement(entry.name, next, bannedEntries(entries, nextBans).length));
    },
    [bans, bannedIdSet, entries],
  );
```

**Two-surface fan-out over one write path** (`:444-457`) — grid toggles, typeahead adds:

```typescript
  const toggleBan = useCallback(
    (entry: RosterEntry) => applyBan(entry, !bannedIdSet.has(entry.id)),
    [applyBan, bannedIdSet],
  );
  const handleRemoveBan = useCallback((entry: RosterEntry) => applyBan(entry, false), [applyBan]);
  const handleAddBan = useCallback((entry: RosterEntry) => applyBan(entry, true), [applyBan]);
```

**The fieldset/legend group shape and its `TypeaheadField` + `BanChipList` + `PoolGrid` triple**
(`:840-898`) is the literal template for the `Mega-forme bans` sub-section and for the new `Swaps`
group. Note the `candidates={entries}` decision at `:852-864` — the full list, not minus the bans.

**Numeric config field** (`:926-932`, and `NumericField.tsx:52-60` for the parse):

```typescript
        <NumericField
          label="Pool size override"
          value={poolOverrideValue}
          onInput={setPoolOverride}
          min={1}
          max={entries.length}
        />
```

```typescript
export function parseNumericField(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  return value;
}
```

`min`/`max` are affordances, never enforcement (`NumericField.tsx:22-29`). The caller holds the raw
string **and** the parsed value; the gate is the only authority.

**Derived-rows-from-roster pattern for the 76 forme cells** (`:359-371`) — never a hardcoded list:

```typescript
  const dualMegaRows = useMemo(
    () => entries.filter((entry) => entry.megaFormes.length > 1),
    [entries],
  );
```

**`handleStart` is the one write** (`:684-745`) — every new config field lands in the
`TournamentConfig` literal at `:687-707` (with `bans: [...bans]`-style fresh copies), and
`schedule` is added to the `createTournament` call at `:709-722`.

**Correct the stale comment** at `ConfigScreen.tsx:77-82` in the same change:

```typescript
/**
 * Six rounds, six picks, one team of six. Phase 3 makes the round count a host decision;
 * until then it is a constant in one place rather than a `6` scattered through the four
 * derivations that read it.
 */
const ROUNDS = 6;
```

D-06 says it does not. `ROUNDS = 6` stays; the "one constant in one place" half is what carries
forward.

---

### `src/ui/components/BoardGrid.tsx` + `.css` (component) — MODIFIED

**Analog:** in-file. `roundLabel` (`:29-33`) already carries the `R${round}` fallback D-15 extends:

```typescript
const ROUND_LABELS = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'] as const;

function roundLabel(round: number): string {
  return ROUND_LABELS[round - 1] ?? `R${round}`;
}
```

The header cell to extend to two lines (`BoardGrid.tsx:124-128`):

```typescript
          {roundNumbers.map((round) => (
            <div class="board__round" key={round}>
              {roundLabel(round)}
            </div>
          ))}
```

**Reserved chrome height — open rounds render an empty span with the same `min-height`.** The
existing precedent for reserving space so the panes cannot misalign is `.board__cell`
(`BoardGrid.css:80-85`), and `.board__corner` (`:61-64`) is the "deliberately empty, still sized"
element:

```css
/* Sits above the label column, opposite the round headers. Deliberately empty. */
.board__corner {
  min-height: var(--space-4);
}

.board__round {
  align-self: end;
  font: var(--text-label);
  color: var(--color-text-muted);
}

.board__cell {
  /* A chip is --sprite-sm tall plus its padding; the cell must never crop it. */
  min-height: calc(var(--sprite-sm) + var(--space-3));
  min-width: 0;
  border-radius: var(--radius);
}
```

The 64px `min-height` above is exactly what DRFT-14 assertion 12 checks the hand strip against.
`--board-label-w: 176px` is declared at `BoardGrid.css:54` and is one of only two sanctioned raw
lengths in the project.

---

### `src/ui/components/MonCard.tsx` (component) — MODIFIED

**Analog:** in-file. Widening its prop from `RosterEntry` to `RosterEntry | MegaForme` is a
widening, not a branch — `MegaForme` (`roster/types.ts:68-77`) carries `name`, `types` and
`baseStats` exactly as `RosterEntry` does. **The sprite filename still comes from
`spriteMeta.byRosterId[<id>].file`** via `src/ui/sprite-src.ts` — never `${spriteId}.png`.

---

## Pattern Assignments — Unit B (Cards)

### `src/core/cards.ts` (core algorithm, transform) — NEW

**Analog:** `src/core/draw.ts` — role-match. Same shape: a self-contained pure algorithm with a
long "why not the obvious implementation" doc block, a named input, module-private helpers, and an
explicitly accepted caveat.

**The doc-block posture to copy** (`draw.ts:1-39`) — the CARD-04 deadlock argument belongs here in
exactly this form:

```typescript
/**
 * draw.ts — DRFT-02 / BAN-08. The pool draw, in two stages, always terminating.
 *
 * ## Why not reject-and-redraw
 *
 * The obvious implementation draws `size` entries uniformly ... the probability that a
 * uniform 48-entry draw satisfies the constraint is 1.56 x 10^-8 ... That configuration
 * passes every feasibility blocker, so it is reachable by an ordinary host: Start enables,
 * the host clicks it, and the tab freezes. That is a correctness bug wearing a performance
 * disguise.
 *
 * ## The caveat, accepted rather than fixed
 * ...
 * Pure, like everything under `src/core`. The only randomness is `nextInt`, which is a pure
 * hash of `(seed, cursor)`.
 */
```

`cards.ts` has **no** randomness at all — D-22 breaks ties with `(value, seq)`. State the absence.

**Named-input interface with a per-field justification comment** (`draw.ts:44-53`):

```typescript
export interface DrawInput {
  /** Roster entries in DISPLAY order, bans already removed by the caller. */
  candidates: readonly RosterEntry[];
  size: number;
  /** `players × megasRequiredPerTeam`. 0 means unconstrained. */
  megasRequired: number;
  seed: number;
  /** Where in the seed's stream to start. 0 for a fresh roll. */
  cursor?: number;
}
```

**Total comparator with no third clause** — the tiebreak analog is `bans.ts:51-55` /
`selectors.ts:50-54`, hand-written rather than `localeCompare`, for the stated reason that
locale-aware comparison would fold one tournament to two screens:

```typescript
/** Deterministic code-unit ordering, the same shape `selectors.ts` uses for ids. */
function compareNames(left: RosterEntry, right: RosterEntry): number {
  if (left.name < right.name) return -1;
  if (left.name > right.name) return 1;
  return 0;
}
```

`resolvePickOrder` sorts on `(a.value - b.value) || (a.seq - b.seq)` — `seq` is unique log-wide
(`store.ts:102-108`), so the comparator is total and there is no third clause and no reliance on
sort stability. **Test the property directly:** shuffle the input array, assert byte-identical
output.

---

### `src/core/selectors.ts` (selector) — MODIFIED

**Analog:** in-file — see **S-3**.

**`selectCurrentTurn` is superseded, not wrapped** (`selectors.ts:95-116`). Its own comment names
the wrong phase and must be corrected in the same change:

```typescript
/**
 * The slot on the clock, or `null` when the draft has not started or is finished.
 *
 * Phase 1 pick order is strict alternation ... Phase 2 replaces this with
 * priority-card resolution, at which point the resolved order becomes another
 * materialized log entry rather than a computation here.
 */
export function selectCurrentTurn(state: DraftState): Turn | null {
  if (state.order.length === 0) return null;
  if (selectIsComplete(state)) return null;

  const pickIndex = state.picks.length;
  const playerId = state.order[pickIndex % state.order.length];
  if (playerId === undefined) return null;

  return { round: Math.floor(pickIndex / state.order.length) + 1, playerId, pickIndex };
}
```

**Three blast-radius callers to fix in the same change:**
1. `reduce.ts:158-159` maps a null turn to `reject('draftComplete')` — add `'cardsNotResolved'`.
2. `undo.ts:153` reads `selectCurrentTurn(state)?.round ?? state.config.rounds` — switch to
   `selectCurrentRound`.
3. `app.tsx:1030` (`TurnBanner`) and `BoardGrid.tsx:137-141` (`nextSlotIndex`) both read the turn.

**`selectIsComplete` keeps its exact definition** (`:82-93`); `selectIsTournamentComplete` is a new
sibling beside it (D-31), so no existing caller is silently retyped.

**`selectStartingOrder`'s sort-before-shuffle property** (`:132-134`) is what D-18's rotation
reuses — the outcome depends on the *set* of players and the seed, never on caller order.

---

### `src/core/undo.ts` (core) — MODIFIED

**Analog:** in-file. `lastPickIndex` (`:35-55`) already predicted this exact generalization:

```typescript
/**
 * Index of the most recent `draft/pickMade` in the log, or `-1` when there is none.
 *
 * Written as "the last pick" rather than "the last entry" on purpose. In Phase 1 the
 * two are always the same — a pick is the only thing that follows a pick — but Phase 2
 * interleaves priority-card plays, bans and swaps into the same log, and a `pop()`
 * would then remove one of those instead, silently and with the undo button still
 * reading `Undo last pick`.
 */
function lastPickIndex(doc: TournamentDoc): number {
  for (let index = doc.log.length - 1; index >= 0; index--) {
    const action = doc.log[index];
    if (action !== undefined && isPickMadeAction(action)) return index;
  }
  return -1;
}
```

Generalize the predicate to the five undoable types. Never `pool/built`, `schedule/compiled` or
`draft/started` (`undo.ts:81-86`).

**`removedCount` goes live** (`undo.ts:104-115, 127-133`) — the field is already declared for
exactly this:

```typescript
/** What an undo would reach back into. Every field is a fact, never a sentence. */
export interface RoundBoundaryCrossing {
  crosses: boolean;
  pickRound: number;
  currentRound: number;
  playerId: string;
  /** Picks removed by the operation. Always 1 while `undoLast` is single-step. */
  removedCount: number;
}
```

`undoLast` (`:93-101`) removes one index via `splice`; the compound `order/resolved` +
`cards/played` removal is two `splice`s on the same fresh array — never a mutation of `doc.log`.

---

### `src/ui/components/CardFace.tsx` + `.css` (component, request-response) — NEW

**Analog:** `BanChipList.tsx`'s chip button for the markup (**S-4**), `SplitPanes.tsx:265-331` for
the inert branch (**S-5**).

**The one-vnode-shape rule is load-bearing here**, because a played card leaves the hand and the
panel re-renders for the next player (`SplitPanes.tsx:245-257`):

> The chrome does not SWAP one control for another across the collapsed boundary. There is
> exactly one control in exactly one vnode shape, and `collapsed` changes its LABEL and what its
> click does — nothing structural. ... Preact cannot reuse a DOM node across a vnode type: it
> unmounted the old subtree and mounted a new one, `document.activeElement` fell to `<body>`.

Playable and unplayable share one `<button>` vnode; the **played** state is a plain element and is
therefore a genuinely different shape — that is fine because it lives in a different container
(the played row), not in the hand.

**One derivation read twice, never two props** (`MonChip.tsx:36-55`) — the accessible name and the
visible digit must be one value:

```typescript
export function MonChip({ entry, spriteMeta, showName }: MonChipProps) {
  // ONE derivation, read twice below. ... Written as
  // two independent props a caller could set one without the other and leave a board cell
  // with no accessible name at all ...
  const nameText = showName ? entry.name : null;
```

**Token for the face size:** add `--card-min: 64px` to `src/ui/tokens.css` beside `--pill-h`
(`tokens.css:82-85`), which is the existing precedent for a component-scoped size token with its
arithmetic in the comment:

```css
  \* Type-pill height on a pool card: 14px x 1.4 = 19.6px of text, plus 2px above and
   * below. A type filter pill does NOT use this — a filter pill is a control and takes
   * --target-min in both axes. */
  --pill-h: 24px;
```

The digit takes `--text-display` (`tokens.css:99`). No fifth font size, no new colour token.

---

### `src/ui/components/HandStrip.tsx` + `.css` (component, presentational) — NEW

**Analog:** `src/ui/components/StatBlock.tsx` — **exact match**. Same role (a compact
presentational cluster inside a larger cell), same data flow (read-only), and the same
accessible-name question: `StatBlock`'s six label/value pairs are flattened by the parent's
accessible-name computation, so the pairing is carried by the parent's explicit name rather than by
markup structure.

`StatBlock.tsx:54-76` — spans throughout, a mapped array with a stable `key`, no interactivity:

```typescript
export function StatBlock({ stats, showAll }: StatBlockProps) {
  const total = stats.hp + stats.atk + stats.def + stats.spa + stats.spd + stats.spe;

  return (
    <span class="stat-block">
      <span class="stat-block__total">
        <span class="stat-block__label">Total</span>
        <span class="stat-block__value">{total}</span>
      </span>

      {showAll && (
        <span class="stat-block__grid">
          {STATS.map(([label, key]) => (
            <span class="stat-block__cell" key={key}>
              <span class="stat-block__label">{label}</span>
              <span class="stat-block__value">{stats[key]}</span>
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
```

`StatBlock.tsx:28-32` also states the rule that keeps this component out of core:

> The total is computed here rather than selected from core. It is display arithmetic over six
> numbers already in hand, not a game rule ... A selector for it would be a rule with no rule in it.

**Inverse for `HandStrip`:** the *hand* IS a rule (`selectHand`, CARD-01/CARD-06) and must come
from `selectors.ts`. Only the pip rendering and the `{name} holds 2, 5 and 6.` sentence belong here.
Pips are `aria-hidden="true"`; one accessible summary sits on the container.

---

### `src/ui/components/CardPanel.tsx` + `.css` (component, pane surface) — NEW

**Analog:** `src/ui/screens/CompletedDraft.tsx` — **exact match**. It is the existing precedent for
"a component that replaces the pool pane's content while the board pane stays put", which is
exactly what 03-UI-SPEC §8 specifies for the card panel.

`CompletedDraft.tsx:7-29` — the doc block states the pane contract and the "one source for the
rule" contract, both of which `CardPanel` inherits verbatim:

```typescript
/**
 * What the host sees when the draft is finished — EXPO-06 and PERS-06.
 *
 * It replaces the pool grid and nothing else. The top bar and the draft board stay
 * exactly where they were, which is a requirement rather than an oversight ...
 *
 * The board is not re-rendered here either. `BoardGrid` is already on screen above this
 * component and remains the completed record; drawing a second copy of every team would
 * be the duplicate team panel D-06 explicitly rules out for this phase.
 *
 * ## Where the paste text comes from
 *
 * `toShowdownPaste` and nowhere else. This component maps a player's slots into the
 * shape that function takes ... The format ... is settled in `src/core/export/paste.ts`
 * and is not re-decided, re-derived or adjusted here.
 */
```

Read `selectHand` / `selectPlayableCards` / `selectCardPlayOrder` the same way `CompletedDraft`
reads `toShowdownPaste`: call the core function, render the result, decide nothing.

**Props shape** (`CompletedDraft.tsx:31-42`) — selector output in, callbacks out, no store import:

```typescript
export interface CompletedDraftProps {
  /** In board order, so the panels and the board rows read down the page together. */
  players: readonly PlayerConfig[];
  /** `selectTeams` output: player id to slot array, `null` for an unfilled slot. */
  teams: Record<string, (string | null)[]>;
  entryById: ReadonlyMap<string, RosterEntry>;
  checkpointReached: boolean;
  checkpointDismissed: boolean;
  onDownload: () => void;
  onDismissCheckpoint: () => void;
}
```

---

### `src/ui/components/TurnBanner.tsx` + `.css` (component) — MODIFIED

**Analog:** in-file. `spoken` (`:71-85`) is the "build the plain-text form first, mirror it into the
live region, render the markup second" pattern the three new phase-dependent headlines follow:

```typescript
  const spoken =
    complete === true
      ? draftCompleteCopy(picks, teams)
      : round === null || playerName === null
        ? null
        : `Round ${round} of ${rounds} — ${playerName} picks${filtersCleared ? CLEARED_SUFFIX : ''}`;

  // Keyed on `[spoken]` and unchanged, which is the point: appending the suffix CHANGES
  // `spoken`, so it is already the trigger.
  useEffect(() => {
    if (spoken !== null) announce(spoken);
  }, [spoken]);
```

The conditional tie clause (`players > rounds`) is the same construction as `CLEARED_SUFFIX`
(`:60`) — a suffix appended to one composed string, not a second `announce`.

**`Draft complete — {picks} picks, {teams} teams` is byte-identical at `swapRounds: 0`** — do not
touch `draftCompleteCopy` (`:27-29`).

---

## Pattern Assignments — Unit C (Swaps)

### `src/ui/components/SwapPanel.tsx` + `.css` (component, pane surface) — NEW

**Analog:** `src/ui/screens/CompletedDraft.tsx` (see `CardPanel` above — same pane-replacement
contract), plus `src/ui/components/CheckpointPrompt.tsx` for a panel that renders a heading, a
sentence and one secondary button.

`Pass this swap` is a plain secondary button with **no confirm** (nothing is lost, undo covers it)
— the styling analog is `ConfigScreen.tsx:874-880`'s `config-screen__reroll` and the token set in
`BanChipList.css` (**S-4**). No accent fill: 03-UI-SPEC keeps accent at exactly three uses.

---

### `src/ui/components/MonChip.tsx` + `.css` (component) — MODIFIED

**Analog:** in-file. The `swappable` mode makes the chip a `<button type="button">` with accessible
name `Swap {species} out of round {r}`. The sprite keeps `alt=""` because the button's own name
carries it — which is the **inverse** of the existing `nameText` rule at `:36-55`, and the two must
be reasoned about together or the board loses its accessible names:

```typescript
  const nameText = showName ? entry.name : null;

  return (
    <span class="mon-chip">
      <img
        class="mon-chip__sprite"
        src={spriteSrc(entry, spriteMeta)}
        alt={nameText === null ? entry.name : ''}
        width={spriteMeta.nativeWidth}
        height={spriteMeta.nativeHeight}
        onError={handleSpriteError}
      />
```

**Correct the doc block in the same change** — `MonChip.tsx:7-23` currently says "Not interactive,
in this phase or any planned one", which 03-UI-SPEC Amendment 1 supersedes. At `swapBudget: 0` the
board is byte-identically non-interactive, and the comment must say so.

The wrapping cell is `TeamStrip.tsx:58-86`, whose `className` composition is where a
`board__cell--swappable` token joins:

```typescript
        const className = [
          'board__cell',
          monId === null ? 'board__cell--empty' : 'board__cell--filled',
          isNext ? 'board__cell--next' : '',
        ]
          .filter((token) => token !== '')
          .join(' ');
```

---

### `src/app.tsx` (routing) — MODIFIED

**Analog:** in-file. The pool-pane branch (`:1063-1088`) is where `selectPhase` replaces the
`complete ?` ternary with a four-way branch. The component decides *which* panel; it never computes
the phase:

```typescript
            <SplitPanes
              pane={pane}
              onPaneChange={handlePaneChange}
              poolExpandable={poolExpandable}
              pool={
                complete ? (
                  <CompletedDraft ... />
                ) : (
                  <PoolGrid
                    entries={availableEntries}
                    spriteMeta={load.bundle.spriteMeta}
                    onPick={handlePoolPick}
                    // Not a ban surface. `null` rather than an empty set, so a draft cell
                    // cannot report an unpressed toggle state it does not have.
                    bannedIds={null}
                  />
                )
              }
              board={<BoardGrid ... />}
            />
```

**Dispatch handler shape** (`app.tsx:203-230`) — the template for `handlePlayCard`,
`handleSwap`, `handlePass`. It reads the turn from a selector and lets `dispatch` own legality:

```typescript
/**
 * Note what this function does NOT do: it does not compute whose turn it is, does not
 * check whether the species is still available, and does not touch the log. The turn
 * comes from a selector and the legality check happens inside `dispatch`, because a UI
 * component may not own a game rule (SHEL-04, and the UI-SPEC's pure-core boundary).
 */
function handlePick(entry: RosterEntry): void {
  const state = getState();
  if (state === null) return;

  const turn = selectCurrentTurn(state);
  if (turn === null) return;

  dispatch(
    pickMade({
      playerId: turn.playerId,
      monId: entry.id,
      round: turn.round,
      pickIndex: turn.pickIndex,
    }),
  );
}
```

**The `inert` sibling trap to preserve** (`app.tsx:1109-1116`) — the swap confirm must be a sibling
of the gated region, not inside it:

```typescript
      {/*
        A SIBLING of the gated element above, and that placement is load-bearing rather
        than tidy. `inert` applies to a whole subtree, so a modal rendered inside it in a
        read-only tab would render, trap focus, and refuse every click — a dialog nobody
        can dismiss.
      */}
```

**`feasibilityNotice`** (`:1039-1043`) is the non-blocking adoption notice the research says to
extend to cover schedule violations found on adoption. It is a `role="status"` paragraph, and a
second unrelated fact gets a **second** notice (`:1045-1054`), never a folded clause.

---

### `src/ui/confirm-copy.ts` (copy module) — MODIFIED

**Analog:** in-file — see **S-6**. Three new sets, all `default`-toned, each an exported const with
`heading` / `tone` / `confirmLabel` / `safeLabel` / `body`. `CLEAR_BANLIST_CONFIRM` (`:170-177`) is
the closest shape for `Clear the Mega-forme banlist`:

```typescript
export const CLEAR_BANLIST_CONFIRM = {
  heading: 'Clear the banlist?',
  tone: 'default' as const,
  confirmLabel: 'Clear the banlist',
  safeLabel: 'Keep the bans',
  body: (banCount: number): string =>
    `This clears all ${bans(banCount)} at once. Every banned Pokémon returns to the pool.`,
};
```

---

## No Analog Found

| File / concern | Role | Data flow | Why there is no analog |
|----------------|------|-----------|------------------------|
| The Hall's-condition subset enumeration inside `src/core/cards.ts` | core algorithm | combinatorial | No bipartite-matching or subset-enumeration code exists anywhere in the repository. `draw.ts` supplies the *module* shape (see above) but not the algorithm. Take the algorithm from 03-RESEARCH §CARD-04 (`|⋃_{q∈S}(H_q \ U)| ≥ \|S\|` over ≤ 2⁷ subsets), and hand-write it — a library is a constraint violation. |
| The two-line board round header's reserved empty line | component styling | — | Nothing in `BoardGrid.css` currently reserves height for an optional second line. `.board__corner` (`:61-64`) is "deliberately empty and still sized" and is the nearest idea, but the min-height arithmetic (20 + 4 + 27 = 51px) is new. 03-UI-SPEC §Layout Budget has the numbers; plan 02-09's reserved-chrome-height rule is the principle. |

Two further concerns have an analog but need it stated explicitly, because the obvious move is wrong:

- **`apply(SWAP_MADE)` must replace the pick in place, not append.** The nearest in-file arm
  (`reduce.ts:86-101`) appends. Copy the *filter-and-rebuild* shape from `DRAFT_PICK_UNDONE`
  (`:103-118`) instead, mapping over `picks` and preserving the original `seq`. Research Pitfall 4:
  appending renders correctly on the board and silently strands the swapped-out Pokémon out of
  `selectAvailablePool` forever.
- **`canApply` cannot check round eligibility.** `DraftState` holds no roster (`model.ts:186-195`)
  and D-07 declines to materialize eligible id lists. Route the rule through a pure selector the
  edge consults before dispatching — the shape `feasibility.ts` and `bans.ts` already use — and
  extend the existing adoption notice (`app.tsx:1039-1043`). Do **not** widen `canApply`'s
  signature and do **not** filter `selectTeams` (`reduce.ts:16-19`).

---

## Metadata

**Files scanned:** 118 (all of `src/**` and `tests/**` by name; 34 read in full or in part)
**Analogs read:** `bans.ts`, `draw.ts`, `feasibility.ts`, `selectors.ts`, `reduce.ts`, `model.ts`,
`actions.ts`, `undo.ts`, `migrate.ts`, `import-guard.ts` (§`buildLogEntry`), `search.ts` (§predicates),
`roster/types.ts` (§`MegaForme`), `store.ts`, `ConfigScreen.tsx` (4 sections), `app.tsx` (3 sections),
`BoardGrid.tsx` + `.css`, `TeamStrip.tsx`, `MonChip.tsx`, `TurnBanner.tsx`, `BanChipList.tsx` + `.css`,
`PlayerList.tsx`, `StatBlock.tsx`, `CompletedDraft.tsx`, `NumericField.tsx`, `SplitPanes.tsx` (§`side`),
`FilterBar.tsx` (§inert), `confirm-copy.ts`, `tokens.css`, `bans.test.ts`, `selectors.test.ts`,
`draft-board.test.tsx`
**Pattern extraction date:** 2026-08-17
