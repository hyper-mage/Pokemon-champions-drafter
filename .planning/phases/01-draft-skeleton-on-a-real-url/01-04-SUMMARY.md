---
phase: 01-draft-skeleton-on-a-real-url
plan: 04
subsystem: sprite-assets
tags: [sprites, pokeapi, licensing, attribution, offline, build-time, png, measurement]

requires:
  - 01-02 (README, fan-project disclaimer, deploy workflow)
  - 01-03 (roster snapshots, spriteId/spriteMissing fields, build-roster.mjs conventions)
provides:
  - public/sprites/ — 311 committed PokeAPI PNGs, all 96x96, 393 KB total
  - public/sprites/_placeholder.png — D-04 generic fallback, generated at 96x96
  - public/data/sprite-meta.json — measured dimensions + rosterId -> {pokeapiId, file, slug}
  - scripts/build-sprites.mjs — id resolution, download, PNG validation, IHDR measurement, gap recording
  - scripts/pokeapi-slug-overrides.json — 17 audited PokeAPI/Showdown naming reconciliations
  - npm run build:sprites / npm run build:data
  - ATTRIBUTION.md — the resolved PokeAPI sprite licence, quoted and dated
affects: [01-05, 01-06, 01-07, 01-11]

tech-stack:
  added: []
  patterns:
    - "A 404 is a recorded gap and exits 0; a transport failure exits 1 and writes nothing — they are different events and are not conflated"
    - "Every downloaded byte stream is validated against PNG magic before it is written to disk"
    - "Both hosts are hardcoded constants; only integers from PokeAPI's own index are substituted into a fixed path template"
    - "A base forme's PokeAPI id equals its National Dex number — used as an independent second opinion that catches an override aimed at the wrong species"
    - "One writer per file: build-sprites delegates spriteMissing back to build-roster rather than patching JSON in place, so the .json, the .js sibling and the index never disagree about a checksum"
    - "A measurement replaces an assumption in writing, and the document that made the assumption is corrected"

key-files:
  created:
    - scripts/build-sprites.mjs
    - scripts/pokeapi-slug-overrides.json
    - public/data/sprite-meta.json
    - public/sprites/ (311 PNGs + _placeholder.png)
    - ATTRIBUTION.md
  modified:
    - scripts/build-roster.mjs
    - package.json
    - .gitignore
    - README.md

key-decisions:
  - "PokeAPI's CC0 covers its repository, NOT the Pokemon artwork — LICENCE.txt says so before it declares CC0, and ATTRIBUTION.md records the distinction rather than claiming the sprites are public domain"
  - "190 of 311 sprites are Smogon community art (PokeAPI id > 650), so the spriter credit is load-bearing, not decorative"
  - "roster spriteId stays the stable derived slug; sprite-meta.json owns the rosterId -> filename mapping, so a PokeAPI id change never rewrites 584 roster rows"
  - "Sprite files are named by PokeAPI numeric id, not by slug, because the id is the thing PokeAPI guarantees"
  - "96x96 is now a measurement with zero outliers across all 311 files, not the unconfirmed working assumption UI-SPEC recorded"

requirements-completed: [ROST-11]

duration: 2 sessions (~50 min total)
completed: 2026-08-04
---

# Phase 1 Plan 04: Sprite Set and Attribution Summary

**311 PokeAPI sprite PNGs committed and measured — all exactly 96×96, zero outliers, 393 KB total — with every one of the 584 sprite targets across both regulations resolving to a real file on disk, and the PokeAPI sprite licence that CLAUDE.md rated LOW-confidence now read, quoted verbatim, dated, and correctly distinguished from the artwork copyright it does not cover.**

## Execution note: this plan ran across two dispatches

Task 1 was executed by a prior executor which was then terminated mid-plan by a
provider session quota limit — not a code failure. Its work was merged cleanly and
is commit `845d25c`. **This summary credits that work; the continuation executor
did not perform it.** The continuation executor verified Task 1's output against
the plan's acceptance criteria (re-running the build, re-validating all 312 PNGs,
cross-checking every roster target against the files on disk) and then executed
Task 2. Both halves are recorded below with their commits.

## Performance

- **Duration:** ~50 min across two sessions
- **Completed:** 2026-08-04
- **Tasks:** 2
- **Files created:** 316 (311 sprites + placeholder + 3 scripts/data + ATTRIBUTION.md)

## Task Commits

| Task | What | Commit | Type |
| --- | --- | --- | --- |
| 1 | PokeAPI id resolution, 311 sprite downloads, IHDR measurement, placeholder, roster write-back | `845d25c` | feat |
| 2 | PokeAPI sprite licence resolved in writing; ATTRIBUTION.md; README credits section | `fa5fc8f` | docs |

`845d25c`: 318 files changed, 2,516 insertions.
`fa5fc8f`: 2 files changed, 197 insertions.

## Accomplishments

### The 96px assumption is now a measurement

UI-SPEC recorded 96px as "an unconfirmed working assumption". It is now a fact:

```
native size      96x96 (read from IHDR, not assumed)
distinct sizes   96x96:311
```

**Zero outliers across all 311 files.** The histogram has exactly one bucket. The
dimensions are read straight out of the PNG IHDR chunk — bytes 16–19 big-endian
width, 20–23 height — with no image library and therefore no new dependency.
`--sprite-lg: 96px` and `--sprite-sm: 48px` stand exactly as UI-SPEC wrote them,
and `_placeholder.png` is generated at 96×96 so a gap can never break grid rhythm.

### Every sprite target resolves to real art

| Regulation | Sprite targets | Resolved | `spriteMissing: true` | Pointing at a file that is not on disk |
| --- | --- | --- | --- | --- |
| M-B | 311 (235 entries + 76 Megas) | 311 | 0 | **0** |
| M-A | 273 (213 entries + 60 Megas) | 273 | 0 | **0** |

584 target checks, zero false claims of present art. The D-05 machinery
(`spriteMissing`, the placeholder, the "have no sprite" summary) is built and
exercised, but the coverage gap it exists for does not currently exist —
PokeAPI has art for every legal Champions Pokémon in both regulations, including
every new Champions Mega.

### The 17 overrides are reconciliations, not workarounds

`scripts/pokeapi-slug-overrides.json` documents that every row exists for exactly
one of two reasons, and the file says which:

1. **PokeAPI names a default forme where Showdown leaves it bare.** `aegislash` →
   `aegislash-shield`, `gourgeist` → `gourgeist-average`, `mimikyu` →
   `mimikyu-disguised`, `lycanroc` → `lycanroc-midday`, `palafin` → `palafin-zero`,
   `morpeko` → `morpeko-full-belly`, `maushold` → `maushold-family-of-three`. The
   two projects genuinely disagree about whether a default forme has a name, so
   no derivation rule can bridge it.
2. **PokeAPI spells out a suffix Showdown abbreviates.** `meowsticf` →
   `meowstic-female`, `taurospaldeaaqua` → `tauros-paldea-aqua-breed`.

Note `taurospaldeacombat` → `tauros-paldea-combat-breed`. That is one of the two
species CLAUDE.md flagged as a confirmed 404 on the Showdown sprite sets. It
resolves cleanly on PokeAPI, which corroborates the sourcing decision.

### Size, well inside budget

393 KB for 312 files, against CLAUDE.md's estimate of 500–700 KB. Combined with
plan 01-03's ~403 KB of roster data, plan 01-11's service worker has roughly
800 KB to precache — worth carrying forward.

## The licence gate: PASSED, with the nuance recorded

This was a hard gate. CLAUDE.md rated PokeAPI sprite licensing **LOW confidence —
genuinely unresolved**, and the plan said not to assume permissive terms because
the files were easy to download.

**Read:** `https://raw.githubusercontent.com/PokeAPI/sprites/master/LICENCE.txt`
on **2026-08-04**. British spelling confirmed — the American `LICENSE.txt` at that
path returns **HTTP 404**, exactly as CLAUDE.md warned. The real file is 6,654
bytes and opens, verbatim:

> All image contents within are Copyright The Pokémon Company.
>
> This repository is distributed under CC0 1.0 Universal

The remainder is the standard CC0 1.0 Universal legal code from its "Statement of
Purpose" heading onward.

**The verdict, and the part that is easy to get wrong.** Redistribution of the
sprite files **is permitted** — PokeAPI places its repository under CC0 and
imposes no downstream conditions. But the CC0 grant **does not reach the artwork**.
PokeAPI states the image contents are Copyright The Pokémon Company *before* it
declares CC0, and CC0 can only waive rights the party applying it actually holds.
PokeAPI does not hold copyright in Pokémon artwork and cannot place it in the
public domain.

So: PokeAPI raises no obstacle to shipping these files, and the sprites are **not**
public domain. `ATTRIBUTION.md` states this distinction explicitly rather than
quoting "CC0" and stopping there, because the shorter reading would be a false
claim in a permanent legal file. This is exactly why the project's posture must
stay non-commercial with no ads and a visible disclaimer — the permission that
actually matters is not CC0, it is the ordinary tolerance extended to
non-commercial fan works, which is a posture rather than a licence.

**The Smogon credit is load-bearing, not decorative.** PokeAPI's README states
that `sprites/pokemon/` is "the official B&W sprites on top of custom sprites
designed by the Smogon community" and that "sprites with IDs greater than 650 are
thus not official". Measured against what is actually committed here:

```
distinct ids 311   >650 (Smogon custom) 190   <=650 (official B/W) 121
```

**A clear majority of the art in this repository is Smogon community work**,
including every Mega forme. ATTRIBUTION.md therefore reproduces the full spriter
name list from PokeAPI's README into this repository rather than only linking to
it.

`ATTRIBUTION.md` also reproduces `pokemon-showdown`'s MIT notice in full, read
from `node_modules/pokemon-showdown/LICENSE` at the pinned `0.11.11` — including
`Copyright (c) 2011-2026 Guangcong Luo and other contributors`, which matches
CLAUDE.md's licensing table exactly.

## Deviations from Plan

### Task 1 (prior executor) — design deviations, both defensible

**1. [Rule 2 - Missing Critical] `spriteMissing` is delegated to `build-roster.mjs`, not patched into the JSON in place**

- **Plan said:** write `spriteId`/`spriteMissing` directly into `roster.mb.json`
  and `roster.ma.json`, recomputing the checksum with the same canonical-JSON
  routine `build-roster.mjs` uses.
- **Why that is a trap:** each regulation has three artifacts — `roster.<id>.json`,
  the classic-script `roster.<id>.js` hedge, and `roster.index.json`, which all
  carry the same checksum. Patching only the `.json` would leave three artifacts
  stating two different answers for the same data. `transform.ts` already accepts
  a `missingSpriteIds` list and derives `spriteMissing` from it (a capability plan
  01-03 built and tested but had no inventory to feed).
- **Fix:** `build-sprites.mjs` compares the flags it wants against the flags
  already stamped and shells out to `build-roster.mjs` only when they differ. One
  writer per file; a healthy re-run touches nothing.

**2. [Rule 3 - Blocking] `spriteId` stays the derived slug; `sprite-meta.json` owns the filename mapping**

- **Plan said:** "set `spriteId` to the PokeAPI numeric id".
- **What shipped:** `spriteId` keeps plan 01-03's derived slug (`abomasnow`,
  `abomasnow-mega`); `sprite-meta.json.byRosterId` maps roster id →
  `{ pokeapiId, file, slug }`, and files are named by PokeAPI id (`460.png`).
- **Why:** the plan also required "preserve the existing key order and the entry
  sort so the diff stays readable" — overwriting `spriteId` on all 584 rows in
  both regulations is the opposite of that, and it would couple the roster
  snapshot's checksum to PokeAPI's id space, so an upstream id change would
  rewrite the roster. The plan's own acceptance criterion is written against
  `m.byRosterId[e.id]`, not against `spriteId`, so the criterion is satisfied as
  written.
- **Consumer note for plan 01-05:** build a sprite `src` from
  `sprite-meta.json.byRosterId[entry.id].file`, **not** from
  `sprites/${entry.spriteId}.png`. The latter 404s on every entry.

**3. [Rule 2 - Missing Critical] National Dex number as an independent second opinion on every resolution**

- **Not in the plan.** A hand-maintained override file is a place where a typo
  silently commits the *wrong Pokémon's art* — which is worse than a recorded gap,
  because nothing fails and the picture just looks slightly wrong to someone who
  knows the species.
- **Fix:** a base forme's PokeAPI id equals its National Dex number. The script
  cross-checks every default-forme resolution against the roster's own `num` and
  refuses to write on any mismatch. The roster's `num` is an entirely independent
  source from PokeAPI's slug index, so this catches an override aimed at the wrong
  species.

**4. [Rule 2 - Missing Critical] A 404 and a dropped connection are treated as different events**

- **Plan said:** on a 404, record `spriteMissing`, print a summary, exit 0.
- **Gap:** a network drop is not upstream slowness. Recording 311 species as
  artless on the evidence of dropped wifi would be committed, permanent, and
  silently wrong.
- **Fix:** a 404 is a recorded gap and exits 0 (D-05 as written). A transport
  failure exits 1, writes nothing, and says so. Files already downloaded stay on
  disk, so a re-run resumes rather than restarts.

### Task 2 (continuation executor)

**5. [Rule 2 - Missing Critical] README's script table had gone stale**

- **Found during:** Task 2's README edit.
- **Issue:** the "Other scripts" table claims to enumerate the project's scripts
  but predated `build:roster`, `build:sprites` and `build:data`, all of which now
  exist in `package.json`. A table that claims completeness and is not complete is
  a documentation bug.
- **Fix:** added the three rows, plus a note that they regenerate committed data
  and are **not** needed to run the app — the snapshots and all 311 sprites are
  already in the repository, which is precisely what makes the app work offline.
- **Files:** `README.md` · **Commit:** `fa5fc8f`

**No deviation on the licence itself.** The gate was evaluated on the actual file
text, and both the CC0 grant and its limit are recorded.

**Total deviations:** 5 auto-fixed (4 missing-critical, 1 blocking). No Rule 4
architectural escalations. No checkpoints hit.

## Verification Evidence

```
npm run verify                        → green
  check:pure                          → 0 violations in 2 files under src/core
  vitest run                          → 3 files, 60 passed
  typecheck (both tsconfigs)          → clean
  vite build                          → 11.58 kB / gzip 4.95 kB

npm run build:sprites (re-run)        → exit 0
  downloaded 0, already on disk 311, placeholder unchanged, overrides used 17
  "0 of 311 targets have no sprite"
  git status --short                  → clean (byte-identical sprite-meta.json)

312 PNG files, 0 with invalid magic bytes
_placeholder.png                      → 96x96, matches nativeWidth/nativeHeight
dist/sprites/                         → 312 files copied by vite build
git check-ignore scripts/.cache/      → ignored (.gitignore:10)
```

**Idempotency, proven properly.** The re-run left `sprite-meta.json` **byte-identical**
to `HEAD` (32,954 bytes both sides, `Buffer.equals` true) — the `generatedAt`
preservation mirrors `build-roster.mjs`'s no-op posture. Worth recording: `git
status --porcelain` briefly reported the file as modified anyway. That is a
Windows CRLF stat-cache artifact, not a content change — `git diff` reports zero
changed lines and the byte comparison confirms it. This is the same friction plan
01-03 flagged, and it is now a second vote for adding a `.gitattributes`.

**Every plan acceptance criterion, checked:**

| Criterion | Result |
| --- | --- |
| ≥300 PNG files in `public/sprites/` | 312 |
| All files pass the PNG magic check | 312/312 |
| `nativeWidth`/`nativeHeight` are positive ints from real IHDR bytes | 96 / 96 |
| Every `roster.mb.json` entry has `spriteId` + boolean `spriteMissing` | 235/235 |
| Every `megaFormes` object has `spriteId` | 76/76 (M-B), 60/60 (M-A) |
| No non-missing entry unmapped in `byRosterId` | 0 unmapped |
| Re-run exits 0, downloads nothing, leaves `public/sprites` clean | confirmed |
| Script contains PNG magic check and IHDR bytes 16–23 | confirmed |
| Stdout contains `have no sprite` | confirmed |
| `ATTRIBUTION.md` contains the literal `LICENCE.txt` URL + date read | confirmed |
| `ATTRIBUTION.md` states explicitly whether redistribution is permitted | confirmed |
| `ATTRIBUTION.md` contains `Copyright (c) 2011-2026 Guangcong Luo` | confirmed |
| `ATTRIBUTION.md` names PokeAPI and the Smogon spriters | confirmed (52 spriters by name) |
| Non-commercial statement naming Nintendo, Creatures, GAME FREAK | confirmed |
| `_placeholder.png` valid PNG, dims equal `nativeWidth`/`nativeHeight` | 96×96 |
| `README.md` links to `ATTRIBUTION.md` | confirmed |

## Dependency Discipline

```
runtime dependencies: @preact/signals@2.10.1, preact@10.29.8   (exactly two, unchanged)
bundle:               11.58 kB / 4.95 kB gzipped               (byte-identical to 01-01 and 01-03)
```

No third runtime dependency. No new devDependency either — the plan's hardest
constraint here was measuring PNG dimensions and *encoding* a PNG without an image
library, and both are done with `node:zlib` and raw `Buffer` reads. The 393 KB of
sprites are static assets copied by Vite, not bundled JavaScript.

`npm audit`'s 11 advisories are unchanged from plan 01-03 and remain entirely
transitive through the `pokemon-showdown` devDependency. `npm audit fix --force`
was **not** run — it would break the `0.11.11` pin the legality data rests on.

## Threat Model Coverage

| Threat ID | Disposition | Status |
| --- | --- | --- |
| T-01-20 (tampered sprite bytes) | mitigate | **Done.** Every response is checked against PNG magic `89504e470d0a1a0a` before a byte is written; a 404 page or redirect body is recorded as a miss, never committed as a `.png`. Re-verified: 312/312 files pass. |
| T-01-21 (attacker-controlled fetch URL) | mitigate | **Done.** Both hosts are module-level constants. The only value substituted into a URL is an integer taken from PokeAPI's own index. No roster field can steer a request. Strengthened beyond the plan by the National Dex cross-check, which catches an override pointing at the wrong species. |
| T-01-22 (~1 MB first load) | accept | **Measured and better than estimated.** 393 KB of sprites, not ~1 MB. Precached once by plan 01-11's service worker. |
| T-01-23 (shipping art without licence clearance) | mitigate | **Done — the gate was the work.** `LICENCE.txt` read on 2026-08-04, quoted verbatim, and its limit recorded: CC0 covers PokeAPI's repository, not the artwork. |
| T-01-24 (broken-image glyphs) | mitigate | **Done.** `spriteMissing` is resolved at build time so the runtime never fires a request it knows will 404, and the D-04 placeholder is committed at the exact native size. Currently zero gaps in either regulation. |

No new threat flags. The only new trust boundary — third-party binaries entering
the repository — is the one the plan's register already anticipated, and it is
mitigated at the byte level.

## Known Stubs

None. Plan 01-03's two recorded stubs are both now resolved:

| 01-03 stub | Status |
| --- | --- |
| `spriteMissing` always `false` because the generator had no sprite inventory | **Resolved.** There is now a real inventory. The value is still `false` everywhere, but that is now a measured fact rather than a placeholder — all 584 targets have art. |
| `spriteId` derived, never verified | **Resolved.** Every roster id is verified against PokeAPI's index, cross-checked against the National Dex number, and mapped to a file that exists on disk. |

## Issues Encountered

- **`node_modules` was absent in the continuation worktree.** `npm ci` from the
  committed lockfile restored it in one step with no lockfile change. Worth knowing
  for anyone dispatching work into a fresh worktree: `npm run verify` cannot run
  until it is installed.
- **CRLF stat-cache noise persists on Windows** (see Verification Evidence). Third
  plan in a row to hit it. A `.gitattributes` would end it.

## User Setup Required

None. The sprites are committed; `npm ci && npm run dev` is enough. `npm run
build:sprites` is only needed when a regulation rotates or upstream art changes.

## Orchestrator Follow-Ups

- **`STATE.md` and `ROADMAP.md` were not touched**, per dispatch instructions.
  `.planning/REQUIREMENTS.md` was also left alone — **ROST-11 is satisfied and
  should be marked complete centrally.**
- **Nothing was pushed and no remote was touched.**
- **A `.gitattributes` is now wanted by three consecutive plans.** With 393 KB of
  binary PNGs added to ~403 KB of generated text, a Windows checkout rewriting
  line endings is worth pre-empting. Suggest `* text=auto eol=lf` plus
  `*.png binary`.
- **Plan 01-05 must read sprite filenames from `sprite-meta.json`, not from
  `entry.spriteId`.** See deviation 2. This is the single most likely way to get a
  broken pool grid.

## Next Phase Readiness

Ready. The pool-rendering plan now has:

- A committed 96×96 sprite for **every** draftable entry and every Mega forme in
  both regulations, servable from this origin with no network.
- A confirmed size token — `--sprite-lg: 96px` and `--sprite-sm: 48px` are backed
  by 311 measurements with zero outliers, so the three UI-SPEC display densities
  can be laid out against a real number.
- A `rosterId → filename` map in one file, so rendering a sprite is a dictionary
  lookup rather than string assembly.
- A committed placeholder at the identical footprint, so the grid rhythm holds
  even if a future regulation ships before upstream art does.
- A defensible attribution story, which is what makes the URL in the README safe
  to hand to people.

## Self-Check: PASSED

Files verified present on disk: `ATTRIBUTION.md`, `README.md`,
`scripts/build-sprites.mjs`, `scripts/pokeapi-slug-overrides.json`,
`public/data/sprite-meta.json`, `public/sprites/_placeholder.png`, and 311 sprite
PNGs (312 files total in `public/sprites/`).

Commits verified present in `git log`: `845d25c` (Task 1, merged from the prior
executor's worktree via `cdf2356`), `fa5fc8f` (Task 2).

---
*Phase: 01-draft-skeleton-on-a-real-url*
*Completed: 2026-08-04*
