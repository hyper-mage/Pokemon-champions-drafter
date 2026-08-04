---
phase: 01-draft-skeleton-on-a-real-url
plan: 01
subsystem: infra
tags: [vite, typescript, preact, preact-signals, vitest, github-pages, ci, purity-gate]

requires: []
provides:
  - Buildable Vite + TypeScript + Preact skeleton with exactly two runtime dependencies
  - GitHub Pages sub-path base (/Pokemon-champions-drafter/) baked into the build
  - npm run check:pure — the SHEL-04 pure-core enforcement gate
  - npm run check:pure:selftest — proof the gate catches violations and ignores prose
  - npm run verify — check:pure && test && build, the single green-or-not command
  - Committed package-lock.json so dependency integrity hashes are reviewable
affects: [01-02, 01-03, 01-04, 01-05, 01-06, 01-07, 01-08, 01-09, 01-10, 01-11]

tech-stack:
  added:
    - preact@10.29.8
    - "@preact/signals@2.10.1"
    - vite@8.2.0
    - "@preact/preset-vite@2.10.6"
    - typescript@5.9.3
    - vitest@4.1.10
    - "@types/node@24.13.3"
  patterns:
    - "Pure-core boundary enforced by a parsing CI gate, not a grep"
    - "Exact version pins for both runtime dependencies; no caret, no tilde"
    - "Two tsconfigs (app + node) both typechecked, no project references"
    - "Fixtures prove the gate in both directions rather than trusting it"

key-files:
  created:
    - package.json
    - package-lock.json
    - tsconfig.json
    - tsconfig.node.json
    - vite.config.ts
    - index.html
    - src/main.tsx
    - src/app.tsx
    - src/vite-env.d.ts
    - src/core/README.md
    - public/.nojekyll
    - .gitignore
    - scripts/check-pure-core.mjs
    - scripts/check-pure-core-selftest.mjs
    - scripts/__fixtures__/pure/pure-core-sample.ts
    - scripts/__fixtures__/impure/impure-core-sample.ts
    - tests/check-pure-core.test.ts
  modified: []

key-decisions:
  - "Purity gate is a character-level scanner that blanks comments, strings, templates, and regex literals before matching, so it cannot flag its own documentation"
  - "Template ${...} interpolations survive stripping — a real Date.now() inside one is still reported"
  - "Missing target directory exits 1, not 0, so a typo'd path cannot silently pass the gate"
  - "check:pure:selftest is a Node script, not a shell one-liner, because npm runs scripts through cmd.exe on Windows where '! node ...' negation is unavailable"
  - "build typechecks both tsconfigs; a bare 'tsc --noEmit' would never read tsconfig.node.json and vite.config.ts would go unchecked"
  - "Project references rejected: composite: true conflicts with noEmit: true"
  - "Import ban for the ui layer uses path-segment matching, not substring — 'require' contains the substring 'ui'"

patterns-established:
  - "Pattern: every gate ships with fixtures proving both a true positive and a true negative"
  - "Pattern: npm run verify is the one command that decides green or not green"
  - "Pattern: src/core/ carries a README stating the purity rule so it is discoverable from the file tree"

requirements-completed: [SHEL-04]

duration: 11min
completed: 2026-08-04
---

# Phase 1 Plan 01: Project Scaffold and Pure-Core Gate Summary

**Vite 8 + TypeScript 5.9 + Preact 10 skeleton pinned to exactly two runtime dependencies, building to the GitHub Pages sub-path, plus a parsing (not grepping) pure-core gate proven by pure and impure fixtures.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-08-04T14:17:48Z
- **Completed:** 2026-08-04T14:28:43Z
- **Tasks:** 3
- **Files created:** 17 (plus this summary)

## Accomplishments

- Hand-authored scaffold — no `npm create vite` — so `dependencies` holds exactly
  `preact@10.29.8` and `@preact/signals@2.10.1`, both exact-pinned, and nothing else.
- `vite build` emits asset URLs under `/Pokemon-champions-drafter/`, verified in the
  built `dist/index.html`. A bare `/` base would 404 on the only URL anyone opens.
- `scripts/check-pure-core.mjs` enforces SHEL-04 by parsing rather than grepping. It
  blanks line comments, block comments, string literals, template literal text, and
  regex literals before matching, while keeping template `${...}` interpolations, which
  are real code. Blanking preserves length and newlines, so reported line and column
  numbers point at the original source.
- The gate is proven in both directions by fixtures and a vitest suite, not trusted.
- `npm run verify` (check:pure → test → build) exits 0 from a clean install.

## Task Commits

1. **Task 1: Package legitimacy verification** — `34755f5` (docs)
2. **Task 2: Scaffold the Vite + TypeScript + Preact project** — `350196e` (feat)
3. **Task 3: Build the pure-core CI gate (SHEL-04)** — `981d2c1` (feat)

## Package Legitimacy Verdict (Task 1)

Task 1 was a `gate="blocking-human"` checkpoint that had to clear before `npm install`
ran for the first time. No `RESEARCH.md` Package Legitimacy Audit table exists for this
project, so all seven packages were treated as `[ASSUMED]` under the fallback policy.

**Verdict: APPROVED by the user. No package was flagged as suspicious.**

| Package | Pin | Version exists | Resolved repository | Weekly downloads |
|---|---|---|---|---|
| `preact` | `10.29.8` | yes | `git+https://github.com/preactjs/preact.git` | 28,243,525 |
| `@preact/signals` | `2.10.1` | yes | `https://github.com/preactjs/signals` | 1,831,983 |
| `vite` | `8.2.0` | yes | `git+https://github.com/vitejs/vite.git` | 161,655,606 |
| `@preact/preset-vite` | `2.10.6` | yes | `git+https://github.com/preactjs/preset-vite.git` | 485,935 |
| `typescript` | `~5.9` (5.9.3 latest patch) | yes | `git+https://github.com/microsoft/TypeScript.git` | 260,894,933 |
| `vitest` | unpinned (4.1.10 current) | yes | `git+https://github.com/vitest-dev/vitest.git` | 88,317,116 |
| `pokemon-showdown` | `0.11.11` | yes | `git+https://github.com/smogon/pokemon-showdown.git` | 1,006 |

Every repository URL resolves to the expected canonical GitHub org. No name-similar
substitutions or typosquat candidates were found. After install, `npm ls --depth=0`
confirmed the resolved tree matches the pins exactly, and `npm audit` reported 0
vulnerabilities across 119 packages.

### Honest caveats about how this verification was performed

- **Verification was performed against the npm registry API by the orchestrator, not by
  a human opening npmjs.com page by page.** The plan's `how-to-verify` text asked for the
  latter; what actually happened was a programmatic registry query whose results were
  presented to the user, who approved on that basis. Recorded plainly rather than
  described as a manual page-by-page human audit, because it was not one.
- **`pokemon-showdown` has 1,006 weekly downloads** — three to five orders of magnitude
  below every other package in the table. That is expected for a game server distributed
  primarily as a repository rather than as a library dependency, but it means the download
  signal carries no weight here. Its legitimacy rests entirely on the
  `smogon/pokemon-showdown` repository match. It is a devDependency only, is installed in
  plan 01-03 rather than this one, and is never bundled.
- **`typescript`'s `dist-tags.latest` is `7.0.2`** — the native Go rewrite. This confirms
  the CLAUDE.md research note and is precisely why the plan pins `~5.9`. TypeScript must
  not be floated to `latest` in this project.

## Files Created

| File | What it does |
|---|---|
| `package.json` | Exactly two runtime deps, exact-pinned; scripts for dev/build/test/check:pure/verify |
| `package-lock.json` | Committed so integrity hashes for all 119 packages are reviewable in diff (threat T-01-SC) |
| `tsconfig.json` | Strict app config: ES2022, bundler resolution, preact JSX, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`; covers `src` and `tests` |
| `tsconfig.node.json` | Typechecks `vite.config.ts` under Node types |
| `vite.config.ts` | `base: '/Pokemon-champions-drafter/'`, sourcemaps on, vitest `environment: 'node'` |
| `index.html` | Module script tag to `/src/main.tsx`; no inline styles, no external font link, zero network requests |
| `src/main.tsx` | Mounts `<App />` into `#app`, throws if the mount point is missing |
| `src/app.tsx` | Placeholder `<h1>Champions Draft</h1>` — see Known Stubs |
| `src/vite-env.d.ts` | Standard vite client types reference |
| `src/core/README.md` | States the pure-core rule so it is visible in the file tree |
| `public/.nojekyll` | Stops GitHub Pages running Jekyll and dropping `_`/`.` paths |
| `.gitignore` | node_modules, dist, .vite, coverage, .DS_Store, *.local |
| `scripts/check-pure-core.mjs` | The SHEL-04 gate (~370 lines, zero dependencies) |
| `scripts/check-pure-core-selftest.mjs` | Asserts exit codes and reported tokens for both fixtures |
| `scripts/__fixtures__/pure/pure-core-sample.ts` | Mentions forbidden tokens only in comments, strings, a template, and a regex — must NOT be flagged |
| `scripts/__fixtures__/impure/impure-core-sample.ts` | Real `Date.now()`, `localStorage`, `Math.random()`, and a `${Date.now()}` interpolation — must be flagged |
| `tests/check-pure-core.test.ts` | 4 vitest cases covering both directions plus the missing-directory case |

## Verification Evidence

```
node scripts/check-pure-core.mjs src/core                       → exit 0
node scripts/check-pure-core.mjs scripts/__fixtures__/pure      → exit 0, 0 violations
node scripts/check-pure-core.mjs scripts/__fixtures__/impure    → exit 1, 4 violations
npm run check:pure:selftest                                     → passed
npm run verify                                                  → 4/4 tests, build OK
git status --porcelain                                          → clean, no build output
```

Impure fixture output, showing offsets that map to the original source:

```
scripts/__fixtures__/impure/impure-core-sample.ts:6:10   forbidden: Date.now
scripts/__fixtures__/impure/impure-core-sample.ts:10:10  forbidden: localStorage
scripts/__fixtures__/impure/impure-core-sample.ts:14:10  forbidden: Math.random
scripts/__fixtures__/impure/impure-core-sample.ts:18:22  forbidden: Date.now
```

Line 18 column 22 is the `Date.now()` inside a template `${...}` interpolation — the case
that separates a real scanner from a naive strip-everything-quoted approach.

Import-rule behaviour was verified against a scratch probe file (outside the repo, since
the plan specified no import fixture). All five forbidden specifiers were reported
(`../adapters/clock`, `../ui/components/pool-grid`, `@preact/signals`, `preact`, and a
dynamic `import('../adapters/persistence')`), while `./rules/compile` was allowed and a
comment plus a string literal both mentioning "adapters" and "preact" were correctly
ignored.

Built `dist/index.html` confirms the Pages sub-path:
`<script type="module" crossorigin src="/Pokemon-champions-drafter/assets/index-DBPmdOKW.js">`

## Decisions Made

- **The gate parses, it does not grep.** The plan called this out and it is the single
  most important property of the script. A `grep -c` gate counts its own documentation,
  gets loosened, then gets deleted. The scanner is a character-level state machine over
  code / line comment / block comment / single-quote / double-quote / template / regex
  contexts, with a stack so template interpolations nest correctly.
- **Regex literals are stripped, and detecting them requires disambiguating `/` from
  division.** Done with a lookback over the already-comment-blanked buffer against a
  punctuation set plus a keyword set (`return`, `typeof`, `case`, …). Without this, a
  regex like `/['"]/` would open a phantom string state and corrupt the rest of the file.
- **A missing target directory exits 1, not 0.** Silently passing on a typo'd path is
  precisely the self-invalidating-gate failure mode the plan warns about. Covered by a test.
- **The ui import ban matches path segments, not substrings.** The literal substring `ui`
  appears inside `require`, so a `contains 'ui/'` rule is a latent false positive. The
  `adapters` ban stays a substring check because that string is unambiguous.
- **Ambient-identifier matching is deliberately strict.** A property named `document` or
  `window` inside `src/core` will be flagged. That is the right default for a deny gate —
  rename the property rather than weaken the check. `\b` already prevents `processResults`
  from tripping `process`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added `tests/check-pure-core.test.ts`**
- **Found during:** Task 3
- **Issue:** The plan's verification block requires `npm run verify` to exit 0, and
  `verify` runs `npm run test`. With zero test files, `vitest run` exits 1 with
  "No test files found". The plan as written could not pass its own verification.
- **Fix:** Added a real 4-case vitest suite exercising the gate, rather than papering over
  it with `--passWithNoTests`. That flag would have made `verify`'s test step a permanent
  silent no-op and would have proved nothing about whether the vitest wiring even works —
  which matters in a scaffold plan whose entire job is establishing the toolchain.
- **Files:** `tests/check-pure-core.test.ts`
- **Verification:** `npm run verify` → 4 passed, build OK
- **Committed in:** `981d2c1`

**2. [Rule 3 - Blocking] `check:pure:selftest` implemented as a Node script**
- **Found during:** Task 3
- **Issue:** The plan asked for an npm script "asserting the expected exit codes". On
  Windows, npm runs scripts through `cmd.exe`, where the POSIX `! node ...` exit-code
  negation is unavailable. A shell one-liner would fail on the author's own machine.
- **Fix:** `scripts/check-pure-core-selftest.mjs` spawns the checker three times and
  asserts exit codes and reported tokens. Portable, and runnable in CI without vitest.
- **Files:** `scripts/check-pure-core-selftest.mjs`, `package.json`
- **Verification:** `npm run check:pure:selftest` → passed
- **Committed in:** `350196e` (script wiring), `981d2c1` (script body)

**3. [Rule 2 - Missing Critical] `build` typechecks both tsconfigs**
- **Found during:** Task 2
- **Issue:** The plan specified `build: "tsc --noEmit && vite build"` and separately
  mandated a `tsconfig.node.json` for `vite.config.ts`. A bare `tsc --noEmit` reads only
  `tsconfig.json`, so `vite.config.ts` would have been created, mandated, and then never
  typechecked by anything.
- **Fix:** Added a `typecheck` script running `tsc --noEmit` against each config in turn;
  `build` calls it. TypeScript project references were considered and rejected because
  `composite: true` implies `declaration: true`, which conflicts with `noEmit: true`.
- **Files:** `package.json`, `tsconfig.node.json`
- **Verification:** `npm run build` → both tsc passes clean, vite build OK
- **Committed in:** `350196e`

**4. [Plan-internal inconsistency resolved] Fixture paths**
- The plan's `files_modified` frontmatter lists flat paths
  (`scripts/__fixtures__/pure-core-sample.ts`), but Task 3's `<action>` and its acceptance
  criteria both mandate the `pure/` and `impure/` subdirectories — necessary, since the
  checker takes a directory and the two fixtures must be separable. Followed the action
  text and the acceptance criteria; the frontmatter list was stale.

**5. [Sequencing note, not a behaviour change] `package.json` wired in Task 2**
- The plan lists `package.json` under Task 3's files because that is where `check:pure`
  gets wired. All npm scripts were authored up front, so the wiring landed in `350196e`
  (Task 2) and Task 3's commit touches no `package.json`. Both scripts exist and both run;
  only the commit boundary differs from the plan's expectation.

---

**Total deviations:** 3 auto-fixed (2 missing-critical, 1 blocking) + 2 recorded notes
**Impact on plan:** All three auto-fixes were required for the plan's own stated
verification to be satisfiable. No scope creep — no feature was added beyond what the
acceptance criteria demand.

## Known Stubs

| File | Line | Stub | Why it is intentional |
|---|---|---|---|
| `src/app.tsx` | 2-4 | Renders only `<h1>Champions Draft</h1>` | Explicitly specified by the plan: "This is deliberately empty — plan 05 replaces it with the real shell." |
| `src/core/` | — | Contains only `README.md`; no `.ts` files | The core fills up in plan 01-06. `check:pure` therefore currently reports "no .ts or .tsx files under src/core yet; nothing to check". |

**Honest caveat on SHEL-04:** the gate mechanism is built, wired into `npm run verify`,
and proven against fixtures — but it has not yet been proven against real core logic,
because `src/core/` is empty in this plan. The requirement's enforcement machinery is
complete; its subject matter arrives in plan 01-06. That is by design, and it is the
reason the plan built the gate first: there is nothing to retrofit.

## Threat Model Coverage

| Threat ID | Disposition | Status |
|---|---|---|
| T-01-SC (tampering via npm install) | mitigate | **Done.** Task 1 gate cleared before first install; both runtime deps exact-pinned; `package-lock.json` committed so integrity hashes appear in diff; `npm audit` clean. |
| T-01-12 (postinstall scripts) | accept | Accepted as planned. No secrets in this repo. 118 packages installed, 0 vulnerabilities. |
| T-01-04 (string → DOM) | mitigate | **Done for the core.** `innerHTML` and `dangerouslySetInnerHTML` are both in the forbidden-identifier list. Extending the ban to `src/ui` is plan 01-05's job, as planned. |
| T-01-09 (spoofing the Pages origin) | accept | Accepted as planned. |

No new security-relevant surface was introduced beyond the threat register. No threat flags.

## Issues Encountered

None. The one thing worth recording is that `git add` emits CRLF conversion warnings on
every text file, since the repo has no `.gitattributes` and the platform is Windows. It is
cosmetic today, but a future plan may want a `.gitattributes` with `* text=auto eol=lf` to
keep line endings deterministic across machines. Not fixed here — out of this plan's scope,
and it would touch every file.

## User Setup Required

None. No external service configuration is required by this plan.

## Orchestrator Follow-Ups

- **`.planning/REQUIREMENTS.md` was deliberately NOT modified.** SHEL-04's checkbox and
  traceability row still read Pending. This worktree left the file alone because it is
  shared across the parallel wave-1 worktrees and concurrent edits would conflict on merge.
  The orchestrator should mark SHEL-04 complete centrally.
- **`STATE.md` and `ROADMAP.md` were not touched**, per the dispatch instructions.

## Next Phase Readiness

Ready. Every downstream plan in this phase now has:

- A working `npm install && npm run verify` loop that is green from a clean clone.
- The `base` path already correct, so plan 01-02's GitHub Actions Pages workflow only has
  to upload `dist/`, not reason about URLs.
- `npm run check:pure` available to call from CI immediately.
- `src/core/README.md` stating the boundary that plan 01-06's reducer must respect, and a
  gate that will fail the build the first time it does not.

One thing plan 01-02 should know: `vite.config.ts` imports `defineConfig` from
`vitest/config` rather than `vite`, so that the `test` block typechecks. `vitest` is a
devDependency and is present in CI, but the Pages workflow must run `npm ci` (not
`npm ci --omit=dev`) or the build will fail to resolve it.

## Self-Check: PASSED

All 17 files verified present via `git ls-files`. All 3 task commits verified present in
`git log`: `34755f5`, `350196e`, `981d2c1`.

---
*Phase: 01-draft-skeleton-on-a-real-url*
*Completed: 2026-08-04*
