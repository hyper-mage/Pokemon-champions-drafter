# Export verification — the roadmap-mandated spike

**Status: the claims that gate the export format are SETTLED. Two cosmetic rows — the
verbatim menu wording on each site — remain PENDING and are not blocking.**

PROJECT.md flags pokebase.app's acceptance of an `@ item` line as *inferred, never
tested*. PITFALLS Pitfall 8 flags species-only export as something that imports fine and
then fails validation. This document records what each target **actually did**, so the
export requirement rests on evidence instead of inference.

Nothing in this file is a prediction. Any row still reading `PENDING` has not been
observed yet and must not be cited as verified.

**Read the attribution on every row.** Three different kinds of evidence appear below and
they are not interchangeable:

| Marker | Means |
|---|---|
| **automated** | Ran against Showdown's own parser/validator from the `pokemon-showdown@0.11.11` devDependency. Pinned by `tests/core/export/paste.test.ts`. |
| **programmatic** | Same devDependency, run once by hand as a differential. Real Showdown code, but **not a browser** — the live teambuilder UI was never opened. |
| **user-verified** | A human pasted the text into the running site and reported what appeared on screen. |

---

## Test subject

Both teams below were produced by `toShowdownPaste` in `src/core/export/paste.ts`,
called against the committed `public/data/roster.mb.json` snapshot. They were not
hand-written.

They are **disjoint** — 12 distinct species, zero overlap — because a picked species
leaves the pool, so two teams sharing a species is unreachable in a real draft. See
"A defect in the original verification fixtures" below.

| Item | Value |
|---|---|
| Function under test | `toShowdownPaste(slots, entryById)` |
| Roster snapshot | `public/data/roster.mb.json`, Regulation **M-B**, 235 draftable entries |
| Parser used for automated checks | `Teams.import` from `pokemon-showdown@0.11.11` (devDependency) |
| Validator format | `gen9championsvgc2026regmb` — `[Gen 9 Champions] VGC 2026 Reg M-B` |
| Date of automated run | 2026-08-05 |
| Date of pokebase.app hand-verification | **2026-08-05** (user) |
| Date of Showdown browser hand-verification | PENDING — settled programmatically instead, see below |

### TEAM A — one Mega, hyphenated and punctuated names

```
Charizard @ Charizardite X

Garchomp

Rotom-Wash

Tauros-Paldea-Aqua

Kommo-o

Mr. Rime
```

Literal, escaped:

```
"Charizard @ Charizardite X\n\nGarchomp\n\nRotom-Wash\n\nTauros-Paldea-Aqua\n\nKommo-o\n\nMr. Rime\n"
```

`Charizardite X` is chosen deliberately. Charizard is one of the entries carrying **two**
Mega formes, so its stone is ambiguous unless the draft records which one was picked —
see "Charizard's two stones" below.

### TEAM B — two Megas, including a Champions-new one

```
Venusaur @ Venusaurite

Meganium @ Meganiumite

Starmie

Dragonite

Tyranitar

Meowstic-F
```

Literal, escaped:

```
"Venusaur @ Venusaurite\n\nMeganium @ Meganiumite\n\nStarmie\n\nDragonite\n\nTyranitar\n\nMeowstic-F\n"
```

Meganium is one of the Megas that exists only in Champions, and `Meowstic-F` is the forme
the cosmetic-forme filter nearly deleted in plan 01-03 — both are here on purpose.

---

## Part one — automated evidence (complete)

These ran against Showdown's own code, not against a mock, and are pinned by
`tests/core/export/paste.test.ts`.

### The blank-line record separator

| Input | Mons parsed | Verdict |
|---|---|---|
| `"Venusaur\n\nGarchomp\n\nRotom-Wash\n"` | **3** | correct |
| `"Venusaur\nGarchomp\nRotom-Wash\n"` | **1** | silently drops the rest |
| `"Venusaur\n\nTauros-Paldea-Aqua\n"` | **2** | hyphenated formes parse fine |
| TEAM A as emitted | **6** | correct, with `Charizardite X` read as a held item |
| TEAM B as emitted | **6** | correct, with both stones read as held items |

CLAUDE.md's finding reproduces exactly. The single-newline form throws nothing, warns
nothing, and looks unremarkable — it just loses five of six Pokémon.

### The Mega representation, and what "passes the validator" can actually mean

This is the one place the plan's success criterion needed correcting against reality.

**A species-only paste can never report zero validator problems.** Both TEAM A and
TEAM B report **24 problems each** under `[Gen 9 Champions] VGC 2026 Reg M-B` — four per
Pokémon:

- `<mon> needs to have an ability.`
- `<mon>'s ability No Ability does not exist in Gen 9.`
- `<mon> has no moves (it must have at least one to be usable).`
- `<mon> has exactly 0 Stat Points - did you forget to invest it? (If this was intentional, change your Nature to a different neutral Nature, which won't change its stats but will tell us that it wasn't a mistake).`

Those are inherent to a species-only paste. They are the parts the host fills in
afterwards in the teambuilder, and they are **expected, not a failure**. A team of six
bare species names is a legitimate minimal Showdown format precisely because the
teambuilder is where the rest gets added.

This is why **ROADMAP Phase 1 success criterion 5 was amended** (commit `ee47447`). It
originally required the export to pass "Showdown's team validator", which is unachievable
by construction — a correct implementation failed the criterion. It now requires **no
`transforms in-battle` error**, which is the signal that actually discriminates a correct
Mega export from a broken one, exactly as PITFALLS Pitfall 8(a) names:

| Paste form | `transforms in-battle` problems |
|---|---|
| `Charizard @ Charizardite X` (what this app emits) | **0** — 5 problems total for the lone record |
| `Charizard-Mega-X` (bare forme name) | **1** — 6 problems total |
| TEAM A, full six records | **0** — 24 problems total |
| TEAM B, full six records | **0** — 24 problems total |

Verbatim, from the bare-forme form:

```
Charizard-Mega-X transforms in-battle with Charizardite X, please fix its item.
Venusaur-Mega transforms in-battle with Venusaurite, please fix its item.
```

So **`Species @ StoneItemName` is confirmed as the only Mega form that does not carry a
Mega-specific validation error**, and the bare `-Mega` forme is confirmed broken exactly
as predicted. EXPO-02's decision is settled.

### Charizard's two stones

`Charizardite X` and `Charizardite Y` both belong to Charizard, so "which Mega" is not
derivable from the species alone. Checked against the `champions` mod, each stone's
`megaStone` field maps base-species name → forme name:

```
Charizardite X  ->  { "Charizard": "Charizard-Mega-X" }
Charizardite Y  ->  { "Charizard": "Charizard-Mega-Y" }
Meowsticite     ->  { "Meowstic": "Meowstic-M-Mega", "Meowstic-F": "Meowstic-F-Mega" }
```

All **76** Mega formes across the **74** Mega-capable rows were checked: every
`requiredItem` in the snapshot resolves to a real item whose target forme is exactly the
forme the snapshot records. Zero mismatches.

`toShowdownPaste` therefore never guesses. It emits a stone only when the caller names
one, and emits the bare species when no stone was chosen — Raichu carries two stones for
the same reason and behaves identically.

### First-line parser collisions

Showdown's `parseExportedTeamLine` treats ` @ `, a trailing ` (M)`/` (F)`, and a trailing
`)` as syntax. Confirmed live:

```
"Nidoran (M)\n"  ->  species "nidoran"   (lowercase = unresolved; no such species)
"Nidoran-M\n"    ->  species "Nidoran-M" (correct)
```

No name in the committed M-B snapshot contains `(`, `)`, a newline, or ` @ `, and none
ends in a gender suffix — asserted over all 235 entries as a CI tripwire, so a future
regulation introducing a hostile name fails the build rather than corrupting a paste.

Names verified to survive verbatim through the real parser: `Rotom-Wash`,
`Tauros-Paldea-Aqua`, `Kommo-o`, `Mr. Rime`, `Meowstic-F`, and — synthesized, because
Regulation M-B does not include them — `Nidoran-M`, `Nidoran-F`, `Ho-Oh`, `Porygon-Z`,
`Type: Null`, and `Farfetch’d` with its U+2019 apostrophe.

---

## Part two — verification against the targets

### Showdown — play.pokemonshowdown.com (EXPO-04)

> **Attribution, read this before citing any row.** Everything in this table was settled
> **programmatically**, against the `pokemon-showdown@0.11.11` devDependency — that is
> Showdown's own parser and its own `TeamValidator`, the same code the site runs, but
> executed in Node. **Nobody opened play.pokemonshowdown.com in a browser and pasted
> this text.** The import semantics and the validator verdict are therefore established
> with high confidence; the teambuilder's UI affordances are not established at all.

| Field | Observed | How |
|---|---|---|
| Date tested | 2026-08-05 | programmatic |
| Exact menu path to the import field | **PENDING** — never read off the running site | — |
| TEAM A — Pokémon imported (expect 6) | **6** | programmatic |
| TEAM A — `Rotom-Wash` resolved correctly | **yes** | programmatic |
| TEAM A — `Tauros-Paldea-Aqua` resolved correctly | **yes** | programmatic |
| TEAM A — `Kommo-o` resolved correctly | **yes** | programmatic |
| TEAM A — `Mr. Rime` resolved correctly | **yes** | programmatic |
| TEAM A — `Charizard` carries item `Charizardite X` | **yes** | programmatic |
| TEAM B — Pokémon imported (expect 6) | **6** | programmatic |
| TEAM B — `Venusaur` carries item `Venusaurite` | **yes** | programmatic |
| TEAM B — `Meganium` carries item `Meganiumite` | **yes** | programmatic |
| TEAM B — `Meowstic-F` resolved correctly | **yes** | programmatic |
| Validator problems under `[Gen 9 Champions] VGC 2026 Reg M-B` | **24 per team**, four per Pokémon, all ability/moves/stat-points | programmatic |
| Problems containing `transforms in-battle` (expect none) | **0**, both teams | programmatic |

Verbatim resolution, TEAM A:

```
Charizard @ Charizardite X | Garchomp | Rotom-Wash | Tauros-Paldea-Aqua | Kommo-o | Mr. Rime
```

Verbatim resolution, TEAM B:

```
Venusaur @ Venusaurite | Meganium @ Meganiumite | Starmie | Dragonite | Tyranitar | Meowstic-F
```

**Reading the validator result.** Errors about abilities, moves and stat points are
expected for a species-only paste and do **not** indicate an export bug. The export is
correct if and only if **no problem mentions `transforms in-battle`**. Both teams: zero.

**What is still open.** Only the wording of the teambuilder's import affordance. That
affects one line of helper copy, not the format. It stays PENDING rather than being
guessed at — see the UI-SPEC note in `01-UI-SPEC.md`.

### pokebase.app (EXPO-05)

> **Attribution.** These rows are **user-verified**: a human pasted the text into the
> running site on 2026-08-05 and reported what appeared. pokebase.app has no public API,
> so this is the only way its import parser can be exercised.

| Field | Observed | How |
|---|---|---|
| Date tested | 2026-08-05 | user-verified |
| Exact entry-point label | **PENDING** — CLAUDE.md records `New/Import Team` from pokebase's shipped JS, but nobody read it off the running UI | — |
| Exact paste-field label | **PENDING** — CLAUDE.md records `Team paste to import` from the same static read | — |
| Single record `Venusaur @ Venusaurite` | **accepted — Mega shown as ACTIVE** | user-verified |
| TEAM B — full six-record paste | **"worked with no problems"** — six Pokémon | user-verified |
| TEAM B — blank-line record separator honoured | **yes** — six imported, not one | user-verified |
| TEAM B — was `Venusaurite` accepted on Venusaur? | **yes** | user-verified |
| TEAM B — was `Meganiumite` accepted on Meganium? | **yes** | user-verified |
| Verbatim error text, if any | **none** | user-verified |
| TEAM A — full six-record paste | **NOT TESTED** — TEAM B was pasted instead, and it is the stricter case (two stones vs one) | — |

**The headline result.** Pasting `Venusaur @ Venusaurite` into pokebase.app produced a
team containing Venusaur **with its Mega shown as active**. pokebase does not merely
*tolerate* the `@ item` line — it *interprets* the stone. This settles the claim PROJECT.md
flagged as *inferred, never tested*.

**The six-record result.** The full TEAM B paste worked with no problems. This closes the
gap a single-record paste could not: a lone record never exercises the blank-line
separator, and pokebase could plausibly have shared Showdown's silent `A\nB\nC` → one
Pokémon behaviour. It does not.

**Product consequence, and it is the load-bearing one.** One paste serves both targets.
There is no need for a second item-stripped variant for pokebase, and therefore **no
export-UI branch** — plan 01-10's export panel emits exactly one string per player.

### A defect in the original verification fixtures (corrected 2026-08-05)

The first TEAM A / TEAM B pair handed to the human verifier shared **five of six species**
(Venusaur, Garchomp, Rotom-Wash, Kommo-o, Mr. Rime appeared in both). A picked species
leaves the pool immediately, so that pair is unreachable in any real draft — it exercised
the formatter but not the thing success criterion 5 is about, which is *two finished teams
from one six-round draft*. Caught by the user, not by any test, and invisible to one:
`toShowdownPaste` formats whatever slots it is given and has no notion of a shared pool.

Replaced with the disjoint teams recorded above — 12 distinct species, zero overlap —
generated by `toShowdownPaste` against the committed snapshot and machine-checked to parse
as 6 mons each with 0 `transforms in-battle` problems.

The replacements also widen coverage: Charizard carries two stones (`Charizardite X`/`Y`),
so picking the first silently would look valid and be wrong half the time; Meganium is the
Champions-new Mega that success criterion 2 originally denied existed; and Meowstic-F is the
forme the cosmetic-forme rule nearly deleted in plan 01-03.

---

## Conclusions

| Claim | Status |
|---|---|
| Blank line is the record separator; single newline drops the rest | **VERIFIED** — automated, against Showdown's parser |
| `Species @ StoneItemName` is the correct Mega export form | **VERIFIED** — automated, validator differential |
| A bare `-Mega` forme imports and then fails validation | **VERIFIED** — automated, verbatim error captured |
| Species names survive verbatim, including hyphens, periods and U+2019 | **VERIFIED** — automated |
| A species-only paste reports zero validator problems | **DISPROVEN** — it always reports missing ability/moves/stat points; only `transforms in-battle` discriminates. ROADMAP criterion 5 amended accordingly (`ee47447`) |
| Team parses into Showdown as six Pokémon with correct species and items | **VERIFIED** — programmatic, Showdown's own parser; **not** observed in a browser |
| Showdown's validator reports no `transforms in-battle` for either team | **VERIFIED** — programmatic |
| Team imports into pokebase.app as six Pokémon | **VERIFIED** — user-verified, 2026-08-05 |
| pokebase.app accepts `Species @ StoneItemName` | **VERIFIED** — user-verified; the stone is interpreted, the Mega shows as active |
| One paste serves both targets; no item-stripped variant needed | **VERIFIED** — follows from the two rows above |
| Showdown's teambuilder import menu wording | **PENDING** — cosmetic, affects helper copy only |
| pokebase.app's entry-point and paste-field labels on the running UI | **PENDING** — cosmetic, affects helper copy only |
| A team pasted into play.pokemonshowdown.com's teambuilder **in a browser** | **PENDING** — the format is settled programmatically; the browser round-trip is not a format risk |
