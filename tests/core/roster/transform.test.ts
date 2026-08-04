import { describe, expect, it } from 'vitest';

import { classify, deriveMegaFormes, transform } from '../../../src/core/roster/transform';
import type { BaseStats, RawSpecies, TransformMeta } from '../../../src/core/roster/types';

// ---------------------------------------------------------------------------
// Fixture builders
//
// Every record below mirrors the shape `Dex.mod('champions').species.all()`
// actually returns — verified against pokemon-showdown@0.11.11 before these
// tests were written. Where a field matters to a rule it is spelled out;
// where it does not, the builder supplies a neutral default.
// ---------------------------------------------------------------------------

const NEUTRAL_STATS: BaseStats = { hp: 80, atk: 80, def: 80, spa: 80, spd: 80, spe: 80 };

type SpeciesInput = Partial<RawSpecies> & { id: string; name: string };

function species(input: SpeciesInput): RawSpecies {
  return {
    id: input.id,
    name: input.name,
    num: input.num ?? 1,
    baseSpecies: input.baseSpecies ?? input.name,
    types: input.types ?? ['Normal'],
    baseStats: input.baseStats ?? NEUTRAL_STATS,
    abilities: input.abilities ?? { 0: 'Neutral Ability' },
    forme: input.forme,
    requiredItem: input.requiredItem,
    battleOnly: input.battleOnly,
    isNonstandard: input.isNonstandard,
    tier: input.tier ?? 'UU',
  };
}

const VENUSAUR_STATS: BaseStats = { hp: 80, atk: 82, def: 83, spa: 100, spd: 100, spe: 80 };
const ROTOM_STATS: BaseStats = { hp: 50, atk: 50, def: 77, spa: 95, spd: 77, spe: 91 };
const ROTOM_WASH_STATS: BaseStats = { hp: 50, atk: 65, def: 107, spa: 105, spd: 107, spe: 86 };
const VIVILLON_STATS: BaseStats = { hp: 80, atk: 52, def: 50, spa: 90, spd: 50, spe: 89 };
const MEOWSTIC_STATS: BaseStats = { hp: 74, atk: 48, def: 76, spa: 83, spd: 81, spe: 104 };

const VENUSAUR = species({
  id: 'venusaur',
  name: 'Venusaur',
  num: 3,
  types: ['Grass', 'Poison'],
  baseStats: VENUSAUR_STATS,
  abilities: { 0: 'Overgrow', H: 'Chlorophyll' },
});

const VENUSAUR_MEGA = species({
  id: 'venusaurmega',
  name: 'Venusaur-Mega',
  num: 3,
  baseSpecies: 'Venusaur',
  forme: 'Mega',
  requiredItem: 'Venusaurite',
  battleOnly: 'Venusaur',
  types: ['Grass', 'Poison'],
  baseStats: { hp: 80, atk: 100, def: 123, spa: 122, spd: 120, spe: 80 },
  abilities: { 0: 'Thick Fat' },
});

const ROTOM = species({
  id: 'rotom',
  name: 'Rotom',
  num: 479,
  types: ['Electric', 'Ghost'],
  baseStats: ROTOM_STATS,
  abilities: { 0: 'Levitate' },
});

const ROTOM_WASH = species({
  id: 'rotomwash',
  name: 'Rotom-Wash',
  num: 479,
  baseSpecies: 'Rotom',
  forme: 'Wash',
  types: ['Electric', 'Water'],
  baseStats: ROTOM_WASH_STATS,
  abilities: { 0: 'Levitate' },
  tier: 'OU',
});

const TAUROS = species({
  id: 'tauros',
  name: 'Tauros',
  num: 128,
  types: ['Normal'],
  abilities: { 0: 'Intimidate' },
});

const TAUROS_PALDEA_AQUA = species({
  id: 'taurospaldeaaqua',
  name: 'Tauros-Paldea-Aqua',
  num: 128,
  baseSpecies: 'Tauros',
  forme: 'Paldea-Aqua',
  types: ['Fighting', 'Water'],
  abilities: { 0: 'Intimidate' },
});

// Farfetch'd is stored upstream with U+2019 RIGHT SINGLE QUOTATION MARK, not an
// ASCII apostrophe. `"Farfetch'd" === species.name` is false. The escape is
// written out so this file does not depend on editor encoding.
const FARFETCHD_NAME = 'Farfetch’d';
const FARFETCHD_GALAR_NAME = 'Farfetch’d-Galar';

const FARFETCHD = species({
  id: 'farfetchd',
  name: FARFETCHD_NAME,
  num: 83,
  types: ['Normal', 'Flying'],
  abilities: { 0: 'Keen Eye' },
});

const FARFETCHD_GALAR = species({
  id: 'farfetchdgalar',
  name: FARFETCHD_GALAR_NAME,
  num: 83,
  baseSpecies: FARFETCHD_NAME,
  forme: 'Galar',
  types: ['Fighting'],
  abilities: { 0: 'Steadfast' },
});

const CHARIZARD = species({
  id: 'charizard',
  name: 'Charizard',
  num: 6,
  types: ['Fire', 'Flying'],
  abilities: { 0: 'Blaze' },
});

const CHARIZARD_MEGA_X = species({
  id: 'charizardmegax',
  name: 'Charizard-Mega-X',
  num: 6,
  baseSpecies: 'Charizard',
  forme: 'Mega-X',
  requiredItem: 'Charizardite X',
  battleOnly: 'Charizard',
  types: ['Fire', 'Dragon'],
  abilities: { 0: 'Tough Claws' },
});

const CHARIZARD_MEGA_Y = species({
  id: 'charizardmegay',
  name: 'Charizard-Mega-Y',
  num: 6,
  baseSpecies: 'Charizard',
  forme: 'Mega-Y',
  requiredItem: 'Charizardite Y',
  battleOnly: 'Charizard',
  types: ['Fire', 'Flying'],
  abilities: { 0: 'Drought' },
});

// `'meganium'.includes('mega')` is true. Meganium is not a Mega.
const MEGANIUM = species({
  id: 'meganium',
  name: 'Meganium',
  num: 154,
  types: ['Grass'],
  abilities: { 0: 'Overgrow' },
});

const MEGANIUM_MEGA = species({
  id: 'meganiummega',
  name: 'Meganium-Mega',
  num: 154,
  baseSpecies: 'Meganium',
  forme: 'Mega',
  requiredItem: 'Meganiumite',
  battleOnly: 'Meganium',
  types: ['Grass', 'Fairy'],
  abilities: { 0: 'Grassy Surge' },
  tier: 'OU',
});

// Base Floette is `isNonstandard: "Past"`. The Mega reverts to Floette-Eternal,
// so the Mega belongs to Floette-Eternal and never to base Floette.
const FLOETTE = species({
  id: 'floette',
  name: 'Floette',
  num: 670,
  types: ['Fairy'],
  isNonstandard: 'Past',
  tier: 'Illegal',
});

const FLOETTE_ETERNAL = species({
  id: 'floetteeternal',
  name: 'Floette-Eternal',
  num: 670,
  baseSpecies: 'Floette',
  forme: 'Eternal',
  types: ['Fairy'],
  baseStats: { hp: 74, atk: 65, def: 67, spa: 125, spd: 128, spe: 92 },
  abilities: { 0: 'Flower Veil' },
});

const FLOETTE_MEGA = species({
  id: 'floettemega',
  name: 'Floette-Mega',
  num: 670,
  baseSpecies: 'Floette',
  forme: 'Mega',
  requiredItem: 'Floettite',
  battleOnly: 'Floette-Eternal',
  types: ['Fairy'],
  abilities: { 0: 'Flower Veil' },
  tier: 'OU',
});

// Meowstic-F shares Meowstic's types and base stats but not its abilities.
// It is a genuinely distinct draftable entry, and it carries its own Mega.
const MEOWSTIC = species({
  id: 'meowstic',
  name: 'Meowstic',
  num: 678,
  types: ['Psychic'],
  baseStats: MEOWSTIC_STATS,
  abilities: { 0: 'Keen Eye', 1: 'Infiltrator', H: 'Prankster' },
});

const MEOWSTIC_F = species({
  id: 'meowsticf',
  name: 'Meowstic-F',
  num: 678,
  baseSpecies: 'Meowstic',
  forme: 'F',
  types: ['Psychic'],
  baseStats: MEOWSTIC_STATS,
  abilities: { 0: 'Keen Eye', 1: 'Infiltrator', H: 'Competitive' },
});

const MEOWSTIC_M_MEGA = species({
  id: 'meowsticmmega',
  name: 'Meowstic-M-Mega',
  num: 678,
  baseSpecies: 'Meowstic',
  forme: 'M-Mega',
  requiredItem: 'Meowsticite',
  battleOnly: 'Meowstic',
  types: ['Psychic'],
  abilities: { 0: 'Prankster' },
});

const MEOWSTIC_F_MEGA = species({
  id: 'meowsticfmega',
  name: 'Meowstic-F-Mega',
  num: 678,
  baseSpecies: 'Meowstic',
  forme: 'F-Mega',
  requiredItem: 'Meowsticite',
  battleOnly: 'Meowstic-F',
  types: ['Psychic'],
  abilities: { 0: 'Competitive' },
});

const CASTFORM = species({ id: 'castform', name: 'Castform', num: 351, types: ['Normal'] });

const CASTFORM_SUNNY = species({
  id: 'castformsunny',
  name: 'Castform-Sunny',
  num: 351,
  baseSpecies: 'Castform',
  forme: 'Sunny',
  battleOnly: 'Castform',
  types: ['Fire'],
});

const AEGISLASH = species({
  id: 'aegislash',
  name: 'Aegislash',
  num: 681,
  types: ['Steel', 'Ghost'],
  baseStats: { hp: 60, atk: 50, def: 150, spa: 50, spd: 150, spe: 60 },
});

const AEGISLASH_BLADE = species({
  id: 'aegislashblade',
  name: 'Aegislash-Blade',
  num: 681,
  baseSpecies: 'Aegislash',
  forme: 'Blade',
  battleOnly: 'Aegislash',
  types: ['Steel', 'Ghost'],
  baseStats: { hp: 60, atk: 150, def: 50, spa: 150, spd: 50, spe: 60 },
});

const MIMIKYU = species({ id: 'mimikyu', name: 'Mimikyu', num: 778, types: ['Ghost', 'Fairy'] });

const MIMIKYU_BUSTED = species({
  id: 'mimikyubusted',
  name: 'Mimikyu-Busted',
  num: 778,
  baseSpecies: 'Mimikyu',
  forme: 'Busted',
  battleOnly: 'Mimikyu',
  types: ['Ghost', 'Fairy'],
});

const MORPEKO = species({ id: 'morpeko', name: 'Morpeko', num: 877, types: ['Electric', 'Dark'] });

const MORPEKO_HANGRY = species({
  id: 'morpekohangry',
  name: 'Morpeko-Hangry',
  num: 877,
  baseSpecies: 'Morpeko',
  forme: 'Hangry',
  battleOnly: 'Morpeko',
  types: ['Electric', 'Dark'],
});

const VIVILLON = species({
  id: 'vivillon',
  name: 'Vivillon',
  num: 666,
  types: ['Bug', 'Flying'],
  baseStats: VIVILLON_STATS,
  abilities: { 0: 'Shield Dust', 1: 'Compound Eyes', H: 'Friend Guard' },
});

const VIVILLON_POLAR = species({
  id: 'vivillonpolar',
  name: 'Vivillon-Polar',
  num: 666,
  baseSpecies: 'Vivillon',
  forme: 'Polar',
  types: ['Bug', 'Flying'],
  baseStats: VIVILLON_STATS,
  abilities: { 0: 'Shield Dust', 1: 'Compound Eyes', H: 'Friend Guard' },
});

// `Kommo-o` is a BASE species containing a hyphen. Any `name.split('-')` forme
// parser reads base "Kommo", forme "o".
const KOMMO_O = species({
  id: 'kommoo',
  name: 'Kommo-o',
  num: 784,
  types: ['Dragon', 'Fighting'],
});

const MR_RIME = species({ id: 'mrrime', name: 'Mr. Rime', num: 866, types: ['Ice', 'Psychic'] });

const FUTURE_ENTRY = species({
  id: 'futuremon',
  name: 'Futuremon',
  num: 9999,
  isNonstandard: 'Future',
  tier: 'OU',
});

const PAST_ENTRY = species({
  id: 'pastmon',
  name: 'Pastmon',
  num: 9998,
  isNonstandard: 'Past',
  tier: 'Illegal',
});

const ILLEGAL_TIER_ENTRY = species({
  id: 'terapagosterastal',
  name: 'Terapagos-Terastal',
  num: 1024,
  baseSpecies: 'Terapagos',
  forme: 'Terastal',
  battleOnly: 'Terapagos',
  types: ['Normal'],
  tier: 'Illegal',
});

const ALL_SPECIES: RawSpecies[] = [
  VENUSAUR,
  VENUSAUR_MEGA,
  ROTOM,
  ROTOM_WASH,
  TAUROS,
  TAUROS_PALDEA_AQUA,
  FARFETCHD,
  FARFETCHD_GALAR,
  CHARIZARD,
  CHARIZARD_MEGA_X,
  CHARIZARD_MEGA_Y,
  MEGANIUM,
  MEGANIUM_MEGA,
  FLOETTE,
  FLOETTE_ETERNAL,
  FLOETTE_MEGA,
  MEOWSTIC,
  MEOWSTIC_F,
  MEOWSTIC_M_MEGA,
  MEOWSTIC_F_MEGA,
  CASTFORM,
  CASTFORM_SUNNY,
  AEGISLASH,
  AEGISLASH_BLADE,
  MIMIKYU,
  MIMIKYU_BUSTED,
  MORPEKO,
  MORPEKO_HANGRY,
  VIVILLON,
  VIVILLON_POLAR,
  KOMMO_O,
  MR_RIME,
  FUTURE_ENTRY,
  PAST_ENTRY,
  ILLEGAL_TIER_ENTRY,
];

const META: TransformMeta = {
  schemaVersion: 1,
  regulation: 'M-B',
  validFrom: '2026-06-17',
  validUntil: '2026-09-02',
  upstreamRef: 'pokemon-showdown@0.11.11',
  generatedAt: '2026-08-04T00:00:00.000Z',
};

function entryById(id: string) {
  return transform(ALL_SPECIES, META).entries.find((entry) => entry.id === id);
}

// ---------------------------------------------------------------------------

describe('classify', () => {
  it('marks a plain legal base species draftable', () => {
    expect(classify(VENUSAUR, ALL_SPECIES)).toEqual({ kind: 'draftable' });
  });

  it('marks genuinely distinct alternate formes draftable (ROST-10)', () => {
    expect(classify(ROTOM_WASH, ALL_SPECIES)).toEqual({ kind: 'draftable' });
    expect(classify(TAUROS_PALDEA_AQUA, ALL_SPECIES)).toEqual({ kind: 'draftable' });
    expect(classify(FARFETCHD_GALAR, ALL_SPECIES)).toEqual({ kind: 'draftable' });
  });

  it('marks a forme with a Mega forme segment and a requiredItem as a Mega forme', () => {
    expect(classify(VENUSAUR_MEGA, ALL_SPECIES)).toEqual({ kind: 'megaForme' });
    expect(classify(CHARIZARD_MEGA_X, ALL_SPECIES)).toEqual({ kind: 'megaForme' });
  });

  it('recognises Meowstic-M-Mega and Meowstic-F-Mega, whose forme does not START with Mega', () => {
    // PITFALLS Pitfall 4(d): the forme fields are `M-Mega` and `F-Mega`.
    // A `forme.startsWith('Mega')` test silently loses both, dropping the
    // canonical Mega forme count from 76 to 74.
    expect(classify(MEOWSTIC_M_MEGA, ALL_SPECIES)).toEqual({ kind: 'megaForme' });
    expect(classify(MEOWSTIC_F_MEGA, ALL_SPECIES)).toEqual({ kind: 'megaForme' });
  });

  it('excludes any entry with a truthy isNonstandard, including "Future"', () => {
    expect(classify(FUTURE_ENTRY, ALL_SPECIES)).toEqual({
      kind: 'excluded',
      reason: 'nonstandard',
    });
    expect(classify(PAST_ENTRY, ALL_SPECIES)).toEqual({ kind: 'excluded', reason: 'nonstandard' });
    expect(classify(FLOETTE, ALL_SPECIES)).toEqual({ kind: 'excluded', reason: 'nonstandard' });
  });

  it('excludes tier "Illegal" entries', () => {
    expect(classify(ILLEGAL_TIER_ENTRY, ALL_SPECIES)).toEqual({
      kind: 'excluded',
      reason: 'illegalTier',
    });
  });

  it('excludes battle-only non-Mega formes', () => {
    expect(classify(CASTFORM_SUNNY, ALL_SPECIES)).toEqual({
      kind: 'excluded',
      reason: 'battleOnly',
    });
    expect(classify(AEGISLASH_BLADE, ALL_SPECIES)).toEqual({
      kind: 'excluded',
      reason: 'battleOnly',
    });
    expect(classify(MIMIKYU_BUSTED, ALL_SPECIES)).toEqual({
      kind: 'excluded',
      reason: 'battleOnly',
    });
    expect(classify(MORPEKO_HANGRY, ALL_SPECIES)).toEqual({
      kind: 'excluded',
      reason: 'battleOnly',
    });
  });

  it('excludes cosmetic formes — same types, same base stats, same abilities', () => {
    expect(classify(VIVILLON_POLAR, ALL_SPECIES)).toEqual({ kind: 'excluded', reason: 'cosmetic' });
  });

  it('keeps Meowstic-F, which matches its base on types and stats but not abilities', () => {
    expect(classify(MEOWSTIC_F, ALL_SPECIES)).toEqual({ kind: 'draftable' });
  });

  it('does not treat a hyphenated base species as a forme', () => {
    expect(classify(KOMMO_O, ALL_SPECIES)).toEqual({ kind: 'draftable' });
    expect(classify(MR_RIME, ALL_SPECIES)).toEqual({ kind: 'draftable' });
  });
});

describe('deriveMegaFormes', () => {
  it('returns both Charizard stones, sorted by id', () => {
    const megas = deriveMegaFormes('charizard', ALL_SPECIES);
    expect(megas.map((mega) => mega.id)).toEqual(['charizardmegax', 'charizardmegay']);
    expect(megas.map((mega) => mega.requiredItem)).toEqual(['Charizardite X', 'Charizardite Y']);
  });

  it('derives Meganium from forme + requiredItem, not from a substring of its id', () => {
    const megas = deriveMegaFormes('meganium', ALL_SPECIES);
    expect(megas.map((mega) => mega.id)).toEqual(['meganiummega']);
    expect(megas[0]!.requiredItem).toBe('Meganiumite');
  });

  it('does not mistake Meganium itself for a Mega forme', () => {
    // 'meganium'.includes('mega') === true. The classifier must not care.
    expect(classify(MEGANIUM, ALL_SPECIES)).toEqual({ kind: 'draftable' });
  });

  it('returns nothing for a species whose only Mega has no legal owner path', () => {
    // Floette-Mega reverts to Floette-Eternal, so it belongs there, not to
    // base Floette (PITFALLS Pitfall 4(e)).
    expect(deriveMegaFormes('floette', ALL_SPECIES)).toEqual([]);
    expect(deriveMegaFormes('floetteeternal', ALL_SPECIES).map((mega) => mega.id)).toEqual([
      'floettemega',
    ]);
  });

  it('splits the Meowstic Megas across the two Meowstic entries by battleOnly', () => {
    expect(deriveMegaFormes('meowstic', ALL_SPECIES).map((mega) => mega.id)).toEqual([
      'meowsticmmega',
    ]);
    expect(deriveMegaFormes('meowsticf', ALL_SPECIES).map((mega) => mega.id)).toEqual([
      'meowsticfmega',
    ]);
  });

  it('returns an empty array for a species with no Mega', () => {
    expect(deriveMegaFormes('rotomwash', ALL_SPECIES)).toEqual([]);
  });

  it('accepts a prebuilt index as well as a flat list', () => {
    const index = new Map(ALL_SPECIES.map((entry) => [entry.id, entry]));
    expect(deriveMegaFormes('charizard', index).map((mega) => mega.id)).toEqual([
      'charizardmegax',
      'charizardmegay',
    ]);
  });
});

describe('transform', () => {
  it('folds Mega formes onto the base species rather than emitting pool rows', () => {
    const snapshot = transform(ALL_SPECIES, META);
    const ids = snapshot.entries.map((entry) => entry.id);
    expect(ids).not.toContain('venusaurmega');
    expect(ids).not.toContain('charizardmegax');
    expect(ids).not.toContain('meowsticmmega');

    const charizard = entryById('charizard')!;
    expect(charizard.megaCapable).toBe(true);
    expect(charizard.megaFormes).toHaveLength(2);
  });

  it('marks a species with no Mega as not Mega-capable', () => {
    const rotomWash = entryById('rotomwash')!;
    expect(rotomWash.megaCapable).toBe(false);
    expect(rotomWash.megaFormes).toEqual([]);
  });

  it('drops excluded entries entirely', () => {
    const ids = transform(ALL_SPECIES, META).entries.map((entry) => entry.id);
    for (const excluded of [
      'castformsunny',
      'aegislashblade',
      'mimikyubusted',
      'morpekohangry',
      'vivillonpolar',
      'futuremon',
      'pastmon',
      'floette',
      'terapagosterastal',
    ]) {
      expect(ids).not.toContain(excluded);
    }
  });

  it('preserves display names verbatim, including U+2019', () => {
    expect(entryById('farfetchd')!.name).toBe('Farfetch’d');
    expect(entryById('farfetchdgalar')!.name).toBe('Farfetch’d-Galar');
    expect(entryById('kommoo')!.name).toBe('Kommo-o');
    expect(entryById('mrrime')!.name).toBe('Mr. Rime');
  });

  it('records baseSpeciesId and forme from fields, never from the name', () => {
    const kommo = entryById('kommoo')!;
    expect(kommo.baseSpeciesId).toBe('kommoo');
    expect(kommo.forme).toBeNull();

    const galar = entryById('farfetchdgalar')!;
    expect(galar.baseSpeciesId).toBe('farfetchd');
    expect(galar.forme).toBe('Galar');
  });

  it('gives every entry a unique id', () => {
    const ids = transform(ALL_SPECIES, META).entries.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('emits entries sorted by id', () => {
    const ids = transform(ALL_SPECIES, META).entries.map((entry) => entry.id);
    expect(ids).toEqual([...ids].sort());
  });

  it('is deterministic — two calls produce byte-identical JSON', () => {
    expect(JSON.stringify(transform(ALL_SPECIES, META))).toBe(
      JSON.stringify(transform(ALL_SPECIES, META)),
    );
  });

  it('is order-independent — shuffled input produces byte-identical JSON', () => {
    const reversed = [...ALL_SPECIES].reverse();
    expect(JSON.stringify(transform(reversed, META))).toBe(
      JSON.stringify(transform(ALL_SPECIES, META)),
    );
  });

  it('carries the metadata the caller supplied and adds no checksum', () => {
    const snapshot = transform(ALL_SPECIES, META);
    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.regulation).toBe('M-B');
    expect(snapshot.validFrom).toBe('2026-06-17');
    expect(snapshot.validUntil).toBe('2026-09-02');
    expect(snapshot.upstreamRef).toBe('pokemon-showdown@0.11.11');
    expect(snapshot.generatedAt).toBe('2026-08-04T00:00:00.000Z');
    expect('checksum' in snapshot).toBe(false);
  });

  it('counts every category', () => {
    const { counts } = transform(ALL_SPECIES, META);
    expect(counts.megaFormes).toBe(7);
    expect(counts.draftable).toBe(19);
    expect(counts.legalEntries).toBe(26);
    expect(counts.draftable).toBe(counts.legalEntries - counts.megaFormes);
    expect(counts.baseSpecies).toBe(14);
    expect(counts.alternateFormes).toBe(12);
    expect(counts.baseSpecies + counts.alternateFormes).toBe(counts.legalEntries);
    expect(counts.excludedNonstandard).toBe(3);
    expect(counts.excludedIllegalTier).toBe(1);
    expect(counts.excludedBattleOnly).toBe(4);
    expect(counts.excludedCosmetic).toBe(1);
    // Meowstic and Meowstic-F each carry one Mega, so the draftable-entry
    // figure (6) is one higher than the distinct-baseSpecies figure (5).
    expect(counts.megaCapableSpecies).toBe(6);
    expect(counts.megaCapableBaseSpecies).toBe(5);
    expect(counts.distinctBaseSpecies).toBe(15);
    expect(counts.orphanedMegaFormes).toBe(0);
  });

  it('derives sprite ids from fields and flags the ones the caller says are missing', () => {
    const snapshot = transform(ALL_SPECIES, {
      ...META,
      missingSpriteIds: ['meganium'],
    });
    const byId = new Map(snapshot.entries.map((entry) => [entry.id, entry]));
    expect(byId.get('mrrime')!.spriteId).toBe('mrrime');
    expect(byId.get('rotomwash')!.spriteId).toBe('rotom-wash');
    expect(byId.get('taurospaldeaaqua')!.spriteId).toBe('tauros-paldeaaqua');
    expect(byId.get('meganium')!.spriteMissing).toBe(true);
    expect(byId.get('mrrime')!.spriteMissing).toBe(false);
  });

  it('produces a snapshot that survives a JSON round trip unchanged', () => {
    const snapshot = transform(ALL_SPECIES, META);
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });
});
