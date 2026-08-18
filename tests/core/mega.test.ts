/**
 * mega.ts — the one Mega-eligibility predicate, and the containment its ban count inherits.
 *
 * The assertion that matters most is `74 entries are eligible with no bans`: that figure is
 * the right-hand side of the RULE-09 inequality (`players × megaRounds ≤ megaEligibleLegal`),
 * and `tests/core/roster/fixtures.test.ts` reaches the same number by a completely different
 * route — counting `megaCapable` flags. Two independent computations of one figure, pinned
 * equal, is what stops the gate and the roster from disagreeing about how many Megas exist.
 *
 * The second is the pin: Charizard with `Mega-X` banned is ELIGIBLE under `'either'` and
 * INELIGIBLE under `'x'`. That is D-09 (bans are per forme, not per species) and D-10 (a
 * species with no legal forme leaves the Mega rounds with no error state) in one pair of
 * assertions, and a species-level ban implementation passes neither.
 *
 * Real ids read from the committed snapshot, zero mocks, no import of `src/store.ts` — the
 * observable payoff of the purity rule.
 */

import { describe, expect, it } from 'vitest';

import committedSnapshot from '../../public/data/roster.mb.json';
import { bannedMegaFormes, choiceFor, isMegaEligible, megaFormeRows } from '../../src/core/mega';
import type { DualMegaForme } from '../../src/core/model';
import type { MegaForme, RosterEntry, RosterSnapshot } from '../../src/core/roster/types';

const SNAPSHOT = committedSnapshot as unknown as RosterSnapshot;
const ENTRIES: readonly RosterEntry[] = SNAPSHOT.entries;

/** Measured against `public/data/roster.mb.json` at Regulation M-B. */
const TOTAL_MEGA_FORMES = 76;
/** The same figure `fixtures.test.ts` reaches by counting `megaCapable` flags. */
const MEGA_ELIGIBLE_ENTRIES = 74;

const ALL_CHOICES: readonly DualMegaForme[] = ['x', 'y', 'either'];

function entry(id: string): RosterEntry {
  const found = ENTRIES.find((candidate) => candidate.id === id);
  expect(found, `expected ${id} in the snapshot`).toBeDefined();
  return found as RosterEntry;
}

/** Forme ids are READ from the snapshot rather than constructed from a name. */
function formeId(speciesId: string, position: number): string {
  const forme = entry(speciesId).megaFormes[position];
  expect(forme, `expected ${speciesId} forme ${position}`).toBeDefined();
  return (forme as MegaForme).id;
}

const CHARIZARD = entry('charizard');
const CHARIZARD_MEGA_X = formeId('charizard', 0);
const CHARIZARD_MEGA_Y = formeId('charizard', 1);
const ABOMASNOW = entry('abomasnow');
const ABOMASNOW_MEGA = formeId('abomasnow', 0);
/** Not Mega-capable, and carries an empty `megaFormes` array. */
const PIKACHU = entry('pikachu');

function eligibleCount(
  bannedFormeIds: ReadonlySet<string>,
  choice: DualMegaForme = 'either',
): number {
  return ENTRIES.filter((candidate) => isMegaEligible(candidate, bannedFormeIds, choice)).length;
}

describe('megaFormeRows', () => {
  it('returns every Mega forme on the snapshot', () => {
    expect(megaFormeRows(ENTRIES)).toHaveLength(TOTAL_MEGA_FORMES);
  });

  it('keeps the entries display order, with a dual-Mega species contributing two adjacent rows', () => {
    const rows = megaFormeRows(ENTRIES);
    const ids = rows.map((forme) => forme.id);
    const x = ids.indexOf(CHARIZARD_MEGA_X);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(ids[x + 1]).toBe(CHARIZARD_MEGA_Y);
  });

  it('carries each formes own record, not its base species', () => {
    const rows = megaFormeRows(ENTRIES);
    const megaX = rows.find((forme) => forme.id === CHARIZARD_MEGA_X) as (typeof rows)[number];
    const megaY = rows.find((forme) => forme.id === CHARIZARD_MEGA_Y) as (typeof rows)[number];

    // A merged two-forme cell would have to hide one of these three differences.
    expect(megaX.name).not.toBe(megaY.name);
    expect(megaX.types).not.toEqual(megaY.types);
    expect(megaX.types).not.toEqual(CHARIZARD.types);
    expect(megaX.baseStats).not.toEqual(megaY.baseStats);
  });

  it('returns nothing for entries that carry no formes', () => {
    expect(megaFormeRows([PIKACHU])).toEqual([]);
  });
});

describe('isMegaEligible', () => {
  it('is true for a Mega-capable species with no bans', () => {
    expect(isMegaEligible(CHARIZARD, new Set(), 'either')).toBe(true);
  });

  it('is false for a species that was never Mega-capable', () => {
    // No special case answers this — `some` over an empty array does.
    expect(PIKACHU.megaFormes).toEqual([]);
    expect(isMegaEligible(PIKACHU, new Set(), 'either')).toBe(false);
  });

  it('leaves the other forme legal when one forme is banned', () => {
    const bans = new Set([CHARIZARD_MEGA_X]);
    expect(isMegaEligible(CHARIZARD, bans, 'either')).toBe(true);
    expect(isMegaEligible(CHARIZARD, bans, 'y')).toBe(true);
  });

  it('lets a Mega ban beat the X/Y pin', () => {
    // D-10's worked case: pinned to X, X banned, no legal forme — and no error state.
    const bans = new Set([CHARIZARD_MEGA_X]);
    expect(isMegaEligible(CHARIZARD, bans, 'x')).toBe(false);
  });

  it('is false for every choice once both formes are banned', () => {
    const bans = new Set([CHARIZARD_MEGA_X, CHARIZARD_MEGA_Y]);
    for (const choice of ALL_CHOICES) {
      expect(isMegaEligible(CHARIZARD, bans, choice), `choice ${choice}`).toBe(false);
    }
  });

  it('makes a single-forme species ineligible with one ban', () => {
    expect(ABOMASNOW.megaFormes).toHaveLength(1);
    expect(isMegaEligible(ABOMASNOW, new Set(), 'either')).toBe(true);
    expect(isMegaEligible(ABOMASNOW, new Set([ABOMASNOW_MEGA]), 'either')).toBe(false);
  });

  it('ignores a ban id the roster does not carry', () => {
    expect(isMegaEligible(CHARIZARD, new Set(['notaforme']), 'either')).toBe(true);
  });

  it('counts 74 eligible entries across the snapshot with no bans', () => {
    expect(eligibleCount(new Set())).toBe(MEGA_ELIGIBLE_ENTRIES);
  });

  it('drops exactly one entry when a single-forme species is banned', () => {
    expect(eligibleCount(new Set([ABOMASNOW_MEGA]))).toBe(MEGA_ELIGIBLE_ENTRIES - 1);
  });

  it('drops no entry when only one of a dual-Mega species formes is banned', () => {
    expect(eligibleCount(new Set([CHARIZARD_MEGA_X]))).toBe(MEGA_ELIGIBLE_ENTRIES);
    expect(eligibleCount(new Set([CHARIZARD_MEGA_X, CHARIZARD_MEGA_Y]))).toBe(
      MEGA_ELIGIBLE_ENTRIES - 1,
    );
  });
});

describe('choiceFor', () => {
  it('reads an absent entry as either', () => {
    expect(choiceFor([], 'charizard')).toBe('either');
  });

  it('reads the hosts pin when one is recorded', () => {
    expect(choiceFor([{ speciesId: 'charizard', forme: 'y' }], 'charizard')).toBe('y');
  });

  it('never consults a stale entry for a species this regulation dropped', () => {
    const choices = [{ speciesId: 'notaspecies', forme: 'x' as const }];
    expect(choiceFor(choices, 'charizard')).toBe('either');
    expect(isMegaEligible(CHARIZARD, new Set(), choiceFor(choices, 'charizard'))).toBe(true);
  });
});

describe('bannedMegaFormes', () => {
  it('returns nothing for an empty banlist', () => {
    expect(bannedMegaFormes(ENTRIES, [])).toEqual([]);
  });

  it('resolves one banned forme and leaves its sibling alone', () => {
    const banned = bannedMegaFormes(ENTRIES, [CHARIZARD_MEGA_X]);
    expect(banned.map((forme) => forme.id)).toEqual([CHARIZARD_MEGA_X]);
  });

  it('counts a duplicate id once', () => {
    expect(bannedMegaFormes(ENTRIES, [CHARIZARD_MEGA_X, CHARIZARD_MEGA_X])).toHaveLength(1);
  });

  it('contributes nothing for an id the roster does not carry', () => {
    // Set membership, never `formeBans.length` — an imported document may outlive a forme.
    expect(bannedMegaFormes(ENTRIES, ['notaforme'])).toEqual([]);
    expect(bannedMegaFormes(ENTRIES, ['notaforme', CHARIZARD_MEGA_Y])).toHaveLength(1);
  });

  it('sorts by name rather than by the order the bans were written', () => {
    const banned = bannedMegaFormes(ENTRIES, [CHARIZARD_MEGA_Y, ABOMASNOW_MEGA]);
    expect(banned.map((forme) => forme.name)).toEqual(['Abomasnow-Mega', 'Charizard-Mega-Y']);
  });

  it('leaves the caller array untouched', () => {
    const bans = [CHARIZARD_MEGA_Y, ABOMASNOW_MEGA];
    bannedMegaFormes(ENTRIES, bans);
    expect(bans).toEqual([CHARIZARD_MEGA_Y, ABOMASNOW_MEGA]);
  });
});
