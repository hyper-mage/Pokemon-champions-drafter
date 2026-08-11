/**
 * The store's write paths under the tab lock — PERS-03 / T-01-40 / CR-02.
 *
 * `dispatch` and `undo` are the two ways the document changes, and only one of them can
 * be reached from outside the `inert` draft region. `TopBar` registers `Ctrl+Z` on
 * `document`, which is not inside that subtree, so a read-only secondary tab could undo
 * the owner's pick from the keyboard while every visible control was correctly disabled.
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
import { draftStarted, pickMade, poolBuilt, type Action, type Intent } from '../src/core/actions';
import { SCHEMA_VERSION, type TournamentConfig, type TournamentDoc } from '../src/core/model';
import { adoptTournament, getDoc, undo } from '../src/store';

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
      stamp(poolBuilt(['venusaur', 'charizard', 'blastoise'], 'mb', 'abc123'), 0),
      stamp(draftStarted(['p1', 'p2']), 1),
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
