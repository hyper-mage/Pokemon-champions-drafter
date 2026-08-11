/**
 * Selectors — every piece of derived data, and nothing stored.
 *
 * Sync rule 3: the available pool, the teams, the current turn and completion are all
 * computed from the folded log. None of them is a field. These tests exist as much to
 * pin that boundary as to check the arithmetic — if a selector below ever starts
 * reading a field that a reducer wrote for it, derived data has moved into state and
 * the stale-duplicate bug class is back.
 *
 * Zero mocks, as everywhere in `src/core`.
 */

import { describe, expect, it } from 'vitest';

import { draftStarted, pickMade, poolBuilt, type Action, type Intent } from '../../src/core/actions';
import { initialState, SCHEMA_VERSION, type TournamentConfig, type TournamentDoc } from '../../src/core/model';
import { fold } from '../../src/core/reduce';
import {
  selectAvailablePool,
  selectCurrentTurn,
  selectIsComplete,
  selectPickCount,
  selectPlayerName,
  selectTeams,
} from '../../src/core/selectors';

const CREATED_AT = 1_700_000_000_000;

const POOL = [
  'venusaur',
  'charizard',
  'blastoise',
  'garchomp',
  'rotomwash',
  'skarmory',
  'tyranitar',
  'gardevoir',
  'dragonite',
  'meganium',
  'starmie',
  'victreebel',
  'feraligatr',
];

const CONFIG: TournamentConfig = {
  formatLabel: 'Champions Test',
  players: [
    { id: 'p1', name: 'Player 1' },
    { id: 'p2', name: 'Player 2' },
  ],
  rounds: 6,
  rosterVersion: 'mb',
  rosterChecksum: 'abc123',
  poolSize: 12,
  bans: [],
  banMode: 'hostBanlist',
  megasRequiredPerTeam: 0,
  dualMegaChoices: [],
  depth: 'draftOnly',
};

const ORDER = ['p1', 'p2'];

function stamp(intent: Intent, seq: number): Action {
  return { ...intent, seq, at: CREATED_AT + seq, actorId: 'host' };
}

function makeDoc(log: readonly Action[]): TournamentDoc {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'tournament-fixture',
    createdAt: CREATED_AT,
    config: CONFIG,
    rng: { seed: 1, cursor: 0 },
    log: [...log],
  };
}

/** A started draft with `count` legal alternating picks already made. */
function stateAfter(count: number) {
  const log: Action[] = [
    stamp(poolBuilt(POOL, CONFIG.rosterVersion, CONFIG.rosterChecksum), 0),
    stamp(draftStarted(ORDER), 1),
  ];

  for (let pickIndex = 0; pickIndex < count; pickIndex++) {
    const playerId = ORDER[pickIndex % ORDER.length] as string;
    const round = Math.floor(pickIndex / ORDER.length) + 1;
    log.push(
      stamp(pickMade({ playerId, monId: POOL[pickIndex] as string, round, pickIndex }), log.length),
    );
  }

  return fold(makeDoc(log));
}

describe('selectAvailablePool', () => {
  it('is empty before the pool has been built', () => {
    expect(selectAvailablePool(initialState(CONFIG))).toEqual([]);
  });

  it('is the whole pool before any pick', () => {
    expect(selectAvailablePool(stateAfter(0))).toEqual(POOL);
  });

  it('removes every picked id', () => {
    const available = selectAvailablePool(stateAfter(3));
    expect(available).not.toContain('venusaur');
    expect(available).not.toContain('charizard');
    expect(available).not.toContain('blastoise');
    expect(available).toHaveLength(POOL.length - 3);
  });

  it('preserves the pool’s original order', () => {
    // The pool ids are built in display order, so a filter that reordered them would
    // shuffle the grid under the host's cursor on every pick.
    const outOfOrderPicks: Action[] = [
      stamp(poolBuilt(POOL, 'mb', 'abc123'), 0),
      stamp(draftStarted(ORDER), 1),
      stamp(pickMade({ playerId: 'p1', monId: 'starmie', round: 1, pickIndex: 0 }), 2),
      stamp(pickMade({ playerId: 'p2', monId: 'venusaur', round: 1, pickIndex: 1 }), 3),
      stamp(pickMade({ playerId: 'p1', monId: 'garchomp', round: 2, pickIndex: 2 }), 4),
    ];

    expect(selectAvailablePool(fold(makeDoc(outOfOrderPicks)))).toEqual([
      'charizard',
      'blastoise',
      'rotomwash',
      'skarmory',
      'tyranitar',
      'gardevoir',
      'dragonite',
      'meganium',
      'victreebel',
      'feraligatr',
    ]);
  });

  it('shrinks by exactly one on every pick', () => {
    for (let picks = 0; picks <= 12; picks++) {
      expect(selectAvailablePool(stateAfter(picks)), `after ${picks} picks`).toHaveLength(
        POOL.length - picks,
      );
    }
  });
});

describe('selectTeams', () => {
  it('gives every player a slot array as long as the round count, filled with null', () => {
    const teams = selectTeams(initialState(CONFIG));

    expect(Object.keys(teams).sort()).toEqual(['p1', 'p2']);
    expect(teams['p1']).toEqual([null, null, null, null, null, null]);
    expect(teams['p2']).toEqual([null, null, null, null, null, null]);
  });

  it('places each pick in its own round slot', () => {
    const teams = selectTeams(stateAfter(5));

    expect(teams['p1']).toEqual(['venusaur', 'blastoise', 'rotomwash', null, null, null]);
    expect(teams['p2']).toEqual(['charizard', 'garchomp', null, null, null, null]);
  });

  it('fills all twelve slots at the end of the draft', () => {
    const teams = selectTeams(stateAfter(12));

    expect(teams['p1']?.filter((slot) => slot !== null)).toHaveLength(6);
    expect(teams['p2']?.filter((slot) => slot !== null)).toHaveLength(6);
  });

  it('iterates players deterministically rather than by object key order', () => {
    // Sync rule 14. Key order survives a JSON round trip in practice, but the board
    // row order must not be the thing that proves it.
    const reversed: TournamentConfig = {
      ...CONFIG,
      players: [...CONFIG.players].reverse(),
    };

    expect(Object.keys(selectTeams(initialState(reversed)))).toEqual(['p1', 'p2']);
  });
});

describe('selectCurrentTurn', () => {
  it('is null before the draft has started', () => {
    expect(selectCurrentTurn(initialState(CONFIG))).toBeNull();
  });

  it('opens on round 1 with the first player in the recorded order', () => {
    expect(selectCurrentTurn(stateAfter(0))).toEqual({ round: 1, playerId: 'p1', pickIndex: 0 });
  });

  it('alternates strictly and rolls the round after both players have picked', () => {
    const expected = [
      { round: 1, playerId: 'p1', pickIndex: 0 },
      { round: 1, playerId: 'p2', pickIndex: 1 },
      { round: 2, playerId: 'p1', pickIndex: 2 },
      { round: 2, playerId: 'p2', pickIndex: 3 },
      { round: 3, playerId: 'p1', pickIndex: 4 },
      { round: 3, playerId: 'p2', pickIndex: 5 },
      { round: 4, playerId: 'p1', pickIndex: 6 },
      { round: 4, playerId: 'p2', pickIndex: 7 },
      { round: 5, playerId: 'p1', pickIndex: 8 },
      { round: 5, playerId: 'p2', pickIndex: 9 },
      { round: 6, playerId: 'p1', pickIndex: 10 },
      { round: 6, playerId: 'p2', pickIndex: 11 },
    ];

    expected.forEach((turn, picksMade) => {
      expect(selectCurrentTurn(stateAfter(picksMade)), `after ${picksMade} picks`).toEqual(turn);
    });
  });

  it('follows the recorded order, not the config order', () => {
    const log: Action[] = [
      stamp(poolBuilt(POOL, 'mb', 'abc123'), 0),
      stamp(draftStarted(['p2', 'p1']), 1),
    ];

    expect(selectCurrentTurn(fold(makeDoc(log)))).toEqual({
      round: 1,
      playerId: 'p2',
      pickIndex: 0,
    });
  });

  it('is null once the draft is complete', () => {
    expect(selectCurrentTurn(stateAfter(12))).toBeNull();
  });
});

describe('selectIsComplete', () => {
  it('is false until every player has six picks', () => {
    for (let picks = 0; picks < 12; picks++) {
      expect(selectIsComplete(stateAfter(picks)), `after ${picks} picks`).toBe(false);
    }
  });

  it('is true exactly when every player has six picks', () => {
    expect(selectIsComplete(stateAfter(12))).toBe(true);
  });

  it('is false on a fresh state with no pool and no order', () => {
    expect(selectIsComplete(initialState(CONFIG))).toBe(false);
  });
});

describe('selectPickCount', () => {
  it('counts the picks recorded so far', () => {
    expect(selectPickCount(initialState(CONFIG))).toBe(0);
    expect(selectPickCount(stateAfter(7))).toBe(7);
    expect(selectPickCount(stateAfter(12))).toBe(12);
  });
});

describe('selectPlayerName', () => {
  it('resolves a configured player id to its display name', () => {
    expect(selectPlayerName(initialState(CONFIG), 'p1')).toBe('Player 1');
    expect(selectPlayerName(initialState(CONFIG), 'p2')).toBe('Player 2');
  });

  it('returns null for an id the tournament does not know', () => {
    expect(selectPlayerName(initialState(CONFIG), 'ghost')).toBeNull();
  });
});

describe('scaling past two players', () => {
  // Phase 2 raises the player count. Nothing in these selectors may assume two.
  const EIGHT: TournamentConfig = {
    ...CONFIG,
    players: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'].map((id) => ({
      id,
      name: `Player ${id.slice(1)}`,
    })),
  };

  const bigPool = Array.from({ length: 60 }, (_, index) => `mon${String(index).padStart(2, '0')}`);
  const bigOrder = EIGHT.players.map((player) => player.id);

  function eightPlayerState(count: number) {
    const log: Action[] = [
      stamp(poolBuilt(bigPool, 'mb', 'abc123'), 0),
      stamp(draftStarted(bigOrder), 1),
    ];
    for (let pickIndex = 0; pickIndex < count; pickIndex++) {
      log.push(
        stamp(
          pickMade({
            playerId: bigOrder[pickIndex % bigOrder.length] as string,
            monId: bigPool[pickIndex] as string,
            round: Math.floor(pickIndex / bigOrder.length) + 1,
            pickIndex,
          }),
          log.length,
        ),
      );
    }
    return fold(
      {
        schemaVersion: SCHEMA_VERSION,
        id: 'eight',
        createdAt: CREATED_AT,
        config: EIGHT,
        rng: { seed: 1, cursor: 0 },
        log,
      },
    );
  }

  it('runs forty-eight picks across eight players and six rounds', () => {
    const state = eightPlayerState(48);

    expect(selectIsComplete(state)).toBe(true);
    expect(selectCurrentTurn(state)).toBeNull();
    expect(Object.keys(selectTeams(state))).toHaveLength(8);
    for (const slots of Object.values(selectTeams(state))) {
      expect(slots.filter((slot) => slot !== null)).toHaveLength(6);
    }
  });

  it('advances the round only after all eight have picked', () => {
    expect(selectCurrentTurn(eightPlayerState(7))).toEqual({
      round: 1,
      playerId: 'p8',
      pickIndex: 7,
    });
    expect(selectCurrentTurn(eightPlayerState(8))).toEqual({
      round: 2,
      playerId: 'p1',
      pickIndex: 8,
    });
  });
});
