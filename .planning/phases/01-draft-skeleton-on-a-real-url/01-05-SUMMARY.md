---
phase: 01-draft-skeleton-on-a-real-url
plan: 05
subsystem: ui-shell-and-pool
tags: [tokens, design-contract, preact, pool-grid, sprites, accessibility, live-region, adapters, ci-gate]

requires:
  - 01-01 (Vite base path, check-pure-core.mjs, verify script)
  - 01-02 (deploy workflow, live URL, README)
  - 01-03 (roster snapshots, RosterEntry/RosterSnapshot types, pure transform)
  - 01-04 (committed sprites, sprite-meta.json byRosterId map, measured 96x96)
provides:
  - src/ui/tokens.css — the single token declaration every later phase styles against
  - src/ui/app.css — layout shell, global :focus-visible ring, reduced-motion, .visually-hidden
  - src/ui/components/LiveRegion.tsx — the one polite live region, plus announce()
  - src/adapters/roster-source.ts — loadRoster(); the only network read in the app
  - src/ui/components/PoolGrid.tsx — the pool surface Phase 2 extends, not replaces
  - src/ui/components/MonCard.tsx — pool cell, plus the exported resolveSpriteFile()
  - tests/ui/sprite-resolution.test.ts — pins the slug-is-not-a-filename trap
  - npm run check:nohtml — raw-HTML sink gate over all of src/, in verify and in CI
affects: [01-06, 01-07, 01-08, 01-09, 01-10, 01-11]

tech-stack:
  added: []
  patterns:
    - "tokens.css declares values and never styles an element; every other stylesheet consumes tokens and declares no raw colour or covered length"
    - "Each --text-* token is a complete `font` shorthand, so one declaration carries weight, size, line-height and family together"
    - "Only a run of digits can be interpolated into a sprite URL; only a /^roster\\.[a-z0-9]+\\.json$/ name can reach a snapshot URL"
    - "Sprite filenames come from sprite-meta.json byRosterId, never from entry.spriteId — the slug resolves for zero of the 235 entries"
    - "Every runtime asset URL is prefixed with import.meta.env.BASE_URL; a leading / works on localhost and 404s on the deployed sub-path"
    - "One failure copy for every load failure mode, with the real cause preserved on Error.cause"
    - "A CI text gate must not be able to match its own documentation — implementation notes live outside the markup they describe"

key-files:
  created:
    - src/ui/tokens.css
    - src/ui/app.css
    - src/ui/components/LiveRegion.tsx
    - src/adapters/roster-source.ts
    - src/ui/components/PoolGrid.tsx
    - src/ui/components/PoolGrid.css
    - src/ui/components/MonCard.tsx
    - src/ui/components/MonCard.css
    - tests/ui/sprite-resolution.test.ts
  modified:
    - src/app.tsx
    - src/main.tsx
    - index.html
    - package.json
    - .github/workflows/deploy.yml
    - scripts/check-pure-core.mjs
    - scripts/check-pure-core-selftest.mjs
    - scripts/__fixtures__/impure/impure-core-sample.ts
    - .planning/phases/01-draft-skeleton-on-a-real-url/01-UI-SPEC.md

key-decisions:
  - "MonCard and PoolGrid take an explicit spriteMeta prop, deviating from the plan's { entry, onPick } signature — the same plan mandates a byRosterId lookup, which that signature cannot perform"
  - "check:nohtml forbids outerHTML and insertAdjacentHTML as well as the two sinks the threat register names, because a ref opens the identical hole"
  - "check:nohtml was added to `npm run verify`, not only to the deploy workflow — a gate that only exists in CI is a gate the author discovers by failing a push"
  - "The markup mode deliberately does NOT apply the ambient-state list; fetch, document and window are exactly what src/adapters and src/ui exist to use"
  - "resolveSpriteFile is exported so the slug-vs-filename trap is pinned by a test against real committed data and real files on disk, not left to code review"
  - "The plan's grep acceptance criterion was unsatisfiable and was reported as a plan defect rather than satisfied by editing accurate documentation or renaming a Pokémon"

requirements-completed: [ROST-11]

duration: ~25 min of executor time across three dispatches, plus a human verification round-trip
completed: 2026-08-04
---

# Phase 1 Plan 05: Token System and the Live Pool Summary

**The real Champions pool is on the real URL — 235 draftable species rendered from the committed snapshot with committed PokeAPI art, on a dark high-contrast screen whose every design value comes from one token file, and with the slug-is-not-a-filename trap that would have produced 235 broken images closed at build time, pinned by a test, and proven over HTTP on the deployed site.**

## Execution note: this plan ran across three dispatches

| Dispatch | Did what |
| --- | --- |
| 1 | Tasks 1 and 2. Halted correctly at Task 3's `gate="blocking"` checkpoint, and raised three discrepancies rather than papering over them. |
| 2 | Orchestrator + user. Resolved all three discrepancies, pushed `main`, confirmed the deploy and the live URL, and ran the human verification. |
| 3 | This executor. Wrote this SUMMARY. **It implemented nothing.** |

Everything below is recorded from the merged tree, the two task commits, and the
orchestrator's and user's reported outcomes. Where a fact was observed by someone
else, this document says so — see especially the Task 3 section, where the visual
verification is the **user's** finding and not this executor's.

## Performance

- **Duration:** ~25 min of executor time (Task 1 commit 19:53, Task 2 commit 20:07), plus the checkpoint round-trip
- **Completed:** 2026-08-04
- **Tasks:** 3 (2 auto, 1 blocking human-verify)
- **Files created:** 9 · **modified:** 9

## Task Commits

| Task | What | Commit | Type |
| --- | --- | --- | --- |
| 1 | Token system, app shell, polite live region, UI-SPEC sprite correction | `16cbd91` | feat |
| 2 | Roster adapter, PoolGrid + MonCard, sprite-resolution test, `check:nohtml` gate | `5b63936` | feat |
| 3 | Live-URL human verification — no code; see below | *(checkpoint)* | — |

Two orchestrator commits also belong to this plan's record, both made while
resolving the checkpoint discrepancies:

| Commit | What |
| --- | --- |
| `f94c5e5` | Anchored this plan's unsatisfiable `src/core` purity grep criterion |
| `88933e0` | Added `Loading the pool…` to the UI-SPEC's "Every string in Phase 1" table |

`16cbd91`: 6 files, 228 insertions. `5b63936`: 13 files, 836 insertions.

## Accomplishments

### One file holds every design value the project will ever use

`src/ui/tokens.css` declares 7 spacing tokens, 8 size tokens, 4 type tokens, 2 font
families, 13 colour tokens and `color-scheme: dark` on `:root`, and styles nothing.
`src/ui/app.css` contains **zero raw hex**; component CSS contains zero raw hex.
That is the D-07 bet made concrete: Phase 2's three display densities change exactly
four tokens — `--sprite-lg`, `--cell-min`, `--cell-h`, `--text-label` — and nothing
else, which is a token swap rather than a restyle.

**The 96px assumption is retired in writing.** UI-SPEC called the sprite dimension
"an unconfirmed working assumption"; plan 01-04 measured 96×96 across all 311 PNGs
with zero outliers. `--sprite-lg: 96px` / `--sprite-sm: 48px` now cite that
measurement and its date, and the three places in `01-UI-SPEC.md` that hedged were
corrected in `16cbd91`.

**One typography convention, chosen and held.** Each `--text-*` token is a complete
`font` shorthand — `600 24px / 1.25 var(--font-sans)` — so a consumer writes
`font: var(--text-heading)` and gets weight, size, line-height and family in one
declaration. Four sizes, two weights, no 500, no 700, no italics.

### The sprite trap, closed three ways

This was the single most likely way to ship a pool of 235 broken images, and plan
01-04's SUMMARY flagged it explicitly. `RosterEntry.spriteId` is a derived slug
(`abomasnow`); the committed files are named by PokeAPI id (`460.png`). The obvious
`sprites/${entry.spriteId}.png` resolves for **zero** of the 235 entries — not
"most", zero — and fails with no build error anywhere.

It is closed at three levels:

1. **Code.** `resolveSpriteFile()` reads `spriteMeta.byRosterId[entry.id].file`, and
   the module's doc comment states the trap so it cannot be reintroduced by someone
   simplifying the lookup.
2. **Test.** `tests/ui/sprite-resolution.test.ts` walks every committed entry and
   every Mega forme against the files actually on disk, and includes an assertion
   whose only job is to confirm the trap is *total*: zero `${spriteId}.png` files
   exist. If that ever stops being zero, the two id spaces have converged by accident
   and the comment is misleading.
3. **HTTP, on the deployed site.** The orchestrator confirmed on the live URL that
   `sprites/460.png` returns **HTTP 200 `image/png`** while `sprites/abomasnow.png`
   — the slug path — returns **HTTP 404 `text/html`**. The trap is real and the
   shipped code is on the correct side of it.

### The only fetch in the app, and it is narrow

`src/adapters/roster-source.ts` reads `roster.index.json`, follows its `default`
regulation to the snapshot, and loads `sprite-meta.json` alongside it. Notable
properties:

- Every URL is `${import.meta.env.BASE_URL}` + a fixed template. A path merely
  starting with `/` would resolve to the domain root and 404 on the deployed
  sub-path while working perfectly on localhost.
- The default regulation is named **in data**, not hardcoded — ROST-06 keeps the
  prior regulation's frozen snapshot alongside the current one, so which is current
  is the manifest's decision.
- Every failure mode — transport, HTTP status, malformed JSON, wrong shape — surfaces
  as one `RosterLoadError` carrying the UI-SPEC copy verbatim, with the real cause
  preserved on `Error.cause` so a console still shows what broke.
- `credentials: 'omit'` is stated rather than inherited from the same-origin default.

### A new CI gate that actually gates

`check:nohtml` scans **all** of `src/` for raw-HTML sinks and runs in both
`npm run verify` and the deploy workflow's verify job. It shares one scanner with
`check:pure` but a different identifier list, and the self-test proves four things:
the new mode catches a real violation, it does not flag the pure fixture that names
`innerHTML` in a comment, it does not drag the ambient-state list along, and a
mistyped flag is fatal rather than silently falling back to core mode.

## Task 3: the live-URL verification — user-approved

**This executor did not observe the live site.** What follows is recorded from the
orchestrator's and the user's reports.

**Deployment.** The orchestrator pushed `main` to `3707378`. The deploy workflow went
**green**, and the new build is live and serving at
`https://hyper-mage.github.io/Pokemon-champions-drafter/`, with
`assets/index-DbtpU5w0.js` and `assets/index--zwcP2Sq.css` served from the deployed
page.

**Orchestrator-verified over HTTP on the live site:**

| Probe | Result |
| --- | --- |
| `sprites/460.png` | **HTTP 200, `image/png`** |
| `sprites/abomasnow.png` (the slug path) | **HTTP 404, `text/html`** |

**User verification: the user ran the checks in the plan and replied `approved`.**
That covers the plan's four human acceptance criteria — the fixture-species
find-in-page checks, zero broken-image glyphs across the whole grid, a visible focus
ring on keyboard navigation, and no horizontal page scroll at 200% zoom.

**On the `{n} available` count.** The plan asks for the observed on-screen number to
be recorded here. This executor cannot honestly record a number it did not see, and
will not present a computed value as an observation. What can be stated as fact:
`counts.draftable` in `public/data/roster.mb.json` is **235**, the automated fixture
check confirms `snapshot.entries.length === snapshot.counts.draftable`, `PoolGrid`
derives the count from `entries.length` — the array it actually renders — and the
user approved a screen whose count is that expression. The number on screen is 235
by construction; it is not recorded here as an eyewitness observation.

**Automated fixture data checks, all passing** — `rotomwash`, `rotomheat`,
`rotomfrost`, `rotomfan`, `rotommow`, all three `tauros-paldea-*`, `kommoo` and
`mrrime` present; `castformsunny` and `aegislashblade` absent; `vivillon`,
`alcremie` and `meganium` one row each.

## Discrepancies raised at the checkpoint — all three resolved

The dispatch-1 executor raised three discrepancies instead of quietly working around
them. All three are now closed.

### 1. The loading string was not in the contract — user ruled, contract amended

The UI-SPEC's copywriting table is headed "Every string in Phase 1" and claims
completeness, but listed no loading state — while this plan mandates one. The
executor implemented `Loading the pool…` and flagged the gap rather than inventing
copy silently.

**Resolution:** the user ruled to keep the implemented string and amend the contract.
The orchestrator added `| Pool loading state | \`Loading the pool…\` |` to the table
in `88933e0`. The table's completeness claim holds again.

### 2. A plan defect: the purity grep criterion could not pass without corrupting data

**This is recorded as a defect found in the plan, not as a deviation taken.** Task 2's
acceptance criteria included:

```
grep -rn "fetch\|BASE_URL" src/core/   →   must produce no matches
```

Unanchored and not restricted to source files, that pattern matched two things that
are entirely correct:

- the prose word **"fetched"** in `src/core/README.md`
- the species name **`Farfetch'd`** in `src/core/roster/transform.ts`

The only two ways to make it pass were deleting accurate documentation or renaming a
Pokémon — and this plan's own Task 3 action says in terms: *"Do not adjust roster data
or classification rules to make a check pass."* The executor did neither and reported
the criterion as unsatisfiable.

**Resolution:** the orchestrator independently reproduced both matches and fixed the
plan in `f94c5e5`. The criterion is now word-anchored and source-only —
`grep -rnwE "fetch|BASE_URL" --include=*.ts --include=*.tsx src/core/` — and is
clean. `npm run check:pure` remains the authoritative gate; it strips comments and
strings and matches on word boundaries, which is exactly why it never had this
problem.

### 3. The plan's `<interfaces>` block was stale about the manifest key

The plan documents `roster.index.json` regulations as carrying a `file` key. The
committed manifest uses **`json`** (with a `script` sibling). The adapter reads
`json`, which is correct against the real data; the plan text was out of date.
No action needed — recorded so the next reader trusts the manifest over the plan.

## Deviations from Plan

### 1. [Rule 3 - Blocking] `MonCard` and `PoolGrid` take an explicit `spriteMeta` prop

- **Plan said:** `MonCard` props are `{ entry, onPick }`.
- **Conflict:** the same plan requires the sprite `src` to come from a
  `sprite-meta.json` `byRosterId` lookup (and plan 01-04's SUMMARY names this as the
  single most likely way to break the grid). A component holding only `entry` cannot
  perform that lookup. The two instructions are not simultaneously satisfiable.
- **What shipped:** `{ entry, spriteMeta, onPick }`, with `spriteMeta` threaded from
  `App` through `PoolGrid`. The alternative — a module-level singleton — would have
  put ambient state under `src/ui` and made the resolver untestable in isolation.
- **Why it is safe:** the plan's actual constraint is *"do not shape the props so
  [typing and base stats] cannot be added"*. An extra required prop adds a data
  source; it closes nothing off.
- **Files:** `src/ui/components/MonCard.tsx`, `src/ui/components/PoolGrid.tsx`,
  `src/app.tsx` · **Commit:** `5b63936`

### 2. [Rule 2 - Missing Critical] `--nohtml` also covers `outerHTML` and `insertAdjacentHTML`

- **Plan said:** scan for `dangerouslySetInnerHTML` and `innerHTML`.
- **Gap:** `outerHTML` and `insertAdjacentHTML` open the identical hole through a
  ref. A gate listing two of the four names would look complete while missing two of
  the most obvious ways around it — worse than no gate, because it invites trust.
- **Fix:** the markup mode forbids all four. T-01-04 is mitigated against the class,
  not against two spellings.
- **Files:** `scripts/check-pure-core.mjs` · **Commit:** `5b63936`

### 3. [Rule 2 - Missing Critical] `check:nohtml` was added to `verify`, not only to the workflow

- **Plan said:** add the step to `.github/workflows/deploy.yml`.
- **Gap:** a gate that exists only in CI is a gate the author meets by failing a
  push. `npm run verify` is the local contract.
- **Fix:** `verify` is now
  `check:pure && check:nohtml && test && build`, and the workflow step was added as
  the plan asked. Both, not either.
- **Files:** `package.json`, `.github/workflows/deploy.yml` · **Commit:** `5b63936`

### 4. [Rule 2 - Missing Critical] The `<img>` implementation notes live outside the markup

- **Not in the plan.** Task 2's acceptance criteria include a negative text check:
  `MonCard.tsx` must not contain `loading="lazy"`. A comment in the JSX explaining
  *why* lazy loading is deliberately omitted would contain that literal string and
  fail the check on its own documentation.
- **Fix:** the notes on `alt=""`, the explicit `width`/`height`, and the deliberate
  absence of lazy loading sit in a block comment above the component, phrased so no
  CI text check can match them. The reasoning survives; the gate stays honest.
- **Files:** `src/ui/components/MonCard.tsx` · **Commit:** `5b63936`

### 5. [Rule 2 - Missing Critical] `index.html` gained a `color-scheme` meta tag

- **Not in the plan**, which specified `color-scheme: dark` in `tokens.css` only.
- **Why:** the CSS declaration takes effect after the stylesheet parses, so the first
  paint flashes white on a dark-themed app.
- **Files:** `index.html` · **Commit:** `16cbd91`

**Total deviations:** 5 auto-fixed (4 missing-critical, 1 blocking). **No Rule 4
architectural escalations.** One blocking checkpoint hit, by design.

## Verification Evidence

Orchestrator-confirmed on the merged `main` tree:

```
npm run verify         → green
  check:pure           → 0 violations, 2 files
  check:nohtml         → 0 violations, 9 files      (gate added by this plan)
  check:pure:selftest  → passed, both modes
  tests                → 68 passed
  build                → index.js  25.95 kB / 10.16 kB gzip
                         index.css  2.60 kB /  1.11 kB gzip

runtime dependencies   → still exactly two (preact, @preact/signals)
sprite coverage        → 235/235 entries return image/png over HTTP at the real base path
```

Test count rose 60 → 68; the 8 new tests are `tests/ui/sprite-resolution.test.ts`.

**Every plan acceptance criterion:**

| Criterion | Result |
| --- | --- |
| tokens.css declares all 7 space, 8 size, 4 text, 2 font, 13 colour tokens | confirmed |
| tokens.css contains `color-scheme: dark` | confirmed |
| `--sprite-lg` equals measured `nativeWidth`; `--sprite-sm` is exactly half | 96px / 48px |
| No `outline: none` under `src/ui/` | 0 matches |
| No raw hex in `src/ui/app.css` | 0 matches |
| `app.css` contains `prefers-reduced-motion` | confirmed |
| `index.html` contains `lang="en"` | confirmed |
| `main.tsx` imports tokens.css before app.css | confirmed |
| UI-SPEC no longer calls the sprite dimension unconfirmed | confirmed (`16cbd91`) |
| `MonCard` root is `<button type="button">` | confirmed |
| `MonCard` contains `import.meta.env.BASE_URL` and `_placeholder.png` | confirmed |
| Explicit `width`/`height` on the img; no lazy loading | confirmed |
| `PoolGrid.css` contains `repeat(auto-fill, minmax(var(--cell-min), 1fr))` | confirmed |
| No raw hex under `src/ui/components/` | 0 matches |
| No raw-HTML sink anywhere under `src/` | 0 matches |
| `npm run check:pure` exits 0 | 0 violations |
| Word-anchored `fetch`/`BASE_URL` grep over `src/core/` sources | 0 matches (criterion fixed in `f94c5e5`) |
| `npm run check:nohtml` exits 0 and is referenced in the workflow | confirmed |
| `npm run build` exits 0 | confirmed |
| Human confirms fixture species, zero broken images, focus ring, 200% zoom | **user approved** |
| Observed `{n} available` recorded | see Task 3 — `counts.draftable` is 235; not eyewitnessed by this executor |

## Threat Model Coverage

| Threat ID | Disposition | Status |
| --- | --- | --- |
| T-01-04 (roster strings into the DOM) | mitigate | **Done, and enforced rather than assumed.** Names render as text children, which Preact escapes. `check:nohtml` fails the build on any of four raw-HTML sinks anywhere under `src/`, runs in `verify`, and gates the deploy. |
| T-01-25 (snapshot fetched at runtime) | mitigate | **Done.** Same-origin static assets from the project's own Pages deployment over HTTPS, `credentials: 'omit'`, no third-party origin at runtime. Any failure shows the contract copy — the UI never half-loads. |
| T-01-26 (~235 image cells at once) | accept | **Accepted as planned.** No virtualization. The one sanctioned escape hatch is documented in `PoolGrid.tsx` verbatim so a future reader cannot reach for a library instead. |
| T-01-27 (sprite `src` built from data) | mitigate | **Done, and tightened.** `SPRITE_FILE_PATTERN` means only a run of digits can be interpolated into a sprite URL; anything else falls back to the placeholder. Beyond the plan, `SNAPSHOT_FILE_PATTERN` applies the same treatment to the snapshot filename read from the manifest. |

No new threat flags. This plan adds the app's only `fetch`, and it reaches nothing
but same-origin files committed to this repository.

## Known Stubs

| Stub | File | Why it is intentional |
| --- | --- | --- |
| `handlePick` is an empty function | `src/app.tsx:37` | The plan states `onPick` is a no-op here; **plan 01-06** wires it to the append-only action log. The cell is already a real `<button>` that takes focus and shows the ring, so the accessibility surface is finished — only the dispatch is pending. |

Nothing else is stubbed. The pool renders real data from the real snapshot with real
art; there is no mock data path anywhere in this plan.

## Issues Encountered

- **This plan's own acceptance criterion was unsatisfiable** — see Discrepancy 2. The
  broader lesson is that a plain `grep` over a directory containing prose and
  Pokémon names will match things it did not mean to; `Farfetch'd` contains `fetch`.
  Word-anchor and restrict to source extensions, or lean on `check:pure`, which
  already strips comments and strings.
- **The continuation worktree for this SUMMARY spawned at an ancestor commit**
  (`80d64e3`) rather than the stated base. The executor's reset-forward guard caught
  it and corrected to `88933e0` before any write. Second plan in this phase to hit
  fresh-worktree base drift — the guard is earning its place.
- **`node_modules` may be absent in a fresh worktree.** Unchanged from 01-04; the
  verification numbers above are the orchestrator's from the merged tree.

## User Setup Required

None. `npm ci && npm run dev` shows the pool locally; the deployed URL shows it to
everyone else.

## Orchestrator Follow-Ups

- **`STATE.md`, `ROADMAP.md` and `.planning/REQUIREMENTS.md` were not touched**, per
  dispatch instructions. On requirements:
  - **ROST-11** ("every roster entry resolves to a sprite, with a visible fallback")
    was already marked complete centrally at `028e354`. This plan is where it becomes
    *visibly* true — 235/235 entries serving `image/png` on the live site — but it
    needs no further marking.
  - **ROST-02** ("a committed snapshot ships in the repo **and the app works fully
    offline with it**") is advanced but **not complete**, and is correctly still
    Pending. The snapshot half is done and proven; the offline half needs plan
    **01-11**'s service worker. It should not be checked off yet.
- **Nothing was pushed by this executor and no remote was touched.** `main` was
  already pushed to `3707378` by the orchestrator during Task 3.
- **A `.gitattributes` is now wanted by four consecutive plans.** `* text=auto eol=lf`
  plus `*.png binary`.
- **The plan's `<interfaces>` block is stale** on the `roster.index.json` regulation
  key (`file` vs the real `json`). Worth correcting wherever that block was copied
  from, so plan 01-06 does not inherit it.

## Next Phase Readiness

Ready. Plan 01-06 (wiring picks) inherits:

- A real `<button>` per pool cell with an `onPick(entry)` callback already threaded
  from `App` → `PoolGrid` → `MonCard`, awaiting only a dispatch body.
- A single `announce()` helper and one polite live region already mounted at app
  root, which is what a pick needs in order to be perceivable without sight.
- A token system with a `--target-min` of 44px and a global focus ring, so new
  controls inherit the accessibility baseline instead of re-deriving it.
- A loaded, sorted, deterministic `entries` array — `num` then `id`, because Rotom
  and its five appliances all share 479 — so a fixture check or a screenshot means
  the same thing on every run.
- A `verify` script that now fails on raw-HTML sinks as well as core impurity.

## Self-Check: PASSED

Files verified present on disk: `src/ui/tokens.css`, `src/ui/app.css`,
`src/ui/components/LiveRegion.tsx`, `src/adapters/roster-source.ts`,
`src/ui/components/PoolGrid.tsx`, `src/ui/components/PoolGrid.css`,
`src/ui/components/MonCard.tsx`, `src/ui/components/MonCard.css`,
`tests/ui/sprite-resolution.test.ts`, `src/app.tsx`, `src/main.tsx`, `index.html`,
`package.json`, `.github/workflows/deploy.yml`, `scripts/check-pure-core.mjs`.

Commits verified present in `git log`: `16cbd91` (Task 1), `5b63936` (Task 2),
`3707378` (orchestrator merge + push), `f94c5e5` (grep criterion fix),
`88933e0` (UI-SPEC loading string).

---
*Phase: 01-draft-skeleton-on-a-real-url*
*Completed: 2026-08-04*
