---
phase: 01-draft-skeleton-on-a-real-url
plan: 08
subsystem: export
tags: [pokemon-showdown, pokebase, paste-format, mega-stone, team-validator, tdd, spike]

requires:
  - 01-01 (check-pure-core.mjs, verify script)
  - 01-03 (RosterEntry/MegaForme types, committed roster.mb.json snapshot)
  - 01-06 (selectTeams — the team shape the exporter consumes)
provides:
  - src/core/export/paste.ts — toShowdownPaste, the only place the export format lives
  - tests/core/export/paste.test.ts — 31 tests pinning the blank-line separator and the hostile name set
  - docs/export-verification.md — the roadmap-mandated export spike record
  - "Settled fact: one paste string serves both Showdown and pokebase.app — no export-UI branch"
affects: [01-10, 01-11, phase-03]

tech-stack:
  added: []
  patterns:
    - "The export format is encoded exactly once, in toShowdownPaste; no other module builds paste text"
    - "Species names are read from entry.name verbatim, never reconstructed from baseSpecies + forme"
    - "A Mega emits as `Species @ Stone`; the Mega forme name is never emitted"
    - "The stone that reaches the paste is the entry's own copy, never the caller's string"
    - "A slot whose id is not in the lookup is dropped, so no unresolved identifier reaches third-party text"
    - "Verification records carry per-row attribution (automated / programmatic / user-verified); the three are not interchangeable"

key-files:
  created:
    - src/core/export/paste.ts
    - tests/core/export/paste.test.ts
    - docs/export-verification.md
  modified:
    - .planning/phases/01-draft-skeleton-on-a-real-url/01-UI-SPEC.md
    - .planning/ROADMAP.md

key-decisions:
  - "ROADMAP success criterion 5 amended: a species-only paste cannot pass Showdown's validator by construction (24 problems per six-mon team), so the criterion is now 'no transforms in-battle error'"
  - "One paste serves both targets — pokebase interprets the Mega stone, so no item-stripped variant and no export-UI branch in 01-10"
  - "The export helper text names no third-party menu path, because no menu path was ever observed on a running site"
  - "Verification fixtures must be disjoint teams; the original pair shared five of six species, which is unreachable in a real draft"

patterns-established:
  - "Evidence attribution: automated (CI-pinned) vs programmatic (real code, no browser) vs user-verified (human at the running site)"
  - "An unverifiable success criterion gets amended against reality rather than quietly failed or quietly claimed"

requirements-completed: [EXPO-01, EXPO-02, EXPO-03, EXPO-05]

duration: ~35min across three sessions
completed: 2026-08-05
---

# Phase 1 Plan 08: The Export Spike Summary

**`toShowdownPaste` ships as the single home of the Showdown paste format, and the spike settled the project's one untested assumption: pokebase.app does not merely tolerate the `@ Stone` line, it interprets it — so one paste string serves both targets.**

## Performance

- **Duration:** ~35 min of execution across three sessions (Task 1 automated, orchestrator differential, this close-out)
- **Started:** 2026-08-05T10:01:44Z (first RED commit)
- **Completed:** 2026-08-05T19:40:00Z
- **Tasks:** 2 (1 TDD auto, 1 blocking human-verify checkpoint)
- **Files modified:** 5

## Accomplishments

- **`toShowdownPaste` written and pinned by 31 tests.** The blank-line record separator — the single most likely export bug in the project — is asserted by exact-string fixture plus a negative test that asserts what the naive single-newline form actually does.
- **The `Species @ Stone` Mega form is proven, not assumed.** A validator differential against `gen9championsvgc2026regmb` shows `Charizard @ Charizardite X` produces **0** `transforms in-battle` problems where bare `Charizard-Mega-X` produces **1**, with the verbatim error captured.
- **pokebase.app's acceptance of the `@ item` line is settled by a human at the running site.** PROJECT.md flagged this as *inferred, never tested*. It is now tested: a single record showed Venusaur's Mega **active**, and the full six-record team "worked with no problems".
- **A false success criterion was caught and amended.** ROADMAP criterion 5 required passing Showdown's team validator, which a species-only paste can never do. A correct implementation would have failed the criterion.
- **A fixture defect the tests could not have caught was found by the user** and corrected — see Issues Encountered.

## Task Commits

1. **Task 1 (RED): failing tests for the Showdown export paste** — `cf681da` (test)
2. **Task 1 (GREEN): `toShowdownPaste`, the one place the export format lives** — `caf60c2` (feat)
3. **Task 2 (part): record the automated half of the export spike** — `b9a0896` (docs)
4. **Task 2 (part): pokebase accepts and interprets the Mega stone line; fixture correction** — `21b3608` (docs)
5. **Supporting: fix success criterion 5** — `ee47447` (docs, ROADMAP)

**Plan metadata:** this commit (docs: complete the export spike plan)

No REFACTOR commit — the GREEN implementation needed no cleanup. RED and GREEN gates are both present, so TDD gate sequence is satisfied.

## Files Created/Modified

- `src/core/export/paste.ts` — `toShowdownPaste(slots, entryById)`. The only exported function; the only place EXPO-01/02/03 are encoded.
- `tests/core/export/paste.test.ts` — 31 tests: exact-string separator assertions, the naive-join negative test, Mega stone rendering, and the hostile name set (`Nidoran-M`, `Mr. Rime`, `Type: Null`, `Farfetch’d` with U+2019).
- `docs/export-verification.md` — the spike record. Now carries per-row evidence attribution and the completed pokebase and Showdown results.
- `.planning/phases/01-draft-skeleton-on-a-real-url/01-UI-SPEC.md` — `Export helper text` row rewritten; its copy-rule note replaced with the reasoning.
- `.planning/ROADMAP.md` — success criterion 5 amended (commit `ee47447`).

## Decisions Made

**1. Success criterion 5 was amended rather than declared met or failed.**
"Passing Showdown's team validator" is unachievable for a species-only paste. Both teams report **24 problems**, four per Pokémon — no ability, `No Ability` does not exist in Gen 9, no moves, 0 stat points. Every one is inherent to the format and gets filled in by the teambuilder afterwards; that is *why* a bare species list is a legitimate minimal Showdown paste. The criterion now requires **no `transforms in-battle` problem**, which is the signal that actually discriminates a correct Mega export from a broken one. This was not lowering a bar to pass it — the replacement criterion is the one that fails on the specific bug PITFALLS Pitfall 8(a) predicted, and the original did not test for it at all.

**2. One paste, no export-UI branch.** Because pokebase interprets the stone rather than choking on it, plan 01-10's export panel emits exactly one string per player. The contingency the plan named — a plain species-only paste for pokebase and `Species @ Stone` for Showdown, meaning two variants and a UI branch — is not needed. This is the single most useful thing the spike bought.

**3. The export helper text no longer names any third-party menu path.** See Deviations.

## Deviations from Plan

### 1. [Rule 1 — Bug] The `Export helper text` row was made neutral instead of "corrected to the verbatim strings observed"

- **Found during:** Task 2 close-out
- **Issue:** The plan's acceptance criterion says to replace the helper string with "the verbatim strings observed" on both sites. **No such observation exists.** Nobody opened play.pokemonshowdown.com's teambuilder or pokebase.app's import UI to read menu labels — the Showdown format work was done programmatically against the devDependency, and the user's pokebase verification confirmed the *paste behaviour* without capturing button wording. The prior string, `Paste into Pokémon Showdown → Teambuilder → import, or pokebase.app → New/Import Team.`, asserted two menu paths: the Showdown half was an outright guess, and the pokebase half came from reading strings out of pokebase's shipped JS bundle, which is not the same as seeing them on the running UI.
- **Fix:** Rewrote the row to `Paste this into the team import field on Pokémon Showdown or pokebase.app.` — accurate for both sites, and it commits to nothing that was not observed. Replaced the copy-rule note with the reasoning and a pointer to the two PENDING rows in `docs/export-verification.md`.
- **Why not just leave it:** an approved UI contract that states unverified third-party wording as fact is worse than one that says less. Menu labels are also the most volatile thing about a third-party site — either site can relabel a button without telling us, whereas the paste *format* is a stable published contract.
- **Files modified:** `.planning/phases/01-draft-skeleton-on-a-real-url/01-UI-SPEC.md`
- **Verification:** The plan's own automated check for this task — `grep -q "New/Import Team" 01-UI-SPEC.md` — still passes, because the string survives in the explanatory note and in the provenance table at line ~396. That check would have passed against the unverified guess too, which is worth noting: it tested for the presence of a string, not for its truth.

### 2. [Rule 2 — Missing Critical] Evidence attribution added to `docs/export-verification.md`

- **Found during:** Task 2 close-out
- **Issue:** The document was about to record Showdown results and pokebase results side by side in identically-shaped tables, with no indication that they were established by completely different means. A later reader would reasonably conclude a human had pasted into both sites. They had not.
- **Fix:** Added an attribution key at the top (**automated** / **programmatic** / **user-verified**), a per-row `How` column on the Showdown table, and an explicit warning block above it stating that nobody opened the site in a browser.
- **Files modified:** `docs/export-verification.md`
- **Verification:** Every filled row in Part Two now carries an attribution; the Conclusions table distinguishes "programmatic" from "user-verified" claims.

---

**Total deviations:** 2 (1 bug — unverified claim in an approved contract; 1 missing critical — evidence provenance).
**Impact on plan:** No scope creep. Both changes make the record less confident and more accurate, which is the point of a spike.

## Issues Encountered

**1. The verification fixtures were unreachable in a real draft — caught by the user, invisible to every test.**

The original TEAM A / TEAM B pair shared **five of six species** (Venusaur, Garchomp, Rotom-Wash, Kommo-o, Mr. Rime in both). A picked species leaves the pool immediately, so no six-round draft can ever produce that pair. The fixtures exercised the formatter correctly but not the thing success criterion 5 is actually about — two finished teams out of one draft.

No test could have caught this, and it is worth being precise about why: `toShowdownPaste` receives an array of slots and formats it. It has no notion of a pool, of other teams, or of what was already picked, and it should not — that invariant belongs to the reducer in `src/core/reduce.ts`, which does enforce it. The defect was in the *fixture design*, in a document meant to model a realistic end-to-end scenario. Realism of test data is not a property a unit test can assert about itself.

Replaced with disjoint teams — 12 distinct species, zero overlap — regenerated by the real function against the committed snapshot and machine-checked (6 mons each, 24 problems each, **0** `transforms in-battle`, overlap 0):

- **TEAM A**: `Charizard @ Charizardite X`, `Garchomp`, `Rotom-Wash`, `Tauros-Paldea-Aqua`, `Kommo-o`, `Mr. Rime`
- **TEAM B**: `Venusaur @ Venusaurite`, `Meganium @ Meganiumite`, `Starmie`, `Dragonite`, `Tyranitar`, `Meowstic-F`

The replacement pair also covers more: Charizard carries two stones so a silent default would be wrong half the time; Meganium is a Champions-only Mega; and `Meowstic-F` is the forme the cosmetic-forme filter nearly deleted in plan 01-03.

**2. A species-only paste can never report zero validator problems** — resolved by amending criterion 5, see Decisions.

## Requirements

Judged against what is actually proven, not against what the plan hoped to prove.

| ID | Status | Basis |
|---|---|---|
| **EXPO-01** — species-only paste, no EVs/natures/movesets | **MET** | `toShowdownPaste` emits nothing but names and stones; 31 tests, and both teams parse to exactly six species with no other fields set. |
| **EXPO-02** — Mega slot exports as `Species @ StoneItemName` | **MET** | Validator differential: `Species @ Stone` → 0 `transforms in-battle`, bare `-Mega` forme → 1, verbatim error captured. |
| **EXPO-03** — blank-line separated | **MET** | Exact-string fixture plus a negative test; `A\n\nB\n\nC` → 3 mons, `A\nB\nC` → 1 mon, against Showdown's own parser. |
| **EXPO-04** — imports into play.pokemonshowdown.com and passes its validator | **PARTIAL — not claimed** | Two problems. The paste parses to six correct species with correct items and produces zero `transforms in-battle` under `gen9championsvgc2026regmb` — but that was established **programmatically against the devDependency, not in a browser**. And "passes its team validator" as literally written is unachievable; ROADMAP criterion 5 was amended for exactly this reason. The format risk is closed; the browser round-trip is unobserved. **Leaving this unmarked.** |
| **EXPO-05** — imports into pokebase.app | **MET** | User-verified at the running site, 2026-08-05: full six-record TEAM B imported with no problems, both stones accepted, Mega shown active. |
| **EXPO-06** — export reachable per player from the completed draft view | **NOT THIS PLAN** | Plan 01-10 builds the export UI. This plan built the string, not the way to reach it. |

Four of five marked. **EXPO-04 is deliberately not marked** — the evidence is strong but it is not the evidence the requirement asks for, and this plan exists specifically to stop the project resting on inference.

## Known Stubs

None. `toShowdownPaste` is fully implemented; nothing in this plan is placeholder.

## Threat Flags

None. This plan adds no network call, no endpoint, no storage access and no new trust boundary. The threat register's `T-01-38` (export text reaching a third party) remains **accepted** and unchanged: the host copies the text themselves and the app never contacts either site. `T-01-39` (parser control sequences via a species name) is mitigated as planned — names originate only in the committed snapshot, a slot with an unknown id is dropped rather than emitted, and a stone that does not match one of the entry's own declared Mega formes is refused, so every character in the output originates in committed data.

## Next Phase Readiness

**Ready.** Plan 01-10 can build the export panel against a settled format: one string per player, `toShowdownPaste(slots, entryById)`, no branching by destination.

**Two open items, both cosmetic and non-blocking:**

1. Showdown's teambuilder import menu wording and pokebase's entry-point/paste-field labels remain PENDING in `docs/export-verification.md`. They affect one line of helper copy. Anyone with both sites open can close them in two minutes; until then the helper text stays generic.
2. `01-UI-SPEC.md` line ~396 still lists the `pokebase.app → New/Import Team` entry label as "verified" in its provenance table. That is defensible in its own terms — the string genuinely was recovered from pokebase's shipped JS — but it reads as stronger than the running-UI observation nobody made. Left untouched as out of scope for this plan; flagging it so it is a decision rather than an oversight.

## Self-Check: PASSED

- Files claimed, all present: `src/core/export/paste.ts`, `tests/core/export/paste.test.ts`, `docs/export-verification.md`, `01-08-SUMMARY.md`
- Commits claimed, all present in history: `cf681da`, `caf60c2`, `b9a0896`, `21b3608`, `ee47447`, and this close-out commit
- `npx vitest run tests/core/export/paste.test.ts` — **31 passed**
- Plan Task 2 automated check — passes: `docs/export-verification.md` contains `play.pokemonshowdown.com`, `pokebase.app`, `Charizardite X`, `VGC 2026 Reg M-B`, and `01-UI-SPEC.md` still matches `New/Import Team`
- Corrected fixtures re-generated by the real `toShowdownPaste` and re-validated: both teams 6 mons, 24 problems, **0** `transforms in-battle`, species overlap **0**, 12 distinct species
- Scope respected: no changes to `src/`, `tests/`, `STATE.md`, `ROADMAP.md`, or any file owned by the concurrent 01-10 executor

---
*Phase: 01-draft-skeleton-on-a-real-url*
*Completed: 2026-08-05*
