// @vitest-environment happy-dom

/**
 * The blind entry surface's lifecycle guard — BAN-06, D-17, D-18.
 *
 * `happy-dom` rather than the default `node` environment, because this file's entire
 * subject is real `window` and `document` events. The adapter is driven through the events
 * it actually listens for rather than by inspecting the listeners it registered, which is
 * `tests/adapters/tab-lock.test.ts:499`'s posture — "the recovery is driven rather than
 * inspected" — applied one layer down.
 *
 * ## The synthetic-event forms are the point of this file, and they are measured
 *
 * 04-RESEARCH executed all four of the forms below against this repository's installed
 * `happy-dom@20.11.1`. **Do not "tidy" the `Object.assign` calls into a constructor with an
 * init dictionary.** The measurement, which is the reason they are written this way:
 *
 * - Constructing a `PageTransitionEvent` with `{ persisted: true }` yields a `persisted`
 *   of `undefined` — happy-dom does not honour that init dictionary. A test written the
 *   obvious way silently exercises the falsy branch, passes, and proves nothing about the
 *   guard. That is precisely the "easy to get silently wrong" the ROADMAP flags for BAN-06.
 * - The working restore form is `Object.assign` over a bare `Event`, which sets the
 *   property directly.
 * - `visibilityState` is a getter, so hiding the tab needs `Object.defineProperty` before
 *   the event is dispatched. It is restored in `afterEach`, because a `configurable: true`
 *   redefinition otherwise leaks into the next case.
 *
 * ## Both polarities, for all three events
 *
 * 04-RESEARCH §Common Pitfalls, Pitfall 3: "the warning sign is a bfcache test with only
 * one `dispatchEvent`". A suite that only fires the persisted event cannot tell a correct
 * guard from `if (true) onLock()`, so the non-persisted case below is not a completeness
 * exercise — it is the assertion that proves `persisted` is read at all.
 *
 * ## The Back-button cases DRIVE `history.back()`; they never dispatch a `popstate`
 *
 * This is the same rule one notch sharper, and it is the whole reason the last describe
 * block below can fail. A synthetic `window.dispatchEvent(new Event('popstate'))` reaches
 * the listener whether or not the adapter ever pushed a history entry, so a suite written
 * that way passes against the exact defect the host reported — an app with a listener and
 * no entry for Back to land on, which leaves the document. Calling `history.back()` is what
 * couples the two halves: with no pushed entry the call is a measured no-op that fires
 * nothing, so the assertion `locks === 1` fails.
 *
 * happy-dom's traversal is SYNCHRONOUS, unlike a real browser's queued task. That is a
 * convenience for the assertions and nothing more — the adapter never reads the ordering.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installBanShield } from '../../src/adapters/ban-shield';

// ---------------------------------------------------------------------------
// The measured event forms
// ---------------------------------------------------------------------------

/*
  These BUILD an event; they never dispatch one. The construction is named once so the
  measured form cannot drift between cases, and the dispatch stays written out at every
  call site for two reasons: the `window` / `document` asymmetry the adapter copies is only
  visible where the event is actually delivered, and a suite whose dispatches are all
  hidden behind one helper is indistinguishable from one that fires a single event —
  which is Pitfall 3's warning sign exactly.
*/

/** A restore from the back/forward cache. The init dictionary is NOT honoured; assign it. */
function persistedPageShow(): Event {
  return Object.assign(new Event('pageshow'), { persisted: true });
}

/** An ordinary load. `persisted` is absent, which is the falsy the guard must respect. */
function normalPageShow(): Event {
  return new Event('pageshow');
}

/**
 * `visibilityState` is a getter on `document`, so it is redefined rather than assigned.
 * Returns the event so the dispatch itself stays at the call site.
 */
function visibilityChange(visibilityState: 'hidden' | 'visible'): Event {
  Object.defineProperty(document, 'visibilityState', {
    value: visibilityState,
    configurable: true,
  });
  return new Event('visibilitychange');
}

/**
 * Is the entry surface's own history entry the current one?
 *
 * The shape is written out here rather than imported, deliberately. The adapter exports one
 * function and nothing else, and widening that surface so a test can read a private
 * constant would make the constant part of the module's contract. Spelling it out instead
 * pins the wire shape: a rename inside the adapter that forgot the teardown's read would
 * still be caught, because both sides would have to agree with this literal.
 */
function currentEntryIsSentinel(): boolean {
  const state: unknown = window.history.state;
  return (
    typeof state === 'object' &&
    state !== null &&
    (state as { blindBanEntry?: unknown }).blindBanEntry === true
  );
}

/**
 * happy-dom keeps ONE history for the whole file and there is no API that clears it.
 *
 * A case that ended sitting on a sentinel would arm the next case's `history.back()` before
 * that case installed anything, which is exactly the false positive the drive-the-real-Back
 * rule above exists to avoid. Draining leaves every case starting at the base entry, where
 * `history.back()` is a no-op that fires nothing — measured, not assumed.
 *
 * The loop terminates because the base entry's state is `null` and this adapter is the only
 * thing in the repository that ever calls `pushState`. The bound is there anyway, because a
 * test suite that can hang is worse than one that fails.
 */
function drainSentinelEntries(): void {
  for (let guard = 0; guard < 32 && currentEntryIsSentinel(); guard += 1) {
    window.history.back();
  }
}

beforeEach(drainSentinelEntries);

afterEach(() => {
  // A `configurable: true` redefinition survives the test that made it, and a document
  // left `hidden` would make the next case's `visible` assertion pass for the wrong reason.
  Object.defineProperty(document, 'visibilityState', {
    value: 'visible',
    configurable: true,
  });
  vi.unstubAllGlobals();
  drainSentinelEntries();
});

describe('installBanShield', () => {
  it('returns a teardown function', () => {
    const teardown = installBanShield(() => undefined);

    expect(typeof teardown).toBe('function');

    teardown();
  });

  it('registers nothing and returns a no-op teardown with no window', () => {
    vi.stubGlobal('window', undefined);

    let locks = 0;
    const teardown = installBanShield(() => (locks += 1));

    expect(typeof teardown).toBe('function');
    expect(() => teardown()).not.toThrow();
    expect(locks).toBe(0);
  });

  // -------------------------------------------------------------------------
  // `pageshow` — BOTH polarities. The second is the one that proves the guard.
  // -------------------------------------------------------------------------

  it('locks on a pageshow that was restored from the back/forward cache', () => {
    let locks = 0;
    const teardown = installBanShield(() => (locks += 1));

    window.dispatchEvent(persistedPageShow());

    expect(locks).toBe(1);

    teardown();
  });

  /**
   * THE ASSERTION THAT MAKES THIS SUITE A GATE.
   *
   * Without it every case above passes against `onPageShow = () => onLock()`, which locks
   * the entry surface on every ordinary load of the page and would never be noticed by a
   * test that only ever fires the restore.
   */
  it('does NOT lock on an ordinary, non-persisted pageshow', () => {
    let locks = 0;
    const teardown = installBanShield(() => (locks += 1));

    window.dispatchEvent(normalPageShow());

    expect(locks).toBe(0);

    teardown();
  });

  // -------------------------------------------------------------------------
  // `visibilitychange` — BOTH polarities, D-18's alt-tab
  // -------------------------------------------------------------------------

  it('locks when the tab is hidden', () => {
    let locks = 0;
    const teardown = installBanShield(() => (locks += 1));

    document.dispatchEvent(visibilityChange('hidden'));

    expect(locks).toBe(1);

    teardown();
  });

  it('does NOT lock when the tab becomes visible', () => {
    let locks = 0;
    const teardown = installBanShield(() => (locks += 1));

    document.dispatchEvent(visibilityChange('visible'));

    expect(locks).toBe(0);

    teardown();
  });

  // -------------------------------------------------------------------------
  // `pagehide` — the event that fires on the way INTO the cache
  // -------------------------------------------------------------------------

  /**
   * Beyond the two events D-17 and D-18 name, and deliberately so: locking here means the
   * restored page has already been made safe before `pageshow` runs, which closes the
   * window where a slow restore paints the entry surface for a frame. The only cost is an
   * extra lock on a departure that was leaving anyway.
   */
  it('locks on pagehide', () => {
    let locks = 0;
    const teardown = installBanShield(() => (locks += 1));

    window.dispatchEvent(new Event('pagehide'));

    expect(locks).toBe(1);

    teardown();
  });

  // -------------------------------------------------------------------------
  // Teardown, and the coexistence invariant
  // -------------------------------------------------------------------------

  it('removes every listener on teardown', () => {
    let locks = 0;
    const teardown = installBanShield(() => (locks += 1));

    teardown();

    window.dispatchEvent(persistedPageShow());
    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('popstate'));
    document.dispatchEvent(visibilityChange('hidden'));

    expect(locks).toBe(0);
  });

  /**
   * 04-RESEARCH §"How a second `pageshow` consumer coexists". `installLifecycle` in
   * `tab-lock.ts` owns a `pageshow` listener of its own and this adapter must not disturb
   * it: `addEventListener` is additive and neither handler calls `stopPropagation`.
   *
   * Asserted with a stand-in listener rather than by booting the lock, because the property
   * under test is the DOM's, not the lock's — a second consumer of any kind still hears the
   * event.
   */
  it('leaves a second pageshow consumer hearing the same event', () => {
    let locks = 0;
    let others = 0;
    const other = (): void => {
      others += 1;
    };

    window.addEventListener('pageshow', other);
    const teardown = installBanShield(() => (locks += 1));

    window.dispatchEvent(persistedPageShow());

    expect(locks).toBe(1);
    expect(others).toBe(1);

    // The shield's teardown removes ITS listener only. A teardown that reached for the
    // other consumer's would be the coupling this adapter exists to avoid.
    teardown();
    window.dispatchEvent(persistedPageShow());

    expect(locks).toBe(1);
    expect(others).toBe(2);

    window.removeEventListener('pageshow', other);
  });
});

// ---------------------------------------------------------------------------
// The browser Back button — D-17's destination half
// ---------------------------------------------------------------------------

/**
 * BACK MUST LAND ON THE LOCKED STATE, NOT LEAVE THE APPLICATION.
 *
 * The host found this at 04-11's verification checkpoint: Back discarded correctly —
 * `pagehide` fired and nothing was retained — and then took the room out of the tool
 * entirely. The cause was not in the listeners. The application had never pushed a history
 * entry, so the back/forward stack held exactly one entry, its own document, and Back popped
 * that. D-17 named the destination and silently assumed somewhere to go.
 *
 * The fix is one sentinel entry with one listener, alive only while the entry surface is
 * mounted. It is NOT routing: nothing writes a URL, nothing reads one, and the sentinel is
 * consumed on the way out so eight players do not leave eight entries behind them.
 *
 * ## The invariant these cases pin, in one sentence
 *
 * While the shield is installed the current history entry is the sentinel; once it is torn
 * down, it is not. Install pushes unless the sentinel is already current, teardown consumes
 * it if it still is, and those two conditions are each other's mirror rather than a flag
 * passed between them.
 */
describe('installBanShield, the browser Back button', () => {
  it('makes the entry surface its own history entry', () => {
    const teardown = installBanShield(() => undefined);

    expect(currentEntryIsSentinel()).toBe(true);

    teardown();

    expect(currentEntryIsSentinel()).toBe(false);
  });

  /**
   * THE CASE THE HOST'S FINDING IS ABOUT, AND THE ONE THAT PROVES THE PUSH HAPPENED.
   *
   * `history.back()` rather than a synthetic `popstate`. With no entry pushed the call is a
   * no-op that fires nothing, so this case cannot pass against an adapter that registers the
   * listener and never pushes — which is precisely the shape the shipped defect had.
   */
  it('locks on a real browser Back rather than letting it leave the document', () => {
    let locks = 0;
    const teardown = installBanShield(() => (locks += 1));

    window.history.back();

    expect(locks).toBe(1);
    // Still the same document: the traversal landed on the entry BELOW the sentinel.
    expect(currentEntryIsSentinel()).toBe(false);

    teardown();
  });

  /**
   * ONE DISCARD, NOT TWO — and measured rather than reasoned about.
   *
   * A same-document traversal is not a document unload, so `pagehide` should stay silent
   * and the two handlers cannot both fire. The observer is registered BEFORE the shield, so
   * it hears anything the shield's own `pagehide` listener would have heard.
   */
  it('discards once on Back, with no pagehide alongside it', () => {
    let locks = 0;
    let pageHides = 0;
    const observer = (): void => {
      pageHides += 1;
    };

    window.addEventListener('pagehide', observer);
    const teardown = installBanShield(() => (locks += 1));

    window.history.back();

    expect(locks).toBe(1);
    expect(pageHides).toBe(0);

    window.removeEventListener('pagehide', observer);
    teardown();
  });

  /**
   * THE ORDERING GATE INSIDE THE TEARDOWN.
   *
   * Consuming the sentinel is itself a traversal, so a teardown that called `back()` before
   * removing its own listener would announce a discard on the way out of a surface that had
   * just been left — including on the LOCK-IN path, where nothing was discarded at all.
   */
  it('does not lock while consuming the sentinel on teardown', () => {
    let locks = 0;
    const teardown = installBanShield(() => (locks += 1));

    teardown();

    expect(locks).toBe(0);
    expect(currentEntryIsSentinel()).toBe(false);
  });

  /**
   * D-17's other half: entering bans is a deliberate act, so a browser gesture must never
   * put an unlocked player's selection back on a shared screen. After Back the surface is
   * gone and its listener with it, so Forward re-enters the sentinel entry and nothing
   * hears it.
   */
  it('leaves Forward with nothing listening, so a gesture cannot re-enter entry', () => {
    let locks = 0;
    const teardown = installBanShield(() => (locks += 1));

    window.history.back();
    expect(locks).toBe(1);

    // The screen unmounts the surface on that lock, and the unmount is what tears this down.
    teardown();

    window.history.forward();

    expect(locks).toBe(1);
    expect(currentEntryIsSentinel()).toBe(true);
  });

  /**
   * EIGHT PLAYERS, EIGHT MOUNTS, ZERO ENTRIES LEFT BEHIND.
   *
   * An orphan per mount would mean the host pressing Back nine times to leave the app.
   *
   * The baseline is taken AFTER one throwaway cycle, because a `pushState` truncates
   * whatever a previous case left ahead of the current entry and `history.length` would
   * otherwise be measured against a stale forward stack. Without the consume the count
   * climbs by one per cycle, which is the failure this asserts against.
   */
  it('does not accumulate history entries across repeated mounts', () => {
    installBanShield(() => undefined)();
    const before = window.history.length;

    for (let mount = 0; mount < 8; mount += 1) {
      installBanShield(() => undefined)();
    }

    expect(window.history.length).toBe(before);
    expect(currentEntryIsSentinel()).toBe(false);
  });

  /**
   * The one way an orphan can appear, closed.
   *
   * Back then Forward leaves the sentinel current with no surface mounted. Entering the next
   * player then ADOPTS that entry instead of stacking a second on top of it, which is why
   * install's condition is the mirror of teardown's rather than an unconditional push.
   */
  it('adopts a sentinel that is already current rather than stacking a second', () => {
    const first = installBanShield(() => undefined);
    window.history.back();
    first();
    window.history.forward();

    expect(currentEntryIsSentinel()).toBe(true);
    const before = window.history.length;

    const teardown = installBanShield(() => undefined);

    expect(window.history.length).toBe(before);

    teardown();

    expect(currentEntryIsSentinel()).toBe(false);
  });
});
