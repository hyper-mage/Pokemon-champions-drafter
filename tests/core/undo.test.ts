/**
 * Undo — SHEL-06 / D-10.
 *
 * Zero mocks, by construction. `canUndo` and `undoLast` are pure functions of the
 * document they are handed; if a test in this file ever needs a fake clock or a fake id
 * generator, an ambient value has leaked into the core and `npm run check:pure` should
 * already have failed the build.
 *
 * The property every assertion here rests on was established by plan 01-06 and is
 * asserted in `tests/core/reduce.test.ts`: folding a log prefix equals the state before
 * the removed action was applied, at every cut point of a complete draft. Undo is
 * therefore "drop the action and fold again" — not an inverse patch, not a snapshot
 * stack, and not a second mechanism sitting beside the log.
 */

import { describe, expect, it } from 'vitest';

import {
  BANS_PLACED,
  BANS_REVEALED,
  BANS_SUBMITTED,
  CARDS_PLAYED,
  DRAFT_PICK_MADE,
  DRAFT_PICK_UNDONE,
  DRAFT_STARTED,
  POOL_BUILT,
  SCHEDULE_COMPILED,
  SWAP_MADE,
  SWAP_PASSED,
  TOURNAMENT_CUT_TAKEN,
  TOURNAMENT_MATCH_RECORDED,
  TOURNAMENT_REOPENED,
  TOURNAMENT_RESULTS_VOIDED,
  TOURNAMENT_TIEBREAK_ORDERED,
  bansPlaced,
  bansRevealed,
  bansSubmitted,
  cardsPlayed,
  cutTaken,
  draftStarted,
  matchRecorded,
  orderResolved,
  pickMade,
  pickUndone,
  poolBuilt,
  reopened,
  resultsVoided,
  scheduleCompiled,
  swapMade,
  swapPassed,
  tiebreakOrdered,
  type Action,
  type Intent,
  type RoundSpec,
} from '../../src/core/actions';
import {
  SCHEMA_VERSION,
  type TournamentConfig,
  type TournamentDoc,
} from '../../src/core/model';
import { fold } from '../../src/core/reduce';
import {
  selectAvailablePool,
  selectBanStageState,
  selectBanTurn,
  selectCardsPlayedThisRound,
  selectCardTurn,
  selectCurrentTurn,
  selectHand,
  selectIsTournamentComplete,
  selectPhase,
  selectPickCount,
  selectResolvedOrder,
  selectSwapRoundPosition,
  selectTeams,
} from '../../src/core/selectors';
import {
  canUndo,
  lastPickAction,
  lastUndoableAction,
  undoCrossesRoundBoundary,
  undoLast,
  undoRemoval,
} from '../../src/core/undo';

// ---------------------------------------------------------------------------
// Fixtures — deliberately the same shape as tests/core/reduce.test.ts, so a reader
// comparing the two files is comparing behaviour rather than scaffolding.
// ---------------------------------------------------------------------------

const CREATED_AT = 1_700_000_000_000;
const SEED = 0x5f3a91c2;

/** Thirteen ids: twelve picks plus one that must still be in the pool at the end. */
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
];

const CONFIG: TournamentConfig = {
  formatLabel: 'Champions Test',
  players: [
    { id: 'p1', name: 'Player 1' },
    { id: 'p2', name: 'Player 2' },
  ],
  rounds: 6,
  rosterVersion: 'mb',
  rosterChecksum: 'abc123',
  poolSize: 12,
  bans: [],
  banMode: 'hostBanlist',
  megasRequiredPerTeam: 0,
  dualMegaChoices: [],
  depth: 'draftOnly',
  rules: [{ kind: 'mega', count: 0 }],
  megaFormeBans: [],
  swapBudget: 0,
  swapRounds: 0,
  bansPerPlayer: 0,
  duplicateBanPolicy: 'bothApply',
  matchMetric: 'pokemonLeft',
  roundRobinFormat: 'bo1',
  bracketFormat: 'bo1',
};

const ORDER = ['p1', 'p2'];

/** Stamp the envelope the store adds at the edge. Creators never do this themselves. */
function stamp(intent: Intent, seq: number): Action {
  return { ...intent, seq, at: CREATED_AT + seq, actorId: 'host' };
}

function makeDoc(log: readonly Action[] = []): TournamentDoc {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'tournament-fixture',
    createdAt: CREATED_AT,
    config: CONFIG,
    rng: { seed: SEED, cursor: 0 },
    log: [...log],
  };
}

/**
 * `pool/built` then `draft/started` — the shape a Phase 2 document has.
 *
 * `createTournament` emits a third action between these two since 03-02, and this fixture
 * deliberately does not: `undo` never reads the schedule, and a Phase 2 save is exactly the
 * log this file must keep working against. `fold` does not run `canApply`, so the absent
 * `schedule/compiled` is not a legality question here.
 */
function openingLog(): Action[] {
  return [
    stamp(poolBuilt(POOL, CONFIG.rosterVersion, CONFIG.rosterChecksum, 7, 0), 0),
    stamp(draftStarted(ORDER, 9), 1),
  ];
}

/** Append `count` legal alternating picks, taking species off the top of the pool. */
function withPicks(log: Action[], count: number): Action[] {
  const extended = [...log];
  for (let pickIndex = 0; pickIndex < count; pickIndex++) {
    const playerId = ORDER[pickIndex % ORDER.length] as string;
    const round = Math.floor(pickIndex / ORDER.length) + 1;
    extended.push(
      stamp(
        pickMade({ playerId, monId: POOL[pickIndex] as string, round, pickIndex }),
        extended.length,
      ),
    );
  }
  return extended;
}

// ---------------------------------------------------------------------------
// canUndo
// ---------------------------------------------------------------------------

describe('canUndo', () => {
  it('is false for a document whose log is empty', () => {
    expect(canUndo(makeDoc())).toBe(false);
  });

  it('is false when the log holds only pool/built and draft/started', () => {
    // This is the state the board is in the moment the app boots. The button must be
    // disabled here, and the disabled state is exactly this predicate.
    expect(canUndo(makeDoc(openingLog()))).toBe(false);
  });

  it('is true once at least one draft/pickMade exists', () => {
    expect(canUndo(makeDoc(withPicks(openingLog(), 1)))).toBe(true);
  });

  it('stays true at every depth of a complete draft', () => {
    for (let picks = 1; picks <= 12; picks++) {
      expect(canUndo(makeDoc(withPicks(openingLog(), picks))), `${picks} picks`).toBe(true);
    }
  });

  it('is false again after every pick has been undone', () => {
    let doc = makeDoc(withPicks(openingLog(), 12));
    for (let step = 0; step < 12; step++) doc = undoLast(doc);
    expect(canUndo(doc)).toBe(false);
  });

  it('ignores a malformed entry that claims to be a pick but carries no monId', () => {
    // An imported or hand-edited log is untrusted input (plan 01-10 folds one). A
    // pick-shaped entry with no payload must not enable a control that would then
    // remove it and change nothing on screen.
    const malformed = {
      type: DRAFT_PICK_MADE,
      seq: 2,
      at: CREATED_AT + 2,
      actorId: 'host',
    } as unknown as Action;

    expect(canUndo(makeDoc([...openingLog(), malformed]))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// undoLast — the equivalence
// ---------------------------------------------------------------------------

describe('undoLast', () => {
  it('returns a document whose folded state equals the state before that pick', () => {
    // The whole design in one assertion: undo is a log-prefix re-fold.
    const full = withPicks(openingLog(), 12);

    for (let picks = 1; picks <= 12; picks++) {
      const doc = makeDoc(full.slice(0, 2 + picks));
      const before = fold(makeDoc(full.slice(0, 2 + picks - 1)));
      expect(fold(undoLast(doc)), `after ${picks} picks`).toEqual(before);
    }
  });

  it('drops exactly one action from the log', () => {
    const doc = makeDoc(withPicks(openingLog(), 5));
    expect(undoLast(doc).log).toHaveLength(doc.log.length - 1);
  });

  it('removes the most recent pick and no other', () => {
    const doc = makeDoc(withPicks(openingLog(), 5));
    const next = undoLast(doc);

    expect(selectPickCount(fold(next))).toBe(4);
    expect(fold(next).picks.map((pick) => pick.monId)).toEqual(POOL.slice(0, 4));
  });

  it('returns to the pre-first-pick state after twelve successive undos', () => {
    // D-10: unlimited, all the way back to draft start.
    let doc = makeDoc(withPicks(openingLog(), 12));
    expect(fold(doc).picks).toHaveLength(12);

    for (let step = 0; step < 12; step++) doc = undoLast(doc);

    expect(fold(doc)).toEqual(fold(makeDoc(openingLog())));
    expect(fold(doc).picks).toEqual([]);
    expect(canUndo(doc)).toBe(false);
  });

  it('never removes pool/built or draft/started', () => {
    // Undo unwinds the draft. It does not un-create the tournament.
    let doc = makeDoc(withPicks(openingLog(), 12));
    for (let step = 0; step < 20; step++) doc = undoLast(doc);

    expect(doc.log).toHaveLength(2);
    expect(doc.log[0]?.type).toBe(POOL_BUILT);
    expect(doc.log[1]?.type).toBe(DRAFT_STARTED);
  });

  it('returns the document unchanged when there is nothing to undo', () => {
    const doc = makeDoc(openingLog());
    expect(undoLast(doc).log).toEqual(doc.log);
    expect(fold(undoLast(doc))).toEqual(fold(doc));
  });

  it('removes the last pickMade rather than the last log entry', () => {
    // Phase 1 always has the pick last, so this is forward-proofing rather than a
    // current requirement — later phases interleave card plays, bans and swaps, and
    // a `pop()` would silently remove one of those instead.
    const log = withPicks(openingLog(), 2);
    log.push(stamp(pickUndone(2), log.length));

    const next = undoLast(makeDoc(log));

    // pool/built, draft/started, the surviving first pick, and the trailing entry the
    // naive `pop()` would have taken instead.
    expect(next.log).toHaveLength(4);
    expect(next.log[3]?.type).toBe(DRAFT_PICK_UNDONE);
    expect(next.log.filter((action) => action.type === DRAFT_PICK_MADE)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// undoLast — purity
// ---------------------------------------------------------------------------

describe('undoLast purity', () => {
  it('does not mutate the document it is given', () => {
    const doc = makeDoc(withPicks(openingLog(), 7));
    const before = JSON.parse(JSON.stringify(doc)) as TournamentDoc;

    undoLast(doc);

    expect(doc).toEqual(before);
  });

  it('leaves the input log length unchanged', () => {
    const doc = makeDoc(withPicks(openingLog(), 7));
    const lengthBefore = doc.log.length;

    undoLast(doc);

    expect(doc.log).toHaveLength(lengthBefore);
  });

  it('returns a fresh log array rather than the caller of the input one', () => {
    const doc = makeDoc(withPicks(openingLog(), 3));
    expect(undoLast(doc).log).not.toBe(doc.log);
  });

  it('produces a document that survives a JSON round trip unchanged', () => {
    const next = undoLast(makeDoc(withPicks(openingLog(), 6)));
    expect(JSON.parse(JSON.stringify(next))).toEqual(next);
  });
});

// ---------------------------------------------------------------------------
// What the host sees
// ---------------------------------------------------------------------------

describe('undo as the host experiences it', () => {
  it('puts the undone species back into the available pool', () => {
    const doc = makeDoc(withPicks(openingLog(), 5));
    const undone = POOL[4] as string;

    expect(selectAvailablePool(fold(doc))).not.toContain(undone);
    expect(selectAvailablePool(fold(undoLast(doc)))).toContain(undone);
  });

  it('rolls the turn back to the slot the removed pick occupied', () => {
    const doc = makeDoc(withPicks(openingLog(), 5));
    const removed = lastPickAction(doc);
    const turn = selectCurrentTurn(fold(undoLast(doc)));

    expect(removed).not.toBeNull();
    expect(turn).not.toBeNull();
    expect(turn?.playerId).toBe(removed?.playerId);
    expect(turn?.round).toBe(removed?.round);
    expect(turn?.pickIndex).toBe(removed?.pickIndex);
  });

  it('re-opens the board when the last pick of a complete draft is undone', () => {
    const complete = makeDoc(withPicks(openingLog(), 12));
    expect(selectCurrentTurn(fold(complete))).toBeNull();

    const turn = selectCurrentTurn(fold(undoLast(complete)));
    expect(turn?.round).toBe(6);
    expect(turn?.pickIndex).toBe(11);
  });

  it('restores the pre-undo state exactly when the same species is picked again', () => {
    // The host undoes a misclick, then picks the same species deliberately. Nothing
    // about the document may remember the detour — including the pick's `seq`, which
    // is what a later undo targets.
    const doc = makeDoc(withPicks(openingLog(), 8));
    const before = fold(doc);

    const undone = undoLast(doc);
    const removed = lastPickAction(doc);
    expect(removed).not.toBeNull();

    const rePicked = makeDoc([
      ...undone.log,
      stamp(
        pickMade({
          playerId: removed?.playerId as string,
          monId: removed?.monId as string,
          round: removed?.round as number,
          pickIndex: removed?.pickIndex as number,
        }),
        undone.log.length,
      ),
    ]);

    expect(fold(rePicked)).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// lastPickAction
// ---------------------------------------------------------------------------

describe('lastPickAction', () => {
  it('is null when no pick has been made', () => {
    expect(lastPickAction(makeDoc(openingLog()))).toBeNull();
  });

  it('carries the round and species the announcement needs', () => {
    // The live-region copy is `Undid Round {r} — {species} is back in the pool.`, so
    // undo has to be able to name both without re-deriving either.
    const removed = lastPickAction(makeDoc(withPicks(openingLog(), 5)));

    expect(removed?.round).toBe(3);
    expect(removed?.monId).toBe(POOL[4]);
    expect(removed?.playerId).toBe('p1');
  });
});

// ---------------------------------------------------------------------------
// undoCrossesRoundBoundary — D-37
//
// The predicate that decides whether undo asks first. It lives in the pure core rather
// than in `TopBar` because "does this undo cross a round boundary" is a rule about the
// draft, and a UI component may not own a rule.
// ---------------------------------------------------------------------------

/** An eight-player config, for the case where a whole round is exactly eight picks. */
const EIGHT_CONFIG: TournamentConfig = {
  ...CONFIG,
  players: Array.from({ length: 8 }, (_, index) => ({
    id: `q${index + 1}`,
    name: `Player ${index + 1}`,
  })),
};

const EIGHT_ORDER = EIGHT_CONFIG.players.map((player) => player.id);

function makeEightDoc(pickCount: number): TournamentDoc {
  const log: Action[] = [
    stamp(poolBuilt(POOL, CONFIG.rosterVersion, CONFIG.rosterChecksum, 7, 0), 0),
    stamp(draftStarted(EIGHT_ORDER, 9), 1),
  ];

  for (let pickIndex = 0; pickIndex < pickCount; pickIndex++) {
    log.push(
      stamp(
        pickMade({
          playerId: EIGHT_ORDER[pickIndex % 8] as string,
          monId: POOL[pickIndex] as string,
          round: Math.floor(pickIndex / 8) + 1,
          pickIndex,
        }),
        log.length,
      ),
    );
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'eight-player-fixture',
    createdAt: CREATED_AT,
    config: EIGHT_CONFIG,
    rng: { seed: SEED, cursor: 0 },
    log,
  };
}

describe('undoCrossesRoundBoundary', () => {
  it('is null when there is nothing to undo', () => {
    const doc = makeDoc(openingLog());
    expect(undoCrossesRoundBoundary(doc, fold(doc))).toBeNull();
  });

  it('does not cross when the pick belongs to the round the draft is on', () => {
    // Three picks with two players: the draft is on round 2 and so is the last pick.
    const doc = makeDoc(withPicks(openingLog(), 3));
    const crossing = undoCrossesRoundBoundary(doc, fold(doc));

    expect(crossing?.crosses).toBe(false);
    expect(crossing?.removedRound).toBe(2);
    expect(crossing?.currentRound).toBe(2);
  });

  it('crosses when the pick belongs to the round just finished', () => {
    // Exactly two picks with two players: round 1 is complete, the draft is on round 2,
    // and undoing reaches back past the boundary. This is the whole of D-37.
    const doc = makeDoc(withPicks(openingLog(), 2));
    const crossing = undoCrossesRoundBoundary(doc, fold(doc));

    expect(crossing?.crosses).toBe(true);
    expect(crossing?.removedRound).toBe(1);
    expect(crossing?.currentRound).toBe(2);
    expect(crossing?.playerId).toBe('p2');
  });

  it('crosses at eight players on exactly eight picks, and names the eighth', () => {
    const doc = makeEightDoc(8);
    const crossing = undoCrossesRoundBoundary(doc, fold(doc));

    expect(crossing?.crosses).toBe(true);
    expect(crossing?.removedRound).toBe(1);
    expect(crossing?.currentRound).toBe(2);
    expect(crossing?.playerId).toBe(EIGHT_ORDER[7]);
  });

  it('falls back to the configured round count once the draft is complete', () => {
    // `selectCurrentTurn` returns null from that point on, so `currentRound` has nowhere
    // else to come from. It must not throw and must not report 0.
    const doc = makeDoc(withPicks(openingLog(), 12));
    const state = fold(doc);

    expect(selectCurrentTurn(state)).toBeNull();

    const crossing = undoCrossesRoundBoundary(doc, state);
    expect(crossing?.currentRound).toBe(CONFIG.rounds);
    expect(crossing?.removedRound).toBe(CONFIG.rounds);
    // The final pick belongs to the final round, so unwinding it crosses nothing.
    expect(crossing?.crosses).toBe(false);
  });

  it('reports one removed pick in every state reachable today', () => {
    // `undoLast` removes exactly one, which is what makes 02-UI-SPEC §11's "picks made
    // after it" clause dormant. The field is the seam a walk-back undo would fill, not a
    // number waiting to be deleted.
    for (const count of [1, 2, 3, 7, 12]) {
      const doc = makeDoc(withPicks(openingLog(), count));
      expect(undoCrossesRoundBoundary(doc, fold(doc))?.removedCount).toBe(1);
    }
  });

  it('does not mutate the document it is handed', () => {
    const doc = makeDoc(withPicks(openingLog(), 4));
    const before = JSON.stringify(doc);

    undoCrossesRoundBoundary(doc, fold(doc));

    expect(JSON.stringify(doc)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// undoCrossesRoundBoundary during the card phase
//
// The boundary check used to read the current round off `selectCurrentTurn`, falling back
// to `config.rounds` when that came back null. That fallback was written for exactly one
// null: the finished draft. The card phase is a SECOND null, and under the old code every
// undo offered between two rounds would have been described to the host as reaching back
// from round six.
// ---------------------------------------------------------------------------

const OPEN_SCHEDULE: RoundSpec[] = Array.from({ length: CONFIG.rounds }, (_, position) => ({
  index: position + 1,
  kind: 'open' as const,
}));

/** A v3 opening: the compiled schedule is what tells this document apart from a migrated one. */
function v3OpeningLog(): Action[] {
  return [
    stamp(poolBuilt(POOL, CONFIG.rosterVersion, CONFIG.rosterChecksum, 7, 0), 0),
    stamp(scheduleCompiled(OPEN_SCHEDULE), 1),
    stamp(draftStarted(ORDER, 9), 2),
  ];
}

/** Round `round`'s cards and its resolution, in `state.order`, then that round's picks. */
function withResolvedRound(log: Action[], round: number): Action[] {
  const extended = [...log];
  const push = (intent: Intent): void => {
    extended.push(stamp(intent, extended.length));
  };

  // Both players play the round's own number, so each spends 1..6 exactly once and the
  // round is a tie on value — resolved by `seq`, which puts them back in `state.order`.
  //
  // CARD-04 makes this shape unreachable in a LIVE draft since 03-09: the second player
  // may not repeat a value already down this round. It stays here deliberately, because
  // `fold` runs no `canApply` and undo has to keep working against exactly the documents
  // it did not write. The tie is what makes the resulting order predictable.
  for (const playerId of ORDER) push(cardsPlayed({ playerId, value: round, round }));
  push(orderResolved(round, ORDER));

  const firstPickIndex = (round - 1) * ORDER.length;
  for (const [offset, playerId] of ORDER.entries()) {
    const pickIndex = firstPickIndex + offset;
    push(pickMade({ playerId, monId: POOL[pickIndex] as string, round, pickIndex }));
  }

  return extended;
}

describe('undoCrossesRoundBoundary during the card phase', () => {
  it('reports the round being bid on, not the last round of the tournament', () => {
    // Round 1 is played out and round 2's cards are on the table: no turn is on the clock,
    // and the draft is standing in round 2.
    const log = withResolvedRound(v3OpeningLog(), 1);
    log.push(stamp(cardsPlayed({ playerId: 'p2', value: 3, round: 2 }), log.length));

    const doc = makeDoc(log);
    const state = fold(doc);

    expect(selectCurrentTurn(state)).toBeNull();

    const crossing = undoCrossesRoundBoundary(doc, state);

    // The assertion this test exists for: `selectCurrentRound` answers during the card
    // phase, so the confirm is not told the draft is standing on round six.
    expect(crossing?.currentRound).toBe(2);
    expect(crossing?.currentRound).not.toBe(CONFIG.rounds);

    /*
      And the D-20 generalization, which changed this test's other half. The top of the
      stack is now round 2's CARD PLAY — the most recent move — not round 1's last pick.
      Before undo covered cards, this reported round 1 and would have unwound a pick the
      host made two moves ago while their card sat on the table untouched.
    */
    expect(crossing?.kind).toBe('card');
    expect(crossing?.removedRound).toBe(2);
    expect(crossing?.cardValue).toBe(3);
    expect(crossing?.crosses).toBe(false);
  });

  it('does not report a crossing for an undo inside the round being picked', () => {
    const log = withResolvedRound(v3OpeningLog(), 1);
    const doc = makeDoc(log);
    const crossing = undoCrossesRoundBoundary(doc, fold(doc));

    // Round 1's picks are in and round 2 has not been bid on, so the draft stands in
    // round 2 and unwinding round 1's last pick genuinely does cross.
    expect(crossing?.removedRound).toBe(1);
    expect(crossing?.currentRound).toBe(2);
    expect(crossing?.crosses).toBe(true);
  });

  it('still reports the last round once every team is full', () => {
    let log = v3OpeningLog();
    for (let round = 1; round <= CONFIG.rounds; round++) log = withResolvedRound(log, round);

    const doc = makeDoc(log);
    const crossing = undoCrossesRoundBoundary(doc, fold(doc));

    expect(crossing?.currentRound).toBe(CONFIG.rounds);
    expect(crossing?.crosses).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// One stack for the whole log — D-20, SHEL-06
// ---------------------------------------------------------------------------

/** Round `round`'s cards only, with no resolution and no picks after them. */
function withCardsOnly(log: Action[], round: number, values: readonly number[]): Action[] {
  const extended = [...log];
  ORDER.forEach((playerId, index) => {
    const value = values[index];
    if (value === undefined) return;
    extended.push(stamp(cardsPlayed({ playerId, value, round }), extended.length));
  });
  return extended;
}

describe('the undo stack spans the whole log', () => {
  it('is false when the log holds only the three origination actions', () => {
    // Undo unwinds the draft; it does not un-create the tournament. This is the state the
    // board boots into, and exactly when the button must render disabled.
    expect(canUndo(makeDoc(v3OpeningLog()))).toBe(false);
  });

  it('is true once a card has been played, with no pick anywhere in the log', () => {
    const doc = makeDoc(withCardsOnly(v3OpeningLog(), 1, [4]));

    expect(canUndo(doc)).toBe(true);
    expect(lastUndoableAction(doc)?.type).toBe(CARDS_PLAYED);
    // The pick-only predicate would have said no. That is the whole of D-20.
    expect(lastPickAction(doc)).toBeNull();
  });

  it('returns a played card to its hand and leaves every pick alone', () => {
    const log = withCardsOnly(withResolvedRound(v3OpeningLog(), 1), 2, [5]);
    const doc = makeDoc(log);

    const before = fold(doc);
    expect(selectHand(before, 'p1')).not.toContain(5);
    expect(selectPickCount(before)).toBe(2);

    const after = fold(undoLast(doc));

    expect(selectHand(after, 'p1')).toContain(5);
    expect(selectPickCount(after)).toBe(2);
  });

  it('never removes pool/built, schedule/compiled or draft/started', () => {
    // Unwind everything, repeatedly, and the origination actions are still there.
    let doc = makeDoc(withResolvedRound(v3OpeningLog(), 1));
    for (let step = 0; step < 50; step++) doc = undoLast(doc);

    expect(doc.log.map((action) => action.type)).toEqual([
      POOL_BUILT,
      SCHEDULE_COMPILED,
      DRAFT_STARTED,
    ]);
    expect(canUndo(doc)).toBe(false);
  });

  it('ignores a compensating draft/pickUndone rather than resurrecting the pick', () => {
    // Removing a compensating action would re-apply what it compensated, which is a redo.
    // D-10 declines to have one.
    const log = withPicks(openingLog(), 1);
    log.push(stamp(pickUndone(log.length - 1), log.length));

    expect(lastUndoableAction(makeDoc(log))?.type).toBe(DRAFT_PICK_MADE);
  });
});

describe('undoing a resolved pick order', () => {
  /** Round 1 bid and resolved, with no picks made against the order yet. */
  function resolvedNoPicks(): TournamentDoc {
    const log = withCardsOnly(v3OpeningLog(), 1, [4, 2]);
    log.push(stamp(orderResolved(1, ['p2', 'p1']), log.length));
    return makeDoc(log);
  }

  it('removes the resolution and the card that triggered it as one step', () => {
    const doc = resolvedNoPicks();
    const removal = undoRemoval(doc);

    expect(removal?.kind).toBe('order');
    expect(removal?.removedCount).toBe(2);
    // The card named is p2's 2 — the one that completed the round.
    expect(removal?.playerId).toBe('p2');
    expect(removal?.cardValue).toBe(2);

    expect(doc.log).toHaveLength(6);
    expect(undoLast(doc).log).toHaveLength(4);
  });

  it('leaves the round in the card phase with one card still to play', () => {
    // The trap D-20 exists to avoid: remove the resolution alone and every card is still
    // down, so the app re-resolves on the next render and the undo appears to do nothing.
    const after = fold(undoLast(resolvedNoPicks()));

    expect(selectPhase(after)).toBe('cards');
    expect(selectResolvedOrder(after, 1)).toBeNull();
    expect(selectCardsPlayedThisRound(after, 1)).toHaveLength(1);
    expect(selectCardTurn(after)?.playerId).toBe('p2');
    expect(selectHand(after, 'p2')).toContain(2);
  });

  it('reports the crossing so the confirm fires, even though the round has not changed', () => {
    const doc = resolvedNoPicks();
    const crossing = undoCrossesRoundBoundary(doc, fold(doc));

    // The draft is STANDING in round 1, so a round-number comparison would wave this
    // through. The boundary being crossed is the moment the room read the order.
    expect(crossing?.removedRound).toBe(1);
    expect(crossing?.currentRound).toBe(1);
    expect(crossing?.crosses).toBe(true);
    expect(crossing?.kind).toBe('order');
    expect(crossing?.removedCount).toBe(2);
  });

  it('takes the picks off first, one at a time, before it reaches the order', () => {
    // The order is not un-resolved while picks still stand against it. Two picks were made
    // in round 1, so it takes three undos to reach the resolution.
    let doc = makeDoc(withResolvedRound(v3OpeningLog(), 1));

    expect(undoRemoval(doc)?.kind).toBe('pick');
    doc = undoLast(doc);
    expect(undoRemoval(doc)?.kind).toBe('pick');
    doc = undoLast(doc);
    expect(undoRemoval(doc)?.kind).toBe('order');
  });

  it('does not mutate the document it was handed', () => {
    const doc = resolvedNoPicks();
    const before = JSON.stringify(doc);

    undoLast(doc);
    undoRemoval(doc);

    expect(JSON.stringify(doc)).toBe(before);
  });

  it('survives an imported resolution whose triggering card play is missing', () => {
    // A hand-edited log. There is no card to take back, so the removal is a lone step
    // rather than a crash or a phantom second entry.
    const log = v3OpeningLog();
    log.push(stamp(orderResolved(1, ORDER), log.length));

    const doc = makeDoc(log);
    const removal = undoRemoval(doc);

    expect(removal?.kind).toBe('order');
    expect(removal?.removedCount).toBe(1);
    expect(removal?.cardValue).toBeNull();
    expect(undoLast(doc).log).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Swaps and passes join the stack — 03-11, closing deferred item 5
//
// Until this plan `Undo last move` stepped PAST a swap to the last pick, and the swap
// survived. The two attach TOGETHER because `UndoRemoval` had to widen for both at once:
// a swap needs two mon ids where a pick needs one, and a pass needs a swap round where
// neither of the others has one.
// ---------------------------------------------------------------------------

const SWAPPY_CONFIG: TournamentConfig = { ...CONFIG, swapBudget: 2, swapRounds: 1 };

function makeSwappyDoc(log: readonly Action[]): TournamentDoc {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'tournament-fixture',
    createdAt: CREATED_AT,
    config: SWAPPY_CONFIG,
    rng: { seed: SEED, cursor: 0 },
    log: [...log],
  };
}

/** Every round resolved and picked, so the picks are complete and a swap round is open. */
function fullyPicked(): Action[] {
  let log = v3OpeningLog();
  for (let round = 1; round <= CONFIG.rounds; round++) log = withResolvedRound(log, round);
  return log;
}

function append(log: readonly Action[], intent: Intent): Action[] {
  const seq = log.reduce((highest, action) => Math.max(highest, action.seq), -1) + 1;
  return [...log, stamp(intent, seq)];
}

describe('undoing a swap', () => {
  /** `p1`'s round-1 `venusaur` replaced by the one id the draft left in the pool. */
  function swapped(swapRound: number): TournamentDoc {
    return makeSwappyDoc(
      append(
        fullyPicked(),
        swapMade({
          playerId: 'p1',
          round: 1,
          outMonId: 'venusaur',
          inMonId: 'feraligatr',
          swapRound,
        }),
      ),
    );
  }

  it('is the top of the stack, rather than the pick underneath it', () => {
    // The whole of deferred item 5. Before this, `lastUndoableAction` reached PAST the
    // swap to the last pick and the swap survived the undo that was meant to remove it.
    const doc = swapped(1);
    expect(lastUndoableAction(doc)?.type).toBe(SWAP_MADE);
    expect(undoRemoval(doc)?.kind).toBe('swap');
  });

  it('carries BOTH mon ids, which is why the type had to widen', () => {
    const removal = undoRemoval(swapped(1));

    // `monId` is what goes back to the POOL; `outMonId` is what goes back to the SLOT.
    // 03-UI-SPEC's `Undo, swap` row names both, and one field could not say it.
    expect(removal?.monId).toBe('feraligatr');
    expect(removal?.outMonId).toBe('venusaur');
    expect(removal?.playerId).toBe('p1');
    expect(removal?.round).toBe(1);
    expect(removal?.swapRound).toBe(1);
    expect(removal?.cardValue).toBeNull();
    expect(removal?.removedCount).toBe(1);
  });

  it('restores the slot and takes the incoming species back out of the pool', () => {
    const doc = swapped(1);

    const before = fold(doc);
    expect(selectTeams(before)['p1']?.[0]).toBe('feraligatr');
    expect(selectAvailablePool(before)).toContain('venusaur');

    const after = fold(undoLast(doc));
    expect(selectTeams(after)['p1']?.[0]).toBe('venusaur');
    expect(selectAvailablePool(after)).toContain('feraligatr');
    expect(selectAvailablePool(after)).not.toContain('venusaur');
  });

  it('never asks for a confirm, whichever round the slot belongs to', () => {
    // 03-UI-SPEC §12 lists exactly three new confirm sets and none of them is "undo a
    // swap". A swap is the most recent move and its undo takes nothing else with it, so
    // the round comparison D-37 makes for a PICK does not apply — and the boundary
    // confirm's copy is pick-specific prose that would read as a lie here.
    for (const swapRound of [0, 1]) {
      const doc = swapped(swapRound);
      const crossing = undoCrossesRoundBoundary(doc, fold(doc));
      expect(crossing?.kind).toBe('swap');
      expect(crossing?.crosses).toBe(false);
    }
  });
});

describe('undoing a pass', () => {
  function passed(): TournamentDoc {
    return makeSwappyDoc(append(fullyPicked(), swapPassed({ playerId: 'p2', swapRound: 1 })));
  }

  it('is undoable, because a pass is a recorded action rather than an absence', () => {
    const doc = passed();
    expect(lastUndoableAction(doc)?.type).toBe(SWAP_PASSED);

    const removal = undoRemoval(doc);
    expect(removal?.kind).toBe('pass');
    expect(removal?.playerId).toBe('p2');
    expect(removal?.swapRound).toBe(1);
    expect(removal?.monId).toBeNull();
    expect(removal?.outMonId).toBeNull();
    expect(removal?.cardValue).toBeNull();
  });

  it('puts the swap round’s clock back on the player who passed', () => {
    const doc = passed();
    expect(selectSwapRoundPosition(fold(doc), 1)?.playerId).toBe('p1');
    expect(selectSwapRoundPosition(fold(undoLast(doc)), 1)?.playerId).toBe('p2');
  });

  it('never asks for a confirm', () => {
    const doc = passed();
    const crossing = undoCrossesRoundBoundary(doc, fold(doc));
    expect(crossing?.kind).toBe('pass');
    expect(crossing?.crosses).toBe(false);
  });

  it('reopens a tournament the last pass had completed', () => {
    // D-31's second completion state, walked backwards. The export panels close again,
    // which is the point: an undone pass means the teams can still change.
    let log = append(fullyPicked(), swapPassed({ playerId: 'p2', swapRound: 1 }));
    log = append(log, swapPassed({ playerId: 'p1', swapRound: 1 }));

    const doc = makeSwappyDoc(log);
    expect(selectIsTournamentComplete(fold(doc))).toBe(true);
    expect(selectIsTournamentComplete(fold(undoLast(doc)))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The ban stage on the same single stack — D-03, D-05, D-23, and 04-RESEARCH Pitfall 8.
//
// D-03 makes undo MANDATORY here rather than convenient: the host is typing other people's
// bans off a Discord message and will pick the wrong Pokémon. The failure this block exists
// to catch is silent — a ban action on neither of `isUndoable`'s two lists makes
// `Undo last move` step PAST it to `draft/started`, which is correctly refused, so the
// button does nothing at all and nothing anywhere reports why.
//
// Every document below carries NO `pool/built`, because D-11 puts the draw last in blind
// and snake. That is not fixture convenience; it is the state the stage actually runs in.
// ---------------------------------------------------------------------------

const BAN_ORDER = ['p1', 'p2', 'p3'];

/** The serpentine `selectBanOrder` walks for three players at two bans each. */
const BAN_SEQUENCE = ['p1', 'p2', 'p3', 'p3', 'p2', 'p1'];

const BLIND_ALLOTMENTS: Record<string, string[]> = {
  p1: ['venusaur', 'charizard'],
  p2: ['blastoise', 'garchomp'],
  p3: ['rotomwash', 'skarmory'],
};

function banConfig(banMode: 'blind' | 'snake', bansPerPlayer: number): TournamentConfig {
  return {
    ...CONFIG,
    players: [
      { id: 'p1', name: 'Player 1' },
      { id: 'p2', name: 'Player 2' },
      { id: 'p3', name: 'Player 3' },
    ],
    banMode,
    bansPerPlayer,
  };
}

function makeBanDoc(config: TournamentConfig, log: readonly Action[]): TournamentDoc {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'ban-stage-fixture',
    createdAt: CREATED_AT,
    config,
    rng: { seed: SEED, cursor: 0 },
    log: [...log],
  };
}

/** D-11's opening: schedule then start, and NO pool. `createBanStage` writes exactly this. */
function banOpeningLog(): Action[] {
  return [stamp(scheduleCompiled(OPEN_SCHEDULE), 0), stamp(draftStarted(BAN_ORDER, 9), 1)];
}

function snakeDoc(placements: number): TournamentDoc {
  let log = banOpeningLog();
  for (let index = 0; index < placements; index++) {
    log = append(
      log,
      bansPlaced(
        BAN_SEQUENCE[index] as string,
        POOL[index] as string,
        Math.floor(index / BAN_ORDER.length) + 1,
      ),
    );
  }
  return makeBanDoc(banConfig('snake', 2), log);
}

function blindDoc(submissions: number, revealed = false): TournamentDoc {
  let log = banOpeningLog();
  const entered = BAN_ORDER.slice(0, submissions);

  for (const playerId of entered) {
    log = append(log, bansSubmitted(playerId, BLIND_ALLOTMENTS[playerId] as string[]));
  }

  if (revealed) {
    log = append(
      log,
      bansRevealed(
        entered.map((playerId) => ({
          playerId,
          monIds: BLIND_ALLOTMENTS[playerId] as string[],
        })),
      ),
    );
  }

  return makeBanDoc(banConfig('blind', 2), log);
}

describe('the ban stage is on the one undo stack — D-03', () => {
  it('reaches a snake ban', () => {
    const doc = snakeDoc(2);
    expect(canUndo(doc)).toBe(true);
    expect(lastUndoableAction(doc)?.type).toBe(BANS_PLACED);
  });

  it('reaches a blind submission', () => {
    const doc = blindDoc(2);
    expect(canUndo(doc)).toBe(true);
    expect(lastUndoableAction(doc)?.type).toBe(BANS_SUBMITTED);
  });

  it('reaches the reveal', () => {
    const doc = blindDoc(3, true);
    expect(canUndo(doc)).toBe(true);
    expect(lastUndoableAction(doc)?.type).toBe(BANS_REVEALED);
  });

  it('never steps past a ban to draft/started — Pitfall 8', () => {
    // The failure mode stated as an assertion. With a ban action on neither list,
    // `lastUndoableAction` walks to `draft/started`, `isUndoable` refuses it, and the
    // answer is `null` — a dead button on the stage D-03 calls the correction path for
    // the phase's primary input method.
    // `not.toBe(DRAFT_STARTED)` alone would pass VACUOUSLY against a build with no ban
    // arms at all, because the answer there is `null` — which is the defect. The
    // non-null assertion is what makes this test fail for the right reason.
    for (const doc of [snakeDoc(1), blindDoc(1), blindDoc(3, true)]) {
      expect(lastUndoableAction(doc)).not.toBeNull();
      expect(lastUndoableAction(doc)?.type).not.toBe(DRAFT_STARTED);
      expect(undoLast(doc).log.some((action) => action.type === DRAFT_STARTED)).toBe(true);
    }
  });

  it('removes nothing when only schedule/compiled and draft/started remain', () => {
    // The boot state of a ban stage, and the state every undo walks back down to. The
    // deny-list is what stops the next press un-starting the tournament.
    const doc = makeBanDoc(banConfig('snake', 2), banOpeningLog());
    expect(canUndo(doc)).toBe(false);
    expect(undoRemoval(doc)).toBeNull();
    expect(undoLast(doc).log).toHaveLength(2);
  });

  it('refuses to un-draw the pool even though D-11 writes it LAST', () => {
    // The `NEVER_UNDONE` invariant doing more work than it was written for. In blind and
    // snake `pool/built` is the most recent entry at exactly the moment a host is most
    // likely to press `Undo last move`.
    const revealed = blindDoc(3, true);
    const drawn = makeBanDoc(
      revealed.config,
      append(revealed.log, poolBuilt(POOL, CONFIG.rosterVersion, CONFIG.rosterChecksum, 7, 0)),
    );

    expect(lastUndoableAction(drawn)?.type).toBe(BANS_REVEALED);
    expect(undoLast(drawn).log.some((action) => action.type === POOL_BUILT)).toBe(true);
  });

  it('walks the whole stage back and then stops', () => {
    let doc = snakeDoc(3);
    for (let step = 0; step < 3; step++) doc = undoLast(doc);

    expect(canUndo(doc)).toBe(false);
    expect(doc.log).toHaveLength(2);
  });
});

describe('undoRemoval over a ban', () => {
  it('describes a snake ban without carrying the species id', () => {
    // `monId` is "the species returning to the POOL" and no pool exists here. Leaving it
    // null is defence in depth behind the exhaustive announcement: even a weakened guard
    // has no name to interpolate.
    const removal = undoRemoval(snakeDoc(2));

    expect(removal?.kind).toBe('banPlaced');
    expect(removal?.playerId).toBe('p2');
    expect(removal?.monId).toBeNull();
    expect(removal?.outMonId).toBeNull();
    expect(removal?.cardValue).toBeNull();
    expect(removal?.swapRound).toBeNull();
    expect(removal?.round).toBe(1);
    expect(removal?.removedCount).toBe(1);
  });

  it('describes a blind submission without carrying any of the species ids', () => {
    const removal = undoRemoval(blindDoc(2));

    expect(removal?.kind).toBe('banSubmission');
    expect(removal?.playerId).toBe('p2');
    expect(removal?.monId).toBeNull();
    expect(removal?.outMonId).toBeNull();
    expect(removal?.round).toBe(1);
    expect(removal?.removedCount).toBe(1);
  });

  it('describes the reveal, which belongs to no player', () => {
    const removal = undoRemoval(blindDoc(3, true));

    expect(removal?.kind).toBe('banReveal');
    expect(removal?.monId).toBeNull();
    expect(removal?.outMonId).toBeNull();
    expect(removal?.round).toBe(1);
    expect(removal?.removedCount).toBe(1);
  });

  it('reports round 1 for every ban kind, on the pass precedent', () => {
    // A ban belongs to no PICK round. `'pass'` reports `config.rounds` so a caller
    // comparing against the current round hears "no round was crossed"; a ban reports 1
    // for the same reason, and the confirm is forced explicitly rather than by that
    // comparison.
    for (const doc of [snakeDoc(1), blindDoc(1), blindDoc(3, true)]) {
      expect(undoRemoval(doc)?.round).toBe(1);
    }
  });
});

describe('which ban undos ask first', () => {
  it('confirms a blind submission, because it removes what the host cannot see', () => {
    const doc = blindDoc(2);
    const crossing = undoCrossesRoundBoundary(doc, fold(doc));

    expect(crossing?.kind).toBe('banSubmission');
    expect(crossing?.crosses).toBe(true);
  });

  it('confirms the reveal, because un-revealing cannot un-read', () => {
    const doc = blindDoc(3, true);
    const crossing = undoCrossesRoundBoundary(doc, fold(doc));

    expect(crossing?.kind).toBe('banReveal');
    expect(crossing?.crosses).toBe(true);
  });

  it('never confirms a snake ban, because reversing it is visible', () => {
    // Same category as a pick: the ban is on the board and the undo shows itself. D-08's
    // no-confirm posture holds.
    const doc = snakeDoc(2);
    const crossing = undoCrossesRoundBoundary(doc, fold(doc));

    expect(crossing?.kind).toBe('banPlaced');
    expect(crossing?.crosses).toBe(false);
  });

  it('sets the two blind kinds explicitly rather than by a round comparison', () => {
    // A ban reports round 1 and `selectCurrentRound` answers 1 during the stage, so
    // `removed.round < currentRound` is FALSE for every ban. A comparison-driven
    // implementation would silently skip the confirm the whole design depends on.
    const doc = blindDoc(2);
    const crossing = undoCrossesRoundBoundary(doc, fold(doc));

    expect(crossing?.removedRound).toBe(1);
    expect(crossing?.currentRound).toBe(1);
    expect(crossing?.crosses).toBe(true);
  });
});

describe('what a ban undo actually removes', () => {
  it('takes one player’s whole allotment and no other player’s', () => {
    // D-05 makes the lock-in ONE act, so undo walks back one act. Per-ban removal would
    // take one invisible ban out of two invisible bans.
    const before = fold(blindDoc(3));
    expect(before.banSubmissions).toHaveLength(3);

    const after = fold(undoLast(blindDoc(3)));
    expect(after.banSubmissions).toHaveLength(2);
    expect(after.banSubmissions.map((entry) => entry.playerId)).toEqual(['p1', 'p2']);
  });

  it('leaves every submission standing when the reveal comes off — D-23', () => {
    // The load-bearing one. Undoing the reveal removes the `bans/revealed` entry ONLY;
    // the stage returns to the designed destination `{m} of {m} entered — Reveal bans`.
    const doc = blindDoc(3, true);
    const after = fold(undoLast(doc));

    expect(after.banSubmissions).toHaveLength(3);
    expect(after.bansRevealed).toBeNull();
    expect(selectBanStageState(after)).toBe('blindLocked');
  });

  it('returns the snake clock to the player whose ban came off', () => {
    const doc = snakeDoc(2);
    expect(selectBanTurn(fold(doc))?.playerId).toBe('p3');

    const after = fold(undoLast(doc));
    expect(after.banPlacements).toHaveLength(1);
    expect(selectBanTurn(after)?.playerId).toBe('p2');
  });

  it('re-folds rather than reversing, at every cut point of a snake stage', () => {
    // The property the whole file rests on, restated for the stage: undo is a log-prefix
    // re-fold, never an inverse patch.
    for (let placed = 1; placed <= 6; placed++) {
      expect(fold(undoLast(snakeDoc(placed))), `${placed} placed`).toEqual(
        fold(snakeDoc(placed - 1)),
      );
    }
  });
});

// ---------------------------------------------------------------------------
// The tournament actions on the ONE stack — D-12.
//
// Pitfall 6 is what the first test here exists for, and it has bitten this codebase once
// already: `isUndoable` is a deny-list PLUS an allow-list, so a type in NEITHER is
// silently stepped past — usually onto `draft/started`, which the deny-list correctly
// refuses, leaving `Undo last move` enabled and doing nothing at all. The
// `UndoRemoval.kind` exhaustiveness check catches a missing ANNOUNCEMENT at compile time
// and cannot catch this, so it is asserted per type.
// ---------------------------------------------------------------------------

/** A finished draft: twelve picks, both teams full. Every tournament action follows one. */
function completedDraft(): Action[] {
  return withPicks(openingLog(), 12);
}

const NEXT_SEQ = 14;

/** One tournament action on top of a finished draft. */
function tournamentDoc(...intents: readonly Intent[]): TournamentDoc {
  const log = completedDraft();
  intents.forEach((intent, offset) => log.push(stamp(intent, NEXT_SEQ + offset)));
  return makeDoc(log);
}

const TOURNAMENT_CASES: [string, string, Intent][] = [
  ['match', TOURNAMENT_MATCH_RECORDED, matchRecorded('rr:0:1', 'p1', 'p2', 1, 0, 0)],
  // `causedBySeq: 999` names nothing in this log, so the void stands alone and this case
  // stays about the kind rather than about the pairing.
  ['void', TOURNAMENT_RESULTS_VOIDED, resultsVoided([13], 999)],
  ['cut', TOURNAMENT_CUT_TAKEN, cutTaken(['p1', 'p2'])],
  ['tiebreak', TOURNAMENT_TIEBREAK_ORDERED, tiebreakOrdered(['p1', 'p2'])],
  ['reopen', TOURNAMENT_REOPENED, reopened()],
];

describe('undo — the tournament actions join the one stack', () => {
  it.each(TOURNAMENT_CASES)('%s: is undoable rather than stepped past', (_kind, type, intent) => {
    const doc = tournamentDoc(intent);

    // The failure this catches is the SILENT one: a type in neither list leaves this
    // answering with the last pick instead, and `Undo last move` removes the wrong thing.
    expect(lastUndoableAction(doc)?.type).toBe(type);
    expect(canUndo(doc)).toBe(true);
  });

  it.each(TOURNAMENT_CASES)('%s: reports that kind and removes one entry', (kind, _type, intent) => {
    const removal = undoRemoval(tournamentDoc(intent));

    expect(removal?.kind).toBe(kind);
    expect(removal?.removedCount).toBe(1);
  });

  it.each(TOURNAMENT_CASES)('%s: reports config.rounds as its round', (_kind, _type, intent) => {
    // All five happen AFTER the draft, so no pick round was crossed. `config.rounds` is
    // where the draft is standing, which makes a caller's comparison answer honestly.
    expect(undoRemoval(tournamentDoc(intent))?.round).toBe(CONFIG.rounds);
  });

  it('still refuses the three origination actions', () => {
    // The deny-list is unchanged by this phase, and the allow-list growing has not made
    // it reachable — the argument `NEVER_UNDONE`'s own comment makes, re-asserted.
    expect(canUndo(makeDoc(openingLog()))).toBe(false);
  });

  it('restores the superseded result when a correction is undone', () => {
    const matchId = 'rr:0:1';
    const before = tournamentDoc(matchRecorded(matchId, 'p1', 'p2', 1, 0, 3));
    const corrected = tournamentDoc(
      matchRecorded(matchId, 'p1', 'p2', 1, 0, 3),
      matchRecorded(matchId, 'p2', 'p1', 1, 0, 5),
    );

    expect(fold(corrected).matchResults[0]?.winnerId).toBe('p2');
    // By RE-FOLDING, not by an inverse: the earlier entry was never removed from the log,
    // so dropping the correction is all it takes for the fold to answer with it again.
    expect(fold(undoLast(corrected))).toEqual(fold(before));
  });
});

// ---------------------------------------------------------------------------
// Which tournament undos ask first — D-17.
//
// The sibling of `which ban undos ask first` above, and it exists for the same reason
// stated one layer down: `ALWAYS_CONFIRM_KINDS` is a list precisely because the round
// comparison answers `false` for its members. A match reports `config.rounds` and the
// draft stands on `config.rounds` once it is over, so a comparison-driven implementation
// skips the dialog exactly where D-17 needs it — and `Ctrl+Z` is registered on `document`,
// so "skipped" means one keystroke.
//
// `canApply`'s side of this agreement is asserted in `tests/core/reduce.test.ts`, which
// covers the `tournamentLocked` rejection at every `tournament/*` arm. What is under test
// here is that undo no longer answers the opposite question.
// ---------------------------------------------------------------------------

describe('which tournament undos ask first', () => {
  const FINAL = 'br:1:1';

  /** A two-seed cut and the one match it produces, which IS the final. */
  function finishedDoc(): TournamentDoc {
    return tournamentDoc(cutTaken(['p1', 'p2']), matchRecorded(FINAL, 'p1', 'p2', 1, 0, 3));
  }

  it('confirms the recorded final, which no other write path would let through', () => {
    const doc = finishedDoc();
    const crossing = undoCrossesRoundBoundary(doc, fold(doc));

    expect(crossing?.kind).toBe('match');
    expect(crossing?.crosses).toBe(true);
  });

  it('sets it explicitly rather than by a round comparison', () => {
    // The two rounds are EQUAL, so `removed.round < currentRound` is false. This is the
    // assertion that fails first if `'match'` is ever taken back off the list and left to
    // the arithmetic.
    const doc = finishedDoc();
    const crossing = undoCrossesRoundBoundary(doc, fold(doc));

    expect(crossing?.removedRound).toBe(crossing?.currentRound);
    expect(crossing?.crosses).toBe(true);
  });

  it('names the winner, who is the one player the dialog can name truthfully', () => {
    const doc = finishedDoc();
    expect(undoCrossesRoundBoundary(doc, fold(doc))?.playerId).toBe('p1');
  });

  it('confirms a round-robin result too, not only the one that finished it', () => {
    // The rule is about the KIND, not about whether this particular result happened to
    // crown anybody. A host correcting a mid-tournament result gets the same question.
    const doc = tournamentDoc(matchRecorded('rr:0:1', 'p1', 'p2', 1, 0, 3));
    const crossing = undoCrossesRoundBoundary(doc, fold(doc));

    expect(crossing?.kind).toBe('match');
    expect(crossing?.crosses).toBe(true);
  });

  it('leaves a pick in the current round unconfirmed', () => {
    // D-08's no-confirm posture is untouched by this. The cheap case stays cheap.
    const doc = makeDoc(withPicks(openingLog(), 3));
    expect(undoCrossesRoundBoundary(doc, fold(doc))?.crosses).toBe(false);
  });
});

describe('undo — a correction comes back in one step — D-10, D-12', () => {
  const SEMI = 'br:1:1';
  const FINAL = 'br:2:1';

  /** A semi and a final recorded, and nothing corrected yet. */
  function played(): TournamentDoc {
    return tournamentDoc(
      matchRecorded(SEMI, 'p1', 'p2', 1, 0, 0),
      matchRecorded(FINAL, 'p1', 'p2', 1, 0, 0),
    );
  }

  /** The semi corrected, and the final it invalidated voided by `seq`. */
  function corrected(causedBySeq = NEXT_SEQ + 2): TournamentDoc {
    return tournamentDoc(
      matchRecorded(SEMI, 'p1', 'p2', 1, 0, 0),
      matchRecorded(FINAL, 'p1', 'p2', 1, 0, 0),
      matchRecorded(SEMI, 'p2', 'p1', 1, 0, 0),
      resultsVoided([NEXT_SEQ + 1], causedBySeq),
    );
  }

  it('takes the matchRecorded at causedBySeq with the void', () => {
    expect(undoRemoval(corrected())?.removedCount).toBe(2);
    expect(undoLast(corrected()).log).toHaveLength(played().log.length);
  });

  it('puts the whole correction back in ONE press', () => {
    // The claim D-10 makes, asserted rather than described: after one undo the fold is
    // the fold from before the correction — voided final restored, semi back to p1.
    expect(fold(undoLast(corrected()))).toEqual(fold(played()));
  });

  it('takes only the void when no entry carries that seq', () => {
    // A gapped or imported log is untrusted, and `seq` may legally have gaps — so a
    // missing target is TOLERATED, on `draft/pickUndone`'s precedent, rather than being
    // allowed to make undo remove an unrelated result.
    const orphaned = corrected(9999);

    expect(undoRemoval(orphaned)?.removedCount).toBe(1);
    expect(undoLast(orphaned).log).toHaveLength(orphaned.log.length - 1);
    // The correction itself survives, because nothing paired it.
    expect(fold(undoLast(orphaned)).matchResults.find((r) => r.matchId === SEMI)?.winnerId).toBe(
      'p2',
    );
  });

  it('pairs by seq rather than by adjacency', () => {
    // `causedBySeq` makes the search EXACT, which is the concern `triggeringCardIndex`
    // records about its own. A tiebreak order sitting between the two must not break the
    // pairing, and must not be taken instead.
    const log = completedDraft();
    log.push(stamp(matchRecorded(SEMI, 'p1', 'p2', 1, 0, 0), NEXT_SEQ));
    log.push(stamp(matchRecorded(FINAL, 'p1', 'p2', 1, 0, 0), NEXT_SEQ + 1));
    log.push(stamp(matchRecorded(SEMI, 'p2', 'p1', 1, 0, 0), NEXT_SEQ + 2));
    log.push(stamp(tiebreakOrdered(['p1', 'p2']), NEXT_SEQ + 3));
    log.push(stamp(resultsVoided([NEXT_SEQ + 1], NEXT_SEQ + 2), NEXT_SEQ + 4));

    const after = undoLast(makeDoc(log));

    expect(after.log.map((action) => action.seq)).toEqual([
      ...Array.from({ length: 14 }, (_unused, index) => index),
      NEXT_SEQ,
      NEXT_SEQ + 1,
      NEXT_SEQ + 3,
    ]);
  });
});
