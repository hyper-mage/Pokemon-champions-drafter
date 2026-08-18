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

import committedSnapshot from '../../public/data/roster.mb.json';
import type { SpriteMeta } from '../../src/adapters/roster-source';
import {
  isDraftStartedAction,
  isPoolBuiltAction,
  isScheduleCompiledAction,
} from '../../src/core/actions';
import type { FeasibilityResult } from '../../src/core/feasibility';
import { selectStartingOrder } from '../../src/core/selectors';
import type { RosterEntry, RosterSnapshot } from '../../src/core/roster/types';
import { getDoc, getState } from '../../src/store';
import { FeasibilityBar } from '../../src/ui/components/FeasibilityBar';
import { announce, LiveRegion } from '../../src/ui/components/LiveRegion';
import { NumericField, parseNumericField } from '../../src/ui/components/NumericField';
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

/**
 * Pokedex order, and deterministic — the same comparator `app.tsx` sorts with before it
 * hands `entries` to the screen. The committed snapshot is stored alphabetically by id, so
 * a test that skipped this would be asserting against an order the app never renders.
 */
function byDexOrder(a: RosterEntry, b: RosterEntry): number {
  if (a.num !== b.num) return a.num - b.num;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

/** The ACTUAL roster, for the assertions whose whole point is what really exists. */
const COMMITTED = committedSnapshot as unknown as RosterSnapshot;
const COMMITTED_ENTRIES: readonly RosterEntry[] = [...COMMITTED.entries].sort(byDexOrder);

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

/**
 * The ban grid needs a sprite inventory — 02-07 added it to the screen's props.
 *
 * Every fixture row carries `spriteMissing: true`, which routes it to the committed
 * placeholder, so nothing here depends on a file on disk.
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

/**
 * The same screen with the app-root live region beside it.
 *
 * Separate from `mount` rather than folded into it: the region's text joins
 * `host.textContent`, and half this file asserts on that string.
 */
function mountAnnouncing(): void {
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
 * Three elements on this screen carry a status role — the feasibility reason, the
 * typeahead's no-match line and this one — and only this one is the global region, so it
 * is selected by `aria-live` rather than by the role they share.
 */
function liveRegionText(): string {
  return host.querySelector('[aria-live="polite"]')?.textContent ?? '';
}

/** The same screen against the real committed roster rather than the 60-entry fixture. */
function mountCommitted(onStarted: () => void = () => undefined): void {
  act(() => {
    render(
      <ConfigScreen
        snapshot={COMMITTED}
        entries={COMMITTED_ENTRIES}
        spriteMeta={SPRITE_META}
        onStarted={onStarted}
      />,
      host,
    );
  });
}

/**
 * The input a visible `<label>` is bound to.
 *
 * Resolved through `for`/`id` rather than by class, so a field whose label stopped being
 * associated with its control fails here instead of passing on a `querySelector`.
 */
function fieldLabelled(label: string): HTMLInputElement | null {
  const element = Array.from(host.querySelectorAll('label')).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  const id = element?.getAttribute('for');
  if (id === null || id === undefined) return null;
  return host.querySelector<HTMLInputElement>(`input[id="${id}"]`);
}

function buttonNamed(name: string): HTMLButtonElement | null {
  return (
    Array.from(host.querySelectorAll('button')).find(
      (element) => element.textContent?.trim() === name,
    ) ?? null
  );
}

/** The schedule preview's row texts, in document order. */
function scheduleRows(): string[] {
  return Array.from(host.querySelectorAll('.schedule-preview__round-label')).map(
    (row) => row.textContent?.trim() ?? '',
  );
}

/** The `Move up` / `Move down` button of round `round` (1-based). */
function moveButton(round: number, direction: 'up' | 'down'): HTMLButtonElement {
  const label = direction === 'up' ? 'Move up' : 'Move down';
  const found = Array.from(host.querySelectorAll<HTMLButtonElement>('.schedule-preview__move'))
    .filter((button) => button.textContent?.trim() === label)
    .at(round - 1);
  if (found === undefined) throw new Error(`no ${label} button on round ${round}`);
  return found;
}

function removeButtons(): HTMLButtonElement[] {
  return Array.from(host.querySelectorAll('button')).filter((element) =>
    element.textContent?.trim().startsWith('Remove '),
  );
}

/**
 * Click the confirming button of the open dialog — D-36.
 *
 * Since 02-06 the three destructive config actions each ask first, so a test about what
 * `Randomize order` or a `Remove` button DOES has to walk through the confirm to reach
 * the behaviour it is about.
 *
 * Scoped to inside the dialog, deliberately: `Remove Bo` is the label on the row's own
 * button AND on the button that carries it out, which is correct — the host reads the
 * same verb both times — but a page-wide lookup finds the row first and re-opens the
 * dialog instead of confirming it.
 */
function confirmDialog(label: string): void {
  const dialog = host.querySelector('[role="alertdialog"]');
  expect(dialog).not.toBeNull();

  const button = Array.from(dialog?.querySelectorAll('button') ?? []).find(
    (element) => element.textContent?.trim() === label,
  );
  expect(button).toBeDefined();

  act(() => {
    button?.click();
  });
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
const EIGHT_NAMES = [...SIX_NAMES, 'Gus', 'Hal'];

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

    // Mount draws TWO seeds — the order's, then the pool's — and they are independent by
    // design, so `Randomize order` is the third draw. The pool seed sitting between them
    // is exactly what this test is asserting cannot be shared.
    edge.reset([FIRST, 4242, SECOND]);
    mount();

    expect(renderedOrder()).toEqual(positionalNames(INITIAL_IDS, before));

    act(() => {
      buttonNamed('Randomize order')?.click();
    });

    // Asking first is D-36; the seed is not drawn until the host says yes.
    expect(renderedOrder()).toEqual(positionalNames(INITIAL_IDS, before));
    confirmDialog('Roll a new order');

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

    // Scoped to the player list. The screen has more than one visually-hidden label since
    // 02-07 — the ban field carries one too — and this assertion is about the rows.
    const labels = Array.from(
      host.querySelectorAll('.player-list label.visually-hidden'),
    ).map((label) => label.textContent);
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

    // The row is still there until the confirm is answered (D-36).
    expect(nameInputs()).toHaveLength(4);
    confirmDialog('Remove Bo');

    expect(nameInputs()).toHaveLength(3);
    expect(host.textContent).not.toContain('Remove Bo');
    // The order shrinks with the roster of rows rather than keeping a ghost entry.
    expect(host.querySelectorAll('.player-list__order li')).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// NumericField — the parse that closes the NaN hole at the field boundary
//
// The gate refuses; the field only reports what it was given. Everything below asserts
// that division of labour rather than any particular verdict about a number.
// ---------------------------------------------------------------------------

describe('parseNumericField', () => {
  it('collapses every unusable input to null rather than to NaN', () => {
    // NaN is the value the gate cannot refuse: every relational comparison with it is
    // false, so `> legal` and `< players × rounds` BOTH pass and Start enables on a
    // configuration that cannot be drawn. `null` is a case the compiler forces the gate
    // to handle; NaN is one it cannot see.
    expect(parseNumericField('')).toBeNull();
    expect(parseNumericField('   ')).toBeNull();
    expect(parseNumericField('abc')).toBeNull();
    expect(parseNumericField('4e')).toBeNull();
  });

  it('parses values the gate will refuse rather than refusing them itself', () => {
    // One authority on what is satisfiable, not two. A field that rejected 48.5 would be
    // a second opinion, and the host would be arguing with an input box.
    expect(parseNumericField('48')).toBe(48);
    expect(parseNumericField('48.5')).toBe(48.5);
    expect(parseNumericField('-3')).toBe(-3);
  });
});

describe('the NumericField control', () => {
  it('binds its label to its input and describes it with the helper', () => {
    act(() => {
      render(
        <NumericField
          label="Megas required per team"
          value="2"
          onInput={() => undefined}
          helper="A helper sentence."
          min={0}
          max={6}
        />,
        host,
      );
    });

    const input = fieldLabelled('Megas required per team');
    expect(input).not.toBeNull();
    expect(input?.value).toBe('2');

    const describedBy = input?.getAttribute('aria-describedby');
    expect(describedBy).not.toBeNull();
    expect(host.querySelector(`[id="${describedBy}"]`)?.textContent).toBe(
      'A helper sentence.',
    );

    // `min` and `max` are native affordances, not enforcement — typing past `max` only
    // marks the input `:invalid`, which is exactly why the gate carries its own blocker.
    expect(input?.getAttribute('min')).toBe('0');
    expect(input?.getAttribute('max')).toBe('6');
  });
});

// ---------------------------------------------------------------------------
// Group 3 — Mega rules (D-03, D-08)
// ---------------------------------------------------------------------------

describe('the Mega rules group', () => {
  it('interpolates the helper from the player count and the value on screen', () => {
    mount();

    const input = fieldLabelled('Megas required per team');
    expect(input).not.toBeNull();
    if (input !== null) type(input, '2');

    // Four rows × 2 Megas. The number the host is reasoning about is the one in front of
    // them rather than a worked example.
    //
    // The string is 03-UI-SPEC's amended one. Its first clause is the phase's answer to the
    // likeliest host confusion: what 0 DOES, rather than only that it is allowed.
    expect(host.textContent).toContain(
      '0 means no Mega requirement, and no slot is a Mega slot — nothing exports with a Mega Stone. A requirement of 2 makes 2 rounds Mega-only and needs at least 8 Pokémon that can still Mega.',
    );
  });

  it('shows the schedule the requirement compiles to, beneath the field', () => {
    mount();

    const input = fieldLabelled('Megas required per team');
    expect(input).not.toBeNull();
    if (input !== null) type(input, '2');

    expect(host.textContent).toContain('Round schedule');
    expect(host.textContent).toContain(
      'The draft runs these rounds in this order. Reorder them before you start; the schedule is fixed once the draft begins.',
    );
    expect(scheduleRows()).toEqual([
      'Round 1 — Mega',
      'Round 2 — Mega',
      'Round 3 — Open',
      'Round 4 — Open',
      'Round 5 — Open',
      'Round 6 — Open',
    ]);
  });

  it('re-seeds the preview from the compiler when the requirement changes', () => {
    mount();

    const input = fieldLabelled('Megas required per team');
    expect(input).not.toBeNull();
    if (input === null) return;

    type(input, '2');
    // A reorder first, so the re-seed has something to discard rather than merely
    // reproducing a schedule that was already canonical.
    act(() => {
      moveButton(2, 'down').click();
    });
    expect(scheduleRows()[2]).toBe('Round 3 — Mega');

    type(input, '3');

    // Three LEADING Mega rounds — the requirement is the source, and the permutation is
    // applied to what it produces rather than surviving it.
    expect(scheduleRows()).toEqual([
      'Round 1 — Mega',
      'Round 2 — Mega',
      'Round 3 — Mega',
      'Round 4 — Open',
      'Round 5 — Open',
      'Round 6 — Open',
    ]);
  });

  it('keeps the round numbers ascending after a move — the kinds move, the rows do not', () => {
    mount();

    const input = fieldLabelled('Megas required per team');
    expect(input).not.toBeNull();
    if (input !== null) type(input, '2');

    act(() => {
      moveButton(2, 'down').click();
    });
    act(() => {
      moveButton(3, 'down').click();
    });

    expect(scheduleRows()).toEqual([
      'Round 1 — Mega',
      'Round 2 — Open',
      'Round 3 — Open',
      'Round 4 — Mega',
      'Round 5 — Open',
      'Round 6 — Open',
    ]);
  });

  it('announces which round became a Mega round and which became open', () => {
    mountAnnouncing();

    const input = fieldLabelled('Megas required per team');
    expect(input).not.toBeNull();
    if (input !== null) type(input, '2');

    act(() => {
      moveButton(2, 'down').click();
    });

    expect(liveRegionText()).toBe('Round 3 is now a Mega round. Round 2 is now open.');
  });

  it('says there is nothing to reorder at a requirement of 0', () => {
    mount();

    expect(host.textContent).toContain(
      'Every round is open, so there is nothing to reorder.',
    );
    expect(host.querySelectorAll('.schedule-preview__move')).toHaveLength(0);
  });

  it('blocks Start when the requirement outruns a team of six', () => {
    mount();
    nameEveryone(['Ada', 'Bo']);

    const input = fieldLabelled('Megas required per team');
    expect(input).not.toBeNull();
    if (input !== null) type(input, '9');

    // 2 × 9 = 18 is well under the fixture's Mega-capable count, so the Mega-COUNT
    // blocker passes. Nothing but `megasExceedRounds` catches this, which is why it is
    // in the precedence list at all (02-RESEARCH F-09).
    expect(reasonElement()?.textContent).toBe(
      'A team has 6 slots, so at most 6 of them can be Megas. Lower the Megas required per team.',
    );
    expect(startButton()?.getAttribute('aria-disabled')).toBe('true');
  });

  it('blocks Start with an action the host can take when the field is emptied', () => {
    mount();
    nameEveryone(['Ada', 'Bo']);

    const input = fieldLabelled('Megas required per team');
    expect(input).not.toBeNull();
    if (input !== null) type(input, '');

    // NOT the sentence above. Deleting the `0` this field ships with is one keystroke and
    // is the commonest way to reach a blocked gate here — and `Lower the Megas required
    // per team` names an action that does not exist on an empty field.
    expect(reasonElement()?.textContent).toBe(
      'Megas required per team needs a whole number. Enter 0 for no Mega requirement.',
    );
    expect(reasonElement()?.textContent).not.toContain('Lower the Megas required per team');
    expect(startButton()?.getAttribute('aria-disabled')).toBe('true');
  });

  it('reports the Mega-capable shortfall when the roster cannot supply the quota', () => {
    mount();
    nameEveryone(EIGHT_NAMES);

    const input = fieldLabelled('Megas required per team');
    expect(input).not.toBeNull();
    if (input !== null) type(input, '6');

    // The fixture carries 15 Mega-capable entries in 60, so 8 × 6 cannot be met.
    expect(reasonElement()?.textContent).toBe(
      'Not enough Mega-capable Pokémon. 8 players × 6 Megas needs 48; 15 are draftable after 0 bans.',
    );
  });

  it('does not block the same requirement against the committed roster', () => {
    mountCommitted();
    nameEveryone(EIGHT_NAMES);

    const input = fieldLabelled('Megas required per team');
    expect(input).not.toBeNull();
    if (input !== null) type(input, '6');

    // 8 × 6 = 48 Megas needed, 74 Mega-capable species draftable. Satisfiable, and only
    // the exactly-minimum warning holds.
    expect(startButton()?.hasAttribute('aria-disabled')).toBe(false);
  });

  it('renders one dual-Mega row per roster species, never a hardcoded pair', () => {
    mountCommitted();

    const legends = Array.from(host.querySelectorAll('legend'))
      .map((legend) => legend.textContent ?? '')
      .filter((text) => text.endsWith(' Mega forme'));

    // Derived from `megaFormes.length > 1` (D-03): a regulation that adds a third
    // dual-Mega species just appears here, and one that drops Raichu stops rendering it.
    expect(legends).toEqual(['Charizard Mega forme', 'Raichu Mega forme']);
  });

  it('renders nothing about dual Megas when the roster has none', () => {
    // The 60-entry fixture carries no `megaFormes` at all.
    mount();

    expect(host.textContent).not.toContain('Dual-Mega species');
    expect(host.textContent).not.toContain(' Mega forme');
  });

  it('keeps the two dual-Mega rows in separate radio groups', () => {
    mountCommitted();

    const charizardX = host.querySelector<HTMLInputElement>(
      'input[name="dual-mega-charizard"][value="x"]',
    );
    const raichuEither = host.querySelector<HTMLInputElement>(
      'input[name="dual-mega-raichu"][value="either"]',
    );

    expect(charizardX).not.toBeNull();
    expect(raichuEither).not.toBeNull();

    // Either is the default, and it is checked rather than merely first.
    expect(raichuEither?.checked).toBe(true);

    act(() => {
      if (charizardX !== null) {
        charizardX.checked = true;
        charizardX.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    expect(charizardX?.checked).toBe(true);
    // Two controls sharing one `name` would have deselected this the moment the row
    // above it was answered.
    expect(raichuEither?.checked).toBe(true);
  });

});

describe('the Swaps group', () => {
  /** Every `<legend>` on the screen, in document order. */
  function legends(): string[] {
    return Array.from(host.querySelectorAll('.config-screen__legend')).map(
      (element) => element.textContent?.trim() ?? '',
    );
  }

  it('renders between Bans and Pool — 03-UI-SPEC §1', () => {
    mount();

    const order = legends();
    const swaps = order.indexOf('Swaps');
    const bans = order.indexOf('Bans');
    const pool = order.indexOf('Pool');

    expect(swaps).toBeGreaterThan(-1);
    // Pool stays last, because its readout is the only one that reflects every group
    // above it — including this one, which D-32 couples to the pool size.
    expect(swaps).toBeGreaterThan(bans);
    expect(swaps).toBeLessThan(pool);
    expect(pool).toBe(order.length - 1);
  });

  it('starts both fields at 0', () => {
    mount();

    expect(fieldLabelled('Swap budget per player')?.value).toBe('0');
    expect(fieldLabelled('Swap rounds after the draft')?.value).toBe('0');
  });

  it('carries both helper strings verbatim', () => {
    mount();

    expect(host.textContent).toContain(
      'Each player may swap this many times in total, mid-draft or in a swap round. 0 means no swaps.',
    );
    expect(host.textContent).toContain(
      'Each swap round gives every player one chance to swap or pass. 0 means the draft ends with the last pick.',
    );
  });

  it('leaves an emptied field empty rather than coercing it back to 0', () => {
    mount();
    nameEveryone(SIX_NAMES);

    const budget = fieldLabelled('Swap budget per player');
    expect(budget).not.toBeNull();
    if (budget !== null) type(budget, '');

    // The control neither rewrites the field nor decides anything about it. D-30 puts the
    // judgement in the feasibility gate, and 03-05 is the plan that adds the blocking
    // reason — until then an empty budget is simply not a blocker on this screen.
    expect(fieldLabelled('Swap budget per player')?.value).toBe('');
    expect(parseNumericField(fieldLabelled('Swap budget per player')?.value ?? '')).toBeNull();
    expect(startButton()?.hasAttribute('aria-disabled')).toBe(false);
  });

  it('does not clamp a value above the field affordance', () => {
    mount();

    const budget = fieldLabelled('Swap budget per player');
    expect(budget).not.toBeNull();
    if (budget !== null) type(budget, '99');

    // `min` is an affordance for the native stepper, never enforcement.
    expect(fieldLabelled('Swap budget per player')?.value).toBe('99');
    expect(fieldLabelled('Swap budget per player')?.getAttribute('min')).toBe('0');
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

    // Three, since 03-02: pool/built, schedule/compiled, draft/started.
    expect(doc?.log).toHaveLength(3);
    expect(state?.poolIds).toHaveLength(36);
    expect(state?.order).toHaveLength(6);
    expect(state?.schedule).toHaveLength(6);
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
    const started = log[2];

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

  it('carries the swap budget and the swap-round count into the document', () => {
    mount();
    nameEveryone(SIX_NAMES);

    const budget = fieldLabelled('Swap budget per player');
    const rounds = fieldLabelled('Swap rounds after the draft');
    expect(budget).not.toBeNull();
    expect(rounds).not.toBeNull();
    if (budget !== null) type(budget, '3');
    if (rounds !== null) type(rounds, '2');

    act(() => {
      startButton()?.click();
    });

    expect(getDoc()?.config.swapBudget).toBe(3);
    expect(getDoc()?.config.swapRounds).toBe(2);
  });

  it('records the swap defaults when the host never touches the group', () => {
    mount();
    nameEveryone(SIX_NAMES);

    act(() => {
      startButton()?.click();
    });

    expect(getDoc()?.config.swapBudget).toBe(0);
    expect(getDoc()?.config.swapRounds).toBe(0);
  });

  it('wraps the Megas required as the rule list the compiler reads', () => {
    mount();
    nameEveryone(SIX_NAMES);

    const megas = fieldLabelled('Megas required per team');
    expect(megas).not.toBeNull();
    if (megas !== null) type(megas, '2');

    act(() => {
      startButton()?.click();
    });

    // One fact in two shapes — the scalar the host typed and the list the compiler reads.
    expect(getDoc()?.config.megasRequiredPerTeam).toBe(2);
    expect(getDoc()?.config.rules).toEqual([{ kind: 'mega', count: 2 }]);
    expect(getDoc()?.config.megaFormeBans).toEqual([]);
  });

  it('compiles that rule list into the schedule the log records — RULE-02', () => {
    mount();
    nameEveryone(SIX_NAMES);

    const megas = fieldLabelled('Megas required per team');
    expect(megas).not.toBeNull();
    if (megas !== null) type(megas, '2');

    act(() => {
      startButton()?.click();
    });

    // The whole slice, end to end: the host typed 2, and the document the group will draft
    // against says two of its six rounds are Mega rounds — before a single pick.
    const compiled = getDoc()?.log[1];
    expect(compiled?.type).toBe('schedule/compiled');
    expect(compiled).toBeDefined();
    if (compiled === undefined || !isScheduleCompiledAction(compiled)) return;

    expect(compiled.rounds).toHaveLength(6);
    expect(compiled.rounds.map((spec) => spec.kind)).toEqual([
      'mega',
      'mega',
      'open',
      'open',
      'open',
      'open',
    ]);
    expect(compiled.rounds.filter((spec) => spec.kind === 'mega')).toHaveLength(2);
    expect(getState()?.schedule).toEqual(compiled.rounds);
  });

  it('starts the draft with the schedule the host reordered, not a recompiled one — RULE-06', () => {
    mount();
    nameEveryone(SIX_NAMES);

    const megas = fieldLabelled('Megas required per team');
    expect(megas).not.toBeNull();
    if (megas !== null) type(megas, '2');

    // Walk both Mega rounds to the bottom. Eight presses, because a move only lands when
    // the neighbour holds the OTHER kind — which is exactly what the inert buttons say.
    const walk: readonly number[] = [2, 3, 4, 5, 1, 2, 3, 4];
    for (const round of walk) {
      act(() => {
        moveButton(round, 'down').click();
      });
    }

    expect(scheduleRows()).toEqual([
      'Round 1 — Open',
      'Round 2 — Open',
      'Round 3 — Open',
      'Round 4 — Open',
      'Round 5 — Mega',
      'Round 6 — Mega',
    ]);

    act(() => {
      startButton()?.click();
    });

    // The one assertion a recompile-at-Start implementation fails. Every other assertion
    // in this file passes either way, because the canonical order is a valid schedule and
    // the config it was compiled from is unchanged — the reorder is the only evidence.
    const compiled = getDoc()?.log[1];
    expect(compiled).toBeDefined();
    if (compiled === undefined || !isScheduleCompiledAction(compiled)) return;

    expect(compiled.rounds.map((spec) => spec.kind)).toEqual([
      'open',
      'open',
      'open',
      'open',
      'mega',
      'mega',
    ]);
    // Still contiguous from 1: the kinds moved between fixed round numbers, so the
    // structural guard's `rounds[i].index === i + 1` holds through eight swaps.
    expect(compiled.rounds.map((spec) => spec.index)).toEqual([1, 2, 3, 4, 5, 6]);
    // The requirement itself is untouched by a reorder — two Mega rounds either way.
    expect(getDoc()?.config.megasRequiredPerTeam).toBe(2);
    expect(getState()?.schedule).toEqual(compiled.rounds);
  });

  it('stores the Megas required and only the dual-Mega rows the host changed', () => {
    mountCommitted();
    nameEveryone(SIX_NAMES);

    const megas = fieldLabelled('Megas required per team');
    expect(megas).not.toBeNull();
    if (megas !== null) type(megas, '2');

    const charizardY = host.querySelector<HTMLInputElement>(
      'input[name="dual-mega-charizard"][value="y"]',
    );
    act(() => {
      if (charizardY !== null) {
        charizardY.checked = true;
        charizardY.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    act(() => {
      startButton()?.click();
    });

    expect(getDoc()?.config.megasRequiredPerTeam).toBe(2);
    // An absent entry means `either`, so the row the host left alone contributes nothing.
    expect(getDoc()?.config.dualMegaChoices).toEqual([{ speciesId: 'charizard', forme: 'y' }]);
  });
});
