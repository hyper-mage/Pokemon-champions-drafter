<!-- GSD:project-start source:PROJECT.md -->
## Project

**Pokémon Champions Drafter**

A browser-based drafting tool for running fantasy-style Pokémon draft tournaments among friends, built around the legal roster and rules of Pokémon Champions. A host configures the tournament rules, the tool builds a draft pool, players take turns claiming Pokémon until everyone has a team of six, and each team exports to pokebase.app and Pokémon Showdown. It runs as a static site — open the link and play, no install, no server, no accounts.

It is for the author and their friends running casual draft tournaments, typically 4–8 players, scaling higher when wanted.

**Core Value:** A group of friends can run an entire draft tournament — rules, bans, picks, swaps, brackets, results — start to finish inside the tool, without anyone reaching for a spreadsheet or a Discord message to track state.

### Constraints

- **Tech stack**: Vite + TypeScript + Preact + `@preact/signals`, two runtime dependencies total — Zero-friction access for the visitor is the delivery premise; a build step in the repo is fine, and the author's own reference project is itself a Vite + TS build
- **Hosting**: GitHub Pages via a GitHub Actions workflow — Matches the reference example; free, permanent, one link
- **Pure core**: Draft, rules, and tournament logic must not touch the DOM, clock, randomness, network, or storage — This is what keeps a future sync layer an integration rather than a rewrite
- **Offline**: Must work with no network after first load — Drafts happen wherever friends are; the committed roster snapshot exists for this
- **Persistence**: Browser storage plus JSON file import/export only — No server means no server-side saves
- **Data source**: Pokémon Champions legal roster, sourced upstream and committed — Legality is the product, not a filter
- **Scale**: 4–8 players by default, must not break at higher counts — Warn when pool math or rules become unsatisfiable rather than hard-capping
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Headline Findings
## Recommended Stack
### Core Technologies
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Vite** | `8.2.0` | Build tool + dev server | Exactly what the reference project uses (`^8.0.12`). Zero-config TS, fast HMR, and a `dist/` that GitHub Pages serves directly. The build is the author's concern, never the player's. |
| **TypeScript** | `5.9.x` (see note) | Type safety for draft rules | The draft engine is rule-heavy: round schedules, priority-card resolution, ban modes, swap budgets. Types are the cheapest defence against invalid tournament states. Reference project uses `~6.0.2`. |
| **Preact** | `10.29.8` | UI rendering | ~4 KB gzipped. Turns bracket/pool/round rendering into declarative functions of state. Zero runtime dependencies. |
| **@preact/signals** | `2.10.1` | Reactive state | Fine-grained reactivity over a **single serializable tournament object** — directly serves the PROJECT.md requirement that adding sync later be "an integration, not a rewrite". |
| **@preact/preset-vite** | `2.10.6` | Vite ↔ Preact integration | One line in `vite.config.ts`; handles JSX + prefresh. |
### On the Framework Question — Prescriptive Answer
- Multi-round draft with a derived round schedule
- Priority-card play and resolution (6 cards × N players, spent-state per round)
- Three distinct ban modes including a blind/hidden-input flow
- Swap currency *and* optional post-draft swap rounds
- Round-robin standings + single-elim bracket with byes + Bo3 tracking
- A ~234-cell pool grid with three display densities, filtered live by Mega-eligibility
| Option | Verdict |
|--------|---------|
| **Preact + signals** | ✅ **Recommended.** ~4 KB. Plain functions, no compiler magic. State stays a plain serializable object. React-compatible escape hatch if a library is ever needed. |
| Svelte 5 (`5.56.8`) | Strong runner-up. Runes are excellent for this. Rejected only because it puts logic inside a compiler-specific `.svelte` format, which is slightly worse for "state is one JSON object I can export". Choose it if the author already knows Svelte. |
| React 19 (`19.2.8`) | Rejected. ~45 KB gzipped for zero benefit at this scale. |
| Vanilla TS + ES modules | Rejected for the reasons above. Viable *only* if the author actively wants the DOM-wrangling practice. |
| Single-file HTML (no build) | Rejected as the primary target — see below, but keep as a **secondary artifact**. |
| Alpine.js (`3.15.12`) / Lit (`3.3.3`) | Rejected. Alpine's markup-driven model fights rule-heavy logic; Lit's Web Component ceremony buys nothing here. |
### The `file://` Trap — Important
- The reference site itself would **not** work from `file://` — it uses absolute paths (`/gothic-remake-lockpicker/assets/...`) and module scripts.
- So "clone and it works" in practice means **"open the GitHub Pages link"**, plus `npm run dev` for the author.
- **`vite-plugin-singlefile@2.3.3`** (supports Vite 8 per its peer deps) inlines all JS + CSS into one `index.html`. With base64-inlined sprites this lands around ~1 MB — chunky but entirely workable, and a great offline/archive artifact.
- Recommendation: **ship the normal Pages build as primary**, and optionally emit `champions-drafter-offline.html` as a release artifact. Do not contort the main build for this.
## Pokémon Data Sourcing
### The Champions roster IS published in machine-readable form — this is not blocked
### Verdict on each candidate source
| Source | Has Champions legality? | Has new Champions Megas? | Verdict |
|--------|------------------------|--------------------------|---------|
| **`pokemon-showdown` npm (`0.11.11`)** | ✅ `Dex.mod('champions')` | ✅ full stats/types/abilities | ✅ **PRIMARY — devDependency only** |
| **PokeAPI `champions` pokedex** | ✅ 208 species | ✅ (`meganium-mega` = id 10282) | ✅ **Cross-check + sprite ID mapping** |
| `@pkmn/data` / `@pkmn/dex` (`0.10.11`) | ❌ **No.** `Dex.mod('champions')` throws `Must provide mod data with mod 'champions'` | ✅ gen9 dex *does* include them | ⚠️ Species stats only — **cannot supply legality** |
| Raw `formats-data.ts` via `raw.githubusercontent.com` | ✅ | ✅ | ✅ Good fallback / in-app refresh (`Access-Control-Allow-Origin: *` verified) |
| Smogon dex data | Usage/tier stats only | — | ❌ Not a legality source |
| Serebii / Bulbapedia / Game8 | Human-readable only (Serebii is one HTML table, no download) | ✅ | ❌ Scraping unjustifiable given A and B exist |
### Mega-capability flag — solved
### Forme filtering — a real pitfall, with a concrete rule
-  9  drop battleOnly       (Aegislash-Blade, Mimikyu-Busted, Castform-*, Morpeko-Hangry)
- 30  drop cosmetic formes  (identical types AND baseStats to baseSpecies)
### Snapshot size — trivially committable
### Sprites
| Option | Coverage | Size | Verdict |
|--------|----------|------|---------|
| **PokeAPI sprites `sprites/pokemon/{id}.png`** | ✅ complete incl. new Megas (10282, 10304 verified) | **~1.0–2.5 KB each → ~310 files ≈ 500–700 KB total** | ✅ **Recommended — commit these** |
| Showdown `/sprites/gen5/` | ❌ gaps: `raichu-mega-x` **404**, `tauros-paldea-combat` **404** | ~1 KB | ❌ Incomplete |
| Showdown `/sprites/dex/` | ❌ same gaps (404s confirmed) | ~3–14 KB | ❌ Incomplete |
| PokeAPI `other/home/{id}.png` | ✅ complete | ~70–170 KB each → **~40 MB** | ❌ Too heavy to commit |
### Licensing / attribution
| Item | License | Notes |
|------|---------|-------|
| `pokemon-showdown` code & data | **MIT** (verified: "Copyright (c) 2011-2026 Guangcong Luo and other contributors") | Include the MIT notice. Confidence: HIGH |
| `@pkmn/*` packages | **MIT** | Confidence: HIGH |
| PokeAPI API data | Permissive; attribution expected | Confidence: MEDIUM |
| PokeAPI sprites | ⚠️ `LICENSE` at repo root returned **404**; a `LICENCE.txt` (British spelling) exists. README credits Smogon community spriters. | **Read `LICENCE.txt` before shipping** and credit PokeAPI + Smogon spriters. Confidence: LOW — genuinely unresolved. |
| Pokémon names/sprites themselves | © Nintendo / Creatures / GAME FREAK | Standard fan-project posture: non-commercial, no ads, visible disclaimer. |
### The one genuine caveat (honest assessment)
## Export Formats
### Pokémon Showdown — species-only paste ✅ CONFIRMED VALID
| Input | Result |
|-------|--------|
| `"Venusaur\n\nGarchomp\n\nRotom-Wash\n"` | ✅ **3 mons** — Venusaur, Garchomp, Rotom-Wash |
| `"Venusaur\nGarchomp\nRotom-Wash\n"` | ❌ **1 mon** — silently drops the rest |
| `"Venusaur\n\nTauros-Paldea-Aqua\n"` | ✅ 2 mons — hyphenated formes parse correctly |
- **The blank line is the record separator.** Emitting newline-separated names is the single most likely export bug. Cover it with a test.
- Use Showdown's exact `species.name` (`Rotom-Wash`, `Tauros-Paldea-Aqua`), not display names.
- Round-tripping through `Teams.export()` yields `"Venusaur  \n\nGarchomp  \n\n"` — trailing spaces are the empty `@ item` slot and are not required on import.
### pokebase.app ✅ INVESTIGATED — accepts Showdown paste
- UI hint: `"Or paste export text (Pok\xe9Base JSON or "` → link to `https://github.com/smogon/pokemon-showdown/blob/master/sim/TEAMS.md` → `"Pok\xe9mon Showdown"`
- Server action: `createServerReference(..., "parseShowdownTeamPaste")`
- Textarea `id="team-import-paste"`, `aria-label="Team paste to import"`
- A separate field `id="team-import-pokepaste-url"`, label **"PokePaste Link"**, placeholder `https://pokepast.es/…`
- Entry point button: **"New/Import Team"**
- Its own placeholder example is a standard Showdown paste beginning `Articuno @ Leftovers\nAbility: Pressure\nEVs: 252 HP / 252 SpA / 4 SpD\nModest Nature\n...`
# Champions stat points: HP 20 / Atk 12 / ...
## Persistence
### Recommendation: `localStorage` for autosave + JSON file export as the durability guarantee
| Factor | localStorage | IndexedDB |
|--------|--------------|-----------|
| Tournament state size | A few KB–tens of KB. 5 MB cap is ~100× headroom | Irrelevant advantage |
| API | Synchronous | Async |
| **Survives abrupt close** | ✅ **Write in `pagehide` completes synchronously** | ❌ Async writes can be lost mid-flight |
| Complexity | `JSON.stringify` / `parse` | Schema, versioning, migrations |
### Eviction reality — this is why file export matters
- **Safari deletes all script-created storage after 7 days without user interaction on the origin.** This hits localStorage *and* IndexedDB equally — switching storage engines does not dodge it.
- Mitigate with `await navigator.storage.persist()` — persistent storage is skipped during automatic eviction. Treat the result as advisory; call it, don't depend on it.
- Chrome/Firefox evict only under global storage pressure.
### File export/import: use the fallback, gate the fancy path
- **Baseline (build this first):** export via `Blob` + `URL.createObjectURL` + `<a download>`; import via `<input type="file">` + `File.text()`. ~15 lines, works everywhere, no dependency.
- **Progressive enhancement (optional):** feature-detect `'showSaveFilePicker' in window` for true Save-As with overwrite-in-place.
## Supporting Libraries
| Need | Verdict | Reasoning |
|------|---------|-----------|
| **Bracket generation** | ❌ **Build it (~150 lines)** | `brackets-manager@1.11.0` drags in `brackets-model` + `uuid` and imposes a CRUD storage abstraction designed for a database — actively hostile to "one serializable object". `tournament-organizer@4.1.1` is closer but still opinionated. Single-elim with byes + round-robin for 4–8 players is a well-understood exercise, and PROJECT.md needs custom bye/Bo3 semantics anyway. |
| **Bracket rendering** | ❌ **CSS Grid / inline SVG** | `brackets-viewer@1.9.1` couples to `brackets-manager`'s model and brings its own theming. A bracket for ≤16 players is a grid with connector lines. |
| **Virtualized lists** | ❌ **Not needed** | The pool is **234 entries**, not 20,000. 234 `<img>` cells is unremarkable. If scroll ever janks, `content-visibility: auto` + `contain-intrinsic-size` is a two-line CSS fix. `@tanstack/virtual-core` would be pure bloat. |
| **Drag and drop** | ❌ **Defer entirely** | Nothing in PROJECT.md requires DnD. Drafting is "click a Pokémon". If manual round-structure editing later wants reordering, use the native HTML5 DnD API or up/down buttons — which are more reliable on touch anyway. Reject `@dnd-kit/core@6.3.1` (~30 KB, React-oriented) and `sortablejs@1.15.7`. |
| **State management** | ❌ **`@preact/signals` is already it** | A single `signal<Tournament>` plus `computed` derivations. Adding Zustand/Redux to a hot-seat app with one state object is unjustifiable. |
| **Schema validation** | ⚠️ **Only for imported JSON — and consider hand-rolling** | Untrusted file input is the one place validation genuinely earns its keep. If a library is wanted: **`valibot@1.4.2`** over `zod@4.4.3` — modular imports mean ~1–3 KB for a schema this size vs Zod's larger baseline. A hand-written `isValidTournament()` guard (~40 lines) is also entirely defensible and keeps the dependency count at two. |
| **ID generation** | ❌ **`crypto.randomUUID()`** | Built into every current browser. `nanoid@6.0.1` is unnecessary. |
| Package | Version | Purpose |
|---------|---------|---------|
| `pokemon-showdown` | `0.11.11` | Roster generation via `Dex.mod('champions')`. **144 MB installed — devDependency only.** Zero bundle impact. |
## Installation
# Scaffold
# Runtime dependencies (the entire list)
# Optional: validation for imported JSON
# Build-time only — roster generation, never bundled
# Optional: single-file offline artifact
## Deployment
### Recommendation: **GitHub Actions** (Pages source = "GitHub Actions"). Not `docs/`, not `gh-pages`.
| Approach | Verdict |
|----------|---------|
| **GitHub Actions** | ✅ **Recommended.** Source of truth stays `src/`. No build artifacts in git history. Matches the reference exactly. Vite's own docs recommend it. |
| `docs/` folder | ❌ Requires committing `dist/` on every change. Noisy diffs, merge conflicts on hashed filenames, easy to ship a stale build. |
| `gh-pages` branch | ❌ Same artifact-committing problem plus a second branch to maintain. Legacy pattern. |
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
## Stack Patterns by Variant
- Vite + vanilla TS (exactly the reference project's stack), with one hand-rolled `render(state)` function per view and full re-render on change.
- Viable because the pool is only 234 items — full re-render is cheap.
- Accept that bracket + round-schedule views will be the painful part.
- Svelte 5 (`5.56.8`) + Vite, runes for state. Equivalent quality outcome; smaller shipped output. Do not learn it for this project.
- Add `vite-plugin-singlefile@2.3.3`, inline sprites as base64 (~1 MB single HTML).
- Ship as a GitHub Release asset alongside the Pages deploy — not instead of it.
## Version Compatibility
| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `vite@8.2.0` | `@preact/preset-vite@2.10.6` | Current pairing |
| `vite@8.x` | `vite-plugin-singlefile@2.3.3` | Peer deps declare `^5.4.21 \|\| ^6 \|\| ^7 \|\| ^8` — verified |
| `preact@10.29.8` | `@preact/signals@2.10.1` | Signals 2.x targets Preact 10.x |
| `pokemon-showdown@0.11.11` | Node 18+ | devDependency only; 144 MB installed |
| `typescript` | Pin `~5.9`/`~6.0` | npm `latest` is `7.0.2` (Go port) — do not float |
## Sources
- `pokemon-showdown@0.11.11` — `Dex.mod('champions')` enumeration; `Teams.import()` paste tests
- `@pkmn/dex@0.10.11` — confirmed champions mod absent, gen9 Megas present
- `smogon/pokemon-showdown` `config/formats.ts`, `data/mods/champions/formats-data.ts`, `data/pokedex.ts` (raw.githubusercontent.com)
- `https://pokeapi.co/api/v2/pokedex/champions` — 208 entries; diffed against Showdown → zero difference
- pokebase.app — 50 production JS chunks downloaded and read; import parser + placeholder extracted
- `xetoxyc/gothic-remake-lockpicker` — `package.json`, served HTML, branch list, workflow list (GitHub API)
- HTTP probes: sprite availability/sizes across 4 sprite sets; CORS headers on all refresh endpoints
- npm registry — all versions cited
- [Vite — Deploying a Static Site](https://vite.dev/guide/static-deploy)
- [MDN — Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- [WebKit — Updates to Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/)
- [Chrome for Developers — File System Access API](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)
- [Showdown TEAMS.md](https://github.com/smogon/pokemon-showdown/blob/master/sim/TEAMS.md)
- [Serebii — Champions available Pokémon](https://www.serebii.net/pokemonchampions/pokemon.shtml), [Bulbapedia — Regulation Sets](https://bulbapedia.bulbagarden.net/wiki/Regulation_Sets_in_Pok%C3%A9mon_Champions), [Victory Road — Champions Regulations](https://victoryroad.pro/champions-regulations/) — release/regulation context
- [pokemon.com — Switch release](https://www.pokemon.com/us/news/pokemon-champions-releases-on-nintendo-switch-and-nintendo-switch-2-on-april-8-2026), [mobile release](https://www.pokemon.com/us/pokemon-news/pokemon-champions-comes-to-android-and-ios-on-june-17)
- PokeAPI sprites licensing — **LOW confidence, unresolved**, `LICENCE.txt` must be read before shipping
## Open Items for Roadmap
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
