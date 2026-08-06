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
    },
    rng: { seed: 1, cursor: 0 },
    log: [],
  };
}

describe('SUPPORTED_SCHEMA_VERSIONS', () => {
  it('lists version 1 and nothing else', () => {
    expect([...SUPPORTED_SCHEMA_VERSIONS]).toEqual([1]);
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
