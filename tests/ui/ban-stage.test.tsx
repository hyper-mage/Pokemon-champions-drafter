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
import { useState } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import committedSnapshot from '../../public/data/roster.mb.json';
import type { SpriteMeta } from '../../src/adapters/roster-source';
import { disposeTabLock } from '../../src/adapters/tab-lock';
import type { PaneState } from '../../src/adapters/view-prefs';
import type { RoundSpec } from '../../src/core/actions';
import { bansPlaced, bansRevealed, bansSubmitted } from '../../src/core/actions';
import type { DraftState, TournamentConfig } from '../../src/core/model';
import type { RosterEntry, RosterSnapshot } from '../../src/core/roster/types';
import {
  selectAllBanIds,
  selectBanTurn,
  selectBanStageState,
} from '../../src/core/selectors';
import {
  abandonTournament,
  createBanStage,
  createTournament,
  dispatch,
  drawPoolForBanStage,
  getDoc,
  getState,
  undo,
} from '../../src/store';
import { announce, LiveRegion } from '../../src/ui/components/LiveRegion';
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
        // Snake has no reveal in its ritual, so the snake arm never calls this.
        onReveal={() => undefined}
        // The snake arm never enters a blind allotment, so this is never called there.
        onSubmitBans={() => undefined}
        onPlaceBan={(playerId, monId, pass) => {
          calls.push({ playerId, monId, pass });
        }}
      />,
      host,
    );
  });

  return { calls };
}

/**
 * `hostBans` is the HOST's own banlist, and it is deliberately available at snake.
 *
 * D-15: the host banlist coexists with player bans in every mode, so the two reasons an
 * inert cell can carry are both reachable in one tournament — which is the case the copy
 * exists to tell apart.
 */
function startSnakeStage(bansPerPlayer = 2, hostBans: readonly string[] = []): TournamentConfig {
  const config = { ...configFor('snake', bansPerPlayer), bans: [...hostBans] };
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

// ---------------------------------------------------------------------------
// 04-06 — what is already gone, and who spent it
// ---------------------------------------------------------------------------

/**
 * The constraint upstream of the click.
 *
 * `selectCardOffer`'s doc block is the governing pattern for this whole phase and this is
 * its clearest instance: the constraint belongs upstream of the click, not in a rejection
 * after it. `canApply`'s `banAlreadyPlaced` arm sits behind it as a backstop, so the
 * load-bearing assertion below is the one that watches the LOG rather than the screen — if
 * a click on a closed cell ever lengthens it, the surface and the rule have disagreed.
 */

const RULE_LINE = 'A struck-through Pokémon is already banned and cannot be banned again.';
const VIEW_KEY = 'champions-drafter:view';

/**
 * The stage, re-rendered against the fold each time a ban lands.
 *
 * `app.tsx` re-renders from the store signal; this is the same shape with the smallest
 * mechanism that produces it, so the assertions below are about what a host sees after
 * their own click rather than about a snapshot taken before it.
 */
function LiveStage({
  storedPane = 'split',
  onPaneChange = () => undefined,
}: {
  storedPane?: PaneState;
  onPaneChange?: (pane: PaneState) => void;
}) {
  const [, bump] = useState(0);
  const state = getState();
  if (state === null) return null;

  return (
    <BanStageScreen
      state={state}
      entries={ENTRIES}
      spriteMeta={SPRITE_META}
      topBar={TOP_BAR}
      storedPane={storedPane}
      onPaneChange={onPaneChange}
      onReveal={() => undefined}
      onSubmitBans={() => undefined}
      onPlaceBan={(playerId, monId, pass) => {
        dispatch(bansPlaced(playerId, monId, pass));
        bump((count) => count + 1);
      }}
    />
  );
}

function mountLiveStage(
  storedPane: PaneState = 'split',
  onPaneChange: (pane: PaneState) => void = () => undefined,
): void {
  act(() => {
    render(<LiveStage storedPane={storedPane} onPaneChange={onPaneChange} />, host);
  });
}

function logLength(): number {
  return getDoc()?.log.length ?? -1;
}

function banFieldInput(): HTMLInputElement {
  const input = host.querySelector<HTMLInputElement>('#ban-stage-ban-input');
  if (input === null) throw new Error('the ban field is not on the ban stage');
  return input;
}

function typeBanQuery(text: string): void {
  act(() => {
    const input = banFieldInput();
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function banOptions(): HTMLLIElement[] {
  return [...host.querySelectorAll<HTMLLIElement>('.typeahead__option')];
}

function pressBanOption(option: HTMLLIElement | undefined): void {
  if (option === undefined) throw new Error('no such option');
  act(() => {
    option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  });
}

describe('the snake pool pane knows what is already gone', () => {
  it('closes a species the host banned, and says who by', () => {
    startSnakeStage(2, ['venusaur']);
    mountLiveStage();

    const cell = cardNamed('Venusaur');
    expect(cell?.getAttribute('aria-disabled')).toBe('true');
    expect(cell?.getAttribute('aria-label')).toBe(
      'Venusaur, Grass Poison — banned by the host',
    );
  });

  it('closes a species a player spent, and names the player', () => {
    startSnakeStage(2);
    dispatch(bansPlaced('p1', 'rotomwash', 1));
    mountLiveStage();

    const cell = cardNamed('Rotom-Wash');
    expect(cell?.getAttribute('aria-disabled')).toBe('true');
    expect(cell?.getAttribute('aria-label')).toBe(
      'Rotom-Wash, Electric Water — already banned by Ada',
    );
  });

  it('leaves an unbanned species open and unsuffixed', () => {
    startSnakeStage(2, ['venusaur']);
    mountLiveStage();

    const cell = cardNamed('Garchomp');
    expect(cell?.hasAttribute('aria-disabled')).toBe(false);
    expect(cell?.getAttribute('aria-label')).toBe('Garchomp, Dragon Ground');
  });

  it('names the rule once, above the grid', () => {
    startSnakeStage(2, ['venusaur']);
    mountLiveStage();

    expect(host.querySelectorAll('.pool__ban-rule')).toHaveLength(1);
    expect(host.querySelector('.pool__ban-rule')?.textContent).toBe(RULE_LINE);
  });

  it('records the ban and passes the turn on one click, with no confirm', () => {
    startSnakeStage(2);
    mountLiveStage();

    const before = logLength();
    act(() => {
      cardNamed('Garchomp')?.click();
    });

    expect(logLength()).toBe(before + 1);
    expect(host.querySelector('.dialog')).toBeNull();
    expect(host.querySelector('.turn-banner')?.textContent).toBe('Pass 1 of 2 — Bo bans');
    expect(cardNamed('Garchomp')?.getAttribute('aria-label')).toBe(
      'Garchomp, Dragon Ground — already banned by Ada',
    );
  });

  /**
   * THE LOAD-BEARING ONE. A closed cell that still dispatched would be a constraint applied
   * after the click rather than before it, and `canApply` would be the only thing between a
   * host and a wasted turn.
   */
  it('records nothing at all when a closed cell is clicked', () => {
    startSnakeStage(2, ['venusaur']);
    mountLiveStage();

    // Asserted TOGETHER, because the log alone cannot tell the two apart: `canApply`'s
    // `banAlreadyPlaced` backstop also leaves it unchanged. The attribute is what says the
    // click was refused BEFORE it was made rather than after.
    expect(cardNamed('Venusaur')?.getAttribute('aria-disabled')).toBe('true');

    const before = logLength();
    act(() => {
      cardNamed('Venusaur')?.click();
    });

    expect(logLength()).toBe(before);
    expect(host.querySelector('.turn-banner')?.textContent).toBe('Pass 1 of 2 — Ada bans');
  });

  /**
   * A snake ban does not REMOVE the cell — the stage renders the whole roster and closes
   * what is gone — so the node the host was standing on is still in the document afterwards
   * and there is nothing to hand focus on to.
   */
  it('keeps the banned cell in place, so focus survives the ban', () => {
    startSnakeStage(2);
    mountLiveStage();

    const cell = cardNamed('Garchomp');
    act(() => {
      cell?.focus();
      cell?.click();
    });

    expect(document.activeElement).toBe(cardNamed('Garchomp'));
    expect(cardNamed('Garchomp')?.getAttribute('aria-disabled')).toBe('true');
  });
});

describe('the ban field gives the same answer as the grid', () => {
  it('keeps a closed species in the results, with the same reason', () => {
    startSnakeStage(2);
    dispatch(bansPlaced('p1', 'rotomwash', 1));
    mountLiveStage();

    typeBanQuery('rotom-wash');

    const option = banOptions()[0];
    expect(option?.getAttribute('aria-disabled')).toBe('true');
    expect(option?.textContent).toBe('Rotom-Wash — already banned by Ada');
  });

  it('records nothing when a closed option is pressed', () => {
    startSnakeStage(2, ['venusaur']);
    mountLiveStage();

    typeBanQuery('venusaur');
    const before = logLength();
    pressBanOption(banOptions()[0]);

    expect(logLength()).toBe(before);
  });

  it('records a ban when an open option is pressed', () => {
    startSnakeStage(2);
    mountLiveStage();

    typeBanQuery('garchomp');
    const before = logLength();
    pressBanOption(banOptions()[0]);

    expect(logLength()).toBe(before + 1);
    expect(cardNamed('Garchomp')?.getAttribute('aria-disabled')).toBe('true');
  });
});

describe('the stored pane preference across the ban stage', () => {
  it('coerces a stored pool-full to split at snake, and writes nothing back', () => {
    const changed: PaneState[] = [];
    startSnakeStage(2);
    mountLiveStage('pool', (pane) => changed.push(pane));

    expect(host.querySelector('.draft-panes')?.getAttribute('data-pane')).toBe('split');

    // Silently — the host's stored choice is honoured again the moment a screen offers
    // it, so a coercion that reported itself would overwrite a preference the host still
    // holds. The pool expand is refused for this stage, not forgotten.
    expect(changed).toEqual([]);
  });

  /**
   * Amendment 2's blind row, and it is a NEGATIVE requirement: blind mounts no panes, so the
   * preference must survive the ban stage untouched and the draft must open in the state the
   * host chose. "We do not touch it" is invisible in code, so it is asserted here instead.
   */
  it('is left untouched while the blind stage is on screen', () => {
    const stored = JSON.stringify({ density: 'full', pane: 'board' });
    localStorage.setItem(VIEW_KEY, stored);

    const config = configFor('blind', 2);
    createBanStage({ config, order: order(config), orderSeed: 11, schedule: schedule() });

    /*
      The handler PERSISTS, exactly as `app.tsx`'s does. A handler that only recorded the
      call would leave the storage assertion below true whatever the screen did — and a
      negative requirement asserted by something that cannot fail is worse than one that is
      not asserted at all, because it reads as covered.
    */
    const changed: PaneState[] = [];
    mountLiveStage('board', (pane) => {
      changed.push(pane);
      localStorage.setItem(VIEW_KEY, JSON.stringify({ density: 'full', pane }));
    });

    expect(host.querySelector('.draft-panes')).toBeNull();

    act(() => {
      render(null, host);
    });

    expect(changed).toEqual([]);
    expect(localStorage.getItem(VIEW_KEY)).toBe(stored);
  });
});

// ---------------------------------------------------------------------------
// 04-08 — the snake board pane
// ---------------------------------------------------------------------------

/**
 * The board pane: who banned what, in which pass, with the next turn marked.
 *
 * Every assertion below is about the board being a FOLD rather than a record. The pane
 * holds no state of its own — rows come from the starting order, cells from
 * `state.banPlacements` and the marked cell from `selectBanTurn` — and the undo case is
 * what proves it. A board that kept its own bookkeeping would pass every other test here
 * and fail that one, which is exactly why it is the one that matters.
 *
 * What this file cannot prove: happy-dom performs no layout, so whether an eight-pass board
 * fits the split pane without a horizontal scrollbar is DRFT-14 assertion 16 and belongs to
 * a human-verify checkpoint. What IS asserted here is the mechanism that assertion depends
 * on — that the screen wraps the board in no scroll container of its own, so a regression
 * shows up as an overflow rather than being hidden by a scroller.
 */

/** Real ids from the committed snapshot, so the screen's id-to-entry lookup is exercised. */
function rosterEntryAt(index: number): RosterEntry {
  const entry = ENTRIES[index];
  if (entry === undefined) throw new Error(`the committed roster has no entry ${index}`);
  return entry;
}

function startSnakeStageNamed(
  bansPerPlayer: number,
  playerNames: readonly string[],
): TournamentConfig {
  const config = configFor('snake', bansPerPlayer, playerNames);
  createBanStage({ config, order: order(config), orderSeed: 11, schedule: schedule() });
  return config;
}

function boardCells(): HTMLElement[] {
  return [...host.querySelectorAll<HTMLElement>('.board__cell')];
}

function passHeaders(): string[] {
  return [...host.querySelectorAll<HTMLElement>('.ban-board__pass')].map(
    (header) => header.textContent?.trim() ?? '',
  );
}

/** The index of the one cell marked next, or -1 when none is. */
function nextCellIndex(): number {
  return boardCells().findIndex((cell) => cell.classList.contains('board__cell--next'));
}

describe('the snake board pane reads as the ban round so far', () => {
  it('says nobody has banned yet, and names who bans first', () => {
    startSnakeStageNamed(2, ['Sam', 'Ada', 'Bo', 'Cy']);
    mountLiveStage();

    // Asserted in FULL, on exact equality — the shape Phase 2 set with
    // `No picks yet. {firstPlayerName} picks first.`
    expect(host.querySelector('.ban-stage__board-empty')?.textContent).toBe(
      'No bans yet. Sam bans first.',
    );
    expect(host.querySelector('.ban-board__grid')).toBeNull();
  });

  it('replaces the empty state with the board once a ban lands', () => {
    startSnakeStage(2);
    mountLiveStage();

    act(() => {
      cardNamed('Garchomp')?.click();
    });

    expect(host.querySelector('.ban-stage__board-empty')).toBeNull();
    expect(host.querySelector('.ban-board__grid')).not.toBeNull();
    expect(host.querySelectorAll('.board__cell--filled')).toHaveLength(1);
  });

  it('gives one row per player in starting order and one column per pass', () => {
    startSnakeStage(3);
    dispatch(bansPlaced('p1', rosterEntryAt(0).id, 1));
    mountLiveStage();

    expect(passHeaders()).toEqual(['Pass 1', 'Pass 2', 'Pass 3']);
    expect(
      [...host.querySelectorAll<HTMLElement>('.ban-board__label-name')].map(
        (label) => label.textContent,
      ),
    ).toEqual(['Ada', 'Bo', 'Cy', 'Sam']);
    // Four players times three passes.
    expect(boardCells()).toHaveLength(12);
  });

  /**
   * The serpentine reverses on pass 2, so the player who bans first in pass 2 is the one who
   * banned LAST in pass 1. A board that derived its own column would put this in the wrong
   * one and look plausible doing it.
   */
  it('lands a pass-2 ban in the second column of the banning player row', () => {
    startSnakeStage(2);
    dispatch(bansPlaced('p1', rosterEntryAt(0).id, 1));
    dispatch(bansPlaced('p2', rosterEntryAt(1).id, 1));
    dispatch(bansPlaced('p3', rosterEntryAt(2).id, 1));
    dispatch(bansPlaced('p4', rosterEntryAt(3).id, 1));
    dispatch(bansPlaced('p4', rosterEntryAt(4).id, 2));
    mountLiveStage();

    // Sam is row 3 of a two-wide board, so their second column is the eighth cell.
    const cell = boardCells()[7];
    expect(cell?.classList.contains('board__cell--filled')).toBe(true);
    expect(cell?.querySelector('img')?.getAttribute('alt')).toBe(rosterEntryAt(4).name);

    // And pass 1 stayed where it was.
    expect(boardCells()[6]?.querySelector('img')?.getAttribute('alt')).toBe(
      rosterEntryAt(3).name,
    );
  });

  it('marks the cell the serpentine says is next, and only that one', () => {
    startSnakeStage(2);
    dispatch(bansPlaced('p1', rosterEntryAt(0).id, 1));
    mountLiveStage();

    // Bo is next, in pass 1: row 1, column 0, of a two-wide board.
    expect(host.querySelectorAll('.board__cell--next')).toHaveLength(1);
    expect(nextCellIndex()).toBe(2);
  });

  /**
   * THE LOAD-BEARING ONE. The board is a fold of the log, so an undo has to move the cursor
   * back with no board-specific bookkeeping anywhere. If this passes while the others do,
   * the pane genuinely holds no state.
   */
  it('moves the next cell back when the last ban is undone', () => {
    startSnakeStage(2);
    dispatch(bansPlaced('p1', rosterEntryAt(0).id, 1));
    dispatch(bansPlaced('p2', rosterEntryAt(1).id, 1));
    mountLiveStage();

    // Cy is next: row 2, column 0.
    expect(nextCellIndex()).toBe(4);
    expect(host.querySelectorAll('.board__cell--filled')).toHaveLength(2);

    act(() => {
      undo();
    });
    mountLiveStage();

    // Bo is next again, and Bo's cell is empty again.
    expect(nextCellIndex()).toBe(2);
    expect(host.querySelectorAll('.board__cell--filled')).toHaveLength(1);
  });

  it('renders eight columns at eight passes, in no scroll container of its own', () => {
    startSnakeStageNamed(8, ['Ada', 'Bo', 'Cass', 'Dev', 'Eli', 'Fern', 'Gus', 'Hari']);
    dispatch(bansPlaced('p1', rosterEntryAt(0).id, 1));
    mountLiveStage();

    const grid = host.querySelector<HTMLElement>('.ban-board__grid');
    expect(grid?.style.gridTemplateColumns).toBe(
      'var(--board-label-w) repeat(8, minmax(0, 1fr))',
    );
    expect(passHeaders()).toHaveLength(8);
    expect(boardCells()).toHaveLength(64);

    // The draft board's horizontal scroller is NOT reused here, and no second one is added:
    // the board sits directly in the pane's own vertical scroll region. A scroller would
    // hide the overflow that DRFT-14 assertion 16 exists to catch.
    expect(host.querySelectorAll('.board__scroll')).toHaveLength(0);
    expect(grid?.parentElement?.classList.contains('pane__scroll')).toBe(true);
  });

  /**
   * `04-UI-SPEC` §Deferred: a `bansPerPlayer` above 8 fits at `board-full` up to 23, and the
   * omission of any cap is deliberate — "no gate, no warning, no cap — recorded so nobody
   * adds one reflexively". This test is that record, in executable form.
   */
  it('adds no cap, no warning and no gate for a large ban count', () => {
    startSnakeStage(12);
    dispatch(bansPlaced('p1', rosterEntryAt(0).id, 1));
    mountLiveStage();

    expect(passHeaders()).toHaveLength(12);
    expect(passHeaders().at(-1)).toBe('Pass 12');
    expect(boardCells()).toHaveLength(48);
  });
});


// ---------------------------------------------------------------------------
// 04-09 — the blind locked arm
// ---------------------------------------------------------------------------

/**
 * The stage at `blind`, re-rendered against the fold exactly as `LiveStage` is.
 *
 * `onReveal` is recorded rather than dispatched, because D-08's guarantee is about WHEN the
 * reveal fires and the only way to assert "never automatically" is to count the calls.
 */
function LiveBlindStage({
  storedPane = 'split',
  onPaneChange = () => undefined,
  onReveal = () => undefined,
}: {
  storedPane?: PaneState;
  onPaneChange?: (pane: PaneState) => void;
  onReveal?: () => void;
}) {
  const [, bump] = useState(0);
  const state = getState();
  if (state === null) return null;

  return (
    <BanStageScreen
      state={state}
      entries={ENTRIES}
      spriteMeta={SPRITE_META}
      topBar={TOP_BAR}
      storedPane={storedPane}
      onPaneChange={onPaneChange}
      onPlaceBan={() => undefined}
      onReveal={onReveal}
      /*
        `app.tsx`'s shape with the smallest mechanism that reproduces it — the composition
        root owns `dispatch` and re-renders off the store signal, and this dispatches then
        bumps. Without the bump the locked state would re-render against the fold it was
        mounted with and the count would not move, which would be a test asserting a stale
        snapshot rather than what a host sees after their own tap.
      */
      onSubmitBans={(playerId, monIds) => {
        dispatch(bansSubmitted(playerId, monIds));
        bump((count) => count + 1);
      }}
    />
  );
}

/**
 * The blind stage WITH the live region mounted beside it.
 *
 * `announce` writes a module-level signal and `LiveRegion` is the only reader, so a suite
 * that wants to assert what the room heard has to render one. It is mounted for every case
 * rather than only the announcement ones, so the surface under test is the same surface in
 * all of them — and it stays empty unless something spoke, which the leak sweep above
 * depends on and which the locked state's own clear-on-arrival guarantees.
 */
function mountBlindStage(options: {
  storedPane?: PaneState;
  onPaneChange?: (pane: PaneState) => void;
  onReveal?: () => void;
} = {}): void {
  act(() => {
    render(
      <>
        <LiveRegion />
        <LiveBlindStage {...options} />
      </>,
      host,
    );
  });
}

function liveText(): string {
  return host.querySelector('[aria-live="polite"]')?.textContent ?? '';
}

function startBlindStage(
  bansPerPlayer = 2,
  playerNames: readonly string[] = ['Ada', 'Bo', 'Cy', 'Sam'],
): TournamentConfig {
  const config = configFor('blind', bansPerPlayer, playerNames);
  createBanStage({ config, order: order(config), orderSeed: 11, schedule: schedule() });
  return config;
}

/**
 * Seal every player's allotment, each a distinct pair.
 *
 * `canApply`'s `wrongBanCount` refuses a submission that is not exactly `bansPerPlayer`
 * long, so a fixture that submitted one id would be testing the refusal rather than the
 * screen. The pairs are disjoint so no collision is in play either — that is 04-11's
 * subject, not this one's.
 */
function submitEveryAllotment(config: TournamentConfig): void {
  config.players.forEach((player, index) => {
    dispatch(
      bansSubmitted(player.id, [
        rosterEntryAt(index * 2).id,
        rosterEntryAt(index * 2 + 1).id,
      ]),
    );
  });
}

function lockedText(selector: string): string | null {
  return host.querySelector(selector)?.textContent?.trim() ?? null;
}

function primaryAction(): HTMLButtonElement {
  const button = host.querySelector<HTMLButtonElement>('.blind-locked__action');
  if (button === null) throw new Error('the blind locked state rendered no primary action');
  return button;
}

describe('BanStageScreen at the blind locked stage', () => {
  it('mounts the locked state and names who is next over the count', () => {
    startBlindStage(2, ['Ada', 'Bo', 'Cy', 'Dee', 'Eli', 'Sam']);
    mountBlindStage();

    expect(lockedText('.blind-locked__headline')).toBe('Ada is next');
    expect(lockedText('.blind-locked__progress')).toBe('0 of 6 entered');
  });

  /**
   * Assertion S3 at the screen level, which is where a leak would actually arrive: the
   * screen holds the whole roster and the whole fold, and hands the locked state a slice.
   * Swept over EVERY committed roster name rather than one.
   */
  it('names no species anywhere, with real submissions in the log', () => {
    startBlindStage(2, ['Ada', 'Bo', 'Cy', 'Dee', 'Eli', 'Sam']);
    dispatch(bansSubmitted('p1', [rosterEntryAt(0).id, rosterEntryAt(1).id]));
    dispatch(bansSubmitted('p2', [rosterEntryAt(2).id, rosterEntryAt(3).id]));
    mountBlindStage();

    expect(lockedText('.blind-locked__progress')).toBe('2 of 6 entered');

    const rendered = host.textContent ?? '';
    const leaked = ENTRIES.filter((entry) => rendered.includes(entry.name)).map(
      (entry) => entry.name,
    );
    expect(leaked).toEqual([]);
  });

  it('reads every row off the fold, in starting order', () => {
    startBlindStage(2);
    dispatch(bansSubmitted('p2', [rosterEntryAt(0).id, rosterEntryAt(1).id]));
    mountBlindStage();

    const names = [...host.querySelectorAll<HTMLElement>('.ban-board__blind-name')].map(
      (element) => element.textContent,
    );
    expect(names).toEqual(['Ada', 'Bo', 'Cy', 'Sam']);

    const states = [...host.querySelectorAll<HTMLElement>('.ban-board__blind-status')].map(
      (element) => element.textContent,
    );
    expect(states).toEqual(['Not yet', 'Entered', 'Not yet', 'Not yet']);
  });

  it('names the first player in starting order who has not submitted', () => {
    startBlindStage(2);
    // p2 out of turn. The next player is p1 — the ORDER decides, never the log.
    dispatch(bansSubmitted('p2', [rosterEntryAt(0).id]));
    mountBlindStage();

    expect(lockedText('.blind-locked__headline')).toBe('Ada is next');
    expect(primaryAction().textContent).toBe("Enter Ada's bans");
  });

  it('offers the reveal once every player has submitted, and never before', () => {
    submitEveryAllotment(startBlindStage(2));
    mountBlindStage();

    expect(lockedText('.blind-locked__headline')).toBe('All bans are in');
    expect(primaryAction().textContent).toBe('Reveal bans');
  });

  /**
   * D-08. The last submission lands on a screen showing nothing and one button, and the
   * reveal waits for a host tap — asserted by counting, because "it did not happen yet" is
   * the only shape that catches an effect somebody adds later.
   */
  it('reveals on a tap and never on a render', () => {
    submitEveryAllotment(startBlindStage(2));

    let reveals = 0;
    mountBlindStage({ onReveal: () => (reveals += 1) });

    expect(reveals).toBe(0);

    act(() => {
      primaryAction().click();
    });

    expect(reveals).toBe(1);
  });

  /**
   * `04-UI-SPEC` Amendment 2's blind row: no panes, and the stored preference is NEITHER
   * read NOR written, so it survives the ban stage untouched and the draft opens in the
   * state the host chose.
   */
  it('mounts no panes and leaves the stored pane preference byte-identical', () => {
    const stored = JSON.stringify({ density: 'full', pane: 'board' });
    localStorage.setItem('champions-drafter:view', stored);

    startBlindStage(2);

    let paneChanges = 0;
    mountBlindStage({ storedPane: 'board', onPaneChange: () => (paneChanges += 1) });

    expect(host.querySelector('.panes')).toBeNull();
    expect(host.querySelector('.pane__scroll')).toBeNull();
    expect(host.querySelector('.pool__grid')).toBeNull();

    act(() => {
      render(null, host);
    });

    expect(paneChanges).toBe(0);
    expect(localStorage.getItem('champions-drafter:view')).toBe(stored);
  });
});

// ---------------------------------------------------------------------------
// 04-10 — the entry surface, and the four ways out of it
// ---------------------------------------------------------------------------

/*
  THE MEASURED SYNTHETIC-EVENT FORMS, and they are the same ones
  `tests/adapters/ban-shield.test.ts` uses — 04-RESEARCH executed all of them against this
  repository's installed happy-dom.

  Constructing a `PageTransitionEvent` with `{ persisted: true }` yields a `persisted` of
  `undefined`: the init dictionary is not honoured, so a test written the obvious way
  exercises the falsy branch, passes, and proves nothing. Do not "tidy" the `Object.assign`
  back into a constructor argument. `visibilityState` is a getter, so it is redefined rather
  than assigned.

  BOTH POLARITIES ARE ASSERTED HERE TOO. A single-polarity test at the screen level is as
  much a false-positive gate as at the adapter level — it cannot tell the shield from a
  handler that discards on every page load.
*/
function persistedPageShowEvent(): Event {
  return Object.assign(new Event('pageshow'), { persisted: true });
}

function setVisibility(visibilityState: 'hidden' | 'visible'): Event {
  Object.defineProperty(document, 'visibilityState', {
    value: visibilityState,
    configurable: true,
  });
  return new Event('visibilitychange');
}

afterEach(() => {
  Object.defineProperty(document, 'visibilityState', {
    value: 'visible',
    configurable: true,
  });
});

function entrySurface(): HTMLElement | null {
  return host.querySelector<HTMLElement>('.blind-entry');
}

function lockedPanel(): HTMLElement | null {
  return host.querySelector<HTMLElement>('.blind-locked');
}

function discardNotice(): string | null {
  return host.querySelector('.blind-locked__discard')?.textContent?.trim() ?? null;
}

function enterBans(): void {
  act(() => {
    primaryAction().click();
  });
}

function entryControl(selector: string): HTMLButtonElement {
  const button = host.querySelector<HTMLButtonElement>(selector);
  if (button === null) throw new Error(`the entry surface rendered no ${selector}`);
  return button;
}

/** Choose `count` species through the entry grid, in roster order. */
function chooseOnEntry(count: number): RosterEntry[] {
  const chosen = Array.from({ length: count }, (_, index) => rosterEntryAt(index));
  chosen.forEach((entry) => {
    const cell = [...host.querySelectorAll<HTMLButtonElement>('button.mon-card')].find(
      (button) => (button.getAttribute('aria-label') ?? '').startsWith(entry.name),
    );
    if (cell === undefined) throw new Error(`no entry cell for ${entry.name}`);
    act(() => {
      cell.click();
    });
  });
  return chosen;
}

function submissionCount(): number {
  return getState()?.banSubmissions.length ?? -1;
}

describe('BanStageScreen, entering a player’s bans', () => {
  it('swaps the locked state for the entry surface on the primary action', () => {
    startBlindStage(2);
    mountBlindStage();

    expect(lockedPanel()).not.toBeNull();
    expect(entrySurface()).toBeNull();

    enterBans();

    expect(entrySurface()).not.toBeNull();
    expect(lockedPanel()).toBeNull();
    expect(host.querySelector('h1.blind-entry__headline')?.textContent).toBe("Ada's bans");
  });

  /**
   * `04-UI-SPEC` §5 read literally: the entry surface is the ENTIRE working area. The top
   * bar the locked state renders above it is gone too, which is what separates an
   * interstitial from an input mask over a still-populated screen.
   */
  it('renders no top bar while the entry surface is up', () => {
    startBlindStage(2);
    mountBlindStage();
    enterBans();

    expect(host.querySelector('.sticky-head')).toBeNull();
    expect(host.querySelector('.top-bar')).toBeNull();
  });

  it('locks in the whole allotment and returns to the locked state with the count raised', () => {
    startBlindStage(2);
    mountBlindStage();
    enterBans();

    const chosen = chooseOnEntry(2);

    act(() => {
      entryControl('.blind-entry__lock').click();
    });

    expect(entrySurface()).toBeNull();
    expect(lockedPanel()).not.toBeNull();
    expect(lockedText('.blind-locked__progress')).toBe('1 of 4 entered');
    // `toMatchObject` because a submission also carries the `seq` 04-07's undo finds it by,
    // which is the store's business and not this screen's.
    expect(getState()?.banSubmissions).toMatchObject([
      { playerId: 'p1', monIds: [chosen[0]?.id, chosen[1]?.id] },
    ]);
    // A submission is not a discard, so the notice that serves the three discard paths
    // must NOT appear here.
    expect(discardNotice()).toBeNull();
  });
});

describe('the four ways out of the entry surface', () => {
  it('hides on the panic control, recording nothing', () => {
    startBlindStage(2);
    mountBlindStage();
    enterBans();
    chooseOnEntry(1);

    act(() => {
      entryControl('.blind-entry__hide').click();
    });

    expect(entrySurface()).toBeNull();
    expect(discardNotice()).toBe("Ada's entry was discarded. Nothing was recorded.");
    expect(submissionCount()).toBe(0);
  });

  it('discards when the tab is hidden', () => {
    startBlindStage(2);
    mountBlindStage();
    enterBans();
    chooseOnEntry(1);

    act(() => {
      document.dispatchEvent(setVisibility('hidden'));
    });

    expect(entrySurface()).toBeNull();
    expect(discardNotice()).toBe("Ada's entry was discarded. Nothing was recorded.");
    expect(submissionCount()).toBe(0);
  });

  it('leaves the surface up when the tab merely becomes visible', () => {
    startBlindStage(2);
    mountBlindStage();
    enterBans();

    act(() => {
      document.dispatchEvent(setVisibility('visible'));
    });

    expect(entrySurface()).not.toBeNull();
    expect(lockedPanel()).toBeNull();
  });

  it('discards on a restore from the back/forward cache', () => {
    startBlindStage(2);
    mountBlindStage();
    enterBans();
    chooseOnEntry(1);

    act(() => {
      window.dispatchEvent(persistedPageShowEvent());
    });

    expect(entrySurface()).toBeNull();
    expect(discardNotice()).toBe("Ada's entry was discarded. Nothing was recorded.");
    expect(submissionCount()).toBe(0);
  });

  /**
   * THE ASSERTION THAT MAKES THE SCREEN-LEVEL GATE ABLE TO FAIL.
   *
   * An ordinary load is not a restore, and a shield that discarded on both would throw away
   * a host's entry every time the page loaded. Without this case the suite cannot tell the
   * two apart.
   */
  it('leaves the surface up on an ordinary, non-persisted pageshow', () => {
    startBlindStage(2);
    mountBlindStage();
    enterBans();
    chooseOnEntry(1);

    act(() => {
      window.dispatchEvent(new Event('pageshow'));
    });

    expect(entrySurface()).not.toBeNull();
    expect(lockedPanel()).toBeNull();
  });

  /**
   * ONE OUTCOME, ONE MESSAGE, THREE PATHS — `04-UI-SPEC` §4.
   *
   * Compared against ONE ANOTHER rather than against a literal three times: three literals
   * would be three things that can be edited apart, which is the exact failure the single
   * composer exists to prevent.
   */
  it('says the same thing however the entry was left', () => {
    const notices: (string | null)[] = [];

    const leaveBy = (leave: () => void): void => {
      abandonTournament();
      render(null, host);
      startBlindStage(2);
      mountBlindStage();
      enterBans();
      chooseOnEntry(1);
      act(leave);
      notices.push(discardNotice());
    };

    leaveBy(() => entryControl('.blind-entry__hide').click());
    leaveBy(() => document.dispatchEvent(setVisibility('hidden')));
    leaveBy(() => window.dispatchEvent(persistedPageShowEvent()));

    expect(notices[0]).not.toBeNull();
    expect(notices[1]).toBe(notices[0]);
    expect(notices[2]).toBe(notices[0]);
  });

  /**
   * D-18's guarantee, asserted DIRECTLY rather than inferred from the notice: the
   * in-progress selection dies with the component. Re-entering the same player starts from
   * nothing, so there is no half-private state for a leak bug to live in.
   */
  it('retains nothing when the same player enters again', () => {
    startBlindStage(2);
    mountBlindStage();
    enterBans();
    chooseOnEntry(1);

    expect(host.querySelector('.ban-chip-list')).not.toBeNull();

    act(() => {
      entryControl('.blind-entry__hide').click();
    });
    enterBans();

    expect(entrySurface()).not.toBeNull();
    expect(host.querySelector('.ban-chip-list')).toBeNull();
    expect(host.querySelector('.blind-entry__progress')?.textContent).toBe('0 of 2 chosen');
  });

  it('clears the discard notice on the next transition into entry', () => {
    startBlindStage(2);
    mountBlindStage();
    enterBans();

    act(() => {
      entryControl('.blind-entry__hide').click();
    });
    expect(discardNotice()).not.toBeNull();

    enterBans();

    // Back on the entry surface the notice is gone with the screen that held it, and
    // leaving by locking in must not bring it back.
    chooseOnEntry(2);
    act(() => {
      entryControl('.blind-entry__lock').click();
    });

    expect(discardNotice()).toBeNull();
  });

  /**
   * `04-UI-SPEC` §Interaction: ONE focus target for all four exits, because the control
   * that was focused no longer exists in any of them. Focus must never be left on a
   * detached node and never dropped to `<body>`.
   */
  it('lands focus on the locked state’s primary action however it was reached', () => {
    const leaveBy = (leave: () => void, choose: number): void => {
      abandonTournament();
      render(null, host);
      startBlindStage(2);
      mountBlindStage();
      enterBans();
      chooseOnEntry(choose);
      act(leave);

      expect(entrySurface()).toBeNull();
      expect(document.activeElement).toBe(primaryAction());
    };

    leaveBy(() => entryControl('.blind-entry__lock').click(), 2);
    leaveBy(() => entryControl('.blind-entry__hide').click(), 1);
    leaveBy(() => document.dispatchEvent(setVisibility('hidden')), 1);
    leaveBy(() => window.dispatchEvent(persistedPageShowEvent()), 1);
  });

  /**
   * The shield is scoped to the entry surface's own lifetime. Once the surface is gone its
   * listeners are gone with it, so a later restore does not raise a discard notice on a
   * screen nobody was entering — a permanently registered listener is one that eventually
   * fires against a stale closure.
   */
  it('stops listening once the entry surface is gone', () => {
    startBlindStage(2);
    mountBlindStage();
    enterBans();
    chooseOnEntry(2);

    act(() => {
      entryControl('.blind-entry__lock').click();
    });
    expect(discardNotice()).toBeNull();

    act(() => {
      window.dispatchEvent(persistedPageShowEvent());
      document.dispatchEvent(setVisibility('hidden'));
    });

    expect(discardNotice()).toBeNull();
    expect(entrySurface()).toBeNull();
  });

  /**
   * 04-09's handover note, closed rather than inherited.
   *
   * `BlindLocked` speaks the lock sentence on an INCREASE in `entered` within its own
   * lifetime, which never happens once the entry surface swaps it out and back — the lock
   * lands across a remount and the screen would be correct and silent. The screen therefore
   * hands down WHAT JUST HAPPENED, and a resume stays silent because the screen's own
   * memory of it does not survive a reload.
   */
  it('says a submission landed, across the remount the entry surface causes', () => {
    startBlindStage(2, ['Ada', 'Bo']);
    mountBlindStage();
    enterBans();
    chooseOnEntry(2);

    act(() => {
      entryControl('.blind-entry__lock').click();
    });

    expect(liveText()).toBe("Ada's bans are locked in. 1 of 2 entered.");
  });

  it('says the ritual is over when the last allotment lands', () => {
    startBlindStage(2, ['Ada', 'Bo']);
    dispatch(bansSubmitted('p2', [rosterEntryAt(8).id, rosterEntryAt(9).id]));

    mountBlindStage();
    enterBans();
    chooseOnEntry(2);

    act(() => {
      entryControl('.blind-entry__lock').click();
    });

    expect(liveText()).toBe('All bans are in. 2 of 2 entered. Ready to reveal.');
  });

  it('speaks the discard rather than leaving the room to read it', () => {
    startBlindStage(2);
    mountBlindStage();
    enterBans();
    chooseOnEntry(1);

    act(() => {
      entryControl('.blind-entry__hide').click();
    });

    expect(liveText()).toBe("Ada's entry was discarded. Nothing was recorded.");
  });

  /**
   * A fresh arrival at the locked state is NOT a submission that just happened, so it
   * clears the region and says nothing — 04-09's rule, which is what keeps a page resume at
   * three entries from claiming three submissions just landed.
   */
  it('stays silent on a plain arrival with entries already in the log', () => {
    startBlindStage(2, ['Ada', 'Bo']);
    dispatch(bansSubmitted('p1', [rosterEntryAt(0).id, rosterEntryAt(1).id]));
    announce('something the previous screen said');

    mountBlindStage();

    expect(liveText()).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Task 2 — the separate draw (D-23)
// ---------------------------------------------------------------------------

/**
 * `drawPoolForBanStage` — the tournament's first and only `pool/built`.
 *
 * D-23 splits the reveal from the draw so the room reads the reveal before the screen
 * changes under them, and so a failed RULE-08 check never has to un-draw anything. These
 * cases are at the STORE rather than at the screen because the seed is rolled here: the
 * impure edge stamps ambient values, and a component that rolled one would be a second
 * place randomness enters the document.
 */
describe('drawPoolForBanStage', () => {
  /** A blind stage with every allotment sealed and the reveal landed. */
  function revealedBlindStage(overrides: Partial<TournamentConfig> = {}): TournamentConfig {
    const config = { ...configFor('blind', 2), ...overrides };
    createBanStage({ config, order: order(config), orderSeed: 11, schedule: schedule() });
    submitEveryAllotment(config);
    dispatch(
      bansRevealed(
        config.players.map((player, index) => ({
          playerId: player.id,
          monIds: [rosterEntryAt(index * 2).id, rosterEntryAt(index * 2 + 1).id],
        })),
      ),
    );
    return config;
  }

  function poolBuiltEntries(): readonly { type: string }[] {
    return (getDoc()?.log ?? []).filter((action) => action.type === 'pool/built');
  }

  it('appends exactly one pool/built and reports that it did', () => {
    revealedBlindStage();

    expect(drawPoolForBanStage(ENTRIES)).toBe(true);
    expect(poolBuiltEntries()).toHaveLength(1);
  });

  it('draws the configured pool size', () => {
    revealedBlindStage();
    drawPoolForBanStage(ENTRIES);

    expect(getState()?.poolIds).toHaveLength(24);
  });

  it('excludes every ban — the host banlist and every revealed player ban alike', () => {
    const config = revealedBlindStage({ bans: [rosterEntryAt(200).id] });
    const banned = new Set(selectAllBanIds(getState() as DraftState));
    // Four players × two bans, plus the host's one.
    expect(banned.size).toBe(config.players.length * 2 + 1);

    drawPoolForBanStage(ENTRIES);

    for (const id of getState()?.poolIds ?? []) {
      expect(banned.has(id)).toBe(false);
    }
  });

  it('materialises the regulation and the checksum the draw was made against', () => {
    revealedBlindStage();
    drawPoolForBanStage(ENTRIES);

    const state = getState() as DraftState;
    expect(state.rosterVersion).toBe('mb');
    expect(state.rosterChecksum).toBe('abc123');
  });

  it('ends the ban stage, which is what a non-empty pool means', () => {
    revealedBlindStage();
    expect(selectBanStageState(getState() as DraftState)).toBe('reveal');

    drawPoolForBanStage(ENTRIES);

    expect(selectBanStageState(getState() as DraftState)).toBe('notRunning');
  });

  it('draws a snake stage from its placements, with no reveal action in the log', () => {
    const config = startSnakeStage(1);
    config.players.forEach((player, index) => {
      dispatch(bansPlaced(player.id, rosterEntryAt(index).id, 1));
    });

    expect(getState()?.bansRevealed).toBeNull();
    expect(drawPoolForBanStage(ENTRIES)).toBe(true);

    const banned = new Set(selectAllBanIds(getState() as DraftState));
    for (const id of getState()?.poolIds ?? []) {
      expect(banned.has(id)).toBe(false);
    }
  });

  /**
   * The failure `drawPool` deliberately does not clamp — `draw.ts:108-112` surfaces a
   * `RangeError` rather than handing back a pool quietly smaller than the host configured.
   * 04-02's pessimistic gate makes it unreachable from the config flow; an imported document
   * can still get here, and a throw on a shared screen mid-ritual has no recovery path.
   */
  it('refuses a pool larger than the post-ban roster rather than throwing', () => {
    revealedBlindStage({ poolSize: 300 });

    expect(() => drawPoolForBanStage(ENTRIES)).not.toThrow();
    expect(drawPoolForBanStage(ENTRIES)).toBe(false);
    expect(poolBuiltEntries()).toHaveLength(0);
    expect(getState()?.poolIds).toEqual([]);
  });

  it('refuses a Mega quota the post-ban roster cannot fill rather than throwing', () => {
    revealedBlindStage({ megasRequiredPerTeam: 100 });

    expect(() => drawPoolForBanStage(ENTRIES)).not.toThrow();
    expect(drawPoolForBanStage(ENTRIES)).toBe(false);
    expect(poolBuiltEntries()).toHaveLength(0);
  });

  it('refuses a second draw, so the pool the room watched cannot be replaced', () => {
    revealedBlindStage();
    expect(drawPoolForBanStage(ENTRIES)).toBe(true);

    const first = getState()?.poolIds;

    expect(drawPoolForBanStage(ENTRIES)).toBe(false);
    expect(poolBuiltEntries()).toHaveLength(1);
    expect(getState()?.poolIds).toEqual(first);
  });

  it('reports false rather than throwing when no tournament exists', () => {
    abandonTournament();

    expect(drawPoolForBanStage(ENTRIES)).toBe(false);
  });
});
