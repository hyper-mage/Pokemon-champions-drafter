/**
 * SHEL-03 / ROST-02 — offline by construction.
 *
 * Hand-written on purpose. CLAUDE.md rejects `vite-plugin-pwa`: Workbox plus its
 * config surface is far more machinery than three listeners, and the runtime
 * dependency count is capped at two regardless.
 *
 * D-14  Cache-first, not HTTP-cache-only. HTTP-cache eviction is at the browser's
 *       discretion, which satisfies SHEL-03 in practice but not by construction.
 * D-16  Precache the ENTIRE inventory on install — shell, both roster snapshots,
 *       and all ~312 sprites — before this worker activates. Offline is total from
 *       the second visit onward. Cost: ~1 MB and ~320 requests on the first visit.
 *       A single failed request fails the whole install and the visitor simply
 *       gets no worker until next time (T-01-48, accepted). That is preferred over
 *       an inventory the worker wrongly believes is complete.
 * D-15  Versioned cache, activate on next load. The two lifecycle overrides that
 *       force a waiting worker active and seize already-open clients are
 *       deliberately absent, so a host mid-draft is never disrupted. One stale
 *       session after a deploy is the accepted price. `npm run build`'s verify
 *       greps this file for both of them; do not reintroduce either.
 *
 * Both tokens below are substituted by `scripts/build-sw-manifest.mjs` after
 * `vite build`. They are left raw in the source so an un-injected worker throws a
 * ReferenceError on first evaluation rather than half-working.
 */

const VERSION = '__SW_VERSION__';
const CACHE_PREFIX = 'champions-drafter-';
const CACHE_NAME = CACHE_PREFIX + VERSION;
const PRECACHE = __PRECACHE_MANIFEST__;

self.addEventListener('install', (event) => {
  // This worker installs in the background and then waits; it never forces
  // itself active (D-15).
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  // Runs only once every client of the previous worker has gone, so deleting the
  // old cache here cannot pull assets out from under a draft in progress.
  // Scoped to our own prefix: never touch a cache this app did not create.
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        ),
      ),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Non-GET and cross-origin never touch the cache. Returning without calling
  // respondWith leaves the browser's own handling completely untouched.
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  // REFR-01. An explicit refresh is the one request that must never be answered from
  // the precache: the precache holds, by construction, exactly the roster the app is
  // already running, so a refresh served from it reports "already current" forever.
  // Returning without calling respondWith leaves the request entirely to the browser.
  // Offline it fails, which is correct — that is what REFR-02's file import exists
  // for, and the failure copy names it.
  //
  // Third on purpose. Sitting below both guards above, this bypass is reachable only
  // by a same-origin GET — the narrowest set of requests that still contains the
  // refresh. Hoisted above them it would hand the same early return to non-GET and
  // cross-origin traffic on the strength of a query string alone.
  //
  // A query marker rather than `request.cache === 'reload'`: a hard reload gives every
  // SUBRESOURCE cache mode 'reload', so that test would take the whole page off the
  // precache and break an offline hard reload. No other URL in this build carries a
  // query string.
  if (new URL(request.url).searchParams.has('refresh')) return;

  event.respondWith(
    caches
      .open(CACHE_NAME)
      // Matching our own cache by name rather than `caches.match` keeps a waiting
      // worker's freshly-populated cache from ever answering for the running one.
      // ignoreSearch so `?foo` on a navigation still resolves to the shell; no
      // asset in this build is distinguished by its query string.
      .then((cache) => cache.match(request, { ignoreSearch: true }))
      // No runtime cache population. The precache is the whole inventory, so a
      // miss is a manifest bug worth seeing rather than something to paper over.
      .then((hit) => hit || fetch(request)),
  );
});
