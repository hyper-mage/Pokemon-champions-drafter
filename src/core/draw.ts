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
 * ## The quota is drawn from ELIGIBLE species, not from Mega-capable ones
 *
 * Stage 1 partitions on membership in `megaEligibleIds`, and that predicate is load-bearing
 * rather than incidental — 03-RESEARCH files it as Pitfall 7. Partitioning on
 * the `megaCapable` FLAG lets the quota be filled entirely with species whose every Mega forme
 * is banned (D-09) or excluded by the host's X/Y pin (D-10). The resulting pool passes every
 * feasibility check, records a healthy `megaCapableCount`, and then opens a Mega round with
 * nothing in it — and the rules compiler deliberately removed the runtime validator that
 * would have caught that, so nothing downstream is watching. Do not simplify the predicate
 * back to the flag.
 *
 * The RULE-09 gate measures the same eligibility over the CANDIDATE set, and stage 2 here
 * carries the count into the pool by construction. Between them there is no configuration
 * this build accepts that can starve a Mega round.
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
  /**
   * Ids among `candidates` that still have a legal Mega forme — D-09/D-10.
   *
   * The quota is drawn from THESE, never from the `megaCapable` FLAG, or a Mega round can
   * starve. Required rather than optional for the same reason `candidates` is: a default
   * would let a caller omit the one argument that makes the guarantee true and get the old
   * behaviour back with nothing to read in the diff.
   */
  megaEligibleIds: readonly string[];
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
   * holds unused Mega-capable entries.
   *
   * This counts the `megaCapable` FLAG and is the figure `pool/built` records. Nothing reads
   * it as the RULE-09 gate's input any more: D-11 calls it the pre-ban upper bound and the
   * post-rotation cross-check, because it was measured before Mega-forme bans existed and a
   * document that recorded only it could not be re-judged against a rotated roster.
   */
  megaCapableCount: number;
  /**
   * Drawn ids that are in `megaEligibleIds` — the count that actually answers "can the Mega
   * rounds be filled from this pool". At least `megasRequired` by construction of stage 2.
   */
  megaEligibleCount: number;
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
  //
  // On ELIGIBILITY, never on the `megaCapable` FLAG — see the doc block's Pitfall 7 paragraph.
  // The `Set` is computation-local and never returned or stored (CLAUDE.md §Serializability).
  const eligible = new Set(input.megaEligibleIds);
  const megaEligible = candidates.filter((entry) => eligible.has(entry.id));
  const rest = candidates.filter((entry) => !eligible.has(entry.id));

  // Stage 2 — the Mega quota, from a copy so the caller's ordering is untouched. Skipped
  // entirely when `megasRequired` is 0, which makes the default path a plain uniform draw.
  const quota = selectInPlace([...megaEligible], megasRequired, seed, cursor);
  cursor = quota.cursor;

  // Stage 3 — the remainder, from everything stage 2 did not take.
  const chosen = new Set(quota.taken.map((entry) => entry.id));
  const remainder = [...megaEligible.filter((entry) => !chosen.has(entry.id)), ...rest];
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

  const megaEligibleCount = ids.filter((id) => eligible.has(id)).length;

  return { ids, megaCapableCount, megaEligibleCount, cursor };
}
