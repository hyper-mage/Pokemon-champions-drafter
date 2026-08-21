// @vitest-environment happy-dom

/**
 * The mid-draft swap, end to end — SWAP-02, SWAP-05, SWAP-06, D-25, D-26, D-27.
 *
 * ## The one thing this file exists to hold down
 *
 * D-27 is "slot first, then pool", and the whole claim rests on the offer being right on the
 * FIRST FRAME. A build that filtered inside the component, or that let every cell be clicked
 * and rejected the illegal ones afterwards, would pass a test that only checked the final
 * document — the swap would still be legal, and SWAP-05 would still look satisfied. So the
 * assertions below count RENDERED CELLS while a Mega slot is armed, not just what the log
 * ends up saying.
 *
 * The count line is asserted as a whole sentence, both variants, for the reason SWAP-06 gives
 * itself: a player reading a short pool as a bug and a player assuming a long pool is
 * unfiltered are symmetric failures, and only stating which case is in force closes both.
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Ten Mega-capable species and twenty that are not.
 *
 * The split is the fixture's whole job. A uniform roster would make a Mega slot's offer
 * equal to the whole leftover pool, and every filtering assertion below would pass against a
 * build that did no filtering at all.
 */
const fixture = vi.hoisted(() => {
  const MEGA_CAPABLE = 10;

  const entries = Array.from({ length: 30 }, (_, index) => {
    const megaCapable = index < MEGA_CAPABLE;
    return {
      id: `mon-${index}`,
      name: `Mon ${index}`,
      num: index + 1,
      types: ['Normal'],
      baseStats: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
      baseSpeciesId: `mon-${index}`,
      forme: null,
      megaCapable,
      megaFormes: megaCapable
        ? [
            {
              id: `mon-${index}-mega`,
              name: `Mon ${index}-Mega`,
              forme: 'Mega',
              requiredItem: `Mon ${index}ite`,
              spriteId: `mon-${index}-mega`,
              types: ['Normal'],
              baseStats: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
            },
          ]
        : [],
      spriteId: `mon-${index}`,
      spriteMissing: true,
    };
  });

  return {
    megaCapable: MEGA_CAPABLE,
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
          megaFormes: MEGA_CAPABLE,
          baseSpecies: entries.length,
        },
        entries,
        checksum: 'test-checksum',
      },
      spriteMeta: {
        nativeWidth: 96,
        nativeHeight: 96,
        byRosterId: Object.fromEntries(
          entries.map((row) => [
            row.id,
            { pokeapiId: row.num, file: `${row.num}.png`, slug: row.id },
          ]),
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
  cardsPlayed,
  draftStarted,
  orderResolved,
  pickMade,
  poolBuilt,
  scheduleCompiled,
  swapMade,
  type Action,
  type Intent,
  type RoundSpec,
} from '../../src/core/actions';
import { SCHEMA_VERSION, type TournamentConfig, type TournamentDoc } from '../../src/core/model';
import {
  selectAvailablePool,
  selectCurrentTurn,
  selectPickCount,
  selectSwapsRemaining,
  selectTeams,
} from '../../src/core/selectors';
import { getState } from '../../src/store';
import { announce } from '../../src/ui/components/LiveRegion';
import { SWAP_CONFIRM } from '../../src/ui/confirm-copy';

// ---------------------------------------------------------------------------

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

/** Round 1 is a Mega round; rounds 2-6 are open. */
const SCHEDULE: RoundSpec[] = Array.from({ length: 6 }, (_, position) => ({
  index: position + 1,
  kind: position === 0 ? ('mega' as const) : ('open' as const),
}));

function configOf(swapBudget: number): TournamentConfig {
  return {
    formatLabel: 'Champions MB',
    players: [
      { id: 'p1', name: 'Ada' },
      { id: 'p2', name: 'Bo' },
    ],
    rounds: 6,
    rosterVersion: 'mb',
    rosterChecksum: 'test-checksum',
    poolSize: 30,
    bans: [],
    banMode: 'hostBanlist',
    megasRequiredPerTeam: 1,
    dualMegaChoices: [],
    depth: 'draftOnly',
    rules: [{ kind: 'mega', count: 1 }],
    megaFormeBans: [],
    swapBudget,
    swapRounds: 0,
    bansPerPlayer: 0,
    duplicateBanPolicy: 'bothApply',
  };
}

/**
 * Rounds 1 and 2 fully picked, round 3 bid and resolved — so `Ada` is on the clock with a
 * filled MEGA slot (round 1) and a filled OPEN slot (round 2) behind her.
 *
 * Both slot kinds have to be armable in one document, because SWAP-06's contract is that
 * BOTH count-line variants are stated and a fixture that could only reach one of them would
 * leave half the requirement untested.
 *
 * `mon-0` and `mon-1` fill the Mega round and are both Mega-capable, so the fixture is a
 * legal draft rather than merely a foldable one.
 */
function makeDoc(options: { swapBudget?: number; extraSwap?: boolean } = {}): TournamentDoc {
  const config = configOf(options.swapBudget ?? 2);
  const order = ['p1', 'p2'];

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
      fixture.megaCapable,
    ),
  );
  push(scheduleCompiled(SCHEDULE));
  push(draftStarted(order, 13));

  let pickIndex = 0;
  for (let round = 1; round <= 3; round++) {
    // The rotation puts a different player first each round; the values differ because
    // CARD-04 forbids repeating one inside a round.
    for (const [offset, playerId] of order.entries()) {
      push(cardsPlayed({ playerId, value: round + offset, round }));
    }
    push(orderResolved(round, order));

    // Round 3 is bid and resolved but NOT picked — that is the state a mid-draft swap is
    // spent in, and it is what leaves a pick still owed after the swap (D-25).
    if (round === 3) break;

    for (const playerId of order) {
      push(pickMade({ playerId, monId: `mon-${pickIndex}`, round, pickIndex }));
      pickIndex += 1;
    }
  }

  if (options.extraSwap === true) {
    push(
      swapMade({
        playerId: 'p1',
        round: 1,
        outMonId: 'mon-0',
        inMonId: 'mon-9',
        swapRound: 0,
      }),
    );
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'swap-fixture',
    createdAt: 1_770_000_000_000,
    config,
    rng: { seed: 0x5f3a91c2, cursor: 0 },
    log,
  };
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

async function click(element: Element | null | undefined): Promise<void> {
  expect(element).toBeTruthy();
  await act(async () => {
    (element as HTMLElement | null)?.click();
    await Promise.resolve();
  });
}

function buttonNamed(name: string): HTMLButtonElement | undefined {
  return Array.from(host.querySelectorAll('button')).find(
    (button) => (button.textContent ?? '').trim() === name,
  );
}

/** A button found by its accessible NAME, which for a board cell is an `aria-label`. */
function labelled(label: string): HTMLButtonElement | null {
  return host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
}

async function openDraft(options: { swapBudget?: number; extraSwap?: boolean } = {}): Promise<void> {
  expect(saveTournament(makeDoc(options))).toBe(true);
  claimLock();
  await mountApp();
  await click(buttonNamed('Resume saved draft'));
}

function text(selector: string): string {
  return host.querySelector(selector)?.textContent?.trim() ?? '';
}

function poolCells(): HTMLElement[] {
  return Array.from(host.querySelectorAll<HTMLElement>('.pool__grid .mon-card'));
}

function dialogText(): string {
  return host.querySelector('[role="alertdialog"]')?.textContent ?? '';
}

/** Every leftover id, from the store rather than from the screen. */
function available(): string[] {
  const state = getState();
  return state === null ? [] : selectAvailablePool(state);
}

// ---------------------------------------------------------------------------

describe('the draft screen before a slot is armed', () => {
  it('says how many swaps the player on the clock has left', async () => {
    await openDraft();
    expect(text('.pool__swap-budget')).toBe('Ada has 2 swaps left');
  });

  it('still calls the pane the Pool, and still offers the whole leftover pool', async () => {
    await openDraft();

    expect(text('.pool__title')).toBe('Pool');
    // Round 3 is open, so nothing narrows the grid.
    expect(poolCells()).toHaveLength(26);
  });

  it('renders nothing about swaps at all when the budget is zero', async () => {
    // 03-UI-SPEC: not an empty state — the feature does not exist for this tournament.
    await openDraft({ swapBudget: 0 });

    expect(host.querySelector('.pool__swap-budget')).toBeNull();
    expect(host.querySelectorAll('.board__cell--swappable')).toHaveLength(0);
    expect(host.querySelectorAll('.board__grid button')).toHaveLength(0);
  });
});

describe('arming a Mega slot restates the pool — SWAP-05, SWAP-06', () => {
  it('replaces the heading with the slot it is swapping out of', async () => {
    await openDraft();
    await click(labelled('Swap Mon 0 out of round 1'));

    expect(text('.pool__title')).toBe('Swapping Mon 0 out of round 1');
  });

  it('renders a grid whose cell count IS the Mega-eligible available count', async () => {
    // The first-frame assertion. Ten species can Mega, four picks are gone and all four came
    // off the Mega-capable end, so six remain — and the grid shows six, not twenty-six with
    // twenty of them waiting to be refused.
    await openDraft();
    await click(labelled('Swap Mon 0 out of round 1'));

    expect(poolCells()).toHaveLength(6);
    for (const cell of poolCells()) {
      const label = cell.getAttribute('aria-label') ?? '';
      const index = Number(label.replace('Mon ', '').split(',')[0]);
      expect(index).toBeLessThan(fixture.megaCapable);
    }
  });

  it('states the Mega case in full, so a short pool cannot read as a bug', async () => {
    await openDraft();
    await click(labelled('Swap Mon 0 out of round 1'));

    expect(text('.pool__count')).toBe(
      '6 of 26 available for this slot — round 1 is a Mega round, so only Pokémon that can still Mega are shown.',
    );
  });

  it('drops the round-level restriction line, which would be about a different round', async () => {
    await openDraft();
    await click(labelled('Swap Mon 0 out of round 1'));

    expect(host.querySelector('.pool__restriction')).toBeNull();
  });

  it('announces the slot and the size of the offer', async () => {
    await openDraft();
    await click(labelled('Swap Mon 0 out of round 1'));

    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      'Swapping Mon 0 out of round 1. 6 Pokémon can fill this slot.',
    );
  });
});

describe('arming an OPEN slot says so too — the symmetric half of SWAP-06', () => {
  it('states the open case in full rather than falling silent', async () => {
    await openDraft();
    await click(labelled('Swap Mon 2 out of round 2'));

    expect(text('.pool__title')).toBe('Swapping Mon 2 out of round 2');
    expect(text('.pool__count')).toBe(
      '26 of 26 available for this slot — round 2 is an open round, so the whole leftover pool is shown.',
    );
  });

  it('offers the whole leftover pool, non-Mega species included', async () => {
    await openDraft();
    await click(labelled('Swap Mon 2 out of round 2'));

    expect(poolCells()).toHaveLength(26);
  });
});

describe('disarming', () => {
  it('gives the slot up without dispatching anything', async () => {
    await openDraft();
    await click(labelled('Swap Mon 0 out of round 1'));

    const before = getState();
    expect(before).not.toBeNull();
    const picksBefore = before === null ? -1 : selectPickCount(before);

    await click(buttonNamed('Keep Mon 0'));

    expect(text('.pool__title')).toBe('Pool');
    expect(poolCells()).toHaveLength(26);

    const after = getState();
    expect(after === null ? -1 : selectPickCount(after)).toBe(picksBefore);
    expect(after === null ? 0 : selectSwapsRemaining(after, 'p1')).toBe(2);
  });
});

describe('the swap confirm — 03-UI-SPEC §12', () => {
  async function armAndChoose(): Promise<void> {
    await openDraft();
    await click(labelled('Swap Mon 0 out of round 1'));
    // `mon-4` — the first Mega-capable species still in the pool.
    await click(poolCells()[0]);
  }

  it('states the consequence in numbers and names, and nothing about intent', async () => {
    await armAndChoose();

    // The whole sentence, literally, rather than through the composer alone — a test that
    // only asserted `SWAP_CONFIRM.body(...)` would be reading the implementation back to
    // itself and would pass against any wording at all.
    expect(dialogText()).toContain(
      "This spends one of Ada's 2 swaps. Mon 0 leaves round 1 and returns to the pool for everyone; Mon 4 takes the slot.",
    );
    expect(dialogText()).toContain(SWAP_CONFIRM.body('Ada', 2, 'Mon 0', 'Mon 4', 1));
  });

  it('names a verb and its object on both buttons', async () => {
    await armAndChoose();

    expect(buttonNamed('Swap in Mon 4')).toBeDefined();
    expect(buttonNamed('Keep Mon 0')).toBeDefined();
  });

  it('does not dispatch until it is confirmed', async () => {
    await armAndChoose();

    expect(available()).toContain('mon-4');
    expect(getState()?.swaps ?? []).toHaveLength(0);
  });
});

describe('confirming the swap — D-25, D-26', () => {
  async function swapInMon4(swapBudget = 2): Promise<void> {
    await openDraft({ swapBudget });
    await click(labelled('Swap Mon 0 out of round 1'));
    await click(poolCells()[0]);
    await click(buttonNamed('Swap in Mon 4'));
  }

  it('puts the new species in the slot and the old one back in the pool', async () => {
    await swapInMon4();

    const state = getState();
    expect(state).not.toBeNull();
    if (state === null) return;

    expect(selectTeams(state)['p1']?.[0]).toBe('mon-4');
    expect(available()).toContain('mon-0');
    expect(available()).not.toContain('mon-4');
  });

  it('spends budget and not the turn — the round pick still happens', async () => {
    await swapInMon4();

    const state = getState();
    expect(state).not.toBeNull();
    if (state === null) return;

    expect(selectPickCount(state)).toBe(4);
    expect(selectCurrentTurn(state)).toEqual({ round: 3, playerId: 'p1', pickIndex: 4 });
    expect(selectSwapsRemaining(state, 'p1')).toBe(1);
  });

  it('dispatches exactly once', async () => {
    await swapInMon4();
    expect(getState()?.swaps ?? []).toHaveLength(1);
  });

  it('shows the new species on the board and the old one in the pool', async () => {
    await swapInMon4();

    // The board's round-1 cell for Ada now names Mon 4.
    expect(labelled('Swap Mon 4 out of round 1')).not.toBeNull();
    expect(labelled('Swap Mon 0 out of round 1')).toBeNull();

    const poolNames = poolCells().map((cell) => cell.getAttribute('aria-label') ?? '');
    expect(poolNames.some((name) => name.startsWith('Mon 0,'))).toBe(true);
  });

  it('closes the dialog and puts the pane back to being the pool', async () => {
    await swapInMon4();

    expect(host.querySelector('[role="alertdialog"]')).toBeNull();
    expect(text('.pool__title')).toBe('Pool');
  });

  it('announces what moved, both ways', async () => {
    await swapInMon4();

    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      "Mon 4 fills Ada's round 1 slot. Mon 0 is back in the pool.",
    );
  });

  it('lands focus on the board cell that now holds the incoming species', async () => {
    await swapInMon4();

    // `Dialog` restores focus to the element that opened it — a pool cell this swap removed
    // from the pool — so without the override this is `<body>`.
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement?.id).toBe('board-cell-p1-1');
  });

  it('lands focus there even when the swap spent the LAST of the budget', async () => {
    // The harder case, and the common one: at `swapBudget: 1` the cell stops being a button
    // in the same render, so the focus target is a chip that is no longer interactive.
    await swapInMon4(1);

    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement?.id).toBe('board-cell-p1-1');
    expect(document.activeElement?.tagName).toBe('SPAN');
  });

  it('takes the budget line away once nothing is left to spend', async () => {
    await swapInMon4(1);

    expect(host.querySelector('.pool__swap-budget')).toBeNull();
    expect(host.querySelectorAll('.board__grid button')).toHaveLength(0);
  });

  it('says one swap rather than 1 swaps', async () => {
    await openDraft({ swapBudget: 1 });
    await click(labelled('Swap Mon 0 out of round 1'));
    await click(poolCells()[0]);

    expect(dialogText()).toContain("This spends one of Ada's 1 swap.");
  });
});

describe('a document that already carries a swap', () => {
  it('counts it against the budget rather than re-offering it', async () => {
    await openDraft({ extraSwap: true });

    const state = getState();
    expect(state).not.toBeNull();
    if (state === null) return;

    expect(selectTeams(state)['p1']?.[0]).toBe('mon-9');
    expect(available()).toContain('mon-0');
    expect(selectSwapsRemaining(state, 'p1')).toBe(1);
    // Singular, against the spec's literal `{n} swaps` slot — `swapBudget: 1` is the most
    // likely setting anyone picks, so `has 1 swaps left` would be the line most hosts read.
    expect(text('.pool__swap-budget')).toBe('Ada has 1 swap left');
  });

  it('arms the swapped-in species, because that is what the slot holds now', async () => {
    await openDraft({ extraSwap: true });
    await click(labelled('Swap Mon 9 out of round 1'));

    expect(text('.pool__title')).toBe('Swapping Mon 9 out of round 1');
    // Mon 0 came back to the pool and can still Mega, so it is offered again.
    expect(poolCells().map((cell) => cell.getAttribute('aria-label') ?? '')[0]).toContain(
      'Mon 0',
    );
  });
});

/*
  Added by the phase 03 code review (CR-02).

  The staleness rule — "the armed slot no longer holds what was armed, so disarm" — lived
  inside the `swapArming` memo, which only the RENDER consumed. `handlePoolPick` branched on
  the raw `armedSlot` state instead. `setArmedSlot(null)` fires from exactly two places
  (`disarmSwap`, and confirming a swap), neither of which covers undo.

  So: arm a slot, undo back past the pick under it, and the two disagreed. The pool dropped
  the armed heading and its `Keep {species}` control — the only disarm affordance — while a
  pool click still took the swap branch and opened a confirm for a slot that no longer held
  what was armed.

  Nothing could be corrupted by it. `apply(SWAP_MADE)` matches on `pick.monId` and folds a
  disagreeing swap to a no-op (T-03-38). It was a trap the host could not see their way out
  of, which is why this asserts from the SURFACE — the heading and the controls — rather
  than from the log, which looked fine throughout.

  The undo loop is not incidental. Since 03-09 the stack spans picks, cards and resolutions,
  so reaching round 1's pick from a round-3 clock takes several steps, and one of them
  crosses a round boundary and asks for confirmation.
*/
describe('an armed slot that the board moves out from under — CR-02', () => {
  /** Undo until p1's round-1 slot gives up `mon-0`, confirming any boundary question. */
  async function undoPastRoundOnePick(): Promise<void> {
    for (let attempt = 0; attempt < 12; attempt++) {
      const state = getState();
      if (state !== null && selectTeams(state).p1?.[0] !== 'mon-0') return;

      await click(buttonNamed('Undo last move'));

      // Undoing back across a round boundary asks first, and a resolved order asks with a
      // label of its own — answer whichever appeared and carry on.
      const confirmUndo = buttonNamed('Undo the pick') ?? buttonNamed('Undo the pick order');
      if (confirmUndo !== undefined) await click(confirmUndo);
    }
    throw new Error("p1's round-1 slot still holds mon-0 after 12 undos");
  }

  it('disarms once the slot stops holding what was armed', async () => {
    await openDraft();
    await click(labelled('Swap Mon 0 out of round 1'));
    expect(text('.pool__title')).toBe('Swapping Mon 0 out of round 1');

    await undoPastRoundOnePick();

    const state = getState();
    expect(state === null ? 'mon-0' : selectTeams(state).p1?.[0]).not.toBe('mon-0');

    // The surface agrees it is no longer armed.
    expect(text('.pool__title')).toBe('Pool');
    expect(buttonNamed('Keep Mon 0')).toBeUndefined();
  });

  it('reads a pool click as a pick rather than opening a swap confirm', async () => {
    await openDraft();
    await click(labelled('Swap Mon 0 out of round 1'));
    await undoPastRoundOnePick();

    const before = getState();
    const swapsBefore = before === null ? -1 : selectSwapsRemaining(before, 'p1');

    // Before the fix this opened the swap confirm for a slot that no longer held mon-0.
    await click(poolCells()[0]);
    expect(dialogText()).not.toContain(SWAP_CONFIRM.heading);

    const after = getState();
    // The swap budget is untouched: the click was never read as a swap.
    expect(after === null ? -1 : selectSwapsRemaining(after, 'p1')).toBe(swapsBefore);
  });
});
