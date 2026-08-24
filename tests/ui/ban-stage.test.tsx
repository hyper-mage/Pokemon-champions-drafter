// @vitest-environment happy-dom

/**
 * The ban stage — its start seam, its screen, and the turn it names.
 *
 * `happy-dom` rather than the default `node` environment, and for two separate reasons.
 * `store.ts` is signal-backed and reaches `announce`, which writes a module-level signal
 * that outlives every render; and the second half of this file renders `BanStageScreen`
 * itself. One environment for both keeps the seam and the surface asserted against the
 * same store rather than two.
 *
 * ## What `createBanStage` has to get right, and why each is a test rather than a comment
 *
 * D-01 buys TWO start seams deliberately. `hostBanlist` keeps the atomic three-dispatch
 * path Phase 2 verified; blind and snake get a sibling that emits `schedule/compiled` then
 * `draft/started` and NO pool. The assertions below pin both halves: that the sibling
 * leaves `poolIds` empty, and that `createTournament`'s log still begins `pool/built`.
 *
 * The rollback is the one that would not show up in a screenshot. A refused dispatch part
 * way through leaves the store holding a half-built tournament — a schedule with no order,
 * on screen, with no way back — so the refusal case forces one and asserts the PREVIOUS
 * document is still the live one.
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import committedSnapshot from '../../public/data/roster.mb.json';
import type { SpriteMeta } from '../../src/adapters/roster-source';
import { disposeTabLock } from '../../src/adapters/tab-lock';
import type { RoundSpec } from '../../src/core/actions';
import { bansPlaced } from '../../src/core/actions';
import type { TournamentConfig } from '../../src/core/model';
import type { RosterEntry, RosterSnapshot } from '../../src/core/roster/types';
import { selectBanTurn, selectBanStageState } from '../../src/core/selectors';
import {
  abandonTournament,
  createBanStage,
  createTournament,
  dispatch,
  getDoc,
  getState,
} from '../../src/store';
import { announce } from '../../src/ui/components/LiveRegion';
import { BanStageScreen } from '../../src/ui/screens/BanStageScreen';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SNAPSHOT = committedSnapshot as unknown as RosterSnapshot;
const ENTRIES: readonly RosterEntry[] = SNAPSHOT.entries;

const ROUNDS = 6;

function schedule(): RoundSpec[] {
  return Array.from({ length: ROUNDS }, (_, position) => ({
    index: position + 1,
    kind: 'open' as const,
  }));
}

function configFor(
  banMode: TournamentConfig['banMode'],
  bansPerPlayer: number,
  playerNames: readonly string[] = ['Ada', 'Bo', 'Cy', 'Sam'],
): TournamentConfig {
  return {
    formatLabel: 'Champions Test',
    players: playerNames.map((name, index) => ({ id: `p${index + 1}`, name })),
    rounds: ROUNDS,
    rosterVersion: 'mb',
    rosterChecksum: 'abc123',
    poolSize: 24,
    bans: [],
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

function order(config: TournamentConfig): string[] {
  return config.players.map((player) => player.id);
}

let host: HTMLDivElement;

beforeEach(() => {
  localStorage.clear();
  // `announce` writes a module-level signal that outlives any render.
  announce('');
  abandonTournament();
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(() => {
  render(null, host);
  host.remove();
  abandonTournament();
  disposeTabLock();
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// Task 1 — the start seam
// ---------------------------------------------------------------------------

describe('createBanStage', () => {
  it('emits the schedule and the order, in that order, and no pool', () => {
    const config = configFor('snake', 2);

    const doc = createBanStage({
      config,
      order: order(config),
      orderSeed: 11,
      schedule: schedule(),
    });

    expect(doc).not.toBeNull();
    expect(doc?.log.map((action) => action.type)).toEqual([
      'schedule/compiled',
      'draft/started',
    ]);
  });

  it('writes a fresh document at the current schema version', () => {
    const config = configFor('snake', 1);

    const doc = createBanStage({
      config,
      order: order(config),
      orderSeed: 11,
      schedule: schedule(),
    });

    expect(doc?.schemaVersion).toBe(4);
    expect(doc?.config.banMode).toBe('snake');
    expect(doc?.config.bansPerPlayer).toBe(1);
  });

  it('leaves the pool empty and carries the order and the schedule into the fold', () => {
    const config = configFor('snake', 2);
    const passed = order(config);

    createBanStage({ config, order: passed, orderSeed: 11, schedule: schedule() });

    const state = getState();
    expect(state?.poolIds).toEqual([]);
    expect(state?.order).toEqual(passed);
    expect(state?.schedule).toEqual(schedule());
  });

  it('reaches a ban stage with the first player of the order on the clock', () => {
    const config = configFor('snake', 2);

    createBanStage({ config, order: order(config), orderSeed: 11, schedule: schedule() });

    const state = getState();
    expect(state).not.toBeNull();
    if (state === null) return;

    expect(selectBanStageState(state)).toBe('snake');
    expect(selectBanTurn(state)).toEqual({ playerId: 'p1', pass: 1, index: 0 });
  });

  it('copies the order rather than aliasing the caller’s array', () => {
    const config = configFor('snake', 1);
    const passed = order(config);

    createBanStage({ config, order: passed, orderSeed: 11, schedule: schedule() });

    passed[0] = 'not-a-player';

    const state = getState();
    expect(state?.order).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(getDoc()?.log[1]).toMatchObject({ order: ['p1', 'p2', 'p3', 'p4'] });
  });

  it('copies the schedule rather than aliasing the caller’s array', () => {
    const config = configFor('snake', 1);
    const passed = schedule();

    createBanStage({ config, order: order(config), orderSeed: 11, schedule: passed });

    passed[0] = { index: 1, kind: 'mega' };

    expect(getState()?.schedule[0]).toEqual({ index: 1, kind: 'open' });
  });

  it('refuses a hostBanlist config, because that mode needs its pool first', () => {
    const config = configFor('hostBanlist', 0);

    const doc = createBanStage({
      config,
      order: order(config),
      orderSeed: 11,
      schedule: schedule(),
    });

    expect(doc).toBeNull();
  });

  it('restores the previous document AND the previous state when a dispatch is refused', () => {
    // A live tournament first, so there is something a half-built one could destroy.
    const live = configFor('snake', 1);
    const liveDoc = createBanStage({
      config: live,
      order: order(live),
      orderSeed: 11,
      schedule: schedule(),
    });
    const liveState = getState();
    expect(liveDoc).not.toBeNull();

    // A schedule whose length disagrees with `config.rounds` — `malformedSchedule`, refused
    // by the FIRST of the two dispatches.
    const doomed = configFor('snake', 1, ['Dee', 'Eve']);
    const created = createBanStage({
      config: doomed,
      order: order(doomed),
      orderSeed: 12,
      schedule: schedule().slice(0, 2),
    });

    expect(created).toBeNull();
    expect(getDoc()).toBe(liveDoc);
    expect(getState()).toBe(liveState);
  });

  it('rolls back a refusal of the SECOND dispatch too', () => {
    const live = configFor('snake', 1);
    const liveDoc = createBanStage({
      config: live,
      order: order(live),
      orderSeed: 11,
      schedule: schedule(),
    });
    const liveState = getState();

    // The schedule is fine; the order names a player the config does not have, which
    // `canApply(DRAFT_STARTED)` refuses as `unknownPlayer`.
    const doomed = configFor('snake', 1, ['Dee', 'Eve']);
    const created = createBanStage({
      config: doomed,
      order: ['p1', 'stranger'],
      orderSeed: 12,
      schedule: schedule(),
    });

    expect(created).toBeNull();
    expect(getDoc()).toBe(liveDoc);
    expect(getState()).toBe(liveState);
  });
});

describe('createTournament, unchanged by the sibling', () => {
  it('still emits pool/built, schedule/compiled and draft/started in that order', () => {
    const config = configFor('hostBanlist', 0);

    const doc = createTournament({
      config,
      poolIds: ENTRIES.slice(0, 24).map((entry) => entry.id),
      poolSeed: 7,
      megaCapableCount: 0,
      order: order(config),
      orderSeed: 11,
      schedule: schedule(),
    });

    expect(doc?.log.map((action) => action.type)).toEqual([
      'pool/built',
      'schedule/compiled',
      'draft/started',
    ]);
  });

  it('leaves a hostBanlist tournament with no ban stage to render', () => {
    const config = configFor('hostBanlist', 0);

    createTournament({
      config,
      poolIds: ENTRIES.slice(0, 24).map((entry) => entry.id),
      poolSeed: 7,
      megaCapableCount: 0,
      order: order(config),
      orderSeed: 11,
      schedule: schedule(),
    });

    const state = getState();
    expect(state).not.toBeNull();
    if (state === null) return;
    expect(selectBanStageState(state)).toBe('notRunning');
  });
});

// ---------------------------------------------------------------------------
// Task 3 — the screen
// ---------------------------------------------------------------------------

const SPRITE_META: SpriteMeta = {
  nativeWidth: 96,
  nativeHeight: 96,
  byRosterId: {},
};

/**
 * The `TopBar` bag, stubbed.
 *
 * `BanStageScreen` renders `TopBar` but owns none of its handlers — export, import, undo and
 * abandon are all app-level concerns that predate this screen. They arrive as one prop so the
 * screen's own contract stays the four fields the plan declares.
 */
const TOP_BAR = {
  onDownload: () => undefined,
  onImportFile: () => undefined,
  importError: null,
  onRequestUndo: () => undefined,
  onRequestAbandon: () => undefined,
  bannedNames: [] as readonly string[],
};

/** Start a snake stage and return the placement handler's recorded calls. */
function mountStage(): { calls: { playerId: string; monId: string; pass: number }[] } {
  const calls: { playerId: string; monId: string; pass: number }[] = [];

  act(() => {
    render(
      <BanStageScreen
        state={getState() as NonNullable<ReturnType<typeof getState>>}
        entries={ENTRIES}
        spriteMeta={SPRITE_META}
        topBar={TOP_BAR}
        storedPane="split"
        onPaneChange={() => undefined}
        onPlaceBan={(playerId, monId, pass) => {
          calls.push({ playerId, monId, pass });
        }}
      />,
      host,
    );
  });

  return { calls };
}

function startSnakeStage(bansPerPlayer = 2): TournamentConfig {
  const config = configFor('snake', bansPerPlayer);
  createBanStage({ config, order: order(config), orderSeed: 11, schedule: schedule() });
  return config;
}

function cardNamed(name: string): HTMLButtonElement | undefined {
  return [...host.querySelectorAll<HTMLButtonElement>('.mon-card')].find(
    (card) => card.querySelector('.mon-card__name')?.textContent === name,
  );
}

describe('BanStageScreen at the snake stage', () => {
  it('names whose turn it is and which pass, in full', () => {
    startSnakeStage(2);
    mountStage();

    expect(host.querySelector('.turn-banner')?.textContent).toBe('Pass 1 of 2 — Ada bans');
  });

  it('names who is left in the pass', () => {
    startSnakeStage(2);
    mountStage();

    expect(host.querySelector('.turn-banner__phase')?.textContent).toBe(
      'Still to ban this pass: Bo · Cy · Sam',
    );
  });

  /**
   * The stage renders the FULL roster rather than a pool, because the pool does not exist
   * yet — D-11 and D-23 draw it after the bans. That is what the ban-mode `PoolGrid` already
   * does, so this asserts the count rather than the component's identity.
   */
  it('renders the whole roster, because there is no pool to render', () => {
    startSnakeStage(1);
    mountStage();

    expect(host.querySelectorAll('.mon-card')).toHaveLength(ENTRIES.length);
  });

  it('hands a clicked cell to the caller with the playerId and pass from selectBanTurn', () => {
    startSnakeStage(2);
    const { calls } = mountStage();

    const first = ENTRIES[0] as RosterEntry;
    act(() => {
      cardNamed(first.name)?.click();
    });

    expect(calls).toEqual([{ playerId: 'p1', monId: first.id, pass: 1 }]);
  });

  it('advances the turn once the ban is recorded', () => {
    startSnakeStage(2);
    const first = ENTRIES[0] as RosterEntry;

    dispatch(bansPlaced('p1', first.id, 1));

    const state = getState();
    expect(state).not.toBeNull();
    if (state === null) return;
    expect(selectBanTurn(state)?.playerId).toBe('p2');

    mountStage();
    expect(host.querySelector('.turn-banner')?.textContent).toBe('Pass 1 of 2 — Bo bans');
  });

  it('drops the phase line for the last player of a pass', () => {
    startSnakeStage(2);
    const ids = ENTRIES.slice(0, 3).map((entry) => entry.id);
    ids.forEach((id, index) => {
      dispatch(bansPlaced(`p${index + 1}`, id, 1));
    });

    mountStage();

    expect(host.querySelector('.turn-banner')?.textContent).toBe('Pass 1 of 2 — Sam bans');
    expect(host.querySelector('.turn-banner__phase')).toBeNull();
  });

  /**
   * 04-09 lands the locked state. Until it does the arm renders nothing, and that is asserted
   * rather than assumed: a `null` arm that outlives its plan is invisible otherwise.
   */
  it('renders nothing at a blind stage, which 04-09 owns', () => {
    const config = configFor('blind', 2);
    createBanStage({ config, order: order(config), orderSeed: 11, schedule: schedule() });

    const state = getState();
    expect(state).not.toBeNull();
    if (state === null) return;
    expect(selectBanStageState(state)).toBe('blindLocked');

    mountStage();
    expect(host.querySelector('.turn-banner')).toBeNull();
    expect(host.querySelectorAll('.mon-card')).toHaveLength(0);
  });

  it('renders nothing once the stage is over', () => {
    startSnakeStage(1);
    ENTRIES.slice(0, 4).forEach((entry, index) => {
      dispatch(bansPlaced(`p${index + 1}`, entry.id, 1));
    });

    const state = getState();
    expect(state).not.toBeNull();
    if (state === null) return;
    expect(selectBanStageState(state)).toBe('reveal');

    mountStage();
    expect(host.querySelector('.turn-banner')).toBeNull();
  });
});

