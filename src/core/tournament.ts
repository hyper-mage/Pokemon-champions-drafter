/**
 * tournament.ts — every rule the night runs on after the last pick, in one file.
 *
 * Sync rule 3 applies here exactly as it does in `selectors.ts`: derived data is never
 * stored. Which stage the tournament is in, every pairing the round robin will ever hold,
 * how many of them are still to play, who is ahead and which tiebreak link put them there
 * are all recomputed from the folded log every time they are asked for.
 *
 * Everything here reads. Nothing here writes: no function in this file assigns into the
 * state it was handed, and the arrays and objects returned are always freshly built, so a
 * caller cannot mutate state through a selector's return value either. A caller that
 * pushed into a returned array would otherwise be writing into the fold, and the fold is a
 * cache of the log rather than somewhere to keep things.
 *
 * The UI-SPEC makes this a UI rule too: "if a surface seems to need the UI to decide a
 * rule, the selector is missing — add the selector, do not add the logic to the
 * component." Standings, the tiebreak chain and where it stops, seeding, bracket
 * structure, bye placement, the cut, which matches a correction voids and the
 * locked/reopened fold are named there as core, one by one, so that no component ever owns
 * one of them.
 *
 * ## Why this is a separate file and not more of `selectors.ts`
 *
 * `05-RESEARCH.md` §Recommended Project Structure keeps `selectors.ts` unchanged for this
 * phase and puts every tournament rule here. The two modules share one contract and split
 * on subject: `selectors.ts` answers questions about the DRAFT — the pool, the teams,
 * whose turn it is — and this file answers questions about what happens after it. The
 * seam between them is {@link selectIsTournamentComplete}, which this file imports and
 * never re-derives.
 *
 * ## What this module holds by the end of the phase
 *
 * Landing here in plan 05-03: the stage fold, the round-robin pair set, the remaining
 * count, the standings chain and the seeding it produces. Landing in 05-06: the bracket
 * structure with its byes, the locked/reopened fold, and the void cascade. Stating the
 * whole list now means the later additions land in a place that was planned for them
 * rather than one they accreted into.
 *
 * ## What this module deliberately does not have
 *
 *   No stored schedule.  D-03 removes the round structure entirely, so there is nothing
 *                        to keep in sync with reality and nothing to migrate.
 *   No comparator.       The tiebreak chain reaches head-to-head, which is not a total
 *                        order on a cycle. See {@link selectStandings}.
 *   No clock, no dice.   `npm run check:pure` fails the build on either, and correctly:
 *                        every ambient value this phase needs is stamped at the edge.
 */

import type { DraftState, MatchResult } from './model';
import { selectIsTournamentComplete } from './selectors';

/**
 * The shape of a round-robin match id, and the only place that shape is written down.
 *
 * No `g` flag, deliberately. A global regex carries `lastIndex` between calls, and a
 * module-level one would make `test` return alternating answers for the same string.
 */
const ROUND_ROBIN_MATCH_ID = /^rr:\d+:\d+$/;

/**
 * Which tournament surface is on screen — and the ONE place that is decided.
 *
 * `app.tsx` and `TournamentScreen` BRANCH on this; no component works it out. That is
 * what makes an imported document unable to declare a stage it is not in: the answer is a
 * fold of the log rather than a flag anything sets, on `selectPhase`'s and
 * `selectBanStageState`'s precedent.
 *
 *   `'notRunning'`  no tournament to show — `draftOnly`, or a draft that is not finished
 *   `'roundRobin'`  the results grid and the standings, with no cut taken yet
 *   `'bracket'`     a cut has been taken and the bracket is what the room is playing
 */
export type TournamentStage = 'notRunning' | 'roundRobin' | 'bracket';

/**
 * One pairing of the round robin. Derived from the player list; stored nowhere.
 *
 * `matchId` is `rr:{i}:{j}` with `i < j`, both 0-based indices into `config.players`.
 * `aId`/`bId` are the two players' ids, in that same index order.
 */
export interface RoundRobinMatch {
  matchId: string;
  aId: string;
  bId: string;
}

/**
 * Which surface the tournament is on, ordered from the cheapest fact to the most derived.
 *
 * `draftOnly` never reaches a tournament surface at all, whatever else the fold holds — a
 * document imported with results and a cut in it still answers `'notRunning'` here,
 * because the depth is the host's statement about what this tournament IS and the rest is
 * data it should not be carrying.
 *
 * The second gate is {@link selectIsTournamentComplete}, imported rather than re-derived.
 * It is picks-complete AND no swap round outstanding, which is already the condition the
 * export panels and the PERS-06 checkpoint open on. A tournament whose teams can still
 * change is not a tournament anyone should be recording results for, and re-deriving that
 * condition here would create a second definition free to disagree with the first.
 */
export function selectTournamentStage(state: DraftState): TournamentStage {
  if (state.config.depth === 'draftOnly') return 'notRunning';
  if (!selectIsTournamentComplete(state)) return 'notRunning';
  return state.cut === null ? 'roundRobin' : 'bracket';
}

/**
 * Every pairing the round robin will ever hold — the complete pair set, C(n,2) of them.
 *
 * **D-03: the round robin is a fill-in-any-order results grid, not a generated
 * round-by-round pairing schedule.** Every pairing is present from the moment the round
 * robin starts and the host records results in whatever order the games actually happen.
 *
 * So there is deliberately none of the machinery a round robin usually needs:
 *
 *   No pairing schedule.  There are no rounds, so nothing has to decide which pairs play
 *                         together, and nothing can drift out of step with the room.
 *   No sit-out round.     An odd player count has no bye here. The only byes in this
 *                         phase are the bracket's, and they are 05-06's.
 *   Nothing stored.       The pair set is a function of `config.players`, so a document
 *                         cannot carry a schedule that disagrees with its own player list.
 *
 * The ROADMAP's research brief asked for circle-method pairing and an odd-count bye. D-03
 * was locked after the ROADMAP was written and supersedes it; that structure must not be
 * built. `05-RESEARCH.md` §Corrections to Upstream Documents, Correction 2 records this.
 *
 * Counts, which `05-UI-SPEC.md` §4 sizes the results grid against: 4 → 6, 5 → 10,
 * 6 → 15, 7 → 21, 8 → 28.
 *
 * The array is FRESH on every call.
 */
export function selectRoundRobinMatches(state: DraftState): readonly RoundRobinMatch[] {
  const players = state.config.players;
  const matches: RoundRobinMatch[] = [];

  for (let i = 0; i < players.length; i++) {
    const a = players[i];
    if (a === undefined) continue;

    for (let j = i + 1; j < players.length; j++) {
      const b = players[j];
      if (b === undefined) continue;

      // INDICES, never the two player ids. `import-guard.buildPlayers` bounds a player id
      // only as a non-empty unique string, so an imported document can carry ids that
      // contain a colon — at which point the players (a:b, c) and (a, b:c) produce the
      // same key, two different matches collapse onto one, and the corruption is silent
      // because it lands in the fold rather than at the import boundary. Do NOT solve it
      // by tightening `buildPlayers`, which would reject documents that are valid today.
      // The participants stay player ids on `aId`/`bId`, where the identity rule applies.
      matches.push({ matchId: `rr:${i}:${j}`, aId: a.id, bId: b.id });
    }
  }

  return matches;
}

/**
 * How many round-robin matches are still to play.
 *
 * The pair set's size minus the number of ITS match ids that appear in
 * `state.matchResults`. A bracket result does not decrement it, and neither does a stray
 * `rr:` id naming a pairing this player list does not have.
 *
 * Two consumers, and they must not diverge: the `{k} of {n} matches still to play.` line
 * above the results grid, and the cut control's inert gate. One selector feeding both is
 * what makes the count load-bearing rather than decorative — a grid that said one thing
 * while the cut button believed another would be a bug nobody could see from either side.
 */
export function selectRemainingMatchCount(state: DraftState): number {
  const matches = selectRoundRobinMatches(state);
  let recorded = 0;

  for (const match of matches) {
    if (state.matchResults.some((result) => result.matchId === match.matchId)) recorded += 1;
  }

  return matches.length - recorded;
}

/**
 * One row of the standings table — TOUR-08.
 *
 * The row carries the link that decided it, not only its place, because `05-CONTEXT`
 * §Discretion requires the table to SAY which link is currently deciding the order.
 * `decidedBy` maps 1:1 onto `05-UI-SPEC.md` §6's five-row note table, so a component
 * renders a note by looking the member up rather than by working the chain out again.
 */
export interface StandingsRow {
  playerId: string;
  /**
   * `1…n`, and SHARED across the members of a block the chain could not resolve: three
   * players tied for third read `3 3 3` and the next resolved row reads `6`.
   *
   * Never `3 4 5`. That asserts an order this tool has explicitly refused to compute, and
   * it contradicts the row's own `Tied — order these yourself` note — the table would be
   * telling the room two different things in two adjacent columns. A shared number is the
   * only honest rendering of "these three are level and it is yours to break".
   */
  position: number;
  wins: number;
  losses: number;
  /**
   * The player's metric total across the round-robin matches they won.
   *
   * `0` on every row at `depth: 'draftAndBrackets'`, where the tier records no numbers and
   * `05-UI-SPEC.md` §6 does not render the column at all (D-02).
   */
  metric: number;
  decidedBy: 'record' | 'metric' | 'headToHead' | 'hostOrder' | 'tied';
}

/**
 * The link that separated a row from the block it was in. Derived from the row rather than
 * declared twice, so the union cannot drift away from the contract 05-11 renders.
 */
type DecidedBy = StandingsRow['decidedBy'];

/**
 * A run of players that the chain has finished with.
 *
 * `tied: true` means the members share one position, because the chain stopped without an
 * order for them. `tied: false` means they are in a definite order and each takes its own
 * position — which covers a single resolved player, a head-to-head pair and a
 * host-ordered block alike.
 */
interface StandingsGroup {
  members: string[];
  decidedBy: DecidedBy;
  tied: boolean;
}

/** One player's round-robin numbers. Computation-local; the row is what leaves. */
interface Tally {
  playerId: string;
  wins: number;
  losses: number;
  metric: number;
}

/**
 * The round-robin results that currently stand, one per pairing, highest `seq` winning.
 *
 * Computation-local, never returned. Three readers take their numbers from here — the
 * win/loss record, the metric total and the head-to-head link — and routing all three
 * through one list is what stops them disagreeing about which result is the live one.
 *
 * Two rules, both stated rather than assumed:
 *
 *   - Only `rr:` ids. A bracket result must never move a standings row, and filtering it
 *     out here is what makes that true of the record, the metric and head-to-head at once
 *     rather than in three places that could each forget.
 *   - Highest `seq` per match id. D-09 is "later beats earlier", and reading it here means
 *     this module gives the same answer whether a correction replaces the entry in the
 *     fold or lands beside it. With the one entry per pairing that
 *     `DraftState.matchResults` promises, this is an identity.
 */
function standingRoundRobinResults(state: DraftState): MatchResult[] {
  const live: MatchResult[] = [];

  for (const result of state.matchResults) {
    if (!ROUND_ROBIN_MATCH_ID.test(result.matchId)) continue;

    const at = live.findIndex((kept) => kept.matchId === result.matchId);
    if (at === -1) {
      live.push(result);
      continue;
    }

    const kept = live[at];
    if (kept !== undefined && result.seq > kept.seq) live[at] = result;
  }

  return live;
}

/**
 * One player's record and metric total across every round-robin match they played.
 *
 * The loop walks all of that player's matches, and a match they LOST contributes nothing
 * to the metric. That is not an omission: `MatchResult.metric` is the winner's number —
 * "Pokémon the winner had left standing", "KOs scored minus KOs conceded" — and one
 * result carries exactly one of them. There is no second number in the document for the
 * player who lost, so there is nothing to add.
 *
 * `countMetric` is false at `draftAndBrackets`, where the tier records no numbers at all
 * and the field stays `0` (D-02).
 */
function tallyFor(
  results: readonly MatchResult[],
  playerId: string,
  countMetric: boolean,
): Tally {
  let wins = 0;
  let losses = 0;
  let metric = 0;

  for (const result of results) {
    if (result.winnerId === playerId) {
      wins += 1;
      if (countMetric) metric += result.metric;
      continue;
    }
    if (result.loserId === playerId) losses += 1;
  }

  return { playerId, wins, losses, metric };
}

/**
 * Split a list into blocks of equal key, highest key first — links 1 and 2.
 *
 * Repeated maximum-selection rather than a sort, and the reason is the one Pitfall 3
 * gives: the warning sign for the bug this module exists to avoid is a `.sort()` call
 * anywhere near the standings, so there is not one anywhere in the file. At eight players
 * the cost of scanning instead is invisible, and what is bought is that no comparator
 * exists here for a later change to extend into a non-transitive one.
 *
 * Order WITHIN a block is the order the members arrived in, which is `config.players`
 * order all the way down. That is what makes an unresolved block render the same way on
 * every call rather than in whatever order a partition happened to produce.
 */
function partitionByDescendingKey(
  members: readonly string[],
  keyOf: (playerId: string) => number,
): string[][] {
  const blocks: string[][] = [];
  let remaining = [...members];

  while (remaining.length > 0) {
    let best = Number.NEGATIVE_INFINITY;
    for (const playerId of remaining) {
      const key = keyOf(playerId);
      if (key > best) best = key;
    }

    blocks.push(remaining.filter((playerId) => keyOf(playerId) === best));
    remaining = remaining.filter((playerId) => keyOf(playerId) !== best);
  }

  return blocks;
}

/**
 * Who won when these two played — link 3.
 *
 * Applied ONLY to a block that has already narrowed to exactly two, which is where
 * head-to-head is a total order and therefore safe. `05-UI-SPEC.md` §6 and `PROJECT.md`
 * §Out of Scope both stop the automatic chain here; a block of three or more is D-13's
 * override, and the row says so.
 *
 * `null` when they have no recorded result between them. In a complete round robin that
 * is unreachable, and after a D-10 void it is not, so it is answered rather than asserted.
 */
function headToHead(
  results: readonly MatchResult[],
  aId: string,
  bId: string,
): string | null {
  const result = results.find(
    (candidate) =>
      (candidate.winnerId === aId && candidate.loserId === bId) ||
      (candidate.winnerId === bId && candidate.loserId === aId),
  );

  return result === undefined ? null : result.winnerId;
}

/**
 * What the automatic chain does with a block it has not yet resolved — links 3 and 4.
 *
 * Link 3's rule is **"the block is size 2"**, not "the record group is size 2", and the
 * difference is testable. At tier 3, three players tied on record whose metric splits them
 * into `{A}` and `{B, C}` reach head-to-head legitimately for `{B, C}`: that block has
 * narrowed to two, so head-to-head is a total order over it, whatever the block it came
 * from looked like.
 */
function refineTiedBlock(
  results: readonly MatchResult[],
  block: readonly string[],
): StandingsGroup[] {
  if (block.length === 2) {
    const aId = block[0];
    const bId = block[1];

    if (aId !== undefined && bId !== undefined) {
      const winnerId = headToHead(results, aId, bId);
      if (winnerId !== null) {
        const loserId = winnerId === aId ? bId : aId;
        return [{ members: [winnerId, loserId], decidedBy: 'headToHead', tied: false }];
      }
    }
  }

  return [{ members: [...block], decidedBy: 'tied', tied: true }];
}

/**
 * The standings — TOUR-08's tiebreak chain, as a partition refinement.
 *
 * ## Why this is not a comparator, and must never become one
 *
 * "Sort by record, then by the metric, then by head-to-head" is the natural shape for
 * this, and it is correct right up to the link that is not a total order. Head-to-head is
 * non-transitive on a cycle — A beat B, B beat C, C beat A — and the ECMAScript spec
 * leaves the result of `Array.prototype.sort` IMPLEMENTATION-DEFINED for an inconsistent
 * comparator. The standings would then be arbitrary rather than merely wrong, and
 * arbitrary in a different direction in a different browser: the room reads one order off
 * the host's screen and a different one off their own, and nothing in the document
 * explains the difference (T-05-10).
 *
 * So the chain groups and refines instead. Head-to-head is only ever consulted about a
 * block that has already narrowed to exactly two, where it is a total order by
 * construction, and there is no `.sort()` call anywhere in this file.
 *
 * ## The links, in order
 *
 *   1. Partition by wins, descending.                        → `'record'`
 *   2. Within a block of size > 1, and ONLY at tier 3:
 *      partition by metric summed across every match, desc.  → `'metric'`
 *   3. Within a block that is now EXACTLY two:
 *      order by their head-to-head result.                   → `'headToHead'`
 *   4. Any block still of size >= 2: the host's own ordering. → `'hostOrder'`
 *      Otherwise the block is unresolved and shares a place.  → `'tied'`
 *
 * ## Link 2 does not exist at `draftAndBrackets`, and that is a decision
 *
 * D-02, which is D-01's direct consequence rather than a separate choice: with no numeric
 * field there is no differential to break a tie on. The tier-2 table has two links where
 * tier 3 has three, `metric` stays `0` on every row, and the host reaches the manual
 * override sooner. That is the honest cost of the lighter depth, and `05-UI-SPEC.md` §6's
 * tier-2 caption is the sentence that states it on screen rather than leaving the room to
 * notice it.
 *
 * `decidedBy` names the link that separated the row from the block it was in. A row that
 * was never in a block of size > 1 is `'record'`.
 *
 * The array and every row in it are FRESH on every call.
 */
export function selectStandings(state: DraftState): readonly StandingsRow[] {
  const results = standingRoundRobinResults(state);
  const scoresMetric = state.config.depth === 'draftBracketsAndLog';

  const tallies = state.config.players.map((player) =>
    tallyFor(results, player.id, scoresMetric),
  );
  const tallyOf = (playerId: string): Tally =>
    tallies.find((tally) => tally.playerId === playerId) ?? {
      playerId,
      wins: 0,
      losses: 0,
      metric: 0,
    };

  const playerIds = state.config.players.map((player) => player.id);
  const groups: StandingsGroup[] = [];

  for (const recordBlock of partitionByDescendingKey(
    playerIds,
    (playerId) => tallyOf(playerId).wins,
  )) {
    if (recordBlock.length === 1) {
      groups.push({ members: [...recordBlock], decidedBy: 'record', tied: false });
      continue;
    }

    // Link 2, and only at tier 3. At tier 2 the block passes through untouched, which is
    // what makes "one link fewer" true of the code and not only of the caption.
    const metricBlocks = scoresMetric
      ? partitionByDescendingKey(recordBlock, (playerId) => tallyOf(playerId).metric)
      : [recordBlock];

    for (const block of metricBlocks) {
      // Only reachable when the metric actually split the record block, since an unsplit
      // one is the record block itself and that has size > 1 by the branch above.
      if (block.length === 1) {
        groups.push({ members: [...block], decidedBy: 'metric', tied: false });
        continue;
      }

      groups.push(...refineTiedBlock(results, block));
    }
  }

  const rows: StandingsRow[] = [];
  let position = 1;

  for (const group of groups) {
    let offset = 0;

    for (const playerId of group.members) {
      const tally = tallyOf(playerId);
      rows.push({
        playerId,
        // A tied group shares the block's first place; every other group counts up.
        position: group.tied ? position : position + offset,
        wins: tally.wins,
        losses: tally.losses,
        metric: tally.metric,
        decidedBy: group.decidedBy,
      });
      offset += 1;
    }

    // Past the WHOLE block either way, so the row after three players tied for third is
    // sixth rather than fourth.
    position += group.members.length;
  }

  return rows;
}

/**
 * Seed order for the cut — the standings order, and nothing else.
 *
 * Not a second computation, and deliberately not one it could ever become: the standings
 * order IS the seeding order, which is the entire point of D-06 putting the cut on the
 * standings screen. A host who has just read the table and broken the ties by hand is
 * looking at the seeds. A separate ordering here would let the seeds disagree with the
 * table the host was looking at when they took the cut, and nothing on screen would show
 * which of the two the bracket had used.
 */
export function selectSeeding(state: DraftState): readonly string[] {
  return selectStandings(state).map((row) => row.playerId);
}
