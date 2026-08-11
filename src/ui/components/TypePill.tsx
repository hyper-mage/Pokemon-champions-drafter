import { typeDisplay } from '../type-codes';

import './TypePill.css';

/**
 * One Pokemon type, as a pill.
 *
 * A `<span>`, not a button. On a pool card the pill carries no interaction of its own —
 * the whole card is the click target, and a nested button inside a button is invalid
 * markup that browsers resolve by dropping one of them. The filter toolbar in a later
 * plan renders its own pressable control and reuses only the fill and ink.
 *
 * The hue is never the only signal (DRFT-05, UI-SPEC §Colour is never the only signal):
 * the code or the full type name is always inside the pill as real text. Five of the
 * eighteen fills sit below 3:1 against the card surface, which is sound precisely
 * because the pill is a text label and its TEXT clears 4.5:1 — the ratio table in
 * `tokens.css` records every measurement.
 *
 * The two custom properties are the only thing the inline `style` binds, and their
 * values come from the closed 18-entry map rather than from roster data. A type string
 * with no entry renders nothing at all, so nothing from the snapshot ever reaches a CSS
 * declaration.
 */

export interface TypePillProps {
  type: string;
  form: 'code' | 'name';
}

export function TypePill({ type, form }: TypePillProps) {
  const display = typeDisplay(type);
  if (display === null) return null;

  // When the code is shown the visible text is an abbreviation, so the accessible name
  // has to carry the full type. When the full name is shown it already is the accessible
  // name, and an aria-label repeating it would be noise.
  const label = form === 'code' ? display.name : undefined;

  return (
    <span
      class="type-pill"
      style={{ '--pill-fill': display.fill, '--pill-ink': display.ink }}
      aria-label={label}
    >
      {form === 'code' ? display.code : display.name}
    </span>
  );
}
