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
 * ## One vnode shape across playable and unplayable, deliberately
 *
 * D-21's UNPLAYABLE state — `aria-disabled`, struck through, a reason in the accessible
 * name — lives on THIS button, not beside it. `SplitPanes` records what the alternative
 * costs: Preact cannot reuse a DOM node across a vnode type, so a component that swaps its
 * shape between states unmounts the subtree, and `document.activeElement` falls to `<body>`
 * on whichever control the host was standing on. That is the regression 02-11 fixed. So the
 * inert card is an attribute change on one `<button>` rather than a second branch, and a
 * value that becomes playable again keeps the node, the focus and the tab stop it had.
 *
 * The played state is a genuinely different element in a genuinely different container, so
 * it is not that trade: nothing ever transitions a node from playable to played in place —
 * the card leaves the hand and the panel re-renders.
 *
 * ## Inert, not disabled — and the ARIA is SHED rather than set to `false`
 *
 * The unplayable card stays FOCUSABLE. A `disabled` attribute would remove it from the tab
 * order entirely, and a host tabbing through their hand would find cards silently missing
 * with no way to learn why — the reason is in the accessible name, which is only reachable
 * if the control can be reached.
 *
 * WR-04 is the other half, and it is a Phase 2 lesson rather than a precaution: a reused
 * button must SHED its inert ARIA when the condition lifts. `aria-disabled="false"` is not
 * the same thing as no `aria-disabled` at all to every assistive technology, so the
 * attribute is spread in conditionally and is genuinely ABSENT in the playable state. That
 * is also why it is not written as a ternary into `undefined` — the object either carries
 * the key or does not, which is one fewer thing to get subtly wrong later.
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
  /**
   * `'playable'` and `'unplayable'` both render the same button; `'played'` renders a plain
   * element in the played row.
   */
  state: 'playable' | 'played' | 'unplayable';
  onPlay?: (value: number) => void;
}

/**
 * The accessible name of a playable card — a verb and its object, per the copy contract.
 *
 * Composed here rather than inline in JSX because the tests assert it on exact equality,
 * and because the unplayable variant below appends a reason to this same construction. Two
 * places building the name would be two places for `Play 3` to become `play 3`.
 */
function playLabel(value: number): string {
  return `Play ${value}`;
}

/**
 * The accessible name of an unplayable card — 03-UI-SPEC §8, verbatim.
 *
 * The REASON is in the name rather than only in the line beneath the hand, because a host
 * arriving on this control by keyboard hears the name and nothing else. An em dash, not a
 * hyphen, and it is asserted on exact equality.
 */
export function unplayableLabel(value: number): string {
  return `${playLabel(value)} — this would leave a later player with no legal card`;
}

export function CardFace({ value, state, onPlay }: CardFaceProps) {
  if (state === 'played') {
    return (
      <span class="card-face card-face--played" data-value={value}>
        {value}
      </span>
    );
  }

  const inert = state === 'unplayable';

  /*
    Present or absent, never `'false'` — WR-04. Spread rather than assigned so that the
    playable render has no such prop at all, which is what makes Preact remove the
    attribute outright when a value becomes playable again.
  */
  const inertProps = inert ? { 'aria-disabled': 'true' as const } : {};

  /*
    Two classes, applied as a pair, because 03-UI-SPEC §Colour requires that a signal never
    be carried by one channel alone: `--dimmed` is the opacity and `--struck` is the
    line-through, and dimming alone is the ordinary disabled convention that would read as
    "not yet your turn" rather than "this specific card would strand someone".

    `--playable` is deliberately NOT applied to an inert card: it carries the pointer
    cursor and the hover transition, and both would promise an action that does not happen.
  */
  const classes = inert
    ? 'card-face card-face--dimmed card-face--struck'
    : 'card-face card-face--playable';

  return (
    <button
      type="button"
      class={classes}
      data-value={value}
      aria-label={inert ? unplayableLabel(value) : playLabel(value)}
      {...inertProps}
      onClick={() => {
        // The handler returns early so the attribute does not lie — `FilterBar` sets the
        // same precedent. An `aria-disabled` control that still fires is worse than one
        // that was never marked.
        if (inert) return;
        onPlay?.(value);
      }}
    >
      {value}
    </button>
  );
}
