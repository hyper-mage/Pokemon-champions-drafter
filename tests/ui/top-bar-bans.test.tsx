// @vitest-environment happy-dom

/**
 * The top bar's `Bans (N)` disclosure — `04-UI-SPEC` Amendment 1, assertion S4.
 *
 * **This is the least obvious leak channel in the phase.** `TopBar` renders every banned
 * name behind a native `<summary>` that anyone standing in the room can open with one
 * click, and the blind stage's visual shield does not cover the chrome above it. Sourced
 * from `config.bans` alone it was correct for two shipped modes and a total disclosure for
 * the third.
 *
 * ## Asserted on CONTENT, and that is the whole design of this file
 *
 * A count assertion passes against a fixture with no submissions in it and proves nothing.
 * Every case below opens the disclosure and reads the list, and the blind rows name a
 * species that is genuinely in a submission — so a regression that widened the source back
 * to every ban would fail here rather than pass quietly.
 *
 * ## Why the real `App` rather than `TopBar` alone
 *
 * The narrowing lives at the SOURCE of the prop, in `app.tsx`, and `TopBar` gains no logic
 * at all. A test that rendered `TopBar` with a hand-built name list would assert its own
 * fixture. These mount the shell and read what the room would see.
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Hoisted so the `vi.mock` factory below can see it — `vi.mock` is lifted above imports. */
const fixture = vi.hoisted(() => {
  const entries = Array.from({ length: 20 }, (_, index) => ({
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

import { save as saveTournament } from '../../src/adapters/persistence';
import { disposeTabLock } from '../../src/adapters/tab-lock';
import { App } from '../../src/app';
import {
  bansPlaced,
  bansRevealed,
  bansSubmitted,
  draftStarted,
  poolBuilt,
  scheduleCompiled,
  type Action,
  type Intent,
} from '../../src/core/actions';
import { SCHEMA_VERSION, type TournamentConfig, type TournamentDoc } from '../../src/core/model';
import { announce } from '../../src/ui/components/LiveRegion';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ROUNDS = 6;

function stamp(intent: Intent, seq: number): Action {
  return { ...intent, seq, at: 1_770_000_000_000 + seq, actorId: 'host' };
}

function schedule() {
  return Array.from({ length: ROUNDS }, (_, index) => ({
    index: index + 1,
    kind: 'open' as const,
  }));
}

function configFor(
  banMode: TournamentConfig['banMode'],
  bans: readonly string[],
  bansPerPlayer: number,
): TournamentConfig {
  return {
    formatLabel: 'Champions MB',
    players: [
      { id: 'p1', name: 'Ada' },
      { id: 'p2', name: 'Bo' },
    ],
    rounds: ROUNDS,
    rosterVersion: 'mb',
    rosterChecksum: 'test-checksum',
    poolSize: 12,
    bans: [...bans],
    banMode,
    megasRequiredPerTeam: 0,
    dualMegaChoices: [],
    depth: 'draftOnly',
    rules: [{ kind: 'mega', count: 0 }],
    megaFormeBans: [],
    swapBudget: 0,
    swapRounds: 0,
    bansPerPlayer,
    duplicateBanPolicy: 'bothApply',
  };
}

/**
 * Seed a saved document straight to storage.
 *
 * `fold` runs no `canApply`, so a document may be assembled here without walking the
 * dispatch path — the same shape `read-only-shell.test.tsx` uses, and it keeps these cases
 * about the disclosure rather than about how each mode is started.
 */
function seed(config: TournamentConfig, intents: readonly Intent[]): void {
  const doc: TournamentDoc = {
    schemaVersion: SCHEMA_VERSION,
    id: 'top-bar-bans-fixture',
    createdAt: 1_770_000_000_000,
    config,
    rng: { seed: 0x5f3a91c2, cursor: 0 },
    log: intents.map((intent, index) => stamp(intent, index)),
  };

  expect(saveTournament(doc)).toBe(true);
}

/** The twelve species a drawn pool holds, taken off the end so the bans stay outside it. */
const POOL_IDS = Array.from({ length: 12 }, (_, index) => `mon-${index + 8}`);

function drawnPool(): Intent {
  return poolBuilt(POOL_IDS, 'mb', 'test-checksum', 7, 0);
}

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
  announce('');
});

async function mountApp(): Promise<void> {
  await act(async () => {
    render(<App />, host);
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

function buttonNamed(label: string): HTMLButtonElement | undefined {
  return Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(
    (button) => button.textContent?.trim() === label,
  );
}

async function resumeSaved(): Promise<void> {
  const resume = buttonNamed('Resume saved draft');
  expect(resume).toBeDefined();

  await act(async () => {
    resume?.click();
    await Promise.resolve();
  });
}

/** The disclosure, or `null` when nothing is banned and it is not rendered at all. */
function disclosure(): HTMLDetailsElement | null {
  return host.querySelector<HTMLDetailsElement>('.top-bar__bans');
}

function summaryText(): string | null {
  return host.querySelector('.top-bar__bans-summary')?.textContent ?? null;
}

/**
 * What the room reads after one click on the `<summary>`.
 *
 * The list is in the DOM whether the `<details>` is open or shut, which is exactly why the
 * closed state is no protection at all — reading it without opening anything is the honest
 * model of a person in the room opening it.
 */
function disclosedNames(): string[] {
  return Array.from(host.querySelectorAll<HTMLElement>('.top-bar__bans-list li')).map(
    (item) => item.textContent ?? '',
  );
}

// ---------------------------------------------------------------------------
// Amendment 1, row by row
// ---------------------------------------------------------------------------

describe('row 1 — hostBanlist, at any time', () => {
  it('discloses the host banlist, exactly as it did before this phase', async () => {
    seed(configFor('hostBanlist', ['mon-0', 'mon-1'], 0), [
      scheduleCompiled(schedule()),
      draftStarted(['p1', 'p2'], 13),
      drawnPool(),
    ]);

    await mountApp();
    await resumeSaved();

    expect(summaryText()).toBe('Bans (2)');
    expect(disclosedNames()).toEqual(['Mon 0', 'Mon 1']);
  });
});

describe('row 2 — snake, during and after the stage', () => {
  it('grows as bans are placed, because a snake ban is public the instant it lands', async () => {
    seed(configFor('snake', ['mon-0'], 2), [
      scheduleCompiled(schedule()),
      draftStarted(['p1', 'p2'], 13),
      bansPlaced('p1', 'mon-5', 1),
      bansPlaced('p2', 'mon-6', 1),
    ]);

    await mountApp();
    await resumeSaved();

    expect(summaryText()).toBe('Bans (3)');
    expect(disclosedNames()).toEqual(['Mon 0', 'Mon 5', 'Mon 6']);
  });
});

describe('row 3 — blind, before bans/revealed', () => {
  /**
   * THE ROW THIS WHOLE FILE EXISTS FOR.
   *
   * Three of six submissions are in the log, in plaintext (D-06). The disclosure must carry
   * the host's banlist and nothing else — asserted by naming a species that IS in a
   * submission and requiring it absent, which is the assertion a count could not make.
   */
  it('carries the host banlist only, with submissions already in the log', async () => {
    seed(configFor('blind', ['mon-0'], 2), [
      scheduleCompiled(schedule()),
      draftStarted(['p1', 'p2'], 13),
      bansSubmitted('p1', ['mon-5', 'mon-6']),
    ]);

    await mountApp();
    await resumeSaved();

    expect(summaryText()).toBe('Bans (1)');
    expect(disclosedNames()).toEqual(['Mon 0']);
    expect(disclosedNames()).not.toContain('Mon 5');
    expect(disclosedNames()).not.toContain('Mon 6');
  });

  it('leaks no submitted species anywhere on the locked screen, chrome included', async () => {
    seed(configFor('blind', ['mon-0'], 2), [
      scheduleCompiled(schedule()),
      draftStarted(['p1', 'p2'], 13),
      bansSubmitted('p1', ['mon-5', 'mon-6']),
    ]);

    await mountApp();
    await resumeSaved();

    const rendered = host.textContent ?? '';
    expect(rendered).toContain('1 of 2 entered');
    for (const name of ['Mon 5', 'Mon 6', 'Mon 7']) {
      expect(rendered).not.toContain(name);
    }
  });

  /**
   * `04-UI-SPEC` Amendment 2 and §3: blind's locked screen is a read-and-act screen like
   * the landing screen, so it takes `.app-shell`. `read-only-shell.test.tsx` asserts the
   * snake half of the same three-way branch.
   */
  it('wears the app shell rather than the draft shell', async () => {
    seed(configFor('blind', [], 2), [
      scheduleCompiled(schedule()),
      draftStarted(['p1', 'p2'], 13),
    ]);

    await mountApp();
    await resumeSaved();

    expect(host.querySelector('.app-shell')).not.toBeNull();
    expect(host.querySelector('.draft-shell')).toBeNull();
  });
});

describe('row 4 — blind, after bans/revealed', () => {
  it('discloses every revealed ban alongside the host banlist', async () => {
    seed(configFor('blind', ['mon-0'], 2), [
      scheduleCompiled(schedule()),
      draftStarted(['p1', 'p2'], 13),
      bansSubmitted('p1', ['mon-5', 'mon-6']),
      bansSubmitted('p2', ['mon-7', 'mon-6']),
      bansRevealed([
        { playerId: 'p1', monIds: ['mon-5', 'mon-6'] },
        { playerId: 'p2', monIds: ['mon-7', 'mon-6'] },
      ]),
      drawnPool(),
    ]);

    await mountApp();
    await resumeSaved();

    // FOUR, not five. `mon-6` is a collision — two submissions and one banned species —
    // which is the number `revealed.flatMap(...).length` gets wrong by exactly the number
    // of collisions, and the reason `bannedEntries` stays the one source of the count.
    expect(summaryText()).toBe('Bans (4)');
    expect(disclosedNames()).toEqual(['Mon 0', 'Mon 5', 'Mon 6', 'Mon 7']);
  });
});

// ---------------------------------------------------------------------------
// The two shipped behaviours that stay
// ---------------------------------------------------------------------------

describe('the disclosure keeps what it already was', () => {
  it('is not rendered at all when nothing is banned', async () => {
    seed(configFor('hostBanlist', [], 0), [
      scheduleCompiled(schedule()),
      draftStarted(['p1', 'p2'], 13),
      drawnPool(),
    ]);

    await mountApp();
    await resumeSaved();

    expect(disclosure()).toBeNull();
  });

  it('holds no control, so nothing in it can edit the banlist', async () => {
    seed(configFor('hostBanlist', ['mon-0', 'mon-1'], 0), [
      scheduleCompiled(schedule()),
      draftStarted(['p1', 'p2'], 13),
      drawnPool(),
    ]);

    await mountApp();
    await resumeSaved();

    const details = disclosure();
    expect(details).not.toBeNull();
    expect(details?.querySelectorAll('button, a, input, select, textarea').length).toBe(0);
  });
});
