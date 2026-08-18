// @vitest-environment happy-dom

/**
 * The Mega-forme banlist — RULE-04, D-09, D-10, D-12.
 *
 * The assertion that carries the requirement is `bans one forme and leaves its sibling
 * legal`: a species-level implementation of this feature passes almost everything else in
 * this file and fails exactly that one. Charizard-Mega-X banned with Charizard-Mega-Y still
 * unpressed IS the feature.
 *
 * Everything runs against the ACTUAL committed roster, because the questions are all about
 * the formes that really exist: there are 76 of them, two species contribute two each, and
 * `Charizard-Mega-X` is Fire/Dragon where its base species is Fire/Flying. A fixture could
 * assert none of that.
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
import { megaFormeRows } from '../../src/core/mega';
import type { RosterEntry, RosterSnapshot } from '../../src/core/roster/types';
import { getDoc } from '../../src/store';
import { announce, LiveRegion } from '../../src/ui/components/LiveRegion';
import { ConfigScreen } from '../../src/ui/screens/ConfigScreen';

/** The comparator `app.tsx` sorts with before it hands `entries` to the screen. */
function byDexOrder(a: RosterEntry, b: RosterEntry): number {
  if (a.num !== b.num) return a.num - b.num;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

const SNAPSHOT = committedSnapshot as unknown as RosterSnapshot;
const ENTRIES: readonly RosterEntry[] = [...SNAPSHOT.entries].sort(byDexOrder);

/** Derived, never typed: the grid's total is this and so is the count line's. */
const FORMES = megaFormeRows(ENTRIES);
const TOTAL_FORMES = FORMES.length;

const MEGA_X = 'Charizard-Mega-X';
const MEGA_Y = 'Charizard-Mega-Y';

const SPRITE_META: SpriteMeta = { nativeWidth: 96, nativeHeight: 96, byRosterId: {} };

let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);

  // `announce` writes a module-level signal that outlives every render.
  announce('');
  edge.reset();
  localStorage.clear();
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

// ---------------------------------------------------------------------------
// Everything below is scoped to the sub-section, because the species ban grid
// renders the same classes further down the same screen.
// ---------------------------------------------------------------------------

function section(): HTMLElement {
  const heading = [...host.querySelectorAll('h2')].find(
    (element) => element.textContent?.trim() === 'Mega-forme bans',
  );
  const container = heading?.closest<HTMLElement>('.config-screen__section');
  if (container === undefined || container === null) {
    throw new Error('the Mega-forme bans sub-section is not on the screen');
  }
  return container;
}

function cards(): HTMLButtonElement[] {
  return [...section().querySelectorAll<HTMLButtonElement>('.mon-card')];
}

function cardFor(name: string): HTMLButtonElement {
  const card = cards().find(
    (element) => element.querySelector('.mon-card__name')?.textContent === name,
  );
  if (card === undefined) throw new Error(`no cell for ${name}`);
  return card;
}

function countLine(): string {
  return section().querySelector('.pool__count')?.textContent ?? '';
}

function chips(): HTMLButtonElement[] {
  return [...section().querySelectorAll<HTMLButtonElement>('.ban-chip')];
}

function chipNames(): string[] {
  return chips().map((chip) => chip.getAttribute('aria-label') ?? '');
}

function field(): HTMLInputElement {
  const input = section().querySelector<HTMLInputElement>('.typeahead__input');
  if (input === null) throw new Error('the Mega-forme ban field is not on the screen');
  return input;
}

function type(value: string): void {
  act(() => {
    const input = field();
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function options(): HTMLElement[] {
  return [...section().querySelectorAll<HTMLElement>('[role="option"]')];
}

/** Ban a forme through the TYPEAHEAD, so the grid's own state is never touched. */
function banByName(name: string): void {
  type(name);

  const option = options().find((element) => element.textContent?.trim() === name);
  if (option === undefined) throw new Error(`no option for ${name}`);

  act(() => {
    option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  });
}

function clickCell(name: string): void {
  act(() => {
    cardFor(name).click();
  });
}

/**
 * The polite region, selected by its live attribute rather than by its role.
 *
 * Several elements on this screen carry a status role — the feasibility reason and each
 * typeahead's no-match line among them — and only this one is the global region.
 */
function liveRegionText(): string {
  return host.querySelector('[aria-live="polite"]')?.textContent ?? '';
}

function buttonNamed(name: string): HTMLButtonElement | null {
  return (
    [...host.querySelectorAll('button')].find(
      (element) => element.textContent?.trim() === name,
    ) ?? null
  );
}

function nameInputs(): HTMLInputElement[] {
  return [...host.querySelectorAll<HTMLInputElement>('.player-list__name')];
}

function nameEveryone(names: readonly string[]): void {
  names.forEach((name, index) => {
    const input = nameInputs()[index];
    if (input === undefined) return;
    act(() => {
      input.value = name;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });
}

// ---------------------------------------------------------------------------

describe('the Mega-forme ban grid', () => {
  it('renders one cell per Mega forme, inside the Mega rules group', () => {
    mount();

    expect(cards()).toHaveLength(TOTAL_FORMES);

    const group = section().closest('fieldset');
    expect(group?.querySelector('legend')?.textContent?.trim()).toBe('Mega rules');
  });

  it('states the helper that keeps a missing species from reading as a bug', () => {
    mount();

    // D-10's second sentence, verbatim. Without it a host whose pinned species left the
    // Mega rounds goes looking for the setting that broke it.
    expect(section().textContent).toContain(
      'A banned forme cannot be used this tournament. A species with no forme left simply stays out of the Mega rounds — it is still draftable in an open round.',
    );
  });

  it('renders every forme with its own name, types and stats', () => {
    mount();

    const megaX = cardFor(MEGA_X);
    const megaY = cardFor(MEGA_Y);

    // Two cells, not one merged cell with two toggles: a merged one would have to hide one
    // of these type rows, which is exactly what the host is deciding on.
    expect(megaX.getAttribute('aria-label')).toBe(`${MEGA_X}, Fire Dragon`);
    expect(megaY.getAttribute('aria-label')).toBe(`${MEGA_Y}, Fire Flying`);
    expect(megaX.querySelector('.stat-block')).not.toBeNull();
  });

  it('caps the grid in a scroll region rather than letting 76 cells run the page', () => {
    mount();

    expect(section().querySelector('.pool--ban')).not.toBeNull();
  });

  it('counts from what is rendered, with the count line naming the formes', () => {
    mount();

    expect(countLine()).toBe(`0 of ${TOTAL_FORMES} Mega formes banned`);
  });
});

describe('banning a forme', () => {
  it('bans one forme and leaves its sibling legal', () => {
    mount();

    clickCell(MEGA_X);

    // THE requirement. A species-level ban marks both, and only this assertion catches it.
    expect(cardFor(MEGA_X).getAttribute('aria-pressed')).toBe('true');
    expect(cardFor(MEGA_Y).getAttribute('aria-pressed')).toBe('false');
    expect(countLine()).toBe(`1 of ${TOTAL_FORMES} Mega formes banned`);
  });

  it('strikes the banned name through and adds a chip', () => {
    mount();

    clickCell(MEGA_X);

    expect(cardFor(MEGA_X).classList.contains('mon-card--banned')).toBe(true);
    expect(
      cardFor(MEGA_X).querySelector('.mon-card__name')?.classList.contains(
        'mon-card__name--banned',
      ),
    ).toBe(true);
    expect(chipNames()).toEqual([`Remove ${MEGA_X} from the Mega-forme banlist`]);
  });

  it('unbans on a second click, and the chip goes with it', () => {
    mount();

    clickCell(MEGA_X);
    clickCell(MEGA_X);

    expect(cardFor(MEGA_X).getAttribute('aria-pressed')).toBe('false');
    expect(chips()).toEqual([]);
    expect(countLine()).toBe(`0 of ${TOTAL_FORMES} Mega formes banned`);
  });

  it('announces the ban and the running total, and mirrors it on the unban', () => {
    mount();

    clickCell(MEGA_X);
    expect(liveRegionText()).toBe(`${MEGA_X} banned. 1 Mega-forme ban.`);

    clickCell(MEGA_Y);
    expect(liveRegionText()).toBe(`${MEGA_Y} banned. 2 Mega-forme bans.`);

    clickCell(MEGA_Y);
    expect(liveRegionText()).toBe(`${MEGA_Y} unbanned. 1 Mega-forme ban.`);
  });
});

describe('the two surfaces write one list', () => {
  it('bans the same forme from the typeahead as from the grid', () => {
    mount();

    banByName(MEGA_X);

    expect(cardFor(MEGA_X).getAttribute('aria-pressed')).toBe('true');
    expect(cardFor(MEGA_Y).getAttribute('aria-pressed')).toBe('false');
    expect(chipNames()).toEqual([`Remove ${MEGA_X} from the Mega-forme banlist`]);
    expect(countLine()).toBe(`1 of ${TOTAL_FORMES} Mega formes banned`);
  });

  it('adds one chip for a forme selected twice, not two', () => {
    mount();

    // The grid toggles and the typeahead adds, so this is the sequence that would write a
    // duplicate id without the idempotent write path — and every length-based count would
    // then read one too many.
    clickCell(MEGA_X);
    banByName(MEGA_X);

    expect(chips()).toHaveLength(1);
    expect(countLine()).toBe(`1 of ${TOTAL_FORMES} Mega formes banned`);
  });

  it('says so when nothing matches, in the formes own words', () => {
    mount();

    type('zzz');

    expect(section().querySelector('.typeahead__empty')?.textContent).toBe(
      'No Mega forme matches "zzz".',
    );
  });

  it('removes a ban when its chip is clicked', () => {
    mount();

    clickCell(MEGA_X);
    act(() => {
      chips()[0]?.click();
    });

    expect(chips()).toEqual([]);
    expect(cardFor(MEGA_X).getAttribute('aria-pressed')).toBe('false');
    expect(liveRegionText()).toBe(`${MEGA_X} unbanned. 0 Mega-forme bans.`);
  });
});

describe('the Mega capability filter over this grid', () => {
  it('is inert with a reason, while search and the type filters stay live', () => {
    mount();

    const wrapper = section().querySelector('.filter-bar__mega');
    expect(wrapper?.getAttribute('aria-disabled')).toBe('true');
    expect(section().querySelector('.filter-bar__mega-reason')?.textContent).toBe(
      '— This list is Mega formes only',
    );

    const search = section().querySelector<HTMLInputElement>('#mega-forme-ban-search');
    expect(search).not.toBeNull();

    act(() => {
      if (search === null) return;
      search.value = 'mega x';
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // Two formes carry `Mega-X`: Charizard's and Raichu's.
    expect(cards()).toHaveLength(2);
  });

  it('keeps its own control ids, so the species grid below it is untouched', () => {
    mount();

    // Two grids on one screen. Shared ids would break `<label for>` and shared radio-group
    // names would merge the two controls into one.
    expect(host.querySelectorAll('#mega-forme-ban-search')).toHaveLength(1);
    expect(host.querySelectorAll('#pool-search')).toHaveLength(1);
    expect(host.querySelectorAll('#mega-forme-ban-mega-filter-all')).toHaveLength(1);
    expect(host.querySelectorAll('#pool-mega-filter-all')).toHaveLength(1);
  });
});

describe('Clear the Mega-forme banlist', () => {
  it('is not rendered while nothing is banned', () => {
    mount();

    expect(buttonNamed('Clear the Mega-forme banlist')).toBeNull();
  });

  it('confirms in numbers, and empties the list when confirmed', () => {
    mount();

    clickCell(MEGA_X);
    clickCell(MEGA_Y);

    act(() => {
      buttonNamed('Clear the Mega-forme banlist')?.click();
    });

    const dialog = host.querySelector('[role="alertdialog"]');
    expect(dialog?.textContent).toContain(
      'This clears all 2 Mega-forme bans at once. Every banned forme becomes legal again.',
    );

    act(() => {
      host.querySelector<HTMLButtonElement>('.confirm-dialog__confirm')?.click();
    });

    expect(chips()).toEqual([]);
    expect(countLine()).toBe(`0 of ${TOTAL_FORMES} Mega formes banned`);
    expect(buttonNamed('Clear the Mega-forme banlist')).toBeNull();
  });

  it('keeps the bans when the safe option is taken', () => {
    mount();

    clickCell(MEGA_X);

    act(() => {
      buttonNamed('Clear the Mega-forme banlist')?.click();
    });
    act(() => {
      host.querySelector<HTMLButtonElement>('.confirm-dialog__safe')?.click();
    });

    expect(chips()).toHaveLength(1);
  });
});

describe('starting a draft with Mega-forme bans', () => {
  it('records the list on the created document', () => {
    mount();
    nameEveryone(['Ana', 'Bo', 'Cy', 'Di']);

    clickCell(MEGA_X);

    act(() => {
      host.querySelector<HTMLButtonElement>('.feasibility-bar__start')?.click();
    });

    const doc = getDoc();
    expect(doc).not.toBeNull();

    const banned = doc?.config.megaFormeBans ?? [];
    // The forme id, read from the roster rather than constructed from the display name.
    const expected = FORMES.find((forme) => forme.name === MEGA_X)?.id;
    expect(expected).toBeDefined();
    expect(banned).toEqual([expected]);
  });

  it('hands the document a copy, not this screens array', () => {
    mount();
    nameEveryone(['Ana', 'Bo', 'Cy', 'Di']);

    clickCell(MEGA_X);

    act(() => {
      host.querySelector<HTMLButtonElement>('.feasibility-bar__start')?.click();
    });

    const first = getDoc()?.config.megaFormeBans;
    expect(first).toHaveLength(1);

    // Banning again after Start must not reach into the document the fold is reading.
    clickCell(MEGA_Y);
    expect(getDoc()?.config.megaFormeBans).toHaveLength(1);
  });
});
