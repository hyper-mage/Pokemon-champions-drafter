// @vitest-environment happy-dom

/**
 * The filter-result announcement, and the one it must never overwrite.
 *
 * Two failure modes live here and only one of them is cosmetic.
 *
 * The cosmetic one is Pitfall 10: assistive technology announces a CHANGE to the live
 * region, so byte-identical consecutive text is silent the second time. `LiveRegion`'s own
 * doc block records this and records that it was left undone because "no surface in this
 * phase repeats a message" — this is the first surface that does, and it is handled at the
 * call site rather than by making `announce` two-frame for every existing caller.
 *
 * The one that matters is the ordering. A pick clears the filters; the clear looks exactly
 * like a filter change; 300ms later `{n} of {total} Pokémon match.` lands on top of
 * `Round 2 of 6 — Bo picks` on a screen eight people are reading. That is the failure a
 * person at the table would notice and be unable to explain, and the test that defends it
 * is named for it.
 *
 * Fake timers throughout the assertions, so both the 300ms debounce and the zero-delay
 * repeat clear are driven deterministically rather than waited on.
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
import { draftStarted, poolBuilt, type Action, type Intent } from '../../src/core/actions';
import { SCHEMA_VERSION, type TournamentConfig, type TournamentDoc } from '../../src/core/model';
import type { RosterEntry } from '../../src/core/roster/types';
import { announce, LiveRegion } from '../../src/ui/components/LiveRegion';
import { PoolGrid } from '../../src/ui/components/PoolGrid';

// ---------------------------------------------------------------------------

const ENTRIES = fixture.entries as unknown as readonly RosterEntry[];
const SPRITE_META = fixture.bundle.spriteMeta;

let host: HTMLDivElement;

beforeEach(() => {
  localStorage.clear();
  // A module-level signal outlives every render, so a stale message would satisfy the
  // next assertion here for the wrong reason.
  announce('');
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(() => {
  render(null, host);
  host.remove();
  disposeTabLock();
  vi.useRealTimers();
  localStorage.clear();
});

function liveRegionText(): string {
  return host.querySelector('[aria-live="polite"]')?.textContent ?? '';
}

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

// ---------------------------------------------------------------------------
// The debounce, against the grid on its own
// ---------------------------------------------------------------------------

function mountGrid(bannedIds: ReadonlySet<string> | null = null): void {
  act(() => {
    render(
      <>
        <PoolGrid
          entries={ENTRIES}
          spriteMeta={SPRITE_META}
          onPick={() => undefined}
          bannedIds={bannedIds}
        />
        <LiveRegion />
      </>,
      host,
    );
  });
}

function searchField(): HTMLInputElement {
  const input = host.querySelector<HTMLInputElement>('#pool-search');
  if (input === null) throw new Error('the pool search field is not on the screen');
  return input;
}

function typeSearch(text: string): void {
  act(() => {
    const input = searchField();
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function cards(): HTMLButtonElement[] {
  return [...host.querySelectorAll<HTMLButtonElement>('.mon-card')];
}

describe('the filter result is announced once the host stops typing', () => {
  beforeEach(() => {
    mountGrid();
    vi.useFakeTimers();
  });

  it('says nothing at 299ms and the whole sentence at 300ms', () => {
    typeSearch('Mon 1');

    advance(299);
    expect(liveRegionText()).toBe('');

    advance(1);
    expect(liveRegionText()).toBe(`${cards().length} of ${ENTRIES.length} Pokémon match.`);
  });

  it('collapses three changes inside one window into one announcement of the final counts', () => {
    typeSearch('Mon');
    advance(100);
    typeSearch('Mon 1');
    advance(100);
    typeSearch('Mon 11');
    advance(100);

    // 300ms have passed in total, but only 100 since the last change.
    expect(liveRegionText()).toBe('');

    advance(200);
    expect(liveRegionText()).toBe(`1 of ${ENTRIES.length} Pokémon match.`);
  });

  it('says nothing at all when the grid merely mounts', () => {
    advance(1000);

    expect(liveRegionText()).toBe('');
  });

  it('announces the whole pool again when the filters are cleared by hand', () => {
    typeSearch('Mon 1');
    advance(300);

    act(() => {
      [...host.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent?.trim() === 'Clear filters')
        ?.click();
    });
    advance(300);

    expect(liveRegionText()).toBe(`${ENTRIES.length} of ${ENTRIES.length} Pokémon match.`);
  });

  /**
   * Pitfall 10, made observable. Two different queries selecting the same number of
   * species produce byte-identical text, and the region has to be seen EMPTY between them
   * or the second one is silent.
   */
  it('clears the region first when the next announcement is byte-identical', () => {
    typeSearch('Mon 11');
    advance(300);
    const spoken = liveRegionText();
    expect(spoken).toBe(`1 of ${ENTRIES.length} Pokémon match.`);

    typeSearch('Mon 12');
    advance(300);

    // Empty on the debounce tick, and COMMITTED empty: this assertion runs after `act`
    // has flushed the render, which is the whole difference between this and a same-tick
    // clear that the DOM never observes.
    expect(liveRegionText()).toBe('');

    // ...and the same sentence again one macrotask later, which is what makes it heard.
    advance(1);
    expect(liveRegionText()).toBe(spoken);
  });

  it('pays nothing when the next announcement differs', () => {
    typeSearch('Mon 11');
    advance(300);

    typeSearch('Mon 1');
    advance(300);

    // No intermediate empty value: the text differs, so the change is a change.
    expect(liveRegionText()).toBe(`${cards().length} of ${ENTRIES.length} Pokémon match.`);
  });
});

describe('ban mode', () => {
  it('leaves the filters alone when a cell is toggled, and never says anything was cleared', () => {
    mountGrid(new Set());
    vi.useFakeTimers();

    typeSearch('Mon 1');
    advance(300);

    act(() => {
      cards()[0]?.click();
    });
    advance(1000);

    expect(searchField().value).toBe('Mon 1');
    expect(liveRegionText()).not.toContain('Filters cleared.');
  });

  /**
   * THE THIRD OVERWRITE ROUTE, and the one the draft screen's safety net does not cover.
   *
   * In draft mode a pick moves `entries.length`, so the effect re-runs and the previous
   * run's cleanup cancels the pending timer even when nothing was cleared. In ban mode
   * none of the three dependencies moves — `entries` is the whole roster prop, `visible`
   * derives from it and `compiled`, and `filters` is untouched — so the effect does not
   * re-run and the timer survives to land on top of the ban confirmation.
   *
   * That confirmation is the only feedback a screen-reader user gets that the click
   * registered at all, which is what makes this more than a cosmetic ordering defect.
   */
  it('does not let a pending filter result swallow the ban announcement', () => {
    const BAN_SENTENCE = 'Mon 1 banned. 1 ban.';

    act(() => {
      render(
        <>
          <PoolGrid
            entries={ENTRIES}
            spriteMeta={SPRITE_META}
            // What `ConfigScreen.applyBan` does: one announcement per toggle.
            onPick={() => announce(BAN_SENTENCE)}
            bannedIds={new Set()}
          />
          <LiveRegion />
        </>,
        host,
      );
    });
    vi.useFakeTimers();

    typeSearch('Mon 1');
    // Short of the debounce on purpose: a timer is genuinely in flight at the moment of
    // the click, which is the whole of the failure.
    advance(150);
    expect(liveRegionText()).not.toContain('Pokémon match.');

    act(() => {
      cards()[0]?.click();
    });
    expect(liveRegionText()).toBe(BAN_SENTENCE);

    advance(1000);
    expect(liveRegionText()).toBe(BAN_SENTENCE);
  });
});

describe('the density control', () => {
  it('does not let a pending filter result swallow the density announcement', () => {
    mountGrid();
    vi.useFakeTimers();

    typeSearch('Mon 1');
    advance(150);

    act(() => {
      host.querySelector<HTMLInputElement>('#pool-density-full')?.click();
    });
    expect(liveRegionText()).toBe('Display density: Full.');

    // Density moves none of the effect's dependencies either, so nothing but the explicit
    // cancellation stops the filter result arriving on top of it — on both screens.
    advance(1000);
    expect(liveRegionText()).toBe('Display density: Full.');
  });
});

// ---------------------------------------------------------------------------
// The whole app: whose turn it is, and what must never overwrite it
// ---------------------------------------------------------------------------

function stamp(intent: Intent, seq: number): Action {
  return { ...intent, seq, at: 1_770_000_000_000 + seq, actorId: 'host' };
}

const CONFIG: TournamentConfig = {
  formatLabel: 'Champions MB',
  players: [
    { id: 'p1', name: 'Ada' },
    { id: 'p2', name: 'Bo' },
  ],
  rounds: 6,
  rosterVersion: 'mb',
  rosterChecksum: 'test-checksum',
  poolSize: 24,
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

function seedSavedDraft(): void {
  const doc: TournamentDoc = {
    schemaVersion: SCHEMA_VERSION,
    id: 'pool-filter-announce-fixture',
    createdAt: 1_770_000_000_000,
    config: CONFIG,
    rng: { seed: 0x5f3a91c2, cursor: 0 },
    log: [
      stamp(poolBuilt(Array.from({ length: 24 }, (_, index) => `mon-${index}`), 'mb', 'test-checksum', 23, 0), 0),
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

async function reachDraft(): Promise<void> {
  seedSavedDraft();
  claimLock();

  await act(async () => {
    render(<App />, host);
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });

  const resume = [...host.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === 'Resume saved draft',
  );
  expect(resume).toBeDefined();
  await act(async () => {
    resume?.click();
    await Promise.resolve();
  });
}

async function clickFirstCell(): Promise<void> {
  const cell = cards()[0];
  expect(cell).toBeDefined();
  await act(async () => {
    cell?.click();
    await Promise.resolve();
  });
}

describe('the filter bar cannot overwrite whose turn it is', () => {
  /**
   * THE assertion this whole mechanism exists for.
   *
   * Without the cancellation in `handleActivate` and the suppression that goes with it,
   * this test reads `Round 2 of 6 — Bo picks. Filters cleared.` at the moment of the click
   * and `{n} of {total} Pokémon match.` three hundred milliseconds later — replacing the
   * one fact a shared screen must never lose with a fact nobody asked for.
   */
  it('a pick that clears a filter announces the turn, and nothing arrives after it', async () => {
    await reachDraft();
    vi.useFakeTimers();

    typeSearch('Mon 1');
    advance(300);
    // The filter really did have the region a moment ago, which is what makes the next
    // assertion about ordering rather than about an announcement that never happened.
    expect(liveRegionText()).toMatch(/^\d+ of 24 Pokémon match\.$/);

    await clickFirstCell();

    expect(liveRegionText()).toBe('Round 1 of 6 — Bo picks. Filters cleared.');

    // The clear is itself a filter change, so an unsuppressed one would schedule a fresh
    // announcement here and land it on top of the turn three hundred milliseconds later.
    advance(1000);
    expect(liveRegionText()).toBe('Round 1 of 6 — Bo picks. Filters cleared.');
  });

  it('cancels an announcement that was still pending when the pick landed', async () => {
    await reachDraft();
    vi.useFakeTimers();

    typeSearch('Mon 1');
    // Deliberately short of the debounce: a timer is genuinely in flight at the moment of
    // the click, which is the other half of the same failure.
    advance(100);
    expect(liveRegionText()).not.toMatch(/Pokémon match\./);

    await clickFirstCell();
    advance(1000);

    expect(liveRegionText()).toBe('Round 1 of 6 — Bo picks. Filters cleared.');
  });

  it('a pick with no filter active announces the turn with no suffix', async () => {
    await reachDraft();
    vi.useFakeTimers();

    await clickFirstCell();

    expect(liveRegionText()).toBe('Round 1 of 6 — Bo picks');

    advance(1000);
    expect(liveRegionText()).toBe('Round 1 of 6 — Bo picks');
  });

  it('never puts the suffix on the banner a sighted host reads', async () => {
    await reachDraft();

    typeSearch('Mon 1');
    await clickFirstCell();

    const banner = host.querySelector('.turn-banner');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toBe('Round 1 of 6 — Bo picks');
    expect(banner?.textContent).not.toContain('Filters cleared.');
  });

  it('drops the suffix on the turn change an undo causes', async () => {
    await reachDraft();

    typeSearch('Mon 1');
    await clickFirstCell();
    expect(liveRegionText()).toBe('Round 1 of 6 — Bo picks. Filters cleared.');

    const undoButton = [...host.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Undo last move',
    );
    expect(undoButton).toBeDefined();
    await act(async () => {
      undoButton?.click();
      await Promise.resolve();
    });

    expect(liveRegionText()).toBe('Round 1 of 6 — Ada picks');
  });
});
