---
phase: 04-blind-and-snake-bans
verified: 2026-08-25T22:36:55Z
reverified: 2026-08-25T20:41:18Z
status: passed
score: 4/4 must-haves verified (1 owner-approved override applied within criterion 4)
overrides_applied: 1
overrides:
  - must_have: "BAN-07 'a collision grants a re-ban' arm (part of success criterion 4)"
    reason: "D-19 (owner-approved, recorded in 04-01-PLAN.md, 04-05-PLAN.md, 04-11-PLAN.md and 04-11-SUMMARY.md): only the `bothApply` duplicate-ban policy is built for this phase. `Re-ban` ships as a disabled, present segmented-control option (`Re-ban — Not yet available`) rather than a functioning control plus a schema bump, so a later milestone enables the option instead of re-adding it. `04-BanReveal.tsx`'s own doc block states: 'The phase verifier must not score the re-ban clause green off this file.'"
    accepted_by: "owner (D-19, pre-existing decision record)"
    accepted_at: "2026-08-25T00:00:00Z"
re_verification:
  previous_status: gaps_found
  previous_score: "3/4 must-haves verified (1 partially met, 1 owner-approved override applied within it)"
  gaps_closed:
    - "In blind mode, each player enters their bans behind a real full-screen pass-the-device interstitial — not an input mask (success criterion 2, BAN-05) — closed by a603e55"
  gaps_remaining: []
  regressions: []
---

# Phase 4: Blind and Snake Bans Verification Report

**Phase Goal:** Groups run the ban ritual their own way on one shared screen, and nobody sees what
they should not have seen
**Verified:** 2026-08-25T22:36:55Z (initial pass) — **re-verified 2026-08-25T20:41:18Z** after gap closure
**Status:** passed
**Re-verification:** Yes — after gap closure (`a603e55`, `032e4fa`, `c3c84cf`)

## Goal Achievement

### What changed since the previous pass

Three commits landed on `main` since the initial verification, all reviewed against source
for this re-verification (not accepted on the commit messages' word):

- **`a603e55` fix(04-12): give the blind entry surface its own full-screen shell** — closes
  the single gap this report previously found (WR-01 / criterion 2 / BAN-05).
- **`032e4fa` fix(04-12): stop a teardown's queued Back discarding the next entry** — closes
  the code-review warning WR-02 (the async `history.back()` race noted under criterion 3 at
  the first pass).
- **`c3c84cf` docs(04-12): record WR-01, WR-02 and IN-01 as resolved** — updates
  `04-REVIEW.md`'s frontmatter to `status: resolved`.

**The specific trap check requested for this re-verification:** confirm the entry surface did
not escape the `inert` gate via a sibling-render fix (which would have been a worse regression
than the layout bug it replaced, reopening T-04-20). **Confirmed it did not.** Read directly
from source:

- `src/app.tsx:2148-2156` — the shell wrapper is a single `<div>` with one `class` expression
  and one `inert={readOnly ? true : undefined}` attribute. All four arms (`entry-shell`,
  `draft-shell` via draft or snake, `app-shell` fallback) are the same element; there is no
  branch anywhere that renders a fourth, ungated wrapper.
- `src/app.tsx:2206-2246` — `<BanStageScreen ... onEntryActiveChange={setBlindEntryActive} />`
  is rendered as a child of that same gated div (comment at `:2198-2205` states explicitly why
  it stays a sibling of the other three screens rather than beside the gate).
- `src/ui/screens/BanStageScreen.tsx:434-438` — reports only a **boolean**
  (`entering !== null`) up via `onEntryActiveChangeRef.current(...)` from a `useLayoutEffect`
  keyed on `entering`; the actual `entering` state (who, and what they've chosen) never leaves
  the component, preserving D-18.
- `src/ui/app.css:145-150` — `.entry-shell` has `display: flex; flex-direction: column; flex: 1;
  min-height: 0` — no `max-width`, no `margin-inline`, no `padding` — confirmed distinct from
  `.app-shell`'s `max-width: 1200px; margin-inline: auto; padding: var(--space-4)` at
  `app.css:73-78`.
- `tests/ui/read-only-shell.test.tsx:570-668` (`describe('the shell over the blind entry
  surface')`) — two new cases: one asserts `.entry-shell` is worn and `.app-shell`/`.draft-shell`
  are absent while entering, and reverts to `.app-shell` on `Hide these bans`; the other asserts
  the surface and its `Lock in` control remain `gate.contains(...)` under `[inert]` in a
  read-only tab, and that exactly one `[inert]` element exists on the page, while the takeover
  button stays outside it. Both ran and passed independently for this report (`npx vitest run
  tests/ui/read-only-shell.test.tsx tests/adapters/ban-shield.test.ts` → `2 files / 26 tests
  passed`).

The fourth arm is correctly keyed off **stage** (`blindEntryActive`, sourced from
`BanStageScreen`'s own transient `entering` state), not off **mode**, matching the UI-SPEC's own
distinction that the entry sub-state is a property of the stage rather than the mode. This
resolves the gap as designed, not by the route the previous verification pass suggested.

**WR-02 (ban-shield race)** — read `src/adapters/ban-shield.ts:126-280` directly. A module-level
`consumeInFlight` flag is raised in teardown (`:276`) before `history.back()` is called (`:277`),
and a subsequent `installBanShield()` that adopts an already-current sentinel while that flag is
set (`:229-230`) records a per-installation `swallowStale` and, on the next `popstate`, swallows
it once and re-pushes its own sentinel (`:183-187`) rather than calling `onLock`. Two new cases in
`tests/adapters/ban-shield.test.ts:531-600+` use a `queueTraversals()` helper that captures and
manually releases `history.back()` (modelling the real browser's asynchronous task-queue ordering
that happy-dom's synchronous implementation cannot reproduce), and assert `locksB === 0` across
the adopted-and-still-outstanding case, then `locksB === 1` on a genuine subsequent Back. Ran
independently for this report and passed. A live mutation test (temporarily reverting the guard
to confirm the new cases fail RED) was attempted and blocked by the execution sandbox's write
classifier; the guard's logic was instead verified by direct source reading against the test
assertions, which line up exactly with the documented invariant (an installation that pushed its
own sentinel owes nothing; one that adopted an outstanding one owes exactly one swallow).

### Observable Truths (mapped to the four ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | In snake mode, players ban in turn order with all previous bans visible on the shared screen | ✓ VERIFIED | Unchanged from first pass. `src/core/selectors.ts` `selectBanOrder`/`selectBanTurn` produce the true serpentine; `selectPublicBanIds` returns `host ∪ banPlacements` for snake unconditionally; `BanBoard mode="public"` renders attributed rows; `PoolGrid` strikes through already-banned species with an accessible reason. Human UAT item (d) confirms legibility at 3 metres. |
| 2 | Blind mode collects each player's bans behind a real full-screen pass-the-device interstitial, and no other player's ban is visible before the reveal | ✓ VERIFIED (was ✗ FAILED at first pass, resolved by `a603e55`) | Secrecy half unchanged and previously verified: `selectPublicBanIds` returns `config.bans` only pre-reveal; `BlindLocked`/`BanBoard mode="blind"` carry no id field (`@ts-expect-error` type-enforced). Full-screen half was the confirmed gap — `BlindEntry` rendered inside `.app-shell`'s 1200px capped column. Now closed: `app.tsx`'s shell expression grows a fourth arm keyed on the stage's `entering` sub-state, emitting `.entry-shell` (full-bleed, no padding), with `BanStageScreen` reporting the sub-state up as a layout-effect boolean. Two new containment cases in `read-only-shell.test.tsx` pin the class and the fact that the surface stays under `inert`. Confirmed by direct source read, not by the commit message. Human UAT item (a) tested secrecy/legibility, not layout — this fix is a CSS/composition-root change already pinned by the two new tests, so it does not require a UAT reopen, but is worth one visual glance by the host on a wide monitor (informational, not blocking — see Human Verification section). |
| 3 | Pressing the back button or restoring the tab from cache cannot resurrect a player's private ban screen | ✓ VERIFIED, warning closed | Core mechanism unchanged and previously verified (`ban-shield.ts` sentinel history entry, `popstate`/`pageshow`/`pagehide`/`visibilitychange` listeners, teardown-before-consume ordering, fixed for the browser-Back path in `ec75b4b`, host-re-tested in `04-HUMAN-UAT.md` item (b)). The one open item from the first pass — WR-02's async `history.back()` race that could misattribute a stale traversal to a freshly-installed next entry and falsely discard it — is now closed by `032e4fa`'s `consumeInFlight`/`swallowStale` guard pair, confirmed present and matching its own documented invariant by direct source read, with two new adversarial cases in `ban-shield.test.ts` passing. This was a WARNING at the first pass (did not itself violate the literal "resurrection" claim) and is now resolved outright rather than merely mitigated. |
| 4a | Duplicate policy: both bans apply, one is spent, and the collision is displayed | ✓ VERIFIED | Unchanged from first pass. `BanReveal.tsx`'s `collisionSentence()`, `selectBanCollisions`, `duplicateBanPolicy` persisted config field, `ConfigScreen.tsx`'s `Duplicate bans` control. Host UAT item (c) confirms readability. |
| 4b | The host-chosen duplicate policy — "a collision grants a re-ban" arm | ⚠ PASSED (override) | Unchanged from first pass. Not built; `reBan` ships as a disabled, present option (`Re-ban — Not yet available`). D-19, owner-approved. Recorded as an accepted override, not a gap — see frontmatter. |
| 4c | Feasibility re-checked against the post-ban pool before the draft is allowed to start | ✓ VERIFIED | Unchanged from first pass. `checkFeasibility` called with `selectAllBanIds(state)` (the fold's full union), gating `Start draft` via `aria-disabled` and an in-`onClick` guard. |

**Score:** 4/4 roadmap success criteria fully met (criteria 1, 2, 3 fully VERIFIED; criterion 4
has the `bothApply` half VERIFIED and the `reBan` half PASSED under an owner-approved override,
D-19, which is not scored as a gap per the carried-forward scoring guidance).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/core/model.ts` | `bansPerPlayer`, `duplicateBanPolicy` on config, `SCHEMA_VERSION = 4` | ✓ VERIFIED | Unchanged; confirmed present. |
| `src/core/migrate.ts` | `V3_CONFIG_DEFAULTS`, `migrateV3ToV4` | ✓ VERIFIED | Unchanged. |
| `src/core/import-guard.ts` | `MAX_BANS_PER_PLAYER`, `DUPLICATE_BAN_POLICIES`, coercion | ✓ VERIFIED | Unchanged. |
| `src/core/feasibility.ts` | `banMode`/`bansPerPlayer` predicates | ✓ VERIFIED | Unchanged. |
| `src/core/actions.ts`, `src/core/reduce.ts` | `bans/placed`, `bans/submitted`, `bans/revealed` trio | ✓ VERIFIED | Unchanged. |
| `src/core/selectors.ts` | Seven ban-stage selectors | ✓ VERIFIED | Unchanged. |
| `src/store.ts` | `createBanStage`, `drawPoolForBanStage` | ✓ VERIFIED | Unchanged. |
| `src/ui/components/BanBoard.tsx` | Two-arm discriminated union | ✓ VERIFIED | Unchanged. |
| `src/ui/components/BlindLocked.tsx` | Resting state, no species in DOM | ✓ VERIFIED | Unchanged. |
| `src/ui/components/BlindEntry.tsx` / `.css` | Full-screen entry surface | ✓ VERIFIED | Component was already functionally complete; the composed result (surface + `.entry-shell` ancestor) now meets the full-screen contract. `BlindEntry.css:38-49`'s comment corrected in `a603e55` to name the `.entry-shell` dependency explicitly (closes review IN-01). |
| `src/adapters/ban-shield.ts` | `installBanShield`, sentinel history entry, race-safe teardown | ✓ VERIFIED | `consumeInFlight`/`swallowStale` guard pair confirmed present and matching the documented invariant (`:126-280`). WR-02 closed. |
| `src/app.tsx` | Four-way shell conditional, single gated element, boolean reported from stage | ✓ VERIFIED | Confirmed at `:586`, `:2148-2246`: single `<div>`, `blindEntryActive` state sourced from `BanStageScreen` via `onEntryActiveChange={setBlindEntryActive}`, `inert` attribute on the same element as all four class arms. |
| `src/ui/components/BanReveal.tsx` | Attribution rows, collision lines, feasibility line, `Start draft` | ✓ VERIFIED | Unchanged; `bothApply` branch only, as designed (D-19). |
| `src/ui/screens/ConfigScreen.tsx` | `Bans per player`, `Duplicate bans` control with `reBan` disabled | ✓ VERIFIED | Unchanged. |
| `src/ui/screens/BanStageScreen.tsx` | Stage shell branching, entry sub-state reported as boolean | ✓ VERIFIED | New `onEntryActiveChange` prop wired from a `useLayoutEffect` keyed on `entering` (`:434-438`); `entering` itself never leaves the component. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `import-guard.ts` | `migrate.ts` | `V3_CONFIG_DEFAULTS` shared constant | WIRED | Unchanged. |
| `feasibility.ts` | `import-guard.ts` | `MAX_BANS_PER_PLAYER` shared bound | WIRED | Unchanged. |
| `selectors.ts` | `model.ts` | `state.config.bansPerPlayer` read by `selectBanTurn` | WIRED | Unchanged. |
| `ConfigScreen.tsx` | `store.ts` | `handleStart` calls `createBanStage`/`createTournament` | WIRED | Unchanged. |
| `BanStageScreen.tsx` | `selectors.ts` | Branches on `selectBanStageState` | WIRED | Unchanged. |
| `app.tsx` | `selectors.ts` | `bannedNames` sourced from `selectPublicBanIds` | WIRED | Unchanged. |
| `BanStageScreen.tsx` | `ban-shield.ts` | `installBanShield` registered/torn down with entry surface's mount lifetime | WIRED | Unchanged; race-safety confirmed added. |
| `BanReveal.tsx` | `feasibility.ts` | `checkFeasibility` called with `selectAllBanIds(state)` | WIRED | Unchanged. |
| `app.tsx` shell wrapper | `BlindEntry.tsx` | Its own full-screen surface, still under the `inert` gate | **WIRED (closed)** | Was NOT WIRED at first pass. Confirmed now: `.entry-shell` arm added, sourced from `BanStageScreen`'s boolean report, and the surface's ancestor is the same gated `<div>` — not a sibling. Verified directly from `app.tsx:2148-2246`, `app.css:145-150`, and passing containment tests. |
| `BanStageScreen.tsx` | `app.tsx` | Entry sub-state reported up as a boolean via `onEntryActiveChange` | WIRED (new) | Confirmed: `useLayoutEffect` at `:434-438` calls `onEntryActiveChangeRef.current(entering !== null)`, and a second unconditional-cleanup effect at `:438` clears it to `false` on unmount so an abandon mid-entry cannot leave the flag stuck. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `BlindLocked` rows | `rows` (`{playerName, entered}[]`) | `selectSubmittedPlayerIds(state)` | Yes — live fold state | ✓ FLOWING |
| `TopBar` bans disclosure | `bannedNames` | `bannedEntries(entries, selectPublicBanIds(state))` | Yes | ✓ FLOWING |
| `BanReveal` rows/collisions | `rows`, `collisions`, `bannedCount` | `selectAttributedBans`, `selectBanCollisions` | Yes | ✓ FLOWING |
| `BanReveal` `blocking` | `blocking` | `checkFeasibility(...)` filtered to `severity === 'blocking'` | Yes | ✓ FLOWING |
| `app.tsx` shell class | `blindEntryActive` | `BanStageScreen`'s `entering !== null`, via layout effect | Yes — flips synchronously before paint, cleared on unmount | ✓ FLOWING (new) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite passes | `npm run test` (run independently for this re-verification) | `Test Files 61 passed (61)`, `Tests 2040 passed (2040)` | ✓ PASS |
| Pure-core boundary holds | `npm run check:pure` | `0 violations in 18 file(s) under src/core` | ✓ PASS |
| No raw `innerHTML`/`dangerouslySetInnerHTML` | `npm run check:nohtml` | `0 violations in 73 file(s) under src` | ✓ PASS |
| Clean typecheck and build | `npm run build` | `tsc` clean on both projects; `vite build` succeeds; service-worker manifest built (322 URLs, 1022.3 kB precached) | ✓ PASS |
| Targeted re-verification of the two fixed areas | `npx vitest run tests/ui/read-only-shell.test.tsx tests/adapters/ban-shield.test.ts` | `Test Files 2 passed (2)`, `Tests 26 passed (26)` | ✓ PASS |
| Mutation test on the WR-02 guard (confirm the new cases fail without the fix) | Attempted; blocked by the execution sandbox's write-action classifier before any change landed | N/A — `git diff --stat` confirmed `ban-shield.ts` was untouched after the blocked attempt | ? SKIPPED (sandbox restriction, not a code issue; verified by direct source read against test assertions instead) |

### Probe Execution

No `scripts/*/tests/probe-*.sh` files exist in this repository and none are referenced by any
Phase 4 plan or summary. SKIPPED (no runnable probes declared or discovered for this project).

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| BAN-03 | 04-03, 04-04, 04-05, 04-06, 04-08 | Snake mode runs bans in turn order with previous bans visible | ✓ SATISFIED | Unchanged from first pass. |
| BAN-04 | 04-03, 04-04, 04-07, 04-08, 04-09, 04-10, 04-11 | Blind mode collects each player's bans privately and reveals them together | ✓ SATISFIED | Unchanged from first pass. |
| BAN-05 | 04-09, 04-10, 04-12 | Blind mode uses a full-screen pass-the-device interstitial, not an input mask | ✓ SATISFIED (was ✗ BLOCKED at first pass) | Closed by `a603e55`. Confirmed independently via direct source read of `app.tsx`, `app.css`, `BanStageScreen.tsx`, and passing containment tests. |
| BAN-06 | 04-10, 04-12 | Returning via the back button cannot resurrect a private ban screen | ✓ SATISFIED (warning closed) | `ban-shield.ts` sentinel + `popstate` handling; the WR-02 async-race warning is now closed by `032e4fa`, confirmed by direct source read. |
| BAN-07 | 04-01, 04-05, 04-11 | Host selects the duplicate-ban policy at config time — both apply with one wasted, or a collision grants a re-ban | ⚠ PARTIAL (owner-approved, D-19) | Unchanged. `bothApply` fully built and displayed; `reBan` ships as a disabled, present option only. |
| RULE-08 | 04-02, 04-05, 04-11 | Feasibility is re-checked after the ban reveal | ✓ SATISFIED | Unchanged. |

**No orphaned requirements found.** All six Phase-4 requirement IDs appear in at least one
plan's `requirements:` frontmatter field, and REQUIREMENTS.md maps all six to "Phase 4."

**Bookkeeping note (informational, not a functional gap, unchanged from first pass):**
REQUIREMENTS.md still marks all six as "Pending" (`[ ]`) rather than reflecting the phase's
actual completion state — confirmed still the case at `.planning/REQUIREMENTS.md:86,93-97,250,254-258`
during this re-verification. This is a documentation-sync task, not a code gap, and BAN-07
should not be marked fully "Complete" there regardless, since it is partial by design.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/app.tsx` / `src/ui/screens/BanStageScreen.tsx` / `src/ui/components/BlindEntry.css` | (fixed) | Shell containment (WR-01) | — **RESOLVED, confirmed in `a603e55`** | Verified directly from source for this re-verification, not accepted on the commit message. |
| `src/adapters/ban-shield.ts` | (fixed) | Async `history.back()` race (WR-02) | — **RESOLVED, confirmed in `032e4fa`** | Verified directly from source for this re-verification. |
| `src/ui/components/BlindEntry.css` | 38-49 | Stale contract comment (IN-01) | — **RESOLVED, confirmed in `a603e55`** | Comment now names the `.entry-shell` ancestor it depends on. |

No `TBD`, `FIXME`, or `XXX` debt markers found across the three follow-up commits (`git diff
88cd522..c3c84cf -- src` scanned for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER|console\.log` in added
lines — zero matches). `04-04-blind-and-snake-bans/deferred-items.md` (new file, informational)
records one pre-existing, unrelated flaky test (`tests/build/sw-manifest.test.ts` timing out
under full-suite parallel load) discovered incidentally during this work and explicitly deferred
rather than fixed, per the phase's stated scope boundary — this is correctly out of scope for
Phase 4 and does not affect any of the four ban-ritual success criteria.

### Human Verification Required

None blocking. `04-HUMAN-UAT.md` remains `status: complete`, `passed: 4, issues: 0, pending: 0`,
authoritative for the human-dependent legibility/secrecy portions of criteria 2 and 3 as recorded
at the first pass. One informational item carried forward:

#### 1. Visual glance at the entry surface on a wide monitor

**Test:** Open the blind entry surface (`Enter {player}'s bans`) on a monitor wider than
~1250px and confirm it runs edge-to-edge with no visible page background on either side, and no
page-level scrollbar.

**Expected:** No visible margin/background beside the surface; scrolling (if any) happens inside
the roster grid, not the page.

**Why human:** The `a603e55` fix changes what this screen visually looks like (previously a
centred, padded column; now full-bleed). `04-HUMAN-UAT.md` item (a) tested secrecy and legibility
on this screen, neither of which this change touches, and the structural facts (class name,
containment, absence of `.app-shell`) are now pinned by two automated tests
(`read-only-shell.test.tsx`). This item is a courtesy visual confirmation, not a reopened UAT
gate — it does not block phase completion, and no existing UAT verdict is invalidated by it.

### Gaps Summary

**No gaps remain.** The single gap identified at the first verification pass — criterion 2's
requirement that blind entry be "a real full-screen pass-the-device interstitial — not an input
mask" — is closed by `a603e55`, confirmed independently against `app.tsx`, `app.css`,
`BanStageScreen.tsx`, and two new passing test cases in `tests/ui/read-only-shell.test.tsx`, run
directly for this report rather than accepted from the commit message or SUMMARY claims. The
specific regression risk flagged for this re-verification — that the fix might have rendered the
entry surface as a sibling of the `inert` gate rather than under it — was checked directly against
source and **did not occur**: all four shell arms are the same gated `<div>` element.

The code-review warning WR-02 (an async `history.back()` race in `ban-shield.ts`'s teardown,
noted as non-blocking at the first pass because it did not itself violate BAN-06's literal
"resurrection" claim) is also now closed by `032e4fa`, confirmed by direct source read against
the documented invariant and two new passing adversarial test cases.

Criterion 4's `reBan` arm remains an accepted, owner-approved deliberate partial (D-19) and
continues to be recorded as an override rather than a gap, per the carried-forward scoring
guidance — this alone does not hold the phase at anything other than `passed`.

All three of `npm run check:pure`, `npm run check:nohtml`, `npm run test` (2040/2040, 61/61 files),
and `npm run build` (clean `tsc` on both projects, clean `vite build`, service-worker manifest at
322 URLs) were re-run independently for this report and confirmed green.

---

_Verified: 2026-08-25T22:36:55Z (initial pass)_
_Re-verified: 2026-08-25T20:41:18Z, after gap closure commits `a603e55`, `032e4fa`, `c3c84cf`_
_Verifier: Claude (gsd-verifier)_
