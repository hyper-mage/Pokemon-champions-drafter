// @vitest-environment happy-dom

/**
 * DRFT-09 — narrowing the pool by type and by Mega capability.
 *
 * The type counts and the Mega partition are ROSTER facts, so every assertion that
 * involves one runs against the committed snapshot and derives its expectation from that
 * snapshot rather than from a number typed here. A synthetic fixture would let this file
 * pass while the real toolbar filtered nothing.
 *
 * The eighteen buttons come from `TYPE_CODES`, which 02-03 built as a closed map whose own
 * test pins its key set equal to the roster's distinct type set. This file therefore never
 * writes a type list of its own either.
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import committedSnapshot from '../../public/data/roster.mb.json';
import type { SpriteMeta } from '../../src/adapters/roster-source';
import type { RosterEntry, RosterSnapshot } from '../../src/core/roster/types';
import { announce } from '../../src/ui/components/LiveRegion';
import { PoolGrid } from '../../src/ui/components/PoolGrid';
import { TYPE_CODES } from '../../src/ui/type-codes';

const SNAPSHOT = committedSnapshot as unknown as RosterSnapshot;
const ENTRIES: readonly RosterEntry[] = SNAPSHOT.entries;
const TYPES = Object.keys(TYPE_CODES);

const SPRITE_META: SpriteMeta = { nativeWidth: 96, nativeHeight: 96, byRosterId: {} };

const VIEW_KEY = 'champions-drafter:view';

function withType(...types: readonly string[]): number {
  return ENTRIES.filter((entry) => types.some((type) => entry.types.includes(type))).length;
}

function withEveryType(...types: readonly string[]): number {
  return ENTRIES.filter((entry) => types.every((type) => entry.types.includes(type))).length;
}

let host: HTMLDivElement;

beforeEach(() => {
  localStorage.clear();
  announce('');
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(() => {
  render(null, host);
  host.remove();
});

// ---------------------------------------------------------------------------

function mountPool(density = 'standard'): void {
  localStorage.setItem(VIEW_KEY, JSON.stringify({ density, pane: 'split' }));
  act(() => {
    render(
      <PoolGrid
        entries={ENTRIES}
        spriteMeta={SPRITE_META}
        onPick={() => undefined}
        bannedIds={null}
      />,
      host,
    );
  });
}

function toolbar(): HTMLElement {
  const element = host.querySelector<HTMLElement>('[role="toolbar"]');
  if (element === null) throw new Error('the type toolbar is not on the screen');
  return element;
}

function typeButtons(): HTMLButtonElement[] {
  return [...toolbar().querySelectorAll<HTMLButtonElement>('button')];
}

/** The accessible name of a type button, whichever density supplied it. */
function accessibleName(button: HTMLButtonElement): string {
  return button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '';
}

function typeButton(type: string): HTMLButtonElement {
  const button = typeButtons().find((candidate) => accessibleName(candidate) === type);
  if (button === undefined) throw new Error(`no filter button for ${type}`);
  return button;
}

function pressType(type: string): void {
  act(() => {
    typeButton(type).click();
  });
}

function matchAll(): HTMLInputElement {
  const input = host.querySelector<HTMLInputElement>('#pool-match-all');
  if (input === null) throw new Error('the match-all toggle is not on the screen');
  return input;
}

function megaOption(value: string): HTMLInputElement {
  const input = host.querySelector<HTMLInputElement>(`#pool-mega-filter-${value}`);
  if (input === null) throw new Error(`no Mega option for ${value}`);
  return input;
}

function chooseMega(value: string): void {
  act(() => {
    megaOption(value).click();
  });
}

function cards(): HTMLButtonElement[] {
  return [...host.querySelectorAll<HTMLButtonElement>('.mon-card')];
}

function cardNames(): string[] {
  return cards().map((card) => card.querySelector('.mon-card__name')?.textContent ?? '');
}

function searchField(): HTMLInputElement {
  const input = host.querySelector<HTMLInputElement>('#pool-search');
  if (input === null) throw new Error('the pool search field is not on the screen');
  return input;
}

function typeSearch(text: string): void {
  act(() => {
    const input = searchField();
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function buttonLabelled(text: string): HTMLButtonElement | undefined {
  return [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent?.trim() === text,
  );
}

function press(key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  act(() => {
    toolbar().dispatchEvent(event);
  });
  return event;
}

// ---------------------------------------------------------------------------
// The toolbar as a control
// ---------------------------------------------------------------------------

describe('the type toolbar', () => {
  it('is a labelled toolbar holding one button per type in the map, in declaration order', () => {
    mountPool();

    expect(toolbar().getAttribute('aria-label')).toBe('Filter by type');
    expect(typeButtons()).toHaveLength(TYPES.length);
    expect(typeButtons().map(accessibleName)).toEqual(TYPES);
  });

  it('starts with every button unpressed', () => {
    mountPool();

    for (const button of typeButtons()) {
      expect(button.getAttribute('aria-pressed'), accessibleName(button)).toBe('false');
    }
  });

  it('reports the pressed state on the button the host pressed, and only that one', () => {
    mountPool();

    pressType('Water');

    expect(typeButton('Water').getAttribute('aria-pressed')).toBe('true');
    expect(typeButton('Fire').getAttribute('aria-pressed')).toBe('false');
  });

  /**
   * The whole reason `useRovingTabindex` exists. Without it a keyboard host takes eighteen
   * Tab presses to cross this bar before reaching the pool, and later two hundred more to
   * cross the pool before reaching the board.
   */
  it('is ONE tab stop for all eighteen buttons, not eighteen', () => {
    mountPool();

    const stops = typeButtons().filter((button) => button.tabIndex === 0);
    const skipped = typeButtons().filter((button) => button.tabIndex === -1);

    expect(stops).toHaveLength(1);
    expect(skipped).toHaveLength(TYPES.length - 1);
  });

  it('moves inside itself with the arrow keys', () => {
    mountPool();

    press('ArrowRight');

    expect(document.activeElement).toBe(typeButtons()[1]);
    expect(typeButtons()[1]?.tabIndex).toBe(0);
    expect(typeButtons()[0]?.tabIndex).toBe(-1);
  });

  it('wraps from the first button to the last', () => {
    mountPool();

    press('ArrowLeft');

    expect(document.activeElement).toBe(typeButtons()[TYPES.length - 1]);
  });
});

describe('the type button label follows the pool density', () => {
  it('shows the three-letter code and carries the full type as its accessible name', () => {
    mountPool('standard');

    const water = typeButton('Water');
    expect(water.textContent?.trim()).toBe('WAT');
    expect(water.textContent?.trim()).toHaveLength(3);
    expect(water.getAttribute('aria-label')).toBe('Water');
  });

  it('shows the full type name at full density, with no label repeating it', () => {
    mountPool('full');

    const water = typeButton('Water');
    expect(water.textContent?.trim()).toBe('Water');
    expect(water.hasAttribute('aria-label')).toBe(false);
  });

  it('keeps the accessible name the full type at every density', () => {
    for (const density of ['minimal', 'standard', 'full']) {
      mountPool(density);
      expect(typeButtons().map(accessibleName), density).toEqual(TYPES);
      render(null, host);
    }
  });
});

// ---------------------------------------------------------------------------
// What the toolbar actually filters
// ---------------------------------------------------------------------------

describe('filtering by type', () => {
  it('leaves only the pressed type', () => {
    mountPool();

    pressType('Water');

    expect(cards()).toHaveLength(withType('Water'));
    for (const card of cards()) {
      expect(card.getAttribute('aria-label')).toContain('Water');
    }
  });

  it('is OR by default, so a second type widens the set', () => {
    mountPool();

    pressType('Water');
    const waterOnly = cards().length;

    pressType('Flying');

    expect(cards()).toHaveLength(withType('Water', 'Flying'));
    expect(cards().length).toBeGreaterThan(waterOnly);
  });

  it('narrows to the intersection once match-all is ticked', () => {
    mountPool();

    pressType('Water');
    pressType('Flying');
    const union = cards().length;

    act(() => {
      matchAll().click();
    });

    expect(cards()).toHaveLength(withEveryType('Water', 'Flying'));
    expect(cards().length).toBeLessThan(union);
  });

  it('releases a type when its button is pressed again', () => {
    mountPool();

    pressType('Water');
    pressType('Water');

    expect(typeButton('Water').getAttribute('aria-pressed')).toBe('false');
    expect(cards()).toHaveLength(ENTRIES.length);
  });
});

describe('the match-all toggle', () => {
  it('is inert but still rendered and still reachable below two selected types', () => {
    mountPool();

    expect(matchAll().getAttribute('aria-disabled')).toBe('true');
    // aria-disabled and NOT the native attribute: a natively disabled control leaves the
    // tab order, and a control that appears and disappears is what 02-UI-SPEC §8 calls the
    // worse outcome on a shared screen.
    expect(matchAll().disabled).toBe(false);
    expect(matchAll().tabIndex).not.toBe(-1);

    pressType('Water');
    expect(matchAll().getAttribute('aria-disabled')).toBe('true');
  });

  it('changes nothing when clicked while inert, so the attribute is honest', () => {
    mountPool();

    pressType('Water');
    const before = cards().length;

    act(() => {
      matchAll().click();
    });

    expect(cards()).toHaveLength(before);
    expect(matchAll().checked).toBe(false);
  });

  it('becomes live at two selected types', () => {
    mountPool();

    pressType('Water');
    pressType('Flying');

    expect(matchAll().getAttribute('aria-disabled')).toBeNull();

    act(() => {
      matchAll().click();
    });

    expect(matchAll().checked).toBe(true);
  });

  it('carries a visible label rather than only an accessible one', () => {
    mountPool();

    const label = host.querySelector<HTMLLabelElement>('label[for="pool-match-all"]');
    expect(label?.textContent).toBe('Match all selected types');
    expect(label?.classList.contains('visually-hidden')).toBe(false);
  });
});

describe('the Mega capability control', () => {
  it('is a real radio group of three, defaulting to All', () => {
    mountPool();

    const legends = [...host.querySelectorAll('legend')].map((legend) => legend.textContent);
    expect(legends).toContain('Mega capability');

    const radios = [...host.querySelectorAll<HTMLInputElement>('input[name="pool-mega-filter"]')];
    expect(radios).toHaveLength(3);
    expect(radios.filter((radio) => radio.checked).map((radio) => radio.value)).toEqual(['all']);

    const labels = radios.map(
      (radio) => host.querySelector(`label[for="${radio.id}"]`)?.textContent,
    );
    expect(labels).toEqual(['All', 'Mega-capable', 'Non-Mega']);
  });

  it('partitions the roster exactly between its two constraining options', () => {
    mountPool();

    chooseMega('mega');
    const megaCount = cards().length;
    expect(megaCount).toBe(SNAPSHOT.counts.megaCapableSpecies);

    chooseMega('nonMega');
    const nonMegaCount = cards().length;

    expect(megaCount + nonMegaCount).toBe(ENTRIES.length);
  });

  it('returns the whole pool on All', () => {
    mountPool();

    chooseMega('mega');
    chooseMega('all');

    expect(cards()).toHaveLength(ENTRIES.length);
  });
});

// ---------------------------------------------------------------------------
// Composition, which is the whole point of one predicate chain
// ---------------------------------------------------------------------------

describe('search and the filters compose', () => {
  it('narrows through both at once', () => {
    mountPool();

    typeSearch('wash');
    pressType('Water');

    expect(cardNames()).toEqual(['Rotom-Wash']);
    expect(host.querySelector('.pool__count')?.textContent).toBe(`1 of ${ENTRIES.length} available`);
  });

  it('renders the both-active empty state when they contradict each other', () => {
    mountPool();

    typeSearch('wash');
    pressType('Fire');

    expect(cards()).toHaveLength(0);
    expect(host.querySelector('.pool__empty-heading')?.textContent).toBe('No Pokémon match');
    expect(host.querySelector('.pool__empty-body')?.textContent).toBe(
      'Nothing in the pool matches "wash" with those filters.',
    );
    expect(buttonLabelled('Clear search and filters')).toBeDefined();
  });

  it('renders the filters-only empty state when no query is involved', () => {
    mountPool();

    // Four types no committed species carries all of at once.
    pressType('Water');
    pressType('Fire');
    pressType('Grass');
    act(() => {
      matchAll().click();
    });

    expect(cards()).toHaveLength(0);
    expect(host.querySelector('.pool__empty-body')?.textContent).toBe(
      'No Pokémon left in the pool has those types and Mega setting.',
    );
    expect(buttonLabelled('Clear filters')).toBeDefined();
  });
});

describe('Clear filters', () => {
  it('returns every control to neutral in one click', () => {
    mountPool();

    typeSearch('wash');
    pressType('Water');
    pressType('Flying');
    act(() => {
      matchAll().click();
    });
    chooseMega('nonMega');

    act(() => {
      buttonLabelled('Clear filters')?.click();
    });

    expect(searchField().value).toBe('');
    for (const button of typeButtons()) {
      expect(button.getAttribute('aria-pressed'), accessibleName(button)).toBe('false');
    }
    expect(matchAll().checked).toBe(false);
    expect(megaOption('all').checked).toBe(true);
    expect(cards()).toHaveLength(ENTRIES.length);
  });
});
