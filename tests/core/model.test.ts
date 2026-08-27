/**
 * model.test.ts — the version 5 config shape, and the one hazard the compiler cannot see.
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

import {
  initialState,
  SCHEMA_VERSION,
  type DraftState,
  type TournamentConfig,
} from '../../src/core/model';

/**
 * A config carrying every field versions 2, 3, 4 and 5 added, with none left at its default.
 *
 * Defaults are the wrong fixture for a copy test: `bans: []` and `dualMegaChoices: []`
 * would deep-equal each other whether the copy was deep, shallow or absent. The version 3
 * fields follow the same rule — `rules` and `megaFormeBans` are both non-empty here — and
 * so do the version 4 ones: `bansPerPlayer` is not `0` and `duplicateBanPolicy` is not
 * `'bothApply'`, so a `copyConfig` that dropped either to its default would be visible.
 *
 * The three version 5 fields are held to the same rule and it matters more for them than
 * for any field above, because all three are scalars whose default is the FIRST member of
 * their union: a `copyConfig` that dropped `roundRobinFormat` would produce `'bo1'`, which
 * reads as a perfectly ordinary tournament and is the wrong one. So the fixture pins
 * `'koDifference'`, `'bo3'` and `'bo3'` — none of them a default, all three visible.
 */
function v5Config(): TournamentConfig {
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
    matchMetric: 'koDifference',
    roundRobinFormat: 'bo3',
    bracketFormat: 'bo3',
  };
}

/**
 * A fold with every version 5 tournament field carrying a value, for the round trip.
 *
 * `initialState` then assignment, rather than a hand-written literal, so the fixture
 * cannot drift from the shape `initialState` actually produces — a literal would still
 * compile after a field was renamed underneath it.
 *
 * Every value here is deliberately NOT the initial one. `lastReopenSeq` in particular is a
 * positive number rather than `-1`, because `-1` is what an omitted field would be
 * indistinguishable from once the round trip has run.
 */
function tournamentState(): DraftState {
  const state = initialState(v5Config());

  state.matchResults = [
    {
      matchId: 'rr:0:1',
      winnerId: 'p1',
      loserId: 'p2',
      winnerGames: 2,
      loserGames: 1,
      metric: 3,
      seq: 12,
    },
    {
      matchId: 'br:1:0',
      winnerId: 'p2',
      loserId: 'p1',
      winnerGames: 2,
      loserGames: 0,
      metric: 5,
      seq: 19,
    },
  ];
  state.cut = { seeds: ['p1', 'p2'], seq: 21 };
  state.tiebreakOrders = [{ playerIds: ['p2', 'p1'], seq: 25 }];
  state.lastReopenSeq = 30;

  return state;
}

describe('SCHEMA_VERSION', () => {
  it('is 5', () => {
    expect(SCHEMA_VERSION).toBe(5);
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
    const config = v5Config();
    expect(JSON.parse(JSON.stringify(config)) as TournamentConfig).toEqual(config);
  });

  it('leaks no Set, Map, Date or class instance into the document', () => {
    assertJsonSafe(v5Config(), 'config');
  });
});

// ---------------------------------------------------------------------------
// copyConfig, through its only public caller
// ---------------------------------------------------------------------------

describe('initialState', () => {
  it('copies bans rather than aliasing the caller array', () => {
    const config = v5Config();
    const state = initialState(config);

    expect(state.config.bans).not.toBe(config.bans);
    expect(state.config.bans).toEqual(['charizard', 'garchomp']);
  });

  it('does not observe a mutation of the caller bans array made afterwards', () => {
    const config = v5Config();
    const state = initialState(config);

    config.bans.push('mewtwo');

    expect(state.config.bans).toEqual(['charizard', 'garchomp']);
  });

  it('copies each dualMegaChoices element, not merely the array holding them', () => {
    const config = v5Config();
    const state = initialState(config);

    expect(state.config.dualMegaChoices).not.toBe(config.dualMegaChoices);
    expect(state.config.dualMegaChoices[0]).not.toBe(config.dualMegaChoices[0]);

    // A `[...array]` copy passes the two assertions above and fails this one: the new
    // array holds the same element objects.
    config.dualMegaChoices[0]!.forme = 'y';
    expect(state.config.dualMegaChoices[0]?.forme).toBe('x');
  });

  it('copies each player, as it already did before version 2', () => {
    const config = v5Config();
    const state = initialState(config);

    expect(state.config.players).not.toBe(config.players);
    expect(state.config.players[0]).not.toBe(config.players[0]);

    config.players[0]!.name = 'MUTATED';
    expect(state.config.players[0]?.name).toBe('Player 1');
  });

  it('carries every version 2 and version 3 field through to the folded config', () => {
    // The compiler catches a field `copyConfig` forgot. This catches one it dropped on
    // the way to a value — a field copied as `undefined` still type-checks under a cast.
    const config = v5Config();
    expect(initialState(config).config).toEqual(config);
  });

  // -------------------------------------------------------------------------
  // Version 3 — T-03-03. `rules` and `megaFormeBans` are the two new arrays.
  // -------------------------------------------------------------------------

  it('copies megaFormeBans rather than aliasing the caller array', () => {
    const config = v5Config();
    const state = initialState(config);

    expect(state.config.megaFormeBans).not.toBe(config.megaFormeBans);
    expect(state.config.megaFormeBans).toEqual(['charizardmegax', 'gengarmega']);
  });

  it('does not observe a mutation of the caller megaFormeBans array made afterwards', () => {
    // `fold` runs `initialState` on every undo, so a shared array would surface as
    // undoing a pick changing the Mega-forme banlist.
    const config = v5Config();
    const state = initialState(config);

    config.megaFormeBans.push('gyaradosmega');

    expect(state.config.megaFormeBans).toEqual(['charizardmegax', 'gengarmega']);
  });

  it('copies each rules element, not merely the array holding them', () => {
    const config = v5Config();
    const state = initialState(config);

    expect(state.config.rules).not.toBe(config.rules);
    expect(state.config.rules[0]).not.toBe(config.rules[0]);

    // A `[...array]` copy passes the two assertions above and fails this one.
    config.rules[0]!.count = 99;
    expect(state.config.rules[0]?.count).toBe(2);
  });

  it('does not observe a mutation of the caller rules array made afterwards', () => {
    const config = v5Config();
    const state = initialState(config);

    config.rules.push({ kind: 'mega', count: 5 });

    expect(state.config.rules).toEqual([{ kind: 'mega', count: 2 }]);
  });

  it('starts the schedule empty — nothing is compiled until schedule/compiled lands', () => {
    expect(initialState(v5Config()).schedule).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Version 4 — BAN-03/BAN-04 and BAN-07. Two scalars, so the array hazard above
  // does not apply; what does apply is being dropped to a default on the way.
  // -------------------------------------------------------------------------

  it('carries both version 4 fields through at the values the caller set', () => {
    // `copyConfig` names every field explicitly rather than spreading, and the failure a
    // scalar can still have is arriving as its default: `bansPerPlayer: 0` would look
    // entirely reasonable in the folded state and would be the wrong tournament.
    const state = initialState(v5Config());

    expect(state.config.bansPerPlayer).toBe(4);
    expect(state.config.duplicateBanPolicy).toBe('reBan');
  });

  // -------------------------------------------------------------------------
  // The ban fold — BAN-03, BAN-04. Three fields, and two of the three start empty
  // where the third starts NULL, which is a distinction the screen reads.
  // -------------------------------------------------------------------------

  it('starts both ban arrays empty — nothing is banned until an action lands', () => {
    const state = initialState(v5Config());

    expect(state.banPlacements).toEqual([]);
    expect(state.banSubmissions).toEqual([]);
  });

  it('starts bansRevealed at null, which is a DIFFERENT answer from an empty reveal', () => {
    // `null` is "the reveal has not happened"; `[]` would be "it happened and nobody
    // banned anything". The blind screen branches on exactly that difference, so a field
    // initialised to `[]` would open every new tournament on the reveal.
    const state = initialState(v5Config());

    expect(state.bansRevealed).toBeNull();
    expect(state.bansRevealed).not.toEqual([]);
  });

  it('stores nothing derived alongside them', () => {
    // ARCHITECTURE rule 3, asserted rather than trusted. A ban count, a collision set and
    // a public-ban set are all folds of these three fields plus `config.bans`, and a
    // stored copy of any of them would be free to disagree with the log after an undo.
    const keys = Object.keys(initialState(v5Config()));

    expect(keys).not.toContain('banCount');
    expect(keys).not.toContain('collisionSet');
    expect(keys).not.toContain('publicBanIds');
  });

  // -------------------------------------------------------------------------
  // Version 5 — TOUR-01, TOUR-07, D-04 and D-08. Three scalars, and the failure
  // available to a scalar is arriving as the first member of its own union.
  // -------------------------------------------------------------------------

  it('carries all three version 5 fields through at the values the caller set', () => {
    const state = initialState(v5Config());

    expect(state.config.matchMetric).toBe('koDifference');
    expect(state.config.roundRobinFormat).toBe('bo3');
    expect(state.config.bracketFormat).toBe('bo3');
  });
});

// ---------------------------------------------------------------------------
// The tournament fold — TOUR-01. Four fields, and two of the four start at a
// SENTINEL rather than at an empty collection, which is a distinction the
// tournament screens read.
// ---------------------------------------------------------------------------

describe('the tournament fold', () => {
  it('starts matchResults and tiebreakOrders empty — nothing is recorded until an action lands', () => {
    const state = initialState(v5Config());

    expect(state.matchResults).toEqual([]);
    expect(state.tiebreakOrders).toEqual([]);
  });

  it('starts cut at null, which is a DIFFERENT answer from an empty cut', () => {
    // `null` is "no cut has been taken"; `{ seeds: [], seq }` would be "a cut was taken
    // and nobody made it", which is not a state the bracket can be built from. The
    // bracket stage branches on exactly that difference.
    const state = initialState(v5Config());

    expect(state.cut).toBeNull();
    expect(state.cut).not.toEqual({ seeds: [], seq: 0 });
  });

  it('starts lastReopenSeq at -1, not 0 — 0 is a legal seq', () => {
    // `store.ts` allocates `max(seq) + 1` and the first action in a document is `seq: 0`,
    // so a field initialised to `0` would read as "reopened by the first action in the
    // log" on every tournament that has never been reopened.
    const state = initialState(v5Config());

    expect(state.lastReopenSeq).toBe(-1);
    expect(state.lastReopenSeq).not.toBe(0);
  });

  it('survives a JSON round trip unchanged with all four fields carrying a value', () => {
    // CLAUDE.md §Serializability, asserted rather than trusted. `DraftState` is never
    // persisted, but the four fields below are folded from actions that are — and a `Set`
    // of seeds or a `Map` keyed by matchId would be the natural shape for both and would
    // fail here rather than in a bug report about an exported tournament.
    const state = tournamentState();

    expect(JSON.parse(JSON.stringify(state)) as DraftState).toEqual(state);
  });

  it('leaks no Set, Map, Date or class instance into the tournament fold', () => {
    const state = tournamentState();

    assertJsonSafe(state.matchResults, 'state.matchResults');
    assertJsonSafe(state.cut, 'state.cut');
    assertJsonSafe(state.tiebreakOrders, 'state.tiebreakOrders');
    assertJsonSafe(state.lastReopenSeq, 'state.lastReopenSeq');
  });

  it('stores nothing derived alongside them', () => {
    // ARCHITECTURE rule 3 again. Standings, the round-robin pairings, the bracket and
    // whether the tournament is finished are all folds of `matchResults` plus `cut` plus
    // the player list, and a stored copy of any of them would be free to disagree with the
    // log after an undo.
    const keys = Object.keys(initialState(v5Config()));

    expect(keys).not.toContain('standings');
    expect(keys).not.toContain('bracket');
    expect(keys).not.toContain('pairings');
  });
});
