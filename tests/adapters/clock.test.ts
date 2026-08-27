/**
 * The clock adapter — the two ambient reads `src/core` is never allowed to make.
 *
 * No mocks and no fake timers. Freezing time here would test the freeze, not the
 * adapter; what actually needs pinning is the FORMAT, because the format is where the
 * bug lives. `toISOString` would compile, pass a casual reading, and hand a host in
 * UTC-8 drafting at 6pm tomorrow's date — which `isSnapshotStale` would then compare
 * against `validUntil` and get wrong by a day, once, in the evening, only for hosts
 * west of UTC. `src/adapters/file-io.ts` already made this call for the download
 * filename; these assertions are what stop the second caller from making it differently.
 */

import { describe, expect, it } from 'vitest';

import { now, todayIso } from '../../src/adapters/clock';

describe('todayIso', () => {
  it('is exactly ten characters in YYYY-MM-DD shape', () => {
    const today = todayIso();

    expect(today).toHaveLength(10);
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('reads LOCAL date parts, not the UTC serializer', () => {
    // Built here from the same local getters the adapter must use. On any host west of
    // UTC in the evening this differs from the UTC ISO date, and that is precisely the
    // day the staleness banner would otherwise fire early.
    const at = new Date();
    const pad = (n: number): string => String(n).padStart(2, '0');
    const local = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;

    expect(todayIso()).toBe(local);
  });

  it('zero-pads month and day, so the string sorts chronologically', () => {
    // The whole of `isSnapshotStale` rests on this: a lexicographic compare over these
    // strings is only chronological while both fields are two characters wide.
    const [, month, day] = todayIso().split('-');

    expect(month).toHaveLength(2);
    expect(day).toHaveLength(2);
  });

  it('agrees with the epoch reading beside it in the same module', () => {
    // `now()` and `todayIso()` are the two reads this file exists to contain. They must
    // describe the same instant, or a document stamped by one and judged by the other
    // disagrees with itself.
    const at = new Date(now());
    const pad = (n: number): string => String(n).padStart(2, '0');

    expect(todayIso()).toBe(`${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`);
  });
});

describe('now', () => {
  it('is an integer, so it survives JSON unchanged', () => {
    expect(Number.isInteger(now())).toBe(true);
  });
});
