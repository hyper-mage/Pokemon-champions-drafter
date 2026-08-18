/**
 * migrate.test.ts — PERS-07.
 *
 * Two things are pinned here. The first is what `migrate` does with a version it has
 * never heard of: it declines. A tool that half-reads a document written by a build it
 * does not understand produces a tournament that looks loaded and is wrong, which is
 * strictly worse than one that says so.
 *
 * The second is the arm chain. Every supported version gets one arm and one block below,
 * and a version 1 document has to reach the current version through all of them in a
 * single `migrate` call — a chain that only works one step at a time is a chain that
 * strands the oldest saves the moment a third version ships.
 */

import { describe, expect, it } from 'vitest';

import { migrate, SUPPORTED_SCHEMA_VERSIONS } from '../../src/core/migrate';
import { SCHEMA_VERSION, type TournamentDoc } from '../../src/core/model';
import { fold } from '../../src/core/reduce';

function docAtVersion(schemaVersion: number): TournamentDoc {
  return {
    schemaVersion,
    id: 'a1b2c3d4-0000-4000-8000-000000000000',
    createdAt: 1_770_000_000_000,
    config: {
      formatLabel: 'Champions MB',
      players: [{ id: 'p1', name: 'Player 1' }],
      rounds: 6,
      rosterVersion: 'mb',
      rosterChecksum: 'sha256-abc',
      poolSize: 6,
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
    rng: { seed: 1, cursor: 0 },
    log: [],
  };
}

/**
 * A `pool/built` exactly as Phase 2 wrote one — every field version 2 required, and no
 * version 3 field, because version 3 adds nothing to the log.
 */
function v2PoolBuilt(count: number): unknown {
  return {
    type: 'pool/built',
    ids: Array.from({ length: count }, (_unused, index) => `mon-${String(index)}`),
    rosterVersion: 'mb',
    checksum: 'sha256-abc',
    seed: 77,
    megaCapableCount: 9,
    seq: 0,
    at: 1_770_000_000_001,
    actorId: 'host',
  };
}

const V2_DRAFT_STARTED: unknown = {
  type: 'draft/started',
  order: ['p1', 'p2'],
  seed: 42,
  seq: 1,
  at: 1_770_000_000_002,
  actorId: 'host',
};

/**
 * A version 2 document, with the eleven config fields it had and not one more.
 *
 * The cast is the honest part of this fixture, exactly as it is for {@link v1Doc}: a v2
 * document is not a `TournamentConfig` any more, and pretending otherwise in the type
 * system would hide the gap `migrateV2ToV3` exists to close.
 */
function v2Doc(megasRequiredPerTeam: number, log: readonly unknown[]): TournamentDoc {
  return {
    schemaVersion: 2,
    id: 'a1b2c3d4-0000-4000-8000-000000000000',
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
      poolSize: 48,
      bans: ['charizard'],
      banMode: 'hostBanlist',
      megasRequiredPerTeam,
      dualMegaChoices: [{ speciesId: 'raichu', forme: 'x' }],
      depth: 'draftAndBrackets',
    },
    rng: { seed: 1, cursor: 0 },
    log: [...log],
  } as unknown as TournamentDoc;
}

/**
 * A `pool/built` exactly as Phase 1 wrote one: no `seed`, no `megaCapableCount`, because
 * neither field existed when it was written.
 */
function v1PoolBuilt(count: number): unknown {
  return {
    type: 'pool/built',
    ids: Array.from({ length: count }, (_unused, index) => `mon-${String(index)}`),
    rosterVersion: 'mb',
    checksum: 'sha256-abc',
    seq: 0,
    at: 1_770_000_000_001,
    actorId: 'host',
  };
}

const V1_DRAFT_STARTED: unknown = {
  type: 'draft/started',
  order: ['p1', 'p2'],
  seq: 1,
  at: 1_770_000_000_002,
  actorId: 'host',
};

/**
 * A version 1 document, with the five config fields it had and not one more.
 *
 * The cast is the honest part of this fixture: a v1 document is not a `TournamentDoc` any
 * more, and pretending otherwise in the type system would hide the exact gap `migrate`
 * exists to close. Two players and six rounds, so `players × rounds` is 12 and is visibly
 * NOT the pool size any of these logs record.
 */
function v1Doc(log: readonly unknown[]): TournamentDoc {
  return {
    schemaVersion: 1,
    id: 'a1b2c3d4-0000-4000-8000-000000000000',
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
    },
    rng: { seed: 1, cursor: 0 },
    log: [...log],
  } as unknown as TournamentDoc;
}

describe('SUPPORTED_SCHEMA_VERSIONS', () => {
  it('lists every version this build can fold, in order', () => {
    // A list rather than a floor. Versions 1 and 2 stay on it after each bump because
    // this build upgrades those documents rather than refusing them, and a `>= MIN` check
    // could not express a future build that reads 1 but not 2.
    expect([...SUPPORTED_SCHEMA_VERSIONS]).toEqual([1, 2, 3]);
  });

  it('includes the version this build writes', () => {
    // The two constants live in different files and would otherwise be free to drift:
    // bumping SCHEMA_VERSION without touching this list would make the app refuse every
    // document it had just written.
    expect(SUPPORTED_SCHEMA_VERSIONS).toContain(SCHEMA_VERSION);
  });
});

describe('migrate', () => {
  it('passes a current document through unchanged, by identity', () => {
    const doc = docAtVersion(SCHEMA_VERSION);
    const result = migrate(doc);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The same object, not a copy that happens to be equal. The current version is the
    // passthrough, and a passthrough that rebuilt the document would be doing
    // undisclosed work a caller comparing references would notice.
    expect(result.doc).toBe(doc);
  });

  it('refuses a newer version with a reason the UI can map to copy', () => {
    expect(migrate(docAtVersion(SCHEMA_VERSION + 1))).toEqual({
      ok: false,
      reason: 'newerSchema',
    });
    expect(migrate(docAtVersion(99))).toEqual({ ok: false, reason: 'newerSchema' });
  });

  it('refuses a version below the supported floor', () => {
    expect(migrate(docAtVersion(0))).toEqual({ ok: false, reason: 'unknownSchema' });
    expect(migrate(docAtVersion(-1))).toEqual({ ok: false, reason: 'unknownSchema' });
  });

  it('refuses a non-integer version rather than rounding it', () => {
    expect(migrate(docAtVersion(1.5)).ok).toBe(false);
    expect(migrate(docAtVersion(Number.NaN)).ok).toBe(false);
  });

  it('never returns a document alongside a refusal', () => {
    const result = migrate(docAtVersion(99));
    expect(result.ok).toBe(false);
    expect('doc' in result).toBe(false);
  });

  it('does not mutate the document it refuses', () => {
    const doc = docAtVersion(99);
    const before = JSON.stringify(doc);

    migrate(doc);

    expect(JSON.stringify(doc)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// Version 1 to 2 — decision 4
// ---------------------------------------------------------------------------

/** The migrated document, or a failed assertion naming the reason it was refused. */
function migrated(doc: TournamentDoc): TournamentDoc {
  const result = migrate(doc);
  expect(result.ok, result.ok ? '' : `refused: ${result.reason}`).toBe(true);
  if (!result.ok) throw new Error('unreachable — the assertion above already failed');
  return result.doc;
}

describe('migrateV1ToV2', () => {
  it('reaches the current version, which is now two arms away', () => {
    // The v1 arm hands off to the v2 arm inside one `migrate` call. Asserting the CURRENT
    // version rather than `2` is the point: a chain that stopped after the first arm would
    // return a document this build refuses to fold.
    expect(migrated(v1Doc([v1PoolBuilt(4)])).schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated(v1Doc([v1PoolBuilt(4)])).schemaVersion).toBe(3);
  });

  it('leaves the input byte-identical — T-02-08', () => {
    // Fresh literals, never a mutation in place. The caller is holding this object and in
    // the persistence path it is the parsed `localStorage` record itself.
    const doc = v1Doc([v1PoolBuilt(4), V1_DRAFT_STARTED]);
    const before = JSON.stringify(doc);

    migrate(doc);

    expect(JSON.stringify(doc)).toBe(before);
  });

  it('recovers poolSize from the materialized log, not from players × rounds', () => {
    // 2 players × 6 rounds is 12. The pool that was actually drawn held 235, and the log
    // is holding that number rather than an instruction to work one out.
    const doc = migrated(v1Doc([v1PoolBuilt(235), V1_DRAFT_STARTED]));

    expect(doc.config.poolSize).toBe(235);
    expect(doc.config.poolSize).not.toBe(12);
  });

  it('falls back to players × rounds when the log holds no pool/built', () => {
    expect(migrated(v1Doc([])).config.poolSize).toBe(12);
  });

  it('lands the other five fields on the version 1 defaults', () => {
    const { config } = migrated(v1Doc([v1PoolBuilt(4)]));

    expect(config.bans).toEqual([]);
    expect(config.banMode).toBe('hostBanlist');
    expect(config.megasRequiredPerTeam).toBe(0);
    expect(config.dualMegaChoices).toEqual([]);
    expect(config.depth).toBe('draftOnly');
  });

  it('keeps every field the version 1 config already had', () => {
    const { config } = migrated(v1Doc([v1PoolBuilt(4)]));

    expect(config.formatLabel).toBe('Champions MB');
    expect(config.rounds).toBe(6);
    expect(config.rosterVersion).toBe('mb');
    expect(config.rosterChecksum).toBe('sha256-abc');
    expect(config.players.map((player) => player.id)).toEqual(['p1', 'p2']);
  });

  it('folds to a POPULATED pool — the board renders, rather than coming back empty', () => {
    // The failure this pins is the quiet one. `isPoolBuiltAction` requires `seed` and
    // `megaCapableCount`, so a v1 `pool/built` left un-upgraded folds to "ignored" and the
    // restored draft opens with an empty pool, no error, and every pick unavailable.
    // `persistence.load` hands `migrate` the raw stored object, so this step is the only
    // thing standing between a Phase 1 save and that outcome.
    const doc = migrated(v1Doc([v1PoolBuilt(4), V1_DRAFT_STARTED]));
    const state = fold(doc);

    expect(state.poolIds).toHaveLength(4);
    expect(state.order).toEqual(['p1', 'p2']);
    expect(state.rosterVersion).toBe('mb');
  });

  it('records a zero seed rather than inventing one', () => {
    const built = migrated(v1Doc([v1PoolBuilt(4)])).log[0];
    if (built === undefined || built.type !== 'pool/built') {
      throw new Error('the migrated log no longer starts with pool/built');
    }

    expect(built.seed).toBe(0);
    expect(built.megaCapableCount).toBe(0);
  });

  it('wraps the version 1 Mega default as a rule list on the way through', () => {
    // `V1_CONFIG_DEFAULTS.megasRequiredPerTeam` is 0, and the v2 arm is what turns that
    // scalar into the rule list. A version 1 document therefore arrives with a rule
    // list rather than without one.
    expect(migrated(v1Doc([v1PoolBuilt(4)])).config.rules).toEqual([{ kind: 'mega', count: 0 }]);
  });
});

// ---------------------------------------------------------------------------
// Version 2 to 3 — D-01, D-02. Config only; the log is not touched.
// ---------------------------------------------------------------------------

describe('migrateV2ToV3', () => {
  it('returns a document at version 3', () => {
    expect(migrated(v2Doc(2, [v2PoolBuilt(48)])).schemaVersion).toBe(3);
  });

  it('leaves the input byte-identical', () => {
    const doc = v2Doc(2, [v2PoolBuilt(48), V2_DRAFT_STARTED]);
    const before = JSON.stringify(doc);

    migrate(doc);

    expect(JSON.stringify(doc)).toBe(before);
  });

  it('wraps megasRequiredPerTeam as exactly one mega rule', () => {
    // The scalar holds the true answer, so the rule list is DERIVED from it rather than
    // defaulted — the same reason `poolSize` is absent from V1_CONFIG_DEFAULTS.
    expect(migrated(v2Doc(2, [])).config.rules).toEqual([{ kind: 'mega', count: 2 }]);
    expect(migrated(v2Doc(0, [])).config.rules).toEqual([{ kind: 'mega', count: 0 }]);
    expect(migrated(v2Doc(6, [])).config.rules).toEqual([{ kind: 'mega', count: 6 }]);
  });

  it('keeps megasRequiredPerTeam alongside the rule it produced', () => {
    // One fact in two shapes. The scalar is still the host-facing number and the compiler
    // reads the list; dropping the scalar here would blank the config screen field.
    expect(migrated(v2Doc(2, [])).config.megasRequiredPerTeam).toBe(2);
  });

  it('lands the other three fields on the version 2 defaults', () => {
    const { config } = migrated(v2Doc(2, []));

    expect(config.megaFormeBans).toEqual([]);
    expect(config.swapBudget).toBe(0);
    expect(config.swapRounds).toBe(0);
  });

  it('keeps every field the version 2 config already had', () => {
    const { config } = migrated(v2Doc(2, []));

    expect(config.formatLabel).toBe('Champions MB');
    expect(config.rounds).toBe(6);
    expect(config.rosterVersion).toBe('mb');
    expect(config.rosterChecksum).toBe('sha256-abc');
    expect(config.poolSize).toBe(48);
    expect(config.bans).toEqual(['charizard']);
    expect(config.banMode).toBe('hostBanlist');
    expect(config.dualMegaChoices).toEqual([{ speciesId: 'raichu', forme: 'x' }]);
    expect(config.depth).toBe('draftAndBrackets');
    expect(config.players.map((player) => player.id)).toEqual(['p1', 'p2']);
  });

  it('does not rewrite the log — no entry gains, loses or changes a field', () => {
    // Unlike `migrateV1ToV2`, nothing in schema 3 makes an existing entry unfoldable, so
    // there is no log surgery to do. Splicing a synthetic `schedule/compiled` in here
    // would need a fresh `seq` and would be stamped after picks it logically precedes.
    const doc = v2Doc(2, [v2PoolBuilt(48), V2_DRAFT_STARTED]);

    expect(migrated(doc).log).toEqual(doc.log);
  });

  it('folds to a populated pool, exactly as it did before the upgrade', () => {
    const state = fold(migrated(v2Doc(2, [v2PoolBuilt(48), V2_DRAFT_STARTED])));

    expect(state.poolIds).toHaveLength(48);
    expect(state.order).toEqual(['p1', 'p2']);
    expect(state.schedule).toEqual([]);
  });

  it('leaves a document that is already at version 3 alone, by identity', () => {
    const doc = docAtVersion(3);
    expect(migrated(doc)).toBe(doc);
  });

  it('refuses version 4 rather than reading it optimistically', () => {
    expect(migrate(docAtVersion(4))).toEqual({ ok: false, reason: 'newerSchema' });
  });
});
