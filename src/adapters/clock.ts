/**
 * clock.ts — one of exactly two files allowed to read the wall clock.
 *
 * It exists so that `src/core` never has to. Every timestamp in the tournament
 * document is stamped here, at dispatch time, and written into the action before the
 * reducer sees it (ARCHITECTURE Pattern 2). A reducer that read the clock itself would
 * produce a different state on every replay, which would quietly destroy undo, JSON
 * export, and any future sync — and `npm run check:pure` fails the build on the token
 * below appearing anywhere under `src/core`.
 *
 * Two exports, and the list is short on purpose: `now()` for the epoch stamp every
 * action carries, and `todayIso()` for the one comparison that wants a calendar day
 * rather than an instant (REFR-03). Anything else that wants the time should take it as
 * an argument from a caller that got it here.
 */

/** Epoch milliseconds. Always an integer, so it survives JSON unchanged. */
export function now(): number {
  return Date.now();
}

/**
 * Today, LOCAL, as `YYYY-MM-DD`.
 *
 * Built from local date parts rather than the UTC ISO serializer, for the reason
 * `src/adapters/file-io.ts:70-82` already wrote down when it formatted the download
 * filename — a host drafting at 6pm in UTC-8 would otherwise be handed tomorrow's date.
 * That is a cosmetic wrong date on a filename; fed to `isSnapshotStale`
 * (`src/core/roster/staleness.ts`) it is a staleness banner firing a day early. One
 * formatting rule, two callers, so it is stated once there and pointed at here.
 *
 * Zero-padded to two characters, because the string compare downstream is only
 * chronological while every field is a fixed width.
 */
export function todayIso(): string {
  const at = new Date();
  const pad = (value: number): string => `${value}`.padStart(2, '0');

  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}
