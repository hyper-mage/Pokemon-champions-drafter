import type { SpriteMeta } from '../../adapters/roster-source';
import type { RosterEntry } from '../../core/roster/types';
import { handleSpriteError, spriteSrc } from '../sprite-src';

import './MonCard.css';

/**
 * One pool cell: sprite above name, the whole cell a real button.
 *
 * Phase 2 adds typing and base stats here (DRFT-05). The props are shaped so that is
 * an addition rather than a rewrite.
 *
 * The sprite URL rule lives in `src/ui/sprite-src.ts` and nowhere else — see that file
 * for why the obvious construction from `entry.spriteId` resolves for zero entries.
 */

export interface MonCardProps {
  entry: RosterEntry;
  /** The measured sprite inventory; the only correct source of a sprite filename. */
  spriteMeta: SpriteMeta;
  onPick: (entry: RosterEntry) => void;
}

/*
 * Notes on the <img> below, kept out of the markup so the CI text checks cannot match
 * their own documentation:
 *
 *   alt is empty on purpose. The species name sits right beside the sprite and is the
 *   button's accessible name, so alt text here would make every cell announce twice.
 *
 *   width and height are explicit and come from the measurement rather than a typed
 *   literal, so they cannot drift from --sprite-lg. Without them the grid takes 235
 *   simultaneous layout shifts as the art arrives.
 *
 *   The image is deliberately NOT lazily loaded. D-16 precaches every sprite on
 *   service-worker install, so deferring the request buys nothing and costs pop-in on
 *   scroll. The attribute that would do it is left off entirely.
 */
export function MonCard({ entry, spriteMeta, onPick }: MonCardProps) {
  return (
    <button type="button" class="mon-card" onClick={() => onPick(entry)}>
      <img
        class="mon-card__sprite"
        src={spriteSrc(entry, spriteMeta)}
        alt=""
        width={spriteMeta.nativeWidth}
        height={spriteMeta.nativeHeight}
        onError={handleSpriteError}
      />
      <span class="mon-card__name" title={entry.name}>
        {entry.name}
      </span>
    </button>
  );
}
