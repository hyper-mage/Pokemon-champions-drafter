/**
 * clock.ts — one of exactly two files allowed to read the wall clock.
 *
 * It exists so that `src/core` never has to. Every timestamp in the tournament
 * document is stamped here, at dispatch time, and written into the action before the
 * reducer sees it (ARCHITECTURE Pattern 2). A reducer that read the clock itself would
 * produce a different state on every replay, which would quietly destroy undo, JSON
 * export, and any future sync — and `npm run check:pure` fails the build on the token
 * below appearing anywhere under `src/core`.
 */

/** Epoch milliseconds. Always an integer, so it survives JSON unchanged. */
export function now(): number {
  return Date.now();
}
