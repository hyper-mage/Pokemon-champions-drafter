import type { Density } from '../../adapters/view-prefs';
import { hasActiveFilters, NO_FILTERS, type PoolFilters } from '../../core/search';

import './FilterBar.css';

/**
 * The pool filter bar — DRFT-08's search field and DRFT-09's type and Mega controls.
 *
 * Controlled. It owns no filter state: `PoolGrid` holds it, because the ban grid on the
 * config screen reuses `PoolGrid` whole and lifting the state would give `ConfigScreen` a
 * duplicate copy of it and a duplicate call to the predicates — the second call site
 * 02-UI-SPEC forbids by name.
 *
 * ## Why this is not `TypeaheadField`
 *
 * 02-07 built a `role="combobox"` over a `role="listbox"` for ban entry, and reusing it
 * here was considered and rejected. A combobox exists to resolve free text down to ONE
 * record and emit it. The pool search emits a QUERY: it narrows a grid that is already on
 * screen, has no result list of its own, and must leave the host's text in the field
 * while they look at what survived. Wiring a listbox to a control whose results are the
 * cells directly below it would announce every match twice and give the host two places
 * to look.
 *
 * The two controls share `matchesName` — which is the part that could drift — and
 * nothing else.
 *
 * ## No matching logic lives here
 *
 * This component neither normalizes a query nor tests a candidate. Normalization happens
 * in `compileFilters` and matching in `matchesFilters`, both in `src/core/search.ts`,
 * where `npm run check:pure` can defend them. A predicate in a `.tsx` file is a predicate
 * outside the purity gate.
 */

export interface FilterBarProps {
  value: PoolFilters;
  onChange: (next: PoolFilters) => void;
  /**
   * Chooses the type pill's label form: full names at `full`, three-letter codes
   * otherwise, so the filter and the thing it filters speak the same language (D-29).
   */
  density: Density;
}

/*
 * `density` is declared above and deliberately not destructured yet: the only thing that
 * reads it is the type toolbar's label form, which arrives in the next commit. Declaring
 * it now keeps the contract in one place; destructuring it now would not compile, because
 * `noUnusedLocals` refuses a binding whose only consumer is the next commit. Same shape
 * 02-07 recorded for `toggleBan`.
 */
export function FilterBar({ value, onChange }: FilterBarProps) {
  return (
    <div class="filter-bar">
      {/*
        A fixed literal id rather than one derived per instance, and the reasoning is
        02-07's for the density control's fixed radio-group name: two `PoolGrid`s are
        never mounted at once, because the ban grid is on the config screen and the pool
        is on the draft screen.

        The forward note 02-07 did not need: if two ever WERE mounted together, this id,
        the Mega control's `name` and 02-07's density control `name` all become derived
        from one shared prefix in a single change — three ids, one edit, not three edits
        discovered one bug report at a time.
      */}
      <label class="visually-hidden" for="pool-search">
        Search the pool by name
      </label>
      <input
        class="filter-bar__search"
        type="search"
        id="pool-search"
        placeholder="Name"
        value={value.query}
        // `input`, not `change`. D-32 says the pool narrows live, and `change` on a
        // search input does not fire until blur.
        onInput={(event) => onChange({ ...value, query: event.currentTarget.value })}
      />

      {/*
        Absent rather than disabled when nothing is active. A control that clears nothing
        is a control that teaches the host their clicks do not matter.
      */}
      {hasActiveFilters(value) && (
        <button
          type="button"
          class="filter-bar__clear"
          onClick={() => onChange(NO_FILTERS)}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
