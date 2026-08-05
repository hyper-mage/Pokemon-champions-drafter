/**
 * SHEL-07 — randomness is seeded, stored in the document, and reproducible.
 *
 * Every test here runs with zero mocks. That is not a happy accident: it is the whole
 * reason `src/core` is forbidden from touching the clock, the network, storage, or
 * `Math.random`. A function whose output depends only on its arguments needs no test
 * double, and the day one of these tests needs one is the day the purity gate has been
 * defeated.
 */

import { describe, expect, it } from 'vitest';

import { nextInt } from '../../src/core/rng';
import { selectStartingOrder } from '../../src/core/selectors';

const SEED = 0x5f3a91c2;

describe('nextInt', () => {
  it('returns a value inside the requested half-open range', () => {
    for (let cursor = 0; cursor < 500; cursor++) {
      const draw = nextInt(SEED, cursor, 6);
      expect(draw.value).toBeGreaterThanOrEqual(0);
      expect(draw.value).toBeLessThan(6);
      expect(Number.isInteger(draw.value)).toBe(true);
    }
  });

  it('advances the cursor by exactly one', () => {
    expect(nextInt(SEED, 0, 10).cursor).toBe(1);
    expect(nextInt(SEED, 41, 10).cursor).toBe(42);
  });

  it('is a pure function of its arguments — same seed and cursor, same value', () => {
    for (let cursor = 0; cursor < 50; cursor++) {
      const first = nextInt(SEED, cursor, 1000);
      const second = nextInt(SEED, cursor, 1000);
      expect(second).toEqual(first);
    }
  });

  it('does not stand still — a run of draws is not a single repeated value', () => {
    const values = new Set<number>();
    for (let cursor = 0; cursor < 64; cursor++) {
      values.add(nextInt(SEED, cursor, 1000).value);
    }
    // A generator that returned a constant would satisfy every determinism test above.
    expect(values.size).toBeGreaterThan(32);
  });

  it('spreads across the whole range rather than favouring one bucket', () => {
    const counts = [0, 0, 0, 0, 0, 0];
    for (let cursor = 0; cursor < 6000; cursor++) {
      const index = nextInt(SEED, cursor, counts.length).value;
      counts[index] = (counts[index] ?? 0) + 1;
    }
    // 1000 expected per bucket. A wide band: this pins "no bucket is starved or
    // saturated", not a statistical quality claim the project does not need.
    for (const count of counts) {
      expect(count).toBeGreaterThan(700);
      expect(count).toBeLessThan(1300);
    }
  });

  it('rejects a non-positive range rather than returning NaN', () => {
    // `% 0` is NaN, which would flow silently into an array index and produce
    // `undefined` several call frames away. A programming error should be loud.
    expect(() => nextInt(SEED, 0, 0)).toThrow(RangeError);
    expect(() => nextInt(SEED, 0, -1)).toThrow(RangeError);
  });
});

describe('selectStartingOrder', () => {
  it('reproduces the identical order from the same seed', () => {
    const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
    expect(selectStartingOrder(SEED, players)).toEqual(selectStartingOrder(SEED, players));
  });

  it('is a permutation — every player appears exactly once', () => {
    const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
    const order = selectStartingOrder(SEED, players);
    expect([...order].sort()).toEqual([...players].sort());
  });

  it('does not depend on the order the ids arrive in', () => {
    const players = ['p1', 'p2', 'p3', 'p4'];
    const shuffledInput = ['p3', 'p1', 'p4', 'p2'];
    expect(selectStartingOrder(SEED, shuffledInput)).toEqual(selectStartingOrder(SEED, players));
  });

  it('produces different starting orders across a sample of seeds', () => {
    const players = ['p1', 'p2'];
    const seen = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      seen.add(selectStartingOrder(seed, players).join(','));
    }
    // With two players there are exactly two possible orders; both must occur, or the
    // "starting order" is a constant dressed up as a draw.
    expect(seen.size).toBe(2);
  });

  it('produces many distinct orders at eight players', () => {
    const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
    const seen = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      seen.add(selectStartingOrder(seed, players).join(','));
    }
    expect(seen.size).toBeGreaterThan(100);
  });

  it('handles the degenerate inputs without reaching for the generator', () => {
    expect(selectStartingOrder(SEED, [])).toEqual([]);
    expect(selectStartingOrder(SEED, ['solo'])).toEqual(['solo']);
  });

  it('does not mutate the array it was given', () => {
    const players = ['p4', 'p3', 'p2', 'p1'];
    const before = [...players];
    selectStartingOrder(SEED, players);
    expect(players).toEqual(before);
  });
});
