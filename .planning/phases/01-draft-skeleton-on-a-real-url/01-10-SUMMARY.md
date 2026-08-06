---
phase: 01-draft-skeleton-on-a-real-url
plan: 10
subsystem: persistence-and-export
tags: [import-guard, prototype-pollution, file-io, schema-migration, export-panel, checkpoint, accessibility]
requires:
  - src/core/export/paste.ts (toShowdownPaste — reused unchanged)
  - src/core/model.ts (TournamentDoc, SCHEMA_VERSION)
  - src/core/reduce.ts (fold)
  - src/core/selectors.ts (selectTeams, selectIsComplete, selectPickCount)
  - src/adapters/persistence.ts (save/load/generation)
  - src/adapters/tab-lock.ts (ownership transitions)
  - src/ui/components/Dialog.tsx (modal primitive, dismissible flag)
provides:
  - src/core/import-guard.ts (parseTournamentFile, isValidTournament, MAX_IMPORT_BYTES, MAX_LOG_ENTRIES)
  - src/core/migrate.ts (migrate, SUPPORTED_SCHEMA_VERSIONS)
  - src/adapters/file-io.ts (downloadJson, readJsonFile, tournamentFilename)
  - src/ui/components/ImportConfirmDialog.tsx (the phase's one destructive confirmation)
  - src/ui/components/CheckpointPrompt.tsx (PERS-06 milestone mechanism, trigger as a prop)
  - src/ui/components/ExportPanel.tsx (EXPO-06 per-player paste)
  - src/ui/screens/CompletedDraft.tsx
  - src/ui/use-ownership.ts (TAKEOVER_CONFIRMED announcement)
affects:
  - src/app.tsx (import/export wiring, completed-draft swap)
  - src/adapters/persistence.ts (load() now runs the shared guard)
  - src/ui/components/TopBar.tsx (two new controls)
tech-stack:
  added: []
  patterns:
    - "Untrusted input is rebuilt from an allow-list, never merged or cloned"
    - "JSON.parse reviver drops poison keys at the parse boundary, and their presence is itself a rejection"
    - "Discriminated { ok, reason } results across the guard, migrate, and file read — no throws on expected failures"
    - "Milestone prompts take their trigger condition as a prop so later phases reuse the mechanism"
key-files:
  created:
    - src/core/import-guard.ts
    - src/core/migrate.ts
    - src/adapters/file-io.ts
    - src/ui/components/ImportConfirmDialog.tsx
    - src/ui/components/ImportConfirmDialog.css
    - src/ui/components/CheckpointPrompt.tsx
    - src/ui/components/CheckpointPrompt.css
    - src/ui/components/ExportPanel.tsx
    - src/ui/components/ExportPanel.css
    - src/ui/screens/CompletedDraft.tsx
    - tests/core/import-guard.test.ts
    - tests/core/migrate.test.ts
    - tests/ui/import-export-controls.test.tsx
    - tests/ui/completed-draft.test.tsx
  modified:
    - src/app.tsx
    - src/adapters/persistence.ts
    - src/ui/components/TopBar.tsx
    - src/ui/components/TopBar.css
    - src/ui/use-ownership.ts
decisions:
  - "seq is required strictly increasing from zero, NOT contiguous — contiguity would make the app refuse files it writes itself once Phase 2 removes from mid-log"
  - "A poison key is a rejection, not something to strip — sanitising would hide a tampered file from the host"
  - "Unknown action types keep their envelope and lose their payload, preserving sync rule 11 without copying attacker-shaped structure into state"
  - "Copy and import announcements name the player/outcome rather than repeating a bare label, because the live region announces changes and a repeated string is silent"
  - "The import confirm dialog renders outside the inert draft region — inside it, a read-only tab would get a modal nobody could dismiss"
requirements: [PERS-04, PERS-05, PERS-06, PERS-07, EXPO-06]
metrics:
  duration: ~35 min
  completed: 2026-08-05
  tasks: 3
  commits: 3
  tests-added: 81
  tests-total: 338
  bundle: 52.57 kB / 19.11 kB gzip
---

# Phase 1 Plan 10: JSON Durability and the Completed Draft Summary

The tournament can now leave the browser as a file and come back on another machine, an
untrusted file is refused rather than half-loaded, and finishing a draft offers a
checkpoint plus one selectable paste per player.

## What Shipped

**The guard (`src/core/import-guard.ts`).** The one untrusted-input boundary in the app,
hand-rolled to keep the runtime dependency count at two. Four defences in order: a 5 MB
size gate applied *before* `JSON.parse`; a reviver that drops `__proto__`, `constructor`
and `prototype` at the parse boundary; a document rebuilt field by field from named
properties, with nothing merged, spread or cloned; and bounds — 20000 log entries max,
every entry typed, `seq` strictly increasing from zero. It returns
`{ ok: true, doc }` or `{ ok: false, reason }` and never throws on an expected failure.

**Schema handling (`src/core/migrate.ts`).** `SUPPORTED_SCHEMA_VERSIONS` plus `migrate`.
Version 1 is a passthrough by identity; anything higher is `newerSchema`, anything else
`unknownSchema`. It refuses rather than half-reads, and a test pins that
`SUPPORTED_SCHEMA_VERSIONS` contains `SCHEMA_VERSION` so the two constants cannot drift.

**File I/O (`src/adapters/file-io.ts`).** `Blob` + `createObjectURL` + a detached
`<a download>` out; `<input type="file">` + `File.text()` in. `File.size` is checked
*before* the read, so an oversized file is never brought into memory. The File System
Access API is deliberately not built — no Firefox, no Safari, no iOS.

**One guard, two sources.** `persistence.load()` now runs `isValidTournament`, so a
corrupt or hand-edited `localStorage` record gets the same treatment as a hostile file
(T-01-05). The provisional shape check it replaced could not detect poison keys at all.

**The controls.** `Download JSON` and `Import JSON…` in the top bar, both secondary. The
ellipsis is U+2026 and is pinned by a test that reads the last code point — three periods
look identical and would pass any substring assertion. The hidden file input is cleared
*before* the file is handed on, so re-picking a corrected file still fires `change`.

**The one destructive confirmation.** Import over a draft with picks opens
`ImportConfirmDialog`; import into an empty draft proceeds silently. It is the only
`--color-danger` fill in the phase, and Escape maps to `Keep current draft`.

**The completed-draft screen.** `CheckpointPrompt` (non-modal, dismissible, structurally
incapable of auto-downloading) above one `ExportPanel` per player. The copy button sits
above a visible, focusable `<pre>`; `toShowdownPaste` is reused unchanged.

## Deviations from Plan

### 1. [Rule 1 — Bug] `seq` is required strictly increasing, not contiguous

- **Found during:** Task 1, reading `store.ts` against the plan's `<threat_model>`.
- **Issue:** The plan's prose and T-01-44 both asked for `seq` values running
  "0, 1, 2, … with no gaps", justified as "matching the reducer's assumption". The reducer
  makes no such assumption. `store.ts`'s `nextSeq` allocates `max(seq) + 1` rather than
  `log.length` *specifically* so that removing an entry from the middle of the log cannot
  reissue a number already in use — its own comment names Phase 2's interleaved card plays
  and bans as the reason. A contiguity rule would therefore make the tool refuse a file it
  had written itself, the moment undo has anything to step over.
- **Fix:** Required `log[0].seq === 0` and each subsequent `seq` strictly greater than the
  last. This satisfies the plan's own `<behavior>` wording ("strictly increasing from
  zero") and delivers what the reducer actually needs — uniqueness, which is what makes
  `draft/pickUndone`'s targeting unambiguous, and order. A test asserts a gapped log is
  *accepted*, with the reasoning inline so a future reader does not "fix" it back.
- **Files:** `src/core/import-guard.ts`, `tests/core/import-guard.test.ts`
- **Commit:** `4da39d5`

### 2. [Rule 2 — Missing critical functionality] Untrusted `doc.id` reaches a filename

- **Found during:** Task 1.
- **Issue:** `tournamentFilename` embeds `doc.id`. For a tournament this build creates that
  is a UUID, but an *imported* document's id is an arbitrary string from an untrusted file,
  and it was about to be handed to the browser as a filename — path separators, `..`,
  colons, control characters, RTL overrides.
- **Fix:** Reduced to `[a-z0-9]`, truncated to 8, with a fallback when nothing survives.
- **Files:** `src/adapters/file-io.ts`
- **Commit:** `4da39d5`

### 3. [Rule 2 — Missing critical functionality] Poison keys rejected, not stripped

- **Issue:** The plan's action text said the reviver should *drop* the three keys. Dropping
  alone is sanitising: the file loads, minus something the host is never told about.
- **Fix:** The reviver drops the key *and* records that it was present; a recorded key is a
  `wrongShape` rejection. A file this app wrote never contains them, so their presence is
  positive evidence the file is not ours. The structural `hasPoisonKey` check also runs
  inside the allow-list rebuild, which is what protects the `localStorage` path where no
  reviver ran.
- **Files:** `src/core/import-guard.ts`
- **Commit:** `4da39d5`

### 4. [Rule 1 — Bug] `ImportConfirmDialog` moved outside the inert draft region

- **Issue:** The natural placement — inside `.draft-region` next to `TopBar` — would have
  put a focus-trapping modal inside a subtree carrying `inert` whenever the tab is
  read-only. That renders a dialog nobody can dismiss.
- **Fix:** Rendered at app-shell level, outside the region. Noted inline.
- **Files:** `src/app.tsx`
- **Commit:** `e7e2ab9`

### 5. [Rule 2] `1 pick`, not `1 picks`

The UI-SPEC writes the confirm body's slot as `{n} picks`. The dialog appears whenever the
draft has at least one pick, so `n = 1` is reachable and renders "— 1 picks —". Pluralised
in `importConfirmBody`, asserted both ways. Heading and both button labels are verbatim.

### 6. [Scope] `CheckpointPrompt.css` added

The plan's file list named `ExportPanel.css` but no stylesheet for the checkpoint panel,
which the UI-SPEC specifies down to `--color-surface` and `--space-4`. Added one, following
the established one-stylesheet-per-component convention.

### 7. [Rule 1 — Bug] Test pollution found by a test

`tests/ui/import-export-controls.test.tsx`'s "stays silent in a tab that was never
read-only" failed on first run, reading the *previous* test's announcement: `announce` is a
module-level signal that outlives any render. Fixed with `announce('')` in `beforeEach`.
Worth recording because it means any future live-region test file needs the same reset.

## Carried-Forward Gap: Closed

The UI-SPEC's `Takeover confirmed (live region)` → `You are now drafting on this tab.` row
was in the contract and nowhere in the source. It is now wired, and **the plan's suggested
placement was right**: it belongs in `src/ui/use-ownership.ts`, not in `ReadOnlyBanner`.

The reason is structural. On a successful takeover `ReadOnlyBanner` returns `null`, so the
banner and the button that was just clicked both leave the DOM in the same commit — the
component cannot fire an effect it no longer has, and focus drops to `<body>` because the
focused element was removed. The hook outlives the transition and is the only observer
still mounted. It fires on the *transition* (read-only → writable) via a ref, so a tab that
was always the owner stays silent; both halves are asserted.

## Threat Flags

None. No new network endpoints, auth paths, or trust boundaries beyond the two the plan's
threat model already names (imported file, `localStorage` record), and both now run the
same guard.

## Known Stubs

None. Every surface in this plan is wired to real data.

`PasteSlot.megaStone` is never set, which is correct rather than stubbed: Phase 1 has no
Mega rounds and no X-versus-Y stone selection, so a Mega-typed slot cannot exist. The
plumbing is present and fixture-tested in `paste.ts` for Phase 3.

## UI-SPEC Amendments Needed (not applied — 01-08 owns the file)

Three live-region strings exist in the source with no row in the copywriting table. The
orchestrator should add them centrally:

| Where | String |
|-------|--------|
| Import succeeded (live region) | `Tournament imported — {n} picks restored.` (`no picks yet` at 0, `1 pick restored` at 1) |
| Export copy succeeded (live region) | `{playerName} team paste copied.` |
| Export copy failed (live region) | `{playerName} team paste not copied — select the text below.` |

The two copy strings deliberately differ from the button labels. `LiveRegion`'s own
docstring records that announcing byte-identical text twice is silent the second time, and
notes this was left unfixed because "no surface in this phase repeats a message". This
screen repeats one: the host copies each team in turn, so a bare `Copied` would be spoken
for the first player and silently swallowed for every player after. Naming the player is
what keeps the announcement audible. If the orchestrator prefers the bare labels instead,
`LiveRegion` needs the two-frame clear its docstring describes first.

## Verification

- `npm run verify` — green. `check:pure` 0 violations / 11 core files, `check:nohtml`
  0 / 35, **338 tests** (up from 257), build 52.57 kB / 19.11 kB gzip.
- Round trip asserted on folded state, not raw JSON: export → re-import →
  `fold(imported)` deep-equals `fold(original)`, plus a second trip without drift.
- `__proto__`, `constructor` and `prototype` covered at top level, inside `rng`, inside a
  player, and inside a log entry. `({}).polluted === undefined` is checked against an
  object built *after* the parse.
- `Kommo-o`, `Mr. Rime` and `Farfetch’d` (U+2019 verified by code point, not by eye)
  survive both the JSON round trip and the rendered paste.
- The blank-line separator is asserted by exact string equality on rendered `textContent`.
- The clipboard failure path is driven for real, twice: a rejecting `writeText`, and
  `navigator.clipboard` absent entirely. The text remains present and focusable in both.

### A note on the tests that were wrong first

Two assertions in `import-guard.test.ts` passed vacuously when first written, because
`object.__proto__ = value` invokes the inherited setter — it changes the prototype and
creates no own property, so `JSON.stringify` emitted nothing and the "hostile" document was
perfectly clean. They were rewritten to inject a literal `"__proto__"` key into the
serialized text, which is what a real hostile file contains, and one of them now asserts
the tamper is present in the text before asserting the refusal.

## Self-Check: PASSED

All 14 created files verified present on disk; all 3 commits verified in `git log`.
No edits to `docs/export-verification.md`, `01-UI-SPEC.md`, `01-08-SUMMARY.md`,
`src/core/export/paste.ts`, `STATE.md`, or `ROADMAP.md`. Nothing pushed.
