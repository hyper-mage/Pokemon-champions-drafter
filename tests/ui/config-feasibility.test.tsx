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
import type { SpriteMeta } from '../../src/adapters/roster-source';
import { cardsPlayed, isPoolBuiltAction, orderResolved, pickMade } from '../../src/core/actions';
import { resolvePickOrder } from '../../src/core/cards';
import { drawPool } from '../../src/core/draw';
import type { RosterEntry, RosterSnapshot } from '../../src/core/roster/types';
import {
  selectAvailablePool,
  selectCardPlayOrder,
  selectCardsPlayedThisRound,
  selectCurrentRound,
  selectCurrentTurn,
  selectHand,
  selectPhase,
} from '../../src/core/selectors';
import { dispatch, getDoc, getState } from '../../src/store';
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

/**
 * What the screen hands `drawPool` as `megaEligibleIds` while nothing is banned.
 *
 * Read off the formes rather than off the flag, because that is the question the screen
 * asks — and with no forme bans and no X/Y pin the two answers coincide, which is why the
 * expected draws below are unchanged from before 03-05.
 */
const MEGA_ELIGIBLE_IDS: readonly string[] = ENTRIES.filter(
  (entry) => entry.megaFormes.length > 0,
).map((entry) => entry.id);

/**
 * The ban grid needs a sprite inventory — 02-07 added it to the screen's props.
 *
 * Left empty on purpose: an id absent from the map resolves to the committed placeholder,
 * so no assertion in this file depends on a file on disk.
 */
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
  edge.reset([]);
});

afterEach(() => {
  render(null, host);
  host.remove();
});

function mount(onStarted: () => void = () => undefined): void {
  act(() => {
    render(
      <ConfigScreen
        snapshot={SNAPSHOT}
        entries={ENTRIES}
        spriteMeta={SPRITE_META}
        onStarted={onStarted}
      />,
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

/** Twelve players, which is where three forme bans are enough to break the arithmetic. */
const TWELVE_NAMES = [...EIGHT_NAMES, 'Ida', 'Jo', 'Kit', 'Lou'];

/**
 * Three species carrying exactly ONE Mega forme, and that one forme each.
 *
 * One forme apiece is what makes the arithmetic legible: each ban removes exactly one
 * species from the eligible count, so the sentence the host reads quotes three bans and a
 * count three lower. Charizard and Raichu would need two bans apiece (D-09), which is the
 * same test with a worse trail. Every id and name is READ from the roster.
 */
const SINGLE_FORME_VICTIMS = ENTRIES.filter((entry) => entry.megaFormes.length === 1).slice(0, 3);

/** The `Mega-forme bans` sub-section — the species ban grid renders the same classes. */
function megaFormeSection(): HTMLElement {
  const heading = [...host.querySelectorAll('h2')].find(
    (element) => element.textContent?.trim() === 'Mega-forme bans',
  );
  const container = heading?.closest<HTMLElement>('.config-screen__section');
  if (container === null || container === undefined) {
    throw new Error('the Mega-forme bans sub-section is not on the screen');
  }
  return container;
}

function banForme(name: string): void {
  const card = [...megaFormeSection().querySelectorAll<HTMLButtonElement>('.mon-card')].find(
    (element) => element.querySelector('.mon-card__name')?.textContent === name,
  );
  if (card === undefined) throw new Error(`no Mega-forme cell for ${name}`);
  act(() => {
    card.click();
  });
}

function megasField(): HTMLInputElement {
  const input = fieldLabelled('Megas required per team');
  if (input === null) throw new Error('Megas required per team is not on the screen');
  return input;
}

function swapBudgetField(): HTMLInputElement {
  const input = fieldLabelled('Swap budget per player');
  if (input === null) throw new Error('Swap budget per player is not on the screen');
  return input;
}

function swapRoundsField(): HTMLInputElement {
  const input = fieldLabelled('Swap rounds after the draft');
  if (input === null) throw new Error('Swap rounds after the draft is not on the screen');
  return input;
}

function fortyNames(): string[] {
  return Array.from({ length: 40 }, (_, index) => `Player-${index + 1}`);
}

/** `part` appears inside `whole` in order — a forward two-cursor walk, never a set test. */
function isSubsequence(whole: readonly string[], part: readonly string[]): boolean {
  let cursor = 0;
  for (const id of whole) {
    if (cursor < part.length && part[cursor] === id) cursor += 1;
  }
  return cursor === part.length;
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

  /**
   * The preset stops driving the field the moment the host types, and used to stay on
   * screen looking operable for the rest of the session: still rendered, still accepting
   * clicks, still moving its own `:checked` state, and changing nothing at all.
   *
   * A click on it is an unambiguous statement about the pool size, so it takes the answer
   * back. Asserted through the number, the readout AND the gate, because a preset that
   * moved only its own radio is exactly what this is about.
   */
  it('takes the pool size back from a typed override when a preset is clicked', () => {
    mount();
    nameEveryone(EIGHT_NAMES);

    type(overrideField(), '61');
    expect(overrideField().value).toBe('61');
    expect(readout()).toMatch(/^Pool: 61 Pokémon — \d+ Mega-capable$/);

    choosePreset('x2');

    expect(overrideField().value).toBe('96');
    expect(readout()).toMatch(/^Pool: 96 Pokémon — \d+ Mega-capable$/);
    expect(reasonText()).toBe('8 players, 6 rounds, 96 Pokémon in the pool.');
  });

  it('follows the player count again once a preset has taken the size back', () => {
    mount();
    nameEveryone(EIGHT_NAMES);

    type(overrideField(), '61');
    choosePreset('x1_5');
    expect(overrideField().value).toBe('72');

    // Following the preset again rather than merely showing its number once: changing the
    // player count has to move it, which a lingering override would prevent.
    nameEveryone(EIGHT_NAMES.slice(0, 4));
    expect(overrideField().value).toBe('36');
  });

  it('unblocks an emptied field, which nothing else on the screen could', () => {
    mount();
    nameEveryone(EIGHT_NAMES);

    type(overrideField(), '');
    expect(startButton()?.getAttribute('aria-disabled')).toBe('true');

    // A preset the host is not already on, because a browser fires no `change` for a
    // click on the selected radio — so `Exact` is not a way out of a screen that opened
    // on `Exact`, and the assertion must not pretend otherwise.
    choosePreset('x2');

    expect(overrideField().value).toBe('96');
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
      megaEligibleIds: MEGA_ELIGIBLE_IDS,
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
      megaEligibleIds: MEGA_ELIGIBLE_IDS,
      seed: POOL_SEED,
    });
    const after = drawPool({
      candidates: ENTRIES,
      size: 48,
      megasRequired: 0,
      megaEligibleIds: MEGA_ELIGIBLE_IDS,
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

    // Since 02-06 the pool draw asks first (D-36), and nothing is drawn until it is
    // answered — the readout is still the one everyone in the room has been reading.
    expect(readout()).toBe(`Pool: 48 Pokémon — ${before.megaCapableCount} Mega-capable`);

    const dialog = host.querySelector('[role="alertdialog"]');
    expect(dialog).not.toBeNull();
    const draw = Array.from(dialog?.querySelectorAll('button') ?? []).find(
      (element) => element.textContent?.trim() === 'Draw a new pool',
    );
    act(() => {
      draw?.click();
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

// ---------------------------------------------------------------------------
// The constrained draw — D-08, D-09
// ---------------------------------------------------------------------------

describe('the Mega requirement reaching the draw', () => {
  it('asks for players × megasRequiredPerTeam Megas, gets them, and does not hang', () => {
    mount();
    nameEveryone(EIGHT_NAMES);

    const megas = fieldLabelled('Megas required per team');
    expect(megas).not.toBeNull();

    const started = Date.now();
    if (megas !== null) type(megas, '4');
    const elapsed = Date.now() - started;

    // The quota is p × k, not k: every player must be able to field four, so the whole
    // pool needs thirty-two. Reject-and-redraw would need ~6.4 × 10^7 expected redraws at
    // exactly this configuration, and this configuration passes every feasibility
    // blocker — so a retry loop here is a frozen tab for an ordinary host.
    expect(elapsed).toBeLessThan(500);

    const text = readout() ?? '';
    expect(text).toMatch(/^Pool: 48 Pokémon — \d+ Mega-capable$/);

    const drawn = Number(text.replace('Pool: 48 Pokémon — ', '').replace(' Mega-capable', ''));
    expect(drawn).toBeGreaterThanOrEqual(32);
  });

  it('records the drawn Mega-capable count into the log, recountable against the roster', () => {
    mount();
    nameEveryone(EIGHT_NAMES);

    const megas = fieldLabelled('Megas required per team');
    if (megas !== null) type(megas, '4');

    act(() => {
      startButton()?.click();
    });

    const pool = getDoc()?.log[0];
    expect(pool).toBeDefined();
    if (pool === undefined || !isPoolBuiltAction(pool)) throw new Error('no pool/built action');

    expect(pool.ids).toHaveLength(48);
    expect(pool.megaCapableCount).toBeGreaterThanOrEqual(32);
    // D-09: the figure Phase 3's RULE-09 gate reads rather than recomputing against a
    // roster that may since have rotated. It is the drawn set's own count, so recounting
    // it against today's roster must agree — and Phase 3 must handle the day it does not.
    expect(pool.ids.filter((id) => MEGA_CAPABLE_IDS.has(id))).toHaveLength(
      pool.megaCapableCount,
    );
  });

  it('leaves the draw unconstrained at a requirement of zero', () => {
    mount();
    nameEveryone(EIGHT_NAMES);

    act(() => {
      startButton()?.click();
    });

    const pool = getDoc()?.log[0];
    if (pool === undefined || !isPoolBuiltAction(pool)) throw new Error('no pool/built action');

    // Whatever the uniform draw produced, which is well under the constrained figure.
    expect(pool.megaCapableCount).toBeLessThan(32);
    expect(pool.ids.filter((id) => MEGA_CAPABLE_IDS.has(id))).toHaveLength(
      pool.megaCapableCount,
    );
  });

  it('emits the pool in dex order rather than in the shuffle order', () => {
    mount();
    nameEveryone(EIGHT_NAMES);

    const megas = fieldLabelled('Megas required per team');
    if (megas !== null) type(megas, '4');

    act(() => {
      startButton()?.click();
    });

    const ids = getState()?.poolIds ?? [];
    expect(ids).toHaveLength(48);
    expect(
      isSubsequence(
        ENTRIES.map((entry) => entry.id),
        ids,
      ),
    ).toBe(true);

    // The guard: a reversed pool is the same SET and must fail the same walk, or the
    // assertion above has quietly degenerated into a set comparison.
    expect(
      isSubsequence(
        ENTRIES.map((entry) => entry.id),
        [...ids].reverse(),
      ),
    ).toBe(false);
  });

  it('starts the draft with the order the host was shown', () => {
    mount();
    nameEveryone(EIGHT_NAMES);

    const shown = renderedOrder();

    act(() => {
      startButton()?.click();
    });

    const byId = new Map(
      getDoc()?.config.players.map((player) => [player.id, player.name]) ?? [],
    );
    expect(getState()?.order.map((id) => byId.get(id))).toEqual(shown);
  });
});

// ---------------------------------------------------------------------------
// The pool-dry invariant — pinned by a test, never guarded by code
// ---------------------------------------------------------------------------

/**
 * Play out the current round's priority cards, if it is still being bid on.
 *
 * A draft with a compiled schedule opens in the card phase and there is no turn until the
 * round resolves (D-17), so a test that drives real picks has to bid first — which is what
 * the card panel does for the host. Everyone plays the lowest card still in hand, so each
 * round is a tie on value and `resolvePickOrder` settles it on `seq`.
 */
function bidCurrentRound(): void {
  const state = getState();
  if (state === null) throw new Error('no draft state');
  if (selectPhase(state) !== 'cards') return;

  const round = selectCurrentRound(state);

  for (const playerId of selectCardPlayOrder(state, round)) {
    const live = getState();
    if (live === null) throw new Error('no draft state');

    const value = selectHand(live, playerId)[0];
    if (value === undefined) throw new Error(`${playerId} has no card left in round ${round}`);

    expect(dispatch(cardsPlayed({ playerId, value, round })).ok).toBe(true);
  }

  const bid = getState();
  if (bid === null) throw new Error('no draft state');

  const resolved = dispatch(
    orderResolved(round, resolvePickOrder(selectCardsPlayedThisRound(bid, round))),
  );
  expect(resolved.ok).toBe(true);
}

describe('a pool drawn at Exact', () => {
  it('leaves the last picker exactly one option and never runs dry', () => {
    mount();
    nameEveryone(['Ada', 'Bo']);

    act(() => {
      startButton()?.click();
    });

    expect(getState()?.poolIds).toHaveLength(12);

    // `N − j` ids are available before the 0-based pick `j`: `canApply` rejects a
    // duplicate pool id, the rotation length is exactly `p`, and each accepted pick
    // removes exactly one distinct id. So the final picker sees exactly `N − p×r + 1`,
    // which at the Exact preset is one.
    for (let pick = 0; pick < 11; pick++) {
      bidCurrentRound();

      const state = getState();
      if (state === null) throw new Error('no draft state');

      const turn = selectCurrentTurn(state);
      if (turn === null) throw new Error(`no turn at pick ${pick}`);

      const next = selectAvailablePool(state)[0];
      if (next === undefined) throw new Error(`the pool ran dry at pick ${pick}`);

      const result = dispatch(
        pickMade({
          playerId: turn.playerId,
          monId: next,
          round: turn.round,
          pickIndex: turn.pickIndex,
        }),
      );
      expect(result.ok).toBe(true);
    }

    const final = getState();
    if (final === null) throw new Error('no draft state');

    // The feasibility blocker IS the guarantee. Nothing in the draft needs defensive
    // mid-draft pool-dry handling, and adding some would be a second answer to a question
    // the gate has already settled.
    expect(selectAvailablePool(final)).toHaveLength(1);
    expect(selectCurrentTurn(final)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The two swap fields reaching the gate — 03-05
// ---------------------------------------------------------------------------

describe('the Swaps group reaching the gate', () => {
  it('blocks the start when the swap budget is emptied', () => {
    mount();
    nameEveryone(EIGHT_NAMES);

    type(swapBudgetField(), '');

    // Same shape as the pool-size hole one group up: read arithmetically an empty numeric
    // field is `NaN`, every comparison with it is false, and a gate that merely compared
    // would enable Start on a configuration the host has not finished stating.
    expect(reasonText()).toBe('Swap budget needs a whole number. Enter 0 for no swaps.');
    expect(startButton()?.getAttribute('aria-disabled')).toBe('true');
    expect(readout()).toBeNull();
  });

  it('blocks the start when the swap-rounds field is emptied', () => {
    mount();
    nameEveryone(EIGHT_NAMES);

    type(swapRoundsField(), '');

    expect(reasonText()).toBe(
      'Swap rounds needs a whole number. Enter 0 to end the draft with the last pick.',
    );
    expect(startButton()?.getAttribute('aria-disabled')).toBe('true');
  });

  it('unblocks again the moment a whole number is typed back', () => {
    mount();
    nameEveryone(EIGHT_NAMES);

    type(swapBudgetField(), '');
    expect(startButton()?.getAttribute('aria-disabled')).toBe('true');

    type(swapBudgetField(), '2');
    expect(startButton()?.hasAttribute('aria-disabled')).toBe(false);
  });

  it('warns without blocking when swap rounds run on an Exact pool (D-32)', () => {
    mount();
    nameEveryone(EIGHT_NAMES);

    type(swapRoundsField(), '2');

    // The Exact preset is the default, so this is the ordinary configuration rather than an
    // edge one — which is exactly why it warns instead of blocking. The sentence supersedes
    // the plain exactly-minimum one because it carries the same number and says more.
    expect(reasonText()).toBe(
      'Warning — the pool is exactly 48, so it is empty when the last pick lands. The first player to swap can only take what someone else drops.',
    );
    expect(startButton()?.hasAttribute('aria-disabled')).toBe(false);
  });

  it('says the ordinary thing again at a pool with a surplus', () => {
    mount();
    nameEveryone(EIGHT_NAMES);

    type(swapRoundsField(), '2');
    choosePreset('x1_5');

    expect(reasonText()).toBe('8 players, 6 rounds, 72 Pokémon in the pool.');
    expect(startButton()?.hasAttribute('aria-disabled')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// RULE-09 on screen — the blocker, with the arithmetic and the right list
// ---------------------------------------------------------------------------

describe('Mega-forme bans reaching the gate (RULE-09)', () => {
  it('blocks the start with the arithmetic and both ban counts', () => {
    mount();
    nameEveryone(TWELVE_NAMES);
    type(megasField(), '6');

    // Passing before the bans: 12 x 6 = 72, and the snapshot carries more eligible species
    // than that. Asserted, because a test that only checked the blocked state would pass
    // against a screen that was blocked for some other reason all along.
    expect(startButton()?.hasAttribute('aria-disabled')).toBe(false);

    for (const victim of SINGLE_FORME_VICTIMS) {
      const forme = victim.megaFormes[0];
      if (forme !== undefined) banForme(forme.name);
    }

    expect(reasonText()).toBe(
      `Not enough Pokémon can Mega. 12 players × 6 Mega rounds needs 72; ${
        MEGA_ELIGIBLE_IDS.length - 3
      } can still Mega after 0 species bans and 3 Mega-forme bans. Lower the Mega requirement, or unban a Mega forme.`,
    );
    expect(startButton()?.getAttribute('aria-disabled')).toBe('true');
    // Blocked means no draw, so there is nothing on screen claiming a pool exists.
    expect(readout()).toBeNull();
  });

  it('unblocks when one forme is unbanned again', () => {
    mount();
    nameEveryone(TWELVE_NAMES);
    type(megasField(), '6');

    for (const victim of SINGLE_FORME_VICTIMS) {
      const forme = victim.megaFormes[0];
      if (forme !== undefined) banForme(forme.name);
    }
    expect(startButton()?.getAttribute('aria-disabled')).toBe('true');

    // The cell toggles, so clicking it again is the unban the sentence names.
    const first = SINGLE_FORME_VICTIMS[0]?.megaFormes[0];
    if (first !== undefined) banForme(first.name);

    expect(startButton()?.hasAttribute('aria-disabled')).toBe(false);
  });

  it('leaves the gate alone at a Mega requirement of zero', () => {
    mount();
    nameEveryone(TWELVE_NAMES);

    for (const victim of SINGLE_FORME_VICTIMS) {
      const forme = victim.megaFormes[0];
      if (forme !== undefined) banForme(forme.name);
    }

    // No Mega rounds, so no Mega arithmetic. The reason is the one the Exact preset always
    // gives, unchanged — a forme ban is not a species ban and must not move the pool count.
    expect(reasonText()).toBe(
      'Warning — the pool is exactly 72. The last player to pick in Round 6 will have one Pokémon to choose from.',
    );
    expect(startButton()?.hasAttribute('aria-disabled')).toBe(false);
    expect(readout()).toMatch(/^Pool: 72 Pokémon — \d+ Mega-capable$/);
  });
});

// ---------------------------------------------------------------------------
// The draw honours the same eligibility the gate measured
// ---------------------------------------------------------------------------

describe('a configuration that passes the gate', () => {
  /** Ids that can still Mega once `SINGLE_FORME_VICTIMS` have lost their only forme. */
  function stillEligible(): Set<string> {
    const starved = new Set(SINGLE_FORME_VICTIMS.map((entry) => entry.id));
    return new Set(MEGA_ELIGIBLE_IDS.filter((id) => !starved.has(id)));
  }

  function banTheVictims(): void {
    for (const victim of SINGLE_FORME_VICTIMS) {
      const forme = victim.megaFormes[0];
      if (forme !== undefined) banForme(forme.name);
    }
  }

  it('draws a pool that can fill every Mega round at eight players requiring four', () => {
    mount();
    nameEveryone(EIGHT_NAMES);
    banTheVictims();
    type(megasField(), '4');

    expect(startButton()?.hasAttribute('aria-disabled')).toBe(false);
    act(() => {
      startButton()?.click();
    });

    const eligible = stillEligible();
    const ids = getState()?.poolIds ?? [];

    // The whole point of the partition change: the quota is drawn from species that can
    // STILL Mega, so a pool that passed the gate cannot open a Mega round with nothing in
    // it. Partitioning on the `megaCapable` flag satisfies the length assertion above and
    // fails this one.
    expect(ids).toHaveLength(48);
    expect(ids.filter((id) => eligible.has(id)).length).toBeGreaterThanOrEqual(32);
  });

  it('draws a pool that can fill every Mega round at six players requiring six', () => {
    mount();
    nameEveryone(EIGHT_NAMES.slice(0, 6));
    banTheVictims();
    type(megasField(), '6');

    expect(startButton()?.hasAttribute('aria-disabled')).toBe(false);
    act(() => {
      startButton()?.click();
    });

    const eligible = stillEligible();
    const ids = getState()?.poolIds ?? [];

    // Exact and every round a Mega round: the entire pool has to be eligible.
    expect(ids).toHaveLength(36);
    expect(ids.filter((id) => eligible.has(id)).length).toBe(36);
  });

  it('keeps Re-roll pool available, and a re-roll does not move the verdict', () => {
    mount();
    nameEveryone(EIGHT_NAMES);
    banTheVictims();
    type(megasField(), '4');

    // 03-RESEARCH Open Question 1, settled: the gate measures the CANDIDATE set, never the
    // drawn pool, so a re-roll cannot change what it says. The control stays.
    expect(buttonNamed('Re-roll pool')).not.toBeNull();
    const before = reasonText();

    act(() => {
      buttonNamed('Re-roll pool')?.click();
    });
    const dialog = host.querySelector('[role="alertdialog"]');
    const draw = Array.from(dialog?.querySelectorAll('button') ?? []).find(
      (element) => element.textContent?.trim() === 'Draw a new pool',
    );
    act(() => {
      draw?.click();
    });

    expect(buttonNamed('Re-roll pool')).not.toBeNull();
    expect(reasonText()).toBe(before);
    expect(startButton()?.hasAttribute('aria-disabled')).toBe(false);
  });
});
