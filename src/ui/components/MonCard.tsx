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
  /**
   * Why this cell may not be activated at all, or `null` when it may — BAN-03, 04-UI-SPEC §6.
   *
   * ONE object carrying the reason rather than a boolean beside a string. The pair
   * `(true, null)` would compile and would render an inert cell with nothing to explain it,
   * which is the exact defect `PaneAvailability` was introduced to make unrepresentable
   * (WR-07) — and here the reason is the whole point, because it is the only thing that
   * tells a host `banned by the host` from `already banned by Ada`.
   *
   * OPTIONAL, defaulting to `null` once below. `PoolGrid.megaInertReason` records the reason
   * a default is applied inside the component rather than left to the caller: an omitted
   * prop arriving as `undefined` must never be able to reach the branch that reads a reason
   * off it.
   *
   * DISTINCT FROM {@link banned}, and the two must not be merged into one value. `banned` is
   * a pressed toggle the host may press again; this is a cell nobody may press at all. They
   * happen to coincide on the snake ban stage, where every public ban is also closed, and
   * they do not coincide on the blind entry surface, where a player's own selection is
   * pressed while another player's ban is closed.
   */
  inert?: { reason: string } | null;
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

/**
 * An inert cell's accessible name — the name it already had, plus why it is closed.
 *
 * COMPOSED onto the shipped name rather than replacing it. 04-UI-SPEC §6's third row gives
 * the live cell `{name}` (unchanged), which fixes what `{name}` means in the two rows above
 * it: whatever this cell already announced. A suffixed form that dropped the typing would
 * make a closed cell announce strictly less than a live one, at the moment a host is trying
 * to work out what happened to it.
 *
 * The separator is part of THIS STRING rather than an `aria-hidden` sibling span, and that is
 * the rule rather than a shortcut. `SplitPanes.tsx`'s `POOL_EXPAND_REASON` block states both
 * halves: a separator between two sibling elements is markup, and a separator inside one
 * control's own accessible name is part of the string. There is no sibling here, so there is
 * nothing for anything to be hidden from.
 */
function inertAccessibleName(entry: PoolSubject, reason: string): string {
  return `${accessibleName(entry)} — ${reason}`;
}

export function MonCard<T extends PoolSubject>({
  entry,
  spriteMeta,
  density,
  onPick,
  banned,
  inert = null,
}: MonCardProps<T>) {
  const showDetail = density !== 'minimal';

  // The array-join conditional-class pattern, not template-literal concatenation: a
  // template leaves a trailing space when the condition is false, and a class list with a
  // stray token in it is a selector that silently stops matching.
  const cardClass = [
    'mon-card',
    banned === true ? 'mon-card--banned' : '',
    inert !== null ? 'mon-card--inert' : '',
  ]
    .filter((token) => token !== '')
    .join(' ');
  const nameClass = [
    'mon-card__name',
    banned === true ? 'mon-card__name--banned' : '',
    inert !== null ? 'mon-card__name--inert' : '',
  ]
    .filter((token) => token !== '')
    .join(' ');

  /*
    Present or absent, never the negative string — WR-04. Spread rather than assigned so the
    live render carries no such prop at all, which is what makes Preact remove the attribute
    outright the moment the condition lifts rather than rewrite it. `CardFace` records the
    same construction and the same reason, and an undo returning a species to the pool is
    exactly the render this shape exists for.

    `aria-disabled` and deliberately never native `disabled`: a natively disabled button is
    not focusable, so the reason above — which lives in the accessible name — would be
    unreachable by keyboard, and the reason is the whole point of marking the cell at all.
  */
  const inertProps = inert === null ? {} : { 'aria-disabled': 'true' as const };

  return (
    <button
      type="button"
      class={cardClass}
      aria-label={inert === null ? accessibleName(entry) : inertAccessibleName(entry, inert.reason)}
      aria-pressed={banned === null ? undefined : banned}
      {...inertProps}
      onClick={() => {
        // The early return IS the refusal, so the attribute does not lie — `CardFace` and
        // `SplitPanes` both set the precedent. An `aria-disabled` control that still fires
        // is worse than one that was never marked.
        if (inert !== null) return;
        onPick(entry);
      }}
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
