# Phase 1: Draft Skeleton on a Real URL - Context

**Gathered:** 2026-08-03
**Status:** Ready for planning

<domain>
## Phase Boundary

A walking skeleton that proves delivery, data, and state architecture in one vertical slice: a deployed GitHub Pages URL where two hardcoded players alternate picks for six rounds against the committed, regulation-stamped Champions roster snapshot, with undo, localStorage autosave, JSON export/import, and a species-only paste that imports into both Pokémon Showdown and pokebase.app. Works with no network after first load.

Covers 32 requirements: ROST-01…12, SHEL-01…07, PERS-01…07, EXPO-01…06.

**Explicitly not this phase:** host config, N players, pool sizing, search, type/Mega filters, the display-density toggle, bans, the rules compiler, priority cards, swaps, brackets, roster refresh. The two hardcoded players are scaffolding, replaced in Phase 2.

</domain>

<decisions>
## Implementation Decisions

### Cross-Cutting Constraint

- **D-01:** The finished product must cost neither the author nor the players any real money. No paid hosting, no CDN bill, no API keys, no required domain purchase. GitHub Pages free tier plus assets committed to the repo. This eliminates every sprite-hosting-as-a-service option and reinforces the existing no-backend constraint.

### Sprite Delivery

- **D-02:** Ship individual PokeAPI PNGs (`sprites/pokemon/{id}.png`, ~1–2.5 KB each), committed to the repo. **This resolves a direct contradiction between two research documents:** `STACK.md` recommends individual PokeAPI PNGs, `ARCHITECTURE.md` assumes a single 392 KB Showdown `pokemonicons-sheet.png`. STACK.md wins. The Showdown spritesheet is rejected — its 40×30 icons are too small for Phase 2's DRFT-14 "legible from across a room" requirement, and its id→offset map drifts on regulation rotation.
- **D-03:** Commit base species **and** all Mega formes, ~310 files total (~234 base + 76 Mega formes, ~600–700 KB). Phase 1 renders only base sprites — the draftable unit is the base species and Mega is a flag — but shipping the Mega set now builds and tests the different PokeAPI id rule for Mega formes (the 10282-style ids) rather than reworking the sprite pipeline when Phase 3's Mega rounds arrive.
- **D-04:** ROST-11's visible fallback is a **single committed generic placeholder icon** used for every gap. Not a type-coloured tile, not name-text-only.
- **D-05:** When the build script hits a sprite 404 it **records and continues**: writes `spriteMissing: true` on that roster entry, prints a summary of artless species, exits 0. The runtime reads the flag and renders the placeholder without ever firing a request it knows will fail. Deliberately different from ROST-04's fail-loudly-on-count-drift posture, so a fresh regulation whose art PokeAPI has not uploaded yet cannot block snapshot regeneration.

### Phase-1 UI Shape

- **D-06:** Build the **real components, thinly wired** — pool grid, mon card, board grid, team strip are the ones Phase 2 keeps and extends, not throwaway scaffolding. Phase 1 wires only render / click-to-pick / remove-on-pick. Phase 2 adds search (DRFT-08), type and Mega filters (DRFT-09), and the density toggle (DRFT-06) on top rather than replacing.
- **D-07:** **Commit to a visual direction now, via CSS custom properties.** Dark, high-contrast, large-target. Tokens cover colour, spacing, sprite-cell size, and font scale, so Phase 2's three density settings and the across-the-room legibility requirement become token swaps rather than a restyle.
- **D-08:** **One click commits a pick.** Click the mon, it is picked, turn advances. No confirm step — undo is the designed safety net and it ships in this same phase. DRFT-13 (confirm before destructive actions) stays Phase 2 scope and is not pre-built here.
- **D-09:** EXPO-06's per-player export is a **Copy button above visible, selectable paste text**. The text being on screen means a blocked or failing Clipboard API is never a dead end. One block per player, never a combined block.

### Recovery UX

- **D-10:** Undo is **unlimited, back to draft start**. No redo. Depth costs nothing — undo is `log.pop()` plus a re-fold of a few hundred actions, sub-millisecond — and it covers the real failure mode of a host realising three picks late that round 2 went wrong. Redo was rejected because the popped actions would have to live outside the log, creating a second piece of state that must be kept out of the persisted document.
- **D-11:** PERS-06's hard milestone in Phase 1 is **draft complete, and nothing else**. A visible, dismissible "Download tournament JSON" prompt appears there. Never a silent auto-download. Later phases add milestones (ban reveal, bracket seeded) against the same mechanism.
- **D-12:** PERS-03 is satisfied by a **BroadcastChannel ownership lock**, not a warning. The first tab claims write ownership; a second tab opens read-only with a banner and an explicit "Take over drafting here" button that transfers ownership. Chosen over the cheaper write-token guard because it makes a clobber structurally impossible rather than merely noisy. **This carries real design work: ownership handoff, and stale-lock recovery when the holding tab crashed or was killed.** Planning must treat that as a task, not a detail.
- **D-13:** PERS-02's storage canary — write a throwaway key to `localStorage`, read it back, delete it, inside a `try` — runs **before the draft renders**, and on failure shows a **blocking start screen** stating storage is unavailable, instructing the host to download JSON as they go, and requiring an acknowledge click. Feature-detecting `'localStorage' in window` is insufficient: it returns true in the cases that matter (private mode, disabled by policy, quota exhausted, embedded webviews) and only the write throws. Phase 2 moves this same check into the real config screen.

### Offline Reach

- **D-14:** SHEL-03 is guaranteed by a **hand-written cache-first service worker** (~30 lines), not by relying on the HTTP cache. Confirms STACK.md's rejection of `vite-plugin-pwa`. HTTP-cache-only was rejected because eviction is at the browser's discretion — it satisfies SHEL-03 in practice but not by construction.
- **D-15:** Stale-cache strategy is **versioned cache name, activate on next load**. The new SW installs in the background, wipes old caches on activate, and takes over the next time the tab opens. No update banner, no `skipWaiting`/`clients.claim` lifecycle — that code is the easiest part of a service worker to get subtly wrong, and a host mid-draft should never be disrupted. Accepts one stale session after a deploy.
- **D-16:** The service worker **precaches everything on install**: app shell, roster JSON, and all ~310 sprites, before it activates. Offline is total from the second visit onward. Accepts ~1 MB and ~310 requests on the very first load.
- **D-17:** **Double-clicking `index.html` from a clone does not have to work.** The hosted GitHub Pages link is the delivery path, so ES modules, `fetch`, and the service worker are all fine (a service worker cannot run from `file://` in any case — it needs a secure context). One cheap hedge per ARCHITECTURE.md: the build additionally emits `data/roster.<reg>.js`, a classic script assigning `globalThis.__CHAMPIONS_ROSTER__`, so the roster stays loadable without `fetch` if the decision is ever revisited. **No** single-file HTML artifact — `vite-plugin-singlefile` is not adopted in this phase.
- **D-18:** The roadmap's "literally double-click `index.html`" test still runs, but its purpose is now to **document the behaviour**, not to fix it. Record what happens in the phase summary.

### Claude's Discretion

The user selected a concrete option on every question asked; no "you decide" answers were given. The following remain Claude's calls because they are already constrained by locked project decisions or are pure implementation detail:

- State shape, file layout under `core/` and `adapters/`, and the CI grep that enforces the pure-core boundary — all specified in `ARCHITECTURE.md`.
- Vite `base` path for GitHub Pages, test framework and structure, autosave debounce interval and `pagehide` flush.
- Whether imported-JSON validation is a hand-rolled `isValidTournament()` guard or `valibot` — STACK.md considers both defensible; not discussed.
- Which regulation snapshots ship. ROST-06 requires the prior regulation's frozen snapshot be retained; the specific regulations were not discussed. Assume current (M-B) plus prior (M-A) unless research finds a reason otherwise.
- Sequencing of the three roadmap-mandated verification chores (export spike, 207-vs-208 count re-diff, PokeAPI `LICENCE.txt` read).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project scope and requirements
- `.planning/PROJECT.md` — Core value, constraints, and the Key Decisions table. Every row in that table is locked; do not re-litigate. §Context carries the verified data traps and the export-format findings.
- `.planning/REQUIREMENTS.md` — Full text of the 32 requirements in this phase: ROST-01…12, SHEL-01…07, PERS-01…07, EXPO-01…06.
- `.planning/ROADMAP.md` §"Phase 1: Draft Skeleton on a Real URL" — Goal, the five success criteria that define done, and the Notes block listing the three mandatory verification chores. §"Ordering Constraints" 1 and 2 apply to this phase.

### Architecture — binding for this phase
- `.planning/research/ARCHITECTURE.md` — The load-bearing document. Read in full before planning.
  - §"Recommended Project Structure" — the `core/` vs `adapters/` split and file layout.
  - §"Pattern 1: Append-Only Action Log + Pure Reducer" — the state architecture, including the `dispatch`/`undo` reference implementation.
  - §"Pattern 2: Pure Core / Impure Shell with Injected Ambients" — why `Date.now()` and `Math.random()` never appear under `core/`, and the seeded PRNG for SHEL-07.
  - §"Pattern 5: Materialize External Results Into the Log" — why `pool/built` must carry actual ids plus `rosterVersion` and `checksum`, and why the document embeds frozen display data.
  - §"Sync-Readiness: Concrete Structural Rules" 1–19 — day-one, non-negotiable. Rule 18's CI grep is how SHEL-04 is verified.
  - §"Roster Snapshot Pipeline" — the build-time/runtime boundary and the shared pure `transform`.
  - §"Build Order" → "The Walking Skeleton" — this phase, stated as a single slice. Do not split it into horizontal layers.
  - **Note the contradiction:** this document's `data/pokemonicons-sheet.png` is superseded by D-02/D-03 above.
- `.planning/research/STACK.md` — Pinned versions, the PokeAPI sprite recommendation that D-02 adopts, the "what NOT to use" table, and the localStorage-over-IndexedDB reasoning behind PERS-01.
- `.planning/research/PITFALLS.md` — The roster classification traps: `includes('mega')` matching Meganium, Floette-Eternal, `Meowstic-M-Mega`'s `battleOnly` value, cosmetic and battle-only formes, and the eleven `isNonstandard: "Future"` entries. Directly drives ROST-09, ROST-10, and the ROST-12 fixture set.
- `.planning/research/FEATURES.md` — Feature-level research.
- `.planning/research/SUMMARY.md` — Cross-cutting synthesis of the four research documents.

### Project instructions
- `CLAUDE.md` — Repo-level instructions. Its technology-stack section duplicates `STACK.md`; where they differ, `STACK.md` is the source.

</canonical_refs>

<code_context>
## Existing Code Insights

**Greenfield.** The repository contains `CLAUDE.md` and `.planning/` only — no source, no `package.json`, no `.claude/codebase/` maps, no prior phase directories. Nothing to reuse, no established patterns to match, no integration points.

### Consequences for planning
- Every convention this phase establishes becomes the project's convention. The `core/`/`adapters/` boundary, the action-naming scheme, the CSS token names, and the test layout are all being set for the first time here.
- Project scaffolding (Vite config, `package.json`, `tsconfig.json`, the GitHub Actions Pages workflow, the CI purity grep) is in scope and has no prior art in the repo to follow.
- `CLAUDE.md`'s Conventions and Architecture sections are both placeholders reading "not yet established" / "not yet mapped". They should be populated as an outcome of this phase.

</code_context>

<specifics>
## Specific Ideas

- **Delivery-model reference:** `https://xetoxyc.github.io/gothic-remake-lockpicker/` — the author's own project, cited in PROJECT.md as the bar for "opens instantly and just works". It is itself a Vite + TS build served from GitHub Pages, and it would not work from `file://` either, which is consistent with D-17.
- **Zero-cost is a hard product property, not a preference.** The user raised it unprompted while selecting discussion areas. Treat any proposal that introduces a recurring bill — for the author or for a player opening the link — as out of bounds.
- **Undo is the interaction the design leans on.** D-08's no-confirm one-click pick is only defensible because D-10's unlimited undo ships in the same phase. Planning must not let one land without the other.

</specifics>

<deferred>
## Deferred Ideas

None raised during discussion — every area stayed inside the phase boundary.

Three gray areas were identified and consciously left unexplored rather than deferred to another phase. They are in scope for Phase 1 and are listed under **Claude's Discretion** above: which regulation snapshots ship, how strictly imported JSON is validated, and the sequencing of the three verification chores.

</deferred>

---

*Phase: 1-Draft Skeleton on a Real URL*
*Context gathered: 2026-08-03*
