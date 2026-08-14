---
phase: 2
slug: 02-host-configured-draft-night
status: verified
threats_open: 0
asvs_level: 1
created: 2026-08-13
audited_at: 132eaec
diff_base: bc95fdd
threats_total: 42
threats_closed: 42
block_on: [critical, high]
blocking_findings: []
---

# Phase 2 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

This is a static, serverless, single-origin browser application. There is no server, no
account, no session and no network call after first load, so no finding below concerns
authentication, transport security or a server-side control — there is nowhere to host one.
The real attack surface this audit judged is: input validation on the import path, the
`localStorage` record as the same input class by another route, DOM-injection sinks,
resource exhaustion in pure compute, and the cross-tab ownership model.

Every threat was verified against code at commit `49259a2`, re-confirmed at `a67fa17`, and
re-verified at `132eaec`. Line numbers cited in the eight PLAN.md files predate the review-fix
commits and the WR-07 fix, and were re-located rather than reported as misses. Evidence below
is `file:line` at HEAD (`132eaec`).

Run 3 (`132eaec`) audited the WR-07 fix, which restructured `app.tsx`'s shell root and moved
the read-only gate. `src/app.tsx` changed by 372 lines, so every `app.tsx:NNN` citation was
re-located in source; `src/ui/screens/ConfigScreen.tsx` and `src/ui/components/TopBar.tsx`
changed only in comments below their cited regions and were re-read anyway. No mitigation
disappeared in the refactor. **T-02-15 closes on the fix** — see "Closed — T-02-15" below.

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
| host config → `createTournament` → the log | The phase's only new write path. **No longer reachable from a read-only secondary tab — the gate at `app.tsx:947-949` wraps the config screen. See T-02-15.** | Whole tournament document |
| imported `config.bans` → `bannedEntries` | `import-guard` deliberately performs no referential integrity. | Species id array |
| host banlist → `drawPool` candidates → `pool/built.ids` | Permanent, exported, importable. BAN-08 enforced here, with no second enforcement point. | Species id array |
| `document`-level `Ctrl+Z` → `store.undo` | Listener registered outside the `inert` shell, so a read-only tab's keystroke reaches the handler. | Keystroke |
| `localStorage` `champions-drafter:tournament` → `clearSaved` | Destructive write to shared-origin storage from one confirmed click. | Key removal |
| filter state → nowhere | Deliberately terminal. Its absence from every persistence path is the security-relevant property. | — |

---

## Threat Register

42 of 42 closed.

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
| T-02-09 | Tampering | cross-tab `localStorage` | accept (already mitigated) | `isOwner()` gate on `save()` at `persistence.ts:161`; on `undo()` at `store.ts:347`. Both present and unchanged in substance. 02-02 adds no write path. Logged as AR-03. **Scope note:** this accept is correct as scoped to plan 02-02. Plan 02-04 *did* add a write path, which is T-02-15's subject and is now separately mitigated. | closed |
| T-02-10 | Tampering | `TypePill`, `MonCard`, `StatBlock` | mitigate | Names as Preact text children `MonCard.tsx:137-138`; stat labels `StatBlock.tsx:68`; type text `TypePill.tsx:45`. `npm run check:nohtml` — 0 violations in 59 files under `src`. | closed |
| T-02-11 | Tampering | `view-prefs.loadViewPrefs` | mitigate | Union membership checked before return, `view-prefs.ts:93-94`; both fields discarded together on any miss; object rebuilt field by field `:98`. Test `tests/adapters/view-prefs.test.ts:123` seeds `{"density":"enormous","pane":"sideways"}`. | closed |
| T-02-12 | DoS | `view-prefs.saveViewPrefs` | mitigate | `JSON.stringify` and `setItem` both inside the `try`, `view-prefs.ts:116-118`; the `catch` is empty `:118-121`. No reference to `savingBlocked` anywhere in the file. | closed |
| T-02-13 | Tampering | `TypePill` inline style | mitigate | `style` binds exactly `--pill-fill` and `--pill-ink` from `display`, `TypePill.tsx:42`; `display` comes from `typeDisplay` over the closed 18-entry `TYPE_CODES` (`type-codes.ts:52-71`), looked up through `Object.prototype.hasOwnProperty.call` `:82`. An unmapped type returns `null` and renders no pill, `TypePill.tsx:31-32`. | closed |
| T-02-14 | Tampering | `PlayerList`, `TurnBanner`, `LandingScreen` | mitigate | Player name is an input `value` `PlayerList.tsx:76`; turn name a text child `TurnBanner.tsx:103`; the sentence reaching `announce` is a composed string `TurnBanner.tsx:76`; format label composed at `LandingScreen.tsx:72` and rendered as a `<p>` text child `:151`. `check:nohtml` enforced. | closed |
| **T-02-15** | **Elevation of privilege** | **`createTournament`** | **mitigate — re-dispositioned** | **The declared `accept` was rejected twice and the fix shipped instead. One `inert` gate at `app.tsx:947-949` wraps `LandingScreen` `:955-964`, `ConfigScreen` `:978-985` and the draft `:987-1106`; `.draft-region` is deleted from `src/` and `tests/` entirely, so there is one gate rather than two. `LiveRegion` `:937`, `ReadOnlyBanner` `:945` and the three dialogs `:1116-1153` are siblings and stay operable. Pinned from both sides at `tests/ui/read-only-shell.test.tsx:351-384` and `:386-406`. See "Closed — T-02-15" below for the step-by-step walk and the two recorded caveats. | closed |
| T-02-16 | Tampering | `LandingScreen` resume path | mitigate | The boot snapshot comes from `loadSavedTournament()` = `persistence.load` (`app.tsx:274-276`), which runs `isValidTournament` `persistence.ts:269` and `migrate` `:292`. `handleResume` re-reads through the same function at click time **`app.tsx:790`** (was `:778`) and adopts via `adoptTournament` `:792`, which re-runs `migrate` `store.ts:255`. No raw parse on either path. | closed |
| T-02-17 | DoS | `drawPool` call in `ConfigScreen` | mitigate | `ConfigScreen.tsx:513` — `if (feasibility.blocked \|\| poolSize === null) return null;` guards the draw memo, so an over-large configuration never reaches `nextInt`'s empty-range `RangeError`. `handleStart` refuses on the same condition `:685`. | closed |
| T-02-18 | Repudiation | the action log | accept | `actorId` is the constant `ACTOR_HOST`, `store.ts:45`, stamped at `:121`. Logged as AR-04. | closed |
| T-02-19 | DoS | `ConfigScreen` → `drawPool` | mitigate | Same evidence as T-02-01. `grep` confirms no retry loop in `draw.ts`; the prohibition is restated at the call site, `ConfigScreen.tsx:518-523`. | closed |
| T-02-20 | Tampering | `parseNumericField` | mitigate | `NumericField.tsx:52-60` — trim, empty → `null`, `!Number.isFinite` → `null`. Both numeric fields parse through it exactly once: `ConfigScreen.tsx:354-357` and `:479-482`. **Grep-checkable absence verified:** `Number(` appears in `src/` only at `NumericField.tsx:56` (`Number(trimmed)`, immediately `isFinite`-guarded — this *is* the mitigation) and in `import-guard.ts`'s `isFiniteNumber` helper. No `Number(raw)` at any call site. Tests `tests/ui/config-screen.test.tsx:464-467`, `tests/ui/config-feasibility.test.tsx:395`. | closed |
| T-02-21 | DoS | `ConfigScreen` → `checkFeasibility` | accept | Undebounced recompute per keystroke, `ConfigScreen.tsx:489-504`; pure arithmetic over ≤235 ids with two `Set` builds. Logged as AR-05. | closed |
| T-02-22 | Tampering | `pool/built.megaCapableCount` | mitigate | Counted from the chosen set, `draw.ts:136-138`, never echoed from `megasRequired`; passed through as `draw.megaCapableCount` at `ConfigScreen.tsx:719`. Bounded on import by `optionalCount(..., MAX_POOL_IDS)` `import-guard.ts:492`. | closed |
| T-02-23 | Tampering | `MonChip`, `TeamStrip`, `BoardGrid`, `ConfirmDialog` | mitigate | `MonChip.tsx:51` puts the name in an `alt` attribute value; confirm bodies arrive pre-composed as strings and render as a `<p>` text child, `ConfirmDialog.tsx:71` with the rule stated at `:22-24`. `check:nohtml` enforced. | closed |
| T-02-24 | Tampering | `view-prefs` `pane` → `SplitPanes` | mitigate | First coercion: union check `view-prefs.ts:94`. Second, independent coercion: **`app.tsx:519`** (was `:507`) — `storedPane === 'pool' && !poolExpandable ? 'split' : storedPane`, with the mitigation named in the comment at `:506`. Test `tests/ui/draft-panes.test.tsx:356` — "is forced to split mid-draft, silently". | closed |
| T-02-25 | Elevation of privilege | `TopBar` `Ctrl+Z` → `store.undo` | mitigate | Both paths converge on `handleUndo` (`TopBar.tsx:98`): the button at `:164` and the `document` keydown listener registered at `:152`, invoking at `:149`. `handleUndo` calls `onRequestUndo` = **`app.tsx:654`** (was `:642`) `handleRequestUndo`, where the D-37 boundary confirm lives **`:659-676`** (was `:647-664`) — so neither path reaches `store.undo` without it. `isOwner()` guards at `TopBar.tsx:146` and `store.ts:347`. | closed |
| T-02-26 | Tampering | adopted document → draft screen | mitigate | `checkFeasibility` runs against every folded document, **`app.tsx:551-585`** (was `:539-555`), and surfaces a non-blocking `role="status"` notice **`:1039-1043`** (was `:986-990`). `import-guard`'s "a bound is not an integrity check" posture intact, `import-guard.ts:509`. No defensive mid-draft pool-dry handling anywhere. | closed |
| T-02-27 | DoS | `clearSaved` | mitigate | `persistence.ts:203-210` — `localStorage.removeItem(STORAGE_KEY)` inside `try`/`catch`. No `clear()`, no key iteration anywhere in `src/`. `champions-drafter:view` is a separate key `view-prefs.ts:27`. | closed |
| T-02-28 | Repudiation | `abandonTournament` | accept | `ABANDON_CONFIRM` is the record; exported JSON is the durable one. Logged as AR-06. | closed |
| T-02-29 | DoS | `SplitPanes` layout | accept | No virtualization and no `content-visibility`. Grep over `src/` returns matches only inside doc blocks explaining the absence (`MonCard.tsx:31`, `PoolGrid.tsx:30-33`, `:438-445`); grep over `src/**/*.css` returns nothing. Logged as AR-07. | closed |
| T-02-30 | Tampering | `TypeaheadField`, `BanChipList`, `MonCard`, `TopBar` disclosure | mitigate | Query composed into a pre-built sentence `TypeaheadField.tsx:68-69` and rendered as a `<p>` text child `:233-234`; option names as text children `:221`; `MonCard` accessible name is an `aria-label` value `:125`. `check:nohtml` enforced. | closed |
| T-02-31 | Tampering | imported `config.bans` → `bannedEntries` | accept (already mitigated) | Bounded on import, `import-guard.ts:391`. Containment: `bannedEntries` intersects the banlist against the roster, `bans.ts:69-71`, so a stale or hostile id resolves to nothing. Tests `tests/core/bans.test.ts:48,66,85`. Logged as AR-08. | closed |
| T-02-32 | Tampering | ban counts across four surfaces | mitigate | One derivation, `bannedEntries` (`bans.ts:65-72`), feeds chips (`ConfigScreen.tsx:391,866`), the clear-confirm count (`:623`), the announcement (`:432`) and the top-bar disclosure (**`app.tsx:600-602`**, was `:588-591`), consumed at `:1020`. **Grep-checkable absence re-verified at HEAD:** `grep -c "bans\.length"` returns 0 for both `ConfigScreen.tsx` and `app.tsx`. | closed |
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

## Closed — T-02-15

**Category:** Elevation of privilege · **Severity:** HIGH · **Disposition declared:** accept ·
**Disposition shipped:** mitigate · **Verdict at `132eaec`:** the failing sequence is broken
and cannot be routed around. Classified **closed**.

The history below is kept in full rather than replaced, because the closure is only
meaningful against the sequence it breaks. Runs 1 and 2 rejected the declared `accept` and
the host held the gate twice; the fix landed between run 2 and run 3.

### The fix, and where the sequence breaks

The WR-07 fix restructured `app.tsx`'s shell root as a Fragment (`app.tsx:936-1154`) and
moved the single `inert` binding onto a `<div>` that wraps every screen
(`app.tsx:947-949`). `.draft-region` is deleted outright — `grep -rn "draft-region" src/
tests/` returns nothing — so there is one gate rather than two, which is what the
carried-forward sequence required.

Walking the nine recorded steps against code at `132eaec`:

| Step | Status at HEAD | Evidence |
|---|---|---|
| 1 — tab A owns the lock, last `save()` wrote generation `G` | holds (it is the fixture) | `persistence.ts:160-186`, generation assigned `:177` |
| 2 — tab B opens, `load()` sets its generation to `G`, `claimOwnership` → `becomeSecondary()`, `isOwner()` false | holds | `app.tsx:274-276` → `persistence.ts:273-274`; `app.tsx:416-420` → `tab-lock.ts:482-508`, secondary at `:505`; `isOwner` `tab-lock.ts:594` |
| 3 — `readOnly` true but `inert` covers only the draft, leaving the screens operable | **BROKEN** | `readOnly` `app.tsx:434` ← `tab-lock.ts:280`. `inert` is now on the shell `app.tsx:949`, which contains `LandingScreen` `:955-964`, the config loading state `:972-976`, `ConfigScreen` `:978-985` and the whole draft `:987-1106`. The landing and config screens are children of the gate, not siblings of it |
| 4 — host clicks `New tournament`, fills the form, clicks `Start draft`; `handleStart` has no ownership check | **BROKEN** at the input path | `New tournament` is a descendant of the inert element — asserted on a real secondary tab at `tests/ui/read-only-shell.test.tsx:371-373`. `handleStart` `ConfigScreen.tsx:684-745` is still **not** ownership-aware (`grep isOwner src/ui/screens/ConfigScreen.tsx` → no match); the gate is structural |
| 5 — `createTournament` assigns both signals and dispatches | unchanged, unreachable | `store.ts:196-234`; `dispatch` still un-gated, argued `store.ts:332-345` |
| 6 — autosave gated on `state !== null && storageOk`; every `save()` refused | unchanged | `app.tsx:451-455`; `persistence.ts:161` |
| 7 — owner tab idle, stored generation stays `G` | unchanged | — |
| 8 — `Take over drafting here` → `loadIfNewer()` returns `null`, tab B keeps its own tournament | **STILL HOLDS** | `adoptWhateverIsNewer` still early-returns at `app.tsx:394`; `loadIfNewer` still returns `null` on `storedGeneration <= generation`, `persistence.ts:337`. The `setScreen({ name: 'draft' })` added at `:413` sits **inside** the `newer !== null` branch and does not change the null case |
| 9 — next save or `pagehide` flush writes `G+1` over tab A's draft | unchanged | `persistence.ts:432,444` |

The sequence is broken at **step 3/4 only**. Step 8 — the second half of the clobber
machinery — is untouched. Closure therefore rests entirely on the proposition that **no
route exists for a secondary tab to acquire a divergent in-memory document.** That
proposition was verified by enumeration rather than assumed:

| Route to a divergent document | Where it is stopped |
|---|---|
| `createTournament` | Sole caller `ConfigScreen.tsx:709`, inside `handleStart`, inside the gate |
| `adoptTournament` ← `handleResume` | `app.tsx:792`, reached only from `LandingScreen`'s button, inside the gate |
| `adoptTournament` ← `adoptImported` | `app.tsx:753` ← `handleImportFile`, reached only from the `LandingScreen` and `TopBar` file inputs, both inside the gate |
| `adoptTournament` ← `adoptWhateverIsNewer` | `app.tsx:395` — installs only a strictly-newer **stored** document, so it cannot diverge by construction |
| `store.undo` | `store.ts:347` `isOwner()`, plus `TopBar.tsx:146` |
| `handlePick` → `dispatch` | Pool cells are inside the gate, with no document-level listener of their own |
| `abandonTournament` | `TopBar` is inside the gate; the remote `onAbandoned` path is correct by design |

`inert` governs targeting **inside** a subtree, so document- and window-level listeners
escape it. That class was enumerated exhaustively —
`grep -rn "document.addEventListener\|window.addEventListener\|addEventListener(" src/`
returns exactly four sites: `persistence.ts:437-438` (`pagehide` / `visibilitychange` →
`flush` → `save`, `isOwner()`-gated at `:161`), `tab-lock.ts:631-632` (`pagehide` /
`pageshow`), `main.tsx:44` (service-worker registration) and `TopBar.tsx:152` (`Ctrl+Z`,
`isOwner()`-gated at `:146` and again at `store.ts:347`). None reaches a divergence path.

### The escape hatches were not silenced — the retracted answer was avoided

The rejected fix — `inert` on the shell root — would have been a hard lockout. It was not
taken. Verified outside the gate and still operable:

- `LiveRegion` — `app.tsx:937`. `tests/ui/read-only-shell.test.tsx:399` asserts
  `gate.contains(region) === false`, and `:403` asserts the region **node** carries
  `READ_ONLY_SENTENCE` — on the node, not on `host.textContent`, so the banner's visible
  copy cannot satisfy it.
- `ReadOnlyBanner` — `app.tsx:945`. Renders the sentence and `Take over drafting here` and
  nothing else (`ReadOnlyBanner.tsx:73-88`), so no write path leaked outside the gate
  alongside it. `tests/ui/read-only-shell.test.tsx:379-381` asserts
  `gate.contains(takeover) === false`.
- The three app-level dialogs — `app.tsx:1116-1153`, siblings of the gate.

### The tests pin the property from both sides

`tests/ui/read-only-shell.test.tsx` asserts, against a real `App` on a real DOM with a rival
tab holding the lock:

- the attribute is present when the tab is a secondary (`:310`) and absent both in a lone
  tab (`:347`) and after takeover (`:326`);
- **exactly one** `[inert]` element exists in the whole tree (`:315`, `:327`) — this is what
  makes "one gate, not two" a runtime fact rather than a code-reading;
- too narrow is caught: `gate.contains(newTournament) === true` from the landing screen of a
  secondary (`:373`);
- too wide is caught: `gate.contains(takeover) === false` (`:381`) and
  `gate.contains(liveRegion) === false` (`:399`).

The file states plainly what it cannot prove (`:31-37`, `:366-370`): happy-dom parses `inert`
but implements neither its focus nor its pointer semantics, so no automated test here
demonstrates that the click is actually refused. That is deferred to a named human-verify
checkpoint, and the deferral is honest rather than hidden.

### Is `inert` alone sufficient? — rated for this app's threat context

Sufficient, with the two caveats below recorded.

`inert` is a browser-enforced input-path control — pointer, keyboard, focus and the
accessibility tree — not a presentational veneer. The codebase explicitly rejected the
`pointer-events: none` + `disabled` alternative (`app.tsx:894-897`) precisely because it
leaks to the Tab key, and `grep -rn "pointer-events" src/ --include=*.css` returns nothing,
so no such veneer was substituted. There is likewise no `[inert]` CSS rule, prohibited by
name at `app.css:110-112`.

The actor in this threat is the host's own second tab. There is no server, no session, no
account, and no privilege boundary anywhere else to enforce this at. The bypasses that remain
against a DOM attribute — devtools, the console — are strictly weaker than what the same
actor already has: direct write access to `champions-drafter:tournament` in `localStorage`,
which no in-page control can defend and which is not in scope for a static single-origin app.
Demanding a cryptographic or server-side authorization control here would be a stricter
standard than the app's threat context supports.

**Caveat 1 — there is no defence in depth.** `handleStart` remains ownership-blind, so one
attribute on one element is the entire gate. A future refactor that lifts any screen out of
that `<div>` reopens the sequence exactly, and silently: the UI-SPEC forbids dimming the
pool, so a read-only tab looks identical either way. What holds the line is the containment
test above, and that test is now load-bearing security infrastructure rather than a UI test.

**Caveat 2 — the claim window.** `readOnly` is `status === 'secondary'` (`tab-lock.ts:280`),
so during the 250ms `CLAIM_WINDOW_MS` (`tab-lock.ts:74`) a newly-opened tab renders no gate
while `isOwner()` already returns false. Not exploitable: reaching `Start draft` requires
navigating to the config screen and filling a form, and the window closes ~250ms after mount,
long before any human interaction. Recorded so it is not rediscovered as a finding.

### History — the rationale that was rejected, and why

02-04 accepted this threat on the grounds that "the new write path runs before any tournament
exists, so the window the tab-ownership lock protects has not opened."

That sentence is true of *this tab's store* and false of *the origin's storage*. The tab lock
protects one shared `localStorage` key, `champions-drafter:tournament`, which is per-origin.
The protected window opens when a record exists under that key — not when this tab's
`docSignal` becomes non-null. A secondary tab can hold a null store while the owner's
tournament sits in storage, and that is precisely the state in which the new write path was
reachable.

The impact, had it shipped: silent, irreversible destruction of the application's sole
durable artifact. No error, no banner, no announcement; recovery only from a JSON the host
had already downloaded. The same T-01-40 clobber shape as CR-01 and CR-02 — both of which
this phase classified Critical and fixed — arriving through `New tournament` instead of
`Resume` or abandon. Rated HIGH under `block_on: [critical, high]`.

### Gate decisions — 2026-08-13

Offered the choice between accepting T-02-15 into the Accepted Risks Log and holding the
gate, the host chose to **hold the gate**, twice. It was never re-accepted under a new
rationale and never logged as documented residual risk. **T-02-15 is correctly absent from
the Accepted Risks Log and stays absent** — it closed on a mitigation, not on an acceptance.

### The original failing sequence, verified line by line at `49259a2`

Retained as the specification the fix is measured against. Line numbers are as of `49259a2`
and are deliberately **not** updated; the walk at the top of this section carries the HEAD
citations.

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

### The retracted answer, and confirmation it was not taken

02-REVIEW.md's own first recommendation — move `inert` from `.draft-region` to the shell
root — was retracted, because that root also holds `LiveRegion`, `ReadOnlyBanner` and the
dialogs: it would silence every announcement in a read-only tab, including the banner's own,
and put `Take over drafting here` out of reach. That is the hard lockout `tab-lock.ts`'s
header calls worse than the race the lock prevents.

Confirmed at `132eaec` that the shipped fix took the carried-forward sequence instead and not
the retracted one: the root is a Fragment (`app.tsx:936`), the three escape hatches are its
direct children (`:937`, `:945`, `:1116-1153`), and the gate is a fourth sibling wrapping the
screens (`:947-949`). Asserted at `tests/ui/read-only-shell.test.tsx:379-381` and `:399`.

### Residual observations — recorded, not findings

Neither maps to a register entry and neither blocks. Recorded so they are not rediscovered
as findings later.

- **`adoptWhateverIsNewer`'s safety comment has a narrow exception.** `app.tsx:408-412`
  states that unconditional routing is safe because "a secondary tab cannot have been
  composing anything on the config screen". True of a tab that was *already* secondary;
  not true of a tab that was the **owner** while composing a config and was then demoted by
  another tab's takeover. When the new owner saves, `onRemoteSave` → `setScreen({ name:
  'draft' })` (`app.tsx:413`) unmounts that config form and its local `useState` is lost.
  No document diverges and nothing is clobbered — form state only. This is the case
  02-REVIEW.md warned unconditional routing would create; it is a UX loss, not a security
  finding.
- **`store.ts:334-341` argues from a boot that no longer exists.** It justifies leaving
  `dispatch` un-gated on the grounds that `createTournament` "dispatches `pool/built` and
  `draft/started` during boot — inside that window whenever the roster snapshot comes from
  cache". Since D-01 (plan 02-04) nothing is created at boot; `createTournament` is reached
  only from a human click on `Start draft`, which cannot land inside a 250ms claim window
  that opens at mount. The reasoning is stale; the conclusion the fix depends on is not.
  Documentation drift, no code impact.
- **`ConfigScreen`'s four confirm dialogs are now inside the gate.** Deliberate and argued
  at `ConfigScreen.tsx:963-971`: a secondary cannot open one in the first place, and a tab
  demoted with one already open gets an inert dialog whose exit — `Take over drafting here`
  — is one click away outside the gate. No threat covers dialog reachability; T-02-23 covers
  their content, and that is unaffected.
- **Containment is tested from the landing screen only.** `tests/ui/read-only-shell.test.tsx`
  asserts `New tournament` is inside the gate; no test drives a secondary tab onward to the
  config screen and asserts `Start draft` is inside it too. Structurally unambiguous —
  `ConfigScreen` renders in the same `<div>` at `app.tsx:978-985` — and the exactly-one
  `[inert]` assertion would catch a second gate appearing. Completeness note, not a hole.

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

*Accepted risks do not resurface in future audit runs.* All 13 were re-confirmed present and
unchanged at `132eaec`; none was re-litigated.

**T-02-15 is deliberately absent from this table, and stays absent.** It closed on a
mitigation rather than an acceptance — see "Closed — T-02-15" above.

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
| 2026-08-13 (run 2, `a67fa17`) | 42 | 41 | 1 | /gsd-secure-phase orchestrator — no code change since run 1; open threat re-checked in source |
| 2026-08-14 (run 3, `132eaec`) | 42 | **42** | **0** | gsd-security-auditor (Claude) — WR-07 fix audited; T-02-15 closed on mitigation; every `app.tsx` citation re-located |

Gates run as part of run 3, at `132eaec`, working tree clean:

| Gate | Result |
|---|---|
| `npm run check:pure` | 0 violations in 15 files under `src/core` |
| `npm run check:nohtml` | 0 violations in 59 files under `src` |
| `npm test` | **877 passed / 877, 43 files** (up from 875/43 — the two added by the WR-07 containment tests) |
| `git diff --stat bc95fdd HEAD -- package.json package-lock.json` | empty — AR-13 / T-02-SC holds |
| `git status --porcelain` | empty |
| grep: `inert=` bindings in `src/**/*.tsx` | exactly **1**, `app.tsx:949` |
| grep: `draft-region` in `src/`, `tests/` | absent — the second gate is deleted, not merely bypassed |
| grep: `[inert]` rule in `src/**/*.css` | absent, and prohibited by name at `app.css:110-112` |
| grep: `pointer-events` in `src/**/*.css` | absent — no veneer substituted for the attribute |
| grep: `isOwner` in `src/ui/screens/ConfigScreen.tsx` | absent — the gate is structural; recorded as caveat 1 |
| grep: `document.addEventListener` / `window.addEventListener` in `src/` | 4 sites, all enumerated and each separately gated — see "Closed — T-02-15" |
| grep: `Number(raw)` in `src/` | absent |
| grep: `bans.length` in `ConfigScreen.tsx`, `app.tsx` | absent (count 0 in both) |
| grep: filter field in `core/model.ts`, `core/actions.ts` | absent |
| grep: retry loop (`while`/`do`) in `core/draw.ts` | absent |
| grep: `content-visibility` / `contain-intrinsic` / virtualization in `src/**` incl. CSS | absent from code; present only in doc blocks explaining the absence |
| grep: ban action in `core/actions.ts` | absent |
| grep: `<button>` inside the `Bans ({n})` disclosure | absent — `TopBar.tsx:209-218` is `<details>`/`<summary>`/`<ul>`/`<li>` only |

### Citations re-located in run 3

`src/app.tsx` changed by 372 lines, so every citation into it was re-read at HEAD rather than
carried forward. No mitigation disappeared in the refactor — **zero regressions**.

| Threat | Old citation | Citation at `132eaec` |
|---|---|---|
| T-02-16 | `app.tsx:778` | `app.tsx:790-794` (re-read), `:274-276` (boot probe, unchanged) |
| T-02-24 | `app.tsx:507` | `app.tsx:519`, named in the comment at `:506` |
| T-02-25 | `app.tsx:642`, `:647-664` | `app.tsx:654`, `:659-676`; `TopBar.tsx:98,146,152,164` unchanged |
| T-02-26 | `app.tsx:539-555`, `:986-990` | `app.tsx:551-585`, `:1039-1043` |
| T-02-32 | `app.tsx:588-591` | `app.tsx:600-602`, consumed at `:1020` |
| T-02-09 | `persistence.ts:161`, `store.ts:347` | unchanged, both re-read |
| T-02-17 | `ConfigScreen.tsx:513`, `:685` | unchanged — the file's only diff is a comment at `:963-971` |
| T-02-19 | `ConfigScreen.tsx:518-523` | unchanged |
| T-02-20 | `ConfigScreen.tsx:354-357`, `:479-482` | unchanged (`:355`, `:480`); `NumericField.tsx:52-60` unchanged |
| T-02-35 | `TopBar.tsx:209-218` | unchanged — the file's only diff is a comment reflow at `:134` |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log — 13 entries
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** granted, 2026-08-14 at `132eaec`. 42 of 42 closed, no unregistered flags, no
regressions in the refactor. `block_on: [critical, high]` is satisfied.

Two things travel with this approval rather than blocking it:

1. **The containment test is load-bearing security infrastructure.** `handleStart` is not
   ownership-aware, so `app.tsx:949` is the entire gate. `tests/ui/read-only-shell.test.tsx`
   is what stops a future refactor reopening T-02-15 silently. Do not weaken it, and do not
   let the `[inert]` count assertion be dropped.
2. **Step 3 of the human-verify checkpoint is now the only proof that `inert` blocks the
   click.** happy-dom implements neither its focus nor its pointer semantics, which the test
   file states outright. Run that step in a real browser before the phase is called done.
