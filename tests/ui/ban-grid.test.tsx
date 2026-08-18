// @vitest-environment happy-dom

/**
 * The ban grid — BAN-02's second input surface, over the same one list.
 *
 * Two questions, and they fail differently. The first is whether `PoolGrid` still renders
 * exactly what 02-03 shipped when it is not in ban mode: a mode prop that leaked into the
 * draft pool would put a pressed state on 235 cells that are not toggles, and nothing about
 * a screenshot would look wrong. The second is whether the grid and the typeahead are ONE
 * list rather than two lists that happen to agree — which is what
 * `a species banned by name is already pressed in the grid` defends, and it is the only
 * assertion that can tell those two designs apart.
 *
 * `vi.hoisted` synthetic entries carry the rendering-shape assertions; the committed roster
 * carries the ones about counts over a whole roster.
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const edge = vi.hoisted(() => {
  let seedIndex = 0;
  let idIndex = 0;

  return {
    reset(): void {
      seedIndex = 0;
      idIndex = 0;
    },
    newSeed(): number {
      seedIndex += 1;
      return 7000 + seedIndex;
    },
    newId(): string {
      idIndex += 1;
      return `id-${idIndex}`;
    },
  };
});

vi.mock('../../src/adapters/id', () => ({
  newSeed: () => edge.newSeed(),
  newId: () => edge.newId(),
}));

import committedSnapshot from '../../public/data/roster.mb.json';
import type { SpriteMeta } from '../../src/adapters/roster-source';
import type { RosterEntry, RosterSnapshot } from '../../src/core/roster/types';
import { announce, LiveRegion } from '../../src/ui/components/LiveRegion';
import { PoolGrid } from '../../src/ui/components/PoolGrid';
import { ConfigScreen } from '../../src/ui/screens/ConfigScreen';

const VIEW_KEY = 'champions-drafter:view';

/** Two synthetic rows, both routed to the committed placeholder. */
const FIXTURE: readonly RosterEntry[] = [
  {
    id: 'venusaur',
    name: 'Venusaur',
    num: 3,
    types: ['Grass', 'Poison'],
    baseStats: { hp: 80, atk: 82, def: 83, spa: 100, spd: 100, spe: 80 },
    baseSpeciesId: 'venusaur',
    forme: null,
    megaCapable: true,
    megaFormes: [],
    spriteId: 'venusaur',
    spriteMissing: true,
  },
  {
    id: 'snorlax',
    name: 'Snorlax',
    num: 143,
    types: ['Normal'],
    baseStats: { hp: 160, atk: 110, def: 65, spa: 65, spd: 110, spe: 30 },
    baseSpeciesId: 'snorlax',
    forme: null,
    megaCapable: false,
    megaFormes: [],
    spriteId: 'snorlax',
    spriteMissing: true,
  },
];

const SPRITE_META: SpriteMeta = {
  nativeWidth: 96,
  nativeHeight: 96,
  byRosterId: {},
};

function byDexOrder(a: RosterEntry, b: RosterEntry): number {
  if (a.num !== b.num) return a.num - b.num;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

const SNAPSHOT = committedSnapshot as unknown as RosterSnapshot;
const ENTRIES: readonly RosterEntry[] = [...SNAPSHOT.entries].sort(byDexOrder);

// ---------------------------------------------------------------------------

let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);

  announce('');
  edge.reset();
  localStorage.clear();
});

afterEach(() => {
  render(null, host);
  host.remove();
});

function mountGrid(
  bannedIds: ReadonlySet<string> | null,
  onPick: (entry: RosterEntry) => void = () => undefined,
): void {
  act(() => {
    render(
      <PoolGrid
        entries={FIXTURE}
        spriteMeta={SPRITE_META}
        onPick={onPick}
        bannedIds={bannedIds}
      />,
      host,
    );
  });
}

function mountScreen(): void {
  act(() => {
    render(
      <>
        <ConfigScreen
          snapshot={SNAPSHOT}
          entries={ENTRIES}
          spriteMeta={SPRITE_META}
          onStarted={() => undefined}
        />
        <LiveRegion />
      </>,
      host,
    );
  });
}

/**
 * The `Bans` group, and everything inside it.
 *
 * Scoped rather than queried across the whole screen because 03-04 added a SECOND ban
 * surface — the Mega-forme grid, chips and typeahead inside `Mega rules`, which renders
 * ABOVE this group. An unscoped `.typeahead__input` or `.pool__count` now finds that one
 * first, and every assertion here is about the species banlist.
 */
function bansGroup(): HTMLElement {
  const group = [...host.querySelectorAll<HTMLElement>('fieldset')].find(
    (element) => element.querySelector('legend')?.textContent?.trim() === 'Bans',
  );
  // Falls back to the whole host for the cases that mount `PoolGrid` directly, where there
  // is no config screen around it and therefore only ever one grid.
  return group ?? host;
}

function cards(): HTMLButtonElement[] {
  return [...bansGroup().querySelectorAll<HTMLButtonElement>('.mon-card')];
}

function cardFor(name: string): HTMLButtonElement {
  const card = cards().find((element) => element.querySelector('.mon-card__name')?.textContent === name);
  if (card === undefined) throw new Error(`no cell for ${name}`);
  return card;
}

function countLine(): string {
  return bansGroup().querySelector('.pool__count')?.textContent ?? '';
}

function chips(): HTMLButtonElement[] {
  return [...bansGroup().querySelectorAll<HTMLButtonElement>('.ban-chip')];
}

function liveRegionText(): string {
  return host.querySelector('[aria-live="polite"]')?.textContent ?? '';
}

function banField(): HTMLInputElement {
  const input = bansGroup().querySelector<HTMLInputElement>('.typeahead__input');
  if (input === null) throw new Error('the ban field is not on the screen');
  return input;
}

/** Ban `name` through the TYPEAHEAD, so the grid's own state is never touched. */
function banByName(name: string): void {
  act(() => {
    const input = banField();
    input.value = name;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  const option = [...host.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (element) => element.textContent?.trim() === name,
  );
  if (option === undefined) throw new Error(`no option for ${name}`);

  act(() => {
    option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  });
}

// ---------------------------------------------------------------------------
// The component, in both modes
// ---------------------------------------------------------------------------

describe('PoolGrid outside ban mode', () => {
  it('renders exactly what the draft screen has always had', () => {
    mountGrid(null);

    const section = host.querySelector('section.pool');
    expect(section?.getAttribute('aria-labelledby')).toBe('pool-heading');

    const headings = [...host.querySelectorAll('h2')];
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe('Pool');
    expect(countLine()).toMatch(/^\d+ available$/);
  });

  it('puts no pressed state on a cell that is not a toggle', () => {
    mountGrid(null);

    // Scoped to `.mon-card`, which is what this assertion was always about. 02-08's type
    // toolbar puts `aria-pressed` on eighteen filter buttons inside the same header, and
    // those genuinely ARE toggles — an unscoped query here would report the filter bar
    // working as this component's regression.
    expect(bansGroup().querySelectorAll('.mon-card[aria-pressed]')).toHaveLength(0);
    expect(bansGroup().querySelectorAll('.mon-card--banned')).toHaveLength(0);
    expect(bansGroup().querySelectorAll('.mon-card__name--banned')).toHaveLength(0);
  });

  it('keeps the sprite decorative at every density', () => {
    for (const density of ['minimal', 'standard', 'full']) {
      localStorage.setItem(VIEW_KEY, JSON.stringify({ density, pane: 'split' }));
      mountGrid(null);

      for (const image of bansGroup().querySelectorAll('img.mon-card__sprite')) {
        expect(image.getAttribute('alt')).toBe('');
      }

      render(null, host);
    }
  });
});

describe('PoolGrid in ban mode', () => {
  it('drops the heading and counts what is banned instead', () => {
    mountGrid(new Set(['venusaur']));

    expect(host.querySelector('section.pool')).toBeNull();
    expect(bansGroup().querySelector('.pool--ban')).not.toBeNull();
    expect(host.querySelector('[aria-labelledby]')).toBeNull();
    expect(host.querySelectorAll('h2')).toHaveLength(0);
    expect(countLine()).toMatch(/^\d+ of \d+ banned$/);
    expect(countLine()).toBe('1 of 2 banned');
  });

  it('counts by membership over what is rendered, never by the set size', () => {
    // A stranger id in the set. It is banned nowhere, so it counts nowhere.
    mountGrid(new Set(['venusaur', 'not-a-real-id']));

    expect(countLine()).toBe('1 of 2 banned');
  });

  it('marks every cell with a pressed state, true only where it is banned', () => {
    mountGrid(new Set(['venusaur']));

    // Scoped for the same reason as the draft-mode assertion above.
    expect(bansGroup().querySelectorAll('.mon-card[aria-pressed]')).toHaveLength(FIXTURE.length);
    expect(cardFor('Venusaur').getAttribute('aria-pressed')).toBe('true');
    expect(cardFor('Snorlax').getAttribute('aria-pressed')).toBe('false');

    expect(cardFor('Venusaur').classList.contains('mon-card--banned')).toBe(true);
    expect(
      cardFor('Venusaur').querySelector('.mon-card__name')?.classList.contains(
        'mon-card__name--banned',
      ),
    ).toBe(true);
    expect(cardFor('Snorlax').classList.contains('mon-card--banned')).toBe(false);
  });

  it('hands the whole entry to the handler the caller supplied, once', () => {
    const picked: RosterEntry[] = [];
    mountGrid(new Set(), (entry) => {
      picked.push(entry);
    });

    act(() => {
      cardFor('Snorlax').click();
    });

    expect(picked).toHaveLength(1);
    expect(picked[0]?.id).toBe('snorlax');
  });

  it('keeps the sprite decorative in ban mode too', () => {
    mountGrid(new Set(['venusaur']));

    for (const image of host.querySelectorAll('img.mon-card__sprite')) {
      expect(image.getAttribute('alt')).toBe('');
    }
  });
});

// ---------------------------------------------------------------------------
// The grid on the config screen, against the real roster
// ---------------------------------------------------------------------------

describe('the ban grid on the config screen', () => {
  it('renders one cell per draftable entry, banned ones included', () => {
    mountScreen();

    expect(cards()).toHaveLength(ENTRIES.length);

    const total = Number(countLine().split(' ')[2]);
    expect(total).toBe(cards().length);
  });

  it('bans a species when its cell is clicked, and says so', () => {
    mountScreen();

    act(() => {
      cardFor('Pikachu').click();
    });

    expect(chips()).toHaveLength(1);
    expect(chips()[0]?.getAttribute('aria-label')).toBe('Remove Pikachu from the banlist');
    expect(countLine()).toBe(`1 of ${ENTRIES.length} banned`);
    expect(cardFor('Pikachu').getAttribute('aria-pressed')).toBe('true');
    expect(liveRegionText()).toBe('Pikachu banned. 1 ban.');
  });

  it('unbans on a second click, and the chip goes with it', () => {
    mountScreen();

    act(() => {
      cardFor('Pikachu').click();
    });
    act(() => {
      cardFor('Pikachu').click();
    });

    expect(chips()).toHaveLength(0);
    expect(cardFor('Pikachu').getAttribute('aria-pressed')).toBe('false');
    expect(countLine()).toBe(`0 of ${ENTRIES.length} banned`);
  });

  /**
   * D-10's whole claim, and the only assertion that can distinguish one list read two ways
   * from two lists that happen to agree. Nothing touches the grid here.
   */
  it('a species banned by name is already pressed in the grid', () => {
    mountScreen();

    banByName('Rotom-Wash');

    expect(cardFor('Rotom-Wash').getAttribute('aria-pressed')).toBe('true');
    expect(countLine()).toBe(`1 of ${ENTRIES.length} banned`);
  });

  it('shares the density control and the stored preference with the draft pool', () => {
    mountScreen();

    const minimal = host.querySelector<HTMLInputElement>('#pool-density-minimal');
    expect(minimal).not.toBeNull();

    act(() => {
      minimal?.click();
    });

    // Scoped: the Mega-forme grid 03-04 added renders above this one and owns its own
    // density state, so the first `.pool` on the screen is no longer this grid.
    expect(bansGroup().querySelector('.pool')?.getAttribute('data-density')).toBe('minimal');
    expect(JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}')).toMatchObject({
      density: 'minimal',
    });
  });
});
