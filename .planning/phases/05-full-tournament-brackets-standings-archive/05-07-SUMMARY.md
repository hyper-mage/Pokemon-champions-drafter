---
phase: 05-full-tournament-brackets-standings-archive
plan: 07
subsystem: roster-refresh-and-staleness-surfaces
tags: [ui, roster, refresh, staleness, d-23, d-24, d-25, d-26, refr-01, refr-02, refr-03]
requires:
  - src/adapters/roster-source.ts (05-04 — refreshRoster, readRosterFile, resolveSnapshot, loadRoster)
  - src/core/roster/staleness.ts (05-02 — isSnapshotStale)
  - src/adapters/clock.ts (05-02 — todayIso)
  - public/sw.js (05-02 — ?refresh=1 cache bypass)
provides:
  - src/ui/components/RosterRefresh.tsx (REFR-01 + REFR-02 controls, five result sentences)
  - src/ui/components/StalenessBanner.tsx (REFR-03, two screen variants)
  - two-snapshot resolution in src/app.tsx (D-24)
  - rosterDriftNotice unresolvable form naming Import roster JSON… as the recovery
affects:
  - src/ui/screens/ConfigScreen.tsx
  - src/ui/screens/LandingScreen.tsx
  - src/app.tsx
  - src/adapters/roster-source.ts
tech-stack:
  added: []
  patterns:
    - surface-owned role="status" region, never doubled through announce
    - hidden (not visually-hidden) file input, value cleared before the file is handed on
    - clock stamped at the edge, pure comparison in core
    - focus intent carried on the route rather than in a sibling flag
key-files:
  created:
    - src/ui/components/StalenessBanner.tsx
    - src/ui/components/StalenessBanner.css
    - tests/ui/staleness-banner.test.tsx
    - src/ui/components/RosterRefresh.tsx
    - src/ui/components/RosterRefresh.css
    - tests/ui/roster-refresh.test.tsx
  modified:
    - src/app.tsx
    - src/ui/screens/ConfigScreen.tsx
    - src/ui/screens/ConfigScreen.css
    - src/ui/screens/LandingScreen.tsx
    - src/adapters/roster-source.ts
decisions:
  - D-23 satisfied by mounting the Roster group first on the config form, above the banner's own reference to it
  - D-26 satisfied by routing: the landing banner navigates and focuses, and imports no adapter that could refresh in place
  - The unresolvable-roster case reuses rosterDriftNotice as a third form rather than a fourth surface
  - loadRoster matches the manifest label as well as the id, because a document only ever carries the label
metrics:
  tasks: 3
  commits: 3
  tests_added: 23
  suite: 2271 passing
  completed: 2026-08-27
---

# Phase 5 Plan 07: Roster Refresh and the Staleness Banner Summary

A host can fetch a newer regulation from inside the app or load one from a file with no
network, is warned on both screens where a night gets started when the snapshot has
expired, and a filed night now opens against the roster it was played on rather than
against whatever the build's default has become.

## Base and Recovery

Arrived on a **stale base**, exactly as MEMORY predicted: `git merge-base HEAD 98847b4`
answered `93f20ad7de20976de91742d02463214f31974db1` — the Phase 3 commit every worktree in
this repo has forked from so far. Reset to `98847b4` before reading a single file, then
fast-forwarded `worktree-agent-a30c1e47fc7bc5711` to recover the killed predecessor's work.

Waves 1–2 were then confirmed present on disk (`searchParams.has('refresh')` in
`public/sw.js`, `isSnapshotStale` in `src/core/roster/staleness.ts`, `refreshRoster` in
`src/adapters/roster-source.ts`) before anything was written.

The predecessor had landed **more than its last message suggested**: `f7e0c28` contains the
whole of Task 1 — component, stylesheet, the `ConfigScreen` mount, the `ConfigScreen.css`
placement note it died narrating, and 16 passing tests. It was verified rather than
rewritten (`vitest run tests/ui/roster-refresh.test.tsx` → 16 passed) and work resumed at
Task 2.

## What Was Built

### Task 1 — `RosterRefresh` (recovered, `f7e0c28`)

REFR-01's check control and REFR-02's file import in one group on the config screen, with a
five-state result region. Verified, not re-executed.

### Task 2 — `StalenessBanner` (`3b0c75a`)

A new component in `ReadOnlyBanner`'s shape and deliberately not a variant of it — the
contract's reason ("making one banner mean three different things is how a sentence stops
being trusted") is quoted in its doc block so nobody merges them later.

Two sentences, byte-for-byte from the copy table, selected by a `variant` prop rather than
supplied through a `text` prop, because the strings are the contract. The config variant
renders **no button even when handed a handler** — the variant decides, not the props — and
the landing variant offers `Update the roster`, which navigates and moves focus to `Check
for a new roster`. `StalenessBanner.tsx` imports no adapter that could refresh in place.

Mounted on exactly two screens. `05-UI-SPEC` §3's reasoning is written into a comment at
each mount site, and the negative is asserted structurally: `BanStageScreen.tsx`,
`CompletedDraft.tsx` and `src/app.tsx` are each read from disk and checked to contain no
`StalenessBanner` — `app.tsx` being the one that proves the draft and card screens are
clear too, since the draft screen lives inline there.

The landing banner sits inside the non-blocked branch, so a failed storage canary still
renders `StorageBlocked` and nothing else.

### Task 3 — two snapshots at once (`a22c5b4`)

`src/app.tsx` now holds the default roster and the open document's roster simultaneously
(D-24). A new `DocumentRoster` union (`none` / `resolving` / `ready` / `unresolvable`)
drives an `activeBundle` that the pool, board and export panels read. `resolveSnapshot` is
consulted first and synchronously, so the ordinary case commits in the same tick and the
pool never flashes empty; `loadRoster(version)` is reached only for a regulation this
session has not resolved.

`unresolvable` deliberately does **not** fall back to the default. Entries go empty and the
existing `rosterDriftNotice` surface carries a third form of its sentence naming `Import
roster JSON…` as the recovery, with `Download JSON` retained. One function, one
`.draft-notice`, three forms — asked in the order that matters, since `missingFromRoster`
reads 0 when the pool it compares against is empty.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] `loadRoster` could not resolve any regulation a document names**

- **Found during:** Task 3
- **Issue:** `loadRoster` matched the manifest on `candidate.id` only (`mb`, `ma`), but
  `ConfigScreen` stamps `snapshot.regulation` — the **label**, `M-B` / `M-A` — onto
  `config.rosterVersion`. Every document this app has ever written therefore names a
  regulation `loadRoster` cannot find. D-24's central case, a filed M-A night opening on an
  M-B build, was unreachable: it would have rendered the drift notice instead of the roster,
  which is precisely the failure D-24 exists to prevent.
- **Fix:** the manifest lookup now matches `candidate.id === wanted || candidate.label ===
  wanted`. It compares whole published fields and never picks a name apart — deriving `ma`
  from `M-A` would be the name-parsing CLAUDE.md forbids. The registry was already keyed by
  both names for the same reason; this applies the rule one layer out.
- **Files modified:** `src/adapters/roster-source.ts`
- **Commit:** `a22c5b4`
- **Note:** `roster-source.ts` is not in the plan's `files_modified`. It is in
  `src/adapters/`, so the plan's `git diff --stat src/core/` verification still holds empty,
  and `src/core/tournament.ts` was never touched.

**2. [Rule 2 — Missing critical functionality] the landing banner would have been a stub**

- **Found during:** Task 2
- **Issue:** Task 2's `<files>` list omits `src/app.tsx`, but the landing variant needs the
  default snapshot's label and `validUntil` and a route to the config screen. Without shell
  wiring the banner would never have rendered — a `Known Stubs` entry rather than a
  delivered surface.
- **Fix:** `app.tsx`'s `Screen` union gained an optional `focusRoster` on the `config`
  member, so the focus intent rides on the route and cannot leak into the next `New
  tournament`. `LandingScreen` receives the default roster and `onUpdateRoster`.
- **Files modified:** `src/app.tsx` (listed in the plan's own `files_modified`)
- **Commit:** `3b0c75a`

**3. [Rule 2 — Missing critical functionality] the drift notice's advice had to be able to come true**

- **Found during:** Task 3
- **Issue:** the registry is module state in `roster-source.ts`, so adopting a roster cannot
  re-render anything by itself. A host told to import the roster their document names would
  have been told again after doing it.
- **Fix:** a `registryGeneration` counter, bumped by the refresh and import callbacks and
  included in the resolution effect's dependencies.
- **Commit:** `a22c5b4`

### Adjustments

- `StalenessBanner.css`'s header originally spelled `--color-danger` in prose, which the
  plan's `grep -c "color-danger" … returns 0` criterion counts. Reworded to "the destructive
  token" — the rule is unchanged, the check now reads clean.
- One `app.tsx` comment quoted 05-CONTEXT verbatim including `loadRoster()`, which the
  plan's `git diff … grep -cE "^\+.*loadRoster\(\)" returns 0` criterion counts. Paraphrased;
  the reasoning is preserved and the criterion is 0.
- `tests/ui/staleness-banner.test.tsx` reads source files via `resolve(process.cwd(), …)`
  rather than `new URL(path, import.meta.url)`. Under `happy-dom` the global `URL` is the
  DOM's, not Node's, so `readFileSync` does not recognise it and silently reads a path
  ending in `undefined`. Noted in the file.

## Testing

`tests/ui/staleness-banner.test.tsx` — 19 cases: the half-open boundary on M-B's real
committed `2026-09-02`, both sentences asserted with `toBe`, the config variant's absent
button, the routing-plus-focus path composed from the **real** `LandingScreen` and **real**
`ConfigScreen`, `refreshRoster` never called, `New tournament` still pressable, the storage
canary outranking the banner, and the two-mount-site invariant read off disk.

`tests/ui/roster-refresh.test.tsx` — extended from 16 to 20. One case runs against the
**real** adapter with `fetch` stubbed over the committed `public/data/` files, proving
`loadRoster('M-A')` resolves by label and that M-A and M-B stay resolved under all four of
their names with a refresh in between. Three more mount the real `App` over a stubbed
registry and assert an M-A document renders Alpha rows and no Beta rows, that the default
stays resolved beside it, and that an unresolvable `M-Z` renders the notice with **neither**
roster's rows on screen.

`npm run verify` equivalent, all green: `check:pure` (0/20), `check:nohtml` (0/77),
`check:pure:selftest`, `vitest run` — **2271 passing across 68 files** — and `vite build`
plus `build-sw-manifest` (322 URLs, 1021.4 kB precached).

`git diff --stat package.json` empty. `git diff --stat src/core/` empty.

## Known Stubs

None.

The one honest gap, recorded rather than papered over: the unresolvable-roster notice names
`Import roster JSON…` on the setup screen, and there is **no route from an open draft back
to the config screen**. A host in that state must reach config via the landing screen. Adding
that route is a navigation change the plan does not scope and D-26's routing rule would want
a say in — flagged for the phase verifier rather than invented here. The
`registryGeneration` wiring means the notice clears the moment the roster is adopted, so the
recovery is real wherever it is reachable.

## Threat Flags

None. No new network surface, no new auth path, no schema change. `RosterRefresh` contains
no `fetch` (T-05-31), every string renders as an escaped Preact text child with
`check:nohtml` green (T-05-32), and both new surfaces mount inside the existing `inert`
shell gate with no new ownership machinery (T-05-33). T-05-34's recovery is implemented and
tested; T-05-35 stays accepted, with `New tournament` asserted enabled.

## Self-Check: PASSED

Files verified present: `src/ui/components/StalenessBanner.tsx`,
`src/ui/components/StalenessBanner.css`, `tests/ui/staleness-banner.test.tsx`,
`src/ui/components/RosterRefresh.tsx`, `src/ui/components/RosterRefresh.css`,
`tests/ui/roster-refresh.test.tsx`.

Commits verified in `git log`: `f7e0c28` (recovered), `3b0c75a`, `a22c5b4`.
