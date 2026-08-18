import type { Density } from '../../adapters/view-prefs';
import type { SpriteMeta } from '../../adapters/roster-source';
import type { MegaForme, RosterEntry } from '../../core/roster/types';
import { handleSpriteError, spriteSrc } from '../sprite-src';

import { typeDisplay } from '../type-codes';

import { StatBlock } from './StatBlock';
import { TypePill } from './TypePill';

import './MonCard.css';

/**
 * One pool cell: sprite, name, and — from `standard` upward — typing and base stats.
 *
 * The sprite URL rule lives in `src/ui/sprite-src.ts` and nowhere else — see that file
 * for why the obvious construction from `entry.spriteId` resolves for zero entries.
 *
 * ## Density is content, not just scale (DRFT-05, DRFT-06, D-25)
 *
 * The levels are cumulative: each renders everything the level below it renders plus its
 * own additions. `minimal` is sprite and name; `standard` adds a row of three-letter type
 * pills and the stat total; `full` swaps the pills to full type names and opens the six
 * base stats.
 *
 * Scaling alone could not have delivered `full`, which is why Phase 1's four-token
 * density contract had to be rewritten rather than extended: six 14px numbers inside a
 * 112px cell are unreadable at any sprite size. The type scale itself is now invariant
 * across densities, so no level can shrink text below 14px (DRFT-14).
 *
 * ## No `content-visibility` here, and it is not an oversight
 *
 * Phase 1 shipped 235 cells measured, and the live draft pool is 48–96. The escape hatch
 * would also fight the `min-height` this file now depends on: a skipped cell is measured
 * at its intrinsic size while a rendered one at `full` is taller, which produces
 * scrollbar jitter on exactly the density that needs the most scrolling. `PoolGrid`'s
 * doc block records the one sanctioned form if profiling ever demands it.
 */

/**
 * The two shapes a pool cell, a chip or a combobox option can be.
 *
 * Expressed as a TYPE PARAMETER constrained to the union rather than as the bare union on
 * each prop, and that is not decoration. A bare union would force every EXISTING caller —
 * the draft pool's `handlePick`, the species banlist's `toggleBan` — to widen its own
 * handler to something it can never actually receive, which is a weaker type at four call
 * sites in exchange for nothing. With the parameter, a caller handing in roster entries
 * keeps a `RosterEntry` handler and a caller handing in formes gets a `MegaForme` one.
 * `SegmentedControl` already establishes the generic-component shape in this codebase.
 */
export type PoolSubject = RosterEntry | MegaForme;

export interface MonCardProps<T extends PoolSubject> {
  /**
   * A draftable row OR a single Mega forme.
   *
   * A WIDENING, not a second mode: `MegaForme` carries `id`, `name`, `types` and
   * `baseStats` exactly as `RosterEntry` does, which is every field this cell reads. Nothing
   * below asks which of the two it was handed, and a forme's own art, typing and stats are
   * what render — `Charizard-Mega-X` is Fire/Dragon where Charizard is Fire/Flying, and a
   * cell that merged the two formes would have to hide one of them (03-UI-SPEC).
   */
  entry: T;
  /** The measured sprite inventory; the only correct source of a sprite filename. */
  spriteMeta: SpriteMeta;
  /** Decides both the token scale and how much of the entry is rendered. */
  density: Density;
  onPick: (entry: T) => void;
  /**
   * `null` outside ban mode: the cell carries no pressed state and no struck name.
   *
   * Three values rather than two, because a boolean could not tell "not banned" from "not a
   * ban surface" — and a draft-pool cell that reported itself unpressed would be claiming to
   * be a toggle it is not.
   */
  banned: boolean | null;
}

/*
 * Notes on the <img> below, kept out of the markup so the CI text checks cannot match
 * their own documentation:
 *
 *   alt is empty on purpose. The sprite is decorative here: the species name is visible
 *   right beside it and is also stated in the button's aria-label, so alt text would make
 *   every cell announce twice.
 *
 *   That justification survives the density work unchanged, and it is worth stating
 *   because the parallel case does NOT: MonCard renders its name at EVERY level,
 *   including minimal, so the adjacent text is always there. MonChip is the opposite —
 *   D-21 removes its name in split view, so its alt has to carry the name instead. The
 *   two components look alike and their alt rules are opposites for a real reason.
 *
 *   It survives ban mode unchanged for exactly the same reason: the name is rendered in
 *   every mode as well as at every density, so the adjacent text never goes away and the
 *   empty value stays correct. Nothing about being banned changes what the sprite is.
 *
 *   width and height are explicit and come from the measurement rather than a typed
 *   literal, so they cannot drift from --sprite-lg. Without them the grid takes 235
 *   simultaneous layout shifts as the art arrives. They stay the INTRINSIC size at every
 *   density; CSS does the scaling.
 *
 *   The image is deliberately NOT lazily loaded. D-16 precaches every sprite on
 *   service-worker install, so deferring the request buys nothing and costs pop-in on
 *   scroll. The attribute that would do it is left off entirely.
 */
/*
 * The cell's accessible name, stated rather than computed.
 *
 * A button with no explicit name takes one by flattening its whole subtree to text, which
 * at `full` density would announce every cell as "Venusaur Grass Poison Total 525 HP 80
 * Atk 82 ..." — 235 of those in the pool. The stats stay in the DOM and stay reachable;
 * they are simply no longer part of the NAME.
 *
 * It is deliberately identical at all three densities. A name that changed when the host
 * flipped the density control would make the same cell a different control to a screen
 * reader, and the types are worth announcing even at `minimal` where no pill renders.
 *
 * Built from `typeDisplay` rather than the raw roster string for the same reason
 * `TypePill` does it: the 18-entry map is closed, and a type with no entry contributes
 * nothing instead of leaking a snapshot value into the name.
 */
function accessibleName(entry: PoolSubject): string {
  const types = entry.types
    .map((type) => typeDisplay(type)?.name)
    .filter((name): name is string => name !== undefined);

  return types.length > 0 ? `${entry.name}, ${types.join(' ')}` : entry.name;
}

export function MonCard<T extends PoolSubject>({
  entry,
  spriteMeta,
  density,
  onPick,
  banned,
}: MonCardProps<T>) {
  const showDetail = density !== 'minimal';

  // The array-join conditional-class pattern, not template-literal concatenation: a
  // template leaves a trailing space when the condition is false, and a class list with a
  // stray token in it is a selector that silently stops matching.
  const cardClass = ['mon-card', banned === true ? 'mon-card--banned' : '']
    .filter((token) => token !== '')
    .join(' ');
  const nameClass = ['mon-card__name', banned === true ? 'mon-card__name--banned' : '']
    .filter((token) => token !== '')
    .join(' ');

  return (
    <button
      type="button"
      class={cardClass}
      aria-label={accessibleName(entry)}
      aria-pressed={banned === null ? undefined : banned}
      onClick={() => onPick(entry)}
    >
      <img
        class="mon-card__sprite"
        src={spriteSrc(entry, spriteMeta)}
        alt=""
        width={spriteMeta.nativeWidth}
        height={spriteMeta.nativeHeight}
        onError={handleSpriteError}
      />
      <span class={nameClass} title={entry.name}>
        {entry.name}
      </span>

      {showDetail && (
        <span class="mon-card__types">
          {entry.types.map((type) => (
            <TypePill key={type} type={type} form={density === 'full' ? 'name' : 'code'} />
          ))}
        </span>
      )}

      {showDetail && <StatBlock stats={entry.baseStats} showAll={density === 'full'} />}
    </button>
  );
}
