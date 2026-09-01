// @vitest-environment happy-dom

/**
 * One bracket cell in five states — TOUR-03, `05-UI-SPEC` §9.
 *
 * Four of the assertions below are the ones worth the file.
 *
 *   A BYE IS NOT A BUTTON AND IS NOT INERT. §9's paragraph is about how a bye READS: an
 *   empty second slot would take the not-yet-played treatment and look like a match
 *   somebody forgot to record. A bye rendered as a disabled button would say something
 *   equally untrue in the other direction — that there is a game here the host is not
 *   allowed to record. There is no game.
 *
 *   EVERY STATE RESERVES THE SAME CHROME. Asserted structurally rather than in pixels,
 *   because the environment these tests run in has no layout engine and would report every
 *   card as zero tall. Two slot rows and one result row on every card is the thing the
 *   height rule is made of, and it is the thing that regresses when somebody renders the
 *   result row only when there is a result.
 *
 *   NOTHING IS ACCENT-COLOURED. §Color's first reservation names four of the states this
 *   component draws and forbids the accent on all of them. A whole round is playable at
 *   once, which is exactly when a highlight gets added.
 *
 *   INERT ARIA IS ABSENT, NEVER `"false"` (WR-04). A card that shipped `aria-disabled`
 *   permanently set would announce every live match as unavailable.
 *
 * Zero hand-written bracket data: the fixtures fold a real document and read `selectBracket`,
 * so a card here is drawn from the same object the screen draws from.
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { matchRecorded } from '../../src/core/actions';
import {
  initialState,
  type DraftState,
  type MatchResult,
  type PlayerConfig,
  type StageFormat,
  type TournamentConfig,
  type TournamentDepth,
} from '../../src/core/model';
import { selectBracket, type BracketMatch } from '../../src/core/tournament';
import { MatchCard, type MatchCardProps, type MatchSource } from '../../src/ui/components/MatchCard';

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

function configWith(
  players: number,
  depth: TournamentDepth = 'draftBracketsAndLog',
  bracketFormat: StageFormat = 'bo3',
): TournamentConfig {
  return {
    formatLabel: 'Champions MB',
    players: playersOf(players),
    rounds: 2,
    rosterVersion: 'mb',
    rosterChecksum: 'test-checksum',
    poolSize: 32,
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
  winnerGames?: number;
  loserGames?: number;
  metric?: number;
}

function stateWith(
  seedCount: number,
  results: Recorded[],
  depth: TournamentDepth = 'draftBracketsAndLog',
  bracketFormat: StageFormat = 'bo3',
): DraftState {
  const config = configWith(seedCount, depth, bracketFormat);

  return {
    ...initialState(config),
    cut: { seeds: config.players.map((player) => player.id), seq: 900 },
    matchResults: results.map((row, index) => {
      const action = matchRecorded(
        row.matchId,
        row.winnerId,
        row.loserId,
        row.winnerGames ?? 2,
        row.loserGames ?? 1,
        row.metric ?? 4,
      );

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

function bracketOf(state: DraftState) {
  const bracket = selectBracket(state);
  if (bracket === null) throw new Error('no bracket in fixture');
  return bracket;
}

function nameOf(playerId: string): string {
  const index = Number(playerId.slice(1)) - 1;
  return NAMES[index] ?? playerId;
}

function resultFor(state: DraftState, matchId: string): MatchResult | null {
  return state.matchResults.find((row) => row.matchId === matchId) ?? null;
}

// ---------------------------------------------------------------------------

let host: HTMLDivElement;
let selected: ReturnType<typeof vi.fn<MatchCardProps['onSelect']>>;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  selected = vi.fn<MatchCardProps['onSelect']>();
});

afterEach(() => {
  render(null, host);
  host.remove();
});

type Overrides = Partial<Omit<MatchCardProps, 'match'>>;

function draw(match: BracketMatch, overrides: Overrides = {}): void {
  act(() => {
    render(
      <MatchCard
        match={match}
        nameOf={nameOf}
        upperSource={null}
        lowerSource={null}
        result={null}
        isFinal={false}
        format="bo3"
        metricName="Pokémon left"
        locked={false}
        onSelect={selected}
        {...overrides}
      />,
      host,
    );
  });
}

function card(): HTMLElement {
  const node = host.querySelector<HTMLElement>('.match-card');
  if (node === null) throw new Error('no card');
  return node;
}

/** The one hidden span, which is the card's whole accessible name. */
function spokenName(): string {
  return (host.querySelector('.visually-hidden')?.textContent ?? '').trim();
}

function slots(): string[] {
  return [...host.querySelectorAll('.match-card__slot')].map((node) =>
    (node.textContent ?? '').trim(),
  );
}

const SEMI_1: MatchSource = { roundLabel: 'Semi-final', slot: 1 };
const SEMI_2: MatchSource = { roundLabel: 'Semi-final', slot: 2 };

// ---------------------------------------------------------------------------

describe('the playable card', () => {
  it('is a real button naming both players, with an empty result area', () => {
    const state = stateWith(8, []);
    const first = bracketOf(state).rounds[0]?.[0];
    if (first === undefined) throw new Error('no first-round match');

    draw(first);

    expect(card().tagName).toBe('BUTTON');
    expect(slots()).toEqual(['Ada', 'Hal']);
    expect(host.querySelector('.match-card__result--empty')).not.toBeNull();
    expect(spokenName()).toBe('Ada versus Hal — not played yet');
  });

  it('never carries aria-disabled as "false" while it is live', () => {
    const state = stateWith(8, []);
    const first = bracketOf(state).rounds[0]?.[0];
    if (first === undefined) throw new Error('no first-round match');

    draw(first);

    expect(card().getAttribute('aria-disabled')).toBeNull();
  });

  it('reports the pairing and the BRACKET format when it is chosen', () => {
    const state = stateWith(8, []);
    const first = bracketOf(state).rounds[0]?.[0];
    if (first === undefined) throw new Error('no first-round match');

    draw(first);
    act(() => {
      card().click();
    });

    expect(selected).toHaveBeenCalledTimes(1);
    expect(selected).toHaveBeenCalledWith({
      matchId: 'br:1:1',
      aId: 'p1',
      aName: 'Ada',
      bId: 'p8',
      bName: 'Hal',
      format: 'bo3',
    });
  });
});

describe('the unknown-participant card', () => {
  it('names the match each empty slot is waiting on', () => {
    const state = stateWith(8, []);
    const final = bracketOf(state).final;

    draw(final, { upperSource: SEMI_1, lowerSource: SEMI_2, isFinal: true });

    expect(slots()).toEqual(['Winner of Semi-final 1', 'Winner of Semi-final 2']);
  });

  it('carries the waiting reason in its accessible name and is inert', () => {
    const state = stateWith(8, []);
    const final = bracketOf(state).final;

    draw(final, { upperSource: SEMI_1, lowerSource: SEMI_2, isFinal: true });

    expect(card().getAttribute('aria-disabled')).toBe('true');
    expect(spokenName()).toContain('This match is waiting on Semi-final 1.');
    expect(spokenName()).toContain('This match is waiting on Semi-final 2.');
  });

  it('refuses the click rather than reporting a match with an empty slot', () => {
    const state = stateWith(8, []);
    const final = bracketOf(state).final;

    draw(final, { upperSource: SEMI_1, lowerSource: SEMI_2, isFinal: true });
    act(() => {
      card().click();
    });

    expect(selected).not.toHaveBeenCalled();
  });

  it('never takes the native disabled attribute', () => {
    const state = stateWith(8, []);
    const final = bracketOf(state).final;

    draw(final, { upperSource: SEMI_1, lowerSource: SEMI_2, isFinal: true });

    expect(card().hasAttribute('disabled')).toBe(false);
  });
});

describe('the bye card', () => {
  /** 7 seeds take 1 bye, and `selectBracket` puts it on seed 1 with no branch. */
  function byeCard(): BracketMatch {
    const state = stateWith(7, []);
    const bye = bracketOf(state).rounds[0]?.find((match) => match.isBye);
    if (bye === undefined) throw new Error('no bye in a 7-seed bracket');
    return bye;
  }

  it('renders the seeded player beside the word, resolved', () => {
    draw(byeCard());

    expect(slots()).toEqual(['Ada', 'Bye']);
    expect(spokenName()).toBe('Ada — Bye');
  });

  it('is not a button and carries no inert ARIA', () => {
    draw(byeCard());

    expect(card().tagName).toBe('DIV');
    expect(host.querySelector('button')).toBeNull();
    expect(card().getAttribute('aria-disabled')).toBeNull();
    expect(card().hasAttribute('disabled')).toBe(false);
  });

  it('reserves the same chrome as an unresolved card, so the column cannot reflow', () => {
    const state = stateWith(8, []);
    const unresolved = bracketOf(state).final;

    draw(byeCard());
    const byeShape = {
      slots: host.querySelectorAll('.match-card__slot').length,
      results: host.querySelectorAll('.match-card__result').length,
    };

    draw(unresolved, { upperSource: SEMI_1, lowerSource: SEMI_2 });
    const openShape = {
      slots: host.querySelectorAll('.match-card__slot').length,
      results: host.querySelectorAll('.match-card__result').length,
    };

    expect(byeShape).toEqual({ slots: 2, results: 1 });
    expect(openShape).toEqual(byeShape);
  });
});

describe('the recorded card', () => {
  const RECORDED: Recorded[] = [
    { matchId: 'br:1:1', winnerId: 'p1', loserId: 'p8', winnerGames: 2, loserGames: 1, metric: 4 },
  ];

  it('renders the games and, at tier 3, the metric after the separator', () => {
    const state = stateWith(8, RECORDED);
    const match = bracketOf(state).rounds[0]?.[0];
    if (match === undefined) throw new Error('no first-round match');

    draw(match, { result: resultFor(state, 'br:1:1') });

    expect(host.querySelector('.match-card__result')?.textContent).toBe('2–1 · 4');
    expect(host.querySelector('.match-card__result--empty')).toBeNull();
  });

  it('marks the winner with a boundary rather than a colour', () => {
    const state = stateWith(8, RECORDED);
    const match = bracketOf(state).rounds[0]?.[0];
    if (match === undefined) throw new Error('no first-round match');

    draw(match, { result: resultFor(state, 'br:1:1') });

    const won = [...host.querySelectorAll('.match-card__slot--won')];
    expect(won.map((node) => (node.textContent ?? '').trim())).toEqual(['Ada']);
    expect(card().className).toContain('match-card--recorded');
  });

  it('names the winner, the loser and the number in its accessible name', () => {
    const state = stateWith(8, RECORDED);
    const match = bracketOf(state).rounds[0]?.[0];
    if (match === undefined) throw new Error('no first-round match');

    draw(match, { result: resultFor(state, 'br:1:1') });

    expect(spokenName()).toBe('Ada beat Hal 2–1, 4 Pokémon left');
  });

  it('shows no number at tier 2, where none was recorded', () => {
    const state = stateWith(8, RECORDED, 'draftAndBrackets', 'bo1');
    const match = bracketOf(state).rounds[0]?.[0];
    if (match === undefined) throw new Error('no first-round match');

    draw(match, { result: resultFor(state, 'br:1:1'), format: 'bo1', metricName: null });

    expect(host.querySelector('.match-card__result')?.textContent).toBe('');
    expect(spokenName()).toBe('Ada beat Hal');
  });

  it('stays correctable — it is still a live button', () => {
    const state = stateWith(8, RECORDED);
    const match = bracketOf(state).rounds[0]?.[0];
    if (match === undefined) throw new Error('no first-round match');

    draw(match, { result: resultFor(state, 'br:1:1') });
    act(() => {
      card().click();
    });

    expect(selected).toHaveBeenCalledTimes(1);
  });
});

describe('the final, once recorded', () => {
  /** Every match in a 4-seed bracket, so the final has a real winner. */
  const RUN: Recorded[] = [
    { matchId: 'br:1:1', winnerId: 'p1', loserId: 'p4' },
    { matchId: 'br:1:2', winnerId: 'p2', loserId: 'p3' },
    { matchId: 'br:2:1', winnerId: 'p1', loserId: 'p2' },
  ];

  it('names the champion above the winner', () => {
    const state = stateWith(4, RUN);
    const bracket = bracketOf(state);

    draw(bracket.final, { result: resultFor(state, 'br:2:1'), isFinal: true });

    expect(host.querySelector('.match-card__champion-label')?.textContent).toBe('Champion');
    expect(host.querySelector('.match-card__champion-name')?.textContent).toBe('Ada');
    expect(card().className).toContain('match-card--champion');
    expect(spokenName()).toContain('Champion Ada.');
  });

  it('does not name a champion while the final is unrecorded', () => {
    const state = stateWith(4, RUN.slice(0, 2));
    const bracket = bracketOf(state);

    draw(bracket.final, { result: null, isFinal: true });

    expect(host.querySelector('.match-card__champion')).toBeNull();
    expect(card().className).not.toContain('match-card--champion');
  });
});

describe('a finished tournament', () => {
  const RUN: Recorded[] = [
    { matchId: 'br:1:1', winnerId: 'p1', loserId: 'p4' },
    { matchId: 'br:1:2', winnerId: 'p2', loserId: 'p3' },
    { matchId: 'br:2:1', winnerId: 'p1', loserId: 'p2' },
  ];

  it('carries the finished reason in a recorded card’s accessible name', () => {
    const state = stateWith(4, RUN);
    const match = bracketOf(state).rounds[0]?.[0];
    if (match === undefined) throw new Error('no first-round match');

    draw(match, { result: resultFor(state, 'br:1:1'), locked: true });

    expect(card().getAttribute('aria-disabled')).toBe('true');
    expect(spokenName()).toContain('This tournament is finished. Reopen it to change a result.');
  });

  it('keeps the card present and refuses the click, rather than hiding it', () => {
    const state = stateWith(4, RUN);
    const match = bracketOf(state).rounds[0]?.[0];
    if (match === undefined) throw new Error('no first-round match');

    draw(match, { result: resultFor(state, 'br:1:1'), locked: true });
    act(() => {
      card().click();
    });

    expect(host.querySelector('.match-card')).not.toBeNull();
    expect(selected).not.toHaveBeenCalled();
    expect(card().hasAttribute('disabled')).toBe(false);
  });

  it('sheds the attribute entirely once the tournament is live again', () => {
    const state = stateWith(4, RUN);
    const match = bracketOf(state).rounds[0]?.[0];
    if (match === undefined) throw new Error('no first-round match');

    draw(match, { result: resultFor(state, 'br:1:1'), locked: true });
    expect(card().getAttribute('aria-disabled')).toBe('true');

    draw(match, { result: resultFor(state, 'br:1:1'), locked: false });
    expect(card().getAttribute('aria-disabled')).toBeNull();
  });
});

describe('what must never be on a card', () => {
  const STATES: { name: string; draw: () => void }[] = [
    {
      name: 'playable',
      draw: () => {
        const state = stateWith(8, []);
        const match = bracketOf(state).rounds[0]?.[0];
        if (match === undefined) throw new Error('no match');
        draw(match);
      },
    },
    {
      name: 'unknown',
      draw: () => {
        const state = stateWith(8, []);
        draw(bracketOf(state).final, { upperSource: SEMI_1, lowerSource: SEMI_2, isFinal: true });
      },
    },
    {
      name: 'bye',
      draw: () => {
        const state = stateWith(7, []);
        const bye = bracketOf(state).rounds[0]?.find((match) => match.isBye);
        if (bye === undefined) throw new Error('no bye');
        draw(bye);
      },
    },
    {
      name: 'recorded final',
      draw: () => {
        const state = stateWith(4, [
          { matchId: 'br:1:1', winnerId: 'p1', loserId: 'p4' },
          { matchId: 'br:1:2', winnerId: 'p2', loserId: 'p3' },
          { matchId: 'br:2:1', winnerId: 'p1', loserId: 'p2' },
        ]);
        draw(bracketOf(state).final, { result: resultFor(state, 'br:2:1'), isFinal: true });
      },
    },
  ];

  for (const state of STATES) {
    it(`carries no accent and no next marker in the ${state.name} state`, () => {
      state.draw();

      for (const node of host.querySelectorAll('*')) {
        expect(node.className.toString()).not.toMatch(/accent|next|current|active/i);
        expect(node.getAttribute('style') ?? '').not.toContain('accent');
      }
    });
  }
});
