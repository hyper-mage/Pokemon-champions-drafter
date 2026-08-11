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

import { isPoolBuiltAction, isDraftStartedAction } from '../../src/core/actions';
import type { FeasibilityResult } from '../../src/core/feasibility';
import { selectStartingOrder } from '../../src/core/selectors';
import type { RosterSnapshot } from '../../src/core/roster/types';
import { getDoc, getState } from '../../src/store';
import { FeasibilityBar } from '../../src/ui/components/FeasibilityBar';
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

function startButton(): HTMLButtonElement | null {
  return host.querySelector<HTMLButtonElement>('.feasibility-bar__start');
}

/** The element `aria-describedby` on Start actually resolves to. */
function reasonElement(): Element | null {
  const id = startButton()?.getAttribute('aria-describedby');
  if (id === null || id === undefined) return null;
  return host.querySelector(`#${id}`);
}

/** Fill `count` rows, adding any that do not exist yet. */
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

const SIX_NAMES = ['Ada', 'Bo', 'Cy', 'Dee', 'Eli', 'Fay'];

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

// ---------------------------------------------------------------------------
// The feasibility bar — RULE-07
//
// These run BEFORE the `Start draft` block below, deliberately: the store is a module
// singleton with no reset, so `getDoc()` is only null until something in this file creates
// a tournament. The identity assertions would hold either way; the null one would not.
// ---------------------------------------------------------------------------

describe('a blocked Start draft', () => {
  it('is aria-disabled, has no native disabled attribute, and stays focusable', () => {
    mount();
    nameEveryone(['']);

    const start = startButton();
    expect(start).not.toBeNull();
    expect(start?.getAttribute('aria-disabled')).toBe('true');

    // The divergence from Phase 1's undo button, and the whole point of RULE-07: a
    // natively disabled button is unreachable by keyboard, so a keyboard user could never
    // reach the explanation.
    expect(start?.hasAttribute('disabled')).toBe(false);
    start?.focus();
    expect(document.activeElement).toBe(start);
  });

  it('carries the highest-precedence reason in a role=status region', () => {
    mount();
    nameEveryone(['']);

    const reason = reasonElement();
    expect(reason).not.toBeNull();
    expect(reason?.getAttribute('role')).toBe('status');

    // Exactly, not merely contained. `tooFewPlayers` outranks the blank name that also
    // holds, and the sentence names the next action rather than only the problem.
    expect(reason?.textContent).toBe(
      'Add at least one more player. A draft needs two players.',
    );
  });

  it('counts the problems it is not showing', () => {
    mount();
    nameEveryone(['']);

    // One player AND a blank name: two blockers, one shown.
    expect(host.textContent).toContain('1 other problems also block the start.');
  });

  it('does not count a single blocker as one other problem', () => {
    mount();
    nameEveryone(['', '']);

    // Two blank rows normalize to the same key, but a blank row is `blankPlayerName`'s
    // problem and never a duplicate — so this is exactly one blocker.
    expect(host.textContent).toContain('Every player needs a name. Player 1 is blank.');
    expect(host.textContent).not.toContain('other problems also block the start.');
  });

  it('refuses to act when clicked', () => {
    const onStarted = vi.fn();
    mount(onStarted);
    nameEveryone(['']);

    expect(getDoc()).toBeNull();

    act(() => {
      startButton()?.click();
    });

    expect(onStarted).not.toHaveBeenCalled();
    expect(getDoc()).toBeNull();
    expect(getState()).toBeNull();
  });
});

describe('a satisfiable configuration', () => {
  it('warns at exactly players x rounds without blocking', () => {
    mount();
    nameEveryone(SIX_NAMES);

    // Exact is the default preset, so the pool is always exactly the minimum and this
    // warning is the ordinary case rather than an edge one — which is precisely why the
    // gate needs two severities.
    expect(reasonElement()?.textContent).toBe(
      'Warning — the pool is exactly 36. The last player to pick in Round 6 will have one Pokémon to choose from.',
    );
    expect(startButton()?.hasAttribute('aria-disabled')).toBe(false);
    expect(host.textContent).not.toContain('other problems also block the start.');
  });
});

describe('the feasibility bar rendering a result it did not compute', () => {
  function clear(): FeasibilityResult {
    return {
      blocked: false,
      problems: [],
      legalCount: 235,
      megaCapableLegalCount: 74,
      banCount: 0,
    };
  }

  it('restates the configuration when nothing is wrong', () => {
    act(() => {
      render(
        <FeasibilityBar
          result={clear()}
          players={6}
          rounds={6}
          poolSize={54}
          onStart={() => undefined}
        />,
        host,
      );
    });

    // Not praise and not a checkmark: the host reads their own configuration back before
    // committing to it.
    expect(reasonElement()?.textContent).toBe('6 players, 6 rounds, 54 Pokémon in the pool.');
    expect(startButton()?.hasAttribute('aria-disabled')).toBe(false);
  });

  it('reports the first of three blockers and counts the other two', () => {
    const result: FeasibilityResult = {
      blocked: true,
      problems: [
        { code: 'tooFewPlayers', severity: 'blocking', message: 'First.' },
        { code: 'blankPlayerName', severity: 'blocking', message: 'Second.' },
        { code: 'duplicatePlayerName', severity: 'blocking', message: 'Third.' },
        { code: 'poolExactlyMinimum', severity: 'warning', message: 'Warning — fourth.' },
      ],
      legalCount: 235,
      megaCapableLegalCount: 74,
      banCount: 0,
    };

    act(() => {
      render(
        <FeasibilityBar
          result={result}
          players={1}
          rounds={6}
          poolSize={6}
          onStart={() => undefined}
        />,
        host,
      );
    });

    expect(reasonElement()?.textContent).toBe('First.');
    // Blocking severity only. The warning is a problem but it does not block the start.
    expect(host.textContent).toContain('2 other problems also block the start.');
  });

  it('calls onStart exactly once when nothing blocks', () => {
    const onStart = vi.fn();

    act(() => {
      render(
        <FeasibilityBar
          result={clear()}
          players={6}
          rounds={6}
          poolSize={54}
          onStart={onStart}
        />,
        host,
      );
    });

    act(() => {
      startButton()?.click();
    });

    expect(onStart).toHaveBeenCalledTimes(1);
  });
});

describe('Start draft on a satisfiable configuration', () => {
  it('creates a tournament from the host answers and nothing else', () => {
    const onStarted = vi.fn();
    mount(onStarted);
    nameEveryone(SIX_NAMES);

    act(() => {
      startButton()?.click();
    });

    expect(onStarted).toHaveBeenCalledTimes(1);

    const doc = getDoc();
    const state = getState();

    expect(doc?.log).toHaveLength(2);
    expect(state?.poolIds).toHaveLength(36);
    expect(state?.order).toHaveLength(6);
    expect(doc?.config.players.map((player) => player.name)).toEqual(SIX_NAMES);
    expect(doc?.config.rounds).toBe(6);
    expect(doc?.config.poolSize).toBe(36);
    expect(doc?.config.depth).toBe('draftOnly');
    expect(doc?.config.formatLabel).toBe('Champions mb');

    // Player ids are generated at the edge, and `p1` is not one of them any more.
    expect(doc?.config.players.map((player) => player.id)).not.toContain('p1');
  });

  it('materializes both seeds and the Mega-capable count into the log', () => {
    mount();
    nameEveryone(SIX_NAMES);

    act(() => {
      startButton()?.click();
    });

    const log = getDoc()?.log ?? [];
    const pool = log[0];
    const started = log[1];

    expect(pool).toBeDefined();
    expect(started).toBeDefined();
    if (pool === undefined || started === undefined) return;

    expect(isPoolBuiltAction(pool)).toBe(true);
    expect(isDraftStartedAction(started)).toBe(true);
    if (!isPoolBuiltAction(pool) || !isDraftStartedAction(started)) return;

    // Provenance, not an instruction to rebuild: the ids are already in the log, and the
    // seeds say where they came from.
    expect(pool.ids).toHaveLength(36);
    expect(Number.isSafeInteger(pool.seed)).toBe(true);
    expect(pool.megaCapableCount).toBeGreaterThan(0);
    expect(pool.megaCapableCount).toBeLessThanOrEqual(36);
    expect(Number.isSafeInteger(started.seed)).toBe(true);

    // The two derivations do not share a stream, so the seeds are two draws and not one.
    expect(pool.seed).not.toBe(started.seed);
  });

  it('starts the draft with the order the host was shown', () => {
    mount();
    nameEveryone(SIX_NAMES);

    const shown = renderedOrder();

    act(() => {
      startButton()?.click();
    });

    const doc = getDoc();
    const byId = new Map(doc?.config.players.map((player) => [player.id, player.name]) ?? []);
    const state = getState();

    expect(state?.order.map((id) => byId.get(id))).toEqual(shown);
  });
});
