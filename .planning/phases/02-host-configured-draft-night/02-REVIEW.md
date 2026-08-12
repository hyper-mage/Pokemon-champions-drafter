---
phase: 02-host-configured-draft-night
reviewed: 2026-08-12T14:32:00Z
depth: standard
files_reviewed: 37
files_reviewed_list:
  - src/adapters/persistence.ts
  - src/adapters/view-prefs.ts
  - src/app.tsx
  - src/core/actions.ts
  - src/core/bans.ts
  - src/core/draw.ts
  - src/core/feasibility.ts
  - src/core/import-guard.ts
  - src/core/migrate.ts
  - src/core/model.ts
  - src/core/search.ts
  - src/core/undo.ts
  - src/store.ts
  - src/ui/components/BanChipList.tsx
  - src/ui/components/BoardGrid.tsx
  - src/ui/components/ConfirmDialog.tsx
  - src/ui/components/FeasibilityBar.tsx
  - src/ui/components/FilterBar.tsx
  - src/ui/components/ImportConfirmDialog.tsx
  - src/ui/components/MonCard.tsx
  - src/ui/components/MonChip.tsx
  - src/ui/components/NumericField.tsx
  - src/ui/components/PlayerList.tsx
  - src/ui/components/PoolGrid.tsx
  - src/ui/components/SegmentedControl.tsx
  - src/ui/components/SplitPanes.tsx
  - src/ui/components/StatBlock.tsx
  - src/ui/components/TeamStrip.tsx
  - src/ui/components/TopBar.tsx
  - src/ui/components/TurnBanner.tsx
  - src/ui/components/TypePill.tsx
  - src/ui/components/TypeaheadField.tsx
  - src/ui/confirm-copy.ts
  - src/ui/screens/ConfigScreen.tsx
  - src/ui/screens/LandingScreen.tsx
  - src/ui/type-codes.ts
  - src/ui/use-roving-tabindex.ts
findings:
  critical: 2
  warning: 9
  info: 7
  total: 18
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-08-12T14:32:00Z
**Depth:** standard
**Files Reviewed:** 37
**Status:** issues_found

## Scope

The 37 `.ts`/`.tsx` sources touched by the phase's 8 plans, at diff base `bc95fdd`.

**Excluded from this pass:** 19 `.css` files and 33 files under `tests/` (separate pass).
Untouched Phase 1 code is out of scope; `src/core/reduce.ts`, `src/core/selectors.ts`,
`src/core/rng.ts`, `src/adapters/tab-lock.ts`, `src/ui/sprite-src.ts` and
`src/ui/components/LiveRegion.tsx` were read only to verify claims made by in-scope code,
and are not reported on.

Items 1–5 of the phase's recorded known-defect list were treated as settled and are not
re-reported. Where a recorded item has a consequence the summaries did not identify, that
consequence is reported as a new finding and says so.

## Summary

The core modules are the strongest part of the phase. `feasibility.ts` handles the `NaN`
hazard exactly as its doc block claims, `bans.ts` and `checkFeasibility` genuinely reach the
same set-based ban count by two routes, `draw.ts` terminates for every configuration the gate
admits (verified: `poolTooSmall` and `megasExceedRounds` together force
`megasRequired <= poolSize <= legalCount`, so neither `selectInPlace` call can over-draw),
and `import-guard.ts` is a serious allow-list rebuild rather than a shape check.

The defects cluster where this phase's *new* state machine meets Phase 1's *existing*
machinery. D-01 introduced a landing screen holding a boot-time snapshot of the saved
document, and D-36 introduced abandon — and neither was reconciled with the PERS-03 tab
lock. Both blockers below are the T-01-40 clobber the lock was built to prevent, arriving
through doors D-01 and D-36 opened. The screen union is also never re-synchronised when a
document arrives from `onRemoteSave`, and read-only ownership is enforced only on the draft
region, leaving the landing and config screens fully operable in a secondary tab.

The remaining warnings are single-surface: a doc block in `SplitPanes` that describes
behaviour the component does not have (and the filter loss that follows from it), a third
live-region overwrite route in ban mode, a dead pool-size preset control, and an import bound
whose comment and code disagree.

## Critical Issues

### CR-01: `Resume saved draft` adopts a stale boot-time snapshot and overwrites newer work

**File:** `src/app.tsx:242-244`, `src/app.tsx:645-649`
**Issue:**
`saved` is captured once, in a `useState` initializer during the first render, and is never
refreshed afterwards — the only write is `setSaved(null)` in `confirmAbandon`.
`handleResume` adopts that snapshot verbatim:

```ts
const [saved, setSaved] = useState<TournamentDoc | null>(() =>
  probe.ok ? loadSavedTournament() : null,
);
...
const handleResume = useCallback(() => {
  if (saved === null) return;
  if (!adoptTournament(saved)) return;
  setScreen({ name: 'draft' });
}, [saved]);
```

With two tabs open — the configuration PERS-03 exists for — this loses picks:

1. Tab B opens on the landing screen. `loadSavedTournament()` runs, `saved` is pinned, and
   `persistence.load` sets the module-level `generation` to the stored value.
2. Tab A (owner) drafts. Each save calls `notifySaved()`, tab B's `onRemoteSave` fires
   `adoptWhateverIsNewer()`, `loadIfNewer()` returns the newer document and
   `adoptTournament` installs it. `generation` in tab B is now equal to the stored one.
   Tab B's screen is still `landing` (see WR-07).
3. The host clicks `Resume saved draft` in tab B. `handleResume` adopts the **step-1**
   snapshot, discarding the newer document the store already held. Tab B now shows a draft
   several picks behind.
4. The host clicks `Take over drafting here`. `onPromote` calls `loadIfNewer()`, which
   compares `storedGeneration <= generation` — equal, because step 2 already advanced it —
   and returns `null`. The stale document survives promotion.
5. Tab B's next autosave writes the stale document over tab A's work.

`loadIfNewer` is documented as "the whole of the T-01-40 mitigation", and it is defeated here
because the stale document did not come from step 1's read of storage but from a state
variable holding a copy of it.

**Fix:** Re-read at click time and drop the pinned document. The boot-time read stays for
rendering the button and its description only.

```ts
const handleResume = useCallback(() => {
  // The record may have moved since boot — another tab writes through the same key, and
  // `onRemoteSave` may already have adopted something newer than the snapshot below.
  const current = loadSavedTournament() ?? saved;
  if (current === null) return;
  if (!adoptTournament(current)) return;
  setScreen({ name: 'draft' });
}, [saved]);
```

Consider also refreshing `saved` on `onRemoteSave` so the description line under the button
is not stale, and asserting the sequence in a test that drives two `startAutosave` sources
against one fake channel.

---

### CR-02: Abandoning a draft is not propagated to other tabs, and a promoted secondary writes it back

**File:** `src/app.tsx:569-580`, `src/adapters/persistence.ts:203-210`
**Issue:**
`confirmAbandon` performs three local operations and broadcasts nothing:

```ts
stopAutosaveRef.current?.();
stopAutosaveRef.current = null;
autosaveStartedRef.current = false;

abandonTournament();
clearSaved();
```

`abandonTournament` clears this tab's signals; `clearSaved` removes one `localStorage` key.
Neither reaches `tab-lock`, and `clearSaved` — unlike `save` — never calls `notifySaved()`.
A secondary tab therefore keeps the abandoned tournament in memory indefinitely, with no
banner, no announcement and no visible difference. When the host later clicks
`Take over drafting here` in that tab, `onPromote` runs `loadIfNewer()`, which finds no
record (`raw === null` → `null`), so the secondary keeps its own copy — and its first
autosave after promotion re-creates the storage key with the tournament the host destroyed.

The `ABANDON_CONFIRM` body states "Nothing recovers it unless you have already downloaded the
tournament JSON." That is false whenever a second tab is open.

This is a *different* defect from the flush-ordering hazard the summaries recorded. The
ordering comment in `confirmAbandon` is correct as far as it goes, but it is a single-tab
argument: it does not cover the fact that the teardown's `flush()` reaches
`save()` → `notifySaved()`, which nudges every secondary to re-read the document
milliseconds before `clearSaved()` deletes it, nor that the secondary's in-memory copy
survives regardless of whether that flush happens.

**Fix:** Give abandon a cross-tab signal, in the same shape as `saved`. Add an `abandoned`
message type to `tab-lock`'s `LockMessageType`, a `notifyAbandoned()` beside `notifySaved()`,
and an `onAbandoned` callback that `app.tsx` wires to the same teardown the owner runs:

```ts
// adapters/tab-lock.ts — receive()
case 'abandoned':
  if (status === 'owner') return;
  options.onAbandoned?.();
  return;
```

```ts
// app.tsx — inside claimOwnership({...})
onAbandoned: () => {
  stopAutosaveRef.current?.();
  stopAutosaveRef.current = null;
  autosaveStartedRef.current = false;
  abandonTournament();
  setSaved(null);
  setScreen({ name: 'landing' });
},
```

and call `notifyAbandoned()` from `confirmAbandon` **after** `clearSaved()`, so a secondary
that re-reads on the nudge finds nothing rather than the record that is about to go. If a
channel message is judged too large a change, the minimum viable fix is for `clearSaved()` to
also reset the module-level `generation` to `0` and for `loadIfNewer()` to treat a missing
record as "the owner has nothing" rather than "nothing newer" — but that only narrows the
window, it does not close it.

## Warnings

### WR-01: `import-guard` bounds `megasRequiredPerTeam` by `MAX_ROUNDS`, not by the document's own `rounds`

**File:** `src/core/import-guard.ts:402-409`
**Issue:** The comment and the code say different things:

```ts
// Bounded by the round count rather than by an arbitrary number: a team cannot be
// required to hold more Megas than it has picks to spend on them.
let megasRequiredPerTeam: number = V1_CONFIG_DEFAULTS.megasRequiredPerTeam;
if (raw['megasRequiredPerTeam'] !== undefined) {
  const value_ = raw['megasRequiredPerTeam'];
  if (!isNonNegativeInteger(value_) || value_ > MAX_ROUNDS) return null;
  megasRequiredPerTeam = value_;
}
```

`MAX_ROUNDS` is 24 and *is* the arbitrary number the comment disclaims. `rounds` has already
been validated eleven lines above and is in scope, so the stated bound is available and
simply not used. A file declaring `rounds: 6, megasRequiredPerTeam: 10` is accepted.

The consequence is user-visible, and it is what makes this more than a comment defect: the
accepted document reaches `feasibilityNotice` in `app.tsx:438-454`, which renders
`adoptedNotice(megasExceedRoundsMessage(6))` — *"This tournament's configuration no longer
adds up: A team has 6 slots, so at most 6 of them can be Megas. Lower the Megas required per
team. …"* — on the draft screen, which has no Megas-required field to lower. The guard's own
posture is "refuse, do not repair"; here it neither refuses nor repairs.

**Fix:**

```ts
if (!isNonNegativeInteger(value_) || value_ > rounds) return null;
```

`rounds <= MAX_ROUNDS` already holds, so this is strictly tighter and needs no second bound.

---

### WR-02: `megasExceedRounds` gives the wrong next action for an empty field

**File:** `src/core/feasibility.ts:154-156`, `src/core/feasibility.ts:319-322`
**Issue:** `asSafeInteger(input.megasRequiredPerTeam, 0, rounds)` returns `null` for five
distinct conditions — empty, fractional, unsafe, negative, above the round count — and all
five produce one message:

> `A team has {rounds} slots, so at most {rounds} of them can be Megas. Lower the Megas
> required per team.`

For an empty or unparseable field there is nothing to lower, and the host is told to perform
an action that cannot fix the problem. The pool-size field, which has the identical failure
mode, gets a dedicated code and a correct sentence (`poolSizeNotAnInteger` — *"Pool size
needs a whole number. Enter how many Pokémon the pool should hold."*). The asymmetry is
unexplained; `PRECEDENCE`'s own doc block groups both under "malformed input, not
unsatisfiable arithmetic", which argues for the same treatment.

CLAUDE.md §Copy: "Errors state the problem and the next action." This states a next action
that is wrong for the most common way to reach it — deleting the `0` the field ships with.

This is a distinct defect from the recorded `after 1 bans` / `1 other problems` plural
issues; it needs its own copy row, not a pluralisation pass.

**Fix:** Split the malformed case out, mirroring the pool-size field:

```ts
| 'megasRequiredNotAnInteger'   // add to FeasibilityCode and to PRECEDENCE, above megasExceedRounds
const MEGAS_REQUIRED_NOT_AN_INTEGER =
  'Megas required per team needs a whole number. Enter 0 for no Mega requirement.';
```

and branch on `input.megasRequiredPerTeam === null || !Number.isSafeInteger(...)` versus
`value > rounds` so each sentence names the action that actually resolves it.

---

### WR-03: `SplitPanes` unmounts the collapsed side, contradicting its own contract and silently discarding the host's pool filters

**File:** `src/ui/components/SplitPanes.tsx:79-87`, `src/ui/components/SplitPanes.tsx:8-25`
**Issue:** The doc block states the component's central promise:

> "both children are in the document at once and each side scrolls inside its own track.
> What an expand button changes is the RATIO, never the membership."

`side()` does the opposite. When `collapsed` is true it returns a strip holding one button and
**never renders `children` at all**:

```ts
if (collapsed) {
  return (
    <div class="pane-collapsed" data-side={key}>
      <button type="button" class="pane__button" onClick={() => change('split', SPLIT_MESSAGE)}>
        {restoreLabel}
      </button>
    </div>
  );
}
```

`Expand the draft board` is available during a live draft (`side('board', …, true)` — the
`expandable` argument is unconditionally `true` for the board), so this is reachable in
ordinary play. Expanding the board unmounts `PoolGrid`, which owns the filter state
(`PoolGrid.tsx:167`). Restoring the split remounts it at `NO_FILTERS`.

The user-visible defect: a host narrows the pool to `Fire`, expands the board to check a
rival's team, comes back, and their search and type filters are gone — with no announcement,
because the `Filters cleared.` suffix is only composed on the pick path (`TurnBanner`'s
`filtersCleared` prop). D-35's contract is that filters clear on a pick; here they clear on a
layout toggle, silently.

The doc block is also load-bearing beyond this bug: a future reader who believes "both
children are in the document at once" will assume pool state survives a pane toggle, which is
exactly the assumption that produced this.

**Fix:** Either keep both subtrees mounted and let CSS collapse the strip, or state the
membership change honestly and preserve the filters. The first preserves the documented
contract and costs one class:

```ts
// Always render both children; `.pane--collapsed` hides the track and shows the strip.
return (
  <section class={collapsed ? 'pane pane--collapsed' : 'pane'} data-side={key}>
    <div class="pane__chrome">…</div>
    <div class="pane__scroll">{children}</div>
  </section>
);
```

If the unmount is preferred for render cost, lift `filters` to `App` for the draft-screen
instance (the config screen's ban grid keeps its own), and amend the doc block in the same
change — a stale contract comment is worse than none, as `confirm-copy.ts:17-18` already
argues.

---

### WR-04: A third live-region overwrite route — the ban announcement is overwritten in ban mode

**File:** `src/ui/components/PoolGrid.tsx:272-314`, `src/ui/components/PoolGrid.tsx:236-250`
**Issue:** The two known overwrite routes are closed. A third is open, on the config screen.

The suppression in `handleActivate` is gated on draft mode:

```ts
const filtersCleared = bannedIds === null && hasActiveFilters(filters);
if (filtersCleared) { cancelPendingAnnouncement(); suppressNextRef.current = true; … }
```

so in ban mode nothing is cancelled and nothing is suppressed. The draft-mode safety net is
the effect's cleanup: a pick changes `entries.length`, the effect re-runs, and the previous
run's `cancelPendingAnnouncement` cleanup fires. **In ban mode none of the three dependencies
move on a ban** — `entries` is the full roster prop from `ConfigScreen`, `visible` is derived
from `entries` and `compiled` only, and `filters` is untouched. So the effect does not re-run
and the pending timer survives.

Sequence: the host clicks a type pill at t=0 (effect schedules the 300ms announcement); clicks
a roster cell at t≈150ms, which fires `applyBan` → `announce('Pikachu banned. 1 ban.')`; at
t=300ms the pending timer fires `announce('12 of 235 Pokémon match.')`. The ban confirmation —
the only feedback a screen-reader user gets that the click registered — is lost.

The same route swallows `Display density: Full.` from `handleDensityChange` on both screens,
for the same reason.

**Fix:** Cancel unconditionally on activation rather than only when filters were cleared, and
cancel in the density handler too:

```ts
function handleActivate(entry: RosterEntry): void {
  const filtersCleared = bannedIds === null && hasActiveFilters(filters);

  // Any activation produces an announcement of its own. A filter result 300ms behind it
  // would overwrite the one the host's click just earned — in ban mode nothing else
  // cancels it, because banning moves neither `entries` nor `visible`.
  cancelPendingAnnouncement();

  if (filtersCleared) {
    suppressNextRef.current = true;
    setFilters(NO_FILTERS);
  }

  onPick(entry, { filtersCleared });
}
```

Add a ban-mode test that schedules a filter change, bans within the debounce window, advances
fake timers past 300ms, and asserts the live region still reads the ban sentence.

---

### WR-05: The pool-size preset control becomes a dead control after any override, with no indication

**File:** `src/ui/screens/ConfigScreen.tsx:459`, `src/ui/screens/ConfigScreen.tsx:472-475`
**Issue:**

```ts
const poolOverrideValue = poolOverride ?? String(presetPoolSize);
const poolSize = useMemo(
  () => (poolOverride === null ? presetPoolSize : parseNumericField(poolOverride)),
  [poolOverride, presetPoolSize],
);
```

Once the host types a single character into `Pool size override`, `poolOverride` is a string
forever and `presetPoolSize` stops reaching both the displayed value and the gate. The
`Pool size` segmented control keeps rendering, keeps accepting clicks, and keeps moving its
own `:checked` state — while changing nothing at all. `poolSizeHelper` is fixed on Exact by
design, so there is not even a helper line that moves.

The doc block anticipates half of this ("The moment they type, the string is theirs and the
preset stops driving it") but the control is left looking operable, which is the failure this
codebase rejects by name elsewhere: *"A control that clears nothing is a control that teaches
the host their clicks do not matter"* (`FilterBar.tsx:237-240`), and the same argument in
`ConfigScreen.tsx:861-865` for hiding `Clear the banlist`.

**Fix:** Make the preset authoritative again when it is clicked — a preset click is an
unambiguous statement about the pool size, so it should drop the override:

```ts
<SegmentedControl
  legend="Pool size"
  name="pool-size-preset"
  options={POOL_PRESET_OPTIONS}
  value={poolPreset}
  onChange={(preset) => {
    setPoolPreset(preset);
    // The preset is the host's answer again. Leaving the override in place would keep a
    // selected radio that changes nothing on screen.
    setPoolOverride(null);
  }}
/>
```

If keeping the override is preferred, the control must state that it is overridden — but
D-06's argument against silent correction applies to silent inertness too.

---

### WR-06: Roster rotation silently drops pool entries and blanks filled board cells

**File:** `src/app.tsx:357-362`, `src/ui/components/TeamStrip.tsx:46-64`
**Issue:** Two surfaces resolve a stored id through `entryById` and handle a miss by rendering
nothing, with no notice anywhere.

```ts
// app.tsx
return selectAvailablePool(state)
  .map((id) => entryById.get(id))
  .filter((entry): entry is RosterEntry => entry !== undefined);
```

```tsx
// TeamStrip.tsx
const entry = monId === null ? undefined : entryById.get(monId);
const className = [
  'board__cell',
  monId === null ? 'board__cell--empty' : 'board__cell--filled',
  …
];
…
{entry !== undefined && <MonChip … />}
```

CLAUDE.md states that Champions regulations rotate roughly every 2.5 months and that a saved
tournament outliving a species "is the ordinary case rather than an attack" — `bans.ts:14-18`
says so explicitly. When it happens:

- the pool grid renders fewer cells than `pool/built` recorded, and the `{n} available` count
  follows the render, so nothing on screen reveals the shortfall;
- a board cell for a picked species the roster no longer carries takes
  `board__cell--filled` and renders empty — visually indistinguishable from an unfilled slot,
  except that it is styled as filled.

The codebase already handles this case correctly in one place — `resolveSpeciesName` in
`app.tsx:475-478` falls back to the id "if a restored document ever references a species the
current regulation dropped" — which shows the case is understood and simply not covered on
these two surfaces.

**Fix:** Detect the drift once, where the roster and the document meet, and say so. In
`app.tsx`, beside `feasibilityNotice`:

```ts
const missingFromRoster = useMemo(() => {
  if (state === null || entries.length === 0) return 0;
  return state.poolIds.reduce((n, id) => (entryById.has(id) ? n : n + 1), 0);
}, [state, entryById, entries.length]);
```

and render a `role="status"` notice naming the count when it is non-zero. For the board, give
`MonChip` an id-only fallback (the same posture `resolveSpeciesName` takes) so a filled slot
never renders as an empty box.

---

### WR-07: The screen union and the store desync, and read-only is enforced only on the draft region

**File:** `src/app.tsx:302-314`, `src/app.tsx:763-793`, `src/app.tsx:815`
**Issue:** Two related gaps in the new `Screen` state machine.

**(a) `onRemoteSave` adopts without routing.** `adoptWhateverIsNewer` installs a document into
the store from a `BroadcastChannel` message:

```ts
const adoptWhateverIsNewer = (): void => {
  const newer = loadIfNewer();
  if (newer !== null) adoptTournament(newer);
};
```

Nothing calls `setScreen`. A secondary tab sitting on the landing or config screen therefore
ends up holding a live tournament that is not rendered anywhere, while the landing screen
continues to describe the stale boot snapshot (this is step 2 of CR-01). The autosave effect
*does* start at that moment (`state !== null && storageOk`), so a subscription exists for a
document the host cannot see.

**(b) `inert` covers the draft region only.** `readOnly` is applied at
`app.tsx:815` to `<div class="draft-region">`. The landing screen, the config screen and both
modal dialogs are outside it — deliberately for the dialogs, which is correct and documented.
But it means a read-only tab can walk the whole config screen and click `Start draft`, and
`createTournament` succeeds because `dispatch` is intentionally not ownership-gated
(`store.ts:332-344`). Writes are refused while the tab is a secondary, so nothing is corrupted
immediately — but the tab now holds a *different tournament* from the owner's, and promotion
plus one autosave writes it out. That is the same clobber shape as CR-01, reached through
`New tournament` instead of `Resume`.

**Fix:** For (a), route on adoption, and only from a screen where it makes sense:

```ts
const adoptWhateverIsNewer = (): void => {
  const newer = loadIfNewer();
  if (newer === null) return;
  if (!adoptTournament(newer)) return;
  setSaved(newer);          // keeps the landing description honest — see CR-01
  setScreen({ name: 'draft' });
};
```

For (b), the cheapest correct answer is to make the shell root carry `inert` rather than the
draft region, and to keep the dialogs outside the shell root exactly as they are outside the
draft region today. If the config screen must stay reachable in a secondary, `handleStart`
should refuse under `!isOwner()` with a stated reason rather than creating a document nobody
can save.

---

### WR-08: `useRovingTabindex` trusts `count` to equal the rendered button set, and loses the tab stop when it does not

**File:** `src/ui/use-roving-tabindex.ts:112-126`, `src/ui/components/FilterBar.tsx:82`,
`src/ui/components/FilterBar.tsx:145-151`
**Issue:** The hook indexes the DOM by position among *all* descendant buttons:

```ts
function itemAt(index: number): HTMLElement | null {
  return containerRef.current?.querySelectorAll<HTMLElement>('button')[index] ?? null;
}

function focusItem(index: number): void {
  setStored(index);
  itemAt(index)?.focus();
}
```

`setStored(index)` runs unconditionally, before the lookup. If `itemAt` returns `null`,
`activeIndex` becomes an index no element occupies, `tabIndexAt` then returns `-1` for every
rendered button, and the toolbar drops out of the tab order entirely — recoverable only by
clicking a pill.

The consumer already contains the mismatch in latent form. `count` is
`FILTER_TYPES.length` (18), while the map can render fewer:

```tsx
const display = typeDisplay(type);
if (display === null) return null;
```

That branch is unreachable today because `FILTER_TYPES = Object.keys(TYPE_CODES)` and
`typeDisplay` reads the same map — so it is dead code that also documents an invariant nothing
enforces. More to the point, the hook's own doc block commits it to a second consumer ("the
pool grid's cells in a later plan"), where `querySelectorAll('button')` will match nested
buttons inside a cell if one is ever added, and where the rendered count moves on every filter
keystroke.

**Fix:** Make the hook fail closed and derive its own count where it can.

```ts
function focusItem(index: number): void {
  const item = itemAt(index);
  // Never move the active index onto a position no element occupies: `tabIndexAt` would
  // then return -1 for every item and the whole group would leave the tab order.
  if (item === null) return;
  setStored(index);
  item.focus();
}
```

Scope the query to direct children (`:scope > button`) so a nested control cannot renumber the
set, and either derive `count` from the rendered items or assert the two agree in a test. In
`FilterBar`, filter the type list once at module scope so `count` and the rendered buttons are
the same array by construction:

```ts
const FILTER_TYPES = Object.keys(TYPE_CODES).filter((type) => typeDisplay(type) !== null);
```

---

### WR-09: `confirmAbandon` leaves session flags set, suppressing the completion checkpoint for the next tournament

**File:** `src/app.tsx:569-580`, `src/app.tsx:224`
**Issue:** `confirmAbandon` resets `saved`, `confirm` and `screen`, and leaves
`checkpointDismissed`, `filtersCleared`, `importFlow` and `writeFailureAcknowledged`
untouched. `checkpointDismissed` is the one with a real consequence: it gates the
completed-draft checkpoint (`app.tsx:877-879`), so a host who dismisses the checkpoint on
tournament A, abandons, and completes tournament B in the same session never sees the
checkpoint for B — the phase's only milestone surface, silently missing.

The comment at `app.tsx:222-224` argues correctly that the dismissal should last "the
session", but the reasoning was written when a session held one tournament. Abandon made a
session able to hold several.

`importFlow` is a smaller instance of the same shape: an import error message from the
abandoned draft survives into the next one.

**Fix:** Reset the per-tournament flags where the tournament ends:

```ts
const confirmAbandon = useCallback(() => {
  stopAutosaveRef.current?.();
  stopAutosaveRef.current = null;
  autosaveStartedRef.current = false;

  abandonTournament();
  clearSaved();

  setSaved(null);
  // Per-tournament, not per-session. Abandoning starts a new tournament's worth of state,
  // and a checkpoint dismissed on the last one must not suppress the next one's.
  setCheckpointDismissed(false);
  setFiltersCleared(false);
  setImportFlow({ status: 'idle' });

  setConfirm({ kind: 'idle' });
  setScreen({ name: 'landing' });
}, []);
```

## Info

### IN-01: `aria-label` on a `<span>` is ignored by assistive technology

**File:** `src/ui/components/TypePill.tsx:37-44`
**Issue:** `aria-label` is prohibited on elements with the implicit `generic` role, so the
full type name it carries at `code` form is dropped by conforming ATs. In practice nothing is
lost — `MonCard` supplies an explicit `aria-label` covering the whole cell
(`MonCard.tsx:100-106`) and `FilterBar` renders its own buttons — which makes the attribute
dead weight that reads as a working accessibility affordance.
**Fix:** Drop the attribute and note that `MonCard`'s explicit name is what carries the type,
or add `role="img"` if the pill is ever rendered outside a named ancestor.

### IN-02: Unused public API on `useRovingTabindex` and `SegmentedControl`

**File:** `src/ui/use-roving-tabindex.ts:79`, `src/ui/use-roving-tabindex.ts:87`,
`src/ui/use-roving-tabindex.ts:62`, `src/ui/components/SegmentedControl.tsx:52`
**Issue:** `RovingTabindex.activeIndex`, `RovingTabindex.focusItem` and
`RovingTabindexOptions.columns` have no consumer; the sole call site uses `containerRef`,
`onKeyDown`, `tabIndexAt` and `onItemFocus`. `SegmentedControlProps.hideLegend` is never
passed by any of the six instances. The hook's generalisation is argued for in its doc block
and is defensible; `hideLegend` has no such argument.
**Fix:** Keep the hook surface and let the doc block stand. Remove `hideLegend`, or record why
it exists before a consumer does.

### IN-03: `migrate.recordedPoolSize` reads the first `pool/built`; the fold reads the last

**File:** `src/core/migrate.ts:83-90`, `src/core/reduce.ts:71-79`
**Issue:** `recordedPoolSize` returns on the first match, while `apply` overwrites `poolIds`
on every `pool/built`, so the last one wins in the fold. `canApply` rejects a second
`pool/built` (`poolAlreadyBuilt`), so this build cannot originate the disagreement — but
`actions.ts:50-53` states that a Phase 3 re-roll "emits a NEW `pool/built`", which is exactly
when the two answers diverge.
**Fix:** Scan backwards, matching the fold: `for (let i = log.length - 1; i >= 0; i--)`.

### IN-04: `Pool size override`'s `max` ignores the banlist

**File:** `src/ui/screens/ConfigScreen.tsx:915`
**Issue:** `max={entries.length}` is the full roster; the real ceiling is the post-ban legal
count, which `checkFeasibility` already reports as `feasibility.legalCount`. `max` is an
affordance rather than enforcement (`NumericField.tsx:23-31`), so nothing is admitted that the
gate does not catch — but the stepper and assistive technology report a range the gate will
refuse.
**Fix:** `max={feasibility.legalCount}`.

### IN-05: `applyBan` writes state from a closure value rather than functionally

**File:** `src/ui/screens/ConfigScreen.tsx:414-428`
**Issue:** `setBans(nextBans)` is derived from the captured `bans`, unlike `handleDualMega`
(`setDualMegaChoices((current) => …)`) and `handleChangeName`/`handleAdd`/`handleRemove`
(`setPlayers((current) => …)`). Two ban writes within one render window would lose the first.
Not reachable from real input — each click is its own event with a render between — but it is
the one write path in this file that does not follow the file's own pattern, and it is the
path two surfaces share.
**Fix:** Compute `nextBans` inside a functional update and derive the announcement from the
value the updater returns, or leave it and note why the closure read is safe here.

### IN-06: `dispatch`'s rejection reason is discarded at the pick call site

**File:** `src/app.tsx:183-198`
**Issue:** `handlePick` ignores the `CanApplyResult` that `dispatch` returns. Every rejection
reason `canApply` can produce on this path (`notInPool`, `wrongSlot`, `draftComplete`) is
currently unreachable from a rendered cell, so the silence is correct today — but it is
correct by accident of the selector, not by anything at this call site.
**Fix:** Branch on `!result.ok` and `announce` a sentence, or add a comment stating which
selector makes each reason unreachable, in the style the rest of the file uses.

### IN-07: `selectInPlace`'s `continue` silently under-fills rather than failing

**File:** `src/core/draw.ts:98`
**Issue:** `if (chosen === undefined || displaced === undefined) continue;` is described as a
`noUncheckedIndexedAccess` formality, and it is — but if the invariant ever broke, the loop
would return fewer than `count` entries with the cursor already advanced, producing a pool
quietly smaller than the host configured. That is precisely the outcome the function's own doc
block rejects clamping for.
**Fix:** Make the impossible case loud rather than lossy, matching `nextInt`'s posture:
`throw new RangeError(...)`, or `return { taken, cursor: next }` early so the caller sees a
short result instead of a silently short pool.

---

_Reviewed: 2026-08-12T14:32:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
