// @vitest-environment happy-dom

/**
 * DRFT-08 — finding a Pokémon by name, end to end.
 *
 * The chain under test is `FilterBar` → `PoolFilters` → `compileFilters` →
 * `matchesFilters` → the cells `PoolGrid` renders → the count line. `tests/core/search.ts`
 * already proves the predicates; what can only be proved here is that the component calls
 * them, calls them once per change, and renders the three things that follow from the
 * result — the surviving cells, the count line, and the empty state.
 *
 * The committed roster is used wherever a count over a whole roster is the assertion, and
 * wherever the fixture that punishes name parsing matters: `Rotom-Wash` and
 * `Tauros-Paldea-Aqua` both need a mid-name match rather than a prefix one, and neither
 * can be synthesized honestly.
 *
 * No `vi.mock` and no `vi.hoisted`, following `tests/ui/pool-density.test.tsx`: `PoolGrid`
 * takes its entries as a prop, so there is no adapter seam to intercept. `byRosterId` is
 * left empty so every sprite routes to the committed placeholder and no assertion here
 * depends on a file on disk.
 */

import { render } from 'preact';
import { useState } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import committedSnapshot from '../../public/data/roster.mb.json';
import type { SpriteMeta } from '../../src/adapters/roster-source';
import type { RosterEntry, RosterSnapshot } from '../../src/core/roster/types';
import { announce } from '../../src/ui/components/LiveRegion';
import { PoolGrid } from '../../src/ui/components/PoolGrid';

const SNAPSHOT = committedSnapshot as unknown as RosterSnapshot;
const ENTRIES: readonly RosterEntry[] = SNAPSHOT.entries;

const SPRITE_META: SpriteMeta = { nativeWidth: 96, nativeHeight: 96, byRosterId: {} };

const SEARCH_EMPTY_BODY =
  'Nothing in the pool matches "zzz". Try part of the name — "wash" finds Rotom-Wash — or clear the search.';

let host: HTMLDivElement;

beforeEach(() => {
  localStorage.clear();
  // A module-level signal outlives every render in this file. This file announces
  // nothing, but the grid it mounts will once 02-08's third task lands, and a stale
  // message from a neighbouring suite would satisfy an assertion here.
  announce('');
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(() => {
  render(null, host);
  host.remove();
});

// ---------------------------------------------------------------------------

function mountPool(
  onPick: (entry: RosterEntry, meta: { filtersCleared: boolean }) => void = () => undefined,
  bannedIds: ReadonlySet<string> | null = null,
): void {
  act(() => {
    render(
      <PoolGrid
        entries={ENTRIES}
        spriteMeta={SPRITE_META}
        onPick={onPick}
        bannedIds={bannedIds}
      />,
      host,
    );
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

function countLine(): string {
  return host.querySelector('.pool__count')?.textContent ?? '';
}

function buttonLabelled(text: string): HTMLButtonElement | undefined {
  return [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent?.trim() === text,
  );
}

function click(button: HTMLButtonElement | undefined): void {
  if (button === undefined) throw new Error('no such button');
  act(() => {
    button.click();
  });
}

// ---------------------------------------------------------------------------
// The field itself
// ---------------------------------------------------------------------------

describe('the pool search field', () => {
  it('is a search input with a hidden label and a visible placeholder', () => {
    mountPool();

    const input = searchField();
    expect(input.getAttribute('type')).toBe('search');
    expect(input.getAttribute('placeholder')).toBe('Name');

    const label = host.querySelector<HTMLLabelElement>('label[for="pool-search"]');
    expect(label?.textContent).toBe('Search the pool by name');
    expect(label?.classList.contains('visually-hidden')).toBe(true);
  });

  it('sits inside the pool header rather than inside the scrolling grid', () => {
    mountPool();

    expect(host.querySelector('.pool__header .filter-bar')).not.toBeNull();
    expect(host.querySelector('.pool__grid .filter-bar')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Narrowing
// ---------------------------------------------------------------------------

describe('typing a query narrows the pool live', () => {
  it('leaves exactly the one Pokémon a mid-name query selects', () => {
    mountPool();
    expect(cards()).toHaveLength(ENTRIES.length);

    typeSearch('wash');

    expect(cards()).toHaveLength(1);
    expect(cards()[0]?.getAttribute('aria-label')).toContain('Rotom-Wash');
  });

  it('finds a hyphenated forme by a fragment from the middle of its name', () => {
    mountPool();

    typeSearch('aqua');

    expect(cardNames()).toContain('Tauros-Paldea-Aqua');
  });

  /**
   * Removed, not hidden. A cell left in the DOM under `display: none` would still be
   * reachable by a screen reader's element walk and would still be counted by every
   * assertion in this file that measures the rendered set.
   */
  it('removes the cells that do not match rather than hiding them', () => {
    mountPool();

    typeSearch('wash');

    expect(cardNames()).toEqual(['Rotom-Wash']);
    expect(host.textContent).not.toContain('Rotom-Heat');
  });

  it('ignores punctuation and case, so one name has one query', () => {
    mountPool();

    typeSearch('MR. RIME');

    expect(cardNames()).toEqual(['Mr. Rime']);
  });
});

describe('the count line', () => {
  it('states the plain total while nothing is filtered', () => {
    mountPool();

    expect(countLine()).toMatch(/^\d+ available$/);
    expect(countLine()).toBe(`${ENTRIES.length} available`);
  });

  it('states the filtered figure against the total once a filter is active', () => {
    mountPool();

    typeSearch('wash');

    expect(countLine()).toMatch(/^1 of \d+ available$/);
    expect(countLine()).toBe(`1 of ${ENTRIES.length} available`);
  });

  it('returns to the plain total when the query is emptied', () => {
    mountPool();

    typeSearch('wash');
    typeSearch('');

    expect(countLine()).toBe(`${ENTRIES.length} available`);
  });
});

// ---------------------------------------------------------------------------
// The empty state
// ---------------------------------------------------------------------------

describe('a query that matches nothing', () => {
  beforeEach(() => {
    mountPool();
    typeSearch('zzz');
  });

  it('renders no cells at all', () => {
    expect(cards()).toHaveLength(0);
    expect(host.querySelector('.pool__grid')).toBeNull();
  });

  it('renders the heading and the body the copywriting contract gives, exactly', () => {
    expect(host.querySelector('.pool__empty-heading')?.textContent).toBe('No Pokémon match');
    // Exact string equality, never `toContain`: the em dashes and the worked example are
    // the copy, and a sentence that merely contains the right words is a different
    // sentence.
    expect(host.querySelector('.pool__empty-body')?.textContent).toBe(SEARCH_EMPTY_BODY);
  });

  it('offers the action that undoes exactly the thing that emptied the pool', () => {
    expect(buttonLabelled('Clear the search')).toBeDefined();
    expect(buttonLabelled('Clear search and filters')).toBeUndefined();
  });

  it('brings every cell back when that action is taken', () => {
    click(buttonLabelled('Clear the search'));

    expect(searchField().value).toBe('');
    expect(cards()).toHaveLength(ENTRIES.length);
    expect(host.querySelector('.pool__empty')).toBeNull();
  });
});

describe('Clear filters', () => {
  it('is not rendered while nothing is active, because it would clear nothing', () => {
    mountPool();

    expect(buttonLabelled('Clear filters')).toBeUndefined();
  });

  it('is rendered once a query is active, and empties the field', () => {
    mountPool();

    typeSearch('wash');
    expect(buttonLabelled('Clear filters')).toBeDefined();

    click(buttonLabelled('Clear filters'));

    expect(searchField().value).toBe('');
    expect(cards()).toHaveLength(ENTRIES.length);
  });
});

// ---------------------------------------------------------------------------
// D-35, and the distinction it is easiest to get wrong
// ---------------------------------------------------------------------------

/**
 * A stateful harness: picking removes the species from `entries`, which is what
 * `selectAvailablePool` does on the real draft screen.
 */
function DraftHarness({ onPick }: { onPick: (entry: RosterEntry) => void }) {
  const [pool, setPool] = useState<readonly RosterEntry[]>(ENTRIES);

  return (
    <PoolGrid
      entries={pool}
      spriteMeta={SPRITE_META}
      onPick={(entry) => {
        setPool((current) => current.filter((candidate) => candidate.id !== entry.id));
        onPick(entry);
      }}
      bannedIds={null}
    />
  );
}

describe('a filter hides a Pokémon; a pick removes one — and the two are not the same mechanism', () => {
  it('a filtered-out species is pickable the moment the filter clears', () => {
    const picked = vi.fn();
    act(() => {
      render(<DraftHarness onPick={picked} />, host);
    });

    typeSearch('fire');
    expect(cardNames()).not.toContain('Rotom-Wash');

    typeSearch('');
    expect(cardNames()).toContain('Rotom-Wash');

    const card = cards().find(
      (element) => element.querySelector('.mon-card__name')?.textContent === 'Rotom-Wash',
    );
    click(card);

    expect(picked).toHaveBeenCalledTimes(1);
    expect(picked.mock.calls[0]?.[0]?.id).toBe('rotomwash');
  });

  it('a drafted species does NOT come back when the filter clears', () => {
    act(() => {
      render(<DraftHarness onPick={() => undefined} />, host);
    });

    typeSearch('wash');
    click(cards()[0]);

    // The pick cleared the search (D-35), so the whole pool is on screen again.
    expect(searchField().value).toBe('');
    expect(cardNames()).not.toContain('Rotom-Wash');

    typeSearch('wash');
    expect(cards()).toHaveLength(0);
  });
});

describe('committing a pick clears the search', () => {
  it('empties the field and repopulates the pool on the same commit', () => {
    mountPool();

    typeSearch('wash');
    expect(cards()).toHaveLength(1);

    click(cards()[0]);

    expect(searchField().value).toBe('');
    expect(cards()).toHaveLength(ENTRIES.length);
  });

  it('tells the caller whether the commit cleared anything', () => {
    const picked = vi.fn();
    mountPool(picked);

    click(cards()[0]);
    expect(picked.mock.calls[0]?.[1]).toEqual({ filtersCleared: false });

    typeSearch('wash');
    click(cards()[0]);
    expect(picked.mock.calls[1]?.[1]).toEqual({ filtersCleared: true });
  });
});

// ---------------------------------------------------------------------------
// Ban mode — the same bar, and deliberately not the same clearing rule
// ---------------------------------------------------------------------------

describe('the filter bar in ban mode', () => {
  it('renders, above the capped scroll region rather than inside it', () => {
    mountPool(() => undefined, new Set());

    expect(host.querySelector('.pool--ban .filter-bar')).not.toBeNull();
    expect(host.querySelector('#pool-search')).not.toBeNull();
  });

  it('narrows the ban grid and counts over what survived the filter', () => {
    mountPool(() => undefined, new Set(['rotomwash']));

    typeSearch('rotom');

    expect(countLine()).toMatch(/^\d+ of \d+ banned$/);
    expect(countLine()).toBe('1 of 6 banned');
  });

  /**
   * D-35's hazard is a TURN passing on a shared screen — "player 5 picks from player 4's
   * leftover Fire only filter". Toggling a ban passes no turn, and a host banning twenty
   * Fire species would have the filter reset under them on every click.
   */
  it('does not clear the filters when a cell is activated, because no turn passed', () => {
    const toggled = vi.fn();
    mountPool(toggled, new Set());

    typeSearch('wash');
    click(cards()[0]);

    expect(toggled).toHaveBeenCalledTimes(1);
    expect(toggled.mock.calls[0]?.[1]).toEqual({ filtersCleared: false });
    expect(searchField().value).toBe('wash');
    expect(cards()).toHaveLength(1);
  });
});
