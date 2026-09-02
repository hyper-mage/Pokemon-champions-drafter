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
 * ## RULE-08 — the post-reveal re-check is THIS function, and there is no second one
 *
 * After a blind or snake reveal the bans have to be re-checked against the pool. That check
 * is a call to `checkFeasibility`. It is NOT a second gate function beside it, and no such
 * function may be added — a grep for one is an acceptance criterion of the plan that wrote
 * this section and of the plan that consumes it:
 *
 *   - `bannedIds` is the UNION of the host banlist and every revealed player ban, deduped.
 *   - `bansPerPlayer` is `0` and `banMode` is `'hostBanlist'`, because those two fields mean
 *     "player bans this configuration has NOT YET put in `bannedIds`". By the reveal there
 *     are none: counting the ritual again would double-count every ban, and validating a
 *     field the host can no longer edit would state a problem with no next action.
 *
 * A second arithmetic is a second thing that can disagree with the first about whether the
 * night can proceed, and this module's first sentence is that there is one place that knows
 * what is satisfiable. Reuse also gets the pool-size and player-count branches for free — a
 * Mega-only re-check would miss exactly the crash D-21 does not name. The caller renders
 * blocking problems only: `poolExactlyMinimum` and `swapRoundsOnExactPool` are config-time
 * warnings, and the reveal is a screen where D-22 has removed every exit but abandonment.
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

import { MAX_BANS_PER_PLAYER, MAX_SWAP_BUDGET, MAX_SWAP_ROUNDS } from './import-guard';
import { choiceFor, isMegaEligible } from './mega';
import { players } from './plural';
import type { BanMode, DualMegaChoice, TournamentDepth } from './model';
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
  /** The bans-per-player field is empty, fractional, unsafe, or negative — blind and snake only. */
  | 'bansPerPlayerNotAnInteger'
  /** The bans-per-player field is a usable 0, which is a ritual with nothing in it. */
  | 'bansPerPlayerNotPositive'
  /** The bans-per-player field holds a usable number past the bound the import guard enforces. */
  | 'bansPerPlayerTooLarge'
  /** Satisfiable but degenerate: the last picker of the last round has one option. */
  | 'poolExactlyMinimum'
  /** Satisfiable but degenerate: swap rounds open on a pool the last pick emptied — D-32. */
  | 'swapRoundsOnExactPool'
  /** Satisfiable but degenerate: a bracket configured for fewer than 4 players — TOUR-01. */
  | 'bracketNeedsFourPlayers';

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
  /**
   * Which ritual the host chose — BAN-01. `'hostBanlist'` contributes no player bans.
   *
   * Read by this gate for exactly two things, and both are the same question: does this
   * configuration carry player bans that are NOT YET in `bannedIds`? At `'hostBanlist'` the
   * answer is no, so the `Bans per player` field is void and `q` is zero — which is what
   * keeps every predicate below byte-for-byte the rule Phase 3 shipped.
   *
   * **A caller whose player bans are already materialised into `bannedIds` passes
   * `'hostBanlist'`**, whatever the document's stored mode says, for the same reason it
   * passes `bansPerPlayer: 0`: the bans are in the banlist, so counting the ritual again
   * would count them twice, and validating a field the host can no longer edit would report
   * a problem with no next action. See the module header's post-reveal contract.
   */
  banMode: BanMode;
  /**
   * How far past the last pick the host says the night runs — TOUR-01.
   *
   * Read by this gate for exactly one question: is a bracket being configured for fewer
   * than 4 players? Nothing else here consults it. The two deeper tiers are the same
   * question because they configure the same bracket; `'draftOnly'` configures none, so it
   * asks nothing.
   *
   * **A caller whose depth is already settled passes `'draftOnly'`**, whatever the
   * document's stored depth says, on the same precedent as {@link FeasibilityInput.banMode}
   * above. The warning is about a tournament that has NOT been created yet — its whole
   * value is the next action it offers, "choose Draft only, or add players", and neither
   * half of that is available once a document exists. A post-adoption depth notice would be
   * a sentence naming two things the host cannot do, which is why there is not one.
   */
  depth: TournamentDepth;
  /**
   * Player bans NOT YET reflected in `bannedIds` — D-21. `null` when the field is empty.
   *
   * The config screen passes the config field. The post-reveal re-check passes `0`, because
   * by then the bans are materialised into `bannedIds` and a non-zero value would count them
   * twice.
   */
  bansPerPlayer: number | null;
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
  // All three bans-per-player reasons sit HERE, beside `swapBudgetNotAnInteger` rather than
  // split across the malformed and the bound groups the way the two swap fields are. Two
  // reasons: `Bans` is group 4 on the config screen and `Swaps` is group 5, so this is the
  // field order the host reads; and unlike `swapBudgetTooLarge`, none of these three is
  // arithmetic about the roster — all three are the same field being unusable, and a host
  // fixing it should not have to fix it twice at two different points in the list.
  'bansPerPlayerNotAnInteger',
  'bansPerPlayerNotPositive',
  'bansPerPlayerTooLarge',
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
  // LAST, and below both pool warnings. It is a degeneracy warning like its two neighbours
  // rather than a satisfiability blocker — a three-person bracket runs perfectly well, it
  // just tells you nothing the round robin did not. Position is a rendering decision as
  // much as a semantic one, because `FeasibilityBar` renders `problems[0]`: last means a
  // host whose pool arithmetic is also degenerate reads the pool sentence first, which is
  // the one that changes what the draft does. This sentence changes only what happens
  // after it, so it is the one that can wait.
  'bracketNeedsFourPlayers',
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

/**
 * The two `Bans per player` sentences, verbatim from 04-UI-SPEC §2.
 *
 * Both name a SECOND remedy the other numeric fields do not have — switching ban mode —
 * because this field is the only one in the gate that exists because of a mode choice. A
 * host who does not want to think about a ban count has a way out of the field entirely,
 * and CLAUDE.md §Copy asks the sentence to name the action that resolves the problem.
 */
const BANS_PER_PLAYER_NOT_AN_INTEGER =
  'Bans per player needs a whole number. Enter 1 or more, or switch to host banlist.';
const BANS_PER_PLAYER_NOT_POSITIVE =
  'Blind and snake need at least 1 ban per player. Enter a number, or switch to host banlist.';

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
 *
 * ## ONE composer, TWO arms — and it must stay one
 *
 * 04-UI-SPEC §2 gives the blind/snake mode a sentence with one extra clause and one extra
 * remedy. The shared prefix, the `{x}` need, the `{y}` availability and the two ban counts
 * are computed HERE, once, for both arms. Two composers would be two strings that can be
 * reworded independently, and the `hostBanlist` arm is a contract Phase 3 already shipped
 * and a test pins byte for byte.
 *
 * `playerBans` is the arm selector as well as an interpolation: `null` means "this
 * configuration has no pending player bans", which is `hostBanlist` and also every caller
 * whose bans are already materialised into the banlist.
 */
function notEnoughMegasMessage(
  players: number,
  megaRounds: number,
  needed: number,
  megaEligible: number,
  speciesBans: number,
  formeBans: number,
  playerBans: number | null,
): string {
  const q = playerBans ?? 0;

  // `{y}` is what can still Mega AFTER the pessimistic player-ban term, or the sentence is
  // not true as written. Clamped at 0 because `q` is `players × bansPerPlayer` and can
  // exceed the eligible count outright at high player counts — a negative number in a
  // sentence read off a shared screen reads as a broken tool rather than as a hard limit.
  // At `q === 0` the two arms compute the identical `{y}`, which is what makes the
  // `hostBanlist` arm agree with Phase 3 by construction rather than by coincidence.
  const available = Math.max(0, megaEligible - q);

  const prefix = `Not enough Pokémon can Mega. ${players} players × ${megaRounds} Mega rounds needs ${needed}; ${available} can still Mega after ${speciesBans} species bans`;

  if (playerBans === null) {
    return `${prefix} and ${formeBans} Mega-forme bans. Lower the Mega requirement, or unban a Mega forme.`;
  }

  return `${prefix}, ${formeBans} Mega-forme bans and ${q} player bans. Lower the Mega requirement, lower bans per player, or unban a Mega forme.`;
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

/**
 * The third bound sentence, in `swapBudgetTooLarge`'s shape for `swapBudgetTooLarge`'s
 * reason: "needs a whole number" is false about a value that is one, so the count and the
 * bound are two questions with two different next actions.
 */
function bansPerPlayerTooLargeMessage(maximum: number): string {
  return `Bans per player is too high. A player can be given at most ${maximum} bans. Lower the bans per player.`;
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

/**
 * TOUR-01, and a WARNING for the same reason its two neighbours above are.
 *
 * Nothing about a three-person bracket is unsatisfiable — it runs, it produces a winner,
 * and a host who wants one is entitled to it. What it is, is redundant: at three players
 * the round robin has already played every pairing, so the bracket re-runs matches whose
 * answers are known. Saying so once is the entire job. **It must never set `blocked`**, per
 * `05-UI-SPEC` §1 and the project's warn-rather-than-hard-cap posture.
 *
 * Verbatim from `05-UI-SPEC` §1, like every string in this module. If the sentence reads
 * awkwardly at two players, the fix is in the copy contract, not here.
 */
function bracketNeedsFourPlayersMessage(playerCount: number): string {
  return `A bracket needs at least 4 players to mean much. At ${players(playerCount)} the round robin already decides it. Choose Draft only, or add players.`;
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
  const { playerNames, rounds, bannedIds, banMode, depth, entries } = input;

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

  // — the bans-per-player field —
  //
  // The same two questions the swap fields are asked, plus a third between them, because
  // this field has THREE answers rather than two: unreadable, readable but empty of any
  // ritual, and readable but past the bound. Order matters for the same reason it does one
  // field along — an emptied field is `null` and every relational comparison with `NaN` is
  // false, so the malformed question has to be asked first or the other two answer about a
  // value that is not there.
  //
  // `MAX_BANS_PER_PLAYER` is IMPORTED, never restated as 24: `:60-67`'s invariant applies
  // here word for word. `handleStart` writes whatever this gate accepted, `persistence.load`
  // runs the result back through `isValidTournament`, and a count this gate allowed but that
  // guard refuses is a tournament the host cannot resume (T-04-09).
  const bansPerPlayerMalformed =
    asSafeInteger(input.bansPerPlayer, 0, Number.MAX_SAFE_INTEGER) === null;
  const bansPerPlayerPositive = bansPerPlayerMalformed
    ? null
    : asSafeInteger(input.bansPerPlayer, 1, Number.MAX_SAFE_INTEGER);
  const bansPerPlayer =
    bansPerPlayerPositive === null
      ? null
      : asSafeInteger(input.bansPerPlayer, 1, MAX_BANS_PER_PLAYER);

  /**
   * D-21's pessimistic player-ban term: every player spends every ban, and every ban lands
   * on a species this configuration needed.
   *
   * Zero at `hostBanlist` because that mode has no player bans at all — a non-zero term
   * there would block configurations Phase 2 verified, and the whole of D-01's
   * zero-regression posture rests on this line.
   *
   * A malformed field contributes `NaN` rather than a number, deliberately. Every relational
   * comparison with `NaN` is false, which SUPPRESSES the three arithmetic sentences below
   * while the field is unreadable — the same posture `poolSizeNotAnInteger` takes one field
   * along, and for the same reason: a sentence computed from a number the host is still
   * typing tells them about a field they are not editing. `bansPerPlayerNotAnInteger` has
   * already blocked, so nothing reaches the draw either way.
   *
   * A collision between two players WASTES a ban rather than removing an extra species, so
   * the post-reveal pool is always at least as large as this worst case (D-21). That is what
   * makes the post-reveal re-check belt-and-braces rather than a live trap.
   */
  const q =
    banMode === 'hostBanlist'
      ? 0
      : players * (bansPerPlayerMalformed ? Number.NaN : (input.bansPerPlayer ?? 0));

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

  // Both sentences quote the PESSIMISTIC figures — `legalCount - q` draftable after
  // `banCount + q` bans — rather than today's. The string is Phase 2's, unchanged to the
  // byte; only the interpolations move, exactly as `{y}` moves in the Mega sentence, and
  // for the identical reason: at `q > 0` the un-adjusted figures make the sentence read as
  // no problem at all ("only 235 draftable; the pool is set to 235"). At `q === 0` both
  // reduce to the numbers Phase 2 verified.
  const pessimisticLegal = legalCount - q;
  const pessimisticBans = banCount + q;

  const tooManyPlayers = needed > pessimisticLegal;
  if (tooManyPlayers) {
    problems.push(
      blocking(
        'tooManyPlayersForRoster',
        tooManyPlayersForRosterMessage(
          players,
          rounds,
          needed,
          pessimisticLegal,
          pessimisticBans,
        ),
      ),
    );
  }

  // The correction D-21 does not name, and the more important of the two: this fired only
  // ABOVE `legalCount`, the pool-size field is deliberately unclamped (Phase 2 D-06), and
  // `drawPool` deliberately does not clamp either — `draw.ts:108-112` states that a `count`
  // larger than `pool.length` reaches `nextInt` with an empty range and the `RangeError`
  // surfaces, because clamping would hand back a pool quietly smaller than the one the host
  // configured. That throw is upstream POLICY BEING HONOURED, not a bug to fix in `draw.ts`.
  // Without `q` here the ordinary config flow reaches it on a shared screen mid-ritual
  // (Pitfall 2, T-04-06); with it, the pool the gate accepts still fits after the reveal.
  if (poolSize !== null && !tooManyPlayers && poolSize > pessimisticLegal) {
    problems.push(
      blocking('poolTooLarge', poolTooLargeMessage(pessimisticLegal, pessimisticBans, poolSize)),
    );
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

  // — the bracket, in the two depths that have one —
  //
  // Gated on the DEPTH, not on the player count alone: at `draftOnly` there is no bracket
  // for this to be a warning about. The bound is "fewer than 4"; exactly 4 is the smallest
  // bracket that is not simply the round robin replayed, so it says nothing.
  //
  // There is deliberately NO upper gate here. A 16-player round robin is 120 matches and a
  // long night, and it is a legitimate choice the config screen already states the size of.
  // `05-UI-SPEC` §1 records the prohibition explicitly so nobody adds one reflexively, and
  // a test pins the absence.
  if (depth !== 'draftOnly' && playerNames.length < 4) {
    problems.push(
      warning('bracketNeedsFourPlayers', bracketNeedsFourPlayersMessage(playerNames.length)),
    );
  }

  // — the bans-per-player field, in the two modes that have one —
  //
  // Gated on the MODE, not merely on the value. At `hostBanlist` the field is wholly void:
  // 04-UI-SPEC §1 does not render it, `0` is the value the document stores, and a code that
  // fired here would block a configuration that is correct and that Phase 2 verified.
  if (banMode !== 'hostBanlist') {
    if (bansPerPlayerMalformed) {
      problems.push(blocking('bansPerPlayerNotAnInteger', BANS_PER_PLAYER_NOT_AN_INTEGER));
    } else if (bansPerPlayerPositive === null) {
      problems.push(blocking('bansPerPlayerNotPositive', BANS_PER_PLAYER_NOT_POSITIVE));
    } else if (bansPerPlayer === null) {
      problems.push(
        blocking('bansPerPlayerTooLarge', bansPerPlayerTooLargeMessage(MAX_BANS_PER_PLAYER)),
      );
    }
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
  // D-21 subtracts `q` and NOTHING ELSE. D-21's own prose reads as
  // `megaEligible - megaBans - players × bansPerPlayer`, and taking that literally against
  // this variable double-subtracts: `megaEligibleLegalCount` is computed at `:400-408` from
  // entries that are both unbanned AND still Mega-eligible, so the host species bans and the
  // Mega-forme bans are already out of it — its doc block at `:159-163` says so in as many
  // words. Do not "restore" D-21's literal wording here; it would block satisfiable
  // configurations, which is the failure RULE-07 exists to avoid in the other direction.
  if (megasPerTeam !== null && players * megasPerTeam > megaEligibleLegalCount - q) {
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
          // The arm selector as well as `{q}`. `null` is "no pending player bans", which is
          // `hostBanlist` and every caller whose bans are already in `bannedIds`.
          banMode === 'hostBanlist' ? null : q,
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
