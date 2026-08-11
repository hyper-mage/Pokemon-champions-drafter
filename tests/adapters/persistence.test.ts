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
import { SCHEMA_VERSION, type TournamentConfig, type TournamentDoc } from '../../src/core/model';

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
      stamp(poolBuilt(['venusaur', 'charizard'], 'mb', 'abc123'), 0),
      stamp(draftStarted(['p1', 'p2']), 1),
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
