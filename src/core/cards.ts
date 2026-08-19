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

/**
 * What the player on the clock may put down — CARD-04, D-21.
 *
 * ## The rule, and the qualifier that is load-bearing
 *
 * CARD-04 reads *"when players are fewer than or equal to rounds, a value already played
 * this round cannot be played again"*. The qualifier is not a footnote. With
 * `players > rounds` there are fewer distinct values than players, so by pigeonhole a
 * repeat is unavoidable, and a build that ran the check anyway would mark every card
 * unplayable and hand the room a screen with nothing on it. The rule SUSPENDS itself
 * there and CARD-05's tiebreak carries the round instead. That is the only place the two
 * card requirements interact, and it is the easiest thing in this file to delete by
 * accident.
 *
 * ## The deadlock this exists to make unreachable, worked through
 *
 * 03-CONTEXT found it during discussion and required it be a test rather than a comment;
 * `tests/core/cards.test.ts` carries it, and this is why the check runs PER CANDIDATE AT
 * EVERY PLAY rather than once at the top of a round:
 *
 *   3 players, 3 rounds. Round 1: `P1 -> 1`, `P2 -> 2`, `P3 -> 3`. Round 2 hands are
 *   therefore `P1{2,3}`, `P2{1,3}`, `P3{1,2}`. `P1` plays `2`, so `U = {2}` — still fine,
 *   because `P3` can take `1` and `P2` can take `3`. `P2` then wants `1`, which would make
 *   `U = {1,2}` — and `P3`'s entire hand `{1,2}` minus `U` is EMPTY. `P3` is holding two
 *   cards with nothing legal to do with either, and the round cannot finish.
 *
 * Nothing about `P1 -> 2` was illegal, so a check that ran once at round start would have
 * passed it. The state only becomes unreachable if every candidate is tested against the
 * hands that would remain, every time.
 *
 * D-21's answer is the phase's answer to everything: CONSTRAIN THE OFFER so the invalid
 * state cannot be entered, rather than validate and reject after the fact. The card face
 * for a refused value renders inert with a reason; `canApply`'s `cardNotPlayable` arm is
 * the backstop behind that, not the mechanism.
 *
 * ## The theorem being transcribed
 *
 * A value `v` is playable iff, after adding `v` to the round's used set `U`, the players
 * still to play admit a system of distinct representatives from their hands minus `U`.
 * Hall's marriage theorem says such a system exists iff, for every non-empty subset `S` of
 * those players,
 *
 *   |⋃_{q∈S} (H_q \ U)| >= |S|
 *
 * which is what `admitsDistinctRepresentatives` below enumerates, directly and with no
 * bookkeeping in between.
 *
 * ## The bound, stated because it looks alarming and is not
 *
 * At most `2^7 = 128` subset unions of at most 6 elements per candidate, and at most
 * `rounds` candidates per play — a few thousand operations, once per render, beside a
 * 235-cell pool grid that the same screen already re-renders on every keystroke
 * (02-RESEARCH §Rendering ~235 Pool Cells). `tests/core/cards.test.ts` pins it with a
 * sub-10ms assertion at the largest shape that actually runs the matching.
 *
 * Kuhn's augmenting-path matching is the alternative if the subset enumeration ever
 * bothers anyone. Both are HAND-WRITTEN: a matching library would be a third runtime
 * dependency and a constraint violation (CLAUDE.md §Dependencies), and Hall's is preferred
 * here because it is the theorem itself rather than an algorithm that implements it — and
 * because the failing subset is available for free if a diagnostic is ever wanted.
 *
 * Pure and allocation-bounded, like the rest of this module: no randomness, no ambient
 * read, and nothing imported but a type.
 */
export interface CardOffer {
  /** The values that may be played now, ascending, a subset of the hand handed in. */
  values: number[];
  /**
   * True only for the DEADLOCK ESCAPE — the constraint was lifted for this one play
   * because nothing was legal. False when the rule was suspended by pigeonhole, which is
   * a different state that puts no line on screen. The panel needs the two told apart.
   */
  lifted: boolean;
}

/**
 * The offer, with the reason it might be wider than the rule alone would make it.
 *
 * `remainingHands` is every still-to-play player's hand, in play order, EXCLUDING the
 * player on the clock. `used` is the values already down this round. `players` is the size
 * of the rotation, and `rounds` is `config.rounds` — the deal, and therefore the number of
 * distinct values in play.
 */
export function cardOffer(
  hand: readonly number[],
  remainingHands: readonly (readonly number[])[],
  used: ReadonlySet<number>,
  players: number,
  rounds: number,
): CardOffer {
  // Nothing to offer and nothing to explain. Stated before the guards below so that an
  // empty hand is never mistaken for a deadlock the escape has to talk its way out of.
  if (hand.length === 0) return { values: [], lifted: false };

  // GUARD 1 — the pigeonhole suspension. CARD-04 does not apply here at all, so this is
  // not a relaxation of the rule; it is the rule's own scope.
  if (players > rounds) return { values: [...hand], lifted: false };

  const playable = hand.filter((value) => {
    if (used.has(value)) return false;

    const after = new Set(used);
    after.add(value);
    return admitsDistinctRepresentatives(remainingHands, after);
  });

  // GUARD 2 — the deadlock escape (T-03-33). Reachable only from an imported or
  // hand-edited log, which `fold` reproduces faithfully because it runs no `canApply`.
  // A screen with zero legal actions is worse than a stated exception, so the constraint
  // is lifted for exactly this one play and `CardPanel` says why.
  if (playable.length === 0) return { values: [...hand], lifted: true };

  return { values: playable, lifted: false };
}

/**
 * Which of `hand` may be played now without stranding a later player.
 *
 * The narrow shape of {@link cardOffer}, for the callers that only need the list —
 * `canApply`'s backstop among them. One implementation, two shapes, so the reducer and
 * the panel cannot come to different conclusions about one value.
 */
export function playableValues(
  hand: readonly number[],
  remainingHands: readonly (readonly number[])[],
  used: ReadonlySet<number>,
  players: number,
  rounds: number,
): number[] {
  return cardOffer(hand, remainingHands, used, players, rounds).values;
}

/**
 * Hall's condition over `hands`, with `used` already removed — the theorem, enumerated.
 *
 * Every set built here is computation-local and never returned or stored (CLAUDE.md
 * §Serializability). The hands are filtered once, outside the subset loop, because the
 * same `H_q \ U` is otherwise recomputed up to 64 times per hand.
 */
function admitsDistinctRepresentatives(
  hands: readonly (readonly number[])[],
  used: ReadonlySet<number>,
): boolean {
  const count = hands.length;
  // Vacuously true: the player on the clock is last, so there is nobody left to strand.
  if (count === 0) return true;

  const free = hands.map((hand) => hand.filter((value) => !used.has(value)));

  // Every non-empty subset, as a bitmask. `count` is bounded by `players - 1`, and the
  // import guard caps players, so this is at most 127 iterations.
  const subsets = 1 << count;
  for (let mask = 1; mask < subsets; mask++) {
    const union = new Set<number>();
    let size = 0;

    for (let index = 0; index < count; index++) {
      if ((mask & (1 << index)) === 0) continue;
      size++;
      for (const value of free[index] ?? []) union.add(value);
    }

    if (union.size < size) return false;
  }

  return true;
}
