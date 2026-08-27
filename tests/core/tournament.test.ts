/**
 * The round robin, the tournament stage, and the standings chain — TOUR-02, TOUR-08.
 *
 * Zero mocks, by construction. Every function under test is a pure function of the
 * document state it is handed; if a test in this file ever needs a fake clock or a fake
 * id generator, an ambient value has leaked into the core and `npm run check:pure`
 * should already have failed the build.
 *
 * ## Why these fixtures build a `DraftState` rather than fold a log
 *
 * The `tournament/*` action vocabulary lands later in this phase, so there is no action
 * this file could dispatch to put a result into `matchResults`, a cut into `cut`, or a
 * host ordering into `tiebreakOrders`. Every selector under test is stated as a function
 * of `DraftState` — the fold's OUTPUT — so the fixtures build that output directly, from
 * `initialState` plus the fields a fold would have filled in. Which log produces which
 * fold is `tests/core/reduce.test.ts`'s question; what the selectors do with the fold is
 * this file's, and the two stay answerable separately.
 */

import { describe, expect, it } from 'vitest';

import {
  initialState,
  type DraftPick,
  type DraftState,
  type MatchResult,
  type TournamentConfig,
} from '../../src/core/model';
import {
  selectRemainingMatchCount,
  selectRoundRobinMatches,
  selectTournamentStage,
  type RoundRobinMatch,
} from '../../src/core/tournament';

// ---------------------------------------------------------------------------
// Fixtures — deliberately the same shape as tests/core/undo.test.ts, so a reader
// comparing the two files is comparing behaviour rather than scaffolding.
// ---------------------------------------------------------------------------

const BASE_CONFIG: TournamentConfig = {
  formatLabel: 'Champions Test',
  players: [],
  rounds: 6,
  rosterVersion: 'mb',
  rosterChecksum: 'abc123',
  poolSize: 48,
  bans: [],
  banMode: 'hostBanlist',
  megasRequiredPerTeam: 0,
  dualMegaChoices: [],
  depth: 'draftBracketsAndLog',
  rules: [{ kind: 'mega', count: 0 }],
  megaFormeBans: [],
  swapBudget: 0,
  swapRounds: 0,
  bansPerPlayer: 0,
  duplicateBanPolicy: 'bothApply',
  matchMetric: 'pokemonLeft',
  roundRobinFormat: 'bo1',
  bracketFormat: 'bo1',
};

/** `p1`…`pN`. Ids, never display names — every assertion here compares ids. */
function playersOf(count: number): { id: string; name: string }[] {
  return Array.from({ length: count }, (_unused, index) => ({
    id: `p${index + 1}`,
    name: `Player ${index + 1}`,
  }));
}

function configFor(count: number, overrides: Partial<TournamentConfig> = {}): TournamentConfig {
  return { ...BASE_CONFIG, players: playersOf(count), ...overrides };
}

function configWithIds(ids: string[], overrides: Partial<TournamentConfig> = {}): TournamentConfig {
  return {
    ...BASE_CONFIG,
    players: ids.map((id, index) => ({ id, name: `Player ${index + 1}` })),
    ...overrides,
  };
}

/** Every team full — which is the earliest state a tournament stage can open on. */
function completePicks(config: TournamentConfig): DraftPick[] {
  const picks: DraftPick[] = [];
  for (let round = 1; round <= config.rounds; round++) {
    for (const player of config.players) {
      picks.push({
        playerId: player.id,
        monId: `m${picks.length}`,
        round,
        pickIndex: picks.length,
        seq: picks.length,
      });
    }
  }
  return picks;
}

function completeState(config: TournamentConfig, overrides: Partial<DraftState> = {}): DraftState {
  return {
    ...initialState(config),
    order: config.players.map((player) => player.id),
    picks: completePicks(config),
    ...overrides,
  };
}

/** One recorded round-robin result. `seq` is derived so a fixture never repeats one. */
function rr(
  i: number,
  j: number,
  winnerId: string,
  loserId: string,
  metric = 0,
  seq = 1_000 + i * 100 + j,
): MatchResult {
  return { matchId: `rr:${i}:${j}`, winnerId, loserId, winnerGames: 1, loserGames: 0, metric, seq };
}

// ---------------------------------------------------------------------------
// selectRoundRobinMatches — D-03's complete pair set
// ---------------------------------------------------------------------------

describe('selectRoundRobinMatches', () => {
  it('is the complete pair set at every supported player count', () => {
    // C(n,2), computed rather than quoted. The counts RESEARCH executed, and the ones
    // 05-UI-SPEC sizes the grid against, are 4 → 6, 5 → 10, 6 → 15, 7 → 21, 8 → 28.
    const expected: [number, number][] = [
      [4, 6],
      [5, 10],
      [6, 15],
      [7, 21],
      [8, 28],
    ];
    for (const [count, pairs] of expected) {
      const state = completeState(configFor(count));
      expect(selectRoundRobinMatches(state).length, `${count} players`).toBe(pairs);
    }
  });

  it('is 28 at eight players and 10 at five', () => {
    expect(selectRoundRobinMatches(completeState(configFor(8))).length).toBe(28);
    expect(selectRoundRobinMatches(completeState(configFor(5))).length).toBe(10);
  });

  it('gives every match an index-based id matching /^rr:\\d+:\\d+$/', () => {
    for (let count = 4; count <= 8; count++) {
      const state = completeState(configFor(count));
      for (const match of selectRoundRobinMatches(state)) {
        expect(match.matchId, `${count} players`).toMatch(/^rr:\d+:\d+$/);
      }
    }
  });

  it('numbers the ids rr:{i}:{j} with i < j, 0-based into config.players', () => {
    const state = completeState(configFor(4));
    expect(selectRoundRobinMatches(state).map((match) => match.matchId)).toEqual([
      'rr:0:1',
      'rr:0:2',
      'rr:0:3',
      'rr:1:2',
      'rr:1:3',
      'rr:2:3',
    ]);
  });

  it('carries the player ids as aId/bId in index order', () => {
    const state = completeState(configFor(4));
    const first = selectRoundRobinMatches(state)[0] as RoundRobinMatch;
    expect(first.aId).toBe('p1');
    expect(first.bId).toBe('p2');
  });

  it('stays unambiguous when player ids contain a colon (T-05-09)', () => {
    // `import-guard.buildPlayers` bounds a player id only as a non-empty unique string, so
    // an imported document can carry these. Concatenating two of them would collide the
    // pairs (a:b, c) and (a, b:c) onto one key, silently, inside the fold.
    const state = completeState(configWithIds(['a:b', 'c', 'a', 'b:c']));
    const ids = selectRoundRobinMatches(state).map((match) => match.matchId);
    expect(ids.length).toBe(6);
    expect(new Set(ids).size).toBe(6);
    for (const id of ids) expect(id).toMatch(/^rr:\d+:\d+$/);
  });

  it('builds a fresh array every call, so a caller cannot write into the fold', () => {
    const state = completeState(configFor(4));
    const first = selectRoundRobinMatches(state) as RoundRobinMatch[];
    first.push({ matchId: 'rr:9:9', aId: 'x', bId: 'y' });
    expect(selectRoundRobinMatches(state).length).toBe(6);
    expect(state.config.players.length).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// selectRemainingMatchCount — one selector, two consumers
// ---------------------------------------------------------------------------

describe('selectRemainingMatchCount', () => {
  it('is the whole pair set before anything is recorded', () => {
    expect(selectRemainingMatchCount(completeState(configFor(4)))).toBe(6);
  });

  it('drops by one per recorded round-robin result', () => {
    const state = completeState(configFor(4), {
      matchResults: [rr(0, 1, 'p1', 'p2'), rr(2, 3, 'p3', 'p4')],
    });
    expect(selectRemainingMatchCount(state)).toBe(4);
  });

  it('is not decremented by a bracket result', () => {
    const state = completeState(configFor(4), {
      matchResults: [
        {
          matchId: 'br:1:1',
          winnerId: 'p1',
          loserId: 'p2',
          winnerGames: 2,
          loserGames: 0,
          metric: 0,
          seq: 500,
        },
      ],
    });
    expect(selectRemainingMatchCount(state)).toBe(6);
  });

  it('reaches zero when every pairing has been played', () => {
    const config = configFor(4);
    const results = selectRoundRobinMatches(completeState(config)).map((match, index) => ({
      matchId: match.matchId,
      winnerId: match.aId,
      loserId: match.bId,
      winnerGames: 1,
      loserGames: 0,
      metric: 0,
      seq: 2_000 + index,
    }));
    expect(selectRemainingMatchCount(completeState(config, { matchResults: results }))).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// selectTournamentStage — a fold, not a flag
// ---------------------------------------------------------------------------

describe('selectTournamentStage', () => {
  it('is notRunning at draftOnly, whatever else the fold holds', () => {
    const config = configFor(4, { depth: 'draftOnly' });
    const state = completeState(config, {
      matchResults: [rr(0, 1, 'p1', 'p2')],
      cut: { seeds: ['p1', 'p2', 'p3', 'p4'], seq: 900 },
    });
    expect(selectTournamentStage(state)).toBe('notRunning');
  });

  it('is notRunning while the draft is still short of a full team', () => {
    const config = configFor(4);
    const picks = completePicks(config);
    const state: DraftState = {
      ...initialState(config),
      order: config.players.map((player) => player.id),
      picks: picks.slice(0, picks.length - 1),
    };
    expect(selectTournamentStage(state)).toBe('notRunning');
  });

  it('is notRunning for a complete pick set with a swap round still outstanding', () => {
    // `selectIsTournamentComplete` is picks-complete AND no swap round outstanding, which
    // is the same condition the export panels open on. Reused here, not re-derived.
    const state = completeState(configFor(4, { swapRounds: 1, swapBudget: 1 }));
    expect(selectTournamentStage(state)).toBe('notRunning');
  });

  it('is roundRobin once the tournament is complete and no cut has been taken', () => {
    expect(selectTournamentStage(completeState(configFor(4)))).toBe('roundRobin');
  });

  it('is bracket once a cut exists', () => {
    const state = completeState(configFor(4), {
      cut: { seeds: ['p1', 'p2', 'p3', 'p4'], seq: 900 },
    });
    expect(selectTournamentStage(state)).toBe('bracket');
  });
});
