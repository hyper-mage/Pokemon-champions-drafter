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
 * `PRECEDENCE` below deliberately deviates from 02-UI-SPEC §5's seven-item order, for four
 * reasons, all from 02-RESEARCH §Feasibility Arithmetic:
 *
 *   1. `poolSizeNotAnInteger` (F-08) is *malformed input*, not unsatisfiable arithmetic. It
 *      must be reported before any sentence computed from the malformed number, or the host
 *      reads a reason with `NaN` in it about a field they are not editing.
 *   2. `megasRequiredNotAnInteger` is the same class, for the same field the pool-size code
 *      covers one control along. It is deliberately SEPARATE from `megasExceedRounds`: five
 *      conditions used to produce one sentence, and "Lower the Megas required per team" is
 *      an instruction the host cannot carry out on an EMPTY field — which is the most
 *      common way to reach it, because deleting the `0` the field ships with is one
 *      keystroke. CLAUDE.md §Copy requires the stated next action to be the one that
 *      resolves the problem, so each condition names its own.
 *   3. `megasExceedRounds` (F-09) keeps its place above the arithmetic even though it is now
 *      arithmetic itself: when it holds, `players × k > megaCapableLegal` may still pass, so
 *      nothing else catches it.
 *   4. `tooManyPlayersForRoster` exists because at the Exact preset `N === players × rounds`
 *      identically, so `poolTooSmall` can NEVER fire, and a 40-player host would otherwise be
 *      told "Pool is too large" when the fix is fewer players.
 *
 * `checkFeasibility` collects ALL problems and sorts them, which is where it parts company
 * with `canApply` in `reduce.ts` — that returns the first failure, because a rejected action
 * needs one reason. This gate renders the first plus a count of the rest, so it needs them all.
 *
 * ## Two Mega counts, and why both are returned
 *
 * `megaCapableLegalCount` counts the `megaCapable` FLAG. `megaEligibleLegalCount` counts the
 * species that can STILL Mega once Mega-forme bans and the X/Y pin have been applied, which
 * after D-09/D-10 is a different and smaller number: a species can carry the flag and have no
 * legal forme left. RULE-09 is measured against the second, because the first would let a host
 * ban every forme of fifty species and still be told the Mega rounds are satisfiable.
 *
 * The first is kept rather than replaced. D-11 calls it the pre-ban upper bound and the
 * post-rotation cross-check, `draw.ts` records it into `pool/built`, and `:129` below already
 * argues that a derivable-looking pair must be two fields.
 *
 * ## The two swap fields are bounded here as well as at the import boundary
 *
 * `MAX_SWAP_BUDGET` and `MAX_SWAP_ROUNDS` are imported from `import-guard.ts` rather than
 * restated. They have to be the SAME two numbers: `handleStart` writes whatever this gate
 * accepted into `config`, `persistence.load` runs the result back through
 * `isValidTournament`, and a value this gate allowed but that guard refuses is a tournament
 * the host cannot resume. One number, two readers — the alternative is a build that creates
 * documents it will not re-open.
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

import { MAX_SWAP_BUDGET, MAX_SWAP_ROUNDS } from './import-guard';
import { choiceFor, isMegaEligible } from './mega';
import type { DualMegaChoice } from './model';
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
  /** The Megas-per-team field is empty, fractional, unsafe, or negative. */
  | 'megasRequiredNotAnInteger'
  /** The Megas-per-team field holds a usable number that is larger than the round count. */
  | 'megasExceedRounds'
  /** The party needs more slots than the post-ban roster has entries. */
  | 'tooManyPlayersForRoster'
  /** The requested pool is bigger than the post-ban legal count. */
  | 'poolTooLarge'
  /** The requested pool cannot fill every player's team. */
  | 'poolTooSmall'
  /** The Mega requirement outruns the species that can still Mega — RULE-09, D-11. */
  | 'notEnoughMegas'
  /** The swap-budget field is empty, fractional, unsafe, or negative. */
  | 'swapBudgetNotAnInteger'
  /** The swap-budget field holds a usable number past the bound the import guard enforces. */
  | 'swapBudgetTooLarge'
  /** The swap-rounds field is empty, fractional, unsafe, or negative. */
  | 'swapRoundsNotAnInteger'
  /** The swap-rounds field holds a usable number past the bound the import guard enforces. */
  | 'swapRoundsTooLarge'
  /** Satisfiable but degenerate: the last picker of the last round has one option. */
  | 'poolExactlyMinimum'
  /** Satisfiable but degenerate: swap rounds open on a pool the last pick emptied — D-32. */
  | 'swapRoundsOnExactPool';

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
  /** Banned `megaFormes[].id` values — D-09. Per FORME, never per species. */
  megaFormeBans: readonly string[];
  /** The host's X/Y pins — D-10. An absent species means `'either'`. */
  dualMegaChoices: readonly DualMegaChoice[];
  /** `null` when the numeric field is empty or unparseable. */
  swapBudget: number | null;
  /** `null` when the numeric field is empty or unparseable. */
  swapRounds: number | null;
  entries: readonly RosterEntry[];
}

export interface FeasibilityResult {
  blocked: boolean;
  /** Sorted by the declared precedence order. */
  problems: readonly FeasibilityProblem[];
  /** Roster entries surviving the banlist. */
  legalCount: number;
  /**
   * Mega-capable roster entries surviving the species banlist. Not derivable from
   * `legalCount`. Counts the `megaCapable` FLAG, so a Mega-forme ban does not move it — that
   * is what makes it the pre-ban upper bound and the post-rotation cross-check D-11 wants,
   * and it is NOT what RULE-09 is measured against.
   */
  megaCapableLegalCount: number;
  /**
   * Roster entries that can STILL Mega: unbanned, and carrying at least one Mega forme that
   * is neither banned nor excluded by the host's X/Y pin. This is RULE-09's right-hand side.
   */
  megaEligibleLegalCount: number;
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
  'megasRequiredNotAnInteger',
  'swapBudgetNotAnInteger',
  'swapRoundsNotAnInteger',
  'megasExceedRounds',
  'swapBudgetTooLarge',
  'swapRoundsTooLarge',
  'tooManyPlayersForRoster',
  'poolTooLarge',
  'poolTooSmall',
  'notEnoughMegas',
  // ABOVE `poolExactlyMinimum`, not below it. The two hold together by construction — both
  // fire on `poolSize === players × rounds` and nothing else — and the bar renders
  // `problems[0]`, so ordering the swap sentence second would make it unrenderable. It is
  // also the more informative of the two: it states the pool size the other one states AND
  // what that costs the first swapper, so a host reading it needs no second sentence.
  'swapRoundsOnExactPool',
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

/**
 * NOT in the 02-UI-SPEC copywriting table, and flagged rather than quietly added.
 *
 * The table gives the Megas-per-team field one sentence, and that sentence tells the host
 * to lower a value — which is not an action available on an empty or unparseable field.
 * This is the missing row, written in the shape the table's own pool-size row uses one
 * control along: name the field, name what it needs, then name the keystroke that supplies
 * it. `importAnnouncement` in `app.tsx` records the same kind of gap the same way.
 */
const MEGAS_REQUIRED_NOT_AN_INTEGER =
  'Megas required per team needs a whole number. Enter 0 for no Mega requirement.';

/**
 * The two swap fields inherit the `number | null` rule the header states, and their sentences
 * follow the pool-size row's shape: name the field, name what it needs, name the keystroke
 * that supplies it. Verbatim from 03-UI-SPEC §5.
 */
const SWAP_BUDGET_NOT_AN_INTEGER = 'Swap budget needs a whole number. Enter 0 for no swaps.';
const SWAP_ROUNDS_NOT_AN_INTEGER =
  'Swap rounds needs a whole number. Enter 0 to end the draft with the last pick.';

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

/**
 * Not in the 02-UI-SPEC table either — it supersedes that table's row. Verbatim from
 * 03-UI-SPEC §5, and three things in it are load-bearing rather than stylistic:
 *
 *   1. **"can Mega", not "Mega-capable".** After D-09/D-10 a species can carry the
 *      `megaCapable` flag and have no legal forme left, so the old wording named a count
 *      this sentence no longer reports.
 *   2. **Both ban lists, with their own counts.** 03-RESEARCH proves this gate can only fire
 *      because of Mega-forme bans at 4–8 players — `8 × 6 = 48` sits under the pre-ban
 *      eligible count — so a host sent to the species banlist is sent to the wrong screen.
 *      The species figure stays because a large party can reach the gate through it.
 *   3. **"Mega rounds", not "Megas".** The compiler has made them the same thing, and the
 *      schedule preview two sub-sections above already calls them rounds.
 *
 * One code rather than two: `:29-34`'s test for splitting is that each condition names its
 * own next action, and both conditions here resolve to "lower the requirement or unban
 * something". Naming both lists in one sentence is cheaper than a second precedence row.
 */
function notEnoughMegasMessage(
  players: number,
  megaRounds: number,
  needed: number,
  available: number,
  speciesBans: number,
  formeBans: number,
): string {
  return `Not enough Pokémon can Mega. ${players} players × ${megaRounds} Mega rounds needs ${needed}; ${available} can still Mega after ${speciesBans} species bans and ${formeBans} Mega-forme bans. Lower the Mega requirement, or unban a Mega forme.`;
}

/**
 * The two bound sentences. Each names the bound and the field to change, because "needs a
 * whole number" is false about a value that is one — the same reason `megasExceedRounds` is
 * separate from `megasRequiredNotAnInteger` one field along.
 */
function swapBudgetTooLargeMessage(maximum: number): string {
  return `Swap budget is too high. A player can be given at most ${maximum} swaps. Lower the swap budget.`;
}

function swapRoundsTooLargeMessage(maximum: number): string {
  return `Too many swap rounds. A draft can be followed by at most ${maximum} swap rounds. Lower the swap rounds.`;
}

function poolExactlyMinimumMessage(poolSize: number, rounds: number): string {
  return `Warning — the pool is exactly ${poolSize}. The last player to pick in Round ${rounds} will have one Pokémon to choose from.`;
}

/**
 * D-32, and it is a WARNING for the reason this module has a second severity at all.
 *
 * The Exact preset is the default and passes every blocking check, so blocking here would
 * refuse the shipped configuration. Nothing about it is unsatisfiable: the pool is empty when
 * the last pick lands, so the FIRST swapper can only take what someone else drops — and the
 * second and later swappers do have that first swapper's drop. Degenerate, not impossible.
 */
function swapRoundsOnExactPoolMessage(poolSize: number): string {
  return `Warning — the pool is exactly ${poolSize}, so it is empty when the last pick lands. The first player to swap can only take what someone else drops.`;
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

  // RULE-09's right-hand side. Set membership again, never the RAW LENGTH of the forme
  // banlist, which is a different number for two reasons: two surfaces write one forme
  // banlist so a duplicate is reachable, and an imported file can carry forme ids this
  // regulation dropped. Either would make the pool look smaller than it is and block a
  // configuration that is satisfiable (T-03-19).
  const bannedFormes = new Set(input.megaFormeBans);
  const megaEligibleLegalCount = entries.reduce(
    (total, entry) =>
      !banned.has(entry.id) &&
      isMegaEligible(entry, bannedFormes, choiceFor(input.dualMegaChoices, entry.id))
        ? total + 1
        : total,
    0,
  );
  // The forme bans that HIT the roster, counted the same way for the same reason.
  const megaFormeBanCount = entries.reduce(
    (total, entry) =>
      total +
      entry.megaFormes.reduce((hits, forme) => (bannedFormes.has(forme.id) ? hits + 1 : hits), 0),
    0,
  );

  // The bans that HIT the roster, which is the figure every message quotes.
  const banCount = entries.length - legalCount;

  const players = playerNames.length;
  const needed = players * rounds;
  const poolSize = asSafeInteger(input.poolSize, 1, Number.MAX_SAFE_INTEGER);

  // Two questions, asked separately, because they have two different answers for the host.
  // `asSafeInteger` returns null for five conditions at once, and the sentence that used to
  // cover all five told a host with an EMPTY field to lower a value that is not there.
  //
  // A negative count is grouped with the malformed cases rather than with the bound, and
  // that mirrors the pool-size field exactly: `poolSizeNotAnInteger` covers "below one" too,
  // because "this is not a count" and "this count is too big" are the two things the host
  // can actually distinguish.
  const megasRequiredMalformed =
    asSafeInteger(input.megasRequiredPerTeam, 0, Number.MAX_SAFE_INTEGER) === null;
  const megasPerTeam = megasRequiredMalformed
    ? null
    : asSafeInteger(input.megasRequiredPerTeam, 0, rounds);

  // The two swap fields, asked the same two questions for the same reason. An emptied field
  // is `null` and every relational comparison with `NaN` is false, so a gate that merely
  // compared would report all-clear on a configuration the host has not finished stating.
  const swapBudgetMalformed =
    asSafeInteger(input.swapBudget, 0, Number.MAX_SAFE_INTEGER) === null;
  const swapBudget = swapBudgetMalformed
    ? null
    : asSafeInteger(input.swapBudget, 0, MAX_SWAP_BUDGET);

  const swapRoundsMalformed =
    asSafeInteger(input.swapRounds, 0, Number.MAX_SAFE_INTEGER) === null;
  const swapRounds = swapRoundsMalformed
    ? null
    : asSafeInteger(input.swapRounds, 0, MAX_SWAP_ROUNDS);

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

  // — the two swap fields —
  if (swapBudgetMalformed) {
    problems.push(blocking('swapBudgetNotAnInteger', SWAP_BUDGET_NOT_AN_INTEGER));
  } else if (swapBudget === null) {
    problems.push(
      blocking('swapBudgetTooLarge', swapBudgetTooLargeMessage(MAX_SWAP_BUDGET)),
    );
  }

  if (swapRoundsMalformed) {
    problems.push(blocking('swapRoundsNotAnInteger', SWAP_ROUNDS_NOT_AN_INTEGER));
  } else if (swapRounds === null) {
    problems.push(
      blocking('swapRoundsTooLarge', swapRoundsTooLargeMessage(MAX_SWAP_ROUNDS)),
    );
  }

  if (poolSize !== null && poolSize === needed && swapRounds !== null && swapRounds > 0) {
    problems.push(
      warning('swapRoundsOnExactPool', swapRoundsOnExactPoolMessage(poolSize)),
    );
  }

  // — the Megas-per-team field —
  if (megasRequiredMalformed) {
    problems.push(
      blocking('megasRequiredNotAnInteger', MEGAS_REQUIRED_NOT_AN_INTEGER),
    );
  } else if (megasPerTeam === null) {
    // The only condition left: a usable count larger than the number of picks a team has
    // to spend on it. `Lower the Megas required per team` names an action that exists.
    problems.push(blocking('megasExceedRounds', megasExceedRoundsMessage(rounds)));
  }

  // RULE-09, measured over the species that can STILL Mega. The compiler has made
  // `megasRequiredPerTeam` and the Mega-round count the same number, so `megasPerTeam` IS the
  // Mega-round count the sentence names.
  //
  // Measured over the CANDIDATE SET rather than over the drawn pool, and that is structural
  // rather than a shortcut: `ConfigScreen` guards the draw on `blocked`, so the draw is `null`
  // whenever this gate has anything to say. `drawPool`'s stage 2 carries the count into the
  // pool by construction, which is what makes D-11's wording reachable from here.
  if (megasPerTeam !== null && players * megasPerTeam > megaEligibleLegalCount) {
    problems.push(
      blocking(
        'notEnoughMegas',
        notEnoughMegasMessage(
          players,
          megasPerTeam,
          players * megasPerTeam,
          megaEligibleLegalCount,
          banCount,
          megaFormeBanCount,
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
    megaEligibleLegalCount,
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
