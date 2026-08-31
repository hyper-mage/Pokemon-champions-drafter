// @vitest-environment happy-dom

/**
 * The round-robin crosstable — TOUR-02 / D-03, `05-UI-SPEC` §4.
 *
 * Three of the assertions below are about something that must NOT be on screen, and those
 * are the ones worth the file:
 *
 *   An unplayed cell has NO TEXT. D-03 makes the hole the signal — the eye counts holes
 *   and cannot count filled cells — so a helpful `—` or `Not played` in an empty cell
 *   would quietly destroy the thing the whole surface is built around. Asserted on
 *   `textContent`, with the accessible name asserted separately so the two cannot be
 *   confused for one another.
 *
 *   NOTHING IS MARKED AS NEXT. `05-UI-SPEC` §Accent reserved for states the prohibition
 *   outright because a yellow "next match" is the first thing a bracket implementation
 *   reaches for. There is no on-the-clock player in a fill-in-any-order round robin, so
 *   the test looks for the accent token and for any class named for a next state.
 *
 *   NO GRID ROLES. Each cell's name carries both axes, which is what makes them
 *   unnecessary; adding them later would be a second, worse navigation model.
 *
 * The 28-cell count at 8 players is the fourth: it is `n(n-1)/2` restated as a rendering,
 * and a mirrored lower triangle would silently double it.
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
  type StageFormat,
  type TournamentConfig,
  type TournamentDepth,
} from '../../src/core/model';
import {
  ResultsGrid,
  RESULTS_EMPTY,
  metricLabel,
  type ResultsGridProps,
} from '../../src/ui/components/ResultsGrid';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function playersOf(count: number): PlayerConfig[] {
  const names = ['Ada', 'Bo', 'Cy', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal'];
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    name: names[index] ?? `Player ${index + 1}`,
  }));
}

interface Options {
  players?: number;
  depth?: TournamentDepth;
  format?: StageFormat;
  metric?: MatchMetric;
}

function configWith({
  players = 4,
  depth = 'draftAndBrackets',
  format = 'bo1',
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
    roundRobinFormat: format,
    bracketFormat: format,
  };
}

/**
 * A folded state carrying the results named, and nothing else.
 *
 * The grid reads `config.players`, `selectRoundRobinMatches` and `matchResults`; it never
 * looks at picks or the schedule, so a fixture that built a whole completed draft would be
 * asserting something this component cannot see.
 */
function stateWith(
  options: Options = {},
  results: { matchId: string; winnerId: string; loserId: string; winnerGames?: number; loserGames?: number; metric?: number }[] = [],
): DraftState {
  const config = configWith(options);

  return {
    ...initialState(config),
    matchResults: results.map((row, index) => {
      const action = matchRecorded(
        row.matchId,
        row.winnerId,
        row.loserId,
        row.winnerGames ?? 1,
        row.loserGames ?? 0,
        row.metric ?? 0,
      );

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

let host: HTMLDivElement;
let selected: Parameters<ResultsGridProps['onSelectMatch']>[0][];

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  selected = [];
});

afterEach(() => {
  render(null, host);
  host.remove();
});

function draw(state: DraftState): void {
  act(() => {
    render(
      <ResultsGrid state={state} onSelectMatch={(match) => selected.push(match)} />,
      host,
    );
  });
}

function cells(): HTMLButtonElement[] {
  return Array.from(host.querySelectorAll('button'));
}

function nameOf(cell: HTMLButtonElement): string {
  return (cell.querySelector('.visually-hidden')?.textContent ?? '').trim();
}

/** What a sighted host reads in the cell — the hidden name deliberately excluded. */
function visibleText(cell: HTMLButtonElement): string {
  return (cell.querySelector('.results-grid__result')?.textContent ?? '').trim();
}

function countLine(): string {
  return (host.querySelector('.results-grid__count')?.textContent ?? '').trim();
}

// ---------------------------------------------------------------------------

describe('the shape of the crosstable', () => {
  it('renders only the upper triangle: 28 live cells at 8 players', () => {
    draw(stateWith({ players: 8 }));

    expect(cells()).toHaveLength(28);
  });

  it('renders 10 live cells at 5 players', () => {
    draw(stateWith({ players: 5 }));

    expect(cells()).toHaveLength(10);
  });

  it('hides the diagonal and the lower triangle from assistive technology, with no text', () => {
    draw(stateWith({ players: 4 }));

    const blanks = Array.from(host.querySelectorAll('.results-grid__blank'));

    // 4 diagonal + 6 lower triangle.
    expect(blanks).toHaveLength(10);
    for (const blank of blanks) {
      expect(blank.getAttribute('aria-hidden')).toBe('true');
      expect((blank.textContent ?? '').trim()).toBe('');
    }
  });

  it('renders one row label and one header per player', () => {
    draw(stateWith({ players: 4 }));

    expect(host.querySelectorAll('.results-grid__label')).toHaveLength(4);
    expect(host.querySelectorAll('.results-grid__header')).toHaveLength(4);
  });

  it('carries no grid roles at all', () => {
    draw(stateWith({ players: 6 }));

    expect(host.querySelector('[role="grid"]')).toBeNull();
    expect(host.querySelector('[role="row"]')).toBeNull();
    expect(host.querySelector('[role="gridcell"]')).toBeNull();
  });

  it('marks nothing as next and reaches for no accent', () => {
    draw(stateWith({ players: 6 }));

    const markup = host.innerHTML;
    expect(markup).not.toContain('--next');
    expect(markup).not.toContain('color-accent');
    expect(markup.toLowerCase()).not.toContain('next');
  });
});

describe('a cell', () => {
  it('is empty when the match is unplayed, and says so only to a screen reader', () => {
    draw(stateWith({ players: 4 }));

    const first = cells()[0];
    expect(first).toBeDefined();
    expect(visibleText(first as HTMLButtonElement)).toBe('');
    expect(nameOf(first as HTMLButtonElement)).toBe('Ada versus Bo — not played yet');
  });

  it('reads from the row player’s perspective at bo1', () => {
    draw(
      stateWith({ players: 4 }, [{ matchId: 'rr:0:1', winnerId: 'p1', loserId: 'p2' }]),
    );

    const first = cells()[0] as HTMLButtonElement;
    expect(visibleText(first)).toBe('Won');
    expect(nameOf(first)).toBe('Ada beat Bo');
  });

  it('shows the games at bo3, mirrored for the losing row', () => {
    draw(
      stateWith({ players: 4, format: 'bo3' }, [
        { matchId: 'rr:0:1', winnerId: 'p2', loserId: 'p1', winnerGames: 2, loserGames: 1 },
      ]),
    );

    const first = cells()[0] as HTMLButtonElement;
    expect(visibleText(first)).toBe('Lost 1–2');
    expect(nameOf(first)).toBe('Ada lost to Bo 1–2');
  });

  it('adds the metric after a hidden separator at tier 3, and names its unit once', () => {
    draw(
      stateWith({ players: 4, depth: 'draftBracketsAndLog', format: 'bo3' }, [
        {
          matchId: 'rr:0:1',
          winnerId: 'p1',
          loserId: 'p2',
          winnerGames: 2,
          loserGames: 1,
          metric: 18,
        },
      ]),
    );

    const first = cells()[0] as HTMLButtonElement;
    expect(visibleText(first)).toBe('Won 2–1 · 18');
    expect(nameOf(first)).toBe('Ada beat Bo 2–1, 18 Pokémon left');

    // The unit belongs to the caption, never to 28 cells.
    expect(visibleText(first)).not.toContain(metricLabel('pokemonLeft'));

    const separator = first.querySelector('.results-grid__sep');
    expect(separator?.getAttribute('aria-hidden')).toBe('true');
  });

  it('hands the match id back on activation', () => {
    draw(stateWith({ players: 4 }));

    act(() => {
      cells()[0]?.click();
    });

    // The PAIRING travels with the id: the dialog needs both names and the stage's format,
    // and none of the three is recoverable from a match id without parsing it.
    expect(selected).toEqual([
      {
        matchId: 'rr:0:1',
        aId: 'p1',
        aName: 'Ada',
        bId: 'p2',
        bName: 'Bo',
        format: 'bo1',
      },
    ]);
  });
});

describe('what is left', () => {
  it('counts the matches still to play', () => {
    draw(stateWith({ players: 8 }));

    expect(countLine()).toBe('28 of 28 matches still to play.');
  });

  it('falls as results land', () => {
    draw(
      stateWith({ players: 4 }, [
        { matchId: 'rr:0:1', winnerId: 'p1', loserId: 'p2' },
        { matchId: 'rr:0:2', winnerId: 'p1', loserId: 'p3' },
      ]),
    );

    expect(countLine()).toBe('4 of 6 matches still to play.');
  });

  it('reads All 28 matches are recorded. once every cell is filled', () => {
    const players = 8;
    const results: { matchId: string; winnerId: string; loserId: string }[] = [];

    for (let i = 0; i < players; i++) {
      for (let j = i + 1; j < players; j++) {
        results.push({ matchId: `rr:${i}:${j}`, winnerId: `p${i + 1}`, loserId: `p${j + 1}` });
      }
    }

    draw(stateWith({ players }, results));

    expect(countLine()).toBe('All 28 matches are recorded.');
  });

  it('shows the empty state with no results at all, and drops it after one', () => {
    draw(stateWith({ players: 4 }));
    expect(host.textContent).toContain(RESULTS_EMPTY);

    draw(stateWith({ players: 4 }, [{ matchId: 'rr:0:1', winnerId: 'p1', loserId: 'p2' }]));
    expect(host.textContent).not.toContain(RESULTS_EMPTY);
  });

  it('captions the metric at tier 3 and not at tier 2', () => {
    draw(stateWith({ players: 4, depth: 'draftBracketsAndLog', metric: 'koDifference' }));
    expect(host.textContent).toContain('Numbers are KO difference for the winner.');

    draw(stateWith({ players: 4, depth: 'draftAndBrackets' }));
    expect(host.querySelector('.results-grid__caption')).toBeNull();
  });
});

describe('keyboard navigation', () => {
  it('is one tab stop, and Right walks the live cells in reading order', () => {
    draw(stateWith({ players: 4 }));

    const all = cells();
    expect(all.filter((cell) => cell.tabIndex === 0)).toHaveLength(1);
    expect(all[0]?.tabIndex).toBe(0);

    const grid = host.querySelector('.results-grid__grid');
    expect(grid).not.toBeNull();

    act(() => {
      grid?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });

    expect(cells()[1]?.tabIndex).toBe(0);
    expect(cells()[0]?.tabIndex).toBe(-1);
  });

  it('jumps to the last live cell on End', () => {
    draw(stateWith({ players: 4 }));

    const grid = host.querySelector('.results-grid__grid');
    act(() => {
      grid?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    });

    const all = cells();
    expect(all[all.length - 1]?.tabIndex).toBe(0);
  });
});
