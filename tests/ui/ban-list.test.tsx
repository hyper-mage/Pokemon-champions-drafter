// @vitest-environment happy-dom

/**
 * Banning by name — BAN-01, BAN-02, BAN-08.
 *
 * The typeahead, the chips, and the three places the resulting list has to land: the
 * feasibility gate, the draw's candidate list, and the stored config. Every case runs
 * against the ACTUAL committed roster, because the questions are all about the Pokémon that
 * really exist — `wash` finding `Rotom-Wash` is a claim about a substring matcher over real
 * display names, and the starvation thresholds below are roster-specific figures a fixture
 * could not assert anything about.
 *
 * `Landorus` appears throughout 02-07-PLAN's prose as the worked example. It is not in the
 * committed Champions roster, so the assertions here use `Rotom-Wash` — which is what the
 * plan's own acceptance criteria use.
 *
 * `newSeed` and `newId` are stubbed at the adapter, the seam that exists for exactly this.
 * Nothing in `src/core` is mocked.
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Hoisted so the `vi.mock` factory below can see it — `vi.mock` is lifted above imports. */
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
      return 5000 + seedIndex;
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
import { bannedEntries } from '../../src/core/bans';
import type { RosterEntry, RosterSnapshot } from '../../src/core/roster/types';
import { getDoc, getState } from '../../src/store';
import { announce, LiveRegion } from '../../src/ui/components/LiveRegion';
import { ConfigScreen } from '../../src/ui/screens/ConfigScreen';

// ---------------------------------------------------------------------------
// The real roster
// ---------------------------------------------------------------------------

/** The comparator `app.tsx` sorts with before it hands `entries` to the screen. */
function byDexOrder(a: RosterEntry, b: RosterEntry): number {
  if (a.num !== b.num) return a.num - b.num;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

const SNAPSHOT = committedSnapshot as unknown as RosterSnapshot;
const ENTRIES: readonly RosterEntry[] = [...SNAPSHOT.entries].sort(byDexOrder);

const ROTOM_WASH = 'Rotom-Wash';

/** Mega-capable species, in the order the ban field will be driven through them. */
const MEGA_CAPABLE = ENTRIES.filter((entry) => entry.megaCapable);

/** The ban grid's sprite inventory. Empty resolves every row to the committed placeholder. */
const SPRITE_META: SpriteMeta = {
  nativeWidth: 96,
  nativeHeight: 96,
  byRosterId: {},
};

// ---------------------------------------------------------------------------

let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);

  // `announce` writes a module-level signal that outlives every render.
  announce('');
  edge.reset();
});

afterEach(() => {
  render(null, host);
  host.remove();
});

function mount(onStarted: () => void = () => undefined): void {
  act(() => {
    render(
      <>
        <ConfigScreen
          snapshot={SNAPSHOT}
          entries={ENTRIES}
          spriteMeta={SPRITE_META}
          onStarted={onStarted}
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

function banField(): HTMLInputElement {
  const input = bansGroup().querySelector<HTMLInputElement>('.typeahead__input');
  if (input === null) throw new Error('the ban field is not on the screen');
  return input;
}

function type(input: HTMLInputElement, value: string): void {
  act(() => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function press(key: string): void {
  act(() => {
    banField().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

function options(): HTMLElement[] {
  return [...bansGroup().querySelectorAll<HTMLElement>('[role="option"]')];
}

function optionTexts(): string[] {
  return options().map((option) => option.textContent?.trim() ?? '');
}

function chips(): HTMLButtonElement[] {
  return [...bansGroup().querySelectorAll<HTMLButtonElement>('.ban-chip')];
}

function chipNames(): string[] {
  return chips().map((chip) => chip.getAttribute('aria-label') ?? '');
}

/**
 * The polite region, selected by its live attribute rather than by its role.
 *
 * Three elements on this screen carry a status role — the feasibility reason, the
 * typeahead's no-match line and this one — and only this one is the global region.
 */
function liveRegionText(): string {
  return host.querySelector('[aria-live="polite"]')?.textContent ?? '';
}

/** Ban `name` through the typeahead: type it, then activate its exact option. */
function banByName(name: string): void {
  type(banField(), name);

  const option = options().find((element) => element.textContent?.trim() === name);
  if (option === undefined) throw new Error(`no option for ${name}`);

  act(() => {
    option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  });
}

function nameInputs(): HTMLInputElement[] {
  return [...host.querySelectorAll<HTMLInputElement>('.player-list__name')];
}

function buttonNamed(name: string): HTMLButtonElement | null {
  return (
    [...host.querySelectorAll('button')].find(
      (element) => element.textContent?.trim() === name,
    ) ?? null
  );
}

function removeButtons(): HTMLButtonElement[] {
  return [...host.querySelectorAll('button')].filter((element) =>
    element.textContent?.trim().startsWith('Remove '),
  );
}

/** Fill `count` rows, adding or removing rows to match. */
function nameEveryone(names: readonly string[]): void {
  while (nameInputs().length < names.length) {
    act(() => {
      buttonNamed('Add a player')?.click();
    });
  }
  while (nameInputs().length > names.length) {
    act(() => {
      // Confirmed, because 02-06 put a dialog in front of removing a player.
      removeButtons().at(-1)?.click();
    });
    act(() => {
      confirmingButton()?.click();
    });
  }

  names.forEach((name, index) => {
    const input = nameInputs()[index];
    if (input !== undefined) type(input, name);
  });
}

function confirmingButton(): HTMLButtonElement | null {
  return host.querySelector<HTMLButtonElement>('.confirm-dialog__confirm');
}

function startButton(): HTMLButtonElement | null {
  return host.querySelector<HTMLButtonElement>('.feasibility-bar__start');
}

function reasonText(): string {
  const id = startButton()?.getAttribute('aria-describedby');
  if (id === null || id === undefined) return '';
  return host.querySelector(`[id="${id}"]`)?.textContent ?? '';
}

const EIGHT_NAMES = ['Ada', 'Bo', 'Cy', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal'];

// ---------------------------------------------------------------------------
// The typeahead
// ---------------------------------------------------------------------------

describe('the ban typeahead', () => {
  it('finds a species by a substring of its name, not by a prefix', () => {
    mount();

    type(banField(), 'wash');
    expect(optionTexts()).toEqual([ROTOM_WASH]);

    type(banField(), 'aqua');
    expect(optionTexts()).toContain('Tauros-Paldea-Aqua');

    type(banField(), 'mr rime');
    expect(optionTexts()).toEqual(['Mr. Rime']);
  });

  it('renders nothing until the host types', () => {
    mount();

    expect(options()).toHaveLength(0);
    expect(banField().getAttribute('aria-expanded')).toBe('false');
  });

  it('caps the visible results at eight', () => {
    mount();

    // `a` matches most of the roster; the cap is what makes the list operable.
    type(banField(), 'a');
    expect(options().length).toBe(8);
  });

  it('says so when nothing matches, without a listbox', () => {
    mount();

    type(banField(), 'zzz');

    expect(options()).toHaveLength(0);
    expect(banField().getAttribute('aria-expanded')).toBe('false');

    const empty = host.querySelector('.typeahead__empty');
    expect(empty?.getAttribute('role')).toBe('status');
    expect(empty?.textContent).toBe('No Pokémon matches "zzz".');
  });

  it('walks the options with the arrow keys, wrapping at both ends', () => {
    mount();

    type(banField(), 'a');
    expect(banField().getAttribute('aria-activedescendant')).toBe(null);

    press('ArrowDown');
    expect(banField().getAttribute('aria-activedescendant')).toBe(options()[0]?.id);

    press('ArrowDown');
    expect(banField().getAttribute('aria-activedescendant')).toBe(options()[1]?.id);

    press('ArrowUp');
    press('ArrowUp');
    expect(banField().getAttribute('aria-activedescendant')).toBe(options().at(-1)?.id);
  });

  it('closes on Escape and keeps what the host typed', () => {
    mount();

    type(banField(), 'wash');
    expect(options()).toHaveLength(1);

    press('Escape');

    expect(options()).toHaveLength(0);
    expect(banField().getAttribute('aria-expanded')).toBe('false');
    expect(banField().value).toBe('wash');
  });

  it('does nothing on Enter when no option is active', () => {
    mount();

    type(banField(), 'wash');
    press('Enter');

    expect(chips()).toHaveLength(0);
    expect(banField().value).toBe('wash');
  });

  it('bans the active option on Enter, then clears and closes', () => {
    mount();

    type(banField(), 'wash');
    press('ArrowDown');
    press('Enter');

    expect(chipNames()).toEqual([`Remove ${ROTOM_WASH} from the banlist`]);
    expect(banField().value).toBe('');
    expect(options()).toHaveLength(0);
    expect(liveRegionText()).toBe(`${ROTOM_WASH} banned. 1 ban.`);
  });

  it('addresses every option by an id derived from the species, never from a position', () => {
    mount();

    type(banField(), 'wash');
    const [option] = options();

    expect(option?.id).toContain('rotomwash');
  });
});

// ---------------------------------------------------------------------------
// The chips, and the one write path behind them
// ---------------------------------------------------------------------------

describe('the ban chips', () => {
  it('renders nothing at all while the banlist is empty', () => {
    mount();

    expect(host.querySelector('.ban-chip-list')).toBeNull();
    expect(buttonNamed('Clear the banlist')).toBeNull();
  });

  it('says how many bans there are, singular at one and plural at two', () => {
    mount();

    banByName(ROTOM_WASH);
    expect(liveRegionText()).toBe(`${ROTOM_WASH} banned. 1 ban.`);

    banByName('Mr. Rime');
    expect(liveRegionText()).toBe('Mr. Rime banned. 2 bans.');
  });

  it('adds one chip for a species selected twice, not two', () => {
    mount();

    banByName(ROTOM_WASH);
    banByName(ROTOM_WASH);

    expect(chips()).toHaveLength(1);
  });

  it('removes a ban when its chip is clicked, and says so', () => {
    mount();

    banByName(ROTOM_WASH);
    act(() => {
      chips()[0]?.click();
    });

    expect(chips()).toHaveLength(0);
    expect(buttonNamed('Clear the banlist')).toBeNull();
    expect(liveRegionText()).toBe(`${ROTOM_WASH} unbanned. 0 bans.`);
  });

  it('orders the chips by name however the bans were entered', () => {
    mount();

    banByName(ROTOM_WASH);
    banByName('Mr. Rime');
    banByName('Pikachu');

    expect(chipNames()).toEqual([
      'Remove Mr. Rime from the banlist',
      'Remove Pikachu from the banlist',
      'Remove Rotom-Wash from the banlist',
    ]);
  });
});

// ---------------------------------------------------------------------------
// The gate — the two independent starvation modes
// ---------------------------------------------------------------------------

describe('bans reaching the feasibility gate', () => {
  /**
   * The roster-size mode. 02-RESEARCH §Worst-case ban starvation: at eight players on the
   * Exact preset the pool is 48, so the configuration survives 187 bans and dies at 188.
   *
   * The reason at 188 is `Too many players for the roster.`, not `Pool is too large.` — at
   * the Exact preset the requested size IS players × rounds, so the two blockers reach their
   * threshold on the same ban and `feasibility.ts` deliberately suppresses the second. Its
   * doc block states why: telling a host the pool is too large when the fix is fewer players
   * or fewer bans sends them to the wrong field.
   */
  it('survives 187 bans at eight players and Exact, and dies on the 188th', () => {
    mount();
    nameEveryone(EIGHT_NAMES);

    const victims = ENTRIES.slice(0, 188);
    for (const entry of victims.slice(0, 187)) banByName(entry.name);

    expect(reasonText()).not.toContain('Too many players for the roster.');
    expect(startButton()?.getAttribute('aria-disabled')).toBe(null);

    const last = victims[187];
    if (last !== undefined) banByName(last.name);

    expect(reasonText()).toContain('Too many players for the roster.');
    expect(startButton()?.getAttribute('aria-disabled')).toBe('true');
  });

  /**
   * The Mega mode, and it is independent of the one above. 74 Mega-capable species and a
   * requirement of 6 at eight players needs 48 of them, so 26 Mega bans are survivable and
   * the 27th is not — while the legal count is still 208, nowhere near the 48-card pool.
   */
  it('survives 26 Mega-capable bans at a requirement of six, and dies on the 27th', () => {
    mount();
    nameEveryone(EIGHT_NAMES);
    type(megasField(), '6');

    const victims = MEGA_CAPABLE.slice(0, 27);
    for (const entry of victims.slice(0, 26)) banByName(entry.name);

    expect(reasonText()).not.toContain('Not enough Mega-capable Pokémon.');

    const last = victims[26];
    if (last !== undefined) banByName(last.name);

    expect(reasonText()).toContain('Not enough Mega-capable Pokémon.');
    expect(startButton()?.getAttribute('aria-disabled')).toBe('true');
  });
});

function megasField(): HTMLInputElement {
  const label = [...host.querySelectorAll('label')].find(
    (candidate) => candidate.textContent?.trim() === 'Megas required per team',
  );
  const id = label?.getAttribute('for');
  const input = id === null || id === undefined ? null : host.querySelector<HTMLInputElement>(`input[id="${id}"]`);
  if (input === null) throw new Error('Megas required per team is not on the screen');
  return input;
}

// ---------------------------------------------------------------------------
// The draw — BAN-08, and the only place it is enforced
// ---------------------------------------------------------------------------

describe('starting a draft with bans', () => {
  it('records the banlist and draws a pool the banned species is not in', () => {
    let started = false;
    mount(() => {
      started = true;
    });
    nameEveryone(['Ada', 'Bo']);

    banByName(ROTOM_WASH);

    const bannedId = bannedEntries(ENTRIES, ['rotomwash'])[0]?.id;
    expect(bannedId).toBe('rotomwash');

    act(() => {
      startButton()?.click();
    });

    expect(started).toBe(true);
    expect(getDoc()?.config.bans).toContain('rotomwash');
    expect(getState()?.poolIds.filter((id) => id === 'rotomwash')).toHaveLength(0);
  });
});
