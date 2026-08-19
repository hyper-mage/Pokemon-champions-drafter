import './CardFace.css';

/**
 * One priority card — a digit at `--text-display` on a `--card-min` square (CARD-01).
 *
 * ## Two states, and only one of them is a control
 *
 * `'playable'` renders a real `<button>`: it is the thing the host clicks to play the card.
 * `'played'` renders a plain element in the played-this-round row, where there is nothing to
 * activate — the card is already on the table and clicking it would mean nothing. A button
 * that does nothing is worse than a non-button, because it takes a tab stop and promises an
 * action to anybody arriving by keyboard or screen reader.
 *
 * ## One vnode shape for the playable state, deliberately
 *
 * 03-09 adds D-21's UNPLAYABLE state — `aria-disabled`, struck through, a reason in the
 * accessible name — to THIS button, not beside it. `SplitPanes` records what the alternative
 * costs: Preact cannot reuse a DOM node across a vnode type, so a component that swaps its
 * shape between states unmounts the subtree, and `document.activeElement` falls to `<body>`
 * on whichever control the host was standing on. That is why the inert card will be an
 * attribute change here rather than a second branch, and why this file does not grow a
 * second element in anticipation of it.
 *
 * The played state is a genuinely different element in a genuinely different container, so
 * it is not that trade: nothing ever transitions a node from playable to played in place —
 * the card leaves the hand and the panel re-renders.
 *
 * ## No accent
 *
 * Card faces are SECONDARY: transparent fill, a hairline border, ordinary ink. 03-UI-SPEC
 * §Colour keeps the accent at exactly three uses and adds none here, on the same reasoning
 * the draft screen has no accent-filled pick button — playing a card is the action and the
 * faces are its target, so marking every target would mark everything.
 */

export interface CardFaceProps {
  value: number;
  /** `'playable'` renders a button; `'played'` renders a plain element in the played row. */
  state: 'playable' | 'played';
  onPlay?: (value: number) => void;
}

/**
 * The accessible name of a playable card — a verb and its object, per the copy contract.
 *
 * Composed here rather than inline in JSX because the tests assert it on exact equality,
 * and because 03-09's unplayable variant appends a reason to this same construction. Two
 * places building the name would be two places for `Play 3` to become `play 3`.
 */
function playLabel(value: number): string {
  return `Play ${value}`;
}

export function CardFace({ value, state, onPlay }: CardFaceProps) {
  if (state === 'played') {
    return (
      <span class="card-face card-face--played" data-value={value}>
        {value}
      </span>
    );
  }

  return (
    <button
      type="button"
      class="card-face card-face--playable"
      data-value={value}
      aria-label={playLabel(value)}
      onClick={() => onPlay?.(value)}
    >
      {value}
    </button>
  );
}
