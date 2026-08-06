# Export verification — the roadmap-mandated spike

**Status: PART ONE COMPLETE (automated), PART TWO PENDING (hand-verification).**

PROJECT.md flags pokebase.app's acceptance of an `@ item` line as *inferred, never
tested*. PITFALLS Pitfall 8 flags species-only export as something that imports fine and
then fails validation. This document records what each target **actually did**, so the
export requirement rests on evidence instead of inference.

Nothing in this file is a prediction. Any row still reading `PENDING` has not been
observed yet and must not be cited as verified.

---

## Test subject

Both teams below were produced by `toShowdownPaste` in `src/core/export/paste.ts`,
called against the committed `public/data/roster.mb.json` snapshot. They were not
hand-written.

| Item | Value |
|---|---|
| Function under test | `toShowdownPaste(slots, entryById)` |
| Roster snapshot | `public/data/roster.mb.json`, Regulation **M-B**, 235 draftable entries |
| Parser used for automated checks | `Teams.import` from `pokemon-showdown@0.11.11` (devDependency) |
| Validator format | `gen9championsvgc2026regmb` — `[Gen 9 Champions] VGC 2026 Reg M-B` |
| Date of automated run | 2026-08-05 |
| Date of hand-verification | PENDING |

### TEAM A — no Mega, six species, hyphenated and punctuated names

```
Venusaur

Garchomp

Rotom-Wash

Tauros-Paldea-Aqua

Kommo-o

Mr. Rime
```

Literal, escaped:

```
"Venusaur\n\nGarchomp\n\nRotom-Wash\n\nTauros-Paldea-Aqua\n\nKommo-o\n\nMr. Rime\n"
```

### TEAM B — Mega-containing, six species

```
Charizard @ Charizardite X

Venusaur @ Venusaurite

Garchomp

Rotom-Wash

Kommo-o

Mr. Rime
```

Literal, escaped:

```
"Charizard @ Charizardite X\n\nVenusaur @ Venusaurite\n\nGarchomp\n\nRotom-Wash\n\nKommo-o\n\nMr. Rime\n"
```

`Charizardite X` is chosen deliberately. Charizard is one of the entries carrying **two**
Mega formes, so its stone is ambiguous unless the draft records which one was picked —
see "Charizard's two stones" below.

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
| TEAM A as emitted | **6** | correct |
| TEAM B as emitted | **6**, with both stones read as held items | correct |

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
- `<mon> has exactly 0 Stat Points - did you forget to invest it? ...`

Those are inherent to a species-only paste. They are the parts the host fills in
afterwards in the teambuilder, and they are **expected, not a failure**. A team of six
bare species names is a legitimate minimal Showdown format precisely because the
teambuilder is where the rest gets added.

The problem that actually discriminates a correct export from a broken one is the one
PITFALLS Pitfall 8(a) names:

| Paste form | `transforms in-battle` problems |
|---|---|
| `Charizard @ Charizardite X` + `Venusaur @ Venusaurite` (what this app emits) | **0** |
| `Charizard-Mega-X` + `Venusaur-Mega` (bare forme names) | **2** — one per Mega |

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
`Tauros-Paldea-Aqua`, `Kommo-o`, `Mr. Rime`, and — synthesized, because Regulation M-B
does not include them — `Nidoran-M`, `Nidoran-F`, `Ho-Oh`, `Porygon-Z`, `Type: Null`, and
`Farfetch’d` with its U+2019 apostrophe.

---

## Part two — hand-verification against the live targets (PENDING)

> Automated evidence cannot settle these. pokebase.app has no public API and its import
> parser can only be exercised through its UI, and Showdown's teambuilder menu wording
> can only be read off the running site.

### Showdown — play.pokemonshowdown.com (EXPO-04)

| Field | Observed |
|---|---|
| Date tested | PENDING |
| Exact menu path to the import field | PENDING |
| TEAM A — Pokémon imported (expect 6) | PENDING |
| TEAM A — `Rotom-Wash` resolved correctly | PENDING |
| TEAM A — `Tauros-Paldea-Aqua` resolved correctly | PENDING |
| TEAM A — `Kommo-o` resolved correctly | PENDING |
| TEAM A — `Mr. Rime` resolved correctly | PENDING |
| TEAM B — Pokémon imported (expect 6) | PENDING |
| TEAM B — `Charizard` shows held item `Charizardite X` | PENDING |
| TEAM B — `Venusaur` shows held item `Venusaurite` | PENDING |
| TEAM B — validator output under `[Gen 9 Champions] VGC 2026 Reg M-B`, verbatim | PENDING |
| TEAM B — any problem containing `transforms in-battle` (expect none) | PENDING |

**Reading the validator result.** Errors about abilities, moves and stat points are
expected for a species-only paste and do **not** indicate an export bug. The export is
correct if and only if **no problem mentions `transforms in-battle`**.

### pokebase.app (EXPO-05)

| Field | Observed |
|---|---|
| Date tested | PENDING |
| Exact entry-point label (CLAUDE.md records `New/Import Team`) | PENDING |
| Exact paste-field label (CLAUDE.md records `Team paste to import`) | PENDING |
| TEAM A — Pokémon imported (expect 6) | PENDING |
| TEAM B — Pokémon imported (expect 6) | PENDING |
| **TEAM B — was the `@ Charizardite X` line accepted?** | **PENDING for the full team — but see the single-record result below** |
| TEAM B — was `Venusaurite` accepted on Venusaur | **ACCEPTED — 2026-08-05, single-record paste** |
| Verbatim error text, if any | PENDING |

**Single-record result, 2026-08-05 (user-verified).** Pasting the one line
`Venusaur @ Venusaurite` into pokebase.app produced a team containing Venusaur **with its
Mega shown as active**. This settles the claim PROJECT.md flagged as *inferred, never
tested*: pokebase does not merely tolerate the `@ item` line, it interprets the stone. The
consequence for the product is that **one paste serves both targets** — no second
item-stripped variant is needed, and no export-UI branch.

**What this does NOT yet settle.** A single-record paste never exercises the blank-line
record separator, which is the one failure mode this whole document exists for: Showdown
silently imports `A\nB\nC` as *one* Pokémon. pokebase could plausibly share that behaviour.
The six-mon rows above stay PENDING until a full TEAM B paste is confirmed to yield six.

### A defect in the original verification fixtures (corrected 2026-08-05)

The first TEAM A / TEAM B pair handed to the human verifier shared **five of six species**
(Venusaur, Garchomp, Rotom-Wash, Kommo-o, Mr. Rime appeared in both). A picked species
leaves the pool immediately, so that pair is unreachable in any real draft — it exercised
the formatter but not the thing success criterion 5 is about, which is *two finished teams
from one six-round draft*. Caught by the user, not by any test, and invisible to one:
`toShowdownPaste` formats whatever slots it is given and has no notion of a shared pool.

Replaced with disjoint teams — 12 distinct species, zero overlap — generated by
`toShowdownPaste` against the committed snapshot and machine-checked to parse as 6 mons
each with 0 `transforms in-battle` problems:

- **TEAM A**: `Charizard @ Charizardite X`, `Garchomp`, `Rotom-Wash`, `Tauros-Paldea-Aqua`, `Kommo-o`, `Mr. Rime`
- **TEAM B**: `Venusaur @ Venusaurite`, `Meganium @ Meganiumite`, `Starmie`, `Dragonite`, `Tyranitar`, `Meowstic-F`

The replacements also widen coverage: Charizard carries two stones (`Charizardite X`/`Y`),
so picking the first silently would look valid and be wrong half the time; Meganium is the
Champions-new Mega that success criterion 2 originally denied existed; and Meowstic-F is the
forme the cosmetic-forme rule nearly deleted in plan 01-03.

**If pokebase rejects the `@ item` line**, that is a real finding and must be recorded as
one rather than papered over. The fallback is two paste variants — a plain species-only
paste for pokebase and `Species @ Stone` for Showdown — which is a UI change worth
catching now rather than in Phase 3.

---

## Conclusions

| Claim | Status |
|---|---|
| Blank line is the record separator; single newline drops the rest | **VERIFIED** (automated, against Showdown's parser) |
| `Species @ StoneItemName` is the correct Mega export form | **VERIFIED** (automated, validator differential) |
| A bare `-Mega` forme imports and then fails validation | **VERIFIED** (automated, verbatim error captured) |
| Species names survive verbatim, including hyphens, periods and U+2019 | **VERIFIED** (automated) |
| A species-only paste reports zero validator problems | **DISPROVEN** — it always reports missing ability/moves/stat points; only `transforms in-battle` discriminates |
| Team imports into play.pokemonshowdown.com's teambuilder | PENDING |
| Team imports into pokebase.app | PENDING |
| pokebase.app accepts `Species @ StoneItemName` | PENDING |
