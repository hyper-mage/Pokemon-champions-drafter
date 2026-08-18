/**
 * Selectors — every piece of derived data, and nothing stored.
 *
 * Sync rule 3: the available pool, the teams, the current turn and completion are all
 * computed from the folded log. None of them is a field. These tests exist as much to
 * pin that boundary as to check the arithmetic — if a selector below ever starts
 * reading a field that a reducer wrote for it, derived data has moved into state and
 * the stale-duplicate bug class is back.
 *
 * Zero mocks, as everywhere in `src/core`.
 */

import { describe, expect, it } from 'vitest';

import committedSnapshot from '../../public/data/roster.mb.json';
import {
  draftStarted,
  pickMade,
  poolBuilt,
  type Action,
  type Intent,
  type RoundKind,
} from '../../src/core/actions';
import {
  initialState,
  SCHEMA_VERSION,
  type DraftState,
  type TournamentConfig,
  type TournamentDoc,
} from '../../src/core/model';
import { fold } from '../../src/core/reduce';
import type { RosterEntry, RosterSnapshot } from '../../src/core/roster/types';
import {
  selectAvailablePool,
  selectCardPlayOrder,
  selectCardsPlayedThisRound,
  selectCurrentRound,
  selectCurrentTurn,
  selectHand,
  selectIsComplete,
  selectPickCount,
  selectPlayerName,
  selectResolvedOrder,
  selectRoundEligibleIds,
  selectRoundKind,
  selectSchedule,
  selectSlotKind,
  selectSlotStone,
  selectTeams,
} from '../../src/core/selectors';

const CREATED_AT = 1_700_000_000_000;

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
};

const ORDER = ['p1', 'p2'];

function stamp(intent: Intent, seq: number): Action {
  return { ...intent, seq, at: CREATED_AT + seq, actorId: 'host' };
}

function makeDoc(log: readonly Action[]): TournamentDoc {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'tournament-fixture',
    createdAt: CREATED_AT,
    config: CONFIG,
    rng: { seed: 1, cursor: 0 },
    log: [...log],
  };
}

/** A started draft with `count` legal alternating picks already made. */
function stateAfter(count: number) {
  const log: Action[] = [
    stamp(poolBuilt(POOL, CONFIG.rosterVersion, CONFIG.rosterChecksum, 7, 0), 0),
    stamp(draftStarted(ORDER, 9), 1),
  ];

  for (let pickIndex = 0; pickIndex < count; pickIndex++) {
    const playerId = ORDER[pickIndex % ORDER.length] as string;
    const round = Math.floor(pickIndex / ORDER.length) + 1;
    log.push(
      stamp(pickMade({ playerId, monId: POOL[pickIndex] as string, round, pickIndex }), log.length),
    );
  }

  return fold(makeDoc(log));
}

describe('selectAvailablePool', () => {
  it('is empty before the pool has been built', () => {
    expect(selectAvailablePool(initialState(CONFIG))).toEqual([]);
  });

  it('is the whole pool before any pick', () => {
    expect(selectAvailablePool(stateAfter(0))).toEqual(POOL);
  });

  it('removes every picked id', () => {
    const available = selectAvailablePool(stateAfter(3));
    expect(available).not.toContain('venusaur');
    expect(available).not.toContain('charizard');
    expect(available).not.toContain('blastoise');
    expect(available).toHaveLength(POOL.length - 3);
  });

  it('preserves the pool’s original order', () => {
    // The pool ids are built in display order, so a filter that reordered them would
    // shuffle the grid under the host's cursor on every pick.
    const outOfOrderPicks: Action[] = [
      stamp(poolBuilt(POOL, 'mb', 'abc123', 7, 0), 0),
      stamp(draftStarted(ORDER, 9), 1),
      stamp(pickMade({ playerId: 'p1', monId: 'starmie', round: 1, pickIndex: 0 }), 2),
      stamp(pickMade({ playerId: 'p2', monId: 'venusaur', round: 1, pickIndex: 1 }), 3),
      stamp(pickMade({ playerId: 'p1', monId: 'garchomp', round: 2, pickIndex: 2 }), 4),
    ];

    expect(selectAvailablePool(fold(makeDoc(outOfOrderPicks)))).toEqual([
      'charizard',
      'blastoise',
      'rotomwash',
      'skarmory',
      'tyranitar',
      'gardevoir',
      'dragonite',
      'meganium',
      'victreebel',
      'feraligatr',
    ]);
  });

  it('shrinks by exactly one on every pick', () => {
    for (let picks = 0; picks <= 12; picks++) {
      expect(selectAvailablePool(stateAfter(picks)), `after ${picks} picks`).toHaveLength(
        POOL.length - picks,
      );
    }
  });
});

describe('selectTeams', () => {
  it('gives every player a slot array as long as the round count, filled with null', () => {
    const teams = selectTeams(initialState(CONFIG));

    expect(Object.keys(teams).sort()).toEqual(['p1', 'p2']);
    expect(teams['p1']).toEqual([null, null, null, null, null, null]);
    expect(teams['p2']).toEqual([null, null, null, null, null, null]);
  });

  it('places each pick in its own round slot', () => {
    const teams = selectTeams(stateAfter(5));

    expect(teams['p1']).toEqual(['venusaur', 'blastoise', 'rotomwash', null, null, null]);
    expect(teams['p2']).toEqual(['charizard', 'garchomp', null, null, null, null]);
  });

  it('fills all twelve slots at the end of the draft', () => {
    const teams = selectTeams(stateAfter(12));

    expect(teams['p1']?.filter((slot) => slot !== null)).toHaveLength(6);
    expect(teams['p2']?.filter((slot) => slot !== null)).toHaveLength(6);
  });

  it('iterates players deterministically rather than by object key order', () => {
    // Sync rule 14. Key order survives a JSON round trip in practice, but the board
    // row order must not be the thing that proves it.
    const reversed: TournamentConfig = {
      ...CONFIG,
      players: [...CONFIG.players].reverse(),
    };

    expect(Object.keys(selectTeams(initialState(reversed)))).toEqual(['p1', 'p2']);
  });
});

describe('selectCurrentTurn', () => {
  it('is null before the draft has started', () => {
    expect(selectCurrentTurn(initialState(CONFIG))).toBeNull();
  });

  it('opens on round 1 with the first player in the recorded order', () => {
    expect(selectCurrentTurn(stateAfter(0))).toEqual({ round: 1, playerId: 'p1', pickIndex: 0 });
  });

  it('alternates strictly and rolls the round after both players have picked', () => {
    const expected = [
      { round: 1, playerId: 'p1', pickIndex: 0 },
      { round: 1, playerId: 'p2', pickIndex: 1 },
      { round: 2, playerId: 'p1', pickIndex: 2 },
      { round: 2, playerId: 'p2', pickIndex: 3 },
      { round: 3, playerId: 'p1', pickIndex: 4 },
      { round: 3, playerId: 'p2', pickIndex: 5 },
      { round: 4, playerId: 'p1', pickIndex: 6 },
      { round: 4, playerId: 'p2', pickIndex: 7 },
      { round: 5, playerId: 'p1', pickIndex: 8 },
      { round: 5, playerId: 'p2', pickIndex: 9 },
      { round: 6, playerId: 'p1', pickIndex: 10 },
      { round: 6, playerId: 'p2', pickIndex: 11 },
    ];

    expected.forEach((turn, picksMade) => {
      expect(selectCurrentTurn(stateAfter(picksMade)), `after ${picksMade} picks`).toEqual(turn);
    });
  });

  it('follows the recorded order, not the config order', () => {
    const log: Action[] = [
      stamp(poolBuilt(POOL, 'mb', 'abc123', 7, 0), 0),
      stamp(draftStarted(['p2', 'p1'], 9), 1),
    ];

    expect(selectCurrentTurn(fold(makeDoc(log)))).toEqual({
      round: 1,
      playerId: 'p2',
      pickIndex: 0,
    });
  });

  it('is null once the draft is complete', () => {
    expect(selectCurrentTurn(stateAfter(12))).toBeNull();
  });
});

describe('selectIsComplete', () => {
  it('is false until every player has six picks', () => {
    for (let picks = 0; picks < 12; picks++) {
      expect(selectIsComplete(stateAfter(picks)), `after ${picks} picks`).toBe(false);
    }
  });

  it('is true exactly when every player has six picks', () => {
    expect(selectIsComplete(stateAfter(12))).toBe(true);
  });

  it('is false on a fresh state with no pool and no order', () => {
    expect(selectIsComplete(initialState(CONFIG))).toBe(false);
  });
});

describe('selectPickCount', () => {
  it('counts the picks recorded so far', () => {
    expect(selectPickCount(initialState(CONFIG))).toBe(0);
    expect(selectPickCount(stateAfter(7))).toBe(7);
    expect(selectPickCount(stateAfter(12))).toBe(12);
  });
});

describe('selectPlayerName', () => {
  it('resolves a configured player id to its display name', () => {
    expect(selectPlayerName(initialState(CONFIG), 'p1')).toBe('Player 1');
    expect(selectPlayerName(initialState(CONFIG), 'p2')).toBe('Player 2');
  });

  it('returns null for an id the tournament does not know', () => {
    expect(selectPlayerName(initialState(CONFIG), 'ghost')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The compiled schedule — RULE-02, D-07, D-08
// ---------------------------------------------------------------------------

/** A state carrying the given kinds as its schedule, built without a reducer arm. */
function stateWithSchedule(kinds: readonly RoundKind[]): DraftState {
  return {
    ...initialState(CONFIG),
    schedule: kinds.map((kind, position) => ({ index: position + 1, kind })),
  };
}

describe('selectSchedule', () => {
  it('returns the stored schedule when it matches the configured round count', () => {
    const state = stateWithSchedule(['mega', 'mega', 'open', 'open', 'open', 'open']);

    expect(selectSchedule(state)).toEqual([
      { index: 1, kind: 'mega' },
      { index: 2, kind: 'mega' },
      { index: 3, kind: 'open' },
      { index: 4, kind: 'open' },
      { index: 5, kind: 'open' },
      { index: 6, kind: 'open' },
    ]);
  });

  it('folds an empty schedule as all-open, which is what that draft actually ran', () => {
    // A schema-2 tournament was drafted before the compiler existed and ran flat rounds.
    // `migrateV2ToV3` performs no log surgery, so its log carries no `schedule/compiled`
    // and its folded schedule is empty. All-open is the truth about it, not a guess.
    const state = initialState(CONFIG);
    expect(state.schedule).toEqual([]);

    const schedule = selectSchedule(state);
    expect(schedule).toHaveLength(CONFIG.rounds);
    expect(schedule.map((spec) => spec.kind)).toEqual(['open', 'open', 'open', 'open', 'open', 'open']);
    expect(schedule.map((spec) => spec.index)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('falls back to all-open when the stored length disagrees with the round count', () => {
    const short = stateWithSchedule(['mega', 'mega']);

    expect(selectSchedule(short)).toHaveLength(CONFIG.rounds);
    expect(selectSchedule(short).every((spec) => spec.kind === 'open')).toBe(true);
  });

  it('returns a fresh copy — mutating it cannot reach the state', () => {
    const state = stateWithSchedule(['mega', 'open', 'open', 'open', 'open', 'open']);

    const schedule = selectSchedule(state);
    const first = schedule[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    first.kind = 'open';
    schedule.push({ index: 99, kind: 'mega' });

    expect(state.schedule).toHaveLength(CONFIG.rounds);
    expect(state.schedule[0]).toEqual({ index: 1, kind: 'mega' });
  });
});

describe('selectRoundKind', () => {
  const state = stateWithSchedule(['open', 'mega', 'open', 'mega', 'open', 'open']);

  it('answers every round in range from the stored schedule', () => {
    expect([1, 2, 3, 4, 5, 6].map((round) => selectRoundKind(state, round))).toEqual([
      'open',
      'mega',
      'open',
      'mega',
      'open',
      'open',
    ]);
  });

  it('answers open for a round outside 1..rounds rather than throwing', () => {
    for (const round of [0, -1, 7, 600]) {
      expect(selectRoundKind(state, round)).toBe('open');
    }
  });

  it('answers open for every round of a tournament with no compiled schedule', () => {
    const migrated = initialState(CONFIG);
    expect([1, 2, 3, 4, 5, 6].map((round) => selectRoundKind(migrated, round))).toEqual([
      'open',
      'open',
      'open',
      'open',
      'open',
      'open',
    ]);
  });
});

describe('selectSlotKind', () => {
  it('inverts selectTeams’s round-to-slot join for every slot', () => {
    // `selectTeams` files a round-`r` pick into slot `r - 1` (`selectors.ts:63-79`).
    // Nothing stores a slot's type — D-08 derives it, so the two cannot disagree.
    const state = stateWithSchedule(['mega', 'open', 'mega', 'open', 'open', 'open']);

    for (let slotIndex = 0; slotIndex < CONFIG.rounds; slotIndex++) {
      expect(selectSlotKind(state, slotIndex)).toBe(selectRoundKind(state, slotIndex + 1));
    }

    expect([0, 1, 2, 3, 4, 5].map((slot) => selectSlotKind(state, slot))).toEqual([
      'mega',
      'open',
      'mega',
      'open',
      'open',
      'open',
    ]);
  });

  it('answers open for a slot index the schedule has no round for', () => {
    const state = stateWithSchedule(['mega', 'open', 'open', 'open', 'open', 'open']);
    expect(selectSlotKind(state, -1)).toBe('open');
    expect(selectSlotKind(state, 6)).toBe('open');
  });
});

describe('scaling past two players', () => {
  // Phase 2 raises the player count. Nothing in these selectors may assume two.
  const EIGHT: TournamentConfig = {
    ...CONFIG,
    players: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'].map((id) => ({
      id,
      name: `Player ${id.slice(1)}`,
    })),
  };

  const bigPool = Array.from({ length: 60 }, (_, index) => `mon${String(index).padStart(2, '0')}`);
  const bigOrder = EIGHT.players.map((player) => player.id);

  function eightPlayerState(count: number) {
    const log: Action[] = [
      stamp(poolBuilt(bigPool, 'mb', 'abc123', 7, 0), 0),
      stamp(draftStarted(bigOrder, 9), 1),
    ];
    for (let pickIndex = 0; pickIndex < count; pickIndex++) {
      log.push(
        stamp(
          pickMade({
            playerId: bigOrder[pickIndex % bigOrder.length] as string,
            monId: bigPool[pickIndex] as string,
            round: Math.floor(pickIndex / bigOrder.length) + 1,
            pickIndex,
          }),
          log.length,
        ),
      );
    }
    return fold(
      {
        schemaVersion: SCHEMA_VERSION,
        id: 'eight',
        createdAt: CREATED_AT,
        config: EIGHT,
        rng: { seed: 1, cursor: 0 },
        log,
      },
    );
  }

  it('runs forty-eight picks across eight players and six rounds', () => {
    const state = eightPlayerState(48);

    expect(selectIsComplete(state)).toBe(true);
    expect(selectCurrentTurn(state)).toBeNull();
    expect(Object.keys(selectTeams(state))).toHaveLength(8);
    for (const slots of Object.values(selectTeams(state))) {
      expect(slots.filter((slot) => slot !== null)).toHaveLength(6);
    }
  });

  it('advances the round only after all eight have picked', () => {
    expect(selectCurrentTurn(eightPlayerState(7))).toEqual({
      round: 1,
      playerId: 'p8',
      pickIndex: 7,
    });
    expect(selectCurrentTurn(eightPlayerState(8))).toEqual({
      round: 2,
      playerId: 'p1',
      pickIndex: 8,
    });
  });
});

// ---------------------------------------------------------------------------
// The round's own offer, and the slot that decides the export — RULE-03, D-04
// ---------------------------------------------------------------------------

/*
 * These two selectors take the roster as an ARGUMENT. `DraftState` holds no roster and
 * must not gain one — the fold is a cache of the log (`model.ts:11-13`), and 235 entries
 * in it would contradict that and the serializability posture besides. The precedent is
 * `checkFeasibility(input.entries)` and `bannedEntries(entries, bans)`.
 *
 * Real ids and real FORME ids from the committed snapshot, never strings typed here: the
 * stone names are the ones that reach a paste the host hands to a third-party site, so a
 * literal in this file would be asserting the test's spelling rather than the roster's.
 */

const SNAPSHOT = committedSnapshot as unknown as RosterSnapshot;
const ENTRIES: readonly RosterEntry[] = SNAPSHOT.entries;

function rosterEntry(id: string): RosterEntry {
  const found = ENTRIES.find((candidate) => candidate.id === id);
  expect(found, `expected ${id} in the committed snapshot`).toBeDefined();
  return found as RosterEntry;
}

/** A forme looked up by its `forme` FIELD, never by taking a name apart. */
function formeOf(speciesId: string, forme: string) {
  const found = rosterEntry(speciesId).megaFormes.find((candidate) => candidate.forme === forme);
  expect(found, `expected ${speciesId} to carry a ${forme} forme`).toBeDefined();
  return found as NonNullable<typeof found>;
}

interface PlacedPick {
  playerId: string;
  monId: string;
  round: number;
}

/**
 * A started draft over an arbitrary config, with a schedule and the given picks.
 *
 * The schedule is spread onto the folded state rather than dispatched, following
 * `stateWithSchedule` above: what is under test here is what the selectors do with a
 * schedule, and `schedule/compiled`'s own round trip is `reduce.test.ts`'s subject.
 */
function stateWith(
  config: TournamentConfig,
  kinds: readonly RoundKind[],
  picks: readonly PlacedPick[],
): DraftState {
  const log: Action[] = [
    stamp(poolBuilt(POOL, config.rosterVersion, config.rosterChecksum, 7, 0), 0),
    stamp(draftStarted(ORDER, 9), 1),
  ];

  picks.forEach((pick, pickIndex) => {
    log.push(stamp(pickMade({ ...pick, pickIndex }), log.length));
  });

  const folded = fold({ ...makeDoc(log), config });
  return { ...folded, schedule: kinds.map((kind, position) => ({ index: position + 1, kind })) };
}

const ALL_OPEN: readonly RoundKind[] = ['open', 'open', 'open', 'open', 'open', 'open'];
const MEGA_FIRST: readonly RoundKind[] = ['mega', 'mega', 'open', 'open', 'open', 'open'];

/** Pool ids whose species carries at least one Mega forme, in pool order. */
const POOL_MEGA_CAPABLE = POOL.filter((id) => rosterEntry(id).megaFormes.length > 0);

describe('selectRoundEligibleIds', () => {
  it('is the whole available pool for an open round', () => {
    const state = stateWith(CONFIG, MEGA_FIRST, []);

    expect(selectRoundEligibleIds(state, ENTRIES, 3)).toEqual(selectAvailablePool(state));
  });

  it('offers only species that can still Mega in a Mega round', () => {
    const state = stateWith(CONFIG, MEGA_FIRST, []);

    const eligible = selectRoundEligibleIds(state, ENTRIES, 1);
    expect(eligible).toEqual(POOL_MEGA_CAPABLE);
    // Rotom-Wash is in the pool and cannot Mega. A restriction that admitted it would be
    // no restriction at all.
    expect(selectAvailablePool(state)).toContain('rotomwash');
    expect(eligible).not.toContain('rotomwash');
  });

  it('subtracts picks, in both kinds of round', () => {
    const state = stateWith(CONFIG, MEGA_FIRST, [
      { playerId: 'p1', monId: 'venusaur', round: 1 },
      { playerId: 'p2', monId: 'rotomwash', round: 1 },
    ]);

    expect(selectRoundEligibleIds(state, ENTRIES, 1)).not.toContain('venusaur');
    expect(selectRoundEligibleIds(state, ENTRIES, 3)).not.toContain('venusaur');
    expect(selectRoundEligibleIds(state, ENTRIES, 3)).not.toContain('rotomwash');
  });

  it('reads the DOCUMENT’s own Mega-forme bans, not today’s defaults', () => {
    const banned: TournamentConfig = {
      ...CONFIG,
      megaFormeBans: [formeOf('venusaur', 'Mega').id],
    };
    const state = stateWith(banned, MEGA_FIRST, []);

    expect(selectRoundEligibleIds(state, ENTRIES, 1)).not.toContain('venusaur');
    // And it stays draftable in an open round — D-10 as behaviour, not as an error.
    expect(selectRoundEligibleIds(state, ENTRIES, 3)).toContain('venusaur');
  });

  it('reads the document’s own X/Y pin, and a ban beats the pin', () => {
    const pinned: TournamentConfig = {
      ...CONFIG,
      dualMegaChoices: [{ speciesId: 'charizard', forme: 'x' }],
      megaFormeBans: [formeOf('charizard', 'Mega-X').id],
    };
    const state = stateWith(pinned, MEGA_FIRST, []);

    // Pinned to X with X banned leaves Charizard nothing it is allowed to become.
    expect(selectRoundEligibleIds(state, ENTRIES, 1)).not.toContain('charizard');

    const unpinned = stateWith({ ...pinned, dualMegaChoices: [] }, MEGA_FIRST, []);
    expect(selectRoundEligibleIds(unpinned, ENTRIES, 1)).toContain('charizard');
  });

  it('drops a pool id the current roster no longer carries from a Mega round', () => {
    const state = stateWith(CONFIG, MEGA_FIRST, []);
    const drifted: DraftState = { ...state, poolIds: [...state.poolIds, 'missingno'] };

    // Eligibility cannot be established for a species that is not there. The COUNT of
    // those is the roster-drift notice's job, not this selector's.
    expect(selectRoundEligibleIds(drifted, ENTRIES, 1)).not.toContain('missingno');
    expect(selectRoundEligibleIds(drifted, ENTRIES, 3)).toContain('missingno');
  });

  it('answers a round number out of range as open rather than throwing', () => {
    const state = stateWith(CONFIG, MEGA_FIRST, []);

    for (const round of [0, -1, 7, 600]) {
      expect(selectRoundEligibleIds(state, ENTRIES, round)).toEqual(selectAvailablePool(state));
    }
  });

  it('returns a fresh array — mutating it cannot reach the state', () => {
    const state = stateWith(CONFIG, MEGA_FIRST, []);

    const eligible = selectRoundEligibleIds(state, ENTRIES, 1);
    eligible.push('missingno');
    eligible.length = 1;

    expect(state.poolIds).toEqual(POOL);
    expect(selectRoundEligibleIds(state, ENTRIES, 1)).toEqual(POOL_MEGA_CAPABLE);
  });

  it('leaves the board alone — an illegal pick in the log is still on the team', () => {
    // 03-RESEARCH: `selectTeams` must not be filtered by this. The board shows what the
    // log says; a hand-edited document is REPORTED, never repaired and never hidden.
    const state = stateWith(CONFIG, MEGA_FIRST, [
      { playerId: 'p1', monId: 'rotomwash', round: 1 },
    ]);

    expect(selectTeams(state)['p1']?.[0]).toBe('rotomwash');
    expect(selectRoundEligibleIds(state, ENTRIES, 1)).not.toContain('rotomwash');
  });
});

describe('selectSlotStone', () => {
  it('is null for an empty slot', () => {
    const state = stateWith(CONFIG, MEGA_FIRST, []);

    expect(selectSlotStone(state, ENTRIES, 'p1', 0)).toBeNull();
  });

  /**
   * D-04, and the assertion that has to be made from the SLOT side.
   *
   * A Mega-capable species drafted into an open round occupies an untyped slot and exports
   * bare. Reading the stone off the species instead would pass every test of the species
   * table and produce an export that silently claims a Mega nobody drafted.
   */
  it('is null for a Mega-CAPABLE species sitting in an open slot', () => {
    const state = stateWith(CONFIG, ALL_OPEN, [{ playerId: 'p1', monId: 'venusaur', round: 1 }]);

    expect(rosterEntry('venusaur').megaCapable).toBe(true);
    expect(selectSlotStone(state, ENTRIES, 'p1', 0)).toBeNull();
  });

  it('is the forme’s own stone for a filled Mega slot', () => {
    const state = stateWith(CONFIG, MEGA_FIRST, [{ playerId: 'p1', monId: 'venusaur', round: 1 }]);

    expect(selectSlotStone(state, ENTRIES, 'p1', 0)).toBe(formeOf('venusaur', 'Mega').requiredItem);
  });

  it('is null for a species with no Mega forme at all, rather than an error', () => {
    const state = stateWith(CONFIG, MEGA_FIRST, [{ playerId: 'p1', monId: 'rotomwash', round: 1 }]);

    expect(selectSlotStone(state, ENTRIES, 'p1', 0)).toBeNull();
  });

  it('follows the X/Y pin for a dual-Mega species', () => {
    const pinned: TournamentConfig = {
      ...CONFIG,
      dualMegaChoices: [{ speciesId: 'charizard', forme: 'y' }],
    };
    const state = stateWith(pinned, MEGA_FIRST, [{ playerId: 'p1', monId: 'charizard', round: 1 }]);

    expect(selectSlotStone(state, ENTRIES, 'p1', 0)).toBe(
      formeOf('charizard', 'Mega-Y').requiredItem,
    );
  });

  it('resolves an unpinned dual-Mega species through the ban list', () => {
    const banned: TournamentConfig = {
      ...CONFIG,
      megaFormeBans: [formeOf('charizard', 'Mega-X').id],
    };
    const state = stateWith(banned, MEGA_FIRST, [{ playerId: 'p1', monId: 'charizard', round: 1 }]);

    // `'either'` is what an absent choice means, so the only forme left is the Y one.
    expect(selectSlotStone(state, ENTRIES, 'p1', 0)).toBe(
      formeOf('charizard', 'Mega-Y').requiredItem,
    );
  });

  it('is null when every forme of the picked species is banned', () => {
    const banned: TournamentConfig = {
      ...CONFIG,
      megaFormeBans: [formeOf('charizard', 'Mega-X').id, formeOf('charizard', 'Mega-Y').id],
    };
    const state = stateWith(banned, MEGA_FIRST, [{ playerId: 'p1', monId: 'charizard', round: 1 }]);

    // The slot exports bare rather than failing. That case is reachable only from an
    // imported document — the Mega round would never have offered Charizard.
    expect(selectSlotStone(state, ENTRIES, 'p1', 0)).toBeNull();
  });

  it('is null for a player the tournament does not have, and for a slot out of range', () => {
    const state = stateWith(CONFIG, MEGA_FIRST, [{ playerId: 'p1', monId: 'venusaur', round: 1 }]);

    expect(selectSlotStone(state, ENTRIES, 'nobody', 0)).toBeNull();
    expect(selectSlotStone(state, ENTRIES, 'p1', -1)).toBeNull();
    expect(selectSlotStone(state, ENTRIES, 'p1', 99)).toBeNull();
  });

  it('is null for a pick the current roster no longer carries', () => {
    const state = stateWith(CONFIG, MEGA_FIRST, []);
    const drifted: DraftState = {
      ...state,
      picks: [{ playerId: 'p1', monId: 'missingno', round: 1, pickIndex: 0, seq: 2 }],
    };

    expect(selectSlotStone(drifted, ENTRIES, 'p1', 0)).toBeNull();
  });

  it('reads the SCHEDULE, so a reordered Mega round moves the stone with it', () => {
    const reordered: readonly RoundKind[] = ['open', 'mega', 'open', 'open', 'open', 'open'];
    const state = stateWith(CONFIG, reordered, [
      { playerId: 'p1', monId: 'venusaur', round: 1 },
      { playerId: 'p2', monId: 'blastoise', round: 1 },
      { playerId: 'p1', monId: 'garchomp', round: 2 },
    ]);

    expect(selectSlotStone(state, ENTRIES, 'p1', 0)).toBeNull();
    expect(selectSlotStone(state, ENTRIES, 'p1', 1)).toBe(formeOf('garchomp', 'Mega').requiredItem);
  });
});

// ---------------------------------------------------------------------------
// The card selectors, over this file's two-player fixture — CARD-01, CARD-03, CARD-06
// ---------------------------------------------------------------------------

describe('the card selectors on a document that has dealt none', () => {
  it('starts the fold with an empty card log and no resolved orders', () => {
    const fresh = initialState(CONFIG);

    expect(fresh.cardsPlayed).toEqual([]);
    expect(fresh.resolvedOrders).toEqual([]);
  });

  it('hands every player a full hand, one card per configured round', () => {
    const state = stateAfter(0);

    expect(selectHand(state, 'p1')).toEqual([1, 2, 3, 4, 5, 6]);
    expect(selectHand(state, 'p2')).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('reads the card-play order off the recorded starting order', () => {
    const state = stateAfter(0);

    expect(selectCardPlayOrder(state, 1)).toEqual(state.order);
    expect(selectCardPlayOrder(state, 2)).toEqual([...state.order].reverse());
  });

  it('tracks the round the draft is standing in as the picks land', () => {
    // The same arithmetic `selectCurrentTurn` runs, exposed on its own so the card phase
    // can ask for the round without asking whose turn it is.
    expect(selectCurrentRound(stateAfter(0))).toBe(1);
    expect(selectCurrentRound(stateAfter(1))).toBe(1);
    expect(selectCurrentRound(stateAfter(2))).toBe(2);
    expect(selectCurrentRound(stateAfter(11))).toBe(6);
    expect(selectCurrentRound(stateAfter(12))).toBe(6);
  });

  it('reports no plays and no resolved order for any round', () => {
    const state = stateAfter(4);

    for (let round = 1; round <= CONFIG.rounds; round++) {
      expect(selectCardsPlayedThisRound(state, round), `round ${round}`).toEqual([]);
      expect(selectResolvedOrder(state, round), `round ${round}`).toBeNull();
    }
  });
});
