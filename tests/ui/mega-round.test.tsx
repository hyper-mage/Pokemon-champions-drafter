// @vitest-environment happy-dom

/**
 * The pool during a Mega round — RULE-03, DRFT-09, D-16, 03-UI-SPEC section 9.
 *
 * The claim under test is that an illegal pick is UNREACHABLE rather than rejected. There
 * is no post-pick validator anywhere in this phase by design, so the offer itself is what
 * enforces the composition rule — which makes "the grid holds only species that can still
 * Mega" a correctness assertion here, not a cosmetic one.
 *
 * Two levels, deliberately:
 *
 *   `PoolGrid` mounted directly, against the REAL committed snapshot, for the count line,
 *   the restriction sentence, the inert control and the three empty states. Every
 *   expectation is derived from the snapshot rather than typed, because the roster rotates
 *   roughly every 2.5 months and a hardcoded figure would date this file (D-17).
 *
 *   `App` mounted over a saved two-Mega document, for the part no component test can
 *   reach: that `selectRoundEligibleIds` is what narrows the real pool, and that a document
 *   whose picks disagree with its own schedule is REPORTED rather than repaired.
 *
 * What this file cannot prove: happy-dom performs no layout, so whether the restriction
 * sentence wraps onto its own line beside the count at a narrow width, and whether it
 * reads as current state rather than as chrome, are human-verify questions. Nothing here
 * measures a pixel or resolves a custom property.
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Hoisted so the `vi.mock` factory below can see it — `vi.mock` lifts above every import. */
const fixture = vi.hoisted(() => {
  // Every third entry can Mega, so the eligible subset is a proper subset of the pool and
  // the two counts in `{n} of {total} available` are genuinely different numbers.
  const entries = Array.from({ length: 36 }, (_, index) => {
    const megaCapable = index % 3 === 0;
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
              id: `mon-${index}mega`,
              name: `Mon ${index}-Mega`,
              forme: 'Mega',
              requiredItem: `Mon ${index}ite`,
              spriteId: null,
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
          megaFormes: entries.filter((row) => row.megaCapable).length,
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

import committedSnapshot from '../../public/data/roster.mb.json';
import { save as saveTournament } from '../../src/adapters/persistence';
import type { SpriteMeta } from '../../src/adapters/roster-source';
import { claimOwnership, CLAIM_WINDOW_MS, disposeTabLock } from '../../src/adapters/tab-lock';
import { App } from '../../src/app';
import {
  draftStarted,
  pickMade,
  poolBuilt,
  scheduleCompiled,
  type Action,
  type Intent,
  type RoundKind,
} from '../../src/core/actions';
import { SCHEMA_VERSION, type TournamentConfig, type TournamentDoc } from '../../src/core/model';
import type { RosterEntry, RosterSnapshot } from '../../src/core/roster/types';
import { announce } from '../../src/ui/components/LiveRegion';
import { PoolGrid } from '../../src/ui/components/PoolGrid';

// ---------------------------------------------------------------------------

const SNAPSHOT = committedSnapshot as unknown as RosterSnapshot;
const ENTRIES: readonly RosterEntry[] = SNAPSHOT.entries;

/** A leftover pool the size a real one reaches, taken from the committed snapshot. */
const POOL: readonly RosterEntry[] = ENTRIES.slice(0, 40);

/** The subset a Mega round would offer: every pool entry that still has a Mega forme. */
const ELIGIBLE: readonly RosterEntry[] = POOL.filter((entry) => entry.megaFormes.length > 0);
const ELIGIBLE_IDS: ReadonlySet<string> = new Set(ELIGIBLE.map((entry) => entry.id));

const SPRITE_META: SpriteMeta = { nativeWidth: 96, nativeHeight: 96, byRosterId: {} };

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

// ---------------------------------------------------------------------------
// The pool grid, against the real snapshot
// ---------------------------------------------------------------------------

/** Mount the pool for round `round`, restricted to `ids`, or unrestricted at `null`. */
function mountPool(round: number | null, ids: ReadonlySet<string> = ELIGIBLE_IDS): void {
  localStorage.setItem(VIEW_KEY, JSON.stringify({ density: 'standard', pane: 'split' }));
  act(() => {
    render(
      <PoolGrid
        entries={POOL}
        spriteMeta={SPRITE_META}
        onPick={() => undefined}
        bannedIds={null}
        roundRestriction={round === null ? null : { kind: 'mega', round, ids }}
      />,
      host,
    );
  });
}

function cards(): HTMLButtonElement[] {
  return [...host.querySelectorAll<HTMLButtonElement>('.mon-card')];
}

function cardNames(): string[] {
  return cards().map((card) => card.querySelector('.mon-card__name')?.textContent ?? '');
}

function countLine(): string {
  return host.querySelector('.pool__count')?.textContent ?? '';
}

function restrictionLine(): string | null {
  return host.querySelector('.pool__restriction')?.textContent ?? null;
}

function megaWrapper(): HTMLElement {
  const element = host.querySelector<HTMLElement>('.filter-bar__mega');
  if (element === null) throw new Error('the Mega capability control is not on the screen');
  return element;
}

function emptyState(): { heading: string; body: string; action: string | null } | null {
  const root = host.querySelector('.pool__empty');
  if (root === null) return null;
  return {
    heading: root.querySelector('.pool__empty-heading')?.textContent ?? '',
    body: root.querySelector('.pool__empty-body')?.textContent ?? '',
    action: root.querySelector('.pool__empty-action')?.textContent ?? null,
  };
}

function typeSearch(text: string): void {
  act(() => {
    const input = host.querySelector<HTMLInputElement>('#pool-search');
    if (input === null) throw new Error('the pool search field is not on the screen');
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function pressType(type: string): void {
  const button = [...host.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button')].find(
    (candidate) => (candidate.getAttribute('aria-label') ?? candidate.textContent ?? '') === type,
  );
  if (button === undefined) throw new Error(`no filter button for ${type}`);
  act(() => {
    button.click();
  });
}

function buttonLabelled(text: string): HTMLButtonElement | undefined {
  return [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent?.trim() === text,
  );
}

describe('the pool during a Mega round', () => {
  it('offers only species that can still Mega', () => {
    mountPool(1);

    // A proper subset, and the fixture premise asserted rather than assumed — a snapshot
    // where every pool entry could Mega would make every assertion below vacuous.
    expect(ELIGIBLE.length).toBeGreaterThan(0);
    expect(ELIGIBLE.length).toBeLessThan(POOL.length);

    expect(cards()).toHaveLength(ELIGIBLE.length);
    expect(cardNames()).toEqual(ELIGIBLE.map((entry) => entry.name));
  });

  it('uses the "of" count form even with no filter touched, because the pool IS filtered', () => {
    mountPool(1);

    expect(countLine()).toBe(`${ELIGIBLE.length} of ${POOL.length} available`);
  });

  it('states the restriction beside the count, in full', () => {
    mountPool(1);

    expect(restrictionLine()).toBe(
      'Round 1 is a Mega round — only Pokémon that can still Mega are shown.',
    );
  });

  it('names the round it is actually on', () => {
    mountPool(2);

    expect(restrictionLine()).toBe(
      'Round 2 is a Mega round — only Pokémon that can still Mega are shown.',
    );
  });

  it('says nothing and counts plainly in an open round', () => {
    mountPool(null);

    expect(restrictionLine()).toBeNull();
    expect(countLine()).toBe(`${POOL.length} available`);
    expect(cards()).toHaveLength(POOL.length);
  });
});

describe('the Mega capability control during a Mega round', () => {
  it('is inert with the round as its stated reason', () => {
    mountPool(1);

    expect(megaWrapper().getAttribute('aria-disabled')).toBe('true');
    // The separator is markup beside the copy, so the whole visible line is one string and
    // the reason constant excludes it.
    expect(host.querySelector('.filter-bar__mega-reason')?.textContent).toBe(
      '— Round 1 is a Mega round',
    );
  });

  /**
   * WR-04, and this is its second consumer rather than a second mechanism.
   *
   * `undefined` and never `'false'`: plenty of assistive technology reads the mere presence
   * of `aria-disabled` as disabled, so a control that kept the attribute after the round
   * ended would be permanently unusable to exactly the hosts who most need the reason.
   */
  it('sheds the ARIA when the round ends', () => {
    mountPool(1);
    expect(megaWrapper().getAttribute('aria-disabled')).toBe('true');

    // Round 3 of a two-Mega schedule is open.
    mountPool(null);

    expect(megaWrapper().getAttribute('aria-disabled')).toBeNull();
    expect(host.querySelector('.filter-bar__mega-reason')).toBeNull();
  });

  it('refuses a change to the Mega mode while the round is on', () => {
    mountPool(1);

    act(() => {
      host.querySelector<HTMLInputElement>('#pool-mega-filter-nonMega')?.click();
    });

    expect(host.querySelector<HTMLInputElement>('#pool-mega-filter-nonMega')?.checked).toBe(false);
    expect(host.querySelector<HTMLInputElement>('#pool-mega-filter-all')?.checked).toBe(true);
    expect(cards()).toHaveLength(ELIGIBLE.length);
  });
});

describe('search and the type filters compose with the restriction', () => {
  it('narrows the Mega-only pool rather than replacing it', () => {
    mountPool(1);

    const first = ELIGIBLE[0];
    expect(first).toBeDefined();
    if (first === undefined) return;

    typeSearch(first.name);

    expect(cardNames()).toContain(first.name);
    expect(cards().length).toBeLessThan(ELIGIBLE.length);
  });

  it('cannot reach a species the round excludes, however it is searched for', () => {
    const excluded = POOL.find((entry) => !ELIGIBLE_IDS.has(entry.id));
    expect(excluded).toBeDefined();
    if (excluded === undefined) return;

    mountPool(1);
    typeSearch(excluded.name);

    expect(cardNames()).not.toContain(excluded.name);
    expect(cards()).toHaveLength(0);
  });

  it('applies the type filters inside the restriction', () => {
    mountPool(1);
    pressType('Water');

    const expected = ELIGIBLE.filter((entry) => entry.types.includes('Water'));
    expect(expected.length).toBeGreaterThan(0);
    expect(cardNames()).toEqual(expected.map((entry) => entry.name));
  });
});

describe('Clear filters and the round restriction', () => {
  it('does not appear on account of the restriction alone', () => {
    mountPool(1);

    // A `Clear filters` button here would be offering to switch off a rule.
    expect(buttonLabelled('Clear filters')).toBeUndefined();
  });

  it('appears once the host filters, and clearing does not widen the offer', () => {
    mountPool(1);
    pressType('Water');

    const clear = buttonLabelled('Clear filters');
    expect(clear).toBeDefined();

    act(() => {
      clear?.click();
    });

    expect(cards()).toHaveLength(ELIGIBLE.length);
    expect(restrictionLine()).toBe(
      'Round 1 is a Mega round — only Pokémon that can still Mega are shown.',
    );
    expect(countLine()).toBe(`${ELIGIBLE.length} of ${POOL.length} available`);
  });
});

describe('the empty states of a Mega round', () => {
  it('names the round and the query when a search matches nothing', () => {
    mountPool(1);
    typeSearch('zzzznothing');

    expect(emptyState()).toEqual({
      heading: 'No Pokémon match',
      body: 'Nothing in round 1\'s Mega-only pool matches "zzzznothing".',
      action: 'Clear the search',
    });
  });

  it('blames the types when the type filters match nothing', () => {
    // A type carried by something in the pool and by nothing the round admits. Derived
    // rather than named, and asserted to exist — the day a rotation removes the case, this
    // fails loudly instead of passing for the wrong reason.
    const eligibleTypes = new Set(ELIGIBLE.flatMap((entry) => entry.types));
    const excludedType = [...new Set(POOL.flatMap((entry) => entry.types))].find(
      (type) => !eligibleTypes.has(type),
    );
    expect(excludedType, 'expected a type no eligible pool entry carries').toBeDefined();
    if (excludedType === undefined) return;

    mountPool(1);
    pressType(excludedType);

    expect(emptyState()).toEqual({
      heading: 'No Pokémon match',
      body: 'No Pokémon that can still Mega is left in the pool with those types.',
      action: 'Clear filters',
    });
  });

  /**
   * RESEARCH Open Question 2, resolved: the offer is NEVER widened.
   *
   * Reachable only from an imported or hand-edited document — the RULE-09 gate is the
   * guarantee for documents this build creates. A fallback that quietly showed the
   * non-Mega pool here would be the post-pick validator this phase exists to remove,
   * wearing a friendlier name, and nothing downstream would catch the team it produced.
   */
  it('explains an empty offer and offers nothing else', () => {
    mountPool(1, new Set());

    expect(emptyState()).toEqual({
      heading: 'No Pokémon can Mega here',
      body:
        'Round 1 is a Mega round, and nothing left in the pool can still Mega. Undo a pick to' +
        ' return one, or start a new tournament.',
      // No action. There is no filter to clear, and a button here would be one keystroke
      // away from becoming a widen-the-offer button.
      action: null,
    });

    expect(cards()).toHaveLength(0);
    expect(countLine()).toBe(`0 of ${POOL.length} available`);
  });

  it('keeps the unrestricted empty states unchanged in an open round', () => {
    mountPool(null);
    typeSearch('zzzznothing');

    expect(emptyState()?.body).toBe(
      'Nothing in the pool matches "zzzznothing". Try part of the name — "wash" finds' +
        ' Rotom-Wash — or clear the search.',
    );
  });
});

// ---------------------------------------------------------------------------
// The whole slice, through `App` over a saved two-Mega document
// ---------------------------------------------------------------------------

const MEGA_POOL_IDS = fixture.bundle.snapshot.entries
  .filter((entry) => entry.megaCapable)
  .map((entry) => entry.id);

function stamp(intent: Intent, seq: number): Action {
  return { ...intent, seq, at: 1_770_000_000_000 + seq, actorId: 'host' };
}

const APP_CONFIG: TournamentConfig = {
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
  megasRequiredPerTeam: 2,
  dualMegaChoices: [],
  depth: 'draftOnly',
  rules: [{ kind: 'mega', count: 2 }],
  megaFormeBans: [],
  swapBudget: 0,
  swapRounds: 0,
};

/** Rounds 1 and 2 Mega, the rest open — what `compile` emits for a two-Mega tournament. */
const TWO_MEGA: readonly RoundKind[] = ['mega', 'mega', 'open', 'open', 'open', 'open'];

function seedSavedDraft(picks: readonly { playerId: string; monId: string; round: number }[]): void {
  const log: Action[] = [
    stamp(
      poolBuilt(
        Array.from({ length: 24 }, (_, index) => `mon-${index}`),
        'mb',
        'test-checksum',
        23,
        MEGA_POOL_IDS.length,
      ),
      0,
    ),
    stamp(
      scheduleCompiled(TWO_MEGA.map((kind, position) => ({ index: position + 1, kind }))),
      1,
    ),
    stamp(draftStarted(['p1', 'p2'], 13), 2),
  ];

  picks.forEach((pick, pickIndex) => {
    log.push(stamp(pickMade({ ...pick, pickIndex }), log.length));
  });

  const doc: TournamentDoc = {
    schemaVersion: SCHEMA_VERSION,
    id: 'mega-round-fixture',
    createdAt: 1_770_000_000_000,
    config: APP_CONFIG,
    rng: { seed: 0x5f3a91c2, cursor: 0 },
    log,
  };

  expect(saveTournament(doc)).toBe(true);
}

/** Claim the tab lock so the shell holding the screens is never inert. */
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

async function click(element: HTMLElement | undefined): Promise<void> {
  expect(element).toBeDefined();
  await act(async () => {
    element?.click();
    await Promise.resolve();
  });
}

async function reachDraft(
  picks: readonly { playerId: string; monId: string; round: number }[] = [],
): Promise<void> {
  seedSavedDraft(picks);
  claimLock();
  await mountApp();
  await click(buttonLabelled('Resume saved draft'));
}

function noticeTexts(): string[] {
  return [...host.querySelectorAll('[role="status"].draft-notice')].map(
    (notice) => notice.textContent ?? '',
  );
}

/** The pool ids the fixture draws, in the order `poolBuilt` recorded them. */
const APP_POOL_IDS = Array.from({ length: 24 }, (_, index) => `mon-${index}`);
const APP_ELIGIBLE_IDS = APP_POOL_IDS.filter((id) => MEGA_POOL_IDS.includes(id));

describe('a two-Mega tournament, from the saved document to the grid', () => {
  it('narrows round 1 to the species that can still Mega, and says so', async () => {
    await reachDraft();

    expect(APP_ELIGIBLE_IDS.length).toBeLessThan(APP_POOL_IDS.length);
    expect(cards()).toHaveLength(APP_ELIGIBLE_IDS.length);
    expect(countLine()).toBe(`${APP_ELIGIBLE_IDS.length} of ${APP_POOL_IDS.length} available`);
    expect(restrictionLine()).toBe(
      'Round 1 is a Mega round — only Pokémon that can still Mega are shown.',
    );
    expect(megaWrapper().getAttribute('aria-disabled')).toBe('true');
  });

  it('opens back up in round 3, and the control sheds its reason with the round', async () => {
    // Four picks fills rounds 1 and 2 for both players, which lands the clock on round 3.
    await reachDraft([
      { playerId: 'p1', monId: 'mon-0', round: 1 },
      { playerId: 'p2', monId: 'mon-3', round: 1 },
      { playerId: 'p1', monId: 'mon-6', round: 2 },
      { playerId: 'p2', monId: 'mon-9', round: 2 },
    ]);

    expect(restrictionLine()).toBeNull();
    expect(megaWrapper().getAttribute('aria-disabled')).toBeNull();
    expect(countLine()).toBe(`${APP_POOL_IDS.length - 4} available`);
    // The whole leftover pool, non-Mega species included.
    expect(cards()).toHaveLength(APP_POOL_IDS.length - 4);
  });

  it('reports a pick its own schedule would never have offered, without repairing it', async () => {
    // `mon-1` cannot Mega and sits in round 1, which is a Mega round. Unreachable through
    // this build's UI — only a hand-edited or imported log gets here.
    await reachDraft([{ playerId: 'p1', monId: 'mon-1', round: 1 }]);

    expect(noticeTexts()).toContain(
      '1 pick in this tournament sits in a Mega round with a Pokémon that cannot Mega. It was' +
        ' recorded that way and nothing here changes it. Undo back to that pick to replace it,' +
        ' or carry on.',
    );

    // Reported, never repaired: the board still shows what the log says, and the draft runs.
    expect(host.querySelector('.board')).not.toBeNull();
    expect(host.querySelector('.pool')).not.toBeNull();
  });

  it('counts every violating pick, in the plural', async () => {
    await reachDraft([
      { playerId: 'p1', monId: 'mon-1', round: 1 },
      { playerId: 'p2', monId: 'mon-2', round: 1 },
    ]);

    expect(noticeTexts()).toContain(
      '2 picks in this tournament sit in a Mega round with a Pokémon that cannot Mega. They' +
        ' were recorded that way and nothing here changes them. Undo back to them to replace' +
        ' them, or carry on.',
    );
  });

  it('says nothing about a document whose picks agree with its schedule', async () => {
    await reachDraft([{ playerId: 'p1', monId: 'mon-0', round: 1 }]);

    expect(noticeTexts()).toEqual([]);
  });

  it('says nothing about a legal pick in an open round', async () => {
    // `mon-1` cannot Mega and round 3 does not ask it to. The notice must not fire on a
    // pick that broke no rule.
    await reachDraft([
      { playerId: 'p1', monId: 'mon-0', round: 1 },
      { playerId: 'p2', monId: 'mon-3', round: 1 },
      { playerId: 'p1', monId: 'mon-6', round: 2 },
      { playerId: 'p2', monId: 'mon-9', round: 2 },
      { playerId: 'p1', monId: 'mon-1', round: 3 },
    ]);

    expect(noticeTexts()).toEqual([]);
  });
});
