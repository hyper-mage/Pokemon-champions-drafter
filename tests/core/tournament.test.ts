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
  selectSeeding,
  selectStandings,
  selectTournamentStage,
  type RoundRobinMatch,
  type StandingsRow,
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

/**
 * One result, addressed by WHO played rather than by index — which is what makes a
 * standings fixture readable as the night it describes.
 *
 * The id shape itself is pinned separately, by the `toEqual` over `rr:0:1`…`rr:2:3`
 * above; this helper exists so a record fixture reads `won(config, 'p2', 'p1')`.
 */
function won(
  config: TournamentConfig,
  winnerId: string,
  loserId: string,
  metric = 0,
): MatchResult {
  const ids = config.players.map((player) => player.id);
  const a = ids.indexOf(winnerId);
  const b = ids.indexOf(loserId);
  const i = Math.min(a, b);
  const j = Math.max(a, b);
  return rr(i, j, winnerId, loserId, metric);
}

/** The rows as `playerId → the thing being asserted`, so a failure names the player. */
function by<T>(rows: readonly StandingsRow[], pick: (row: StandingsRow) => T): Record<string, T> {
  const out: Record<string, T> = {};
  for (const row of rows) out[row.playerId] = pick(row);
  return out;
}

/**
 * Four players, distinct records: p1 3–0, p2 2–1, p3 1–2, p4 0–3.
 */
function distinctRecords(config: TournamentConfig): MatchResult[] {
  return [
    won(config, 'p1', 'p2'),
    won(config, 'p1', 'p3'),
    won(config, 'p1', 'p4'),
    won(config, 'p2', 'p3'),
    won(config, 'p2', 'p4'),
    won(config, 'p3', 'p4'),
  ];
}

/**
 * Four players; p2, p3 and p4 are all 2–1 and beat each other in a CYCLE — p2 over p3,
 * p3 over p4, p4 over p2 — while p1 loses everything. This is the fixture head-to-head
 * cannot answer, and the one an inconsistent comparator would answer differently on
 * different engines.
 *
 * `metrics` attributes a number to each player's wins, which is how the metric link is
 * given something to separate them with.
 */
function threeWayCycle(
  config: TournamentConfig,
  metrics: Record<string, number> = { p2: 0, p3: 0, p4: 0 },
): MatchResult[] {
  return [
    won(config, 'p2', 'p1', metrics['p2'] ?? 0),
    won(config, 'p3', 'p1', metrics['p3'] ?? 0),
    won(config, 'p4', 'p1', metrics['p4'] ?? 0),
    won(config, 'p2', 'p3', metrics['p2'] ?? 0),
    won(config, 'p3', 'p4', metrics['p3'] ?? 0),
    won(config, 'p4', 'p2', metrics['p4'] ?? 0),
  ];
}

/**
 * Six players: p1 5–0, p2 4–1, then p3/p4/p5 all 2–3 in a cycle, then p6 0–5. The block
 * that cannot be resolved sits in the MIDDLE of the table, which is what makes it a test
 * of position numbering rather than only of `decidedBy`.
 */
function tiedForThird(config: TournamentConfig): MatchResult[] {
  return [
    won(config, 'p1', 'p2'),
    won(config, 'p1', 'p3'),
    won(config, 'p1', 'p4'),
    won(config, 'p1', 'p5'),
    won(config, 'p1', 'p6'),
    won(config, 'p2', 'p3'),
    won(config, 'p2', 'p4'),
    won(config, 'p2', 'p5'),
    won(config, 'p2', 'p6'),
    won(config, 'p3', 'p4'),
    won(config, 'p3', 'p6'),
    won(config, 'p5', 'p3'),
    won(config, 'p4', 'p5'),
    won(config, 'p4', 'p6'),
    won(config, 'p5', 'p6'),
  ];
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

// ---------------------------------------------------------------------------
// selectStandings — link 1, the record
// ---------------------------------------------------------------------------

describe('selectStandings — the record link', () => {
  it('orders four distinct records and marks every row decidedBy record', () => {
    const config = configFor(4);
    const rows = selectStandings(completeState(config, { matchResults: distinctRecords(config) }));

    expect(rows.map((row) => row.playerId)).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(rows.map((row) => row.position)).toEqual([1, 2, 3, 4]);
    expect(by(rows, (row) => `${row.wins}-${row.losses}`)).toEqual({
      p1: '3-0',
      p2: '2-1',
      p3: '1-2',
      p4: '0-3',
    });
    for (const row of rows) expect(row.decidedBy, row.playerId).toBe('record');
  });

  it('has a row per player before a single result is recorded', () => {
    const rows = selectStandings(completeState(configFor(4)));
    expect(rows.length).toBe(4);
    expect(by(rows, (row) => row.wins)).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0 });
  });

  it('does not let a bracket result move a standings row', () => {
    const config = configFor(4);
    const withBracket = completeState(config, {
      matchResults: [
        ...distinctRecords(config),
        {
          matchId: 'br:1:1',
          winnerId: 'p4',
          loserId: 'p1',
          winnerGames: 2,
          loserGames: 0,
          metric: 99,
          seq: 5_000,
        },
      ],
    });
    const rows = selectStandings(withBracket);

    expect(by(rows, (row) => `${row.wins}-${row.losses}`)).toEqual({
      p1: '3-0',
      p2: '2-1',
      p3: '1-2',
      p4: '0-3',
    });
    expect(rows.map((row) => row.playerId)).toEqual(['p1', 'p2', 'p3', 'p4']);
  });
});

// ---------------------------------------------------------------------------
// selectStandings — link 2, the metric, and link 3, head-to-head
// ---------------------------------------------------------------------------

describe('selectStandings — the metric and head-to-head links', () => {
  it('breaks a two-way record tie on head-to-head', () => {
    const config = configFor(4);
    // Records (2, 2, 1, 1): p2 beat p1, p4 beat p3, so each block of two has an answer.
    const state = completeState(config, {
      matchResults: [
        won(config, 'p2', 'p1'),
        won(config, 'p1', 'p3'),
        won(config, 'p1', 'p4'),
        won(config, 'p3', 'p2'),
        won(config, 'p2', 'p4'),
        won(config, 'p4', 'p3'),
      ],
    });
    const rows = selectStandings(state);

    expect(rows.map((row) => row.playerId)).toEqual(['p2', 'p1', 'p4', 'p3']);
    expect(rows.map((row) => row.position)).toEqual([1, 2, 3, 4]);
    for (const row of rows) expect(row.decidedBy, row.playerId).toBe('headToHead');
  });

  it('reaches head-to-head for a block the METRIC narrowed to two', () => {
    // The rule is "the block is size 2", not "the record group is size 2". p2, p3 and p4
    // are all 2-1; the metric splits them into {p2} and {p3, p4}; p3 beat p4.
    const config = configFor(4);
    const state = completeState(config, {
      matchResults: threeWayCycle(config, { p2: 5, p3: 3, p4: 3 }),
    });
    const rows = selectStandings(state);

    expect(rows.map((row) => row.playerId)).toEqual(['p2', 'p3', 'p4', 'p1']);
    expect(by(rows, (row) => row.decidedBy)).toEqual({
      p2: 'metric',
      p3: 'headToHead',
      p4: 'headToHead',
      p1: 'record',
    });
    expect(rows.map((row) => row.position)).toEqual([1, 2, 3, 4]);
  });

  it('sums the metric across the matches a player WON, which is where it is recorded', () => {
    const config = configFor(4);
    const rows = selectStandings(
      completeState(config, { matchResults: threeWayCycle(config, { p2: 5, p3: 3, p4: 3 }) }),
    );

    // Two wins each at 5, 3 and 3. p1 won nothing, so there is no number attributed to it.
    expect(by(rows, (row) => row.metric)).toEqual({ p2: 10, p3: 6, p4: 6, p1: 0 });
  });

  it('leaves a two-block unresolved when the two have no recorded result between them', () => {
    // Reachable only after a D-10 void: p1 and p2 are level, and their own match is gone.
    const config = configFor(4);
    const state = completeState(config, {
      matchResults: [
        won(config, 'p1', 'p3'),
        won(config, 'p1', 'p4'),
        won(config, 'p2', 'p3'),
        won(config, 'p2', 'p4'),
      ],
    });
    const rows = selectStandings(state);

    expect(by(rows, (row) => row.decidedBy)).toEqual({
      p1: 'tied',
      p2: 'tied',
      p3: 'tied',
      p4: 'tied',
    });
    expect(by(rows, (row) => row.position)).toEqual({ p1: 1, p2: 1, p3: 3, p4: 3 });
  });
});

// ---------------------------------------------------------------------------
// selectStandings — D-02, the tier-2 table has one link fewer
// ---------------------------------------------------------------------------

describe('selectStandings at draftAndBrackets', () => {
  it('runs no metric link and leaves metric at 0 on every row', () => {
    const config = configFor(4, { depth: 'draftAndBrackets' });
    const rows = selectStandings(
      completeState(config, { matchResults: threeWayCycle(config, { p2: 5, p3: 3, p4: 3 }) }),
    );

    for (const row of rows) expect(row.metric, row.playerId).toBe(0);
    expect(rows.some((row) => row.decidedBy === 'metric')).toBe(false);
  });

  it('sends the same block straight to the host override, so it reads as tied', () => {
    // The honest cost of the lighter depth: the numbers that would have split p2 out at
    // tier 3 are not recorded here, so the host reaches the override sooner (D-02).
    const config = configFor(4, { depth: 'draftAndBrackets' });
    const rows = selectStandings(
      completeState(config, { matchResults: threeWayCycle(config, { p2: 5, p3: 3, p4: 3 }) }),
    );

    expect(by(rows, (row) => row.decidedBy)).toEqual({
      p2: 'tied',
      p3: 'tied',
      p4: 'tied',
      p1: 'record',
    });
  });
});

// ---------------------------------------------------------------------------
// selectStandings — the cycle, and what a shared position number means
// ---------------------------------------------------------------------------

describe('selectStandings — a head-to-head cycle', () => {
  it('answers a three-way cycle as tied rather than sorting it', () => {
    const config = configFor(4);
    const rows = selectStandings(completeState(config, { matchResults: threeWayCycle(config) }));

    expect(by(rows, (row) => row.decidedBy)).toEqual({
      p2: 'tied',
      p3: 'tied',
      p4: 'tied',
      p1: 'record',
    });
  });

  it('returns the same answer on every call, which an inconsistent comparator would not', () => {
    const config = configFor(4);
    const state = completeState(config, { matchResults: threeWayCycle(config) });

    expect(selectStandings(state)).toEqual(selectStandings(state));
    expect(selectStandings(state).map((row) => row.playerId)).toEqual(
      selectStandings(state).map((row) => row.playerId),
    );
  });

  it('does not throw on a cycle', () => {
    const config = configFor(4);
    const state = completeState(config, { matchResults: threeWayCycle(config) });
    expect(() => selectStandings(state)).not.toThrow();
  });

  it('shares one position across an unresolved block and skips past it', () => {
    // Three players tied for third read 3, 3, 3 — never 3, 4, 5, which would assert an
    // order the tool has explicitly refused to compute. The next resolved row is 6.
    const config = configFor(6);
    const rows = selectStandings(completeState(config, { matchResults: tiedForThird(config) }));

    expect(by(rows, (row) => row.position)).toEqual({
      p1: 1,
      p2: 2,
      p3: 3,
      p4: 3,
      p5: 3,
      p6: 6,
    });
    expect(by(rows, (row) => row.decidedBy)).toEqual({
      p1: 'record',
      p2: 'record',
      p3: 'tied',
      p4: 'tied',
      p5: 'tied',
      p6: 'record',
    });
  });

  it('builds a fresh array every call, so a caller cannot write into the fold', () => {
    const config = configFor(4);
    const state = completeState(config, { matchResults: distinctRecords(config) });
    const rows = selectStandings(state) as StandingsRow[];
    rows.pop();

    expect(selectStandings(state).length).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// selectSeeding — the standings order IS the seeding order
// ---------------------------------------------------------------------------

describe('selectSeeding', () => {
  it('is the standings player ids and nothing else', () => {
    const config = configFor(4);
    const state = completeState(config, { matchResults: distinctRecords(config) });

    expect(selectSeeding(state)).toEqual(selectStandings(state).map((row) => row.playerId));
    expect(selectSeeding(state)).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('carries an unresolved block through in the order the standings left it', () => {
    const config = configFor(6);
    const state = completeState(config, { matchResults: tiedForThird(config) });

    expect(selectSeeding(state)).toEqual(selectStandings(state).map((row) => row.playerId));
  });
});

// ---------------------------------------------------------------------------
// Link 4 — the host override, and why it invalidates itself (D-13)
// ---------------------------------------------------------------------------

/**
 * `threeWayCycle` with ONE result corrected: p1 beat p4 after all.
 *
 * That single change drops p4 from the 2-win block to the 1-win block, so the tied block
 * the host once ordered by hand — `{p2, p3, p4}` — is now `{p2, p3}`. No void action, and
 * no edit to `tiebreakOrders`: the override simply stops matching anything.
 */
function cycleAfterCorrection(config: TournamentConfig): MatchResult[] {
  return [
    won(config, 'p2', 'p1'),
    won(config, 'p3', 'p1'),
    won(config, 'p1', 'p4'),
    won(config, 'p2', 'p3'),
    won(config, 'p3', 'p4'),
    won(config, 'p4', 'p2'),
  ];
}

describe('selectStandings — the host override', () => {
  it('orders a block whose members are exactly the set the host named', () => {
    const config = configFor(4);
    const state = completeState(config, {
      matchResults: threeWayCycle(config),
      tiebreakOrders: [{ playerIds: ['p3', 'p2', 'p4'], seq: 10 }],
    });

    const rows = selectStandings(state);

    expect(rows.map((row) => row.playerId)).toEqual(['p3', 'p2', 'p4', 'p1']);
    expect(by(rows, (row) => row.decidedBy)).toEqual({
      p3: 'hostOrder',
      p2: 'hostOrder',
      p4: 'hostOrder',
      p1: 'record',
    });
  });

  it('matches by SET, so the order the host typed is not the order it must be stored in', () => {
    const config = configFor(4);
    const state = completeState(config, {
      matchResults: threeWayCycle(config),
      tiebreakOrders: [{ playerIds: ['p4', 'p2', 'p3'], seq: 10 }],
    });

    expect(selectStandings(state).map((row) => row.playerId)).toEqual(['p4', 'p2', 'p3', 'p1']);
  });

  it('does not apply when the named players are a strict SUBSET of the block', () => {
    const config = configFor(4);
    const state = completeState(config, {
      matchResults: threeWayCycle(config),
      tiebreakOrders: [{ playerIds: ['p2', 'p3'], seq: 10 }],
    });

    const rows = selectStandings(state);

    expect(by(rows, (row) => row.decidedBy)).toEqual({
      p2: 'tied',
      p3: 'tied',
      p4: 'tied',
      p1: 'record',
    });
    expect(by(rows, (row) => row.position)).toEqual({ p2: 1, p3: 1, p4: 1, p1: 4 });
  });

  it('does not apply when the named players are a strict SUPERSET of the block', () => {
    const config = configFor(4);
    const state = completeState(config, {
      matchResults: threeWayCycle(config),
      tiebreakOrders: [{ playerIds: ['p1', 'p2', 'p3', 'p4'], seq: 10 }],
    });

    expect(by(selectStandings(state), (row) => row.decidedBy)).toEqual({
      p2: 'tied',
      p3: 'tied',
      p4: 'tied',
      p1: 'record',
    });
  });

  it('takes the highest `seq` when two entries name the same set, not the last in the array', () => {
    const config = configFor(4);
    const state = completeState(config, {
      matchResults: threeWayCycle(config),
      tiebreakOrders: [
        { playerIds: ['p2', 'p3', 'p4'], seq: 30 },
        { playerIds: ['p4', 'p3', 'p2'], seq: 10 },
      ],
    });

    expect(selectStandings(state).map((row) => row.playerId)).toEqual(['p2', 'p3', 'p4', 'p1']);
  });

  it('self-invalidates when a correction changes the block, with no void action anywhere', () => {
    const config = configFor(4);
    const override = [{ playerIds: ['p3', 'p2', 'p4'], seq: 10 }];

    const before = completeState(config, {
      matchResults: threeWayCycle(config),
      tiebreakOrders: override,
    });
    expect(selectStandings(before).map((row) => row.playerId)).toEqual(['p3', 'p2', 'p4', 'p1']);
    expect(by(selectStandings(before), (row) => row.decidedBy)['p3']).toBe('hostOrder');

    // The SAME override, untouched, against a fold where the block is now {p2, p3}.
    const after = completeState(config, {
      matchResults: cycleAfterCorrection(config),
      tiebreakOrders: override,
    });

    const rows = selectStandings(after);
    // p1 beat p4 in the correction, so the 1-win block resolves p1 ahead of p4.
    expect(rows.map((row) => row.playerId)).toEqual(['p2', 'p3', 'p1', 'p4']);
    expect(by(rows, (row) => row.decidedBy)).toEqual({
      p2: 'headToHead',
      p3: 'headToHead',
      p4: 'headToHead',
      p1: 'headToHead',
    });
    expect(rows.some((row) => row.decidedBy === 'hostOrder')).toBe(false);
  });

  it('never touches a row outside the set it named, and renumbers the block sequentially', () => {
    const config = configFor(6);
    const state = completeState(config, {
      matchResults: tiedForThird(config),
      tiebreakOrders: [{ playerIds: ['p5', 'p3', 'p4'], seq: 10 }],
    });

    const rows = selectStandings(state);

    expect(rows.map((row) => row.playerId)).toEqual(['p1', 'p2', 'p5', 'p3', 'p4', 'p6']);
    // Resolved, so 3-4-5 rather than the 3-3-3 the same block reads without an override.
    expect(by(rows, (row) => row.position)).toEqual({ p1: 1, p2: 2, p5: 3, p3: 4, p4: 5, p6: 6 });
    expect(by(rows, (row) => row.decidedBy)).toEqual({
      p1: 'record',
      p2: 'record',
      p5: 'hostOrder',
      p3: 'hostOrder',
      p4: 'hostOrder',
      p6: 'record',
    });
  });
});
