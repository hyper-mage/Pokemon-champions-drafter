---
phase: 01-draft-skeleton-on-a-real-url
verified: 2026-08-06T21:15:00Z
status: human_needed
score: 5/5 roadmap success criteria verified; 31/32 requirements confirmed complete (1 correctly Pending)
overrides_applied: 0
re_verification: false
human_verification:
  - test: "Confirm the live GitHub Pages URL is serving commit b1d26bc or later"
    expected: "index.html references a build produced after the CR-01/CR-02/CR-03 fixes landed (asset hashes will differ from index-RKy-BDIb.js / the eaad495 build)"
    why_human: "The GitHub Actions run history (read via the public API) shows no workflow run for any commit after eaad495 (2026-08-06T01:37:10Z), including 29bad97, c03b119, 83bfd06, 3a2b2df, f1cf73f, and the final merge b1d26bc, even after ~90s of polling following the push. The code fixes are verified present and correct in the repository and pass npm run verify, but as of this verification the deployed site was still serving the pre-fix build."
---

# Phase 1: Draft Skeleton on a Real URL — Verification Report

**Phase Goal:** A group can open a public URL with no install and no account, run a
two-player six-round draft against the real Champions roster, undo a misclick, close the
browser and come back to it, and paste both teams straight into Showdown and pokebase.

**Verified:** 2026-08-06T21:15:00Z
**Status:** human_needed (one live-deployment-currency check outstanding; no code-level gaps found)
**Re-verification:** No — initial verification
**Mode note:** ROADMAP.md marks this phase `mode: mvp`, but the phase goal is written as a
descriptive sentence, not in the `As a ___, I want to ___, so that ___.` user-story form the
MVP verification path requires, and no `gsd-sdk` tool was available in this session to run
`user-story.validate` or `roadmap.get-phase`. Verification therefore proceeded as standard
goal-backward verification against the ROADMAP's five stated Success Criteria (read directly
from `.planning/ROADMAP.md`) and each plan's `must_haves` frontmatter, per the parent task's
explicit instructions. This is a process deviation worth surfacing, not a finding about the
codebase.

## Goal Achievement

### Observable Truths (ROADMAP Phase 1 Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Anyone opens the GitHub Pages URL with no install/account/payment, and after first load the draft works with the network off | ✓ VERIFIED (mixed evidence — see note) | URL returns HTTP 200 with real content (`curl` confirmed live). Offline behavior itself is **user-verified only** (Firefox, 2026-08-06, `docs/offline-verification.md` §A): "a full 12-pick draft ran... zero broken images." No automated proof of offline capability exists — `public/sw.js` (75 lines, cache-first, no `skipWaiting`/`clients.claim`) and `scripts/build-sw-manifest.mjs` are code/test-verified (322 URLs, 905 KB, `tests/build/sw-manifest.test.ts` + `tests/build/sw-behaviour.test.ts`, 25 tests), but "the app truly works with the network off" rests on one human's observation, not a CI check. |
| 2 | Two players alternate 6 rounds against the regulation-stamped snapshot; Meganium/Feraligatr Mega-capable, Typhlosion not; cosmetic/battle-only formes absent; Rotom appliances and Tauros-Paldea present; Charizard carries both Megas; every entry has a sprite/fallback; a picked species leaves the pool immediately | ✓ VERIFIED | Directly queried `public/data/roster.mb.json`: `meganium.megaCapable=true`, `feraligatr.megaCapable=true`, `typhlosion.megaCapable=false` (confirms the exact claim in success criterion 2, not just Meganium). `tests/core/roster/fixtures.test.ts` (26 tests, all passing) pins Meganium, Vivillon, Alcremie, Castform, Aegislash, Kommo-o, Mr. Rime, Rotom appliances, Tauros-Paldea, Charizard X/Y. `src/core/reduce.ts canApply` rejects re-picking (`notInPool`), and `src/core/selectors.ts selectAvailablePool` removes picked ids from the rendered pool — `src/app.tsx` passes this selector's output to `PoolGrid`, confirmed by source read, not just grep. |
| 3 | The host undoes the last pick at any point and the board returns exactly to its prior state | ✓ VERIFIED | `src/core/undo.ts` (`canUndo`, `undoLast`) + `tests/core/undo.test.ts` (23 tests) assert 12 successive undos return to the pre-first-pick state and that `undoLast` never mutates input. `tests/core/reduce.test.ts` asserts prefix-refold equivalence at all 15 cut points of a complete draft. Button + Ctrl+Z wiring confirmed in `src/ui/components/TopBar.tsx`. Browser-level confirmation (board/turn-banner rollback, focus behavior) is user-verified, `docs/offline-verification.md` §B, 2026-08-06. |
| 4 | A refresh, closed browser, or second open tab never loses/overwrites a draft; storage warns up front; JSON checkpoint at milestones; download and re-import on another machine | ✓ VERIFIED, with two honestly-scoped gaps | Autosave + `pagehide`/`visibilitychange` flush (`src/adapters/persistence.ts`), storage canary + blocking screen (`probeStorage`, `StorageBlocked.tsx`), tab-ownership lock (`src/adapters/tab-lock.ts`), JSON download/import with a hand-rolled prototype-pollution-safe guard (`src/core/import-guard.ts`, `tests/core/import-guard.test.ts`) are all present, tested, and the three code-review blockers touching this area (CR-01 unbounded `rounds`/`players`/`pool ids`, CR-02 `Ctrl+Z` bypassing `inert` in a read-only tab, CR-03 `release()` deadlock on rapid navigate-away) are **confirmed fixed in the current source** (see Requirements Coverage). Two gaps stated plainly rather than hidden: (a) **the cross-machine leg of PERS-05 was never exercised** — the JSON round trip in `docs/offline-verification.md` §B ran on one machine; (b) two lock edge cases from the code review remain **open by design** (WR-09 heartbeat-not-counted dual-ownership window, WR-10 bfcache-restored secondary losing its stale watch) — both are narrow races, both are documented, neither reopens the CR-02/CR-03 fixes. |
| 5 | Each finished team copies out as a blank-line-separated species-only paste importing into both Showdown and pokebase, Mega slot as `Species @ StoneItemName`, no `transforms in-battle` error | ✓ VERIFIED (evidence grades differ per target — see note) | `src/core/export/paste.ts toShowdownPaste` + 31 tests pin the blank-line separator (exact-string fixture, plus a negative test on the naive single-newline form) and the `Species @ Stone` form. **Showdown side (EXPO-04) is *programmatic*, not browser-verified**: `docs/export-verification.md` ran the real `pokemon-showdown@0.11.11` parser/validator in Node — 0 `transforms in-battle` problems for both fixture teams — but nobody opened play.pokemonshowdown.com in a browser. **pokebase side (EXPO-05) is user-verified**: a human pasted a six-record Mega-containing team into the live site and reported it "worked with no problems," Mega shown active. `docs/offline-verification.md` §C additionally records a user-verified end-to-end pass importing into both targets from the deployed UI's own output (2026-08-06) — this is the strongest evidence for criterion 5 as a whole, though Phase 1 drafts have no Mega slots so the Mega-specific half of that pass is the earlier programmatic/user-verified evidence, not §C itself. |

**Score:** 5/5 roadmap success criteria verified (each with the evidence grade — automated / programmatic / user-verified — stated rather than blurred, per the phase's own documented convention).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/core/roster/transform.ts` | Pure roster classification | ✓ VERIFIED | Exports `classify`, `deriveMegaFormes`, `transform`; 0 purity violations; classification spot-checked live against Meganium/Feraligatr/Typhlosion |
| `public/data/roster.mb.json`, `roster.ma.json` | Committed, regulation-stamped snapshots | ✓ VERIFIED | Both present, parse, carry `schemaVersion`, `regulation`, `validFrom`, `validUntil`, `upstreamRef`, `generatedAt`, `counts`, `checksum`; `upstreamRef` = `"npm:pokemon-showdown@0.11.11 (sha512-...)"` — matches the amended ROST-03/ROST-05 wording exactly |
| `public/sprites/*.png` + `_placeholder.png` | ~310 committed PNGs, measured 96×96 | ✓ VERIFIED | Precache manifest confirms 312 sprite files; `sw-manifest.test.ts` pins the ≥300 tripwire |
| `src/store.ts` | Single write path, sync seam | ✓ VERIFIED | Exactly one `log.push`/`log:` mutation site; `dispatch` gates on `canApply`; `undo()` gates on `isOwner()` (CR-02 fix) |
| `src/core/undo.ts` | Pure undo | ✓ VERIFIED | `canUndo`, `undoLast`; 23 passing tests |
| `src/adapters/persistence.ts` | Autosave, canary, storage guard | ✓ VERIFIED | `probeStorage`, `save`, `load`, `startAutosave` all present; `save()` gated on `isOwner()` |
| `src/adapters/tab-lock.ts` | Ownership lock | ✓ VERIFIED, with WR-09/WR-10 open | Heartbeat/stale/takeover protocol present and tested (33 tests); two documented, non-blocking races remain open per the code review |
| `src/core/export/paste.ts` | `toShowdownPaste` | ✓ VERIFIED | Single exported function; 31 tests including blank-line and Mega-stone fixtures |
| `src/core/import-guard.ts` | Prototype-pollution-safe import guard | ✓ VERIFIED | `MAX_ROUNDS`, `MAX_PLAYERS`, `MAX_POOL_IDS` bounds present (CR-01 fix); reviver drops poison keys; allow-list rebuild, no `Object.assign`/spread |
| `public/sw.js` + `scripts/build-sw-manifest.mjs` | Cache-first offline worker | ✓ VERIFIED | 75 lines, no `skipWaiting`/`clients.claim`; real build produced 322-URL manifest, 905.5 kB |
| `docs/export-verification.md`, `docs/offline-verification.md` | Human-verification records | ✓ VERIFIED (as records) | Both exist, both attribute every claim (`automated` / `programmatic` / `user-verified`), both are honest about what is still `PENDING` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `src/app.tsx` | `src/store.ts` | `onPick` dispatches `draft/pickMade` | ✓ WIRED | Confirmed by source read |
| `src/app.tsx` | `src/core/selectors.ts` | `selectAvailablePool` feeds `PoolGrid` | ✓ WIRED | Confirmed |
| `src/ui/components/TopBar.tsx` | `src/store.ts` | `Undo last pick` button + `Ctrl+Z` → `store.undo()` | ✓ WIRED, ownership-gated | `isOwner()` check present in both the keydown handler (CR-02) and `store.undo()` itself — defense in depth as the review recommended |
| `src/adapters/tab-lock.ts` | `src/adapters/persistence.ts` | `save()` no-ops unless `isOwner()` | ✓ WIRED | Confirmed |
| `src/adapters/file-io.ts` | `src/core/import-guard.ts` | Every imported file passes `parseTournamentFile` before reaching the store | ✓ WIRED | Confirmed |
| `src/ui/components/ExportPanel.tsx` | `src/core/export/paste.ts` | Renders `toShowdownPaste` output | ✓ WIRED | Confirmed |
| `.github/workflows/deploy.yml` | GitHub Pages | Push to `main` → verify → deploy | ⚠️ WIRED but currently stale | Mechanism proven (5/5 historical successful runs); **the most recent push (containing the code-review fixes) had not triggered any workflow run as of this verification** — see Human Verification |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `PoolGrid`/`MonCard` | `entries` (pool) | `selectAvailablePool(state)` ← folded log ← `pool/built` action carrying real committed roster ids | Yes — verified `roster.mb.json` has 235 real entries, not a stub | ✓ FLOWING |
| `BoardGrid`/`TeamStrip` | `teams` | `selectTeams(state)` ← folded `draft/pickMade` actions | Yes | ✓ FLOWING |
| `ExportPanel` | paste text | `toShowdownPaste(selectTeams(...), entryById)` ← real roster entries | Yes | ✓ FLOWING |
| `ReadOnlyBanner` | ownership state | `useOwnership()` ← `tab-lock.ts` `ownershipState()`, read synchronously on first render | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full verify gate | `npm run verify` | `check:pure` 0/11 files, `check:nohtml` 0/38 files, 375/375 tests, build 53.04 kB / 19.28 kB gzip | ✓ PASS |
| Roster Mega-capability spot check | `node -e "..."` against `roster.mb.json` | `meganium.megaCapable=true`, `feraligatr.megaCapable=true`, `typhlosion.megaCapable=false` | ✓ PASS |
| Live URL reachability | `curl -sfI https://hyper-mage.github.io/Pokemon-champions-drafter/` | HTTP 200, correct HTML shell, correct `/Pokemon-champions-drafter/assets/` sub-path | ✓ PASS |
| Live URL currency | Compared served asset hash to fresh local build + GitHub Actions run history | Served JS hash (`index-RKy-BDIb.js`) is older than the current repo HEAD's build output (`index-mVeM9zcg.js`); no workflow run exists for any commit after `eaad495` | ✗ FAIL (deployment currency, not code) — routed to Human Verification |
| Runtime dependency count | `node -e "..."` on `package.json` | Exactly `preact`, `@preact/signals` | ✓ PASS |
| Debt-marker scan | `grep -rn "TBD\|FIXME\|XXX\|TODO\|HACK"` over `src/`, `scripts/` | Zero unreferenced markers (only legitimate uses of the word "placeholder" for the D-04 sprite fallback feature) | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` convention exists in this project, and no PLAN/SUMMARY declares probe-based verification. Skipped — not applicable to this phase's tooling (Vitest is the test runner; `npm run verify` is the equivalent gate and was run directly above).

### Requirements Coverage

All 32 requirement IDs declared across the 11 plans' frontmatter were cross-referenced against `.planning/REQUIREMENTS.md`. No orphaned requirements: the union of every plan's `requirements:` field is exactly ROST-01…12 (12), SHEL-01…07 (7), PERS-01…07 (7), EXPO-01…06 (6) = 32, matching REQUIREMENTS.md's own count for Phase 1.

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| ROST-01 | 01-03 | Pool restricted to current Regulation | ✓ SATISFIED | `counts.regulation`/classify logic; fixture tests |
| ROST-02 | 01-05, 01-11 | Committed snapshot + fully offline | ✓ SATISFIED (offline half is user-verified only) | Snapshot committed; offline user-verified §A |
| ROST-03 | 01-03 | Regeneration pinned to exact, verifiable upstream version | ✓ SATISFIED (amended wording matches shipped data) | `upstreamRef: "npm:pokemon-showdown@0.11.11 (sha512-...)"` confirmed in shipped JSON, matching the amended REQUIREMENTS.md text exactly |
| ROST-04 | 01-03 | Fails loudly on count drift | ✓ SATISFIED | `build-roster.mjs` count gate; demonstrated in 01-03-SUMMARY.md verification evidence |
| ROST-05 | 01-03 | Snapshot carries full metadata incl. `upstreamRef` | ✓ SATISFIED (amended wording matches shipped data) | Same field check as ROST-03; `checksum`, `generatedAt`, `counts` all present |
| ROST-06 | 01-03 | Prior regulation retained | ✓ SATISFIED | `roster.ma.json` present and distinct |
| ROST-07 | 01-03 | Mega-capability as a flag per base species | ✓ SATISFIED | `megaCapable`/`megaFormes` fields confirmed live |
| ROST-08 | 01-03 | Draftable unit is base species | ✓ SATISFIED | Confirmed by schema and fixture tests |
| ROST-09 | 01-03 | Cosmetic/battle-only/Future excluded | ✓ SATISFIED | Fixture tests: Castform-Sunny, Aegislash-Blade absent |
| ROST-10 | 01-03 | Genuine alternate formes retained | ✓ SATISFIED | Fixture tests: Rotom appliances, Tauros-Paldea present |
| ROST-11 | 01-04, 01-05 | Every entry resolves to a sprite or fallback | ✓ SATISFIED | 312 sprite files + placeholder; `resolveSpriteFile`/`sprite-src.ts` |
| ROST-12 | 01-03 | Hostile-species fixture test | ✓ SATISFIED | `tests/core/roster/fixtures.test.ts`, 26 tests, all passing |
| SHEL-01 | 01-02 | Reachable at GitHub Pages URL | ✓ SATISFIED (mechanism); ⚠️ currency gap, see below | URL live and returns 200; serving an older build than HEAD as of this check |
| SHEL-02 | 01-02 | CI/CD via GitHub Actions on push | ✓ SATISFIED (mechanism); ⚠️ latest push not yet processed | Workflow file correct, 5/5 historical runs green; no run yet for the current HEAD |
| SHEL-03 | 01-11 | Works with no network after first load | ✓ SATISFIED (user-verified only) | `docs/offline-verification.md` §A |
| SHEL-04 | 01-01, 01-06 | Pure core enforced by CI check | ✓ SATISFIED | `check:pure` 0/11 files; gate proven against real and fixture violations |
| SHEL-05 | 01-06 | Single serializable document, append-only log, pure reducer | ✓ SATISFIED | `apply`/`canApply`/`fold`; JSON round-trip tests |
| SHEL-06 | 01-07 | Host can undo at any point | ✓ SATISFIED | `undo.ts`, 23 tests, user-verified button + Ctrl+Z |
| SHEL-07 | 01-06 | Seeded randomness reproduces on reload | ✓ SATISFIED | `rng.ts nextInt`; materialized `draft/started.order` |
| PERS-01 | 01-07 | Autosave survives refresh/close | ✓ SATISFIED | `persistence.ts` debounce + `pagehide`/`visibilitychange` flush; user-verified §B |
| PERS-02 | 01-07 | Storage canary at config time | ✓ SATISFIED | `probeStorage` write-read-compare-delete; `StorageBlocked.tsx` |
| PERS-03 | 01-09, code review | Two tabs cannot silently overwrite | ✓ SATISFIED, re-checked honestly | CR-02 (Ctrl+Z bypass) and CR-03 (claim-window deadlock) **confirmed fixed in source**. WR-09 (heartbeat not counted toward `sawPong`) and WR-10 (bfcache-restored secondary loses stale watch) **confirmed still open** — both are narrow, low-probability races (a busy-main-thread boot collision; a specific bfcache-restore pattern), both documented as deliberately deferred, neither reopens the fixed clobber/deadlock bugs |
| PERS-04 | 01-10 | Export full tournament as JSON | ✓ SATISFIED | `downloadJson`; `Download JSON` button |
| PERS-05 | 01-10 | Import JSON to restore/move | ✓ SATISFIED, cross-machine leg unexercised | Import guard + confirm dialog present and tested; round trip only run on one machine per `docs/offline-verification.md` |
| PERS-06 | 01-10 | JSON checkpoint offered at milestones | ✓ SATISFIED | `CheckpointPrompt.tsx`, click-only, no auto-download code path |
| PERS-07 | 01-10 | Schema version, clean import across versions | ✓ SATISFIED | `migrate.ts`, `SUPPORTED_SCHEMA_VERSIONS` |
| EXPO-01 | 01-08 | Species-only paste | ✓ SATISFIED | `toShowdownPaste`, 31 tests |
| EXPO-02 | 01-08 | Mega slot as `Species @ Stone` | ✓ SATISFIED | Validator differential: 0 `transforms in-battle` |
| EXPO-03 | 01-08 | Blank-line separated | ✓ SATISFIED | Exact-string + negative test |
| EXPO-04 | 01-08 | Imports and passes Showdown's validator | **Correctly Pending — requirement-text defect, not a code gap** | See dedicated note below |
| EXPO-05 | 01-08 | Imports into pokebase.app | ✓ SATISFIED | User-verified, Mega shown active |
| EXPO-06 | 01-10 | Export reachable per player from completed draft view | ✓ SATISFIED | `CompletedDraft.tsx` maps one `ExportPanel` per player |

**EXPO-04 recommended wording** (per the phase's own developer-facing flag, reproduced here for the record): the requirement's literal text — "imports into play.pokemonshowdown.com and passes its team validator, including Mega-containing teams" — is unsatisfiable by any species-only paste, since Showdown's validator reports four inherent problems per Pokémon (no ability, no moves, 0 stat points) regardless of implementation correctness. ROADMAP Phase 1 success criterion 5 was already amended to the achievable, discriminating signal ("no `transforms in-battle` error"), and that amended criterion is verified. Recommend REQUIREMENTS.md's EXPO-04 be reworded to match: *"Export imports into play.pokemonshowdown.com's teambuilder as the correct species and items, and a Mega slot produces no `transforms in-battle` validation error."* Until reworded, leaving EXPO-04 Pending is the correct and honest state — do not mark it Complete against the current wording, and do not treat this as a code gap requiring a plan.

### Anti-Patterns Found

None new. Zero unreferenced `TBD`/`FIXME`/`XXX`/`TODO`/`HACK` markers across `src/` and `scripts/`. The 15 warnings and 6 info findings in `01-REVIEW.md` remain open exactly as disclosed — spot-checked WR-09 and WR-10 directly in source and confirmed both are still present, matching the review's "OPEN" status. None of the 15 warnings undermines a must-have truth beyond what is already noted in the PERS-03 and PERS-05 rows above.

### Human Verification Required

#### 1. Confirm the live URL is serving the current commit (b1d26bc or later)

**Test:** Open `https://hyper-mage.github.io/Pokemon-champions-drafter/`, view source, and
compare the referenced JS asset filename against the current build output (run `npm run
build` and check `dist/index.html`), or check the GitHub Actions tab for a completed run
against commit `b1d26bc`.

**Expected:** The live site's asset hash matches a build produced after the CR-01/CR-02/CR-03
fixes landed, and DevTools confirms the deployed JS contains the `MAX_ROUNDS`/`isOwner()`
guards described above (e.g. via a quick source-map-assisted search, or simply trusting a
fresh green Actions run against `b1d26bc`).

**Why human:** This verifier polled the public GitHub Actions API for roughly 90 seconds
after confirming `b1d26bc` is present on `origin/main` and found no workflow run — queued,
in-progress, or completed — for that commit or any of the five commits leading up to it
(`29bad97`, `c03b119`, `83bfd06`, `3a2b2df`, and the merge itself). The live URL's served
`index.html` still referenced `assets/index-RKy-BDIb.js`, which does not match the hash a
fresh local build of the current tree produces (`index-mVeM9zcg.js`). This is very likely a
transient propagation gap — the deploy mechanism itself has 5/5 historical successful runs
and was already disclosed as "currently deploying" going into this verification — but it
cannot be resolved by re-reading source, and a real visitor opening the link right now would
get the pre-fix build (which still has the CR-01 unbounded-import brick, the CR-02 Ctrl+Z
clobber, and the CR-03 deadlock). Confirm the workflow completes and the fixes are live
before treating this phase's SHEL-01/SHEL-02 success criteria as demonstrated end-to-end on
the actual public URL, as opposed to demonstrated in the repository.

### Gaps Summary

No code-level gaps were found. Every artifact required by the phase's 11 plans exists, is
substantive, is wired, and (where it renders data) renders real data from the committed
roster and sprite sets — not stubs or placeholders. `npm run verify` is green: 0 purity
violations across 11 core files, 0 raw-HTML violations across 38 files, 375/375 tests
passing, and a build matching the sizes claimed in the phase's own state summary
(53.04 kB / 19.28 kB gzip).

The three code-review blockers (CR-01 unbounded imported counts bricking the app, CR-02
`Ctrl+Z` bypassing `inert` in a read-only tab, CR-03 `release()` deadlocking a tab that
navigates away during its 250ms claim window) were independently re-verified in this session
by reading the actual fix code rather than trusting the SUMMARY or REVIEW status labels, and
all three are genuinely present and correct in the current source.

The 15 warnings and 6 info findings left open in `01-REVIEW.md` are, per instruction, treated
as known carried debt rather than new findings; two of them (WR-09, WR-10) were spot-checked
directly in source and confirmed still open, and neither undermines PERS-03's core guarantee
(the clobber and deadlock the phase set out to prevent are fixed; what remains open are two
narrower races around simultaneous-boot and bfcache restore).

The one thing keeping this report at `human_needed` rather than `passed` is not a defect in
the code: it is that the live production URL, as observed during this verification session,
had not yet picked up the commit containing the three code-review fixes, and the standard
GitHub Actions signal that would confirm it (a completed workflow run) had not appeared after
roughly 90 seconds of polling. This is exactly the kind of claim a goal-backward verifier
should not paper over by re-stating what the repository says ought to happen — it should be
confirmed on the actual deployed artifact before the phase is considered demonstrated end to
end on the real URL that a group of friends would actually open.

Separately, and not blocking: EXPO-04 is correctly left Pending due to a requirement-wording
defect (see the dedicated note above) rather than a missing capability, and REQUIREMENTS.md
should be updated to the amended, achievable wording so the traceability table stops
recording a permanently-unsatisfiable requirement against a phase that has, in every
substantive sense, already met it.

---

_Verified: 2026-08-06T21:15:00Z_
_Verifier: Claude (gsd-verifier)_
