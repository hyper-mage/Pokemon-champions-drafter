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
 *
 * ## `?refresh=1`, and why the invariant above is undisturbed by it
 *
 * REFR-01 adds a second fetch path that deliberately bypasses the precache, and it is
 * still the same origin: the marker is a fixed literal appended to the same three fixed
 * template paths, never a URL from data. `public/sw.js` looks for that marker and steps
 * aside, because the precache holds — by construction — exactly the roster the app is
 * already running, so a refresh answered from it would report "already current" forever.
 *
 * Off-origin was considered and rejected on its merits rather than on this invariant:
 * GitHub's raw-content host would serve the manifest with permissive CORS and need no
 * service-worker change at all, but it cannot bring the 300-plus sprite PNGs, so it
 * cannot deliver a USABLE new regulation. Same-origin follows as a consequence.
 *
 * Offline the refresh request simply fails, and that failure is correct rather than a
 * gap: REFR-02's `readRosterFile` is the alternative, it needs no network whatsoever,
 * and the failure copy names it.
 */

import type {
  BaseStats,
  MegaForme,
  RosterCounts,
  RosterEntry,
  RosterSnapshot,
} from '../core/roster/types';
import { readJsonFile } from './file-io';

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
 * REFR-01. The `?refresh` marker is what `public/sw.js` looks for to step aside; the
 * `cache: 'reload'` is what steps past the HTTP cache Pages sets to `max-age=600`.
 * BOTH are required and neither is sufficient — a service worker intercepts a
 * `reload` request like any other, and `ignoreSearch: true` makes the query alone
 * invisible to the cache lookup.
 */
const REFRESH_MARKER = '?refresh=1';

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

async function fetchJson(path: string, init?: RequestInit): Promise<unknown> {
  const url = `${import.meta.env.BASE_URL}${path}`;
  // Same-origin static assets. `credentials: 'omit'` states that plainly rather than
  // relying on the same-origin default staying the default. It leads the spread so a
  // caller adding `cache: 'reload'` cannot quietly drop it.
  const response = await fetch(url, { credentials: 'omit', ...init });
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
 * Every regulation this process has resolved, held at once. D-24.
 *
 * ## Why a `Map` here does not contradict CLAUDE.md §Serializability
 *
 * That rule governs the tournament DOCUMENT — the thing that is stringified into
 * `localStorage`, exported to a file, and folded by the reducer. This is module-local
 * process state that never enters the document, never crosses `dispatch`, and dies with
 * the tab. A `Map` in this codebase otherwise reads as a mistake, so: it is not one, and
 * the reason is that nothing here is ever persisted.
 *
 * ## It is keyed by BOTH names for a regulation
 *
 * The manifest calls the current regulation `mb`; the snapshot inside it calls itself
 * `M-B`; and `ConfigScreen` stamps the LATTER onto `config.rosterVersion`. A document
 * therefore arrives holding `M-B` while the manifest only ever says `mb`. Both keys point
 * at the same bundle OBJECT — not a copy — so a caller holding either name gets the same
 * snapshot and an identity comparison between them holds.
 */
const registry = new Map<string, RosterBundle>();

/**
 * The regulation id the manifest last named as its default, or `null` before any load.
 *
 * Read at the top of `loadRoster` so that a no-argument REPEAT call is as free as an
 * explicit one: without it, `loadRoster()` could not name what it already holds and would
 * re-fetch the manifest to be told a regulation it had resolved a moment ago. Written
 * again by `refreshRoster` when a newer regulation is adopted, which is what makes the
 * next no-argument call return the new default rather than the superseded one.
 */
let defaultRegulationId: string | null = null;

/**
 * Adopt a bundle under both of its names. The only writer of the registry.
 *
 * Called only after a snapshot has fully resolved — a failed load must leave nothing
 * behind, because a half-registered regulation would be indistinguishable from a
 * complete one at every later read.
 */
function register(id: string, bundle: RosterBundle): void {
  registry.set(id, bundle);
  const label = bundle.snapshot.regulation;
  if (isNonEmptyString(label)) registry.set(label, bundle);
  resolvedSpriteMeta = bundle.spriteMeta;
}

/**
 * The sprite map most recently resolved, or `null` before any load.
 *
 * `readRosterFile` reads it, because a host-supplied roster JSON carries rows and no art
 * — the sprite map is a separate committed file, keyed by roster id, and REFR-02 must
 * not put a request on the wire to go and get one. Pairing the imported snapshot with
 * the map the app already holds is honest rather than approximate: rows the map does not
 * know fall back to `_placeholder.png` through `handleSpriteError`
 * (`src/ui/sprite-src.ts:88-102`), which is the same degradation a refreshed regulation
 * already has offline.
 */
let resolvedSpriteMeta: SpriteMeta | null = null;

/**
 * The registry read: the bundle for a `rosterVersion`, or `null`.
 *
 * ## It returns `null` and MUST NOT fall back to the default
 *
 * Substituting the current roster for the one a document names would render a completed
 * tournament against a roster that could not have contained its picks — silently. A
 * Pokémon drafted under M-B and dropped in M-C would simply vanish from the team it won
 * with, and nothing on screen would say a substitution had happened. That is the
 * repudiation failure D-24 exists to prevent, so the honest answer is "this build has
 * never seen that regulation", every time.
 *
 * The caller's recovery is REFR-02's roster-file import, and the SURFACE for saying so
 * already exists: `rosterDriftNotice` and `missingFromRoster` in `src/app.tsx:2325-2345`
 * are the established way this app states "this document references something this roster
 * does not contain". 05-07 wires that existing sentence rather than inventing a second
 * one; this plan does not modify `app.tsx`.
 */
export function resolveSnapshot(rosterVersion: string): RosterBundle | null {
  return registry.get(rosterVersion) ?? null;
}

/**
 * Resolve one regulation's snapshot, plus the sprite map.
 *
 * With no argument this reads the manifest's `default`, so which regulation is current is
 * data's decision rather than this module's — ROST-06 keeps the prior regulation's frozen
 * snapshot committed alongside it. With an argument it resolves that regulation instead,
 * and BOTH remain resolvable afterwards: resolving one never evicts another, which is the
 * whole point of D-24. A filed M-B night stays an M-B night on a build that has moved on.
 *
 * A regulation already in the registry is returned without touching the network. The
 * manifest is still read when the requested id is not yet held, because an id that is not
 * in the registry may not be in the manifest either, and that has to be found out.
 */
export async function loadRoster(regulationId?: string): Promise<RosterBundle> {
  const requested = regulationId ?? defaultRegulationId;
  if (requested !== null) {
    const held = registry.get(requested);
    if (held !== undefined) return held;
  }

  try {
    const index = parseIndex(await fetchJson(`${DATA_DIRECTORY}${INDEX_FILE}`));
    const wanted = regulationId ?? index.default;
    // Recorded before the snapshot fetch so that the manifest is read at most once per
    // process for the default, even when the first call named it explicitly.
    if (regulationId === undefined) defaultRegulationId = index.default;

    const alreadyHeld = registry.get(wanted);
    if (alreadyHeld !== undefined) return alreadyHeld;

    const regulation = index.regulations.find((candidate) => candidate.id === wanted);
    if (regulation === undefined) {
      throw new Error(`roster index has no regulation "${wanted}"`);
    }
    if (!SNAPSHOT_FILE_PATTERN.test(regulation.json)) {
      throw new Error(`roster index snapshot filename is not well formed: ${regulation.json}`);
    }

    const [snapshot, spriteMeta] = await Promise.all([
      fetchJson(`${DATA_DIRECTORY}${regulation.json}`).then(parseSnapshot),
      fetchJson(`${DATA_DIRECTORY}${SPRITE_META_FILE}`).then(parseSpriteMeta),
    ]);

    const bundle: RosterBundle = { snapshot, spriteMeta };
    register(regulation.id, bundle);
    return bundle;
  } catch (cause) {
    throw new RosterLoadError(cause);
  }
}

/**
 * What a refresh did. Three outcomes, and `05-UI-SPEC.md` §2 maps a sentence onto each.
 *
 * `failed` carries no reason on purpose: the copy the host reads does not branch on
 * whether GitHub was unreachable or the file was malformed, because the next action is
 * the same either way — try again later, or import a roster file.
 */
export type RefreshOutcome =
  | { kind: 'alreadyCurrent'; label: string }
  | { kind: 'updated'; label: string; validUntil: string }
  | { kind: 'failed' };

/**
 * REFR-01. Go and ask the origin whether a newer regulation has been deployed.
 *
 * ## The comparison reads `checksum` and `regulation`, never a size
 *
 * `roster.mb.json` is 147,021 bytes in a Windows checkout and 140,170 on the origin,
 * with an IDENTICAL checksum. `core.autocrlf` is `true` and there is no `.gitattributes`,
 * so the working copy has CRLF line endings and the deployed file has LF. Any comparison
 * that read a byte count, a content-length header or a string length would therefore
 * report a change on every developer machine forever and never on CI — the worst
 * possible split.
 * The checksum is computed over `canonicalJson(entries)` from PARSED values, so it is
 * line-ending independent by construction, and it is the only thing worth comparing.
 *
 * ## Usually one 1.8 KB request
 *
 * The manifest alone answers the common case. When its default regulation and checksum
 * match what is already resolved, this returns before the snapshot is ever requested —
 * which is why a host tapping the refresh button on a mobile connection costs almost
 * nothing, and why tapping it repeatedly is harmless.
 *
 * ## Sprites, offline, stated rather than discovered
 *
 * A refreshed regulation adds species whose PNGs are on the origin but NOT in the current
 * precache: the worker only gains them when a new deploy changes the content hash and the
 * new worker activates on a later load. Offline, those rows fall back to the committed
 * `_placeholder.png` through `handleSpriteError` (`src/ui/sprite-src.ts:88-102`). That is
 * an accepted degradation, written down here so nobody debugs it later as a bug.
 *
 * ## Nothing is adopted until everything parses
 *
 * A transport failure, a non-`ok` response, or a snapshot `parseSnapshotStrict` refuses
 * all return `failed` and leave the registry byte-for-byte as it was. A half-adopted
 * regulation would be indistinguishable from a complete one at every later read.
 */
export async function refreshRoster(): Promise<RefreshOutcome> {
  try {
    const index = parseIndex(
      await fetchJson(`${DATA_DIRECTORY}${INDEX_FILE}${REFRESH_MARKER}`, { cache: 'reload' }),
    );

    const regulation = index.regulations.find((candidate) => candidate.id === index.default);
    if (regulation === undefined) return { kind: 'failed' };

    const current = defaultRegulationId === null ? undefined : registry.get(defaultRegulationId);
    if (
      current !== undefined &&
      defaultRegulationId === regulation.id &&
      current.snapshot.checksum === regulation.checksum
    ) {
      return { kind: 'alreadyCurrent', label: regulation.label };
    }

    // `regulation.json` already passed `SNAPSHOT_FILE_PATTERN` inside `parseIndex`, which
    // is why that gate lives there rather than in the one caller that existed when it was
    // written. `REFRESH_MARKER` is a fixed literal and is never interpolated from data.
    const [snapshot, spriteMeta] = await Promise.all([
      fetchJson(`${DATA_DIRECTORY}${regulation.json}${REFRESH_MARKER}`, { cache: 'reload' }),
      fetchJson(`${DATA_DIRECTORY}${SPRITE_META_FILE}${REFRESH_MARKER}`, { cache: 'reload' }),
    ]);

    const parsed = parseSnapshotStrict(snapshot);
    if (parsed === null) return { kind: 'failed' };

    register(regulation.id, { snapshot: parsed, spriteMeta: parseSpriteMeta(spriteMeta) });
    defaultRegulationId = regulation.id;

    return { kind: 'updated', label: regulation.label, validUntil: regulation.validUntil };
  } catch {
    // Offline, mid-deploy, or a manifest that no longer parses. The caller states the
    // problem and offers `readRosterFile` as the recovery; there is nothing to retry here.
    return { kind: 'failed' };
  }
}

/**
 * REFR-02. Take a roster the host chose in a file picker. No network, at all.
 *
 * This is the path that works on a laptop with no connection, which is why the refresh
 * failure copy names it, and it is also the recovery D-24 promises: a night filed under a
 * regulation this build has never shipped becomes readable the moment the host hands the
 * tool the roster it was drafted against. The parsed snapshot is therefore ADOPTED into
 * the registry under its own `regulation`, so `resolveSnapshot` stops answering `null`
 * for it.
 *
 * It does NOT become the default. A host importing a roster to read an old night must not
 * silently re-point new tournaments at it; 05-07 owns any deliberate switch.
 *
 * Validation is `parseSnapshotStrict` — the SAME validator the fetch path uses. One
 * validator with two entry points, because a second one would be free to disagree about
 * what a roster is, and this input is the least trusted of the two.
 */
export async function readRosterFile(file: File): Promise<RosterBundle | null> {
  const spriteMeta = resolvedSpriteMeta;
  // The sprite map ships with the app and is precached, so an empty one here means the
  // page-load path itself failed — which importing a roster file cannot repair.
  if (spriteMeta === null) return null;

  // The size gate runs on metadata, before a single byte is read (`file-io.ts:130-140`).
  const read = await readJsonFile(file);
  if (!read.ok) return null;

  let value: unknown;
  try {
    // No reviver, exactly as on the fetch path.
    value = JSON.parse(read.text) as unknown;
  } catch {
    return null;
  }

  const snapshot = parseSnapshotStrict(value);
  if (snapshot === null) return null;

  const bundle: RosterBundle = { snapshot, spriteMeta };
  register(snapshot.regulation, bundle);
  return bundle;
}
