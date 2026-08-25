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
 * ## `pagehide` is here on purpose, beyond the two events D-17 and D-18 name
 *
 * It is the event that fires on the way *into* the back/forward cache, so locking there
 * means the restored page has already been made safe before `pageshow` runs. That closes
 * the window where a slow restore paints the entry surface for a frame. The only cost is an
 * extra lock on a departure that was leaving anyway, and the locked state is a destination
 * rather than an error (`04-UI-SPEC` §"How the shield and D-05 fit together"), so arriving
 * there once more costs the host nothing.
 */
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
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    window.removeEventListener('pageshow', onPageShow);
    window.removeEventListener('pagehide', onPageHide);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
