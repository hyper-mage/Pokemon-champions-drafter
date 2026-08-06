# Phase 1 close-out verification

The record of the chores that no automated check can discharge: a real draft on real
hardware with the network switched off, the `file://` documentation chore (D-18), and the
five ROADMAP Phase 1 success criteria marked met or not met with evidence.

**Status: SECTIONS A–D OBSERVED AND PASSED (2026-08-06). Section E awaits a second deploy.**

Everything an agent can verify is marked `AUTOMATED`. Everything requiring a browser was
observed by the project author on **Firefox** against the deployed build and is recorded
below with its result. **SHEL-03 and ROST-02 rest on section A, which passed.**

Section E cannot be run yet by construction — it tests whether a *second* deploy safely
supersedes the first, so it needs another deploy to exist.

- Live URL: <https://hyper-mage.github.io/Pokemon-champions-drafter/>
- Build under test: cache **`champions-drafter-45336e7842a1`** (confirmed live)
- Precache: 322 URLs — 312 sprites, 6 data files, 2 hashed assets, `index.html`, and the
  bare directory URL. 903.7 kB total.

> The cache version is derived from the content of every precached file, so it moves
> whenever anything under `src/` or `public/` changes. Three different values appeared
> legitimately during this phase — `03465a622b2d` when this document was drafted,
> `1133fbe56af5` after a local line-ending normalisation, and `45336e7842a1` from the CI
> build that actually deployed. That is the mechanism working, not drift. Always read the
> value off the running worker.

**Browser-terminology note.** This checklist was written Chrome-first. Firefox reports a
live service worker as **`Running`/`Stopped`**, not `activated`, and its Cache Storage
panel shows **no entry-count total**. Both differences cost real time during the first
run-through; the steps below still say "activated" and "count the entries" because that is
what Chrome shows. On Firefox, `Running` is the pass condition, and the count comes from
the console snippet in section A.

---

## A. Offline — SHEL-03, ROST-02, success criterion 1

**PASSED — observed 2026-08-06 by the project author, Firefox, against the deployed
`champions-drafter-45336e7842a1` build.** A service worker was present and live; with the
network off the app reloaded and a full draft ran; the whole pool was scrolled with **no
broken images**.

Two notes on reading the evidence honestly:

- **Firefox reports a live worker as `Running`/`Stopped`, not `activated`.** This checklist
  was written Chrome-first. `Running` is the same state; the wording differs. Rewritten
  below.
- **The 322-entry count was not counted.** Firefox's Cache Storage panel shows no total.
  The cache was present and offline demonstrably worked, which is what SHEL-03 and ROST-02
  actually require — but the exact entry count remains unconfirmed by observation. It is
  pinned by `tests/build/sw-manifest.test.ts` against the generated manifest. To confirm on
  hardware, run in the page console:
  `caches.keys().then(async ks => { for (const k of ks) console.log(k, (await (await caches.open(k)).keys()).length); });`

| Step | What to do | What to look for | Observed |
| ---- | ---------- | ---------------- | -------- |
| A1 | Open the live URL in a **fresh browser profile** (or a fresh incognito window). Let it finish. | First load pulls ~1 MB across ~322 requests. This is the accepted D-16 cost and happens once. | |
| A2 | DevTools → Application → Service Workers. | Exactly one worker, status **activated**. Note its script URL. | |
| A3 | DevTools → Application → Cache Storage. | One cache named `champions-drafter-…`. Note the exact name and the entry count — expect **322**. | |
| A4 | Confirm the cache holds real inventory: filter for `sprites/` and for `data/roster`. | ~312 sprite entries; `roster.mb.json`, `roster.ma.json`, `roster.index.json`, `sprite-meta.json`. | |
| A5 | Go **fully offline** — switch off Wi-Fi, or DevTools → Network → Offline. Reload. | The app loads. Not the browser's offline page. | |
| A6 | Still offline, run a **complete draft**: 12 picks, 6 rounds. | Every sprite renders. **Zero broken images.** Scroll the whole pool, not just the top. | |
| A7 | Timings. | How long the first load took, and whether the offline reload felt instant. | |

**Record here:** cache name, entry count, whether the draft completed offline, and any
broken image (which species, which round).

---

## B. Undo and persistence — success criteria 3 and 4

**PASSED — observed 2026-08-06, Firefox.** Undo works by button and by Ctrl+Z. JSON
download and import both work, and the import path behaves correctly in both states: it
imports directly into an empty tournament, and asks for confirmation before replacing a
tournament already in progress. The cross-machine leg was not exercised — the round trip
was performed on one machine — but the file is the transport either way.

| Step | What to do | What to look for | Observed |
| ---- | ---------- | ---------------- | -------- |
| B1 | Mid-draft, click `Undo last pick` three times. | Board, pool, and turn banner all roll back exactly. The three species **reappear in the pool**. | |
| B2 | Press Ctrl+Z (Cmd+Z on macOS) once more. | A fourth pick undoes. | |
| B3 | Close the browser **entirely**. Reopen, return to the URL. | The draft is exactly where you left it. | |
| B4 | Click `Download JSON`. | A file downloads. Note its name. | |
| B5 | DevTools → Application → Storage → Clear site data. Reload. | The draft is gone; you get a fresh start. | |
| B6 | `Import JSON…` the file from B4. | The draft resumes at the same pick, with the same teams. | |

---

## C. Export — success criterion 5

**PASSED — observed 2026-08-06.** Teams exported from the app imported into both
play.pokemonshowdown.com and pokebase.app with no problems. This complements the plan
01-08 spike, which separately confirmed (user-verified) that pokebase accepts and
*interprets* the `@ StoneItemName` line, rendering the Mega as active.

| Step | What to do | What to look for | Observed |
| ---- | ---------- | ---------------- | -------- |
| C1 | Finish the draft. | The checkpoint prompt appears reading `Draft complete — save a copy?`, and **nothing downloaded on its own**. | |
| C2 | Look at the export area. | **One panel per player.** Never a single combined block. | |
| C3 | Read the `<pre>` text closely. | A **visible blank line between every species**. This is the single most likely export bug in the project. | |
| C4 | Copy one player's paste into <https://play.pokemonshowdown.com> teambuilder → Import. | **Six** Pokémon appear, not one. | |
| C5 | Import the same text into <https://pokebase.app> ("New/Import Team" → paste). | **Six** Pokémon appear. | |

> Phase 1 drafts have no Mega slots, so criterion 5's `Species @ StoneItemName` and the
> `transforms in-battle` validator check are not reachable from the UI here. They were
> verified directly against `gen9championsvgc2026regmb` during plan 01-08 and are recorded
> in `docs/export-verification.md`. Note in C which half you are confirming.

---

## D. The `file://` documentation chore — D-17, D-18

**This test is expected to FAIL, and that is the accepted outcome.** D-17 decided the
hosted Pages link is the delivery path; D-18 says run the test anyway to document the
behaviour rather than guess at it. Do not "fix" anything it reveals.

### D-auto: what the built output already tells us `AUTOMATED`

`dist/index.html` loads the app with a single **absolute, module-type** script:

```html
<script type="module" crossorigin src="/Pokemon-champions-drafter/assets/index-RKy-BDIb.js"></script>
<link rel="stylesheet" crossorigin href="/Pokemon-champions-drafter/assets/index-B1p51-mD.css">
```

Two independent reasons this cannot work from `file://`, both structural:

1. The paths are **absolute**. From `file://`, `/Pokemon-champions-drafter/assets/…`
   resolves against the filesystem root, not the `dist/` folder — so it points at
   somewhere that does not exist regardless of CORS.
2. `type="module"` is fetched with CORS semantics and a `file://` page has a **null
   origin**, so it is blocked even when the path is right. A service worker additionally
   requires a secure context and cannot register at all.

This matches CLAUDE.md's existing note that the author's own reference site would not work
from `file://` either. It is a property of the delivery model, not a defect in this build.

### D-auto: the D-17 hedge `AUTOMATED — PASSES`

`dist/data/roster.mb.js` is the escape hatch D-17 paid for: a **classic** script (not a
module), so it is not CORS-checked and does load from `file://`. Executed directly:

```
assigned: true
regulation: M-B
entries: 235
checksum: sha256-952dc741977d3...
```

It assigns `globalThis.__CHAMPIONS_ROSTER__` with all 235 M-B entries. The mechanism works.
What remains for a human is only whether a `file://` page can load it in a real browser.

### D-manual `PENDING`

| Step | What to do | Observed |
| ---- | ---------- | -------- |
| D1 | `npm run build`, then literally double-click `dist/index.html`. | |
| D2 | Record **verbatim** console output — every error, exact wording. | |
| D3 | Record what renders: blank page, partial shell, unstyled content. | |
| D4 | Make a scratch `.html` file next to `dist/data/` containing only `<script src="./data/roster.mb.js"></script>` plus a line that logs `globalThis.__CHAMPIONS_ROSTER__.entries.length`. Open it over `file://`. | |
| D5 | Record whether the global was assigned (expected: **yes**, 235 entries). | |

**Verbatim console output from D2:** observed 2026-08-06, **Firefox**.

```
Cross-Origin Request Blocked: The Same Origin Policy disallows reading the remote resource at file:///Pokemon-champions-drafter/assets/index-RKy-BDIb.js. (Reason: CORS request not http).
Cross-Origin Request Blocked: The Same Origin Policy disallows reading the remote resource at file:///Pokemon-champions-drafter/assets/index-B1p51-mD.css. (Reason: CORS request not http).
Cross-Origin Request Blocked: The Same Origin Policy disallows reading the remote resource at file:///Pokemon-champions-drafter/assets/index-RKy-BDIb.js. (Reason: CORS request not http).
Module source URI is not allowed in this document: “file:///Pokemon-champions-drafter/assets/index-RKy-BDIb.js”. index.html:11:97
Cross-Origin Request Blocked: The Same Origin Policy disallows reading the remote resource at file:///Pokemon-champions-drafter/assets/index-B1p51-mD.css. (Reason: CORS request not http).
```

**This confirms both predicted causes independently, which is why no build change can fix it.**

1. **Absolute base resolves against the filesystem root.** The requested path is
   `file:///Pokemon-champions-drafter/assets/…` — the Vite base `/Pokemon-champions-drafter/`
   is absolute, so over `file://` it resolves from the drive root rather than from the
   directory `index.html` sits in. The asset is nowhere near there.
2. **Module scripts are CORS-blocked from a null origin.** `Module source URI is not
   allowed in this document` fires even for a path that *does* resolve, because
   `<script type="module">` is subject to CORS and a `file://` document has an opaque origin.

Fixing (1) with a relative base would still leave (2). The reference project named in
CLAUDE.md has the same property. D-17/D-18's expectation that `file://` does not work is
**correct and current**, not a stale assumption — "clone and it works" means opening the
Pages link. Nothing here should be contorted to chase it.

---

## E. Deploy freshness — D-15

`PENDING`

The worker deliberately does **not** force itself active or seize open clients. A new build
installs in the background and takes over on the next tab open. One stale session after a
deploy is the accepted price for never disrupting a host mid-draft.

| Step | What to do | What to look for | Observed |
| ---- | ---------- | ---------------- | -------- |
| E1 | With a draft in progress in an open tab, push a trivial change and let the workflow deploy. | The running draft is **not** interrupted. No reload, no lost picks. | |
| E2 | DevTools → Application → Service Workers, same tab. | A second worker listed as **waiting**. | |
| E3 | DevTools → Application → Cache Storage, same tab. | **Two** `champions-drafter-…` caches — the old one still serving, the new one populated and waiting. | |
| E4 | Close **every** tab on the origin, then open a new one. | The new build is serving, and Cache Storage is back to **one** cache — the new worker's `activate` deleted the old one. | |

Two properties worth confirming explicitly while you are in there, because they are the
ones that would bite on the *second* deploy rather than this one:

- **No mixed-version state.** Each cache holds one build's `index.html` together with that
  same build's hashed JS and CSS, so a tab can never get new HTML pointing at assets that
  were evicted. Confirm at E3 that both caches are individually complete.
- **The worker script itself is never precached.** It is excluded from the manifest and
  registered with `updateViaCache: 'none'`, so the update check always reaches the network.
  If it were cached, a bad worker would be permanent. Confirm `sw.js` does **not** appear
  in Cache Storage.

---

## ROADMAP Phase 1 success criteria

Each is marked met or not met **with evidence**. Nothing here is claimed from reading code.

| # | Criterion (abbreviated) | Status | Evidence |
| - | ----------------------- | ------ | -------- |
| 1 | Opens with no install/account/payment; after first load the draft keeps working **with the network off**. | **MET** | Section A passed 2026-08-06, Firefox: network off, reload succeeded, full draft ran, no broken images across the whole pool. |
| 2 | Two players alternate 6 rounds against the committed regulation-stamped snapshot; Mega-capability derived from the Champions mod; cosmetic and battle-only formes absent; Rotom and Tauros-Paldea present; Charizard carries both Megas; every entry shows a sprite or a visible fallback; a picked species leaves the pool immediately. | `PARTIAL — automated` | The roster classifications (Meganium/Feraligatr Mega-capable, Typhlosion not, Vivillon and battle-only formes excluded, Rotom appliances and Tauros-Paldea present, Charizard X/Y) are pinned by the hostile-species fixture test from plan 01-03 and run on every push. The **visual** half — sprites and immediate pool removal — is section A6. |
| 3 | Undo returns the board exactly to its prior state. | **MET** | Section B passed 2026-08-06: undo works by button and Ctrl+Z, on top of the fold-equivalence test in tests/core/reduce.test.ts. |
| 4 | Refresh, closed browser, or second tab never loses or silently overwrites a draft; storage canary warns up front; JSON checkpoint at milestones; download and re-import on another machine. | **MET** | Section B passed 2026-08-06; the cross-tab lock was separately user-approved at plan 01-09. Cross-*machine* transfer not exercised — the round trip ran on one machine, but the JSON file is the transport either way. |
| 5 | Each team copies out as a blank-line-separated species-only paste importing into **both** Showdown and pokebase, Mega slots as `Species @ StoneItemName`, no `transforms in-battle` error. | `PARTIAL — recorded` | The paste format and the Mega/`transforms in-battle` half were hand-verified in plan 01-08 against `gen9championsvgc2026regmb` — see `docs/export-verification.md`. What section C adds is the **end-to-end** confirmation that the deployed UI's own output imports into both targets. |

**Do not mark this phase complete on criteria 1, 3, or 4 until sections A and B are filled
in.** If a criterion turns out not to be met, say so here and name the plan that must close
the gap rather than softening the wording.
