# Pokémon Champions Drafter

A browser-based tool for running fantasy-style Pokémon draft tournaments among friends, built around the legal roster and rules of Pokémon Champions.

## Play it

**https://hyper-mage.github.io/Pokemon-champions-drafter/**

Open the link and play. No install, no account, no payment, no server. Everything runs in your browser, and your tournament state stays on your machine.

### Why the link, and not the repo

Cloning the repository and double-clicking `index.html` **will not work**, and that is deliberate. The app is an ES-module build served over HTTP; opening it from `file://` gives the page an opaque origin, which blocks module loading outright.

The hosted link above is the delivery path. Use it.

## Local development

Requires Node 24 or newer.

```bash
npm install     # install dependencies
npm run dev     # start the dev server with hot reload
npm run verify  # the one command that decides green or not green
```

`npm run verify` runs the pure-core boundary check, the test suite, and a full typechecked production build, in that order. It is the same gate CI enforces before anything reaches the live URL.

### Other scripts

| Script | What it does |
| --- | --- |
| `npm run build` | Typechecks both tsconfigs, then builds to `dist/` |
| `npm run preview` | Serves the built `dist/` locally |
| `npm run test` | Runs the test suite once |
| `npm run test:watch` | Runs the test suite in watch mode |
| `npm run typecheck` | Typechecks without emitting |
| `npm run check:pure` | Enforces the pure-core boundary (no DOM, clock, randomness, network, or storage in `src/core/`) |
| `npm run check:pure:selftest` | Proves the purity gate itself still detects violations |
| `npm run build:roster <id>` | Regenerates one regulation snapshot in `public/data/` from the pinned Showdown mod |
| `npm run build:sprites` | Resolves every roster entry to a PokeAPI sprite, downloads any that are missing, and measures them |
| `npm run build:data` | Runs both roster regulations then the sprites, in order |

The `build:*` scripts regenerate committed data. You do not need them to run the
app — the roster snapshots and all 311 sprites are already in the repository, which
is what makes the app work offline. Run them only when a regulation rotates or
upstream art changes.

## Deployment

Every push to the default branch runs `.github/workflows/deploy.yml`, which self-tests the purity gate, enforces it, runs the tests, and builds — and only then deploys to GitHub Pages. A failing gate or a red test can never reach the live URL.

## Credits and licence

This project redistributes sprite art and roster data created by other people.
**[ATTRIBUTION.md](ATTRIBUTION.md)** records exactly what, from where, under what
terms, and on what date those terms were read.

The short version:

- **Sprites** come from [PokeAPI](https://pokeapi.co/). Its repository is CC0 1.0
  Universal, so redistributing the files is permitted — but PokeAPI states plainly
  that the artwork itself remains Copyright The Pokémon Company. The sprites are
  **not** public domain. 190 of the 311 committed sprites are custom work by the
  [Smogon](https://www.smogon.com/) community; they are named individually in
  ATTRIBUTION.md.
- **Roster and legality data** come from
  [smogon/pokemon-showdown](https://github.com/smogon/pokemon-showdown) under MIT.

## Disclaimer

This is a non-commercial fan project. It is **not affiliated with, endorsed by, or associated with Nintendo, Creatures Inc., or GAME FREAK Inc.** Pokémon and all related names and imagery are © Nintendo / Creatures Inc. / GAME FREAK Inc.

No ads, no tracking, no payment, ever.
