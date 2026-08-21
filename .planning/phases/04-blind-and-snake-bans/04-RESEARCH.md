# Phase 4: Blind and Snake Bans - Research

**Researched:** 2026-08-20
**Domain:** Hidden-information UX on a single shared screen, inside an existing pure-core /
append-only-log architecture. No new technology.
**Confidence:** HIGH (every claim below is read from this repository this session; the
handful of external claims are marked)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

Copied verbatim from `.planning/phases/04-blind-and-snake-bans/04-CONTEXT.md` §Implementation
Decisions. **D-01 through D-23 are locked. Research does not relitigate any of them.**

**The Ban Stage**

- **D-01:** **Ban mode stays a config-screen choice and `hostBanlist` keeps today's path
  exactly.** Picking `hostBanlist` changes nothing: the pool is drawn on the config screen and
  `createTournament` stays the atomic three-dispatch seam it is at `store.ts:220-265`. Only
  `blind` and `snake` route anywhere new. This deliberately accepts two places that decide when
  a pool gets built, in exchange for zero regression risk on the mode that already passed Phase
  2 verification. The alternative — one seam for all three modes — was considered and rejected
  on that basis.
- **D-02:** **Blind and snake route to a draft-style stage that runs before the draft begins.**
  Shared-screen shell, the same visual language as the draft, sequenced ahead of it. The stage
  renders the full roster rather than a pool, because the pool does not exist yet — which is
  exactly what Phase 2's D-10 ban-mode `PoolGrid` already does with all 235 entries. Whether
  this is literally a fourth `Screen` member or a mode inside the draft screen is left to
  planning; the requirement is that the draft screen's existing components keep their
  assumption that `poolIds` is populated.
- **D-03:** **Full undo throughout the ban stage, on the same single stack.**
- **D-04:** **One entry flow serves both the host-as-scribe case and the hot-seat case.**
  The stage steps player by player and each step is shielded full-screen. There is no
  "I'm Sam" identity handshake.
- **D-05:** **Nothing but progress is on screen until the reveal.** `3 of 6 entered` and no
  species name anywhere. Undo still works during this window; it removes the last entry
  without re-displaying it.

**Secrecy and the Log**

- **D-06:** **Pre-reveal blind submissions are plaintext in the log.** `bans/submitted`
  carries `{ playerId, monIds }` in the clear. Obfuscation-at-rest and commit-then-reveal
  hashing were both considered and rejected.
- **D-07:** **Submissions are log actions because undo is a log operation.** Planning must not
  "improve" secrecy by keeping submissions out of the log — that silently removes undo.
- **D-08:** **The reveal is host-triggered.**
- **D-09:** **Autosave runs during the ban stage; the PERS-06 JSON checkpoint does not.**
  The checkpoint fires after the reveal instead.

**Ban Counts and Order**

- **D-10:** **`bansPerPlayer` is a new `TournamentConfig` field — schema bump 3 → 4.** A
  derived default was rejected.
- **D-11:** **`draft/started` moves ahead of the ban stage.** This requires `draft/started`
  to stop implying "the pool exists". A separate `bans/ordered` action with its own seed was
  rejected.
- **D-12:** **Snake is a true serpentine** — `1→2→3→4`, then `4→3→2→1`, repeating until every
  player has their allotment.

**Where Revealed Bans Land**

- **D-13:** **`bans/revealed` keeps attribution** — `{ playerId, monIds }[]`, folded to a flat
  set by the pool draw.
- **D-14:** **Revealed bans are a log action, never written back into `config.bans`.** The pool
  draw reads the fold — host bans ∪ player bans. **Hard architectural constraint.**
- **D-15:** **The host banlist coexists with player bans in every mode.**
- **D-16:** **Players ban species only.** Mega-forme bans stay a host tool.

**BAN-06 — The Back-Button Guard**

- **D-17:** **`pageshow` with `event.persisted`, mirroring `tab-lock.ts:624-636`.** History-push
  plus `popstate` was rejected.
- **D-18:** **A half-finished entry is discarded on restore, and `visibilitychange` to hidden
  also locks.** Mid-entry selections live in component state and die with it.

**BAN-07 — Duplicate Policy**

- **D-19:** **No re-ban is built. Collisions resolve as "both apply, one wasted", named
  explicitly at the reveal.** The config screen still ships the duplicate-policy control with
  `Re-ban — Not yet available` rendered disabled.

  **This is a deliberate, owner-approved narrowing of a written requirement.** BAN-07 and
  ROADMAP Phase 4 success criterion 4 both say the host *selects* between "both apply with one
  wasted" **or** "a collision grants a re-ban". Only the first branch is built. **BAN-07 must be
  recorded as partially satisfied rather than complete, and the verifier must not be allowed to
  score success criterion 4 green on the re-ban clause.**
- **D-20:** **The duplicate policy is blind-mode-only, and the control says so.**

**RULE-08 — The Post-Reveal Re-Check**

- **D-21:** **The config-time gate is fully pessimistic about player bans.** It assumes every
  player ban lands on a Mega-capable species and blocks unless
  `players × megaRounds ≤ megaEligible − megaBans − players × bansPerPlayer`.
- **D-22:** **A failed post-reveal check blocks, and the only exit is abandoning back to
  config.** A host-voids-specific-bans compensating action and a `config/amended` action were
  both considered and rejected.
- **D-23:** **The pool is drawn on a separate `Start draft` tap, after the reveal.**

### Claude's Discretion

Verbatim from CONTEXT.md. **All six are resolved in this document — see §Discretion Resolutions.**

- **The interstitial's exact contract** — the handoff step sequence, whether a review-before-
  lock step exists, whether a panic/hide-now control exists, and the copy for each. D-04 and
  D-05 fix the constraints (one flow for both cases, no identity handshake, nothing visible
  until reveal); the sequence inside those constraints is open.
- **How snake mode displays previous bans** on the shared screen — a running list, a board, or
  a reuse of the existing `BanChipList` / top-bar `Bans (N)` disclosure from Phase 2's D-13.
  Note that D-13's disclosure copy and count now have to accommodate player bans, and
  `bannedEntries` in `src/core/bans.ts` is the one correct source of any displayed ban count.
- **Whether the live region can leak a ban name during blind entry.** `announce` is a
  module-level signal that outlives any render (CLAUDE.md §Tests). A polite announcement naming
  a banned species during entry would defeat D-05 through a channel the shield does not cover.
  Phase 3's screen-reader verification was descoped, so this must be reasoned about in code
  rather than confirmed by a manual pass.
- **Whether the reveal itself is undoable**, and what undoing it means for a pool that has not
  been drawn yet (D-23 means it has not been).
- **Three-metre legibility for every new surface** — DRFT-14 is an acceptance criterion for the
  whole shared screen, not a polish item, and the ban stage is a shared-screen surface.
- **The schema 3 → 4 migration** — `bansPerPlayer` and the duplicate-policy field both need
  lossless v3 defaults, and Phase 2's decision 4 names the three sites that compare
  `schemaVersion` and must all route through `migrate`: `store.ts:212`, `persistence.ts:222`
  (the wrapper record, *before* `isValidTournament`), and `import-guard.ts:444`. Missing
  `persistence.ts` makes `Resume saved draft` silently never appear for an older save, and that
  failure is invisible to import-only tests.

### Deferred Ideas (OUT OF SCOPE)

- **Everyone inside the tool on their own device, fantasy-football style.** The owner named
  this explicitly as belonging to a new milestone. It would flip the host-as-scribe assumption
  the entire phase rests on, and it would make abandon-only undo (rather than D-03's full undo)
  the correct call. Multi-client sync is also exactly what CLAUDE.md's "one write path" seam was
  designed to accommodate: `dispatch` gains a `broadcast(action)` and a sibling
  `receive(remoteAction)`. Not this phase.
- **The re-ban duplicate policy.** Descoped per D-19, with the config control shipped disabled
  so a later milestone enables it rather than adding it. Tracked as BAN-07's unbuilt half.

**Also explicitly out of research scope per the phase brief:** multi-client sync, WebRTC,
crypto commit-reveal schemes, any third-party library.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description (verbatim, `.planning/REQUIREMENTS.md`) | Research Support |
|----|-----------------------------------------------------|------------------|
| BAN-03 | Snake mode runs bans in turn order with previous bans visible | §Discretion 2 (display surface), §Serpentine Order (D-12), §Action Family (`bans/placed`), §Snake collision impossibility |
| BAN-04 | Blind mode collects each player's bans privately and reveals them together | §Action Family (`bans/submitted`, `bans/revealed`), §Discretion 1 (interstitial contract), §Discretion 3 (live-region audit) |
| BAN-05 | Blind mode uses a full-screen pass-the-device interstitial, not an input mask | §Discretion 1 — the entry surface is the whole working area; `04-UI-SPEC` §5 |
| BAN-06 | Returning via the back button cannot resurrect a private ban screen | §The bfcache Guard, Concretely — exact handler shape, exact test seam, the happy-dom trap |
| BAN-07 | Host selects the duplicate-ban policy at config time — both apply with one wasted, or a collision grants a re-ban | **PARTIAL by D-19.** §The Disabled-Member Pattern gives the verbatim reuse; the re-ban branch is not built |
| RULE-08 | Feasibility is re-checked after the ban reveal, since bans change the arithmetic | §The Feasibility Extension — and a **second, unflagged predicate** that crashes `drawPool` if omitted |
</phase_requirements>

---

## Summary

This phase adds no technology. Every question in it is a question about **this repository's own
seams**, and the research value is concentrated in nine code-level facts that a planner cannot
get right by reasoning from the decisions alone.

The three that will cost the most if missed:

1. **`canApply` refuses D-11's reorder as written.** `canApply(SCHEDULE_COMPILED)` at
   `reduce.ts:351-374` and `canApply(DRAFT_STARTED)` at `reduce.ts:371-384` both reject with
   `poolNotBuilt` when `state.poolIds.length === 0`. D-11 calls this "a doc-comment and
   structural-guard change, not new machinery" — that is correct in kind and understated in
   extent: **two `canApply` arms, one `NEVER_UNDONE` invariant comment, and one
   `selectPhase` consequence** all move.
2. **D-21's config-time gate is one predicate short, and the missing one crashes.**
   `drawPool` documents that `count > pool.length` "reaches `nextInt` with an empty range and
   the `RangeError` surfaces" (`draw.ts:110-112`). A host who types `poolSize` up to
   `legalCount` at config time — legal today, `poolTooLarge` only fires *above* it — then has
   `players × bansPerPlayer` more species removed after the reveal, and `Start draft` throws
   rather than blocking. The pessimistic gate needs a `poolSize` term as well as the Mega term.
3. **The live region's real leak channel is `undoAnnouncement`, not the entry surface.**
   `store.ts:446` is a **fall-through default arm** that interpolates a species name. A new
   `UndoRemoval.kind` that gets no arm above it lands there and announces the species a host
   just privately removed. `04-UI-SPEC` assertion S1 (the entry surface does not import
   `announce`) does not cover this, because the announcement is made by `store.ts`, not by the
   surface.

Everything else — the interstitial contract, the snake display, the reveal's undoability, the
legibility mapping — is already fixed in detail by `04-UI-SPEC.md`, which is unusually complete
and was written **without** a research pass. This document verifies its claims against source
rather than competing with it, confirms every measured figure it cites, and records the one
place it and `04-CONTEXT.md` disagree.

**Primary recommendation:** treat `04-UI-SPEC.md` as the surface contract and this document as
the core contract; plan Wave 0 as *schema 4 + action family + guard reorder + feasibility
extension*, and do not let any UI work start before `selectBanStageState` exists.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `bansPerPlayer` / duplicate-policy config fields | `src/core/model.ts` | `src/ui/screens/ConfigScreen.tsx` | Config shape is core; the control is UI |
| Schema 3→4 migration | `src/core/migrate.ts` | `import-guard.ts`, `persistence.ts`, `store.ts` | One upgrade authority; three readers route through it |
| Ban action vocabulary + structural guards | `src/core/actions.ts` | — | Purity boundary; `check:pure` enforces |
| Ban fold (`DraftState.banSubmissions`, `.bansRevealed`) | `src/core/reduce.ts` | — | Append-only fold |
| Serpentine order, whose turn, pass number, progress | `src/core/selectors.ts` | — | `04-UI-SPEC` §Pure-core boundary: a component may not own a rule |
| Public-ban set (what the grid renders inert) | `src/core/selectors.ts` | `PoolGrid`, `TypeaheadField` | Mode- and stage-dependent rule |
| Collision set | `src/core/selectors.ts` | `BanReveal` | Pure derivation over `bans/revealed` |
| Config-time pessimistic gate (D-21) | `src/core/feasibility.ts` | `FeasibilityBar` | One authority on satisfiability |
| Post-reveal RULE-08 re-check | `src/core/feasibility.ts` (**reuse `checkFeasibility`**) | `BanReveal` | A second arithmetic is a second thing that can disagree |
| Full-screen shield / entry surface | `src/ui/` | — | DOM |
| `pageshow` + `visibilitychange` locks | `src/adapters/` | `src/ui/` | Ambient events |
| In-progress selection during entry | `src/ui/` component state | — | D-18: must die with the component |
| Undo of a submission / of the reveal | `src/core/undo.ts` + `src/store.ts` | `ConfirmDialog` | Undo is the deliberate second write path |
| Pool draw on `Start draft` (D-23) | `src/core/draw.ts` (pure) called from `src/ui/` | `store.ts` `dispatch` | Ambient seed stamped at the edge |

---

## Project Constraints (from CLAUDE.md)

Every one of these is enforced by CI or by `npm run verify`. Planning must not propose work
that violates them.

| Directive | Enforcement | Phase-4 consequence |
|-----------|-------------|---------------------|
| Runtime `dependencies` is exactly `preact@10.29.8` and `@preact/signals@2.10.1`, exact-pinned | `package.json`, verified this session | **Zero new packages this phase.** The shield is a screen state, not a modal library |
| `src/core/` is pure — no DOM, clock, randomness, network, storage, timers; no imports from `adapters/`, `ui/`, `preact`, `@preact/signals` | `npm run check:pure` (`scripts/check-pure-core.mjs`) | The serpentine derivation, the collision set and the extended arithmetic are all core |
| `document`, `window`, `crypto`, `setTimeout`, `Math.random`, `Date.now` are **whole-word forbidden identifiers** in `src/core` | same script, `FORBIDDEN_IDENTIFIERS` at `check-pure-core.mjs:63-82` | **Name the tournament document `doc`, never `document`** — a parameter named `document` fails the build. Existing core already does this |
| `innerHTML` / `dangerouslySetInnerHTML` forbidden anywhere under `src/` | `npm run check:nohtml` | — |
| Document survives `JSON.stringify` → `JSON.parse` unchanged; no `Set`, `Map`, `Date`, class instance persisted | convention + `copyConfig` at `model.ts:421` | `bans/submitted.monIds` is `string[]`; the collision set is computed, never stored |
| Identity by `id`; `name` for rendering and export only; never `split('-')` a species name | convention | Collisions are compared on `monId`, never on displayed name |
| Plain CSS from `src/ui/tokens.css`; no raw hex, no raw px the token table covers | convention | `04-UI-SPEC` adds **no** token and **no** sanctioned raw length |
| Copy: second person, present tense, no exclamation marks, no emoji; errors state problem **and** next action; buttons name a verb and its object | convention | D-22's blocked-reveal sentence **must** end with the abandon instruction |
| `tests/core/**` mirrors `src/core/**`, zero mocks; default env `node`; a UI test opts in with `// @vitest-environment happy-dom` as the **first line** | `vite.config.ts` `test.environment: 'node'`; e.g. `tests/ui/ban-mode.test.tsx:1` | Every ban selector test is `node`; the bfcache tests are `happy-dom` |
| `announce` is a module-level signal that outlives any render — a test touching it resets in `beforeEach` | `LiveRegion.tsx:13` | §Discretion 3 |
| `npm run verify` is the single gate | `package.json` scripts | — |

---

## Discretion Resolutions

### Discretion 1 — The interstitial's exact contract

**Resolution: `04-UI-SPEC.md` already fixes this in full. Do not design a competing flow.**

The relevant contract is `04-UI-SPEC` §"How the shield and D-05 fit together" plus §4 (locked)
and §5 (entry). Verified as internally consistent with D-04 and D-05. Restated here only as a
pointer, with the three answers the discretion item asks for:

| Question | `04-UI-SPEC`'s answer | Where |
|----------|----------------------|-------|
| Step sequence | **Two states, not a sequence.** `Locked` is the resting destination; `Entry` is transient. Every exit from Entry — lock in, `Hide these bans`, tab-hide, bfcache restore — lands on Locked | §"How the shield and D-05 fit together" |
| Review-before-lock step? | **No.** Three reasons, strongest first: the selection is already fully visible via `BanChipList` on the same screen; D-03 makes undo the correction path and a review step would compete with it; the host enters six players in a row and every extra tap is paid six times | §5 |
| Panic / hide-now control? | **Yes — `Hide these bans`.** It exists *because it is free*: D-18 already forces the discard-and-lock transition on `visibilitychange` and persisted `pageshow`, so this is one new label wired to an existing transition. It does not confirm | §5 |

**Verified against source:**

- `BanChipList` and `TypeaheadField` exist and are reusable as claimed (`src/ui/components/`).
- `PoolGrid` takes `idPrefix` (`PoolGrid.tsx:100`, default `'pool'`) so a second grid can mount
  alongside an existing one — confirmed.
- **`TypeaheadField` cannot express an inert option today.** Its props are
  `{ label, placeholder, candidates, onSelect, subject?, id }` (`TypeaheadField.tsx:84-111`).
  There is no per-option disabled/reason hook. `04-UI-SPEC` §Component inventory marks it
  `extend`; the extension is a real new prop, not a pass-through. **Recommended shape:**
  `optionState?: (entry: T) => { inert: true; reason: string } | null`, defaulting to `null`,
  applied once inside the component so `undefined` can never read as a reason — the exact
  argument `PoolGrid.megaInertReason` makes at `PoolGrid.tsx:108-112`.
- **`PoolGrid` in ban mode has only pressed/unpressed today.** `banMode = bannedIds !== null`
  (`PoolGrid.tsx:474`); every cell "reports a pressed state" (`:76-82`). Rendering a cell inert
  with a reason is a genuine widening. The precedent to copy is `roundRestriction` /
  `armedSlot`: **one prop carrying every field the copy needs**, so a partially-supplied caller
  is unrepresentable (`PoolGrid.tsx:114-145`).

**One addition this research makes to the contract, and it is a correctness rule not a design
choice:** the entry surface must **unmount** on every exit, never be hidden with CSS or
`display: none`. Two independent reasons, both verified:

1. D-18 requires the in-progress selection to die with the component. A hidden component keeps
   its state.
2. `PoolGrid` schedules live-region announcements on a 300 ms debounce (`ANNOUNCE_DEBOUNCE_MS`
   at `PoolGrid.tsx:378`) plus a zero-delay repeat timer (`:597`). Both are cancelled **only on
   unmount** (`:609`, `:613-619`). A hidden-but-mounted grid leaves a pending `announce` that
   fires *after* the locked state has cleared the region, defeating `04-UI-SPEC` assertion S7.

This also satisfies assertion S9 for free: an unmount cannot be cross-dissolved.

Confidence: **HIGH** — every mechanism read from source this session.

---

### Discretion 2 — How snake mode displays previous bans

**Resolution: `04-UI-SPEC.md` fixes this too — a `BanBoard` in the split board pane, *plus* the
Phase-2 `Bans (N)` disclosure with a narrowed content rule.** Both, not either.

- **Primary surface:** `BanBoard` `mode="public"`, `BoardGrid`'s geometry with one column per
  **pass** instead of per round (`04-UI-SPEC` §6). It reuses `--board-label-w` verbatim rather
  than declaring its own label width — verified as a real token at
  `src/ui/components/BoardGrid.css:54`.
- **Secondary surface:** the top-bar `Bans (N)` disclosure, narrowed by `04-UI-SPEC`
  Amendment 1 so it never contains an unrevealed ban.

**Verified against source — the disclosure is exactly the leak channel Amendment 1 says it is.**
`TopBar.tsx:209-217` renders `<summary>Bans ({bannedNames.length})</summary>` over a `<ul>` of
every banned name, behind a native `<details>` anyone in the room can open with one click. It
is read-only and unrendered at zero (`{bannedNames.length > 0 && ...}`), both of which stay.

**`bannedEntries` is confirmed as the one correct count source.** `src/core/bans.ts:65-72`:
it resolves ids against the roster, dedupes via a computation-local `Set`, drops strangers, and
sorts by `name` for display. Its own doc block (`bans.ts:59-64`) states "`bans.length` is never
that number", and `tests/core/bans.test.ts` pins its length equal to `checkFeasibility`'s
`banCount`. **The Phase-4 trap `04-UI-SPEC` names is real and worth restating:**
`revealed.flatMap(r => r.monIds).length` is *also* wrong, because a collision is two submissions
and one banned species.

**Prescribed call:** `bannedEntries(entries, publicBans)` where `publicBans` is a selector
output, never assembled in a component:

| Mode / stage | `publicBans` |
|--------------|-------------|
| `hostBanlist`, any time | `config.bans` — unchanged from today |
| `snake`, during and after the ban stage | `config.bans` ∪ every ban already placed |
| `blind`, before `bans/revealed` | `config.bans` **only** |
| `blind`, after `bans/revealed` | `config.bans` ∪ every revealed ban |

Label stays `Bans ({n})` in every case. Recommended selector name: `selectPublicBanIds(state)`.

Confidence: **HIGH**.

---

### Discretion 3 — Can the live region leak a ban name during blind entry?

**Resolution: yes, through exactly one path, and it is not the one `04-UI-SPEC` guards.**

Every `announce()` call site in `src/` was read this session. There are **20**, in 10 modules.
Here is the complete audit against "could this name a species while the shield is up?".

| # | Call site | String | Names a species? | Reachable during blind entry? | Verdict |
|---|-----------|--------|-----------------|------------------------------|---------|
| 1 | `store.ts:394` → `undoAnnouncement` (`store.ts:416-447`) | five arms + **a fall-through default** | **YES** — swap arm and the default arm both interpolate `speciesName(...)` | **YES** if a new `UndoRemoval.kind` gets no arm | **THE LEAK. Must be closed.** |
| 2 | `ConfigScreen.tsx:720` → `banAnnouncement` (`:301-303`) | `{name} banned. {n} bans.` | **YES** | No — `ConfigScreen` is not mounted during the ban stage | Safe by construction; **S1 forbids reuse** |
| 3 | `ConfigScreen.tsx:766` → `megaFormeBanAnnouncement` (`:203-205`) | `{name} banned. {n} Mega-forme bans.` | **YES** | No — same reason | Safe by construction |
| 4 | `app.tsx:1379` | `Swapping {outName} out of round {round}. …` | **YES** | No — draft screen only | Safe by construction |
| 5 | `app.tsx:1649` (`announce(move)`) | `{inName} fills {playerName}'s round {round} slot. {outName} is back in the pool.` | **YES** | No — draft screen only | Safe by construction |
| 6 | `PoolGrid.tsx:471` | `Display density: {label}.` | No | Yes — the entry surface mounts `PoolGrid` | Safe |
| 7 | `PoolGrid.tsx:596/599/602` → `filterAnnouncement` (`:381-383`) | `{matching} of {total} Pokémon match.` | No | Yes | Safe **only if the grid unmounts** — see Discretion 1 |
| 8 | `TurnBanner.tsx:242` | turn/phase copy + `lastMove` | Inherits whatever `lastMove` holds | No — no `TurnBanner` on blind locked or entry | Safe by construction; **snake mounts it** |
| 9 | `SplitPanes.tsx:237` | pane-state copy | No | No — blind mounts no panes | Safe |
| 10 | `ExportPanel.tsx:97/102` | `{playerName} team paste copied.` | No | No — completed draft only | Safe |
| 11 | `ReadOnlyBanner.tsx:68` | `READ_ONLY_SENTENCE` / `STALE_SENTENCE` (`:50-52`) | No | **Yes** — this component is a sibling of the `inert` gate and is always mounted | Safe |
| 12 | `use-ownership.ts:45` | `TAKEOVER_CONFIRMED` | No | Yes | Safe |
| 13 | `app.tsx:532` | roster-load failure message | No | Yes (async) | Safe |
| 14 | `app.tsx:1710/1792/1802` | import outcome copy | No | Only via `TopBar`, which the entry surface does not render | Safe |

**The leak, stated precisely.** `store.ts:416-447` is a chain of `if` arms with **no default
case guard** — the final line is:

```ts
return `Undid Round ${removed.round} — ${speciesName(removed.monId)} is back in the pool.`;
```

It is reached by *anything* that is not `'card' | 'order' | 'swap' | 'pass'`. D-03 makes undo
mandatory during the ban stage, which means `UndoRemoval['kind']` gains at least one member
(`'banSubmission'`, and `'banReveal'` if the reveal is undoable — it is, see Discretion 4).
Adding the member without adding an arm produces a **silent, compiling, test-passing announcement
of the species a host just privately removed**, in a room full of people, through a channel the
visual shield does not cover.

**The guard — three layers, all cheap:**

1. **Make the omission a type error.** Change the tail of `undoAnnouncement` from a fall-through
   `return` to an exhaustive switch on `removed.kind` with a `never`-typed default:
   ```ts
   default: {
     const exhaustive: never = removed.kind;
     return exhaustive;
   }
   ```
   This is the single highest-value change in the phase. It converts a silent secrecy failure
   into a compile error, and it costs one refactor of a function that already branches five ways.
2. **The ban arms name no species.** `04-UI-SPEC` §Live-Region Contract already specifies
   `{playerName}'s bans were removed. {n} of {m} entered.` — verified as name-free.
3. **Keep `04-UI-SPEC` S1 as written** (the entry surface module does not import `announce`),
   because it closes the *other* direction: a future contributor adding selection feedback.
   S1 is greppable and is a real static check.

**Two further findings the discretion item did not ask for but planning needs:**

- **The entry surface has no Ctrl+Z path, and this is structural rather than lucky.** The
  document-level undo keybinding is registered by `TopBar` in a `useEffect`
  (`TopBar.tsx:152`, cleanup `:154`). `04-UI-SPEC` §3 gives the entry surface **no top bar**, so
  unmounting `TopBar` removes the listener. Planning must not "helpfully" hoist that listener to
  `app.tsx` — doing so would put a species-naming undo one keystroke away from a shielded screen.
- **`announce`'s known byte-identical limitation** (`LiveRegion.tsx:19-26`: announcing the same
  text twice in a row is silent the second time, and clearing first does not fix it because
  Preact batches) is **not hit** by the phase's five permitted strings: consecutive stage
  announcements always differ by player name or by count. `PoolGrid` is the one module that
  works around it, with the two-timer clear-then-speak at `:595-604`.

Confidence: **HIGH** — every call site read; the fall-through arm read line by line.

---

### Discretion 4 — Is the reveal undoable?

**Resolution: yes. It must be, and it is cheap. `04-UI-SPEC` §8 already writes the copy.**

Three arguments, strongest first:

1. **D-03 is unconditional** — "Full undo throughout the ban stage, on the same single stack."
   A stage where the last action is un-undoable is not full undo, and the reveal is exactly the
   moment a host discovers they typed the wrong Pokémon for player 1.
2. **D-23 makes it clean.** The pool is not drawn until a separate `Start draft` tap, so undoing
   the reveal has **nothing to un-draw**. The state it returns to — `{m} of {m} entered — Reveal
   bans` — is a designed destination that already exists (`04-UI-SPEC` §4).
3. **It is one `UndoRemoval` arm.** The mechanism is already general: `undoRemoval`
   (`undo.ts:274`) returns a `kind` discriminant, `undoCrossesRoundBoundary` (`undo.ts:455`)
   carries it through as `RoundBoundaryCrossing.kind` (`undo.ts:407-410`, doc-commented "The UI
   picks its copy from this"), and `app.tsx:1538-1560` routes on `crossing.crosses` to either a
   silent undo or a `ConfirmDialog`. **Setting `crosses: true` for the ban kinds is how the
   confirm is obtained — no new machinery, exactly as `04-UI-SPEC` claims.**

**What undoing the reveal means, stated for the planner:** it removes the `bans/revealed` entry
only. Every `bans/submitted` stays. The stage re-folds to "all in, not yet revealed". It cannot
un-read what the room has already read, and `04-UI-SPEC`'s body copy says so rather than
implying a secrecy restoration the tool cannot deliver.

**What must be added to `src/core/undo.ts`:**

| Site | Line today | Change |
|------|-----------|--------|
| `NEVER_UNDONE` | `undo.ts:107` — `[POOL_BUILT, SCHEDULE_COMPILED, DRAFT_STARTED]` | **Add `POOL_BUILT` is already there — but its invariant comment at `:114-117` says the deny-list "states the boundary in one place, so when the swap actions joined the allow-list nobody had to re-derive whether a growing allow-list could reach `pool/built`". After D-11's reorder `pool/built` is the LAST action of the stage, so this comment must be re-read and corrected in the same change.** A `pool/built` that is now last is a `pool/built` an allow-list *could* reach |
| `isUndoable` | `undo.ts:135-144` | Add `isBansSubmittedAction(action) \|\| isBansRevealedAction(action)` (and the snake `isBansPlacedAction`) to the allow-list |
| `UndoRemoval['kind']` | `undo.ts:221` | `'pick' \| 'card' \| 'order' \| 'swap' \| 'pass'` → add `'banSubmission' \| 'banPlaced' \| 'banReveal'` |
| `undoRemoval` | `undo.ts:274` | New arms. `monId` stays `null` for a ban kind — **deliberately**, because that field's doc block says it is "the species returning to the POOL", and no pool exists yet. Putting a banned id there is how the fall-through announcement gets a name to speak |
| `undoAnnouncement` | `store.ts:416` | New arms **plus** the exhaustive-`never` default from Discretion 3 |
| `confirm-copy.ts` | new sets | `04-UI-SPEC` §8 supplies all three verbatim |

**One trap:** `UndoRemoval.round` is required and 1-based. A ban belongs to no pick round.
Follow the `'pass'` precedent (`undo.ts:224-232`): a pass reports `config.rounds` so that "a
caller comparing this against the current round gets the honest answer 'no round was crossed'".
For a ban, report `1`, and force `crosses: true` explicitly for `'banSubmission'` and
`'banReveal'` rather than letting the round comparison decide it.

Confidence: **HIGH**.

---

### Discretion 5 — Three-metre legibility for every new surface

**Resolution: `04-UI-SPEC` §DRFT-14 resolves this by *mapping*, and the mapping is correct.
No new type size is needed and none may be introduced.**

**Verified against `src/ui/tokens.css:110-113` — the scale is exactly four sizes, two weights:**

| Token | Value (verbatim) | Phase-4 surfaces |
|-------|------------------|------------------|
| `--text-body` | `400 18px / 1.5 var(--font-sans)` | reveal species names, progress `Entered`/`Not yet`, collision lines, feasibility line, snake rule line |
| `--text-label` | `600 14px / 1.4 var(--font-sans)` | `Pass {n}` column headers, config helper text |
| `--text-heading` | `600 24px / 1.25 var(--font-sans)` | **player names, on both the progress board and the reveal**; locked-panel sub-heading |
| `--text-display` | `600 36px / 1.15 var(--font-sans)` | locked headline, entry `<h1>`, reveal `<h1>`, snake turn banner |

`tokens.css:34-36` records the convention: "each `--text-*` token is a complete font shorthand …
`font: var(--text-heading)` and gets all four decisions together". A component that sets
`font-size` alone is off-contract.

**Why no new legibility risk is introduced:** every Phase-4 surface reuses one of three sizes
already physically verified on the pessimistic screen — a ~24" 1080p monitor at 3 metres, passed
2026-08-19/20 per `.planning/STATE.md`. `04-UI-SPEC` maps: 36px ≡ the priority-card digit;
24px ≡ the hand-strip pip and board row label; 18px ≡ the Mega marker. All three were recorded
as passing (24px and 18px as "marginal but readable").

**The spacing and size tokens are equally confirmed unchanged:** `--space-1..7` are `4/8/16/24/
32/48/64` (`tokens.css:47-53`); `--target-min: 44px`, `--radius: 8px`, `--border-w: 2px`,
`--hairline-w: 1px` (`tokens.css:77-80`). `04-UI-SPEC` adds none and sanctions no new raw length.

**The layout arithmetic is arithmetic and checks out.** `--board-label-w: 176px` exists at
`BoardGrid.css:54`. `56n + 8(n−1) + 176 ≤ 739` → `64n ≤ 571` → `n ≤ 8` at split;
`64n ≤ 1480` → `n ≤ 23` at `board-full`. Assertion 16 is what makes it regressable.

**The mandatory physical pass is not substitutable** and doubles as the secrecy check —
`04-UI-SPEC` §DRFT-14 item 4(a-d). A failure at 18px is a finding about `--text-body` on a
shared screen, **not** a licence to introduce a fifth font size.

Confidence: **HIGH** for the token facts; **MEDIUM** for the arc-minute inference (it is an
extension of a prior physical pass, not a new one — which is what item 4 exists to falsify).

---

### Discretion 6 — The schema 3 → 4 migration

**Resolution: the three sites still exist and all three still route through `migrate`. Every
line number in `04-CONTEXT.md` and `STATE.md` decision 4 is stale — they are Phase-2 numbers.
Here are the current ones, and there are now FOUR `migrate` call sites across three modules.**

| CONTEXT says | Actual today | What is there |
|--------------|-------------|---------------|
| `store.ts:212` | **`src/store.ts:286`** (inside `adoptTournament`, declared `:285`) | `const migrated = migrate(doc); if (!migrated.ok) return false;` |
| `persistence.ts:222` | **`src/adapters/persistence.ts:261-263`** (the wrapper compare) and **`:299`** (the `migrate` call) | `SUPPORTED_SCHEMA_VERSIONS.includes(wrapperVersion)` — runs **before** `isValidTournament(stored)` at `:274` |
| `import-guard.ts:444` | **`src/core/import-guard.ts:903`** (`isValidTournament` → `return migrate(doc).ok`) **and `:946`** (`parseTournamentFile` → `const migrated = migrate(doc)`) | Two distinct call sites in one module |

**`persistence.ts:255-263` carries its own warning comment**, written after the Phase-2 incident,
and it is the reason the site is now bump-proof by construction:

> This is the THIRD `schemaVersion` compare site, after `store.ts` and `import-guard.ts`, and it
> is the one no import-only test can see: a file arriving through the import button never passes
> through this branch, so a schema bump that forgets it fails only for the host who closed the
> tab yesterday. `SUPPORTED_SCHEMA_VERSIONS` is asked rather than `SCHEMA_VERSION` compared
> precisely so that every bump moves this site by definition rather than by remembering to.

**Consequence for planning: the wrapper site now needs no code change at all.** Adding `4` to
`SUPPORTED_SCHEMA_VERSIONS` (`migrate.ts:48`) moves it automatically. The risk has shifted from
"forget the site" to "forget the *test*".

#### The exact test shape that catches the invisible failure

It already exists and must be extended, not reinvented:

- **`tests/adapters/persistence.test.ts:427`** — `it('opens through all three schemaVersion
  comparison sites — decision 4')`. One v1 fixture, three doors: `parseTournamentFile` →
  `load()` from a seeded `STORAGE_KEY` record → `adoptTournament`. **Assertions are on
  `.schemaVersion === 3` and must become `4`.**
- **`tests/adapters/persistence.test.ts:524`** — `describe('a draft saved by Phase 2')` →
  `it('is still offered as a resumable draft after the schema 3 bump')`. **This is the template.
  Phase 4 must add `describe('a draft saved by Phase 3')` with a `v3Record()` helper writing
  `{ schemaVersion: 3, generation, savedAt, doc: v3Doc() }` and assert `load()` is not null.**
  This is the one test that would have caught the Phase-2 bug, and the only kind that can.

#### The six shipped assertions that break on the bump — a checklist

| File:line | Assertion today | Becomes |
|-----------|----------------|---------|
| `tests/core/migrate.test.ts:161` | `expect([...SUPPORTED_SCHEMA_VERSIONS]).toEqual([1, 2, 3])` | `[1, 2, 3, 4]` |
| `tests/core/migrate.test.ts:393` | `it('leaves a document that is already at version 3 alone, by identity')` | version 4 |
| `tests/core/migrate.test.ts:398` | `it('refuses version 4 rather than reading it optimistically')` | version 5 |
| `tests/adapters/persistence.test.ts:427` | `expect(imported.doc.schemaVersion).toBe(3)` ×3 | `4` |
| `tests/adapters/persistence.test.ts:533` | `expect(load()?.schemaVersion).toBe(3)` | `4` |
| `tests/adapters/persistence.test.ts:567` | wrapper `schemaVersion: 4` is "a version this build has never supported" | `5` |

`tests/core/migrate.test.ts:168` (`expect(SUPPORTED_SCHEMA_VERSIONS).toContain(SCHEMA_VERSION)`)
is the drift guard and needs no edit — it will fail loudly if the list is not moved.

#### The v3 defaults, and why they differ from the config-screen defaults

Follow `V1_CONFIG_DEFAULTS` (`migrate.ts:62`) and `V2_CONFIG_DEFAULTS` (`migrate.ts:84`)
exactly: a `const … as const` exported from `migrate.ts` and **imported by
`import-guard.buildConfig`**, never re-declared, because "two copies of a default table is two
tables that can disagree about what a Phase 3 tournament was" (`migrate.ts:78-81`).

```ts
export const V3_CONFIG_DEFAULTS = {
  bansPerPlayer: 0,
  duplicateBanPolicy: 'bothApply',
} as const;
```

**`bansPerPlayer: 0` is lossless and is deliberately a different number from the config
screen's default of `1`.** A schema-3 document was necessarily `hostBanlist` — `blind` and
`snake` shipped disabled at `ConfigScreen.tsx:277-278` — so zero player bans is the true answer,
not a guess. The config screen's `1` answers a different question ("what should a host who has
just picked blind see?"). `04-UI-SPEC` §1 says the same thing. **Do not unify the two constants.**

`migrateV3ToV4` is config-only. **The log is passed through unchanged, entry for entry**, for
`migrateV2ToV3`'s stated reason (`migrate.ts:203-211`): nothing in schema 4 makes an existing
entry unfoldable, and splicing a synthetic ban action in would need a fresh `seq` and would be
stamped after actions it logically precedes.

#### The four+two places a new payload field must land

`STATE.md` decision 6 names four; the codebase requires **six** for a new *action type*, and
`actions.ts:16-19` says so in its own header:

> it lands in the same five places every type here does: constant, payload interface, `Intent`
> member, creator, structural guard — plus `buildLogEntry`'s arm in `import-guard.ts`, which is
> the sixth and the one a round trip fails silently without.

For a new *field on an existing payload* it is four: payload interface, creator, structural
guard, `buildLogEntry` arm. `swap/made`'s `swapRound` is the worked example and carries the
warning verbatim at `import-guard.ts:738-743`.

For the two new **config** fields the sites are different again — five:
`model.ts:169` `TournamentConfig`, `model.ts:421` `copyConfig` (**element-by-element; TypeScript
catches an omitted field but cannot see a shallow copy** — `model.ts:411-419`),
`migrate.ts` `V3_CONFIG_DEFAULTS` + `migrateV3ToV4`, `import-guard.ts:472` `buildConfig`, and
`ConfigScreen.handleStart` (`ConfigScreen.tsx:1074-1107`).

**`MAX_BANS_PER_PLAYER` is required, not optional.** `import-guard.ts` bounds every host-typed
numeric field — `MAX_SWAP_BUDGET = 24` at `:141`, `MAX_SWAP_ROUNDS = 24` at `:151` — and
`feasibility.ts:60-67` states the invariant: the gate and the guard must be the *same* number,
"the alternative is a build that creates documents it will not re-open". `04-UI-SPEC` §1
specifies the same value, 24, beside `MAX_SWAP_BUDGET`.

Confidence: **HIGH**.

---

## The `draft/started` Reorder (D-11) — What Actually Breaks

D-11 calls this "a doc-comment and structural-guard change, not new machinery". That is right in
kind. Here is the exact extent, read from source.

### The two guards that refuse it today

```ts
// src/core/reduce.ts:351-358
case SCHEDULE_COMPILED: {
  if (!isScheduleCompiledAction(action)) return reject('malformedPayload');
  // After the pool, because a schedule is only meaningful against one, and before the
  // draft, because `DRAFT_STARTED` below now requires it.
  if (state.poolIds.length === 0) return reject('poolNotBuilt');
  ...

// src/core/reduce.ts:371-374
case DRAFT_STARTED: {
  if (!isDraftStartedAction(action)) return reject('malformedPayload');
  if (state.poolIds.length === 0) return reject('poolNotBuilt');
  ...
```

**Both must become mode-conditional, not deleted.** `canApply` sees `state.config`, and already
reads it elsewhere (`canApply(SWAP_MADE)` consults `config.swapBudget`), so the precedent exists:

```ts
if (state.config.banMode === 'hostBanlist' && state.poolIds.length === 0) {
  return reject('poolNotBuilt');
}
```

This is what preserves D-01's zero-regression posture literally: for `hostBanlist` the guard is
byte-for-byte the same rule it is today.

`canApply(POOL_BUILT)` at `reduce.ts:343-350` needs **no change** — it checks
`poolAlreadyBuilt`, `emptyPool` and `duplicatePoolIds`, and asserts nothing about the draft
having started. A `pool/built` arriving after `draft/started` is already legal.

### The dispatch order for blind and snake

```
schedule/compiled  →  draft/started  →  [ban actions]  →  bans/revealed  →  pool/built
```

`schedule/compiled` must still precede `draft/started`, because `canApply(DRAFT_STARTED)` at
`reduce.ts:378` rejects `scheduleNotCompiled` and that check is unrelated to the pool.

### What `poolIds === [] && order !== []` does to the selectors — measured

| Selector | Behaviour with an empty pool and a resolved order | Consequence |
|----------|--------------------------------------------------|-------------|
| `selectAvailablePool` (`:53`) | `[]` | Draft pool grid renders empty |
| `selectIsComplete` (`:323`) | `false` (0 picks < `config.rounds`) | — |
| `selectCurrentRound` (`:349`) | `1` | — |
| `selectDealsCards` (`:709`) | **`true`** (`schedule.length > 0`) | — |
| **`selectPhase` (`:733`)** | **`'cards'`** — order is non-empty, deals cards, round 1 unresolved | **The ban stage would classify as the priority-card phase.** `app.tsx` branches on this to choose a panel |
| `selectCurrentTurn` (`:769`) | `null` (bidding) | — |
| `selectCardTurn` (`:464`) | **the first player, on the card clock** | A card panel would render and be playable |

**This is the concrete answer to "what breaks".** It is not the pool grid — that renders empty
and harmlessly. It is `selectPhase`, which would put the app into card play during the ban stage.

**Recommendation, and it settles D-02's open question:** make the ban stage a **fourth `Screen`
union member**, not a mode inside the draft screen.

- `Screen` is `type Screen = { name: 'landing' } | { name: 'config' } | { name: 'draft' }` at
  **`src/app.tsx:120`**, held in `useState` at **`src/app.tsx:474`**. Adding `{ name: 'bans' }`
  is one union member and one `setScreen` call.
- A separate member means the draft screen's `selectPhase` branch is never evaluated during the
  ban stage, so **the draft screen's existing components keep their assumption that `poolIds` is
  populated** — which is D-02's stated requirement, met structurally rather than by discipline.
- The alternative (a mode inside the draft screen) requires shielding `selectPhase`,
  `selectCardTurn`, the card panel, the board and the hand strips individually. That is five
  places that can each be got wrong, against one union member.

**The shell class must branch too.** `app.tsx:1898` reads
`class={screen.name === 'draft' ? 'draft-shell' : 'app-shell'}`. `04-UI-SPEC` Amendment 2 wants
`.draft-shell` for snake and `.app-shell` for blind locked/reveal, so the expression becomes a
three-way branch on `screen.name` **and** `config.banMode`.

**Everything lands inside the existing `inert` shell gate at `app.tsx:1896-1900`**, never beside
it. The gate's own doc block (`:1841-1856`) records why the landing and config screens were moved
*inside* it: a secondary tab could otherwise build a whole rival tournament. A ban stage sibling
of the gate would reopen exactly that hole. `LiveRegion`, `ReadOnlyBanner` and the three dialogs
stay outside — that is deliberate and documented at `:1861-1875`.

### Doc-comments that become false and must be corrected in the same change

CLAUDE.md and both prior UI-SPECs treat a stale contract comment as worse than none. These four
assert the old ordering:

1. **`src/store.ts:186-198`** — `createTournament`'s ordering block: "`draft/started` the
   resolved starting order" listed third, after `pool/built` and `schedule/compiled`.
2. **`src/core/reduce.ts:353-355`** — "After the pool, because a schedule is only meaningful
   against one".
3. **`src/core/undo.ts:114-117`** — the `NEVER_UNDONE` invariant argument, which reasons about
   whether "a growing allow-list could reach `pool/built`". After the reorder `pool/built` is the
   *last* action of a blind/snake stage, so the reasoning must be restated.
4. **`src/core/actions.ts` `DraftStartedPayload`** (`:161-166`) and `PoolBuiltPayload`
   (`:62-92`) — both describe a document in which the pool precedes the order.

### `createTournament` must not be reshaped

D-01 keeps `store.ts:220-265` atomic for `hostBanlist`. Add a **sibling** entry point rather than
parameterising it — e.g. `createBanStage(input)` taking `{ config, order, orderSeed, schedule }`
and dispatching two actions with the same rollback-on-refusal shape (`store.ts:248-262`). Two
seams is what D-01 explicitly buys.

`CreateTournamentInput` (`store.ts:145-176`) requires `poolIds`, `poolSeed` and
`megaCapableCount`. The sibling does not take them; `ConfigScreen.handleStart`
(`ConfigScreen.tsx:1073`) branches on `banMode` to pick which one to call. Note that
`handleStart` currently guards on `draw === null` at `:1074` — for blind/snake there is no draw
yet, so that guard must move inside the `hostBanlist` branch.

Confidence: **HIGH**.

---

## The Feasibility Extension (D-21 and RULE-08)

### What exists today

`src/core/feasibility.ts` — 597 lines, one exported gate, `checkFeasibility` at `:387`.

- **Two severities:** `blocking` and `warning`, constructed by the private `blocking()` /
  `warning()` helpers at `:369-375`. `FeasibilityResult.blocked` is
  `problems.some(p => p.severity === 'blocking')` (`:589`).
- **17 reason codes**, `FeasibilityCode` at `:87-126`. Blocking: `tooFewPlayers`,
  `blankPlayerName`, `duplicatePlayerName`, `poolSizeNotAnInteger`,
  `megasRequiredNotAnInteger`, `megasExceedRounds`, `tooManyPlayersForRoster`, `poolTooLarge`,
  `poolTooSmall`, `notEnoughMegas`, `swapBudgetNotAnInteger`, `swapBudgetTooLarge`,
  `swapRoundsNotAnInteger`, `swapRoundsTooLarge`. Warning: `poolExactlyMinimum`,
  `swapRoundsOnExactPool`.
- **`PRECEDENCE`** at `:179-197` is a declared array, sorted at `:586`. The bar renders
  `problems[0]`, so precedence position is load-bearing, not cosmetic.
- **The shape of a new code** is exactly three things: a member on the `FeasibilityCode` union
  with its own `/** */` line; a position in `PRECEDENCE`; a message constant or composer in the
  Copy section (`:200-368`) plus a `problems.push(blocking(...))` in the gate.

### The RULE-09 baseline, and the double-subtraction trap in D-21's wording

Today (`feasibility.ts:566-580`):

```ts
if (megasPerTeam !== null && players * megasPerTeam > megaEligibleLegalCount) { ... }
```

**`megaEligibleLegalCount` already has host species bans AND Mega-forme bans subtracted.** It is
computed at `:400-408` as the count of entries that are `!banned.has(entry.id)` **and**
`isMegaEligible(entry, bannedFormes, choiceFor(...))`. Its own doc block at `:159-163` says so.

D-21 is written as `players × megaRounds ≤ megaEligible − megaBans − players × bansPerPlayer`.
Taken literally against the existing variable that double-subtracts the ban terms. **The correct
predicate is:**

```ts
const pessimisticPlayerBans = banMode === 'hostBanlist' ? 0 : players * bansPerPlayer;
if (megasPerTeam !== null &&
    players * megasPerTeam > megaEligibleLegalCount - pessimisticPlayerBans) { ... }
```

### The second predicate D-21 does not name — and it is a crash, not a block

`drawPool`'s `selectInPlace` doc block, verbatim at **`src/core/draw.ts:108-112`**:

> A `count` larger than `pool.length` reaches `nextInt` with an empty range and the `RangeError`
> surfaces. That is deliberate and inherited: a caller asking for more entries than exist has a
> bug, and clamping would hand back a pool quietly smaller than the one the host configured.

**Reachable through the ordinary config flow, today, with no import and no hand-edit:**

1. `poolTooLarge` blocks only when `poolSize > legalCount` (`feasibility.ts:507`). `poolSize ===
   legalCount` passes every check.
2. The pool-size field is free-typed — `feasibility.ts:12-18` and Phase 2 D-06 explicitly refuse
   to clamp it.
3. The host picks `blind`, 8 players, 2 bans each, and types `poolSize = legalCount`.
4. After the reveal, 16 more species are banned. `candidates.length = legalCount − 16 < poolSize`.
5. `Start draft` calls `drawPool` and **throws a `RangeError`** on a shared screen, mid-ritual.

**So the pessimistic gate needs three terms, not one:**

```
q = (banMode === 'hostBanlist') ? 0 : players * bansPerPlayer

notEnoughMegas          block when  players * megasPerTeam > megaEligibleLegalCount - q
poolTooLarge            block when  poolSize              > legalCount             - q
tooManyPlayersForRoster block when  players * rounds      > legalCount             - q
```

**With all three in place, the post-reveal blocked state becomes unreachable from the config
flow** — which is precisely the claim `04-UI-SPEC` §7 makes ("reachable only from an imported or
hand-edited document"). That claim is *true only if the pool term is added*; `04-UI-SPEC`
considered the Mega branch alone. This is the single most important correction in this document
after the `undoAnnouncement` fall-through.

### The two malformed-input codes

`04-UI-SPEC` §2 adds `bansPerPlayerNotAnInteger` and `bansPerPlayerNotPositive`, sitting beside
`swapBudgetNotAnInteger`. The existing two-question pattern is at `feasibility.ts:539-553` and is
the one to copy verbatim: ask `asSafeInteger(value, 0, MAX_SAFE_INTEGER) === null` first
(malformed), then `asSafeInteger(value, min, BOUND) === null` (out of bounds), because "an
emptied field is `null` and every relational comparison with `NaN` is false".

Add a `bansPerPlayerTooLarge` code against `MAX_BANS_PER_PLAYER` for the same reason
`swapBudgetTooLarge` exists — `feasibility.ts:60-67` requires the gate and the import guard to
agree, or the build creates documents it will not re-open.

### The post-reveal re-check — reuse, do not rewrite

**Call `checkFeasibility` itself**, with `bannedIds` set to the *union* of host bans and every
revealed player ban, and the pessimistic `q` term set to **zero** (the bans are now materialised,
so pessimism would double-count).

```ts
checkFeasibility({
  playerNames: state.config.players.map((p) => p.name),
  rounds: state.config.rounds,
  poolSize: state.config.poolSize,
  megasRequiredPerTeam: state.config.megasRequiredPerTeam,
  bannedIds: selectAllBanIds(state),          // host ∪ revealed, deduped
  megaFormeBans: state.config.megaFormeBans,
  dualMegaChoices: state.config.dualMegaChoices,
  swapBudget: state.config.swapBudget,
  swapRounds: state.config.swapRounds,
  entries,
})
```

Three reasons this beats a bespoke re-check:
1. **One authority on satisfiability** — the module header's own first sentence.
2. It catches the pool-size branch and the player-count branch for free, which a Mega-only
   re-check would not.
3. Every message is already written and already tested.

The reveal renders **blocking problems only** — `poolExactlyMinimum` and `swapRoundsOnExactPool`
are config-time warnings and have no remedy at the reveal, where D-22 removes every exit but
abandonment. Render `problems.filter(p => p.severity === 'blocking')[0]` plus D-22's mandatory
closing clause.

### The `{y}` ambiguity in the blind/snake copy — flag for the planner

`04-UI-SPEC` §2 gives:

> `… {y} can still Mega after {b} species bans, {f} Mega-forme bans and {q} player bans.`

For the sentence to be *true as written*, `{y}` must be `megaEligibleLegalCount − q`, not
`megaEligibleLegalCount`. **Recommendation: `{y} = Math.max(0, megaEligibleLegalCount − q)`.**
At `q = 0` the two strings then agree, so the test pinning the `hostBanlist` arm byte-identical
to Phase 3's shipped string still passes — which is `04-UI-SPEC`'s own stated requirement. The
clamp matters: `q` can exceed the eligible count at high player counts, and a negative number in
a shared-screen sentence reads as a broken tool.

Both arms must be composed by **one function**, per `04-UI-SPEC` §2 and per
`notEnoughMegasMessage`'s existing single-composer posture at `feasibility.ts:341-357`.

Confidence: **HIGH** on the source facts; the `{y}` recommendation is **[ASSUMED]** — it is
Claude's reading of an ambiguous contract line and should be confirmed at plan-check.

---

## The bfcache Guard, Concretely (BAN-06)

### The handler D-17 mirrors — exact current shape

`src/adapters/tab-lock.ts:621-637`, verbatim:

```ts
function installLifecycle(): void {
  if (typeof window === 'undefined') return;

  const onPageHide = (): void => lock?.release();
  const onPageShow = (event: PageTransitionEvent): void => {
    // Restored from the back/forward cache. `release()` put the lock back to idle on the
    // way out, so this re-runs the boot protocol rather than leaving a restored tab
    // stuck behind a banner it can never clear.
    if (event.persisted) lock?.claim();
  };

  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);

  lifecycleTeardown = () => {
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
  };
}
```

Registered from `claimOwnership` (`tab-lock.ts:659`, guarded by `if (lock !== null) return` at
`:660`), torn down via the module-level `lifecycleTeardown` closure. `event.persisted` is
consulted at `:628`. The reasoning D-17 points at also lives at `tab-lock.ts:537-544`, inside
`release()` — the "back to `idle` so `pageshow` can re-run the protocol" argument.

### The `visibilitychange` pairing D-18 asks for

`src/adapters/persistence.ts:438-451`, verbatim:

```ts
const onPageHide = (): void => flush();
const onVisibilityChange = (): void => {
  if (document.visibilityState === 'hidden') flush();
};

window.addEventListener('pagehide', onPageHide);
document.addEventListener('visibilitychange', onVisibilityChange);

return () => {
  unsubscribe();
  window.removeEventListener('pagehide', onPageHide);
  document.removeEventListener('visibilitychange', onVisibilityChange);
  flush();
};
```

Note the asymmetry, which is correct and must be copied exactly: **`pageshow`/`pagehide` on
`window`; `visibilitychange` on `document`.** Registering `visibilitychange` on `window` works in
some browsers and not others — copy the shipped pairing.

### How a second `pageshow` consumer coexists

Trivially. `addEventListener` is additive and both are independent closures; neither calls
`stopPropagation`. **But two invariants must hold:**

1. **The ban guard must not go into `installLifecycle`.** That function is a module-level
   singleton owned by the lock, torn down through one module-level variable. Adding a second
   concern to it couples the ban stage's lifetime to the lock's.
2. **The ban guard's listener must be scoped to the ban stage's own lifetime.** A permanently
   registered listener that fires on every restore of every screen is a listener that will one
   day fire against a stale closure.

### Prescribed shape

A new adapter, `src/adapters/ban-shield.ts`, following `startAutosave`'s subscribe-and-return-
teardown shape:

```ts
/**
 * Lock the blind entry surface on any departure the room can see — BAN-06, D-17, D-18.
 *
 * Registered while the entry surface is mounted and torn down with it, so a restore that
 * lands on the locked screen has nothing left listening for it.
 */
export function installBanShield(onLock: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const onPageShow = (event: PageTransitionEvent): void => {
    if (event.persisted) onLock();
  };
  const onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') onLock();
  };
  const onPageHide = (): void => onLock();

  window.addEventListener('pageshow', onPageShow);
  window.addEventListener('pagehide', onPageHide);
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    window.removeEventListener('pageshow', onPageShow);
    window.removeEventListener('pagehide', onPageHide);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
```

`onLock` is the test seam and the purity seam: it is a plain callback, so the adapter owns the
events and the UI owns the transition. `pagehide` is included alongside `pageshow` because it is
the event that fires on the way *into* the bfcache — locking there means the restored page has
already been made safe before `pageshow` runs, which closes the window where a slow restore paints
the entry surface for a frame.

`onLock` must be a stable identity (`useCallback` with no changing deps) or the effect re-registers
on every render.

### The test seam — and the happy-dom trap, verified this session

`happy-dom@20.11.1` (confirmed installed) **does** expose `PageTransitionEvent` and **does**
dispatch a `pageshow` to a `window.addEventListener('pageshow', …)` handler. But:

```
new PageTransitionEvent('pageshow', { persisted: true }).persisted  →  undefined
```

**The init dictionary is not honoured.** A test written the obvious way silently exercises the
`persisted === false` branch, passes, and proves nothing — which is precisely the "easy to get
silently wrong" the ROADMAP flags.

**Verified working forms:**

```ts
// @vitest-environment happy-dom

// BFCACHE RESTORE — the init dict is NOT honoured by happy-dom; assign the property.
const restore = Object.assign(new Event('pageshow'), { persisted: true });
window.dispatchEvent(restore);        // handler sees persisted === true  ✓

// A NORMAL LOAD, which must NOT lock.
window.dispatchEvent(new Event('pageshow'));   // handler sees persisted === undefined  ✓

// TAB HIDE — visibilityState is a getter; defineProperty, then dispatch.
Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
document.dispatchEvent(new Event('visibilitychange'));   // handler fires  ✓
```

All four lines were executed against this repository's installed `happy-dom` this session and
behaved as annotated.

**Both polarities must be asserted.** A test that only fires the persisted event cannot tell a
correct guard from `if (true) onLock()`. Assert that a *non*-persisted `pageshow` leaves the entry
surface mounted — that is the assertion that proves `event.persisted` is actually read.

**The precedent for how to test the transition, not the listener:** `tests/adapters/tab-lock.test.ts:499`
drives `a.release()` then `a.claim()` directly and comments "The recovery is driven rather than
inspected". `installLifecycle` itself is untested by design. Phase 4 should do both — drive
`onLock` in a `node`-environment selector test, and fire real synthetic events in one
`happy-dom` adapter test that proves the wiring.

Confidence: **HIGH** — happy-dom behaviour measured, not recalled.

---

## The Action Family

### The six landing sites for a new action type — verbatim from `actions.ts:16-19`

> it lands in the same five places every type here does: constant, payload interface, `Intent`
> member, creator, structural guard — plus `buildLogEntry`'s arm in `import-guard.ts`, which is
> the sixth and the one a round trip fails silently without.

Concretely, per new type:

| # | Site | Example today |
|---|------|---------------|
| 1 | `export const X = 'ns/verb'` | `actions.ts:37-45` |
| 2 | `export interface XPayload { type: typeof X; … }` | `SwapMadePayload`, `actions.ts:255-266` |
| 3 | `Intent` union member | `actions.ts:305-315` |
| 4 | `XAction = XPayload & ActionEnvelope` | `actions.ts:317-325` |
| 5 | creator returning **payload only**, every field named, never a spread | `swapMade`, `actions.ts:451-471` |
| 6 | `isXAction(action): action is XAction` structural guard | `isSwapMadeAction`, `actions.ts:559-568` |
| 7 | `buildLogEntry` arm in `import-guard.ts:637-800`, rebuilt **field by field** | `swap/made` arm, `:733-778` |
| 8 | `apply` arm in `reduce.ts:142-334` | `SWAP_MADE`, `:260-303` |
| 9 | `canApply` arm in `reduce.ts:341-...` + a `RejectionReason` member at `:65-127` | `SWAP_MADE` |
| 10 | `DraftState` field in `model.ts:296-372` + `initialState` at `:445` | `swaps`, `passes` |

**The creator rule is a hard convention, stated twice** (`actions.ts:445-450`, `:473-478`): every
field named explicitly, never `...swap`. "A spread of the caller's object would type-check and
would silently carry whatever else that object held into a log entry."

**Arrays are copied element by element** in both the creator and `apply` — `scheduleCompiled`
(`actions.ts:390-401`) and `orderResolved` (`:432-434`) both state the reason: a payload that
aliased a component's array lets a later render mutate a log entry that has already been written.

### Recommended action types, strings and payloads

The type strings are written into saved documents and read back by later builds, which makes
them "closer to an API than to a label" (`model.ts:57-60`). They are irreversible. Recommended:

```ts
export const BANS_PLACED    = 'bans/placed';     // snake: one player, one ban, in the open
export const BANS_SUBMITTED = 'bans/submitted';  // blind: one player's whole allotment, sealed
export const BANS_REVEALED  = 'bans/revealed';   // blind: the reveal, attributed
```

```ts
/**
 * One snake ban, placed in the open — BAN-03, D-12, D-20.
 *
 * `pass` is 1-based and stamped at the edge from the serpentine selector, for the reason
 * `PickMadePayload.round` is: the pass must not be re-derived from log position after an
 * undo has removed something ahead of it.
 */
export interface BansPlacedPayload {
  type: typeof BANS_PLACED;
  playerId: string;
  monId: string;
  /** 1-based, matching the ban board's `Pass {n}` column headers. */
  pass: number;
}

/**
 * One player's whole blind allotment, sealed — BAN-04, D-06, D-07.
 *
 * Plaintext by D-06: the defence is the screen shield, not the file. Whole-allotment
 * rather than per-ban because the lock-in is one act and undo must walk back one act.
 */
export interface BansSubmittedPayload {
  type: typeof BANS_SUBMITTED;
  playerId: string;
  monIds: string[];
}

/**
 * The reveal, attributed — BAN-04, D-08, D-13.
 *
 * Materialized rather than derived, ARCHITECTURE Pattern 5 and `pool/built`'s argument:
 * the reveal is a host decision at a moment in time, and a document recording only the
 * submissions would let a later build decide for itself when the room saw them.
 */
export interface BansRevealedPayload {
  type: typeof BANS_REVEALED;
  bans: { playerId: string; monIds: string[] }[];
}
```

**Three payload-design notes, each with a source precedent:**

1. **`bans/submitted` carries the whole allotment, not one ban.** This is the *opposite* of
   `cards/played`'s per-card choice (`actions.ts:181-200`), and deliberately: D-05 forbids
   re-displaying a removed submission, so an undo must remove exactly one player's entry. Per-ban
   actions would make `Undo last move` remove one invisible ban out of two invisible bans, which
   is unnarratable.
2. **`bans/revealed` carries the attribution array rather than a flat set**, per D-13. Note this
   makes it *derivable* from the submissions — the same objection `ScheduleCompiledPayload`
   answers at `actions.ts:129-152` and `OrderResolvedPayload` at `:214-227`. The answer here is
   the same: the reveal is a host act at a point in the log, and a build that re-derived it would
   be free to disagree about which submissions were in it after an undo.
3. **No `duplicatePolicy` on any payload.** It is a config field (D-10), read from
   `state.config`, per `model.ts:158` — "everything decided before the first action and never
   changed afterwards".

### Structural guards — what they may and may not check

`isCardsPlayedAction`'s doc block (`actions.ts:534-542`) states the split and it applies verbatim:

> Types only — and the omission is the design rather than an oversight. … They live in `canApply`,
> which sees both. A guard that reached for the config would be a second authority on the same
> rules, free to disagree with the first.

So `isBansSubmittedAction` checks `typeof playerId === 'string'` and `isStringArray(monIds)`.
It does **not** check `monIds.length === config.bansPerPlayer` — that is `canApply`'s. It does
**not** check that the ids are in the roster — no roster is in reach of either, which is the
`swap/made` lesson at `actions.ts:26-33`.

`isBansRevealedAction` must validate a nested array-of-records. `buildRoundSpecs`
(`import-guard.ts:422`) is the shape to copy.

### `canApply` arms and new `RejectionReason` members

`RejectionReason` at `reduce.ts:65-127` is an ordered union with a `/** */` line per member. Add:

| Reason | Fires when |
|--------|-----------|
| `banStageNotRunning` | mode is `hostBanlist`, or the reveal has already happened |
| `notYourBanTurn` | `playerId` is not the serpentine/progress selector's answer |
| `alreadySubmitted` | a second `bans/submitted` for one player |
| `wrongBanCount` | `monIds.length !== config.bansPerPlayer` |
| `duplicateBanIds` | `new Set(monIds).size !== monIds.length` — mirrors `duplicatePoolIds` at `:347` |
| `banAlreadyPlaced` | snake only: the species is already publicly banned (D-20) |
| `bansNotComplete` | `bans/revealed` before every player has submitted |
| `bansAlreadyRevealed` | a second `bans/revealed` — mirrors `poolAlreadyBuilt` |

**`notInPool` has no analogue and must not be borrowed.** The ban stage has no pool.

**One reason for several situations is the established posture** when a host could not act
differently on the difference — `nothingToSwap` (`:104-113`) and `notSwapRound` (`:119-127`)
both say so. Consider collapsing `wrongBanCount` and `duplicateBanIds` into one
`malformedBanSubmission` if the copy would be identical; keep them apart if it would not.

### `DraftState` additions

Two arrays, siblings, never a `Record` keyed by `playerId`. `CardPlay`'s doc block
(`model.ts:311-323`) and `swaps`/`passes` (`:331-371`) both give the reason: sync rule 14 forbids
deriving anything order-sensitive from a key set, and the ban stage's turn order is nothing but
order.

```ts
/** Snake bans, in log order, from `bans/placed`. `[]` outside snake. */
banPlacements: BanPlacement[];   // { playerId, monId, pass, seq }
/** Blind submissions, in log order, from `bans/submitted`. `[]` outside blind. */
banSubmissions: BanSubmission[]; // { playerId, monIds, seq }
/** The reveal, from `bans/revealed`. `null` until it lands. */
bansRevealed: { playerId: string; monIds: string[] }[] | null;
```

`seq` comes **off the envelope, never off the array's length** — `reduce.ts:297` and `:322` both
carry that comment, and CLAUDE.md §`seq` states why: the log may legally have gaps.

**Nothing derived is stored.** The collision set, the public-ban set, whose turn it is, the pass
number and the progress counts are all selectors.

### Selectors — the named neighbours

`selectCardTurn` is at **`src/core/selectors.ts:464`**; `selectStartingOrder` at **`:810`**;
`selectPhase` at **`:733`**. Recommended additions, in that file:

| Selector | Signature | Neighbour it copies |
|----------|-----------|---------------------|
| `selectBanOrder(order, bansPerPlayer)` | `(readonly string[], number) => string[]` | `selectStartingOrder` — free function over primitives |
| `selectBanTurn(state)` | `=> { playerId, pass, index } \| null` | `selectCardTurn` (`:464`) |
| `selectBanStageState(state)` | `=> 'snake' \| 'blindLocked' \| 'blindEntry' \| 'reveal' \| 'notRunning'` | `selectPhase` (`:733`) — **the one place the mode is decided; components branch, never compute** |
| `selectPublicBanIds(state)` | `=> string[]` | — (Discretion 2's table) |
| `selectBanCollisions(state)` | `=> { monId, playerIds: string[] }[]` | — |
| `selectSubmittedPlayerIds(state)` | `=> string[]` | `selectCardsPlayedThisRound` (`:430`) |

Every one returns freshly built records, never a reference into `state` — the rule stated at
`selectors.ts` for `selectCardsPlayedThisRound` (`:426-428`).

Confidence: **HIGH** for the sites and precedents; the specific type strings and payload shapes
are **[ASSUMED]** recommendations — they are irreversible once a document is saved and should be
confirmed at plan-check.

---

## Serpentine Order Derivation (D-12)

**Where it belongs:** `src/core/selectors.ts`, beside `selectStartingOrder` (`:810`). There is
**no existing serpentine anywhere in the codebase** — grep for `snake|serpentine|reverse()` across
`src/core` and `src/ui` returns only the `BanMode` string literal, `import-guard.ts:279`'s
`BAN_MODES`, `ConfigScreen.tsx:278`'s disabled label, and `selectSwapRoundOrder`'s single
`[...].reverse()` at `selectors.ts:577`. This is new code.

**What its neighbours look like** — `selectCardPlayOrder` (`:402-422`) is the closest, and two of
its habits transfer:

1. **Guard the empty order first:** `if (playerCount === 0) return [];`
2. **Skip an `undefined` indexed read rather than asserting** — `noUncheckedIndexedAccess` is on,
   so every `order[i]` is `string | undefined`.

`selectSwapRoundOrder` (`:575-578`) also records the trap worth inheriting: `reverse()` mutates
in place, so it copies first.

**Recommended shape — a free function over primitives, matching `selectStartingOrder`:**

```ts
/**
 * The serpentine ban order — D-12. `1→2→3→4`, then `4→3→2→1`, repeating.
 *
 * A free function over the resolved order and a count, matching `selectStartingOrder`
 * rather than the state-shaped selectors, because it depends on nothing else in the fold.
 * The state-shaped `selectBanTurn` composes it rather than re-deriving it, so the board's
 * columns and the turn banner cannot come to different conclusions about whose turn it is.
 *
 * Length is exactly `order.length × bansPerPlayer`. A zero or negative count yields `[]`
 * rather than throwing, for the reason `selectRoundKind` answers out of range: this runs
 * while rendering.
 */
export function selectBanOrder(
  order: readonly string[],
  bansPerPlayer: number,
): string[] {
  if (order.length === 0 || bansPerPlayer <= 0) return [];

  const sequence: string[] = [];
  for (let pass = 0; pass < bansPerPlayer; pass++) {
    const leg = pass % 2 === 0 ? order : [...order].reverse();
    for (const playerId of leg) sequence.push(playerId);
  }
  return sequence;
}
```

**The pass number is a column, not a round.** `04-UI-SPEC` §6 makes `pass` the vocabulary and
gives the reason: `Round` is taken by the draft's own rounds and by the board's `R{n}` header,
and two meanings for one word on a shared screen is how a room ends up arguing about which round
it is. In a true serpentine each player bans exactly once per pass, so
`pass = Math.floor(index / order.length) + 1`.

**Tests to pin, all `node` environment, zero mocks:**

- 4 players × 2 → `[p1,p2,p3,p4, p4,p3,p2,p1]`
- 4 players × 1 → `[p1,p2,p3,p4]` (no reversal on a single pass)
- 4 players × 3 → third pass returns to forward order
- 2 players × 3 → `[a,b, b,a, a,b]`
- length is always `order.length × bansPerPlayer`
- every player appears exactly `bansPerPlayer` times
- `bansPerPlayer = 0` and a negative → `[]`
- **the input array is not mutated** — the `reverse()` trap, and the reason `selectSwapRoundOrder`
  copies first

Confidence: **HIGH**.

---

## The Disabled-Member Pattern (D-19)

**The shipped constant, verbatim, `src/ui/screens/ConfigScreen.tsx:275-279`:**

```ts
const BAN_MODE_OPTIONS: readonly SegmentedOption<BanMode>[] = [
  { value: 'hostBanlist', label: 'Host banlist' },
  { value: 'blind', label: 'Blind — Not yet available', disabled: true },
  { value: 'snake', label: 'Snake — Not yet available', disabled: true },
];
```

Line numbers: `275` is the `const`, `276` is `hostBanlist`, **`277` is `blind`, `278` is
`snake`**, `279` is `];`. `04-CONTEXT` cites `275-278` and `04-UI-SPEC` cites `277-278`; both
land on the right lines. The label form is **`{Option} — Not yet available`, capital `N`.**

**The mechanism, `src/ui/components/SegmentedControl.tsx:29-33` and `:74-92`:**

- `SegmentedOption<T>` is `{ value: T; label: string; disabled?: boolean }` — the disabled flag
  is per option and already ships.
- The component applies **both** `disabled={isDisabled}` and
  `aria-disabled={isDisabled ? 'true' : undefined}`, with the reason stated in a comment at
  `:74-80`: "`disabled` is what actually refuses the click; `aria-disabled` is what survives the
  styling … A caller that wants a visible suffix such as `— Not yet available` puts it in
  `label`; **this component does not synthesize copy**."
- `ConfigScreen.tsx:256-267` records why this is deliberately *unlike* `FeasibilityBar`'s
  `Start draft`, which carries the ARIA state alone so it stays focusable: "Do not 'fix' either
  of them into agreement with the other." A static reason inside the option's own accessible name
  can be natively disabled; a computed reason in a separate status element cannot.

**Phase 4's two changes, both one-line:**

```ts
{ value: 'blind', label: 'Blind' },
{ value: 'snake', label: 'Snake' },
```

**and one new instance, not a new component:**

```ts
const DUPLICATE_POLICY_OPTIONS: readonly SegmentedOption<DuplicateBanPolicy>[] = [
  { value: 'bothApply', label: 'Both apply, one is spent' },
  { value: 'reBan', label: 'Re-ban — Not yet available', disabled: true },
];
```

**`name` is required and must be unique** (`SegmentedControl.tsx:41-51`): "Two controls sharing
one name merge into a single radio group". The duplicate-policy control mounts on the same screen
as the ban-mode control and the dual-Mega controls, so it needs its own.

### The `04-UI-SPEC` / `04-CONTEXT` conflict — surfaced, not resolved

`04-UI-SPEC` §"A conflict in the upstream instructions" records it and I confirm the underlying
fact:

- **D-19 text:** `Re-ban — Not yet available` … "matching the established label form at
  `src/ui/screens/ConfigScreen.tsx:277-278`". D-19's rendering of the string in the CONTEXT
  document at line 156 uses capital `N`; the UI-SPEC reports having seen a lowercase `n` in the
  instructions it was given.
- **Shipped string at `:277`:** `'Blind — Not yet available'` — **capital `N`**, verified.
- **`04-UI-SPEC` specifies:** `Re-ban — Not yet available` — capital `N`, matching the shipped
  casing.

**Assessment: this is not a live planning blocker.** Both documents as they currently sit on disk
specify the same string, `Re-ban — Not yet available`, and it matches the shipped form.
`04-UI-SPEC`'s note is a record of an instruction-level ambiguity that has since resolved in
favour of the shipped casing. **Planning should use `Re-ban — Not yet available` verbatim and
should not raise a question about it.**

**A genuine `04-UI-SPEC` ↔ `04-CONTEXT` disagreement search was run and found none besides this
one.** The two documents agree on every locked decision, and `04-UI-SPEC`'s discretionary calls
(no review step, `Hide these bans`, pass-not-round, board-plus-disclosure, undo-the-reveal) all
sit inside constraints D-01…D-23 leave open rather than contradicting any of them.

### The BAN-07 scoring rule — restate in the plan and in VERIFICATION

`04-CONTEXT` D-19 and `04-UI-SPEC` §Deferred both require it, so this document does too:

> **BAN-07 is PARTIALLY satisfied.** The verifier must not score ROADMAP Phase 4 success
> criterion 4 green on the re-ban clause. The config-time control ships with `reBan` disabled so
> a later milestone enables an option rather than adding a control plus a schema bump.

Confidence: **HIGH**.

---

## Standard Stack

**No new libraries. No new versions. This section exists to record that the answer is "none".**

### Core (unchanged, verified in `package.json` this session)

| Library | Version | Purpose | Why standard |
|---------|---------|---------|--------------|
| `preact` | `10.29.8` (exact-pinned) | UI rendering | Locked by CLAUDE.md §Constraints |
| `@preact/signals` | `2.10.1` (exact-pinned) | Reactive state | Locked |

### Supporting (devDependencies, unchanged)

| Library | Version | Purpose | Phase-4 relevance |
|---------|---------|---------|-------------------|
| `vitest` | `4.1.10` (installed) | Test runner | Default env `node`; `happy-dom` opt-in per file |
| `happy-dom` | `20.11.1` (installed) | DOM for UI tests | **The bfcache test seam — see the trap in §BAN-06** |
| `typescript` | `~5.9` | Types | `noUncheckedIndexedAccess` is on |
| `vite` | `8.2.0` | Build | — |
| `@preact/preset-vite` | `2.10.6` | JSX | — |
| `pokemon-showdown` | `0.11.11` | Roster generation | Not touched by this phase |

### Alternatives Considered

| Instead of | Could use | Verdict |
|------------|-----------|---------|
| A hand-built shield screen state | a modal/overlay library | **Rejected — constraint violation.** Also wrong: a modal is dismissible by Escape, and the locked state is a destination |
| `bans/submitted` per ban | per-ban actions | **Rejected.** D-05 forbids re-displaying a removed submission; per-ban undo would remove one invisible ban of two |
| A bespoke post-reveal feasibility function | reuse `checkFeasibility` | **Reuse.** One authority; catches the pool-size branch for free |
| A ban mode inside the draft screen | a fourth `Screen` member | **Fourth member.** `selectPhase` returns `'cards'` for the ban stage otherwise |
| `history.pushState` + `popstate` for BAN-06 | `pageshow` + `persisted` | **Rejected by D-17**, and the codebase agrees: nothing touches `history` |

**Installation:** none. `npm run verify` is unchanged.

---

## Package Legitimacy Audit

**Not applicable — this phase installs zero packages.**

`CLAUDE.md` §Constraints pins runtime `dependencies` to exactly `preact` and `@preact/signals`,
both exact-pinned, and `package.json` was read this session to confirm it:
`{"@preact/signals":"2.10.1","preact":"10.29.8"}`. `04-UI-SPEC` §Design System restates it as a
hard constraint and §Registry Safety records that no component registry is in use and none may be.

No `slopcheck` run was performed because there is no candidate list to check. Should planning
ever propose a package, the gate must run first and the package must be argued against the
two-dependency constraint before the gate is even reached.

**Packages removed due to slopcheck `[SLOP]` verdict:** none — no packages proposed.
**Packages flagged as suspicious `[SUS]`:** none.

---

## Architecture Patterns

### System architecture — the ban stage's data flow

```
                    ┌──────────────────────────────────────────────────┐
  host input  ──▶   │  ConfigScreen                                     │
                    │   banMode ∈ {hostBanlist, blind, snake}           │
                    │   bansPerPlayer, duplicateBanPolicy               │
                    │   checkFeasibility( … , pessimistic q )  ◀────┐   │
                    └────────────┬──────────────────────┬──────────┼───┘
                                 │ hostBanlist          │ blind/snake  │
                                 ▼                      ▼          (blocks Start)
                    ┌────────────────────┐   ┌──────────────────────────┐
                    │ createTournament   │   │ createBanStage           │
                    │  pool/built        │   │  schedule/compiled       │
                    │  schedule/compiled │   │  draft/started           │
                    │  draft/started     │   └───────────┬──────────────┘
                    └─────────┬──────────┘               │
                              │                          ▼
                              │            ┌──────────────────────────────┐
                              │            │ Screen: 'bans'               │
                              │            │  selectBanStageState(state)  │
                              │            └───┬──────────────────┬───────┘
                              │        snake   │                  │  blind
                              │                ▼                  ▼
                              │   ┌────────────────────┐  ┌──────────────────┐
                              │   │ BanBoard public    │  │ BlindLocked      │◀──┐
                              │   │ PoolGrid (inert    │  │  progress only   │   │
                              │   │  = public bans)    │  └────────┬─────────┘   │
                              │   │  bans/placed  ─────┼───┐       │ tap         │
                              │   └────────────────────┘   │       ▼             │
                              │                            │  ┌──────────────┐   │
                              │                            │  │ BlindEntry   │   │
                              │                            │  │ full-screen  │───┘
                              │                            │  │ bans/submitted   lock-in ·
                              │                            │  └──────┬───────┘   Hide ·
                              │                            │         │  installBanShield:
                              │                            │         │  pageshow(persisted)
                              │                            │         │  visibilitychange→hidden
                              │                            ▼         ▼  pagehide
                              │                       ┌─────────────────────────┐
                              │                       │ bans/revealed  (host)   │
                              │                       ▼                         │
                              │            ┌────────────────────────────────────┴──┐
                              │            │ BanReveal                             │
                              │            │  attribution rows · collisions         │
                              │            │  checkFeasibility(host ∪ player bans)  │
                              │            │   blocked → Start inert, abandon only  │
                              │            └───────────────┬───────────────────────┘
                              │                            │ Start draft (D-23)
                              │                            ▼
                              │                      drawPool → pool/built
                              ▼                            │
                    ┌──────────────────────────────────────▼─────────┐
                    │ Screen: 'draft'  — poolIds populated in BOTH    │
                    │ paths by the time this screen mounts            │
                    └────────────────────────────────────────────────┘

  Undo (single stack, D-03) reaches every ban action and re-folds. It never reaches
  pool/built, schedule/compiled or draft/started — NEVER_UNDONE, undo.ts:107.
```

### Pattern 1 — Constraint upstream of the click, never validation after it

**What:** a surface renders an illegal option inert with a stated reason rather than accepting the
click and refusing the dispatch.

**When:** every ban surface in this phase — snake's already-banned cells, the typeahead's
already-banned options, `Lock in` before `{m}` are chosen, `Start draft` when RULE-08 blocks.

**Source precedent** — `selectCardOffer`, `src/core/selectors.ts:477-483`:

```ts
/**
 * This is the same shape `selectRoundEligibleIds` and `checkFeasibility` take: a pure
 * selector the EDGE consults BEFORE dispatching. The constraint belongs upstream of the
 * click, not in a rejection after it — a card the offer excludes renders inert with a
 * reason, so the deadlock CARD-04 otherwise creates is never entered rather than refused
 * on entry. `canApply`'s `cardNotPlayable` arm exists behind this as a backstop; if it
 * ever fires for a real host, the offer and the rule have disagreed and that is a bug.
 */
```

**Consequence for the plan:** the `canApply` arms in §The Action Family are **backstops**. Every
one of them should be unreachable from the UI, and a test that reaches one is testing the
imported-document path, not the host path.

### Pattern 2 — `aria-disabled`, never native `disabled`, for a computed reason

**What:** a control whose reason is computed and lives in a separate status element uses
`aria-disabled` + `aria-describedby` and stays focusable. A control whose reason is *static and
inside its own accessible name* may take both attributes.

**Why:** a natively disabled control is not focusable, so its reason is unreachable by keyboard.

**Source:** `ConfigScreen.tsx:256-267` states both halves and forbids unifying them.
`SegmentedControl.tsx:74-80` implements the static half.

**Phase-4 application:** `Start draft` at the reveal, every inert ban cell, every inert typeahead
option, and the not-yet-complete `Lock in` button all take `aria-disabled` alone. The one
exception is the duplicate-policy control's `reBan` member.

### Pattern 3 — Inert ARIA is always shed (WR-04)

Every inert state removes `aria-disabled` the moment its condition lifts: a publicly-banned cell
after an undo, the duplicate-policy control when the mode changes to `blind`, the `Lock in` button
once `{m}` are chosen, a typeahead option after an unban. `04-UI-SPEC` §Interaction records this
phase as adding four consumers.

### Pattern 4 — Ambient values stamped at the edge

`actions.ts:6-11`:

> The creators below return the PAYLOAD only. They do not stamp `seq`, `at` or `actorId` —
> `dispatch` does that at the impure edge, because a creator that reached for a clock would be an
> ambient read inside the core and `npm run check:pure` would fail the build for it.

`dispatch` (`store.ts:115-142`) allocates `seq` via `nextSeq(log)` = `max(seq) + 1`
(`store.ts:106-112`), **never `log.length`**, precisely so a removal from the middle cannot
reissue a live id.

### Pattern 5 — Externally derived results are materialized into the log

`pool/built` carries resolved ids plus `rosterVersion` and `checksum`. `bans/revealed` follows
the same rule: it carries the attributed lists, not an instruction to re-derive them.

### Anti-Patterns to Avoid

- **A stored ban count, a stored collision set, or a stored public-ban set.** All three are
  selectors. `DraftState`'s header (`model.ts:288-294`) forbids storing anything computable, and
  `selectHand`'s block (`selectors.ts:373-382`) gives the failure mode: "a stored one would be a
  second copy of a fact the log already asserts — free to drift after an undo".
- **Hiding the entry surface instead of unmounting it.** Keeps component state alive (violates
  D-18) and leaves `PoolGrid`'s announcement timers pending (violates S7). See Discretion 1.
- **Hoisting `TopBar`'s Ctrl+Z listener to `app.tsx`.** Puts a species-naming undo one keystroke
  from a shielded screen. See Discretion 3.
- **Animating the entry → locked transition.** `04-UI-SPEC` S9: "a leak measured in frames rather
  than a preference. This is the first hard motion prohibition in the project and it is a
  security property, not a taste."
- **Writing revealed bans back into `config.bans`.** D-14, hard architectural constraint; also
  `model.ts:158` states config immutability in as many words.
- **A `role="grid"` / `role="row"` / `role="gridcell"` on `BanBoard`.** `BoardGrid` does not
  invent them, and a second differently-shaped board would be a second accessibility model for
  one visual pattern (`04-UI-SPEC` §Interaction).
- **Wiring `use-roving-tabindex` into the progress board or the reveal.** Neither is a large
  uniform interactive set. Stated so it is not done out of habit.
- **A `No collisions` line.** Answers a question nobody asked, and in snake it is permanent noise.
- **Naming a core parameter `document`.** `check-pure-core.mjs` forbids the whole word.

---

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---------|-------------|-------------|-----|
| Displayed ban count | `bans.length`, `revealed.flatMap(...).length`, a stored counter | `bannedEntries(entries, ids).length` (`bans.ts:65`) | Dedupes, drops post-rotation strangers, and is pinned equal to `checkFeasibility.banCount` by test |
| Post-reveal feasibility | a Mega-only re-check | `checkFeasibility` with the union banlist | Catches the pool-size crash branch; every message already written and tested |
| A second confirm mechanism for ban undo | a bespoke dialog | `UndoRemoval['kind']` → `RoundBoundaryCrossing.kind` → `ConfirmDialog` (`app.tsx:1538-1560`) | The discriminant already flows end to end |
| A second undo stack for the ban stage | anything | `undo.ts`'s single stack | D-03; and `undoLast` re-folds rather than reversing |
| `seq` allocation | `log.length` | `nextSeq` (`store.ts:106`) | Gaps are legal; a length-derived seq collides |
| Turn/pass/progress arithmetic in a component | inline `useMemo` | selectors in `src/core/selectors.ts` | `04-UI-SPEC` §Pure-core boundary; `check:pure` |
| A ban-mode `PoolGrid` clone | a second grid component | `PoolGrid` with `bannedIds` + `idPrefix` | Ships; two grids on one screen already work (Phase 3) |
| A ban board | a new grid | `BoardGrid`'s geometry + `--board-label-w` (`BoardGrid.css:54`) | Reuses the density and `MonChip` rules verbatim |
| `bansPerPlayer` bounds | an ad-hoc clamp | `MAX_BANS_PER_PLAYER` beside `MAX_SWAP_BUDGET` (`import-guard.ts:141`) | `feasibility.ts:60-67`: gate and guard must be one number or the build creates unopenable documents |
| Schema-version comparison | `doc.schemaVersion === SCHEMA_VERSION` anywhere | `migrate` / `SUPPORTED_SCHEMA_VERSIONS` | `model.ts:39-44` names all three call sites and forbids a fourth authority |
| A v3 default table in `import-guard` | inline literals | `V3_CONFIG_DEFAULTS` exported from `migrate.ts` | `migrate.ts:78-81`: two copies is two tables that can disagree |
| A `bfcache` polyfill or `history` shim | anything | `pageshow` + `event.persisted` | D-17; the app deliberately has no router |

**Key insight:** in this codebase the expensive mistake is never a missing library — it is a
*second authority* on a fact the codebase already has one authority for. Every row above is that
same failure wearing a different hat.

---

## Runtime State Inventory

Phase 4 is not a rename, refactor or migration phase in the string-replacement sense, but it
**does** perform a schema migration, so the inventory is answered rather than omitted.

| Category | Items found | Action required |
|----------|-------------|------------------|
| **Stored data** | `localStorage` key `STORAGE_KEY` holds `{ schemaVersion, generation, savedAt, doc }`. Existing records are wrapper-version **3**. The wrapper version is compared at `persistence.ts:261-263` against `SUPPORTED_SCHEMA_VERSIONS`, **before** `isValidTournament`. | **Code edit only** — add `4` to `SUPPORTED_SCHEMA_VERSIONS` (`migrate.ts:48`) and add `migrateV3ToV4`. **No data migration**: existing records are upgraded on read and rewritten on the next autosave. Add the `describe('a draft saved by Phase 3')` resume test (§Discretion 6) |
| **Live service config** | None. Static site, no external service holds tournament state. Verified: no service configuration outside the repo — the only external surface is GitHub Pages, which serves `dist/`. | None |
| **OS-registered state** | None. No scheduled task, no daemon, no process manager. | None |
| **Secrets / env vars** | None. No `.env`, no secret store, no CI secret beyond the GitHub Pages deploy token, which is unrelated to schema. | None |
| **Build artifacts** | `public/data/` roster snapshots and `public/sprites/` are regenerated only by `npm run build:data`, which this phase does not run. `public/sw.js` precaches by **content hash** injected by `scripts/build-sw-manifest.mjs` after `vite build`, so a returning visitor gets the new bundle. Exported tournament **JSON files** already in a host's Downloads folder are schema 3. | **None for the build.** Exported schema-3 JSON files remain importable — `parseTournamentFile` → `migrate` upgrades them (`import-guard.ts:946`). This must be covered by a test, not assumed |

---

## Common Pitfalls

### Pitfall 1 — The `undoAnnouncement` fall-through speaks a private ban

**What goes wrong:** a new `UndoRemoval.kind` is added without a matching arm in
`undoAnnouncement`; execution falls through to `store.ts:446` and the live region announces
`Undid Round 1 — Garchomp is back in the pool.` while the shield is up.
**Why it happens:** the function is a chain of `if` statements ending in an unguarded `return`,
so the omission compiles, type-checks and passes every existing test.
**How to avoid:** convert the tail to an exhaustive `switch` with a `const exhaustive: never`
default. Then keep `monId: null` on every ban `UndoRemoval` so there is no name to interpolate
even if the guard is later weakened.
**Warning signs:** a `UndoRemoval['kind']` union that has more members than `undoAnnouncement`
has arms. Greppable.

### Pitfall 2 — `Start draft` throws instead of blocking

**What goes wrong:** `drawPool` raises a `RangeError` at the reveal because `poolSize` exceeds the
post-player-ban candidate count.
**Why it happens:** D-21's pessimistic gate covers only the Mega arithmetic, and `drawPool`
deliberately does not clamp (`draw.ts:108-112`).
**How to avoid:** extend `poolTooLarge` and `tooManyPlayersForRoster` with the `q` term at config
time, **and** run the full `checkFeasibility` at the reveal.
**Warning signs:** a plan that mentions `notEnoughMegas` and no other feasibility code.

### Pitfall 3 — The bfcache test proves nothing

**What goes wrong:** `new PageTransitionEvent('pageshow', { persisted: true })` yields
`persisted === undefined` under `happy-dom@20.11.1` (measured this session). The test dispatches,
the guard reads `undefined` as falsy, nothing locks — and if the test asserts only "the entry
surface is not visible" against a fixture that never mounted it, it passes.
**How to avoid:** `Object.assign(new Event('pageshow'), { persisted: true })`, and assert **both
polarities** — a non-persisted `pageshow` must leave the entry surface mounted.
**Warning signs:** a bfcache test with only one `dispatchEvent`.

### Pitfall 4 — `selectPhase` returns `'cards'` during the ban stage

**What goes wrong:** after D-11's reorder, `order` is non-empty and `schedule` is non-empty, so
`selectDealsCards` is true and round 1 is unresolved — `selectPhase` answers `'cards'` and the
card panel becomes live on a screen with no pool.
**How to avoid:** a fourth `Screen` union member, so the draft screen's `selectPhase` branch is
never evaluated during the ban stage.
**Warning signs:** any plan that describes the ban stage as "a mode inside the draft screen"
without naming `selectPhase`.

### Pitfall 5 — The wrapper-version site is remembered but its test is not

**What goes wrong:** `SUPPORTED_SCHEMA_VERSIONS` gets `4`, everything passes, and no test proves
a **schema-3** save still resumes. The failure is invisible to every import-only test and shows up
as `Resume saved draft` silently never appearing.
**How to avoid:** copy `tests/adapters/persistence.test.ts:524`'s `describe('a draft saved by
Phase 2')` block for Phase 3, with a `v3Record()` wrapper helper.
**Warning signs:** a migration task whose tests all live in `tests/core/migrate.test.ts`.

### Pitfall 6 — The `Bans (N)` disclosure leaks the whole banlist

**What goes wrong:** `TopBar.tsx:209-217` renders every banned name behind a `<summary>` anyone
can open with one click. Left unchanged in blind mode, it exposes every submitted ban before the
reveal.
**How to avoid:** Amendment 1's `selectPublicBanIds(state)` and nothing else.
**Warning signs:** a plan that touches the ban stage and never mentions `TopBar`.

### Pitfall 7 — A field is added to a payload and silently dropped on round trip

**What goes wrong:** `buildLogEntry` rebuilds payloads **field by field**. A field added to the
interface, the creator and the guard but not to the `import-guard.ts` arm survives in memory,
survives an autosave, and disappears the moment the document is exported and re-imported.
**How to avoid:** four sites for a field, six for a type. `swap/made`'s `swapRound` is the worked
warning at `import-guard.ts:738-743` and `actions.ts:249-254`.
**Warning signs:** a plan task that names three of the four sites.

### Pitfall 8 — A ban action reaches `NEVER_UNDONE`'s blind spot

**What goes wrong:** `isUndoable` is a deny-list **plus** an allow-list (`undo.ts:135-144`). A new
ban action added only to the deny-list reasoning, or added to neither, makes `Undo last move` step
*past* it to whatever is below — which during the ban stage is `draft/started`, correctly refused,
so undo silently does nothing.
**How to avoid:** add the ban guards to the allow-list at `undo.ts:137-142`, and re-read the
`NEVER_UNDONE` invariant comment at `:114-117`, which reasons about a `pool/built` that is no
longer first.

### Pitfall 9 — Copy composed in two places

**What goes wrong:** the `notEnoughMegas` string exists in two arms (host vs blind/snake) and
drifts.
**How to avoid:** one composer function, and a test pinning the `hostBanlist` arm byte-identical
to Phase 3's shipped string. `04-UI-SPEC` §2 requires exactly this; `banAnnouncement`
(`ConfigScreen.tsx:294-303`) and `notEnoughMegasMessage` (`feasibility.ts:341`) are the
precedents.

---

## Code Examples

### Mode-conditional guard relaxation (D-11)

```ts
// src/core/reduce.ts — canApply
case DRAFT_STARTED: {
  if (!isDraftStartedAction(action)) return reject('malformedPayload');

  // The pool precedes the order only in host-banlist mode (D-01, D-11). Blind and snake
  // resolve the order FIRST so the ban stage can read it, and draw the pool after the
  // reveal (D-23) — which is what makes DRFT-16's randomizer the single source of turn
  // order for bans and picks alike. Conditioned rather than deleted, so the mode Phase 2
  // verified keeps byte-for-byte the same rule.
  if (state.config.banMode === 'hostBanlist' && state.poolIds.length === 0) {
    return reject('poolNotBuilt');
  }

  if (state.schedule.length === 0) return reject('scheduleNotCompiled');
  if (state.order.length > 0) return reject('draftAlreadyStarted');
  // … unchanged player-set checks
}
```

### The exhaustive undo announcement (Pitfall 1)

```ts
// src/store.ts
function undoAnnouncement(
  removed: UndoRemoval,
  playerName: string,
  resolveSpeciesName?: (monId: string) => string,
): string {
  const speciesName = (monId: string | null): string =>
    resolveSpeciesName?.(monId ?? '') ?? (monId ?? '');

  switch (removed.kind) {
    case 'card':
      return `Undid ${playerName}'s card — ${removed.cardValue} is back in their hand.`;
    case 'order':
      return `Undid round ${removed.round}'s pick order — ${playerName}'s ${removed.cardValue} is back in their hand.`;
    case 'swap':
      return `Undid the swap — ${speciesName(removed.monId)} is back in the pool and ${speciesName(removed.outMonId)} returns to ${playerName}'s round ${removed.round} slot.`;
    case 'pass':
      return `Undid ${playerName}'s pass in swap round ${removed.swapRound}.`;

    // NAMES NO SPECIES, and that is a secrecy property rather than a copy preference —
    // D-05 forbids re-displaying a removed blind submission, and the live region is a
    // channel the visual shield does not cover.
    case 'banSubmission':
      return `${playerName}'s bans were removed.`;
    case 'banReveal':
      return `Undid the reveal. The bans are recorded and not shown.`;
    case 'banPlaced':
      return `Undid ${playerName}'s ban — ${speciesName(removed.monId)} can be banned again.`;

    case 'pick':
      return `Undid Round ${removed.round} — ${speciesName(removed.monId)} is back in the pool.`;

    default: {
      // A new kind with no arm is a COMPILE error rather than a species name spoken into
      // a room. This default is the whole reason the chain of `if`s became a switch.
      const exhaustive: never = removed.kind;
      return exhaustive;
    }
  }
}
```

### The bfcache test that actually tests something

```ts
// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installBanShield } from '../../src/adapters/ban-shield';

describe('the blind entry shield — BAN-06, D-17, D-18', () => {
  let locked: number;
  let teardown: () => void;

  beforeEach(() => {
    locked = 0;
    teardown = installBanShield(() => { locked += 1; });
  });

  afterEach(() => {
    teardown();
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
  });

  it('locks on a bfcache restore', () => {
    // `new PageTransitionEvent('pageshow', { persisted: true })` does NOT carry the flag
    // under happy-dom 20 — the init dict is ignored and `persisted` reads `undefined`.
    // A test written that way exercises the false branch and passes while proving nothing.
    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    expect(locked).toBe(1);
  });

  it('does NOT lock on an ordinary load', () => {
    // The polarity that proves `event.persisted` is actually read. Without it, a guard of
    // `if (true) onLock()` passes the test above.
    window.dispatchEvent(new Event('pageshow'));
    expect(locked).toBe(0);
  });

  it('locks when the tab is hidden — the host alt-tabs to Discord', () => {
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(locked).toBe(1);
  });

  it('stops listening once the entry surface unmounts', () => {
    teardown();
    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    expect(locked).toBe(0);
  });
});
```

### The v3 → v4 migration arm

```ts
// src/core/migrate.ts

/**
 * What every version 4 config field is worth in a version 3 document.
 *
 * Same contract as {@link V2_CONFIG_DEFAULTS}: one place, imported by
 * `import-guard.buildConfig` rather than repeated.
 *
 * `bansPerPlayer: 0` is LOSSLESS rather than a guess. A schema 3 document was necessarily
 * `hostBanlist` — blind and snake shipped disabled at `ConfigScreen.tsx:277-278` — so zero
 * player bans is the true answer the document is already implying. It is deliberately a
 * DIFFERENT number from the config screen's default of 1, which answers the different
 * question of what a host who has just chosen blind should see. Do not unify them.
 */
export const V3_CONFIG_DEFAULTS = {
  bansPerPlayer: 0,
  duplicateBanPolicy: 'bothApply',
} as const;

/**
 * Version 3 to version 4. Config only.
 *
 * The log is passed through unchanged, entry for entry, for {@link migrateV2ToV3}'s reason:
 * nothing in schema 4 makes an existing entry unfoldable, and splicing a synthetic ban
 * action in would need a fresh `seq` and would therefore be stamped after actions it
 * logically precedes.
 *
 * Never mutates its argument. Every object it returns is a fresh literal.
 */
function migrateV3ToV4(doc: V3Doc): TournamentDoc {
  const { config } = doc;

  return {
    schemaVersion: 4,
    id: doc.id,
    createdAt: doc.createdAt,
    config: {
      ...config,
      players: config.players.map((player) => ({ id: player.id, name: player.name })),
      bans: config.bans.map((id) => id),
      dualMegaChoices: config.dualMegaChoices.map((choice) => ({
        speciesId: choice.speciesId,
        forme: choice.forme,
      })),
      rules: config.rules.map((rule) => ({ kind: rule.kind, count: rule.count })),
      megaFormeBans: config.megaFormeBans.map((id) => id),
      bansPerPlayer: V3_CONFIG_DEFAULTS.bansPerPlayer,
      duplicateBanPolicy: V3_CONFIG_DEFAULTS.duplicateBanPolicy,
    },
    rng: { seed: doc.rng.seed, cursor: doc.rng.cursor },
    log: [...doc.log],
  };
}
```

The chain at `migrate.ts:265-268` gains one line and every arm shifts by one:

```ts
if (version === 4) return { ok: true, doc };
if (version === 3) return { ok: true, doc: migrateV3ToV4(doc) };
if (version === 2) return { ok: true, doc: migrateV3ToV4(migrateV2ToV3(doc)) };
if (version === 1) return { ok: true, doc: migrateV3ToV4(migrateV2ToV3(migrateV1ToV2(doc))) };
```

---

## State of the Art

Not applicable in the usual sense — no external technology is adopted. The relevant "state of the
art" is the repository's own, and it moved twice since the documents this phase inherits:

| Old (as documented) | Current (verified this session) | Impact |
|---------------------|--------------------------------|--------|
| `STATE.md` decision 4: three schema sites at `store.ts:212`, `persistence.ts:222`, `import-guard.ts:444` | `store.ts:286`, `persistence.ts:261-263` + `:299`, `import-guard.ts:903` **and** `:946` | Four `migrate` calls across three modules; every cited line number is stale |
| `04-CONTEXT` D-11: "a doc-comment and structural-guard change" | Two `canApply` arms + one `NEVER_UNDONE` invariant + a `selectPhase` consequence + four doc-comments | Right in kind, understated in extent |
| `04-UI-SPEC` §7: the RULE-08 blocked state "is reachable only from an imported or hand-edited document" | True **only after** the pool-size term is added to the pessimistic gate. Today the config flow can reach a `RangeError` | The claim becomes true; it is not true yet |
| `04-UI-SPEC` S1: "the entry surface does not import `announce`" | Necessary and insufficient — `store.ts:394` announces from outside the surface | Add the exhaustive-`never` guard |

**Deprecated / outdated in the inherited documents:**

- Every `schemaVersion` line number in `04-CONTEXT.md` §Claude's Discretion and `STATE.md`
  decision 4. Corrected in §Discretion 6.
- `04-CONTEXT` §Code Insights cites `ConfigScreen.tsx:275-278` and `04-UI-SPEC` cites `:277-278`
  for `BAN_MODE_OPTIONS`. Both are right; the const spans `:275-279`.
- `tab-lock.ts:624-636` is cited by both documents for the `pageshow` handler. The handler body
  is at `:624-632` and the teardown at `:634-637`; the whole `installLifecycle` is `:621-637`.

---

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|-------|---------|---------------|
| A1 | Action type strings `bans/placed`, `bans/submitted`, `bans/revealed` | §The Action Family | **Irreversible once a document is saved** — `model.ts:57-60` calls these "closer to an API than to a label". Confirm at plan-check |
| A2 | Config field names `bansPerPlayer`, `duplicateBanPolicy`; policy value `'bothApply'` | §Discretion 6, §Action Family | Same irreversibility; `bansPerPlayer` is fixed by D-10, the policy field name is not |
| A3 | `MAX_BANS_PER_PLAYER = 24` (matching `MAX_SWAP_BUDGET`) | §Discretion 6 | Too low blocks a legitimate configuration; `04-UI-SPEC` §1 independently specifies 24 |
| A4 | `{y}` in the blind/snake `notEnoughMegas` string is `max(0, megaEligibleLegalCount − q)` | §Feasibility Extension | A sentence that is false as written, or a negative number on a shared screen |
| A5 | The ban stage is a fourth `Screen` union member rather than a draft-screen mode | §D-11 Reorder | D-02 leaves it open. Wrong choice means shielding five selectors instead of adding one union member |
| A6 | `selectBanStageState` returns the five-member string union proposed | §Action Family | Naming only; the requirement (one place decides) is fixed by `04-UI-SPEC` |
| A7 | The `04-UI-SPEC` / D-19 label-casing conflict is already resolved in favour of `Re-ban — Not yet available` | §Disabled-Member Pattern | A one-token copy change if the owner disagrees. Both documents on disk now agree |
| A8 | `RejectionReason` members `banStageNotRunning`, `notYourBanTurn`, `alreadySubmitted`, `wrongBanCount`, `duplicateBanIds`, `banAlreadyPlaced`, `bansNotComplete`, `bansAlreadyRevealed` | §Action Family | `reduce.ts:62-64` calls these "closer to an API than to a log message" — import and undo branch on them |
| A9 | `installBanShield` also listens on `pagehide`, beyond D-17/D-18's two events | §BAN-06 | Extra safety; the only cost is an extra lock on a departure that was leaving anyway |
| A10 | Every arc-minute figure in `04-UI-SPEC` §DRFT-14 extends a passing physical check rather than needing a new one | §Discretion 5 | The mandatory item-4 physical pass is what falsifies it. Do not treat it as done |

---

## Open Questions

1. **Does snake need its own action type, or can it reuse `bans/submitted` with a single-element
   `monIds`?**
   - What we know: snake places one ban at a time in the open; blind submits an allotment sealed.
     Undo semantics differ (snake's is visible and does not confirm; blind's is invisible and
     does, per `04-UI-SPEC` §8).
   - What's unclear: whether one action with a discriminating field is cleaner than two types.
   - **Recommendation: two types.** `swap/made` vs `swap/passed` is the precedent
     (`model.ts:352-362`): "they are not the same event and a shared array would have to say
     which, through a null field or a `kind` discriminant, and every reader would then have to
     filter before it could count." A shared type would also force one `UndoRemoval.kind` for two
     different confirm behaviours.

2. **Where does the pool draw live for blind/snake — in `store.ts` or at the `BanReveal` call
   site?**
   - What we know: `drawPool` is pure; the seed is ambient and must be stamped at the edge;
     `ConfigScreen` currently owns the draw and passes results to `createTournament`.
   - What's unclear: whether `BanReveal` should call `drawPool` directly or a `store.ts` helper.
   - **Recommendation: a `store.ts` sibling** — `drawPoolForBanStage(entries, spriteMeta)` — that
     rolls the seed with `newSeed()` and dispatches `pool/built`. Keeps `newSeed` out of a
     component and matches `createTournament`'s "the results handed in are the ones already on
     screen" posture, since the reveal has already shown the arithmetic.

3. **Does the reveal need a re-roll, like the config screen's pool re-roll?**
   - What we know: `REROLL_POOL_CONFIRM` exists (`confirm-copy.ts:88-98`) and the config screen
     offers it; `PoolBuiltPayload`'s doc block (`actions.ts:73-78`) states a re-roll "emits a NEW
     `pool/built` with a new seed", but `canApply(POOL_BUILT)` rejects `poolAlreadyBuilt` — so no
     second `pool/built` is currently possible in a live document.
   - **Recommendation: no.** D-23 gives exactly one draw, after the reveal, and the group has
     already read the reveal. Adding a re-roll here would mean loosening `poolAlreadyBuilt`,
     which is a Phase-5 conversation.

4. **Is `duplicateBanPolicy` read by anything this phase?**
   - What we know: D-19 builds only `bothApply`; D-20 makes the control inert in snake.
   - What's unclear: whether the reducer should assert the value at all.
   - **Recommendation: store it, read it nowhere, guard its value in `import-guard.buildConfig`
     against a `DUPLICATE_BAN_POLICIES` union.** This is exactly `depth`'s posture
     (`model.ts:73-79`: "Phase 2 only records this. Phase 5 is what consumes it") and
     `dualMegaChoices`' at `ConfigScreen.tsx:1088-1091`.

---

## Environment Availability

| Dependency | Required by | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node | build, tests, `check:pure` | ✓ | v24.15.0 | — |
| npm | scripts | ✓ | 11.12.1 | — |
| `happy-dom` | the BAN-06 bfcache tests | ✓ | 20.11.1 (installed) | none needed — `PageTransitionEvent` and `visibilitychange` both usable, with the caveats in §BAN-06 |
| `vitest` | `npm run test` | ✓ | 4.1.10 (installed) | — |
| `preact` / `@preact/signals` | runtime | ✓ | 10.29.8 / 2.10.1 (exact-pinned) | — |
| `pokemon-showdown` | `npm run build:data` only | ✓ | 0.11.11 (devDependency) | not invoked by this phase |
| A ~24" 1080p screen and 3 metres of floor | the mandatory DRFT-14 physical pass | **human-dependent** | — | **None. `04-UI-SPEC` §DRFT-14 item 4 is explicitly "mandatory and not substitutable"** |

**Missing dependencies with no fallback:** the physical three-metre pass, which is a human step
and must be a `checkpoint:human-verify` task in the plan rather than an automated assertion. It
doubles as the secrecy check (item 4a-d), so it also gates BAN-05 and BAN-06 acceptance.

**Missing dependencies with fallback:** none.

---

## Validation Architecture

**Skipped.** `.planning/config.json` sets `workflow.nyquist_validation: false`, read this session.

The test conventions that *do* apply are in §Project Constraints and are summarised here for the
planner because they are load-bearing rather than stylistic:

- Default environment is `node`. Core cannot reach a DOM by accident. Every ban selector,
  reducer, migration and feasibility test is `node`.
- A UI or adapter test opts in with `// @vitest-environment happy-dom` as the **first line** of
  the file (see `tests/ui/ban-mode.test.tsx:1`).
- A test touching `announce` resets it in `beforeEach` — it is a module-level signal that outlives
  any render. `04-UI-SPEC` restates this because Phase 4 adds six announcements.
- `tests/core/**` mirrors `src/core/**` and runs with **zero mocks**.

---

## Security Domain

The threat model here is unusual and worth stating plainly: **the adversary is the room**, not the
network. There is no server, no auth, no session and no transport. Most ASVS categories are
genuinely not applicable, and saying so is more useful than inventing coverage.

### Applicable ASVS categories

| ASVS category | Applies | Standard control in this codebase |
|---------------|---------|-----------------------------------|
| V2 Authentication | no | No accounts, no identities. D-04 explicitly removes the identity handshake |
| V3 Session Management | no | No sessions. The tab-ownership lock is a concurrency control, not a session |
| V4 Access Control | **partially** | The `inert` shell gate (`app.tsx:1896-1900`) is the only access boundary — read-only tabs. **The ban stage must land inside it**, and the entry surface is unreachable from a read-only tab because its only route is a control inside the gate |
| V5 Input Validation | **yes** | `import-guard.ts` — allow-list rebuild, poison-key refusal (`__proto__`, `constructor`, `prototype`), `MAX_*` allocation bounds, `buildLogEntry` field-by-field. `bansPerPlayer` and `duplicateBanPolicy` must both be bounded and union-checked there |
| V6 Cryptography | **no, and deliberately so** | D-06 rejected a commit-then-reveal hash scheme: `crypto.subtle` is async, would land in an adapter, and would leave the pure reducer unable to verify its own log. It also solves a cheating problem host-as-scribe makes structurally impossible. **Do not reintroduce it** |
| V7 Error Handling / Logging | partially | `drawPool`'s deliberate `RangeError` is the one uncaught throw in the phase's path — see Pitfall 2 |
| V12 File Upload | **yes** | JSON import: `MAX_IMPORT_BYTES` size gate before parse, reviver-based poison-key drop, allow-list rebuild (`import-guard.ts:913-950`) |

### Known threat patterns for this stack

| Pattern | STRIDE | Standard mitigation, as shipped |
|---------|--------|--------------------------------|
| XSS via a roster display name | Tampering | Preact escapes text children by default; `npm run check:nohtml` turns "by default" into "enforced" (`check-pure-core.mjs` `--nohtml` mode) |
| Prototype pollution via an imported document | Tampering / EoP | `POISON_KEYS` reviver at `import-guard.ts:927-936`; `safeObject`/`hasPoisonKey` for the `localStorage` path, where `JSON.parse` runs without a reviver (`persistence.ts:271-274`) |
| Allocation DoS via a hand-edited count | DoS | Nine `MAX_*` bounds, each argued independently. `MAX_BANS_PER_PLAYER` joins them |
| Cross-tab clobber | Tampering | `tab-lock.ts` + the `inert` gate. `dispatch` is deliberately un-gated, which is why the gate wraps *every* screen |
| **Shoulder-surfing a private ban** | **Information disclosure** | **This phase.** The full-screen shield (BAN-05), the D-05 resting-state rule, the `04-UI-SPEC` S1-S9 assertions, Amendment 1's disclosure narrowing, and the live-region audit in §Discretion 3 |
| **A private ban resurrected by bfcache** | **Information disclosure** | **This phase.** `pageshow` + `event.persisted` (BAN-06, D-17) and `visibilitychange` → hidden (D-18) |
| **A private ban leaving the machine in a file** | Information disclosure | D-09: the PERS-06 JSON checkpoint fires *after* the reveal. Verified safe today — `CheckpointPrompt` is rendered only with `checkpointReached={complete}` at `app.tsx:2097`, and the component "imports nothing from the file-io adapter and has no access to the tournament document" (`CheckpointPrompt.tsx:11-16`). **Adding a ban-reveal milestone must keep that gating** |

---

## Sources

### Primary (HIGH confidence — read from this repository, 2026-08-20)

- `src/core/actions.ts` (598 lines) — the six landing sites, creator and guard conventions
- `src/core/reduce.ts` — `RejectionReason` `:65`, `apply` `:142`, `canApply` `:341`, the two
  `poolNotBuilt` guards `:355`/`:373`
- `src/core/selectors.ts` — `selectCardTurn` `:464`, `selectPhase` `:733`, `selectStartingOrder`
  `:810`, `selectDealsCards` `:709`, `selectCardPlayOrder` `:402`, `selectSwapRoundOrder` `:575`
- `src/core/model.ts` — `SCHEMA_VERSION` `:45`, `BanMode` `:62-70`, `TournamentConfig` `:169`,
  `DraftState` `:296`, `copyConfig` `:421`, `initialState` `:445`
- `src/core/migrate.ts` — `SUPPORTED_SCHEMA_VERSIONS` `:48`, `V1_CONFIG_DEFAULTS` `:62`,
  `V2_CONFIG_DEFAULTS` `:84`, `migrate` `:249`, the chain `:265-268`
- `src/core/import-guard.ts` — `MAX_SWAP_BUDGET` `:141`, `buildConfig` `:472`, `buildLogEntry`
  `:622`, `isValidTournament` `:900`, `parseTournamentFile` `:913`
- `src/core/feasibility.ts` — `FeasibilityCode` `:87`, `FeasibilityInput` `:128`, `PRECEDENCE`
  `:179`, `notEnoughMegasMessage` `:341`, `checkFeasibility` `:387`, the RULE-09 arm `:566`
- `src/core/bans.ts` — `bannedEntries` `:65`
- `src/core/undo.ts` — `NEVER_UNDONE` `:107`, `isUndoable` `:135`, `UndoRemoval` `:219`,
  `undoRemoval` `:274`, `RoundBoundaryCrossing` `:407`, `undoCrossesRoundBoundary` `:455`
- `src/core/draw.ts` — `selectInPlace` `:114` and its `RangeError` note `:108-112`, `drawPool` `:141`
- `src/store.ts` — `nextSeq` `:106`, `dispatch` `:115`, `CreateTournamentInput` `:145`,
  `createTournament` `:220`, `adoptTournament` `:285`, `undo` `:377`, `undoAnnouncement` `:416`
- `src/adapters/tab-lock.ts` — `release()` `:530`, `installLifecycle` `:621-637`
- `src/adapters/persistence.ts` — `load` `:228`, the wrapper compare `:255-263`, `migrate` `:299`,
  `startAutosave` `:421-451`
- `src/app.tsx` — `Screen` `:120`, `useState<Screen>` `:474`, `handleRequestUndo` `:1538`,
  the `inert` gate `:1836-1900`, `CheckpointPrompt` wiring `:2097`
- `src/ui/components/LiveRegion.tsx` — `announce` and its byte-identical caveat `:13-27`
- `src/ui/components/TopBar.tsx` — bans disclosure `:209-217`, Ctrl+Z listener `:126-155`
- `src/ui/components/PoolGrid.tsx` — props `:51-145`, `banMode` `:474`, `filterAnnouncement`
  `:381`, the announcement timers `:575-619`
- `src/ui/components/SegmentedControl.tsx` — `SegmentedOption` `:29-33`, both-attributes `:74-92`
- `src/ui/components/TypeaheadField.tsx` — props `:84-111`
- `src/ui/components/NumericField.tsx` — props `:62-71`
- `src/ui/components/ReadOnlyBanner.tsx` — copy constants `:50-52`, announce `:68`
- `src/ui/components/CheckpointPrompt.tsx` — the no-auto-download argument `:11-30`
- `src/ui/components/BoardGrid.css:54` — `--board-label-w: 176px`
- `src/ui/screens/ConfigScreen.tsx` — `BAN_MODE_OPTIONS` `:275-279`, `banAnnouncement` `:301`,
  `handleStart` `:1073-1155`
- `src/ui/tokens.css` — spacing `:47-53`, sizes `:77-80`, type scale `:110-113`
- `src/ui/confirm-copy.ts` — the eight shipped sets
- `scripts/check-pure-core.mjs` — `FORBIDDEN_IDENTIFIERS` `:63-82`
- `tests/adapters/persistence.test.ts` — `:427` the three-site test, `:524-575` the Phase-2
  resume block
- `tests/core/migrate.test.ts` — `:161`, `:393`, `:398`
- `tests/adapters/tab-lock.test.ts` — `:499` the drive-don't-inspect precedent
- `vite.config.ts` — `test.environment: 'node'`
- `package.json` — the exact dependency pins
- `.planning/phases/04-blind-and-snake-bans/04-CONTEXT.md` — D-01…D-23
- `.planning/phases/04-blind-and-snake-bans/04-UI-SPEC.md` — the full surface contract
- `.planning/phases/02-host-configured-draft-night/02-CONTEXT.md` — D-10…D-16
- `.planning/REQUIREMENTS.md` — BAN-01…08, RULE-07…09
- `.planning/ROADMAP.md` — Phase 4, Ordering Constraints 4
- `.planning/STATE.md` — decisions 4 and 6, the descoped screen-reader check, the physical passes
- `.planning/config.json` — `nyquist_validation: false`
- `CLAUDE.md` — Constraints, Architecture, Conventions

### Measured this session (HIGH confidence — executed, not recalled)

- `happy-dom@20.11.1`: `PageTransitionEvent` exists; its init dictionary is **ignored**
  (`persisted → undefined`); `Object.assign(new Event('pageshow'), { persisted: true })` works;
  `document.visibilityState` is overridable with `Object.defineProperty` and a manual
  `visibilitychange` dispatch fires listeners.
- `node v24.15.0`, `npm 11.12.1`, `vitest 4.1.10`.

### Secondary (MEDIUM confidence)

None. No web search was performed. The phase brief directs precedent research at party /
social-deduction apps, and having read `04-UI-SPEC.md` in full I judged further precedent search
to be padding: the design questions those precedents would inform (shield sequence, panic control,
review step) are all already resolved in that document with reasoning specific to the host-as-scribe
reframe, which no party app shares. Recording the decision rather than performing the search and
reporting nothing.

### Tertiary (LOW confidence)

None.

---

## Metadata

**Confidence breakdown:**

- Standard stack: **HIGH** — the answer is "no change", verified against `package.json` and
  `CLAUDE.md`, both read this session.
- Architecture / integration points: **HIGH** — every line number, guard, selector and doc-comment
  cited was opened and read, not recalled. The five stale line numbers in the inherited documents
  were found by reading, and the corrected ones are in §Discretion 6 and §Sources.
- Pitfalls: **HIGH** — Pitfalls 1, 2, 4 and 6 are each derived from a specific line of shipped
  source, not from experience. Pitfall 3 was reproduced by execution.
- Feasibility arithmetic: **HIGH** on the code facts; **MEDIUM** on the `{y}` copy recommendation
  (A4), which resolves an ambiguity in an approved contract.
- Action shapes and names: **MEDIUM** — the *sites* are HIGH, the *strings* are recommendations
  (A1, A2, A8) and are irreversible once written to a saved document.
- Legibility: **HIGH** on the tokens; **MEDIUM** on the arc-minute extension, which is an
  inference from a prior physical pass and is falsifiable by the mandatory item-4 check.

**Research date:** 2026-08-20
**Valid until:** 30 days for the external facts (none load-bearing); **until the next commit that
touches `src/core/reduce.ts`, `src/core/undo.ts`, `src/store.ts` or `src/adapters/` for the line
numbers.** Every citation carries its symbol name as well as its line, so a shifted line is
recoverable by grep rather than by re-research.
