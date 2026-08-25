// @vitest-environment happy-dom

/**
 * `BlindLocked` — the phase's most important screen, and deliberately the plainest.
 *
 * `04-UI-SPEC` §4 says a room glancing at it must be able to tell from three metres that
 * there is nothing on it. That is not a stylistic note: it is the whole of D-05, and the
 * assertion that proves it is **S3** — no species name anywhere in the DOM while this state
 * is mounted.
 *
 * ## The load-bearing test in this file is a sweep, not a spot check
 *
 * S3 is written against **every** name in the fixture roster, at three counts: nothing
 * entered, some entered, and everything entered. A test that checked one name would pass
 * against a component that rendered a different one, which is exactly the bug the assertion
 * exists to catch. The fixture is the committed roster snapshot rather than a handful of
 * invented names, so the sweep is over the real 235 strings a real leak would carry.
 *
 * ## Why the live region is reset in `beforeEach`
 *
 * `announce` writes a module-level signal that outlives every render (`CLAUDE.md` §Tests).
 * A message left by the previous case would otherwise read as this one's, and half the
 * cases below assert on silence.
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { createRef } from 'preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import committedSnapshot from '../../public/data/roster.mb.json';
import type { RosterSnapshot } from '../../src/core/roster/types';
import { BlindLocked, type BlindLockedProps } from '../../src/ui/components/BlindLocked';
import { announce, LiveRegion } from '../../src/ui/components/LiveRegion';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SNAPSHOT = committedSnapshot as unknown as RosterSnapshot;

/** Every species name the real roster carries. The S3 sweep runs over all of them. */
const ROSTER_NAMES: readonly string[] = SNAPSHOT.entries.map((entry) => entry.name);

/** Six host-authored names, none of them a species and none of them `Player N`. */
const NAMES = ['Ada', 'Bo', 'Cy', 'Dee', 'Eli', 'Sam'] as const;

const TOTAL = NAMES.length;

/**
 * `entered` players have submitted, in starting order — which is the only order this
 * component ever renders and the order the room reads down.
 */
function rowsWith(entered: number): { playerName: string; entered: boolean }[] {
  return NAMES.map((playerName, index) => ({ playerName, entered: index < entered }));
}

function propsWith(overrides: Partial<BlindLockedProps> = {}): BlindLockedProps {
  const entered = overrides.entered ?? 0;

  return {
    rows: rowsWith(entered),
    nextPlayerName: entered >= TOTAL ? null : NAMES[entered],
    entered,
    total: TOTAL,
    discardedPlayerName: null,
    onEnter: () => undefined,
    onReveal: () => undefined,
    primaryActionRef: createRef<HTMLButtonElement>(),
    ...overrides,
  };
}

let host: HTMLDivElement;

beforeEach(() => {
  // `announce` writes a module-level signal that outlives every render.
  announce('');
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(() => {
  render(null, host);
  host.remove();
  announce('');
});

function mount(overrides: Partial<BlindLockedProps> = {}): void {
  act(() => {
    render(<BlindLocked {...propsWith(overrides)} />, host);
  });
}

function text(selector: string): string | null {
  return host.querySelector(selector)?.textContent?.trim() ?? null;
}

function action(): HTMLButtonElement {
  const button = host.querySelector<HTMLButtonElement>('.blind-locked__action');
  if (button === null) throw new Error('the locked state rendered no primary action');
  return button;
}

// ---------------------------------------------------------------------------
// The seven rows, top to bottom
// ---------------------------------------------------------------------------

describe('the locked state says whose turn it is and how far the room has got', () => {
  it('names the next player in the headline', () => {
    mount({ entered: 0 });

    expect(text('.blind-locked__headline')).toBe('Ada is next');
  });

  it('says every ban is in once nobody is next', () => {
    mount({ entered: TOTAL });

    expect(text('.blind-locked__headline')).toBe('All bans are in');
  });

  it('counts the entries against the players, in full', () => {
    mount({ entered: 3 });

    expect(text('.blind-locked__progress')).toBe('3 of 6 entered');
  });

  it('heads the progress board with one word', () => {
    mount({ entered: 0 });

    expect(text('.blind-locked__sub-heading')).toBe('Players');
  });

  it('renders one board row per player, in starting order, with their state', () => {
    mount({ entered: 2 });

    const names = Array.from(
      host.querySelectorAll<HTMLElement>('.ban-board__blind-name'),
    ).map((element) => element.textContent);
    expect(names).toEqual(['Ada', 'Bo', 'Cy', 'Dee', 'Eli', 'Sam']);

    const states = Array.from(
      host.querySelectorAll<HTMLElement>('.ban-board__blind-status'),
    ).map((element) => element.textContent);
    expect(states).toEqual([
      'Entered',
      'Entered',
      'Not yet',
      'Not yet',
      'Not yet',
      'Not yet',
    ]);
  });

  it('names the next player on the primary action', () => {
    mount({ entered: 1 });

    expect(action().textContent).toBe("Enter Bo's bans");
  });

  it('offers the reveal once every player has entered', () => {
    mount({ entered: TOTAL });

    expect(action().textContent).toBe('Reveal bans');
  });
});

// ---------------------------------------------------------------------------
// Assertion S3 — the sweep
// ---------------------------------------------------------------------------

describe('assertion S3 — no species name is anywhere in the DOM', () => {
  /*
    Three counts, one sweep each, over EVERY name in the fixture roster. `04-UI-SPEC`
    §The Secrecy Contract specifies exactly these three: nothing entered, some entered,
    and everything entered. The middle one is where a component that rendered submissions
    would first leak, and the last one is where a component that revealed early would.
  */
  for (const entered of [0, 3, TOTAL]) {
    it(`names no species at ${entered} of ${TOTAL} entered`, () => {
      mount({ entered });

      const rendered = host.textContent ?? '';
      const leaked = ROSTER_NAMES.filter((name) => rendered.includes(name));

      expect(leaked).toEqual([]);
    });
  }

  it('names no species with a discard notice on screen either', () => {
    mount({ entered: 3, discardedPlayerName: 'Cy' });

    const rendered = host.textContent ?? '';
    expect(ROSTER_NAMES.filter((name) => rendered.includes(name))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The two conditional rows
// ---------------------------------------------------------------------------

describe('the reveal helper appears only when the reveal does', () => {
  it('is absent below the last submission', () => {
    mount({ entered: TOTAL - 1 });

    expect(host.querySelector('.blind-locked__reveal-helper')).toBeNull();
  });

  it('reads in full at the last submission', () => {
    mount({ entered: TOTAL });

    expect(text('.blind-locked__reveal-helper')).toBe(
      "Gather everyone before you tap. All 6 players' bans appear at once.",
    );
  });
});

describe('the discard notice is one string for one outcome', () => {
  it('reads in full when an entry was discarded', () => {
    mount({ entered: 2, discardedPlayerName: 'Cy' });

    expect(text('.blind-locked__discard')).toBe(
      "Cy's entry was discarded. Nothing was recorded.",
    );
  });

  it('is absent when nothing was discarded', () => {
    mount({ entered: 2, discardedPlayerName: null });

    expect(host.querySelector('.blind-locked__discard')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The two actions, and the reveal that never fires on its own
// ---------------------------------------------------------------------------

describe('the primary action does one thing at a time', () => {
  it('opens the entry surface below the last submission', () => {
    const calls: string[] = [];
    mount({ entered: 1, onEnter: () => calls.push('enter'), onReveal: () => calls.push('reveal') });

    act(() => {
      action().click();
    });

    expect(calls).toEqual(['enter']);
  });

  it('reveals at the last submission, and only on a tap', () => {
    const calls: string[] = [];
    mount({
      entered: TOTAL,
      onEnter: () => calls.push('enter'),
      onReveal: () => calls.push('reveal'),
    });

    // D-08: rendering the complete state must not reveal anything by itself.
    expect(calls).toEqual([]);

    act(() => {
      action().click();
    });

    expect(calls).toEqual(['reveal']);
  });

  it('hands its DOM node to the ref the entry surface returns focus to', () => {
    const ref = createRef<HTMLButtonElement>();
    mount({ entered: 1, primaryActionRef: ref });

    expect(ref.current).toBe(action());
  });
});

// ---------------------------------------------------------------------------
// Assertion S7 — the live region
// ---------------------------------------------------------------------------

describe('assertion S7 — the live region is emptied on entering this state', () => {
  function liveText(): string {
    return host.querySelector('[aria-live="polite"]')?.textContent ?? '';
  }

  function mountWithRegion(overrides: Partial<BlindLockedProps> = {}): void {
    act(() => {
      render(
        <>
          <LiveRegion />
          <BlindLocked {...propsWith(overrides)} />
        </>,
        host,
      );
    });
  }

  function rerender(overrides: Partial<BlindLockedProps> = {}): void {
    act(() => {
      render(
        <>
          <LiveRegion />
          <BlindLocked {...propsWith(overrides)} />
        </>,
        host,
      );
    });
  }

  it('clears whatever the entry surface left behind', () => {
    announce('Ada banned Venusaur. 3 bans.');

    mountWithRegion({ entered: 0 });

    expect(liveText()).toBe('');
  });

  it('says nothing at all on a resume, because nothing just happened', () => {
    mountWithRegion({ entered: 3 });

    expect(liveText()).toBe('');
  });

  it('names the player and the count when a submission locks', () => {
    mountWithRegion({ entered: 2 });
    rerender({ entered: 3 });

    expect(liveText()).toBe("Cy's bans are locked in. 3 of 6 entered.");
  });

  it('says the room is ready when the last submission locks', () => {
    mountWithRegion({ entered: TOTAL - 1 });
    rerender({ entered: TOTAL });

    expect(liveText()).toBe('All bans are in. 6 of 6 entered. Ready to reveal.');
  });

  it('leaves an undo announcement alone, because the store owns that sentence', () => {
    mountWithRegion({ entered: 3 });

    // What `store.ts` announces when a submission is undone — 04-07's string, already
    // shipped. A clear on this render would swallow it.
    act(() => {
      announce("Cy's bans were removed. 2 of 6 entered.");
    });
    rerender({ entered: 2 });

    expect(liveText()).toBe("Cy's bans were removed. 2 of 6 entered.");
  });

  it('never names a species in anything it announces', () => {
    mountWithRegion({ entered: TOTAL - 1 });
    rerender({ entered: TOTAL });

    const spoken = liveText();
    expect(ROSTER_NAMES.filter((name) => spoken.includes(name))).toEqual([]);
  });
});
