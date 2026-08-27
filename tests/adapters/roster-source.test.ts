/**
 * roster-source — the module's first tests.
 *
 * This file exists partly because 05-RESEARCH Correction 1 found that the T-01-25
 * invariant ("no third-party origin is contacted at runtime") was stated in the module's
 * doc block, cited in two planning documents, and asserted by nothing at all. There was
 * no test anywhere naming `loadRoster`, `RosterLoadError` or a third-party origin. The
 * same-origin assertion this file adds is the first one this project has had.
 *
 * The module holds process-local state — the snapshot registry — so every test takes a
 * FRESH instance through `vi.resetModules()` rather than sharing one. A registry that
 * leaked between cases would make "resolveSnapshot returns null before loadRoster" pass
 * or fail depending on which test ran first.
 *
 * Stubs, like `tests/adapters/view-prefs.test.ts` and for the same reason stated there:
 * a working network is the case that needs no test.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import committedIndex from '../../public/data/roster.index.json';
import committedSnapshotMa from '../../public/data/roster.ma.json';
import committedSnapshot from '../../public/data/roster.mb.json';
import committedSpriteMeta from '../../public/data/sprite-meta.json';
import type { RosterSnapshot } from '../../src/core/roster/types';

type RosterSource = typeof import('../../src/adapters/roster-source');

let mod: RosterSource;

const realFetch = globalThis.fetch;

beforeEach(async () => {
  vi.resetModules();
  mod = await import('../../src/adapters/roster-source');
  calls = [];
});

afterEach(() => {
  Object.defineProperty(globalThis, 'fetch', {
    value: realFetch,
    configurable: true,
    writable: true,
  });
});

/**
 * Every `parseIndex` refusal message starts with `roster index`, and this matcher relies
 * on that rather than on a bare `.toThrow()`.
 *
 * A bare `.toThrow()` proves nothing here: calling an export that does not exist yet also
 * throws, so a rejection table written that way passes against an empty module and the
 * RED step of this plan proves nothing. `parseSnapshotStrict` sidesteps the problem
 * differently — it RETURNS `null` rather than throwing, following `buildPlayers`
 * (`src/core/import-guard.ts:367`), and `toBeNull()` cannot be satisfied by a TypeError.
 */
const INDEX_REFUSAL = /^roster index/;

/** Assert acceptance and narrow away the `| null` in one place. */
function accepted(value: unknown): RosterSnapshot {
  const snapshot = mod.parseSnapshotStrict(value);
  expect(snapshot).not.toBeNull();
  return snapshot as RosterSnapshot;
}

/** Assert refusal. `null`, never an exception — see the note above. */
function rejected(value: unknown): void {
  expect(mod.parseSnapshotStrict(value)).toBeNull();
}

// ---------------------------------------------------------------------------
// Fixtures — trimmed, but structurally faithful to the committed snapshot
// ---------------------------------------------------------------------------

type Loose = Record<string, unknown>;

function makeCounts(draftable: number): Loose {
  return {
    legalEntries: draftable,
    baseSpecies: draftable,
    alternateFormes: 0,
    megaFormes: 0,
    megaCapableSpecies: 0,
    draftable,
    excludedNonstandard: 0,
    excludedIllegalTier: 0,
    excludedBattleOnly: 0,
    excludedCosmetic: 0,
    distinctBaseSpecies: draftable,
    megaCapableBaseSpecies: 0,
    orphanedMegaFormes: 0,
  };
}

function makeEntry(id: string, num: number): Loose {
  return {
    id,
    name: id,
    num,
    types: ['Grass'],
    baseStats: { hp: 90, atk: 92, def: 75, spa: 92, spd: 85, spe: 60 },
    baseSpeciesId: id,
    forme: null,
    megaCapable: false,
    megaFormes: [],
    spriteId: id,
    spriteMissing: false,
  };
}

function makeSnapshot(overrides: Loose = {}): Loose {
  const entries = [makeEntry('abomasnow', 460), makeEntry('absol', 359)];
  return {
    schemaVersion: 1,
    regulation: 'M-B',
    validFrom: '2026-06-17',
    validUntil: '2026-09-02',
    upstreamRef: 'npm:pokemon-showdown@0.11.11',
    generatedAt: '2026-08-04T19:11:54.426Z',
    counts: makeCounts(entries.length),
    checksum: 'sha256-952dc741977d3db0236743f146f78f76ca34c215acfa0308e074a8f8ff9f7230',
    entries,
    ...overrides,
  };
}

/** A one-row snapshot whose row is missing exactly one field. */
function snapshotWithRowMissing(field: string): Loose {
  const entry = makeEntry('abomasnow', 460);
  delete entry[field];
  return makeSnapshot({ entries: [entry], counts: makeCounts(1) });
}

/** A one-row snapshot carrying a caller-supplied row. */
function snapshotWithRow(entry: Loose): Loose {
  return makeSnapshot({ entries: [entry], counts: makeCounts(1) });
}

// ---------------------------------------------------------------------------
// The fetch stub
// ---------------------------------------------------------------------------

/**
 * Recorded so the same-origin assertion can read every URL the module ever built. That
 * assertion is the point of the whole harness — see the file header.
 */
interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

let calls: FetchCall[];

/** A route that answers with a non-`ok` response. */
const NOT_FOUND = Symbol('not found');
/** A route whose fetch rejects outright — offline, DNS failure, a killed radio. */
const REJECTS = Symbol('rejects');

/** The committed files, which is what the origin actually serves. */
function defaultRoutes(): Map<string, unknown> {
  return new Map<string, unknown>([
    ['roster.index.json', committedIndex],
    ['roster.mb.json', committedSnapshot],
    ['roster.ma.json', committedSnapshotMa],
    ['sprite-meta.json', committedSpriteMeta],
  ]);
}

/**
 * Install a `fetch` that serves the routes and records every call.
 *
 * Routed by filename rather than by whole URL on purpose: the refresh path appends a
 * query marker, and a route table keyed on the exact URL would quietly stop matching the
 * moment that marker was added — which is the behaviour under test.
 */
function installFetch(routes: Map<string, unknown> = defaultRoutes()): void {
  const stub = async (input: unknown, init?: RequestInit): Promise<unknown> => {
    const url = String(input);
    calls.push({ url, init });

    for (const [name, body] of routes) {
      if (!url.includes(name)) continue;
      if (body === REJECTS) throw new TypeError('Failed to fetch');
      if (body === NOT_FOUND) return { ok: false, status: 404, statusText: 'Not Found' };
      return { ok: true, status: 200, statusText: 'OK', json: async () => body };
    }

    return { ok: false, status: 404, statusText: 'Not Found' };
  };

  Object.defineProperty(globalThis, 'fetch', {
    value: stub,
    configurable: true,
    writable: true,
  });
}

/** Attach a poison key as an OWN property. Object literals cannot express this. */
function poison(target: Loose, key: string): Loose {
  Object.defineProperty(target, key, {
    value: { polluted: true },
    enumerable: true,
    configurable: true,
    writable: true,
  });
  return target;
}

// ---------------------------------------------------------------------------
// parseIndex — widened
// ---------------------------------------------------------------------------

describe('parseIndex', () => {
  it('carries validFrom, validUntil, checksum and counts off the committed index', () => {
    const index = mod.parseIndex(committedIndex);

    expect(index.default).toBe('mb');

    const mb = index.regulations.find((entry) => entry.id === 'mb');
    expect(mb).toBeDefined();
    expect(mb?.label).toBe('M-B');
    expect(mb?.json).toBe('roster.mb.json');
    expect(mb?.validFrom).toBe('2026-06-17');
    expect(mb?.validUntil).toBe('2026-09-02');
    expect(mb?.checksum).toBe(
      'sha256-952dc741977d3db0236743f146f78f76ca34c215acfa0308e074a8f8ff9f7230',
    );
    expect(mb?.counts.draftable).toBe(235);
    expect(mb?.counts.megaCapable).toBe(74);
  });

  it('holds both committed regulations, not only the default', () => {
    const index = mod.parseIndex(committedIndex);

    expect(index.regulations.map((entry) => entry.id).sort()).toEqual(['ma', 'mb']);
  });

  it('refuses an entry whose json escapes the data directory', () => {
    const hostile = {
      default: 'mb',
      regulations: [
        {
          id: 'mb',
          label: 'M-B',
          json: '../secrets.json',
          validFrom: '2026-06-17',
          validUntil: '2026-09-02',
          checksum: 'sha256-abc',
          counts: { draftable: 235, megaCapableSpecies: 74 },
        },
      ],
    };

    expect(() => mod.parseIndex(hostile)).toThrow(INDEX_REFUSAL);
  });

  it('refuses an entry missing validUntil', () => {
    const index = {
      default: 'mb',
      regulations: [
        {
          id: 'mb',
          label: 'M-B',
          json: 'roster.mb.json',
          validFrom: '2026-06-17',
          checksum: 'sha256-abc',
          counts: { draftable: 235, megaCapableSpecies: 74 },
        },
      ],
    };

    expect(() => mod.parseIndex(index)).toThrow(INDEX_REFUSAL);
  });

  it('refuses an entry missing checksum', () => {
    const index = {
      default: 'mb',
      regulations: [
        {
          id: 'mb',
          label: 'M-B',
          json: 'roster.mb.json',
          validFrom: '2026-06-17',
          validUntil: '2026-09-02',
          counts: { draftable: 235, megaCapableSpecies: 74 },
        },
      ],
    };

    expect(() => mod.parseIndex(index)).toThrow(INDEX_REFUSAL);
  });
});

// ---------------------------------------------------------------------------
// parseSnapshotStrict — the validation parseSnapshot deliberately does not do
// ---------------------------------------------------------------------------

describe('parseSnapshotStrict', () => {
  it('accepts the committed roster.mb.json unchanged', () => {
    const snapshot = accepted(committedSnapshot);

    expect(snapshot.entries).toHaveLength(235);
    expect(snapshot.regulation).toBe('M-B');
    expect(snapshot.validUntil).toBe('2026-09-02');
    expect(snapshot.counts.draftable).toBe(235);
    expect(snapshot.checksum).toBe(
      'sha256-952dc741977d3db0236743f146f78f76ca34c215acfa0308e074a8f8ff9f7230',
    );
    // Faithful, not merely non-null: a Mega-capable row keeps its formes, which is what
    // every Mega-requirement rule in the core reads.
    const abomasnow = snapshot.entries.find((entry) => entry.id === 'abomasnow');
    expect(abomasnow?.megaCapable).toBe(true);
    expect(abomasnow?.megaFormes[0]?.requiredItem).toBe('Abomasite');
  });

  it('accepts a trimmed but structurally faithful snapshot', () => {
    expect(accepted(makeSnapshot()).entries.map((entry) => entry.id)).toEqual([
      'abomasnow',
      'absol',
    ]);
  });

  it('rejects a non-array entries', () => {
    rejected(makeSnapshot({ entries: {} }));
  });

  it('rejects an empty entries', () => {
    rejected(makeSnapshot({ entries: [], counts: makeCounts(0) }));
  });

  it('rejects an entries array longer than the stated bound', () => {
    const tooMany = Array.from({ length: mod.MAX_SNAPSHOT_ENTRIES + 1 }, (_unused, index) =>
      makeEntry(`mon${index}`, index + 1),
    );

    expect(tooMany.length).toBeGreaterThan(mod.MAX_SNAPSHOT_ENTRIES);
    rejected(makeSnapshot({ entries: tooMany, counts: makeCounts(tooMany.length) }));
  });

  for (const field of [
    'id',
    'name',
    'num',
    'types',
    'baseStats',
    'megaCapable',
    'megaFormes',
  ] as const) {
    it(`rejects a row missing ${field}`, () => {
      rejected(snapshotWithRowMissing(field));
    });
  }

  it('rejects a baseStats without all six numeric keys', () => {
    const entry = makeEntry('abomasnow', 460);
    entry['baseStats'] = { hp: 90, atk: 92, def: 75, spa: 92, spd: 85 };

    rejected(snapshotWithRow(entry));
  });

  it('rejects a baseStats whose value is a numeric string', () => {
    const entry = makeEntry('abomasnow', 460);
    entry['baseStats'] = { hp: '90', atk: 92, def: 75, spa: 92, spd: 85, spe: 60 };

    rejected(snapshotWithRow(entry));
  });

  it('rejects a duplicate id', () => {
    const entries = [makeEntry('abomasnow', 460), makeEntry('abomasnow', 460)];

    rejected(makeSnapshot({ entries, counts: makeCounts(2) }));
  });

  it('rejects a counts.draftable one less than entries.length', () => {
    rejected(makeSnapshot({ counts: makeCounts(1) }));
  });

  it('rejects a regulation that is not a non-empty string', () => {
    rejected(makeSnapshot({ regulation: '' }));
  });

  for (const field of ['validFrom', 'validUntil'] as const) {
    it(`rejects a ${field} that is not YYYY-MM-DD shaped`, () => {
      rejected(makeSnapshot({ [field]: '17/06/2026' }));
    });
  }

  it('rejects an empty checksum', () => {
    rejected(makeSnapshot({ checksum: '' }));
  });

  it('rejects an absent checksum', () => {
    const snapshot = makeSnapshot();
    delete snapshot['checksum'];

    rejected(snapshot);
  });

  for (const key of ['__proto__', 'constructor', 'prototype'] as const) {
    it(`rejects an own ${key} property at the top level`, () => {
      rejected(poison(makeSnapshot(), key));
    });

    it(`rejects an own ${key} property on a row`, () => {
      rejected(snapshotWithRow(poison(makeEntry('abomasnow', 460), key)));
    });
  }

  it('returns a freshly rebuilt object — a row carrying an extra field loses it', () => {
    const entry = makeEntry('abomasnow', 460);
    entry['sneakyField'] = 'still here?';

    const rebuilt = accepted(snapshotWithRow(entry)).entries[0] as unknown as Loose;

    expect(rebuilt['sneakyField']).toBeUndefined();
    expect(rebuilt).not.toBe(entry);
    expect(rebuilt['id']).toBe('abomasnow');
  });

  it('drops the generator bookkeeping keys the committed file carries', () => {
    const snapshot = accepted(committedSnapshot) as unknown as Loose;

    expect(snapshot['$doNotEditByHand']).toBeUndefined();
    expect(snapshot['$generator']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// The snapshot registry — D-24
// ---------------------------------------------------------------------------

describe('loadRoster / resolveSnapshot', () => {
  beforeEach(() => {
    installFetch();
  });

  it('resolves the index default when called with no argument', async () => {
    const bundle = await mod.loadRoster();

    expect(bundle.snapshot.regulation).toBe('M-B');
    expect(bundle.spriteMeta.byRosterId['abomasnow']?.file).toBe('460.png');
  });

  it('holds both regulations at once — resolving one does not evict the other', async () => {
    await mod.loadRoster();
    await mod.loadRoster('ma');

    expect(mod.resolveSnapshot('mb')?.snapshot.regulation).toBe('M-B');
    expect(mod.resolveSnapshot('ma')?.snapshot.regulation).toBe('M-A');
  });

  it('returns null before the regulation has been resolved, and the bundle after', async () => {
    expect(mod.resolveSnapshot('mb')).toBeNull();

    await mod.loadRoster('mb');

    expect(mod.resolveSnapshot('mb')?.snapshot.regulation).toBe('M-B');
  });

  it('never falls back to the default for a regulation this build has not resolved', async () => {
    await mod.loadRoster();

    // The whole of D-24 in one assertion: a filed M-C night opened on a build that ships
    // only M-A and M-B is told so, rather than rendered against a roster that could not
    // have contained its picks.
    expect(mod.resolveSnapshot('mc')).toBeNull();
  });

  it('serves a second call for the same regulation from the registry', async () => {
    await mod.loadRoster('mb');
    const afterFirst = calls.length;
    expect(afterFirst).toBeGreaterThan(0);

    await mod.loadRoster('mb');

    expect(calls.length).toBe(afterFirst);
  });

  it('answers to the regulation label a document actually stores', async () => {
    await mod.loadRoster();

    // `ConfigScreen.tsx:1233` stamps `config.rosterVersion` from `snapshot.regulation`,
    // which is `M-B` — the manifest's own id for the same regulation is `mb`. Both names
    // reach the same bundle, because `resolveSnapshot`'s caller holds the former.
    expect(mod.resolveSnapshot('M-B')?.snapshot.regulation).toBe('M-B');
    expect(mod.resolveSnapshot('mb')).toBe(mod.resolveSnapshot('M-B'));
  });

  it('fails through RosterLoadError for an unknown regulation id', async () => {
    await expect(mod.loadRoster('mc')).rejects.toBeInstanceOf(mod.RosterLoadError);
  });

  it('does not poison the registry with a partial entry when a load fails', async () => {
    installFetch(new Map<string, unknown>([['roster.index.json', committedIndex]]));

    await expect(mod.loadRoster('mb')).rejects.toBeInstanceOf(mod.RosterLoadError);

    expect(mod.resolveSnapshot('mb')).toBeNull();
    expect(mod.resolveSnapshot('M-B')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// refreshRoster — REFR-01
// ---------------------------------------------------------------------------

/** What the origin serves once a newer regulation has been deployed. */
function nextSnapshot(): Loose {
  return {
    ...(committedSnapshot as unknown as Loose),
    regulation: 'M-C',
    validFrom: '2026-09-02',
    validUntil: '2026-11-18',
    checksum: 'sha256-0000000000000000000000000000000000000000000000000000000000000000',
  };
}

function nextIndex(): Loose {
  return {
    default: 'mc',
    regulations: [
      ...(committedIndex as unknown as { regulations: Loose[] }).regulations,
      {
        id: 'mc',
        label: 'M-C',
        json: 'roster.mc.json',
        validFrom: '2026-09-02',
        validUntil: '2026-11-18',
        checksum: 'sha256-0000000000000000000000000000000000000000000000000000000000000000',
        counts: { draftable: 235, megaCapableSpecies: 74 },
      },
    ],
  };
}

/** The origin after a rotation, with an overridable snapshot body. */
function rotatedRoutes(snapshot: unknown = nextSnapshot()): Map<string, unknown> {
  const routes = defaultRoutes();
  routes.set('roster.index.json', nextIndex());
  routes.set('roster.mc.json', snapshot);
  return routes;
}

describe('refreshRoster', () => {
  beforeEach(() => {
    installFetch();
  });

  it('marks the request so the service worker steps aside, and states its init', async () => {
    await mod.loadRoster();
    const before = calls.length;

    await mod.refreshRoster();

    const request = calls[before];
    expect(request?.url).toContain('roster.index.json?refresh=1');
    // BOTH are required and neither is sufficient — the marker gets past the service
    // worker, `reload` gets past the HTTP cache Pages sets to max-age=600.
    expect(request?.init?.cache).toBe('reload');
    // Stated rather than inherited from the same-origin default.
    expect(request?.init?.credentials).toBe('omit');
  });

  it('reports alreadyCurrent on an unchanged checksum, in exactly one request', async () => {
    await mod.loadRoster();
    const before = calls.length;

    expect(await mod.refreshRoster()).toEqual({ kind: 'alreadyCurrent', label: 'M-B' });

    // The common case, and the reason a refresh is usually one 1.8 KB request: the
    // snapshot itself is never fetched when the manifest says nothing has changed.
    expect(calls.length - before).toBe(1);
  });

  it('adopts a newer regulation and reports it', async () => {
    await mod.loadRoster();
    installFetch(rotatedRoutes());

    expect(await mod.refreshRoster()).toEqual({
      kind: 'updated',
      label: 'M-C',
      validUntil: '2026-11-18',
    });

    expect(mod.resolveSnapshot('mc')?.snapshot.regulation).toBe('M-C');
    expect(mod.resolveSnapshot('M-C')?.snapshot.checksum).toBe(
      'sha256-0000000000000000000000000000000000000000000000000000000000000000',
    );
    // The superseded regulation is still resolvable — a filed M-B night opened after
    // this refresh is still an M-B night. That is the whole of D-24.
    expect(mod.resolveSnapshot('mb')?.snapshot.regulation).toBe('M-B');
  });

  it('serves the new default to a later no-argument load, without the network', async () => {
    await mod.loadRoster();
    installFetch(rotatedRoutes());
    await mod.refreshRoster();
    const before = calls.length;

    expect((await mod.loadRoster()).snapshot.regulation).toBe('M-C');
    expect(calls.length).toBe(before);
  });

  it('fails on a rejected fetch and leaves the registry exactly as it was', async () => {
    await mod.loadRoster();
    installFetch(new Map<string, unknown>([['roster.index.json', REJECTS]]));

    expect(await mod.refreshRoster()).toEqual({ kind: 'failed' });

    expect(mod.resolveSnapshot('mb')?.snapshot.regulation).toBe('M-B');
    expect((await mod.loadRoster()).snapshot.regulation).toBe('M-B');
  });

  it('fails on a non-ok response', async () => {
    await mod.loadRoster();
    installFetch(new Map<string, unknown>([['roster.index.json', NOT_FOUND]]));

    expect(await mod.refreshRoster()).toEqual({ kind: 'failed' });
    expect(mod.resolveSnapshot('mb')?.snapshot.regulation).toBe('M-B');
  });

  it('fails when the fetched snapshot is refused, adopting nothing', async () => {
    await mod.loadRoster();
    // Structurally wrong in the cheapest way that catches truncation: the declared
    // draftable count no longer matches the rows that arrived.
    installFetch(rotatedRoutes({ ...nextSnapshot(), counts: makeCounts(1) }));

    expect(await mod.refreshRoster()).toEqual({ kind: 'failed' });

    expect(mod.resolveSnapshot('mc')).toBeNull();
    expect(mod.resolveSnapshot('M-C')).toBeNull();
    expect(mod.resolveSnapshot('mb')?.snapshot.regulation).toBe('M-B');
  });

  it('compares by checksum, never by size — a byte-identical roster is not a change', async () => {
    await mod.loadRoster();
    // The committed file is 147,021 bytes in a Windows checkout and 140,170 on the
    // origin, with an IDENTICAL checksum: `core.autocrlf` is true and there is no
    // `.gitattributes`. Any length comparison reports a change on every developer
    // machine forever and never on CI. This is the same snapshot with different bytes.
    const reformatted = JSON.parse(JSON.stringify(committedSnapshot)) as Loose;
    const routes = defaultRoutes();
    routes.set('roster.mb.json', reformatted);

    installFetch(routes);

    expect(await mod.refreshRoster()).toEqual({ kind: 'alreadyCurrent', label: 'M-B' });
  });

  it('contacts no origin but this one — every URL it builds starts at the base', async () => {
    await mod.loadRoster();
    installFetch(rotatedRoutes());
    await mod.refreshRoster();

    expect(calls.length).toBeGreaterThan(3);
    for (const call of calls) {
      // T-01-25, asserted for the first time. RESEARCH Correction 1 found this
      // invariant was stated in the doc block and checked by nothing.
      expect(call.url.startsWith(import.meta.env.BASE_URL)).toBe(true);
      expect(call.url).not.toContain('://');
      expect(call.url).not.toContain('raw.githubusercontent.com');
    }
  });
});

// ---------------------------------------------------------------------------
// readRosterFile — REFR-02
// ---------------------------------------------------------------------------

function rosterFile(body: unknown): File {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return new File([text], 'roster.json', { type: 'application/json' });
}

describe('readRosterFile', () => {
  beforeEach(() => {
    installFetch();
  });

  it('accepts a roster file and issues no request at all', async () => {
    await mod.loadRoster();
    const before = calls.length;

    const bundle = await mod.readRosterFile(rosterFile(nextSnapshot()));

    expect(bundle?.snapshot.regulation).toBe('M-C');
    // REFR-02's entire point: this is the path that works on a laptop with no network,
    // which is why the refresh failure copy names it.
    expect(calls.length).toBe(before);
  });

  it('carries the sprite map the app already holds', async () => {
    await mod.loadRoster();

    const bundle = await mod.readRosterFile(rosterFile(nextSnapshot()));

    expect(bundle?.spriteMeta.byRosterId['abomasnow']?.file).toBe('460.png');
  });

  it('adopts the file, so a document naming that regulation resolves', async () => {
    await mod.loadRoster();

    await mod.readRosterFile(rosterFile(nextSnapshot()));

    // The recovery D-24 promises: a night filed under a regulation this build never
    // shipped becomes readable once the host hands the tool its roster.
    expect(mod.resolveSnapshot('M-C')?.snapshot.regulation).toBe('M-C');
  });

  it('does not make the imported roster the default', async () => {
    await mod.loadRoster();
    await mod.readRosterFile(rosterFile(nextSnapshot()));
    const before = calls.length;

    // Importing a roster to READ a filed night must not silently re-point new
    // tournaments at it. 05-07 owns any deliberate switch.
    expect((await mod.loadRoster()).snapshot.regulation).toBe('M-B');
    expect(calls.length).toBe(before);
  });

  it('refuses a file the same validator refuses on the network', async () => {
    await mod.loadRoster();

    expect(
      await mod.readRosterFile(rosterFile({ ...nextSnapshot(), counts: makeCounts(1) })),
    ).toBeNull();
    expect(mod.resolveSnapshot('M-C')).toBeNull();
  });

  it('refuses a file that is not JSON', async () => {
    await mod.loadRoster();

    expect(await mod.readRosterFile(rosterFile('not json at all'))).toBeNull();
  });

  it('refuses an oversized file WITHOUT reading it', async () => {
    await mod.loadRoster();
    let read = false;
    const huge = {
      size: 6 * 1024 * 1024,
      text: async (): Promise<string> => {
        read = true;
        return '{}';
      },
    } as unknown as File;

    expect(await mod.readRosterFile(huge)).toBeNull();
    // `File.size` is metadata available before a single byte is read, so a 2 GB file is
    // never brought into memory at all (`file-io.ts:130-136`).
    expect(read).toBe(false);
  });

  it('refuses when no sprite map has been resolved yet', async () => {
    // Nothing loaded. The sprite map ships with the app and is precached, so this
    // state means the page-load path itself failed — which importing a roster file
    // cannot repair.
    expect(await mod.readRosterFile(rosterFile(nextSnapshot()))).toBeNull();
  });
});
