// @vitest-environment happy-dom

/**
 * The `Tournament` group's four controls — TOUR-01, TOUR-04, TOUR-07, D-01, D-04, D-08.
 *
 * This file exists for the copy and the inertness table, which are the two things about
 * this group that no visual review catches.
 *
 * Every string here is a LITERAL rather than an import from the screen. That is deliberate
 * and it is the point of the file: `05-UI-SPEC` §Copywriting is a contract down to the em
 * dash, and a test that imported the constant would agree with the screen no matter what
 * either of them said. The size-line arithmetic is pinned the same way — `28` and `10` are
 * written out rather than computed, so a regression in `p(p−1)/2` has to change this file
 * to pass.
 *
 * `newSeed` and `newId` are stubbed at the adapter, which is the seam that exists for
 * exactly this. Nothing in `src/core` is mocked.
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Hoisted so the `vi.mock` factory below can see it — `vi.mock` is lifted above imports. */
const edge = vi.hoisted(() => {
  let idIndex = 0;

  return {
    reset(): void {
      idIndex = 0;
    },
    newSeed(): number {
      return 4242;
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
import { getDoc } from '../../src/store';
import { announce } from '../../src/ui/components/LiveRegion';
import { ConfigScreen } from '../../src/ui/screens/ConfigScreen';

// ---------------------------------------------------------------------------
// Copy under test — verbatim from 05-UI-SPEC §Copywriting → Config screen
// ---------------------------------------------------------------------------

const NOTE_DRAFT_ONLY = 'The night ends when the draft ends.';
const NOTE_DRAFT_AND_BRACKETS =
  'After the draft: a round robin, a cut you choose, and a single-elimination bracket. Winners only — no scores.';
const NOTE_DRAFT_BRACKETS_AND_LOG =
  'Everything in Draft and brackets, plus one number per match that breaks ties in the standings.';

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
  edge.reset();
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
    [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (element) => element.textContent?.trim() === name,
    ) ?? null
  );
}

function radiosNamed(name: string): HTMLInputElement[] {
  return [...host.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)];
}

function labelFor(input: HTMLInputElement): string {
  return host.querySelector(`label[for="${input.id}"]`)?.textContent?.trim() ?? '';
}

/**
 * Select an option by its radio-group name and stored value.
 *
 * A native `change` event on the input, exactly as `config-bans.test.tsx`'s `pickMode`
 * does: `SegmentedControl` is a real radio group, so this is the event a click produces
 * and not a synthetic stand-in for one.
 */
function pick(group: string, value: string): void {
  const input = radiosNamed(group).find((radio) => radio.value === value);
  if (input === undefined) throw new Error(`no ${group} option ${value}`);
  act(() => {
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

/** Every `.config-screen__note` in the `Tournament` group, in document order. */
function tournamentNotes(): string[] {
  const group = [...host.querySelectorAll<HTMLFieldSetElement>('fieldset.config-screen__group')].find(
    (element) => element.querySelector('legend')?.textContent?.trim() === 'Tournament',
  );
  if (group === undefined) throw new Error('no Tournament group on the screen');
  return [...group.querySelectorAll('.config-screen__note')].map(
    (element) => element.textContent?.trim() ?? '',
  );
}

/** The round-robin size line, or `null` when the depth does not render one. */
function sizeLine(): string | null {
  return tournamentNotes().find((note) => note.startsWith('A round robin at')) ?? null;
}

function nameInputs(): HTMLInputElement[] {
  return [...host.querySelectorAll<HTMLInputElement>('.player-list__name')];
}

function type(input: HTMLInputElement, value: string): void {
  act(() => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** Click the confirming button of the open dialog, scoped inside it — D-36. */
function confirmDialog(label: string): void {
  const dialog = host.querySelector('[role="alertdialog"]');
  expect(dialog).not.toBeNull();

  const button = [...(dialog?.querySelectorAll('button') ?? [])].find(
    (element) => element.textContent?.trim() === label,
  );
  expect(button).toBeDefined();

  act(() => {
    button?.click();
  });
}

const NAMES = ['Ada', 'Bo', 'Cy', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal'];

/**
 * Grow or shrink the roster of players to `count`, and give every row a name.
 *
 * Removal walks the confirm, because since 02-06 every removal asks first and a test that
 * clicked past the dialog would silently leave the count where it started.
 */
function setPlayerCount(count: number): void {
  while (nameInputs().length < count) {
    act(() => {
      buttonNamed('Add a player')?.click();
    });
  }

  while (nameInputs().length > count) {
    const removes = [...host.querySelectorAll<HTMLButtonElement>('button')].filter((element) =>
      element.textContent?.trim().startsWith('Remove '),
    );
    const last = removes.at(-1);
    if (last === undefined) throw new Error('no Remove button to shrink with');
    act(() => {
      last.click();
    });
    confirmDialog(last.textContent?.trim() ?? '');
  }

  nameInputs().forEach((input, index) => {
    type(input, NAMES[index] ?? `P${index + 1}`);
  });
}

function startButton(): HTMLButtonElement | null {
  return host.querySelector<HTMLButtonElement>('.feasibility-bar__start');
}

// ---------------------------------------------------------------------------
// The depth note — 05-UI-SPEC §Amendment 2
// ---------------------------------------------------------------------------

describe('the depth note', () => {
  /**
   * Amendment 2's whole point. The superseded sentence promised the tournament screens
   * were still to come, and this phase is those screens — a note that still said so would
   * be a contract the next reader trusts and that is false.
   */
  it('no longer promises the tournament screens are still to come', () => {
    mount();

    expect(host.textContent).not.toContain('Depth is recorded now.');
    expect(host.textContent).not.toContain(
      'Round robin and brackets arrive with the tournament screens.',
    );
  });

  it('says the night ends with the draft at Draft only', () => {
    mount();

    expect(tournamentNotes()).toContain(NOTE_DRAFT_ONLY);
    expect(tournamentNotes()).not.toContain(NOTE_DRAFT_AND_BRACKETS);
  });

  it('names the three stages and the absence of scores at Draft and brackets', () => {
    mount();
    pick('tournament-depth', 'draftAndBrackets');

    expect(tournamentNotes()).toContain(NOTE_DRAFT_AND_BRACKETS);
    expect(tournamentNotes()).not.toContain(NOTE_DRAFT_ONLY);
  });

  /**
   * D-01's specific difference, and the reason one sentence could not do this job: the
   * deepest tier differs from the middle one by a number per match, and the note is where
   * a host reads that before choosing.
   */
  it('names the number per match at Draft, brackets and match log', () => {
    mount();
    pick('tournament-depth', 'draftBracketsAndLog');

    expect(tournamentNotes()).toContain(NOTE_DRAFT_BRACKETS_AND_LOG);
    expect(tournamentNotes()).not.toContain(NOTE_DRAFT_AND_BRACKETS);
  });

  /**
   * Asserted by MOVING through all three rather than by three fresh mounts. A note keyed
   * on a value that was captured once and never re-read would pass every mount assertion
   * above and fail only here.
   */
  it('changes with the selection, across all three options', () => {
    mount();
    expect(tournamentNotes()).toContain(NOTE_DRAFT_ONLY);

    pick('tournament-depth', 'draftAndBrackets');
    expect(tournamentNotes()).toContain(NOTE_DRAFT_AND_BRACKETS);

    pick('tournament-depth', 'draftBracketsAndLog');
    expect(tournamentNotes()).toContain(NOTE_DRAFT_BRACKETS_AND_LOG);

    pick('tournament-depth', 'draftOnly');
    expect(tournamentNotes()).toContain(NOTE_DRAFT_ONLY);
  });
});

// ---------------------------------------------------------------------------
// The round-robin size line
// ---------------------------------------------------------------------------

describe('the round-robin size line', () => {
  it('is absent at Draft only, where there is no round robin', () => {
    mount();

    expect(sizeLine()).toBeNull();
  });

  /**
   * The arithmetic, pinned against a written-out figure. Eight players is the top of
   * PROJECT.md's default range and 28 is `8 × 7 / 2` — a screen that had drifted to
   * `p × (p − 1)` or to `p²/2` would still render a plausible sentence here.
   */
  it('reads 28 matches at 8 players', () => {
    mount();
    setPlayerCount(8);
    pick('tournament-depth', 'draftAndBrackets');

    expect(sizeLine()).toBe('A round robin at 8 players is 28 matches.');
  });

  /** An ODD count, so an implementation that integer-divided the wrong term is caught. */
  it('reads 10 matches at 5 players', () => {
    mount();
    setPlayerCount(5);
    pick('tournament-depth', 'draftAndBrackets');

    expect(sizeLine()).toBe('A round robin at 5 players is 10 matches.');
  });

  it('is the same fact at both deeper tiers', () => {
    mount();
    setPlayerCount(8);

    pick('tournament-depth', 'draftAndBrackets');
    expect(sizeLine()).toBe('A round robin at 8 players is 28 matches.');

    pick('tournament-depth', 'draftBracketsAndLog');
    expect(sizeLine()).toBe('A round robin at 8 players is 28 matches.');
  });

  /**
   * The plural helper, at the one count that needs it. Two players is a one-match round
   * robin, and `1 matches` is the visible grammar error `confirm-copy.ts` exists to
   * prevent — the same argument its `picks`/`players`/`bans` helpers were written for.
   */
  it('says one match, not 1 matches, at two players', () => {
    mount();
    setPlayerCount(2);
    pick('tournament-depth', 'draftAndBrackets');

    expect(sizeLine()).toBe('A round robin at 2 players is 1 match.');
  });

  /** It follows the player count without a second interaction. */
  it('recounts when a player is added', () => {
    mount();
    setPlayerCount(4);
    pick('tournament-depth', 'draftAndBrackets');
    expect(sizeLine()).toBe('A round robin at 4 players is 6 matches.');

    act(() => {
      buttonNamed('Add a player')?.click();
    });

    expect(sizeLine()).toBe('A round robin at 5 players is 10 matches.');
  });
});

// ---------------------------------------------------------------------------
// The three new controls
// ---------------------------------------------------------------------------

describe('the tournament controls', () => {
  it('offers the two metrics, with the accent the copy contract spells', () => {
    mount();

    const radios = radiosNamed('match-metric');
    expect(radios.map((radio) => radio.value)).toEqual(['pokemonLeft', 'koDifference']);
    expect(radios.map((radio) => labelFor(radio))).toEqual(['Pokémon left', 'KO difference']);
  });

  it('offers best of one and best of three at each stage', () => {
    mount();

    for (const group of ['round-robin-format', 'bracket-format']) {
      const radios = radiosNamed(group);
      expect(radios.map((radio) => radio.value)).toEqual(['bo1', 'bo3']);
      expect(radios.map((radio) => labelFor(radio))).toEqual(['Best of one', 'Best of three']);
    }
  });

  it('starts on the migration defaults, so a host who touches nothing matches a migrated document', () => {
    mount();

    expect(radiosNamed('match-metric').find((radio) => radio.checked)?.value).toBe('pokemonLeft');
    expect(radiosNamed('round-robin-format').find((radio) => radio.checked)?.value).toBe('bo1');
    expect(radiosNamed('bracket-format').find((radio) => radio.checked)?.value).toBe('bo1');
  });

  /**
   * `SegmentedControl`'s `name` doc block: two controls sharing one name merge into a
   * single radio group, and selecting in either deselects the other's. Three new controls
   * land on a screen that already carries five, so this is asserted rather than reviewed.
   */
  it('gives each control a radio-group name of its own', () => {
    mount();

    expect(radiosNamed('match-metric')).toHaveLength(2);
    expect(radiosNamed('round-robin-format')).toHaveLength(2);
    expect(radiosNamed('bracket-format')).toHaveLength(2);
  });

  /** The two stages are separately answerable — the whole reason D-08 is two fields. */
  it('keeps the two stage formats independent', () => {
    mount();
    pick('tournament-depth', 'draftBracketsAndLog');
    pick('bracket-format', 'bo3');

    expect(radiosNamed('bracket-format').find((radio) => radio.checked)?.value).toBe('bo3');
    expect(radiosNamed('round-robin-format').find((radio) => radio.checked)?.value).toBe('bo1');
  });
});

// ---------------------------------------------------------------------------
// Start draft — the one place a document is written
//
// Last in the file, deliberately: the store is a module singleton with no reset, so
// everything above runs against a screen that has never created a tournament.
// ---------------------------------------------------------------------------

describe('Start draft', () => {
  it('carries the metric and both stage formats into the document', () => {
    const onStarted = vi.fn();
    mount(onStarted);
    setPlayerCount(6);

    pick('tournament-depth', 'draftBracketsAndLog');
    pick('match-metric', 'koDifference');
    pick('round-robin-format', 'bo3');
    pick('bracket-format', 'bo3');

    act(() => {
      startButton()?.click();
    });

    expect(onStarted).toHaveBeenCalledTimes(1);

    const config = getDoc()?.config;
    expect(config?.depth).toBe('draftBracketsAndLog');
    expect(config?.matchMetric).toBe('koDifference');
    expect(config?.roundRobinFormat).toBe('bo3');
    expect(config?.bracketFormat).toBe('bo3');
  });

  /**
   * Written UNCONDITIONALLY, including at a depth that reads none of them. The screen does
   * not decide which fields a tier uses — that is a rule, and `05-UI-SPEC` §Pure-core
   * boundary says no component owns one — so a `draftOnly` document still records the
   * answers the host gave, exactly as it already records `swapRounds: 0`.
   */
  it('records the host answers even at Draft only', () => {
    mount();
    setPlayerCount(6);

    pick('tournament-depth', 'draftBracketsAndLog');
    pick('match-metric', 'koDifference');
    pick('round-robin-format', 'bo3');
    pick('tournament-depth', 'draftOnly');

    act(() => {
      startButton()?.click();
    });

    const config = getDoc()?.config;
    expect(config?.depth).toBe('draftOnly');
    expect(config?.matchMetric).toBe('koDifference');
    expect(config?.roundRobinFormat).toBe('bo3');
  });
});
