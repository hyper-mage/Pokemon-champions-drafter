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
  DRAFT_PICK_MADE,
  DRAFT_PICK_UNDONE,
  DRAFT_STARTED,
  isDraftStartedAction,
  isPickMadeAction,
  isPickUndoneAction,
  isPoolBuiltAction,
  POOL_BUILT,
  type AnyAction,
} from './actions';
import { initialState, type DraftState, type TournamentDoc } from './model';
import { selectAvailablePool, selectCurrentTurn, selectIsComplete } from './selectors';

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
  | 'emptyPool'
  | 'duplicatePoolIds'
  | 'draftAlreadyStarted'
  | 'draftNotStarted'
  | 'unknownPlayer'
  | 'draftComplete'
  | 'notYourTurn'
  | 'wrongSlot'
  | 'notInPool'
  | 'nothingToUndo';

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

    case DRAFT_STARTED: {
      if (!isDraftStartedAction(action)) return reject('malformedPayload');
      if (state.poolIds.length === 0) return reject('poolNotBuilt');
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
