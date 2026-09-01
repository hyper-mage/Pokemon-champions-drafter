// @vitest-environment happy-dom

/**
 * The cut — TOUR-09, `05-UI-SPEC` §8, D-06 and `05-RESEARCH` Pitfall 4.
 *
 * Four of the assertions below are worth the file.
 *
 *   The two inert reasons are DIFFERENT SENTENCES about different problems, and the
 *   precedence between them is pinned. A host told "record the last three matches" when the
 *   real problem is an unresolved tie has been sent to fix the wrong thing, and a host told
 *   "order the tied players" while results are still coming in has been asked to settle
 *   standings that are still moving.
 *
 *   The tie-split reason exists at all. §8 gates only on completeness, and completeness
 *   does not imply resolution — Pitfall 4's failure is a complete round robin with seeds 3,
 *   4 and 5 level and a cut to top 4 putting an arbitrary player into the bracket. Nothing
 *   on screen would say which of the three it chose.
 *
 *   The dispatched seeds are the first `n` of `selectSeeding`. The standings order IS the
 *   seeding order, which is D-06's whole reason for putting the cut on this screen; a
 *   component that re-sorted would be free to seed a bracket the host never read.
 *
 *   Focus lands on the bracket heading. `Take the cut` does not survive its own success, so
 *   there is no element to leave focus on and `<body>` is where it goes if nobody moves it.
 *
 * Zero mocks: the component takes a folded state and a callback. The focus case drives
 * `TournamentScreen`, because the handoff is deliberately owned there — see its doc block.
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { matchRecorded } from '../../src/core/actions';
import {
  initialState,
  type DraftState,
  type PlayerConfig,
  type TournamentConfig,
} from '../../src/core/model';
import { selectSeeding, selectTournamentStage } from '../../src/core/tournament';
import {
  BRACKET_HEADING_ID,
  CUT_FIELD_LABEL,
  CUT_HEADING,
  CUT_REASON_ID,
  CutControl,
  TAKE_THE_CUT,
} from '../../src/ui/components/CutControl';
import { announce } from '../../src/ui/components/LiveRegion';
import { TournamentScreen } from '../../src/ui/screens/TournamentScreen';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NAMES = ['Ada', 'Bo', 'Cy', 'Dee', 'Eli', 'Fay'];
const PLAYER_COUNT = 6;
const ROUNDS = 2;

function playersOf(count: number): PlayerConfig[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    name: NAMES[index] ?? `Player ${index + 1}`,
  }));
}

function configWith(): TournamentConfig {
  return {
    formatLabel: 'Champions MB',
    players: playersOf(PLAYER_COUNT),
    rounds: ROUNDS,
    rosterVersion: 'mb',
    rosterChecksum: 'test-checksum',
    poolSize: 24,
    bans: [],
    banMode: 'hostBanlist',
    megasRequiredPerTeam: 0,
    dualMegaChoices: [],
    depth: 'draftAndBrackets',
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
}

interface Recorded {
  matchId: string;
  winnerId: string;
  loserId: string;
}

/**
 * A folded state carrying the results named, plus a finished draft.
 *
 * The picks are here only because `selectTournamentStage` gates on
 * `selectIsTournamentComplete` — the focus case renders the whole screen, and a screen that
 * thought the tournament had not started would render no stage block at all. `CutControl`
 * itself never looks at them.
 */
function stateWith(results: Recorded[], cutSeeds: string[] | null = null): DraftState {
  const config = configWith();
  let pickIndex = 0;

  return {
    ...initialState(config),
    order: config.players.map((player) => player.id),
    schedule: [
      { index: 1, kind: 'open' },
      { index: 2, kind: 'open' },
    ],
    picks: config.players.flatMap((player) =>
      Array.from({ length: ROUNDS }, (_, round) => ({
        playerId: player.id,
        monId: `mon-${pickIndex}`,
        round: round + 1,
        pickIndex: pickIndex++,
        seq: pickIndex + 2,
      })),
    ),
    matchResults: results.map((row, index) => {
      const action = matchRecorded(row.matchId, row.winnerId, row.loserId, 1, 0, 0);

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
    cut: cutSeeds === null ? null : { seeds: [...cutSeeds], seq: 900 },
  };
}

/**
 * A transitive ladder: Ada 5, Bo 4, Cy 3, Dee 2, Eli 1, Fay 0.
 *
 * Every row separates on link 1, so nothing here is tied and the only thing that can hold
 * the cut back is completeness. That is the point — it isolates one gate at a time.
 */
const LADDER: Recorded[] = (() => {
  const rows: Recorded[] = [];
  for (let i = 0; i < PLAYER_COUNT; i++) {
    for (let j = i + 1; j < PLAYER_COUNT; j++) {
      rows.push({ matchId: `rr:${i}:${j}`, winnerId: `p${i + 1}`, loserId: `p${j + 1}` });
    }
  }
  return rows;
})();

/**
 * Complete, and Cy/Dee/Eli in a cycle at 2 wins each — positions 3, 3, 3, then Fay at 6.
 *
 * A cut of 4 lands between Dee and Eli, both members of that block. This is Pitfall 4 in
 * fixture form.
 */
const TIED_ACROSS_FOUR: Recorded[] = [
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
 * The same cycle with Ada versus Bo unrecorded — BOTH conditions at once.
 *
 * The standings hold two unresolved blocks, one of which straddles a cut of 4, and one
 * match is still to play. `selectCutSplitsTiedBlock` refuses to answer the tie question
 * while the round robin is incomplete, which is exactly the precedence this fixture exists
 * to prove the surface renders.
 */
const TIED_AND_INCOMPLETE: Recorded[] = TIED_ACROSS_FOUR.filter(
  (row) => row.matchId !== 'rr:0:1',
);

const TOP_BAR = {
  onDownload: () => undefined,
  onImportFile: () => undefined,
  importError: null,
  onRequestUndo: () => undefined,
  onRequestAbandon: () => undefined,
  bannedNames: [] as readonly string[],
};

// ---------------------------------------------------------------------------

let host: HTMLDivElement;
let taken: ReturnType<typeof vi.fn<(seeds: readonly string[]) => void>>;

beforeEach(() => {
  localStorage.clear();
  announce('');
  host = document.createElement('div');
  document.body.append(host);
  taken = vi.fn<(seeds: readonly string[]) => void>();
});

afterEach(() => {
  render(null, host);
  host.remove();
  localStorage.clear();
});

function draw(state: DraftState): void {
  act(() => {
    render(<CutControl state={state} onTakeCut={taken} />, host);
  });
}

function field(): HTMLInputElement {
  const input = host.querySelector<HTMLInputElement>('.numeric-field__input');
  if (input === null) throw new Error('no numeric field');
  return input;
}

function type(value: string): void {
  act(() => {
    field().value = value;
    field().dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function preview(): string | null {
  const node = host.querySelector('.cut-control__preview');
  return node === null ? null : (node.textContent ?? '').trim();
}

function reason(): string | null {
  const node = host.querySelector('.cut-control__reason');
  return node === null ? null : (node.textContent ?? '').trim();
}

function action(): HTMLButtonElement {
  const button = host.querySelector<HTMLButtonElement>('.cut-control__action');
  if (button === null) throw new Error('no cut button');
  return button;
}

function click(button: HTMLButtonElement): void {
  act(() => {
    button.click();
  });
}

// ---------------------------------------------------------------------------

describe('the field and its preview', () => {
  it('labels the field and names the surface', () => {
    draw(stateWith(LADDER));

    expect(host.querySelector('.cut-control__heading')?.textContent).toBe(CUT_HEADING);
    expect(host.querySelector('.numeric-field__label')?.textContent).toBe(CUT_FIELD_LABEL);
    expect(action().textContent).toBe(TAKE_THE_CUT);
  });

  it('bounds the field two through the player count', () => {
    draw(stateWith(LADDER));

    expect(field().getAttribute('min')).toBe('2');
    expect(field().getAttribute('max')).toBe(String(PLAYER_COUNT));
  });

  it('previews the byes a cut of five produces', () => {
    draw(stateWith(LADDER));
    type('5');

    expect(preview()).toBe('Top 5 advance. Seeds 1 to 3 get a bye.');
  });

  it('says there are none when the size is a power of two', () => {
    draw(stateWith(LADDER));
    type('4');

    expect(preview()).toBe('Top 4 advance. No byes at 4.');
  });

  it('recomputes as the host types, before anything is reported', () => {
    draw(stateWith(LADDER));

    type('4');
    expect(preview()).toBe('Top 4 advance. No byes at 4.');

    type('6');
    expect(preview()).toBe('Top 6 advance. Seeds 1 to 2 get a bye.');

    expect(taken).not.toHaveBeenCalled();
  });

  it('shows no preview for a size that is not a cut', () => {
    draw(stateWith(LADDER));
    expect(preview()).toBeNull();

    // Not a whole number of players. `slice` would truncate it into a cut of four while
    // the line said `Top 4.5 advance`.
    type('4.5');
    expect(preview()).toBeNull();

    type('1');
    expect(preview()).toBeNull();
  });
});

describe('the reasons it refuses', () => {
  it('is inert while matches are unrecorded, and says how many', () => {
    draw(stateWith(LADDER.slice(0, LADDER.length - 3)));
    type('4');

    expect(action().getAttribute('aria-disabled')).toBe('true');
    expect(reason()).toBe('3 matches are still to play. Record them all before you cut.');
  });

  it('pluralises the count down to the last match', () => {
    draw(stateWith(LADDER.slice(0, LADDER.length - 1)));
    type('4');

    expect(reason()).toBe('1 match is still to play. Record them all before you cut.');
  });

  it('pins the reason region id and points the button at it', () => {
    draw(stateWith(LADDER.slice(0, LADDER.length - 1)));
    type('4');

    expect(host.querySelector('.cut-control__reason')?.id).toBe(CUT_REASON_ID);
    expect(action().getAttribute('aria-describedby')).toBe(CUT_REASON_ID);
  });

  it('refuses a cut that would split a block nobody has ordered', () => {
    draw(stateWith(TIED_ACROSS_FOUR));
    type('4');

    expect(action().getAttribute('aria-disabled')).toBe('true');
    expect(reason()).toBe(
      'The cut at 4 splits a tie. Order the tied players yourself before you take it.',
    );
  });

  it('allows a cut that falls between two blocks', () => {
    draw(stateWith(TIED_ACROSS_FOUR));
    type('5');

    expect(action().getAttribute('aria-disabled')).toBe(null);
    expect(reason()).toBeNull();
  });

  it('shows the incomplete reason when both conditions hold — completeness is the earlier problem', () => {
    draw(stateWith(TIED_AND_INCOMPLETE));
    type('4');

    expect(reason()).toBe('1 match is still to play. Record them all before you cut.');
    expect(reason()).not.toContain('splits a tie');
  });

  it('sheds aria-disabled entirely once neither condition holds', () => {
    draw(stateWith(LADDER));
    type('4');

    // `null`, not `'false'`. An `aria-disabled="false"` would pass every other assertion
    // here and still tell a screen reader the opposite of the truth.
    expect(action().getAttribute('aria-disabled')).toBe(null);
    expect(action().getAttribute('aria-describedby')).toBe(null);
  });

  it('never takes the native disabled attribute', () => {
    draw(stateWith(LADDER.slice(0, 3)));
    type('4');

    expect(action().hasAttribute('disabled')).toBe(false);

    // Focusable, which is the whole reason the reason beside it is reachable.
    action().focus();
    expect(document.activeElement).toBe(action());
  });

  it('reports nothing when an inert button is clicked', () => {
    draw(stateWith(TIED_ACROSS_FOUR));
    type('4');

    click(action());

    expect(taken).not.toHaveBeenCalled();
  });

  it('reports nothing when the size has not been chosen', () => {
    draw(stateWith(LADDER));

    click(action());

    expect(taken).not.toHaveBeenCalled();
  });
});

describe('taking it', () => {
  it('reports the first n seeds of the standings, exactly once', () => {
    const state = stateWith(LADDER);

    draw(state);
    type('4');
    click(action());

    expect(taken).toHaveBeenCalledTimes(1);
    expect(taken.mock.calls[0]?.[0]).toEqual(selectSeeding(state).slice(0, 4));
    expect(taken.mock.calls[0]?.[0]).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('asks for no confirmation — the cut destroys nothing and is undoable', () => {
    draw(stateWith(LADDER));
    type('4');
    click(action());

    expect(taken).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe('focus after the cut', () => {
  it('lands on the bracket heading, because Take the cut no longer exists', () => {
    /*
     * THE STAND-IN HEADING IS GONE, and its removal is the assertion.
     *
     * While 05-13 was unbuilt this test appended its own `<h2>` carrying
     * `BRACKET_HEADING_ID`, because the seam had one end and no other. `BracketGrid` now
     * mounts the real one, so the handoff is exercised end to end: the id the cut control
     * exports, the heading the bracket renders, and the screen effect that joins them. A
     * stand-in left in place would in fact have made this WEAKER than before — two elements
     * would carry the id, the lookup would return whichever came first in the document, and
     * the test would pass on a bracket that never rendered a heading at all.
     */
    const beforeCut = stateWith(LADDER);
    const afterCut = stateWith(LADDER, ['p1', 'p2', 'p3', 'p4']);

    // The premise, asserted rather than assumed.
    expect(selectTournamentStage(beforeCut)).toBe('roundRobin');
    expect(selectTournamentStage(afterCut)).toBe('bracket');

    const screen = (state: DraftState) => (
      <TournamentScreen
        state={state}
        topBar={TOP_BAR}
        onBackToDraft={() => undefined}
        onSelectMatch={() => undefined}
        onRequestReopen={() => undefined}
        // No recap surface in these cases — 05-14 gives the recap its own file.
        recap={null}
      />
    );

    act(() => {
      render(screen(beforeCut), host);
    });

    const button = host.querySelector<HTMLButtonElement>('.cut-control__action');
    if (button === null) throw new Error('no cut button on the round-robin stage');

    act(() => {
      const input = host.querySelector<HTMLInputElement>('.numeric-field__input');
      if (input === null) throw new Error('no numeric field');
      input.value = '4';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    act(() => {
      host.querySelector<HTMLButtonElement>('.cut-control__action')?.click();
    });

    // The fold arrives from the store in the running app; here the test supplies it, which
    // is what the screen re-renders against.
    act(() => {
      render(screen(afterCut), host);
    });

    const heading = host.querySelector(`#${BRACKET_HEADING_ID}`);
    expect(heading).not.toBeNull();
    expect(heading?.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(heading);
  });
});
