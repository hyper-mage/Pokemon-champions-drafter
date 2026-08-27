/**
 * staleness.ts — REFR-03. Has the snapshot we are about to draft on expired?
 *
 * One line of code and four paragraphs of reasoning, in that ratio on purpose: every
 * wrong version of this function also fits on one line, and three of them look better
 * than the right one.
 *
 * ## Both arguments are `YYYY-MM-DD`, and they are compared as STRINGS
 *
 * Deliberately. The obvious implementation converts both sides to a date object and
 * compares those, and it is wrong: a date-ONLY string is specified to parse as UTC
 * midnight, while a date read from the wall clock is local. For every host west of UTC,
 * every evening, those two disagree by a day — so a snapshot would read as expired the
 * night before it actually is, or current the night after. A zero-padded ISO date sorts
 * lexicographically exactly as it sorts chronologically, so the string compare is not a
 * shortcut around that bug; it is the absence of it.
 *
 * `src/adapters/file-io.ts` reached the same conclusion for the download filename before
 * this file existed. `todayIso()` in `src/adapters/clock.ts` is where the local reading
 * is produced, at the edge, and handed in here as an argument.
 *
 * ## The comparison is also the only implementation `check:pure` permits here
 *
 * The `Date` constructor is a forbidden token under `src/core`
 * (`scripts/check-pure-core.mjs:62`). So the date-object version of this function would
 * not merely be wrong — it would fail the build. That is the gate working as intended:
 * core is not allowed to know what day it is, only to compare two days it was told.
 *
 * ## The interval is HALF-OPEN, and the manifest is the evidence
 *
 * `public/data/roster.index.json` gives M-A `validUntil 2026-06-17` and M-B
 * `validFrom 2026-06-17`. That is the SAME DAY, and it cannot be live for both
 * regulations. So `validUntil` is the first day a snapshot is stale, which makes the
 * comparison `>=` and not `>`. An off-by-one here is invisible for ten weeks at a time
 * and then wrong exactly on the day it matters most.
 */

/**
 * `true` once `todayIso` has reached `validUntil`. Both are `YYYY-MM-DD`.
 *
 * Needs no network and no clock: `validUntil` is already a field on the loaded
 * `RosterSnapshot` (`./types.ts`), and the date arrives from the adapter. A host with no
 * connection at all still gets a correct answer.
 */
export function isSnapshotStale(validUntil: string, todayIso: string): boolean {
  return todayIso >= validUntil;
}
