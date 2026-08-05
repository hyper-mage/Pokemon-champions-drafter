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
 * The sprite renders at --sprite-sm, an exact 2:1 integer downscale of the measured
 * 96px source, so it stays crisp. The width/height attributes carry the intrinsic size
 * rather than the rendered one — that is what they are for, and it is what lets the
 * browser reserve the right box before the art arrives while CSS does the sizing.
 */

export interface MonChipProps {
  entry: RosterEntry;
  spriteMeta: SpriteMeta;
}

export function MonChip({ entry, spriteMeta }: MonChipProps) {
  return (
    <span class="mon-chip">
      <img
        class="mon-chip__sprite"
        src={spriteSrc(entry, spriteMeta)}
        alt=""
        width={spriteMeta.nativeWidth}
        height={spriteMeta.nativeHeight}
        onError={handleSpriteError}
      />
      <span class="mon-chip__name" title={entry.name}>
        {entry.name}
      </span>
    </span>
  );
}
