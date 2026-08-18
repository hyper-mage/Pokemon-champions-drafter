/**
 * The store's write paths under the tab lock — PERS-03 / T-01-40 / CR-02.
 *
 * `dispatch` and `undo` are the two ways the document changes, and only one of them can
 * be reached from outside the `inert` shell that holds every screen. `TopBar` registers
 * `Ctrl+Z` on `document`, which is not inside that subtree, so a read-only secondary tab
 * could undo the owner's pick from the keyboard while every visible control was correctly
 * disabled.
 *
 * The damage is not immediate and that is why it is worth a test at this level rather than
 * at the keyboard's. `persistence.save()` declines the write on the spot, so the secondary
 * looks harmless — but it now holds a document with the pick missing, and on
 * `Take over drafting here` `loadIfNewer()` finds the stored generation equal to the one
 * this tab last read, returns null, and leaves the locally-undone log in place for the
 * next autosave to write over the owner's work.
 *
 * So the assertion below is at the STORE, not at the key handler. A gate in `TopBar` would
 * be a gate one caller deep; `store.undo()` is the write path, and anything that ever calls
 * it inherits whatever is enforced there.
 *
 * Default `node` environment. Nothing here needs a DOM: `claimOwnership` skips its
 * lifecycle listeners when `window` is undefined, which is precisely the seam that lets
 * the ownership protocol be driven from a plain test.
 *
 * ## Why `createTournament` is tested here too
 *
 * It is the store's third write path and it arrived with this phase's config screen. Its
 * relationship to the lock is the same question this file already asks: `store.ts` records
 * that `dispatch` is deliberately NOT `isOwner()`-gated because `createTournament`
 * dispatches inside the 250ms claim window whenever the roster comes from cache, which
 * offline is every time. That asymmetry is asserted below rather than left as a comment.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  claimOwnership,
  disposeTabLock,
  isOwner,
  requestTakeover,
  type LockChannel,
  type LockMessage,
} from '../src/adapters/tab-lock';
import {
  draftStarted,
  isDraftStartedAction,
  isPoolBuiltAction,
  pickMade,
  poolBuilt,
  type Action,
  type Intent,
} from '../src/core/actions';
import { SCHEMA_VERSION, type TournamentConfig, type TournamentDoc } from '../src/core/model';
import {
  adoptTournament,
  createTournament,
  getDoc,
  getState,
  undo,
  type CreateTournamentInput,
} from '../src/store';

// ---------------------------------------------------------------------------
// A channel the other tab can be spoken through
// ---------------------------------------------------------------------------

interface Wire extends LockChannel {
  /** Put a message on this tab's handler, as a real BroadcastChannel would. */
  deliver(message: LockMessage): void;
}

function makeWire(): Wire {
  let handler: ((message: LockMessage) => void) | null = null;

  return {
    postMessage: () => undefined,
    listen: (incoming) => {
      handler = incoming;
    },
    close: () => {
      handler = null;
    },
    deliver: (message) => handler?.(message),
  };
}

const OTHER_TAB = 'the-tab-that-is-drafting';

/** Another tab announcing ownership. This is what makes ours a secondary. */
function otherTabClaims(wire: Wire): void {
  wire.deliver({ type: 'claim', tabId: OTHER_TAB, at: 1_770_000_000_000 });
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CONFIG: TournamentConfig = {
  formatLabel: 'Champions Test',
  players: [
    { id: 'p1', name: 'Player 1' },
    { id: 'p2', name: 'Player 2' },
  ],
  rounds: 6,
  rosterVersion: 'mb',
  rosterChecksum: 'abc123',
  poolSize: 12,
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

function stamp(intent: Intent, seq: number): Action {
  return { ...intent, seq, at: 1_770_000_000_000 + seq, actorId: 'host' };
}

/** A draft with two picks in it, so there is something an undo could destroy. */
function docWithPicks(): TournamentDoc {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'tournament-fixture',
    createdAt: 1_770_000_000_000,
    config: CONFIG,
    rng: { seed: 0x5f3a91c2, cursor: 0 },
    log: [
      stamp(poolBuilt(['venusaur', 'charizard', 'blastoise'], 'mb', 'abc123', 7, 0), 0),
      stamp(draftStarted(['p1', 'p2'], 9), 1),
      stamp(pickMade({ playerId: 'p1', monId: 'venusaur', round: 1, pickIndex: 0 }), 2),
      stamp(pickMade({ playerId: 'p2', monId: 'charizard', round: 1, pickIndex: 1 }), 3),
    ],
  };
}

beforeEach(() => {
  // The claim window is a real 250ms timer. Faking time keeps one test's window from
  // closing inside the next one.
  vi.useFakeTimers();
});

afterEach(() => {
  disposeTabLock();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------

describe('undo in a tab that does not own the lock', () => {
  it('is refused by the store, leaving the document untouched', () => {
    expect(adoptTournament(docWithPicks())).toBe(true);

    const before = getDoc();
    expect(before?.log).toHaveLength(4);

    const wire = makeWire();
    claimOwnership({ channel: wire });
    otherTabClaims(wire);

    // The premise of the test, asserted rather than assumed: this tab is a secondary.
    expect(isOwner()).toBe(false);

    expect(undo()).toBe(false);

    // Identity, not just length. A gate that re-folded and then declined would still have
    // replaced the document object every component holds a reference to.
    expect(getDoc()).toBe(before);
    expect(getDoc()?.log).toHaveLength(4);
  });

  it('is refused while the claim is still in flight', () => {
    expect(adoptTournament(docWithPicks())).toBe(true);
    const before = getDoc();

    const wire = makeWire();
    claimOwnership({ channel: wire });

    // 250ms during which this tab might still turn out to be a secondary. Writing inside
    // that window is the whole reason `isOwner()` is false here.
    expect(isOwner()).toBe(false);
    expect(undo()).toBe(false);
    expect(getDoc()).toBe(before);
  });

  it('allows the very same undo once the host takes the draft over', () => {
    // Without this the test above would pass against a store that refused every undo.
    // Same document, same call, one thing different.
    expect(adoptTournament(docWithPicks())).toBe(true);

    const wire = makeWire();
    claimOwnership({ channel: wire });
    otherTabClaims(wire);

    expect(undo()).toBe(false);
    expect(getDoc()?.log).toHaveLength(4);

    requestTakeover();

    expect(isOwner()).toBe(true);
    expect(undo()).toBe(true);
    expect(getDoc()?.log).toHaveLength(3);
  });

  it('undoes freely when no lock has ever been engaged', () => {
    // Fail open, exactly as `persistence.save()` does. A build that never calls
    // `claimOwnership` must behave as it did before the lock existed rather than silently
    // stop accepting undo.
    expect(adoptTournament(docWithPicks())).toBe(true);

    expect(isOwner()).toBe(true);
    expect(undo()).toBe(true);
    expect(getDoc()?.log).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// createTournament — the config screen's write path
// ---------------------------------------------------------------------------

/** Six named players, as the config screen would hand them over. */
const SIX_PLAYER_CONFIG: TournamentConfig = {
  ...CONFIG,
  formatLabel: 'Champions mb',
  players: ['Ada', 'Bo', 'Cy', 'Dee', 'Eli', 'Fay'].map((name, index) => ({
    id: `player-${index + 1}`,
    name,
  })),
  poolSize: 36,
};

function sixPlayerInput(overrides: Partial<CreateTournamentInput> = {}): CreateTournamentInput {
  return {
    config: SIX_PLAYER_CONFIG,
    poolIds: Array.from({ length: 36 }, (_, index) => `mon-${index}`),
    poolSeed: 21,
    megaCapableCount: 9,
    order: SIX_PLAYER_CONFIG.players.map((player) => player.id),
    orderSeed: 34,
    ...overrides,
  };
}

describe('createTournament', () => {
  it('emits exactly pool/built then draft/started, each carrying its own seed', () => {
    const created = createTournament(sixPlayerInput());

    expect(created).not.toBeNull();
    expect(created?.log).toHaveLength(2);
    expect(getState()?.config.players).toHaveLength(6);

    const [pool, started] = created?.log ?? [];
    expect(pool).toBeDefined();
    expect(started).toBeDefined();
    if (pool === undefined || started === undefined) return;

    expect(isPoolBuiltAction(pool)).toBe(true);
    expect(isDraftStartedAction(started)).toBe(true);
    if (!isPoolBuiltAction(pool) || !isDraftStartedAction(started)) return;

    expect(pool.ids).toHaveLength(36);
    expect(pool.seed).toBe(21);
    expect(pool.megaCapableCount).toBe(9);
    expect(pool.rosterVersion).toBe(SIX_PLAYER_CONFIG.rosterVersion);
    expect(pool.checksum).toBe(SIX_PLAYER_CONFIG.rosterChecksum);

    expect(started.order).toHaveLength(6);
    expect(started.seed).toBe(34);
  });

  it('invents nothing — the config it stores is the config it was given', () => {
    const created = createTournament(sixPlayerInput());

    expect(created?.config.players.map((player) => player.name)).toEqual([
      'Ada',
      'Bo',
      'Cy',
      'Dee',
      'Eli',
      'Fay',
    ]);
    expect(created?.config.poolSize).toBe(36);
    expect(created?.config.formatLabel).toBe('Champions mb');
    expect(created?.schemaVersion).toBe(SCHEMA_VERSION);

    // The document's own RNG seed is reserved for Phase 3's priority-card tie-breaks and
    // is not either of the two config-time seeds, which ride on the actions.
    expect(created?.rng.cursor).toBe(0);
  });

  it('returns null and leaves both signals untouched when the pool dispatch is refused', () => {
    expect(createTournament(sixPlayerInput())).not.toBeNull();

    const docBefore = getDoc();
    const stateBefore = getState();

    // An empty pool is refused by `canApply`. The signals were already reassigned by the
    // time that happens, so "untouched" means restored rather than never written.
    expect(createTournament(sixPlayerInput({ poolIds: [] }))).toBeNull();

    // Identity, not shape. A rollback that rebuilt an equal document would still have
    // replaced the object every component holds a reference to.
    expect(getDoc()).toBe(docBefore);
    expect(getState()).toBe(stateBefore);
  });

  it('returns null and leaves both signals untouched when the order dispatch is refused', () => {
    expect(createTournament(sixPlayerInput())).not.toBeNull();

    const docBefore = getDoc();
    const stateBefore = getState();

    // An order naming a player the config does not have. This is the SECOND dispatch, so
    // the first one has already succeeded against the new document — the rollback has to
    // undo a partially-written tournament rather than a never-written one.
    expect(createTournament(sixPlayerInput({ order: ['nobody'] }))).toBeNull();

    expect(getDoc()).toBe(docBefore);
    expect(getState()).toBe(stateBefore);
  });

  it('is not refused while the ownership claim is still in flight', () => {
    const wire = makeWire();
    claimOwnership({ channel: wire });

    // The 250ms window during which this tab might still turn out to be a secondary.
    // `undo` is refused here and that is correct; `createTournament` must not be, or an
    // offline load — where the roster comes from cache every time — creates a document
    // with an empty log, an unpickable pool and no turn banner.
    expect(isOwner()).toBe(false);

    const created = createTournament(sixPlayerInput());
    expect(created?.log).toHaveLength(2);
  });
});
