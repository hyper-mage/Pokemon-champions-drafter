// @vitest-environment happy-dom

/**
 * `useRovingTabindex` — one tab stop over a set of buttons.
 *
 * This is the one genuinely novel accessibility mechanism in the phase: nothing under
 * `src/` carried `role="toolbar"` or a roving tabindex before it. Its whole value is that
 * Tab enters the set once and leaves it once, so the failure it prevents — eighteen tab
 * stops in a filter bar, and later two hundred and more in the pool grid — is invisible in
 * a screenshot and obvious to anyone driving the page from a keyboard.
 *
 * ## What this file cannot prove, stated rather than left to be discovered
 *
 * happy-dom performs no layout. It does not resolve `repeat(auto-fill, …)`, so the real
 * column count of a rendered grid is not observable here at all. That is precisely why
 * the hook takes `columns` as an injected function rather than measuring the DOM itself:
 * the navigation RULE — which index each arrow key moves to, how it wraps, where Home and
 * End go — is the part that can be silently wrong, and injecting the measurement is what
 * lets the whole two-dimensional rule be asserted against twelve buttons and `() => 4`.
 *
 * Whether four columns is what the browser actually lays out belongs at the phase's
 * human-verify checkpoint, and it stays there.
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useRovingTabindex, type RovingTabindexOptions } from '../../src/ui/use-roving-tabindex';

let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(() => {
  render(null, host);
  host.remove();
});

// ---------------------------------------------------------------------------

/** A minimal consumer: `count` buttons, wired exactly as the toolbar wires them. */
function Harness({ count, columns }: { count: number; columns?: (() => number) | undefined }) {
  // Built conditionally because `exactOptionalPropertyTypes` refuses an explicit
  // `undefined` for an optional property, and the single-axis default is the case under
  // test in half this file.
  const options: RovingTabindexOptions = columns === undefined ? { count } : { count, columns };
  const rove = useRovingTabindex(options);

  return (
    <div class="harness" ref={rove.containerRef} onKeyDown={rove.onKeyDown}>
      {Array.from({ length: count }, (_, index) => (
        <button
          key={index}
          type="button"
          tabIndex={rove.tabIndexAt(index)}
          onFocus={() => rove.onItemFocus(index)}
        >
          {`item ${index}`}
        </button>
      ))}
    </div>
  );
}

function mount(count: number, columns?: () => number): void {
  act(() => {
    render(<Harness count={count} columns={columns} />, host);
  });
}

function container(): HTMLElement {
  const element = host.querySelector<HTMLElement>('.harness');
  if (element === null) throw new Error('the harness did not render');
  return element;
}

function buttons(): HTMLButtonElement[] {
  return [...host.querySelectorAll<HTMLButtonElement>('button')];
}

function tabIndexes(): number[] {
  return buttons().map((button) => button.tabIndex);
}

/** Which item currently carries the single tab stop. */
function activeIndex(): number {
  return tabIndexes().indexOf(0);
}

function press(key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  act(() => {
    container().dispatchEvent(event);
  });
  return event;
}

// ---------------------------------------------------------------------------

describe('the one tab stop', () => {
  it('gives exactly one item tabindex 0 and every other item tabindex -1', () => {
    mount(6);

    expect(tabIndexes()).toEqual([0, -1, -1, -1, -1, -1]);
  });

  it('moves the tab stop with the arrow keys rather than adding a second one', () => {
    mount(6);

    press('ArrowRight');

    expect(tabIndexes()).toEqual([-1, 0, -1, -1, -1, -1]);
    expect(tabIndexes().filter((value) => value === 0)).toHaveLength(1);
  });
});

describe('single-axis navigation', () => {
  beforeEach(() => {
    mount(6);
  });

  it('moves right and takes focus with it', () => {
    press('ArrowRight');

    expect(activeIndex()).toBe(1);
    expect(document.activeElement).toBe(buttons()[1]);
  });

  it('wraps backwards from the first item to the last', () => {
    press('ArrowLeft');

    expect(activeIndex()).toBe(5);
    expect(document.activeElement).toBe(buttons()[5]);
  });

  it('wraps forwards from the last item to the first', () => {
    press('End');
    expect(activeIndex()).toBe(5);

    press('ArrowRight');
    expect(activeIndex()).toBe(0);
  });

  it('sends Home to the first item and End to the last', () => {
    press('ArrowRight');
    press('ArrowRight');

    press('Home');
    expect(activeIndex()).toBe(0);

    press('End');
    expect(activeIndex()).toBe(5);
  });

  /**
   * At one column the vertical rules collapse onto the horizontal ones exactly, which is
   * why a single-row toolbar needs no special case and gets none.
   */
  it('makes Down behave as Right and Up as Left when no column count is injected', () => {
    press('ArrowDown');
    expect(activeIndex()).toBe(1);

    press('ArrowUp');
    expect(activeIndex()).toBe(0);

    press('ArrowUp');
    expect(activeIndex()).toBe(5);
  });
});

describe('two-dimensional navigation, with the column count injected', () => {
  beforeEach(() => {
    mount(12, () => 4);
  });

  function goTo(index: number): void {
    act(() => {
      buttons()[index]?.focus();
    });
  }

  it('moves down one row', () => {
    goTo(1);

    press('ArrowDown');

    expect(activeIndex()).toBe(5);
  });

  it('wraps up from the top row to the bottom of the same column', () => {
    goTo(1);

    press('ArrowUp');

    expect(activeIndex()).toBe(9);
  });

  it('wraps down from the bottom row to the top of the same column', () => {
    goTo(10);

    press('ArrowDown');

    expect(activeIndex()).toBe(2);
  });

  it('moves up one row from the middle', () => {
    goTo(5);

    press('ArrowUp');

    expect(activeIndex()).toBe(1);
  });

  it('leaves left and right walking the flat sequence, ignoring the rows', () => {
    goTo(3);

    press('ArrowRight');

    expect(activeIndex()).toBe(4);
  });
});

describe('the keys the hook must not touch', () => {
  beforeEach(() => {
    mount(6);
    press('ArrowRight');
  });

  /**
   * Tab is what MAKES this one tab stop. A hook that intercepted it would trap the host
   * inside the toolbar, which is a worse failure than the eighteen stops it replaced.
   */
  it('leaves Tab to the platform, unprevented and index-neutral', () => {
    const event = press('Tab');

    expect(event.defaultPrevented).toBe(false);
    expect(activeIndex()).toBe(1);
  });

  it('leaves Enter and Space to native button activation', () => {
    for (const key of ['Enter', ' ']) {
      const event = press(key);

      expect(event.defaultPrevented, key).toBe(false);
      expect(activeIndex(), key).toBe(1);
    }
  });

  it('prevents the six keys it does handle, so the pane does not scroll underneath', () => {
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']) {
      expect(press(key).defaultPrevented, key).toBe(true);
    }
  });
});

describe('the set changing underneath the host', () => {
  /**
   * A filtered grid can shrink between two key presses. An index pointing past the end
   * must never be observable, so it is clamped where it is READ rather than corrected by
   * an effect a frame later.
   */
  it('clamps the active index to the last item when the count shrinks below it', () => {
    mount(6);
    press('End');
    expect(activeIndex()).toBe(5);

    mount(3);

    expect(tabIndexes()).toEqual([-1, -1, 0]);
  });

  it('keeps arrow navigation coherent after the clamp', () => {
    mount(6);
    press('End');
    mount(3);

    press('ArrowRight');

    expect(activeIndex()).toBe(0);
  });
});

describe('focus arriving by mouse', () => {
  it('makes the clicked item the active one, so the next arrow key starts from there', () => {
    mount(6);

    act(() => {
      buttons()[4]?.focus();
    });

    expect(activeIndex()).toBe(4);

    press('ArrowRight');

    expect(activeIndex()).toBe(5);
  });
});
