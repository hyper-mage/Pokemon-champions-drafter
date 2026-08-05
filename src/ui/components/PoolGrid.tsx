import type { SpriteMeta } from '../../adapters/roster-source';
import type { RosterEntry } from '../../core/roster/types';

import { MonCard } from './MonCard';

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
 * on the cell class in MonCard.css. Nothing else.
 */
export interface PoolGridProps {
  entries: readonly RosterEntry[];
  spriteMeta: SpriteMeta;
  onPick: (entry: RosterEntry) => void;
}

export function PoolGrid({ entries, spriteMeta, onPick }: PoolGridProps) {
  return (
    <section class="pool" aria-labelledby="pool-heading">
      <header class="pool__header">
        <h2 class="pool__title" id="pool-heading">
          Pool
        </h2>
        <p class="pool__count">{entries.length} available</p>
      </header>

      <div class="pool__grid">
        {entries.map((entry) => (
          <MonCard key={entry.id} entry={entry} spriteMeta={spriteMeta} onPick={onPick} />
        ))}
      </div>
    </section>
  );
}
