/**
 * The draft recap — PERS-09 / D-19…D-22.
 *
 * Zero mocks, by construction. `buildRecap` is a pure function of the record it is handed
 * and of the fold of that record; if a test in this file ever needs a fake clock or a fake
 * id generator, an ambient value has leaked into the core and `npm run check:pure` should
 * already have failed the build.
 *
 * Two assertions here are load-bearing rather than incidental, and both are named for the
 * decision they defend.
 *
 * D-21's is that a blind night abandoned before its reveal mentions no submitted species id
 * ANYWHERE in the returned array. It is asserted on CONTENT — the id, searched for across
 * every field of every entry — rather than on a section count, because a count passes
 * against a fixture with nothing submitted and so proves nothing at all.
 *
 * D-22's inverts 05-RESEARCH Pitfall 8's warning sign directly: three matches carrying two
 * corrections must yield FIVE round-robin entries, not three. A recap derived from the fold
 * compiles, renders, and returns three.
 */

import { describe, expect, it } from 'vitest';

import {
  DRAFT_PICK_MADE,
  bansPlaced,
  bansRevealed,
  bansSubmitted,
  cardsPlayed,
  draftStarted,
  pickMade,
  poolBuilt,
  scheduleCompiled,
  swapMade,
  swapPassed,
  type Action,
  type Intent,
} from '../../src/core/actions';
import {
  SCHEMA_VERSION,
  type TournamentConfig,
  type TournamentDoc,
} from '../../src/core/model';
import { buildRecap, type RecapEntry } from '../../src/core/recap';
import { fold } from '../../src/core/reduce';

// ---------------------------------------------------------------------------
// Fixtures — deliberately the same shape as tests/core/undo.test.ts, so a reader
// comparing the two files is comparing behaviour rather than scaffolding.
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
];

const BASE_CONFIG: TournamentConfig = {
  formatLabel: 'Champions Test',
  players: [
    { id: 'p1', name: 'Player 1' },
    { id: 'p2', name: 'Player 2' },
    { id: 'p3', name: 'Player 3' },
  ],
  rounds: 6,
  rosterVersion: 'mb',
  rosterChecksum: 'abc123',
  poolSize: 12,
  bans: [],
  banMode: 'hostBanlist',
  megasRequiredPerTeam: 0,
  dualMegaChoices: [],
  depth: 'draftBracketsAndLog',
  rules: [{ kind: 'mega', count: 0 }],
  megaFormeBans: [],
  swapBudget: 1,
  swapRounds: 1,
  bansPerPlayer: 0,
  duplicateBanPolicy: 'bothApply',
  matchMetric: 'pokemonLeft',
  roundRobinFormat: 'bo1',
  bracketFormat: 'bo1',
};

const ORDER = ['p1', 'p2', 'p3'];

/** Stamp the envelope the store adds at the edge. Creators never do this themselves. */
function stamp(intent: Intent, seq: number): Action {
  return { ...intent, seq, at: CREATED_AT + seq, actorId: 'host' };
}

function makeDoc(
  log: readonly Action[],
  config: TournamentConfig = BASE_CONFIG,
): TournamentDoc {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'tournament-fixture',
    createdAt: CREATED_AT,
    config,
    rng: { seed: SEED, cursor: 0 },
    log: [...log],
  };
}

/** `buildRecap` against the fold of the same record — the only way it is ever called. */
function recapOf(doc: TournamentDoc): readonly RecapEntry[] {
  return buildRecap(doc, fold(doc));
}

/** Every id this recap mentions anywhere, for the content-level secrecy assertion. */
function allMentionedIds(entries: readonly RecapEntry[]): string[] {
  return entries.flatMap((entry) => [...entry.playerIds, ...entry.monIds]);
}

function sectionOf(
  entries: readonly RecapEntry[],
  section: RecapEntry['section'],
): RecapEntry[] {
  return entries.filter((entry) => entry.section === section);
}

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

describe('buildRecap ordering', () => {
  it('returns entries in strictly ascending seq order', () => {
    const config: TournamentConfig = { ...BASE_CONFIG, banMode: 'snake', bansPerPlayer: 1 };
    const doc = makeDoc(
      [
        stamp(scheduleCompiled([]), 4),
        stamp(draftStarted(ORDER, 9), 9),
        stamp(bansPlaced('p1', 'skarmory', 1), 14),
        stamp(bansPlaced('p2', 'tyranitar', 1), 15),
        stamp(bansPlaced('p3', 'gardevoir', 1), 21),
        stamp(poolBuilt(POOL, 'mb', 'abc123', 7, 0), 30),
        stamp(cardsPlayed({ playerId: 'p1', value: 1, round: 1 }), 31),
        stamp(pickMade({ playerId: 'p1', monId: 'venusaur', round: 1, pickIndex: 0 }), 40),
        stamp(pickMade({ playerId: 'p2', monId: 'charizard', round: 1, pickIndex: 1 }), 41),
        stamp(swapPassed({ playerId: 'p3', swapRound: 1 }), 55),
      ],
      config,
    );

    const entries = recapOf(doc);

    expect(entries.length).toBeGreaterThan(0);
    for (let index = 1; index < entries.length; index++) {
      const previous = entries[index - 1] as RecapEntry;
      const current = entries[index] as RecapEntry;
      expect(current.seq).toBeGreaterThan(previous.seq);
    }
  });

  it('orders by seq rather than by array position when a log arrives out of order', () => {
    const doc = makeDoc([
      stamp(pickMade({ playerId: 'p2', monId: 'charizard', round: 1, pickIndex: 1 }), 41),
      stamp(pickMade({ playerId: 'p1', monId: 'venusaur', round: 1, pickIndex: 0 }), 40),
    ]);

    const picks = recapOf(doc).filter((entry) => entry.kind === 'pick');

    expect(picks.map((entry) => entry.monIds[0])).toEqual(['venusaur', 'charizard']);
  });

  it('tolerates gaps in seq, which the allocator is allowed to leave', () => {
    const doc = makeDoc([
      stamp(pickMade({ playerId: 'p1', monId: 'venusaur', round: 1, pickIndex: 0 }), 3),
      stamp(pickMade({ playerId: 'p2', monId: 'charizard', round: 1, pickIndex: 1 }), 900),
    ]);

    expect(recapOf(doc).map((entry) => entry.seq)).toEqual([3, 900]);
  });
});

// ---------------------------------------------------------------------------
// Bans — D-21
// ---------------------------------------------------------------------------

describe('buildRecap bans', () => {
  it('renders the host banlist in hostBanlist mode', () => {
    const config: TournamentConfig = { ...BASE_CONFIG, bans: ['skarmory', 'tyranitar'] };
    const doc = makeDoc([stamp(poolBuilt(POOL, 'mb', 'abc123', 7, 0), 0)], config);

    const bans = sectionOf(recapOf(doc), 'bans');

    expect(bans.map((entry) => entry.monIds[0])).toEqual(['skarmory', 'tyranitar']);
    expect(bans.every((entry) => entry.kind === 'ban')).toBe(true);
    expect(bans.every((entry) => entry.playerIds.length === 0)).toBe(true);
  });

  it('attributes each placed ban to the player who placed it in snake mode', () => {
    const config: TournamentConfig = { ...BASE_CONFIG, banMode: 'snake', bansPerPlayer: 1 };
    const doc = makeDoc(
      [
        stamp(draftStarted(ORDER, 9), 0),
        stamp(bansPlaced('p1', 'skarmory', 1), 1),
        stamp(bansPlaced('p2', 'tyranitar', 1), 2),
      ],
      config,
    );

    const bans = sectionOf(recapOf(doc), 'bans');

    expect(bans.map((entry) => [entry.playerIds[0], entry.monIds[0]])).toEqual([
      ['p1', 'skarmory'],
      ['p2', 'tyranitar'],
    ]);
  });

  it('D-21: a blind night abandoned before its reveal mentions no submitted species', () => {
    const config: TournamentConfig = { ...BASE_CONFIG, banMode: 'blind', bansPerPlayer: 2 };
    const doc = makeDoc(
      [
        stamp(draftStarted(ORDER, 9), 0),
        stamp(bansSubmitted('p1', ['venusaur', 'charizard']), 1),
        stamp(bansSubmitted('p2', ['venusaur', 'blastoise']), 2),
        stamp(bansSubmitted('p3', ['venusaur', 'garchomp']), 3),
      ],
      config,
    );

    const mentioned = allMentionedIds(recapOf(doc));

    // CONTENT, not a count. Every one of these is in `doc.log` as plaintext and must not
    // reach a single field of a single entry.
    expect(mentioned).not.toContain('charizard');
    expect(mentioned).not.toContain('venusaur');
    expect(mentioned).not.toContain('blastoise');
    expect(mentioned).not.toContain('garchomp');
    expect(sectionOf(recapOf(doc), 'bans')).toEqual([]);
  });

  it('D-21: the same species is present once the reveal has folded', () => {
    const config: TournamentConfig = { ...BASE_CONFIG, banMode: 'blind', bansPerPlayer: 2 };
    const doc = makeDoc(
      [
        stamp(draftStarted(ORDER, 9), 0),
        stamp(bansSubmitted('p1', ['venusaur', 'charizard']), 1),
        stamp(bansSubmitted('p2', ['venusaur', 'blastoise']), 2),
        stamp(bansSubmitted('p3', ['venusaur', 'garchomp']), 3),
        stamp(
          bansRevealed([
            { playerId: 'p1', monIds: ['venusaur', 'charizard'] },
            { playerId: 'p2', monIds: ['venusaur', 'blastoise'] },
            { playerId: 'p3', monIds: ['venusaur', 'garchomp'] },
          ]),
          4,
        ),
      ],
      config,
    );

    const entries = recapOf(doc);

    expect(allMentionedIds(entries)).toContain('charizard');
    expect(sectionOf(entries, 'bans').length).toBeGreaterThan(0);
  });

  it('names every colliding player on ONE collision entry', () => {
    const config: TournamentConfig = { ...BASE_CONFIG, banMode: 'blind', bansPerPlayer: 2 };
    const doc = makeDoc(
      [
        stamp(draftStarted(ORDER, 9), 0),
        stamp(
          bansRevealed([
            { playerId: 'p1', monIds: ['venusaur', 'charizard'] },
            { playerId: 'p2', monIds: ['venusaur', 'blastoise'] },
            { playerId: 'p3', monIds: ['venusaur', 'garchomp'] },
          ]),
          1,
        ),
      ],
      config,
    );

    const collisions = recapOf(doc).filter((entry) => entry.kind === 'collision');

    expect(collisions).toHaveLength(1);
    expect(collisions[0]?.monIds).toEqual(['venusaur']);
    expect(collisions[0]?.playerIds).toEqual(['p1', 'p2', 'p3']);
  });
});

// ---------------------------------------------------------------------------
// The draft's own families — D-20
// ---------------------------------------------------------------------------

describe('buildRecap draft families', () => {
  const doc = makeDoc([
    stamp(poolBuilt(POOL, 'mb', 'abc123', 7, 0), 0),
    stamp(draftStarted(ORDER, 9), 1),
    stamp(cardsPlayed({ playerId: 'p1', value: 3, round: 1 }), 2),
    stamp(cardsPlayed({ playerId: 'p2', value: 1, round: 1 }), 3),
    stamp(pickMade({ playerId: 'p2', monId: 'venusaur', round: 1, pickIndex: 0 }), 4),
    stamp(pickMade({ playerId: 'p1', monId: 'charizard', round: 1, pickIndex: 1 }), 5),
    stamp(pickMade({ playerId: 'p1', monId: 'blastoise', round: 2, pickIndex: 2 }), 6),
    stamp(
      swapMade({
        playerId: 'p1',
        round: 2,
        outMonId: 'blastoise',
        inMonId: 'garchomp',
        swapRound: 1,
      }),
      7,
    ),
    stamp(swapPassed({ playerId: 'p2', swapRound: 1 }), 8),
  ]);

  it('emits one card entry per play, carrying the value', () => {
    const cards = sectionOf(recapOf(doc), 'cards');

    expect(cards).toHaveLength(2);
    expect(cards[0]?.detail.value).toBe(3);
    expect(cards[1]?.detail.value).toBe(1);
  });

  it('emits one pick entry per pick, grouped by the round it was stamped with', () => {
    const picks = recapOf(doc).filter((entry) => entry.kind === 'pick');

    expect(picks.map((entry) => [entry.round, entry.monIds[0]])).toEqual([
      [1, 'venusaur'],
      [1, 'charizard'],
      [2, 'blastoise'],
    ]);
    expect(picks.every((entry) => entry.section === 'round')).toBe(true);
  });

  it('emits a swap carrying both species and a pass carrying only its player', () => {
    const swaps = sectionOf(recapOf(doc), 'swaps');

    expect(swaps.map((entry) => entry.kind)).toEqual(['swap', 'pass']);
    expect(swaps[0]?.monIds).toEqual(['blastoise', 'garchomp']);
    expect(swaps[1]?.playerIds).toEqual(['p2']);
    expect(swaps[1]?.monIds).toEqual([]);
  });

  it('marks nothing in the draft half as a correction', () => {
    expect(recapOf(doc).every((entry) => entry.correction === 'none')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Untrusted input, and freshness
// ---------------------------------------------------------------------------

describe('buildRecap against an untrusted log', () => {
  it('skips a pick-shaped entry with no monId rather than emitting it half-built', () => {
    const malformed = {
      type: DRAFT_PICK_MADE,
      playerId: 'p1',
      round: 1,
      pickIndex: 0,
      seq: 5,
      at: CREATED_AT,
      actorId: 'host',
    } as unknown as Action;

    const doc = makeDoc([
      stamp(pickMade({ playerId: 'p1', monId: 'venusaur', round: 1, pickIndex: 0 }), 4),
      malformed,
    ]);

    const picks = recapOf(doc).filter((entry) => entry.kind === 'pick');

    expect(picks).toHaveLength(1);
    expect(picks[0]?.monIds).toEqual(['venusaur']);
  });

  it('ignores an action type this build has never heard of', () => {
    const unknown = {
      type: 'not/aThing',
      seq: 6,
      at: CREATED_AT,
      actorId: 'host',
    } as unknown as Action;

    const doc = makeDoc([
      stamp(pickMade({ playerId: 'p1', monId: 'venusaur', round: 1, pickIndex: 0 }), 4),
      unknown,
    ]);

    expect(recapOf(doc)).toHaveLength(1);
  });

  it('builds every record fresh, so mutating one changes nothing', () => {
    const config: TournamentConfig = { ...BASE_CONFIG, bans: ['skarmory'] };
    const doc = makeDoc(
      [stamp(pickMade({ playerId: 'p1', monId: 'venusaur', round: 1, pickIndex: 0 }), 4)],
      config,
    );

    const first = recapOf(doc);
    (first[0]?.monIds as string[]).push('charizard');
    (first[0] as RecapEntry).correction = 'corrects';

    const second = recapOf(doc);

    expect(second[0]?.monIds).toEqual(['skarmory']);
    expect(second.every((entry) => entry.correction === 'none')).toBe(true);
    expect(doc.log).toHaveLength(1);
  });
});
