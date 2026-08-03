# Stack Research

**Domain:** Zero-backend, offline-capable static web app — turn-based draft state, brackets, local persistence
**Researched:** 2026-08-03
**Confidence:** HIGH (nearly every claim verified empirically against live sources or executed code)

---

## Headline Findings

Five things settle most of the open questions in PROJECT.md:

1. **The author's own reference example is a Vite + TypeScript build deployed by GitHub Actions.** `xetoxyc/gothic-remake-lockpicker` has `vite.config.ts`, `src/`, `package.json` (`"build": "tsc && vite build"`, `vite: ^8.0.12`), a single `main` branch, and `.github/workflows/deploy-pages.yml`. The served HTML is 546 bytes pointing at `assets/index-_WQvugOT.js` with `type="module" crossorigin`. **"No install / no build step" means for the *visitor*, not for the *repo*.** This removes the framework-vs-vanilla dilemma's central premise.

2. **Pokémon Champions shipped, and its legal roster IS available in machine-readable form — from two independent sources that agree exactly.** Pokémon Showdown has a first-class `champions` mod (`data/mods/champions/`), and PokeAPI has a `champions` Pokédex *and* version-group. I diffed them: **208 species, zero difference in either direction.**

3. **Champions introduced brand-new Mega Evolutions that did not previously exist** (Mega Meganium, Mega Feraligatr, Mega Raichu X/Y, Mega Victreebel, Mega Starmie, Mega Dragonite…). Both Showdown and PokeAPI already carry them with full stats and sprites. Any data plan built on stale assumptions about "the 48 known Megas" is wrong.

4. **pokebase.app accepts Pokémon Showdown paste format directly.** Verified by reading its shipped JS: the import dialog literally says *"Or paste export text (PokéBase JSON or [Pokémon Showdown](https://github.com/smogon/pokemon-showdown/blob/master/sim/TEAMS.md))"*, and calls a server action named `parseShowdownTeamPaste`. One export format serves both targets.

5. **A bare species name per line IS a valid Showdown import — but blank-line separation is load-bearing.** Verified by executing `Teams.import()`. Without blank lines between entries you get one Pokémon, silently.

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Vite** | `8.2.0` | Build tool + dev server | Exactly what the reference project uses (`^8.0.12`). Zero-config TS, fast HMR, and a `dist/` that GitHub Pages serves directly. The build is the author's concern, never the player's. |
| **TypeScript** | `5.9.x` (see note) | Type safety for draft rules | The draft engine is rule-heavy: round schedules, priority-card resolution, ban modes, swap budgets. Types are the cheapest defence against invalid tournament states. Reference project uses `~6.0.2`. |
| **Preact** | `10.29.8` | UI rendering | ~4 KB gzipped. Turns bracket/pool/round rendering into declarative functions of state. Zero runtime dependencies. |
| **@preact/signals** | `2.10.1` | Reactive state | Fine-grained reactivity over a **single serializable tournament object** — directly serves the PROJECT.md requirement that adding sync later be "an integration, not a rewrite". |
| **@preact/preset-vite** | `2.10.6` | Vite ↔ Preact integration | One line in `vite.config.ts`; handles JSX + prefresh. |

> **TypeScript version note:** npm `latest` for `typescript` currently resolves to `7.0.2` (the native Go port, `tsgo`). The reference project pins `~6.0.2`. TS 7 is a major rewrite; for a small project where build reliability outranks compile speed, **pin `typescript@~5.9` or `~6.0` rather than floating to 7.x.** Confidence: MEDIUM (version observed on npm; migration risk is judgement).

### On the Framework Question — Prescriptive Answer

**Use Vite + TypeScript + Preact. Do not hand-roll vanilla DOM.**

The instinct to go vanilla comes from the reference project, which *is* vanilla TS. But that is a lockpicking minigame — one screen, one interaction, near-trivial state. This app is categorically different:

- Multi-round draft with a derived round schedule
- Priority-card play and resolution (6 cards × N players, spent-state per round)
- Three distinct ban modes including a blind/hidden-input flow
- Swap currency *and* optional post-draft swap rounds
- Round-robin standings + single-elim bracket with byes + Bo3 tracking
- A ~234-cell pool grid with three display densities, filtered live by Mega-eligibility

Every one of those is "state changed → recompute what's on screen". Hand-writing that in imperative DOM means hand-writing a diffing layer, badly, and debugging stale-node bugs instead of draft rules. **Vanilla DOM at this complexity is a false economy.** Preact costs ~4 KB and roughly zero conceptual overhead.

**Why Preact over the alternatives:**

| Option | Verdict |
|--------|---------|
| **Preact + signals** | ✅ **Recommended.** ~4 KB. Plain functions, no compiler magic. State stays a plain serializable object. React-compatible escape hatch if a library is ever needed. |
| Svelte 5 (`5.56.8`) | Strong runner-up. Runes are excellent for this. Rejected only because it puts logic inside a compiler-specific `.svelte` format, which is slightly worse for "state is one JSON object I can export". Choose it if the author already knows Svelte. |
| React 19 (`19.2.8`) | Rejected. ~45 KB gzipped for zero benefit at this scale. |
| Vanilla TS + ES modules | Rejected for the reasons above. Viable *only* if the author actively wants the DOM-wrangling practice. |
| Single-file HTML (no build) | Rejected as the primary target — see below, but keep as a **secondary artifact**. |
| Alpine.js (`3.15.12`) / Lit (`3.3.3`) | Rejected. Alpine's markup-driven model fights rule-heavy logic; Lit's Web Component ceremony buys nothing here. |

### The `file://` Trap — Important

**ES modules cannot load from `file://` in any major browser** (opaque origin → CORS failure). This affects the literal reading of "clone the repo and it works":

- The reference site itself would **not** work from `file://` — it uses absolute paths (`/gothic-remake-lockpicker/assets/...`) and module scripts.
- So "clone and it works" in practice means **"open the GitHub Pages link"**, plus `npm run dev` for the author.

If a genuinely double-clickable artifact is wanted, that is a solved problem:

- **`vite-plugin-singlefile@2.3.3`** (supports Vite 8 per its peer deps) inlines all JS + CSS into one `index.html`. With base64-inlined sprites this lands around ~1 MB — chunky but entirely workable, and a great offline/archive artifact.
- Recommendation: **ship the normal Pages build as primary**, and optionally emit `champions-drafter-offline.html` as a release artifact. Do not contort the main build for this.

Confidence: HIGH (module/`file://` behaviour is spec-level; plugin version verified on npm).

---

## Pokémon Data Sourcing

### The Champions roster IS published in machine-readable form — this is not blocked

This was flagged in PROJECT.md as "an open research question". It is answered.

**Source A — Pokémon Showdown `champions` mod (PRIMARY)**

`smogon/pokemon-showdown` → `data/mods/champions/formats-data.ts` (74 KB). Verified live:

```
[Gen 9 Champions] OU / UU / BSS Reg M-B / VGC 2026 Reg M-B / Draft / …   (mod: 'champions')
[Gen 9 Champions] BSS Reg M-A / VGC 2026 Reg M-A                          (mod: 'championsregma')
```

Showdown keeps **historical regulation mods** side by side (`championsregma` for the retired Reg M-A). That directly de-risks the roster-volatility concern in PROJECT.md — old regs stay pinned and addressable.

Executed against `pokemon-showdown@0.11.11`:

```
Dex.mod('champions').species.all()
  filter: exists && !isNonstandard && tier !== 'Illegal'
  → 347 legal forme entries
      273 non-Mega
       74 Mega formes  (72 distinct base species)
```

**Source B — PokeAPI `champions` Pokédex (CROSS-CHECK)**

`https://pokeapi.co/api/v2/pokedex/champions` → `is_main_series: false`, `version_groups: ['champions']`, **208 species entries**.

**Cross-validation result — I diffed the two:**

```
PokeAPI species: 208 | Showdown base species: 208
only in PokeAPI: (none)
only in Showdown: (none)
```

Two independently maintained projects agree exactly. **Confidence: HIGH.**

The 208 vs 273 gap is purely forme granularity: PokeAPI lists *species*, Showdown lists *formes* (Rotom-Wash, Tauros-Paldea-Aqua, Basculegion-F…). Both are correct at their level.

### Verdict on each candidate source

| Source | Has Champions legality? | Has new Champions Megas? | Verdict |
|--------|------------------------|--------------------------|---------|
| **`pokemon-showdown` npm (`0.11.11`)** | ✅ `Dex.mod('champions')` | ✅ full stats/types/abilities | ✅ **PRIMARY — devDependency only** |
| **PokeAPI `champions` pokedex** | ✅ 208 species | ✅ (`meganium-mega` = id 10282) | ✅ **Cross-check + sprite ID mapping** |
| `@pkmn/data` / `@pkmn/dex` (`0.10.11`) | ❌ **No.** `Dex.mod('champions')` throws `Must provide mod data with mod 'champions'` | ✅ gen9 dex *does* include them | ⚠️ Species stats only — **cannot supply legality** |
| Raw `formats-data.ts` via `raw.githubusercontent.com` | ✅ | ✅ | ✅ Good fallback / in-app refresh (`Access-Control-Allow-Origin: *` verified) |
| Smogon dex data | Usage/tier stats only | — | ❌ Not a legality source |
| Serebii / Bulbapedia / Game8 | Human-readable only (Serebii is one HTML table, no download) | ✅ | ❌ Scraping unjustifiable given A and B exist |

**The `@pkmn/*` finding is worth emphasising** because it is counter-intuitive: `@pkmn/dex` is the "maintained TypeScript Showdown data package" and it *does* carry the new Champions Megas in its gen9 dex — but it ships only generation mods, not format mods like `champions`. It is a fine stats library and a **wrong** legality library.

### Mega-capability flag — solved

`Dex.mod('champions')` gives Mega formes as first-class species with `baseSpecies`, `requiredItem`, `forme: 'Mega'`. Deriving the flag the draft engine needs is direct:

```
megaCapable = species has any legal forme where forme.startsWith('Mega')
→ 71 Mega-capable draftable species
```

Verified sample (a Champions-original Mega, absent from all pre-2026 data):

```
meganiummega: num 154, types [Grass, Fairy],
  baseStats {hp 80, atk 92, def 115, spa 143, spd 115, spe 80},
  abilities {0: "Mega Sol"}, requiredItem "Meganiumite", gen 9
```

### Forme filtering — a real pitfall, with a concrete rule

The raw 273 non-Mega entries include junk you must not put in a draft pool: **19 Vivillon patterns, 8 Alcremie creams, Aegislash-Blade, Mimikyu-Busted, Castform-Sunny/Rainy/Snowy, Morpeko-Hangry.** Applying the correct filter:

```
273  raw non-Mega legal entries
-  9  drop battleOnly       (Aegislash-Blade, Mimikyu-Busted, Castform-*, Morpeko-Hangry)
- 30  drop cosmetic formes  (identical types AND baseStats to baseSpecies)
────
234  draftable entries   ·  71 Mega-capable
```

Correctly **kept** (genuinely distinct — different types or stats): Rotom-Heat/Wash/Frost/Fan/Mow, all regional forms, Tauros-Paldea ×3, Gourgeist sizes, Lycanroc-Midnight/Dusk, Basculegion-F, Floette-Eternal.

⚠️ One caveat found while validating: a pure types+stats signature also collapses **Meowstic-F**, which shares stats with Meowstic-M but has different abilities. Add abilities to the signature, or keep a small explicit allowlist. Confidence: HIGH (observed directly).

### Snapshot size — trivially committable

Generated the real artifact:

```
234 draftable entries, megas nested, with types/baseStats/bst/abilities/tier
minified JSON:  76,098 bytes  (74.3 KB)
gzipped:        13,317 bytes  (13.0 KB)
```

This fully satisfies "a committed roster snapshot ships in the repo and works fully offline."

### Sprites

| Option | Coverage | Size | Verdict |
|--------|----------|------|---------|
| **PokeAPI sprites `sprites/pokemon/{id}.png`** | ✅ complete incl. new Megas (10282, 10304 verified) | **~1.0–2.5 KB each → ~310 files ≈ 500–700 KB total** | ✅ **Recommended — commit these** |
| Showdown `/sprites/gen5/` | ❌ gaps: `raichu-mega-x` **404**, `tauros-paldea-combat` **404** | ~1 KB | ❌ Incomplete |
| Showdown `/sprites/dex/` | ❌ same gaps (404s confirmed) | ~3–14 KB | ❌ Incomplete |
| PokeAPI `other/home/{id}.png` | ✅ complete | ~70–170 KB each → **~40 MB** | ❌ Too heavy to commit |

Mapping is clean: PokeAPI's own API hands you the URL — `pokemon/meganium-mega` → `front_default: .../sprites/pokemon/10282.png`. The generator resolves Showdown species → PokeAPI name → numeric id, downloads once, commits the PNGs, and stores the id in the roster JSON.

### Licensing / attribution

| Item | License | Notes |
|------|---------|-------|
| `pokemon-showdown` code & data | **MIT** (verified: "Copyright (c) 2011-2026 Guangcong Luo and other contributors") | Include the MIT notice. Confidence: HIGH |
| `@pkmn/*` packages | **MIT** | Confidence: HIGH |
| PokeAPI API data | Permissive; attribution expected | Confidence: MEDIUM |
| PokeAPI sprites | ⚠️ `LICENSE` at repo root returned **404**; a `LICENCE.txt` (British spelling) exists. README credits Smogon community spriters. | **Read `LICENCE.txt` before shipping** and credit PokeAPI + Smogon spriters. Confidence: LOW — genuinely unresolved. |
| Pokémon names/sprites themselves | © Nintendo / Creatures / GAME FREAK | Standard fan-project posture: non-commercial, no ads, visible disclaimer. |

### The one genuine caveat (honest assessment)

The roster **is** machine-readable — that question is closed. What remains is **volatility, not availability**: Reg M-A → Reg M-B already happened within months, adding ~22 Pokémon. The snapshot-plus-refresh design in PROJECT.md is exactly right.

Both refresh endpoints are confirmed CORS-open for in-browser fetch:

```
raw.githubusercontent.com   → Access-Control-Allow-Origin: *   ✅
pokeapi.co                  → Access-Control-Allow-Origin: *   ✅
play.pokemonshowdown.com    → no ACAO (usable as <img src>, not fetch())
```

So the in-app refresh should hit **raw.githubusercontent.com** (parse `formats-data.ts`) or **PokeAPI**, never Showdown's sprite host via `fetch`.

---

## Export Formats

### Pokémon Showdown — species-only paste ✅ CONFIRMED VALID

Executed `Teams.import()` from `pokemon-showdown@0.11.11`:

| Input | Result |
|-------|--------|
| `"Venusaur\n\nGarchomp\n\nRotom-Wash\n"` | ✅ **3 mons** — Venusaur, Garchomp, Rotom-Wash |
| `"Venusaur\nGarchomp\nRotom-Wash\n"` | ❌ **1 mon** — silently drops the rest |
| `"Venusaur\n\nTauros-Paldea-Aqua\n"` | ✅ 2 mons — hyphenated formes parse correctly |

**Minimal valid paste — blank line between every entry:**

```
Venusaur

Garchomp

Rotom-Wash

Tauros-Paldea-Aqua

Meganium

Kingambit
```

Two implementation notes:
- **The blank line is the record separator.** Emitting newline-separated names is the single most likely export bug. Cover it with a test.
- Use Showdown's exact `species.name` (`Rotom-Wash`, `Tauros-Paldea-Aqua`), not display names.
- Round-tripping through `Teams.export()` yields `"Venusaur  \n\nGarchomp  \n\n"` — trailing spaces are the empty `@ item` slot and are not required on import.

Confidence: **HIGH** (executed, not assumed).

### pokebase.app ✅ INVESTIGATED — accepts Showdown paste

The page is a 12 MB Next.js SPA whose import modal is client-rendered, so I downloaded all 50 JS chunks and read the import code.

**Findings — verbatim from shipped JS:**

- UI hint: `"Or paste export text (Pok\xe9Base JSON or "` → link to `https://github.com/smogon/pokemon-showdown/blob/master/sim/TEAMS.md` → `"Pok\xe9mon Showdown"`
- Server action: `createServerReference(..., "parseShowdownTeamPaste")`
- Textarea `id="team-import-paste"`, `aria-label="Team paste to import"`
- A separate field `id="team-import-pokepaste-url"`, label **"PokePaste Link"**, placeholder `https://pokepast.es/…`
- Entry point button: **"New/Import Team"**
- Its own placeholder example is a standard Showdown paste beginning `Articuno @ Leftovers\nAbility: Pressure\nEVs: 252 HP / 252 SpA / 4 SpD\nModest Nature\n...`

**pokebase.app import accepts three things:** (1) Pokémon Showdown paste text, (2) PokéBase JSON, (3) a pokepast.es URL. It also *exports* Showdown format (`onCopyShowdown`, `onDownloadShowdown`).

**Conclusion: one species-only Showdown paste satisfies both export targets.** No second format, no URL scheme needed. This collapses two PROJECT.md requirements into one implementation.

Confidence: **HIGH** (read from shipped production code).

**Bonus finding — Champions stat points.** pokebase encodes a Champions-specific mechanic as a paste comment:

```
# Champions stat points: HP 20 / Atk 12 / ...
```

Champions has a stat-point allocation system. Out of scope for a species-only drafter (PROJECT.md excludes an in-tool teambuilder), but worth knowing the convention exists — and it confirms comment lines are tolerated in pastes.

---

## Persistence

### Recommendation: `localStorage` for autosave + JSON file export as the durability guarantee

**Use `localStorage`. Do not reach for IndexedDB.**

| Factor | localStorage | IndexedDB |
|--------|--------------|-----------|
| Tournament state size | A few KB–tens of KB. 5 MB cap is ~100× headroom | Irrelevant advantage |
| API | Synchronous | Async |
| **Survives abrupt close** | ✅ **Write in `pagehide` completes synchronously** | ❌ Async writes can be lost mid-flight |
| Complexity | `JSON.stringify` / `parse` | Schema, versioning, migrations |

The synchronous point is the decisive one and it is counter-intuitive: for "must survive refresh and browser close", **`localStorage` is more reliable than IndexedDB**, because you can flush on `pagehide`/`visibilitychange` and know it landed. IndexedDB's async write may never complete when the tab is killed.

Reach for IndexedDB **only** if runtime-caching sprite blobs — and even then the **Cache API** is the better tool.

### Eviction reality — this is why file export matters

Verified from MDN + WebKit storage policy:

- **Safari deletes all script-created storage after 7 days without user interaction on the origin.** This hits localStorage *and* IndexedDB equally — switching storage engines does not dodge it.
- Mitigate with `await navigator.storage.persist()` — persistent storage is skipped during automatic eviction. Treat the result as advisory; call it, don't depend on it.
- Chrome/Firefox evict only under global storage pressure.

**Therefore: browser storage is a convenience layer; the JSON file export is the actual durability guarantee.** Prompt the host to export after a completed draft. This is already a PROJECT.md requirement — this research raises its priority from "nice" to "load-bearing".

### File export/import: use the fallback, gate the fancy path

Verified browser support for the File System Access API in 2026: **Chrome 86+, Edge 86+, Opera 72+ only. Not Firefox. Not Safari** (macOS, iPadOS, or iOS) — Safari supports only the Origin Private File System, which is useless for user-visible files.

**Recommendation:**
- **Baseline (build this first):** export via `Blob` + `URL.createObjectURL` + `<a download>`; import via `<input type="file">` + `File.text()`. ~15 lines, works everywhere, no dependency.
- **Progressive enhancement (optional):** feature-detect `'showSaveFilePicker' in window` for true Save-As with overwrite-in-place.

Do not add a library for this. Do not make the FSA path the primary — it strands Firefox and all iOS users.

---

## Supporting Libraries

**Prescriptive stance: add almost nothing.** Runtime dependencies are `preact` + `@preact/signals`. That is the whole list.

| Need | Verdict | Reasoning |
|------|---------|-----------|
| **Bracket generation** | ❌ **Build it (~150 lines)** | `brackets-manager@1.11.0` drags in `brackets-model` + `uuid` and imposes a CRUD storage abstraction designed for a database — actively hostile to "one serializable object". `tournament-organizer@4.1.1` is closer but still opinionated. Single-elim with byes + round-robin for 4–8 players is a well-understood exercise, and PROJECT.md needs custom bye/Bo3 semantics anyway. |
| **Bracket rendering** | ❌ **CSS Grid / inline SVG** | `brackets-viewer@1.9.1` couples to `brackets-manager`'s model and brings its own theming. A bracket for ≤16 players is a grid with connector lines. |
| **Virtualized lists** | ❌ **Not needed** | The pool is **234 entries**, not 20,000. 234 `<img>` cells is unremarkable. If scroll ever janks, `content-visibility: auto` + `contain-intrinsic-size` is a two-line CSS fix. `@tanstack/virtual-core` would be pure bloat. |
| **Drag and drop** | ❌ **Defer entirely** | Nothing in PROJECT.md requires DnD. Drafting is "click a Pokémon". If manual round-structure editing later wants reordering, use the native HTML5 DnD API or up/down buttons — which are more reliable on touch anyway. Reject `@dnd-kit/core@6.3.1` (~30 KB, React-oriented) and `sortablejs@1.15.7`. |
| **State management** | ❌ **`@preact/signals` is already it** | A single `signal<Tournament>` plus `computed` derivations. Adding Zustand/Redux to a hot-seat app with one state object is unjustifiable. |
| **Schema validation** | ⚠️ **Only for imported JSON — and consider hand-rolling** | Untrusted file input is the one place validation genuinely earns its keep. If a library is wanted: **`valibot@1.4.2`** over `zod@4.4.3` — modular imports mean ~1–3 KB for a schema this size vs Zod's larger baseline. A hand-written `isValidTournament()` guard (~40 lines) is also entirely defensible and keeps the dependency count at two. |
| **ID generation** | ❌ **`crypto.randomUUID()`** | Built into every current browser. `nanoid@6.0.1` is unnecessary. |

**Build-time only (never shipped to the browser):**

| Package | Version | Purpose |
|---------|---------|---------|
| `pokemon-showdown` | `0.11.11` | Roster generation via `Dex.mod('champions')`. **144 MB installed — devDependency only.** Zero bundle impact. |

If 144 MB in `devDependencies` is objectionable, the alternative is fetching `data/mods/champions/formats-data.ts` + `data/pokedex.ts` from `raw.githubusercontent.com` and parsing them in the generator script — no heavy dep, slightly more parsing code. Both are legitimate; the npm package is more robust because it resolves inheritance and formes for you.

---

## Installation

```bash
# Scaffold
npm create vite@latest pokemon-champions-drafter -- --template preact-ts

# Runtime dependencies (the entire list)
npm install preact@10.29.8 @preact/signals@2.10.1

# Optional: validation for imported JSON
npm install valibot@1.4.2

# Build-time only — roster generation, never bundled
npm install -D pokemon-showdown@0.11.11

# Optional: single-file offline artifact
npm install -D vite-plugin-singlefile@2.3.3
```

`vite.config.ts` essentials:

```ts
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  base: '/pokemon-champions-drafter/', // MUST match repo name for project Pages
});
```

---

## Deployment

### Recommendation: **GitHub Actions** (Pages source = "GitHub Actions"). Not `docs/`, not `gh-pages`.

This is not a close call — it is what the author's own reference project does. `xetoxyc/gothic-remake-lockpicker` has exactly one branch (`main`), no `docs/`, and `.github/workflows/deploy-pages.yml`.

| Approach | Verdict |
|----------|---------|
| **GitHub Actions** | ✅ **Recommended.** Source of truth stays `src/`. No build artifacts in git history. Matches the reference exactly. Vite's own docs recommend it. |
| `docs/` folder | ❌ Requires committing `dist/` on every change. Noisy diffs, merge conflicts on hashed filenames, easy to ship a stale build. |
| `gh-pages` branch | ❌ Same artifact-committing problem plus a second branch to maintain. Legacy pattern. |

Set **Settings → Pages → Build and deployment → Source: GitHub Actions**, then use the standard `actions/configure-pages` → `actions/upload-pages-artifact` → `actions/deploy-pages` workflow on push to `main`.

**Does this satisfy "clone the repo and it works"?** Honestly: the *link* always works, instantly — which is the actual bar the reference sets. For a fresh clone, the author runs `npm install && npm run dev`. If a literal zero-tooling local artifact is wanted, ship the `vite-plugin-singlefile` HTML as a release asset. Stating this plainly is better than pretending a module-based build opens from `file://`, because it does not.

**Offline after first load** (a hard PROJECT.md constraint) needs a service worker. Recommendation: hand-write a ~30-line cache-first service worker over the built assets + roster JSON + sprites. Reject `vite-plugin-pwa` — it brings Workbox and a config surface far larger than the problem.

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@pkmn/data` / `@pkmn/dex` **for legality** | **Verified: does not ship the `champions` mod.** `Dex.mod('champions')` throws `Must provide mod data with mod 'champions'` | `pokemon-showdown` npm `Dex.mod('champions')` |
| Assuming the pre-2026 Mega list | Champions added new Megas (Meganium, Feraligatr, Raichu X/Y, Victreebel, Starmie, Dragonite…) | Derive Mega-capability from the `champions` mod at build time |
| Showdown `/sprites/gen5/` or `/sprites/dex/` | **404s confirmed** for `raichu-mega-x`, `tauros-paldea-combat` | PokeAPI `sprites/pokemon/{id}.png` |
| PokeAPI `other/home/` sprites | ~70–170 KB each → ~40 MB committed | PokeAPI `sprites/pokemon/{id}.png` (~500–700 KB total) |
| Scraping Serebii/Bulbapedia/Game8 | HTML tables, no structured export, breaks on redesign — and two clean machine-readable sources agree | Showdown mod + PokeAPI |
| Newline-separated species export | **Verified: imports only the first Pokémon**, silently | Blank line between every entry |
| IndexedDB for tournament state | Async writes can be lost on abrupt close; needless complexity at this size | `localStorage` + `pagehide` flush |
| File System Access API as the *only* path | **No Firefox, no Safari** (incl. all iOS) | Blob download + `<input type="file">`; FSA as enhancement |
| `brackets-manager` / `brackets-viewer` | Database-shaped storage abstraction fights the single-serializable-object design | ~150 lines of bracket logic + CSS Grid |
| Virtualization libraries | 234 items does not need virtualization | Plain grid; `content-visibility: auto` if ever needed |
| `vite-plugin-pwa` | Workbox + config surface >> a 30-line cache-first SW | Hand-written service worker |
| React 19 | ~45 KB gzipped for no benefit here | Preact 10 |
| Floating `typescript@latest` (→ 7.x) | TS 7 is the native Go rewrite; migration risk for zero payoff on a small project | Pin `~5.9` or `~6.0` |

---

## Stack Patterns by Variant

**If the author strongly prefers no UI framework at all:**
- Vite + vanilla TS (exactly the reference project's stack), with one hand-rolled `render(state)` function per view and full re-render on change.
- Viable because the pool is only 234 items — full re-render is cheap.
- Accept that bracket + round-schedule views will be the painful part.

**If the author already knows Svelte:**
- Svelte 5 (`5.56.8`) + Vite, runes for state. Equivalent quality outcome; smaller shipped output. Do not learn it for this project.

**If a literal double-click-the-file artifact becomes a hard requirement:**
- Add `vite-plugin-singlefile@2.3.3`, inline sprites as base64 (~1 MB single HTML).
- Ship as a GitHub Release asset alongside the Pages deploy — not instead of it.

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `vite@8.2.0` | `@preact/preset-vite@2.10.6` | Current pairing |
| `vite@8.x` | `vite-plugin-singlefile@2.3.3` | Peer deps declare `^5.4.21 \|\| ^6 \|\| ^7 \|\| ^8` — verified |
| `preact@10.29.8` | `@preact/signals@2.10.1` | Signals 2.x targets Preact 10.x |
| `pokemon-showdown@0.11.11` | Node 18+ | devDependency only; 144 MB installed |
| `typescript` | Pin `~5.9`/`~6.0` | npm `latest` is `7.0.2` (Go port) — do not float |

---

## Sources

**Executed / verified directly (HIGH confidence)**
- `pokemon-showdown@0.11.11` — `Dex.mod('champions')` enumeration; `Teams.import()` paste tests
- `@pkmn/dex@0.10.11` — confirmed champions mod absent, gen9 Megas present
- `smogon/pokemon-showdown` `config/formats.ts`, `data/mods/champions/formats-data.ts`, `data/pokedex.ts` (raw.githubusercontent.com)
- `https://pokeapi.co/api/v2/pokedex/champions` — 208 entries; diffed against Showdown → zero difference
- pokebase.app — 50 production JS chunks downloaded and read; import parser + placeholder extracted
- `xetoxyc/gothic-remake-lockpicker` — `package.json`, served HTML, branch list, workflow list (GitHub API)
- HTTP probes: sprite availability/sizes across 4 sprite sets; CORS headers on all refresh endpoints
- npm registry — all versions cited

**Documentation (HIGH/MEDIUM)**
- [Vite — Deploying a Static Site](https://vite.dev/guide/static-deploy)
- [MDN — Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- [WebKit — Updates to Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/)
- [Chrome for Developers — File System Access API](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)
- [Showdown TEAMS.md](https://github.com/smogon/pokemon-showdown/blob/master/sim/TEAMS.md)

**Context (MEDIUM/LOW)**
- [Serebii — Champions available Pokémon](https://www.serebii.net/pokemonchampions/pokemon.shtml), [Bulbapedia — Regulation Sets](https://bulbapedia.bulbagarden.net/wiki/Regulation_Sets_in_Pok%C3%A9mon_Champions), [Victory Road — Champions Regulations](https://victoryroad.pro/champions-regulations/) — release/regulation context
- [pokemon.com — Switch release](https://www.pokemon.com/us/news/pokemon-champions-releases-on-nintendo-switch-and-nintendo-switch-2-on-april-8-2026), [mobile release](https://www.pokemon.com/us/pokemon-news/pokemon-champions-comes-to-android-and-ios-on-june-17)
- PokeAPI sprites licensing — **LOW confidence, unresolved**, `LICENCE.txt` must be read before shipping

---

## Open Items for Roadmap

1. **PokeAPI sprite licensing** — the only genuinely unresolved item. Read `LICENCE.txt` in `PokeAPI/sprites` during the data phase. Low risk, must not be skipped.
2. **Roster refresh parser** — decide npm `pokemon-showdown` vs raw-file fetch for the *in-app* refresh path (the browser cannot use the npm package; it must parse raw text or use PokeAPI).
3. **Regulation targeting** — Showdown exposes both `champions` and `championsregma`. Decide whether the tool pins a regulation or always tracks current. Affects the snapshot's metadata shape.
4. **Meowstic-style forme collapsing** — include abilities in the dedupe signature; add a regression test.

---
*Stack research for: zero-backend offline static draft-tournament tool*
*Researched: 2026-08-03*
