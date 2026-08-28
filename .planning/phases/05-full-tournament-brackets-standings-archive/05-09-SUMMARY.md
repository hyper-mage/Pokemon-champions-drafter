---
phase: 05-full-tournament-brackets-standings-archive
plan: 09
subsystem: persistence
tags: [library, storage, confirm-copy, PERS-08, D-14, D-15, D-16, D-17]
requires:
  - src/core/import-guard.ts (isValidTournament)
  - src/core/migrate.ts (migrate)
  - src/adapters/clock.ts (now)
provides:
  - LIBRARY_CAP
  - listLibrary
  - oldestEntry
  - fileTournament
  - openLibraryEntry
  - LibraryEntry
  - FileOutcome
  - FILING_CONFIRM
  - EVICTION_CONFIRM
  - REOPEN_CONFIRM
  - tournaments
affects:
  - 05-12 (landing-screen library list and the filing gestures)
  - 05-13 (reopen surface)
tech-stack:
  added: []
  patterns:
    - "own key, own module, everything fails soft (view-prefs.ts's shape)"
    - "per-entry validation with a per-entry drop, not an all-or-nothing read"
    - "cap enforced before the write, never discovered by catching a quota error"
key-files:
  created:
    - src/adapters/library.ts
    - tests/adapters/library.test.ts
  modified:
    - src/ui/confirm-copy.ts
    - tests/ui/confirm-dialogs.test.tsx
decisions:
  - "The library is a NEW adapter with its own key; persistence.ts is modified nowhere in Phase 5"
  - "LIBRARY_CAP = 12, with all three of 05-UI-SPEC's defences recorded in its doc block"
  - "All three new confirm sets are default toned; the destructive reservation stays at three"
metrics:
  duration: ~25 min
  completed: 2026-08-27
---

# Phase 5 Plan 09: The Tournament Library and Its Confirm Copy Summary

A capped 12-entry tournament library on its own `localStorage` key, where one corrupt entry
costs exactly one entry, plus the four confirm sets this phase's dialogs consume.

## The Ruling This Plan Owed

`05-UI-SPEC.md` §Pure-core boundary item 4 said the library's storage was
`src/adapters/persistence.ts`. `05-RESEARCH.md` §The Library, written a day later, said a new
`src/adapters/library.ts` with its own key. **RESEARCH governs mechanism; UI-SPEC governs copy,
layout and tokens** — so the UI-SPEC line is read as a *layer* statement (adapter work, not core
work) rather than as a filename.

**Ruled: a new module with its own key.** The ruling and RESEARCH's four reasons are written into
the `library.ts` module header, not left in a planning document:

1. **No migration at all** — an older install simply has no library key, yielding an empty library,
   which §12 already specifies renders nothing.
2. **`generation` is untouched** — `loadIfNewer` compares it to stop a promoted read-only tab
   clobbering the owner's picks. Reshaping `PersistedRecord` would put that check inside a
   restructure for zero benefit.
3. **Two version surfaces stay independent** — the document's `schemaVersion` (5) and the wrapper's
   own (1).
4. **`tab-lock.ts` uses `BroadcastChannel`, not the `storage` event** — verified by reading it, not
   assumed — so a new key produces no cross-tab side effects.

**Proven, not asserted:** `git diff --stat src/adapters/persistence.ts`, `src/core/`, and
`package.json` are each empty at completion.

## What Was Built

**`src/adapters/library.ts`** — key `champions-drafter:library`, wrapper version 1, and:

- `LIBRARY_CAP = 12`, with all three 05-UI-SPEC defences quoted into its doc block rather than
  recomputed: the measured 21,572-character worst case projecting to ~65 KB and a 1.04 MB total
  against a conservative 5 MB (21% used); the regulation-rotation argument (a fortnightly group
  fills 12 slots in about two and a half regulations, so the first eviction fires on a night at
  least two regulations old); and the landing screen's 1,212px-against-670px height budget.
- `listLibrary()` — newest first, never throws. **A bad entry is dropped, not fatal**, which is the
  one deliberate departure from `view-prefs.ts`'s all-or-nothing posture. Each `entry.doc` goes
  through the same `isValidTournament` + `migrate` pair `persistence.load` uses, with a comment
  saying it is that pair rather than a second validator. Wrapper-level failures remain total,
  because there is nothing to salvage.
- `oldestEntry()` — `null` below the cap, the lowest-`filedAt` entry at it, so the host is told
  which night is at stake while it still exists.
- `fileTournament(doc)` — the cap check precedes the write; returns `filed`, `evicted` naming the
  dropped entry, or `quotaFailed`. Writes only the library, naming 05-12 as the owner of the
  library-then-live ordering so the sequence is decided in one place.
- `openLibraryEntry(id)` — routed through `listLibrary`, so a droppable entry yields `null` rather
  than a partially rebuilt document.

**`src/ui/confirm-copy.ts`** — the `tournaments` plural helper, `FILING_CONFIRM`,
`EVICTION_CONFIRM` (with its fifth string, `downloadLabel`), `REOPEN_CONFIRM`, and
`ABANDON_CONFIRM`'s changed body. The eviction body interpolates `LIBRARY_CAP`; the literal
`12` appears nowhere in the file.

## Decisions Made

**A quota failure is not `savingBlocked`.** The word does not appear in `library.ts` at all — not
even in a comment, since the reasoning reads more clearly as "the one banner in the app a host
genuinely must read". A library write that could not fit is a different event with a different next
action: name the file and offer the download.

**All three new sets are `default` toned.** The destructive tone means *there is no way back
without a file you may not have downloaded* — exactly three surfaces. Filing loses nothing,
eviction names and offers the file first, and a reopen is itself undoable. The reservation's whole
job is keeping the three irreversible surfaces legible as a category.

**`ABANDON_CONFIRM`'s doc block was corrected, not just its body.** The block claimed the set was
"one of only two of the six that qualify" — stale on both counts before this plan. Since D-15 makes
`Start a new tournament` file rather than discard, abandon is now the *only* discarding path, and
the block now says why the clause was added. This file's own header states that a stale contract
comment is worse than none.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Two stale assertions on the old abandon body**

- **Found during:** Task 2
- **Issue:** `tests/ui/confirm-dialogs.test.tsx:597` and `:626` asserted the pre-Amendment-1 abandon
  body. Amendment 1 mandates the body change, so both assertions failed against correct output.
- **Fix:** Updated both to the new contract string. The rendered copy was already correct; only the
  expectations were stale.
- **Files modified:** `tests/ui/confirm-dialogs.test.tsx`
- **Commit:** `3b2a716`
- **Scope note:** This file is outside the plan's `files_modified` but the breakage is directly
  caused by this task's mandated change, and it is not owned by 05-08 (which holds
  `actions.ts`, `reduce.ts`, `import-guard.ts`, `undo.ts`, `store.ts`).

### Acceptance Criteria Adjusted

**2. [Rule 3 - Blocking] `grep -cE "^function (matches|tournaments)\(" ... returns 2` is unsatisfiable**

Task 2's acceptance criterion assumes both plural helpers are non-exported. `matches` was landed by
plan **05-05** as `export function matches`, with a documented reason: the count is read by the
config screen and the round-robin surface, so a private copy would let two surfaces disagree about
the singular. The plan's own `<behavior>` block, meanwhile, states that `confirm-copy.ts`
**exports** both helpers.

**Behavior governs over the grep's literal prefix.** Both are exported; un-exporting `matches` to
satisfy the regex would regress 05-05's consumers. The criterion's intent — each plural declared
exactly once, nowhere else — is verified instead by:

```
grep -rnE "function (matches|tournaments)\(" src/
  → src/ui/confirm-copy.ts:67, src/ui/confirm-copy.ts:81   (two, both here, none elsewhere)
```

No component declares a private `'1 match'` or `'1 tournament'` literal.

## Base Assertion

**Arrived on a STALE base: `93f20ad`** — the same Phase 3 commit as every prior agent worktree in
this repo. This is the **tenth** occurrence with zero exceptions; the pattern is now fully reliable
and worth treating as the default assumption rather than a hazard to check for.

Reset to `735d7eb` ("docs(phase-05): update tracking after wave 3"). Waves 1–3 then confirmed
present: `SCHEMA_VERSION = 5` in `src/core/model.ts` and `selectTournamentLocked` in
`src/core/tournament.ts`.

## Verification

Full `npm run verify` equivalent, run from the worktree against the main checkout's tooling:

| Gate | Result |
|------|--------|
| `check:pure` | 0 violations in 20 files under `src/core` |
| `check:nohtml` | 0 violations in 78 files under `src` |
| `test` | **2345 passed**, 69 files, 0 failed |
| `typecheck` (both projects) | exit 0 |
| `build` | exit 0 — 160.31 kB JS, 50.18 kB gzipped |

Plan-specific assertions:

| Assertion | Result |
|-----------|--------|
| `git diff --stat src/adapters/persistence.ts` | empty — the ruling, proven |
| `git diff --stat src/core/` | empty |
| `git diff --stat package.json` | empty — two runtime dependencies still |
| `grep -c "export const LIBRARY_CAP = 12"` | 1 |
| `grep -c "champions-drafter:library"` | 1 |
| `grep -c "STORAGE_KEY" src/adapters/library.ts` | 0 |
| `grep -c "savingBlocked" src/adapters/library.ts` | 0 |
| `grep -cE "new Set\|new Map\|new Date"` | 0 |
| added `'danger'` lines in `confirm-copy.ts` | 0 |
| abandon heading/label lines in diff | 0 — only the body moved |
| literal `keeps 12 tournaments` | 0 |

## Threat Mitigations Applied

| Threat ID | Mitigation |
|-----------|------------|
| T-05-44 | Every `entry.doc` through `isValidTournament` + `migrate`; wrapper rebuilt field by field. Tested with `__proto__` as an own property. |
| T-05-45 | Per-entry drop, asserted by a test seeding one invalid and eleven valid entries → eleven returned. |
| T-05-46 | Cap check precedes the write; a test inspects the payload handed to `setItem` and asserts it is already at `LIBRARY_CAP`. |
| T-05-47 | Module writes only the library; a test asserts the live tournament key is never touched. |
| T-05-48 | `persistence.ts` byte-identical; `tab-lock.ts`'s `BroadcastChannel` use verified by reading. |
| T-05-49 | `quotaFailed` is its own outcome; a test asserts `savingBlocked.value` stays `false`. |
| T-05-50 | Eviction body interpolates `LIBRARY_CAP`; a test asserts the rendered body carries the constant's value. |

## Known Stubs

None. Every exported function is fully wired; the surfaces that consume them are 05-12's and
05-13's by design.

## TDD Gate Compliance

- **RED** — `2a0e07e` `test(05-09)`: failed with `Cannot find module '../../src/adapters/library'`.
- **GREEN** — `c52078b` `feat(05-09)`, then `3b2a716` `feat(05-09)`.

The test file covers both tasks and was written whole at RED, as the plan directs (Task 2 "adds
assertions to `tests/adapters/library.test.ts`"). The copy block therefore stayed red across
`c52078b` and went green at `3b2a716`; the final tree is fully green.

## Self-Check: PASSED

- `src/adapters/library.ts` — FOUND
- `tests/adapters/library.test.ts` — FOUND
- `src/ui/confirm-copy.ts` — FOUND (modified)
- Commit `2a0e07e` — FOUND
- Commit `c52078b` — FOUND
- Commit `3b2a716` — FOUND
- `STATE.md` / `ROADMAP.md` — untouched, as instructed
