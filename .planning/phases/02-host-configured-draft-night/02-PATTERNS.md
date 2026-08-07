# Phase 2: Host-Configured Draft Night - Pattern Map

**Mapped:** 2026-08-07
**Files analyzed:** 52 (17 new source, 20 modified source, 15 test)
**Analogs found:** 46 / 52

> **How to read this.** Match quality `self` means the file already exists and is being
> extended — the analog **is the file itself**, and the excerpt below is the exact existing
> pattern the new code must match. `exact` means a different file with the same role and the
> same data flow. `none` means nothing in this repository does this yet; the planner falls
> back to 02-RESEARCH.md §Code Examples and 02-UI-SPEC.
>
> **Layer rule.** `npm run check:pure` (`scripts/check-pure-core.mjs`) fails the build if a
> file under `src/core/` imports from `src/adapters/`, `src/ui/`, `preact`, or `@preact/signals`,
> or contains a forbidden ambient token. **An analog from the wrong layer is a build failure,
> not a style preference.**

---

## File Classification

### New — pure core (`src/core/`)

| New file | Role | Data flow | Closest analog | Match |
|----------|------|-----------|----------------|-------|
| `src/core/feasibility.ts` | rules module (predicate → report object) | transform | `src/core/migrate.ts` (result-object shape) + `src/core/reduce.ts:131-184` (`canApply` precedence) | role-match |
| `src/core/draw.ts` | rules module (seeded sampling) | transform | `src/core/selectors.ts:135-152` (`selectStartingOrder` — the only existing `rng` consumer) | exact |
| `src/core/search.ts` | utility (shared predicate) | transform | `src/core/selectors.ts:40-54` (pure predicate + local comparator helpers) | role-match |

### Modified — pure core

| File | Role | Data flow | Analog | Match |
|------|------|-----------|--------|-------|
| `src/core/model.ts` | model | — | itself (`:42-48` `TournamentConfig`, `:110-118` `copyConfig`) | self |
| `src/core/actions.ts` | action vocabulary | event-driven | itself (`:39-44` payload, `:99-105` creator, `:150-157` guard — **three places per field**) | self |
| `src/core/reduce.ts` | reducer | event-driven | itself (`:133-139` `canApply(POOL_BUILT)`) | self |
| `src/core/migrate.ts` | migration | transform | itself (`:51-72`) | self |
| `src/core/import-guard.ts` | input validation | file-I/O (untrusted) | itself (`:248-274` `buildConfig`, `:305-347` `buildLogEntry`) | self |
| `src/core/selectors.ts` | selectors | transform | itself (`:30-121`) | self |

### Modified — store & adapters

| File | Role | Data flow | Analog | Match |
|------|------|-----------|--------|-------|
| `src/store.ts` | single write path | event-driven | itself (`:118-144` `dispatch`, `:168-198` `createTournament`, `:211-217` `adoptTournament`) | self |
| `src/adapters/persistence.ts` | storage adapter | file-I/O | itself (`:204-222` `load`, `:159-167` `save`) | self |
| **`src/adapters/view-prefs.ts`** *(new)* | storage adapter | CRUD (localStorage) | `src/adapters/persistence.ts:38-41, 120-133, 204-222` | exact |

### Modified — UI

| File | Role | Data flow | Analog | Match |
|------|------|-----------|--------|-------|
| `src/app.tsx` | orchestration / screen router | request-response | itself (`:147-226` boot, `:436-551` render tree) | self |
| `src/ui/components/PoolGrid.tsx` + `.css` | component (list) | transform | itself (`:29-46`) | self |
| `src/ui/components/MonCard.tsx` + `.css` | component (cell) | request-response | itself (`:24-55`) | self |
| `src/ui/components/MonChip.tsx` | component (cell) | — | itself (`:26-42`) | self |
| `src/ui/components/TeamStrip.tsx` | component (fragment row) | — | itself (`:32-63`) | self |
| `src/ui/components/BoardGrid.tsx` + `.css` | component (grid) | — | itself (`:29-33`, `:46-106`) | self |
| `src/ui/components/TurnBanner.tsx` | component (status) | — | itself (`:34-59`) | self |
| `src/ui/components/TopBar.tsx` | component (toolbar) | event-driven | itself (`:82-136`) | self |
| `src/ui/components/ImportConfirmDialog.tsx` | dialog | request-response | itself (`:33-95`) refactored onto the new `ConfirmDialog` | self |
| `src/ui/screens/CompletedDraft.tsx` | screen | — | itself (`:56-89` — already `players.map`, already N-safe) | self |
| `src/ui/tokens.css` | config (design tokens) | — | itself (`:10-11`, `:80-81` — both comments must be rewritten) | self |

### New — UI

| New file | Role | Data flow | Closest analog | Match |
|----------|------|-----------|----------------|-------|
| `src/ui/screens/LandingScreen.tsx` | screen | request-response | `src/ui/screens/StorageBlocked.tsx` (copy constants + composed component, no CSS file) | role-match |
| `src/ui/screens/ConfigScreen.tsx` + `.css` | screen (form) | request-response | `src/app.tsx:147-226` (state-holding orchestrator) | partial |
| `src/ui/components/ConfirmDialog.tsx` | dialog primitive | request-response | `src/ui/components/ImportConfirmDialog.tsx` | **exact** |
| `src/ui/components/FeasibilityBar.tsx` + `.css` | component (status + action) | transform | `src/ui/components/TopBar.tsx:141-185` (`aria-disabled` button + `role="status"` message) | role-match |
| `src/ui/components/SplitPanes.tsx` + `.css` | layout shell | — | `src/ui/app.css:22-31, 52-65` + `src/ui/components/BoardGrid.css:33-42` | partial |
| `src/ui/components/FilterBar.tsx` + `.css` | component (toolbar) | transform | `src/ui/components/TopBar.tsx:138-173` | role-match |
| `src/ui/components/TypePill.tsx` + `.css` | component (leaf) | — | `src/ui/components/MonChip.tsx` (smallest leaf component in the repo) | role-match |
| `src/ui/components/StatBlock.tsx` + `.css` | component (leaf) | — | `src/ui/components/MonCard.tsx` | role-match |
| `src/ui/components/SegmentedControl.tsx` + `.css` | component (form control) | request-response | **none** — no `<fieldset>`, `<legend>` or `<label>` exists anywhere under `src/` | **none** |
| `src/ui/components/TypeaheadField.tsx` + `.css` | component (combobox) | request-response | **none** — no visible `<input>` exists under `src/` | **none** |
| `src/ui/components/PlayerList.tsx` + `.css` | component (editable list) | CRUD | **none** — no text `<input>` exists under `src/` | **none** |
| `src/ui/components/BanChipList.tsx` + `.css` | component (list) | CRUD | `src/ui/components/PoolGrid.tsx:39-43` (keyed map) | partial |
| `src/ui/use-roving-tabindex.ts` | hook | event-driven | `src/ui/use-ownership.ts` | **exact** |

### New / extended — tests

| Test file | Role | Analog | Match |
|-----------|------|--------|-------|
| `tests/core/feasibility.test.ts` | core test | `tests/core/selectors.test.ts:1-89` | exact |
| `tests/core/draw.test.ts` | core test | `tests/core/selectors.test.ts:1-89` | exact |
| `tests/core/search.test.ts` | core test | `tests/core/selectors.test.ts` | exact |
| `tests/core/migrate.test.ts` | core test (extend) | itself (`:16-31` `docAtVersion` factory) | self |
| `tests/core/model.test.ts` | core test (new — `copyConfig` aliasing) | `tests/core/migrate.test.ts:83-90` (non-mutation assertion) | role-match |
| `tests/core/import-guard.test.ts` | core test (extend) | itself | self |
| `tests/core/roster/fixtures.test.ts` | data-fixture tripwire (extend) | `tests/ui/sprite-resolution.test.ts:15-31` (reads the real committed JSON) | exact |
| `tests/ui/*.test.tsx` (config, chip alt, filter bar) | UI test | `tests/ui/read-only-shell.test.tsx:1-75` | exact |

---

## Shared Patterns

These apply across most or all files in the phase. Every plan that touches a matching file
must reference them.

### S-1. File naming and placement

**Source:** repository layout, verified by listing `src/`.

```
src/core/<lowercase>.ts              rng.ts, undo.ts, migrate.ts, import-guard.ts
src/adapters/<kebab-case>.ts         id.ts, tab-lock.ts, roster-source.ts, file-io.ts
src/ui/components/<PascalCase>.tsx   + <PascalCase>.css beside it
src/ui/screens/<PascalCase>.tsx      CompletedDraft.tsx, StorageBlocked.tsx
src/ui/<kebab-case>.ts               use-ownership.ts, sprite-src.ts   ← hooks are kebab-case
tests/core/**  mirrors  src/core/**
```

**Consequences the planner must encode:**
- `useRovingTabindex` lives in **`src/ui/use-roving-tabindex.ts`**, not `useRovingTabindex.ts`.
  The only existing hook is `src/ui/use-ownership.ts` exporting `useOwnership`.
- `LandingScreen` and `ConfigScreen` go in `src/ui/screens/`, everything else in
  `src/ui/components/`.
- **A component only gets a `.css` file when it declares its own styles.**
  `TeamStrip.tsx`, `CompletedDraft.tsx` and `StorageBlocked.tsx` have none — `TeamStrip`'s
  classes (`board__label`, `board__cell`) live in `BoardGrid.css` because they are the parent
  grid's geometry. Apply the same rule: `SplitPanes.css` owns the pane classes; a child that
  renders into the pane grid does not get a second stylesheet.

### S-2. Every module opens with a doc block that states the *decision*, not the mechanics

**Source:** universal. Best examples: `src/core/rng.ts:1-19`, `src/core/migrate.ts:1-21`,
`src/ui/components/MonChip.tsx:7-19`.

```ts
/**
 * rng.ts — SHEL-07. The only source of randomness in the entire application.
 *
 * There is no generator object and no internal state. `nextInt` is a pure integer hash
 * of `(seed, cursor)`, so the same pair always yields the same value, on every machine,
 * forever. ...
 *
 * The algorithm is the mulberry32-style integer mix ARCHITECTURE.md gives verbatim in
 * Pattern 2. It is not cryptographic and does not need to be — nothing here is a
 * secret, and the property being bought is reproducibility, not unpredictability.
 */
```

Every new module in this phase needs one. In particular `src/core/draw.ts` must state
02-RESEARCH's honest caveat verbatim in its doc block: the two-stage draw **is** uniform when
`megasRequired === 0` and is **not** uniform over the constraint-satisfying set when it is
greater, because rejection sampling is intractable (8 players / k=4 / Exact needs ~6.4 × 10⁷
redraws).

### S-3. Result objects, never exceptions, for two-valued answers

**Source:** `src/core/migrate.ts:34-51`, `src/core/reduce.ts` (`CanApplyResult`),
`src/adapters/persistence.ts:53-63`.

```ts
export type MigrateRejectionReason = 'newerSchema' | 'unknownSchema';

export type MigrateResult =
  | { ok: true; doc: TournamentDoc }
  | { ok: false; reason: MigrateRejectionReason };

/**
 * Returns a result rather than throwing, because the caller's job is to pick one of two
 * specified sentences to show the host, and an exception is a worse way to carry a
 * two-valued answer than a two-valued answer.
 */
export function migrate(doc: TournamentDoc): MigrateResult { … }
```

`FeasibilityResult` follows this shape. The one sanctioned exception is
`rng.ts:29-35`, which **throws** `RangeError` on an empty range — deliberately, because a
caller asking for a draw from an empty range has a bug. `drawPool` inherits that: it calls
`nextInt` and lets the throw surface rather than clamping.

### S-4. Declared string-literal unions for every enumerable reason / mode

**Source:** `src/core/migrate.ts:34-38`, `src/adapters/persistence.ts:53-61`,
`src/core/reduce.ts` `RejectionReason`.

Each member carries its own doc comment. `RejectionReason`'s file comment records that these
strings are "closer to an API than to a log message" — adding one is a deliberate act. Apply
to `FeasibilityCode`, `banMode`, `depth`, `DualMegaChoice.forme`, density and pane-state.

```ts
export type StorageFailureReason =
  /** Reading the API itself threw — policy, an embedded webview, or a sandboxed frame. */
  | 'unavailable'
  /** The write was refused. Safari private mode has historically thrown on the first one. */
  | 'writeRejected'
  …
```

### S-5. Copy lives as an exported/module constant, never inline JSX prose

**Source:** `src/ui/components/ImportConfirmDialog.tsx:27-50`,
`src/ui/screens/StorageBlocked.tsx:22-29`, `src/app.tsx:71-83`.

```ts
/**
 * Verbatim from the approved UI-SPEC copywriting table.
 *
 * Held as constants rather than as inline JSX prose because JSX collapses whitespace
 * between text lines, and these are contracts down to the em dash.
 */
export const IMPORT_CONFIRM_HEADING = 'Replace the current draft?';
export const REPLACE_LABEL = 'Replace draft';
export const KEEP_LABEL = 'Keep current draft';

export function importConfirmBody(pickCount: number): string {
  const picks = pickCount === 1 ? '1 pick' : `${pickCount} picks`;
  return `Importing loads a different tournament. The draft in progress — ${picks} — …`;
}
```

02-UI-SPEC §11 and §Copywriting Contract give every Phase 2 literal. **Interpolated counts get
a singular/plural helper** — `importConfirmBody` is the precedent, and the reason is recorded
there: "a visible grammar error in the one dialog that destroys work reads as a tool that was
not finished." Every `{n} picks` / `{m} players` / `{n} bans` slot in the seven confirm
dialogs needs the same treatment.

### S-6. `id` for identity, `name` for rendering — everywhere

**Source:** `src/core/selectors.ts:41, 46-54`, `src/core/import-guard.ts:240-244`,
`src/ui/components/PoolGrid.tsx:41`.

```ts
const taken = new Set(state.picks.map((pick) => pick.monId));
return state.poolIds.filter((id) => !taken.has(id));
```

```ts
/** Player ids in a stable, deterministic order — never object key order (rule 14). */
function playerIdsInOrder(state: DraftState): string[] {
  return state.config.players.map((player) => player.id).sort(compareIds);
}

function compareIds(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
```

Copy `compareIds` rather than `localeCompare` — the existing sort is locale-independent on
purpose. `BanChipList` sorts by **`name`** for display only (02-UI-SPEC §4); membership and
removal are still by `id`.

### S-7. Sprite URLs come from `spriteMeta`, and `alt` is paired with the name text

**Source:** `src/ui/components/MonCard.tsx:24-49`, `src/ui/components/MonChip.tsx:26-40`.

```tsx
/*
 * Notes on the <img> below, kept out of the markup so the CI text checks cannot match
 * their own documentation:
 *
 *   alt is empty on purpose. The species name sits right beside the sprite and is the
 *   button's accessible name, so alt text here would make every cell announce twice.
 *
 *   width and height are explicit and come from the measurement rather than a typed
 *   literal, so they cannot drift from --sprite-lg. …
 *
 *   The image is deliberately NOT lazily loaded. …
 */
<img
  class="mon-card__sprite"
  src={spriteSrc(entry, spriteMeta)}
  alt=""
  width={spriteMeta.nativeWidth}
  height={spriteMeta.nativeHeight}
  onError={handleSpriteError}
/>
```

**D-21 changes exactly one thing in `MonChip`:** the `alt` must be written as a single
expression tied to `showName`, never as two independent props —

```tsx
alt={showName ? '' : entry.name}
```

02-UI-SPEC calls this "the single most breakable contract in this phase". Test both branches.

### S-8. Live-region announcements go through `announce`, surface-local status uses `role="status"`

**Source:** `src/ui/components/LiveRegion.tsx:14-36`, `src/ui/components/TurnBanner.tsx:35-44`,
`src/ui/components/TopBar.tsx:175-185`.

```tsx
// TurnBanner: build the plain-text form FIRST, then the markup, so the announcement is
// never reconstructed from the DOM.
const spoken = complete ? DRAFT_COMPLETE_COPY : `Round ${round} of 6 — ${playerName} picks`;

useEffect(() => {
  if (spoken !== null) announce(spoken);
}, [spoken]);
```

```tsx
{importError !== null && (
  <p class="top-bar__message" role="status">
    {importError}
  </p>
)}
```

The `FeasibilityBar` reason uses the **`role="status"` form** (02-UI-SPEC §5) — not `announce`
— so it does not compete with the global region. Note `LiveRegion.tsx:16-25`: byte-identical
consecutive announcements are silent; F-03 (duplicate player names blocking) is what protects
the turn announcement, and that dependency must be recorded.

### S-9. `aria-disabled` vs native `disabled` — the divergence is deliberate

**Source:** `src/ui/components/TopBar.tsx:141-149`.

```tsx
<button
  type="button"
  class="top-bar__button"
  onClick={handleUndo}
  disabled={!undoAvailable}
  aria-disabled={undoAvailable ? 'false' : 'true'}
>
  Undo last pick
</button>
```

Undo uses **both** because its disabled state needs no explanation. `Start draft` uses
**`aria-disabled` only and stays focusable** (02-UI-SPEC §5) because a natively disabled
button is unreachable and the explanation is the whole point of RULE-07. The click handler
returns early; `aria-describedby` points at the reason element. Record this as an intentional
divergence in the plan so a reviewer does not "fix" it.

### S-10. No mocks in `tests/core/**`; UI tests opt into a DOM on line 1

**Source:** `tests/core/selectors.test.ts:1-89`, `tests/ui/read-only-shell.test.tsx:1-2`.

```ts
/**
 * Zero mocks, as everywhere in `src/core`.
 */
import { describe, expect, it } from 'vitest';

const CREATED_AT = 1_700_000_000_000;
const POOL = ['venusaur', 'charizard', /* real roster ids */];
const CONFIG: TournamentConfig = { formatLabel: 'Champions Test', players: [...], rounds: 6, … };

/** The envelope, added by hand. New core tests do not reach for the store. */
function stamp(intent: Intent, seq: number): Action {
  return { ...intent, seq, at: CREATED_AT + seq, actorId: 'host' };
}
```

```tsx
// @vitest-environment happy-dom      ← MUST be line 1, before any comment block
```

A UI test that touches the live region resets `announce` in `beforeEach` (CLAUDE.md §Tests).

---

## Pattern Assignments

### `src/core/draw.ts` (new — rules module, transform)

**Analog:** `src/core/selectors.ts:135-152` — `selectStartingOrder`, the only existing
consumer of the seeded generator, and the only existing Fisher-Yates in the repo.

**Imports pattern** (`selectors.ts:19-20`):
```ts
import type { DraftState } from './model';
import { nextInt } from './rng';
```
`draw.ts` imports `{ nextInt } from './rng'` and `type { RosterEntry } from './roster/types'`.
Nothing else. `roster/types.ts` is types-only and fully erased at runtime.

**Core pattern — seeded shuffle with an explicit cursor** (`selectors.ts:135-152`):
```ts
export function selectStartingOrder(seed: number, playerIds: readonly string[]): string[] {
  const order = [...playerIds].sort(compareIds);

  // Fisher-Yates, with the pure generator supplying every draw.
  let cursor = 0;
  for (let index = order.length - 1; index > 0; index--) {
    const draw = nextInt(seed, cursor, index + 1);
    cursor = draw.cursor;

    const target = order[index];
    const source = order[draw.value];
    if (target === undefined || source === undefined) continue;
    order[index] = source;
    order[draw.value] = target;
  }

  return order;
}
```

Three things to copy verbatim:
1. **`readonly` input, freshly-built output.** `[...playerIds]` — never mutate the argument.
2. **`cursor` is a local `let`, threaded through every `nextInt` call**, and the advanced
   value is part of the contract. `DrawResult.cursor` is the analogue of the `RngDraw.cursor`
   this loop discards.
3. **The `undefined` guards on every indexed read.** `noUncheckedIndexedAccess` is on;
   `if (chosen === undefined || displaced === undefined) continue;` is required, not defensive
   habit. 02-RESEARCH §Code Examples' `selectInPlace` already has them.

**Ordering contract** (`selectors.ts:34-39`) — the reason the draw must not emit shuffle order:
```ts
/**
 * Pool ids minus every picked id, in the pool's original order.
 *
 * Order matters to the UI: the pool ids are built in display order, so a filter that
 * reordered them would reshuffle the grid under the host's cursor on every pick.
 */
```
The display order is `byDexOrder` (`src/app.tsx:111-116`). `drawPool` selects a **set** and
emits `candidates.filter(e => chosen.has(e.id)).map(e => e.id)`.

**Throwing contract inherited from** `src/core/rng.ts:28-35`:
```ts
export function nextInt(seed: number, cursor: number, max: number): RngDraw {
  if (!Number.isInteger(max) || max < 1) {
    // `% 0` is NaN, which would flow into an array index and surface as `undefined`
    // several frames away from the mistake. A caller asking for a draw from an empty
    // range has a bug, and expected-failure tolerance is `canApply`'s job, not this
    // function's.
    throw new RangeError(`nextInt requires a positive integer range, received ${max}`);
  }
```

**Test analog:** `tests/core/selectors.test.ts` — plus the reproducibility assertion pattern
(same seed twice ⇒ identical array) that `selectStartingOrder`'s own doc comment demands.

---

### `src/core/feasibility.ts` (new — rules module, transform)

**Analogs:** `src/core/migrate.ts` for the result-object and refusal posture;
`src/core/reduce.ts:131-184` for a **declared, ordered** sequence of checks.

**Precedence-as-a-declared-order pattern** (`reduce.ts:133-139`):
```ts
case POOL_BUILT: {
  if (!isPoolBuiltAction(action)) return reject('malformedPayload');
  if (state.poolIds.length > 0) return reject('poolAlreadyBuilt');
  if (action.ids.length === 0) return reject('emptyPool');
  if (new Set(action.ids).size !== action.ids.length) return reject('duplicatePoolIds');
  return OK;
}
```
Note `canApply` returns the **first** failure. `checkFeasibility` differs — it collects **all**
problems and sorts them by the declared `PRECEDENCE` array (02-RESEARCH §Pattern 1), because
02-UI-SPEC §5 renders the first plus `{n} other problems also block the start.`

**Set-membership pattern** (`reduce.ts:137`, `selectors.ts:41`, `import-guard.ts:242`):
```ts
if (new Set(action.ids).size !== action.ids.length) return reject('duplicatePoolIds');
```
```ts
const ids = new Set(players.map((player) => player.id));
if (ids.size !== players.length) return null;
```
This is the F-10 fix's precedent: a `Set` built inside a function is fine and is already the
house pattern. **It is never stored in the document** (CLAUDE.md §Serializability).

**Non-integer refusal pattern** (`migrate.ts:54-58`) — the F-08 / F-09 blockers:
```ts
// A non-integer version is not a version. Rounding it would be guessing, and guessing
// is the whole behaviour this module exists to refuse.
if (!Number.isSafeInteger(version)) {
  return { ok: false, reason: 'unknownSchema' };
}
```
Same posture, same helper: `Number.isSafeInteger`. `import-guard.ts:190-196` already defines
`isNonNegativeInteger` / `isPositiveInteger` in exactly this shape — reuse the shape, do not
import across modules unless a shared home is created deliberately.

**Refuse, never clamp** (`import-guard.ts:255-260`) — D-06's "one authority" applied one level
down:
```ts
// Refused, not clamped. Clamping 4000000000 down to 24 would load a document that
// claims to be a tournament nobody played, under a board the host would have no reason
// to distrust — and this file's whole posture is that repairing untrusted input is worse
// than refusing it.
```

**Test analog:** `tests/core/selectors.test.ts:45-60` module-level `CONFIG`/`POOL` fixtures.
02-RESEARCH §Code Examples gives the exact test file skeleton.

---

### `src/core/search.ts` (new — utility, transform)

**Analog:** `src/core/selectors.ts:45-54` — a small pure predicate plus a private helper,
exported from a single module so two consumers cannot drift.

02-RESEARCH §Pattern 2 gives the implementation. The pattern to copy from `selectors.ts` is
structural: **the helper is module-private, the predicate is exported, and the doc comment
names both consumers.** `TypeaheadField` and `FilterBar` import the same `matchesName`.

The `toID` identity is documented at `src/core/roster/types.ts:35` ("Showdown `toID`:
lowercase, `[^a-z0-9]+` stripped. THE identity key"). 02-RESEARCH verified
`toID(entry.name) === entry.id` for all 235 entries — **write the predicate against
`entry.name` anyway** and add the equality as a fixture test, so a regulation rotation fails
loudly instead of search silently missing a species.

---

### `src/core/model.ts` (modify — model)

**Analog:** itself.

**The current shape** (`:42-48`, `:110-118`):
```ts
export interface TournamentConfig {
  formatLabel: string;
  players: PlayerConfig[];
  rounds: number;
  rosterVersion: string;
  rosterChecksum: string;
}
```
```ts
/** Deep copy of config, so folded state can never alias the caller's object. */
function copyConfig(config: TournamentConfig): TournamentConfig {
  return {
    formatLabel: config.formatLabel,
    players: config.players.map((player) => ({ id: player.id, name: player.name })),
    rounds: config.rounds,
    rosterVersion: config.rosterVersion,
    rosterChecksum: config.rosterChecksum,
  };
}
```

**The pattern to copy:** `players` is deep-copied **element by element with an explicit object
literal**, not `[...players]` and not `structuredClone`. Every new array field follows it:

```ts
bans: config.bans.map((id) => id),
dualMegaChoices: config.dualMegaChoices.map((c) => ({ speciesId: c.speciesId, forme: c.forme })),
```

TypeScript catches a **missing** field (the return is an explicit object literal under
`strict`); it does **not** catch a shallow array copy. `initialState` runs `copyConfig` on
every `fold`, and `fold` runs on every undo — an aliased array surfaces as an undo changing
something it should not. Assert non-identity in a test (Pitfall 7).

**Serializability constraint** (`:15-19`):
```
 * Every field below is JSON-serializable: no Date, no Map, no Set, no class instance,
 * no function, no meaningful `undefined`. …
```
This is why 02-RESEARCH recommends `DualMegaChoice[]` over `Record<speciesId, forme>` — plus
sync rule 14, which forbids order-sensitive `Object.keys()` iteration (`selectors.ts:45`
already documents that rule inline).

**`SCHEMA_VERSION` comment at `:24-28` must be rewritten** — it currently says "Plan 01-10
pairs this with a `migrate(doc)` on the import path; until then it is written and checked."
That stops being true at version 2.

---

### `src/core/actions.ts` (modify — action vocabulary)

**Analog:** itself. **A field added to a payload must be added in three places.**

**1. Payload interface** (`:38-44`):
```ts
/** The pool, materialized. Replay reads these ids; it never re-derives them. */
export interface PoolBuiltPayload {
  type: typeof POOL_BUILT;
  ids: string[];
  rosterVersion: string;
  checksum: string;
}
```

**2. Creator — payload only, copies arrays** (`:99-109`):
```ts
export function poolBuilt(
  ids: readonly string[],
  rosterVersion: string,
  checksum: string,
): PoolBuiltPayload {
  return { type: POOL_BUILT, ids: [...ids], rosterVersion, checksum };
}
```

**3. Structural guard** (`:150-157`):
```ts
export function isPoolBuiltAction(action: AnyAction): action is PoolBuiltAction {
  if (action.type !== POOL_BUILT || !isRecord(action)) return false;
  return (
    isStringArray(action['ids']) &&
    typeof action['rosterVersion'] === 'string' &&
    typeof action['checksum'] === 'string'
  );
}
```
`:130-136` states why: "The discriminant alone is not enough. An imported document is untrusted
input, and a log entry that says `draft/pickMade` while carrying no `monId` must fold to
'ignored', not to a pick of `undefined`." If 02-RESEARCH Option A is taken (`poolBuilt` gains
`seed` and `megaCapableCount`; `draftStarted` gains `seed`), all three sites plus
`import-guard.buildLogEntry` change together. The `isSafeInteger` helper already exists at
`:146-148`.

**Header comment `:1-17` records** that creators return the payload only and `dispatch` stamps
the envelope — "a creator that reached for a clock would be an ambient read inside the core and
`npm run check:pure` would fail the build for it."

---

### `src/core/migrate.ts` (modify — migration)

**Analog:** itself, plus the comment that already names the shape of the change (`:60-65`):
```ts
if (SUPPORTED_SCHEMA_VERSIONS.includes(version)) {
  // Version 1 is the current version, so there is nothing to do and the document is
  // returned by identity. When version 2 arrives, this becomes a chain of small
  // upgrade steps and each one gets its own test.
  return { ok: true, doc };
}
```

`SUPPORTED_SCHEMA_VERSIONS` is a **list, not a floor** (`:25-32`) — "a future version 3 that
can still read 1 but not 2 is a real possibility and a `>= MIN` check could not express it."
So it becomes `[1, 2]`, and a `migrateV1ToV2(doc)` step runs when `version === 1`.

**Note the identity guarantee `tests/core/migrate.test.ts:47-57` asserts:**
```ts
// The same object, not a copy that happens to be equal. Version 1 is a passthrough,
// and a passthrough that rebuilt the document would be doing undisclosed work.
expect(result.doc).toBe(doc);
```
That assertion must be retargeted to version **2** and a new one added for the v1 → v2 path.
`docAtVersion` (`:16-31`) is the fixture factory to extend.

**Three sites compare `schemaVersion` and all three must route through `migrate`:**
- `src/store.ts:212` — `if (doc.schemaVersion !== SCHEMA_VERSION) return false;`
- `src/adapters/persistence.ts:222` — `if (parsed['schemaVersion'] !== SCHEMA_VERSION) return null;`
  (on the **wrapper record**, before `isValidTournament` runs — a v1 wrapper is dropped here
  regardless of what `migrate` says about the inner doc)
- `src/core/import-guard.ts:444-448` — already routes through `migrate`.

---

### `src/core/import-guard.ts` (modify — untrusted input validation)

**Analog:** itself. The file is an **allow-list rebuild**: a field it does not name cannot
reach state.

**Config rebuild** (`:248-274`) — the exact block each new field extends:
```ts
function buildConfig(value: unknown): TournamentConfig | null {
  const raw = safeObject(value);
  if (raw === null) return null;

  const players = buildPlayers(raw['players']);
  if (players === null) return null;

  // Refused, not clamped. …
  const rounds = raw['rounds'];
  if (!isPositiveInteger(rounds) || rounds > MAX_ROUNDS) return null;

  const formatLabel = raw['formatLabel'];
  const rosterVersion = raw['rosterVersion'];
  const rosterChecksum = raw['rosterChecksum'];
  if (
    typeof formatLabel !== 'string' ||
    typeof rosterVersion !== 'string' ||
    typeof rosterChecksum !== 'string'
  ) {
    return null;
  }

  return { formatLabel, players, rounds, rosterVersion, rosterChecksum };
}
```

**Bounded array copy** (`:198-216`) — the helper `bans` uses:
```ts
/**
 * A fresh array of strings, or null. The copy is the point: no aliasing into state.
 *
 * `limit` is required rather than optional. Every string array in this document is
 * rendered — pool ids become cells, the starting order becomes turns — so an unbounded one
 * is an unbounded render, and making the caller name its bound means a new array field
 * cannot arrive without someone deciding what its bound is.
 */
function copyStringArray(value: unknown, limit: number): string[] | null { … }
```
`bans: copyStringArray(raw['bans'], MAX_POOL_IDS)`. `dualMegaChoices` needs a
`buildDualMegaChoices` modelled on `buildPlayers` (`:222-246`) — array, per-element
`safeObject`, two named fields written out, explicit bound.

**Literal-union fields** (`banMode`, `depth`) have no existing analog in this file. Follow the
`buildPlayers` posture: a value not in the allowed set returns `null` for the whole config.
**Do not default it** — this file refuses rather than repairs.

**Log-entry rebuild** (`:305-347`) — if seeds go into the payloads (Option A), both
`pool/built` and `draft/started` cases need the new field or the round-trip **silently drops
it**:
```ts
case 'pool/built': {
  const ids = copyStringArray(raw['ids'], MAX_POOL_IDS);
  const rosterVersion = raw['rosterVersion'];
  const checksum = raw['checksum'];
  if (ids === null || typeof rosterVersion !== 'string' || typeof checksum !== 'string') {
    return null;
  }
  return { type: 'pool/built', ids, rosterVersion, checksum, ...envelope };
}
```

**Do not add a referential-integrity check** (`:317-319`, and 02-RESEARCH Open Question 3):
```ts
// Bounded by the player cap rather than by `config.players`. Checking it against the
// configured roster would be referential integrity, which this function deliberately
// does not do — every entry is typed in isolation. A bound is not an integrity check.
```

**Test:** `tests/core/import-guard.test.ts` gains a round-trip fidelity assertion for **every**
new config field. A field in `model.ts` but not here is dropped silently on import.

---

### `src/store.ts` (modify — the single write path)

**Analog:** itself.

**The seam being replaced** (`:168-198`):
```ts
export function createTournament(
  snapshot: RosterSnapshot,
  entries: readonly RosterEntry[],
): TournamentDoc | null {
  const config: TournamentConfig = {
    formatLabel: `Champions ${snapshot.regulation}`,
    players: PHASE_ONE_PLAYERS.map((player) => ({ ...player })),
    rounds: PHASE_ONE_ROUNDS,
    rosterVersion: snapshot.regulation,
    rosterChecksum: snapshot.checksum,
  };

  const seed = newSeed();

  docSignal.value = {
    schemaVersion: SCHEMA_VERSION,
    id: newId(),
    createdAt: now(),
    config,
    rng: { seed, cursor: 0 },
    log: [],
  };
  stateSignal.value = initialState(config);

  dispatch(poolBuilt(entries.map((entry) => entry.id), snapshot.regulation, snapshot.checksum));
  dispatch(
    draftStarted(selectStartingOrder(seed, config.players.map((player) => player.id))),
  );

  return docSignal.peek();
}
```

**Ordering constraint that must survive the rewrite:** both signals are assigned **before** the
two `dispatch` calls, because `dispatch` returns `{ok: false, reason: 'draftNotStarted'}` when
either is null (`:121-123`). 02-RESEARCH §Code Examples gives the new signature.

**Delete** `PHASE_ONE_ROUNDS` / `PHASE_ONE_PLAYERS` (`:48-53`) — labelled scaffolding, comment
says "Phase 2 configures both."

**Envelope stamping — unchanged, and nothing else may do it** (`:118-144`):
```ts
const action: Action = {
  ...intent,
  seq: nextSeq(previous.log),
  at: now(),
  actorId: ACTOR_HOST,
};

const check = canApply(current, action);
if (!check.ok) return check;

// Copy first, then append: the previous document keeps its own log array, so nothing
// that captured it observes a retroactive change.
const next: TournamentDoc = { ...previous, log: [...previous.log] };
next.log.push(action);
```

**`seq` allocation — C-6** (`:100-116`):
```ts
function nextSeq(log: readonly Action[]): number {
  let highest = -1;
  for (const action of log) {
    if (action.seq > highest) highest = action.seq;
  }
  return highest + 1;
}
```

**The comment at `:162-166` is the one this phase has to answer.** It predicts the collision
one phase late; Phase 2 has **two** independently re-rollable derivations (pool draw D-07,
starting order D-04). 02-RESEARCH's recommendation: two independent seeds held as
**pre-document config-screen form state**, each consumed from cursor 0, `doc.rng` untouched.

**`adoptTournament` (`:211-217`) must call `migrate` rather than comparing.** Note it re-folds
from scratch rather than trusting a supplied state — keep that.

**`undo` (`:275-294`) is the second write path and stays `isOwner()`-gated.** The long comment
at `:241-273` explains why `dispatch` is deliberately *not* gated; do not "fix" that symmetry.

---

### `src/adapters/view-prefs.ts` (new — storage adapter, D-20)

**Analog:** `src/adapters/persistence.ts` — same layer, same data flow, same key namespace.

**Key convention** (`:37-41`):
```ts
/** One key, one tournament. Namespaced so a future key cannot collide with this one. */
const STORAGE_KEY = 'champions-drafter:tournament';

/** Written, read back, compared and removed by the canary. Never read by anything else. */
const PROBE_KEY = 'champions-drafter:probe';
```
The new key is `champions-drafter:view` (02-UI-SPEC §View preferences in storage), declared
beside these.

**Read pattern — null on every failure mode, no distinction** (`:195-222`):
```ts
/**
 * The stored document, or null when there is nothing usable to restore.
 *
 * Null for every failure mode without distinguishing between them, because the caller's
 * response is the same in all of them: …
 */
export function load(): TournamentDoc | null {
  let raw: string | null;
  try { … } catch { return null; }

  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return null; }

  if (!isPlainRecord(parsed)) return null;
  …
}
```
Absent / unparseable / unknown value ⇒ silent fallback to `standard` / `split`. **No migration
and no version field** — there is nothing to migrate from, and a view preference that fails to
load costs nothing.

**Write pattern — `try`/`catch` around `JSON.stringify` *and* the write** (`:139-146`,
`:159-167`). **Do not** raise `savingBlocked` from this module: that signal means "this browser
will not save your draft", and a lost pane preference is not that.

**Layer rule:** this file is the *only* place `champions-drafter:view` appears. Neither
`src/core/` nor a component reads `localStorage` directly.

---

### `src/app.tsx` (modify — orchestration / screen router)

**Analog:** itself. This is a restructure, not a rewrite: `handlePick`, `byDexOrder`,
`entryById`, `availableEntries`, the tab-lock effect and the import flow all survive.

**Screen-state discriminated union** (`:51-69`) — the pattern the new landing/config/draft
routing copies:
```ts
type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; bundle: RosterBundle }
  | { status: 'failed'; message: string };

type ImportFlow =
  | { status: 'idle' }
  | { status: 'failed'; message: string }
  | { status: 'confirm'; doc: TournamentDoc };
```
`ImportFlow`'s comment records why `confirm` carries the **already-validated document** rather
than the file — the same reasoning applies to the seven new confirms: hold the resolved
consequence, not the intent.

**The boot effect D-01 replaces** (`:208-226`):
```ts
useEffect(() => {
  if (load.status !== 'ready' || bootedRef.current) return;
  bootedRef.current = true;

  // Restore before creating, never after: createTournament would emit its own
  // pool/built and the restored log would have nowhere to go. …
  const restored = storageOk ? loadSavedTournament() : null;
  if (restored === null || !adoptTournament(restored)) {
    createTournament(load.bundle.snapshot, entries);
  }

  // No autosave when the canary already proved writes do not land. …
  if (storageOk) {
    stopAutosaveRef.current = startAutosave({ subscribe, getDoc });
  }
}, [load, entries, storageOk]);
```
The load-order constraint dissolves once restore and create are two distinct user actions —
but `loadSavedTournament()` must still be probed at landing to decide whether
`Resume saved draft` renders and to build its description line. `startAutosave` moves to
*after* a tournament exists.

**Canary timing stays** (`:150-156`):
```ts
// A state initializer rather than an effect, because an effect runs *after* the first
// paint and the draft would flash up behind the warning.
const [probe] = useState<ProbeResult>(() => probeStorage());
```

**Derived-value memo pattern** (`:276-288`) — the filter/search predicates compose here, in a
**single** `useMemo` keyed on all inputs (02-RESEARCH §Filter cost: "one keystroke produces one
recomputation and one render, not one per filter"):
```ts
const entryById = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries]);

// The pool the grid renders is the selector's output, so a picked species leaves the
// DOM on the same render that recorded it: not greyed, not disabled, removed.
const availableEntries = useMemo(() => {
  if (state === null) return entries;
  return selectAvailablePool(state)
    .map((id) => entryById.get(id))
    .filter((entry): entry is RosterEntry => entry !== undefined);
}, [state, entries, entryById]);
```

**`inert` region and the dialog placement rule** (`:470-479`, `:536-549`):
```tsx
<div class="draft-region" inert={readOnly ? true : undefined}>
```
```tsx
{/*
  OUTSIDE the draft region, and that placement is load-bearing rather than tidy.
  `inert` applies to a subtree, so a modal rendered inside it in a read-only tab
  would render, trap focus, and refuse every click — a dialog nobody can dismiss. …
*/}
```
**Every one of the seven new confirm dialogs renders outside `.draft-region`.**

**A rule the config screen must not break** (`:118-128`, on `handlePick`):
```
 * Note what this function does NOT do: it does not compute whose turn it is, does not
 * check whether the species is still available, and does not touch the log. The turn
 * comes from a selector and the legality check happens inside `dispatch`, because a UI
 * component may not own a game rule.
```
02-RESEARCH §Architectural Responsibility Map names the trap explicitly: the feasibility gate
*feels* like form validation, `check:pure` cannot catch it in a component (it has no forbidden
token), and putting it there leaves Phase 3's RULE-09 nothing to compose with.

---

### `src/ui/components/ConfirmDialog.tsx` (new — dialog primitive)

**Analog:** `src/ui/components/ImportConfirmDialog.tsx` — **exact**. This is a generalisation
of a file that already exists, and `ImportConfirmDialog` is then rebuilt on top of it (D-38).

**Full pattern to copy** (`ImportConfirmDialog.tsx:59-95`):
```tsx
export function ImportConfirmDialog({ pickCount, onConfirm, onCancel }: ImportConfirmDialogProps) {
  return (
    <Dialog
      heading={IMPORT_CONFIRM_HEADING}
      dismissible
      tone="danger"
      onDismiss={onCancel}
      actions={
        <>
          {/*
            Order is deliberate: the destructive action first, the safe one second, so
            the safe one is the last thing focus reaches and the last thing read. Escape
            maps to `Keep current draft` — a reflexive Escape must never be the click
            that destroys the draft.
          */}
          <button
            type="button"
            class="dialog__action import-confirm__replace"
            onClick={onConfirm}
          >
            {REPLACE_LABEL}
          </button>

          <button type="button" class="dialog__action" onClick={onCancel}>
            {KEEP_LABEL}
          </button>
        </>
      }
    >
      <p>{importConfirmBody(pickCount)}</p>
    </Dialog>
  );
}
```

Four contracts encoded there, all seven Phase 2 confirms inherit them:
1. `onDismiss` (Escape) maps to the **safe** callback, never the confirming one.
2. Confirm button rendered **first**, safe button **second**.
3. Body is a `<p>` holding a **pre-composed string** from a copy function — never inline JSX
   prose (see S-5).
4. `tone` is `'danger'` only for genuine data loss. 02-UI-SPEC §11 assigns `danger` to two of
   the seven (abandon draft, import over a live draft) and `default` to the other five.

**`Dialog.tsx` is unchanged** (`:59-149`). Its three focus behaviours are already implemented:
moved-in (`:72-79`), trapped (`:81-125`), restored (`:76-78`). Do not reimplement any of them.

**Do not add a second dialog primitive.** 02-RESEARCH §Don't Hand-Roll: "a second pattern is
where accessibility bugs come from."

---

### `src/ui/components/FeasibilityBar.tsx` (new — status + primary action)

**Analog:** `src/ui/components/TopBar.tsx:138-186` — a bar of controls plus a `role="status"`
message, same layer, same data flow.

```tsx
<div class="top-bar">
  <div class="top-bar__controls">
    <button
      type="button"
      class="top-bar__button"
      onClick={handleUndo}
      disabled={!undoAvailable}
      aria-disabled={undoAvailable ? 'false' : 'true'}
    >
      Undo last pick
    </button>
    …
  </div>

  {/*
    Polite, and inline rather than modal. A refused import has changed nothing, so
    interrupting the host with a dialog they must dismiss would overstate it — the
    message names the problem and the next action, and the draft is still there
    behind it. `role="status"` is what carries it to a screen reader.
  */}
  {importError !== null && (
    <p class="top-bar__message" role="status">
      {importError}
    </p>
  )}
</div>
```

**Divergence to encode explicitly** (see S-9): `Start draft` takes `aria-disabled` **without**
native `disabled`, stays focusable, has `aria-describedby` pointing at the reason element, and
its handler returns early. `TopBar.css:76` already documents the `aria-disabled` styling
convention (`opacity: 0.45; cursor: not-allowed`).

The component **renders** `FeasibilityResult`; it computes nothing. 02-RESEARCH §Pattern 1:
```tsx
const blockers = result.problems.filter((p) => p.severity === 'blocking');
const shown = result.problems[0];           // already precedence-sorted
const extra = Math.max(0, blockers.length - 1);
```

---

### `src/ui/components/PoolGrid.tsx` + `.css` (modify — extend)

**Analog:** itself. The doc comment names this phase's additions verbatim (`:8-22`):
```tsx
/**
 * The pool surface.
 *
 * D-06: this is the real component Phase 2 extends with search (DRFT-08), type and
 * Mega filters (DRFT-09) and the density toggle (DRFT-06) — not scaffolding to be
 * replaced. Those all narrow or restyle `entries`, which is why the count beneath the
 * heading is derived from what is actually rendered rather than from the snapshot
 * total: once a filter exists, `{n} available` must follow the filter.
 *
 * Ships without virtualization, deliberately. …
 */
```

**Keying — do not change** (`:39-43`):
```tsx
<div class="pool__grid">
  {entries.map((entry) => (
    <MonCard key={entry.id} entry={entry} spriteMeta={spriteMeta} onPick={onPick} />
  ))}
</div>
```
Keyed by `entry.id`, stable under filtering. Keying by index would rewrite every cell's
contents on a filter change and break the focus-restoration contract (02-UI-SPEC §8).

**CSS contract to preserve** (`PoolGrid.css:1-31`):
```css
/*
 * auto-fill rather than auto-fit: auto-fill keeps empty tracks, so a heavily filtered
 * pool in Phase 2 leaves its remaining cells at their normal size instead of
 * stretching two survivors across the whole row.
 */
.pool__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--cell-min), 1fr));
  gap: var(--space-2);
}
```
`auto-fill` is load-bearing and documented. It also means the column count cannot be known
statically — hence `useRovingTabindex` must **measure** it (02-UI-SPEC names this one of
exactly two legitimately-UI-layer items).

**Ban mode** reuses this component whole, including its header, filter bar and density control
(02-UI-SPEC §2). Count line becomes `{n} of 235 banned` — derived, never a literal.

---

### `src/ui/components/MonCard.tsx` + `.css` (modify — extend)

**Analog:** itself (`:7-15`):
```tsx
/**
 * One pool cell: sprite above name, the whole cell a real button.
 *
 * Phase 2 adds typing and base stats here (DRFT-05). The props are shaped so that is
 * an addition rather than a rewrite.
 * …
 */
```

**CSS change required by D-25** (`MonCard.css:11-26`):
```css
.mon-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  height: var(--cell-h);        /* ← becomes min-height (02-UI-SPEC §Density Contract) */
  padding: var(--space-2);
  …
  /* Motion budget: colour only, at most 120ms. No layout or entrance animation. */
  transition: background-color 120ms ease;
}
```
Its own header comment (`:1-9`) claims "Phase 2's density toggle changes `--sprite-lg`,
`--cell-min`, `--cell-h` and `--text-label`; nothing in this file should need to change with
it." **D-25 breaks that claim — rewrite the comment in the same change.**

**No per-component focus rule** (`:32-36`):
```css
/*
 * No :focus rule here on purpose — the global accent ring in app.css covers every
 * focusable element, and a per-component ring is how a design system drifts.
 * No :active rule either; the pick is instant, so there is nothing to preview.
 */
```
`TypePill.css` and `StatBlock.css` inherit this: no focus rules, no `:active`.

---

### `src/ui/components/BoardGrid.tsx` + `.css` (modify — extend)

**Analog:** itself. Already parameterised on `players` and `rounds` (`:35-55`):
```tsx
export interface BoardGridProps {
  players: readonly PlayerConfig[];
  rounds: number;
  /** Player id to an ordered slot array, straight from `selectTeams`. */
  teams: Record<string, (string | null)[]>;
  currentTurn: Turn | null;
  entryById: ReadonlyMap<string, RosterEntry>;
  spriteMeta: SpriteMeta;
  pickCount: number;
}
```
```tsx
const roundNumbers = Array.from({ length: rounds }, (_, index) => index + 1);
```

**Round labels already survive a different count** (`:24-33`):
```tsx
const ROUND_LABELS = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'] as const;

function roundLabel(round: number): string {
  return ROUND_LABELS[round - 1] ?? `R${round}`;
}
```

**Empty-state copy must name the actual first player** (`:63-70`) — currently hardcoded
`Player 1`, and "below" is wrong once the pool is beside the board:
```tsx
{pickCount === 0 && (
  <div class="board__empty">
    <h3 class="board__empty-heading">No picks yet</h3>
    <p class="board__empty-body">
      Player 1 picks first. Choose any Pokémon in the pool below to start Round 1.
    </p>
  </div>
)}
```

**The sanctioned raw length** (`BoardGrid.css:1-7, 37-42`):
```css
/*
 * Consumes tokens only; declares no raw colour. The two raw lengths here (the label
 * column width and the scroll floor) are not values the token table covers — they are
 * this one layout's geometry, specified as such in the UI Design Contract.
 */
.board__grid {
  display: grid;
  grid-template-columns: 160px repeat(6, minmax(0, 1fr));
  gap: var(--space-2);
  align-items: stretch;
}
```
`160px` → `176px`, and `repeat(6, …)` must become the derived round count. The comment above it
is the template for justifying `60fr 40fr` in `SplitPanes.css` — 02-UI-SPEC sanctions exactly
two raw lengths for this phase (C-9).

**`nextSlotIndex` — the D-22 highlight already works** (`:91-97`):
```tsx
// Exactly one cell on the whole board is marked as next, and none once
// the draft is complete — `currentTurn` is null from that point on.
nextSlotIndex={
  currentTurn !== null && currentTurn.playerId === player.id
    ? currentTurn.round - 1
    : null
}
```

---

### `src/ui/components/TeamStrip.tsx` (modify — pass `showName` through)

**Analog:** itself (`:16-20`, `:39-61`):
```tsx
/**
 * It returns a fragment rather than a wrapper element so its cells are direct children
 * of the board's grid and land in the parent's columns. There is no `display: contents`
 * anywhere as a result, which sidesteps that property's accessibility-tree caveats
 * entirely.
 */
```
```tsx
const className = [
  'board__cell',
  monId === null ? 'board__cell--empty' : 'board__cell--filled',
  isNext ? 'board__cell--next' : '',
]
  .filter((token) => token !== '')
  .join(' ');
```
That array-join is the house pattern for conditional class names. Reuse it for
`data-density` / pane-state classes rather than template-literal concatenation.

**02-UI-SPEC says of this component: "Passes `showName` through from the pane state. Nothing
else."** Do not add logic here.

---

### `src/ui/components/TurnBanner.tsx` (modify — derive the literals)

**Analog:** itself (`:25`, `:34-58`):
```tsx
const DRAFT_COMPLETE_COPY = 'Draft complete — 12 picks, 2 teams';

export function TurnBanner({ round, playerName, complete }: TurnBannerProps) {
  const spoken =
    complete === true
      ? DRAFT_COMPLETE_COPY
      : round === null || playerName === null
        ? null
        : `Round ${round} of 6 — ${playerName} picks`;

  useEffect(() => {
    if (spoken !== null) announce(spoken);
  }, [spoken]);
```

The header comment (`:10-14`) explicitly authorises the change: "The round total and the pick
and team counts are literal here rather than derived from config: … Phase 2 replaces the whole
line when player count becomes configurable."

**Keep the spoken-first ordering.** Build the plain-text string, announce it, then render the
markup from the same values — never reconstruct the announcement from the DOM. 02-UI-SPEC adds
a conditional `Filters cleared.` suffix to the announcement (D-35).

---

### `src/ui/components/TopBar.tsx` (modify — bans disclosure, abandon, undo gate)

**Analog:** itself.

**The D-37 gate must go inside `handleUndo`, not on the button** (`:82-84`, `:108-136`):
```tsx
const handleUndo = useCallback(() => {
  undo(resolveSpeciesName);
}, [resolveSpeciesName]);
```
```tsx
useEffect(() => {
  function onKeyDown(event: KeyboardEvent): void {
    …
    if (isTextEntry(event.target)) return;
    // This listener is on `document`, which is OUTSIDE the `inert` draft region. …
    if (!isOwner()) return;

    event.preventDefault();
    handleUndo();
  }

  document.addEventListener('keydown', onKeyDown);
  return () => { document.removeEventListener('keydown', onKeyDown); };
}, [handleUndo]);
```
Both the button (`:144`) and the shortcut (`:129`) call `handleUndo`. Gating only the button
leaves `Ctrl+Z` bypassing the confirm (Pitfall 6).

**`isTextEntry` already exists and already anticipates this phase** (`:56-70`):
```tsx
/**
 * Ctrl+Z inside a text field means "undo my typing" and always has. Stealing it there
 * would be the kind of shortcut that teaches people not to trust shortcuts. Phase 1 has
 * no text input on the draft screen, but Phase 2 adds pool search (DRFT-08) directly
 * into this bar, and by then the check has to already exist.
 */
```
Do not rewrite it; the search field is exactly the case it was written for.

**Hidden-input pattern for the file picker** (`:159-172`) — reuse if the landing screen's
`Import JSON…` needs its own:
```tsx
{/*
  Hidden rather than visually-hidden. A file input styled off-screen stays in the
  tab order, so a keyboard user would meet an unlabelled second control that does
  the same thing as the button beside it. `hidden` removes it from the tab cycle
  and from assistive technology while leaving `.click()` working …
*/}
<input ref={fileInputRef} type="file" accept="application/json,.json" hidden onChange={handleFileChange} />
```

---

### `src/ui/use-roving-tabindex.ts` (new — hook)

**Analog:** `src/ui/use-ownership.ts` — **exact**. The only hook in the repository.

```ts
import { useEffect, useRef, useState } from 'preact/hooks';

/**
 * Subscribe a component to the tab lock.
 *
 * A hook rather than a signal because the lock is an adapter and adapters do not import
 * the UI's reactivity. …
 *
 * The initial value is read synchronously from `ownershipState()` rather than defaulted
 * and corrected in an effect. …
 */
export function useOwnership(): OwnershipState {
  const [state, setState] = useState<OwnershipState>(ownershipState);
  const wasReadOnly = useRef(state.readOnly);
  …
  return state;
}
```

Copy: kebab-case filename, `use*` export, `preact/hooks` imports, a doc block that states why
it is a hook and not something else, and the "read synchronously on first render rather than
defaulting and correcting in an effect" discipline — which matters here because the grid's
column count must be right on the first arrow-key press, not one frame later.

**Two consumers** (02-UI-SPEC §Component inventory): the pool grid (235 cells) and the type
toolbar (18 pills). Write it for both from the start.

---

### `src/ui/screens/LandingScreen.tsx` (new — screen)

**Analog:** `src/ui/screens/StorageBlocked.tsx` — same directory, same role, **no CSS file**
(it composes existing components and uses `.app-shell`).

```tsx
/**
 * Verbatim from the approved UI-SPEC copywriting table, as one string rather than JSX
 * prose. Whitespace between JSX text lines collapses, which usually produces the right
 * result and cannot be relied on to produce this exact one — and this sentence is a
 * contract, down to the em dash.
 */
const BODY_COPY = 'Storage is unavailable or restricted here — private browsing, …';

export interface StorageBlockedProps {
  onAcknowledge: () => void;
}

export function StorageBlocked({ onAcknowledge }: StorageBlockedProps) {
  return (
    <Dialog heading="This browser will not save your draft" dismissible={false} tone="danger" …>
      <p>{BODY_COPY}</p>
    </Dialog>
  );
}
```

The landing screen **hosts** `StorageBlocked` (D-01 moves the canary here) rather than
reimplementing it. Its shell classes come from `src/ui/app.css:27-39`:
```css
.app-shell { max-width: 1600px; margin-inline: auto; padding: var(--space-4); }
.app-shell__title { margin: 0 0 var(--space-5); font: var(--text-display); }
```
02-UI-SPEC §1 caps the config/landing shell at 1200px — that is a per-screen modifier class,
not a change to `.app-shell`.

---

### `src/ui/screens/ConfigScreen.tsx` + `.css` (new — form screen)

**Analog for structure:** `src/app.tsx:147-226` — a component that holds `useState`, derives
with `useMemo`, and passes plain data down. **Analog for the form controls themselves: none.**

**What exists to copy:**
- State-per-concern with `useState`, derivations in `useMemo` keyed on every input
  (`app.tsx:197-200`, `:276-288`).
- Pre-document form state is *not* dispatched. CONTEXT §Established Patterns: "Config changes
  made *before* the tournament exists are pre-document form state; everything after is an
  action." `dispatch` is only reached at Start, via `createTournament`.
- Seed handling at the impure edge: `newSeed()` from `src/adapters/id.ts:18-22`, called in a
  `useState` initializer, re-drawn (not advanced) per re-roll. 02-RESEARCH §Code Examples gives
  the exact snippet.

**What has no analog and must come from 02-UI-SPEC §2 / §4 / 02-RESEARCH:**
`<fieldset>`, `<legend>`, `<label>`, text `<input>`, numeric `<input>`, radio groups, and
`role="combobox"`. Grep confirms **zero** occurrences of any of these under `src/` — the only
`<input>` in the codebase is `TopBar.tsx:166`, a hidden file picker. The planner must treat
02-UI-SPEC §2 as the specification of record and must not look for a house pattern that does
not exist.

**Existing measure convention to reuse:** `max-width: 60ch` (`app.css:49`,
`BoardGrid.css:29`). 02-UI-SPEC caps text and numeric inputs at `60ch` on the same basis.

---

### `src/ui/components/SplitPanes.tsx` + `.css` (new — layout shell)

**Analog:** `src/ui/app.css:52-65` (a styleless wrapper carrying one behaviour) and
`src/ui/components/BoardGrid.css:33-42` (a grid with a sanctioned raw length).

```css
/*
 * The draft region — everything a read-only tab must not be able to touch.
 *
 * It exists to carry one attribute, `inert`, so the wrapper is deliberately styleless:
 * no transform, no filter, no containment. Any of those would create a containing block
 * and break the `position: sticky` head nested inside it.
 * …
 */
.draft-region { display: block; }
```

**This is the constraint that most easily breaks `SplitPanes`.** The `sticky-head`
(`app.tsx:485`) and the `FeasibilityBar`'s `position: sticky; bottom: 0` both live inside these
wrappers. Any `transform`, `filter`, `contain` or `will-change` on a pane creates a containing
block and silently kills the stickiness. State that in the stylesheet comment, as `.draft-region`
does.

Independent pane scrolling follows `BoardGrid.css:33-35`'s `overflow-x: auto` precedent —
scroll on an inner wrapper, never on the grid itself.

---

### `src/ui/tokens.css` (modify — extend **and** amend)

**Analog:** itself. Two stated contracts are broken this phase and **both comments must be
rewritten in the same change**.

**Amendment 1 — the density contract** (`:10-11`):
```css
 * Phase 2 density contract: the densities change exactly four tokens —
 * --sprite-lg, --cell-min, --cell-h, --text-label. Nothing else.
```
D-25 makes densities change *content*, not only scale. Rewrite.

**Amendment 2 — the reserved-colour rule** (`:80-81`):
```css
  /* The focus ring is the accent, always. Reserved use 3 of 3. */
  --focus-ring: var(--color-accent);
```
D-26/D-27 add 18 type hues plus two inks. Rewrite "Reserved use 3 of 3", and add every new
token with its **measured contrast ratio** in the token table, matching the existing format
(`:65-66`):
```css
  /* --- Colour. Contrast ratios are from the UI-SPEC's full token table; every text
   *     pairing clears 4.5:1 and every state-carrying boundary clears 3:1. --- */
```

**The type scale is closed** (`:58-59`) — "Exactly four sizes, exactly two weights. No 500, no
700, no italics. No surface may introduce a fifth size." Board names at `board-full` use the
existing `--text-body` (18px); no new token.

**The file declares values and never styles an element** (`:5-6`). New tokens go on `:root`;
`.type-pill` rules live in `TypePill.css`.

---

### `tests/core/feasibility.test.ts`, `tests/core/draw.test.ts`, `tests/core/search.test.ts` (new)

**Analog:** `tests/core/selectors.test.ts:1-89` — **exact**.

```ts
/**
 * Selectors — every piece of derived data, and nothing stored.
 * …
 * Zero mocks, as everywhere in `src/core`.
 */
import { describe, expect, it } from 'vitest';

const CREATED_AT = 1_700_000_000_000;
const POOL = ['venusaur', 'charizard', 'blastoise', /* real roster ids */];
const CONFIG: TournamentConfig = { formatLabel: 'Champions Test', players: [ … ], rounds: 6, … };

/** The envelope, added by hand. */
function stamp(intent: Intent, seq: number): Action {
  return { ...intent, seq, at: CREATED_AT + seq, actorId: 'host' };
}
```

Copy: module-level fixture constants, real roster ids (not `mon-1`), a local `stamp` helper,
and **no import of `src/store.ts`**. Default env is `node` — do not add an environment comment.

**Fixture-test family** — `tests/ui/sprite-resolution.test.ts:15-31` is the model for the
roster tripwire (Pitfall 9), reading the **real committed data**:
```ts
import committedSnapshot from '../../public/data/roster.mb.json';
import committedSpriteMeta from '../../public/data/sprite-meta.json';

const snapshot = committedSnapshot as unknown as RosterSnapshot;
```
The tripwire asserts the current counts (235 draftable, 74 Mega-capable, exactly 2 dual-Mega
species, 18 types) so a regulation rotation produces a loud failure rather than a subtly wrong
gate. It belongs in `tests/core/roster/fixtures.test.ts` or beside it.

**Non-mutation assertion pattern** (`tests/core/migrate.test.ts:83-90`) — reuse for
`copyConfig`'s aliasing test:
```ts
it('does not mutate the document it refuses', () => {
  const doc = docAtVersion(99);
  const before = JSON.stringify(doc);
  migrate(doc);
  expect(JSON.stringify(doc)).toBe(before);
});
```

---

### `tests/ui/*.test.tsx` (new)

**Analog:** `tests/ui/read-only-shell.test.tsx:1-75` — **exact**.

```tsx
// @vitest-environment happy-dom      ← LINE 1. Before the doc block, before any import.

/**
 * `inert` on the draft region …
 *
 * What this file cannot prove: that `inert` genuinely blocks focus and pointer events.
 * happy-dom parses the attribute but does not implement its focus semantics …
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Hoisted so the `vi.mock` factory below can see it.
 *
 * `vi.mock` is lifted above every import, so a fixture declared as a plain `const` would
 * still be in its temporal dead zone when the factory runs.
 */
const fixture = vi.hoisted(() => { … });
```

The synthetic roster fixture inside `vi.hoisted` (`:33-74`) is the shape to copy for any UI
test needing entries — full `RosterEntry` objects plus a `spriteMeta.byRosterId` map keyed by
entry id. **`spriteMissing: true` in the fixture** so the test never depends on a file on disk.

Also copy the file's honesty about its own limits: happy-dom does not implement `inert` focus
semantics, `content-visibility`, or 200% zoom. The D-23 3-metre legibility check and
02-UI-SPEC Assertion 7 must be scheduled as a **`checkpoint:human-verify`**, never asserted.

---

## No Analog Found

| File | Role | Data flow | Reason |
|------|------|-----------|--------|
| `src/ui/components/SegmentedControl.tsx` | form control | request-response | No `<fieldset>`, `<legend>`, `<label>` or radio input exists anywhere under `src/`. Six instances in this phase. Use 02-UI-SPEC §Pattern 4 / §2 verbatim. |
| `src/ui/components/TypeaheadField.tsx` | combobox | request-response | No `role="combobox"`, `role="listbox"`, `aria-activedescendant` or visible `<input>` exists. Use 02-UI-SPEC §4. |
| `src/ui/components/PlayerList.tsx` | editable list | CRUD | No text `<input>`, no add/remove row pattern exists. Use 02-UI-SPEC §2 group 1. |
| `src/ui/components/FilterBar.tsx` — the `role="toolbar"` + roving-tabindex part | toolbar | event-driven | No `role="toolbar"` and no roving tabindex exists. `TopBar` is the closest *layout* analog only. Use 02-UI-SPEC §8. |
| Type-colour token block in `tokens.css` | config | — | No multi-hue palette exists — the file has exactly three reserved colour roles. 18 hues + 2 inks with measured ratios is genuinely new; follow 01-UI-SPEC's token-table format as D-27 requires. |
| The D-23 physical legibility pass | verification | — | Cannot be automated. Requires a person, a 1080p screen and three metres; two passes (`split` and `board-full`), both results recorded. |

---

## Anti-Patterns (from the analogs, restated so a plan can cite them)

| Do not | Because | Source |
|--------|---------|--------|
| Put the feasibility gate in the config component | It carries no forbidden token, so `check:pure` cannot catch it, and Phase 3's RULE-09 then has nothing to compose with | 02-RESEARCH §Architectural Responsibility Map; `app.tsx:118-128` |
| Derive `seq` from `log.length` | Undo removes an entry; a length-derived `seq` collides with one still in the log and `draft/pickUndone` retracts the wrong pick | `store.ts:100-116` |
| Construct `sprites/${entry.spriteId}.png` | Resolves for **zero** of 235 entries, and the 404s are silent | `tests/ui/sprite-resolution.test.ts:1-13` |
| `split('-')` a species name | `Kommo-o`, `Mr. Rime`, `Tauros-Paldea-Aqua`, `Rotom-Wash` | CLAUDE.md §Identity |
| Store a `Set`, `Map` or `Date` in the document | `JSON.stringify` → `JSON.parse` must round-trip unchanged. A `Set` as a computation-local is fine and is already the house pattern | `model.ts:15-19`; `reduce.ts:137` |
| Emit the shuffle's output order as `pool/built.ids` | The grid would reshuffle under the host's cursor; Rotom's five appliances would scatter | `selectors.ts:34-39`; `app.tsx:101-116` |
| Write `MonChip`'s `alt` and `showName` as two independent props | A caller can desynchronise them and the cell loses its accessible name | `MonCard.tsx:24-31`; 02-UI-SPEC "single most breakable contract" |
| Build a second confirm-dialog pattern | `Dialog.tsx` already solves focus-trap, Escape and return-focus | `Dialog.tsx:14-27` |
| Gate the undo confirm on the button only | `Ctrl+Z` is registered on `document`, outside the `inert` subtree | `TopBar.tsx:118-129` |
| Render a dialog inside `.draft-region` | `inert` would trap focus in a modal nobody can dismiss | `app.tsx:536-542` |
| Add a runtime dependency | C-1. Two exact-pinned packages, full stop — escalate rather than gate behind a checkpoint | CLAUDE.md §Conventions; 02-RESEARCH §Package Legitimacy Audit |
| Add `content-visibility: auto` pre-emptively | Phase 1 ships 235 cells verified; it also conflicts with the `height` → `min-height` change | 02-RESEARCH §Rendering |
| Leave a stale contract comment | `tokens.css:10-11` and `:80` are both broken this phase; a stale comment is worse than none | CONTEXT §Specific Ideas |

---

## Metadata

**Analog search scope:** `src/core/`, `src/core/roster/`, `src/adapters/`, `src/ui/`,
`src/ui/components/`, `src/ui/screens/`, `tests/core/`, `tests/ui/`, `scripts/`

**Files scanned:** 81 (full repository listing of `src/`, `tests/`, `scripts/`)
**Files read for excerpts:** 30
**Grep passes:** 3 (form-control markup, `schemaVersion` comparison sites, UI-SPEC headings)

**Pattern extraction date:** 2026-08-07
**Line numbers current as of commit:** `6a71817`
