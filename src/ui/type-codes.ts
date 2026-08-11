/**
 * The eighteen Pokemon types, as display data.
 *
 * ## Why this is an explicit map and not a computation
 *
 * All eighteen codes below happen to be the first three characters of the name,
 * uppercased, and all eighteen are distinct. Deriving them from the name at runtime
 * would therefore produce byte-identical output today, and it is still wrong.
 *
 * The near misses are the argument: `GRA`/`GRO` (Grass, Ground), `DRA`/`DAR` (Dragon,
 * Dark) and `FIR`/`FIG` (Fire, Fighting) are each one letter from colliding. A
 * nineteenth type — Champions is a live game and its regulations rotate roughly every
 * ten weeks — could collide with an existing code, and a derived abbreviation would emit
 * the duplicate silently, on a pill whose whole job is to be the non-colour signal for
 * the type. The map makes that a code review, and the 18-distinct-codes test in
 * `tests/ui/type-codes.test.ts` makes it a build failure.
 *
 * CLAUDE.md's rule against deriving structure from a name string points the same way,
 * even though it was written about species names. A type name is a closed set and a
 * species name is not, so the rule is weaker here — but it is not absent, and the
 * upside of computing the codes is zero.
 *
 * ## Keys
 *
 * Keyed by the exact strings that appear in `RosterEntry.types` — capitalized, e.g.
 * `'Water'`, straight from Showdown's pokedex. The test asserts the key set deep-equals
 * the distinct type set of the committed roster snapshot, so a roster that grows a
 * nineteenth type fails the build here rather than rendering a blank pill.
 */

export interface TypeDisplay {
  /** Three-letter uppercase code, shown at minimal and standard density. */
  code: string;
  /** Full type name, shown at full density and used as the pill's accessible name. */
  name: string;
  /** CSS custom property holding this type's fill, e.g. 'var(--type-water)'. */
  fill: string;
  /** 'var(--type-ink-dark)' or 'var(--type-ink-light)' per the measured ratio table. */
  ink: string;
}

const INK_DARK = 'var(--type-ink-dark)';
const INK_LIGHT = 'var(--type-ink-light)';

/**
 * Every legal type, written out.
 *
 * `ink` is whichever of the two inks clears 4.5:1 against that hue — thirteen dark,
 * five light. The measured ratios live beside the hues in `src/ui/tokens.css`; they are
 * not duplicated here, because two copies of a number are two numbers that can disagree.
 */
export const TYPE_CODES: Readonly<Record<string, TypeDisplay>> = {
  Bug: { code: 'BUG', name: 'Bug', fill: 'var(--type-bug)', ink: INK_DARK },
  Dark: { code: 'DAR', name: 'Dark', fill: 'var(--type-dark)', ink: INK_LIGHT },
  Dragon: { code: 'DRA', name: 'Dragon', fill: 'var(--type-dragon)', ink: INK_LIGHT },
  Electric: { code: 'ELE', name: 'Electric', fill: 'var(--type-electric)', ink: INK_DARK },
  Fairy: { code: 'FAI', name: 'Fairy', fill: 'var(--type-fairy)', ink: INK_DARK },
  Fighting: { code: 'FIG', name: 'Fighting', fill: 'var(--type-fighting)', ink: INK_LIGHT },
  Fire: { code: 'FIR', name: 'Fire', fill: 'var(--type-fire)', ink: INK_DARK },
  Flying: { code: 'FLY', name: 'Flying', fill: 'var(--type-flying)', ink: INK_DARK },
  Ghost: { code: 'GHO', name: 'Ghost', fill: 'var(--type-ghost)', ink: INK_LIGHT },
  Grass: { code: 'GRA', name: 'Grass', fill: 'var(--type-grass)', ink: INK_DARK },
  Ground: { code: 'GRO', name: 'Ground', fill: 'var(--type-ground)', ink: INK_DARK },
  Ice: { code: 'ICE', name: 'Ice', fill: 'var(--type-ice)', ink: INK_DARK },
  Normal: { code: 'NOR', name: 'Normal', fill: 'var(--type-normal)', ink: INK_DARK },
  Poison: { code: 'POI', name: 'Poison', fill: 'var(--type-poison)', ink: INK_LIGHT },
  Psychic: { code: 'PSY', name: 'Psychic', fill: 'var(--type-psychic)', ink: INK_DARK },
  Rock: { code: 'ROC', name: 'Rock', fill: 'var(--type-rock)', ink: INK_DARK },
  Steel: { code: 'STE', name: 'Steel', fill: 'var(--type-steel)', ink: INK_DARK },
  Water: { code: 'WAT', name: 'Water', fill: 'var(--type-water)', ink: INK_DARK },
};

/**
 * The display data for `type`, or null when there is none.
 *
 * A caller that gets null renders NO pill, rather than a pill with a blank fill and the
 * raw string inside it. An unknown type means the roster and this map have diverged, and
 * a missing pill is a visible absence a reviewer notices; an uncoloured one reads as a
 * styling bug and gets ignored.
 */
export function typeDisplay(type: string): TypeDisplay | null {
  return Object.prototype.hasOwnProperty.call(TYPE_CODES, type) ? TYPE_CODES[type]! : null;
}
