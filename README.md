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

## Deployment

Every push to the default branch runs `.github/workflows/deploy.yml`, which self-tests the purity gate, enforces it, runs the tests, and builds — and only then deploys to GitHub Pages. A failing gate or a red test can never reach the live URL.

## Disclaimer

This is a non-commercial fan project. It is **not affiliated with, endorsed by, or associated with Nintendo, Creatures Inc., or GAME FREAK Inc.** Pokémon and all related names and imagery are © Nintendo / Creatures Inc. / GAME FREAK Inc.

No ads, no tracking, no payment, ever.
