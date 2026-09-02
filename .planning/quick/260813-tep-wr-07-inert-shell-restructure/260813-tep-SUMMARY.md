---
phase: quick
plan: 260813-tep
subsystem: ui
tags: [inert, preact, tab-lock, accessibility, css-flexbox, security]

# Dependency graph
requires:
  - phase: 02-host-configured-draft-night
    provides: the read-only tab lock, `ReadOnlyBanner`, the config screen and `createTournament`, and the `.draft-region` gate this replaces
provides:
  - One `inert` gate wrapping every screen, closing T-02-15 / WR-07(b)
  - A Fragment shell root that keeps the live region, the read-only banner and all three dialogs outside the gate
  - Unconditional routing on adoption, closing WR-07(a)
  - A one-viewport draft layout rebuilt around the new box tree, with the viewport length on `#app`
  - Two regression tests that fail if either half is undone
affects: [02-security-re-audit, phase-03, any future work on the app shell or the tab lock]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "The read-only gate is one `inert` element wrapping every screen; the live region, the banner and the dialogs are its siblings, never its children"
    - "The viewport length lives on `#app`; the draft shell takes `flex: 1` of what the banner leaves"

key-files:
  created: []
  modified:
    - src/app.tsx
    - src/ui/app.css
    - src/ui/components/SplitPanes.css
    - src/ui/components/ReadOnlyBanner.tsx
    - src/ui/components/TopBar.tsx
    - src/ui/screens/ConfigScreen.tsx
    - tests/ui/read-only-shell.test.tsx
    - tests/ui/confirm-dialogs.test.tsx
    - tests/ui/multi-tab-handover.test.tsx
    - tests/ui/draft-panes.test.tsx
    - tests/ui/read-only-banner.test.tsx
    - tests/adapters/tab-lock.test.ts
    - tests/store-ownership.test.ts

key-decisions:
  - "The gate wraps every screen, not the shell root: covering the live region and the banner was the fault 02-REVIEW.md retracted its own recommendation over"
  - "`.app-shell` gains `width: 100%` — as a flex item with an auto cross-axis margin it is no longer stretched and would size to content"
  - "ConfigScreen's four confirms stay inside the gate; a confirm left open across a demotion exits via the banner, and hoisting four dialogs' state into `app.tsx` is not worth the transient case"
  - "Adoption routes unconditionally, which is safe only because the gate now covers the config screen; the two changes must not be separated"

patterns-established:
  - "Gate assertions are containment assertions in BOTH directions — what must be inside, and what must be outside"
  - "Live-region assertions are made on the region node and against the exported constant, never on `host.textContent`"

requirements-completed: [PERS-03, WR-07, T-02-15]

# Metrics
duration: ~35min
completed: 2026-08-14
status: complete
---

# Quick Task 260813-tep: WR-07 Inert Shell Restructure Summary

**One `inert` gate now wraps every screen instead of the draft region alone, with the live region, the read-only banner and all three dialogs moved outside it via a Fragment shell root — closing T-02-15's config-screen clobber without reintroducing the lockout that retraction was about.**

## Performance

- **Duration:** ~35 min of execution, plus the browser checkpoint
- **Tasks:** 3 (2 code, 1 human-verify checkpoint — approved)
- **Files modified:** 13 (3 in Task 1, 7 in Task 2, 3 in the Task 2 deviation)
- **Test count:** 877 across 43 files, up from 875 across 43

## Accomplishments

- **T-02-15 closed at the surface it was reachable from.** A read-only secondary tab can no longer reach `createTournament`. The landing screen and the config screen are inside the gate rather than siblings of it, so 02-SECURITY.md's step 4 — the host clicking `New tournament` in tab B — no longer happens.
- **The retracted fault was not reintroduced.** `LiveRegion`, `ReadOnlyBanner` and the three dialogs are siblings of the gated element. The read-only sentence still reaches the polite live region, and `Take over drafting here` is still focusable and clickable.
- **WR-07(a) closed too.** `adoptWhateverIsNewer` now routes to the draft screen on promotion and on a remote save alike, so no tab holds a document it does not render.
- **The one-viewport layout was rebuilt, not patched.** The banner left the element that has to be one viewport tall, so the viewport length moved to `#app` and the draft shell takes what is left.
- **Two regression tests, both confirmed RED first.** Each was run against the pre-fix `src/app.tsx` and observed to fail before being kept.

## Task Commits

1. **Task 1: One inert gate around the screens, and a shell layout that survives it** — `cb380bc` (fix)
2. **Task 2: Regression tests for the gate, and an audit of every inert reference** — `364e2dd` (test)
3. **Task 2 deviation: three comments the gate change made false** — `d34cc2a` (docs)
4. **Task 3: browser checkpoint** — no commit; verification only, approved by the developer

## The final shell structure

`App` returns a Fragment. In order:

```
<>
  <LiveRegion />                                    outside the gate
  <ReadOnlyBanner ownership={ownership} />          outside the gate
  <div class={draft ? 'draft-shell' : 'app-shell'}  THE GATE
       inert={readOnly ? true : undefined}>
    landing screen
    config status line
    config screen
    draft <h1>
    StorageBlocked
    <>  sticky-head  +  SplitPanes  </>             (the deleted .draft-region's children)
  </div>
  <ImportConfirmDialog />                           outside the gate
  <ConfirmDialog /> (abandon)                       outside the gate
  <ConfirmDialog /> (undo)                          outside the gate
</>
```

`.draft-region` is gone entirely — one gate rather than two. `src/app.tsx` carries exactly one `inert=` expression, on the element that also carries the shell class, and `undefined` rather than `false` so Preact removes the attribute outright.

Each of the three outside-the-gate placements is now recorded in the code as a requirement rather than a preference: `inert` strips a subtree from the accessibility tree, so a banner inside it silences its own announcement, a takeover button inside it is the hard lockout `tab-lock.ts`'s header calls worse than the race it prevents, and a dialog inside it renders, traps focus and refuses every click.

## The CSS rules that moved, and why

The box tree changed — the banner is no longer inside the element that is one viewport tall — so selectors could not simply be re-pointed.

| Rule | Before | After | Why |
| --- | --- | --- | --- |
| `#app` | *(did not exist)* | `display: flex; flex-direction: column; min-height: 100dvh` | The box that now absorbs the banner's height. The dynamic-viewport-unit rationale moved here from `.draft-shell`, since that is where the unit now lives. `min-height` rather than `height` so a long config form grows instead of clipping. |
| `.app-shell` | `max-width; margin-inline; padding` | same, plus `width: 100%` | See deviation 1 below. |
| `.draft-shell` | `height: 100dvh` | `flex: 1; min-height: 0` | Takes whatever the banner did not, which is how the board stays on screen in a secondary tab. Keeps `display: flex`, `flex-direction: column`, `padding`. |
| `.draft-shell > .draft-region` | `display: flex; flex-direction: column; flex: 1; min-height: 0` | replaced by `.draft-shell > .draft-panes { flex: 1; min-height: 0 }` | The element that now needs to grow is the panes root. Two classes beat `.draft-shell > *`'s one, so it wins on specificity rather than on whatever order Vite emits the stylesheets in. |
| `.draft-region { display: block }` | present, with the doctrine comment | deleted | Its two doctrines were re-homed onto `.draft-shell`, because the element carrying `inert` is now `.draft-shell` / `.app-shell`: no containing-block-creating property on either, since `.sticky-head` is a `position: sticky` descendant; and still no `[inert]` rule anywhere, because the UI-SPEC gives read-only no colour signal at all. |
| `SplitPanes.css` lines 29-36 | cross-referenced `.draft-region` | cross-references `.draft-shell` | The prohibition it names by file moved. |

The static viewport unit is still not written anywhere in `app.css`, in a declaration or in a comment. `100dvh` on `#app` is the same sanctioned viewport length `.draft-shell` carried before, moved rather than added.

## Test files: edited versus audited-and-left-alone

**Edited (7):**

- `tests/ui/read-only-shell.test.tsx` — the point of the fix. File header rewritten to describe the gate as it now is, keeping the paragraph recording what the file cannot prove. `draftRegion()` became `shell()`, querying `.draft-shell, .app-shell` by class so the attribute's absence is assertable too. Both existing cases updated, plus a new assertion in each that exactly one element in the tree carries `inert`. `announce('')` added to `beforeEach`. Two new cases added — see below.
- `tests/ui/confirm-dialogs.test.tsx` — line 511's `.draft-region` proxy for "the draft screen is rendered" became `.draft-shell`; header prose at line 12 corrected (it described the `Ctrl+Z` listener's position relative to the old region).
- `tests/ui/multi-tab-handover.test.tsx` — line 272, same proxy, same change.
- `tests/ui/draft-panes.test.tsx` — prose at line 181.
- `tests/ui/read-only-banner.test.tsx` — prose at line 159.
- `tests/adapters/tab-lock.test.ts` — prose at line 791.
- `tests/store-ownership.test.ts` — file header.

**Audited and left alone (4).** Each was read and confirmed to use "inert" as ordinary English about an unrelated subject:

- `tests/ui/pool-filter.test.tsx` (lines 301, 315) — the match-all toggle. Verified in `src/ui/components/FilterBar.tsx`: it takes the ARIA-only treatment (`aria-disabled`) and explicitly **not** the native attribute, so it never appears in a `[inert]` query. This matters — it is why the new "exactly one `[inert]`" assertion holds on the draft screen.
- `tests/ui/ban-mode.test.tsx` (line 362) — "an inert Escape".
- `tests/core/reduce.test.ts` (line 306) — an undo that targets a sequence recording no pick.
- `tests/build/sw-behaviour.test.ts` (line 137) — the committed service worker being inert until tokens are substituted.

**The two new cases:**

1. *"covers the landing screen, so a secondary tab cannot start a rival tournament"* — mounts a read-only secondary and stays on landing. Asserts the shell carries `inert`, that it **contains** `New tournament`, and that it does **not** contain `Take over drafting here`. Containment rather than a click, stated in a comment: happy-dom fires the handler regardless, so a click assertion would prove the opposite of what it claimed. Names 02-SECURITY.md's step 4 so a future reader can find the sequence.
2. *"leaves the polite live region outside itself, still carrying the sentence"* — asserts the `[role="status"][aria-live="polite"]` node is not contained by the shell, and that its own `textContent` equals the imported `READ_ONLY_SENTENCE`. Asserted on the region node, never on `host.textContent`, which carries the banner's visible paragraph and would pass with the region silenced.

**RED was proved, not assumed.** Both new tests plus the takeover case were run against the pre-fix `src/app.tsx` (via `git checkout HEAD~1 -- src/app.tsx`, then restored) and all three failed: `New tournament` was not under the gate, and the live region was inside it. That second failure is exactly the T-Q-01 fault the plan set out to avoid.

## Verification

- `npm run verify` exits 0 — `check:pure` 0 violations in 15 files, `check:nohtml` 0 violations in 59 files, 877 tests across 43 files passing, build clean.
- `grep -rn 'draft-region' src/ tests/` returns nothing.
- `src/app.tsx` contains exactly one `inert=` expression.
- `package.json` and `package-lock.json` unchanged.
- Task 3's browser checkpoint: approved. The developer ran all eight steps plus the live-region check.

## Decisions Made

- **The gate wraps every screen, not the shell root.** Following 02-REVIEW.md's carried-forward sequence rather than its retracted recommendation. The narrow fallback (`screen.name === 'landing'` routing plus an `isOwner()` gate on `handleStart`) was not taken: it needs a copy row that is not in the approved 02-UI-SPEC table.
- **Adoption routes unconditionally, and the code says why.** Safe only because a secondary tab can no longer be composing anything on the config screen. The comment in `adoptWhateverIsNewer` records that dependency explicitly, so the two changes are never separated — narrowing the gate back to the draft region would turn that line into a form-clobber.
- **`StorageBlocked` sits inside the gate and costs nothing.** `persistence.ts` records that a refused write deliberately does not raise `savingBlocked`, so a secondary tab never reaches the mid-draft branch at all. The boot-time warning was already owned by `LandingScreen`, which is inside the gate either way.

## Browser observation from the checkpoint (no fix needed)

Opening the same URL in a second tab lands on the **landing** screen, not the draft screen. This is expected and pre-existing, not a regression:

- `screen` is `useState<Screen>({ name: 'landing' })` at `src/app.tsx:234` — in-memory only, with no URL routing and no persisted screen. Every fresh tab boots to landing regardless of URL.
- What carries a secondary tab onto the draft board is the unconditional routing **this task added**: tab 1's next pick → save → broadcast → tab 2's `onRemoteSave` → `adoptWhateverIsNewer` → `setScreen({ name: 'draft' })`.
- Before this change the tab adopted the document and routed nowhere, which was WR-07(a). So the landing screen the developer saw is the "before" state that this fix resolves on the owner's next save.

The developer's screenshot confirmed the gate visually: the read-only banner and `Take over drafting here` render outside the gate and stay live, while `New tournament`, `Resume saved draft` and `Import JSON…` all sit inside it and are inert. That is T-02-15 closed at the surface it was reachable from.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `.app-shell` needed `width: 100%` after `#app` became a flex container**

- **Found during:** Task 1 (the CSS rebuild)
- **Issue:** Not in the plan's five CSS steps. Making `#app` a flex column turns `.app-shell` into a flex item, and per the Flexbox spec a flex item whose cross size is `auto` and which has an `auto` cross-axis margin is **not** stretched — `margin-inline: auto` absorbs the free space instead. Its used width would have become content-based, shrinking the landing and config screens toward the width of their longest line on a wide monitor and quietly discarding the 1200px cap.
- **Fix:** `width: 100%` on `.app-shell`, restoring the block-box behaviour the cap and the auto margins were written against. Recorded in the rule's comment as not-redundant-and-must-not-be-dropped, with the spec reason.
- **Files modified:** `src/ui/app.css`
- **Verification:** Browser checkpoint step 8 — the developer confirmed the banner and both shells render correctly.
- **Committed in:** `cb380bc` (Task 1 commit)

**2. [Rule 1 - Bug] Three source comments that the gate change made false**

- **Found during:** Task 2 (the `inert` audit, extended from `tests/` to `src/`)
- **Issue:** The plan's audit list covered `tests/` only, and its `draft-region` grep would not catch prose written as "draft region" with a space. Three comments under `src/` described the old structure, one of them actively wrongly: `ConfigScreen.tsx:963` said *"This screen has no `inert` region — that is the draft screen's problem"*, which is now the exact opposite of the truth and reads as a licence to re-open T-02-15. `TopBar.tsx:134` and `ReadOnlyBanner.tsx:30` named "the `inert` draft region", which no longer names anything.
- **Fix:** All three rewritten. ConfigScreen's now records that the screen and its four confirms are inside the gate, that a secondary tab cannot open them, and what happens to a confirm left open across a demotion. ReadOnlyBanner's gained the reason it is a sibling of the gate rather than a child, since that is the fault this change had to avoid.
- **Files modified:** `src/ui/screens/ConfigScreen.tsx`, `src/ui/components/TopBar.tsx`, `src/ui/components/ReadOnlyBanner.tsx`
- **Verification:** Comment-only, no behaviour change. `npm run verify` exits 0.
- **Committed in:** `d34cc2a` (separate commit so each commit's type stays accurate — the Task 2 commit is `test`, this is `docs`)

---

**Total deviations:** 2 auto-fixed (2 Rule 1 bugs — one layout, one misleading documentation)
**Impact on plan:** Both were necessary for correctness. The first prevents a silent layout regression the plan's steps would have shipped; the second removes a comment that instructs a future reader to undo the security fix. No scope creep — no new dependency, no new behaviour, `package.json` and `package-lock.json` unchanged.

## Known interaction, documented rather than fixed

**A ConfigScreen confirm left open across a demotion.** `ConfigScreen` renders its four confirms (`rerollPool`, `rerollOrder`, `clearBans`, `removePlayer`) at its own screen root, which is now inside the gate. In the state the gate was written for this costs nothing: a secondary tab cannot press `Re-roll pool` in the first place, so none of them can open there.

The one reachable case is a tab that opens a confirm **while it owns the lock** and is demoted before answering it — another tab presses `Take over drafting here`, this tab becomes secondary, and the dialog goes inert alongside the form behind it. `Dialog`'s Escape handler is on the dialog element rather than on `document`, so Escape cannot reach it either.

This is **not a lockout**: `Take over drafting here` is outside the gate, so the exit is one click. It was left as a recorded comment in `ConfigScreen.tsx` rather than fixed, because the fix — hoisting four dialogs' state out of the screen and into `app.tsx` — is a Rule 4 architectural change for a transient, recoverable state. Flagged here so a future reader can weigh it deliberately.

## Issues Encountered

None. The plan's `<current_structure>` block was accurate line for line, so no codebase hunt was needed.

## What the security re-audit will need

**Do not treat the following as done — `/gsd-secure-phase 2` must re-derive its verdict from the code itself.** Neither file was touched by this task.

`.planning/phases/02-host-configured-draft-night/02-SECURITY.md`:

- **T-02-15 re-dispositioned from `open` to `mitigate`**, with the new evidence: the gate is on the element wrapping every screen (`src/app.tsx`, one `inert=` expression), the nine-step sequence breaks at step 3/4 because `LandingScreen` and `ConfigScreen` are no longer siblings of the gate, and step 8's "nothing is adopted, tab B keeps its own tournament" can no longer arise because tab B cannot have built one.
- **`threats_open` to `0`.**
- **`status` to `verified`.**
- **The blocked sign-off items resolved.**
- The "What is NOT recommended" section is still correct as written and should be preserved — this fix did **not** move `inert` to the shell root, which is what that section forbids.

`.planning/phases/02-host-configured-draft-night/02-REVIEW.md`:

- **WR-07 marked fixed**, both halves: (a) the routing, and (b) the gate scope. Its "Recommended sequence, carried forward" was followed as written — steps 1 and 2, not the step 3 fallback.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 2's security gate is unblocked pending the re-audit. `block_on: [critical, high]` had exactly one HIGH open, and its mitigation is now in the code with a regression test on each half.
- The shell structure Phase 3 will build on is settled: screens go inside the gate, anything that must speak or be pressed while read-only goes outside it. `tests/ui/read-only-shell.test.tsx` fails if a future plan gets that wrong in either direction.
- No blockers introduced.

## Self-Check: PASSED

- `src/app.tsx` — FOUND, exactly one `inert=` expression, contains `setScreen({ name: 'draft' })` in `adoptWhateverIsNewer`
- `src/ui/app.css` — FOUND, contains `#app` with `min-height: 100dvh`
- `tests/ui/read-only-shell.test.tsx` — FOUND, contains the two new containment cases
- Commit `cb380bc` — FOUND
- Commit `364e2dd` — FOUND
- Commit `d34cc2a` — FOUND
- `grep -rn 'draft-region' src/ tests/` — 0 matches
- `npm run verify` — exit 0, 877 tests across 43 files
- `package.json` / `package-lock.json` — unchanged

---
*Quick task: 260813-tep-wr-07-inert-shell-restructure*
*Completed: 2026-08-14*
