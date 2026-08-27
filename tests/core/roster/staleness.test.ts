/**
 * Snapshot staleness — REFR-03.
 *
 * Zero mocks, by construction. `isSnapshotStale` is a pure comparison of the two strings
 * it is handed; if a test in this file ever needs a fake clock, an ambient value has
 * leaked into the core and `npm run check:pure` should already have failed the build.
 * That is the whole reason the clock read lives in `src/adapters/clock.ts` and the date
 * arrives here as an argument.
 *
 * The boundary cases below are not invented dates. They are the `validUntil` values in
 * the committed `public/data/roster.index.json`, mirrored as literals so an assertion
 * moves if and only if the shipped manifest does.
 */

import { describe, expect, it } from 'vitest';

import { isSnapshotStale } from '../../../src/core/roster/staleness';

// ---------------------------------------------------------------------------
// The shipped manifest, in the shape `public/data/roster.index.json` actually has.
//
// M-A's validUntil IS M-B's validFrom. That single shared date is the evidence the
// interval is half-open, and it is why the assertions below are anchored to it rather
// than to dates chosen to make the test pass.
// ---------------------------------------------------------------------------

const MANIFEST = {
  regulations: [
    { id: 'mb', label: 'M-B', validFrom: '2026-06-17', validUntil: '2026-09-02' },
    { id: 'ma', label: 'M-A', validFrom: '2026-04-08', validUntil: '2026-06-17' },
  ],
} as const;

const MB = MANIFEST.regulations[0];
const MA = MANIFEST.regulations[1];

describe('isSnapshotStale', () => {
  it('is false inside the window, so a host mid-regulation is never warned', () => {
    expect(isSnapshotStale('2026-09-02', '2026-08-26')).toBe(false);
  });

  it('is true ON validUntil — the interval is half-open', () => {
    expect(isSnapshotStale('2026-09-02', '2026-09-02')).toBe(true);
  });

  it('is true after validUntil', () => {
    expect(isSnapshotStale('2026-09-02', '2026-09-03')).toBe(true);
  });

  it('is true on the M-A/M-B handover date, because one day cannot be live for both', () => {
    // M-A validUntil 2026-06-17 IS M-B validFrom 2026-06-17. Were the comparison `>`
    // rather than `>=`, M-A would still read as current on the day M-B began.
    expect(MA.validUntil).toBe(MB.validFrom);
    expect(isSnapshotStale(MA.validUntil, '2026-06-17')).toBe(true);
  });

  it('reports the shipped M-B snapshot current the day before it expires and stale on it', () => {
    expect(isSnapshotStale(MB.validUntil, '2026-09-01')).toBe(false);
    expect(isSnapshotStale(MB.validUntil, MB.validUntil)).toBe(true);
  });

  it('reports M-A stale for every day M-B is current', () => {
    expect(isSnapshotStale(MA.validUntil, MB.validFrom)).toBe(true);
    expect(isSnapshotStale(MA.validUntil, '2026-08-26')).toBe(true);
    expect(isSnapshotStale(MB.validUntil, '2026-08-26')).toBe(false);
  });

  it('orders across a year boundary, which is what zero-padding buys', () => {
    // Lexicographic order over a zero-padded ISO date IS chronological order. This is
    // the case that would break first if anyone reached for a numeric or locale compare.
    expect(isSnapshotStale('2027-01-01', '2026-12-31')).toBe(false);
    expect(isSnapshotStale('2027-01-01', '2027-01-01')).toBe(true);
  });

  it('orders across a month boundary with a single-digit month', () => {
    expect(isSnapshotStale('2026-10-01', '2026-09-30')).toBe(false);
    expect(isSnapshotStale('2026-10-01', '2026-10-02')).toBe(true);
  });

  it('is a function of its arguments alone, so the same pair always answers the same', () => {
    // No clock, no cache, no module state. Two calls, one answer.
    expect(isSnapshotStale(MB.validUntil, '2026-08-26')).toBe(
      isSnapshotStale(MB.validUntil, '2026-08-26'),
    );
  });
});
