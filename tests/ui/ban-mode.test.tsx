// @vitest-environment happy-dom

/**
 * Ban mode, clearing the banlist, and where a missing Pokémon went — BAN-01, BAN-08, D-13.
 *
 * Three things, and each has a failure nobody would see in a screenshot.
 *
 * The mode control: an option that is not built must refuse the click AND say why inside its
 * own accessible name. An option that merely looked greyed would be selectable, and a host
 * would start a draft in a mode the build does not run.
 *
 * **Narrowed by 04-05, and emptied by 04-09.** This file was written when `blind` AND
 * `snake` were both refused. 04-05 built the snake stage; 04-09 built blind's locked state,
 * and **no ban mode is refused any more.** The rule the control still has to hold is the
 * mirror image of the original one — a mode the build DOES run must not read
 * `— Not yet available` on a stage that exists — so the cases below assert every member is
 * selectable and unsuffixed. `tests/ui/config-bans.test.tsx` owns the detail of each mode's
 * own controls; the two files must not both grow an opinion about the same option.
 *
 * The suffix mechanism itself is NOT dead and must not be deleted: `Re-ban` in the
 * duplicate-policy control still carries it, and that member is asserted in
 * `config-bans.test.tsx`.
 *
 * The confirm: its confirming button must come FIRST in DOM order, so the safe one is the
 * last thing focus reaches and the last thing read. That is asserted by POSITION, never by
 * label lookup — a label lookup passes just as happily on a dialog with the buttons the
 * wrong way round, which is exactly the defect the rule exists to prevent.
 *
 * The disclosure: its count must be the roster-intersected one. A hand-edited import
 * carrying a duplicate ban id or an id from a rotated regulation must not be able to make
 * the top bar disagree with the gate — which is what
 * `a duplicate and a stale ban id cannot make the top bar disagree with the gate` defends.
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Hoisted so both `vi.mock` factories below can see it — `vi.mock` lifts above imports. */
const fixture = vi.hoisted(() => {
  const entries = Array.from({ length: 40 }, (_, index) => ({
    id: `mon-${index}`,
    name: `Mon ${index}`,
    num: index + 1,
    types: ['Normal'],
    baseStats: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
    baseSpeciesId: `mon-${index}`,
    forme: null,
    megaCapable: false,
    megaFormes: [],
    spriteId: `mon-${index}`,
    spriteMissing: true,
  }));

  return {
    entries,
    bundle: {
      snapshot: {
        schemaVersion: 1,
        regulation: 'mb',
        validFrom: '2026-01-01',
        validUntil: '2026-12-31',
        upstreamRef: 'test',
        generatedAt: '2026-01-01T00:00:00Z',
        counts: {
          legalEntries: entries.length,
          draftable: entries.length,
          megaFormes: 0,
          baseSpecies: entries.length,
        },
        entries,
        checksum: 'test-checksum',
      },
      spriteMeta: {
        nativeWidth: 96,
        nativeHeight: 96,
        byRosterId: {},
      },
    },
  };
});

vi.mock('../../src/adapters/roster-source', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/adapters/roster-source')>();
  return { ...actual, loadRoster: () => Promise.resolve(fixture.bundle) };
});

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
      return 3000 + seedIndex;
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
import { App } from '../../src/app';
import { save as saveTournament } from '../../src/adapters/persistence';
import type { SpriteMeta } from '../../src/adapters/roster-source';
import { claimOwnership, CLAIM_WINDOW_MS, disposeTabLock } from '../../src/adapters/tab-lock';
import { draftStarted, poolBuilt, type Action, type Intent } from '../../src/core/actions';
import { SCHEMA_VERSION, type TournamentConfig, type TournamentDoc } from '../../src/core/model';
import type { RosterEntry, RosterSnapshot } from '../../src/core/roster/types';
import { getDoc } from '../../src/store';
import { announce, LiveRegion } from '../../src/ui/components/LiveRegion';
import { ConfigScreen } from '../../src/ui/screens/ConfigScreen';

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

let host: HTMLDivElement;

beforeEach(() => {
  localStorage.clear();
  // `announce` writes a module-level signal that outlives every render.
  announce('');
  edge.reset();
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(() => {
  render(null, host);
  host.remove();
  disposeTabLock();
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// The config screen
// ---------------------------------------------------------------------------

function mountScreen(onStarted: () => void = () => undefined): void {
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

function banModeInputs(): HTMLInputElement[] {
  return [...host.querySelectorAll<HTMLInputElement>('input[name="ban-mode"]')];
}

function labelFor(input: HTMLInputElement): string {
  return host.querySelector(`label[for="${input.id}"]`)?.textContent?.trim() ?? '';
}

function buttonNamed(name: string): HTMLButtonElement | null {
  return (
    [...host.querySelectorAll('button')].find(
      (element) => element.textContent?.trim() === name,
    ) ?? null
  );
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

function chips(): HTMLButtonElement[] {
  return [...bansGroup().querySelectorAll<HTMLButtonElement>('.ban-chip')];
}

function countLine(): string {
  return bansGroup().querySelector('.pool__count')?.textContent ?? '';
}

function dialog(): HTMLElement | null {
  return host.querySelector<HTMLElement>('[role="alertdialog"]');
}

/**
 * Escape, dispatched on the backdrop where `Dialog` listens for it.
 *
 * Not on `document`: `Dialog` binds its key handler to `.dialog-backdrop` and relies on
 * focus being trapped inside it, so a document-level dispatch would prove nothing about the
 * path a real keystroke takes. Same helper `confirm-dialogs.test.tsx` uses, same reason.
 */
function pressEscape(): void {
  const backdrop = host.querySelector('.dialog-backdrop');
  expect(backdrop).not.toBeNull();

  act(() => {
    backdrop?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
}

function cardFor(name: string): HTMLButtonElement {
  const card = [...bansGroup().querySelectorAll<HTMLButtonElement>('.mon-card')].find(
    (element) => element.querySelector('.mon-card__name')?.textContent === name,
  );
  if (card === undefined) throw new Error(`no cell for ${name}`);
  return card;
}

function banBySpecies(names: readonly string[]): void {
  for (const name of names) {
    act(() => {
      cardFor(name).click();
    });
  }
}

function nameInputs(): HTMLInputElement[] {
  return [...host.querySelectorAll<HTMLInputElement>('.player-list__name')];
}

function typeInto(input: HTMLInputElement, value: string): void {
  act(() => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('the ban mode control', () => {
  it('offers all three modes, with the host banlist selected', () => {
    mountScreen();

    const inputs = banModeInputs();
    expect(inputs).toHaveLength(3);
    expect(inputs.map((input) => input.value)).toEqual(['hostBanlist', 'blind', 'snake']);
    expect(inputs[0]?.checked).toBe(true);
  });

  /**
   * Every member is built, so every member is selectable — and the regression this guards
   * is now the mirror image of the one it was written for: a mode the build DOES run
   * reading `— Not yet available` on a stage that exists. Asserted across all three in one
   * loop, so re-disabling any of them fails here rather than only where that mode's own
   * controls are tested.
   */
  it('refuses none of them, now that all three stages are built', () => {
    mountScreen();

    for (const input of banModeInputs()) {
      expect(input.disabled).toBe(false);
      expect(input.hasAttribute('aria-disabled')).toBe(false);
      expect(labelFor(input).endsWith('— Not yet available')).toBe(false);
    }
  });

  it('names each mode as itself, with no suffix on any of them', () => {
    mountScreen();

    expect(banModeInputs().map((input) => labelFor(input))).toEqual([
      'Host banlist',
      'Blind',
      'Snake',
    ]);
  });

  it('leaves the selection alone when a refused option is clicked', () => {
    mountScreen();

    const [hostBanlist, blind] = banModeInputs();
    act(() => {
      host.querySelector<HTMLLabelElement>(`label[for="${blind?.id ?? ''}"]`)?.click();
    });

    expect(hostBanlist?.checked).toBe(true);
    expect(blind?.checked).toBe(false);
  });

  it('is a native radio group, not a hand-rolled one', () => {
    mountScreen();

    for (const input of banModeInputs()) {
      expect(input.type).toBe('radio');
      expect(input.hasAttribute('aria-checked')).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Clearing the banlist
// ---------------------------------------------------------------------------

describe('Clear the banlist', () => {
  it('is not on screen while there is nothing to clear', () => {
    mountScreen();

    expect(buttonNamed('Clear the banlist')).toBeNull();
  });

  it('clears nothing until the dialog is answered', () => {
    mountScreen();
    banBySpecies(['Pikachu']);

    act(() => {
      buttonNamed('Clear the banlist')?.click();
    });

    expect(host.querySelectorAll('[role="alertdialog"]')).toHaveLength(1);
    expect(chips()).toHaveLength(1);
  });

  it('counts what it is about to discard, singular at one', () => {
    mountScreen();
    banBySpecies(['Pikachu']);

    act(() => {
      buttonNamed('Clear the banlist')?.click();
    });

    expect(dialog()?.querySelector('p')?.textContent).toBe(
      'This clears all 1 ban at once. Every banned Pokémon returns to the pool.',
    );
  });

  it('counts what it is about to discard, plural at three', () => {
    mountScreen();
    banBySpecies(['Pikachu', 'Snorlax', 'Gengar']);

    act(() => {
      buttonNamed('Clear the banlist')?.click();
    });

    expect(dialog()?.querySelector('p')?.textContent).toBe(
      'This clears all 3 bans at once. Every banned Pokémon returns to the pool.',
    );
  });

  /** By POSITION inside the dialog's action region, never by label lookup. */
  it('puts the confirming button first and the safe one second', () => {
    mountScreen();
    banBySpecies(['Pikachu']);

    act(() => {
      buttonNamed('Clear the banlist')?.click();
    });

    const actions = [...(dialog()?.querySelectorAll('button.dialog__action') ?? [])];
    expect(actions).toHaveLength(2);
    expect(actions[0]?.textContent?.trim()).toBe('Clear the banlist');
    expect(actions[1]?.textContent?.trim()).toBe('Keep the bans');
  });

  it('leaves every ban in place on Escape', () => {
    mountScreen();
    banBySpecies(['Pikachu', 'Snorlax']);

    act(() => {
      buttonNamed('Clear the banlist')?.click();
    });
    pressEscape();

    // BOTH halves. The dialog closing is what proves Escape took the safe path rather than
    // doing nothing at all — an inert Escape would satisfy the chip count on its own.
    expect(dialog()).toBeNull();
    expect(chips()).toHaveLength(2);
  });

  it('empties the chips, the pressed cells and the count line when confirmed', () => {
    mountScreen();
    banBySpecies(['Pikachu', 'Snorlax']);
    expect(countLine()).toBe(`2 of ${ENTRIES.length} banned`);

    act(() => {
      buttonNamed('Clear the banlist')?.click();
    });
    act(() => {
      dialog()?.querySelector<HTMLButtonElement>('button.dialog__action')?.click();
    });

    expect(chips()).toHaveLength(0);
    expect(host.querySelectorAll('[aria-pressed="true"]')).toHaveLength(0);
    expect(countLine()).toBe(`0 of ${ENTRIES.length} banned`);
    expect(buttonNamed('Clear the banlist')).toBeNull();
  });
});

describe('starting a draft in host banlist mode', () => {
  it('records the mode the control is showing', () => {
    let started = false;
    mountScreen(() => {
      started = true;
    });

    const [first, second] = nameInputs();
    if (first !== undefined) typeInto(first, 'Ada');
    if (second !== undefined) typeInto(second, 'Bo');

    // Two rows named, four rendered — the other two are removed through their confirms.
    while (nameInputs().length > 2) {
      act(() => {
        [...host.querySelectorAll('button')]
          .filter((element) => element.textContent?.trim().startsWith('Remove '))
          .at(-1)
          ?.click();
      });
      act(() => {
        dialog()?.querySelector<HTMLButtonElement>('button.dialog__action')?.click();
      });
    }

    banBySpecies(['Pikachu']);

    act(() => {
      host.querySelector<HTMLButtonElement>('.feasibility-bar__start')?.click();
    });

    expect(started).toBe(true);
    expect(getDoc()?.config.banMode).toBe('hostBanlist');
    expect(getDoc()?.config.bans).toContain('pikachu');
  });
});

// ---------------------------------------------------------------------------
// The draft screen's disclosure — D-13
// ---------------------------------------------------------------------------

function stamp(intent: Intent, seq: number): Action {
  return { ...intent, seq, at: 1_770_000_000_000 + seq, actorId: 'host' };
}

function seedSavedDraft(bans: readonly string[]): void {
  const poolSize = 24;

  const config: TournamentConfig = {
    formatLabel: 'Champions MB',
    players: [
      { id: 'p1', name: 'Ada' },
      { id: 'p2', name: 'Bo' },
    ],
    rounds: 6,
    rosterVersion: 'mb',
    rosterChecksum: 'test-checksum',
    poolSize,
    bans: [...bans],
    banMode: 'hostBanlist',
    megasRequiredPerTeam: 0,
    dualMegaChoices: [],
    depth: 'draftOnly',
    rules: [{ kind: 'mega', count: 0 }],
    megaFormeBans: [],
    swapBudget: 0,
    swapRounds: 0,
    bansPerPlayer: 0,
    duplicateBanPolicy: 'bothApply',
  };

  const doc: TournamentDoc = {
    schemaVersion: SCHEMA_VERSION,
    id: 'ban-mode-fixture',
    createdAt: 1_770_000_000_000,
    config,
    rng: { seed: 0x5f3a91c2, cursor: 0 },
    log: [
      stamp(
        poolBuilt(
          Array.from({ length: poolSize }, (_, index) => `mon-${index}`),
          'mb',
          'test-checksum',
          poolSize - 1,
          0,
        ),
        0,
      ),
      stamp(draftStarted(['p1', 'p2'], 13), 1),
    ],
  };

  expect(saveTournament(doc)).toBe(true);
}

function claimLock(): void {
  vi.useFakeTimers();
  claimOwnership();
  vi.advanceTimersByTime(CLAIM_WINDOW_MS);
  vi.useRealTimers();
}

async function reachDraft(bans: readonly string[]): Promise<void> {
  seedSavedDraft(bans);
  claimLock();

  await act(async () => {
    render(<App />, host);
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });

  const resume = [...host.querySelectorAll('button')].find(
    (element) => element.textContent?.trim() === 'Resume saved draft',
  );
  await act(async () => {
    resume?.click();
    await Promise.resolve();
  });
}

function disclosure(): HTMLDetailsElement | null {
  return host.querySelector<HTMLDetailsElement>('details.top-bar__bans');
}

describe('the Bans disclosure on the draft screen', () => {
  it('names the count and lists the species in name order', async () => {
    await reachDraft(['mon-3', 'mon-1', 'mon-2']);

    expect(disclosure()?.querySelector('summary')?.textContent).toBe('Bans (3)');

    act(() => {
      disclosure()?.setAttribute('open', '');
    });

    const names = [...(disclosure()?.querySelectorAll('li') ?? [])].map(
      (item) => item.textContent ?? '',
    );
    expect(names).toEqual(['Mon 1', 'Mon 2', 'Mon 3']);
  });

  it('is not rendered at all when nothing is banned', async () => {
    await reachDraft([]);

    expect(host.querySelectorAll('details')).toHaveLength(0);
    expect(host.textContent).not.toContain('Bans (0)');
  });

  /**
   * The assertion this section exists for. A hand-edited import can carry a duplicate ban id
   * and an id from a regulation that has since rotated; neither may reach the count.
   */
  it('a duplicate and a stale ban id cannot make the top bar disagree with the gate', async () => {
    await reachDraft(['mon-5', 'mon-5', 'not-a-real-id']);

    expect(disclosure()?.querySelector('summary')?.textContent).toBe('Bans (1)');
  });

  it('is read-only: the disclosure holds no control', async () => {
    await reachDraft(['mon-1', 'mon-2']);

    act(() => {
      disclosure()?.setAttribute('open', '');
    });

    expect(disclosure()?.querySelectorAll('button')).toHaveLength(0);
    expect(disclosure()?.querySelectorAll('input')).toHaveLength(0);
  });
});
