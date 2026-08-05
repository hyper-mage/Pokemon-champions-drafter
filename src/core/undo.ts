/**
 * undo.ts — SHEL-06 / D-10. Unlimited undo, back to draft start, no redo.
 *
 * The entire implementation is "remove the action and fold again". That is not a
 * shortcut; it is the property plan 01-06 established and asserted rather than claimed:
 * `tests/core/reduce.test.ts` checks at every cut point of a complete draft that folding
 * a log prefix equals the state immediately before the removed action was applied. Undo
 * inherits that proof instead of inventing a second mechanism beside it.
 *
 * Consequences worth stating, because each one is a piece of machinery this file does
 * NOT contain:
 *
 *   No inverse patches.   Re-folding a few hundred actions is sub-millisecond, so the
 *                         cost of depth is zero and unlimited undo is free (D-10).
 *   No snapshot stack.    A snapshot would be a second copy of the truth, and the two
 *                         could disagree.
 *   No redo.              Popped actions would have to live outside the log — a second
 *                         piece of state deliberately kept out of the persisted
 *                         document, which is the one thing the architecture forbids.
 *
 * `draft/pickUndone` still exists in `actions.ts` and is still reducible, and that is
 * deliberate: the compensating action is what a sync layer transports (sync rule 15).
 * Removing the entry locally is the local-only optimization the equivalence licenses,
 * and the day sync arrives, `undo` dispatches the compensating action instead while
 * every assertion in `tests/core/undo.test.ts` keeps its meaning.
 *
 * Pure, like everything under `src/core`: no clock, no randomness, no storage, no DOM.
 * The document handed in is never mutated.
 */

import { isPickMadeAction, type PickMadeAction } from './actions';
import type { TournamentDoc } from './model';

/**
 * Index of the most recent `draft/pickMade` in the log, or `-1` when there is none.
 *
 * Written as "the last pick" rather than "the last entry" on purpose. In Phase 1 the
 * two are always the same — a pick is the only thing that follows a pick — but Phase 2
 * interleaves priority-card plays, bans and swaps into the same log, and a `pop()`
 * would then remove one of those instead, silently and with the undo button still
 * reading `Undo last pick`.
 *
 * `isPickMadeAction` rather than a bare `type` comparison, because an imported or
 * hand-edited log is untrusted input (plan 01-10 folds one). A pick-shaped entry with
 * no `monId` folds to nothing, so offering to undo it would remove an action and change
 * nothing on screen.
 */
function lastPickIndex(doc: TournamentDoc): number {
  for (let index = doc.log.length - 1; index >= 0; index--) {
    const action = doc.log[index];
    if (action !== undefined && isPickMadeAction(action)) return index;
  }
  return -1;
}

/**
 * The pick that `undoLast` would remove, or `null` when there is nothing to undo.
 *
 * Exposed because the live-region announcement names both the round and the species —
 * `Undid Round {r} — {species} is back in the pool.` — and reading them off the action
 * that is about to be dropped is the only way to say them without re-deriving anything.
 */
export function lastPickAction(doc: TournamentDoc): PickMadeAction | null {
  const index = lastPickIndex(doc);
  if (index === -1) return null;
  return doc.log[index] as PickMadeAction;
}

/**
 * Whether the draft has a pick to unwind.
 *
 * False for an empty log and false for a log holding only `pool/built` and
 * `draft/started` — which is the state the board boots into, and exactly when the
 * `Undo last pick` button must render disabled.
 */
export function canUndo(doc: TournamentDoc): boolean {
  return lastPickIndex(doc) !== -1;
}

/**
 * The document with its most recent pick removed.
 *
 * Returns the input unchanged when there is nothing to undo, so the caller never has to
 * ask twice. Undo unwinds the draft; it does not un-create the tournament, so
 * `pool/built` and `draft/started` are never candidates.
 *
 * A fresh document object with a fresh log array comes back, never a mutation of the
 * input — the store, the autosave and the JSON export all hold references to documents
 * across a dispatch, and every one of them depends on those references continuing to
 * describe what they described.
 */
export function undoLast(doc: TournamentDoc): TournamentDoc {
  const index = lastPickIndex(doc);
  if (index === -1) return doc;

  const log = [...doc.log];
  log.splice(index, 1);

  return { ...doc, log };
}
