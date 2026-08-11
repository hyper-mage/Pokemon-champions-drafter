// @vitest-environment happy-dom

/**
 * The config screen — D-02, 02-UI-SPEC §2.
 *
 * Two things here are worth a test rather than a review. The first is that the starting
 * order exists from first paint: it is the difference between "no order yet" being a
 * state to validate against and it being unrepresentable, and nothing about the screen
 * looks different if a regression turned the mount roll back into a click. The second is
 * that `Randomize order` draws a NEW seed rather than advancing one, which is asserted by
 * comparing the rendered order against `selectStartingOrder` run on two known seeds.
 *
 * `newSeed` and `newId` are stubbed at the adapter, which is the seam that exists for
 * exactly this. Nothing in `src/core` is mocked, and nothing needs to be.
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Hoisted so the `vi.mock` factory below can see it — `vi.mock` is lifted above every
 * import, so a plain `const` would still be in its temporal dead zone when it runs.
 */
const edge = vi.hoisted(() => {
  let seeds: number[] = [];
  let seedIndex = 0;
  let idIndex = 0;

  return {
    reset(values: number[]): void {
      seeds = values;
      seedIndex = 0;
      idIndex = 0;
    },
    newSeed(): number {
      // A distinct fallback rather than a repeat, so running past the end of the script
      // cannot accidentally reproduce a seed the test is asserting against.
      const value = seeds[seedIndex] ?? 9000 + seedIndex;
      seedIndex += 1;
      return value;
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

import { selectStartingOrder } from '../../src/core/selectors';
import type { RosterSnapshot } from '../../src/core/roster/types';
import { announce } from '../../src/ui/components/LiveRegion';
import { ConfigScreen } from '../../src/ui/screens/ConfigScreen';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ENTRIES = Array.from({ length: 60 }, (_, index) => ({
  id: `mon-${index}`,
  name: `Mon ${index}`,
  num: index + 1,
  types: ['Normal'],
  baseStats: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
  baseSpeciesId: `mon-${index}`,
  forme: null,
  megaCapable: index % 4 === 0,
  megaFormes: [],
  spriteId: `mon-${index}`,
  spriteMissing: true,
}));

const SNAPSHOT: RosterSnapshot = {
  schemaVersion: 1,
  regulation: 'mb',
  validFrom: '2026-01-01',
  validUntil: '2026-12-31',
  upstreamRef: 'test',
  generatedAt: '2026-01-01T00:00:00Z',
  counts: {
    legalEntries: ENTRIES.length,
    baseSpecies: ENTRIES.length,
    alternateFormes: 0,
    megaFormes: 0,
    megaCapableSpecies: ENTRIES.filter((entry) => entry.megaCapable).length,
    draftable: ENTRIES.length,
    excludedNonstandard: 0,
    excludedIllegalTier: 0,
    excludedBattleOnly: 0,
    excludedCosmetic: 0,
    distinctBaseSpecies: ENTRIES.length,
    megaCapableBaseSpecies: ENTRIES.filter((entry) => entry.megaCapable).length,
    orphanedMegaFormes: 0,
  },
  entries: ENTRIES,
  checksum: 'test-checksum',
};

/** The four ids the stubbed `newId` hands the four initial rows. */
const INITIAL_IDS = ['id-1', 'id-2', 'id-3', 'id-4'];

// ---------------------------------------------------------------------------

let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);

  // `announce` writes a module-level signal that outlives every render.
  announce('');
  edge.reset([]);
});

afterEach(() => {
  render(null, host);
  host.remove();
});

function mount(): void {
  act(() => {
    render(<ConfigScreen snapshot={SNAPSHOT} entries={ENTRIES} />, host);
  });
}

function buttonNamed(name: string): HTMLButtonElement | null {
  return (
    Array.from(host.querySelectorAll('button')).find(
      (element) => element.textContent?.trim() === name,
    ) ?? null
  );
}

function removeButtons(): HTMLButtonElement[] {
  return Array.from(host.querySelectorAll('button')).filter((element) =>
    element.textContent?.trim().startsWith('Remove '),
  );
}

function renderedOrder(): string[] {
  return Array.from(host.querySelectorAll('.player-list__order li')).map(
    (item) => item.textContent ?? '',
  );
}

function nameInputs(): HTMLInputElement[] {
  return Array.from(host.querySelectorAll<HTMLInputElement>('.player-list__name'));
}

function type(input: HTMLInputElement, value: string): void {
  act(() => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** The positional label a row is called when its name is blank. */
function positionalNames(ids: readonly string[], resolved: readonly string[]): string[] {
  return resolved.map((id) => `Player ${ids.indexOf(id) + 1}`);
}

// ---------------------------------------------------------------------------

describe('the starting order', () => {
  it('is already numbered on first paint, before Randomize order is ever clicked', () => {
    edge.reset([11]);
    mount();

    const items = host.querySelectorAll('.player-list__order li');
    expect(items).toHaveLength(4);
    expect(host.textContent).toContain('Starting order');

    // And it is the real derivation, not four rows in entry order.
    expect(renderedOrder()).toEqual(
      positionalNames(INITIAL_IDS, selectStartingOrder(11, INITIAL_IDS)),
    );
  });

  it('re-rolls from a NEW seed when Randomize order is clicked', () => {
    const FIRST = 11;
    const SECOND = 7;

    const before = selectStartingOrder(FIRST, INITIAL_IDS);
    const after = selectStartingOrder(SECOND, INITIAL_IDS);
    // The premise, asserted rather than assumed: two seeds can agree on a 4-element
    // permutation, and if these two ever did the test below would pass on a screen that
    // had stopped re-rolling entirely.
    expect(before).not.toEqual(after);

    edge.reset([FIRST, SECOND]);
    mount();

    expect(renderedOrder()).toEqual(positionalNames(INITIAL_IDS, before));

    act(() => {
      buttonNamed('Randomize order')?.click();
    });

    expect(renderedOrder()).toEqual(positionalNames(INITIAL_IDS, after));
  });

  it('does not re-roll when a player is renamed', () => {
    // `selectStartingOrder` pre-sorts the ids, so the outcome depends on the SET of
    // players and the seed rather than on the order they were typed in — which is what
    // makes a re-roll meaningful and a rename not.
    edge.reset([11]);
    mount();

    const before = renderedOrder();
    const slot = before.indexOf('Player 1');
    expect(slot).toBeGreaterThanOrEqual(0);

    const first = nameInputs()[0];
    expect(first).toBeDefined();
    if (first !== undefined) type(first, 'Ada');

    const after = renderedOrder();
    // Same positions, one relabelled. Nothing moved.
    expect(after).toEqual(before.map((label) => (label === 'Player 1' ? 'Ada' : label)));
    expect(after[slot]).toBe('Ada');
  });
});

describe('the player rows', () => {
  it('start as four blank rows rather than four prefilled names', () => {
    mount();

    const inputs = nameInputs();
    expect(inputs).toHaveLength(4);
    for (const input of inputs) {
      expect(input.value).toBe('');
      expect(input.placeholder).toBe('Name');
    }
  });

  it('appends a fifth row labelled Player 5 name', () => {
    mount();

    act(() => {
      buttonNamed('Add a player')?.click();
    });

    expect(nameInputs()).toHaveLength(5);

    const labels = Array.from(host.querySelectorAll('label.visually-hidden')).map(
      (label) => label.textContent,
    );
    expect(labels).toEqual([
      'Player 1 name',
      'Player 2 name',
      'Player 3 name',
      'Player 4 name',
      'Player 5 name',
    ]);
  });

  it('names each Remove button after the row it removes', () => {
    mount();

    const first = nameInputs()[0];
    expect(first).toBeDefined();
    if (first !== undefined) type(first, 'Ada');

    const names = removeButtons().map((button) => button.textContent?.trim());

    // The typed name where there is one, the positional fallback where there is not —
    // never `Remove ` with nothing after it.
    expect(names).toEqual([
      'Remove Ada',
      'Remove Player 2',
      'Remove Player 3',
      'Remove Player 4',
    ]);
  });

  it('drops the row a Remove button names', () => {
    mount();

    const second = nameInputs()[1];
    expect(second).toBeDefined();
    if (second !== undefined) type(second, 'Bo');

    act(() => {
      removeButtons()[1]?.click();
    });

    expect(nameInputs()).toHaveLength(3);
    expect(host.textContent).not.toContain('Remove Bo');
    // The order shrinks with the roster of rows rather than keeping a ghost entry.
    expect(host.querySelectorAll('.player-list__order li')).toHaveLength(3);
  });
});

describe('the Tournament group', () => {
  it('prefills the format label from the loaded regulation', () => {
    mount();

    const input = host.querySelector<HTMLInputElement>('#config-format-label');
    expect(input?.value).toBe('Champions mb');
  });

  it('offers all three depth options, every one of them enabled', () => {
    mount();

    const radios = Array.from(
      host.querySelectorAll<HTMLInputElement>('input[name="tournament-depth"]'),
    );
    expect(radios).toHaveLength(3);
    for (const radio of radios) expect(radio.disabled).toBe(false);

    const labels = Array.from(host.querySelectorAll('label'))
      .map((label) => label.textContent?.trim())
      .filter((text) => text !== undefined);
    expect(labels).toContain('Draft only');
    expect(labels).toContain('Draft and brackets');
    expect(labels).toContain('Draft, brackets and match log');

    // `draftOnly` is the default, and it is checked rather than merely first.
    expect(radios[0]?.checked).toBe(true);
  });

  it('says what recording a depth does and does not do', () => {
    mount();

    expect(host.textContent).toContain(
      'Depth is recorded now. Round robin and brackets arrive with the tournament screens.',
    );
  });
});
