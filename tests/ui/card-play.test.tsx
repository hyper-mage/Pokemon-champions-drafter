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
  const hand = props.hand ?? [1, 2, 3, 4, 5, 6];

  act(() => {
    render(
      <CardPanel
        playerName={props.playerName ?? 'Ada'}
        hand={hand}
        // Everything playable unless a test says otherwise, which is the ordinary round.
        playable={props.playable ?? hand}
        constraintLifted={props.constraintLifted ?? false}
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

// ---------------------------------------------------------------------------
// The unplayable card — CARD-04, D-21, WR-04
// ---------------------------------------------------------------------------

describe('CardFace — the unplayable state', () => {
  it('is still a button, and still focusable', () => {
    // Inert, not disabled. A `disabled` attribute would take the tab stop, and the reason
    // lives in the accessible name — which is only reachable if the control is.
    act(() => {
      render(<CardFace value={2} state="unplayable" />, host);
    });

    const button = host.querySelector('button');
    expect(button).not.toBeNull();
    expect(button?.hasAttribute('disabled')).toBe(false);

    button?.focus();
    expect(document.activeElement).toBe(button);
  });

  it('carries the reason in its accessible name, in full', () => {
    act(() => {
      render(<CardFace value={2} state="unplayable" />, host);
    });

    expect(host.querySelector('button')?.getAttribute('aria-label')).toBe(
      'Play 2 — this would leave a later player with no legal card',
    );
  });

  it('marks itself aria-disabled', () => {
    act(() => {
      render(<CardFace value={2} state="unplayable" />, host);
    });

    expect(host.querySelector('button')?.getAttribute('aria-disabled')).toBe('true');
  });

  it('carries both the dimmed and the struck class, never one alone', () => {
    // 03-UI-SPEC §Colour: colour — and opacity — is never the only signal. Dimming alone
    // is the ordinary disabled convention and would say "not your turn yet".
    act(() => {
      render(<CardFace value={2} state="unplayable" />, host);
    });

    const button = host.querySelector('button');
    expect(button?.classList.contains('card-face--dimmed')).toBe(true);
    expect(button?.classList.contains('card-face--struck')).toBe(true);
  });

  it('emits nothing when clicked', () => {
    const onPlay = vi.fn();
    act(() => {
      render(<CardFace value={2} state="unplayable" onPlay={onPlay} />, host);
    });

    act(() => {
      host.querySelector('button')?.click();
    });

    expect(onPlay).not.toHaveBeenCalled();
  });

  it('sheds the inert ARIA entirely when the value becomes playable again', () => {
    // WR-04, and the reason it is `toBeNull` rather than `toBe('false')`: a reused button
    // must SHED the attribute, because `aria-disabled="false"` is not the same thing as no
    // `aria-disabled` at all to every assistive technology.
    act(() => {
      render(<CardFace value={2} state="unplayable" />, host);
    });
    expect(host.querySelector('button')?.getAttribute('aria-disabled')).toBe('true');

    act(() => {
      render(<CardFace value={2} state="playable" />, host);
    });

    const button = host.querySelector('button');
    expect(button?.getAttribute('aria-disabled')).toBeNull();
    expect(button?.getAttribute('aria-label')).toBe('Play 2');
  });

  it('keeps the same DOM node across the transition, so focus survives it', () => {
    // One `<button>` vnode across both states. A Fragment or a `<span>` in one branch
    // would unmount the subtree and drop focus to `<body>` — the 02-11 regression.
    act(() => {
      render(<CardFace value={2} state="unplayable" />, host);
    });
    const before = host.querySelector('button');
    before?.focus();

    act(() => {
      render(<CardFace value={2} state="playable" />, host);
    });

    expect(host.querySelector('button')).toBe(before);
    expect(document.activeElement).toBe(before);
  });
});

describe('CardPanel — what an inert card says', () => {
  it('renders the values outside the offer as unplayable and the rest as ordinary cards', () => {
    mountPanel({ hand: [1, 2, 3], playable: [1, 3] });

    expect(handButtons().map((button) => button.getAttribute('aria-disabled'))).toEqual([
      null,
      'true',
      null,
    ]);
  });

  it('states the rule once beneath the hand when something is struck', () => {
    mountPanel({ hand: [1, 2, 3], playable: [1, 3] });

    expect(textOf('.card-panel__rule')).toBe(
      'A struck-through card would leave a later player with no legal card.',
    );
  });

  it('says nothing beneath the hand when every card is playable', () => {
    mountPanel({ hand: [1, 2, 3], playable: [1, 2, 3] });

    expect(host.querySelector('.card-panel__rule')).toBeNull();
  });

  it('dispatches nothing when an unplayable card is clicked', () => {
    const onPlay = vi.fn();
    mountPanel({ hand: [1, 2, 3], playable: [1, 3], onPlay });

    act(() => {
      handButtons()[1]?.click();
    });

    expect(onPlay).not.toHaveBeenCalled();
  });

  it('still plays an ordinary card while a sibling is inert', () => {
    const onPlay = vi.fn();
    mountPanel({ hand: [1, 2, 3], playable: [1, 3], onPlay });

    act(() => {
      handButtons()[2]?.click();
    });

    expect(onPlay).toHaveBeenCalledExactlyOnceWith(3);
  });

  it('offers every card and states the exception when the constraint is lifted', () => {
    // The deadlock escape (T-03-33) — an imported log that arrived already deadlocked.
    // Every card is offered rather than none, and the panel says the rule was suspended
    // so nobody reads it as the tool having forgotten it.
    mountPanel({ hand: [1, 2], playable: [1, 2], constraintLifted: true });

    expect(handButtons().map((button) => button.getAttribute('aria-disabled'))).toEqual([
      null,
      null,
    ]);
    expect(textOf('.card-panel__rule')).toBe(
      'The no-repeat rule is lifted for this play: every card left would otherwise strand a later player.',
    );
  });

  it('hands focus to the first PLAYABLE card after a play, never to an inert one', () => {
    // The handoff exists to keep a keyboard host moving. Landing them on a card they
    // cannot play would be the same dead end it was written to avoid.
    mountPanel({ hand: [1, 2, 3], playable: [1, 2, 3] });

    act(() => {
      handButtons()[0]?.focus();
      handButtons()[0]?.click();
    });
    act(() => {
      mountPanel({ hand: [2, 3], playable: [3] });
    });

    expect(document.activeElement).toBe(handButtons()[1]);
    expect(handButtons()[1]?.getAttribute('aria-disabled')).toBeNull();
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
