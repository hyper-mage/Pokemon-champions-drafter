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
import type { RosterEntry, RosterSnapshot } from '../../src/core/roster/types';

const snapshot = committedSnapshot as unknown as RosterSnapshot;

/** The pool's universe. Read from disk so a regulation rotation moves these tests with it. */
const ENTRIES: readonly RosterEntry[] = snapshot.entries;
const ROSTER_SIZE = ENTRIES.length;
const MEGA_CAPABLE_IDS: readonly string[] = ENTRIES.filter((entry) => entry.megaCapable).map(
  (entry) => entry.id,
);

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

describe('megasExceedRounds', () => {
  it('blocks on null', () => {
    expect(codes(checkFeasibility(base({ megasRequiredPerTeam: null })))).toContain(
      'megasExceedRounds',
    );
  });

  it('blocks when more Megas are required than a team has slots', () => {
    expect(codes(checkFeasibility(base({ megasRequiredPerTeam: 7, rounds: 6 })))).toContain(
      'megasExceedRounds',
    );
  });

  it('blocks on a negative requirement', () => {
    expect(codes(checkFeasibility(base({ megasRequiredPerTeam: -1 })))).toContain(
      'megasExceedRounds',
    );
  });

  it('blocks on a fractional requirement', () => {
    expect(codes(checkFeasibility(base({ megasRequiredPerTeam: 2.5 })))).toContain(
      'megasExceedRounds',
    );
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
      'megasExceedRounds',
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
      `Not enough Mega-capable Pokémon. 8 players × 6 Megas needs 48; ${
        MEGA_CAPABLE_IDS.length - 27
      } are draftable after 27 bans.`,
    );
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
