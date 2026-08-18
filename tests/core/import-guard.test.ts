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
  isDraftStartedAction,
  isPoolBuiltAction,
  type AnyAction,
} from '../../src/core/actions';
import {
  isValidTournament,
  MAX_IMPORT_BYTES,
  MAX_LOG_ENTRIES,
  MAX_PLAYERS,
  MAX_POOL_IDS,
  MAX_ROUNDS,
  parseTournamentFile,
} from '../../src/core/import-guard';
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
