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
 *   - Only ids in THE PAIR SET this player list derives — not merely `rr:`-shaped ones. A
 *     bracket result must never move a standings row, and filtering here is what makes
 *     that true of the record, the metric and head-to-head at once rather than in three
 *     places that could each forget.
 *
 *     The pair set rather than {@link ROUND_ROBIN_MATCH_ID} because
 *     {@link selectRemainingMatchCount} already declines "a stray `rr:` id naming a
 *     pairing this player list does not have", and the two must not disagree about what a
 *     round-robin result IS. They did: `import-guard.MATCH_ID_PATTERN` accepts any
 *     `rr:\d+:\d+` without requiring `i < j` or bounding either index against
 *     `config.players.length`, so an imported document carrying `rr:9:9` fed a phantom win
 *     into a player's record and metric total — moving the standings, the seeding and
 *     therefore the whole bracket — while the grid above it read `All N matches are
 *     recorded.` and showed nothing amiss. `canApply` refuses origination
 *     (`unknownMatch`), so it was import-only, and importing a friend's JSON is a
 *     first-class path in this app.
 *   - Highest `seq` per match id. D-09 is "later beats earlier", and reading it here means
 *     this module gives the same answer whether a correction replaces the entry in the
 *     fold or lands beside it. With the one entry per pairing that
 *     `DraftState.matchResults` promises, this is an identity.
 */
function standingRoundRobinResults(state: DraftState): MatchResult[] {
  // Local to the computation and never persisted, which is what the serializability rule
  // draws the line at — a `Set` in the document would be the violation.
  const known = new Set(selectRoundRobinMatches(state).map((match) => match.matchId));
  const live: MatchResult[] = [];

  for (const result of state.matchResults) {
    if (!known.has(result.matchId)) continue;

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
 * Same members, ignoring order — the whole of link 4's matching rule.
 *
 * The `Set` is a COMPUTATION-LOCAL comparison aid and never leaves this function.
 * `CLAUDE.md` §Serializability forbids a `Set` reaching the document; it says nothing
 * about one living for the length of a membership test, which is all this is.
 *
 * A duplicated id inside an entry fails the size check rather than counting twice, so a
 * hand-edited `['a', 'a', 'b']` cannot pass itself off as a three-player block.
 *
 * EXPORTED, and this is the one copy (IN-01). `reduce.namesTiedBlock` and
 * `TiebreakOrderer` ask the same question of the same ids, and the third copy had dropped
 * the size check above — so `['a', 'a', 'b']` and `['a', 'b', 'b']` compared equal on the
 * one surface that lets a host reorder a block by hand. Set equality over player ids is
 * core's question rather than a component's, and a predicate whose safety property holds
 * at two of its three call sites is worse than no property at all.
 */
export function isSameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;

  const members = new Set(a);
  if (members.size !== a.length) return false;

  return b.every((id) => members.has(id));
}

/**
 * The host's ordering for exactly this block, or `null` — link 4.
 *
 * ## Why matching is by SET EQUALITY, and why that is the whole safety property
 *
 * An override is the host putting a block the tool refused to order into an order by hand
 * (D-13). The danger is a STALE one: the host orders `{A, B, C}` for third, someone then
 * corrects a result, and the block becomes `{A, B}` — an ordering the host gave for a
 * different question is now sitting on a different table.
 *
 * Set equality answers that with no extra machinery. `{A, B, C}` is not `{A, B}`, so the
 * override simply stops matching and the block is unresolved again. **The override
 * self-invalidates**, which is why `tournament/resultsVoided` deliberately does NOT list
 * `tournament/tiebreakOrdered` among its cascade targets: voiding it explicitly would be a
 * SECOND mechanism for one fact, and two mechanisms for one fact disagree eventually.
 * 05-08's void arm carries this same sentence from the other side.
 *
 * A subset and a superset are both rejected for the same reason — neither is the set of
 * players who are actually tied, so neither is an answer to the question being asked.
 *
 * ## Why the override names players rather than assigning seed numbers
 *
 * D-13's own reason: typed seed numbers invite collisions and gaps — two players given
 * `3`, or a table that jumps `2, 4` — and the host would be re-entering them after every
 * correction. A numbered override could not self-invalidate at ALL, because a number
 * carries no record of which players it was chosen for. Naming the players IS the
 * invalidation mechanism.
 *
 * Highest `seq` wins, not last-in-array: `tiebreakOrders` is append-ordered by the fold,
 * but `seq` is the log's own ordering and is the one that means "more recent".
 */
function hostOrderFor(
  orders: readonly { playerIds: string[]; seq: number }[],
  block: readonly string[],
): string[] | null {
  let latest: { playerIds: string[]; seq: number } | null = null;

  for (const entry of orders) {
    if (!isSameSet(entry.playerIds, block)) continue;
    if (latest === null || entry.seq > latest.seq) latest = entry;
  }

  // Fresh, so a caller cannot reorder the fold's own array through the returned rows.
  return latest === null ? null : [...latest.playerIds];
}

/**
 * What the automatic chain does with a block it has not yet resolved — links 3 and 4.
 *
 * Link 3's rule is **"the block is size 2"**, not "the record group is size 2", and the
 * difference is testable. At tier 3, three players tied on record whose metric splits them
 * into `{A}` and `{B, C}` reach head-to-head legitimately for `{B, C}`: that block has
 * narrowed to two, so head-to-head is a total order over it, whatever the block it came
 * from looked like.
 *
 * Link 4 catches everything link 3 could not: a block of three or more, and also a block
 * of exactly two whose head-to-head result has been voided away. Both are "still tied
 * after the automatic chain", which is the only condition the override cares about.
 */
function refineTiedBlock(
  results: readonly MatchResult[],
  orders: readonly { playerIds: string[]; seq: number }[],
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

  const ordered = hostOrderFor(orders, block);
  if (ordered !== null) {
    // Resolved, so `tied: false` — the block renumbers 1…n rather than sharing a place.
    return [{ members: ordered, decidedBy: 'hostOrder', tied: false }];
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

      groups.push(...refineTiedBlock(results, state.tiebreakOrders, block));
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

/**
 * One card in the bracket. Derived from the cut's seeds and the recorded results;
 * stored nowhere, on {@link RoundRobinMatch}'s precedent.
 *
 * `upperId` and `lowerId` are `null` for two DIFFERENT reasons, and the pair
 * `isBye` tells them apart:
 *
 *   `isBye: false`  the feeder match has no recorded result yet, so the slot renders
 *                   `Winner of {roundLabel} {n}` and the card is inert.
 *   `isBye: true`   the opponent is a phantom — a seed number past the cut — so there
 *                   is nobody to play and nothing to record.
 *
 * A bye always carries its player on `upperId`, because the recursion pairs seed `s`
 * with `B+1-s` and `s` is always the smaller of the two, so a phantom can only ever
 * land in the lower slot.
 */
export interface BracketMatch {
  /** `br:{round}:{slot}`, both 1-based. */
  matchId: string;
  /** `null` = not known yet, or a phantom (a bye's missing opponent). */
  upperId: string | null;
  lowerId: string | null;
  isBye: boolean;
  /** `Final` | `Semi-final` | `Quarter-final` | `Round of {n}` — by matches-in-round. */
  roundLabel: string;
}

/**
 * The whole bracket, every value in it a fact about the cut and the results.
 *
 * `final` is the same object as `rounds[rounds.length - 1][0]` rather than a copy, so
 * a caller comparing them by identity gets the answer it expects.
 */
export interface Bracket {
  rounds: readonly (readonly BracketMatch[])[];
  final: BracketMatch;
  /** Non-null only once the final is recorded. */
  championId: string | null;
}

/**
 * The bracket size `B` — the next power of two at or above `n`.
 *
 * The one place the padding is computed, so {@link byeCountForCut} and
 * {@link selectBracket} cannot round differently.
 */
function bracketSize(n: number): number {
  let size = 1;
  while (size < n) size *= 2;
  return size;
}

/**
 * The classic single-elimination seed order, built by doubling.
 *
 * `order(1) = [1]`; each doubling maps every `s` to `[s, 2B+1-s]`. Pair adjacent
 * entries and round one is done. The property that matters is the one that makes this
 * a SEEDED bracket rather than a shuffled one: seeds 1 and 2 can only meet in the
 * final, 1 and 3 only in the semi, and so on down.
 *
 * Executed by `05-RESEARCH.md` §Seeded Single Elimination on 2026-08-26:
 *
 *   `seedOrder(8)`  = 1, 8, 4, 5, 2, 7, 3, 6
 *   `seedOrder(16)` = 1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11
 *
 * Within every pair the first entry is the smaller seed, because each doubling pushes
 * `s` before `n + 1 - s` and `s` never exceeds `n / 2`. That is what puts a phantom in
 * the lower slot without a branch deciding it.
 */
function seedOrder(size: number): number[] {
  let order = [1];

  while (order.length < size) {
    const n = order.length * 2;
    const next: number[] = [];
    for (const s of order) next.push(s, n + 1 - s);
    order = next;
  }

  return order;
}

/**
 * How many byes a cut of `n` produces — and the ONE place that number is computed.
 *
 * It exists so the cut preview line (`Top {n} advance. Seeds 1 to {b} get a bye.`) and
 * the bracket cannot disagree about how many byes a size produces. A host who reads
 * "seeds 1 to 3 get a bye" and then counts four bye cards has been lied to by one of
 * the two, and nothing on screen would say which.
 *
 * `B - n`, so a power-of-two cut takes none: 8 → 0, 7 → 1, 6 → 2, 5 → 3, 4 → 0.
 *
 * `0` below two seeds, where there is no bracket to put a bye in — see
 * {@link selectBracket}'s own null.
 */
export function byeCountForCut(n: number): number {
  if (n < 2) return 0;
  return bracketSize(n) - n;
}

/**
 * The label for a round, decided by HOW MANY MATCHES ARE IN IT and never by the round
 * index.
 *
 * RESEARCH's reason, which is the whole reason this is not `rounds[i]` arithmetic: at
 * `B = 8` round 1 *is* the quarter-final, and at `B = 16` round 1 is the round of 16.
 * An index-based label would call both of them "round 1" and neither of them what the
 * room calls it.
 *
 *   1 match  → `Final`
 *   2        → `Semi-final`
 *   4        → `Quarter-final`
 *   m >= 8   → `Round of {2m}`
 */
function roundLabelFor(matchesInRound: number): string {
  if (matchesInRound <= 1) return 'Final';
  if (matchesInRound === 2) return 'Semi-final';
  if (matchesInRound === 4) return 'Quarter-final';
  return `Round of ${matchesInRound * 2}`;
}

/**
 * The result that currently stands for one match id, highest `seq` winning.
 *
 * The same "later beats earlier" rule {@link standingRoundRobinResults} applies to the
 * round robin (D-09), asked one match at a time because the bracket walks by id rather
 * than by pair set. `null` when nothing has been recorded.
 */
function liveResultFor(
  results: readonly MatchResult[],
  matchId: string,
): MatchResult | null {
  let live: MatchResult | null = null;

  for (const result of results) {
    if (result.matchId !== matchId) continue;
    if (live === null || result.seq > live.seq) live = result;
  }

  return live;
}

/**
 * Who comes out of a match, or `null` while nobody does.
 *
 * A BYE is answered first and without consulting the results at all: there is no game,
 * so the seeded player advances on the strength of the seeding. That ordering also
 * means a hand-edited document carrying a result for a bye's id cannot promote the
 * phantom.
 */
function winnerOf(match: BracketMatch, results: readonly MatchResult[]): string | null {
  if (match.isBye) return match.upperId ?? match.lowerId;

  const result = liveResultFor(results, match.matchId);
  return result === null ? null : result.winnerId;
}

/**
 * The bracket — TOUR-03. `null` until a cut is taken.
 *
 * ## D-07 needs NO CODE OF ITS OWN, and that is the finding rather than a shortcut
 *
 * Pad the seed list to `B`, the next power of two at or above `N`, and treat a seed
 * number past `N` as a phantom. Seed `s` faces seed `B+1-s`, so a phantom opponent
 * means `B+1-s > N`, i.e. `s <= B-N` — **the top `B-N` seeds, which is exactly "byes go
 * to the top seeds, seed 1 first"**. No branch, no sort, no special case: the recursion
 * IS the bye rule. Any hand-written loop placing byes beside this would be a second
 * authority on the same fact, free to disagree with the first after a later edit.
 *
 * Executed at 5, 6 and 7 seeds — the three counts ROADMAP success criterion 1 names —
 * this gives 3, 2 and 1 byes, and 4, 5 and 6 real matches. The invariant worth holding
 * onto is that real matches (byes excluded) always number `N - 1`.
 *
 * ## Nothing here is stored
 *
 * Participants, advancement, the champion and the round labels are all recomputed from
 * `state.cut.seeds` and `state.matchResults` on every call. `05-RESEARCH.md`
 * §Anti-Patterns names a STORED bracket as precisely the mutable-state design D-10 and
 * D-11 exist to avoid: a stored bracket would have to be walked and patched after every
 * correction, and a patch that missed a card would leave the document disagreeing with
 * itself with nothing to recompute the truth from.
 *
 * ## Rounds are not collapsed
 *
 * Three rounds render at 5 seeds even though round 1 holds a single real match.
 * Collapsing would put seeds 2 and 3 in a "quarter-final" against each other on one
 * screen and a "semi-final" on another for the same game, which is worse than a sparse
 * first round.
 *
 * `null` below two seeds as well as with no cut: one player is not a bracket, there is
 * no final for {@link Bracket.final} to name, and a phantom final would report a
 * champion nobody played for.
 *
 * The bracket and every match in it are FRESH on every call.
 */
export function selectBracket(state: DraftState): Bracket | null {
  if (state.cut === null) return null;

  const seeds = state.cut.seeds;
  const n = seeds.length;
  if (n < 2) return null;

  const order = seedOrder(bracketSize(n));
  const rounds: BracketMatch[][] = [];

  const firstRound: BracketMatch[] = [];
  for (let i = 0; i < order.length; i += 2) {
    const upperSeed = order[i];
    const lowerSeed = order[i + 1];
    if (upperSeed === undefined || lowerSeed === undefined) continue;

    // A seed number past `n` is a PHANTOM: its slot is a bye, not an empty match.
    const upperIsPhantom = upperSeed > n;
    const lowerIsPhantom = lowerSeed > n;

    firstRound.push({
      matchId: `br:1:${firstRound.length + 1}`,
      upperId: upperIsPhantom ? null : (seeds[upperSeed - 1] ?? null),
      lowerId: lowerIsPhantom ? null : (seeds[lowerSeed - 1] ?? null),
      // Exactly one phantom. Two would mean `B >= 2n`, which the next power of two at
      // or above `n` is never.
      isBye: upperIsPhantom !== lowerIsPhantom,
      roundLabel: roundLabelFor(order.length / 2),
    });
  }
  rounds.push(firstRound);

  // Later rounds. `br:r:s` feeds `br:(r+1):ceil(s/2)`, and SLOT PARITY decides which
  // half of the parent card the winner lands in: ODD `s` is the upper slot, even `s`
  // the lower. Read from the parent, feeder `2s-1` is the upper and `2s` the lower —
  // which is the one place a transposition would stay invisible until a real bracket
  // ran, because it swaps two names that are both legitimately in the match.
  for (let roundNumber = 2; ; roundNumber++) {
    const previous = rounds[rounds.length - 1];
    if (previous === undefined || previous.length <= 1) break;

    const matchesInRound = previous.length / 2;
    const roundLabel = roundLabelFor(matchesInRound);
    const round: BracketMatch[] = [];

    for (let slot = 1; slot <= matchesInRound; slot++) {
      const upperFeeder = previous[slot * 2 - 2];
      const lowerFeeder = previous[slot * 2 - 1];

      round.push({
        matchId: `br:${roundNumber}:${slot}`,
        upperId: upperFeeder === undefined ? null : winnerOf(upperFeeder, state.matchResults),
        lowerId: lowerFeeder === undefined ? null : winnerOf(lowerFeeder, state.matchResults),
        // Never a bye past round 1: a bye's seed has already advanced, so both slots
        // here are either a real winner or a name that is not known yet.
        isBye: false,
        roundLabel,
      });
    }

    rounds.push(round);
  }

  const final = rounds[rounds.length - 1]?.[0];
  if (final === undefined) return null;

  return { rounds, final, championId: winnerOf(final, state.matchResults) };
}

/**
 * Whether the tournament is finished and therefore read-only — D-17.
 *
 * A final with a recorded result and no reopen after it. That is the whole definition:
 * a SECOND FOLD over the same document, computed on demand like everything else here.
 *
 * ## Why this is not a fourth {@link TournamentStage} member
 *
 * D-18 keeps the bracket on screen when this fires. A finished tournament is still
 * showing its bracket — with the champion named and every result control inert — so
 * being read-only is a PROPERTY of a tournament that is still in the `bracket` stage
 * rather than a stage of its own. Making it a stage member would force
 * {@link selectTournamentStage} to choose between naming the surface and naming the
 * state, and the surface is what that function exists to answer.
 *
 * ## Why a fold rather than a stored flag, which is the part worth the words
 *
 * Four properties, none of which a `finished: true` field would have:
 *
 *   It survives reload.        The document is the only input, so a refresh recomputes
 *                              the same answer rather than restoring a cached one.
 *   It travels with the JSON.  An exported file carries the final result, so it opens
 *                              locked on another machine with nothing extra to persist.
 *   Two tabs cannot disagree.  Both fold the same log, so neither can hold a flag the
 *                              other never saw set.
 *   It cannot be claimed.      An imported document cannot declare itself unlocked
 *                              while carrying a recorded final, and cannot declare
 *                              itself locked without one (T-05-25). There is no field
 *                              to forge, because the answer is not stored anywhere.
 *
 * ## Undo needs no inverse here
 *
 * `undo.ts`'s module header — "the entire implementation is remove the action and fold
 * again" — means undoing a reopen restores `lastReopenSeq` to whatever the remaining
 * log implies, and this function simply answers differently on the next call. There is
 * nothing to reverse, because there was nothing to set.
 *
 * `state.lastReopenSeq` starts at `-1`, which is below every allocatable `seq`
 * including `0`, so a tournament that has never been reopened locks on its final
 * without a special case.
 */
export function selectTournamentLocked(state: DraftState): boolean {
  const bracket = selectBracket(state);
  if (bracket === null) return false;

  const result = liveResultFor(state.matchResults, bracket.final.matchId);
  if (result === null) return false;

  return result.seq > state.lastReopenSeq;
}

/**
 * Whether a cut of the top `n` would seed a block nobody has ordered — Pitfall 4.
 *
 * ## The failure this prevents
 *
 * The round robin completes. Seeds 3, 4 and 5 are still tied, the automatic chain has
 * run out of links, and no host override names them. The host cuts to the top 4.
 * Whoever the bracket puts at seed 4 is arbitrary — it is whichever of the three the
 * fold happened to list first — and the room will notice, because the standings table
 * on the same screen reads `3 3 3` beside a bracket that just picked one of them.
 *
 * **Completeness does not imply resolution.** `05-UI-SPEC.md` §8 gates the cut on
 * completeness alone (`{k} matches are still to play. Record them all before you
 * cut.`), and a complete round robin can be tied. This is the second condition, and it
 * is about resolution.
 *
 * The warning sign that it has been got wrong is specific: a bracket whose seeds 3 and
 * 4 swap between two folds of the same document (T-05-26).
 *
 * ## Any unresolved row INSIDE the cut, not only one the line splits
 *
 * The narrower reading — the two rows straddling the line share a position — misses the
 * case one step further in, and it is the same failure. At six players cut to five, a
 * p3/p4/p5 block sits wholly inside the cut: nothing is split, so the narrow gate passes,
 * and then `selectSeeding` hands the bracket the standings order, which inside a tied
 * block is `config.players` order. `bracketSize(5) = 8` and `seedOrder(8) =
 * [1,8,4,5,2,7,3,6]`, so seed 3 draws a BYE into the semi-final while seeds 4 and 5 play
 * each other. Which of the three tied players gets a free round is then decided by their
 * position in the config screen's player list.
 *
 * So the question is resolution inside the cut, not the geometry of the line. A tied row
 * BELOW the cut is outside it and answers `false`: it orders nobody the bracket seeds.
 *
 * `n === rows.length` — the whole field advances — is inside this rule rather than exempt
 * from it. There is no row below to split against, but byes are still handed out by seed
 * order, so an unresolved block is exactly as arbitrary there as anywhere else.
 *
 * ## `'hostOrder'` is a resolution, and that is why this reads `decidedBy`
 *
 * A hand-ordered block IS in an order — the host put it in one (D-13) — so a cut
 * through it is fine and this returns `false`. Reading only `position` could not tell
 * the two apart, because a resolved block renumbers `3 4 5` while an unresolved one
 * shares `3 3 3`; reading `decidedBy` states the distinction rather than inferring it
 * from a numbering that a later change to {@link selectStandings} could alter.
 *
 * ## Two consumers, and they must agree
 *
 * 05-11 renders `Take the cut` inert with the sentence
 *
 *     The cut at {n} splits a tie. Order the tied players yourself before you take it.
 *
 * and 05-08's `canApply` refuses `tournament/cutTaken` with `cutSplitsTiedBlock`. That
 * is `reduce.ts:592-600`'s stated model — constraint upstream of the click, enforced
 * twice, so the reducer arm is a backstop rather than the mechanism. If it ever fires
 * for a real host, the two have disagreed and the inert control is the bug.
 *
 * An incomplete round robin answers `false`. Incompleteness has §8's own separate
 * reason, and a control carrying two reasons at once would be the tool arguing with
 * itself about which problem the host should fix first.
 */
export function selectCutSplitsTiedBlock(state: DraftState, n: number): boolean {
  // The tie question only. Incompleteness is §8's reason, not this one.
  if (selectRemainingMatchCount(state) > 0) return false;

  const rows = selectStandings(state);
  // `n === rows.length` is in range: the whole field still gets a seed order, and byes
  // come out of it, so an unresolved block there is as arbitrary as one at the line.
  if (n < 1 || n > rows.length) return false;

  // Any unresolved row with a seat inside the cut, whether or not the line cuts its
  // block. Seed order inside the cut decides the byes, so an unordered block is as
  // arbitrary at seeds 3-4-5 as it is at the boundary. A `'hostOrder'` row is resolved
  // and never matches, which is the same rule the narrower reading stated by exception.
  for (let i = 0; i < n; i++) {
    const row = rows[i];
    if (row !== undefined && row.decidedBy === 'tied') return true;
  }

  return false;
}

/**
 * What a correction takes with it — the numbers `05-UI-SPEC.md` §5's button reads.
 *
 * `targetSeqs` is what `tournament/resultsVoided` carries; `matchCount` is the `{n}`
 * the label interpolates; `voidsCut` chooses between the two labels. All three come
 * out of ONE call, which is what stops the number the host read from disagreeing with
 * the seqs the action names (T-05-28).
 */
export interface VoidCascade {
  /** Log seqs to void. Empty means nothing downstream is affected. */
  targetSeqs: readonly number[];
  /** How many MATCH results are in `targetSeqs` — the `{n}` the button interpolates. */
  matchCount: number;
  /** True when the cut itself is voided — the `Record and void the bracket` label. */
  voidsCut: boolean;
}

/**
 * The shape of a bracket match id, beside {@link ROUND_ROBIN_MATCH_ID} and for the
 * same reason: one place per shape, and no `g` flag, because a module-level global
 * regex carries `lastIndex` between calls and would answer alternately for one string.
 */
const BRACKET_MATCH_ID = /^br:\d+:\d+$/;

/** Nothing downstream is affected. Fresh, so no caller shares one instance. */
function emptyCascade(): VoidCascade {
  return { targetSeqs: [], matchCount: 0, voidsCut: false };
}

/**
 * Every recorded `seq` for one match id.
 *
 * ALL of them rather than only the live one, so that voiding a correction cannot
 * resurface the entry it replaced. `DraftState.matchResults` promises one entry per
 * pairing, which makes this an identity today; it is written this way so it stays
 * right if that ever stops being true.
 */
function seqsFor(results: readonly MatchResult[], matchId: string): number[] {
  const seqs: number[] = [];
  for (const result of results) {
    if (result.matchId === matchId) seqs.push(result.seq);
  }
  return seqs;
}

/**
 * Where a bracket match sits, or `null` when the bracket has no such id.
 *
 * Located by SEARCHING the derived bracket rather than by parsing the id, so
 * `br:9:9` — a shape-valid id naming a slot no bracket of this size has — is answered
 * rather than walked from.
 */
function locateBracketMatch(
  bracket: Bracket,
  matchId: string,
): { roundIndex: number; slot: number; match: BracketMatch } | null {
  for (let roundIndex = 0; roundIndex < bracket.rounds.length; roundIndex++) {
    const round = bracket.rounds[roundIndex];
    if (round === undefined) continue;

    for (let i = 0; i < round.length; i++) {
      const match = round[i];
      if (match !== undefined && match.matchId === matchId) {
        return { roundIndex, slot: i + 1, match };
      }
    }
  }

  return null;
}

/**
 * How many later results a correction to `matchId` would void, and which ones — TOUR-09.
 *
 * ## Why this is a SELECTOR and not something the reducer discovers
 *
 * `05-UI-SPEC.md` §5 relabels the primary button BEFORE the dispatch:
 * `Record and void {n} matches`, or `Record and void the bracket`. The host reads the
 * damage and then decides. A reducer side effect could not supply that number, because
 * the number has to exist while the host is still deciding whether to cause it — which
 * is the entire reason this function lives in this file rather than in `reduce.ts`
 * (D-10).
 *
 * 05-08 dispatches the exact `targetSeqs` this returns, so the count the host read and
 * the entries the action names are one computation rather than two that agree by
 * inspection.
 *
 * ## Why an explicit clear, and not "ignore results whose participants no longer match"
 *
 * D-10's case, stated because the simplification looks obviously better until it is
 * played out: correct a semi-final, record a new final, then correct the semi-final
 * BACK. A purely derived fold would find the original final's participants matching
 * again and **resurrect it** — an outcome nothing on screen predicted and nobody
 * asked for. The void REMOVES it from the fold; re-recording is a fresh act by a host
 * who meant it (T-05-27).
 *
 * ## D-11 is unconditional, and that is deliberate rather than an over-reach
 *
 * Any round-robin correction after the cut voids the cut and every bracket result,
 * *whether or not the winner changed*. It looks like too much until the reason is
 * stated: at tier 3 a metric-only change reorders the standings, the standings order
 * IS the seeding order ({@link selectSeeding}), and so the bracket the room played was
 * seeded from a table that no longer holds.
 *
 * ## `tournament/tiebreakOrdered` is deliberately NOT a target
 *
 * A host ordering matches its block by SET EQUALITY ({@link hostOrderFor}), so a
 * correction that changes the block's membership makes the override stop matching on
 * its own. Voiding it here as well would be a SECOND mechanism for one fact, and two
 * mechanisms for one fact disagree eventually. 05-03 carries this sentence from the
 * other side.
 *
 * ## Targets are `seq`, never an index
 *
 * `seq` uniformly names a match result, the cut, or both, and `CLAUDE.md` §Conventions
 * makes it explicit that `seq` is allocated `max(seq) + 1` and **may legally have
 * gaps**. Nothing here assumes contiguity or substitutes an array index for a `seq`,
 * because an index would address a different entry the moment the log had a hole in it
 * (T-05-30).
 *
 * The walk is bounded: `br:r:s` feeds `br:(r+1):ceil(s/2)`, the round number strictly
 * increases, and it stops at the final — at most `log2(B) - r` steps, which is 4 at the
 * 16-seed maximum. An unknown id returns an empty cascade rather than looping (T-05-29).
 */
export function selectVoidCascade(
  state: DraftState,
  matchId: string,
  nextWinnerId: string,
): VoidCascade {
  if (ROUND_ROBIN_MATCH_ID.test(matchId)) {
    // A shape-valid id naming a pairing this player list does not have, which
    // `selectRemainingMatchCount` already declines to count.
    const known = selectRoundRobinMatches(state).some((match) => match.matchId === matchId);
    if (!known) return emptyCascade();

    if (state.cut === null) return emptyCascade();

    // D-11, unconditional on `nextWinnerId`: see the doc block. Every bracket result
    // goes, and the cut with them.
    const matchSeqs: number[] = [];
    for (const result of state.matchResults) {
      if (BRACKET_MATCH_ID.test(result.matchId)) matchSeqs.push(result.seq);
    }

    return {
      targetSeqs: [state.cut.seq, ...matchSeqs],
      // The cut is not a match, so its `seq` is a target without being counted.
      matchCount: matchSeqs.length,
      voidsCut: true,
    };
  }

  if (!BRACKET_MATCH_ID.test(matchId)) return emptyCascade();

  const bracket = selectBracket(state);
  if (bracket === null) return emptyCascade();

  const located = locateBracketMatch(bracket, matchId);
  if (located === null) return emptyCascade();

  // A bye is not played and carries no result, so there is nothing to correct and
  // nothing downstream that a correction to it could invalidate.
  if (located.match.isBye) return emptyCascade();

  const current = liveResultFor(state.matchResults, matchId);
  // Same winner, so a games or metric correction cannot change who is in the next
  // match and nothing downstream is affected. With NO current result this is not a
  // correction at all, and the walk below finds nothing in a well-formed document.
  if (current !== null && current.winnerId === nextWinnerId) return emptyCascade();

  const targetSeqs: number[] = [];
  let slot = located.slot;

  for (let roundIndex = located.roundIndex + 1; roundIndex < bracket.rounds.length; roundIndex++) {
    // `br:r:s` feeds `br:(r+1):ceil(s/2)`.
    slot = Math.ceil(slot / 2);

    const round = bracket.rounds[roundIndex];
    const match = round?.[slot - 1];
    if (match === undefined) break;

    // An unrecorded match on the path contributes nothing and DOES NOT stop the walk:
    // a later match can be recorded while an earlier one is not, and stopping here
    // would tell the host a correction was free when it takes the final with it.
    targetSeqs.push(...seqsFor(state.matchResults, match.matchId));
  }

  return { targetSeqs, matchCount: targetSeqs.length, voidsCut: false };
}
