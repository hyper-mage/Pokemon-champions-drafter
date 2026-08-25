/**
 * Lock the blind entry surface on any departure the room can see — BAN-06, D-17, D-18.
 *
 * Registered while the entry surface is mounted and torn down with it, so a restore that
 * lands on the locked screen has nothing left listening for it.
 *
 * ## Why this is not added to `installLifecycle`
 *
 * `tab-lock.ts` already owns a `pageshow` consumer, and putting a second concern in it was
 * considered and rejected (04-RESEARCH §"How a second `pageshow` consumer coexists"). That
 * function is a module-level singleton owned by the lock and torn down through one
 * module-level variable, so a ban-stage listener inside it would tie the ban stage's
 * lifetime to the lock's. Two independent consumers coexist trivially — `addEventListener`
 * is additive and neither handler calls `stopPropagation` — and this one's listener must be
 * scoped to the entry surface's own lifetime, because a permanently registered listener is
 * one that will eventually fire against a stale closure.
 *
 * ## `onLock` is the purity seam AND the test seam
 *
 * A plain callback, so the adapter owns the ambient events and the UI owns the transition.
 * `src/core/` never learns that a browser has a back/forward cache, and a test can drive
 * the transition without a browser.
 *
 * **It must be a stable identity** — a `useCallback` with no changing deps — or the effect
 * that installs this re-registers on every render of the surface it is guarding.
 *
 * ## The sentinel history entry, and why Back needed one at all
 *
 * D-17 names the browser Back button and says it lands on the locked state. Shipped, it
 * left the application: the host's 04-11 verification found the discard correct — `pagehide`
 * fires, nothing is retained — and the destination wrong. Nothing here was broken. The
 * application had never pushed a history entry, so the back/forward stack held exactly one,
 * its own document, and Back popped that. D-17 assumed somewhere to go back TO.
 *
 * So this adapter makes the entry surface its own history entry. **That is not routing and
 * must not become it.** `pushState` is called with no URL argument, so the address bar never
 * changes, nothing writes a URL and nothing reads one — the app stays the single document
 * with no URL state that eight prior plans are built on. One entry, one listener, alive only
 * while the entry surface is mounted.
 *
 * ### The invariant, in one sentence
 *
 * **While this is installed the current history entry is the sentinel; once torn down, it is
 * not.** Install pushes unless the sentinel is already current; teardown consumes it if it
 * still is. Those two conditions are each other's mirror rather than a flag passed between
 * them, which is what makes the pair correct on every exit without any of them being special
 * -cased:
 *
 * - **Back** — the traversal lands on the entry below, `popstate` locks, and by the time the
 *   unmount runs the sentinel is already gone, so teardown consumes nothing.
 * - **Lock in, `Hide these bans`, an alt-tab, a bfcache restore** — the sentinel is still
 *   current, so teardown consumes it and the entry count returns to where it started. Eight
 *   players leave zero entries behind; without this the host would press Back nine times to
 *   leave the app.
 * - **Forward after a Back** — the listener is gone with the surface, so nothing hears it and
 *   the host stays on the locked state. Entering bans is a deliberate act and a browser
 *   gesture must never put an unlocked player's selection back on a shared screen. The next
 *   entry then ADOPTS that orphaned sentinel rather than stacking a second on it.
 *
 * ### Teardown removes the listener BEFORE it consumes
 *
 * Consuming is itself a traversal. The other order would fire `popstate` into a live
 * listener and announce a discard on the way out of a surface that had already been left —
 * including on the lock-in path, where nothing was discarded at all.
 *
 * ## `pagehide` is here on purpose, beyond the two events D-17 and D-18 name
 *
 * It is the event that fires on the way *into* the back/forward cache, so locking there
 * means the restored page has already been made safe before `pageshow` runs. That closes
 * the window where a slow restore paints the entry surface for a frame. The only cost is an
 * extra lock on a departure that was leaving anyway, and the locked state is a destination
 * rather than an error (`04-UI-SPEC` §"How the shield and D-05 fit together"), so arriving
 * there once more costs the host nothing.
 */
/**
 * The state stamped on the entry surface's own history entry.
 *
 * A plain serializable object, because `history.state` is structured-cloned and survives a
 * reload — a host who reloads while entering bans comes back with the entry still marked,
 * and the next mount adopts it rather than stacking on it.
 */
const ENTRY_HISTORY_STATE = { blindBanEntry: true } as const;

/** Is `state` the marker this adapter stamps? Written as a guard, because `history.state` is
 * whatever the last writer put there and this module is not the only thing that could ever
 * write it. */
function isEntrySentinel(state: unknown): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    (state as { blindBanEntry?: unknown }).blindBanEntry === true
  );
}

export function installBanShield(onLock: () => void): () => void {
  // The same guard `installLifecycle` opens with. This adapter is only ever called from an
  // effect, so a server render has no route here today — the guard is what keeps that true
  // by construction rather than by knowing every caller.
  if (typeof window === 'undefined') return () => undefined;

  const onPageShow = (event: PageTransitionEvent): void => {
    // Restored from the back/forward cache — a browser Back followed by Forward puts the
    // entry surface back on screen with nobody having chosen to put it there (D-17). An
    // ordinary load is `persisted === false` and must fall through: this read is the whole
    // difference between the guard and a handler that locks on every page load.
    if (event.persisted) onLock();
  };
  const onVisibilityChange = (): void => {
    // The ordinary room mishap D-18 names: the host alt-tabs to Discord to read the next
    // player's bans and comes back to a screen that was left exposed.
    if (document.visibilityState === 'hidden') onLock();
  };
  const onPageHide = (): void => onLock();
  const onPopState = (): void => {
    // Unconditional, and there is nothing to discriminate on anyway: this adapter pushes the
    // only history entry the application has, so the only traversal reachable while the entry
    // surface is up is the host leaving it. D-17's rule is that a browser navigation gesture
    // away from the entry surface discards, whichever direction it went.
    onLock();
  };

  /*
    PUSHED BEFORE ANY LISTENER IS REGISTERED, and adopted rather than stacked.

    `pushState` fires no event, so the order is not load-bearing for correctness today — it is
    written this way so it cannot become load-bearing later.

    The `try` is not decoration. `pushState` is rate-limited by browsers (Firefox throws past
    its per-interval budget) and can be refused outright in a sandboxed frame. A throw here
    would escape the effect that calls this and take the entry surface down with it, so the
    failure is swallowed on purpose: with no sentinel pushed, Back leaves the document exactly
    as it did before this existed, `pagehide` still fires, and the entry is still discarded.
    The degradation is the previously shipped behaviour rather than a broken screen.
  */
  if (!isEntrySentinel(window.history.state)) {
    try {
      window.history.pushState(ENTRY_HISTORY_STATE, '');
    } catch {
      // Deliberately silent — see above. There is no user-facing consequence to report.
    }
  }

  /*
    THE `window` / `document` ASYMMETRY IS COPIED, NOT NORMALISED.

    `pageshow` and `pagehide` are registered on `window`; `visibilitychange` on `document`.
    It reads like an inconsistency and is not — `visibilitychange` on `window` works in some
    browsers and not others, and this is the exact pairing `persistence.ts:438-451` ships and
    that `tab-lock.ts` uses for its own two. Making the three agree would be a silent
    no-op for D-18 in whichever browsers do not forward it.
  */
  window.addEventListener('pageshow', onPageShow);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('popstate', onPopState);
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    // EVERY listener goes first, and `popstate` above all: the consume below is a traversal.
    window.removeEventListener('pageshow', onPageShow);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('popstate', onPopState);
    document.removeEventListener('visibilitychange', onVisibilityChange);

    // Still the sentinel means this surface was left some way OTHER than Back, so the entry
    // it pushed is still on the stack and is this teardown's to spend. After a Back it is
    // already gone and this correctly does nothing.
    if (isEntrySentinel(window.history.state)) window.history.back();
  };
}
