import type { Density } from '../../adapters/view-prefs';
import {
  hasActiveFilters,
  NO_FILTERS,
  type MegaFilterMode,
  type PoolFilters,
} from '../../core/search';
import { TYPE_CODES, typeDisplay, type TypeDisplay } from '../type-codes';
import { useRovingTabindex } from '../use-roving-tabindex';

import { SegmentedControl, type SegmentedOption } from './SegmentedControl';

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

/**
 * D-34's three states, in the copywriting contract's order and wording.
 *
 * A three-way control rather than a checkbox, and Phase 3's round restriction composes
 * with it as a SEPARATE constraint rather than as a fourth option here. The reason is
 * written down in `matchesFilters`' doc block in `src/core/search.ts`, so the next person
 * who wants a fourth radio finds the argument before they find the array.
 */
const MEGA_OPTIONS: readonly SegmentedOption<MegaFilterMode>[] = [
  { value: 'all', label: 'All' },
  { value: 'mega', label: 'Mega-capable' },
  { value: 'nonMega', label: 'Non-Mega' },
];

/*
 * The eighteen types come from the closed map, iterated at module scope.
 *
 * Not a literal list written out here, and not derived from roster data at render time.
 * 02-03 built `TYPE_CODES` as the closed enumeration and its own test pins its key set
 * equal to the roster's distinct type set — so iterating it is both correct today and the
 * single place that changes the day a regulation adds a nineteenth type.
 *
 * THE DISPLAY IS RESOLVED HERE, NOT IN THE MAP BELOW, and that is what makes `count` and
 * the rendered buttons the same array by construction. A type with no map entry renders no
 * button — matching `TypePill`'s stated posture that a missing control is a visible absence
 * somebody notices, where an uncoloured one reads as a styling bug and gets ignored — and
 * filtering it out at this point means the hook is never told about a button that is not
 * there. Told otherwise, an arrow key moves the tab stop onto a position no element
 * occupies and the whole toolbar leaves the tab order.
 */
interface FilterType {
  type: string;
  display: TypeDisplay;
}

const FILTER_TYPES: readonly FilterType[] = Object.keys(TYPE_CODES)
  .map((type) => ({ type, display: typeDisplay(type) }))
  .filter((row): row is FilterType => row.display !== null);

export function FilterBar({ value, onChange, density }: FilterBarProps) {
  // One row that wraps visually, so no column count is injected: the horizontal rules are
  // the ones that match how the host reads it, and the hook's default collapses Down onto
  // Right and Up onto Left exactly.
  const rove = useRovingTabindex<HTMLDivElement>({ count: FILTER_TYPES.length });

  function toggleType(type: string): void {
    // Exact string equality against the values in `RosterEntry.types`, never a normalized
    // or sliced form — and a fresh array every time, because filter state is replaced
    // wholesale rather than edited in place.
    const next = value.types.includes(type)
      ? value.types.filter((selected) => selected !== type)
      : [...value.types, type];

    onChange({ ...value, types: next });
  }

  // Fewer than two selected types makes AND and OR identical, so the toggle has nothing
  // to say. See the block above the control itself for which inert treatment it takes and
  // why the two candidates were both rejected.
  const matchAllInert = value.types.length < 2;

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
        The type toolbar. Its buttons are NOT `TypePill` elements, and that is a decision
        rather than an oversight: `TypePill` is a `<span>` whose stylesheet sets
        `height: var(--pill-h)` at 24px, while 02-UI-SPEC §Target size requires a filter
        type pill to be 44 x 44 and says in as many words that this is why filter pills do
        not use `--pill-h`. The two cannot both hold for one element.

        So the shared thing is the DATA rather than the box. Hue, ink, three-letter code
        and full name all come from `typeDisplay()`, which is the only place a drift
        between the card pill and the filter pill could actually happen.
      */}
      <div
        class="filter-bar__types"
        role="toolbar"
        aria-label="Filter by type"
        ref={rove.containerRef}
        onKeyDown={rove.onKeyDown}
      >
        {FILTER_TYPES.map(({ type, display }, index) => {
          const showName = density === 'full';

          return (
            <button
              key={type}
              type="button"
              class="type-filter"
              style={{ '--pill-fill': display.fill, '--pill-ink': display.ink }}
              // One expression, not two branches of markup: a pressed state written twice
              // is a pressed state that can disagree with itself.
              aria-pressed={value.types.includes(type)}
              // When the code is shown the visible text is an abbreviation, so the
              // accessible name has to carry the full type. When the name is shown it
              // already IS the accessible name and a label repeating it would be noise.
              aria-label={showName ? undefined : display.name}
              tabIndex={rove.tabIndexAt(index)}
              onFocus={() => rove.onItemFocus(index)}
              onClick={() => toggleType(type)}
            >
              {showName ? display.name : display.code}
            </button>
          );
        })}
      </div>

      {/*
        `Match all selected types` — D-33's AND toggle, OR being the default.

        It takes the ARIA-only inert treatment and NOT the native attribute, and a reviewer
        must not "fix" it in either direction:

        - The native attribute removes it from the tab order, so a keyboard host would find
          a control that appears and disappears — the exact thing 02-UI-SPEC §8 calls the
          worse outcome on a shared screen. §8 requires it "always rendered … predictably
          inert".
        - It also does NOT take 02-07's ban-mode treatment, which is the native attribute
          PLUS the ARIA one. That case's reason is static and lives inside the option's own
          accessible name; this control's reason is structural and already on screen, since
          the toolbar directly above it shows how many pills are pressed.
        - And it does not take `FeasibilityBar`'s `aria-describedby` divergence, because
          there is no `role="status"` element here to point at and the copywriting contract
          gives no reason string to put in one.

        The early return in the handler is what keeps the attribute honest. Without it the
        attribute would claim the control is inert while a click still changed state.
      */}
      <span class="filter-bar__match-all">
        <input
          type="checkbox"
          id="pool-match-all"
          checked={value.matchAll}
          aria-disabled={matchAllInert ? 'true' : undefined}
          onChange={(event) => {
            if (matchAllInert) {
              // Put the box back where the state says it is, so the rendered checked
              // state never disagrees with the behaviour in effect.
              event.currentTarget.checked = value.matchAll;
              return;
            }
            onChange({ ...value, matchAll: event.currentTarget.checked });
          }}
        />
        <label
          class={['filter-bar__match-all-label', matchAllInert ? 'filter-bar__match-all-label--inert' : '']
            .filter((token) => token !== '')
            .join(' ')}
          for="pool-match-all"
        >
          Match all selected types
        </label>
      </span>

      {/*
        The sixth declared instance of 02-03's `SegmentedControl`, and the `name` is fixed
        for the same reason `pool-search` above is: two `PoolGrid`s are never mounted at
        once. Same forward note applies — three ids, one change.
      */}
      <SegmentedControl
        legend="Mega capability"
        name="pool-mega-filter"
        options={MEGA_OPTIONS}
        value={value.mega}
        onChange={(mega) => onChange({ ...value, mega })}
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
