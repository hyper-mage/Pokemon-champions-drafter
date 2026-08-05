/**
 * roster-source.ts — the only network read in the application.
 *
 * This module lives under `adapters/` because it touches `fetch`. Nothing here may be
 * imported by `src/core/`, and `npm run check:pure` enforces that in both directions:
 * the core may not name `fetch`, and it may not import from `adapters`.
 *
 * Everything it reads is a same-origin static asset that ships in this repository —
 * no third-party origin is contacted at runtime (T-01-25). Every URL is built from a
 * fixed template prefixed with `import.meta.env.BASE_URL`; a path that merely starts
 * with `/` would resolve to the domain root and 404 on the deployed project sub-path
 * while working perfectly on localhost.
 */

import type { RosterSnapshot } from '../core/roster/types';

/**
 * The roster-load failure copy, verbatim from the UI Design Contract's copywriting
 * table. Errors state the problem and the next action; this one blames the deploy,
 * not the user, because mid-deploy is the realistic cause.
 */
export const ROSTER_LOAD_FAILURE_MESSAGE =
  'The roster did not load. Reload the page — if it keeps failing, the site may be mid-deploy.';

/** Where a single roster row's art lives, per `public/data/sprite-meta.json`. */
export interface SpriteRef {
  pokeapiId: number;
  /** Filename only, e.g. `460.png`. Named by PokeAPI id, never by the roster slug. */
  file: string;
  slug: string;
}

/**
 * The measured sprite inventory.
 *
 * `byRosterId` is the ONLY correct way to get a filename for a roster row. The row's
 * own `spriteId` is a derived slug (`abomasnow`), deliberately decoupled from
 * PokeAPI's id space so an upstream id change cannot rewrite the roster checksum —
 * so `sprites/${entry.spriteId}.png` resolves for zero of the 235 entries.
 */
export interface SpriteMeta {
  /** Measured from the PNG IHDR chunk, not assumed. 96 at the time of writing. */
  nativeWidth: number;
  nativeHeight: number;
  byRosterId: Record<string, SpriteRef>;
}

export interface RosterBundle {
  snapshot: RosterSnapshot;
  spriteMeta: SpriteMeta;
}

interface RosterIndexRegulation {
  id: string;
  label: string;
  /** Filename of the snapshot for this regulation, e.g. `roster.mb.json`. */
  json: string;
}

interface RosterIndex {
  default: string;
  regulations: RosterIndexRegulation[];
}

const DATA_DIRECTORY = 'data/';
const INDEX_FILE = 'roster.index.json';
const SPRITE_META_FILE = 'sprite-meta.json';

/**
 * A snapshot filename must look exactly like the generator emits. The manifest is a
 * committed same-origin file, so this is defence in depth rather than a live threat —
 * but it is the difference between "a filename from data is interpolated into a URL"
 * and "only a name matching a fixed shape can ever reach one" (T-01-27).
 */
const SNAPSHOT_FILE_PATTERN = /^roster\.[a-z0-9]+\.json$/;

/**
 * Every failure — transport, HTTP status, malformed JSON, wrong shape — surfaces as
 * this one error carrying the contract's copy. The underlying cause is preserved on
 * `cause` so a console still shows what actually broke.
 */
export class RosterLoadError extends Error {
  constructor(cause: unknown) {
    super(ROSTER_LOAD_FAILURE_MESSAGE, { cause });
    this.name = 'RosterLoadError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

async function fetchJson(path: string): Promise<unknown> {
  const url = `${import.meta.env.BASE_URL}${path}`;
  // Same-origin static assets. `credentials: 'omit'` states that plainly rather than
  // relying on the same-origin default staying the default.
  const response = await fetch(url, { credentials: 'omit' });
  if (!response.ok) {
    throw new Error(`${url} responded ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as unknown;
}

function parseIndex(value: unknown): RosterIndex {
  if (!isRecord(value)) throw new Error('roster index is not an object');
  if (typeof value['default'] !== 'string') {
    throw new Error('roster index has no default regulation id');
  }
  if (!Array.isArray(value['regulations']) || value['regulations'].length === 0) {
    throw new Error('roster index lists no regulations');
  }

  const regulations: RosterIndexRegulation[] = [];
  for (const raw of value['regulations'] as unknown[]) {
    if (!isRecord(raw)) throw new Error('roster index regulation is not an object');
    const { id, label, json } = raw;
    if (typeof id !== 'string' || typeof label !== 'string' || typeof json !== 'string') {
      throw new Error('roster index regulation is missing id, label, or json');
    }
    regulations.push({ id, label, json });
  }

  return { default: value['default'], regulations };
}

function parseSnapshot(value: unknown): RosterSnapshot {
  if (!isRecord(value)) throw new Error('roster snapshot is not an object');
  if (!Array.isArray(value['entries']) || value['entries'].length === 0) {
    throw new Error('roster snapshot carries no entries');
  }
  if (!isRecord(value['counts'])) throw new Error('roster snapshot carries no counts');
  // The entry shape itself is generated by a tested pure transform and pinned by
  // tests/core/roster/fixtures.test.ts, so re-validating all 235 rows at runtime on
  // every page load would cost more than it proves.
  return value as unknown as RosterSnapshot;
}

function parseSpriteMeta(value: unknown): SpriteMeta {
  if (!isRecord(value)) throw new Error('sprite metadata is not an object');
  const { nativeWidth, nativeHeight, byRosterId } = value;
  if (!isPositiveInteger(nativeWidth) || !isPositiveInteger(nativeHeight)) {
    throw new Error('sprite metadata has no measured native dimensions');
  }
  if (!isRecord(byRosterId)) throw new Error('sprite metadata has no byRosterId map');
  return { nativeWidth, nativeHeight, byRosterId: byRosterId as Record<string, SpriteRef> };
}

/**
 * Read the committed roster snapshot for the default regulation, plus the sprite map.
 *
 * The index is read first so the default regulation is named in data rather than
 * hardcoded here — ROST-06 keeps the prior regulation's frozen snapshot alongside the
 * current one, and which is current is the manifest's decision, not this module's.
 */
export async function loadRoster(): Promise<RosterBundle> {
  try {
    const index = parseIndex(await fetchJson(`${DATA_DIRECTORY}${INDEX_FILE}`));

    const regulation = index.regulations.find((candidate) => candidate.id === index.default);
    if (regulation === undefined) {
      throw new Error(`roster index default "${index.default}" names no listed regulation`);
    }
    if (!SNAPSHOT_FILE_PATTERN.test(regulation.json)) {
      throw new Error(`roster index snapshot filename is not well formed: ${regulation.json}`);
    }

    const [snapshot, spriteMeta] = await Promise.all([
      fetchJson(`${DATA_DIRECTORY}${regulation.json}`).then(parseSnapshot),
      fetchJson(`${DATA_DIRECTORY}${SPRITE_META_FILE}`).then(parseSpriteMeta),
    ]);

    return { snapshot, spriteMeta };
  } catch (cause) {
    throw new RosterLoadError(cause);
  }
}
