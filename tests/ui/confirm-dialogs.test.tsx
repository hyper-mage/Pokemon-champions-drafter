// @vitest-environment happy-dom

/**
 * One confirm in front of every destructive action — DRFT-13, D-36 through D-39.
 *
 * The single easiest way to ship a broken DRFT-13 is to gate the undo confirm on the
 * button. `TopBar` registers `Ctrl+Z` on `document`, which is a second entry point into
 * the same operation, and a confirm attached to the button leaves that path walking
 * straight past it. 02-RESEARCH files it as Pitfall 6. The test named for it below
 * dispatches a real `keydown` on `document` rather than calling a handler, because
 * dispatching on `document` is the only thing that proves the listener — which is on the
 * document rather than inside the `inert` shell — routes through the gate.
 *
 * The rest of the file pins the copy contract and the two ordering rules that make a
 * confirm safe: the confirming button is first in DOM order and the safe button second,
 * so the safe one is the last thing focus reaches and the last thing read; and Escape
 * maps to the safe outcome everywhere, because a reflexive Escape must never be the
 * click that destroys a draft.
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
        byRosterId: Object.fromEntries(
          entries.map((row) => [row.id, { pokeapiId: row.num, file: `${row.num}.png`, slug: row.id }]),
        ),
      },
    },
  };
});

vi.mock('../../src/adapters/roster-source', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/adapters/roster-source')>();
  return { ...actual, loadRoster: () => Promise.resolve(fixture.bundle) };
});

import { App } from '../../src/app';
import { save as saveTournament } from '../../src/adapters/persistence';
import { claimOwnership, CLAIM_WINDOW_MS, disposeTabLock } from '../../src/adapters/tab-lock';
import { draftStarted, pickMade, poolBuilt, type Action, type Intent } from '../../src/core/actions';
import { SCHEMA_VERSION, type TournamentConfig, type TournamentDoc } from '../../src/core/model';
import { selectPickCount } from '../../src/core/selectors';
import { getDoc, getState } from '../../src/store';
import {
  CHECKPOINT_DISMISS,
  CHECKPOINT_HEADING,
} from '../../src/ui/components/CheckpointPrompt';
import { announce } from '../../src/ui/components/LiveRegion';
import {
  ABANDON_CONFIRM,
  REMOVE_PLAYER_CONFIRM,
  REROLL_ORDER_CONFIRM,
  REROLL_POOL_CONFIRM,
  UNDO_BOUNDARY_CONFIRM,
} from '../../src/ui/confirm-copy';

// ---------------------------------------------------------------------------

const TOURNAMENT_KEY = 'champions-drafter:tournament';
const VIEW_KEY = 'champions-drafter:view';

let host: HTMLDivElement;

beforeEach(() => {
  localStorage.clear();
  // `announce` writes a module-level signal that outlives every render.
  announce('');
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(() => {
  render(null, host);
  host.remove();
  disposeTabLock();
  localStorage.clear();
});

function stamp(intent: Intent, seq: number): Action {
  return { ...intent, seq, at: 1_770_000_000_000 + seq, actorId: 'host' };
}

function configOf(playerCount: number): TournamentConfig {
  return {
    formatLabel: 'Champions MB',
    players: Array.from({ length: playerCount }, (_, index) => ({
      id: `p${index + 1}`,
      name: ['Ada', 'Bo', 'Cass', 'Dev'][index] ?? `Player ${index + 1}`,
    })),
    rounds: 6,
    rosterVersion: 'mb',
    rosterChecksum: 'test-checksum',
    poolSize: 30,
    bans: [],
    banMode: 'hostBanlist',
    megasRequiredPerTeam: 0,
    dualMegaChoices: [],
    depth: 'draftOnly',
    rules: [{ kind: 'mega', count: 0 }],
    megaFormeBans: [],
    swapBudget: 0,
    swapRounds: 0,
  };
}

function makeDoc(options: { players?: number; picks?: number; id?: string } = {}): TournamentDoc {
  const playerCount = options.players ?? 2;
  const pickCount = options.picks ?? 0;
  const config = configOf(playerCount);
  const order = config.players.map((player) => player.id);

  const log: Action[] = [
    stamp(
      poolBuilt(
        Array.from({ length: 30 }, (_, index) => `mon-${index}`),
        'mb',
        'test-checksum',
        29,
        0,
      ),
      0,
    ),
    stamp(draftStarted(order, 13), 1),
  ];

  for (let index = 0; index < pickCount; index += 1) {
    log.push(
      stamp(
        pickMade({
          playerId: order[index % playerCount] as string,
          monId: `mon-${index}`,
          round: Math.floor(index / playerCount) + 1,
          pickIndex: index,
        }),
        2 + index,
      ),
    );
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    id: options.id ?? 'confirm-dialogs-fixture',
    createdAt: 1_770_000_000_000,
    config,
    rng: { seed: 0x5f3a91c2, cursor: 0 },
    log,
  };
}

function seedSavedDraft(options: { players?: number; picks?: number } = {}): void {
  expect(saveTournament(makeDoc(options))).toBe(true);
}

/** Two players × six rounds, every slot filled — a tournament that has reached the milestone. */
function completedDoc(): TournamentDoc {
  return makeDoc({ players: 2, picks: 12, id: 'confirm-dialogs-second-fixture' });
}

function claimLock(): void {
  vi.useFakeTimers();
  claimOwnership();
  vi.advanceTimersByTime(CLAIM_WINDOW_MS);
  vi.useRealTimers();
}

async function mountApp(): Promise<void> {
  await act(async () => {
    render(<App />, host);
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

function buttonNamed(name: string): HTMLButtonElement | undefined {
  return Array.from(host.querySelectorAll('button')).find(
    (button) => (button.textContent ?? '').trim() === name,
  );
}

async function click(element: HTMLElement | undefined): Promise<void> {
  expect(element).toBeDefined();
  await act(async () => {
    element?.click();
    await Promise.resolve();
  });
}

function dialog(): HTMLElement | null {
  return host.querySelector('[role="alertdialog"]');
}

function dialogText(): string {
  return dialog()?.textContent ?? '';
}

/** The dialog's buttons, in DOM order. */
function dialogButtons(): HTMLButtonElement[] {
  return Array.from(dialog()?.querySelectorAll('button') ?? []);
}

/**
 * A button INSIDE the open dialog.
 *
 * Scoped rather than searched page-wide because the trigger and the confirming button
 * legitimately share a label: the copywriting contract gives `Abandon draft` to the top
 * bar control AND to the button that carries it out, which is correct — the host reads
 * the same verb both times. A page-wide lookup finds the trigger first and re-opens the
 * dialog instead of confirming it.
 */
function dialogButtonNamed(name: string): HTMLButtonElement | undefined {
  return dialogButtons().find((button) => (button.textContent ?? '').trim() === name);
}

async function pressCtrlZ(): Promise<void> {
  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }),
    );
    await Promise.resolve();
  });
}

/**
 * Escape, dispatched on the backdrop where `Dialog` listens for it.
 *
 * Not on `document`: `Dialog` binds `onKeyDown` to `.dialog-backdrop` and relies on focus
 * being trapped inside it, so a `document`-level dispatch would prove nothing about the
 * path a real keystroke takes.
 */
async function pressEscape(): Promise<void> {
  const backdrop = host.querySelector('.dialog-backdrop');
  expect(backdrop).not.toBeNull();

  await act(async () => {
    backdrop?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await Promise.resolve();
  });
}

async function reachDraft(options: { players?: number; picks?: number } = {}): Promise<void> {
  seedSavedDraft(options);
  claimLock();
  await mountApp();
  await click(buttonNamed('Resume saved draft'));
}

async function reachConfig(): Promise<void> {
  claimLock();
  await mountApp();
  await click(buttonNamed('New tournament'));
}

function pickCount(): number {
  const state = getState();
  return state === null ? -1 : selectPickCount(state);
}

/** Drive a real `change` on whichever file input the current screen renders. */
async function importFile(file: File): Promise<void> {
  const input = host.querySelector<HTMLInputElement>('input[type="file"]');
  expect(input).not.toBeNull();
  if (input === null) return;

  Object.defineProperty(input, 'files', { value: [file], configurable: true });

  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
    // `readJsonFile` awaits `file.text()`, so the flow spans two microtasks before the
    // document reaches the store.
    await Promise.resolve();
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

/** A second finished tournament, through the landing screen's `Import JSON…` door. */
async function importCompletedTournament(): Promise<void> {
  const doc = completedDoc();
  await importFile(
    new File([JSON.stringify(doc)], 'second.json', { type: 'application/json' }),
  );
}

/** Verbatim from `app.tsx`, which holds it as a module constant and does not export it. */
const IMPORT_WRONG_SHAPE =
  'That file is not a Champions Drafter tournament. Choose a .json file this app exported.';

/** Landing → config → every row named → Start. The route that creates a document. */
async function startAFreshTournament(): Promise<void> {
  await click(buttonNamed('New tournament'));

  const names = Array.from(host.querySelectorAll<HTMLInputElement>('.player-list__name'));
  expect(names.length).toBeGreaterThan(1);

  await act(async () => {
    names.forEach((input, index) => {
      input.value = `Player ${index + 1}`;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await Promise.resolve();
  });

  const start = host.querySelector<HTMLButtonElement>('.feasibility-bar__start');
  expect(start?.hasAttribute('aria-disabled')).toBe(false);
  await click(start ?? undefined);
}

// ---------------------------------------------------------------------------

describe('undo asks only when it reaches into an earlier round', () => {
  it('undoes a same-round pick with no dialog at all', async () => {
    // Two players, three picks: the draft is on round 2 and so is the last pick.
    await reachDraft({ picks: 3 });
    expect(pickCount()).toBe(3);

    await click(buttonNamed('Undo last pick'));

    expect(pickCount()).toBe(2);
    expect(host.querySelectorAll('[role="alertdialog"]')).toHaveLength(0);
  });

  it('asks before undoing a pick from the round just finished', async () => {
    await reachDraft({ picks: 2 });

    await click(buttonNamed('Undo last pick'));

    expect(host.querySelectorAll('[role="alertdialog"]')).toHaveLength(1);
    expect(dialogText()).toContain('pick from round 1, and the draft is currently on round 2.');
    // Nothing is committed until the confirming button is clicked.
    expect(pickCount()).toBe(2);
  });

  /**
   * PITFALL 6. This is the assertion the whole file exists for: the keyboard path and the
   * button path must be one path. A confirm wired to the button alone leaves `Ctrl+Z`
   * destroying a pick with no dialog at all — and it looks correct in every manual test
   * that uses the mouse.
   */
  it('asks on Ctrl+Z too, because the shortcut and the button are one path', async () => {
    await reachDraft({ picks: 2 });

    await pressCtrlZ();

    expect(host.querySelectorAll('[role="alertdialog"]')).toHaveLength(1);
    expect(pickCount()).toBe(2);

    await click(dialogButtonNamed(UNDO_BOUNDARY_CONFIRM.confirmLabel));

    expect(pickCount()).toBe(1);
    expect(host.querySelectorAll('[role="alertdialog"]')).toHaveLength(0);
  });

  it('keeps the pick when Escape closes the dialog', async () => {
    await reachDraft({ picks: 2 });
    await click(buttonNamed('Undo last pick'));

    await pressEscape();

    expect(host.querySelectorAll('[role="alertdialog"]')).toHaveLength(0);
    expect(pickCount()).toBe(2);
  });

  it('still ignores Ctrl+Z inside a text field', async () => {
    await reachDraft({ picks: 2 });

    const field = document.createElement('input');
    field.type = 'text';
    document.body.append(field);
    field.focus();

    await act(async () => {
      field.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }),
      );
      await Promise.resolve();
    });

    expect(host.querySelectorAll('[role="alertdialog"]')).toHaveLength(0);
    expect(pickCount()).toBe(2);

    field.remove();
  });

  it('names the player and both rounds in the body', async () => {
    await reachDraft({ picks: 2 });
    await click(buttonNamed('Undo last pick'));

    expect(dialogText()).toContain("Bo's pick from round 1");
    // The "picks made after it" clause is dormant while undo removes exactly one.
    expect(dialogText()).not.toContain('in total');
  });
});

describe('abandoning a draft', () => {
  it('asks first, and keeps everything when the safe button is clicked', async () => {
    await reachDraft({ picks: 3 });

    await click(buttonNamed('Abandon draft'));

    expect(dialogText()).toContain(
      'This discards 3 picks across 2 players. Nothing recovers it unless you have already downloaded the tournament JSON.',
    );

    await click(dialogButtonNamed(ABANDON_CONFIRM.safeLabel));

    expect(getDoc()).not.toBeNull();
    expect(pickCount()).toBe(3);
  });

  it('clears the store and the saved record, and leaves the view preferences alone', async () => {
    localStorage.setItem(VIEW_KEY, JSON.stringify({ density: 'full', pane: 'split' }));
    await reachDraft({ picks: 3 });

    await click(buttonNamed('Abandon draft'));
    await click(dialogButtonNamed(ABANDON_CONFIRM.confirmLabel));

    expect(getDoc()).toBeNull();
    expect(localStorage.getItem(TOURNAMENT_KEY)).toBeNull();
    // `clearSaved` removes one key by name. A density setting is not a casualty of
    // abandoning a draft.
    expect(localStorage.getItem(VIEW_KEY)).toBe(JSON.stringify({ density: 'full', pane: 'split' }));
  });

  it('is singular on both counts at one pick and one player', async () => {
    await reachDraft({ players: 1, picks: 1 });

    await click(buttonNamed('Abandon draft'));

    expect(dialogText()).toContain('This discards 1 pick across 1 player.');
  });

  /**
   * Abandon made a SESSION able to hold several tournaments, and the flags did not notice.
   *
   * `checkpointDismissed`'s comment argues for "the session", which was right when a
   * session held one tournament. It gates the completed-draft checkpoint — the phase's
   * only milestone surface — so a host who waved it away on tournament A and then finished
   * tournament B in the same session was never offered it for B, with nothing on screen to
   * explain the absence.
   */
  it('offers the completion checkpoint again for the next tournament', async () => {
    // Two players × six rounds: this document is already finished.
    await reachDraft({ players: 2, picks: 12 });
    expect(host.textContent).toContain(CHECKPOINT_HEADING);

    await click(buttonNamed(CHECKPOINT_DISMISS));
    expect(host.textContent).not.toContain(CHECKPOINT_HEADING);

    await click(buttonNamed('Abandon draft'));
    await click(dialogButtonNamed(ABANDON_CONFIRM.confirmLabel));
    expect(getDoc()).toBeNull();

    // A second, equally finished tournament, arriving through the landing screen's own
    // front door rather than through a state poke.
    await importCompletedTournament();

    expect(host.textContent).toContain(CHECKPOINT_HEADING);
  });

  it('drops the previous tournament’s import error on the way out', async () => {
    await reachDraft({ picks: 3 });

    await importFile(new File(['not json at all'], 'bad.json', { type: 'application/json' }));
    expect(host.textContent).toContain(IMPORT_WRONG_SHAPE);

    await click(buttonNamed('Abandon draft'));
    await click(dialogButtonNamed(ABANDON_CONFIRM.confirmLabel));

    // Configured and started rather than imported, deliberately: a successful import
    // clears the flag on its own, so it is the one route back to a draft that would hide
    // the defect this test is about.
    await startAFreshTournament();

    expect(host.querySelector('.draft-shell')).not.toBeNull();
    // An answer to a question asked about a draft that no longer exists.
    expect(host.textContent).not.toContain(IMPORT_WRONG_SHAPE);
  });
});

describe('the config screen confirms its three destructive actions', () => {
  it('asks before drawing a new pool, and draws nothing until confirmed', async () => {
    await reachConfig();

    const readoutBefore = host.querySelector('.config-screen__readout')?.textContent ?? '';

    await click(buttonNamed('Re-roll pool'));

    expect(host.querySelectorAll('[role="alertdialog"]')).toHaveLength(1);
    expect(dialogText()).toContain('The pool everyone has been looking at is discarded.');

    await click(dialogButtonNamed(REROLL_POOL_CONFIRM.safeLabel));

    expect(host.querySelectorAll('[role="alertdialog"]')).toHaveLength(0);
    expect(host.querySelector('.config-screen__readout')?.textContent ?? '').toBe(readoutBefore);
  });

  it('asks before rolling a new starting order', async () => {
    await reachConfig();

    await click(buttonNamed('Randomize order'));

    expect(host.querySelectorAll('[role="alertdialog"]')).toHaveLength(1);
    expect(dialogText()).toContain('The order on screen is discarded.');

    await click(dialogButtonNamed(REROLL_ORDER_CONFIRM.safeLabel));
    expect(host.querySelectorAll('[role="alertdialog"]')).toHaveLength(0);
  });

  it('asks before removing a player, and names them in every string', async () => {
    await reachConfig();

    const nameFields = Array.from(host.querySelectorAll<HTMLInputElement>('.player-list input'));
    expect(nameFields.length).toBeGreaterThan(1);

    await act(async () => {
      const field = nameFields[0] as HTMLInputElement;
      field.value = 'Ada';
      field.dispatchEvent(new Event('input', { bubbles: true }));
      await Promise.resolve();
    });

    await click(buttonNamed('Remove Ada'));

    expect(dialogText()).toContain('Remove Ada?');
    expect(dialogButtonNamed(REMOVE_PLAYER_CONFIRM.confirmLabel('Ada'))).toBeDefined();
    expect(dialogButtonNamed(REMOVE_PLAYER_CONFIRM.safeLabel('Ada'))).toBeDefined();
  });

  it('drops the re-numbering clause when nobody sits below the removed row', async () => {
    await reachConfig();

    const removeButtons = Array.from(host.querySelectorAll('button')).filter((button) =>
      (button.textContent ?? '').startsWith('Remove '),
    );
    expect(removeButtons.length).toBeGreaterThan(0);

    // The LAST row: rendering the literal template here would produce "re-numbers the
    // 0 players below them", which is not true and reads as a template that leaked.
    await click(removeButtons[removeButtons.length - 1]);

    expect(dialogText()).toContain('Their name is not kept.');
    expect(dialogText()).not.toContain('re-numbers');
  });
});

describe('every confirm follows the same two ordering rules', () => {
  it('puts the confirming button first and the safe button second, by DOM order', async () => {
    await reachDraft({ picks: 3 });
    await click(buttonNamed('Abandon draft'));

    const buttons = dialogButtons();
    // Asserted by position, not by label lookup — the point is the order, and a lookup
    // would pass whichever way round they were rendered.
    expect(buttons).toHaveLength(2);
    expect((buttons[0]?.textContent ?? '').trim()).toBe(ABANDON_CONFIRM.confirmLabel);
    expect((buttons[1]?.textContent ?? '').trim()).toBe(ABANDON_CONFIRM.safeLabel);
  });

  it('maps Escape to the safe outcome on the abandon dialog', async () => {
    await reachDraft({ picks: 3 });
    await click(buttonNamed('Abandon draft'));

    await pressEscape();

    expect(host.querySelectorAll('[role="alertdialog"]')).toHaveLength(0);
    expect(getDoc()).not.toBeNull();
  });

  it('maps Escape to the safe outcome on a config-screen dialog', async () => {
    await reachConfig();
    await click(buttonNamed('Randomize order'));

    await pressEscape();

    expect(host.querySelectorAll('[role="alertdialog"]')).toHaveLength(0);
  });
});

describe('picking is never confirmed', () => {
  it('opens no dialog when a pool cell is clicked', async () => {
    await reachDraft();

    const card = host.querySelector<HTMLElement>('.mon-card');
    await click(card ?? undefined);

    expect(pickCount()).toBe(1);
    expect(host.querySelectorAll('[role="alertdialog"]')).toHaveLength(0);
  });
});
