---
phase: 01-draft-skeleton-on-a-real-url
plan: 09
subsystem: persistence
tags: [broadcastchannel, tab-lock, ownership, heartbeat, stale-detection, inert, happy-dom, preact]

requires:
  - 01-01 (check-pure-core.mjs and its BroadcastChannel forbidden token, verify script)
  - 01-05 (tokens.css, app shell, LiveRegion.announce, check:nohtml)
  - 01-07 (persistence.save/load, the `generation` counter written but never read until now, adoptTournament)
provides:
  - src/adapters/tab-lock.ts — createTabLock plus the module-level claimOwnership, requestTakeover, onOwnershipChange, isOwner, notifySaved, ownershipState, disposeTabLock
  - src/adapters/persistence.ts — save() gated on isOwner(), and loadIfNewer() for the live read-only view
  - src/ui/components/ReadOnlyBanner.{tsx,css} — the two contracted sentences and the single takeover CTA
  - src/ui/use-ownership.ts — the hook that reads ownership synchronously for the first paint
  - src/app.tsx — `inert` on the whole draft region while this tab is a secondary
affects: [01-10, 01-11, 02-sync]

tech-stack:
  added: []
  patterns:
    - "the banner explains and the save() gate guarantees; a rendering bug must never become a data-loss bug"
    - "the lock talks to a narrowed LockChannel port, so two instances share one synchronous fake bus in tests"
    - "a stale lock changes one sentence and never promotes; ownership only ever moves on a human click"
    - "onPromote fires while isOwner() is still false, so a reclaiming tab reloads before it can write"
    - "the `saved` message carries no generation — loadIfNewer() owns the comparison, and a number on the wire would be a second copy that could disagree"
    - "no lock engaged means isOwner() is true: the gate is a lock, not a kill switch"
    - "UI tests opt into happy-dom per file with a docblock override; src/core tests stay in environment: 'node' and structurally cannot reach a DOM"

key-files:
  created:
    - src/adapters/tab-lock.ts
    - src/ui/components/ReadOnlyBanner.tsx
    - src/ui/components/ReadOnlyBanner.css
    - src/ui/use-ownership.ts
    - tests/adapters/tab-lock.test.ts
    - tests/ui/read-only-banner.test.tsx
    - tests/ui/read-only-shell.test.tsx
  modified:
    - src/adapters/persistence.ts
    - src/app.tsx
    - src/ui/app.css

key-decisions:
  - "A stale lock never auto-promotes. It swaps one banner sentence and nothing else, because an auto-promote race between three tabs is a worse failure than one extra click"
  - "A clean `released` does not auto-promote either — it buys promptness, not inheritance. A silent takeover is the clobber with better manners"
  - "onPromote runs before the ownership flag flips, so a tab that sat read-only for ten picks reloads storage before isOwner() can return true (T-01-40)"
  - "The `saved` message deliberately carries no generation; loadIfNewer() already holds the comparison and a wire copy could disagree with the stored record"
  - "`saved` doubles as proof of life and clears a stale flag, because a tab that just wrote is alive by definition"
  - "The CTA label is identical in both banner states: a stale lock changes what is TRUE, not what the host can DO, and relabelling would imply a second kind of takeover that does not exist"
  - "`.draft-region` is deliberately styleless — no transform, filter or containment — because any of those would create a containing block and break the sticky head nested inside it"
  - "Ownership is exposed as a hook reading ownershipState() synchronously rather than as a signal, so a secondary never paints one frame of writable draft screen"

patterns-established:
  - "Adapters expose a plain listener set (onOwnershipChange), and the UI adapts it into a hook — adapters never import the UI's reactivity"
  - "A test double that can be muted as well as closed, so a wedged main thread and a dead tab are both expressible"

requirements-completed: [PERS-03]

duration: three dispatches over ~2h wall clock (one terminated by a provider quota limit)
completed: 2026-08-05
---

# Phase 1 Plan 09: Tab Ownership Lock and the Read-Only Tab Summary

**A second tab of the same tournament now boots read-only behind a `BroadcastChannel` write lock, explains itself in one sentence, hands the draft over on one click in either direction, and notices within six seconds when the tab that was drafting stops answering — without ever promoting itself.**

## Performance

- **Duration:** three dispatches, 14:47–15:10 local for the committed portion; the first dispatch's authoring time is not recoverable because it was terminated before it could commit
- **Completed:** 2026-08-05
- **Tasks:** 2 (1 auto, 1 human-verify checkpoint — approved by the user)
- **Files created:** 7 · **modified:** 3
- **Tests:** +39 (`tab-lock` 31, `read-only-banner` 6, `read-only-shell` 2) → **257 total**

## Task Commits

| Task | What | Commit | Type |
| --- | --- | --- | --- |
| 1 (rescued WIP) | tab-lock.ts, its test file, persistence gated on `isOwner` — 26/27 passing | `8d61651` | wip |
| 1 (resolved) | The failing stale-recovery test corrected, and strengthened | `2070f67` | test |
| 2 | ReadOnlyBanner, `inert` draft region, `saved` message, use-ownership, two DOM test files | `6cec5e0` | feat |
| — | UI-SPEC amendment applied by the orchestrator, not this plan | `11a8336` | docs |

`8d61651` is not a normal task commit and should not be read as one. See **Issues Encountered**.

## Accomplishments

### The gate is one line; everything else is explanation

`save()` in `persistence.ts` now opens with `if (!isOwner()) return false;`. That single
line is the entire guarantee, and the split is deliberate and load-bearing: the banner,
the `inert` attribute and the live region are all *explanation*. If the banner were the
mechanism, a rendering bug would become a data-loss bug. It cannot be, because nothing in
`ReadOnlyBanner.tsx` gates a write.

A refused write deliberately does **not** raise `savingBlocked`. That signal means "this
browser will not save your draft", and a read-only tab's situation is the opposite — the
draft is being saved, correctly, by the tab that owns it. Reusing the storage-failure
screen here would have told the host something false.

### Two failure modes were designed for, not one

The obvious failure is the clobber. The less obvious one is the deadlock: an owner that is
force-closed while holding the lock leaves the tournament stuck behind a tab that no longer
exists, which is *worse* than the race it prevented. So:

| Mechanism | Value | Why that value |
| --- | --- | --- |
| `HEARTBEAT_INTERVAL_MS` | 2000 | The owner announces it is alive |
| `STALE_THRESHOLD_MS` | 6000 | Three missed beats. One is a busy main thread; three is a tab that is gone. Short enough that the host reads it as the app noticing rather than the app being broken |
| `CLAIM_WINDOW_MS` | 250 | Ample for a sub-millisecond same-origin round trip even on a thread parsing the roster snapshot |

**A stale lock never auto-promotes.** It sets one flag, which swaps one sentence in the
banner, and stops. Auto-promotion would race three tabs for a prize that is literally
"permission to overwrite the file". The comment saying so sits directly in `markStale()`,
next to the code that does nothing.

`markStale` also guards against an early timer: it re-checks `now() - lastHeartbeatAt` and
re-arms for the remainder rather than trusting that the timer fired when it was asked to. A
throttled background tab is entitled to fire late, and a fake clock in a test can make it
fire at any point — neither should be able to declare a live owner dead.

### `released` buys promptness, not inheritance

`pagehide` broadcasts `released`, and it is tempting to let a survivor quietly take the
lock at that moment. It does not. A silent takeover is exactly the clobber this module
exists to prevent, only with better manners. What `released` actually buys is that a tab
still inside its claim window claims *immediately* instead of pinging into silence, and an
already-open secondary hears the truth at once rather than six seconds later. The click is
still required.

`release()` returns the lock to `idle` rather than to `secondary`, for two specific
reasons written into the source: a page restored from the back/forward cache re-runs the
claim protocol from a clean slate (`pageshow` with `event.persisted`), and `isOwner()`
stays true across teardown so persistence's own `pagehide` flush still lands regardless of
which listener the browser happens to call first. A secondary is left a secondary
precisely so that *its* flush does not land.

### The stale-document clobber, closed before the flag flips

T-01-40 is the subtle one: a tab that sat read-only for ten picks takes over and
immediately autosaves its stale in-memory copy. `becomeOwner()` calls `options.onPromote()`
**before** `status` becomes `'owner'`, so `isOwner()` is still false inside that callback
and nothing the handler triggers can reach `setItem` ahead of the reload. `app.tsx` passes
`loadIfNewer()` → `adoptTournament()` as that callback.

`loadIfNewer()` compares the stored `generation` — the field plan 01-07 wrote on every
save and deliberately never read. It is now read. `savedAt` would have been the obvious
alternative and is unusable, because it comes from two different tabs' clocks.

### A partition tie-break that needs no extra round trip

Two tabs booting inside the same 250ms window can both come out of it as owners.
`resolveOwnershipConflict` compares tab ids on receipt of a `claim` or `heartbeat` from
another self-declared owner, so both sides reach the same answer with no negotiation and
exactly one stands down.

A `takeover` is never tie-broken. A human clicked; the machine does not get a vote on
whether the click counted.

### Degradation is to the old behaviour, never to a locked-out app

`typeof BroadcastChannel === 'undefined'` — and a constructor that exists but throws, which
some embedded webviews do — both resolve to sole ownership plus one `console.info`. Once
per boot, not per heartbeat: a message per beat is noise that trains people to close the
console.

The same principle governs the module-level default. Until `claimOwnership()` is called,
`isOwner()` answers **true**. A build that never engages the lock must behave exactly as it
did before the lock existed, not silently stop saving. The gate is a lock, not a kill
switch.

### `inert`, and why it is asserted rather than grepped

The draft region carries `inert` when this tab is a secondary — one attribute covering
pointer, keyboard and focus. The hand-rolled alternative (`pointer-events: none` plus
per-element `disabled`) leaks in exactly the place that matters: Tab still walks into a
pool whose picks would be silently discarded. `grep -rn "pointer-events: none" src/ui/`
returns nothing.

`inert` is the kind of thing that gets dropped in a refactor and noticed by nobody, because
**a read-only tab looks identical with or without it** — the UI-SPEC forbids dimming the
pool. So `tests/ui/read-only-shell.test.tsx` mounts the real `App` against happy-dom with a
rival tab holding the lock, and asserts the attribute is present; then takes over and
asserts it is gone; then asserts a lone tab never has it. The test was confirmed
non-vacuous by removing the attribute from `app.tsx` and watching the suite fail.

`.draft-region` is styleless on purpose — `display: block` and nothing else. Any transform,
filter or containment would create a containing block and break the `position: sticky` head
nested inside it. There is no `[inert]` CSS rule and the comment in `app.css` says there
must not be one.

### One CTA label, two sentences

Read-only is the one state in the phase with **no colour signal at all**. The UI-SPEC's
"colour is never the only signal" rule is usually satisfied by adding a non-colour signal
alongside a colour one; here it is satisfied by having no colour to begin with. The signals
are the sentence and `inert`, both of which survive a monochrome display, a colour-blind
reader and a screenshot. A test asserts the rendered HTML contains no `danger` even in the
stale state, which is the tempting one to redden.

The button label is byte-identical in both states. A stale lock changes what is *true*, not
what the host can *do*; relabelling would imply a second, more forceful kind of takeover
that does not exist. The three contracted strings are pinned as literals in the test rather
than compared against the exported constants — a test comparing a constant to itself passes
just as happily after a typo.

`role="status"` rather than `role="alert"`: another tab holding the draft is a state to be
told about, not an emergency to be interrupted for.

## Deviations from Plan

### 1. [Rule 2 - Missing Critical] `src/ui/use-ownership.ts` added

- **Not in the plan's `files_modified`**, which names the banner, its CSS, and `app.tsx`.
- **Why:** two consumers need ownership state — the banner renders from it, and the shell
  needs it to decide `inert`. Threading it from one to the other would have made the
  banner the source of truth for a decision it does not own.
- **The load-bearing part is the initial value.** `useState(ownershipState)` reads the lock
  synchronously, rather than defaulting to "owner" and correcting in an effect. A tab that
  boots as a secondary must render read-only on its *first* paint; one frame of writable
  draft screen in a tab that cannot write is an invitation to click something that will be
  silently discarded.
- The effect re-reads on subscribe as well as subscribing, because the lock is engaged in
  an effect too — if it resolved between render and subscription there would be no second
  transition to wait for.
- **Files:** `src/ui/use-ownership.ts`, `src/app.tsx`, `src/ui/components/ReadOnlyBanner.tsx`
  · **Commit:** `6cec5e0`

### 2. [Rule 2 - Missing Critical] A `saved` message added to the protocol

- **The plan lists six message types** (`claim`, `heartbeat`, `takeover`, `released`,
  `ping`, `pong`) and separately requires that "while a tab is read-only it should still
  reflect the owner's picks… broadcast the document generation on each save". A seventh
  message type was needed to carry that.
- **It deliberately carries no generation.** The comparison already lives in
  `loadIfNewer()`, and a number travelling on the channel would be a second copy of it that
  could disagree with the stored record. `saved` is a nudge, not a datum: the receiver goes
  and looks. This is a narrower reading of the plan's wording than "broadcast the
  generation", and it is the reason the deviation is recorded rather than done quietly.
- **It also counts as proof of life** and clears a stale flag, for the same reason a
  heartbeat does — a tab that just wrote the tournament is alive by definition. Leaving the
  stale sentence up while the owner is demonstrably drafting would invite the host to take
  over a tab that never stopped working.
- `notifySaved()` is called from `save()` **after** the write, never before: a secondary
  told to re-read before the bytes landed would read the previous generation, conclude it
  was already current, and the nudge would be wasted on precisely the write it announced.
- **Files:** `src/adapters/tab-lock.ts`, `src/adapters/persistence.ts` · **Commit:** `6cec5e0`

### 3. [Rule 3 - Blocking] `loadIfNewer()` added to `persistence.ts`

- `load()` as shipped by 01-07 returns the stored document unconditionally. Both new call
  sites — promotion and remote-save — need "return it only if it is newer than what this
  tab last wrote", or a secondary would re-adopt an identical document on every beat.
- **Files:** `src/adapters/persistence.ts` · **Commit:** `6cec5e0`

### 4. [Rule 2 - Missing Critical] `pageshow` re-claim, and a `catch` around the constructor

- Neither is in the plan. `pageshow` with `event.persisted` re-runs the claim protocol
  after a back/forward-cache restore, without which a restored tab sits behind a banner it
  can never clear. The `try` around `new BroadcastChannel(...)` covers webviews that expose
  the constructor and refuse to build one — the plan anticipated only `typeof … ===
  'undefined'`.
- **Files:** `src/adapters/tab-lock.ts` · **Commit:** `8d61651`

---

**Total deviations:** 4 auto-fixed (3 missing-critical, 1 blocking). **No Rule 4
architectural escalations.** All four are enforcement or correctness, not scope.

## Contract Change Applied by the Orchestrator

The executor flagged that **no approved string exists for a *successful* takeover**. On
success the banner and its CTA both vanish and focus drops to `<body>`, so a sighted user
gets an obvious visual change and a screen-reader user gets silence. Every other transition
in the phase either keeps a visible element or already announces. The executor correctly
declined to invent copy for an approved spec.

The orchestrator applied the amendment in `11a8336`:

| Takeover confirmed (live region) | `You are now drafting on this tab.` |

**This string is not yet implemented.** Wiring it into the takeover path is outstanding
work for a later plan — see *Known Stubs*.

## The Failing Assertion: the Test Was Wrong, Not the Lock

The rescued WIP arrived with 26 of 27 tests passing. The failure was
`clears the stale flag if the owner comes back`, at what was then line 378.

**The test never made the owner go away.** Tab `a` was booted and heartbeating for the
entire window in which the test asserted `stale === true`, so `stale === false` was the
correct answer and the lock was behaving exactly as specified.

Three independent confirmations, in order of strength:

1. **Direct instrumentation.** The fake bus was instrumented to record traffic, and `a` was
   observed sending three heartbeats — at +2000, +4000 and +6000 ms — inside the window the
   assertion covered. Nothing had silenced it.
2. **The sibling test.** `stays fresh while the owner keeps beating` is arranged
   identically, asserts the *opposite*, and passed. Two identically-arranged tests cannot
   both be right about opposite outcomes.
3. **The test's own name.** It promised a departure ("if the owner comes back" presupposes
   the owner left) that its body never performed.

**The fix strengthened the assertion rather than loosening it.** `setMuted` was added to the
fake bus so a port can be struck dumb while its timers keep running. That is the shape of a
wedged main thread, and to a secondary it is indistinguishable from a dead tab — which is
the whole basis of stale detection: a secondary cannot tell a dead owner from a wedged one,
so it must treat silence itself as the signal and then take the words back when the owner
speaks again.

The test now mutes the owner, asserts the lock goes stale, unmutes, asserts a single
heartbeat withdraws the stale flag, **and** asserts ownership never moved
(`a.isOwner() === true`, `b.isOwner() === false`, `b.state().status === 'secondary'`).
Recovery is not a handoff. **Stale-clearing had no test at all before this** — the original
assertion, had it been "corrected" by deleting it, would have left the recovery path
entirely unproven.

The same `setMuted` seam is reused by `counts as proof of life, so it clears a stale flag`,
which covers the `saved`-message path added in Task 2.

## Human Verification — Task 2 (user-approved)

Task 2 is a `checkpoint:human-verify` gate. **The user ran the eight-step verification on
the live deployment and replied "01-09 approved".**

- **Verified against:** `https://hyper-mage.github.io/Pokemon-champions-drafter/`, confirmed
  by the orchestrator to be serving `assets/index-CgoG93HR.js`.
- **Approval is the user's.** This executor did **not** personally observe the read-only
  tab's blocked focus (step 3), the five-picks-after-takeover reload (step 6), or the
  abrupt-close stale banner (step 7). Every browser-level claim in this document rests on
  the user's report, not on anything this agent watched happen.

## Verification Evidence

```
npm run verify         → green (run by the orchestrator at base 11a8336)
  check:pure           → 0 violations, 9 files
  check:nohtml         → 0 violations, 31 files
  tests                → 257 passed
  build                → 43.87 kB / 16.46 kB gzip

runtime dependencies   → still exactly two (preact 10.29.8, @preact/signals 2.10.1)
```

`happy-dom` is a **devDependency**, added by the orchestrator in `5222985` rather than by
this plan, and the default test environment remains `environment: 'node'` so `src/core`
tests structurally cannot reach a DOM. UI tests opt in per file with
`// @vitest-environment happy-dom`.

**Task 1 acceptance criteria:**

| Criterion | Result |
| --- | --- |
| `npx vitest run tests/adapters/tab-lock.test.ts` exits 0 | 31 passed |
| `check-pure-core.mjs` exits 0; no `BroadcastChannel` in `src/core/` | 0 violations, 9 files; no matches |
| Exports `claimOwnership`, `requestTakeover`, `onOwnershipChange`, `isOwner` | all four, plus `notifySaved`, `ownershipState`, `disposeTabLock`, `createTabLock` |
| Heartbeat 2000, stale threshold 6000 | `HEARTBEAT_INTERVAL_MS = 2000`, `STALE_THRESHOLD_MS = 6000` |
| `save` returns early when `isOwner()` is false, with a test | `if (!isOwner()) return false;` — covered |
| Handles `typeof BroadcastChannel === 'undefined'` as sole ownership | confirmed, plus a `catch` on the constructor |
| Broadcasts `released` on pagehide | confirmed, via `installLifecycle()` |
| Ownership flips on takeover and can flip back | covered |
| A stale lock does NOT auto-promote | covered, and re-asserted by the strengthened recovery test |
| A reclaiming tab adopts a higher-`generation` document before writing | covered — `onPromote` fires while `isOwner()` is still false |

**Task 2 acceptance criteria:**

| Criterion | Result |
| --- | --- |
| Both exact sentences and the exact CTA label | pinned as literals in `read-only-banner.test.tsx` |
| `app.tsx` applies `inert` when secondary | asserted against the real `App` on happy-dom |
| `grep -rn "pointer-events: none" src/ui/` | no matches |
| `grep -rn "color-danger" ReadOnlyBanner.css` | no matches; a test also asserts no `danger` in rendered HTML |
| Steps 3, 5, 6, 7, 8 | **user-confirmed** — see above |
| `npm run build` and `npm run check:nohtml` exit 0 | green at base |

### The honest limit

**`inert` presence is proved; `inert` semantics are not.** The assertion runs against the
real `App` under happy-dom and was shown to be non-vacuous by mutating the attribute away
and watching the suite fail. But **happy-dom parses `inert` without implementing its
semantics** — it does not block focus or pointer events in that environment. That focus and
clicks are genuinely blocked is knowable only in a real browser, and rests entirely on the
user's approval of checkpoint step 3, not on any test in this repository.

This is stated in the test file's own header so the next reader does not mistake a passing
suite for browser proof.

## Threat Model Coverage

| Threat ID | Disposition | Status |
| --- | --- | --- |
| T-01-06 (two tabs both autosaving, last writer silently winning) | mitigate | **Done.** `save()` returns early unless `isOwner()`. A secondary never calls `setItem` for the tournament key. Covered by test through the real save path |
| T-01-40 (a demoted tab writing back a stale in-memory document) | mitigate | **Done.** `onPromote` runs before the ownership flag flips, so `loadIfNewer()` → `adoptTournament()` completes while `isOwner()` is still false. Covered by test, and by the user at checkpoint step 6 |
| T-01-41 (owner crashes, leaving others permanently read-only) | mitigate | **Done.** 2000ms heartbeat, 6000ms threshold, stale sentence and an already-enabled button. No auto-promote, deliberately. Covered by test, and by the user at checkpoint step 7 |
| T-01-42 (a same-origin script forging a `takeover`) | accept | **Accepted as planned.** Only same-origin code can open the channel, and that code could write `localStorage` directly. No privilege to escalate on an accountless static page |
| T-01-43 (BroadcastChannel unavailable in an embedded webview) | mitigate | **Done.** Falls back to sole ownership and logs once. Also covers a constructor that exists and throws |

No new threat flags. This plan adds no network surface and no runtime dependency. It adds
one new trust boundary — same-origin message passing between browsing contexts — and that
boundary is exactly the one the plan's register anticipated.

## Known Stubs

**One, and it is a contract that landed after the code.**

- **`You are now drafting on this tab.` is in the UI-SPEC and not in the source.** The
  string was added to the copywriting table by the orchestrator in `11a8336`, after
  `6cec5e0` had already shipped. A successful takeover therefore still announces nothing:
  the banner unmounts, its `useEffect` does not fire on the way out, and a screen-reader
  user gets silence. Nothing is broken by its absence — the takeover works — but the
  accessibility gap the amendment exists to close is still open. **Outstanding work for a
  later plan.**

Nothing else is stubbed. Every control this plan renders does what it appears to do, and
the banner appears only when this tab genuinely cannot write.

## Issues Encountered

- **The first executor was killed mid-plan by a provider session quota limit**, with
  `src/adapters/tab-lock.ts` (602 lines), `tests/adapters/tab-lock.test.ts` (610 lines) and
  the `persistence.ts` wiring (+62 lines) **entirely uncommitted**. The orchestrator caught
  it before worktree cleanup and committed the work verbatim as `8d61651`, with a message
  stating plainly that it was incomplete, which assertion failed and where, and that **no
  fix had been attempted**. Roughly 1,270 lines would otherwise have been lost to
  `git worktree remove`. The rescue commit is the reason the second dispatch had something
  to diagnose rather than something to rewrite.
- **That WIP commit is a `wip(...)` type deliberately** and should not be read as a task
  commit. It records a known-failing suite. The plan's Task 1 is only actually complete as
  of `2070f67`.
- **The one failing assertion was the test's fault, not the lock's** — the full diagnosis
  is its own section above. Worth restating as an issue because the tempting resolution
  (relax the assertion until it passes) would have shipped a correct lock with its recovery
  path unproven.
- **The worktree spawned at ancestor `80d64e3`** rather than the stated base `11a8336`, for
  this final dispatch. The startup guard caught it and reset forward before any write;
  `git rev-parse HEAD` was confirmed at `11a8336` and `src/adapters/tab-lock.ts` confirmed
  present before the first file was created. This phase has now hit fresh-worktree base
  drift on five plans.
- **No copy existed for a successful takeover.** Flagged rather than invented; resolved by
  the orchestrator amending the UI-SPEC. See *Contract Change* and *Known Stubs*.

## Orchestrator Follow-Ups

- **`STATE.md` and `ROADMAP.md` were not touched**, per dispatch instructions. On
  requirements, this plan completes **PERS-03** — a second tab cannot silently overwrite
  the draft, is told plainly why it is read-only, can take over on one explicit click in
  either direction, and detects a dead owner within six seconds without deadlocking or
  racing.
- **`01-UI-SPEC.md` was not edited by this dispatch.** The one amendment it needed was
  applied centrally in `11a8336` and is recorded above.
- **The takeover-confirmed announcement needs a plan.** It is one `announce()` call plus a
  decision about where the transition is detected — probably `useOwnership`, since the
  banner has unmounted by the time the transition completes. Small, but it is a live
  accessibility gap against an approved spec.
- **Nothing was pushed and no remote was contacted by this dispatch.**
- **A `.gitattributes` is now wanted by seven consecutive plans.** `* text=auto eol=lf` plus
  `*.png binary`.
- **`disposeTabLock()` clears the module-level listener set.** That is right for tests and
  right for teardown, but any future long-lived subscriber outside `App` must re-subscribe
  after a dispose. Worth knowing before Phase 2 adds a second consumer.

## Next Phase Readiness

Ready. Plan 01-10 (export/import) inherits the pieces it needs:

- `isOwner()` already gates every write, so an import performed in a read-only tab cannot
  reach storage — the guard exists before the feature that needs it.
- `loadIfNewer()` and `adoptTournament()` are the seam an import lands on, and both re-fold
  rather than trusting incoming state.
- `notifySaved()` means an import in the owning tab propagates to every open read-only tab
  without any further wiring.
- happy-dom is available, so 01-10's import-confirmation dialog can be asserted on a real
  DOM rather than by reading JSX — the gap 01-07 flagged is closed.

## Self-Check: PASSED

Files verified present on disk: `src/adapters/tab-lock.ts`, `src/ui/use-ownership.ts`,
`src/ui/components/ReadOnlyBanner.tsx`, `src/ui/components/ReadOnlyBanner.css`,
`tests/adapters/tab-lock.test.ts`, `tests/ui/read-only-banner.test.tsx`,
`tests/ui/read-only-shell.test.tsx`, `src/adapters/persistence.ts`, `src/app.tsx`,
`src/ui/app.css`.

Commits verified present in `git log`: `8d61651` (rescued WIP), `2070f67` (stale-recovery
test corrected), `6cec5e0` (banner, `inert`, `saved`), `11a8336` (orchestrator's UI-SPEC
amendment).

This dispatch changed exactly one file — this SUMMARY. No source, test, plan or UI-SPEC
edits; `STATE.md` and `ROADMAP.md` untouched; nothing pushed. Runtime dependencies remain
at two.

---
*Phase: 01-draft-skeleton-on-a-real-url*
*Completed: 2026-08-05*
