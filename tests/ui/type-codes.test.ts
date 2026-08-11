/**
 * The type map — pinned against the real committed roster.
 *
 * No `@vitest-environment` line, so this runs in `node`. Nothing here touches a DOM;
 * the map is plain data and the snapshot is a JSON import.
 *
 * The assertion that earns its keep is the key-set one. A regulation rotation that
 * introduces a nineteenth type would otherwise ship a pool where some cards silently
 * render one pill fewer than they should — `typeDisplay` returns null and `TypePill`
 * renders nothing, which is the right runtime behaviour and an invisible bug. This turns
 * it into a red build on the day `npm run build:data` runs.
 */

import { describe, expect, it } from 'vitest';

import committedSnapshot from '../../public/data/roster.mb.json';
import type { RosterSnapshot } from '../../src/core/roster/types';
import { TYPE_CODES, typeDisplay } from '../../src/ui/type-codes';

const snapshot = committedSnapshot as unknown as RosterSnapshot;

const INK_TOKENS = ['var(--type-ink-dark)', 'var(--type-ink-light)'];

function rosterTypes(): string[] {
  const seen = new Set<string>();
  for (const entry of snapshot.entries) {
    for (const type of entry.types) seen.add(type);
  }
  return [...seen].sort();
}

describe('TYPE_CODES', () => {
  it('has exactly eighteen entries', () => {
    expect(Object.keys(TYPE_CODES)).toHaveLength(18);
  });

  it('gives every type a distinct three-letter code', () => {
    const codes = Object.values(TYPE_CODES).map((display) => display.code);

    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z]{3}$/);
    }
  });

  it('covers exactly the distinct types the committed roster uses', () => {
    // Deep equality in both directions: a type in the roster with no entry here renders
    // no pill, and an entry here with no type in the roster is dead weight nobody will
    // ever notice going stale.
    expect(Object.keys(TYPE_CODES).sort()).toEqual(rosterTypes());
  });

  it('names every fill as a --type-* custom property reference', () => {
    for (const [type, display] of Object.entries(TYPE_CODES)) {
      expect(display.fill, type).toMatch(/^var\(--type-[a-z]+\)$/);
    }
  });

  it('uses one of exactly two ink tokens', () => {
    for (const [type, display] of Object.entries(TYPE_CODES)) {
      expect(INK_TOKENS, type).toContain(display.ink);
    }
  });

  it('gives thirteen types dark ink and five light, per the measured ratio table', () => {
    const light = Object.values(TYPE_CODES).filter(
      (display) => display.ink === 'var(--type-ink-light)',
    );

    expect(light.map((display) => display.name).sort()).toEqual([
      'Dark',
      'Dragon',
      'Fighting',
      'Ghost',
      'Poison',
    ]);
  });

  it('keys the map by the exact strings the roster carries', () => {
    // Capitalized, straight from Showdown's pokedex. A lowercase lookup must miss rather
    // than quietly succeed, because a caller that normalizes here and not elsewhere is
    // the drift this map exists to prevent.
    expect(typeDisplay('Water')).toEqual({
      code: 'WAT',
      name: 'Water',
      fill: 'var(--type-water)',
      ink: 'var(--type-ink-dark)',
    });
    expect(typeDisplay('water')).toBeNull();
  });
});

describe('typeDisplay', () => {
  it('returns null for an unknown type rather than a partial entry', () => {
    expect(typeDisplay('Stellar')).toBeNull();
    expect(typeDisplay('')).toBeNull();
  });

  it('returns null for inherited Object properties', () => {
    // A bare `TYPE_CODES[type]` would return a function here, and the caller would go on
    // to read `.fill` off it and set a CSS custom property to `undefined`.
    expect(typeDisplay('toString')).toBeNull();
    expect(typeDisplay('constructor')).toBeNull();
    expect(typeDisplay('__proto__')).toBeNull();
  });

  it('resolves every type the roster actually uses', () => {
    for (const type of rosterTypes()) {
      expect(typeDisplay(type), type).not.toBeNull();
    }
  });
});
