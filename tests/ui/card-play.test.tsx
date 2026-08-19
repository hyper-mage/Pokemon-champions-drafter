// @vitest-environment happy-dom

/**
 * The card panel and the card face — the surface a room watches while a round is bid.
 *
 * Three contracts live here.
 *
 * The played row renders in PLAY order, which is also the tiebreak order (D-22), so the row
 * is the rule made visible rather than a description of it (CARD-05). A test that only
 * checked membership would pass on a row sorted by value, which is the one ordering the
 * rule does not use.
 *
 * A playable card is a real button with the name `Play 3`; a played card is not a control at
 * all. A button that does nothing takes a tab stop and promises an action.
 *
 * Focus survives the play. The pressed button leaves the hand when the panel re-renders for
 * the next player, so without a handoff focus falls to `<body>` — on the one surface where
 * the next action is another card.
 *
 * What this file cannot prove: happy-dom performs no layout. Whether a card face is
 * genuinely 64px square, and whether a digit at `--text-display` is legible from three
 * metres, are DRFT-14 assertion 11 and belong to plan 03-12's physical check. Nothing here
 * measures a pixel — the same limitation `draft-board.test.tsx` records for the board.
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CardFace } from '../../src/ui/components/CardFace';
import { CardPanel, type PlayedCard } from '../../src/ui/components/CardPanel';
import { announce } from '../../src/ui/components/LiveRegion';

// ---------------------------------------------------------------------------

let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  // `announce` is a module-level signal that outlives any render, so a file touching the
  // live region resets it rather than inheriting the previous test's message.
  announce('');
});

afterEach(() => {
  render(null, host);
  host.remove();
});

function mountPanel(props: Partial<Parameters<typeof CardPanel>[0]> = {}): void {
  act(() => {
    render(
      <CardPanel
        playerName={props.playerName ?? 'Ada'}
        hand={props.hand ?? [1, 2, 3, 4, 5, 6]}
        played={props.played ?? []}
        stillToPlay={props.stillToPlay ?? ['Bo', 'Cy']}
        onPlay={props.onPlay ?? (() => undefined)}
      />,
      host,
    );
  });
}

function handGroup(): HTMLElement | null {
  return host.querySelector<HTMLElement>('[role="group"]');
}

function handButtons(): HTMLButtonElement[] {
  return Array.from(handGroup()?.querySelectorAll('button') ?? []);
}

function textOf(selector: string): string | null {
  return host.querySelector(selector)?.textContent ?? null;
}

// ---------------------------------------------------------------------------

describe('CardFace', () => {
  it('renders a button named `Play 3` in the playable state', () => {
    act(() => {
      render(<CardFace value={3} state="playable" />, host);
    });

    const button = host.querySelector('button');
    expect(button).not.toBeNull();
    expect(button?.getAttribute('aria-label')).toBe('Play 3');
    expect(button?.textContent).toBe('3');
  });

  it('renders no button semantics at all in the played state', () => {
    act(() => {
      render(<CardFace value={3} state="played" />, host);
    });

    expect(host.querySelector('button')).toBeNull();
    expect(host.querySelector('[role="button"]')).toBeNull();
    expect(host.textContent).toBe('3');
  });

  it('reports its own value to the handler and nothing else', () => {
    const onPlay = vi.fn();
    act(() => {
      render(<CardFace value={5} state="playable" onPlay={onPlay} />, host);
    });

    act(() => {
      host.querySelector('button')?.click();
    });

    expect(onPlay).toHaveBeenCalledExactlyOnceWith(5);
  });
});

describe('CardPanel — the hand on the clock', () => {
  it('names the group for the player holding it', () => {
    mountPanel({ playerName: 'Ada' });
    expect(handGroup()?.getAttribute('aria-label')).toBe("Ada's cards");
  });

  it('renders one card per remaining value, ascending, and none of the spent ones', () => {
    mountPanel({ hand: [2, 5, 6] });

    expect(handButtons().map((button) => button.textContent)).toEqual(['2', '5', '6']);
    expect(handButtons().map((button) => button.getAttribute('aria-label'))).toEqual([
      'Play 2',
      'Play 5',
      'Play 6',
    ]);
  });

  it('deals config.rounds cards rather than six', () => {
    // A four-round tournament deals four. The panel renders what `selectHand` handed it.
    mountPanel({ hand: [1, 2, 3, 4] });
    expect(handButtons()).toHaveLength(4);
  });

  it('plays a card on one click, with no confirmation step', () => {
    const onPlay = vi.fn();
    mountPanel({ hand: [2, 5, 6], onPlay });

    act(() => {
      handButtons()[1]?.click();
    });

    expect(onPlay).toHaveBeenCalledExactlyOnceWith(5);
    expect(host.querySelectorAll('[role="alertdialog"]')).toHaveLength(0);
    expect(host.querySelectorAll('dialog')).toHaveLength(0);
  });
});

describe('CardPanel — the played row', () => {
  const THIRD_PLAYED_LOWEST: readonly PlayedCard[] = [
    { playerId: 'p1', playerName: 'Ada', value: 4 },
    { playerId: 'p2', playerName: 'Bo', value: 6 },
    { playerId: 'p3', playerName: 'Cy', value: 1 },
  ];

  it('renders in play order, not in resolved order', () => {
    // Cy played the lowest value and played it LAST. Play order is the tiebreak order
    // (D-22), so the row that shows the rule is the one in the order the cards went down —
    // a row sorted by value would be a second opinion about who picks first.
    mountPanel({ playerName: 'Cy', hand: [2, 3, 5], played: THIRD_PLAYED_LOWEST, stillToPlay: [] });

    const items = Array.from(host.querySelectorAll('.card-panel__played-item'));
    expect(items.map((item) => item.textContent)).toEqual(['4Ada', '6Bo', '1Cy']);
  });

  it('renders each played card as a plain element beneath its player’s name', () => {
    mountPanel({ played: THIRD_PLAYED_LOWEST, stillToPlay: [] });

    const played = Array.from(host.querySelectorAll('.card-face--played'));
    expect(played).toHaveLength(3);
    expect(played.every((element) => element.tagName !== 'BUTTON')).toBe(true);

    expect(
      Array.from(host.querySelectorAll('.card-panel__played-name')).map((el) => el.textContent),
    ).toEqual(['Ada', 'Bo', 'Cy']);
  });

  it('states who plays first when nothing is down yet', () => {
    mountPanel({ playerName: 'Ada', played: [] });

    expect(textOf('.card-panel__empty')).toBe('No cards are down yet. Ada plays first this round.');
    expect(host.querySelector('.card-panel__played')).toBeNull();
  });

  it('drops the empty line the moment the first card lands', () => {
    mountPanel({ played: [{ playerId: 'p1', playerName: 'Ada', value: 4 }] });

    expect(host.querySelector('.card-panel__empty')).toBeNull();
    expect(host.querySelector('.card-panel__played')).not.toBeNull();
  });
});

describe('CardPanel — still to play', () => {
  it('names the remaining rotation, middot separated', () => {
    mountPanel({ stillToPlay: ['Bo', 'Cy'] });
    expect(textOf('.card-panel__still')).toBe('Still to play: Bo · Cy');
  });

  it('renders nothing at all when the player on the clock is the last to play', () => {
    mountPanel({ stillToPlay: [] });

    expect(host.querySelector('.card-panel__still')).toBeNull();
    expect(host.textContent).not.toContain('Still to play');
  });
});

describe('CardPanel — focus after a card is played', () => {
  it('moves to the first card of the new hand, never to the body', () => {
    // The panel re-renders for the NEXT player, so the pressed button leaves the document.
    let hand: number[] = [1, 2, 3];
    const rerender = (next: number[]): void => {
      hand = next;
      mountPanel({ playerName: 'Bo', hand, onPlay: () => undefined });
    };

    rerender([1, 2, 3]);

    const pressed = handButtons()[0];
    expect(pressed).toBeDefined();

    act(() => {
      pressed?.focus();
      pressed?.click();
    });
    expect(document.activeElement).toBe(pressed);

    // Bo's turn, with 1 spent: the same panel, a different hand.
    act(() => {
      rerender([2, 3]);
    });

    expect(pressed?.isConnected).toBe(false);
    expect(document.activeElement).not.toBe(document.body);
    expect(handButtons()).toContain(document.activeElement);
    expect(document.activeElement?.textContent).toBe('2');
  });

  it('leaves focus alone when the host never had it on a card', () => {
    // A pointer user who clicked without focusing keeps their focus where they left it.
    mountPanel({ hand: [1, 2, 3] });
    expect(document.activeElement).toBe(document.body);

    act(() => {
      handButtons()[0]?.click();
    });
    act(() => {
      mountPanel({ hand: [2, 3] });
    });

    expect(document.activeElement).toBe(document.body);
  });
});

describe('CardPanel — the accent reservation', () => {
  it('renders no accent-filled button on this surface', () => {
    mountPanel({ played: [{ playerId: 'p1', playerName: 'Ada', value: 4 }] });

    // The class the accent-filled primary CTA carries. Card faces are secondary, on the
    // same reasoning the draft screen has no accent-filled pick button.
    expect(host.querySelector('.feasibility-bar__start')).toBeNull();
    expect(host.querySelector('[class*="--primary"]')).toBeNull();
  });
});
