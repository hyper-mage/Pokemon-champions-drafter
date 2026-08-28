/**
 * undo.ts — SHEL-06 / D-10 / D-20. Unlimited undo, back to draft start, no redo.
 *
 * ## ONE stack, spanning everything the draft does — D-20
 *
 * Picks, priority-card plays and automatic resolutions all live in the same log and all
 * come off the same stack, newest first. There is no per-surface undo and there must not
 * be one: two stacks would let a host undo a pick made after a card play and leave the
 * document in an order the room never played through.
 *
 * That is why the button reads `Undo last move` (Amendment 2). It is not a copy
 * preference — a control naming only picks, that then removes a priority card, is simply
 * wrong on a screen somebody is reading aloud to the table. `move` covers all of them;
 * `action` was rejected for leaking the log's vocabulary into copy the room reads.
 *
 * The one place the stack is not literally one-entry-at-a-time is a resolved pick order,
 * which comes off together with the card play that triggered it. `removalIndices` carries
 * the reason.
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

import {
  DRAFT_STARTED,
  POOL_BUILT,
  SCHEDULE_COMPILED,
  isBansPlacedAction,
  isBansRevealedAction,
  isBansSubmittedAction,
  isCardsPlayedAction,
  isCutTakenAction,
  isMatchRecordedAction,
  isOrderResolvedAction,
  isPickMadeAction,
  isReopenedAction,
  isResultsVoidedAction,
  isSwapMadeAction,
  isSwapPassedAction,
  isTiebreakOrderedAction,
  type Action,
  type CardsPlayedAction,
  type PickMadeAction,
} from './actions';
import type { DraftState, TournamentDoc } from './model';
import { selectCurrentRound } from './selectors';

/**
 * Index of the most recent `draft/pickMade` in the log, or `-1` when there is none.
 *
 * Written as "the last pick" rather than "the last entry" on purpose, and that distinction
 * has since become the whole of D-20. In Phase 1 the two were always the same — a pick was
 * the only thing that followed a pick — and Phase 3 interleaves priority-card plays and
 * resolutions into the same log, so a `pop()` would now remove one of those instead,
 * silently. `lastUndoableIndex` below is what the undo path actually reads; this one
 * survives for `lastPickAction`, which answers a genuinely narrower question.
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
 * The pick that an undo would remove, or `null` when the log holds none.
 *
 * Kept beside `lastUndoableAction` rather than replaced by it. The two answer different
 * questions — "the last pick" and "the last thing undo would touch" — and since D-20 those
 * are routinely different actions.
 */
export function lastPickAction(doc: TournamentDoc): PickMadeAction | null {
  const index = lastPickIndex(doc);
  if (index === -1) return null;
  return doc.log[index] as PickMadeAction;
}

/**
 * The three actions that ORIGINATE a tournament, and the boundary undo never crosses.
 *
 * Undo unwinds the DRAFT; it does not un-create the tournament. Removing any of these
 * would leave a document with no pool, no schedule or no turn order — which is not an
 * earlier state of the draft, it is a broken one. `Abandon draft` is the control for
 * throwing a tournament away, and it is a `danger`-toned confirm for that reason.
 */
const NEVER_UNDONE: readonly string[] = [POOL_BUILT, SCHEDULE_COMPILED, DRAFT_STARTED];

/**
 * Whether undo would touch this entry — D-20, SHEL-06.
 *
 * Both halves are load-bearing and they are not redundant.
 *
 * The DENY-LIST is the invariant. It states the boundary in one place, so when the swap
 * actions joined the allow-list below nobody had to re-derive whether a growing allow-list
 * could reach `pool/built`. It could not, and that was the point of writing it that way.
 *
 * D-11 makes that argument do MORE work than it used to, not less. `pool/built` is no
 * longer the first action of every document: a `blind` or `snake` tournament writes it
 * LAST, after the ban stage and the reveal, so it is now the most recent entry at exactly
 * the moment a host is most likely to press `Undo last move`. The deny-list is what keeps
 * that press from un-drawing the pool and leaving a started draft with nothing to pick
 * from — and it holds without amendment, because it names the three originating types
 * rather than reasoning about where they sit in the log. Anything that ever replaces it
 * with a positional rule ("the first three entries") would be wrong for two of the three
 * ban modes.
 *
 * The ALLOW-LIST is the structural check, and it is why this is not simply "anything not
 * excluded". An imported or hand-edited log is untrusted input: it can carry an action
 * type this build has never heard of, which `apply` tolerates and folds to nothing, and it
 * can carry a pick-shaped entry with no `monId`. Undoing either would remove an entry and
 * change NOTHING on screen — the failure `lastPickIndex`'s comment describes, arriving by
 * a different route. `draft/pickUndone` is excluded by the same rule and deliberately:
 * removing a compensating action would resurrect the pick it compensated, which is a redo,
 * and D-10 declines to have one.
 *
 * `swap/made` and `swap/passed` attach TOGETHER, in 03-11, and the pairing is not a
 * scheduling convenience. `UndoRemoval` had to widen for both at once — a swap needs two
 * mon ids where a pick needs one, and a pass needs a swap round where neither of the others
 * has one — so adding the first alone would have meant reshaping the same type twice.
 * Until they landed, `Undo last move` stepped PAST a swap to the last pick and the swap
 * survived: nothing corrupted, but the one move a host is most likely to regret was the one
 * move they could not take back.
 *
 * THE THREE BAN ACTIONS join in 04-07, and they are the growth the deny-list paragraph
 * above predicted rather than an exception to it. `pool/built`, `schedule/compiled` and
 * `draft/started` are still the boundary and their list is unchanged; all three ban types
 * sit inside it. D-03 is unconditional — "full undo throughout the ban stage, on the same
 * single stack" — and the host is transcribing other people's bans off a Discord message,
 * which is the input method most likely to need taking back.
 *
 * Adding them to NEITHER list is the silent failure (04-RESEARCH Pitfall 8). `isUndoable`
 * is a deny-list PLUS an allow-list, so an action in neither is simply stepped past — and
 * the next thing below a ban is `draft/started`, which the deny-list correctly refuses. The
 * result is `Undo last move` doing nothing at all, on the one stage D-03 calls the
 * correction path for the phase's primary input.
 *
 * THE FIVE TOURNAMENT TYPES join in 05-08, all five at once, and D-12 is unconditional:
 * one stack for the whole log, exactly as Phase 3 established it and Phase 4 kept it. Undo
 * is the fast path for "that was the wrong winner"; D-09 and D-10's correction flow is for
 * a mistake three matches back. `NEVER_UNDONE` is again unchanged, and again none of the
 * five is near it.
 *
 * They are listed here in the same change that declared them, and the reason is worth
 * stating because it is the one omission the type system does NOT catch. `UndoRemoval.kind`
 * widening forces an arm in `undoAnnouncement` — `store.ts`'s `const exhaustive: never`
 * makes a missing announcement a compile error. Nothing makes a missing ALLOW-LIST entry
 * anything at all: the type still folds, the log still grows, and `Undo last move` simply
 * reaches past it to a pick made half an hour earlier. Pitfall 6's warning sign is exactly
 * that — the button enabled and inert after recording a match.
 */
function isUndoable(action: Action): boolean {
  if (NEVER_UNDONE.includes(action.type)) return false;
  return (
    isPickMadeAction(action) ||
    isCardsPlayedAction(action) ||
    isOrderResolvedAction(action) ||
    isSwapMadeAction(action) ||
    isSwapPassedAction(action) ||
    isBansPlacedAction(action) ||
    isBansSubmittedAction(action) ||
    isBansRevealedAction(action) ||
    isMatchRecordedAction(action) ||
    isResultsVoidedAction(action) ||
    isCutTakenAction(action) ||
    isTiebreakOrderedAction(action) ||
    isReopenedAction(action)
  );
}

/** Index of the last entry undo would touch, or `-1`. */
function lastUndoableIndex(doc: TournamentDoc): number {
  for (let index = doc.log.length - 1; index >= 0; index--) {
    const action = doc.log[index];
    if (action !== undefined && isUndoable(action)) return index;
  }
  return -1;
}

/**
 * The action `undoLast` would remove, or `null` when there is nothing to undo.
 *
 * The generalization `lastPickIndex`'s own comment predicted: Phase 1 could say "the last
 * pick" because a pick was the only thing that followed a pick, and D-20 makes the log
 * interleave picks, card plays and resolutions. A `pop()` — or a `lastPickAction` on the
 * undo path — would now reach past a card play to a pick made two moves ago, silently,
 * with the button still reading as if it had done the obvious thing.
 */
export function lastUndoableAction(doc: TournamentDoc): Action | null {
  const index = lastUndoableIndex(doc);
  if (index === -1) return null;
  return doc.log[index] ?? null;
}

/**
 * The `cards/played` that triggered a resolution — searched, not assumed to be at `-1`.
 *
 * In every log this build writes it IS the immediately preceding entry, because
 * `order/resolved` is dispatched the instant the last card lands. The search exists for
 * imported documents, and the round is matched so that a log carrying a stray entry
 * between the two cannot pair a resolution with a card from some other round.
 */
function triggeringCardIndex(doc: TournamentDoc, resolvedIndex: number, round: number): number {
  for (let index = resolvedIndex - 1; index >= 0; index--) {
    const action = doc.log[index];
    if (action === undefined) continue;
    if (isCardsPlayedAction(action) && action.round === round) return index;
  }
  return -1;
}

/**
 * The `tournament/matchRecorded` a void accompanies — found by `seq`, EXACTLY.
 *
 * Compare this with {@link triggeringCardIndex} directly above, which searches for a
 * plausible neighbour and says so: it matches on the round because a stray entry between
 * the two could otherwise pair a resolution with a card from some other round. That is a
 * heuristic doing its best with a log that carries no link between the two actions.
 *
 * `causedBySeq` removes the guesswork. The void NAMES the record it accompanies, so this
 * matches one number against one number — no adjacency, no round, nothing that a third
 * entry landing between them could disturb. That exactness is what makes D-10's "undo puts
 * the whole correction back in one step" TRUE rather than intended.
 *
 * A missing target returns `-1` and the caller takes only the void, on `draft/pickUndone`'s
 * precedent: `seq` may legally have gaps, an imported log is untrusted, and removing an
 * unrelated result because the named one was absent would be worse than leaving a
 * correction half-undone in a document this build never wrote.
 */
function causingRecordIndex(doc: TournamentDoc, voidIndex: number, causedBySeq: number): number {
  for (let index = voidIndex - 1; index >= 0; index--) {
    const action = doc.log[index];
    if (action === undefined) continue;
    if (isMatchRecordedAction(action) && action.seq === causedBySeq) return index;
  }
  return -1;
}

/**
 * Which log entries an undo would drop, ascending. Empty when there is nothing to undo.
 *
 * ## Why a resolution takes its trigger with it — D-20, and 03-RESEARCH's Pitfall 5
 *
 * Resolution is AUTOMATIC (D-17, D-19): the moment every player's card is down, the app
 * emits `order/resolved` without anybody clicking anything. So removing the resolution on
 * its own returns the document to a state where every card is still down — and the app
 * immediately re-resolves it on the next render. The undo appears to do nothing, or loops.
 *
 * Removing the resolution AND the card that completed the round is what actually steps
 * back: the round returns to the card phase with one card outstanding, which is a state
 * the host can act in.
 *
 * The alternative was making resolution a host click, which costs a click per round and
 * contradicts D-17's whole point — that "every card down but no order yet" is a screen
 * state nobody should have to look at.
 *
 * ## Why a void takes its correction with it — D-10, D-12
 *
 * The second pairing, and it is the same shape for a different reason. A correction that
 * changes who is in a downstream match is TWO actions by design: the new
 * `tournament/matchRecorded`, and a `tournament/resultsVoided` naming what it invalidated.
 * They are one host act — one click, one confirm, one sentence in the recap — so undoing
 * half of it would leave a semi-final corrected with its final still cleared, which is a
 * state nothing on screen describes and nothing offers to fix.
 *
 * The pairing is by `causedBySeq` rather than by adjacency, and
 * {@link causingRecordIndex} carries the comparison with `triggeringCardIndex`'s
 * heuristic search.
 */
function removalIndices(doc: TournamentDoc): number[] {
  const index = lastUndoableIndex(doc);
  if (index === -1) return [];

  const action = doc.log[index];
  if (action !== undefined && isOrderResolvedAction(action)) {
    const cardIndex = triggeringCardIndex(doc, index, action.round);
    if (cardIndex !== -1) return [cardIndex, index];
  }

  if (action !== undefined && isResultsVoidedAction(action)) {
    const recordIndex = causingRecordIndex(doc, index, action.causedBySeq);
    if (recordIndex !== -1) return [recordIndex, index];
  }

  return [index];
}

/** What an undo would take, and from whom. Every field is a fact, never a sentence. */
export interface UndoRemoval {
  /**
   * Which of the undoable actions is at the top of the stack.
   *
   * EVERY MEMBER NEEDS AN ARM IN `undoAnnouncement` (`store.ts`), and since 04-07 the
   * compiler says so: that function's `default` assigns this field to a `const
   * exhaustive: never`, so widening this union without widening the announcement is a
   * type error rather than a species name spoken into a room.
   */
  kind:
    | 'pick'
    | 'card'
    | 'order'
    | 'swap'
    | 'pass'
    | 'banPlaced'
    | 'banSubmission'
    | 'banReveal'
    | 'match'
    | 'void'
    | 'cut'
    | 'tiebreak'
    | 'reopen';
  /**
   * 1-based round of the action being removed.
   *
   * For a pick, a card play or a resolution, the round it belongs to. For a SWAP, the pick
   * round of the slot being restored — which is the round the announcement names. For a
   * PASS, `config.rounds`: a pass belongs to a swap round rather than a pick round, and
   * `config.rounds` is where the draft is standing while the swap rounds run, so a caller
   * comparing this against the current round gets the honest answer "no round was crossed".
   * {@link UndoRemoval.swapRound} is the field that actually identifies a pass.
   *
   * For a BAN, `1`, on the same precedent and for the same reason. The ban stage runs
   * before any pick round exists and `selectCurrentRound` answers `1` throughout it, so a
   * caller comparing this against the current round again hears "no round was crossed".
   * Which ban undos DO need a confirm is stated explicitly in
   * {@link undoCrossesRoundBoundary} rather than inferred from this number.
   *
   * For every TOURNAMENT kind, `config.rounds`, on the `'pass'` precedent exactly. A match
   * record, a void, a cut, a tiebreak order and a reopen all happen after the last pick,
   * so no pick round was crossed and the draft is standing on its last one — which is the
   * same honest answer a pass gives, arrived at the same way.
   */
  round: number;
  /** Whose move it was. The UI resolves the display name; core never holds one. */
  playerId: string;
  /**
   * The species returning to the POOL — a pick's own species, or a swap's INCOMING one.
   *
   * One field, one meaning, across two kinds. Undoing a pick returns what was picked;
   * undoing a swap returns what the swap brought in, because the swap took it out of the
   * pool. `null` for a card play, a resolution and a pass, none of which touch the pool.
   *
   * `null` FOR EVERY BAN KIND, and that is a secrecy control rather than an omission.
   * This field means "the species returning to the POOL", and during the ban stage no pool
   * exists — D-23 defers the draw until after the reveal. Putting a banned id here would
   * give a fall-through announcement a name to speak, which is exactly the leak
   * `undoAnnouncement`'s exhaustive switch closes. Two layers, deliberately: this one has
   * no name to hand over even if that one is later weakened.
   */
  monId: string | null;
  /**
   * The species returning to the SLOT. A swap only; `null` for every other kind.
   *
   * This is the widening deferred item 5 predicted. `monId` alone could describe a pick,
   * where one species moves in one direction, and a swap moves two in opposite directions
   * — 03-UI-SPEC's `Undo, swap` row names both of them, and one field could not write that
   * sentence without re-reading the log at the announcement.
   */
  outMonId: string | null;
  /** The value returning to a hand, for a card play or a resolution. `null` for a pick. */
  cardValue: number | null;
  /**
   * 1-based dedicated swap round, for a pass and for a swap-round swap.
   *
   * `null` for a pick, a card play, a resolution — and for a MID-DRAFT swap, whose
   * `swapRound` is `0` and which belongs to no dedicated round. Null therefore reads as
   * "this move was not made in a swap round", which is precisely the question
   * {@link undoCrossesRoundBoundary} needs answered.
   */
  swapRound: number | null;
  /** Log entries the operation removes — 2 for a resolution and its trigger, else 1. */
  removedCount: number;
}

/**
 * What `undoLast` would take, without taking it.
 *
 * ONE description, two consumers: the confirm dialog's copy and the live-region
 * announcement. Written out at each of them, the two would be free to disagree about what
 * an undo just did — and the announcement is what reaches somebody not watching the screen.
 */
export function undoRemoval(doc: TournamentDoc): UndoRemoval | null {
  const indices = removalIndices(doc);
  if (indices.length === 0) return null;

  // The LAST index is the action at the top of the stack; anything before it is something
  // that action drags along.
  const primary = doc.log[indices[indices.length - 1] ?? -1];
  if (primary === undefined) return null;

  if (isPickMadeAction(primary)) {
    return {
      kind: 'pick',
      round: primary.round,
      playerId: primary.playerId,
      monId: primary.monId,
      outMonId: null,
      cardValue: null,
      swapRound: null,
      removedCount: indices.length,
    };
  }

  if (isCardsPlayedAction(primary)) {
    return {
      kind: 'card',
      round: primary.round,
      playerId: primary.playerId,
      monId: null,
      outMonId: null,
      cardValue: primary.value,
      swapRound: null,
      removedCount: indices.length,
    };
  }

  if (isSwapMadeAction(primary)) {
    // Both directions, named for what they DO rather than for the payload field they came
    // from: `inMonId` went into the slot and comes back out to the pool, `outMonId` left
    // the slot and goes back into it. Reading them the other way round produces a sentence
    // that is grammatical, plausible and exactly backwards.
    return {
      kind: 'swap',
      round: primary.round,
      playerId: primary.playerId,
      monId: primary.inMonId,
      outMonId: primary.outMonId,
      cardValue: null,
      // `0` is the mid-draft spend and is not a dedicated round — see the field's doc.
      swapRound: primary.swapRound >= 1 ? primary.swapRound : null,
      removedCount: indices.length,
    };
  }

  if (isSwapPassedAction(primary)) {
    return {
      kind: 'pass',
      // See `UndoRemoval.round`: a pass belongs to no pick round, and the round the draft
      // is standing in while the swap rounds run is the last one.
      round: doc.config.rounds,
      playerId: primary.playerId,
      monId: null,
      outMonId: null,
      cardValue: null,
      swapRound: primary.swapRound,
      removedCount: indices.length,
    };
  }

  /*
    THE THREE BAN ARMS — D-03, and every one of them carries `monId: null`.

    Read `UndoRemoval.monId`'s doc block before changing any of these. The field means "the
    species returning to the POOL"; the ban stage runs before a pool exists, so there is no
    honest value to put here. The dishonest one — the id that was just banned — is precisely
    what an announcement would find and speak, in a room, about a ban the host removed
    privately. `undoAnnouncement`'s exhaustive switch is the primary guard; this is the
    second, and it holds even if that one is later weakened.

    `round: 1` on the `'pass'` precedent above. A ban belongs to no pick round, and
    `selectCurrentRound` answers 1 throughout the stage, so the comparison a caller might
    make gets the honest "no round was crossed" — which is why the confirm the blind kinds
    DO need is set explicitly in `undoCrossesRoundBoundary` rather than derived from this.
  */
  if (isBansPlacedAction(primary)) {
    return {
      kind: 'banPlaced',
      round: 1,
      playerId: primary.playerId,
      monId: null,
      outMonId: null,
      cardValue: null,
      swapRound: null,
      removedCount: indices.length,
    };
  }

  if (isBansSubmittedAction(primary)) {
    // One player's WHOLE allotment, because D-05 makes the lock-in one act. Undoing half a
    // submission would remove one invisible ban out of several invisible bans, and no
    // sentence could describe what came back without naming it.
    return {
      kind: 'banSubmission',
      round: 1,
      playerId: primary.playerId,
      monId: null,
      outMonId: null,
      cardValue: null,
      swapRound: null,
      removedCount: indices.length,
    };
  }

  if (isBansRevealedAction(primary)) {
    // The reveal is a HOST act and `bans/revealed` carries no `playerId` — so this one is
    // empty, on the resolution arm's precedent below. The copy for this kind names no
    // player, which is the honest reading: nobody's bans are removed by un-revealing them.
    return {
      kind: 'banReveal',
      round: 1,
      playerId: '',
      monId: null,
      outMonId: null,
      cardValue: null,
      swapRound: null,
      removedCount: indices.length,
    };
  }

  /*
    THE FIVE TOURNAMENT ARMS — D-12, and every one of them carries `monId: null`.

    `UndoRemoval.monId` means "the species returning to the POOL". Nothing in a tournament
    touches the pool: the draft is over, every team is full, and the only thing a match
    record moves is a name between two columns of a results grid. There is no honest value
    to put here, and no dishonest one worth inventing.

    `round: config.rounds` on the `'pass'` precedent — see the field's own doc block. All
    five happen after the last pick, so a caller comparing this against the current round
    gets the honest "no round was crossed", and `undoCrossesRoundBoundary` leaves these
    kinds out of `ROUND_COMPARABLE_KINDS` rather than trusting the arithmetic to agree.

    `playerId` is the WINNER for a match record, because that is the one player an
    announcement can name truthfully — undoing the record is exactly "that win no longer
    stands". The other four are host acts about the whole tournament and carry `''`, on
    the `'banReveal'` precedent above: naming a player would imply the undo did something
    to them in particular, and none of them does.
  */
  if (isMatchRecordedAction(primary)) {
    return {
      kind: 'match',
      round: doc.config.rounds,
      playerId: primary.winnerId,
      monId: null,
      outMonId: null,
      cardValue: null,
      swapRound: null,
      removedCount: indices.length,
    };
  }

  if (isResultsVoidedAction(primary)) {
    // `removedCount` is 2 whenever `causedBySeq` found its record, which is what
    // `confirm-copy.ts`'s `removedCount > 1` clause reads to say a whole correction is
    // coming back rather than half of one.
    return {
      kind: 'void',
      round: doc.config.rounds,
      playerId: '',
      monId: null,
      outMonId: null,
      cardValue: null,
      swapRound: null,
      removedCount: indices.length,
    };
  }

  if (isCutTakenAction(primary)) {
    return {
      kind: 'cut',
      round: doc.config.rounds,
      playerId: '',
      monId: null,
      outMonId: null,
      cardValue: null,
      swapRound: null,
      removedCount: indices.length,
    };
  }

  if (isTiebreakOrderedAction(primary)) {
    return {
      kind: 'tiebreak',
      round: doc.config.rounds,
      playerId: '',
      monId: null,
      outMonId: null,
      cardValue: null,
      swapRound: null,
      removedCount: indices.length,
    };
  }

  if (isReopenedAction(primary)) {
    return {
      kind: 'reopen',
      round: doc.config.rounds,
      playerId: '',
      monId: null,
      outMonId: null,
      cardValue: null,
      swapRound: null,
      removedCount: indices.length,
    };
  }

  // A resolution, and the card it dragged with it. The card is what the copy names — "an
  // order was removed" tells the host nothing they can act on, and the value going back
  // into somebody's hand is the part they have to know about.
  const trigger = indices.length > 1 ? doc.log[indices[0] ?? -1] : undefined;
  const card: CardsPlayedAction | null =
    trigger !== undefined && isCardsPlayedAction(trigger) ? trigger : null;

  return {
    kind: 'order',
    round: isOrderResolvedAction(primary) ? primary.round : (card?.round ?? 1),
    playerId: card?.playerId ?? '',
    monId: null,
    outMonId: null,
    cardValue: card?.value ?? null,
    swapRound: null,
    removedCount: indices.length,
  };
}

/**
 * Whether the draft has anything to unwind.
 *
 * False for an empty log and false for a log holding only the three origination actions —
 * which is the state the board boots into, and exactly when the `Undo last move` button
 * must render disabled.
 */
export function canUndo(doc: TournamentDoc): boolean {
  return lastUndoableIndex(doc) !== -1;
}

/**
 * The document with its most recent move removed.
 *
 * Returns the input unchanged when there is nothing to undo, so the caller never has to
 * ask twice.
 *
 * A fresh document object with a fresh log array comes back, never a mutation of the
 * input — the store, the autosave and the JSON export all hold references to documents
 * across a dispatch, and every one of them depends on those references continuing to
 * describe what they described.
 */
export function undoLast(doc: TournamentDoc): TournamentDoc {
  const indices = removalIndices(doc);
  if (indices.length === 0) return doc;

  const log = [...doc.log];

  // Descending, so each splice cannot shift an index still to be used. Two splices on one
  // fresh array rather than a filter, because the indices are already in hand and a filter
  // would need a predicate that re-identifies the same two entries.
  for (let position = indices.length - 1; position >= 0; position--) {
    log.splice(indices[position] ?? 0, 1);
  }

  return { ...doc, log };
}

/**
 * The kinds whose `round` is a PICK round, and therefore comparable to the one the draft is
 * standing in. See the argument inside {@link undoCrossesRoundBoundary} for why a swap and
 * a pass are not on this list.
 */
const ROUND_COMPARABLE_KINDS: readonly UndoRemoval['kind'][] = ['pick', 'card'];

/**
 * The kinds that ALWAYS confirm, whatever any round says — 04-UI-SPEC §8.
 *
 * Stated as a list rather than left to the comparison below, because the comparison would
 * answer `false` for both of them. A ban reports round 1 and the draft stands on round 1
 * throughout the stage, so `removed.round < currentRound` is false exactly where the
 * confirm matters — the same trap the resolution arm avoids by being named explicitly.
 *
 * `'banSubmission'` confirms because it removes a thing the host CANNOT SEE: D-05 forbids
 * re-displaying a submission, so this is the only undo in the project whose effect is
 * invisible, and the dialog is the one place the host can be told what it will cost them.
 * `'banReveal'` confirms because un-revealing cannot un-read — the room has already read
 * the bans, and the copy says so rather than implying a secrecy restoration.
 *
 * `'banPlaced'` is deliberately NOT here. A snake ban is on the board and reversing it is
 * visible, which puts it in the same category as a pick, where D-08's no-confirm posture
 * holds.
 */
const ALWAYS_CONFIRM_KINDS: readonly UndoRemoval['kind'][] = ['banSubmission', 'banReveal'];

/** What an undo would reach back into. Every field is a fact, never a sentence. */
export interface RoundBoundaryCrossing {
  /** True when the undo needs a confirm — see {@link undoCrossesRoundBoundary}. */
  crosses: boolean;
  /** Which kind of move is at the top of the stack. The UI picks its copy from this. */
  kind: UndoRemoval['kind'];
  /**
   * 1-based round of the action that would be removed.
   *
   * Named for the action rather than for a pick since D-20: a card play and a resolution
   * both carry a round, and a field called `pickRound` holding a card's round would be the
   * kind of stale contract this project treats as worse than no comment at all.
   */
  removedRound: number;
  /** 1-based round the draft is currently on. `config.rounds` once the draft is complete. */
  currentRound: number;
  /** Whose move it was. The UI resolves the display name; core never holds one. */
  playerId: string;
  /** The card value going back into a hand, or `null` when a pick is being undone. */
  cardValue: number | null;
  /** Log entries the operation removes — 2 for a resolution and its trigger, else 1. */
  removedCount: number;
}

/**
 * Whether unwinding the last pick reaches into a round the draft has already left — D-37.
 *
 * Three things a reader would otherwise get wrong.
 *
 * WHY IT LIVES HERE rather than in `TopBar`. Whether an undo crosses a round boundary is
 * a rule about the draft, and a UI component may not own a rule (02-UI-SPEC §Pure-core
 * boundary; `app.tsx` says the same thing about pick legality). This function reads no
 * clock, rolls no die and touches no DOM, so it is testable with zero mocks — which is
 * the observable payoff of the purity rule rather than a nicety.
 *
 * WHAT `removedCount` REPORTS, now that it is not always 1. It was written as the seam a
 * multi-step undo would fill, and D-20 filled it: undoing a resolved pick order removes
 * the resolution AND the card play that triggered it, so the field reports 2 for that case
 * and 1 for every other. `confirm-copy.ts`'s clause gated on `removedCount > 1` — dormant
 * since 02-07 — is reachable for the first time, which is the whole reason it was gated
 * rather than deleted.
 *
 * WHAT D-37 CHANGES, AND WHAT IT DOES NOT. It narrows Phase 1's D-10 without touching its
 * mechanism: the cheap case — undoing a pick in the round you are standing in — is still
 * one click and no dialog, and walking back two rounds costs one confirm per boundary
 * crossed rather than one per pick. Unlimited undo is unchanged and there is still no redo.
 *
 * Null when there is nothing to undo, so a caller never has to ask `canUndo` first.
 */
export function undoCrossesRoundBoundary(
  doc: TournamentDoc,
  state: DraftState,
): RoundBoundaryCrossing | null {
  const removed = undoRemoval(doc);
  if (removed === null) return null;

  // The round the draft is STANDING IN, asked for directly rather than read off a turn.
  //
  // This used to take the turn's round and fall back to `config.rounds` when there was no
  // turn — correct while the only turnless state was a finished draft, which does stand on
  // its last round. The card phase is a second turnless state and the fallback was wrong
  // for it: between two rounds of a six-round draft every undo would have been described
  // to the host as reaching back from round six, and D-37's confirm would have appeared on
  // the one undo it is meant to wave through. `selectCurrentRound` answers both states
  // from the same arithmetic, and clamps at `config.rounds`, so the finished-draft
  // behaviour the old fallback existed for is unchanged.
  const currentRound = selectCurrentRound(state);

  /*
    A RESOLVED ORDER always confirms, whatever round it belongs to.

    03-CONTEXT: "Undoing back past `order/resolved` un-resolves the round, which is honest:
    the order was computed from cards that no longer stand. D-37's round-boundary confirm
    extends to cover that crossing." The boundary being crossed is not the round's — it is
    the moment the whole room read an order off the screen and started picking against it.
    Comparing round numbers would miss it entirely, because the draft is still STANDING in
    the round it just resolved, so `removed.round < currentRound` is false exactly when the
    confirm matters most.
  */
  /*
    A SWAP and a PASS never cross, and that is a decision rather than an omission.

    03-UI-SPEC §12 lists exactly three new confirm sets for this phase and none of them is
    "undo a swap" or "undo a pass". Two independent reasons agree with it.

    The MECHANISM does not apply. D-37's confirm exists because undoing a pick from an
    earlier round is the start of walking several picks back — the host is warned that they
    are reaching behind the round the room is standing in. A swap or a pass is the most
    recent move in the log, `removedCount` is 1, and undoing it takes nothing else with it.
    A swap's `round` is the PICK round of the slot it changed, which can be round 1 while
    the draft stands at round 6, so a bare round comparison would fire on every swap of an
    early slot and describe a walk-back that is not happening.

    The COPY does not apply either. `UNDO_BOUNDARY_CONFIRM` reads "This undoes {name}'s pick
    from round {r}" — pick-specific prose that would be a plain untruth over a swap, on the
    one surface whose whole job is telling the host what is about to change.

    Written as an allow-list of the kinds whose `round` is comparable at all, so the three
    kinds that had this behaviour before 03-11 keep it byte for byte.
  */
  /*
    THE TWO BLIND BAN KINDS always confirm too, and `ALWAYS_CONFIRM_KINDS` above carries
    the argument. Set explicitly, never by the comparison: every ban reports round 1 and
    the draft stands on round 1 for the whole stage, so a comparison-driven implementation
    would quietly answer `false` and skip the dialog D-03's correction path depends on.
  */
  const crosses =
    removed.kind === 'order' ||
    ALWAYS_CONFIRM_KINDS.includes(removed.kind) ||
    (ROUND_COMPARABLE_KINDS.includes(removed.kind) && removed.round < currentRound);

  return {
    crosses,
    kind: removed.kind,
    removedRound: removed.round,
    currentRound,
    playerId: removed.playerId,
    cardValue: removed.cardValue,
    removedCount: removed.removedCount,
  };
}
