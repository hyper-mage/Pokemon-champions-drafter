# Walking Skeleton — Pokémon Champions Drafter

**Phase:** 1
**Generated:** 2026-08-03

## Capability Proven End-to-End

A group opens a public GitHub Pages URL with no install and no account, and two players alternate picks for six rounds against the committed, regulation-stamped Champions roster snapshot — with undo, autosave that survives a browser close, and a paste that imports into both Pokémon Showdown and pokebase.app.

The skeleton proper is plans **01-01 through 01-06**: scaffold, deployed URL, roster snapshot, sprite set, pool on screen, and the log-and-fold draft engine. That chain alone proves delivery, data, and state architecture in one vertical slice. Plans **01-07 through 01-11** are the remaining Phase 1 acceptance requirements — undo and autosave, the export spike, the tab lock, JSON portability, and the offline service worker — layered onto the skeleton without changing any decision below.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | Vite 8.2.0 + TypeScript ~5.9 + Preact 10.29.8 + `@preact/signals` 2.10.1 | Locked by CLAUDE.md. Exactly two runtime dependencies. Preact is ~4 KB against React's ~45 KB for zero benefit at this scale; signals give fine-grained reactivity over a single serializable object, which is precisely what keeps a future sync layer an integration rather than a rewrite. |
| Data layer (there is no database) | A committed JSON roster snapshot under `public/data/`, generated at build time from `pokemon-showdown@0.11.11`'s `Dex.mod(<regulation mod>)` | No server means no server-side data. Legality is the product, so it is derived at build time by a script a human runs and reviews, never parsed in the browser. Two regulations ship: current (M-B) and the frozen prior (M-A), because ROST-06 needs completed tournaments to stay meaningful after a rotation. |
| Persistence | `localStorage` autosave plus JSON file export as the durability guarantee | A tournament is tens of KB against a 5 MiB cap, and a write started in `pagehide` completes synchronously whereas an async IndexedDB write can be lost. The file is the system of record; browser storage is the convenience layer, because storage evaporates in at least six documented ways including Safari's seven-day eviction. |
| State architecture | Append-only action log plus a pure reducer. `state = log.reduce(apply, initialState(config))` | A full eight-player tournament is 350-500 actions, so a complete re-fold is sub-millisecond. That single number removes every cost of the pattern — no snapshotting, no upcasting, no CQRS — while buying undo, a free draft recap, correct-by-construction JSON export, and sync-readiness. |
| Write path | `dispatch` in `src/store.ts`, and nothing else | When sync eventually arrives, `dispatch` gains a `broadcast(action)` call and a sibling `receive(remoteAction)`, and nothing else in the codebase changes. That is "integration, not rewrite" made concrete. |
| Auth | None. There are no accounts, no logins, and no user profiles | Hot-seat on one shared screen. Players are names typed by the host. This is an explicit out-of-scope item, not an omission. |
| Multi-tab safety | `BroadcastChannel` write-ownership lock with a 2s heartbeat and a 6s stale threshold; the second tab opens read-only with an explicit takeover | Chosen over the cheaper write-token guard because it makes a clobber structurally impossible rather than merely noisy. Two tabs both autosaving is the worst failure mode in the research, because it is completely silent. |
| Offline | Hand-written cache-first service worker, roughly 30 lines, precaching everything on install; versioned cache, activate on next load | `vite-plugin-pwa` is explicitly rejected — Workbox plus its config surface is far more than this needs. Relying on the HTTP cache satisfies the requirement in practice but not by construction, and eviction is the browser's call. |
| Sprites | Roughly 310 individual PokeAPI PNGs committed to the repo, under `public/sprites/`, plus one generic placeholder | Resolves a direct contradiction between two research documents in favour of `STACK.md`. Showdown's 40×30 spritesheet icons are too small for Phase 2's across-the-room legibility requirement and its id-to-offset map drifts on every regulation rotation. |
| Deployment target | GitHub Pages, source "GitHub Actions", via a workflow on push to `main` | Free forever, one permanent link, no build artifacts in git history. Not `docs/`, not a `gh-pages` branch. Zero cost is a hard product property, not a preference. |
| Module system | ES modules and `fetch`; the hosted link is the delivery path | A service worker cannot run from `file://` in any case, since it needs a secure context. The build additionally emits `data/roster.<reg>.js` assigning `globalThis.__CHAMPIONS_ROSTER__` as a hedge, so the roster stays loadable without `fetch` if the decision is ever revisited. |
| Directory layout | `src/core/` pure, `src/adapters/` impure, `src/ui/` presentation, with a CI check enforcing the boundary | This split is load-bearing, not stylistic. It is what makes the state sync-ready, replayable, undoable, and testable without mocks — all four properties fall out of the same discipline. `npm run check:pure` fails the build on any `Date.now`, `Math.random`, `localStorage`, `fetch`, `document`, `window`, `navigator`, `crypto`, `BroadcastChannel`, or adapter/ui import under `src/core/`. |
| Styling | Plain CSS driven by custom properties in `src/ui/tokens.css` | No CSS framework, no CSS-in-JS runtime, no component registry, no icon package — all forbidden by the two-dependency constraint. Tokens mean Phase 2's three density settings become a four-token swap rather than a restyle. |
| Validation | Hand-rolled import guard, no schema library | Adding `valibot` or `zod` would be a third runtime dependency. The one untrusted-input path is a single document shape; roughly forty lines of allow-list validation covers it. |

### Deviations from `.planning/research/ARCHITECTURE.md`, recorded deliberately

| Research proposed | Phase 1 ships | Why |
|---|---|---|
| `data/` at the repository root | `public/data/` | Vite copies `public/` verbatim into `dist/`, which keeps the roster a separately cacheable asset the service worker can precache, and keeps it out of the JS bundle. |
| `data/pokemonicons-sheet.png` (one 392 KB Showdown spritesheet) | Roughly 310 individual PokeAPI PNGs | Superseded by CONTEXT.md D-02/D-03. |
| `.js` files throughout | `.ts` / `.tsx` throughout | The stack is locked to TypeScript; the draft engine is rule-heavy and types are the cheapest defence against invalid tournament states. |

## Stack Touched in Phase 1

- [ ] Project scaffold — Vite, TypeScript, Preact, vitest, and the `check:pure` CI gate (plan 01-01)
- [ ] Deployment — GitHub Actions workflow deploying to a live GitHub Pages URL (plan 01-02)
- [ ] Data read — the committed regulation-stamped roster snapshot, generated by a repo script and consumed by the app (plans 01-03, 01-05)
- [ ] Data write — `localStorage` autosave plus JSON file export and import (plans 01-07, 01-10)
- [ ] UI — a real interactive element wired to real state: click a Pokémon, it is picked, the pool shrinks, the turn advances (plans 01-05, 01-06)
- [ ] Offline — a service worker precaching the whole inventory, verified with the network switched off (plan 01-11)

## Out of Scope (Deferred to Later Slices)

Everything below is deliberately absent from Phase 1. This list exists so later phases do not re-litigate Phase 1's minimalism, and so nobody mistakes an omission for an oversight.

- **Host configuration** — player count, player names, format label, tournament depth. The two players are hardcoded `p1`/`Player 1` and `p2`/`Player 2` scaffolding, replaced in Phase 2.
- **Pool sizing** — Phase 1's pool is the entire draftable roster. Auto-sizing from player count and the host override arrive in Phase 2.
- **Pool search, type filters, Mega filters, and the display-density toggle** — Phase 2. The components are built to accept them without restructuring.
- **Typing and base stats on the pool card** — Phase 2. `MonCard` renders sprite and name only.
- **Bans of any kind** — host banlist in Phase 2, snake and blind in Phase 4.
- **The rules compiler, typed team slots, Mega rounds, and Mega-round feasibility** — Phase 3.
- **Priority cards** — Phase 3. Phase 1 uses strict alternation.
- **Swaps, both mid-draft currency and post-draft rounds** — Phase 3.
- **Brackets, round robin, standings, match records, and the draft recap** — Phase 5.
- **Roster refresh from inside the app, the regulation selector, and the staleness banner** — Phase 5. The committed snapshot already satisfies the offline requirement.
- **Confirmation on destructive actions generally** — Phase 1 has exactly one, the import overwrite. One-click picking with no confirm is deliberate (D-08) and is only defensible because unlimited undo ships alongside it.
- **A single-file offline HTML artifact** — `vite-plugin-singlefile` is not adopted. Double-clicking `index.html` is documented as not working, not fixed.
- **Real-time multiplayer, accounts, an in-tool teambuilder, points or tier valuation, auction drafts, pick timers, and replay parsing** — permanently out of scope per REQUIREMENTS.md.

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering any architectural decision above.

- **Phase 2 — Host-Configured Draft Night.** A host sets up a real tournament for 4-8 named friends: config screen, pool auto-sizing with override, host banlist, pool search and type/Mega filters, the three display densities, the full players-by-rounds board, and a config-time feasibility gate. First phase that satisfies a draft-only night end to end.
- **Phase 3 — Compiled Rules, Priority Cards, Swaps.** Composition requirements compile into a typed round schedule before the draft starts; players bid priority cards for turn order over that visible schedule; swaps are filtered by the target slot's own predicate. The compiler comes before swaps, and that ordering is not negotiable.
- **Phase 4 — Blind and Snake Bans.** The ban ritual on one shared screen, with a real full-screen pass-the-device interstitial and a bfcache guard so the back button cannot resurrect a private screen.
- **Phase 5 — Full Tournament.** Round robin with standings and a deterministic tiebreak chain, a seeded top-N cut, a single-elimination bracket with distributed byes, editable match records, a draft recap rendered from the action log, and roster refresh across a regulation rotation.
