/**
 * The reducer — SHEL-05.
 *
 * Zero mocks in this file, by construction. `apply`, `canApply` and `fold` are pure
 * functions of their arguments, so there is nothing ambient to stub. That property is
 * the reason for the core/adapters split, and it should stay visible here: if a test
 * below ever needs a fake clock or a fake id generator, an ambient value has leaked
 * into the core and `npm run check:pure` should already have failed.
 */

import { describe, expect, it } from 'vitest';

import {
  bansPlaced,
  bansRevealed,
  bansSubmitted,
  CARDS_PLAYED,
  cardsPlayed,
  DRAFT_PICK_MADE,
  draftStarted,
  isScheduleCompiledAction,
  ORDER_RESOLVED,
  orderResolved,
  pickMade,
  pickUndone,
  poolBuilt,
  SCHEDULE_COMPILED,
  scheduleCompiled,
  type Action,
  type AnyAction,
  type Intent,
  type RoundSpec,
} from '../../src/core/actions';
import { resolvePickOrder } from '../../src/core/cards';
import {
  initialState,
  SCHEMA_VERSION,
  type TournamentConfig,
  type TournamentDoc,
} from '../../src/core/model';
import { apply, canApply, fold } from '../../src/core/reduce';
import {
  selectAvailablePool,
  selectCardPlayOrder,
  selectCardsPlayedThisRound,
  selectCurrentRound,
  selectCurrentTurn,
  selectHand,
  selectIsComplete,
  selectPickCount,
  selectResolvedOrder,
  selectRoundKind,
  selectSchedule,
  selectTeams,
} from '../../src/core/selectors';

// ---------------------------------------------------------------------------
// Fixtures
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

/** All six rounds open, which is what `compile` emits for this config's `count: 0` rule. */
const OPEN_SCHEDULE: RoundSpec[] = Array.from({ length: CONFIG.rounds }, (_, position) => ({
  index: position + 1,
  kind: 'open' as const,
}));

/** Two Mega rounds first, the canonical order for `megasRequiredPerTeam: 2`. */
const MEGA_FIRST_SCHEDULE: RoundSpec[] = [
  { index: 1, kind: 'mega' },
  { index: 2, kind: 'mega' },
  { index: 3, kind: 'open' },
  { index: 4, kind: 'open' },
  { index: 5, kind: 'open' },
  { index: 6, kind: 'open' },
];

/**
 * `pool/built`, `schedule/compiled`, `draft/started` — exactly as `createTournament` emits
 * them, and in that order. The schedule sits between the two because it is meaningful only
 * against a pool, and because `canApply(DRAFT_STARTED)` now refuses to originate without one.
 */
function openingLog(): Action[] {
  return [
    stamp(poolBuilt(POOL, CONFIG.rosterVersion, CONFIG.rosterChecksum, 7, 0), 0),
    stamp(scheduleCompiled(OPEN_SCHEDULE), 1),
    stamp(draftStarted(ORDER, 9), 2),
  ];
}

/** A Phase 2 log: no `schedule/compiled`, because that action did not exist when it was written. */
function migratedOpeningLog(): Action[] {
  return [
    stamp(poolBuilt(POOL, CONFIG.rosterVersion, CONFIG.rosterChecksum, 7, 0), 0),
    stamp(draftStarted(ORDER, 9), 1),
  ];
}

/**
 * `count` picks with every round's cards played and resolved BEFORE that round's picks —
 * the order the app actually writes them, and the shape a pick-legality fixture now needs.
 *
 * Both players play the round's own number, so each round ties on value and `seq` resolves
 * it back into `state.order`. The pick order is therefore the same strict alternation the
 * Phase 2 fixtures assumed, and every assertion about WHO is on the clock keeps its
 * meaning — what changes is only that the round has a recorded order to read it from.
 *
 * It stops the moment `count` picks exist, which leaves the NEXT round unbid: a fixture is
 * either mid-picking or mid-card-phase, never both, exactly as the app is.
 */
function withCardedPicks(log: Action[], count: number): Action[] {
  const extended = [...log];
  const push = (intent: Intent): void => {
    extended.push(stamp(intent, nextSeqOf(extended)));
  };

  let pickIndex = 0;
  for (let round = 1; round <= CONFIG.rounds; round++) {
    for (const playerId of ORDER) push(cardsPlayed({ playerId, value: round, round }));
    push(orderResolved(round, ORDER));

    for (const playerId of ORDER) {
      if (pickIndex >= count) return extended;
      push(pickMade({ playerId, monId: POOL[pickIndex] as string, round, pickIndex }));
      pickIndex += 1;
    }
  }

  return extended;
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
// fold
// ---------------------------------------------------------------------------

describe('fold', () => {
  it('returns the initial state derived from config when the log is empty', () => {
    expect(fold(makeDoc())).toEqual(initialState(CONFIG));
  });

  it('produces deeply equal state when the same log is folded twice', () => {
    const doc = makeDoc(withPicks(openingLog(), 12));
    expect(fold(doc)).toEqual(fold(doc));
  });

  it('does not mutate the document it folds', () => {
    const doc = makeDoc(withPicks(openingLog(), 5));
    const before = JSON.parse(JSON.stringify(doc)) as TournamentDoc;
    fold(doc);
    expect(doc).toEqual(before);
  });

  it('folding a log prefix equals the state before the removed action was applied', () => {
    // This is the property that makes undo a re-fold rather than an inverse patch.
    // If it ever fails, `apply` has become order-dependent in a way the log cannot
    // express, and plan 01-07's undo is unimplementable on top of it.
    const full = withPicks(openingLog(), 12);

    for (let cut = 0; cut <= full.length; cut++) {
      const prefix = full.slice(0, cut);
      const incremental = prefix.reduce(apply, initialState(CONFIG));
      expect(fold(makeDoc(prefix)), `prefix of length ${cut}`).toEqual(incremental);
    }
  });

  it('advancing incrementally with apply equals re-folding the whole log', () => {
    // The store advances incrementally on dispatch; a reload re-folds from scratch.
    // Those two paths must not be able to disagree.
    const full = withPicks(openingLog(), 12);
    let incremental = initialState(CONFIG);
    for (const action of full) {
      incremental = apply(incremental, action);
      expect(incremental).toEqual(fold(makeDoc(full.slice(0, action.seq + 1))));
    }
  });
});

// ---------------------------------------------------------------------------
// apply
// ---------------------------------------------------------------------------

describe('apply', () => {
  it('materializes the pool ids, regulation and checksum from pool/built', () => {
    const state = fold(makeDoc([stamp(poolBuilt(POOL, 'mb', 'abc123', 7, 0), 0)]));
    expect(state.poolIds).toEqual(POOL);
    expect(state.rosterVersion).toBe('mb');
    expect(state.rosterChecksum).toBe('abc123');
  });

  it('reads the starting order from the log rather than re-deriving it', () => {
    // Pattern 5. The order was resolved from the seed at creation and recorded; a
    // replay must read the recorded result, not roll again.
    const state = fold(makeDoc([...openingLog().slice(0, 1), stamp(draftStarted(['p2', 'p1'], 9), 1)]));
    expect(state.order).toEqual(['p2', 'p1']);
  });

  it('moves a picked species out of the available pool and into that player team', () => {
    const state = fold(
      makeDoc([
        ...openingLog(),
        stamp(pickMade({ playerId: 'p1', monId: 'venusaur', round: 1, pickIndex: 0 }), 2),
      ]),
    );

    expect(selectAvailablePool(state)).not.toContain('venusaur');
    expect(selectTeams(state)['p1']).toEqual(['venusaur', null, null, null, null, null]);
    expect(selectTeams(state)['p2']).toEqual([null, null, null, null, null, null]);
  });

  it('returns the state unchanged for an unknown action type', () => {
    // Forward compatibility, sync rule 11: a document written by a newer build must
    // fold on this one rather than crash it.
    const state = fold(makeDoc(openingLog()));
    const future = {
      type: 'draft/somethingFromTheFuture',
      seq: 2,
      at: CREATED_AT,
      actorId: 'host',
    } as AnyAction;

    expect(apply(state, future)).toBe(state);
  });

  it('returns the state unchanged for a known type carrying a malformed payload', () => {
    const state = fold(makeDoc(openingLog()));
    const malformed = {
      type: DRAFT_PICK_MADE,
      seq: 2,
      at: CREATED_AT,
      actorId: 'host',
    } as unknown as AnyAction;

    expect(apply(state, malformed)).toBe(state);
  });

  it('never throws for an expected failure — rejection is canApply’s job', () => {
    const state = fold(makeDoc(openingLog()));
    const notInPool = stamp(
      pickMade({ playerId: 'p1', monId: 'missingno', round: 1, pickIndex: 0 }),
      2,
    );
    const outOfTurn = stamp(
      pickMade({ playerId: 'p2', monId: 'venusaur', round: 1, pickIndex: 0 }),
      2,
    );

    expect(() => apply(state, notInPool)).not.toThrow();
    expect(() => apply(state, outOfTurn)).not.toThrow();
    expect(() => apply(state, stamp(pickUndone(99), 2))).not.toThrow();
  });

  it('does not mutate the state it was given', () => {
    const state = fold(makeDoc(openingLog()));
    const before = JSON.parse(JSON.stringify(state)) as unknown;

    apply(state, stamp(pickMade({ playerId: 'p1', monId: 'venusaur', round: 1, pickIndex: 0 }), 2));

    expect(JSON.parse(JSON.stringify(state))).toEqual(before);
  });

  it('completes a full twelve-pick draft, six per player', () => {
    const state = fold(makeDoc(withPicks(openingLog(), 12)));

    expect(selectPickCount(state)).toBe(12);
    expect(selectIsComplete(state)).toBe(true);
    expect(selectCurrentTurn(state)).toBeNull();
    expect(selectTeams(state)['p1']).toEqual([
      'venusaur',
      'blastoise',
      'rotomwash',
      'tyranitar',
      'dragonite',
      'starmie',
    ]);
    expect(selectTeams(state)['p2']).toEqual([
      'charizard',
      'garchomp',
      'skarmory',
      'gardevoir',
      'meganium',
      'victreebel',
    ]);
    expect(selectAvailablePool(state)).toEqual(['feraligatr']);
  });
});

// ---------------------------------------------------------------------------
// draft/pickUndone — reducible from day one (sync rule 15)
// ---------------------------------------------------------------------------

describe('apply draft/pickUndone', () => {
  it('retracts the pick recorded by the targeted action', () => {
    // Carded picks, because the assertion below reads the turn: a pick that leaves the
    // draft mid-round needs that round's order on the log for anybody to be on the clock.
    const log = withCardedPicks(openingLog(), 3);
    const lastPickSeq = (log[log.length - 1] as Action).seq;
    const undone = [...log, stamp(pickUndone(lastPickSeq), log.length)];

    const state = fold(makeDoc(undone));

    expect(selectPickCount(state)).toBe(2);
    expect(selectAvailablePool(state)).toContain('blastoise');
    expect(selectCurrentTurn(state)).toEqual({ round: 2, playerId: 'p1', pickIndex: 2 });
  });

  it('equals the state produced by folding the log without that action', () => {
    // Nothing dispatches pickUndone until plan 01-07, and the store may implement undo
    // as a pop-and-refold. This equality is what makes popping an optimization rather
    // than a second, divergent code path.
    const log = withPicks(openingLog(), 4);
    const lastPickSeq = (log[log.length - 1] as Action).seq;

    const compensated = fold(makeDoc([...log, stamp(pickUndone(lastPickSeq), log.length)]));
    const popped = fold(makeDoc(log.slice(0, -1)));

    expect(compensated).toEqual(popped);
  });

  it('is inert when it targets a sequence that recorded no pick', () => {
    const log = withPicks(openingLog(), 2);
    const state = fold(makeDoc(log));
    expect(apply(state, stamp(pickUndone(999), log.length))).toBe(state);
  });
});

// ---------------------------------------------------------------------------
// canApply
// ---------------------------------------------------------------------------

describe('canApply', () => {
  /*
    These fixtures resolve round 1's cards before the pick under test, and that is a
    requirement rather than ceremony: a pick is not legal until the round it belongs to has
    an order to be on the clock of. Their own reason — `cardsNotResolved` — has its own
    block further down, so the cases here go on testing what they were written to test.
  */
  it('accepts a legal pick', () => {
    const state = fold(makeDoc(withCardedPicks(openingLog(), 0)));
    const action = stamp(
      pickMade({ playerId: 'p1', monId: 'venusaur', round: 1, pickIndex: 0 }),
      20,
    );

    expect(canApply(state, action)).toEqual({ ok: true });
  });

  it('rejects a species that is not in the current available pool', () => {
    const state = fold(makeDoc(withCardedPicks(openingLog(), 1)));
    // p2 is on the clock; venusaur has already gone.
    const action = stamp(
      pickMade({ playerId: 'p2', monId: 'venusaur', round: 1, pickIndex: 1 }),
      20,
    );

    expect(canApply(state, action)).toEqual({ ok: false, reason: 'notInPool' });
  });

  it('rejects a species that was never in the pool at all', () => {
    const state = fold(makeDoc(withCardedPicks(openingLog(), 0)));
    const action = stamp(
      pickMade({ playerId: 'p1', monId: 'missingno', round: 1, pickIndex: 0 }),
      20,
    );

    expect(canApply(state, action)).toEqual({ ok: false, reason: 'notInPool' });
  });

  it('rejects a pick by a player who is not on the clock', () => {
    const state = fold(makeDoc(withCardedPicks(openingLog(), 0)));
    const action = stamp(
      pickMade({ playerId: 'p2', monId: 'venusaur', round: 1, pickIndex: 0 }),
      20,
    );

    expect(canApply(state, action)).toEqual({ ok: false, reason: 'notYourTurn' });
  });

  it('rejects any pick once twelve picks exist', () => {
    const state = fold(makeDoc(withPicks(openingLog(), 12)));
    const action = stamp(
      pickMade({ playerId: 'p1', monId: 'feraligatr', round: 7, pickIndex: 12 }),
      14,
    );

    expect(canApply(state, action)).toEqual({ ok: false, reason: 'draftComplete' });
  });

  it('rejects a pick before the draft has started', () => {
    const state = fold(makeDoc([stamp(poolBuilt(POOL, 'mb', 'abc123', 7, 0), 0)]));
    const action = stamp(
      pickMade({ playerId: 'p1', monId: 'venusaur', round: 1, pickIndex: 0 }),
      1,
    );

    expect(canApply(state, action)).toEqual({ ok: false, reason: 'draftNotStarted' });
  });

  it('rejects a pick that claims a slot other than the one on the clock', () => {
    // T-01-29. The store stamps round and pickIndex from the current turn, so this can
    // only arrive from an edited or imported log — which is exactly the path that must
    // not be able to write a pick into round 4 while round 1 is live.
    const state = fold(makeDoc(withCardedPicks(openingLog(), 0)));

    expect(
      canApply(
        state,
        stamp(pickMade({ playerId: 'p1', monId: 'venusaur', round: 4, pickIndex: 0 }), 20),
      ),
    ).toEqual({ ok: false, reason: 'wrongSlot' });

    expect(
      canApply(
        state,
        stamp(pickMade({ playerId: 'p1', monId: 'venusaur', round: 1, pickIndex: 7 }), 20),
      ),
    ).toEqual({ ok: false, reason: 'wrongSlot' });
  });

  it('rejects a second pool/built and a second draft/started', () => {
    const state = fold(makeDoc(openingLog()));

    expect(canApply(state, stamp(poolBuilt(POOL, 'mb', 'abc123', 7, 0), 2))).toEqual({
      ok: false,
      reason: 'poolAlreadyBuilt',
    });
    expect(canApply(state, stamp(draftStarted(ORDER, 9), 2))).toEqual({
      ok: false,
      reason: 'draftAlreadyStarted',
    });
  });

  it('rejects an empty pool and a draft/started that names an unknown player', () => {
    const empty = initialState(CONFIG);

    expect(canApply(empty, stamp(poolBuilt([], 'mb', 'abc123', 7, 0), 0))).toEqual({
      ok: false,
      reason: 'emptyPool',
    });
    expect(
      canApply(
        fold(
          makeDoc([
            stamp(poolBuilt(POOL, 'mb', 'abc123', 7, 0), 0),
            stamp(scheduleCompiled(OPEN_SCHEDULE), 1),
          ]),
        ),
        stamp(draftStarted(['p1', 'ghost'], 9), 2),
      ),
    ).toEqual({ ok: false, reason: 'unknownPlayer' });
  });

  it('rejects an undo that targets no recorded pick', () => {
    const state = fold(makeDoc(withPicks(openingLog(), 2)));

    expect(canApply(state, stamp(pickUndone(999), 4))).toEqual({
      ok: false,
      reason: 'nothingToUndo',
    });
    expect(canApply(state, stamp(pickUndone(3), 4))).toEqual({ ok: true });
  });

  it('rejects an unknown action type rather than silently admitting it to the log', () => {
    // `apply` tolerates the unknown so an imported document still folds. `canApply`
    // refuses it so this build never *originates* one.
    const state = fold(makeDoc(openingLog()));
    const future = {
      type: 'draft/somethingFromTheFuture',
      seq: 2,
      at: CREATED_AT,
      actorId: 'host',
    } as AnyAction;

    expect(canApply(state, future)).toEqual({ ok: false, reason: 'unknownAction' });
  });

  it('does not mutate the state it validates', () => {
    const state = fold(makeDoc(openingLog()));
    const before = JSON.parse(JSON.stringify(state)) as unknown;

    canApply(state, stamp(pickMade({ playerId: 'p1', monId: 'venusaur', round: 1, pickIndex: 0 }), 2));

    expect(JSON.parse(JSON.stringify(state))).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// schedule/compiled — RULE-02
// ---------------------------------------------------------------------------

/** Just the pool, which is the state `schedule/compiled` is legal against. */
function pooledState() {
  return fold(makeDoc([stamp(poolBuilt(POOL, CONFIG.rosterVersion, CONFIG.rosterChecksum, 7, 0), 0)]));
}

describe('isScheduleCompiledAction', () => {
  function stamped(rounds: unknown): AnyAction {
    return {
      type: SCHEDULE_COMPILED,
      rounds,
      seq: 1,
      at: CREATED_AT,
      actorId: 'host',
    } as unknown as AnyAction;
  }

  it('accepts a well-formed schedule', () => {
    expect(isScheduleCompiledAction(stamp(scheduleCompiled(MEGA_FIRST_SCHEDULE), 1))).toBe(true);
  });

  it('accepts an empty schedule — length is canApply’s question, not the guard’s', () => {
    expect(isScheduleCompiledAction(stamped([]))).toBe(true);
  });

  it('rejects a missing rounds field and one that is not an array', () => {
    expect(isScheduleCompiledAction(stamped(undefined))).toBe(false);
    expect(isScheduleCompiledAction(stamped('mega,mega,open'))).toBe(false);
    expect(isScheduleCompiledAction(stamped({ 0: { index: 1, kind: 'mega' } }))).toBe(false);
  });

  it('rejects a member whose index is not an integer', () => {
    expect(isScheduleCompiledAction(stamped([{ index: 1.5, kind: 'mega' }]))).toBe(false);
    expect(isScheduleCompiledAction(stamped([{ index: '1', kind: 'mega' }]))).toBe(false);
  });

  it('rejects a kind this build has no filter for', () => {
    // A hand-edited file must not be able to introduce a round type the pool filter, the
    // swap predicate and the export path have never heard of — T-03-07.
    expect(isScheduleCompiledAction(stamped([{ index: 1, kind: 'legendary' }]))).toBe(false);
    expect(isScheduleCompiledAction(stamped([{ index: 1, kind: null }]))).toBe(false);
  });

  it('rejects a member whose index disagrees with its array position', () => {
    expect(
      isScheduleCompiledAction(
        stamped([
          { index: 1, kind: 'mega' },
          { index: 3, kind: 'open' },
        ]),
      ),
    ).toBe(false);
    expect(isScheduleCompiledAction(stamped([{ index: 0, kind: 'open' }]))).toBe(false);
  });
});

describe('apply schedule/compiled', () => {
  it('writes the schedule into state', () => {
    const state = apply(pooledState(), stamp(scheduleCompiled(MEGA_FIRST_SCHEDULE), 1));
    expect(state.schedule).toEqual(MEGA_FIRST_SCHEDULE);
  });

  it('writes a fresh copy, so the action’s array is never shared with state', () => {
    const action = stamp(scheduleCompiled(MEGA_FIRST_SCHEDULE), 1);
    expect(isScheduleCompiledAction(action)).toBe(true);
    if (!isScheduleCompiledAction(action)) return;

    const state = apply(pooledState(), action);

    expect(state.schedule).not.toBe(action.rounds);
    expect(state.schedule[0]).not.toBe(action.rounds[0]);
    // And the creator did not alias the fixture either.
    expect(action.rounds).not.toBe(MEGA_FIRST_SCHEDULE);
    expect(action.rounds[0]).not.toBe(MEGA_FIRST_SCHEDULE[0]);
  });

  it('returns the state unchanged for a malformed payload — apply stays total', () => {
    const before = pooledState();
    const malformed = {
      type: SCHEDULE_COMPILED,
      seq: 1,
      at: CREATED_AT,
      actorId: 'host',
    } as unknown as AnyAction;

    expect(apply(before, malformed)).toBe(before);
  });

  it('is read back by the schedule selectors after a fold', () => {
    const state = fold(
      makeDoc([
        stamp(poolBuilt(POOL, CONFIG.rosterVersion, CONFIG.rosterChecksum, 7, 0), 0),
        stamp(scheduleCompiled(MEGA_FIRST_SCHEDULE), 1),
        stamp(draftStarted(ORDER, 9), 2),
      ]),
    );

    expect(selectSchedule(state).map((spec) => spec.kind)).toEqual([
      'mega',
      'mega',
      'open',
      'open',
      'open',
      'open',
    ]);
    expect(selectRoundKind(state, 1)).toBe('mega');
    expect(selectRoundKind(state, 3)).toBe('open');
  });
});

describe('canApply schedule/compiled', () => {
  it('accepts one schedule of the configured length against a built pool', () => {
    expect(canApply(pooledState(), stamp(scheduleCompiled(OPEN_SCHEDULE), 1))).toEqual({ ok: true });
  });

  it('rejects a malformed payload', () => {
    const malformed = {
      type: SCHEDULE_COMPILED,
      rounds: 'six',
      seq: 1,
      at: CREATED_AT,
      actorId: 'host',
    } as unknown as AnyAction;

    expect(canApply(pooledState(), malformed)).toEqual({ ok: false, reason: 'malformedPayload' });
  });

  it('rejects a schedule before the pool exists', () => {
    expect(canApply(initialState(CONFIG), stamp(scheduleCompiled(OPEN_SCHEDULE), 0))).toEqual({
      ok: false,
      reason: 'poolNotBuilt',
    });
  });

  it('rejects a second schedule', () => {
    // D-13: there is exactly one schedule for the life of a document. A mid-draft reorder
    // would need a `schedule/reordered` action, and CONTEXT defers it.
    const state = fold(
      makeDoc([
        stamp(poolBuilt(POOL, CONFIG.rosterVersion, CONFIG.rosterChecksum, 7, 0), 0),
        stamp(scheduleCompiled(OPEN_SCHEDULE), 1),
      ]),
    );

    expect(canApply(state, stamp(scheduleCompiled(MEGA_FIRST_SCHEDULE), 2))).toEqual({
      ok: false,
      reason: 'scheduleAlreadyCompiled',
    });
  });

  it('rejects a schedule once the draft has started', () => {
    const started = fold(makeDoc(migratedOpeningLog()));

    expect(canApply(started, stamp(scheduleCompiled(OPEN_SCHEDULE), 2))).toEqual({
      ok: false,
      reason: 'draftAlreadyStarted',
    });
  });

  it('rejects a schedule whose length is not the configured round count', () => {
    expect(
      canApply(pooledState(), stamp(scheduleCompiled(OPEN_SCHEDULE.slice(0, 4)), 1)),
    ).toEqual({ ok: false, reason: 'malformedSchedule' });

    expect(
      canApply(
        pooledState(),
        stamp(scheduleCompiled([...OPEN_SCHEDULE, { index: 7, kind: 'open' }]), 1),
      ),
    ).toEqual({ ok: false, reason: 'malformedSchedule' });
  });

  it('rejects a schedule whose indices are not contiguous from 1', () => {
    const shifted: RoundSpec[] = OPEN_SCHEDULE.map((spec) => ({
      index: spec.index + 1,
      kind: spec.kind,
    }));

    // `malformedPayload` rather than `malformedSchedule`, and that is the right answer
    // rather than a near miss: `isScheduleCompiledAction` pins index against position, so
    // this never gets as far as being a question about THIS document's schedule. The
    // reason names the check that actually refused it.
    expect(canApply(pooledState(), stamp(scheduleCompiled(shifted), 1))).toEqual({
      ok: false,
      reason: 'malformedPayload',
    });
  });
});

describe('canApply draft/started requires a schedule', () => {
  it('refuses to originate a draft with no compiled schedule', () => {
    const pooled = pooledState();
    expect(canApply(pooled, stamp(draftStarted(ORDER, 9), 1))).toEqual({
      ok: false,
      reason: 'scheduleNotCompiled',
    });
  });

  it('still refuses an unbuilt pool first — the pool check comes before the schedule check', () => {
    expect(canApply(initialState(CONFIG), stamp(draftStarted(ORDER, 9), 0))).toEqual({
      ok: false,
      reason: 'poolNotBuilt',
    });
  });

  it('does not break a migrated schema-2 document, because fold never runs canApply', () => {
    // Origination is guarded; replay deliberately is not. A Phase 2 save has no
    // `schedule/compiled` in its log and must still open.
    const migrated = fold(makeDoc(withPicks(migratedOpeningLog(), 4)));

    expect(migrated.order).toEqual(ORDER);
    expect(migrated.schedule).toEqual([]);
    expect(selectPickCount(migrated)).toBe(4);
    // An empty schedule folds as all-open — what that draft actually ran.
    expect(selectSchedule(migrated).map((spec) => spec.kind)).toEqual([
      'open',
      'open',
      'open',
      'open',
      'open',
      'open',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Serializability — sync rule 1
// ---------------------------------------------------------------------------

describe('the tournament document', () => {
  it('survives a JSON round trip unchanged', () => {
    const doc = makeDoc(withPicks(openingLog(), 12));
    expect(JSON.parse(JSON.stringify(doc))).toEqual(doc);
  });

  it('folds to identical state before and after a JSON round trip', () => {
    const doc = makeDoc(withPicks(openingLog(), 7));
    const reloaded = JSON.parse(JSON.stringify(doc)) as TournamentDoc;
    expect(fold(reloaded)).toEqual(fold(doc));
  });

  it('contains no Date, Map, Set, function, class instance, or undefined', () => {
    const doc = makeDoc(withPicks(openingLog(), 12));
    const offenders: string[] = [];

    const walk = (value: unknown, path: string): void => {
      if (value === null) return;
      const kind = typeof value;
      if (kind === 'function' || kind === 'symbol' || kind === 'bigint' || kind === 'undefined') {
        offenders.push(`${path}: ${kind}`);
        return;
      }
      if (kind !== 'object') return;

      if (value instanceof Date) {
        offenders.push(`${path}: Date`);
        return;
      }
      if (value instanceof Map || value instanceof Set) {
        offenders.push(`${path}: Map or Set`);
        return;
      }

      const branch = value as Record<string, unknown>;
      if (Array.isArray(branch)) {
        (branch as unknown as unknown[]).forEach((item, index) =>
          walk(item, `${path}[${index}]`),
        );
        return;
      }
      if (Object.getPrototypeOf(branch) !== Object.prototype) {
        offenders.push(`${path}: class instance or exotic prototype`);
        return;
      }
      for (const [key, child] of Object.entries(branch)) walk(child, `${path}.${key}`);
    };

    walk(doc, 'doc');
    expect(offenders).toEqual([]);
  });

  it('carries seq, at and actorId on every action', () => {
    // Sync rule 8. Adding these later means migrating every saved tournament.
    const doc = makeDoc(withPicks(openingLog(), 12));

    doc.log.forEach((action, index) => {
      expect(action.seq, `log[${index}].seq`).toBe(index);
      expect(Number.isInteger(action.at), `log[${index}].at`).toBe(true);
      expect(action.actorId, `log[${index}].actorId`).toBe('host');
    });
  });
});

// ---------------------------------------------------------------------------
// cards/played and order/resolved — CARD-01, CARD-03, CARD-06, D-19, D-22
// ---------------------------------------------------------------------------

/** `max(seq) + 1`, the way `store.ts` allocates it. Never `log.length`; gaps are legal. */
function nextSeqOf(log: readonly Action[]): number {
  return log.reduce((highest, action) => Math.max(highest, action.seq), -1) + 1;
}

/**
 * Card plays in that round's play order, one per value.
 *
 * Fewer values than players means a PARTIAL round, which is what the `roundNotComplete`
 * and `notYourTurn` cases need — and what a real round looks like between the first card
 * and the last.
 */
function withCardPlays(log: Action[], round: number, values: readonly number[]): Action[] {
  const extended = [...log];
  const order = selectCardPlayOrder(fold(makeDoc(extended)), round).slice(0, values.length);

  order.forEach((playerId, index) => {
    extended.push(
      stamp(cardsPlayed({ playerId, value: values[index] ?? 1, round }), nextSeqOf(extended)),
    );
  });

  return extended;
}

/** The card plays, then the resolution the last one triggers. */
function withResolvedCardRound(log: Action[], round: number, values: readonly number[]): Action[] {
  const extended = withCardPlays(log, round, values);
  const plays = selectCardsPlayedThisRound(fold(makeDoc(extended)), round);

  extended.push(stamp(orderResolved(round, resolvePickOrder(plays)), nextSeqOf(extended)));
  return extended;
}

describe('apply cards/played', () => {
  it('records the play, carrying the seq of the action that made it', () => {
    const log = [...openingLog(), stamp(cardsPlayed({ playerId: 'p1', value: 3, round: 1 }), 3)];
    const state = fold(makeDoc(log));

    expect(state.cardsPlayed).toEqual([{ playerId: 'p1', value: 3, round: 1, seq: 3 }]);
  });

  it('folds a payload with no value to an unchanged cardsPlayed array', () => {
    // The whole reason the structural guard exists. An imported log that says `cards/played`
    // while carrying no value must fold to "ignored", never to a play of `undefined` that
    // would then be subtracted from somebody's hand.
    const before = fold(makeDoc(openingLog()));
    const malformed = {
      type: CARDS_PLAYED,
      playerId: 'p1',
      round: 1,
      seq: 3,
      at: CREATED_AT + 3,
      actorId: 'host',
    } as unknown as AnyAction;

    expect(apply(before, malformed)).toEqual(before);
    expect(apply(before, malformed).cardsPlayed).toEqual([]);
  });

  it('folds a payload whose playerId is not a string to an unchanged array', () => {
    const before = fold(makeDoc(openingLog()));
    const malformed = {
      type: CARDS_PLAYED,
      playerId: 42,
      value: 3,
      round: 1,
      seq: 3,
      at: CREATED_AT + 3,
      actorId: 'host',
    } as unknown as AnyAction;

    expect(apply(before, malformed).cardsPlayed).toEqual([]);
  });

  it('keeps the plays in log order across rounds', () => {
    const log = withCardPlays(withResolvedCardRound(openingLog(), 1, [4, 2]), 2, [1, 5]);
    const state = fold(makeDoc(log));

    expect(state.cardsPlayed.map((play) => [play.playerId, play.value, play.round])).toEqual([
      ['p1', 4, 1],
      ['p2', 2, 1],
      ['p2', 1, 2],
      ['p1', 5, 2],
    ]);
  });

  it('leaves every hand derived rather than stored', () => {
    const state = fold(makeDoc(withResolvedCardRound(openingLog(), 1, [4, 2])));

    expect(selectHand(state, 'p1')).toEqual([1, 2, 3, 5, 6]);
    expect(selectHand(state, 'p2')).toEqual([1, 3, 4, 5, 6]);
  });

  it('gives every recorded play a distinct seq', () => {
    const log = withCardPlays(withResolvedCardRound(openingLog(), 1, [4, 2]), 2, [1, 5]);
    const seqs = fold(makeDoc(log)).cardsPlayed.map((play) => play.seq);

    expect(new Set(seqs).size).toBe(seqs.length);
  });
});

describe('apply order/resolved', () => {
  it('records the round’s order', () => {
    const state = fold(makeDoc(withResolvedCardRound(openingLog(), 1, [4, 2])));

    // p2 played the lower card, so p2 picks first.
    expect(state.resolvedOrders).toEqual([{ round: 1, order: ['p2', 'p1'] }]);
    expect(selectResolvedOrder(state, 1)).toEqual(['p2', 'p1']);
  });

  it('does not share an array with the log entry it folded from', () => {
    const log = withResolvedCardRound(openingLog(), 1, [4, 2]);
    const state = fold(makeDoc(log));

    state.resolvedOrders[0]?.order.push('p9');

    const entry = log[log.length - 1];
    expect(entry?.type).toBe(ORDER_RESOLVED);
    if (entry === undefined || entry.type !== ORDER_RESOLVED) return;
    expect(entry.order).toEqual(['p2', 'p1']);
  });

  it('replaces nothing when a second resolution for the same round is folded', () => {
    // `apply` is not a validator. A duplicate is `canApply`'s to refuse; here it appends,
    // and the selector answers with the FIRST, so a hand-edited file cannot rewrite a
    // round the room already played by appending a second opinion about it.
    const log = withResolvedCardRound(openingLog(), 1, [4, 2]);
    log.push(stamp(orderResolved(1, ['p1', 'p2']), nextSeqOf(log)));

    const state = fold(makeDoc(log));
    expect(state.resolvedOrders).toHaveLength(2);
    expect(selectResolvedOrder(state, 1)).toEqual(['p2', 'p1']);
  });

  it('folds a payload with no order to an unchanged array', () => {
    const before = fold(makeDoc(openingLog()));
    const malformed = {
      type: ORDER_RESOLVED,
      round: 1,
      seq: 3,
      at: CREATED_AT + 3,
      actorId: 'host',
    } as unknown as AnyAction;

    expect(apply(before, malformed).resolvedOrders).toEqual([]);
  });
});

describe('canApply cards/played', () => {
  const started = fold(makeDoc(openingLog()));

  function attempt(state = started, playerId = 'p1', value = 3, round = 1) {
    return canApply(state, stamp(cardsPlayed({ playerId, value, round }), 99));
  }

  it('accepts the player at the front of the round’s play order', () => {
    expect(attempt()).toEqual({ ok: true });
  });

  it('rejects a payload missing its value', () => {
    const malformed = {
      type: CARDS_PLAYED,
      playerId: 'p1',
      round: 1,
      seq: 99,
      at: CREATED_AT,
      actorId: 'host',
    } as unknown as AnyAction;

    expect(canApply(started, malformed)).toEqual({ ok: false, reason: 'malformedPayload' });
  });

  it('rejects a value outside 1..config.rounds as malformed', () => {
    // The structural guard types the field in isolation and cannot see `config.rounds`,
    // so the range is checked here — where the state is in hand.
    for (const value of [0, -1, CONFIG.rounds + 1, 4000000000]) {
      expect(attempt(started, 'p1', value), `value ${value}`).toEqual({
        ok: false,
        reason: 'malformedPayload',
      });
    }
  });

  it('rejects a play before the draft has started', () => {
    const noDraft = fold(makeDoc([openingLog()[0] as Action]));
    expect(attempt(noDraft)).toEqual({ ok: false, reason: 'draftNotStarted' });
  });

  it('rejects a player who is not on the card clock', () => {
    expect(attempt(started, 'p2')).toEqual({ ok: false, reason: 'notYourTurn' });
  });

  it('moves the clock to the next player once the first has played', () => {
    const afterFirst = fold(makeDoc(withCardPlays(openingLog(), 1, [4])));

    expect(attempt(afterFirst, 'p2', 2)).toEqual({ ok: true });
    expect(attempt(afterFirst, 'p1', 5)).toEqual({ ok: false, reason: 'notYourTurn' });
  });

  it('rejects a play stamped for a round the draft is not standing in', () => {
    expect(attempt(started, 'p1', 3, 2)).toEqual({ ok: false, reason: 'wrongSlot' });
  });

  it('rejects a card that player has already spent', () => {
    // Round 1 resolved, both picks made, so round 2 is on the clock and p2 leads it.
    const log = withPicks(withResolvedCardRound(openingLog(), 1, [4, 2]), 2);
    const roundTwo = fold(makeDoc(log));

    expect(selectCurrentRound(roundTwo)).toBe(2);
    expect(attempt(roundTwo, 'p2', 2, 2)).toEqual({ ok: false, reason: 'cardAlreadySpent' });
    expect(attempt(roundTwo, 'p2', 3, 2)).toEqual({ ok: true });
  });

  it('rejects a play into a round that has already resolved', () => {
    // Only reachable from a hand-edited or imported log: this one resolved round 1 while
    // p2 still had a card to play, which `fold` reproduces because it runs no `canApply`.
    const log = withCardPlays(openingLog(), 1, [4]);
    log.push(stamp(orderResolved(1, ['p1']), nextSeqOf(log)));

    expect(attempt(fold(makeDoc(log)), 'p2', 2)).toEqual({
      ok: false,
      reason: 'roundAlreadyResolved',
    });
  });

  /**
   * CARD-04's no-repeat rule, D-21's backstop — T-03-37.
   *
   * The rule is enforced TWICE by design, and this arm is the second half. The card panel
   * renders a value the offer excludes as inert, so a host cannot click it; this refuses
   * the action if one arrives anyway. A rejection reaching a user means the offer and the
   * rule disagree, which is a bug rather than a state the copy has to explain — so there
   * is deliberately no user-facing string for it anywhere.
   *
   * Note which value is refused and why it is not the arm above it: p2 still HOLDS the 4
   * — `selectHand` is per player and p2 has spent nothing — so `cardAlreadySpent` passes
   * and the round's used set is what refuses it.
   */
  it('rejects a value already down this round with cardNotPlayable', () => {
    const afterFirst = fold(makeDoc(withCardPlays(openingLog(), 1, [4])));

    expect(selectHand(afterFirst, 'p2')).toContain(4);
    expect(attempt(afterFirst, 'p2', 4)).toEqual({ ok: false, reason: 'cardNotPlayable' });
  });

  it('accepts a value the offer still carries', () => {
    const afterFirst = fold(makeDoc(withCardPlays(openingLog(), 1, [4])));

    expect(attempt(afterFirst, 'p2', 6)).toEqual({ ok: true });
  });
});

describe('canApply order/resolved', () => {
  function attempt(state: ReturnType<typeof fold>, round: number, order: readonly string[]) {
    return canApply(state, stamp(orderResolved(round, order), 99));
  }

  it('rejects a payload whose order is not an array of strings', () => {
    const malformed = {
      type: ORDER_RESOLVED,
      round: 1,
      order: 'p1,p2',
      seq: 99,
      at: CREATED_AT,
      actorId: 'host',
    } as unknown as AnyAction;

    expect(canApply(fold(makeDoc(openingLog())), malformed)).toEqual({
      ok: false,
      reason: 'malformedPayload',
    });
  });

  it('rejects a resolution before the draft has started', () => {
    const noDraft = fold(makeDoc([openingLog()[0] as Action]));
    expect(attempt(noDraft, 1, ['p1', 'p2'])).toEqual({ ok: false, reason: 'draftNotStarted' });
  });

  it('rejects a round nobody has bid in', () => {
    expect(attempt(fold(makeDoc(openingLog())), 1, ['p1', 'p2'])).toEqual({
      ok: false,
      reason: 'roundNotComplete',
    });
  });

  it('rejects a round where one player still holds their card', () => {
    const partial = fold(makeDoc(withCardPlays(openingLog(), 1, [4])));
    expect(attempt(partial, 1, ['p1', 'p2'])).toEqual({ ok: false, reason: 'roundNotComplete' });
  });

  it('accepts a round every player has bid in', () => {
    const complete = fold(makeDoc(withCardPlays(openingLog(), 1, [4, 2])));
    expect(attempt(complete, 1, ['p2', 'p1'])).toEqual({ ok: true });
  });

  it('rejects a second resolution for the same round', () => {
    const resolved = fold(makeDoc(withResolvedCardRound(openingLog(), 1, [4, 2])));
    expect(attempt(resolved, 1, ['p1', 'p2'])).toEqual({
      ok: false,
      reason: 'roundAlreadyResolved',
    });
  });
});

describe('a card round folds without canApply', () => {
  it('reproduces an imported document’s unusual card data rather than repairing it', () => {
    // Sync rule 11 and the reason `fold` never calls `canApply`: a document written by a
    // newer build, or migrated from one, must still open. Here both players played the
    // same value and the round resolved out of the rotation's order.
    const log = [...openingLog()];
    log.push(stamp(cardsPlayed({ playerId: 'p2', value: 5, round: 1 }), 3));
    log.push(stamp(cardsPlayed({ playerId: 'p1', value: 5, round: 1 }), 9));
    log.push(stamp(orderResolved(1, ['p2', 'p1']), 11));

    const state = fold(makeDoc(log));

    expect(state.cardsPlayed).toHaveLength(2);
    expect(selectHand(state, 'p1')).toEqual([1, 2, 3, 4, 6]);
    expect(selectResolvedOrder(state, 1)).toEqual(['p2', 'p1']);
    // The seq gap is preserved, and the tiebreak reads it rather than array position.
    expect(resolvePickOrder(selectCardsPlayedThisRound(state, 1))).toEqual(['p2', 'p1']);
  });
});

describe('canApply draft/pickMade during the card phase', () => {
  /**
   * The reason a pick is refused while cards are still on the table.
   *
   * Before this arm existed the null turn fell through to `draftComplete`, which is not
   * merely imprecise — it names the OPPOSITE end of the draft. A host reading it on a
   * round-one document would be told the tournament was finished.
   */
  it('rejects with cardsNotResolved before a single card is down', () => {
    const state = fold(makeDoc(openingLog()));
    const action = stamp(pickMade({ playerId: 'p1', monId: 'venusaur', round: 1, pickIndex: 0 }), 3);

    expect(canApply(state, action)).toEqual({ ok: false, reason: 'cardsNotResolved' });
  });

  it('rejects with cardsNotResolved when every card is down but the round has not resolved', () => {
    const state = fold(makeDoc(withCardPlays(openingLog(), 1, [4, 2])));
    const action = stamp(pickMade({ playerId: 'p2', monId: 'venusaur', round: 1, pickIndex: 0 }), 9);

    expect(canApply(state, action)).toEqual({ ok: false, reason: 'cardsNotResolved' });
  });

  it('accepts the resolved order’s first picker the moment the round resolves', () => {
    // p2 played the lower card, so p2 picks first — which `state.order` would not say.
    const state = fold(makeDoc(withResolvedCardRound(openingLog(), 1, [4, 2])));

    expect(selectResolvedOrder(state, 1)).toEqual(['p2', 'p1']);
    expect(
      canApply(
        state,
        stamp(pickMade({ playerId: 'p2', monId: 'venusaur', round: 1, pickIndex: 0 }), 9),
      ),
    ).toEqual({ ok: true });
    expect(
      canApply(
        state,
        stamp(pickMade({ playerId: 'p1', monId: 'venusaur', round: 1, pickIndex: 0 }), 9),
      ),
    ).toEqual({ ok: false, reason: 'notYourTurn' });
  });

  it('still reports draftComplete once every team is full', () => {
    // The new arm sits after the completion check, so the end of the draft keeps its own
    // reason rather than being reported as an unresolved round.
    const state = fold(makeDoc(withPicks(openingLog(), 12)));
    const action = stamp(
      pickMade({ playerId: 'p1', monId: 'feraligatr', round: 7, pickIndex: 12 }),
      40,
    );

    expect(canApply(state, action)).toEqual({ ok: false, reason: 'draftComplete' });
  });

  it('never fires for a migrated schema-2 document, which deals no cards', () => {
    const state = fold(makeDoc(migratedOpeningLog()));
    const action = stamp(pickMade({ playerId: 'p1', monId: 'venusaur', round: 1, pickIndex: 0 }), 2);

    expect(canApply(state, action)).toEqual({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// The ban stage — BAN-03, BAN-04, D-11
//
// Every fixture below is a hand-constructed document with zero mocks, which is the same
// property the rest of this file has and the reason the core/adapters split exists.
// ---------------------------------------------------------------------------

/** Two players, blind bans, two bans each. Four submitted ids in total. */
const BLIND_CONFIG: TournamentConfig = {
  ...CONFIG,
  banMode: 'blind',
  bansPerPlayer: 2,
};

/**
 * FOUR players, snake bans, two each — eight placements over two passes.
 *
 * Four rather than two on purpose: a two-player serpentine is `p1,p2` then `p2,p1`, which
 * a straight rotation with an off-by-one also produces. Four players is the smallest count
 * at which the serpentine and every near-miss disagree.
 */
const SNAKE_CONFIG: TournamentConfig = {
  ...CONFIG,
  players: [
    { id: 'p1', name: 'Player 1' },
    { id: 'p2', name: 'Player 2' },
    { id: 'p3', name: 'Player 3' },
    { id: 'p4', name: 'Player 4' },
  ],
  banMode: 'snake',
  bansPerPlayer: 2,
};

const SNAKE_ORDER = ['p1', 'p2', 'p3', 'p4'];

function makeDocWith(config: TournamentConfig, log: readonly Action[]): TournamentDoc {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'ban-stage-fixture',
    createdAt: CREATED_AT,
    config,
    rng: { seed: SEED, cursor: 0 },
    log: [...log],
  };
}

/**
 * The blind and snake opening: SCHEDULE then ORDER, and no pool at all.
 *
 * This is D-11's whole point. `draft/started` comes before `pool/built` for these two
 * modes so the ban stage can read DRFT-16's starting order, and the pool is drawn after
 * the reveal because the reveal is what decides which species it may contain (D-23).
 */
function banOpeningLog(order: readonly string[]): Action[] {
  return [
    stamp(scheduleCompiled(OPEN_SCHEDULE), 0),
    stamp(draftStarted(order, 9), 1),
  ];
}

/** Walk a log entry by entry, asserting `canApply` accepts each one before folding it. */
function foldAsserting(config: TournamentConfig, log: readonly Action[]) {
  let state = initialState(config);
  for (const action of log) {
    expect(canApply(state, action), `entry seq ${String(action.seq)} (${action.type})`).toEqual({
      ok: true,
    });
    state = apply(state, action);
  }
  return state;
}

// ---------------------------------------------------------------------------
// D-11 — the two relaxed guards, and the mode that must not have moved
// ---------------------------------------------------------------------------

describe('the poolNotBuilt guards under hostBanlist', () => {
  it('still refuses schedule/compiled with an empty pool', () => {
    // D-01's zero-regression posture, met structurally: for `hostBanlist` the guard is
    // byte-for-byte the rule Phase 3 verified.
    const state = initialState(CONFIG);

    expect(canApply(state, stamp(scheduleCompiled(OPEN_SCHEDULE), 0))).toEqual({
      ok: false,
      reason: 'poolNotBuilt',
    });
  });

  it('still refuses draft/started with an empty pool', () => {
    const state = initialState(CONFIG);

    expect(canApply(state, stamp(draftStarted(ORDER, 9), 0))).toEqual({
      ok: false,
      reason: 'poolNotBuilt',
    });
  });

  it('still refuses draft/started with a pool but no schedule', () => {
    // The check that is unrelated to the pool and therefore unmoved by D-11.
    const state = fold(makeDoc([stamp(poolBuilt(POOL, 'mb', 'abc123', 7, 0), 0)]));

    expect(canApply(state, stamp(draftStarted(ORDER, 9), 1))).toEqual({
      ok: false,
      reason: 'scheduleNotCompiled',
    });
  });
});

describe('the poolNotBuilt guards under blind and snake', () => {
  it('accepts schedule/compiled with no pool', () => {
    expect(canApply(initialState(BLIND_CONFIG), stamp(scheduleCompiled(OPEN_SCHEDULE), 0))).toEqual(
      { ok: true },
    );
    expect(canApply(initialState(SNAKE_CONFIG), stamp(scheduleCompiled(OPEN_SCHEDULE), 0))).toEqual(
      { ok: true },
    );
  });

  it('accepts draft/started with no pool, once the schedule is compiled', () => {
    const state = fold(makeDocWith(BLIND_CONFIG, [stamp(scheduleCompiled(OPEN_SCHEDULE), 0)]));

    expect(state.poolIds).toEqual([]);
    expect(canApply(state, stamp(draftStarted(ORDER, 9), 1))).toEqual({ ok: true });
  });

  it('still requires the schedule before the order', () => {
    // `schedule/compiled` must still precede `draft/started`: that check is about the
    // schedule, not the pool, and D-11 moved only the pool.
    expect(canApply(initialState(BLIND_CONFIG), stamp(draftStarted(ORDER, 9), 0))).toEqual({
      ok: false,
      reason: 'scheduleNotCompiled',
    });
  });

  it('accepts pool/built arriving LAST, after the order and the reveal', () => {
    // `canApply(POOL_BUILT)` needed no change at all — it asks about the pool and asserts
    // nothing about the draft having started.
    const log = [
      ...banOpeningLog(ORDER),
      stamp(bansSubmitted('p1', ['venusaur', 'charizard']), 2),
      stamp(bansSubmitted('p2', ['blastoise', 'garchomp']), 3),
      stamp(
        bansRevealed([
          { playerId: 'p1', monIds: ['venusaur', 'charizard'] },
          { playerId: 'p2', monIds: ['blastoise', 'garchomp'] },
        ]),
        4,
      ),
    ];
    const state = foldAsserting(BLIND_CONFIG, log);

    expect(canApply(state, stamp(poolBuilt(POOL, 'mb', 'abc123', 7, 0), 5))).toEqual({ ok: true });
  });

  it('folds the whole blind sequence with no rejection at any step', () => {
    // schedule/compiled → draft/started → bans/submitted ×2 → bans/revealed → pool/built.
    const log = [
      ...banOpeningLog(ORDER),
      stamp(bansSubmitted('p1', ['venusaur', 'charizard']), 2),
      stamp(bansSubmitted('p2', ['blastoise', 'garchomp']), 3),
      stamp(
        bansRevealed([
          { playerId: 'p1', monIds: ['venusaur', 'charizard'] },
          { playerId: 'p2', monIds: ['blastoise', 'garchomp'] },
        ]),
        4,
      ),
      stamp(poolBuilt(POOL, 'mb', 'abc123', 7, 0), 5),
    ];
    const state = foldAsserting(BLIND_CONFIG, log);

    expect(state.order).toEqual(ORDER);
    expect(state.poolIds).toEqual(POOL);
    expect(state.banSubmissions).toHaveLength(2);
    expect(state.bansRevealed).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// apply — the three ban arms
// ---------------------------------------------------------------------------

describe('apply(bans/placed)', () => {
  it('records the ENVELOPE’s seq, not the array index', () => {
    // The log may legally have gaps: `store.ts` allocates `max(seq) + 1` so a removal
    // from the middle cannot reissue an id that is still in use. A `seq` taken off
    // `banPlacements.length` would renumber every ban after an undo.
    const log = [
      ...banOpeningLog(SNAKE_ORDER),
      stamp(bansPlaced('p1', 'venusaur', 1), 500),
      stamp(bansPlaced('p2', 'charizard', 1), 900),
    ];
    const state = fold(makeDocWith(SNAKE_CONFIG, log));

    expect(state.banPlacements).toEqual([
      { playerId: 'p1', monId: 'venusaur', pass: 1, seq: 500 },
      { playerId: 'p2', monId: 'charizard', pass: 1, seq: 900 },
    ]);
  });

  it('keeps the pass the action carried rather than deriving it from position', () => {
    const log = [...banOpeningLog(SNAKE_ORDER), stamp(bansPlaced('p1', 'venusaur', 2), 7)];

    expect(fold(makeDocWith(SNAKE_CONFIG, log)).banPlacements[0]?.pass).toBe(2);
  });
});

describe('apply(bans/submitted)', () => {
  it('appends the submission with the envelope’s seq', () => {
    const log = [...banOpeningLog(ORDER), stamp(bansSubmitted('p1', ['venusaur', 'charizard']), 42)];

    expect(fold(makeDocWith(BLIND_CONFIG, log)).banSubmissions).toEqual([
      { playerId: 'p1', monIds: ['venusaur', 'charizard'], seq: 42 },
    ]);
  });

  it('copies monIds rather than aliasing the log entry’s array', () => {
    // The folded state must never share an array with the log entry it was folded from —
    // the rule `copyConfig` states for the document and `apply(SCHEDULE_COMPILED)` for
    // the schedule.
    const action = stamp(bansSubmitted('p1', ['venusaur', 'charizard']), 42);
    const state = apply(fold(makeDocWith(BLIND_CONFIG, banOpeningLog(ORDER))), action);

    expect(state.banSubmissions[0]?.monIds).not.toBe(
      (action as { monIds: string[] }).monIds,
    );
    expect(state.banSubmissions[0]?.monIds).toEqual(['venusaur', 'charizard']);
  });
});

describe('apply(bans/revealed)', () => {
  it('sets bansRevealed to freshly built records', () => {
    const action = stamp(
      bansRevealed([
        { playerId: 'p1', monIds: ['venusaur'] },
        { playerId: 'p2', monIds: ['charizard', 'blastoise'] },
      ]),
      50,
    );
    const state = apply(fold(makeDocWith(BLIND_CONFIG, banOpeningLog(ORDER))), action);

    expect(state.bansRevealed).toEqual([
      { playerId: 'p1', monIds: ['venusaur'] },
      { playerId: 'p2', monIds: ['charizard', 'blastoise'] },
    ]);
    expect(state.bansRevealed?.[0]).not.toBe((action as { bans: unknown[] }).bans[0]);
    expect(state.bansRevealed?.[1]?.monIds).not.toBe(
      (action as { bans: { monIds: string[] }[] }).bans[1]?.monIds,
    );
  });

  it('ignores a SECOND reveal rather than rewriting the first', () => {
    // `apply` is not a validator, and `order/resolved` sets the precedent: a hand-edited
    // file must not be able to rewrite what the room already watched by appending a
    // second opinion. `canApply` refuses this on origination; the fold ignores it.
    const log = [
      ...banOpeningLog(ORDER),
      stamp(bansRevealed([{ playerId: 'p1', monIds: ['venusaur'] }]), 50),
      stamp(bansRevealed([{ playerId: 'p1', monIds: ['mewtwo'] }]), 51),
    ];

    expect(fold(makeDocWith(BLIND_CONFIG, log)).bansRevealed).toEqual([
      { playerId: 'p1', monIds: ['venusaur'] },
    ]);
  });
});

// ---------------------------------------------------------------------------
// canApply — the eight backstops
//
// Every arm below should be UNREACHABLE from the UI: the surfaces render an illegal
// option inert with a reason rather than letting it be clicked and refused. A test that
// reaches one of these is testing the IMPORTED-document path, not the host path.
// ---------------------------------------------------------------------------

describe('canApply(bans/placed)', () => {
  const snakeStart = () => fold(makeDocWith(SNAKE_CONFIG, banOpeningLog(SNAKE_ORDER)));

  it('refuses banStageNotRunning under hostBanlist', () => {
    const state = fold(makeDoc(openingLog()));

    expect(canApply(state, stamp(bansPlaced('p1', 'venusaur', 1), 9))).toEqual({
      ok: false,
      reason: 'banStageNotRunning',
    });
  });

  it('refuses banStageNotRunning under blind — a snake ban is not a blind act', () => {
    const state = fold(makeDocWith(BLIND_CONFIG, banOpeningLog(ORDER)));

    expect(canApply(state, stamp(bansPlaced('p1', 'venusaur', 1), 9))).toEqual({
      ok: false,
      reason: 'banStageNotRunning',
    });
  });

  it('refuses draftNotStarted before the order lands', () => {
    const state = fold(makeDocWith(SNAKE_CONFIG, [stamp(scheduleCompiled(OPEN_SCHEDULE), 0)]));

    expect(canApply(state, stamp(bansPlaced('p1', 'venusaur', 1), 9))).toEqual({
      ok: false,
      reason: 'draftNotStarted',
    });
  });

  it('walks a true serpentine — 1,2,3,4 then 4,3,2,1', () => {
    // D-12. The straight rotation this replaces compounds a first-mover advantage; the
    // serpentine is what corrects it. Asserted one step at a time, refusing every other
    // player at each step, so an off-by-one cannot hide behind a happy path.
    const expected = ['p1', 'p2', 'p3', 'p4', 'p4', 'p3', 'p2', 'p1'];
    let state = snakeStart();

    expected.forEach((onTheClock, index) => {
      const pass = Math.floor(index / SNAKE_ORDER.length) + 1;
      const monId = POOL[index] as string;

      for (const playerId of SNAKE_ORDER) {
        const action = stamp(bansPlaced(playerId, monId, pass), 100 + index);
        expect(canApply(state, action), `${playerId} at index ${String(index)}`).toEqual(
          playerId === onTheClock ? { ok: true } : { ok: false, reason: 'notYourBanTurn' },
        );
      }

      state = apply(state, stamp(bansPlaced(onTheClock, monId, pass), 100 + index));
    });

    // Every allotment is spent, so nobody is on the clock and the stage is over.
    expect(canApply(state, stamp(bansPlaced('p1', 'skarmory', 3), 200))).toEqual({
      ok: false,
      reason: 'notYourBanTurn',
    });
  });

  it('refuses wrongSlot when the carried pass disagrees with the clock', () => {
    // `pass` is stamped at the edge, so a mismatch can only arrive from an edited or
    // imported log — which is exactly the path that must not be able to file a ban under
    // a pass the board will render in the wrong column.
    expect(canApply(snakeStart(), stamp(bansPlaced('p1', 'venusaur', 2), 9))).toEqual({
      ok: false,
      reason: 'wrongSlot',
    });
  });

  it('refuses banAlreadyPlaced for a species already banned in the open', () => {
    const state = apply(snakeStart(), stamp(bansPlaced('p1', 'venusaur', 1), 9));

    expect(canApply(state, stamp(bansPlaced('p2', 'venusaur', 1), 10))).toEqual({
      ok: false,
      reason: 'banAlreadyPlaced',
    });
  });

  it('refuses banAlreadyPlaced for a species the HOST already banned', () => {
    const hostBanned: TournamentConfig = { ...SNAKE_CONFIG, bans: ['venusaur'] };
    const state = fold(makeDocWith(hostBanned, banOpeningLog(SNAKE_ORDER)));

    expect(canApply(state, stamp(bansPlaced('p1', 'venusaur', 1), 9))).toEqual({
      ok: false,
      reason: 'banAlreadyPlaced',
    });
  });

  it('refuses banStageNotRunning once a reveal has landed', () => {
    const state = apply(
      snakeStart(),
      stamp(bansRevealed([{ playerId: 'p1', monIds: ['venusaur'] }]), 9),
    );

    expect(canApply(state, stamp(bansPlaced('p1', 'charizard', 1), 10))).toEqual({
      ok: false,
      reason: 'banStageNotRunning',
    });
  });
});

describe('canApply(bans/submitted)', () => {
  const blindStart = () => fold(makeDocWith(BLIND_CONFIG, banOpeningLog(ORDER)));

  it('accepts a well-formed first submission', () => {
    expect(
      canApply(blindStart(), stamp(bansSubmitted('p1', ['venusaur', 'charizard']), 9)),
    ).toEqual({ ok: true });
  });

  it('refuses banStageNotRunning under hostBanlist and under snake', () => {
    expect(
      canApply(fold(makeDoc(openingLog())), stamp(bansSubmitted('p1', ['venusaur']), 9)),
    ).toEqual({ ok: false, reason: 'banStageNotRunning' });
    expect(
      canApply(
        fold(makeDocWith(SNAKE_CONFIG, banOpeningLog(SNAKE_ORDER))),
        stamp(bansSubmitted('p1', ['venusaur', 'charizard']), 9),
      ),
    ).toEqual({ ok: false, reason: 'banStageNotRunning' });
  });

  it('refuses banStageNotRunning once the reveal has landed', () => {
    const state = apply(
      blindStart(),
      stamp(bansRevealed([{ playerId: 'p1', monIds: ['venusaur'] }]), 9),
    );

    expect(canApply(state, stamp(bansSubmitted('p2', ['blastoise', 'garchomp']), 10))).toEqual({
      ok: false,
      reason: 'banStageNotRunning',
    });
  });

  it('refuses unknownPlayer for somebody outside the rotation', () => {
    expect(
      canApply(blindStart(), stamp(bansSubmitted('p9', ['venusaur', 'charizard']), 9)),
    ).toEqual({ ok: false, reason: 'unknownPlayer' });
  });

  it('refuses alreadySubmitted for a SECOND submission by one player', () => {
    // D-05: a submission is one act, so it is submitted once and walked back whole.
    const state = apply(blindStart(), stamp(bansSubmitted('p1', ['venusaur', 'charizard']), 9));

    expect(canApply(state, stamp(bansSubmitted('p1', ['blastoise', 'garchomp']), 10))).toEqual({
      ok: false,
      reason: 'alreadySubmitted',
    });
  });

  it('refuses wrongBanCount when the allotment does not match bansPerPlayer', () => {
    expect(canApply(blindStart(), stamp(bansSubmitted('p1', ['venusaur']), 9))).toEqual({
      ok: false,
      reason: 'wrongBanCount',
    });
    expect(
      canApply(blindStart(), stamp(bansSubmitted('p1', ['venusaur', 'charizard', 'blastoise']), 9)),
    ).toEqual({ ok: false, reason: 'wrongBanCount' });
  });

  it('refuses duplicateBanIds when one player names the same species twice', () => {
    expect(
      canApply(blindStart(), stamp(bansSubmitted('p1', ['venusaur', 'venusaur']), 9)),
    ).toEqual({ ok: false, reason: 'duplicateBanIds' });
  });

  it('ACCEPTS two players naming the same species — that is a collision, not an error', () => {
    // D-19's `bothApply`: a duplicate across players is a legal outcome of a blind stage
    // and the reveal screen's whole reason for showing attribution.
    const state = apply(blindStart(), stamp(bansSubmitted('p1', ['venusaur', 'charizard']), 9));

    expect(canApply(state, stamp(bansSubmitted('p2', ['venusaur', 'blastoise']), 10))).toEqual({
      ok: true,
    });
  });
});

describe('canApply(bans/revealed)', () => {
  const blindStart = () => fold(makeDocWith(BLIND_CONFIG, banOpeningLog(ORDER)));

  const fullReveal = () =>
    bansRevealed([
      { playerId: 'p1', monIds: ['venusaur', 'charizard'] },
      { playerId: 'p2', monIds: ['blastoise', 'garchomp'] },
    ]);

  function bothSubmitted() {
    let state = blindStart();
    state = apply(state, stamp(bansSubmitted('p1', ['venusaur', 'charizard']), 9));
    return apply(state, stamp(bansSubmitted('p2', ['blastoise', 'garchomp']), 10));
  }

  it('accepts the reveal once every player has submitted', () => {
    expect(canApply(bothSubmitted(), stamp(fullReveal(), 11))).toEqual({ ok: true });
  });

  it('refuses bansNotComplete before the LAST submission', () => {
    const state = apply(blindStart(), stamp(bansSubmitted('p1', ['venusaur', 'charizard']), 9));

    expect(canApply(state, stamp(fullReveal(), 10))).toEqual({
      ok: false,
      reason: 'bansNotComplete',
    });
  });

  it('refuses bansNotComplete when nobody has submitted at all', () => {
    expect(canApply(blindStart(), stamp(fullReveal(), 9))).toEqual({
      ok: false,
      reason: 'bansNotComplete',
    });
  });

  it('refuses bansAlreadyRevealed for a second reveal', () => {
    const state = apply(bothSubmitted(), stamp(fullReveal(), 11));

    expect(canApply(state, stamp(fullReveal(), 12))).toEqual({
      ok: false,
      reason: 'bansAlreadyRevealed',
    });
  });

  it('refuses banStageNotRunning under hostBanlist and under snake', () => {
    expect(canApply(fold(makeDoc(openingLog())), stamp(fullReveal(), 9))).toEqual({
      ok: false,
      reason: 'banStageNotRunning',
    });
    expect(
      canApply(fold(makeDocWith(SNAKE_CONFIG, banOpeningLog(SNAKE_ORDER))), stamp(fullReveal(), 9)),
    ).toEqual({ ok: false, reason: 'banStageNotRunning' });
  });

  it('refuses draftNotStarted before the order lands', () => {
    const state = fold(makeDocWith(BLIND_CONFIG, [stamp(scheduleCompiled(OPEN_SCHEDULE), 0)]));

    expect(canApply(state, stamp(fullReveal(), 9))).toEqual({
      ok: false,
      reason: 'draftNotStarted',
    });
  });
});
