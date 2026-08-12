/**
 * DRFT-08 / DRFT-09 — the shared pool predicates.
 *
 * One module, one test suite, two consumers: the pool filter bar and the ban typeahead.
 * The point of testing them here rather than through either surface is that a second
 * matcher living inside a component could drift from this one for a whole release before
 * anybody noticed that a name findable in the ban field was unfindable in the pool.
 *
 * Every case runs against the real committed roster. The fixtures that matter are the ones
 * that punish name parsing — `Kommo-o` is a base species with a hyphen, `Mr. Rime` has a
 * period and a space, `Tauros-Paldea-Aqua` and `Rotom-Wash` both need a mid-name substring
 * match rather than a prefix one.
 *
 * Zero mocks. Default environment is `node`.
 */

import { describe, expect, it } from 'vitest';

import committedSnapshot from '../../public/data/roster.mb.json';
import {
  compileFilters,
  hasActiveFilters,
  matchesFilters,
  matchesMega,
  matchesName,
  matchesTypes,
  NO_FILTERS,
  toSearchKey,
  type MegaFilterMode,
  type PoolFilters,
} from '../../src/core/search';
import type { RosterEntry, RosterSnapshot } from '../../src/core/roster/types';

const snapshot = committedSnapshot as unknown as RosterSnapshot;
const ENTRIES: readonly RosterEntry[] = snapshot.entries;
const byId = new Map<string, RosterEntry>(ENTRIES.map((entry) => [entry.id, entry]));

function entry(id: string): RosterEntry {
  const found = byId.get(id);
  expect(found, `expected ${id} in the committed snapshot`).toBeDefined();
  return found as RosterEntry;
}

/** Names of every entry a query selects, which is what the pool grid would render. */
function search(query: string): string[] {
  const normalized = toSearchKey(query);
  return ENTRIES.filter((candidate) => matchesName(candidate, normalized)).map(
    (candidate) => candidate.name,
  );
}

// ---------------------------------------------------------------------------

describe('toSearchKey', () => {
  it('strips punctuation and spacing so two spellings of one name agree', () => {
    expect(toSearchKey('Mr. Rime')).toBe('mrrime');
    expect(toSearchKey('mr rime')).toBe('mrrime');
    expect(toSearchKey('MR RIME')).toBe('mrrime');
  });

  it('flattens hyphenated formes without parsing them', () => {
    expect(toSearchKey('Tauros-Paldea-Aqua')).toBe('taurospaldeaaqua');
    expect(toSearchKey('Rotom-Wash')).toBe('rotomwash');
  });

  it('does not mistake a hyphen inside a base species name for a forme boundary', () => {
    expect(toSearchKey('Kommo-o')).toBe('kommoo');
  });

  it('is idempotent, so normalizing an already-normalized query is safe', () => {
    for (const text of ['Mr. Rime', 'Tauros-Paldea-Aqua', 'Kommo-o', 'Farfetch’d']) {
      expect(toSearchKey(toSearchKey(text))).toBe(toSearchKey(text));
    }
  });

  it('reduces a query of only punctuation to the empty key', () => {
    expect(toSearchKey('   ')).toBe('');
    expect(toSearchKey('-.-')).toBe('');
  });
});

describe('matchesName', () => {
  it('matches every entry on an empty query, because no query is no filter', () => {
    for (const candidate of ENTRIES) {
      expect(matchesName(candidate, ''), candidate.id).toBe(true);
    }
  });

  it('finds Rotom and all five appliances from one query', () => {
    expect(search('rotom').sort()).toEqual([
      'Rotom',
      'Rotom-Fan',
      'Rotom-Frost',
      'Rotom-Heat',
      'Rotom-Mow',
      'Rotom-Wash',
    ]);
  });

  it('matches inside a name, not only at its start', () => {
    // The whole reason prefix matching was rejected: a host looking for the Water Rotom
    // types `wash`, and a host looking for the Water Tauros types `aqua`.
    expect(search('wash')).toEqual(['Rotom-Wash']);
    expect(search('aqua')).toContain('Tauros-Paldea-Aqua');
    expect(matchesName(entry('taurospaldeaaqua'), toSearchKey('aqua'))).toBe(true);
    expect(matchesName(entry('rotomwash'), toSearchKey('wash'))).toBe(true);
  });

  it('ignores punctuation and case in the query', () => {
    expect(matchesName(entry('mrrime'), toSearchKey('MR. RIME'))).toBe(true);
    expect(matchesName(entry('kommoo'), toSearchKey('Kommo-O'))).toBe(true);
    expect(matchesName(entry('taurospaldeaaqua'), toSearchKey('paldea aqua'))).toBe(true);
  });

  it('does not match a query the name does not contain', () => {
    expect(matchesName(entry('rotomwash'), toSearchKey('heat'))).toBe(false);
    expect(search('zzzz')).toEqual([]);
  });
});

describe('matchesTypes', () => {
  it('matches everything when nothing is selected, in both modes', () => {
    for (const candidate of ENTRIES) {
      expect(matchesTypes(candidate, [], false), candidate.id).toBe(true);
      expect(matchesTypes(candidate, [], true), candidate.id).toBe(true);
    }
  });

  it('is OR by default', () => {
    const rotomWash = entry('rotomwash');

    expect(rotomWash.types).toEqual(['Electric', 'Water']);
    expect(matchesTypes(rotomWash, ['Water', 'Flying'], false)).toBe(true);
    expect(matchesTypes(rotomWash, ['Fire', 'Flying'], false)).toBe(false);
  });

  it('requires every selected type when matching all', () => {
    const rotomWash = entry('rotomwash');

    expect(matchesTypes(rotomWash, ['Electric', 'Water'], true)).toBe(true);
    expect(matchesTypes(rotomWash, ['Water', 'Flying'], true)).toBe(false);
    expect(matchesTypes(rotomWash, ['Water'], true)).toBe(true);
  });

  it('handles a single-type entry in both modes', () => {
    const skarmory = entry('skarmory');
    const single = ENTRIES.find((candidate) => candidate.types.length === 1);

    expect(skarmory.types).toEqual(['Steel', 'Flying']);
    expect(single).toBeDefined();
    expect(matchesTypes(single as RosterEntry, (single as RosterEntry).types, true)).toBe(true);
  });
});

describe('matchesMega', () => {
  it('matches everything on All', () => {
    for (const candidate of ENTRIES) {
      expect(matchesMega(candidate, 'all'), candidate.id).toBe(true);
    }
  });

  it('partitions the roster exactly between the other two modes', () => {
    for (const candidate of ENTRIES) {
      expect(matchesMega(candidate, 'mega'), candidate.id).toBe(candidate.megaCapable);
      expect(matchesMega(candidate, 'nonMega'), candidate.id).toBe(!candidate.megaCapable);
    }
  });

  it('counts the Mega-capable partition as the snapshot does', () => {
    const modes: readonly MegaFilterMode[] = ['all', 'mega', 'nonMega'];
    const counts = modes.map(
      (mode) => ENTRIES.filter((candidate) => matchesMega(candidate, mode)).length,
    );

    expect(counts[0]).toBe(ENTRIES.length);
    expect(counts[1]).toBe(snapshot.counts.megaCapableSpecies);
    expect((counts[1] as number) + (counts[2] as number)).toBe(ENTRIES.length);
  });
});

describe('the predicates compose', () => {
  it('narrows the pool the way a filter bar would', () => {
    const normalized = toSearchKey('rotom');
    const filtered = ENTRIES.filter(
      (candidate) =>
        matchesName(candidate, normalized) &&
        matchesTypes(candidate, ['Water'], false) &&
        matchesMega(candidate, 'nonMega'),
    );

    expect(filtered.map((candidate) => candidate.name)).toEqual(['Rotom-Wash']);
  });
});

// ---------------------------------------------------------------------------
// The composed chain — what the filter bar actually calls
// ---------------------------------------------------------------------------

/** The names a whole filter state selects, which is what `PoolGrid` would render. */
function selected(filters: PoolFilters): string[] {
  const compiled = compileFilters(filters);
  return ENTRIES.filter((candidate) => matchesFilters(candidate, compiled)).map(
    (candidate) => candidate.name,
  );
}

describe('NO_FILTERS', () => {
  it('is the neutral value on every field', () => {
    expect(NO_FILTERS).toEqual({ query: '', types: [], matchAll: false, mega: 'all' });
  });

  it('selects the whole roster', () => {
    expect(selected(NO_FILTERS)).toHaveLength(ENTRIES.length);
  });
});

describe('compileFilters', () => {
  it('normalizes the query once, and leaves the raw text the host typed alone', () => {
    const filters: PoolFilters = { ...NO_FILTERS, query: 'Mr. Rime' };

    expect(compileFilters(filters).key).toBe('mrrime');
    // The UI keeps what was typed in the field; only the compiled copy is normalized.
    expect(filters.query).toBe('Mr. Rime');
  });

  it('copies the other three fields through untouched', () => {
    const filters: PoolFilters = {
      query: 'rotom',
      types: ['Water', 'Electric'],
      matchAll: true,
      mega: 'nonMega',
    };
    const compiled = compileFilters(filters);

    expect(compiled.types).toEqual(['Water', 'Electric']);
    expect(compiled.matchAll).toBe(true);
    expect(compiled.mega).toBe('nonMega');
  });

  it('mutates neither its argument nor NO_FILTERS', () => {
    const filters: PoolFilters = { query: 'Mr. Rime', types: ['Water'], matchAll: true, mega: 'mega' };
    const before = JSON.stringify(filters);
    const neutralBefore = JSON.stringify(NO_FILTERS);

    const compiled = compileFilters(filters);
    for (const candidate of ENTRIES) matchesFilters(candidate, compiled);

    expect(JSON.stringify(filters)).toBe(before);
    expect(JSON.stringify(NO_FILTERS)).toBe(neutralBefore);
  });
});

describe('matchesFilters', () => {
  it('matches every committed entry under the neutral filters', () => {
    const compiled = compileFilters(NO_FILTERS);

    for (const candidate of ENTRIES) {
      expect(matchesFilters(candidate, compiled), candidate.id).toBe(true);
    }
  });

  it('finds Rotom and all five appliances from one query', () => {
    expect(selected({ ...NO_FILTERS, query: 'rotom' }).sort()).toEqual([
      'Rotom',
      'Rotom-Fan',
      'Rotom-Frost',
      'Rotom-Heat',
      'Rotom-Mow',
      'Rotom-Wash',
    ]);
  });

  it('matches inside a name rather than only at its start', () => {
    expect(selected({ ...NO_FILTERS, query: 'wash' })).toEqual(['Rotom-Wash']);
    expect(selected({ ...NO_FILTERS, query: 'aqua' })).toContain('Tauros-Paldea-Aqua');
  });

  /**
   * The conjunction, asserted as a conjunction rather than as three separate calls.
   *
   * Each half alone selects something; together they select nothing. A `matchesFilters`
   * that ORed its clauses, or that dropped one of them, would still pass every
   * single-clause assertion above.
   */
  it('ANDs the three predicates rather than merely calling all of them', () => {
    const rotom = selected({ ...NO_FILTERS, query: 'rotom' });
    const megas = selected({ ...NO_FILTERS, mega: 'mega' });
    const both = selected({ ...NO_FILTERS, query: 'rotom', mega: 'mega' });

    expect(rotom.length).toBeGreaterThan(0);
    expect(megas.length).toBeGreaterThan(0);
    expect(both).toEqual([]);
  });

  it('composes the type selection with the query, in both type modes', () => {
    expect(selected({ ...NO_FILTERS, query: 'rotom', types: ['Water'], matchAll: false })).toEqual([
      'Rotom-Wash',
    ]);
    expect(
      selected({ ...NO_FILTERS, types: ['Water', 'Flying'], matchAll: true }).length,
    ).toBeLessThan(selected({ ...NO_FILTERS, types: ['Water', 'Flying'], matchAll: false }).length);
  });

  it('partitions the roster exactly between the two Mega settings', () => {
    const mega = selected({ ...NO_FILTERS, mega: 'mega' }).length;
    const nonMega = selected({ ...NO_FILTERS, mega: 'nonMega' }).length;

    expect(mega).toBe(snapshot.counts.megaCapableSpecies);
    expect(mega + nonMega).toBe(ENTRIES.length);
  });
});

describe('hasActiveFilters', () => {
  it('is false for the neutral value', () => {
    expect(hasActiveFilters(NO_FILTERS)).toBe(false);
  });

  it('is true when any one control is away from neutral', () => {
    expect(hasActiveFilters({ ...NO_FILTERS, query: 'w' })).toBe(true);
    expect(hasActiveFilters({ ...NO_FILTERS, types: ['Water'] })).toBe(true);
    expect(hasActiveFilters({ ...NO_FILTERS, mega: 'mega' })).toBe(true);
    expect(hasActiveFilters({ ...NO_FILTERS, mega: 'nonMega' })).toBe(true);
  });

  /**
   * The one deliberate omission, asserted so nobody "fixes" it.
   *
   * With fewer than two selected types the AND and the OR behaviours are identical, so a
   * `matchAll` that is true on its own changes nothing a host can see. Calling it active
   * would put a `Clear filters` button on screen that visibly clears nothing.
   */
  it('ignores matchAll on its own, because on its own it is unobservable', () => {
    expect(hasActiveFilters({ ...NO_FILTERS, matchAll: true })).toBe(false);
    expect(selected({ ...NO_FILTERS, matchAll: true })).toHaveLength(ENTRIES.length);
  });
});
