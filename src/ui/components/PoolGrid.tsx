import { useState } from 'preact/hooks';

import type { SpriteMeta } from '../../adapters/roster-source';
import { loadViewPrefs, saveViewPrefs, type Density } from '../../adapters/view-prefs';
import type { RosterEntry } from '../../core/roster/types';

import { announce } from './LiveRegion';
import { MonCard } from './MonCard';
import { SegmentedControl, type SegmentedOption } from './SegmentedControl';

import './PoolGrid.css';

/**
 * The pool surface.
 *
 * D-06: this is the real component Phase 2 extends with search (DRFT-08), type and
 * Mega filters (DRFT-09) and the density toggle (DRFT-06) — not scaffolding to be
 * replaced. Those all narrow or restyle `entries`, which is why the count beneath the
 * heading is derived from what is actually rendered rather than from the snapshot
 * total: once a filter exists, `{n} available` must follow the filter.
 *
 * Ships without virtualization, deliberately. 235 cells is unremarkable and CLAUDE.md
 * rejects virtualization libraries by name at this scale. If profiling ever shows the
 * pool render exceeding 16ms, the one sanctioned escape hatch is exactly
 * `content-visibility: auto; contain-intrinsic-size: var(--cell-min) var(--cell-h);`
 * on the cell class in MonCard.css. Nothing else — and see MonCard's own doc block for
 * why it conflicts with the cell's min-height.
 *
 * ## Where the density lives
 *
 * On this component's state, seeded from browser storage, and on the pane root as a
 * `data-density` attribute. It is never in the tournament document (D-20): how big the
 * sprites are is a fact about a screen, not about a draft, and it must not travel through
 * a JSON export or a future sync layer.
 *
 * The attribute sits on the pool root rather than on the shell, and that placement is
 * the enforcement of D-24 ("density affects the pool only"). The board pane is not a
 * descendant of this element, so it cannot inherit the redeclared tokens — a density that
 * reached the board would have to be written into a second selector to get there.
 */
export interface PoolGridProps {
  entries: readonly RosterEntry[];
  spriteMeta: SpriteMeta;
  onPick: (entry: RosterEntry) => void;
}

/**
 * The three levels, in increasing order of detail.
 *
 * The visible label is also what the live region announces, so the two cannot drift into
 * saying different words for the same click.
 */
const DENSITY_OPTIONS: readonly SegmentedOption<Density>[] = [
  { value: 'minimal', label: 'Minimal' },
  { value: 'standard', label: 'Standard' },
  { value: 'full', label: 'Full' },
];

function densityLabel(density: Density): string {
  return DENSITY_OPTIONS.find((option) => option.value === density)?.label ?? density;
}

export function PoolGrid({ entries, spriteMeta, onPick }: PoolGridProps) {
  // Read synchronously on the first render, in a state initializer rather than an
  // effect. An effect runs after the first paint, so the host would watch the pool draw
  // itself at standard density and then jump to their actual choice on every reload.
  // Same reasoning as the storage canary in app.tsx, and the same shape.
  const [density, setDensity] = useState<Density>(() => loadViewPrefs().density);

  function handleDensityChange(next: Density): void {
    setDensity(next);

    // Re-read before writing so this never clobbers the pane preference stored beside
    // it. `loadViewPrefs` cannot throw and cannot return null, so there is nothing to
    // guard here.
    saveViewPrefs({ ...loadViewPrefs(), density: next });

    announce(`Display density: ${densityLabel(next)}.`);
  }

  return (
    <section class="pool" data-density={density} aria-labelledby="pool-heading">
      <header class="pool__header">
        <h2 class="pool__title" id="pool-heading">
          Pool
        </h2>
        <p class="pool__count">{entries.length} available</p>

        <SegmentedControl
          legend="Display density"
          name="pool-density"
          options={DENSITY_OPTIONS}
          value={density}
          onChange={handleDensityChange}
        />
      </header>

      <div class="pool__grid">
        {entries.map((entry) => (
          <MonCard
            key={entry.id}
            entry={entry}
            spriteMeta={spriteMeta}
            density={density}
            onPick={onPick}
          />
        ))}
      </div>
    </section>
  );
}
