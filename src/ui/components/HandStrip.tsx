import './HandStrip.css';

/**
 * The priority cards one player still holds, on the board row that already carries their
 * name and their team — CARD-07, D-24.
 *
 * ## Why this lives on the board row rather than in a panel of its own
 *
 * CARD-07 asks that every player's remaining cards be visible to everyone. A dedicated
 * hands panel would be a SECOND rendering of a fact the board already has a row for, and
 * the two would drift the moment one of them was updated and the other was not — the same
 * argument `TeamStrip`'s own comment makes for why a "your team" panel does not exist. The
 * row is where a player already looks to find themselves.
 *
 * ## This component decides nothing
 *
 * The hand is a RULE — `1..config.rounds` minus what that player has played — so it arrives
 * as a prop from `selectHand` and is never worked out here. That is the inverse of the case
 * `StatBlock` states for itself: a base-stat total is display arithmetic that no draft
 * outcome depends on, and this is a game rule that several do. If this file ever seems to
 * need to know how many cards a tournament deals, the selector is missing.
 *
 * All that belongs here is the pips and the sentence.
 *
 * ## Two signals for spent, and neither of them is hue
 *
 * A spent pip is dimmed AND struck through. Dimming alone is this project's disabled
 * convention, at the same 0.45, and an unavailable control is not what a spent card is: it
 * is a move the player already made, in the open, that everyone at the table watched. The
 * ban grid pairs the same two signals for the same reason.
 *
 * ## One sentence per row, not six announcements
 *
 * The pips are `aria-hidden` and the wrapper carries a single composed summary. Six separate
 * pip announcements per row would make traversing an eight-player board unbearable, and what
 * CARD-07 actually asks for is the REMAINING cards — which is exactly what the sentence
 * names, in ascending order, with the spent ones simply absent from it.
 */

export interface HandStripProps {
  /** For the spoken summary only. Never used to compare or key anything. */
  playerName: string;
  /**
   * Every value this tournament deals, ascending.
   *
   * The full list rather than a count, because a spent card still occupies its position:
   * the pips must read `1 2 3 4 5 6` with three struck through, never `1 4 6` shuffled up.
   */
  values: readonly number[];
  /** What that player still holds, straight from `selectHand`. A subset of `values`. */
  hand: readonly number[];
}

/**
 * `2, 5 and 6` — comma-separated with an `and` before the last, and no serial comma.
 *
 * Held here rather than written inline in JSX for the reason every composed string in this
 * project is: JSX collapses whitespace between text lines, and this sentence is a contract
 * the tests assert on exact equality.
 */
function listOf(values: readonly number[]): string {
  const last = values[values.length - 1];
  if (last === undefined) return '';
  if (values.length === 1) return `${last}`;
  return `${values.slice(0, -1).join(', ')} and ${last}`;
}

function handSummary(playerName: string, hand: readonly number[]): string {
  if (hand.length === 0) return `${playerName} holds no cards.`;
  return `${playerName} holds ${listOf(hand)}.`;
}

export function HandStrip({ playerName, values, hand }: HandStripProps) {
  // Computation-local, and the only reason it is a Set: `values` is at most the round cap,
  // so this is about saying "is this one still held" once per pip rather than about speed.
  const remaining = new Set(hand);

  return (
    <span class="hand-strip">
      <span class="hand-strip__pips" aria-hidden="true">
        {values.map((value) => {
          const spent = !remaining.has(value);
          return (
            <span
              class={
                spent
                  ? 'hand-strip__pip hand-strip__pip--dimmed hand-strip__pip--struck'
                  : 'hand-strip__pip'
              }
              key={value}
            >
              {value}
            </span>
          );
        })}
      </span>

      <span class="visually-hidden">{handSummary(playerName, hand)}</span>
    </span>
  );
}
