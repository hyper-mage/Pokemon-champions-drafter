---
phase: 01-draft-skeleton-on-a-real-url
plan: 06
subsystem: state-architecture-and-draft-board
tags: [append-only-log, pure-reducer, selectors, seeded-rng, signals, store, draft-board, purity-gate]

requires:
  - 01-01 (Vite base path, check-pure-core.mjs, verify script)
  - 01-03 (RosterSnapshot/RosterEntry types, committed snapshots)
  - 01-04 (committed sprites, sprite-meta.json byRosterId map)
  - 01-05 (tokens.css, app shell, LiveRegion, roster-source adapter, PoolGrid/MonCard, check:nohtml)
provides:
  - src/core/model.ts — TournamentDoc and DraftState; the serializable document shape
  - src/core/actions.ts — all four action types, payload-only creators, runtime payload guards
  - src/core/reduce.ts — apply, canApply and fold as three separate functions
  - src/core/selectors.ts — every piece of derived data; nothing derived is stored
  - src/core/rng.ts — seeded nextInt; the only randomness in the application
  - src/adapters/clock.ts, src/adapters/id.ts — the impure edge for time, ids and the seed
  - src/store.ts — the single write path and the future sync seam
  - src/ui/sprite-src.ts — the sprite URL rule, in exactly one place
  - src/ui/components/{TurnBanner,BoardGrid,TeamStrip,MonChip} — the draft surfaces
affects: [01-07, 01-08, 01-09, 01-10, 01-11]

tech-stack:
  added: []
  patterns:
    - "dispatch is the only write path; exactly one `log.push` site exists in the codebase"
    - "canApply runs before the append, so a rejected action never enters the log"
    - "apply is total and tolerant (unknown types return state unchanged); canApply is strict and refuses them"
    - "Known action types are additionally payload-guarded at runtime, because plan 01-10 folds untrusted imported logs"
    - "Externally-derived results are materialized into the log: pool/built carries real ids, draft/started carries the resolved order"
    - "Two signals, not one: docSignal is the persisted truth, stateSignal is the fold of it"
    - "The document is copied before it is appended to, so a reference captured before a dispatch keeps describing what it described"
    - "Round numbers are 1-based everywhere — board headers, banner copy, and DraftPick.round agree by construction"
    - "A board row and a team strip are the same element, so they cannot drift apart"

key-files:
  created:
    - src/core/model.ts
    - src/core/actions.ts
    - src/core/reduce.ts
    - src/core/selectors.ts
    - src/core/rng.ts
    - src/adapters/clock.ts
    - src/adapters/id.ts
    - src/store.ts
    - src/ui/sprite-src.ts
    - src/ui/components/TurnBanner.tsx
    - src/ui/components/TurnBanner.css
    - src/ui/components/BoardGrid.tsx
    - src/ui/components/BoardGrid.css
    - src/ui/components/TeamStrip.tsx
    - src/ui/components/MonChip.tsx
    - src/ui/components/MonChip.css
    - tests/core/reduce.test.ts
    - tests/core/selectors.test.ts
    - tests/core/rng.test.ts
  modified:
    - src/app.tsx
    - src/ui/components/MonCard.tsx
    - tests/ui/sprite-resolution.test.ts

key-decisions:
  - "spriteSrc takes an explicit spriteMeta argument, deviating from the plan's spriteSrc(entry) and from the plan's stated `sprites/${entry.spriteId}.png` body — that construction 404s on all 235 entries and is verified broken on the live site"
  - "draft/pickUndone retracts the pick carrying targetSeq rather than 'rebuilding from the log prefix', because fold is log.reduce(apply, ...) and apply structurally cannot see the log; the equivalence is asserted by test rather than claimed"
  - "canApply gained wrongSlot, and known action types are payload-guarded at runtime, because plan 01-10 will fold untrusted imported logs"
  - "The RNG cursor stays at 0 in Phase 1 and this is documented rather than papered over: one derivation, always from cursor 0, whose result is materialized so replay never rolls again"
  - "TeamStrip returns a fragment rather than a display:contents wrapper, sidestepping that property's accessibility-tree caveats"
  - "Round headers are written as literal R1…R6 with a computed fallback, so the CI text check matches real copy and not a comment about copy"

requirements-completed: [SHEL-04, SHEL-05, SHEL-07]

duration: ~35 min
completed: 2026-08-04
---

# Phase 1 Plan 06: The Draft, For Real Summary

**Two players now alternate twelve picks against the real 235-species Champions roster, and every byte of that is one serializable JSON document driven by an append-only log and a pure reducer — with the SHEL-04 purity gate finally enforcing against a populated core rather than against almost nothing.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-08-04
- **Tasks:** 3 (all auto, no checkpoints)
- **Files created:** 19 · **modified:** 3
- **Tests:** 68 → 135 (+67)

## Task Commits

| Task | What | Commit | Type |
| --- | --- | --- | --- |
| 1 (RED) | Failing tests for reducer, selectors and seeded RNG | `dbff6c3` | test |
| 1 (GREEN) | model, actions, reduce, selectors, rng | `8ab5732` | feat |
| 2 | Impure edge, store, TurnBanner, click-to-pick wiring | `3bb7eec` | feat |
| 3 | sprite-src extraction, MonChip, TeamStrip, BoardGrid | `1923c85` | feat |

The plan is `type: tdd`. The gate sequence is intact and visible in the log: a
`test(...)` commit whose three files fail at import, then a `feat(...)` commit that
makes 135 tests pass. No REFACTOR commit was needed — nothing required cleaning up
after it went green.

## Accomplishments

### The purity gate now has something to guard

Before this plan `src/core` held two files, both roster transform. It now holds seven,
and `check:pure` reports **0 violations in 7 files**. That is the first time SHEL-04 has
meant anything.

The gate shaped the design rather than merely auditing it. `src/adapters/id.ts` and
`src/adapters/clock.ts` exist *because* `crypto` and `Date.now` are forbidden tokens
under `src/core` — so ids, timestamps and the RNG seed are stamped onto the action at
dispatch time and the reducer only ever reads what the action carries. The result is
that every test in `tests/core/` runs with **zero mocks**, and the test files say so at
the top: the day one of them needs a fake clock, an ambient value has leaked and the
gate should already have failed the build.

`grep -rn "Math.random\|Date.now\|crypto\." src/core/` returns nothing.

### Randomness is state, and it is the one thing that must reproduce

`src/core/rng.ts` is the mulberry32-style integer mix, a pure function of
`(seed, cursor)`. There is no generator object and no hidden state. The seed is drawn
once at the impure edge when the tournament is created, stored in the document, and
never drawn again.

SHEL-07 needed a real consumer or it would have been untestable ceremony, so the
starting order is derived from it — and then **materialized into the `draft/started`
action** (Pattern 5). Both halves are tested: that the derivation is reproducible from
the seed, and that the log carries the resolved result so a replay reads what happened
rather than rolling again against a roster that may since have rotated.

The RNG tests deliberately include one that a constant-returning generator would fail,
because every determinism assertion in the file passes trivially for a function that
always returns 4.

### apply is tolerant, canApply is strict, and they are two functions on purpose

The split is not ceremony. A sync layer has to re-validate an action after reordering it
*without* executing it, and the local case needs the same shape: `dispatch` asks
`canApply` first and appends nothing when the answer is no, so **a rejected action never
reaches the log** (T-01-29).

The two have deliberately opposite postures toward the unknown:

- `apply` returns the state unchanged for an action type it does not recognise, so a
  document written by a newer build still folds on this one instead of crashing it.
- `canApply` **refuses** that same action, so this build never *originates* one.

Rejection reasons: `notInPool`, `notYourTurn`, `draftComplete`, `draftNotStarted`,
`wrongSlot`, `poolAlreadyBuilt`, `poolNotBuilt`, `emptyPool`, `duplicatePoolIds`,
`draftAlreadyStarted`, `unknownPlayer`, `nothingToUndo`, `malformedPayload`,
`unknownAction`.

### Undo is already implementable, and the log already knows how to express it

`draft/pickUndone` exists and is reducible from day one even though nothing dispatches
it until plan 01-07. Two properties are asserted directly rather than assumed:

- **Folding a log prefix equals the state before the removed action was applied** —
  checked at every one of the 15 cut points of a complete draft. This is what makes undo
  a re-fold rather than an inverse patch.
- **The compensating action and the pop-and-refold produce deeply equal state.** That
  equality is what lets plan 01-07 pop the log as a local-only optimization without
  creating a second, divergent code path.

`apply` also advances incrementally in the store, and a test walks a full twelve-pick
draft asserting action-by-action that the incremental result equals re-folding the whole
log. The dispatch path and the reload path cannot disagree.

### One write path, one append site

`grep -c "log.push" src/store.ts` returns **1**. `grep -rn "log\.push\|log\[" src/ui/ src/app.tsx`
returns nothing. No component mutates the document.

The store is two signals rather than one, because the two things are genuinely different:
`docSignal` holds the persisted truth, `stateSignal` holds the fold of it — a cache. The
document is **copied before it is appended to**, so a reference captured before a
dispatch keeps describing the state it described then; plan 01-07's undo and plan 01-10's
export both depend on that.

When sync arrives, `dispatch` gains a `broadcast(action)` and a sibling
`receive(remoteAction)`, and nothing else in the codebase changes. That is
integration-not-rewrite made concrete, which is exactly why the constraint mattered now.

### The document is a plain JSON object, and it is checked as one

Beyond the required round-trip assertion, a test walks the entire document and fails on
any `Date`, `Map`, `Set`, function, symbol, bigint, `undefined`, or non-plain prototype
at any depth. Another asserts `seq`, `at` and `actorId` on every action — sync rule 8,
before there is anything to migrate.

### Real-data verification, not just fixtures

The unit tests use a 13-species fixture pool. Before committing, a temporary harness ran
the **actual committed `roster.mb.json`** through the whole pipeline and was then removed
(it is not part of the plan's file list and is not in the tree). It confirmed:

| Check | Result |
| --- | --- |
| Pool at draft start | **235** |
| Pool after each of 12 picks | shrinks by exactly one, 235 → **223** |
| Every one of the 12 picks | `canApply` returned `{ ok: true }` |
| Teams at completion | **6 and 6** |
| `selectIsComplete` / `selectCurrentTurn` | `true` / `null` |
| `JSON.parse(JSON.stringify(doc))` | deep-equals `doc` |
| Re-folding the reloaded document | identical state |

### The board is built for eight players, not for two

Players as rows, rounds as columns, `160px repeat(6, minmax(0, 1fr))`. Rows grow
downward for free when Phase 2 raises the player count, and the selectors are tested at
eight players running all 48 picks — including the assertion that the round advances only
after all eight have picked.

`TeamStrip` returns a **fragment**, so its cells are direct children of the board grid.
There is no `display: contents` anywhere as a result, which sidesteps that property's
accessibility-tree caveats rather than accepting them.

Exactly one cell carries the accent border while a draft is in progress and zero when it
is complete. That reduces entirely to `selectCurrentTurn`: only one player matches
`playerId`, only slot `round - 1` matches within that row, and the selector returns
`null` once complete — all three tested.

## Deviations from Plan

### 1. [Rule 1 - Bug] `spriteSrc` takes `spriteMeta`, and does not build the URL from `spriteId`

- **Plan said:** extract `spriteSrc(entry)` returning
  `` `${import.meta.env.BASE_URL}sprites/${entry.spriteId}.png` `` when `spriteMissing`
  is false.
- **Why that could not ship:** `entry.spriteId` is a derived slug (`abomasnow`); the
  committed files are named by PokeAPI numeric id (`460.png`). That construction resolves
  for **zero** of the 235 entries — not most, zero — and 01-05 verified the 404 over HTTP
  on the deployed site. Implementing the plan literally would have shipped 235 broken
  images in the pool *and* introduced them in the new board chips, with no build error
  anywhere.
- **What shipped:** `spriteSrc(entry, spriteMeta)` built on `resolveSpriteFile`, which
  reads `spriteMeta.byRosterId[entry.id].file`. The `SPRITE_FILE_PATTERN` digit guard
  (T-01-27) moved across intact.
- **The plan text is stale, not wrong-headed** — it predates 01-05's deviation that
  introduced the explicit `spriteMeta` prop for this exact reason. The dispatch brief's
  success criteria state the correct rule ("uses `byRosterId`, never `${spriteId}.png`"),
  and this follows them.
- **Files:** `src/ui/sprite-src.ts`, `src/ui/components/MonCard.tsx`,
  `src/ui/components/MonChip.tsx` · **Commit:** `1923c85`

### 2. [Rule 3 - Blocking] `draft/pickUndone` retracts by `targetSeq` instead of rebuilding from a log prefix

- **Plan said:** "Handle `draft/pickUndone` in `apply` by rebuilding from the log prefix
  identified by `targetSeq`."
- **Conflict:** the same plan defines `fold(doc)` as
  `doc.log.reduce(apply, initialState(doc.config))`. `Array.prototype.reduce` hands the
  callback an accumulator and one element — `apply` structurally cannot see the log, and
  must not, or `fold` would be recursive. The two instructions are not simultaneously
  satisfiable.
- **What shipped:** `apply` drops the pick whose `seq` equals `targetSeq`. This is
  *provably* the same thing: picks accumulate independently and each carries its own
  round and slot rather than deriving them from position, so removing one yields exactly
  the state a re-fold without that action produces.
- **Not left as a claim:** `tests/core/reduce.test.ts` asserts the equality directly —
  `fold(log + pickUndone)` deep-equals `fold(log.slice(0, -1))`.
- **Files:** `src/core/reduce.ts` · **Commit:** `8ab5732`

### 3. [Rule 2 - Missing Critical] Runtime payload guards on every known action type

- **Not in the plan.** The plan specifies the discriminant switch; it does not specify
  what happens when an action says `draft/pickMade` and carries no `monId`.
- **Why it matters now:** plan 01-10 imports tournament JSON from a file the user chose.
  `apply` runs over that log. Without a payload check, a malformed entry folds into a
  pick of `undefined` that then renders and exports.
- **Fix:** `isPoolBuiltAction`, `isDraftStartedAction`, `isPickMadeAction` and
  `isPickUndoneAction` check field types as well as the discriminant. A known type with a
  malformed payload is treated exactly like an unknown type: `apply` returns the state
  unchanged, `canApply` returns `malformedPayload`.
- **Files:** `src/core/actions.ts`, `src/core/reduce.ts` · **Commit:** `8ab5732`

### 4. [Rule 2 - Missing Critical] `canApply` rejects a pick that claims the wrong slot

- **Not in the plan**, which names `notInPool`, `notYourTurn` and `draftComplete`.
- **Gap:** the store stamps `round` and `pickIndex` from `selectCurrentTurn`, so they
  always match on the dispatch path — but an edited or imported log could carry a pick
  into round 4 while round 1 is live, and every other check would pass it. That is
  precisely the tampering T-01-29 names.
- **Fix:** `wrongSlot`, checked after `notYourTurn`.
- **Files:** `src/core/reduce.ts` · **Commit:** `8ab5732`

### 5. [Rule 2 - Missing Critical] `newId` falls back to `getRandomValues`

- **Not in the plan**, which specifies `newId()` wrapping `crypto.randomUUID()`.
- **Gap:** `randomUUID` is restricted to **secure contexts**. HTTPS and localhost qualify,
  so the deployed site and `npm run dev` are fine — but a phone opening the host's laptop
  at `http://192.168.x.x` is not, and for a tool whose whole premise is friends around a
  table, that is a plausible way to use it. The app would have failed to create a
  tournament at all.
- **Fix:** feature-detect `randomUUID`; otherwise compose the same v4 UUID from
  `getRandomValues`, which carries no secure-context restriction. No `Math.random`
  fallback — a silently lower-quality id is worse than an honest one.
- **Files:** `src/adapters/id.ts` · **Commit:** `3bb7eec`

### 6. [Rule 3 - Blocking] `tests/ui/sprite-resolution.test.ts` import repointed

`resolveSpriteFile` moved from `MonCard.tsx` to `sprite-src.ts`, which the plan's own
acceptance criterion requires (`grep -rn "BASE_URL" src/ui/components/` must be empty).
The 01-05 test that pins the slug trap imports it, so its import path moved with it. No
assertion changed. **Commit:** `1923c85`

**Total deviations:** 6 auto-fixed (1 bug, 3 missing-critical, 2 blocking). **No Rule 4
architectural escalations.** No checkpoints — the plan had none.

## Verification Evidence

```
npm run verify         → green
  check:pure           → 0 violations, 7 files      (was 2 files before this plan)
  check:nohtml         → 0 violations, 22 files
  tests                → 135 passed  (was 68)
  build                → index.js  33.91 kB / 12.91 kB gzip
                         index.css  4.47 kB /  1.48 kB gzip

runtime dependencies   → still exactly two (preact 10.29.8, @preact/signals 2.10.1)
```

**Every plan acceptance criterion:**

| Criterion | Result |
| --- | --- |
| `npx vitest run tests/core/` exits 0 | 123 passed |
| `node scripts/check-pure-core.mjs src/core` exits 0 | 0 violations, 7 files |
| `grep -rn "Math.random\|Date.now\|crypto\." src/core/` | no matches |
| reduce.ts exports `apply`, `canApply`, `fold` as three functions | confirmed |
| A test asserts unknown action type returns the same state | confirmed (`toBe`, reference equality) |
| A test asserts `JSON.parse(JSON.stringify(doc))` deep-equals `doc` | confirmed |
| A test asserts re-folding a log prefix equals the state before | confirmed, all 15 cut points |
| actions.ts defines `draft/pickUndone`; reduce.ts has a case for it | confirmed |
| `grep -n "state\." src/core/selectors.ts` shows reads only | 15 matches, all reads |
| `npm run build` and `npm run check:pure` exit 0 | confirmed |
| store.ts calls `canApply` before appending, appends only when ok | confirmed |
| `grep -c "log.push" src/store.ts` returns 1 | **1** |
| `grep -rn "log\.push\|log\["` over `src/ui/` and `src/app.tsx` | no matches |
| clock.ts has `Date.now`, id.ts has `crypto.randomUUID`, core has neither | confirmed |
| TurnBanner contains `Round `, ` of 6 — `, ` picks` | all three |
| TurnBanner contains `Draft complete — 12 picks, 2 teams` | confirmed |
| app.tsx passes `selectAvailablePool` output to PoolGrid | confirmed |
| `pool/built` with non-empty `ids` is the first log entry | confirmed |
| BoardGrid.css contains `160px repeat(6, minmax(0, 1fr))` | line 39 |
| BoardGrid.css contains `position: sticky` and `left: 0` | lines 106–107 |
| BoardGrid.tsx contains `Draft board`, `R1`, `No picks yet`, `Player 1 picks first.` | all four, as real copy |
| sprite-src.ts imported by both MonCard.tsx and MonChip.tsx | confirmed |
| `grep -c "BASE_URL" src/ui/sprite-src.ts` ≥ 1; none under components/ | 2; none |
| `grep -rn "onClick"` in MonChip.tsx and TeamStrip.tsx | no matches |
| `grep -rnE "#[0-9a-fA-F]{3,8}" src/ui/components/` | no matches |
| `npm run check:nohtml` exits 0 | 0 violations |
| Exactly one accent cell in progress, zero when complete | confirmed by construction; `selectCurrentTurn` tested |
| Twelve picks complete the draft, pool shrinks by one each time | confirmed against the real 235-row roster |
| Document survives a JSON round trip | confirmed, plus a deep no-exotic-types walk |

## Threat Model Coverage

| Threat ID | Disposition | Status |
| --- | --- | --- |
| T-01-28 (state mutated outside the log) | mitigate | **Done and enforced.** Exactly one `log.push` in the codebase; zero log access anywhere under `src/ui` or `src/app.tsx`. `dispatch` is the only write path, and the document is copied rather than mutated. |
| T-01-29 (an illegal pick entering the log) | mitigate | **Done, and tightened.** `canApply` runs before the append and a rejection never touches the log. `notInPool`, `notYourTurn` and `draftComplete` are all tested; beyond the plan, `wrongSlot` closes the edited-log path and payload guards close the malformed-import path. |
| T-01-30 (non-reproducible state after reload) | mitigate | **Done.** The seed lives in the document, all randomness is the pure `nextInt`, and the resolved starting order is materialized into `draft/started`. Verified end to end: re-folding a JSON round-tripped real-roster document reproduces identical state. |
| T-01-04 (names rendered to the DOM) | mitigate | **Done.** Every new component renders text children. `check:nohtml` covers 22 files with 0 violations and gates both `verify` and the deploy. |
| T-01-31 (unbounded log growth) | accept | **Accepted as planned.** A complete two-player draft is 14 actions; eight players is ~50. Re-fold is sub-millisecond. Plan 01-10's import guard is the only path where length is attacker-controlled. |

No new threat flags. This plan adds no network surface, no storage access, and no new
runtime dependency.

## Known Stubs

None. Every surface this plan touches renders real data from the real snapshot and every
control it wires does what it appears to do. The `handlePick` no-op that 01-05 recorded
as a known stub is now a real dispatch and that entry is closed.

Two things are deliberately *absent* rather than stubbed, both per the plan and the
UI-SPEC vertical order: the sticky `TopBar` with the undo button (plan 01-07) and the
read-only banner (plan 01-09). Neither is a placeholder in the tree — there is no empty
component waiting to be filled in.

## Issues Encountered

- **The worktree spawned at ancestor `80d64e3` rather than the stated base `56243ce`.**
  The startup guard caught it and reset forward before any write; `git rev-parse HEAD`
  was confirmed at `56243ce` before the first file was created. **Third plan in this
  phase to hit fresh-worktree base drift** — the guard has now paid for itself three
  times and should not be trimmed.
- **`node_modules` was absent in the fresh worktree.** `npm ci` first, as with 01-04 and
  01-05.
- **The plan's `spriteSrc` body and its `pickUndone` instruction were both unimplementable
  as written** — see Deviations 1 and 2. Both are stale-text problems rather than design
  problems, and both are recorded so the next reader trusts the code over the plan on
  these two points specifically.

## Orchestrator Follow-Ups

- **`STATE.md`, `ROADMAP.md` and `REQUIREMENTS.md` were not touched**, per dispatch
  instructions. On requirements, this plan completes:
  - **SHEL-04** — the purity gate now enforces against a populated core: 7 files, 0
    violations, and the core/adapters split visibly shaped the design rather than being
    audited after the fact.
  - **SHEL-05** — one serializable JSON document, append-only log, pure reducer, verified
    by round-trip and by a deep no-exotic-types walk.
  - **SHEL-07** — seed in the document, pure `nextInt`, order materialized into the log,
    reload reproduces identical state.
  - **SHEL-06** (undo) is *unblocked* but **not complete** — it is plan 01-07's, and
    should stay Pending. The compensating action type exists and is reducible, and the
    prefix-refold equality it needs is asserted.
- **Nothing was pushed and no remote was contacted.** Four commits sit on
  `worktree-agent-a6ebba8347dfa4513` on top of `56243ce`.
- **A `.gitattributes` is now wanted by five consecutive plans.** Every `git add` in this
  plan emitted `LF will be replaced by CRLF`. `* text=auto eol=lf` plus `*.png binary`.
- **Two stale statements in the 01-06 plan text** are worth correcting wherever they were
  copied from, so 01-07 does not inherit them: the `spriteSrc(entry)` signature and body,
  and the "rebuild from the log prefix" instruction for `pickUndone`.
- **The RNG cursor stays at 0** and is documented in `store.ts`. Phase 2's first second
  consumer of randomness must materialize the advanced cursor into the log, or two
  consumers will silently share one draw. Worth a roadmap note rather than a code comment
  alone.

## Next Phase Readiness

Ready. Plan 01-07 (undo) inherits everything it needs and none of the retrofitting the
ordering constraint existed to prevent:

- `draft/pickUndone` already defined, already reducible, already tested.
- Prefix-refold equality asserted at every cut point, so `log.pop()` + `fold` is a
  one-line undo.
- `canApply` already returns `nothingToUndo`, which is exactly the predicate the disabled
  state of the `Undo last pick` button needs.
- `subscribe(listener)` exported for plan 01-08's debounced autosave; the document is
  already a plain object that `JSON.stringify` handles completely for plan 01-10.
- `DraftPick.seq` gives undo a stable target that survives a retraction earlier in the log
  — an array index would not.

## Self-Check: PASSED

Files verified present on disk: `src/core/model.ts`, `src/core/actions.ts`,
`src/core/reduce.ts`, `src/core/selectors.ts`, `src/core/rng.ts`, `src/adapters/clock.ts`,
`src/adapters/id.ts`, `src/store.ts`, `src/ui/sprite-src.ts`,
`src/ui/components/TurnBanner.tsx`, `src/ui/components/TurnBanner.css`,
`src/ui/components/BoardGrid.tsx`, `src/ui/components/BoardGrid.css`,
`src/ui/components/TeamStrip.tsx`, `src/ui/components/MonChip.tsx`,
`src/ui/components/MonChip.css`, `tests/core/reduce.test.ts`,
`tests/core/selectors.test.ts`, `tests/core/rng.test.ts`, `src/app.tsx`,
`src/ui/components/MonCard.tsx`, `tests/ui/sprite-resolution.test.ts`.

Commits verified present in `git log`: `dbff6c3` (Task 1 RED), `8ab5732` (Task 1 GREEN),
`3bb7eec` (Task 2), `1923c85` (Task 3).

Working tree clean at time of writing; the temporary real-roster harness was removed and
is confirmed absent from the tree.

---
*Phase: 01-draft-skeleton-on-a-real-url*
*Completed: 2026-08-04*
