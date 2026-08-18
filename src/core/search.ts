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

/**
 * The structural minimum these predicates read.
 *
 * A `RosterEntry` satisfies it and so does a `MegaForme`, which is what lets the Mega-forme
 * ban grid reuse the pool's search box and its eighteen type filters rather than growing a
 * second matcher — the thing this module's opening paragraph exists to prevent. It is a
 * WIDENING, not a branch: no function below asks which of the two it was handed.
 */
export interface FilterableEntry {
  /** The display string the host reads and searches against. */
  name: string;
  types: readonly string[];
  /** Absent on a Mega forme. `matchesMega` reads absent as not Mega-capable. */
  megaCapable?: boolean;
}

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
export function matchesName(entry: FilterableEntry, normalizedQuery: string): boolean {
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
  entry: FilterableEntry,
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
 *
 * An ABSENT `megaCapable` reads as not Mega-capable, which is the right answer for the one
 * subject that omits it: a Mega forme is not a species that CAN Mega, it IS the Mega. The
 * Mega-forme ban grid renders this control inert for exactly that reason, so the branch is
 * a type-level completeness matter rather than a state the host can reach.
 */
export function matchesMega(entry: FilterableEntry, mode: MegaFilterMode): boolean {
  switch (mode) {
    case 'all':
      return true;
    case 'mega':
      return entry.megaCapable === true;
    case 'nonMega':
      return entry.megaCapable !== true;
  }
}

/**
 * Everything the host has said about which Pokemon they want to see, in one value.
 *
 * Ephemeral VIEW state. It is never persisted, never appended to the log, never part of
 * `TournamentConfig`, and never exported (D-35). Which Pokemon a player is looking at
 * right now is a fact about a glance, not about a draft — and a filter that travelled
 * through a JSON file would arrive at the next table as somebody else's leftover.
 */
export interface PoolFilters {
  /** Raw text exactly as typed. Normalized exactly once, by `compileFilters`. */
  query: string;
  /** Selected type names, spelled as they appear in `RosterEntry.types`. */
  types: readonly string[];
  /** True = every selected type must be present (D-33's AND). False = any (the default). */
  matchAll: boolean;
  mega: MegaFilterMode;
}

/** `PoolFilters` with the query normalized. Built once per change, not once per entry. */
export interface CompiledPoolFilters {
  readonly key: string;
  readonly types: readonly string[];
  readonly matchAll: boolean;
  readonly mega: MegaFilterMode;
}

/**
 * The neutral value: no query, no types, no Mega constraint.
 *
 * Never mutated, and nothing here or in the UI mutates it. Filter state is replaced
 * wholesale — every control calls `onChange` with a fresh object rather than editing the
 * one it was handed — so this constant is safe to hand out as an initial value and safe
 * to hand back as a reset.
 */
export const NO_FILTERS: PoolFilters = {
  query: '',
  types: [],
  matchAll: false,
  mega: 'all',
};

/**
 * Normalize the query once, and carry the other three fields through unchanged.
 *
 * The split between this and `matchesFilters` exists for one reason: `matchesName`'s own
 * doc comment instructs its caller to normalize once per keystroke rather than once per
 * candidate, and this is where that instruction is obeyed. A `matchesFilters` that took
 * raw text would do the same work a few hundred times over on every character typed.
 */
export function compileFilters(filters: PoolFilters): CompiledPoolFilters {
  return {
    key: toSearchKey(filters.query),
    types: filters.types,
    matchAll: filters.matchAll,
    mega: filters.mega,
  };
}

/**
 * The one composed predicate: name AND types AND Mega.
 *
 * It holds no matching logic of its own. Three calls to the three predicates above, ANDed
 * — which is what keeps the pool filter and the ban typeahead the same matcher rather
 * than two that agree today.
 *
 * ## The Phase 3 seam, written down so it is inherited rather than redesigned
 *
 * A round's own pool restriction joins HERE. It adds one field to `PoolFilters` and
 * `CompiledPoolFilters` and one clause to this function, and it changes no UI file —
 * because a round restriction is a rule the compiled schedule imposes, not a preference
 * the host is expressing, so it gets no widget in `FilterBar`. A host must not be able to
 * switch a rule off from a toolbar.
 *
 * `MegaFilterMode` does NOT gain a fourth member to carry it. That decision is 02-01's
 * and is recorded in `matchesMega`'s own doc block above; folding a schedule's constraint
 * into the host's control is exactly the collapse it rejects.
 */
export function matchesFilters(entry: FilterableEntry, compiled: CompiledPoolFilters): boolean {
  return (
    matchesName(entry, compiled.key) &&
    matchesTypes(entry, compiled.types, compiled.matchAll) &&
    matchesMega(entry, compiled.mega)
  );
}

/**
 * Is any control away from its neutral value?
 *
 * Drives two things: whether `Clear filters` is on screen at all, and whether committing
 * a pick clears anything (D-35).
 *
 * `matchAll` is deliberately absent from the disjunction. With fewer than two selected
 * types the AND and the OR behaviours are identical, so a `matchAll` that is true on its
 * own is unobservable — and calling it "active" would put a `Clear filters` button on
 * screen that visibly clears nothing. Its own test pins the omission so nobody restores
 * it as a fix.
 */
export function hasActiveFilters(filters: PoolFilters): boolean {
  return filters.query !== '' || filters.types.length > 0 || filters.mega !== 'all';
}
