/**
 * draw.ts — DRFT-02 / BAN-08. The pool draw, in two stages, always terminating.
 *
 * ## Why not reject-and-redraw
 *
 * The obvious implementation draws `size` entries uniformly, counts the Mega-capable ones,
 * and redraws if there are too few. At eight players requiring four Megas each on an Exact
 * pool, the probability that a uniform 48-entry draw satisfies the constraint is
 * 1.56 x 10^-8 — about sixty-four million expected redraws. That configuration passes every
 * feasibility blocker, so it is reachable by an ordinary host: Start enables, the host
 * clicks it, and the tab freezes. That is a correctness bug wearing a performance disguise.
 *
 * The two-stage partition draw below is O(L), spends exactly `size` generator draws, needs
 * no loop bound, and is feasible in precisely the cases the RULE-07 gate already accepts —
 * stage 2 needs `megasRequired <= megaCapableLegal`, stage 3 needs `size <= legal`, and
 * there is no third condition.
 *
 * ## The caveat, accepted rather than fixed
 *
 * D-07 asks for a "seeded uniform random draw". This draw IS uniform when `megasRequired`
 * is 0 — the default and the overwhelmingly common case, because stage 2 selects nothing
 * and stage 3 is a plain uniform subset draw. When `megasRequired` is greater the draw is
 * not uniform over the constraint-satisfying set: a Mega-heavy pool has more distinct
 * (stage 2, stage 3) paths that produce it, so it is over-weighted. Do not attempt to fix
 * this. Uniformity over the constrained set requires the rejection sampling the paragraph
 * above rules out, and the trade — a slightly biased pool the group can re-roll, versus a
 * frozen browser — is not close.
 *
 * ## On the cursor
 *
 * `drawPool` returns the advanced cursor so a caller that draws twice cannot silently reuse
 * one stretch of the stream. Phase 2's two config-time derivations — the pool draw and the
 * starting order — use two INDEPENDENT seeds rather than one advancing cursor, so this
 * field is provenance rather than a sharing mechanism. `src/store.ts:162-166` predicted this
 * collision one phase early and is worth reading before changing it.
 *
 * Pure, like everything under `src/core`. The only randomness is `nextInt`, which is a pure
 * hash of `(seed, cursor)`.
 */

import { nextInt } from './rng';
import type { RosterEntry } from './roster/types';

export interface DrawInput {
  /** Roster entries in DISPLAY order, bans already removed by the caller. */
  candidates: readonly RosterEntry[];
  size: number;
  /** `players × megasRequiredPerTeam`. 0 means unconstrained. */
  megasRequired: number;
  seed: number;
  /** Where in the seed's stream to start. 0 for a fresh roll. */
  cursor?: number;
}

export interface DrawResult {
  /** Selected ids, in the candidates' display order. */
  ids: string[];
  /**
   * Mega-capable entries actually drawn — counted from the chosen set, not echoed from
   * `megasRequired`. It is normally larger, because stage 3 draws from a set that still
   * holds unused Mega-capable entries. This is D-09's recorded figure: Phase 3's RULE-09
   * gate reads it rather than recomputing against a roster that may since have rotated.
   */
  megaCapableCount: number;
  /** The advanced cursor, so a caller that draws twice cannot reuse the stream. */
  cursor: number;
}

/**
 * Select `count` entries from `pool` uniformly, in place, with a partial Fisher-Yates.
 *
 * `pool` is a working copy the caller owns and this function reorders it. The `undefined`
 * guards on both indexed reads are required rather than defensive: `noUncheckedIndexedAccess`
 * is on, so every indexed read is `T | undefined` at the type level.
 *
 * A `count` larger than `pool.length` reaches `nextInt` with an empty range and the
 * `RangeError` surfaces. That is deliberate and inherited: a caller asking for more entries
 * than exist has a bug, and clamping would hand back a pool quietly smaller than the one
 * the host configured.
 */
function selectInPlace(
  pool: RosterEntry[],
  count: number,
  seed: number,
  cursor: number,
): { taken: RosterEntry[]; cursor: number } {
  const taken: RosterEntry[] = [];
  let next = cursor;

  for (let index = 0; index < count; index++) {
    const remaining = pool.length - index;
    const draw = nextInt(seed, next, remaining);
    next = draw.cursor;

    const chosenIndex = index + draw.value;
    const chosen = pool[chosenIndex];
    const displaced = pool[index];
    if (chosen === undefined || displaced === undefined) continue;

    pool[chosenIndex] = displaced;
    pool[index] = chosen;
    taken.push(chosen);
  }

  return { taken, cursor: next };
}

export function drawPool(input: DrawInput): DrawResult {
  const { candidates, size, megasRequired, seed } = input;
  let cursor = input.cursor ?? 0;

  // Stage 1 — partition, preserving the input's display order inside each part.
  const megaCapable = candidates.filter((entry) => entry.megaCapable);
  const rest = candidates.filter((entry) => !entry.megaCapable);

  // Stage 2 — the Mega quota, from a copy so the caller's ordering is untouched. Skipped
  // entirely when `megasRequired` is 0, which makes the default path a plain uniform draw.
  const quota = selectInPlace([...megaCapable], megasRequired, seed, cursor);
  cursor = quota.cursor;

  // Stage 3 — the remainder, from everything stage 2 did not take.
  const chosen = new Set(quota.taken.map((entry) => entry.id));
  const remainder = [...megaCapable.filter((entry) => !chosen.has(entry.id)), ...rest];
  const fill = selectInPlace(remainder, size - megasRequired, seed, cursor);
  cursor = fill.cursor;

  for (const entry of fill.taken) chosen.add(entry.id);

  // Emit in the CANDIDATES' order, never the shuffle's. Returning the shuffle's prefix
  // compiles, passes a length assertion, and produces a pool grid in random order with
  // Rotom's five appliances scattered through it — see `selectors.ts:36-39`, which records
  // that the pool ids are built in display order so the grid does not move under the
  // host's cursor on every pick.
  const ids = candidates.filter((entry) => chosen.has(entry.id)).map((entry) => entry.id);

  const megaCapableCount = candidates.filter(
    (entry) => entry.megaCapable && chosen.has(entry.id),
  ).length;

  return { ids, megaCapableCount, cursor };
}
