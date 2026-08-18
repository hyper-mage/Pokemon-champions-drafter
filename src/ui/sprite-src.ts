/**
 * sprite-src.ts — the one place that turns a roster row into an image URL.
 *
 * Extracted from MonCard the moment a second component needed it. A sprite URL rule
 * that lives in two components is a rule that will disagree with itself.
 *
 * THE TRAP, stated here so it cannot be re-introduced by someone simplifying the
 * lookup: `entry.spriteId` is a derived SLUG (`abomasnow`), not a filename. The
 * committed files are named by PokeAPI numeric id (`460.png`). Plan 01-04 kept the two
 * id spaces decoupled deliberately, so an upstream PokeAPI id change cannot rewrite the
 * roster checksum — which means `sprites/${entry.spriteId}.png` resolves for ZERO of
 * the 235 draftable entries, not for "most" of them, and it fails with no build error
 * anywhere. It is verified 404 on the deployed site. `sprite-meta.json`'s `byRosterId`
 * map is the single source of truth, and `tests/ui/sprite-resolution.test.ts` checks
 * every committed row against the files actually on disk.
 *
 * The same map holds every Mega forme id as well as every draftable row, so a forme
 * resolves its own art through exactly this lookup and needs no second code path.
 *
 * Every URL is prefixed with `import.meta.env.BASE_URL`. A path that merely starts with
 * `/` resolves to the domain root: it works perfectly on localhost and 404s on the
 * deployed project sub-path.
 */

import type { JSX } from 'preact';

import type { SpriteMeta } from '../adapters/roster-source';

/**
 * The structural minimum a sprite lookup reads.
 *
 * A `RosterEntry` satisfies it and so does a `MegaForme`. `spriteMissing` is OPTIONAL
 * because a forme carries no such field, and the optionality is what makes `undefined` mean
 * "the build did not flag this row" rather than a type error at every forme call site.
 * Note what is NOT here: `spriteId`. Nothing resolves a URL from it — see the trap above.
 */
export interface SpriteSubject {
  id: string;
  spriteMissing?: boolean;
}

const SPRITE_DIRECTORY = 'sprites/';

/** The single committed generic fallback (D-04), authored at the native sprite size. */
export const PLACEHOLDER_FILE = '_placeholder.png';

/**
 * Sprite files are named by PokeAPI numeric id. Testing the resolved filename against
 * this shape means the only thing that can ever be interpolated into a sprite URL is a
 * run of digits, so no roster-supplied string reaches the network (T-01-27).
 */
const SPRITE_FILE_PATTERN = /^[0-9]+\.png$/;

/**
 * Pick the sprite filename for a roster row.
 *
 * Falls back to the placeholder when the build already knows there is no art
 * (`spriteMissing`), when the row is absent from the map, or when the mapped filename
 * is not well formed — so a request the build knows would 404 is never fired (D-05).
 *
 * Exported for the test that walks every committed row against the real files.
 */
export function resolveSpriteFile(entry: SpriteSubject, spriteMeta: SpriteMeta): string {
  if (entry.spriteMissing === true) return PLACEHOLDER_FILE;

  const reference = spriteMeta.byRosterId[entry.id];
  if (reference === undefined) return PLACEHOLDER_FILE;
  if (!SPRITE_FILE_PATTERN.test(reference.file)) return PLACEHOLDER_FILE;

  return reference.file;
}

function spriteUrl(file: string): string {
  return `${import.meta.env.BASE_URL}${SPRITE_DIRECTORY}${file}`;
}

/** The `src` for a roster row's art, base path included. */
export function spriteSrc(entry: SpriteSubject, spriteMeta: SpriteMeta): string {
  return spriteUrl(resolveSpriteFile(entry, spriteMeta));
}

/** The `src` for the committed placeholder. */
export function placeholderSrc(): string {
  return spriteUrl(PLACEHOLDER_FILE);
}

/**
 * Shared `<img>` error recovery for every surface that renders sprite art.
 *
 * Second line of defence only. The build-time `spriteMissing` flag already keeps a
 * known-artless row from requesting anything, so this fires on a genuinely unexpected
 * miss — a truncated cache entry, a half-finished deploy — and swaps in the placeholder
 * rather than leaving the browser's broken-image glyph on screen (T-01-24).
 */
export function handleSpriteError(event: JSX.TargetedEvent<HTMLImageElement, Event>): void {
  const image = event.currentTarget;
  const fallback = placeholderSrc();
  // Compare the attribute, not the resolved `.src` property, and bail if the
  // placeholder is what failed — otherwise a missing placeholder loops forever.
  if (image.getAttribute('src') === fallback) return;
  image.setAttribute('src', fallback);
}
