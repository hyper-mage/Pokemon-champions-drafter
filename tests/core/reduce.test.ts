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
  DRAFT_PICK_MADE,
  draftStarted,
  pickMade,
  pickUndone,
  poolBuilt,
  type Action,
  type AnyAction,
  type Intent,
} from '../../src/core/actions';
import {
  initialState,
  SCHEMA_VERSION,
  type TournamentConfig,
  type TournamentDoc,
} from '../../src/core/model';
import { apply, canApply, fold } from '../../src/core/reduce';
import {
  selectAvailablePool,
  selectCurrentTurn,
  selectIsComplete,
  selectPickCount,
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

/** `pool/built` then `draft/started`, exactly as `createTournament` emits them. */
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
    const log = withPicks(openingLog(), 3);
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
  it('accepts a legal pick', () => {
    const state = fold(makeDoc(openingLog()));
    const action = stamp(
      pickMade({ playerId: 'p1', monId: 'venusaur', round: 1, pickIndex: 0 }),
      2,
    );

    expect(canApply(state, action)).toEqual({ ok: true });
  });

  it('rejects a species that is not in the current available pool', () => {
    const state = fold(
      makeDoc([
        ...openingLog(),
        stamp(pickMade({ playerId: 'p1', monId: 'venusaur', round: 1, pickIndex: 0 }), 2),
      ]),
    );
    // p2 is on the clock; venusaur has already gone.
    const action = stamp(
      pickMade({ playerId: 'p2', monId: 'venusaur', round: 1, pickIndex: 1 }),
      3,
    );

    expect(canApply(state, action)).toEqual({ ok: false, reason: 'notInPool' });
  });

  it('rejects a species that was never in the pool at all', () => {
    const state = fold(makeDoc(openingLog()));
    const action = stamp(
      pickMade({ playerId: 'p1', monId: 'missingno', round: 1, pickIndex: 0 }),
      2,
    );

    expect(canApply(state, action)).toEqual({ ok: false, reason: 'notInPool' });
  });

  it('rejects a pick by a player who is not on the clock', () => {
    const state = fold(makeDoc(openingLog()));
    const action = stamp(
      pickMade({ playerId: 'p2', monId: 'venusaur', round: 1, pickIndex: 0 }),
      2,
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
    const state = fold(makeDoc(openingLog()));

    expect(
      canApply(
        state,
        stamp(pickMade({ playerId: 'p1', monId: 'venusaur', round: 4, pickIndex: 0 }), 2),
      ),
    ).toEqual({ ok: false, reason: 'wrongSlot' });

    expect(
      canApply(
        state,
        stamp(pickMade({ playerId: 'p1', monId: 'venusaur', round: 1, pickIndex: 7 }), 2),
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
      canApply(fold(makeDoc([stamp(poolBuilt(POOL, 'mb', 'abc123', 7, 0), 0)])), stamp(draftStarted(['p1', 'ghost'], 9), 1)),
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
