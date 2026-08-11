/**
 * ROST-12 — the hostile-species fixture test.
 *
 * Runs against the ACTUAL committed `public/data/roster.mb.json`, not a stub.
 * This is the test that stops a future regulation regeneration from silently
 * changing the meaning of the pool: every species known to break naive roster
 * code has its classification pinned here.
 *
 * Where an assertion contradicts a planning document, it asserts what the data
 * says and the contradiction is recorded in `docs/roster-count-audit.md`. The
 * test's job is to pin reality, not to agree with a document.
 *
 * Every lookup is by `id`. Nothing is ever looked up by display name.
 */

import { describe, expect, it } from 'vitest';

import committedSnapshot from '../../../public/data/roster.mb.json';
import { transform } from '../../../src/core/roster/transform';
import type { RawSpecies, RosterEntry, RosterSnapshot } from '../../../src/core/roster/types';
import { toSearchKey } from '../../../src/core/search';

const snapshot = committedSnapshot as unknown as RosterSnapshot;
const byId = new Map<string, RosterEntry>(snapshot.entries.map((entry) => [entry.id, entry]));

/**
 * Canonical Mega-capable figure, from docs/roster-count-audit.md §3.
 *
 * 74 DRAFTABLE ENTRIES, not 73 base species: Meowstic and Meowstic-F share a
 * `baseSpecies` but are two separate pool rows, each carrying its own Mega.
 * Phase 3's feasibility arithmetic (players × megaRounds ≤ megaCapable −
 * megaBans) consumes this number, so a wrong value here must fail the build.
 */
const CANONICAL_MEGA_CAPABLE_ENTRIES = 74;
const CANONICAL_MEGA_CAPABLE_BASE_SPECIES = 73;

/**
 * U+2019 RIGHT SINGLE QUOTATION MARK — the character in `Farfetch’d`, which is
 * NOT an ASCII apostrophe. Written as an escape rather than as a literal `’`
 * so that this assertion cannot be broken by a file re-encoding.
 */
const RIGHT_SINGLE_QUOTATION_MARK = '\u2019';

function present(id: string): RosterEntry {
  const entry = byId.get(id);
  expect(entry, `expected ${id} to be present in the snapshot`).toBeDefined();
  return entry as RosterEntry;
}

function absent(id: string): void {
  expect(byId.has(id), `expected ${id} to be absent from the snapshot`).toBe(false);
}

// ---------------------------------------------------------------------------

describe('snapshot integrity', () => {
  it('is Regulation M-B and carries full ROST-05 metadata', () => {
    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.regulation).toBe('M-B');
    expect(snapshot.validFrom).toBe('2026-06-17');
    expect(snapshot.validUntil).toBe('2026-09-02');
    expect(snapshot.upstreamRef).toContain('pokemon-showdown@0.11.11');
    expect(snapshot.checksum).toMatch(/^sha256-[0-9a-f]{64}$/);
    expect(typeof snapshot.generatedAt).toBe('string');
  });

  it('gives every entry a unique id', () => {
    const ids = snapshot.entries.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('carries no isNonstandard field anywhere', () => {
    for (const entry of snapshot.entries) {
      expect(entry, `${entry.id} carries isNonstandard`).not.toHaveProperty('isNonstandard');
      for (const mega of entry.megaFormes) {
        expect(mega, `${mega.id} carries isNonstandard`).not.toHaveProperty('isNonstandard');
      }
    }
  });

  it('is sorted by id, so a regeneration diff is readable', () => {
    const ids = snapshot.entries.map((entry) => entry.id);
    expect(ids).toEqual([...ids].sort());
  });

  it('agrees with its own counts', () => {
    expect(snapshot.counts.draftable).toBe(snapshot.entries.length);
    expect(snapshot.counts.megaFormes).toBe(
      snapshot.entries.reduce((total, entry) => total + entry.megaFormes.length, 0),
    );
    expect(snapshot.counts.megaCapableSpecies).toBe(
      snapshot.entries.filter((entry) => entry.megaCapable).length,
    );
  });
});

describe('Mega detection', () => {
  it('flags Meganium as Mega-capable, because the mod says so', () => {
    // CONTRADICTS ROADMAP success criterion 2, which states "Meganium is never
    // offered as Mega-capable". Dex.mod(...).species.get('meganiummega') is a
    // legal entry with requiredItem "Meganiumite" and no isNonstandard, and it
    // has an explicit row in champions/formats-data.ts. See
    // docs/roster-count-audit.md §4. The data wins; the roadmap needs a ruling.
    const meganium = present('meganium');
    expect(meganium.megaCapable).toBe(meganium.megaFormes.length > 0);
    expect(meganium.megaCapable).toBe(true);
    expect(meganium.megaFormes.map((mega) => mega.requiredItem)).toEqual(['Meganiumite']);
  });

  it('lists meganium exactly once and never as a Meganium-Mega pool row', () => {
    expect(snapshot.entries.filter((entry) => entry.id === 'meganium')).toHaveLength(1);
    expect(snapshot.entries.filter((entry) => /^meganiummega$/.test(entry.id))).toHaveLength(0);
    expect(snapshot.entries.some((entry) => entry.name === 'Meganium-Mega')).toBe(false);
  });

  it('gives Charizard both stones', () => {
    const charizard = present('charizard');
    expect(charizard.megaFormes).toHaveLength(2);
    expect(charizard.megaFormes.map((mega) => mega.requiredItem)).toEqual([
      'Charizardite X',
      'Charizardite Y',
    ]);
    expect(charizard.megaFormes.map((mega) => mega.name)).toEqual([
      'Charizard-Mega-X',
      'Charizard-Mega-Y',
    ]);
  });

  it('gives Raichu both stones', () => {
    const raichu = present('raichu');
    expect(raichu.megaFormes).toHaveLength(2);
    expect(raichu.megaFormes.map((mega) => mega.name)).toEqual([
      'Raichu-Mega-X',
      'Raichu-Mega-Y',
    ]);
  });

  it('splits the Meowstic Megas across two entries using battleOnly, not string surgery', () => {
    // PITFALLS Pitfall 4(d): Meowstic-M-Mega reverts to "Meowstic" while
    // Meowstic-F-Mega reverts to "Meowstic-F". Chopping "-Mega" off the name
    // yields "Meowstic-M", which resolves to nothing.
    absent('meowsticmmega');
    absent('meowsticfmega');

    const meowstic = present('meowstic');
    const meowsticF = present('meowsticf');
    expect(meowstic.megaFormes.map((mega) => mega.id)).toEqual(['meowsticmmega']);
    expect(meowsticF.megaFormes.map((mega) => mega.id)).toEqual(['meowsticfmega']);
    expect(meowstic.megaCapable).toBe(true);
    expect(meowsticF.megaCapable).toBe(true);

    // Both share a baseSpecies but are separate pool rows. This is the whole
    // reason the canonical Mega-capable count is 74 and not 73.
    expect(meowstic.baseSpeciesId).toBe('meowstic');
    expect(meowsticF.baseSpeciesId).toBe('meowstic');
  });

  it('attaches Floette-Mega to Floette-Eternal, and keeps base Floette out entirely', () => {
    // PITFALLS Pitfall 4(e). The plan expected `floette` to be present with
    // megaCapable: false. It is not present at all — Showdown marks base
    // `floette` isNonstandard: "Past" / tier "Illegal" for this regulation.
    // Floette-Eternal is the legal forme and it carries the Mega.
    absent('floette');
    const eternal = present('floetteeternal');
    expect(eternal.megaCapable).toBe(true);
    expect(eternal.megaFormes.map((mega) => mega.id)).toEqual(['floettemega']);
    expect(eternal.baseSpeciesId).toBe('floette');
  });

  it('holds the canonical Mega-capable count the feasibility solver depends on', () => {
    expect(snapshot.counts.megaCapableSpecies).toBe(CANONICAL_MEGA_CAPABLE_ENTRIES);
    expect(snapshot.counts.megaCapableBaseSpecies).toBe(CANONICAL_MEGA_CAPABLE_BASE_SPECIES);
    expect(snapshot.counts.megaFormes).toBe(76);
    expect(snapshot.counts.orphanedMegaFormes).toBe(0);
  });

  it('gives every Mega forme a stone', () => {
    for (const entry of snapshot.entries) {
      for (const mega of entry.megaFormes) {
        expect(mega.requiredItem, `${mega.id} has no requiredItem`).toBeTruthy();
      }
    }
  });
});

describe('battle-only formes', () => {
  it('keeps Castform-Sunny out of the pool but keeps Castform in', () => {
    absent('castformsunny');
    absent('castformrainy');
    absent('castformsnowy');
    present('castform');
  });

  it('keeps Aegislash-Blade out of the pool but keeps Aegislash in', () => {
    absent('aegislashblade');
    present('aegislash');
  });

  it('keeps the other in-battle states out', () => {
    for (const id of ['mimikyubusted', 'morpekohangry', 'palafinhero', 'terapagosterastal']) {
      absent(id);
    }
    present('mimikyu');
    present('morpeko');
  });
});

describe('cosmetic formes', () => {
  it('collapses all 19 Vivillon entries to one', () => {
    const vivillons = snapshot.entries.filter((entry) => entry.baseSpeciesId === 'vivillon');
    expect(vivillons).toHaveLength(1);
    expect(vivillons[0]!.id).toBe('vivillon');
  });

  it('collapses the Alcremie sweets to one', () => {
    const alcremies = snapshot.entries.filter((entry) => entry.baseSpeciesId === 'alcremie');
    expect(alcremies).toHaveLength(1);
    expect(alcremies[0]!.id).toBe('alcremie');
  });

  it('does NOT collapse Meowstic-F, which matches its base on types and stats', () => {
    // A types-and-stats-only cosmetic rule deletes this entry and takes a Mega
    // with it. Abilities are what distinguish them.
    const meowstics = snapshot.entries.filter((entry) => entry.baseSpeciesId === 'meowstic');
    expect(meowstics.map((entry) => entry.id).sort()).toEqual(['meowstic', 'meowsticf']);
  });
});

describe('names that break string parsing', () => {
  it('keeps Kommo-o, a base species with a hyphen in its name', () => {
    const kommo = present('kommoo');
    expect(kommo.name).toBe('Kommo-o');
    // A name.split('-') forme parser would read base "Kommo", forme "o".
    expect(kommo.forme).toBeNull();
    expect(kommo.baseSpeciesId).toBe('kommoo');
  });

  it('keeps Mr. Rime, whose name has a period and a space', () => {
    const rime = present('mrrime');
    expect(rime.name).toBe('Mr. Rime');
    expect(rime.forme).toBeNull();
  });

  it('does not contain Farfetch’d, which is isNonstandard "Past" in this regulation', () => {
    // PITFALLS Pitfall 4(h) lists Farfetch’d as a U+2019 hazard. It is
    // real, but it is not legal in M-B, so asserting its presence here would
    // assert a fiction. See docs/roster-count-audit.md §6.
    absent('farfetchd');
    absent('farfetchdgalar');
    expect(snapshot.entries.some((entry) => entry.name.includes(RIGHT_SINGLE_QUOTATION_MARK))).toBe(
      false,
    );
  });

  it('carries a U+2019 name through the transform verbatim when one is legal', () => {
    // The hazard is one regulation away, so it is pinned at the transform
    // level rather than left untested until it lands.
    const name = `Farfetch${RIGHT_SINGLE_QUOTATION_MARK}d`;
    expect(name).not.toBe("Farfetch'd");
    expect(name.codePointAt(8)).toBe(0x2019);

    const legalFarfetchd: RawSpecies = {
      id: 'farfetchd',
      name,
      num: 83,
      baseSpecies: name,
      types: ['Normal', 'Flying'],
      baseStats: { hp: 52, atk: 90, def: 55, spa: 58, spd: 62, spe: 60 },
      abilities: { 0: 'Keen Eye' },
      tier: 'UU',
    };

    const rebuilt = transform([legalFarfetchd], {
      schemaVersion: 1,
      regulation: 'M-B',
      validFrom: snapshot.validFrom,
      validUntil: snapshot.validUntil,
      upstreamRef: snapshot.upstreamRef,
      generatedAt: snapshot.generatedAt,
    });

    expect(rebuilt.entries).toHaveLength(1);
    expect(rebuilt.entries[0]!.name).toBe(name);
    expect(rebuilt.entries[0]!.name.codePointAt(8)).toBe(0x2019);
    expect(rebuilt.entries[0]!.id).toBe('farfetchd');
  });

  it('has an id equal to toID(name) for every entry', () => {
    for (const entry of snapshot.entries) {
      expect(entry.name.toLowerCase().replace(/[^a-z0-9]+/g, '')).toBe(entry.id);
    }
  });
});

describe('roster tripwire — regulation M-B', () => {
  /**
   * This block exists to make a regeneration announce itself.
   *
   * The committed snapshot's `validUntil` is 2026-09-02 and Champions regulations rotate
   * roughly every two and a half months. Every feasibility ceiling Phase 2 computes is a
   * function of these figures: the largest party the roster can seat, the point at which
   * bans starve the Mega requirement, and the number of types the filter bar renders. A
   * regeneration that quietly changed any of them would leave a gate that is subtly wrong
   * rather than obviously broken — and a subtly wrong gate is discovered by a group of
   * friends sat around a screen, not by a build.
   *
   * The numbers live HERE and never in `src/`. D-17 removes the player cap entirely, and
   * nothing in the application may hardcode a roster figure; pinning them in a test is how
   * they stay checkable without becoming a constant.
   */

  it('holds 235 draftable entries', () => {
    expect(snapshot.entries).toHaveLength(235);
    expect(snapshot.counts.draftable).toBe(235);
  });

  it('holds 74 Mega-capable draftable entries', () => {
    expect(snapshot.entries.filter((entry) => entry.megaCapable)).toHaveLength(74);
  });

  it('holds exactly two dual-Mega species, and they are Charizard and Raichu', () => {
    const dual = snapshot.entries
      .filter((entry) => entry.megaFormes.length > 1)
      .map((entry) => entry.id)
      .sort();

    expect(dual).toEqual(['charizard', 'raichu']);
  });

  it('spans 18 distinct types, and no entry carries more than two', () => {
    const types = new Set<string>();
    for (const entry of snapshot.entries) {
      expect(entry.types.length, `${entry.id} type count`).toBeLessThanOrEqual(2);
      expect(entry.types.length, `${entry.id} type count`).toBeGreaterThanOrEqual(1);
      for (const type of entry.types) types.add(type);
    }

    expect(types.size).toBe(18);
  });

  it('keeps every base-stat total between 288 and 600', () => {
    for (const entry of snapshot.entries) {
      const total = Object.values(entry.baseStats).reduce((sum, stat) => sum + stat, 0);
      expect(total, `${entry.id} base-stat total`).toBeGreaterThanOrEqual(288);
      expect(total, `${entry.id} base-stat total`).toBeLessThanOrEqual(600);
    }
  });

  it('keeps every single base stat at three digits or fewer', () => {
    for (const entry of snapshot.entries) {
      for (const [stat, value] of Object.entries(entry.baseStats)) {
        expect(value, `${entry.id} ${stat}`).toBeLessThanOrEqual(200);
      }
    }
  });

  it('keeps the longest display name at 20 characters', () => {
    const longest = Math.max(...snapshot.entries.map((entry) => entry.name.length));

    expect(longest).toBe(20);
  });

  it('normalizes every name back to its own id, for entries and Mega formes alike', () => {
    // DRFT-08 matches against `name` rather than `id` on purpose — the equality is an
    // optimization, not a correctness dependency. This assertion is what makes a rotation
    // that breaks it fail loudly here instead of making search silently miss a species.
    for (const entry of snapshot.entries) {
      expect(toSearchKey(entry.name), `${entry.id} name`).toBe(entry.id);
      for (const mega of entry.megaFormes) {
        expect(toSearchKey(mega.name), `${mega.id} name`).toBe(mega.id);
      }
    }
  });
});

describe('genuinely distinct alternate formes (ROST-10)', () => {
  it('keeps every Rotom appliance', () => {
    for (const id of ['rotom', 'rotomwash', 'rotomheat', 'rotomfrost', 'rotomfan', 'rotommow']) {
      const entry = present(id);
      expect(entry.baseSpeciesId).toBe('rotom');
    }
    expect(present('rotomwash').types).toEqual(['Electric', 'Water']);
  });

  it('keeps every Tauros-Paldea breed', () => {
    for (const id of ['taurospaldeacombat', 'taurospaldeablaze', 'taurospaldeaaqua']) {
      const entry = present(id);
      expect(entry.baseSpeciesId).toBe('tauros');
      expect(entry.forme).toContain('Paldea');
    }
  });
});
