---
phase: 01-draft-skeleton-on-a-real-url
reviewed: 2026-08-06T20:35:45Z
depth: standard
files_reviewed: 45
files_reviewed_list:
  - .github/workflows/deploy.yml
  - public/sw.js
  - scripts/build-roster.mjs
  - scripts/build-sprites.mjs
  - scripts/build-sw-manifest.mjs
  - scripts/check-pure-core-selftest.mjs
  - scripts/check-pure-core.mjs
  - src/adapters/clock.ts
  - src/adapters/file-io.ts
  - src/adapters/id.ts
  - src/adapters/persistence.ts
  - src/adapters/roster-source.ts
  - src/adapters/tab-lock.ts
  - src/app.tsx
  - src/core/actions.ts
  - src/core/export/paste.ts
  - src/core/import-guard.ts
  - src/core/migrate.ts
  - src/core/model.ts
  - src/core/reduce.ts
  - src/core/rng.ts
  - src/core/roster/transform.ts
  - src/core/roster/types.ts
  - src/core/selectors.ts
  - src/core/undo.ts
  - src/main.tsx
  - src/store.ts
  - src/ui/components/BoardGrid.tsx
  - src/ui/components/CheckpointPrompt.tsx
  - src/ui/components/Dialog.tsx
  - src/ui/components/ExportPanel.tsx
  - src/ui/components/ImportConfirmDialog.tsx
  - src/ui/components/LiveRegion.tsx
  - src/ui/components/MonCard.tsx
  - src/ui/components/MonChip.tsx
  - src/ui/components/PoolGrid.tsx
  - src/ui/components/ReadOnlyBanner.tsx
  - src/ui/components/TeamStrip.tsx
  - src/ui/components/TopBar.tsx
  - src/ui/components/TurnBanner.tsx
  - src/ui/screens/CompletedDraft.tsx
  - src/ui/screens/StorageBlocked.tsx
  - src/ui/sprite-src.ts
  - src/ui/use-ownership.ts
  - src/vite-env.d.ts
findings:
  critical: 3
  warning: 15
  info: 6
  total: 24
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-08-06T20:35:45Z
**Depth:** standard
**Files Reviewed:** 45
**Status:** issues_found

## Summary

The architecture holds up under adversarial reading. `src/core` really is pure, the append-only
log really is the truth, `dispatch` really is the only append path, the blank-line record
separator in `paste.ts` is correct and defended, `seq` allocation is `max(seq)+1` as documented,
sprite filenames come from `spriteMeta.byRosterId`, and the import guard's prototype-pollution
defences (parse-boundary reviver plus `Object.prototype.hasOwnProperty.call` for the
`localStorage` path) are genuinely correct — including the literal-key form `JSON.parse`
produces.

The defects are at the seams, and three of them are serious.

The import guard bounds the *count* of log entries but bounds nothing else. `config.rounds`
accepts any positive safe integer, and `selectTeams` turns that number directly into
`Array.from({ length: rounds })` per player during render — a twenty-byte field in a crafted
file allocates a multi-billion-element array, the crafted document has already been written to
`localStorage` by the time the render throws, and the app then fails to render on every
subsequent reload. That is a persistent brick from a file the host was handed by a friend, which
is precisely the threat model `import-guard.ts` names in its own header.

The tab lock has two holes. The `Ctrl+Z` handler is registered on `document`, so it fires in a
read-only secondary tab where `inert` blocks every visible control — the undo lands in the local
store, and if that tab is later promoted, `loadIfNewer` sees an equal generation, declines to
re-read, and the secondary's autosave overwrites the owner's pick. That is the exact T-01-40
clobber the lock was built to prevent, arriving through the keyboard. Separately, `release()`
cancels the claim window without resolving it, so a `pagehide` inside the 250 ms boot window
leaves the tab in `claiming` forever: `isOwner()` is false, every autosave is silently refused,
and `readOnly` is false so no banner and no takeover button ever appear.

Everything below cites a line. Nothing below is a style preference.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: An imported file with a large `rounds` permanently bricks the app

**File:** `src/core/import-guard.ts:203`, `src/core/selectors.ts:67`, `src/ui/components/BoardGrid.tsx:55`
**Issue:**
`buildConfig` accepts any positive safe integer for `rounds`:

```ts
const rounds = raw['rounds'];
if (!isPositiveInteger(rounds)) return null;   // import-guard.ts:203 — up to 2^53
```

`selectTeams` then turns that number straight into an allocation, once per player, during App's
render:

```ts
teams[playerId] = Array.from({ length: state.config.rounds }, () => null);  // selectors.ts:67
```

and `BoardGrid` does the same for the header row (`BoardGrid.tsx:55`). A twenty-byte field —
`"rounds": 4000000000` — passes every gate and produces an out-of-memory abort or a
`RangeError: Invalid array length` inside `App`'s render. The 5 MB size gate and the 20 000-entry
log cap do not constrain it, because it is one small number.

The failure is persistent, not transient. `adoptImported` writes the document to `localStorage`
*before* the render that crashes:

```ts
if (!adoptTournament(imported)) { ... }
if (storageOk) saveTournament(imported);   // app.tsx:327-332 — persisted first, rendered after
```

On the next load, `loadSavedTournament()` returns it, `isValidTournament` passes it (the same
unbounded check), `adoptTournament` installs it, and the render throws again. The app never
reaches `TopBar`, so the host cannot use `Import JSON…` to recover. Only clearing site data
recovers it.

The same class of hole exists for two neighbouring fields: `buildPlayers` bounds the array only
as "non-empty" (`import-guard.ts:171`), and `pool/built` copies `ids` with no length bound
(`import-guard.ts:250`) — within the 5 MB budget that is roughly 1.5 million ids, every one of
which `PoolGrid` renders as a `MonCard`.

**Fix:** Bound every collection and every count in the guard, next to `MAX_LOG_ENTRIES`, which
already establishes the pattern:

```ts
/** Six rounds today; twelve is already generous headroom for Phase 2. */
export const MAX_ROUNDS = 24;
/** PROJECT.md scales past 8 players but never past a room. */
export const MAX_PLAYERS = 64;
/** The committed snapshot is 235 rows; a pool cannot exceed the roster. */
export const MAX_POOL_IDS = 5000;

// buildConfig
if (!isPositiveInteger(rounds) || rounds > MAX_ROUNDS) return null;

// buildPlayers
if (!Array.isArray(value) || value.length === 0 || value.length > MAX_PLAYERS) return null;

// buildLogEntry, 'pool/built'
const ids = copyStringArray(raw['ids']);
if (ids === null || ids.length > MAX_POOL_IDS) return null;
```

Consider also bounding `copyStringArray` itself so `draft/started.order` cannot carry a million
strings.

---

### CR-02: `Ctrl+Z` bypasses `inert` in a read-only tab and clobbers the owner's draft

**File:** `src/ui/components/TopBar.tsx:107-125`, `src/store.ts:240-257`, `src/app.tsx:446`
**Issue:**
`app.tsx:446` makes the whole draft region `inert` when the tab is a secondary, which correctly
blocks the `Undo last pick` button, every pool cell, and the tab order. But `TopBar` registers
its keyboard shortcut on `document`, outside that subtree:

```ts
document.addEventListener('keydown', onKeyDown);   // TopBar.tsx:121
```

`inert` governs focus and pointer/keyboard *targeting* inside a subtree; it does not stop a
document-level listener from firing when the event target is `<body>`. So `Ctrl+Z` in a read-only
tab reaches `handleUndo` → `store.undo()`, which has no ownership gate at all
(`store.ts:240-257`): it writes `docSignal` and `stateSignal`, drops a pick from the local log,
and announces the undo into the live region.

`persistence.save()` refuses the write (`isOwner()` is false), so nothing is corrupted *yet*. The
damage lands on promotion. `onPromote` runs `adoptWhateverIsNewer` → `loadIfNewer()`, which
compares generations:

```ts
if ((storedGeneration as number) <= generation) return null;   // persistence.ts:290
```

If the owner has not saved since this tab last re-read, the generations are equal, `loadIfNewer`
returns `null`, and the secondary keeps its locally-undone document. The next autosave writes it
back and the owner's pick is gone — the exact T-01-40 clobber the lock exists to prevent, and
the file comments claim is "structurally unreachable".

The read-only banner also lies for the whole session in between: the board in that tab silently
disagrees with the stored truth.

**Fix:** Gate the shortcut on ownership at the source, and make the store's second write path
enforce the same rule the first one does. In `TopBar`:

```ts
import { isOwner } from '../../adapters/tab-lock';
// ...
if (isTextEntry(event.target)) return;
if (!isOwner()) return;   // inert covers the button; this covers the keystroke
```

and, because a UI check must not be the guarantee, in `store.undo()`:

```ts
export function undo(resolveSpeciesName?: (monId: string) => string): boolean {
  if (!isOwner()) return false;
  const previous = docSignal.peek();
  ...
```

(`store.ts` already imports from `./adapters/*`, so this does not cross the purity boundary.)

---

### CR-03: `release()` during the claim window deadlocks the tab into permanent, silent read-only

**File:** `src/adapters/tab-lock.ts:490-506`, `src/adapters/tab-lock.ts:447-473`, `src/adapters/tab-lock.ts:553-571`
**Issue:**
`release()` tears down the claim timer before it checks whether this tab is the owner:

```ts
function release(): void {
  cancelClaimWindow();      // tab-lock.ts:491 — clears claimTimer, resolves nothing
  stopStaleWatch();
  if (status !== 'owner') return;   // tab-lock.ts:494 — 'claiming' returns here
  ...
  status = 'idle';
}
```

`installLifecycle` wires `release()` to `pagehide` (`tab-lock.ts:556`). If `pagehide` fires during
the 250 ms `CLAIM_WINDOW_MS`, the tab is left in `status === 'claiming'` with no pending timer.
The bfcache restore path cannot recover it, because `claim()` refuses to re-run:

```ts
function claim(): void {
  if (status !== 'idle') return;   // tab-lock.ts:448 — 'claiming' returns here
```

The resulting state is the worst combination available:

- `isOwner()` → `status === 'idle' || status === 'owner'` → **false**, so `persistence.save()`
  returns early on every autosave and on the `pagehide` flush.
- `readOnly` → `status === 'secondary'` → **false**, so `ReadOnlyBanner` renders nothing and the
  `Take over drafting here` button never appears.
- `savingBlocked` is never raised — `save()`'s ownership refusal deliberately does not set it
  (`persistence.ts:159`), and that is correct for a genuine secondary.

The host drafts a full tournament with no banner, no warning, and nothing written. Closing the
tab loses all of it. The module header names deadlock as "a *worse* outcome than the race it
prevented"; this is that deadlock, reachable by navigating away and pressing Back within a
quarter-second of load.

A milder variant of the same line hits real secondaries: `stopStaleWatch()` runs before the owner
check, so a secondary restored from bfcache has lost its stale watch permanently and will never
report a dead owner (see WR-10).

**Fix:** Resolve the claim window instead of abandoning it, and let a restored tab re-run the
protocol:

```ts
function release(): void {
  if (status === 'claiming') {
    // Never leave a tab wedged mid-protocol. Back to idle so `pageshow` can re-claim,
    // and so `isOwner()` matches the pre-lock behaviour in the meantime.
    cancelClaimWindow();
    stopStaleWatch();
    status = 'idle';
    emittedStatus = null;
    return;
  }

  cancelClaimWindow();
  stopStaleWatch();
  if (status !== 'owner') return;
  ...
}
```

and re-arm the stale watch on `pageshow` for a restored secondary rather than dropping it.

## Warnings

### WR-01: A Cache API failure in the service worker breaks every request, online or not

**File:** `public/sw.js:63-74`
**Issue:** The `fetch` handler passes an unguarded promise chain to `respondWith`:

```js
event.respondWith(
  caches.open(CACHE_NAME)
    .then((cache) => cache.match(request, { ignoreSearch: true }))
    .then((hit) => hit || fetch(request)),
);
```

If `caches.open` or `cache.match` rejects — storage evicted mid-session, a quota error, a
partitioned or restricted storage context — the promise handed to `respondWith` rejects and the
browser surfaces a network error for that resource. A returning visitor with a working network
gets a dead site, and the worker persists across reloads, so it does not self-heal. This is the
one component that can persistently break the live URL, which is exactly why it deserves a
fallback.

**Fix:** Never let a cache failure become the response.

```js
event.respondWith(
  caches
    .open(CACHE_NAME)
    .then((cache) => cache.match(request, { ignoreSearch: true }))
    .catch(() => undefined)         // a broken cache is a miss, not an outage
    .then((hit) => hit || fetch(request)),
);
```

---

### WR-02: The classic-script roster siblings are precached but never fetched

**File:** `scripts/build-sw-manifest.mjs:50-51`
**Issue:** `EXCLUDED` drops `sw.js`, `.nojekyll` and `*.map`, with an explicit rationale:

> Sourcemaps are devtools-only: the running app never fetches them, and every extra URL in an
> all-or-nothing `addAll` widens the install failure surface (T-01-48) for something offline play
> does not use.

That reasoning applies verbatim to `public/data/roster.ma.js` (69 KB) and
`public/data/roster.mb.js` (79 KB). `roster-source.ts` fetches only `roster.<id>.json`
(`roster-source.ts:75, 172`); the `.js` siblings exist solely as the D-17 `file://` hedge and are
loaded by nothing in this build. They add ~148 KB to the precache and two more all-or-nothing
requests to an install that already fails as a unit on any single 404.

**Fix:**

```js
const isExcluded = (rel) =>
  EXCLUDED.has(rel) || rel.endsWith('.map') || /^data\/roster\.[a-z0-9]+\.js$/.test(rel);
```

Keep them in `dist/` (they are the hedge); just do not precache them.

---

### WR-03: `public/sw.js` documents a build-time grep that does not exist

**File:** `public/sw.js:19-20`
**Issue:**

```js
 * D-15  ... `npm run build`'s verify greps this file for both of them; do not reintroduce either.
```

No such check exists. `npm run build` is `typecheck && vite build && node scripts/build-sw-manifest.mjs`
(`package.json`); `build-sw-manifest.mjs` checks only for the two substitution tokens and the
entry count; `tests/build/sw-behaviour.test.ts` does not assert the absence of `skipWaiting` or
`clients.claim`; the workflow adds nothing. A repo-wide search finds those identifiers only in
`.planning/` prose.

This is the failure mode `scripts/check-pure-core-selftest.mjs` was written to prevent, one layer
up: a gate that is documented, believed, and absent. The next person who adds `self.skipWaiting()`
will be told by the comment that CI would have caught it.

**Fix:** Either implement the check — a four-line assertion in `scripts/build-sw-manifest.mjs`
against `swSource` costs nothing and runs in the same place the tokens are already validated:

```js
for (const banned of ['skipWaiting', 'clients.claim']) {
  if (swSource.includes(banned)) {
    fail(`dist/sw.js contains ${banned}. D-15 forbids forcing a waiting worker active.`);
  }
}
```

— or delete the sentence. Do not leave the claim standing unbacked.

---

### WR-04: `selectTeams` keys a plain object literal with untrusted player ids

**File:** `src/core/selectors.ts:63-67`
**Issue:**

```ts
const teams: Record<string, (string | null)[]> = {};
for (const playerId of playerIdsInOrder(state)) {
  teams[playerId] = Array.from({ length: state.config.rounds }, () => null);
}
```

`import-guard.buildPlayers` validates that `id` is a non-empty *string* (`import-guard.ts:180`) —
the poison-key rejection applies to object keys, not to string values that later *become* object
keys. A crafted file with `"id": "__proto__"` therefore passes the guard, and this assignment
invokes `Object.prototype`'s `__proto__` setter: because the value is an Array (an object),
`teams`'s prototype is replaced by that array. No own property is created, `Object.keys(teams)`
never lists the player, and `teams` silently acquires `length`, `map`, `push` and the rest of
`Array.prototype`.

It happens to render today only because `BoardGrid` and `CompletedDraft` index by `player.id`
(`BoardGrid.tsx:90`, `CompletedDraft.tsx:84`) and the `__proto__` getter returns the array back.
The first `Object.entries(teams)` or spread anywhere downstream drops that player without a
trace. `selectors.ts`'s own header promises "the arrays and objects returned are always freshly
built" — an object whose prototype is attacker-chosen data is not that.

**Fix:** Either use a null-prototype object here — one word, no behaviour change:

```ts
const teams: Record<string, (string | null)[]> = Object.create(null);
```

— or reject the three poison strings as ids in `buildPlayers`, which is the more honest place
given the guard is the documented boundary:

```ts
if (!isNonEmptyString(id) || POISON_KEYS.includes(id as never)) return null;
```

Preferably both.

---

### WR-05: The import guard validates types but never referential integrity

**File:** `src/core/import-guard.ts:232-287`
**Issue:** Every log entry is type-checked in isolation. Nothing checks that the entries agree
with each other or with `config`:

- `draft/started.order` is any array of strings — it need not be a permutation of
  `config.players`, or even overlap it.
- `draft/pickMade.playerId` need not name a configured player.
- `draft/pickMade.monId` need not be in `pool/built.ids`.
- `draft/pickMade.round` need not be `<= config.rounds`.
- `pool/built.ids` may be empty, or may contain duplicates.

`canApply` enforces all of these on the dispatch path (`reduce.ts:141-177`), but `fold` correctly
does not — `apply` is total by design (sync rule 11). So an accepted file can produce states the
application can never reach and cannot leave:

- `order` shorter than `players` → `selectCurrentTurn` cycles a subset forever and
  `selectIsComplete` is never true (`selectors.ts:82-116`). The draft cannot finish.
- `playerId` not in `config.players` → `selectTeams` silently `continue`s past the pick
  (`selectors.ts:72`) while `state.picks.length` still advances the round arithmetic, so the
  board grows holes.
- `pool/built.ids: []` → an empty, unpickable pool.

The file's own header says "Refuse, do not repair… a partially repaired draft looks loaded, and
the host discovers what went missing at the point they needed it." These documents look loaded
and are broken.

**Fix:** Add a cross-entry pass at the end of `buildDoc`, after `buildLog` succeeds. It is cheap
and it is the only place that has both halves in hand:

```ts
const playerIds = new Set(config.players.map((p) => p.id));
let poolIds: Set<string> | null = null;

for (const entry of log) {
  if (entry.type === 'pool/built') {
    if (entry.ids.length === 0) return null;
    poolIds = new Set(entry.ids);
    if (poolIds.size !== entry.ids.length) return null;
  }
  if (entry.type === 'draft/started') {
    if (entry.order.length !== playerIds.size) return null;
    if (new Set(entry.order).size !== entry.order.length) return null;
    if (!entry.order.every((id) => playerIds.has(id))) return null;
  }
  if (entry.type === 'draft/pickMade') {
    if (!playerIds.has(entry.playerId)) return null;
    if (entry.round > config.rounds) return null;
    if (poolIds !== null && !poolIds.has(entry.monId)) return null;
  }
}
```

---

### WR-06: `createTournament` ignores both dispatch results and can persist an empty log

**File:** `src/store.ts:191-196`
**Issue:**

```ts
dispatch(poolBuilt(entries.map((entry) => entry.id), snapshot.regulation, snapshot.checksum));
dispatch(
  draftStarted(selectStartingOrder(seed, config.players.map((player) => player.id))),
);

return docSignal.peek();
```

`dispatch` returns a `CanApplyResult` and both are discarded. If `entries` is empty or carries a
duplicate id, `canApply` rejects `pool/built` with `emptyPool` / `duplicatePoolIds`
(`reduce.ts:136-137`), the second dispatch then fails with `poolNotBuilt`, and `createTournament`
returns a document with an empty log — which the caller treats as success (`app.tsx:211-213`) and
which the autosave then writes to `localStorage`. The host sees a draft screen with an empty
pool, no turn banner, and clicks that do nothing.

`parseSnapshot` does not validate entry shape (`roster-source.ts:130-140`), so a truncated or
half-deployed `roster.mb.json` is a live route into this state, not a hypothetical one.

**Fix:** Fail loudly rather than half-creating.

```ts
const pool = dispatch(poolBuilt(entries.map((e) => e.id), snapshot.regulation, snapshot.checksum));
if (!pool.ok) {
  docSignal.value = null;
  stateSignal.value = null;
  return null;
}

const started = dispatch(draftStarted(selectStartingOrder(seed, config.players.map((p) => p.id))));
if (!started.ok) {
  docSignal.value = null;
  stateSignal.value = null;
  return null;
}
```

`createTournament` is already typed `TournamentDoc | null`; `app.tsx` should render the roster
failure copy when it returns null.

---

### WR-07: `isValidTournament` throws away `migrate`'s output, so the two import paths will disagree

**File:** `src/core/import-guard.ts:384-388`, `src/adapters/persistence.ts:248`
**Issue:**

```ts
export function isValidTournament(value: unknown): value is TournamentDoc {
  const doc = buildDoc(value);
  if (doc === null) return false;
  return migrate(doc).ok;      // the migrated document is discarded
}
```

`persistence.load()` then returns the *original* parsed object (`persistence.ts:248`), not
anything `migrate` produced. Today `migrate` is a passthrough for version 1, so this is invisible.
The moment `SCHEMA_VERSION` becomes 2 and `migrate` actually upgrades a v1 document, the file
path returns the upgraded document (`parseTournamentFile` uses `migrated.doc`,
`import-guard.ts:433`) and the storage path returns the un-upgraded one — and
`store.adoptTournament` will then reject it outright, because it hard-compares
`doc.schemaVersion !== SCHEMA_VERSION` (`store.ts:211`). Every autosave written by the previous
build would be silently discarded on the version bump the migration exists to survive.

The guard's header opens with "two guards with one job is two guards that can disagree". This is
one guard with two exits that already disagree.

**Fix:** Give the storage path the migrated document.

```ts
export function validateTournament(value: unknown): TournamentDoc | null {
  const doc = buildDoc(value);
  if (doc === null) return null;
  const migrated = migrate(doc);
  return migrated.ok ? migrated.doc : null;
}

export function isValidTournament(value: unknown): value is TournamentDoc {
  return validateTournament(value) !== null;
}
```

and in `persistence.load()`, `return validateTournament(stored);` instead of narrowing and
returning `stored`.

---

### WR-08: The persisted `rng.cursor` misreports how many draws were consumed

**File:** `src/store.ts:179-196`
**Issue:**

```ts
const seed = newSeed();
docSignal.value = { ..., rng: { seed, cursor: 0 }, log: [] };
...
dispatch(draftStarted(selectStartingOrder(seed, config.players.map((p) => p.id))));
```

`selectStartingOrder` runs a Fisher-Yates shuffle that consumes `players.length - 1` draws
(`selectors.ts:138-149`), advancing the cursor from 0 through n-2. The document records
`cursor: 0`. The comment argues this "stays honest" because the result is materialized — but the
field's own contract in `model.ts:56` is "`cursor` records how far the pure generator has been
advanced", and it does not.

The consequence is a landmine with a comment as its only guard: the first Phase 2 feature that
draws from `rng.cursor` starts at 0 and replays the exact draws the starting order already used.
`nextInt` is a pure hash of `(seed, cursor)`, so those are not merely correlated — they are
identical values.

**Fix:** Record what was actually consumed, so no future reader has to know this history.

```ts
const order = selectStartingOrder(seed, config.players.map((player) => player.id));
docSignal.value = {
  ...,
  rng: { seed, cursor: Math.max(0, config.players.length - 1) },
  ...
};
```

Better still, have `selectStartingOrder` return `{ order, cursor }` so the count is produced by
the code that spends it rather than re-derived by the caller.

---

### WR-09: A heartbeat during the claim window is not counted, allowing a dual-ownership write window

**File:** `src/adapters/tab-lock.ts:408-414`, `src/adapters/tab-lock.ts:467-472`
**Issue:** `sawPong` is set by `pong`, `claim` and `takeover`, but not by `heartbeat`:

```ts
case 'heartbeat':
  if (status === 'owner') { resolveOwnershipConflict(message.tabId); return; }
  noteOwnerAlive();     // sets lastHeartbeatAt, leaves sawPong false
  return;
```

`noteOwnerAlive` returns early when `status !== 'secondary'`, so a booting tab in the `claiming`
state learns nothing from a heartbeat it just received. `CLAIM_WINDOW_MS` is 250 ms and its own
comment concedes the owner may be "on a main thread busy parsing the roster snapshot" — exactly
the condition that delays a `pong` past the window. The booting tab then claims, and both tabs
consider themselves the owner until the next `heartbeat` triggers `resolveOwnershipConflict`:
up to `HEARTBEAT_INTERVAL_MS` (2000 ms). The autosave debounce is 300 ms, so both tabs can and
will write inside that window, last-writer-wins.

**Fix:** Any message that proves an owner exists should end the claim window.

```ts
case 'heartbeat':
  if (status === 'owner') { resolveOwnershipConflict(message.tabId); return; }
  sawPong = true;      // proof of an owner is proof of an owner, whatever it is called
  noteOwnerAlive();
  return;
```

Apply the same to `'saved'`, which is equally unambiguous proof of a live owner.

---

### WR-10: A bfcache-restored secondary loses its stale watch permanently

**File:** `src/adapters/tab-lock.ts:490-494`
**Issue:** `release()` calls `stopStaleWatch()` *before* the `status !== 'owner'` early return, so
a secondary tab going through `pagehide` cancels its stale timer and never re-arms it —
`pageshow` calls `claim()`, which returns immediately because `status !== 'idle'`
(`tab-lock.ts:448`).

The banner in that tab is then frozen on `READ_ONLY_SENTENCE` forever. If the owning tab is
force-closed while this one is in the bfcache, `STALE_SENTENCE` — "The tab that was drafting has
stopped responding" — will never appear, and `ReadOnlyBanner`'s own comment calls that transition
"the single most important thing this component ever has to say". The takeover button remains, so
this is recoverable by a host who guesses; it is not a deadlock, but it defeats the stale
detection that exists precisely so they do not have to guess.

**Fix:** Only tear down the stale watch on the owner path, and re-arm on restore.

```ts
function release(): void {
  cancelClaimWindow();
  if (status !== 'owner') return;   // leave a secondary's stale watch running
  stopStaleWatch();
  ...
}
```

If the frozen-timer semantics of the bfcache are a concern, re-arm explicitly from `pageshow`
when `status === 'secondary'`.

---

### WR-11: `downloadJson` revokes the object URL synchronously after clicking a detached anchor

**File:** `src/adapters/file-io.ts:112-124`
**Issue:**

```ts
const url = URL.createObjectURL(blob);
try {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
} finally {
  URL.revokeObjectURL(url);   // same synchronous turn as the click
}
```

The comment asserts "the browser has already taken its own reference to the blob by then". That
is true for the download the moment it starts, but the anchor is never inserted into the
document, and the combination of a detached anchor plus an immediate revoke is the historically
flaky one across engines. This is the *durability guarantee* of the whole application
(`file-io.ts:5-9`) and it is the last thing a host does after a forty-minute draft — a silent
no-op here is the worst failure in the codebase, and the mitigation costs one line.

**Fix:** Defer the revoke past the current task; the blob is a few tens of KB, so the pin is
irrelevant.

```ts
const anchor = document.createElement('a');
anchor.href = url;
anchor.download = filename;
anchor.rel = 'noopener';
document.body.append(anchor);
anchor.click();
anchor.remove();
setTimeout(() => URL.revokeObjectURL(url), 0);
```

---

### WR-12: Unresolvable species are dropped silently from both the board and the export

**File:** `src/ui/screens/CompletedDraft.tsx:84`, `src/core/export/paste.ts:107-112`, `src/ui/components/TeamStrip.tsx:44-57`
**Issue:** `entryById` is built from the *current* roster snapshot (`app.tsx:271-274`). A restored
or imported document can reference ids the current regulation dropped — Champions regulations
rotate roughly every 2.5 months, which is why `rosterVersion` and `rosterChecksum` are recorded on
the document in the first place. Nothing compares them.

When an id does not resolve:

- `TeamStrip` renders a cell with `board__cell--filled` and no `MonChip` inside it
  (`TeamStrip.tsx:44, 49, 57`) — a filled-looking cell that is visually empty.
- `toShowdownPaste` drops the record entirely (`paste.ts:108-109`). The drop is correct and
  deliberately defensive, but nothing tells the caller it happened.

So the completed-draft screen can present a five-Pokémon paste under a six-slot board and the
host pastes it into Showdown believing it is their team. `App` already has the machinery to
notice — `state.config.rosterChecksum` versus `load.bundle.snapshot.checksum`.

**Fix:** Have `toShowdownPaste` report what it dropped, and surface it:

```ts
export interface PasteResult { text: string; dropped: string[] }
```

and render a sentence above the paste block when `dropped.length > 0`, naming the problem and the
next action per the copy rules — e.g. *"Two picks are not in the current regulation and are not in
this paste. Add them by hand."* At minimum, compare `config.rosterChecksum` against the loaded
snapshot on adopt and warn once.

---

### WR-13: The undo shortcut is live while the import confirmation dialog is open

**File:** `src/ui/components/TopBar.tsx:121`, `src/ui/components/Dialog.tsx:81-125`
**Issue:** `Dialog`'s `handleKeyDown` is bound to the backdrop and handles `Escape` and `Tab`
only; every other key bubbles to `document`, where `TopBar`'s listener is still attached. While
`ImportConfirmDialog` is open — the one modal in the phase whose entire job is to state how much
work is about to be destroyed — `Ctrl+Z` removes a pick from the draft behind it. The dialog's
body copy quotes `pickCount` captured at render (`app.tsx:512`), so the sentence the host is
reading becomes wrong under them, and `announce` fires an undo message on top of the modal's own
description.

**Fix:** Stop propagation for handled and unhandled keys alike inside the modal:

```ts
const handleKeyDown = useCallback((event: KeyboardEvent) => {
  // A modal owns the keyboard. Nothing behind it should react to a keystroke aimed here.
  event.stopPropagation();
  ...
}, [dismissible, onDismiss]);
```

---

### WR-14: The purity gate does not reject Node builtin imports from `src/core`

**File:** `scripts/check-pure-core.mjs:360-376`
**Issue:** `classifySpecifier` rejects three families — anything containing `adapters`, a `ui`
path segment, and `preact` / `@preact/*`. It returns `null` for everything else, including
`node:fs`, `node:crypto`, `node:process` and their bare equivalents. None of the corresponding
identifiers (`readFileSync`, `createHash`, `randomUUID`) are in `FORBIDDEN_IDENTIFIERS` either.

So `import { readFileSync } from 'node:fs'` inside `src/core` passes `npm run check:pure` cleanly,
while being both impure and unbundlable — the failure would surface as a broken production bundle,
not as the gate that exists to catch exactly this. The risk is concrete rather than theoretical:
`src/core/roster/transform.ts` is imported by `scripts/build-roster.mjs` under Node
(`build-roster.mjs:183`), so a Node-only import is a natural mistake to make there.

**Fix:**

```js
if (specifier.startsWith('node:') || NODE_BUILTINS.has(segments[0])) {
  return 'node builtins are ambient; the core may not import them';
}
```

with `NODE_BUILTINS` a small set (`fs`, `path`, `crypto`, `os`, `process`, `child_process`, `url`,
`zlib`). Extend `check-pure-core-selftest.mjs`'s impure fixture to cover it — the self-test's
whole premise is that widening a gate without widening its self-test is how a gate becomes
decorative.

---

### WR-15: `ExportPanel` guards a missing clipboard but not a throwing one

**File:** `src/ui/components/ExportPanel.tsx:106-115`
**Issue:**

```ts
const write = navigator.clipboard?.writeText(paste);
if (write === undefined) { fail(); return; }
void write.then(succeed, fail);
```

The optional chain covers `navigator.clipboard` being undefined, and the comment explains why. It
does not cover `writeText` itself throwing synchronously, which several embedded webviews and
permissions-policy configurations do — the same environments D-09 is written to survive. In that
case the exception escapes the click handler, `fail()` never runs, and the host gets neither
`Copy failed — select the text below` nor the live-region equivalent: silence at the moment the
button was supposed to explain itself.

**Fix:**

```ts
let write: Promise<void> | undefined;
try {
  write = navigator.clipboard?.writeText(paste);
} catch {
  write = undefined;   // a webview that throws is a webview without a clipboard
}
if (write === undefined) { fail(); return; }
void write.then(succeed, fail);
```

## Info

### IN-01: `parseSnapshot` casts unvalidated network data straight to `RosterSnapshot`

**File:** `src/adapters/roster-source.ts:130-140`
**Issue:** Only `entries` being a non-empty array and `counts` being an object are checked; every
row is then `as unknown as RosterSnapshot`. A truncated or half-deployed snapshot yields entries
missing `num` (`byDexOrder` produces `NaN`, `app.tsx:113`) or missing `id` (which then becomes a
`pool/built` id of `undefined`). Rendering is safe — Preact escapes text and `sprite-src.ts:53`
pattern-checks the filename — but the failure is silent rather than the loud
`RosterLoadError` the module is built around.
**Fix:** Spot-check the first entry for `id`, `name`, `num` and `types` and throw from
`parseSnapshot` if it fails; full per-row validation is correctly ruled out on cost grounds, but
one row is free.

### IN-02: `buildPlayers` accepts an empty player name

**File:** `src/core/import-guard.ts:180`
**Issue:** `typeof name !== 'string'` permits `""`, producing a blank board row label
(`TeamStrip.tsx:41`) and an `ExportPanel` whose accessible name is `" team export"`
(`ExportPanel.tsx:122`).
**Fix:** Use `isNonEmptyString(name)`, matching the treatment `id` already gets one line above.

### IN-03: `MegaForme` construction is duplicated between `deriveMegaFormes` and `transform`

**File:** `src/core/roster/transform.ts:200-208`, `src/core/roster/transform.ts:287-295`
**Issue:** The same seven-field object literal is written twice. `transform` does not call
`deriveMegaFormes`, so the exported function is exercised only by
`tests/core/roster/transform.test.ts` — the tested copy is not the shipped copy, and the two can
drift silently.
**Fix:** Extract `function toMegaForme(entry: RawSpecies): MegaForme` and call it from both.

### IN-04: `probeStorage` can leave its probe key behind

**File:** `src/adapters/persistence.ts:123-127`
**Issue:** `setItem`, `getItem` and `removeItem` share one `try`. If `removeItem` throws after a
successful write, `champions-drafter:probe` is left in `localStorage` permanently.
**Fix:** Put `removeItem` in its own `try { } catch { }` inside a `finally`, so cleanup failure
never changes the probe's verdict and never leaks the key.

### IN-05: `FORBIDDEN_IDENTIFIERS` is bypassable by bracket notation or aliasing

**File:** `scripts/check-pure-core.mjs:60-81`
**Issue:** The patterns match `Date.now` and `Math.random` as written; `Date['now']()`,
`const D = Date; D.now()` and `globalThis['crypto']` all pass. The gate is a deny-list for
accidents rather than a sandbox, and the file says so — worth recording only so nobody reads a
green `check:pure` as a proof.
**Fix:** None required. If the strength is ever wanted, match the bare identifiers `Date`,
`Math`, `crypto` in `src/core` and allow-list the pure members.

### IN-06: `TurnBanner` and `CompletedDraft` copy hardcodes six rounds and two teams

**File:** `src/ui/components/TurnBanner.tsx:25`, `src/ui/components/TurnBanner.tsx:40`
**Issue:** `'Draft complete — 12 picks, 2 teams'` and `Round ${round} of 6` are literals, which
the component documents as a contract decision for Phase 1. That reasoning holds for documents
this build creates (`PHASE_ONE_ROUNDS = 6`, two players), but an imported document may carry any
`rounds` and any player count (`import-guard.ts:199-203`) — `BoardGrid` renders the real column
count while the banner states six, and the completion line states twelve picks regardless.
**Fix:** Nothing this phase. When Phase 2 makes the counts configurable, derive both strings from
`state.config` in the same commit that removes `PHASE_ONE_PLAYERS`.

---

_Reviewed: 2026-08-06T20:35:45Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
