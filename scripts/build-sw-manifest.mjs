#!/usr/bin/env node
/**
 * SHEL-03 — inject the real precache manifest into `dist/sw.js` after `vite build`.
 *
 * Usage:
 *   node scripts/build-sw-manifest.mjs
 *   (runs automatically as the last step of `npm run build`)
 *
 * `public/sw.js` ships with two raw tokens. This script walks the actual build
 * output and substitutes them, which is the only way the manifest can be correct:
 * Vite content-hashes `assets/index-<hash>.js`, so a hardcoded list would be wrong
 * on the very next build.
 *
 * Two tripwires, both deliberately fatal:
 *
 *   1. Fewer than MIN_ENTRIES files means `public/sprites/` did not reach `dist/`.
 *      Without this the build would ship a worker that believes it is
 *      offline-complete while the pool renders 312 broken images (T-01-49).
 *   2. `dist/index.html` not referencing BASE means the Vite base path moved and
 *      every URL in this manifest is a 404 waiting to happen.
 *
 * On the version string — this is the part that is easy to get wrong. The version
 * names the cache, so it is what makes a redeploy reach an existing visitor
 * (D-15). Hashing only the sorted URL list is NOT sufficient: Vite hashes the
 * names of files it builds, but everything under `public/` keeps a stable name
 * forever. A regenerated `roster.mb.json` or a redrawn sprite would leave the URL
 * list byte-identical, the version unchanged, the cache name unchanged — and the
 * old bytes served to returning visitors indefinitely, with no way out. So the
 * hash covers the CONTENT of every file as well as its URL.
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

/** Must match `base` in vite.config.ts. Asserted against the build below. */
const BASE = '/Pokemon-champions-drafter/';

/** 312 sprites alone clear this. Anything under it means `public/` went missing. */
const MIN_ENTRIES = 300;

/**
 * `sw.js` cannot precache itself — the browser fetches it out-of-band on every
 * update check, and caching it would be the one way to make a stale worker
 * permanent. `.nojekyll` is a Pages build marker the app never requests.
 * Sourcemaps are devtools-only: the running app never fetches them, and every
 * extra URL in an all-or-nothing `addAll` widens the install failure surface
 * (T-01-48) for something offline play does not use.
 */
const EXCLUDED = new Set(['sw.js', '.nojekyll']);
const isExcluded = (rel) => EXCLUDED.has(rel) || rel.endsWith('.map');

/**
 * Anything outside this set would need percent-encoding, and encoding it here
 * without knowing how the app spells it in an `src` attribute is how you get a
 * cache key that never matches. Fail instead and let a human decide.
 */
const SAFE_PATH = /^[A-Za-z0-9._\/-]+$/;

const distDir = resolve(process.cwd(), 'dist');

function walk(dir, prefix = '') {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name);
    const rel = prefix === '' ? name : `${prefix}/${name}`;
    if (statSync(abs).isDirectory()) {
      out.push(...walk(abs, rel));
    } else {
      out.push({ rel, abs });
    }
  }
  return out;
}

function fail(message) {
  console.error(`build-sw-manifest: ${message}`);
  process.exit(1);
}

// --- Preconditions -----------------------------------------------------------

let swSource;
try {
  swSource = readFileSync(join(distDir, 'sw.js'), 'utf8');
} catch {
  fail('dist/sw.js not found. Run `vite build` first; public/sw.js is copied verbatim.');
}

let indexHtml;
try {
  indexHtml = readFileSync(join(distDir, 'index.html'), 'utf8');
} catch {
  fail('dist/index.html not found. The build did not produce an entry point.');
}

if (!indexHtml.includes(BASE)) {
  fail(
    `dist/index.html does not reference "${BASE}". The Vite base path changed; ` +
      'update BASE in this script to match vite.config.ts or every precached URL 404s.',
  );
}

for (const token of ['__SW_VERSION__', '__PRECACHE_MANIFEST__']) {
  if (!swSource.includes(token)) {
    fail(`dist/sw.js has no ${token}. Already injected, or public/sw.js lost its tokens.`);
  }
}

// --- Collect -----------------------------------------------------------------

const files = walk(distDir).filter((f) => !isExcluded(f.rel));

const unsafe = files.filter((f) => !SAFE_PATH.test(f.rel));
if (unsafe.length > 0) {
  fail(`path needs percent-encoding, refusing to guess: ${unsafe.map((f) => f.rel).join(', ')}`);
}

// The bare directory URL is what a visitor actually types. It is served the same
// bytes as index.html but is a distinct cache key, so it needs its own entry.
const urls = [BASE, ...files.map((f) => BASE + f.rel)].sort();

if (urls.length < MIN_ENTRIES) {
  fail(
    `precache manifest has ${urls.length} entries, expected at least ${MIN_ENTRIES}. ` +
      'public/sprites/ almost certainly did not reach dist/ — shipping this would ' +
      'produce a worker that reports offline-ready while the pool renders broken images.',
  );
}

// --- Version -----------------------------------------------------------------

const versionHash = createHash('sha256');
let totalBytes = 0;
for (const file of [...files].sort((a, b) => (a.rel < b.rel ? -1 : 1))) {
  const bytes = readFileSync(file.abs);
  totalBytes += bytes.length;
  versionHash.update(file.rel);
  versionHash.update('\0');
  versionHash.update(createHash('sha256').update(bytes).digest());
  versionHash.update('\0');
}
const version = versionHash.digest('hex').slice(0, 12);

// --- Inject ------------------------------------------------------------------

const injected = swSource
  .replace('__SW_VERSION__', version)
  .replace('__PRECACHE_MANIFEST__', JSON.stringify(urls));

writeFileSync(join(distDir, 'sw.js'), injected);

const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
const sprites = urls.filter((u) => u.includes('/sprites/')).length;
const data = urls.filter((u) => u.includes('/data/')).length;

console.log(
  `build-sw-manifest: cache champions-drafter-${version} — ` +
    `${urls.length} URLs (${sprites} sprites, ${data} data), ${kb(totalBytes)} precached`,
);
