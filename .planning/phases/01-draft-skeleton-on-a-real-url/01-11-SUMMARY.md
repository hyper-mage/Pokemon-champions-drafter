---
phase: 01-draft-skeleton-on-a-real-url
plan: 11
subsystem: infra
tags: [service-worker, offline, precache, cache-versioning, github-pages, phase-closeout]
requires:
  - dist/ (the full Vite build — the manifest is generated from actual output, never hardcoded)
  - public/data/roster.mb.json, roster.ma.json, roster.index.json, sprite-meta.json (precached inventory)
  - public/sprites/*.png (312 files — the bulk of the precache)
  - vite.config.ts (base '/Pokemon-champions-drafter/' — the worker's scope and every manifest URL)
  - .github/workflows/deploy.yml (the build step the manifest injection hangs off)
provides:
  - public/sw.js (cache-first worker, three listeners, 75 lines, no lifecycle overrides)
  - scripts/build-sw-manifest.mjs (post-build manifest + content-derived cache version injection)
  - src/main.tsx (PROD-only registration, BASE_URL scope, updateViaCache 'none')
  - tests/build/sw-behaviour.test.ts (every handler branch)
  - tests/build/sw-manifest.test.ts (all four build tripwires + the content-hash property)
  - docs/offline-verification.md (the phase's browser-only verification record)
  - CLAUDE.md ## Conventions and ## Architecture (populated from placeholders)
affects:
  - every future phase (CLAUDE.md is now the conventions reference)
  - any phase adding a file under public/ (it lands in the precache automatically)
  - Phase 2 (inherits the deferred section E deploy-freshness check as carried debt)
tech-stack:
  added: []
  patterns:
    - "The cache version hashes file CONTENT plus path, never the URL list alone — public/ filenames are stable forever"
    - "Build tripwires fail the deploy rather than shipping a worker that believes it is offline-complete"
    - "The precache is the whole inventory: no runtime cache population, so a miss is a visible manifest bug"
    - "Tokens ship raw in source so an un-injected worker throws rather than half-working"
    - "Browser-only verification is recorded in a checked-in document naming who observed what, and when"
key-files:
  created:
    - public/sw.js
    - scripts/build-sw-manifest.mjs
    - tests/build/sw-behaviour.test.ts
    - tests/build/sw-manifest.test.ts
    - docs/offline-verification.md
  modified:
    - src/main.tsx
    - package.json
    - .github/workflows/deploy.yml
    - CLAUDE.md
decisions:
  - "The cache version hashes every file's content, not the sorted URL list — a URL-list hash would leave a regenerated roster serving stale bytes to returning visitors with no recovery path"
  - "sw.js is excluded from its own precache and registered with updateViaCache 'none', so a bad worker can never become permanent"
  - "The fetch handler matches the cache by NAME, not via caches.match, so a waiting worker's freshly populated cache cannot answer for the running one"
  - "Sourcemaps are excluded from the manifest: devtools-only, and every extra URL widens the all-or-nothing addAll failure surface"
  - "Section E (deploy freshness) is deferred to Phase 2 rather than manufactured with a throwaway commit — it is recorded as carried debt, not a closed item"
requirements-completed: [SHEL-03, ROST-02]
metrics:
  duration: ~12 min agent time (2026-08-05), plus a human verification session (2026-08-06)
  completed: 2026-08-06
  tasks: 3
  commits: 3
  tests-added: 25
  tests-total: 363
  bundle: 52.86 kB / 19.23 kB gzip
---

# Phase 1 Plan 11: Offline by Construction and the Phase Close-Out Summary

**A hand-written 75-line cache-first service worker precaches all 322 build URLs behind a
content-derived cache version, and the phase's browser-only verification chores are
discharged in writing against the deployed build.**

## Performance

- **Duration:** ~12 min agent time across two dispatches, plus a human verification session
- **Started:** 2026-08-05 (Task 1)
- **Completed:** 2026-08-06 (checkpoint resolved)
- **Tasks:** 3
- **Files modified:** 9

## Task Commits

1. **Task 1: Cache-first service worker with a build-time precache manifest** — `4417908` (feat)
2. **Task 2: Write down the conventions this phase established** — `ed2dd76` (docs)
3. **Task 3: Phase close-out verification record (scaffold)** — `872cdc2` (docs)

Task 3 was a `checkpoint:human-verify` gate. The executor scaffolded the document and
halted. The observations were filled in afterwards by the orchestrator from the project
author's report: `09cd215` (sections A–D results, SHEL-03 and ROST-02 marked Complete) and
`1302df6` (section E deferral recorded as carried debt). Those two commits are not this
executor's work and are listed for traceability only.

## What Shipped

**`public/sw.js` — 75 lines, three listeners, no build-tool involvement.** `install` opens
`champions-drafter-<version>` and `addAll`s the entire manifest, so the worker does not
activate until every asset is cached (D-16). `activate` deletes every `champions-drafter-`
cache that is not the current one, scoped to that prefix so it never touches a cache this
app did not create. `fetch` is cache-first for same-origin GET only, with no runtime cache
population. `skipWaiting` and `clients.claim` are both deliberately absent (D-15) and the
verify gate greps for them.

**`scripts/build-sw-manifest.mjs` — runs as the last step of `npm run build`.** It walks the
real `dist/`, converts each path to a URL rooted at the Vite base, always includes the bare
directory URL as its own cache key, and substitutes both tokens. Wiring it inside
`npm run build` rather than as a separate workflow step means the local gate and CI cannot
disagree about what a build produces.

**Registration in `src/main.tsx`.** Guarded by `import.meta.env.PROD` (the shipped
`public/sw.js` carries raw tokens and would throw under the dev server), fired on `load` so
first paint never competes with ~322 cache writes, scoped explicitly to
`import.meta.env.BASE_URL` (T-01-11 — a root-scoped worker on a Pages *project* site would
control every other project on the origin), and failing soft: a refused registration warns
and leaves a working online app.

**25 tests** across `tests/build/sw-behaviour.test.ts` (every handler branch) and
`tests/build/sw-manifest.test.ts` (all four tripwires plus the content-hash property).

**`CLAUDE.md`.** The `## Conventions` and `## Architecture` placeholders are replaced with
what the repository actually is, including both deviations from
`.planning/research/ARCHITECTURE.md` that are still on disk and would otherwise mislead:
`public/data/` over a root `data/`, and individual PokeAPI PNGs over the Showdown
spritesheet.

**Actual precache:** 322 URLs — 312 sprites, 6 data files, 2 hashed assets, `index.html`,
and the bare directory URL. 903.7 kB. The plan's interface note estimated ~310; 322 is the
measured figure.

## Verification observed on hardware — by the project author, not by this agent

**This executor did not open a browser and does not claim to have.** Everything in this
section was observed by the project author on **Firefox**, on 2026-08-06, against the
deployed build with cache **`champions-drafter-45336e7842a1`**. The full record with
verbatim output is `docs/offline-verification.md`.

| Section | Result | What the author reported |
| ------- | ------ | ------------------------ |
| **A. Offline** | **PASSED** | A service worker was present and live. With the network off, the app reloaded, a full 12-pick draft ran, and the entire pool was scrolled with **zero broken images**. This is what SHEL-03 and ROST-02 rest on. |
| **B. Undo and persistence** | **PASSED** | Undo works by button and by Ctrl+Z. JSON download and import both work, and import correctly distinguishes the two states — importing directly into an empty tournament, and asking for confirmation before replacing one in progress. |
| **C. Export** | **PASSED** | Exported teams imported into both play.pokemonshowdown.com and pokebase.app with no problems. |
| **D. The `file://` chore** | **PASSED as a documentation chore** | The failure is the expected outcome, per D-17/D-18. Verbatim Firefox console output is recorded in the document. |
| **E. Deploy freshness** | **DEFERRED to Phase 2** | Requires a *second* deploy to exist. Explicit user decision. See below. |

## Two limits on that evidence, stated plainly

**1. The 322-entry cache count was never counted.** Firefox's Cache Storage panel shows no
total. The cache existed and offline demonstrably worked, which is what SHEL-03 and ROST-02
actually require — but the exact entry count rests on `tests/build/sw-manifest.test.ts`
against the generated manifest, not on observation. Task 3's acceptance criterion asked
section A to record "the cached entry count"; that specific sub-clause is **not satisfied by
observation**. The document carries a console snippet for anyone who wants to close it.

**2. The JSON round trip ran on one machine, not two.** PERS-05's wording mentions moving to
another machine. The file is the transport either way and nothing in the code path is
machine-dependent, but the cross-machine leg is unexercised.

## Section E — deferred, and this is carried debt

Section E tests whether a *second* deploy safely supersedes the first, so it cannot run
until another deploy exists. Rather than manufacture one with a throwaway commit, it rides
the first real Phase 2 deploy. **This is not a closed item.**

The failure mode it guards against is the characteristic one for cache-first workers: they
fail on the *second* deploy, not the first. A returning visitor pinned to a stale cache with
no recovery path — which for this app means drafting against last regulation's roster, and
Champions regulations rotate roughly every 2.5 months. The mitigations are built and
unit-tested (content-derived cache version, old caches deleted in `activate`, `sw.js`
neither precached nor served from the HTTP cache), but **none of it has been observed on
hardware**. Run section E before Phase 2 ships anything a host would rely on.

## What the `file://` output actually proved

Stronger than the prediction. The console output confirmed **both** predicted causes
independently:

1. Paths resolved to `file:///Pokemon-champions-drafter/assets/…` — against the **filesystem
   root**, because the Vite base is absolute.
2. `Module source URI is not allowed in this document` — the null-origin CORS block, which
   fires even for a path that resolves.

A relative base would fix only the first. So D-17/D-18's expectation that `file://` does not
work is **correct and current**, not a stale assumption inherited from the reference project.
Nothing should be contorted to chase it. The D-17 hedge holds separately:
`dist/data/roster.mb.js` is a classic script, is not CORS-checked, and assigns
`globalThis.__CHAMPIONS_ROSTER__` with all 235 M-B entries.

## Deviations from Plan

### 1. [Rule 1 — Bug] The cache version hashes file content, not the URL list

- **Found during:** Task 1, writing `scripts/build-sw-manifest.mjs`.
- **Issue:** The plan said to "derive the version from a content hash over the sorted
  manifest". Read literally, that hashes the sorted **URL list** — and that is broken.
  Vite content-hashes the filenames of things it builds, but everything under `public/`
  keeps a stable filename forever. A regenerated `roster.mb.json` or a redrawn sprite would
  leave the URL list byte-identical, the version unchanged, and the cache name unchanged.
  Returning visitors would be served the old bytes indefinitely, with no recovery path.
  Since the roster is the product, that means drafting against a superseded regulation.
- **Fix:** The hash covers each file's path **and** the SHA-256 of its contents, over the
  sorted file set. An unchanged build still yields an unchanged version, which is what the
  plan's stated intent required; a changed *file* now always changes it.
- **Files:** `scripts/build-sw-manifest.mjs`
- **Verification:** `tests/build/sw-manifest.test.ts` pins the property directly — same
  URLs, different bytes, different version.
- **Committed in:** `4417908`

### 2. [Rule 2 — Missing critical] `updateViaCache: 'none'` on registration

- **Issue:** GitHub Pages serves `Cache-Control: max-age=600` behind Fastly, which the plan
  itself notes. Without this option the browser may answer the worker's own update check
  from the HTTP cache — the one thing that could keep a redeploy from ever reaching a
  returning visitor, defeating D-15 entirely.
- **Fix:** Registered with `updateViaCache: 'none'`, and `sw.js` is excluded from its own
  precache. A bad worker can therefore never become permanent.
- **Files:** `src/main.tsx`, `scripts/build-sw-manifest.mjs`
- **Committed in:** `4417908`

### 3. [Rule 2 — Missing critical] Match the cache by name, not via `caches.match`

- **Issue:** `caches.match(request)` searches every cache in the origin. During the window
  when a new worker has installed and is waiting, its freshly populated cache could answer a
  request for the *running* worker — producing a mixed-version tab, new HTML against evicted
  assets.
- **Fix:** `caches.open(CACHE_NAME).then(cache => cache.match(...))`. Each worker only ever
  reads its own cache. `ignoreSearch: true` so a navigation with a query string still
  resolves to the shell; no asset in this build is distinguished by its query string.
- **Files:** `public/sw.js`
- **Committed in:** `4417908`

### 4. [Rule 2 — Missing critical] Two guards the plan did not specify

- **Sourcemaps excluded** (`.map`, alongside the plan's `sw.js` and `.nojekyll`). They are
  devtools-only — the running app never fetches them — and every extra URL widens the
  all-or-nothing `addAll` install failure surface (T-01-48) for something offline play does
  not use.
- **`SAFE_PATH` guard.** A path outside `[A-Za-z0-9._/-]` would need percent-encoding, and
  encoding it here without knowing how the app spells it in an `src` attribute produces a
  cache key that never matches — a silent offline hole. The script fails instead of guessing.
- **A second tripwire.** The plan asked for one (fewer than 300 entries). A second asserts
  `dist/index.html` references the base path, so a moved Vite base fails the build rather
  than shipping a manifest of 322 URLs that all 404.
- **Files:** `scripts/build-sw-manifest.mjs`
- **Committed in:** `4417908`

### 5. [Scope] 25 build tests added

The plan specified acceptance criteria for Task 1 but no test files. `tests/build/` was
added so the handler branches and all four tripwires are pinned rather than re-verified by
hand each build. This is also what makes the content-hash property in deviation 1 an
enforced invariant instead of a comment.

---

**Total deviations:** 4 auto-fixed (1 bug, 3 missing-critical) plus 1 scope addition.
**Impact on plan:** Deviation 1 is the significant one — the plan as literally written would
have shipped a worker that could strand returning visitors on a stale roster, which is the
exact failure section E exists to catch and which is now unit-tested instead of hoped for.
No scope creep.

## Process lesson: the checklist was Chrome-first, and that cost real time

`docs/offline-verification.md` was written assuming Chrome's DevTools. Firefox reports a live
service worker as **`Running`/`Stopped`**, not `activated`, and its Cache Storage panel shows
**no entry-count total**. Both differences cost the verifier real time on the first
run-through, and the second is why limit 1 above exists at all.

**The checklist was the thing that was wrong, not the app.** The document now carries a
browser-terminology note and a console snippet for obtaining the count. Future
human-verify checkpoints should name the browser they were written against, or state the
pass condition in terms the browser actually displays.

## Requirement status

**This plan closes SHEL-03 and ROST-02**, both on the strength of section A.

Phase 1 now stands at **31 of 32 requirements Complete**. The exception is **EXPO-04**,
which remains Pending and is **not claimed here**. Its wording — "imports into
play.pokemonshowdown.com and *passes its team validator*" — is unachievable for a
species-only paste by construction: a six-Pokémon team produces 24 validator problems, four
per Pokémon, all inherent to the format rather than to this implementation. The import half
works and was confirmed in section C. This needs to be raised at phase verification as a
requirement-wording question, not fixed in code.

The five ROADMAP Phase 1 success criteria are individually marked in
`docs/offline-verification.md`: criteria 1, 3 and 4 **MET** with the hardware evidence
above; criteria 2 and 5 **PARTIAL**, each with the automated half named and the observed
half pointed at.

## Known Stubs

None. Every surface in this plan is wired to real build output — the manifest is generated
from `dist/` on every build and the tripwires fail rather than emit a placeholder.

## Threat Flags

None beyond the plan's own `<threat_model>`. The service worker is new privileged
client-side surface, but every entry in the register is addressed: T-01-11 by the explicit
`BASE_URL` scope with no `importScripts` and no dynamic loading, T-01-47 by the
content-derived cache version plus prefix-scoped deletion in `activate`, T-01-49 by the
300-entry tripwire, T-01-50 by same-origin-GET-only with no runtime cache population.
T-01-48 (one failed request aborting the whole install) is accepted, as planned.

## Self-Check: PASSED

All 5 created files verified present on disk: `public/sw.js`,
`scripts/build-sw-manifest.mjs`, `tests/build/sw-behaviour.test.ts`,
`tests/build/sw-manifest.test.ts`, `docs/offline-verification.md`.

All 3 task commits verified in `git log`: `4417908`, `ed2dd76`, `872cdc2`.

Last green `npm run verify`: `check:pure` 0 violations / 11 core files, `check:nohtml` 0 /
38, **363 tests**, build 52.86 kB / 19.23 kB gzip.

No source, test, script, `docs/offline-verification.md`, `CLAUDE.md`, `01-11-PLAN.md`,
`01-UI-SPEC.md`, `STATE.md`, or `ROADMAP.md` edits were made by this dispatch — this
SUMMARY is the only file written. Nothing pushed.

---
*Phase: 01-draft-skeleton-on-a-real-url*
*Completed: 2026-08-06*
