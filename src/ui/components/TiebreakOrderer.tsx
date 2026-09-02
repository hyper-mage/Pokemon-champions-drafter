import { useLayoutEffect, useRef, useState } from 'preact/hooks';

import type { DraftState } from '../../core/model';
import { isSameSet, selectStandings } from '../../core/tournament';

import './TiebreakOrderer.css';

/**
 * The host's order for the block nothing could split — TOUR-08, `05-UI-SPEC` §7, D-13.
 *
 * ## It owns the working order and nothing else
 *
 * `SchedulePreview.tsx:10-15`'s rule, one surface along: the ordering is COMPONENT STATE
 * until `Confirm this order`, which reports an intent. There is no dispatch here, so this
 * file cannot become a second write path, and the single action the confirm produces is
 * stamped by `dispatch` in `src/store.ts` like every other.
 *
 * ## Up and down buttons, and the three shapes that were rejected
 *
 * D-13 in full, written down here so nobody re-adds one of them:
 *
 *   Dragging a row — `CLAUDE.md` §What NOT to Use rejects both of the usual libraries for
 *   it by name, and notes that up/down buttons are more reliable on touch anyway. The two
 *   package names are deliberately not repeated here: the acceptance check for this file
 *   is a plain text search for them, and a doc block that quoted what it was rejecting
 *   would make the gate match its own documentation — `FeasibilityBar`'s stated reason for
 *   describing its attributes rather than quoting them.
 *
 *   Pair-by-pair winner selection — it lets the host produce a CYCLE. A beats B, B beats
 *   C, C beats A is exactly the shape the automatic chain refused to resolve, so offering
 *   the host a control that can reproduce it would hand back the problem it was given.
 *
 *   Typed seed numbers — they invite collisions and gaps, and, the part that matters for
 *   this codebase, a number carries no record of WHICH PLAYERS it was chosen for. A
 *   numbered override could not self-invalidate at all. Naming the players IS the
 *   invalidation mechanism: `selectStandings` matches an override to a block by set
 *   equality, so a correction that changes the block's membership makes the override stop
 *   matching on its own, and this control renders again.
 *
 * ## Only the tied block, and only the first one
 *
 * §7: rows outside the block are not rendered in this control. The standings table above
 * already shows them, and offering a move that means nothing is worse than offering none.
 *
 * When two separate blocks are unresolved at once, this resolves the HIGHEST-PLACED one
 * and re-renders for the next. That is a rendering order, not a rule — the selector
 * decides what is tied and this file only decides which unresolved block to put in front
 * of the host first. It also keeps §Color's reservation intact: one accent action per
 * screen state, not one per block.
 *
 * ## The rows are keyed by SLOT, not by player
 *
 * `SchedulePreview.tsx`'s rule with the nouns changed: there a move exchanges the KINDS of
 * two fixed round numbers, here it exchanges the PLAYERS of two fixed seed slots. Slot 1
 * is always the first row. Keying by slot is what keeps the button DOM nodes still across
 * a move, and that stability is what makes the focus handoff below possible at all — a
 * player-keyed list would move the nodes and leave the ref map pointing at the row a
 * player has left.
 *
 * ## The accessible names are the contract's, with nothing appended
 *
 * `SchedulePreview` spends its inert buttons' names on a reason, because there the reason
 * — "round 4 is already a Mega round" — is a fact about a row three places away that
 * nothing on screen states. Here the only two inert cases are "already first" and "already
 * last", and the ordered list the button sits in states both. §Copywriting → Standings
 * pins these names to `Move {playerName} up` and `Move {playerName} down`, and
 * `StandingsTable`'s doc block already records the posture for this exact situation: copy
 * this surface is not entitled to invent does not get invented. The inert state itself is
 * carried by `aria-disabled`, which is announced.
 */

/** Rendered in this order, top to bottom, on every row. */
const MOVE_DIRECTIONS: readonly ['up', 'down'] = ['up', 'down'];

export type TiebreakMoveDirection = (typeof MOVE_DIRECTIONS)[number];

const MOVE_CLASS = 'tiebreak-orderer__move';

/**
 * Verbatim from `05-UI-SPEC` §Copywriting → Standings.
 *
 * Module constants rather than inline JSX text (PATTERNS S-6): JSX collapses whitespace
 * between text lines, and these strings are asserted on exact equality.
 */
export const TIEBREAK_HEADING = 'Order the tied players';
export const TIEBREAK_CONFIRM = 'Confirm this order';

/** The visible label. The accessible name adds the player; the eye does not need to. */
const MOVE_LABEL: Readonly<Record<TiebreakMoveDirection, string>> = {
  up: 'Up',
  down: 'Down',
};

/**
 * `Move {playerName} up` / `Move {playerName} down` — §Copywriting, unedited.
 *
 * Both CONTAIN their visible label as a substring, which is SC 2.5.3 Label in Name and the
 * same construction `PlayerList`'s `Remove {name}` uses: a host on voice control says what
 * they can read.
 */
function moveName(direction: TiebreakMoveDirection, playerName: string): string {
  return `Move ${playerName} ${direction}`;
}

/**
 * The body sentence. The bare plural is correct by construction rather than by luck.
 *
 * §Copywriting requires a singular/plural helper for an interpolated count, and this is
 * the one place in the phase that needs none: link 4 of the chain only ever produces a
 * block of two or more, so `{n} players` cannot render as `1 players` here. Stated rather
 * than left as an omission a later reader would "fix" with a helper that can never take
 * its other branch.
 */
function bodyFor(count: number): string {
  return `Head-to-head cannot separate ${count} players. Put them in the order you want and the bracket seeds from it.`;
}

export interface TiebreakOrdererProps {
  state: DraftState;
  /**
   * The block in the host's chosen order, best first — an INTENT, not a dispatch.
   *
   * `TournamentScreen` turns it into the one `tournament/tiebreakOrdered` the log records.
   * Keeping the dispatch there rather than here is `SchedulePreview`'s rule and the reason
   * the store's `dispatch` stays the single write path.
   */
  onConfirm: (playerIds: readonly string[]) => void;
}

export function TiebreakOrderer({ state, onConfirm }: TiebreakOrdererProps) {
  /**
   * The move buttons, keyed `{direction}:{slot}` — the ref map the focus handoff aims at.
   * Slots are stable across a move (players swap, rows do not), so a key written before a
   * move still resolves after it.
   */
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef<string | null>(null);

  const [order, setOrder] = useState<readonly string[]>([]);

  /**
   * Focus follows the moved PLAYER, not the pressed button.
   *
   * `SchedulePreview.tsx:177-183`'s reason, unchanged: leaving focus where it was makes a
   * second press reverse the first, which makes walking a player from the bottom of a
   * three-way tie to the top impossible by keyboard — the exact journey D-13's buttons
   * exist to support. The handoff runs in a layout effect rather than in the click handler
   * because the destination button only holds the moved player after this component has
   * re-rendered with the new order.
   */
  useLayoutEffect(() => {
    const key = pendingFocus.current;
    if (key === null) return;
    pendingFocus.current = null;
    buttons.current.get(key)?.focus();
  });

  const rows = selectStandings(state);
  const firstTied = rows.find((row) => row.decidedBy === 'tied');
  if (firstTied === undefined) return null;

  // Every row of the block shares the block's one position — that is what `tied` means in
  // `selectStandings`, so this is a lookup rather than a re-derivation of the grouping.
  const block = rows
    .filter((row) => row.decidedBy === 'tied' && row.position === firstTied.position)
    .map((row) => row.playerId);

  /**
   * The working order, reset by MEMBERSHIP rather than by an effect.
   *
   * A correction can change which players are tied while this control is open (05-03's
   * override self-invalidates by set equality, and so must the order being built). Deriving
   * the reset during render means there is never a frame in which the confirm button would
   * dispatch an order over a block that no longer exists — which an effect-based reset
   * would leave open.
   */
  const working = isSameSet(order, block) ? order : block;

  const nameOf = (playerId: string): string =>
    state.config.players.find((player) => player.id === playerId)?.name ?? playerId;

  const move = (slot: number, direction: TiebreakMoveDirection): void => {
    const step = direction === 'up' ? -1 : 1;
    const target = slot + step;

    const moving = working[slot];
    const displaced = working[target];
    if (moving === undefined || displaced === undefined) return;

    const next = [...working];
    next[slot] = displaced;
    next[target] = moving;

    pendingFocus.current = `${direction}:${target}`;
    setOrder(next);
  };

  return (
    <div class="tiebreak-orderer">
      <h3 class="tiebreak-orderer__heading">{TIEBREAK_HEADING}</h3>

      <p class="tiebreak-orderer__body">{bodyFor(working.length)}</p>

      {/*
        An `<ol>`, for the reason `StandingsTable` states and `SchedulePreview` states
        before it: the ordinal is the information. This list is a seed order and nothing
        else.
      */}
      <ol class="tiebreak-orderer__rows">
        {working.map((playerId, slot) => {
          const playerName = nameOf(playerId);

          return (
            // Keyed by SLOT — see the doc block. The row's identity is its place in the
            // order; a move exchanges the players of two rows and never the rows.
            <li class="tiebreak-orderer__row" key={slot}>
              <span class="tiebreak-orderer__player">{playerName}</span>

              <span class="tiebreak-orderer__controls">
                {MOVE_DIRECTIONS.map((direction) => {
                  const movable =
                    direction === 'up' ? slot > 0 : slot < working.length - 1;

                  return (
                    <button
                      key={direction}
                      type="button"
                      // ONE vnode shape across the availability boundary. A bare button in
                      // one branch and a Fragment in the other unmounts the node and drops
                      // focus to `<body>` — the regression 02-11 fixed on `SplitPanes`.
                      class={movable ? MOVE_CLASS : `${MOVE_CLASS} ${MOVE_CLASS}--inert`}
                      // `undefined`, never `'false'`: the attribute is SHED the moment the
                      // move becomes possible (WR-04). `aria-disabled` and never native
                      // `disabled`, because a natively disabled button is not focusable and
                      // a host walking the list by keyboard would find the ends missing
                      // rather than inert.
                      aria-disabled={movable ? undefined : 'true'}
                      aria-label={moveName(direction, playerName)}
                      ref={(element) => {
                        const key = `${direction}:${slot}`;
                        if (element === null) buttons.current.delete(key);
                        else buttons.current.set(key, element);
                      }}
                      onClick={() => {
                        // The early return is what keeps the attribute honest. Without it
                        // the ARIA would claim the control is inert while a click still
                        // reordered the block.
                        if (!movable) return;
                        move(slot, direction);
                      }}
                    >
                      {MOVE_LABEL[direction]}
                    </button>
                  );
                })}
              </span>
            </li>
          );
        })}
      </ol>

      {/*
        The accent-filled primary action of this screen state — §Color reservation 2, which
        allows exactly one per state. The round-robin stage's other candidate is `Take the
        cut`, and what keeps the two from claiming the fill at once is stated on both sides
        rather than assumed on either:

          - `selectCutSplitsTiedBlock` refuses a cut with ANY unresolved row inside it, not
            only one the line splits (WR-02), so every cut that would seed the block this
            control is ordering is inert.
          - `.cut-control__action--inert` sheds the accent fill and the accent border
            (WR-09). Dimming alone left both in place, so an inert cut still read as a
            second accent-filled primary.

        The residue is a block that sits wholly BELOW the host's chosen cut: this control
        renders for the first unresolved block wherever it is, while a cut above it is
        legitimately live. That is not the reservation failing so much as the reservation
        being about one screen state and this being two overlapping ones — recorded here
        rather than papered over, because the sentence this comment replaced claimed an
        invariant the code did not have.
      */}
      <button
        type="button"
        class="tiebreak-orderer__confirm"
        onClick={() => onConfirm(working)}
      >
        {TIEBREAK_CONFIRM}
      </button>
    </div>
  );
}
