---
phase: 01-draft-skeleton-on-a-real-url
plan: 03
subsystem: roster-data
tags: [roster, pokemon-showdown, champions, regulation, forme-classification, pure-core, tdd, snapshot]

requires:
  - 01-01 (package.json, tsconfig, vitest wiring, check:pure gate)
provides:
  - src/core/roster/transform.ts — pure classify / deriveMegaFormes / transform
  - src/core/roster/types.ts — the JSON-serializable snapshot shapes
  - public/data/roster.mb.json — committed Regulation M-B snapshot (235 draftable)
  - public/data/roster.ma.json — frozen Regulation M-A snapshot (ROST-06)
  - public/data/roster.{mb,ma}.js — D-17 classic-script hedge
  - public/data/roster.index.json — regulation manifest with the default pointer
  - npm run build:roster <id> [--accept-drift] — ROST-03 regeneration with a count gate
  - docs/roster-count-audit.md — the resolved 310/311, 207/208 and Mega-capable figures
  - tests/core/roster/fixtures.test.ts — ROST-12 regression pin over the real data
affects: [01-04, 01-05, 01-06, 01-07, 01-08, 01-09, 01-10, 01-11]

tech-stack:
  added:
    - pokemon-showdown@0.11.11 (devDependency only, exact pin)
  patterns:
    - "Mod names live in data, never as literals in code"
    - "Structure is read from fields (baseSpecies/forme/requiredItem/battleOnly), never parsed from a display name"
    - "The pure transform is imported directly as TypeScript by the Node generator, via type-only imports that erase"
    - "Generated artifacts carry a DO NOT EDIT header and a checksum over content only, so metadata churn does not invalidate them"
    - "Regeneration preserves generatedAt when the checksum is unchanged, so a no-op run produces no diff"

key-files:
  created:
    - src/core/roster/types.ts
    - src/core/roster/transform.ts
    - scripts/build-roster.mjs
    - scripts/roster-source.json
    - public/data/roster.mb.json
    - public/data/roster.ma.json
    - public/data/roster.mb.js
    - public/data/roster.ma.js
    - public/data/roster.index.json
    - docs/roster-count-audit.md
    - tests/core/roster/transform.test.ts
    - tests/core/roster/fixtures.test.ts
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "Mega detection is segment-anchored, not startsWith: Meowstic's formes are M-Mega and F-Mega, and a startsWith test loses both and drops the Mega count from 76 to 74"
  - "Mega ownership comes from battleOnly, not baseSpecies: it is the only field that puts Floette-Mega on Floette-Eternal and splits the two Meowstic Megas"
  - "Cosmetic detection compares abilities as well as types and base stats, because Meowstic-F matches its base on both of the latter and is a real draftable entry with its own Mega"
  - "The generator enumerates the built Dex rather than parsing formats-data.ts, because Meowstic-F has no explicit row and a raw parse silently loses it"
  - "The canonical Mega-capable figure is 74 draftable entries, not 73 base species, because the draftable unit is the row"
  - "pokemon-showdown is a devDependency at exact 0.11.11; the built bundle is unchanged at 11.58 kB"
  - "The pin of record is the npm version plus the lockfile integrity hash — no upstream SHA was invented"
  - "The .js hedge emits its payload on one line; the pretty-printed .json sibling is the review surface"

patterns-established:
  - "Pattern: every generated data file names its generator, its regulation, its timestamp and its checksum in a header"
  - "Pattern: a count gate that must be opted out of with an explicit flag, so drift lands in review rather than in a commit"
  - "Pattern: numeric claims in planning documents get re-derived and reconciled in writing before anything depends on them"

requirements-completed: [ROST-01, ROST-03, ROST-04, ROST-05, ROST-06, ROST-07, ROST-08, ROST-09, ROST-10, ROST-12]

duration: 30min
completed: 2026-08-04
---

# Phase 1 Plan 03: Roster Snapshot and Pure Transform Summary

**A regulation-stamped Champions roster — 235 draftable entries, 76 Mega formes across 74 Mega-capable rows — derived by a pure, tested transform, regenerable by a script that exits 1 on count drift, with all three of the project's conflicting roster counts reconciled to named species in writing.**

## Performance

- **Duration:** 30 min
- **Started:** 2026-08-04T18:53:57Z
- **Completed:** 2026-08-04T19:24:06Z
- **Tasks:** 3
- **Files created:** 12 (plus this summary)

## Task Commits

1. **Task 1 (RED): failing tests for the pure transform** — `8e25951` (test)
2. **Task 1 (GREEN): the pure transform** — `8077868` (feat)
3. **Task 2: generator, both snapshots, count audit** — `f4dfd3d` (feat)
4. **Task 3: ROST-12 hostile-species fixture test** — `4c5cb9f` (test)

## Accomplishments

- `src/core/roster/transform.ts` classifies every upstream species record into
  draftable / Mega forme / excluded, folds Megas onto the row they belong to as
  a flag (ROST-07, ROST-08), and produces a deterministic snapshot. It passes
  `npm run check:pure` — it is the first real code the SHEL-04 gate has had to
  judge, and it needed no adjustment to satisfy it.
- `npm run build:roster mb|ma` regenerates either regulation. The mod name never
  appears as a literal in the script; it is read from `scripts/roster-source.json`.
- Both regulations are committed. M-B is current, M-A is frozen for ROST-06.
- The count gate is real: perturbing one number in `expectedCounts` makes the
  run exit 1 with a diff table and write nothing. Verified, then restored.
- `docs/roster-count-audit.md` resolves the two mandated numeric chores by
  naming the exact species responsible for each off-by-one.
- 60 tests pass. `npm run verify` is green in ~4.6 s.

## The numbers

### Regulation M-B (mod `champions`)

| Count | Value |
|---|---|
| `legalEntries` | 311 |
| `baseSpecies` | 207 |
| `alternateFormes` | 104 |
| `megaFormes` | 76 |
| `megaCapableSpecies` | **74** |
| `draftable` | 235 |
| `distinctBaseSpecies` | 208 |
| `megaCapableBaseSpecies` | 73 |
| excluded: nonstandard / illegalTier / battleOnly / cosmetic | 1160 / 10 / 7 / 29 |

### Regulation M-A (mod `championsregma`)

273 legal / 185 base / 88 alternate / 60 Mega / 59 Mega-capable / 213 draftable /
186 distinct base species.

**Independent corroboration.** PITFALLS records community reporting of M-A as
"186 + 59 Megas". Running the frozen mod through this pipeline yields
`distinctBaseSpecies = 186` and `megaCapableSpecies = 59`. Two numbers from an
unrelated source landing exactly is the strongest evidence available that the
classifier counts the right things.

### The two mandated re-diffs, resolved

**310 vs 311 — the delta is `meowsticf` (Meowstic-F).**
There are three defensible populations, and each prior document counted a
different one without saying so:

| Population | Size | Who reported it |
|---|---|---|
| `formats-data.ts` rows with no `isNonstandard` | 314 | — |
| ...minus the 4 explicit battle-only rows this project drops (3 Castform weather formes + Aegislash-Blade) | **310** | ARCHITECTURE.md (with 234 non-Mega = 310 − 76) |
| ...plus Meowstic-F, which has no row of its own and inherits legality from Meowstic | **311** | PITFALLS.md (207 base + 104 alternate) |

Every one of ARCHITECTURE's and PITFALLS' numbers reproduces exactly under its
own definition. `meowsticf` is the **only** draftable entry in either regulation
with no explicit `formats-data` row — verified, not assumed. This project counts
311, because Meowstic-F is a real, legal, draftable Pokémon with its own ability
spread and its own Mega. It also explains why the generator enumerates a built
`Dex` instead of parsing the raw `.ts` file: a raw parse silently loses it.

**207 vs 208 — the delta is `floette` (Floette).**
207 counts base-forme *entries*; 208 counts distinct base *species*, which is
the unit PokeAPI's `champions` pokedex uses. Showdown's base `floette` is
`isNonstandard: "Past"`, but `floetteeternal` is legal — so the species is in
the regulation and its base forme is not. 207 + Floette = 208. CLAUDE.md's
"diffed against Showdown → zero difference" holds once the unit is stated. The
snapshot now carries both figures so the ambiguity cannot recur.

**Canonical Mega-capable count: 74 draftable entries** (73 distinct
`baseSpecies`). Phase 3's `players × megaRounds ≤ megaCapable − megaBans` must
use 74. The difference is Meowstic and Meowstic-F, which share a `baseSpecies`
but are two pool rows, each with its own Mega. Using 73 would under-report the
Mega pool and could reject a satisfiable configuration.

## FLAGGED FOR DEVELOPER RULING: Meganium contradicts ROADMAP criterion 2

**ROADMAP success criterion 2 states "Meganium is never offered as Mega-capable."
The champions mod says Meganium IS Mega-capable.**

```json
{ "name": "Meganium-Mega", "num": 154, "baseSpecies": "Meganium", "forme": "Mega",
  "requiredItem": "Meganiumite", "battleOnly": "Meganium",
  "isNonstandard": null, "tier": "OU", "types": ["Grass", "Fairy"] }
```

It has an **explicit** row in `champions/formats-data.ts` (not inherited), no
`isNonstandard`, a legal tier, and a stone. It is legal in both M-B and M-A.
This corroborates CLAUDE.md, which cites PokeAPI's `meganium-mega` at id 10282,
and STACK.md, which lists Meganium first among the Megas Champions added.

The data was not adjusted to match the roadmap, and the roadmap was not silently
adjusted either. `public/data/roster.mb.json` records `meganium` with
`megaCapable: true`, and `tests/core/roster/fixtures.test.ts` asserts it with a
comment naming the contradiction.

**How the error probably arose:** PITFALLS Pitfall 4(a) warns that filtering ids
by a "mega" substring returns 77 entries "exactly one of which — `meganium` — is
not a Mega". That is a warning about **base Meganium being misclassified as a
Mega forme**. It says nothing about whether Meganium *has* a Mega. Somewhere
between that warning and the roadmap it became "Meganium is not Mega-capable".

**The underlying warning is still live and is still tested.** `transform.ts`
derives Mega status from `forme` + `requiredItem` only; a transform test asserts
base Meganium classifies as `draftable`; a fixture test asserts `meganium`
appears exactly once in the snapshot and that no entry id is `meganiummega`.

**Suggested replacement wording for criterion 2:** "Meganium appears once in the
pool as a draftable base species — not as a separate `Meganium-Mega` row — and
is correctly flagged Mega-capable."

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Mega detection must be segment-anchored, not `startsWith('Mega')`**
- **Found during:** Task 1
- **Issue:** The plan's classify rule 3 says "`forme` starts with 'Mega' AND
  `requiredItem` is set". Measured against the real mod, that rule finds **74**
  Mega formes, not 76. `Meowstic-M-Mega` has `forme: "M-Mega"` and
  `Meowstic-F-Mega` has `forme: "F-Mega"` — neither starts with "Mega". Both
  would have fallen through to the battle-only rule and been silently deleted,
  taking Meowstic's Mega-capability with them. This is precisely the asymmetry
  PITFALLS Pitfall 4(d) warns about; the plan's own interface block quotes
  `M-Mega` as an example forme value while the rule below it cannot match one.
- **Fix:** `/(?:^|-)Mega(?:$|-)/` — a hyphen-delimited segment test. Anchored to
  segment boundaries rather than a substring, so a future `Omega` or `Megalith`
  forme cannot match. Two dedicated test cases cover both Meowstic Megas.
- **Files:** `src/core/roster/transform.ts`, `tests/core/roster/transform.test.ts`
- **Verification:** `megaFormes` = 76, matching PITFALLS' independently measured figure
- **Committed in:** `8077868`

**2. [Rule 1 - Bug] Cosmetic detection must compare abilities, or it deletes Meowstic-F**
- **Found during:** Task 1
- **Issue:** The plan's classify rule 5 excludes a forme whose `types` and
  `baseStats` both deep-equal its base species. Measured against the real mod,
  that rule catches 35 formes — and one of them is **Meowstic-F**, which has
  identical types (`Psychic`) and identical base stats to Meowstic. Applying the
  rule as written deletes a legal draftable Pokémon, drops `draftable` from 235
  to 234, drops `megaCapableSpecies` from 74 to 73, and discards `Meowstic-F-Mega`
  entirely. It also contradicts the plan's own Task 3, which requires
  `meowsticf` to be present.
- **Fix:** The comparison now also requires `abilities` to be equal. Meowstic-F
  has Competitive where Meowstic has Prankster, so it survives; the 19 Vivillon
  entries, 7 Alcremie sweets, Polteageist-Antique, Maushold-Four and
  Sinistcha-Masterpiece are all still collapsed (29 cosmetic exclusions).
- **Rejected alternative:** keying off Showdown's `cosmeticFormes` array. That
  under-excludes — `Vivillon-Fancy` and `Vivillon-Pokeball` are real `pokedex`
  entries outside that array, so three Vivillons would reach the pool.
- **Files:** `src/core/roster/transform.ts`, `tests/core/roster/transform.test.ts`
- **Verification:** exactly one `vivillon` and one `alcremie` row; both Meowstics present
- **Committed in:** `8077868`

**3. [Rule 1 - Bug] Mega ownership comes from `battleOnly`, not `baseSpecies`**
- **Found during:** Task 1
- **Issue:** The plan says `deriveMegaFormes` "collects every legal species
  whose `baseSpecies` resolves to the same id", and separately requires
  `deriveMegaFormes('floette', ...)` to return `[]`. Those two statements are
  incompatible against real data: `floettemega` has `baseSpecies: "Floette"`, so
  a `baseSpecies` rule returns it. It also merges both Meowstic Megas onto one
  owner.
- **Fix:** ownership is `toID(battleOnly)` when `battleOnly` is a string, falling
  back to `baseSpecies`. All 76 Mega formes in this release carry a string
  `battleOnly` — verified. This puts `floettemega` on `floetteeternal` (correct —
  it reverts there), and splits the Meowstic Megas across two owners.
- **Files:** `src/core/roster/transform.ts`
- **Verification:** `orphanedMegaFormes` = 0 in both regulations
- **Committed in:** `8077868`

**4. [Rule 2 - Missing Critical] Four extra counts added to the snapshot**
- **Found during:** Task 2
- **Issue:** The plan's `counts` list cannot express the audit it also mandates.
  Resolving 310-vs-311 needs `excludedIllegalTier` separated from
  `excludedBattleOnly`; resolving 207-vs-208 needs `distinctBaseSpecies`
  alongside `baseSpecies`; stating the canonical Mega figure needs
  `megaCapableBaseSpecies` alongside `megaCapableSpecies`; and detecting a Mega
  whose owner vanished needs `orphanedMegaFormes`.
- **Fix:** added those four. The count gate compares **every** key, not only the
  six the plan named — strictly more drift is caught, never less.
- **Files:** `src/core/roster/types.ts`, `src/core/roster/transform.ts`, `scripts/build-roster.mjs`
- **Committed in:** `8077868`, `f4dfd3d`

**5. [Rule 2 - Missing Critical] `DO NOT EDIT BY HAND` guard on the `.json` files too**
- **Found during:** Task 2
- **Issue:** Threat T-01-17 requires every emitted file to carry the header. The
  plan's acceptance criteria only require it on the `.js` files, because JSON
  cannot carry a comment — which would have left the two most important
  artifacts unguarded.
- **Fix:** leading `$doNotEditByHand` and `$generator` fields on each snapshot.
  `checksum` remains what makes an edit *detectable*; these make it obvious first.
- **Files:** `scripts/build-roster.mjs`
- **Committed in:** `f4dfd3d`

**6. [Rule 3 - Blocking] Doc-comment wording changed to satisfy the plan's own grep**
- **Found during:** Task 1
- **Issue:** The acceptance criterion `grep -n "includes('mega')\|split('-')"
  src/core/roster/transform.ts` produces no matches — but the natural way to
  document *why* those patterns are banned is to quote them, which makes the
  gate count its own documentation. Exactly the failure mode plan 01-01 designed
  the purity checker to avoid.
- **Fix:** the warning is stated in prose ("never substring-test an `id` for the
  four letters of Mega"; "never break a display name on hyphens") with the
  species that break each. Same information, zero literals. Criterion satisfied.
- **Files:** `src/core/roster/transform.ts`
- **Committed in:** `8077868`

### Plan expectations that the data contradicts

These are not fixes — they are places where the plan asserted something about
the data that turned out to be false. The tests assert reality, as the plan
itself instructed ("pin reality, not agree with a document").

| Plan says | Data says | Where it is recorded |
|---|---|---|
| "`floette` exists with `megaCapable: false`" | `floette` is `isNonstandard: "Past"` and is absent entirely; `floetteeternal` carries the Mega | fixtures.test.ts, audit §2b |
| "`farfetchd` is present and its `name` is compared with the U+2019 form" | `Farfetch’d` is `isNonstandard: "Past"` — not legal in M-B. Asserting its presence would assert a fiction | fixtures.test.ts, audit §6 |
| "Meganium is never offered as Mega-capable" (ROADMAP) | `Meganium-Mega` is explicitly legal with a stone | fixtures.test.ts, audit §4, flagged above |
| CLAUDE.md: "9 battleOnly, 30 cosmetic" | 7 battle-only + 10 more removed earlier by `tier: "Illegal"` (17 total); 29 cosmetic | audit §5 |

The U+2019 assertion was kept meaningful rather than dropped: the fixture test
asserts no legal name currently contains U+2019, and separately runs a synthetic
`Farfetch’d` record through `transform` to prove the code point survives
verbatim and that `"Farfetch'd" !== name`. The hazard is one regulation away and
is now pinned in advance rather than discovered live.

### Sequencing notes

- **`package.json` was modified in Task 2's commit, not Task 1's**, matching the
  plan's file assignment. The only changes are the `build:roster` script and the
  `pokemon-showdown` devDependency; all seven scripts from plan 01-01 are intact.
- **Regeneration preserves `generatedAt` when the entries checksum is unchanged.**
  Not in the plan; added so a no-op regeneration produces a genuinely empty diff
  rather than a timestamp-only one. A changed roster still restamps.

---

**Total deviations:** 6 auto-fixed (3 bugs, 2 missing-critical, 1 blocking) + 4 recorded data contradictions
**Impact on plan:** deviations 1-3 were required for the plan's own Task 3 assertions to be satisfiable at all. No scope creep.

## TDD Gate Compliance

Task 1 ran a clean RED → GREEN cycle: `8e25951` (`test(...)`, failing — module
did not exist) then `8077868` (`feat(...)`, 30/30 passing). No REFACTOR commit —
the implementation needed no cleanup pass.

**Task 3 is marked `tdd="true"` in the plan but has no GREEN phase, by
construction.** It is a characterization test over data that Task 2 already
produced; it has no implementation step and adds no behaviour. Writing it as RED
would have required deleting the snapshot the plan told Task 2 to commit. It
landed as a single `test(...)` commit.

To confirm it is not vacuously passing, it was mutation-checked: deleting
`meowsticf` from `public/data/roster.mb.json` — the exact entry the plan's
as-written cosmetic rule would have removed — fails 4 of its 26 assertions. The
snapshot was restored and `git status` confirmed clean.

## Verification Evidence

```
npx vitest run tests/core/roster/transform.test.ts   → 30 passed
npx vitest run tests/core/roster/fixtures.test.ts    → 26 passed
npx vitest run                                       → 3 files, 60 passed
node scripts/check-pure-core.mjs src/core            → 0 violations in 2 files
npm run typecheck                                    → clean, both tsconfigs
npm run verify                                       → green in 4.6 s
npm run build:roster mb                              → exit 0
npm run build:roster ma                              → exit 0
npm run build:roster mb (2nd run)                    → exit 0, byte-identical file
npm run build:roster (no argument)                   → exit 1, refuses
grep "'champions'" scripts/build-roster.mjs          → no matches
grep "includes('mega')\|split('-')" transform.ts     → no matches
grep -c "export function classify|deriveMegaFormes|transform" → 3
```

**Count gate, proven in both directions.** With `expectedCounts.megaFormes`
changed from 76 to 75 and `draftable` from 235 to 999:

```
build-roster: COUNT DRIFT for regulation M-B (mod "champions").

  count       expected  measured
  -----       --------  --------
  megaFormes  75        76
  draftable   999       235

Nothing was written. Investigate, then re-run with --accept-drift to record
the new expectations deliberately.
EXIT_CODE=1
```

`scripts/roster-source.json` was restored afterwards and verified back at 76.

**Missing-mod path, proven.** With the mod renamed to a non-existent
`championsregmz`, the script exits 1, names the mod, and lists all 47 mods that
do exist — it does not fall back:

```
build-roster: mod "championsregmz" (regulation M-B) could not be loaded ...
Mods that DO exist in the installed package:
  afd, biomechmons, ccapm2025, champions, championsregma, chatbats, ...
Not falling back to any other mod.
```

**Classic-script hedge, proven.** Both `.js` files were evaluated in a `node:vm`
sandbox: `__CHAMPIONS_ROSTER__` is assigned, `__CHAMPIONS_ROSTER_BY_REGULATION__`
holds keys `mb, ma`, and the registry's `mb` checksum equals the `.json` sibling's.

**Bundle impact: none.** `dist/assets/index-*.js` is 11.58 kB / 4.95 kB gzipped —
byte-identical to plan 01-01's build. `vite build` copies `public/data/` into
`dist/data/` as expected.

## Dependency Discipline

```
runtime dependencies: @preact/signals, preact          (exactly two, unchanged)
pokemon-showdown:     devDependencies only, exact 0.11.11
```

`npm audit` now reports **11 vulnerabilities (1 critical, 6 high, 2 moderate,
2 low)**, all introduced by `pokemon-showdown`'s 300-package transitive tree
(deprecated `tar@6.2.1`, `uuid@8.3.2`, `gauge`, `are-we-there-yet`,
`prebuild-install`). Stated plainly rather than buried:

- Every one is a **devDependency, build-time only**. Zero bytes reach the browser.
- They are reachable only when a maintainer runs `npm run build:roster` locally.
- They are **not** reachable from CI unless a workflow runs the roster script,
  which none does today.
- `npm audit fix --force` would move off the pinned `0.11.11`, which is the pin
  the roster's legality data depends on. Not done.

This is worth a deliberate decision rather than a silent accept. The cleanest
future option is to run `build:roster` from a separate lockfile or a container
rather than the app's own `node_modules`, but that is not this plan's scope.

## Threat Model Coverage

| Threat ID | Disposition | Status |
|---|---|---|
| T-01-SC (tampering via npm install) | mitigate | **Done.** Pinned exact `0.11.11`; integrity hash committed in `package-lock.json` and echoed in `roster-source.json` as the pin of record; devDependency only; verified zero bundle impact. Legitimacy was cleared in plan 01-01's blocking checkpoint. Caveat: 11 transitive advisories, all dev-only — see above. |
| T-01-08 (silent regulation swap) | mitigate | **Done.** Mod name exists only in `scripts/roster-source.json`; the count gate compares every count and exits 1 on any drift; `--accept-drift` is required to rewrite and prints a banner; an unknown mod fails loudly with the list of real ones instead of falling back. |
| T-01-17 (hand-edited generated snapshot) | mitigate | **Done.** `.js` files carry a `DO NOT EDIT BY HAND` header comment; `.json` files carry `$doNotEditByHand` and `$generator` fields; every file carries a SHA-256 over the canonical JSON of `entries` only, so a hand edit is detectable and metadata churn is not a false positive. |
| T-01-18 (display names into the DOM) | mitigate | **Partial — as designed.** The snapshot stores `name` as inert text; no field contains markup; nothing is interpolated as HTML here. The rendering half belongs to plan 01-05. Confirmed the legal set is currently entirely ASCII with no angle brackets, quotes or ampersands in any name. |
| T-01-19 (oversized snapshot) | accept | **Measured, over estimate.** `roster.mb.json` 137 KB + `roster.mb.js` 77 KB; `roster.ma.json` 120 KB + `roster.ma.js` 68 KB; index 1.8 KB. **~403 KB total**, against the register's "roughly 60-120 KB per regulation". The `.js` payload was emitted on one line to hold this down (it would otherwise be ~265 KB more). Plan 01-11's service worker precaches all of it, so the figure is worth re-checking against the sprite budget there. |

No new threat flags. No new network endpoints, auth paths, file access patterns
or trust boundaries were introduced.

## Known Stubs

| File | Field | Stub | Why |
|---|---|---|---|
| `public/data/roster.*.json` | `spriteMissing` | Always `false` | ROST-11 is not this plan's requirement. `transform` accepts a `missingSpriteIds` list and flags correctly when given one (covered by a test); the generator passes an empty list because it has no offline sprite inventory to check against yet. The sprite plan wires this up. |
| `public/data/roster.*.json` | `spriteId` | Derived, never verified | Derived from `baseSpecies` + `forme` per PITFALLS Pitfall 5. No file or HTTP existence check is performed. |

Neither stub blocks this plan's goal. Nothing renders yet.

## Issues Encountered

- **PITFALLS' headline count of 311 legal entries is reproducible; its 76 Mega
  formes and 73 Mega-capable base species are too.** The document's numbers were
  measured on 2026-08-03 against GitHub master while this project uses npm
  `0.11.11`; they agree exactly. That is reassuring for the pin.
- **`Dex.mod()` does not throw a clean error for an unknown mod** — it fails
  later with `Cannot read properties of undefined (reading 'includeData')`. The
  script forces a data load immediately after `Dex.mod()` so the failure surfaces
  at the right place, and reports the real mod list alongside it.
- **CRLF warnings on every `git add`** persist from plan 01-01. Still cosmetic,
  still un-fixed, still arguably wanting a `.gitattributes`. Now slightly more
  relevant, since the repo contains 400 KB of generated text whose line endings
  a Windows checkout will rewrite.

## User Setup Required

None. `npm ci` installs everything, including the devDependency the roster
script needs.

## Orchestrator Follow-Ups

- **`.planning/REQUIREMENTS.md` was deliberately NOT modified.** ROST-01, 03, 04,
  05, 06, 07, 08, 09, 10 and 12 are all satisfied by this plan and still read
  Pending. The file is shared across the parallel wave-2 worktrees, so this
  worktree left it alone. Mark them complete centrally.
- **`STATE.md` and `ROADMAP.md` were not touched**, per the dispatch instructions.
- **ROADMAP success criterion 2 needs a developer ruling on Meganium** — see the
  flagged section above. Suggested replacement wording is provided.
- **`.github/workflows/deploy.yml` and `README.md` were not touched**, per the
  parallel-execution instructions. Worth noting for whoever owns the workflow:
  the roster is committed, so CI needs no roster step. If a scheduled
  regeneration workflow is ever added (ARCHITECTURE pipeline rule 6), it must
  open a PR rather than commit, so the count-gate diff lands in review.

## Next Phase Readiness

Ready. Downstream plans now have:

- A committed, regulation-stamped pool of 235 draftable entries with
  Mega-capability as a flag, at `public/data/roster.mb.json`.
- `validFrom` / `validUntil` on every snapshot, so the config screen's staleness
  banner is a date comparison with no network.
- `roster.index.json` naming `mb` as the default and listing both regulations,
  so a regulation picker is a manifest read.
- The canonical figure Phase 3's feasibility solver needs: **74**.
- A regression net that will fail loudly the first time a regulation rotation
  changes the meaning of the pool.

One thing the pool-rendering plan should know: three entries carry more than one
Mega in M-B — Charizard and Raichu (X/Y each). Meowstic is **not** a third,
despite PITFALLS listing it: its two Megas belong to two different rows.
Picking one of those entries in a Mega round leaves the X-vs-Y choice undefined
(PITFALLS Pitfall 4(c)); the data supports either resolution, and the choice is
a UI decision, not a data one.

## Self-Check: PASSED

All 12 created files verified present on disk. All 4 task commits verified
present in `git log`: `8e25951`, `8077868`, `f4dfd3d`, `4c5cb9f`.

---
*Phase: 01-draft-skeleton-on-a-real-url*
*Completed: 2026-08-04*
