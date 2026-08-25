---
phase: 04-blind-and-snake-bans
verified: 2026-08-25T22:36:55Z
status: gaps_found
score: 3/4 must-haves verified (1 partially met, 1 owner-approved override applied within it)
overrides_applied: 1
overrides:
  - must_have: "BAN-07 'a collision grants a re-ban' arm (part of success criterion 4)"
    reason: "D-19 (owner-approved, recorded in 04-01-PLAN.md, 04-05-PLAN.md, 04-11-PLAN.md and 04-11-SUMMARY.md): only the `bothApply` duplicate-ban policy is built for this phase. `Re-ban` ships as a disabled, present segmented-control option (`Re-ban — Not yet available`) rather than a functioning control plus a schema bump, so a later milestone enables the option instead of re-adding it. `04-BanReveal.tsx`'s own doc block states: 'The phase verifier must not score the re-ban clause green off this file.'"
    accepted_by: "owner (D-19, pre-existing decision record)"
    accepted_at: "2026-08-25T00:00:00Z"
gaps:
  - truth: "In blind mode, each player enters their bans behind a real full-screen pass-the-device interstitial — not an input mask (success criterion 2, BAN-05)"
    status: failed
    reason: "04-UI-SPEC §3's shell table and §5 both require the blind entry surface to be its own full-screen surface, distinct from `.app-shell` and `.draft-shell` — 'the ban entry is the entire working area, not a masked field inside a visible screen.' The shipped code does not do this: `app.tsx:2105-2119` assigns exactly two shell classes for the whole `bans` screen (`draft-shell` for snake, `app-shell` for everything else), and `BanStageScreen.tsx`'s `blindLocked`/entering branch renders `<BlindEntry />` directly with no wrapper, so it mounts as a plain child of `.app-shell`. `app.css:73-78` caps `.app-shell` at `max-width: 1200px; margin-inline: auto; padding: var(--space-4)`. `BlindEntry.css` sets `min-height: 100vh` on `.blind-entry` but no `width`, no `max-width: none`, and no positioning that escapes the ancestor's cap — confirmed by `grep -rn \"blind-entry\" src/ui/**/*.css` returning only `BlindEntry.css` itself. On any viewport wider than ~1250px this renders visible page background on both sides of a centred column, and the nested `100vh` stacked on top of the ancestor's own padding produces an unintended page scroll on a surface the spec says should have none. This is the code review's WR-01, verified independently against `app.tsx`, `BanStageScreen.tsx`, `BlindEntry.css` and `app.css` for this report — it is a confirmed, shipped deviation from an explicit design contract, not a matter of degree. The human UAT pass (04-HUMAN-UAT.md item (a)) confirms secrecy and legibility at three metres on a specific ~24in 1080p rig, but that pass asked the host to read text and judge whether a Pokémon could be named — it did not ask the host to judge full-bleed layout or check for visible background margin at other viewport widths, so it does not close this gap."
    artifacts:
      - path: "src/app.tsx"
        issue: "Lines 2105-2119: only two shell classes exist (`draft-shell` / `app-shell`); no third branch for the blind entry sub-state, because `entering` is BanStageScreen's own component state and app.tsx cannot see it."
      - path: "src/ui/screens/BanStageScreen.tsx"
        issue: "Lines ~744-755 (`entering !== null` branch): `<BlindEntry>` renders unwrapped as a direct child of the ancestor `.app-shell` div, inheriting its 1200px cap and padding."
      - path: "src/ui/components/BlindEntry.css"
        issue: "`.blind-entry` (lines 31-44) declares `min-height: 100vh` and `padding` but no width/position rule that would let it escape a `max-width: 1200px` ancestor. The file's own doc comment ('The surface IS the screen... fills the viewport') is not true of the composed result."
    missing:
      - "Either render `BlindEntry` as a sibling of the `.app-shell`/`.draft-shell` wrapper in `app.tsx` (mirroring how `ImportConfirmDialog` and the `ConfirmDialog`s already render outside it), or give `.blind-entry` a full-bleed treatment that breaks out of the ancestor (e.g. `position: fixed; inset: 0; overflow-y: auto;` with its own padding replacing the inherited one)."
      - "A test asserting the shell class (or absence of `.app-shell`/`.draft-shell` containment) for the `entering` sub-state, mirroring the existing snake-shell assertion in `tests/ui/read-only-shell.test.tsx:515-529` — none currently exists for this state."
---

# Phase 4: Blind and Snake Bans Verification Report

**Phase Goal:** Groups run the ban ritual their own way on one shared screen, and nobody sees what
they should not have seen
**Verified:** 2026-08-25T22:36:55Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (mapped to the four ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | In snake mode, players ban in turn order with all previous bans visible on the shared screen | ✓ VERIFIED | `src/core/selectors.ts` `selectBanOrder`/`selectBanTurn` produce the true serpentine (1→2→3→4, 4→3→2→1); `selectPublicBanIds` returns `host ∪ banPlacements` for snake unconditionally; `BanBoard` `mode="public"` renders attributed rows in `BanStageScreen.tsx`; `PoolGrid` strikes through already-banned species with an accessible reason (`aria-disabled`, `src/ui/components/PoolGrid.tsx:961-974`); `TurnBanner` reads `selectBanTurn`. `tests/ui/read-only-shell.test.tsx:515-529` asserts the `.draft-shell` for a resumed snake ban stage and the turn-banner text. Human UAT item (d) (`04-HUMAN-UAT.md`) confirms the turn banner, pass headers and board rows are legible at 3 metres and the snake reveal reads correctly. |
| 2a | Blind mode collects each player's bans behind a screen where no other player's ban is visible before the reveal | ✓ VERIFIED | `selectPublicBanIds` (`src/core/selectors.ts:1053-1064`) returns `config.bans` only for blind before `bansRevealed`, regardless of submission count; `TopBar`'s bans disclosure (`src/app.tsx:1411-1416`) is fed exclusively from this selector, never `config.bans` alone or a raw count. `BlindLocked`/`BanBoard mode="blind"` receive `{ playerName, entered }` with no id field at all — a type-level guarantee (S2), confirmed by two `@ts-expect-error` directives in `tests/ui/ban-board.test.tsx:299,317`. Human UAT item (a): "Can you name any Pokémon from this screen? You must not be able to." — passed. |
| 2b | Blind mode's entry surface is a real full-screen interstitial, not an input mask | ✗ FAILED | See gap in frontmatter. `BlindEntry` mounts inside `.app-shell` (1200px cap, `app.css:73-78`), not on its own full-screen surface, contradicting `04-UI-SPEC` §3/§5's explicit contract. Code review WR-01, independently re-verified against source for this report. |
| 3 | Pressing the back button or restoring the tab from cache cannot resurrect a player's private ban screen | ✓ VERIFIED (with a noted warning) | `src/adapters/ban-shield.ts` pushes a sentinel history entry on install (`:135-141`), listens for `popstate`/`pageshow` (persisted)/`pagehide`/`visibilitychange`, and every handler calls `onLock`. Teardown (`:157-168`) removes every listener **before** consuming the sentinel via `history.back()`, matching the documented ordering requirement. `tests/adapters/ban-shield.test.ts` drives real `history.back()` (not synthetic `popstate` dispatch) and asserts both `pageshow` polarities (persisted vs. non-persisted). This was originally broken (Back left the app entirely — no history entry had ever been pushed) and was fixed in commit `ec75b4b` (confirmed as an ancestor of current HEAD `88cd522`), with a host re-test recorded in `04-HUMAN-UAT.md` item (b) path 3 as passed. **Warning (code review WR-02, independently assessed):** teardown's `window.history.back()` call is asynchronous in a real browser; if a host re-enters the *next* player's bans before that pending traversal resolves, the new `installBanShield()` call could misread the outgoing sentinel as still current and skip pushing a fresh one, and the delayed `popstate` could then fire into the new installation and discard the next player's in-progress entry. This does not resurrect a private screen (the actual BAN-06 secrecy concern) — if anything it over-discards — and the window is bounded by ordinary human reaction time between two host actions, which no test exercises either way. Treated as a WARNING, not a blocker to this criterion, because it does not violate the literal claim (resurrection), but it is a real, unresolved architectural gap worth tracking. |
| 4a | Duplicate policy: both bans apply, one is spent, and the collision is displayed | ✓ VERIFIED | `src/ui/components/BanReveal.tsx`'s `collisionSentence()` composes "X and Y both banned {species}. It is banned once; the second ban is spent." (2-player case) and the N-player generalisation; rendered from `selectBanCollisions` via `BanStageScreen.tsx`. Host UAT item (c) confirms the collision line is readable at 3 metres and names both players. `duplicateBanPolicy` is a persisted, bounded config field (`src/core/model.ts`, `src/core/migrate.ts`, `src/core/import-guard.ts`), and `ConfigScreen.tsx` renders a `Duplicate bans` segmented control with `bothApply` selectable. |
| 4b | The host-chosen duplicate policy — "a collision grants a re-ban" arm | ⚠ PASSED (override) | Not built. `DUPLICATE_BAN_POLICIES` includes `'reBan'` in the type union and `ConfigScreen.tsx:354` renders it as a disabled option labelled exactly `Re-ban — Not yet available`. No re-ban branch exists anywhere in `BanReveal.tsx`, `reduce.ts`, or `selectors.ts`. This is D-19, an owner-approved, pre-existing decision documented across three plan files and reaffirmed in `04-11-SUMMARY.md`'s own text: "The phase verifier must not score the re-ban clause green off this file." Override recorded in this report's frontmatter. |
| 4c | Feasibility re-checked against the post-ban pool before the draft is allowed to start | ✓ VERIFIED | `BanStageScreen.tsx:872` calls `checkFeasibility` (the same function used at config time, not a second arithmetic) with `banMode: 'hostBanlist'`, `bansPerPlayer: 0`, and `bannedIds: selectAllBanIds(state)` (the fold's full union, never `config.bans` alone). The first `blocking`-severity problem gates `Start draft` (`BanReveal.tsx`'s `aria-disabled` + in-`onClick` guard). A failed check shows the gate's own message plus `REVEAL_BLOCKED_EXIT` ("...abandon it and set it up again") and disables the button both visually and functionally. The pool draw itself (`drawPoolForBanStage`, `src/store.ts:429-462`) is a separate, later dispatch reading the same union, never a mutated `config.bans`. |

**Score:** 5 truths fully VERIFIED, 1 FAILED (2b), 1 owner-overridden (4b) = **3 of 4 roadmap success criteria fully met; criterion 2 has an unresolved code gap; criterion 4 has an accepted, deliberate partial.**

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/core/model.ts` | `bansPerPlayer`, `duplicateBanPolicy` on config, `SCHEMA_VERSION = 4` | ✓ VERIFIED | Confirmed present and copied in `copyConfig`. |
| `src/core/migrate.ts` | `V3_CONFIG_DEFAULTS`, `migrateV3ToV4` | ✓ VERIFIED | Confirmed; `duplicateBanPolicy: 'bothApply'` default present. |
| `src/core/import-guard.ts` | `MAX_BANS_PER_PLAYER`, `DUPLICATE_BAN_POLICIES`, coercion of out-of-union values | ✓ VERIFIED | Confirmed at lines 308, 674-700. |
| `src/core/feasibility.ts` | `banMode`/`bansPerPlayer` predicates, `bansPerPlayerNotPositive` etc. | ✓ VERIFIED | Confirmed; config-time gate is fully pessimistic about player bans. |
| `src/core/actions.ts`, `src/core/reduce.ts` | `bans/placed`, `bans/submitted`, `bans/revealed` action/reducer trio | ✓ VERIFIED | `canApply` guards for double-submission, pre-submission reveal, re-banning an already-banned species all present and reducer-tested. |
| `src/core/selectors.ts` | `selectBanOrder`, `selectBanTurn`, `selectBanStageState`, `selectPublicBanIds`, `selectAllBanIds`, `selectSubmittedPlayerIds`, `selectBanCollisions` | ✓ VERIFIED | All seven exported and used at their documented call sites; serpentine and secrecy behaviors match the doc comments. |
| `src/store.ts` | `createBanStage`, `drawPoolForBanStage` | ✓ VERIFIED | Both present with rollback-on-refusal shape; `drawPoolForBanStage` draws from the fold's union, bounded and guarded. |
| `src/ui/components/BanBoard.tsx` | Two-arm discriminated union, blind arm carries no ids | ✓ VERIFIED | Confirmed at source; type-enforced via `@ts-expect-error` tests. |
| `src/ui/components/BlindLocked.tsx` | Resting state with no species anywhere in DOM | ✓ VERIFIED | Props carry `{playerName, entered}[]` only; mounts `BanBoard mode="blind"`. |
| `src/ui/components/BlindEntry.tsx` | Full-screen entry surface | ⚠ ORPHANED CONTRACT | Component exists and is functionally complete (typeahead, chip list, capped grid, sticky footer, no `announce` import, no motion), but is NOT rendered as its own full-screen surface — see gap above. Exists and substantive, but the "full-screen" artifact-level contract (its own shell) is unmet. |
| `src/adapters/ban-shield.ts` | `installBanShield`, sentinel history entry, teardown ordering | ✓ VERIFIED | Confirmed at source; listener removal precedes sentinel consumption as documented. See WARNING re: WR-02's async race, noted under criterion 3. |
| `src/ui/components/BanReveal.tsx` | Attribution rows, collision lines, feasibility line, `Start draft` | ✓ VERIFIED | All present; `bothApply` branch only, as designed (D-19). |
| `src/ui/screens/ConfigScreen.tsx` | `Bans per player`, `Duplicate bans` control with `reBan` disabled | ✓ VERIFIED | Confirmed at lines 353-354, 528-533. |
| `src/ui/screens/BanStageScreen.tsx` | Stage shell branching on `selectBanStageState`, no `return null` remaining | ✓ VERIFIED | Confirmed; the `'reveal'` arm renders `BanReveal`, closing the last stub. `return null` appears 3 times elsewhere in the file (unrelated early-return guards, pre-existing pattern, not a stub per the review's own accepted note). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `import-guard.ts` | `migrate.ts` | `V3_CONFIG_DEFAULTS` shared constant | WIRED | Confirmed no re-declared defaults. |
| `feasibility.ts` | `import-guard.ts` | `MAX_BANS_PER_PLAYER` shared bound | WIRED | Same constant imported by both, per grep. |
| `selectors.ts` | `model.ts` | `state.config.bansPerPlayer` read by `selectBanTurn` | WIRED | Confirmed. |
| `ConfigScreen.tsx` | `store.ts` | `handleStart` calls `createBanStage` for blind/snake, `createTournament` for hostBanlist | WIRED | Confirmed at `ConfigScreen.tsx:1213-1281`. |
| `BanStageScreen.tsx` | `selectors.ts` | Branches on `selectBanStageState`, computes nothing | WIRED | Confirmed. |
| `app.tsx` | `selectors.ts` | `bannedNames` sourced from `selectPublicBanIds`, never `config.bans` directly during ban stage | WIRED | Confirmed at `app.tsx:1411-1416`. |
| `BanStageScreen.tsx` | `ban-shield.ts` | `installBanShield` registered/torn down with entry surface's mount lifetime | WIRED | Confirmed via effect lifecycle in `BanStageScreen.tsx` and `ban-shield.test.ts`. |
| `BanReveal.tsx` | `feasibility.ts` | `checkFeasibility` called with `selectAllBanIds(state)` | WIRED | Confirmed at `BanStageScreen.tsx:872-896`. |
| `app.tsx` shell wrapper | `BlindEntry.tsx` | Its own full-screen surface (per 04-UI-SPEC §3) | **NOT WIRED** | `BlindEntry` is not given a distinct shell; it inherits `.app-shell`'s 1200px cap. This is the WR-01 gap. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `BlindLocked` rows | `rows` (`{playerName, entered}[]`) | `selectSubmittedPlayerIds(state)` mapped through `BanStageScreen.tsx` seats | Yes — reads live fold state, updates as submissions land | ✓ FLOWING |
| `TopBar` bans disclosure | `bannedNames` | `bannedEntries(entries, selectPublicBanIds(state))` in `app.tsx` | Yes — stage-and-mode-aware, never a static or config-only source | ✓ FLOWING |
| `BanReveal` rows/collisions | `rows`, `collisions`, `bannedCount` | `selectAttributedBans`, `selectBanCollisions`, `bannedEntries(...).length` in `BanStageScreen.tsx` | Yes — computed from the log fold at render time | ✓ FLOWING |
| `BanReveal` `blocking` | `blocking` | `checkFeasibility(...)` result filtered to `severity === 'blocking'` | Yes — live re-check against `selectAllBanIds`, not a cached/static verdict | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite passes (2036 tests, 61 files) | `npm run test` | `Test Files 61 passed (61)`, `Tests 2036 passed (2036)` | ✓ PASS |
| Pure-core boundary holds | `npm run check:pure` | `0 violations in 18 file(s) under src/core` | ✓ PASS |
| No raw `innerHTML`/`dangerouslySetInnerHTML` | `npm run check:nohtml` | `0 violations in 73 file(s) under src` | ✓ PASS |
| Clean typecheck and build | `npm run build` | `tsc` clean on both projects; `vite build` succeeds; service-worker manifest built (322 URLs) | ✓ PASS |
| Phase-scoped tests specifically (selectors, reduce, ban-shield, blind-entry, ban-stage, blind-locked, ban-reveal, ban-board, feasibility, migrate, import-guard) | `npx vitest run <11 files>` | `11 passed (11)`, `784 passed (784)` | ✓ PASS |
| `BlindEntry`/blind-entry sub-state has no shell-containment test | `grep -n "app-shell\|draft-shell" tests/ui/blind-entry.test.tsx tests/ui/ban-stage.test.tsx` | No matches | ✗ FAIL (confirms the gap: no automated guard exists for the shell requirement WR-01 identifies) |

### Probe Execution

No `scripts/*/tests/probe-*.sh` files exist in this repository and none are referenced by any Phase 4 plan or summary. Step 7c: SKIPPED (no runnable probes declared or discovered for this project).

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| BAN-03 | 04-03, 04-04, 04-05, 04-06, 04-08 | Snake mode runs bans in turn order with previous bans visible | ✓ SATISFIED | Selectors, `BanBoard mode="public"`, `PoolGrid` inert cells, human UAT item (d). |
| BAN-04 | 04-03, 04-04, 04-07, 04-08, 04-09, 04-10, 04-11 | Blind mode collects each player's bans privately and reveals them together | ✓ SATISFIED | `selectPublicBanIds` blind-before-reveal branch, `BlindLocked`/`BanBoard mode="blind"` no-id guarantee, `BanReveal`'s simultaneous attributed reveal. |
| BAN-05 | 04-09, 04-10 | Blind mode uses a full-screen pass-the-device interstitial, not an input mask | ✗ BLOCKED (partial) | The "no top bar/turn banner/panes while entering" half is met (`BlindEntry` renders none of those). The "full-screen surface, not an input mask" half is NOT met — `BlindEntry` is nested in `.app-shell`'s 1200px, padded, centred column (WR-01). |
| BAN-06 | 04-10 | Returning via the back button cannot resurrect a private ban screen | ✓ SATISFIED | `ban-shield.ts` sentinel + `popstate` handling, fixed in `ec75b4b`, host-re-verified. WR-02's async-race warning noted but does not amount to resurrection. |
| BAN-07 | 04-01, 04-05, 04-11 | Host selects the duplicate-ban policy at config time — both apply with one wasted, or a collision grants a re-ban | ⚠ PARTIAL (owner-approved, D-19) | `bothApply` fully built and displayed; `reBan` ships as a disabled, present option only. Consistent across all three owning plans' frontmatter comments. |
| RULE-08 | 04-02, 04-05, 04-11 | Feasibility is re-checked after the ban reveal, since bans change the arithmetic | ✓ SATISFIED | `checkFeasibility` called post-reveal with the ban union; config-time pessimism about player bans also closes the `RangeError` crash path (Pitfall 2). |

**No orphaned requirements found.** All six Phase-4 requirement IDs (BAN-03 through BAN-07, RULE-08) appear in at least one plan's `requirements:` frontmatter field, and REQUIREMENTS.md maps all six to "Phase 4" with no additional IDs assigned to this phase left unclaimed.

**Bookkeeping note (informational, not a functional gap):** REQUIREMENTS.md still marks all six as "Pending" (`[ ]`) rather than reflecting the phase's actual completion state; this is a documentation-sync task, not a code gap, and BAN-07 should not be marked fully "Complete" there regardless, since it is partial by design. Separately, `04-05-SUMMARY.md`'s frontmatter lists `requirements-completed: [BAN-03, BAN-07, RULE-08]`, which overstates BAN-07 relative to `04-05-PLAN.md`'s own frontmatter comment ("BAN-07 is PARTIAL for the whole phase — D-19") and relative to `04-11-SUMMARY.md`, which correctly lists it under `requirements-partial`. This is a self-inconsistency between two SUMMARY files and worth a documentation fix, but the code itself is unambiguous about what shipped.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/app.tsx` / `src/ui/screens/BanStageScreen.tsx` / `src/ui/components/BlindEntry.css` | 2105-2119 / 744-755 / 31-44 | Shell containment does not match the design contract (WR-01) | 🛑 Blocker (for success criterion 2) | The phase's own "most important screen" ships as a centred, padded column rather than the specified full-bleed interstitial. |
| `src/adapters/ban-shield.ts` | 157-168 | Async `history.back()` in teardown not guarded against a stale sentinel read by a subsequent fast install (WR-02) | ⚠️ Warning | Narrow race window bounded by human reaction time; does not resurrect a private screen but could falsely discard the next player's in-progress entry under rapid succession. |
| `src/ui/components/BlindEntry.css` | 38-40 | Comment ("The surface IS the screen...fills the viewport") is inaccurate given WR-01 | ℹ️ Info | Stale contract comment; will mislead the next reader per the project's own convention on superseded comments (review IN-01). |
| `04-05-SUMMARY.md` frontmatter | `requirements-completed` line | Lists BAN-07 as completed rather than partial, inconsistent with 04-05-PLAN.md's own framing and 04-11-SUMMARY.md | ℹ️ Info | Documentation-only inconsistency; does not affect code behavior. |

No `TBD`, `FIXME`, or `XXX` debt markers found in any of the 27 files this phase modified. The three `PLACEHOLDER`-named constants found (`BAN_FIELD_PLACEHOLDER`, `MEGA_BAN_FIELD_PLACEHOLDER`) are legitimate HTML `placeholder` attribute values for typeahead inputs, not stub markers. `return null` appears 3 times in `BanStageScreen.tsx`, all pre-existing early-return guards for stage/state branches, not stubs — consistent with the "do not re-litigate" guidance for this phase.

### Human Verification Required

None outstanding. `04-HUMAN-UAT.md` is `status: complete`, `passed: 4, issues: 0, pending: 0`, dated 2026-08-25, and covers: (a) the locked-state secrecy check, (b) all three discard paths including the browser Back fix, (c) the reveal's readability including the collision line, and (d) the snake surfaces. That verdict is treated as authoritative for the human-dependent legibility/secrecy portions of criteria 2 and 3 per this verification's brief. It does not cover — and was never asked to cover — the full-screen layout question in the WR-01 gap above, which is a structural CSS/containment fact independently verifiable from source and is not a matter requiring a further human pass.

### Gaps Summary

Three of the four ROADMAP success criteria are fully and independently verified against the source
(criteria 1, 3, and the `checkFeasibility`/`bothApply` portions of criterion 4). Criterion 4's
remaining unmet portion — the "collision grants a re-ban" alternative — is a pre-existing,
owner-approved deliberate partial (D-19) and is recorded as an accepted override rather than a
gap requiring closure.

One genuine, unresolved gap remains: **criterion 2's requirement that blind entry be "a real
full-screen pass-the-device interstitial — not an input mask" is not met in the shipped code.**
`BlindEntry` is a fully-built, secrecy-correct component (no species leak, no motion, unmounts
rather than hides, no `announce` import), but it renders nested inside the same `.app-shell`
wrapper used by ordinary scrolling pages, capped at 1200px with page padding, rather than on its
own full-screen surface as `04-UI-SPEC` §3 and §5 explicitly specify. This was independently
confirmed against `app.tsx`, `BanStageScreen.tsx`, `BlindEntry.css`, and `app.css` for this report
(matching the phase's own code review finding WR-01) and is not closed by the human UAT pass,
which tested secrecy and legibility on one specific screen size rather than layout containment.
This is a structural fact about the composition root, not a cosmetic nit, and is the kind of gap
that should be closed with a small, targeted fix (render `BlindEntry` as a sibling of the shell
wrapper, or give `.blind-entry` a `position: fixed; inset: 0` treatment) before the phase is
considered fully done against its own literal success criteria.

A second, non-blocking item is worth tracking rather than closing immediately: the code review's
WR-02 identifies a real, if narrow, async race in `ban-shield.ts`'s teardown that could
misattribute a stale `history.back()` resolution to the wrong installation under rapid successive
entries. It does not violate BAN-06 as literally stated (nothing is resurrected), so it is recorded
as a warning rather than a gap blocking this phase.

---

_Verified: 2026-08-25T22:36:55Z_
_Verifier: Claude (gsd-verifier)_
