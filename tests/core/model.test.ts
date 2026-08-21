/**
 * model.test.ts — the version 4 config shape, and the one hazard the compiler cannot see.
 *
 * `copyConfig` is checked by TypeScript for a MISSING field: its return is an explicit
 * object literal typed `TournamentConfig`, so `strict` errors the moment a new field is
 * not copied. It is NOT checked for a shallow copy. `bans: config.bans` type-checks
 * perfectly and aliases the caller's array straight into folded state, and `initialState`
 * runs `copyConfig` on every `fold` — which means on every undo. An aliased array
 * therefore surfaces as undoing a pick quietly changing the banlist, which is a bug with
 * no compiler error behind it and no obvious place to look.
 *
 * That is what the identity assertions below are for, and why they use `toBe` / `not.toBe`
 * rather than `toEqual`: two arrays with the same contents are `toEqual` whether or not
 * they are the same array, so `toEqual` cannot see the defect at all.
 *
 * No mocks, no DOM, and no import of `src/store.ts` — `tests/core/**` running against the
 * real thing with nothing stubbed is the observable payoff of the purity rule.
 */

import { describe, expect, it } from 'vitest';

import { initialState, SCHEMA_VERSION, type TournamentConfig } from '../../src/core/model';

/**
 * A config carrying every field versions 2, 3 and 4 added, with none left at its default.
 *
 * Defaults are the wrong fixture for a copy test: `bans: []` and `dualMegaChoices: []`
 * would deep-equal each other whether the copy was deep, shallow or absent. The version 3
 * fields follow the same rule — `rules` and `megaFormeBans` are both non-empty here — and
 * so do the version 4 ones: `bansPerPlayer` is not `0` and `duplicateBanPolicy` is not
 * `'bothApply'`, so a `copyConfig` that dropped either to its default would be visible.
 */
function v4Config(): TournamentConfig {
  return {
    formatLabel: 'Champions MB',
    players: [
      { id: 'p1', name: 'Player 1' },
      { id: 'p2', name: 'Player 2' },
    ],
    rounds: 6,
    rosterVersion: 'mb',
    rosterChecksum: 'sha256-abc',
    poolSize: 48,
    bans: ['charizard', 'garchomp'],
    banMode: 'blind',
    megasRequiredPerTeam: 2,
    dualMegaChoices: [
      { speciesId: 'charizard', forme: 'x' },
      { speciesId: 'raichu', forme: 'either' },
    ],
    depth: 'draftAndBrackets',
    rules: [{ kind: 'mega', count: 2 }],
    megaFormeBans: ['charizardmegax', 'gengarmega'],
    swapBudget: 3,
    swapRounds: 1,
    bansPerPlayer: 4,
    duplicateBanPolicy: 'reBan',
  };
}

describe('SCHEMA_VERSION', () => {
  it('is 4', () => {
    expect(SCHEMA_VERSION).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Serializability — ARCHITECTURE sync rule 1
// ---------------------------------------------------------------------------

/**
 * Every value reachable from the config is a JSON primitive, a plain object or an array.
 *
 * A `Date` would survive `JSON.stringify` as a string and a `Set` as `{}`, so the round
 * trip below cannot catch either on its own — it would compare the mangled value against
 * a freshly mangled one and agree. Walking the structure and checking the prototype is
 * what actually pins "no Date, no Map, no Set, no class instance".
 */
function assertJsonSafe(value: unknown, path: string): void {
  if (value === null) return;

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      assertJsonSafe(item, `${path}[${String(index)}]`);
    });
    return;
  }

  if (typeof value === 'object') {
    expect(Object.getPrototypeOf(value) as unknown, `${path} is not a plain object`).toBe(
      Object.prototype,
    );
    for (const [key, item] of Object.entries(value)) {
      assertJsonSafe(item, `${path}.${key}`);
    }
    return;
  }

  expect(['string', 'number', 'boolean'], `${path} is a ${typeof value}`).toContain(typeof value);
}

describe('TournamentConfig serializability', () => {
  it('survives a JSON round trip unchanged with every added field set', () => {
    const config = v4Config();
    expect(JSON.parse(JSON.stringify(config)) as TournamentConfig).toEqual(config);
  });

  it('leaks no Set, Map, Date or class instance into the document', () => {
    assertJsonSafe(v4Config(), 'config');
  });
});

// ---------------------------------------------------------------------------
// copyConfig, through its only public caller
// ---------------------------------------------------------------------------

describe('initialState', () => {
  it('copies bans rather than aliasing the caller array', () => {
    const config = v4Config();
    const state = initialState(config);

    expect(state.config.bans).not.toBe(config.bans);
    expect(state.config.bans).toEqual(['charizard', 'garchomp']);
  });

  it('does not observe a mutation of the caller bans array made afterwards', () => {
    const config = v4Config();
    const state = initialState(config);

    config.bans.push('mewtwo');

    expect(state.config.bans).toEqual(['charizard', 'garchomp']);
  });

  it('copies each dualMegaChoices element, not merely the array holding them', () => {
    const config = v4Config();
    const state = initialState(config);

    expect(state.config.dualMegaChoices).not.toBe(config.dualMegaChoices);
    expect(state.config.dualMegaChoices[0]).not.toBe(config.dualMegaChoices[0]);

    // A `[...array]` copy passes the two assertions above and fails this one: the new
    // array holds the same element objects.
    config.dualMegaChoices[0]!.forme = 'y';
    expect(state.config.dualMegaChoices[0]?.forme).toBe('x');
  });

  it('copies each player, as it already did before version 2', () => {
    const config = v4Config();
    const state = initialState(config);

    expect(state.config.players).not.toBe(config.players);
    expect(state.config.players[0]).not.toBe(config.players[0]);

    config.players[0]!.name = 'MUTATED';
    expect(state.config.players[0]?.name).toBe('Player 1');
  });

  it('carries every version 2 and version 3 field through to the folded config', () => {
    // The compiler catches a field `copyConfig` forgot. This catches one it dropped on
    // the way to a value — a field copied as `undefined` still type-checks under a cast.
    const config = v4Config();
    expect(initialState(config).config).toEqual(config);
  });

  // -------------------------------------------------------------------------
  // Version 3 — T-03-03. `rules` and `megaFormeBans` are the two new arrays.
  // -------------------------------------------------------------------------

  it('copies megaFormeBans rather than aliasing the caller array', () => {
    const config = v4Config();
    const state = initialState(config);

    expect(state.config.megaFormeBans).not.toBe(config.megaFormeBans);
    expect(state.config.megaFormeBans).toEqual(['charizardmegax', 'gengarmega']);
  });

  it('does not observe a mutation of the caller megaFormeBans array made afterwards', () => {
    // `fold` runs `initialState` on every undo, so a shared array would surface as
    // undoing a pick changing the Mega-forme banlist.
    const config = v4Config();
    const state = initialState(config);

    config.megaFormeBans.push('gyaradosmega');

    expect(state.config.megaFormeBans).toEqual(['charizardmegax', 'gengarmega']);
  });

  it('copies each rules element, not merely the array holding them', () => {
    const config = v4Config();
    const state = initialState(config);

    expect(state.config.rules).not.toBe(config.rules);
    expect(state.config.rules[0]).not.toBe(config.rules[0]);

    // A `[...array]` copy passes the two assertions above and fails this one.
    config.rules[0]!.count = 99;
    expect(state.config.rules[0]?.count).toBe(2);
  });

  it('does not observe a mutation of the caller rules array made afterwards', () => {
    const config = v4Config();
    const state = initialState(config);

    config.rules.push({ kind: 'mega', count: 5 });

    expect(state.config.rules).toEqual([{ kind: 'mega', count: 2 }]);
  });

  it('starts the schedule empty — nothing is compiled until schedule/compiled lands', () => {
    expect(initialState(v4Config()).schedule).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Version 4 — BAN-03/BAN-04 and BAN-07. Two scalars, so the array hazard above
  // does not apply; what does apply is being dropped to a default on the way.
  // -------------------------------------------------------------------------

  it('carries both version 4 fields through at the values the caller set', () => {
    // `copyConfig` names every field explicitly rather than spreading, and the failure a
    // scalar can still have is arriving as its default: `bansPerPlayer: 0` would look
    // entirely reasonable in the folded state and would be the wrong tournament.
    const state = initialState(v4Config());

    expect(state.config.bansPerPlayer).toBe(4);
    expect(state.config.duplicateBanPolicy).toBe('reBan');
  });
});
