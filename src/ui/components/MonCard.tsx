import type { JSX } from 'preact';

import type { SpriteMeta } from '../../adapters/roster-source';
import type { RosterEntry } from '../../core/roster/types';

import './MonCard.css';

/**
 * One pool cell: sprite above name, the whole cell a real button.
 *
 * Phase 2 adds typing and base stats here (DRFT-05). The props are shaped so that is
 * an addition rather than a rewrite.
 */

const SPRITE_DIRECTORY = 'sprites/';

/** The single committed generic fallback (D-04), authored at the native sprite size. */
const PLACEHOLDER_FILE = '_placeholder.png';

/**
 * Sprite files are named by PokeAPI numeric id — `460.png`, `10025.png`. Testing the
 * resolved filename against this shape means the only thing that can ever be
 * interpolated into a sprite URL is a run of digits, so no roster-supplied string
 * reaches the network (T-01-27).
 */
const SPRITE_FILE_PATTERN = /^[0-9]+\.png$/;

/**
 * Pick the sprite filename for a roster row.
 *
 * THE TRAP, stated so it cannot be re-introduced: `entry.spriteId` is a derived slug
 * (`abomasnow`), not a filename. `sprites/${entry.spriteId}.png` resolves for **zero**
 * of the 235 draftable entries. Plan 01-04 kept the slug deliberately, to decouple the
 * roster checksum from PokeAPI's id space, and put the real filename in
 * `sprite-meta.json` under `byRosterId`. That map is the single source of truth.
 *
 * Falls back to the placeholder when the build already knows there is no art
 * (`spriteMissing`), when the row is absent from the map, or when the mapped filename
 * is not well formed — so a request the build knows would 404 is never fired (D-05).
 *
 * Exported for `tests/ui/sprite-resolution.test.ts`, which checks every committed row
 * against the files actually on disk.
 */
export function resolveSpriteFile(entry: RosterEntry, spriteMeta: SpriteMeta): string {
  if (entry.spriteMissing) return PLACEHOLDER_FILE;

  const reference = spriteMeta.byRosterId[entry.id];
  if (reference === undefined) return PLACEHOLDER_FILE;
  if (!SPRITE_FILE_PATTERN.test(reference.file)) return PLACEHOLDER_FILE;

  return reference.file;
}

function spriteUrl(file: string): string {
  return `${import.meta.env.BASE_URL}${SPRITE_DIRECTORY}${file}`;
}

/**
 * Second line of defence only. `spriteMissing` already keeps a known-artless row from
 * requesting anything, so this fires on a genuinely unexpected miss — a truncated
 * cache entry, a half-finished deploy — and swaps in the placeholder rather than
 * leaving the browser's broken-image glyph in the grid (T-01-24).
 */
function handleSpriteError(event: JSX.TargetedEvent<HTMLImageElement, Event>): void {
  const image = event.currentTarget;
  const fallback = spriteUrl(PLACEHOLDER_FILE);
  // Compare the attribute, not the resolved `.src` property, and bail if the
  // placeholder is what failed — otherwise a missing placeholder loops forever.
  if (image.getAttribute('src') === fallback) return;
  image.setAttribute('src', fallback);
}

export interface MonCardProps {
  entry: RosterEntry;
  /** The measured sprite inventory. See `resolveSpriteFile` for why this is required. */
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
        src={spriteUrl(resolveSpriteFile(entry, spriteMeta))}
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
