#!/usr/bin/env node
/**
 * ROST-03 — regenerate a committed roster snapshot from the pinned
 * pokemon-showdown release.
 *
 * Usage:
 *   node scripts/build-roster.mjs <regulationId> [--accept-drift]
 *   npm run build:roster mb
 *
 * This script owns bytes: reading the mod, stamping metadata, hashing, and
 * writing files. It owns no classification logic — that lives in the pure
 * `src/core/roster/transform.ts`, which a browser-side refresh can call with
 * the same inputs and get the same answer. Identical logic, different byte
 * source (ARCHITECTURE, "Roster Snapshot Pipeline").
 *
 * The mod name is never a literal here. It is read from
 * `scripts/roster-source.json` so that an upstream mod rename is a reviewable
 * diff rather than a silent regulation swap (PITFALLS Pitfall 3).
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SOURCE_FILE = join(ROOT, 'scripts', 'roster-source.json');
const OUTPUT_DIRECTORY = join(ROOT, 'public', 'data');
const TRANSFORM_MODULE = join(ROOT, 'src', 'core', 'roster', 'transform.ts');
const SPRITE_META_FILE = join(OUTPUT_DIRECTORY, 'sprite-meta.json');
const SCHEMA_VERSION = 1;

/** Counts that must match `expectedCounts` or the run fails. */
const GATED_COUNTS = [
  'legalEntries',
  'baseSpecies',
  'alternateFormes',
  'megaFormes',
  'megaCapableSpecies',
  'draftable',
];

/** Names outside this set are reported so new arrivals are visible. */
const PLAIN_NAME_CHARACTERS = /^[A-Za-z0-9 .'-]+$/;

function fail(message) {
  process.stderr.write(`\nbuild-roster: ${message}\n\n`);
  process.exit(1);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * JSON with object keys sorted at every depth.
 *
 * Used only for the checksum, so that a future refactor which changes the key
 * insertion order of an entry does not invalidate every committed snapshot.
 */
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const body = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',');
    return `{${body}}`;
  }
  return JSON.stringify(value);
}

function listInstalledMods(require) {
  try {
    const packagePath = require.resolve('pokemon-showdown/package.json');
    const modsPath = join(dirname(packagePath), 'dist', 'data', 'mods');
    return readdirSync(modsPath, { withFileTypes: true })
      .filter((item) => item.isDirectory())
      .map((item) => item.name)
      .sort();
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const acceptDrift = argv.includes('--accept-drift');
const positional = argv.filter((argument) => !argument.startsWith('--'));

if (positional.length !== 1) {
  fail(
    [
      'a regulation id is required.',
      '',
      '  node scripts/build-roster.mjs <regulationId> [--accept-drift]',
      '',
      'Running with no argument is refused on purpose: defaulting to "whatever is',
      'current" is exactly how a snapshot silently changes regulation.',
    ].join('\n'),
  );
}

const regulationId = positional[0];
const source = readJson(SOURCE_FILE);
const regulation = source.regulations.find((item) => item.id === regulationId);

if (regulation === undefined) {
  fail(
    `unknown regulation id "${regulationId}". ` +
      `scripts/roster-source.json declares: ${source.regulations.map((item) => item.id).join(', ')}`,
  );
}

// ---------------------------------------------------------------------------
// Load the mod
// ---------------------------------------------------------------------------

const require = createRequire(join(ROOT, 'package.json'));

let Dex;
try {
  ({ Dex } = require('pokemon-showdown'));
} catch (error) {
  fail(
    `could not load pokemon-showdown (${error.message}).\n` +
      'It is a devDependency; run npm ci first. It is never bundled.',
  );
}

let dex;
try {
  dex = Dex.mod(regulation.mod);
  // Dex.mod is lazy on some paths; force the data load so a missing mod throws
  // here rather than surfacing as an empty species list further down.
  dex.species.get('pikachu');
} catch (error) {
  const installed = listInstalledMods(require);
  fail(
    [
      `mod "${regulation.mod}" (regulation ${regulation.label}) could not be loaded from ${source.package}.`,
      `Reason: ${error.message}`,
      '',
      'Mods that DO exist in the installed package:',
      installed.length > 0 ? `  ${installed.join(', ')}` : '  (could not enumerate)',
      '',
      'Not falling back to any other mod. Fix scripts/roster-source.json deliberately:',
      'a mod rename upstream means the regulation moved, and picking a neighbour',
      'silently snapshots the wrong roster (PITFALLS Pitfall 3).',
    ].join('\n'),
  );
}

const rawSpecies = dex.species.all().map((entry) => ({
  id: entry.id,
  name: entry.name,
  num: entry.num,
  baseSpecies: entry.baseSpecies,
  types: [...entry.types],
  baseStats: { ...entry.baseStats },
  abilities: { ...entry.abilities },
  forme: entry.forme || undefined,
  requiredItem: entry.requiredItem || undefined,
  battleOnly: entry.battleOnly || undefined,
  isNonstandard: entry.isNonstandard || undefined,
  tier: entry.tier || undefined,
}));

if (rawSpecies.length === 0) {
  fail(`mod "${regulation.mod}" enumerated zero species. Refusing to write an empty snapshot.`);
}

// ---------------------------------------------------------------------------
// Transform
// ---------------------------------------------------------------------------

const { transform, toRosterId } = await import(pathToFileURL(TRANSFORM_MODULE).href);

/**
 * ROST-11 — sprite ids known to have no committed art.
 *
 * `scripts/build-sprites.mjs` measures this against the real sprite set and
 * records it in `public/data/sprite-meta.json`. Reading it here is what makes
 * `spriteMissing` reproducible: regenerating a snapshot on its own re-derives
 * the same flags instead of silently clearing them. A repository with no sprite
 * inventory yet simply gets an empty list, which is the pre-01-04 behaviour.
 */
function readMissingSpriteIds() {
  if (!existsSync(SPRITE_META_FILE)) return [];
  try {
    const meta = readJson(SPRITE_META_FILE);
    return Array.isArray(meta.missingSpriteIds) ? meta.missingSpriteIds : [];
  } catch {
    return [];
  }
}

const missingSpriteIds = readMissingSpriteIds();
const generatedAt = new Date().toISOString();
const upstreamRef =
  source.upstreamCommit === null || source.upstreamCommit === undefined
    ? `npm:${source.package} (${source.upstreamIntegrity})`
    : `${source.package} @ ${source.upstreamCommit}`;

const draft = transform(rawSpecies, {
  schemaVersion: SCHEMA_VERSION,
  regulation: regulation.label,
  validFrom: regulation.validFrom,
  validUntil: regulation.validUntil,
  upstreamRef,
  generatedAt,
  missingSpriteIds,
});

if (draft.entries.length === 0) {
  fail(`mod "${regulation.mod}" produced zero draftable entries. Refusing to write.`);
}

// The script and the transform must agree on the identity function, or the
// pipeline has two id spaces. Checked before anything is written.
for (const entry of draft.entries) {
  if (toRosterId(entry.name) !== entry.id) {
    fail(
      `identity mismatch: toRosterId(${JSON.stringify(entry.name)}) !== ${JSON.stringify(entry.id)}`,
    );
  }
}

const checksum = `sha256-${createHash('sha256').update(canonicalJson(draft.entries)).digest('hex')}`;

// ---------------------------------------------------------------------------
// ROST-04 count gate
// ---------------------------------------------------------------------------

const measured = draft.counts;
const expected = regulation.expectedCounts ?? {};
const isFirstRun = Object.keys(expected).length === 0;

function renderCountTable(rows) {
  const columnCount = Math.max(...rows.map((row) => row.length));
  const widths = [];
  for (let column = 0; column < columnCount; column++) {
    widths.push(Math.max(...rows.map((row) => (row[column] ?? '').length)));
  }
  return rows
    .map((row) =>
      `  ${row.map((cell, column) => cell.padEnd(widths[column])).join('  ')}`.trimEnd(),
    )
    .join('\n');
}

if (isFirstRun || acceptDrift) {
  regulation.expectedCounts = { ...measured };
  writeFileSync(SOURCE_FILE, `${JSON.stringify(source, null, 2)}\n`, 'utf8');

  const banner = isFirstRun
    ? 'FIRST RUN — recording the measured counts as the expectation'
    : '!!! --accept-drift — OVERWRITING THE COUNT EXPECTATIONS !!!';
  process.stdout.write(`\n${'='.repeat(72)}\n${banner}\n${'='.repeat(72)}\n`);
  if (!isFirstRun) {
    process.stdout.write(
      'A human opted in. The rewritten expectations are in the diff for review.\n' +
        'If this was not a deliberate regulation rotation, revert it.\n',
    );
  }
  process.stdout.write(
    `${renderCountTable(Object.entries(measured).map(([key, value]) => [key, String(value)]))}\n${'='.repeat(72)}\n`,
  );
} else {
  const keys = [...new Set([...GATED_COUNTS, ...Object.keys(expected), ...Object.keys(measured)])];
  const drifted = keys.filter((key) => expected[key] !== measured[key]);

  if (drifted.length > 0) {
    const table = renderCountTable([
      ['count', 'expected', 'measured'],
      ['-----', '--------', '--------'],
      ...drifted.map((key) => [key, String(expected[key] ?? '(absent)'), String(measured[key] ?? '(absent)')]),
    ]);
    fail(
      [
        `COUNT DRIFT for regulation ${regulation.label} (mod "${regulation.mod}").`,
        '',
        table,
        '',
        'Upstream changed, or the mod name now points at a different regulation.',
        'Nothing was written. Investigate, then re-run with --accept-drift to record',
        'the new expectations deliberately.',
      ].join('\n'),
    );
  }
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

// JSON cannot carry a comment, so the hand-edit guard (threat T-01-17) is a
// pair of leading fields instead. `checksum` is what actually makes a hand
// edit detectable; these two make it obvious before anyone tries.
const snapshot = {
  $doNotEditByHand:
    'Generated file. Edits are lost on the next run and will not match `checksum`.',
  $generator: `scripts/build-roster.mjs ${regulation.id} (from ${source.package})`,
  schemaVersion: draft.schemaVersion,
  regulation: draft.regulation,
  validFrom: draft.validFrom,
  validUntil: draft.validUntil,
  upstreamRef: draft.upstreamRef,
  generatedAt: draft.generatedAt,
  counts: draft.counts,
  checksum,
  entries: draft.entries,
};

mkdirSync(OUTPUT_DIRECTORY, { recursive: true });

const jsonPath = join(OUTPUT_DIRECTORY, `roster.${regulation.id}.json`);
const scriptPath = join(OUTPUT_DIRECTORY, `roster.${regulation.id}.js`);

// Keep the previous generatedAt when the entries did not change, so that
// re-running the generator on unchanged upstream data produces no diff at all
// rather than a timestamp-only one. The checksum covers entries only, so an
// identical checksum means an identical roster.
if (existsSync(jsonPath)) {
  try {
    const previous = readJson(jsonPath);
    if (previous.checksum === checksum) snapshot.generatedAt = previous.generatedAt;
  } catch {
    // Unreadable previous snapshot: fall through and stamp a fresh timestamp.
  }
}

const header = [
  '/*',
  ' * DO NOT EDIT BY HAND.',
  ' *',
  ` * Generated by scripts/build-roster.mjs from ${source.package}`,
  ` * Regulation: ${snapshot.regulation}  (${snapshot.validFrom} to ${snapshot.validUntil})`,
  ` * Generated at: ${snapshot.generatedAt}`,
  ` * Entries checksum: ${snapshot.checksum}`,
  ' *',
  ' * Regenerate with:  npm run build:roster ' + regulation.id,
  ' *',
  ' * Classic-script hedge (phase 1 decision D-17). The app loads the .json',
  ' * sibling; this file exists so the roster stays reachable without fetch if',
  ' * the module/file:// decision is ever revisited. Load exactly one of these',
  ' * per page: the last one loaded wins for __CHAMPIONS_ROSTER__, while',
  ' * __CHAMPIONS_ROSTER_BY_REGULATION__ retains every regulation loaded.',
  ' */',
  '',
].join('\n');

writeFileSync(jsonPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
writeFileSync(
  scriptPath,
  [
    header,
    'globalThis.__CHAMPIONS_ROSTER_BY_REGULATION__ =',
    '  globalThis.__CHAMPIONS_ROSTER_BY_REGULATION__ || {};',
    '',
    // Payload is emitted on one line on purpose: this file is loaded by a
    // machine, never read by a person. The pretty-printed .json sibling is
    // the review surface, and the checksum in the header above ties the two
    // together.
    `globalThis.__CHAMPIONS_ROSTER__ = ${JSON.stringify(snapshot)};`,
    '',
    `globalThis.__CHAMPIONS_ROSTER_BY_REGULATION__[${JSON.stringify(regulation.id)}] =`,
    '  globalThis.__CHAMPIONS_ROSTER__;',
    '',
  ].join('\n'),
  'utf8',
);

// The index is rebuilt from whatever snapshots exist on disk, so generating one
// regulation never drops the other from the manifest.
const indexRegulations = [];
for (const item of source.regulations) {
  const path = join(OUTPUT_DIRECTORY, `roster.${item.id}.json`);
  if (!existsSync(path)) continue;
  const committed = readJson(path);
  indexRegulations.push({
    id: item.id,
    label: item.label,
    regulation: committed.regulation,
    validFrom: committed.validFrom,
    validUntil: committed.validUntil,
    json: `roster.${item.id}.json`,
    script: `roster.${item.id}.js`,
    checksum: committed.checksum,
    generatedAt: committed.generatedAt,
    counts: committed.counts,
  });
}

writeFileSync(
  join(OUTPUT_DIRECTORY, 'roster.index.json'),
  `${JSON.stringify(
    {
      schemaVersion: SCHEMA_VERSION,
      default: source.default,
      generator: 'scripts/build-roster.mjs',
      upstreamRef,
      regulations: indexRegulations,
    },
    null,
    2,
  )}\n`,
  'utf8',
);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const report = [];
report.push('');
report.push(`Regulation ${snapshot.regulation}  (mod "${regulation.mod}")`);
report.push(`  ${snapshot.validFrom} to ${snapshot.validUntil}`);
report.push(`  upstream ${snapshot.upstreamRef}`);
report.push(`  checksum ${snapshot.checksum}`);
report.push('');
report.push(
  renderCountTable(Object.entries(snapshot.counts).map(([key, value]) => [key, String(value)])),
);

const unusualNames = [];
for (const entry of snapshot.entries) {
  if (!PLAIN_NAME_CHARACTERS.test(entry.name)) unusualNames.push(entry.name);
  for (const mega of entry.megaFormes) {
    if (!PLAIN_NAME_CHARACTERS.test(mega.name)) unusualNames.push(mega.name);
  }
}

report.push('');
report.push(
  unusualNames.length === 0
    ? '  names outside [A-Za-z0-9 .\'-]: none'
    : `  names outside [A-Za-z0-9 .'-]: ${unusualNames.length}\n    ${unusualNames.join('\n    ')}`,
);

// Audit aid: species present in the regulation only through an alternate
// forme. This is the 207-vs-208 delta (see docs/roster-count-audit.md).
const draftableIds = new Set(snapshot.entries.map((entry) => entry.id));
const speciesOnlyViaForme = [
  ...new Set(
    snapshot.entries
      .filter((entry) => entry.forme !== null && !draftableIds.has(entry.baseSpeciesId))
      .map((entry) => `${entry.baseSpeciesId} (only as ${entry.name})`),
  ),
].sort();

report.push('');
report.push(
  speciesOnlyViaForme.length === 0
    ? '  species draftable only through an alternate forme: none'
    : `  species draftable only through an alternate forme: ${speciesOnlyViaForme.length}\n    ${speciesOnlyViaForme.join('\n    ')}`,
);

const artlessEntries = snapshot.entries.filter((entry) => entry.spriteMissing);
report.push('');
report.push(
  artlessEntries.length === 0
    ? `  entries with no committed sprite: none (${missingSpriteIds.length} id(s) in sprite-meta.json)`
    : `  entries with no committed sprite: ${artlessEntries.map((entry) => entry.id).join(', ')}`,
);

const multiMega = snapshot.entries
  .filter((entry) => entry.megaFormes.length > 1)
  .map((entry) => `${entry.id} (${entry.megaFormes.map((mega) => mega.name).join(', ')})`);
report.push('');
report.push(
  multiMega.length === 0
    ? '  entries with more than one Mega: none'
    : `  entries with more than one Mega: ${multiMega.join(' | ')}`,
);

if (snapshot.counts.orphanedMegaFormes > 0) {
  report.push('');
  report.push(
    `  WARNING: ${snapshot.counts.orphanedMegaFormes} Mega forme(s) have no draftable owner.`,
  );
}

report.push('');
report.push(`  wrote ${jsonPath}`);
report.push(`  wrote ${scriptPath}`);
report.push(`  wrote ${join(OUTPUT_DIRECTORY, 'roster.index.json')}`);
report.push('');

process.stdout.write(`${report.join('\n')}\n`);
