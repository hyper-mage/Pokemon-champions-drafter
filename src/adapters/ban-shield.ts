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
 * ### The traversal is QUEUED, so that invariant is about intent rather than `history.state`
 *
 * `pushState` fires no event and takes effect immediately. `history.back()` does neither:
 * per the HTML history-traversal algorithm the navigation and its `popstate` run in a task
 * queued after the call returns. So between a teardown and the traversal it asked for there
 * is a window in which `window.history.state` still reports the sentinel that is about to be
 * spent — and a host entering six players in a row walks straight through it:
 *
 *   Player A locks in, teardown calls `back()`, the host taps `Enter B's bans` before the
 *   task runs, install reads the still-current sentinel and ADOPTS it, and then A's
 *   traversal finally lands and fires `popstate` into B's listener. B's half-entered
 *   allotment is discarded and nobody pressed anything.
 *
 * That was WR-02. `consumeInFlight` below closes it rather than narrowing it: teardown
 * records that it has asked for a traversal BEFORE it asks, and an installation that adopts
 * a sentinel while a request is outstanding owes exactly one `popstate` to that request and
 * swallows it — re-pushing a sentinel of its own, so the player it is guarding still has
 * somewhere for their own Back to land. Nothing here reads a clock, a duration or an
 * elapsed ordering, so it holds whether the browser resolves the traversal in a millisecond
 * or a second, and it cannot be defeated by moving the two host actions closer together.
 *
 * The mirror matters as much: an installation that PUSHED its own sentinel owes nothing, so
 * the flag cannot leak into a later, unrelated entry and eat that player's real Back. That
 * failure is WR-02 with the sign flipped, and it is what a plain "ignore one `popstate`
 * after any teardown" flag would have shipped.
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

/**
 * Has a teardown asked the browser for a traversal that has not been accounted for yet?
 *
 * MODULE-LEVEL, and it has to be: the whole point is that it outlives the installation that
 * set it, so the NEXT one can tell an orphaned sentinel it may adopt (Back then Forward,
 * nothing outstanding) from one that is already on its way to being spent. A field on the
 * closure would be a field the next install cannot see, which is the bug.
 *
 * A boolean rather than a count, because at most one request can ever be outstanding. One
 * entry surface is mounted at a time, so an installation gets exactly one teardown; that
 * teardown either issues the only request, or adopts one already outstanding and declines to
 * issue a second — spending one sentinel twice would traverse PAST the entry surface's own
 * entry and out of the application.
 *
 * It is cleared by the installation that takes responsibility for it, never on a timer.
 */
let consumeInFlight = false;

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

  /*
    Does this installation owe one `popstate` to a traversal a PREVIOUS teardown asked for?

    Per-installation, in the closure, because it is a debt this installation took on and no
    other one can pay it. Set below, spent at most once, and handed back on teardown if the
    traversal has still not landed by the time this surface goes.
  */
  let swallowStale = false;

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
    /*
      ONE exception, and it is not a heuristic about timing. `swallowStale` is set at install
      only when this installation adopted a sentinel that a previous teardown had already
      asked the browser to spend, so this `popstate` is that request landing rather than
      anything the host did. Locking here would discard a player who has touched nothing.

      The re-push is what keeps the exception honest: consuming the request leaves this
      installation with no entry of its own, and an entry surface with no entry below it is
      the 04-11 defect — Back leaves the application — handed to every player after the first.

      Otherwise unconditional, and there is nothing else to discriminate on: this adapter
      pushes the only history entry the application has, so every other traversal reachable
      while the entry surface is up is the host leaving it. D-17's rule is that a browser
      navigation gesture away from the entry surface discards, whichever direction it went.
    */
    if (swallowStale) {
      swallowStale = false;
      pushSentinel();
      return;
    }

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

    A named function rather than a statement, because there are now two callers: here, and
    the `popstate` handler above re-establishing an entry after it swallows a stale traversal.
  */
  function pushSentinel(): void {
    try {
      window.history.pushState(ENTRY_HISTORY_STATE, '');
    } catch {
      // Deliberately silent — see above. There is no user-facing consequence to report.
    }
  }

  /*
    ADOPT, OR PUSH — and the answer decides whether this installation owes a swallow.

    `isEntrySentinel` alone was the shipped condition and it cannot tell the two adoptions
    apart. An ORPHAN — Back then Forward left a sentinel current with no surface mounted — is
    genuinely this installation's to reuse. A sentinel a previous teardown has already asked
    the browser to spend is NOT: it is about to be popped, and the `popstate` that pops it is
    owed to that request rather than to whoever is sitting at the screen now.

    `consumeInFlight` is what tells them apart, and it is cleared here in both branches
    because responsibility for the outstanding request moves onto this installation — as a
    swallow it owes, or as nothing at all when the traversal has evidently already landed.
  */
  if (isEntrySentinel(window.history.state)) {
    swallowStale = consumeInFlight;
  } else {
    pushSentinel();
  }

  consumeInFlight = false;

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

    /*
      An unpaid debt goes back on the shelf rather than being written off. The traversal this
      installation adopted is still outstanding and will spend the sentinel on its own; asking
      for a second one would spend an entry that no longer exists and take the room out of the
      application. Whoever installs next inherits the swallow, exactly as this one did.
    */
    if (swallowStale) {
      consumeInFlight = true;
      return;
    }

    // Still the sentinel means this surface was left some way OTHER than Back, so the entry
    // it pushed is still on the stack and is this teardown's to spend. After a Back it is
    // already gone and this correctly does nothing.
    //
    // The flag is raised BEFORE the call and never after: the whole hazard lives between the
    // two, and a version ordered the other way would be the bug with a comment on it.
    if (isEntrySentinel(window.history.state)) {
      consumeInFlight = true;
      window.history.back();
    }
  };
}
