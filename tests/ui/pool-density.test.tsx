// @vitest-environment happy-dom

/**
 * The three display densities — DRFT-05, DRFT-06, D-25.
 *
 * Density is the one feature in this plan whose failure mode is silent. A level that
 * renders one pill too few, or that quietly falls back to `standard` because the stored
 * preference was read in an effect instead of a state initializer, looks entirely
 * plausible in a screenshot. So the content per level is asserted against a real DOM
 * rather than by reading the JSX.
 *
 * No `vi.mock` and no `vi.hoisted` here, unlike `tests/ui/read-only-shell.test.tsx`.
 * That file mounts the whole `App`, which fetches the roster on mount and therefore needs
 * the adapter seam stubbed. `PoolGrid` takes its entries as a prop, so the fixture is a
 * plain constant and there is nothing to intercept. `spriteMissing: true` on every row
 * still matters for the same reason it does there: it routes every sprite to the
 * committed placeholder, so no assertion here depends on a file on disk.
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { SpriteMeta } from '../../src/adapters/roster-source';
import type { RosterEntry } from '../../src/core/roster/types';
import { announce, LiveRegion } from '../../src/ui/components/LiveRegion';
import { PoolGrid } from '../../src/ui/components/PoolGrid';

const VIEW_KEY = 'champions-drafter:view';

/** Venusaur totals 525, Snorlax 540. Both are checked in the assertions below. */
const ENTRIES: readonly RosterEntry[] = [
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
  byRosterId: Object.fromEntries(
    ENTRIES.map((entry) => [entry.id, { pokeapiId: entry.num, file: `${entry.num}.png`, slug: entry.id }]),
  ),
};

let container: HTMLDivElement;

function mount(): void {
  render(
    <>
      {/* `bannedIds` is null: this file is about the draft-screen pool, not the ban grid. */}
      <PoolGrid
        entries={ENTRIES}
        spriteMeta={SPRITE_META}
        onPick={() => undefined}
        bannedIds={null}
      />
      <LiveRegion />
    </>,
    container,
  );
}

function poolRoot(): HTMLElement {
  const root = container.querySelector<HTMLElement>('.pool');
  if (root === null) throw new Error('pool root not rendered');
  return root;
}

function cards(): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('.mon-card')];
}

function pillsIn(card: HTMLElement): HTMLElement[] {
  return [...card.querySelectorAll<HTMLElement>('.type-pill')];
}

function liveRegionText(): string {
  return container.querySelector('[role="status"]')?.textContent ?? '';
}

function setStoredDensity(density: string): void {
  localStorage.setItem(VIEW_KEY, JSON.stringify({ density, pane: 'split' }));
}

function chooseDensity(value: string): void {
  const input = container.querySelector<HTMLInputElement>(`#pool-density-${value}`);
  if (input === null) throw new Error(`no density option for ${value}`);
  act(() => {
    input.click();
  });
}

beforeEach(() => {
  localStorage.clear();
  // A module-level signal outlives every render in this file, so a stale message from
  // the previous test would satisfy the next one's assertion.
  announce('');
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(() => {
  render(null, container);
  container.remove();
});

describe('the pool root carries the density', () => {
  it('as a data attribute, so the board pane cannot inherit the tokens', () => {
    setStoredDensity('full');
    act(mount);

    expect(poolRoot().getAttribute('data-density')).toBe('full');
  });

  it('defaulting to standard when nothing is stored', () => {
    act(mount);

    expect(poolRoot().getAttribute('data-density')).toBe('standard');
  });

  it('defaulting to standard when the stored value is not a density', () => {
    localStorage.setItem(VIEW_KEY, '{"density":"enormous","pane":"sideways"}');
    act(mount);

    expect(poolRoot().getAttribute('data-density')).toBe('standard');
  });

  it('read on the FIRST render rather than corrected by an effect', () => {
    setStoredDensity('minimal');

    // Deliberately not wrapped in `act`. Preact's render is synchronous and its effects
    // are not, so reading the DOM on the next line observes the first paint. If the
    // density were defaulted and then fixed in an effect, this would still say
    // `standard` here — which is exactly the flash of the wrong layout a host would see
    // on every reload.
    mount();

    expect(poolRoot().getAttribute('data-density')).toBe('minimal');
  });
});

describe('minimal density', () => {
  beforeEach(() => {
    setStoredDensity('minimal');
    act(mount);
  });

  it('renders the sprite and the name and nothing else', () => {
    expect(cards()).toHaveLength(2);

    for (const card of cards()) {
      expect(card.querySelector('.mon-card__sprite')).not.toBeNull();
      expect(card.querySelector('.mon-card__name')).not.toBeNull();
    }
  });

  it('renders no type pills', () => {
    expect(container.querySelectorAll('.type-pill')).toHaveLength(0);
  });

  it('renders no stat block', () => {
    expect(container.querySelectorAll('.stat-block')).toHaveLength(0);
    expect(container.querySelectorAll('.stat-block__grid')).toHaveLength(0);
  });
});

describe('standard density', () => {
  beforeEach(() => {
    setStoredDensity('standard');
    act(mount);
  });

  it('renders one pill per type, carrying the three-letter code', () => {
    const [venusaur, snorlax] = cards();

    expect(pillsIn(venusaur!).map((pill) => pill.textContent)).toEqual(['GRA', 'POI']);
    expect(pillsIn(snorlax!).map((pill) => pill.textContent)).toEqual(['NOR']);
  });

  it('gives an abbreviated pill the full type as its accessible name', () => {
    const [venusaur] = cards();

    expect(pillsIn(venusaur!).map((pill) => pill.getAttribute('aria-label'))).toEqual([
      'Grass',
      'Poison',
    ]);
  });

  it('renders the stat total', () => {
    const [venusaur, snorlax] = cards();

    expect(venusaur!.querySelector('.stat-block')?.textContent).toBe('Total525');
    expect(snorlax!.querySelector('.stat-block')?.textContent).toBe('Total540');
  });

  it('does not open the six stats', () => {
    expect(container.querySelectorAll('.stat-block__grid')).toHaveLength(0);
  });
});

describe('full density', () => {
  beforeEach(() => {
    setStoredDensity('full');
    act(mount);
  });

  it('renders one pill per type, carrying the full type name', () => {
    const [venusaur, snorlax] = cards();

    expect(pillsIn(venusaur!).map((pill) => pill.textContent)).toEqual(['Grass', 'Poison']);
    expect(pillsIn(snorlax!).map((pill) => pill.textContent)).toEqual(['Normal']);
  });

  it('drops the aria-label once the visible text is the full name', () => {
    for (const pill of container.querySelectorAll('.type-pill')) {
      expect(pill.hasAttribute('aria-label')).toBe(false);
    }
  });

  it('keeps the total and adds six labelled stats per card', () => {
    for (const card of cards()) {
      const list = card.querySelector('.stat-block__grid');
      expect(list).not.toBeNull();
      expect(list!.querySelectorAll('.stat-block__label')).toHaveLength(6);
      expect(list!.querySelectorAll('.stat-block__value')).toHaveLength(6);
    }
  });

  it("lists the stats in Showdown's canonical order with the right values", () => {
    const [venusaur] = cards();
    const list = venusaur!.querySelector('.stat-block__grid')!;

    expect([...list.querySelectorAll('.stat-block__label')].map((term) => term.textContent)).toEqual([
      'HP',
      'Atk',
      'Def',
      'SpA',
      'SpD',
      'Spe',
    ]);
    expect([...list.querySelectorAll('.stat-block__value')].map((value) => value.textContent)).toEqual([
      '80',
      '82',
      '83',
      '100',
      '100',
      '80',
    ]);
  });

  /*
   * The six stats are phrasing content, not a description list, because the whole cell is
   * a button and a button admits only phrasing content. Asserted on the rendered DOM
   * rather than trusted from the JSX: the invalid nesting rendered perfectly well in every
   * browser, which is exactly why it survived review the first time.
   */
  it('renders the stats as phrasing content, so the cell stays a conforming button', () => {
    for (const card of cards()) {
      expect(card.tagName).toBe('BUTTON');
      expect(card.querySelectorAll('dl, dt, dd')).toHaveLength(0);
    }
  });
});

describe('changing the density', () => {
  it('announces the level using the visible label', () => {
    act(mount);

    chooseDensity('full');

    expect(liveRegionText()).toBe('Display density: Full.');
  });

  it('persists the choice so it survives a reload', () => {
    act(mount);

    chooseDensity('minimal');

    expect(JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}')).toEqual({
      density: 'minimal',
      pane: 'split',
    });
  });

  it('leaves the pane preference stored beside it alone', () => {
    localStorage.setItem(VIEW_KEY, JSON.stringify({ density: 'standard', pane: 'board' }));
    act(mount);

    chooseDensity('full');

    expect(JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}')).toEqual({
      density: 'full',
      pane: 'board',
    });
  });

  it('re-renders the cards at the new level', () => {
    setStoredDensity('minimal');
    act(mount);
    expect(container.querySelectorAll('.type-pill')).toHaveLength(0);

    chooseDensity('full');

    expect(poolRoot().getAttribute('data-density')).toBe('full');
    expect(container.querySelectorAll('.type-pill')).toHaveLength(3);
    expect(container.querySelectorAll('.stat-block__grid')).toHaveLength(2);
  });
});

/*
 * The cell states its own name instead of letting one be computed from its subtree.
 *
 * Without this the name is the flattened text of everything inside the button, so `full`
 * density announces every stat as part of the control's name. The assertions below pin
 * both halves of that: the name is the species and its types, and it does NOT grow when
 * the density opens the stats.
 */
describe('the accessible name of a cell', () => {
  function namesAtDensity(density: string): (string | null)[] {
    setStoredDensity(density);
    act(mount);
    return cards().map((card) => card.getAttribute('aria-label'));
  }

  it('is the species and its types', () => {
    expect(namesAtDensity('standard')).toEqual(['Venusaur, Grass Poison', 'Snorlax, Normal']);
  });

  it('is identical at every density, so flipping the control never renames a cell', () => {
    const minimal = namesAtDensity('minimal');
    act(() => render(null, container));
    const full = namesAtDensity('full');

    expect(minimal).toEqual(full);
  });

  it('excludes the base stats even once they are visible', () => {
    for (const name of namesAtDensity('full')) {
      expect(name).not.toContain('525');
      expect(name).not.toContain('Total');
    }
  });
});

describe('the density control itself', () => {
  beforeEach(() => {
    act(mount);
  });

  it('is a real radio group inside a labelled fieldset', () => {
    const fieldset = container.querySelector('fieldset');

    expect(fieldset).not.toBeNull();
    expect(fieldset!.querySelector('legend')?.textContent).toBe('Display density');
    expect(fieldset!.querySelectorAll('input[type="radio"]')).toHaveLength(3);
  });

  it('checks exactly the current level', () => {
    const checked = [...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')].filter(
      (input) => input.checked,
    );

    expect(checked).toHaveLength(1);
    expect(checked[0]!.value).toBe('standard');
  });

  it('binds every label to its input, so the label is the click target', () => {
    for (const label of container.querySelectorAll<HTMLLabelElement>('.segmented__label')) {
      const id = label.getAttribute('for');
      expect(id).not.toBeNull();
      expect(container.querySelector(`#${id}`)).not.toBeNull();
    }
  });
});

describe('the sprite alt text', () => {
  it('stays empty at every density, because the name is always rendered', () => {
    for (const density of ['minimal', 'standard', 'full']) {
      setStoredDensity(density);
      act(mount);

      const images = [...container.querySelectorAll<HTMLImageElement>('.mon-card__sprite')];
      expect(images, density).toHaveLength(2);

      for (const image of images) {
        expect(image.getAttribute('alt'), density).toBe('');
      }

      // The empty alt is only correct while the name is adjacent, so the two are
      // asserted together rather than separately — that coupling is the whole rule.
      expect(
        cards().map((card) => card.querySelector('.mon-card__name')?.textContent),
        density,
      ).toEqual(['Venusaur', 'Snorlax']);

      render(null, container);
    }
  });
});
