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

import type { DraftState } from './model';
import { selectIsTournamentComplete } from './selectors';

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
