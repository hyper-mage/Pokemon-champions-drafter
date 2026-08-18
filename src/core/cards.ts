/**
 * cards.ts — CARD-05. The round's pick order, from the cards the room watched go down.
 *
 * ## Low plays first, and why that is not arbitrary (D-23)
 *
 * `1` is the STRONGEST card, not the weakest. Every priority mechanic this audience has
 * met — initiative in a tabletop turn order, seeding in a bracket, a draft position — reads
 * a low number as an early slot, so an implementation that sorted descending would be
 * correct code that everyone at the table read backwards. The ordering below is ascending
 * for that reason and no other.
 *
 * ## The tiebreak, and what it costs each way (D-22)
 *
 * Two players can put the same value down, and the earlier play wins. That is not a coin
 * toss dressed up as a rule: the cards are played openly and in a rotating order, so the
 * room actually watched one land before the other, and the tiebreak is the thing they saw.
 *
 * It also counterweights the flow. Playing LATE buys information — you have seen every card
 * already on the table. Playing EARLY buys tiebreak priority. Neither position is free, and
 * the rotation (`selectCardPlayOrder`) moves who holds which one every round.
 *
 * ## Why player-entry order provably cannot leak in
 *
 * Two facts, both checkable, and together they are the whole of CARD-05's guarantee that
 * the resolved order never depends on who happened to be typed into the config first:
 *
 *   1. **The comparator is total — it never returns 0.** `seq` is unique across the whole
 *      log by construction: `store.ts` allocates `max(seq) + 1`, never `log.length`, so no
 *      two plays can share one. `(value, seq)` therefore separates every pair of plays, and
 *      **there is no third clause, because there is nowhere for one to be reached.** A
 *      fallback to player id, to config position, or to array index cannot be added here
 *      without first making the comparator non-total.
 *   2. **Sort stability is therefore irrelevant, and so is the input array's own order.**
 *      A comparator that returned 0 on equal values would silently defer to the array it
 *      was handed. That array comes from `state.cardsPlayed`, which is log order — which
 *      agrees with `seq` order for every document this build originates, but need NOT for
 *      an imported one, whose log a hand-edit can reorder. Comparing `seq` explicitly is
 *      what closes that gap, and `tests/core/cards.test.ts` shuffles the input and asserts
 *      an identical result rather than leaving it as this paragraph.
 *
 * Contrast `selectStartingOrder`, which has to sort ids before it shuffles to reach the
 * same property. Card resolution needs no such sort: `seq` is already total.
 *
 * ## There is no randomness here at all
 *
 * This module draws nothing, holds no seed, and advances no cursor. That absence is the
 * point rather than an omission: `actions.ts` and `store.ts` both used to reserve `doc.rng`
 * for "the priority-card tie-break", and D-22 settled that tie-break on play order instead,
 * so both comments were corrected in 03-02 and `rng.cursor` stays 0 for the life of every
 * document this phase writes.
 *
 * Pure, like everything under `src/core`.
 */

import type { CardPlay } from './model';

/**
 * The order the players pick in, resolved from one round's card plays.
 *
 * Ascending by `value`, then ascending by `seq`. Returns a fresh array of player ids and
 * leaves `plays` untouched — the sort runs on a copy, so a caller cannot have the state it
 * handed in reordered underneath it.
 *
 * Takes the plays rather than the state, following `drawPool` and `bannedEntries`: the
 * caller has already decided WHICH plays are in scope (one round's, via
 * `selectCardsPlayedThisRound`), and a function that re-derived that itself would be two
 * rules in one place.
 */
export function resolvePickOrder(plays: readonly CardPlay[]): string[] {
  return [...plays].sort(comparePlays).map((play) => play.playerId);
}

/**
 * Total on any two plays from one document. Hand-written for the reason `compareIds` is:
 * a locale-aware comparison would fold one tournament to two different screens.
 *
 * Do not add a third clause. If one ever looks necessary, `seq` has stopped being unique
 * and the bug is in whatever allocated it, not here.
 */
function comparePlays(left: CardPlay, right: CardPlay): number {
  if (left.value !== right.value) return left.value - right.value;
  return left.seq - right.seq;
}
