import type { SpriteMeta } from '../../adapters/roster-source';
import type { RosterEntry } from '../../core/roster/types';
import { handleSpriteError, spriteSrc } from '../sprite-src';

import './MonChip.css';

/**
 * A drafted species, as it appears in a board cell.
 *
 * Not interactive, in this phase or any planned one. Undo is a single top-bar button
 * (plan 01-07), not a control on every cell — twelve tiny retract buttons on a shared
 * screen is a misclick surface, and the one thing D-08's no-confirm pick cannot afford
 * is a second easy way to lose a pick by accident.
 *
 * Still not interactive at any pane state. `split` and `board-full` change what the chip
 * SHOWS, never what it does — expanding the board is a reading affordance, not a route to
 * a per-cell control, and the misclick argument above is untouched by either state.
 *
 * The sprite renders at --sprite-sm, an exact 2:1 integer downscale of the measured
 * 96px source, so it stays crisp. The width/height attributes carry the intrinsic size
 * rather than the rendered one — that is what they are for, and it is what lets the
 * browser reserve the right box before the art arrives while CSS does the sizing.
 */

export interface MonChipProps {
  entry: RosterEntry;
  spriteMeta: SpriteMeta;
  /**
   * False in `split` (D-21). The component derives `nameText` from this once and uses that
   * single value for both the visible name and the sprite's alternative text, so the two
   * cannot desynchronise. Never expose the alternative text as a second prop.
   */
  showName: boolean;
}

export function MonChip({ entry, spriteMeta, showName }: MonChipProps) {
  // ONE derivation, read twice below. An empty alternative text is correct only because
  // adjacent visible text supplies the accessible name — and D-21 removes that text in
  // split view, which is exactly when the sprite has to carry the name itself. Written as
  // two independent props a caller could set one without the other and leave a board cell
  // with no accessible name at all: 02-UI-SPEC calls this "the single most breakable
  // contract in this phase" and 02-RESEARCH files it as Pitfall 5. One local is the whole
  // mitigation, and it is why the two branches share one element rather than two.
  const nameText = showName ? entry.name : null;

  return (
    <span class="mon-chip">
      <img
        class="mon-chip__sprite"
        src={spriteSrc(entry, spriteMeta)}
        alt={nameText === null ? entry.name : ''}
        width={spriteMeta.nativeWidth}
        height={spriteMeta.nativeHeight}
        onError={handleSpriteError}
      />
      {/*
        `title` stays on the span and is not moved onto the sprite. When the span is absent
        the sprite's alternative text IS the whole accessible name, and a title would have
        nothing to hang on but the thing already announcing it.
      */}
      {nameText !== null && (
        <span class="mon-chip__name" title={entry.name}>
          {nameText}
        </span>
      )}
    </span>
  );
}
