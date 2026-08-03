# Phase 1: Draft Skeleton on a Real URL - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-03
**Phase:** 1-Draft Skeleton on a Real URL
**Areas discussed:** Sprite delivery, Phase-1 UI shape, Recovery UX, Offline reach

---

## Area Selection

Four gray areas were offered; the user selected all four and added a cross-cutting constraint unprompted.

**User's addition:** "the final product should not cost me or the users any real money"

**Notes:** Locked immediately as a product property rather than a preference. It rules out paid hosting, CDN bills, API keys, and required domain purchases before any option was evaluated — which pre-eliminated every sprite-hosting-as-a-service path in the area that followed.

---

## Sprite delivery

Framed around a direct contradiction between two research documents: `STACK.md` recommends ~310 committed individual PokeAPI PNGs; `ARCHITECTURE.md` assumes a single 392 KB Showdown `pokemonicons-sheet.png`.

### Q1: Which sprite asset ships in the repo?

| Option | Description | Selected |
|--------|-------------|----------|
| Individual PokeAPI PNGs | ~310 files, ~1–2.5 KB each, ~500–700 KB total. Verified complete coverage including new Champions Megas. One `<img src>` per cell. Cost: 310 files in git, 310 requests cold | ✓ |
| Showdown icon spritesheet | One 392 KB PNG, CSS `background-position` per cell. One request, smaller total. Cost: 40×30 icons only, weak for DRFT-14; id→offset map drifts on rotation | |
| Both | Spritesheet for minimal density, PNGs for standard/full. Covers the Phase 2 density toggle. Cost: two pipelines, two id-mapping rules | |
| You decide | | |

**User's choice:** Individual PokeAPI PNGs
**Notes:** Resolves the research contradiction in STACK.md's favour.

### Q2: Base species only, or base plus Mega formes?

| Option | Description | Selected |
|--------|-------------|----------|
| Base species only | ~234 files. Phase 1 has no Mega rounds and the draftable unit is the base species. Smallest repo, simplest mapping; Phase 3 adds formes if needed | |
| Base + all Mega formes | ~310 files. Ships everything the project will need; builds and tests the different 10282-style Mega forme id rule now. Cost: ~76 images unused for three phases | ✓ |
| You decide | | |

**User's choice:** Base + all Mega formes

### Q3: What renders when a sprite is missing (ROST-11)?

| Option | Description | Selected |
|--------|-------------|----------|
| Type-colored tile + name | Primary-type colour fill plus name text. Legible across a room, reuses type colours the grid needs anyway | |
| Generic placeholder icon | One committed "missing sprite" image for every gap. Dead simple, visually obvious. Every gap looks identical | ✓ |
| Name text only | Empty cell with the species name. Least work; grid loses visual rhythm where gaps land | |
| You decide | | |

**User's choice:** Generic placeholder icon

### Q4: Build script behaviour on a sprite 404?

| Option | Description | Selected |
|--------|-------------|----------|
| Record it, keep going | Write `spriteMissing: true`, print a summary, exit 0. Runtime renders the placeholder without firing a doomed request. Keeps snapshots generatable when PokeAPI uploads art late | ✓ |
| Hard-fail the build | Any 404 aborts, consistent with ROST-04's fail-loudly posture. Cost: a new regulation with missing art blocks regeneration | |
| Fail on unexpected gaps only | Allowlist of known-artless ids; 404s outside it abort. Catches real breakage, tolerates known gaps. Cost: another list to maintain across rotations | |
| You decide | | |

**User's choice:** Record it, keep going
**Notes:** Deliberately diverges from ROST-04's fail-loudly-on-count-drift posture. Count drift means the data is wrong; missing art means upstream is slow.

---

## Phase-1 UI shape

Scoped up front: search (DRFT-08), type/Mega filters (DRFT-09), and the density toggle (DRFT-06) are Phase 2 and were excluded from the questions.

### Q1: Real component or deliberate throwaway?

| Option | Description | Selected |
|--------|-------------|----------|
| Real component, thin | Build the actual pool grid, mon card, board grid, team strip — the ones Phase 2 keeps — but wire only what Phase 1 needs. Phase 2 adds on top rather than replacing | ✓ |
| Deliberate throwaway | Unstyled list of 234 names, two team columns, a button. Phase 2 deletes it. Keeps Phase 1 fast and honest about the hardcoded players being scaffolding | |
| You decide | | |

**User's choice:** Real component, thin

### Q2: Visual direction now, or browser defaults?

| Option | Description | Selected |
|--------|-------------|----------|
| Commit now, tokens up front | Dark, high-contrast, large-target via CSS custom properties. Phase 2's DRFT-14 legibility and three densities become token swaps, not a restyle | ✓ |
| Structural CSS only | Layout and sizing so it isn't unusable; no theme or colour system. Phase 2 does the visual pass when legibility is actually in scope | |
| You decide | | |

**User's choice:** Commit now, tokens up front

### Q3: How does a pick get committed?

| Option | Description | Selected |
|--------|-------------|----------|
| One click, undo covers it | Click the mon, it's picked, turn advances. Fastest for a host typing names dictated over voice; undo is the designed safety net and ships this phase | ✓ |
| Click then confirm | Two-step commit. Fewer misclicks reach the log, establishes the pattern DRFT-13 needs. Costs a click on every pick | |
| You decide | | |

**User's choice:** One click, undo covers it

### Q4: What does per-player export look like (EXPO-06)?

| Option | Description | Selected |
|--------|-------------|----------|
| Copy button + visible paste | Six lines as selectable text with a Copy button above. A failed clipboard write is never a dead end | ✓ |
| Copy button only | Cleanest screen. Cost: blocked Clipboard API leaves the team unreachable | |
| Both players, one paste block | Simplest to build. Cost: violates "per player", scales badly to 8 | |
| You decide | | |

**User's choice:** Copy button + visible paste

---

## Recovery UX

### Q1: How deep does undo go (SHEL-06)?

| Option | Description | Selected |
|--------|-------------|----------|
| Unlimited, back to start | `log.pop()` plus a re-fold of ~500 actions is sub-millisecond, so depth is free. Covers realising three picks late that round 2 went wrong | ✓ |
| Last action only | Matches the roadmap's literal "undoes the last pick". Prevents unwinding half a draft by accident | |
| Unlimited + redo | Full stack plus redo. Popped actions must live outside the log — a second piece of state to keep out of the persisted document | |
| You decide | | |

**User's choice:** Unlimited, back to start

### Q2: What is a hard milestone, and how is the checkpoint offered (PERS-06)?

| Option | Description | Selected |
|--------|-------------|----------|
| Prompt at draft complete | Phase 1's only hard milestone. Visible dismissible prompt. Later phases add milestones to the same mechanism. Never downloads unasked | ✓ |
| Prompt at start and complete | Adds a recovery point when the log is empty — which is also when there is least to lose | |
| Silent auto-download | Guarantees a checkpoint exists. Cost: browsers treat unrequested downloads badly; a folder of mystery JSON is its own problem | |
| You decide | | |

**User's choice:** Prompt at draft complete

### Q3: How do two tabs avoid clobbering each other (PERS-03)?

| Option | Description | Selected |
|--------|-------------|----------|
| Ownership lock, second tab read-only | BroadcastChannel write ownership; second tab read-only with an explicit takeover button. Clobber becomes structurally impossible. Cost: handoff and stale-lock recovery need designing | ✓ |
| Write-token guard | Generation counter per save; losing tab stops autosaving and warns. Simpler. Cost: conflict discovered only on next write, so picks can be stranded in memory | |
| Warn-only banner | `storage` event listener plus a warning; writes stay last-writer-wins. Cheapest, satisfies the literal wording, clobber still reachable | |
| You decide | | |

**User's choice:** Ownership lock, second tab read-only
**Notes:** Chosen knowing it is the most expensive of the three. The stale-lock case (holder tab crashed) is real work and belongs in the plan as a task.

### Q4: Where does the storage canary warning live (PERS-02)?

**Clarification requested:** the user asked what "canary" means before answering. Explained: a cheap probe run up front to detect failure before it costs anything — here, writing a throwaway `localStorage` key, reading it back, and deleting it inside a `try`. `'localStorage' in window` is insufficient because it returns true in exactly the failing cases (private mode, disabled by policy, quota exhausted, embedded webviews) and only the write throws. The question was then re-asked.

| Option | Description | Selected |
|--------|-------------|----------|
| Blocking start screen | Probe runs before the draft renders; on failure a full-width panel states the problem, instructs downloading JSON as you go, and requires acknowledgement. Nobody gets 12 picks into a session that was never going to persist | ✓ |
| Persistent header banner | Non-dismissible banner above the board all session. Less friction. Cost: banner blindness, and this is the one warning that must not be ignored | |
| You decide | | |

**User's choice:** Blocking start screen

---

## Offline reach

Noted during framing: a service worker cannot run from `file://` either (secure context required), so the offline guarantee and double-click support are separate paths, not one.

### Q1: What guarantees SHEL-03?

| Option | Description | Selected |
|--------|-------------|----------|
| Hand-written cache-first SW | ~30 lines; install caches shell + roster + sprites, fetch serves cache-first. STACK.md already rejects `vite-plugin-pwa` in favour of exactly this. Cost: the stale-cache failure mode | ✓ |
| Rely on HTTP cache | No SW. Hash-named assets, long cache headers. Zero moving parts. Cost: not a guarantee — eviction is the browser's call, and a cold profile offline gets nothing | |
| You decide | | |

**User's choice:** Hand-written cache-first SW

### Q2: How does a redeploy reach an existing visitor?

| Option | Description | Selected |
|--------|-------------|----------|
| Versioned cache, activate on next load | Cache name carries a build version; new SW installs in background, wipes old caches on activate, takes over next tab open. No UI. Cost: one stale session after a deploy | ✓ |
| Versioned cache + update prompt | Adds a "new version available" banner. Cost: `skipWaiting`/`clients.claim` lifecycle — the code easiest to get subtly wrong | |
| Network-first for the app shell | HTML/JS try network first, roster and sprites stay cache-first. Always fresh online. Cost: flaky connections wait on a timeout every load | |
| You decide | | |

**User's choice:** Versioned cache, activate on next load

### Q3: Must double-clicking `index.html` work?

| Option | Description | Selected |
|--------|-------------|----------|
| Hosted link only, hedge the roster | ES modules + fetch + SW; Pages is the delivery path. Build also emits `data/roster.<reg>.js` assigning a global, per ARCHITECTURE.md, so the roster stays loadable without fetch if revisited | ✓ |
| Hosted link only, no hedge | Pure Vite defaults, nothing extra emitted. Simplest build | |
| Add a single-file HTML artifact | `vite-plugin-singlefile` inlines everything into a ~1 MB HTML published as a Release asset — genuinely works from `file://`. Cost: second build target, STACK.md warns against contorting the main build | |
| You decide | | |

**User's choice:** Hosted link only, hedge the roster
**Notes:** The roadmap's "literally double-click `index.html`" chore still runs, but now documents the behaviour rather than fixing it.

### Q4: What does the SW precache on install?

| Option | Description | Selected |
|--------|-------------|----------|
| Everything, on install | Shell + roster + all ~310 sprites before activation. Offline total from the second visit, guaranteed. Cost: ~1 MB and 310 requests on first load; a failed install means no SW until next visit | ✓ |
| Shell + roster now, sprites on demand | Fast first load, install can't fail on one bad sprite. Cost: a visitor who loads and closes before drafting goes offline with no art | |
| Shell + roster + base sprites | Precache the 234 base sprites, leave 76 Mega formes on demand — nothing in Phase 1–2 renders them. Cost: two categories in the SW manifest | |
| You decide | | |

**User's choice:** Everything, on install

---

## Wrap-up

Offered a second round on three unexplored gray areas: which regulation snapshots ship (ROST-06 wants the prior one retained), how strictly imported JSON is validated (hand-rolled guard vs `valibot`), and sequencing of the three roadmap-mandated verification chores. User chose to proceed to context.

## Claude's Discretion

No question was answered with "you decide" — the user selected a concrete option every time. The following are Claude's calls by default, not by deferral, and are recorded in CONTEXT.md:

- State shape, `core/`/`adapters/` file layout, and the CI purity grep — already specified in `ARCHITECTURE.md`
- Vite `base` path for Pages, test framework and structure, autosave debounce and `pagehide` flush
- Imported-JSON validation approach (hand-rolled guard vs `valibot`)
- Which regulation snapshots ship
- Sequencing of the export spike, the 207-vs-208 count re-diff, and the PokeAPI `LICENCE.txt` read

## Deferred Ideas

None. Discussion stayed inside the phase boundary throughout; no scope creep was raised and nothing needed redirecting to a future phase.
