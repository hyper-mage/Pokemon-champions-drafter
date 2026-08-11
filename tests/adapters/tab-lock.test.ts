/**
 * The tab ownership lock — PERS-03 / D-12.
 *
 * Multi-tab behaviour is the canonical example of a thing that is never tested because
 * testing it "requires two browsers". It does not. What it requires is that the channel
 * be a port rather than a global, at which point two lock instances sharing one fake bus
 * reproduce the entire protocol — including the two cases that matter and that a human
 * with two tabs open will almost never think to try: two tabs booting inside the same
 * claim window, and an owner that vanishes without saying goodbye.
 *
 * The fake bus below is deliberately faithful on one point that is easy to get wrong:
 * `BroadcastChannel` does **not** deliver a message back to the context that posted it.
 * A bus that echoed would hide a whole class of self-message bugs.
 *
 * Timers are vitest's fakes, so the 2000ms heartbeat and the 6000ms stale threshold are
 * asserted at their real values rather than at test-only values that prove nothing about
 * what ships. `vi.useFakeTimers()` fakes `Date` as well, which is what lets the module's
 * own elapsed-time guard be exercised alongside the timers.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadIfNewer, save } from '../../src/adapters/persistence';
import {
  CLAIM_WINDOW_MS,
  claimOwnership,
  createTabLock,
  disposeTabLock,
  HEARTBEAT_INTERVAL_MS,
  isOwner,
  ownershipState,
  requestTakeover,
  STALE_THRESHOLD_MS,
  type LockChannel,
  type LockMessage,
  type TabLock,
} from '../../src/adapters/tab-lock';
import { draftStarted, pickMade, poolBuilt, type Action, type Intent } from '../../src/core/actions';
import { SCHEMA_VERSION, type TournamentConfig, type TournamentDoc } from '../../src/core/model';

const STORAGE_KEY = 'champions-drafter:tournament';

// ---------------------------------------------------------------------------
// A BroadcastChannel bus that two lock instances can share
// ---------------------------------------------------------------------------

interface Port {
  handler: ((message: LockMessage) => void) | null;
  open: boolean;
  muted: boolean;
}

/**
 * A channel that can also be struck dumb.
 *
 * `close()` models a tab that is gone; `setMuted(true)` models one that is still there and
 * has stopped speaking — a main thread blocked on a long task, or a background tab whose
 * timers the browser has throttled. The distinction matters because the two must look
 * identical to a *secondary*, which is the whole basis of stale detection: a secondary
 * cannot tell a dead owner from a wedged one, so it must treat silence itself as the
 * signal and then take the words back when the owner speaks again.
 */
interface TestChannel extends LockChannel {
  setMuted(muted: boolean): void;
}

interface Bus {
  connect(): TestChannel;
  /** Deliver everything queued while in `manual` mode. */
  flush(): void;
}

/**
 * `sync` delivers on post, which is the ordinary case and keeps tests linear.
 *
 * `manual` queues instead, which is how the partition case is reproduced: two tabs that
 * boot in the same frame and do not hear each other's `ping` until after both claim
 * windows have already closed.
 */
function makeBus(delivery: 'sync' | 'manual' = 'sync'): Bus {
  const ports: Port[] = [];
  const queue: Array<{ from: Port; message: LockMessage }> = [];

  function deliver(from: Port, message: LockMessage): void {
    for (const port of ports) {
      if (port === from || !port.open) continue;
      port.handler?.(message);
    }
  }

  return {
    connect(): TestChannel {
      const port: Port = { handler: null, open: true, muted: false };
      ports.push(port);

      return {
        postMessage(message: LockMessage): void {
          // A muted port still runs its own timers — the owner's heartbeat interval keeps
          // firing — but nothing it sends reaches the bus. That is precisely the shape of
          // a blocked main thread, and it is what makes the owner *look* dead without
          // being dead.
          if (!port.open || port.muted) return;
          if (delivery === 'sync') deliver(port, message);
          else queue.push({ from: port, message });
        },
        listen(handler: (message: LockMessage) => void): void {
          port.handler = handler;
        },
        setMuted(muted: boolean): void {
          port.muted = muted;
        },
        close(): void {
          port.open = false;
          port.handler = null;
        },
      };
    },

    flush(): void {
      for (const item of queue.splice(0, queue.length)) deliver(item.from, item.message);
    },
  };
}

/** Boot a lock and let its claim window close. */
function boot(lock: TabLock): TabLock {
  lock.claim();
  vi.advanceTimersByTime(CLAIM_WINDOW_MS);
  return lock;
}

// ---------------------------------------------------------------------------
// A localStorage the save gate can be observed through
// ---------------------------------------------------------------------------

interface StorageStub extends Storage {
  readonly backing: Map<string, string>;
}

function makeStorage(): StorageStub {
  const backing = new Map<string, string>();

  return {
    backing,
    get length() {
      return backing.size;
    },
    clear: () => backing.clear(),
    getItem: (key: string) => backing.get(key) ?? null,
    key: (index: number) => [...backing.keys()][index] ?? null,
    removeItem: (key: string) => {
      backing.delete(key);
    },
    setItem: (key: string, value: string) => {
      backing.set(key, value);
    },
  } as StorageStub;
}

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
  return { ...intent, seq, at: 1_700_000_000_000 + seq, actorId: 'host' };
}

function makeDoc(picks: readonly string[] = ['venusaur']): TournamentDoc {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'tournament-fixture',
    createdAt: 1_700_000_000_000,
    config: CONFIG,
    rng: { seed: 0x5f3a91c2, cursor: 0 },
    log: [
      stamp(poolBuilt(['venusaur', 'charizard', 'blastoise'], 'mb', 'abc123'), 0),
      stamp(draftStarted(['p1', 'p2']), 1),
      ...picks.map((monId, index) =>
        stamp(
          pickMade({
            playerId: index % 2 === 0 ? 'p1' : 'p2',
            monId,
            round: index + 1,
            pickIndex: index,
          }),
          index + 2,
        ),
      ),
    ],
  };
}

let storage: StorageStub;

beforeEach(() => {
  vi.useFakeTimers();
  storage = makeStorage();
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  disposeTabLock();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

describe('claiming on boot', () => {
  it('claims ownership when nothing answers the ping', () => {
    const bus = makeBus();
    const a = boot(createTabLock({ tabId: 'a', channel: bus.connect() }));

    expect(a.isOwner()).toBe(true);
    expect(a.state().status).toBe('owner');
    expect(a.state().readOnly).toBe(false);
  });

  it('refuses writes while the claim is still in flight, but shows no banner yet', () => {
    const bus = makeBus();
    const a = createTabLock({ tabId: 'a', channel: bus.connect() });
    a.claim();

    // The two flags are deliberately not the same flag. Writing from a tab that might
    // turn out to be a secondary is the bug; flashing a read-only banner on every boot
    // would be a different, purely cosmetic bug.
    expect(a.isOwner()).toBe(false);
    expect(a.state().readOnly).toBe(false);
    expect(a.state().status).toBe('claiming');
  });

  it('opens the second tab read-only, and leaves the first one owning', () => {
    const bus = makeBus();
    const a = boot(createTabLock({ tabId: 'a', channel: bus.connect() }));
    const b = boot(createTabLock({ tabId: 'b', channel: bus.connect() }));

    expect(a.isOwner()).toBe(true);
    expect(b.isOwner()).toBe(false);
    expect(b.state().readOnly).toBe(true);
    expect(b.state().stale).toBe(false);
  });

  it('leaves exactly one owner when three tabs boot in sequence', () => {
    const bus = makeBus();
    const locks = ['a', 'b', 'c'].map((tabId) =>
      boot(createTabLock({ tabId, channel: bus.connect() })),
    );

    expect(locks.filter((lock) => lock.isOwner())).toHaveLength(1);
  });

  it('resolves to one owner when two tabs boot without hearing each other', () => {
    // The partition case: both pings sit undelivered until after both claim windows
    // close, so both tabs come out of the window believing they own the lock.
    const bus = makeBus('manual');
    const a = createTabLock({ tabId: 'a-lower', channel: bus.connect() });
    const b = createTabLock({ tabId: 'b-higher', channel: bus.connect() });

    a.claim();
    b.claim();
    vi.advanceTimersByTime(CLAIM_WINDOW_MS);

    expect(a.isOwner()).toBe(true);
    expect(b.isOwner()).toBe(true);

    bus.flush();

    // Both sides applied the same comparison, so exactly one stood down — and it is the
    // higher id that did, deterministically, rather than whichever happened to be slower.
    expect(a.isOwner()).toBe(true);
    expect(b.isOwner()).toBe(false);
    expect(b.state().readOnly).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Handoff
// ---------------------------------------------------------------------------

describe('takeover', () => {
  it('flips ownership in both tabs, and flips it back', () => {
    const bus = makeBus();
    const a = boot(createTabLock({ tabId: 'a', channel: bus.connect() }));
    const b = boot(createTabLock({ tabId: 'b', channel: bus.connect() }));

    b.requestTakeover();
    expect(b.isOwner()).toBe(true);
    expect(a.isOwner()).toBe(false);
    expect(a.state().readOnly).toBe(true);

    // Back the other way. A handoff that only works once is not a handoff.
    a.requestTakeover();
    expect(a.isOwner()).toBe(true);
    expect(b.isOwner()).toBe(false);
    expect(b.state().readOnly).toBe(true);
  });

  it('makes the demoted tab stop heartbeating', () => {
    const bus = makeBus();
    const a = boot(createTabLock({ tabId: 'a', channel: bus.connect() }));
    const b = boot(createTabLock({ tabId: 'b', channel: bus.connect() }));

    b.requestTakeover();
    b.dispose();

    // Only the owner heartbeats. If the demoted tab were still sending them, the stale
    // detector would never fire and a dead owner would look alive forever.
    vi.advanceTimersByTime(STALE_THRESHOLD_MS);
    expect(a.state().stale).toBe(true);
  });

  it('notifies subscribers on the transition', () => {
    const bus = makeBus();
    const a = boot(createTabLock({ tabId: 'a', channel: bus.connect() }));
    const b = boot(createTabLock({ tabId: 'b', channel: bus.connect() }));

    const seen: string[] = [];
    a.onChange((state) => seen.push(state.status));

    b.requestTakeover();
    expect(seen).toEqual(['secondary']);
  });

  it('does not re-notify on every heartbeat', () => {
    const bus = makeBus();
    boot(createTabLock({ tabId: 'a', channel: bus.connect() }));
    const b = boot(createTabLock({ tabId: 'b', channel: bus.connect() }));

    const listener = vi.fn();
    b.onChange(listener);
    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 5);

    expect(listener).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// A dead owner
// ---------------------------------------------------------------------------

describe('stale lock', () => {
  it('marks the lock stale after three missed heartbeats', () => {
    const bus = makeBus();
    const a = boot(createTabLock({ tabId: 'a', channel: bus.connect() }));
    const b = boot(createTabLock({ tabId: 'b', channel: bus.connect() }));

    a.dispose(); // the owning tab is killed and says nothing

    vi.advanceTimersByTime(STALE_THRESHOLD_MS - 1);
    expect(b.state().stale).toBe(false);

    vi.advanceTimersByTime(1);
    expect(b.state().stale).toBe(true);
  });

  it('does NOT promote the secondary, however long it waits', () => {
    const bus = makeBus();
    const a = boot(createTabLock({ tabId: 'a', channel: bus.connect() }));
    const b = boot(createTabLock({ tabId: 'b', channel: bus.connect() }));

    a.dispose();
    vi.advanceTimersByTime(STALE_THRESHOLD_MS * 100);

    // This is the assertion the whole design turns on. An auto-promote here would race
    // every surviving tab for permission to overwrite the file, which is a worse failure
    // than the deadlock it avoids. Stale changes one sentence; ownership needs a click.
    expect(b.isOwner()).toBe(false);
    expect(b.state().status).toBe('secondary');
    expect(b.state().readOnly).toBe(true);
  });

  it('stays fresh while the owner keeps beating', () => {
    const bus = makeBus();
    boot(createTabLock({ tabId: 'a', channel: bus.connect() }));
    const b = boot(createTabLock({ tabId: 'b', channel: bus.connect() }));

    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 20);
    expect(b.state().stale).toBe(false);
  });

  it('clears the stale flag if the owner comes back', () => {
    const bus = makeBus();
    const aChannel = bus.connect();
    const a = boot(createTabLock({ tabId: 'a', channel: aChannel }));
    const b = boot(createTabLock({ tabId: 'b', channel: bus.connect() }));

    // The owner's main thread wedges. Its heartbeat interval still fires; none of it
    // reaches the bus. To `b` this is indistinguishable from a tab that has died, and
    // that is the point — `b` must not need to tell the difference to react.
    aChannel.setMuted(true);
    vi.advanceTimersByTime(STALE_THRESHOLD_MS);
    expect(b.state().stale).toBe(true);

    // ...and then the tab comes back. A blocked main thread is a slow tab, not a dead
    // one, so a single heartbeat has to be enough to withdraw the accusation. Without
    // this, a tab that stuttered once would wear the stale banner until it was reloaded,
    // and the host would be invited to take over a tournament nobody had actually left.
    aChannel.setMuted(false);
    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
    expect(b.state().stale).toBe(false);

    // Recovery is not a handoff: `b` withdrew the stale flag, not the lock. Ownership
    // never moved, because ownership only ever moves on a click.
    expect(a.isOwner()).toBe(true);
    expect(b.isOwner()).toBe(false);
    expect(b.state().status).toBe('secondary');
  });

  it('lets the surviving tab claim by clicking, with everything intact', () => {
    const bus = makeBus();
    const a = boot(createTabLock({ tabId: 'a', channel: bus.connect() }));
    const b = boot(createTabLock({ tabId: 'b', channel: bus.connect() }));

    a.dispose();
    vi.advanceTimersByTime(STALE_THRESHOLD_MS);

    b.requestTakeover();
    expect(b.isOwner()).toBe(true);
    expect(b.state().stale).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// A clean departure
// ---------------------------------------------------------------------------

describe('released on pagehide', () => {
  it('tells the surviving tab at once rather than after the stale window', () => {
    const bus = makeBus();
    const a = boot(createTabLock({ tabId: 'a', channel: bus.connect() }));
    const b = boot(createTabLock({ tabId: 'b', channel: bus.connect() }));

    a.release();

    // No timer advance. That is the entire value of `released`: the banner tells the
    // truth immediately instead of six seconds later.
    expect(b.state().stale).toBe(true);
  });

  it('still does not hand ownership over without a click', () => {
    const bus = makeBus();
    const a = boot(createTabLock({ tabId: 'a', channel: bus.connect() }));
    const b = boot(createTabLock({ tabId: 'b', channel: bus.connect() }));

    a.release();
    vi.advanceTimersByTime(STALE_THRESHOLD_MS * 10);

    // A silent takeover is the clobber this module exists to prevent, with better
    // manners. `released` buys promptness, not consent.
    expect(b.isOwner()).toBe(false);

    b.requestTakeover();
    expect(b.isOwner()).toBe(true);
  });

  it('lets a tab still booting claim immediately instead of pinging into silence', () => {
    const bus = makeBus();
    const a = boot(createTabLock({ tabId: 'a', channel: bus.connect() }));

    const b = createTabLock({ tabId: 'b', channel: bus.connect() });
    b.claim(); // pings; a pongs
    a.release(); // ...and then a leaves, inside b's claim window

    vi.advanceTimersByTime(CLAIM_WINDOW_MS);

    // Nobody holds the lock by the time the window closes, so this is the boot path and
    // not a takeover.
    expect(b.isOwner()).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Leaving DURING the claim window — CR-03
  // -------------------------------------------------------------------------

  it('lets a tab that left inside its own claim window claim again on restore', () => {
    const bus = makeBus();
    const a = createTabLock({ tabId: 'a', channel: bus.connect() });

    // `pagehide` a tenth of a second after load: navigate away, then press Back. The
    // window is 250ms and this is inside it.
    a.claim();
    expect(a.state().status).toBe('claiming');
    a.release();

    // The recovery is driven rather than inspected. `pageshow` calls `claim()` on a
    // bfcache restore, and `claim()` refuses unless the status is idle — so if `release()`
    // abandoned the window instead of resolving it, this second protocol run does nothing
    // and the tab never owns anything again.
    a.claim();
    vi.advanceTimersByTime(CLAIM_WINDOW_MS);

    expect(a.isOwner()).toBe(true);

    // And it is a real owner rather than a tab reporting one: the next tab to boot hears
    // it on the channel and stands down.
    const b = boot(createTabLock({ tabId: 'b', channel: bus.connect() }));
    expect(b.isOwner()).toBe(false);
    expect(b.state().readOnly).toBe(true);
  });

  it('never leaves a tab unable to write with nothing on screen to explain it', () => {
    const bus = makeBus();
    const a = createTabLock({ tabId: 'a', channel: bus.connect() });

    a.claim();
    a.release();

    // Long enough that any timer which was going to resolve the window has had ten
    // chances. Nothing is pending; the state below is the state the host is left in.
    vi.advanceTimersByTime(STALE_THRESHOLD_MS * 10);

    // The deadlock's exact signature, as an invariant rather than as a status check:
    // `owner` false means every autosave and the pagehide flush are refused, and
    // `readOnly` false means `ReadOnlyBanner` renders nothing and the takeover button
    // never appears. `savingBlocked` is not raised either, because a refusal on ownership
    // deliberately does not raise it. A tab may be writable, or it may be told it is not.
    // It may never be neither.
    const state = a.state();
    expect(state.owner || state.readOnly).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Degradation
// ---------------------------------------------------------------------------

describe('without BroadcastChannel', () => {
  it('assumes sole ownership and reports it once', () => {
    const onDegraded = vi.fn();
    const lock = createTabLock({ tabId: 'x', channel: null, onDegraded });

    lock.claim();
    expect(lock.isOwner()).toBe(true);
    expect(lock.state().readOnly).toBe(false);
    expect(onDegraded).toHaveBeenCalledTimes(1);

    lock.claim();
    expect(onDegraded).toHaveBeenCalledTimes(1);
  });

  it('resolves to no channel when the global is absent', () => {
    const original = Reflect.get(globalThis, 'BroadcastChannel') as unknown;
    Reflect.deleteProperty(globalThis, 'BroadcastChannel');

    try {
      const lock = createTabLock({ tabId: 'x' });
      lock.claim();

      // A missing API must degrade to the pre-lock behaviour, never to a locked-out app
      // (T-01-43). No timer advance: there is nobody to wait for.
      expect(lock.isOwner()).toBe(true);
      lock.dispose();
    } finally {
      Object.defineProperty(globalThis, 'BroadcastChannel', {
        value: original,
        configurable: true,
        writable: true,
      });
    }
  });
});

// ---------------------------------------------------------------------------
// The gate the lock exists for
// ---------------------------------------------------------------------------

describe('the save gate', () => {
  it('writes when no lock has been engaged at all', () => {
    // Fail open, deliberately. A build that never calls `claimOwnership` must behave
    // exactly as it did before the lock existed rather than silently stop saving.
    expect(isOwner()).toBe(true);
    expect(save(makeDoc())).toBe(true);
    expect(storage.backing.has(STORAGE_KEY)).toBe(true);
  });

  it('writes from the owning tab', () => {
    const bus = makeBus();
    claimOwnership({ channel: bus.connect() });
    vi.advanceTimersByTime(CLAIM_WINDOW_MS);

    expect(ownershipState().status).toBe('owner');
    expect(save(makeDoc())).toBe(true);
    expect(storage.backing.has(STORAGE_KEY)).toBe(true);
  });

  it('writes NOTHING from a secondary tab', () => {
    const bus = makeBus();
    boot(createTabLock({ tabId: 'zzz-rival', channel: bus.connect() }));

    claimOwnership({ channel: bus.connect() });
    vi.advanceTimersByTime(CLAIM_WINDOW_MS);
    expect(ownershipState().readOnly).toBe(true);

    expect(save(makeDoc())).toBe(false);
    // Not "wrote an older value" — did not reach setItem at all.
    expect(storage.backing.size).toBe(0);
  });

  it('reopens the write path on takeover', () => {
    const bus = makeBus();
    boot(createTabLock({ tabId: 'zzz-rival', channel: bus.connect() }));

    claimOwnership({ channel: bus.connect() });
    vi.advanceTimersByTime(CLAIM_WINDOW_MS);
    expect(save(makeDoc())).toBe(false);

    requestTakeover();
    expect(isOwner()).toBe(true);
    expect(save(makeDoc())).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The clobber the takeover could otherwise reintroduce
// ---------------------------------------------------------------------------

describe('reloading on promotion', () => {
  it('adopts a newer persisted document, and does it before the tab may write', () => {
    // The tournament as the *owning* tab has been leaving it: five picks, and a
    // generation far ahead of anything this tab has written.
    const owned = makeDoc(['venusaur', 'charizard', 'blastoise', 'venusaur', 'charizard']);
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        schemaVersion: SCHEMA_VERSION,
        generation: 9_000_000,
        savedAt: 1_700_000_500_000,
        doc: owned,
      }),
    );

    const bus = makeBus();
    boot(createTabLock({ tabId: 'a', channel: bus.connect() }));

    let ownerDuringPromote: boolean | null = null;
    let adopted: TournamentDoc | null = null;

    const b: TabLock = createTabLock({
      tabId: 'b',
      channel: bus.connect(),
      onPromote: () => {
        ownerDuringPromote = b.isOwner();
        adopted = loadIfNewer();
      },
    });

    boot(b);
    expect(b.state().readOnly).toBe(true);
    expect(adopted).toBeNull();

    b.requestTakeover();

    expect(adopted).not.toBeNull();
    expect(adopted).toEqual(owned);
    // "Before writing" is the load-bearing half. If ownership flipped first, an autosave
    // scheduled in the same tick could reach setItem with the stale in-memory document.
    expect(ownerDuringPromote).toBe(false);
    expect(b.isOwner()).toBe(true);
  });

  it('adopts nothing when this tab is already current', () => {
    const bus = makeBus();
    claimOwnership({ channel: bus.connect() });
    vi.advanceTimersByTime(CLAIM_WINDOW_MS);

    save(makeDoc());
    expect(loadIfNewer()).toBeNull();
  });

  it('adopts nothing when there is no saved tournament', () => {
    expect(loadIfNewer()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Keeping a read-only tab live
// ---------------------------------------------------------------------------

describe('the saved nudge', () => {
  it('tells a secondary to re-read after the owner writes', () => {
    const bus = makeBus();
    const a = boot(createTabLock({ tabId: 'a', channel: bus.connect() }));

    const onRemoteSave = vi.fn();
    boot(createTabLock({ tabId: 'b', channel: bus.connect(), onRemoteSave }));

    a.notifySaved();

    // Without this the second tab is frozen at whatever the board looked like when it
    // opened, which a host glancing at the spare screen would read as the live state.
    expect(onRemoteSave).toHaveBeenCalledTimes(1);
  });

  it('is not sent by a tab that does not own the lock', () => {
    const bus = makeBus();
    boot(createTabLock({ tabId: 'a', channel: bus.connect() }));

    const onRemoteSave = vi.fn();
    const b = boot(createTabLock({ tabId: 'b', channel: bus.connect(), onRemoteSave }));

    // A secondary cannot have written — `save()` refused it — so announcing a write
    // would be announcing something that did not happen.
    b.notifySaved();
    expect(onRemoteSave).not.toHaveBeenCalled();
  });

  it('counts as proof of life, so it clears a stale flag', () => {
    const bus = makeBus();
    const aChannel = bus.connect();
    const a = boot(createTabLock({ tabId: 'a', channel: aChannel }));
    const b = boot(createTabLock({ tabId: 'b', channel: bus.connect() }));

    aChannel.setMuted(true);
    vi.advanceTimersByTime(STALE_THRESHOLD_MS);
    expect(b.state().stale).toBe(true);

    // A tab that just wrote the tournament is alive by definition. Leaving the stale
    // sentence up while the owner is demonstrably drafting would invite the host to take
    // over a tab that never stopped working.
    aChannel.setMuted(false);
    a.notifySaved();

    expect(b.state().stale).toBe(false);
    expect(b.isOwner()).toBe(false);
  });

  it('reaches a secondary through the real save path', () => {
    const bus = makeBus();

    // This tab owns the lock, so `save()` is allowed through...
    claimOwnership({ channel: bus.connect() });
    vi.advanceTimersByTime(CLAIM_WINDOW_MS);

    const onRemoteSave = vi.fn();
    boot(createTabLock({ tabId: 'zzz-watcher', channel: bus.connect(), onRemoteSave }));

    expect(save(makeDoc())).toBe(true);

    // ...and the write itself, not a separate call the UI has to remember to make, is
    // what tells the watching tab to look again.
    expect(onRemoteSave).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// The numbers the plan names
// ---------------------------------------------------------------------------

describe('protocol constants', () => {
  it('beats every two seconds and calls it stale after three missed beats', () => {
    expect(HEARTBEAT_INTERVAL_MS).toBe(2000);
    expect(STALE_THRESHOLD_MS).toBe(6000);
    expect(STALE_THRESHOLD_MS / HEARTBEAT_INTERVAL_MS).toBe(3);
  });
});
