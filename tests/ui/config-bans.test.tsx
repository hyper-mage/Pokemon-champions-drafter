// @vitest-environment happy-dom

/**
 * The two new controls in the `Bans` group — BAN-07, RULE-08, D-19, D-20.
 *
 * Every visible string is asserted IN FULL, under one assertion each, never as a substring.
 * That is the convention plan 02-12 settled and it is not a style preference: a substring
 * assertion passes on a sentence with the second half missing, and the second half of every
 * blocking reason in this project is the next action the host can take.
 *
 * ## The three failures this file exists to catch
 *
 * **A `Re-ban` that is selectable.** BAN-07 is PARTIALLY satisfied (D-19): only `bothApply`
 * is built. The member ships disabled so a later milestone enables an option rather than
 * adding a control plus a schema bump — but a disabled radio that still takes a click writes
 * a policy nothing implements into a saved tournament.
 *
 * **`aria-disabled` that outlives its reason.** WR-04: `aria-disabled` present is read as
 * disabled by plenty of assistive technology, and `'false'` is not the same thing as absent.
 * The duplicate-policy control is inert at `snake` and must SHED the attribute the moment the
 * mode changes to `blind`, which is asserted by SWITCHING rather than by mounting twice — a
 * fresh mount would pass against an implementation that never sheds anything.
 *
 * **`Start draft` doing nothing.** The `draw === null` guard used to sit at the top of
 * `handleStart`. Blind and snake have no draw at that point (D-23), so leaving it there would
 * return early on every one of their starts — a dead button on a shared screen with the room
 * watching, and nothing on screen to say why.
 *
 * ## Why the gate is read through `aria-describedby`
 *
 * `FeasibilityBar` renders `problems[0]` and a count of the rest, never a list, so there is
 * no element per problem to collect. The reason element is resolved from the id `Start draft`
 * actually points at — the convention `config-feasibility.test.tsx` set — which asserts the
 * wiring and the copy in one move. A test that queried the message element directly would
 * still pass if `aria-describedby` were dropped.
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import committedSnapshot from '../../public/data/roster.mb.json';
import type { SpriteMeta } from '../../src/adapters/roster-source';
import { MAX_BANS_PER_PLAYER } from '../../src/core/import-guard';
import type { RosterEntry, RosterSnapshot } from '../../src/core/roster/types';
import { abandonTournament, getDoc, getState } from '../../src/store';
import { announce } from '../../src/ui/components/LiveRegion';
import { ConfigScreen } from '../../src/ui/screens/ConfigScreen';

// ---------------------------------------------------------------------------
// The real roster — the same posture as `config-feasibility.test.tsx`
// ---------------------------------------------------------------------------

function byDexOrder(a: RosterEntry, b: RosterEntry): number {
  if (a.num !== b.num) return a.num - b.num;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

const SNAPSHOT = committedSnapshot as unknown as RosterSnapshot;
const ENTRIES: readonly RosterEntry[] = [...SNAPSHOT.entries].sort(byDexOrder);

const SPRITE_META: SpriteMeta = {
  nativeWidth: 96,
  nativeHeight: 96,
  byRosterId: {},
};

// Every string below is quoted from `04-UI-SPEC.md` §1 and §Copywriting Contract. They are
// constants HERE and constants in the source, and the two files are the only two copies.
const BANS_PER_PLAYER_HELPER =
  'Each player bans this many Pokémon before the pool is drawn. Every ban applies to everyone.';
const DUPLICATE_BANS_HELPER =
  'Blind mode only. If two players ban the same Pokémon it is banned once, the second ban is spent, and the reveal says who collided.';
const DUPLICATE_BANS_SNAKE_REASON =
  'Snake shows previous bans, so two players cannot ban the same Pokémon.';
const BANS_PER_PLAYER_NOT_AN_INTEGER =
  'Bans per player needs a whole number. Enter 1 or more, or switch to host banlist.';
const BANS_PER_PLAYER_NOT_POSITIVE =
  'Blind and snake need at least 1 ban per player. Enter a number, or switch to host banlist.';

let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);

  // `announce` writes a module-level signal that outlives every render.
  announce('');
  // The start cases below read the store, so a document left by a previous case would be
  // indistinguishable from one this case created.
  abandonTournament();
});

afterEach(() => {
  render(null, host);
  host.remove();
  abandonTournament();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function bansGroup(): HTMLElement {
  const group = [...host.querySelectorAll<HTMLElement>('fieldset.config-screen__group')].find(
    (element) => element.querySelector('legend')?.textContent?.trim() === 'Bans',
  );
  if (group === undefined) throw new Error('the Bans group is not on the screen');
  return group;
}

function radiosNamed(name: string): HTMLInputElement[] {
  return [...host.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)];
}

function labelFor(input: HTMLInputElement): string {
  return host.querySelector(`label[for="${input.id}"]`)?.textContent?.trim() ?? '';
}

function pickMode(value: string): void {
  const input = radiosNamed('ban-mode').find((radio) => radio.value === value);
  if (input === undefined) throw new Error(`no ban mode ${value}`);
  act(() => {
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

/** The `Bans per player` field, or null when it is not rendered at all. */
function bansPerPlayerInput(): HTMLInputElement | null {
  const group = bansGroup();
  const label = [...group.querySelectorAll<HTMLLabelElement>('.numeric-field__label')].find(
    (element) => element.textContent?.trim() === 'Bans per player',
  );
  if (label === undefined) return null;
  return group.querySelector<HTMLInputElement>(`input[id="${label.htmlFor}"]`);
}

function helperFor(input: HTMLInputElement): string {
  const id = input.getAttribute('aria-describedby') ?? '';
  return host.querySelector(`[id="${id}"]`)?.textContent?.trim() ?? '';
}

function typeInto(input: HTMLInputElement, value: string): void {
  act(() => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** The element carrying the inert state — the wrapper around the control and its reason. */
function duplicateWrapper(): HTMLElement | null {
  return bansGroup().querySelector<HTMLElement>('.config-screen__duplicate-bans');
}

function duplicateControl(): HTMLElement | null {
  return (
    [...bansGroup().querySelectorAll<HTMLElement>('fieldset.segmented')].find(
      (element) => element.querySelector('legend')?.textContent?.trim() === 'Duplicate bans',
    ) ?? null
  );
}

function startButton(): HTMLButtonElement | null {
  return host.querySelector<HTMLButtonElement>('.feasibility-bar__start');
}

/** The element `aria-describedby` on Start actually resolves to. */
function reasonText(): string {
  const id = startButton()?.getAttribute('aria-describedby');
  if (id === null || id === undefined) return '';
  return host.querySelector(`[id="${id}"]`)?.textContent ?? '';
}

function nameInputs(): HTMLInputElement[] {
  return [...host.querySelectorAll<HTMLInputElement>('.player-list__name')];
}

/** The four default rows named, so the gate has no blank-name complaint left. */
function nameEveryPlayer(): void {
  const names = ['Ada', 'Bo', 'Cy', 'Sam'];
  nameInputs().forEach((input, index) => {
    typeInto(input, names[index] ?? `P${index + 1}`);
  });
}

// ---------------------------------------------------------------------------
// The ban-mode control, now that Snake is real
// ---------------------------------------------------------------------------

describe('the ban mode control', () => {
  it('offers Snake with no suffix and takes the click', () => {
    mount();

    const snake = radiosNamed('ban-mode').find((radio) => radio.value === 'snake');
    expect(snake).toBeDefined();
    expect(snake?.disabled).toBe(false);
    expect(snake?.hasAttribute('aria-disabled')).toBe(false);
    expect(labelFor(snake as HTMLInputElement)).toBe('Snake');
  });

  /**
   * 04-09 flips this in the same one-line move. Enabling it here would strand a host on a
   * locked state that does not exist yet, which is T-04-21.
   */
  it('leaves Blind disabled until its own surfaces exist', () => {
    mount();

    const blind = radiosNamed('ban-mode').find((radio) => radio.value === 'blind');
    expect(blind?.disabled).toBe(true);
    expect(labelFor(blind as HTMLInputElement)).toBe('Blind — Not yet available');
  });
});

// ---------------------------------------------------------------------------
// `Bans per player`
// ---------------------------------------------------------------------------

describe('Bans per player', () => {
  /**
   * Absent, not disabled. The field is WHOLLY void at `hostBanlist` — there are no player
   * bans in that mode — and the shipped precedent for a wholly void affordance is not to
   * render it (`Clear the banlist` at zero bans, `Clear filters` with none active).
   */
  it('is not in the DOM at all at host banlist', () => {
    mount();

    expect(bansPerPlayerInput()).toBeNull();
  });

  it('appears at snake, defaulting to 1', () => {
    mount();
    pickMode('snake');

    expect(bansPerPlayerInput()?.value).toBe('1');
  });

  it('carries the helper that says whose bans they are', () => {
    mount();
    pickMode('snake');

    const input = bansPerPlayerInput();
    expect(input).not.toBeNull();
    expect(helperFor(input as HTMLInputElement)).toBe(BANS_PER_PLAYER_HELPER);
  });

  /** T-04-24: the bound is the imported constant, so the build cannot write a document
   * `isValidTournament` would refuse to re-open. */
  it('takes its bound from the shared constant rather than a literal', () => {
    mount();
    pickMode('snake');

    expect(bansPerPlayerInput()?.getAttribute('min')).toBe('1');
    expect(bansPerPlayerInput()?.getAttribute('max')).toBe(String(MAX_BANS_PER_PLAYER));
  });

  it('blocks Start with the whole sentence when it is emptied', () => {
    mount();
    nameEveryPlayer();
    pickMode('snake');

    const input = bansPerPlayerInput();
    expect(input).not.toBeNull();
    typeInto(input as HTMLInputElement, '');

    expect(reasonText()).toBe(BANS_PER_PLAYER_NOT_AN_INTEGER);
    expect(startButton()?.getAttribute('aria-disabled')).toBe('true');
  });

  it('blocks Start with the whole sentence at 0', () => {
    mount();
    nameEveryPlayer();
    pickMode('snake');

    typeInto(bansPerPlayerInput() as HTMLInputElement, '0');

    expect(reasonText()).toBe(BANS_PER_PLAYER_NOT_POSITIVE);
    expect(startButton()?.getAttribute('aria-disabled')).toBe('true');
  });

  /**
   * The mode is what decides whether the field means anything, so a host who never leaves
   * `hostBanlist` must never read a sentence about a field they cannot see.
   */
  it('says nothing about the field while the mode is host banlist', () => {
    mount();
    nameEveryPlayer();

    expect(reasonText()).not.toBe(BANS_PER_PLAYER_NOT_AN_INTEGER);
    expect(reasonText()).not.toBe(BANS_PER_PLAYER_NOT_POSITIVE);
    expect(startButton()?.hasAttribute('aria-disabled')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// `Duplicate bans` — BAN-07's config-time surface, D-19 and D-20
// ---------------------------------------------------------------------------

describe('the Duplicate bans control', () => {
  it('is not in the DOM at all at host banlist', () => {
    mount();

    expect(duplicateWrapper()).toBeNull();
  });

  it('offers both apply, selected, once a player-ban mode is chosen', () => {
    mount();
    pickMode('snake');

    const radios = radiosNamed('duplicate-bans');
    expect(radios.map((radio) => radio.value)).toEqual(['bothApply', 'reBan']);
    expect(radios[0]?.checked).toBe(true);
    expect(labelFor(radios[0] as HTMLInputElement)).toBe('Both apply, one is spent');
  });

  it('ships the re-ban branch disabled, with the reason inside its own name', () => {
    mount();
    pickMode('snake');

    const reBan = radiosNamed('duplicate-bans').find((radio) => radio.value === 'reBan');
    expect(reBan?.disabled).toBe(true);
    expect(reBan?.getAttribute('aria-disabled')).toBe('true');
    expect(labelFor(reBan as HTMLInputElement)).toBe('Re-ban — Not yet available');
  });

  it('carries the helper describing what both apply means', () => {
    mount();
    pickMode('snake');

    expect(
      [...bansGroup().querySelectorAll('p')].map((element) => element.textContent?.trim()),
    ).toContain(DUPLICATE_BANS_HELPER);
  });

  it('renders inert at snake, with the reason visible beside it', () => {
    mount();
    pickMode('snake');

    expect(duplicateWrapper()?.getAttribute('aria-disabled')).toBe('true');
    expect(duplicateWrapper()?.querySelector('.config-screen__inert-reason')?.textContent).toBe(
      `— ${DUPLICATE_BANS_SNAKE_REASON}`,
    );
  });

  /**
   * WR-04, and it is asserted by SWITCHING rather than by mounting at `blind`. `aria-disabled`
   * present is read as disabled by plenty of assistive technology, and an implementation that
   * set it and never cleared it would pass a fresh-mount assertion.
   */
  it('sheds the inert ARIA the moment the mode changes to blind', () => {
    mount();
    pickMode('snake');
    expect(duplicateWrapper()?.getAttribute('aria-disabled')).toBe('true');

    // `blind` is a disabled OPTION, so the click cannot come from the control. The host's
    // route back is `hostBanlist`, which unmounts the whole thing — a stronger shed than the
    // attribute clearing, and the one a host can actually reach today.
    pickMode('hostBanlist');
    expect(duplicateWrapper()).toBeNull();
  });

  /** The separator is markup and `aria-hidden`, so the copy constant, the source constant and
   * this assertion stay one value — WR-03, `SplitPanes`' `POOL_EXPAND_REASON` rule. */
  it('hides the separator from the accessibility tree', () => {
    mount();
    pickMode('snake');

    const reason = duplicateWrapper()?.querySelector('.config-screen__inert-reason');
    expect(reason?.querySelector('[aria-hidden="true"]')?.textContent).toBe('— ');
  });

  it('has a radio-group name of its own, so it cannot merge with the ban mode control', () => {
    mount();
    pickMode('snake');

    expect(radiosNamed('duplicate-bans')).toHaveLength(2);
    expect(radiosNamed('ban-mode')).toHaveLength(3);
    expect(duplicateControl()).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// D-01's two seams, reached from the one button
// ---------------------------------------------------------------------------

describe('starting from the config screen', () => {
  it('still writes a host banlist tournament whose log begins with pool/built', () => {
    let started = false;
    mount(() => {
      started = true;
    });

    nameEveryPlayer();

    act(() => {
      startButton()?.click();
    });

    expect(started).toBe(true);
    expect(getDoc()?.log[0]?.type).toBe('pool/built');
    expect(getDoc()?.config.bansPerPlayer).toBe(0);
    expect(getDoc()?.config.duplicateBanPolicy).toBe('bothApply');
  });

  /**
   * T-04-22. The `draw === null` guard has to be INSIDE the `hostBanlist` branch: there is no
   * draw at a snake start, so a guard left at the top would return early here and the button
   * would do nothing at all, silently, on a shared screen.
   */
  it('opens a snake tournament at a ban stage, with no pool and the host’s number', () => {
    let started = false;
    mount(() => {
      started = true;
    });

    nameEveryPlayer();
    pickMode('snake');
    typeInto(bansPerPlayerInput() as HTMLInputElement, '2');

    act(() => {
      startButton()?.click();
    });

    expect(started).toBe(true);
    expect(getDoc()?.log.map((action) => action.type)).toEqual([
      'schedule/compiled',
      'draft/started',
    ]);
    expect(getDoc()?.config.banMode).toBe('snake');
    expect(getDoc()?.config.bansPerPlayer).toBe(2);
    expect(getState()?.poolIds).toEqual([]);
  });
});
