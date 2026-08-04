#!/usr/bin/env node
/**
 * ROST-11 — resolve every roster entry to a PokeAPI sprite, commit the art, and
 * measure it.
 *
 * Usage:
 *   node scripts/build-sprites.mjs [--force-placeholder] [--refresh-index]
 *   npm run build:sprites
 *
 * Sprite resolution is part of snapshot generation, not a runtime concern. The
 * app never asks whether a sprite exists: this script answers that question at
 * build time, commits the answer as `spriteMissing` on the roster entry, and
 * commits the art itself so the pool renders with no network (D-01, D-16).
 *
 * Three deliberate postures, all from 01-CONTEXT:
 *
 *   D-02/D-03  Individual PokeAPI PNGs for base species AND every Mega forme.
 *              Not the Showdown spritesheet: its 40x30 icons are too small, and
 *              its id-to-offset map drifts on regulation rotation.
 *   D-05       A 404 is recorded, not fatal. Upstream art lags a new regulation
 *              by weeks; that must never block regenerating a snapshot. This is
 *              the opposite of ROST-04's fail-loudly count gate, on purpose:
 *              count drift means the DATA is wrong, missing art means UPSTREAM
 *              is slow.
 *   D-04       One generic placeholder for every gap, authored at the real
 *              native sprite size so a gap never breaks the grid rhythm.
 *
 * A 404 and a dropped connection are NOT the same event and are not treated the
 * same. A 404 is a recorded gap and exits 0. A transport failure exits 1 without
 * writing anything, because marking 235 species artless because the wifi
 * dropped would be committed, permanent, and silently wrong. Downloads already
 * on disk survive, so a re-run resumes rather than restarts.
 *
 * Zero new dependencies, at build time or in the bundle. PNG dimensions are read
 * straight out of the IHDR chunk and the placeholder is encoded with node:zlib.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const DATA_DIRECTORY = join(ROOT, 'public', 'data');
const SPRITE_DIRECTORY = join(ROOT, 'public', 'sprites');
const CACHE_DIRECTORY = join(ROOT, 'scripts', '.cache');
const INDEX_CACHE_FILE = join(CACHE_DIRECTORY, 'pokeapi-index.json');
const OVERRIDES_FILE = join(ROOT, 'scripts', 'pokeapi-slug-overrides.json');
const META_FILE = join(DATA_DIRECTORY, 'sprite-meta.json');
const PLACEHOLDER_NAME = '_placeholder.png';
const PLACEHOLDER_FILE = join(SPRITE_DIRECTORY, PLACEHOLDER_NAME);

/**
 * Both hosts are constants (threat T-01-21). The only value ever substituted
 * into a URL is an integer taken from PokeAPI's own index, so no roster field
 * can steer a request at a path this script did not choose.
 */
const POKEAPI_INDEX_URL = 'https://pokeapi.co/api/v2/pokemon?limit=100000&offset=0';
const SPRITE_URL_PREFIX = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/';

/** Art is only ever a `.png`. Anything else on the wire is a 404 page. */
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CONCURRENCY = 8;
const ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 20000;

/** UI-SPEC --color-border-strong. The placeholder is stroked in it. */
const PLACEHOLDER_STROKE = [0x66, 0x76, 0x8a];

const argv = process.argv.slice(2);
const forcePlaceholder = argv.includes('--force-placeholder');
const refreshIndex = argv.includes('--refresh-index');

function fail(message) {
  process.stderr.write(`\nbuild-sprites: ${message}\n\n`);
  process.exit(1);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function isPng(buffer) {
  return buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_MAGIC);
}

/**
 * Width and height straight out of the IHDR chunk.
 *
 * A PNG is: 8 magic bytes, then a chunk whose 4-byte length and 4-byte type
 * ("IHDR") are followed by the data. So width is at byte 16 and height at byte
 * 20, both big-endian. No image library, and no trusting a filename.
 */
function readPngSize(buffer) {
  if (!isPng(buffer) || buffer.length < 24) return null;
  if (buffer.subarray(12, 16).toString('ascii') !== 'IHDR') return null;
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}

// ---------------------------------------------------------------------------
// Slug derivation
// ---------------------------------------------------------------------------

/**
 * A PokeAPI `pokemon` slug, derived from a Showdown display name.
 *
 * Sprite naming is a different problem from species identity (PITFALLS Pitfall
 * 5), and PokeAPI's slug is a third naming scheme again: it keeps the hyphens
 * Showdown's `toID` strips (`rotom-wash`, not `rotomwash`) while dropping the
 * punctuation entirely (`farfetchd`, not `farfetch-d`).
 *
 * Two classes of character are removed rather than hyphenated, because
 * hyphenating them invents a segment PokeAPI does not have:
 *   - apostrophes, including U+2019, which `normalize('NFD')` does NOT touch:
 *     `Farfetch’d` is `farfetchd`, never `farfetch-d`
 *   - combining marks left behind by NFD: `Flabebe` with its accents is
 *     `flabebe`, never `flab-b-`
 *
 * Everything else outside `[a-z0-9]` collapses to a single hyphen, which is
 * what turns `Mr. Rime` into `mr-rime` and `Type: Null` into `type-null`.
 *
 * The result is a CANDIDATE. It is only used if PokeAPI's own index confirms
 * it; an unconfirmed slug is reported, never fetched.
 */
export function deriveSlug(displayName) {
  return displayName
    .replace(/['‘’ʼ´`]/g, '')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

/**
 * Every thing that needs art, across every committed regulation.
 *
 * D-03: base rows AND Mega formes. Phase 1 renders only base sprites, but the
 * Mega ids follow a different rule upstream (the 10282-style ids), and building
 * that rule now means Phase 3's Mega rounds inherit a tested pipeline instead
 * of reopening this one.
 *
 * The union is taken across regulations so that regenerating M-B alone never
 * drops M-A's art.
 */
function collectTargets() {
  const snapshots = readdirSync(DATA_DIRECTORY)
    .filter((name) => /^roster\.[a-z0-9]+\.json$/i.test(name) && name !== 'roster.index.json')
    .sort();

  if (snapshots.length === 0) {
    fail(
      `no roster snapshots found in ${DATA_DIRECTORY}.\n` +
        'Run `npm run build:roster mb` first — this script resolves art for a roster\n' +
        'that already exists; it does not build one.',
    );
  }

  /** @type {Map<string, { rosterId: string, name: string, spriteId: string, kind: string, regulations: Set<string> }>} */
  const targets = new Map();
  const files = [];

  for (const fileName of snapshots) {
    const regulationId = /^roster\.([a-z0-9]+)\.json$/i.exec(fileName)[1];
    const snapshot = readJson(join(DATA_DIRECTORY, fileName));
    if (!Array.isArray(snapshot.entries)) {
      fail(`${fileName} has no entries array. Refusing to guess at its shape.`);
    }
    files.push({ regulationId, fileName, snapshot });

    const add = (rosterId, name, num, spriteId, kind) => {
      const existing = targets.get(rosterId);
      if (existing === undefined) {
        targets.set(rosterId, {
          rosterId,
          name,
          num,
          spriteId,
          kind,
          regulations: new Set([regulationId]),
        });
        return;
      }
      existing.regulations.add(regulationId);
    };

    for (const entry of snapshot.entries) {
      add(entry.id, entry.name, entry.num, entry.spriteId ?? null, 'entry');
      for (const mega of entry.megaFormes ?? []) {
        // A Mega forme shares its owner's National Dex number; it has no number
        // of its own, and PokeAPI gives it a 10000-range id regardless.
        add(mega.id, mega.name, entry.num, mega.spriteId ?? null, 'mega');
      }
    }
  }

  return { targets: [...targets.values()].sort((a, b) => (a.rosterId < b.rosterId ? -1 : 1)), files };
}

// ---------------------------------------------------------------------------
// PokeAPI index
// ---------------------------------------------------------------------------

async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.text();
}

/**
 * `Map<slug, pokeapiId>` over every Pokemon PokeAPI knows about.
 *
 * One request for the lot, cached under scripts/.cache/ (gitignored) so that a
 * re-run is offline and instant. The id is the trailing path segment of each
 * result's URL — PokeAPI does not repeat it as a field.
 */
async function loadPokeapiIndex() {
  let payload = null;

  if (!refreshIndex && existsSync(INDEX_CACHE_FILE)) {
    try {
      payload = readJson(INDEX_CACHE_FILE);
    } catch {
      payload = null;
    }
  }

  let fromCache = payload !== null;

  if (payload === null) {
    let text = null;
    let lastError = null;
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      try {
        text = await fetchText(POKEAPI_INDEX_URL);
        break;
      } catch (error) {
        lastError = error;
        await new Promise((done) => setTimeout(done, 400 * attempt));
      }
    }
    if (text === null) {
      fail(
        `could not fetch the PokeAPI index (${lastError?.message ?? 'unknown error'}).\n` +
          'This is the id map, not art — without it nothing can be resolved, so the run\n' +
          'stops here rather than recording 300 false gaps. Check the network and re-run.',
      );
    }
    payload = JSON.parse(text);
    mkdirSync(CACHE_DIRECTORY, { recursive: true });
    writeFileSync(INDEX_CACHE_FILE, `${JSON.stringify(payload)}\n`, 'utf8');
    fromCache = false;
  }

  const bySlug = new Map();
  for (const result of payload.results ?? []) {
    const match = /\/pokemon\/(\d+)\/?$/.exec(result.url ?? '');
    if (match === null) continue;
    bySlug.set(result.name, Number(match[1]));
  }

  if (bySlug.size === 0) {
    fail('the PokeAPI index parsed to zero slugs. Refusing to record every entry as missing.');
  }

  return { bySlug, fromCache };
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

/**
 * One sprite. Returns `{ status: 'ok' | 'absent' | 'error' }`.
 *
 * `absent` is a 404 from the sprite host: upstream genuinely has no art, which
 * is D-05's recorded gap. `error` is anything else — a timeout, a 5xx, a
 * response that is not a PNG — and is a build failure, because none of those
 * prove anything about upstream's art.
 *
 * Threat T-01-20: the magic-byte check happens BEFORE the write, so a 404 HTML
 * body or a redirect page can never land on disk wearing a `.png` name.
 */
async function downloadSprite(pokeapiId) {
  const destination = join(SPRITE_DIRECTORY, `${pokeapiId}.png`);

  // Idempotency: an already-valid file is never re-fetched. This is what makes
  // a second run free and a partial run resumable.
  if (existsSync(destination)) {
    const existing = readFileSync(destination);
    if (readPngSize(existing) !== null) return { status: 'ok', bytes: existing, cached: true };
  }

  const url = `${SPRITE_URL_PREFIX}${pokeapiId}.png`;
  let lastError = null;

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });

      if (response.status === 404 || response.status === 410) {
        return { status: 'absent', reason: `HTTP ${response.status}` };
      }
      if (!response.ok) {
        lastError = new Error(`HTTP ${response.status}`);
      } else {
        const bytes = Buffer.from(await response.arrayBuffer());
        if (readPngSize(bytes) === null) {
          lastError = new Error(`response was not a PNG (${bytes.length} bytes)`);
        } else {
          writeFileSync(destination, bytes);
          return { status: 'ok', bytes, cached: false };
        }
      }
    } catch (error) {
      lastError = error;
    }
    if (attempt < ATTEMPTS) await new Promise((done) => setTimeout(done, 400 * attempt));
  }

  return { status: 'error', reason: lastError?.message ?? 'unknown error' };
}

/** Bounded parallelism. Eight in flight is polite and plenty for ~310 files. */
async function runPool(items, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function drain() {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, drain));
  return results;
}

// ---------------------------------------------------------------------------
// Placeholder encoder (D-04)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

/** 8-bit RGBA, no interlace, one zlib stream, filter byte 0 on every row. */
function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: truecolour with alpha
  header[10] = 0; // compression: deflate
  header[11] = 0; // filter: adaptive
  header[12] = 0; // interlace: none

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    PNG_MAGIC,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * The single generic gap icon (D-04): a rounded-square outline with a question
 * glyph inside it, stroked in --color-border-strong on transparency so it sits
 * correctly on --color-surface.
 *
 * Not type-coloured and not name-text-only, both explicitly rejected by D-04.
 * Authored at exactly the measured native sprite size so a gap occupies the
 * identical cell footprint and the grid rhythm never breaks.
 *
 * Coverage is computed as a signed distance to each stroked primitive, which
 * antialiases the curves for free and needs no drawing library.
 */
function renderPlaceholder(width, height) {
  const rgba = Buffer.alloc(width * height * 4, 0);
  const size = Math.min(width, height);
  const cx = width / 2;
  const cy = height / 2;

  const frameInset = size * 0.12;
  const frameRadius = size * 0.16;
  const frameStroke = Math.max(1, size * 0.035);

  const left = frameInset;
  const right = width - frameInset;
  const top = frameInset;
  const bottom = height - frameInset;

  const glyphStroke = Math.max(1, size * 0.075);
  const hookRadius = size * 0.135;
  const hookCentreY = cy - size * 0.115;
  const tailEndY = cy + size * 0.145;
  const dotY = cy + size * 0.265;
  const dotRadius = glyphStroke * 0.62;

  // Endpoint of the hook arc, where the tail picks the stroke up.
  const tailStartAngle = (40 * Math.PI) / 180;
  const tailStartX = cx + hookRadius * Math.cos(tailStartAngle);
  const tailStartY = hookCentreY + hookRadius * Math.sin(tailStartAngle);

  const distanceToSegment = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  };

  /** Distance to a rounded-rectangle outline. */
  const distanceToRoundedRectEdge = (px, py) => {
    const halfWidth = (right - left) / 2 - frameRadius;
    const halfHeight = (bottom - top) / 2 - frameRadius;
    const qx = Math.abs(px - (left + right) / 2) - halfWidth;
    const qy = Math.abs(py - (top + bottom) / 2) - halfHeight;
    const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
    const inside = Math.min(Math.max(qx, qy), 0);
    return Math.abs(outside + inside - frameRadius);
  };

  /** Distance to an arc of a circle, clamped to the arc's angular span. */
  const distanceToArc = (px, py, centreX, centreY, radius, fromDegrees, toDegrees) => {
    let angle = Math.atan2(py - centreY, px - centreX);
    let degrees = (angle * 180) / Math.PI;
    while (degrees < fromDegrees) degrees += 360;
    if (degrees <= toDegrees) return Math.abs(Math.hypot(px - centreX, py - centreY) - radius);
    const start = (fromDegrees * Math.PI) / 180;
    const end = (toDegrees * Math.PI) / 180;
    return Math.min(
      Math.hypot(px - (centreX + radius * Math.cos(start)), py - (centreY + radius * Math.sin(start))),
      Math.hypot(px - (centreX + radius * Math.cos(end)), py - (centreY + radius * Math.sin(end))),
    );
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = x + 0.5;
      const py = y + 0.5;

      const frameCoverage = 0.5 + frameStroke / 2 - distanceToRoundedRectEdge(px, py);

      // The hook runs from the lower left, over the top, round to the right.
      const hookCoverage =
        0.5 + glyphStroke / 2 - distanceToArc(px, py, cx, hookCentreY, hookRadius, 140, 400);
      const tailCoverage =
        0.5 + glyphStroke / 2 - distanceToSegment(px, py, tailStartX, tailStartY, cx, tailEndY);
      const dotCoverage = 0.5 + dotRadius - Math.hypot(px - cx, py - dotY);

      const coverage = Math.max(
        0,
        Math.min(1, Math.max(frameCoverage, hookCoverage, tailCoverage, dotCoverage)),
      );
      if (coverage <= 0) continue;

      const offset = (y * width + x) * 4;
      rgba[offset] = PLACEHOLDER_STROKE[0];
      rgba[offset + 1] = PLACEHOLDER_STROKE[1];
      rgba[offset + 2] = PLACEHOLDER_STROKE[2];
      rgba[offset + 3] = Math.round(coverage * 255);
    }
  }

  return encodePng(width, height, rgba);
}

/**
 * Write the placeholder only when it is absent or the wrong size.
 *
 * Deflate output is not guaranteed identical across Node releases, so
 * regenerating unconditionally would dirty the working tree on a machine with a
 * different Node. The committed file is authoritative; `--force-placeholder`
 * regenerates it deliberately.
 */
function ensurePlaceholder(width, height) {
  if (!forcePlaceholder && existsSync(PLACEHOLDER_FILE)) {
    const size = readPngSize(readFileSync(PLACEHOLDER_FILE));
    if (size !== null && size.width === width && size.height === height) {
      return { written: false, width, height };
    }
  }
  mkdirSync(SPRITE_DIRECTORY, { recursive: true });
  writeFileSync(PLACEHOLDER_FILE, renderPlaceholder(width, height));
  return { written: true, width, height };
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const { targets, files } = collectTargets();
const overridesDocument = readJson(OVERRIDES_FILE);
const overrides = overridesDocument.overrides ?? {};
const { bySlug, fromCache } = await loadPokeapiIndex();

mkdirSync(SPRITE_DIRECTORY, { recursive: true });

/** Resolution: override first, derivation second, PokeAPI's index as the judge. */
const unresolved = [];
for (const target of targets) {
  const override = overrides[target.rosterId];
  const derived = deriveSlug(target.name);
  const slug = typeof override === 'string' && override.length > 0 ? override : derived;

  target.derivedSlug = derived;
  target.slug = slug;
  target.viaOverride = slug !== derived;
  target.pokeapiId = bySlug.get(slug) ?? null;

  if (target.pokeapiId === null) {
    unresolved.push(target);
    if (target.viaOverride) {
      process.stderr.write(
        `build-sprites: override "${slug}" for ${target.rosterId} is not a PokeAPI slug.\n`,
      );
    }
  }
}

/**
 * Cross-check every default-forme resolution against the National Dex number.
 *
 * PokeAPI numbers a species' default forme with its National Dex number and
 * pushes every alternate forme into the 10000 range. So for any id below 10000
 * the roster's own `num` is an independent second opinion on the resolution —
 * `pyroar` must land on 668, not on whatever `pyroar-male` happens to be.
 *
 * This is the guard that makes hand-maintained overrides safe to review: a
 * typo aimed at the wrong species is caught here rather than discovered as the
 * wrong Pokemon staring out of a pool cell. Alternate formes cannot be checked
 * this way, so they rest on the PokeAPI index confirming the slug.
 */
const misnumbered = [];
for (const target of targets) {
  if (target.pokeapiId === null || target.pokeapiId >= 10000) continue;
  if (target.pokeapiId !== target.num) {
    misnumbered.push(
      `${target.rosterId} (${target.name}, dex ${target.num}) resolved to ` +
        `"${target.slug}" = PokeAPI id ${target.pokeapiId}`,
    );
  }
}

if (misnumbered.length > 0) {
  fail(
    [
      `${misnumbered.length} resolution(s) point at the wrong species.`,
      '',
      ...misnumbered.map((line) => `  ${line}`),
      '',
      'A base-forme PokeAPI id equals the National Dex number. These do not match,',
      'so the slug names a different Pokemon than the roster entry does. Nothing was',
      'written. Fix scripts/pokeapi-slug-overrides.json.',
    ].join('\n'),
  );
}

const resolvable = targets.filter((target) => target.pokeapiId !== null);
const uniqueIds = [...new Set(resolvable.map((target) => target.pokeapiId))].sort((a, b) => a - b);

process.stdout.write(
  `\nbuild-sprites: ${targets.length} targets, ${resolvable.length} resolved to ` +
    `${uniqueIds.length} distinct PokeAPI ids ` +
    `(index ${fromCache ? 'from cache' : 'fetched'})\n`,
);

const downloads = new Map();
let downloadedCount = 0;
let cachedCount = 0;

await runPool(uniqueIds, async (pokeapiId) => {
  const result = await downloadSprite(pokeapiId);
  downloads.set(pokeapiId, result);
  if (result.status === 'ok') {
    if (result.cached) cachedCount++;
    else downloadedCount++;
  }
});

const transportErrors = uniqueIds
  .filter((pokeapiId) => downloads.get(pokeapiId).status === 'error')
  .map((pokeapiId) => `${pokeapiId}.png — ${downloads.get(pokeapiId).reason}`);

if (transportErrors.length > 0) {
  fail(
    [
      `${transportErrors.length} sprite(s) failed for reasons that are NOT a 404.`,
      '',
      ...transportErrors.map((line) => `  ${line}`),
      '',
      'These are transport failures, not upstream gaps, so nothing was written.',
      'Recording them as spriteMissing would commit a permanent claim about upstream',
      'art on the evidence of a dropped connection. Everything already downloaded is',
      'still on disk — re-run and it resumes.',
    ].join('\n'),
  );
}

// ---------------------------------------------------------------------------
// Measure
// ---------------------------------------------------------------------------

const sizes = new Map();
for (const pokeapiId of uniqueIds) {
  const result = downloads.get(pokeapiId);
  if (result.status !== 'ok') continue;
  sizes.set(pokeapiId, readPngSize(result.bytes));
}

const frequency = new Map();
for (const size of sizes.values()) {
  const key = `${size.width}x${size.height}`;
  frequency.set(key, (frequency.get(key) ?? 0) + 1);
}

if (frequency.size === 0) {
  fail('no sprite could be measured. Refusing to invent a native dimension.');
}

const [modalKey] = [...frequency.entries()].sort((a, b) => b[1] - a[1])[0];
const [nativeWidth, nativeHeight] = modalKey.split('x').map(Number);

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

const byRosterId = {};
const outliers = [];
const missingRosterIds = [];
const missingSpriteIds = new Set();

for (const target of targets) {
  const result = target.pokeapiId === null ? null : downloads.get(target.pokeapiId);

  if (result === null || result.status !== 'ok') {
    missingRosterIds.push(target.rosterId);
    if (typeof target.spriteId === 'string') missingSpriteIds.add(target.spriteId);
    continue;
  }

  byRosterId[target.rosterId] = {
    pokeapiId: target.pokeapiId,
    file: `${target.pokeapiId}.png`,
    slug: target.slug,
  };

  const size = sizes.get(target.pokeapiId);
  if (size.width !== nativeWidth || size.height !== nativeHeight) {
    outliers.push({ rosterId: target.rosterId, width: size.width, height: size.height });
  }
}

const placeholder = ensurePlaceholder(nativeWidth, nativeHeight);

const meta = {
  $doNotEditByHand:
    'Generated file. Edits are lost on the next run of scripts/build-sprites.mjs.',
  $generator: 'scripts/build-sprites.mjs',
  generatedAt: new Date().toISOString(),
  source: { index: POKEAPI_INDEX_URL, sprites: SPRITE_URL_PREFIX },
  directory: 'sprites',
  placeholder: PLACEHOLDER_NAME,
  nativeWidth,
  nativeHeight,
  dimensionHistogram: Object.fromEntries([...frequency.entries()].sort((a, b) => b[1] - a[1])),
  outliers: outliers.sort((a, b) => (a.rosterId < b.rosterId ? -1 : 1)),
  total: targets.length,
  resolved: Object.keys(byRosterId).length,
  missing: missingRosterIds.sort(),
  missingSpriteIds: [...missingSpriteIds].sort(),
  byRosterId: Object.fromEntries(Object.entries(byRosterId).sort(([a], [b]) => (a < b ? -1 : 1))),
};

// A no-op run must produce a genuinely empty diff, not a timestamp-only one, so
// the previous timestamp is kept when nothing else changed. Same posture as
// build-roster.mjs.
function metaFingerprint(document) {
  const { generatedAt, ...rest } = document;
  return createHash('sha256').update(JSON.stringify(rest)).digest('hex');
}

if (existsSync(META_FILE)) {
  try {
    const previous = readJson(META_FILE);
    if (metaFingerprint(previous) === metaFingerprint(meta)) meta.generatedAt = previous.generatedAt;
  } catch {
    // Unreadable previous meta: fall through and stamp a fresh timestamp.
  }
}

mkdirSync(DATA_DIRECTORY, { recursive: true });
writeFileSync(META_FILE, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');

// ---------------------------------------------------------------------------
// Write back onto the roster snapshots
// ---------------------------------------------------------------------------

/**
 * `spriteMissing` is stamped by the roster generator, not patched in here.
 *
 * `transform.ts` already takes a `missingSpriteIds` list and sets
 * `spriteMissing` from it, and `build-roster.mjs` owns the checksum, the
 * classic-script sibling and the regulation index. Editing the JSON in place
 * would leave `roster.<id>.js` and `roster.index.json` stating a different
 * checksum for the same data — three artifacts, two answers. Delegating keeps
 * one writer per file.
 *
 * The regeneration only runs when the flags would actually change, so a healthy
 * re-run touches nothing.
 */
const regenerated = [];
for (const { regulationId, fileName, snapshot } of files) {
  const stamped = new Set(
    snapshot.entries.filter((entry) => entry.spriteMissing === true).map((entry) => entry.spriteId),
  );
  const wanted = new Set(
    snapshot.entries.map((entry) => entry.spriteId).filter((spriteId) => missingSpriteIds.has(spriteId)),
  );

  const same = stamped.size === wanted.size && [...wanted].every((spriteId) => stamped.has(spriteId));
  if (same) continue;

  process.stdout.write(
    `\n  ${fileName}: spriteMissing changed (${stamped.size} -> ${wanted.size}); regenerating\n`,
  );
  const run = spawnSync(process.execPath, [join(ROOT, 'scripts', 'build-roster.mjs'), regulationId], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (run.status !== 0) {
    fail(
      `regenerating ${fileName} failed (exit ${run.status}).\n` +
        'sprite-meta.json is written and the art is on disk, but the roster snapshots\n' +
        'still carry the old spriteMissing flags. Fix the roster build, then re-run.',
    );
  }
  regenerated.push(fileName);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const report = [];
report.push('');
report.push(`  native size      ${nativeWidth}x${nativeHeight} (read from IHDR, not assumed)`);
report.push(`  distinct sizes   ${[...frequency.entries()].map(([key, count]) => `${key}:${count}`).join('  ')}`);
report.push(`  downloaded       ${downloadedCount}`);
report.push(`  already on disk  ${cachedCount}`);
report.push(`  placeholder      ${placeholder.written ? 'written' : 'unchanged'} at ${nativeWidth}x${nativeHeight}`);
report.push(`  overrides used   ${targets.filter((target) => target.viaOverride).length}`);
if (regenerated.length > 0) report.push(`  regenerated      ${regenerated.join(', ')}`);

if (outliers.length > 0) {
  report.push('');
  report.push(`  ${outliers.length} sprite(s) are not ${nativeWidth}x${nativeHeight}:`);
  for (const outlier of outliers) {
    report.push(`    ${outlier.rosterId} ${outlier.width}x${outlier.height}`);
  }
}

if (unresolved.length > 0) {
  report.push('');
  report.push(`  ${unresolved.length} target(s) resolved to no PokeAPI slug:`);
  for (const target of unresolved) {
    report.push(`    UNRESOLVED ${target.rosterId} derived=${target.derivedSlug}`);
  }
  report.push('');
  report.push('  Add each to the `overrides` map in scripts/pokeapi-slug-overrides.json');
  report.push('  and re-run, or leave it if PokeAPI genuinely has no such Pokemon.');
}

report.push('');
report.push(
  missingRosterIds.length === 0
    ? `  0 of ${targets.length} targets have no sprite`
    : `  ${missingRosterIds.length} of ${targets.length} targets have no sprite: ${missingRosterIds.join(', ')}`,
);
report.push('');
report.push(`  wrote ${META_FILE}`);
report.push('');

process.stdout.write(report.join('\n'));

// D-05: a gap is data, not a failure. Exit 0.
process.exit(0);
