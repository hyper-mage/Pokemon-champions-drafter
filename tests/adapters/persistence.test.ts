/**
 * Persistence — PERS-01 autosave, PERS-02 canary, and the T-01-05 corruption guard.
 *
 * This file mocks, and that is the point: `src/adapters/persistence.ts` is the impure
 * edge, and the failures worth testing are the ones a developer machine never produces.
 * A working localStorage is the case that needs no test. A `setItem` that throws, a
 * write that reports success and reads back as something else, and a key holding valid
 * JSON of entirely the wrong shape are the cases that decide whether a host loses forty
 * minutes of drafting, and none of them can be reached without a stub.
 *
 * Contrast with `tests/core/` — those files have no mocks at all, by construction. The
 * boundary between the two is exactly the boundary `npm run check:pure` enforces.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { load, probeStorage, save, savingBlocked } from '../../src/adapters/persistence';
import { draftStarted, pickMade, poolBuilt, type Action, type Intent } from '../../src/core/actions';
import { parseTournamentFile } from '../../src/core/import-guard';
import { SCHEMA_VERSION, type TournamentConfig, type TournamentDoc } from '../../src/core/model';
import { adoptTournament, getDoc, getState } from '../../src/store';

const STORAGE_KEY = 'champions-drafter:tournament';

// ---------------------------------------------------------------------------
// A localStorage that can be made to misbehave on demand
// ---------------------------------------------------------------------------

interface StorageStub extends Storage {
  readonly backing: Map<string, string>;
}

function makeStorage(overrides: Partial<Storage> = {}): StorageStub {
  const backing = new Map<string, string>();

  return {
    backing,
    get length() {
      return backing.size;
    },
    clear: () => backing.clear(),
    getItem: (key: string) => backing.get(key) ?? null,
    key: (index: number) => [...backing.keys()][index] ?? null,
    removeItem: (key: string) => {
      backing.delete(key);
    },
    setItem: (key: string, value: string) => {
      backing.set(key, value);
    },
    ...overrides,
  } as StorageStub;
}

function install(storage: Storage): void {
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  });
}

function named(name: string): Error {
  const error = new Error(name);
  error.name = name;
  return error;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CONFIG: TournamentConfig = {
  formatLabel: 'Champions Test',
  players: [
    { id: 'p1', name: 'Player 1' },
    { id: 'p2', name: 'Player 2' },
  ],
  rounds: 6,
  rosterVersion: 'mb',
  rosterChecksum: 'abc123',
  poolSize: 12,
  bans: [],
  banMode: 'hostBanlist',
  megasRequiredPerTeam: 0,
  dualMegaChoices: [],
  depth: 'draftOnly',
  rules: [{ kind: 'mega', count: 0 }],
  megaFormeBans: [],
  swapBudget: 0,
  swapRounds: 0,
};

function stamp(intent: Intent, seq: number): Action {
  return { ...intent, seq, at: 1_700_000_000_000 + seq, actorId: 'host' };
}

function makeDoc(): TournamentDoc {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'tournament-fixture',
    createdAt: 1_700_000_000_000,
    config: CONFIG,
    rng: { seed: 0x5f3a91c2, cursor: 0 },
    log: [
      stamp(poolBuilt(['venusaur', 'charizard'], 'mb', 'abc123', 7, 0), 0),
      stamp(draftStarted(['p1', 'p2'], 9), 1),
      stamp(pickMade({ playerId: 'p1', monId: 'venusaur', round: 1, pickIndex: 0 }), 2),
    ],
  };
}

let storage: StorageStub;

beforeEach(() => {
  storage = makeStorage();
  install(storage);
});

// ---------------------------------------------------------------------------
// The canary — PERS-02 / D-13
// ---------------------------------------------------------------------------

describe('probeStorage', () => {
  it('reports ok when a write survives a read back', () => {
    expect(probeStorage()).toEqual({ ok: true });
  });

  it('leaves nothing behind', () => {
    probeStorage();
    expect(storage.backing.size).toBe(0);
  });

  it('reports failure when the write throws, rather than propagating it', () => {
    install(
      makeStorage({
        setItem: () => {
          throw named('SecurityError');
        },
      }),
    );

    expect(probeStorage()).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('distinguishes an exhausted quota, which is what private mode has historically been', () => {
    install(
      makeStorage({
        setItem: () => {
          throw named('QuotaExceededError');
        },
      }),
    );

    expect(probeStorage()).toEqual({ ok: false, reason: 'quotaExceeded' });
  });

  it('fails when the write is silently discarded rather than refused', () => {
    // The case feature detection cannot see and a bare setItem cannot see either: the
    // API is present, the call returns, and nothing was stored.
    install(
      makeStorage({
        setItem: () => undefined,
      }),
    );

    expect(probeStorage()).toEqual({ ok: false, reason: 'readbackMismatch' });
  });

  it('fails when reading the storage object itself throws', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw named('SecurityError');
      },
    });

    expect(probeStorage()).toEqual({ ok: false, reason: 'unavailable' });
  });
});

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

describe('save', () => {
  it('stores a record carrying the schema version, generation, timestamp and document', () => {
    expect(save(makeDoc())).toBe(true);

    const raw = storage.backing.get(STORAGE_KEY);
    expect(raw).toBeDefined();

    const record = JSON.parse(raw as string) as Record<string, unknown>;
    expect(record['schemaVersion']).toBe(SCHEMA_VERSION);
    expect(typeof record['generation']).toBe('number');
    expect(typeof record['savedAt']).toBe('number');
    expect(record['doc']).toEqual(makeDoc());
  });

  it('advances the generation on every successful write', () => {
    save(makeDoc());
    const first = (JSON.parse(storage.backing.get(STORAGE_KEY) as string) as { generation: number })
      .generation;

    save(makeDoc());
    const second = (JSON.parse(storage.backing.get(STORAGE_KEY) as string) as { generation: number })
      .generation;

    expect(second).toBe(first + 1);
  });

  it('reports failure and raises savingBlocked rather than retrying silently', () => {
    install(
      makeStorage({
        setItem: () => {
          throw named('QuotaExceededError');
        },
      }),
    );

    expect(save(makeDoc())).toBe(false);
    expect(savingBlocked.value).toBe(true);
  });

  it('clears savingBlocked once a write succeeds again', () => {
    install(
      makeStorage({
        setItem: () => {
          throw named('QuotaExceededError');
        },
      }),
    );
    save(makeDoc());
    expect(savingBlocked.value).toBe(true);

    storage = makeStorage();
    install(storage);
    expect(save(makeDoc())).toBe(true);
    expect(savingBlocked.value).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Reading — T-01-05. Stored bytes are untrusted input.
// ---------------------------------------------------------------------------

describe('load', () => {
  it('returns the document a save round trips', () => {
    save(makeDoc());
    expect(load()).toEqual(makeDoc());
  });

  it('returns null when nothing has been saved', () => {
    expect(load()).toBeNull();
  });

  it('returns null when reading the storage object throws', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw named('SecurityError');
      },
    });

    expect(load()).toBeNull();
  });

  it('returns null for a truncated record rather than throwing', () => {
    // What a write that died with the tab leaves behind.
    storage.backing.set(STORAGE_KEY, '{"schemaVersion":1,"generation":3,"doc":{"log":[');
    expect(() => load()).not.toThrow();
    expect(load()).toBeNull();
  });

  it.each([
    ['a bare string', '"hello"'],
    ['a number', '42'],
    ['null', 'null'],
    ['an array', '[1,2,3]'],
    ['an unrelated object', '{"hello":"world"}'],
    ['a record with no doc', '{"schemaVersion":1,"generation":1,"savedAt":0}'],
    ['a doc with no log', '{"schemaVersion":1,"doc":{"schemaVersion":1,"config":{},"rng":{}}}'],
    [
      'a doc whose log is not an array',
      '{"schemaVersion":1,"doc":{"schemaVersion":1,"config":{"rounds":6,"players":[]},"rng":{},"log":"nope"}}',
    ],
    [
      'a doc whose config is not an object',
      '{"schemaVersion":1,"doc":{"schemaVersion":1,"config":"nope","rng":{},"log":[]}}',
    ],
    [
      'a doc whose config has no players',
      '{"schemaVersion":1,"doc":{"schemaVersion":1,"config":{"rounds":6},"rng":{},"log":[]}}',
    ],
    [
      'a log holding a null entry',
      '{"schemaVersion":1,"doc":{"schemaVersion":1,"config":{"rounds":6,"players":[]},"rng":{},"log":[null]}}',
    ],
    [
      'a log entry with no type',
      '{"schemaVersion":1,"doc":{"schemaVersion":1,"config":{"rounds":6,"players":[]},"rng":{},"log":[{"seq":0}]}}',
    ],
  ])('returns null for valid JSON of the wrong shape: %s', (_label, raw) => {
    storage.backing.set(STORAGE_KEY, raw);
    expect(() => load()).not.toThrow();
    expect(load()).toBeNull();
  });

  it('returns null for a record written by a newer schema', () => {
    storage.backing.set(
      STORAGE_KEY,
      JSON.stringify({ schemaVersion: 999, generation: 1, savedAt: 0, doc: makeDoc() }),
    );

    expect(load()).toBeNull();
  });

  it('returns null when the inner document claims a schema this build does not know', () => {
    const doc = { ...makeDoc(), schemaVersion: 999 };
    storage.backing.set(
      STORAGE_KEY,
      JSON.stringify({ schemaVersion: SCHEMA_VERSION, generation: 1, savedAt: 0, doc }),
    );

    expect(load()).toBeNull();
  });

  it('never half-loads: a rejected record leaves the stored bytes untouched', () => {
    // The record stays on disk so a later build with a migration can still read it.
    const raw = '{"schemaVersion":999,"doc":{}}';
    storage.backing.set(STORAGE_KEY, raw);

    load();

    expect(storage.backing.get(STORAGE_KEY)).toBe(raw);
  });
});

// ---------------------------------------------------------------------------
// Resuming a Phase 1 save — decision 4
// ---------------------------------------------------------------------------

/**
 * A version 1 document, exactly as the deployed Phase 1 build wrote one.
 *
 * Five config fields and a `pool/built` with neither config-time seed, because none of
 * those fields existed. Four pool ids against 2 players × 6 rounds, so a recovered
 * `poolSize` of 4 is unmistakably the log's number and not the config's arithmetic.
 */
function v1Doc(): unknown {
  return {
    schemaVersion: 1,
    id: 'phase-one-tournament',
    createdAt: 1_700_000_000_000,
    config: {
      formatLabel: 'Champions MB',
      players: [
        { id: 'p1', name: 'Player 1' },
        { id: 'p2', name: 'Player 2' },
      ],
      rounds: 6,
      rosterVersion: 'mb',
      rosterChecksum: 'abc123',
    },
    rng: { seed: 0x5f3a91c2, cursor: 0 },
    log: [
      {
        type: 'pool/built',
        ids: ['venusaur', 'charizard', 'blastoise', 'garchomp'],
        rosterVersion: 'mb',
        checksum: 'abc123',
        seq: 0,
        at: 1_700_000_000_001,
        actorId: 'host',
      },
      {
        type: 'draft/started',
        order: ['p1', 'p2'],
        seq: 1,
        at: 1_700_000_000_002,
        actorId: 'host',
      },
    ],
  };
}

/** The wrapper record Phase 1 wrote around it — note `schemaVersion: 1` on the WRAPPER. */
function v1Record(): string {
  return JSON.stringify({ schemaVersion: 1, generation: 3, savedAt: 0, doc: v1Doc() });
}

describe('a draft saved by Phase 1', () => {
  it('loads, rather than being dropped at the wrapper version check', () => {
    // `load()` compared the WRAPPER's schemaVersion against the current one, which sits a
    // step before `isValidTournament` ever runs. A v1 wrapper died there regardless of
    // what `migrate` had to say about the document inside it, and the visible symptom was
    // `Resume saved draft` silently never appearing.
    storage.backing.set(STORAGE_KEY, v1Record());

    expect(load()).not.toBeNull();
  });

  it('comes back at the current version, not at the version it was stored as', () => {
    // `isValidTournament` is a PREDICATE: it calls `migrate` and throws the result away.
    // Returning the narrowed object therefore hands back the un-migrated document, which
    // `adoptTournament` refuses one call later.
    storage.backing.set(STORAGE_KEY, v1Record());

    expect(load()?.schemaVersion).toBe(SCHEMA_VERSION);
    expect(load()?.schemaVersion).toBe(3);
  });

  it('lands with the pool size its log actually recorded', () => {
    storage.backing.set(STORAGE_KEY, v1Record());

    expect(load()?.config.poolSize).toBe(4);
  });

  it('still returns null for a wrapper version this build has never supported', () => {
    storage.backing.set(
      STORAGE_KEY,
      JSON.stringify({ schemaVersion: 99, generation: 1, savedAt: 0, doc: v1Doc() }),
    );

    expect(load()).toBeNull();
  });

  it('opens through all three schemaVersion comparison sites — decision 4', () => {
    // One fixture, three doors. Each of these compared a version independently before this
    // plan, and a fix to any two of them leaves a route by which a Phase 1 draft cannot be
    // reopened. The import path and the autosave path are different code reached by
    // different user actions, and `adoptTournament` is what both of them end at.
    const text = JSON.stringify(v1Doc());

    const imported = parseTournamentFile(text, text.length);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.doc.schemaVersion).toBe(3);

    storage.backing.set(STORAGE_KEY, v1Record());
    const restored = load();
    expect(restored?.schemaVersion).toBe(3);

    expect(adoptTournament(imported.doc)).toBe(true);
    expect(getDoc()?.schemaVersion).toBe(3);
  });

  it('adopts an un-migrated v1 document rather than refusing it', () => {
    // `adoptTournament` is reachable with a raw v1 document, so it migrates rather than
    // comparing — and the state it publishes is the fold of the MIGRATED document.
    expect(adoptTournament(v1Doc() as TournamentDoc)).toBe(true);
    expect(getDoc()?.schemaVersion).toBe(3);
    expect(getState()?.poolIds).toHaveLength(4);
  });

  it('refuses a document from a schema this build has never supported', () => {
    const future = { ...(v1Doc() as Record<string, unknown>), schemaVersion: 99 };
    expect(adoptTournament(future as unknown as TournamentDoc)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Resuming a Phase 2 save — the third schemaVersion compare site, one bump later
// ---------------------------------------------------------------------------

/**
 * A version 2 document, exactly as the deployed Phase 2 build wrote one.
 *
 * Eleven config fields and a `pool/built` carrying both config-time seeds, because by
 * version 2 those fields existed. `megasRequiredPerTeam: 2` is what the derived rule list
 * has to come back holding.
 */
function v2Doc(): unknown {
  return {
    schemaVersion: 2,
    id: 'phase-two-tournament',
    createdAt: 1_700_000_000_000,
    config: {
      formatLabel: 'Champions MB',
      players: [
        { id: 'p1', name: 'Player 1' },
        { id: 'p2', name: 'Player 2' },
      ],
      rounds: 6,
      rosterVersion: 'mb',
      rosterChecksum: 'abc123',
      poolSize: 4,
      bans: ['mewtwo'],
      banMode: 'hostBanlist',
      megasRequiredPerTeam: 2,
      dualMegaChoices: [],
      depth: 'draftOnly',
    },
    rng: { seed: 0x5f3a91c2, cursor: 0 },
    log: [
      {
        type: 'pool/built',
        ids: ['venusaur', 'charizard', 'blastoise', 'garchomp'],
        rosterVersion: 'mb',
        checksum: 'abc123',
        seed: 11,
        megaCapableCount: 2,
        seq: 0,
        at: 1_700_000_000_001,
        actorId: 'host',
      },
      {
        type: 'draft/started',
        order: ['p1', 'p2'],
        seed: 12,
        seq: 1,
        at: 1_700_000_000_002,
        actorId: 'host',
      },
    ],
  };
}

/** The wrapper record Phase 2 wrote — `schemaVersion: 2` on the WRAPPER. */
function v2Record(): string {
  return JSON.stringify({ schemaVersion: 2, generation: 3, savedAt: 0, doc: v2Doc() });
}

describe('a draft saved by Phase 2', () => {
  it('is still offered as a resumable draft after the schema 3 bump', () => {
    // The failure this pins is invisible to every import-only test: the WRAPPER version is
    // compared a step before `isValidTournament`, so a version list that did not move with
    // the bump drops the record here and `Resume saved draft` silently never appears.
    storage.backing.set(STORAGE_KEY, v2Record());

    expect(load()).not.toBeNull();
  });

  it('resumes at the current version, not at the version it was stored as', () => {
    storage.backing.set(STORAGE_KEY, v2Record());

    expect(load()?.schemaVersion).toBe(SCHEMA_VERSION);
    expect(load()?.schemaVersion).toBe(3);
  });

  it('comes back with a rule list derived from the Megas it required', () => {
    storage.backing.set(STORAGE_KEY, v2Record());

    expect(load()?.config.rules).toEqual([{ kind: 'mega', count: 2 }]);
    expect(load()?.config.megasRequiredPerTeam).toBe(2);
  });

  it('comes back with the swap fields at their lossless defaults', () => {
    storage.backing.set(STORAGE_KEY, v2Record());

    const restored = load();
    expect(restored?.config.megaFormeBans).toEqual([]);
    expect(restored?.config.swapBudget).toBe(0);
    expect(restored?.config.swapRounds).toBe(0);
  });

  it('folds to the pool its log recorded, with an empty schedule', () => {
    storage.backing.set(STORAGE_KEY, v2Record());
    const restored = load();
    expect(restored).not.toBeNull();
    if (restored === null) return;

    expect(adoptTournament(restored)).toBe(true);
    expect(getState()?.poolIds).toHaveLength(4);
    expect(getState()?.schedule).toEqual([]);
  });

  it('does not offer a wrapper at a version this build has never supported', () => {
    storage.backing.set(
      STORAGE_KEY,
      JSON.stringify({ schemaVersion: 4, generation: 1, savedAt: 0, doc: v2Doc() }),
    );

    expect(load()).toBeNull();
  });
});
