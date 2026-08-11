/**
 * search.ts — DRFT-08 / DRFT-09. The pool predicates, all of them, in one module.
 *
 * Two surfaces filter the same roster: the pool filter bar during the draft, and the ban
 * typeahead during config. They are different components with different markup and they
 * must never be different matchers. One predicate, one module, one test suite — not a
 * second matcher that can drift, because the failure that drift produces is a name the host
 * can find in the ban field and cannot find in the pool, which reads as the tool being
 * broken rather than as two functions disagreeing.
 *
 * ## Normalization is Showdown's `toID`, and it is deliberate
 *
 * Lowercase, then drop everything that is not a letter or a digit. That is the same rule
 * that produced `RosterEntry.id`, which `roster/types.ts:34` calls "THE identity key". It
 * is what makes `Mr. Rime`, `mr rime` and `MR RIME` one query, and what lets a host find
 * `Tauros-Paldea-Aqua` by typing `paldea aqua`.
 *
 * The match is a SUBSTRING match, not a prefix one. A prefix matcher cannot find
 * `Rotom-Wash` from `wash` or `Tauros-Paldea-Aqua` from `aqua`, and those are exactly the
 * two things a host types when they are looking for the Water one.
 *
 * ## Never take a name apart
 *
 * No function here separates a species name on a hyphen, a period or any other character.
 * `Kommo-o` is a base species whose name contains a hyphen; `Mr. Rime` contains a period
 * and a space. Structure comes from fields — `forme`, `baseSpeciesId`, `megaCapable` — and
 * never from the shape of a display string.
 *
 * Pure, like everything under `src/core`.
 */

import type { RosterEntry } from './roster/types';

/** The three states of the Mega filter control (D-34). Default is `all`. */
export type MegaFilterMode =
  /** No constraint. Every entry passes. */
  | 'all'
  /** Only entries carrying at least one legal Mega forme. */
  | 'mega'
  /** Only entries carrying none. */
  | 'nonMega';

/**
 * Showdown's `toID`: lowercase, then strip everything outside `[a-z0-9]`.
 *
 * Applied to the QUERY once per keystroke at the call site, never once per entry. Both
 * consumers do this: the pool filter normalizes its search box value once and passes the
 * result to `matchesName` for every candidate, and the ban typeahead does the same. Passing
 * a raw query here would still work and would do the same work a few hundred times over.
 */
export function toSearchKey(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Does this entry's display name contain the already-normalized query?
 *
 * An empty query matches everything: no query is not a filter that excludes the roster, it
 * is the absence of a filter.
 *
 * The predicate runs against `entry.name`, NOT `entry.id`, even though the two normalize
 * identically for every entry in the committed snapshot. That equality is an optimization,
 * not a correctness dependency — matching on `id` would silently become matching on
 * something other than what the grid renders the moment a regulation introduced a name
 * whose `id` was derived differently. `tests/core/roster/fixtures.test.ts` asserts the
 * equality directly, so a rotation that breaks it fails a test instead of quietly making a
 * species unsearchable.
 */
export function matchesName(entry: RosterEntry, normalizedQuery: string): boolean {
  if (normalizedQuery === '') return true;
  return toSearchKey(entry.name).includes(normalizedQuery);
}

/**
 * Does this entry satisfy the type selection?
 *
 * Empty selection is no constraint (D-33). `matchAll` is the visible "match both" toggle:
 * off, any selected type is enough; on, the entry must carry all of them.
 *
 * Both loops are bounded at two: no entry in the committed roster carries more than two
 * types. That is measured and pinned by the roster tripwire, not assumed — which is why
 * this is a plain scan and not an index.
 *
 * Type names are compared as the roster spells them (`Water`, not `water`), because the
 * selection comes from the roster's own type list rather than from anything the host types.
 */
export function matchesTypes(
  entry: RosterEntry,
  selected: readonly string[],
  matchAll: boolean,
): boolean {
  if (selected.length === 0) return true;

  return matchAll
    ? selected.every((type) => entry.types.includes(type))
    : selected.some((type) => entry.types.includes(type));
}

/**
 * Does this entry satisfy the Mega filter?
 *
 * Phase 3 composes a Mega ROUND's own restriction as a SEPARATE predicate rather than as a
 * fourth member of `MegaFilterMode`. That is what lets DRFT-09's "composing with the round's
 * own restriction" arrive without reshaping this control: the round's constraint is a fact
 * about the schedule and this one is a preference the host is currently expressing, and
 * folding them into one union would make the host able to switch off a rule.
 */
export function matchesMega(entry: RosterEntry, mode: MegaFilterMode): boolean {
  switch (mode) {
    case 'all':
      return true;
    case 'mega':
      return entry.megaCapable;
    case 'nonMega':
      return !entry.megaCapable;
  }
}
