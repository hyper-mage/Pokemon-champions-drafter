/**
 * The library — PERS-08, D-14 / D-15 / D-16.
 *
 * Mocks, like `tests/adapters/persistence.test.ts` and `tests/adapters/view-prefs.test.ts`,
 * and for the reason those files state: a working localStorage is the case that needs no
 * test. What needs defending here is the set of failures a developer machine never
 * produces — a hand-edited entry, a `setItem` that throws at exactly the wrong moment,
 * and a library sitting on the cap — because each of them decides whether a host loses a
 * night or an evening's worth of them.
 *
 * The eviction and cap cases seed `filedAt` explicitly rather than calling
 * `fileTournament` twelve times. Twelve calls inside one millisecond produce twelve
 * identical timestamps, which would make "the oldest" ambiguous and the test a coin toss.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fileTournament,
  listLibrary,
  oldestEntry,
  openLibraryEntry,
  LIBRARY_CAP,
  type LibraryEntry,
} from '../../src/adapters/library';
import { savingBlocked } from '../../src/adapters/persistence';
import { draftStarted, pickMade, poolBuilt, type Action, type Intent } from '../../src/core/actions';
import { SCHEMA_VERSION, type TournamentConfig, type TournamentDoc } from '../../src/core/model';
import {
  ABANDON_CONFIRM,
  EVICTION_CONFIRM,
  FILING_CONFIRM,
  REOPEN_CONFIRM,
  tournaments,
} from '../../src/ui/confirm-copy';

const LIBRARY_KEY = 'champions-drafter:library';
const TOURNAMENT_KEY = 'champions-drafter:tournament';

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
  bansPerPlayer: 0,
  duplicateBanPolicy: 'bothApply',
  matchMetric: 'pokemonLeft',
  roundRobinFormat: 'bo1',
  bracketFormat: 'bo1',
};

function stamp(intent: Intent, seq: number): Action {
  return { ...intent, seq, at: 1_700_000_000_000 + seq, actorId: 'host' };
}

function makeDoc(id = 'tournament-fixture'): TournamentDoc {
  return {
    schemaVersion: SCHEMA_VERSION,
    id,
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

/** Seed the key directly, so `filedAt` is explicit and the ordering is not a race. */
function seed(entries: { filedAt: number; doc: unknown }[]): void {
  storage.backing.set(LIBRARY_KEY, JSON.stringify({ version: 1, entries }));
}

function seedValid(count: number, startAt = 1_000): void {
  seed(
    Array.from({ length: count }, (_, i) => ({
      filedAt: startAt + i,
      doc: makeDoc(`tournament-${i}`),
    })),
  );
}

let storage: StorageStub;

beforeEach(() => {
  storage = makeStorage();
  install(storage);
});

// ---------------------------------------------------------------------------
// Reading — everything fails soft
// ---------------------------------------------------------------------------

describe('listLibrary', () => {
  it('returns an empty list when the browser has no library key', () => {
    expect(listLibrary()).toEqual([]);
  });

  it('does not throw when localStorage itself is unavailable', () => {
    install(
      makeStorage({
        getItem: () => {
          throw named('SecurityError');
        },
      }),
    );

    expect(() => listLibrary()).not.toThrow();
    expect(listLibrary()).toEqual([]);
  });

  it('returns an empty list for an unparseable value rather than throwing', () => {
    storage.backing.set(LIBRARY_KEY, '{not json');
    expect(listLibrary()).toEqual([]);
  });

  it('returns an empty list for a wrapper version it has never heard of', () => {
    storage.backing.set(
      LIBRARY_KEY,
      JSON.stringify({ version: 99, entries: [{ filedAt: 1, doc: makeDoc() }] }),
    );
    expect(listLibrary()).toEqual([]);
  });

  it('returns entries newest first by filedAt', () => {
    seed([
      { filedAt: 300, doc: makeDoc('c') },
      { filedAt: 100, doc: makeDoc('a') },
      { filedAt: 200, doc: makeDoc('b') },
    ]);

    expect(listLibrary().map((e) => e.doc.id)).toEqual(['c', 'b', 'a']);
  });

  it('drops one unreadable entry and returns the other eleven', () => {
    const good = Array.from({ length: 11 }, (_, i) => ({
      filedAt: 1_000 + i,
      doc: makeDoc(`tournament-${i}`) as unknown,
    }));
    seed([...good, { filedAt: 9_999, doc: { schemaVersion: 5, nonsense: true } }]);

    const listed = listLibrary();
    expect(listed).toHaveLength(11);
    expect(listed.every((e) => e.doc.id.startsWith('tournament-'))).toBe(true);
  });

  it('drops an entry carrying __proto__ as an own property', () => {
    seed([
      { filedAt: 100, doc: JSON.parse('{"__proto__":{"polluted":true}}') },
      { filedAt: 200, doc: makeDoc('clean') },
    ]);

    const listed = listLibrary();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.doc.id).toBe('clean');
  });

  it('drops an entry whose filedAt is not a number', () => {
    seed([
      { filedAt: 'yesterday' as unknown as number, doc: makeDoc('bad') },
      { filedAt: 200, doc: makeDoc('good') },
    ]);

    expect(listLibrary().map((e) => e.doc.id)).toEqual(['good']);
  });

  it('migrates a v4 document to the current schema on read', () => {
    const v4 = makeDoc('old-night') as unknown as Record<string, unknown>;
    const v4Config = { ...CONFIG } as Record<string, unknown>;
    delete v4Config['matchMetric'];
    delete v4Config['roundRobinFormat'];
    delete v4Config['bracketFormat'];

    seed([{ filedAt: 100, doc: { ...v4, schemaVersion: 4, config: v4Config } }]);

    const listed = listLibrary();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.doc.schemaVersion).toBe(SCHEMA_VERSION);
    expect(listed[0]?.doc.config.matchMetric).toBe('pokemonLeft');
  });

  it('adopts the REBUILT document, so an unknown own property never reaches the store', () => {
    // WR-06: `isValidTournament` is a predicate — it builds a sanitised document to decide
    // its answer and discards it. Reading the entry with the predicate and then migrating
    // the raw parse output handed the store the parsed object itself, because `migrate`
    // returns a current-schema document by identity. The extra key then travelled into
    // `docSignal`, into the autosave and into the next JSON export.
    const doc = makeDoc('rebuilt') as unknown as Record<string, unknown>;
    seed([
      {
        filedAt: 100,
        doc: {
          ...doc,
          smuggled: 'nope',
          config: { ...(doc['config'] as Record<string, unknown>), smuggledConfig: 'nope' },
        },
      },
    ]);

    const listed = listLibrary();
    expect(listed).toHaveLength(1);

    const restored = listed[0]?.doc as unknown as Record<string, unknown>;
    expect(Object.keys(restored).sort()).toEqual([
      'config',
      'createdAt',
      'id',
      'log',
      'rng',
      'schemaVersion',
    ]);
    expect('smuggledConfig' in (restored['config'] as Record<string, unknown>)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The cap — D-16
// ---------------------------------------------------------------------------

describe('oldestEntry', () => {
  it('is null on an empty library', () => {
    expect(oldestEntry()).toBeNull();
  });

  it('is null one below the cap', () => {
    seedValid(LIBRARY_CAP - 1);
    expect(oldestEntry()).toBeNull();
  });

  it('names the lowest-filedAt entry at the cap', () => {
    seedValid(LIBRARY_CAP);
    expect(oldestEntry()?.doc.id).toBe('tournament-0');
    expect(oldestEntry()?.filedAt).toBe(1_000);
  });

  it('steps over the exempt entry and names the next one instead', () => {
    seedValid(LIBRARY_CAP);

    // `tournament-0` is the entry a filing would normally drop. Exempting it is what a
    // gesture on its way to OPENING it passes, and the dialog must then name the entry
    // that will actually go rather than the one the host asked for.
    expect(oldestEntry('tournament-0')?.doc.id).toBe('tournament-1');
    expect(oldestEntry('tournament-0')?.filedAt).toBe(1_001);
  });

  it('still names an entry at the cap when one is exempt', () => {
    seedValid(LIBRARY_CAP);

    // Answering `null` here would read as "below the cap" and skip the eviction confirm
    // entirely, which is D-16's dialog going missing rather than the defect being fixed.
    expect(oldestEntry('tournament-0')).not.toBeNull();
  });

  it('ignores an exemption naming nothing in the library', () => {
    seedValid(LIBRARY_CAP);
    expect(oldestEntry('never-filed')?.doc.id).toBe('tournament-0');
  });

  it('is still null below the cap with an exemption', () => {
    seedValid(LIBRARY_CAP - 1);
    expect(oldestEntry('tournament-0')).toBeNull();
  });
});

describe('fileTournament', () => {
  it('files below the cap and grows the library by one', () => {
    seedValid(3);

    expect(fileTournament(makeDoc('new-night'))).toEqual({ kind: 'filed' });
    expect(listLibrary()).toHaveLength(4);
    expect(listLibrary()[0]?.doc.id).toBe('new-night');
  });

  it('files into an empty library', () => {
    expect(fileTournament(makeDoc('first'))).toEqual({ kind: 'filed' });
    expect(listLibrary().map((e) => e.doc.id)).toEqual(['first']);
  });

  it('drops exactly the lowest-filedAt entry at the cap and names it', () => {
    seedValid(LIBRARY_CAP);

    const outcome = fileTournament(makeDoc('new-night'));

    expect(outcome.kind).toBe('evicted');
    const dropped = (outcome as { kind: 'evicted'; dropped: LibraryEntry }).dropped;
    expect(dropped.doc.id).toBe('tournament-0');
    expect(dropped.filedAt).toBe(1_000);

    const listed = listLibrary();
    expect(listed).toHaveLength(LIBRARY_CAP);
    expect(listed.map((e) => e.doc.id)).not.toContain('tournament-0');
    expect(listed[0]?.doc.id).toBe('new-night');
  });

  it('never drops the exempt entry, and drops the next-oldest instead', () => {
    // CR-01. `tournament-0` is what an unexempted filing at the cap would drop, and it is
    // also the tournament the gesture exists to open. Dropping it destroys the night and
    // there is no undo for a library write.
    seedValid(LIBRARY_CAP);

    const outcome = fileTournament(makeDoc('new-night'), 'tournament-0');

    expect(outcome.kind).toBe('evicted');
    const dropped = (outcome as { kind: 'evicted'; dropped: LibraryEntry }).dropped;
    expect(dropped.doc.id).toBe('tournament-1');

    const listed = listLibrary();
    expect(listed).toHaveLength(LIBRARY_CAP);
    expect(listed.map((e) => e.doc.id)).toContain('tournament-0');
    expect(listed.map((e) => e.doc.id)).not.toContain('tournament-1');
    expect(listed[0]?.doc.id).toBe('new-night');
  });

  it('names the entry it drops, exemption or not — the dialog reads the same rule', () => {
    // The defect was two expressions of "the oldest" disagreeing, so the property under
    // test is the AGREEMENT: whatever `oldestEntry` names is what the write removes.
    seedValid(LIBRARY_CAP);

    const named = oldestEntry('tournament-0');
    const outcome = fileTournament(makeDoc('new-night'), 'tournament-0');
    const dropped = (outcome as { kind: 'evicted'; dropped: LibraryEntry }).dropped;

    expect(dropped.doc.id).toBe(named?.doc.id);
    expect(listLibrary().map((e) => e.doc.id)).not.toContain(named?.doc.id);
  });

  it('keeps the exempt entry while repairing a hand-edited overflow', () => {
    // The overflow repair was a `slice`, which would have taken the exempt entry with it.
    seedValid(LIBRARY_CAP + 4);

    fileTournament(makeDoc('new-night'), 'tournament-0');

    const listed = listLibrary();
    expect(listed).toHaveLength(LIBRARY_CAP);
    expect(listed.map((e) => e.doc.id)).toContain('tournament-0');
  });

  it('checks the cap BEFORE the write — the payload handed to setItem is already at the cap', () => {
    const setItem = vi.fn((key: string, value: string) => {
      storage.backing.set(key, value);
    });
    const stub = makeStorage({ setItem });
    stub.backing.set(
      LIBRARY_KEY,
      JSON.stringify({
        version: 1,
        entries: Array.from({ length: LIBRARY_CAP }, (_, i) => ({
          filedAt: 1_000 + i,
          doc: makeDoc(`tournament-${i}`),
        })),
      }),
    );
    install(stub);

    fileTournament(makeDoc('new-night'));

    const written = setItem.mock.calls.find((call) => call[0] === LIBRARY_KEY);
    expect(written).toBeDefined();
    const payload = JSON.parse(written![1]) as { entries: unknown[] };
    expect(payload.entries).toHaveLength(LIBRARY_CAP);
  });

  it('never writes the live tournament slot — 05-12 owns that ordering', () => {
    seedValid(1);
    fileTournament(makeDoc('new-night'));
    expect(storage.backing.has(TOURNAMENT_KEY)).toBe(false);
  });

  it('returns quotaFailed when the write throws, and leaves the library untouched', () => {
    seedValid(3);
    const before = listLibrary();
    const backing = storage.backing;

    install(
      makeStorage({
        getItem: (key: string) => backing.get(key) ?? null,
        setItem: () => {
          throw named('QuotaExceededError');
        },
      }),
    );

    expect(fileTournament(makeDoc('new-night'))).toEqual({ kind: 'quotaFailed' });
    expect(listLibrary().map((e) => e.doc.id)).toEqual(before.map((e) => e.doc.id));
  });

  it('does NOT raise savingBlocked on a quota failure', () => {
    install(
      makeStorage({
        setItem: () => {
          throw named('QuotaExceededError');
        },
      }),
    );

    expect(fileTournament(makeDoc('new-night'))).toEqual({ kind: 'quotaFailed' });
    expect(savingBlocked.value).toBe(false);
  });

  it('writes nothing that is not JSON — no Set, Map or Date reaches storage', () => {
    fileTournament(makeDoc('serializable'));

    const raw = storage.backing.get(LIBRARY_KEY);
    expect(raw).toBeDefined();
    expect(() => JSON.parse(raw!)).not.toThrow();
    expect(raw).not.toContain('[object Set]');
    expect(raw).not.toContain('[object Map]');
  });
});

describe('openLibraryEntry', () => {
  it('returns the document for a filed id', () => {
    seedValid(3);
    expect(openLibraryEntry('tournament-1')?.id).toBe('tournament-1');
  });

  it('returns null for an id that is not filed', () => {
    seedValid(3);
    expect(openLibraryEntry('never-filed')).toBeNull();
  });

  it('returns null rather than a partially rebuilt document for a dropped entry', () => {
    seed([{ filedAt: 100, doc: { schemaVersion: 5, id: 'broken' } }]);
    expect(openLibraryEntry('broken')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The copy — 05-UI-SPEC §Copywriting, byte for byte
// ---------------------------------------------------------------------------

describe('confirm copy', () => {
  it('pluralises tournaments', () => {
    expect(tournaments(1)).toBe('1 tournament');
    expect(tournaments(12)).toBe('12 tournaments');
  });

  it('states the filing body exactly', () => {
    expect(FILING_CONFIRM.heading).toBe('Start a new tournament?');
    expect(FILING_CONFIRM.tone).toBe('default');
    expect(FILING_CONFIRM.confirmLabel).toBe('Start a new tournament');
    expect(FILING_CONFIRM.safeLabel).toBe('Keep this one open');
    expect(FILING_CONFIRM.body('Champions Test')).toBe(
      'Champions Test is filed with your tournaments and stays open from the landing screen. Download the JSON too if you want a copy that browser storage cannot lose.',
    );
  });

  it('states the eviction body exactly, and interpolates LIBRARY_CAP', () => {
    expect(EVICTION_CONFIRM.heading).toBe('Your tournaments are full');
    expect(EVICTION_CONFIRM.tone).toBe('default');
    expect(EVICTION_CONFIRM.confirmLabel).toBe('File it and drop the oldest');
    expect(EVICTION_CONFIRM.safeLabel).toBe('Keep the oldest');
    expect(EVICTION_CONFIRM.downloadLabel('Friday night')).toBe('Download Friday night');
    expect(EVICTION_CONFIRM.body('Saturday night', 'Friday night', '3 March')).toBe(
      `This app keeps ${LIBRARY_CAP} tournaments. Filing Saturday night drops the oldest — Friday night from 3 March. Download it first if you want to keep it.`,
    );
  });

  it('carries the cap by interpolation and not as a literal', () => {
    expect(EVICTION_CONFIRM.body('a', 'b', 'c')).toContain(`keeps ${LIBRARY_CAP} tournaments`);
  });

  it('states the reopen body exactly', () => {
    expect(REOPEN_CONFIRM.heading).toBe('Reopen this tournament?');
    expect(REOPEN_CONFIRM.tone).toBe('default');
    expect(REOPEN_CONFIRM.confirmLabel).toBe('Reopen it');
    expect(REOPEN_CONFIRM.safeLabel).toBe('Leave it finished');
    expect(REOPEN_CONFIRM.body).toBe(
      'This makes every result editable again. Correcting a round-robin result voids the cut and the bracket; correcting a bracket result voids the matches after it.',
    );
  });

  it('changes only ABANDON_CONFIRM body — heading, tone and labels stand', () => {
    expect(ABANDON_CONFIRM.heading).toBe('Abandon this draft?');
    expect(ABANDON_CONFIRM.tone).toBe('danger');
    expect(ABANDON_CONFIRM.confirmLabel).toBe('Abandon draft');
    expect(ABANDON_CONFIRM.safeLabel).toBe('Keep drafting');
    expect(ABANDON_CONFIRM.body(3, 4)).toBe(
      'This discards 3 picks across 4 players and does not file it with your tournaments. Nothing recovers it unless you have already downloaded the tournament JSON.',
    );
  });

  it('adds no new danger-toned set — the reservation stays at three', () => {
    expect(FILING_CONFIRM.tone).not.toBe('danger');
    expect(EVICTION_CONFIRM.tone).not.toBe('danger');
    expect(REOPEN_CONFIRM.tone).not.toBe('danger');
  });
});
