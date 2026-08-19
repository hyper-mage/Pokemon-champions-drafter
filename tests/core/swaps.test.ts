/**
 * Swaps — SWAP-02, SWAP-05, SWAP-06, RULE-05.
 *
 * Zero mocks, like every file under `tests/core/`. Modelled on `tests/core/reduce.test.ts`,
 * whose `makeDoc` builder this copies, because the questions are the same shape: what one
 * action does to the fold, what `canApply` refuses, and whether a round trip reproduces it.
 *
 * ## What these tests are actually watching, which is NOT the board
 *
 * `selectTeams` assigns last-write-wins into `slots[round - 1]`, so it renders the right
 * team whether `apply(SWAP_MADE)` replaces the pick or appends a second one. The wrong
 * implementation therefore looks CORRECT on the board and is only visible in two places:
 * `selectAvailablePool`, where the swapped-out species never comes back, and
 * `picks.length`, which drives `selectCurrentTurn`'s `pickIndex` and would silently
 * advance the turn. 03-RESEARCH Pitfall 4 states this as "test the pool, not the board",
 * and the two assertions that matter most in this file are the pool ones.
 */

import { describe, expect, it } from 'vitest';

import {
  cardsPlayed,
  draftStarted,
  orderResolved,
  pickMade,
  poolBuilt,
  scheduleCompiled,
  SWAP_MADE,
  SWAP_PASSED,
  swapMade,
  swapPassed,
  isSwapMadeAction,
  isSwapPassedAction,
  type Action,
  type AnyAction,
  type Intent,
  type RoundSpec,
} from '../../src/core/actions';
import { parseTournamentFile } from '../../src/core/import-guard';
import { isMegaEligible } from '../../src/core/mega';
import {
  initialState,
  SCHEMA_VERSION,
  type TournamentConfig,
  type TournamentDoc,
} from '../../src/core/model';
import { apply, canApply, fold } from '../../src/core/reduce';
import type { MegaForme, RosterEntry } from '../../src/core/roster/types';
import {
  selectAvailablePool,
  selectCurrentTurn,
  selectIsComplete,
  selectIsTournamentComplete,
  selectPhase,
  selectResolvedOrder,
  selectSwapOrderSource,
  selectSwapRoundOrder,
  selectSwapRoundPosition,
  selectSwapsRemaining,
  selectSwapTargets,
  selectTeams,
} from '../../src/core/selectors';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CREATED_AT = 1_700_000_000_000;
const SEED = 0x5f3a91c2;

/**
 * Thirteen ids. Two of them — `rotomwash` and `skarmory` — carry NO Mega forme, which is
 * the whole reason the list is not uniform: a Mega slot's offer that happened to exclude
 * nothing would assert nothing.
 */
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

const NON_MEGA = new Set(['rotomwash', 'skarmory']);

function megaFormeFor(id: string): MegaForme {
  return {
    id: `${id}mega`,
    name: `${id}-Mega`,
    forme: 'Mega',
    requiredItem: `${id}ite`,
    spriteId: `${id}-mega`,
    types: ['Normal'],
    baseStats: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
  };
}

function entryFor(id: string, index: number): RosterEntry {
  const megaCapable = !NON_MEGA.has(id);
  return {
    id,
    // Deliberately not derived from the id by a string transform: `name` is for rendering
    // and export only, and nothing in this file may compare one.
    name: `Mon ${index}`,
    num: index + 1,
    types: ['Normal'],
    baseStats: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
    baseSpeciesId: id,
    forme: null,
    megaCapable,
    megaFormes: megaCapable ? [megaFormeFor(id)] : [],
    spriteId: id,
    spriteMissing: true,
  };
}

const ENTRIES: RosterEntry[] = POOL.map((id, index) => entryFor(id, index));

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
  megasRequiredPerTeam: 1,
  dualMegaChoices: [],
  depth: 'draftOnly',
  rules: [{ kind: 'mega', count: 1 }],
  megaFormeBans: [],
  swapBudget: 2,
  swapRounds: 0,
};

const ORDER = ['p1', 'p2'];

/** Round 1 is Mega, the rest open — the canonical order for `megasRequiredPerTeam: 1`. */
const SCHEDULE: RoundSpec[] = [
  { index: 1, kind: 'mega' },
  { index: 2, kind: 'open' },
  { index: 3, kind: 'open' },
  { index: 4, kind: 'open' },
  { index: 5, kind: 'open' },
  { index: 6, kind: 'open' },
];

function stamp(intent: Intent, seq: number): Action {
  return { ...intent, seq, at: CREATED_AT + seq, actorId: 'host' };
}

/** `max(seq) + 1`, exactly as `store.ts` allocates it. Never `log.length`. */
function nextSeqOf(log: readonly Action[]): number {
  return log.reduce((highest, action) => Math.max(highest, action.seq), -1) + 1;
}

function makeDoc(log: readonly Action[] = [], config: TournamentConfig = CONFIG): TournamentDoc {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'tournament-fixture',
    createdAt: CREATED_AT,
    config,
    rng: { seed: SEED, cursor: 0 },
    log: [...log],
  };
}

function openingLog(): Action[] {
  return [
    stamp(poolBuilt(POOL, CONFIG.rosterVersion, CONFIG.rosterChecksum, 7, 11), 0),
    stamp(scheduleCompiled(SCHEDULE), 1),
    stamp(draftStarted(ORDER, 9), 2),
  ];
}

/**
 * `count` picks, with every round's cards played and resolved BEFORE that round's picks —
 * the order the app actually writes them.
 *
 * Both players play the round's own number, so each round ties on value and `seq` breaks
 * it back into `state.order`. Round 1's two picks are `venusaur` and `charizard`, both
 * Mega-capable, so the fixture is a legal draft rather than merely a foldable one.
 */
function withCardedPicks(log: readonly Action[], count: number): Action[] {
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

/**
 * Round 1 filled by both players and round 2 bid and resolved, so `p1` is on the clock
 * for round 2 with a filled round-1 Mega slot behind them.
 *
 * That is D-25's exact situation: the swap spends budget, and the turn it was spent on
 * still ends with a pick.
 */
function armedLog(): Action[] {
  return withCardedPicks(openingLog(), 2);
}

function withSwap(log: readonly Action[], intent: Intent): Action[] {
  return [...log, stamp(intent, nextSeqOf(log))];
}

const SWAP: Intent = swapMade({
  playerId: 'p1',
  round: 1,
  outMonId: 'venusaur',
  inMonId: 'blastoise',
  swapRound: 0,
});

function reason(result: ReturnType<typeof canApply>): string {
  return result.ok ? 'ok' : result.reason;
}

// ---------------------------------------------------------------------------

describe('swapMade, the action', () => {
  it('carries every field including swapRound, and never the envelope', () => {
    expect(SWAP).toEqual({
      type: SWAP_MADE,
      playerId: 'p1',
      round: 1,
      outMonId: 'venusaur',
      inMonId: 'blastoise',
      swapRound: 0,
    });
  });

  it('types a payload structurally, and refuses one missing a field', () => {
    expect(isSwapMadeAction(stamp(SWAP, 9))).toBe(true);

    const noOut = { ...stamp(SWAP, 9) } as unknown as Record<string, unknown>;
    delete noOut['outMonId'];
    expect(isSwapMadeAction(noOut as unknown as AnyAction)).toBe(false);

    // `swapRound` is 03-11's field and has no consumer yet, which is exactly why it is
    // guarded now: a payload that loses it silently would lose it in a round trip too.
    const noSwapRound = { ...stamp(SWAP, 9) } as unknown as Record<string, unknown>;
    delete noSwapRound['swapRound'];
    expect(isSwapMadeAction(noSwapRound as unknown as AnyAction)).toBe(false);
  });
});

describe('apply(SWAP_MADE) — replacement, never an append', () => {
  const before = fold(makeDoc(armedLog()));
  const after = fold(makeDoc(withSwap(armedLog(), SWAP)));

  it('leaves picks.length unchanged, because picks.length IS the turn', () => {
    // D-25. `selectPickCount` is `picks.length` and drives `selectCurrentTurn`'s
    // `pickIndex`; an appended second pick would silently advance the turn and leave the
    // team one pick short of six at the end.
    expect(before.picks).toHaveLength(2);
    expect(after.picks).toHaveLength(2);
  });

  it('returns the swapped-out species to the pool for everyone — D-26', () => {
    // The other half of the same argument. `selectAvailablePool` subtracts every
    // `picks[].monId`, so a returned id falls out of that one subtraction rather than
    // needing a second list — and only under replacement.
    expect(selectAvailablePool(before)).not.toContain('venusaur');
    expect(selectAvailablePool(after)).toContain('venusaur');
    expect(selectAvailablePool(after)).not.toContain('blastoise');
  });

  it('preserves the replaced pick’s original seq, round and pickIndex', () => {
    const original = before.picks[0];
    const replaced = after.picks[0];
    expect(original).toBeDefined();
    expect(replaced).toBeDefined();
    if (original === undefined || replaced === undefined) return;

    // Still the same slot-filling event; `draft/pickUndone` targets that identity.
    expect(replaced.seq).toBe(original.seq);
    expect(replaced.round).toBe(original.round);
    expect(replaced.pickIndex).toBe(original.pickIndex);
    expect(replaced.playerId).toBe(original.playerId);
    expect(replaced.monId).not.toBe(original.monId);
    expect(replaced.monId).toBe('blastoise');
  });

  it('does not move the turn — the swap spends budget, not the clock', () => {
    expect(selectCurrentTurn(after)).toEqual(selectCurrentTurn(before));
    expect(selectCurrentTurn(after)).toEqual({ round: 2, playerId: 'p1', pickIndex: 2 });
  });

  it('shows the new species in the same slot', () => {
    expect(selectTeams(before)['p1']?.[0]).toBe('venusaur');
    expect(selectTeams(after)['p1']?.[0]).toBe('blastoise');
    // The rest of the row is untouched.
    expect(selectTeams(after)['p2']?.[0]).toBe('charizard');
  });

  it('touches only the FIRST matching pick, and nothing else in the array', () => {
    expect(after.picks[1]).toEqual(before.picks[1]);
  });

  it('folds a disagreeing swap to a no-op rather than swapping the wrong slot', () => {
    // T-03-38. The action is self-describing — `playerId`, `round` AND `outMonId` must all
    // match — so a hand-edited log naming a species that is not in that slot changes
    // nothing at all, rather than replacing whatever happens to be there.
    const wrong = fold(
      makeDoc(
        withSwap(
          armedLog(),
          swapMade({
            playerId: 'p1',
            round: 1,
            outMonId: 'garchomp',
            inMonId: 'blastoise',
            swapRound: 0,
          }),
        ),
      ),
    );

    expect(wrong.picks).toEqual(before.picks);
    expect(wrong.swaps).toEqual([]);
    expect(selectAvailablePool(wrong)).toEqual(selectAvailablePool(before));
  });

  it('folds a swap naming another player’s slot to a no-op', () => {
    const wrong = fold(
      makeDoc(
        withSwap(
          armedLog(),
          swapMade({
            playerId: 'p2',
            round: 1,
            outMonId: 'venusaur',
            inMonId: 'blastoise',
            swapRound: 0,
          }),
        ),
      ),
    );

    expect(wrong.picks).toEqual(before.picks);
  });

  it('ignores a malformed payload rather than folding a swap of undefined', () => {
    const state = fold(makeDoc(armedLog()));
    const broken = { type: SWAP_MADE, playerId: 'p1', seq: 99, at: 1, actorId: 'host' };
    expect(apply(state, broken as unknown as AnyAction)).toEqual(state);
  });

  it('records the swap so the budget can be counted from the fold', () => {
    expect(after.swaps).toEqual([
      {
        playerId: 'p1',
        round: 1,
        outMonId: 'venusaur',
        inMonId: 'blastoise',
        swapRound: 0,
        seq: after.swaps[0]?.seq ?? -1,
      },
    ]);
    expect(after.swaps[0]?.seq).toBeGreaterThan(0);
  });
});

describe('selectSwapsRemaining', () => {
  it('is the budget minus that player’s recorded swaps, and nobody else’s', () => {
    const after = fold(makeDoc(withSwap(armedLog(), SWAP)));
    expect(selectSwapsRemaining(after, 'p1')).toBe(1);
    expect(selectSwapsRemaining(after, 'p2')).toBe(2);
  });

  it('is the whole budget before anything is spent', () => {
    const before = fold(makeDoc(armedLog()));
    expect(selectSwapsRemaining(before, 'p1')).toBe(2);
  });

  it('is zero rather than negative for a document claiming more swaps than it had', () => {
    // Only reachable from a hand-edited or imported log — `canApply` refuses `noSwapsLeft`
    // on origination. It is read while rendering, so a negative would reach copy as
    // "has -1 swaps left" rather than being caught anywhere.
    const budgetOne: TournamentConfig = { ...CONFIG, swapBudget: 1 };
    const log = withSwap(
      withSwap(armedLog(), SWAP),
      swapMade({
        playerId: 'p1',
        round: 1,
        outMonId: 'blastoise',
        inMonId: 'garchomp',
        swapRound: 0,
      }),
    );

    const state = fold(makeDoc(log, budgetOne));
    expect(state.swaps).toHaveLength(2);
    expect(selectSwapsRemaining(state, 'p1')).toBe(0);
  });

  it('is zero for a tournament that never enabled swaps', () => {
    const noSwaps: TournamentConfig = { ...CONFIG, swapBudget: 0 };
    expect(selectSwapsRemaining(fold(makeDoc(armedLog(), noSwaps)), 'p1')).toBe(0);
  });
});

describe('selectSwapTargets — the slot’s own predicate, SWAP-05 / SWAP-06 / RULE-05', () => {
  const state = fold(makeDoc(armedLog()));

  it('offers a Mega slot only species that can still Mega', () => {
    const targets = selectSwapTargets(state, ENTRIES, 0);
    expect(targets.length).toBeGreaterThan(0);

    for (const id of targets) {
      const entry = ENTRIES.find((candidate) => candidate.id === id);
      expect(entry).toBeDefined();
      if (entry === undefined) continue;
      expect(isMegaEligible(entry, new Set(), 'either')).toBe(true);
    }

    expect(targets).not.toContain('rotomwash');
    expect(targets).not.toContain('skarmory');
  });

  it('offers an open slot the whole leftover pool', () => {
    expect(selectSwapTargets(state, ENTRIES, 1)).toEqual(selectAvailablePool(state));
    expect(selectSwapTargets(state, ENTRIES, 1)).toContain('rotomwash');
  });

  it('never offers a species that is already on somebody’s team', () => {
    // Including the one leaving the slot: you cannot swap a Pokémon for itself, and the
    // subtraction that makes that true is `selectAvailablePool`'s rather than a special case.
    const targets = selectSwapTargets(state, ENTRIES, 0);
    expect(targets).not.toContain('venusaur');
    expect(targets).not.toContain('charizard');
  });

  it('keeps a Mega slot Mega-only AFTER a swap into it — RULE-05', () => {
    // The slot's constraint is read from the compiled schedule at swap time, so it survives
    // the swap. D-08's whole claim, asserted rather than assumed.
    const after = fold(makeDoc(withSwap(armedLog(), SWAP)));
    const targets = selectSwapTargets(after, ENTRIES, 0);

    expect(targets).toContain('venusaur');
    expect(targets).not.toContain('rotomwash');
    expect(targets).not.toContain('skarmory');
    for (const id of targets) {
      const entry = ENTRIES.find((candidate) => candidate.id === id);
      expect(entry?.megaFormes.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('drops a Mega-slot target whose only forme this document bans — D-10', () => {
    const banned: TournamentConfig = { ...CONFIG, megaFormeBans: ['blastoisemega'] };
    const state2 = fold(makeDoc(armedLog(), banned));

    expect(selectSwapTargets(state2, ENTRIES, 0)).not.toContain('blastoise');
    // Still draftable into an open slot, which is D-10 as behaviour rather than as an error.
    expect(selectSwapTargets(state2, ENTRIES, 1)).toContain('blastoise');
  });

  it('answers for a slot index the schedule does not reach, rather than throwing', () => {
    // Read while rendering. `selectRoundKind` answers `'open'` out of range and this
    // inherits that, so a caller that computed a slot index badly cannot take the screen down.
    expect(() => selectSwapTargets(state, ENTRIES, 99)).not.toThrow();
    expect(selectSwapTargets(state, ENTRIES, 99)).toEqual(selectAvailablePool(state));
  });
});

describe('canApply(SWAP_MADE)', () => {
  it('accepts the ordinary mid-draft spend', () => {
    expect(canApply(fold(makeDoc(armedLog())), stamp(SWAP, 99))).toEqual({ ok: true });
  });

  it('refuses a malformed payload first', () => {
    const broken = { type: SWAP_MADE, playerId: 'p1', seq: 99, at: 1, actorId: 'host' };
    expect(reason(canApply(fold(makeDoc(armedLog())), broken as unknown as AnyAction))).toBe(
      'malformedPayload',
    );
  });

  it('refuses before the draft has started', () => {
    const state = initialState(CONFIG);
    expect(reason(canApply(state, stamp(SWAP, 99)))).toBe('draftNotStarted');
  });

  it('refuses a player who is not on the clock', () => {
    const off = swapMade({
      playerId: 'p2',
      round: 1,
      outMonId: 'charizard',
      inMonId: 'blastoise',
      swapRound: 0,
    });
    expect(reason(canApply(fold(makeDoc(armedLog())), stamp(off, 99)))).toBe('notYourTurn');
  });

  it('refuses a slot that does not hold what the action says it holds', () => {
    const mismatch = swapMade({
      playerId: 'p1',
      round: 1,
      outMonId: 'garchomp',
      inMonId: 'blastoise',
      swapRound: 0,
    });
    expect(reason(canApply(fold(makeDoc(armedLog())), stamp(mismatch, 99)))).toBe(
      'nothingToSwap',
    );
  });

  it('refuses a round the player has not filled yet', () => {
    const empty = swapMade({
      playerId: 'p1',
      round: 4,
      outMonId: 'venusaur',
      inMonId: 'blastoise',
      swapRound: 0,
    });
    expect(reason(canApply(fold(makeDoc(armedLog())), stamp(empty, 99)))).toBe('nothingToSwap');
  });

  it('refuses a species that is not in the pool', () => {
    const taken = swapMade({
      playerId: 'p1',
      round: 1,
      outMonId: 'venusaur',
      inMonId: 'charizard',
      swapRound: 0,
    });
    expect(reason(canApply(fold(makeDoc(armedLog())), stamp(taken, 99)))).toBe('notInPool');
  });

  it('refuses once the budget is spent', () => {
    const budgetOne: TournamentConfig = { ...CONFIG, swapBudget: 1 };
    const spent = fold(makeDoc(withSwap(armedLog(), SWAP), budgetOne));
    const second = swapMade({
      playerId: 'p1',
      round: 1,
      outMonId: 'blastoise',
      inMonId: 'garchomp',
      swapRound: 0,
    });
    expect(reason(canApply(spent, stamp(second, 199)))).toBe('noSwapsLeft');
  });

  it('refuses every swap in a tournament with no budget at all', () => {
    const noSwaps: TournamentConfig = { ...CONFIG, swapBudget: 0 };
    expect(reason(canApply(fold(makeDoc(armedLog(), noSwaps)), stamp(SWAP, 99)))).toBe(
      'noSwapsLeft',
    );
  });

  it('names the slot before the budget when both are wrong', () => {
    // Rejection ORDER is the contract, not merely the set: a host told "you have no swaps
    // left" about a slot that was never theirs has been sent to the wrong problem.
    const noSwaps: TournamentConfig = { ...CONFIG, swapBudget: 0 };
    const mismatch = swapMade({
      playerId: 'p1',
      round: 1,
      outMonId: 'garchomp',
      inMonId: 'blastoise',
      swapRound: 0,
    });
    expect(reason(canApply(fold(makeDoc(armedLog(), noSwaps)), stamp(mismatch, 99)))).toBe(
      'nothingToSwap',
    );
  });

  it('does NOT refuse a swap into a species the slot’s predicate forbids', () => {
    // T-03-39, stated rather than fixed. `DraftState` holds no roster and D-07 declines to
    // materialize eligible ids, so this arm structurally cannot ask the question — exactly
    // as `draft/pickMade` cannot. The predicate is enforced by `selectSwapTargets` upstream
    // of the click. If this test ever starts failing, a validator has been added.
    const illegal = swapMade({
      playerId: 'p1',
      round: 1,
      outMonId: 'venusaur',
      inMonId: 'rotomwash',
      swapRound: 0,
    });
    expect(canApply(fold(makeDoc(armedLog())), stamp(illegal, 99))).toEqual({ ok: true });
  });
});

describe('a swapped document survives the round trip', () => {
  it('reproduces picks, swaps and the pool exactly after export, import and fold', () => {
    const doc = makeDoc(withSwap(armedLog(), SWAP));
    const original = fold(doc);

    const text = JSON.stringify(doc);
    const result = parseTournamentFile(text, text.length);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const reloaded = fold(result.doc);

    expect(reloaded.picks).toEqual(original.picks);
    expect(reloaded.swaps).toEqual(original.swaps);
    expect(selectAvailablePool(reloaded)).toEqual(selectAvailablePool(original));
    expect(selectSwapsRemaining(reloaded, 'p1')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Dedicated swap rounds — SWAP-03, SWAP-04, SWAP-07, D-28…D-31.
//
// The fixture runs the draft to completion, which for two players over six rounds is
// twelve picks out of a thirteen-id pool. The single leftover is deliberate: it is one id
// away from D-32's Exact case, and it is what makes a swap-round swap possible at all
// without somebody dropping first.
// ---------------------------------------------------------------------------

/** The same tournament, with `n` dedicated swap rounds after the last pick. */
function configWithSwapRounds(swapRounds: number, swapBudget = 2): TournamentConfig {
  return { ...CONFIG, swapRounds, swapBudget };
}

/** Every round bid, resolved and picked — `selectIsComplete` is true on this fold. */
function completeLog(): Action[] {
  return withCardedPicks(openingLog(), CONFIG.players.length * CONFIG.rounds);
}

function push(log: readonly Action[], intent: Intent): Action[] {
  return [...log, stamp(intent, nextSeqOf(log))];
}

describe('swapPassed, the action', () => {
  it('carries only the player and the swap round, and never the envelope', () => {
    expect(swapPassed({ playerId: 'p1', swapRound: 2 })).toEqual({
      type: SWAP_PASSED,
      playerId: 'p1',
      swapRound: 2,
    });
  });

  it('accepts a well-formed pass and refuses one missing swapRound', () => {
    expect(isSwapPassedAction(stamp(swapPassed({ playerId: 'p1', swapRound: 1 }), 99))).toBe(true);

    const bad = { type: SWAP_PASSED, playerId: 'p1', seq: 99, at: 1, actorId: 'host' };
    expect(isSwapPassedAction(bad as unknown as AnyAction)).toBe(false);
  });
});

describe('selectSwapRoundOrder — D-28, SWAP-04', () => {
  it('is the reverse of the LAST round’s resolved order', () => {
    const state = fold(makeDoc(completeLog(), configWithSwapRounds(2)));

    expect(selectResolvedOrder(state, CONFIG.rounds)).toEqual(ORDER);
    expect(selectSwapRoundOrder(state)).toEqual([...ORDER].reverse());
    expect(selectSwapOrderSource(state)).toBe('lastRound');
  });

  it('falls back to the reverse of the starting order, and SAYS so', () => {
    // A migrated schema-2 document: picks by strict alternation, no `order/resolved`
    // anywhere. The order is still deterministic; what changes is which source it came
    // from, and SWAP-04 requires that to be explicit rather than silent.
    let log = openingLog();
    let pickIndex = 0;
    for (let round = 1; round <= CONFIG.rounds; round++) {
      for (const playerId of ORDER) {
        log = push(log, pickMade({ playerId, monId: POOL[pickIndex] as string, round, pickIndex }));
        pickIndex += 1;
      }
    }

    const state = fold(makeDoc(log, configWithSwapRounds(1)));
    expect(selectResolvedOrder(state, CONFIG.rounds)).toBeNull();
    expect(selectSwapRoundOrder(state)).toEqual([...ORDER].reverse());
    expect(selectSwapOrderSource(state)).toBe('startingOrder');
  });

  it('never aliases the resolved order it reversed', () => {
    const state = fold(makeDoc(completeLog(), configWithSwapRounds(1)));
    selectSwapRoundOrder(state).push('intruder');
    expect(selectSwapRoundOrder(state)).toEqual([...ORDER].reverse());
  });
});

describe('selectSwapRoundPosition — the clock a swap round runs on', () => {
  it('starts on whoever picked LAST in the last round', () => {
    const state = fold(makeDoc(completeLog(), configWithSwapRounds(2)));
    expect(selectSwapRoundPosition(state, 1)).toEqual({ playerId: 'p2', index: 0 });
  });

  it('is null while the picks are still running', () => {
    const state = fold(makeDoc(armedLog(), configWithSwapRounds(2)));
    expect(selectSwapRoundPosition(state, 1)).toBeNull();
  });

  it('is null for a swap round this tournament does not have', () => {
    const state = fold(makeDoc(completeLog(), configWithSwapRounds(1)));
    expect(selectSwapRoundPosition(state, 0)).toBeNull();
    expect(selectSwapRoundPosition(state, 2)).toBeNull();
  });

  it('advances by one on a pass, and the budget is untouched', () => {
    const before = fold(makeDoc(completeLog(), configWithSwapRounds(1)));
    expect(selectSwapsRemaining(before, 'p2')).toBe(2);

    const log = push(completeLog(), swapPassed({ playerId: 'p2', swapRound: 1 }));
    const after = fold(makeDoc(log, configWithSwapRounds(1)));

    expect(selectSwapRoundPosition(after, 1)).toEqual({ playerId: 'p1', index: 1 });
    // A pass is not a spend — D-29, and 03-RESEARCH's budget row.
    expect(selectSwapsRemaining(after, 'p2')).toBe(2);
  });

  it('advances by one on a swap as well, counting BOTH kinds of move', () => {
    let log = push(completeLog(), swapPassed({ playerId: 'p2', swapRound: 1 }));
    log = push(
      log,
      swapMade({
        playerId: 'p1',
        round: 2,
        outMonId: 'blastoise',
        inMonId: 'feraligatr',
        swapRound: 1,
      }),
    );

    const state = fold(makeDoc(log, configWithSwapRounds(2)));
    // Round 1 is finished, so it has no clock left.
    expect(selectSwapRoundPosition(state, 1)).toBeNull();
    // Round 2 opens on the same order, from the top.
    expect(selectSwapRoundPosition(state, 2)).toEqual({ playerId: 'p2', index: 0 });
  });
});

describe('selectIsTournamentComplete — the second completion state, D-31', () => {
  it('coincides with selectIsComplete exactly when swapRounds is 0', () => {
    const state = fold(makeDoc(completeLog(), configWithSwapRounds(0)));
    expect(selectIsComplete(state)).toBe(true);
    expect(selectIsTournamentComplete(state)).toBe(true);
  });

  it('disagrees with selectIsComplete until every player has moved in every swap round', () => {
    const one = configWithSwapRounds(1);

    const opened = fold(makeDoc(completeLog(), one));
    expect(selectIsComplete(opened)).toBe(true);
    expect(selectIsTournamentComplete(opened)).toBe(false);

    const half = push(completeLog(), swapPassed({ playerId: 'p2', swapRound: 1 }));
    const midway = fold(makeDoc(half, one));
    expect(selectIsComplete(midway)).toBe(true);
    expect(selectIsTournamentComplete(midway)).toBe(false);

    const all = push(half, swapPassed({ playerId: 'p1', swapRound: 1 }));
    const finished = fold(makeDoc(all, one));
    expect(selectIsComplete(finished)).toBe(true);
    expect(selectIsTournamentComplete(finished)).toBe(true);
  });

  it('is false while the picks are unfinished, whatever the swap rounds say', () => {
    const state = fold(makeDoc(armedLog(), configWithSwapRounds(0)));
    expect(selectIsComplete(state)).toBe(false);
    expect(selectIsTournamentComplete(state)).toBe(false);
  });

  it('needs the SECOND swap round too', () => {
    const two = configWithSwapRounds(2);

    let log = push(completeLog(), swapPassed({ playerId: 'p2', swapRound: 1 }));
    log = push(log, swapPassed({ playerId: 'p1', swapRound: 1 }));
    expect(selectIsTournamentComplete(fold(makeDoc(log, two)))).toBe(false);

    log = push(log, swapPassed({ playerId: 'p2', swapRound: 2 }));
    log = push(log, swapPassed({ playerId: 'p1', swapRound: 2 }));
    expect(selectIsTournamentComplete(fold(makeDoc(log, two)))).toBe(true);
  });
});

describe('selectPhase reaches its swapRounds arm', () => {
  it('is swapRounds while they are pending and stays there until they are done', () => {
    const one = configWithSwapRounds(1);
    expect(selectPhase(fold(makeDoc(completeLog(), one)))).toBe('swapRounds');

    const half = push(completeLog(), swapPassed({ playerId: 'p2', swapRound: 1 }));
    expect(selectPhase(fold(makeDoc(half, one)))).toBe('swapRounds');
  });
});

describe('apply(SWAP_PASSED)', () => {
  it('records the pass and changes nothing else about the fold', () => {
    const before = fold(makeDoc(completeLog(), configWithSwapRounds(1)));
    const after = apply(before, stamp(swapPassed({ playerId: 'p2', swapRound: 1 }), 99));

    expect(after.passes).toEqual([{ playerId: 'p2', swapRound: 1, seq: 99 }]);
    expect(after.picks).toEqual(before.picks);
    expect(after.swaps).toEqual(before.swaps);
    expect(selectAvailablePool(after)).toEqual(selectAvailablePool(before));
  });

  it('ignores a malformed pass rather than folding a pass of undefined', () => {
    const before = fold(makeDoc(completeLog(), configWithSwapRounds(1)));
    const malformed = { type: SWAP_PASSED, playerId: 'p2', seq: 99, at: 1, actorId: 'host' };
    expect(apply(before, malformed as unknown as AnyAction)).toBe(before);
  });

  it('takes seq off the ENVELOPE, so a log with gaps stays addressable', () => {
    const before = fold(makeDoc(completeLog(), configWithSwapRounds(1)));
    const after = apply(before, stamp(swapPassed({ playerId: 'p2', swapRound: 1 }), 4242));
    expect(after.passes[0]?.seq).toBe(4242);
  });
});

describe('canApply(SWAP_PASSED)', () => {
  const one = configWithSwapRounds(1);

  it('accepts the player the swap-round clock names', () => {
    const state = fold(makeDoc(completeLog(), one));
    expect(canApply(state, stamp(swapPassed({ playerId: 'p2', swapRound: 1 }), 99))).toEqual({
      ok: true,
    });
  });

  it('refuses a malformed payload', () => {
    const state = fold(makeDoc(completeLog(), one));
    const malformed = { type: SWAP_PASSED, playerId: 'p2', seq: 99, at: 1, actorId: 'host' };
    expect(reason(canApply(state, malformed as unknown as AnyAction))).toBe('malformedPayload');
  });

  it('refuses a pass before the draft has started', () => {
    const state = fold(makeDoc([], one));
    expect(reason(canApply(state, stamp(swapPassed({ playerId: 'p2', swapRound: 1 }), 99)))).toBe(
      'draftNotStarted',
    );
  });

  it('refuses a pass while picks are still owed — notSwapRound', () => {
    const state = fold(makeDoc(armedLog(), one));
    expect(reason(canApply(state, stamp(swapPassed({ playerId: 'p1', swapRound: 1 }), 99)))).toBe(
      'notSwapRound',
    );
  });

  it('refuses a swap round this tournament does not have — notSwapRound', () => {
    const state = fold(makeDoc(completeLog(), one));
    expect(reason(canApply(state, stamp(swapPassed({ playerId: 'p2', swapRound: 2 }), 99)))).toBe(
      'notSwapRound',
    );
    expect(reason(canApply(state, stamp(swapPassed({ playerId: 'p2', swapRound: 0 }), 99)))).toBe(
      'notSwapRound',
    );
  });

  it('refuses a later swap round while an earlier one is unfinished — notSwapRound', () => {
    const state = fold(makeDoc(completeLog(), configWithSwapRounds(2)));
    expect(reason(canApply(state, stamp(swapPassed({ playerId: 'p2', swapRound: 2 }), 99)))).toBe(
      'notSwapRound',
    );
  });

  it('refuses a player the clock has not reached — notYourTurn', () => {
    const state = fold(makeDoc(completeLog(), one));
    expect(reason(canApply(state, stamp(swapPassed({ playerId: 'p1', swapRound: 1 }), 99)))).toBe(
      'notYourTurn',
    );
  });

  it('refuses a pass into a round every player has already moved in — swapRoundComplete', () => {
    let log = push(completeLog(), swapPassed({ playerId: 'p2', swapRound: 1 }));
    log = push(log, swapPassed({ playerId: 'p1', swapRound: 1 }));

    const state = fold(makeDoc(log, one));
    expect(reason(canApply(state, stamp(swapPassed({ playerId: 'p2', swapRound: 1 }), 99)))).toBe(
      'swapRoundComplete',
    );
  });
});

describe('canApply(SWAP_MADE) in a dedicated round — D-29, one budget', () => {
  const one = configWithSwapRounds(1);

  /** `p2` picked second in round 2, which is `POOL[3]` — `garchomp`. */
  const roundSwap: Intent = swapMade({
    playerId: 'p2',
    round: 2,
    outMonId: 'garchomp',
    inMonId: 'feraligatr',
    swapRound: 1,
  });

  it('accepts the player the SWAP-ROUND clock names, not the pick clock', () => {
    const state = fold(makeDoc(completeLog(), one));
    // The pick clock is null once every team is full — that is exactly why this arm widens.
    expect(selectCurrentTurn(state)).toBeNull();
    expect(canApply(state, stamp(roundSwap, 99))).toEqual({ ok: true });
  });

  it('refuses the player the swap-round clock has not reached', () => {
    const state = fold(makeDoc(completeLog(), one));
    const wrong = swapMade({
      playerId: 'p1',
      round: 2,
      outMonId: 'blastoise',
      inMonId: 'feraligatr',
      swapRound: 1,
    });
    expect(reason(canApply(state, stamp(wrong, 99)))).toBe('notYourTurn');
  });

  it('still refuses noSwapsLeft — ONE budget covers both windows', () => {
    // `p2` spends the whole allowance inside the swap rounds. There is no second
    // allowance waiting for the dedicated round, which is D-29 as an assertion rather
    // than as a comment.
    let log = push(
      completeLog(),
      swapMade({
        playerId: 'p2',
        round: 2,
        outMonId: 'garchomp',
        inMonId: 'feraligatr',
        swapRound: 1,
      }),
    );
    log = push(log, swapPassed({ playerId: 'p1', swapRound: 1 }));
    log = push(
      log,
      swapMade({
        playerId: 'p2',
        round: 2,
        outMonId: 'feraligatr',
        inMonId: 'garchomp',
        swapRound: 2,
      }),
    );
    log = push(log, swapPassed({ playerId: 'p1', swapRound: 2 }));

    const state = fold(makeDoc(log, configWithSwapRounds(3, 2)));
    expect(selectSwapsRemaining(state, 'p2')).toBe(0);

    const third = swapMade({
      playerId: 'p2',
      round: 2,
      outMonId: 'garchomp',
      inMonId: 'feraligatr',
      swapRound: 3,
    });
    expect(reason(canApply(state, stamp(third, 99)))).toBe('noSwapsLeft');
  });

  it('refuses a mid-draft swap once the picks are complete — the pick clock is gone', () => {
    const state = fold(makeDoc(completeLog(), one));
    const midDraft = swapMade({
      playerId: 'p2',
      round: 2,
      outMonId: 'garchomp',
      inMonId: 'feraligatr',
      swapRound: 0,
    });
    expect(reason(canApply(state, stamp(midDraft, 99)))).toBe('notYourTurn');
  });
});

describe('a passed document survives the round trip', () => {
  it('reproduces every pass exactly after export, import and fold', () => {
    let log = push(completeLog(), swapPassed({ playerId: 'p2', swapRound: 1 }));
    log = push(
      log,
      swapMade({
        playerId: 'p1',
        round: 2,
        outMonId: 'blastoise',
        inMonId: 'feraligatr',
        swapRound: 1,
      }),
    );

    const doc = makeDoc(log, configWithSwapRounds(1));
    const original = fold(doc);

    const text = JSON.stringify(doc);
    const result = parseTournamentFile(text, text.length);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const reloaded = fold(result.doc);
    expect(reloaded.passes).toEqual(original.passes);
    expect(reloaded.swaps).toEqual(original.swaps);
    expect(selectIsTournamentComplete(reloaded)).toBe(true);
    expect(selectIsTournamentComplete(reloaded)).toBe(selectIsTournamentComplete(original));
  });
});
