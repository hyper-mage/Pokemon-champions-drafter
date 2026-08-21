// @vitest-environment happy-dom

/**
 * Dedicated swap rounds, end to end — SWAP-03, SWAP-04, SWAP-07, D-28…D-31.
 *
 * ## The two things this file exists to hold down
 *
 * SWAP-04 asks for the swap order to be EXPLICIT, and "explicit" is a claim about a
 * sentence rather than about an array. A build that reversed the right order and said
 * nothing would satisfy every assertion about the document and fail the requirement, so
 * both phase-line variants are asserted as whole sentences against two documents that
 * genuinely differ in where their order came from.
 *
 * D-31 is the export gate, and its failure mode is silent by construction: the paste is
 * correct, it is just correct for a team that is about to change. So the assertions here
 * check what is NOT on screen while a swap round is pending, and then check the paste by
 * exact string equality once it is — never `includes`, per CLAUDE.md, because a paste
 * containing the right species and the wrong separator imports one Pokémon and drops the
 * rest.
 *
 * ## Why the export-gate tests live here rather than in `completed-draft.test.tsx`
 *
 * That file mounts `CompletedDraft` directly, with hand-built props. Every D-31 assertion
 * is about whether `App` renders that component AT ALL, which its harness cannot express —
 * and the paste-after-a-swap-round assertion needs a real draft played to completion
 * through the store. Duplicating this fixture and its roster mock into that file would be a
 * second copy of one document, free to drift from this one.
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Ten Mega-capable species and twenty that are not — `swap.test.tsx`'s split, for its
 * reason: a uniform roster makes a Mega slot's offer equal to the whole leftover pool, and
 * every filtering assertion passes against a build that does no filtering.
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
  swapPassed,
  type Action,
  type Intent,
  type RoundSpec,
} from '../../src/core/actions';
import { SCHEMA_VERSION, type TournamentConfig, type TournamentDoc } from '../../src/core/model';
import {
  selectIsComplete,
  selectIsTournamentComplete,
  selectSwapsRemaining,
  selectTeams,
} from '../../src/core/selectors';
import { getState } from '../../src/store';
import { announce } from '../../src/ui/components/LiveRegion';
import { SWAP_CONFIRM } from '../../src/ui/confirm-copy';
import { EXPORTS_PENDING, PASS_LABEL } from '../../src/ui/components/SwapPanel';
import { SWAP_ROUND_EXPAND_REASON } from '../../src/ui/components/SplitPanes';

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

/** `Ada` and `Cy`, in that starting order — 03-UI-SPEC §11's own example names. */
const ORDER = ['p1', 'p2'];

function configOf(options: { swapRounds: number; swapBudget?: number }): TournamentConfig {
  return {
    formatLabel: 'Champions MB',
    players: [
      { id: 'p1', name: 'Ada' },
      { id: 'p2', name: 'Cy' },
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
    swapBudget: options.swapBudget ?? 2,
    swapRounds: options.swapRounds,
    bansPerPlayer: 0,
    duplicateBanPolicy: 'bothApply',
  };
}

/**
 * A draft played all the way out, optionally with swap-round moves appended.
 *
 * Every round is bid and resolved in `ORDER`, so round 6's resolved order is `[p1, p2]` and
 * the swap order — its reverse — puts `Cy` first. That is the whole of D-28 as a fixture:
 * the order on screen has to be derivable from a value the log already carries.
 *
 * `migrated: true` builds the same complete draft with NO `schedule/compiled` and NO
 * `order/resolved` anywhere, which is a schema-2 document. Its swap order has to come from
 * somewhere else, and the phase line has to say so.
 */
function makeDoc(
  options: {
    swapRounds?: number;
    swapBudget?: number;
    migrated?: boolean;
    passes?: { playerId: string; swapRound: number }[];
  } = {},
): TournamentDoc {
  const config = configOf({
    swapRounds: options.swapRounds ?? 2,
    swapBudget: options.swapBudget ?? 2,
  });

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
  if (options.migrated !== true) push(scheduleCompiled(SCHEDULE));
  push(draftStarted(ORDER, 13));

  /*
    Round 1 takes `mon-0` and `mon-1`; rounds 2-6 take `mon-10` upward.

    That gap is the fixture's whole job and it is not tidiness. `mon-0`…`mon-9` are the
    Mega-capable ten, so drafting sequentially would empty the Mega pool by the last pick
    and a Mega slot armed in a swap round would offer NOTHING — every filtering assertion
    below would then pass against a build that did no filtering, which is the failure this
    file's header warns about. Skipping to `mon-10` leaves eight Mega-capable species in the
    pool for the swap rounds to reach.
  */
  let pickIndex = 0;
  for (let round = 1; round <= 6; round++) {
    if (options.migrated !== true) {
      // Distinct values per player, because CARD-04 forbids repeating one inside a round.
      for (const [offset, playerId] of ORDER.entries()) {
        push(cardsPlayed({ playerId, value: round + offset, round }));
      }
      push(orderResolved(round, ORDER));
    }

    for (const playerId of ORDER) {
      const monId = round === 1 ? `mon-${pickIndex}` : `mon-${pickIndex + 8}`;
      push(pickMade({ playerId, monId, round, pickIndex }));
      pickIndex += 1;
    }
  }

  for (const pass of options.passes ?? []) push(swapPassed(pass));

  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'swap-round-fixture',
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

async function openDraft(options: Parameters<typeof makeDoc>[0] = {}): Promise<void> {
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

/**
 * What the polite live region currently holds.
 *
 * Scoped to `.visually-hidden`, because the draft screen also carries `role="status"` on
 * its visible notices and a bare attribute selector would read whichever came first in the
 * document.
 */
function announced(): string {
  return host.querySelector('[role="status"].visually-hidden')?.textContent ?? '';
}

/** Every player's export paste, in board order, exactly as rendered. */
function pastes(): string[] {
  return Array.from(host.querySelectorAll('.export-panel pre')).map(
    (block) => block.textContent ?? '',
  );
}

// ---------------------------------------------------------------------------

describe('the sticky head during a swap round — SWAP-03, SWAP-04', () => {
  it('names the swap round, the total and the player, in full', async () => {
    await openDraft({ swapRounds: 2 });

    // Cy picked LAST in round 6, so Cy swaps first — D-28 as one sentence.
    expect(text('.turn-banner')).toBe('Swap round 1 of 2 — Cy swaps or passes');
  });

  it('says the order reverses the last round, for a document that resolved one', async () => {
    await openDraft({ swapRounds: 2 });
    expect(text('.turn-banner__phase')).toBe('Swap order reverses round 6.');
  });

  it('says the order reverses the STARTING order, for a migrated document', async () => {
    // The fallback, named rather than silent. A sentence that claimed round 6 here would
    // be describing a resolution this document never recorded (T-03-44).
    await openDraft({ swapRounds: 2, migrated: true });
    expect(text('.turn-banner__phase')).toBe('Swap order reverses the starting order.');
  });

  it('does not say the draft is complete while a swap round is still running', async () => {
    await openDraft({ swapRounds: 1 });
    expect(host.textContent).not.toContain('Draft complete');
  });

  it('reads Draft complete once the last swap round closes, unchanged from Phase 2', async () => {
    await openDraft({
      swapRounds: 1,
      passes: [
        { playerId: 'p2', swapRound: 1 },
        { playerId: 'p1', swapRound: 1 },
      ],
    });

    expect(text('.turn-banner')).toBe('Draft complete — 12 picks, 2 teams');
  });
});

describe('the swap panel — 03-UI-SPEC §11', () => {
  it('renders the heading, the budget and the instruction', async () => {
    await openDraft({ swapRounds: 2, swapBudget: 2 });

    expect(text('.swap-panel__heading')).toBe('Swap round 1 of 2');
    expect(text('.swap-panel__budget')).toBe('Cy has 2 swaps left.');
    expect(text('.swap-panel__instruction')).toBe("Choose one of Cy's slots to swap, or pass.");
  });

  it('pluralises the budget line at one remaining — deferred item 6', async () => {
    // `swapBudget: 1` is the most likely setting a host picks, and `Cy has 1 swaps left.`
    // is a visible grammar error on the panel every player reads once per round.
    await openDraft({ swapRounds: 1, swapBudget: 1 });
    expect(text('.swap-panel__budget')).toBe('Cy has 1 swap left.');
  });

  it('takes the place of the pool grid and nothing else', async () => {
    await openDraft({ swapRounds: 1 });

    expect(host.querySelector('.swap-panel')).not.toBeNull();
    expect(host.querySelector('.pool__grid')).toBeNull();
    // The board is still there — it is where the slot to swap is chosen.
    expect(host.querySelector('.board__grid')).not.toBeNull();
  });
});

describe('passing — SWAP-07', () => {
  it('dispatches on one click, with no dialog anywhere', async () => {
    await openDraft({ swapRounds: 1 });

    await click(buttonNamed(PASS_LABEL));

    // No confirm: nothing is lost, and undo covers it.
    expect(host.querySelector('[role="alertdialog"]')).toBeNull();

    const state = getState();
    // 33 entries in the opening log — 3 origination plus 5 per round over 6 rounds — so
    // `max(seq) + 1` is 33. Never `log.length`, and never assumed contiguous.
    expect(state?.passes).toEqual([{ playerId: 'p2', swapRound: 1, seq: 33 }]);
  });

  it('advances the clock to the next player without spending budget', async () => {
    await openDraft({ swapRounds: 1, swapBudget: 2 });

    await click(buttonNamed(PASS_LABEL));

    expect(text('.turn-banner')).toBe('Swap round 1 of 1 — Ada swaps or passes');
    expect(text('.swap-panel__budget')).toBe('Ada has 2 swaps left.');

    const state = getState();
    expect(state === null ? null : selectSwapsRemaining(state, 'p2')).toBe(2);
  });

  it('announces the pass ahead of the turn it caused', async () => {
    await openDraft({ swapRounds: 1 });

    await click(buttonNamed(PASS_LABEL));

    // One string, because `announce` writes one signal and the pass and the turn change it
    // caused are committed in the same tick — the pass alone would be overwritten.
    expect(announced()).toBe('Cy passes swap round 1. Swap round 1 of 1 — Ada swaps or passes');
  });

  it('rolls into the next swap round when the last player passes', async () => {
    await openDraft({ swapRounds: 2, passes: [{ playerId: 'p2', swapRound: 1 }] });

    expect(text('.turn-banner')).toBe('Swap round 1 of 2 — Ada swaps or passes');
    await click(buttonNamed(PASS_LABEL));

    // Round 2 opens on the same order, from the top.
    expect(text('.turn-banner')).toBe('Swap round 2 of 2 — Cy swaps or passes');
    expect(text('.swap-panel__heading')).toBe('Swap round 2 of 2');
  });

  it('keeps focus on the pass button across a turn and across a round', async () => {
    await openDraft({ swapRounds: 2 });

    const pass = buttonNamed(PASS_LABEL);
    pass?.focus();
    await click(pass);

    expect(document.activeElement).not.toBe(document.body);
    expect((document.activeElement as HTMLElement).textContent?.trim()).toBe(PASS_LABEL);
  });
});

describe('a player with no swaps left', () => {
  it('is told so, and told what to do instead', async () => {
    await openDraft({ swapRounds: 1, swapBudget: 0 });

    expect(text('.swap-panel__budget')).toBe('Cy has no swaps left — pass to continue.');
    // The instruction names an action this player cannot take, so it is not rendered.
    expect(host.querySelector('.swap-panel__instruction')).toBeNull();
  });

  it('has no interactive slot on the board, and can still pass', async () => {
    await openDraft({ swapRounds: 1, swapBudget: 0 });

    expect(host.querySelectorAll('.board__cell--swappable')).toHaveLength(0);
    expect(host.querySelectorAll('.board__grid button')).toHaveLength(0);

    // Passing is the only way their round ends, so it must not be gated on the budget.
    await click(buttonNamed(PASS_LABEL));
    expect(text('.turn-banner')).toBe('Swap round 1 of 1 — Ada swaps or passes');
  });
});

describe('arming a slot drops into the ONE swap flow — 03-UI-SPEC §11', () => {
  it('renders exactly the §10 pool surface, with the same count-line sentence', async () => {
    await openDraft({ swapRounds: 1, swapBudget: 2 });

    // Cy's round-2 slot holds `mon-11`; round 2 is an open round.
    await click(labelled('Swap Mon 11 out of round 2'));

    expect(host.querySelector('.swap-panel')).toBeNull();
    expect(text('.pool__title')).toBe('Swapping Mon 11 out of round 2');
    expect(text('.pool__count')).toBe(
      '18 of 18 available for this slot — round 2 is an open round, so the whole leftover pool is shown.',
    );
    expect(poolCells()).toHaveLength(18);
  });

  it('filters a Mega slot’s offer in a swap round exactly as mid-draft — SWAP-05', async () => {
    await openDraft({ swapRounds: 1, swapBudget: 2 });

    // Cy's round-1 slot holds `mon-1`, and round 1 is a Mega round. Eight of the ten
    // Mega-capable species are still in the pool, so the offer is genuinely narrowed —
    // counted from the RENDERED cells, because a build that filtered nothing would still
    // produce a legal document.
    await click(labelled('Swap Mon 1 out of round 1'));

    expect(text('.pool__count')).toBe(
      '8 of 18 available for this slot — round 1 is a Mega round, so only Pokémon that can still Mega are shown.',
    );
    expect(poolCells()).toHaveLength(8);
  });

  it('returns to the swap panel on Keep, and hands focus to the pass button', async () => {
    await openDraft({ swapRounds: 1, swapBudget: 2 });
    await click(labelled('Swap Mon 11 out of round 2'));

    const keep = buttonNamed('Keep Mon 11');
    keep?.focus();
    await click(keep);

    expect(host.querySelector('.swap-panel')).not.toBeNull();
    // The pressed button unmounted with the grid; focus must not fall to `<body>`.
    expect(document.activeElement).not.toBe(document.body);
    expect((document.activeElement as HTMLElement).textContent?.trim()).toBe(PASS_LABEL);
  });

  it('commits a swap-round swap with the round number on the action', async () => {
    await openDraft({ swapRounds: 1, swapBudget: 2 });

    await click(labelled('Swap Mon 11 out of round 2'));
    // By accessible name rather than by grid position, so the assertion below names a
    // species this test chose rather than whichever the grid happened to render first.
    await click(labelled('Mon 2, Normal'));
    await click(buttonNamed(SWAP_CONFIRM.confirmLabel('Mon 2')));

    const state = getState();
    expect(state?.swaps).toEqual([
      {
        playerId: 'p2',
        round: 2,
        outMonId: 'mon-11',
        inMonId: 'mon-2',
        // The window, and the only thing that differs from a mid-draft spend.
        swapRound: 1,
        seq: 33,
      },
    ]);
    expect(state === null ? null : selectTeams(state)['p2']?.[1]).toBe('mon-2');
    // ONE budget covers both windows — D-29.
    expect(state === null ? null : selectSwapsRemaining(state, 'p2')).toBe(1);
    // And the clock moved on, which a mid-draft swap would not have done.
    expect(text('.turn-banner')).toBe('Swap round 1 of 1 — Ada swaps or passes');
  });
});

describe('pane availability during a swap round — Amendment 3', () => {
  it('renders the board expand inert, with the swap-round reason', async () => {
    await openDraft({ swapRounds: 1 });

    const boardExpand = buttonNamed('Expand the draft board');
    expect(boardExpand?.getAttribute('aria-disabled')).toBe('true');
    // Focusable on purpose: a native `disabled` puts the explanation out of keyboard reach.
    expect(boardExpand?.hasAttribute('disabled')).toBe(false);

    const reasonId = boardExpand?.getAttribute('aria-describedby') ?? '';
    expect(reasonId).not.toBe('');
    expect(host.querySelector(`#${reasonId}`)?.textContent?.trim()).toBe(
      `— ${SWAP_ROUND_EXPAND_REASON}`,
    );
  });

  it('gives the pool expand the nearer reason too', async () => {
    await openDraft({ swapRounds: 1 });

    const poolExpand = buttonNamed('Expand the pool');
    expect(poolExpand?.getAttribute('aria-disabled')).toBe('true');
    expect(host.textContent).not.toContain('Available once the draft is complete');
  });

  it('sheds the inert ARIA the moment the swap rounds end — WR-04', async () => {
    await openDraft({
      swapRounds: 1,
      passes: [
        { playerId: 'p2', swapRound: 1 },
        { playerId: 'p1', swapRound: 1 },
      ],
    });

    const boardExpand = buttonNamed('Expand the draft board');
    expect(boardExpand?.hasAttribute('aria-disabled')).toBe(false);
    expect(boardExpand?.hasAttribute('aria-describedby')).toBe(false);
    expect(host.textContent).not.toContain(SWAP_ROUND_EXPAND_REASON);
  });
});

describe('the export gate — D-31', () => {
  it('renders no export panel and no checkpoint while a swap round is pending', async () => {
    await openDraft({ swapRounds: 1 });

    const state = getState();
    // The picks ARE complete. That used to be the whole gate, and it is why this matters.
    expect(state === null ? null : selectIsComplete(state)).toBe(true);
    expect(state === null ? null : selectIsTournamentComplete(state)).toBe(false);

    expect(host.querySelectorAll('.export-panel')).toHaveLength(0);
    expect(host.querySelector('.checkpoint-prompt')).toBeNull();
    expect(host.querySelector('.completed-draft')).toBeNull();
  });

  it('says why they are not there yet, in full', async () => {
    await openDraft({ swapRounds: 1 });
    expect(text('.swap-panel__pending')).toBe(EXPORTS_PENDING);
    expect(EXPORTS_PENDING).toBe(
      'Teams are not final until the swap rounds finish. Exports open then.',
    );
  });

  it('opens everything the moment the last swap round closes', async () => {
    await openDraft({
      swapRounds: 1,
      passes: [
        { playerId: 'p2', swapRound: 1 },
        { playerId: 'p1', swapRound: 1 },
      ],
    });

    expect(host.querySelectorAll('.export-panel')).toHaveLength(2);
    expect(host.querySelector('.checkpoint-prompt')).not.toBeNull();
    expect(host.querySelector('.swap-panel')).toBeNull();
    expect(host.textContent).not.toContain(EXPORTS_PENDING);
  });

  it('opens immediately at swapRounds 0, exactly as Phase 2 did', async () => {
    // The byte-identical case. With no swap rounds the two completion states coincide, so
    // a swap-free tournament must reach the completed screen with nothing in between.
    await openDraft({ swapRounds: 0 });

    expect(text('.turn-banner')).toBe('Draft complete — 12 picks, 2 teams');
    expect(host.querySelectorAll('.export-panel')).toHaveLength(2);
    expect(host.querySelector('.checkpoint-prompt')).not.toBeNull();
    expect(host.querySelector('.swap-panel')).toBeNull();
    // Nothing about swap rounds is rendered anywhere.
    expect(host.textContent).not.toContain('Swap round');
    expect(host.textContent).not.toContain(EXPORTS_PENDING);
  });

  it('exports the swapped-IN species and not the swapped-out one, once the round closes', async () => {
    await openDraft({ swapRounds: 1, swapBudget: 2 });

    // Cy swaps `mon-11` out of round 2 for `mon-2`, then Ada passes to close the round.
    await click(labelled('Swap Mon 11 out of round 2'));
    await click(labelled('Mon 2, Normal'));
    await click(buttonNamed(SWAP_CONFIRM.confirmLabel('Mon 2')));

    // The paste is NOT reachable yet — Ada has not moved, so the teams can still change.
    expect(host.querySelectorAll('.export-panel')).toHaveLength(0);

    await click(buttonNamed(PASS_LABEL));

    // Exact string equality on the WHOLE paste. `includes` would pass against a paste
    // separated by single newlines, which imports one Pokémon and silently drops five.
    //
    // Round 1 is the Mega round, so slot 1 exports with its stone and slot 2 does not —
    // `mon-2` can Mega and went into an OPEN slot, which is D-04's case that reads
    // backwards if the stone is taken off the species instead of off the slot.
    expect(pastes()[1]).toBe(
      'Mon 1 @ Mon 1ite\n\nMon 2\n\nMon 13\n\nMon 15\n\nMon 17\n\nMon 19\n',
    );
    expect(pastes()[1]).not.toContain('Mon 11');
  });
});
