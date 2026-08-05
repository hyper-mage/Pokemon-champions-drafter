/**
 * paste.test.ts — EXPO-01, EXPO-02, EXPO-03, and the automatable half of EXPO-04.
 *
 * The headline fact under test is CLAUDE.md's, and it is not a style preference:
 *
 *     "Venusaur\n\nGarchomp\n\nRotom-Wash\n"  ->  3 mons
 *     "Venusaur\nGarchomp\nRotom-Wash\n"      ->  1 mon, the rest SILENTLY DROPPED
 *
 * The blank line is the record separator. A single-newline join does not error, does
 * not warn, and does not look wrong in a terminal — it just loses five of six
 * Pokemon. That is why the negative assertion below is written as an executable
 * comparison against the naive form rather than as a comment.
 *
 * These tests do not eyeball the string. They hand it to the SAME parser the host
 * will hand it to: `Teams.import` from `pokemon-showdown@0.11.11`, a devDependency
 * that never reaches the bundle. A snapshot test would pin whatever the function
 * happens to emit today; running the real parser pins what Showdown will actually
 * DO with it, which is the only property anyone cares about.
 *
 * Hostile-name coverage is split deliberately:
 *
 *   - Species that ARE legal in Regulation M-B (Kommo-o, Mr. Rime, Rotom-Wash,
 *     Tauros-Paldea-Aqua) are taken from the real committed snapshot.
 *   - Species that are NOT legal in M-B (Nidoran-M/F, Ho-Oh, Porygon-Z, Type: Null,
 *     and Farfetch’d with its U+2019 apostrophe) are synthesized, because plan 01-03
 *     established that asserting their presence in the snapshot would assert a
 *     fiction. They are still worth covering: they are one regulation rotation away,
 *     and the parser collisions they represent are permanent.
 */

import { Teams, TeamValidator } from 'pokemon-showdown';
import { describe, expect, it } from 'vitest';

import committedSnapshot from '../../../public/data/roster.mb.json';
import * as pasteModule from '../../../src/core/export/paste';
import { toShowdownPaste } from '../../../src/core/export/paste';
import type { PasteSlot } from '../../../src/core/export/paste';
import type { BaseStats, MegaForme, RosterEntry, RosterSnapshot } from '../../../src/core/roster/types';

const snapshot = committedSnapshot as unknown as RosterSnapshot;
const snapshotById = new Map<string, RosterEntry>(
  snapshot.entries.map((entry) => [entry.id, entry]),
);

/** The Champions format the roadmap names, confirmed present in the installed package. */
const CHAMPIONS_FORMAT = 'gen9championsvgc2026regmb';

/**
 * U+2019 RIGHT SINGLE QUOTATION MARK, written as an escape so this assertion cannot
 * be silently broken by a file re-encoding. The literal character is `’` — it is NOT
 * the ASCII apostrophe `'`, and Showdown's `name` field uses the former.
 */
const RIGHT_SINGLE_QUOTATION_MARK = '’';

const NO_STATS: BaseStats = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

function realEntry(id: string): RosterEntry {
  const entry = snapshotById.get(id);
  expect(entry, `expected ${id} in the committed snapshot`).toBeDefined();
  return entry as RosterEntry;
}

function syntheticEntry(id: string, name: string, megaFormes: MegaForme[] = []): RosterEntry {
  return {
    id,
    name,
    num: 0,
    types: ['Normal'],
    baseStats: NO_STATS,
    baseSpeciesId: id,
    forme: null,
    megaCapable: megaFormes.length > 0,
    megaFormes,
    spriteId: null,
    spriteMissing: true,
  };
}

function mapOf(entries: readonly RosterEntry[]): ReadonlyMap<string, RosterEntry> {
  return new Map(entries.map((entry) => [entry.id, entry]));
}

function pick(monId: string, megaStone?: string): PasteSlot {
  return megaStone === undefined ? { monId } : { monId, megaStone };
}

/** Parse with the real Showdown parser, or fail loudly rather than returning null. */
function parse(paste: string): { species: string; item: string }[] {
  const team = Teams.import(paste);
  if (team === null) throw new Error('Showdown refused to parse the paste');
  return team.map((set) => ({ species: set.species, item: set.item }));
}

function speciesOf(paste: string): string[] {
  return parse(paste).map((set) => set.species);
}

/** Emitted records, with the single trailing newline removed. */
function records(paste: string): string[] {
  expect(paste.endsWith('\n')).toBe(true);
  return paste.slice(0, -1).split('\n\n');
}

// ---------------------------------------------------------------------------
// EXPO-03 — the blank line is the record separator
// ---------------------------------------------------------------------------

describe('the blank-line record separator (EXPO-03)', () => {
  const threeSpecies = [pick('venusaur'), pick('garchomp'), pick('rotomwash')];

  it('emits exactly the verified three-species paste', () => {
    expect(toShowdownPaste(threeSpecies, snapshotById)).toBe(
      'Venusaur\n\nGarchomp\n\nRotom-Wash\n',
    );
  });

  it('is NOT the naive single-newline join, which silently imports one Pokemon', () => {
    const emitted = toShowdownPaste(threeSpecies, snapshotById);
    const naive = 'Venusaur\nGarchomp\nRotom-Wash\n';

    // The bug, demonstrated rather than described: same three names, one survives.
    expect(speciesOf(naive)).toEqual(['Venusaur']);
    expect(speciesOf(emitted)).toEqual(['Venusaur', 'Garchomp', 'Rotom-Wash']);
    expect(emitted).not.toBe(naive);
  });

  it('separates every record with exactly two newline characters', () => {
    const emitted = toShowdownPaste(threeSpecies, snapshotById);

    // No record may itself contain a newline; that is what makes every separator
    // in the string exactly `\n\n` and never a bare `\n`.
    for (const record of records(emitted)) {
      expect(record).not.toContain('\n');
      expect(record.length).toBeGreaterThan(0);
    }
    expect(records(emitted)).toHaveLength(3);
  });

  it('ends with exactly one trailing newline and no blank final record', () => {
    const emitted = toShowdownPaste(threeSpecies, snapshotById);
    expect(emitted.endsWith('\n')).toBe(true);
    expect(emitted.endsWith('\n\n')).toBe(false);
  });

  it('round-trips a full six-slot team back to six Pokemon in order', () => {
    const team = [
      pick('venusaur'),
      pick('garchomp'),
      pick('rotomwash'),
      pick('taurospaldeaaqua'),
      pick('kommoo'),
      pick('mrrime'),
    ];

    expect(speciesOf(toShowdownPaste(team, snapshotById))).toEqual([
      'Venusaur',
      'Garchomp',
      'Rotom-Wash',
      'Tauros-Paldea-Aqua',
      'Kommo-o',
      'Mr. Rime',
    ]);
  });
});

// ---------------------------------------------------------------------------
// EXPO-02 — a Mega slot exports as `Species @ StoneItemName`
// ---------------------------------------------------------------------------

describe('Mega slots (EXPO-02)', () => {
  it('emits the base species and the stone, never the Mega forme name', () => {
    const emitted = toShowdownPaste([pick('venusaur', 'Venusaurite')], snapshotById);

    expect(emitted).toBe('Venusaur @ Venusaurite\n');
    expect(emitted).not.toContain('Venusaur-Mega');
  });

  it('keeps a Mega slot blank-line separated from its neighbours', () => {
    const emitted = toShowdownPaste(
      [pick('garchomp'), pick('venusaur', 'Venusaurite'), pick('kommoo')],
      snapshotById,
    );

    expect(emitted).toBe('Garchomp\n\nVenusaur @ Venusaurite\n\nKommo-o\n');
    expect(speciesOf(emitted)).toEqual(['Garchomp', 'Venusaur', 'Kommo-o']);
  });

  it('parses back with the stone recognised as the held item', () => {
    const emitted = toShowdownPaste([pick('charizard', 'Charizardite X')], snapshotById);

    expect(emitted).toBe('Charizard @ Charizardite X\n');
    expect(parse(emitted)).toEqual([{ species: 'Charizard', item: 'Charizardite X' }]);
  });

  describe("Charizard's two stones — the ambiguity is resolved by the caller, never guessed", () => {
    it('carries two Mega formes in the committed snapshot', () => {
      expect(realEntry('charizard').megaFormes.map((forme) => forme.requiredItem)).toEqual([
        'Charizardite X',
        'Charizardite Y',
      ]);
    });

    it('emits X when X was chosen and Y when Y was chosen', () => {
      expect(toShowdownPaste([pick('charizard', 'Charizardite X')], snapshotById)).toBe(
        'Charizard @ Charizardite X\n',
      );
      expect(toShowdownPaste([pick('charizard', 'Charizardite Y')], snapshotById)).toBe(
        'Charizard @ Charizardite Y\n',
      );
    });

    it('emits the bare species when no stone was chosen, rather than picking the first', () => {
      // Charizard is megaCapable, but which Mega is a decision this function does
      // not get to make. Silently defaulting to X would fabricate a draft result.
      expect(toShowdownPaste([pick('charizard')], snapshotById)).toBe('Charizard\n');
    });
  });

  it('ignores a stone the entry does not actually own', () => {
    // Only a stone drawn from the entry's own megaFormes may reach the output, so a
    // tampered or imported document cannot inject arbitrary text onto the line.
    const emitted = toShowdownPaste([pick('charizard', 'Venusaurite')], snapshotById);
    expect(emitted).toBe('Charizard\n');
  });

  it('ignores a stone on an entry that has no Mega at all', () => {
    expect(toShowdownPaste([pick('kommoo', 'Charizardite X')], snapshotById)).toBe('Kommo-o\n');
  });

  it('never lets a caller-supplied string reach the paste verbatim', () => {
    const injected = toShowdownPaste(
      [pick('kommoo', 'Leftovers\n\nMewtwo'), pick('garchomp')],
      snapshotById,
    );

    expect(injected).toBe('Kommo-o\n\nGarchomp\n');
    expect(speciesOf(injected)).toEqual(['Kommo-o', 'Garchomp']);
  });
});

// ---------------------------------------------------------------------------
// EXPO-04 — Showdown's validator, on the half that can be automated
// ---------------------------------------------------------------------------

describe("Showdown's team validator (EXPO-04)", () => {
  const validator = new TeamValidator(CHAMPIONS_FORMAT);

  /**
   * PITFALL 8(a)'s exact failure: a bare Mega forme imports and then refuses to
   * battle with "<Forme> transforms in-battle with <Stone>, please fix its item."
   *
   * This is the ONLY validator problem that distinguishes a correct export from a
   * broken one. A species-only paste always also reports missing abilities, missing
   * moves and zero stat points — those are the parts the host fills in afterwards in
   * the teambuilder, and they are expected. See docs/export-verification.md.
   */
  function megaItemProblems(paste: string): string[] {
    const problems = validator.validateTeam(Teams.import(paste)) ?? [];
    return problems.filter((problem) => problem.includes('transforms in-battle'));
  }

  it('reports no Mega-item problem for a team this function produced', () => {
    const emitted = toShowdownPaste(
      [
        pick('charizard', 'Charizardite X'),
        pick('venusaur', 'Venusaurite'),
        pick('garchomp'),
        pick('rotomwash'),
        pick('kommoo'),
        pick('mrrime'),
      ],
      snapshotById,
    );

    expect(megaItemProblems(emitted)).toEqual([]);
  });

  it('would report one per Mega if bare forme names were emitted instead', () => {
    // Hand-written on purpose: this is the form the function must never produce.
    const wrong = 'Charizard-Mega-X\n\nVenusaur-Mega\n\nGarchomp\n';

    expect(megaItemProblems(wrong)).toEqual([
      'Charizard-Mega-X transforms in-battle with Charizardite X, please fix its item.',
      'Venusaur-Mega transforms in-battle with Venusaurite, please fix its item.',
    ]);
  });

  it('resolves every stone in the snapshot to the exact Mega forme it produces', () => {
    // Guards the requiredItem field the export line is built from: if a regulation
    // rotation ever repointed a stone, `Species @ Stone` would quietly Mega-evolve
    // into something other than the forme the draft recorded.
    const megaCapable = snapshot.entries.filter((entry) => entry.megaCapable);
    expect(megaCapable).toHaveLength(74);

    for (const entry of megaCapable) {
      for (const forme of entry.megaFormes) {
        const emitted = toShowdownPaste([pick(entry.id, forme.requiredItem)], snapshotById);
        expect(emitted).toBe(`${entry.name} @ ${forme.requiredItem}\n`);
        expect(parse(emitted)).toEqual([{ species: entry.name, item: forme.requiredItem }]);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Names are emitted verbatim, and the parser's special forms are never produced
// ---------------------------------------------------------------------------

describe('species names are emitted verbatim', () => {
  it('emits hyphenated and punctuated M-B names unchanged', () => {
    const emitted = toShowdownPaste(
      [pick('kommoo'), pick('mrrime'), pick('rotomwash'), pick('taurospaldeaaqua')],
      snapshotById,
    );

    expect(records(emitted)).toEqual([
      'Kommo-o',
      'Mr. Rime',
      'Rotom-Wash',
      'Tauros-Paldea-Aqua',
    ]);
  });

  it('preserves U+2019 rather than folding it to an ASCII apostrophe', () => {
    // Farfetch’d is `isNonstandard: "Past"` and absent from M-B (plan 01-03), so it
    // is synthesized here. The hazard is one regulation rotation away.
    const name = `Farfetch${RIGHT_SINGLE_QUOTATION_MARK}d`;
    const entry = syntheticEntry('farfetchd', name);
    const emitted = toShowdownPaste([pick('farfetchd')], mapOf([entry]));

    expect(emitted).toBe(`${name}\n`);
    expect(emitted).toContain(RIGHT_SINGLE_QUOTATION_MARK);
    expect(emitted).not.toContain("Farfetch'd");
    expect(speciesOf(emitted)).toEqual([name]);
  });

  it('emits Nidoran-M and Nidoran-F, never the gender-suffix form', () => {
    // A line ending in ` (M)` or ` (F)` is parsed as GENDER and the suffix stripped,
    // yielding species "Nidoran" — which does not exist.
    const entries = [
      syntheticEntry('nidoranm', 'Nidoran-M'),
      syntheticEntry('nidoranf', 'Nidoran-F'),
    ];
    const emitted = toShowdownPaste([pick('nidoranm'), pick('nidoranf')], mapOf(entries));

    expect(emitted).toBe('Nidoran-M\n\nNidoran-F\n');
    expect(emitted).not.toContain('(M)');
    expect(emitted).not.toContain('(F)');
    expect(speciesOf(emitted)).toEqual(['Nidoran-M', 'Nidoran-F']);

    // And the trap itself, demonstrated: the naive form loses the species entirely.
    expect(speciesOf('Nidoran (M)\n')).toEqual(['nidoran']);
  });

  it('emits Ho-Oh, Porygon-Z and Type: Null unchanged', () => {
    const entries = [
      syntheticEntry('hooh', 'Ho-Oh'),
      syntheticEntry('porygonz', 'Porygon-Z'),
      syntheticEntry('typenull', 'Type: Null'),
    ];
    const emitted = toShowdownPaste(
      [pick('hooh'), pick('porygonz'), pick('typenull')],
      mapOf(entries),
    );

    expect(records(emitted)).toEqual(['Ho-Oh', 'Porygon-Z', 'Type: Null']);
    expect(speciesOf(emitted)).toEqual(['Ho-Oh', 'Porygon-Z', 'Type: Null']);
  });

  it('emits a synthetic Mega name from the entry, not from any reconstruction', () => {
    const stone = 'Farfetchdite';
    const name = `Farfetch${RIGHT_SINGLE_QUOTATION_MARK}d`;
    const forme: MegaForme = {
      id: 'farfetchdmega',
      name: `${name}-Mega`,
      forme: 'Mega',
      requiredItem: stone,
      spriteId: null,
      types: ['Normal'],
      baseStats: NO_STATS,
    };
    const emitted = toShowdownPaste(
      [pick('farfetchd', stone)],
      mapOf([syntheticEntry('farfetchd', name, [forme])]),
    );

    expect(emitted).toBe(`${name} @ ${stone}\n`);
    expect(emitted).not.toContain('-Mega');
  });

  it('never emits a parenthesis on any line', () => {
    const everySpecies = snapshot.entries.map((entry) => pick(entry.id));
    const emitted = toShowdownPaste(everySpecies, snapshotById);

    for (const record of records(emitted)) {
      expect(record).not.toContain('(');
      expect(record).not.toContain(')');
      expect(record.endsWith(')')).toBe(false);
    }
    expect(records(emitted)).toHaveLength(snapshot.entries.length);
  });

  it('keeps the whole committed snapshot free of first-line parser collisions', () => {
    // A tripwire, not a transformation: the function emits names verbatim by design,
    // so the day a regulation introduces a hostile name this fails in CI and a human
    // decides what to do. Sanitizing here would be name surgery, which is banned.
    for (const entry of snapshot.entries) {
      expect(entry.name).not.toMatch(/[()\r\n]/);
      expect(entry.name).not.toMatch(/ @ /);
      expect(entry.name).not.toMatch(/ \((M|F)\)$/);
    }
  });
});

// ---------------------------------------------------------------------------
// Slot handling
// ---------------------------------------------------------------------------

describe('slot handling', () => {
  it('emits an empty string for an empty team', () => {
    expect(toShowdownPaste([], snapshotById)).toBe('');
  });

  it('emits an empty string when every slot is empty', () => {
    expect(toShowdownPaste([null, null, null, null, null, null], snapshotById)).toBe('');
  });

  it('emits only the filled slots of a partial team, with no blank records', () => {
    const partial = [pick('venusaur'), null, pick('garchomp'), null, null, null];
    const emitted = toShowdownPaste(partial, snapshotById);

    expect(emitted).toBe('Venusaur\n\nGarchomp\n');
    expect(records(emitted)).toEqual(['Venusaur', 'Garchomp']);
    expect(speciesOf(emitted)).toEqual(['Venusaur', 'Garchomp']);
  });

  it('emits a single record with no separator at all', () => {
    expect(toShowdownPaste([pick('venusaur')], snapshotById)).toBe('Venusaur\n');
  });

  it('drops a slot whose id is not in the roster rather than emitting the raw id', () => {
    const emitted = toShowdownPaste([pick('venusaur'), pick('notaspecies')], snapshotById);
    expect(emitted).toBe('Venusaur\n');
  });

  it('preserves slot order', () => {
    const reversed = [pick('mrrime'), pick('kommoo'), pick('venusaur')];
    expect(records(toShowdownPaste(reversed, snapshotById))).toEqual([
      'Mr. Rime',
      'Kommo-o',
      'Venusaur',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Module surface — the export format lives in exactly one place
// ---------------------------------------------------------------------------

describe('module surface', () => {
  it('exports exactly one function', () => {
    expect(Object.keys(pasteModule)).toEqual(['toShowdownPaste']);
    expect(typeof toShowdownPaste).toBe('function');
  });
});
