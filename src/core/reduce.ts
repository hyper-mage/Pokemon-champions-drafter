/**
 * reduce.ts — SHEL-05. The whole state architecture, in three functions.
 *
 *   apply(state, action)     total and pure. Advances the state by one action.
 *   canApply(state, action)  decides whether an action is legal. Executes nothing.
 *   fold(doc)                replays a whole log from the initial state.
 *
 * `apply` and `canApply` are two functions and never one, deliberately (sync rule 12).
 * A sync layer has to be able to re-validate an action after reordering it *without*
 * executing it, and the local case needs the same split: `dispatch` asks `canApply`
 * first and appends nothing when the answer is no, so a rejected action never reaches
 * the log at all (T-01-29).
 *
 * `apply` is total: it never throws for an expected failure and it returns the state
 * unchanged for anything it does not understand (sync rule 11). That is what lets a
 * document written by a newer build still fold on this one instead of crashing it. The
 * corollary is that `apply` is NOT a validator — folding a hand-edited log will happily
 * reproduce whatever that log says. Legality is `canApply`'s job, and it runs on the
 * dispatch path where the action is created.
 */

import {
  BANS_PLACED,
  BANS_REVEALED,
  BANS_SUBMITTED,
  CARDS_PLAYED,
  DRAFT_PICK_MADE,
  DRAFT_PICK_UNDONE,
  DRAFT_STARTED,
  isBansPlacedAction,
  isBansRevealedAction,
  isBansSubmittedAction,
  isCardsPlayedAction,
  isCutTakenAction,
  isDraftStartedAction,
  isMatchRecordedAction,
  isOrderResolvedAction,
  isPickMadeAction,
  isPickUndoneAction,
  isPoolBuiltAction,
  isReopenedAction,
  isResultsVoidedAction,
  isScheduleCompiledAction,
  isSwapMadeAction,
  isSwapPassedAction,
  isTiebreakOrderedAction,
  ORDER_RESOLVED,
  POOL_BUILT,
  SCHEDULE_COMPILED,
  SWAP_MADE,
  SWAP_PASSED,
  TOURNAMENT_CUT_TAKEN,
  TOURNAMENT_MATCH_RECORDED,
  TOURNAMENT_REOPENED,
  TOURNAMENT_RESULTS_VOIDED,
  TOURNAMENT_TIEBREAK_ORDERED,
  type AnyAction,
  type MatchRecordedAction,
} from './actions';
import {
  initialState,
  type DraftState,
  type MatchResult,
  type StageFormat,
  type TournamentDoc,
} from './model';
import {
  selectAvailablePool,
  selectBanTurn,
  selectCardsPlayedThisRound,
  selectCardTurn,
  selectCurrentRound,
  selectCurrentSwapRound,
  selectCurrentTurn,
  selectHand,
  selectIsComplete,
  selectPhase,
  selectPlayableCards,
  selectResolvedOrder,
  selectSwapRoundPosition,
  selectSwapsRemaining,
} from './selectors';
import {
  isSameSet,
  selectBracket,
  selectCutSplitsTiedBlock,
  selectRemainingMatchCount,
  selectRoundRobinMatches,
  selectStandings,
  selectTournamentLocked,
  selectTournamentStage,
  type BracketMatch,
} from './tournament';

/**
 * Why an action was refused. These strings are stable — plan 01-07's undo and plan
 * 01-10's import both branch on them, and a rejection reason is closer to an API than
 * to a log message.
 */
export type RejectionReason =
  | 'unknownAction'
  | 'malformedPayload'
  | 'poolAlreadyBuilt'
  | 'poolNotBuilt'
  | 'scheduleAlreadyCompiled'
  | 'scheduleNotCompiled'
  /** Wrong length for this document's round count, or indices not contiguous from 1. */
  | 'malformedSchedule'
  | 'emptyPool'
  | 'duplicatePoolIds'
  | 'draftAlreadyStarted'
  | 'draftNotStarted'
  | 'unknownPlayer'
  | 'draftComplete'
  | 'notYourTurn'
  | 'wrongSlot'
  | 'notInPool'
  | 'nothingToUndo'
  /** That player has already played this card value in an earlier round (CARD-06). */
  | 'cardAlreadySpent'
  /**
   * The value is already down this round, or playing it would leave a later player in the
   * round with no legal card — CARD-04, D-21.
   *
   * The BACKSTOP behind an offer that already excludes the value, never the mechanism.
   * `selectPlayableCards` decides what the card panel renders as playable, so a host
   * cannot click their way here; this arm refuses an action that arrived some other way.
   * A rejection reaching a user means the offer and the rule disagree.
   */
  | 'cardNotPlayable'
  /** The round's pick order is already recorded, so nothing about it can still change. */
  | 'roundAlreadyResolved'
  /** Not every player has put a card down yet, so there is nothing to resolve. */
  | 'roundNotComplete'
  /**
   * A pick was attempted while the round's cards are still on the table (D-17).
   *
   * Before this existed the null turn fell through to `draftComplete`, which does not
   * merely under-describe the state — it names the opposite end of the draft.
   */
  | 'cardsNotResolved'
  /**
   * The named slot is empty, or it does not hold the species the swap says it does.
   *
   * ONE reason for both, deliberately. They are the same failure from the host's side —
   * the action describes a slot this document does not have — and splitting them would
   * report the difference between "you have not picked there yet" and "somebody edited
   * the file", which is not a distinction anyone can act on differently.
   */
  | 'nothingToSwap'
  /** That player has spent their whole `config.swapBudget`, or never had one (SWAP-01). */
  | 'noSwapsLeft'
  /**
   * No dedicated swap round is running that this action could belong to — SWAP-03.
   *
   * ONE reason for three situations, on `nothingToSwap`'s precedent: the picks are not
   * complete, the number is outside `1..config.swapRounds`, or an earlier swap round has
   * not finished. From the host's side they are the same failure — the action names a swap
   * round this tournament is not in — and no host could act differently on the difference.
   */
  | 'notSwapRound'
  /** Every player has already moved in that swap round, so its clock is spent. */
  | 'swapRoundComplete'
  /**
   * There is no ban stage this action could belong to — BAN-03, BAN-04.
   *
   * ONE reason for three situations, on `nothingToSwap`'s precedent: the document is
   * `hostBanlist` and has no player ban stage at all, the action belongs to the OTHER
   * mode's stage (a `bans/placed` in a blind tournament, a `bans/submitted` in a snake
   * one), or the reveal has already landed and the stage is over. From the host's side
   * they are one failure — the action names a stage this tournament is not in — and no
   * host could act differently on the difference.
   */
  | 'banStageNotRunning'
  /**
   * That player is not the serpentine clock's answer, or every allotment is spent.
   *
   * The empty clock is refused as out of turn rather than given its own reason, which is
   * exactly what `canApply(CARDS_PLAYED)` does with a `selectCardTurn` of `undefined`.
   */
  | 'notYourBanTurn'
  /** That player already submitted a blind allotment, and a submission is one act (D-05). */
  | 'alreadySubmitted'
  /**
   * The allotment is not `config.bansPerPlayer` ids long.
   *
   * NOT collapsed into `duplicateBanIds` below, and the test for that is the one
   * `nothingToSwap` states: would the host-facing copy be identical? It would not. "You
   * chose three bans; this tournament gives each player two" and "you chose the same
   * Pokémon twice" name different mistakes with different fixes, and a host can act
   * differently on the difference.
   */
  | 'wrongBanCount'
  /** One player named the same species twice — mirrors `duplicatePoolIds`. */
  | 'duplicateBanIds'
  /**
   * That species is already banned in the open — snake only, D-20.
   *
   * `notInPool` is deliberately NOT borrowed for this. The ban stage runs BEFORE the pool
   * exists, so a reason naming the pool would make a future reader believe there is one.
   */
  | 'banAlreadyPlaced'
  /** Not every player has submitted yet, so there is nothing complete to reveal. */
  | 'bansNotComplete'
  /** The reveal is already recorded, so nothing about it can still change — mirrors `poolAlreadyBuilt`. */
  | 'bansAlreadyRevealed'
  /**
   * There is no tournament for this action to belong to — D-01.
   *
   * ONE reason for three situations, on `nothingToSwap`'s precedent: the document is
   * `draftOnly` and generates no tournament at all, the picks are not finished, or a swap
   * round is still outstanding. From the host's side they are the same failure — the action
   * names a stage this tournament is not in — and no host could act differently on it.
   */
  | 'tournamentNotRunning'
  /**
   * The final is recorded and nothing has reopened it since — D-17.
   *
   * The BACKSTOP, not the rule. `05-UI-SPEC.md` §10 renders every result control inert
   * with the same stated reason while `selectTournamentLocked` holds, so a host cannot
   * click their way here. If this ever fires for a real host, the inert control and this
   * arm have disagreed, and the control is the bug.
   */
  | 'tournamentLocked'
  /** The match id names neither a current round-robin pairing nor a slot of this bracket. */
  | 'unknownMatch'
  /**
   * The slot exists but has nothing to record: a bye, or a card whose feeders have not
   * been played. NOT collapsed into `unknownMatch`, because the two name different
   * mistakes — "that match is not in this tournament" and "that match has not happened
   * yet" — and a host can act differently on the difference.
   */
  | 'matchNotPlayable'
  /** The winner and loser are not the two players this match is between. */
  | 'wrongMatchParticipants'
  /**
   * Every field equals the result already recorded, so this action would change nothing.
   *
   * Not tidiness. `undo.ts` states the failure it prevents: an action that changes nothing
   * on screen is an UNDO STEP THAT APPEARS TO DO NOTHING — the host presses `Undo last
   * move`, an entry comes off the log, and the board is identical. `05-UI-SPEC.md` §5
   * already makes the button inert for this case; this is the second layer, and the two
   * together are also what keep the live-region announcement out of `LiveRegion`'s
   * byte-identical hole.
   */
  | 'resultUnchanged'
  /** `bo1` was given two games, or `bo3` was given one — read per stage, D-08. */
  | 'gamesNotForFormat'
  /** A non-zero metric below `draftBracketsAndLog`, where nothing reads one (D-01, D-02). */
  | 'metricNotForDepth'
  /** A cut is already recorded, so nothing about the seeding can still change — mirrors `poolAlreadyBuilt`. */
  | 'cutAlreadyTaken'
  /** Fewer than two advance, or more than the tournament has players. */
  | 'cutSizeOutOfRange'
  /** Round-robin matches are still to play, so the standings the cut seeds from are partial. */
  | 'roundRobinNotComplete'
  /**
   * The cut line falls inside a block the chain could not order — Pitfall 4.
   *
   * The BACKSTOP again, and the reason carries no sentence with it: `05-UI-SPEC.md` §8's
   * copy lives in 05-11, where the control is rendered inert. A rejection reason is closer
   * to an API than to a log message, and putting the English here would be a second copy
   * of it, free to drift from the one the host actually reads.
   */
  | 'cutSplitsTiedBlock'
  /** Those players are not a block the standings currently leave tied — D-13. */
  | 'tiebreakBlockNotTied'
  /** The tournament is not locked, so there is nothing to reopen — D-17. */
  | 'notReopenable'
  /** No named `seq` matches a recorded result or the cut, so the void would clear nothing. */
  | 'nothingToVoid';

export type CanApplyResult = { ok: true } | { ok: false; reason: RejectionReason };

const OK: CanApplyResult = { ok: true };

function reject(reason: RejectionReason): CanApplyResult {
  return { ok: false, reason };
}

// ---------------------------------------------------------------------------
// apply
// ---------------------------------------------------------------------------

export function apply(state: DraftState, action: AnyAction): DraftState {
  switch (action.type) {
    case POOL_BUILT: {
      if (!isPoolBuiltAction(action)) return state;
      return {
        ...state,
        poolIds: [...action.ids],
        rosterVersion: action.rosterVersion,
        rosterChecksum: action.checksum,
      };
    }

    case SCHEDULE_COMPILED: {
      if (!isScheduleCompiledAction(action)) return state;
      // Element by element, so the folded state never shares an array with the log entry
      // it was folded from — the same rule `copyConfig` states, for the same reason.
      return {
        ...state,
        schedule: action.rounds.map((spec) => ({ index: spec.index, kind: spec.kind })),
      };
    }

    case DRAFT_STARTED: {
      if (!isDraftStartedAction(action)) return state;
      return { ...state, order: [...action.order] };
    }

    case DRAFT_PICK_MADE: {
      if (!isPickMadeAction(action)) return state;
      return {
        ...state,
        picks: [
          ...state.picks,
          {
            playerId: action.playerId,
            monId: action.monId,
            round: action.round,
            pickIndex: action.pickIndex,
            seq: action.seq,
          },
        ],
      };
    }

    case DRAFT_PICK_UNDONE: {
      if (!isPickUndoneAction(action)) return state;
      // The compensating action drops the pick recorded by the targeted action.
      //
      // A note on ARCHITECTURE's phrasing, which describes this as "rebuilding from
      // the log prefix": `apply` receives one action and no log — `fold` is
      // `log.reduce(apply, ...)`, so the log is structurally out of reach here, and
      // must be. Removing the targeted pick is equivalent to re-folding the log with
      // that action deleted, because picks accumulate independently of one another and
      // each carries its own round and slot rather than deriving them from position.
      // `tests/core/reduce.test.ts` asserts that equivalence directly rather than
      // leaving it as a claim.
      const remaining = state.picks.filter((pick) => pick.seq !== action.targetSeq);
      if (remaining.length === state.picks.length) return state;
      return { ...state, picks: remaining };
    }

    case CARDS_PLAYED: {
      if (!isCardsPlayedAction(action)) return state;
      // `seq` comes off the ENVELOPE, never off the array's length. It is what a
      // compensating action targets and what the tiebreak orders on, and the log may
      // legally have gaps in it.
      return {
        ...state,
        cardsPlayed: [
          ...state.cardsPlayed,
          {
            playerId: action.playerId,
            value: action.value,
            round: action.round,
            seq: action.seq,
          },
        ],
      };
    }

    case ORDER_RESOLVED: {
      if (!isOrderResolvedAction(action)) return state;
      // Appends, and deliberately does not replace an existing entry for the same round.
      // `apply` is not a validator: a duplicate is `canApply`'s to refuse on origination,
      // and `selectResolvedOrder` answers with the FIRST match, so a hand-edited file
      // cannot rewrite a round the room already played by appending a second opinion.
      //
      // Element by element, so the folded state never shares an array with the log entry.
      return {
        ...state,
        resolvedOrders: [
          ...state.resolvedOrders,
          { round: action.round, order: [...action.order] },
        ],
      };
    }

    case SWAP_MADE: {
      if (!isSwapMadeAction(action)) return state;

      // ---------------------------------------------------------------------
      // THIS ARM REPLACES A PICK. IT DOES NOT APPEND ONE.
      //
      // The analog in this file is `DRAFT_PICK_UNDONE` above — filter and rebuild — and
      // NOT `DRAFT_PICK_MADE`, which is the obvious neighbour and the wrong one. Both
      // halves of the argument matter, and both fail SILENTLY on the board, because
      // `selectTeams` assigns last-write-wins into `slots[round - 1]` and would render the
      // right team under either implementation:
      //
      //   D-26 needs replacement. `selectAvailablePool` subtracts every `picks[].monId`,
      //   so an appended second pick would leave `outMonId` in the taken set and the
      //   swapped-out Pokémon would never come back to the pool for anyone.
      //
      //   D-25 needs replacement. `selectPickCount` is `picks.length` and drives
      //   `selectCurrentTurn`'s `pickIndex`, so an append would advance the turn — the
      //   swap would eat the pick it is supposed to leave untouched, and the team would
      //   finish one short of `config.rounds`.
      //
      // The replaced entry keeps its ORIGINAL `seq`: it is still the same slot-filling
      // event, and `draft/pickUndone` targets that identity.
      // ---------------------------------------------------------------------
      let replaced = false;
      const picks = state.picks.map((pick) => {
        // First match only. A log carrying two picks for one slot is already malformed;
        // rewriting both would turn one swap into two and strand an id in the pool.
        if (replaced) return pick;
        if (pick.playerId !== action.playerId) return pick;
        if (pick.round !== action.round) return pick;
        // Self-describing, so a disagreeing log cannot swap the wrong slot (T-03-38).
        if (pick.monId !== action.outMonId) return pick;

        replaced = true;
        return {
          playerId: pick.playerId,
          monId: action.inMonId,
          round: pick.round,
          pickIndex: pick.pickIndex,
          seq: pick.seq,
        };
      });

      // No match is a NO-OP in every respect, including the budget. Recording a swap that
      // changed nothing would spend an allowance for an event that did not happen.
      if (!replaced) return state;

      return {
        ...state,
        picks,
        swaps: [
          ...state.swaps,
          {
            playerId: action.playerId,
            round: action.round,
            outMonId: action.outMonId,
            inMonId: action.inMonId,
            swapRound: action.swapRound,
            // Off the ENVELOPE, never off the array's length — the log may legally have gaps.
            seq: action.seq,
          },
        ],
      };
    }

    case SWAP_PASSED: {
      if (!isSwapPassedAction(action)) return state;

      // An append and nothing else. A pass changes no slot, returns nothing to the pool and
      // spends no budget — its entire effect is to exist, so that the swap round's clock can
      // count it and step past the player who chose nothing (SWAP-07).
      //
      // No no-op branch, because there is no fact about the state a pass could disagree
      // with. A `swap/passed` naming a round this document does not have is inert rather
      // than wrong: `swapRoundMoveCount` only counts rounds `1..config.swapRounds`, and
      // `apply` is not a validator.
      return {
        ...state,
        passes: [
          ...state.passes,
          {
            playerId: action.playerId,
            swapRound: action.swapRound,
            // Off the ENVELOPE, for `swap/made`'s reason directly above.
            seq: action.seq,
          },
        ],
      };
    }

    case BANS_PLACED: {
      if (!isBansPlacedAction(action)) return state;

      // `pass` is CARRIED, never re-derived from `banPlacements.length`. An undo that
      // removes a ban ahead of this one must not move it into a different board column.
      return {
        ...state,
        banPlacements: [
          ...state.banPlacements,
          {
            playerId: action.playerId,
            monId: action.monId,
            pass: action.pass,
            // Off the ENVELOPE, never off the array's length — the log may legally have gaps.
            seq: action.seq,
          },
        ],
      };
    }

    case BANS_SUBMITTED: {
      if (!isBansSubmittedAction(action)) return state;

      // Appends, and deliberately does not replace an existing entry for the same player.
      // `apply` is not a validator: a second submission is `canApply`'s `alreadySubmitted`
      // to refuse on origination, and the selectors answer with the FIRST match, so a
      // hand-edited file cannot rewrite what a player sealed by appending a second opinion.
      //
      // `monIds` element by element, so the folded state never shares an array with the
      // log entry it was folded from.
      return {
        ...state,
        banSubmissions: [
          ...state.banSubmissions,
          {
            playerId: action.playerId,
            monIds: action.monIds.map((id) => id),
            // Off the ENVELOPE, for the reason directly above.
            seq: action.seq,
          },
        ],
      };
    }

    case BANS_REVEALED: {
      if (!isBansRevealedAction(action)) return state;

      // FIRST reveal wins, exactly as `selectResolvedOrder` answers with the first
      // matching round. A hand-edited or imported log must not be able to rewrite the
      // reveal the room already watched by appending a second one — `canApply` refuses it
      // on origination, and this makes the fold agree.
      if (state.bansRevealed !== null) return state;

      // Freshly built records, and both levels: the outer array and every `monIds`.
      return {
        ...state,
        bansRevealed: action.bans.map((ban) => ({
          playerId: ban.playerId,
          monIds: ban.monIds.map((id) => id),
        })),
      };
    }

    case TOURNAMENT_MATCH_RECORDED: {
      if (!isMatchRecordedAction(action)) return state;

      // ---------------------------------------------------------------------
      // THIS ARM REPLACES A RESULT. IT DOES NOT APPEND ONE.
      //
      // D-09, IN AS MANY WORDS: LATER BEATS EARLIER. A correction is a second entry for
      // the same `matchId`, and the analog in this file is `DRAFT_PICK_UNDONE` above —
      // FILTER AND REBUILD — not `DRAFT_PICK_MADE`, which is the obvious neighbour and
      // the wrong one.
      //
      // Appending would leave two entries for one match, and every reader — the results
      // grid, the standings chain, the bracket's `winnerOf`, the void cascade — would
      // have to re-derive which of them counts. That is a second authority on one result,
      // which is precisely what an append-only log is supposed to make impossible. Four
      // readers deriving it four times is four chances for two screens to disagree about
      // who won a game the room watched.
      //
      // The superseded entry is STILL IN `doc.log`. That is where 05-14's recap reads the
      // correction history from, and it is why the fold deliberately does not keep it: the
      // fold answers "what stands", the log answers "what happened", and collapsing the
      // two would cost one of the answers.
      // ---------------------------------------------------------------------
      const others = state.matchResults.filter((result) => result.matchId !== action.matchId);

      return {
        ...state,
        matchResults: [
          ...others,
          {
            matchId: action.matchId,
            winnerId: action.winnerId,
            loserId: action.loserId,
            winnerGames: action.winnerGames,
            loserGames: action.loserGames,
            metric: action.metric,
            // The NEW action's seq, off the ENVELOPE. Carrying the superseded entry's
            // would make a correction impossible to void or undo by name, because the
            // number every compensating action targets would address an entry the log
            // has already replaced.
            seq: action.seq,
          },
        ],
      };
    }

    case TOURNAMENT_RESULTS_VOIDED: {
      if (!isResultsVoidedAction(action)) return state;

      // `PickUndone`'s idiom, widened to a list: filter by `seq`, and return the state
      // unchanged when nothing matched.
      //
      // WHY AN EXPLICIT CLEAR, and not "ignore results whose participants no longer
      // match" — D-10, written out because the simplification looks obviously better
      // until it is played out. Correct a semi-final, record a new final, then correct
      // the semi-final BACK: a purely derived fold finds the original final's
      // participants matching again and RESURRECTS it, an outcome nothing on screen
      // predicted and nobody asked for. The void REMOVES it; re-recording is a fresh act
      // by a host who meant it.
      //
      // WHAT IS NOT VOIDED: `tournament/tiebreakOrdered`, whatever `targetSeqs` contains.
      // A host ordering matches its block by SET EQUALITY, so a correction that changes
      // the block's membership makes the override stop matching on its own. Voiding it
      // here as well would be a SECOND mechanism for one fact, and two mechanisms for one
      // fact disagree eventually. `selectVoidCascade` carries this sentence from the
      // other side and never puts an override's `seq` in `targetSeqs`.
      const voided = action.targetSeqs;
      const matchResults = state.matchResults.filter((result) => !voided.includes(result.seq));
      const cutVoided = state.cut !== null && voided.includes(state.cut.seq);

      // A no-op in every respect, so nothing downstream sees a new state object for an
      // event that changed nothing — the posture `swap/made`'s unmatched branch takes.
      if (matchResults.length === state.matchResults.length && !cutVoided) return state;

      return { ...state, matchResults, cut: cutVoided ? null : state.cut };
    }

    case TOURNAMENT_CUT_TAKEN: {
      if (!isCutTakenAction(action)) return state;

      // Element by element, so the folded state never shares an array with the log entry
      // it was folded from — `copyConfig`'s rule, and `schedule/compiled`'s arm above.
      //
      // `seq` off the ENVELOPE: it is what D-11's cascade names when a round-robin
      // correction voids the cut, and the log may legally have gaps.
      return { ...state, cut: { seeds: action.seeds.map((id) => id), seq: action.seq } };
    }

    case TOURNAMENT_TIEBREAK_ORDERED: {
      if (!isTiebreakOrderedAction(action)) return state;

      // APPENDS, and deliberately does not replace an earlier entry naming the same set.
      // 05-03's chain reads the HIGHEST `seq` per set, so a second ordering already wins
      // without anything being removed — and removing the first would make undoing the
      // second restore nothing instead of restoring the order it superseded.
      return {
        ...state,
        tiebreakOrders: [
          ...state.tiebreakOrders,
          // Off the ENVELOPE, for the reason directly above: the chain orders on it.
          { playerIds: action.playerIds.map((id) => id), seq: action.seq },
        ],
      };
    }

    case TOURNAMENT_REOPENED: {
      if (!isReopenedAction(action)) return state;

      // The whole effect, and it is a `seq` rather than a flag: `selectTournamentLocked`
      // asks whether the final's result is NEWER than this number. Off the envelope,
      // which is the only place it could come from — `lastReopenSeq` starts at `-1`
      // precisely because `0` is a legal `seq` belonging to a real first action.
      return { ...state, lastReopenSeq: action.seq };
    }

    default:
      // Forward compatibility. An action type this build has never heard of is not an
      // error; it is a newer client's business.
      return state;
  }
}

// ---------------------------------------------------------------------------
// Tournament helpers for canApply
//
// Every one of these SEARCHES a derived answer rather than re-deriving it.
// `selectRoundRobinMatches` and `selectBracket` own the pair set and the bracket shape;
// this file asks them questions and never computes a second opinion (T-05-26).
// ---------------------------------------------------------------------------

/** The recorded result that currently stands for a match, or `null`. Highest `seq` wins. */
function liveResult(state: DraftState, matchId: string): MatchResult | null {
  let live: MatchResult | null = null;
  for (const result of state.matchResults) {
    if (result.matchId !== matchId) continue;
    if (live === null || result.seq > live.seq) live = result;
  }
  return live;
}

/** Where a match id sits in the derived bracket, or `null` when this bracket has no such slot. */
function bracketSlot(state: DraftState, matchId: string): BracketMatch | null {
  const bracket = selectBracket(state);
  if (bracket === null) return null;

  for (const round of bracket.rounds) {
    for (const match of round) {
      if (match.matchId === matchId) return match;
    }
  }
  return null;
}

/**
 * Whether these players are exactly one block the standings currently leave TIED.
 *
 * Read off `decidedBy` rather than off `position`, for the reason
 * `selectCutSplitsTiedBlock` states: a resolved block renumbers while an unresolved one
 * shares a place, so the numbering alone cannot tell a host-ordered block from a tied one.
 *
 * A block the host has ALREADY ordered answers `false`, and that is deliberate rather than
 * an oversight: `05-UI-SPEC.md` §7 renders the override only for a block that is still
 * tied, so there is no control that could originate a second ordering. Changing one's mind
 * is `Undo last move` (D-12), which is the one stack every other correction uses.
 */
function namesTiedBlock(state: DraftState, playerIds: readonly string[]): boolean {
  const blocks = new Map<number, string[]>();

  for (const row of selectStandings(state)) {
    if (row.decidedBy !== 'tied') continue;
    const members = blocks.get(row.position) ?? [];
    members.push(row.playerId);
    blocks.set(row.position, members);
  }

  for (const members of blocks.values()) {
    if (isSameSet(members, playerIds)) return true;
  }
  return false;
}

/**
 * Which stage format governs a match id, or `null` when the id is neither shape.
 *
 * The prefix decides, because D-08 sets Bo3 PER STAGE and the two fields are separate for
 * exactly that reason — Bo1 through the pool, Bo3 in the top cut is how real events run.
 */
function formatFor(state: DraftState, matchId: string): StageFormat | null {
  if (matchId.startsWith('rr:')) return state.config.roundRobinFormat;
  if (matchId.startsWith('br:')) return state.config.bracketFormat;
  return null;
}

/**
 * The two players a match is between, or a rejection naming why it has none.
 *
 * Round robin: the pair set answers, so a shape-valid id naming a pairing this player list
 * does not have is `unknownMatch` rather than a match with two undefined participants.
 *
 * Bracket: the DERIVED bracket answers. A slot no bracket of this size holds is
 * `unknownMatch`; a bye or a card whose feeders are unplayed is `matchNotPlayable`, which
 * is a different mistake with a different fix.
 */
function participantsOf(
  state: DraftState,
  matchId: string,
): { ok: true; a: string; b: string } | { ok: false; reason: RejectionReason } {
  if (matchId.startsWith('rr:')) {
    const match = selectRoundRobinMatches(state).find((entry) => entry.matchId === matchId);
    if (match === undefined) return { ok: false, reason: 'unknownMatch' };
    return { ok: true, a: match.aId, b: match.bId };
  }

  if (!matchId.startsWith('br:')) return { ok: false, reason: 'unknownMatch' };

  const slot = bracketSlot(state, matchId);
  if (slot === null) return { ok: false, reason: 'unknownMatch' };

  // A bye is not played and carries no result; an unfed card does not know who is in it.
  if (slot.isBye || slot.upperId === null || slot.lowerId === null) {
    return { ok: false, reason: 'matchNotPlayable' };
  }

  return { ok: true, a: slot.upperId, b: slot.lowerId };
}

/** Whether a re-record would change nothing at all — every field, not just the winner. */
function isUnchangedResult(current: MatchResult | null, action: MatchRecordedAction): boolean {
  if (current === null) return false;
  return (
    current.winnerId === action.winnerId &&
    current.loserId === action.loserId &&
    current.winnerGames === action.winnerGames &&
    current.loserGames === action.loserGames &&
    current.metric === action.metric
  );
}

// ---------------------------------------------------------------------------
// canApply
// ---------------------------------------------------------------------------

export function canApply(state: DraftState, action: AnyAction): CanApplyResult {
  switch (action.type) {
    case POOL_BUILT: {
      if (!isPoolBuiltAction(action)) return reject('malformedPayload');
      if (state.poolIds.length > 0) return reject('poolAlreadyBuilt');
      if (action.ids.length === 0) return reject('emptyPool');
      if (new Set(action.ids).size !== action.ids.length) return reject('duplicatePoolIds');
      return OK;
    }

    case SCHEDULE_COMPILED: {
      if (!isScheduleCompiledAction(action)) return reject('malformedPayload');

      // The pool precedes the schedule only in host-banlist mode (D-01, D-11). Blind and
      // snake compile the schedule and resolve the ORDER first, so the ban stage can read
      // DRFT-16's starting order, and draw the pool after the reveal (D-23) — which is
      // what makes one randomizer the source of turn order for bans and picks alike.
      //
      // CONDITIONED rather than deleted, and that is the whole of D-01's zero-regression
      // posture: for `hostBanlist` this is byte-for-byte the rule Phase 3 verified.
      if (state.config.banMode === 'hostBanlist' && state.poolIds.length === 0) {
        return reject('poolNotBuilt');
      }

      if (state.schedule.length > 0) return reject('scheduleAlreadyCompiled');
      if (state.order.length > 0) return reject('draftAlreadyStarted');

      // Length against THIS document's round count — the one schedule question `canApply`
      // is the right place for. Contiguity is deliberately NOT rechecked here:
      // `isScheduleCompiledAction` already pins `rounds[i].index === i + 1`, so a
      // non-contiguous schedule is refused as `malformedPayload` two lines above and never
      // reaches this point. Repeating the check would be unreachable code that reads like a
      // second authority. The split is the same one the whole file runs on — the structural
      // guard types an action in ISOLATION, which is why it cannot ask this question, and
      // `canApply` sees the state, which is why it can.
      if (action.rounds.length !== state.config.rounds) return reject('malformedSchedule');
      return OK;
    }

    case DRAFT_STARTED: {
      if (!isDraftStartedAction(action)) return reject('malformedPayload');

      // Conditioned on the mode for the reason `SCHEDULE_COMPILED` above states, and this
      // is the arm D-11 is actually about: the ban stage needs `state.order` before there
      // is a pool, because the serpentine reads it.
      if (state.config.banMode === 'hostBanlist' && state.poolIds.length === 0) {
        return reject('poolNotBuilt');
      }

      // Origination is guarded; replay deliberately is not. `fold` does not run `canApply`
      // (see the bottom of this file), so a migrated schema-2 document — whose log has no
      // `schedule/compiled` in it, because `migrateV2ToV3` performs no log surgery — still
      // opens. What this refuses is a NEW draft with no schedule, which is the only case
      // this build can create and therefore the only one worth refusing.
      if (state.schedule.length === 0) return reject('scheduleNotCompiled');
      if (state.order.length > 0) return reject('draftAlreadyStarted');

      const known = new Set(state.config.players.map((player) => player.id));
      if (action.order.length !== known.size) return reject('unknownPlayer');
      if (new Set(action.order).size !== action.order.length) return reject('unknownPlayer');
      if (!action.order.every((playerId) => known.has(playerId))) return reject('unknownPlayer');
      return OK;
    }

    case DRAFT_PICK_MADE: {
      if (!isPickMadeAction(action)) return reject('malformedPayload');
      if (state.order.length === 0) return reject('draftNotStarted');
      if (selectIsComplete(state)) return reject('draftComplete');

      // AFTER the completion check and BEFORE the null turn, which is the whole of the
      // ordering: the end of the draft keeps its own reason, and the card phase — the
      // other state that yields a null turn — no longer borrows it. This makes a pick
      // during bidding impossible through every path rather than merely unreachable
      // through the UI (T-03-32).
      if (selectPhase(state) === 'cards') return reject('cardsNotResolved');

      const turn = selectCurrentTurn(state);
      if (turn === null) return reject('draftComplete');
      if (action.playerId !== turn.playerId) return reject('notYourTurn');
      // The store stamps round and pickIndex from the current turn, so a mismatch can
      // only arrive from an edited or imported log — which is exactly the path that
      // must not be able to write a pick into a slot that is not on the clock.
      if (action.round !== turn.round || action.pickIndex !== turn.pickIndex) {
        return reject('wrongSlot');
      }
      if (!selectAvailablePool(state).includes(action.monId)) return reject('notInPool');
      return OK;
    }

    case DRAFT_PICK_UNDONE: {
      if (!isPickUndoneAction(action)) return reject('malformedPayload');
      if (!state.picks.some((pick) => pick.seq === action.targetSeq)) {
        return reject('nothingToUndo');
      }
      return OK;
    }

    case CARDS_PLAYED: {
      if (!isCardsPlayedAction(action)) return reject('malformedPayload');
      // The RANGE, which the structural guard could not ask about: it types an action in
      // isolation and cannot see `config.rounds`. A value outside the deal is not an
      // illegal move, it is a payload this build never writes.
      if (action.value < 1 || action.value > state.config.rounds) {
        return reject('malformedPayload');
      }
      if (state.order.length === 0) return reject('draftNotStarted');

      // The card clock, which is `selectCardTurn`'s answer rather than this file's. It used
      // to be worked out here, and here only, which left the card panel choosing between
      // importing from the reducer and deriving the rotation a second time — a second copy
      // of "who is on the clock" being a second thing that can disagree with the log.
      //
      // `undefined` when every player has already played, which still fails the comparison
      // below: the empty clock is refused as out of turn, exactly as before.
      const round = selectCurrentRound(state);
      const onTheClock = selectCardTurn(state)?.playerId;
      if (action.playerId !== onTheClock) return reject('notYourTurn');

      // Stamped at the edge from `selectCurrentRound`, so a mismatch can only arrive from
      // an edited or imported log — the same argument `draft/pickMade` makes above.
      if (action.round !== round) return reject('wrongSlot');

      if (!selectHand(state, action.playerId).includes(action.value)) {
        return reject('cardAlreadySpent');
      }

      // Reachable only from a document whose round resolved while somebody still held a
      // card, which `fold` reproduces faithfully because it runs no `canApply` at all.
      if (selectResolvedOrder(state, action.round) !== null) {
        return reject('roundAlreadyResolved');
      }

      // D-21's offer constraint — the CARD-04 deadlock check. Last, because the three
      // checks above name a more specific problem with the same action and a host reading
      // "this would strand someone" about a card they never held would be misled.
      //
      // This is the BACKSTOP, not the rule. `selectPlayableCards` is the same answer,
      // consulted by the card panel before a click is possible, and the value the panel
      // renders inert is exactly the value this refuses. Enforced twice on purpose
      // (T-03-37) — and if this ever fires for a real host, the two have disagreed.
      if (!selectPlayableCards(state, action.playerId).includes(action.value)) {
        return reject('cardNotPlayable');
      }

      return OK;
    }

    case ORDER_RESOLVED: {
      if (!isOrderResolvedAction(action)) return reject('malformedPayload');
      if (state.order.length === 0) return reject('draftNotStarted');

      const played = new Set(
        selectCardsPlayedThisRound(state, action.round).map((play) => play.playerId),
      );
      if (!state.order.every((playerId) => played.has(playerId))) {
        return reject('roundNotComplete');
      }

      if (selectResolvedOrder(state, action.round) !== null) {
        return reject('roundAlreadyResolved');
      }
      return OK;
    }

    case SWAP_MADE: {
      if (!isSwapMadeAction(action)) return reject('malformedPayload');
      if (state.order.length === 0) return reject('draftNotStarted');

      // WHOSE TURN IT IS, asked of whichever clock the WINDOW names — D-25, D-29.
      //
      // A mid-draft swap and a swap-round swap are the SAME action in two windows, and
      // `swapRound` is what names the window. So this is one widened check rather than a
      // second arm: the budget, the slot predicate, the pool accounting and the replacement
      // are all identical either way, and a second arm would have been four duplicated
      // rules kept in step by hand.
      //
      //   `swapRound: 0`   the pick clock. `selectCurrentTurn` is null during the card
      //                    phase and once every team is full, and both are correctly out of
      //                    turn for a mid-draft spend — the turn still ends with a pick.
      //   `swapRound >= 1` the swap-round clock. The picks are complete by then, so the
      //                    pick clock is null and reading it would refuse every legal move.
      const onTheClock =
        action.swapRound >= 1
          ? (selectSwapRoundPosition(state, action.swapRound)?.playerId ?? null)
          : (selectCurrentTurn(state)?.playerId ?? null);
      if (onTheClock === null || action.playerId !== onTheClock) return reject('notYourTurn');

      // A later swap round may not open while an earlier one is unfinished. Asked only of
      // the dedicated case, because `selectCurrentSwapRound` is null for the whole draft
      // and a mid-draft spend has no swap round to be out of sequence with.
      if (action.swapRound >= 1 && action.swapRound !== selectCurrentSwapRound(state)) {
        return reject('notSwapRound');
      }

      // BEFORE the pool and the budget. All three can be wrong at once, and a host told
      // "you have no swaps left" about a slot that was never theirs has been sent to the
      // wrong problem entirely.
      const target = state.picks.find(
        (pick) => pick.playerId === action.playerId && pick.round === action.round,
      );
      if (target === undefined || target.monId !== action.outMonId) {
        return reject('nothingToSwap');
      }

      if (!selectAvailablePool(state).includes(action.inMonId)) return reject('notInPool');

      // Derived from counted `swap/made` entries rather than from a stored figure, so a
      // document cannot claim an allowance it has already spent (T-03-41).
      if (selectSwapsRemaining(state, action.playerId) <= 0) return reject('noSwapsLeft');

      // WHAT THIS DELIBERATELY DOES NOT CHECK: whether `inMonId` satisfies the target
      // slot's predicate.
      //
      // It cannot, and the reason is structural rather than an omission. Round eligibility
      // is a fact about a roster ENTRY (`entry.megaFormes`); `DraftState` holds no roster
      // and must not, because the fold is a cache of the log; and D-07 declines to
      // materialize eligible id lists into the log, so there is nothing stored to read
      // either. This is exactly the position `draft/pickMade` is in.
      //
      // So the constraint is enforced by the OFFER instead: `selectSwapTargets` filters the
      // pool by the armed slot's own predicate BEFORE anything is clickable, which makes
      // SWAP-05 true by construction rather than by rejection (D-27). A hand-edited
      // document can still carry a violating swap; that is T-03-39, accepted and reported
      // by the non-blocking adoption notice, never repaired here.
      return OK;
    }

    case SWAP_PASSED: {
      if (!isSwapPassedAction(action)) return reject('malformedPayload');
      if (state.order.length === 0) return reject('draftNotStarted');

      // The two situations that mean "there is no such swap round to pass in", stated
      // before anything is asked about the player. A host told "it is not your turn" about
      // a round the tournament does not have has been sent to the wrong problem — the same
      // ordering argument `swap/made`'s `nothingToSwap` check makes above.
      if (!selectIsComplete(state)) return reject('notSwapRound');
      if (action.swapRound < 1 || action.swapRound > state.config.swapRounds) {
        return reject('notSwapRound');
      }

      // Null here means the round already holds a move from every player. That is a
      // DIFFERENT failure from "this round has not opened yet", which is why the sequence
      // check below is separate rather than folded into the null.
      const position = selectSwapRoundPosition(state, action.swapRound);
      if (position === null) return reject('swapRoundComplete');

      if (action.swapRound !== selectCurrentSwapRound(state)) return reject('notSwapRound');
      if (action.playerId !== position.playerId) return reject('notYourTurn');

      // WHAT THIS DELIBERATELY DOES NOT CHECK: the budget.
      //
      // A pass is not a spend (D-29), so a player with no swaps left may still pass — and
      // in fact must be able to, because passing is the only way their swap round ends.
      // Rejecting `noSwapsLeft` here would hang the round on the first player to run out.
      return OK;
    }

    // -----------------------------------------------------------------------
    // The ban stage — BAN-03, BAN-04.
    //
    // Every arm below is a BACKSTOP, and none of them should be reachable from the UI.
    // `selectCardOffer`'s doc block in `selectors.ts` is the governing pattern for this
    // whole phase: the constraint belongs upstream of the click, so the ban surfaces
    // render an illegal species or an out-of-turn control inert WITH A REASON rather than
    // letting it be clicked and refused. These arms refuse an action that arrived some
    // other way — from a hand-edited or imported document — and a test that reaches one is
    // testing that path, not the host's. If one ever fires for a real host, the offer and
    // the rule have disagreed and that is a bug in the offer.
    // -----------------------------------------------------------------------

    case BANS_PLACED: {
      if (!isBansPlacedAction(action)) return reject('malformedPayload');

      // A snake ban belongs to a snake stage that has not ended. `hostBanlist` has no
      // player ban stage at all, `blind` has a different one, and a landed reveal means
      // this one is over — one reason for all three, per the member's own doc block.
      if (state.config.banMode !== 'snake' || state.bansRevealed !== null) {
        return reject('banStageNotRunning');
      }
      if (state.order.length === 0) return reject('draftNotStarted');

      // `null` when every allotment is spent, which still fails the comparison below: the
      // empty clock is refused as out of turn, exactly as the card clock is.
      //
      // The serpentine is `selectBanTurn`'s and this arm only ASKS, for the reason
      // `canApply(CARDS_PLAYED)` asks `selectCardTurn`: a second copy of "who is on the
      // clock" is a second thing that can disagree with the log. 04-03 wrote the derivation
      // here as a private helper because `selectBanTurn` landed a wave later; 04-04 deleted
      // it and this import replaced it, so there is exactly one serpentine in the codebase.
      const turn = selectBanTurn(state);
      if (turn === null || action.playerId !== turn.playerId) return reject('notYourBanTurn');

      // `pass` is stamped at the edge from the serpentine, so a mismatch can only arrive
      // from an edited or imported log — the same argument `draft/pickMade` makes about
      // `round` and `pickIndex`. `apply` records `pass` verbatim, so an unguarded
      // mismatch would file the ban under a column the board renders in the wrong place.
      if (action.pass !== turn.pass) return reject('wrongSlot');

      // Already banned in the open — by the host up front, or by an earlier placement.
      // Both are the same fact from a player's side: the species is gone. This is D-20's
      // rule, and `selectPublicBanIds` is the surface-facing answer to the same question.
      if (state.config.bans.includes(action.monId)) return reject('banAlreadyPlaced');
      if (state.banPlacements.some((ban) => ban.monId === action.monId)) {
        return reject('banAlreadyPlaced');
      }

      // WHAT THIS DELIBERATELY DOES NOT CHECK: whether `monId` is a species at all.
      //
      // The ban stage runs BEFORE the pool is drawn, so there is no id list to test
      // membership against, and `DraftState` holds no roster and must not — the fold is a
      // cache of the log. This is the position `draft/pickMade` is in with slot
      // eligibility, and the answer is the same: the OFFER constrains it. The ban surface
      // filters the roster before anything is clickable.
      return OK;
    }

    case BANS_SUBMITTED: {
      if (!isBansSubmittedAction(action)) return reject('malformedPayload');

      if (state.config.banMode !== 'blind' || state.bansRevealed !== null) {
        return reject('banStageNotRunning');
      }
      if (state.order.length === 0) return reject('draftNotStarted');

      // The rotation, not `config.players`. A hand-edited document can carry an order
      // shorter than its player list, and the players who can actually submit are the ones
      // in the rotation — the same reading `selectCardOffer` takes of `state.order.length`.
      if (!state.order.includes(action.playerId)) return reject('unknownPlayer');

      // BEFORE the shape checks. A player told "you chose the wrong number of bans" about
      // an allotment they already sealed has been sent to the wrong problem entirely.
      if (state.banSubmissions.some((entry) => entry.playerId === action.playerId)) {
        return reject('alreadySubmitted');
      }

      // The COUNT, which the structural guard could not ask about: it types an action in
      // isolation and cannot see `config.bansPerPlayer`.
      if (action.monIds.length !== state.config.bansPerPlayer) return reject('wrongBanCount');

      // Within ONE submission only. Two players naming the same species is a COLLISION,
      // which is a legal outcome of a blind stage under D-19's `bothApply` and the reveal
      // screen's whole reason for showing attribution — refusing it here would make the
      // second player's sealed allotment unsubmittable for a reason they cannot see.
      if (new Set(action.monIds).size !== action.monIds.length) {
        return reject('duplicateBanIds');
      }

      return OK;
    }

    case BANS_REVEALED: {
      if (!isBansRevealedAction(action)) return reject('malformedPayload');

      if (state.config.banMode !== 'blind') return reject('banStageNotRunning');
      if (state.order.length === 0) return reject('draftNotStarted');

      // Already recorded, so nothing about it can still change — the shape
      // `poolAlreadyBuilt` takes, and stated BEFORE completeness for its reason: the more
      // specific problem with the same action goes first.
      if (state.bansRevealed !== null) return reject('bansAlreadyRevealed');

      const submitted = new Set(state.banSubmissions.map((entry) => entry.playerId));
      if (!state.order.every((playerId) => submitted.has(playerId))) {
        return reject('bansNotComplete');
      }

      // WHAT THIS DELIBERATELY DOES NOT CHECK: whether the payload's `bans` agree with the
      // submissions it is revealing.
      //
      // The reveal is a host act materialized into the log, not a computation over it
      // (ARCHITECTURE Pattern 5) — re-deriving it here to compare would be the second
      // authority the payload's own doc block exists to avoid. A hand-edited document can
      // carry a reveal that disagrees with its submissions; that is reported by the
      // non-blocking adoption notice, never repaired here.
      return OK;
    }

    case TOURNAMENT_MATCH_RECORDED: {
      if (!isMatchRecordedAction(action)) return reject('malformedPayload');

      /*
        THE ORDER OF THESE CHECKS IS THE DESIGN, exactly as `cards/played`'s is.

        STAGE first, then LOCKED, then the stage-specific questions — a tournament that is
        not running and a tournament that is finished are facts about the whole document,
        and reporting a match-shaped problem about either would name the wrong thing.

        `unknownMatch` BEFORE `matchNotPlayable`: "that match is not in this tournament"
        and "that match has not happened yet" are different mistakes, and the first is the
        more fundamental problem with the same action.

        `resultUnchanged` LAST among these. Every check above it names a more specific
        problem, and a genuine correction that also happened to be malformed would
        otherwise be reported as "you changed nothing" — which is the one message that
        would send a host looking in entirely the wrong place.
      */
      if (selectTournamentStage(state) === 'notRunning') return reject('tournamentNotRunning');

      // THE BACKSTOP, not the rule. `05-UI-SPEC.md` §10 renders every result control
      // inert while `selectTournamentLocked` holds, with the same stated reason.
      // Enforced twice on purpose — and if this fires for a real host, the two disagreed.
      if (selectTournamentLocked(state)) return reject('tournamentLocked');

      const participants = participantsOf(state, action.matchId);
      if (!participants.ok) return reject(participants.reason);

      const { a, b } = participants;
      const isPair =
        (action.winnerId === a && action.loserId === b) ||
        (action.winnerId === b && action.loserId === a);
      // `loserId` is CARRIED rather than derived precisely so this comparison can be made
      // at all for a bracket slot whose participants are themselves derived.
      if (!isPair) return reject('wrongMatchParticipants');

      // D-08's per-stage format, read from the field the id's prefix names. `formatFor`
      // cannot answer `null` here: `participantsOf` already refused every id that is
      // neither shape.
      const format = formatFor(state, action.matchId);
      const expectedWinnerGames = format === 'bo3' ? 2 : 1;
      if (action.winnerGames !== expectedWinnerGames) return reject('gamesNotForFormat');
      // Strictly fewer than the winner's, which is `0` at bo1 and `0` or `1` at bo3 —
      // one comparison rather than two tables that could drift apart.
      if (action.loserGames < 0 || action.loserGames >= action.winnerGames) {
        return reject('gamesNotForFormat');
      }

      // D-01, D-02: the metric is scored only at tier 3, and `0` is what every other tier
      // writes. A non-zero value below it would reach the standings sort and decide an
      // order on a number the host was never shown a field for.
      if (state.config.depth !== 'draftBracketsAndLog' && action.metric !== 0) {
        return reject('metricNotForDepth');
      }

      // THE BACKSTOP again — `05-UI-SPEC.md` §5 already makes the button inert for this.
      // `undo.ts`'s reason is why it is enforced twice: an action that changes nothing on
      // screen is an undo step that appears to do nothing.
      if (isUnchangedResult(liveResult(state, action.matchId), action)) {
        return reject('resultUnchanged');
      }

      return OK;
    }

    case TOURNAMENT_RESULTS_VOIDED: {
      if (!isResultsVoidedAction(action)) return reject('malformedPayload');

      if (selectTournamentStage(state) === 'notRunning') return reject('tournamentNotRunning');
      if (selectTournamentLocked(state)) return reject('tournamentLocked');

      // The nothing-to-target shape `draft/pickUndone` takes. `seq` names a match result,
      // the cut, or both, so both are asked — a void that named only the cut is legal.
      const targets = new Set(action.targetSeqs);
      const hitsResult = state.matchResults.some((result) => targets.has(result.seq));
      const hitsCut = state.cut !== null && targets.has(state.cut.seq);
      if (!hitsResult && !hitsCut) return reject('nothingToVoid');

      return OK;
    }

    case TOURNAMENT_CUT_TAKEN: {
      if (!isCutTakenAction(action)) return reject('malformedPayload');

      if (selectTournamentStage(state) === 'notRunning') return reject('tournamentNotRunning');
      if (selectTournamentLocked(state)) return reject('tournamentLocked');

      // Already recorded, so nothing about the seeding can still change — the shape
      // `poolAlreadyBuilt` takes, and stated first for its reason: the more specific
      // problem with the same action goes before the general ones.
      if (state.cut !== null) return reject('cutAlreadyTaken');

      // `05-UI-SPEC.md` §8's gate, asked of the selector that also feeds the `{k} of {n}`
      // count above the grid. One selector for both is what stops the grid and the cut
      // button from believing different things.
      if (selectRemainingMatchCount(state) > 0) return reject('roundRobinNotComplete');

      const size = action.seeds.length;
      if (size < 2 || size > state.config.players.length) return reject('cutSizeOutOfRange');

      // Pitfall 4, and THE BACKSTOP again: 05-11 renders `Take the cut` inert with the
      // sentence, and this arm carries only the code. The English lives at the surface
      // the host reads, so there is one copy of it rather than two that can drift.
      if (selectCutSplitsTiedBlock(state, size)) return reject('cutSplitsTiedBlock');

      // WHAT THIS DELIBERATELY DOES NOT CHECK: whether `seeds` agree with the standings.
      // The cut is a host act materialized into the log (ARCHITECTURE Pattern 5), and
      // re-deriving the seeding here to compare would be the second authority
      // `CutTakenPayload`'s own doc block exists to avoid — the same posture
      // `bans/revealed` takes one arm above.
      return OK;
    }

    case TOURNAMENT_TIEBREAK_ORDERED: {
      if (!isTiebreakOrderedAction(action)) return reject('malformedPayload');

      if (selectTournamentStage(state) === 'notRunning') return reject('tournamentNotRunning');
      if (selectTournamentLocked(state)) return reject('tournamentLocked');

      // A subset and a superset are both refused for one reason: neither is the set of
      // players who are actually tied, so neither is an answer to the question the
      // override asks. `selectStandings` matches an override by set equality, so an
      // ordering naming any other set would fold to a record nothing ever reads.
      if (!namesTiedBlock(state, action.playerIds)) return reject('tiebreakBlockNotTied');

      return OK;
    }

    case TOURNAMENT_REOPENED: {
      if (!isReopenedAction(action)) return reject('malformedPayload');

      if (selectTournamentStage(state) === 'notRunning') return reject('tournamentNotRunning');

      // THE ONE ACTION THAT IS LEGAL WHILE LOCKED, and illegal otherwise — D-17. The
      // asymmetry is the whole of the decision: correcting anything in a finished
      // tournament requires reopening it first, and that is the intended friction rather
      // than an obstacle to route around.
      if (!selectTournamentLocked(state)) return reject('notReopenable');

      return OK;
    }

    default:
      // `apply` tolerates the unknown so an imported document still folds; `canApply`
      // refuses it so this build never originates one.
      return reject('unknownAction');
  }
}

// ---------------------------------------------------------------------------
// fold
// ---------------------------------------------------------------------------

/**
 * Replay a whole document.
 *
 * This runs on every load and on every undo. A full eight-player tournament is a few
 * hundred actions and a re-fold is sub-millisecond, which is precisely why this project
 * needs no snapshotting, no inverse patches and no history stack — undo is "drop an
 * action and fold again", and that is the entire implementation.
 */
export function fold(doc: TournamentDoc): DraftState {
  return doc.log.reduce<DraftState>(apply, initialState(doc.config));
}
