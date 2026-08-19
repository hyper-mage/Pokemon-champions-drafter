/**
 * Priority cards — the hands nothing stores, the rotation, and the tiebreak that needs no
 * tiebreak.
 *
 * Three properties are asserted here rather than asserted in a comment, because all three
 * are the kind that stay true by accident until the day they do not:
 *
 *   1. A hand is `1..config.rounds` minus what that player has played. There is no literal
 *      six anywhere, so a four-round tournament deals four cards without a second code path.
 *   2. `selectCardPlayOrder` reads `state.order` and the round number and nothing else, so
 *      no card outcome can move the rotation D-18 makes fair.
 *   3. `resolvePickOrder` is a TOTAL order on `(value, seq)`. `seq` is unique log-wide by
 *      construction, so the comparator never returns 0, so there is no third clause and no
 *      place for the input array's own order to leak in. The shuffle test below checks that
 *      directly instead of trusting sort stability.
 *
 * What this file cannot do yet: put a `cards/played` into a log. That action arrives with
 * the reducer arm in the next plan, so the fixtures below build the fold's `cardsPlayed`
 * array directly — allocating `seq` the way `store.ts` allocates it, one past the highest
 * the log has handed out. `tests/core/reduce.test.ts` asserts the same properties through a
 * real log once the action exists.
 *
 * Zero mocks, as everywhere in `src/core`.
 */

import { describe, expect, it } from 'vitest';

import {
  draftStarted,
  poolBuilt,
  scheduleCompiled,
  type Action,
  type Intent,
  type RoundSpec,
} from '../../src/core/actions';
import { cardOffer, playableValues, resolvePickOrder } from '../../src/core/cards';
import {
  SCHEMA_VERSION,
  type CardPlay,
  type DraftState,
  type ResolvedOrder,
  type TournamentConfig,
  type TournamentDoc,
} from '../../src/core/model';
import { fold } from '../../src/core/reduce';
import {
  selectCardOffer,
  selectCardPlayOrder,
  selectCardsPlayedThisRound,
  selectCurrentRound,
  selectHand,
  selectPlayableCards,
  selectResolvedOrder,
} from '../../src/core/selectors';

// ---------------------------------------------------------------------------
// Fixtures — S-9's document builder, at three players so the rotation has somewhere to go
// ---------------------------------------------------------------------------

const CREATED_AT = 1_700_000_000_000;
const SEED = 0x5f3a91c2;

const POOL = [
  'venusaur',
  'charizard',
  'blastoise',
  'garchomp',
  'rotomwash',
  'skarmory',
  'tyranitar',
  'gardevoir',
  'dragonite',
  'meganium',
  'starmie',
  'victreebel',
  'feraligatr',
  'kommoo',
  'skeledirge',
  'annihilape',
  'baxcalibur',
  'gholdengo',
  'ceruledge',
];

function configWith(rounds: number): TournamentConfig {
  return {
    formatLabel: 'Champions Test',
    players: [
      { id: 'p1', name: 'Ada' },
      { id: 'p2', name: 'Bo' },
      { id: 'p3', name: 'Cass' },
    ],
    rounds,
    rosterVersion: 'mb',
    rosterChecksum: 'abc123',
    poolSize: POOL.length,
    bans: [],
    banMode: 'hostBanlist',
    megasRequiredPerTeam: 0,
    dualMegaChoices: [],
    depth: 'draftOnly',
    rules: [{ kind: 'mega', count: 0 }],
    megaFormeBans: [],
    swapBudget: 0,
    swapRounds: 0,
  };
}

const CONFIG = configWith(6);
const CONFIG_FOUR = configWith(4);
/** Three players over three rounds — the shape 03-CONTEXT's deadlock is smallest in. */
const CONFIG_THREE = configWith(3);
/** Three players over two rounds — `players > rounds`, so CARD-04 suspends itself. */
const CONFIG_TWO = configWith(2);

/**
 * Deliberately NOT in id order.
 *
 * `draft/started` records the seeded shuffle, and a rotation that happened to read the
 * configured player list instead would pass every test written against a sorted order.
 */
const ORDER = ['p2', 'p3', 'p1'];

function stamp(intent: Intent, seq: number): Action {
  return { ...intent, seq, at: CREATED_AT + seq, actorId: 'host' };
}

function openSchedule(rounds: number): RoundSpec[] {
  return Array.from({ length: rounds }, (_, position) => ({
    index: position + 1,
    kind: 'open' as const,
  }));
}

function makeDoc(log: readonly Action[], config: TournamentConfig = CONFIG): TournamentDoc {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'tournament-fixture',
    createdAt: CREATED_AT,
    config,
    rng: { seed: SEED, cursor: 0 },
    log: [...log],
  };
}

/** `pool/built`, `schedule/compiled`, `draft/started` — what `createTournament` emits. */
function openingLog(config: TournamentConfig = CONFIG): Action[] {
  return [
    stamp(poolBuilt(POOL, config.rosterVersion, config.rosterChecksum, 7, 0), 0),
    stamp(scheduleCompiled(openSchedule(config.rounds)), 1),
    stamp(draftStarted(ORDER, 9), 2),
  ];
}

function startedDoc(config: TournamentConfig = CONFIG): TournamentDoc {
  return makeDoc(openingLog(config), config);
}

/** One card play per player, in the round's play order, seq allocated as the store would. */
function roundOfPlays(
  values: readonly number[],
  round: number,
  firstSeq: number,
  config: TournamentConfig = CONFIG,
): CardPlay[] {
  const order = selectCardPlayOrder(fold(startedDoc(config)), round);
  return order.map((playerId, index) => ({
    playerId,
    value: values[index] ?? 1,
    round,
    seq: firstSeq + index,
  }));
}

function stateWith(
  plays: readonly CardPlay[],
  resolvedOrders: readonly ResolvedOrder[] = [],
  config: TournamentConfig = CONFIG,
): DraftState {
  return {
    ...fold(startedDoc(config)),
    cardsPlayed: plays.map((play) => ({ ...play })),
    resolvedOrders: resolvedOrders.map((entry) => ({
      round: entry.round,
      order: [...entry.order],
    })),
  };
}

// ---------------------------------------------------------------------------
// selectHand — CARD-01, CARD-06, D-06
// ---------------------------------------------------------------------------

describe('selectHand', () => {
  it('deals one card per round to a player who has played nothing', () => {
    expect(selectHand(stateWith([]), 'p1')).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('deals four at four rounds, because the hand is config.rounds and never a literal six', () => {
    expect(selectHand(stateWith([], [], CONFIG_FOUR), 'p1')).toEqual([1, 2, 3, 4]);
  });

  it('subtracts a played value and leaves the rest in ascending order', () => {
    const state = stateWith([{ playerId: 'p1', value: 3, round: 1, seq: 3 }]);
    expect(selectHand(state, 'p1')).toEqual([1, 2, 4, 5, 6]);
  });

  it('subtracts every value that player has spent, across rounds', () => {
    const state = stateWith([
      { playerId: 'p1', value: 3, round: 1, seq: 3 },
      { playerId: 'p1', value: 6, round: 2, seq: 9 },
      { playerId: 'p1', value: 1, round: 3, seq: 14 },
    ]);
    expect(selectHand(state, 'p1')).toEqual([2, 4, 5]);
  });

  it('empties the hand once every card is spent', () => {
    const spent = [1, 2, 3, 4, 5, 6].map((value, index) => ({
      playerId: 'p1',
      value,
      round: index + 1,
      seq: 10 + index * 3,
    }));
    expect(selectHand(stateWith(spent), 'p1')).toEqual([]);
  });

  it('does not let one player spend another player’s card', () => {
    const state = stateWith([
      { playerId: 'p2', value: 3, round: 1, seq: 3 },
      { playerId: 'p3', value: 5, round: 1, seq: 4 },
    ]);
    expect(selectHand(state, 'p1')).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('gives a player the tournament has never heard of a full hand rather than throwing', () => {
    // Read while rendering. A selector that threw over a stale id would take the board down.
    expect(selectHand(stateWith([]), 'nobody')).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('returns a fresh array a caller cannot mutate state through', () => {
    const state = stateWith([]);
    const hand = selectHand(state, 'p1');
    hand.push(99);
    expect(selectHand(state, 'p1')).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

// ---------------------------------------------------------------------------
// selectCardPlayOrder — the rotation, D-18 / CARD-03
// ---------------------------------------------------------------------------

describe('selectCardPlayOrder', () => {
  const state = stateWith([]);

  it('is the recorded starting order in round 1', () => {
    expect(selectCardPlayOrder(state, 1)).toEqual(ORDER);
  });

  it('starts round 2 with the player who went second', () => {
    expect(selectCardPlayOrder(state, 2)).toEqual(['p3', 'p1', 'p2']);
  });

  it('wraps back to the first player after a full cycle', () => {
    // Three players, so round 4 is round 1 again. Playing last is an advantage (D-18);
    // rotating is what spreads it evenly.
    expect(selectCardPlayOrder(state, ORDER.length + 1)).toEqual(ORDER);
  });

  it('holds every player exactly once in every round', () => {
    for (let round = 1; round <= CONFIG.rounds; round++) {
      const played = selectCardPlayOrder(state, round);
      expect(played, `round ${round}`).toHaveLength(ORDER.length);
      expect(new Set(played).size, `round ${round}`).toBe(ORDER.length);
    }
  });

  it('is independent of every card outcome, so it cannot be manipulated', () => {
    const bidded = stateWith(roundOfPlays([1, 6, 3], 1, 3));
    for (let round = 1; round <= CONFIG.rounds; round++) {
      expect(selectCardPlayOrder(bidded, round), `round ${round}`).toEqual(
        selectCardPlayOrder(state, round),
      );
    }
  });

  it('is empty before the draft has started', () => {
    expect(selectCardPlayOrder(fold(makeDoc([])), 1)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// selectCurrentRound
// ---------------------------------------------------------------------------

describe('selectCurrentRound', () => {
  const base = stateWith([]);

  function picksAfter(count: number): DraftState {
    return {
      ...base,
      picks: Array.from({ length: count }, (_, index) => ({
        playerId: ORDER[index % ORDER.length] as string,
        monId: POOL[index] ?? `mon-${index}`,
        round: Math.floor(index / ORDER.length) + 1,
        pickIndex: index,
        seq: 100 + index,
      })),
    };
  }

  it('is 1 before the draft has started', () => {
    expect(selectCurrentRound(fold(makeDoc([])))).toBe(1);
  });

  it('is 1 before the first pick', () => {
    expect(selectCurrentRound(base)).toBe(1);
  });

  it('advances only when every player has picked', () => {
    expect(selectCurrentRound(picksAfter(1))).toBe(1);
    expect(selectCurrentRound(picksAfter(2))).toBe(1);
    expect(selectCurrentRound(picksAfter(3))).toBe(2);
    expect(selectCurrentRound(picksAfter(6))).toBe(3);
  });

  it('never reports a round past the tournament’s last', () => {
    expect(selectCurrentRound(picksAfter(ORDER.length * (CONFIG.rounds + 3)))).toBe(CONFIG.rounds);
  });
});

// ---------------------------------------------------------------------------
// selectCardsPlayedThisRound / selectResolvedOrder
// ---------------------------------------------------------------------------

describe('selectCardsPlayedThisRound', () => {
  it('returns this round’s plays in log order', () => {
    const state = stateWith([...roundOfPlays([1, 6, 3], 1, 3), ...roundOfPlays([2, 4, 5], 2, 7)]);

    expect(selectCardsPlayedThisRound(state, 2).map((play) => play.playerId)).toEqual([
      'p3',
      'p1',
      'p2',
    ]);
    expect(selectCardsPlayedThisRound(state, 2).map((play) => play.value)).toEqual([2, 4, 5]);
  });

  it('is empty for a round nobody has bid in', () => {
    expect(selectCardsPlayedThisRound(stateWith(roundOfPlays([1, 6, 3], 1, 3)), 4)).toEqual([]);
  });

  it('returns fresh records a caller cannot mutate state through', () => {
    const state = stateWith(roundOfPlays([1, 6, 3], 1, 3));
    const first = selectCardsPlayedThisRound(state, 1)[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    first.value = 99;

    expect(selectCardsPlayedThisRound(state, 1)[0]?.value).toBe(1);
  });
});

describe('selectResolvedOrder', () => {
  it('is null for a round that has not resolved', () => {
    expect(selectResolvedOrder(stateWith(roundOfPlays([1, 6, 3], 1, 3)), 1)).toBeNull();
  });

  it('returns the recorded order once it has', () => {
    const state = stateWith(roundOfPlays([1, 6, 3], 1, 3), [
      { round: 1, order: ['p2', 'p1', 'p3'] },
    ]);
    expect(selectResolvedOrder(state, 1)).toEqual(['p2', 'p1', 'p3']);
  });

  it('returns a fresh array a caller cannot mutate state through', () => {
    const state = stateWith([], [{ round: 1, order: ['p2', 'p1', 'p3'] }]);
    const order = selectResolvedOrder(state, 1);
    expect(order).not.toBeNull();
    order?.push('p9');

    expect(selectResolvedOrder(state, 1)).toEqual(['p2', 'p1', 'p3']);
  });
});

// ---------------------------------------------------------------------------
// resolvePickOrder — D-22, D-23, CARD-05
// ---------------------------------------------------------------------------

describe('resolvePickOrder', () => {
  it('puts the lowest card first, because 1 is the strongest card', () => {
    const plays: CardPlay[] = [
      { playerId: 'p2', value: 6, round: 1, seq: 3 },
      { playerId: 'p3', value: 1, round: 1, seq: 4 },
      { playerId: 'p1', value: 4, round: 1, seq: 5 },
    ];

    expect(resolvePickOrder(plays)).toEqual(['p3', 'p1', 'p2']);
  });

  it('breaks a tie for the player who put the card down first', () => {
    // The room watched them go down, so the earlier play wins. Playing late buys
    // information; playing early buys tiebreak priority.
    const plays: CardPlay[] = [
      { playerId: 'p2', value: 3, round: 1, seq: 3 },
      { playerId: 'p3', value: 3, round: 1, seq: 4 },
      { playerId: 'p1', value: 3, round: 1, seq: 5 },
    ];

    expect(resolvePickOrder(plays)).toEqual(['p2', 'p3', 'p1']);
  });

  it('breaks a tie on seq even when the array order disagrees with it', () => {
    // Exactly the file an importer can hand this build: log order and seq order differ.
    const plays: CardPlay[] = [
      { playerId: 'p1', value: 3, round: 1, seq: 9 },
      { playerId: 'p2', value: 3, round: 1, seq: 4 },
    ];

    expect(resolvePickOrder(plays)).toEqual(['p2', 'p1']);
  });

  it('is byte-identical under a fixed permutation of its input', () => {
    // CARD-05's whole correctness property, checked rather than asserted. A comparator
    // that returned 0 on equal values would defer to this array's order.
    const plays: CardPlay[] = [
      { playerId: 'p1', value: 2, round: 1, seq: 3 },
      { playerId: 'p2', value: 5, round: 1, seq: 4 },
      { playerId: 'p3', value: 2, round: 1, seq: 5 },
      { playerId: 'p4', value: 1, round: 1, seq: 6 },
      { playerId: 'p5', value: 5, round: 1, seq: 7 },
    ];

    const PERMUTATION = [3, 0, 4, 2, 1] as const;
    const shuffled = PERMUTATION.map((index) => plays[index] as CardPlay);

    expect(shuffled.map((play) => play.playerId)).not.toEqual(plays.map((play) => play.playerId));
    expect(resolvePickOrder(shuffled)).toEqual(resolvePickOrder(plays));
    expect(resolvePickOrder(shuffled)).toEqual(['p4', 'p1', 'p3', 'p2', 'p5']);
  });

  it('is byte-identical under every rotation of its input', () => {
    const plays: CardPlay[] = [
      { playerId: 'p1', value: 4, round: 2, seq: 11 },
      { playerId: 'p2', value: 4, round: 2, seq: 12 },
      { playerId: 'p3', value: 2, round: 2, seq: 13 },
    ];
    const expected = resolvePickOrder(plays);

    for (let offset = 1; offset < plays.length; offset++) {
      const rotated = [...plays.slice(offset), ...plays.slice(0, offset)];
      expect(resolvePickOrder(rotated), `rotated by ${offset}`).toEqual(expected);
    }
  });

  it('does not mutate the array it was handed', () => {
    const plays: CardPlay[] = [
      { playerId: 'p2', value: 6, round: 1, seq: 3 },
      { playerId: 'p3', value: 1, round: 1, seq: 4 },
    ];
    const before = JSON.parse(JSON.stringify(plays)) as CardPlay[];

    resolvePickOrder(plays);
    expect(plays).toEqual(before);
  });

  it('resolves an empty round to an empty order rather than throwing', () => {
    expect(resolvePickOrder([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The two facts the tiebreak rests on
// ---------------------------------------------------------------------------

describe('the properties that make the comparator total', () => {
  it('gives every card play in a document a distinct seq', () => {
    const state = stateWith([
      ...roundOfPlays([1, 6, 3], 1, 3),
      ...roundOfPlays([2, 4, 5], 2, 6),
      ...roundOfPlays([4, 2, 1], 3, 9),
    ]);

    const seqs = state.cardsPlayed.map((play) => play.seq);
    expect(new Set(seqs).size).toBe(seqs.length);
  });

  it('leaves the seeded generator untouched by a full round of card play', () => {
    // `doc.rng` was reserved for this tie-break by an earlier comment. D-22 broke ties on
    // (value, seq) instead and consumes no randomness at all, so the cursor stays 0 for the
    // life of the document. Asserted rather than left as prose.
    const doc = startedDoc();
    const state = { ...fold(doc), cardsPlayed: roundOfPlays([1, 6, 3], 1, 3) };

    selectHand(state, 'p1');
    selectCardPlayOrder(state, 2);
    selectCurrentRound(state);
    selectCardsPlayedThisRound(state, 1);
    selectResolvedOrder(state, 1);
    resolvePickOrder(state.cardsPlayed);

    expect(doc.rng).toEqual({ seed: SEED, cursor: 0 });
  });
});

// ---------------------------------------------------------------------------
// playableValues — CARD-04, D-21. The offer constraint, and the deadlock it forecloses.
// ---------------------------------------------------------------------------

/** Values 1..n, which is what a full hand is before anybody has played. */
function fullHand(rounds: number): number[] {
  return Array.from({ length: rounds }, (_, position) => position + 1);
}

describe('playableValues', () => {
  /**
   * THE test this plan exists for. 03-CONTEXT found the deadlock during discussion and
   * required it be "a test, not a comment"; 03-RESEARCH §Priority Cards works the same
   * sequence through and concludes the check must run per candidate at every play.
   *
   * 3 players, 3 rounds. R1: P1 plays 1, P2 plays 2, P3 plays 3 — so the R2 hands are
   * P1{2,3}, P2{1,3}, P3{1,2}. Unconstrained, R2 `P1 -> 2` then `P2 -> 1` strands P3
   * holding {1,2} with both already down and nothing legal to put on the table.
   */
  describe('the 03-CONTEXT three-player deadlock is unreachable', () => {
    // Hands as they stand at the top of round 2, in play order.
    const P1 = [2, 3];
    const P2 = [1, 3];
    const P3 = [1, 2];

    it('lets P1 play 2, because a matching still exists for P2 and P3', () => {
      // U becomes {2}; P3 can take 1 and P2 can take 3, so the play is legal.
      expect(playableValues(P1, [P2, P3], new Set(), 3, 3)).toEqual([2, 3]);
    });

    it('refuses P2 the 1 that would strand P3, and offers the 3 that does not', () => {
      // The whole deadlock, foreclosed: after P1 -> 2, U = {2}. Playing 1 would make
      // U = {1,2}, and P3's entire hand {1,2} minus U is empty.
      const offered = playableValues(P2, [P3], new Set([2]), 3, 3);

      expect(offered).not.toContain(1);
      expect(offered).toContain(3);
      expect(offered).toEqual([3]);
    });

    it('leaves P3 a legal card once P2 has been steered onto 3', () => {
      // The state the unconstrained sequence could not reach: P3 still holds something.
      expect(playableValues(P3, [], new Set([2, 3]), 3, 3)).toEqual([1]);
    });
  });

  it('never offers a value already down this round', () => {
    expect(playableValues([1, 2, 3, 4], [[1, 2, 3, 4]], new Set([2]), 4, 4)).not.toContain(2);
  });

  it('suspends the rule entirely when players outnumber rounds', () => {
    // Pigeonhole: 8 players cannot take 6 distinct values, so running the matching would
    // mark every card unplayable. CARD-04 scopes itself to players <= rounds for this.
    const hand = fullHand(6);
    const remaining = Array.from({ length: 7 }, () => fullHand(6));

    expect(playableValues(hand, remaining, new Set([1, 2, 3]), 8, 6)).toEqual(hand);
  });

  it('reports the pigeonhole suspension as suspended rather than as the deadlock escape', () => {
    // Two different states with the same offer, and only one of them puts a line on
    // screen. `lifted` is what tells them apart.
    const hand = fullHand(6);
    const remaining = Array.from({ length: 7 }, () => fullHand(6));

    expect(cardOffer(hand, remaining, new Set([1]), 8, 6).lifted).toBe(false);
  });

  it('lifts the constraint for one play rather than offering nothing at all', () => {
    // Reachable only from an imported or hand-edited log, which `fold` reproduces
    // faithfully because it runs no `canApply`. Both remaining players hold nothing but
    // the 1, so no matching exists whatever the clock plays: taking 1 strands both of
    // them outright, and taking 2 leaves two players competing for a single value.
    // A screen with zero legal actions is worse than a stated exception (T-03-33).
    const offer = cardOffer([1, 2], [[1], [1]], new Set(), 3, 3);

    expect(offer.values).toEqual([1, 2]);
    expect(offer.lifted).toBe(true);
  });

  it('does not call an empty hand a lifted constraint', () => {
    const offer = cardOffer([], [[1]], new Set([2]), 3, 3);

    expect(offer.values).toEqual([]);
    expect(offer.lifted).toBe(false);
  });

  it('leaves the hand it was handed untouched', () => {
    const hand = [1, 2, 3];
    playableValues(hand, [[1, 2, 3]], new Set([2]), 3, 3);
    expect(hand).toEqual([1, 2, 3]);
  });

  it('answers the last player in a round from their own hand alone', () => {
    expect(playableValues([1, 4, 5], [], new Set([2, 3]), 3, 6)).toEqual([1, 4, 5]);
  });

  it('finishes a full round-one offer at eight players and six rounds under 10ms', () => {
    // T-03-34. The suspended path, which is what 8 players and 6 rounds actually takes.
    const hand = fullHand(6);
    const remaining = Array.from({ length: 7 }, () => fullHand(6));

    const started = performance.now();
    playableValues(hand, remaining, new Set(), 8, 6);
    const elapsed = performance.now() - started;

    expect(elapsed).toBeLessThan(10);
  });

  it('finishes the true worst case — eight players and eight rounds — under 10ms', () => {
    // The suspension guard above means 8x6 never runs the matching at all, so the timing
    // assertion that matters is the largest shape that DOES: players === rounds === 8,
    // which is 2^7 - 1 = 127 subset unions per candidate across 8 candidates.
    const hand = fullHand(8);
    const remaining = Array.from({ length: 7 }, () => fullHand(8));

    const started = performance.now();
    playableValues(hand, remaining, new Set(), 8, 8);
    const elapsed = performance.now() - started;

    expect(elapsed).toBeLessThan(10);
  });
});

// ---------------------------------------------------------------------------
// selectPlayableCards — the same rule, composed against a real document
// ---------------------------------------------------------------------------

describe('selectPlayableCards', () => {
  it('offers a full hand at the top of a round, with nothing down', () => {
    // Three players, six rounds: every value is still reachable for everyone.
    expect(selectPlayableCards(stateWith([]), 'p2')).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('drops a value another player has already put down this round', () => {
    const state = stateWith([{ playerId: 'p2', value: 3, round: 1, seq: 3 }]);
    expect(selectPlayableCards(state, 'p3')).toEqual([1, 2, 4, 5, 6]);
  });

  it('reproduces the CONTEXT deadlock through the real rotation and forecloses it', () => {
    // Three players over three rounds, played out through `selectCardPlayOrder`'s real
    // rotation rather than through hand-picked arrays. ORDER is ['p2','p3','p1'], so
    // round 1 plays p2, p3, p1 and round 2 plays p3, p1, p2 — the rotation moves who is
    // first, which is exactly why the check has to run per candidate at every play rather
    // than once against a fixed seating.
    const roundOne = [
      { playerId: 'p2', value: 1, round: 1, seq: 3 },
      { playerId: 'p3', value: 2, round: 1, seq: 4 },
      { playerId: 'p1', value: 3, round: 1, seq: 5 },
    ];
    // Hands entering round 2: p2 {2,3}, p3 {1,3}, p1 {1,2}. Round 2 opens with p3, who
    // takes 3 — leaving p1 on the clock and p2 holding {2,3} behind them.
    const roundTwo = [{ playerId: 'p3', value: 3, round: 2, seq: 10 }];

    const state = {
      ...stateWith([...roundOne, ...roundTwo], [{ round: 1, order: ['p2', 'p3', 'p1'] }], CONFIG_THREE),
      // One full round of picks, so `selectCurrentRound` puts the draft on round 2.
      picks: [
        { playerId: 'p2', monId: 'venusaur', round: 1, pickIndex: 0, seq: 6 },
        { playerId: 'p3', monId: 'charizard', round: 1, pickIndex: 1, seq: 7 },
        { playerId: 'p1', monId: 'blastoise', round: 1, pickIndex: 2, seq: 8 },
      ],
    };

    expect(selectCurrentRound(state)).toBe(2);

    // p1 holds {1,2} with 3 already down. Playing 2 would make U = {2,3}, and p2's whole
    // hand {2,3} minus U is empty — the deadlock, one play away. So 2 is refused.
    const offered = selectPlayableCards(state, 'p1');
    expect(offered).not.toContain(2);
    expect(offered).toEqual([1]);
  });

  it('returns the whole hand when the document deals more players than rounds', () => {
    // Three players, two rounds — pigeonhole, so CARD-04 suspends itself.
    expect(selectPlayableCards(stateWith([], [], CONFIG_TWO), 'p1')).toEqual([1, 2]);
  });

  it('does not roll the generator', () => {
    const doc = startedDoc();
    const state = { ...fold(doc), cardsPlayed: roundOfPlays([1, 6, 3], 1, 3) };

    selectPlayableCards(state, 'p1');
    selectCardOffer(state, 'p1');

    expect(doc.rng).toEqual({ seed: SEED, cursor: 0 });
  });
});

/*
  Added by the phase 03 code review (CR-01).

  `admitsDistinctRepresentatives` decided Hall's condition by enumerating all `2^count - 1`
  subsets. `cardOffer`'s `players > rounds` guard bounds `count` at `MAX_ROUNDS - 1` = 23,
  so the shape below is legal input — and 2^23 subsets took 11185ms on the author's machine,
  synchronously, inside a render `useMemo` and inside `canApply`.

  The budget is deliberately loose. It is not a benchmark: it is the difference between
  "returns" and "freezes the tab", and it fails by seconds rather than by milliseconds if
  the matching is ever swapped back for an enumeration.
*/
describe('the offer is computed by matching, not by subset enumeration', () => {
  it('answers a 24-player, 24-round offer well inside a frame budget', () => {
    const rounds = 24;
    const players = 24;
    const hand = Array.from({ length: rounds }, (_, index) => index + 1);
    const remainingHands = Array.from({ length: players - 1 }, () => hand);

    const started = performance.now();
    const offer = cardOffer(hand, remainingHands, new Set<number>(), players, rounds);
    const elapsed = performance.now() - started;

    // Every value is playable: 23 later players drawing from 24 distinct values always
    // admits distinct representatives, whichever one the player on the clock takes.
    expect(offer.values).toEqual(hand);
    expect(offer.lifted).toBe(false);
    expect(elapsed).toBeLessThan(250);
  });

  it('still refuses the value that would strand a later player at that size', () => {
    const rounds = 24;
    const players = 24;
    const hand = [1, 2];
    // One later player holds only `1`, so the clock playing `1` strands them. The other 22
    // hold everything, which is what makes the enumeration expensive rather than trivial.
    const wide = Array.from({ length: rounds }, (_, index) => index + 1);
    const remainingHands = [[1], ...Array.from({ length: players - 2 }, () => wide)];

    const started = performance.now();
    const offer = cardOffer(hand, remainingHands, new Set<number>(), players, rounds);
    const elapsed = performance.now() - started;

    expect(offer.values).toEqual([2]);
    expect(offer.lifted).toBe(false);
    expect(elapsed).toBeLessThan(250);
  });
});
