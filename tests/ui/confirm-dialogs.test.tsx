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
import {
  bansPlaced,
  bansRevealed,
  bansSubmitted,
  cardsPlayed,
  draftStarted,
  orderResolved,
  pickMade,
  poolBuilt,
  scheduleCompiled,
  swapMade,
  swapPassed,
  type Action,
  type Intent,
  type RoundSpec,
} from '../../src/core/actions';
import { SCHEMA_VERSION, type TournamentConfig, type TournamentDoc } from '../../src/core/model';
import { selectPhase, selectPickCount } from '../../src/core/selectors';
import { abandonTournament, adoptTournament, getDoc, getState, undo } from '../../src/store';
import {
  CHECKPOINT_DISMISS,
  CHECKPOINT_HEADING,
} from '../../src/ui/components/CheckpointPrompt';
import { ConfirmDialog } from '../../src/ui/components/ConfirmDialog';
import { LiveRegion, announce } from '../../src/ui/components/LiveRegion';
import {
  ABANDON_BAN_STAGE_CONFIRM,
  ABANDON_CONFIRM,
  REMOVE_PLAYER_CONFIRM,
  REROLL_ORDER_CONFIRM,
  REROLL_POOL_CONFIRM,
  UNDO_BAN_SUBMISSION_CONFIRM,
  UNDO_BOUNDARY_CONFIRM,
  UNDO_RESOLVED_ORDER_CONFIRM,
  UNDO_REVEAL_CONFIRM,
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
    bansPerPlayer: 0,
    duplicateBanPolicy: 'bothApply',
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

/**
 * A v3 draft that has bid and resolved round 1 — the document the D-20 confirm needs.
 *
 * `makeDoc` above deliberately writes a schema-2-shaped log with no `schedule/compiled`,
 * which `selectDealsCards` reads as "this tournament deals no cards" and which therefore
 * can never reach a resolved pick order. This is the other document, not a replacement.
 *
 * The two card values differ because CARD-04 forbids repeating a value inside one round.
 */
function makeResolvedCardDoc(): TournamentDoc {
  const config = configOf(2);
  const order = config.players.map((player) => player.id);
  const schedule: RoundSpec[] = Array.from({ length: config.rounds }, (_, position) => ({
    index: position + 1,
    kind: 'open' as const,
  }));

  const log: Action[] = [];
  const push = (intent: Intent): void => {
    log.push(stamp(intent, log.length));
  };

  push(
    poolBuilt(
      Array.from({ length: 30 }, (_, index) => `mon-${index}`),
      'mb',
      'test-checksum',
      29,
      0,
    ),
  );
  push(scheduleCompiled(schedule));
  push(draftStarted(order, 13));

  // Round 1's cards, in play order, then the resolution the last one triggers.
  push(cardsPlayed({ playerId: order[0] as string, value: 4, round: 1 }));
  push(cardsPlayed({ playerId: order[1] as string, value: 2, round: 1 }));
  push(orderResolved(1, [order[1] as string, order[0] as string]));

  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'confirm-dialogs-cards-fixture',
    createdAt: 1_770_000_000_000,
    config,
    rng: { seed: 0x5f3a91c2, cursor: 0 },
    log,
  };
}

async function reachResolvedOrder(): Promise<void> {
  expect(saveTournament(makeResolvedCardDoc())).toBe(true);
  claimLock();
  await mountApp();
  await click(buttonNamed('Resume saved draft'));
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

    await click(buttonNamed('Undo last move'));

    expect(pickCount()).toBe(2);
    expect(host.querySelectorAll('[role="alertdialog"]')).toHaveLength(0);
  });

  it('asks before undoing a pick from the round just finished', async () => {
    await reachDraft({ picks: 2 });

    await click(buttonNamed('Undo last move'));

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
    await click(buttonNamed('Undo last move'));

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
    await click(buttonNamed('Undo last move'));

    expect(dialogText()).toContain("Bo's pick from round 1");
    // The "picks made after it" clause is dormant while undo removes exactly one.
    expect(dialogText()).not.toContain('in total');
  });
});

// ---------------------------------------------------------------------------
// Undoing back across a resolved pick order — D-20, 03-UI-SPEC §12
// ---------------------------------------------------------------------------

describe('undoing back across a resolved pick order', () => {
  it('says `Undo last move`, because the button now removes more than picks', async () => {
    // Amendment 2. A control labelled `Undo last pick` that removes a priority card is
    // wrong on a screen somebody reads aloud to the table.
    await reachResolvedOrder();

    expect(buttonNamed('Undo last move')).toBeDefined();
    expect(buttonNamed('Undo last pick')).toBeUndefined();
  });

  it('asks first, even though the draft has not left the round', async () => {
    await reachResolvedOrder();

    await click(buttonNamed('Undo last move'));

    expect(host.querySelectorAll('[role="alertdialog"]')).toHaveLength(1);
    expect(dialogText()).toContain("This un-resolves round 1's pick order");
  });

  it('states whose card comes back, and that it is two steps rather than one', async () => {
    await reachResolvedOrder();
    await click(buttonNamed('Undo last move'));

    // Bo played the 2 that completed the round, so Bo's 2 is what returns.
    expect(dialogText()).toContain("takes Bo's 2 back into their hand — 2 steps in total.");
    expect(dialogText()).toContain('The order everyone just read changes.');
  });

  it('uses its own labels rather than the earlier-round set', async () => {
    await reachResolvedOrder();
    await click(buttonNamed('Undo last move'));

    expect(dialogButtonNamed(UNDO_RESOLVED_ORDER_CONFIRM.confirmLabel)).toBeDefined();
    expect(dialogButtonNamed(UNDO_RESOLVED_ORDER_CONFIRM.safeLabel)).toBeDefined();
    expect(dialogButtonNamed(UNDO_BOUNDARY_CONFIRM.confirmLabel)).toBeUndefined();
  });

  it('puts the round back into the card phase when confirmed', async () => {
    await reachResolvedOrder();
    expect(selectPhase(getState() as never)).toBe('picking');

    await click(buttonNamed('Undo last move'));
    await click(dialogButtonNamed(UNDO_RESOLVED_ORDER_CONFIRM.confirmLabel));

    // Both entries went, so the app is bidding again rather than re-resolving on the spot.
    expect(selectPhase(getState() as never)).toBe('cards');
    expect(host.querySelector('.card-panel')).not.toBeNull();
    expect(host.querySelectorAll('[role="alertdialog"]')).toHaveLength(0);
  });

  it('changes nothing when the safe button is pressed', async () => {
    await reachResolvedOrder();
    const before = JSON.stringify(getDoc());

    await click(buttonNamed('Undo last move'));
    await click(dialogButtonNamed(UNDO_RESOLVED_ORDER_CONFIRM.safeLabel));

    expect(JSON.stringify(getDoc())).toBe(before);
    expect(selectPhase(getState() as never)).toBe('picking');
  });

  it('asks on Ctrl+Z too, because the shortcut and the button are one path', async () => {
    await reachResolvedOrder();

    await pressCtrlZ();

    expect(host.querySelectorAll('[role="alertdialog"]')).toHaveLength(1);
    expect(dialogText()).toContain('un-resolves');
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

// ---------------------------------------------------------------------------
// What the live region says an undo just did — T-04-30, and 04-RESEARCH Pitfall 1.
//
// The live region is the phase's ONLY non-visual leak path. It is audible in the room and
// it persists in the accessibility tree after the render that wrote it is gone, so the
// full-screen visual shield does not cover it. Before 04-07 `undoAnnouncement` was a chain
// of `if` arms ending in an UNGUARDED return that interpolated a species name, reached by
// anything that was not `card | order | swap | pass` — so a new `UndoRemoval.kind` with no
// arm announced the species a host had just privately removed, and did it while
// compiling, type-checking and passing every existing test.
//
// These tests drive `undo` against the store directly rather than through the ban screens.
// The announcement is a property of the store, the screens for the blind stage land in
// later plans, and a test that needed them would be testing something else.
// ---------------------------------------------------------------------------

const BAN_PLAYERS = ['p1', 'p2', 'p3'];

const BLIND_ALLOTMENTS: Record<string, string[]> = {
  p1: ['mon-0', 'mon-1'],
  p2: ['mon-2', 'mon-3'],
  p3: ['mon-4', 'mon-5'],
};

/** Every display name in the fixture roster — the whole list, not one specimen. */
const ROSTER_NAMES = fixture.bundle.snapshot.entries.map((entry) => entry.name);

/** What the app hands `undo`: the roster lookup the store deliberately does not hold. */
function resolveFixtureName(monId: string): string {
  return ROSTER_NAMES[Number(monId.replace('mon-', ''))] ?? monId;
}

function banConfig(banMode: 'blind' | 'snake'): TournamentConfig {
  return { ...configOf(3), banMode, bansPerPlayer: 2 };
}

function makeStageDoc(config: TournamentConfig, build: (push: (intent: Intent) => void) => void): TournamentDoc {
  const log: Action[] = [];
  const push = (intent: Intent): void => {
    log.push(stamp(intent, log.length));
  };
  build(push);

  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'announcement-fixture',
    createdAt: 1_770_000_000_000,
    config,
    rng: { seed: 0x5f3a91c2, cursor: 0 },
    log,
  };
}

const OPEN_SCHEDULE: RoundSpec[] = Array.from({ length: 6 }, (_, position) => ({
  index: position + 1,
  kind: 'open' as const,
}));

/** D-11's opening for blind and snake: schedule, then start, and NO pool. */
function banStageDoc(
  banMode: 'blind' | 'snake',
  build: (push: (intent: Intent) => void) => void,
): TournamentDoc {
  return makeStageDoc(banConfig(banMode), (push) => {
    push(scheduleCompiled(OPEN_SCHEDULE));
    push(draftStarted(BAN_PLAYERS, 13));
    build(push);
  });
}

function draftDoc(build: (push: (intent: Intent) => void) => void): TournamentDoc {
  const config: TournamentConfig = { ...configOf(2), swapBudget: 1, swapRounds: 1 };

  return makeStageDoc(config, (push) => {
    push(
      poolBuilt(
        Array.from({ length: 30 }, (_, index) => `mon-${index}`),
        'mb',
        'test-checksum',
        29,
        0,
      ),
    );
    push(scheduleCompiled(OPEN_SCHEDULE));
    push(draftStarted(['p1', 'p2'], 13));
    build(push);
  });
}

function liveRegionText(): string {
  return host.querySelector('[aria-live="polite"]')?.textContent ?? '';
}

/**
 * Adopt `doc`, undo its last move, and hand back what the room heard.
 *
 * `LiveRegion` is mounted alone rather than through `App`, because the announcement is the
 * subject and a whole app around it would only add ways for the test to fail for another
 * reason.
 */
async function undoAndHear(
  doc: TournamentDoc,
  resolve: (monId: string) => string = resolveFixtureName,
): Promise<string> {
  claimLock();
  await act(async () => {
    render(<LiveRegion />, host);
    await Promise.resolve();
  });

  expect(adoptTournament(doc)).toBe(true);

  await act(async () => {
    expect(undo(resolve)).toBe(true);
    await Promise.resolve();
  });

  return liveRegionText();
}

describe('the five announcements that shipped before the ban stage', () => {
  // Pinned as literals, read out of `store.ts` before the switch replaced the `if` chain.
  // The rewrite must be a refactor rather than a rewording: these are what the room has
  // been hearing since Phase 1, and a silent change to any of them would be the kind of
  // regression only somebody in the room would notice.
  afterEach(() => {
    abandonTournament();
  });

  it('names the species a pick returned to the pool', async () => {
    const doc = draftDoc((push) => {
      push(pickMade({ playerId: 'p1', monId: 'mon-7', round: 1, pickIndex: 0 }));
    });

    expect(await undoAndHear(doc)).toBe('Undid Round 1 — Mon 7 is back in the pool.');
  });

  it('names the value a card play returned to a hand', async () => {
    const doc = draftDoc((push) => {
      push(cardsPlayed({ playerId: 'p1', value: 4, round: 1 }));
    });

    expect(await undoAndHear(doc)).toBe("Undid Ada's card — 4 is back in their hand.");
  });

  it('names the round a resolved pick order belonged to', async () => {
    const doc = draftDoc((push) => {
      push(cardsPlayed({ playerId: 'p1', value: 4, round: 1 }));
      push(cardsPlayed({ playerId: 'p2', value: 2, round: 1 }));
      push(orderResolved(1, ['p2', 'p1']));
    });

    expect(await undoAndHear(doc)).toBe(
      "Undid round 1's pick order — Bo's 2 is back in their hand.",
    );
  });

  it('names both directions of a swap', async () => {
    const doc = draftDoc((push) => {
      push(pickMade({ playerId: 'p1', monId: 'mon-0', round: 1, pickIndex: 0 }));
      push(
        swapMade({
          playerId: 'p1',
          round: 1,
          outMonId: 'mon-0',
          inMonId: 'mon-5',
          swapRound: 0,
        }),
      );
    });

    expect(await undoAndHear(doc)).toBe(
      "Undid the swap — Mon 5 is back in the pool and Mon 0 returns to Ada's round 1 slot.",
    );
  });

  it('names the swap round a pass belonged to', async () => {
    const doc = draftDoc((push) => {
      push(swapPassed({ playerId: 'p2', swapRound: 1 }));
    });

    expect(await undoAndHear(doc)).toBe("Undid Bo's pass in swap round 1.");
  });
});

describe('an undone ban never puts a species name into the room', () => {
  afterEach(() => {
    abandonTournament();
  });

  it('reports a removed blind submission by player and by count', async () => {
    // 04-UI-SPEC §The Live-Region Contract, verbatim. `{n}` is the count AFTER the
    // removal, which is what the locked screen now reads.
    const doc = banStageDoc('blind', (push) => {
      for (const playerId of BAN_PLAYERS) {
        push(bansSubmitted(playerId, BLIND_ALLOTMENTS[playerId] as string[]));
      }
    });

    expect(await undoAndHear(doc)).toBe("Cass's bans were removed. 2 of 3 entered.");
  });

  it('names NONE of the roster when a blind submission comes off', async () => {
    // The load-bearing assertion, and it is a negative one against the WHOLE fixture
    // rather than against one specimen: a guard that happens to miss one name is not a
    // guard. D-05 forbids re-displaying a removed submission, and the live region is the
    // channel the visual shield does not cover.
    const doc = banStageDoc('blind', (push) => {
      for (const playerId of BAN_PLAYERS) {
        push(bansSubmitted(playerId, BLIND_ALLOTMENTS[playerId] as string[]));
      }
    });

    const heard = await undoAndHear(doc);

    for (const name of ROSTER_NAMES) {
      expect(heard, `announced "${heard}"`).not.toContain(name);
    }
  });

  it('never asks the roster for a name when a ban comes off', async () => {
    // Structural rather than observational. `resolveSpeciesName` is the only route from
    // an id to a display name inside the store, so a resolver that is never called cannot
    // have leaked one — this holds even for a future arm whose copy nobody has read.
    const resolve = vi.fn(resolveFixtureName);

    const doc = banStageDoc('blind', (push) => {
      push(bansSubmitted('p1', BLIND_ALLOTMENTS['p1'] as string[]));
    });

    await undoAndHear(doc, resolve);

    expect(resolve).not.toHaveBeenCalled();
  });

  it('says the reveal came off without naming what it revealed', async () => {
    const doc = banStageDoc('blind', (push) => {
      for (const playerId of BAN_PLAYERS) {
        push(bansSubmitted(playerId, BLIND_ALLOTMENTS[playerId] as string[]));
      }
      push(
        bansRevealed(
          BAN_PLAYERS.map((playerId) => ({
            playerId,
            monIds: BLIND_ALLOTMENTS[playerId] as string[],
          })),
        ),
      );
    });

    const heard = await undoAndHear(doc);

    expect(heard).toBe('Undid the reveal. The bans are recorded and not shown.');
    for (const name of ROSTER_NAMES) expect(heard).not.toContain(name);
  });

  it('says a snake ban came off and whose turn it is again', async () => {
    // Snake bans ARE public, so this string could name a species without leaking. It does
    // not, because `UndoRemoval.monId` is null for every ban kind and there is therefore
    // no name to reach for — one rule for all three rather than three rules to keep
    // straight.
    const doc = banStageDoc('snake', (push) => {
      push(bansPlaced('p1', 'mon-0', 1));
      push(bansPlaced('p2', 'mon-1', 1));
    });

    const heard = await undoAndHear(doc);

    expect(heard).toBe("Undid Bo's ban. It is Bo's turn again.");
    for (const name of ROSTER_NAMES) expect(heard).not.toContain(name);
  });
});

// ---------------------------------------------------------------------------
// The three ban-stage confirmations — 04-UI-SPEC §8, T-04-32.
//
// Every string is asserted in FULL rather than by substring: these are contracts down to
// the em dash and the apostrophe, and a substring assertion passes against a body that
// lost half its sentence. That is `confirm-copy.ts`'s own rule for existing sets.
//
// Two of the three sets have no reachable surface yet — the blind locked screen is 04-09's
// and the reveal is 04-11's — so they are asserted through their composers and through a
// directly rendered `ConfirmDialog`. The composer IS the contract; `app.tsx` routes
// `crossing.kind` to it and that routing is asserted for the kind whose screen exists.
// ---------------------------------------------------------------------------

describe('the ban-stage confirmations, word for word', () => {
  it('states what abandoning a ban stage discards', () => {
    expect(ABANDON_BAN_STAGE_CONFIRM.body(3)).toBe(
      'This discards the tournament and every ban the 3 players have entered. Nothing recovers it unless you have already downloaded the tournament JSON.',
    );
    expect(ABANDON_BAN_STAGE_CONFIRM.confirmLabel).toBe('Abandon tournament');
    expect(ABANDON_BAN_STAGE_CONFIRM.safeLabel).toBe('Keep the bans');
    expect(ABANDON_BAN_STAGE_CONFIRM.tone).toBe('danger');
  });

  it('tells the host what undoing a blind submission will cost them', () => {
    // The sharpest design point in the phase. Every other undo acts on something visible;
    // D-05 forbids re-displaying a removed submission, so this one removes a thing the
    // host cannot see — and the dialog is the only place they can be told that the price
    // is a second message to Discord.
    expect(UNDO_BAN_SUBMISSION_CONFIRM.body('Cass')).toBe(
      "This removes Cass's bans. They are not shown on screen, so ask Cass for the list again before you re-enter it.",
    );
    expect(UNDO_BAN_SUBMISSION_CONFIRM.confirmLabel('Cass')).toBe("Remove Cass's bans");
    expect(UNDO_BAN_SUBMISSION_CONFIRM.safeLabel('Cass')).toBe("Keep Cass's bans");
    expect(UNDO_BAN_SUBMISSION_CONFIRM.tone).toBe('default');
  });

  it('is honest that un-revealing cannot un-read', () => {
    expect(UNDO_REVEAL_CONFIRM.body(3)).toBe(
      "This takes the reveal back to the locked screen. The 3 players' bans stay recorded, and everyone who has already read them still has. Undo again to remove a player's bans.",
    );
    expect(UNDO_REVEAL_CONFIRM.confirmLabel).toBe('Undo the reveal');
    expect(UNDO_REVEAL_CONFIRM.safeLabel).toBe('Keep the reveal');
    expect(UNDO_REVEAL_CONFIRM.tone).toBe('default');
  });

  it('reads 1 player rather than 1 players at a one-player configuration', () => {
    // Reachable: nothing stops a host configuring one player, and a visible grammar error
    // in a dialog that destroys work reads as a tool that was not finished.
    expect(ABANDON_BAN_STAGE_CONFIRM.body(1)).toContain('the 1 player have entered');
    expect(ABANDON_BAN_STAGE_CONFIRM.body(1)).not.toContain('1 players');

    expect(UNDO_REVEAL_CONFIRM.body(1)).toContain("The 1 player's bans stay recorded");
    expect(UNDO_REVEAL_CONFIRM.body(1)).not.toContain('1 players');
  });

  it('names no species anywhere in any of the three sets', () => {
    const strings = [
      ABANDON_BAN_STAGE_CONFIRM.heading,
      ABANDON_BAN_STAGE_CONFIRM.body(3),
      ABANDON_BAN_STAGE_CONFIRM.confirmLabel,
      ABANDON_BAN_STAGE_CONFIRM.safeLabel,
      UNDO_BAN_SUBMISSION_CONFIRM.heading('Cass'),
      UNDO_BAN_SUBMISSION_CONFIRM.body('Cass'),
      UNDO_BAN_SUBMISSION_CONFIRM.confirmLabel('Cass'),
      UNDO_BAN_SUBMISSION_CONFIRM.safeLabel('Cass'),
      UNDO_REVEAL_CONFIRM.heading,
      UNDO_REVEAL_CONFIRM.body(3),
      UNDO_REVEAL_CONFIRM.confirmLabel,
      UNDO_REVEAL_CONFIRM.safeLabel,
    ];

    for (const text of strings) {
      for (const name of ROSTER_NAMES) expect(text, text).not.toContain(name);
    }
  });

  it('renders the blind-submission dialog with no species name in it', async () => {
    // Rendered rather than only composed, because the module's rule is about what reaches
    // the DOM: JSX collapses whitespace between text lines, which is why every body is a
    // pre-composed string rather than prose in the component.
    await act(async () => {
      render(
        <ConfirmDialog
          heading={UNDO_BAN_SUBMISSION_CONFIRM.heading('Cass')}
          body={UNDO_BAN_SUBMISSION_CONFIRM.body('Cass')}
          confirmLabel={UNDO_BAN_SUBMISSION_CONFIRM.confirmLabel('Cass')}
          safeLabel={UNDO_BAN_SUBMISSION_CONFIRM.safeLabel('Cass')}
          tone={UNDO_BAN_SUBMISSION_CONFIRM.tone}
          onConfirm={() => undefined}
          onSafe={() => undefined}
        />,
        host,
      );
      await Promise.resolve();
    });

    expect(dialogText()).toContain(UNDO_BAN_SUBMISSION_CONFIRM.body('Cass'));
    for (const name of ROSTER_NAMES) expect(dialogText()).not.toContain(name);

    // The confirming button first, the safe one second — so the safe one is the last thing
    // focus reaches. The same ordering rule every other set in this file is held to.
    expect(dialogButtons().map((button) => button.textContent?.trim())).toEqual([
      "Remove Cass's bans",
      "Keep Cass's bans",
    ]);
  });
});

describe('the ban stage on screen asks, or does not, as the stage requires', () => {
  /** A snake stage with `placements` bans down and the clock still running. */
  function snakeSaved(placements: number): void {
    const doc = banStageDoc('snake', (push) => {
      const sequence = ['p1', 'p2', 'p3', 'p3', 'p2', 'p1'];
      for (let index = 0; index < placements; index++) {
        push(
          bansPlaced(sequence[index] as string, `mon-${index}`, Math.floor(index / 3) + 1),
        );
      }
    });

    expect(saveTournament(doc)).toBe(true);
  }

  async function reachBanStage(placements = 2): Promise<void> {
    snakeSaved(placements);
    claimLock();
    await mountApp();
    await click(buttonNamed('Resume saved draft'));
  }

  it('undoes a snake ban with no dialog at all', async () => {
    // The ban is on the board and reversing it is visible, so it is the same category as a
    // pick and D-08's no-confirm posture holds. `crossing.crosses` is false for
    // `'banPlaced'`, so this takes the pre-existing silent path with no new code.
    await reachBanStage(2);

    const before = getDoc()?.log.length ?? 0;
    await click(buttonNamed('Undo last move'));

    expect(host.querySelectorAll('[role="alertdialog"]')).toHaveLength(0);
    expect(getDoc()?.log.length).toBe(before - 1);
  });

  it('offers the ban-stage abandon copy rather than the draft one', async () => {
    // Routed by screen: bans are what is at stake here, exactly as picks are on the draft
    // screen, so `Keep the bans` is the right safe label and `This discards N picks` would
    // be a plain untruth at zero picks.
    await reachBanStage(2);
    await click(buttonNamed('Abandon draft'));

    expect(dialogText()).toContain(ABANDON_BAN_STAGE_CONFIRM.body(3));
    expect(dialogText()).not.toContain(ABANDON_CONFIRM.body(0, 3));
    expect(dialogButtonNamed('Keep the bans')).toBeDefined();
    expect(dialogButtonNamed('Abandon tournament')).toBeDefined();
  });
});

/**
 * Undoing the reveal, driven through the real surface rather than through the composer.
 *
 * 04-07 wrote `UNDO_REVEAL_CONFIRM` and routed it in `app.tsx` before anything could reach
 * it: the `'reveal'` arm rendered nothing, so the dialog was asserted against a directly
 * rendered `ConfirmDialog` and its routing was never exercised. 04-11 built the surface, so
 * these drive the whole path — a saved revealed document, the top bar's own undo control,
 * the dialog, and where the screen lands afterwards.
 */
describe('undoing the reveal, through the surface that now exists', () => {
  /** A blind stage with every allotment sealed and the reveal landed, saved for resume. */
  function revealedSaved(): void {
    const doc = banStageDoc('blind', (push) => {
      for (const playerId of BAN_PLAYERS) {
        push(bansSubmitted(playerId, BLIND_ALLOTMENTS[playerId] as string[]));
      }
      push(
        bansRevealed(
          BAN_PLAYERS.map((playerId) => ({
            playerId,
            monIds: BLIND_ALLOTMENTS[playerId] as string[],
          })),
        ),
      );
    });

    expect(saveTournament(doc)).toBe(true);
  }

  async function reachReveal(): Promise<void> {
    revealedSaved();
    claimLock();
    await mountApp();
    await click(buttonNamed('Resume saved draft'));
  }

  it('lands on the reveal, which is what makes the rest of this reachable', async () => {
    await reachReveal();

    expect(host.querySelector('.ban-reveal')).not.toBeNull();
  });

  it('asks first, in the words 04-07 wrote for this exact moment', async () => {
    await reachReveal();
    await click(buttonNamed('Undo last move'));

    expect(dialogText()).toContain(UNDO_REVEAL_CONFIRM.body(3));
    expect(dialogButtonNamed('Undo the reveal')).toBeDefined();
    expect(dialogButtonNamed('Keep the reveal')).toBeDefined();
  });

  it('goes back to the locked screen with every submission still recorded', async () => {
    await reachReveal();
    await click(buttonNamed('Undo last move'));
    await click(dialogButtonNamed('Undo the reveal'));

    expect(host.querySelector('.ban-reveal')).toBeNull();
    expect(host.querySelector('.blind-locked')).not.toBeNull();
    expect(getState()?.banSubmissions).toHaveLength(3);
  });

  it('has nothing to un-draw, which is why this undo is clean enough to offer', async () => {
    // D-23. The pool is drawn on a separate `Start draft` tap, so undoing the reveal takes
    // back exactly one action and touches no pool.
    await reachReveal();
    await click(buttonNamed('Undo last move'));
    await click(dialogButtonNamed('Undo the reveal'));

    expect(getState()?.poolIds).toEqual([]);
  });

  it('keeps the reveal when the safe label is chosen', async () => {
    await reachReveal();

    const before = getDoc()?.log.length ?? 0;
    await click(buttonNamed('Undo last move'));
    await click(dialogButtonNamed('Keep the reveal'));

    expect(getDoc()?.log.length).toBe(before);
    expect(host.querySelector('.ban-reveal')).not.toBeNull();
  });
});
