// @vitest-environment happy-dom

/**
 * The tiebreak override — TOUR-08, `05-UI-SPEC` §7, D-13.
 *
 * `05-UI-SPEC` §7 says this surface is `SchedulePreview`'s reorder "reused down to the
 * focus rule", so the three assertions `tests/ui/schedule-reorder.test.tsx` says are worth
 * a file are the three that carry over, and they carry over for the same reasons:
 *
 *   The accessible names. `Move Dee up` is the only place a screen-reader user is told
 *   WHICH player a button moves — the visible label is a bare `Up`, because twelve buttons
 *   reading `Move Dee up` down the side of a list is noise on screen and essential in the
 *   accessibility tree. A name that dropped the player would look identical.
 *
 *   `aria-disabled` is ABSENT — not `'false'` — the moment a move becomes possible. That
 *   is WR-04, and `'false'` renders, reads and behaves exactly like the correct value
 *   everywhere except in an assistive technology that believes it.
 *
 *   The focus handoff. Focus left on the pressed button makes a second press reverse the
 *   first, which makes walking a player from the bottom of a three-way tie to the top
 *   impossible by keyboard — the exact journey D-13's buttons exist for, and nothing about
 *   the screen looks different when it regresses.
 *
 * A fourth is specific to this surface and is the one that proves it agrees with 05-03:
 * the override self-invalidates by SET EQUALITY, so a correction that changes who is tied
 * must bring this control back. Nothing on screen would say it had stopped happening — the
 * host would simply be offered no way to order a block the cut is about to refuse.
 *
 * Zero mocks: the component takes a folded state and a callback.
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
import { selectStandings } from '../../src/core/tournament';
import {
  TiebreakOrderer,
  TIEBREAK_CONFIRM,
  TIEBREAK_HEADING,
} from '../../src/ui/components/TiebreakOrderer';

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

function configWith(players: number): TournamentConfig {
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

type Order = { playerIds: string[]; seq: number };

/**
 * A folded state carrying the results and the overrides named, and nothing else.
 *
 * The control reads `config.players` and `selectStandings`; picks and the schedule are
 * invisible to it, so a fixture that built a whole completed draft would be asserting
 * something this component cannot see.
 */
function stateWith(players: number, results: Recorded[], orders: Order[] = []): DraftState {
  const config = configWith(players);

  return {
    ...initialState(config),
    matchResults: results.map((row, index) => {
      const action = matchRecorded(row.matchId, row.winnerId, row.loserId, 1, 0, 0);

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
    tiebreakOrders: orders.map((order) => ({ playerIds: [...order.playerIds], seq: order.seq })),
  };
}

/**
 * Four players on four different records — nothing for this control to do.
 *
 * Ada 3, Bo 2, Cy 1, Dee 0: the chain resolves every row on link 1, so no block ever
 * reaches link 4 and the override has no block to offer.
 */
const NO_TIE: Recorded[] = [
  { matchId: 'rr:0:1', winnerId: 'p1', loserId: 'p2' },
  { matchId: 'rr:0:2', winnerId: 'p1', loserId: 'p3' },
  { matchId: 'rr:0:3', winnerId: 'p1', loserId: 'p4' },
  { matchId: 'rr:1:2', winnerId: 'p2', loserId: 'p3' },
  { matchId: 'rr:1:3', winnerId: 'p2', loserId: 'p4' },
  { matchId: 'rr:2:3', winnerId: 'p3', loserId: 'p4' },
];

/**
 * Six players, and Cy/Dee/Eli in a cycle the chain cannot break.
 *
 * Ada wins everything, Bo wins everything but Ada, Cy/Dee/Eli beat Fay and then cycle
 * among themselves (Cy > Dee, Dee > Eli, Eli > Cy), and Fay wins nothing. The cycle is the
 * point: it is exactly the shape head-to-head cannot resolve, and at three players the
 * chain does not even try.
 */
const TIED_CY_DEE_ELI: Recorded[] = [
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
 * The same six players, and the cycle one seat down: Dee/Eli/Fay, with Cy at the bottom.
 *
 * This is the correction case in fixture form. The block is a DIFFERENT SET, so an
 * override recorded for `{Cy, Dee, Eli}` no longer matches it and 05-03 stops applying —
 * which is the whole of the self-invalidation mechanism D-13 chose player names for.
 */
const TIED_DEE_ELI_FAY: Recorded[] = [
  { matchId: 'rr:0:1', winnerId: 'p1', loserId: 'p2' },
  { matchId: 'rr:0:2', winnerId: 'p1', loserId: 'p3' },
  { matchId: 'rr:0:3', winnerId: 'p1', loserId: 'p4' },
  { matchId: 'rr:0:4', winnerId: 'p1', loserId: 'p5' },
  { matchId: 'rr:0:5', winnerId: 'p1', loserId: 'p6' },
  { matchId: 'rr:1:2', winnerId: 'p2', loserId: 'p3' },
  { matchId: 'rr:1:3', winnerId: 'p2', loserId: 'p4' },
  { matchId: 'rr:1:4', winnerId: 'p2', loserId: 'p5' },
  { matchId: 'rr:1:5', winnerId: 'p2', loserId: 'p6' },
  { matchId: 'rr:2:3', winnerId: 'p4', loserId: 'p3' },
  { matchId: 'rr:2:4', winnerId: 'p5', loserId: 'p3' },
  { matchId: 'rr:2:5', winnerId: 'p6', loserId: 'p3' },
  { matchId: 'rr:3:4', winnerId: 'p4', loserId: 'p5' },
  { matchId: 'rr:4:5', winnerId: 'p5', loserId: 'p6' },
  { matchId: 'rr:3:5', winnerId: 'p6', loserId: 'p4' },
];

// ---------------------------------------------------------------------------

type ConfirmSpy = ReturnType<typeof vi.fn<(playerIds: readonly string[]) => void>>;

let host: HTMLDivElement;
let confirmed: ConfirmSpy;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  confirmed = vi.fn<(playerIds: readonly string[]) => void>();
});

afterEach(() => {
  render(null, host);
  host.remove();
});

function draw(state: DraftState): void {
  act(() => {
    render(<TiebreakOrderer state={state} onConfirm={confirmed} />, host);
  });
}

function control(): HTMLElement | null {
  return host.querySelector('.tiebreak-orderer');
}

function rows(): HTMLLIElement[] {
  return Array.from(host.querySelectorAll('li.tiebreak-orderer__row'));
}

function playerNames(): string[] {
  return rows().map((row) => (row.querySelector('.tiebreak-orderer__player')?.textContent ?? '').trim());
}

function moveButton(rowIndex: number, direction: 'up' | 'down'): HTMLButtonElement {
  const row = rows()[rowIndex];
  if (row === undefined) throw new Error(`no row at ${rowIndex}`);

  const buttons = Array.from(row.querySelectorAll<HTMLButtonElement>('.tiebreak-orderer__move'));
  const button = buttons[direction === 'up' ? 0 : 1];
  if (button === undefined) throw new Error(`no ${direction} button in row ${rowIndex}`);

  return button;
}

function nameOf(button: HTMLButtonElement): string {
  return button.getAttribute('aria-label') ?? '';
}

function confirmButton(): HTMLButtonElement {
  const button = host.querySelector<HTMLButtonElement>('.tiebreak-orderer__confirm');
  if (button === null) throw new Error('no confirm button');
  return button;
}

function click(button: HTMLButtonElement): void {
  act(() => {
    button.click();
  });
}

// ---------------------------------------------------------------------------

describe('when it renders at all', () => {
  it('renders nothing when the chain resolved every row', () => {
    draw(stateWith(4, NO_TIE));

    expect(control()).toBeNull();
  });

  it('renders when a block reached link 4 unresolved', () => {
    draw(stateWith(6, TIED_CY_DEE_ELI));

    expect(control()).not.toBeNull();
    expect(host.querySelector('.tiebreak-orderer__heading')?.textContent).toBe(TIEBREAK_HEADING);
  });

  it('renders only the tied block — every other player is absent from this control', () => {
    draw(stateWith(6, TIED_CY_DEE_ELI));

    expect(playerNames()).toEqual(['Cy', 'Dee', 'Eli']);

    const text = control()?.textContent ?? '';
    expect(text).not.toContain('Ada');
    expect(text).not.toContain('Bo');
    expect(text).not.toContain('Fay');
  });

  it('states how many players it could not separate', () => {
    draw(stateWith(6, TIED_CY_DEE_ELI));

    expect(host.querySelector('.tiebreak-orderer__body')?.textContent).toBe(
      'Head-to-head cannot separate 3 players. Put them in the order you want and the bracket seeds from it.',
    );
  });

  it('names its primary action with the contract label', () => {
    draw(stateWith(6, TIED_CY_DEE_ELI));

    expect(confirmButton().textContent).toBe(TIEBREAK_CONFIRM);
  });
});

describe('the move buttons', () => {
  it('names each one for the player it moves', () => {
    draw(stateWith(6, TIED_CY_DEE_ELI));

    // The second row, which is the one whose BOTH buttons are live — the case an
    // end-of-list assertion would miss.
    expect(nameOf(moveButton(1, 'up'))).toBe('Move Dee up');
    expect(nameOf(moveButton(1, 'down'))).toBe('Move Dee down');
  });

  it('carries no aria-disabled at all on a movable button — absent, not "false"', () => {
    draw(stateWith(6, TIED_CY_DEE_ELI));

    // `null`, not `'false'`. An `aria-disabled="false"` would pass every other assertion
    // in this file and still tell a screen reader the opposite of the truth.
    expect(moveButton(1, 'up').getAttribute('aria-disabled')).toBe(null);
    expect(moveButton(1, 'down').getAttribute('aria-disabled')).toBe(null);
  });

  it('makes the first row up and the last row down inert, and leaves them focusable', () => {
    draw(stateWith(6, TIED_CY_DEE_ELI));

    const first = moveButton(0, 'up');
    const last = moveButton(2, 'down');

    expect(first.getAttribute('aria-disabled')).toBe('true');
    expect(last.getAttribute('aria-disabled')).toBe('true');

    // Never the native attribute: a natively disabled button is not focusable.
    expect(first.hasAttribute('disabled')).toBe(false);
    expect(last.hasAttribute('disabled')).toBe(false);

    first.focus();
    expect(document.activeElement).toBe(first);
  });

  it('sheds aria-disabled once the move becomes possible', () => {
    draw(stateWith(6, TIED_CY_DEE_ELI));

    expect(moveButton(0, 'up').getAttribute('aria-disabled')).toBe('true');

    // Move Cy down; row 0 now holds Dee, whose Up is live.
    click(moveButton(0, 'down'));

    expect(playerNames()).toEqual(['Dee', 'Cy', 'Eli']);
    expect(moveButton(1, 'up').getAttribute('aria-disabled')).toBe(null);
  });

  it('does nothing when an inert end button is clicked', () => {
    draw(stateWith(6, TIED_CY_DEE_ELI));

    click(moveButton(0, 'up'));
    click(moveButton(2, 'down'));

    expect(playerNames()).toEqual(['Cy', 'Dee', 'Eli']);
    expect(confirmed).not.toHaveBeenCalled();
  });

  it('reorders the local list only, reporting nothing until the host confirms', () => {
    draw(stateWith(6, TIED_CY_DEE_ELI));

    click(moveButton(2, 'up'));

    expect(playerNames()).toEqual(['Cy', 'Eli', 'Dee']);
    expect(confirmed).not.toHaveBeenCalled();
  });

  it('hands focus to the same-named button in the row the player moved to', () => {
    draw(stateWith(6, TIED_CY_DEE_ELI));

    click(moveButton(2, 'up'));

    const landed = moveButton(1, 'up');
    expect(document.activeElement).toBe(landed);
    expect(nameOf(landed)).toBe('Move Eli up');
  });

  it('lets a player be walked to the top with repeated presses on the same key', () => {
    draw(stateWith(6, TIED_CY_DEE_ELI));

    // Eli from the bottom to the top. The second press has to act on the button focus
    // landed on, which is the whole reason the handoff follows the player.
    click(moveButton(2, 'up'));
    click(document.activeElement as HTMLButtonElement);

    expect(playerNames()).toEqual(['Eli', 'Cy', 'Dee']);
  });
});

describe('confirming', () => {
  it('reports the displayed order exactly once', () => {
    draw(stateWith(6, TIED_CY_DEE_ELI));

    click(moveButton(2, 'up'));
    click(confirmButton());

    expect(confirmed).toHaveBeenCalledTimes(1);
    expect(confirmed.mock.calls[0]?.[0]).toEqual(['p3', 'p5', 'p4']);
  });

  it('reports the untouched order when the host accepts the one on screen', () => {
    draw(stateWith(6, TIED_CY_DEE_ELI));

    click(confirmButton());

    expect(confirmed.mock.calls[0]?.[0]).toEqual(['p3', 'p4', 'p5']);
  });

  it('disappears once the block is host-ordered', () => {
    const ordered = stateWith(6, TIED_CY_DEE_ELI, [{ playerIds: ['p5', 'p3', 'p4'], seq: 99 }]);

    // The premise, asserted rather than assumed: 05-03 has resolved the block.
    expect(selectStandings(ordered).some((row) => row.decidedBy === 'tied')).toBe(false);

    draw(ordered);
    expect(control()).toBeNull();
  });

  it('comes back when a correction changes who is tied — the override self-invalidates', () => {
    const order: Order = { playerIds: ['p5', 'p3', 'p4'], seq: 99 };

    draw(stateWith(6, TIED_CY_DEE_ELI, [order]));
    expect(control()).toBeNull();

    // Same override, a block of {Dee, Eli, Fay}. Set equality no longer holds, so the
    // order stops applying and the host is asked again — for the players who are now tied.
    draw(stateWith(6, TIED_DEE_ELI_FAY, [order]));

    expect(control()).not.toBeNull();
    expect(playerNames()).toEqual(['Dee', 'Eli', 'Fay']);
  });
});
