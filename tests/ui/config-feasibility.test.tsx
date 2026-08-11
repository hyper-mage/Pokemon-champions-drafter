// @vitest-environment happy-dom

/**
 * The Pool group and the gate it feeds — DRFT-02, DRFT-03, RULE-07.
 *
 * Every case here runs against the ACTUAL committed roster rather than a fixture, because
 * the questions are all "can this configuration be satisfied by the Pokémon that actually
 * exist". A stub roster would let the arithmetic be right about a roster nobody drafts
 * from, and the ceiling figures (235 draftable, 74 Mega-capable) are the whole point of
 * three of these assertions.
 *
 * The test that matters most is `an emptied pool size field blocks the start` further
 * down. It is the F-08 case: an empty numeric input read arithmetically is `NaN`, and
 * `NaN > 235` and `NaN < 48` are BOTH false — so a gate written the obvious way reports
 * all-clear and lets a host start a draft with no pool at all. Nothing about the screen
 * looks wrong when that regression lands.
 *
 * `newSeed` and `newId` are stubbed at the adapter, which is the seam that exists for
 * exactly this. Nothing in `src/core` is mocked.
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Hoisted so the `vi.mock` factory below can see it — `vi.mock` is lifted above imports. */
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

import committedSnapshot from '../../public/data/roster.mb.json';
import { drawPool } from '../../src/core/draw';
import type { RosterEntry, RosterSnapshot } from '../../src/core/roster/types';
import { getState } from '../../src/store';
import { announce } from '../../src/ui/components/LiveRegion';
import { ConfigScreen } from '../../src/ui/screens/ConfigScreen';

// ---------------------------------------------------------------------------
// The real roster
// ---------------------------------------------------------------------------

/**
 * Pokedex order, and deterministic — the comparator `app.tsx` sorts with before it hands
 * `entries` to the screen. The committed snapshot is stored alphabetically by id, so a
 * test that skipped this would assert against an order the app never renders.
 */
function byDexOrder(a: RosterEntry, b: RosterEntry): number {
  if (a.num !== b.num) return a.num - b.num;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

const SNAPSHOT = committedSnapshot as unknown as RosterSnapshot;
const ENTRIES: readonly RosterEntry[] = [...SNAPSHOT.entries].sort(byDexOrder);
const MEGA_CAPABLE_IDS = new Set(
  ENTRIES.filter((entry) => entry.megaCapable).map((entry) => entry.id),
);

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

function mount(onStarted: () => void = () => undefined): void {
  act(() => {
    render(
      <ConfigScreen snapshot={SNAPSHOT} entries={ENTRIES} onStarted={onStarted} />,
      host,
    );
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

function nameInputs(): HTMLInputElement[] {
  return Array.from(host.querySelectorAll<HTMLInputElement>('.player-list__name'));
}

function type(input: HTMLInputElement, value: string): void {
  act(() => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** The input a visible `<label>` is bound to, resolved through `for`/`id`. */
function fieldLabelled(label: string): HTMLInputElement | null {
  const element = Array.from(host.querySelectorAll('label')).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  const id = element?.getAttribute('for');
  if (id === null || id === undefined) return null;
  return host.querySelector<HTMLInputElement>(`input[id="${id}"]`);
}

function overrideField(): HTMLInputElement {
  const input = fieldLabelled('Pool size override');
  if (input === null) throw new Error('Pool size override is not on the screen');
  return input;
}

function choosePreset(value: string): void {
  const radio = host.querySelector<HTMLInputElement>(
    `input[name="pool-size-preset"][value="${value}"]`,
  );
  act(() => {
    if (radio !== null) {
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
}

function startButton(): HTMLButtonElement | null {
  return host.querySelector<HTMLButtonElement>('.feasibility-bar__start');
}

/** The element `aria-describedby` on Start actually resolves to. */
function reasonElement(): Element | null {
  const id = startButton()?.getAttribute('aria-describedby');
  if (id === null || id === undefined) return null;
  return host.querySelector(`[id="${id}"]`);
}

function reasonText(): string {
  return reasonElement()?.textContent ?? '';
}

function readout(): string | null {
  return host.querySelector('.config-screen__readout')?.textContent ?? null;
}

function renderedOrder(): string[] {
  return Array.from(host.querySelectorAll('.player-list__order li')).map(
    (item) => item.textContent ?? '',
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
      removeButtons().at(-1)?.click();
    });
  }

  names.forEach((name, index) => {
    const input = nameInputs()[index];
    if (input !== undefined) type(input, name);
  });
}

const EIGHT_NAMES = ['Ada', 'Bo', 'Cy', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal'];

function fortyNames(): string[] {
  return Array.from({ length: 40 }, (_, index) => `Player-${index + 1}`);
}

// ---------------------------------------------------------------------------
// Group 5 — the three presets
// ---------------------------------------------------------------------------

describe('the Pool size preset', () => {
  it('offers Exact, 1.5× and 2×, with Exact selected', () => {
    mount();

    const radios = Array.from(
      host.querySelectorAll<HTMLInputElement>('input[name="pool-size-preset"]'),
    );
    expect(radios).toHaveLength(3);
    expect(radios.map((radio) => radio.value)).toEqual(['exact', 'x1_5', 'x2']);
    expect(radios[0]?.checked).toBe(true);

    const labels = Array.from(host.querySelectorAll('label')).map((label) =>
      label.textContent?.trim(),
    );
    expect(labels).toContain('Exact');
    expect(labels).toContain('1.5×');
    expect(labels).toContain('2×');
  });

  it('states what Exact means in the numbers on screen', () => {
    mount();
    nameEveryone(EIGHT_NAMES);

    expect(host.textContent).toContain(
      'Exact is 8 players × 6 rounds = 48 Pokémon, with nothing left over.',
    );
  });

  it('auto-sizes the pool from the player count at each preset', () => {
    mount();
    nameEveryone(EIGHT_NAMES);

    expect(readout()).toMatch(/^Pool: 48 Pokémon — \d+ Mega-capable$/);
    expect(overrideField().value).toBe('48');

    choosePreset('x1_5');
    expect(readout()).toMatch(/^Pool: 72 Pokémon — \d+ Mega-capable$/);
    expect(overrideField().value).toBe('72');

    choosePreset('x2');
    expect(readout()).toMatch(/^Pool: 96 Pokémon — \d+ Mega-capable$/);
    expect(overrideField().value).toBe('96');
  });

  it('warns without blocking at exactly players × rounds', () => {
    mount();
    nameEveryone(EIGHT_NAMES);

    expect(reasonText()).toBe(
      'Warning — the pool is exactly 48. The last player to pick in Round 6 will have one Pokémon to choose from.',
    );
    expect(startButton()?.hasAttribute('aria-disabled')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Group 5 — the free override, and the hole it closes
// ---------------------------------------------------------------------------

describe('the Pool size override', () => {
  it('takes any size the host types over the preset', () => {
    mount();
    nameEveryone(EIGHT_NAMES);

    type(overrideField(), '72');

    expect(readout()).toMatch(/^Pool: 72 Pokémon — \d+ Mega-capable$/);
    // The exactly-minimum warning is gone, and the all-clear restates the configuration.
    expect(reasonText()).toBe('8 players, 6 rounds, 72 Pokémon in the pool.');
    expect(startButton()?.hasAttribute('aria-disabled')).toBe(false);
  });

  it('an emptied pool size field blocks the start, rather than starting a draft with no pool', () => {
    mount();
    nameEveryone(EIGHT_NAMES);

    type(overrideField(), '');

    // The F-08 case. Read arithmetically this field is `NaN`, and `NaN > 235` and
    // `NaN < 48` are both false — so an unguarded gate would report all-clear here.
    expect(reasonText()).toBe(
      'Pool size needs a whole number. Enter how many Pokémon the pool should hold.',
    );
    expect(startButton()?.getAttribute('aria-disabled')).toBe('true');
    // And nothing is drawn from a size the gate refused.
    expect(readout()).toBeNull();
  });

  it('says the same thing about a fraction and about a malformed number', () => {
    mount();
    nameEveryone(EIGHT_NAMES);

    type(overrideField(), '48.5');
    expect(reasonText()).toBe(
      'Pool size needs a whole number. Enter how many Pokémon the pool should hold.',
    );

    type(overrideField(), '4e');
    expect(reasonText()).toBe(
      'Pool size needs a whole number. Enter how many Pokémon the pool should hold.',
    );
  });

  it('reports a pool larger than the roster against the roster, not against the preset', () => {
    mount();
    nameEveryone(EIGHT_NAMES);

    type(overrideField(), '9999');

    expect(reasonText()).toBe(
      'Pool is too large. Only 235 Pokémon are draftable after 0 bans; the pool is set to 9999.',
    );
  });

  it('reports a pool that cannot fill every team', () => {
    mount();
    nameEveryone(EIGHT_NAMES);

    type(overrideField(), '10');

    expect(reasonText()).toBe(
      'Pool is too small. 8 players × 6 rounds needs 48 Pokémon; the pool is 10 after 0 bans.',
    );
  });

  it('blames the party rather than the pool when the roster runs out', () => {
    mount();
    nameEveryone(fortyNames());

    // At Exact the pool is identically `players × rounds`, so `poolTooSmall` can never
    // fire — and a 40-player host told to shrink a pool the tool computed would be
    // reading a reason they cannot act on.
    expect(reasonText().startsWith('Too many players for the roster.')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The draw readout and the re-roll
// ---------------------------------------------------------------------------

describe('the draw readout', () => {
  it('reports the drawn set rather than the requested size', () => {
    const POOL_SEED = 4242;
    edge.reset([11, POOL_SEED]);

    mount();
    nameEveryone(EIGHT_NAMES);

    const expected = drawPool({
      candidates: ENTRIES,
      size: 48,
      megasRequired: 0,
      seed: POOL_SEED,
    });

    expect(readout()).toBe(`Pool: 48 Pokémon — ${expected.megaCapableCount} Mega-capable`);
    // Counted from the chosen set, not echoed from a request and not a recount of the
    // roster: those two agree here only because the draw is what produced both.
    expect(expected.ids.filter((id) => MEGA_CAPABLE_IDS.has(id))).toHaveLength(
      expected.megaCapableCount,
    );
  });

  it('is absent while the configuration is blocked', () => {
    mount();

    // Four blank rows: blocked before anything is drawable.
    expect(readout()).toBeNull();
  });
});

describe('Re-roll pool', () => {
  it('changes the pool and leaves the starting order alone', () => {
    const ORDER_SEED = 11;
    const POOL_SEED = 4242;
    const REROLL_SEED = 8675;

    const before = drawPool({
      candidates: ENTRIES,
      size: 48,
      megasRequired: 0,
      seed: POOL_SEED,
    });
    const after = drawPool({
      candidates: ENTRIES,
      size: 48,
      megasRequired: 0,
      seed: REROLL_SEED,
    });
    // The premise, asserted rather than assumed.
    expect(before.ids).not.toEqual(after.ids);

    edge.reset([ORDER_SEED, POOL_SEED, REROLL_SEED, 5150]);
    mount();
    nameEveryone(EIGHT_NAMES);

    const orderBefore = renderedOrder();
    expect(readout()).toBe(`Pool: 48 Pokémon — ${before.megaCapableCount} Mega-capable`);

    act(() => {
      buttonNamed('Re-roll pool')?.click();
    });

    // Two seeds, each consumed from cursor 0, each re-DRAWN rather than advanced — so
    // re-rolling the pool provably cannot disturb the order.
    expect(renderedOrder()).toEqual(orderBefore);

    act(() => {
      startButton()?.click();
    });

    expect(getState()?.poolIds).toEqual(after.ids);
  });
});

