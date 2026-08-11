/**
 * migrate.test.ts — PERS-07.
 *
 * There is exactly one schema version today, so the interesting assertions are all about
 * what `migrate` does with versions it has never heard of. The rule the tests pin is
 * that it declines: a tool that half-reads a document written by a build it does not
 * understand produces a tournament that looks loaded and is wrong, which is strictly
 * worse than one that says so.
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
    },
    rng: { seed: 1, cursor: 0 },
    log: [],
  };
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
  it('lists both versions this build can fold, in order', () => {
    // A list rather than a floor. Version 1 stays on it after the bump because this build
    // upgrades those documents rather than refusing them, and a `>= MIN` check could not
    // express a future build that reads 1 but not 2.
    expect([...SUPPORTED_SCHEMA_VERSIONS]).toEqual([1, 2]);
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

    // The same object, not a copy that happens to be equal. Version 1 is a passthrough,
    // and a passthrough that rebuilt the document would be doing undisclosed work.
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
  it('returns a document at version 2', () => {
    expect(migrated(v1Doc([v1PoolBuilt(4)])).schemaVersion).toBe(2);
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

  it('leaves a document that is already at version 2 alone', () => {
    const doc = docAtVersion(2);
    expect(migrated(doc)).toBe(doc);
  });
});
