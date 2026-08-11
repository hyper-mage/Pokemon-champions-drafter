/**
 * feasibility.ts — RULE-07. The single authority on whether a configuration can be satisfied.
 *
 * D-06 refuses to clamp the pool-size input, on the grounds that a silent clamp and a
 * feasibility gate can disagree and then the host is arguing with an input box. This module
 * is that decision applied one level down: it takes the roster `entries` rather than a
 * pre-computed `(legalCount, megaCapableLegalCount)` pair, so a caller *cannot* hand it two
 * numbers that contradict each other. There is one place that knows what is satisfiable, and
 * it is this file.
 *
 * ## Why `poolSize` and `megasRequiredPerTeam` are `number | null`
 *
 * An empty `<input type="number">` yields `NaN`, and every relational comparison with `NaN`
 * is false — so `N > legal` and `N < players × rounds` BOTH pass, the gate reports all-clear,
 * and Start enables on a configuration that cannot be drawn. Typing the fields as
 * `number | null` makes "the host has not finished typing" a case the compiler forces this
 * module to handle rather than a value that silently satisfies every comparison. The screen
 * parses each numeric field once; this gate refuses anything that is not a safe integer.
 *
 * ## The precedence order is declared, and it is not the UI-SPEC's list
 *
 * `PRECEDENCE` below deliberately deviates from 02-UI-SPEC §5's seven-item order, for three
 * reasons, all from 02-RESEARCH §Feasibility Arithmetic:
 *
 *   1. `poolSizeNotAnInteger` (F-08) is *malformed input*, not unsatisfiable arithmetic. It
 *      must be reported before any sentence computed from the malformed number, or the host
 *      reads a reason with `NaN` in it about a field they are not editing.
 *   2. `megasExceedRounds` (F-09) is the same class. It also earns its place: when it holds,
 *      `players × k > megaCapableLegal` may still pass, so nothing else catches it.
 *   3. `tooManyPlayersForRoster` exists because at the Exact preset `N === players × rounds`
 *      identically, so `poolTooSmall` can NEVER fire, and a 40-player host would otherwise be
 *      told "Pool is too large" when the fix is fewer players.
 *
 * `checkFeasibility` collects ALL problems and sorts them, which is where it parts company
 * with `canApply` in `reduce.ts` — that returns the first failure, because a rejected action
 * needs one reason. This gate renders the first plus a count of the rest, so it needs them all.
 *
 * ## A known wart, stated rather than fixed
 *
 * The interpolated sentences are verbatim from 02-UI-SPEC §Copywriting Contract, including
 * `after {b} bans`, which reads "after 1 bans" at exactly one ban. Fixing it here would put
 * this module out of byte-for-byte agreement with the approved copy table, so the copy table
 * is the thing to amend. Recorded, not silently diverged from.
 *
 * Pure, like everything under `src/core`. Reads its argument and nothing else. The `Set`s
 * below are computation-local and are never returned or stored (CLAUDE.md §Serializability).
 */

import type { RosterEntry } from './roster/types';

/**
 * Every reason the gate can give. Closer to an API than to a log message — the config
 * screen switches on these, so adding one is a deliberate act.
 */
export type FeasibilityCode =
  /** Fewer than two players. A draft needs someone to draft against. */
  | 'tooFewPlayers'
  /** A player row has no name, or only whitespace. */
  | 'blankPlayerName'
  /** Two player rows carry the same name once trimmed, lowercased and space-collapsed. */
  | 'duplicatePlayerName'
  /** The pool-size field is empty, fractional, unsafe, or below one. */
  | 'poolSizeNotAnInteger'
  /** The Megas-per-team field is empty, fractional, negative, or above the round count. */
  | 'megasExceedRounds'
  /** The party needs more slots than the post-ban roster has entries. */
  | 'tooManyPlayersForRoster'
  /** The requested pool is bigger than the post-ban legal count. */
  | 'poolTooLarge'
  /** The requested pool cannot fill every player's team. */
  | 'poolTooSmall'
  /** The Mega requirement outruns the post-ban Mega-capable count. */
  | 'notEnoughMegas'
  /** Satisfiable but degenerate: the last picker of the last round has one option. */
  | 'poolExactlyMinimum';

export interface FeasibilityProblem {
  code: FeasibilityCode;
  severity: 'blocking' | 'warning';
  /** Fully interpolated, verbatim from 02-UI-SPEC §Copywriting Contract. */
  message: string;
}

export interface FeasibilityInput {
  playerNames: readonly string[];
  rounds: number;
  /** `null` when the numeric field is empty or unparseable. */
  poolSize: number | null;
  /** `null` when the numeric field is empty or unparseable. */
  megasRequiredPerTeam: number | null;
  bannedIds: readonly string[];
  entries: readonly RosterEntry[];
}

export interface FeasibilityResult {
  blocked: boolean;
  /** Sorted by the declared precedence order. */
  problems: readonly FeasibilityProblem[];
  /** Roster entries surviving the banlist. */
  legalCount: number;
  /** Mega-capable roster entries surviving the banlist. Not derivable from `legalCount`. */
  megaCapableLegalCount: number;
  /** Bans that HIT the roster. Never the raw length of the banlist — see the doc block. */
  banCount: number;
}

/** The three pool-sizing presets DRFT-02 offers. Expressed as ratios so Phase 3 inherits them. */
export type PoolPreset = 'exact' | 'x1_5' | 'x2';

/**
 * The order reasons are reported in. Declared, not emergent.
 *
 * Fixing the first problem usually changes the rest, which is why the gate shows one reason
 * at a time — so which one is "first" is a product decision and lives here as data rather
 * than as the incidental order the checks happen to run in below.
 */
const PRECEDENCE: readonly FeasibilityCode[] = [
  'tooFewPlayers',
  'blankPlayerName',
  'duplicatePlayerName',
  'poolSizeNotAnInteger',
  'megasExceedRounds',
  'tooManyPlayersForRoster',
  'poolTooLarge',
  'poolTooSmall',
  'notEnoughMegas',
  'poolExactlyMinimum',
];

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

/**
 * Verbatim from 02-UI-SPEC §Copywriting Contract → "Feasibility reasons (RULE-07)", with
 * the two blockers 02-RESEARCH added.
 *
 * Held here rather than built at the call site because these are contracts down to the em
 * dash, and a component composing one is a component that can compose it differently on a
 * second surface.
 */
const TOO_FEW_PLAYERS = 'Add at least one more player. A draft needs two players.';
const POOL_SIZE_NOT_AN_INTEGER =
  'Pool size needs a whole number. Enter how many Pokémon the pool should hold.';

function blankPlayerNameMessage(position: number): string {
  return `Every player needs a name. Player ${position} is blank.`;
}

function duplicatePlayerNameMessage(name: string): string {
  return `Two players are both called "${name}". Give each player a different name.`;
}

function megasExceedRoundsMessage(rounds: number): string {
  return `A team has ${rounds} slots, so at most ${rounds} of them can be Megas. Lower the Megas required per team.`;
}

function tooManyPlayersForRosterMessage(
  players: number,
  rounds: number,
  needed: number,
  legal: number,
  bans: number,
): string {
  return `Too many players for the roster. ${players} players × ${rounds} rounds needs ${needed} Pokémon; only ${legal} are draftable after ${bans} bans.`;
}

function poolTooLargeMessage(legal: number, bans: number, poolSize: number): string {
  return `Pool is too large. Only ${legal} Pokémon are draftable after ${bans} bans; the pool is set to ${poolSize}.`;
}

function poolTooSmallMessage(
  players: number,
  rounds: number,
  needed: number,
  poolSize: number,
  bans: number,
): string {
  return `Pool is too small. ${players} players × ${rounds} rounds needs ${needed} Pokémon; the pool is ${poolSize} after ${bans} bans.`;
}

function notEnoughMegasMessage(
  players: number,
  megasPerTeam: number,
  needed: number,
  available: number,
  bans: number,
): string {
  return `Not enough Mega-capable Pokémon. ${players} players × ${megasPerTeam} Megas needs ${needed}; ${available} are draftable after ${bans} bans.`;
}

function poolExactlyMinimumMessage(poolSize: number, rounds: number): string {
  return `Warning — the pool is exactly ${poolSize}. The last player to pick in Round ${rounds} will have one Pokémon to choose from.`;
}

// ---------------------------------------------------------------------------
// Module-private helpers
// ---------------------------------------------------------------------------

/**
 * The form two player names must differ in to be two players.
 *
 * Trim, lowercase, collapse internal whitespace runs. The reason is not tidiness: a screen
 * reader cannot distinguish `Sam` from `sam `, the pick table cannot either, and a host who
 * has typed both will spend the draft asking which row is which.
 */
function normalizePlayerName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** The first name that a later row repeats, exactly as the host typed it, or `null`. */
function findDuplicatePlayerName(names: readonly string[]): string | null {
  const seen = new Map<string, string>();

  for (const name of names) {
    const key = normalizePlayerName(name);
    // A blank row is `blankPlayerName`'s problem. Reporting two of them as duplicates
    // would produce the sentence `Two players are both called ""`.
    if (key === '') continue;

    const first = seen.get(key);
    if (first !== undefined) return first;
    seen.set(key, name);
  }

  return null;
}

/** The value if it is a usable count, or `null`. Mirrors `migrate.ts`'s refusal to guess. */
function asSafeInteger(value: number | null, minimum: number, maximum: number): number | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value)) return null;
  if (value < minimum || value > maximum) return null;
  return value;
}

function blocking(code: FeasibilityCode, message: string): FeasibilityProblem {
  return { code, severity: 'blocking', message };
}

function warning(code: FeasibilityCode, message: string): FeasibilityProblem {
  return { code, severity: 'warning', message };
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

export function checkFeasibility(input: FeasibilityInput): FeasibilityResult {
  const { playerNames, rounds, bannedIds, entries } = input;

  // Set membership, never the raw length of the banlist. Two surfaces write one banlist so
  // a duplicate is reachable, and an imported file can carry ids this regulation dropped.
  const banned = new Set(bannedIds);
  const legalCount = entries.reduce(
    (total, entry) => (banned.has(entry.id) ? total : total + 1),
    0,
  );
  const megaCapableLegalCount = entries.reduce(
    (total, entry) => (entry.megaCapable && !banned.has(entry.id) ? total + 1 : total),
    0,
  );
  // The bans that HIT the roster, which is the figure every message quotes.
  const banCount = entries.length - legalCount;

  const players = playerNames.length;
  const needed = players * rounds;
  const poolSize = asSafeInteger(input.poolSize, 1, Number.MAX_SAFE_INTEGER);
  const megasPerTeam = asSafeInteger(input.megasRequiredPerTeam, 0, rounds);

  // Checks are grouped by the field the host would change, then sorted by PRECEDENCE. The
  // grouping is for the reader; the order the host sees is the declared one.
  const problems: FeasibilityProblem[] = [];

  // — the player rows —
  if (players < 2) {
    problems.push(blocking('tooFewPlayers', TOO_FEW_PLAYERS));
  }

  const blankIndex = playerNames.findIndex((name) => name.trim() === '');
  if (blankIndex !== -1) {
    problems.push(blocking('blankPlayerName', blankPlayerNameMessage(blankIndex + 1)));
  }

  const duplicate = findDuplicatePlayerName(playerNames);
  if (duplicate !== null) {
    problems.push(blocking('duplicatePlayerName', duplicatePlayerNameMessage(duplicate)));
  }

  // — the pool-size field —
  if (poolSize === null) {
    problems.push(blocking('poolSizeNotAnInteger', POOL_SIZE_NOT_AN_INTEGER));
  }

  const tooManyPlayers = needed > legalCount;
  if (tooManyPlayers) {
    problems.push(
      blocking(
        'tooManyPlayersForRoster',
        tooManyPlayersForRosterMessage(players, rounds, needed, legalCount, banCount),
      ),
    );
  }

  if (poolSize !== null && !tooManyPlayers && poolSize > legalCount) {
    problems.push(blocking('poolTooLarge', poolTooLargeMessage(legalCount, banCount, poolSize)));
  }

  if (poolSize !== null && poolSize < needed) {
    problems.push(
      blocking('poolTooSmall', poolTooSmallMessage(players, rounds, needed, poolSize, banCount)),
    );
  }

  if (poolSize !== null && poolSize === needed) {
    problems.push(warning('poolExactlyMinimum', poolExactlyMinimumMessage(poolSize, rounds)));
  }

  // — the Megas-per-team field —
  if (megasPerTeam === null) {
    problems.push(blocking('megasExceedRounds', megasExceedRoundsMessage(rounds)));
  }

  if (megasPerTeam !== null && players * megasPerTeam > megaCapableLegalCount) {
    problems.push(
      blocking(
        'notEnoughMegas',
        notEnoughMegasMessage(
          players,
          megasPerTeam,
          players * megasPerTeam,
          megaCapableLegalCount,
          banCount,
        ),
      ),
    );
  }

  problems.sort((a, b) => PRECEDENCE.indexOf(a.code) - PRECEDENCE.indexOf(b.code));

  return {
    blocked: problems.some((problem) => problem.severity === 'blocking'),
    problems,
    legalCount,
    megaCapableLegalCount,
    banCount,
  };
}

/**
 * The pool size DRFT-02 computes before the host overrides it (D-05).
 *
 * At six rounds all three presets are integers for every player count — `p × 6 × 1.5` is
 * `9p` — so the `Math.ceil` is unreachable today. It is written anyway so that Phase 3's
 * variable round count INHERITS a rounding rule instead of discovering that it needs one,
 * which is the moment a half-Pokémon pool size would otherwise appear.
 */
export function poolSizeForPreset(players: number, rounds: number, preset: PoolPreset): number {
  const minimum = players * rounds;

  switch (preset) {
    case 'exact':
      return minimum;
    case 'x1_5':
      return Math.ceil(minimum * 1.5);
    case 'x2':
      return minimum * 2;
  }
}
