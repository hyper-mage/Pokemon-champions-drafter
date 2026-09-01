// @vitest-environment happy-dom

/**
 * The standings table — TOUR-08, `05-UI-SPEC` §6, D-02.
 *
 * Four of the assertions below are worth the file, and three of them are about something
 * that must NOT be on screen.
 *
 *   The metric column is ABSENT at tier 2, not present and empty. D-02 rejected a
 *   greyed-out differential column, and an empty column is a different statement from a
 *   table that has two tiebreak links. So the query here is one that an empty cell would
 *   still satisfy — it counts the header spans and the metric cells, rather than reading
 *   text off a row.
 *
 *   The two captions are asserted with `toBe` against the contract sentences. The tier-2
 *   one is the only place on the whole screen where the lighter depth admits it reaches
 *   the host sooner, and it would look completely normal if it drifted.
 *
 *   A tied block reads 3, 3, 3 and the row after it reads 6. `3 4 5` would assert an
 *   order the tool has explicitly refused to compute, in the column beside a note that
 *   says the opposite — and it is exactly the tidy-up a later reader reaches for.
 *
 *   Nothing in the table is interactive. §Interaction states the no-roving-tabindex rule
 *   for this surface so the hook is not wired out of habit; a button appearing here is
 *   the shape that regression would take.
 *
 * Zero mocks: the component takes a folded state and reads selectors.
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { matchRecorded } from '../../src/core/actions';
import {
  initialState,
  type DraftState,
  type MatchMetric,
  type PlayerConfig,
  type TournamentConfig,
  type TournamentDepth,
} from '../../src/core/model';
import { selectStandings } from '../../src/core/tournament';
import { StandingsTable, STANDINGS_HEADING } from '../../src/ui/components/StandingsTable';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NAMES = ['Ada', 'Bo', 'Cy', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal'];

function playersOf(count: number): PlayerConfig[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    name: NAMES[index] ?? `Player ${index + 1}`,
  }));
}

interface Options {
  players?: number;
  depth?: TournamentDepth;
  metric?: MatchMetric;
}

function configWith({
  players = 4,
  depth = 'draftAndBrackets',
  metric = 'pokemonLeft',
}: Options = {}): TournamentConfig {
  return {
    formatLabel: 'Champions MB',
    players: playersOf(players),
    rounds: 2,
    rosterVersion: 'mb',
    rosterChecksum: 'test-checksum',
    poolSize: 12,
    bans: [],
    banMode: 'hostBanlist',
    megasRequiredPerTeam: 0,
    dualMegaChoices: [],
    depth,
    rules: [{ kind: 'mega', count: 0 }],
    megaFormeBans: [],
    swapBudget: 0,
    swapRounds: 0,
    bansPerPlayer: 0,
    duplicateBanPolicy: 'bothApply',
    matchMetric: metric,
    roundRobinFormat: 'bo1',
    bracketFormat: 'bo1',
  };
}

interface Recorded {
  matchId: string;
  winnerId: string;
  loserId: string;
  metric?: number;
}

/**
 * A folded state carrying the results named, and nothing else.
 *
 * The table reads `config.players` and `selectStandings`; picks and the schedule are
 * invisible to it, so a fixture that built a whole completed draft would be asserting
 * something this component cannot see.
 */
function stateWith(options: Options, results: Recorded[]): DraftState {
  const config = configWith(options);

  return {
    ...initialState(config),
    matchResults: results.map((row, index) => {
      const action = matchRecorded(row.matchId, row.winnerId, row.loserId, 1, 0, row.metric ?? 0);

      return {
        matchId: action.matchId,
        winnerId: action.winnerId,
        loserId: action.loserId,
        winnerGames: action.winnerGames,
        loserGames: action.loserGames,
        metric: action.metric,
        seq: index + 10,
      };
    }),
  };
}

/**
 * Six players, three of whom the chain cannot separate — the `3 3 3` then `6` fixture.
 *
 * Ada wins everything, Bo wins everything but Ada, Cy/Dee/Eli beat Fay and then cycle
 * among themselves (Cy > Dee, Dee > Eli, Eli > Cy), and Fay wins nothing. The cycle is the
 * point: it is exactly the shape head-to-head cannot resolve, and at three players the
 * chain does not even try.
 */
const THREE_WAY_TIE: Recorded[] = [
  { matchId: 'rr:0:1', winnerId: 'p1', loserId: 'p2' },
  { matchId: 'rr:0:2', winnerId: 'p1', loserId: 'p3' },
  { matchId: 'rr:0:3', winnerId: 'p1', loserId: 'p4' },
  { matchId: 'rr:0:4', winnerId: 'p1', loserId: 'p5' },
  { matchId: 'rr:0:5', winnerId: 'p1', loserId: 'p6' },
  { matchId: 'rr:1:2', winnerId: 'p2', loserId: 'p3' },
  { matchId: 'rr:1:3', winnerId: 'p2', loserId: 'p4' },
  { matchId: 'rr:1:4', winnerId: 'p2', loserId: 'p5' },
  { matchId: 'rr:1:5', winnerId: 'p2', loserId: 'p6' },
  { matchId: 'rr:2:3', winnerId: 'p3', loserId: 'p4' },
  { matchId: 'rr:2:4', winnerId: 'p5', loserId: 'p3' },
  { matchId: 'rr:2:5', winnerId: 'p3', loserId: 'p6' },
  { matchId: 'rr:3:4', winnerId: 'p4', loserId: 'p5' },
  { matchId: 'rr:3:5', winnerId: 'p4', loserId: 'p6' },
  { matchId: 'rr:4:5', winnerId: 'p5', loserId: 'p6' },
];

/**
 * Four players, two on two wins and two on one — and the metric splits only the top pair.
 *
 * At tier 3 the leaders separate on the metric (8 against 2) and the bottom pair, level on
 * it, falls through to head-to-head. One fixture, both tier-3 notes.
 */
const METRIC_THEN_HEAD_TO_HEAD: Recorded[] = [
  { matchId: 'rr:0:1', winnerId: 'p1', loserId: 'p2', metric: 5 },
  { matchId: 'rr:0:2', winnerId: 'p1', loserId: 'p3', metric: 3 },
  { matchId: 'rr:0:3', winnerId: 'p4', loserId: 'p1', metric: 1 },
  { matchId: 'rr:1:2', winnerId: 'p2', loserId: 'p3', metric: 1 },
  { matchId: 'rr:1:3', winnerId: 'p2', loserId: 'p4', metric: 1 },
  { matchId: 'rr:2:3', winnerId: 'p3', loserId: 'p4', metric: 1 },
];

// ---------------------------------------------------------------------------

let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(() => {
  render(null, host);
  host.remove();
});

function draw(state: DraftState): void {
  act(() => {
    render(<StandingsTable state={state} />, host);
  });
}

function headers(): string[] {
  return Array.from(host.querySelectorAll('.standings-table__head .standings-table__column')).map(
    (cell) => (cell.textContent ?? '').trim(),
  );
}

function caption(): string {
  return (host.querySelector('.standings-table__caption')?.textContent ?? '').trim();
}

function rows(): HTMLLIElement[] {
  return Array.from(host.querySelectorAll('li.standings-table__row'));
}

function cellText(row: Element, part: string): string {
  return (row.querySelector(`.standings-table__${part}`)?.textContent ?? '').trim();
}

function column(part: string): string[] {
  return rows().map((row) => cellText(row, part));
}

// ---------------------------------------------------------------------------

describe('the table itself', () => {
  it('names itself with the contract heading', () => {
    draw(stateWith({}, METRIC_THEN_HEAD_TO_HEAD));

    expect(host.querySelector('.standings-table__heading')?.textContent).toBe(
      STANDINGS_HEADING,
    );
  });

  it('renders the rows as list items of one ordered list, because the ordinal is the information', () => {
    draw(stateWith({}, METRIC_THEN_HEAD_TO_HEAD));

    expect(host.querySelectorAll('ol')).toHaveLength(1);
    expect(host.querySelectorAll('ol > li')).toHaveLength(4);
  });

  it('renders one row per player, in position order, with names rather than ids', () => {
    draw(stateWith({ depth: 'draftBracketsAndLog' }, METRIC_THEN_HEAD_TO_HEAD));

    expect(column('player')).toEqual(['Ada', 'Bo', 'Cy', 'Dee']);
  });

  it('renders the record as wins and losses with an en dash', () => {
    draw(stateWith({ depth: 'draftBracketsAndLog' }, METRIC_THEN_HEAD_TO_HEAD));

    expect(column('record')).toEqual(['2–1', '2–1', '1–2', '1–2']);
  });

  it('holds no interactive cell and wires no roving tabindex', () => {
    draw(stateWith({ players: 6 }, THREE_WAY_TIE));

    expect(host.querySelectorAll('button')).toHaveLength(0);
    expect(host.querySelectorAll('[tabindex]')).toHaveLength(0);
  });
});

describe('the metric column', () => {
  it('renders at draftBracketsAndLog, named for the metric the config chose', () => {
    draw(stateWith({ depth: 'draftBracketsAndLog' }, METRIC_THEN_HEAD_TO_HEAD));

    expect(headers()).toEqual(['Position', 'Player', 'Record', 'Pokémon left', 'Tiebreak note']);
    expect(column('metric')).toEqual(['8', '2', '1', '1']);
  });

  it('takes the KO difference label when that is the configured metric', () => {
    draw(
      stateWith({ depth: 'draftBracketsAndLog', metric: 'koDifference' }, METRIC_THEN_HEAD_TO_HEAD),
    );

    expect(headers()).toContain('KO difference');
  });

  it('is ABSENT at draftAndBrackets, not present and empty — D-02', () => {
    draw(stateWith({ depth: 'draftAndBrackets' }, METRIC_THEN_HEAD_TO_HEAD));

    // Both queries would find an empty cell if one were rendered: the header count is one
    // lower rather than one blank, and there is no metric cell in any row at all.
    expect(headers()).toEqual(['Position', 'Player', 'Record', 'Tiebreak note']);
    expect(host.querySelectorAll('.standings-table__metric')).toHaveLength(0);
  });
});

describe('the caption that states the chain', () => {
  it('names three links at draftBracketsAndLog', () => {
    draw(stateWith({ depth: 'draftBracketsAndLog' }, METRIC_THEN_HEAD_TO_HEAD));

    expect(caption()).toBe(
      'Ties break on record, then Pokémon left summed across every match, then head-to-head between two players. Anything still tied is yours to order.',
    );
  });

  it('names two links at draftAndBrackets and says the depth is why', () => {
    draw(stateWith({ depth: 'draftAndBrackets' }, METRIC_THEN_HEAD_TO_HEAD));

    expect(caption()).toBe(
      'Ties break on record, then head-to-head between two players. Draft and brackets records no numbers, so there is no Pokémon left link and a tie reaches you sooner.',
    );
  });

  it('interpolates the configured metric into both captions', () => {
    draw(
      stateWith({ depth: 'draftBracketsAndLog', metric: 'koDifference' }, METRIC_THEN_HEAD_TO_HEAD),
    );
    expect(caption()).toContain('then KO difference summed across every match');

    draw(stateWith({ depth: 'draftAndBrackets', metric: 'koDifference' }, METRIC_THEN_HEAD_TO_HEAD));
    expect(caption()).toContain('there is no KO difference link');
  });
});

describe('the note that says which link decided the row', () => {
  it('leaves a row that was never tied empty', () => {
    const state = stateWith({ players: 6, depth: 'draftAndBrackets' }, THREE_WAY_TIE);
    draw(state);

    // Ada, Bo and Fay each hold a place of their own on record alone.
    expect(selectStandings(state).map((row) => row.decidedBy)).toEqual([
      'record',
      'record',
      'tied',
      'tied',
      'tied',
      'record',
    ]);
    expect(column('note')[0]).toBe('');
    expect(column('note')[1]).toBe('');
    expect(column('note')[5]).toBe('');
  });

  it('says the metric decided it when the metric split the record block', () => {
    draw(stateWith({ depth: 'draftBracketsAndLog' }, METRIC_THEN_HEAD_TO_HEAD));

    expect(column('note')[0]).toBe('Tied on record · Pokémon left decided it');
    expect(column('note')[1]).toBe('Tied on record · Pokémon left decided it');
  });

  it('names both earlier links in the head-to-head note at tier 3', () => {
    draw(stateWith({ depth: 'draftBracketsAndLog' }, METRIC_THEN_HEAD_TO_HEAD));

    expect(column('note')[2]).toBe(
      'Tied on record and Pokémon left · head-to-head decided it',
    );
  });

  it('names only record in the head-to-head note at tier 2 — a different string, not a trim', () => {
    draw(stateWith({ depth: 'draftAndBrackets' }, METRIC_THEN_HEAD_TO_HEAD));

    const notes = column('note');
    expect(notes[0]).toBe('Tied on record · head-to-head decided it');
    expect(notes[2]).toBe('Tied on record · head-to-head decided it');
    expect(notes[0]).not.toContain('Pokémon left');
  });

  it('marks EVERY row of a still-tied block, not just the first', () => {
    draw(stateWith({ players: 6, depth: 'draftAndBrackets' }, THREE_WAY_TIE));

    const notes = column('note');
    expect(notes[2]).toBe('Tied — order these yourself');
    expect(notes[3]).toBe('Tied — order these yourself');
    expect(notes[4]).toBe('Tied — order these yourself');
  });
});

describe('the position column', () => {
  it('shares one number across a tied block and resumes past the whole of it', () => {
    draw(stateWith({ players: 6, depth: 'draftAndBrackets' }, THREE_WAY_TIE));

    // 3, 3, 3 then 6 — never 3, 4, 5. The shared number is the only rendering that agrees
    // with the note in the same row.
    expect(column('position')).toEqual(['1', '2', '3', '3', '3', '6']);
  });

  it('counts up through a block the chain did resolve', () => {
    draw(stateWith({ depth: 'draftBracketsAndLog' }, METRIC_THEN_HEAD_TO_HEAD));

    expect(column('position')).toEqual(['1', '2', '3', '4']);
  });

  it('renders the selector position verbatim rather than the row index', () => {
    const state = stateWith({ players: 6, depth: 'draftAndBrackets' }, THREE_WAY_TIE);
    draw(state);

    expect(column('position')).toEqual(
      selectStandings(state).map((row) => String(row.position)),
    );
  });
});
