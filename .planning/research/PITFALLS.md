# Pitfalls Research

**Domain:** Zero-backend static-site tournament tool — client-only state, committed offline data snapshot, hot-seat turn-based multiplayer on one screen, Pokémon Champions roster
**Researched:** 2026-08-03
**Confidence:** HIGH on storage/hosting/data (verified against WebKit + MDN + live Showdown source and live HTTP probes); MEDIUM on draft-logic and scope (derived from project rules + first principles + comparable tools)

> **Phase names below are indicative.** They map to a suggested roadmap shape:
> P1 Roster Data Foundation · P2 App Shell + Persistence · P3 Tournament Config + Feasibility Solver · P4 Bans · P5 Draft Engine · P6 Swaps · P7 Export · P8 Brackets/Standings · P9 Roster Refresh.
> Re-map freely; what matters is that each pitfall is owned by *some* phase, and that the ones marked **BLOCKING** are owned before the draft engine ships.

---

## Headline Numbers (verified 2026-08-03)

These drive several pitfalls below. All measured directly, not recalled.

| Fact | Value | Source |
|------|-------|--------|
| Champions Reg **M-B** legal entries in Showdown's `champions` mod | **311** | `data/mods/champions/formats-data.ts` (entries with no `isNonstandard`) |
| — of which base species | **207** | cross-ref vs `data/pokedex.ts` |
| — of which alternate formes | **104** | ” |
| — of which **Mega formes** | **76**, across **73 base species** | ” |
| Base species with >1 legal Mega | **3** — Charizard (X/Y), Raichu (X/Y), Meowstic (M/F) | ” |
| Entries marked `isNonstandard: "Future"` (not yet legal) | **11** | ” |
| Entries marked `isNonstandard: "Past"` (excluded) | **1033** | ” |
| Regulation cadence | M-A: 8 Apr–17 Jun 2026 · M-B: 17 Jun–2 Sep 2026 | Victory Road / Pokemon.com |
| GitHub Pages cache header (live probe of the author's reference site) | `Cache-Control: max-age=600`, Fastly CDN | `curl -I https://xetoxyc.github.io/gothic-remake-lockpicker/` |
| localStorage quota | ~5 MiB/origin; Web Storage combined cap 10 MiB | MDN |
| Safari script-writable storage eviction | 7 days of browser use without interaction | WebKit |

**Immediate implication:** the roster rotates roughly **every 10 weeks**, and Reg M-C is expected ~2 Sep 2026 — within a month of this research. The stale-snapshot problem is not hypothetical; it is scheduled.

---

## Critical Pitfalls

### Pitfall 1: The tournament lives in `localStorage` and quietly evaporates

**What goes wrong:**
Forty minutes of draft — bans, six rounds of picks, priority cards spent, swap budgets burnt — exists only as a key in one browser profile on one machine. It disappears through at least six independent mechanisms, and five of them are silent:

| Failure mode | Silent? | Reality for this project |
|---|---|---|
| Host is in private/incognito | Yes, until it isn't | Safari private mode has historically had an effectively **zero** localStorage quota — the *first* `setItem` throws `QuotaExceededError`. Chrome/Firefox incognito allow writes but wipe on window close. Either way the host discovers this at the end. |
| Safari 7-day eviction | Yes | WebKit deletes **all** script-writable storage (localStorage, IndexedDB, sessionStorage, Cache API, SW registrations) for an origin with no user interaction in 7 days of browser use. A league that drafts on Sunday and plays out matches over three weeks loses the tournament between sessions. |
| Storage-pressure / LRU eviction | Yes | Best-effort storage is evicted whole-origin under disk pressure. Not partial — **everything for the origin at once**. |
| User "clears site data" / browsing data | No | Common enough. |
| Crash / tab kill mid-write | Yes | If you serialize the whole tournament on every pick and the process dies mid-`setItem`, you can get a truncated or absent value on next load. |
| Two tabs of the same tournament | **Yes, and worst** | localStorage is shared per-origin. Two tabs both holding an in-memory copy and both autosaving means last-writer-wins: tab A's stale snapshot overwrites tab B's five newer picks. No error, no warning, no way to tell afterwards. |

**Why it happens:**
`localStorage.setItem('tournament', JSON.stringify(state))` in a `useEffect`/state-change hook is a two-line solution that appears to work perfectly in every dev session. All the failure modes are invisible on a developer's machine on the day of writing.

**How to avoid:**

1. **Make the JSON file the system of record, not the backup.** Auto-download a `.json` snapshot at three hard checkpoints — after the ban reveal, after the last pick of round 6, and at tournament completion — plus a persistent "Save file" button that is visible on every screen, not buried in a settings menu. Browser storage is the *convenience* layer; the file is the durable one. This inverts the usual framing and is the single highest-value decision in the project.
2. **Wrap every write in `try/catch` and surface failure loudly.** On the very first `QuotaExceededError` or `SecurityError`, switch the app into an explicit "⚠ This browser is not saving your tournament — download the file after every round" banner mode that cannot be dismissed. Do not retry silently.
3. **Probe storage at config time, before the draft starts.** On the tournament-setup screen, write a canary key, read it back, delete it. If it fails, refuse to start without an acknowledged warning. Detecting private mode *before* 40 minutes of work is the whole game.
4. **Call `navigator.storage.persist()` on first meaningful interaction.** Widely available since Dec 2021. Chromium and Safari auto-decide from engagement history (no prompt); Firefox prompts. Persistent-mode origins are **exempt from LRU eviction**, and per MDN an origin in persistent mode is exempt from eviction generally. It is one line and it materially reduces the eviction surface. Show the result of `navigator.storage.persisted()` in a diagnostics corner.
5. **Solve multi-tab with the Web Locks API, not hope.** On boot, attempt `navigator.locks.request('drafter-primary', {mode:'exclusive', ifAvailable:true}, ...)`. If the lock is unavailable, this tab is a **secondary**: render read-only with a "This tournament is open in another tab — switch to it, or click Take Over" screen. Use `BroadcastChannel('drafter')` to push state to secondaries so the read-only view stays live. Never let two tabs both write.
6. **Write with a generation counter and verify.** Store `{schemaVersion, generation, savedAt, state}`. Before writing, read the current record; if its `generation` is higher than the one this tab loaded, you are about to clobber a newer save — stop and prompt. This catches the two-tab case even if Web Locks is unavailable.
7. **Keep a rolling ring of the last N autosaves** (e.g. 5 keys, round-robin) so a truncated or corrupt write costs one pick, not the tournament. At ~300 species and a handful of picks per player, the whole tournament state is a few tens of KB — you can afford 5 copies inside 5 MiB comfortably.
8. **Never use `sessionStorage` for anything the host would miss.** It dies with the tab, full stop.

**Warning signs:**
- Persistence code is a single `setItem` with no `catch`.
- No visible "last saved" timestamp anywhere in the UI.
- No canary/probe on the setup screen.
- No lock or generation check — you can open a second tab and both write happily.
- The word "backup" is used for the JSON export. If it's a backup, it isn't the source of truth, and someone will lose a draft.

**Phase to address:** **P2 (App Shell + Persistence) — BLOCKING.** Storage layer, canary probe, tab lock, generation counter, and file export must exist *before* the draft engine, because the draft engine is what makes losing data expensive. The auto-download checkpoints attach in P4/P5/P7 as those screens land.

---

### Pitfall 2: "No build step" is a design constraint that must be enforced from commit #1, not discovered at deploy

**What goes wrong:**
The stated bar is "clone the repo or open the link, no npm install, no dev server." Four things break that promise, and three of them only surface after the code already depends on them.

**(a) `file://` kills ES modules and `fetch()`.**
Opening `index.html` from disk gives the page an opaque `null` origin. `<script type="module">` and every `import` are fetched with CORS semantics and are **blocked**. `fetch('./roster.json')` and `XMLHttpRequest` on local files are blocked in both Chrome and Firefox. Classic `<script src="...">` still loads (it is not CORS-checked). So the "no dev server" promise and the "modern module architecture" instinct are directly incompatible.

**(b) GitHub Pages project sites live at a sub-path.** `https://user.github.io/Pokemon-champions-drafter/`. Every root-relative URL (`/assets/x.png`, `/roster.json`) resolves to `user.github.io/assets/...` and 404s. Works perfectly on `localhost:8000`, breaks on the only URL anyone will actually use.

**(c) Committed build artifacts drift.** If you cave and add a bundler "just for the roster," you now have generated files in git. Someone edits the generated file, the next regeneration silently reverts it, and the deployed app disagrees with the source. This is the classic failure mode of generated-files-in-master.

**(d) GitHub Pages serves `Cache-Control: max-age=600` behind Fastly** (verified live on the author's own reference site). Ten minutes of browser cache plus CDN edge cache means a host who loads the app, gets a bug fix pushed, and reloads may still be on the old app — and may be running old JS against a new roster file, or vice versa.

**How to avoid:**

- **Make `file://` a tested target, not an aspiration.** Add a manual check to the definition of done for every phase: "double-click `index.html`, tournament runs end to end." If it breaks, the architecture broke the constraint.
- **Ship roster data as JavaScript, not JSON.** `data/roster.js` containing `window.CHAMPIONS_ROSTER = {...}` loaded by a classic `<script src>` works over `file://`, over `http://`, and over Pages, with zero fetch. A `roster.json` does not. This is the single change that makes the zero-build promise survivable. Emit `.json` too if you want it for tooling, but do not make the app depend on it.
- **Use classic scripts and global namespacing, or accept a dev server.** Pick one deliberately in P2 and write the decision down. Half-measures (modules "for now, we'll fix it later") mean the constraint is already violated.
- **Every URL in the repo is relative and starts with `./`.** Ban leading `/` in `src`/`href`. Consider a one-line grep in a CI check or a README note. `<base href>` is an alternative but it changes the resolution of in-page `#anchor` links and behaves differently under `file://` — prefer plain `./`.
- **Add `.nojekyll` at the repo root.** Without it, Pages runs Jekyll and silently drops any file or directory beginning with `_` or `.`. Cheap insurance.
- **Cache-bust by content, not by hope.** Give every long-lived asset a version query string derived from a single `APP_VERSION` constant (`./app.js?v=2026.08.03`) and bump it in one place. Show `APP_VERSION` and the roster snapshot's `generatedAt` in the app footer, so a host reporting a bug can tell you what they're actually running. Do not rely on users hard-refreshing.
- **If a generator script exists, make its output self-describing.** The generated `data/roster.js` should carry a header comment: source, upstream commit SHA, regulation, generation timestamp, and `DO NOT EDIT BY HAND`. Cheap, and it makes drift visible in a diff.

**Warning signs:**
- The first `import` statement appears.
- `fetch('./data/...')` anywhere.
- Anything in `href="/..."` or `src="/..."`.
- README says "run `python -m http.server`" — the promise is already broken.
- No version string visible in the deployed UI.

**Phase to address:** **P2 (App Shell) — BLOCKING.** The module-vs-classic-script decision is architectural and expensive to reverse. Roster-as-JS lands in P1.

---

### Pitfall 3: "Legal in Pokémon Champions" is three different lists, and picking the wrong one is invisible until someone can't use their team

**What goes wrong:**
There are at least three defensible readings of the requirement "Pool is restricted to Pokémon legal in Pokémon Champions," and they differ by ~80 entries:

1. **Obtainable in the game at all** — reported as 269 at launch (210 + 59 Megas).
2. **Legal in the current ranked Regulation Set** — M-A was reported as 186 + 59 Megas; the current `champions` mod (M-B) resolves to **311 entries / 207 base species / 76 Megas**.
3. **Legal in a specific competitive format on top of that** — `[Gen 9 Champions] OU` bans Ubers, `VGC 2026 Reg M-B` applies Flat Rules, and so on.

Pick #1 and the tool hands people teams they cannot enter in ranked. Pick #2 and it's correct today and wrong on 2 September. Pick #3 and the host has to understand Smogon tiering to configure a draft night with friends.

**Compounding trap — the upstream identifier is a moving target.** Showdown's mod naming is:
- `championsregma` — frozen snapshot of Reg M-A
- `champions` — **currently M-B**

When M-C arrives, the overwhelmingly likely pattern (matching how Showdown handles VGC regulations) is that `champions` *becomes* M-C and a new frozen `championsregmb` appears. **A regeneration script that hardcodes `mod: 'champions'` will silently change which regulation it snapshots, with no error and no diff signal other than the roster contents.** This is the most dangerous single line in the future data pipeline.

**How to avoid:**

- **Decide explicitly, in writing, in P1: "legal" means the current ranked Regulation Set.** That is what a draft league actually cares about. Record the decision in PROJECT.md's decision table.
- **Stamp the snapshot with the regulation, not just a date.** The roster file header must carry `{ regulation: "M-B", validFrom, validUntil, upstreamCommit, generatedAt, speciesCount, megaCount }`. Then:
  - The app can compare `Date.now()` against `validUntil` and show **"This roster is for Regulation M-B, which ended on 2 Sep 2026. It may be out of date."** on the config screen. Detection with zero network.
  - The regeneration script can assert `speciesCount` and `megaCount` against the previous snapshot and **fail loudly on a delta beyond a threshold** (e.g. >10% change) rather than quietly committing a different regulation.
- **Pin the upstream by commit SHA, not by branch.** Regenerate deliberately.
- **Filter on `isNonstandard` correctly, and test the filter.** The current mod has 1033 `Past`, 11 **`Future`**, 2 `LGPE`, 1 `Custom`. A naive `entry.isNonstandard !== 'Past'` filter admits the 11 `Future` entries — Pokémon that Showdown has already datamined for a regulation that hasn't shipped. The correct filter is `!entry.isNonstandard` (absence of the field). Assert the resulting count in the script.
- **Do not offer format tiering (OU/UU/Ubers) in v1.** It is the third list and it is a scope trap (see Pitfall 9).

**Warning signs:**
- The roster file is a bare array of names with no metadata header.
- The generation script's output is committed without a count assertion.
- `mod: 'champions'` appears as a literal anywhere.
- Nobody can answer "which regulation is this snapshot?" by looking at the UI.

**Phase to address:** **P1 (Roster Data Foundation) — BLOCKING.** The staleness banner lands in P3 (config screen).

---

### Pitfall 4: Forme identity — Mega, regional, cosmetic, and battle-only formes each break a different assumption

**What goes wrong:**
Every one of these is live in the *current* legal roster. This is not a theoretical list.

**(a) Substring matching for "mega" catches Meganium.** Verified: filtering legal IDs by `id.includes('mega')` returns 77 entries, exactly one of which — `meganium` — is not a Mega. Correct test is `species.forme && species.forme.startsWith('Mega')` or `!!species.requiredItem` on the forme entry.

**(b) A Mega is not a separate team slot — it is the base species holding a stone.** `venusaurmega` has `baseSpecies: "Venusaur"`, `forme: "Mega"`, `requiredItem: "Venusaurite"`. If your Mega round drafts the *forme* `Venusaur-Mega` and a normal round leaves `Venusaur` in the pool, two players can end up "owning" the same physical Pokémon. Worse, one team could hold both. **Decide in P1 whether the draftable unit is the base species (73 Mega-capable) or the Mega forme (76 Mega formes), and make the pool and the removal logic agree.** The base-species reading is almost certainly right for a draft.

**(c) Three base species have two legal Megas each** — Charizard (Mega-X / Mega-Y), Raichu (Mega-X / Mega-Y), Meowstic (Meowstic-M-Mega / Meowstic-F-Mega). If the draftable unit is the base species, drafting "Charizard" in a Mega round leaves the X-vs-Y choice undefined — which matters for typing display and export. Either present the choice at pick time or record it as unresolved and note it in the export.

**(d) Meowstic's forme naming is asymmetric.** `Meowstic-M-Mega` has `battleOnly: "Meowstic"` (no `-M`), while `Meowstic-F-Mega` has `battleOnly: "Meowstic-F"`. Any code that derives base identity by string-chopping `-Mega` off the name gets `Meowstic-M`, which does not resolve. Always use the `baseSpecies` / `battleOnly` field, never string surgery.

**(e) Floette is not Mega-capable — Floette-Eternal is.** `floettemega` has `battleOnly: "Floette-Eternal"`, an event-exclusive forme. Marking base Floette as Mega-capable puts an impossible pick in a Mega round.

**(f) `Castform-Sunny` is in the legal set and is `battleOnly`.** It is a weather-triggered in-battle forme, not a draftable Pokémon. A naive "everything without `isNonstandard`" filter lists it as a separate entry in the pool. Filter out `battleOnly` entries *except* Megas, which you are deliberately keeping.

**(g) Cosmetic formes are auto-generated and are not keys in `pokedex.ts`.** Four legal base species carry them: Vivillon (17), Furfrou (9), Alcremie (8), Florges (4) — 38 visual duplicates. Reading the raw `pokedex.ts` correctly gets you the base only. Reading a *built* Dex (`@pkmn/dex`, `teambuilder-tables.js`) can hand you all 38, inflating the pool with entries that are the same Pokémon. Decide which source you read and assert the count.

**(h) Names that break string parsing.** In the current legal roster: `Kommo-o` is a **base species with a hyphen** — any `name.split('-')` forme parser reads base "Kommo" forme "o". `Mr. Rime` has a period and a space. The roster today happens to contain **zero** non-ASCII names, but it grows every regulation and the classic offenders are one rotation away: `Farfetch’d` is stored with **U+2019 RIGHT SINGLE QUOTATION MARK**, not an ASCII apostrophe — `"Farfetch'd" === species.name` is `false`. `Flabébé` carries two `é`. `Nidoran-M`/`Nidoran-F` are the Showdown names for `Nidoran♂`/`Nidoran♀`; `toID` collapses both display forms toward `nidoran` and only the `-M`/`-F` names disambiguate. `Type: Null`, `Ho-Oh`, `Porygon-Z`, `Jangmo-o`/`Hakamo-o` all contain separators.

**How to avoid:**

- **Two fields, never one.** Every roster entry carries an opaque `id` (Showdown's `toID`: `text.toLowerCase().replace(/[^a-z0-9]+/g, '')`) used for *all* equality, keying, storage, and set membership; and a `displayName` used only for rendering and export. **Never compare display names.** This single rule neutralises (h) entirely.
- **Never derive structure from the name string.** `baseSpecies`, `forme`, `requiredItem`, `battleOnly` are fields on the data. Use them. Ban `split('-')` on species names in review.
- **Normalise Unicode on ingest.** Store display names exactly as upstream provides them (U+2019 and all), but if you ever accept typed input, `String.prototype.normalize('NFC')` plus a `toID` comparison.
- **Write a fixture test in P1 with the known-hostile set** — Kommo-o, Mr. Rime, Meowstic-M-Mega, Meowstic-F-Mega, Floette-Mega, Castform-Sunny, Charizard-Mega-X/Y, Raichu-Mega-X/Y, Meganium, Vivillon — and assert the pipeline's classification of each. This is ~15 lines and it is the highest-leverage test in the project.

**Warning signs:**
- Any `.includes('Mega')` or `.split('-')` on a species name.
- The roster file has one name field.
- Mega-capable count is 76 or 77 rather than 73 (or whatever your chosen unit yields) — off-by-a-few means the classifier is wrong.
- Vivillon shows up 18 times in the pool.

**Phase to address:** **P1 (Roster Data Foundation) — BLOCKING.** Mega-round filtering consumes it in P5.

---

### Pitfall 5: Sprites are a separate, differently-shaped naming problem — and new Champions Megas have none

**What goes wrong:**
Showdown's sprite filenames are **not** `toID(name)` and **not** a simple hyphenation of the display name. Verified by live HTTP probe against `play.pokemonshowdown.com/sprites/gen5/`:

| Path | Status | Rule it demonstrates |
|---|---|---|
| `mrmime.png` | **200** | base species → `toID(name)`, punctuation removed |
| `mr-mime.png` | **404** | hyphenation of base names is wrong |
| `farfetchd.png`, `flabebe.png`, `hooh.png`, `typenull.png`, `porygonz.png`, `nidoranf.png`, `nidoranm.png` | **200** | all special chars simply stripped |
| `venusaur-mega.png`, `charizard-megax.png` | **200** | formes → `toID(base) + '-' + toID(forme)` |
| `farfetchd-galar.png`, `urshifu-rapidstrike.png`, `palafin-hero.png` | **200** | same rule for regional/alt formes |

So the rule is: `toID(baseSpecies)` for a base species, and `toID(baseSpecies) + '-' + toID(forme)` for a forme. **Two different derivations, both from fields — never from the display name.**

**And the roster runs ahead of the art.** Verified 404s in `gen5/` for Champions-original Megas: `eelektross-mega.png`, `falinks-mega.png`, `dragalge-mega.png`, `barbaracle-mega.png`, `staraptor-mega.png`. `dex/eelektross-mega.png` is also 404 — only `ani/eelektross-mega.gif` exists. Meanwhile the older Megas (`sceptile-mega`, `blaziken-mega`, `swampert-mega`, `mawile-mega`) are all present. **Every regulation that adds a new Champions-original Mega will add missing sprites**, and a draft pool full of broken-image icons looks like a broken app.

**Additional trap:** the project must work **offline after first load**. Hotlinking `play.pokemonshowdown.com` sprites violates that constraint outright, and adds a third-party availability dependency to a tool whose whole pitch is "it just works."

**How to avoid:**

- **Derive the sprite id from `baseSpecies` + `forme`, in a single function, tested against the fixture set from Pitfall 4.**
- **Every sprite site gets a graceful fallback**: `onerror` swaps to a neutral silhouette plus the species name in text. Never render a broken-image glyph. A missing sprite must degrade to "a Pokémon you can still draft," not "the app is broken."
- **Have the regeneration script check sprite existence and report.** For each roster entry, HEAD the sprite path (or check against a vendored sprite directory) and emit a `missingSprite: true` flag into the snapshot plus a console summary: `"5 of 311 entries have no sprite: eelektrossmega, falinksmega, ..."`. Now the gap is known before a user finds it.
- **Vendor the sprites you need, or accept online-only art.** Pick one in P1 and be honest about it. Icons from the `pokemonicons-sheet.png` spritesheet (~392 KB, one request, verified 200) are a strong middle path — a single vendored file covers the whole pool at icon size and works offline. Full-size sprites for 311 entries is a much larger commitment.
- **Do not block on art.** The `standard`/`full` display-density modes described in PROJECT.md give you a legitimate escape: `minimal` mode with no sprites is a shipping product.

**Warning signs:**
- Sprite URL built by `name.toLowerCase().replace(/ /g,'-')`.
- No `onerror` handler on pool images.
- The app requires network to show the pool.

**Phase to address:** **P1** (id derivation + missing-sprite audit), **P5** (fallback rendering in the pool UI).

---

### Pitfall 6: The draft engine deadlocks — and every deadlock is detectable at config time

**What goes wrong:**
Once the draft is running, an unsatisfiable state has no good exit. The host either restarts (losing 40 minutes — see Pitfall 1) or the group improvises a house rule and the tool becomes a liability rather than the source of truth. **Every one of the following is a pure function of the configuration and can be checked before the first pick.**

#### The full deadlock enumeration

| # | Failure | Trigger condition (checkable at config time) | Detection |
|---|---|---|---|
| **D1** | **Pool runs dry mid-draft** | `poolSize < players × 6` | Arithmetic. Trivial. |
| **D2** | **Pool runs dry during swap rounds** | `poolSize < players × 6 + expectedSwapReturns`. Note a mid-draft swap is net-neutral (one out, one in) but a *swap round* where a player drops-and-takes is also net-neutral — the real risk is a player who **passes** vs one who takes, and leftovers hitting zero while players still want to swap. | `leftovers = poolSize − players×6`; require `leftovers ≥ 1` for any swap round to be meaningful, and ideally `≥ players` so the last player in order still has a choice. |
| **D3** | **Mega round has fewer Mega-capable than players** | `megaCapableInPool < players` for *each* Mega round, i.e. `megaCapableInPool ≥ players × megaRounds`. Hard ceiling from the data: **73 base species have a legal Mega in Reg M-B.** So `players × megaRounds ≤ 73 − megaBans − megasBannedByPlayers`. 25 players × 3 Mega rounds = 75 > 73 → mathematically impossible regardless of pool size. | Arithmetic against the roster's Mega-capable count. |
| **D4** | **Priority-card ties** | **Not an edge case — the normal case.** Each player holds their own 1–6, so collisions are independent. Computed: P(at least one tie in a round) = 16.7% at 2 players, 44.4% at 3, 72.2% at 4, 90.7% at 5, **98.5% at 6**, and **100% at ≥7 players** (pigeonhole: 7 players, 6 distinct values). There is no configuration in the target 4–8 range where ties are rare. | Not a check — a **required rule**. |
| **D5** | **Bans starve the pool** | Blind/snake bans are chosen by players, so the post-ban pool size is not known at config time — but the *worst case* is. `worstCasePool = legalRoster − (players × bansPerPlayer)`. Require `worstCasePool ≥ players × 6 + leftoverTarget`. Also the Mega-specific version: `megaCapable − (players × bansPerPlayer) ≥ players × megaRounds` if players are allowed to ban Megas. | Worst-case arithmetic at config; **re-check immediately after the ban reveal, before building the pool.** |
| **D6** | **A swap returns a Pokémon that violates composition** | With the "composition rules compile to round structure" design, a returned Mega goes back into the *general* leftovers where a non-Mega round could claim it, and a player who swaps *out* their only Mega in a swap round breaks their required composition. | Tag every roster slot on a team with the round-type that produced it. A swap may only exchange **like for like**: a slot produced by a Mega round can only be refilled from Mega-capable leftovers. This makes the invariant structural, exactly like the round design — and it's the same insight applied one level deeper. |
| **D7** | **Player count makes the rules impossible** | Composite of D1–D3 and D5. Verified thresholds against the current 207 base species: 6 picks/player × N ≤ 207 → **hard ceiling ~34 players** with zero leftovers, ~27 players at a 25% leftover target. Mega ceiling from D3 binds much earlier for multi-Mega configs. | Arithmetic. |
| **D8** | **Bracket byes / odd counts** | Standard failure: byes clustered rather than distributed; 1-seed and 2-seed on the same half; N=1 or N=2 degenerate cases; a bye counted as a played match in standings. | `byes = nextPowerOfTwo(N) − N`, assigned to the top `byes` seeds; standard recursive seed order (1·8·4·5·3·6·2·7 for 8) guarantees 1 and 2 meet only in the final. Round-robin with odd N needs a rotating bye each round. |
| **D9** | **Round-robin tiebreakers cycle** | A beats B, B beats C, C beats A — all 1-1. Head-to-head cannot resolve it, and a naive `sort()` on wins produces an arbitrary, unstable order that changes between renders. | See Pitfall 9 — this is where the bracket engine balloons. Ship a deterministic, documented, *short* tiebreak chain that ends in "host decides." |

#### How to avoid — the config-time feasibility check

**Build a single pure function early — before the draft UI exists:**

```
checkFeasibility(config, roster) -> { ok: bool, errors: [], warnings: [], derived: {...} }
```

It runs on **every keystroke** on the tournament config screen and drives a live panel:

> ✅ Pool: 60 of 207 · 48 picks + 12 leftovers
> ✅ Mega rounds: 2 × 8 players = 16 needed, 73 available (−4 Mega-banned = 69)
> ⚠️ Swap rounds: only 12 leftovers for 8 players — the last player may have few options
> ❌ **Not possible:** 3 Mega rounds × 25 players needs 75 Mega-capable, only 73 exist

**The "Start Draft" button is disabled while `ok` is false, and the reason is on screen.** This converts every mid-draft deadlock into a config-screen sentence, which is the entire point. The project's own framing — *"warn when pool math or rules become unsatisfiable rather than hard-capping"* — is exactly this; make sure it is a real solver and not a single `poolSize` check.

**Re-run the same function after the ban reveal**, before the pool is built. That is the one point where player input changes the arithmetic. If it now fails, the recovery is cheap (re-ban) because no picks have been made.

**For D4 (priority-card ties), pick and document a rule now:**

The tie rule must be **deterministic, seeded, and displayed**, because it will fire in almost every round. Options, in descending order of defensibility for a hot-seat tool:
1. **Seeded random per round, shown as a visible "coin flip" animation.** Store the seed in tournament state so it survives reload and JSON round-trip and is reproducible. Friends accept a visible dice roll; they do not accept "the app just decided."
2. Reverse order of the previous round's pick position (self-balancing, but needs a rule for round 1).
3. Fewest high cards remaining, then random.

Whatever you choose: **the tie must be resolved and shown as an explicit step**, not silently absorbed by a stable sort. A stable `sort()` on card value quietly means "player entered first goes first," which is invisible, unfair, and will be noticed.

**Warning signs:**
- The config screen has no live feasibility panel.
- Tie handling is `picks.sort((a,b) => a.card - b.card)` with no tiebreak field.
- Swap validation lives in the swap UI rather than in the state model.
- Any error message a host could see that contains the words "no Pokémon available."
- Bracket code has no explicit `N === 1`, `N === 2`, `N === 3` test.

**Phase to address:** **P3 (Tournament Config + Feasibility Solver) — BLOCKING for D1/D2/D3/D5/D7.** D4 in P5. D6 in P6. D8/D9 in P8.

---

### Pitfall 7: Hot-seat leaks hidden information and has no undo

**What goes wrong:**

**(a) Blind bans on a shared screen are a contradiction.** PROJECT.md already flags this. The concrete leaks are more numerous than "someone looks at the screen": the pool list scroll position after a player picks; a hover/tooltip left open; the browser's `<input>` autocomplete dropdown showing what the previous player typed; the count of bans submitted so far revealing timing; and — the big one — the **browser back button** re-rendering a previous player's private screen from bfcache.

**(b) A misclick is unrecoverable and instantaneous.** A single click removes a Pokémon from the pool permanently. Everyone in the room saw it. The host now has to either restart or lie to the app. This is *the* most likely real-world failure in a friend group, far more likely than any storage bug.

**(c) Whose turn is it?** Priority cards mean the order changes every round and is non-obvious. A shared screen with a small "Player 3's turn" label produces constant "wait, is it me?" over voice chat, which is exactly the spreadsheet-and-Discord friction the tool exists to remove.

**(d) The host refreshes, hits back, or closes the tab.** With autosave this should be survivable — but only if autosave actually ran and only if there isn't a second tab (Pitfall 1).

**How to avoid:**

- **Blind bans get a real pass-the-device flow, not an input mask.** Full-screen interstitial: **"Pass to Player 3. Tap when ready."** → private ban screen → **"Bans locked. Pass back / Tap for next player."** Between players the screen shows nothing but the interstitial. Add `autocomplete="off"` and clear the input on submit. Consider a hold-to-reveal on the private screen so a shoulder-surfer sees nothing at rest. This is a named, designed screen, not a modal with a password field.
- **Suppress bfcache resurrection.** Handle `pageshow` with `event.persisted === true` and force-render the current authoritative state, never the prior DOM. Otherwise back-button restores a rendered private screen.
- **Confirm-then-commit for every destructive action.** Pick, ban, swap, and match result all go through: select → a distinct confirm affordance → commit. This is one extra click per pick and it eliminates the entire class.
- **Plus a real undo.** Keep a bounded command history (last ~20 actions) inside the tournament state so it survives reload and JSON export. Expose "Undo last pick" in a consistent place. Model actions as a log of events rather than mutations of a blob — the single-serializable-object decision in PROJECT.md is compatible with this if the object contains the log. This also makes the future sync layer dramatically easier, which is the stated reason for that decision in the first place.
- **Make turn state impossible to miss.** Whose-turn belongs in the largest type on the page with the player's colour, not in a status bar. Optional: a short sound on turn change. For a screen being watched by 4–8 people on a call, "obvious from across the room" is the bar.
- **Guard navigation, correctly.** `beforeunload` with `preventDefault()` shows only a **generic browser-supplied message** — custom text has been ignored by all major browsers since ~2016 — and requires **sticky user activation** (the user must have interacted with the page). It is also unreliable on mobile. So: attach it only while a draft is in progress, and treat it as a courtesy, not a safety net. **The actual safety net is autosave + the JSON checkpoints from Pitfall 1.**

**Warning signs:**
- Blind ban is implemented as `<input type="password">`.
- Any click handler that mutates the pool without an intermediate confirm state.
- No undo anywhere.
- You can't tell whose turn it is from a screenshot at arm's length.

**Phase to address:** **P4 (Bans)** for the pass-the-device flow and bfcache. **P5 (Draft Engine)** for confirm/undo and turn indication. Note undo depends on the state model shape — decide event-log vs blob in **P2**.

---

### Pitfall 8: Species-only export imports fine and then fails validation

**What goes wrong:**
A species-only paste — six bare lines of names — is a legitimate minimal Showdown team format and it will **import** into the teambuilder. But two things break at the moment the team is actually used, which is after the demo has been declared working.

**(a) A bare Mega forme is invalid.** Read directly from Showdown source: `sim/teams.ts::parseExportedTeamLine` splits the first line on `' @ '` to extract the item; with no item, `set.item` is empty. Then `sim/team-validator.ts` sees `species.battleOnly` truthy for a Mega forme and checks `species.requiredItems`, producing:

> `Venusaur-Mega transforms in-battle with Venusaurite, please fix its item.`

Verified in the dex: `venusaurmega` has `requiredItem: "Venusaurite"`; `charizardmegax` has `requiredItem: "Charizardite X"`. So **if the draft's Mega slots export as `Venusaur-Mega`, the team imports and then refuses to battle.** The correct species-only export for a Mega slot is either `Venusaur @ Venusaurite` (base species + stone — technically no longer "species-only", but it is the only form that validates) or the base name `Venusaur` with the Mega noted outside the paste.

**(b) The first-line parser has three special forms that a naive exporter can collide with.** Same source:
- `X @ Y` → item
- line ending in ` (M)` or ` (F)` → **gender**, and the suffix is stripped
- line ending in `)` and containing `(` → parsed as `Nickname (Species)`

So an export that helpfully writes `Nidoran (M)` yields species "Nidoran" with gender M — and there is no species "Nidoran". The correct names are `Nidoran-M` / `Nidoran-F`. Likewise never wrap anything in parentheses.

**(c) pokebase.app's import format is unverified.** PROJECT.md itself flags this and it remains unverified here: pokebase.app has a Team Builder for Pokémon Champions, but no public documentation of an import format or an API was found. **Treat "exports to pokebase.app" as an unvalidated assumption.**

**How to avoid:**

- **Verify both import targets by hand in the first week, before building the export screen.** Paste six species into play.pokemonshowdown.com's teambuilder, then hit "Validate" against `[Gen 9 Champions] VGC 2026 Reg M-B`. Paste the same into pokebase.app. Write down what each accepts. This is a 20-minute task that de-risks a requirement.
- **Decide the Mega export representation from that test**, then encode it once in a single `toShowdownPaste(team)` function.
- **Always emit the Showdown `name` field verbatim** (`Nidoran-M`, `Farfetch’d` with U+2019, `Mr. Rime`) — never a prettified display string, never a re-derived name.
- **Assert the round-trip in a fixture test**: export a team containing a Mega, a regional forme, `Kommo-o`, and `Mr. Rime`; re-parse it with the same rules `parseExportedTeamLine` uses; assert species identity survives.
- **Have a fallback that always works:** a plain "copy team as text" that the host can paste into Discord. If pokebase's format turns out to be bespoke, this is the ship-able answer and the pokebase integration becomes a nice-to-have.

**Warning signs:**
- The export was tested by eyeballing the text, not by pasting into Showdown and clicking Validate.
- Mega slots appear in the paste as `-Mega` names.
- Export builds names with `.replace()` or template concatenation rather than reading `species.name`.

**Phase to address:** **P7 (Export)** — but the **verification spike belongs in P1**, because the answer may change the roster data model (whether you need Mega *stone item names* in the snapshot at all).

---

### Pitfall 9: The bracket/standings engine, the config surface, and the roster pipeline are the three scope sinks

**What goes wrong:**
The author has already correctly cut real-time multiplayer, replay parsing, an in-tool teambuilder, and accounts. Good. The remaining balloon risks are all things that *feel* small:

**(a) Brackets and standings with tiebreakers.** Round robin standings look like a sort. They are not. The moment two players tie you need a tiebreak chain, and each link is a design argument: head-to-head (fails on 3-cycles — A beats B beats C beats A, all 1-1), then game differential (which games? only among tied players, or all?), then Pokémon-remaining differential, then opponent win percentage (Buchholz/median), then coin flip. Competitive-tournament literature notes that both goal difference and head-to-head are individually unsound in the presence of unplayed matches. Best-of-three adds "games won" as a second axis on top of "matches won." Then someone asks for double elimination. Then playoff seeding. Then a Swiss round. **This is a project on its own and it is *tier 3* on the host-selectable depth ladder — meaning most nights never reach it.**

**(b) Exhaustive rule configuration.** "Host can fine-tune round structure manually" is a beautiful idea and also an infinite surface: per-round type, per-round pool filters, type-coverage requirements, BST caps, tier budgets, per-player handicaps, ban counts per player, ban visibility per phase. Every option multiplies the feasibility solver's cases (Pitfall 6) and the test matrix.

**(c) Roster data pipeline maintenance.** A regeneration script that parses TypeScript source is a parser you now own. And the live in-app refresh has a concrete, verified problem: **there is no small public CORS-enabled endpoint that yields the Champions-legal roster.** Measured options today:
- `play.pokemonshowdown.com/data/teambuilder-tables.js` — **16.1 MB**, CORS `*`. Contains a `champions` key (~330 KB of it) with `tiers`/`overrideTier`/`overrideSpeciesData`. You must download 16 MB to get 330 KB.
- `raw.githubusercontent.com/.../data/mods/champions/formats-data.ts` — 74 KB, CORS `*`, but it is **TypeScript source** that you would have to parse in the browser.
- `play.pokemonshowdown.com/data/pokedex.js` — 460 KB, CORS `*`, but it's the *base* dex with no Champions legality.
- `pokeapi.co` — CORS `*`, but has no concept of Champions regulations at all.

Worse: the shape of the data differs between the repo `.ts` file and `teambuilder-tables.js`. **The repo script and the in-app refresh would need two different parsers for the same information — guaranteed drift.**

**How to avoid — what to cut:**

The success criterion is *one full tournament end to end*. Protect it:

| Feature | Verdict | Reasoning |
|---|---|---|
| Draft-only depth | **Ship first** | This is the product. Config → bans → 6 rounds → export. |
| Round robin standings, **wins only**, ties shown as ties with a **manual host-set order** | **Ship** | Honest, tiny, and correct. "Host clicks to break the tie" is a legitimate feature for a friend group, not a cop-out. |
| Automatic tiebreak chains, Buchholz, game differential | **Defer** | Add exactly one link (head-to-head) only if the group actually asks. |
| Single elimination with byes | **Ship**, minimal | Standard seed order + byes to top seeds. ~40 lines. Explicitly handle N=1,2,3. |
| Double elimination, Swiss, consolation brackets | **Cut** | Not in requirements. Keep it that way. |
| Best-of-three | **Ship as a label + a 2-of-3 counter** | Do not model individual games. |
| Manual round-structure fine-tuning | **Defer past v1** | Ship the *derived* schedule from "N Megas required" plus a plain reorder. The full editor is a v2 feature and it doubles the feasibility solver. |
| Match log (depth tier 3) | **Defer** | Tier 3 of 3 on the host's own ladder. |
| Committed roster snapshot + repo regeneration script | **Ship** | This is the offline guarantee. Non-negotiable. |
| **In-app live roster refresh** | **Defer, and reframe** | Given the 16 MB / TS-parsing reality, the honest v1 is: a **staleness banner** (Pitfall 3) plus **"Import roster JSON"** — the host drops in a file the maintainer publishes as a GitHub Release. That gets the actual benefit (roster change without a code release) at ~5% of the cost, and it reuses the tournament JSON import machinery you already need. |

**A one-line scope test to apply to every proposed feature:** *does a group of friends need this to finish one draft tonight?* If no, it is v2.

**Warning signs:**
- More than a day spent on standings before a draft has been run end to end.
- The config screen has more than ~8 controls.
- The refresh feature is being built before the snapshot works.
- Anyone writes a TypeScript parser in JavaScript.

**Phase to address:** **P0/roadmapping** — this is a scoping decision, not an implementation one. Enforce at phase boundaries.

---

### Pitfall 10: Pokémon IP — the practical position

**What goes wrong:**
Nintendo enforces aggressively and has a documented track record: 379 fan games pulled from Game Jolt in a single December 2020 DMCA sweep; Pokémon Uranium shut down; Pokémon Essentials taken down; mass GitHub/GitLab takedowns of emulators through 2024. GitHub Pages is a GitHub-hosted service and is squarely in DMCA reach.

**The realistic risk profile for *this* project is low but non-zero**, and it is lowest for exactly the shape this project already has: no ROM assets, no game code, no music, no distribution of a playable game, non-commercial, small audience. What raises risk: hosting a large mirror of official sprite art, monetisation, or using official logos/wordmarks in branding.

**Licensing realities of the likely data sources — verified:**

| Source | License status | Practical requirement |
|---|---|---|
| **Pokémon Showdown** (`smogon/pokemon-showdown`, `@pkmn/*`) | Code MIT. The dex data is derived from the games. | Attribute Pokémon Showdown / Smogon. Standard practice; universally done. |
| **`smogon/sprites`** | Code MIT. README: *"All sprites themselves are property of Nintendo / Game Freak / The Pokémon Company."* For community-made BW-style sprites for later gens: **"The license for these community-created sprites is still being determined and may change in the future, but in the meantime please talk to us first before using them."** | This is an explicit request to ask before use. Do not silently vendor them. Hotlinking also breaks the offline requirement. |
| **`PokeAPI/sprites`** | Repo licensed **CC0**; upstream art is still Nintendo's. | Freest option, but CC0 on the repo does not launder the underlying copyright. |
| **`PokeAPI/pokeapi`** | **BSD-3-Clause**, with the explicit notice *"Pokémon and Pokémon character names are trademarks of Nintendo."* | Attribute; do not imply endorsement. |
| **pokebase.app** | Unknown / no published terms found. | Treat as a link target, not a data source. |

**How to avoid:**

- **Ship a `NOTICE`/`CREDITS` section in the README *and* in the app footer.** Name Pokémon Showdown / Smogon and any sprite source, link the repos, state the license of each.
- **Include the standard fan disclaimer**, visibly: *"Pokémon and Pokémon character names are trademarks of Nintendo, Creatures Inc., and GAME FREAK inc. This is an unofficial fan project, not affiliated with or endorsed by them."*
- **Prefer CC0-licensed PokeAPI sprites over `smogon/sprites` community art** unless you have actually asked Smogon. This is a real, verified request in their README, and honouring it costs nothing.
- **Do not use the Pokémon or Pokémon Champions logos or official key art.** Name the project descriptively; a wordmark is what turns an ignorable fan tool into a trademark problem.
- **No monetisation, no ads, no donations tied to the tool.** Commercial use is the single strongest escalation factor.
- **Keep the roster regeneration script in the repo and the snapshot small.** A derived list of names and stats is a far softer target than a mirror of thousands of sprite files.

**Warning signs:**
- Official artwork or logos anywhere in the repo.
- No attribution section.
- The repo vendors thousands of image files.

**Phase to address:** **P1** (choose the sprite source with licensing in mind — this is a *data* decision, not a legal afterthought). **P2** (footer credits + disclaimer land with the shell).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|---|---|---|---|
| `localStorage.setItem(k, JSON.stringify(state))` with no try/catch | 2 lines, works instantly | Silent total data loss in private mode, over quota, or with two tabs | **Never.** The catch is 3 more lines. |
| Storing tournament state as a mutated blob rather than an event log | Simpler reducers, easier to reason about at first | Kills undo (Pitfall 7), kills the future sync layer that PROJECT.md explicitly wants to preserve, makes "what happened?" unanswerable | Only if undo is formally cut — but undo is the mitigation for the most likely real-world failure |
| Species identified by display name | Reads nicely in the debugger | Breaks on `Farfetch’d` (U+2019), `Mr. Rime`, `Kommo-o`; breaks JSON round-trips; breaks set membership | **Never.** id + displayName from day one. |
| `id.includes('mega')` to find Megas | One line | Catches `meganium`; misses nothing but is wrong in a way nobody notices until someone drafts Meganium in a Mega round | Never — use `forme.startsWith('Mega')` |
| Hardcoding `mod: 'champions'` in the regeneration script | Works today | Silently snapshots a *different regulation* after each rotation (~every 10 weeks) | Only with a regulation assertion + count-delta guard |
| Hotlinking `play.pokemonshowdown.com` sprites | Zero repo weight, no license question | Breaks the offline constraint outright; third-party availability dependency | Acceptable **only** as a progressive enhancement on top of a working offline (icon or text) baseline |
| Shipping without file:// testing | Faster iteration on a dev server | The core "clone and open" promise is dead and you find out at launch | Never — it's a 5-second check |
| `sort()` on priority-card values with no explicit tiebreak | Looks correct in the 2-player test | Silently makes turn order depend on player-entry order, in ~98.5% of 6-player rounds | Never |
| Round-robin ties resolved by array order | Ships standings today | Non-deterministic-looking ordering that shifts between renders; arguments in the group | Acceptable **only** if ties are *displayed as ties* with an explicit host override |
| Deferring the feasibility solver until after the draft engine | Draft engine ships sooner | Every deadlock class becomes a mid-draft bug report instead of a config-screen sentence | Never — it is cheaper before |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|---|---|---|
| **Pokémon Showdown dex data** | Reading `data/pokedex.ts` alone and assuming it is the legal roster | Legality lives in `data/mods/champions/formats-data.ts` via **absence** of `isNonstandard`. Join it to `pokedex.ts` for names/stats/formes. |
| **Showdown legality filter** | `isNonstandard !== 'Past'` | Admits the **11 `Future`** entries (datamined, not yet legal). Correct test is `!entry.isNonstandard`. |
| **Showdown mod naming** | `mod: 'champions'` is a stable identifier | It is **the current regulation** and rotates. `championsregma` is the frozen M-A. Expect `championsregmb` to appear when M-C lands. Pin by commit SHA and assert counts. |
| **Showdown paste import** | Assuming a bare species line always validates | `Venusaur-Mega` imports but **fails validation** — Megas carry `requiredItem`. Also `X @ Y`, ` (M)`/` (F)`, and `Nick (Species)` are parsed specially on line 1. |
| **Showdown sprites** | `name.toLowerCase().replace(/ /g,'-')` | `toID(baseSpecies)` for bases (`mrmime.png`, not `mr-mime.png`); `toID(base) + '-' + toID(forme)` for formes (`venusaur-mega.png`, `charizard-megax.png`). New Champions-original Megas have **no sprite at all** in `gen5/` or `dex/`. |
| **`smogon/sprites` repo** | Vendoring the community BW sprites because the repo is MIT | MIT covers the *code*. README explicitly asks you to talk to them first about community sprites. PokeAPI sprites (CC0) are the cleaner default. |
| **`raw.githubusercontent.com` as a refresh source** | Fetch and use directly | CORS `*` ✅, but the payload is **TypeScript source**. Also `Cache-Control: max-age=300`. |
| **`play.pokemonshowdown.com/data/*`** | Treat as a lightweight API | `teambuilder-tables.js` is **16.1 MB** for ~330 KB of Champions data. `pokedex.js` carries `Cache-Control: max-age=691200` (8 days) — a "live refresh" can serve week-old data. |
| **pokebase.app export** | Assume it takes a Showdown paste | **Unverified.** Test by hand before building against it; ship a plain "copy as text" fallback. |
| **GitHub Pages** | Root-relative asset paths; expecting instant deploys | Project sites live at `/repo/`. Use `./`. Add `.nojekyll`. `Cache-Control: max-age=600` + Fastly means a fix is not instant — version your assets and display the version. |

---

## Performance Traps

Scale here is small; the traps are about *responsiveness on the host's laptop in front of an audience*, not throughput.

| Trap | Symptoms | Prevention | When It Breaks |
|---|---|---|---|
| Rendering all ~300 pool entries with full sprites and stat bars on every state change | Visible lag on each pick; a stutter everyone in the room watches | Render the pool once; mutate only the affected node on pick. The `minimal` display-density mode exists — make it the default at high player counts. | Noticeable ~150+ visible cards on modest hardware, worse with animated `ani/` GIFs |
| Serializing and writing the entire tournament to localStorage on every keystroke | Input lag while typing player names; more windows for a torn write | Debounce writes (~300–500 ms); write on *committed actions*, not on every render | Immediately, on any low-end machine |
| Loading `teambuilder-tables.js` (16.1 MB) for the in-app refresh | A "refresh roster" click that appears to hang for 30 s on a phone hotspot | Don't. Use the file-import refresh path (Pitfall 9). If you must fetch, show progress and never block the UI. | Any connection under ~10 Mbps, i.e. most places friends actually draft |
| Vendoring 300+ full-size sprites into the repo | Slow clone; slow first load over Pages; large git history | Use the single `pokemonicons-sheet.png` spritesheet (~392 KB, one request, verified 200) for pool icons | ~5 MB+ of images |
| Deep-cloning tournament state on every action for undo | Growing memory and GC pauses over a long session | Store an action log + a periodic snapshot, not N full copies | ~200+ actions |

---

## Security & Information-Integrity Mistakes

Standard web security barely applies (no server, no auth, no user data). What matters is **information integrity in a room full of people** and **trusting imported files**.

| Mistake | Risk | Prevention |
|---|---|---|
| Rendering imported tournament JSON (player names, notes) with `innerHTML` | A shared `.json` file is untrusted input; a crafted name executes script in the host's browser. Realistically an accident-vector (`<` in a name breaks rendering) more than an attack, but both are fixed the same way. | Use `textContent`. Never `innerHTML` for any user- or file-supplied string. |
| Importing tournament JSON with no schema validation | A malformed or older-version file puts the app into an invalid state that then autosaves *over* a good one | Validate on import: check `schemaVersion`, required fields, and cross-check every species id against the roster. **Import into a staging slot and require explicit confirm before it replaces the current tournament.** |
| No `schemaVersion` in the persisted object | A future format change silently misreads old saves; the tool can no longer open a tournament it created | Version from commit #1. Refuse to load a version you don't understand, with a clear message, rather than half-loading. |
| Blind-ban state readable from devtools / `localStorage` | Trivially true, and fine for friends — but the app should not *claim* cryptographic secrecy | Be honest in the UI: "blind" means "hidden from the screen," not "hidden from a determined player." |
| Blind bans leaking via bfcache back-navigation | Back button re-renders a previous player's private screen | Handle `pageshow` with `event.persisted` and re-render from authoritative state |
| Autocomplete/history leaking previous players' typed bans | Ban input dropdown shows what the last player typed | `autocomplete="off"`, clear input on submit, distinct field per player |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---|---|---|
| Instant-commit picks | One misclick permanently removes a Pokémon in front of 8 people; the tool loses trust in one moment | Select → confirm → commit, plus bounded undo |
| Turn indicator as a small status-bar label | Constant "wait, is it my turn?" over voice chat — the exact friction the tool exists to remove | Largest element on the page, player colour, ideally an audio cue on change |
| Priority-card ties resolved silently | Players notice the order is arbitrary and stop trusting the app — and at 6+ players this happens nearly every round | Explicit, visible, seeded tiebreak step ("Tie on 3 — rolling…"). Store the seed in state so it survives reload. |
| Blind bans as a masked input field | Everyone still sees the pool, the scroll position, the autocomplete, the submit timing | Full-screen pass-the-device interstitial between every player |
| Mega rounds appearing as a normal round with a filtered pool and no explanation | Players think Pokémon vanished / the app is broken | Round header states the constraint explicitly: **"Round 3 — MEGA ROUND. Only Mega-capable Pokémon (69 available)."** |
| Feasibility problems surfaced as an error toast mid-draft | 40 minutes lost, no recovery, group reaches for a spreadsheet | Live feasibility panel on the config screen; Start disabled with the reason shown |
| No visible "last saved" state | The host has no way to know whether the tournament is safe | Persistent "Saved 3s ago ✓ / ⚠ Not saving" indicator + a permanent Download button |
| Broken-image icons for missing sprites | Reads as "this app is broken," not "this sprite doesn't exist yet" | `onerror` → silhouette + name text |
| Export handed over with no confirmation it works | Player pastes into Showdown, gets a validation error, blames the tool | Show the exact paste text, a Copy button, and a one-line note about what to do with Mega slots |
| No way to correct a recorded match result | Host misclicks a winner; bracket advances wrong; no way back | Every recorded result is editable; re-derive downstream rounds from results rather than mutating a bracket in place |

---

## "Looks Done But Isn't" Checklist

- [ ] **Persistence:** works in normal Chrome — verify it also (a) survives a hard refresh mid-round, (b) detects and warns in incognito, (c) refuses to double-write with two tabs open, (d) still holds the tournament after 8 days on Safari, (e) shows a "last saved" state, (f) has `navigator.storage.persist()` called and its result visible.
- [ ] **Zero-build promise:** works on `localhost` — verify it also works by **double-clicking `index.html`** (no `import`, no `fetch` of local files) and on the **deployed Pages sub-path** (no leading-`/` URLs, `.nojekyll` present).
- [ ] **Roster snapshot:** has the right number of Pokémon — verify it also carries `{regulation, validFrom, validUntil, upstreamCommit, generatedAt, counts}`, that the app **warns when past `validUntil`**, and that the generation script **fails** on an unexpected count delta.
- [ ] **Legality filter:** excludes `Past` — verify it also excludes the **11 `Future`** entries, excludes `battleOnly` non-Megas (`Castform-Sunny`), and does not multiply out cosmetic formes (Vivillon×17, Furfrou×9, Alcremie×8, Florges×4).
- [ ] **Mega detection:** finds ~73 — verify it **excludes `Meganium`**, includes only one draftable unit for Charizard/Raichu/Meowstic (or handles both formes deliberately), and **excludes base Floette** while including Floette-Eternal.
- [ ] **Name handling:** renders fine today — verify `Kommo-o` and `Mr. Rime` survive a full JSON export→import→export round trip, and that a U+2019 `Farfetch’d` would too (it will enter the roster eventually).
- [ ] **Sprites:** most load — verify the **missing-sprite audit** runs in the generation script and that a 404 renders a silhouette, not a broken image. Currently missing in `gen5/`: eelektross-mega, falinks-mega, dragalge-mega, barbaracle-mega, staraptor-mega.
- [ ] **Feasibility check:** catches `pool < players × 6` — verify it also catches Mega-round starvation (`players × megaRounds > megaCapable`, hard ceiling 73), worst-case ban starvation, swap-round leftover starvation, and impossible player counts (~34 hard ceiling at 207 base species) — **all before the draft starts**.
- [ ] **Priority cards:** order computes — verify the **tie path is implemented and visible**, is seeded and reproducible after reload, and doesn't depend on player-entry order. It fires ~98.5% of rounds at 6 players and 100% at 7+.
- [ ] **Swaps:** a swap works — verify a swap **cannot** break a composition requirement (Mega slot ↔ Mega-capable leftovers only), and that leftovers hitting zero is handled rather than crashing.
- [ ] **Brackets:** 8 players works — verify **N=1, 2, 3, 5, 6, 7** and odd counts; byes go to top seeds and are **distributed, not clustered**; a bye is not counted as a played match in standings; seeds 1 and 2 cannot meet before the final.
- [ ] **Standings:** sorts by wins — verify a **3-way cycle** (A>B>C>A) renders as an explicit tie with a host override, not an arbitrary stable-sort order that shifts between renders.
- [ ] **Export:** looks right — verify by pasting into play.pokemonshowdown.com and clicking **Validate** against `[Gen 9 Champions] VGC 2026 Reg M-B`, including a team with a Mega. Then verify pokebase.app separately.
- [ ] **Blind bans:** input is hidden — verify the **back button** doesn't resurrect a previous player's screen (bfcache/`pageshow`), autocomplete is off, and the interstitial fully covers the pool.
- [ ] **Undo:** exists — verify it survives a page reload (i.e. the history is inside the persisted state, not in memory).
- [ ] **Attribution:** README credits sources — verify the **deployed app footer** also shows credits, the fan disclaimer, `APP_VERSION`, and the roster regulation + `generatedAt`.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---|---|---|
| Storage cleared / evicted, no JSON export taken | **CATASTROPHIC — unrecoverable** | None. The tournament is gone. This is why the file is the system of record and why the auto-download checkpoints exist. Prevention is the only strategy. |
| Two tabs clobbered each other | HIGH | If the autosave ring (Pitfall 1, item 7) exists, restore the highest-`generation` entry and replay the few lost picks from memory/chat. Without the ring: reconstruct by hand. |
| Torn / corrupt write | LOW–MEDIUM | Fall back to the previous ring entry; lose at most one action. |
| Deadlock discovered mid-draft (pool dry, Mega round starved) | HIGH | Host loosens the config (raise pool size, drop a Mega round) and **restarts the draft** — everyone re-picks. Preventable entirely at config time; that's why the solver is BLOCKING. |
| Ban phase starved the pool | LOW **if caught at reveal** | Re-run the feasibility check right after the reveal and offer "redo bans." No picks lost. HIGH if discovered in round 4. |
| Misclicked pick, no undo | MEDIUM | Export JSON, hand-edit, re-import. Works only if the schema is human-legible and import validates rather than rejects. Argues for a readable JSON shape. |
| Export rejected by Showdown | LOW | Host retypes six names. Annoying and it damages trust in the tool, but recoverable in a minute. |
| Roster snapshot is a regulation behind | LOW **with detection** | Staleness banner tells the host; they import an updated roster JSON, or the group agrees to house-rule it. Without detection: the group drafts an illegal team and discovers it when someone can't enter it. |
| Wrong regulation silently snapshotted by the generation script | MEDIUM | Count-delta assertion catches it at generation time. Without it, discovered by a player. Re-pin the commit, regenerate, republish. |
| Stale app served from Pages/Fastly cache | LOW | Version query strings on assets; visible `APP_VERSION` lets the host confirm what they have; worst case, hard refresh after ~10 min. |
| DMCA notice | HIGH but very unlikely at this profile | Remove the offending assets (almost certainly sprites), keep the derived data and the tool. Structuring sprites as a swappable layer from day one makes this a config change rather than a rewrite. |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---|---|---|
| 1. Browser storage data loss | **P2 — BLOCKING** | Canary probe blocks start in incognito; two tabs cannot both write; ring of 5 autosaves present; `navigator.storage.persisted()` surfaced; JSON auto-download fires at ban reveal / round 6 / completion |
| 2. Zero-build constraint violated | **P2 — BLOCKING** (roster-as-JS in P1) | `index.html` double-clicked from disk runs a full tournament; deployed Pages sub-path loads every asset; no `import`, no local `fetch`, no leading-`/` URL in the repo; `.nojekyll` present |
| 3. Roster staleness / wrong "legal" list | **P1 — BLOCKING** (banner in P3) | Snapshot header carries regulation + validity + counts + upstream SHA; app warns past `validUntil`; generation script fails on >10% count delta; filter is `!isNonstandard` |
| 4. Forme identity (Mega / regional / cosmetic / battle-only / names) | **P1 — BLOCKING** (consumed P5) | Fixture test over Kommo-o, Mr. Rime, Meowstic-M/F-Mega, Floette-Mega, Castform-Sunny, Charizard-X/Y, Raichu-X/Y, Meganium, Vivillon passes; Mega-capable count matches the chosen unit exactly |
| 5. Sprite naming + missing sprites | **P1** (derivation + audit), **P5** (fallback UI) | Sprite-id function passes the same fixture set; generation script reports missing sprites by name; a forced 404 renders a silhouette |
| 6. Draft deadlocks (D1–D9) | **P3 — BLOCKING** (D4→P5, D6→P6, D8/D9→P8) | `checkFeasibility()` is a pure, unit-tested function; Start is disabled with a stated reason for each of D1/D2/D3/D5/D7; re-runs after ban reveal; tie rule implemented, seeded, and visible; bracket tested at N=1,2,3,5,6,7 |
| 7. Hot-seat leakage / misclicks / turn clarity | **P4** (pass-the-device, bfcache), **P5** (confirm+undo, turn indicator); state shape decided **P2** | Back button cannot resurrect a private ban screen; every destructive action needs confirm; undo survives reload; turn owner legible from across the room |
| 8. Export validates in Showdown | **P7** (spike in **P1**) | A Mega-containing team pasted into play.pokemonshowdown.com passes **Validate** against `[Gen 9 Champions] VGC 2026 Reg M-B`; pokebase.app behaviour documented; plain-text fallback exists |
| 9. Scope balloon (brackets / config / pipeline) | **Roadmapping + every phase boundary** | Draft-only depth ships and runs end to end before any bracket work; config screen ≤ ~8 controls; live in-app refresh reframed as roster-JSON import for v1 |
| 10. IP / attribution | **P1** (sprite source choice), **P2** (footer) | Deployed footer shows credits + fan disclaimer; sprite source license recorded in README; no official logos or key art in the repo |

---

## Sources

**Browser storage (HIGH confidence — official)**
- MDN, *Storage quotas and eviction criteria* — quotas per browser, best-effort vs persistent, LRU eviction, whole-origin deletion, Safari 7-day rule — https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- MDN, *StorageManager.persist()* — availability since Dec 2021; Chromium/Safari auto-decide, Firefox prompts — https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist
- WebKit, *Updates to Storage Policy* — eviction exemptions incl. persistent mode — https://webkit.org/blog/14403/updates-to-storage-policy/
- WebKit ITP 7-day cap coverage (LocalStorage, IndexedDB, SessionStorage, Media keys, Service Worker registrations; home-screen web apps exempt) — https://searchengineland.com/what-safaris-7-day-cap-on-script-writeable-storage-means-for-pwa-developers-332519
- WebKit bug 157010, *QuotaExceededError when saving to localStorage in private mode* — https://bugs.webkit.org/show_bug.cgi?id=157010
- MDN, *beforeunload* — generic message only, sticky activation required, unreliable on mobile — https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event
- `pubkey/broadcast-channel` and Web Locks leader-election patterns — https://github.com/pubkey/broadcast-channel

**Static hosting / zero-build (HIGH — verified by live probe + official docs)**
- Live probe 2026-08-03: `curl -I https://xetoxyc.github.io/gothic-remake-lockpicker/` → `Cache-Control: max-age=600`, `X-Served-By: cache-dfw-…` (Fastly)
- GitHub community discussion, *Caching assets in website served from GitHub Pages* — https://github.com/orgs/community/discussions/11884
- GitHub community discussion, *configure base path for project site* — https://github.com/orgs/community/discussions/188844
- MDN, *Cache-Control* — https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control
- Kent C. Dodds, *Why I don't commit generated files to master* — https://kentcdodds.com/blog/why-i-dont-commit-generated-files-to-master

**Pokémon Champions roster & regulations (HIGH for Showdown data read directly; MEDIUM for press/community counts)**
- Showdown source read directly at master, 2026-08-03: `config/formats.ts` (Champions section: `mod: 'champions'` = Reg M-B, `mod: 'championsregma'` = Reg M-A), `data/mods/champions/formats-data.ts`, `data/mods/championsregma/items.ts`, `data/pokedex.ts`, `data/aliases.ts`, `sim/dex-data.ts` (`toID`), `sim/teams.ts` (`parseExportedTeamLine`), `sim/team-validator.ts` (`battleOnly` / `requiredItems` handling), `data/FORMES.md` — https://github.com/smogon/pokemon-showdown
- Counts (311 legal / 207 base / 76 Megas / 73 base-with-Mega / 11 `Future`) computed locally from `data/mods/champions/formats-data.ts` × `data/pokedex.ts`
- Victory Road, *Pokémon Champions — Regulations* (M-A 8 Apr–17 Jun 2026; M-B 17 Jun–2 Sep 2026; roster expands rather than contracts) — https://victoryroad.pro/champions-regulations/
- Pokemon.com, *Regulation Set M-B Kicks off a New Ranked Battles Season* — https://www.pokemon.com/us/pokemon-news/regulation-set-m-b-kicks-off-a-new-ranked-battles-season-and-battle-pass-in-pokemon-champions
- Pokemon.com, Switch release 8 Apr 2026 / mobile 17 Jun 2026 — https://www.pokemon.com/us/news/pokemon-champions-releases-on-nintendo-switch-and-nintendo-switch-2-on-april-8-2026
- Game8 Regulation M-A and M-B roster pages (186 + 59 Megas in M-A; +22 / +15 in M-B) — https://game8.co/games/Pokemon-Champions/archives/601460
- One-Mega-per-battle rule — https://pikachampions.com/guides/pokemon-champions-mega-evolutions

**Sprites & data endpoints (HIGH — live HTTP probes 2026-08-03)**
- `play.pokemonshowdown.com/sprites/gen5/*` probed: `mrmime.png` 200 / `mr-mime.png` 404; `venusaur-mega.png` 200; `charizard-megax.png` 200; `farfetchd-galar.png` 200; `eelektross-mega.png` / `falinks-mega.png` / `dragalge-mega.png` / `barbaracle-mega.png` / `staraptor-mega.png` **404**
- `play.pokemonshowdown.com/data/teambuilder-tables.js` — 16,095,702 bytes, contains a `champions` key (~330 KB), CORS `*`
- `play.pokemonshowdown.com/data/pokedex.js` — 459,985 bytes, `Cache-Control: max-age=691200`, CORS `*`
- `pokemonicons-sheet.png` — 392,317 bytes, 200
- `raw.githubusercontent.com` — CORS `*`, `Cache-Control: max-age=300`, serves TypeScript source

**Licensing / IP (HIGH for repo licenses; MEDIUM for enforcement pattern)**
- `smogon/sprites` README — sprites are Nintendo/Game Freak/TPC property; community sprite license undetermined, "please talk to us first before using them"; code MIT — https://github.com/smogon/sprites
- `PokeAPI/sprites` — CC0 — https://github.com/PokeAPI/sprites
- `PokeAPI/pokeapi` LICENSE.md — BSD-3-Clause + "Pokémon and Pokémon character names are trademarks of Nintendo" — https://github.com/PokeAPI/pokeapi/blob/master/LICENSE.md
- Nintendo Life, *Nintendo Issues Mass DMCA Takedown, 379 Fan-Made Games Forcibly Removed* — https://www.nintendolife.com/news/2021/01/nintendo_issues_mass_dmca_takedown_379_fan-made_games_forcibly_removed
- Nintendo Life, *Takedown Of Fan-Made Game Creator Pokémon Essentials* — https://www.nintendolife.com/news/2018/08/nintendo_enforces_takedown_of_fan-made_game_creator_pokemon_essentials

**Tournament structure & UX (MEDIUM)**
- Wikipedia, *Bye (sports)*; *Double-elimination tournament* — bye distribution to top seeds — https://en.wikipedia.org/wiki/Bye_(sports)
- USA Ultimate, *Tie breakers for round-robins* — 3-way cycle failure of head-to-head — http://pvinvite.org/wp-content/uploads/2014/02/USAU-Tie-Breaker-Rules.pdf
- arXiv 2103.06023, *The efficacy of tournament designs*; arXiv 2005.02280 — unsoundness of goal-difference and head-to-head with unplayed matches
- Tabletopia, *Hotseat Mode* — pass-the-device hidden-information handling — https://tabletopia.com/news/hotseat-mode
- Wikipedia, *Hotseat (multiplayer mode)* — https://en.wikipedia.org/wiki/Hotseat_(multiplayer_mode)

**Computed locally (HIGH — reproducible arithmetic)**
- Priority-card tie probability P(≥1 tie) = 1 − P(6,n)/6ⁿ: 16.67% (2p), 44.44% (3p), 72.22% (4p), 90.74% (5p), 98.46% (6p), 100% (≥7p)
- Mega-round ceiling: `players × megaRounds ≤ 73`
- Pool ceiling: `players × 6 ≤ 207` → ~34 players absolute, ~27 at a 25% leftover target

---
*Pitfalls research for: zero-backend static-site Pokémon Champions draft tournament tool*
*Researched: 2026-08-03*
