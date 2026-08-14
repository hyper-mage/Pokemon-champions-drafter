// @vitest-environment happy-dom

/**
 * What happens to the OTHER tab — PERS-03 / D-12, and the two doors D-01 and D-36 opened.
 *
 * `read-only-shell.test.tsx` covers the attribute that stops a secondary being clicked.
 * This file covers the two ways a document moves between tabs while nobody is looking:
 * the landing screen's `Resume saved draft`, which reads a record another tab writes
 * through, and abandoning, which destroys one.
 *
 * The clobber these guard against does not look like a bug from inside one tab. Every
 * screen renders, every button works, and the only symptom is a draft that is quietly a
 * few picks behind — which is why the assertions here are on the store's pick count and on
 * storage, never on what is drawn.
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Hoisted so the `vi.mock` factory below can see it — `vi.mock` lifts above every import. */
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

/**
 * A recorder wrapped around the one function whose CALL ORDER is the fix.
 *
 * It records what the tournament key held at the instant the announcement went out, which
 * is the only way to assert "after `clearSaved()`" from outside `confirmAbandon` — a spy
 * that merely counted calls would pass just as happily with the two lines swapped, and
 * swapping them is precisely the bug: a secondary nudged while the record is still there
 * goes and reads back the document it was being told to let go of.
 */
const lockSpy = vi.hoisted(() => ({ abandonedWithKey: vi.fn<(raw: string | null) => void>() }));

vi.mock('../../src/adapters/tab-lock', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/adapters/tab-lock')>();
  return {
    ...actual,
    notifyAbandoned: (): void => {
      lockSpy.abandonedWithKey(localStorage.getItem('champions-drafter:tournament'));
      actual.notifyAbandoned();
    },
  };
});

import { App } from '../../src/app';
import { save as saveTournament } from '../../src/adapters/persistence';
import { CLAIM_WINDOW_MS, claimOwnership, disposeTabLock } from '../../src/adapters/tab-lock';
import { draftStarted, pickMade, poolBuilt, type Action, type Intent } from '../../src/core/actions';
import { SCHEMA_VERSION, type TournamentConfig, type TournamentDoc } from '../../src/core/model';
import { selectPickCount } from '../../src/core/selectors';
import { getState } from '../../src/store';
import { announce } from '../../src/ui/components/LiveRegion';
import { ABANDON_CONFIRM } from '../../src/ui/confirm-copy';

// ---------------------------------------------------------------------------

const TOURNAMENT_KEY = 'champions-drafter:tournament';

let host: HTMLDivElement;

beforeEach(() => {
  localStorage.clear();
  lockSpy.abandonedWithKey.mockClear();
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

function configOf(): TournamentConfig {
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
    megasRequiredPerTeam: 0,
    dualMegaChoices: [],
    depth: 'draftOnly',
  };
}

/** A well-shaped document carrying `picks` picks in plain rotation. */
function docWith(picks: number): TournamentDoc {
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
    stamp(draftStarted(['p1', 'p2'], 13), 1),
  ];

  for (let index = 0; index < picks; index += 1) {
    log.push(
      stamp(
        pickMade({
          playerId: index % 2 === 0 ? 'p1' : 'p2',
          monId: `mon-${index}`,
          round: Math.floor(index / 2) + 1,
          pickIndex: index,
        }),
        2 + index,
      ),
    );
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'multi-tab-fixture',
    createdAt: 1_770_000_000_000,
    config: configOf(),
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

function pickCount(): number {
  const state = getState();
  return state === null ? -1 : selectPickCount(state);
}

/**
 * A button INSIDE the open dialog.
 *
 * Scoped rather than searched page-wide because the trigger and the confirming button
 * share a label by design: `Abandon draft` names the top-bar control and the button that
 * carries it out. A page-wide lookup finds the trigger and re-opens the dialog.
 */
function dialogButtonNamed(name: string): HTMLButtonElement | undefined {
  const dialog = host.querySelector('[role="alertdialog"]');
  return Array.from(dialog?.querySelectorAll('button') ?? []).find(
    (button) => (button.textContent ?? '').trim() === name,
  );
}

// ---------------------------------------------------------------------------

describe('Resume saved draft adopts the record as it is NOW', () => {
  it('takes the picks written after this tab booted, not the boot snapshot', async () => {
    // Tab B opens on the landing screen. `saved` is pinned here, in a state initializer
    // during the first render, and nothing refreshes it afterwards.
    saveTournament(docWith(0));
    claimLock();
    await mountApp();

    expect(buttonNamed('Resume saved draft')).toBeDefined();

    // Tab A drafts three picks. Same origin, same key, same `save()` this tab uses.
    saveTournament(docWith(3));

    await click(buttonNamed('Resume saved draft'));

    // The assertion the pinned snapshot fails. Adopting `saved` puts tab B three picks
    // behind, `loadIfNewer` then reports "nothing newer" on promotion because the
    // generation already moved, and tab B's next autosave writes those three picks out of
    // existence — the T-01-40 clobber arriving through a state variable.
    expect(pickCount()).toBe(3);
  });

  it('still resumes when the record has not moved since boot', async () => {
    // The ordinary single-tab case, and the one a regression would hit hardest: a re-read
    // that returned null or the wrong document would break resume for everybody.
    saveTournament(docWith(2));
    claimLock();
    await mountApp();

    await click(buttonNamed('Resume saved draft'));

    expect(pickCount()).toBe(2);
    expect(host.querySelector('.draft-shell')).not.toBeNull();
  });
});

describe('abandoning tells the other tabs', () => {
  async function abandonAConfirmedDraft(): Promise<void> {
    saveTournament(docWith(3));
    claimLock();
    await mountApp();
    await click(buttonNamed('Resume saved draft'));

    await click(buttonNamed('Abandon draft'));
    await click(dialogButtonNamed(ABANDON_CONFIRM.confirmLabel));
  }

  it('announces the abandon on the channel, exactly once', async () => {
    await abandonAConfirmedDraft();

    // `clearSaved` removes a key and says nothing. A secondary therefore has no way to
    // learn this happened except by being told, and being told is what stops it holding
    // the destroyed tournament and writing it back after `Take over drafting here`.
    expect(lockSpy.abandonedWithKey).toHaveBeenCalledTimes(1);
  });

  it('announces it AFTER the record has gone, so a secondary that looks finds nothing', async () => {
    await abandonAConfirmedDraft();

    // The argument is what the tournament key held at the instant of the announcement.
    // Announcing first leaves a window in which the nudged tab reads back the record that
    // is about to be deleted — the ordering is the fix, not the call.
    expect(lockSpy.abandonedWithKey.mock.calls[0]?.[0]).toBeNull();
    expect(localStorage.getItem(TOURNAMENT_KEY)).toBeNull();
  });

  it('says nothing when the host keeps the draft', async () => {
    saveTournament(docWith(3));
    claimLock();
    await mountApp();
    await click(buttonNamed('Resume saved draft'));

    await click(buttonNamed('Abandon draft'));
    await click(dialogButtonNamed(ABANDON_CONFIRM.safeLabel));

    // The safe button is the whole point of the dialog. Announcing here would empty every
    // other tab over a draft nobody abandoned.
    expect(lockSpy.abandonedWithKey).not.toHaveBeenCalled();
    expect(pickCount()).toBe(3);
    expect(localStorage.getItem(TOURNAMENT_KEY)).not.toBeNull();
  });
});
