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
  byeCountForCut,
  selectBracket,
  selectCutSplitsTiedBlock,
  selectRemainingMatchCount,
  selectRoundRobinMatches,
  selectSeeding,
  selectStandings,
  selectTournamentLocked,
  selectTournamentStage,
  type Bracket,
  type BracketMatch,
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

// ---------------------------------------------------------------------------
// The bracket — TOUR-03, D-07. Fixtures below this line.
//
// A cut is built DIRECTLY rather than folded, for the reason the file header
// gives: `tournament/cutTaken` lands in 05-08, and `selectBracket` is stated as a
// function of the fold's output. Seed `k` is `p{k}` throughout, so a pairing
// assertion reads as the seed table RESEARCH executed.
// ---------------------------------------------------------------------------

/** A taken cut of `seedCount` players, seeded p1 (top) … pN. */
function cutState(seedCount: number, overrides: Partial<DraftState> = {}): DraftState {
  const config = configFor(seedCount);
  return completeState(config, {
    cut: { seeds: config.players.map((player) => player.id), seq: 500 },
    ...overrides,
  });
}

/** One recorded bracket result. `seq` is derived so a fixture never repeats one. */
function br(
  round: number,
  slot: number,
  winnerId: string,
  loserId: string,
  metric = 0,
  seq = 2_000 + round * 100 + slot,
): MatchResult {
  return {
    matchId: `br:${round}:${slot}`,
    winnerId,
    loserId,
    winnerGames: 1,
    loserGames: 0,
    metric,
    seq,
  };
}

/** Every match in the bracket, flattened — the shape most invariants are stated over. */
function allMatches(bracket: Bracket): readonly BracketMatch[] {
  return bracket.rounds.flat();
}

/** `[upperId, lowerId]` for one slot, so a pairing assertion is one line. */
function pairingOf(bracket: Bracket, matchId: string): [string | null, string | null] {
  const match = allMatches(bracket).find((candidate) => candidate.matchId === matchId);
  if (match === undefined) throw new Error(`no match ${matchId}`);
  return [match.upperId, match.lowerId];
}

/** The bracket, or a thrown failure — so a test body never re-states the null check. */
function bracketOf(state: DraftState): Bracket {
  const bracket = selectBracket(state);
  if (bracket === null) throw new Error('expected a bracket');
  return bracket;
}

describe('byeCountForCut', () => {
  it('is B - n, so a power-of-two cut takes none', () => {
    expect(byeCountForCut(8)).toBe(0);
    expect(byeCountForCut(4)).toBe(0);
  });

  it('gives 7 players 1 bye, 6 players 2 and 5 players 3', () => {
    expect(byeCountForCut(7)).toBe(1);
    expect(byeCountForCut(6)).toBe(2);
    expect(byeCountForCut(5)).toBe(3);
  });

  it('agrees with the number of bye cards the bracket actually builds', () => {
    // The reason the function exists at all: the cut preview line and the bracket
    // must not be able to disagree about how many byes a size produces.
    for (const seedCount of [2, 3, 4, 5, 6, 7, 8, 9, 12, 16]) {
      const byes = allMatches(bracketOf(cutState(seedCount))).filter((m) => m.isBye).length;
      expect(byes, `${seedCount} seeds`).toBe(byeCountForCut(seedCount));
    }
  });
});

describe('selectBracket', () => {
  it('is null when no cut has been taken', () => {
    expect(selectBracket(completeState(configFor(6)))).toBeNull();
  });

  it('seeds 5 players with byes to seeds 1, 2 and 3 and exactly 4 real matches', () => {
    // ROADMAP success criterion 1, asserted PAIRING BY PAIRING rather than by count.
    const bracket = bracketOf(cutState(5));

    expect(pairingOf(bracket, 'br:1:1')).toEqual(['p1', null]);
    expect(pairingOf(bracket, 'br:1:2')).toEqual(['p4', 'p5']);
    expect(pairingOf(bracket, 'br:1:3')).toEqual(['p2', null]);
    expect(pairingOf(bracket, 'br:1:4')).toEqual(['p3', null]);

    const byeSeeds = allMatches(bracket)
      .filter((match) => match.isBye)
      .map((match) => match.upperId);
    expect(byeSeeds).toEqual(['p1', 'p2', 'p3']);

    expect(allMatches(bracket).filter((match) => !match.isBye).length).toBe(4);
  });

  it('seeds 6 players with br:1:2 = 4 vs 5 and br:1:4 = 3 vs 6', () => {
    const bracket = bracketOf(cutState(6));

    expect(pairingOf(bracket, 'br:1:1')).toEqual(['p1', null]);
    expect(pairingOf(bracket, 'br:1:2')).toEqual(['p4', 'p5']);
    expect(pairingOf(bracket, 'br:1:3')).toEqual(['p2', null]);
    expect(pairingOf(bracket, 'br:1:4')).toEqual(['p3', 'p6']);

    expect(allMatches(bracket).filter((match) => !match.isBye).length).toBe(5);
  });

  it('seeds 7 players with one bye to seed 1 and br:1:3 = 2 vs 7', () => {
    const bracket = bracketOf(cutState(7));

    expect(pairingOf(bracket, 'br:1:1')).toEqual(['p1', null]);
    expect(pairingOf(bracket, 'br:1:2')).toEqual(['p4', 'p5']);
    expect(pairingOf(bracket, 'br:1:3')).toEqual(['p2', 'p7']);
    expect(pairingOf(bracket, 'br:1:4')).toEqual(['p3', 'p6']);

    const byes = allMatches(bracket).filter((match) => match.isBye);
    expect(byes.length).toBe(1);
    expect(byes[0]?.upperId).toBe('p1');

    expect(allMatches(bracket).filter((match) => !match.isBye).length).toBe(6);
  });

  it('holds exactly N - 1 real matches at every player count', () => {
    // The single best invariant, executed by RESEARCH at these ten counts.
    for (const seedCount of [2, 3, 4, 5, 6, 7, 8, 9, 12, 16]) {
      const real = allMatches(bracketOf(cutState(seedCount))).filter((m) => !m.isBye).length;
      expect(real, `${seedCount} seeds`).toBe(seedCount - 1);
    }
  });

  it('renders three rounds at 5 seeds and does not collapse the near-empty first', () => {
    const bracket = bracketOf(cutState(5));

    expect(bracket.rounds.length).toBe(3);
    expect(bracket.rounds[0]?.length).toBe(4);
    // One real match in round 1 — and it still IS a round.
    expect(bracket.rounds[0]?.filter((match) => !match.isBye).length).toBe(1);
  });

  it('labels a round by its match count, so round 1 is the quarter-final at 8 seeds', () => {
    expect(bracketOf(cutState(8)).rounds.map((round) => round[0]?.roundLabel)).toEqual([
      'Quarter-final',
      'Semi-final',
      'Final',
    ]);

    expect(bracketOf(cutState(16)).rounds.map((round) => round[0]?.roundLabel)).toEqual([
      'Round of 16',
      'Quarter-final',
      'Semi-final',
      'Final',
    ]);
  });

  it('labels by matches-in-round even when the round is mostly byes', () => {
    // 5 seeds: round 1 has 4 cards of which 3 are byes, and it is still the quarter-final.
    expect(bracketOf(cutState(5)).rounds[0]?.[0]?.roundLabel).toBe('Quarter-final');
  });

  it('gives every match an id matching the br:{round}:{slot} shape', () => {
    for (const seedCount of [2, 3, 4, 5, 6, 7, 8, 9, 12, 16]) {
      for (const match of allMatches(bracketOf(cutState(seedCount)))) {
        expect(match.matchId, `${seedCount} seeds`).toMatch(/^br:\d+:\d+$/);
      }
    }
  });

  it('advances a bye into round 2 with no recorded result', () => {
    const bracket = bracketOf(cutState(5));

    // br:2:2 is fed by two byes, so it is playable immediately: seed 2 vs seed 3.
    expect(pairingOf(bracket, 'br:2:2')).toEqual(['p2', 'p3']);
    // br:2:1 is fed by a bye and by an unplayed match, so half of it is known.
    expect(pairingOf(bracket, 'br:2:1')).toEqual(['p1', null]);
    // A bye is not a match anyone plays, and it carries no result to record.
    expect(bracket.rounds[1]?.every((match) => !match.isBye)).toBe(true);
  });

  it('leaves a slot null while its feeder has no recorded result', () => {
    expect(pairingOf(bracketOf(cutState(4)), 'br:2:1')).toEqual([null, null]);
  });

  it('puts an odd feeder slot in the upper half of its parent', () => {
    // br:1:1 is odd → upper of br:2:1; br:1:2 is even → lower. A transposition here
    // would be invisible until a real bracket ran.
    const state = cutState(4, { matchResults: [br(1, 1, 'p4', 'p1'), br(1, 2, 'p3', 'p2')] });
    expect(pairingOf(bracketOf(state), 'br:2:1')).toEqual(['p4', 'p3']);
  });

  it('names the final and reports no champion until the final is recorded', () => {
    const state = cutState(4, { matchResults: [br(1, 1, 'p1', 'p4'), br(1, 2, 'p2', 'p3')] });
    const bracket = bracketOf(state);

    expect(bracket.final.matchId).toBe('br:2:1');
    expect(bracket.final.roundLabel).toBe('Final');
    expect(bracket.championId).toBeNull();
  });

  it('reports the champion once the final has a result', () => {
    const state = cutState(4, {
      matchResults: [br(1, 1, 'p1', 'p4'), br(1, 2, 'p2', 'p3'), br(2, 1, 'p1', 'p2')],
    });
    expect(bracketOf(state).championId).toBe('p1');
  });

  it('stores nothing — two calls on the same state are deep-equal and freshly built', () => {
    const state = cutState(6);
    const first = selectBracket(state);
    const second = selectBracket(state);

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(state.cut?.seeds).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
  });
});

// ---------------------------------------------------------------------------
// selectTournamentLocked — D-17, a fold rather than a flag
// ---------------------------------------------------------------------------

/** A finished 4-seed bracket: p1 over p4, p2 over p3, p1 over p2 in the final. */
function playedOutFour(finalSeq?: number): MatchResult[] {
  return [
    br(1, 1, 'p1', 'p4'),
    br(1, 2, 'p2', 'p3'),
    br(2, 1, 'p1', 'p2', 0, finalSeq),
  ];
}

describe('selectTournamentLocked', () => {
  it('is false when there is no cut at all', () => {
    expect(selectTournamentLocked(completeState(configFor(6)))).toBe(false);
  });

  it('is false while the final is unrecorded', () => {
    const state = cutState(4, { matchResults: [br(1, 1, 'p1', 'p4'), br(1, 2, 'p2', 'p3')] });
    expect(selectTournamentLocked(state)).toBe(false);
  });

  it('is true once the final is recorded, with lastReopenSeq at its -1 initial value', () => {
    // -1 is below every legal seq INCLUDING 0, which is the whole reason the field is
    // not initialised to 0. A tournament that has never been reopened locks.
    const state = cutState(4, { matchResults: playedOutFour() });
    expect(state.lastReopenSeq).toBe(-1);
    expect(selectTournamentLocked(state)).toBe(true);
  });

  it('is false again once a reopen sits after the final result', () => {
    const state = cutState(4, { matchResults: playedOutFour(), lastReopenSeq: 9_000 });
    expect(selectTournamentLocked(state)).toBe(false);
  });

  it('locks again when a new final is recorded above the reopen', () => {
    const state = cutState(4, {
      matchResults: playedOutFour(9_500),
      lastReopenSeq: 9_000,
    });
    expect(selectTournamentLocked(state)).toBe(true);
  });

  it('is not a stage — the bracket stays on screen when it fires (D-18)', () => {
    const state = cutState(4, { matchResults: playedOutFour() });
    expect(selectTournamentLocked(state)).toBe(true);
    expect(selectTournamentStage(state)).toBe('bracket');
  });

  it('cannot be claimed by a document — it is read off the final, not off a field', () => {
    // The same fold with the final result removed is unlocked, whatever else it carries.
    const unlocked = cutState(4, { matchResults: [], lastReopenSeq: -1 });
    expect(selectTournamentLocked(unlocked)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// selectCutSplitsTiedBlock — Pitfall 4
// ---------------------------------------------------------------------------

describe('selectCutSplitsTiedBlock', () => {
  /** Six players, complete, with p3/p4/p5 unresolved on 2-3 — the Pitfall 4 table. */
  function tiedTable(overrides: Partial<DraftState> = {}): DraftState {
    const config = configFor(6);
    return completeState(config, { matchResults: tiedForThird(config), ...overrides });
  }

  it('is true when the cut line falls inside an unresolved block', () => {
    const state = tiedTable();
    // p3, p4 and p5 all read position 3. A cut at 4 takes one of the three and the
    // bracket's seed 4 is whichever of them the fold happened to list.
    expect(by(selectStandings(state), (row) => row.position)).toEqual({
      p1: 1,
      p2: 2,
      p3: 3,
      p4: 3,
      p5: 3,
      p6: 6,
    });
    expect(selectCutSplitsTiedBlock(state, 4)).toBe(true);
    expect(selectCutSplitsTiedBlock(state, 3)).toBe(true);
  });

  it('is false when the two rows either side of the line hold different positions', () => {
    const state = tiedTable();
    expect(selectCutSplitsTiedBlock(state, 2)).toBe(false);
    expect(selectCutSplitsTiedBlock(state, 5)).toBe(false);
  });

  it('is false once the host has ordered the same block by hand', () => {
    // A host order is a RESOLUTION, so the cut through it is fine. This is the whole
    // reason the predicate reads decidedBy rather than only position.
    const state = tiedTable({ tiebreakOrders: [{ playerIds: ['p5', 'p3', 'p4'], seq: 10 }] });

    expect(by(selectStandings(state), (row) => row.decidedBy)).toMatchObject({
      p5: 'hostOrder',
      p3: 'hostOrder',
      p4: 'hostOrder',
    });
    expect(selectCutSplitsTiedBlock(state, 4)).toBe(false);
    expect(selectCutSplitsTiedBlock(state, 3)).toBe(false);
  });

  it('is false when n is the whole field — there is no row below to split against', () => {
    expect(selectCutSplitsTiedBlock(tiedTable(), 6)).toBe(false);
  });

  it('is false out of range either way', () => {
    expect(selectCutSplitsTiedBlock(tiedTable(), 0)).toBe(false);
    expect(selectCutSplitsTiedBlock(tiedTable(), 99)).toBe(false);
  });

  it('is false while the round robin is incomplete, which has its own reason', () => {
    // Nothing recorded: every row is 0-0 and shares position 1. That is not the tie
    // this predicate is about, and §8's completeness reason already covers it — two
    // reasons on one control would be the tool arguing with itself.
    const state = completeState(configFor(6));
    expect(selectRemainingMatchCount(state)).toBe(15);
    expect(selectCutSplitsTiedBlock(state, 4)).toBe(false);
  });

  it('answers the same on two calls and mutates nothing', () => {
    const state = tiedTable();
    const first = selectCutSplitsTiedBlock(state, 4);
    expect(selectCutSplitsTiedBlock(state, 4)).toBe(first);
    expect(state.tiebreakOrders).toEqual([]);
  });
});
