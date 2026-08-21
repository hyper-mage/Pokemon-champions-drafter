/**
 * RULE-07 — the config-time feasibility gate.
 *
 * Every case is exercised against the ACTUAL committed roster, not a stub, because the
 * gate's whole job is to answer "can this configuration be satisfied by the Pokémon that
 * actually exist". A fixture roster would let the arithmetic be right about a roster
 * nobody drafts from.
 *
 * Three cases here are the ones this gate exists for, and they are the ones a naive
 * implementation gets wrong without failing anything:
 *
 *   1. `NaN` passes BOTH `> legal` and `< players × rounds`, so an unguarded gate reports
 *      all-clear on an empty numeric field and hands `NaN` to the draw.
 *   2. `bans.length` is not the ban count. Two surfaces write one banlist, so a duplicate
 *      is reachable, and it makes the legal pool look smaller than it is.
 *   3. At the Exact preset `N === players × rounds` identically, so "pool too small" can
 *      never fire and a 40-player host gets told to shrink the pool instead of the party.
 *
 * Zero mocks, as everywhere in `src/core`. Default environment is `node`.
 */

import { describe, expect, it } from 'vitest';

import committedSnapshot from '../../public/data/roster.mb.json';
import {
  checkFeasibility,
  poolSizeForPreset,
  type FeasibilityCode,
  type FeasibilityInput,
  type FeasibilityResult,
} from '../../src/core/feasibility';
import {
  MAX_BANS_PER_PLAYER,
  MAX_SWAP_BUDGET,
  MAX_SWAP_ROUNDS,
} from '../../src/core/import-guard';
import type { RosterEntry, RosterSnapshot } from '../../src/core/roster/types';

const snapshot = committedSnapshot as unknown as RosterSnapshot;

/** The pool's universe. Read from disk so a regulation rotation moves these tests with it. */
const ENTRIES: readonly RosterEntry[] = snapshot.entries;
const ROSTER_SIZE = ENTRIES.length;
const MEGA_CAPABLE_IDS: readonly string[] = ENTRIES.filter((entry) => entry.megaCapable).map(
  (entry) => entry.id,
);

/**
 * The stratum RULE-09 actually measures — species carrying at least one Mega forme.
 *
 * Reached by a different route from `MEGA_CAPABLE_IDS` on purpose. The two counts are equal
 * on today's snapshot and `tests/core/roster/fixtures.test.ts` pins that, but they answer
 * different questions the moment a forme ban exists, which is the whole of this plan.
 */
const MEGA_ELIGIBLE_ENTRIES: readonly RosterEntry[] = ENTRIES.filter(
  (entry) => entry.megaFormes.length > 0,
);
const MEGA_ELIGIBLE_TOTAL = MEGA_ELIGIBLE_ENTRIES.length;

/**
 * A satisfiable two-player configuration, overridden one field at a time.
 *
 * Two players at the Exact preset is deliberately the baseline: it is the smallest legal
 * tournament, so any extra problem a test sees came from the field that test changed.
 */
function base(overrides: Partial<FeasibilityInput> = {}): FeasibilityInput {
  return {
    playerNames: ['Ada', 'Bo'],
    rounds: 6,
    poolSize: 12,
    megasRequiredPerTeam: 0,
    bannedIds: [],
    megaFormeBans: [],
    dualMegaChoices: [],
    swapBudget: 0,
    swapRounds: 0,
    // The two Phase 4 fields at their `hostBanlist` values, so every case written before
    // this phase reads exactly the tournament it always described: one ritual, no player
    // bans, `q === 0` and all three pessimistic predicates back at Phase 3's rule.
    banMode: 'hostBanlist',
    bansPerPlayer: 0,
    entries: ENTRIES,
    ...overrides,
  };
}

function codes(result: FeasibilityResult): FeasibilityCode[] {
  return result.problems.map((problem) => problem.code);
}

function messageFor(result: FeasibilityResult, code: FeasibilityCode): string | undefined {
  return result.problems.find((problem) => problem.code === code)?.message;
}

/** `count` real Mega-capable ids, so a Mega-starvation test starves the right stratum. */
function megaBans(count: number): string[] {
  return MEGA_CAPABLE_IDS.slice(0, count);
}

/**
 * Every Mega forme of the first `count` species that have one, READ from the snapshot.
 *
 * Banning an entry's whole `megaFormes` array is the only ban that makes a species
 * ineligible regardless of its X/Y pin, so this is the lever that moves
 * `megaEligibleLegalCount` by exactly `count`. Ids are read, never constructed: a
 * `${name}-Mega` template is wrong for `Meowstic-M-Mega` in one direction and matches
 * Meganium in the other.
 */
function formeBansForFirst(count: number): string[] {
  return MEGA_ELIGIBLE_ENTRIES.slice(0, count).flatMap((entry) =>
    entry.megaFormes.map((forme) => forme.id),
  );
}

/** One forme id of one species, looked up by its `forme` FIELD — never by its name. */
function formeIdOf(speciesId: string, forme: string): string {
  const entry = ENTRIES.find((candidate) => candidate.id === speciesId);
  const match = entry?.megaFormes.find((candidate) => candidate.forme === forme);
  if (match === undefined) throw new Error(`no ${forme} forme for ${speciesId}`);
  return match.id;
}

/** `count` player names, with `blankAt` / `duplicateAt` positions poisoned on request. */
function manyPlayers(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `Player ${index + 1}`);
}

// ---------------------------------------------------------------------------
// Malformed numeric input — the cases that must not reach the arithmetic
// ---------------------------------------------------------------------------

describe('poolSizeNotAnInteger — the NaN hole', () => {
  it('blocks on NaN rather than reporting an all-clear', () => {
    // The load-bearing case. `NaN > 235` is false and `NaN < 12` is false, so both pool
    // comparisons pass and an unguarded gate enables Start.
    const result = checkFeasibility(base({ poolSize: Number.NaN }));

    expect(result.blocked).toBe(true);
    expect(result.problems[0]?.code).toBe('poolSizeNotAnInteger');
  });

  it('blocks on null, which is what an empty numeric field parses to', () => {
    const result = checkFeasibility(base({ poolSize: null }));

    expect(result.blocked).toBe(true);
    expect(result.problems[0]?.code).toBe('poolSizeNotAnInteger');
  });

  it('blocks on a fractional pool size', () => {
    expect(codes(checkFeasibility(base({ poolSize: 48.5 })))).toContain('poolSizeNotAnInteger');
  });

  it('blocks on a pool size of zero', () => {
    expect(codes(checkFeasibility(base({ poolSize: 0 })))).toContain('poolSizeNotAnInteger');
  });

  it('blocks on Infinity, which is neither safe nor an integer', () => {
    expect(codes(checkFeasibility(base({ poolSize: Number.POSITIVE_INFINITY })))).toContain(
      'poolSizeNotAnInteger',
    );
  });

  it('suppresses both pool comparisons while the field is malformed', () => {
    // Reporting "the pool is NaN after 0 bans" would be a sentence about a number the
    // host has not finished typing.
    const result = checkFeasibility(base({ poolSize: Number.NaN }));

    expect(codes(result)).not.toContain('poolTooLarge');
    expect(codes(result)).not.toContain('poolTooSmall');
    expect(codes(result)).not.toContain('poolExactlyMinimum');
  });
});

/**
 * The malformed half of the Megas-per-team field, split out from `megasExceedRounds`.
 *
 * The distinction is not taxonomy. `Lower the Megas required per team` is an instruction
 * the host cannot carry out on an empty field, and emptying the field is one keystroke on
 * the `0` it ships with — so the most common way to reach the old sentence was also the one
 * way it was useless. Both codes are asserted by NAME here, because the two produce
 * different sentences and a merge would be invisible to any assertion on `blocked` alone.
 */
describe('megasRequiredNotAnInteger — the malformed field', () => {
  it('blocks on null, which is what an empty numeric field parses to', () => {
    const result = checkFeasibility(base({ megasRequiredPerTeam: null }));

    expect(codes(result)).toContain('megasRequiredNotAnInteger');
    // Not the arithmetic one. There is nothing to lower.
    expect(codes(result)).not.toContain('megasExceedRounds');
  });

  it('blocks on NaN', () => {
    expect(codes(checkFeasibility(base({ megasRequiredPerTeam: Number.NaN })))).toContain(
      'megasRequiredNotAnInteger',
    );
  });

  it('blocks on a negative requirement', () => {
    // Grouped with the malformed cases, exactly as `poolSizeNotAnInteger` groups "below
    // one": "this is not a count" and "this count is too big" are the two things the host
    // can tell apart, and -1 is the first of them.
    expect(codes(checkFeasibility(base({ megasRequiredPerTeam: -1 })))).toContain(
      'megasRequiredNotAnInteger',
    );
  });

  it('blocks on a fractional requirement', () => {
    expect(codes(checkFeasibility(base({ megasRequiredPerTeam: 2.5 })))).toContain(
      'megasRequiredNotAnInteger',
    );
  });

  it('suppresses the Mega starvation check while the field is malformed', () => {
    const result = checkFeasibility(base({ megasRequiredPerTeam: null }));

    // `players × null` is not a sentence anybody should read.
    expect(codes(result)).not.toContain('notEnoughMegas');
  });
});

describe('megasExceedRounds', () => {
  it('blocks when more Megas are required than a team has slots', () => {
    const result = checkFeasibility(base({ megasRequiredPerTeam: 7, rounds: 6 }));

    expect(codes(result)).toContain('megasExceedRounds');
    // A usable number that is simply too large. The field is not malformed.
    expect(codes(result)).not.toContain('megasRequiredNotAnInteger');
  });

  it('accepts zero and the full round count as the two boundaries', () => {
    expect(codes(checkFeasibility(base({ megasRequiredPerTeam: 0 })))).not.toContain(
      'megasExceedRounds',
    );
    expect(codes(checkFeasibility(base({ megasRequiredPerTeam: 6, rounds: 6 })))).not.toContain(
      'megasExceedRounds',
    );
  });

  it('reports the malformed field before the arithmetic that would be computed from it', () => {
    // 2 players × 9 Megas is 18, which is comfortably below the Mega-capable count, so
    // the Mega-starvation blocker would pass and say nothing useful.
    const result = checkFeasibility(
      base({ playerNames: ['Ada', 'Bo'], rounds: 6, megasRequiredPerTeam: 9 }),
    );

    expect(result.problems[0]?.code).toBe('megasExceedRounds');
    expect(codes(result)).not.toContain('notEnoughMegas');
  });
});

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

describe('player problems', () => {
  it('blocks a one-player draft', () => {
    expect(codes(checkFeasibility(base({ playerNames: ['Ada'], poolSize: 12 })))).toEqual([
      'tooFewPlayers',
    ]);
  });

  it('names the blank player by its one-based position', () => {
    const result = checkFeasibility(base({ playerNames: ['Ada', 'Bo', '  '], poolSize: 18 }));

    expect(codes(result)).toContain('blankPlayerName');
    expect(messageFor(result, 'blankPlayerName')).toBe(
      'Every player needs a name. Player 3 is blank.',
    );
  });

  it('treats trim-and-case variants as the same name', () => {
    const result = checkFeasibility(base({ playerNames: ['Sam', 'sam '] }));

    expect(codes(result)).toContain('duplicatePlayerName');
    expect(messageFor(result, 'duplicatePlayerName')).toBe(
      'Two players are both called "Sam". Give each player a different name.',
    );
  });

  it('collapses internal whitespace runs, so double-spacing is not a second player', () => {
    const result = checkFeasibility(base({ playerNames: ['Ada  Lovelace', 'ada lovelace'] }));

    expect(codes(result)).toContain('duplicatePlayerName');
    expect(messageFor(result, 'duplicatePlayerName')).toBe(
      'Two players are both called "Ada  Lovelace". Give each player a different name.',
    );
  });

  it('does not call two blank players a duplicate — the blank is the problem', () => {
    const result = checkFeasibility(base({ playerNames: ['', ' '] }));

    expect(codes(result)).toContain('blankPlayerName');
    expect(codes(result)).not.toContain('duplicatePlayerName');
  });

  it('passes distinct names that differ only after normalization survives them', () => {
    expect(codes(checkFeasibility(base({ playerNames: ['Sam', 'Samantha'] })))).not.toContain(
      'duplicatePlayerName',
    );
  });
});

// ---------------------------------------------------------------------------
// Bans are a set, not an array length
// ---------------------------------------------------------------------------

describe('ban counting (F-10)', () => {
  it('counts a duplicated ban once', () => {
    const result = checkFeasibility(base({ bannedIds: ['pikachu', 'pikachu'] }));

    expect(result.banCount).toBe(1);
    expect(result.legalCount).toBe(ROSTER_SIZE - 1);
  });

  it('ignores a ban that hits nothing on the roster', () => {
    const result = checkFeasibility(base({ bannedIds: ['not-a-real-id'] }));

    expect(result.banCount).toBe(0);
    expect(result.legalCount).toBe(ROSTER_SIZE);
  });

  it('counts Mega-capable legality separately from overall legality', () => {
    // The two starvation modes are independent: banning only Mega-capable species leaves
    // the pool arithmetic untouched while killing the Mega requirement.
    const result = checkFeasibility(base({ bannedIds: megaBans(30) }));

    expect(result.legalCount).toBe(ROSTER_SIZE - 30);
    expect(result.megaCapableLegalCount).toBe(MEGA_CAPABLE_IDS.length - 30);
  });

  it('reports the whole roster as legal when nothing is banned', () => {
    const result = checkFeasibility(base());

    expect(result.banCount).toBe(0);
    expect(result.legalCount).toBe(ROSTER_SIZE);
    expect(result.megaCapableLegalCount).toBe(MEGA_CAPABLE_IDS.length);
  });
});

// ---------------------------------------------------------------------------
// Pool arithmetic
// ---------------------------------------------------------------------------

describe('pool arithmetic', () => {
  it('blocks a pool smaller than players × rounds', () => {
    const result = checkFeasibility(base({ playerNames: manyPlayers(8), poolSize: 12 }));

    expect(result.blocked).toBe(true);
    expect(codes(result)).toContain('poolTooSmall');
    expect(messageFor(result, 'poolTooSmall')).toBe(
      'Pool is too small. 8 players × 6 rounds needs 48 Pokémon; the pool is 12 after 0 bans.',
    );
  });

  it('blocks a pool larger than the post-ban legal count', () => {
    const result = checkFeasibility(base({ playerNames: manyPlayers(8), poolSize: ROSTER_SIZE + 1 }));

    expect(result.blocked).toBe(true);
    expect(codes(result)).toContain('poolTooLarge');
  });

  it('blames the player count, not the pool, when the roster cannot seat everyone', () => {
    // At the Exact preset N === players × rounds identically, so "pool too small" can
    // never fire. Without its own reason the host is told to shrink a pool the tool
    // computed for them.
    const result = checkFeasibility(base({ playerNames: manyPlayers(40), poolSize: 240 }));

    expect(result.blocked).toBe(true);
    expect(result.problems[0]?.code).toBe('tooManyPlayersForRoster');
    expect(codes(result)).not.toContain('poolTooLarge');
  });

  it('seats the largest party the roster can actually hold', () => {
    const result = checkFeasibility(base({ playerNames: manyPlayers(39), poolSize: 234 }));

    expect(result.blocked).toBe(false);
  });

  it('warns without blocking when the pool is exactly the minimum', () => {
    const result = checkFeasibility(base({ playerNames: ['Ada', 'Bo'], poolSize: 12 }));

    expect(result.blocked).toBe(false);
    expect(codes(result)).toEqual(['poolExactlyMinimum']);
    expect(result.problems[0]?.severity).toBe('warning');
    expect(result.problems[0]?.message).toBe(
      'Warning — the pool is exactly 12. The last player to pick in Round 6 will have one Pokémon to choose from.',
    );
  });

  it('says nothing at all when the pool carries a surplus', () => {
    expect(checkFeasibility(base({ poolSize: 18 })).problems).toEqual([]);
    expect(checkFeasibility(base({ poolSize: 18 })).blocked).toBe(false);
  });
});

describe('Mega arithmetic', () => {
  it('blocks when bans starve the Mega-capable stratum', () => {
    // 8 players × 6 Megas needs 48; banning 27 Mega-capable species leaves 47.
    const result = checkFeasibility(
      base({
        playerNames: manyPlayers(8),
        poolSize: 48,
        megasRequiredPerTeam: 6,
        bannedIds: megaBans(27),
      }),
    );

    expect(result.blocked).toBe(true);
    expect(codes(result)).toContain('notEnoughMegas');
    expect(result.megaCapableLegalCount).toBe(MEGA_CAPABLE_IDS.length - 27);
  });

  it('passes when one more Mega-capable species survives the banlist', () => {
    const result = checkFeasibility(
      base({
        playerNames: manyPlayers(8),
        poolSize: 48,
        megasRequiredPerTeam: 6,
        bannedIds: megaBans(26),
      }),
    );

    expect(codes(result)).not.toContain('notEnoughMegas');
  });
});

// ---------------------------------------------------------------------------
// RULE-09, re-measured over the species that can STILL Mega
// ---------------------------------------------------------------------------

describe('the Mega-round gate (RULE-09)', () => {
  it('passes eight players at three Mega rounds with nothing banned', () => {
    // The pre-ban headroom this gate lives inside: 8 x 3 = 24, and the snapshot carries
    // far more than that. No value of k from 0 to 6 blocks at 4-8 players before a ban,
    // which is why the sentence below has to name the Mega-forme list.
    const result = checkFeasibility(
      base({ playerNames: manyPlayers(8), poolSize: 48, megasRequiredPerTeam: 3 }),
    );

    expect(8 * 3).toBeLessThanOrEqual(MEGA_ELIGIBLE_TOTAL);
    expect(codes(result)).not.toContain('notEnoughMegas');
    expect(result.blocked).toBe(false);
  });

  it('blocks when Mega-forme bans leave fewer eligible species than the rounds need', () => {
    // 8 x 3 needs 24; banning every forme of 51 species leaves MEGA_ELIGIBLE_TOTAL - 51.
    const formeBans = formeBansForFirst(51);
    const result = checkFeasibility(
      base({
        playerNames: manyPlayers(8),
        poolSize: 48,
        megasRequiredPerTeam: 3,
        megaFormeBans: formeBans,
      }),
    );

    expect(result.megaEligibleLegalCount).toBe(MEGA_ELIGIBLE_TOTAL - 51);
    expect(result.blocked).toBe(true);
    expect(codes(result)).toContain('notEnoughMegas');
  });

  it('names both ban lists with their own counts, and the action that moves the number', () => {
    const formeBans = formeBansForFirst(51);
    const result = checkFeasibility(
      base({
        playerNames: manyPlayers(8),
        poolSize: 48,
        megasRequiredPerTeam: 3,
        megaFormeBans: formeBans,
      }),
    );

    expect(messageFor(result, 'notEnoughMegas')).toBe(
      `Not enough Pokémon can Mega. 8 players × 3 Mega rounds needs 24; ${
        MEGA_ELIGIBLE_TOTAL - 51
      } can still Mega after 0 species bans and ${
        formeBans.length
      } Mega-forme bans. Lower the Mega requirement, or unban a Mega forme.`,
    );
  });

  it('keeps the Mega-capable count beside the eligible one, as two different numbers', () => {
    const formeBans = formeBansForFirst(10);
    const result = checkFeasibility(base({ megaFormeBans: formeBans }));

    // The older field is unmoved by a forme ban - it counts the `megaCapable` FLAG, which
    // is what makes it a pre-ban upper bound and a post-rotation cross-check (D-11).
    expect(result.megaCapableLegalCount).toBe(MEGA_CAPABLE_IDS.length);
    expect(result.megaEligibleLegalCount).toBe(MEGA_ELIGIBLE_TOTAL - 10);
    expect(result.megaEligibleLegalCount).not.toBe(result.megaCapableLegalCount);
  });

  it('drops a dual-Mega species only when the ban and the pin between them leave nothing', () => {
    const x = formeIdOf('charizard', 'Mega-X');
    const y = formeIdOf('charizard', 'Mega-Y');

    expect(checkFeasibility(base({ megaFormeBans: [x, y] })).megaEligibleLegalCount).toBe(
      MEGA_ELIGIBLE_TOTAL - 1,
    );

    // D-10, and it is behaviour rather than an error: Charizard leaves the Mega rounds
    // and stays draftable in an open one.
    expect(
      checkFeasibility(
        base({
          megaFormeBans: [x],
          dualMegaChoices: [{ speciesId: 'charizard', forme: 'x' }],
        }),
      ).megaEligibleLegalCount,
    ).toBe(MEGA_ELIGIBLE_TOTAL - 1);

    // One forme banned, no pin - the other forme is still legal, so the species still
    // counts. A species-level ban implementation fails exactly here.
    expect(checkFeasibility(base({ megaFormeBans: [x] })).megaEligibleLegalCount).toBe(
      MEGA_ELIGIBLE_TOTAL,
    );
  });

  it('counts a duplicated Mega-forme ban once and a stranger id zero (T-03-19)', () => {
    const x = formeIdOf('charizard', 'Mega-X');

    const once = checkFeasibility(base({ megaFormeBans: [x] }));
    const twice = checkFeasibility(base({ megaFormeBans: [x, x] }));
    const stranger = checkFeasibility(base({ megaFormeBans: ['not-a-real-forme'] }));

    expect(twice.megaEligibleLegalCount).toBe(once.megaEligibleLegalCount);
    expect(stranger.megaEligibleLegalCount).toBe(MEGA_ELIGIBLE_TOTAL);
  });

  it('quotes the forme bans that HIT the roster, never the raw list length', () => {
    const x = formeIdOf('charizard', 'Mega-X');
    const y = formeIdOf('charizard', 'Mega-Y');
    const result = checkFeasibility(
      base({
        playerNames: manyPlayers(39),
        poolSize: 234,
        megasRequiredPerTeam: 6,
        megaFormeBans: [x, x, y, 'not-a-real-forme'],
      }),
    );

    // Four entries in the list; two of them are one id, and one hits nothing.
    expect(messageFor(result, 'notEnoughMegas')).toBe(
      `Not enough Pokémon can Mega. 39 players × 6 Mega rounds needs 234; ${
        MEGA_ELIGIBLE_TOTAL - 1
      } can still Mega after 0 species bans and 2 Mega-forme bans. Lower the Mega requirement, or unban a Mega forme.`,
    );
  });

  it('adds species bans and Mega-forme bans into one eligible count', () => {
    const speciesBanned = MEGA_ELIGIBLE_ENTRIES[0];
    if (speciesBanned === undefined) throw new Error('no Mega-capable entry on the snapshot');

    const formeBans = MEGA_ELIGIBLE_ENTRIES.slice(1, 4).flatMap((entry) =>
      entry.megaFormes.map((forme) => forme.id),
    );

    const result = checkFeasibility(
      base({ bannedIds: [speciesBanned.id], megaFormeBans: formeBans }),
    );

    expect(result.megaEligibleLegalCount).toBe(MEGA_ELIGIBLE_TOTAL - 4);
  });
});

// ---------------------------------------------------------------------------
// The two swap fields - the NaN rule, inherited
// ---------------------------------------------------------------------------

describe('swapBudgetNotAnInteger', () => {
  it('blocks an empty field rather than reading it as no swaps', () => {
    const result = checkFeasibility(base({ swapBudget: null }));

    expect(result.blocked).toBe(true);
    expect(result.problems[0]?.code).toBe('swapBudgetNotAnInteger');
  });

  it('blocks NaN, a negative and a fraction on the same terms', () => {
    // The load-bearing case, one control along from the pool-size field: every relational
    // comparison with NaN is false, so a gate that merely compared would report all-clear.
    expect(codes(checkFeasibility(base({ swapBudget: Number.NaN })))).toContain(
      'swapBudgetNotAnInteger',
    );
    expect(codes(checkFeasibility(base({ swapBudget: -1 })))).toContain(
      'swapBudgetNotAnInteger',
    );
    expect(codes(checkFeasibility(base({ swapBudget: 2.5 })))).toContain(
      'swapBudgetNotAnInteger',
    );
    expect(codes(checkFeasibility(base({ swapBudget: Number.POSITIVE_INFINITY })))).toContain(
      'swapBudgetNotAnInteger',
    );
  });

  it('says nothing about a usable budget', () => {
    expect(codes(checkFeasibility(base({ swapBudget: 0 })))).not.toContain(
      'swapBudgetNotAnInteger',
    );
    expect(codes(checkFeasibility(base({ swapBudget: MAX_SWAP_BUDGET })))).toEqual([
      'poolExactlyMinimum',
    ]);
  });

  it('refuses a budget past the bound the import guard enforces (T-03-17)', () => {
    // 4e9 IS a safe integer, so `Number.isSafeInteger` alone lets it through - and the
    // document this screen would then create is one `isValidTournament` refuses to
    // re-open, so the host loses the tournament on the next resume.
    const result = checkFeasibility(base({ swapBudget: 4e9 }));

    expect(result.blocked).toBe(true);
    expect(codes(result)).toContain('swapBudgetTooLarge');
    expect(codes(result)).not.toContain('swapBudgetNotAnInteger');
    expect(codes(checkFeasibility(base({ swapBudget: MAX_SWAP_BUDGET + 1 })))).toContain(
      'swapBudgetTooLarge',
    );
  });
});

describe('swapRoundsNotAnInteger', () => {
  it('blocks an empty field rather than reading it as no swap rounds', () => {
    const result = checkFeasibility(base({ swapRounds: null }));

    expect(result.blocked).toBe(true);
    expect(result.problems[0]?.code).toBe('swapRoundsNotAnInteger');
  });

  it('blocks NaN, a negative and a fraction on the same terms', () => {
    expect(codes(checkFeasibility(base({ swapRounds: Number.NaN })))).toContain(
      'swapRoundsNotAnInteger',
    );
    expect(codes(checkFeasibility(base({ swapRounds: -1 })))).toContain(
      'swapRoundsNotAnInteger',
    );
    expect(codes(checkFeasibility(base({ swapRounds: 2.5 })))).toContain(
      'swapRoundsNotAnInteger',
    );
  });

  it('refuses a round count past the bound the import guard enforces (T-03-17)', () => {
    const result = checkFeasibility(base({ swapRounds: 4e9 }));

    expect(result.blocked).toBe(true);
    expect(codes(result)).toContain('swapRoundsTooLarge');
    expect(codes(checkFeasibility(base({ swapRounds: MAX_SWAP_ROUNDS + 1 })))).toContain(
      'swapRoundsTooLarge',
    );
  });
});

// ---------------------------------------------------------------------------
// Bans per player - the field that exists in exactly two of the three modes
// ---------------------------------------------------------------------------

describe('bansPerPlayerNotAnInteger', () => {
  it('blocks an empty field rather than reading it as no bans', () => {
    const result = checkFeasibility(base({ banMode: 'blind', bansPerPlayer: null }));

    expect(result.blocked).toBe(true);
    expect(codes(result)).toContain('bansPerPlayerNotAnInteger');
  });

  it('blocks NaN, a fraction, Infinity and a negative on the same terms', () => {
    for (const value of [Number.NaN, 2.5, Number.POSITIVE_INFINITY, -1]) {
      expect(codes(checkFeasibility(base({ banMode: 'blind', bansPerPlayer: value })))).toContain(
        'bansPerPlayerNotAnInteger',
      );
    }
  });

  it('suppresses all three pessimistic predicates while the field is malformed', () => {
    // The posture `poolSizeNotAnInteger` takes one field along: an arithmetic sentence
    // computed from an unreadable number tells the host about a field they are not editing.
    const result = checkFeasibility(
      base({
        playerNames: manyPlayers(8),
        poolSize: ROSTER_SIZE,
        banMode: 'blind',
        bansPerPlayer: null,
      }),
    );

    expect(codes(result)).toEqual(['bansPerPlayerNotAnInteger']);
  });

  it('says nothing about a usable count', () => {
    expect(codes(checkFeasibility(base({ banMode: 'blind', bansPerPlayer: 1 })))).not.toContain(
      'bansPerPlayerNotAnInteger',
    );
  });
});

describe('bansPerPlayerNotPositive', () => {
  it('blocks zero bans in snake, which is a ritual with nothing in it', () => {
    const result = checkFeasibility(base({ banMode: 'snake', bansPerPlayer: 0 }));

    expect(result.blocked).toBe(true);
    expect(codes(result)).toContain('bansPerPlayerNotPositive');
    // Zero is a safe non-negative integer, so the malformed question must answer no.
    expect(codes(result)).not.toContain('bansPerPlayerNotAnInteger');
  });

  it('blocks zero bans in blind on the same terms', () => {
    const result = checkFeasibility(base({ banMode: 'blind', bansPerPlayer: 0 }));

    expect(result.blocked).toBe(true);
    expect(codes(result)).toContain('bansPerPlayerNotPositive');
  });

  it('says nothing at one ban, which is the field default', () => {
    expect(codes(checkFeasibility(base({ banMode: 'blind', bansPerPlayer: 1 })))).not.toContain(
      'bansPerPlayerNotPositive',
    );
  });
});

describe('bansPerPlayerTooLarge', () => {
  it('refuses a count past the bound the import guard enforces (T-04-09)', () => {
    const result = checkFeasibility(
      base({ banMode: 'blind', bansPerPlayer: MAX_BANS_PER_PLAYER + 1 }),
    );

    expect(result.blocked).toBe(true);
    expect(codes(result)).toContain('bansPerPlayerTooLarge');
    expect(codes(result)).not.toContain('bansPerPlayerNotAnInteger');
  });

  it('accepts the bound itself, so the gate and the guard agree at the edge', () => {
    expect(
      codes(checkFeasibility(base({ banMode: 'blind', bansPerPlayer: MAX_BANS_PER_PLAYER }))),
    ).not.toContain('bansPerPlayerTooLarge');
  });
});

describe('the void field at hostBanlist', () => {
  it('says nothing about zero bans per player, which is that mode stored value', () => {
    const result = checkFeasibility(base({ banMode: 'hostBanlist', bansPerPlayer: 0 }));

    expect(codes(result)).not.toContain('bansPerPlayerNotAnInteger');
    expect(codes(result)).not.toContain('bansPerPlayerNotPositive');
    expect(codes(result)).not.toContain('bansPerPlayerTooLarge');
  });

  it('says nothing about an empty field either - no player bans, no opinion', () => {
    const result = checkFeasibility(base({ banMode: 'hostBanlist', bansPerPlayer: null }));

    expect(codes(result)).not.toContain('bansPerPlayerNotAnInteger');
    expect(codes(result)).not.toContain('bansPerPlayerNotPositive');
    expect(codes(result)).not.toContain('bansPerPlayerTooLarge');
  });

  it('says nothing about a count past the bound either', () => {
    const result = checkFeasibility(
      base({ banMode: 'hostBanlist', bansPerPlayer: MAX_BANS_PER_PLAYER + 1 }),
    );

    expect(codes(result)).not.toContain('bansPerPlayerTooLarge');
  });
});

describe('bans-per-player copy', () => {
  it('renders the three new blocking sentences exactly as the contract gives them', () => {
    expect(
      messageFor(
        checkFeasibility(base({ banMode: 'blind', bansPerPlayer: null })),
        'bansPerPlayerNotAnInteger',
      ),
    ).toBe('Bans per player needs a whole number. Enter 1 or more, or switch to host banlist.');

    expect(
      messageFor(
        checkFeasibility(base({ banMode: 'snake', bansPerPlayer: 0 })),
        'bansPerPlayerNotPositive',
      ),
    ).toBe(
      'Blind and snake need at least 1 ban per player. Enter a number, or switch to host banlist.',
    );

    expect(
      messageFor(
        checkFeasibility(base({ banMode: 'blind', bansPerPlayer: MAX_BANS_PER_PLAYER + 1 })),
        'bansPerPlayerTooLarge',
      ),
    ).toBe(
      `Bans per player is too high. A player can be given at most ${MAX_BANS_PER_PLAYER} bans. Lower the bans per player.`,
    );
  });
});

// ---------------------------------------------------------------------------
// One composer, two arms (Pitfall 9)
// ---------------------------------------------------------------------------

describe('the two-arm Mega sentence (Pitfall 9)', () => {
  it('pins the hostBanlist arm byte-identical to the string Phase 3 shipped', () => {
    const result = checkFeasibility(
      base({
        playerNames: manyPlayers(8),
        poolSize: 48,
        megasRequiredPerTeam: 6,
        bannedIds: megaBans(27),
      }),
    );

    // A LITERAL, deliberately, rather than a template over MEGA_ELIGIBLE_TOTAL. The whole
    // point of this assertion is that a future edit to the composer cannot silently reword
    // the arm this phase is not changing.
    expect(messageFor(result, 'notEnoughMegas')).toBe(
      'Not enough Pokémon can Mega. 8 players × 6 Mega rounds needs 48; 47 can still Mega after 27 species bans and 0 Mega-forme bans. Lower the Mega requirement, or unban a Mega forme.',
    );

    // And the literal above IS the eligible count at zero player bans, which is what makes
    // `{y} = Math.max(0, megaEligible - q)` agree with Phase 3 by construction rather than
    // by coincidence.
    expect(MEGA_ELIGIBLE_TOTAL - 27).toBe(47);
  });

  it('adds one clause and one remedy in blind, and nothing else', () => {
    // Deliberately the SAME configuration as the pin above plus a ban mode and a count, so
    // the only thing that can move the string is the arm selector. The predicate is Phase
    // 3's here — the `q` term the predicate gains is the next task's, and a copy test that
    // needed it would be testing two things at once.
    const result = checkFeasibility(
      base({
        playerNames: manyPlayers(8),
        poolSize: 48,
        megasRequiredPerTeam: 6,
        bannedIds: megaBans(27),
        banMode: 'blind',
        bansPerPlayer: 4,
      }),
    );

    expect(messageFor(result, 'notEnoughMegas')).toBe(
      'Not enough Pokémon can Mega. 8 players × 6 Mega rounds needs 48; 15 can still Mega after 27 species bans, 0 Mega-forme bans and 32 player bans. Lower the Mega requirement, lower bans per player, or unban a Mega forme.',
    );
  });

  it('speaks the same arm in snake as in blind', () => {
    const blind = checkFeasibility(
      base({
        playerNames: manyPlayers(8),
        poolSize: 48,
        megasRequiredPerTeam: 6,
        bannedIds: megaBans(27),
        banMode: 'blind',
        bansPerPlayer: 4,
      }),
    );
    const snake = checkFeasibility(
      base({
        playerNames: manyPlayers(8),
        poolSize: 48,
        megasRequiredPerTeam: 6,
        bannedIds: megaBans(27),
        banMode: 'snake',
        bansPerPlayer: 4,
      }),
    );

    expect(messageFor(snake, 'notEnoughMegas')).toBe(messageFor(blind, 'notEnoughMegas'));
  });

  it('never reports a negative count of species that can still Mega', () => {
    // 8 x 24 = 192 pessimistic player bans against the 4 eligible species 70 host bans
    // leave. A negative number in a sentence read off a shared screen reads as a broken
    // tool rather than as a hard limit, so the term is clamped at zero.
    const result = checkFeasibility(
      base({
        playerNames: manyPlayers(8),
        poolSize: 48,
        megasRequiredPerTeam: 1,
        bannedIds: megaBans(70),
        banMode: 'blind',
        bansPerPlayer: MAX_BANS_PER_PLAYER,
      }),
    );

    expect(messageFor(result, 'notEnoughMegas')).toBe(
      'Not enough Pokémon can Mega. 8 players × 1 Mega rounds needs 8; 0 can still Mega after 70 species bans, 0 Mega-forme bans and 192 player bans. Lower the Mega requirement, lower bans per player, or unban a Mega forme.',
    );
  });
});

// ---------------------------------------------------------------------------
// D-32 - degenerate but satisfiable, so it warns and never blocks
// ---------------------------------------------------------------------------

describe('swapRoundsOnExactPool (D-32)', () => {
  it('warns without blocking when swap rounds run on an exactly-minimum pool', () => {
    const result = checkFeasibility(
      base({ playerNames: manyPlayers(8), poolSize: 48, swapRounds: 2 }),
    );

    expect(result.blocked).toBe(false);
    expect(codes(result)).toContain('swapRoundsOnExactPool');
    expect(
      result.problems.find((problem) => problem.code === 'swapRoundsOnExactPool')?.severity,
    ).toBe('warning');
    expect(messageFor(result, 'swapRoundsOnExactPool')).toBe(
      'Warning — the pool is exactly 48, so it is empty when the last pick lands. The first player to swap can only take what someone else drops.',
    );
  });

  it('says nothing extra at zero swap rounds, exactly as before', () => {
    const result = checkFeasibility(
      base({ playerNames: manyPlayers(8), poolSize: 48, swapRounds: 0 }),
    );

    expect(codes(result)).toEqual(['poolExactlyMinimum']);
  });

  it('says nothing at all when the pool carries a surplus', () => {
    const result = checkFeasibility(
      base({ playerNames: manyPlayers(8), poolSize: 72, swapRounds: 2 }),
    );

    expect(result.problems).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Precedence
// ---------------------------------------------------------------------------

describe('precedence', () => {
  it('orders every simultaneous problem by the declared precedence', () => {
    const names = manyPlayers(40);
    names[2] = '   ';
    names[3] = 'Player 1';

    const result = checkFeasibility(
      base({
        playerNames: names,
        poolSize: 240,
        megasRequiredPerTeam: 2,
        bannedIds: megaBans(60),
      }),
    );

    expect(codes(result)).toEqual([
      'blankPlayerName',
      'duplicatePlayerName',
      'tooManyPlayersForRoster',
      'notEnoughMegas',
      'poolExactlyMinimum',
    ]);
  });

  it('puts both malformed-field blockers above every arithmetic one', () => {
    const result = checkFeasibility(
      base({ playerNames: [''], poolSize: null, megasRequiredPerTeam: null }),
    );

    expect(codes(result)).toEqual([
      'tooFewPlayers',
      'blankPlayerName',
      'poolSizeNotAnInteger',
      'megasRequiredNotAnInteger',
    ]);
  });

  it('reports every malformed numeric field together, above the arithmetic', () => {
    const result = checkFeasibility(
      base({ poolSize: null, megasRequiredPerTeam: null, swapBudget: null, swapRounds: null }),
    );

    expect(codes(result)).toEqual([
      'poolSizeNotAnInteger',
      'megasRequiredNotAnInteger',
      'swapBudgetNotAnInteger',
      'swapRoundsNotAnInteger',
    ]);
  });

  it('puts the Exact-pool swap warning above the pool warning it supersedes', () => {
    const result = checkFeasibility(
      base({
        playerNames: manyPlayers(8),
        poolSize: 48,
        megasRequiredPerTeam: 6,
        megaFormeBans: formeBansForFirst(51),
        swapRounds: 1,
      }),
    );

    // The swap sentence ABOVE the pool one: they always hold together, the bar renders
    // only the first, and the swap sentence carries the pool size as well as its own point.
    expect(codes(result)).toEqual([
      'notEnoughMegas',
      'swapRoundsOnExactPool',
      'poolExactlyMinimum',
    ]);
  });

  it('is blocked whenever any problem is blocking, and only then', () => {
    expect(checkFeasibility(base({ poolSize: 18 })).blocked).toBe(false);
    expect(checkFeasibility(base({ poolSize: 12 })).blocked).toBe(false);
    expect(checkFeasibility(base({ poolSize: null })).blocked).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

describe('copy', () => {
  it('renders every blocking sentence exactly as the copywriting contract gives it', () => {
    expect(messageFor(checkFeasibility(base({ playerNames: ['Ada'] })), 'tooFewPlayers')).toBe(
      'Add at least one more player. A draft needs two players.',
    );

    expect(
      messageFor(checkFeasibility(base({ poolSize: null })), 'poolSizeNotAnInteger'),
    ).toBe('Pool size needs a whole number. Enter how many Pokémon the pool should hold.');

    expect(
      messageFor(checkFeasibility(base({ megasRequiredPerTeam: 9 })), 'megasExceedRounds'),
    ).toBe(
      'A team has 6 slots, so at most 6 of them can be Megas. Lower the Megas required per team.',
    );

    // Not in the approved copy table — flagged in `feasibility.ts` as the row the table is
    // missing. Asserted by exact equality anyway, because it is a contract the moment it
    // ships whether or not the table has caught up.
    expect(
      messageFor(
        checkFeasibility(base({ megasRequiredPerTeam: null })),
        'megasRequiredNotAnInteger',
      ),
    ).toBe('Megas required per team needs a whole number. Enter 0 for no Mega requirement.');

    expect(
      messageFor(
        checkFeasibility(base({ playerNames: manyPlayers(40), poolSize: 240 })),
        'tooManyPlayersForRoster',
      ),
    ).toBe(
      `Too many players for the roster. 40 players × 6 rounds needs 240 Pokémon; only ${ROSTER_SIZE} are draftable after 0 bans.`,
    );

    expect(
      messageFor(
        checkFeasibility(base({ playerNames: manyPlayers(8), poolSize: ROSTER_SIZE + 1 })),
        'poolTooLarge',
      ),
    ).toBe(
      `Pool is too large. Only ${ROSTER_SIZE} Pokémon are draftable after 0 bans; the pool is set to ${ROSTER_SIZE + 1}.`,
    );

    expect(
      messageFor(
        checkFeasibility(
          base({
            playerNames: manyPlayers(8),
            poolSize: 48,
            megasRequiredPerTeam: 6,
            bannedIds: megaBans(27),
          }),
        ),
        'notEnoughMegas',
      ),
    ).toBe(
      `Not enough Pokémon can Mega. 8 players × 6 Mega rounds needs 48; ${
        MEGA_ELIGIBLE_TOTAL - 27
      } can still Mega after 27 species bans and 0 Mega-forme bans. Lower the Mega requirement, or unban a Mega forme.`,
    );
  });

  it('renders both new blocking sentences exactly as the copywriting contract gives them', () => {
    expect(
      messageFor(checkFeasibility(base({ swapBudget: null })), 'swapBudgetNotAnInteger'),
    ).toBe('Swap budget needs a whole number. Enter 0 for no swaps.');

    expect(
      messageFor(checkFeasibility(base({ swapRounds: null })), 'swapRoundsNotAnInteger'),
    ).toBe('Swap rounds needs a whole number. Enter 0 to end the draft with the last pick.');
  });

  it('quotes the ban count that hit the roster, never the raw banlist length', () => {
    const result = checkFeasibility(
      base({ playerNames: manyPlayers(8), poolSize: 12, bannedIds: ['pikachu', 'pikachu', 'nope'] }),
    );

    expect(messageFor(result, 'poolTooSmall')).toBe(
      'Pool is too small. 8 players × 6 rounds needs 48 Pokémon; the pool is 12 after 1 bans.',
    );
  });
});

// ---------------------------------------------------------------------------
// Pool presets
// ---------------------------------------------------------------------------

describe('poolSizeForPreset', () => {
  it('gives the three preset sizes for an eight-player, six-round tournament', () => {
    expect(poolSizeForPreset(8, 6, 'exact')).toBe(48);
    expect(poolSizeForPreset(8, 6, 'x1_5')).toBe(72);
    expect(poolSizeForPreset(8, 6, 'x2')).toBe(96);
  });

  it('is an integer at every player count the roster can seat', () => {
    for (let players = 2; players <= 39; players++) {
      for (const preset of ['exact', 'x1_5', 'x2'] as const) {
        expect(Number.isSafeInteger(poolSizeForPreset(players, 6, preset))).toBe(true);
      }
    }
  });

  it('rounds the ×1.5 preset up, so a future odd round count inherits a rule', () => {
    // Unreachable at six rounds: p × 6 × 1.5 is 9p, always an integer. Phase 3's
    // variable round count is what makes this reachable, and it must not discover the
    // rounding rule then.
    expect(poolSizeForPreset(3, 5, 'x1_5')).toBe(23);
    expect(poolSizeForPreset(1, 1, 'x1_5')).toBe(2);
  });
});
