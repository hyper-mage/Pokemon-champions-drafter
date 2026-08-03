# Architecture Research

**Domain:** Client-only, state-heavy, turn-based tournament tooling (static site, zero backend, hot-seat multiplayer)
**Researched:** 2026-08-03
**Confidence:** HIGH for state/sync patterns and the roster pipeline (directly verified against source data and official docs); MEDIUM for the rules-compiler taxonomy (reasoned analysis — no direct prior art found for this specific pattern)

---

## Executive Position

Four architectural commitments carry this project. Everything else is detail.

1. **The tournament is a document, not a session.** One JSON object: `{ schemaVersion, config, ruleSet, schedule, log[] }`. The log is the source of truth; visible state is a fold over it.
2. **Pure core, impure shell.** All state transitions live in functions with zero access to DOM, clock, randomness, network, or storage. Ambient values are stamped onto actions at the edge.
3. **Composition rules compile to a round schedule before the draft starts.** The schedule then *types the team slots*, which is what makes swaps safe too.
4. **The roster is a build-time artifact.** A committed snapshot is the offline guarantee; refresh is an override, never a dependency.

Commitments 1 and 2 together are the entire "sync-ready" requirement from PROJECT.md. There is no separate sync-readiness work item — it is a set of coding rules followed from day one.

---

## Standard Architecture

### System Overview

```
┌───────────────────────────────────────────────────────────────────────┐
│                              UI LAYER                                  │
│   host config · pool browser · ban screens · draft board · brackets    │
│   Reads: selectors (derived views).  Writes: dispatch(intent) only.    │
├───────────────────────────────────────────────────────────────────────┤
│                    STORE  (the only orchestration point)               │
│   dispatch(intent) → stamp {seq, at, actorId, id} → canApply? →        │
│   append to log → apply → notify subscribers → debounced save          │
│   THIS is the future sync seam. Nothing else needs to change.          │
├───────────────────────────────────────────────────────────────────────┤
│                    IMPURE EDGE / ADAPTERS                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │persist   │ │ file-io  │ │  export  │ │ roster   │ │ clock/id │   │
│  │localStg  │ │ JSON i/o │ │  paste   │ │ source   │ │ Date/uuid│   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
│  The ONLY places allowed to touch storage, network, clock, randomness. │
├═══════════════════════════════════════════════════════════════════════┤
│                    PURE CORE  (no imports from anything above)         │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │  reduce.js   apply(state, action) → state                       │  │
│  │              canApply(state, action) → Ok | Rejected(reason)    │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────────────┐   │
│  │ rules/     │ │ draft/     │ │ tournament/│ │ selectors.js     │   │
│  │ compile    │ │ pool       │ │ bracket    │ │ availablePool    │   │
│  │ predicates │ │ order      │ │ standings  │ │ teams, standings │   │
│  │ feasibility│ │ picks/swaps│ │            │ │ currentRound     │   │
│  └────────────┘ └────────────┘ └────────────┘ └──────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │  rng.js (seeded PRNG, cursor in state)  ·  model.js (shapes)    │  │
│  └─────────────────────────────────────────────────────────────────┘  │
├───────────────────────────────────────────────────────────────────────┤
│                          STATIC DATA                                   │
│  ┌────────────────────────┐  ┌────────────────────────────────────┐   │
│  │ data/roster.<reg>.json │  │ data/pokemonicons-sheet.png        │   │
│  │ committed, versioned   │  │ committed, offline sprites         │   │
│  └────────────────────────┘  └────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────────┘

              Dependency direction is strictly downward.
              PURE CORE imports nothing above it. Ever.
```

### Component Responsibilities

| Component | Owns | Depends on | Never touches |
|---|---|---|---|
| `core/model.js` | State shape, `initialState(config)`, `schemaVersion`, migrations | nothing | — |
| `core/reduce.js` | `apply(state, action)`, `canApply(state, action)` | model, rules, draft, tournament, rng | DOM, storage, network, `Date`, `Math.random` |
| `core/rng.js` | Seeded PRNG (mulberry32/xorshift32); `next(seed, cursor) → {value, cursor}` | nothing | `Math.random` |
| `core/rules/predicates.js` | Serializable predicate descriptors + pure evaluator `test(desc, mon) → bool` | roster shape | — |
| `core/rules/compile.js` | `compileSchedule(ruleSet, rosterView, playerCount) → RoundSchedule \| Infeasible` | predicates, feasibility | state, UI |
| `core/rules/feasibility.js` | Static satisfiability: pool math, per-round sub-pool minimums, mutually exclusive rules | predicates | — |
| `core/draft/pool.js` | Stratified, seeded pool construction from post-ban roster + schedule | rng, predicates | roster fetching |
| `core/draft/order.js` | Priority-card resolution → deterministic pick order for a round | rng (tie-breaks only) | — |
| `core/draft/picks.js` | Pick application, slot assignment, pool removal | predicates | — |
| `core/draft/swaps.js` | Swap budget ledger, slot-type-preserving replacement, swap rounds | predicates | — |
| `core/tournament/standings.js` | Round-robin generation, points, tiebreaks | nothing | — |
| `core/tournament/bracket.js` | Single-elim seeding, byes, advancement, Bo3 | nothing | — |
| `core/selectors.js` | Every derived view the UI needs. **All derived data lives here, not in state.** | model | — |
| `store.js` | Log append, ambient stamping, subscriber notification, save scheduling | core + adapters | rendering |
| `adapters/persistence.js` | localStorage autosave/load, quota handling, schema migration invocation | core/model | core logic |
| `adapters/file-io.js` | JSON download/upload | core/model | — |
| `adapters/export-paste.js` | Species-only paste text for Showdown / pokebase | selectors | — |
| `adapters/roster-source.js` | Snapshot load, optional live refresh, resolution precedence | core/roster/transform | core logic |
| `adapters/clock.js`, `adapters/id.js` | `Date.now()`, id generation. **The only files allowed to.** | nothing | — |
| `core/roster/transform.js` | Pure `(pokedexJson, championsFormatsText) → RosterSnapshot` — shared by Node script and browser refresh | nothing | fs, fetch |
| `scripts/build-roster.mjs` | Node CLI: fetch upstream → `transform` → write + commit snapshot | core/roster/transform | browser APIs |
| `ui/*` | Rendering, input, hot-seat privacy flows | selectors, store | core internals |

**The one rule that matters:** if a file under `core/` ever needs `Date.now()`, `Math.random()`, `fetch`, `localStorage`, or `document`, the design is wrong. Push the value up to the edge and pass it in on the action.

---

## Recommended Project Structure

```
/
├── index.html                       # entry; loads roster snapshot then app
├── app.js                           # composition root: wires store + adapters + UI
├── data/
│   ├── roster.regmb.json            # GENERATED, COMMITTED. current regulation
│   ├── roster.regma.json            # GENERATED, COMMITTED. prior regulation
│   ├── roster.index.json            # which regulations exist, which is default
│   └── pokemonicons-sheet.png       # COMMITTED. offline sprites (~392 KB, one file)
├── scripts/
│   └── build-roster.mjs             # Node; regenerates data/roster.*.json
├── src/
│   ├── store.js                     # append-only log store; THE sync seam
│   ├── core/                        # ══ PURE. zero side effects. ══
│   │   ├── model.js                 # state shape, initialState, schemaVersion, migrate()
│   │   ├── actions.js               # action type constants + creators (payload only)
│   │   ├── reduce.js                # apply() + canApply()
│   │   ├── rng.js                   # seeded PRNG
│   │   ├── selectors.js             # ALL derived data
│   │   ├── roster/
│   │   │   ├── transform.js         # upstream bytes -> RosterSnapshot (shared w/ Node)
│   │   │   └── view.js              # snapshot -> RosterView (regulation + ban filtering)
│   │   ├── rules/
│   │   │   ├── ruleset.js           # RuleSet config shape + defaults
│   │   │   ├── predicates.js        # descriptor language + evaluator
│   │   │   ├── compile.js           # RuleSet -> RoundSchedule
│   │   │   └── feasibility.js       # satisfiability analysis + warnings
│   │   ├── draft/
│   │   │   ├── pool.js              # stratified seeded pool construction
│   │   │   ├── order.js             # priority-card resolution
│   │   │   ├── picks.js             # pick application + slot typing
│   │   │   └── swaps.js             # swap ledger, slot-preserving
│   │   └── tournament/
│   │       ├── standings.js
│   │       └── bracket.js
│   ├── adapters/                    # ══ IMPURE. the only side effects. ══
│   │   ├── persistence.js
│   │   ├── file-io.js
│   │   ├── export-paste.js
│   │   ├── roster-source.js
│   │   ├── clock.js
│   │   └── id.js
│   └── ui/
│       ├── screens/                 # config, bans, draft, swaps, bracket, results
│       ├── components/              # pool grid, mon card, team strip, card tray
│       └── privacy.js               # blind-ban pass-the-device / hide-input flow
└── tests/
    └── core/                        # pure core = trivially testable, no mocks needed
```

### Structure Rationale

- **`core/` vs `adapters/` is the load-bearing split.** It is not stylistic. It is what makes the state sync-ready, replayable, undoable, and testable without mocks — all four properties fall out of the same discipline. A lint rule or a one-line CI grep (`grep -rn "Date.now\|Math.random\|localStorage\|fetch\|document\." src/core/`) enforces it cheaply.
- **`rules/` separate from `draft/`.** The compiler runs once, before the draft; the draft engine consumes its output as inert data. Keeping them in separate folders makes the "compile once, never re-read the rules" rule visible in the file tree.
- **`selectors.js` as a single file, not scattered.** Every temptation to store derived data (current pool, team lists, standings) should hit an obvious existing home for the computed alternative.
- **`core/roster/transform.js` deliberately sits in `core/`,** even though only the Node script and a network adapter call it. It is a pure function of bytes → data, so it is shared by the build-time script and the optional runtime refresh. That sharing is the whole point of the pipeline design (see Roster Snapshot Pipeline below).
- **`data/` is generated but committed.** Treat it as source for the running app and as build output for the repo. Add a header comment/field (`generatedAt`, `sourceCommit`) so nobody hand-edits it.

**Module system caveat (verified):** ES modules and `fetch()` are both blocked under the `file://` protocol — the browser assigns origin `null` and CORS rejects it, while classic `<script src>` tags still work. If "clone the repo and double-click `index.html`" must work, the app cannot use ES modules or `fetch` at all, and the roster snapshot must ship as a classic script assigning a global. If the GitHub Pages link is the primary delivery path (which PROJECT.md's reference example implies), ES modules are fine and this is a non-issue. **Recommendation: use ES modules, treat the hosted link as the delivery path, and additionally emit `data/roster.<reg>.js` (a classic script assigning `globalThis.__CHAMPIONS_ROSTER__`) so the roster is loadable without `fetch` if the decision is ever revisited.** This is a real fork worth deciding in Phase 1, not later.
[Sources: [xjavascript.com on module CORS](https://www.xjavascript.com/blog/access-to-script-from-origin-null-has-been-blocked-by-cors-policy-error-while-trying-to-launch-an-html-page-using-an-imported-js-function/), [three.js forum on `file://` fetch](https://discourse.threejs.org/t/access-to-fetch-at-file-c-d-glb-from-origin-null-has-been-blocked-by-cors-policy/46480) — MEDIUM confidence, widely reproduced behavior]

---

## Architectural Patterns

### Pattern 1: Append-Only Action Log + Pure Reducer  ← **RECOMMENDED**

**What:** The persisted document holds an append-only array of serializable actions. Visible state is `log.reduce(apply, initialState(config))`, computed once on load and then advanced incrementally on each dispatch. Nothing else is persisted as truth.

**Recommendation: adopt this. Do not adopt full event-sourcing infrastructure.**

The distinction matters. "Event sourcing" in the enterprise sense brings event stores, projections, snapshotting for performance, event upcasting, and CQRS read models — and the literature is clear that this is a heavy, hard-to-reverse commitment justified only when auditability and historical reconstruction pay for the complexity ([Azure Architecture Center](https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing), [Fowler](https://martinfowler.com/eaaDev/EventSourcing.html)). What this project needs is the *shape* — an ordered list of intents and a pure fold — with none of the infrastructure.

**Why the shape is nearly free here:**

| Cost of event sourcing | Why it doesn't apply |
|---|---|
| Snapshotting for replay performance | A full 8-player tournament is ~350–500 actions (48 picks + 48 card plays + ~40 bans + swaps + ~30 match results). A full re-fold is sub-millisecond. **Skip snapshots entirely.** |
| Event schema evolution / upcasting | Each tournament is a short-lived, self-contained document, not a decade-lived aggregate. A single `schemaVersion` + one `migrate()` function covers it. |
| Concurrency, ordering, distributed consistency | Single writer, single device. Ordering is trivially the array. |
| Query performance / read models | Selectors over an in-memory object. |
| Operational burden (event store, infra) | There is no server. |

**What it buys, immediately:**

| Benefit | Why it matters here specifically |
|---|---|
| **Undo/redo** | The single highest-value feature for hot-seat. One person types picks called out over voice. Misclicks are the dominant failure mode, and "we have to restart the draft" is the failure that sends people back to the spreadsheet. Undo = drop the last action and re-fold. No inverse-patch machinery needed. |
| **Replayable pick history** | The draft recap ("show me how round 4 went") is the log, rendered. Free UI feature. |
| **Correct JSON export** | `JSON.stringify(doc)` is complete and correct by construction. There is no "did I remember to serialize that field?" bug class, because the only fields are log entries and config. |
| **Sync-readiness** | A serializable ordered intent stream is exactly what a sync layer transports. See Pattern 2. |
| **Debuggability** | A bug report is a JSON file that reproduces the exact state. Enormous for a hobby project with no error tracking. |

**Trade-offs (honest):** you cannot casually poke at state to fix something — every change must be expressible as an action, which is friction during early development. You must resist storing derived data. And you must record externally-derived results into the log rather than re-deriving them on replay (Pattern 5), which is a real discipline cost and the single most likely place to get this wrong.

**Rejected alternative — direct mutable state:** simpler on day one, but undo requires either bolting on a history stack of full state snapshots or introducing Immer inverse patches ([Immer patches docs](https://immerjs.github.io/immer/patches/)), export requires hand-maintained serialization, and cross-device sync becomes a rewrite rather than an integration — which directly violates a stated Key Decision in PROJECT.md.

**Rejected alternative — Immer patches for undo:** a legitimate pattern, but it solves only undo. At ~500 actions the naive re-fold is fast enough that patches are pure added machinery. Skip them.

```js
// The whole state architecture, essentially.
// core/reduce.js — PURE
export function apply(state, action) {
  switch (action.type) {
    case 'draft/pickMade':      return applyPick(state, action);
    case 'order/cardPlayed':    return applyCard(state, action);
    case 'swap/spent':          return applySwap(state, action);
    // ...
    default:                    return state;
  }
}
export function canApply(state, action) { /* → {ok:true} | {ok:false, reason} */ }

// store.js — the ONE impure orchestration point
function dispatch(intent) {
  const action = { ...intent, seq: doc.log.length, at: clock.now(), actorId: 'host' };
  const check = canApply(state, action);
  if (!check.ok) return check;
  doc.log.push(action);              // append-only, never mutate or delete
  state = apply(state, action);      // incremental; equals re-folding the whole log
  notify(); scheduleSave();
  return { ok: true };
}

function undo() {
  doc.log.pop();                                              // or push a compensating action
  state = doc.log.reduce(apply, initialState(doc.config));    // ~500 iterations. instant.
  notify(); scheduleSave();
}
```

> **Undo policy note:** popping the log is simplest and correct for local single-writer use. If sync is ever added, switch to *compensating actions* (`draft/pickUndone`) so the log stays strictly append-only across replicas. Design the reducer so both work: make `pickUndone` a real action type from day one, and use log-popping only as an internal optimization for the local-only case.

---

### Pattern 2: Pure Core / Impure Shell with Injected Ambients

**What:** State transitions are pure functions of `(state, action)`. Every value that varies between runs — time, randomness, ids, roster contents — is captured *at the edge* and written *into the action* before the reducer sees it.

This is the exact discipline Redux mandates in its Priority A rules — "Reducers Must Not Have Side Effects" (no async, no `Date.now()`, no `Math.random()`) and "Do Not Put Non-Serializable Values in State or Actions" (no Promises, Symbols, Maps/Sets, functions, class instances) — precisely because time-travel and persistence depend on it ([Redux Style Guide](https://redux.js.org/style-guide/)). boardgame.io, the reference implementation for turn-based game state, makes the same call: "each move is a reducer, and thus must be pure," with `Math.random()` explicitly forbidden in favor of a seed carried in game context so that games "can be replayed exactly" ([boardgame.io random docs](https://github.com/boardgameio/boardgame.io/blob/main/docs/documentation/random.md)).

**Trade-offs:** slightly more ceremony per action (you stamp fields you don't yet use). In exchange, every test in `core/` runs with zero mocks, and the sync layer is additive.

```js
// ❌ WRONG — reducer reaches for ambient state
function applyPick(state, action) {
  return { ...state, picks: [...state.picks, { ...action, at: Date.now() }] };
}

// ✅ RIGHT — the edge supplies it; the reducer only reads the action
// store.dispatch stamped `at` already.
function applyPick(state, action) {
  return { ...state, picks: [...state.picks, { monId: action.monId, at: action.at }] };
}

// ✅ RIGHT — randomness is state, advanced deterministically
// core/rng.js
export function nextInt(seed, cursor, max) {
  let t = (seed + cursor * 0x6D2B79F5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) % max, cursor: cursor + 1 };
}
// state.rng = { seed: 1723... , cursor: 17 }  ← seed set once at tournament creation,
// from the impure edge, stored in the document. Same seed + same log = identical state.
```

---

### Pattern 3: Rules → Round Schedule Compiler with Serializable Predicates

**What:** Before the draft begins, a declarative `RuleSet` compiles into a `RoundSchedule` — an ordered list of round specs, each carrying a *pool filter*. The schedule is stored in the document as data. **From that moment the draft engine reads only the schedule, never the rules.** Invalid teams become unrepresentable because a player physically cannot pick a non-Mega during a Mega round; the pool for that round does not contain one.

This is "make illegal states unrepresentable" ([DevIQ](https://deviq.com/principles/make-illegal-states-unrepresentable/)) applied not to types but to the *choice space*: rather than validating after the fact, the set of offerable options is constructed so every reachable outcome is legal.

**The critical serializability rule:** predicates in the schedule must be **descriptors, not functions**, because the schedule lives in state and state must be JSON. A pure interpreter turns descriptors into decisions.

```js
// core/rules/predicates.js — descriptor language (serializable) + evaluator (pure)
// Descriptor examples:
//   { op: 'mega' }
//   { op: 'not', arg: { op: 'mega' } }
//   { op: 'type', value: 'Fire' }
//   { op: 'bstAtMost', value: 500 }
//   { op: 'and', args: [ {op:'mega'}, {op:'not', arg:{op:'idIn', ids:[...megaBans]}} ] }
export function test(desc, mon) {
  switch (desc.op) {
    case 'any':        return true;
    case 'mega':       return mon.megaCapable;
    case 'type':       return mon.types.includes(desc.value);
    case 'gen':        return mon.gen === desc.value;
    case 'bstAtMost':  return mon.bst <= desc.value;
    case 'bstAtLeast': return mon.bst >= desc.value;
    case 'tierIn':     return desc.values.includes(mon.tier);
    case 'idIn':       return desc.ids.includes(mon.id);
    case 'not':        return !test(desc.arg, mon);
    case 'and':        return desc.args.every(d => test(d, mon));
    case 'or':         return desc.args.some(d => test(d, mon));
  }
}

// core/rules/compile.js
// RuleSet -> RoundSchedule | Infeasible
// {
//   totalRounds: 6,
//   requirements: [ { kind:'atLeast', n:2, of:{op:'mega'}, label:'Mega' } ],
//   megaBans: ['rayquaza', ...],
// }
//   ↓ compiles to ↓
// {
//   rounds: [
//     { index:0, kind:'draft', slotType:'mega',  label:'Mega Round 1', filter:{op:'and',args:[{op:'mega'},{op:'not',arg:{op:'idIn',ids:megaBans}}]} },
//     { index:1, kind:'draft', slotType:'mega',  label:'Mega Round 2', filter:{ ...same... } },
//     { index:2, kind:'draft', slotType:'open',  label:'Round 3',      filter:{op:'any'} },
//     { index:3, kind:'draft', slotType:'open',  label:'Round 4',      filter:{op:'any'} },
//     { index:4, kind:'draft', slotType:'open',  label:'Round 5',      filter:{op:'any'} },
//     { index:5, kind:'draft', slotType:'open',  label:'Round 6',      filter:{op:'any'} },
//   ],
//   warnings: []
// }
```

**When to use:** whenever a composition requirement is a *count of picks satisfying a per-Pokémon predicate*. That covers every rule PROJECT.md actually names.

**Trade-offs:** the compiled schedule is a snapshot; if the host edits rules after the draft starts, you must either recompile (destroying in-flight picks) or refuse. Refuse. Also, an "exactly N" requirement compiles into *both* N filtered rounds *and* `6−N` anti-filtered rounds, which is stricter than most hosts intend — surface "at least N" vs "exactly N" explicitly in the config UI.

---

### Pattern 4: Typed Team Slots (the consequence of Pattern 3 that is easy to miss)

**What:** A round doesn't just order picks — it *types the resulting roster slot*. A pick made during Mega Round 1 fills a `mega`-typed slot. Store the slot type on the pick.

**Why this is load-bearing:** without it, **swaps silently destroy the compiler's guarantee.** If a player drops their Mega Charizard in a post-draft swap round and takes a leftover Skarmory, the "2 Megas required" rule is now violated — and no validation exists to catch it, because the whole design premise was that validation isn't needed.

**The fix is structural, not a check:** a swap replaces a *slot*, and the replacement candidate pool is filtered by that slot's own filter. The leftovers list shown during a swap of a `mega` slot contains only Mega-capable leftovers. Invalid post-swap teams stay unrepresentable, using the same mechanism.

```js
// team = ordered array of slots, one per round, typed by that round's spec
// [ { slotType:'mega', filter:{...}, monId:'charizard',  source:'round0' },
//   { slotType:'mega', filter:{...}, monId:'gardevoir',  source:'round1' },
//   { slotType:'open', filter:{op:'any'}, monId:'skarmory', source:'swap:3' }, ... ]

// core/draft/swaps.js
export function swapCandidates(state, playerId, slotIndex) {
  const slot = selectTeam(state, playerId)[slotIndex];
  return selectLeftovers(state).filter(mon => test(slot.filter, mon));  // same evaluator
}
```

Mid-draft swap currency works identically: a mid-draft swap targets an already-filled slot and must respect that slot's filter.

---

### Pattern 5: Materialize External Results Into the Log

**What:** Any action whose outcome depends on data outside the document must record its *result*, not just its *intent*.

**Why:** the pool is derived from the roster snapshot. Roster snapshots change (Champions regulations rotate roughly every 2.5 months — M-A ran 8 Apr–17 Jun 2026, M-B from 17 Jun). If the log records only `pool/build {seed, size}` and re-derives the pool on replay, then reopening a March tournament in September produces a *different pool* and the entire log stops making sense. This is Fowler's documented event-sourcing hazard — "replaying events becomes problematic when results depend on interactions with outside systems" — in its most concrete local form.

**The rule:** `pool/built` carries the actual `ids[]` plus `rosterVersion` and `checksum`. Replay reads the ids from the log; the roster is used only for display metadata. Additionally, the document should embed a minimal frozen copy of the display data (name, types, BST, sprite index, megaCapable) for every Pokémon it references, so a completed tournament renders correctly forever, offline, against any roster version.

Apply the same rule to: ban resolution, bracket seeding (record the seeded bracket, not just "seed randomly"), and any shuffle.

---

### Pattern 6: Commit-Then-Reveal for Hidden Information

**What:** Blind bans are simultaneous secret actions. Model them as two distinct action types even though hot-seat has no adversarial network: `bans/committed { playerId, ids }` (payload present but UI-hidden) followed by `bans/revealed { round }`.

**Why two actions instead of one:** it creates the *seam* where a future sync layer redacts payloads. boardgame.io provides exactly this affordance in its move definitions — a `redact` flag that hides move arguments from other clients' logs, plus a server-authoritative view. Modeling reveal as its own action now means adding redaction later touches the transport, not the reducer.

Simultaneous action selection needs a "secret yet binding" commitment so that players cannot revise after seeing others' choices ([Wikipedia: Simultaneous action selection](https://en.wikipedia.org/wiki/Simultaneous_action_selection)). In hot-seat the binding is social plus a UI privacy flow (pass-the-device, blur-on-blur, hide-input); the log's job is to make the commit point explicit and irreversible.

Priority-card plays are the same shape (all players play a card, then order resolves) and should reuse the same commit/reveal machinery. **Build it once, use it for both.** This is a strong argument for building the priority-card system and the blind-ban system with a shared `commitReveal` sub-module rather than as two independent features.

---

## Sync-Readiness: Concrete Structural Rules

These are the day-one, non-negotiable rules. Every one is cheap now and expensive to retrofit. This is the entire content of the "keep it sync-ready" Key Decision.

**State shape**

1. **Root state is a single JSON-serializable object.** No `Date`, `Map`, `Set`, class instances, functions, or `undefined`-as-meaningful. Timestamps are epoch integers. This is Redux Priority A rule "Do Not Put Non-Serializable Values in State or Actions."
2. **Every entity is keyed by a stable string id.** Players, Pokémon, matches, slots, log entries. Never use an array index as identity for anything reorderable.
3. **Derived data is never stored.** Available pool, teams, current pick order, standings, bracket state are all selectors. Derived data in state is the single biggest amplifier of merge conflicts, and it also creates the "stale duplicate" bug class locally.
4. **`schemaVersion` at the root, with a `migrate(doc)` function.** Required for JSON import of older files; also the thing that makes action-schema evolution survivable.
5. **Predicates, filters, and any "logic" stored in state are descriptors, not functions** (Pattern 3). Functions are not serializable and are not transportable.

**Actions**

6. **Actions are plain JSON `{ type, ...payload }` and self-contained.** Reference entities by id only, never by object reference.
7. **Actions are events, not setters.** `draft/pickMade { playerId, monId }`, not `state/setTeams { ... }`. Redux's "Model Actions as Events, Not Setters" rule exists for exactly this reason: setter-shaped actions make the log meaningless and make rebasing impossible.
8. **Every action carries `seq` (monotonic integer), `at` (epoch ms), and `actorId`.** Ordering must be explicit and total, not implied by array position. `actorId` is `'host'` today and a device/player id under sync. Adding these fields later means migrating every saved tournament.
9. **Ids are generated at the edge and passed in on the action.** Never `crypto.randomUUID()` inside a reducer. Prefer deterministic ids where possible (`${actorId}:${seq}`) so replays are byte-identical.
10. **Ambient inputs are stamped onto the action at dispatch time** — never read inside `apply`.

**Transitions**

11. **`apply(state, action)` is total and pure.** No throws for expected failures; unknown action types return `state` unchanged (forward compatibility with newer clients).
12. **Validation lives in a separate `canApply(state, action) → Ok | Rejected(reason)`.** A sync layer must be able to re-validate an action after reordering without executing it. Two functions, not one.
13. **All randomness comes from `state.rng = { seed, cursor }`** advanced by a pure PRNG. The seed is generated once at the impure edge on tournament creation and persisted. Given the same seed and log, state is identical everywhere.
14. **Deterministic iteration order everywhere.** Never iterate `Object.keys()` for anything order-sensitive; sort explicitly by id. Object key order is stable in practice in JS but is a foot-gun across serialization round-trips and implementations.
15. **The log is append-only; corrections are compensating actions.** Log-popping is permitted as a local-only optimization but the compensating action type must exist and be handled from day one.
16. **Hidden-information reveals are their own action** (Pattern 6), giving redaction a seam.
17. **Externally-derived results are materialized into the log** (Pattern 5).

**Structure**

18. **`core/` imports nothing from `adapters/`, `ui/`, or the network.** Enforce with a CI grep. This is the rule that makes 1–17 stay true under pressure.
19. **`dispatch` is the only write path.** No component mutates the document. When sync arrives, `dispatch` gains a `broadcast(action)` call and a sibling `receive(remoteAction)` — and nothing else in the codebase changes. **That is the definition of "integration, not rewrite," made concrete.**

**What is deliberately NOT required now:** vector clocks, CRDTs, operational transform, conflict resolution policy, per-player authority. Those are sync-layer concerns. Rules 1–19 are what make it possible to *choose* one later without touching game logic. A single-writer-per-turn turn-based game with a total order over intents is the easiest possible sync problem; do not pre-solve it.

---

## The Rules Compiler: Scope and Limits

*(This section is reasoned analysis — MEDIUM confidence. No prior art was found for this exact pattern in draft tooling; general draft apps surveyed use post-hoc validation or simple per-category limits.)*

### The Compilable Class

A rule compiles to a round schedule if and only if it is a **count of picks satisfying a predicate over a single Pokémon** — a unary count constraint. The predicate must be evaluable against one Pokémon in isolation, with no reference to the rest of the team, other players, or draft history.

| Rule form | Compiles? | Compilation |
|---|---|---|
| "At least N where P" — *2 Megas, 1 Water type, 1 Gen-1* | **YES** | N rounds with `filter = P` |
| "At most K where P" — *max 2 above 550 BST* | **YES (via complement)** | `6−K` rounds with `filter = not P` |
| "Exactly N where P" | **YES** | N rounds `filter = P` **and** `6−N` rounds `filter = not P` |
| "At least N from set S" — *2 from {Fire, Water, Grass}* | **YES** | N rounds with `filter = or(S)` |
| "At least N from tier T or below" | **YES** | N rounds with `filter = tierIn([...])` |
| "N from generation G" | **YES** | N rounds with `filter = gen(G)` |
| Placement rules — *"Megas must be picked in rounds 1–3"* | **YES** | Ordering of the compiled rounds; trivial |
| Combined independent quotas — *2 Mega + 1 Water, disjoint sets* | **YES** | 2 Mega rounds + 1 Water round + 3 open |

The generalized compiler is: collect requirements → convert caps to complements → assign each required count to a distinct round index → verify `Σ required ≤ totalRounds` → fill remainder with `{op:'any'}` (or the conjunction of active complements) → run feasibility.

### Where It Breaks Down

**1. Overlapping predicates → sound but incomplete.**
"At least 1 Fire and at least 1 Flying." Charizard satisfies both. A schedule of one Fire round + one Flying round forces two picks where one legal team needs only one. The schedule never produces an *invalid* team, but it rejects some *valid* ones. **Detection:** at compile time, check whether required predicates intersect in the post-ban roster; if they do, emit a warning explaining the over-constraint and let the host accept it or merge the requirements. This is the most likely rule interaction to actually bite, because typing requirements naturally overlap.

**2. Aggregate/budget constraints → do not compile at all.**
"Total team BST ≤ 3000." "Tier points budget of 100" — the standard Pokémon draft-league format. The legal set in round *k* depends on what was spent in rounds 1..*k−1*, so no static per-round filter can express it. Requires a genuinely different mechanism (below).

**3. Intra-team relational constraints → do not compile.**
"No two Pokémon sharing a type." "Species Clause across formes" (Champions enforces *"a player's team cannot contain two Pokémon of the same species, that is, with the same National Pokédex number"* — which matters because alternate formes share a `num`). The predicate needs the player's current team as input.

**4. Conditional/triggered requirements → do not compile.**
"If you draft a weather setter, you must draft an abuser." The requirement doesn't exist until a pick creates it. Compiling would require rewriting the schedule mid-draft, which reopens the very hole the pattern closes.

**5. Cross-player / league-wide constraints → do not compile.**
"No more than 2 Dragon types across the whole tournament." "Every type must appear on some team." These are pool-level constraints, not round-level. The first is *partly* expressible by removing candidates from the shared pool once a global cap is hit — a **pool invalidation hook**, a third mechanism. The second is a global satisfaction constraint that needs lookahead across all players and is genuinely out of reach.

**6. Feasibility is not automatic — it must be checked.**
The compiler can happily emit an impossible schedule. Concrete failure modes, all real at this project's scale:
- `Σ required rounds > totalRounds` (host asks for 2 Megas + 2 Waters + 3 Gen-1 in six rounds)
- Filtered sub-pool smaller than the player count for that round (8 players × 2 Mega rounds = 16 Mega picks needed; ~73 Mega-capable base species are legal in Reg M-B, minus the host's Mega-ban list — fine at 8, tight at 32)
- Complement rounds emptied by a cap (`exactly 0` of something that covers most of the roster)
- Total picks exceeding the legal roster (see Scaling below)

`feasibility.js` must run at config time against the post-ban roster and player count, and return actionable errors ("2 Mega rounds × 8 players needs 16 Mega-capable Pokémon; 11 remain after your Mega-ban list"). PROJECT.md's constraint — *"warn when pool math or rules become unsatisfiable rather than hard-capping"* — is implemented here and nowhere else.

### The Escape Hatch (design it, do not build it yet)

For rule classes 2–5, the required mechanism is a **per-player dynamic pool mask**:

```js
// The explicitly-different second mechanism. NOT part of v1.
// pickGuard(state, playerId, candidateMon) -> { ok } | { ok:false, reason }
```

This reintroduces everything the round schedule was designed to eliminate: greyed-out picks, mid-draft validation, and — worst — the **dead-end problem**, where a locally legal pick makes round 6 unsatisfiable. Solving that properly requires feasibility lookahead at every pick (a small constraint-satisfaction search), which is a categorically larger piece of engineering than the compiler.

**Recommendation: do not build pick guards in v1.** The only composition rule PROJECT.md names is the Mega requirement, which compiles cleanly. Reserve `pickGuard` as a named, documented extension point in `core/draft/picks.js` so the seam exists, and explicitly scope budget/points-based draft formats out of the first milestone. If they are later wanted, they are a *phase*, not a tweak — and that should be visible in the roadmap.

### One More Compiler Consumer: Pool Construction

The compiler runs *before* pool construction, because the pool must be stratified to guarantee each round's sub-pool is large enough. Pool sizing is not just `players × 6 + leftovers`; it is:

```
for each distinct round filter F in the schedule:
    ensure pool contains ≥ (players × roundsUsing(F)) + leftoverMargin  entries matching F
```

A naive random sample of 120 Pokémon can easily contain 9 Megas when 16 are needed. **Pool construction is a stratified seeded sample driven by the schedule.** This dependency (compiler → pool builder) determines build order.

---

## Data Flow

### Draft Flow (the primary pipeline)

```
  [ Host config screen ]
        │  players, names, format label, depth, ban mode, rule set, pool size override
        ▼
  config/created ─────────────────────────────► seed generated at edge, stored in doc
        │
        ▼
  ┌──────────────────┐   roster.<reg>.json (committed snapshot, pinned by checksum)
  │  RosterView      │◄──────────────────────────────────────────────────────────────
  │  regulation      │
  │  filtered        │
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐   host mode: bans/hostListSet
  │   BAN PHASE      │   blind:     bans/committed ×N  →  bans/revealed
  │                  │   snake:     bans/turnTaken ×N (visible)
  └────────┬─────────┘
           │  effectiveRoster = RosterView − bans
           ▼
  ┌──────────────────────────────────────────────┐
  │  COMPILE  compileSchedule(ruleSet,            │  ← runs BEFORE pool build
  │           effectiveRoster, playerCount)       │     because pool must be
  │  → RoundSchedule | Infeasible(+warnings)      │     stratified per round filter
  │  → host may hand-edit → schedule/overridden   │
  └────────┬─────────────────────────────────────┘
           │
           ▼
  ┌──────────────────────────────────────────────┐
  │  POOL BUILD  stratified seeded sample         │
  │  emits pool/built { ids[], rosterVersion,     │  ← MATERIALIZED into the log
  │                     checksum, seed }          │     (Pattern 5)
  └────────┬─────────────────────────────────────┘
           │
           ▼
  ╔══════════════ DRAFT ROUNDS (repeat per round in schedule) ═══════════╗
  ║   order/cardCommitted ×N   (each player plays a priority card)       ║
  ║        ▼                                                              ║
  ║   order/revealed           → pickOrder resolved (lowest first;        ║
  ║                              seeded RNG only for ties)                ║
  ║        ▼                                                              ║
  ║   draft/pickMade ×N        → mon leaves pool, fills a TYPED SLOT      ║
  ║                              carrying that round's filter             ║
  ║        ▼                                                              ║
  ║   [ optional ] swap/spent  → mid-draft currency; targets a filled     ║
  ║                              slot; candidates filtered by slot.filter ║
  ╚═══════════════════════════════════════════════════════════════════════╝
           │
           ▼
  [ optional ] SWAP ROUNDS   swap/roundPick | swap/passed   (in pick order,
           │                 slot-filter-preserving, leftovers only)
           ▼
  ┌──────────────────┐
  │  COMPLETED TEAMS │  selector: teams(state) → per player, 6 typed slots
  └────────┬─────────┘
           │
           ├──► export-paste.js → species-only text → clipboard → pokebase / Showdown
           └──► file-io.js      → full document JSON → download
```

### Tournament Flow (independent, gated on host-selected depth)

```
  COMPLETED TEAMS
        │
        ▼
  bracket/seeded { pairings[], byes[], seed }   ← MATERIALIZED, not re-derived
        │                                          (byes for non-power-of-two counts)
        │
        ├──► ROUND ROBIN: schedule/generated → match/recorded ×N
        │                                            │
        │                                            ▼
        │                                     selector: standings(state)
        │
        └──► SINGLE ELIM: match/recorded (winner, optional Bo3 game log)
                                 │
                                 ▼
                          selector: bracketState(state)
                          → advancement computed, never stored
```

**Cross-cutting flows:**

- **Persistence:** every `dispatch` → debounced (~300–500 ms) `persistence.save(doc)` → `localStorage`. On load: `persistence.load()` → `migrate()` → `log.reduce(apply, initialState(config))`.
- **Undo:** UI → `store.undo()` → truncate/compensate → re-fold → notify. Available from the first phase at no extra cost.
- **Reads:** UI never reads `state` fields directly for anything derived. UI → `selectors.*(state)` → render.

---

## Build Order

### The Walking Skeleton

A walking skeleton is "an implementation of the thinnest possible slice of real functionality that we can automatically build, deploy, and test end-to-end" — it links together all the main architectural components so work on the first real feature can begin ([Cockburn, via multiple summaries](https://www.mattblodgett.com/2020/09/start-with-walking-skeleton.html)). It includes deployment, because the delivery pipeline is part of what's being proven.

**The thinnest end-to-end slice for this project:**

> A deployed GitHub Pages URL where **2 hardcoded players**, using a **committed roster snapshot** and **no bans, no priority cards, no composition rules**, alternate picks for **6 rounds**, see their teams, and **copy a species-only paste**. State runs through the **log + reducer + selectors** architecture, **autosaves to localStorage**, survives refresh, and **undo works**.

This is small — an evening or two — and it proves every risky assumption at once:

| Assumption proven | How |
|---|---|
| Zero-build static delivery works | The URL loads and plays with no npm, no server |
| Roster snapshot pipeline is real | The generator script ran, produced committed JSON, app consumes it |
| Offline works | Reload with network disabled |
| Log-and-fold state architecture is livable | Picks, undo, autosave, refresh-survival all through it |
| The export target is correct | Actually paste into Showdown/pokebase and see it import |
| Sync-readiness rules are followed | Established before there's code to retrofit |

Do **not** build the roster generator, the store, the UI, and the export as separate horizontal phases. They are one vertical slice.

### Phase Sequence

| # | Phase | Delivers | Why here | Research risk |
|---|---|---|---|---|
| **1** | **Walking skeleton** | Deployed URL; roster script + committed snapshot; store/reducer/selectors; 2-player linear 6-round draft; species paste export; autosave; undo | Proves delivery, data, and state architecture in one slice. Everything later plugs into it. | Export format verification (pokebase import format is unconfirmed in PROJECT.md — **verify in Phase 1, it is cheap and it could invalidate an assumption**) |
| **2** | **Real draft** | Host config (N players + names), pool sizing + host override, pool browser with sprites/typing/BST and density toggle, priority-card commit/reveal, pick order resolution | The playable product. After this the tool replaces the spreadsheet for a rules-light draft. Priority cards force the commit/reveal sub-module that blind bans will reuse. | Low |
| **3** | **Rules compiler** | `RuleSet` config, `compileSchedule`, predicate descriptors, Mega rounds, Mega-ban list, host banlist (simplest ban mode, needed to feed the compiler), manual schedule override, feasibility warnings, **typed slots** | The load-bearing architectural risk. Do it early, while there is little to rewrite. Introduces typed slots, which Phase 4 depends on. Bundling the *host* ban mode here is deliberate: it is a list of ids, it unlocks the Mega-ban list, and it completes the bans→compile→pool flow with minimal UI. | **HIGH — flag for phase research.** Compilation correctness, overlap warnings, and feasibility analysis are where subtle bugs live. |
| **4** | **Swaps** | Swap budget, mid-draft swap currency, optional post-draft swap rounds, leftovers view, slot-filter-preserving replacement | Depends on typed slots from Phase 3. Building swaps before the compiler would produce a swap system that silently violates composition rules. | Medium |
| **5** | **Ban modes** | Blind (with a real hot-seat privacy flow) and snake bans | Reuses Phase 2's commit/reveal. Deferred because host-banlist mode already unblocks the pipeline, and blind-ban UX is a genuine design problem (PROJECT.md flags it) that deserves its own attention rather than being rushed inside a bigger phase. | **Medium — UX research flag** for the pass-the-device / hide-input pattern |
| **6** | **Tournament depth** | Depth selector, round-robin + standings, single elim + byes, Bo3 config, match recording | Entirely additive; consumes completed teams and nothing else. Genuinely separable, which is why it comes after the draft is complete. | Low (bracket-with-byes seeding is well-trodden) |
| **7** | **Portability & archive** | JSON export/import with migration, completed-tournament list, draft recap from the log | The log makes recap nearly free; export/import needs `schemaVersion` + `migrate` to be worth shipping | Low |
| **8** | **Roster refresh** | In-app refresh path, regulation selector, snapshot precedence, CI job to auto-PR snapshot updates | Deferred deliberately: the committed snapshot already satisfies the offline requirement. Refresh is convenience, and its value only appears at the next regulation rotation. | Medium (see pipeline below) |
| **9** | **Polish** | Display density, keyboard flow, responsive layout, empty/error states, spritesheet integration | Last, as always | Low |

**Ordering rationale in one line each:**
- Phase 3 before Phase 4 because typed slots are a prerequisite, not a nicety.
- Phase 3 before Phase 5 because host-banlist mode is enough to close the data-flow loop, and the compiler is the higher architectural risk.
- Phase 6 last among features because it is the only fully additive subsystem — if the project stalls, a working drafter with no brackets is still valuable; brackets with no drafter are worthless.
- Phase 8 after everything because the snapshot already works and refresh is the one piece that can be deferred indefinitely without breaking the success criterion.

**Success-criterion checkpoint:** "run one full tournament end to end without touching a spreadsheet" is met at the end of **Phase 6** for a full tournament, and at the end of **Phase 3** for a rules-correct draft-only night. Both are worth shipping.

---

## Roster Snapshot Pipeline

### The Boundary

**Build time owns parsing and legality derivation. Runtime owns only bytes and display.** The transform between them is one pure function used by both sides.

```
╔═══════════════ BUILD TIME (Node, maintainer, output committed) ═══════════╗
║                                                                            ║
║  raw.githubusercontent.com/smogon/pokemon-showdown/master/                 ║
║    data/mods/champions/formats-data.ts        (74 KB, current regulation)  ║
║    data/mods/championsregma/formats-data.ts   (75 KB, prior regulation)    ║
║  play.pokemonshowdown.com/data/pokedex.json   (524 KB, all species)        ║
║                        │                                                   ║
║                        ▼                                                   ║
║        core/roster/transform.js   ◄── PURE. no fs, no fetch.               ║
║          • legal ⟺ !isNonstandard && tier !== 'Illegal'                    ║
║          • join formats-data ⋈ pokedex on species id                       ║
║          • derive megaCapable: base species has ≥1 legal forme             ║
║            whose `forme` contains 'Mega' (requiredItem = the stone)        ║
║          • project to minimal record, drop learnsets/moves/abilities       ║
║                        │                                                   ║
║                        ▼                                                   ║
║        data/roster.<reg>.json   { schemaVersion, regulation,               ║
║                                   generatedAt, sourceCommit, checksum,     ║
║                                   entries: [...] }        ~60–120 KB       ║
║        data/pokemonicons-sheet.png                        392 KB, one file ║
║                        │  git commit                                       ║
╚════════════════════════│═══════════════════════════════════════════════════╝
                         ▼
╔═══════════════ RUNTIME (browser) ═════════════════════════════════════════╗
║  adapters/roster-source.js — resolution precedence:                        ║
║    1. roster embedded in an imported tournament document  (highest)        ║
║    2. refreshed snapshot cached in localStorage                            ║
║    3. committed data/roster.<reg>.json                    (always present) ║
║                        │                                                   ║
║                        ▼   core/roster/view.js → RosterView                ║
║                                                                            ║
║  OPTIONAL REFRESH (Phase 8), two tiers:                                    ║
║   A. fetch the repo's own newer snapshot JSON     ← recommended default    ║
║      (parsing already done at build time; refresh = "get the newest        ║
║       committed snapshot without re-cloning")                              ║
║   B. fetch upstream raw files and run the SAME transform in the browser    ║
║      ← works only because the transform is pure and Node-free              ║
╚════════════════════════════════════════════════════════════════════════════╝
```

### Verified Facts (HIGH confidence — checked directly, 2026-08-03)

- **Showdown ships Champions-specific legality data.** `data/mods/champions/` and `data/mods/championsregma/` exist in `smogon/pokemon-showdown`. The `champions` mod contains `formats-data.ts`, `rulesets.ts`, `scripts.ts`, `items.ts`, `learnsets.ts`, `moves.ts`, `abilities.ts`. The `championsregma` mod is the frozen prior regulation. **Regulation versioning already exists upstream** — the snapshot schema should mirror it.
- **Legality is mechanically derivable.** Parsing `champions/formats-data.ts` and filtering to entries without `isNonstandard` and with `tier !== 'Illegal'` yields **310 legal entries: 234 non-Mega and 73 distinct base species with a legal Mega forme.** That is consistent with community reporting of "208 Pokémon and 75 Mega Evolutions" (the delta is NFEs and alternate formes, which the app may want to filter further). **No scraping of wikis or images is required.**
- **Mega capability is derivable, not hand-curated.** In `pokedex.json`, `charizardmegax` has `baseSpecies: "Charizard"`, `forme: "Mega-X"`, `requiredItem: "Charizardite X"`. Cross-referencing against the champions mod's tier data gives per-regulation Mega legality directly. PROJECT.md's requirement "roster data records which Pokémon are Mega-capable" is satisfied by a join, not by manual data entry.
- **In-app refresh needs no proxy.** Both upstream endpoints send `Access-Control-Allow-Origin: *`:
  - `play.pokemonshowdown.com/data/pokedex.json` → `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET,POST,OPTIONS`
  - `raw.githubusercontent.com/...` → `Access-Control-Allow-Origin: *`, `Cross-Origin-Resource-Policy: cross-origin`
  This is the fact that makes Tier-B refresh feasible from a static site with zero backend. It also means the "no server" constraint survives the refresh feature intact.
- **Offline sprites are one committed file.** `play.pokemonshowdown.com/sprites/pokemonicons-sheet.png` is a **392 KB** single spritesheet used with CSS `background-position`. Committing it makes the pool browser fully offline. Individual dex sprites (`/sprites/dex/<id>.png`, ~1–4 KB each) are an alternative but **remote images break the offline constraint** — a networkless draft would show broken images throughout the pool browser, which is the app's main screen. **Commit the sheet.**
- **Champions has real format rules worth encoding.** `champions/rulesets.ts` includes `Species Clause` ("cannot contain two Pokémon with the same National Pokédex number"), `Item Clause = 1`, `Min Team Size = 6` — and notably a `standarddraft` ruleset, meaning Showdown already contemplates Champions draft play. Species Clause is the concrete example of an intra-team relational rule that does **not** compile to a round schedule (though a shared draft pool makes cross-player duplication impossible anyway; the residual risk is alternate formes sharing a `num`).

### Pipeline Design Rules

1. **The transform is pure and shared.** `core/roster/transform.js` takes strings/objects in and returns a snapshot. `scripts/build-roster.mjs` supplies bytes via `fetch`/`fs`; the browser refresh supplies bytes via `fetch`. This is the entire build-time/runtime boundary: *identical logic, different byte source.*
2. **Parse the `.ts` file at build time, not runtime, by default.** `formats-data.ts` is TypeScript source; parsing it is a regex-and-brace exercise that works but is brittle against upstream formatting changes. Keeping it in a script that a human runs and reviews before committing means an upstream reformat produces a failed build, not a broken live app.
3. **Snapshots are versioned and checksummed.** `{ schemaVersion, regulation, generatedAt, sourceCommit, checksum }`. Tournaments pin the checksum.
4. **Tournaments embed the display data for Pokémon they reference.** A completed tournament must render forever, offline, regardless of roster churn (Pattern 5). Six mons × N players ≈ trivial bytes.
5. **Refresh is an override with a visible provenance banner, never a silent replacement.** The host should always be able to see and revert to the committed snapshot.
6. **Automate the snapshot, don't automate the release.** A weekly GitHub Action that runs the script and opens a PR on diff keeps the roster current with a human in the loop — appropriate given regulations rotate on a ~2.5-month cadence, not daily.
7. **Store the refreshed snapshot separately from the tournament document.** Roster cache and tournament state have different lifecycles and different eviction tolerance.

---

## Scaling Considerations

Reinterpreting the template's user-count axis for what actually varies here: **player count, roster size, and log length.**

| Scale | What happens | Adjustment needed |
|---|---|---|
| **4–8 players** (design target) | 24–48 picks, pool ~60–120 of ~208 draftable. Log ~350–500 actions. Full re-fold is sub-millisecond. localStorage document well under 1 MB. | None. Everything naive works. |
| **12–16 players** | 72–96 picks. Pool ~110–150. **2 Mega rounds × 16 players = 32 Mega picks needed against ~73 legal Mega-capable species minus the host's Mega-ban list.** Still fine, but the margin is now visible. | Feasibility warnings become genuinely useful, not decorative. Pool browser needs virtualization or pagination if rendering 150 cards with sprites is janky. |
| **24–32 players** | 144–192 picks against ~208 draftable species. **The roster itself is the ceiling: 34 players × 6 = 204 picks exhausts the legal roster with zero leftovers, so swaps become impossible before the player count breaks anything else.** 2 Mega rounds × 32 = 64 Mega picks against ~73 legal — nearly exhausted. | The feasibility checker must produce precise, numeric errors here. This is the regime PROJECT.md's "warn rather than hard-cap" constraint was written for. |
| **>34 players** | Mathematically impossible in a 6-round draft on a single-elimination-sized roster. | Refuse at config time with the arithmetic shown. |

### What Breaks First

1. **Composition-rule feasibility, well before pool exhaustion.** Mega-capable species (~73) are the scarcest stratum. With a generous Mega-ban list, an 8-player, 2-Mega-round tournament can already fail. **This is the first real failure mode and it is a correctness bug, not a performance one** — build `feasibility.js` properly in Phase 3.
2. **Pool browser rendering.** 150+ Pokémon cards with sprites and stats. Fix with the committed spritesheet (CSS `background-position` — no per-image requests) plus simple windowing. Not an architectural change.
3. **localStorage size**, only if roster data is inlined into every saved tournament. localStorage is capped at ~5 MB of UTF-16 string data and throws `QuotaExceededError` past it ([MDN storage quotas](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)). Keep tournaments to ids + a minimal embedded display subset (Pattern 5, rule 4) and a document stays in the tens of KB — dozens of archived tournaments fit comfortably. If archiving ever gets large, move to IndexedDB; localStorage is the right call for small synchronous key-value state under 5 MB and is actually faster for it.
4. **Full re-fold on undo**, at maybe 50,000+ actions. Not reachable in this domain. Ignore it.

---

## Anti-Patterns

### Anti-Pattern 1: Validating Composition After Picks

**What people do:** let players pick anything, then check "do you have 2 Megas?" at the end — or grey out picks that would make the requirement unsatisfiable.
**Why it's wrong:** greying out requires feasibility lookahead to be correct (a pick that looks fine now can make round 6 impossible), and end-of-draft validation means telling someone their draft is invalid after they've made six decisions. Both are strictly harder than the compiler *and* produce worse UX.
**Instead:** compile requirements into round filters. The invalid pick is not disabled — it is not present.

### Anti-Pattern 2: Storing Derived State

**What people do:** keep `state.availablePool`, `state.teams`, `state.standings`, `state.currentPickOrder` as fields, updated on every action.
**Why it's wrong:** every derived field is a place for state to disagree with itself, doubles the reducer's surface area, bloats the document, and is the number-one source of merge conflicts if sync ever arrives.
**Instead:** selectors. `availablePool(state)`, `teams(state)`, `standings(state)`. Memoize outside the state tree if profiling ever demands it (it won't at this scale).

### Anti-Pattern 3: Re-Deriving External Data on Replay

**What people do:** log `pool/build { seed, size }` and recompute the pool from the current roster snapshot when loading.
**Why it's wrong:** the roster changes (Champions rotates regulations every ~2.5 months). A tournament saved under Reg M-A reopened under M-B silently produces a different pool, and every subsequent pick in the log becomes nonsense.
**Instead:** materialize results into the log (Pattern 5). `pool/built { ids[], rosterVersion, checksum }`. The same applies to bracket seeding and every shuffle.

### Anti-Pattern 4: Reaching for Ambient State Inside Reducers

**What people do:** `Date.now()` for timestamps, `Math.random()` for shuffles, `crypto.randomUUID()` for ids — all inside the transition function, because it's convenient.
**Why it's wrong:** it kills replay, undo, tests-without-mocks, and sync in one move. Redux names this a Priority A violation explicitly because "if a reducer has side effects, this would cause those effects to be executed during the debugging process." boardgame.io forbids `Math.random()` in moves for exactly the same reason.
**Instead:** stamp ambient values onto the action at dispatch; keep the PRNG seed and cursor in state.

### Anti-Pattern 5: Letting Swaps Bypass the Round Schedule

**What people do:** implement swaps as "drop any mon, take any leftover."
**Why it's wrong:** it silently destroys the compiler's guarantee. A player swaps away their only Mega and the composition rule is violated with nothing to catch it — because the architecture deliberately removed the checker.
**Instead:** typed slots (Pattern 4). A swap replaces a slot, and candidates are filtered by that slot's own filter.

### Anti-Pattern 6: Building Horizontal Layers

**What people do:** "Phase 1: data layer. Phase 2: state layer. Phase 3: UI. Phase 4: export."
**Why it's wrong:** nothing is playable until the last phase, every integration risk lands at the end, and the delivery model (GitHub Pages, offline, no build) goes unproven until it's expensive to change.
**Instead:** the walking skeleton is a razor-thin slice through *all* layers, deployed. Then thicken it.

### Anti-Pattern 7: Putting Functions or Class Instances in State

**What people do:** store compiled predicates as closures in the round schedule because it's ergonomic.
**Why it's wrong:** the schedule lives in the document. Functions do not survive `JSON.stringify`, so export, autosave, and reload all silently lose the rules — and the failure appears only after a refresh mid-draft, which is precisely the scenario persistence exists for.
**Instead:** serializable predicate descriptors + a pure evaluator (Pattern 3).

### Anti-Pattern 8: Adding Sync Machinery Now

**What people do:** reach for CRDTs, Yjs/Automerge, or a conflict-resolution scheme "because we want sync later."
**Why it's wrong:** it imports a large dependency and a whole conceptual model to solve a problem that does not exist yet, for a game that is single-writer and turn-based (the easiest possible sync case).
**Instead:** follow the 19 structural rules. They cost nothing and preserve every option.

---

## Integration Points

### External Services

| Service | Integration pattern | Notes / gotchas |
|---|---|---|
| `smogon/pokemon-showdown` (`data/mods/champions/formats-data.ts`) | Build-time `fetch` from `raw.githubusercontent.com` in a Node script | **Verified `Access-Control-Allow-Origin: *`.** TypeScript source — must be parsed, not `JSON.parse`d. Brittle to upstream reformatting; fail loudly in the script rather than silently at runtime. `championsregma` holds the prior regulation. |
| `play.pokemonshowdown.com/data/pokedex.json` | Build-time `fetch`; optionally runtime for Tier-B refresh | **Verified `Access-Control-Allow-Origin: *`.** 524 KB, all 1517 species — must be pruned to the Champions subset at build time. |
| `play.pokemonshowdown.com/sprites/pokemonicons-sheet.png` | **Download once, commit to repo.** CSS `background-position` per species. | 392 KB single file. Hotlinking breaks the offline constraint on the app's main screen. Verify the sheet's index mapping (Showdown's client computes offsets from species number/order) — needs a small lookup emitted by the build script. |
| `play.pokemonshowdown.com` teambuilder import | Clipboard text, user pastes | Species-only paste (one name per line) is well-established. **HIGH confidence.** |
| `pokebase.app` import | Clipboard text, user pastes | **Import format is UNVERIFIED** (PROJECT.md flags this). Verify in Phase 1 — a divergent format means two export adapters, which is a small change if the export layer is an adapter and a large one if it's inline in the UI. Keep `export-paste.js` per-target from the start. |
| GitHub Pages | Static hosting from repo | Serves over HTTPS, so service workers are available if offline-first caching is wanted later. Note the `file://` caveat above for local double-click use. |
| GitHub Actions (optional, Phase 8) | Scheduled job runs `build-roster.mjs`, opens PR on diff | Human in the loop; ~2.5-month regulation cadence doesn't justify auto-merge. |

### Internal Boundaries

| Boundary | Communication | Direction & notes |
|---|---|---|
| UI → Store | `dispatch(intent)` only | One-way. UI never mutates the document. |
| Store → UI | `subscribe(fn)` + selectors | UI reads only through `selectors.js`. |
| Store → Core | direct call to `apply` / `canApply` | Store stamps ambients first. |
| Store → Adapters | `clock.now()`, `id.next()`, `persistence.save()` | The only impure calls in the write path. |
| Core → anything above | **forbidden** | Enforce with CI grep for `Date.now|Math.random|localStorage|fetch|document\.` under `src/core/`. |
| `rules/compile` → `draft/*` | one-way, via the compiled `RoundSchedule` in state | The draft engine must never read `ruleSet`. Compile once; the schedule is truth. |
| `draft/swaps` → `rules/predicates` | shared `test(descriptor, mon)` evaluator | Same evaluator as pool filtering — this is what keeps swaps honest. |
| `tournament/*` → `draft/*` | reads completed teams via selectors only | Fully additive; can be built or skipped independently. |
| `roster/transform` → Node script **and** browser adapter | pure function, two callers | The build-time/runtime boundary lives here and nowhere else. |
| Future sync layer → Store | `broadcast(action)` on dispatch + `receive(remoteAction)` | The only file that changes. This is the sync-readiness claim, made falsifiable. |

---

## Sources

**Verified directly (HIGH confidence, checked 2026-08-03):**
- `smogon/pokemon-showdown` `data/mods/champions/` and `data/mods/championsregma/` contents, via GitHub Contents API
- `champions/formats-data.ts` parsed: 1361 entries, 310 legal, 234 non-Mega, 73 distinct base species with a legal Mega
- `champions/rulesets.ts` — Species Clause, Item Clause = 1, Min Team Size = 6, `standarddraft`
- `play.pokemonshowdown.com/data/pokedex.json` — 1517 species; Mega forme structure (`baseSpecies`, `forme`, `requiredItem`)
- CORS headers on `play.pokemonshowdown.com/data/*` and `raw.githubusercontent.com` — both `Access-Control-Allow-Origin: *`
- `play.pokemonshowdown.com/sprites/pokemonicons-sheet.png` — 392,317 bytes

**Official documentation (HIGH confidence):**
- [Redux Style Guide](https://redux.js.org/style-guide/) — Priority A rules: Do Not Mutate State; Reducers Must Not Have Side Effects; Do Not Put Non-Serializable Values in State or Actions. Priority B: Model Actions as Events, Not Setters
- [boardgame.io — Randomness](https://github.com/boardgameio/boardgame.io/blob/main/docs/documentation/random.md) — seeded PRNG in game context; moves are reducers and must be pure
- [boardgame.io — Game API](https://github.com/boardgameio/boardgame.io/blob/main/docs/documentation/api/Game.md) — phases, turn order, move metadata including `redact`
- [boardgame.io](https://github.com/boardgameio/boardgame.io) — state management and multiplayer networking for turn-based games, built on Redux
- [MDN — Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- [Immer — Patches](https://immerjs.github.io/immer/patches/) — `produceWithPatches`, inverse patches (evaluated and rejected as unnecessary here)

**Pattern references (MEDIUM confidence):**
- [Martin Fowler — Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html) — the canonical description and the external-dependency replay hazard
- [Azure Architecture Center — Event Sourcing pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing) — complexity trade-offs and when the pattern earns its keep
- [DevIQ — Make Illegal States Unrepresentable](https://deviq.com/principles/make-illegal-states-unrepresentable/)
- [Matt Blodgett — Start with a Walking Skeleton](https://www.mattblodgett.com/2020/09/start-with-walking-skeleton.html) (Cockburn's definition)
- [Wikipedia — Simultaneous action selection](https://en.wikipedia.org/wiki/Simultaneous_action_selection) — commit/reveal in simultaneous-move games
- [Eric Jinks — Undo/redo state with event sourcing](https://ericjinks.com/blog/2025/event-sourcing/)
- [Local-First Architecture: Bidirectional Sync](https://www.welcomedeveloper.com/posts/local-first-architecture-5-bidirectional-sync/) — "both client and server speak the same language: actions, not documents"

**Domain context (MEDIUM confidence — community sources):**
- [Victory Road — Champions Regulations](https://victoryroad.pro/champions-regulations/) — M-A (8 Apr–17 Jun 2026), M-B (17 Jun–2 Sep 2026), Species Clause, Item Clause, ~2.5-month rotation
- [Game8 — Regulation M-B roster](https://game8.co/games/Pokemon-Champions/archives/605482) — 208 species, 75 Mega Evolutions, no Legendaries/Mythicals

**Reasoned analysis, not sourced (MEDIUM confidence — flagged honestly):**
- The compilable/non-compilable rule taxonomy and the typed-slot consequence for swaps. No prior art was found for a rules-to-round-schedule compiler in draft tooling; surveyed draft apps use post-hoc validation or simple per-category limits. The analysis follows from the constraint structure and should be validated in Phase 3.

---
*Architecture research for: client-only turn-based tournament tooling (Pokémon Champions Drafter)*
*Researched: 2026-08-03*
