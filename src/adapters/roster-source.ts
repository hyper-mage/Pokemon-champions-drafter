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

import type {
  BaseStats,
  MegaForme,
  RosterCounts,
  RosterEntry,
  RosterSnapshot,
} from '../core/roster/types';

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

/**
 * One regulation as the manifest describes it.
 *
 * Everything past `json` was already in `public/data/roster.index.json` and was already
 * being dropped on the floor. Each new field has exactly one consumer, and each one is
 * load-bearing rather than decorative:
 *
 * - `validUntil` — REFR-03's staleness banner. The interval is HALF-OPEN, so this is the
 *   first day the snapshot is stale, not the last day it is current; the reasoning lives
 *   in `src/core/roster/staleness.ts`.
 * - `checksum` — REFR-01's already-current check. It is compared against the resolved
 *   snapshot's own `checksum` and NEVER against a byte count; see `refreshRoster`.
 * - `counts` — the cross-check `parseSnapshotStrict` performs, and the figure the config
 *   screen shows before a snapshot has been fetched at all.
 * - `validFrom` — carried with `validUntil` because a half-open interval is meaningless
 *   with only one end of it.
 */
export interface SnapshotIndexEntry {
  id: string;
  label: string;
  /** Filename of the snapshot for this regulation, e.g. `roster.mb.json`. */
  json: string;
  /** `YYYY-MM-DD`. */
  validFrom: string;
  /** `YYYY-MM-DD`. The first stale day, not the last current one. */
  validUntil: string;
  checksum: string;
  counts: {
    draftable: number;
    /**
     * The manifest spells this `megaCapableSpecies`. It is renamed on the way in because
     * the figure counts draftable ENTRIES, not base species — Meowstic and Meowstic-F
     * share a base species and each carries its own Mega, which is why the audit reports
     * 74 here and 73 base species.
     */
    megaCapable: number;
  };
}

export interface RosterIndex {
  default: string;
  regulations: SnapshotIndexEntry[];
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
 * `YYYY-MM-DD`, zero-padded, and nothing else.
 *
 * Shape only — this does not prove `2026-02-31` is a real day. It does not need to:
 * `isSnapshotStale` compares these lexicographically and never constructs a Date, so an
 * impossible-but-well-shaped date sorts harmlessly. What the shape check actually stops
 * is `17/06/2026`, which sorts before every ISO date and would report every snapshot as
 * current forever.
 */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The upper bound on a snapshot's row count — 5000.
 *
 * The same reasoning as `MAX_MEGA_FORME_BANS` in `src/core/import-guard.ts`, against the
 * same population: the committed M-B snapshot holds 235 draftable rows and M-A holds 213.
 * Twenty times any roster this project will ever see absorbs every regulation rotation
 * and still refuses a file that declares a million Pokémon. Without a bound, a hostile
 * file is not a security problem so much as a frozen tab.
 */
export const MAX_SNAPSHOT_ENTRIES = 5000;

/** No species has had more than two types. Four leaves room and still refuses a list. */
const MAX_TYPES_PER_ENTRY = 4;

/** Charizard and Mewtwo carry two. Eight is generous and still bounded. */
const MAX_MEGA_FORMES_PER_ENTRY = 8;

/** The six Champions stats, in Showdown's canonical key order. */
const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;

/**
 * Every count the generator measures, written out.
 *
 * A fixed list rather than a copy of whatever the file happens to carry, for the reason
 * `buildPlayers` gives about its two fields: a snapshot carrying a fourteenth count loses
 * it here, and that is the intended outcome rather than a limitation.
 */
const COUNT_KEYS = [
  'legalEntries',
  'baseSpecies',
  'alternateFormes',
  'megaFormes',
  'megaCapableSpecies',
  'draftable',
  'excludedNonstandard',
  'excludedIllegalTier',
  'excludedBattleOnly',
  'excludedCosmetic',
  'distinctBaseSpecies',
  'megaCapableBaseSpecies',
  'orphanedMegaFormes',
] as const;

/**
 * The three keys that turn a data structure into a code path.
 *
 * The posture, and this comment's substance, come from `src/core/import-guard.ts` — where
 * the list is module-private, which is why it is restated here rather than imported.
 * `JSON.parse` itself cannot pollute: it defines data properties and never invokes a
 * setter. The danger is everything downstream — a bulk field copy or an index assignment
 * will happily walk one of these into `Object.prototype`. The rebuild below performs none
 * of those operations, and refuses the keys anyway, because "the current implementation
 * happens not to" is not a security property.
 */
const POISON_KEYS = ['__proto__', 'constructor', 'prototype'] as const;

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

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && ISO_DATE_PATTERN.test(value);
}

/**
 * Whether an object carries a poison key as its OWN property.
 *
 * Checked with the prototype's `hasOwnProperty` rather than the method on the value,
 * because the value's own `hasOwnProperty` may itself be attacker-supplied — which is
 * exactly the class of trick this is looking for. Same reasoning as `import-guard.ts`.
 */
function hasPoisonKey(value: Record<string, unknown>): boolean {
  for (const key of POISON_KEYS) {
    if (Object.prototype.hasOwnProperty.call(value, key)) return true;
  }
  return false;
}

/** A plain object that is also clean. Every descent into a parsed value goes through here. */
function safeObject(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  if (hasPoisonKey(value)) return null;
  return value;
}

/** A fresh array of the six stats, or null. The copy is the point: no aliasing. */
function buildBaseStats(value: unknown): BaseStats | null {
  const raw = safeObject(value);
  if (raw === null) return null;

  const stats: Record<string, number> = {};
  for (const key of STAT_KEYS) {
    const stat = raw[key];
    // A numeric STRING is the interesting rejection here: it renders fine, sorts wrong,
    // and turns every stat total into concatenation.
    if (typeof stat !== 'number' || !Number.isFinite(stat)) return null;
    stats[key] = stat;
  }

  return stats as unknown as BaseStats;
}

/** A fresh array of type names, or null. */
function buildTypes(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (value.length > MAX_TYPES_PER_ENTRY) return null;

  const types: string[] = [];
  for (const type of value) {
    if (!isNonEmptyString(type)) return null;
    types.push(type);
  }
  return types;
}

function buildMegaFormes(value: unknown): MegaForme[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length > MAX_MEGA_FORMES_PER_ENTRY) return null;

  const formes: MegaForme[] = [];
  for (const raw of value) {
    const entry = safeObject(raw);
    if (entry === null) return null;

    const { id, name, forme, requiredItem, spriteId } = entry;
    const types = buildTypes(entry['types']);
    const baseStats = buildBaseStats(entry['baseStats']);

    if (!isNonEmptyString(id) || !isNonEmptyString(name)) return null;
    // A Mega with no stone is not a Mega — `types.ts` says so and the export path reads it.
    if (!isNonEmptyString(forme) || !isNonEmptyString(requiredItem)) return null;
    if (spriteId !== null && !isNonEmptyString(spriteId)) return null;
    if (types === null || baseStats === null) return null;

    formes.push({ id, name, forme, requiredItem, spriteId, types, baseStats });
  }
  return formes;
}

function buildEntry(value: unknown): RosterEntry | null {
  const raw = safeObject(value);
  if (raw === null) return null;

  const { id, name, num, baseSpeciesId, forme, megaCapable, spriteId, spriteMissing } = raw;
  const types = buildTypes(raw['types']);
  const baseStats = buildBaseStats(raw['baseStats']);
  const megaFormes = buildMegaFormes(raw['megaFormes']);

  if (!isNonEmptyString(id) || !isNonEmptyString(name)) return null;
  if (!isPositiveInteger(num)) return null;
  if (types === null || baseStats === null) return null;
  if (!isNonEmptyString(baseSpeciesId)) return null;
  if (forme !== null && !isNonEmptyString(forme)) return null;
  if (typeof megaCapable !== 'boolean') return null;
  if (megaFormes === null) return null;
  if (spriteId !== null && !isNonEmptyString(spriteId)) return null;
  // Required rather than defaulted. Guessing `false` for a row whose art is genuinely
  // absent puts a request on the wire for a PNG that is not there, 235 times over.
  if (typeof spriteMissing !== 'boolean') return null;

  // Eleven named fields, written out. A row carrying a twelfth loses it here, which is
  // the intended outcome rather than a limitation (`buildPlayers`, import-guard.ts:374).
  return {
    id,
    name,
    num,
    types,
    baseStats,
    baseSpeciesId,
    forme,
    megaCapable,
    megaFormes,
    spriteId,
    spriteMissing,
  };
}

function buildCounts(value: unknown): RosterCounts | null {
  const raw = safeObject(value);
  if (raw === null) return null;

  const counts: Record<string, number> = {};
  for (const key of COUNT_KEYS) {
    const count = raw[key];
    if (!isNonNegativeInteger(count)) return null;
    counts[key] = count;
  }
  return counts as unknown as RosterCounts;
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

/**
 * Read the manifest, carrying every field the phase needs off it.
 *
 * Throws rather than returning `null`, unlike `parseSnapshotStrict` below: `loadRoster`
 * wraps this in a `RosterLoadError` and the specific message survives on `cause`, which
 * is the difference between "the roster did not load" in a console and knowing which of
 * six things was wrong with the manifest. Every message here begins `roster index`.
 */
export function parseIndex(value: unknown): RosterIndex {
  if (!isRecord(value)) throw new Error('roster index is not an object');
  if (typeof value['default'] !== 'string') {
    throw new Error('roster index has no default regulation id');
  }
  if (!Array.isArray(value['regulations']) || value['regulations'].length === 0) {
    throw new Error('roster index lists no regulations');
  }

  const regulations: SnapshotIndexEntry[] = [];
  for (const raw of value['regulations'] as unknown[]) {
    if (!isRecord(raw)) throw new Error('roster index regulation is not an object');
    const { id, label, json, validFrom, validUntil, checksum } = raw;
    if (typeof id !== 'string' || typeof label !== 'string' || typeof json !== 'string') {
      throw new Error('roster index regulation is missing id, label, or json');
    }
    // The gate that keeps "a filename from data" from ever becoming "an arbitrary URL"
    // (T-01-27). Applied here rather than only at the fetch site, because this plan adds
    // a SECOND fetch path and a gate that lives in one caller protects one caller.
    if (!SNAPSHOT_FILE_PATTERN.test(json)) {
      throw new Error(`roster index snapshot filename is not well formed: ${json}`);
    }
    if (!isIsoDate(validFrom) || !isIsoDate(validUntil)) {
      throw new Error(`roster index regulation "${id}" has no well-formed validity window`);
    }
    if (!isNonEmptyString(checksum)) {
      throw new Error(`roster index regulation "${id}" carries no checksum`);
    }

    const counts = isRecord(raw['counts']) ? raw['counts'] : null;
    const draftable = counts?.['draftable'];
    const megaCapable = counts?.['megaCapableSpecies'];
    if (!isNonNegativeInteger(draftable) || !isNonNegativeInteger(megaCapable)) {
      throw new Error(`roster index regulation "${id}" carries no counts`);
    }

    regulations.push({
      id,
      label,
      json,
      validFrom,
      validUntil,
      checksum,
      counts: { draftable, megaCapable },
    });
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

/**
 * The same file, checked instead of trusted. Returns `null` on any refusal.
 *
 * ## Why this exists beside `parseSnapshot` rather than replacing it
 *
 * `parseSnapshot`'s exemption above is sound FOR ITS INPUT: a file generated by a tested
 * pure transform, pinned by `tests/core/roster/fixtures.test.ts`, and read from the
 * precache on every page load. Re-validating 235 rows on every load would cost more than
 * it proves. Neither refresh path has that input. REFR-02's file is whatever the host
 * chose in a picker, and REFR-01's has crossed the network. One validator serves both,
 * because a second one would be free to disagree about what a roster is.
 *
 * ## It never recomputes the SHA-256, and must not start
 *
 * Three reasons, written here so nobody adds it later believing it was an oversight:
 *
 * 1. The checksum is SELF-DECLARED by the file. Recomputing it proves internal
 *    consistency, not authenticity — and the structural checks below already prove
 *    consistency, more cheaply and with better failure messages.
 * 2. It would require shipping `canonicalJson`, which exists only in
 *    `scripts/build-roster.mjs` and is build-time code by design.
 * 3. The Web Crypto `SubtleCrypto` digest interface is **undefined outside a secure
 *    context**. `src/adapters/id.ts` already documents the deployment this project cares
 *    about — "a phone opening the host's laptop over `http://192.168.x.x`".
 *    `getRandomValues` has an insecure-context fallback; the digest interface has none. A
 *    verification step that silently cannot run on the exact deployment the codebase
 *    already worries about is worse than no verification step.
 *
 * A `grep` for the lowercase API name over this file returns nothing, and that is an
 * acceptance criterion of the plan that added this function rather than a coincidence.
 *
 * The checksum stays an IDENTITY value, which is all `config.rosterChecksum` and
 * `pool/built.checksum` ever use it for.
 *
 * ## Refusal is a return, not a throw
 *
 * Following `buildPlayers` (`src/core/import-guard.ts:367`). Both callers want a decision
 * rather than an exception: `refreshRoster` maps it to `{ kind: 'failed' }` and
 * `readRosterFile` to `null`. `JSON.parse` runs with no reviver on both paths.
 */
export function parseSnapshotStrict(value: unknown): RosterSnapshot | null {
  const raw = safeObject(value);
  if (raw === null) return null;

  const { schemaVersion, regulation, validFrom, validUntil, upstreamRef, generatedAt } = raw;
  if (!isPositiveInteger(schemaVersion)) return null;
  // `regulation` is a LABEL — `M-B` — not a date, and `ConfigScreen` stamps it onto
  // `config.rosterVersion` verbatim. Only `validFrom` and `validUntil` are ISO dates.
  if (!isNonEmptyString(regulation)) return null;
  if (!isIsoDate(validFrom) || !isIsoDate(validUntil)) return null;
  if (!isNonEmptyString(upstreamRef) || !isNonEmptyString(generatedAt)) return null;
  if (!isNonEmptyString(raw['checksum'])) return null;
  const checksum = raw['checksum'];

  if (!Array.isArray(raw['entries']) || raw['entries'].length === 0) return null;
  if (raw['entries'].length > MAX_SNAPSHOT_ENTRIES) return null;

  const counts = buildCounts(raw['counts']);
  if (counts === null) return null;

  const entries: RosterEntry[] = [];
  const seen = new Set<string>();
  for (const row of raw['entries'] as unknown[]) {
    const entry = buildEntry(row);
    if (entry === null) return null;
    // A duplicate id makes every id-keyed lookup in the app disagree with
    // `entries.length` — the pool would be one short and nothing would say why.
    if (seen.has(entry.id)) return null;
    seen.add(entry.id);
    entries.push(entry);
  }

  // The cheapest cross-check in the file, and the one that catches truncation: a file cut
  // off mid-array is still valid JSON surprisingly often.
  if (counts.draftable !== entries.length) return null;

  return {
    schemaVersion,
    regulation,
    validFrom,
    validUntil,
    upstreamRef,
    generatedAt,
    counts,
    checksum,
    entries,
  };
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
