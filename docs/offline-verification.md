# Phase 1 close-out verification

The record of the chores that no automated check can discharge: a real draft on real
hardware with the network switched off, the `file://` documentation chore (D-18), and the
five ROADMAP Phase 1 success criteria marked met or not met with evidence.

**Status: AWAITING HUMAN OBSERVATION.**

Everything an agent can verify is filled in below and marked `AUTOMATED`. Everything that
requires a browser is marked `PENDING` and is deliberately left blank rather than inferred
from reading the code. SHEL-03 and ROST-02 both rest on section A, and section A has not
been observed by anyone yet.

- Live URL: <https://hyper-mage.github.io/Pokemon-champions-drafter/>
- Build under test: cache `champions-drafter-03465a622b2d`
- Precache: 322 URLs — 312 sprites, 6 data files, 2 hashed assets, `index.html`, and the
  bare directory URL. 903.7 kB total.

> The cache version is derived from the content of every precached file. If the deployed
> worker reports a name other than `champions-drafter-03465a622b2d`, something under
> `src/` or `public/` changed after this document was written — that is informative, not
> a failure. Record whatever it actually says.

---

## A. Offline — SHEL-03, ROST-02, success criterion 1

`PENDING`

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

`PENDING`

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

`PENDING`

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

**Verbatim console output from D2:**

```
(paste here — do not paraphrase)
```

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
| 1 | Opens with no install/account/payment; after first load the draft keeps working **with the network off**. | `PENDING` | Depends entirely on section A. The worker, the 322-URL manifest, and the registration are built and unit-tested, but offline has not been observed on hardware. |
| 2 | Two players alternate 6 rounds against the committed regulation-stamped snapshot; Mega-capability derived from the Champions mod; cosmetic and battle-only formes absent; Rotom and Tauros-Paldea present; Charizard carries both Megas; every entry shows a sprite or a visible fallback; a picked species leaves the pool immediately. | `PARTIAL — automated` | The roster classifications (Meganium/Feraligatr Mega-capable, Typhlosion not, Vivillon and battle-only formes excluded, Rotom appliances and Tauros-Paldea present, Charizard X/Y) are pinned by the hostile-species fixture test from plan 01-03 and run on every push. The **visual** half — sprites and immediate pool removal — is section A6. |
| 3 | Undo returns the board exactly to its prior state. | `PENDING` | Section B1–B2. Covered by `tests/core/undo.test.ts` and the fold-equivalence test, but not observed in the UI. |
| 4 | Refresh, closed browser, or second tab never loses or silently overwrites a draft; storage canary warns up front; JSON checkpoint at milestones; download and re-import on another machine. | `PENDING` | Section B3–B6. The tab-ownership lock, the canary, and the import guard are unit-tested; the cross-machine round trip is not. |
| 5 | Each team copies out as a blank-line-separated species-only paste importing into **both** Showdown and pokebase, Mega slots as `Species @ StoneItemName`, no `transforms in-battle` error. | `PARTIAL — recorded` | The paste format and the Mega/`transforms in-battle` half were hand-verified in plan 01-08 against `gen9championsvgc2026regmb` — see `docs/export-verification.md`. What section C adds is the **end-to-end** confirmation that the deployed UI's own output imports into both targets. |

**Do not mark this phase complete on criteria 1, 3, or 4 until sections A and B are filled
in.** If a criterion turns out not to be met, say so here and name the plan that must close
the gap rather than softening the wording.
