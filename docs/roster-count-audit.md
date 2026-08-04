# Roster count audit

**Measured:** 2026-08-04
**Source:** `pokemon-showdown@0.11.11` (npm), `Dex.mod(<mod>).species.all()`
**Reproduce:** `npm run build:roster mb` — every number below is printed by the generator.

This document resolves the two numeric chores the roadmap left open: the
310-vs-311 legal-entry discrepancy, the 207-vs-208 base-species discrepancy, and
it states the project's canonical Mega-capable figure. It also records what the
mod actually says about Meganium, which contradicts a roadmap success criterion.

---

## 1. Measured counts

### Regulation M-B (mod `champions`, 2026-06-17 to 2026-09-02)

| Count | Value | Meaning |
|---|---|---|
| `legalEntries` | **311** | Draftable rows + Mega formes, after every filter |
| `baseSpecies` | **207** | Of those 311, entries with no `forme` |
| `alternateFormes` | **104** | Of those 311, entries with a `forme` (Megas included) |
| `megaFormes` | **76** | Legal Mega formes |
| `megaCapableSpecies` | **74** | Draftable rows carrying at least one Mega |
| `draftable` | **235** | Rows in the committed pool |
| `distinctBaseSpecies` | **208** | Distinct `baseSpeciesId` among draftable rows |
| `megaCapableBaseSpecies` | **73** | Distinct `baseSpecies` among the 76 Mega formes |
| `excludedNonstandard` | 1160 | Any truthy `isNonstandard`, including the `Future` entries |
| `excludedIllegalTier` | 10 | `tier === "Illegal"` |
| `excludedBattleOnly` | 7 | Battle-only non-Mega formes |
| `excludedCosmetic` | 29 | Formes indistinguishable from their base species |
| `orphanedMegaFormes` | 0 | Mega formes with no draftable owner |

### Regulation M-A (mod `championsregma`, 2026-04-08 to 2026-06-17)

| Count | Value |
|---|---|
| `legalEntries` | 273 |
| `baseSpecies` | 185 |
| `alternateFormes` | 88 |
| `megaFormes` | 60 |
| `megaCapableSpecies` | 59 |
| `draftable` | 213 |
| `distinctBaseSpecies` | 186 |
| `megaCapableBaseSpecies` | 58 |

**Independent corroboration.** PITFALLS Pitfall 3 records community reporting of
M-A as "**186** + **59** Megas". The frozen `championsregma` mod, run through
this pipeline, yields `distinctBaseSpecies = 186` and `megaCapableSpecies = 59`.
Two numbers, derived from a different source, landing exactly on the community
figures is strong evidence the classifier is counting the right things.

---

## 2. Why three documents disagreed

All three prior figures are correct. They count **different units**, and none of
them said which. The discrepancies are not errors in the data.

There are three defensible populations in the champions mod, and the generator
now reports all of them:

| Population | M-B size | What it is |
|---|---|---|
| `formats-data.ts` rows without `isNonstandard` | **314** | Entries upstream states legality for *explicitly* |
| `species.all()` without `isNonstandard` | **357** | The above, plus 43 formes that *inherit* legality from their base species |
| Post-filter legal set | **311** | What this project ships: 235 draftable + 76 Mega |

The 43 inherited entries break down exactly as: 29 cosmetic + 10 `tier: "Illegal"`
+ 3 battle-only (Mimikyu-Busted, Morpeko-Hangry, Palafin-Hero) + **1 draftable**
(Meowstic-F). That last one is the whole story.

### 2a. The 310-vs-311 delta is `meowsticf` — Meowstic-F

- **ARCHITECTURE.md says 310 legal / 234 non-Mega.** That is the raw
  `formats-data.ts` view: 314 explicit rows, minus the 4 explicit rows this
  project excludes as battle-only formes (Castform-Sunny, Castform-Rainy,
  Castform-Snowy, Aegislash-Blade) = **310**, of which 76 are Megas, leaving
  **234**. Both of ARCHITECTURE's numbers reproduce exactly.
- **PITFALLS.md says 311 legal / 207 base / 104 alternate / 76 Mega.** That is
  the built-Dex view: 310 + **Meowstic-F** = **311**, splitting 207 / 104, with
  76 Megas. All four of PITFALLS' numbers reproduce exactly.
- **`Meowstic-F` has no row of its own in `champions/formats-data.ts`.** It
  inherits its legality from `Meowstic`. A script that parses the raw `.ts` file
  never sees it; a script that enumerates a built `Dex` does. Verified:
  `meowsticf` is the *only* draftable entry in either regulation with no
  explicit `formats-data` row.

**Resolution: 311 is the number for this project**, because Meowstic-F is a real,
draftable, legal Pokémon with its own ability spread (Competitive, where Meowstic
has Prankster) and its own Mega. Dropping it would silently remove a species
from the pool. The generator enumerates the built Dex for exactly this reason.

### 2b. The 207-vs-208 delta is `floette` — Floette

- **207** = legal entries whose `forme` is empty. A *base-forme* count.
- **208** = distinct base **species** represented among draftable rows. A
  *species* count — the same unit PokeAPI's `champions` pokedex uses when it
  returns 208 entries (CLAUDE.md).
- The extra species is **Floette**. Showdown's base `floette` is
  `isNonstandard: "Past"`, `tier: "Illegal"` — not legal in Champions. But
  `floetteeternal` (Floette-Eternal) **is** legal, has no `isNonstandard`, and
  is `tier: "UU"`. So the species Floette is present in the regulation, and its
  base forme is not. Verified by the generator, which prints
  `species draftable only through an alternate forme: 1 — floette (only as Floette-Eternal)`
  for both M-B and M-A.

**Resolution: there is no contradiction.** 207 base formes + Floette = 208
species. CLAUDE.md's "diffed against Showdown → zero difference" holds, at the
species level. The lesson is that "how many Pokémon are legal" has two honest
answers and the roster snapshot now carries both (`baseSpecies` and
`distinctBaseSpecies`).

Six further species — Meloetta, Minior, Cramorant, Eiscue, Ogerpon, Terapagos —
also have a `Past` base forme with legal-looking formes in the mod, which is why
`distinct baseSpecies among all legal entries` is 214. All of their formes are
`tier: "Illegal"` battle-only states (Meloetta-Pirouette, Minior-Meteor,
Cramorant-Gulping/Gorging, Eiscue-Noice, the four Ogerpon Tera formes,
Terapagos-Terastal), so none of the six reaches the pool. They are not part of
the 208 and PokeAPI does not count them either.

---

## 3. Canonical Mega-capable count

> ### **74**
>
> **74 draftable entries are Mega-capable in Regulation M-B.**
> This is the number Phase 3's feasibility arithmetic must use:
> `players × megaRounds ≤ 74 − megaBans`.

The competing figure of **73** is the count of distinct `baseSpecies` values
among the 76 Mega formes. Both are correct; they differ by one because
**Meowstic and Meowstic-F share a `baseSpecies` but are two separate draftable
rows, each carrying its own Mega**:

- `Meowstic-M-Mega` — `forme: "M-Mega"`, `battleOnly: "Meowstic"` → owned by `meowstic`
- `Meowstic-F-Mega` — `forme: "F-Mega"`, `battleOnly: "Meowstic-F"` → owned by `meowsticf`

The draftable unit is the row (ROST-08), so the feasibility solver must count
rows. Using 73 would under-report the Mega pool by one and could reject a
configuration that is actually satisfiable.

Two entries carry more than one Mega: **Charizard** (Charizardite X / Y) and
**Raichu** (Raichunite X / Y). PITFALLS lists a third, Meowstic — that is true
of the `baseSpecies`, but not of any single draftable row.

For M-A the equivalent figures are **59** entries / **58** base species, with
Charizard the only multi-Mega row.

---

## 4. Meganium — the data contradicts the roadmap

**ROADMAP success criterion 2 states: "Meganium is never offered as
Mega-capable." The champions mod says Meganium IS Mega-capable.**

What `Dex.mod('champions').species.get('meganiummega')` actually contains:

```json
{
  "name": "Meganium-Mega",
  "num": 154,
  "baseSpecies": "Meganium",
  "forme": "Mega",
  "requiredItem": "Meganiumite",
  "battleOnly": "Meganium",
  "isNonstandard": null,
  "tier": "OU",
  "types": ["Grass", "Fairy"]
}
```

It has an explicit row in `champions/formats-data.ts` (not inherited), no
`isNonstandard`, a legal tier, and a stone. It is legal in both M-B and M-A.
This corroborates CLAUDE.md, which cites a PokeAPI `meganium-mega` at id 10282
among Champions' new Megas, and STACK.md, which lists Meganium first among the
Megas Champions added.

**What went wrong in the roadmap.** PITFALLS Pitfall 4(a) says filtering ids by
a "mega" substring returns 77 entries "exactly one of which — `meganium` — is
not a Mega". That is a warning about **base Meganium** being caught by a naive
id filter. It says nothing about whether Meganium has a Mega. Somewhere between
that warning and the roadmap it became "Meganium is not Mega-capable", which the
data does not support.

**What this plan did about it.** Nothing to the data, and nothing to the
roadmap. `public/data/roster.mb.json` records `meganium` with
`megaCapable: true` and one Mega forme, because that is what upstream says.
`tests/core/roster/fixtures.test.ts` asserts the same. The roadmap criterion
needs a developer ruling.

**The underlying warning is still live and is still tested.** `'meganium'`
contains the substring `mega`; a substring filter would classify base Meganium
as a Mega forme and remove it from the pool. `transform.ts` derives Mega status
from `forme` + `requiredItem` only, `tests/core/roster/transform.test.ts`
asserts base Meganium classifies as `draftable`, and
`tests/core/roster/fixtures.test.ts` asserts `meganium` appears exactly once in
the committed snapshot and that no entry id is `meganiummega`.

**Suggested replacement wording for ROADMAP criterion 2:**
"Meganium appears once in the pool as a draftable base species — not as a
separate `Meganium-Mega` row — and is correctly flagged Mega-capable."

---

## 5. What was excluded, by name

The full exclusion lists for M-B. Identical for M-A.

**Battle-only non-Mega formes (7).** Excluded because they are in-battle states,
not draftable Pokémon.

> Castform-Sunny, Castform-Rainy, Castform-Snowy, Aegislash-Blade,
> Mimikyu-Busted, Morpeko-Hangry, Palafin-Hero

**`tier: "Illegal"` (10).** Also battle-only states; caught one rule earlier.

> Meloetta-Pirouette, Minior-Meteor, Cramorant-Gulping, Cramorant-Gorging,
> Eiscue-Noice, Ogerpon-Teal-Tera, Ogerpon-Wellspring-Tera,
> Ogerpon-Hearthflame-Tera, Ogerpon-Cornerstone-Tera, Terapagos-Terastal

**Cosmetic (29).** Formes with the same types, the same base stats **and** the
same abilities as their base species.

> Vivillon ×19 (Icy Snow, Polar, Tundra, Continental, Garden, Elegant, Modern,
> Marine, Archipelago, High Plains, Sandstorm, River, Monsoon, Savanna, Sun,
> Ocean, Jungle, Fancy, Pokeball), Alcremie ×7 (Ruby-Cream, Matcha-Cream,
> Mint-Cream, Lemon-Cream, Ruby-Swirl, Caramel-Swirl, Rainbow-Swirl),
> Polteageist-Antique, Maushold-Four, Sinistcha-Masterpiece

Three notes on that list:

1. **Vivillon-Fancy and Vivillon-Pokeball are real `pokedex` entries**, not
   members of Vivillon's `cosmeticFormes` array — so a `cosmeticFormes`-only
   rule would leave three Vivillons in the pool. The types/stats/abilities
   comparison collapses all 19 correctly.
2. **Abilities are part of the comparison, and must be.** Meowstic-F matches
   Meowstic on types and base stats exactly. A types-and-stats-only rule — which
   is what CLAUDE.md and the plan both describe — deletes Meowstic-F from the
   pool, taking `draftable` to 234 and `megaCapableSpecies` to 73, and silently
   discarding a Mega. Abilities are what distinguish them (Competitive vs
   Prankster).
3. **CLAUDE.md's "30 cosmetic formes" and "9 battleOnly" are close but not
   exact** for this release: measured 29 and 7 respectively, with a further 10
   battle-only entries removed earlier by the `tier: "Illegal"` rule (17
   battle-only in total).

**Non-standard (1160).** Every entry with a truthy `isNonstandard`. The filter
is *absence of the field*, never `!== "Past"` — the latter would admit the
`Future` entries, which are datamined for a regulation that has not shipped.

---

## 6. Name hygiene

The generator reports every output name containing a character outside
``[A-Za-z0-9 .'-]``. For both M-B and M-A the answer is **none** — the legal
roster is currently entirely ASCII.

That is a fact about this release, not a property to rely on. `Farfetch’d`
(U+2019 RIGHT SINGLE QUOTATION MARK, not an ASCII apostrophe) and `Flabébé` are
both in Showdown's dex today, marked `isNonstandard: "Past"` for Champions, and
are one regulation away from arriving. The check stays in the generator so that
their arrival is announced rather than discovered, and
`tests/core/roster/transform.test.ts` pins U+2019 handling through the transform
regardless of whether any such name is currently legal.

**Exactly two base-forme names in M-B contain punctuation**, and both are in the
fixture test:

| Name | `id` | Why it is dangerous |
|---|---|---|
| `Kommo-o` | `kommoo` | A **base species containing a hyphen**. A `name.split('-')` forme parser reads base "Kommo", forme "o". |
| `Mr. Rime` | `mrrime` | A period and a space, both stripped by `toID`. |

The other classic offenders PITFALLS lists — `Jangmo-o`, `Hakamo-o`, `Ho-Oh`,
`Porygon-Z`, `Type: Null`, `Nidoran-M`/`Nidoran-F`, `Farfetch’d`, `Flabébé` —
are **all absent** from Regulation M-B; each is `isNonstandard: "Past"`. Verified
individually, not assumed. Thirty entries in total carry punctuation once forme
suffixes are included (`Rotom-Wash`, `Tauros-Paldea-Aqua`, and so on), but every
one of those is a hyphen introduced by the forme, which the transform never
parses anyway.

The practical consequence for Phase 5's export work: `Farfetch’d` is **not** a
name this project has to handle today, and the U+2019 problem is currently
hypothetical. It is nonetheless pinned by a transform-level test, because the
cost of the test is a few lines and the cost of discovering it live is a broken
Showdown paste.
