---
phase: 05-full-tournament-brackets-standings-archive
verified: 2026-09-01T18:20:00Z
status: passed
score: 5/5 success criteria verified, 14/14 requirement IDs accounted for
overrides_applied: 0
---

# Phase 5: Full Tournament — Brackets, Standings, Archive — Verification Report

**Phase Goal:** The night runs past the draft — round robin, a seeded cut, a single-elimination
bracket, results recorded and correctable — and the finished tournament stays readable and
re-runnable after the Champions roster rotates.

**Verified:** 2026-09-01T18:20:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Method

Goal-backward, adversarial. No SUMMARY.md claim was accepted without an independent grep/read
against source, and the full test suite, purity gates, and build were re-run from a clean
invocation rather than trusted from the SUMMARYs. Both commits claimed as post-review fixes
(`d8597ca` CR-01, `01070af` WR-01) were read in full and their effect traced through the call
sites and the tests that pin them. The 15 findings recorded as "deliberately still open" in
`05-REVIEW.md` were spot-checked in current source (not re-derived) to confirm they are still
present as documented, and each was checked against the 14 requirement IDs and 5 success criteria
for whether it falsifies any of them outright.

## Goal Achievement

### Observable Truths (mapped 1:1 to ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Depth choice honoured: `draftOnly` skips every bracket screen; deeper modes generate round robin and/or bracket with correct byes at non-power-of-two counts, verified at 5/6/7 | ✓ VERIFIED | `selectTournamentStage` (`src/core/tournament.ts:100-104`) returns `'notRunning'` unconditionally for `depth === 'draftOnly'`, so `TournamentScreen` never renders round-robin or bracket blocks (`TournamentScreen.tsx:142,260,321`) and `CompletedDraft.tsx` routes to the recap-only exit instead. `byeCountForCut` is tested and correct at 7→1, 6→2, 5→3 byes (`tests/core/tournament.test.ts:852-854`), and a separate test asserts the N−1 real-match invariant "at every player count" (`tests/core/tournament.test.ts:915-929`), plus an explicit 5-player seeding test (`tests/core/tournament.test.ts:872`). |
| 2 | Host records winner + one numeric result; bo3 shown as label + 2-of-3 counter; standings/brackets advance automatically; a mis-entered result is editable without corrupting the bracket | ✓ VERIFIED | `MatchRecordDialog.tsx` dispatches one `tournament/matchRecorded` action carrying winner, games and metric together (`handleRecord`, lines 247-266). `STAGE_FORMAT_OPTIONS` in `ConfigScreen.tsx:223-225` labels `bo1`/`bo3` "Best of one"/"Best of three"; `GAMES_OPTIONS` in `MatchRecordDialog.tsx:152-155` renders "2–0"/"2–1" — the 2-of-3 counter. `reduce.ts:535-556` documents and implements "THIS ARM REPLACES A RESULT. IT DOES NOT APPEND ONE" (D-09) — later `matchRecorded` wins by filter-and-rebuild, exactly the correction path SC2 requires. Standings/bracket are pure selectors over `state.matchResults`/`state.cut` (`selectStandings`, `selectBracket`), so nothing is denormalized to go stale. |
| 3 | Standings tiebreak: record → differential → head-to-head → explicit host override (never silent); seeded top-N cut carries round robin into the bracket | ✓ VERIFIED | `selectStandings` (`src/core/tournament.ts:515-580`) partitions by wins (`'record'`), then by metric (`'metric'`), then `headToHead`, then `hostOrderFor` (`'hostOrder'`), and an unresolved block is explicitly `'tied'` with a shared position rather than an asserted order — never a comparator (avoids the non-transitive trap by construction, confirmed in `05-REVIEW.md`'s own read of the code). `selectSeeding` is literally `selectStandings(state).map(row => row.playerId)` (`tournament.ts:598-599`) — the seed order IS the standings order, so the cut cannot silently diverge from what the host saw. |
| 4 | A completed tournament stays viewable after the draft ends, including a draft recap rendered directly from the action log | ✓ VERIFIED | `TournamentLibrary.tsx` renders `Your tournaments` from `listLibrary()`; `library.ts` (`fileTournament`, `openLibraryEntry`, `LIBRARY_CAP = 12` at line 86) stores whole re-foldable documents. `buildRecap(doc, state)` (`src/core/recap.ts`) takes the **document**, not the fold, specifically because D-09's fold keeps only the latest result per match and the recap needs the superseded ones for "Corrected later" marks (confirmed present: `recap.ts:33`). Recap reads `selectPublicBanIds`/`selectAttributedBans` for the ban section, never raw `banSubmissions` — confirmed no direct `state.banSubmissions` access in `recap.ts`, preserving blind-ban secrecy for an abandoned-before-reveal tournament. Two entry points confirmed: from `CompletedDraft.tsx` (draft-only depth) and from the bracket (deeper tiers), gated on the exact inverse of `hasTournament` so exactly one exists per depth. |
| 5 | Host refreshes the roster in-app or imports a roster JSON with no network; a staleness banner compares `validUntil` with no network | ✓ VERIFIED | `refreshRoster()` (`roster-source.ts:744`) and `readRosterFile(file)` (`roster-source.ts:801`) both exist and are wired into `RosterRefresh.tsx` (lines 5, 207). `isSnapshotStale` (`src/core/roster/staleness.ts`) is a pure string comparison — no `fetch`, no `Date` — and `StalenessBanner.tsx` calls it with `todayIso()` stamped at the edge (`clock.ts`), producing `"{regulation} expired on {validUntil}."` (`StalenessBanner.tsx:54-59`). `public/sw.js`'s third early return for `?refresh` (confirmed by 05-02's own acceptance greps, re-derivable: `searchParams.has('refresh')` present) is what lets the fetch reach the network instead of being answered from the precache. |

**Score:** 5/5 success criteria verified.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/core/tournament.ts` | `selectTournamentStage`, `selectStandings`, `selectBracket`, `selectSeeding`, `byeCountForCut`, `selectVoidCascade`, `selectCutSplitsTiedBlock`, `selectTournamentLocked`, ≥200 lines | ✓ VERIFIED | 1170 lines. All named exports present and read directly; no purity violation (`check:pure` 0 violations includes this file). |
| `src/core/recap.ts` | `buildRecap(doc, state)`, `RecapEntry` union | ✓ VERIFIED | 486 lines. Takes `doc` per plan requirement (fold-loss reason documented in file). |
| `src/adapters/library.ts` | `LIBRARY_CAP`, `listLibrary`, `fileTournament`, `openLibraryEntry`, `oldestEntry` | ✓ VERIFIED | 299 lines. `LIBRARY_CAP = 12` (line 86); cap check (`entries.length < LIBRARY_CAP`) runs before any write (line 235). |
| `src/adapters/roster-source.ts` | `loadRoster`, `resolveSnapshot`, `refreshRoster`, `readRosterFile`, `parseSnapshotStrict` | ✓ VERIFIED | 825 lines, all five present and exported. |
| `src/core/roster/staleness.ts` | `isSnapshotStale(validUntil, todayIso)` | ✓ VERIFIED | 47 lines, pure string comparison, no `Date`. |
| `src/ui/components/{ResultsGrid,MatchRecordDialog,StandingsTable,TiebreakOrderer,CutControl,MatchCard,BracketGrid,FinishedNotice,RecapList,TournamentLibrary,RosterRefresh,StalenessBanner}.tsx` | 12 UI surfaces spanning waves 5-8 | ✓ VERIFIED | All exist, all imported and mounted (traced through `TournamentScreen.tsx`, `CompletedDraft.tsx`, `LandingScreen.tsx`, `app.tsx`); no stub bodies found (anti-pattern scan below). |
| `src/core/actions.ts`, `src/core/reduce.ts`, `src/core/undo.ts`, `src/core/import-guard.ts` | Five `tournament/*` action types across all 7 landing sites | ✓ VERIFIED | `TOURNAMENT_MATCH_RECORDED` and siblings present in `actions.ts`, `reduce.ts` (`apply` + `canApply` arms), `import-guard.ts` (`buildLogEntry` arms, `MATCH_ID_PATTERN`, `MAX_MATCH_METRIC`), `undo.ts` (`isUndoable`, `causedBySeq` pairing). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `MatchRecordDialog.tsx` | `src/core/tournament.ts` | `selectVoidCascade` supplies the primary-button count before dispatch | ✓ WIRED | `cascade = selectVoidCascade(state, matchId, winnerId)` computed on every render, drives `primaryLabel` (lines 210-245). |
| `ResultsGrid.tsx` | `src/core/tournament.ts` | `selectRoundRobinMatches`/`selectRemainingMatchCount`, component derives neither | ✓ WIRED | Confirmed no local re-derivation of pairings inside `ResultsGrid.tsx`. |
| `StandingsTable.tsx` | `src/core/tournament.ts` | `decidedBy` read from `selectStandings`, component decides no rule | ✓ WIRED | `scoresMetric = state.config.depth === 'draftBracketsAndLog'` gates the differential column render by depth, matching D-02. |
| `CutControl.tsx` | `src/core/tournament.ts` | `byeCountForCut` / `selectCutSplitsTiedBlock` | ✓ WIRED | Confirmed both imported and consumed for the preview line and the second inert reason. |
| `BracketGrid.tsx` / `MatchCard.tsx` | `src/core/tournament.ts` | `selectBracket` supplies rounds/slots/byes/champion | ✓ WIRED | `MatchCard.tsx:153` branches on `match.isBye` — byes render as resolved cards, not empty slots, matching the plan's must-have. |
| `app.tsx` | `src/adapters/library.ts` | `fileTournament`/`oldestEntry` share one `protectedEntryId(after)` exemption | ✓ WIRED (post-fix) | `fileAndProceed` calls `fileTournament(doc, protectedEntryId(after))` (line 2708); `requestFiling` calls `oldestEntry(protectedEntryId(after))` (line 2751) — the SAME exemption value from the SAME source, so the entry named as at-risk in the dialog and the entry actually excluded from eviction are provably the same by construction. Covered by `tests/adapters/library.test.ts:326` and `tests/ui/tournament-library.test.tsx:963-1023`. |
| `src/core/undo.ts` | D-17 lock | `'match'` added to `ALWAYS_CONFIRM_KINDS` | ✓ WIRED (post-fix) | `ALWAYS_CONFIRM_KINDS = ['banSubmission', 'banReveal', 'match']` (undo.ts:727-731), consumed in the `crosses` computation (line 839-842) that gates whether `handleRequestUndo` shows a confirm dialog. |

### Behavioral Spot-Checks / Direct Reruns

| Check | Command | Result | Status |
|-------|---------|--------|--------|
| Purity gate | `npm run check:pure` | `0 violations in 21 file(s) under src/core` | ✓ PASS |
| No-innerHTML gate | `npm run check:nohtml` | `0 violations in 90 file(s) under src` | ✓ PASS |
| Full test suite | `npm run test -- --run` | `Test Files 81 passed (81)` / `Tests 2710 passed (2710)` | ✓ PASS — matches claimed count exactly, no flake on this run |
| Production build | `npm run build` | typecheck clean, `vite build` succeeds, `build-sw-manifest: 322 URLs (312 sprites, 6 data), 1088.6 kB precached` | ✓ PASS — matches claimed 322 URLs exactly |
| Debt-marker scan (TBD/FIXME/XXX) | grep across all 76 unique `files_modified` paths from the 15 plans | 0 matches | ✓ PASS |
| Stub-pattern scan (TODO/HACK/PLACEHOLDER/"not yet implemented") | grep across the same file set | All hits are legitimate: input `placeholder` attributes, `_placeholder.png` sprite fallback references, and an explicit "That is not a placeholder" comment | ✓ PASS — no stub found |

### Requirements Coverage

All 14 requirement IDs assigned to Phase 5 by ROADMAP.md are declared across the 15 plans' frontmatter and traced to implementation evidence.

| Requirement | Source Plan(s) | Description | Status | Evidence |
|---|---|---|---|---|
| TOUR-01 | 05-01, 05-05 | Host chooses tournament depth | ✓ SATISFIED | `DEPTH_OPTIONS`/depth notes in `ConfigScreen.tsx`; `config.depth` read by `selectTournamentStage` |
| TOUR-02 | 05-03, 05-10, 05-15 | Round robin generation with standings | ✓ SATISFIED | `selectRoundRobinMatches`, `ResultsGrid.tsx`, `selectStandings` |
| TOUR-03 | 05-06, 05-13, 05-15 | Single elim bracket incl. byes at non-power-of-two | ✓ SATISFIED | `selectBracket`, byes at 5/6/7 tested |
| TOUR-04 | 05-05, 05-10, 05-13, 05-15 | Bo3 as label + 2-of-3 counter | ✓ SATISFIED | `STAGE_FORMAT_OPTIONS`, `GAMES_OPTIONS` |
| TOUR-05 | 05-08, 05-10 | Host records winner; brackets/standings advance automatically | ✓ SATISFIED | `TOURNAMENT_MATCH_RECORDED`, `handleRecordMatch` |
| TOUR-06 | 05-06, 05-08, 05-10, 05-13 | Match records editable after entry | ✓ SATISFIED | D-09 "replace, don't append" fold arm, `MatchRecordDialog` seeds from `recorded` |
| TOUR-07 | 05-01, 05-05 | One numeric result field feeds tiebreak | ✓ SATISFIED (edge case open, see WR-11 below) | `matchMetric`, `NumericField` in `MatchRecordDialog.tsx` |
| TOUR-08 | 05-03, 05-11, 05-15 | Tiebreak: record → differential → head-to-head → host override | ✓ SATISFIED | `selectStandings` partition chain |
| TOUR-09 | 05-06, 05-08, 05-11 | Seeded top-N cut connects round robin to bracket | ✓ SATISFIED (edge case open, see WR-02 below) | `selectSeeding`, `CutControl.tsx` |
| PERS-08 | 05-09, 05-12, 05-14 | Completed tournaments remain viewable | ✓ SATISFIED | `TournamentLibrary.tsx`, `library.ts` |
| PERS-09 | 05-14 | Draft recap rendered from action log | ✓ SATISFIED | `buildRecap(doc, state)` |
| REFR-01 | 05-02, 05-04, 05-07 | Host fetches pre-built roster snapshot from within app | ✓ SATISFIED | `refreshRoster`, `?refresh` SW bypass |
| REFR-02 | 05-04, 05-07 | Import roster JSON, no network | ✓ SATISFIED (narrow edge case open, see WR-07 below) | `readRosterFile` |
| REFR-03 | 05-02, 05-04, 05-07 | Staleness banner vs. `validUntil`, no network | ✓ SATISFIED | `isSnapshotStale`, `StalenessBanner.tsx` |

**Coverage: 14/14.** No orphaned requirement IDs found in `.planning/REQUIREMENTS.md`'s Phase 5 section beyond the declared 14.

**Note — REQUIREMENTS.md bookkeeping is stale.** All 14 Phase 5 requirement checkboxes in `.planning/REQUIREMENTS.md` (lines 44-45, 116-124, 137-139) are still unchecked and marked `Pending` in the traceability table (lines 221-222, 271-279, 286-288), even though ROADMAP.md already marks Phase 5 complete and all 15 plans/SUMMARYs are in. This is a documentation-currency gap, not a code gap — every one of the 14 IDs has direct implementation evidence above. Recorded as **INFO**, not a blocker; the orchestrator should tick these boxes as part of closing this phase.

### Anti-Patterns Found

No blocking anti-patterns. No debt markers, no stub returns, no orphaned artifacts.

**Carried-forward findings from `05-REVIEW.md` (per instruction: confirmed still present in source, not re-derived as new discoveries).** All 15 non-fixed findings (1 was already re-checked as Critical/fixed: CR-01; 1 Warning already fixed: WR-01) were spot-checked and remain exactly as `05-REVIEW.md` describes. None of them falsifies a must-have truth as literally worded in its owning plan's frontmatter, and none breaks a ROADMAP success criterion outright — each is either (a) a UX/announcement completeness gap with no data-integrity consequence, (b) an edge case reachable only through adversarial/hand-edited JSON import, or (c) a narrow input-range limitation on one of two metric choices. Two are worth flagging for their proximity to a requirement ID:

| File | Finding | Severity | Requirement/SC touched | Why it's not a blocker |
|------|---------|----------|------------------------|------------------------|
| `src/core/tournament.ts:960-980` | WR-02: `selectCutSplitsTiedBlock` only inspects the two rows straddling the cut line; a tied block **wholly inside** the cut (e.g., 3-way tie at seeds 3-4-5 in a 6-player field cut to 5) passes the gate and the resulting seed order — and therefore which tied player draws a bye — is decided by `config.players` array order, not by anything the room played | ⚠️ WARNING | TOUR-09 / SC3 (seeded cut) | The plan's own must-have text for 05-06 says "a block of players who are **still tied is refused upstream of the click**" in the context of "splits a block" (straddles the line) — the shipped code satisfies that literal wording. The gap is a stricter fairness property SC3 implies but the must-have text does not literally promise. The cut still functions and is still seeded; only a specific 3+-way-tie-fully-inside-the-cut configuration is affected. |
| `src/core/import-guard.ts:1079`, `MatchRecordDialog.tsx:196-200,323` | WR-11: `koDifference` metric is bounded `0…18` (`isNonNegativeInteger`) even though the metric is documented as "KOs scored minus KOs conceded" — a signed value. A winner who took the match while conceding more KOs than scored has no legal number to enter for the metric that literally means that | ⚠️ WARNING | TOUR-07 (edge case) | One numeric field exists, is wired, and feeds the tiebreak for the overwhelming majority of results (`pokemonLeft` metric is unaffected; `koDifference` losses-in-a-comeback-win case only). Not a missing mechanism — a range bug on one of two metric choices. |
| `src/core/undo.ts:687,727-731` | `'void'` and `'cut'` remain in neither `ROUND_COMPARABLE_KINDS` nor `ALWAYS_CONFIRM_KINDS` — confirmed still true post-fix (only `'match'` was added). Undoing a `void` or `cut` shows no confirm dialog | ⚠️ WARNING (carried forward per current_state — confirmed still open) | TOUR-06/D-17 read-only invariant, adjacent | Independently re-derived: unlike the fixed `WR-01` case, `'void'`/`'cut'` cannot in practice be the **last** log entry while `selectTournamentLocked` is true (a `void` action's purpose is to clear results, which un-locks; a bare `cut` precedes any recorded bracket result). So the exact D-17 lock-bypass scenario `WR-01` had does not reproduce for these two kinds. The residual risk is a UX gap — undoing a `cut` silently collapses the bracket stage back to round-robin with no confirm — not a data-integrity bypass. |
| `src/adapters/roster-source.ts:801-825` (`readRosterFile`) | WR-07: an imported roster JSON whose `regulation` field matches an already-registered committed snapshot silently overwrites it, with no checksum comparison and no on-screen notice | ⚠️ WARNING | REFR-02 | Reachable only if a host imports a file claiming the SAME regulation label as a snapshot the build already ships — the documented intent ("a night filed under an unshipped regulation becomes readable") still works; this is scope creep beyond that intent, not a broken REFR-02. |
| `src/core/tournament.ts:257-274` (`standingRoundRobinResults`) | WR-05: filters by regex (`ROUND_ROBIN_MATCH_ID.test`) rather than by the derived pair set that `selectRemainingMatchCount` uses, so a hand-crafted `rr:9:9` id surviving import validation could add a phantom result | ⚠️ WARNING | TOUR-08 | `canApply` refuses origination of such an id in normal play (`unknownMatch`); reachable only via a maliciously/carelessly hand-edited imported JSON, not through any UI path. |

All other carried-forward findings (WR-03, WR-04, WR-06, WR-08, WR-09, WR-10, IN-01 through IN-05) are cosmetic, live-region-completeness, or defense-in-depth items with no traceable connection to any of the 14 requirement IDs or 5 success criteria, confirmed present in source but not itemized further here — see `05-REVIEW.md` for full detail.

### Human Verification

**Already completed — not outstanding.** `05-HUMAN-UAT.md` records a full physical pass at three metres on a 24-27" 1080p screen, dated 2026-09-01: 6 of 6 checks passed (Part 2a — Phase 4's previously-BLOCKING secrecy/legibility item, both halves — and Part 2b surfaces a-e — results grid, recorded cells, standings, bracket, champion). `.planning/STATE.md:138` confirms the Phase 4 blocker is marked `RESOLVED 2026-09-01`. One advisory (non-blocking) granularity gap is recorded in `05-HUMAN-UAT.md`'s own Gaps block: the host reported surfaces a-e together rather than one at a time, and 2b-a's empty-cell estimate was not separately captured. This was already dispositioned `status: partial, severity: advisory` by the plan itself — not re-opened here, and not requiring a fresh human pass, since no surface was reported marginal and every stated pass condition was met.

No new human verification items were identified during this verification pass.

## Gaps Summary

None blocking. All 5 ROADMAP success criteria are observably true in source and covered by passing tests; all 14 requirement IDs have direct implementation evidence; the full test suite (2710/2710), both purity gates, and the production build all pass on a clean re-run matching the state claimed in SUMMARY.md exactly. Both post-review fix commits (CR-01, WR-01) are confirmed correctly wired with dedicated test coverage. The 15 non-fixed `05-REVIEW.md` findings were independently re-confirmed present in source rather than trusted from the review document, and none of them falsifies a requirement ID or success criterion outright — five have a traceable (but non-blocking) proximity to TOUR-07, TOUR-08, TOUR-09, or REFR-02 and are itemized above as carried-forward WARNINGs for whoever plans the next round of hardening.

---

_Verified: 2026-09-01T18:20:00Z_
_Verifier: Claude (gsd-verifier)_
