/**
 * tab-lock.ts — PERS-03 / D-12: exactly one browsing context may write.
 *
 * Impure by construction — it opens a `BroadcastChannel`, runs timers, and reads the
 * clock — so it lives in `adapters/` and `npm run check:pure` fails the build if
 * anything under `src/core` imports it. `BroadcastChannel` is on the forbidden-token
 * list in `scripts/check-pure-core.mjs` specifically so this file cannot drift inward.
 *
 * ## Why a lock and not a warning
 *
 * `localStorage` is shared per origin. Two tabs each holding an in-memory copy of the
 * tournament and each autosaving is last-writer-wins: the tab that has been sitting idle
 * overwrites the tab that has been drafting, and there is no error, no warning, and no
 * way to tell afterwards. D-12 chose an ownership lock over the cheaper generation-check
 * warning knowing it is the more expensive option, because a warning makes the clobber
 * noisy and a lock makes it impossible. `save()` in `persistence.ts` returns early unless
 * `isOwner()` — the banner is the explanation, that line is the guarantee.
 *
 * ## Two failure modes, not one
 *
 * The obvious one is the clobber. The less obvious one is the deadlock: if the owning tab
 * is force-closed or crashes and the lock is held forever, the tournament is stuck behind
 * a tab that no longer exists, which is a *worse* outcome than the race it prevented. So
 * the owner heartbeats every {@link HEARTBEAT_INTERVAL_MS}ms and a secondary that has seen
 * nothing for {@link STALE_THRESHOLD_MS}ms — three missed beats — marks the lock stale.
 *
 * **A stale lock never auto-promotes.** It changes one sentence in the banner and nothing
 * else. Auto-promotion would race three tabs against each other for a prize that is
 * "permission to overwrite the file", which is strictly worse than asking for one click.
 *
 * ## Why a clean `released` does not auto-promote either
 *
 * Closing a tab fires `pagehide`, so the owner announces `released` on the way out. It is
 * tempting to have a surviving tab quietly take the lock at that point — but a silent
 * takeover is exactly the clobber this module exists to prevent, only with better
 * manners. What `released` buys is *promptness*: a tab still booting claims immediately
 * instead of pinging into silence, and an already-open secondary is told at once rather
 * than six seconds later. The click is still required.
 *
 * ## What this does not cover
 *
 * `BroadcastChannel` is same-origin and same-browser. Two different browsers, two
 * profiles, or two devices share no channel and share no `localStorage` either, so there
 * is nothing to clobber. A same-origin script could forge a `takeover` — and could also
 * write `localStorage` directly, so there is no privilege here to escalate (T-01-42).
 */

import { now } from './clock';
import { newId } from './id';

/** Same-origin, same-browser. One channel for the whole application. */
export const CHANNEL_NAME = 'champions-drafter';

/** How often the owner announces it is still alive. */
export const HEARTBEAT_INTERVAL_MS = 2000;

/**
 * Three missed beats before a secondary calls the lock stale.
 *
 * One missed beat is a busy main thread; three is a tab that is gone. Six seconds is
 * also short enough that the host reads it as the app noticing rather than as the app
 * being broken.
 */
export const STALE_THRESHOLD_MS = 6000;

/**
 * How long a booting tab waits for a `pong` before claiming.
 *
 * A same-origin `BroadcastChannel` round trip is sub-millisecond; 250ms is ample even on
 * a main thread busy parsing the roster snapshot. Writes are refused for the duration
 * (see {@link LockStatus}), which costs nothing because the autosave is debounced and a
 * tab closed a quarter of a second after boot has nothing to save.
 */
export const CLAIM_WINDOW_MS = 250;

export type LockMessageType =
  /** I am asserting ownership. */
  | 'claim'
  /** I still hold ownership. */
  | 'heartbeat'
  /** I am taking ownership from whoever holds it. A human clicked. */
  | 'takeover'
  /** I am giving up ownership, on my way out. */
  | 'released'
  /** Is anyone holding ownership? */
  | 'ping'
  /** Yes, I am. */
  | 'pong'
  /**
   * I just wrote the tournament. Re-read it if what you hold is older.
   *
   * Deliberately carries no generation of its own. The comparison already exists in
   * `persistence.loadIfNewer()`, and a number travelling on the channel would be a second
   * copy of it that could disagree with the stored record. This is a nudge, not a datum:
   * the receiver goes and looks.
   */
  | 'saved';

export interface LockMessage {
  readonly type: LockMessageType;
  readonly tabId: string;
  readonly at: number;
}

export type LockStatus =
  /** No lock has been engaged. Writes are allowed — this is the pre-lock behaviour. */
  | 'idle'
  /** Pinged, waiting out {@link CLAIM_WINDOW_MS}. Writes refused, banner not yet shown. */
  | 'claiming'
  /** This tab holds write ownership. */
  | 'owner'
  /** Another tab holds it. Read-only. */
  | 'secondary';

export interface OwnershipState {
  readonly status: LockStatus;
  /**
   * Whether this tab may write. Deliberately false while the claim is in flight: a
   * quarter-second of refused autosaves is the price of never writing from a tab that
   * turns out to be a secondary.
   */
  readonly owner: boolean;
  /** Whether to render the read-only banner. Never true during the claim window. */
  readonly readOnly: boolean;
  /**
   * Whether the owning tab has stopped responding. Changes the banner sentence and
   * nothing else — ownership does not move without a click.
   */
  readonly stale: boolean;
}

/**
 * The slice of `BroadcastChannel` this module uses.
 *
 * Narrowed to a port rather than used directly so the protocol can be exercised by two
 * lock instances against one synchronous fake. The alternative is testing multi-tab
 * behaviour in production, which is the thing that never happens.
 */
export interface LockChannel {
  postMessage(message: LockMessage): void;
  listen(handler: (message: LockMessage) => void): void;
  close(): void;
}

export interface TabLockOptions {
  /** Defaults to a fresh UUID. Injected in tests so the tie-break is deterministic. */
  tabId?: string;
  /** Omit for the real channel. `null` means "no channel available". */
  channel?: LockChannel | null;
  /**
   * Run when this tab is about to gain write ownership, and **before** `isOwner()`
   * turns true. This is where the promoted tab reloads the persisted document, which is
   * the whole of the T-01-40 mitigation — see {@link TabLock.requestTakeover}.
   */
  onPromote?: () => void;
  /** Called once when there is no `BroadcastChannel` to open. */
  onDegraded?: () => void;
  /**
   * The owning tab wrote. Only ever called on a secondary.
   *
   * Without this a read-only tab is frozen at whatever the draft looked like when it
   * opened, which reads as "this tab is broken" rather than "this tab is watching" — and
   * a host glancing at the second screen would be reading a stale board.
   */
  onRemoteSave?: () => void;
}

export interface TabLock {
  readonly tabId: string;
  /** Run the boot protocol: ping, wait, then claim or stand down. */
  claim(): void;
  /** Transfer ownership to this tab. Always a human decision, never automatic. */
  requestTakeover(): void;
  onChange(listener: (state: OwnershipState) => void): () => void;
  isOwner(): boolean;
  state(): OwnershipState;
  /** Tell secondaries the stored document moved. No-op unless this tab owns the lock. */
  notifySaved(): void;
  /** Announce departure and stop heartbeating. For `pagehide`. */
  release(): void;
  /** Stop every timer and close the channel. For unmount, and for tests. */
  dispose(): void;
}

const IDLE_STATE: OwnershipState = {
  status: 'idle',
  owner: true,
  readOnly: false,
  stale: false,
};

/** Wrap a real `BroadcastChannel`, or report that there is not one. */
function openBroadcastChannel(): LockChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;

  let channel: BroadcastChannel;
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
  } catch {
    // Some embedded webviews expose the constructor and refuse to build one.
    return null;
  }

  return {
    postMessage: (message) => {
      try {
        channel.postMessage(message);
      } catch {
        // A closed channel throws. Nothing useful to do on the way out.
      }
    },
    listen: (handler) => {
      channel.onmessage = (event: MessageEvent<LockMessage>) => handler(event.data);
    },
    close: () => channel.close(),
  };
}

// ---------------------------------------------------------------------------
// The lock itself
// ---------------------------------------------------------------------------

export function createTabLock(options: TabLockOptions = {}): TabLock {
  const tabId = options.tabId ?? newId();
  const channel = options.channel === undefined ? openBroadcastChannel() : options.channel;

  let status: LockStatus = 'idle';
  let stale = false;
  let sawPong = false;

  /**
   * When a heartbeat, pong, claim or takeover last proved the owner exists.
   *
   * The stale timer below is the mechanism; this is the evidence, and it is checked
   * against the clock when the timer fires so a timer that ran early — a throttled
   * background tab is entitled to fire late, and a fake clock in a test can make it fire
   * at any point — cannot declare a live owner dead.
   */
  let lastHeartbeatAt: number | null = null;

  let claimTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let staleTimer: ReturnType<typeof setTimeout> | null = null;

  const listeners = new Set<(state: OwnershipState) => void>();

  let emittedStatus: LockStatus | null = null;
  let emittedStale = false;

  function snapshot(): OwnershipState {
    return {
      status,
      owner: status === 'idle' || status === 'owner',
      readOnly: status === 'secondary',
      stale,
    };
  }

  /** Notify only on an observable change; heartbeats arrive every two seconds. */
  function emit(): void {
    if (status === emittedStatus && stale === emittedStale) return;
    emittedStatus = status;
    emittedStale = stale;

    const state = snapshot();
    for (const listener of listeners) listener(state);
  }

  function post(type: LockMessageType): void {
    channel?.postMessage({ type, tabId, at: now() });
  }

  function cancelClaimWindow(): void {
    if (claimTimer === null) return;
    clearTimeout(claimTimer);
    claimTimer = null;
  }

  function stopHeartbeat(): void {
    if (heartbeatTimer === null) return;
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  function stopStaleWatch(): void {
    if (staleTimer === null) return;
    clearTimeout(staleTimer);
    staleTimer = null;
  }

  function markStale(): void {
    staleTimer = null;
    if (status !== 'secondary' || stale) return;

    // Guard against an early timer. If the owner spoke recently, re-arm for the
    // remainder rather than calling a live tab dead.
    const since = lastHeartbeatAt === null ? Number.POSITIVE_INFINITY : now() - lastHeartbeatAt;
    if (since < STALE_THRESHOLD_MS) {
      staleTimer = setTimeout(markStale, STALE_THRESHOLD_MS - since);
      return;
    }

    stale = true;
    // Note what does NOT happen here: no promotion, no claim, no write. The banner
    // swaps one sentence and the takeover button — already present — stays a click away.
    emit();
  }

  function armStaleWatch(): void {
    stopStaleWatch();
    staleTimer = setTimeout(markStale, STALE_THRESHOLD_MS);
  }

  /** The owner is alive: refresh the evidence and clear a stale flag if one was set. */
  function noteOwnerAlive(): void {
    lastHeartbeatAt = now();
    if (status !== 'secondary') return;

    stale = false;
    armStaleWatch();
    emit();
  }

  function becomeOwner(announcement: 'claim' | null): void {
    if (status === 'owner') return;

    cancelClaimWindow();
    stopStaleWatch();

    // Before the flag flips, never after. A tab that sat read-only for ten picks holds a
    // stale document, and writing it back is precisely the clobber the lock exists to
    // prevent (T-01-40). `isOwner()` is still false inside this callback, so nothing the
    // handler triggers can reach `setItem` ahead of the reload.
    options.onPromote?.();

    status = 'owner';
    stale = false;
    lastHeartbeatAt = null;

    if (announcement !== null) post(announcement);
    stopHeartbeat();
    heartbeatTimer = setInterval(() => post('heartbeat'), HEARTBEAT_INTERVAL_MS);

    emit();
  }

  function becomeSecondary(): void {
    cancelClaimWindow();
    stopHeartbeat();

    status = 'secondary';
    stale = false;
    lastHeartbeatAt = now();
    armStaleWatch();

    emit();
  }

  /**
   * Two tabs both believe they own the lock. Resolve it the same way in both.
   *
   * This is not the normal path — a takeover demotes the outgoing owner explicitly. It
   * is the partition case: two tabs boot inside the same claim window, or a channel
   * delivers late, and both come out of the window as owners. Comparing tab ids gives
   * both sides the same answer without another round trip, so exactly one stands down.
   */
  function resolveOwnershipConflict(otherTabId: string): void {
    if (tabId < otherTabId) return;
    becomeSecondary();
  }

  /**
   * The owner announced it is leaving, or a `released` arrived from a tab that has gone.
   *
   * Deliberately not a promotion. See the module header: the point of `released` is that
   * the surviving tab hears the truth immediately instead of waiting out six seconds of
   * silence, not that it inherits the lock without being asked.
   */
  function noteOwnerGone(): void {
    stopStaleWatch();

    if (status === 'claiming') {
      // Nobody holds it after all; let the window resolve into ownership. This is the
      // boot path, not a takeover.
      sawPong = false;
      return;
    }

    if (status !== 'secondary' || stale) return;
    stale = true;
    emit();
  }

  function receive(message: LockMessage): void {
    // A real BroadcastChannel never echoes to its sender. Belt and braces.
    if (message.tabId === tabId) return;

    switch (message.type) {
      case 'ping':
        if (status === 'owner') post('pong');
        return;

      case 'pong':
        sawPong = true;
        noteOwnerAlive();
        return;

      case 'heartbeat':
        if (status === 'owner') {
          resolveOwnershipConflict(message.tabId);
          return;
        }
        noteOwnerAlive();
        return;

      case 'claim':
        if (status === 'owner') {
          resolveOwnershipConflict(message.tabId);
          return;
        }
        sawPong = true;
        becomeSecondary();
        return;

      case 'takeover':
        // Authoritative, and never tie-broken. A human clicked; the machine does not get
        // a vote on whether the click counted.
        sawPong = true;
        becomeSecondary();
        return;

      case 'released':
        if (status === 'owner') return;
        noteOwnerGone();
        return;

      case 'saved':
        // Proof of life as well as a nudge: a tab that just wrote is unambiguously
        // alive, so this clears a stale flag for the same reason a heartbeat does.
        if (status === 'owner') return;
        noteOwnerAlive();
        options.onRemoteSave?.();
        return;
    }
  }

  function claim(): void {
    if (status !== 'idle') return;

    if (channel === null) {
      // No BroadcastChannel: an embedded webview, or a browser without it. Degrade to
      // the pre-lock behaviour — sole ownership — and say so once. Degrading to a
      // locked-out app would trade a rare race for a certain outage (T-01-43).
      options.onDegraded?.();
      status = 'owner';
      emit();
      return;
    }

    channel.listen(receive);

    status = 'claiming';
    sawPong = false;
    emit();

    post('ping');
    claimTimer = setTimeout(() => {
      claimTimer = null;
      if (status !== 'claiming') return;
      if (sawPong) becomeSecondary();
      else becomeOwner('claim');
    }, CLAIM_WINDOW_MS);
  }

  function requestTakeover(): void {
    if (status === 'owner') return;

    // Announce first, promote second. The outgoing owner stands down on the message, and
    // ordering it this way means the window in which two tabs consider themselves the
    // owner is one channel delivery wide rather than one round trip.
    post('takeover');
    becomeOwner(null);
  }

  function notifySaved(): void {
    if (status !== 'owner') return;
    post('saved');
  }

  function release(): void {
    // A departure inside the claim window is resolved, never abandoned.
    //
    // `installLifecycle` wires this to `pagehide`, so navigating away within
    // CLAIM_WINDOW_MS of load reaches here while `status === 'claiming'`. Cancelling the
    // timer and falling through to the owner check below left the tab wedged in
    // `claiming` with nothing pending to move it on, and `claim()` refuses to re-run
    // unless the status is `idle` — so the bfcache restore path could not recover it
    // either. The resulting state was the worst combination on offer: `isOwner()` false,
    // so every autosave and the `pagehide` flush were silently refused; `readOnly` false,
    // so no banner and no takeover button; and `savingBlocked` never raised, because a
    // refusal on ownership deliberately does not raise it. The host drafts a whole
    // tournament into a tab that looks writable and keeps none of it.
    //
    // Back to `idle` — the pre-lock state — so `pageshow` can re-run the protocol and so
    // `isOwner()` answers the way it does before any lock is engaged in the meantime. The
    // module header names deadlock as a worse outcome than the race it prevents; this is
    // that deadlock, and this is the line that refuses it.
    if (status === 'claiming') {
      cancelClaimWindow();
      stopStaleWatch();

      status = 'idle';
      emittedStatus = null;
      return;
    }

    cancelClaimWindow();
    stopStaleWatch();

    if (status !== 'owner') return;

    post('released');
    stopHeartbeat();

    // Back to idle rather than to secondary, for two reasons. A page restored from the
    // back/forward cache re-runs the claim protocol from a clean slate; and `isOwner()`
    // stays true across the teardown, so persistence's own `pagehide` flush still lands
    // regardless of which listener the browser happens to call first. A secondary is
    // left as a secondary precisely so its flush does NOT land.
    status = 'idle';
    emittedStatus = null;
  }

  function dispose(): void {
    cancelClaimWindow();
    stopHeartbeat();
    stopStaleWatch();
    channel?.close();
    listeners.clear();
    status = 'idle';
    emittedStatus = null;
  }

  return {
    tabId,
    claim,
    requestTakeover,
    onChange: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    isOwner: () => status === 'idle' || status === 'owner',
    state: snapshot,
    notifySaved,
    release,
    dispose,
  };
}

// ---------------------------------------------------------------------------
// The application's single lock
// ---------------------------------------------------------------------------

let lock: TabLock | null = null;
let lifecycleTeardown: (() => void) | null = null;

const changeListeners = new Set<(state: OwnershipState) => void>();

function reportDegraded(): void {
  // Once. A message per boot is a note for whoever opens the console; a message per
  // heartbeat would be noise that trains people to close the console.
  console.info(
    'champions-drafter: BroadcastChannel is unavailable, so this tab assumes it is the only one. Two tabs open at once could overwrite each other.',
  );
}

function installLifecycle(): void {
  if (typeof window === 'undefined') return;

  const onPageHide = (): void => lock?.release();
  const onPageShow = (event: PageTransitionEvent): void => {
    // Restored from the back/forward cache. `release()` put the lock back to idle on the
    // way out, so this re-runs the boot protocol rather than leaving a restored tab
    // stuck behind a banner it can never clear.
    if (event.persisted) lock?.claim();
  };

  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);

  lifecycleTeardown = () => {
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
  };
}

export interface ClaimOptions {
  /** Reload the persisted document before this tab is allowed to write. */
  onPromote?: () => void;
  /** The owner wrote; re-read storage so a read-only view keeps up. */
  onRemoteSave?: () => void;
  /** Test seam. Omit in the application; the real channel is opened for you. */
  channel?: LockChannel | null;
}

/**
 * Engage the lock for this tab. Idempotent.
 *
 * Until this is called `isOwner()` answers true, which is deliberate: a build that never
 * engages the lock must behave exactly as it did before the lock existed, not silently
 * stop saving. The gate is a lock, not a kill switch.
 */
export function claimOwnership(options: ClaimOptions = {}): void {
  if (lock !== null) return;

  lock = createTabLock({
    ...(options.onPromote === undefined ? {} : { onPromote: options.onPromote }),
    ...(options.onRemoteSave === undefined ? {} : { onRemoteSave: options.onRemoteSave }),
    ...(options.channel === undefined ? {} : { channel: options.channel }),
    onDegraded: reportDegraded,
  });

  lock.onChange((state) => {
    for (const listener of changeListeners) listener(state);
  });

  installLifecycle();
  lock.claim();
}

/** Transfer write ownership to this tab. Only ever called from a click. */
export function requestTakeover(): void {
  lock?.requestTakeover();
}

/** Subscribe to ownership changes. Safe to call before or after `claimOwnership`. */
export function onOwnershipChange(listener: (state: OwnershipState) => void): () => void {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}

/** Whether this tab may write. Consulted by `persistence.save` on every write. */
export function isOwner(): boolean {
  return lock === null ? true : lock.isOwner();
}

/**
 * Announce that the stored tournament moved. Called by `persistence.save` after a write.
 *
 * A no-op when no lock is engaged, which keeps the pre-lock behaviour intact: a build
 * that never calls `claimOwnership` has no secondaries to tell.
 */
export function notifySaved(): void {
  lock?.notifySaved();
}

/** The current ownership state, for a component's initial render. */
export function ownershipState(): OwnershipState {
  return lock === null ? IDLE_STATE : lock.state();
}

/** Tear the lock down. For unmount, and for test isolation. */
export function disposeTabLock(): void {
  lock?.release();
  lock?.dispose();
  lock = null;
  lifecycleTeardown?.();
  lifecycleTeardown = null;
  changeListeners.clear();
}
