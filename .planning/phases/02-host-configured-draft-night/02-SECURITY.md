---
phase: 2
slug: 02-host-configured-draft-night
status: draft
threats_open: 1
asvs_level: 1
created: 2026-08-13
audited_at: 49259a2
diff_base: bc95fdd
threats_total: 42
threats_closed: 41
block_on: [critical, high]
blocking_findings: [T-02-15]
---

# Phase 2 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

This is a static, serverless, single-origin browser application. There is no server, no
account, no session and no network call after first load, so no finding below concerns
authentication, transport security or a server-side control — there is nowhere to host one.
The real attack surface this audit judged is: input validation on the import path, the
`localStorage` record as the same input class by another route, DOM-injection sinks,
resource exhaustion in pure compute, and the cross-tab ownership model.

Every threat was verified against code at commit `49259a2`. Line numbers cited in the eight
PLAN.md files predate the eleven review-fix commits and were re-located rather than reported
as misses. Evidence below is `file:line` at HEAD.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| host-typed config → `checkFeasibility` | Free numeric/text fields. `<input type="number">` yields `NaN` on empty; `max="6"` does not prevent typing 9. | Player names, counts, format label |
| user-selected `.json` file → `parseTournamentFile` | The single genuinely untrusted input. Widened in 02-02 by six config fields and three action-payload fields. | Whole tournament document |
| `localStorage` record → `persistence.load` | Same input class by another route: truncatable, hand-editable in devtools. | Whole tournament document |
| a v1 document → `migrate` | Trusted-shaped by arrival (the allow-list already rebuilt it) but not this build's version. | Document, pre-upgrade |
| `localStorage` `champions-drafter:view` → `PoolGrid` / `SplitPanes` | Hand-editable presentation values selecting a CSS attribute selector and a component branch. | Two enum strings |
| roster snapshot → `TypePill` / `MonCard` / chips / `alt` | Trusted (committed) but travels the rendering path a hostile imported name would take. | Species names, types, stats |
| host-typed names, format label, queries → DOM + `announce` + `localStorage` + JSON export | Free text authored on this machine. | Display strings |
| host config → `createTournament` → the log | The phase's only new write path. **Reachable from a read-only secondary tab — see T-02-15.** | Whole tournament document |
| imported `config.bans` → `bannedEntries` | `import-guard` deliberately performs no referential integrity. | Species id array |
| host banlist → `drawPool` candidates → `pool/built.ids` | Permanent, exported, importable. BAN-08 enforced here, with no second enforcement point. | Species id array |
| `document`-level `Ctrl+Z` → `store.undo` | Listener registered outside the `inert` draft region, so a read-only tab's keystroke reaches the handler. | Keystroke |
| `localStorage` `champions-drafter:tournament` → `clearSaved` | Destructive write to shared-origin storage from one confirmed click. | Key removal |
| filter state → nowhere | Deliberately terminal. Its absence from every persistence path is the security-relevant property. | — |

---

## Threat Register

41 of 42 closed. One open, and it is a blocker.

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-02-01 | DoS | `core/draw.ts` | mitigate | Rejection sampling prohibited by the module doc block (`draw.ts:5-27`); two-stage partition draw at `draw.ts:112-125`; the only loop is `selectInPlace`'s bounded `for` (`draw.ts:90`). Stage 2 spends `megasRequired` draws and stage 3 spends `size - megasRequired`, so exactly `size` total. `grep` for `while`/`do` in `draw.ts` returns nothing. | closed |
| T-02-02 | Tampering | `core/feasibility.ts` | mitigate | `legalCount` and `megaCapableLegalCount` are reductions against `new Set(bannedIds)` membership, `feasibility.ts:277-285`; `banCount` derived as `entries.length - legalCount`, `:287`. A duplicate or non-roster ban id contributes nothing. | closed |
| T-02-03 | Tampering | `core/feasibility.ts` | mitigate | `poolSize` / `megasRequiredPerTeam` typed `number \| null` at `feasibility.ts:98-100`; `asSafeInteger` refuses non-`Number.isSafeInteger` at `:253-258`; applied at `:291` and `:301-305` before any comparison. Tests cover `48.5` (`tests/core/feasibility.test.ts:101`). | closed |
| T-02-04 | Info disclosure | draw / feasibility / bans | accept | Pure functions over publicly shipped roster data. Logged as AR-01. | closed |
| T-02-05 | Tampering | `import-guard.buildConfig` | mitigate | Allow-list rebuild, `import-guard.ts:353-446`; the returned literal at `:433-445` is the allow-list. `banMode` literal-union check `:396-400`, `depth` `:427-431`, both via `isOneOf` over `as const` arrays `:233-239`. `buildDualMegaChoices` `:306-326` is `buildPlayers`-shaped: `safeObject` per element `:313`, two named fields written out `:319`, duplicate `speciesId` refused `:322-323`. | closed |
| T-02-06 | DoS | `import-guard.buildConfig` | mitigate | `poolSize` ≤ `MAX_POOL_IDS` `:385`; `bans` ≤ `MAX_POOL_IDS` via `copyStringArray` `:391`; `dualMegaChoices` ≤ `MAX_POOL_IDS` `:308`; `megasRequiredPerTeam` ≤ **`rounds`** `:416`. Every one is `return null`, never a clamp. Test `tests/core/import-guard.test.ts:727` uses `4e9`. **Deviation, tightening:** the register declared the `megasRequiredPerTeam` bound as `MAX_ROUNDS` (24); the WR-01 fix bounds it by this document's own `rounds` instead, which is strictly tighter since `rounds <= MAX_ROUNDS` already holds. Mitigation intent preserved and strengthened. | closed |
| T-02-07 | Tampering | `JSON.parse` reviver | accept (already mitigated) | `POISON_KEYS` `import-guard.ts:137`; reviver returns `undefined` and records the hit `:665-676`; `hasPoisonKey` uses `Object.prototype.hasOwnProperty.call` `:176-181`. Every descent into a new field goes through `safeObject` — `buildConfig:354`, `buildPlayers:277`, `buildDualMegaChoices:313`, `buildLogEntry:463`, `buildDoc:589`, `rng:604`. Logged as AR-02. | closed |
| T-02-08 | Tampering | `core/migrate.ts` | mitigate | `migrateV1ToV2` returns fresh literals throughout, `migrate.ts:123-162`; players re-mapped `:129`, `rng` rebuilt `:140`, log entries spread into new objects `:141-161`. `SUPPORTED_SCHEMA_VERSIONS` is a list `:32`, consulted by `includes` `:176`, not a floor. | closed |
| T-02-09 | Tampering | cross-tab `localStorage` | accept (already mitigated) | `isOwner()` gate on `save()` at `persistence.ts:161`; on `undo()` at `store.ts:347`. Both present and unchanged in substance. 02-02 adds no write path. Logged as AR-03. **Scope note:** this accept is correct as scoped to plan 02-02. Plan 02-04 *did* add a write path, which is T-02-15's subject. | closed |
| T-02-10 | Tampering | `TypePill`, `MonCard`, `StatBlock` | mitigate | Names as Preact text children `MonCard.tsx:137-138`; stat labels `StatBlock.tsx:68`; type text `TypePill.tsx:45`. `npm run check:nohtml` — 0 violations in 59 files under `src`. | closed |
| T-02-11 | Tampering | `view-prefs.loadViewPrefs` | mitigate | Union membership checked before return, `view-prefs.ts:93-94`; both fields discarded together on any miss; object rebuilt field by field `:98`. Test `tests/adapters/view-prefs.test.ts:123` seeds `{"density":"enormous","pane":"sideways"}`. | closed |
| T-02-12 | DoS | `view-prefs.saveViewPrefs` | mitigate | `JSON.stringify` and `setItem` both inside the `try`, `view-prefs.ts:116-118`; the `catch` is empty `:118-121`. No reference to `savingBlocked` anywhere in the file. | closed |
| T-02-13 | Tampering | `TypePill` inline style | mitigate | `style` binds exactly `--pill-fill` and `--pill-ink` from `display`, `TypePill.tsx:42`; `display` comes from `typeDisplay` over the closed 18-entry `TYPE_CODES` (`type-codes.ts:52-71`), looked up through `Object.prototype.hasOwnProperty.call` `:82`. An unmapped type returns `null` and renders no pill, `TypePill.tsx:31-32`. | closed |
| T-02-14 | Tampering | `PlayerList`, `TurnBanner`, `LandingScreen` | mitigate | Player name is an input `value` `PlayerList.tsx:76`; turn name a text child `TurnBanner.tsx:103`; the sentence reaching `announce` is a composed string `TurnBanner.tsx:76`; format label composed at `LandingScreen.tsx:72` and rendered as a `<p>` text child `:151`. `check:nohtml` enforced. | closed |
| **T-02-15** | **Elevation of privilege** | **`createTournament`** | **accept — REJECTED** | **The stated rationale is contradicted by the code. See "Rejected Accept" below. Not entered in the Accepted Risks Log.** | **open** |
| T-02-16 | Tampering | `LandingScreen` resume path | mitigate | The boot snapshot comes from `loadSavedTournament()` = `persistence.load` (`app.tsx:274-276`), which runs `isValidTournament` `persistence.ts:269` and `migrate` `:292`. `handleResume` re-reads through the same function at click time `app.tsx:778` and adopts via `adoptTournament`, which re-runs `migrate` `store.ts:255`. No raw parse on either path. | closed |
| T-02-17 | DoS | `drawPool` call in `ConfigScreen` | mitigate | `ConfigScreen.tsx:513` — `if (feasibility.blocked \|\| poolSize === null) return null;` guards the draw memo, so an over-large configuration never reaches `nextInt`'s empty-range `RangeError`. `handleStart` refuses on the same condition `:685`. | closed |
| T-02-18 | Repudiation | the action log | accept | `actorId` is the constant `ACTOR_HOST`, `store.ts:45`, stamped at `:121`. Logged as AR-04. | closed |
| T-02-19 | DoS | `ConfigScreen` → `drawPool` | mitigate | Same evidence as T-02-01. `grep` confirms no retry loop in `draw.ts`; the prohibition is restated at the call site, `ConfigScreen.tsx:518-523`. | closed |
| T-02-20 | Tampering | `parseNumericField` | mitigate | `NumericField.tsx:52-60` — trim, empty → `null`, `!Number.isFinite` → `null`. Both numeric fields parse through it exactly once: `ConfigScreen.tsx:354-357` and `:479-482`. **Grep-checkable absence verified:** `Number(` appears in `src/` only at `NumericField.tsx:56` (`Number(trimmed)`, immediately `isFinite`-guarded — this *is* the mitigation) and in `import-guard.ts`'s `isFiniteNumber` helper. No `Number(raw)` at any call site. Tests `tests/ui/config-screen.test.tsx:464-467`, `tests/ui/config-feasibility.test.tsx:395`. | closed |
| T-02-21 | DoS | `ConfigScreen` → `checkFeasibility` | accept | Undebounced recompute per keystroke, `ConfigScreen.tsx:489-504`; pure arithmetic over ≤235 ids with two `Set` builds. Logged as AR-05. | closed |
| T-02-22 | Tampering | `pool/built.megaCapableCount` | mitigate | Counted from the chosen set, `draw.ts:136-138`, never echoed from `megasRequired`; passed through as `draw.megaCapableCount` at `ConfigScreen.tsx:719`. Bounded on import by `optionalCount(..., MAX_POOL_IDS)` `import-guard.ts:492`. | closed |
| T-02-23 | Tampering | `MonChip`, `TeamStrip`, `BoardGrid`, `ConfirmDialog` | mitigate | `MonChip.tsx:51` puts the name in an `alt` attribute value; confirm bodies arrive pre-composed as strings and render as a `<p>` text child, `ConfirmDialog.tsx:71` with the rule stated at `:22-24`. `check:nohtml` enforced. | closed |
| T-02-24 | Tampering | `view-prefs` `pane` → `SplitPanes` | mitigate | First coercion: union check `view-prefs.ts:94`. Second, independent coercion: `app.tsx:507` — `storedPane === 'pool' && !poolExpandable ? 'split' : storedPane`. Test `tests/ui/draft-panes.test.tsx:356` — "is forced to split mid-draft, silently". | closed |
| T-02-25 | Elevation of privilege | `TopBar` `Ctrl+Z` → `store.undo` | mitigate | Both paths converge on `handleUndo` (`TopBar.tsx:98-100`): the button at `:164` and the `document` keydown listener at `:149`. `handleUndo` calls `onRequestUndo` = `app.tsx:642` `handleRequestUndo`, where the D-37 boundary confirm lives `:647-664` — so neither path reaches `store.undo` without it. `isOwner()` guards at `TopBar.tsx:146` and `store.ts:347`. | closed |
| T-02-26 | Tampering | adopted document → draft screen | mitigate | `checkFeasibility` runs against every folded document, `app.tsx:539-555`, and surfaces a non-blocking `role="status"` notice `:986-990`. `import-guard`'s "a bound is not an integrity check" posture intact, `import-guard.ts:509`. No defensive mid-draft pool-dry handling anywhere — argued at `app.tsx:517-538`. | closed |
| T-02-27 | DoS | `clearSaved` | mitigate | `persistence.ts:203-210` — `localStorage.removeItem(STORAGE_KEY)` inside `try`/`catch`. No `clear()`, no key iteration anywhere in `src/`. `champions-drafter:view` is a separate key `view-prefs.ts:27`. | closed |
| T-02-28 | Repudiation | `abandonTournament` | accept | `ABANDON_CONFIRM` is the record; exported JSON is the durable one. Logged as AR-06. | closed |
| T-02-29 | DoS | `SplitPanes` layout | accept | No virtualization and no `content-visibility`. Grep over `src/` returns matches only inside doc blocks explaining the absence (`MonCard.tsx:31`, `PoolGrid.tsx:30-33`, `:438-445`); grep over `src/**/*.css` returns nothing. Logged as AR-07. | closed |
| T-02-30 | Tampering | `TypeaheadField`, `BanChipList`, `MonCard`, `TopBar` disclosure | mitigate | Query composed into a pre-built sentence `TypeaheadField.tsx:68-69` and rendered as a `<p>` text child `:233-234`; option names as text children `:221`; `MonCard` accessible name is an `aria-label` value `:125`. `check:nohtml` enforced. | closed |
| T-02-31 | Tampering | imported `config.bans` → `bannedEntries` | accept (already mitigated) | Bounded on import, `import-guard.ts:391`. Containment: `bannedEntries` intersects the banlist against the roster, `bans.ts:69-71`, so a stale or hostile id resolves to nothing. Tests `tests/core/bans.test.ts:48,66,85`. Logged as AR-08. | closed |
| T-02-32 | Tampering | ban counts across four surfaces | mitigate | One derivation, `bannedEntries` (`bans.ts:65-72`), feeds chips (`ConfigScreen.tsx:391,866`), the clear-confirm count (`:623`), the announcement (`:432`) and the top-bar disclosure (`app.tsx:588-591`). **Grep-checkable absence verified:** `bans.length` appears nowhere in `ConfigScreen.tsx` or `app.tsx`. | closed |
| T-02-33 | Tampering | `ConfigScreen` ban write path | mitigate | `applyBan` returns early when membership already matches, `ConfigScreen.tsx:423`. Both surfaces route through it — grid `toggleBan` `:444-447`, typeahead `handleAddBan` `:454-457`. The announcement counts through `bannedEntries` `:432`, not `nextBans.length`. | closed |
| T-02-34 | DoS | `TypeaheadField` per-keystroke match | accept | Query normalized once per keystroke outside the loop, `TypeaheadField.tsx:101`; single `includes` per entry `search.ts:71`; `slice(0, MAX_RESULTS)` with `MAX_RESULTS = 8` at `TypeaheadField.tsx:60,105`. Logged as AR-09. | closed |
| T-02-35 | Elevation of privilege | the `Bans ({n})` disclosure | mitigate | `TopBar.tsx:209-218` renders `<details>` / `<summary>` / `<ul>` / `<li>{name}</li>` and contains no `<button>`. No ban action exists in the vocabulary — grep for `ban` in `src/core/actions.ts` returns nothing. Config is written once, at Start, through `createTournament`. | closed |
| T-02-40 | Tampering | `FilterBar` search input, `PoolGrid` empty states | mitigate | Query composed into a pre-built body, `PoolGrid.tsx:357,363`, rendered as a `<p>` text child `:430`. `check:nohtml` enforced. | closed |
| T-02-41 | Tampering | filter state → tournament document | mitigate | `useState` local to `PoolGrid`, `PoolGrid.tsx:167`; the file imports nothing from `src/store.ts` and contains no `dispatch` call. **Grep-checkable absence verified:** no `filter`/`query`/`search` field in `src/core/model.ts` or `src/core/actions.ts`. | closed |
| T-02-42 | Tampering | the 18 toolbar `style` bindings | accept (already mitigated) | `FilterBar.tsx:168` binds only `--pill-fill` and `--pill-ink` from `display`; `FILTER_TYPES` is built from `TYPE_CODES` keys filtered through `typeDisplay` at module scope `:89-90`. Identical posture to T-02-13. Logged as AR-10. | closed |
| T-02-43 | DoS | per-keystroke filter recomputation | accept | `compileFilters` runs once per change `search.ts:168`; `matchesFilters` is a boolean pass `:196`. No virtualization, no `content-visibility` — both grep-asserted absent (see T-02-29). Logged as AR-11. | closed |
| T-02-44 | DoS | debounced announcement timer | mitigate | One debounce timer held in `pendingRef` `PoolGrid.tsx:212`; `cancelPendingAnnouncement` `:219-223`; cleared on every effect re-run and on unmount `:330`, and **explicitly on a pick or ban commit** `:255` and on a density change `:191`. The commit cancellation — the mitigation the register names as the one that matters — is present and now unconditional (WR-04 fix). | closed |
| T-02-45 | Info disclosure | all filter surfaces | accept | Filters operate over publicly shipped roster data; the query never leaves the tab (see T-02-41 evidence). Logged as AR-12. | closed |
| T-02-SC | Tampering | npm installs | accept | `git diff --stat bc95fdd HEAD -- package.json package-lock.json` returns empty. Runtime dependencies remain exactly `preact` and `@preact/signals`. Logged as AR-13. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Rejected Accept — T-02-15

**Category:** Elevation of privilege · **Severity:** HIGH · **Disposition declared:** accept ·
**Verdict:** the accept does not hold. Classified **open**.

### The rationale, and why it is false

02-04 accepted this threat on the grounds that "the new write path runs before any tournament
exists, so the window the tab-ownership lock protects has not opened."

That sentence is true of *this tab's store* and false of *the origin's storage*. The tab lock
protects one shared `localStorage` key, `champions-drafter:tournament`, which is per-origin.
The protected window opens when a record exists under that key — not when this tab's
`docSignal` becomes non-null. A secondary tab can hold a null store while the owner's
tournament sits in storage, and that is precisely the state in which the new write path is
reachable.

Review finding WR-07 recorded this and is still `OPEN — reported, not fixed`. Verified against
current code at `49259a2`, WR-07(b) is live.

### The failing sequence, verified line by line

1. Tab A owns the lock and holds a live tournament. Its last `save()` wrote `generation = G`
   (`persistence.ts:160-186`).
2. Tab B opens. The `saved` initializer calls `loadSavedTournament()` (`app.tsx:274-276`) →
   `persistence.load()`, which sets tab B's module-level `generation = G`
   (`persistence.ts:273-274`). `claimOwnership` (`app.tsx:404-408`) sees A's pong and calls
   `becomeSecondary()` (`tab-lock.ts:505`). `isOwner()` is now false.
3. `readOnly` is true (`app.tsx:422`) but `inert` is applied **only** to
   `<div class="draft-region">` (`app.tsx:948`). `LandingScreen` (`app.tsx:896-905`) and
   `ConfigScreen` (`app.tsx:919-926`) are siblings outside that div and stay fully operable.
4. The host clicks `New tournament` in tab B (`app.tsx:901`), fills the form, clicks
   `Start draft` → `handleStart` (`ConfigScreen.tsx:684-745`). There is no `isOwner()` check
   in that function.
5. `createTournament` (`store.ts:196-234`) assigns both signals and dispatches `pool/built`
   and `draft/started`. `dispatch` (`store.ts:110-136`) is deliberately un-gated, argued at
   `store.ts:332-345`. Tab B now holds a **different tournament** from tab A's.
6. The autosave effect starts — gated on `state !== null && storageOk` only
   (`app.tsx:439-443`). Every `save()` is refused by `isOwner()` at `persistence.ts:161`.
   **This is the step the accept rationale stops at, and it is correct as far as it goes.**
7. Tab A makes no further save — the owner tab is idle because the host has walked over to
   tab B. Stored generation stays `G`.
8. The host clicks `Take over drafting here` → `requestTakeover()` (`tab-lock.ts:510-518`) →
   `becomeOwner(null)` → `onPromote` (`tab-lock.ts:360`) = `adoptWhateverIsNewer`
   (`app.tsx:392-402`) → `loadIfNewer()` → `storedGeneration (G) <= generation (G)` → returns
   `null` (`persistence.ts:337`). Nothing is adopted. **Tab B keeps its own new tournament.**
9. `isOwner()` is now true. Tab B's next document change, or the `pagehide` flush
   (`persistence.ts:432,444`), reaches `save()` — which now succeeds and writes `G+1`
   carrying tab B's tournament over tab A's draft.

The window in step 7 is not exotic: it is the ordinary "host walks to the other screen"
case, and it is the exact configuration PERS-03 exists for.

### Impact

Silent, irreversible destruction of the application's sole durable artifact. No error, no
banner, no announcement. Recovery only from a JSON the host had already downloaded. This is
the same T-01-40 clobber shape as CR-01 and CR-02 — both of which this phase classified
Critical and fixed — arriving through `New tournament` instead of `Resume` or abandon.

### Why this is a blocker under this phase's config

`block_on: [critical, high]`. Rated HIGH: an integrity/availability failure on the primary
data asset, silent, unrecoverable, reachable from documented host behaviour.

### What is NOT recommended

Do not move `inert` from `.draft-region` to the shell root. 02-REVIEW.md records why that
answer is wrong: the shell root also contains `LiveRegion`, `ReadOnlyBanner` and both
dialogs, so `inert` there would silence every announcement in a read-only tab — including
`ReadOnlyBanner`'s own — and would make `Take over drafting here` unreachable, which is the
hard lockout `tab-lock.ts`'s header names as worse than the race it prevents.

The corrected sequence is carried forward in 02-REVIEW.md under "Recommended sequence,
carried forward". Fixing WR-07 by that sequence closes T-02-15. Implementation is out of
this audit's scope — this record escalates, it does not patch.

### On re-dispositioning

If the fix is deferred, T-02-15 may be re-accepted only with a rationale that survives the
sequence above — that is, one that addresses the *stored record*, not this tab's store.
The current rationale cannot be moved into the Accepted Risks Log, because the rationale is
the accept and the code disproves it.

### Gate decision — 2026-08-13

Offered the choice between accepting T-02-15 into the Accepted Risks Log and holding the
gate, the host chose to **hold the gate**. T-02-15 stays open, `threats_open: 1`, and phase
advancement is blocked. It was not re-accepted under a new rationale and it was not logged
as documented residual risk.

The fix is WR-07, by 02-REVIEW.md's carried-forward sequence — restructure the shell root as
a Fragment so `inert` wraps the screens alone, delete the `.draft-region` `inert` in the
same change so there is one gate rather than two, then route unconditionally in
`adoptWhateverIsNewer`.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01 | T-02-04 | Draw, feasibility and ban logic are pure functions over roster data the app already ships publicly. No secret, network call, storage write or PII is involved. | 02-01-PLAN | 2026-08-13 |
| AR-02 | T-02-07 | Prototype-pollution defences pre-date this phase and are unchanged. Every field added in 02-02 descends through `safeObject`, so the existing control covers the new surface without extension. | 02-02-PLAN | 2026-08-13 |
| AR-03 | T-02-09 | Plan 02-02 adds no write path; the two existing `isOwner()` gates are unchanged. Scoped to 02-02 only — 02-04's new write path is T-02-15 and is **not** covered by this acceptance. | 02-02-PLAN | 2026-08-13 |
| AR-04 | T-02-18 | Single user, single device, no accounts. `actorId` is the constant `'host'` and exists for a future sync layer, not for attribution today. | 02-04-PLAN | 2026-08-13 |
| AR-05 | T-02-21 | Undebounced feasibility recompute per keystroke (D-16). Pure arithmetic over ≤235 ids with two `Set` builds, sub-millisecond. A stale reason beside a live Start button is the worse outcome. | 02-05-PLAN | 2026-08-13 |
| AR-06 | T-02-28 | Single user, single device, no accounts. The confirmed dialog is the record; exported JSON is the only durable one, which the body copy states. | 02-06-PLAN | 2026-08-13 |
| AR-07 | T-02-29 | Two panes over ≤96 pool cells and 8×6 board cells. Virtualization is rejected by CLAUDE.md at this scale; `content-visibility` conflicts with `MonCard`'s `min-height`. | 02-06-PLAN | 2026-08-13 |
| AR-08 | T-02-31 | An imported banlist is bounded by `import-guard` and contained by `bannedEntries`' roster intersection. Referential integrity is deliberately not performed — "a bound is not an integrity check". | 02-07-PLAN | 2026-08-13 |
| AR-09 | T-02-34 | One normalization per keystroke, one `includes` per entry over ≤235 entries, sliced to 8 options. Same posture as D-16. | 02-07-PLAN | 2026-08-13 |
| AR-10 | T-02-42 | Each of the 18 toolbar buttons sets two CSS custom properties from `typeDisplay()` over the closed `TYPE_CODES` map. Neither roster data nor host input reaches a CSS declaration. | 02-08-PLAN | 2026-08-13 |
| AR-11 | T-02-43 | One `toSearchKey` per change, ≤235 `includes` calls, ≤2 type-array reads per entry. No virtualization, no `content-visibility`. | 02-08-PLAN | 2026-08-13 |
| AR-12 | T-02-45 | Filters operate over publicly shipped roster data. The query reaches no storage, no export and no network — it never leaves the tab. | 02-08-PLAN | 2026-08-13 |
| AR-13 | T-02-SC | Every plan in the phase installs nothing. `package.json` and `package-lock.json` are byte-identical to base `bc95fdd`. Runtime dependencies remain exactly two. | all 8 plans | 2026-08-13 |

*Accepted risks do not resurface in future audit runs.*

**T-02-15 is deliberately absent from this table.** See "Rejected Accept" above.

---

## Unregistered Flags

None that constitute new unmapped attack surface.

Five summaries carry a `## Threat Flags` section and all five read "None" — 02-01, 02-05,
02-06, 02-07, 02-08. 02-03 and 02-04 carry a `## Threat Model Coverage` table instead.

Two audit notes, neither a blocker:

- **02-02 records neither section.** Its six threats (T-02-05…T-02-09, T-02-SC) were
  therefore unverified by the executor's own record. All six were read closely in code by
  this audit and all six close on evidence above. Process gap, not a security gap.
- **`PoolGrid` carries a second timer, `repeatRef` (`PoolGrid.tsx:213,318-321`),** introduced
  by the clear-then-speak path and not present when T-02-44 was written. It is not cleared by
  `cancelPendingAnnouncement`, deliberately and with the reason stated at `:333-334`. It
  cannot accumulate — each `pendingRef` fire arms at most one, at 0ms delay, and the next
  `pendingRef` fire is ≥300ms later — so it is not a resource-exhaustion vector and needs no
  threat entry. Recorded so a later reader does not mistake it for an unbounded timer.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-08-13 | 42 | 41 | 1 | gsd-security-auditor (Claude) |

Gates run as part of this audit:

| Gate | Result |
|---|---|
| `npm run check:nohtml` | 0 violations in 59 files under `src` |
| `npm run check:pure` | 0 violations in 15 files under `src/core` |
| `git diff --stat bc95fdd HEAD -- package.json package-lock.json` | empty |
| grep: `Number(raw)` in `src/` | absent |
| grep: `bans.length` in `ConfigScreen.tsx`, `app.tsx` | absent |
| grep: filter field in `core/model.ts`, `core/actions.ts` | absent |
| grep: retry loop (`while`/`do`) in `core/draw.ts` | absent |
| grep: `content-visibility` / `contain-intrinsic` / virtualization in `src/**` incl. CSS | absent from code; present only in doc blocks explaining the absence |
| grep: ban action in `core/actions.ts` | absent |
| grep: `<button>` inside the `Bans ({n})` disclosure | absent |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log — 13 entries
- [ ] `threats_open: 0` confirmed — **currently 1 (T-02-15)**
- [ ] `status: verified` set in frontmatter

**Approval:** pending — blocked on T-02-15.

Next: fix WR-07 by 02-REVIEW.md's carried-forward sequence, or re-disposition T-02-15 with a
rationale that survives the failing sequence above, then re-run `/gsd-secure-phase 2`.
