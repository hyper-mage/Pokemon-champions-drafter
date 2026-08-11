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
  matchesMega,
  matchesName,
  matchesTypes,
  toSearchKey,
  type MegaFilterMode,
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
