// @vitest-environment happy-dom

/**
 * The bracket — TOUR-03, `05-UI-SPEC` §9.
 *
 * Four of the assertions below are the ones worth the file.
 *
 *   A FIVE-SEED CUT RENDERS THREE ROUNDS, one of which holds a single real match.
 *   Collapsing the sparse round would put the same game in a quarter-final on one screen
 *   and a semi-final on another, which is worse than a first round with holes in it.
 *
 *   ADVANCEMENT IS NOT A WRITE. Recording a first-round result and finding the winner in
 *   the next round's card, with no bracket anywhere in the fixture, is what makes D-10's
 *   void cascade sufficient: there is no stored copy to patch and therefore none to forget.
 *
 *   NO DRAWN CONNECTOR LAYER. A layer would have to measure where the grid put each card
 *   and measure again on every resize; the elbows are borders on pseudo-elements, laid out
 *   by the same pass that laid out the card.
 *
 *   THE ROUND LABELS COME FROM THE SELECTOR. Sixteen seeds is the case that separates the
 *   two possible implementations: round one is the round of sixteen there and the
 *   quarter-final at eight, and only a label decided by matches-in-round gets both right.
 *
 * Zero mocks and no hand-written bracket: every fixture folds a document and lets
 * `selectBracket` answer.
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { matchRecorded } from '../../src/core/actions';
import {
  initialState,
  type DraftState,
  type PlayerConfig,
  type StageFormat,
  type TournamentConfig,
  type TournamentDepth,
} from '../../src/core/model';
import { selectBracket } from '../../src/core/tournament';
import {
  BracketGrid,
  BRACKET_HEADING,
  type BracketGridProps,
} from '../../src/ui/components/BracketGrid';
import { BRACKET_HEADING_ID } from '../../src/ui/components/CutControl';
import { MatchRecordDialog } from '../../src/ui/components/MatchRecordDialog';

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

function configWith(
  players: number,
  depth: TournamentDepth = 'draftAndBrackets',
  bracketFormat: StageFormat = 'bo3',
): TournamentConfig {
  return {
    formatLabel: 'Champions MB',
    players: playersOf(players),
    rounds: 2,
    rosterVersion: 'mb',
    rosterChecksum: 'test-checksum',
    poolSize: 64,
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
    matchMetric: 'pokemonLeft',
    roundRobinFormat: 'bo1',
    bracketFormat,
  };
}

interface Recorded {
  matchId: string;
  winnerId: string;
  loserId: string;
}

/**
 * A cut of the top `seedCount`, and whatever bracket results are named.
 *
 * The player list is sized to the cut, so `p1` is the top seed and the byes fall where
 * `selectBracket`'s recursion puts them. NOTHING about the bracket is in this fixture — that
 * is the point of the advancement case below.
 */
function stateWith(
  seedCount: number,
  results: Recorded[] = [],
  depth: TournamentDepth = 'draftAndBrackets',
  bracketFormat: StageFormat = 'bo3',
): DraftState {
  const config = configWith(seedCount, depth, bracketFormat);

  return {
    ...initialState(config),
    cut: { seeds: config.players.map((player) => player.id), seq: 900 },
    matchResults: results.map((row, index) => {
      const action = matchRecorded(row.matchId, row.winnerId, row.loserId, 2, 1, 0);

      return {
        matchId: action.matchId,
        winnerId: action.winnerId,
        loserId: action.loserId,
        winnerGames: action.winnerGames,
        loserGames: action.loserGames,
        metric: action.metric,
        seq: index + 100,
      };
    }),
  };
}

// ---------------------------------------------------------------------------

let host: HTMLDivElement;
let selected: ReturnType<typeof vi.fn<BracketGridProps['onSelectMatch']>>;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  selected = vi.fn<BracketGridProps['onSelectMatch']>();
});

afterEach(() => {
  render(null, host);
  host.remove();
});

function draw(state: DraftState): void {
  act(() => {
    render(<BracketGrid state={state} onSelectMatch={selected} />, host);
  });
}

function columns(): HTMLElement[] {
  return [...host.querySelectorAll<HTMLElement>('.bracket__column')];
}

function headers(): string[] {
  return [...host.querySelectorAll('.bracket__round-header')].map((node) =>
    (node.textContent ?? '').trim(),
  );
}

function cardsIn(columnIndex: number): HTMLElement[] {
  const column = columns()[columnIndex];
  if (column === undefined) throw new Error(`no column ${columnIndex}`);
  return [...column.querySelectorAll<HTMLElement>('.match-card')];
}

function cardAt(columnIndex: number, slotIndex: number): HTMLElement {
  const card = cardsIn(columnIndex)[slotIndex];
  if (card === undefined) throw new Error(`no card ${columnIndex}:${slotIndex}`);
  return card;
}

function slotsOf(card: HTMLElement): string[] {
  return [...card.querySelectorAll('.match-card__slot')].map((node) =>
    (node.textContent ?? '').trim(),
  );
}

// ---------------------------------------------------------------------------

describe('the columns and their headers', () => {
  it('renders one column per round, named by the selector', () => {
    draw(stateWith(8));

    expect(columns()).toHaveLength(3);
    expect(headers()).toEqual(['Quarter-final', 'Semi-final', 'Final']);
    expect(cardsIn(0)).toHaveLength(4);
    expect(cardsIn(1)).toHaveLength(2);
    expect(cardsIn(2)).toHaveLength(1);
  });

  it('names the first round for how many matches are in it, not for its index', () => {
    draw(stateWith(8));
    const atEight = headers()[0];

    draw(stateWith(16));
    const atSixteen = headers()[0];

    expect(atEight).toBe('Quarter-final');
    expect(atSixteen).toBe('Round of 16');
    expect(headers()).toEqual(['Round of 16', 'Quarter-final', 'Semi-final', 'Final']);
  });

  it('renders three rounds at five seeds, including the round with one real match', () => {
    draw(stateWith(5));

    expect(columns()).toHaveLength(3);
    expect(headers()).toEqual(['Quarter-final', 'Semi-final', 'Final']);

    // Four cards in round one: one real match and three byes.
    expect(cardsIn(0)).toHaveLength(4);
  });

  it('heads the region and labels it by that heading', () => {
    draw(stateWith(8));

    const heading = host.querySelector(`#${BRACKET_HEADING_ID}`);
    expect(heading?.textContent).toBe(BRACKET_HEADING);
    expect(heading?.tagName).toBe('H2');
    expect(host.querySelector('.bracket-region')?.getAttribute('aria-labelledby')).toBe(
      BRACKET_HEADING_ID,
    );
  });
});

describe('byes', () => {
  /** A bye is a card carrying the word, not a control. */
  function byeCount(): number {
    return cardsIn(0).filter((card) => slotsOf(card)[1] === 'Bye').length;
  }

  it('gives 7 seeds one bye, 6 two and 5 three, all on the top seeds', () => {
    draw(stateWith(7));
    expect(byeCount()).toBe(1);
    expect(slotsOf(cardAt(0, 0))).toEqual(['Ada', 'Bye']);

    draw(stateWith(6));
    expect(byeCount()).toBe(2);

    draw(stateWith(5));
    expect(byeCount()).toBe(3);
  });

  it('takes no bye at a power-of-two cut', () => {
    draw(stateWith(8));
    expect(byeCount()).toBe(0);

    draw(stateWith(4));
    expect(byeCount()).toBe(0);
  });
});

describe('a match whose participants are not known yet', () => {
  it('says which match each empty slot is waiting on', () => {
    draw(stateWith(8));

    expect(slotsOf(cardAt(2, 0))).toEqual(['Winner of Semi-final 1', 'Winner of Semi-final 2']);
    expect(cardAt(2, 0).getAttribute('aria-disabled')).toBe('true');
    expect(
      host.querySelector('.bracket__column:nth-child(3) .visually-hidden')?.textContent,
    ).toContain('This match is waiting on Semi-final 1.');
  });

  it('names the feeder each half of a semi-final is waiting on', () => {
    draw(stateWith(8));

    expect(slotsOf(cardAt(1, 0))).toEqual([
      'Winner of Quarter-final 1',
      'Winner of Quarter-final 2',
    ]);
    expect(slotsOf(cardAt(1, 1))).toEqual([
      'Winner of Quarter-final 3',
      'Winner of Quarter-final 4',
    ]);
  });
});

describe('advancement', () => {
  it('puts a recorded winner in the next round with no bracket stored anywhere', () => {
    const before = stateWith(8);
    draw(before);

    // `br:1:2` pairs seeds 4 and 5 — Dee and Eli — and its winner feeds the lower slot of
    // the first semi-final.
    expect(slotsOf(cardAt(0, 1))).toEqual(['Dee', 'Eli']);
    expect(slotsOf(cardAt(1, 0))[1]).toBe('Winner of Quarter-final 2');

    const after = stateWith(8, [{ matchId: 'br:1:2', winnerId: 'p5', loserId: 'p4' }]);

    // The premise, asserted rather than assumed: the fixture holds ONE match result and no
    // bracket of any kind.
    expect(after.matchResults).toHaveLength(1);
    expect(Object.keys(after)).not.toContain('bracket');

    draw(after);

    expect(slotsOf(cardAt(1, 0))[1]).toBe('Eli');
    expect(slotsOf(cardAt(1, 0))[0]).toBe('Winner of Quarter-final 1');
  });

  it('names the champion on the final once it is recorded, on the same card', () => {
    const run: Recorded[] = [
      { matchId: 'br:1:1', winnerId: 'p1', loserId: 'p4' },
      { matchId: 'br:1:2', winnerId: 'p2', loserId: 'p3' },
      { matchId: 'br:2:1', winnerId: 'p2', loserId: 'p1' },
    ];

    draw(stateWith(4, run));

    const final = cardAt(1, 0);
    expect(final.querySelector('.match-card__champion-label')?.textContent).toBe('Champion');
    expect(final.querySelector('.match-card__champion-name')?.textContent).toBe('Bo');

    // D-18: the bracket is still the bracket. No summary screen replaced it.
    expect(columns()).toHaveLength(2);
    expect(headers()).toEqual(['Semi-final', 'Final']);
  });
});

describe('recording from a bracket card', () => {
  it('opens the same dialog the crosstable opens, with the BRACKET format', () => {
    const state = stateWith(8, [], 'draftAndBrackets', 'bo3');
    draw(state);

    act(() => {
      cardAt(0, 0).click();
    });

    expect(selected).toHaveBeenCalledTimes(1);
    const reported = selected.mock.calls[0]?.[0];
    if (reported === undefined) throw new Error('no reported match');

    expect(reported).toEqual({
      matchId: 'br:1:1',
      aId: 'p1',
      aName: 'Ada',
      bId: 'p8',
      bName: 'Hal',
      // The round robin is `bo1` in this fixture, so a dialog reading the tournament's
      // format rather than the stage's would collect the wrong thing.
      format: 'bo3',
    });

    const dialogHost = document.createElement('div');
    document.body.append(dialogHost);

    act(() => {
      render(
        <MatchRecordDialog
          state={state}
          matchId={reported.matchId}
          aId={reported.aId}
          aName={reported.aName}
          bId={reported.bId}
          bName={reported.bName}
          format={reported.format}
          onRecord={() => undefined}
          onKeep={() => undefined}
        />,
        dialogHost,
      );
    });

    expect(dialogHost.querySelector('.dialog__heading')?.textContent).toBe('Ada versus Hal');

    act(() => {
      render(null, dialogHost);
    });
    dialogHost.remove();
  });

  it('refuses a bye and a card waiting on its feeders', () => {
    draw(stateWith(7));

    const bye = cardAt(0, 0);
    expect(bye.tagName).toBe('DIV');

    act(() => {
      bye.click();
      cardAt(2, 0).click();
    });

    expect(selected).not.toHaveBeenCalled();
  });
});

describe('the keyboard model and what is not on screen', () => {
  it('gives every playable card its own tab stop', () => {
    draw(stateWith(8));

    for (const card of cardsIn(0)) {
      // A plain tab stop: no shared stop, and therefore no arrow-key model to discover.
      expect(card.getAttribute('tabindex')).toBeNull();
    }
  });

  it('draws no connector layer and injects no markup', () => {
    draw(stateWith(8));

    expect(host.querySelector('svg')).toBeNull();
    expect(host.querySelector('canvas')).toBeNull();
    expect(host.querySelector('.bracket__connector')).toBeNull();
  });

  it('marks no card as next, playable now, or accent-coloured', () => {
    draw(stateWith(8));

    for (const node of host.querySelectorAll('*')) {
      expect(node.className.toString()).not.toMatch(/accent|--next|--current|--active/i);
    }
  });

  it('exposes a heading that can be focused programmatically', () => {
    draw(stateWith(8));

    const heading = host.querySelector<HTMLElement>(`#${BRACKET_HEADING_ID}`);
    if (heading === null) throw new Error('no bracket heading');

    expect(heading.getAttribute('tabindex')).toBe('-1');

    act(() => {
      heading.focus();
    });

    expect(document.activeElement).toBe(heading);
  });

  it('renders nothing at all before a cut has been taken', () => {
    const noCut = { ...stateWith(8), cut: null };
    expect(selectBracket(noCut)).toBeNull();

    draw(noCut);

    expect(host.querySelector('.bracket-region')).toBeNull();
  });
});

describe('a finished tournament', () => {
  const RUN: Recorded[] = [
    { matchId: 'br:1:1', winnerId: 'p1', loserId: 'p4' },
    { matchId: 'br:1:2', winnerId: 'p2', loserId: 'p3' },
    { matchId: 'br:2:1', winnerId: 'p2', loserId: 'p1' },
  ];

  it('leaves every card present and inert with the stated reason', () => {
    draw(stateWith(4, RUN));

    const cards = [...host.querySelectorAll<HTMLElement>('.match-card')];
    expect(cards).toHaveLength(3);

    for (const card of cards) {
      expect(card.getAttribute('aria-disabled')).toBe('true');
      expect(card.hasAttribute('disabled')).toBe(false);
      expect(card.querySelector('.visually-hidden')?.textContent).toContain(
        'This tournament is finished. Reopen it to change a result.',
      );
    }
  });

  it('records nothing from a card while it is locked', () => {
    draw(stateWith(4, RUN));

    act(() => {
      cardAt(0, 0).click();
    });

    expect(selected).not.toHaveBeenCalled();
  });
});
