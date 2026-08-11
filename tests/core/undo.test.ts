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
  DRAFT_PICK_MADE,
  DRAFT_PICK_UNDONE,
  DRAFT_STARTED,
  POOL_BUILT,
  draftStarted,
  pickMade,
  pickUndone,
  poolBuilt,
  type Action,
  type Intent,
} from '../../src/core/actions';
import {
  SCHEMA_VERSION,
  type TournamentConfig,
  type TournamentDoc,
} from '../../src/core/model';
import { fold } from '../../src/core/reduce';
import { selectAvailablePool, selectCurrentTurn, selectPickCount } from '../../src/core/selectors';
import { canUndo, lastPickAction, undoLast } from '../../src/core/undo';

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
    stamp(poolBuilt(POOL, CONFIG.rosterVersion, CONFIG.rosterChecksum), 0),
    stamp(draftStarted(ORDER), 1),
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
