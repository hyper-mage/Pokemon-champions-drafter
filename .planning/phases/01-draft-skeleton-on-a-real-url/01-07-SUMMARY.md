---
phase: 01-draft-skeleton-on-a-real-url
plan: 07
subsystem: undo-and-persistence
tags: [undo, log-prefix-refold, localStorage, autosave, pagehide, storage-canary, alertdialog, focus-trap]

requires:
  - 01-01 (check-pure-core.mjs, verify script)
  - 01-05 (tokens.css, app shell, LiveRegion, check:nohtml)
  - 01-06 (TournamentDoc, fold, dispatch, subscribe, the asserted prefix-refold equivalence)
provides:
  - src/core/undo.ts — canUndo, undoLast, lastPickAction; pure, and the whole of SHEL-06
  - src/store.ts — undo() and adoptTournament(); seq now derived from the log, not its length
  - src/adapters/persistence.ts — probeStorage, save, load, startAutosave, savingBlocked
  - src/ui/components/TopBar.{tsx,css} — the sticky Undo control and the sticky stack
  - src/ui/components/Dialog.{tsx,css} — the reusable alertdialog with a real focus trap
  - src/ui/screens/StorageBlocked.tsx — the D-13 acknowledge-required blocking screen
affects: [01-09, 01-10, 01-11]

tech-stack:
  added: []
  patterns:
    - "undo is a log-prefix re-fold, inheriting 01-06's asserted equivalence rather than adding a second mechanism"
    - "undoLast removes the last draft/pickMade, never the last log entry"
    - "seq is stamped from the highest seq in the log, because a removal makes log.length wrong"
    - "the persisted record is { schemaVersion, generation, savedAt, doc }, never the bare document"
    - "every localStorage call sits inside a try; the first failure is surfaced, never retried"
    - "stored bytes are untrusted: load() validates everything fold would dereference"
    - "the autosave adapter takes an injected port, so adapters never import the store"
    - "the canary runs in a state initializer, before the first paint"

key-files:
  created:
    - src/core/undo.ts
    - src/adapters/persistence.ts
    - src/ui/components/TopBar.tsx
    - src/ui/components/TopBar.css
    - src/ui/components/Dialog.tsx
    - src/ui/components/Dialog.css
    - src/ui/screens/StorageBlocked.tsx
    - tests/core/undo.test.ts
    - tests/adapters/persistence.test.ts
  modified:
    - src/store.ts
    - src/app.tsx

key-decisions:
  - "Undo removes the pick from the log rather than dispatching draft/pickUndone, which is the local-only optimization 01-06's asserted equivalence licenses; the compensating action stays in actions.ts because it is what a sync layer will transport"
  - "dispatch derives seq from the highest seq present rather than from log.length, because undo makes a length-derived seq collide the moment a removal is not at the end"
  - "the species display name is injected into undo() rather than cached in the store, so no display data lives outside the document"
  - "startAutosave takes an injected { subscribe, getDoc } port rather than importing the store, keeping adapters below the layer that orchestrates them"
  - "TopBar and TurnBanner stick as one wrapper element, because two elements both specified at top:0 pin on top of each other"
  - "the 4px danger rule is written as var(--space-1), following 01-06's TurnBanner precedent and the tokens-only rule, rather than as the literal the UI-SPEC prose uses"

requirements-completed: [SHEL-06, PERS-01, PERS-02]

duration: ~35 min
completed: 2026-08-05
---

# Phase 1 Plan 07: Undo and Persistence Summary

**The host can now unwind any misclick to any depth by button or by Ctrl+Z, come back after a refresh to exactly the draft they left, and — the part that actually matters — is told before the first pick when this browser was never going to save anything.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-08-05
- **Tasks:** 3 (all auto, no checkpoints)
- **Files created:** 9 · **modified:** 2
- **Tests:** 135 → 187 (+52)

## Task Commits

| Task | What | Commit | Type |
| --- | --- | --- | --- |
| 1 (RED) | Failing tests for canUndo, undoLast, purity, and the host-visible effects | `6b7f64f` | test |
| 1 (GREEN) | core/undo.ts, store.undo, TopBar, Ctrl+Z, app wiring | `6098191` | feat |
| 2 | persistence.ts, its tests, restore-before-create on boot | `11995a4` | feat |
| 3 | Dialog, StorageBlocked, the canary gate on the boot sequence | `3badd99` | feat |

Task 1 carried `tdd="true"` and the gate sequence is visible in the log: a `test(...)`
commit that fails at import, then a `feat(...)` commit that makes it pass. No REFACTOR
commit — nothing needed cleaning up after it went green.

## Accomplishments

### Undo is nine lines, because 01-06 did the hard part

`undoLast` finds the last `draft/pickMade`, splices it out, and returns a new document.
That is the entire implementation, and it is only defensible because plan 01-06 did not
merely assert the property it rests on — `tests/core/reduce.test.ts` checks at **every
one of the 15 cut points** of a complete draft that folding a log prefix equals the state
immediately before the removed action was applied.

So this plan inherited a proof rather than writing a mechanism. What is *not* in
`src/core/undo.ts` is the point:

| Not present | Why it would have been needed otherwise |
| --- | --- |
| Inverse patches | Re-folding ~300 actions is sub-millisecond, so depth costs nothing |
| A snapshot stack | A second copy of the truth is a second thing that can disagree |
| An `unapply` | A second transition function that must stay in step with the first |
| A redo stack | Popped actions would live outside the log — the one thing forbidden (D-10) |

`draft/pickUndone` remains defined and reducible in `actions.ts` and is deliberately not
dispatched. It is what a sync layer transports (sync rule 15); removing the entry locally
is the optimization the equivalence licenses. The day sync arrives, `undo` dispatches the
compensating action instead and every assertion in `tests/core/undo.test.ts` keeps its
meaning.

**`check:pure` now reports 0 violations in 8 files.** `undo.ts` reaches for nothing
ambient, and `tests/core/undo.test.ts` runs with zero mocks — stated at the top of the
file, because the day it needs a fake clock, an ambient value has leaked.

### "Remove the last pick", not "pop"

Written as a search for the last `draft/pickMade` rather than `log.pop()`. In Phase 1 the
two are identical — nothing follows a pick but another pick. In Phase 2 they are not, and
a `pop()` would then quietly remove a priority-card play while the button still read
`Undo last pick`. There is a test for it now, before the log has anything to interleave.

The same care applies at the other end: `lastPickIndex` uses the `isPickMadeAction`
payload guard, not a bare `type` comparison. A pick-shaped entry with no `monId` folds to
nothing, so offering to undo it would remove an action and change nothing on screen —
which matters because plan 01-10 folds untrusted imported logs.

### One `seq` bug found by writing the general case

`dispatch` stamped `seq: previous.log.length`. That is correct for as long as a log only
grows. Undo removes an entry, and the moment a removal is not at the end, the next
`seq` collides with one already in the log — and `seq` is precisely the identity
`draft/pickUndone` targets and the thing `DraftPick.seq` promises is stable. A duplicate
would retract the wrong pick.

`dispatch` now stamps one past the highest `seq` the log contains. Same number in every
Phase 1 case; correct in the cases Phase 2 introduces.

### Autosave, and an honest account of what it does not save

The persisted record is `{ schemaVersion, generation, savedAt, doc }` rather than the bare
document. `generation` is not read by anything in this plan; plan 01-09's ownership lock
and any future clobber detection read it, and recording it now means no saved tournament
needs migrating to gain it.

The `pagehide` flush is the reason this is trustworthy rather than merely frequent. A
300ms debounce has an open window by construction, and the tab closing inside that window
is the common case. This is the one moment where localStorage's synchronous API is the
feature: **a write started in `pagehide` completes**, whereas an async write issued at the
same instant can be lost. `visibilitychange` to hidden is registered alongside it, because
a backgrounded mobile tab can be killed without firing anything else.

**What this does not solve, stated as plainly here as it is in the file header:** Safari
deletes all script-writable storage for an origin after seven days without interaction,
and that hits localStorage and IndexedDB *equally* — switching engines does not dodge it.
`navigator.storage.persist()` is called once, on the first pick, and its result is
deliberately not stored, not rendered and not branched on, because it is advisory. The
durable answer is the JSON file in plan 01-10. Calling localStorage the backup and the
file the convenience would be exactly the wrong way round.

### The canary tests the thing that actually fails

`probeStorage()` writes a throwaway key, reads it back, **compares the value**, and
deletes it, all inside one try. The reason feature detection is refused is specific rather
than stylistic, and it is now written down in the file: testing for the presence of
`localStorage` returns **true** in precisely the cases that matter — private browsing,
disabled by policy, exhausted quota, embedded webviews — because the object is there and
only the write throws. A detection that passes in every failing case is worse than none,
because it gets trusted.

The read-back comparison catches the sixth case: environments that accept a write and
discard it, which is indistinguishable from success if you only call `setItem`. There is a
test for that one specifically.

The probe runs in a `useState` initializer, not an effect. An effect runs after the first
paint and the draft would flash up behind the warning.

### Stored bytes are treated as untrusted input

`load()` parses inside a try and validates everything the fold path dereferences without
asking: a `null` log entry crashes on `.type`, a config with no `players` array crashes in
`initialState`. The bar deliberately is not "is this a valid tournament" — that is plan
01-10's import guard, which will replace this — it is "will `fold` survive being handed
this".

Twelve wrong-shape inputs are covered by test, including a truncated record (what a write
that died with the tab leaves behind), a log holding `null`, and a record written by a
newer schema. All return `null`; none throw. A rejected record is also left on disk
untouched, so a later build with a migration can still read it.

### The blocking screen, and the focus work behind it

`Dialog` is a real primitive rather than a one-off overlay, because Phase 1 needs it twice
(here, and plan 01-10's import confirmation). Focus is the whole accessibility story of a
modal and all three parts are implemented rather than assumed: moved to the heading on
mount, trapped for both Tab and Shift+Tab, restored on unmount.

The trap has one subtlety worth naming. The heading holds focus on mount and carries
`tabIndex={-1}`, so it is deliberately outside the tab cycle — which means
`indexOf(activeElement)` returns `-1` for it. Treating `-1` as "before the first" is what
stops Shift+Tab from the heading walking straight out of the panel into a page the host
cannot see.

With `dismissible={false}` there is no close control and Escape is swallowed rather than
handled. A dialog dismissed by reflex has not been acknowledged.

The backdrop is fully opaque `--color-bg`, not a translucent scrim — there is no draft to
return to until the host acknowledges, and a half-visible board behind the warning invites
the exact misreading the warning exists to prevent.

**On success the canary renders nothing.** No banner, no toast, no confirmation. Silence
is the success state, per the UI-SPEC.

### Undo is styled to look boring, on purpose

The UI-SPEC is unusually direct about this and it survived into the CSS: D-08's one-click
no-confirm pick is only defensible because D-10's unlimited undo ships alongside it, so
undo must read as routine and reversible. Transparent fill, hairline border, plain label.
`grep -c "color-danger" src/ui/components/TopBar.css` returns **0**. No accent fill, no
warning glyph, no confirmation — undo *is* the confirmation step.

Disabled state carries three signals, only one of which is colour: native `disabled`,
`aria-disabled="true"`, and `opacity: 0.45`. The label does not change, because
`Undo last pick` still describes exactly what the control would do.

Ctrl+Z and Cmd+Z are bound at the document level and ignored when the event target is an
`INPUT`, `TEXTAREA`, `SELECT`, or `contenteditable` element. Phase 1 has no text field on
the draft screen; Phase 2 puts pool search in this same bar, and by then the check has to
already exist. Ctrl+**Shift**+Z is ignored rather than treated as undo, because it means
redo everywhere it means anything and there is no redo.

## Deviations from Plan

### 1. [Rule 3 - Blocking] TopBar and TurnBanner stick as one wrapper

- **Plan said:** insert TopBar into `app.tsx` above TurnBanner; TopBar is sticky at
  `top: 0` per the UI-SPEC layout shell.
- **The conflict:** `TurnBanner.css` (shipped by 01-06) is *also* `position: sticky;
  top: 0`. Two elements pinned to the same pixel means the higher `z-index` wins and the
  other pins invisibly beneath it — the banner is ~78px of `--text-display` and would have
  been almost entirely hidden behind the bar, defeating the one requirement stickiness
  exists for.
- **What shipped:** a `.sticky-head` wrapper in `app.tsx`, styled in `TopBar.css`. Both
  components keep their own rules; neither has to know the other's height, which a
  `top: 76px` offset would have required and which would have been wrong the moment the
  bar gained its second button in plan 01-10.
- **`display: flow-root` on that wrapper is load-bearing**, not decoration: it stops
  TurnBanner's bottom margin collapsing out of the pinned block, which would have left a
  transparent strip for the pool to scroll through.
- **Not chosen:** editing `TurnBanner.css`, which is outside this plan's file list.
- **Files:** `src/ui/components/TopBar.css`, `src/app.tsx` · **Commit:** `6098191`

### 2. [Rule 2 - Missing Critical] `dispatch` stamps `seq` from the log, not its length

- **Not in the plan.** The plan adds undo; it does not say what `seq` should be afterwards.
- **Gap:** `seq: previous.log.length` is correct only while the log is append-only. This
  plan makes removal possible. Phase 1 always removes the last entry so the numbers still
  agree — but the plan explicitly asked for `undoLast` to be written for the general case
  ("remove the last pickMade rather than pop"), and in that general case a length-derived
  `seq` duplicates one already in the log. `seq` is the identity `draft/pickUndone`
  targets, so a duplicate retracts the wrong pick.
- **Fix:** `nextSeq(log)` returns one past the highest `seq` present.
- **Files:** `src/store.ts` · **Commit:** `6098191`

### 3. [Rule 2 - Missing Critical] `tests/adapters/persistence.test.ts` added

- **Not in the plan's file list**, which names only `tests/core/undo.test.ts`.
- **Why:** the plan's own acceptance criterion — "`load()` returns null rather than
  throwing when given a JSON string that is valid JSON but the wrong shape" — is the
  T-01-05 mitigation, and the threat register marks it `mitigate`. A mitigation verified
  by reading the source is a claim. Every failure worth testing here (a `setItem` that
  throws, a write silently discarded, a truncated record) is one a developer machine never
  produces, so a stub is the only way to reach them.
- **29 tests.** The file states why it mocks at all, in contrast to `tests/core/`, which
  mocks nothing by construction.
- **Files:** `tests/adapters/persistence.test.ts` · **Commit:** `11995a4`

### 4. [Convention] The 4px danger rule is `var(--space-1)`, not the literal `4px`

- **Plan's acceptance criterion said:** the CSS contains
  `border-left: 4px solid var(--color-danger)`, quoting the UI-SPEC prose.
- **What shipped:** `border-left: var(--space-1) solid var(--color-danger);`
- **Why:** `CLAUDE.md` and the UI-SPEC both state the tokens-only rule — "no raw px for
  anything the token table covers" — and `--space-1` *is* 4px by declaration. Plan 01-06
  set this precedent in `TurnBanner.css` for the identical "4px left rule" and documented
  it. A literal here would have been the only raw length in the stylesheet.
- **Flagged for the verifier** so a grep for the literal is understood as intentional
  rather than missing.
- **Files:** `src/ui/components/Dialog.css` · **Commit:** `3badd99`

### 5. [Rule 2 - Missing Critical] `load()` validates more than "array log, object config"

- **Plan said:** validate that the parsed value is an object with an array `log` and an
  object `config`, and reject anything else.
- **Extended to also require:** `config.rounds` is a number, `config.players` is an array
  of objects, `rng` is an object, and **every log entry is an object carrying a string
  `type`**.
- **Why:** each addition is something the fold path dereferences without checking. A log
  holding `null` throws on `.type` inside `apply`; a config with no `players` throws inside
  `initialState`. The plan's stated bar would have let both through, and the failure mode
  is a white screen on boot with the autosave still in place to reproduce it on every
  reload.
- **Files:** `src/adapters/persistence.ts` · **Commit:** `11995a4`

### 6. [Rule 2 - Missing Critical] `visibilitychange` flushes alongside `pagehide`

- **Not in the plan**, which names `pagehide` only (correctly — it fires on bfcache entry
  and does not disqualify the page from it).
- **Gap:** a backgrounded mobile tab can be killed without firing anything else.
  `visibilitychange` to hidden is the last reliably-delivered moment on those platforms.
- Three lines, same synchronous flush. The older sibling event is not used anywhere.
- **Files:** `src/adapters/persistence.ts` · **Commit:** `11995a4`

### 7. [Design] `undo()` takes an injected name resolver; `startAutosave` takes a port

- **Plan said:** `undo()` announces "the species display name looked up by monId", and
  `startAutosave(store)` subscribes to the store.
- **What shipped:** `undo(resolveSpeciesName?)` and
  `startAutosave({ subscribe, getDoc })`, both injected from `app.tsx`.
- **Why, for the name:** species names belong to the roster snapshot, not to the
  tournament document. Caching a copy in `store.ts` would be a second piece of display
  state living outside the document — which is the exact objection D-10 raises against a
  redo stack. The UI already holds `entryById`; the resolver is one line there.
- **Why, for the port:** `adapters/` sits below the store. An adapter importing the module
  that orchestrates it inverts the layering the purity gate exists to protect.
- **Files:** `src/store.ts`, `src/adapters/persistence.ts`, `src/app.tsx`

### 8. [No change needed] `src/main.tsx`

Listed in Task 2's file list and left untouched. Components import their own CSS, so the
cascade order `main.tsx` documents already holds for `TopBar.css` and `Dialog.css`; and
the canary belongs in `App` where it can gate a render, not beside `render()` where it
could only throw. Recorded rather than silently skipped.

**Total deviations:** 7 auto-fixed (4 missing-critical, 1 blocking, 1 convention, 1
design) plus 1 no-op. **No Rule 4 architectural escalations.** No checkpoints — the plan
had none.

## Verification Evidence

```
npm run verify         → green
  check:pure           → 0 violations, 8 files      (was 7 before this plan)
  check:nohtml         → 0 violations, 27 files     (was 22)
  tests                → 187 passed  (was 135, +52)
  build                → index.js  39.65 kB / 14.94 kB gzip
                         index.css  6.34 kB /  1.77 kB gzip

runtime dependencies   → still exactly two (preact 10.29.8, @preact/signals 2.10.1)
```

**Every plan acceptance criterion:**

| Criterion | Result |
| --- | --- |
| `npx vitest run tests/core/undo.test.ts` exits 0 | 23 passed |
| `node scripts/check-pure-core.mjs src/core` exits 0 with undo.ts present | 0 violations, 8 files |
| A test asserts twelve successive undos reach the pre-first-pick state | confirmed |
| A test asserts `undoLast` does not mutate its input | confirmed, plus log-length and fresh-array tests |
| TopBar.tsx contains the literal `Undo last pick` | confirmed |
| TopBar.tsx contains `aria-disabled` and native `disabled` | both |
| `grep -n "color-danger" src/ui/components/TopBar.css` | no matches |
| Ctrl+Z handler checks INPUT, TEXTAREA and `isContentEditable` | confirmed (also SELECT, also Shift) |
| store.ts announces `Undid Round ` and ` is back in the pool.` | both present |
| persistence.ts exports probeStorage, save, load, startAutosave | all four |
| `grep -rn "localStorage" src/core/` | no matches |
| persistence.ts contains `pagehide`, and no quoted older sibling event | confirmed / no matches |
| Record includes `schemaVersion`, `generation`, `savedAt` alongside `doc` | confirmed by test |
| Every setItem/getItem is inside a try | confirmed |
| persistence.ts contains `navigator.storage.persist` | confirmed |
| `load()` returns null on valid JSON of the wrong shape | 12 shapes covered by test |
| `grep -n "'localStorage' in window"` | no matches |
| probeStorage does setItem, getItem, a comparison and removeItem in one try | confirmed |
| StorageBlocked.tsx contains the heading, the CTA, and the full body copy | all three, verbatim |
| Dialog.tsx contains `role="alertdialog"` and `aria-modal="true"` | both |
| Dialog.tsx has no Escape dismissal path when `dismissible` is false | confirmed |
| Dialog CSS carries the 4px danger left rule | as `var(--space-1)` — see Deviation 4 |
| `grep -rn "color-danger" src/ui/` | Dialog.css only, plus the tokens declaration and one app.css comment saying *not* to use it |
| `npm run build` and `npm run check:nohtml` exit 0 | confirmed |
| Forcing probeStorage to fail renders the blocking screen and no pool grid | see below |

**On the forced-failure check.** `probeStorage` was temporarily made to return
`{ ok: false }`, the build was re-run green, and the emitted bundle was confirmed to carry
the warning copy; the edit was then reverted and `git diff` confirms the file matches its
committed state. The *rendered* result was verified by reading the JSX rather than by
driving a browser: every draft surface — TopBar, TurnBanner, BoardGrid, PoolGrid — sits
inside a single `!storageBlockedAtBoot && load.status === 'ready'` branch, so there is one
condition to be wrong about rather than four. **This is the honest limit of the current
toolchain:** `vitest` runs with `environment: 'node'` and neither `jsdom`, `happy-dom` nor
`preact-render-to-string` is installed, so no automated assertion about rendered output is
possible today. Adding one is a devDependency decision outside this plan's scope — flagged
below for the roadmap.

## Threat Model Coverage

| Threat ID | Disposition | Status |
| --- | --- | --- |
| T-01-05 (corrupt, truncated or hand-edited record) | mitigate | **Done, and tested.** Parse inside try/catch, unrecognised `schemaVersion` rejected at both the record and document level, and every field `fold` dereferences validated. 12 wrong-shape inputs return null; none throw. A rejected record is left on disk rather than cleared. |
| T-01-07 (QuotaExceededError, including Safari private mode's first setItem) | mitigate | **Done.** Every write is inside a try; the first failure raises `savingBlocked` and the same D-13 screen, once. No silent retry — a failing write at 300ms intervals for a whole draft is the behaviour this replaces. |
| T-01-32 (host believes the draft is saved when it is not) | mitigate | **Done.** The canary runs before the first paint and blocks with an acknowledge-required screen; a mid-session write failure raises the same screen over the live board. Autosave is not started at all when the canary failed. |
| T-01-33 (tournament data readable from devtools) | accept | **Accepted as planned.** Friends on a shared screen; nothing in Phase 1 is secret. |
| T-01-34 (Safari's seven-day eviction) | accept | **Accepted, and documented rather than papered over.** `navigator.storage.persist()` is called once as the one available mitigation and treated as advisory. Written into the module header so the next reader does not mistake autosave for durability. |

No new threat flags. This plan adds no network surface and no new runtime dependency. It
does add the first storage surface in the project, and that surface is exactly the one the
threat register anticipated.

## Known Stubs

None. Every control this plan wires does what it appears to do, and the storage warning
appears only when storage genuinely failed.

Two things are deliberately *absent* rather than stubbed, both per the plan:

- **`generation` is written and never read.** That is not a stub — it is the field plan
  01-09's ownership lock and any clobber detection will read, recorded now so no saved
  tournament needs migrating to gain it. Writing it later would have been the mistake.
- **`Download JSON` / `Import JSON…`** are not in the TopBar. They are plan 01-10's, and
  there is no empty button waiting to be filled in.

## Issues Encountered

- **The worktree spawned at ancestor `80d64e3` rather than the stated base `42a48d6`.**
  The startup guard caught it and reset forward before any write; `git rev-parse HEAD` was
  confirmed at `42a48d6` before the first file was created. **Fourth plan in this phase to
  hit fresh-worktree base drift.** The guard has now paid for itself four times.
- **`node_modules` was absent in the fresh worktree.** `npm ci` first, as with 01-04,
  01-05 and 01-06.
- **One test in the RED commit had wrong arithmetic** (it expected a 5-entry fixture log to
  be 3 entries after a removal, not 4). Caught by the GREEN run and corrected in the same
  commit as the implementation — the assertion it makes is unchanged, only the count.
- **No DOM test environment exists**, so nothing in this plan asserts against rendered
  output. See the note under Verification Evidence.

## Orchestrator Follow-Ups

- **`STATE.md`, `ROADMAP.md` and `REQUIREMENTS.md` were not touched**, per dispatch
  instructions. On requirements, this plan completes:
  - **SHEL-06** — unlimited undo back to draft start, by button and by keyboard, disabled
    when there is nothing to undo, built on the existing prefix-refold equivalence.
  - **PERS-01** — debounced autosave with a synchronous `pagehide` flush; a refresh
    restores the exact document.
  - **PERS-02** — write-read-compare-delete canary before the draft renders, with an
    acknowledge-required blocking screen.
- **Nothing was pushed and no remote was contacted.** Four commits sit on
  `worktree-agent-a574e0c6744b5160c` on top of `42a48d6`.
- **`01-UI-SPEC.md` was not edited** (01-08 owns it this wave). One amendment is worth
  applying centrally: the layout shell says TopBar *and* TurnBanner are each
  `position: sticky; top: 0`, which cannot be true of both at once. The implemented
  resolution is a shared sticky wrapper; the spec should say so.
- **A `.gitattributes` is now wanted by six consecutive plans.** Every `git add` in this
  plan emitted `LF will be replaced by CRLF`. `* text=auto eol=lf` plus `*.png binary`.
- **A DOM test environment is now a real gap**, not a preference. Three surfaces in this
  phase are pure interaction — the focus trap, the disabled-undo state, and the canary
  gate — and none can be asserted today. `happy-dom` as a devDependency would cost nothing
  at runtime and the two-runtime-dependency constraint is untouched by it. Worth a roadmap
  decision before Phase 2 adds filters and a density toggle.
- **A restored document is not cross-checked against the current roster snapshot.** If a
  regulation rotates between sessions, a restored pick whose species left the roster
  renders with its id as the name and is filtered out of the available pool rather than
  crashing. Acceptable for Phase 1 — the document already carries `rosterVersion` and
  `rosterChecksum` for exactly this comparison, and plan 01-10's import guard is where the
  mismatch should be surfaced to the host.

## Next Phase Readiness

Ready. Plan 01-09 (ownership lock) and plan 01-10 (export/import) both inherit what they
need:

- `generation` is already written on every save, which is what the lock's clobber check
  reads.
- `Dialog` exists with a `dismissible` flag and a working focus trap, which is plan
  01-10's import-overwrite confirmation with different copy and a `danger` action.
- `adoptTournament(doc)` is the store-side seam an import lands on, and it re-folds rather
  than trusting the incoming state.
- `load()`'s shape validation is the skeleton of the import guard and is documented as the
  thing that guard replaces.
- `TopBar` is built to take more buttons: it is a flex row with a gap, and the secondary
  button styling is already a class rather than an element selector.

## Self-Check: PASSED

Files verified present on disk: `src/core/undo.ts`, `src/adapters/persistence.ts`,
`src/ui/components/TopBar.tsx`, `src/ui/components/TopBar.css`,
`src/ui/components/Dialog.tsx`, `src/ui/components/Dialog.css`,
`src/ui/screens/StorageBlocked.tsx`, `tests/core/undo.test.ts`,
`tests/adapters/persistence.test.ts`, `src/store.ts`, `src/app.tsx`.

Commits verified present in `git log`: `6b7f64f` (Task 1 RED), `6098191` (Task 1 GREEN),
`11995a4` (Task 2), `3badd99` (Task 3).

`git diff --name-status` against the base commit lists eleven paths, all of them this
plan's own, with **no deletions**. `01-UI-SPEC.md`, `STATE.md`, `ROADMAP.md` and plan
01-08's files are untouched. Runtime dependencies are unchanged at two.

---
*Phase: 01-draft-skeleton-on-a-real-url*
*Completed: 2026-08-05*
