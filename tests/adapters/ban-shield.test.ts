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
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

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

afterEach(() => {
  // A `configurable: true` redefinition survives the test that made it, and a document
  // left `hidden` would make the next case's `visible` assertion pass for the wrong reason.
  Object.defineProperty(document, 'visibilityState', {
    value: 'visible',
    configurable: true,
  });
  vi.unstubAllGlobals();
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

  it('removes all three listeners on teardown', () => {
    let locks = 0;
    const teardown = installBanShield(() => (locks += 1));

    teardown();

    window.dispatchEvent(persistedPageShow());
    window.dispatchEvent(new Event('pagehide'));
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
