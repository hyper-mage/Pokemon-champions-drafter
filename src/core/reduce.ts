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
  CARDS_PLAYED,
  DRAFT_PICK_MADE,
  DRAFT_PICK_UNDONE,
  DRAFT_STARTED,
  isCardsPlayedAction,
  isDraftStartedAction,
  isOrderResolvedAction,
  isPickMadeAction,
  isPickUndoneAction,
  isPoolBuiltAction,
  isScheduleCompiledAction,
  isSwapMadeAction,
  ORDER_RESOLVED,
  POOL_BUILT,
  SCHEDULE_COMPILED,
  SWAP_MADE,
  type AnyAction,
} from './actions';
import { initialState, type DraftState, type TournamentDoc } from './model';
import {
  selectAvailablePool,
  selectCardsPlayedThisRound,
  selectCardTurn,
  selectCurrentRound,
  selectCurrentTurn,
  selectHand,
  selectIsComplete,
  selectPhase,
  selectPlayableCards,
  selectResolvedOrder,
  selectSwapsRemaining,
} from './selectors';

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
  | 'noSwapsLeft';

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

    default:
      // Forward compatibility. An action type this build has never heard of is not an
      // error; it is a newer client's business.
      return state;
  }
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
      // After the pool, because a schedule is only meaningful against one, and before the
      // draft, because `DRAFT_STARTED` below now requires it.
      if (state.poolIds.length === 0) return reject('poolNotBuilt');
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
      if (state.poolIds.length === 0) return reject('poolNotBuilt');
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

      // D-25: a mid-draft swap is spent BY the player on the clock, and the turn still
      // ends with that round's pick. `selectCurrentTurn` is null during the card phase and
      // once every team is full, and both of those are correctly out of turn for a
      // `swapRound: 0` spend.
      //
      // A dedicated swap round (`swapRound >= 1`) runs when the picks are complete and the
      // pick clock is therefore null, so 03-11 widens THIS check — the swap-round clock is
      // a different selector — rather than adding a second `canApply` arm beside it.
      const turn = selectCurrentTurn(state);
      if (turn === null || action.playerId !== turn.playerId) return reject('notYourTurn');

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
