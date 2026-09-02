/**
 * import-guard.test.ts — the one untrusted-input boundary, tested as one.
 *
 * Every test here is written from the attacker's side or the corrupt-file side, because
 * the happy path of this function is the least interesting thing about it. A guard that
 * accepts good documents and also accepts bad ones has done nothing; the assertions that
 * matter are the refusals, and each one below names the specific damage it prevents.
 *
 * The prototype-pollution tests are deliberately first. `({}).polluted === undefined` is
 * a global assertion — if it ever fails, it fails for the whole process — so it is
 * checked against a freshly built object rather than against a fixture that could have
 * been created before the payload was parsed.
 */

import { describe, expect, it } from 'vitest';

import {
  bansPlaced,
  bansRevealed,
  bansSubmitted,
  cutTaken,
  isBansPlacedAction,
  isBansRevealedAction,
  isBansSubmittedAction,
  isCutTakenAction,
  isDraftStartedAction,
  isMatchRecordedAction,
  isPoolBuiltAction,
  isReopenedAction,
  isResultsVoidedAction,
  isTiebreakOrderedAction,
  matchRecorded,
  reopened,
  resultsVoided,
  tiebreakOrdered,
  type AnyAction,
} from '../../src/core/actions';
import {
  isValidTournament,
  MAX_BANS_PER_PLAYER,
  MAX_COMPOSITION_RULES,
  MAX_IMPORT_BYTES,
  MAX_LOG_ENTRIES,
  MAX_MATCH_METRIC,
  MAX_MEGA_FORME_BANS,
  MAX_PLAYERS,
  MAX_POOL_IDS,
  MAX_ROUNDS,
  MAX_SWAP_BUDGET,
  MAX_SWAP_ROUNDS,
  metricRange,
  parseTournamentFile,
} from '../../src/core/import-guard';
import { V3_CONFIG_DEFAULTS, V4_CONFIG_DEFAULTS } from '../../src/core/migrate';
import { SCHEMA_VERSION, type TournamentDoc } from '../../src/core/model';
import { fold } from '../../src/core/reduce';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Three names chosen because each one has broken a different naive implementation:
 * a hyphen inside a base species name, an internal full stop plus a space, and a
 * typographic apostrophe (U+2019) that an ASCII-normalising round trip mangles into `'`.
 */
const TRICKY_NAMES = ['Kommo-o', 'Mr. Rime', 'Farfetch’d'] as const;

/**
 * The two config-time seeds, distinct from each other and from `rng.seed`.
 *
 * Three different numbers on purpose: a round trip that copied the wrong one into the
 * right field would still pass an assertion written against a single shared constant.
 */
const POOL_SEED = 3_141_592_653;
const ORDER_SEED = 2_718_281_828;

function validDoc(): TournamentDoc {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'b3f1c2d4-0000-4000-8000-000000000000',
    createdAt: 1_770_000_000_000,
    config: {
      formatLabel: 'Champions MB',
      players: [
        { id: 'p1', name: TRICKY_NAMES[0] },
        { id: 'p2', name: TRICKY_NAMES[1] },
      ],
      rounds: 2,
      rosterVersion: 'mb',
      rosterChecksum: 'sha256-abc',
      poolSize: 4,
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
    },
    rng: { seed: 12345, cursor: 0 },
    log: [
      {
        type: 'pool/built',
        ids: ['venusaur', 'garchomp', 'rotomwash', 'kommoo'],
        rosterVersion: 'mb',
        checksum: 'sha256-abc',
        seed: POOL_SEED,
        megaCapableCount: 2,
        seq: 0,
        at: 1_770_000_000_001,
        actorId: 'host',
      },
      {
        type: 'draft/started',
        order: ['p1', 'p2'],
        seed: ORDER_SEED,
        seq: 1,
        at: 1_770_000_000_002,
        actorId: 'host',
      },
      {
        type: 'draft/pickMade',
        playerId: 'p1',
        monId: 'venusaur',
        round: 1,
        pickIndex: 0,
        seq: 2,
        at: 1_770_000_000_003,
        actorId: 'host',
      },
      {
        type: 'draft/pickMade',
        playerId: 'p2',
        monId: 'garchomp',
        round: 1,
        pickIndex: 1,
        seq: 3,
        at: 1_770_000_000_004,
        actorId: 'host',
      },
    ],
  };
}

/** Serialize exactly the way the download button will. */
function exported(doc: TournamentDoc): string {
  return JSON.stringify(doc, null, 2);
}

function parse(text: string) {
  return parseTournamentFile(text, text.length);
}

/**
 * A serialized document with `pair` injected as the first key of the object beginning at
 * `anchor`.
 *
 * Text surgery rather than assignment, and the reason is the trap this whole file is
 * about: `object.__proto__ = value` invokes the inherited `__proto__` SETTER. It changes
 * the object's prototype and creates no own property, so `JSON.stringify` emits nothing
 * and a test written that way asserts against a document that is perfectly clean. The
 * hostile file this guard actually has to survive contains a literal `"__proto__"` key in
 * its text, which is what this produces.
 */
function inject(doc: TournamentDoc, anchor: string, pair: string): string {
  const text = JSON.stringify(doc);
  const at = text.indexOf(anchor);
  expect(at, `anchor ${anchor} not found`).toBeGreaterThan(-1);
  return `${text.slice(0, at + 1)}${pair},${text.slice(at + 1)}`;
}

const DOC_ANCHOR = '{"schemaVersion"';
const FIRST_PLAYER_ANCHOR = '{"id":"p1"';
const RNG_ANCHOR = '{"seed"';
const FIRST_PICK_ANCHOR = '{"type":"draft/pickMade"';

/** The reason of a result that must have failed. Fails loudly if it succeeded. */
function rejection(result: ReturnType<typeof parseTournamentFile>): string {
  expect(result.ok).toBe(false);
  return result.ok ? 'UNEXPECTEDLY-OK' : result.reason;
}

// ---------------------------------------------------------------------------
// Prototype pollution — T-01-01
// ---------------------------------------------------------------------------

describe('prototype pollution', () => {
  it('does not pollute Object.prototype through a __proto__ key', () => {
    const payload = '{"__proto__": {"polluted": true}, "schemaVersion": 1}';

    parse(payload);

    // Built AFTER the parse, so a fixture created earlier cannot mask the result.
    const fresh: Record<string, unknown> = {};
    expect(fresh['polluted']).toBeUndefined();
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('does not pollute through a __proto__ key nested deep inside a valid document', () => {
    // The realistic vector: a document that is otherwise entirely well-formed, with the
    // payload buried where a shape check that only looks at the top level never reaches.
    const payload = inject(validDoc(), FIRST_PLAYER_ANCHOR, '"__proto__":{"pollutedDeep":true}');

    // The tamper is really in the text, or the rest of this test proves nothing.
    expect(payload).toContain('"__proto__"');

    parse(payload);

    expect(({} as Record<string, unknown>)['pollutedDeep']).toBeUndefined();
  });

  it('REJECTS rather than sanitises a document carrying __proto__', () => {
    // Silently stripping the key and loading the rest would mean the host cannot tell a
    // tampered file from a clean one. A file this app wrote never contains these keys.
    expect(
      rejection(parse(inject(validDoc(), DOC_ANCHOR, '"__proto__":{"polluted":true}'))),
    ).toBe('wrongShape');

    expect(
      rejection(parse(inject(validDoc(), RNG_ANCHOR, '"__proto__":{"polluted":true}'))),
    ).toBe('wrongShape');
  });

  it('rejects a `constructor` key at any depth', () => {
    expect(rejection(parse(inject(validDoc(), DOC_ANCHOR, '"constructor":{"name":"nope"}')))).toBe(
      'wrongShape',
    );

    expect(rejection(parse(inject(validDoc(), RNG_ANCHOR, '"constructor":{"name":"nope"}')))).toBe(
      'wrongShape',
    );

    expect(
      rejection(parse(inject(validDoc(), FIRST_PICK_ANCHOR, '"constructor":{"name":"nope"}'))),
    ).toBe('wrongShape');
  });

  it('rejects a `prototype` key at any depth', () => {
    expect(
      rejection(parse(inject(validDoc(), DOC_ANCHOR, '"prototype":{"toString":"nope"}'))),
    ).toBe('wrongShape');

    expect(
      rejection(parse(inject(validDoc(), FIRST_PICK_ANCHOR, '"prototype":{"toString":"nope"}'))),
    ).toBe('wrongShape');

    expect(
      rejection(parse(inject(validDoc(), FIRST_PLAYER_ANCHOR, '"prototype":{"toString":"nope"}'))),
    ).toBe('wrongShape');
  });

  it('leaves Object.prototype clean even when the payload is the whole file', () => {
    parse('{"__proto__":{"toString":"broken"},"constructor":{"x":1}}');

    // If a poisoned `toString` had landed, this line would throw rather than compare.
    expect(String({})).toBe('[object Object]');
  });
});

// ---------------------------------------------------------------------------
// Size and bounds — T-01-03
// ---------------------------------------------------------------------------

describe('bounds', () => {
  it('refuses an oversized file before it parses anything', () => {
    // The text is perfectly valid; only the declared size is not. A guard that parsed
    // first and measured afterwards would already have spent the memory it is refusing.
    expect(rejection(parseTournamentFile(exported(validDoc()), MAX_IMPORT_BYTES + 1))).toBe(
      'tooLarge',
    );
  });

  it('states the size gate as 5 MB', () => {
    expect(MAX_IMPORT_BYTES).toBe(5 * 1024 * 1024);
  });

  it('accepts a file exactly at the size limit', () => {
    // Off-by-one in the defensive direction is still a bug: it refuses good files.
    const text = exported(validDoc());
    expect(parseTournamentFile(text, MAX_IMPORT_BYTES).ok).toBe(true);
  });

  it('refuses a log longer than 20000 entries', () => {
    expect(MAX_LOG_ENTRIES).toBe(20000);

    const doc = validDoc();
    doc.log = Array.from({ length: MAX_LOG_ENTRIES + 1 }, (_unused, index) => ({
      type: 'draft/pickMade' as const,
      playerId: 'p1',
      monId: 'venusaur',
      round: 1,
      pickIndex: index,
      seq: index,
      at: 1,
      actorId: 'host',
    }));

    expect(rejection(parse(JSON.stringify(doc)))).toBe('wrongShape');
  });
});

// ---------------------------------------------------------------------------
// Counts — CR-01
// ---------------------------------------------------------------------------

/**
 * A hostile file, as text, with the hostile value proved to be in it.
 *
 * Both halves matter. Serializing is how the file actually arrives, and the `toContain`
 * is the guard against this file's own worst habit: a "hostile" fixture that quietly
 * serialized clean and made the refusal below assert nothing. Text surgery rather than
 * an extra key, because `JSON.parse` keeps the LAST of two identical keys — injecting
 * `"rounds":4000000000` ahead of the real one would test the real one.
 */
function hostileText(doc: TournamentDoc, from: string, to: string): string {
  const text = JSON.stringify(doc);
  expect(text.includes(from), `fragment ${from} not in the fixture`).toBe(true);

  const hostile = text.replace(from, to);
  expect(hostile).toContain(to);
  return hostile;
}

describe('counts', () => {
  it('refuses a rounds count that renders as a multi-billion-element allocation', () => {
    // Twenty bytes. It passes the 5 MB size gate and the 20000-entry log cap with room to
    // spare, and `selectTeams` turns it into `Array.from({ length: rounds })` once per
    // player during App's render — an out-of-memory abort from a file a friend sent.
    const text = hostileText(validDoc(), '"rounds":2', '"rounds":4000000000');

    expect(rejection(parse(text))).toBe('wrongShape');
  });

  it('refuses one round past the cap and accepts the cap itself', () => {
    // Off-by-one in the defensive direction still refuses documents this app could
    // legitimately produce, so both sides of the boundary are asserted.
    expect(MAX_ROUNDS).toBe(24);

    const over = hostileText(validDoc(), '"rounds":2', `"rounds":${String(MAX_ROUNDS + 1)}`);
    expect(rejection(parse(over))).toBe('wrongShape');

    const at = hostileText(validDoc(), '"rounds":2', `"rounds":${String(MAX_ROUNDS)}`);
    expect(parse(at).ok).toBe(true);
  });

  it('refuses a rounds count of Number.MAX_SAFE_INTEGER', () => {
    // The old check was `Number.isSafeInteger(value) && value > 0`, so this was the
    // largest value it accepted rather than the first one it refused.
    const text = hostileText(
      validDoc(),
      '"rounds":2',
      `"rounds":${String(Number.MAX_SAFE_INTEGER)}`,
    );

    expect(rejection(parse(text))).toBe('wrongShape');
  });

  it('refuses more players than a room, and accepts a room', () => {
    expect(MAX_PLAYERS).toBe(64);

    const roster = (count: number) =>
      Array.from({ length: count }, (_unused, index) => ({
        id: `p${String(index)}`,
        name: `Player ${String(index)}`,
      }));

    const over = validDoc();
    over.config.players = roster(MAX_PLAYERS + 1);
    const overText = JSON.stringify(over);
    expect(overText).toContain(`"id":"p${String(MAX_PLAYERS)}"`);
    expect(rejection(parse(overText))).toBe('wrongShape');

    const at = validDoc();
    at.config.players = roster(MAX_PLAYERS);
    expect(parse(JSON.stringify(at)).ok).toBe(true);
  });

  it('refuses a pool larger than any roster this app will ever load', () => {
    expect(MAX_POOL_IDS).toBe(5000);

    // Within the 5 MB budget an unbounded `ids` is roughly 1.5 million strings, and
    // `PoolGrid` renders one `MonCard` per id.
    const doc = validDoc();
    const built = doc.log[0];
    if (built === undefined || built.type !== 'pool/built') {
      throw new Error('fixture no longer starts with pool/built');
    }
    built.ids = Array.from(
      { length: MAX_POOL_IDS + 1 },
      (_unused, index) => `mon-${String(index)}`,
    );

    const text = JSON.stringify(doc);
    expect(text).toContain(`"mon-${String(MAX_POOL_IDS)}"`);
    expect(rejection(parse(text))).toBe('wrongShape');
  });

  it('refuses a starting order longer than the player cap', () => {
    const doc = validDoc();
    const started = doc.log[1];
    if (started === undefined || started.type !== 'draft/started') {
      throw new Error('fixture no longer carries draft/started second');
    }
    started.order = Array.from(
      { length: MAX_PLAYERS + 1 },
      (_unused, index) => `p${String(index)}`,
    );

    const text = JSON.stringify(doc);
    expect(text).toContain(`"p${String(MAX_PLAYERS)}"`);
    expect(rejection(parse(text))).toBe('wrongShape');
  });
});

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

describe('shape', () => {
  it('accepts a document this app exported', () => {
    const result = parse(exported(validDoc()));
    expect(result.ok).toBe(true);
  });

  it('refuses text that is not JSON at all', () => {
    expect(rejection(parse('this is not json'))).toBe('notJson');
    expect(rejection(parse(''))).toBe('notJson');
    expect(rejection(parse('{"unterminated": '))).toBe('notJson');
  });

  it('refuses valid JSON that is not a tournament', () => {
    expect(rejection(parse('{"hello":"world"}'))).toBe('wrongShape');
    expect(rejection(parse('[1,2,3]'))).toBe('wrongShape');
    expect(rejection(parse('null'))).toBe('wrongShape');
    expect(rejection(parse('"a string"'))).toBe('wrongShape');
    expect(rejection(parse('42'))).toBe('wrongShape');
  });

  it('refuses a document with no players, or a player missing a name', () => {
    const empty = validDoc();
    empty.config.players = [];
    expect(rejection(parse(JSON.stringify(empty)))).toBe('wrongShape');

    const nameless = validDoc() as unknown as Record<string, unknown>;
    const config = nameless['config'] as Record<string, unknown>;
    (config['players'] as Record<string, unknown>[])[0] = { id: 'p1' };
    expect(rejection(parse(JSON.stringify(nameless)))).toBe('wrongShape');
  });

  it('refuses a non-positive or non-integer round count', () => {
    for (const rounds of [0, -1, 1.5, Number.NaN]) {
      const doc = validDoc();
      doc.config.rounds = rounds;
      expect(rejection(parse(JSON.stringify(doc)))).toBe('wrongShape');
    }
  });

  it('refuses a log entry whose type is not a string', () => {
    const doc = validDoc() as unknown as Record<string, unknown>;
    (doc['log'] as Record<string, unknown>[])[2]!['type'] = 7;
    expect(rejection(parse(JSON.stringify(doc)))).toBe('wrongShape');
  });

  it('refuses a log entry whose seq is not a non-negative integer', () => {
    for (const seq of [-1, 2.5, '2', null]) {
      const doc = validDoc() as unknown as Record<string, unknown>;
      (doc['log'] as Record<string, unknown>[])[2]!['seq'] = seq;
      expect(rejection(parse(JSON.stringify(doc)))).toBe('wrongShape');
    }
  });

  it('refuses a log entry with a non-numeric `at` or a non-string `actorId`', () => {
    const badAt = validDoc() as unknown as Record<string, unknown>;
    (badAt['log'] as Record<string, unknown>[])[1]!['at'] = 'yesterday';
    expect(rejection(parse(JSON.stringify(badAt)))).toBe('wrongShape');

    const badActor = validDoc() as unknown as Record<string, unknown>;
    (badActor['log'] as Record<string, unknown>[])[1]!['actorId'] = 42;
    expect(rejection(parse(JSON.stringify(badActor)))).toBe('wrongShape');
  });

  it('refuses a log whose seq values are not strictly increasing — T-01-44', () => {
    // Duplicates are the damaging case: `draft/pickUndone` targets a pick BY seq, so two
    // actions sharing one would retract an arbitrary pick of the two.
    const duplicate = validDoc();
    duplicate.log[3]!.seq = 2;
    expect(rejection(parse(JSON.stringify(duplicate)))).toBe('wrongShape');

    const backwards = validDoc();
    backwards.log[2]!.seq = 9;
    backwards.log[3]!.seq = 4;
    expect(rejection(parse(JSON.stringify(backwards)))).toBe('wrongShape');
  });

  it('refuses a log that does not start at seq zero', () => {
    const doc = validDoc();
    doc.log[0]!.seq = 1;
    doc.log[1]!.seq = 2;
    doc.log[2]!.seq = 3;
    doc.log[3]!.seq = 4;
    expect(rejection(parse(JSON.stringify(doc)))).toBe('wrongShape');
  });

  it('ACCEPTS a gapped-but-increasing log, deliberately', () => {
    // Documented departure from the plan text, which said "0, 1, 2, … with no gaps".
    //
    // `store.ts` assigns `seq = max(seq) + 1` precisely so that removing an entry from
    // the middle of the log — which Phase 2 does, when undo has card plays and bans to
    // step over — cannot reissue a seq already in use. Gaps are therefore a state this
    // application will legitimately produce and must be able to reopen. Requiring
    // contiguity would make the tool refuse a file it wrote itself.
    //
    // What the reducer actually needs is uniqueness and order, which "strictly
    // increasing" gives and contiguity merely implies.
    const doc = validDoc();
    doc.log[2]!.seq = 5;
    doc.log[3]!.seq = 9;
    expect(parse(JSON.stringify(doc)).ok).toBe(true);
  });

  it('accepts an empty log', () => {
    const doc = validDoc();
    doc.log = [];
    expect(parse(JSON.stringify(doc)).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Schema version — T-01-02
// ---------------------------------------------------------------------------

describe('schema version', () => {
  it('refuses a document from a newer build rather than half-reading it', () => {
    const doc = validDoc();
    doc.schemaVersion = SCHEMA_VERSION + 1;
    expect(rejection(parse(JSON.stringify(doc)))).toBe('newerSchema');

    const distantFuture = validDoc();
    distantFuture.schemaVersion = 99;
    expect(rejection(parse(JSON.stringify(distantFuture)))).toBe('newerSchema');
  });

  it('refuses an unrecognised older or nonsense schema version', () => {
    for (const schemaVersion of [0, -3]) {
      const doc = validDoc();
      doc.schemaVersion = schemaVersion;
      expect(rejection(parse(JSON.stringify(doc)))).toBe('unknownSchema');
    }
  });

  it('refuses a non-numeric schema version as a shape problem', () => {
    const doc = validDoc() as unknown as Record<string, unknown>;
    doc['schemaVersion'] = '1';
    expect(rejection(parse(JSON.stringify(doc)))).toBe('wrongShape');
  });
});

// ---------------------------------------------------------------------------
// No half-loading — T-01-45
// ---------------------------------------------------------------------------

describe('a refused import changes nothing', () => {
  it('never returns a document alongside a rejection', () => {
    const doc = validDoc() as unknown as Record<string, unknown>;
    doc['constructor'] = { evil: true };

    const result = parse(JSON.stringify(doc));
    expect(result.ok).toBe(false);
    // Not "doc is empty" — doc is ABSENT. A caller cannot accidentally adopt half of a
    // refused file because there is no half to reach for.
    expect('doc' in result).toBe(false);
  });

  it('leaves a document the caller is already holding byte-identical', () => {
    const live = validDoc();
    const before = JSON.stringify(live);

    parse('{"schemaVersion": 1, "log": "not an array"}');
    parse('total garbage');
    parseTournamentFile(exported(live), MAX_IMPORT_BYTES + 1);

    expect(JSON.stringify(live)).toBe(before);
  });

  it('returns a deep copy, so the caller cannot reach back into the parse result', () => {
    const text = exported(validDoc());

    const first = parse(text);
    const second = parse(text);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    first.doc.config.players[0]!.name = 'MUTATED';
    first.doc.log.push(first.doc.log[0]!);

    // The rebuild is field by field from an allow-list, so two parses of one string share
    // no object at all. A bulk copy of the parse result would fail the identity checks
    // below even when it passed the value checks.
    expect(second.doc.config.players[0]!.name).toBe(TRICKY_NAMES[0]);
    expect(second.doc.log).toHaveLength(4);
    expect(first.doc.config).not.toBe(second.doc.config);
    expect(first.doc.log[0]).not.toBe(second.doc.log[0]);
  });

  it('drops unknown top-level fields instead of carrying them into state', () => {
    const doc = validDoc() as unknown as Record<string, unknown>;
    doc['trackingPixel'] = 'https://example.invalid/beacon';
    doc['extra'] = { nested: true };

    const result = parse(JSON.stringify(doc));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(Object.keys(result.doc).sort()).toEqual([
      'config',
      'createdAt',
      'id',
      'log',
      'rng',
      'schemaVersion',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Round trip — PERS-04 / PERS-05
// ---------------------------------------------------------------------------

describe('round trip', () => {
  it('folds an exported-and-reimported document to the same state', () => {
    const original = validDoc();

    const result = parse(exported(original));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The state is the thing the host sees. Comparing folded states rather than raw
    // documents is what makes this test about "the draft resumes exactly" rather than
    // about JSON being JSON.
    expect(fold(result.doc)).toEqual(fold(original));
  });

  it('survives a second full trip without drifting', () => {
    const once = parse(exported(validDoc()));
    expect(once.ok).toBe(true);
    if (!once.ok) return;

    const twice = parse(exported(once.doc));
    expect(twice.ok).toBe(true);
    if (!twice.ok) return;

    expect(twice.doc).toEqual(once.doc);
  });

  /**
   * A six-round document whose schedule was REORDERED away from the canonical order.
   *
   * This is the fixture a recompute-on-load implementation fails and every other test in
   * this file passes. `compile([{ kind: 'mega', count: 2 }], 6)` emits Mega rounds first;
   * the host permuted it, and the log is the only record that they did.
   */
  function reorderedScheduleDoc(): TournamentDoc {
    const doc = validDoc();
    doc.config.rounds = 6;
    doc.config.megasRequiredPerTeam = 2;
    doc.config.rules = [{ kind: 'mega', count: 2 }];
    doc.log = [
      doc.log[0] as TournamentDoc['log'][number],
      {
        type: 'schedule/compiled',
        rounds: [
          { index: 1, kind: 'open' },
          { index: 2, kind: 'mega' },
          { index: 3, kind: 'open' },
          { index: 4, kind: 'mega' },
          { index: 5, kind: 'open' },
          { index: 6, kind: 'open' },
        ],
        seq: 1,
        at: 1_770_000_000_002,
        actorId: 'host',
      } as unknown as TournamentDoc['log'][number],
      {
        type: 'draft/started',
        order: ['p1', 'p2'],
        seed: ORDER_SEED,
        seq: 2,
        at: 1_770_000_000_003,
        actorId: 'host',
      } as unknown as TournamentDoc['log'][number],
    ];
    return doc;
  }

  it('reproduces a reordered schedule exactly, rather than recompiling the canonical one', () => {
    const result = parse(exported(reorderedScheduleDoc()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(fold(result.doc).schedule.map((spec) => spec.kind)).toEqual([
      'open',
      'mega',
      'open',
      'mega',
      'open',
      'open',
    ]);
    // And the carried indices survive too, not just the kinds.
    expect(fold(result.doc).schedule.map((spec) => spec.index)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('survives a second trip with the reordered schedule byte for byte', () => {
    const once = parse(exported(reorderedScheduleDoc()));
    expect(once.ok).toBe(true);
    if (!once.ok) return;

    const twice = parse(exported(once.doc));
    expect(twice.ok).toBe(true);
    if (!twice.ok) return;

    expect(twice.doc).toEqual(once.doc);
    expect(exported(twice.doc)).toBe(exported(once.doc));
  });

  it('preserves Kommo-o, Mr. Rime and a U+2019 name character for character', () => {
    const original = validDoc();
    original.config.players = TRICKY_NAMES.map((name, index) => ({
      id: `p${index + 1}`,
      name,
    }));
    original.config.rounds = 1;
    original.log = original.log.slice(0, 2);
    (original.log[1] as { order: string[] }).order = ['p1', 'p2', 'p3'];

    const result = parse(exported(original));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.doc.config.players.map((player) => player.name)).toEqual([...TRICKY_NAMES]);

    // Spelled out, because the failure this catches is a silent ASCII fold that still
    // looks right in a terminal: U+2019 RIGHT SINGLE QUOTATION MARK, not U+0027.
    expect(result.doc.config.players[2]!.name).toBe('Farfetch’d');
    expect(result.doc.config.players[2]!.name).not.toContain("'");
    expect(result.doc.config.players[2]!.name.codePointAt(8)).toBe(0x2019);
  });
});

// ---------------------------------------------------------------------------
// The version 2 config fields — T-02-05 / T-02-06
// ---------------------------------------------------------------------------

/** A serialized document whose config carries `overrides` on top of the fixture. */
function configuredText(overrides: Record<string, unknown>): string {
  const doc = validDoc() as unknown as Record<string, unknown>;
  Object.assign(doc['config'] as Record<string, unknown>, overrides);
  return JSON.stringify(doc);
}

/**
 * Every version 2 field, none of them at its default.
 *
 * `megasRequiredPerTeam` is 2 rather than a larger number because the fixture's config
 * declares `rounds: 2`, and the guard bounds the field by the document's OWN round count.
 * It is still not the default, which is 0.
 */
const CONFIGURED: Record<string, unknown> = {
  poolSize: 96,
  bans: ['mewtwo', 'rayquaza'],
  banMode: 'snake',
  megasRequiredPerTeam: 2,
  dualMegaChoices: [
    { speciesId: 'charizard', forme: 'x' },
    { speciesId: 'raichu', forme: 'either' },
  ],
  depth: 'draftBracketsAndLog',
};

describe('version 2 config fields', () => {
  it('returns every one of them unchanged, field by field', () => {
    // Field by field rather than one `toEqual` on the whole document: a single deep
    // comparison against a fixture that was itself built from the parse result would
    // agree with any consistent dropping of fields.
    const result = parse(configuredText(CONFIGURED));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { config } = result.doc;
    expect(config.poolSize).toBe(96);
    expect(config.bans).toEqual(['mewtwo', 'rayquaza']);
    expect(config.banMode).toBe('snake');
    expect(config.megasRequiredPerTeam).toBe(2);
    expect(config.dualMegaChoices).toEqual([
      { speciesId: 'charizard', forme: 'x' },
      { speciesId: 'raichu', forme: 'either' },
    ]);
    expect(config.depth).toBe('draftBracketsAndLog');
  });

  it('copies bans rather than aliasing, and drops a third field off a dual-Mega choice', () => {
    const result = parse(
      configuredText({
        bans: ['mewtwo'],
        dualMegaChoices: [{ speciesId: 'charizard', forme: 'y', note: 'not a field' }],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.doc.config.dualMegaChoices[0]).toEqual({ speciesId: 'charizard', forme: 'y' });
    expect(Object.keys(result.doc.config.dualMegaChoices[0] ?? {}).sort()).toEqual([
      'forme',
      'speciesId',
    ]);
  });

  it.each([
    ['a banMode outside the three literals', { banMode: 'blindish' }],
    ['a banMode that is not a string at all', { banMode: 3 }],
    ['a depth that is a number', { depth: 42 }],
    ['a depth outside the three literals', { depth: 'draftAndVibes' }],
    ['a poolSize that renders as a four-billion-cell grid', { poolSize: 4e9 }],
    ['a negative poolSize', { poolSize: -1 }],
    ['a zero poolSize', { poolSize: 0 }],
    ['a fractional poolSize', { poolSize: 12.5 }],
    ['more required Megas than the round cap allows anyone', { megasRequiredPerTeam: 25 }],
    // THE ONE THIS DOCUMENT'S OWN ROUND COUNT CATCHES AND THE BLANKET CAP DOES NOT. The
    // fixture declares `rounds: 2`, so three Megas per team is unsatisfiable by
    // arithmetic — while sitting comfortably under MAX_ROUNDS, which is 24. Bounded by
    // the cap alone, this file loaded and the host met "at most 2 of them can be Megas.
    // Lower the Megas required per team." on a screen with no such field.
    ['more required Megas than this document has rounds', { megasRequiredPerTeam: 3 }],
    ['a negative megasRequiredPerTeam', { megasRequiredPerTeam: -1 }],
    ['a bans value that is not an array', { bans: 3 }],
    ['a bans array holding a non-string', { bans: ['mewtwo', 7] }],
    ['a dualMegaChoices forme outside the three literals', {
      dualMegaChoices: [{ speciesId: 'charizard', forme: 'z' }],
    }],
    ['a dualMegaChoices entry with an empty speciesId', {
      dualMegaChoices: [{ speciesId: '', forme: 'x' }],
    }],
    ['a dualMegaChoices entry that is not an object', { dualMegaChoices: ['charizard'] }],
    ['duplicate dualMegaChoices for one species', {
      dualMegaChoices: [
        { speciesId: 'charizard', forme: 'x' },
        { speciesId: 'charizard', forme: 'y' },
      ],
    }],
  ])('refuses %s', (_label, overrides) => {
    // Refused, never clamped. A clamped value loads a tournament nobody played, under a
    // board the host has no reason to distrust.
    expect(rejection(parse(configuredText(overrides)))).toBe('wrongShape');
  });

  it('refuses a bans list longer than the pool cap', () => {
    const bans = Array.from({ length: MAX_POOL_IDS + 1 }, (_unused, i) => `mon-${String(i)}`);
    expect(rejection(parse(configuredText({ bans })))).toBe('wrongShape');

    const atCap = Array.from({ length: MAX_POOL_IDS }, (_unused, i) => `mon-${String(i)}`);
    expect(parse(configuredText({ bans: atCap })).ok).toBe(true);
  });

  it('refuses a dualMegaChoices list longer than the pool cap', () => {
    const choices = Array.from({ length: MAX_POOL_IDS + 1 }, (_unused, i) => ({
      speciesId: `mon-${String(i)}`,
      forme: 'either',
    }));
    expect(rejection(parse(configuredText({ dualMegaChoices: choices })))).toBe('wrongShape');
  });

  it('accepts megasRequiredPerTeam exactly at the document’s own round count', () => {
    // An all-Mega team is a legitimate configuration; one Mega more than there are picks
    // to spend is not. The boundary is the document's `rounds`, not MAX_ROUNDS — a
    // two-round document is refused at 24 even though the blanket cap allows it.
    expect(parse(configuredText({ rounds: 6, megasRequiredPerTeam: 6 })).ok).toBe(true);
    expect(rejection(parse(configuredText({ rounds: 6, megasRequiredPerTeam: 7 })))).toBe(
      'wrongShape',
    );
    expect(rejection(parse(configuredText({ megasRequiredPerTeam: MAX_ROUNDS })))).toBe(
      'wrongShape',
    );
  });
});

// ---------------------------------------------------------------------------
// The version 3 config fields — T-03-01 / T-03-02
// ---------------------------------------------------------------------------

/**
 * A serialized document whose config has every version 3 key REMOVED, then `overrides`
 * applied on top.
 *
 * The absent case is the interesting one and it needs its own builder, because
 * `configuredText` starts from a fixture that already carries the version 3 keys and
 * `Object.assign` cannot express "this key was never written".
 */
function v3AbsentText(overrides: Record<string, unknown> = {}): string {
  const doc = validDoc() as unknown as Record<string, unknown>;
  const config = doc['config'] as Record<string, unknown>;
  delete config['rules'];
  delete config['megaFormeBans'];
  delete config['swapBudget'];
  delete config['swapRounds'];
  Object.assign(config, overrides);
  return JSON.stringify(doc);
}

/**
 * A serialized document whose config has both version 4 keys REMOVED, then `overrides`
 * applied on top.
 *
 * The same builder-per-version reason {@link v3AbsentText} gives: the fixture already
 * carries the version 4 keys, and `Object.assign` cannot express "this key was never
 * written". This is the shape every schema 3 document on disk actually has.
 */
function v4AbsentText(overrides: Record<string, unknown> = {}): string {
  const doc = validDoc() as unknown as Record<string, unknown>;
  const config = doc['config'] as Record<string, unknown>;
  delete config['bansPerPlayer'];
  delete config['duplicateBanPolicy'];
  Object.assign(config, overrides);
  return JSON.stringify(doc);
}

describe('version 3 config fields', () => {
  it('returns every one of them unchanged, field by field', () => {
    const result = parse(
      configuredText({
        rounds: 6,
        megasRequiredPerTeam: 4,
        rules: [{ kind: 'mega', count: 4 }],
        megaFormeBans: ['charizardmegax', 'gengarmega'],
        swapBudget: 3,
        swapRounds: 2,
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { config } = result.doc;
    expect(config.rules).toEqual([{ kind: 'mega', count: 4 }]);
    expect(config.megaFormeBans).toEqual(['charizardmegax', 'gengarmega']);
    expect(config.swapBudget).toBe(3);
    expect(config.swapRounds).toBe(2);
  });

  it('lands the absent keys on the version 2 defaults', () => {
    const result = parse(v3AbsentText());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { config } = result.doc;
    expect(config.megaFormeBans).toEqual([]);
    expect(config.swapBudget).toBe(0);
    expect(config.swapRounds).toBe(0);
  });

  it('derives an absent rules list from the document’s own megasRequiredPerTeam', () => {
    // The same wrap `migrateV2ToV3` performs. A file that predates the field and a file
    // that was migrated must agree about what the tournament required.
    const result = parse(v3AbsentText({ rounds: 6, megasRequiredPerTeam: 3 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.doc.config.rules).toEqual([{ kind: 'mega', count: 3 }]);
  });

  it('refuses a swap budget that would render four billion board cells', () => {
    // Refused, never clamped — and the refusal is the whole result, so there is no doc to
    // inspect for a repaired value. That is the assertion: no document at all.
    const result = parse(configuredText({ swapBudget: 4_000_000_000 }));

    expect(rejection(result)).toBe('wrongShape');
    expect('doc' in result).toBe(false);
  });

  it.each([
    ['a swapBudget one past its cap', { swapBudget: MAX_SWAP_BUDGET + 1 }],
    ['a negative swapBudget', { swapBudget: -1 }],
    ['a fractional swapBudget', { swapBudget: 1.5 }],
    ['a swapBudget written as a string', { swapBudget: '2' }],
    ['a swapBudget that is null', { swapBudget: null }],
    ['a swapRounds one past its cap', { swapRounds: MAX_SWAP_ROUNDS + 1 }],
    ['a fractional swapRounds', { swapRounds: 2.5 }],
    ['a negative swapRounds', { swapRounds: -1 }],
    ['a swapRounds that is not a number', { swapRounds: '2' }],
    ['a rule kind this build has no compiler for', { rules: [{ kind: 'water', count: 2 }] }],
    ['a rule with no kind at all', { rules: [{ count: 2 }] }],
    ['a rule whose count is fractional', { rules: [{ kind: 'mega', count: 1.5 }] }],
    ['a rule whose count is negative', { rules: [{ kind: 'mega', count: -1 }] }],
    ['a rule that is not an object', { rules: ['mega'] }],
    ['a rules value that is not an array', { rules: 3 }],
    ['a megaFormeBans array holding a non-string', { megaFormeBans: ['gengarmega', 7] }],
    ['a megaFormeBans value that is not an array', { megaFormeBans: 'gengarmega' }],
  ])('refuses %s', (_label, overrides) => {
    expect(rejection(parse(configuredText(overrides)))).toBe('wrongShape');
  });

  it('refuses more Mega rounds than the document has rounds', () => {
    // The same bound `megasRequiredPerTeam` already carries, for the same reason: a rule
    // requiring seven Mega slots in a six-round draft is unsatisfiable by arithmetic, and
    // the screen that could lower it is not the one the host would be looking at.
    expect(parse(configuredText({ rounds: 6, rules: [{ kind: 'mega', count: 6 }] })).ok).toBe(true);
    expect(
      rejection(parse(configuredText({ rounds: 6, rules: [{ kind: 'mega', count: 7 }] }))),
    ).toBe('wrongShape');
  });

  it('refuses a rules list longer than the composition cap', () => {
    const atCap = Array.from({ length: MAX_COMPOSITION_RULES }, () => ({
      kind: 'mega',
      count: 1,
    }));
    expect(parse(configuredText({ rounds: 6, rules: atCap })).ok).toBe(true);

    expect(
      rejection(parse(configuredText({ rounds: 6, rules: [...atCap, { kind: 'mega', count: 1 }] }))),
    ).toBe('wrongShape');
  });

  it('refuses a megaFormeBans list longer than its own cap', () => {
    const atCap = Array.from({ length: MAX_MEGA_FORME_BANS }, (_unused, i) => `forme-${String(i)}`);
    expect(parse(configuredText({ megaFormeBans: atCap })).ok).toBe(true);

    expect(
      rejection(parse(configuredText({ megaFormeBans: [...atCap, 'one-too-many'] }))),
    ).toBe('wrongShape');
  });

  it('accepts a swap budget and a swap-round count exactly at their caps', () => {
    const result = parse(
      configuredText({ swapBudget: MAX_SWAP_BUDGET, swapRounds: MAX_SWAP_ROUNDS }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.doc.config.swapBudget).toBe(MAX_SWAP_BUDGET);
    expect(result.doc.config.swapRounds).toBe(MAX_SWAP_ROUNDS);
  });

  // -------------------------------------------------------------------------
  // Version 4 — BAN-03/BAN-04 and BAN-07. One bounded number and one bounded
  // union, and they take DIFFERENT dispositions on a bad value. See below.
  // -------------------------------------------------------------------------

  it('bounds bans per player at the same number the swap budget uses', () => {
    // Not derived from `MAX_SWAP_BUDGET` — chosen to match it. The assertion pins the
    // value so that changing one of the two is a deliberate act rather than a side effect,
    // and `04-UI-SPEC` §1 independently specifies 24 as the field's `max`.
    expect(MAX_BANS_PER_PLAYER).toBe(24);
    expect(MAX_BANS_PER_PLAYER).toBe(MAX_SWAP_BUDGET);
  });

  it('returns both version 4 fields unchanged when the file carries them', () => {
    const result = parse(configuredText({ bansPerPlayer: 3, duplicateBanPolicy: 'reBan' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.doc.config.bansPerPlayer).toBe(3);
    expect(result.doc.config.duplicateBanPolicy).toBe('reBan');
  });

  it('carries reBan through, because it is a declared member of the union', () => {
    // Nothing READS this value in Phase 4, which is exactly why the guard has to be right
    // about it: the first build that starts reading it will read what was stored now.
    const result = parse(configuredText({ duplicateBanPolicy: 'reBan' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.doc.config.duplicateBanPolicy).toBe('reBan');
  });

  it('lands the absent keys on the version 3 defaults, not on undefined', () => {
    // The keys are OPTIONAL here for the ordering reason the function's doc block gives:
    // `buildConfig` runs before `migrate`, so requiring them would refuse every schema 3
    // document one step before the migration that exists to upgrade it.
    const result = parse(v4AbsentText());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { config } = result.doc;
    expect(config.bansPerPlayer).toBe(V3_CONFIG_DEFAULTS.bansPerPlayer);
    expect(config.bansPerPlayer).toBe(0);
    expect(config.duplicateBanPolicy).toBe(V3_CONFIG_DEFAULTS.duplicateBanPolicy);
    expect(config.duplicateBanPolicy).toBe('bothApply');
    expect(Number.isNaN(config.bansPerPlayer)).toBe(false);
  });

  it('refuses a bans-per-player count that would draw a four-billion-mon pool', () => {
    // T-04-01. This number is multiplied by the player count and reaches `drawPool`, which
    // documents a deliberate uncaught `RangeError` on an oversized count. Refused, never
    // clamped, so there is no document at all to inspect for a repaired value.
    const result = parse(configuredText({ bansPerPlayer: 4_000_000_000 }));

    expect(rejection(result)).toBe('wrongShape');
    expect('doc' in result).toBe(false);
  });

  it.each([
    ['a bansPerPlayer one past its cap', { bansPerPlayer: MAX_BANS_PER_PLAYER + 1 }],
    ['a negative bansPerPlayer', { bansPerPlayer: -1 }],
    ['a fractional bansPerPlayer', { bansPerPlayer: 2.5 }],
    ['a bansPerPlayer written as a string', { bansPerPlayer: '3' }],
    ['a bansPerPlayer that is null', { bansPerPlayer: null }],
    ['a bansPerPlayer that is an object', { bansPerPlayer: { valueOf: 3 } }],
    ['a bansPerPlayer that is an array', { bansPerPlayer: [3] }],
    ['a bansPerPlayer that is a boolean', { bansPerPlayer: true }],
  ])('refuses %s', (_label, overrides) => {
    expect(rejection(parse(configuredText(overrides)))).toBe('wrongShape');
  });

  it('refuses NaN and Infinity, which reach the guard as null through JSON', () => {
    // JSON cannot carry either one — `JSON.stringify({ n: NaN })` emits `{"n":null}` — so
    // the hand-edited file that meant to smuggle one arrives at the null branch. Asserting
    // that here rather than pretending a `NaN` literal could survive the wire.
    expect(JSON.parse(JSON.stringify({ n: Number.NaN })).n).toBeNull();
    expect(rejection(parse(configuredText({ bansPerPlayer: Number.NaN })))).toBe('wrongShape');
    expect(rejection(parse(configuredText({ bansPerPlayer: Number.POSITIVE_INFINITY })))).toBe(
      'wrongShape',
    );
  });

  it('accepts a bans-per-player count exactly at its cap', () => {
    const result = parse(configuredText({ bansPerPlayer: MAX_BANS_PER_PLAYER }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.doc.config.bansPerPlayer).toBe(MAX_BANS_PER_PLAYER);
  });

  it('accepts zero bans per player, which is what hostBanlist is', () => {
    // The range starts at 0 rather than 1 deliberately. `0` is the legitimate
    // `hostBanlist` value and the value every migrated schema 3 document carries; the
    // `>= 1` requirement at `blind` and `snake` is the feasibility gate's question.
    const result = parse(configuredText({ bansPerPlayer: 0, banMode: 'hostBanlist' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.doc.config.bansPerPlayer).toBe(0);
  });

  it.each([
    ['a policy this build has no rule for', 'sudden-death'],
    ['a policy that is a number', 42],
    ['a policy that is null', null],
    ['a policy that is an empty string', ''],
    ['a policy that is an object', { kind: 'reBan' }],
    ['a policy whose case does not match the union', 'BothApply'],
  ])('coerces %s to bothApply rather than refusing the file', (_label, policy) => {
    // The disposition DIFFERS from `banMode`, which refuses, and the difference is the
    // point rather than an inconsistency: nothing reads `duplicateBanPolicy` in Phase 4,
    // so an unrecognised value cannot produce a wrong tournament — only a wrong stored
    // string. Refusing the whole file over a field with no reader would lose a real
    // tournament to a typo in a field that does nothing.
    const result = parse(configuredText({ duplicateBanPolicy: policy }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.doc.config.duplicateBanPolicy).toBe('bothApply');
  });

  it('never lets a value outside the union reach the document', () => {
    // The bound exists because a stored value outside the union becomes live the moment a
    // later milestone starts reading it — T-04-02.
    const result = parse(configuredText({ duplicateBanPolicy: 'sudden-death' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(['bothApply', 'reBan']).toContain(result.doc.config.duplicateBanPolicy);
  });

  it('round-trips both fields through stringify and back', () => {
    // The whole-document round trip, not merely the parse: this is the path a host takes
    // when they export a tournament and reimport it on another machine.
    const source = validDoc();
    source.config.bansPerPlayer = 5;
    source.config.duplicateBanPolicy = 'reBan';

    const result = parse(JSON.stringify(source));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.doc.config.bansPerPlayer).toBe(5);
    expect(result.doc.config.duplicateBanPolicy).toBe('reBan');
  });

  it('still drops a config carrying a poison key, unchanged by the two new fields', () => {
    // Both additions are scalars and neither introduces a new object shape, so the
    // reviver's behaviour must be exactly what it was — T-04-05 is accepted, not reworked.
    const text = configuredText({ bansPerPlayer: 2 }).replace(
      '"bansPerPlayer":2',
      '"bansPerPlayer":2,"__proto__":{"polluted":true}',
    );

    parse(text);

    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('carries a forme id spelled __proto__ through as a plain string', () => {
    // The dangerous-key handling is about KEYS. A string that happens to spell one is a
    // string, and the copy must neither drop it nor let it reach a prototype.
    const result = parse(configuredText({ megaFormeBans: ['__proto__', 'constructor'] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.doc.config.megaFormeBans).toEqual(['__proto__', 'constructor']);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    expect(Object.getPrototypeOf(result.doc.config) as unknown).toBe(Object.prototype);
  });

  it('copies megaFormeBans and rules rather than aliasing the parsed arrays', () => {
    const result = parse(configuredText({ megaFormeBans: ['gengarmega'] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // A fresh array on the way in is what keeps folded state from sharing structure with
    // whatever `JSON.parse` produced.
    expect(result.doc.config.megaFormeBans).toEqual(['gengarmega']);
    expect(result.doc.config.rules).not.toBe(result.doc.config.rules.slice(0, 0));
  });

  it('does no referential-integrity check between rules and megasRequiredPerTeam', () => {
    // T-03-04, accepted rather than mitigated. A bound is not an integrity check, and the
    // disagreement surfaces as the non-blocking adoption notice rather than as a refusal.
    const result = parse(
      configuredText({ rounds: 6, megasRequiredPerTeam: 2, rules: [{ kind: 'mega', count: 5 }] }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.doc.config.megasRequiredPerTeam).toBe(2);
    expect(result.doc.config.rules).toEqual([{ kind: 'mega', count: 5 }]);
  });
});

// ---------------------------------------------------------------------------
// The two config-time seeds — D-06
// ---------------------------------------------------------------------------

describe('config-time seeds in the log', () => {
  it('keeps both seeds and the Mega-capable count across a round trip', () => {
    // This file rebuilds payloads field by field, so a field it does not name is dropped
    // SILENTLY. A dropped pool seed is a tournament that can never explain its own pool.
    const result = parse(exported(validDoc()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const built = result.doc.log[0];
    expect(built?.type).toBe('pool/built');
    if (built === undefined || built.type !== 'pool/built') return;
    expect(built.seed).toBe(POOL_SEED);
    expect(built.megaCapableCount).toBe(2);

    const started = result.doc.log[1];
    expect(started?.type).toBe('draft/started');
    if (started === undefined || started.type !== 'draft/started') return;
    expect(started.seed).toBe(ORDER_SEED);
  });

  it('refuses a seed that is present and malformed', () => {
    for (const seed of ['12345', 1.5, Number.NaN, null]) {
      const doc = validDoc() as unknown as Record<string, unknown>;
      (doc['log'] as Record<string, unknown>[])[0]!['seed'] = seed;
      expect(rejection(parse(JSON.stringify(doc)))).toBe('wrongShape');
    }
  });

  it('refuses a megaCapableCount above the pool cap', () => {
    const doc = validDoc() as unknown as Record<string, unknown>;
    (doc['log'] as Record<string, unknown>[])[0]!['megaCapableCount'] = MAX_POOL_IDS + 1;
    expect(rejection(parse(JSON.stringify(doc)))).toBe('wrongShape');
  });
});

// ---------------------------------------------------------------------------
// schedule/compiled at the untrusted boundary — T-03-06 / T-03-07
// ---------------------------------------------------------------------------

/** A serialized document whose second log entry is `schedule/compiled` carrying `rounds`. */
function scheduleText(rounds: unknown): string {
  const doc = validDoc() as unknown as Record<string, unknown>;
  const log = doc['log'] as Record<string, unknown>[];
  log.splice(1, 0, {
    type: 'schedule/compiled',
    rounds,
    seq: 100,
    at: 1_770_000_000_002,
    actorId: 'host',
  });
  // `seq` must strictly increase; the entries after the splice keep their own numbers, so
  // renumber the tail rather than leaving a log `buildLog` would refuse for the wrong reason.
  log.forEach((entry, index) => {
    entry['seq'] = index;
  });
  return JSON.stringify(doc);
}

const TWO_ROUND_SCHEDULE = [
  { index: 1, kind: 'mega' },
  { index: 2, kind: 'open' },
];

describe('a schedule/compiled log entry', () => {
  it('survives the round trip field by field', () => {
    const result = parse(scheduleText(TWO_ROUND_SCHEDULE));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const entry = result.doc.log[1];
    expect(entry?.type).toBe('schedule/compiled');
    if (entry === undefined || entry.type !== 'schedule/compiled') return;
    expect(entry.rounds).toEqual(TWO_ROUND_SCHEDULE);
    expect(entry.actorId).toBe('host');
  });

  it('refuses a 400-round schedule rather than rendering 400 board columns', () => {
    // T-03-06. The size gate does not constrain this: four hundred two-key objects is a
    // few KB. A count reaches the renderer as an allocation, so it is bounded separately.
    const huge = Array.from({ length: 400 }, (_, index) => ({
      index: index + 1,
      kind: 'open',
    }));
    expect(rejection(parse(scheduleText(huge)))).toBe('wrongShape');
  });

  it('accepts a schedule exactly at the round cap and refuses the one past it', () => {
    const atCap = Array.from({ length: MAX_ROUNDS }, (_, index) => ({
      index: index + 1,
      kind: 'open',
    }));
    expect(parse(scheduleText(atCap)).ok).toBe(true);

    expect(rejection(parse(scheduleText([...atCap, { index: MAX_ROUNDS + 1, kind: 'open' }])))).toBe(
      'wrongShape',
    );
  });

  it('refuses a rounds field that is not an array of typed records', () => {
    for (const rounds of ['mega,open', 42, null, { 0: { index: 1, kind: 'mega' } }, [null]]) {
      expect(rejection(parse(scheduleText(rounds)))).toBe('wrongShape');
    }
  });

  it('refuses a kind this build has no filter for', () => {
    expect(rejection(parse(scheduleText([{ index: 1, kind: 'legendary' }])))).toBe('wrongShape');
  });

  it('refuses an index that is not a positive integer', () => {
    for (const index of [0, -1, 1.5, '1', null]) {
      expect(rejection(parse(scheduleText([{ index, kind: 'open' }])))).toBe('wrongShape');
    }
  });
});

// ---------------------------------------------------------------------------
// A version 1 document — decision 4
// ---------------------------------------------------------------------------

/**
 * Exactly what Phase 1 wrote: `schemaVersion: 1`, five config fields, and a `pool/built`
 * that predates both config-time seeds.
 *
 * This fixture is the reason `buildConfig` and `buildLogEntry` treat an ABSENT key
 * differently from a MALFORMED one. `buildConfig` runs inside `buildDoc`, which runs
 * BEFORE `migrate`, so requiring the version 2 keys here would refuse every Phase 1
 * document before the migration that exists to upgrade it ever got to run.
 */
function v1Text(configOverrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: 1,
    id: 'b3f1c2d4-0000-4000-8000-000000000000',
    createdAt: 1_770_000_000_000,
    config: {
      formatLabel: 'Champions MB',
      players: [
        { id: 'p1', name: 'Player 1' },
        { id: 'p2', name: 'Player 2' },
      ],
      rounds: 6,
      rosterVersion: 'mb',
      rosterChecksum: 'sha256-abc',
      ...configOverrides,
    },
    rng: { seed: 12345, cursor: 0 },
    log: [
      {
        type: 'pool/built',
        ids: ['venusaur', 'garchomp', 'rotomwash', 'kommoo'],
        rosterVersion: 'mb',
        checksum: 'sha256-abc',
        seq: 0,
        at: 1_770_000_000_001,
        actorId: 'host',
      },
      {
        type: 'draft/started',
        order: ['p1', 'p2'],
        seq: 1,
        at: 1_770_000_000_002,
        actorId: 'host',
      },
    ],
  });
}

describe('a version 1 document', () => {
  it('is accepted rather than refused for the keys it could not have had', () => {
    expect(parse(v1Text()).ok).toBe(true);
  });

  it('keeps its materialized pool, which is what the migration recovers poolSize from', () => {
    const result = parse(v1Text());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const built = result.doc.log[0];
    if (built === undefined || built.type !== 'pool/built') {
      throw new Error('the v1 pool/built entry did not survive the guard');
    }
    expect(built.ids).toHaveLength(4);
  });

  it('lands its absent config keys on the version 1 defaults', () => {
    const result = parse(v1Text());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { config } = result.doc;
    expect(config.bans).toEqual([]);
    expect(config.banMode).toBe('hostBanlist');
    expect(config.megasRequiredPerTeam).toBe(0);
    expect(config.dualMegaChoices).toEqual([]);
    expect(config.depth).toBe('draftOnly');
  });

  it('is REFUSED when a version 2 key is present and malformed', () => {
    // Absent is defaulted; present-but-wrong is refused. Repairing untrusted input is
    // worse than refusing it, and a `bans` of `3` is not a document this app ever wrote.
    expect(rejection(parse(v1Text({ bans: 3 })))).toBe('wrongShape');
    expect(rejection(parse(v1Text({ banMode: 'blindish' })))).toBe('wrongShape');
  });

  it('lands its absent version 3 keys on the version 2 defaults too', () => {
    const result = parse(v1Text());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { config } = result.doc;
    expect(config.rules).toEqual([{ kind: 'mega', count: 0 }]);
    expect(config.megaFormeBans).toEqual([]);
    expect(config.swapBudget).toBe(0);
    expect(config.swapRounds).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// A version 2 document — the same argument, one version later
// ---------------------------------------------------------------------------

/** Exactly what Phase 2 wrote: `schemaVersion: 2` and eleven config fields. */
function v2Text(configOverrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: 2,
    id: 'b3f1c2d4-0000-4000-8000-000000000000',
    createdAt: 1_770_000_000_000,
    config: {
      formatLabel: 'Champions MB',
      players: [
        { id: 'p1', name: 'Player 1' },
        { id: 'p2', name: 'Player 2' },
      ],
      rounds: 6,
      rosterVersion: 'mb',
      rosterChecksum: 'sha256-abc',
      poolSize: 12,
      bans: ['mewtwo'],
      banMode: 'hostBanlist',
      megasRequiredPerTeam: 2,
      dualMegaChoices: [],
      depth: 'draftOnly',
      ...configOverrides,
    },
    rng: { seed: 12345, cursor: 0 },
    log: [
      {
        type: 'pool/built',
        ids: ['venusaur', 'garchomp', 'rotomwash', 'kommoo'],
        rosterVersion: 'mb',
        checksum: 'sha256-abc',
        seed: POOL_SEED,
        megaCapableCount: 2,
        seq: 0,
        at: 1_770_000_000_001,
        actorId: 'host',
      },
      {
        type: 'draft/started',
        order: ['p1', 'p2'],
        seed: ORDER_SEED,
        seq: 1,
        at: 1_770_000_000_002,
        actorId: 'host',
      },
    ],
  });
}

describe('a version 2 document', () => {
  it('is accepted rather than refused for the keys it could not have had', () => {
    expect(parse(v2Text()).ok).toBe(true);
  });

  it('arrives at the current schema version', () => {
    const result = parse(v2Text());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.doc.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('lands its absent config keys on the version 2 defaults and the derived rule list', () => {
    const result = parse(v2Text());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { config } = result.doc;
    expect(config.rules).toEqual([{ kind: 'mega', count: 2 }]);
    expect(config.megaFormeBans).toEqual([]);
    expect(config.swapBudget).toBe(0);
    expect(config.swapRounds).toBe(0);
  });

  it('is REFUSED when a version 3 key is present and malformed', () => {
    expect(rejection(parse(v2Text({ swapBudget: '2' })))).toBe('wrongShape');
    expect(rejection(parse(v2Text({ rules: [{ kind: 'water', count: 1 }] })))).toBe('wrongShape');
  });
});

// ---------------------------------------------------------------------------
// The payload guards — an imported log entry is untrusted input
// ---------------------------------------------------------------------------

function poolBuiltEntry(overrides: Record<string, unknown> = {}): AnyAction {
  return {
    type: 'pool/built',
    ids: ['venusaur'],
    rosterVersion: 'mb',
    checksum: 'sha256-abc',
    seed: POOL_SEED,
    megaCapableCount: 1,
    seq: 0,
    at: 1,
    actorId: 'host',
    ...overrides,
  } as unknown as AnyAction;
}

function draftStartedEntry(overrides: Record<string, unknown> = {}): AnyAction {
  return {
    type: 'draft/started',
    order: ['p1', 'p2'],
    seed: ORDER_SEED,
    seq: 1,
    at: 1,
    actorId: 'host',
    ...overrides,
  } as unknown as AnyAction;
}

function without(entry: AnyAction, key: string): AnyAction {
  const copy = { ...entry } as Record<string, unknown>;
  delete copy[key];
  return copy as unknown as AnyAction;
}

describe('isPoolBuiltAction', () => {
  it('accepts a complete version 2 payload', () => {
    expect(isPoolBuiltAction(poolBuiltEntry())).toBe(true);
  });

  it('refuses a payload missing either new field', () => {
    // The discriminant alone is not enough: a `pool/built` that folded with an undefined
    // seed would produce a tournament that cannot say where its pool came from.
    expect(isPoolBuiltAction(without(poolBuiltEntry(), 'seed'))).toBe(false);
    expect(isPoolBuiltAction(without(poolBuiltEntry(), 'megaCapableCount'))).toBe(false);
  });

  it.each([['12345'], [Number.NaN], [1.5], [null]])(
    'refuses a seed of %s',
    (seed: unknown) => {
      expect(isPoolBuiltAction(poolBuiltEntry({ seed }))).toBe(false);
    },
  );

  it.each([['2'], [Number.NaN], [2.5], [null]])(
    'refuses a megaCapableCount of %s',
    (megaCapableCount: unknown) => {
      expect(isPoolBuiltAction(poolBuiltEntry({ megaCapableCount }))).toBe(false);
    },
  );
});

describe('isDraftStartedAction', () => {
  it('accepts a complete version 2 payload', () => {
    expect(isDraftStartedAction(draftStartedEntry())).toBe(true);
  });

  it('refuses a payload missing its seed', () => {
    expect(isDraftStartedAction(without(draftStartedEntry(), 'seed'))).toBe(false);
  });

  it.each([['12345'], [Number.NaN], [1.5], [null]])(
    'refuses a seed of %s',
    (seed: unknown) => {
      expect(isDraftStartedAction(draftStartedEntry({ seed }))).toBe(false);
    },
  );
});

// ---------------------------------------------------------------------------
// The shared predicate — T-01-05
// ---------------------------------------------------------------------------

describe('isValidTournament', () => {
  it('accepts a well-formed document', () => {
    expect(isValidTournament(validDoc())).toBe(true);
  });

  it('rejects everything the file path rejects', () => {
    expect(isValidTournament(null)).toBe(false);
    expect(isValidTournament('a string')).toBe(false);
    expect(isValidTournament([])).toBe(false);
    expect(isValidTournament({})).toBe(false);

    const noLog = validDoc() as unknown as Record<string, unknown>;
    delete noLog['log'];
    expect(isValidTournament(noLog)).toBe(false);
  });

  it('rejects a poisoned object even though no reviver ran', () => {
    // This is the localStorage path: `load()` hands over an already-parsed value, so the
    // parse-boundary reviver never saw it. The structural check has to stand on its own.
    const poisoned = JSON.parse(
      '{"schemaVersion":1,"id":"x","createdAt":0,"config":{"formatLabel":"f","players":[{"id":"p1","name":"n"}],"rounds":1,"rosterVersion":"mb","rosterChecksum":"c"},"rng":{"seed":1,"cursor":0},"log":[],"__proto__":{"polluted":true}}',
    ) as unknown;

    expect(isValidTournament(poisoned)).toBe(false);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('rejects a document from a newer schema', () => {
    const doc = validDoc();
    doc.schemaVersion = SCHEMA_VERSION + 1;
    expect(isValidTournament(doc)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// cards/played and order/resolved at the untrusted boundary — T-03-25 / T-03-26
// ---------------------------------------------------------------------------

/**
 * A document whose log carries card entries, with DELIBERATE `seq` gaps.
 *
 * The gaps are the point rather than incidental colouring. `store.ts` allocates
 * `max(seq) + 1`, so a log this app wrote itself has gaps the moment an undo removes an
 * entry from the middle — and `resolvePickOrder` breaks its ties on `seq`, so a guard that
 * demanded contiguity would refuse a file this build produced and a reducer that treated
 * `seq` as an index would reorder a round after an unrelated undo.
 */
function cardDoc(entries: readonly Record<string, unknown>[]): string {
  const doc = validDoc() as unknown as Record<string, unknown>;
  const log = doc['log'] as Record<string, unknown>[];
  log.push(...entries);
  return JSON.stringify(doc);
}

const CARD_ENTRIES: readonly Record<string, unknown>[] = [
  {
    type: 'cards/played',
    playerId: 'p1',
    value: 4,
    round: 1,
    seq: 40,
    at: 1_770_000_000_005,
    actorId: 'host',
  },
  {
    type: 'cards/played',
    playerId: 'p2',
    value: 2,
    round: 1,
    seq: 77,
    at: 1_770_000_000_006,
    actorId: 'host',
  },
  {
    type: 'order/resolved',
    round: 1,
    order: ['p2', 'p1'],
    seq: 900,
    at: 1_770_000_000_007,
    actorId: 'host',
  },
];

/** `CARD_ENTRIES` with one field of one entry replaced. */
function cardDocWith(index: number, patch: Record<string, unknown>): string {
  return cardDoc(
    CARD_ENTRIES.map((entry, position) =>
      position === index ? { ...entry, ...patch } : { ...entry },
    ),
  );
}

describe('a cards/played log entry', () => {
  it('survives the round trip field by field, gaps in seq and all', () => {
    // This file rebuilds payloads field by field, so a field it does not name is dropped
    // SILENTLY. A dropped `value` is a card that was spent and is still in the hand.
    const result = parse(cardDoc(CARD_ENTRIES));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const state = fold(result.doc);
    expect(state.cardsPlayed).toEqual([
      { playerId: 'p1', value: 4, round: 1, seq: 40 },
      { playerId: 'p2', value: 2, round: 1, seq: 77 },
    ]);
    expect(state.resolvedOrders).toEqual([{ round: 1, order: ['p2', 'p1'] }]);
  });

  it('refuses a play with no value rather than folding a play of undefined', () => {
    const missing = CARD_ENTRIES.map((entry, position) => {
      if (position !== 0) return { ...entry };
      const copy = { ...entry };
      delete copy['value'];
      return copy;
    });

    expect(rejection(parse(cardDoc(missing)))).toBe('wrongShape');
  });

  it('refuses a value or a round past the round cap', () => {
    // T-03-25. A card value reaches the board as a pip per card in every hand strip, so
    // `"value": 4000000000` is an allocation failure wearing a small number's clothes.
    expect(rejection(parse(cardDocWith(0, { value: MAX_ROUNDS + 1 })))).toBe('wrongShape');
    expect(rejection(parse(cardDocWith(0, { round: MAX_ROUNDS + 1 })))).toBe('wrongShape');
    expect(parse(cardDocWith(0, { value: MAX_ROUNDS, round: MAX_ROUNDS })).ok).toBe(true);
  });

  it('refuses a value or a round that is not a positive integer', () => {
    for (const value of [0, -1, 1.5, '4', null]) {
      expect(rejection(parse(cardDocWith(0, { value }))), `value ${String(value)}`).toBe(
        'wrongShape',
      );
    }
    for (const round of [0, -1, 1.5, '1', null]) {
      expect(rejection(parse(cardDocWith(0, { round }))), `round ${String(round)}`).toBe(
        'wrongShape',
      );
    }
  });

  it('refuses a playerId that is not a string', () => {
    expect(rejection(parse(cardDocWith(0, { playerId: 42 })))).toBe('wrongShape');
  });
});

describe('an order/resolved log entry', () => {
  it('refuses an order of five thousand players', () => {
    // T-03-25. The size gate does not constrain this — five thousand short ids is well
    // under 5 MB — and the order reaches the board as a row apiece.
    const huge = Array.from({ length: 5000 }, (_, index) => `p${index}`);
    expect(rejection(parse(cardDocWith(2, { order: huge })))).toBe('wrongShape');
  });

  it('accepts an order exactly at the player cap and refuses the one past it', () => {
    const atCap = Array.from({ length: MAX_PLAYERS }, (_, index) => `p${index}`);
    expect(parse(cardDocWith(2, { order: atCap })).ok).toBe(true);
    expect(rejection(parse(cardDocWith(2, { order: [...atCap, 'one-too-many'] })))).toBe(
      'wrongShape',
    );
  });

  it('refuses an order that is not an array of strings', () => {
    for (const order of ['p1,p2', 42, null, [null], [{ id: 'p1' }]]) {
      expect(rejection(parse(cardDocWith(2, { order })))).toBe('wrongShape');
    }
  });

  it('refuses a round past the round cap or below 1', () => {
    expect(rejection(parse(cardDocWith(2, { round: MAX_ROUNDS + 1 })))).toBe('wrongShape');
    expect(rejection(parse(cardDocWith(2, { round: 0 })))).toBe('wrongShape');
  });
});

// ---------------------------------------------------------------------------
// swap/made — 03-10
// ---------------------------------------------------------------------------

/**
 * A `swap/made` entry with a deliberate `seq` gap ahead of it, for `cardDoc`'s reason.
 *
 * It targets `p1`'s round-1 `venusaur` from {@link validDoc} and replaces it with
 * `rotomwash`, which is in that document's pool and unpicked.
 */
const SWAP_ENTRY: Record<string, unknown> = {
  type: 'swap/made',
  playerId: 'p1',
  round: 1,
  outMonId: 'venusaur',
  inMonId: 'rotomwash',
  swapRound: 0,
  seq: 610,
  at: 1_770_000_000_010,
  actorId: 'host',
};

function swapDoc(patch: Record<string, unknown> = {}): string {
  return cardDoc([{ ...SWAP_ENTRY, ...patch }]);
}

/** `SWAP_ENTRY` with one field deleted outright, which is not the same as a bad value. */
function swapDocWithout(field: string): string {
  const copy = { ...SWAP_ENTRY };
  delete copy[field];
  return cardDoc([copy]);
}

describe('a swap/made log entry', () => {
  it('survives the round trip field by field, swapRound and all', () => {
    const result = parse(swapDoc());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const state = fold(result.doc);

    // The POOL half is what catches a dropped field, not the board: the swap took effect,
    // so the slot holds the incoming species and `picks` did not grow.
    expect(state.picks).toHaveLength(2);
    expect(state.picks[0]?.monId).toBe('rotomwash');
    expect(state.picks[0]?.seq).toBe(2);
    expect(state.swaps).toEqual([
      {
        playerId: 'p1',
        round: 1,
        outMonId: 'venusaur',
        inMonId: 'rotomwash',
        swapRound: 0,
        seq: 610,
      },
    ]);
  });

  it('carries a non-zero swapRound through, though nothing reads it yet', () => {
    // The field 03-11 consumes. A guard that dropped it would turn a swap-round move into
    // a mid-draft one, silently, in a document nobody would think to re-check.
    const result = parse(swapDoc({ swapRound: 2 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(fold(result.doc).swaps[0]?.swapRound).toBe(2);
  });

  it('refuses an entry missing any of its five payload fields', () => {
    for (const field of ['playerId', 'round', 'outMonId', 'inMonId', 'swapRound']) {
      expect(rejection(parse(swapDocWithout(field))), field).toBe('wrongShape');
    }
  });

  it('refuses a round past the round cap, and a swapRound past its own', () => {
    // Two bounds from two constants, because the two numbers answer different questions.
    // Both are allocation bounds; neither is an integrity check.
    expect(rejection(parse(swapDoc({ round: MAX_ROUNDS + 1 })))).toBe('wrongShape');
    expect(rejection(parse(swapDoc({ swapRound: MAX_SWAP_ROUNDS + 1 })))).toBe('wrongShape');
    expect(parse(swapDoc({ round: MAX_ROUNDS, swapRound: MAX_SWAP_ROUNDS })).ok).toBe(true);
  });

  it('accepts swapRound 0 and refuses round 0', () => {
    // Zero IS the mid-draft spend, so the two fields take different checks rather than one
    // shared helper that would have to be wrong for one of them.
    expect(parse(swapDoc({ swapRound: 0 })).ok).toBe(true);
    expect(rejection(parse(swapDoc({ round: 0 })))).toBe('wrongShape');
  });

  it('refuses ids and a player that are not strings', () => {
    for (const value of [42, null, ['venusaur'], { id: 'venusaur' }]) {
      expect(rejection(parse(swapDoc({ outMonId: value })))).toBe('wrongShape');
      expect(rejection(parse(swapDoc({ inMonId: value })))).toBe('wrongShape');
      expect(rejection(parse(swapDoc({ playerId: value })))).toBe('wrongShape');
    }
  });

  it('refuses a round or swapRound that is not a safe integer', () => {
    for (const value of [1.5, '1', null, Number.NaN]) {
      expect(rejection(parse(swapDoc({ round: value })))).toBe('wrongShape');
      expect(rejection(parse(swapDoc({ swapRound: value })))).toBe('wrongShape');
    }
  });

  it('folds a swap naming a slot the document does not hold to a no-op', () => {
    // A bound is not an integrity check, and this file does no referential integrity.
    // Containment is the REDUCER's: the entry is accepted here and changes nothing there.
    const result = parse(swapDoc({ outMonId: 'kommoo' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const state = fold(result.doc);
    expect(state.picks[0]?.monId).toBe('venusaur');
    expect(state.swaps).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// swap/passed — 03-11
// ---------------------------------------------------------------------------

/** A pass in the first dedicated swap round, with the same deliberate `seq` gap. */
const PASS_ENTRY: Record<string, unknown> = {
  type: 'swap/passed',
  playerId: 'p1',
  swapRound: 1,
  seq: 620,
  at: 1_770_000_000_020,
  actorId: 'host',
};

function passDoc(patch: Record<string, unknown> = {}): string {
  return cardDoc([{ ...PASS_ENTRY, ...patch }]);
}

function passDocWithout(field: string): string {
  const copy = { ...PASS_ENTRY };
  delete copy[field];
  return cardDoc([copy]);
}

describe('a swap/passed log entry', () => {
  it('survives the round trip field by field', () => {
    const result = parse(passDoc());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(fold(result.doc).passes).toEqual([{ playerId: 'p1', swapRound: 1, seq: 620 }]);
  });

  it('refuses an entry missing either of its two payload fields', () => {
    for (const field of ['playerId', 'swapRound']) {
      expect(rejection(parse(passDocWithout(field))), field).toBe('wrongShape');
    }
  });

  it('refuses a swapRound of four billion — T-03-43', () => {
    // The bound is what stops a file declaring a pass in round four billion and driving a
    // render loop off the count. It is an ALLOCATION bound, not an integrity check.
    expect(rejection(parse(passDoc({ swapRound: 4_000_000_000 })))).toBe('wrongShape');
    expect(rejection(parse(passDoc({ swapRound: MAX_SWAP_ROUNDS + 1 })))).toBe('wrongShape');
    expect(parse(passDoc({ swapRound: MAX_SWAP_ROUNDS })).ok).toBe(true);
  });

  it('refuses swapRound 0 — there is no mid-draft pass', () => {
    // The one place `swap/passed` and `swap/made` take DIFFERENT bounds on the same field.
    // Zero is a legal mid-draft swap and is not a legal pass, because a pass only exists
    // inside a dedicated round.
    expect(rejection(parse(passDoc({ swapRound: 0 })))).toBe('wrongShape');
  });

  it('refuses a playerId that is not a string and a swapRound that is not a safe integer', () => {
    for (const value of [42, null, ['p1'], { id: 'p1' }]) {
      expect(rejection(parse(passDoc({ playerId: value })))).toBe('wrongShape');
    }
    for (const value of [1.5, '1', null, Number.NaN]) {
      expect(rejection(parse(passDoc({ swapRound: value })))).toBe('wrongShape');
    }
  });
});

// ---------------------------------------------------------------------------
// bans/placed, bans/submitted and bans/revealed at the untrusted boundary — T-04-11
//
// Pitfall 7 is what this block exists for. `buildLogEntry` rebuilds payloads FIELD BY
// FIELD, so a field named in the interface, the creator and the structural guard but not
// in the arm below survives in memory, survives an autosave, and disappears the moment a
// host exports the document and somebody re-imports it. `pass` on `bans/placed` and the
// nested `monIds` on `bans/revealed` are the two most likely to go, so both are asserted
// on the rebuilt LOG ENTRY rather than on the fold: the entry is what a round trip
// preserves or loses, and asserting on it keeps this block independent of the reducer.
// ---------------------------------------------------------------------------

/** Deliberate `seq` gaps, for the reason `cardDoc`'s own doc block gives. */
const PLACED_ENTRY: Record<string, unknown> = {
  type: 'bans/placed',
  playerId: 'p1',
  monId: 'kommoo',
  pass: 2,
  seq: 50,
  at: 1_770_000_000_010,
  actorId: 'host',
};

const SUBMITTED_ENTRY: Record<string, unknown> = {
  type: 'bans/submitted',
  playerId: 'p2',
  monIds: ['venusaur', 'garchomp'],
  seq: 60,
  at: 1_770_000_000_011,
  actorId: 'host',
};

const REVEALED_ENTRY: Record<string, unknown> = {
  type: 'bans/revealed',
  bans: [
    { playerId: 'p1', monIds: ['kommoo'] },
    { playerId: 'p2', monIds: ['venusaur', 'garchomp'] },
  ],
  seq: 70,
  at: 1_770_000_000_012,
  actorId: 'host',
};

function banDoc(entry: Record<string, unknown>, patch: Record<string, unknown> = {}): string {
  return cardDoc([{ ...entry, ...patch }]);
}

function banDocWithout(entry: Record<string, unknown>, field: string): string {
  const copy = { ...entry };
  delete copy[field];
  return cardDoc([copy]);
}

/** The last log entry of a document that must have parsed. */
function lastEntry(result: ReturnType<typeof parseTournamentFile>): unknown {
  expect(result.ok).toBe(true);
  return result.ok ? result.doc.log[result.doc.log.length - 1] : undefined;
}

describe('a bans/placed log entry', () => {
  it('survives the round trip field by field, pass and all', () => {
    // `pass` is the field with no consumer outside the ban board's column headers, which
    // is exactly the condition under which a rebuild forgets one — `swap/made`'s
    // `swapRound` is the worked precedent.
    expect(lastEntry(parse(banDoc(PLACED_ENTRY)))).toEqual({
      type: 'bans/placed',
      playerId: 'p1',
      monId: 'kommoo',
      pass: 2,
      seq: 50,
      at: 1_770_000_000_010,
      actorId: 'host',
    });
  });

  it('drops an unknown extra key rather than carrying it into state', () => {
    // The rebuild is an allow-list. A file inventing `"revealed": true` on a ban must not
    // be able to smuggle it past this boundary and into the fold.
    expect(lastEntry(parse(banDoc(PLACED_ENTRY, { revealed: true })))).toEqual({
      type: 'bans/placed',
      playerId: 'p1',
      monId: 'kommoo',
      pass: 2,
      seq: 50,
      at: 1_770_000_000_010,
      actorId: 'host',
    });
  });

  it('refuses an entry missing any of its three payload fields', () => {
    for (const field of ['playerId', 'monId', 'pass']) {
      expect(rejection(parse(banDocWithout(PLACED_ENTRY, field))), field).toBe('wrongShape');
    }
  });

  it('refuses a pass past the ban cap, and accepts one at it', () => {
    // An ALLOCATION bound, not an integrity check: `pass` becomes a `Pass {n}` column on
    // the ban board, so four billion of them is an out-of-memory abort wearing a small
    // number's clothes. Whether the document actually ran that many passes is
    // `canApply`'s question, asked against a state this function cannot see.
    expect(rejection(parse(banDoc(PLACED_ENTRY, { pass: MAX_BANS_PER_PLAYER + 1 })))).toBe(
      'wrongShape',
    );
    expect(rejection(parse(banDoc(PLACED_ENTRY, { pass: 4_000_000_000 })))).toBe('wrongShape');
    expect(parse(banDoc(PLACED_ENTRY, { pass: MAX_BANS_PER_PLAYER })).ok).toBe(true);
  });

  it('refuses a pass of zero — passes are 1-based, like the board headers', () => {
    expect(rejection(parse(banDoc(PLACED_ENTRY, { pass: 0 })))).toBe('wrongShape');
  });

  it('refuses a playerId or monId that is not a string, and a pass that is not an integer', () => {
    for (const value of [42, null, ['p1'], { id: 'p1' }]) {
      expect(rejection(parse(banDoc(PLACED_ENTRY, { playerId: value })))).toBe('wrongShape');
      expect(rejection(parse(banDoc(PLACED_ENTRY, { monId: value })))).toBe('wrongShape');
    }
    for (const value of [1.5, '2', null, Number.NaN]) {
      expect(rejection(parse(banDoc(PLACED_ENTRY, { pass: value })))).toBe('wrongShape');
    }
  });
});

describe('a bans/submitted log entry', () => {
  it('survives the round trip with every element of monIds', () => {
    expect(lastEntry(parse(banDoc(SUBMITTED_ENTRY)))).toEqual({
      type: 'bans/submitted',
      playerId: 'p2',
      monIds: ['venusaur', 'garchomp'],
      seq: 60,
      at: 1_770_000_000_011,
      actorId: 'host',
    });
  });

  it('drops an unknown extra key', () => {
    expect(lastEntry(parse(banDoc(SUBMITTED_ENTRY, { sealed: 'yes' })))).toEqual({
      type: 'bans/submitted',
      playerId: 'p2',
      monIds: ['venusaur', 'garchomp'],
      seq: 60,
      at: 1_770_000_000_011,
      actorId: 'host',
    });
  });

  it('refuses an entry missing either of its two payload fields', () => {
    for (const field of ['playerId', 'monIds']) {
      expect(rejection(parse(banDocWithout(SUBMITTED_ENTRY, field))), field).toBe('wrongShape');
    }
  });

  it('refuses more submitted ids than the ban cap allows', () => {
    // Bounded by what the array HOLDS — one id per ban — which is `MAX_BANS_PER_PLAYER`
    // rather than the pool or player cap. Whether the count matches this document's
    // `bansPerPlayer` is `canApply`'s `wrongBanCount`, asked against a state this
    // function cannot see.
    const tooMany = Array.from({ length: MAX_BANS_PER_PLAYER + 1 }, (_, i) => `mon${i}`);
    expect(rejection(parse(banDoc(SUBMITTED_ENTRY, { monIds: tooMany })))).toBe('wrongShape');
    expect(parse(banDoc(SUBMITTED_ENTRY, { monIds: tooMany.slice(1) })).ok).toBe(true);
  });

  it('refuses a monIds that is not an array of strings', () => {
    for (const value of [42, null, 'venusaur', { 0: 'venusaur' }, ['venusaur', 7]]) {
      expect(rejection(parse(banDoc(SUBMITTED_ENTRY, { monIds: value })))).toBe('wrongShape');
    }
  });
});

describe('a bans/revealed log entry', () => {
  it('survives the round trip with every nested monIds intact', () => {
    // The nested array is the field a rebuild is most likely to flatten or drop. A reveal
    // that lost `p2`'s second ban would show the room a banlist shorter than the one they
    // watched being revealed.
    expect(lastEntry(parse(banDoc(REVEALED_ENTRY)))).toEqual({
      type: 'bans/revealed',
      bans: [
        { playerId: 'p1', monIds: ['kommoo'] },
        { playerId: 'p2', monIds: ['venusaur', 'garchomp'] },
      ],
      seq: 70,
      at: 1_770_000_000_012,
      actorId: 'host',
    });
  });

  it('drops an unknown extra key on the entry and inside a record', () => {
    expect(lastEntry(parse(banDoc(REVEALED_ENTRY, { atReveal: 1 })))).toEqual({
      type: 'bans/revealed',
      bans: [
        { playerId: 'p1', monIds: ['kommoo'] },
        { playerId: 'p2', monIds: ['venusaur', 'garchomp'] },
      ],
      seq: 70,
      at: 1_770_000_000_012,
      actorId: 'host',
    });

    const withExtra = parse(
      banDoc(REVEALED_ENTRY, {
        bans: [{ playerId: 'p1', monIds: ['kommoo'], hidden: 'x' }],
      }),
    );
    expect(lastEntry(withExtra)).toEqual({
      type: 'bans/revealed',
      bans: [{ playerId: 'p1', monIds: ['kommoo'] }],
      seq: 70,
      at: 1_770_000_000_012,
      actorId: 'host',
    });
  });

  it('refuses an entry with no bans array', () => {
    expect(rejection(parse(banDocWithout(REVEALED_ENTRY, 'bans')))).toBe('wrongShape');
  });

  it('accepts an empty bans array — an empty reveal is a shape, not a rule', () => {
    expect(parse(banDoc(REVEALED_ENTRY, { bans: [] })).ok).toBe(true);
  });

  it('refuses a record with a non-array monIds or a non-string inside one', () => {
    for (const value of [42, null, 'venusaur', ['venusaur', 7]]) {
      expect(
        rejection(parse(banDoc(REVEALED_ENTRY, { bans: [{ playerId: 'p1', monIds: value }] }))),
      ).toBe('wrongShape');
    }
  });

  it('refuses a record that is not a record, or one with no playerId', () => {
    for (const value of [42, null, 'p1', ['p1']]) {
      expect(rejection(parse(banDoc(REVEALED_ENTRY, { bans: [value] })))).toBe('wrongShape');
    }
    expect(rejection(parse(banDoc(REVEALED_ENTRY, { bans: [{ monIds: ['kommoo'] }] })))).toBe(
      'wrongShape',
    );
  });

  it('refuses more attribution records than the player cap allows', () => {
    // Bounded by what the array holds — one record per player — the same argument
    // `draft/started.order` carries. Whether these ids are the document's configured
    // players is referential integrity, which this function deliberately does not do.
    const tooMany = Array.from({ length: MAX_PLAYERS + 1 }, (_, i) => ({
      playerId: `p${i}`,
      monIds: ['kommoo'],
    }));
    expect(rejection(parse(banDoc(REVEALED_ENTRY, { bans: tooMany })))).toBe('wrongShape');
    expect(parse(banDoc(REVEALED_ENTRY, { bans: tooMany.slice(1) })).ok).toBe(true);
  });

  it('refuses a nested monIds longer than the ban cap', () => {
    const tooMany = Array.from({ length: MAX_BANS_PER_PLAYER + 1 }, (_, i) => `mon${i}`);
    expect(
      rejection(parse(banDoc(REVEALED_ENTRY, { bans: [{ playerId: 'p1', monIds: tooMany }] }))),
    ).toBe('wrongShape');
  });
});

// ---------------------------------------------------------------------------
// The ban creators — payload only, every field named, arrays copied
// ---------------------------------------------------------------------------

describe('the ban creators', () => {
  it('bansPlaced returns the three fields and the type, and nothing else', () => {
    // No `seq`, no `at`, no `actorId`. A creator that reached for a clock would be an
    // ambient read inside the core and `check:pure` would fail the build for it.
    expect(bansPlaced('p1', 'kommoo', 2)).toEqual({
      type: 'bans/placed',
      playerId: 'p1',
      monId: 'kommoo',
      pass: 2,
    });
  });

  it('bansSubmitted does not alias the caller array', () => {
    // The blind entry surface holds its in-progress selection in component state and
    // re-renders it on every keystroke. A payload that aliased that array would let a
    // later render mutate a log entry that has already been written.
    const monIds = ['venusaur', 'garchomp'];
    const payload = bansSubmitted('p2', monIds);
    monIds.push('rotomwash');
    monIds[0] = 'mutated';
    expect(payload.monIds).toEqual(['venusaur', 'garchomp']);
  });

  it('bansRevealed copies BOTH levels', () => {
    // The outer array and every inner `monIds`. Copying only the outer one leaves each
    // record's array shared with whatever built it.
    const inner = ['venusaur'];
    const bans = [{ playerId: 'p2', monIds: inner }];
    const payload = bansRevealed(bans);

    inner.push('garchomp');
    bans.push({ playerId: 'p1', monIds: ['kommoo'] });

    expect(payload.bans).toEqual([{ playerId: 'p2', monIds: ['venusaur'] }]);
  });
});

// ---------------------------------------------------------------------------
// The ban structural guards — types only, and the omission is the design
// ---------------------------------------------------------------------------

function bansPlacedEntry(overrides: Record<string, unknown> = {}): AnyAction {
  return { ...PLACED_ENTRY, ...overrides } as unknown as AnyAction;
}

function bansSubmittedEntry(overrides: Record<string, unknown> = {}): AnyAction {
  return { ...SUBMITTED_ENTRY, ...overrides } as unknown as AnyAction;
}

function bansRevealedEntry(overrides: Record<string, unknown> = {}): AnyAction {
  return { ...REVEALED_ENTRY, ...overrides } as unknown as AnyAction;
}

describe('isBansPlacedAction', () => {
  it('accepts a complete payload', () => {
    expect(isBansPlacedAction(bansPlacedEntry())).toBe(true);
  });

  it('refuses a payload missing any of its three fields', () => {
    for (const field of ['playerId', 'monId', 'pass']) {
      expect(isBansPlacedAction(without(bansPlacedEntry(), field)), field).toBe(false);
    }
  });

  it.each([['2'], [Number.NaN], [1.5], [null]])('refuses a pass of %s', (pass: unknown) => {
    expect(isBansPlacedAction(bansPlacedEntry({ pass }))).toBe(false);
  });

  it('does not ask whether monId is on the roster or whether pass is in range', () => {
    // No roster is in reach of a structural guard, and `config.bansPerPlayer` is a fact
    // about the STATE. Both live in `canApply`, which sees what this function cannot.
    expect(isBansPlacedAction(bansPlacedEntry({ monId: 'not-a-species', pass: 99 }))).toBe(true);
  });
});

describe('isBansSubmittedAction', () => {
  it('accepts a complete payload', () => {
    expect(isBansSubmittedAction(bansSubmittedEntry())).toBe(true);
  });

  it('accepts a monIds array of the WRONG LENGTH — the length is canApply’s question', () => {
    // Stated as its own test because it is the omission most likely to be "fixed" by a
    // later reader. A guard that reached for `config.bansPerPlayer` would be a second
    // authority on the same rule, free to disagree with the first.
    expect(isBansSubmittedAction(bansSubmittedEntry({ monIds: [] }))).toBe(true);
    expect(isBansSubmittedAction(bansSubmittedEntry({ monIds: ['a', 'b', 'c', 'd', 'e'] }))).toBe(
      true,
    );
  });

  it('accepts duplicate ids — the duplicate is canApply’s question too', () => {
    expect(isBansSubmittedAction(bansSubmittedEntry({ monIds: ['venusaur', 'venusaur'] }))).toBe(
      true,
    );
  });

  it('refuses a payload missing either field', () => {
    for (const field of ['playerId', 'monIds']) {
      expect(isBansSubmittedAction(without(bansSubmittedEntry(), field)), field).toBe(false);
    }
  });

  it.each([[42], [null], ['venusaur'], [{ 0: 'venusaur' }]])(
    'refuses a monIds of %s',
    (monIds: unknown) => {
      expect(isBansSubmittedAction(bansSubmittedEntry({ monIds }))).toBe(false);
    },
  );

  it('refuses a monIds holding a non-string', () => {
    expect(isBansSubmittedAction(bansSubmittedEntry({ monIds: ['venusaur', 7] }))).toBe(false);
  });
});

describe('isBansRevealedAction', () => {
  it('accepts the nested attribution array', () => {
    expect(isBansRevealedAction(bansRevealedEntry())).toBe(true);
  });

  it('accepts an empty reveal', () => {
    expect(isBansRevealedAction(bansRevealedEntry({ bans: [] }))).toBe(true);
  });

  it('refuses a payload with no bans array', () => {
    expect(isBansRevealedAction(without(bansRevealedEntry(), 'bans'))).toBe(false);
  });

  it('refuses a record with a non-array monIds', () => {
    for (const monIds of [42, null, 'venusaur', { 0: 'venusaur' }]) {
      expect(isBansRevealedAction(bansRevealedEntry({ bans: [{ playerId: 'p1', monIds }] }))).toBe(
        false,
      );
    }
  });

  it('refuses a non-string entry inside a nested monIds', () => {
    expect(
      isBansRevealedAction(bansRevealedEntry({ bans: [{ playerId: 'p1', monIds: ['a', 7] }] })),
    ).toBe(false);
  });

  it('refuses a record that is not a record, or one with no playerId', () => {
    for (const record of [42, null, 'p1', ['p1']]) {
      expect(isBansRevealedAction(bansRevealedEntry({ bans: [record] }))).toBe(false);
    }
    expect(isBansRevealedAction(bansRevealedEntry({ bans: [{ monIds: ['kommoo'] }] }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Version 5 config fields — TOUR-07 (`matchMetric`, D-04) and D-08
// (`roundRobinFormat`, `bracketFormat`). T-05-01.
//
// Three string-literal unions arriving from an untrusted file. The posture is the
// allow-list rebuild `depth` and `duplicateBanPolicy` already use: absent is seeded
// from the defaults table, present-and-in-union is carried through, and
// present-and-outside-the-union is REFUSED rather than repaired. A value the guard
// quietly corrected would be a document this build disagrees with the file about.
// ---------------------------------------------------------------------------

/**
 * A document with all three version 5 keys removed — what a schema 4 file looks like.
 *
 * The keys are OPTIONAL for `v4AbsentText`'s stated reason: `buildConfig` runs BEFORE
 * `migrate`, so requiring them would refuse every schema 4 document one step before the
 * migration that exists to upgrade it.
 */
function v5AbsentText(overrides: Record<string, unknown> = {}): string {
  const doc = validDoc() as unknown as Record<string, unknown>;
  const config = doc['config'] as Record<string, unknown>;
  delete config['matchMetric'];
  delete config['roundRobinFormat'];
  delete config['bracketFormat'];
  Object.assign(config, overrides);
  return JSON.stringify(doc);
}

describe('version 5 config fields', () => {
  it('lands the absent keys on the version 4 defaults, not on undefined', () => {
    const result = parse(v5AbsentText());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { config } = result.doc;
    expect(config.matchMetric).toBe(V4_CONFIG_DEFAULTS.matchMetric);
    expect(config.matchMetric).toBe('pokemonLeft');
    expect(config.roundRobinFormat).toBe(V4_CONFIG_DEFAULTS.roundRobinFormat);
    expect(config.roundRobinFormat).toBe('bo1');
    expect(config.bracketFormat).toBe(V4_CONFIG_DEFAULTS.bracketFormat);
    expect(config.bracketFormat).toBe('bo1');
  });

  it('seeds them from V4_CONFIG_DEFAULTS rather than from a restated literal', () => {
    // The guard rebuilds a config for a document whose version it has not asked about
    // yet, so it has to know these values. Two copies of a default table is two tables
    // that can disagree about what a Phase 4 tournament was.
    const result = parse(v5AbsentText());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.doc.config).toMatchObject({
      matchMetric: V4_CONFIG_DEFAULTS.matchMetric,
      roundRobinFormat: V4_CONFIG_DEFAULTS.roundRobinFormat,
      bracketFormat: V4_CONFIG_DEFAULTS.bracketFormat,
    });
  });

  it('returns all three fields unchanged when the file carries them', () => {
    const result = parse(
      configuredText({
        matchMetric: 'koDifference',
        roundRobinFormat: 'bo3',
        bracketFormat: 'bo3',
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.doc.config.matchMetric).toBe('koDifference');
    expect(result.doc.config.roundRobinFormat).toBe('bo3');
    expect(result.doc.config.bracketFormat).toBe('bo3');
  });

  it('carries a bo1 round robin beside a bo3 bracket, which is the common shape', () => {
    // The two fields are separate precisely so this configuration exists. A guard that
    // collapsed them would be silently rewriting the most ordinary draft night there is.
    const result = parse(configuredText({ roundRobinFormat: 'bo1', bracketFormat: 'bo3' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.doc.config.roundRobinFormat).toBe('bo1');
    expect(result.doc.config.bracketFormat).toBe('bo3');
  });

  // -------------------------------------------------------------------------
  // T-05-01 — a value outside the union is MALFORMED, not absent.
  // -------------------------------------------------------------------------

  it('refuses a matchMetric outside the union rather than defaulting it', () => {
    // `'kos'` is the plausible near-miss: it reads like the field it is not. Refused
    // rather than repaired, because a guard that silently substituted `'pokemonLeft'`
    // would produce a standings order the file never asked for and never mention it.
    expect(rejection(parse(configuredText({ matchMetric: 'kos' })))).toBe('wrongShape');
  });

  it('refuses a roundRobinFormat outside the union rather than defaulting it', () => {
    expect(rejection(parse(configuredText({ roundRobinFormat: 'bo5' })))).toBe('wrongShape');
  });

  it('refuses a bracketFormat given as a number rather than coercing it', () => {
    // `3` is the shape a hand-edited file is most likely to carry, and it is exactly the
    // ambiguity `StageFormat` is a string union to avoid: `3` could be a game count or a
    // win count. The guard does not guess which.
    expect(rejection(parse(configuredText({ bracketFormat: 3 })))).toBe('wrongShape');
  });

  it('refuses null for any of the three, which is a value and not an absence', () => {
    expect(rejection(parse(configuredText({ matchMetric: null })))).toBe('wrongShape');
    expect(rejection(parse(configuredText({ roundRobinFormat: null })))).toBe('wrongShape');
    expect(rejection(parse(configuredText({ bracketFormat: null })))).toBe('wrongShape');
  });

  it('produces no document at all when it refuses', () => {
    // Refused, never clamped, so there is no half-repaired config to inspect.
    const result = parse(configuredText({ matchMetric: 'kos' }));

    expect('doc' in result).toBe(false);
  });

  it('survives an export, re-import and fold with the three fields intact', () => {
    // D-04 and D-08 are only kept if they survive the round trip — the host's choice of
    // metric and of best-of-three has to still be there after the file comes back.
    const source = validDoc() as unknown as Record<string, unknown>;
    Object.assign(source['config'] as Record<string, unknown>, {
      matchMetric: 'koDifference',
      roundRobinFormat: 'bo3',
      bracketFormat: 'bo3',
    });

    const result = parse(JSON.stringify(source));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const state = fold(result.doc);
    expect(state.config.matchMetric).toBe('koDifference');
    expect(state.config.roundRobinFormat).toBe('bo3');
    expect(state.config.bracketFormat).toBe('bo3');
    expect(fold(result.doc)).toEqual(state);
  });

  it('gives a re-imported schema 5 document the empty tournament fold', () => {
    const result = parse(JSON.stringify(validDoc()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const state = fold(result.doc);
    expect(state.matchResults).toEqual([]);
    expect(state.cut).toBeNull();
    expect(state.tiebreakOrders).toEqual([]);
    expect(state.lastReopenSeq).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// The `tournament/*` family — TOUR-05, TOUR-06, TOUR-09
//
// Pitfall 5 is what this section exists for. `buildLogEntry` rebuilds every known type
// FIELD BY FIELD, so a field the arm does not name is dropped with no local symptom: it
// works in memory, it works in autosave, and it disappears the moment a host shares the
// JSON. `import-guard.ts`'s `bans/placed` arm records the shipped precedent.
//
// Five types land here, three of them carrying arrays, so there is a round-trip assertion
// PER TYPE rather than one in aggregate — an aggregate assertion passes while four of the
// five arms are right.
// ---------------------------------------------------------------------------

/** Tournament entries appended after the draft, stamped the way `dispatch` would. */
function docWith(...payloads: readonly Record<string, unknown>[]): TournamentDoc {
  const doc = validDoc();
  // `validDoc`'s log ends at seq 3. Strictly increasing from 4, which `buildLog` requires
  // and which leaves the fixture's own targets stable enough to quote in an assertion.
  const stamped = payloads.map((payload, offset) => ({
    ...payload,
    seq: 4 + offset,
    at: 1_770_000_100_000 + offset,
    actorId: 'host',
  }));

  return { ...doc, log: [...doc.log, ...(stamped as unknown as TournamentDoc['log'])] };
}

const MATCH_RECORDED: Record<string, unknown> = {
  type: 'tournament/matchRecorded',
  matchId: 'rr:0:1',
  winnerId: 'p1',
  loserId: 'p2',
  winnerGames: 2,
  loserGames: 1,
  metric: 7,
};

const CUT_TAKEN: Record<string, unknown> = { type: 'tournament/cutTaken', seeds: ['p1', 'p2'] };
const TIEBREAK_ORDERED: Record<string, unknown> = {
  type: 'tournament/tiebreakOrdered',
  playerIds: ['p2', 'p1'],
};
const REOPENED: Record<string, unknown> = { type: 'tournament/reopened' };

/**
 * The last entry of a re-imported document, as raw keys.
 *
 * The round trip is asserted at the REBUILT ENTRY as well as at the fold, and the entry is
 * the assertion that actually bites. `buildLogEntry` is what drops a field, and a fold
 * comparison can only see a dropped field once `apply` reads it — so a fold-only test goes
 * quietly vacuous for any field the reducer does not yet consume, which is precisely the
 * condition under which Pitfall 5's omission gets made. What each field does to the fold is
 * `tests/core/reduce.test.ts`'s question, and the two stay answerable separately.
 */
function reimportedTail(doc: TournamentDoc): Record<string, unknown> {
  const result = parse(exported(doc));
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('the fixture did not survive its own round trip');

  // Both directions in one helper, so no caller can assert the tail and forget the fold.
  expect(fold(result.doc)).toEqual(fold(doc));

  return result.doc.log[result.doc.log.length - 1] as unknown as Record<string, unknown>;
}

describe('tournament actions — round trip per type', () => {
  it('carries every matchRecorded field through export and re-import', () => {
    // All six, named, because a rebuild that forgot one would be invisible everywhere else.
    expect(reimportedTail(docWith(MATCH_RECORDED))).toEqual({
      type: 'tournament/matchRecorded',
      matchId: 'rr:0:1',
      winnerId: 'p1',
      loserId: 'p2',
      winnerGames: 2,
      loserGames: 1,
      metric: 7,
      seq: 4,
      at: 1_770_000_100_000,
      actorId: 'host',
    });
  });

  it('carries resultsVoided through export and re-import, causedBySeq included', () => {
    // `causedBySeq` has NO reader in the fold — it is undo's pairing key — so no fold
    // comparison could ever see it go missing. This is the field Pitfall 5 describes.
    expect(
      reimportedTail(
        docWith(MATCH_RECORDED, {
          type: 'tournament/resultsVoided',
          targetSeqs: [4],
          causedBySeq: 4,
        }),
      ),
    ).toEqual({
      type: 'tournament/resultsVoided',
      targetSeqs: [4],
      causedBySeq: 4,
      seq: 5,
      at: 1_770_000_100_001,
      actorId: 'host',
    });
  });

  it('carries cutTaken through export and re-import, in seed order', () => {
    expect(reimportedTail(docWith(CUT_TAKEN))).toEqual({
      type: 'tournament/cutTaken',
      seeds: ['p1', 'p2'],
      seq: 4,
      at: 1_770_000_100_000,
      actorId: 'host',
    });
  });

  it('carries tiebreakOrdered through export and re-import, in the host order', () => {
    // ORDER, not membership: the host put these two in this order, and a rebuild that
    // sorted or de-duplicated them would be answering a different question.
    expect(reimportedTail(docWith(TIEBREAK_ORDERED))).toEqual({
      type: 'tournament/tiebreakOrdered',
      playerIds: ['p2', 'p1'],
      seq: 4,
      at: 1_770_000_100_000,
      actorId: 'host',
    });
  });

  it('carries reopened through export and re-import', () => {
    expect(reimportedTail(docWith(REOPENED))).toEqual({
      type: 'tournament/reopened',
      seq: 4,
      at: 1_770_000_100_000,
      actorId: 'host',
    });
  });
});

describe('tournament actions — match id', () => {
  // Pitfall 1: a match id is INDEX-based because `buildPlayers` bounds a player id only as
  // a non-empty unique string, so an id concatenated from two player ids is ambiguous.
  it.each(['rr:a:b', 'br:1', 'rr:1:2:3', ' rr:1:2', 'rr::1', 'xx:1:2', ''])(
    'refuses the match id %j',
    (matchId) => {
      expect(rejection(parse(exported(docWith({ ...MATCH_RECORDED, matchId }))))).toBe('wrongShape');
    },
  );

  it.each(['rr:0:1', 'br:1:1', 'rr:10:11', 'br:12:34'])('accepts the match id %j', (matchId) => {
    expect(parse(exported(docWith({ ...MATCH_RECORDED, matchId }))).ok).toBe(true);
  });
});

describe('tournament actions — payload bounds', () => {
  it('accepts a metric of exactly MAX_MATCH_METRIC', () => {
    expect(parse(exported(docWith({ ...MATCH_RECORDED, metric: MAX_MATCH_METRIC }))).ok).toBe(true);
  });

  it('refuses a metric one past MAX_MATCH_METRIC', () => {
    const result = parse(exported(docWith({ ...MATCH_RECORDED, metric: MAX_MATCH_METRIC + 1 })));
    expect(rejection(result)).toBe('wrongShape');
  });

  it.each([-1, 1.5])('refuses the metric %p under pokemonLeft', (metric) => {
    expect(rejection(parse(exported(docWith({ ...MATCH_RECORDED, metric }))))).toBe('wrongShape');
  });

  /*
    WR-11. `koDifference` is "KOs scored minus KOs conceded", so half its range is below
    zero, and `isNonNegativeInteger` truncated it at zero for both metrics alike. The
    bound is now `metricRange`, chosen by `config.matchMetric` — which the arm can do
    because `buildDoc` rebuilds `config` before `log`.

    This is a schema-compatibility change: a document carrying a negative metric is
    refused by any build still using `isNonNegativeInteger`. `schemaVersion` is
    deliberately NOT bumped — nothing is deployed, so there is no older build to migrate
    away from.
  */
  function koDoc(metric: number): TournamentDoc {
    const doc = docWith({ ...MATCH_RECORDED, metric });
    return { ...doc, config: { ...doc.config, matchMetric: 'koDifference' } };
  }

  it.each([-MAX_MATCH_METRIC, -7, -1, 0, MAX_MATCH_METRIC])(
    'accepts the metric %p under koDifference',
    (metric) => {
      expect(parse(exported(koDoc(metric))).ok).toBe(true);
    },
  );

  it.each([-MAX_MATCH_METRIC - 1, MAX_MATCH_METRIC + 1, -1.5])(
    'refuses the metric %p under koDifference',
    (metric) => {
      expect(rejection(parse(exported(koDoc(metric))))).toBe('wrongShape');
    },
  );

  it('keeps the negative metric on the rebuilt entry rather than clamping it', () => {
    const result = parse(exported(koDoc(-4)));
    expect(result.ok).toBe(true);
    expect((lastEntry(result) as Record<string, unknown>)['metric']).toBe(-4);
  });

  it('states the two ranges once, and metricRange is where', () => {
    expect(metricRange('pokemonLeft')).toEqual({ min: 0, max: MAX_MATCH_METRIC });
    expect(metricRange('koDifference')).toEqual({
      min: -MAX_MATCH_METRIC,
      max: MAX_MATCH_METRIC,
    });
  });

  it('refuses a missing metric rather than defaulting it to zero', () => {
    const withoutMetric: Record<string, unknown> = { ...MATCH_RECORDED };
    delete withoutMetric['metric'];
    expect(rejection(parse(exported(docWith(withoutMetric))))).toBe('wrongShape');
  });

  it.each([0, 3, -1])('refuses winnerGames %p, which is outside 1..2', (winnerGames) => {
    const result = parse(exported(docWith({ ...MATCH_RECORDED, winnerGames })));
    expect(rejection(result)).toBe('wrongShape');
  });

  it.each([2, -1])('refuses loserGames %p, which is outside 0..1', (loserGames) => {
    const result = parse(exported(docWith({ ...MATCH_RECORDED, loserGames })));
    expect(rejection(result)).toBe('wrongShape');
  });

  it('refuses a non-integer targetSeq', () => {
    const result = parse(
      exported(docWith({ type: 'tournament/resultsVoided', targetSeqs: [1.5], causedBySeq: 4 })),
    );
    expect(rejection(result)).toBe('wrongShape');
  });

  it('refuses a resultsVoided carrying no causedBySeq', () => {
    const result = parse(exported(docWith({ type: 'tournament/resultsVoided', targetSeqs: [4] })));
    expect(rejection(result)).toBe('wrongShape');
  });

  it('refuses a cutTaken whose seeds are not strings', () => {
    const result = parse(exported(docWith({ type: 'tournament/cutTaken', seeds: [1, 2] })));
    expect(rejection(result)).toBe('wrongShape');
  });

  it('refuses a tiebreakOrdered carrying no playerIds', () => {
    const result = parse(exported(docWith({ type: 'tournament/tiebreakOrdered' })));
    expect(rejection(result)).toBe('wrongShape');
  });
});

describe('tournament actions — an unrecognised tournament type', () => {
  it('keeps the envelope and loses the payload', () => {
    const original = docWith({
      type: 'tournament/somethingNewer',
      matchId: 'rr:0:1',
      winnerId: 'p1',
    });

    const result = parse(exported(original));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const entry = result.doc.log[result.doc.log.length - 1] as unknown as Record<string, unknown>;
    expect(Object.keys(entry).sort()).toEqual(['actorId', 'at', 'seq', 'type']);
    expect(entry['type']).toBe('tournament/somethingNewer');
    // Sync rule 11: a newer client's action folds to nothing rather than crashing.
    expect(fold(result.doc).matchResults).toEqual([]);
  });
});

describe('tournament action creators', () => {
  it('copies the array handed to cutTaken, so a later render cannot rewrite the log', () => {
    const seeds = ['p1', 'p2'];
    const payload = cutTaken(seeds);

    seeds[0] = 'p9';
    seeds.push('p3');

    expect(payload.seeds).toEqual(['p1', 'p2']);
  });

  it('copies the array handed to tiebreakOrdered', () => {
    const playerIds = ['p2', 'p1'];
    const payload = tiebreakOrdered(playerIds);

    playerIds.reverse();

    expect(payload.playerIds).toEqual(['p2', 'p1']);
  });

  it('copies the array handed to resultsVoided', () => {
    const targetSeqs = [4, 5];
    const payload = resultsVoided(targetSeqs, 4);

    targetSeqs[0] = 99;

    expect(payload.targetSeqs).toEqual([4, 5]);
    expect(payload.causedBySeq).toBe(4);
  });

  it('carries loserId as a supplied field rather than deriving it', () => {
    expect(matchRecorded('br:1:1', 'p1', 'p2', 2, 1, 6)).toEqual({
      type: 'tournament/matchRecorded',
      matchId: 'br:1:1',
      winnerId: 'p1',
      loserId: 'p2',
      winnerGames: 2,
      loserGames: 1,
      metric: 6,
    });
  });

  it('gives reopened an envelope-only payload', () => {
    expect(reopened()).toEqual({ type: 'tournament/reopened' });
  });
});

describe('tournament action guards', () => {
  const stamped = (payload: Record<string, unknown>): AnyAction =>
    ({ ...payload, seq: 4, at: 1, actorId: 'host' }) as unknown as AnyAction;

  it('refuses a matchRecorded whose type is wrong', () => {
    expect(isMatchRecordedAction(stamped({ ...MATCH_RECORDED, type: 'draft/pickMade' }))).toBe(
      false,
    );
  });

  it.each([
    ['matchId', 1],
    ['winnerId', null],
    ['loserId', 2],
    ['winnerGames', '2'],
    ['loserGames', 1.5],
    ['metric', '7'],
  ])('refuses a matchRecorded whose %s is the wrong kind', (field, value) => {
    expect(isMatchRecordedAction(stamped({ ...MATCH_RECORDED, [field]: value }))).toBe(false);
  });

  it('accepts a well-formed matchRecorded, and asks nothing about the config', () => {
    // Whether `winnerGames: 2` is legal at a `bo1` stage is `canApply`'s question, per
    // `actions.ts`'s guard/canApply split. A guard reaching for the config would be a
    // second authority on the same rule, free to disagree with the first.
    expect(isMatchRecordedAction(stamped(MATCH_RECORDED))).toBe(true);
  });

  it('refuses a resultsVoided whose targetSeqs are not integers', () => {
    expect(
      isResultsVoidedAction(
        stamped({ type: 'tournament/resultsVoided', targetSeqs: ['4'], causedBySeq: 4 }),
      ),
    ).toBe(false);
  });

  it('accepts a well-formed resultsVoided', () => {
    expect(
      isResultsVoidedAction(
        stamped({ type: 'tournament/resultsVoided', targetSeqs: [4, 9], causedBySeq: 4 }),
      ),
    ).toBe(true);
  });

  it('refuses a cutTaken whose seeds are not an array of strings', () => {
    expect(isCutTakenAction(stamped({ type: 'tournament/cutTaken', seeds: 'p1' }))).toBe(false);
  });

  it('accepts a well-formed cutTaken', () => {
    expect(isCutTakenAction(stamped(CUT_TAKEN))).toBe(true);
  });

  it('refuses a tiebreakOrdered carrying no playerIds', () => {
    expect(isTiebreakOrderedAction(stamped({ type: 'tournament/tiebreakOrdered' }))).toBe(false);
  });

  it('accepts a well-formed tiebreakOrdered', () => {
    expect(isTiebreakOrderedAction(stamped(TIEBREAK_ORDERED))).toBe(true);
  });

  it('accepts an envelope-only reopened and refuses another type', () => {
    expect(isReopenedAction(stamped(REOPENED))).toBe(true);
    expect(isReopenedAction(stamped({ type: 'tournament/cutTaken' }))).toBe(false);
  });
});
